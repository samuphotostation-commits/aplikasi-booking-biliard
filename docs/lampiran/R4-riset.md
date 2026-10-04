# Arsitektur Data & Strategi Konkurensi Booking Meja Biliar (PostgreSQL / Supabase) — Anti Double-Booking

## 4. Arsitektur Data & Strategi Konkurensi Booking

### 4.0 Ringkasan keputusan arsitektur

| # | Keputusan | Pilihan | Alasan singkat |
|---|---|---|---|
| D-01 | Representasi waktu | **Hybrid**: `tstzrange` sebagai *source of truth*, grid 30 menit dihitung saat *read* | Perpanjangan sesi & durasi tidak bulat jadi trivial, tabel kecil, UI tetap dapat grid |
| D-02 | Mekanisme anti-overlap | **`EXCLUDE USING gist` + `btree_gist`**, partial (`WHERE status IN (...)`) | Atomik di level DB, satu-satunya cara yang benar di bawah konkurensi |
| D-03 | Isolation level | `READ COMMITTED` (default) | Exclusion constraint sudah cukup; `SERIALIZABLE` menambah retry tanpa manfaat |
| D-04 | Semua tulis booking | Lewat RPC `SECURITY DEFINER`, **tidak ada policy INSERT** untuk client | Client tidak bisa mengarang `table_amount = 0` |
| D-05 | Hold saat bayar | 10 menit di DB, QRIS expiry 8 menit, grace expiry 2 menit | Gateway selalu tutup **sebelum** DB melepas slot |
| D-06 | Idempotency webhook | Tabel `payment_events` dengan `UNIQUE (provider, event_fingerprint)` | Midtrans mengakui dapat mengirim notifikasi ganda dan *out of order* |
| D-07 | Waktu | `timestamptz` di semua kolom, `business_date` generated dengan batas **02:00 WIB** | Laporan harian tidak memotong sesi tengah malam |
| D-08 | Realtime | **Broadcast from database** (`realtime.send`) payload anonim, **bukan** `postgres_changes` di tabel `bookings` | `postgres_changes` mengirim seluruh baris → bocor `user_id` & nominal |
| D-09 | Uang | `integer` Rupiah penuh (tanpa sen) | Tidak ada `float`. `numeric` hanya untuk parsing `gross_amount` dari Midtrans |

---

### 4.1 Model representasi waktu: slot diskrit vs `tstzrange`

**Opsi (a) — Baris slot diskrit pre-generated.** Satu baris per meja per 30 menit, di-*generate* di muka (misal 90 hari ke depan), kolom `status` per baris.

**Opsi (b) — Rentang bebas `tstzrange`.** Satu baris per booking, kolom `during tstzrange`, dilindungi exclusion constraint.

| Kriteria | (a) Slot diskrit | (b) `tstzrange` | Pemenang |
|---|---|---|---|
| **Query ketersediaan** | `SELECT ... WHERE status='free'` — sangat lugas, index B-tree biasa | Perlu `generate_series` + `NOT EXISTS ... && ...`, atau anti-join range | (a) |
| **Perpanjangan sesi** | Harus INSERT baris slot tambahan lalu ikat ke `booking_group_id`; kalau slot berikutnya sudah terjual, perlu logika rollback manual multi-baris | `UPDATE bookings SET ends_at = ends_at + interval '30 min'` — exclusion constraint otomatis menolak kalau bentrok, **satu statement, atomik** | (b) telak |
| **Durasi tidak bulat** (45 menit, 1j20m, sesi walk-in yang berakhir 21:47) | Mustahil tanpa membulatkan ke atas → pelanggan bayar waktu yang tidak dipakai, atau slot "hangus separuh" | Native. `ends_at` bebas | (b) telak |
| **Ukuran tabel** | 10 meja x 32 slot/hari (10:00–02:00 @30m) = 320 baris/hari = **116.800 baris/tahun** yang mayoritas `free` (sampah) | Hanya booking nyata. ASUMSI 30 booking/hari = **~11.000 baris/tahun** | (b), ~10x lebih kecil |
| **Ops housekeeping** | Butuh cron generator slot masa depan. Kalau cron mati (free tier pause), kalender kosong → tidak bisa booking sama sekali | Tidak ada generator. Tidak ada cron kritikal | (b) |
| **Ubah jam operasional / tambah meja (AD-07)** | Harus regenerate / backfill ratusan ribu baris | Cukup ubah baris konfigurasi | (b) |
| **Ubah harga sesi (AD-07)** | Harga sering ikut ter-*denormalize* ke tiap baris slot → inkonsisten | Harga di-*snapshot* ke booking saat transaksi saja | (b) |
| **Kompleksitas UI** | Nol — API sudah mengembalikan grid | Backend harus menyintesis grid; **tapi ini dikerjakan sekali** di satu fungsi | (a), tapi bedanya kecil |

**Keputusan D-01 — Hybrid.** `tstzrange` sebagai kebenaran, grid 30 menit disintesis pada saat baca lewat satu fungsi `get_availability()`. UI tetap menerima array slot 30-menitan seperti opsi (a), sementara DB menyimpan seperti opsi (b). Ini mengambil keunggulan keduanya; satu-satunya biaya adalah ~40 baris SQL di satu fungsi.

> **Detail kritikal — bound `'[)'`.** Range harus *half-open*: `[20:00, 21:00)` dan `[21:00, 22:00)` **tidak** overlap. Jika memakai `'[]'`, dua sesi berurutan akan saling menolak dan Anda kehilangan penjualan. Ini kesalahan paling sering pada implementasi range booking.

---

### 4.2 DDL inti

#### 4.2.1 Extension & tipe

```sql
-- Jalankan sekali. Di Supabase, extension biasanya masuk schema `extensions`.
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron;      -- untuk job expiry

-- Verifikasi terpasang:
select e.extname, n.nspname
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
 where e.extname = 'btree_gist';

create type public.booking_status as enum (
  'hold',        -- slot dikunci, menunggu pembayaran QRIS
  'confirmed',   -- pembayaran settled
  'seated',      -- tamu sudah main
  'completed',   -- selesai
  'cancelled',   -- dibatalkan manusia (user/admin)
  'expired',     -- hold kedaluwarsa, tidak dibayar
  'no_show'      -- sudah bayar, tidak datang
);

create type public.payment_status as enum (
  'pending', 'paid', 'failed', 'expired', 'refunded', 'partial_refunded'
);
```

Status yang **memblokir slot**: `hold`, `confirmed`, `seated`, `completed`, `no_show`.
Status yang **tidak memblokir**: `cancelled`, `expired`. Inilah yang dikeluarkan dari constraint.

#### 4.2.2 Master meja

```sql
create table public.billiard_tables (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,              -- 'M-01', 'VIP-02'
  name          text not null,
  table_type    text not null default 'standard'
                check (table_type in ('standard','vip')),
  hourly_price  integer not null check (hourly_price > 0),  -- Rupiah penuh, mis. 60000
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
```

`is_active = false` dipakai untuk meja yang sedang rusak/servis (AD-07) — jangan pernah `DELETE` meja yang punya riwayat booking; `ON DELETE RESTRICT` di FK sudah mencegahnya.

#### 4.2.3 Tabel `bookings` — jantung sistem

