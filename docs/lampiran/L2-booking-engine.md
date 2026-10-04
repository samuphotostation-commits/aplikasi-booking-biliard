> **LAMPIRAN TEKNIS — bukan dokumen keputusan.**
> Jika isi berkas ini bertentangan dengan `PRD-SPL-BOOKING.md`, **PRD master yang menang.**
> Registri Keputusan Kanonik (§4) dan Konstanta Global (§5) di PRD master mengesampingkan angka apa pun di sini.

## 2. Spesifikasi Fungsional — Booking Meja Biliar

Seksi ini adalah kontrak perilaku sistem untuk domain booking. Semua aturan di sini diturunkan dari empat hasil riset (konkurensi PostgreSQL, integrasi Midtrans, operasional venue, hosting). Di mana riset saling bertentangan, konflik ditandai eksplisit dan diberi keputusan beserta alasannya — tidak ada yang disembunyikan.

**Prioritas memakai MoSCoW:** `Must` = wajib ada di MVP, tanpa ini produk tidak boleh go-live. `Should` = sangat diinginkan di MVP, boleh dipotong kalau jadwal terancam. `Could` = bonus MVP kalau sempat. `Won't` = sengaja dikeluarkan dari MVP, dijadwalkan Fase 2/3.

---

### 2.0 Parameter yang WAJIB bisa diubah admin tanpa deploy ulang

Prinsip arsitektur yang mengikat seluruh seksi ini: **tidak ada satu pun angka bisnis di bawah ini yang boleh menjadi konstanta di dalam kode.** Semuanya berada di tabel `venue_settings` (key-value bertipe) atau tabel master, dibaca saat runtime, dan setiap perubahan tercatat di audit log.

| Kunci | Default | Tipe | Dipakai di | Prioritas |
|---|---|---|---|---|
| `open_time` | `10:00` | time | 2.1.2 | Must |
| `close_time` | `02:00` (hari berikutnya) | time | 2.1.2 | Must |
| `business_day_cutoff` | `02:00` | time | 2.1.2 | Must |
| `slot_granularity_minutes` | `30` | int | 2.1.1 | Must |
| `min_duration_online_minutes` | `60` | int | 2.1.3 | Must |
| `max_duration_online_minutes` | `240` | int | 2.1.3 | Must |
| `max_duration_staff_minutes` | `480` | int | 2.1.3 | Must |
| `turnaround_minutes` | `0` | int (0/5/10/15) | 2.1.4 | Must |
| `booking_horizon_days` | `14` | int | 2.1.5 | Must |
| `min_lead_time_minutes` | `60` | int | 2.1.5 | Must |
| `hold_duration_minutes` | `15` | int | 2.4.1 | Must |
| `gateway_expiry_minutes` | `15` | int | 2.4.1 | Must |
| `hold_grace_minutes` | `2` | int | 2.4.1 | Must |
| `no_show_grace_minutes` | `15` | int | 2.8 | Must |
| `extend_warning_minutes` | `10` | int | 2.6 | Must |
| `extend_hard_stop_minutes` | `5` | int | 2.6 | Must |
| `cancel_free_window_hours` | `4` | int | 2.7 | Must |
| `store_credit_validity_days` | `90` | int | 2.7 | Must |
| `max_active_holds_per_user` | `2` | int | 2.10 | Must |
| `max_active_bookings_per_user` | `3` | int | 2.10 | Must |
| `tax_rate_billiard` | `10.0` | numeric | 2.2.7 | Must |
| `tax_rate_fnb` | `10.0` | numeric | 2.2.7 | Must |
| `price_display_mode` | `tax_inclusive` | enum | 2.2.7 | Must |
| Tarif per rate card | tabel `rate_cards` | — | 2.2.2 | Must |
| Jumlah & atribut meja | tabel `billiard_tables` | — | 2.5 | Must |
| Hari libur nasional | tabel `holiday_dates` | — | 2.2.2 | Must |

| ID | Requirement | Prioritas |
|---|---|---|
| BK-01 | Seluruh parameter di tabel 2.0 dapat diubah lewat halaman Pengaturan admin tanpa deploy ulang, berlaku efektif untuk booking baru dalam ≤ 60 detik | Must |
| BK-02 | Setiap perubahan parameter menghasilkan baris audit log berisi: user, waktu, nilai lama, nilai baru, alasan (wajib untuk parameter harga dan durasi) | Must |
| BK-03 | Perubahan parameter **tidak pernah retroaktif** terhadap booking yang sudah berstatus `hold` atau lebih tinggi | Must |

---

### 2.1 Model slot, durasi, dan jam operasional

#### 2.1.1 Granularitas — model hybrid

Sesuai keputusan D-01 riset konkurensi, sistem memakai **model hybrid**:

- **Sumber kebenaran di database** adalah rentang bebas `tstzrange` per booking (`during`), dilindungi `EXCLUDE USING gist`. Bukan baris slot diskrit yang di-generate di muka.
- **Yang dilihat UI** adalah grid **30 menit** yang disintesis saat baca oleh fungsi `get_availability(business_date)`.

Alasan model ini menang: perpanjangan sesi menjadi satu statement `UPDATE` yang atomik, durasi tidak bulat (sesi walk-in yang berakhir 21:47) tetap bisa ditagih akurat, tabel ~10× lebih kecil, dan tidak ada cron generator slot yang kalau mati membuat kalender kosong total.

**Aturan yang tidak boleh dilanggar:** bound rentang harus **half-open `'[)'`**. Dengan `'[]'`, sesi 20:00–21:00 dan 21:00–22:00 akan saling menolak dan venue kehilangan penjualan pada slot bersebelahan. Ini kesalahan implementasi range booking yang paling sering dan tidak tertangkap oleh test yang hanya menguji overlap penuh.

Grid 30 menit dipilih (bukan 60) karena: (a) memungkinkan perpanjangan 30 menit yang merupakan unit up-sell paling laku, (b) membuat sesi 90 menit dan 150 menit mungkin, (c) tetap menghasilkan grid yang terbaca di layar HP karena UI mengelompokkan dua blok menjadi satu kartu jam.

#### 2.1.2 Jam operasional dan hari operasional

**ASUMSI: venue buka 10:00 WIB sampai 02:00 WIB dini hari.** **[PERLU KONFIRMASI]** jam buka-tutup sebenarnya, termasuk apakah berbeda antara weekday dan weekend.

Konsekuensi teknis yang wajib: sesi yang mulai pukul 01:00 tanggal 24 Agustus secara akuntansi milik **hari operasional 23 Agustus**. Karena itu kolom `business_date` dihitung dengan batas 02:00 WIB:

```
business_date = ((starts_at at time zone 'Asia/Jakarta') - interval '2 hours')::date
```

| `starts_at` (WIB) | `business_date` | Keterangan |
|---|---|---|
| 23 Agu 20:00 | 23 Agu | normal |
| 24 Agu 00:30 | 23 Agu | kasus kritikal — masih shift malam yang sama |
| 24 Agu 01:59 | 23 Agu | slot terakhir hari operasional |
| 24 Agu 02:00 | 24 Agu | batas tepat |

Slot terakhir yang dijual = 01:30–02:00 (dengan `close_time = 02:00`). Sistem tidak boleh menjual slot yang `ends_at`-nya melewati `close_time`.

Jam buka khusus (libur nasional, event privat, tutup renovasi) dikelola lewat tabel `venue_closures(date_from, date_to, reason, is_full_closure, custom_open, custom_close)`. Slot pada rentang tutup tidak pernah muncul di grid.

#### 2.1.3 Durasi minimum dan maksimum

Riset konkurensi menetapkan lantai teknis 30 menit dan langit-langit 8 jam di level DB. Riset operasional merekomendasikan minimum 1 jam dan maksimum 4 jam untuk booking online. Keduanya kompatibel dan diterapkan berlapis:

| Lapis | Minimum | Maksimum | Penegak |
|---|---|---|---|
| Database (`CHECK`) | 30 menit | 8 jam | `bookings_min_duration`, `bookings_max_duration` |
| Kanal `online` (RPC) | **60 menit** | **240 menit (4 jam)** | `create_booking_hold` |
| Kanal `walk_in` / `phone` (RPC staf) | 30 menit | 480 menit (8 jam) | `create_staff_booking` |

Alasan minimum online 1 jam: seluruh data pasar terverifikasi (Palembang Rp 35.000–100.000/jam, Bandung Rp 35.000 happy hour, Jakarta Rp 50.000–100.000) memakai satuan jam; slot 30 menit membuat grid terlalu padat di layar HP dan menurunkan nilai transaksi rata-rata.

Alasan maksimum online 4 jam: mencegah satu akun mengunci meja prime sepanjang malam. Booking > 4 jam (turnamen, event, sewa borongan) **wajib** lewat admin, yang bisa memakai batas 8 jam dan menyetel harga paket manual.

Perpanjangan sesi memakai kelipatan **30 menit** dan tidak tunduk pada batas 4 jam online (sesi 4 jam yang diperpanjang 2× menjadi 5 jam tetap sah), tetapi tunduk pada `close_time`.

#### 2.1.4 Buffer antar sesi (turnaround) — dan kenapa desainnya berbeda dari DDL riset

Riset operasional merekomendasikan buffer 0 menit default, konfigurabel 0/5/10 menit. Masalahnya: kalau buffer ditulis langsung ke dalam ekspresi exclusion constraint (`tstzrange(starts_at, ends_at + interval '5 minutes', '[)')`), maka **mengubah buffer berarti menjalankan migrasi DDL** — melanggar BK-01 yang menuntut parameter bisa diubah admin tanpa deploy.

**Keputusan desain (penyempurnaan atas DDL §4.2.3 riset konkurensi):** pisahkan waktu tagih dari waktu blokir.

| Kolom | Arti | Diisi oleh |
|---|---|---|
| `starts_at` | Jam mulai sesi (yang dilihat & dibayar pelanggan) | RPC |
| `ends_at` | Jam selesai sesi (billable end) | RPC |
| `blocks_until` | `ends_at + turnaround_minutes` — kolom **tersimpan biasa**, bukan generated | RPC, dari `venue_settings` |
| `during` | `generated always as (tstzrange(starts_at, blocks_until, '[)')) stored` | PostgreSQL |

Exclusion constraint tetap `EXCLUDE USING gist (table_id WITH =, during WITH &&) WHERE (status IN (...))`. Karena `during` sekarang menurunkan dari kolom tersimpan `blocks_until`, ekspresinya tetap IMMUTABLE dan constraint tetap valid — sementara nilai buffer menjadi parameter runtime.

Konsekuensi yang harus dipahami: mengubah `turnaround_minutes` **hanya berlaku untuk booking baru**. Booking yang sudah ada mempertahankan `blocks_until` lamanya. Ini justru benar — pelanggan yang sudah membayar tidak boleh kehilangan slot karena admin menambah buffer.

Constraint grid 30 menit diterapkan pada `starts_at` dan `(ends_at - starts_at)`, **tidak** pada `blocks_until` (yang boleh off-grid, misal berakhir 22:05).

#### 2.1.5 Jendela booking

| Aturan | Nilai | Alasan |
|---|---|---|
| Paling cepat | **H+60 menit** dari sekarang | Cegah bentrok dengan walk-in yang sedang berdiri di depan kasir |
| Paling jauh | **14 hari** ke depan | Batasi eksposur perubahan harga dan pembatalan massal |
| Booking untuk waktu lampau | ditolak (`SLOT_IN_PAST`), toleransi 5 menit clock skew | — |

Staf (kanal `walk_in`/`phone`) dikecualikan dari `min_lead_time_minutes` — kasir memang harus bisa membuka sesi untuk sekarang juga.

