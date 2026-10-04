-- ═══════════════════════════════════════════════════════════════════
-- SPL — QRIS DINAMIS (Midtrans / DOKU)
--
-- Tempel ke SQL Editor project spl-venue, lalu Run. Aman dijalankan ulang.
--
-- Alur yang dipakai:
--   1. HP tamu meminta QR ke Edge Function `qris-buat`. Fungsi itu memegang
--      SECRET KEY gateway (tidak pernah sampai ke HP) dan menyimpan baris di
--      `payment_charges` berisi: nominal + AKSI VENUE yang akan dirilis nanti.
--   2. Tamu membayar. Gateway memanggil Edge Function `qris-webhook`.
--   3. Webhook memeriksa tanda tangan, menandai baris itu lunas, lalu menulis
--      aksi venue ke `venue_events` — persis seperti kasir/HP menulis aksi.
--      Mesin yang memutuskan sisanya (slot masih ada? harga cocok? stok ada?)
--      dan mencatat refund kalau tidak cocok.
--   4. HP tamu menanyakan `payment_status(ref)` sampai lunas.
--
-- Yang dijaga:
--   • Secret key hanya ada di Edge Function (env), tidak pernah di HP/bundel web.
--   • Nominal yang dirilis = nominal yang BENAR-BENAR dibayar menurut gateway.
--   • Aksi venue dibekukan saat QR dibuat — webhook tidak bisa disuruh
--     menulis aksi lain.
--   • Tabel pembayaran tidak bisa dibaca/ditulis langsung dengan kunci publik.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.payment_charges (
  ref         text primary key,                 -- order_id yang dikirim ke gateway
  provider    text not null check (provider in ('midtrans', 'doku')),
  kode        text not null,                    -- kode booking/pesanan milik tamu
  amount      bigint not null check (amount > 0),
  status      text not null default 'menunggu'
               check (status in ('menunggu', 'lunas', 'gagal', 'kedaluwarsa')),
  act         jsonb,                            -- aksi venue yang dirilis saat lunas (null = tagihan UJI COBA)
  qr_string   text,
  qr_url      text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz,
  event_id    text                              -- id kejadian yang sudah ditulis (anti-dobel)
);
create index if not exists payment_charges_kode_idx on public.payment_charges (kode, created_at desc);
-- Tabel versi lama mewajibkan `act`; tagihan UJI COBA pemilik sengaja tanpa aksi
-- venue supaya pembayarannya tidak pernah menulis apa pun ke jejak.
alter table public.payment_charges alter column act drop not null;

alter table public.payment_charges enable row level security;
revoke all on public.payment_charges from anon, authenticated;

-- ═══ Status satu pembayaran (hanya yang tahu ref-nya) ══════════════
create or replace function public.payment_status(p_ref text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.payment_charges;
begin
  if p_ref is null or length(p_ref) < 6 or length(p_ref) > 128 then return null; end if;
  select * into v from public.payment_charges where ref = p_ref;
  if not found then return null; end if;
  return jsonb_build_object(
    'ref', v.ref, 'status', v.status, 'amount', v.amount,
    'kode', v.kode, 'expiresAt', (extract(epoch from v.expires_at) * 1000)::bigint
  );
end $$;

grant execute on function public.payment_status(text) to anon, authenticated;

-- ═══ Apakah QRIS sudah aktif? (layar tamu menyesuaikan tampilannya) ═
-- Diisi Edge Function saat pertama berhasil membuat QR; pemilik juga bisa
-- menyalakan/mematikan manual lewat SQL.
create table if not exists public.payment_config (
  one_row    boolean primary key default true check (one_row),
  provider   text,
  aktif      boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.payment_config (aktif) values (false) on conflict (one_row) do nothing;

alter table public.payment_config enable row level security;
drop policy if exists baca_config_bayar on public.payment_config;
create policy baca_config_bayar on public.payment_config for select to anon, authenticated using (true);
grant select on public.payment_config to anon, authenticated;
revoke insert, update, delete on public.payment_config from anon, authenticated;

-- ═══ Tagihan yang tergantung: ditanyakan ulang sendiri tiap menit ══
-- Masalah yang diperbaiki: tamu SUDAH membayar, tapi layarnya diam di
-- "menunggu". Penyebabnya notifikasi DOKU ditolak fungsi kita (401) dan tidak
-- ada yang bertanya ulang. Sekarang dua lapis:
--   1. Fungsi `qris-webhook` tidak lagi percaya tanda tangan notifikasi untuk
--      DOKU — ia BERTANYA BALIK ke `/orders/v1/status/<invoice>`.
--   2. Penyapu di bawah ini memanggil fungsi itu untuk setiap tagihan yang
--      masih menggantung, jadi pembayaran tetap masuk walau tamu sudah
--      menutup aplikasinya dan notifikasi gateway hilang di jalan.
-- Yang memutuskan lunas tetap gateway; SQL ini cuma mengetuk.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.sapu_tagihan_menunggu()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare n integer := 0; r record;
begin
  for r in
    select ref from public.payment_charges
     where status = 'menunggu'
       and created_at > now() - interval '2 hours'   -- yang lebih tua sudah pasti kedaluwarsa
     limit 50
  loop
    perform net.http_post(
      url := 'https://fhoxdsxabpohafilqxoz.supabase.co/functions/v1/qris-webhook',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('ref', r.ref),
      timeout_milliseconds := 8000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.sapu_tagihan_menunggu() from public, anon, authenticated;

select cron.unschedule('spl-cek-bayar') where exists (select 1 from cron.job where jobname = 'spl-cek-bayar');
select cron.schedule('spl-cek-bayar', '* * * * *', $$select public.sapu_tagihan_menunggu()$$);
