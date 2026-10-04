-- ═══════════════════════════════════════════════════════════════════
-- SPL — AKUN MEMBER TAMU (tahap M)
-- Tempel ke SQL Editor project spl-venue, lalu Run. Aman dijalankan ulang.
--
-- Permintaan pemilik: sebelum booking diproses, tamu harus DAFTAR atau MASUK,
-- supaya data membernya menjadi milik venue dan bisa dipakai blast promo.
--
-- Aturan mainnya tetap sama dengan schema-tamu.sql:
--   • HP pelanggan hanya boleh menyentuh akunnya SENDIRI (lewat token sesinya).
--   • Daftar member seutuhnya hanya bisa dibaca perangkat staf (sesi PIN).
--   • Tidak ada kata sandi yang disimpan apa adanya — PIN di-hash bcrypt.
-- ═══════════════════════════════════════════════════════════════════
-- pgcrypto di Supabase terpasang di skema `extensions`, bukan `public`; setiap
-- fungsi yang memakai crypt()/gen_salt() WAJIB menyertakannya di search_path.
create extension if not exists pgcrypto;

create table if not exists public.members (
  phone        text primary key,                       -- sudah dirapikan: 62xxxxxxxxxx
  nama         text not null,
  email        text,
  pin_hash     text not null,                          -- PIN 6 angka pilihan tamu (bcrypt)
  setuju_promo boolean not null default false,         -- izin dikirimi promo (UU PDP)
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  gagal        int not null default 0,                 -- PIN salah beruntun
  locked_until timestamptz                             -- direm sementara sesudah 5 kali salah
);