#### 2.1.6 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-04 | Slot ditampilkan dalam grid 30 menit yang disintesis saat baca dari `tstzrange`, bukan dari baris slot pre-generated | Must |
| BK-05 | Bound rentang wajib `'[)'`; sesi bersebelahan (20:00–21:00 dan 21:00–22:00) harus dapat dijual bersamaan | Must |
| BK-06 | Jam operasional, batas hari operasional 02:00, dan tanggal tutup dikelola admin lewat `venue_settings` dan `venue_closures` | Must |
| BK-07 | Durasi online: minimum 60 menit, maksimum 240 menit, kelipatan 30 menit. Durasi staf: 30–480 menit | Must |
| BK-08 | Buffer antar sesi disimpan sebagai `blocks_until = ends_at + turnaround_minutes`, dapat diubah admin tanpa migrasi, dan tidak retroaktif | Should |
| BK-09 | Jendela booking H+60 menit s/d 14 hari, konfigurabel; staf dikecualikan dari batas bawah | Must |
| BK-10 | Sistem menolak booking yang `ends_at`-nya melewati `close_time` hari operasional tersebut | Must |

---

### 2.2 Aturan harga

#### 2.2.1 Lima dimensi harga yang wajib didukung

Data pasar terverifikasi menunjukkan industri biliar Indonesia memakai lima dimensi harga sekaligus, bukan satu harga flat. Sistem wajib mendukung kelimanya sejak MVP:

1. **Kelas meja** — standard vs VIP (3A Billiard menyebut "meja reguler", implikasinya ada kelas lain).
2. **Tipe hari** — weekday / weekend / libur nasional (FlatNine Jakarta: Rp 50.000 weekday → Rp 100.000 Jumat–Sabtu, naik 2×).
3. **Time band** — happy hour siang vs prime time malam (venue Bandung terverifikasi: Rp 35.000 pada 10.00–15.00 vs Rp 57.000 normal).
4. **Paket durasi** — harga per jam menurun untuk durasi panjang (paket On Break Jakarta: Rp 30.000/jam di paket 2 jam → Rp 23.800/jam di paket 5 jam).
5. **Tanggal efektif** — tarif bisa berubah dan perubahan tidak boleh retroaktif.

**Larangan keras:** harga **tidak boleh** disimpan sebagai kolom `hourly_price` tunggal di tabel `billiard_tables`. Kolom itu hanya boleh dipakai sebagai *fallback terakhir* kalau tidak ada rate card yang cocok, dan kondisi itu harus memicu alert ke admin.

#### 2.2.2 Struktur rate card

```
rate_cards(
  id, name, code,
  table_type,            -- 'standard' | 'vip' | NULL (berlaku semua)
  day_type,              -- 'weekday' | 'weekend' | 'holiday' | NULL
  start_time, end_time,  -- time, band jam berlaku (WIB)
  price_per_hour,        -- integer, Rupiah penuh
  priority,              -- int, pemenang bila beberapa card cocok
  effective_from,        -- date, wajib
  effective_to,          -- date, nullable
  is_active
)

holiday_dates(date, name, treat_as)   -- treat_as: 'weekend' | 'holiday'
```

**Contoh isi rate card — ASUMSI kota tier-2, ANGKA CONTOH, BUKAN HARGA SPL.** **[PERLU KONFIRMASI]** seluruh angka di tabel ini wajib diganti angka riil pemilik sebelum go-live.

| Kode | Kelas meja | Tipe hari | Band jam | Tarif/jam |
|---|---|---|---|---|
| `HH-WD` | standard | weekday | 10:00–17:00 | Rp 35.000 |
| `REG-WD` | standard | weekday | 17:00–20:00 | Rp 45.000 |
| `PRIME-WD` | standard | weekday | 20:00–02:00 | Rp 55.000 |
| `HH-WE` | standard | weekend + holiday | 10:00–17:00 | Rp 45.000 |
| `PRIME-WE` | standard | weekend + holiday | 17:00–02:00 | Rp 70.000 |
| `HH-WD-VIP` | vip | weekday | 10:00–17:00 | Rp 45.500 |
| `PRIME-WE-VIP` | vip | weekend + holiday | 17:00–02:00 | Rp 91.000 |

VIP = +30% dari tarif standard (**ASUMSI**). Disimpan sebagai baris rate card tersendiri, **bukan** sebagai multiplier di kode — supaya admin bisa memutus keterkaitan itu kapan saja.

Band jam yang melewati tengah malam (20:00–02:00) disimpan sebagai satu baris dengan `end_time < start_time`; resolver menanganinya sebagai rentang yang membungkus tengah malam.

#### 2.2.3 Algoritma resolusi harga — per blok 30 menit

Ini menjawab edge case terpenting: sesi 19:00–21:00 pada hari Kamis melewati batas band (`REG-WD` berakhir 20:00, `PRIME-WD` mulai 20:00).

**Keputusan: harga dihitung per blok 30 menit, tiap blok dihargai sesuai rate card yang berlaku pada jam mulai blok itu.** Alternatifnya — memakai band jam mulai untuk seluruh sesi — lebih sederhana tetapi bisa dieksploitasi: pelanggan booking 19:30 selama 3 jam untuk mendapat harga sore sepanjang malam.

Fungsi `calc_table_price(table_id, starts_at, ends_at)` mengembalikan:

```
{
  total: integer,
  lines: [ { block_start, block_end, rate_card_code, price_per_hour, amount } ]
}
```

Resolusi per blok, urutan seleksi rate card:
1. Tentukan `day_type` blok: cek `holiday_dates` dulu → kalau ada, pakai `treat_as`; kalau tidak, Sabtu/Minggu = `weekend`, sisanya = `weekday`. Penentuan hari memakai `business_date`, bukan tanggal kalender — sesi 01:00 Minggu dini hari tetap dihargai sebagai Sabtu malam.
2. Filter rate card yang `is_active`, `effective_from <= business_date`, `(effective_to IS NULL OR effective_to >= business_date)`, `table_type` cocok atau NULL, `day_type` cocok atau NULL, dan jam mulai blok jatuh di dalam band.
3. Urutkan: spesifisitas (`table_type` non-NULL > NULL, lalu `day_type` non-NULL > NULL), lalu `priority` DESC, lalu `effective_from` DESC. Ambil satu.
4. `amount_blok = price_per_hour / 2` (bulatkan ke Rupiah penuh, pembulatan ke atas).
5. Kalau tidak ada rate card yang cocok → pakai `billiard_tables.hourly_price` **dan** tulis baris ke `admin_alerts` dengan severity `warning`.

Paket durasi (`PKG-DUO`, `PKG-NIGHT`) diimplementasikan sebagai **diskon otomatis** di atas hasil resolusi per blok, bukan sebagai jalur harga terpisah. Ini menjaga satu sumber kebenaran harga dan membuat rincian di struk tetap bisa dibaca.

#### 2.2.4 Contoh perhitungan konkret

**Contoh A — sesi dalam satu band.** Sabtu, meja standard, 20:00–22:00 (4 blok), band `PRIME-WE` Rp 70.000/jam.

| Blok | Rate card | Amount |
|---|---|---|
| 20:00–20:30 | PRIME-WE | Rp 35.000 |
| 20:30–21:00 | PRIME-WE | Rp 35.000 |
| 21:00–21:30 | PRIME-WE | Rp 35.000 |
| 21:30–22:00 | PRIME-WE | Rp 35.000 |
| **Total sesi** | | **Rp 140.000** |

**Contoh B — sesi melewati batas band.** Kamis, meja standard, 19:00–21:00.

| Blok | Rate card | Tarif/jam | Amount |
|---|---|---|---|
| 19:00–19:30 | REG-WD | Rp 45.000 | Rp 22.500 |
| 19:30–20:00 | REG-WD | Rp 45.000 | Rp 22.500 |
| 20:00–20:30 | PRIME-WD | Rp 55.000 | Rp 27.500 |
| 20:30–21:00 | PRIME-WD | Rp 55.000 | Rp 27.500 |
| **Total sesi** | | | **Rp 100.000** |

Rincian per blok ini **wajib ditampilkan** di halaman Ringkasan Pesanan. Pelanggan yang melihat "Rp 100.000" tanpa rincian akan curiga; yang melihat rinciannya akan paham kenapa jam 20:00 lebih mahal — dan itu justru mendorong mereka memilih jam lebih awal yang lebih murah, persis efek yang diinginkan happy hour.

**Contoh C — sesi melewati tengah malam.** Sabtu, 23:00–01:00 → `business_date` = Sabtu, seluruh 4 blok memakai `PRIME-WE`. Blok 00:00–00:30 dan 00:30–01:00 **tidak** berpindah ke tarif weekday Minggu.

#### 2.2.5 Price locking — snapshot harga

Ini adalah bug klasik nomor satu di sistem booking dan penyebab sengketa paling mahal: admin menaikkan harga hari ini, dan booking minggu lalu ikut berubah nilainya, sehingga laporan keuangan tidak bisa direkonsiliasi dengan mutasi bank.

**Aturan mutlak:** saat baris `bookings` dibuat (transisi ke `hold`), hasil `calc_table_price()` **disalin** ke booking dan tidak pernah dibaca ulang dari `rate_cards`.

| Kolom / tabel | Isi | Sifat |
|---|---|---|
| `bookings.table_amount` | total harga sesi, integer Rupiah penuh | immutable setelah `confirmed` |
| `bookings.fnb_amount` | subtotal F&B | boleh bertambah selama sesi berjalan |
| `bookings.discount_amount` | diskon/paket/store credit yang dipakai | immutable setelah `confirmed` |
| `bookings.tax_amount` | PBJT terhitung, snapshot | immutable |
| `bookings.tax_rate_applied` | persentase yang dipakai, snapshot | immutable |
| `bookings.total_amount` | generated: `table_amount + fnb_amount + service_fee - discount_amount` | terhitung |
| `booking_price_lines` | satu baris per blok 30 menit: `block_start, block_end, rate_card_id, rate_card_code, price_per_hour, amount` | append-only |

`booking_price_lines` menyimpan `rate_card_code` sebagai **teks**, bukan hanya foreign key. Kalau rate card dihapus atau dinonaktifkan tahun depan, struk lama tetap bisa dibaca.

**Laporan keuangan dibangun dari `revenue_ledger`, bukan dari `SUM(bookings.total_amount)`** — karena refund parsial dan MDR gateway tidak terwakili di tabel booking.

#### 2.2.6 Perubahan harga saat masih ada hold aktif

Skenario: pelanggan membuka halaman pembayaran pukul 19:00 dengan total Rp 140.000. Pukul 19:03 admin menaikkan tarif prime weekend menjadi Rp 80.000/jam.

Perilaku yang benar:
- Booking `hold` milik pelanggan tetap Rp 140.000. QR Midtrans yang sudah terbit tetap sah.
- Rate card baru berlaku untuk `create_booking_hold` berikutnya.
- Validasi webhook membandingkan `gross_amount` webhook dengan `payments.gross_amount` (snapshot), bukan dengan hasil hitung ulang. Kalau dibandingkan dengan hitung ulang, seluruh pembayaran yang sedang berjalan akan ditolak saat admin mengubah harga — kegagalan produksi yang senyap dan sulit didiagnosis.
- Halaman admin yang mengubah harga menampilkan peringatan: "Ada 3 booking berstatus menunggu pembayaran dengan harga lama. Booking tersebut tidak akan berubah."

#### 2.2.7 Pajak dan mode tampilan harga

**Keputusan: harga tayang = TAX-INCLUSIVE.** Pelanggan membayar QRIS di muka; mereka harus melihat angka final. Total yang berubah di layar pembayaran adalah penyebab utama abandonment.

Rincian pajak tetap ditampilkan sebagai baris terpisah di Ringkasan Pesanan dan di struk — ini bukan sekadar praktik baik, struk yang tidak transparan adalah bendera merah saat pemeriksaan Bapenda.

| Aturan | Detail |
|---|---|
| Tarif pajak | Konfigurasi DB, dua tarif independen: `tax_rate_billiard` dan `tax_rate_fnb`, masing-masing dengan `effective_from` |
| Perhitungan | DPP = `total_tayang / (1 + tarif)`; PBJT = `total_tayang − DPP` |
| Level perhitungan | Di level **total order**, bukan per item — mengurangi akumulasi error pembulatan |
| Tipe data uang | `integer` Rupiah penuh. **Tidak pernah float.** `numeric` hanya untuk mem-parsing `gross_amount` dari Midtrans |
| Pembulatan | Ke Rupiah penuh, pembulatan setengah ke atas |

