-- ═══════════════════════════════════════════════════════════════════
-- SPL — PERAN WAITER
-- Jalankan SESUDAH schema-peran.sql. Aman dijalankan ulang.
--
-- Permintaan pemilik 7 Nov 2026: waiter Smokehouse membuka meja, mencatat
-- pesanan, dan mengantar, tapi tidak memegang uang. Tanpa berkas ini server
-- menolak menyimpan akun berperan waiter.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.peran_sah(p text)
returns boolean language sql immutable as $$
  select p in ('superadmin', 'manager', 'finance', 'kru_gudang',
               'kru_kasir', 'kru_kitchen', 'kru_bar', 'karyawan', 'waiter');
$$;

select public.peran_sah('waiter') as waiter_diterima;
