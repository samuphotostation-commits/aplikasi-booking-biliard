-- ═══════════════════════════════════════════════════════════════════
-- PESAN KE TAMU — ANTREAN KIRIM (WhatsApp)
--
-- Kenapa ANTREAN dan bukan langsung kirim: gerbang WhatsApp itu layanan
-- berbayar milik pemilik, dan belum tentu sudah dipasang. Dengan antrean,
-- aplikasinya tetap berguna sejak hari pertama:
--   * BELUM ada gerbang -> pesan menumpuk rapi di layar kasir, sekali ketuk
--     membuka WhatsApp dengan teksnya sudah jadi. Tidak ada yang hilang.
--   * SUDAH ada gerbang -> Edge Function `pesan-kirim` menghabiskan antrean
--     sendiri tiap menit. Layar kasir jadi sekadar riwayat.
-- Tidak ada perubahan aplikasi saat pemilik menyalakan gerbangnya nanti.
--
-- Nomor HP tamu adalah data pribadi: tabel ini TIDAK bisa dibaca anon, dan
-- semua pintunya menuntut token staf.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.pesan_keluar (
  id         bigserial primary key,
  hp         text not null,
  nama       text,
  teks       text not null,
  jenis      text not null check (jenis in ('booking', 'pengingat', 'promo', 'manual')),
  ref        text,
  status     text not null default 'antre' check (status in ('antre', 'terkirim', 'gagal', 'batal')),
  percobaan  int not null default 0,
  galat      text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- Satu pesan per (jenis, ref, nomor). Pemicu boleh berjalan berkali-kali —
-- kejadian yang sama tidak akan menghasilkan pesan kembar. `ref` NULL (promo,
-- manual) sengaja tidak terikat aturan ini.
create unique index if not exists pesan_keluar_sekali
  on public.pesan_keluar (jenis, ref, hp) where ref is not null;
create index if not exists pesan_keluar_antre_idx
  on public.pesan_keluar (status, created_at) where status = 'antre';

alter table public.pesan_keluar enable row level security;
revoke all on public.pesan_keluar from anon, authenticated;

-- ── Penulis pesan (dipakai pemicu & cron) ──────────────────────────
create or replace function public.pesan_tulis(
  p_hp text, p_nama text, p_teks text, p_jenis text, p_ref text default null
) returns bigint
language plpgsql security definer set search_path = public as $fn$
declare v_hp text; v_id bigint;
begin
  v_hp := public.rapikan_hp(p_hp);
  -- Nomor tidak sah atau teks kosong: diam saja, jangan bikin antrean sampah.
  if v_hp is null or length(v_hp) < 10 or coalesce(btrim(p_teks), '') = '' then return null; end if;
  insert into public.pesan_keluar (hp, nama, teks, jenis, ref)
  values (v_hp, p_nama, btrim(p_teks), p_jenis, p_ref)
  on conflict do nothing
  returning id into v_id;
  return v_id;
end $fn$;
revoke execute on function public.pesan_tulis(text, text, text, text, text) from public, anon, authenticated;

-- ── Pesan otomatis saat booking LUNAS ──────────────────────────────
-- Dipicu jejak venue, bukan aplikasi: kasir boleh tutup, HP tamu boleh mati,
-- pesannya tetap masuk antrean.
create or replace function public.pesan_sesudah_kejadian()
returns trigger
language plpgsql security definer set search_path = public as $fn$
declare s jsonb; v_kode text; v_jam text;
begin
  if new.act->>'t' <> 'confirmOnline' then return new; end if;
  s := new.act->'session';
  if s is null or coalesce(s->>'phone', '') = '' then return new; end if;
  v_kode := coalesce(s->>'bookingCode', '');
  -- Jam ditulis dalam WIB — tamu membaca jam venue, bukan jam server.
  v_jam := to_char(to_timestamp((s->>'startsAt')::bigint / 1000) at time zone 'Asia/Jakarta', 'DD Mon YYYY HH24:MI');
  perform public.pesan_tulis(
    s->>'phone', s->>'guest',
    'Halo ' || coalesce(s->>'guest', 'Kak') || ', booking SPL kamu sudah LUNAS.' || chr(10) ||
    'Kode booking: ' || v_kode || chr(10) ||
    'Kode check-in: ' || coalesce(s->>'checkin', '-') || chr(10) ||
    'Meja: ' || coalesce(s->>'tableId', '-') || chr(10) ||
    'Mulai: ' || v_jam || ' WIB' || chr(10) || chr(10) ||
    'Datang paling lambat 20 menit setelah jam mulai ya. Sampai ketemu di SPL Sports Pool Lounge!',
    'booking', v_kode);
  return new;
end $fn$;
revoke execute on function public.pesan_sesudah_kejadian() from public, anon, authenticated;

drop trigger if exists venue_events_pesan on public.venue_events;
create trigger venue_events_pesan after insert on public.venue_events
  for each row execute function public.pesan_sesudah_kejadian();

-- ── Pengingat H-1 ──────────────────────────────────────────────────
-- Booking untuk BESOK diingatkan sekali. Indeks unik di atas yang menjaga
-- supaya cron harian tidak mengirimi orang yang sama berkali-kali.
create or replace function public.pesan_pengingat()
returns integer
language plpgsql security definer set search_path = public as $fn$
declare n integer := 0; r record; v_besok date;
begin
  v_besok := ((now() at time zone 'Asia/Jakarta')::date + 1);
  for r in
    select ps.data->'session' as s
      from public.public_status ps
     where ps.data->>'kind' = 'sesi'
       and ps.data->'session'->>'status' = 'booked'
       and coalesce(ps.data->'session'->>'phone', '') <> ''
       and (to_timestamp((ps.data->'session'->>'startsAt')::bigint / 1000)
            at time zone 'Asia/Jakarta')::date = v_besok
     limit 200
  loop
    if public.pesan_tulis(
      r.s->>'phone', r.s->>'guest',
      'Pengingat: booking SPL kamu BESOK pukul ' ||
      to_char(to_timestamp((r.s->>'startsAt')::bigint / 1000) at time zone 'Asia/Jakarta', 'HH24:MI') ||
      ' WIB, meja ' || coalesce(r.s->>'tableId', '-') || '.' || chr(10) ||
      'Kode check-in: ' || coalesce(r.s->>'checkin', '-') || chr(10) ||
      'Sampai ketemu di SPL Sports Pool Lounge!',
      'pengingat', r.s->>'bookingCode') is not null then n := n + 1; end if;
  end loop;
  return n;
end $fn$;
revoke execute on function public.pesan_pengingat() from public, anon, authenticated;

-- ── Pintu untuk layar kasir (semua menuntut token staf) ────────────
create or replace function public.pesan_daftar(p_token text, p_limit int default 100)
returns table (id bigint, hp text, nama text, teks text, jenis text, ref text,
               status text, galat text, created_ms bigint, sent_ms bigint)
language plpgsql security definer set search_path = public as $fn$
begin
  if public.staff_of(p_token) is null then return; end if;
  return query
    select p.id, p.hp, p.nama, p.teks, p.jenis, p.ref, p.status, p.galat,
           (extract(epoch from p.created_at) * 1000)::bigint,
           (extract(epoch from p.sent_at) * 1000)::bigint
      from public.pesan_keluar p
     order by (p.status = 'antre') desc, p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end $fn$;

create or replace function public.pesan_tandai(p_token text, p_id bigint, p_status text)
returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  if public.staff_of(p_token) is null then return false; end if;
  if p_status not in ('terkirim', 'batal', 'antre') then return false; end if;
  update public.pesan_keluar
     set status = p_status,
         sent_at = case when p_status = 'terkirim' then now() else null end,
         galat = case when p_status = 'antre' then null else galat end
   where id = p_id;
  return found;
end $fn$;

-- Blast promo: HANYA ke member yang menyetujui dikirimi promo (UU PDP), dan
-- hanya boleh dijalankan superadmin.
create or replace function public.pesan_blast(p_token text, p_teks text)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare n integer := 0; r record; v_ref text;
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then return -1; end if;
  if coalesce(btrim(p_teks), '') = '' then return 0; end if;
  -- Satu kode per blast supaya bisa dilacak, dan supaya kiriman yang sama
  -- tidak dobel kalau tombolnya tertekan dua kali dalam menit yang sama.
  v_ref := 'blast-' || to_char(now() at time zone 'Asia/Jakarta', 'YYYYMMDDHH24MI');
  for r in select phone, nama from public.members where setuju_promo loop
    if public.pesan_tulis(r.phone, r.nama, p_teks, 'promo', v_ref) is not null then n := n + 1; end if;
  end loop;
  return n;
end $fn$;

grant execute on function public.pesan_daftar(text, int)          to anon, authenticated;
grant execute on function public.pesan_tandai(text, bigint, text) to anon, authenticated;
grant execute on function public.pesan_blast(text, text)          to anon, authenticated;

-- ── Pengirim otomatis (kalau gerbang WhatsApp sudah dipasang) ──────
create or replace function public.panggil_pengirim()
returns void
language plpgsql security definer set search_path = public, extensions as $fn$
declare c public.server_config;
begin
  select * into c from public.server_config where one_row;
  if not found or coalesce(c.fungsi_url, '') = '' then return; end if;
  -- Alamatnya sekeluarga dengan fungsi `terbit`, cukup ganti nama fungsinya.
  perform net.http_post(
    url := replace(c.fungsi_url, '/terbit', '/pesan-kirim'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000);
end $fn$;
revoke execute on function public.panggil_pengirim() from public, anon, authenticated;

select cron.unschedule('spl-pesan') where exists (select 1 from cron.job where jobname = 'spl-pesan');
select cron.schedule('spl-pesan', '* * * * *', $j$select public.panggil_pengirim()$j$);

-- Pengingat H-1 sekali sehari, pukul 10.00 WIB (03.00 UTC).
select cron.unschedule('spl-pengingat') where exists (select 1 from cron.job where jobname = 'spl-pengingat');
select cron.schedule('spl-pengingat', '0 3 * * *', $j$select public.pesan_pengingat()$j$);

select 'pesan terpasang' as hasil;