Contoh (PBJT 10%, **ASUMSI**): sesi tayang Rp 140.000 → DPP Rp 127.273, PBJT Rp 12.727. MDR QRIS 0,7% dari Rp 140.000 = Rp 980. Net masuk rekening venue = Rp 126.293, atau **90,2% dari harga tayang**. Angka ini wajib muncul di dashboard keuangan, bukan cuma "omzet Rp 140.000".

**Larangan regulasi:** dilarang menambahkan baris "Biaya QRIS" / "Biaya admin 0,7%" di checkout. Bank Indonesia menyatakan MDR ditanggung merchant dan tidak boleh dibebankan kepada konsumen. MDR diserap ke margin.

**[PERLU KONFIRMASI — pertanyaan paling mahal di dokumen ini]** Apakah Bapenda setempat mengklasifikasikan SPL sebagai permainan ketangkasan (PBJT 10%) atau sebagai bar/lounge (PBJT 40%)? Selisih 30 poin persentase omzet menentukan untung-rugi. Sistem harus tetap dibangun dengan tarif sebagai konfigurasi apa pun jawabannya.

#### 2.2.8 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-11 | Rate card engine mendukung dimensi: kelas meja, tipe hari (weekday/weekend/holiday), band jam, tanggal efektif | Must |
| BK-12 | Admin dapat membuat, mengubah, menonaktifkan rate card lewat UI tanpa deploy; perubahan berlaku ≤ 60 detik untuk booking baru | Must |
| BK-13 | Harga dihitung per blok 30 menit menurut band jam mulai blok; sesi lintas band dihargai campuran | Must |
| BK-14 | Tipe hari ditentukan dari `business_date`, bukan tanggal kalender; sesi 01:00 Minggu dihargai sebagai Sabtu | Must |
| BK-15 | Hari libur nasional dikelola di tabel `holiday_dates` dengan `treat_as` weekend/holiday | Should |
| BK-16 | Harga di-snapshot ke `bookings.table_amount` + `booking_price_lines` saat hold dibuat; tidak pernah dibaca ulang dari rate card | Must |
| BK-17 | Perubahan rate card tidak mengubah booking yang sudah `hold` atau lebih tinggi; UI admin memperingatkan jumlah hold aktif yang terdampak | Must |
| BK-18 | Rincian harga per blok ditampilkan di Ringkasan Pesanan dan e-struk | Must |
| BK-19 | Harga tayang tax-inclusive; PBJT ditampilkan sebagai baris terpisah dengan persentasenya; tarif pajak adalah konfigurasi DB dengan `effective_from` | Must |
| BK-20 | Uang disimpan sebagai `integer` Rupiah penuh; penggunaan tipe float dilarang di seluruh jalur harga | Must |
| BK-21 | Tidak ada baris biaya QRIS/MDR yang dibebankan ke pelanggan di checkout | Must |
| BK-22 | Paket durasi berjenjang (2/3/5 jam) sebagai diskon otomatis di atas harga per blok | Could |
| BK-23 | Fallback ke `billiard_tables.hourly_price` bila tidak ada rate card cocok, disertai alert admin | Should |

---

### 2.3 State machine booking

#### 2.3.1 Daftar status

| Status DB | Nama tampilan (ID) | Arti | Terminal? |
|---|---|---|---|
| *(tidak ada baris)* | Draft | Keranjang di sisi klien. **Sengaja tidak disimpan di DB dan tidak menempati slot.** | — |
| `hold` | Menunggu Pembayaran | Slot dikunci, QRIS terbit, countdown berjalan | tidak |
| `confirmed` | Terkonfirmasi | Webhook `settlement` terverifikasi, slot terkunci permanen | tidak |
| `checked_in` | Sudah Hadir | Tamu tiba, QR discan kasir, sesi belum mulai | tidak |
| `in_progress` | Sedang Main | `now` berada di dalam `[starts_at, ends_at)` dan tamu hadir | tidak |
| `completed` | Selesai | Sesi berakhir, tab ditutup, tagihan lunas | ya |
| `cancelled_by_user` | Dibatalkan Pelanggan | — | ya |
| `cancelled_by_admin` | Dibatalkan Venue | Maintenance, force majeure, keputusan manajemen | ya |
| `expired_unpaid` | Kedaluwarsa | Hold habis tanpa pembayaran | ya |
| `no_show` | Tidak Hadir | Sudah bayar, tidak datang sampai lewat grace period | ya (dapat dibuka kembali, lihat T-16) |
| `refunded` | Dana Dikembalikan | Refund **penuh** ke rekening/e-wallet pelanggan sudah selesai | ya |

**Kenapa `draft` tidak disimpan di DB.** Menyimpan draft berarti menempatkan baris di tabel `bookings`. Kalau baris itu masuk predikat exclusion constraint, ia mengunci slot tanpa pembayaran — pintu terbuka untuk slot squatting. Kalau tidak masuk predikat, ia tidak memberi jaminan apa pun dan hanya menambah baris sampah. Keranjang disimpan di `localStorage` klien; kunci slot pertama kali terjadi saat pelanggan menekan "Bayar".

**Kenapa `refunded` adalah status booking dan bukan hanya status payment.** Kebenaran uang tetap berada di `payments` dan `revenue_ledger`. Status `refunded` di booking hanya penanda ringkasan untuk UI dan laporan, dan **hanya dipakai untuk refund penuh**. Refund parsial (misal F&B dibatalkan, sesi meja jalan) **tidak mengubah** status booking; ia hanya menambah baris negatif di ledger.

#### 2.3.2 Status yang memblokir slot

| Memblokir (masuk predikat exclusion constraint) | Tidak memblokir |
|---|---|
| `hold`, `confirmed`, `checked_in`, `in_progress`, `completed`, `no_show` | `cancelled_by_user`, `cancelled_by_admin`, `expired_unpaid`, `refunded` |

`no_show` **tetap memblokir** slot secara online. Alasannya: pelanggan sudah membayar dan berhak datang terlambat; sisa waktunya tidak boleh dijual ulang sebagai booking online kepada orang lain. Yang boleh memakai sisa waktu itu hanya walk-in yang dibuka kasir dengan override eksplisit (lihat 2.8).

#### 2.3.3 Tabel transisi lengkap

| # | Dari | Ke | Pemicu | Aktor | Guard / prasyarat | Efek samping |
|---|---|---|---|---|---|---|
| T-01 | — | `hold` | RPC `create_booking_hold` | Pelanggan | Slot bebas (dijamin exclusion constraint); ≤ `max_active_holds_per_user` hold aktif; dalam jendela booking; user terautentikasi | Baris dibuat; harga di-snapshot; `hold_expires_at = now + hold_duration`; broadcast `state='held'`; **setelah COMMIT** baru charge Midtrans |
| T-02 | `hold` | `confirmed` | Webhook `settlement` | Sistem | Signature SHA512 valid; `gross_amount` cocok `payments.gross_amount`; rank status tidak mundur | `hold_expires_at = NULL`; `confirmed_at = now`; ledger `sale_table`; broadcast `state='booked'`; e-struk ke pelanggan; notifikasi realtime + Web Push ke admin |
| T-03 | `hold` | `expired_unpaid` | Cron `expire_stale_holds` **atau** webhook `expire` | Sistem | `hold_expires_at + grace < now`; tidak ada `payments.status='paid'` | `cancel_reason='hold_timeout'`; slot bebas; broadcast `state='free'`; email "QR kedaluwarsa, pesan lagi" |
| T-04 | `hold` | `cancelled_by_user` | Tombol "Batalkan" di halaman QR | Pelanggan | Belum ada payment `paid` | Midtrans **Cancel API** dipanggil (bukan Refund API); slot bebas |
| T-05 | `hold` | `cancelled_by_admin` | Aksi admin | Admin/Owner | Alasan wajib diisi | Cancel API; audit log; slot bebas |
| T-06 | `confirmed` | `checked_in` | Scan QR check-in **atau** tombol "Tandai Hadir" | Kasir | `now >= starts_at − 30 menit` dan `now <= starts_at + no_show_grace` | `checked_in_at`; papan status meja jadi kuning-solid "siap"; audit log mencatat kasir |
| T-07 | `checked_in` | `in_progress` | Otomatis | Sistem (cron 1 menit + derivasi di UI) | `now >= starts_at` | Timer meja jalan; papan status merah; event `session.started` di-publish (tanpa consumer di MVP, disiapkan untuk kontrol lampu Fase 3) |
| T-08 | `confirmed` | `in_progress` | Tombol "Mulai Sesi" | Kasir | `now >= starts_at`; tamu hadir tanpa scan QR | Sama seperti T-07 + audit log "check-in manual tanpa QR" |
| T-09 | `confirmed` | `no_show` | Cron | Sistem | `now > starts_at + no_show_grace` dan belum pernah `checked_in` | Notifikasi ke pelanggan; meja ditawarkan ke walk-in dengan flag override; **tidak ada refund**; counter no-show akun bertambah |
| T-10 | `confirmed` | `cancelled_by_user` | Tombol "Batalkan Booking" | Pelanggan | `starts_at − now > cancel_free_window_hours` | Store credit 100% diterbitkan, berlaku `store_credit_validity_days`; slot bebas; broadcast `state='free'` |
| T-11 | `confirmed` | `cancelled_by_user` | Tombol "Batalkan Booking" | Pelanggan | `starts_at − now <= cancel_free_window_hours` | **Ditolak secara default.** Bila `allow_late_cancel=true`: booking dibatalkan, kredit = 0, slot bebas, konfirmasi ganda wajib di UI |
| T-12 | `confirmed` / `checked_in` | `cancelled_by_admin` | Aksi admin (meja rusak, force majeure) | Admin/Owner | Alasan wajib; `reason_category` dipilih | Bila `reason_category='venue_fault'`: store credit 110–120% otomatis; opsi refund uang lewat approval Owner; upaya relokasi 1-klik ditawarkan lebih dulu |
| T-13 | `in_progress` | `completed` | Tombol "Tutup Sesi" kasir **atau** otomatis pada `now >= ends_at + 10 menit` | Kasir / Sistem | Tab F&B lunas atau dipindahkan ke tagihan tunai | `billable_minutes` final dihitung; ledger `sale_table` + `sale_fnb`; struk bernomor urut terbit; meja bebas; broadcast `state='free'` |
| T-14 | `in_progress` | `in_progress` | RPC `extend_booking` | Pelanggan / Kasir | Slot lanjutan bebas; `now < ends_at − extend_hard_stop_minutes`; tidak melewati `close_time` | `ends_at` dan `blocks_until` diperpanjang dalam satu `UPDATE` atomik; harga tambahan di-snapshot ke `booking_price_lines`; payment baru `attempt+1` |
| T-15 | `no_show` | `in_progress` | Tombol "Tamu Akhirnya Datang" | Kasir | Slot belum diambil sesi lain; `now < ends_at` | Status dipulihkan; sisa waktu = `ends_at − now` (tidak diperpanjang gratis); audit log wajib |
| T-16 | `expired_unpaid` | `confirmed` | Webhook `settlement` yang datang terlambat | Sistem | `UPDATE` lolos exclusion constraint | Slot direbut kembali. **Bila kena `23P01`:** pembayaran tetap dicatat `paid`, dibuat `refund_tasks`, dan `admin_alerts` severity `critical`. Webhook tetap dibalas HTTP 200 |
| T-17 | `hold` | `hold` | "Buat QR Baru" | Pelanggan | QR lama `expired`; `hold_expires_at` masih tersisa | `payments` baru dengan `order_id = SPL-{booking_code}-{attempt+1}`; **order_id lama tidak pernah didaur ulang** |
| T-18 | `confirmed` | `confirmed` | Reschedule | Pelanggan (1×) / Admin | Pelanggan: `starts_at − now > cancel_free_window_hours`, maksimum 1× per booking. Slot tujuan bebas | `UPDATE starts_at/ends_at/table_id` — exclusion constraint yang memutuskan. Selisih harga: kurang bayar → payment baru; lebih bayar → store credit |
| T-19 | `cancelled_*` / `no_show` / `completed` | `refunded` | Refund penuh selesai di Dashboard MAP, lalu dicatat admin di sistem | Owner | Payment berstatus `settlement`; masih dalam jendela refund gateway | Ledger `refund` negatif; struk kredit terbit; **status booking berubah hanya untuk refund penuh** |
| T-20 | `confirmed` / `checked_in` | `confirmed` | Relokasi meja karena maintenance | Admin | Meja tujuan sekelas dan bebas | `table_id` diganti; exclusion constraint memvalidasi; pelanggan dinotifikasi; audit log |

