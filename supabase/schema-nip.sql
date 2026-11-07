-- ═══════════════════════════════════════════════════════════════════
-- SPL — KARYAWAN MASUK DENGAN NIP + PIN, LUPA PIN LEWAT GMAIL
-- Jalankan SESUDAH schema-gmail.sql. Aman dijalankan ulang.
--
-- Permintaan pemilik 7 Nov 2026: setiap akun punya NIP dan PIN, dan ada menu
-- Lupa PIN yang tersambung ke email karyawan.
--
-- KENAPA PIN SERING GAGAL SEBELUM INI:
--   1. Layar mencocokkan PIN dengan daftar di perangkat dulu. Perangkat yang
--      belum masuk hanya tahu daftar bawaan, jadi PIN asli ditolak di layar.
--   2. PIN yang lolos layar bisa ditolak server karena Gmail belum terbukti.
--   3. Rem percobaan salah berlaku untuk SEMUA akun. Dua puluh PIN salah dari
--      siapa pun membuat seluruh karyawan terkunci selama 10 menit.
--
-- SESUDAH BERKAS INI:
--   • Server yang memeriksa NIP + PIN. Gmail tidak lagi jadi syarat PIN.
--   • Kunci berlaku per akun: 5 kali salah, akun itu tunggu 10 menit.
--   • Lupa PIN: buktikan Gmail lewat Google, lalu buat PIN baru.
-- ═══════════════════════════════════════════════════════════════════

alter table public.staff_pins add column if not exists nip text;
alter table public.staff_pins add column if not exists venue text;
alter table public.staff_pins add column if not exists gagal_pin integer not null default 0;
alter table public.staff_pins add column if not exists terkunci_sampai timestamptz;
alter table public.staff_sessions add column if not exists dari_google boolean not null default false;

alter table public.staff_pins drop constraint if exists staff_pins_venue_check;
alter table public.staff_pins add constraint staff_pins_venue_check
  check (venue is null or venue in ('spl', 'smh'));

create unique index if not exists staff_pins_nip_uniq
  on public.staff_pins (upper(nip)) where nip is not null;

-- ═══ NIP berikutnya: SPL001, SPL002, … ═════════════════════════════
create or replace function public.nip_baru()
returns text
language sql stable set search_path = public as $$
  select 'SPL' || lpad((coalesce(max((regexp_match(upper(nip), '^SPL([0-9]+)$'))[1]::int), 0) + 1)::text, 3, '0')
    from public.staff_pins;
$$;
revoke execute on function public.nip_baru() from public, anon, authenticated;

-- Akun yang sudah ada mendapat NIP. Pemilik dulu supaya nomornya paling kecil.
do $$
declare r record;
begin
  for r in
    select staff_id from public.staff_pins where nip is null
     order by case peran when 'superadmin' then 0 when 'manager' then 1 else 2 end, nama
  loop
    update public.staff_pins set nip = public.nip_baru() where staff_id = r.staff_id;
  end loop;
end $$;