```sql
create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  booking_code    text not null unique,               -- 'SPL-260823-0042'
  table_id        uuid not null references public.billiard_tables(id) on delete restrict,
  user_id         uuid          references auth.users(id) on delete restrict,
  channel         text not null default 'online'
                  check (channel in ('online','walk_in','phone')),

  starts_at       timestamptz not null,
  ends_at         timestamptz not null,

  -- Kolom terhitung: inilah yang dijaga exclusion constraint.
  during          tstzrange
                  generated always as (tstzrange(starts_at, ends_at, '[)')) stored,

  -- Hari operasional: batas ganti hari jam 02:00 WIB, bukan 00:00.
  business_date   date
                  generated always as (
                    ((starts_at at time zone 'Asia/Jakarta') - interval '2 hours')::date
                  ) stored,

  status          public.booking_status not null default 'hold',
  hold_expires_at timestamptz,

  -- Snapshot harga saat transaksi. JANGAN join ke harga master untuk laporan.
  table_amount    integer not null default 0 check (table_amount >= 0),
  fnb_amount      integer not null default 0 check (fnb_amount  >= 0),
  service_fee     integer not null default 0 check (service_fee >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  total_amount    integer generated always as
                  (table_amount + fnb_amount + service_fee - discount_amount) stored,

  guest_count     smallint check (guest_count between 1 and 20),
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,

  constraint bookings_time_order check (ends_at > starts_at),
  constraint bookings_min_duration check (ends_at - starts_at >= interval '30 minutes'),
  constraint bookings_max_duration check (ends_at - starts_at <= interval '8 hours'),

  -- Semua booking online harus jatuh di grid 30 menit waktu WIB.
  constraint bookings_grid_30m check (
    date_part('minute', starts_at at time zone 'Asia/Jakarta') in (0, 30)
    and date_part('second', starts_at at time zone 'Asia/Jakarta') = 0
    and (extract(epoch from (ends_at - starts_at))::bigint % 1800) = 0
  ),

  -- hold_expires_at wajib ada persis saat status = 'hold', dan wajib NULL selainnya.
  constraint bookings_hold_deadline check (
    (status = 'hold') = (hold_expires_at is not null)
  )
);
```

Catatan validitas: kedua ekspresi generated column memakai fungsi IMMUTABLE. `tstzrange(timestamptz, timestamptz, text)` immutable; operator `AT TIME ZONE` dengan zona **literal** memetakan ke `timezone(text, timestamptz)` yang ditandai IMMUTABLE oleh PostgreSQL (yang **tidak** immutable adalah cast `timestamptz::timestamp` polos, karena bergantung GUC `TimeZone` sesi). WIB (Asia/Jakarta, UTC+7) tidak punya DST dan tidak berubah sejak 1964, jadi risiko *stale* akibat update tzdata praktis nol.

> **Catatan `channel`.** Booking walk-in yang diinput kasir **wajib** masuk tabel yang sama. Kalau meja dipakai tamu offline tapi tidak tercatat, sistem online akan menjual slot yang sama. Ini bug bisnis paling mahal dan paling sering terlewat.

#### 4.2.4 Exclusion constraint (D-02) — DDL persis

```sql
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    table_id with =,
    during   with &&
  )
  where (status in ('hold','confirmed','seated','completed','no_show'));
```

Yang terjadi:
- `btree_gist` menyediakan opclass GiST untuk `uuid` sehingga `table_id WITH =` bisa satu index dengan `during WITH &&`. Tanpa extension ini: `ERROR: data type uuid has no default operator class for access method "gist"`.
- Klausa `WHERE` membuatnya **partial** — baris `cancelled`/`expired` tidak masuk index sama sekali, sehingga slot otomatis kembali tersedia begitu status diubah, tanpa perlu hapus baris. Riwayat tetap utuh untuk audit.
- Pelanggaran memunculkan **SQLSTATE `23P01` (`exclusion_violation`)** — bukan `23505`. Handler aplikasi harus menangkap kode ini secara spesifik.
- Index parsial yang dibuat constraint ini juga menjadi index utama untuk query ketersediaan (predikat query cocok dengan predikat index), jadi tidak perlu index GiST tambahan.

**Varian alternatif tanpa generated column** (kalau ingin menghindari ketergantungan pada generated column — perhatikan tanda kurung ekstra yang wajib mengelilingi ekspresi):

```sql
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    table_id                                        with =,
    (tstzrange(starts_at, ends_at, '[)'))           with &&
  )
  where (status in ('hold','confirmed','seated','completed','no_show'));
```

**Varian dengan buffer bersih-bersih meja** (kalau perlu jeda 5 menit antar sesi) — **[PERLU KONFIRMASI]** apakah operasional butuh jeda:

```sql
  (tstzrange(starts_at, ends_at + interval '5 minutes', '[)')) with &&
```

**Uji bukti bahwa constraint bekerja** (jalankan di SQL editor Supabase, akan rollback):

```sql
begin;
  insert into public.bookings (booking_code, table_id, user_id, starts_at, ends_at, status, hold_expires_at, table_amount)
  values ('TEST-1', :tbl, :usr, '2026-08-29 20:00+07', '2026-08-29 21:00+07', 'hold', now()+interval '10 min', 60000);

  -- Harus SUKSES (bersebelahan, tidak overlap karena bound '[)'):
  insert into public.bookings (booking_code, table_id, user_id, starts_at, ends_at, status, hold_expires_at, table_amount)
  values ('TEST-2', :tbl, :usr, '2026-08-29 21:00+07', '2026-08-29 22:00+07', 'hold', now()+interval '10 min', 60000);

  -- Harus GAGAL: ERROR 23P01 conflicting key value violates exclusion constraint
  insert into public.bookings (booking_code, table_id, user_id, starts_at, ends_at, status, hold_expires_at, table_amount)
  values ('TEST-3', :tbl, :usr, '2026-08-29 20:30+07', '2026-08-29 21:30+07', 'hold', now()+interval '10 min', 60000);
rollback;
```

#### 4.2.5 Index pendukung

```sql
create index bookings_user_recent_idx    on public.bookings (user_id, starts_at desc);
create index bookings_report_idx         on public.bookings (business_date, status);
create index bookings_hold_expiry_idx    on public.bookings (hold_expires_at)
                                          where status = 'hold';
```

---

### 4.3 Alur hold / kunci sementara saat pembayaran QRIS

#### 4.3.1 Anggaran waktu (D-05)

| Peristiwa | Waktu relatif | Nilai |
|---|---|---|
| Baris `hold` dibuat | T+0 | — |
| `hold_expires_at` | T+10:00 | 10 menit |
| Midtrans QRIS `expiry` dikirim saat charge | T+8:00 | **8 menit** |
| Grace period job expiry | +2:00 setelah `hold_expires_at` | 2 menit |
| Slot benar-benar dilepas | T+12:00 | — |

Prinsip yang tidak boleh dilanggar: **expiry gateway < expiry DB < eksekusi job pelepasan**. Midtrans mendokumentasikan notifikasi `expire` bisa datang hingga ~90 detik setelah kejadian; grace 2 menit menutupi itu dengan margin. Dengan urutan ini, saat job expiry akhirnya menyentuh baris, Midtrans sudah pasti tidak akan menerima pembayaran baru untuk `order_id` tersebut.