#### 2.3.4 Transisi yang DILARANG (harus ditolak di level RPC dan diuji)

| Larangan | Alasan |
|---|---|
| `confirmed` → `hold` | Status tidak pernah mundur. Notifikasi `pending` yang datang terlambat tidak boleh menurunkan booking yang sudah lunas |
| `hold` → `confirmed` tanpa `payments.status='paid'` | Untuk QRIS, `pending` **bukan** lunas. Hanya `settlement` yang mengonfirmasi |
| Status apa pun → `completed` tanpa melewati `in_progress` | Kecuali oleh Owner dengan alasan wajib (koreksi data) |
| `DELETE` pada baris `bookings` | Tidak ada policy DELETE untuk siapa pun. Pembatalan = perubahan status. Riwayat wajib utuh untuk audit dan pajak |
| `INSERT`/`UPDATE` langsung dari klien | Tidak ada policy INSERT/UPDATE `bookings` untuk role `authenticated`. Semua tulis lewat RPC `SECURITY DEFINER`. Tanpa ini, klien bisa mengarang `table_amount = 0` |
| Menurunkan rank status | Guard rank: `pending=1, authorize=2, capture=3, settlement/deny/cancel/expire/failure=4, refund=5`. Terapkan hanya bila `rank_baru >= rank_sekarang` |

#### 2.3.5 Alur utama dalam bentuk ringkas

```
[Draft klien]
     │ Bayar
     ▼
   hold ──15 mnt tanpa bayar──► expired_unpaid ──webhook telat──► confirmed (rebut ulang)
     │                                                                  │ gagal 23P01
     │ settlement                                                       ▼
     ▼                                                        refund_task + alert
 confirmed ──lewat grace 15 mnt──► no_show ──tamu datang──► in_progress
     │  scan QR                        │
     ▼                                 └──► (terminal, tanpa refund)
 checked_in ──jam mulai tiba──► in_progress ──extend──► in_progress
                                     │
                                     ▼
                                 completed ──refund penuh──► refunded

 confirmed ──batal >4 jam──► cancelled_by_user  (+ store credit 100%)
 confirmed ──maintenance──► cancelled_by_admin  (+ store credit 110-120%)
```

#### 2.3.6 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-24 | Status booking mengikuti enum di 2.3.1; tidak ada status ad-hoc berupa boolean tambahan | Must |
| BK-25 | Draft/keranjang disimpan di klien; tidak ada baris DB sebelum pelanggan menekan "Bayar" | Must |
| BK-26 | Seluruh penulisan `bookings` lewat RPC `SECURITY DEFINER`; tidak ada policy INSERT/UPDATE/DELETE untuk role `authenticated` | Must |
| BK-27 | Anti double-booking ditegakkan `EXCLUDE USING gist (table_id WITH =, during WITH &&) WHERE status IN (blocking)` dengan extension `btree_gist` | Must |
| BK-28 | Handler aplikasi menangkap SQLSTATE **`23P01`** (bukan `23505`) dan menerjemahkannya menjadi pesan `SLOT_TAKEN` yang ramah | Must |
| BK-29 | Guard rank status: notifikasi yang datang out-of-order tidak boleh menurunkan status | Must |
| BK-30 | Tidak ada operasi `DELETE` pada `bookings`; pembatalan hanya lewat perubahan status | Must |
| BK-31 | Setiap transisi yang dipicu manusia tercatat di audit log immutable: aktor, waktu, dari, ke, alasan | Must |
| BK-32 | Transisi `checked_in` → `in_progress` dijalankan cron 1 menit **dan** diderivasi di UI, sehingga tampilan tetap benar bila cron mati | Must |
| BK-33 | Status `no_show` tetap memblokir slot untuk booking online; hanya walk-in dengan override yang boleh memakai sisa waktunya | Must |
| BK-34 | Refund parsial tidak mengubah status booking; hanya menambah baris negatif di `revenue_ledger` | Must |

---

### 2.4 Alur kunci slot saat pembayaran (hold) dan countdown

#### 2.4.1 Anggaran waktu — konflik riset dan keputusannya

Dua hasil riset memberi angka berbeda dan ini harus diselesaikan sebelum implementasi:

- Riset konkurensi mengusulkan **hold DB 10 menit / QRIS expiry 8 menit / job pelepasan 12 menit**.
- Riset pembayaran menemukan bahwa **dokumentasi Midtrans menyatakan expiry scheduler hanya andal pada `expiry_duration >= 15 menit`**; di bawah itu ekspirasi bisa telat karena batch processing.

Kedua angka tidak bisa dipakai bersamaan. Kalau QRIS di-set 8 menit dan Midtrans mengekspirasinya telat, pelanggan bisa membayar QR pada menit ke-13 sementara sistem sudah melepas slot pada menit ke-12 — tepat skenario "uang masuk, slot hilang" yang paling mahal.

**Keputusan: pakai 15 / 17 / 19 menit.** Prinsip yang tidak boleh dilanggar tetap sama — **expiry gateway < expiry DB < eksekusi job pelepasan**.

| Peristiwa | Waktu relatif | Nilai |
|---|---|---|
| Baris `hold` dibuat, `hold_expires_at` dihitung | T+0 | — |
| `custom_expiry` dikirim ke Midtrans | T+15:00 | **15 menit** (batas bawah andal) |
| `hold_expires_at` | T+17:00 | 17 menit |
| Cron `expire_stale_holds` melepas slot (grace 2 menit) | T+19:00 | 19 menit |

Buffer 2 menit menutupi latensi notifikasi `expire` Midtrans yang bisa mencapai ~90 detik.

**Yang dilihat pelanggan adalah countdown 15:00**, disinkronkan ke `payments.expires_at` yang dikirim server — bukan dihitung dari jam perangkat. Dua menit ekstra di sisi DB adalah margin internal, tidak dijanjikan ke pelanggan.

**[PERLU KONFIRMASI]** Pemilik dapat memilih 10 menit demi throughput Sabtu malam, dengan konsekuensi yang harus diterima secara sadar: QRIS expiry 8 menit berada di bawah ambang keandalan Midtrans, sehingga jalur "rebut ulang slot + refund task" (T-16) akan lebih sering terpicu. Rekomendasi tetap 15 menit untuk MVP; turunkan setelah ada data okupansi nyata.

#### 2.4.2 Urutan operasi — aturan yang menyelamatkan Sabtu malam

**Transaksi pembuatan hold WAJIB bebas HTTP call.** Kalau charge Midtrans dipanggil di dalam transaksi yang sama, 19 klien lain yang merebut slot yang sama akan terblokir 500–2000 ms di lock index GiST sebelum tahu mereka kalah, dan sebagian akan kena timeout gateway.

```
1. Klien memanggil RPC create_booking_hold(table_id, starts_at, duration)
2. BEGIN
     - validasi: auth, jendela waktu, batas hold aktif, jam operasional
     - hitung harga (calc_table_price) dan snapshot
     - INSERT bookings (status='hold', hold_expires_at = now + 17 mnt)
       -> exclusion constraint memutuskan menang/kalah
     - INSERT booking_price_lines
   COMMIT                                      (target < 10 ms)
3. [DI LUAR TRANSAKSI] Edge Function memanggil Midtrans Charge API
     payment_type = "qris", acquirer = "gopay"
     custom_expiry = { expiry_duration: 15, unit: "minute" }
     order_id = "SPL-{booking_code}-{attempt}"
     idempotency-key dikirim untuk melindungi retry akibat timeout
4. BEGIN
     - INSERT payments (order_id, gross_amount, qr_url, expires_at, status='pending')
   COMMIT
5. Klien menerima URL QR dan expires_at dari server
```

Bila langkah 3 gagal total (Midtrans down), booking `hold` dibatalkan segera ke `cancelled_by_user` dengan pesan "Gagal membuat kode pembayaran, silakan coba lagi" — slot langsung dilepas, tidak menunggu 17 menit.

#### 2.4.3 Apa yang dilihat pelanggan

Halaman pembayaran ber-brand SPL (latar near-black, aksen amber `#F0A202`, wordmark Lido STF, angka countdown Emoland), bukan halaman putih generik gateway.

| Elemen | Detail | Prioritas |
|---|---|---|
| Countdown besar | Format `MM:SS`, angka Emoland, warna amber. Di bawah 3:00 berubah ke brick maroon `#992212` dan berdenyut halus. Sumber waktu = `expires_at` dari server | Must |
| Ringkasan terkunci | "Sab 24 Agu · 20:00–22:00 · Meja 3 · Rp 140.000" — tidak bisa diubah di halaman ini | Must |
| Gambar QR | `<img src="{actions[].url}">` langsung dari Midtrans; tidak perlu library QR di frontend | Must |
| Tombol **"Simpan QR ke Galeri"** | Wajib MVP. Pelanggan mobile tidak bisa memindai QR di layarnya sendiri | Must |
| Instruksi 3 langkah | "1. Simpan QR. 2. Buka e-wallet/m-banking → Scan. 3. Pilih ikon Galeri → pilih QR yang baru disimpan" | Must |
| Polling status | Tiap 3–5 detik ke backend sendiri (bukan mengandalkan redirect Midtrans). Begitu `settlement` → pindah otomatis ke halaman sukses | Must |
| Tombol "Saya sudah bayar" | Memicu pengecekan status manual; fallback bila polling gagal | Must |
| Tombol "Batalkan" | Memicu T-04, melepas slot lebih cepat untuk pelanggan lain | Should |
| Peringatan kebijakan | "Sesi dihitung dari jam booking, bukan jam kedatangan" dan ringkasan kebijakan batal — **ditampilkan sebelum bayar**, bukan disembunyikan di T&C | Must |
| Saat countdown habis | Halaman berubah menjadi "QR kedaluwarsa" + tombol "Buat QR Baru" (T-17), bukan halaman error | Must |
| QR check-in | Setelah sukses: QR booking untuk discan kasir + tombol "Kirim bukti ke WhatsApp saya" (`wa.me` deep link) | Must |

#### 2.4.4 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-35 | Anggaran waktu 15/17/19 menit; ketiganya konfigurabel; invariant `gateway < DB < job` divalidasi saat penyimpanan konfigurasi | Must |
| BK-36 | Transaksi pembuatan hold tidak boleh memuat HTTP call; charge Midtrans dilakukan setelah COMMIT | Must |
| BK-37 | `order_id` berpola `SPL-{booking_code}-{attempt}` dan tidak pernah didaur ulang | Must |
| BK-38 | Countdown bersumber dari `expires_at` server, bukan jam perangkat klien | Must |
| BK-39 | Tombol "Simpan QR ke Galeri" + instruksi scan-dari-galeri tersedia di MVP | Must |
| BK-40 | Polling status tiap 3–5 detik + tombol "Saya sudah bayar" | Must |
| BK-41 | Cron `expire_stale_holds` berjalan tiap 1 menit; ketersediaan slot **tidak bergantung** pada cron karena setiap query memakai `hold_expires_at > now()` | Must |
| BK-42 | Cron rekonsiliasi tiap 5 menit memanggil Get Status API untuk order `pending` berumur > 20 menit | Must |
| BK-43 | Keep-alive eksternal (cron-job.org / GitHub Actions) mencegah pause Supabase Free dan menjadi jaring pengaman bila `pg_cron` mati | Must |
| BK-44 | Bila charge Midtrans gagal, hold langsung dilepas tanpa menunggu expiry | Should |

