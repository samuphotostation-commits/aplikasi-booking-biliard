-- ═══════════════════════════════════════════════════════════════════
-- SPL — TUJUH PERAN DI SERVER
--
-- Aplikasi sudah memakai tujuh peran sejak 8 Okt 2026, tapi server masih
-- hanya mengenal 'superadmin' dan 'karyawan'. Tanpa berkas ini, menyimpan
-- staf berperan `manager`/`finance`/dll DITOLAK database, dan Manager yang
-- menurut diagram punya All Access malah ditolak di pintu-pintu pemilik.
--
-- Badan fungsi di bawah DISALIN APA ADANYA dari berkas aslinya oleh skrip
-- pembangkit — yang diubah hanya baris pagar perannya. Jadi tidak ada versi
-- kembar yang bisa diam-diam berbeda dari repo.
--
-- Jalankan di SQL Editor Supabase. Aman diulang.
-- ═══════════════════════════════════════════════════════════════════

-- ── Daftar peran yang sah ─────────────────────────────────────────
create or replace function public.peran_sah(p text)
returns boolean language sql immutable as $$
  select p in ('superadmin', 'manager', 'finance', 'kru_gudang',
               'kru_kasir', 'kru_kitchen', 'kru_bar', 'karyawan');
$$;

-- `karyawan` DIPERTAHANKAN: jejak venue menyimpan peran di dalam kejadiannya,
-- jadi membuangnya membuat riwayat staf lama tidak bisa diputar ulang.
alter table public.staff_pins drop constraint if exists staff_pins_peran_check;
alter table public.staff_pins add constraint staff_pins_peran_check
  check (public.peran_sah(peran));

-- ── Siapa yang dianggap "akses penuh" ─────────────────────────────
-- Diagram roadmap: Superadmin dan Manager sama-sama All Access.
create or replace function public.peran_admin(p text)
returns boolean language sql immutable as $$
  select coalesce(p, '') in ('superadmin', 'manager');
$$;

create or replace function public.staf_admin(p_token text)
returns boolean language sql security definer set search_path = public as $$
  select public.peran_admin(public.staff_role(p_token));
$$;

revoke execute on function public.peran_admin(text) from public, anon, authenticated;
revoke execute on function public.staf_admin(text) from public, anon, authenticated;

