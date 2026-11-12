-- ═══════════════════════════════════════════════════════════════════
-- SPL — JEMBATAN LAMPU MEJA KE ALAT ESP32
-- Tempel seluruh berkas ini ke SQL Editor project Supabase venue, lalu Run.
-- Aman dijalankan ulang (idempoten).
--
-- Yang dipecahkan berkas ini: aplikasi kasir sudah tahu lampu meja mana yang
-- harus menyala (mesin menghitungnya dari jejak kejadian — buka meja,
-- check-in, tutup tab, void, no-show, tombol lampu manual). Yang belum ada
-- adalah jalan dari pengetahuan itu ke relay di venue.
--
-- Jalannya dibuat SATU ARAH, dan itu disengaja:
--
--   kasir/HP  ──aksi──▶  venue_events  ──trigger──▶  Edge Function `terbit`
--                                                          │
--                                            publish_lampu_server()
--                                                          ▼
--                                                    lampu_state
--                                                          │
--                              ESP32 menarik tiap ±1 detik (lampu_sinkron)
--                                                          ▼
--                                                   relay → lampu
--
-- • ESP32 hanya BISA MEMBACA status lampu. Tidak ada jalan baginya untuk
--   menulis jejak venue, membaca nama/nomor HP tamu, atau melihat angka uang.
--   Satu-satunya fungsi yang boleh dipanggilnya adalah `lampu_sinkron`, dan
--   yang keluar dari sana hanya "T01=1".
-- • Statusnya DITERBITKAN SERVER, bukan perangkat kasir. Jadi lampu tetap
--   benar walau tidak ada tablet yang terbuka.
-- • ESP32 MENARIK, bukan ditembak. Alat di balik router venue tidak perlu
--   IP publik, port terbuka, atau satu jaringan dengan kasir.
-- • Kalau internet putus, lampu TETAP pada keadaan terakhir. Tidak ada
--   perintah "matikan semua" yang bisa lahir dari kegagalan jaringan.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Status lampu yang sedang berlaku ───────────────────────────────
-- Satu baris saja. `versi` naik HANYA kalau isinya benar-benar berubah,
-- supaya ESP32 bisa bertanya "masih versi 17?" dan dijawab satu baris
-- pendek — bukan daftar 44 meja tiap detik.
create table if not exists public.lampu_state (
  one_row    boolean primary key default true check (one_row),
  versi      bigint  not null default 0,
  data       jsonb   not null default '{}'::jsonb,
  genesis_at bigint,
  updated_at timestamptz not null default now()
);
insert into public.lampu_state (one_row) values (true) on conflict (one_row) do nothing;

-- ── Alat yang terpasang di venue (denyut nadi) ─────────────────────
-- Dipakai panel kasir untuk menampilkan "Relay online / terakhir terlihat
-- 11:42". Tanpa ini, alat yang mati diam-diam baru ketahuan saat ada tamu
-- protes lampunya tidak menyala.
create table if not exists public.lampu_alat (
  alat        text primary key,
  terakhir_ms bigint not null,
  ip          text,
  rssi        int,
  fw          text,
  nyala       int,                       -- berapa relay yang sedang ON di alat ini
  relay       int,                       -- berapa relay yang dipetakan di alat ini
  versi_lihat bigint,                    -- versi status yang terakhir dia terima
  created_at  timestamptz not null default now()
);

-- ── Kunci alat ─────────────────────────────────────────────────────
-- ESP32 tidak boleh memakai anon key saja: anon key ikut ter-build ke
-- halaman web dan bisa dibaca siapa pun. Kuncinya disimpan sebagai hash,
-- jadi bocornya isi database pun tidak memberi orang kunci alat.
create table if not exists public.lampu_kunci (
  one_row    boolean primary key default true check (one_row),
  token_hash text,
  updated_at timestamptz not null default now()
);
insert into public.lampu_kunci (one_row) values (true) on conflict (one_row) do nothing;

