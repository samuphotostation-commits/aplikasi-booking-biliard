-- ═══════════════════════════════════════════════════════════════════
-- SPL — SEMUA AKUN WAJIB GMAIL TERVERIFIKASI
-- Jalankan SESUDAH schema-member.sql, schema-email.sql, dan schema-sandi.sql.
-- Aman dijalankan ulang.
--
-- Permintaan pemilik 6 Nov 2026: email gadungan tidak boleh bisa punya akun.
--
--   • MEMBER  hanya bisa dibuat lewat Google, dan WAJIB mengisi nomor HP.
--             Emailnya selalu milik Google, tidak bisa diketik atau diganti.
--   • STAF    masuk pertama lewat Google memakai Gmail yang ditautkan pemilik.
--             PIN tetap ada untuk ganti shift, tapi hanya berlaku sesudah
--             Gmail orang itu terbukti sekali.
--
-- Bukti Gmail hanya diambil dari app_metadata di JWT. user_metadata SENGAJA
-- tidak dipakai: isinya bisa diubah sendiri oleh pemilik sesi.
-- ═══════════════════════════════════════════════════════════════════

alter table public.staff_pins add column if not exists gmail_terverifikasi timestamptz;

/** Email sesi ini kalau akunnya benar-benar dari Google; selain itu null. */
create or replace function public.email_google()
returns text
language sql stable set search_path = public as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
      or auth.jwt() -> 'app_metadata' ->> 'provider' = 'google'
    then nullif(lower(auth.jwt() ->> 'email'), '')
  end
$$;
revoke execute on function public.email_google() from public, anon, authenticated;

-- ═══ Member: Google + nomor HP ═════════════════════════════════════
create or replace function public.member_google(p_hp text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; v_email text; v_nama text; m public.members; v_hp text; v_token text; v_ada public.members;
begin
  v_uid := auth.uid();
  v_email := public.email_google();
  if v_uid is null or v_email is null then
    return jsonb_build_object('ok', false, 'alasan', 'Sesi Google tidak terbaca. Coba masuk lagi.');
  end if;
  v_nama := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    split_part(v_email, '@', 1));

  select * into m from public.members where auth_uid = v_uid;

  if not found then
    v_hp := public.rapikan_hp(p_hp);
    if v_hp !~ '^62[1-9][0-9]{7,13}$' then
      return jsonb_build_object('ok', false, 'perluHp', true, 'nama', v_nama, 'email', v_email);
    end if;
    select * into v_ada from public.members where phone = v_hp;
    if found then
      -- Akun lama boleh diklaim HANYA oleh pemilik Gmail yang sama persis.
      if v_ada.auth_uid is not null or lower(coalesce(v_ada.email, '')) <> v_email then
        return jsonb_build_object('ok', false, 'alasan',
          'Nomor ini sudah dipakai akun lain. Hubungi kasir SPL kalau ini nomor kamu.');
      end if;
      update public.members set auth_uid = v_uid, email = v_email, last_seen = now()
       where phone = v_hp returning * into m;
    else
      insert into public.members (phone, nama, email, pin_hash, setuju_promo, auth_uid)
      values (v_hp, v_nama, v_email, null, true, v_uid)
      returning * into m;
    end if;
  else
    update public.members
       set email = v_email, nama = coalesce(nullif(nama, ''), v_nama), last_seen = now()
     where phone = m.phone
     returning * into m;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.member_sessions (token, phone, expires_at) values (v_token, m.phone, now() + interval '30 days');
  delete from public.member_sessions where expires_at < now();
  return jsonb_build_object('ok', true, 'token', v_token, 'profil', public.member_profil(m.phone));
end $$;

