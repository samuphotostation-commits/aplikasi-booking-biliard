> **LAMPIRAN TEKNIS — bukan dokumen keputusan.**
> Jika isi berkas ini bertentangan dengan `PRD-SPL-BOOKING.md`, **PRD master yang menang.**
> Registri Keputusan Kanonik (§4) dan Konstanta Global (§5) di PRD master mengesampingkan angka apa pun di sini.

4 digit untuk membuka kembali (mencegah tamu memakai tablet kasir yang ditinggal) |
| Layar kasir | Tidak pernah otomatis login sebagai `owner`; peran `owner` hanya dipakai di perangkat pemilik |

#### 6.10.7 Kepatuhan dasar UU PDP (SEC-07)

Dasar hukum: **UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi**, dengan masa transisi yang berakhir 17 Oktober 2024. **[PERLU KONFIRMASI ke konsultan hukum]** — bagian ini adalah desain teknis yang mendukung kepatuhan, bukan nasihat hukum.

| ID | Kewajiban | Implementasi teknis |
|---|---|---|
| PDP-01 | **Minimalisasi data** — kumpulkan hanya yang perlu | Yang disimpan: nama, email, nomor HP, riwayat booking. **TIDAK disimpan**: NIK, tanggal lahir, alamat rumah, foto KTP, data kartu. Data kartu tidak pernah menyentuh sistem karena QRIS-only |
| PDP-02 | **Dasar pemrosesan tercatat** | Kolom `profiles.consent_tos_at`, `consent_privacy_at`, `consent_marketing_at`. Persetujuan pemasaran **terpisah** dari persetujuan layanan dan **opt-in**, bukan checkbox tercentang default |
| PDP-03 | **Pemberitahuan yang jelas** | Halaman Kebijakan Privasi berbahasa Indonesia, tertaut di footer dan di halaman pendaftaran, menyebut: data apa, untuk apa, disimpan berapa lama, dibagikan ke siapa (Midtrans sebagai pemroses pembayaran, Brevo sebagai pengirim email, Supabase sebagai penyedia infrastruktur) |
| PDP-04 | **Hak akses & portabilitas** | Tombol "Unduh Data Saya" di halaman profil → JSON berisi profil + riwayat booking + riwayat order |
| PDP-05 | **Hak penghapusan** — tetapi data akuntansi wajib disimpan | **Soft-anonymize, bukan `DELETE`.** RPC `anonymize_profile(user_id)`: `full_name → 'Pelanggan Terhapus'`, `phone_e164 → NULL`, `email → 'deleted-<uuid>@invalid'`, `anonymized_at = now()`. Baris `bookings`, `orders`, `payments`, `revenue_ledger` **tetap utuh** karena dibutuhkan untuk SPTPD dan audit pajak. FK `ON DELETE RESTRICT` mencegah penghapusan tidak sengaja |
| PDP-06 | **Retensi terbatas** | Job bulanan menganonimkan profil yang tidak aktif > 36 bulan dan menghapus `payment_events.raw_body` yang berumur > 24 bulan (payload mentah bisa mengandung nama & email) |
| PDP-07 | **Keamanan pemrosesan** | TLS di semua jalur; RLS di semua tabel; peran berjenjang; audit log immutable; secret di vault, bukan di repo |
| PDP-08 | **Pemberitahuan insiden** | UU PDP mewajibkan pemberitahuan kegagalan pelindungan data kepada subjek data dan lembaga terkait dalam **3 x 24 jam**. **[PERLU KONFIRMASI]** detail prosedur formal ke konsultan hukum. Yang disiapkan sistem: `system_alerts` + audit log yang cukup untuk merekonstruksi lingkup insiden |
| PDP-09 | **Transfer ke luar negeri** | Supabase dan Cloudflare memproses data di luar Indonesia. **[PERLU KONFIRMASI]** apakah perlu klausul transfer di kebijakan privasi. Pilih region Supabase **Singapore (ap-southeast-1)** — terdekat, latensi terendah, dan yurisdiksi yang lazim dipakai bisnis Indonesia |
| PDP-10 | **Nomor WA untuk notifikasi** | Persetujuan terpisah. MVP memakai `wa.me` deep link di mana **pelanggan sendiri yang menekan kirim** — secara hukum jauh lebih aman daripada mengirim pesan otomatis ke nomor mereka |
| PDP-11 | **Data staf** | Akun staf juga subjek data. Audit log menyimpan `actor_id`, IP, dan user agent — dijelaskan di kontrak kerja/SOP internal |

#### 6.10.8 Ringkasan keamanan lain

| ID | Kontrol |
|---|---|
| SEC-08 | **CSP** ketat di Cloudflare Pages: `default-src 'self'`, izinkan `api.midtrans.com` dan domain Supabase saja. Kalau nanti Snap dipakai (Fase 2), tambahkan domain Snap agar popup tidak diblokir |
| SEC-09 | **CORS** dibatasi ke domain produksi saja, bukan `*` |
| SEC-10 | Header keamanan via `_headers` Cloudflare: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal |
| SEC-11 | **Webhook endpoint wajib HTTPS publik** dengan sertifikat tepercaya di port 443. Midtrans menolak localhost, VPN, dan port tidak lazim. Untuk development lokal pakai tunnel (cloudflared/ngrok) |
| SEC-12 | **Parse JSON toleran** — abaikan field baru yang tidak dikenal. Jangan pakai strict schema validation yang melempar error pada field asing; mulai 1 April 2026 Midtrans mengubah struktur field GoPay/QRIS |
| SEC-13 | Supabase **Security Advisor** dijalankan dan bersih sebelum go-live |
| SEC-14 | Dependency scanning (`npm audit`, Dependabot) di GitHub Actions |

#### 6.10.9 Jebakan zona waktu yang harus dihindari

| Jebakan | Kenapa salah | Perbaikan |
|---|---|---|
| `date_trunc('day', starts_at)` | Memotong menurut GUC `TimeZone` sesi (sering UTC) → sesi 01.00 WIB masuk hari sebelumnya | `date_trunc('day', starts_at at time zone 'Asia/Jakarta')` |
| `starts_at::date` | Cast implisit ke zona sesi | Pakai kolom `business_date` |
| `GROUP BY created_at::date` untuk omzet | Waktu bayar ≠ hari operasional sesi | `GROUP BY business_date` |
| JS `new Date().toISOString().slice(0,10)` | Menghasilkan tanggal **UTC**. Pukul 23.30 WIB sudah tanggal berikutnya → pelanggan yang membuka aplikasi malam hari melihat jadwal besok | `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())` |
| Jam operasional disimpan `timestamptz` | "Buka 10.00 setiap hari" bukan titik waktu | `time` + zona di `operating_hours` |
| Laporan "hari ini" pakai `CURRENT_DATE` | Jam 00.30 WIB `CURRENT_DATE` sudah tanggal baru padahal shift masih jalan | `public.business_date_of(now())` |
| Hard-code `+07` di aplikasi | Aman hari ini (WIB tanpa DST), tapi pecah kalau venue kedua dibuka di WITA/WIT | Selalu nama zona IANA `'Asia/Jakarta'` |

