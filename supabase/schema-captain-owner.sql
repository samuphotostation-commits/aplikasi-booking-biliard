-- ═══════════════════════════════════════════════════════════════════
-- SPL — PERAN CAPTAIN & OWNER
-- Jalankan SESUDAH schema-peran.sql dan schema-waiter.sql. Aman dijalankan ulang.
--
-- Permintaan pemilik 18 Nov 2026 (PDF "revisi update SPL", poin 7):
--   · Captain — seperti superadmin, tanpa void, pesan, pelanggan, atur harga,
--               dan promo. Boleh mengurus akun kru, jadi ikut "akses penuh"
--               di pintu akun staf (aplikasi menolak Captain memberi peran
--               Superadmin, Owner, atau Manager).
--   · Owner   — Rekap lengkap dengan laporan keuangan.
-- Tanpa berkas ini server menolak menyimpan akun berperan captain/owner.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.peran_sah(p text)
returns boolean language sql immutable as $$
  select p in ('superadmin', 'manager', 'finance', 'kru_gudang',
               'kru_kasir', 'kru_kitchen', 'kru_bar', 'karyawan', 'waiter',
               'captain', 'owner');
$$;

create or replace function public.peran_admin(p text)
returns boolean language sql immutable as $$
  select coalesce(p, '') in ('superadmin', 'manager', 'captain');
$$;

revoke execute on function public.peran_admin(text) from public, anon, authenticated;

select public.peran_sah('captain') as captain_diterima,
       public.peran_sah('owner')   as owner_diterima;