**[PERLU KONFIRMASI]** 10 menit terasa lama untuk Sabtu malam yang ramai. Alternatif: 7 menit hold / 5 menit QRIS. Pemilik perlu memutuskan trade-off antara "pelanggan gaptek butuh waktu buka m-banking" vs "slot tersandera".

#### 4.3.2 RPC pembuatan hold

Transaksi ini **harus sangat pendek**. Tidak boleh ada HTTP call ke Midtrans di dalamnya (lihat §4.8).

```sql
create or replace function public.create_booking_hold(
  p_table_id         uuid,
  p_starts_at        timestamptz,
  p_duration_minutes integer
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_ends_at timestamptz := p_starts_at + make_interval(mins => p_duration_minutes);
  v_price   integer;
  v_booking public.bookings;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_starts_at < now() - interval '5 minutes' then
    raise exception 'SLOT_IN_PAST' using errcode = 'P0001';
  end if;

  if p_starts_at > now() + interval '30 days' then
    raise exception 'TOO_FAR_AHEAD' using errcode = 'P0001';
  end if;

  -- Anti slot-squatting: maksimal 2 hold aktif per user.
  if (select count(*) from public.bookings
       where user_id = v_uid and status = 'hold' and hold_expires_at > now()) >= 2 then
    raise exception 'TOO_MANY_HOLDS' using errcode = 'P0001';
  end if;

  v_price := public.calc_table_price(p_table_id, p_starts_at, v_ends_at);

  insert into public.bookings (
    booking_code, table_id, user_id, starts_at, ends_at,
    status, hold_expires_at, table_amount, channel
  ) values (
    public.next_booking_code(p_starts_at), p_table_id, v_uid, p_starts_at, v_ends_at,
    'hold', now() + interval '10 minutes', v_price, 'online'
  )
  returning * into v_booking;

  return v_booking;

exception
  when exclusion_violation then                       -- SQLSTATE 23P01
    raise exception 'SLOT_TAKEN'
      using errcode = '23P01',
            hint = 'Slot baru saja diambil pelanggan lain. Silakan pilih jam lain.';
end;
$$;

revoke all on function public.create_booking_hold(uuid, timestamptz, integer) from public;
grant execute on function public.create_booking_hold(uuid, timestamptz, integer) to authenticated;
```

Harga di-*snapshot* ke `table_amount` di sini. Kalau admin mengubah harga besok (AD-07), booking hari ini tidak ikut berubah — syarat mutlak agar laporan keuangan (AD-08) bisa direkonsiliasi.

#### 4.3.3 Job auto-release

```sql
create or replace function public.expire_stale_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  with expired as (
    update public.bookings b
       set status         = 'expired',
           hold_expires_at= null,
           cancelled_at   = now(),
           cancel_reason  = 'hold_timeout',
           updated_at     = now()
     where b.status = 'hold'
       and b.hold_expires_at < now() - interval '2 minutes'   -- grace
       and not exists (
             select 1 from public.payments p
              where p.booking_id = b.id
                and p.status in ('paid')
           )
    returning b.id
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

select cron.schedule(
  'expire-stale-holds',
  '* * * * *',
  $$ select public.expire_stale_holds() $$
);
```

`pg_cron` tersedia di free tier Supabase, **tetapi berhenti total kalau project di-pause** (7 hari tanpa request). Mitigasi wajib untuk requirement hosting gratis: pasang GitHub Actions cron (mis. tiap 10 menit) yang memanggil satu Edge Function health-check — sekaligus jadi keep-alive anti-pause **dan** jaring pengaman kalau `pg_cron` tidak jalan.

#### 4.3.4 Race: webhook telat vs job expiry — urutan operasi yang aman

Skenario buruk: job expiry membebaskan slot pada T+12:00, lalu webhook `settlement` menyusul pada T+12:03. Uang sudah masuk tetapi slot sudah bebas — atau lebih buruk, sudah dijual ke orang lain.

**Aturan: webhook menang, tapi harus merebut ulang slot lewat constraint, bukan lewat asumsi.**

```
BEGIN;
  SELECT * FROM payments  WHERE order_id = $1        FOR UPDATE;   -- kunci pembayaran
  SELECT * FROM bookings  WHERE id = payment.booking_id FOR UPDATE; -- kunci booking

  CASE booking.status OF
    'hold'                 -> UPDATE ... SET status='confirmed'      -- jalur normal
    'confirmed'            -> no-op (duplikat), COMMIT, return 200
    'expired' | 'cancelled'->
        -- COBA rebut ulang. Karena exclusion constraint bersifat partial dan
        -- 'confirmed' termasuk predikat, UPDATE ini SENDIRI akan memicu
        -- pengecekan index. Kalau slot sudah diambil orang lain -> 23P01.
        UPDATE bookings SET status='confirmed', confirmed_at=now(),
                            cancel_reason=null, hold_expires_at=null
         WHERE id = booking.id;
        ON 23P01 ->
            -- Slot sudah hilang. JANGAN gagalkan webhook.
            UPDATE payments SET status='paid' WHERE id=payment.id;
            INSERT INTO refund_tasks(payment_id, reason) VALUES (payment.id,'slot_lost_after_payment');
            INSERT INTO admin_alerts(severity, ...) VALUES ('critical', ...);
  END CASE;
COMMIT;
return 200;
```

Inti eleganya: **exclusion constraint juga menjaga `UPDATE`**, bukan hanya `INSERT`. Mengubah status dari `expired` (di luar predikat) menjadi `confirmed` (di dalam predikat) sama saja dengan menyisipkan entri baru ke index parsial, sehingga konflik terdeteksi otomatis. Tidak perlu advisory lock atau pengecekan manual.

Ordering `FOR UPDATE` selalu `payments` dulu lalu `bookings` di **semua** code path, untuk mencegah deadlock.

Selalu balas **HTTP 200** untuk duplikat, status tak dikenal, dan kasus "slot hilang". Balas 5xx **hanya** untuk kegagalan transien nyata (DB unreachable) supaya Midtrans melakukan retry.

---

### 4.4 Idempotency webhook Midtrans

#### 4.4.1 Fakta protokol yang mengikat desain

- Signature: `SHA512(order_id + status_code + gross_amount + ServerKey)`, dicocokkan dengan field `signature_key`. Jika tidak cocok → buang, jangan dicatat sebagai event.
- `gross_amount` datang sebagai **string berdesimal** (`"120000.00"`). Verifikasi signature harus memakai string mentah persis seperti diterima — jangan di-parse ke number lalu di-format ulang.
- `transaction_status` yang mungkin: `capture`, `settlement`, `pending`, `deny`, `cancel`, `expire`, `failure`, `refund`, `partial_refund`, `authorize`.
- Midtrans menyatakan notifikasi ganda untuk event yang sama **dapat** terjadi, dan notifikasi bisa tiba **out of order**.
- Latensi tipikal: ~20 detik untuk settlement, hingga ~90 detik untuk expire.

#### 4.4.2 Tabel `payments`