Arah konversi yang sering tertukar: `timestamp AT TIME ZONE 'Asia/Jakarta'` mengubah **lokal → timestamptz**; `timestamptz AT TIME ZONE 'Asia/Jakarta'` mengubah **timestamptz → lokal**. Dua operator terlihat sama tetapi berlawanan arah.

---

### 6.11 Realtime

#### 6.11.1 Mengapa Broadcast, bukan `postgres_changes`

`postgres_changes` mengirim **seluruh baris** ke subscriber. RLS menyaring *baris mana* yang dikirim, tetapi **tidak menyaring kolom**. Kalau pelanggan A boleh tahu slot 20.00 terisi dan kita memakai `postgres_changes` pada `bookings`, payload akan memuat `user_id`, `total_amount`, `guest_name`, `guest_phone_e164`, dan `notes` milik pelanggan B. Itu kebocoran data langsung dan pelanggaran PDP-01.

#### 6.11.2 Daftar channel

| ID | Channel | Audiens | Payload | PII |
|---|---|---|---|---|
| RT-01 | `availability:{business_date}` | `authenticated` + `anon` | `{table_id, table_code, starts_at, ends_at, state}` dengan `state ∈ free\|held\|booked\|maintenance` | **Tidak ada** |
| RT-02 | `board:live` | `anon` | `{table_code, state, ends_at}` untuk papan meja publik | **Tidak ada** |
| RT-03 | `booking:{booking_id}` | pemilik booking + staf | `{status, payment_status, hold_expires_at, qr_expires_at}` | Terbatas |
| RT-04 | `admin:orders` | staf saja | order F&B & booking masuk lengkap | Ya |
| RT-05 | `admin:alerts` | admin/owner | `system_alerts` baru severity `high`/`critical` | Ya |
| RT-06 | `table:{table_id}` | staf saja | sesi dibuka/ditutup, perpanjangan, timer | Ya |
| RT-07 | `kds:orders` | staf dapur (Fase 2) | item masuk dapur | Terbatas |

#### 6.11.3 Trigger broadcast

```sql
-- ============================================================
-- 16_realtime.sql
-- ============================================================
create or replace function public.broadcast_slot_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.bookings := coalesce(new, old);
  v_code  text;
  v_state text;
begin
  select t.code into v_code from public.billiard_tables t where t.id = v_row.table_id;

  v_state := case
               when tg_op = 'DELETE'                        then 'free'
               when v_row.status = 'hold'
                    and v_row.hold_expires_at > now()       then 'held'
               when v_row.status in ('confirmed','seated')  then 'booked'
               else 'free'
             end;

  perform realtime.send(
    jsonb_build_object(
      'table_id',   v_row.table_id,
      'table_code', v_code,
      'starts_at',  v_row.starts_at,
      'ends_at',    v_row.ends_at,
      'state',      v_state
      -- SENGAJA TIDAK ADA: user_id, guest_name, guest_phone_e164,
      -- total_amount, notes, guest_count, booking_code.
    ),
    'slot_changed',
    'availability:' || v_row.business_date::text,
    true                       -- private channel
  );
  return null;
end;
$$;

create trigger bookings_broadcast_slot
after insert or delete or update of status, starts_at, ends_at
on public.bookings
for each row execute function public.broadcast_slot_change();
```

Trigger terpisah `broadcast_booking_detail()` untuk `booking:{id}`, `broadcast_admin_order()` untuk `admin:orders`, dan `broadcast_alert()` untuk `admin:alerts` mengikuti pola yang sama dengan payload yang sesuai audiensnya.

#### 6.11.4 RLS pada `realtime.messages`

Tanpa policy ini, siapa pun yang tahu nama topic bisa subscribe ke channel admin.

```sql
create policy realtime_read_availability
on realtime.messages for select to anon, authenticated
using ( (select realtime.topic()) like 'availability:%'
        or (select realtime.topic()) = 'board:live' );

create policy realtime_read_admin
on realtime.messages for select to authenticated
using ( (select realtime.topic()) in ('admin:orders','admin:alerts','kds:orders')
        and (select public.is_staff()) );

create policy realtime_read_own_booking
on realtime.messages for select to authenticated
using (
  (select realtime.topic()) like 'booking:%'
  and exists (
    select 1 from public.bookings b
     where b.id = nullif(split_part((select realtime.topic()), ':', 2), '')::uuid
       and ( b.user_id = (select auth.uid()) or (select public.is_staff()) )
  )
);

create policy realtime_read_table_staff
on realtime.messages for select to authenticated
using ( (select realtime.topic()) like 'table:%' and (select public.is_staff()) );
```

**Tidak ada policy `INSERT` pada `realtime.messages` untuk `anon` maupun `authenticated`.** Ini disengaja: tanpa itu, siapa pun bisa menyiarkan pesan palsu ke `availability:...` dan membuat semua device menampilkan slot "booked" padahal kosong — vandalisme murah yang mematikan penjualan. **Semua broadcast hanya boleh berasal dari trigger database.**

#### 6.11.5 Client dan fallback saat realtime putus

```ts
await supabase.realtime.setAuth();          // wajib untuk private channel

let lastPatchAt = Date.now();
let pollTimer: number | undefined;

const ch = supabase
  .channel(`availability:${businessDate}`, { config: { private: true } })
  .on('broadcast', { event: 'slot_changed' }, ({ payload }) => {
    lastPatchAt = Date.now();
    applySlotPatch(payload);                // patch lokal, JANGAN refetch penuh
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      refetchAvailability();                // reconcile sekali saat tersambung
      stopPolling();
      setConnBadge('online');
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      setConnBadge('offline');
      startPolling();                       // fallback
    }
  });
```

