-- ═══════════════════════════════════════════════════════════════════
-- SPL — jejak kejadian bersama (tahap S2a: perangkat STAF)
-- Tempel seluruh berkas ini ke SQL Editor project Supabase venue, lalu Run.
-- Aman dijalankan ulang (idempoten).
--
-- Prinsip: server TIDAK menjalankan aturan bisnis. Tugasnya hanya memberi
-- URUTAN (seq) dan JAM SERVER (at_ms), menolak bentuk kejadian yang tidak
-- masuk akal, dan menyiarkan ke semua perangkat. Aturan meja, uang, stok,
-- dan shift tetap di engine.ts dan diputar sama persis di tiap perangkat.
--
-- BATAS TAHAP INI (jujur): pelaku (by_staff) masih dikirim perangkat.
-- Karena itu anon key project ini hanya boleh dipasang di build untuk
-- PERANGKAT STAF venue. HP pelanggan belum disambungkan; itu tahap S2b
-- (PIN diperiksa server + tampilan publik tanpa data pribadi).
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Dunia data yang sedang berlaku ─────────────────────────────────
-- Reset data = dunia baru (genesis_at baru). Perangkat mengikuti server.
create table if not exists public.venue_world (
  one_row    boolean primary key default true check (one_row),
  genesis_at bigint  not null,
  seed       boolean not null default false,
  created_at timestamptz not null default now()
);
insert into public.venue_world (genesis_at, seed)
  values ((extract(epoch from now()) * 1000)::bigint, false)
  on conflict (one_row) do nothing;

-- ── Jejak kejadian: satu-satunya sumber kebenaran ──────────────────
create table if not exists public.venue_events (
  seq        bigint generated always as identity primary key,
  id         text   not null unique,      -- id dari perangkat: kirim ulang tidak dobel
  at_ms      bigint not null,             -- JAM SERVER (milidetik), tidak pernah mundur
  by_staff   text,                        -- null = sistem/pelanggan
  act        jsonb  not null,
  genesis_at bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists venue_events_world_seq_idx on public.venue_events (genesis_at, seq);

-- ── Titik simpan (dipakai mulai tahap berikutnya) ──────────────────
create table if not exists public.venue_snapshots (
  id         bigint generated always as identity primary key,
  genesis_at bigint not null,
  upto_seq   bigint not null,
  upto_id    text   not null,
  upto_at    bigint not null,
  state      jsonb  not null,
  created_at timestamptz not null default now()
);
create index if not exists venue_snapshots_latest_idx on public.venue_snapshots (genesis_at, upto_seq desc);

-- ── Pengaturan: rahasia tulis aplikasi (opsional) ──────────────────
-- Kalau diisi, hanya perangkat yang tahu rahasianya yang boleh menulis.
-- Dibiarkan NULL pada tahap S2a (semua perangkat staf memakai anon key yang sama).
create table if not exists public.venue_config (
  one_row      boolean primary key default true check (one_row),
  write_secret text,
  updated_at   timestamptz not null default now()
);
insert into public.venue_config (write_secret) values (null) on conflict (one_row) do nothing;

-- ═══ Satu-satunya jalan menulis jejak ══════════════════════════════
create or replace function public.append_event(
  p_id text,
  p_act jsonb,
  p_by text default null,
  p_secret text default null,
  p_genesis bigint default null
) returns public.venue_events
language plpgsql security definer set search_path = public as $$
declare
  v_row    public.venue_events;
  v_at     bigint;
  v_world  bigint;
  v_secret text;
begin
  -- Bentuk kejadian wajib masuk akal (gagal tertutup).
  if p_id is null or length(p_id) < 3 or length(p_id) > 128 then
    raise exception 'id kejadian tidak sah' using errcode = '22023';
  end if;
  if p_act is null or jsonb_typeof(p_act) <> 'object' or coalesce(p_act->>'t', '') = '' then
    raise exception 'bentuk aksi tidak sah' using errcode = '22023';
  end if;
  if pg_column_size(p_act) > 32768 then
    raise exception 'aksi terlalu besar' using errcode = '22023';
  end if;

  select write_secret into v_secret from public.venue_config where one_row;
  if v_secret is not null and (p_secret is null or p_secret <> v_secret) then
    raise exception 'rahasia tulis salah' using errcode = '42501';
  end if;

  select genesis_at into v_world from public.venue_world where one_row;
  if p_genesis is not null and p_genesis <> v_world then
    raise exception 'dunia data sudah berganti' using errcode = '22023';
  end if;

  select * into v_row from public.venue_events where id = p_id;
  if found then return v_row; end if;                 -- kirim ulang: kejadian yang sama

  -- Satu penulis pada satu waktu: jam server tidak pernah mundur atau kembar.
  perform pg_advisory_xact_lock(hashtext('spl:venue_events'));
  select greatest((extract(epoch from clock_timestamp()) * 1000)::bigint,
                  coalesce(max(at_ms), 0) + 1)
    into v_at
    from public.venue_events where genesis_at = v_world;

  insert into public.venue_events (id, at_ms, by_staff, act, genesis_at)
  values (p_id, v_at, p_by, p_act, v_world)
  returning * into v_row;
  return v_row;
exception when unique_violation then                  -- dua kiriman bersamaan
  select * into v_row from public.venue_events where id = p_id;
  return v_row;
end $$;

-- ═══ Kunci pintu (RLS) ═════════════════════════════════════════════
alter table public.venue_events    enable row level security;
alter table public.venue_snapshots enable row level security;
alter table public.venue_world     enable row level security;
alter table public.venue_config    enable row level security;

-- Hak dasar: perangkat boleh membaca, tidak boleh menulis langsung.
grant usage on schema public to anon, authenticated;
grant select on public.venue_events, public.venue_world, public.venue_snapshots to anon, authenticated;

-- Perangkat staf boleh MEMBACA jejak (dibutuhkan juga oleh Realtime)...
drop policy if exists baca_jejak on public.venue_events;
create policy baca_jejak on public.venue_events for select to anon, authenticated using (true);

drop policy if exists baca_dunia on public.venue_world;
create policy baca_dunia on public.venue_world for select to anon, authenticated using (true);

drop policy if exists baca_titik_simpan on public.venue_snapshots;
create policy baca_titik_simpan on public.venue_snapshots for select to anon, authenticated using (true);

-- ...tetapi TIDAK boleh menulis, mengubah, atau menghapus apa pun secara langsung.
-- Menulis hanya lewat append_event (security definer) yang hanya bisa menambah.
revoke insert, update, delete on public.venue_events    from anon, authenticated;
revoke insert, update, delete on public.venue_snapshots from anon, authenticated;
revoke all on public.venue_config from anon, authenticated;   -- rahasia tulis tidak bisa dibaca
revoke insert, update, delete on public.venue_world from anon, authenticated;

grant execute on function public.append_event(text, jsonb, text, text, bigint) to anon, authenticated;

-- Realtime: perangkat staf mendengar kejadian baru seketika.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'venue_events'
  ) then
    alter publication supabase_realtime add table public.venue_events;
  end if;
end $$;