---

### 2.5 Papan status meja real-time

Ini menjawab requirement pemilik nomor 4 sekaligus menjadi layar utama kasir.

#### 2.5.1 State visual dan token warna

Konvensi warna industri (hijau kosong / merah dipakai / kuning reserved) sudah dikenal staf biliar Indonesia dan dipakai produk lokal seperti Kasirbox. Konvensi itu dipertahankan, tetapi hue-nya digeser ke palet SPL. **Setiap state wajib punya pembeda selain warna** (label teks, pola, ikon) demi aksesibilitas.

| State | Warna | Pembeda non-warna | Isi kartu |
|---|---|---|---|
| Kosong | Outline amber `#F0A202` di atas near-black, isian transparan | Label "KOSONG" | Nama meja, tarif jam berjalan |
| Ditahan (`hold`) | Amber 25% + pola garis diagonal | Pola hatch + label "DIPROSES" | "Menunggu bayar · sisa 09:14" |
| Dibooking (`confirmed`, belum mulai) | Amber solid lembut | Ikon jam + label "RESERVED" | "Budi · 20:00 · 2 jam" + hitung mundur ke jam mulai |
| Sudah hadir (`checked_in`) | Amber solid + garis tepi tebal | Ikon centang | "Budi · hadir · mulai 20:00" |
| Sedang main (`in_progress`) | Brick maroon `#992212` solid | Ikon bola 8 + label "MAIN" | **Sisa waktu besar `01:23`**, nama, jam selesai |
| Sisa waktu < 10 menit | Maroon berdenyut + strip amber | Label "SEGERA SELESAI" | Sisa waktu + tombol "Tawarkan Perpanjang" |
| Melewati jam selesai | Maroon gelap + strip merah | Label "LEWAT WAKTU +07:12" | Menu "Tutup Sesi" |
| Tidak hadir (`no_show`) | Abu tua + garis silang | Label "TIDAK HADIR" | Tombol "Tamu Akhirnya Datang" |
| Maintenance | Abu `#949494` + hatch diagonal | Ikon kunci pas + label "PERBAIKAN" | Alasan + estimasi selesai |
| Di luar jam operasional | Redup 30% | Label "TUTUP" | — |

#### 2.5.2 Komponen UI kasir/admin — grid meja + timeline horizontal

Layar utama kasir terdiri dari dua panel yang tampil bersamaan pada layar ≥ 1024 px, dan bertumpuk dengan tab pada tablet/HP.

**Panel A — Denah meja (peta spasial).**
Kartu meja disusun mengikuti tata letak fisik venue (posisi disimpan sebagai `grid_x`, `grid_y` di `billiard_tables`, dapat diatur admin lewat editor drag-and-drop sederhana). Setiap kartu memakai token visual 2.5.1. Kartu bersifat interaktif: ketuk → panel aksi (Mulai sesi walk-in / Check-in booking / Perpanjang / Tutup sesi / Set maintenance).

**Panel B — Timeline horizontal.**

```
        10  11  12  13  14  15  16  17  18  19  20  21  22  23  00  01  02
        │   │   │   │   │   │   │   │   │   │   │   │   │   │   │   │   │
M-01    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████████▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░
M-02    ░░░░░░░░████████░░░░░░░░░░░░░░░░░░░░████████████████░░░░░░░░░░░░
M-03    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████▒▒▒▒▒▒▒▒░░░░░░░░░░░░
VIP-01  ▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚
                                         ▲ garis "SEKARANG" (amber, bergerak)

░ kosong   ▓ sedang main   █ dibooking   ▒ ditahan/menunggu bayar   ▚ maintenance
```

Spesifikasi:
- Baris = meja (urut `sort_order`), kolom = blok 30 menit dari `open_time` sampai `close_time` hari operasional terpilih.
- Header jam **sticky** di atas; kolom nama meja **sticky** di kiri; badan tabel scroll horizontal di dalam kontainernya sendiri — halaman tidak pernah scroll horizontal.
- Garis vertikal amber menandai `now`, diperbarui tiap 30 detik.
- Hover/ketuk sebuah blok → tooltip berisi nama pemesan, kode booking, durasi, nilai, kanal (online/walk-in/telepon).
- Drag antar-baris pada blok `confirmed` = relokasi meja (T-20); dilepas hanya bila constraint mengizinkan, jika tidak muncul toast "Meja tujuan bentrok".
- Navigasi tanggal: chip "Kemarin / Hari Ini / Besok" + date picker, dengan label hari singkat Indonesia (Sen/Sel/Rab/Kam/Jum/Sab/Min).

**Panel C — Bilah peringatan (di atas kedua panel).** Menampilkan hanya hal yang butuh tindakan dalam 30 menit ke depan: sesi yang akan selesai < 10 menit, booking yang belum check-in mendekati grace, hold yang hampir habis, dan konflik walk-in vs booking. Kosong = tidak ada apa-apa yang perlu dilakukan, dan itu informasi yang berharga.

**Indikator koneksi.** Selalu terlihat, jujur: hijau "Tersambung" / kuning "Menyambung ulang" / merah "Offline — 3 item belum tersinkron". Tanpa ini, staf berhenti memercayai sistem setelah insiden internet pertama.

#### 2.5.3 Komponen UI pelanggan — "jam berapa saja yang masih kosong"

Alur mobile-first, urutan **Tanggal → Jam → Meja**. Orang tahu *kapan* mereka bebas sebelum tahu *meja mana* yang mereka mau.

1. **Chip tanggal horizontal**, 14 hari, label "Hari Ini / Besok / Sen 25 Agu".
2. **Grid slot jam**, 3 kolom di mobile. Tiap kartu memuat: jam mulai–selesai, **harga slot itu**, dan sisa meja ("3 meja"). Menampilkan harga per slot membuat happy hour benar-benar laku.
3. Tiga state slot, dibedakan tidak hanya oleh warna: tersedia (border amber, teks terang), penuh (redup + coret + label "Penuh"), terpilih (isian amber solid).
4. **Slider durasi 1–4 jam** dengan total harga ter-update realtime — bukan mengklik banyak kotak berurutan yang error-prone di layar HP.
5. **Denah meja visual** (bukan dropdown) setelah slot dipilih, memakai pola denah kursi yang sudah dikuasai user Indonesia dan cocok dengan siluet rak biliar di logo SPL.
6. **Sticky bottom bar**: "Sab 24 Agu · 20:00–22:00 · Meja 3 · **Rp 140.000**" + CTA amber.
7. **Halaman Ringkasan Pesanan** wajib sebelum bayar (rincian per blok, subtotal sesi, subtotal F&B, PBJT, total).
8. **Homepage menampilkan status live**: "6 dari 8 meja terisi sekarang · meja kosong berikutnya 21:00". Ini memenuhi requirement pemilik nomor 4, mengurangi telepon masuk ke venue, dan berfungsi sebagai social proof. Dapat diakses tanpa login.

#### 2.5.4 Sumber data dan mekanisme realtime

Ketersediaan dibaca dari fungsi `get_availability(business_date)` bertipe `SECURITY DEFINER`, yang **secara struktural tidak dapat membocorkan identitas pemesan** karena kolom `user_id`, `total_amount`, dan `notes` tidak ada di `RETURNS TABLE`-nya. Ini lebih kuat daripada mengandalkan frontend untuk tidak menampilkan field tertentu. Role `anon` diberi `EXECUTE` supaya calon pelanggan bisa mengintip ketersediaan sebelum login.

Pembaruan realtime memakai **Broadcast dari database** (`realtime.send`), **bukan** `postgres_changes` pada tabel `bookings`. Alasannya mengikat: `postgres_changes` mengirim seluruh baris ke subscriber; RLS menyaring baris, bukan kolom — sehingga pelanggan A akan menerima `user_id`, `total_amount`, dan `notes` milik pelanggan B.

| Channel | Audiens | Payload | PII |
|---|---|---|---|
| `availability:{business_date}` | `anon` + `authenticated` | `{table_id, starts_at, ends_at, state}` | tidak ada |
| `booking:{booking_id}` | pemilik booking + staf | status booking & pembayaran | terbatas |
| `admin:orders` | staf saja | booking & order F&B masuk, lengkap | ya |
| `table:{table_id}` | staf saja | buka/tutup sesi, perpanjangan | ya |

Tidak ada policy `INSERT` pada `realtime.messages` untuk role `authenticated`. Tanpa larangan ini, siapa pun bisa menyiarkan pesan palsu ke channel ketersediaan dan membuat semua perangkat menampilkan slot penuh padahal kosong — vandalisme murah yang mematikan penjualan. Semua broadcast hanya berasal dari trigger database.

Klien tetap memanggil `get_availability()` sekali saat `SUBSCRIBED` dan setiap kali tab kembali terlihat. Broadcast bisa hilang saat jaringan seluler putus; realtime bukan pengganti rekonsiliasi.

**Ketahanan offline (PWA).** Layar kasir wajib berupa PWA dengan service worker yang men-cache jadwal hari ini. Saat internet putus, kasir tetap melihat daftar booking hari itu. Ditambah tombol "Cetak Jadwal Hari Ini" sebagai cadangan kertas — fitur murah yang menyelamatkan malam yang buruk.

#### 2.5.5 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-45 | Layar kasir menampilkan denah meja + timeline horizontal 30 menit untuk satu hari operasional penuh (10:00–02:00) | Must |
| BK-46 | State meja memakai token 2.5.1; setiap state punya pembeda selain warna | Must |
| BK-47 | Kartu meja `in_progress` menampilkan sisa waktu mundur dalam format `HH:MM`, diperbarui ≤ 30 detik | Must |
| BK-48 | Garis "sekarang" pada timeline bergerak otomatis | Should |
| BK-49 | Bilah peringatan menampilkan sesi berakhir < 10 menit, grace check-in hampir habis, hold hampir kedaluwarsa, dan konflik walk-in | Must |
| BK-50 | Ketersediaan dibaca dari `get_availability()` yang tidak memuat kolom PII | Must |
| BK-51 | Realtime memakai Broadcast dengan payload terproyeksi; `postgres_changes` pada `bookings` dilarang | Must |
| BK-52 | RLS pada `realtime.messages` membatasi channel admin ke staf; tidak ada policy INSERT untuk `authenticated` | Must |
| BK-53 | Pelanggan melihat slot kosong per jam dengan harga per slot dan jumlah meja tersisa | Must |
| BK-54 | Halaman publik "berapa meja kosong sekarang" dapat diakses tanpa login | Should |
| BK-55 | Layar kasir berupa PWA yang tetap menampilkan jadwal hari ini saat offline, dengan indikator koneksi yang jujur | Must |
| BK-56 | Tombol "Cetak Jadwal Hari Ini" untuk cadangan kertas | Should |
| BK-57 | Editor tata letak denah meja (drag posisi) untuk admin | Could |
| BK-58 | Relokasi booking lewat drag antar-baris timeline, divalidasi exclusion constraint | Could |

---

### 2.6 Perpanjangan sesi (extend)

Skenario paling sering terjadi dan paling merusak pengalaman kalau ditangani buruk.

#### 2.6.1 Alur

| Waktu | Peristiwa |
|---|---|
| T−20 menit dari `ends_at` | Sistem menghitung ketersediaan slot lanjutan di meja yang sama dan menyiapkan hasilnya |
| **T−10 menit** | **Peringatan utama.** Notifikasi in-app ke pelanggan + kartu meja kasir berubah "SEGERA SELESAI". Isi pesan bergantung hasil pengecekan (lihat 2.6.2) |
| T−5 menit | **Hard stop.** Tombol perpanjang dinonaktifkan bila slot berikutnya sudah dibooking, supaya tidak ada perpanjangan yang menabrak tamu berikutnya |
| T+0 | Sesi berakhir. Kasir menutup tab, atau sistem menutup otomatis pada T+10 menit |