| ID | Aturan fallback | Detail |
|---|---|---|
| RT-F1 | **Realtime bukan pengganti rekonsiliasi** | Selalu panggil `get_availability()` sekali saat `SUBSCRIBED` dan saat tab kembali `visible` |
| RT-F2 | Polling saat realtime putus | Halaman booking: 15 detik. Halaman pembayaran: 3–5 detik. Dashboard kasir: 10 detik |
| RT-F3 | Backoff | Polling melambat ke 30 detik setelah 2 menit tanpa aktivitas pengguna; kembali cepat saat ada interaksi |
| RT-F4 | Indikator koneksi **jujur** di layar kasir | Hijau "Tersambung" / Kuning "Polling" / Merah "Offline — 3 item belum tersinkron" (OPS-22) |
| RT-F5 | Watchdog | Kalau tidak ada pesan apa pun selama 60 detik pada channel yang seharusnya ramai, paksa `refetchAvailability()` |
| RT-F6 | **Slot terlihat `free` bukan jaminan** | TOCTOU disengaja. Kebenaran final selalu `EXCLUDE` constraint di server |
| RT-F7 | Kuota | Free tier: 2 juta pesan/bulan, 200 peak connection. Untuk satu venue ini sangat jauh; monitor tetap dipasang |

---

### 6.12 Job Terjadwal

#### 6.12.1 Daftar job

| ID | Job | Jadwal | Toleransi telat | Mesin |
|---|---|---|---|---|
| JOB-01 | `expire_stale_holds` — lepas hold kedaluwarsa | tiap 1 menit | **Rendah** | `pg_cron` |
| JOB-02 | `reconcile_pending_payments` — Get Status API untuk `pending` > 20 menit | tiap 5 menit | Rendah | `pg_cron` + `pg_net` |
| JOB-03 | `mark_no_show` — tandai booking yang lewat grace period | tiap 5 menit | Sedang | `pg_cron` |
| JOB-04 | `close_finished_sessions` — `seated` → `completed` saat lewat `ends_at` | tiap 5 menit | Sedang | `pg_cron` |
| JOB-05 | `queue_reminder_h1d` — reminder H-1 hari | tiap 15 menit | Sedang | `pg_cron` |
| JOB-06 | `queue_reminder_h1h` — reminder H-1 jam | tiap 5 menit | Sedang | `pg_cron` |
| JOB-07 | `dispatch_notifications` — kirim antrean email/push | tiap 1 menit | Sedang | `pg_cron` + `pg_net` → Edge Function |
| JOB-08 | `expire_store_credit` — hanguskan store credit kedaluwarsa | harian 03.00 WIB | Tinggi | `pg_cron` |
| JOB-09 | `daily_closing` — rekap harian + rekap pajak | harian 03.15 WIB | Tinggi | `pg_cron` |
| JOB-10 | `prune_raw_payloads` — hapus `raw_body` > 24 bulan | bulanan | Tinggi | `pg_cron` |
| JOB-11 | `pg_dump` backup harian terenkripsi | harian 04.00 WIB | Tinggi | **GitHub Actions** |
| JOB-12 | Keepalive anti-pause | tiap 6 jam | Tinggi | **cron-job.org** |
| JOB-13 | Dead-man switch — alarm kalau JOB-01 tidak jalan > 10 menit | tiap 10 menit | Rendah | **cron-job.org** → `/health` |

#### 6.12.2 Implementasi

```sql
-- ============================================================
-- 17_cron.sql
-- ============================================================
create or replace function public.expire_stale_holds()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
  v_grace integer;
begin
  select (value #>> '{}')::integer into v_grace
    from public.settings where key = 'hold_release_grace_m';

  with expired as (
    update public.bookings b
       set status          = 'expired',
           hold_expires_at = null,
           cancelled_at    = now(),
           cancel_reason   = 'hold_timeout',
           updated_at      = now()
     where b.status = 'hold'
       and b.hold_expires_at < now() - make_interval(mins => coalesce(v_grace, 2))
       -- Jangan pernah mengekspirasi hold yang sudah dibayar.
       and not exists (
             select 1 from public.payments p
              where p.booking_id = b.id and p.status = 'paid'
           )
    returning b.id
  )
  select count(*) into v_count from expired;

  insert into public.settings (key, value, description)
  values ('_heartbeat_expire_holds', to_jsonb(now()), 'Dead-man switch JOB-01')
  on conflict (key) do update set value = to_jsonb(now()), updated_at = now();

  return v_count;
end;
$$;

create or replace function public.mark_no_show()
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_grace integer;
begin
  select (value #>> '{}')::integer into v_grace
    from public.settings where key = 'grace_period_minutes';

  with ns as (
    update public.bookings b
       set status = 'no_show', updated_at = now()
     where b.status = 'confirmed'
       and b.checked_in_at is null
       and now() > b.starts_at + make_interval(mins => coalesce(v_grace, 15))
    returning b.id
  )
  select count(*) into v_count from ns;
  return v_count;
end;
$$;

create or replace function public.close_finished_sessions()
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with done as (
    update public.bookings b
       set status = 'completed', updated_at = now()
     where b.status = 'seated' and b.ends_at < now() - interval '5 minutes'
    returning b.id
  )
  select count(*) into v_count from done;
  return v_count;
end;
$$;

-- Reminder: idempoten lewat dedupe_key UNIQUE.
create or replace function public.queue_reminders(p_offset interval, p_template text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  with q as (
    insert into public.notifications
      (user_id, booking_id, channel, template, payload, scheduled_at, dedupe_key)
    select b.user_id, b.id, 'email', p_template,
           jsonb_build_object('booking_code', b.booking_code,
                              'starts_at',    b.starts_at),
           b.starts_at - p_offset,
           p_template || ':' || b.id::text
      from public.bookings b
     where b.status = 'confirmed'
       and b.user_id is not null
       and b.starts_at - p_offset between now() and now() + interval '20 minutes'
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_count from q;
  return v_count;
end;
$$;

-- Penjadwalan
select cron.schedule('expire-stale-holds', '* * * * *',
       $$ select public.expire_stale_holds() $$);
select cron.schedule('mark-no-show', '*/5 * * * *',
       $$ select public.mark_no_show() $$);
select cron.schedule('close-sessions', '*/5 * * * *',
       $$ select public.close_finished_sessions() $$);
select cron.schedule('reminder-h1d', '*/15 * * * *',
       $$ select public.queue_reminders(interval '24 hours', 'reminder_h1d') $$);
select cron.schedule('reminder-h1h', '*/5 * * * *',
       $$ select public.queue_reminders(interval '1 hour', 'reminder_h1h') $$);

-- Job yang memanggil Edge Function lewat pg_net.
select cron.schedule('reconcile-payments', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT>.supabase.co/functions/v1/payments-reconcile',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' ||
                                  current_setting('app.cron_token', true)),
    body    := '{}'::jsonb
  );
$$);

select cron.schedule('dispatch-notifications', '* * * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT>.supabase.co/functions/v1/notify-dispatch',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' ||
                                  current_setting('app.cron_token', true)),
    body    := '{}'::jsonb
  );
$$);
```