```sql
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references public.bookings(id) on delete restrict,
  provider            text not null default 'midtrans',
  order_id            text not null,                    -- yang dikirim ke Midtrans
  gross_amount        integer not null check (gross_amount > 0),
  method              text not null default 'qris',
  status              public.payment_status not null default 'pending',
  qr_string           text,
  qr_url              text,
  transaction_id      text,                             -- id dari Midtrans
  expires_at          timestamptz not null,
  paid_at             timestamptz,
  settlement_time     timestamptz,
  raw_charge_response jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payments_order_unique unique (provider, order_id)
);

-- Cegah dua QR aktif untuk satu booking.
create unique index payments_one_active_per_booking
  on public.payments (booking_id)
  where status in ('pending','paid');
```

`order_id` harus **unik seumur hidup** dan tidak boleh didaur ulang — Midtrans menolak `order_id` yang pernah dipakai. Format yang aman: `SPL-<booking_code>-<attempt>`, mis. `SPL-260823-0042-1`. Kalau pelanggan minta QR baru setelah QR pertama expired, naikkan `attempt`.

#### 4.4.3 Tabel `payment_events` — kunci idempotency

```sql
create table public.payment_events (
  id                 bigserial primary key,
  provider           text not null default 'midtrans',
  order_id           text not null,
  transaction_id     text,
  transaction_status text not null,
  fraud_status       text,
  status_code        text not null,
  gross_amount       numeric(14,2) not null,
  signature_key      text not null,

  -- Sidik jari event. signature_key SAJA TIDAK CUKUP karena tidak
  -- mengandung transaction_status: 'pending' dan 'settlement' bisa
  -- menghasilkan signature yang berbeda ATAU sama tergantung status_code.
  event_fingerprint  text not null
                     generated always as (
                       encode(sha256(convert_to(
                         coalesce(order_id,'')          || '|' ||
                         coalesce(transaction_id,'')    || '|' ||
                         coalesce(status_code,'')       || '|' ||
                         coalesce(transaction_status,'')|| '|' ||
                         coalesce(fraud_status,'')      || '|' ||
                         gross_amount::text, 'UTF8')), 'hex')
                     ) stored,

  transaction_time   timestamptz,
  payload            jsonb not null,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  process_result     text,

  constraint payment_events_unique_event unique (provider, event_fingerprint)
);

create index payment_events_order_idx on public.payment_events (order_id, received_at desc);
```

#### 4.4.4 Ledger pendapatan — anti double-count

```sql
create table public.revenue_ledger (
  id              bigserial primary key,
  business_date   date   not null,
  booking_id      uuid   references public.bookings(id),
  payment_id      uuid   references public.payments(id),
  entry_type      text   not null
                  check (entry_type in ('sale_table','sale_fnb','service_fee',
                                        'discount','gateway_fee','refund','adjustment')),
  amount          integer not null,          -- negatif untuk refund/discount/fee
  source_event_id bigint references public.payment_events(id),
  memo            text,
  created_at      timestamptz not null default now(),

  -- INI penguncinya: satu event webhook hanya boleh menghasilkan
  -- satu baris per jenis entri. Retry berapa kali pun tidak menambah uang.
  constraint revenue_ledger_unique_source unique (source_event_id, entry_type)
);
```

Ledger bersifat **append-only**. Koreksi dilakukan dengan baris `adjustment` bernilai negatif, tidak pernah dengan `UPDATE` atau `DELETE`. Laporan keuangan (AD-08) dibangun **dari ledger**, bukan dari `SUM(bookings.total_amount)` — karena refund parsial dan biaya gateway tidak terwakili di tabel booking.

#### 4.4.5 Urutan pemrosesan webhook

```
 1. Verifikasi signature: sha512(order_id + status_code + gross_amount_raw + SERVER_KEY)
    != signature_key  -> HTTP 401, STOP. Jangan tulis apa pun.
 2. BEGIN;
 3. INSERT INTO payment_events (...) 
      ON CONFLICT (provider, event_fingerprint) DO NOTHING
      RETURNING id;
    -> tidak ada baris kembali = DUPLIKAT. COMMIT; HTTP 200; STOP.
 4. SELECT * FROM payments WHERE provider='midtrans' AND order_id=$1 FOR UPDATE;
    -> tidak ada = order_id asing. Catat alert, COMMIT, HTTP 200 (jangan buat Midtrans retry selamanya).
 5. Validasi nominal: round(event.gross_amount) = payments.gross_amount
    -> tidak sama = tampering / salah konfigurasi. Alert critical, JANGAN confirm booking.
 6. SELECT * FROM bookings WHERE id = payments.booking_id FOR UPDATE;
 7. Guard out-of-order via rank:
       pending=1, authorize=2, capture=3, settlement=4,
       deny/cancel/expire/failure=4, refund/partial_refund=5
    Terapkan hanya jika rank_baru >= rank_sekarang.
    Contoh yang dicegah: notifikasi 'pending' yang telat tidak boleh
    menurunkan booking yang sudah 'confirmed'.
 8. Terapkan transisi (lihat §4.3.4 untuk cabang expired/cancelled).
 9. INSERT INTO revenue_ledger (..., source_event_id = <id dari langkah 3>)
      ON CONFLICT (source_event_id, entry_type) DO NOTHING;
10. UPDATE payment_events SET processed_at=now(), process_result='applied' WHERE id=<id>;
11. COMMIT; HTTP 200.
```

Tiga lapis proteksi yang saling menutupi: (1) `UNIQUE (provider, event_fingerprint)` menahan replay identik, (2) `FOR UPDATE` menyerialkan pemroses konkuren, (3) `UNIQUE (source_event_id, entry_type)` menahan uang tercatat dua kali bahkan jika lapis 1 dan 2 gagal.

**Penting:** hanya perlakukan `settlement` (dan `capture` dengan `fraud_status = 'accept'`) sebagai lunas. Untuk QRIS, status yang relevan adalah `settlement`. `pending` **bukan** lunas.

---

### 4.5 Zona waktu

#### 4.5.1 Aturan penyimpanan

1. Semua kolom waktu bertipe **`timestamptz`**. Tidak pernah `timestamp without time zone`. `timestamptz` menyimpan titik waktu absolut (UTC internal) — inilah yang benar untuk peristiwa nyata seperti "sesi dimulai".
2. Zona ditulis **eksplisit** di setiap ekspresi (`at time zone 'Asia/Jakarta'`). Jangan pernah bergantung pada GUC `TimeZone` — nilainya berbeda antara pooler Supabase, Edge Function runtime, dan SQL editor.
3. Rendering ke pengguna dilakukan di client dengan zona eksplisit, bukan dengan zona OS perangkat.

#### 4.5.2 Batas hari operasional 02:00 (D-07)

Venue tutup jam 02:00 dini hari. Sesi yang dimulai pukul 01:00 tanggal 24 Agustus secara akuntansi milik **tanggal 23 Agustus**.

```sql
business_date = ((starts_at at time zone 'Asia/Jakarta') - interval '2 hours')::date
```

Verifikasi:

| `starts_at` (WIB) | dikurangi 2 jam | `business_date` | Benar? |
|---|---|---|---|
| 23 Agu 20:00 | 23 Agu 18:00 | **23 Agu** | ya |
| 23 Agu 23:30 | 23 Agu 21:30 | **23 Agu** | ya |
| 24 Agu 00:30 | 23 Agu 22:30 | **23 Agu** | ya, ini yang kritikal |
| 24 Agu 01:59 | 23 Agu 23:59 | **23 Agu** | ya |
| 24 Agu 02:00 | 24 Agu 00:00 | **24 Agu** | ya, batas tepat |
| 24 Agu 10:00 | 24 Agu 08:00 | **24 Agu** | ya |