#### 2.6.2 Tiga cabang pada T−10 menit

**Cabang 1 — slot lanjutan di meja yang sama kosong.**
Pesan: "Sesi kamu selesai 22:00. Mau lanjut? +30 menit Rp 17.500 · +1 jam Rp 35.000." Pelanggan menekan pilihan → RPC `extend_booking` → bila lolos constraint, QRIS baru terbit (`attempt+1`) dengan hold 15 menit. **Selama menunggu pembayaran perpanjangan, `ends_at` belum berubah** — perpanjangan baru berlaku setelah `settlement`. Alternatif: kasir menerima tunai dan menandai perpanjangan lunas langsung.

Perhitungan harga perpanjangan memakai `calc_table_price()` pada rentang baru, sehingga perpanjangan yang menembus band prime otomatis lebih mahal. Baris harga baru di-append ke `booking_price_lines`.

**Cabang 2 — slot lanjutan sudah dibooking, ada meja alternatif kosong.**
Pesan: "Meja 3 sudah dibooking jam 22:00. Meja 5 kosong sampai 00:00 — mau pindah dan lanjut di sana? +1 jam Rp 35.000." Pindah meja menghasilkan **booking baru** (bukan `UPDATE table_id` pada booking berjalan), agar riwayat penggunaan meja per sesi tetap akurat untuk laporan okupansi. Kedua booking ditautkan lewat `parent_booking_id`. Tab F&B tetap satu.

**Cabang 3 — tidak ada alternatif.**
Pesan jujur dan lebih awal: "Sesi kamu berakhir 22:00 dan semua meja sudah penuh setelahnya. Mau pesan untuk besok?" Ditampilkan pada T−10, bukan pada menit terakhir. Tawarkan waitlist (Fase 2).

#### 2.6.3 Aspek teknis

Perpanjangan adalah race condition klasik: dua sesi bisa mencoba memperpanjang ke slot yang sama, atau perpanjangan bertabrakan dengan booking baru yang sedang di-checkout orang lain.

Karena `during` adalah generated column dari `blocks_until`, perpanjangan cukup satu statement:

```sql
UPDATE bookings
   SET ends_at     = ends_at + make_interval(mins => p_add),
       blocks_until= ends_at + make_interval(mins => p_add) + turnaround
 WHERE id = p_booking_id;
```

Exclusion constraint memvalidasi otomatis. Bila bentrok → `23P01` → RPC melempar `EXTEND_UNAVAILABLE`, dan UI berpindah ke Cabang 2. Tidak ada pengecekan `SELECT ... NOT EXISTS` di kode aplikasi — pola itu justru yang **menghasilkan** double-booking pada isolation level `READ COMMITTED`.

Perpanjangan tidak boleh melewati `close_time` hari operasional.

#### 2.6.4 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-59 | Tombol "Perpanjang" tersedia di app pelanggan **dan** di layar kasir | Must |
| BK-60 | Peringatan otomatis pada T−10 menit ke pelanggan dan kasir, isi pesan bergantung ketersediaan slot lanjutan | Must |
| BK-61 | Bila slot lanjutan terisi, sistem **otomatis** mencari dan menawarkan meja alternatif sekelas | Must |
| BK-62 | Perpanjangan dieksekusi sebagai satu `UPDATE` atomik; bentrok dideteksi oleh exclusion constraint, bukan oleh pengecekan aplikasi | Must |
| BK-63 | Harga perpanjangan dihitung dengan rate card yang berlaku pada rentang baru dan di-snapshot ke `booking_price_lines` | Must |
| BK-64 | Hard stop perpanjangan pada T−5 menit dari booking berikutnya | Must |
| BK-65 | Perpanjangan berlaku hanya setelah pembayaran `settlement` atau setelah kasir menandai tunai lunas | Must |
| BK-66 | Pindah meja saat perpanjangan menghasilkan booking baru bertaut `parent_booking_id`, tab F&B tetap satu | Should |
| BK-67 | Waitlist bila semua meja penuh | Won't (Fase 2) |

---

### 2.7 Pembatalan, reschedule, store credit, dan refund

#### 2.7.1 Kebijakan pembatalan — **ASUMSI, [PERLU KONFIRMASI] ke pemilik**

Ini keputusan bisnis, bukan teknis. Angka di bawah adalah usulan default yang menggabungkan permintaan pemilik (ambang 4 jam) dengan benchmark venue biliar sejenis (Lusso Billiard: ≥24 jam refund 100%, <24 jam refund 50%).

| Waktu pembatalan oleh pelanggan | Kompensasi | Kanal |
|---|---|---|
| > 4 jam sebelum `starts_at` | **Store credit 100%**, berlaku 90 hari | Otomatis, tanpa campur tangan admin |
| ≤ 4 jam sebelum `starts_at` | **Hangus** (0%) | Pembatalan mandiri ditolak default; pelanggan diarahkan ke reschedule atau menghubungi venue |
| No-show | Hangus | Otomatis |
| Dibatalkan SPL (meja rusak, force majeure) | **Store credit 110–120%** atau refund uang penuh lewat approval Owner | Manual, dengan relokasi ditawarkan lebih dulu |

Reschedule: **gratis 1× per booking**, hanya bila > 4 jam sebelum `starts_at`, ke slot yang tersedia dalam 14 hari. Selisih harga kurang → bayar tambahan; selisih lebih → store credit.

Kebijakan ini **wajib ditampilkan di halaman booking dan di halaman pembayaran sebelum pelanggan membayar**, bukan disembunyikan di T&C — mengikuti praktik Ayo Indonesia yang menampilkan kebijakan terbuka di halaman venue.

#### 2.7.2 Kenapa refund uang lewat QRIS dihindari di MVP

Lima alasan yang berdiri sendiri-sendiri, masing-masing sudah cukup:

1. **Jendela waktu refund sangat pendek untuk transaksi OFF-US.** Refund GoPay QRIS ON-US berlaku 45 hari, tetapi **OFF-US hanya 7 hari**. Pelanggan yang membayar dari e-wallet non-GoPay hanya bisa direfund dalam 7 hari. Kebijakan pembatalan yang lebih longgar dari itu menciptakan kewajiban yang tidak bisa dieksekusi lewat gateway.
2. **Refund butuh saldo tersedia di Midtrans.** Kalau dana sudah ditarik seluruhnya ke rekening, refund ditolak. Ini memaksa venue menyisakan buffer saldo yang tidak produktif.
3. **MDR tidak ikut kembali.** Venue menanggung biaya gateway atas transaksi yang akhirnya batal.
4. **Refund otomatis yang salah jauh lebih mahal daripada refund yang lambat.** Volume pembatalan di venue biliar rendah; membangun otomasi untuk kasus langka berarti menambah permukaan bug pada jalur yang menyentuh uang.
5. **Store credit lebih baik untuk bisnis.** Uang tetap di dalam venue dan mendorong kunjungan ulang. Pelanggan yang punya kredit Rp 140.000 hampir selalu membelanjakan lebih dari itu saat kembali.

**Keputusan MVP:** store credit adalah mekanisme kompensasi default. Refund uang hanya dilakukan **manual oleh Owner lewat Dashboard MAP Midtrans**, lalu dicatat manual di sistem (T-19). Tidak ada integrasi Refund API di MVP.

#### 2.7.3 Store credit

| Aspek | Aturan |
|---|---|
| Struktur data | `store_credits(id, user_id, amount, remaining, source, source_booking_id, issued_at, expires_at, status)` + `store_credit_usages(credit_id, booking_id, amount, used_at)` — append-only |
| Masa berlaku | 90 hari sejak diterbitkan, konfigurabel |
| Penggunaan | Dipakai saat checkout, mengurangi `discount_amount` sebelum QRIS dibuat. Beberapa kredit dipakai berurutan mulai dari yang paling cepat kedaluwarsa |
| Batas | Tidak bisa melebihi total tagihan; sisa tetap di saldo. **Tidak dapat diuangkan** dan tidak dapat dipindahtangankan |
| Booking gratis penuh | Bila kredit menutup 100% tagihan, tidak ada charge Midtrans; booking langsung `confirmed` oleh RPC, dan `revenue_ledger` mencatat `discount` negatif, bukan `sale_table` fiktif |
| Tampilan | Saldo dan tanggal kedaluwarsa tampil di halaman akun dan di Ringkasan Pesanan |
| Akuntansi | Penerbitan kredit adalah **kewajiban**, bukan biaya. Dashboard menampilkan total kredit beredar dan yang akan kedaluwarsa 30 hari ke depan |

#### 2.7.4 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-68 | Kebijakan batal/reschedule dikonfigurasi admin (`cancel_free_window_hours`, kompensasi) dan **ditampilkan di halaman booking serta sebelum pembayaran** | Must |
| BK-69 | Pembatalan > 4 jam menerbitkan store credit 100% secara otomatis; slot langsung bebas | Must |
| BK-70 | Pembatalan ≤ 4 jam ditolak secara default; teks penolakan menjelaskan opsi yang tersedia | Must |
| BK-71 | Reschedule gratis 1× bila > 4 jam; validasi slot tujuan oleh exclusion constraint; selisih harga ditangani eksplisit | Should |
| BK-72 | Store credit sebagai ledger append-only dengan masa berlaku, tidak dapat diuangkan, dipakai FIFO berdasarkan tanggal kedaluwarsa | Must |
| BK-73 | Tidak ada refund uang otomatis di MVP; refund hanya manual oleh Owner lewat Dashboard MAP dan dicatat di sistem | Must |
| BK-74 | Pembatalan oleh venue menawarkan relokasi 1-klik lebih dulu; bila gagal, store credit 110–120% atau opsi refund Owner | Must |
| BK-75 | Dashboard menampilkan total store credit beredar dan yang akan kedaluwarsa dalam 30 hari | Should |
| BK-76 | Refund otomatis via Refund API | Won't (Fase 3) |

---

### 2.8 Penanganan no-show

#### 2.8.1 Aturan

| Aspek | Nilai | Alasan |
|---|---|---|
| Grace period | **15 menit** setelah `starts_at`, konfigurabel | Rentang 10–15 menit adalah praktik standar di pool hall |
| Perhitungan sesi | **Dari jam booking, bukan jam kedatangan.** Booking 20:00–22:00, datang 20:20, tetap berakhir 22:00 | Kalau tidak, satu keterlambatan menggeser seluruh antrean malam itu. Wajib tertulis jelas di halaman konfirmasi **sebelum** pelanggan membayar |
| Setelah T+15 tanpa check-in | Status → `no_show`. Meja **ditawarkan ke walk-in** dengan flag override, tetapi sisa waktunya **tidak dijual ulang sebagai booking online** | Menghindari double-claim bila pelanggan tiba-tiba datang T+20 |
| Refund | Tidak ada | Model prepaid: no-show tidak menghilangkan uang, hanya kapasitas |
| Pelanggan datang setelah ditandai no-show | Kasir dapat memulihkan sesi (T-15) bila meja belum diambil; sisa waktu = `ends_at − now`, tidak diperpanjang gratis | — |
| Kompensasi goodwill | 1× kredit sesi untuk pelanggan dengan riwayat baik, **diberikan manual admin** | Jangan otomatis; ini keputusan hubungan pelanggan |

#### 2.8.2 Notifikasi

| Waktu | Kanal MVP | Isi |
|---|---|---|
| Segera setelah `settlement` | Email + halaman konfirmasi + tombol `wa.me` "Kirim bukti ke WA saya" | Detail booking, QR check-in, aturan "sesi dihitung dari jam booking", kebijakan batal |
| H−2 jam | **Won't di MVP** (butuh WA otomatis atau push). Fase 2 | "Meja 3 kamu jam 20:00. Datang maksimal 20:15 ya" |
| T+5 menit | Notifikasi in-app (bila app terbuka) + baris di bilah peringatan kasir | "Kami tunggu 10 menit lagi" |
| T+15 menit | Email + in-app | "Booking ditandai tidak hadir. Hubungi kasir bila kamu sudah di lokasi" |
| Ke admin | Realtime dashboard + Web Push PWA + bunyi | "Meja 3 · Budi · tidak hadir" |