#### 6.12.3 Menjalankannya di tier gratis — dan mengapa itu aman

| ID | Kenyataan | Mitigasi |
|---|---|---|
| JOB-R1 | **`pg_cron` berhenti total kalau project Supabase di-pause** (7 hari aktivitas rendah). Hold kedaluwarsa tidak pernah dilepas dan slot tersandera | Keepalive cron-job.org (JOB-12) + dead-man switch (JOB-13) |
| JOB-R2 | **Kebenaran tidak boleh bergantung pada cron** (ENG-R6) | Semua query ketersediaan memakai `status='hold' AND hold_expires_at > now()`. Hold yang lewat waktu **otomatis tidak dihitung**, bahkan sebelum cron menyentuhnya. Kalau cron mati seminggu, aplikasi tetap **benar** — yang rusak hanya kerapian laporan |
| JOB-R3 | **Vercel Cron Hobby dibatasi 1x/hari** dengan presisi ±59 menit | Salah satu alasan Vercel Hobby ditolak. `pg_cron` mendukung interval sampai 1 detik dan tersedia di Supabase Free |
| JOB-R4 | **GitHub Actions scheduled workflow dinonaktifkan otomatis setelah 60 hari tanpa commit**, dan sering tertunda saat runner sibuk | Jangan dipakai untuk job sensitif waktu. Dipakai **hanya** untuk backup (JOB-11). Tambahkan reminder kalender kuartalan untuk memastikan workflow masih aktif |
| JOB-R5 | Edge Function 500.000 invocation/bulan | JOB-07 (1/menit) + JOB-02 (1/5 menit) ≈ 52.000/bulan. Aman dengan margin 10x |

---

### 6.13 Strategi Environment, Seeding, dan Migrasi

#### 6.13.1 Tiga environment

| Aspek | Local | Staging | Production |
|---|---|---|---|
| Frontend | `vite dev` di `localhost:5173` | Cloudflare Pages preview (branch `develop`) | Cloudflare Pages (branch `main`) + domain SPL |
| Supabase | `supabase start` (Docker lokal) | **Project Supabase gratis #1** | **Project Supabase gratis #2** |
| Midtrans | Sandbox | Sandbox | **Production** |
| Webhook URL | tunnel cloudflared → localhost | `https://<staging>.supabase.co/functions/v1/midtrans-webhook` | `https://<prod>.supabase.co/functions/v1/midtrans-webhook` |
| Data | Seed lengkap + data dummy | Seed + data uji, boleh direset | **Data nyata. Tidak pernah direset** |
| Banner | "LOCAL" | "STAGING — JANGAN BAYAR SUNGGUHAN" | tidak ada |
| Email | Inbucket lokal (`localhost:54324`) | Brevo, domain uji | Brevo, domain produksi |

Free tier Supabase memberi **2 project per organisasi** — cukup persis untuk staging + production, tanpa biaya. Ini alasan tambahan mengapa organisasi baru (ACC-03) dibuat khusus untuk SPL: kuota 2 project itu tidak boleh dipakai bersama photobooth.

Environment ditentukan **tanpa flag manual**: prefix Server Key menentukan base URL Midtrans (LSN-01), dan `SUPABASE_URL` menentukan sisanya. Tidak ada variabel `IS_PRODUCTION` yang bisa lupa di-flip.

#### 6.13.2 Struktur repo

```
spl-booking/
├─ .github/workflows/
│   ├─ ci.yml                  # lint, typecheck, unit test, supabase db lint
│   ├─ deploy-staging.yml
│   ├─ deploy-prod.yml
│   └─ backup.yml              # JOB-11
├─ supabase/
│   ├─ config.toml
│   ├─ migrations/
│   │   ├─ 20260901000000_extensions.sql
│   │   ├─ 20260901000100_types.sql
│   │   ├─ 20260901000200_identity.sql
│   │   ├─ 20260901000300_venue.sql
│   │   ├─ 20260901000400_pricing.sql
│   │   ├─ 20260901000500_bookings.sql
│   │   ├─ 20260901000600_menu.sql
│   │   ├─ 20260901000700_orders.sql
│   │   ├─ 20260901000800_payments.sql
│   │   ├─ 20260901000900_refunds.sql
│   │   ├─ 20260901001000_vouchers.sql
│   │   ├─ 20260901001100_ops.sql
│   │   ├─ 20260901001200_triggers.sql
│   │   ├─ 20260901001300_functions_money.sql
│   │   ├─ 20260901001400_rpc_booking.sql
│   │   ├─ 20260901001500_rls.sql
│   │   ├─ 20260901001600_realtime.sql
│   │   └─ 20260901001700_cron.sql
│   ├─ seed.sql
│   └─ functions/
│       ├─ midtrans-webhook/
│       ├─ payments-charge/
│       ├─ payments-status/
│       ├─ payments-reconcile/
│       ├─ notify-dispatch/
│       ├─ reports-export/
│       └─ health/
├─ src/                        # SPA React
├─ public/                     # manifest.webmanifest, sw.js, ikon, font
└─ docs/PRD.md
```

#### 6.13.3 Aturan migrasi

| ID | Aturan |
|---|---|
| ENV-M1 | **Forward-only.** Tidak ada `down` migration di produksi. Koreksi = migrasi baru |
| ENV-M2 | Satu migrasi = satu tujuan logis, nama deskriptif, timestamp UTC |
| ENV-M3 | **Perubahan destruktif dilarang tanpa persetujuan tertulis pemilik.** `DROP TABLE`, `DROP COLUMN`, dan `ALTER TYPE` yang menyempitkan wajib dua tahap: tambah kolom baru → backfill → alihkan kode → hapus di rilis berikutnya |
| ENV-M4 | Setiap migrasi dijalankan berurutan: **local → staging → tunggu 24 jam → production** |
| ENV-M5 | **Backup `pg_dump` manual wajib diambil tepat sebelum migrasi produksi**, bukan mengandalkan backup harian |
| ENV-M6 | CI menjalankan `supabase db lint` dan menolak migrasi yang membuat tabel `public` tanpa RLS |
| ENV-M7 | Uji bukti exclusion constraint (6.6.5) masuk suite test dan dijalankan di setiap CI run |
| ENV-M8 | Perubahan `settings` (tarif pajak, kategori MDR) adalah **data**, bukan migrasi — dilakukan lewat UI owner dan tercatat di `audit_logs` |

#### 6.13.4 Seeding

