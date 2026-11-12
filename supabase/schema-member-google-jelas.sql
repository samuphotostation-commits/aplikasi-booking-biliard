-- ═══════════════════════════════════════════════════════════════════
-- SPL — DAFTAR MEMBER LEWAT GOOGLE: ALASAN PENOLAKAN YANG JELAS
-- Jalankan SESUDAH schema-member-data.sql. Aman dijalankan ulang.
--
-- Laporan pemilik 7 Nov 2026: tamu sudah mengisi nomor HP, tanggal lahir, dan
-- domisili, tapi pendaftaran tidak lanjut dan datanya tidak tersimpan.
-- Versi lama menjawab "perluHp" tanpa menyebut isian mana yang ditolak, dan
-- layar tamu tidak menampilkan apa-apa. Versi ini selalu menyebut alasannya,
-- dan kalau nomor HP sudah dipakai, menyebut Gmail mana yang memakainya
-- (disamarkan) supaya tamu tahu harus masuk dengan akun yang mana.
-- ═══════════════════════════════════════════════════════════════════

-- "samuphotostation@gmail.com" jadi "sa•••@gmail.com".
create or replace function public.samarkan_email(p text)
returns text language sql immutable as $$
  select case
    when p is null or position('@' in p) = 0 then null
    else left(split_part(p, '@', 1), 2) || '•••@' || split_part(p, '@', 2)
  end;
$$;
revoke execute on function public.samarkan_email(text) from public, anon, authenticated;

create or replace function public.member_google(
  p_hp text default null, p_lahir date default null, p_domisili text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid; v_email text; v_nama text; m public.members; v_hp text; v_token text;
  v_ada public.members; v_dom text; v_isi boolean; v_kurang text;
begin
  v_uid := auth.uid();
  v_email := public.email_google();
  if v_uid is null or v_email is null then
    return jsonb_build_object('ok', false, 'sesiHabis', true,
      'alasan', 'Sesi Google sudah habis. Ketuk "Lanjut dengan Google" sekali lagi.');
  end if;
  v_nama := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    split_part(v_email, '@', 1));
  v_dom := left(nullif(trim(coalesce(p_domisili, '')), ''), 80);
  -- Panggilan pertama sesudah kembali dari Google tidak membawa isian apa pun.
  v_isi := p_hp is not null or p_lahir is not null or p_domisili is not null;

  select * into m from public.members where auth_uid = v_uid;

  if not found then
    v_hp := public.rapikan_hp(p_hp);
    v_kurang := case
      when v_hp !~ '^62[1-9][0-9]{7,13}$' then 'Nomor HP belum benar. Contoh: 0812 3456 7890.'
      when p_lahir is null then 'Tanggal lahir belum diisi.'
      when age(p_lahir) not between interval '10 years' and interval '100 years'
        then 'Tanggal lahir belum benar. Usia member antara 10 dan 100 tahun.'
      when v_dom is null then 'Domisili belum dipilih.'
    end;
    if v_kurang is not null then
      return jsonb_build_object('ok', false, 'perluHp', true, 'nama', v_nama, 'email', v_email,
                                'alasan', case when v_isi then v_kurang end);
    end if;

    select * into v_ada from public.members where phone = v_hp;
    if found then
      if v_ada.auth_uid is not null or lower(coalesce(v_ada.email, '')) <> v_email then
        return jsonb_build_object('ok', false, 'nomorTerpakai', true, 'alasan',
          case
            when nullif(v_ada.email, '') is not null then
              'Nomor ini sudah terdaftar dengan Gmail ' || public.samarkan_email(lower(v_ada.email))
              || '. Ketuk "Ganti akun Google" lalu pilih Gmail itu.'
            else
              'Nomor ini sudah terdaftar tanpa Gmail. Tunjukkan HP ini ke kasir SPL supaya akunnya disambungkan.'
          end);
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
    -- Sudah member: isian yang dikirim ikut melengkapi data yang masih kosong.
    update public.members
       set email     = v_email,
           nama      = coalesce(nullif(nama, ''), v_nama),
           tgl_lahir = coalesce(tgl_lahir, case when p_lahir is not null
                         and age(p_lahir) between interval '10 years' and interval '100 years' then p_lahir end),
           domisili  = coalesce(domisili, v_dom),
           last_seen = now()
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

-- Pemeriksaan: harus menjawab satu baris "member_google_siap = true".
select exists (
  select 1 from pg_proc where proname = 'samarkan_email' and pronamespace = 'public'::regnamespace
) as member_google_siap;
