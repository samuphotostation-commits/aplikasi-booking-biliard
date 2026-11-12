-- ═══════════════════════════════════════════════════════════════════
-- SPL — JADWAL ULANG GRATIS SEKALI + MASUK MEMBER DENGAN NOMOR HP & PIN
-- Jalankan SESUDAH schema-member-google-jelas.sql. Aman dijalankan ulang.
--
-- Keputusan pemilik 8 Nov 2026, dari panel 100 pembeli:
--   1. Booking yang sudah dibayar boleh dijadwal ulang SEKALI, gratis, paling
--      lambat 3 jam sebelum main, ke jadwal dalam 14 hari. Aturannya dijaga
--      mesin venue (engine.ts "jadwalUlang"); di sini hanya pintunya:
--      cuma pemilik booking itu yang boleh memindahnya.
--   2. Masuk member tidak wajib Google lagi: cukup nomor HP + PIN 6 angka.
--      Google tetap bisa dipakai sebagai pilihan.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Pintu aksi tamu: izinkan "jadwalUlang", hanya lewat akun member ──
create or replace function public.guest_action(p_id text, p_act jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_row    public.venue_events;
  v_at     bigint;
  v_world  bigint;
  v_jenis  text;
  v_baru   int;
begin
  if p_id is null or length(p_id) < 6 or length(p_id) > 128 then
    raise exception 'id kejadian tidak sah' using errcode = '22023';
  end if;
  if p_act is null or jsonb_typeof(p_act) <> 'object' then
    raise exception 'bentuk aksi tidak sah' using errcode = '22023';
  end if;
  v_jenis := coalesce(p_act->>'t', '');
  if v_jenis not in ('hold', 'releaseHold', 'guestOrder', 'reserveResto', 'jadwalUlang') then
    raise exception 'aksi % tidak diizinkan dari HP pelanggan', v_jenis using errcode = '42501';
  end if;
  if pg_column_size(p_act) > 16384 then
    raise exception 'aksi terlalu besar' using errcode = '22023';
  end if;
  -- Pesanan dari HP tidak boleh mengaku sudah dibayar: pembayaran hanya dari kasir/webhook.
  if v_jenis = 'guestOrder' and coalesce((p_act->'order'->>'paidOnline')::numeric, 0) <> 0 then
    raise exception 'pembayaran online belum tersedia' using errcode = '42501';
  end if;
  if v_jenis = 'guestOrder' and coalesce(p_act->'order'->>'pay', '') <> 'kasir' then
    raise exception 'pesanan dari HP harus bayar di kasir' using errcode = '42501';
  end if;
  -- Jadwal ulang: hanya lewat pintu member (yang sudah memeriksa pemilik booking),
  -- dan tidak pernah membawa uang. Selisih harga hanya ditulis server pembayaran.
  if v_jenis = 'jadwalUlang' and coalesce(current_setting('spl.member_hp', true), '') = '' then
    raise exception 'jadwal ulang harus lewat akun member' using errcode = '42501';
  end if;
  if v_jenis = 'jadwalUlang' and (p_act ? 'bayarTambah' or p_act ? 'bayarId') then
    raise exception 'selisih harga dibayar lewat QRIS' using errcode = '42501';
  end if;
  -- Reservasi resto wajib menyertakan nama & nomor HP yang bisa dihubungi.
  if v_jenis = 'reserveResto' and (
       coalesce(p_act->'res'->>'guest', '') = '' or
       length(regexp_replace(coalesce(p_act->'res'->>'phone', ''), '[^0-9]', '', 'g')) < 9
     ) then
    raise exception 'reservasi resto butuh nama dan nomor HP' using errcode = '22023';
  end if;

  -- Pagar sederhana: maksimal 120 aksi pelanggan per menit untuk seluruh venue.
  select count(*) into v_baru from public.venue_events
   where by_staff is null and created_at > now() - interval '1 minute';
  if v_baru > 120 then
    raise exception 'terlalu banyak permintaan, coba sebentar lagi' using errcode = '53400';
  end if;

  select * into v_row from public.venue_events where id = p_id;
  if found then return v_row.seq; end if;                 -- kirim ulang: tidak dobel

  select genesis_at into v_world from public.venue_world where one_row;
  perform pg_advisory_xact_lock(hashtext('spl:venue_events'));
  select greatest((extract(epoch from clock_timestamp()) * 1000)::bigint,
                  coalesce(max(at_ms), 0) + 1)
    into v_at from public.venue_events where genesis_at = v_world;

  insert into public.venue_events (id, at_ms, by_staff, act, genesis_at)
  values (p_id, v_at, null, p_act, v_world)
  returning * into v_row;
  return v_row.seq;
exception when unique_violation then
  select seq into v_at from public.venue_events where id = p_id;
  return v_at;
end $$;
grant execute on function public.guest_action(text, jsonb) to anon, authenticated;

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
    elsif v_jenis = 'jadwalUlang' then
      -- Hanya pemilik booking yang boleh memindahnya.
      if not exists (select 1 from public.member_bookings
                      where phone = v_hp and code = coalesce(p_act->>'code', '')) then
        raise exception 'booking ini bukan milik akunmu' using errcode = '42501';
      end if;
      perform set_config('spl.member_hp', v_hp, true);
    end if;

    if v_kode is not null and v_kode <> '' then
      insert into public.member_bookings (phone, code, ref_id, kind)
      values (v_hp, v_kode, v_ref, coalesce(v_kind, 'booking'))
      on conflict (phone, code) do update set created_at = now();
    end if;
  elsif v_jenis = 'hold' then
    raise exception 'booking harus lewat akun member: daftar atau masuk dulu' using errcode = '42501';
  elsif v_jenis = 'jadwalUlang' then
    raise exception 'jadwal ulang harus lewat akun member: masuk dulu' using errcode = '42501';
  end if;
  return public.guest_action(p_id, v_act);
end $$;
grant execute on function public.guest_action(text, jsonb, text) to anon, authenticated;

-- ── 2. Daftar dengan nomor HP + PIN ──────────────────────────────────
create or replace function public.member_daftar_hp(
  p_hp text, p_nama text, p_pin text, p_lahir date, p_domisili text, p_setuju boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_hp text; v_token text; v_baru int; v_ada public.members; v_dom text;
begin
  v_hp := public.rapikan_hp(p_hp);
  v_dom := left(nullif(trim(coalesce(p_domisili, '')), ''), 80);
  if v_hp !~ '^62[1-9][0-9]{7,13}$' then
    return jsonb_build_object('ok', false, 'alasan', 'Nomor HP belum benar. Contoh: 0812 3456 7890.');
  end if;
  if coalesce(trim(p_nama), '') = '' then
    return jsonb_build_object('ok', false, 'alasan', 'Nama wajib diisi.');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'alasan', 'PIN harus 6 angka.');
  end if;
  if p_lahir is null or age(p_lahir) not between interval '10 years' and interval '100 years' then
    return jsonb_build_object('ok', false, 'alasan', 'Tanggal lahir belum benar.');
  end if;
  if v_dom is null then
    return jsonb_build_object('ok', false, 'alasan', 'Domisili belum dipilih.');
  end if;
  -- Pagar: maksimal 30 pendaftaran per jam untuk seluruh venue.
  select count(*) into v_baru from public.members where created_at > now() - interval '1 hour';
  if v_baru >= 30 then
    return jsonb_build_object('ok', false, 'alasan', 'Pendaftaran sedang ramai, coba beberapa menit lagi.');
  end if;
  select * into v_ada from public.members where phone = v_hp;
  if found then
    if v_ada.pin_hash is null and nullif(v_ada.email, '') is not null then
      return jsonb_build_object('ok', false, 'alasan',
        'Nomor ini sudah terdaftar lewat Gmail ' || public.samarkan_email(lower(v_ada.email))
        || '. Masuk dengan Google, lalu buat PIN di halaman Akun.');
    end if;
    return jsonb_build_object('ok', false, 'alasan', 'Nomor ini sudah terdaftar. Silakan masuk dengan PIN.');
  end if;

  insert into public.members (phone, nama, email, pin_hash, setuju_promo, tgl_lahir, domisili)
  values (v_hp, left(trim(p_nama), 60), null, crypt(p_pin, gen_salt('bf')), coalesce(p_setuju, true), p_lahir, v_dom);

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.member_sessions (token, phone, expires_at) values (v_token, v_hp, now() + interval '30 days');
  delete from public.member_sessions where expires_at < now();
  return jsonb_build_object('ok', true, 'token', v_token, 'profil', public.member_profil(v_hp));
end $$;
revoke execute on function public.member_daftar_hp(text, text, text, date, text, boolean) from public;
grant  execute on function public.member_daftar_hp(text, text, text, date, text, boolean) to anon, authenticated;

-- ── 3. Masuk dengan nomor HP + PIN ───────────────────────────────────
-- Versi lama meloloskan akun TANPA PIN (akun Google) dengan PIN apa pun,
-- karena pembandingnya bernilai NULL. Sekarang akun tanpa PIN selalu ditolak.
create or replace function public.member_masuk(p_hp text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; v_hp text; v_token text;
begin
  v_hp := public.rapikan_hp(p_hp);
  select * into m from public.members where phone = v_hp;
  if not found then
    return jsonb_build_object('ok', false, 'alasan', 'Nomor atau PIN salah.');
  end if;
  if m.pin_hash is null then
    return jsonb_build_object('ok', false, 'alasan',
      'Nomor ini belum punya PIN karena didaftarkan lewat Google. Masuk dengan Google, lalu buat PIN di halaman Akun.');
  end if;
  if m.locked_until is not null and m.locked_until > now() then
    return jsonb_build_object('ok', false, 'alasan', 'Terlalu banyak PIN salah. Coba lagi 15 menit lagi.');
  end if;
  if p_pin is null or m.pin_hash is distinct from crypt(p_pin, m.pin_hash) then
    update public.members
       set gagal = gagal + 1,
           locked_until = case when gagal + 1 >= 5 then now() + interval '15 minutes' else null end
     where phone = v_hp;
    return jsonb_build_object('ok', false, 'alasan', 'Nomor atau PIN salah.');
  end if;

  update public.members set gagal = 0, locked_until = null, last_seen = now() where phone = v_hp;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.member_sessions (token, phone, expires_at) values (v_token, v_hp, now() + interval '30 days');
  delete from public.member_sessions where expires_at < now();
  return jsonb_build_object('ok', true, 'token', v_token, 'profil', public.member_profil(v_hp));
end $$;
grant execute on function public.member_masuk(text, text) to anon, authenticated;

-- ── 4. Buat / ganti PIN dari halaman Akun ────────────────────────────
-- Akun Google yang belum punya PIN boleh membuatnya tanpa PIN lama.
create or replace function public.member_ganti_pin(p_token text, p_lama text, p_baru text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_hp text; m public.members;
begin
  v_hp := public.member_of(p_token);
  if v_hp is null then return jsonb_build_object('ok', false, 'alasan', 'Sesi habis, silakan masuk lagi.'); end if;
  select * into m from public.members where phone = v_hp;
  if m.pin_hash is not null and (p_lama is null or m.pin_hash is distinct from crypt(p_lama, m.pin_hash)) then
    return jsonb_build_object('ok', false, 'alasan', 'PIN lama salah.');
  end if;
  if p_baru is null or p_baru !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'alasan', 'PIN baru harus 6 angka.');
  end if;
  update public.members set pin_hash = crypt(p_baru, gen_salt('bf')), gagal = 0, locked_until = null where phone = v_hp;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.member_ganti_pin(text, text, text) to anon, authenticated;

-- Lupa PIN: kasir/manajer mengatur ulang dari Daftar Member (butuh sesi staf).
grant execute on function public.member_reset_pin(text, text) to anon, authenticated;

-- Profil member memberi tahu apakah akunnya sudah punya PIN.
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
                            'domisili', coalesce(m.domisili, ''),
                            'punyaPin', m.pin_hash is not null);
end $$;
revoke execute on function public.member_profil(text) from public, anon, authenticated;

-- Pemeriksaan: harus menjawab satu baris "jadwal_ulang_siap = true".
select exists (
  select 1 from pg_proc where proname = 'member_daftar_hp' and pronamespace = 'public'::regnamespace
) as jadwal_ulang_siap;