`supabase/seed.sql` berisi data contoh yang membuat aplikasi langsung bisa dijalankan. **Semua angka di bawah adalah ASUMSI dan [PERLU KONFIRMASI] ke pemilik sebelum go-live.**

```sql
-- Tipe meja
insert into public.table_types (code, name, sort_order) values
  ('STD','Meja Reguler',1), ('VIP','Meja VIP',2);

-- ASUMSI 8 meja. [PERLU KONFIRMASI] jumlah meja sebenarnya.
insert into public.billiard_tables (code, name, table_type_id, sort_order, map_x, map_y)
select 'M-0'||i, 'Meja '||i,
       (select id from public.table_types where code='STD'),
       i, ((i-1)%3)*120+40, ((i-1)/3)*90+40
  from generate_series(1,6) i;

insert into public.billiard_tables (code, name, table_type_id, sort_order, map_x, map_y)
select 'VIP-0'||i, 'VIP '||i,
       (select id from public.table_types where code='VIP'),
       10+i, 400, (i-1)*90+40
  from generate_series(1,2) i;

-- OPS-04: satu meja dicadangkan khusus walk-in di jam prime.
update public.billiard_tables set is_bookable_online = false where code = 'M-06';

-- ASUMSI tarif kota tier-2, di-anchor ke data pasar terverifikasi.
-- WAJIB diganti angka riil pemilik.
insert into public.pricing_rules
  (name, table_type_id, day_type, starts_time, ends_time, price_per_hour, priority)
values
  ('HH-WD',    (select id from public.table_types where code='STD'),
   'weekday','11:00','17:00', 35000, 10),
  ('REG-WD',   (select id from public.table_types where code='STD'),
   'weekday','17:00','20:00', 45000, 10),
  ('PRIME-WD', (select id from public.table_types where code='STD'),
   'weekday','20:00','02:00', 55000, 10),
  ('HH-WE',    (select id from public.table_types where code='STD'),
   'weekend','11:00','17:00', 45000, 10),
  ('PRIME-WE', (select id from public.table_types where code='STD'),
   'weekend','17:00','02:00', 70000, 10),
  ('VIP-WD',   (select id from public.table_types where code='VIP'),
   'weekday','11:00','02:00', 72000, 20),
  ('VIP-WE',   (select id from public.table_types where code='VIP'),
   'weekend','11:00','02:00', 92000, 20);

-- Menu contoh
insert into public.menu_categories (code, name, sort_order) values
  ('SMOKE','Smokehouse',1), ('SNACK','Snack',2),
  ('DRINK','Minuman',3), ('COFFEE','Kopi',4);

insert into public.menu_items (category_id, sku, name, base_price, prep_minutes)
values
  ((select id from public.menu_categories where code='SMOKE'),
   'FB-BEEFRIBS','Smoked Beef Ribs', 95000, 25),
  ((select id from public.menu_categories where code='SMOKE'),
   'FB-PORKBELLY','Smoked Chicken Wings (6 pcs)', 55000, 18),
  ((select id from public.menu_categories where code='SNACK'),
   'FB-FRIES','Truffle Fries', 35000, 10),
  ((select id from public.menu_categories where code='DRINK'),
   'FB-LEMONTEA','Lemon Tea', 25000, 5),
  ((select id from public.menu_categories where code='COFFEE'),
   'FB-AMERICANO','Americano', 28000, 6);
```

Untuk staging, tambahkan `seed_dev.sql` berisi 3 akun uji (`customer`, `cashier`, `owner`) dan 20 booking historis agar dashboard tidak kosong.

---

### 6.14 Observability

**Prinsip: ini uang. Kegagalan tidak boleh diam-diam.**

#### 6.14.1 Logging

| ID | Apa yang dicatat | Ke mana | Retensi |
|---|---|---|---|
| OBS-01 | Setiap webhook masuk, valid maupun tidak | `payment_events` (raw body + header + hasil verifikasi) | 24 bulan (raw_body 24 bulan, metadata selamanya) |
| OBS-02 | Setiap perubahan sensitif (batal, refund, diskon, void, ubah harga, override konflik) | `audit_logs` immutable | Selamanya |
| OBS-03 | Error Edge Function | `console.error` terstruktur JSON → Supabase Logs | **1 hari di Free**, 7 hari di Pro. Ini alasan nyata untuk upgrade: log 1 hari tidak cukup untuk menyelidiki sengketa pembayaran hari Senin yang dilaporkan hari Rabu |
| OBS-04 | Error client (SPA) | Ditampilkan ke user + dikirim ke `POST /functions/v1/client-error` yang menulis ke `system_alerts` severity `info`, dengan rate limit ketat | 90 hari |
| OBS-05 | Heartbeat job | Baris `settings._heartbeat_*` yang di-update tiap job berjalan | — |

Format log Edge Function (satu baris JSON per event agar bisa di-grep):

```json
{"ts":"2026-08-29T12:35:12Z","fn":"midtrans-webhook","level":"error",
 "code":"AMOUNT_MISMATCH","order_id":"SPL-SPL-260829-00042-1",
 "expected":140000,"received":1,"event_id":8812}
```

**Jangan pernah** menulis `signature_key`, Server Key, JWT, atau nomor HP lengkap ke log.

#### 6.14.2 Alert — daftar dan tingkat keparahan

| Code | Severity | Pemicu | Aksi |
|---|---|---|---|
| `PAID_UNFULFILLED` | **critical** | Uang masuk tapi slot hilang | Web Push + email owner **seketika** |
| `AMOUNT_MISMATCH` | **critical** | `gross_amount` webhook ≠ nominal DB | Web Push + email, booking **tidak** dikonfirmasi |
| `WEBHOOK_SIGNATURE_INVALID` | high | Signature gagal | Email harian ringkasan; **seketika** kalau > 3 dalam 10 menit (indikasi serangan) |
| `TOTAL_MISMATCH` | high | Total client ≠ total server | Email seketika. Ini indikasi bug atau upaya manipulasi |
| `PAYMENT_STUCK_PENDING` | high | Payment `pending` > 30 menit setelah rekonsiliasi | Email |
| `NO_PRICING_RULE` | high | Konfigurasi tarif bolong | Email seketika — grid booking tidak bisa ditampilkan |
| `CRON_HEARTBEAT_MISSING` | **critical** | `expire_stale_holds` tidak jalan > 10 menit | Web Push + email. Indikasi project di-pause |
| `NOTIFICATION_FAILED` | warn | Email gagal 3x berturut-turut | Email harian |
| `BACKUP_FAILED` | high | GitHub Actions backup gagal | Notifikasi GitHub + email |
| `DB_SIZE_WARNING` | warn | DB > 350 MB atau egress > 4 GB/bulan | Email — sinyal waktunya upgrade Pro |
| `SUPABASE_PAUSE_WARNING` | **critical** | Email peringatan dari Supabase | Diteruskan ke owner, resume manual |