alter table public.lampu_state enable row level security;
alter table public.lampu_alat  enable row level security;
alter table public.lampu_kunci enable row level security;
revoke all on public.lampu_state from anon, authenticated;
revoke all on public.lampu_alat  from anon, authenticated;
revoke all on public.lampu_kunci from anon, authenticated;

-- ═══ Server menerbitkan status lampu ═══════════════════════════════
-- Dipanggil Edge Function `terbit` (service_role) tiap ada kejadian baru.
-- Perangkat kasir TIDAK boleh memanggilnya: status lampu adalah kesimpulan
-- mesin dari jejak, bukan pendapat satu tablet.
create or replace function public.publish_lampu_server(
  p_lampu jsonb,
  p_genesis bigint default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_lama jsonb; v_versi bigint;
begin
  if p_lampu is null or jsonb_typeof(p_lampu) <> 'object' then
    raise exception 'status lampu tidak sah' using errcode = '22023';
  end if;
  if pg_column_size(p_lampu) > 65536 then
    raise exception 'status lampu terlalu besar' using errcode = '22023';
  end if;

  select data, versi into v_lama, v_versi from public.lampu_state where one_row;

  -- Versi naik hanya kalau isinya berubah. Cron `terbit` jalan tiap menit;
  -- tanpa penjaga ini versinya naik 1.440 kali sehari tanpa satu lampu pun
  -- berganti, dan tiap alat menarik ulang daftar penuh tiap menit sia-sia.
  if v_lama is not distinct from p_lampu then
    update public.lampu_state set updated_at = now(), genesis_at = coalesce(p_genesis, genesis_at)
     where one_row;
    return v_versi;
  end if;

  update public.lampu_state
     set data = p_lampu, versi = versi + 1, updated_at = now(),
         genesis_at = coalesce(p_genesis, genesis_at)
   where one_row
  returning versi into v_versi;
  return v_versi;
end $$;

revoke execute on function public.publish_lampu_server(jsonb, bigint) from public, anon, authenticated;
grant  execute on function public.publish_lampu_server(jsonb, bigint) to service_role;

-- ═══ Pemilik memasang kunci alat ═══════════════════════════════════
-- Hanya superadmin, dari tab Atur. Kunci aslinya tidak pernah disimpan —
-- yang tersimpan hash-nya. Catat kuncinya sekali waktu dibuat; kalau hilang,
-- buat kunci baru dan masukkan ulang ke alat.
create or replace function public.lampu_set_kunci(p_token text, p_baru text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  if p_baru is null or length(p_baru) < 16 or length(p_baru) > 128 then
    raise exception 'kunci alat minimal 16 karakter' using errcode = '22023';
  end if;
  update public.lampu_kunci
     set token_hash = encode(digest(p_baru, 'sha256'), 'hex'), updated_at = now()
   where one_row;
end $$;
-- Dijaga di dalam fungsi: tanpa token superadmin, panggilan apa pun ditolak.
revoke execute on function public.lampu_set_kunci(text, text) from public;
grant  execute on function public.lampu_set_kunci(text, text) to anon, authenticated;

-- ═══ Panel kasir melihat alat mana yang hidup ══════════════════════
create or replace function public.lampu_alat_daftar(p_token text)
returns table (
  alat text, terakhir_ms bigint, ip text, rssi int, fw text,
  nyala int, relay int, versi_lihat bigint, versi bigint, terbit_ms bigint, berkunci boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if public.staff_of(p_token) is null then
    raise exception 'sesi tidak sah' using errcode = '42501';
  end if;
  return query
    select a.alat, a.terakhir_ms, a.ip, a.rssi, a.fw, a.nyala, a.relay, a.versi_lihat,
           s.versi, (extract(epoch from s.updated_at) * 1000)::bigint,
           (k.token_hash is not null)
      from public.lampu_state s
      cross join public.lampu_kunci k
      left join public.lampu_alat a on true
     order by a.alat nulls last;
end $$;
revoke execute on function public.lampu_alat_daftar(text) from public;
grant  execute on function public.lampu_alat_daftar(text) to anon, authenticated;

-- ═══ Satu-satunya pintu untuk ESP32 ════════════════════════════════
-- Dipanggil alat tiap ±1 detik. Satu panggilan mengerjakan dua hal
-- sekaligus — menyetor denyut nadi dan mengambil status — supaya alat
-- kecil cukup melakukan satu sambungan HTTPS per detik.
--
-- Jawabannya TEKS BIASA, bukan JSON, supaya firmware tidak perlu pustaka
-- JSON sama sekali:
--
--   v=17
--   T01=1
--   T02=0
--   ...
--
-- Kalau alat sudah memegang versi yang sama, jawabannya cuma dua baris
-- ("v=17" dan "sama=1") — hemat kuota dan hemat waktu proses alat.
create or replace function public.lampu_sinkron(
  p_token text,
  p_alat  text,
  p_versi bigint default null,
  p_ip    text default null,
  p_rssi  int  default null,
  p_fw    text default null,
  p_nyala int  default null,
  p_relay int  default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash  text;
  v_state public.lampu_state;
  v_nama  text;
  v_baris text;
begin
  select token_hash into v_hash from public.lampu_kunci where one_row;

  -- Gagal tertutup. Selama pemilik belum memasang kunci, tidak ada alat yang
  -- bisa membaca apa pun — bukan "semua boleh" seperti kalau NULL dianggap
  -- cocok.
  if v_hash is null then
    raise exception 'kunci alat belum dipasang' using errcode = '42501';
  end if;
  if p_token is null or encode(digest(p_token, 'sha256'), 'hex') <> v_hash then
    raise exception 'kunci alat salah' using errcode = '42501';
  end if;

  v_nama := nullif(left(regexp_replace(coalesce(p_alat, ''), '[^A-Za-z0-9_.-]', '', 'g'), 40), '');
  if v_nama is null then
    raise exception 'nama alat tidak sah' using errcode = '22023';
  end if;

  insert into public.lampu_alat (alat, terakhir_ms, ip, rssi, fw, nyala, relay, versi_lihat)
  values (v_nama, (extract(epoch from clock_timestamp()) * 1000)::bigint,
          left(coalesce(p_ip, ''), 45), p_rssi, left(coalesce(p_fw, ''), 32),
          p_nyala, p_relay, p_versi)
  on conflict (alat) do update
     set terakhir_ms = excluded.terakhir_ms, ip = excluded.ip, rssi = excluded.rssi,
         fw = excluded.fw, nyala = excluded.nyala, relay = excluded.relay,
         versi_lihat = excluded.versi_lihat;

  select * into v_state from public.lampu_state where one_row;

  if p_versi is not null and p_versi = v_state.versi then
    return format('v=%s', v_state.versi) || E'\n' || 'sama=1';
  end if;

  select string_agg(format('%s=%s', e.key, case when e.value = 'true'::jsonb then '1' else '0' end),
                    E'\n' order by e.key)
    into v_baris
    from jsonb_each(v_state.data) e;

  return format('v=%s', v_state.versi) || coalesce(E'\n' || v_baris, '');
end $$;

revoke execute on function public.lampu_sinkron(text, text, bigint, text, int, text, int, int) from public;
grant  execute on function public.lampu_sinkron(text, text, bigint, text, int, text, int, int) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- SESUDAH MENJALANKAN BERKAS INI
--
-- 1. Buat kunci alat (32 huruf acak), lalu dari panel kasir:
--      Atur → Lampu meja → Pasang kunci alat
--    atau langsung di SQL Editor dengan token superadmin yang sedang aktif.
--
-- 2. Pasang ulang Edge Function `terbit` dari bundel terbaru
--    (node scripts/bundel-terbit.mjs terbit), karena fungsi itulah yang
--    mengisi `lampu_state`.
--
-- 3. Periksa: setelah kasir menekan tombol lampu, baris ini harus berubah.
--      select versi, updated_at, data from public.lampu_state;
-- ═══════════════════════════════════════════════════════════════════
