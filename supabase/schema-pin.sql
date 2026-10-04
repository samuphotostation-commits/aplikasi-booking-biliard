-- ═══════════════════════════════════════════════════════════════════
-- SPL — PIN diperiksa SERVER (tahap S2b-2)
--
-- Sesudah berkas ini dijalankan:
--   • Jejak venue (venue_events) TIDAK bisa dibaca dengan kunci publik.
--     Isinya nama, nomor HP, dan angka uang tamu — hanya perangkat staf
--     yang sudah memasukkan PIN benar yang boleh membacanya.
--   • Pelaku kejadian (by_staff) diambil dari SESI PIN, bukan dari isian
--     perangkat. Perangkat tidak bisa lagi mengaku jadi pemilik.
--   • HP pelanggan tetap bisa: membaca ringkasan publik, memesan lewat QR
--     (bayar di kasir), menahan slot, dan mengecek status kodenya sendiri.
--   • Perangkat staf tetap tahu ada kejadian baru seketika lewat tabel
--     venue_pings yang isinya cuma nomor urut — tanpa data apa pun.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── PIN staf (disimpan sebagai hash, tidak bisa dibaca balik) ──────
create table if not exists public.staff_pins (
  staff_id   text primary key,
  nama       text not null,
  peran      text not null check (peran in ('superadmin', 'karyawan')),
  pin_hash   text not null,
  aktif      boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ── Sesi staf: hasil PIN benar, berlaku 12 jam ─────────────────────
create table if not exists public.staff_sessions (
  token      text primary key,
  staff_id   text not null references public.staff_pins(staff_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen  timestamptz not null default now()
);
create index if not exists staff_sessions_exp_idx on public.staff_sessions (expires_at);

-- ── Percobaan PIN salah: rem untuk tebak-tebakan ───────────────────
create table if not exists public.pin_attempts (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  berhasil boolean not null
);
create index if not exists pin_attempts_at_idx on public.pin_attempts (at);

-- ── Denyut kejadian: hanya nomor urut, tanpa isi ───────────────────
create table if not exists public.venue_pings (
  seq        bigint primary key,
  at_ms      bigint not null,
  created_at timestamptz not null default now()
);

create or replace function public.tulis_ping() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.venue_pings (seq, at_ms) values (new.seq, new.at_ms)
    on conflict (seq) do nothing;
  delete from public.venue_pings where created_at < now() - interval '1 day';
  return new;
end $$;

drop trigger if exists venue_events_ping on public.venue_events;
create trigger venue_events_ping after insert on public.venue_events
  for each row execute function public.tulis_ping();

-- ═══ Masuk dengan PIN ══════════════════════════════════════════════
create or replace function public.staff_login(p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.staff_pins; v_token text; v_gagal int;
begin
  if p_pin is null or length(p_pin) < 4 or length(p_pin) > 12 then
    return jsonb_build_object('ok', false, 'alasan', 'PIN tidak sah');
  end if;

  -- Rem: 20 percobaan gagal dalam 10 menit → tunggu.
  select count(*) into v_gagal from public.pin_attempts
   where not berhasil and at > now() - interval '10 minutes';
  if v_gagal >= 20 then
    return jsonb_build_object('ok', false, 'alasan', 'Terlalu banyak PIN salah. Coba lagi beberapa menit lagi.');
  end if;

  select * into v_row from public.staff_pins
   where aktif and pin_hash = crypt(p_pin, pin_hash) limit 1;

  if not found then
    insert into public.pin_attempts (berhasil) values (false);
    return jsonb_build_object('ok', false, 'alasan', 'PIN salah');
  end if;

  insert into public.pin_attempts (berhasil) values (true);
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.staff_sessions (token, staff_id, expires_at)
  values (v_token, v_row.staff_id, now() + interval '12 hours');
  delete from public.staff_sessions where expires_at < now();

  return jsonb_build_object(
    'ok', true, 'token', v_token, 'staffId', v_row.staff_id,
    'nama', v_row.nama, 'peran', v_row.peran,
    'berlakuSampai', (extract(epoch from (now() + interval '12 hours')) * 1000)::bigint
  );
end $$;

/** Siapa pemilik token ini? null kalau kedaluwarsa/tidak dikenal. */
create or replace function public.staff_of(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if p_token is null or length(p_token) <> 64 then return null; end if;
  update public.staff_sessions set last_seen = now()
   where token = p_token and expires_at > now()
   returning staff_id into v;
  return v;
end $$;

-- ═══ Baca jejak (hanya dengan sesi PIN sah) ════════════════════════
create or replace function public.fetch_events(p_token text, p_since bigint default 0, p_limit int default 1000)
returns setof public.venue_events
language plpgsql security definer set search_path = public as $$
declare v_staff text; v_world bigint;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then
    raise exception 'sesi tidak sah' using errcode = '42501';
  end if;
  select genesis_at into v_world from public.venue_world where one_row;
  return query
    select * from public.venue_events
     where genesis_at = v_world and seq > coalesce(p_since, 0)
     order by seq
     limit least(coalesce(p_limit, 1000), 2000);
end $$;

-- ═══ Kirim aksi staf (pelaku dari sesi, bukan dari perangkat) ══════
create or replace function public.staff_action(p_token text, p_id text, p_act jsonb)
returns public.venue_events
language plpgsql security definer set search_path = public as $$
declare v_row public.venue_events; v_at bigint; v_world bigint; v_staff text;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then
    raise exception 'sesi tidak sah' using errcode = '42501';
  end if;
  if p_id is null or length(p_id) < 3 or length(p_id) > 128 then
    raise exception 'id kejadian tidak sah' using errcode = '22023';
  end if;
  if p_act is null or jsonb_typeof(p_act) <> 'object' or coalesce(p_act->>'t', '') = '' then
    raise exception 'bentuk aksi tidak sah' using errcode = '22023';
  end if;
  if pg_column_size(p_act) > 32768 then
    raise exception 'aksi terlalu besar' using errcode = '22023';
  end if;

  select * into v_row from public.venue_events where id = p_id;
  if found then return v_row; end if;

  select genesis_at into v_world from public.venue_world where one_row;
  perform pg_advisory_xact_lock(hashtext('spl:venue_events'));
  select greatest((extract(epoch from clock_timestamp()) * 1000)::bigint, coalesce(max(at_ms), 0) + 1)
    into v_at from public.venue_events where genesis_at = v_world;

  insert into public.venue_events (id, at_ms, by_staff, act, genesis_at)
  values (p_id, v_at, v_staff, p_act, v_world)          -- pelaku dari SESI
  returning * into v_row;
  return v_row;
exception when unique_violation then
  select * into v_row from public.venue_events where id = p_id;
  return v_row;
end $$;

-- ═══ Kunci pintu ═══════════════════════════════════════════════════
alter table public.staff_pins     enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.pin_attempts   enable row level security;
alter table public.venue_pings    enable row level security;

-- Tidak ada satu pun policy untuk tabel PIN/sesi → tertutup rapat.
revoke all on public.staff_pins, public.staff_sessions, public.pin_attempts from anon, authenticated;

-- Denyut boleh dibaca semua perangkat: isinya hanya nomor urut.
drop policy if exists baca_denyut on public.venue_pings;
create policy baca_denyut on public.venue_pings for select to anon, authenticated using (true);
grant select on public.venue_pings to anon, authenticated;

-- JEJAK VENUE: tidak bisa dibaca kunci publik lagi.
drop policy if exists baca_jejak on public.venue_events;
revoke select on public.venue_events from anon, authenticated;

-- Pintu lama tanpa PIN ditutup; yang berlaku sekarang staff_action + guest_action.
-- Catatan: Postgres memberi EXECUTE ke PUBLIC secara bawaan, jadi `public`
-- harus ikut dicabut — mencabut dari anon/authenticated saja tidak menutup apa pun.
revoke execute on function public.append_event(text, jsonb, text, text, bigint) from public, anon, authenticated;
-- Pembantu internal: hanya dipakai dari dalam fungsi security definer.
revoke execute on function public.staff_of(text)   from public, anon, authenticated;
revoke execute on function public.staff_role(text) from public, anon, authenticated;
revoke execute on function public.tulis_ping()     from public, anon, authenticated;

grant execute on function public.staff_login(text)                      to anon, authenticated;
grant execute on function public.fetch_events(text, bigint, int)        to anon, authenticated;
grant execute on function public.staff_action(text, text, jsonb)        to anon, authenticated;

-- Realtime mendengarkan denyut, bukan jejak.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
              and schemaname = 'public' and tablename = 'venue_events') then
    alter publication supabase_realtime drop table public.venue_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                  and schemaname = 'public' and tablename = 'venue_pings') then
    alter publication supabase_realtime add table public.venue_pings;
  end if;
end $$;