Jalur alert (semuanya Rp 0):

```
system_alerts (INSERT)
   └─ trigger broadcast_alert()
        ├─ Realtime channel admin:alerts  → dashboard admin berbunyi + banner merah
        └─ notifications (channel='web_push' + 'email')
             └─ JOB-07 dispatch → Web Push (VAPID) + Brevo SMTP ke email owner
```

#### 6.14.3 Dead-man switch

Alarm yang paling penting adalah alarm yang berbunyi ketika **sistem alarm itu sendiri mati**.

```
cron-job.org (di luar seluruh infrastruktur kita)
   └─ GET https://<prod>.supabase.co/functions/v1/health  tiap 10 menit
        Edge Function health:
          1. SELECT now(), value FROM settings WHERE key='_heartbeat_expire_holds'
          2. if (now() - heartbeat > 10 menit) -> HTTP 500 + body {"status":"stale"}
          3. else -> HTTP 200 {"status":"ok","db":"reachable"}
   └─ cron-job.org mengirim email ke owner kalau menerima non-200 dua kali berturut-turut
```

Endpoint `/health` melakukan `SELECT` nyata ke tabel, bukan sekadar mengembalikan `"ok"` — sehingga ia sekaligus menjadi keepalive anti-pause (JOB-12) dan bukti bahwa database benar-benar bisa dijangkau.

#### 6.14.4 Dashboard operasional harian

Satu halaman yang bisa dibaca pemilik dalam 30 detik:

| Blok | Isi |
|---|---|
| Alarm terbuka | `system_alerts` yang belum di-acknowledge, urut severity |
| Pembayaran menggantung | `payments` status `pending` > 20 menit |
| Aktivitas sensitif hari ini (AD-10) | Semua void, diskon manual, pembatalan, refund dalam satu daftar |
| Kesehatan job | Umur heartbeat tiap job |
| Kuota | Ukuran DB, egress bulan berjalan, email terkirim hari ini |
| Rekonsiliasi kas | Cash tercatat sistem vs cash fisik di laci (diisi kasir saat tutup shift) |

---

### 6.15 Backup dan Disaster Recovery

#### 6.15.1 Risiko yang nyata di free tier

| ID | Risiko | Tingkat |
|---|---|---|
| BR-01 | **Supabase Free tidak punya backup** dan backup tidak bisa diunduh. Satu `DELETE` tanpa `WHERE` atau migrasi salah = catatan pembayaran hilang permanen | **Kritis** |
| BR-02 | **Project di-pause setelah ±7 hari aktivitas database rendah.** Saat paused, API mati total, webhook Midtrans gagal, aplikasi tidak bisa diakses. Restore **manual** dari dashboard | **Tinggi** |
| BR-03 | **Project yang paused terlalu lama BISA DIHAPUS PERMANEN** | **Kritis** |
| BR-04 | Log retention Free hanya **1 jam (auth) / 1 hari (API & DB)** — tidak cukup untuk menyelidiki sengketa pembayaran yang dilaporkan beberapa hari kemudian | Sedang |
| BR-05 | `pg_cron` ikut mati saat project paused | Tinggi |

**[PERLU KONFIRMASI]** Apakah venue pernah tutup lebih dari 7 hari berturut-turut (renovasi, libur Lebaran)? Kalau ya, keepalive eksternal bukan sabuk pengaman — ia wajib mutlak.

#### 6.15.2 Rencana backup

```yaml
# .github/workflows/backup.yml
name: Daily Encrypted Backup
on:
  schedule:
    - cron: '0 21 * * *'      # 21:00 UTC = 04:00 WIB
  workflow_dispatch:           # bisa dijalankan manual sebelum migrasi (ENV-M5)
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - name: Install client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client age
      - name: Dump
        env:
          PGURL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          set -euo pipefail
          STAMP=$(date -u +%Y%m%d)
          pg_dump "$PGURL" --format=custom --no-owner --no-privileges \
            --file="spl-$STAMP.dump"
          test -s "spl-$STAMP.dump"          # gagal kalau file kosong
      - name: Encrypt
        env:
          AGE_KEY: ${{ secrets.BACKUP_AGE_PUBLIC_KEY }}
        run: age -r "$AGE_KEY" -o "spl-$(date -u +%Y%m%d).dump.age" spl-*.dump
      - name: Upload to R2
        env:
          R2: ${{ secrets.R2_CREDENTIALS }}
        run: ./scripts/upload-r2.sh spl-*.dump.age
      - name: Prune > 30 hari
        run: ./scripts/prune-r2.sh 30
      - name: Alert on failure
        if: failure()
        run: ./scripts/alert.sh BACKUP_FAILED
```

| ID | Aturan backup |
|---|---|
| BR-06 | Frekuensi harian 04.00 WIB (setelah venue tutup jam 02.00, sebelum buka jam 10.00) |
| BR-07 | Retensi **30 hari rolling** + satu snapshot bulanan disimpan 12 bulan |
| BR-08 | Terenkripsi (`age`) sebelum meninggalkan runner. Kunci privat disimpan pemilik **di luar** GitHub |
| BR-09 | Disimpan di **Cloudflare R2** (10 GB gratis) — bukan di repo GitHub, agar ukuran repo tidak membengkak |
| BR-10 | **Uji restore satu kali sebelum go-live**, ke project Supabase staging. Backup yang belum pernah diuji restore **bukan backup** |
| BR-11 | Uji restore diulang setiap kuartal, hasilnya dicatat |
| BR-12 | Backup manual wajib tepat sebelum setiap migrasi produksi (ENV-M5) |
| BR-13 | Export CSV bulanan (bookings, orders, payments, revenue_ledger) ke Google Drive pemilik sebagai lapisan kedua yang bisa dibuka tanpa tools teknis |

#### 6.15.3 Anti-pause

| Lapis | Mekanisme |
|---|---|
| 1 | Aktivitas nyata pelanggan setiap hari (venue buka harian) |
| 2 | cron-job.org ping `/health` tiap 6 jam, endpoint melakukan `SELECT` nyata ke tabel |
| 3 | Dead-man switch memberi tahu owner kalau ping gagal |
| 4 | Email peringatan Supabase (dikirim ±1 minggu sebelum pause) diteruskan ke owner dan **tidak boleh diabaikan** |