#### 4.5.3 Rentang satu hari operasional untuk query jadwal

```sql
-- Window hari operasional p_date: 10:00 WIB hari itu s/d 02:00 WIB hari berikutnya.
select
  (p_date::timestamp        + time '10:00') at time zone 'Asia/Jakarta' as day_open,
  ((p_date + 1)::timestamp  + time '02:00') at time zone 'Asia/Jakarta' as day_close;
```

Perhatikan arah konversi: `timestamp AT TIME ZONE 'Asia/Jakarta'` mengubah waktu **lokal → `timestamptz`** (inilah yang kita mau di sini), sedangkan `timestamptz AT TIME ZONE 'Asia/Jakarta'` mengubah **`timestamptz` → waktu lokal** (yang kita mau di §4.5.2). Dua operator ini terlihat sama tetapi berlawanan arah — sumber bug paling sering.

#### 4.5.4 Jebakan yang harus dihindari

| Jebakan | Kenapa salah | Perbaikan |
|---|---|---|
| `date_trunc('day', starts_at)` | Memotong menurut GUC `TimeZone` sesi (sering UTC) → sesi 01:00 WIB masuk hari sebelumnya menurut UTC | `date_trunc('day', starts_at at time zone 'Asia/Jakarta')` |
| `starts_at::date` | Sama, cast implisit ke zona sesi | Pakai kolom `business_date` |
| `GROUP BY created_at::date` untuk omzet | Waktu bayar ≠ hari operasional sesi | `GROUP BY business_date` |
| JS: `new Date().toISOString().slice(0,10)` | Menghasilkan tanggal **UTC**. Pukul 23:30 WIB sudah tanggal berikutnya di UTC → user membuka aplikasi malam hari dan melihat jadwal besok | `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())` |
| Menyimpan jam operasional sebagai `timestamptz` | Jam buka adalah "10:00 setiap hari", bukan titik waktu | Simpan sebagai `time` + zona di tabel `venue_settings` |
| Laporan "hari ini" pakai `CURRENT_DATE` | Jam 00:30 WIB, `CURRENT_DATE` sudah tanggal baru padahal shift masih berjalan | `((now() at time zone 'Asia/Jakarta') - interval '2 hours')::date` |

Karena WIB adalah UTC+7 tanpa DST, tidak ada masalah "jam yang tidak eksis" atau "jam ganda" yang menghantui sistem booking di negara ber-DST. Ini penyederhanaan besar — tapi jangan hard-code `+07` di aplikasi; tetap pakai nama zona IANA agar aman bila venue kedua dibuka di WITA/WIT.

---

### 4.6 Realtime — siaran perubahan status meja

#### 4.6.1 Kenapa bukan `postgres_changes` di tabel `bookings`

`postgres_changes` mengirim **seluruh baris** ke client. RLS menyaring *baris mana* yang dikirim, tetapi tidak menyaring *kolom*. Kalau pelanggan A boleh melihat bahwa slot terisi, dan kita memakai `postgres_changes` pada `bookings`, maka payload akan memuat `user_id`, `total_amount`, `notes`, dan `guest_count` milik pelanggan B. Ini kebocoran data langsung.

Selain itu Supabase merekomendasikan Broadcast sebagai jalur yang lebih *scalable* untuk menyebarkan perubahan database, karena satu perubahan dikirim sekali lalu di-*fan out*, sedangkan `postgres_changes` mengevaluasi RLS per subscriber.

#### 4.6.2 Desain channel

| Channel | Audiens | Payload | Berisi PII? |
|---|---|---|---|
| `availability:{business_date}` | semua user login (dan `anon` bila browsing tanpa login) | `{table_id, starts_at, ends_at, state}` dengan `state ∈ free\|held\|booked` | **tidak** |
| `booking:{booking_id}` | pemilik booking + staff | status booking, status pembayaran | ya, terbatas |
| `admin:orders` | staff/admin saja | order F&B & booking masuk lengkap | ya |
| `table:{table_id}` | staff saja | meja dibuka/ditutup, perpanjangan | ya |

#### 4.6.3 Trigger broadcast

```sql
create or replace function public.broadcast_slot_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   public.bookings := coalesce(new, old);
  v_state text;
begin
  v_state := case
               when tg_op = 'DELETE'                     then 'free'
               when v_row.status = 'hold'                then 'held'
               when v_row.status in ('confirmed','seated') then 'booked'
               else 'free'
             end;

  -- realtime.send(payload jsonb, event text, topic text, private boolean)
  perform realtime.send(
    jsonb_build_object(
      'table_id',  v_row.table_id,
      'starts_at', v_row.starts_at,
      'ends_at',   v_row.ends_at,
      'state',     v_state
      -- SENGAJA tidak ada: user_id, total_amount, notes, guest_count
    ),
    'slot_changed',
    'availability:' || v_row.business_date::text,
    true            -- private channel
  );
  return null;
end;
$$;

create trigger bookings_broadcast_slot
after insert or delete or update of status, starts_at, ends_at
on public.bookings
for each row execute function public.broadcast_slot_change();
```

Buat trigger terpisah `broadcast_booking_detail()` untuk `booking:{id}` dan `admin:orders` dengan payload lengkap.

#### 4.6.4 RLS pada `realtime.messages` — mencegah kebocoran channel

Inilah lapisan yang mencegah pelanggan menguping channel admin. Tanpa policy ini, siapa pun yang tahu nama topic bisa subscribe.

```sql
-- Channel ketersediaan: boleh dibaca siapa saja yang login.
create policy realtime_read_availability
on realtime.messages for select to authenticated
using ( (select realtime.topic()) like 'availability:%' );

-- Channel admin: hanya staff.
create policy realtime_read_admin
on realtime.messages for select to authenticated
using (
  (select realtime.topic()) in ('admin:orders')
  and public.is_staff((select auth.uid()))
);

-- Channel per-booking: hanya pemilik atau staff.
create policy realtime_read_own_booking
on realtime.messages for select to authenticated
using (
  (select realtime.topic()) like 'booking:%'
  and exists (
    select 1 from public.bookings b
     where b.id = nullif(split_part((select realtime.topic()), ':', 2), '')::uuid
       and ( b.user_id = (select auth.uid()) or public.is_staff((select auth.uid())) )
  )
);
```

**Tidak ada policy `INSERT` pada `realtime.messages` untuk `authenticated`.** Ini disengaja: tanpa itu, client bisa menyiarkan pesan palsu ke `availability:...` dan membuat semua device menampilkan slot "booked" padahal kosong — vandalisme murah yang mematikan penjualan. Semua broadcast hanya boleh berasal dari trigger database.

#### 4.6.5 Client

```ts
await supabase.realtime.setAuth()            // wajib untuk private channel

const ch = supabase
  .channel(`availability:${businessDate}`, { config: { private: true } })
  .on('broadcast', { event: 'slot_changed' }, ({ payload }) => {
    applySlotPatch(payload)                  // patch lokal, jangan refetch penuh
  })
  .subscribe()
```

