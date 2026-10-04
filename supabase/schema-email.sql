-- ═══════════════════════════════════════════════════════════════════
-- SPL — MASUK DENGAN EMAIL (selain PIN)
--
-- Tempel ke SQL Editor project spl-venue, lalu Run. Aman dijalankan ulang.
--
-- Cara kerjanya:
--   1. Superadmin menautkan sebuah email ke akun staf (tab Atur → Akun staf).
--   2. Staf itu memilih "Masuk dengan email", memasukkan emailnya, lalu
--      menerima KODE 6 ANGKA dari Supabase Auth.
--   3. Sesudah kodenya benar, aplikasi memanggil `staff_login_email()` yang
--      mengeluarkan token venue 12 jam — sama persis seperti masuk lewat PIN.
--
-- Yang dijaga:
--   • Kode hanya dikirim ke email yang MEMANG terdaftar sebagai staf aktif
--     (`email_staf_terdaftar`), jadi Supabase venue tidak bisa dipakai orang
--     lain untuk mengirimi email siapa pun.
--   • Punya akun Supabase Auth saja TIDAK memberi akses apa pun: token venue
--     baru keluar kalau emailnya tertaut ke staf yang aktif.
--   • Email disimpan huruf kecil dan unik — satu email satu orang, supaya
--     jejak audit tetap menunjuk pelaku yang benar.
-- ═══════════════════════════════════════════════════════════════════

alter table public.staff_pins add column if not exists email text;
create unique index if not exists staff_pins_email_uniq
  on public.staff_pins (lower(email)) where email is not null;

-- ═══ Superadmin menautkan / melepas email ══════════════════════════
create or replace function public.set_staff_email(p_token text, p_id text, p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then
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

-- ═══ Apakah email ini staf aktif? (dipakai sebelum mengirim kode) ══
create or replace function public.email_staf_terdaftar(p_email text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ada boolean; v_baru int;
begin
  -- Rem sederhana supaya tidak dipakai menyapu daftar email.
  select count(*) into v_baru from public.pin_attempts where at > now() - interval '10 minutes';
  if v_baru > 120 then return false; end if;
  insert into public.pin_attempts (berhasil) values (true);
  select exists (
    select 1 from public.staff_pins
     where aktif and lower(email) = lower(trim(coalesce(p_email, '')))
  ) into v_ada;
  return v_ada;
end $$;

-- ═══ Tukar sesi Supabase Auth menjadi sesi venue 12 jam ════════════
create or replace function public.staff_login_email()
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text; v_row public.staff_pins; v_token text;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    return jsonb_build_object('ok', false, 'alasan', 'Belum masuk lewat email');
  end if;
  select * into v_row from public.staff_pins
   where aktif and lower(email) = v_email limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'alasan', 'Email ini belum ditautkan ke akun staf');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.staff_sessions (token, staff_id, expires_at)
  values (v_token, v_row.staff_id, now() + interval '12 hours');
  delete from public.staff_sessions where expires_at < now();

  return jsonb_build_object(
    'ok', true, 'token', v_token, 'staffId', v_row.staff_id,
    'nama', v_row.nama, 'peran', v_row.peran,
    'berlakuSampai', (extract(epoch from (now() + interval '12 hours')) * 1000)::bigint
  );
end $$;

-- Daftar staf ikut membawa emailnya (untuk layar Atur).
-- Bentuk kembaliannya bertambah satu kolom, jadi versi lamanya dilepas dulu.
drop function if exists public.list_staff(text);
create or replace function public.list_staff(p_token text)
returns table (staff_id text, nama text, peran text, aktif boolean, email text)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  return query select s.staff_id, s.nama, s.peran, s.aktif, s.email
                 from public.staff_pins s order by s.nama;
end $$;

grant execute on function public.set_staff_email(text, text, text) to anon, authenticated;
grant execute on function public.email_staf_terdaftar(text)        to anon, authenticated;
grant execute on function public.staff_login_email()               to authenticated;
grant execute on function public.list_staff(text)                  to anon, authenticated;
