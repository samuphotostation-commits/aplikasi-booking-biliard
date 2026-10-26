-- ═══════════════════════════════════════════════════════════════════
-- SPL — MASUK DENGAN EMAIL + PASSWORD
--
-- Permintaan pemilik: layar pertama aplikasi adalah email + password, bukan
-- papan angka PIN. PIN TETAP ADA dan tetap dipakai untuk ganti kasir antar
-- shift — mengetik email dan password tiap pergantian orang terlalu lambat
-- di meja kasir saat ramai, dan yang lambat akan dicari jalan pintasnya.
--
-- YANG SENGAJA TIDAK DILAKUKAN: tidak ada password bawaan untuk siapa pun.
-- Sebelum pemilik mengisikannya, staf tetap masuk dengan PIN seperti biasa.
-- Kalau di sini dibuatkan password awal yang bisa ditebak, satu malam saja
-- sudah cukup untuk membuat seluruh pengaman PIN tidak ada artinya.
--
-- Jalankan di SQL Editor Supabase. Aman diulang.
-- ═══════════════════════════════════════════════════════════════════

alter table public.staff_pins add column if not exists password_hash text;

-- ── Pemilik mengatur password staf ─────────────────────────────────
-- pgcrypto tinggal di skema `extensions`, BUKAN public. Tanpa search_path di
-- bawah ini, gen_salt() gagal dengan "function gen_salt(unknown) does not
-- exist" — jebakan yang sudah dua kali memakan korban di proyek ini.
create or replace function public.set_staff_password(p_token text, p_id text, p_password text)
returns text
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then
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

grant execute on function public.set_staff_password(text, text, text) to anon, authenticated;

-- ── Masuk dengan email + password ──────────────────────────────────
-- Mengembalikan bentuk yang SAMA PERSIS dengan `staff_login` (PIN), supaya
-- klien tidak perlu dua jalur penanganan sesi.
create or replace function public.staff_login_password(p_email text, p_password text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $fn$
declare v_row public.staff_pins; v_token text; v_gagal int; v_email text;
begin
  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'alasan', 'Email dan password harus diisi');
  end if;

  -- Rem yang sama dengan PIN: 20 percobaan gagal dalam 10 menit → tunggu.
  select count(*) into v_gagal from public.pin_attempts
   where not berhasil and at > now() - interval '10 minutes';
  if v_gagal >= 20 then
    return jsonb_build_object('ok', false, 'alasan', 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.');
  end if;

  select * into v_row from public.staff_pins
   where aktif and lower(email) = v_email and password_hash is not null limit 1;

  -- SENGAJA satu pesan untuk email tidak dikenal MAUPUN password salah: kalau
  -- dibedakan, siapa pun bisa memakai layar ini untuk memastikan email mana
  -- yang terdaftar sebagai staf.
  if not found or v_row.password_hash <> crypt(p_password, v_row.password_hash) then
    insert into public.pin_attempts (berhasil) values (false);
    return jsonb_build_object('ok', false, 'alasan', 'Email atau password salah');
  end if;

  insert into public.pin_attempts (berhasil) values (true);
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.staff_sessions (token, staff_id, expires_at)
  values (v_token, v_row.staff_id, now() + interval '12 hours');
  delete from public.staff_sessions where expires_at < now();

  return jsonb_build_object(
    'ok', true, 'token', v_token, 'staffId', v_row.staff_id,
    'nama', v_row.nama, 'peran', v_row.peran,
    'berlakuSampai', (extract(epoch from (now() + interval '12 hours')) * 1000)::bigint
  );
end $fn$;

grant execute on function public.staff_login_password(text, text) to anon, authenticated;

-- Siapa saja yang sudah punya password — dipakai layar Atur untuk menandainya.
-- Hanya mengembalikan penanda ya/tidak, bukan hash-nya.
drop function if exists public.staf_punya_sandi(text);
create or replace function public.staf_punya_sandi(p_token text)
returns table (staff_id text, ada boolean)
language plpgsql security definer set search_path = public as $fn$
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then return; end if;
  return query select s.staff_id, s.password_hash is not null from public.staff_pins s;
end $fn$;

grant execute on function public.staf_punya_sandi(text) to anon, authenticated;

select 'masuk dengan email + password terpasang' as hasil;