Tetap panggil `get_availability()` sekali saat `SUBSCRIBED` dan saat tab kembali *visible* — broadcast bisa hilang saat jaringan seluler putus, dan realtime bukan pengganti *reconciliation*.

---

### 4.7 Row Level Security

#### 4.7.1 Prasyarat: peran

```sql
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  role       text not null default 'customer'
             check (role in ('customer','staff','admin','owner')),
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER: menembus RLS, sehingga tidak terjadi rekursi
-- ketika policy di tabel profiles memanggil fungsi ini.
create or replace function public.is_staff(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_uid and p.role in ('staff','admin','owner')
  );
$$;
```

**Optimasi wajib:** selalu bungkus `auth.uid()` dan `is_staff()` dalam `(select ...)`. PostgreSQL akan mengangkatnya menjadi InitPlan yang dievaluasi **sekali per query**, bukan sekali per baris. Perbedaannya bisa dari milidetik ke detik pada tabel yang tumbuh.

Untuk skala lebih besar, pindahkan `role` ke JWT lewat *custom access token hook* Supabase sehingga policy membaca `auth.jwt() -> 'app_metadata' ->> 'role'` tanpa query tabel sama sekali. Untuk MVP, `is_staff()` sudah memadai. **[PERLU KONFIRMASI]** perkiraan jumlah staff yang butuh akses admin.

#### 4.7.2 Policy `bookings`

```sql
alter table public.bookings enable row level security;

-- SELECT: hanya milik sendiri, atau staff melihat semua.
create policy bookings_select_own
on public.bookings for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_staff((select auth.uid())))
);

-- Tidak ada policy INSERT/UPDATE/DELETE untuk 'authenticated'.
-- Semua penulisan lewat RPC SECURITY DEFINER (create_booking_hold, dsb).
-- Konsekuensi: client tidak bisa menyisipkan booking dengan table_amount = 0,
-- tidak bisa mengubah status sendiri menjadi 'confirmed' tanpa bayar.

-- Staff boleh update (seated, no_show, catatan, pembatalan manual).
create policy bookings_update_staff
on public.bookings for update to authenticated
using      ( (select public.is_staff((select auth.uid()))) )
with check ( (select public.is_staff((select auth.uid()))) );

-- Tidak ada DELETE untuk siapa pun. Pembatalan = perubahan status.
```

#### 4.7.3 Ketersediaan tanpa membocorkan identitas pemesan

Ini persyaratan yang tampak bertentangan: pelanggan harus tahu slot 20:00 terisi, tetapi tidak boleh tahu **siapa** yang memesannya. Solusinya bukan policy tambahan di `bookings`, melainkan satu fungsi `SECURITY DEFINER` yang memproyeksikan **hanya** occupancy.

```sql
create or replace function public.get_availability(p_business_date date)
returns table (
  table_id   uuid,
  code       text,
  table_type text,
  slot_start timestamptz,
  slot_end   timestamptz,
  state      text,
  price      integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select (p_business_date::timestamp       + time '10:00') at time zone 'Asia/Jakarta' as day_open,
           ((p_business_date + 1)::timestamp + time '02:00') at time zone 'Asia/Jakarta' as day_close
  ),
  grid as (
    select t.id as table_id, t.code, t.table_type, t.hourly_price,
           g.s as slot_start,
           g.s + interval '30 minutes' as slot_end
      from public.billiard_tables t
      cross join bounds b
      cross join lateral generate_series(
                   b.day_open,
                   b.day_close - interval '30 minutes',
                   interval '30 minutes') as g(s)
     where t.is_active
  )
  select g.table_id, g.code, g.table_type, g.slot_start, g.slot_end,
         case
           when exists (
             select 1 from public.bookings bk
              where bk.table_id = g.table_id
                and bk.status in ('confirmed','seated','completed','no_show')
                and bk.during && tstzrange(g.slot_start, g.slot_end, '[)')
           ) then 'booked'
           when exists (
             select 1 from public.bookings bk
              where bk.table_id = g.table_id
                and bk.status = 'hold'
                and bk.hold_expires_at > now()
                and bk.during && tstzrange(g.slot_start, g.slot_end, '[)')
           ) then 'held'
           when g.slot_start < now() then 'past'
           else 'free'
         end as state,
         (g.hourly_price / 2)::integer as price
    from grid g
   order by g.code, g.slot_start;
$$;

revoke all on function public.get_availability(date) from public;
grant execute on function public.get_availability(date) to anon, authenticated;
```

Fungsi ini secara struktural tidak bisa membocorkan `user_id` — kolom itu tidak ada di `RETURNS TABLE`. Ini lebih kuat daripada mengandalkan client untuk tidak menampilkan field tertentu. `anon` diberi `EXECUTE` supaya calon pelanggan bisa mengintip ketersediaan sebelum login (mengurangi friksi konversi), sementara `create_booking_hold` tetap `authenticated`-only.

Query index yang dipakai adalah index parsial dari `bookings_no_overlap` — cocok persis dengan predikat `status IN (...) AND during && ...`.

#### 4.7.4 Policy tabel lain

```sql
-- payments: pelanggan hanya lihat pembayaran booking miliknya.
alter table public.payments enable row level security;
create policy payments_select_own
on public.payments for select to authenticated
using (
  exists (select 1 from public.bookings b
           where b.id = payments.booking_id
             and b.user_id = (select auth.uid()))
  or (select public.is_staff((select auth.uid())))
);

-- payment_events: TIDAK ADA policy untuk authenticated.
-- Hanya service_role (Edge Function webhook) yang menyentuhnya.
alter table public.payment_events enable row level security;

-- revenue_ledger: hanya admin/owner.
alter table public.revenue_ledger enable row level security;
create policy ledger_select_admin
on public.revenue_ledger for select to authenticated
using (
  exists (select 1 from public.profiles p
           where p.id = (select auth.uid()) and p.role in ('admin','owner'))
);

-- billiard_tables & menu: dibaca publik, ditulis admin.
alter table public.billiard_tables enable row level security;
create policy tables_read_all
on public.billiard_tables for select to anon, authenticated using (true);
create policy tables_write_admin
on public.billiard_tables for all to authenticated
using      ( (select public.is_staff((select auth.uid()))) )
with check ( (select public.is_staff((select auth.uid()))) );
```

Wajib diaudit sebelum rilis: jalankan Supabase Security Advisor dan pastikan **tidak ada** tabel di schema `public` dengan `rowsecurity = false`:

```sql
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public' and rowsecurity = false;
```

---

### 4.8 Skenario stress: 20 orang mengklik slot 20:00 Sabtu malam

**Prasyarat desain yang membuat skenario ini selamat:** transaksi pembuatan hold **tidak** memuat HTTP call. Kalau charge Midtrans dipanggil di dalam transaksi yang sama, 19 klien lain akan menunggu 500–2000 ms di lock index sebelum tahu mereka kalah — dan sebagian akan kena timeout gateway. Urutannya harus: **txn A (buat hold, < 10 ms) → COMMIT → HTTP charge Midtrans → txn B (simpan QR)**.

Urutan kejadian:

| T | Peristiwa |
|---|---|
| T+0 ms | 20 device memanggil `get_availability('2026-08-29')`. Semua menerima `state='free'` untuk M-03 @ 20:00. Ini hanya **petunjuk**, bukan jaminan — TOCTOU disengaja dan diterima. |
| T+0–80 ms | 20 request `create_booking_hold(M-03, 20:00, 60)` tiba di Edge Function, tersebar ke pool koneksi Postgres. |
| T+85 ms | 20 transaksi `BEGIN`, masing-masing menjalankan `INSERT INTO bookings`. |
| T+86 ms | Klien #7 (kebetulan tercepat sampai ke index) menyisipkan entri ke index GiST parsial `bookings_no_overlap`. Entri ini menandai xid #7 sebagai penulis. |
| T+86–90 ms | 19 transaksi lain mencoba menyisipkan entri yang **overlap** pada `(table_id=M-03, during && [20:00,21:00))`. Postgres mendeteksi konflik dengan entri milik transaksi yang belum commit, lalu **memblokir** mereka menunggu xid #7 selesai. Tidak ada polling, tidak ada spin — ini `XactLockTableWait` di kernel Postgres. |
| T+92 ms | Transaksi #7 `COMMIT`. Baris hold sah, `hold_expires_at = T+10 menit`. |
| T+93 ms | 19 transaksi lain bangun. Karena xid #7 **commit** (bukan abort), konflik nyata. Masing-masing gagal dengan `SQLSTATE 23P01 exclusion_violation`. |
| T+93 ms | Blok `EXCEPTION WHEN exclusion_violation` di `create_booking_hold` menangkapnya dan melempar `SLOT_TAKEN` yang ramah. Semua 19 transaksi otomatis rollback — tidak ada baris parsial tertinggal. |
| T+95 ms | Trigger `bookings_broadcast_slot` (dari commit #7) mengirim `{table_id: M-03, starts_at: 20:00, state: 'held'}` ke channel `availability:2026-08-29`. |
| T+130 ms | **Semua 20 device** (termasuk pemenang, dan termasuk 200 pengunjung lain yang sedang membuka halaman jadwal) menerima broadcast. Slot M-03 @20:00 berubah menjadi kuning "sedang dipesan orang lain". |
| T+150 ms | 19 klien menerima error `SLOT_TAKEN`. UI **tidak** menampilkan dialog error teknis; ia menampilkan "Slot ini baru saja diambil" plus 3 saran terdekat (M-03 @21:00, M-05 @20:00, M-07 @20:00) yang diambil dari state yang sudah ter-*patch* oleh broadcast. |
| T+200 ms | Edge Function untuk klien #7 memanggil Midtrans Charge API **di luar transaksi**. QRIS `expiry` = 8 menit. |
| T+900 ms | Response Midtrans tiba. `UPDATE payments SET qr_string=..., qr_url=...`. Broadcast ke `booking:{id}`. QR muncul di layar. |
| T+3 mnt | Klien #7 membayar. Midtrans mengirim webhook `settlement`. Signature diverifikasi, `payment_events` menyisipkan baris baru (bukan duplikat), booking `hold → confirmed`, ledger dicatat. |
| T+3 mnt | Broadcast `state='booked'`. Semua device berubah dari kuning ke merah. Dashboard admin menerima order baru di `admin:orders`. |
| **Cabang gagal bayar** | | 
| T+8 mnt | QRIS expired di sisi Midtrans. Notifikasi `expire` tiba dalam ≤90 detik. Handler set `payments.status='expired'`, `bookings.status='expired'`. Slot lepas, broadcast `state='free'`. |
| T+12 mnt | Jika notifikasi `expire` tidak pernah tiba, `expire_stale_holds()` melepas slot (hold 10 menit + grace 2 menit). Hasil akhir identik — dua jalur, satu hasil, idempoten. |

Yang **tidak** dipakai dan alasannya:

- **`SERIALIZABLE`** — tidak perlu. Exclusion constraint sudah memberi jaminan yang tepat di bawah `READ COMMITTED`, tanpa biaya retry `40001` di seluruh transaksi lain.
- **Advisory lock manual** (`pg_advisory_xact_lock`) — redundan. Constraint sudah menyerialkan pada granularitas yang tepat (per meja per rentang), sedangkan advisory lock cenderung terlalu kasar (per meja per hari) dan mudah bocor kalau ada code path yang lupa mengambilnya.
- **Pengecekan `SELECT ... WHERE NOT EXISTS` lalu `INSERT`** — inilah pola yang **menghasilkan** double-booking. Di `READ COMMITTED` tidak ada yang mencegah dua transaksi sama-sama melihat "kosong". Kalau ada satu hal yang harus diambil dari bab ini: **jangan pernah** mengandalkan pengecekan aplikasi.
- **`SELECT ... FOR UPDATE` pada baris meja** — akan bekerja, tetapi menyerialkan seluruh meja untuk seluruh hari. Pada Sabtu malam dengan 10 meja, throughput turun drastis tanpa alasan.

Pengendalian beban tambahan:
- Batas 2 hold aktif per user (sudah di RPC) mencegah satu orang menyandera 10 meja.
- Rate limit di Edge Function: maksimal 10 percobaan hold per user per menit.
- **Jangan** lakukan auto-retry di client saat menerima `SLOT_TAKEN` — slot memang sudah hilang; retry hanya menambah beban dan memperburuk pengalaman.

---

### 4.9 Yang perlu diputuskan pemilik

| ID | Pertanyaan | Default yang diasumsikan |
|---|---|---|
| Q-01 | Jam operasional pasti? | ASUMSI 10:00–02:00 WIB |
| Q-02 | Granularitas booking 30 atau 60 menit? | ASUMSI 30 menit |
| Q-03 | Durasi hold pembayaran? | ASUMSI 10 menit (QRIS 8 menit) |
| Q-04 | Perlu jeda bersih-bersih antar sesi? | ASUMSI tidak ada |
| Q-05 | Harga beda untuk jam sibuk / akhir pekan / meja VIP? | ASUMSI ya, karena itu ada `calc_table_price()` |
| Q-06 | Kebijakan refund kalau pembayaran masuk setelah slot hilang? | ASUMSI refund penuh manual oleh admin |
| Q-07 | Boleh booking H-berapa hari? | ASUMSI maksimal 30 hari |
| Q-08 | Jumlah meja saat ini? | ASUMSI 10, memengaruhi estimasi baris |


## Risiko
- btree_gist wajib aktif SEBELUM DDL exclusion constraint dijalankan. Tanpa itu: 'ERROR: data type uuid has no default operator class for access method gist'. Di Supabase, extension terpasang di schema `extensions`; verifikasi lewat pg_extension sebelum migrasi produksi.
- Bound range HARUS '[)' bukan '[]'. Dengan '[]', booking 20:00-21:00 dan 21:00-22:00 akan saling menolak dan venue kehilangan penjualan pada slot bersebelahan. Ini kesalahan paling umum pada implementasi range booking dan tidak terdeteksi oleh test yang hanya menguji overlap penuh.
- Booking walk-in yang diinput kasir HARUS masuk tabel `bookings` yang sama. Kalau kasir mencatat di kertas atau sistem terpisah, exclusion constraint tidak melihatnya dan sistem online akan menjual meja yang sedang dipakai tamu offline. Ini risiko bisnis terbesar dari seluruh desain.
- Memanggil Midtrans Charge API di DALAM transaksi pembuatan hold akan membuat 19 klien lain terblokir 500-2000 ms di lock index GiST, memicu timeout berantai saat jam sibuk. Urutan wajib: txn buat hold -> COMMIT -> HTTP charge -> txn simpan QR.
- pg_cron berhenti total kalau project Supabase free tier di-pause (7 hari tanpa request), sehingga hold kedaluwarsa tidak pernah dilepas dan slot tersandera permanen. Wajib ada GitHub Actions cron eksternal sebagai keep-alive sekaligus jaring pengaman.
- signature_key Midtrans dihitung dari string gross_amount mentah (mis. "120000.00"). Kalau backend mem-parse ke number lalu memformat ulang sebelum hashing, verifikasi akan selalu gagal dan seluruh pembayaran sah akan ditolak.
- signature_key SAJA tidak cukup sebagai kunci idempotency karena tidak mengandung transaction_status. Harus memakai fingerprint gabungan (order_id + transaction_id + status_code + transaction_status + fraud_status + gross_amount), jika tidak notifikasi pending dan settlement bisa saling menimpa atau dianggap duplikat.
- Notifikasi Midtrans dapat tiba out of order. Tanpa guard rank status, notifikasi 'pending' yang telat bisa menurunkan booking yang sudah 'confirmed' menjadi menunggu bayar — pelanggan sudah membayar tapi slot ditampilkan belum lunas.
- Memakai postgres_changes pada tabel `bookings` akan mengirim SELURUH baris ke subscriber termasuk user_id, total_amount, dan notes milik pelanggan lain. RLS menyaring baris, bukan kolom. Wajib memakai broadcast dengan payload yang diproyeksikan manual.
- Tanpa policy yang membatasi INSERT ke realtime.messages, pelanggan dapat menyiarkan pesan palsu ke channel availability dan membuat semua device menampilkan slot penuh padahal kosong. Broadcast harus eksklusif dari trigger database.
- auth.uid() dan is_staff() yang dipanggil langsung (tidak dibungkus SELECT) di policy RLS dievaluasi sekali PER BARIS. Pada tabel bookings yang tumbuh ke puluhan ribu baris, ini mengubah query 5 ms menjadi hitungan detik.
- Meletakkan kolom role di tabel profiles dan membacanya dari policy pada tabel profiles itu sendiri menyebabkan rekursi tak berhingga. Fungsi is_staff() wajib SECURITY DEFINER agar menembus RLS.
- Client JavaScript yang memakai new Date().toISOString().slice(0,10) akan menghasilkan tanggal UTC. Pada pukul 23:30 WIB tanggalnya sudah maju satu hari, sehingga pelanggan yang membuka aplikasi malam hari melihat jadwal besok. Wajib Intl.DateTimeFormat dengan timeZone Asia/Jakarta.
- Laporan keuangan yang dihitung dari SUM(bookings.total_amount) akan salah karena tidak memperhitungkan refund parsial dan biaya gateway. Laporan harus dibangun dari revenue_ledger yang append-only.
- Menghitung omzet harian dengan created_at::date memotong hari pada 00:00 UTC, memecah satu shift malam menjadi dua hari laporan. Wajib memakai kolom business_date dengan batas 02:00 WIB.
- order_id Midtrans tidak boleh didaur ulang — Midtrans menolak order_id yang pernah dipakai. Kalau pelanggan meminta QR baru setelah QR pertama expired dan backend mengirim order_id yang sama, charge akan gagal dan pelanggan tidak bisa membayar sama sekali.
- Pola SELECT-cek-kosong lalu INSERT tanpa exclusion constraint TIDAK mencegah double-booking di isolation level READ COMMITTED. Kalau ada satu code path saja yang menulis bookings di luar RPC dan constraint dinonaktifkan, jaminan hilang seluruhnya.
- Menangkap SQLSTATE yang salah: pelanggaran exclusion constraint adalah 23P01 (exclusion_violation), bukan 23505 (unique_violation). Handler yang hanya menangkap 23505 akan membocorkan error mentah PostgreSQL ke pengguna akhir.

## Rekomendasi
Adopsi model hybrid: `tstzrange` sebagai source of truth di tabel `bookings`, dilindungi partial exclusion constraint `EXCLUDE USING gist (table_id WITH =, during WITH &&) WHERE (status IN ('hold','confirmed','seated','completed','no_show'))` dengan `btree_gist`, dan grid 30 menit disintesis saat baca lewat fungsi `SECURITY DEFINER` `get_availability()` yang secara struktural tidak memuat kolom PII. Ini satu-satunya konfigurasi yang memberi jaminan anti double-booking secara atomik sekaligus membuat perpanjangan sesi menjadi satu statement UPDATE.

Empat aturan yang tidak boleh dinegosiasikan saat implementasi:
1. Semua penulisan ke `bookings` melalui RPC `SECURITY DEFINER`; tidak ada policy INSERT/UPDATE untuk role `authenticated`. Client tidak boleh punya jalur untuk menyisipkan booking dengan harga nol.
2. Transaksi pembuatan hold harus bebas HTTP call. Urutan wajib: buat hold dan COMMIT (<10 ms), baru charge Midtrans, baru simpan QR di transaksi kedua.
3. Bound range `'[)'`, uang bertipe `integer` Rupiah penuh, waktu bertipe `timestamptz`, hari operasional lewat kolom generated `business_date` dengan batas 02:00 WIB.
4. Webhook idempoten berlapis tiga: `UNIQUE (provider, event_fingerprint)` di `payment_events`, `SELECT ... FOR UPDATE` berurutan payments lalu bookings, dan `UNIQUE (source_event_id, entry_type)` di `revenue_ledger`. Selalu balas HTTP 200 kecuali untuk kegagalan transien nyata.

Anggaran waktu: QRIS expiry 8 menit < `hold_expires_at` 10 menit < eksekusi job pelepasan 12 menit. Untuk webhook yang tiba setelah slot dilepas, jangan menolak pembayaran — coba rebut ulang slot dengan `UPDATE ... SET status='confirmed'` dan biarkan exclusion constraint yang memutuskan; kalau kena 23P01, catat pembayaran sebagai sah, buat `refund_task`, dan kirim alert critical ke admin.

Sebelum menulis baris kode aplikasi pertama, jalankan uji bukti tiga-INSERT di §4.2.4 (bersebelahan harus sukses, overlap harus gagal dengan 23P01) langsung di SQL editor Supabase. Kalau uji itu tidak lolos persis seperti yang diharapkan, seluruh lapisan di atasnya tidak ada artinya.

Dua hal yang harus dikonfirmasi ke pemilik sebelum finalisasi bab ini: (a) apakah booking walk-in akan benar-benar diinput kasir ke sistem yang sama — kalau tidak, seluruh jaminan anti double-booking runtuh di dunia nyata; dan (b) durasi hold 10 menit, yang merupakan trade-off langsung antara pelanggan yang butuh waktu membuka m-banking dan slot Sabtu malam yang tersandera.

Sumber verifikasi: [Supabase range columns](https://supabase.com/blog/range-columns), [PostgreSQL Range Types](https://www.postgresql.org/docs/current/rangetypes.html), [PostgreSQL Generated Columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html), [Midtrans HTTP(S) Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks), [Supabase Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization), [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv), [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).