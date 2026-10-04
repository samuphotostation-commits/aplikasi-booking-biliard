-- ═══════════════════════════════════════════════════════════════════
-- SPL — RINGKASAN PUBLIK DITERBITKAN SERVER, BUKAN PERANGKAT STAF
--
-- Masalah yang diperbaiki: `public_state` dulu hanya diperbarui oleh
-- perangkat staf yang sedang terbuka. Kalau tidak ada kasir online, HP tamu
-- melihat ketersediaan basi berjam-jam DAN booking-nya seolah gagal
-- ("slot baru saja diambil orang lain") padahal servernya menerima.
--
-- Sekarang Edge Function `terbit` menghitung ringkasan itu di server, dipicu
-- setiap ada kejadian baru + cron tiap menit sebagai jaring pengaman.
-- ═══════════════════════════════════════════════════════════════════
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── Pintu tulis khusus server ──────────────────────────────────────
-- Sama dengan publish_public_state, tapi tanpa token staf: yang boleh
-- memanggilnya hanya service_role (Edge Function), bukan anon/tamu.
create or replace function public.publish_public_state_server(
  p_state jsonb,
  p_status jsonb default '[]'::jsonb,
  p_genesis bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_world bigint; v_baris jsonb;
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'ringkasan tidak sah' using errcode = '22023';
  end if;
  if pg_column_size(p_state) > 524288 then
    raise exception 'ringkasan terlalu besar' using errcode = '22023';
  end if;

  select genesis_at into v_world from public.venue_world where one_row;
  if p_genesis is not null and p_genesis <> v_world then return; end if;

  update public.public_state
     set data = p_state, genesis_at = v_world, updated_at = now()
   where one_row;

  if p_status is not null and jsonb_typeof(p_status) = 'array' then
    for v_baris in select * from jsonb_array_elements(p_status) loop
      if coalesce(v_baris->>'code', '') <> '' then
        insert into public.public_status (code, data, updated_at)
        values (v_baris->>'code', v_baris, now())
        on conflict (code) do update set data = excluded.data, updated_at = now();
      end if;
    end loop;
  end if;
end $$;

revoke execute on function public.publish_public_state_server(jsonb, jsonb, bigint) from public, anon, authenticated;
grant  execute on function public.publish_public_state_server(jsonb, jsonb, bigint) to service_role;

-- ── Pemanggil fungsi penerbit ──────────────────────────────────────
-- Alamat fungsi disimpan di tabel kecil supaya gampang diganti kalau project
-- pindah. TIDAK ada kunci rahasia di sini: fungsi `terbit` dipasang dengan JWT
-- dimatikan karena isinya hanya menghitung ulang ringkasan publik dari jejak —
-- tidak ada data pribadi yang keluar dan tidak ada jalan menulis bagi pemanggil.
create table if not exists public.server_config (
  one_row boolean primary key default true check (one_row),
  fungsi_url text not null
);
alter table public.server_config enable row level security;
revoke all on public.server_config from anon, authenticated;

create or replace function public.panggil_terbit()
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare c public.server_config;
begin
  select * into c from public.server_config where one_row;
  if not found or coalesce(c.fungsi_url, '') = '' then return; end if;
  perform net.http_post(
    url := c.fungsi_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000);
end $$;
revoke execute on function public.panggil_terbit() from public, anon, authenticated;

-- Tiap kejadian baru (aksi kasir maupun tamu) langsung menerbitkan ulang.
create or replace function public.terbit_sesudah_kejadian()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.panggil_terbit();
  return new;
end $$;
revoke execute on function public.terbit_sesudah_kejadian() from public, anon, authenticated;

drop trigger if exists venue_events_terbit on public.venue_events;
create trigger venue_events_terbit after insert on public.venue_events
  for each row execute function public.terbit_sesudah_kejadian();

-- Jaring pengaman: tiap menit, supaya jam yang lewat (slot "lewat", hold
-- kedaluwarsa, no-show) ikut bergerak walau tidak ada aksi sama sekali.
select cron.unschedule('spl-terbit') where exists (select 1 from cron.job where jobname = 'spl-terbit');
select cron.schedule('spl-terbit', '* * * * *', $$select public.panggil_terbit()$$);

-- Alamat fungsinya (ganti kalau project Supabase pindah).
insert into public.server_config (one_row, fungsi_url)
values (true, 'https://fhoxdsxabpohafilqxoz.supabase.co/functions/v1/terbit')
on conflict (one_row) do update set fungsi_url = excluded.fungsi_url;