Catatan jujur tentang kanal: `wa.me` deep link **tidak dapat mengirim pesan otomatis dari server** — pelanggan atau admin masih harus menekan Kirim. Notifikasi WhatsApp otomatis membutuhkan Fonnte (Fase 2, dengan nomor terpisah karena risiko banned) atau WABA resmi (Fase 3, biayanya lebih besar daripada seluruh biaya hosting). Untuk admin, **Web Push PWA + bunyi di browser menyelesaikan 80% kebutuhan notifikasi realtime dengan biaya nol dan tanpa risiko banned** — jangan membayar WhatsApp API hanya untuk memberi tahu admin sendiri.

#### 2.8.3 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-77 | Grace period no-show 15 menit, konfigurabel admin | Must |
| BK-78 | Cron menandai `no_show` setelah grace habis; meja tersedia untuk walk-in dengan flag override, tidak untuk booking online | Must |
| BK-79 | Aturan "sesi dihitung dari jam booking" ditampilkan sebelum pembayaran dan di e-struk | Must |
| BK-80 | Kasir dapat memulihkan `no_show` → `in_progress` bila meja belum diambil, dengan audit log | Must |
| BK-81 | Notifikasi no-show ke pelanggan (email + in-app) dan ke admin (realtime + Web Push + bunyi) | Must |
| BK-82 | Reminder H−2 jam via WhatsApp otomatis | Won't (Fase 2) |
| BK-83 | Counter no-show per akun dalam 90 hari terakhir, tampil di profil pelanggan sisi admin | Should |

---

### 2.9 Booking walk-in oleh admin/kasir

**Ini requirement yang menentukan hidup-matinya seluruh produk.** Kalau staf tetap mencatat walk-in di kertas atau di kepala, akan ada dua sumber kebenaran: exclusion constraint tidak melihat sesi offline, dan sistem online akan menjual meja yang sedang dipakai tamu. Ini risiko adopsi manusia, bukan risiko teknis, dan tidak bisa diselesaikan dengan kode — butuh SOP dan pelatihan. Yang bisa dilakukan produk adalah membuat jalur yang benar menjadi jalur termudah.

#### 2.9.1 Alur "Mulai Sesi Walk-in"

1. Kasir menekan kartu meja kosong di denah → "Mulai Sesi Walk-in".
2. Sistem **langsung menghitung durasi maksimum aman** = waktu sampai booking berikutnya di meja itu dikurangi `turnaround_minutes`, atau sampai `close_time`, mana yang lebih dulu.
3. Bila ada booking mendekat, muncul **peringatan keras** sebelum durasi dipilih:
   > "Meja 3 dibooking atas nama **Budi** jam **20:00** (55 menit lagi). Durasi maksimum sesi walk-in: **55 menit**."
   Pilihan durasi yang menabrak booking **tidak dapat dipilih** — bukan sekadar diberi peringatan.
4. Kasir memilih durasi (kelipatan 30 menit, minimum 30) atau menekan "Sampai booking berikutnya".
5. Baris `bookings` dibuat dengan `channel='walk_in'`, `status='in_progress'`, `user_id = NULL`, `created_by_staff_id` terisi. Nama/nomor HP tamu opsional.
6. Timer berjalan. Kartu meja jadi maroon dengan sisa waktu.
7. Pada T−10 menit sistem menawarkan perpanjangan mengikuti aturan 2.6.
8. Kasir menutup sesi → `completed`. **Penagihan memakai waktu aktual** dibulatkan ke atas per 30 menit, bukan durasi yang direncanakan. Bila tamu berhenti lebih awal, mereka membayar lebih sedikit.

#### 2.9.2 Override konflik

Kasir dengan role `admin` atau `owner` dapat menembus batas durasi (kasus nyata: tamu VIP, atau booking online yang jelas akan dibatalkan). Override **wajib** disertai:
- pilihan kategori alasan dari daftar,
- teks alasan bebas,
- konfirmasi ganda yang menampilkan nama pelanggan yang akan terdampak,
- baris audit log dan entri di laporan harian "Aktivitas Sensitif".

Role `cashier` tidak dapat melakukan override.

#### 2.9.3 Kuota meja walk-in

Admin dapat menandai N meja sebagai `walk_in_only` pada band jam tertentu (misal 2 dari 8 meja setiap Jumat–Sabtu 19:00–23:00). Meja tersebut tidak pernah muncul di grid booking online. Ini menjaga pelanggan setia yang datang langsung tidak pernah ditolak — perlindungan bisnis yang sering diabaikan oleh sistem booking online.

#### 2.9.4 Booking lewat telepon

Kanal `phone` identik dengan `walk_in` kecuali: dibuat untuk waktu di masa depan, memerlukan nama + nomor HP, dan status awal `confirmed` dengan `payment_method='pay_at_venue'`. Booking telepon **tidak** menghasilkan `revenue_ledger` sampai dibayar di kasir. Batas: maksimum X booking telepon belum dibayar per hari (**ASUMSI 3**, **[PERLU KONFIRMASI]**) untuk mencegah meja terkunci oleh reservasi telepon fiktif.

#### 2.9.5 Requirement

| ID | Requirement | Prioritas |
|---|---|---|
| BK-84 | Walk-in **wajib** masuk tabel `bookings` yang sama dengan `channel='walk_in'`; tidak ada pencatatan sesi di luar sistem | Must |
| BK-85 | Sistem menghitung dan menegakkan durasi maksimum aman walk-in berdasarkan booking berikutnya dan `close_time` | Must |
| BK-86 | Peringatan keras dengan nama pemesan dan sisa menit ditampilkan sebelum durasi dipilih | Must |
| BK-87 | Override konflik hanya untuk role admin/owner, wajib alasan, konfirmasi ganda, audit log, dan muncul di laporan Aktivitas Sensitif | Must |
| BK-88 | Penagihan walk-in memakai waktu aktual dibulatkan ke atas per 30 menit | Must |
| BK-89 | Admin dapat menandai meja `walk_in_only` per band jam sehingga tidak muncul di booking online | Should |
| BK-90 | Kanal `phone` dengan status `confirmed` + `pay_at_venue`, dibatasi jumlahnya per hari | Should |
| BK-91 | Akun staf **per orang**, bukan akun bersama; role `cashier` / `admin` / `owner` dengan kewenangan berbeda | Must |
| BK-92 | Countdown "meja akan dipakai booking" muncul di layar kasir 15 menit sebelum sesi walk-in harus berakhir | Must |

---

### 2.10 Aturan anti-abuse

| Aturan | Nilai default | Mekanisme | Prioritas |
|---|---|---|---|
| Hold aktif per akun | **2** | Divalidasi di `create_booking_hold`, ditolak dengan `TOO_MANY_HOLDS` | Must |
| Booking `confirmed` mendatang per akun | **3** | Divalidasi di RPC; dapat dinaikkan admin per akun (untuk pelanggan korporat) | Should |
| Rate limit percobaan hold | **10 per user per menit** | Edge Function | Must |
| Rate limit pembuatan akun | Naikkan default Supabase "30 new users/hour"; **wajib disetel sebelum go-live** | Supabase Auth Rate Limits | Must |
| Nomor HP/WhatsApp | **Wajib** saat booking pertama, validasi format `08xx`/`+62`, disimpan dinormalisasi ke `+62` | Form + normalisasi server | Must |
| Verifikasi nomor HP via OTP WhatsApp | — | Butuh gateway WA | Won't (Fase 2) |
| Deduplikasi nomor | Satu nomor HP maksimum terkait 2 akun email; pelanggaran memicu review manual | Constraint + alert | Should |
| Blacklist | Tabel `blocked_customers(email, phone, reason, blocked_by, blocked_at, expires_at)`. Akun/nomor yang cocok tidak dapat membuat hold; pesan netral "Booking online tidak tersedia untuk akun ini, silakan hubungi venue" | Divalidasi di RPC | Should |
| Repeat no-show | ≥ 3 no-show dalam 90 hari → akun ditandai; booking online dinonaktifkan sampai direview admin | Cron harian + flag | Could |
| Anti-squatting slot prime | Maksimum 1 hold aktif pada band `PRIME-WE` per akun | Divalidasi di RPC | Could |
| Deteksi pola mencurigakan | Alert admin bila satu akun membatalkan > 3 booking dalam 7 hari | Cron harian | Could |

| ID | Requirement | Prioritas |
|---|---|---|
| BK-93 | Maksimum 2 hold aktif per akun, ditegakkan di RPC | Must |
| BK-94 | Rate limit 10 percobaan hold per user per menit di Edge Function | Must |
| BK-95 | Nomor WhatsApp wajib dan dinormalisasi; email dipakai untuk login (magic link/OTP), WA untuk kontak nyata | Must |
| BK-96 | Rate limit pembuatan akun Supabase Auth dinaikkan dari default 30/jam sebelum go-live, dan custom SMTP dipasang (SMTP bawaan hanya 2 email/jam) | Must |
| BK-97 | Blacklist berbasis email dan nomor HP dengan alasan dan masa berlaku | Should |
| BK-98 | Maksimum 3 booking `confirmed` mendatang per akun, dapat dinaikkan per akun oleh admin | Should |
| BK-99 | Flag otomatis untuk akun dengan ≥ 3 no-show dalam 90 hari | Could |
| BK-100 | Klien **tidak** melakukan auto-retry saat menerima `SLOT_TAKEN` — slot memang sudah hilang; retry hanya menambah beban | Must |

---

### 2.11 Acceptance criteria (Given / When / Then)

**AC-01 — Anti double-booking di bawah konkurensi tinggi (BK-27, BK-28)**
> **Given** meja M-03 tidak punya booking apa pun pada Sabtu 20:00–21:00
> **And** 20 pelanggan berbeda membuka halaman jadwal dan semuanya melihat slot itu `free`
> **When** ke-20 pelanggan menekan "Bayar" untuk M-03 20:00 selama 60 menit dalam rentang 80 milidetik
> **Then** **tepat satu** baris `bookings` berstatus `hold` tercipta untuk (M-03, 20:00–21:00)
> **And** 19 pelanggan lain menerima error `SLOT_TAKEN` dengan pesan "Slot ini baru saja diambil" beserta 3 saran slot terdekat
> **And** tidak ada baris parsial atau `payments` yatim yang tertinggal
> **And** ke-20 perangkat (plus semua pengunjung lain yang sedang membuka halaman jadwal) menerima broadcast `state='held'` dalam ≤ 500 ms

**AC-02 — Slot bersebelahan tetap dapat dijual (BK-05)**
> **Given** meja M-01 sudah memiliki booking `confirmed` pada 20:00–21:00
> **And** `turnaround_minutes = 0`
> **When** pelanggan lain memesan M-01 pada 21:00–22:00
> **Then** booking berhasil dibuat tanpa error
> **And** ketika `turnaround_minutes` diubah menjadi 10 lalu pelanggan ketiga memesan M-01 pada 21:00–22:00 untuk booking baru, sistem menolak karena `blocks_until` booking pertama adalah 21:10

**AC-03 — Harga di-snapshot dan tidak berubah retroaktif (BK-16, BK-17)**
> **Given** rate card `PRIME-WE` bertarif Rp 70.000/jam
> **And** pelanggan membuat booking Sabtu 20:00–22:00 dengan total tersimpan Rp 140.000 dan 4 baris `booking_price_lines`
> **When** admin mengubah `PRIME-WE` menjadi Rp 90.000/jam pada hari yang sama
> **Then** booking tersebut tetap bernilai Rp 140.000 di database, di halaman "Booking Saya", di e-struk, dan di laporan keuangan
> **And** UI admin menampilkan peringatan berisi jumlah booking `hold` aktif yang memakai harga lama
> **And** booking berikutnya untuk slot serupa bernilai Rp 180.000

