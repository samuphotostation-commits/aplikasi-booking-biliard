# Riset Operasional & Benchmark Produk — Web App Booking Biliar + Resto (SPL Sports Pool Lounge / Smokehouse Resto)

## R1. Struktur Harga Biliar di Indonesia

### R1.1 Data Terverifikasi (bukan asumsi)

| Sumber | Kota | Angka yang disebut |
|---|---|---|
| ANTARA Sumsel | Palembang | Sewa meja **Rp 35.000 – Rp 100.000 / jam** |
| Tempo (biliar keluarga Bandung) | Bandung | **Happy Hour 10.00–15.00 WIB = Rp 35.000/jam**; tarif normal **Rp 57.000/jam** (disebut eksplisit "sebelum kena pajak") |
| sekitarbandung.com | Bandung | Rp 30.000 – Rp 60.000 / jam |
| Media Indonesia | Nasional | Tarif akhir pekan / malam hari "sering lebih tinggi"; AC, Wi-Fi, free drink menaikkan tarif |
| FlatNine Billiard & Cafe (via akumpos) | Jakarta | **Rp 50.000** (Sen–Kam 11.00–18.00), **Rp 60.000** (Min–Kam 11.00–18.00), **Rp 100.000** (Jum–Sab 11.00–02.00) |
| 3A Billiard Lounge | Jakarta | mulai **Rp 40.000/jam** meja reguler |
| Street Billiard | Jakarta | mulai **Rp 25.000/jam** |
| Lusso Billiard & Lounge (listing Ayo Indonesia) | Jakarta | **Rp 75.000 / sesi** |
| Beberapa venue Jakarta | Jakarta | Model **per menit Rp 1.100/menit** (≈ Rp 66.000/jam) |
| Paket "On Break" | Jakarta | **Rp 60.000 / 2 jam**, **Rp 95.000 / 3 jam**, **Rp 119.000 / 5 jam** |

**Kesimpulan pola (terverifikasi):** industri biliar Indonesia memakai **5 dimensi harga** sekaligus, bukan satu harga flat:

1. **Unit tagih**: per jam (dominan) **atau** per menit (Rp 1.100–1.500/menit). Per menit lebih adil untuk walk-in, tapi **buruk untuk booking online** karena slot harus punya batas jelas.
2. **Time-band**: happy hour siang (contoh terverifikasi 10.00–15.00) vs prime time malam.
3. **Day-type**: weekday vs weekend/libur (FlatNine: Rp 50.000 → Rp 100.000, **naik 2x**).
4. **Table class**: meja reguler vs VIP/premium (3A Billiard menyebut "meja reguler", implikasinya ada kelas lain).
5. **Paket durasi berjenjang** dengan harga per jam yang menurun (On Break: Rp 30.000/jam di paket 2 jam → Rp 23.800/jam di paket 5 jam).

### R1.2 Contoh Struktur Tarif — **ASUMSI / CONTOH**, wajib diganti angka riil pemilik

**[PERLU KONFIRMASI]** Semua angka di bawah adalah contoh yang di-anchor ke data terverifikasi R1.1, bukan harga SPL yang sebenarnya.

**ASUMSI: Kota Tier-2** (Malang, Solo, Palembang, Samarinda, Pekanbaru — venue kelas menengah ber-AC dengan resto)

| Kode Tarif | Hari | Jam | Tarif/jam | Catatan |
|---|---|---|---|---|
| `HH-WD` | Senin–Kamis | 11.00–17.00 | **Rp 35.000** | Happy Hour, isi kekosongan siang |
| `REG-WD` | Senin–Kamis | 17.00–20.00 | **Rp 45.000** | Transisi |
| `PRIME-WD` | Senin–Kamis | 20.00–01.00 | **Rp 55.000** | Prime weekday |
| `HH-WE` | Jum–Min & libur nasional | 11.00–17.00 | **Rp 45.000** | Weekend siang |
| `PRIME-WE` | Jum–Min & libur nasional | 17.00–01.00 | **Rp 70.000** | Prime weekend |
| `VIP-*` | semua | semua | **+30%** dari tarif dasar | Meja VIP / ruang tertutup |

**ASUMSI: Kota Tier-1** (Jakarta, Surabaya, Bandung premium — sports lounge dengan smokehouse)

| Kode Tarif | Hari | Jam | Tarif/jam |
|---|---|---|---|
| `HH-WD` | Senin–Kamis | 11.00–18.00 | **Rp 55.000** |
| `PRIME-WD` | Senin–Kamis | 18.00–02.00 | **Rp 85.000** |
| `HH-WE` | Jum–Min & libur | 11.00–18.00 | **Rp 75.000** |
| `PRIME-WE` | Jum–Min & libur | 18.00–02.00 | **Rp 120.000** |
| `VIP-*` | semua | semua | **+40%** |

**ASUMSI: Paket (berlaku dua tier, angka contoh tier-2)**

| Paket | Isi | Harga | Harga efektif/jam |
|---|---|---|---|
| `PKG-DUO` | 2 jam Happy Hour + 2 minuman soft drink | Rp 85.000 | Rp 42.500 (termasuk F&B) |
| `PKG-SQUAD` | 3 jam prime weekday + 1 platter smokehouse sharing | Rp 250.000 | — |
| `PKG-NIGHT` | 5 jam weekday setelah 21.00 | Rp 220.000 | Rp 44.000 |

### R1.3 Aturan Durasi — rekomendasi untuk PRD

| ID | Aturan | Nilai rekomendasi | Alasan |
|---|---|---|---|
| `PR-01` | Minimum durasi booking online | **1 jam** | Semua data terverifikasi memakai satuan jam; slot 30 menit membuat grid terlalu padat di layar HP |
| `PR-02` | Granularitas perpanjangan | **kelipatan 30 menit** | Kompromi antara UX dan revenue |
| `PR-03` | Maksimum durasi 1 booking online | **4 jam** | Cegah 1 orang mengunci meja prime seharian; >4 jam wajib lewat admin (event/turnamen) |
| `PR-04` | Slot grid ditampilkan per | **1 jam penuh (top of the hour)** | Pola yang sudah familiar di Ayo/TIX ID |
| `PR-05` | Buffer antar-sesi | **0 menit default, konfigurabel 0/5/10 menit** | Biliar tidak butuh reset seperti lapangan futsal, tapi admin harus bisa set |
| `PR-06` | Booking paling cepat | **H+1 jam dari sekarang** | Cegah bentrok dengan walk-in yang sedang di depan kasir |
| `PR-07` | Booking paling jauh | **14 hari ke depan** | Batasi eksposur perubahan harga |

**Implikasi arsitektur yang WAJIB masuk PRD:** harga **tidak boleh** disimpan sebagai kolom `price` di tabel `tables`. Harus ada **rate card engine**:

```
rate_cards(id, name, table_class_id, day_type, start_time, end_time,
           price_per_hour, effective_from, effective_to, is_active)
```

