-- ═══════════════════════════════════════════════════════════════════
-- SPL — AKUN STAF DIKELOLA DARI APLIKASI (multi superadmin)
--        + reservasi meja resto dari HP tamu
--
-- Tempel ke SQL Editor project spl-venue, lalu Run. Aman dijalankan ulang.
--
-- Sesudah berkas ini dijalankan:
--   • Pemilik bisa menambah/menonaktifkan akun staf (termasuk superadmin
--     kedua, ketiga, …) dari tab Atur — PIN-nya ikut terdaftar di server,
--     jadi berlaku di semua perangkat, bukan hanya di perangkat itu.
--   • Hanya SUPERADMIN yang boleh mengelola akun. Peran dibaca dari sesi
--     PIN yang sedang dipakai, bukan dari isian perangkat.
--   • PIN tetap disimpan sebagai hash (tidak bisa dibaca balik).
--   • HP tamu boleh mengirim satu aksi baru: reservasi meja resto.
-- ═══════════════════════════════════════════════════════════════════

-- ═══ Peran pemilik sesi (dipakai penjaga di bawah) ═════════════════
create or replace function public.staff_role(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_id text; v_peran text;
begin
  v_id := public.staff_of(p_token);
  if v_id is null then return null; end if;
  select peran into v_peran from public.staff_pins where staff_id = v_id;
  return v_peran;
end $$;

-- ═══ Daftar akun staf (tanpa PIN) ══════════════════════════════════
create or replace function public.list_staff(p_token text)
returns table (staff_id text, nama text, peran text, aktif boolean)
language plpgsql security definer set search_path = public as $$
begin
  -- coalesce WAJIB: token asal-asalan membuat staff_role() bernilai NULL, dan
  -- "NULL <> 'superadmin'" bukan TRUE — penjaganya akan terlewati diam-diam.
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  return query select s.staff_id, s.nama, s.peran, s.aktif
                 from public.staff_pins s order by s.nama;
end $$;

-- ═══ Tambah / ubah akun staf ═══════════════════════════════════════
-- p_pin boleh null = jangan ubah PIN-nya (mis. hanya ganti peran/aktif).
create or replace function public.upsert_staff(
  p_token text, p_id text, p_nama text, p_peran text,
  p_pin text default null, p_aktif boolean default true
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_sisa int;
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  if p_id is null or length(p_id) < 2 or length(p_id) > 64 then
    raise exception 'id staf tidak sah' using errcode = '22023';
  end if;
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'nama staf kosong' using errcode = '22023';
  end if;
  if p_peran not in ('superadmin', 'karyawan') then
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

-- ═══ Hapus akun staf ═══════════════════════════════════════════════
create or replace function public.delete_staff(p_token text, p_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_sisa int;
begin
  if coalesce(public.staff_role(p_token), '') <> 'superadmin' then
    raise exception 'hanya superadmin' using errcode = '42501';
  end if;
  delete from public.staff_sessions where staff_id = p_id;
  delete from public.staff_pins where staff_id = p_id;
  select count(*) into v_sisa from public.staff_pins where aktif and peran = 'superadmin';
  if v_sisa = 0 then
    raise exception 'harus ada minimal satu superadmin aktif' using errcode = '22023';
  end if;
end $$;

-- Bersihkan akun uji yang sempat masuk sebelum penjaga NULL diperbaiki.
delete from public.staff_sessions where staff_id = 'u-cek';
delete from public.staff_pins where staff_id = 'u-cek';

grant execute on function public.list_staff(text)                              to anon, authenticated;
grant execute on function public.upsert_staff(text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.delete_staff(text, text)                      to anon, authenticated;
revoke execute on function public.staff_role(text) from anon, authenticated;

-- ═══ HP tamu: tambah aksi reservasi meja resto ═════════════════════
-- Sama seperti sebelumnya, hanya daftar aksinya yang bertambah satu.
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
  if v_jenis not in ('hold', 'releaseHold', 'guestOrder', 'reserveResto') then
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