-- ═══ Masuk dengan NIP + PIN ════════════════════════════════════════
-- Jawaban untuk NIP tidak dikenal dan PIN salah sengaja sama: orang luar tidak
-- boleh bisa mengetahui NIP mana yang benar-benar ada.
create or replace function public.staff_masuk(p_nip text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v public.staff_pins; v_nip text; v_token text; v_menit int;
begin
  v_nip := upper(trim(coalesce(p_nip, '')));
  if v_nip = '' or coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'alasan', 'NIP atau PIN salah.');
  end if;
  select * into v from public.staff_pins where upper(nip) = v_nip;
  if not found or not v.aktif then
    return jsonb_build_object('ok', false, 'alasan', 'NIP atau PIN salah.');
  end if;
  if v.terkunci_sampai is not null and v.terkunci_sampai > now() then
    v_menit := ceil(extract(epoch from (v.terkunci_sampai - now())) / 60);
    return jsonb_build_object('ok', false, 'alasan',
      'Akun terkunci karena PIN salah berkali-kali. Coba lagi ' || v_menit || ' menit lagi, atau pakai Lupa PIN.');
  end if;
  if v.pin_hash <> crypt(p_pin, v.pin_hash) then
    update public.staff_pins
       set gagal_pin = case when gagal_pin + 1 >= 5 then 0 else gagal_pin + 1 end,
           terkunci_sampai = case when gagal_pin + 1 >= 5 then now() + interval '10 minutes' else null end
     where staff_id = v.staff_id;
    return jsonb_build_object('ok', false, 'alasan', 'NIP atau PIN salah.');
  end if;

  update public.staff_pins set gagal_pin = 0, terkunci_sampai = null where staff_id = v.staff_id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.staff_sessions (token, staff_id, expires_at)
  values (v_token, v.staff_id, now() + interval '12 hours');
  delete from public.staff_sessions where expires_at < now();
  return jsonb_build_object('ok', true, 'token', v_token, 'staffId', v.staff_id, 'nama', v.nama,
                            'peran', v.peran, 'nip', v.nip, 'venue', v.venue);
end $$;
grant execute on function public.staff_masuk(text, text) to anon, authenticated;

-- ═══ Masuk lewat Google, sekaligus jalan Lupa PIN ══════════════════
create or replace function public.staff_login_email()
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text; v_row public.staff_pins; v_token text;
begin
  v_email := public.email_google();
  if v_email is null then
    return jsonb_build_object('ok', false, 'alasan', 'Masuk dengan akun Google dulu.');
  end if;
  select * into v_row from public.staff_pins where aktif and lower(email) = v_email limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'alasan',
      v_email || ' belum didaftarkan. Minta pemilik menautkannya di Atur → Akun staf.');
  end if;
  update public.staff_pins
     set gmail_terverifikasi = coalesce(gmail_terverifikasi, now()), gagal_pin = 0, terkunci_sampai = null
   where staff_id = v_row.staff_id;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.staff_sessions (token, staff_id, expires_at, dari_google)
  values (v_token, v_row.staff_id, now() + interval '12 hours', true);
  delete from public.staff_sessions where expires_at < now();

  return jsonb_build_object(
    'ok', true, 'token', v_token, 'staffId', v_row.staff_id,
    'nama', v_row.nama, 'peran', v_row.peran, 'nip', v_row.nip, 'venue', v_row.venue,
    'berlakuSampai', (extract(epoch from (now() + interval '12 hours')) * 1000)::bigint
  );
end $$;