**AC-04 — Harga sesi lintas band dihitung per blok (BK-13)**
> **Given** rate card `REG-WD` Rp 45.000/jam berlaku 17:00–20:00 dan `PRIME-WD` Rp 55.000/jam berlaku 20:00–02:00
> **When** pelanggan memesan meja standard pada hari Kamis 19:00–21:00
> **Then** total sesi adalah **Rp 100.000**
> **And** Ringkasan Pesanan menampilkan 4 baris: dua blok Rp 22.500 dengan label `REG-WD` dan dua blok Rp 27.500 dengan label `PRIME-WD`

**AC-05 — Sesi lintas tengah malam masuk hari operasional yang benar (BK-14)**
> **Given** hari operasional berbatas 02:00 WIB
> **When** pelanggan memesan Sabtu 23:00–01:00 (berakhir Minggu dini hari)
> **Then** `business_date` booking adalah **Sabtu**
> **And** keempat blok dihargai memakai rate card weekend, bukan weekday Minggu
> **And** booking tersebut muncul di laporan harian Sabtu, bukan Minggu

**AC-06 — Hold kedaluwarsa melepaskan slot walau cron mati (BK-41)**
> **Given** pelanggan A memegang `hold` pada M-05 20:00–21:00 dengan `hold_expires_at = 19:17`
> **And** proses `pg_cron` sedang tidak berjalan
> **When** pelanggan B membuka halaman jadwal pada pukul 19:18
> **Then** slot M-05 20:00–21:00 ditampilkan `free` karena `get_availability()` mengevaluasi `hold_expires_at > now()`
> **And** pelanggan B dapat membuat hold pada slot tersebut
> **And** ketika cron kembali berjalan, baris pelanggan A ditandai `expired_unpaid` tanpa efek samping terhadap booking pelanggan B

**AC-07 — Hanya `settlement` yang mengonfirmasi booking (BK-29, BK-35)**
> **Given** booking berstatus `hold` dengan `payments.gross_amount = 140000`
> **When** webhook Midtrans tiba dengan `transaction_status = "pending"` dan signature valid
> **Then** status booking tetap `hold` dan slot belum dikunci permanen
> **When** kemudian tiba webhook `transaction_status = "settlement"`, `status_code = "200"`, `gross_amount = "140000.00"` dengan signature SHA512 valid
> **Then** booking menjadi `confirmed`, `revenue_ledger` bertambah satu baris `sale_table` Rp 140.000, e-struk terkirim, dan admin menerima notifikasi realtime
> **When** setelah itu tiba lagi webhook `pending` yang terlambat
> **Then** status booking **tetap** `confirmed`, tidak turun, dan tidak ada baris ledger baru

**AC-08 — Webhook duplikat tidak menggandakan pendapatan (BK-29)**
> **Given** booking sudah `confirmed` akibat webhook `settlement`
> **When** webhook `settlement` yang identik dikirim 3 kali lagi
> **Then** `payment_events` hanya memuat satu baris untuk fingerprint tersebut
> **And** `revenue_ledger` hanya memuat satu baris `sale_table` untuk booking itu
> **And** admin hanya menerima satu notifikasi
> **And** keempat request dibalas HTTP 200

**AC-09 — Webhook menang atas job expiry, dengan jaring pengaman (BK-35, T-16)**
> **Given** booking B1 sudah ditandai `expired_unpaid` oleh cron pada T+19 menit
> **And** slot tersebut belum diambil siapa pun
> **When** webhook `settlement` untuk B1 tiba pada T+19:30
> **Then** B1 direbut kembali menjadi `confirmed`, slot dikunci, dan pelanggan menerima e-struk
> **Given** sebaliknya slot tersebut **sudah** diambil booking B2 yang `confirmed`
> **When** webhook `settlement` untuk B1 tiba
> **Then** `UPDATE` gagal dengan `23P01`, pembayaran B1 tetap dicatat `paid`, satu baris `refund_tasks` dibuat, satu `admin_alerts` severity `critical` dibuat, dan webhook tetap dibalas **HTTP 200**

**AC-10 — Walk-in tidak boleh menabrak booking online (BK-85, BK-86)**
> **Given** meja M-03 memiliki booking `confirmed` atas nama Budi pukul 20:00–22:00
> **And** waktu sekarang 19:05
> **When** kasir menekan "Mulai Sesi Walk-in" pada M-03
> **Then** sistem menampilkan peringatan "Meja 3 dibooking atas nama Budi jam 20:00 (55 menit lagi). Durasi maksimum sesi walk-in: 55 menit"
> **And** pilihan durasi 60 menit dan di atasnya **dinonaktifkan** untuk role `cashier`
> **And** role `admin` melihat opsi "Override" yang menuntut kategori alasan, teks alasan, dan konfirmasi ganda bertuliskan nama Budi
> **And** setiap override menghasilkan baris audit log dan muncul di laporan harian "Aktivitas Sensitif"

**AC-11 — Perpanjangan sesi dengan slot berikutnya terisi (BK-60, BK-61)**
> **Given** pelanggan sedang `in_progress` di M-03 sampai 22:00
> **And** M-03 sudah dibooking orang lain pada 22:00–23:00
> **And** M-05 kosong pada 22:00–00:00
> **When** waktu mencapai 21:50
> **Then** pelanggan menerima notifikasi "Meja 3 sudah dibooking jam 22:00. Meja 5 kosong sampai 00:00 — mau pindah dan lanjut di sana? +1 jam Rp 35.000"
> **And** kartu M-03 di layar kasir berubah menjadi "SEGERA SELESAI" dengan tombol "Tawarkan Perpanjang"
> **When** waktu mencapai 21:55
> **Then** tombol perpanjang **pada M-03** dinonaktifkan (hard stop T−5), sementara tawaran pindah ke M-05 tetap aktif

**AC-12 — Pembatalan menghasilkan store credit, bukan refund uang (BK-69, BK-73)**
> **Given** booking `confirmed` Rp 140.000 dengan `starts_at` 6 jam dari sekarang
> **And** `cancel_free_window_hours = 4`
> **When** pelanggan menekan "Batalkan Booking"
> **Then** booking menjadi `cancelled_by_user`, slot langsung bebas dan disiarkan `state='free'`
> **And** satu baris `store_credits` sebesar Rp 140.000 diterbitkan dengan `expires_at = now + 90 hari`
> **And** **tidak ada** panggilan ke Refund API Midtrans
> **Given** sebaliknya `starts_at` hanya 2 jam dari sekarang
> **When** pelanggan menekan "Batalkan Booking"
> **Then** sistem menolak dengan penjelasan kebijakan dan menawarkan opsi menghubungi venue; status booking tidak berubah

**AC-13 — No-show melepas meja hanya untuk walk-in (BK-78, BK-33)**
> **Given** booking `confirmed` M-03 pukul 20:00–22:00 atas nama Budi
> **And** `no_show_grace_minutes = 15`
> **When** pukul 20:16 dan Budi belum pernah `checked_in`
> **Then** status menjadi `no_show`, Budi menerima email dan notifikasi in-app, dan admin menerima notifikasi realtime
> **And** slot 20:00–22:00 **tetap tidak muncul** sebagai tersedia di grid booking online
> **And** kasir melihat M-03 sebagai "TIDAK HADIR" dengan opsi membuka sesi walk-in di sisa waktu tersebut
> **When** Budi datang pukul 20:35 dan meja belum diambil
> **Then** kasir dapat memulihkan sesi; sesi berjalan sampai 22:00 (bukan 22:35) dan pemulihan tercatat di audit log

**AC-14 — Ketersediaan tidak membocorkan identitas pemesan (BK-50, BK-51)**
> **Given** pelanggan A memiliki booking `confirmed` pada M-03 20:00–22:00 dengan catatan "ulang tahun Rina"
> **When** pelanggan B (login) memanggil `get_availability()` untuk tanggal itu dan berlangganan channel `availability:{date}`
> **Then** respons dan seluruh payload broadcast hanya memuat `table_id`, `starts_at`, `ends_at`, `state`
> **And** tidak ada `user_id`, `total_amount`, `guest_count`, maupun `notes` di response HTTP, di payload realtime, maupun di log jaringan browser
> **When** pelanggan B mencoba berlangganan channel `admin:orders`
> **Then** langganan ditolak oleh RLS pada `realtime.messages`
> **When** pelanggan B mencoba mengirim pesan broadcast ke `availability:{date}`
> **Then** operasi ditolak karena tidak ada policy INSERT untuk role `authenticated`

**AC-15 — Batas hold aktif mencegah slot squatting (BK-93)**
> **Given** satu akun sudah memegang 2 booking berstatus `hold` yang belum kedaluwarsa
> **When** akun tersebut mencoba membuat hold ketiga
> **Then** RPC menolak dengan `TOO_MANY_HOLDS` dan pesan "Selesaikan dulu pembayaran yang sedang berjalan"
> **And** tidak ada baris `bookings` baru tercipta
> **When** salah satu hold berubah menjadi `expired_unpaid` atau `confirmed`
> **Then** akun dapat kembali membuat hold baru

---

### 2.12 Keputusan yang menunggu konfirmasi pemilik

| ID | Pertanyaan | Default yang diasumsikan | Dampak bila salah |
|---|---|---|---|
| Q-BK-01 | Jam operasional pasti, termasuk perbedaan weekday vs weekend | 10:00–02:00 WIB setiap hari | Seluruh grid slot dan laporan harian bergeser |
| Q-BK-02 | Jumlah meja saat ini dan pembagian kelas standard vs VIP | 8 standard + 2 VIP | Estimasi kapasitas, denah, dan proyeksi omzet |
| Q-BK-03 | **Seluruh angka tarif di 2.2.2 adalah CONTOH**, di-anchor ke data pasar terverifikasi, bukan harga SPL | tier-2 (Rp 35.000–70.000/jam) | Model bisnis dan proyeksi pendapatan salah total |
| Q-BK-04 | Durasi hold: 15 menit (rekomendasi, patuh dokumentasi Midtrans) atau 10 menit (throughput lebih baik, risiko lebih tinggi) | **15 menit** | Frekuensi jalur "uang masuk, slot hilang" |
| Q-BK-05 | Perlu buffer bersih-bersih/rack ulang antar sesi? | 0 menit | Kapasitas harian berkurang ~6% per 5 menit buffer pada sesi 1 jam |
| Q-BK-06 | Ambang pembatalan gratis: 4 jam (permintaan pemilik) atau 24 jam (benchmark Lusso Billiard) | **4 jam** | Tingkat pembatalan menit-akhir dan slot kosong |
| Q-BK-07 | Masa berlaku store credit | 90 hari | Besaran kewajiban di neraca |
| Q-BK-08 | Klasifikasi PBJT: permainan ketangkasan 10% atau bar/lounge 40% | **10%** | 30 poin persentase omzet — penentu untung-rugi |
| Q-BK-09 | Harga tayang tax-inclusive atau tax-exclusive | **tax-inclusive** | Tingkat abandonment di halaman pembayaran |
| Q-BK-10 | Apakah kasir benar-benar akan menginput setiap walk-in ke sistem | diasumsikan **ya**, ditegakkan lewat SOP + pelatihan | Bila tidak, seluruh jaminan anti double-booking runtuh di dunia nyata |
| Q-BK-11 | Berapa meja yang ingin dicadangkan sebagai `walk_in_only` pada jam prime | 0 (semua bisa dibooking online) | Risiko menolak pelanggan setia yang datang langsung |
| Q-BK-12 | Batas booking telepon belum dibayar per hari | 3 | Risiko meja terkunci oleh reservasi fiktif |
| Q-BK-13 | Jumlah staf yang butuh akun terpisah dan pembagian role | 1 owner, 1 admin, 3 cashier | Desain RLS dan strategi role di JWT |