-- ═══════════════════════════════════════════════════════════════════
-- ABSENSI KARYAWAN — selfie + jam, masuk & pulang
--
-- SIAPA yang absen ditentukan SERVER dari token PIN, bukan dari layar. Jadi
-- karyawan tidak bisa mengabsenkan orang lain walau tahu id-nya — satu-satunya
-- cara adalah memegang PIN-nya sendiri, dan PIN itu memang beda tiap orang.
--
-- Fotonya disimpan kecil (JPEG ±360px, dimampatkan di HP sebelum dikirim) dan
-- DIHAPUS OTOMATIS sesudah 90 hari. Foto wajah itu data pribadi: menyimpannya
-- selamanya tanpa alasan adalah risiko, bukan fitur. Jam & catatannya tetap
-- tinggal untuk rekap.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.absensi (
  id         bigserial primary key,
  staff_id   text not null,
  nama       text not null,
  jenis      text not null check (jenis in ('masuk', 'pulang')),
  at         timestamptz not null default now(),
  /** JPEG kecil sebagai data URI. Dikosongkan sendiri sesudah 90 hari. */
  foto       text,
  catatan    text,
  created_at timestamptz not null default now()
);
create index if not exists absensi_staf_idx on public.absensi (staff_id, at desc);
create index if not exists absensi_waktu_idx on public.absensi (at desc);

alter table public.absensi enable row level security;
revoke all on public.absensi from anon, authenticated;

-- ── Catat absen ────────────────────────────────────────────────────
-- Nama & id diambil dari token, bukan dari parameter: layar tidak bisa
-- mengaku jadi orang lain.
create or replace function public.absen_catat(p_token text, p_jenis text, p_foto text, p_catatan text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id text; v_nama text; v_terakhir text; v_id_baru bigint;
begin
  v_id := public.staff_of(p_token);
  if v_id is null then return jsonb_build_object('ok', false, 'alasan', 'sesi PIN habis, masuk lagi'); end if;
  if p_jenis not in ('masuk', 'pulang') then return jsonb_build_object('ok', false, 'alasan', 'jenis absen tidak sah'); end if;
  -- Foto wajib: itu inti buktinya. Batas 400 KB supaya HP tidak mengirim foto mentah.
  if coalesce(length(p_foto), 0) < 1000 then return jsonb_build_object('ok', false, 'alasan', 'foto belum diambil'); end if;
  if length(p_foto) > 400000 then return jsonb_build_object('ok', false, 'alasan', 'foto terlalu besar'); end if;

  select nama into v_nama from public.staff_pins where staff_id = v_id;

  -- Tidak boleh masuk dua kali beruntun, atau pulang tanpa masuk. Yang dilihat
  -- catatan TERAKHIR orang ini hari operasional ini (batas 05.00 pagi).
  select jenis into v_terakhir from public.absensi
   where staff_id = v_id
     and at > ((now() at time zone 'Asia/Jakarta')::date - case when extract(hour from now() at time zone 'Asia/Jakarta') < 5 then 1 else 0 end + time '05:00') at time zone 'Asia/Jakarta'
   order by at desc limit 1;
  if p_jenis = 'masuk' and v_terakhir = 'masuk' then
    return jsonb_build_object('ok', false, 'alasan', 'sudah absen masuk hari ini');
  end if;
  if p_jenis = 'pulang' and v_terakhir is distinct from 'masuk' then
    return jsonb_build_object('ok', false, 'alasan', 'belum absen masuk');
  end if;

  insert into public.absensi (staff_id, nama, jenis, foto, catatan)
  values (v_id, coalesce(v_nama, v_id), p_jenis, p_foto, nullif(btrim(coalesce(p_catatan, '')), ''))
  returning id into v_id_baru;
  return jsonb_build_object('ok', true, 'id', v_id_baru, 'nama', coalesce(v_nama, v_id),
                            'at', (extract(epoch from now()) * 1000)::bigint);
end $fn$;

-- ── Daftar absen ───────────────────────────────────────────────────
-- Karyawan hanya melihat catatannya sendiri; superadmin melihat semuanya.
-- Fotonya TIDAK ikut di daftar (berat); diambil satuan lewat absen_foto.
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
       and (v_peran = 'superadmin' or a.staff_id = v_id)
     order by a.at desc
     limit 500;
end $fn$;

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
  if v_peran <> 'superadmin' and v_pemilik <> v_id then return null; end if;
  return v_foto;
end $fn$;

grant execute on function public.absen_catat(text, text, text, text) to anon, authenticated;
grant execute on function public.absen_daftar(text, int)             to anon, authenticated;
grant execute on function public.absen_foto(text, bigint)            to anon, authenticated;

-- ── Foto dibuang sesudah 90 hari ───────────────────────────────────
-- Jam & catatannya tetap ada untuk rekap; yang dibuang hanya wajahnya.
create or replace function public.absen_bersihkan()
returns integer
language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  update public.absensi set foto = null
   where foto is not null and at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $fn$;
revoke execute on function public.absen_bersihkan() from public, anon, authenticated;

select cron.unschedule('spl-absen-bersih') where exists (select 1 from cron.job where jobname = 'spl-absen-bersih');
select cron.schedule('spl-absen-bersih', '30 3 * * *', $j$select public.absen_bersihkan()$j$);

select 'absensi terpasang' as hasil;