-- ── Fungsi yang pagarnya dilebarkan ───────────────────────────────
-- dari supabase/schema-email.sql
create or replace function public.list_staff(p_token text)
returns table (staff_id text, nama text, peran text, aktif boolean, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.staf_admin(p_token) then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  return query select s.staff_id, s.nama, s.peran, s.aktif, s.email
                 from public.staff_pins s order by s.nama;
end $$;

-- dari supabase/schema-staf.sql
create or replace function public.upsert_staff(
  p_token text, p_id text, p_nama text, p_peran text,
  p_pin text default null, p_aktif boolean default true
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_sisa int;
begin
  if not public.staf_admin(p_token) then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  if p_id is null or length(p_id) < 2 or length(p_id) > 64 then
    raise exception 'id staf tidak sah' using errcode = '22023';
  end if;
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'nama staf kosong' using errcode = '22023';
  end if;
  if not public.peran_sah(p_peran) then
    raise exception 'peran tidak dikenal' using errcode = '22023';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN harus 4-6 angka' using errcode = '22023';
  end if;

  -- PIN tidak boleh kembar: dua orang dengan PIN sama membuat jejak audit bohong.
  if p_pin is not null and exists (
    select 1 from public.staff_pins
     where staff_id <> p_id and pin_hash = crypt(p_pin, pin_hash)
  ) then
    raise exception 'PIN sudah dipakai staf lain' using errcode = '22023';
  end if;

  insert into public.staff_pins (staff_id, nama, peran, pin_hash, aktif, updated_at)
  values (p_id, trim(p_nama), p_peran,
          crypt(coalesce(p_pin, encode(gen_random_bytes(16), 'hex')), gen_salt('bf')),
          coalesce(p_aktif, true), now())
  on conflict (staff_id) do update
     set nama = excluded.nama,
         peran = excluded.peran,
         aktif = excluded.aktif,
         pin_hash = case when p_pin is null then public.staff_pins.pin_hash else excluded.pin_hash end,
         updated_at = now();

  -- Venue tidak boleh kehilangan seluruh superadminnya.
  select count(*) into v_sisa from public.staff_pins where aktif and peran = 'superadmin';
  if v_sisa = 0 then
    raise exception 'harus ada minimal satu superadmin aktif' using errcode = '22023';
  end if;

  -- Akun yang dinonaktifkan/diturunkan: sesi yang masih berjalan ikut diputus.
  if coalesce(p_aktif, true) = false then
    delete from public.staff_sessions where staff_id = p_id;
  end if;
end $$;

-- dari supabase/schema-staf.sql
create or replace function public.delete_staff(p_token text, p_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_sisa int;
begin
  if not public.staf_admin(p_token) then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  delete from public.staff_sessions where staff_id = p_id;
  delete from public.staff_pins where staff_id = p_id;
  select count(*) into v_sisa from public.staff_pins where aktif and peran = 'superadmin';
  if v_sisa = 0 then
    raise exception 'harus ada minimal satu superadmin aktif' using errcode = '22023';
  end if;
end $$;

-- dari supabase/schema-email.sql
create or replace function public.set_staff_email(p_token text, p_id text, p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.staf_admin(p_token) then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff_pins where staff_id = p_id) then
    raise exception 'akun staf tidak ditemukan' using errcode = '22023';
  end if;
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'alamat email tidak sah' using errcode = '22023';
  end if;
  if v_email is not null and exists (
    select 1 from public.staff_pins where staff_id <> p_id and lower(email) = v_email
  ) then
    raise exception 'email sudah dipakai staf lain' using errcode = '22023';
  end if;
  update public.staff_pins set email = v_email, updated_at = now() where staff_id = p_id;
end $$;

-- dari supabase/schema-pesan.sql
create or replace function public.pesan_blast(p_token text, p_teks text)
returns integer
language plpgsql security definer set search_path = public as $fn$
declare n integer := 0; r record; v_ref text;
begin
  if not public.staf_admin(p_token) then return -1; end if;
  if coalesce(btrim(p_teks), '') = '' then return 0; end if;
  -- Satu kode per blast supaya bisa dilacak, dan supaya kiriman yang sama
  -- tidak dobel kalau tombolnya tertekan dua kali dalam menit yang sama.
  v_ref := 'blast-' || to_char(now() at time zone 'Asia/Jakarta', 'YYYYMMDDHH24MI');
  for r in select phone, nama from public.members where setuju_promo loop
    if public.pesan_tulis(r.phone, r.nama, p_teks, 'promo', v_ref) is not null then n := n + 1; end if;
  end loop;
  return n;
end $fn$;

-- dari supabase/schema-sandi.sql
create or replace function public.set_staff_password(p_token text, p_id text, p_password text)
returns text
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not public.staf_admin(p_token) then
    return 'hanya superadmin yang boleh mengatur password';
  end if;
  -- Kosong = cabut passwordnya; staf itu kembali hanya bisa masuk lewat PIN.
  if coalesce(btrim(p_password), '') = '' then
    update public.staff_pins set password_hash = null where staff_id = p_id;
    return null;
  end if;
  if length(p_password) < 8 then
    return 'password minimal 8 karakter';
  end if;
  if not exists (select 1 from public.staff_pins where staff_id = p_id) then
    return 'staf tidak dikenal';
  end if;
  -- Password hanya berguna kalau emailnya sudah diisi: itulah yang diketik.
  if coalesce((select email from public.staff_pins where staff_id = p_id), '') = '' then
    return 'isi email staf ini dulu sebelum memberi password';
  end if;
  update public.staff_pins
     set password_hash = crypt(p_password, gen_salt('bf', 10))
   where staff_id = p_id;
  return null;
end $fn$;

-- dari supabase/schema-sandi.sql
create or replace function public.staf_punya_sandi(p_token text)
returns table (staff_id text, ada boolean)
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.staf_admin(p_token) then return; end if;
  return query select s.staff_id, s.password_hash is not null from public.staff_pins s;
end $fn$;

-- dari supabase/schema-absensi.sql
create or replace function public.absen_daftar(p_token text, p_hari int default 14)
returns table (id bigint, staff_id text, nama text, jenis text, at_ms bigint,
               catatan text, ada_foto boolean)
language plpgsql security definer set search_path = public as $fn$
declare v_id text; v_peran text;
begin
  v_id := public.staff_of(p_token);
  if v_id is null then return; end if;
  v_peran := coalesce(public.staff_role(p_token), '');
  return query
    select a.id, a.staff_id, a.nama, a.jenis,
           (extract(epoch from a.at) * 1000)::bigint, a.catatan, (a.foto is not null)
      from public.absensi a
     where a.at > now() - (greatest(1, least(coalesce(p_hari, 14), 90)) || ' days')::interval
       and (public.peran_admin(v_peran) or a.staff_id = v_id)
     order by a.at desc
     limit 500;
end $fn$;

-- dari supabase/schema-absensi.sql
create or replace function public.absen_foto(p_token text, p_id bigint)
returns text
language plpgsql security definer set search_path = public as $fn$
declare v_id text; v_peran text; v_foto text; v_pemilik text;
begin
  v_id := public.staff_of(p_token);
  if v_id is null then return null; end if;
  v_peran := coalesce(public.staff_role(p_token), '');
  select foto, staff_id into v_foto, v_pemilik from public.absensi where id = p_id;
  if v_pemilik is null then return null; end if;
  if not public.peran_admin(v_peran) and v_pemilik <> v_id then return null; end if;
  return v_foto;
end $fn$;

select 'tujuh peran terpasang' as hasil;