**[PERLU KONFIRMASI]** Dokumentasi Supabase hanya menyebut "user database activity" dan tidak mengonfirmasi apakah job `pg_cron` internal dihitung. Jangan bertaruh pada itu — keepalive eksternal tetap dipasang.

#### 6.15.4 Skenario pemulihan

| Skenario | RPO | RTO | Prosedur |
|---|---|---|---|
| Salah `UPDATE`/`DELETE` sebagian data | ≤ 24 jam | 1–2 jam | Restore dump ke project sementara, ekstrak tabel terdampak, patch selektif ke produksi |
| Project Supabase paused | 0 (data utuh) | 5–15 menit | Dashboard → Resume project. Verifikasi `pg_cron` jalan kembali, verifikasi webhook |
| Project terhapus permanen | ≤ 24 jam | 4–8 jam | Buat project baru → jalankan semua migrasi → `pg_restore` → update `SUPABASE_URL`/anon key di Cloudflare → **update Notification URL di dashboard Midtrans** → update Site URL & Redirect URL di Supabase Auth |
| Cloudflare Pages bermasalah | 0 | 30 menit | Deploy bundle statis yang sama ke Netlify Free (juga mengizinkan komersial). Karena frontend murni statis, ini benar-benar hanya memindahkan file |
| Midtrans down | 0 | — | Fallback ke pembayaran di kasir (cash/EDC), dicatat sebagai `provider='manual'` (LSN-07). Booking online sementara dimatikan lewat `settings` |
| Internet venue mati | 0 | — | PWA menyajikan jadwal hari ini dari cache (OPS-18); kasir mencetak jadwal pagi hari sebagai backup kertas (OPS-19) |
| Listrik mati | — | — | Rekomendasi non-software: UPS kecil untuk router + 1 tablet kasir (**ASUMSI** Rp 700.000–1.500.000) |

Satu hal yang harus disiapkan sekarang, bukan nanti: **daftar checklist "pindah project"** yang berisi semua tempat di mana URL Supabase tertulis (env Cloudflare, Notification URL Midtrans, Site URL Auth, Redirect URLs, endpoint cron-job.org, connection string GitHub Actions). Tanpa daftar ini, pemulihan yang seharusnya 4 jam menjadi 2 hari.

---

### 6.16 Estimasi Biaya Bulanan

**ASUMSI kurs Rp 16.500/USD. [PERLU KONFIRMASI]**

#### 6.16.1 Tahap T0–T1 — MVP dan go-live (gratis)

| Komponen | Tier | Biaya/bulan |
|---|---|---|
| Cloudflare Pages | Free (komersial diizinkan) | **Rp 0** |
| Cloudflare R2 (gambar + backup) | Free 10 GB | **Rp 0** |
| Supabase (2 project: staging + production) | Free | **Rp 0** |
| Brevo (custom SMTP) | Free 300 email/hari | **Rp 0** |
| GitHub (private repo + Actions) | Free | **Rp 0** |
| cron-job.org | Free | **Rp 0** |
| Domain `.com` (Cloudflare Registrar, at-cost ±USD 10,44/tahun) | — | **±Rp 14.400** |
| **Total biaya tetap** | | **±Rp 14.400/bulan** |

Biaya transaksi (bukan biaya hosting), **ASUMSI** omzet online Rp 157.750.000/bulan dari 1.280 transaksi:

| Kategori merchant | Perhitungan | MDR/bulan |
|---|---|---|
| **Terdaftar UMi** (omzet tahunan ≤ Rp 2 miliar) | Semua transaksi ≤ Rp 500.000 bebas MDR; hanya booking grup Rp 750.000 kena 0,3% | **±Rp 67.500** |
| **Terdaftar UKE** (default gateway kalau tidak diprotes) | Transaksi ≤ Rp 100.000 bebas; sisanya 0,7% | **±Rp 1.104.250** |

**Selisihnya ±Rp 12,4 juta per tahun, hanya dari klasifikasi kategori merchant.** Ini pos penghematan terbesar di seluruh proyek dan tidak melibatkan satu baris kode pun. Gateway cenderung men-default merchant online ke UKE/UME — **minta klasifikasi UMi secara tertulis saat onboarding.**

**[PERLU KONFIRMASI]** Berapa omzet tahunan SPL? Jawaban ini menentukan apakah biaya QRIS 0% atau 0,7%.
**[PERLU KONFIRMASI]** Apakah tier MDR 0% per 1 Oktober 2026 sudah diimplementasikan di sistem billing Midtrans? Halaman harga publik masih menulis 0,7% flat. **Jangan masukkan penghematan ini ke proyeksi keuangan sampai ada konfirmasi tertulis** — hitung skenario konservatif 0,7%.

#### 6.16.2 Tahap T2 — stabilisasi (3–6 bulan setelah launch)

| Komponen | Tier | Biaya/bulan |
|---|---|---|
| Supabase Pro | USD 25 | **±Rp 412.500** |
| Cloudflare Pages | Free | Rp 0 |
| Brevo | Free | Rp 0 |
| Domain | — | ±Rp 14.400 |
| **Total biaya tetap** | | **±Rp 427.000/bulan** |

Yang **dibeli** dengan Rp 412.500 itu, konkretnya:

| Yang didapat | Kenapa penting untuk bisnis yang memutar uang |
|---|---|
| **Tidak pernah di-pause** | Menghilangkan BR-02 dan BR-03 sepenuhnya |
| **Daily backup otomatis** | Menghilangkan BR-01 — risiko terbesar di seluruh dokumen ini |
| **Log retention 7 hari** | Bisa menyelidiki sengketa pembayaran hari Senin yang dilaporkan hari Rabu |
| DB 8 GB, egress 250 GB | Tidak perlu memikirkan kuota lagi |
| Email support | Ada yang bisa dihubungi jam 11 malam |

Setara **±7 sesi biliar prime weekend per bulan**. Untuk sistem yang memegang catatan pembayaran pelanggan, ini bukan pengeluaran — ini asuransi.

**Pemicu upgrade (upgrade lebih cepat kalau salah satu terpenuhi):** DB > 350 MB, egress > 4 GB/bulan, venue berencana tutup > 7 hari, atau terjadi satu insiden kehilangan data sekecil apa pun.

#### 6.16.3 Tahap T3 — skala (Fase 2/3, hanya kalau volume membenarkan)

| Komponen | Kondisi pemicu | Biaya/bulan |
|---|---|---|
| Supabase Pro | — | ±Rp 412.500 |
| Resend/Brevo berbayar | > 300 email/hari | ±Rp 150.000–330.000 |
| Fonnte (WhatsApp unofficial, **nomor terpisah**) | Butuh WA otomatis, siap terima risiko banned | ±Rp 25.000–110.000 |
| WABA resmi via BSP | Volume 2.400 pesan/bulan | ±Rp 500.000–856.000 + PPN |
| Supabase custom domain add-on | Opsional, tidak perlu | ±USD 10 (**[PERLU KONFIRMASI]**) |
| **Total realistis** | | **±Rp 600.000 – 1.300.000/bulan** |