-- Email tidak lagi bisa diubah dari layar: yang tersimpan selalu milik Google.
create or replace function public.member_ubah(
  p_token text, p_nama text default null, p_email text default null, p_setuju boolean default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hp text;
begin
  v_hp := public.member_of(p_token);
  if v_hp is null then return jsonb_build_object('ok', false, 'alasan', 'Sesi habis, silakan masuk lagi'); end if;
  update public.members
     set nama         = coalesce(nullif(trim(coalesce(p_nama, '')), ''), nama),
         setuju_promo = coalesce(p_setuju, setuju_promo)
   where phone = v_hp;
  return jsonb_build_object('ok', true, 'profil', public.member_profil(v_hp));
end $$;

-- Member lama tanpa Google diputus sesinya; mereka masuk lagi lewat Google.
delete from public.member_sessions s using public.members m
 where s.phone = m.phone and m.auth_uid is null;

-- ═══ Staf: Google membuktikan, PIN untuk ganti shift ═══════════════
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
  update public.staff_pins set gmail_terverifikasi = coalesce(gmail_terverifikasi, now())
   where staff_id = v_row.staff_id;

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

create or replace function public.staff_login(p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_row public.staff_pins; v_token text; v_gagal int;
begin
  if p_pin is null or length(p_pin) < 4 or length(p_pin) > 12 then
    return jsonb_build_object('ok', false, 'alasan', 'PIN tidak sah');
  end if;
  select count(*) into v_gagal from public.pin_attempts
   where not berhasil and at > now() - interval '10 minutes';
  if v_gagal >= 20 then
    return jsonb_build_object('ok', false, 'alasan', 'Terlalu banyak PIN salah. Coba lagi beberapa menit lagi.');
  end if;
  select * into v_row from public.staff_pins
   where aktif and pin_hash = crypt(p_pin, pin_hash) limit 1;
  if not found then
    insert into public.pin_attempts (berhasil) values (false);
    return jsonb_build_object('ok', false, 'alasan', 'PIN salah');
  end if;
  insert into public.pin_attempts (berhasil) values (true);
  if v_row.gmail_terverifikasi is null then
    return jsonb_build_object('ok', false, 'alasan',
      'Akun ini belum terhubung Gmail. Masuk dengan Google sekali dulu di kasir.sportspoollounge.com.');
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.staff_sessions (token, staff_id, expires_at)
  values (v_token, v_row.staff_id, now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', v_token, 'staffId', v_row.staff_id,
                            'nama', v_row.nama, 'peran', v_row.peran);
end $$;

-- Gmail diganti = bukti lama gugur, orang itu harus membuktikan yang baru.
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
  update public.staff_pins
     set gmail_terverifikasi = case when lower(coalesce(email, '')) = coalesce(v_email, '') then gmail_terverifikasi end,
         email = v_email, updated_at = now()
   where staff_id = p_id;
end $$;

/** Penanda untuk layar Atur: siapa yang Gmail-nya sudah terbukti. */
create or replace function public.staf_gmail_status(p_token text)
returns table (staff_id text, terbukti boolean)
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then return; end if;
  return query select s.staff_id, s.gmail_terverifikasi is not null from public.staff_pins s;
end $$;
grant execute on function public.staf_gmail_status(text) to anon, authenticated;

-- ═══ Pintu lama ditutup di server, bukan hanya disembunyikan di layar ══
revoke execute on function public.member_daftar(text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.member_masuk(text, text)                       from public, anon, authenticated;
revoke execute on function public.member_ganti_pin(text, text, text)             from public, anon, authenticated;
revoke execute on function public.member_reset_pin(text, text)                   from public, anon, authenticated;
revoke execute on function public.member_tautkan_google(text)                    from public, anon, authenticated;
revoke execute on function public.staff_login_password(text, text)               from public, anon, authenticated;
revoke execute on function public.set_staff_password(text, text, text)           from public, anon, authenticated;
revoke execute on function public.staf_punya_sandi(text)                         from public, anon, authenticated;
revoke execute on function public.email_staf_terdaftar(text)                     from public, anon, authenticated;

select 'semua akun wajib gmail terpasang' as hasil;