Resolusi harga = cari rate card paling spesifik yang match `(table_class, day_type, jam mulai slot)` dan aktif pada tanggal booking. **Harga wajib di-snapshot ke `booking_items.price_locked`** saat booking dibuat — kalau admin ubah harga besok, booking kemarin tidak boleh berubah. Ini adalah bug klasik nomor satu di sistem booking.

**Edge case tarif yang harus diputuskan [PERLU KONFIRMASI]:** sesi 20.00–22.00 yang melewati batas time-band (`REG` berakhir 20.00, `PRIME` mulai 20.00) — apakah dihitung **per jam sesuai band masing-masing** (rekomendasi: ya, lebih adil dan transparan) atau **memakai band jam mulai** (lebih simpel tapi bisa di-exploit pelanggan yang booking 19.30 untuk dapat harga siang 3 jam).

---

## R2. Software & Hardware Ekosistem Biliar (untuk roadmap fase lanjut)

### R2.1 POS Biliar — lanskap global (terverifikasi)

| Produk | Fitur relevan |
|---|---|
| **BilliardPOS** (billiardpos.com) | Timer meja, kontrol lampu via **16-relay controller**, **open REST API + signed webhooks** yang memungkinkan sistem eksternal mengontrol meja dan menerima biaya tiap game otomatis. Harga hardware relay **USD 99 sekali bayar + USD 9/bulan** layanan |
| **CuetPOS** | Kontrol hingga **256 lampu**, bisa dimming LED; awalnya pakai **teknologi X-10** (sinyal carrier lewat kabel listrik eksisting), sekarang juga memakai relay **Shelly 1** |
| **Favero** (Italia) | "Time accounting system" khusus biliar/pool/snooker |
| **ABC Snooker XL147** | Timer + charging system terintegrasi lampu |
| **Vyrox Snooker King**, **Easy Snooker Billing** (Malaysia) | Billing + timer + POS terminal |

### R2.2 POS Biliar — pemain lokal Indonesia (terverifikasi)

| Produk | Fitur yang disebut |
|---|---|
| **Kasirbox** (kasirbox.com/kasir-billiard) | Dashboard meja dengan **status warna** (hijau=kosong, merah=aktif, kuning=reserved), timer per menit **atau** per jam yang bisa dipilih per transaksi, **tarif dinamis siang/malam & weekend**, member VIP dengan **saldo prepaid + poin**, paket "10 jam gratis setelah deposit", penjualan F&B terintegrasi dengan pengurangan stok otomatis, **laporan memisahkan pendapatan meja vs penjualan cafe**, rekonsiliasi shift harian, booking & queue management |
| **AKU MPOS** (appsku.id) | POS umum + modul billing billiard |
| **BilliardPOS.id** | Versi lokal, konten marketing "5 fitur wajib aplikasi kasir billiard" |

**Insight kompetitif penting:** semua produk lokal ini adalah **POS kasir (sisi staf)**, bukan **web app transaksi pelanggan**. Tidak satupun menawarkan booking + pembayaran QRIS mandiri oleh pelanggan sebelum datang. Celah pasar SPL persis di situ: **customer-facing booking + prepayment**, dengan modul kasir sebagai pendukung. Ini juga berarti **status warna meja (hijau/merah/kuning) adalah konvensi industri yang sudah familiar** — pakai konvensi itu, jangan bikin skema warna sendiri (tapi sesuaikan hue-nya ke palet amber/maroon SPL agar tetap on-brand).

### R2.3 Kontrol Lampu Meja Otomatis — apakah realistis?

**Cara kerja (terverifikasi dari CuetPOS & BilliardPOS):**

1. Setiap lampu meja dikabeli ke satu **channel relay**. Controller 16-channel = 16 meja.
2. Software memegang state timer per meja. Saat timer **start** → kirim perintah → relay menutup sirkuit → lampu menyala. Saat timer **stop/expired** → relay membuka → lampu mati.
3. Dua generasi teknologi transport: **X-10** (sinyal lewat kabel listrik eksisting, tidak perlu tarik kabel data baru, tapi rentan noise) dan **relay Wi-Fi modern** seperti **Shelly 1** (per-meja, kontrol via HTTP/MQTT di LAN, jauh lebih andal).

**Verdict untuk roadmap SPL: REALISTIS, tapi Fase 3 — jangan sentuh di MVP.**

Alasannya:
- **Ini pekerjaan listrik, bukan software.** Butuh teknisi listrik memasang relay di jalur lampu tiap meja. Salah pasang = risiko kebakaran/korsleting di venue yang menjual makanan. Ada implikasi asuransi.
- Modul **Shelly 1 (atau relay ESP32/Tasmota lokal)** harganya ± Rp 150.000–350.000/unit di pasar Indonesia (**ASUMSI**, cek harga aktual). Untuk 8 meja = Rp 1,2–2,8 juta hardware + jasa instalasi. Murah secara modal, mahal secara risiko operasional.
- **Ketergantungan Wi-Fi lokal.** Kalau internet mati, relay Wi-Fi berbasis cloud ikut mati. Desain wajib: **controller lokal di venue** (Raspberry Pi / mini PC) yang berbicara ke relay lewat LAN, dan hanya **sinkron ke cloud secara asinkron**. Jangan pernah jadikan Supabase/Railway sebagai jalur perintah realtime ke lampu.
- **Selalu sediakan saklar fisik override.** Kalau software gagal, staf harus bisa menyalakan lampu manual. Relay Shelly mendukung ini (input saklar fisik paralel).

**Arsitektur yang direkomendasikan kalau nanti dikerjakan (Fase 3):**

```
Web App (cloud)  --(realtime channel)-->  Bridge lokal (Pi/mini-PC di venue)
                                              |  HTTP/MQTT di LAN
                                              v
                                   Relay per meja (Shelly 1 / ESP32)
                                              |
                                        Lampu meja + saklar manual
```

Bridge lokal memegang **source of truth timer**, bukan cloud. Cloud hanya mengirim intent (`table_7.start_at=20:00, duration=120m`); bridge yang mengeksekusi dan melaporkan balik. Kalau internet putus, bridge tetap jalan pakai jadwal yang sudah di-cache.

| ID | Requirement | Prioritas |
|---|---|---|
| `HW-01` | Struktur data `tables` sudah menyediakan kolom `controller_channel` (nullable) sejak MVP, walau belum dipakai | **MVP** (biaya nol, hindari migrasi menyakitkan nanti) |
| `HW-02` | Event `session.started` / `session.ended` dipublish ke channel realtime, tanpa consumer di MVP | **MVP** |
| `HW-03` | Bridge lokal + relay Wi-Fi 1 meja sebagai pilot | **Fase 3** |
| `HW-04` | Rollout semua meja + saklar override + SOP kegagalan | **Fase 3** |

---

## R3. Masalah Operasional Nyata & Mitigasi Produk

Ini bagian paling menentukan apakah produk dipakai staf atau ditinggalkan setelah 2 minggu.

### R3.1 Walk-in vs Booking Online — bentrok slot