**Perhatikan proporsinya:** biaya WhatsApp resmi (±Rp 500.000–856.000) **lebih besar daripada seluruh biaya hosting berbayar**. WhatsApp resmi bukan solusi notifikasi murah — ia pos biaya tersendiri. Karena itu MVP memakai `wa.me` deep link (Rp 0, tanpa risiko banned) dan Web Push untuk admin (Rp 0, instan). Web Push untuk admin menyelesaikan ±80% kebutuhan "notifikasi realtime" tanpa biaya sama sekali. **Jangan bayar WhatsApp API hanya untuk memberi tahu admin sendiri.**

#### 6.16.4 Ringkasan tiga tahap

| Tahap | Pemicu pindah | Biaya tetap/bulan | Yang berubah |
|---|---|---|---|
| **T0 — MVP** | Sekarang | **Rp 0** | Domain `*.pages.dev`, Midtrans Sandbox |
| **T1 — Go-live** | Siap terima uang asli | **±Rp 14.400** | Beli domain, custom domain Cloudflare, Midtrans Production, verifikasi domain email Brevo |
| **T2 — Stabilisasi** | 1–3 bulan jalan, atau DB > 350 MB, atau tutup > 7 hari | **±Rp 427.000** | Supabase Pro |
| **T3 — Skala** | Volume WA/email melampaui free tier | **±Rp 600.000–1.300.000** | Tambah WA otomatis, email berbayar |

#### 6.16.5 Checklist teknis saat pindah ke domain sendiri

| ID | Item | Catatan |
|---|---|---|
| MG-01 | Pindahkan nameserver domain ke Cloudflare | Cloudflare Registrar menjual `.com` at-cost tanpa markup |
| MG-02 | Aktifkan custom domain di Cloudflare Pages | Gratis, SSL otomatis, tanpa batas jumlah domain |
| MG-03 | **Ubah Supabase Auth `Site URL` + `Redirect URLs`** | **Wajib.** Kalau tidak, magic link mengarah ke domain lama dan login rusak total |
| MG-04 | **Ubah Midtrans Notification URL** ke Edge Function produksi, ganti Client Key & Server Key dari sandbox ke production | **Wajib.** Verifikasi dengan satu transaksi nyata bernilai kecil |
| MG-05 | Batasi CORS ke domain baru saja | — |
| MG-06 | Tambahkan record SPF, DKIM, DMARC dari Brevo ke DNS Cloudflare | Tanpa ini email konfirmasi masuk spam dan pelanggan menelepon marah |
| MG-07 | Update URL di cron-job.org dan di connection string GitHub Actions | Sering terlupa |
| MG-08 | Update CSP kalau nanti Snap Midtrans dipakai | Popup pembayaran akan diblokir tanpa ini |
| MG-09 | Verifikasi ulang uji bukti exclusion constraint di project produksi | 5 menit, mencegah bencana |

**Beli domain sebelum menyebarkan link ke pelanggan.** Mengubah domain setelah pelanggan menyimpan bookmark, menempel QR di meja, atau memasang link di Instagram adalah kerugian yang sepenuhnya bisa dihindari.

---

### 6.17 Daftar Asumsi Seksi Ini yang Butuh Konfirmasi Pemilik

| ID | Pertanyaan | Dampak kalau salah |
|---|---|---|
| Q6-01 | Jam operasional pasti? (ASUMSI 10.00–02.00 WIB) | Seluruh grid slot, `business_date`, dan laporan harian bergeser |
| Q6-02 | Jumlah meja saat ini dan pembagian reguler vs VIP? (ASUMSI 8 meja: 6 STD + 2 VIP) | Seed data, denah meja, estimasi kapasitas |
| Q6-03 | Struktur tarif riil per band waktu dan tipe meja? (semua angka seed adalah ASUMSI) | **Tidak boleh go-live tanpa ini** |
| Q6-04 | Granularitas booking 30 atau 60 menit? (ASUMSI 30 menit) | Constraint `bookings_grid_30m`, `calc_table_price` |
| Q6-05 | Durasi hold 17 menit terasa lama untuk Sabtu malam? Trade-off pelanggan gaptek vs slot tersandera | Nilai `settings.hold_minutes` dan `qris_expiry_minutes` |
| Q6-06 | Perlu jeda bersih-bersih antar sesi? (ASUMSI tidak ada) | Ekspresi range di exclusion constraint |
| Q6-07 | Jumat dihitung weekend untuk tarif? (ASUMSI ya) | `resolve_day_type()` |
| Q6-08 | Harga tayang tax-inclusive atau tax-exclusive? (REKOMENDASI: inclusive, karena pelanggan membayar QRIS di muka dan harus melihat angka final) | Seluruh tampilan harga dan `tax_inclusive_part()` |
| Q6-09 | **Tarif PBJT riil menurut Perda setempat** untuk (a) F&B, (b) jasa hiburan. Apakah "Sports Pool Lounge" berisiko dikategorikan "bar" dengan tarif 40% alih-alih 10%? | **Selisih 30 poin persentase omzet — bisa menentukan untung atau rugi. Ini pertanyaan paling mahal di seluruh dokumen** |
| Q6-10 | Omzet tahunan SPL, untuk menentukan kategori merchant UMi vs UKE | Selisih ±Rp 12,4 juta/tahun di MDR |
| Q6-11 | Kebijakan pembatalan resmi (usulan di 6.8.2) | Logika `cancel_booking` dan teks di halaman checkout |
| Q6-12 | Walk-in akan benar-benar diinput kasir ke sistem yang sama? | **Kalau tidak, seluruh jaminan anti double-booking runtuh di dunia nyata.** Ini risiko adopsi manusia, bukan risiko teknis |
| Q6-13 | Jumlah staf yang butuh akses admin | Menentukan apakah `is_staff()` cukup atau perlu peran di JWT |
| Q6-14 | Venue pernah tutup > 7 hari berturut-turut? | Menentukan seberapa kritis keepalive anti-pause |
| Q6-15 | Siapa pemegang akun root tiap layanan dan siapa cadangannya? | Bus factor pada akun payment gateway |
| Q6-16 | Apakah Bapenda setempat mewajibkan tapping box / alat perekam transaksi online? | Bisa memaksa perubahan arsitektur (integrasi tambahan) |