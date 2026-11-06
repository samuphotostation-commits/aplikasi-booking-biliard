-- ═══════════════════════════════════════════════════════════════════
-- SPL — DATA TAMBAHAN MEMBER: TANGGAL LAHIR DAN DOMISILI
-- Jalankan SESUDAH schema-gmail.sql. Aman dijalankan ulang.
--
-- Domisili sengaja tingkat kecamatan, bukan alamat lengkap. Member lama tidak
-- dipaksa: kolomnya kosong sampai mereka mengisinya di halaman Akun.
-- ═══════════════════════════════════════════════════════════════════

alter table public.members add column if not exists tgl_lahir date;
alter table public.members add column if not exists domisili text;

create or replace function public.member_profil(p_phone text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  select * into m from public.members where phone = p_phone;
  if not found then return null; end if;
  return jsonb_build_object('hp', m.phone, 'nama', m.nama, 'email', coalesce(m.email, ''),
                            'setuju', m.setuju_promo,
                            'sejak', (extract(epoch from m.created_at) * 1000)::bigint,
                            'lahir', coalesce(m.tgl_lahir::text, ''),
                            'domisili', coalesce(m.domisili, ''));
end $$;
revoke execute on function public.member_profil(text) from public, anon, authenticated;

drop function if exists public.member_google(text);
create or replace function public.member_google(
  p_hp text default null, p_lahir date default null, p_domisili text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; v_email text; v_nama text; m public.members; v_hp text; v_token text; v_ada public.members; v_dom text;
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
  v_dom := left(nullif(trim(coalesce(p_domisili, '')), ''), 80);

  select * into m from public.members where auth_uid = v_uid;

  if not found then
    v_hp := public.rapikan_hp(p_hp);
    if v_hp !~ '^62[1-9][0-9]{7,13}$' or v_dom is null
       or p_lahir is null or age(p_lahir) not between interval '10 years' and interval '100 years' then
      return jsonb_build_object('ok', false, 'perluHp', true, 'nama', v_nama, 'email', v_email);
    end if;
    select * into v_ada from public.members where phone = v_hp;
    if found then
      if v_ada.auth_uid is not null or lower(coalesce(v_ada.email, '')) <> v_email then
        return jsonb_build_object('ok', false, 'alasan',
          'Nomor ini sudah dipakai akun lain. Hubungi kasir SPL kalau ini nomor kamu.');
      end if;
      update public.members
         set auth_uid = v_uid, email = v_email, tgl_lahir = p_lahir, domisili = v_dom, last_seen = now()
       where phone = v_hp returning * into m;
    else
      insert into public.members (phone, nama, email, pin_hash, setuju_promo, auth_uid, tgl_lahir, domisili)
      values (v_hp, v_nama, v_email, null, true, v_uid, p_lahir, v_dom)
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
revoke execute on function public.member_google(text, date, text) from public, anon;
grant  execute on function public.member_google(text, date, text) to authenticated;

drop function if exists public.member_ubah(text, text, text, boolean);
create or replace function public.member_ubah(
  p_token text, p_nama text default null, p_setuju boolean default null,
  p_lahir date default null, p_domisili text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hp text;
begin
  v_hp := public.member_of(p_token);
  if v_hp is null then return jsonb_build_object('ok', false, 'alasan', 'Sesi habis, silakan masuk lagi'); end if;
  if p_lahir is not null and age(p_lahir) not between interval '10 years' and interval '100 years' then
    return jsonb_build_object('ok', false, 'alasan', 'Tanggal lahir tidak sah');
  end if;
  update public.members
     set nama         = coalesce(nullif(trim(coalesce(p_nama, '')), ''), nama),
         setuju_promo = coalesce(p_setuju, setuju_promo),
         tgl_lahir    = coalesce(p_lahir, tgl_lahir),
         domisili     = coalesce(left(nullif(trim(coalesce(p_domisili, '')), ''), 80), domisili)
   where phone = v_hp;
  return jsonb_build_object('ok', true, 'profil', public.member_profil(v_hp));
end $$;
grant execute on function public.member_ubah(text, text, boolean, date, text) to anon, authenticated;

drop function if exists public.fetch_members(text, text, int);
create or replace function public.fetch_members(p_token text, p_cari text default null, p_limit int default 500)
returns table (
  phone text, nama text, email text, setuju_promo boolean,
  sejak_ms bigint, terakhir_ms bigint, kunjungan int, belanja bigint,
  lahir text, domisili text
)
language plpgsql security definer set search_path = public as $$
declare v_staff text;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then raise exception 'sesi tidak sah' using errcode = '42501'; end if;
  return query
    select m.phone, m.nama, coalesce(m.email, '') as email, m.setuju_promo,
           (extract(epoch from m.created_at) * 1000)::bigint as sejak_ms,
           (extract(epoch from m.last_seen) * 1000)::bigint as terakhir_ms,
           coalesce(v.n, 0)::int as kunjungan,
           coalesce(v.total, 0)::bigint as belanja,
           coalesce(m.tgl_lahir::text, '') as lahir,
           coalesce(m.domisili, '') as domisili
      from public.members m
      left join (
        select cv.phone, count(*) as n, sum(cv.amount) as total
          from public.customer_visits cv group by cv.phone
      ) v on v.phone = m.phone
     where p_cari is null or p_cari = ''
        or m.phone ilike '%' || p_cari || '%'
        or m.nama  ilike '%' || p_cari || '%'
        or coalesce(m.email, '') ilike '%' || p_cari || '%'
        or coalesce(m.domisili, '') ilike '%' || p_cari || '%'
     order by m.last_seen desc
     limit least(coalesce(p_limit, 500), 5000);
end $$;
grant execute on function public.fetch_members(text, text, int) to anon, authenticated;

select 'data member terpasang' as hasil;
