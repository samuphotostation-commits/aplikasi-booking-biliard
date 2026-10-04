-- ═══════════════════════════════════════════════════════════════════
-- SPL — TUTUP BUKU STOK HARIAN
--
-- MASALAH YANG DIPERBAIKI: laporan stok dulu tidak menyimpan apa pun. Angkanya
-- dihitung dari `stockMoves`, penyangga DI DALAM MEMORI yang dibangun ulang
-- tiap jejak diputar dan dipotong di 2.000 baris terakhir. Kolom "Awal"
-- direka MUNDUR dari sisa hari ini, jadi satu pergerakan yang hilang membuat
-- semua hari sebelumnya salah — dan kalau penyangganya kosong, layarnya selalu
-- menampilkan Awal = Sisa dan Terjual = 0. Persis keluhan pemilik.
--
-- Sekarang tiap hari yang sudah lewat DITUTUP dan disimpan sebagai fakta oleh
-- fungsi server `stok-tutup`, yang memutar ulang jejak dengan mesin yang sama
-- (engine.ts). Angka hari lampau tidak bisa berubah lagi dan tidak bergantung
-- perangkat mana pun.
--
-- Jalankan di SQL Editor Supabase. Aman diulang.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.stok_harian (
  -- Hari STOK (batas 05.00 WIB), bukan hari uang (batas 02.00).
  tanggal    date    not null,
  item_id    text    not null,
  -- Sisa pada jam 05.00 pagi hari itu. NULL = barang tidak dilacak stoknya.
  awal       integer,
  masuk      integer not null default 0,
  terjual    integer not null default 0,
  kembali    integer not null default 0,
  susut      integer not null default 0,
  -- Selisih hasil hitung fisik. Negatif = barang kurang dari catatan.
  opname     integer not null default 0,
  -- Sisa pada jam 05.00 pagi besoknya.
  sisa       integer,
  nilai_jual bigint  not null default 0,
  ditutup_at timestamptz not null default now(),
  primary key (tanggal, item_id)
);

create index if not exists stok_harian_tgl_idx on public.stok_harian (tanggal desc);

alter table public.stok_harian enable row level security;
revoke all on public.stok_harian from anon, authenticated;

-- ── Dibaca staf ────────────────────────────────────────────────────
-- Kolomnya bisa bertambah di kemudian hari, jadi versi lamanya dibuang dulu:
-- `create or replace` menolak kalau daftar kolom kembaliannya berubah.
drop function if exists public.stok_ambil(text, date, date);
create or replace function public.stok_ambil(p_token text, p_dari date, p_sampai date)
returns table (
  tanggal date, item_id text, awal integer, masuk integer, terjual integer,
  kembali integer, susut integer, opname integer, sisa integer, nilai_jual bigint
)
language plpgsql security definer set search_path = public as $fn$
begin
  -- coalesce WAJIB: `staff_of(token) is null <> 'x'` bernilai NULL, dan NULL
  -- tidak menjaga apa pun. Jebakan ini sudah pernah memakan korban di sini.
  if coalesce(public.staff_of(p_token), '') = '' then return; end if;
  if p_sampai < p_dari then return; end if;
  -- Pagar ukuran: 400 hari sudah lebih dari cukup untuk laporan mana pun.
  if p_sampai - p_dari > 400 then return; end if;
  return query
    select s.tanggal, s.item_id, s.awal, s.masuk, s.terjual,
           s.kembali, s.susut, s.opname, s.sisa, s.nilai_jual
    from public.stok_harian s
    where s.tanggal between p_dari and p_sampai
    order by s.tanggal desc, s.item_id;
end $fn$;

grant execute on function public.stok_ambil(text, date, date) to anon, authenticated;

-- ── Pemicu tutup buku (dipanggil cron) ─────────────────────────────
create or replace function public.panggil_stok_tutup()
returns void
language plpgsql security definer set search_path = public, extensions as $fn$
declare c public.server_config;
begin
  select * into c from public.server_config where one_row;
  if not found or coalesce(c.fungsi_url, '') = '' then return; end if;
  -- Alamatnya sekeluarga dengan fungsi `terbit`, cukup ganti nama fungsinya.
  perform net.http_post(
    url := replace(c.fungsi_url, '/terbit', '/stok-tutup'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $fn$;
revoke execute on function public.panggil_stok_tutup() from public, anon, authenticated;

-- Tiap hari 05.10 WIB (22.10 UTC) — sepuluh menit sesudah hari stok berganti,
-- supaya kejadian terakhir malam itu sudah pasti sampai di server.
select cron.unschedule('spl-stok-tutup') where exists (select 1 from cron.job where jobname = 'spl-stok-tutup');
select cron.schedule('spl-stok-tutup', '10 22 * * *', $j$select public.panggil_stok_tutup()$j$);

select 'stok harian terpasang' as hasil;
