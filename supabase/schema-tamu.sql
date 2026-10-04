-- ═══════════════════════════════════════════════════════════════════
-- SPL — HP PELANGGAN (tahap S2b-1)
-- Tempel ke SQL Editor project spl-venue, lalu Run. Aman dijalankan ulang.
--
-- Aturan mainnya: HP pelanggan TIDAK BOLEH membaca jejak venue (di dalamnya
-- ada nama, nomor HP, dan angka uang tamu lain). Yang boleh dibaca hanya
-- RINGKASAN PUBLIK yang diterbitkan perangkat staf, dan yang boleh dikirim
-- hanya aksi pelanggan.
-- ═══════════════════════════════════════════════════════════════════

-- ── Ringkasan publik: satu baris, diterbitkan ulang perangkat staf ──
-- Isinya persis keluaran src/lib/publicView.ts: slot meja tanpa identitas,
-- tarif, harga menu, promo, daftar habis.
create table if not exists public.public_state (
  one_row    boolean primary key default true check (one_row),
  genesis_at bigint not null default 0,
  data       jsonb  not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.public_state (genesis_at, data) values (0, '{}'::jsonb)
  on conflict (one_row) do nothing;

-- ── Status per kode: hanya bisa dibuka oleh yang tahu kodenya ──────
create table if not exists public.public_status (
  code       text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.public_state  enable row level security;
alter table public.public_status enable row level security;

-- Ringkasan publik boleh dibaca siapa pun; status per kode TIDAK bisa
-- dipindai (tidak ada policy select) — hanya lewat fungsi di bawah.
drop policy if exists baca_ringkasan on public.public_state;
create policy baca_ringkasan on public.public_state for select to anon, authenticated using (true);

grant select on public.public_state to anon, authenticated;
revoke all on public.public_status from anon, authenticated;
revoke insert, update, delete on public.public_state from anon, authenticated;

-- ═══ Perangkat staf menerbitkan ringkasan ══════════════════════════
-- Hanya PERANGKAT STAF yang boleh menerbitkan ringkasan. Tanpa pagar ini,
-- siapa pun yang punya anon key (yang memang ikut di aplikasi tamu) bisa
-- menerbitkan ringkasan palsu — mis. membuat semua meja terlihat penuh.
-- Versi tanpa token sengaja DIBUANG supaya tidak ada pintu belakang yang tertinggal.
drop function if exists public.publish_public_state(jsonb, jsonb, bigint);
create or replace function public.publish_public_state(
  p_state jsonb,
  p_status jsonb default '[]'::jsonb,
  p_genesis bigint default null,
  p_token text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_world bigint; v_baris jsonb;
begin
  if coalesce(public.staff_of(p_token), '') = '' then
    raise exception 'hanya perangkat staf yang boleh menerbitkan ringkasan' using errcode = '42501';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'ringkasan tidak sah' using errcode = '22023';
  end if;
  if pg_column_size(p_state) > 524288 then
    raise exception 'ringkasan terlalu besar' using errcode = '22023';
  end if;

  select genesis_at into v_world from public.venue_world where one_row;
  if p_genesis is not null and p_genesis <> v_world then return; end if;   -- dunia sudah berganti

  update public.public_state
     set data = p_state, genesis_at = v_world, updated_at = now()
   where one_row;

  -- Status per kode: hanya yang dikirim yang diperbarui.
  if p_status is not null and jsonb_typeof(p_status) = 'array' then
    for v_baris in select * from jsonb_array_elements(p_status) loop
      if coalesce(v_baris->>'code', '') <> '' then
        insert into public.public_status (code, data, updated_at)
        values (v_baris->>'code', v_baris, now())
        on conflict (code) do update set data = excluded.data, updated_at = now();
      end if;
    end loop;
  end if;
end $$;

-- ═══ Status satu kode (hanya yang tahu kodenya) ════════════════════
create or replace function public.guest_status(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if p_code is null or length(p_code) < 4 or length(p_code) > 40 then return null; end if;
  select data into v from public.public_status where code = p_code;
  return v;   -- null kalau kodenya tidak ada: tidak membocorkan apa pun
end $$;

-- ═══ Aksi dari HP pelanggan ════════════════════════════════════════
-- Hanya empat jenis aksi tamu (tahan slot, batal tahan, pesan QR/takeaway,
-- reservasi meja resto). Aksi kasir/uang (tutup tab, void, shift, tarif,
-- konfirmasi pembayaran) TIDAK bisa lewat pintu ini.
-- Reservasi resto tidak memungut uang di muka, jadi aman dari pintu ini.
create or replace function public.guest_action(p_id text, p_act jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_row    public.venue_events;
  v_at     bigint;
  v_world  bigint;
  v_jenis  text;
  v_baru   int;
begin
  if p_id is null or length(p_id) < 6 or length(p_id) > 128 then
    raise exception 'id kejadian tidak sah' using errcode = '22023';
  end if;
  if p_act is null or jsonb_typeof(p_act) <> 'object' then
    raise exception 'bentuk aksi tidak sah' using errcode = '22023';
  end if;
  v_jenis := coalesce(p_act->>'t', '');
  if v_jenis not in ('hold', 'releaseHold', 'guestOrder', 'reserveResto') then
    raise exception 'aksi % tidak diizinkan dari HP pelanggan', v_jenis using errcode = '42501';
  end if;
  if pg_column_size(p_act) > 16384 then
    raise exception 'aksi terlalu besar' using errcode = '22023';
  end if;
  -- Pesanan dari HP tidak boleh mengaku sudah dibayar: pembayaran hanya dari kasir/webhook.
  if v_jenis = 'guestOrder' and coalesce((p_act->'order'->>'paidOnline')::numeric, 0) <> 0 then
    raise exception 'pembayaran online belum tersedia' using errcode = '42501';
  end if;
  if v_jenis = 'guestOrder' and coalesce(p_act->'order'->>'pay', '') <> 'kasir' then
    raise exception 'pesanan dari HP harus bayar di kasir' using errcode = '42501';
  end if;

  -- Pagar sederhana: maksimal 120 aksi pelanggan per menit untuk seluruh venue.
  select count(*) into v_baru from public.venue_events
   where by_staff is null and created_at > now() - interval '1 minute';
  if v_baru > 120 then
    raise exception 'terlalu banyak permintaan, coba sebentar lagi' using errcode = '53400';
  end if;

  select * into v_row from public.venue_events where id = p_id;
  if found then return v_row.seq; end if;                 -- kirim ulang: tidak dobel

  select genesis_at into v_world from public.venue_world where one_row;
  perform pg_advisory_xact_lock(hashtext('spl:venue_events'));
  select greatest((extract(epoch from clock_timestamp()) * 1000)::bigint,
                  coalesce(max(at_ms), 0) + 1)
    into v_at from public.venue_events where genesis_at = v_world;

  insert into public.venue_events (id, at_ms, by_staff, act, genesis_at)
  values (p_id, v_at, null, p_act, v_world)
  returning * into v_row;
  return v_row.seq;
exception when unique_violation then
  select seq into v_at from public.venue_events where id = p_id;
  return v_at;
end $$;

grant execute on function public.guest_action(text, jsonb)  to anon, authenticated;
grant execute on function public.guest_status(text)         to anon, authenticated;
grant execute on function public.publish_public_state(jsonb, jsonb, bigint, text) to anon, authenticated;