create table if not exists public.member_sessions (
  token      text primary key,
  phone      text not null references public.members(phone) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists member_sessions_phone_idx on public.member_sessions (phone);

alter table public.members         enable row level security;
alter table public.member_sessions enable row level security;
revoke all on public.members, public.member_sessions from anon, authenticated;

-- ── Bantuan kecil ──────────────────────────────────────────────────
/** 0812… → 62812…, sama dengan rapikanHp() di aplikasi, supaya satu orang satu baris. */
create or replace function public.rapikan_hp(p_hp text)
returns text
language plpgsql immutable set search_path = public as $$
declare v text;
begin
  v := regexp_replace(coalesce(p_hp, ''), '[^0-9+]', '', 'g');
  v := ltrim(v, '+');
  if v = '' then return ''; end if;
  if left(v, 2) = '62' then return v; end if;
  if left(v, 1) = '0'  then return '62' || substr(v, 2); end if;
  if left(v, 1) = '8'  then return '62' || v; end if;
  return v;
end $$;

/** Siapa pemilik token member ini? null kalau kedaluwarsa/tidak dikenal. */
create or replace function public.member_of(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if p_token is null or length(p_token) <> 64 then return null; end if;
  update public.member_sessions set expires_at = greatest(expires_at, now() + interval '30 days')
   where token = p_token and expires_at > now()
   returning phone into v;
  if v is not null then update public.members set last_seen = now() where phone = v; end if;
  return v;
end $$;

create or replace function public.member_profil(p_phone text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  select * into m from public.members where phone = p_phone;
  if not found then return null; end if;
  return jsonb_build_object('hp', m.phone, 'nama', m.nama, 'email', coalesce(m.email, ''),
                            'setuju', m.setuju_promo,
                            'sejak', (extract(epoch from m.created_at) * 1000)::bigint);
end $$;

-- ═══ Daftar ════════════════════════════════════════════════════════
create or replace function public.member_daftar(
  p_hp text, p_nama text, p_pin text, p_email text default null, p_setuju boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_hp text; v_token text; v_baru int;
begin
  v_hp := public.rapikan_hp(p_hp);
  if length(v_hp) < 9 or length(v_hp) > 15 then
    return jsonb_build_object('ok', false, 'alasan', 'Nomor HP tidak sah');
  end if;
  if coalesce(trim(p_nama), '') = '' then
    return jsonb_build_object('ok', false, 'alasan', 'Nama wajib diisi');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'alasan', 'PIN harus 6 angka');
  end if;
  if coalesce(p_email, '') <> '' and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'alasan', 'Email tidak sah');
  end if;
  -- Pagar: maksimal 30 pendaftaran per jam untuk seluruh venue.
  select count(*) into v_baru from public.members where created_at > now() - interval '1 hour';
  if v_baru >= 30 then
    return jsonb_build_object('ok', false, 'alasan', 'Pendaftaran sedang ramai, coba beberapa menit lagi');
  end if;
  if exists (select 1 from public.members where phone = v_hp) then
    return jsonb_build_object('ok', false, 'alasan', 'Nomor ini sudah terdaftar — silakan masuk');
  end if;

  insert into public.members (phone, nama, email, pin_hash, setuju_promo)
  values (v_hp, trim(p_nama), nullif(trim(coalesce(p_email, '')), ''), crypt(p_pin, gen_salt('bf')), coalesce(p_setuju, false));

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.member_sessions (token, phone, expires_at) values (v_token, v_hp, now() + interval '30 days');
  delete from public.member_sessions where expires_at < now();
  return jsonb_build_object('ok', true, 'token', v_token, 'profil', public.member_profil(v_hp));
end $$;

-- ═══ Masuk ═════════════════════════════════════════════════════════
create or replace function public.member_masuk(p_hp text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; v_hp text; v_token text;
begin
  v_hp := public.rapikan_hp(p_hp);
  select * into m from public.members where phone = v_hp;
  if not found then
    return jsonb_build_object('ok', false, 'alasan', 'Nomor atau PIN salah');
  end if;
  if m.locked_until is not null and m.locked_until > now() then
    return jsonb_build_object('ok', false, 'alasan', 'Terlalu banyak PIN salah. Coba lagi 15 menit lagi.');
  end if;
  if p_pin is null or m.pin_hash <> crypt(p_pin, m.pin_hash) then
    update public.members
       set gagal = gagal + 1,
           locked_until = case when gagal + 1 >= 5 then now() + interval '15 minutes' else null end
     where phone = v_hp;
    return jsonb_build_object('ok', false, 'alasan', 'Nomor atau PIN salah');
  end if;

  update public.members set gagal = 0, locked_until = null, last_seen = now() where phone = v_hp;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.member_sessions (token, phone, expires_at) values (v_token, v_hp, now() + interval '30 days');
  delete from public.member_sessions where expires_at < now();
  return jsonb_build_object('ok', true, 'token', v_token, 'profil', public.member_profil(v_hp));
end $$;

-- ═══ Akun sendiri ══════════════════════════════════════════════════
create or replace function public.member_saya(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hp text;
begin
  v_hp := public.member_of(p_token);
  if v_hp is null then return null; end if;
  return public.member_profil(v_hp);
end $$;

create or replace function public.member_ubah(
  p_token text, p_nama text default null, p_email text default null, p_setuju boolean default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hp text;
begin
  v_hp := public.member_of(p_token);
  if v_hp is null then return jsonb_build_object('ok', false, 'alasan', 'Sesi habis, silakan masuk lagi'); end if;
  if coalesce(p_email, '') <> '' and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'alasan', 'Email tidak sah');
  end if;
  update public.members
     set nama         = coalesce(nullif(trim(coalesce(p_nama, '')), ''), nama),
         email        = case when p_email is null then email else nullif(trim(p_email), '') end,
         setuju_promo = coalesce(p_setuju, setuju_promo)
   where phone = v_hp;
  return jsonb_build_object('ok', true, 'profil', public.member_profil(v_hp));
end $$;

create or replace function public.member_ganti_pin(p_token text, p_lama text, p_baru text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_hp text; m public.members;
begin
  v_hp := public.member_of(p_token);
  if v_hp is null then return jsonb_build_object('ok', false, 'alasan', 'Sesi habis, silakan masuk lagi'); end if;
  select * into m from public.members where phone = v_hp;
  if p_lama is null or m.pin_hash <> crypt(p_lama, m.pin_hash) then
    return jsonb_build_object('ok', false, 'alasan', 'PIN lama salah');
  end if;
  if p_baru is null or p_baru !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'alasan', 'PIN baru harus 6 angka');
  end if;
  update public.members set pin_hash = crypt(p_baru, gen_salt('bf')), gagal = 0, locked_until = null where phone = v_hp;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.member_keluar(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.member_sessions where token = p_token;
end $$;

create table if not exists public.member_bookings (
  phone      text not null references public.members(phone) on delete cascade,
  code       text not null,
  ref_id     text not null,
  kind       text not null default 'booking',
  created_at timestamptz not null default now(),
  primary key (phone, code)
);
create index if not exists member_bookings_phone_idx on public.member_bookings (phone, created_at desc);
alter table public.member_bookings enable row level security;
revoke all on public.member_bookings from anon, authenticated;

-- ═══ Pintu aksi tamu dengan identitas member ═══════════════════════
-- `hold` (booking) WAJIB membawa token member: itu inti permintaan pemilik.
-- Nama & nomor HP di dalam aksinya DITIMPA dengan data member yang terdaftar,
-- jadi tidak bisa dipalsukan dari HP.
drop function if exists public.guest_action(text, jsonb, text);
create or replace function public.guest_action(p_id text, p_act jsonb, p_member text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_hp text; m public.members; v_act jsonb; v_jenis text;
  v_kode text; v_ref text; v_kind text;
begin
  v_act := p_act;
  v_jenis := coalesce(p_act->>'t', '');
  if p_member is not null and p_member <> '' then
    v_hp := public.member_of(p_member);
    if v_hp is null then
      raise exception 'sesi member habis, silakan masuk lagi' using errcode = '42501';
    end if;
    select * into m from public.members where phone = v_hp;
    -- Identitas resmi member yang dipakai, bukan yang diketik di layar.
    if v_jenis = 'hold' and jsonb_typeof(p_act->'session') = 'object' then
      v_kode := p_act->'session'->>'bookingCode';
      v_ref := coalesce(p_act->'session'->>'id', 'o-' || coalesce(v_kode, ''));
      v_kind := 'booking';
      v_act := jsonb_set(v_act, '{session,guest}', to_jsonb(m.nama));
      v_act := jsonb_set(v_act, '{session,phone}', to_jsonb(m.phone));
    elsif v_jenis = 'guestOrder' and jsonb_typeof(p_act->'order') = 'object' then
      v_kode := p_act->'order'->>'code';
      v_ref := coalesce(p_act->'order'->>'id', 'g-' || coalesce(v_kode, ''));
      v_kind := 'pesanan';
      v_act := jsonb_set(v_act, '{order,guest}', to_jsonb(m.nama));
      v_act := jsonb_set(v_act, '{order,phone}', to_jsonb(m.phone));
    elsif v_jenis = 'reserveResto' and jsonb_typeof(p_act->'res') = 'object' then
      v_kode := p_act->'res'->>'code';
      v_ref := coalesce(p_act->'res'->>'id', 'r-' || coalesce(v_kode, ''));
      v_kind := 'booking';
      v_act := jsonb_set(v_act, '{res,guest}', to_jsonb(m.nama));
      v_act := jsonb_set(v_act, '{res,phone}', to_jsonb(m.phone));
    end if;

    if v_kode is not null and v_kode <> '' then
      insert into public.member_bookings (phone, code, ref_id, kind)
      values (v_hp, v_kode, v_ref, coalesce(v_kind, 'booking'))
      on conflict (phone, code) do update set created_at = now();
    end if;
  elsif v_jenis = 'hold' then
    raise exception 'booking harus lewat akun member: daftar atau masuk dulu' using errcode = '42501';
  end if;
  return public.guest_action(p_id, v_act);
end $$;

-- ═══ Ambil riwayat booking & pesanan milik member yang login ═══════
create or replace function public.member_bookings(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hp text;
  v_res jsonb;
begin
  v_hp := public.member_of(p_token);
  if v_hp is null then return '[]'::jsonb; end if;

  with daftar as (
    select mb.code, mb.ref_id, mb.kind, mb.created_at
      from public.member_bookings mb
     where mb.phone = v_hp
    union
    select ps.code,
           case when ps.data->>'kind' = 'pesanan' then 'g-' || ps.code else 'o-' || ps.code end as ref_id,
           coalesce(ps.data->>'kind', 'booking') as kind,
           ps.updated_at as created_at
      from public.public_status ps
     where ps.data->'session'->>'phone' = v_hp
        or ps.data->'order'->>'phone' = v_hp
        or ps.data->'session'->>'phone' = public.rapikan_hp(v_hp)
        or ps.data->'order'->>'phone' = public.rapikan_hp(v_hp)
    union
    select pc.kode as code,
           pc.ref as ref_id,
           case when pc.act->>'t' = 'guestOrder' then 'pesanan' else 'booking' end as kind,
           pc.created_at
      from public.payment_charges pc
     where (pc.act->'session'->>'phone' = v_hp or pc.act->'order'->>'phone' = v_hp
            or pc.act->'session'->>'phone' = public.rapikan_hp(v_hp) or pc.act->'order'->>'phone' = public.rapikan_hp(v_hp))
       and pc.status in ('lunas', 'menunggu')
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code', d.code,
      'refId', d.ref_id,
      'kind', d.kind,
      'createdAt', (extract(epoch from d.created_at) * 1000)::bigint,
      'status', ps.data
    ) order by d.created_at desc
  ), '[]'::jsonb) into v_res
  from (
    select code, max(ref_id) as ref_id, max(kind) as kind, max(created_at) as created_at
      from daftar
     where code is not null and code <> ''
     group by code
  ) d
  left join public.public_status ps on ps.code = d.code;

  return v_res;
end $$;

-- ═══ Panel staf: daftar member + blast promo ═══════════════════════
drop function if exists public.fetch_members(text, text, int);
create or replace function public.fetch_members(p_token text, p_cari text default null, p_limit int default 500)
returns table (
  phone text, nama text, email text, setuju_promo boolean,
  sejak_ms bigint, terakhir_ms bigint, kunjungan int, belanja bigint
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
           coalesce(v.total, 0)::bigint as belanja
      from public.members m
      left join (
        select cv.phone, count(*) as n, sum(cv.amount) as total
          from public.customer_visits cv group by cv.phone
      ) v on v.phone = m.phone
     where p_cari is null or p_cari = ''
        or m.phone ilike '%' || p_cari || '%'
        or m.nama  ilike '%' || p_cari || '%'
        or coalesce(m.email, '') ilike '%' || p_cari || '%'
     order by m.last_seen desc
     limit least(coalesce(p_limit, 500), 5000);
end $$;

/** Tamu lupa PIN: kasir memberi PIN sementara 6 angka (dibacakan ke tamunya). */
create or replace function public.member_reset_pin(p_token text, p_hp text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_staff text; v_hp text; v_pin text;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then raise exception 'sesi tidak sah' using errcode = '42501'; end if;
  v_hp := public.rapikan_hp(p_hp);
  if not exists (select 1 from public.members where phone = v_hp) then
    return jsonb_build_object('ok', false, 'alasan', 'Nomor tidak terdaftar');
  end if;
  v_pin := lpad(floor(random() * 1000000)::text, 6, '0');
  update public.members
     set pin_hash = crypt(v_pin, gen_salt('bf')), gagal = 0, locked_until = null
   where phone = v_hp;
  delete from public.member_sessions where phone = v_hp;      -- sesi lama diputus
  return jsonb_build_object('ok', true, 'pin', v_pin);
end $$;

/** Hak dilupakan (UU PDP): akun member dihapus. Riwayat kunjungan dihapus terpisah. */
create or replace function public.forget_member(p_token text, p_hp text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_staff text; v_n int;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then raise exception 'sesi tidak sah' using errcode = '42501'; end if;
  delete from public.members where phone = public.rapikan_hp(p_hp);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.rapikan_hp(text)                                    to anon, authenticated;
grant execute on function public.member_daftar(text, text, text, text, boolean)      to anon, authenticated;
grant execute on function public.member_masuk(text, text)                            to anon, authenticated;
grant execute on function public.member_saya(text)                                   to anon, authenticated;
grant execute on function public.member_ubah(text, text, text, boolean)              to anon, authenticated;
grant execute on function public.member_ganti_pin(text, text, text)                  to anon, authenticated;
grant execute on function public.member_keluar(text)                                 to anon, authenticated;
grant execute on function public.member_bookings(text)                               to anon, authenticated;
grant execute on function public.guest_action(text, jsonb, text)                     to anon, authenticated;
grant execute on function public.fetch_members(text, text, int)                      to anon, authenticated;
grant execute on function public.member_reset_pin(text, text)                        to anon, authenticated;
grant execute on function public.forget_member(text, text)                           to anon, authenticated;
-- Pembantu INTERNAL: tidak boleh dipanggil langsung dari HP pelanggan.
-- Postgres memberi EXECUTE ke PUBLIC secara bawaan, jadi mencabut dari
-- anon/authenticated saja TIDAK cukup — `public` harus ikut dicabut.
-- (Tanpa ini, siapa pun yang punya anon key bisa memanggil member_profil
--  dengan nomor HP orang lain dan membaca nama & emailnya.)
revoke execute on function public.member_of(text)     from public, anon, authenticated;
revoke execute on function public.member_profil(text) from public, anon, authenticated;
-- ═══════════════════════════════════════════════════════════════════
-- SPL — DAFTAR / MASUK MEMBER DENGAN AKUN GOOGLE (Gmail)
-- Tambahan untuk schema-member.sql. Aman dijalankan ulang.
--
-- Tamu menekan "Lanjut dengan Google" → Supabase Auth memverifikasi Gmail-nya →
-- aplikasi memanggil `member_google` dengan JWT hasil login itu. Nama & email
-- diambil dari JWT (tidak bisa dipalsukan dari layar); yang masih ditanyakan
-- hanya nomor HP, karena kasir tetap perlu bisa menelepon tamunya.
--
-- Aturan keamanan yang dijaga di sini:
--   • Pencocokan akun HANYA lewat auth_uid. Nomor HP / email yang diketik
--     TIDAK pernah dipakai untuk mengambil alih akun member yang sudah ada.
--   • Kalau nomornya sudah terdaftar (punya PIN), Google TIDAK bisa merebutnya.
--     Pemiliknya harus masuk dengan PIN lalu menautkan sendiri (member_tautkan_google).
-- ═══════════════════════════════════════════════════════════════════

alter table public.members add column if not exists auth_uid uuid;
-- Member Google tidak punya PIN.
alter table public.members alter column pin_hash drop not null;
create unique index if not exists members_auth_uid_idx on public.members (auth_uid) where auth_uid is not null;

create or replace function public.member_google(p_hp text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; v_email text; v_nama text; m public.members; v_hp text; v_token text; v_ada public.members;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'alasan', 'Sesi Google tidak terbaca. Coba masuk lagi.');
  end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_nama := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Tamu');

  -- Sudah pernah masuk dengan Google ini → langsung berikan sesi member.
  select * into m from public.members where auth_uid = v_uid;

  if not found then
    v_hp := public.rapikan_hp(p_hp);
    if length(v_hp) < 9 or length(v_hp) > 15 then
      -- Butuh nomor HP dulu; layar akan menanyakannya sekali.
      return jsonb_build_object('ok', false, 'perluHp', true, 'nama', v_nama, 'email', v_email);
    end if;
    select * into v_ada from public.members where phone = v_hp;
    if found then
      return jsonb_build_object('ok', false, 'alasan',
        'Nomor ini sudah terdaftar. Masuk dengan PIN dulu, lalu tautkan Google di halaman Akun.');
    end if;
    insert into public.members (phone, nama, email, pin_hash, setuju_promo, auth_uid)
    values (v_hp, v_nama, nullif(v_email, ''), null, true, v_uid)
    returning * into m;
  else
    -- Nama/email terbaru dari Google dipakai kalau kolomnya masih kosong.
    update public.members
       set email = coalesce(nullif(email, ''), nullif(v_email, '')),
           nama = coalesce(nullif(nama, ''), v_nama),
           last_seen = now()
     where phone = m.phone
     returning * into m;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.member_sessions (token, phone, expires_at) values (v_token, m.phone, now() + interval '30 days');
  delete from public.member_sessions where expires_at < now();
  return jsonb_build_object('ok', true, 'token', v_token, 'profil', public.member_profil(m.phone));
end $$;

/** Member yang sudah masuk dengan PIN menautkan akun Google-nya sendiri. */
create or replace function public.member_tautkan_google(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid; v_hp text; v_email text;
begin
  v_uid := auth.uid();
  v_hp := public.member_of(p_token);
  if v_uid is null then return jsonb_build_object('ok', false, 'alasan', 'Belum masuk Google'); end if;
  if v_hp is null then return jsonb_build_object('ok', false, 'alasan', 'Sesi member habis, masuk lagi'); end if;
  if exists (select 1 from public.members where auth_uid = v_uid and phone <> v_hp) then
    return jsonb_build_object('ok', false, 'alasan', 'Akun Google ini sudah dipakai member lain');
  end if;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  update public.members
     set auth_uid = v_uid, email = coalesce(nullif(email, ''), nullif(v_email, ''))
   where phone = v_hp;
  return jsonb_build_object('ok', true, 'profil', public.member_profil(v_hp));
end $$;

-- Hanya pengguna yang SUDAH login Google (peran `authenticated`) yang boleh memanggilnya.
revoke execute on function public.member_google(text)         from public, anon;
revoke execute on function public.member_tautkan_google(text) from public, anon;
grant  execute on function public.member_google(text)         to authenticated;
grant  execute on function public.member_tautkan_google(text) to authenticated;