**Masalah:** pelanggan datang jam 19.00 minta meja 3, staf kasih. Padahal meja 3 sudah dibooking online untuk 20.00. Jam 20.00 pemilik booking datang, meja masih dipakai orang.

**Akar masalah:** ada **dua sistem kebenaran** — kertas/kepala staf, dan database.

**Mitigasi wajib:**

| ID | Requirement | Prioritas |
|---|---|---|
| `OPS-01` | **Satu inventaris tunggal.** Walk-in WAJIB dimasukkan ke sistem yang sama oleh kasir (mode "Mulai Sesi Walk-in"), bukan dicatat manual. Kalau ini tidak ditegakkan, seluruh produk gagal. | **MVP** |
| `OPS-02` | Saat kasir buka sesi walk-in di meja X, sistem menampilkan **peringatan keras**: "Meja 3 dibooking atas nama Budi jam 20.00 (55 menit lagi). Maksimum sesi walk-in: 55 menit." Kasir tidak bisa memilih durasi yang menabrak booking, kecuali override + alasan. | **MVP** |
| `OPS-03` | **Countdown "meja akan dipakai booking"** muncul di layar kasir 15 menit sebelum sesi walk-in harus berakhir | **MVP** |
| `OPS-04` | **Kuota meja walk-in.** Admin bisa menandai N meja sebagai `walk_in_only` (tidak pernah muncul di booking online) pada jam prime. Ini menjaga pelanggan setia yang datang langsung tidak pernah ditolak. | **MVP** |
| `OPS-05` | Peta meja realtime di layar kasir, konvensi warna industri: hijau=kosong, merah=sedang dipakai, kuning=reserved (akan datang), abu=maintenance | **MVP** |

### R3.2 Pelanggan Telat / No-show

**Data industri:** grace period standar di industri pool hall adalah **10–15 menit** sebelum meja dilepas; contoh nyata satu pool hall memakai **10 menit**. Vendor booking (AllBooked) **mengklaim** tingkat no-show di venue tanpa deposit bisa mencapai 20–30% — *ini klaim marketing vendor, bukan data resmi; jangan dikutip sebagai fakta di PRD.*

**Yang menyelamatkan SPL:** karena model bisnisnya **prepaid QRIS penuh**, no-show ≠ kehilangan uang. Tapi tetap kehilangan **kapasitas** kalau meja dibiarkan kosong menunggu orang yang tidak datang.

| ID | Requirement | Prioritas |
|---|---|---|
| `OPS-06` | **Grace period 15 menit** (konfigurabel admin, default 15). Setelah T+15 tanpa check-in, status booking → `no_show` dan meja **otomatis kembali tersedia untuk walk-in** — tapi sisa waktu booking **tidak dijual ulang sebagai booking online** (menghindari double-claim kalau pelanggan tiba-tiba datang T+20) | **MVP** |
| `OPS-07` | Sesi tetap dihitung **dari jam booking, bukan jam kedatangan**. Booking 20.00–22.00, datang 20.20 → tetap berakhir 22.00. Ini harus tertulis jelas di halaman konfirmasi dan e-receipt, sebelum bayar. | **MVP** |
| `OPS-08` | **Check-in QR.** Pelanggan menunjukkan QR booking, kasir scan → status `checked_in`, timer meja mulai. Menghilangkan ambiguitas "sudah datang atau belum". | **MVP** |
| `OPS-09` | Notifikasi WhatsApp/email H-1 jam: "Meja 3 kamu jam 20.00. Datang max 20.15 ya." | **Fase 2** |
| `OPS-10` | Kebijakan refund no-show: **tidak ada refund**, tapi **1x kredit sesi** (voucher) untuk pelanggan yang punya riwayat baik, diberikan manual oleh admin. Hindari refund otomatis. | **Fase 2** |
| `OPS-11` | Flag pelanggan repeat-no-show (≥3x dalam 90 hari) → wajib bayar penuh, tidak boleh DP | **Fase 3** |

**Benchmark kebijakan (terverifikasi dari Ayo Indonesia):** venue di Ayo memakai dua kutub — Halim Futsal: *"Booking tidak dapat dibatalkan dan tidak berlaku refund"*, reschedule gratis maks 3 hari sebelumnya, hanya 1x. Lusso Billiard: batal ≥24 jam = **refund 100%**, batal <24 jam = **refund 50%**, reschedule maks H-1 hanya 1x. **Rekomendasi SPL: ambil model Lusso** (lebih ramah, dan Lusso adalah venue biliar sejenis, bukan lapangan futsal). Refund parsial harus lewat **approval admin manual di MVP**, jangan otomatis — refund otomatis + bug = uang hilang.

### R3.3 Pelanggan Mau Perpanjang, Slot Berikutnya Sudah Dibooking

Ini skenario paling sering dan paling merusak pengalaman kalau ditangani buruk.

| ID | Requirement | Prioritas |
|---|---|---|
| `OPS-12` | Tombol **"Perpanjang"** di app pelanggan DAN di layar kasir. Sistem cek realtime: slot berikutnya di meja yang sama kosong? | **MVP** |
| `OPS-13` | Kalau **kosong** → tawarkan perpanjang 30/60 menit, bayar QRIS in-app atau cash di kasir, langsung extend | **MVP** |
| `OPS-14` | Kalau **terisi** → sistem **otomatis cari meja alternatif** yang kosong di jam berikutnya dan tawarkan "pindah ke Meja 5". Ini jauh lebih baik daripada sekadar menolak. | **MVP** |
| `OPS-15` | Kalau tidak ada alternatif → tampilkan **jujur dan lebih awal**: notifikasi di app pada T-20 menit "Sesi kamu berakhir 22.00 dan meja sudah dibooking setelahnya. Mau pesan meja lain?" Jangan kejutkan pelanggan di menit terakhir. | **MVP** |
| `OPS-16` | **Hard stop dengan buffer sopan.** Sistem mengunci extend pada T-5 menit dari booking berikutnya | **MVP** |
| `OPS-17` | Waitlist: kalau semua penuh, pelanggan bisa masuk antrean dan dinotifikasi kalau ada slot batal | **Fase 2** |

**Catatan teknis kritis:** operasi extend adalah **race condition** klasik. Dua pelanggan bisa extend ke slot yang sama, atau extend berbenturan dengan booking baru yang sedang di-checkout orang lain. Wajib memakai **exclusion constraint di level database** (PostgreSQL `EXCLUDE USING gist` pada `(table_id WITH =, time_range WITH &&)`), bukan pengecekan di kode aplikasi. Supabase = PostgreSQL, jadi ini tersedia gratis. Ini requirement non-fungsional yang **tidak boleh dinegosiasi**.

### R3.4 Pelanggan Bayar Cash di Kasir untuk Makanan, Padahal Meja Dibooking Online