-- Hanya sesi yang baru saja membuktikan Gmail boleh mengganti PIN. Layar kasir
-- yang lupa dikunci tidak bisa dipakai orang lain untuk mengganti PIN pemiliknya.
create or replace function public.staff_atur_pin(p_token text, p_baru text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_id text;
begin
  if coalesce(p_baru, '') !~ '^[0-9]{4}$' then return 'PIN harus 4 angka.'; end if;
  select staff_id into v_id from public.staff_sessions
   where token = p_token and dari_google and expires_at > now()
     and created_at > now() - interval '15 minutes';
  if v_id is null then return 'Waktu habis. Ulangi Lupa PIN dari awal.'; end if;
  update public.staff_pins
     set pin_hash = crypt(p_baru, gen_salt('bf')), gagal_pin = 0, terkunci_sampai = null, updated_at = now()
   where staff_id = v_id;
  return null;
end $$;
grant execute on function public.staff_atur_pin(text, text) to anon, authenticated;

-- ═══ Pemilik mengelola akun ════════════════════════════════════════
-- PIN tidak lagi harus unik: NIP yang membedakan orangnya.
create or replace function public.upsert_staff_nip(
  p_token text, p_id text, p_nama text, p_peran text,
  p_pin text default null, p_aktif boolean default true,
  p_nip text default null, p_venue text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_sisa int; v_nip text;
begin
  if not public.staf_admin(p_token) then
    return jsonb_build_object('ok', false, 'alasan', 'Hanya pemilik atau manager yang boleh mengelola akun.');
  end if;
  if p_id is null or length(p_id) < 2 or length(p_id) > 64 or coalesce(trim(p_nama), '') = ''
     or not public.peran_sah(p_peran) then
    return jsonb_build_object('ok', false, 'alasan', 'Data akun belum lengkap.');
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'alasan', 'PIN harus 4 angka.');
  end if;
  if p_venue is not null and p_venue not in ('spl', 'smh') then
    return jsonb_build_object('ok', false, 'alasan', 'Tempat kerja tidak dikenal.');
  end if;

  v_nip := nullif(upper(trim(coalesce(p_nip, ''))), '');
  if v_nip is not null and v_nip !~ '^[A-Z0-9-]{3,12}$' then
    return jsonb_build_object('ok', false, 'alasan', 'NIP 3 sampai 12 huruf atau angka.');
  end if;
  if v_nip is not null and exists (
    select 1 from public.staff_pins where staff_id <> p_id and upper(nip) = v_nip
  ) then
    return jsonb_build_object('ok', false, 'alasan', 'NIP ' || v_nip || ' sudah dipakai karyawan lain.');
  end if;
  if v_nip is null then
    select nip into v_nip from public.staff_pins where staff_id = p_id;
    v_nip := coalesce(v_nip, public.nip_baru());
  end if;

  if p_pin is null and not exists (select 1 from public.staff_pins where staff_id = p_id) then
    return jsonb_build_object('ok', false, 'alasan', 'Akun baru harus punya PIN.');
  end if;

  insert into public.staff_pins (staff_id, nama, peran, pin_hash, aktif, nip, venue, updated_at)
  values (p_id, trim(p_nama), p_peran, crypt(coalesce(p_pin, ''), gen_salt('bf')),
          coalesce(p_aktif, true), v_nip, p_venue, now())
  on conflict (staff_id) do update
     set nama = excluded.nama, peran = excluded.peran, aktif = excluded.aktif,
         nip = excluded.nip, venue = excluded.venue, updated_at = now(),
         pin_hash = case when p_pin is null then public.staff_pins.pin_hash else excluded.pin_hash end,
         gagal_pin = case when p_pin is null then public.staff_pins.gagal_pin else 0 end,
         terkunci_sampai = case when p_pin is null then public.staff_pins.terkunci_sampai end;

  select count(*) into v_sisa from public.staff_pins where aktif and peran = 'superadmin';
  if v_sisa = 0 then
    raise exception 'harus ada minimal satu superadmin aktif' using errcode = '22023';
  end if;
  if coalesce(p_aktif, true) = false then
    delete from public.staff_sessions where staff_id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'nip', v_nip);
end $$;
grant execute on function public.upsert_staff_nip(text, text, text, text, text, boolean, text, text) to anon, authenticated;

-- Daftar untuk layar Atur. PIN tidak pernah ikut.
create or replace function public.daftar_nip(p_token text)
returns table (staff_id text, nip text, terkunci boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.staf_admin(p_token) then return; end if;
  return query select s.staff_id, s.nip, coalesce(s.terkunci_sampai > now(), false) from public.staff_pins s;
end $$;
grant execute on function public.daftar_nip(text) to anon, authenticated;

create or replace function public.staf_gmail_status(p_token text)
returns table (staff_id text, terbukti boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.staf_admin(p_token) then return; end if;
  return query select s.staff_id, s.gmail_terverifikasi is not null from public.staff_pins s;
end $$;

-- Berhenti di sini kalau berkas sebelumnya belum dijalankan.
do $$ begin perform public.staf_admin(''); perform public.peran_sah('manager'); end $$;

-- Daftar NIP untuk dibagikan ke karyawan. PIN tersimpan teracak dan tidak bisa dibaca.
select nip, nama, peran, aktif, coalesce(email, '(belum ada Gmail)') as gmail
  from public.staff_pins order by nip;
