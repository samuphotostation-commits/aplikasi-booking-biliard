-- ═══════════════════════════════════════════════════════════════════
-- SPL — DATABASE PELANGGAN (tahap A: tanpa login)
--
-- Isinya dikumpulkan dari booking & pesanan yang memang sudah punya nama
-- dan nomor HP. HP pelanggan TIDAK bisa membacanya sama sekali — hanya
-- perangkat staf dengan sesi PIN.
--
-- Satu baris kunjungan = satu sesi/pesanan (ref-nya unik), jadi perangkat
-- staf boleh mengirim ulang berkali-kali tanpa membuat hitungan dobel.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.customer_visits (
  ref        text primary key,           -- id sesi atau id pesanan
  phone      text not null,              -- nomor HP yang sudah dirapikan (62xxx)
  nama       text not null,
  jenis      text not null default 'booking' check (jenis in ('booking', 'pesanan')),
  at_ms      bigint not null,
  amount     bigint not null default 0,  -- rupiah yang benar-benar dibayar (0 = belum)
  updated_at timestamptz not null default now()
);
create index if not exists customer_visits_phone_idx on public.customer_visits (phone, at_ms desc);

-- Catatan staf per pelanggan (mis. "langganan, suka meja VIP 2").
create table if not exists public.customer_notes (
  phone      text primary key,
  catatan    text,
  updated_at timestamptz not null default now()
);

alter table public.customer_visits enable row level security;
alter table public.customer_notes  enable row level security;
revoke all on public.customer_visits, public.customer_notes from anon, authenticated;

-- ═══ Perangkat staf menyetor kunjungan ═════════════════════════════
create or replace function public.publish_visits(p_token text, p_rows jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare v_staff text; v_row jsonb; v_n int := 0;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then raise exception 'sesi tidak sah' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    if coalesce(v_row->>'ref', '') <> '' and coalesce(v_row->>'phone', '') <> '' then
      insert into public.customer_visits (ref, phone, nama, jenis, at_ms, amount, updated_at)
      values (
        v_row->>'ref', v_row->>'phone', coalesce(v_row->>'nama', 'Tamu'),
        coalesce(v_row->>'jenis', 'booking'),
        coalesce((v_row->>'at')::bigint, 0),
        coalesce((v_row->>'amount')::bigint, 0),
        now()
      )
      on conflict (ref) do update
        set nama = excluded.nama,
            amount = greatest(public.customer_visits.amount, excluded.amount),
            at_ms = excluded.at_ms,
            updated_at = now();
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- ═══ Daftar pelanggan untuk panel staf ═════════════════════════════
create or replace function public.fetch_customers(p_token text, p_cari text default null, p_limit int default 200)
returns table (
  phone text, nama text, kunjungan int, belanja bigint,
  pertama_ms bigint, terakhir_ms bigint, catatan text
)
language plpgsql security definer set search_path = public as $$
declare v_staff text;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then raise exception 'sesi tidak sah' using errcode = '42501'; end if;
  return query
    select v.phone,
           (array_agg(v.nama order by v.at_ms desc))[1] as nama,
           count(*)::int as kunjungan,
           coalesce(sum(v.amount), 0)::bigint as belanja,
           min(v.at_ms) as pertama_ms,
           max(v.at_ms) as terakhir_ms,
           n.catatan
      from public.customer_visits v
      left join public.customer_notes n on n.phone = v.phone
     where p_cari is null or p_cari = ''
        or v.phone ilike '%' || p_cari || '%'
        or v.nama  ilike '%' || p_cari || '%'
     group by v.phone, n.catatan
     order by max(v.at_ms) desc
     limit least(coalesce(p_limit, 200), 1000);
end $$;

-- ═══ Catatan staf & hak dilupakan (UU PDP) ═════════════════════════
create or replace function public.set_customer_note(p_token text, p_phone text, p_catatan text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_staff text;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then raise exception 'sesi tidak sah' using errcode = '42501'; end if;
  insert into public.customer_notes (phone, catatan, updated_at) values (p_phone, p_catatan, now())
  on conflict (phone) do update set catatan = excluded.catatan, updated_at = now();
end $$;

/** Pelanggan minta datanya dihapus: riwayat kunjungannya dibuang dari database pemilik. */
create or replace function public.forget_customer(p_token text, p_phone text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_staff text; v_n int;
begin
  v_staff := public.staff_of(p_token);
  if v_staff is null then raise exception 'sesi tidak sah' using errcode = '42501'; end if;
  delete from public.customer_notes where phone = p_phone;
  delete from public.customer_visits where phone = p_phone;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.publish_visits(text, jsonb)            to anon, authenticated;
grant execute on function public.fetch_customers(text, text, int)       to anon, authenticated;
grant execute on function public.set_customer_note(text, text, text)    to anon, authenticated;
grant execute on function public.forget_customer(text, text)            to anon, authenticated;