**Masalah:** satu pelanggan menghasilkan **dua record pembayaran terpisah** dengan channel berbeda. Kalau tidak digabung, laporan keuangan tidak nyambung dan tidak ada yang tahu total belanja per meja.

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-01` | Konsep **"Tab Meja" (bill terbuka per sesi meja)**. Semua item — sesi biliar, F&B online, F&B pesan di kasir, F&B pesan ke waiter — masuk ke satu tab yang sama, diidentifikasi oleh `session_id` | **MVP** |
| `FB-02` | Satu tab boleh punya **banyak payment record** dengan channel berbeda: `qris_online`, `cash`, `edc_debit`, `qris_static_kasir`, `transfer`. Model datanya: `payments[]` many-to-one ke `order`, bukan satu kolom `payment_method`. | **MVP** |
| `FB-03` | Kasir bisa lihat **"sudah dibayar online Rp X, sisa Rp Y"** saat pelanggan menutup tab | **MVP** |
| `FB-04` | Laporan keuangan memisahkan **omzet berdasarkan channel** (online prepaid vs cash kasir vs EDC) dan **berdasarkan kategori** (sewa meja vs F&B) — ini persis yang dilakukan Kasirbox dan terbukti dibutuhkan | **MVP** |
| `FB-05` | QR code di tiap meja → buka menu → pesan → masuk ke tab meja yang sama tanpa perlu login ulang | **Fase 2** |
| `FB-06` | Split bill antar pemain di satu meja | **Fase 3** |

**Risiko fraud yang harus diantisipasi:** pembayaran cash yang tidak diinput = kebocoran omzet. Mitigasi MVP: **setiap penutupan tab wajib menghasilkan struk bernomor urut**, dan **shift report** wajib merekonsiliasi cash fisik di laci vs cash yang tercatat sistem, dengan selisih yang harus dijelaskan.

### R3.5 Meja Rusak Mendadak / Maintenance

| ID | Requirement | Prioritas |
|---|---|---|
| `AD-01` | Admin bisa set meja ke status `maintenance` dengan rentang waktu dan alasan | **MVP** |
| `AD-02` | Saat meja di-maintenance, sistem **menampilkan daftar booking yang terdampak** dan menawarkan **relokasi 1-klik** ke meja setara yang kosong | **MVP** |
| `AD-03` | Kalau tidak ada meja pengganti → tawarkan **refund penuh otomatis** ATAU **voucher +20%** ke pelanggan. Kesalahan venue, bukan pelanggan. | **MVP** |
| `AD-04` | Meja `maintenance` tidak pernah muncul di grid booking online | **MVP** |
| `AD-05` | Log maintenance per meja (kapan, berapa lama, biaya perbaikan) → dasar keputusan ganti kain/meja | **Fase 2** |

### R3.6 Listrik Mati / Internet Mati — Offline Fallback

**Ini requirement yang paling sering diabaikan dan paling sering menghancurkan kepercayaan staf.** Web app di venue Indonesia **akan** kehilangan internet.

| ID | Requirement | Prioritas |
|---|---|---|
| `OPS-18` | **PWA dengan service worker.** Layar kasir tetap terbuka dan tetap menampilkan **jadwal booking hari ini yang sudah di-cache** walau internet putus. Ini fitur bertahan hidup nomor satu. | **MVP** |
| `OPS-19` | **Mode darurat cetak/tampil**: tombol "Jadwal Hari Ini" yang bisa dicetak/di-screenshot tiap pagi, sebagai backup kertas | **MVP** (murah, sangat berguna) |
| `OPS-20` | Saat offline: kasir masih bisa **mencatat** sesi walk-in & order F&B ke antrean lokal (IndexedDB), yang **di-sync otomatis** saat internet kembali. Pembayaran QRIS **tidak mungkin** offline — fallback ke cash / QRIS statis bank. | **Fase 2** |
| `OPS-21` | Konflik sync (booking online masuk saat kasir offline membuat walk-in di meja & jam yang sama) → **antrean konflik untuk diselesaikan admin manual**, jangan auto-resolve | **Fase 2** |
| `OPS-22` | Indikator koneksi yang jelas & jujur di layar kasir (hijau "Tersambung" / merah "Offline — data belum tersinkron: 3 item") | **MVP** |
| `OPS-23` | **Listrik mati** = semuanya mati. Rekomendasi non-software: UPS kecil untuk router + 1 tablet kasir (± Rp 700.000–1.500.000, **ASUMSI** harga pasar). Masukkan ke dokumen sebagai rekomendasi operasional, bukan requirement software. | **MVP (dokumentasi)** |

### R3.7 Staf Mengubah Booking Manual

| ID | Requirement | Prioritas |
|---|---|---|
| `AD-06` | **Audit log immutable** untuk setiap perubahan booking: siapa (user staf, bukan akun bersama), kapan, dari nilai apa ke nilai apa, alasan (wajib diisi untuk aksi sensitif) | **MVP** |
| `AD-07` | **Role terpisah**: `owner` (semua + lihat laporan keuangan + ubah harga), `admin` (kelola booking & menu), `cashier` (buka/tutup sesi, terima bayar, tidak bisa ubah harga & tidak bisa lihat laporan omzet total) | **MVP** |
| `AD-08` | **Akun per orang, bukan akun bersama.** "Login kasir" yang dipakai 5 orang membuat audit log tidak berguna. | **MVP** |
| `AD-09` | Aksi yang wajib alasan + tercatat: pembatalan booking, refund, diskon manual, void item, override konflik walk-in, ubah harga | **MVP** |
| `AD-10` | Laporan harian **"Aktivitas Sensitif"**: semua void, diskon, dan refund hari itu dalam satu daftar yang bisa dibaca pemilik dalam 30 detik | **MVP** |
| `AD-11` | Batas diskon manual per role (kasir maks 10%, admin maks 25%, owner tak terbatas) | **Fase 2** |

---

## R4. Benchmark UX — Pola yang Sudah Familiar untuk User Indonesia

### R4.1 Ayo Indonesia (booking lapangan) — pola terverifikasi

Dari halaman venue Ayo (Halim Futsal Badminton, Lusso Billiard & Lounge):

- **Kalender grid mingguan** dengan header hari disingkat 3 huruf Indonesia: **Sen / Sel / Rab / Kam / Jum / Sab / Min**, navigasi antar-minggu dengan tombol chevron kiri-kanan.
- **Pemilih lapangan terpisah dari pemilih waktu**: dropdown/tab **"Pilih Lapangan"** (mis. 4 lapangan futsal, 4 lapangan badminton), lalu grid jam muncul untuk lapangan terpilih.
- **Harga ditampilkan besar dan lebih dulu**: *"Rp 50,000 Per Sesi"* — angka harga jadi jangkar visual utama, bukan detail kecil.
- **Catatan inklusi ditulis eksplisit di dekat harga**: *"Harga tertera sudah termasuk dua dus air mineral ukuran 240ml"*.
- **Kebijakan batal/reschedule ditulis terbuka di halaman venue**, bukan disembunyikan di T&C.
- **Guard rail satu keranjang aktif**: *"Kamu memiliki order booking di venue lain. Booking sebelumnya akan kami hapus kalau kamu ganti venue ya"* — mencegah keranjang multi-venue yang membingungkan.
- Opsi **DP (down payment)** ditonjolkan sebagai keunggulan.

### R4.2 TIX ID (bioskop) — pola terverifikasi

Alurnya: **pilih film → pilih bioskop & jadwal → "Beli Tiket" → pilih kursi (kursi tersedia ditandai warna gelap) → "Ringkasan Order" → pilih metode bayar → "Bayar" → tunggu konfirmasi.**

Yang bisa dipinjam: **layar "Ringkasan Order" sebagai gerbang wajib sebelum pembayaran**, dan **peta spasial** (denah kursi) alih-alih daftar teks. Untuk biliar, denah kursi = **denah meja**.

*Catatan verifikasi: durasi hold kursi (angka pasti berapa menit) **tidak berhasil diverifikasi** dari sumber resmi TIX ID. Jangan kutip angka spesifik.*

### R4.3 Sintesis — pola UI yang direkomendasikan untuk SPL

| ID | Pola | Detail | Prioritas |
|---|---|---|---|
| `UX-01` | **Urutan: Tanggal → Jam → Meja** (bukan Meja → Jam) | Riset perilaku booking: orang tahu *kapan* mereka bebas sebelum tahu *meja mana* yang mereka mau. Ayo memakai Lapangan→Jam karena lapangan futsal berbeda tipe (futsal vs badminton); untuk biliar yang mejanya seragam, Jam-dulu lebih cepat. | **MVP** |
| `UX-02` | **Chip tanggal horizontal scroll** 14 hari, label "Hari Ini / Besok / Sen 25 Agu" | Familiar dari Ayo & Gojek. Lebih ringan di HP daripada kalender penuh. | **MVP** |
| `UX-03` | **Grid slot jam**, 3 kolom di mobile, tiap kartu berisi: jam mulai–selesai, **harga slot itu**, dan sisa meja ("3 meja") | Harga per slot langsung terlihat = transparansi tarif dinamis. Ini yang membuat happy hour laku. | **MVP** |
| `UX-04` | **Tiga state slot yang tidak bergantung warna saja**: tersedia (border amber #F0A202, teks terang), penuh (redup + strikethrough + label "Penuh"), terpilih (fill amber solid). Wajib ada pembeda selain warna untuk aksesibilitas. | | **MVP** |
| `UX-05` | **Denah meja visual** (bukan dropdown) setelah slot dipilih — siluet meja biliar sederhana disusun sesuai layout venue asli, klik untuk pilih. Ini persis pola denah kursi TIX ID yang sudah dikuasai user Indonesia, dan cocok dengan brand SPL. | **MVP** |
| `UX-06` | **Slider durasi 1–4 jam** dengan harga total ter-update realtime, bukan mengklik banyak slot berurutan | Mengklik 3 kotak berurutan adalah error-prone di layar HP. | **MVP** |
| `UX-07` | **Sticky bottom bar** berisi ringkasan ("Sab 24 Agu · 20.00–22.00 · Meja 3 · **Rp 140.000**") + tombol CTA amber. Selalu terlihat. | **MVP** |
| `UX-08` | **Halaman "Ringkasan Pesanan"** wajib sebelum bayar, dengan rincian: subtotal sesi, subtotal F&B, **PBJT xx%**, total. Meniru "Ringkasan Order" TIX ID. | **MVP** |
| `UX-09` | **Countdown hold slot yang terlihat** di layar pembayaran ("Selesaikan dalam 14:32"). Slot di-hold di DB dengan status `pending_payment` + `expires_at`; job/trigger melepas hold saat kedaluwarsa. | **MVP** |
| `UX-10` | **Kebijakan batal/reschedule ditampilkan di halaman booking**, bukan hanya di T&C — meniru Ayo | **MVP** |
| `UX-11` | **Cross-sell F&B di langkah setelah pilih meja, sebelum bayar**: "Sekalian pesan? Platter smokehouse siap saat kamu datang." Ini titik konversi tertinggi dan langsung menaikkan average order value. | **MVP** |
| `UX-12` | **Halaman "Booking Saya"** dengan QR check-in besar, hitung mundur ke jam main, dan tombol "Perpanjang" | **MVP** |
| `UX-13` | Guard rail satu keranjang aktif (pola Ayo) | **MVP** |
| `UX-14` | **Status meja live untuk pelanggan** ("6 dari 8 meja terisi sekarang") di homepage — memenuhi requirement #4 pemilik sekaligus jadi social proof | **MVP** |
| `UX-15` | Login **OTP email / magic link**, bukan password. Kurangi friksi; password lupa = customer support. | **MVP** |
| `UX-16` | Nomor **WhatsApp wajib** saat booking (email untuk login, WA untuk kontak nyata) — realita Indonesia | **MVP** |

---

## R5. Aspek Legal & Pajak

### R5.1 Kerangka Hukum (terverifikasi)

Sejak **UU HKPD (UU No. 1/2022)**, pajak daerah untuk restoran dan hiburan dilebur menjadi **PBJT (Pajak Barang dan Jasa Tertentu)**. PBJT adalah pajak yang **ditanggung konsumen akhir** — venue hanya **memungut dan menyetor**.

| Objek | Tarif | Sumber |
|---|---|---|
| **PBJT Makanan & Minuman** (menggantikan Pajak Restoran / "PB1") | **Maksimal 10%** — tarif riil ditetapkan tiap daerah lewat **Perda**, tidak boleh melebihi 10% | Ortax, Bapenda DKI, DJP |
| **PBJT Jasa Kesenian & Hiburan** — umum | **10%** (tarif umum) | Bapenda DKI, Bisa Pajak |
| **PBJT Jasa Kesenian & Hiburan** — **diskotek, karaoke, kelab malam, bar, mandi uap/spa** | **40%** (tarif khusus, jauh lebih tinggi) | Bapenda DKI, Bisa Pajak |
| Contoh variasi daerah | Kab. Blitar menetapkan **50%** untuk jasa hiburan tertentu | Bapenda Blitar |

**Dasar pengenaan PBJT F&B** = jumlah yang dibayar ke restoran, **termasuk service charge** kalau ada. Jadi kalau SPL memungut service charge 5%, PBJT dihitung dari (subtotal + service charge), bukan dari subtotal saja.

**Objek pajak hiburan menurut UU 28/2009 secara eksplisit menyebut "permainan biliar"**. Dalam kerangka PBJT sekarang, biliar masuk kategori **permainan ketangkasan / olahraga permainan** yang dikenai **tarif umum 10%**, bukan tarif khusus 40%.

### R5.2 RISIKO PAJAK TERBESAR UNTUK SPL — wajib dibawa ke konsultan

**[PERLU KONFIRMASI — INI PERTANYAAN PALING MAHAL DALAM DOKUMEN INI]**

SPL adalah **"Sports Pool Lounge"** yang berdampingan dengan **Smokehouse Resto**. Kata **"lounge"** dan keberadaan bar berpotensi membuat Bapenda setempat mengklasifikasikan sebagian atau seluruh omzet sebagai **"bar"** → **tarif 40%, bukan 10%**. Selisihnya **30 poin persentase dari omzet** — cukup untuk menentukan untung atau rugi.

Pertanyaan yang harus dijawab pemilik/konsultan pajak sebelum sistem dibangun:

1. Apa **Perda PBJT kota/kabupaten** tempat SPL beroperasi, dan berapa tarif riil untuk (a) makanan-minuman, (b) jasa kesenian & hiburan umum?
2. Apakah venue **menjual minuman beralkohol**? Kalau ya, apakah Bapenda setempat mengkategorikannya sebagai "bar" (40%)?
3. Apakah **omzet sewa meja** dan **omzet F&B** dipisah dalam SPTPD, atau digabung?
4. Apakah SPL sudah **PKP (Pengusaha Kena Pajak)**? Kalau ya, ada interaksi dengan PPN — meski **makan di restoran tidak kena PPN** karena sudah kena PBJT daerah (dikonfirmasi DJP). Sewa meja biliar posisinya perlu dipastikan.
5. Apakah Bapenda setempat mewajibkan **tapping box / alat perekam transaksi online**? Banyak daerah sudah mewajibkan ini untuk restoran dan hiburan, dan itu **requirement integrasi tambahan** yang bisa memaksa perubahan arsitektur.

### R5.3 Dampak ke Perhitungan Harga & Produk

| ID | Requirement | Prioritas |
|---|---|---|
| `TAX-01` | **Tarif pajak = konfigurasi database, bukan konstanta di kode.** Minimal dua tarif independen: `tax_rate_fnb` dan `tax_rate_billiard`, dengan `effective_from` (tarif Perda bisa berubah, dan perubahan tidak boleh retroaktif ke transaksi lama) | **MVP** |
| `TAX-02` | Tiap **item menu & rate card** punya flag `tax_category` (`fnb` / `entertainment` / `non_taxable`) | **MVP** |
| `TAX-03` | **Keputusan penting: harga tayang = tax-inclusive atau tax-exclusive?** Sumber Tempo menunjukkan venue Bandung menayangkan Rp 57.000 *"sebelum kena pajak"* (exclusive). **Rekomendasi kuat: tayangkan TAX-INCLUSIVE** untuk booking online, karena pelanggan membayar QRIS di muka — mereka harus melihat angka final. Total yang mengejutkan di layar bayar adalah penyebab utama abandonment. Rincian pajak tetap ditampilkan sebagai baris terpisah di ringkasan. **[PERLU KONFIRMASI ke pemilik]** | **MVP** |
| `TAX-04` | **Pembulatan**: hitung pajak di level **total order**, bukan per item (mengurangi akumulasi error pembulatan), bulatkan ke **Rupiah penuh**, simpan sebagai integer. **Jangan pernah pakai tipe float untuk uang** — pakai `bigint` (satuan Rupiah) atau `numeric`. | **MVP** |
| `TAX-05` | **Struk/e-receipt wajib mencantumkan pajak sebagai baris terpisah** beserta persentasenya. Ini bukan sekadar praktik baik — DJP secara eksplisit menganjurkan konsumen selalu meminta struk yang mencantumkan informasi pajak, dan struk yang tidak transparan adalah bendera merah saat pemeriksaan Bapenda. | **MVP** |
| `TAX-06` | Struk wajib memuat: nama & alamat usaha, **NPWPD**, nomor struk berurutan tanpa lompatan, tanggal-waktu, rincian item, subtotal, pajak (+persentase), total, metode bayar, ID kasir | **MVP** |
| `TAX-07` | **Laporan "Rekap Pajak Terutang"** per bulan: DPP F&B, DPP hiburan, PBJT terutang masing-masing — langsung bisa dipakai untuk mengisi SPTPD. Ini fitur yang membuat pemilik jatuh cinta pada sistem. | **MVP** |
| `TAX-08` | Nomor struk **tidak boleh ada gap**. Void harus menghasilkan record void, bukan menghapus nomor. Gap = temuan pemeriksaan. | **MVP** |
| `TAX-09` | Laporan omzet **gross vs net**: gross (yang dibayar pelanggan) − PBJT − MDR payment gateway = net yang benar-benar masuk rekening | **MVP** |
| `TAX-10` | Export CSV/Excel untuk akuntan | **Fase 2** |
| `TAX-11` | Integrasi tapping box Bapenda kalau diwajibkan daerah | **Fase 3** |

### R5.4 Biaya Payment Gateway — dampak ke margin dan **satu jebakan regulasi**

Data terverifikasi:

| Item | Nilai |
|---|---|
| **MDR QRIS** per aturan Bank Indonesia (berlaku 1 Des 2024) | **UMI (mikro):** 0% untuk transaksi ≤ Rp 500.000; **0,3%** untuk > Rp 500.000. **UKE/UME/UBE (kecil/menengah/besar):** **0,7%** semua nominal |
| **Midtrans** QRIS | **0,7%** per transaksi sukses (merchant reguler) |
| **DOKU** QRIS | **0,7%** MDR |
| Settlement | **T+1** (dana transaksi hari ini masuk rekening hari kerja berikutnya) — aturan BI, berlaku di DOKU |
| PPN atas fee | Biaya transaksi Midtrans belum termasuk PPN, **kecuali** QRIS, GoPay, dan ShopeePay |
| DOKU | Satu-satunya PJP di Indonesia dengan lima lisensi PJP Level 1 dari BI (payment gateway, fund transfer, e-money, e-wallet, penyelenggara QRIS) |

**JEBAKAN REGULASI — [PERLU KONFIRMASI, tapi risikonya nyata]:** menurut aturan Bank Indonesia, **MDR adalah kewajiban merchant dan dilarang dibebankan ke pembeli**. Artinya menambahkan baris **"Biaya Layanan QRIS Rp 700"** ke tagihan pelanggan — hal yang sangat lazim dilakukan aplikasi di Indonesia — **berpotensi melanggar ketentuan BI**. Rekomendasi aman: **serap MDR 0,7% ke dalam harga** (naikkan tarif sedikit kalau perlu), jangan tampilkan sebagai biaya terpisah. Bawa ini ke konsultan sebelum go-live.

**Dampak margin (contoh hitung, tarif tier-2 ASUMSI):**

Booking 2 jam prime weekend @ Rp 70.000 = Rp 140.000 (tax-inclusive, PBJT 10%)
- DPP = Rp 140.000 / 1,1 = **Rp 127.273**
- PBJT disetor ke Pemda = **Rp 12.727**
- MDR 0,7% dari Rp 140.000 = **Rp 980**
- **Net masuk rekening venue = Rp 126.293** (T+1)

Jadi dari harga tayang Rp 140.000, yang benar-benar jadi pendapatan usaha adalah **± 90,2%**. Angka ini harus muncul di dashboard keuangan, bukan cuma "omzet Rp 140.000".

### R5.5 Integrasi Midtrans — spesifikasi teknis terverifikasi

| Aspek | Fakta |
|---|---|
| **Default expiry** QRIS/GoPay | **15 menit**, bisa diubah lewat parameter `custom_expiry` |
| Batas bawah expiry | **Jangan set di bawah 15 menit** — scheduler Midtrans hanya andal mengekspirasi transaksi ≥ 15 menit |
| Batas atas expiry | QRIS acquirer **AirPay/ShopeePay: maks 5 hari**; **GoPay: maks 7 hari** |
| Objek `custom_expiry` | Berisi `order_time` (ISO 8601), `expiry_duration`, `unit` |
| Acquirer QRIS Midtrans | `gopay` dan `airpay_shopee` |
| **Status transaksi** | Untuk QRIS, `pending` berarti **instruksi bayar sudah dibuat tapi pelanggan belum bayar**. Hanya **`settlement`** yang berarti dana terkonfirmasi. `capture` untuk kartu. |
| **Verifikasi webhook** | `signature_key` = SHA512 dari gabungan `order_id` + `status_code` + `gross_amount` + `ServerKey`. **WAJIB diverifikasi** — tanpa ini siapa pun bisa memalsukan notifikasi "sudah bayar" dan mendapat meja gratis. |
| **Idempotensi** | Midtrans dapat mengirim **beberapa notifikasi untuk 1 order_id**. Handler wajib idempotent, memakai `order_id` sebagai kunci. |
| Charge API | Wajib dipanggil **dari backend**, Server Key tidak boleh pernah menyentuh browser |

| ID | Requirement | Prioritas |
|---|---|---|
| `PAY-01` | Hold slot `pending_payment` dengan `expires_at`; **set `custom_expiry` Midtrans = 15 menit dan hold DB = 17 menit** (buffer 2 menit agar webhook telat tidak menghanguskan booking yang sudah dibayar) | **MVP** |
| `PAY-02` | Verifikasi `signature_key` SHA512 pada setiap webhook; tolak yang tidak cocok | **MVP** |
| `PAY-03` | Handler webhook **idempotent** by `order_id`; simpan raw payload untuk audit | **MVP** |
| `PAY-04` | Booking dikonfirmasi **hanya** pada `transaction_status = settlement` **dan** `status_code = 200` **dan** `gross_amount` cocok dengan nilai order di DB. Jangan pernah percaya `pending`. | **MVP** |
| `PAY-05` | **Reconciliation job**: polling Status API untuk order yang `pending` > 20 menit (jaring pengaman kalau webhook hilang) | **MVP** |
| `PAY-06` | Halaman "menunggu pembayaran" **polling status ke backend sendiri**, bukan mengandalkan redirect dari Midtrans | **MVP** |
| `PAY-07` | Jalankan di **sandbox** dulu, dengan skenario uji: bayar sukses, expire, webhook duplikat, webhook telat 30 detik, dua user rebutan slot terakhir | **MVP** |
| `PAY-08` | **Pilih SATU gateway untuk MVP.** Rekomendasi **Midtrans** (dokumentasi publik lengkap, SDK Node.js/PHP resmi, sandbox mudah, komunitas besar). DOKU jadi opsi Fase 2 kalau butuh refund online terpusat atau cross-border. Membangun dua integrasi sekaligus di MVP adalah pemborosan murni. | **MVP** |

---

## R6. Ide Tambahan dari Sudut Pandang Business Owner + Senior Dev

| ID | Ide | Nilai bisnis | Prioritas |
|---|---|---|---|
| `EX-01` | **Deposit/DP** (bayar 50%, sisanya di tempat) — pola yang dipakai Ayo | Menaikkan konversi booking mahal & jam prime | **Fase 2** |
| `EX-02` | **Membership prepaid + poin** (terbukti dipakai Kasirbox: deposit dapat bonus jam) | Cash flow di muka + retensi. Ini fitur dengan ROI tertinggi setelah MVP. | **Fase 2** |
| `EX-03` | **Happy hour otomatis** — engine rate card sudah mendukung; tinggal ekspos ke marketing | Isi kapasitas mati jam 11–17 | **MVP** (built-in di rate card) |
| `EX-04` | **Broadcast WhatsApp** ke pelanggan yang belum datang 30 hari | Reaktivasi murah | **Fase 2** |
| `EX-05` | **Dashboard heatmap okupansi** (jam × hari) | Dasar keputusan menaikkan/menurunkan tarif — data-driven pricing | **Fase 2** |
| `EX-06` | **Turnamen / liga internal** dengan pendaftaran & bracket online | Diferensiator kuat vs kompetitor, sangat cocok dengan brand "Sports Pool Lounge" | **Fase 3** |
| `EX-07` | **Booking meja resto (non-biliar)** terpisah untuk Smokehouse | Monetisasi sisi F&B | **Fase 2** |
| `EX-08` | **QR menu di meja** → pesan langsung ke tab meja | Kurangi beban waiter, naikkan AOV | **Fase 2** |
| `EX-09` | **KDS (Kitchen Display System)** — order F&B online masuk langsung ke layar dapur | Tanpa ini, order online = teriak ke dapur. Titik gagal operasional. | **Fase 2** (**MVP kalau volume F&B online diharapkan tinggi sejak awal**) |
| `EX-10` | **Referral code** antar pemain | Akuisisi organik, biliar sangat sosial | **Fase 3** |
| `EX-11` | **Manajemen stok F&B** dengan pengurangan otomatis (dilakukan Kasirbox) | Cegah kebocoran bahan baku | **Fase 3** |
| `EX-12` | **Shift report & rekonsiliasi kas** | Cegah kebocoran cash — ROI langsung | **MVP** |
| `EX-13` | **Halaman status live "berapa meja kosong sekarang"** yang publik & bisa di-share | Mengurangi telepon masuk ke venue; SEO lokal | **MVP** |

---

## R7. Catatan Hosting Gratis (requirement #9 pemilik)

**ASUMSI berdasarkan praktik umum, bukan hasil verifikasi tarif terkini** — angka free tier berubah sering, verifikasi ulang sebelum commit:

- **Vercel free tier** untuk frontend Next.js — cukup untuk MVP satu venue.
- **Supabase free tier** untuk PostgreSQL + Auth (email OTP) + Realtime + Storage. **Peringatan penting: proyek Supabase free tier dipause kalau tidak aktif**, dan free tier tidak punya backup harian otomatis. Untuk sistem yang memegang uang, **Supabase Pro (± USD 25/bulan) harus dianggap biaya wajib begitu venue mulai menerima pembayaran nyata**, bukan opsional. Kehilangan data booking = kehilangan kepercayaan pelanggan permanen.
- **Webhook Midtrans butuh endpoint HTTPS publik yang stabil**. Serverless function di Vercel bisa, tapi cold start berisiko timeout pada webhook. Pertimbangkan Supabase Edge Function atau Railway untuk endpoint webhook secara khusus.
- **Domain**: pakai subdomain `.vercel.app` di masa uji, tapi **beli domain sebelum menyebarkan link ke pelanggan** — mengubah domain setelah pelanggan menyimpan bookmark/QR adalah kerugian yang tidak perlu.


## Risiko
- KLASIFIKASI PAJAK (paling mahal): venue bernama 'Sports Pool Lounge' dengan bar berpotensi dikategorikan Bapenda sebagai 'bar' → PBJT 40% alih-alih 10% untuk jasa hiburan. Selisih 30 poin persentase omzet bisa menentukan untung/rugi. Wajib dikonfirmasi ke Perda setempat + konsultan pajak SEBELUM harga ditetapkan dan sistem dibangun.
- RACE CONDITION DOUBLE-BOOKING: pengecekan ketersediaan slot di level kode aplikasi PASTI bocor saat dua user checkout bersamaan atau saat extend berbenturan dengan booking baru. Wajib memakai PostgreSQL EXCLUDE USING gist constraint di level database. Ini non-negotiable.
- WALK-IN TIDAK DIINPUT SISTEM: kalau staf tetap mencatat walk-in di kertas/kepala, akan ada dua sumber kebenaran dan seluruh produk gagal terlepas dari sebagus apa kodenya. Ini risiko adopsi manusia, bukan risiko teknis, dan butuh SOP + pelatihan, bukan fitur.
- WEBHOOK MIDTRANS TIDAK DIVERIFIKASI SIGNATURE: tanpa verifikasi SHA512 signature_key, penyerang bisa memalsukan notifikasi 'settlement' dan mendapat meja gratis. Juga: mempercayai status 'pending' sebagai lunas adalah kesalahan fatal — untuk QRIS, pending berarti QR sudah dibuat tapi BELUM dibayar.
- WEBHOOK HILANG / TELAT: pembayaran sukses tapi webhook tidak sampai → pelanggan sudah bayar tapi slot dilepas sistem. Wajib ada reconciliation job yang polling Status API untuk order pending >20 menit, plus buffer hold DB (17 menit) lebih panjang dari custom_expiry Midtrans (15 menit).
- HARGA TIDAK DI-SNAPSHOT: kalau admin mengubah harga sesi (requirement #7 pemilik) dan booking lama ikut berubah nilainya, laporan keuangan rusak dan bisa timbul sengketa dengan pelanggan. Wajib price_locked di booking_items + effective_from di rate_cards.
- MDR DIBEBANKAN KE PELANGGAN: menampilkan 'Biaya Layanan QRIS' sebagai baris terpisah berpotensi melanggar ketentuan Bank Indonesia yang menyatakan MDR adalah kewajiban merchant dan dilarang dibebankan ke pembeli. Serap 0,7% ke dalam harga.
- INTERNET MATI DI VENUE: hampir pasti terjadi. Tanpa PWA + cache jadwal harian + indikator koneksi jujur, staf akan berhenti memakai sistem setelah insiden pertama dan kembali ke kertas.
- SUPABASE FREE TIER UNTUK SISTEM PEMEGANG UANG: proyek free tier dipause saat idle dan tidak punya backup harian otomatis. Kehilangan data booking/transaksi = kerusakan kepercayaan permanen. Anggap upgrade Pro sebagai biaya wajib begitu ada transaksi nyata, bukan opsional.
- MEMBANGUN DUA PAYMENT GATEWAY (Doku DAN Midtrans) DI MVP: menggandakan permukaan bug rekonsiliasi tanpa nilai tambah. Pilih satu (rekomendasi Midtrans), gateway kedua ke Fase 2.
- SCOPE CREEP KE HARDWARE: kontrol lampu meja via relay terbukti realistis secara teknis (Shelly 1 / X-10, ± Rp 150–350rb per modul), tapi melibatkan pekerjaan kelistrikan dengan risiko kebakaran dan asuransi. Wajib Fase 3, dengan bridge lokal sebagai source-of-truth timer (bukan cloud) dan saklar override fisik.
- ANGKA HARGA DI DOKUMEN INI ADALAH CONTOH: semua struktur tarif tier-1/tier-2 adalah ASUMSI yang di-anchor ke data pasar terverifikasi, bukan harga SPL. Jangan pernah dipakai sebagai harga produksi tanpa konfirmasi pemilik.
- KLAIM 'no-show 20-30%' berasal dari blog vendor booking software (AllBooked), bukan data industri resmi. Jangan dikutip sebagai fakta di PRD. Grace period 10-15 menit yang dipakai sebagai standar industri lebih dapat dipertanggungjawabkan.
- DURASI HOLD KURSI TIX ID tidak berhasil diverifikasi dari sumber resmi. Jangan cantumkan angka spesifik sebagai benchmark; pakai rekomendasi 15 menit yang diturunkan dari default expiry Midtrans, bukan dari TIX ID.

## Rekomendasi
Tetapkan tiga keputusan penentu sebelum satu baris kode ditulis. (1) PAJAK: konfirmasi ke Bapenda/konsultan apakah SPL kena PBJT hiburan 10% (permainan ketangkasan) atau 40% (kategori bar) — ini menentukan struktur harga, bukan sekadar konfigurasi. (2) SATU INVENTARIS TUNGGAL: walk-in wajib masuk sistem yang sama dengan booking online, ditegakkan lewat SOP dan pelatihan staf; tanpa ini produk gagal terlepas dari kualitas kodenya. (3) SATU GATEWAY: Midtrans saja untuk MVP, dengan tiga pengaman non-negotiable — verifikasi SHA512 signature pada webhook, handler idempotent by order_id, dan reconciliation job untuk order pending >20 menit. Di lapisan data, dua constraint wajib sejak hari pertama: PostgreSQL EXCLUDE USING gist pada (table_id, time_range) untuk mencegah double-booking, dan price snapshot per booking item agar perubahan harga tidak retroaktif. Untuk UX, ikuti pola yang sudah dikuasai user Indonesia: chip tanggal horizontal (Ayo) → grid slot jam bertuliskan harga → denah meja visual (pola denah kursi TIX ID, sekaligus cocok dengan brand siluet rak biliar SPL) → halaman ringkasan pesanan wajib → countdown hold 15 menit. Scope MVP dijaga ketat pada 10 requirement pemilik plus lima penambahan yang bersifat menyelamatkan operasional, bukan mempercantik: peta meja realtime untuk kasir, sesi walk-in di sistem yang sama, alur perpanjang-sesi dengan saran meja alternatif, PWA offline yang mempertahankan jadwal hari ini, dan audit log dengan akun per orang. Semua ide lain — membership prepaid, DP, KDS, QR menu meja, heatmap okupansi, turnamen, kontrol lampu relay — ditunda ke Fase 2/3 dengan urutan prioritas: membership prepaid dan KDS lebih dulu (ROI tertinggi), kontrol lampu paling akhir (risiko kelistrikan, bukan risiko software). Terakhir, perlakukan Supabase Pro sebagai biaya wajib begitu venue menerima uang sungguhan; hosting gratis boleh untuk masa uji, tidak untuk sistem yang memegang transaksi pelanggan.