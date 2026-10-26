# PRD — Sistem Baru SPL + Smokehouse

Status: **DISETUJUI — keputusan §2 sudah dijawab pemilik 8 Okt 2026**
Tanggal: 8 Oktober 2026
Sumber: pesan pemilik 8 Okt + lampiran `roadmap - new sistem SPL-SMH.pdf`

---

## 0 · Cara membaca dokumen ini

Lampiran PDF **berisi lebih banyak** daripada yang diketik di pesan. Isinya saya
ambil keduanya, dan yang dipakai adalah **gabungannya**:

| Hanya ada di PDF | Hanya ada di pesan ketik |
|---|---|
| Diagram arsitektur + pemetaan hak akses per peran | Contoh pembulatan (Rp245.500 → Rp246.000) |
| Smokehouse nomor **11–16** | Smokehouse "Filter rekap stok per hari/minggu/bulan/manual" |
| Landing: Event, Career, Partnership | Rincian Gudang (Central/Billiard/Resto/Bar) |
| Smokehouse: Reservasi Ultah Paket, Reservasi Private | |
| SPL: "Reservasi Smokehouse → jump to link smokehouse" | |
| "Shift (sistem Shift dari Rp0,-)" | |
| "Rekap Keuangan SPL Smokehouse" (gabungan) | |

Ada **dua tempat yang isinya berbeda** antara PDF dan pesan ketik. Keduanya saya
angkat ke bagian §2 sebagai keputusan yang saya tunggu, bukan saya tebak.

---

## 1 · Keadaan sekarang — supaya jelas apa yang TIDAK perlu dibangun ulang

Ini penting: sebagian permintaan **sudah ada**, sebagian **tinggal diubah angkanya**,
hanya sebagian yang benar-benar baru. Saya periksa langsung ke kode.

### Sudah ada dan tidak perlu disentuh
- Mesin event-sourced (`src/lib/engine.ts`) + **51 invariant** + 83 mutasi uji.
- Kasir, papan meja, dapur, void, shift, promo, pelanggan, pesan WA, absensi.
- QRIS dinamis (DOKU) + layar menghadap tamu.
- Split bill, gabung/pindah pesanan antar meja, koreksi pesanan.
- Rekap uang harian/mingguan/bulanan + rentang bebas.
- Laporan stok 05.00–05.00 + tutup buku harian tersimpan di server.
- Rekap 3 jenis (Billiard · Resto · Bar) + cetak struk.

### Sudah ada, tinggal DIUBAH (kecil)
| Permintaan | Keadaan sekarang | Perubahan |
|---|---|---|
| SPL-1 pembulatan ke ribuan | `ROUND_TO = 500`, sudah membulatkan **ke atas** | ganti jadi `1000` — **lihat §2.3, ini mengubah harga** |
| SPL-10 rekap stok per hari/minggu/bulan/manual | layar stok sudah punya rentang bebas + pintasan 7/30 hari/bulan ini | tambah pintasan "minggu ini", selebihnya sudah jalan |
| SPL-6 stok bisa +5 +10 +20 | aksi `addStock(delta)` sudah ada | tinggal tombol cepatnya |
| SMH-5 Split Bill | `paySplit` sudah ada & teruji | dipakai ulang, tidak dibuat baru |
| SMH-6 Void | `requestVoid`/`decideVoid` sudah ada | dipakai ulang |
| SMH-7 Payment cash/QR/EDC | sudah ada ketiganya | dipakai ulang |
| SMH-4 Gabung meja | `moveFnb` (pindah pesanan antar meja) sudah ada | **belum sama** — lihat §4 SMH-4 |

### Benar-benar baru
Peran 7 jenis · Gudang Central + transfer antar gudang · panel Smokehouse ·
landing page pemilih · PPN & service yang bisa diatur · pengaturan Paket ·
tambah menu sendiri · notifikasi · ekspor Excel asli · laporan penjualan per
produk · catatan pesanan · cek bill sebelum bayar · uang kembalian ·
diskon & compliment · nomor meja bisa diubah kasir.

---

## 2 · Keputusan yang saya tunggu sebelum menulis kode

Lima hal ini kalau saya tebak salah akan merusak yang sudah benar.

### 2.1 Hak akses: PDF dan pesan ketik BERBEDA

| Peran | Kata PDF | Kata pesan ketik |
|---|---|---|
| Kru Kasir | Meja · Kasir · **Dapur** | papan · kasir · **shift** |
| Kru Kitchen | Dapur · **Stok Gudang** | **hanya** Dapur |
| Kru Bar | **Dapur · Stok Gudang** | **hanya** Bar |

Perbedaannya nyata: apakah kru dapur & bar boleh menyentuh stok gudang, dan
apakah kasir boleh membuka tab Dapur. Saya tidak menebak soal siapa boleh
memegang apa.

### 2.2 Satu aplikasi atau dua aplikasi terpisah?

Permintaannya "2 aplikasi booking yang disatukan". Ada dua cara, dan ini
menentukan seluruh sisa pekerjaan:

- **A (saya sarankan) — satu basis kode, satu database, dua panel.** Landing
  page mengantar ke panel SPL atau panel Smokehouse. Meja, sesi, shift, dan
  stok diberi penanda venue. Akun, Gudang Central, dan rekap keuangan gabungan
  jadi otomatis karena memang satu tempat.
- **B — dua aplikasi terpisah yang saling tukar data.** Tiap perubahan harus
  dikerjakan dua kali, dan 51 invariant harus digandakan. Gudang Central dan
  rekap gabungan jadi pekerjaan tersendiri yang rawan tidak sinkron.

Kalau tidak ada alasan khusus (misalnya satu venue mau dijual terpisah), **A**
jauh lebih murah dan lebih sulit rusak.

### 2.3 Pembulatan ke ribuan MENGUBAH HARGA

Sekarang sudah membulatkan ke atas, tapi ke kelipatan **500**. Kalau diubah ke
**1.000**:

| Contoh | Sekarang | Sesudah |
|---|---|---|
| 30 menit reguler siang (Rp29.000/jam) | Rp 14.500 | **Rp 15.000** |
| Contoh pemilik Rp 245.500 | Rp 245.500 | **Rp 246.000** |

Jadi tagihan naik sedikit untuk tiap sesi yang jatuh di angka 500. Saya perlu
"ya" tertulis karena ini uang tamu, bukan tampilan.

### 2.4 PPN & service: ditambahkan di atas, atau sudah termasuk?

Sekarang sistem menganggap harga **sudah termasuk** pajak 10% (`DPP = total ÷ 1,1`),
dan struk pemilik yang saya lihat juga tidak punya baris pajak. Kalau PPN dan
service dibuat bisa diatur, ada dua arti yang sangat berbeda:

- **Termasuk (seperti sekarang):** tamu membayar Rp 100.000, di dalamnya sudah
  ada pajak. Omzet tidak berubah.
- **Ditambahkan:** menu Rp 100.000 + PPN + service = tamu membayar lebih. Ini
  mengubah semua harga yang dilihat tamu dan seluruh rekap.

### 2.5 "Shift dari Rp0,-"

PDF menulis *"Shift (sistem Shift dari Rp0-,)"* dan SMH-12 *"pergantian shift
sisa uang tunai menjadi Rp0,-"*. Saya baca ini sebagai: **laci dikosongkan tiap
ganti shift** — modal awal selalu Rp 0 dan semua tunai disetor saat tutup.
Sekarang shift dibuka dengan modal awal (Rp 200/500/1.000 ribu). Mohon
dikonfirmasi, karena ini mengubah cara mencocokkan kas.

---

## 2b · KEPUTUSAN PEMILIK (8 Oktober 2026)

| Pertanyaan | Keputusan |
|---|---|
| §2.1 Hak akses | **Ikut PDF.** Kru Kasir: Meja·Kasir·Dapur · Kru Kitchen: Dapur·Stok Gudang · Kru Bar: Dapur·Stok Gudang |
| §2.2 Arsitektur | **Satu basis kode, dua panel.** Landing page utama bernama SPL, dari situ dua pintu: **Smokehouse** dan **SPL Sport (biliar)**. Dibuat sesederhana mungkin — tapi **rekap kedua sistem HARUS terpisah** |
| §2.3 Pembulatan | **Ke atas, kelipatan 1.000.** Rp 245.500 → Rp 246.000; 30 menit siang Rp 14.500 → Rp 15.000 |
| §2.4 PPN & service | **Sudah termasuk harga**, seperti sekarang. Harga yang dilihat tamu TIDAK berubah; persentase yang diatur hanya memecah angka di laporan |
| §2.5 Shift dari Rp 0 | **masih menunggu** |

### Akibat langsung dari §2.2 pada rancangan

"Rekap data berbeda" adalah syarat, bukan pilihan. Maka:

- `recap`, `rekapTigaJenis`, `laporanStokHarian`, dan laporan per produk
  **wajib** menerima saringan venue, dan **bawaannya adalah venue yang sedang
  dibuka** — bukan gabungan. Rekap gabungan (yang diminta PDF sebagai "Rekap
  Keuangan SPL Smokehouse") disediakan sebagai pilihan tambahan untuk
  Superadmin/Manager/Finance, tidak pernah jadi bawaan.
- Shift juga per venue: kasir SPL dan kasir Smokehouse membuka shiftnya
  masing-masing, dan kas keduanya tidak pernah tercampur.
- Nomor/penamaan meja berdiri sendiri per venue.

### Akibat langsung dari §2.4

Karena PPN & service **sudah termasuk**, pengaturan persen di tab Atur
TIDAK BOLEH mengubah satu pun harga atau total tagihan — hanya mengubah cara
`dpp`/`tax` dipecah di laporan. Ini akan dijaga oleh invariant tersendiri:
mengubah persen PPN tidak pernah mengubah `gross` maupun `diterima`.

---

## 3 · Arsitektur (sesuai keputusan §2.2)

```
                    LANDING PAGE
                 (pilih SPL / Smokehouse)
                  + Event · Career · Partnership
                           │
            ┌──────────────┴──────────────┐
         WEB SPL                     WEB SMOKEHOUSE
   Panel Customer │ Panel Internal   Panel Customer │ Panel Internal
                  │                                 │
                  └─────────────┬───────────────────┘
                                │
                    SATU DATABASE BERSAMA
          Akun & peran · Gudang Central · Rekap keuangan gabungan
```

**Gudang:**

```
          GUDANG CENTRAL
         ╱              ╲            GUDANG BAR
 Gudang Billiard   Gudang Resto     (berdiri sendiri,
   (SPL)             (SMH)           tidak terhubung)
```

Barang berpindah Central → Billiard / Resto lewat aksi **transfer** yang
tercatat di jejak. Gudang Bar punya pemasukannya sendiri dan tidak menerima
transfer dari Central — sesuai permintaan.

**Perubahan mesin yang diperlukan:**
1. `TableType`/`PoolTable` dapat penanda `venue: "spl" | "smh"`.
2. `LiveSession`, `Shift`, `StockRow`, `StockMove` dapat penanda venue/gudang.
3. Aksi baru `transferStock(dari, ke, itemId, qty)`.
4. `recap`/`rekapTigaJenis`/`laporanStokHarian` menerima saringan venue;
   tanpa saringan = rekap gabungan.
5. `Role` dari 2 jadi 7; `CAN` diperluas (strukturnya sudah siap, tinggal isi).

**Yang TIDAK berubah:** cara uang dihitung, tutup buku, event sourcing, QRIS,
absensi, WhatsApp. Semua invariant lama harus tetap hijau.

---

## 4 · Rincian per permintaan

### SERVER / BERSAMA

**S-1 · Gudang Central + 3 gudang turunan**
Tabel stok jadi berkunci `(gudang, itemId)`. Layar Gudang: daftar stok per
gudang, transfer antar gudang dengan pencatatan siapa & kapan, dan riwayat
transfer. Gudang Bar tidak muncul sebagai tujuan transfer dari Central.
*Invariant baru:* jumlah seluruh gudang tidak pernah berubah karena transfer —
transfer memindah, bukan menciptakan.

**S-2 · Landing page utama**
Halaman publik dengan dua pintu (SPL / Smokehouse) + Event, Career,
Partnership. Panel internal tetap di balik login.

**S-3 · Akun internal 7 peran**
`Role` jadi: `superadmin`, `manager`, `finance`, `kru_gudang`, `kru_kitchen`,
`kru_kasir`, `kru_bar`. Tab disembunyikan **dan** aksi ditolak per peran —
menyembunyikan tombol saja tidak pernah cukup. Pemetaan tepatnya menunggu §2.1.

### WEB SPL

| No | Permintaan | Rencana |
|---|---|---|
| 1 | Pembulatan ke ribuan | `ROUND_TO` 500 → 1000, semua uji billing disesuaikan. Menunggu §2.3 |
| 2 | Satu papan meja jadi tempat pesan menu | Papan meja dapat satu "meja" khusus **Counter** untuk pesanan tanpa meja biliar, sehingga tidak harus lewat tab Kasir |
| 3 | Tambah menu baru (nama + harga) | Aksi `saveMenuItem` + layar di Menu & Stok. Menu jadi data venue, bukan kode |
| 4 | Pengaturan Paket (bukan promo) | **SELESAI 11 Okt** — koleksi `packages`, tambah/ubah/nonaktifkan di Atur; "Paket Siang" ikut pindah ke sini (id tetap `siang`) |
| 5 | Notifikasi reservasi & dapur | **SELESAI 11 Okt** — bunyi WebAudio + notifikasi peramban, dipasang di kerangka panel; siapa dapat kabar apa ditentukan perannya |
| 6 | Stok +5 +10 +20 | Tombol cepat di layar stok, memakai `addStock` yang sudah ada |
| 7 | PPN (%) & service (%) di Atur | Menunggu §2.4 |
| 8 | Rekap stok: awal·penambahan·penjualan·penyesuaian·akhir | Kolom sekarang (Awal·Masuk·Terjual·Kembali·Susut·Opname·Sisa) **digabung** jadi lima kolom permintaan pemilik; rinciannya tetap bisa dibuka |
| 9 | Unduh Excel yang benar | Ganti CSV dengan `.xlsx` asli (SheetJS), angka jadi angka, bukan teks |
| 10 | Rekap stok per hari/minggu/bulan/manual | Hampir selesai — tinggal pintasan "minggu ini" |
| 11 | Laporan penjualan per produk (tunai), per hari/minggu/bulan/manual | **SELESAI 11 Okt** — per produk × periode, dipecah per kanal bayar, saringan "hanya tunai", unduh Excel; angkanya dibekukan saat tutup buku |

### WEB SMOKEHOUSE

| No | Permintaan | Rencana |
|---|---|---|
| 1 | Layout per lantai | Meja SMH punya `lantai`; papan meja bertab per lantai |
| 2 | Klik meja langsung menu | **SELESAI 11 Okt** — meja Smokehouse yang sedang jalan langsung membuka pemilih menu; bill mejanya satu ketukan di bawahnya |
| 3 | Catatan pada orderan | **SELESAI 11 Okt** — kolom catatan per baris di pemilih menu, dibawa ke tiket dapur dan ditampilkan menonjol di layar dapur |
| 4 | Gabung meja (tidak harus kosong) | **SELESAI 11 Okt** — grup hanya penanda; uang tiap meja tidak pernah berpindah, jadi dua tab tetap tercatat asalnya. Satu venue saja, dijaga INV-57 |
| 5 | Split Bill | Sudah ada (`paySplit`) |
| 6 | Void | Sudah ada |
| 7 | Payment cash/QR/EDC | Sudah ada |
| 8 | Gudang Resto konek Central | Bagian dari S-1 |
| 9 | Cek bill sebelum bayar + bisa dicetak | Pratinjau bill + cetak "bill sementara" yang jelas ditandai **BELUM LUNAS** supaya tidak tertukar dengan struk |
| 10 | Tunai: nominal bayar + kembalian | Kolom uang diterima → kembalian dihitung & ikut dicetak |
| 11a | Filter rekap stok (hari/minggu/bulan/manual) | Sama dengan SPL-10 |
| 11b | Diskon (%) & Compliment di pembayaran | **SELESAI 11 Okt** — diskon manual TIDAK ditumpuk dengan promo (dipakai yang lebih besar); compliment per baris pesanan, nilainya jadi baris biaya sendiri di rekap harian, omzet per shift, dan laporan produk |
| 12 | Ganti shift sisa tunai Rp0 | Menunggu §2.5 |
| 13 | Rekap pilihan: per shift / tunai / ALL | **SELESAI 11 Okt** — saringan shift (Pagi/Sore/ALL/Tanpa shift) di layar Rekap, plus saringan "hanya tunai" di laporan produk |
| 14 | Omzet dipecah \| TUNAI \| QR \| EDC \| per shift (pagi/sore/ALL) | **SELESAI 11 Okt** — `omzetPerShift`; uang masuk shift tempat uangnya DITERIMA, bukan shift yang membuka mejanya |
| 15 | Tampilan keterangan struk disesuaikan (ada fotonya) | **Fotonya belum saya terima** — mohon dikirim |
| 16 | Nomor meja bisa diubah kasir | **SELESAI 11 Okt** — `State.tableNames` + aksi `setTableName` (berizin `bukaMeja`, jadi kasir ikut bisa); nama barunya ikut di papan, tiket, struk, dan jejak audit |

### Dari PDF, belum ada di pesan ketik

- **Reservasi Ultah Paket** dan **Reservasi Private** (Smokehouse) — belum ada
  rinciannya, saya catat sebagai pekerjaan terpisah.
- **Blasting e-mail** (sekarang baru WhatsApp).
- **Rekap Keuangan SPL + Smokehouse gabungan** — otomatis didapat kalau §2.2 = A.
- **Partnership / Event / Career** di landing page.

---

## 5 · Yang tidak boleh rusak

Pagar yang sudah ada dan harus tetap hijau sepanjang pengerjaan:

- `npm run test:utc` — 36 · 37 · **100/100 simulasi, 51/51 invariant** · 23 · 40 · 19 · 18 · 23
- `node test/mutation.mjs` — 82 mutasi (±25 menit, jalankan di salinan terisolasi)
- Aturan uang: tagihan tidak pernah turun di bawah uang yang sudah diterima;
  takeaway belum dibayar bukan omzet; void mengembalikan dana tepat sekali.

Tiap fase di bawah berhenti dulu sampai pagar ini hijau sebelum lanjut.

---

## 6 · Urutan pengerjaan

| Fase | Isi | Kenapa urutannya begini |
|---|---|---|
| **0** | 7 peran + penanda venue + pembulatan + PPN/service | Menyentuh seluruh aplikasi. Kalau dikerjakan belakangan, semua yang dibuat di atasnya harus dibongkar |
| **1** | Gudang Central + 3 gudang + transfer | Fondasi stok untuk kedua venue |
| **2** | Panel Smokehouse: lantai, klik-meja-ke-menu, catatan, gabung meja, cek bill, kembalian, diskon & compliment | Bagian paling besar dan paling baru |
| **3** | Landing page + pemisahan panel + nomor meja bisa diubah | Perlu kedua panel sudah ada |
| **4** | Paket, tambah menu, notifikasi, stok +5/+10/+20 | Berdiri sendiri, aman dikerjakan kapan saja |
| **5** | Rekap: per shift/tunai/ALL, omzet per kanal per shift, laporan per produk, ekspor Excel, kolom rekap stok | Terakhir supaya yang dilaporkan sudah final |

Tiap fase: tulis uji dulu → kerjakan → `test:utc` hijau → baru fase berikutnya.
Tidak ada fase yang dideploy setengah jadi.

---

## 7 · Yang saya butuhkan dari pemilik

§2.1–§2.4 **sudah dijawab** (lihat §2b). Yang masih ditunggu:

1. Jawaban §2.5 — shift mulai dari Rp 0 atau tetap pakai modal awal laci.
2. **Foto struk** untuk SMH-15 (disebut "difoto" tapi belum terkirim).
3. Denah lantai Smokehouse: berapa lantai, berapa meja per lantai.
4. Rincian Reservasi Ultah Paket & Reservasi Private (kalau mau masuk putaran ini).

Keempatnya hanya menahan SMH-1, SMH-12, SMH-15, dan dua reservasi itu.
Sisanya bisa dikerjakan sekarang.

---

## 8 · Kemajuan

### Fase 0 — 3 dari 4 selesai (9 Okt 2026)

| Bagian | Status |
|---|---|
| SPL-1 pembulatan ke ribuan | **selesai** — `ROUND_TO` 1000; uji billing 37 → 41 pemeriksaan |
| S-3 tujuh peran | **selesai** — `Role`, peta `CAN`, tab & bagian Atur dipagari izin |
| SPL-7 PPN & service | **selesai** — `State.pajak`, aksi `setPajak`, dijaga INV-53 |
| Penanda venue SPL/SMH | **tertahan** — butuh denah lantai Smokehouse |

### Fase 1 — Gudang Central (mesin + layar) selesai

- `State.gudangCentral`, aksi `transferStock`, `addStock`/`setStock` bisa
  menyasar Central.
- Gudang sebuah barang ditentukan dari `station`-nya (`gudangDari`), tidak
  disimpan dua kali — jadi tidak mungkin dua catatan berbeda untuk satu barang.
- **Gudang Bar tidak bisa dipasok Central** (`bolehDariCentral`), ditegakkan
  mesin, bukan layar.
- Layar baru `/admin/gudang` + SPL-6 (+5 +10 +20) di Menu & Stok.
- Transfer tercatat di laporan stok sebagai pemasukan outlet.

### Pagar sesudah semua perubahan di atas

```
36 · 41 · 100/100 simulasi, 53/53 invariant · 23 · 40 · 19 · 18 · 23   (TZ=UTC)
88 pola mutasi cocok
```

Tiga invariant baru: **INV-53** (ubah persen pajak tidak menggeser uang),
**INV-54** (transfer memindah, bukan menciptakan; Bar tidak dipasok Central),
dan INV-52 dari putaran sebelumnya. Enam mutasi uji baru membuktikan ketiganya
benar-benar menggigit.

### Alur bayar kasir — SMH-9 & SMH-10 selesai

- **SMH-9 cek bill**: tombol "Cek bill · perlihatkan ke tamu dulu" di lembar
  meja. Kertasnya bertanda **BILL SEMENTARA · BELUM DIBAYAR** di kop dan
  "Bukan bukti pembayaran" di kaki — tidak mungkin tertukar dengan struk lunas,
  dan menekannya TIDAK menutup tab.
- **SMH-10 kembalian**: kolom uang diterima + pecahan cepat (uang pas / 50rb /
  100rb / 200rb). Kembalian dihitung langsung, kurang bayar ditandai merah, dan
  keduanya ikut tercetak di struk. Angkanya **tidak masuk jejak** — yang
  tercatat sebagai penjualan tetap nilai tagihannya.

Diuji di aplikasi yang jalan: tagihan Rp 752.000, tunai Rp 800.000 →
kembalian Rp 48.000, dan struknya memuat ketiga angka itu.

### Laporan — SPL-8 & SPL-9 selesai

- **SPL-9 Excel asli**: ketiga unduhan (rekap uang, rekap penjualan, laporan
  stok) sekarang menghasilkan **.xlsx sungguhan**, bukan CSV. Penulisnya
  ditulis sendiri di `src/lib/excel.ts` — ~150 baris, **tanpa pustaka
  tambahan**: berkas xlsx cuma ZIP berisi beberapa XML, dan pustaka lengkap
  berukuran ratusan kilobita yang ikut terunduh tiap kasir membuka aplikasi.
  Angka ditulis sebagai ANGKA (itu inti keluhannya), sedangkan nomor HP dan
  kode berawalan nol tetap teks supaya nol depannya tidak dimakan Excel.
- **SPL-8 kolom rekap stok**: tabelnya kini persis bentuk yang diminta —
  **Nama barang · Awal · Penambahan · Penjualan · Penyesuaian · Akhir**
  (+ Nilai). Penyesuaian = kembali − susut + opname. Rinciannya tidak dibuang,
  cuma dilipat di balik tombol "Rincian penyesuaian", dan di berkas Excel
  ketiganya tetap ikut sebagai kolom tambahan supaya bisa diaudit.

Uji `test/excel.test.ts` (17 pemeriksaan) **membongkar berkasnya dengan
Expand-Archive milik Windows**, bukan pembaca buatan sendiri — kalau CRC,
offset, atau direktori pusatnya salah, ujinya gagal. Diuji juga dari layar
sungguhan: tombol Unduh menghasilkan blob 9 KB bertanda `PK` dengan tipe MIME
xlsx yang benar.

### Fase 0 SELESAI — penanda venue (9 Okt 2026)

Pemilik: *"denah lantainya belum ada, bagi 2 saja dulu"*. Maka:

- `Venue = "spl" | "smh"` melekat pada MEJA, bukan disimpan di State — sesi,
  tiket, dan pesanan mewarisinya lewat `tableId`, jadi tidak ada dua catatan
  yang bisa berbeda.
- **Smokehouse: 2 lantai × 12 meja** (S101–S112, S201–S212). **Jumlah 12 itu
  ANGKA SEMENTARA** — pemilik baru memastikan jumlah lantainya. Diberi nomor
  `1-01 … 2-12` supaya lantai 1 dan 2 tidak sama-sama bernomor 1–12.
- **Pemilih venue** di kepala panel (setelan perangkat, bukan data venue:
  komputer kasir biliar selalu SPL). Papan, hitungan, dan laporan ikut.
- Papan Smokehouse **dikelompokkan per lantai** (SMH-1, sejauh yang bisa
  dikerjakan tanpa denah — posisinya belum, pengelompokannya sudah).
- **REKAP TERPISAH**, sesuai syarat pemilik: `recap()` dan `rekapTigaJenis()`
  menerima venue, dan bawaannya venue yang sedang dibuka. Gabungan harus
  dipilih sadar. Pesanan tanpa meja membawa venue sendiri (tidak ada yang bisa
  menurunkannya); shift juga per venue, kas keduanya tidak pernah tercampur.
- Hari yang sudah tutup buku tidak bisa disaring per venue — angkanya sudah
  beku dan gabungan. Layar mengatakannya lewat `venueTercampur`, bukan
  menampilkan angka campuran seolah-olah sudah tersaring.

Dibuktikan di aplikasi yang jalan: meja Smokehouse 1-01 dibuka → Nasi Goreng
Telur Rp 25.000 → tutup tunai (struk: "Sewa meja Rp 0", benar, meja makan tidak
bermeteran) → rekap **Smokehouse Rp 25.000, SPL Sport Rp 0, Gabungan Rp 25.000**.

`test/rekap.test.ts` naik jadi **34 pemeriksaan**, termasuk "tidak ada venue
yang bocor ke sebelah".

### DIDEPLOY 9 Oktober 2026

Atas perintah pemilik. Kedua situs hidup dan bundel yang terpasang sudah
diperiksa berisi fitur barunya (Gudang Central, pemilih venue, kolom
Penambahan, Rincian penyesuaian, BILL SEMENTARA, Tunai diterima).

**Pembulatan ke kelipatan 1.000 SUDAH BERLAKU** untuk tamu mulai sekarang.

#### `supabase/schema-peran.sql` — TERPASANG (9 Okt 2026, sore)

Sempat tertunda karena Chrome sedang masuk ke akun Supabase **samu
photostation**, yang tidak punya akses ke project SPL — alamat projectnya
dilempar balik ke daftar organisasi. SQL tidak dijalankan lewat akun yang
salah. Sesudah pemilik masuk dengan `grendsoni@gmail.com`, berkasnya dipasang.

Isinya: `peran_sah()` + batasan kolom `staff_pins.peran` dilebarkan ke tujuh
peran (plus `karyawan` yang dipertahankan untuk jejak lama), `peran_admin()` /
`staf_admin()`, dan **9 fungsi server yang pagarnya dilebarkan** supaya
Manager benar-benar All Access seperti di diagram: `list_staff`,
`upsert_staff`, `delete_staff`, `set_staff_email`, `pesan_blast`,
`set_staff_password`, `staf_punya_sandi`, `absen_daftar`, `absen_foto`.

Terverifikasi di database:

| Pemeriksaan | Hasil |
|---|---|
| 8 peran sah diterima | semua `true` |
| peran karangan (`tukang_sulap`) | `false` — batasannya masih menggigit |
| `anon` boleh panggil `staf_admin` / `peran_admin` | `false` — pembantu internal tetap tertutup |
| batasan tabel memakai `peran_sah` | `true` |

**Percobaan pertama GAGAL** dan itu menangkap jebakan lama: berkasnya memuat
DUA versi `list_staff` (schema-staf.sql dan schema-email.sql), dan Postgres
menolak `create or replace` yang mengubah kolom kembalian. Pembangkitnya
diperbaiki supaya hanya mengambil definisi TERAKHIR tiap nama fungsi — yang
memang sedang terpasang.

Berkasnya dibangkitkan dari badan fungsi yang sudah ada (bukan diketik
ulang), jadi tidak ada versi kembar yang bisa berbeda dari repo.

---

## S-2 · Landing utama + tautan per venue — SELESAI (9 Okt 2026)

Permintaan pemilik: *"link SPL utama sebagai master, dan link SPL Sport dan
Smokehouse-nya masing-masing."*

| Tautan | Isi |
|---|---|
| **https://spl-tamu.pages.dev** | Landing master: dua pintu + jam buka |
| **https://spl-tamu.pages.dev/sport** | SPL Sport — booking meja biliar, VIP & VVIP |
| **https://spl-tamu.pages.dev/smokehouse** | Smokehouse — menu & pesan makanan |
| https://spl-kasir.pages.dev | Panel internal (tidak berubah) |

**Tautannya bersih, tanpa pagar (#).** Rute aplikasi hidup di hash, tapi orang
mengetik dan membagikan alamat tanpa pagar. Jadi `public/_redirects`
mengantar semua alamat ke aplikasi, lalu `main.tsx` memindahkannya ke rute
hash yang setara dengan `replace` (supaya tombol Kembali tidak memantul).
Diuji di alamat sungguhan: ketiganya 200 dan mendarat di halaman yang benar.

**Pesanan dari halaman Smokehouse masuk rekap Smokehouse.** Halaman venue
menandai `venueTamu`, dan Checkout serta Payment menyertakannya di pesanan —
tanpa itu semua pesanan tamu jatuh ke rekap SPL dan pemisahan rekap yang
diminta pemilik jadi bohong. Kuncinya sengaja BEDA dari pilihan venue staf,
supaya kasir yang membuka halaman pelanggan tidak ikut memindahkan papannya.

**Yang belum ada di halaman Smokehouse:** reservasi meja resto, Reservasi
Ultah Paket, dan Reservasi Private — rinciannya belum diberikan pemilik.
Sengaja TIDAK dibuatkan tombol mati.

---

## SPL-3 · Tambah menu baru — SELESAI & LIVE (9 Okt 2026)

Pemilik bisa menambah barang sendiri di **Menu & Stok → + Tambah menu baru**
(nama, harga, dan siapa yang menyiapkan: Dapur / Bar / Counter). Barangnya
tersimpan di jejak, jadi muncul sama di semua perangkat tanpa membangun ulang
aplikasi.

### Keputusan rancangan yang penting

**Nama, harga, dan station DIBEKUKAN di baris pesanan** saat dipesan — bukan
dicari ulang dari buku menu. Dua alasan, dan keduanya soal uang:

1. Barang tambahan pemilik memang tidak ada di buku menu. Tanpa pembekuan,
   `lineValue` mengembalikan **nol** dan seluruh bill barang itu hilang.
2. Barang yang pernah terjual harus tetap bernama di laporan lama. Kalau
   dicari ulang, menonaktifkan satu menu mengubah riwayat penjualan jadi
   deretan kode tanpa nama.

**Dinonaktifkan, bukan dihapus.** `removeMenuItem` menyetel `aktif: false`:
hilang dari daftar pesan, tetap bernama di pesanan & laporan lama.

### Satu bug yang tertangkap uji

Uji pertama saya LOLOS padahal labelnya bertentangan dengan nilainya — dan
itu menandai bug asli: **barang counter tambahan (rokok, korek) bocor ke menu
HP pelanggan.** Aturan umur yang sudah dipasang untuk kategori counter bawaan
tidak ikut berlaku untuk barang yang ditambah pemilik. Sudah diperbaiki di
`kategoriJual()` dan dikunci dua uji: ADA di daftar kasir, TIDAK ada di menu HP.

### Pagar

`test/rekap.test.ts` naik dari 34 ke **46 pemeriksaan**. Satu pola mutasi
sempat basi karena `bolehDariCentral` berubah tanda tangan — diperbaiki,
88 pola cocok lagi.

```
36 · 41 · 100/100 simulasi, 53/53 invariant · 23 · 40 · 19 · 18 · 46 · 17   (TZ=UTC)
88 pola mutasi cocok
```

**Catatan cakupan jujur:** barang tambahan diuji oleh suite khusus, belum oleh
100 simulasi acak — simulasinya belum pernah membuat menu baru.

---

## SPL-4 · SMH-2 · SMH-3 · SMH-16 — SELESAI (11 Okt 2026)

**SPL-4 Paket jadi data venue.** Koleksi `packages` baru: nama, durasi jam,
minuman gratis, harga, batas jam mulai. Bisa ditambah, diubah, dinonaktifkan
dari **Atur → Paket**. "Paket Siang" yang dulu di kode ikut pindah ke sini —
id-nya sengaja tetap `siang` supaya sesi lama tetap terbaca. Syarat paket
(durasi & batas jam mulai) ditegakkan `slotProblem`, bukan hanya disembunyikan
layar.

**SMH-3 Catatan pesanan.** `Ticket.note` dibawa dari baris pesanan ke tiket
dapur dan dicetak menonjol di layar dapur — bukan disimpan diam-diam di bill.

**SMH-2 Klik meja langsung menu.** Meja Smokehouse yang sedang jalan membuka
pemilih menu langsung; bill mejanya satu ketukan di bawahnya. Meja biliar
tetap membuka lembar mejanya dulu — di sana yang pertama dicari kasir adalah
meteran dan tombol tutup tab, bukan menu.

**SMH-16 Nomor meja bisa diubah kasir.** `State.tableNames` + aksi
`setTableName`, berizin `bukaMeja` (jadi kasir ikut bisa, sesuai permintaan
pemilik). Seluruh mesin memanggil `namaMeja(state, tableId)`, jadi nama baru
ikut di papan, tiket dapur, struk, dan jejak audit sekaligus.

---

## SMH-11b · SMH-13 · SMH-14 · SPL-11 · SPL-5 — SELESAI (11 Okt 2026)

### SMH-11b · Diskon manual (%) & Compliment

**Diskon manual** masuk di layar bayar, hanya untuk peran yang punya izin
`beriDiskonManual` (Superadmin & Manager) — dan mesin menolaknya lagi di
sisinya, jadi perangkat yang berbohong tidak bisa memberi diskon sendiri.
Yang penting: **tidak ditumpuk dengan promo.** Kalau keduanya ada, yang
dipakai hanya yang lebih besar — sikap yang sama dengan `bestPromo`, karena
diskon bertumpuk adalah kebocoran margin yang paling sulit dilacak (tidak ada
satu angka pun yang salah, hanya hasil akhirnya yang terlalu kecil).

Kalau kolom diskon terisi tapi perannya tidak berhak, **diskonnya diabaikan —
pembayarannya tidak ditolak.** Tamu sudah berdiri di kasir; menolak seluruh
pembayaran hanya akan membuat kasir mencari jalan lain.

**Compliment** (gratis, ditanggung venue) bekerja per baris pesanan: harganya
dijadikan nol dan harga ASLINYA disimpan di barisnya (`CartLine.comp`). Jadi
dua hal terjaga sekaligus — tagihan tamu benar-benar berkurang (uang tetap
berimbang: omzet = uang diterima), dan nilai yang digratiskan **tidak hilang
dari laporan**: ia punya barisnya sendiri sebagai biaya venue, di rekap
harian, di omzet per shift, dan di laporan per produk.

Nilainya **dihitung dari barisnya, bukan ditimbun di sesi.** Angka timbunan
tidak akan pernah tahu kalau baris itu kemudian di-void atau dipindah ke meja
lain — dan biaya compliment akan dilaporkan untuk barang yang sebenarnya
kembali.

Barangnya **tidak** dikembalikan ke stok: barangnya memang keluar dan
dinikmati tamu. Yang gratis uangnya, bukan barangnya.

### SMH-13 & SMH-14 · Rekap per shift, omzet | TUNAI | QRIS | EDC |

`omzetPerShift(state, hari, venue?)` memecah uang hari itu per shift
(Pagi/Sore/ALL) dan per kanal. Satu pembayaran masuk shift tempat uangnya
**DITERIMA**, bukan shift yang membuka mejanya: tab yang dibuka pagi dan
dibayar sore adalah uang shift sore — itu laci yang akan dihitung.

Penanda shift yang dicatat saat pembayaran dipakai lebih dulu; jamnya hanya
jalur jatuh untuk jejak lama. Yang tidak bisa ditempelkan ke shift mana pun
masuk baris **"Tanpa shift"** yang ditampilkan apa adanya — kalau
disembunyikan, jumlah per shift tidak akan sama dengan rekap harian dan tidak
ada yang tahu kenapa. Prabayar online dipisah karena uangnya tidak pernah
lewat laci.

### SPL-11 · Laporan penjualan per produk

Per produk × periode (hari/minggu/bulan/rentang bebas), **dipecah per kanal
bayar**, dengan saringan "hanya tunai", saringan tempat (Dapur/Bar/Counter),
dan unduh Excel. Rentang & venue-nya diwarisi layar Rekap — supaya tidak ada
dua tanggal di satu halaman.

Kanal diambil **setepat mungkin dari jejak, bukan dibagi rata**: baris
prabayar ikut pembayaran onlinenya, baris yang dilunasi split bill ikut kanal
orang yang membayarnya (kuncinya tersimpan di pembayaran itu), sisanya ikut
kanal penutup tab. Yang benar-benar tidak bisa ditentukan masuk kolom
**"tidak tercatat"** — sengaja tidak dipaksa masuk tunai, karena laporan
tunai adalah laporan yang paling dipercaya pemilik.

**Angkanya dibekukan saat tutup buku** (`DayArchive.produk`), dengan rumus
yang SAMA dengan laporan hari hidup — jadi angka beku tidak mungkin berbeda
dari angka hidupnya. Ringkasan produk sengaja TIDAK ikut dilepas saat rincian
baris dilepas, supaya pertanyaan "bulan lalu Indomie terjual berapa" masih
bisa dijawab. Hari yang tutup buku SEBELUM fitur ini ada tidak punya
rinciannya; harinya **disebut satu per satu di layar**, bukan dihitung nol.

### SPL-5 · Bunyi & notifikasi

Dipasang di kerangka panel, bukan di tiap layar: reservasi yang masuk tetap
terdengar walau yang sedang dibuka tab Rekap. Siapa mendapat kabar apa
ditentukan **perannya**: dapur mendengar pesanan masuk, lantai/kasir mendengar
pesanan **selesai** (dia yang mengantarnya) dan reservasi datang.

Tiga aturan yang membentuknya:

1. **Daftar pertama disemai diam-diam.** Membuka panel jam delapan malam
   tidak boleh membunyikan dua puluh tiket yang sudah ada — sekali begitu,
   suaranya akan dimatikan selamanya oleh yang bekerja.
2. **Bunyi dibangkitkan WebAudio, bukan berkas suara.** Nol bita aset, tidak
   ada yang bisa gagal diunduh.
3. **Izin notifikasi tidak pernah diminta sendiri** — hanya dari tombol di
   **Atur → Bunyi & notifikasi**. Kotak izin yang muncul tanpa diminta adalah
   hal pertama yang ditolak orang, dan sesudah ditolak tidak bisa ditanya
   lagi. Selama belum diizinkan, bunyinya tetap jalan.

Status `preparing` (sedang dimasak) sengaja tidak dikabarkan: yang
menekannya adalah dapur sendiri.

### Satu cacat lama yang ikut ketemu

**`service` HILANG di rekap mingguan/bulanan.** `recapRange` tidak pernah
menjumlahkan `service`, dan DPP periode dihitung `gross - tax` — jadi begitu
pemilik memasang service charge, bagian service terhitung **dua kali** ke
dalam DPP periode. Sudah diperbaiki: service ikut dijumlah dan
`dpp = gross - tax - service`.

### Pagar

`test/rekap.test.ts` 63 → **113 pemeriksaan**. Dua invariant baru di 100
simulasi acak:

- **INV-55** omzet per shift: jumlah semua shift = rekap harian, pecahan
  kanalnya tepat, dan lini usahanya menjumlah ke omzet.
- **INV-56** laporan produk = nilai barang rekap, pecahan kanal tiap baris
  menjumlah ke totalnya, dan compliment beku = jumlah baris compliment tabnya.

`compliment` ikut diacak di simulasi (52 diterima · 13 ditolak), termasuk
menyasar baris yang TIDAK boleh (prabayar, sudah dibayar, sudah gratis) —
mesin yang menolaknya, bukan tes yang memilih.

**Tiga lubang uji lama yang ikut ditutup** (ketemu karena uji mutasi
dijalankan penuh, bukan hanya pemeriksaan polanya):

1. `test/mutation.mjs` **crash** sejak mutasi peran ditambahkan:
   `src/data/staff.ts` dipakai mutasi tapi tidak ada di daftar berkas yang
   disalin. Jadi uji mutasi berhenti di mutasi ke-10 dan sisanya tidak pernah
   berjalan.
2. **Transfer gudang tidak pernah berhasil sekali pun** di 100 simulasi (0
   diterima / 102 ditolak): barangnya diacak dari seluruh buku menu, jadi
   selalu ditolak sebelum sampai ke aturan yang mau diuji. Akibatnya INV-54
   hijau tanpa pernah dijalankan — dua mutasi gudang LOLOS. Sekarang barangnya
   dipilih yang Centralnya memang ada isinya, izinnya diundi terpisah dari
   jenis percobaannya, dan barang Bar sengaja ikut dimasukkan ke Central supaya
   aturan "Gudang Bar berdiri sendiri" teruji di pintu transfernya.
3. Mutasi "service muncul walau persennya 0" adalah **mutan kembar** —
   `Math.round(sisa * 0/total)` juga nol, jadi tidak ada tes yang bisa
   menangkapnya. Diganti mutan yang benar-benar mengubah angkanya, dan
   simulasinya sekarang benar-benar pernah memasang PPN bukan nol (setPajak
   6 → 44 diterima).

```
36 · 41 · 100/100 simulasi, 56/56 invariant · 23 · 40 · 19 · 18 · 135 · 17 · 12   (TZ=UTC)
103 pola mutasi cocok
```

---

## SMH-4 · Gabung meja — SELESAI (11 Okt 2026)

Dua meja (atau lebih) dibayar bersama sebagai **satu bill**, dan — sesuai
permintaan pemilik — **tidak harus menunggu mejanya kosong**: justru meja yang
sedang dipakai yang digabung tamunya.

### Keputusan rancangan yang menentukan

**Grup hanya PENANDA. Uangnya tidak pernah berpindah.** Tiap meja tetap
memegang catatan uangnya sendiri: baris pesanannya, sewa mejanya, prabayarnya,
pembayaran sebagiannya. Yang disatukan hanya struk dan satu kali pembayaran;
mesin tetap menutup tiap tab sendiri-sendiri dengan rumus uang yang sama
seperti biasa.

Akibatnya dua hal yang diminta pemilik terpenuhi sekaligus tanpa pengecualian
baru di jalur uang:

1. *"dua tab tetap tercatat asalnya"* — rekap masih bisa menjawab meja mana
   menghasilkan apa.
2. Seluruh pagar uang yang sudah ada (INV-06, INV-07, INV-08, INV-44) berlaku
   apa adanya. Kalau gabungan memindahkan baris atau menjumlahkan uang ke satu
   sesi, keempatnya harus ditulis ulang — dan itu persis bagian yang tidak
   boleh disentuh.

**Satu grup tidak pernah lintas venue.** Rekap SPL dan Smokehouse wajib
terpisah (keputusan pemilik 8 Okt 2026). Satu bill yang memuat meja dua venue
akan membuat pemisahan itu bohong **tanpa ada satu angka pun yang kelihatan
salah** — jadi mesin menolaknya.

**Dua gabungan tidak digabung lagi.** Menggabung dua gabungan hampir selalu
salah tekan, dan akibatnya satu bill raksasa yang harus dipisah satu per satu
saat tamu menunggu.

**Pembersihan penanda dilakukan DI SATU TEMPAT** (`rapikanGrup`, dipanggil
`reducer` dan `tickState`). Tab bisa keluar dari gabungannya lewat banyak
pintu: ditutup kasir, di-void, ditutup otomatis saat tutup buku, dilepas
sendiri, dilepas sebagai no-show. Kalau penandanya dibersihkan di tiap pintu,
cepat atau lambat ada satu pintu yang terlewat — dan sisanya adalah meja yang
terus ditulis "gabungan" dengan meja yang tamunya sudah pulang. Dua aturannya:
hanya tab berjalan boleh bergrup, dan **grup berisi satu meja bukan grup**.

### Di layar kasir

Lembar meja yang digabung menulis pasangannya dan total gabungannya **sebelum**
tombol bayar, bukan sesudah. Layar bayar memecah per meja, lalu totalnya, dan
mengatakan terang-terangan bahwa menekan metode pembayaran akan menutup semua
meja itu sekaligus. Struknya memberi nama meja di tiap barisnya — tanpa itu
tamu melihat dua nasi goreng tanpa tahu yang mana punya mejanya.

### Pagar

**INV-57** di 100 simulasi acak: gabungan tidak memindahkan uang (pesanan,
prabayar, split bill, nilai meja tiap sesi dibandingkan sebelum/sesudah),
tagihan grup = jumlah tagihan mejanya, grup tidak pernah lintas venue, tidak
pernah memuat tab yang tidak berjalan, dan tidak pernah berisi satu meja.
Ditambah satu pemeriksaan tingkat AKSI: permintaan gabung yang tidak sah tidak
boleh mengubah sesi **maupun menambah baris di jejak audit** — jejak yang
mengaku melakukan sesuatu yang tidak terjadi lebih berbahaya daripada tidak
mencatat.

`test/rekap.test.ts` naik ke **135 pemeriksaan** (termasuk 18 untuk gabung
meja). Simulasi sekarang juga menggabung TIGA meja sekaligus — grup berdua
selalu bubar sendiri begitu satu tabnya ditutup, jadi hanya grup bertiga yang
bisa membuktikan penandanya benar-benar dibersihkan per tab.

---

## Cacat yang ikut ketemu (11 Okt 2026)

### 1. Paket buatan pemilik TIDAK BISA dibooking online

Sejak SPL-4, id paket adalah data venue — pemilik boleh membuat "Paket Malam",
"Paket Ultah", apa pun. Tapi pemeriksa bentuk kejadian (`validSessionPayload`)
masih mematok `paket === "siang"`. Akibatnya setiap booking online dengan paket
buatan pemilik dianggap **kejadian rusak** dan dibuang sebelum sampai ke
reducer: tamu melihat slotnya gagal ditahan, dan **tidak ada apa pun di layar
yang menjelaskan kenapa**. Paket bawaan (`siang`) tetap jalan, jadi cacat ini
tidak akan pernah terlihat sampai pemilik membuat paket pertamanya sendiri.

Sudah diperbaiki: bentuknya menerima id paket apa pun; yang memeriksa paketnya
ADA dan syaratnya terpenuhi tetap `slotProblem` di dalam reducer — itu tempat
nilai bisnis diperiksa. Dikunci 6 pemeriksaan baru.

### 2. Simulasi tidak pernah menyentuh meja Smokehouse

Seluruh 100 simulasi acak hanya membuka meja biliar, jadi pemisahan dua venue
— fitur terbesar bulan ini — tidak pernah dilewati satu invariant pun di luar
uji khususnya. Sekarang 20% walk-in dibuka di meja Smokehouse: mejanya tidak
bersewa, tapi pesanan, split bill, void, compliment, dan rekapnya harus tetap
benar. 100/100 tetap bersih.

### 3. Umur simpan ringkasan produk

Angka rekap harian disimpan **selamanya** (belasan angka per hari). Ringkasan
per produk bisa seratus baris per hari, dan state ini disalin ke SETIAP
perangkat — dibiarkan tumbuh setahun, yang disinkronkan tiap kali aplikasi
dibuka jadi megabita. Jadi `PRODUK_DAYS = 120` hari: setiap pertanyaan yang
BISA diajukan layar rekap (maksimal 92 hari sekaligus) tentang kuartal
berjalan masih terjawab utuh, dan hari yang lebih tua disebut apa adanya
sebagai hari tanpa rincian — bukan dihitung nol.

---

## Sapuan uji mutasi penuh — 103/103 (11–12 Okt 2026)

Seluruh 103 mutasi dijalankan, per batch, dan **semuanya tertangkap**. Ini
sapuan penuh pertama sejak mutasi peran ditambahkan — sebelumnya runner-nya
crash di mutasi ke-10 dan 93 mutasi sisanya tidak pernah berjalan.

### Empat lubang uji yang ditutup

**1 & 2 · Peta izin tidak pernah dijaga dari dua arah.** 100 simulasi acak
hanya bisa menangkap izin yang TERLALU LUAS (INV-10: ada peran melakukan
sesuatu yang harusnya ditolak). Izin yang TERLALU SEMPIT tidak pernah
ketahuan — hak yang dicabut diam-diam hanya terlihat seperti "aksinya
ditolak", dan ditolak adalah hal yang terjadi ribuan kali di simulasi.
Terbukti: mutan yang mencabut hak stok kru kitchen & bar lolos dari seluruh
100 simulasi.

Sekarang ada `test/peran.test.ts` (**32 pemeriksaan**): peta izin dituliskan
ulang apa adanya lalu dibandingkan dengan `CAN`, dua arah. Kalau pemilik
mengubah pembagian tugas, berkas itu yang diubah lebih dulu — dan uji yang
gagal adalah daftar tempat yang harus ikut disesuaikan.

**3 · Tiga skenario Paket Siang mati diam-diam sejak SPL-4.** Simulasinya
masih memanggil `slotProblem(..., paket: true)` (ya/tidak), padahal sejak
paket jadi data venue parameternya berubah jadi **ID paket**. Hasilnya
"paket tidak tersedia" untuk semua meja, jadi ketiga skenario berhenti
berjalan tanpa satu uji pun memerah.

Akar masalahnya lebih dalam: **`tsconfig.json` hanya memuat `src`**, jadi
galat tipe di berkas uji tidak pernah terlihat. Ditambahkan
`tsconfig.test.json` + `npm run test:types` (memuat `src`, `test`,
`scripts`); begitu dinyalakan, ketemu 3 galat tipe nyata yang sudah lama
tersembunyi — termasuk yang ini. Sekarang nol, dan jadi bagian pagar tetap.

**4 · Void jatah minuman Paket Siang tidak pernah terjadi di simulasi.**
Jalurnya butuh empat hal berbarengan: sesi Paket Siang, baris minuman
berharga nol, permintaan void baris itu, dan persetujuannya. Diundi,
keempatnya nyaris tidak pernah bertemu. Sekarang jadi skenario PASTI.

Skenario itu sekaligus mengungkap satu aturan mesin yang belum tertulis di
mana pun: **baris pra-order (`prepaid`) memang TIDAK bisa di-void per
baris** — uangnya sudah masuk, jalurnya refund pesanan. Jadi jalur "jatah
minuman kembali" hanya ada untuk minuman yang diambil di kasir, dan
skenarionya dibuat persis begitu.

### Satu mutan yang DIBUANG, bukan diperbaiki

"Persen diskon manual tidak dibatasi 0–100" adalah **mutan kembar**: persen
di luar 0–100 selalu berakhir sama karena ada pagar KEDUA sesudahnya
(`Math.min(diminta, counter - dibayarSebagian)`). 150% jatuh ke batas yang
sama dengan 100%, dan persen negatif tidak pernah lolos `pst > 0`. Tidak ada
tes yang bisa menangkapnya — bukan karena tesnya bolong, tapi karena tidak
ada perilaku yang berubah. Penjepitnya tetap dipertahankan sebagai lapis
kedua (dan supaya jejak audit tidak menulis "diskon manual 150%"), mutasinya
yang dibuang.

### Cara menjalankannya (penting)

`npm run test:pola` HANYA memeriksa pola mutasi masih cocok dengan kode —
bukan apakah mutasinya tertangkap. Sapuan penuhnya:

```
MUT_ONLY=$(seq -s, 1 20) node test/mutation.mjs      # lalu 21-40, dst
```

Per batch ≤20, karena satu putaran penuh ±45 menit sedangkan tugas latar di
mesin ini dihentikan di 30 menit. **Kalau runner dibunuh di tengah jalan,
`finally { restore() }` tidak jalan dan berkas sumber tertinggal
TERMUTASI** — bandingkan dengan `node_modules/.cache/mutation-backup/` dan
salin kembali sebelum build/deploy. Dua kali terjadi di sesi ini
(`engine.ts` dan `remote.ts`), keduanya ketemu dan dipulihkan.

Satu lagi: mutasi yang ✗ di batch yang DIBUNUH belum tentu benar-benar
lolos. Keluarannya terpotong dan parser membacanya seperti "tidak ada
invariant yang memerah" — #55 muncul ✗ begitu, lalu tertangkap begitu
dijalankan sendiri. Selalu ulangi yang ✗ satu per satu sebelum
mempercayainya.

### Keadaan akhir

```
36 · 41 · 100/100 simulasi, 56/56 invariant · 23 · 40 · 19 · 18 · 135 · 17 · 12 · 32   (TZ=UTC)
npm run test:types   — nol galat
103/103 mutasi tertangkap
```

---

## Keputusan & koreksi pemilik — 12 Oktober 2026

| Pertanyaan | Jawaban pemilik | Hasilnya |
|---|---|---|
| Nomor WA venue | **0851-2118-0988** | Dipakai Event · Career · Partnership di halaman depan |
| Denah Smokehouse | *"gunakan yg ada saja, buat untuk lantai 1 saja dulu, lantai 2 masih on progress"* | Lantai 2 tidak dijual; meja lantai 1 dinomori **R01–R12** mengikuti struk yang dipakai sekarang |
| §2.5 Shift | *"shift mulai dari 0"* | Modal awal laci selalu Rp 0; kolom isiannya dihapus |
| SMH-15 Struk | Foto struk dikirim | Bentuk struk disamakan dengan kertas yang dipakai pemilik |

### SMH-15 · Bentuk struk mengikuti kertas yang sudah dipakai

Judul venue (SMOKE HOUSE RESTO / SPL SPORTS POOL LOUNGE) → `Meja :` di kepala
→ `No.` + tanggal dan `Kasir` + jam berpasangan → tabel **Qty Menu · @Harga ·
Jumlah** → **Total · Discount · Total Bersih · Dibayar · Kembali** → kaki
*# TERIMA KASIH SUDAH BERKUNJUNG #*.

Alasannya bukan selera: kasir dan tamu sudah hafal letak angkanya. Struk
dengan angka yang sama tapi letak berbeda membuat setiap pemeriksaan jadi
lebih lambat, dan yang lambat akan dilewati.

Sewa meja ikut jadi baris barang (di kertas pemilik tidak ada baris khusus
untuknya, dan meja Smokehouse memang Rp 0). Compliment ditulis terpisah di
bawah dan TIDAK ikut hitungan — barisnya di tabel sudah bernilai nol.

### Detail Transaksi per shift

Foto kedua pemilik adalah laporan **DETAIL TRANSAKSI** yang dicetak tiap
malam. Bentuk itu sekarang ada di layar Rekap, di bawah omzet per shift: satu
baris per PEMBAYARAN (bukan per meja — tab yang dibayar dua orang muncul dua
baris, karena yang dicocokkan adalah uang yang masuk), kolom KAS · QRIS · EDC,
lalu TOTAL KESELURUHAN dan TOTAL TRANSAKSI. Bisa diunduh Excel dan dicetak.

**Satu perbedaan yang disengaja:** di kertas lama kolomnya KAS · QRIS ·
MANDIRI (+ BRI di baris total) — mesin EDC dipisah per bank. Di sini EDC masih
satu kolom, karena aplikasi baru mencatat "kartu/EDC" tanpa tahu banknya.
Kalau perlu dipisah per bank, yang harus diubah lebih dulu adalah layar
bayar: kasir memilih mesin mana yang dipakai.

### Lantai 1 saja

Meja lantai 2 **tidak dihapus dari kode**, hanya tidak dijual (`LANTAI_2` di
`src/data/venue.ts`). Kalau barisnya dihapus begitu saja, setiap pencarian
meja untuk jejak yang sempat menyentuhnya mengembalikan `undefined` dan
menjatuhkan layar. `venueDari` tetap mengenalinya supaya jejak lama tidak
salah masuk rekap SPL.

### Shift dari Rp 0

Kolom modal awal **dihapus**, bukan diisi 0 otomatis: selama kolomnya masih
ada, cepat atau lambat ada yang mengisinya "biar sama dengan kemarin", dan
sejak itu kas shift tidak pernah cocok lagi tanpa ada yang tahu sebabnya.
Modal shift LAMA tetap tersimpan apa adanya di jejak — pencocokan kas
hari-hari sebelumnya tidak boleh berubah surut.

---

## Koreksi besar pemilik — 12 Oktober 2026 (sore)

### 1. Booking di Smokehouse ternyata masih booking meja biliar

*"yang di-booking ketika masuk ke Smokehouse adalah meja makan restonya,
dengan pilihan makanannya, dan harusnya tidak ada jam-jamnya juga, karena ini
seperti pemesanan resto."*

Sebabnya: menu bawah dipakai bersama kedua venue, dan tombol **Booking** selalu
menuju booking biliar. Sekarang isi menu bawah **ikut venue**: di Smokehouse
jadi **Reservasi** (meja makan), dan Beranda-nya kembali ke halaman Smokehouse,
bukan terlempar ke halaman depan bersama.

Layar baru `/smokehouse/reservasi`:

- **Tidak ada pilihan durasi.** Tamu memilih jam DATANG saja. Mejanya ditahan
  2 jam dari jam itu — angka itu urusan dapur & kasir supaya satu meja tidak
  dijanjikan ke dua rombongan, bukan sesuatu yang perlu dipikirkan tamu.
- **Tidak ada bayar di muka.** Yang dijanjikan cuma mejanya.
- **Makanannya bisa dipilih sekalian**, tapi ini PRA-PESAN: stoknya tidak
  dikunci dan uangnya tidak ditagih, dapur menyiapkannya saat tamu datang.
  Kalau dibuat memotong stok sekarang, satu reservasi yang tidak jadi datang
  akan membuat barang hilang dari penjualan malam itu tanpa ada yang
  memakannya.

Mesinnya sendiri sudah punya jalur ini sejak lama (`reserveResto`,
`restoProblem`, kode check-in, pelepasan no-show 20 menit) — yang hilang hanya
layarnya, ikut terhapus saat pemisahan venue.

### 2. Halaman depan jadi landing page SPL yang utuh

*"landing page awal yang menyatukan keseluruhannya ini harusnya seperti landing
page portofolionya SPL... dan detail career dll-nya seperti landing page
umumnya, baru nanti diarahkan ke masing-masing aplikasi."*

Isinya sekarang: kepala dengan foto venue & status buka → dua venue beserta
rinciannya → **pricelist biliar** → kategori menu Smokehouse → galeri →
**Event · Career · Partnership** (masing-masing dengan penjelasan dan tombol
WhatsApp) → jam buka, WhatsApp, Instagram → kaki dengan tautan ke kedua
aplikasi.

Dua aturan yang membentuk isinya:

1. **Tidak ada angka karangan.** Tarif dibaca dari panel admin, jumlah meja
   dari daftar meja, kategori menu dari buku menu. Halaman ini tidak akan
   pernah menjanjikan harga yang berbeda dari yang ditagih kasir.
2. **Tidak ada keterangan yang belum diberikan pemilik.** Alamat jalan, surel,
   dan daftar lowongan yang spesifik sengaja TIDAK ditulis.

Animasi "muncul saat tergulir" sengaja **tidak** dipakai: pengamat gulirnya
tidak selalu menyala, dan saat tidak menyala seluruh isi halaman tinggal di
`opacity: 0` — yang terlihat cuma layar hitam. Ini bukan dugaan; itu persis
yang terjadi pada versi pertamanya dan ketahuan saat diperiksa di peramban.

### 3. Cacat yang ketemu karena alamat baru itu bertingkat

`/smokehouse/reservasi` adalah alamat bersih **dua tingkat** pertama di
aplikasi ini — dan halamannya **hitam total** di situs sungguhan.

Sebabnya: `index.html` menunjuk asetnya dengan alamat relatif
(`assets/index-….js`). Di alamat dua tingkat, peramban mencarinya di
`/smokehouse/assets/…` yang tidak ada; aturan pengalihan lalu mengantar
permintaan itu ke `index.html`, dan yang diterima peramban adalah HTML
bertipe `text/html` alih-alih JS/CSS. Tidak ada satu pun pesan galat yang
menjelaskan sebabnya — hanya layar hitam.

Diperbaiki dengan satu baris `<base href="/">` di kerangka HTML, jadi semua
alamat relatif dihitung dari akar berapa pun dalamnya alamat. Aman untuk
aplikasi Windows (skema `spl://`) karena penangannya membuang garis miring
depan sebelum menggabungkan ke folder aplikasi.

Pelajaran yang dicatat: **alamat bersih bertingkat harus dicoba di situs
sungguhan, bukan cuma di server pengembangan** — di `vite dev` semuanya jalan
karena servernya melayani aset dari akar apa pun alamatnya.

---

## Putaran koreksi kedua — 12 Oktober 2026 (malam)

### 1 · EDC dipisah per mesin

*"untuk EDC buat opsi pilihan dari metode payment yg ada."*

`PayChannel` TIDAK dipecah jadi `edc_mandiri`/`edc_bri` — kanalnya tetap
`edc`, dan nama mesinnya dicatat di sampingnya (`settledMesin`,
`Payment.mesin`). Alasannya: seluruh rumus uang, invariant, dan laporan lama
berdiri di atas tiga kanal itu. Menambah kanal berarti menulis ulang
semuanya; menambah penanda berarti laporan baru bisa memecahnya tanpa satu
pun aturan uang berubah.

**Daftar mesinnya data venue** (`State.mesinEdc`, bawaan Mandiri & BRI),
diubah di **Atur → Mesin EDC**. Mesin datang dan pergi mengikuti perjanjian
dengan banknya, dan tiap kali itu terjadi laporan lama harus tetap terbaca.

Tiap mesin jadi **tombolnya sendiri** di layar bayar, split bill, dan
takeaway — karena pemisahan ini hanya bisa benar kalau kasir memilih mesinnya
SAAT menggesek; sesudahnya tidak ada lagi yang tahu kartu tadi lewat mesin
yang mana.

Nama mesin yang tidak terdaftar **diabaikan**, bukan dicatat apa adanya:
satu perangkat yang mengirim nama karangan akan membuat kolom laporan baru
yang tidak pernah bisa dicocokkan dengan setoran bank mana pun. Transaksi
lama yang belum memilih mesin masuk kolom "Tanpa mesin" — bukan dibagi rata.

Dijaga **INV-55** (pecahan per mesin menjumlah tepat ke EDC, dan tidak ada
nama mesin asing di laporan) + mutasi "Mesin EDC karangan ikut masuk laporan".

### 2 · Foto makanan: dari buku menu venue sendiri

*"saya ingin juga ada tampilan foto makanannya untuk Smokehouse ini ketika
mau pesan, jadi memang betul-betul seperti pemesanan resto."*

Fotonya **sudah ada** — tertanam di `BUKU MENU SPL (6).pdf` milik pemilik: 15
halaman foto profesional. Semuanya ditarik keluar, dipotong pada bagian
fotonya, dan dikecilkan jadi webp (2,9 MB untuk 27 berkas).

Yang didapat:

- **Foto per kategori** di layar Menu — kartu berfoto dengan nama kategori di
  atasnya, bukan deretan teks.
- **Buku Menu** (`/smokehouse/buku-menu`): 15 halaman aslinya, bisa diperbesar
  satu per satu. Di sinilah keterangan hidangan dan pilihan saus/sambal
  terbaca — bagian yang justru hilang kalau fotonya dipotong per hidangan.

**Empat kategori sengaja TANPA foto** (nasi goreng, mie, jus, cold drink):
halaman menunya memang cuma daftar harga, tidak ada fotonya. Memakai foto
hidangan lain yang "mirip" lebih buruk daripada tidak ada foto — tamu
memesan sesuatu yang tidak seperti gambarnya.

**Harga tidak ikut dipotong** sebisa mungkin: harga yang berlaku dibaca dari
panel admin. Foto yang mencetak harga berbeda dari yang ditagih kasir adalah
kesalahan paling mahal di layar menu. Halaman buku menu yang memang memuat
harga diberi peringatan di atasnya.

### 3 · Smokehouse punya wajahnya sendiri

*"untuk Smokehouse masih terlihat sama persis seperti SPL Sport (biliar)
karena logonya juga bola biliar di pesanan."*

Benar — seluruh layar tamu memakai lambang biliar. Sekarang:

- **`SmokeMark`**: asap & gelas koktail, digambar ulang dari ikon yang memang
  sudah dipakai di sampul buku menu Smokehouse. Bukan lambang karangan.
- **Layar Pesanan**: pesanan makanan memakai ikon resto; bola biliar hanya
  untuk booking meja biliar.
- **Beranda Smokehouse**: lambang baru, kartu kategori berfoto, dan pintu ke
  Buku Menu.

### 4 · Landing page ditulis ulang

*"masih jauh dari harapan, bahasa dan tata letaknya masih terkesan AI, bukan
POV marketing atau pemasaran."*

Yang berubah:

- **Bahasanya berpihak ke pembaca**, bukan menjelaskan sistem. *"Main sampai
  pagi. Makan sampai kenyang."* · *"Mejanya siap. Tinggal pilih jamnya."* ·
  *"Iga asap yang bikin balik lagi."* · *"Punya rencana? Kami dengerin."*
- **Foto dulu, teks kemudian.** Hero foto venue satu layar penuh, bagian
  Smokehouse pakai foto hidangan aslinya.
- **Barisan angka** di bawah hero (40 meja · 4 ruang VIP · jam buka ·
  kategori menu) — kepercayaan dibangun dengan angka, bukan kalimat.
- **Satu ajakan per bagian**, bukan daftar pilihan.
- **Alamat sungguhan** dari buku menu: Jl. Batang Anai No. 2, Rimbo Kaluang,
  Padang Barat, Kota Padang — dengan tombol buka di peta.

Yang tetap dijaga: semua angka (tarif, jumlah meja, kategori) dibaca dari
data venue, jadi halaman ini tidak mungkin menjanjikan harga yang berbeda
dari yang ditagih kasir.

### Yang masih kurang, dan kenapa

**Foto per hidangan belum ada.** Foto di buku menu adalah foto KELOMPOK (satu
halaman memuat 6 varian ayam sekaligus), jadi tidak bisa dipotong jadi foto
per hidangan yang jujur. Kalau pemilik punya foto satuan tiap hidangan,
tinggal ditaruh di `src/assets/menu/` dan didaftarkan — layarnya sudah siap
menampilkannya.

---

## Audit alur pesan Smokehouse — 12 Oktober 2026 (malam)

*"focus ke Smokehouse ini untuk pemesanan online dan pemesanan langsung dari
kasir, tolong cek dan pastikan lagi... detail sampai ke pembayaran."*

### Temuan 1 (inti) · Pesanan QR ditolak karena mejanya "belum dibuka kasir"

Tamu duduk di meja makan, scan QR, memesan — **ditolak**: *"R03 belum dibuka
kasir, minta kasir membuka meja dulu"*.

Aturan itu warisan meja biliar, dan di sana memang benar: membuka meja biliar
**menjalankan meteran**, jadi hanya kasir yang boleh. Meja makan tidak
bersewa waktu — tidak ada satu rupiah pun yang bergerak karena mejanya
terbuka. Di resto, yang "membuka meja" justru tamu yang duduk lalu memesan.

Sekarang: **pesanan pertama membuka mejanya sendiri** (hanya meja resto).
Yang tetap dijaga: mejanya memang kosong pada jam itu, tidak sedang rusak,
dan tidak bentrok dengan reservasi yang sebentar lagi datang. Meja biliar
tidak berubah sedikit pun.

Satu bug yang tertangkap uji saat menulisnya: versi pertama membuka mejanya
**sebelum** semua pemeriksaan selesai, jadi pesanan yang DITOLAK (nominal
tidak cocok) tetap meninggalkan meja terbuka atas nama tamu yang pesanannya
tidak pernah jadi. Sekarang mejanya baru dibuka sesudah pemeriksaan terakhir
lolos.

### Temuan 2 · Layar tamu masih bicara bahasa biliar

- Pemilih meja di Checkout menampilkan **44 meja biliar + 12 meja makan
  tercampur**. Sekarang hanya meja venue yang sedang dibuka.
- *"Saya sedang main"* → *"Saya duduk di meja"* di Smokehouse.
- Spanduk QR *"minta kasir membuka meja dulu"* → *"meja ini akan dibuka
  otomatis oleh pesanan pertamamu"*.

### Temuan 3 · Layar Kasir mencampur dua venue

Papan meja sudah ikut venue sejak awal, tapi tab **Kasir** menampilkan semua:
meja jalan, booking, hold, no-show, dan pesanan dari kedua venue. Kasir
Smokehouse yang melihat tujuh meja biliar di daftar "sedang jalan" bukan cuma
terganggu — ia bisa menutup tab venue sebelah. Sekarang seluruh daftarnya
ikut venue yang sedang dibuka.

### Temuan 4 · Lampu meja di meja makan

*"meja Smokehouse ini masih ada lampu meja, itu kan untuk biliar."*

Benar. Lampu barang biliar — tiap meja biliar punya lampu di atasnya yang
dinyalakan kasir. Meja makan tidak punya.

Diperbaiki **di mesin, bukan disembunyikan layar**: `punyaLampu(tableId)`
jadi satu-satunya penentu, saklar lampu menolak meja makan, "nyalakan semua"
hanya menyentuh meja biliar, dan `rapikanLampu` membuang catatan lampu meja
makan di SATU tempat — karena ada belasan jalur yang menyentuh peta lampu
(buka meja, check-in, pindah meja, tutup tab, void, pulihkan no-show) dan
menambalnya satu per satu berarti cepat atau lambat ada yang terlewat.

Di papan Smokehouse, kotak hitungan "Lampu" diganti **"Di dapur"** — berapa
pesanan yang masih disiapkan. Itu angka yang benar-benar dilihat orang resto.

### Temuan 5 · Bahasa layar kasir

*"Mulai Open Bill"* → **"Duduk & Mulai Pesan"** untuk meja makan, dan
sesudahnya lembar mejanya langsung terbuka di mode pesan — karena itu yang
dilakukan kasir resto setelah mendudukkan tamu. Baris "Jenis" menulis
"Meja makan (bayar di kasir)", dan "Sudah berjalan" (meteran) jadi
"Sudah duduk".

### Layar pesan kasir jadi POS resto

Petak 3 kolom (bukan daftar satu kolom), spanduk foto kategori yang ikut
berganti, lencana jumlah di tiap petak, catatan per baris, dan ringkasan yang
menyebut **tiga angka**: item baru, yang sudah ada di bill meja, dan
perkiraan bill jadi — karena pertanyaan tamu yang paling sering adalah
"sekarang berapa?".

Foto per hidangan belum ada (buku menu isinya foto kelompok), jadi petaknya
masih teks. Jalurnya sudah disiapkan: `FOTO_ITEM` di `src/data/fotoMenu.ts`
— begitu fotonya datang, petaknya langsung berfoto tanpa perubahan lain.

### Pagar

Berkas uji baru **`test/smokehouse.test.ts` (44 pemeriksaan)** menjalani
keempat alurnya sampai uangnya masuk:

- **A** tamu scan QR di meja kosong → meja terbuka sendiri → pesan lagi →
  tab yang sama → kasir menutup tunai.
- **A2** bayar QRIS di muka → prabayar menempel di tab, sisa tagihan nol,
  nominal tidak cocok ditolak dengan dana tercatat **dan mejanya tidak ikut
  terbuka**.
- **B** kasir mencatat langsung → tiket dapur & bar → koreksi jumlah →
  bayar sebagian tunai → sisanya EDC BRI → tercatat per mesin.
- **C** takeaway: dapur menyiapkan, baru jadi omzet setelah dibayar.
- **D** pagar yang tetap berlaku: meja biliar tetap harus dibuka kasir, di
  luar jam dapur ditolak, meja resto yang sudah dipesan tidak bisa diambil.

Simulasi 100 putaran sekarang juga membuat **reservasi meja resto** (151
diterima / 409 ditolak) dan mengirim pesanan tamu ke meja yang sudah dipesan
— tanpa itu, pagar bentrok reservasi hijau tanpa pernah dijalankan (terbukti:
mutasinya LOLOS sebelum skenario ini ada).

```
36 · 41 · 100/100 simulasi, 56/56 invariant · 23 · 40 · 19 · 18 · 135 · 17 · 12 · 32 · 44
105 pola mutasi cocok
```

---

## Dua anak perusahaan — akun staf terikat venue · 12 Oktober 2026

*"Harusnya login untuk super admin dan cashier dan karyawan per masing-masing
juga beda, karena ini diibaratkan 2 anak perusahaan yang berbeda."*

### Bentuknya

Akun staf sekarang punya **penanda venue**. Kosong = mengurus keduanya
(pemilik & manajer grup). Diisi = orang itu hanya mengurus venue-nya.

| Akun | PIN | Peran | Venue |
|---|---|---|---|
| Pak Budi (Pemilik) | 9999 | Superadmin | kedua venue |
| Sinta (Manajer) | 8888 | Superadmin | kedua venue |
| Rian | 1234 | Kru Kasir | SPL Sport |
| Yoga | 2345 | Kru Kasir | SPL Sport |
| Dewi | 3456 | Kru Kasir | Smokehouse |

Pemilik mengubahnya di **Atur → Akun staf**: daftarnya kini dikelompokkan
tiga — *Mengurus kedua venue*, *SPL Sport*, *Smokehouse* — dan tiap baris
punya pemilih venue di sebelah pemilih peran.

### Ditegakkan di mesin, bukan di layar

Masuk sebagai Dewi, dan perangkatnya **terkunci ke Smokehouse**: tombol
pemilih venue berganti jadi tulisan tetap, papan hanya berisi R01–R12, layar
Kasir hanya berisi venue-nya.

Tapi menyembunyikan tombol bukan pengamanan. Jejak kejadian dikirim dari
perangkat mana pun, dan satu permintaan yang dirangkai tangan tidak pernah
melewati layar. Jadi yang menolak adalah **mesinnya**, di satu tempat
(`lintasVenue` di `reducer`) — pintu yang sama dilewati aksi dari perangkat
ini maupun kejadian yang diputar ulang dari perangkat lain. Pola yang sama
dipakai `rapikanGrup` dan `rapikanLampu`: ada belasan jalur yang menyentuh
hal yang sama, dan menambalnya satu per satu berarti cepat atau lambat ada
yang terlewat.

Yang ditolak: buka meja, tutup tab, order, koreksi, pindah meja, gabung,
split bill, lampu, void, tiket, dan tutup pesanan di venue sebelah. Ditambah
**akun staf**: kepala Smokehouse tidak bisa membuat akun SPL, dan tidak bisa
membuat akun tanpa venue — itu akun yang menguasai keduanya.

### Tiga keputusan yang tidak kelihatan tapi menentukan

**1 · Aksi TAMU tidak ikut terjaring.** `guestOrder`, `hold`,
`confirmOnline`, `reserveResto`, `releaseHold` dilakukan tamu dari HP-nya
sendiri. Di aplikasi tamu pelakunya kosong, jadi pagarnya tidak pernah
menyala — tapi kejadian yang sama diputar ulang di perangkat kasir, dengan
pelakunya dipasang dari kejadian itu. Kalau ikut dijaring, pesanan tamu SPL
akan ditolak hanya karena yang memutar ulang kebetulan kasir Smokehouse:
pesanan yang diterima di satu perangkat **hilang** di perangkat lain.
Simulasi membuktikannya — INV-22, INV-29, dan INV-30 langsung merah.

**2 · Shift DIPAKSA, bukan ditolak.** Kasir Smokehouse yang membuka shift di
perangkat yang kebetulan menampilkan SPL tetap membuka kas Smokehouse.
Versi pertama menolaknya — dan shiftnya gagal dibuka diam-diam. Tanpa shift
terbuka hampir semua aksi uang berhenti: venue berhenti bukan karena salah,
tapi karena benar.

**3 · Kunci induk.** Harus selalu tersisa satu superadmin aktif yang **tidak
terikat venue**. Tanpa pagar ini pemilik bisa mengikat satu-satunya
superadminnya ke Smokehouse — lalu tidak ada seorang pun yang bisa mengurus
SPL lagi, dan tidak ada jalan kembali karena mengubah akun itu sendiri sudah
terhitung aksi lintas venue.

### Tiga cacat lama yang ikut ketahuan

**Lima dari tujuh peran gagal disimpan, diam-diam.** Sejak peran dipecah
tujuh (8 Okt), layar Atur menawarkan ketujuhnya dan bawaan formulirnya
`kru_kasir` — tapi mesinnya masih hanya menerima `superadmin` dan
`karyawan`. Membuat akun Kru Kasir, Finance, atau Kru Gudang: tombol
ditekan, tidak ada yang tersimpan, tidak ada pesan apa pun. Penyebab
keduanya sama: layar Atur mengenali penolakan dari **jumlah akun**, jadi
penolakan saat menyunting akun yang sudah ada tidak pernah terlihat.
Sekarang penolakan dikenali dari daftarnya yang tidak bergerak sama sekali.

**Rekap Mingguan/Bulanan mengabaikan pilihan venue.** Pilih "Smokehouse",
lalu pilih "Minggu ini" — angka yang keluar angka **dua venue**, tanpa satu
pun tanda bahwa lingkupnya diabaikan. `recapRange` memang tidak pernah
menerima venue. Hanya "Hari" yang benar selama ini.

**Panel merah "Perlu tindakan" bocor antar-venue.** Baru kelihatan saat
mencoba login kasir Smokehouse: papannya benar berisi meja makan, tapi
panel paling mencolok di atasnya menulis *"MEJA 7 · Fajar masih main"* —
tabrakan meja biliar, lengkap dengan tombol yang semuanya akan ditolak
mesin. Peringatan paling merah yang tidak bisa ditindaklanjuti orangnya
adalah peringatan yang akan diabaikan — dan sesudahnya, peringatan yang
memang untuknya ikut diabaikan.

Ikut dirapikan: kalimat *"Lampu meja mati sendiri"* di layar bayar meja
makan (meja makan tidak punya lampu), dan tiket pesanan tamu Smokehouse yang
masih berkop bola biliar.

### Percobaan nyata, dua arah (diminta pemilik)

Dijalankan di aplikasi yang hidup, bukan hanya di uji:

**Dari kasir (offline).** Masuk PIN Dewi → layar langsung terkunci
Smokehouse → ketuk R03 → *"Duduk & Mulai Pesan"* → lembar pesan terbuka
sebagai POS resto (petak 3 kolom, foto kategori, lencana jumlah, catatan per
baris) → 2 Tempe Mendoan + 1 Chicken Nugget + 2 Ice Tea = **Rp 84.000** →
*"Kirim ke Dapur & Tambah ke Bill"* → tiket keluar ke dapur & bar, stok
Chicken Nugget turun 14 → 13 → bill meja → *Tutup Tab & Bayar* → **Tunai** →
struk `SMOKE HOUSE RESTO · Meja R03 · Kasir Dewi · Total Bersih 84.000`.

**Dari tamu (online).** Buka `/menu?meja=S105` (QR di meja) → spanduk
*"Pesan untuk R05 · meja ini akan dibuka otomatis oleh pesanan pertamamu"* →
2 Nasi Goreng Kampung → Ringkasan hanya menawarkan meja R01–R12 dan
*"Saya duduk di meja"* → *"Di kasir saat selesai"* → **Rp 66.000 ditagih
nanti** → *Kirim ke Dapur* → kode `SPL-CBYRDA`, tiket dapur "Baru" → di
papan kasir **R05 membuka dirinya sendiri** dengan Rp 66.000 → kasir menutup
dengan **Kartu / EDC · BRI** → struk mencatat mesinnya.

### Pagar barunya

- **INV-58** (simulasi, 2.663 aksi staf terikat venue per putaran): staf yang
  terikat satu venue tidak pernah mengubah apa pun di venue sebelah.
  Diperiksa dari **akibatnya** — bukan dari pemetaan aksi→venue milik mesin,
  karena oracle yang meminjam kode mesin akan ikut termutasi bersamanya.
- **`test/venue.test.ts` (45 pemeriksaan)**: arah sebaliknya, yang tidak
  pernah terlihat di simulasi — **yang boleh wajib tetap boleh**. Kasir yang
  diam-diam kehilangan hak menutup bill-nya sendiri hanya akan terlihat
  seperti "ditolak", dan ditolak terjadi ribuan kali tanpa tanda bahaya.
- Tiga mutasi baru, ketiganya tertangkap: pagar dimatikan, pagar hanya
  memeriksa venue pertama, penanda venue akun diabaikan.
- Satu mutasi **dihapus** sebagai mutan ekuivalen (pindah meja lintas venue):
  `relocate` menuntut meja sekelas, dan meja biliar tidak pernah bisa
  dijadikan meja resto — jalurnya mustahil ditempuh. Pagarnya tetap dipasang
  sebagai sabuk kedua, dan ujinya menjaga pintu yang menutupnya.

Tiga penyaring staf di berkas uji ikut diperbaiki: semuanya menyaring
`role === "karyawan"`, dan begitu akun bawaan pindah ke `kru_kasir` saringan
itu tidak pernah cocok lagi — dua berkas jatuh di baris paling atas, dan
**INV-12 hijau tanpa pernah benar-benar dijalankan**.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 135 · 17 · 12 · 32 · 44 · 45
test:types nol galat · test:utc lolos · 108 pola mutasi cocok
```

---

## Reservasi = meja **dan** makanannya · beranda Smokehouse · 12 Oktober 2026 (malam)

*"Untuk reservasi ini harus dengan makanannya sekalian saja, jadi tidak hanya
meja yang direservasi. Untuk beranda yang Smokehouse bisa dibuat lebih menarik
lagi dan memang seperti aplikasi pemesanan yang ada di resto-resto, dan
pastikan tidak terkesan AI design, dan tampilannya juga keseluruhan pastikan
sesuai guidance SPL yang ada."*

### 1 · Makanannya sekarang data, bukan kalimat

Versi sebelumnya sudah punya "pra-pesan", tapi isinya ditempel sebagai **teks
di dalam catatan**: `Pra-pesan: 2x Nasi Goreng, 3x Ice Tea`. Kalimat itu tidak
bisa ditagih, tidak bisa dikoreksi, tidak bisa di-void, tidak masuk laporan
produk, dan **tidak pernah sampai ke dapur**. Yang terjadi di lapangan: tamu
merasa sudah memesan, kasir membaca sebaris catatan, dapur tidak tahu apa-apa.

Sekarang makanannya dikirim sebagai **baris bill sungguhan** (`res.lines` →
`fnb` bertanda `pra`). Akibatnya langsung terasa di seluruh sistem: muncul di
layar kasir, ikut tagihan, bisa dikoreksi dan di-void, masuk laporan produk
dan rekap venue, dan tiketnya keluar ke dapur & bar.

**Minimal satu hidangan wajib dipilih** — itu permintaan pemilik. Kalau suatu
saat ingin dilonggarkan, satu baris yang diubah: `MINIMAL_PESAN` di
`src/screens/ReservasiResto.tsx`.

### 2 · Kapan barangnya keluar dari rak — ini bagian yang menentukan

Reservasi bisa untuk **dua minggu lagi**. Kalau stoknya dipotong saat
reservasi dibuat, barang itu hilang dari penjualan **malam ini** tanpa ada
yang memakannya, dan laporan stok harian 05.00–05.00 ikut bohong.

Jadi: reservasi **tidak** memotong stok dan **tidak** menagih apa pun. Stok
baru diambil saat **check-in** — saat tamunya benar-benar datang dan dapur
mulai memasak. Harga tetap dikunci sejak dipesan, jadi perubahan harga
sesudahnya tidak menagih ulang tamu.

Yang ikut dijaga di satu tempat, bukan di tiap pemanggil:

- `returnStock` **menyaring sendiri** baris pra-pesan. Baris yang belum pernah
  memotong stok tidak bisa mengembalikan apa pun. Ada lima pemanggil (no-show,
  void sesi, void baris, void pesanan, koreksi) — satu yang lupa berarti stok
  tercipta dari udara, dan itu baru ketahuan saat opname.
- `fulfil` **mencopot penanda** pra-pesan begitu stoknya diambil, jadi tidak
  ada jalan yang bisa memotong stok dua kali.
- Barang yang **habis** antara reservasi dan kedatangan dibuang dari bill saat
  check-in, dan kasir diberi tahu barangnya apa lewat catatan jejak. Tidak ada
  dana yang perlu dikembalikan — tidak ada yang pernah dibayar.

### Satu cacat nyata yang ditangkap simulasi

Reservasi resto yang **tidak datang** sempat dihanguskan sebagai omzet.
Untuk booking biliar itu benar: tamunya sudah membayar di muka, uangnya ada di
kas, slotnya terpakai percuma. Untuk reservasi resto tidak ada satu rupiah pun
yang pernah masuk. INV-08 langsung merah dan menyebut angkanya:
*"nilai 362000 ≠ diterima 220000 + prabayar 50000"*. Sekarang yang hangus
hanya baris yang memang sudah dibayar.

### 3 · Beranda Smokehouse

Yang diubah, berurutan dari yang paling menentukan:

1. **Deretan tombol di tengah dibuang.** Lima tombol bertumpuk dengan logo di
   atasnya adalah bentuk "menu utama aplikasi", bukan bentuk aplikasi resto.
   Aplikasi resto membuka dengan **hidangan**.
2. **Satu ajakan, bukan lima.** "Reservasi & Pilih Menu" jadi satu kartu
   besar; sisanya turun jadi baris kecil. Lima tombol sederajat berarti tidak
   ada yang penting.
3. **Angka yang tampil adalah angka sungguhan.** "Paling sering dipesan"
   dihitung dari penjualan venue 30 hari terakhir (`penjualanProduk`), lengkap
   dengan jumlah porsinya. Kalau belum ada datanya, judulnya **berganti** jadi
   "Andalan dapur" — bukan daftar pilihan sendiri yang menyamar jadi
   statistik. Pemilik akan membandingkannya dengan laporan penjualannya
   sendiri, dan dua angka yang tidak cocok lebih mahal daripada tidak ada
   angka.
4. **Kategori berfoto digeser, bukan ditumpuk**, dan mengetuknya membuka
   `/menu?kategori=…` — langsung ke kategorinya, bukan ke pucuk daftar. Tanpa
   itu, mengetuk foto "Beef Ribs" membawa tamu ke Light Bites dan ia harus
   mencari sendiri kategori yang baru saja dipilihnya.

### 4 · Mengikuti panduan yang sudah ada

Dari `docs/lampiran/L7-design-system.md`:

- **`DS-01`** — sub-merek hanya boleh mengubah **tiga** hal: lockup header,
  satu token aksen seksi, dan tekstur hero. Dipakai apa adanya: band
  Smokehouse memakai **tekstur bata + maroon #992212**, chip kategori menu
  maroon, nomor langkah maroon.
- **`DS-02`** — **tombol aksi tetap amber #F0A202 dengan teks near-black di
  seluruh aplikasi.** Maroon adalah warna *wilayah*, bukan warna aksi: kalau
  tombol "Pesan" berwarna lain di halaman resto, pelanggan harus belajar dua
  kali untuk satu kebiasaan.
- **§7.4.1** — Jazzbury **maksimal satu kali per layar**: dipakai di tagline
  hero saja. Emoland untuk angka & label uppercase, bukan untuk kalimat. Lido
  (`font-serif`) hanya di judul ≥18 px.
- **`DS-00d`** — dirancang pada lebar 360–375 px lebih dulu; diuji di 375×812.

### Dua kebocoran lagi yang ketahuan saat mencoba sendiri

- **Daftar "Meja kosong" di layar kasir Smokehouse** masih memuat 44 meja
  biliar — kasir resto membaca deretan "1 2 3 … 27" sebagai meja makannya.
- **Satu meja, dua nama.** Layar kasir menulis **R1** sementara papan, struk,
  dan pelat mejanya menulis **R01**. Penyebabnya: aturan penamaan yang sama
  disalin tangan di **tiga** tempat. Sekarang ketiganya lewat `tableLabel`.

Ikut dirapikan: jam yang **sudah lewat** tidak lagi ditulis "penuh" — dua hal
yang sangat berbeda bagi tamu (yang satu berarti coba jam lain, yang satu lagi
berarti coba besok).

### Pagar barunya

`test/smokehouse.test.ts` tumbuh jadi **72 pemeriksaan**, dengan tiga alur baru:

- **E** reservasi + makanannya → tersimpan sebagai baris bill, **stok belum
  tersentuh**, dapur belum menerima apa pun, belum jadi omzet → check-in →
  **baru sekarang** stok berkurang, tiket keluar ke dapur & bar, tagihan
  berisi makanannya → dibayar tunai → masuk rekap Smokehouse, tidak masuk
  rekap SPL.
- **E2** reservasi yang tidak datang: tidak ada yang dihanguskan, stok utuh,
  rekap tetap berimbang.
- **E3** barang yang habis sebelum tamu datang: dibuang dari bill, bukan
  dijual; tidak ada dana yang perlu dikembalikan; kasir diberi tahu.

Simulasi 100 putaran sekarang juga mengirim pra-pesan di tiap reservasi resto
(termasuk barang karangan dan jumlah nol, supaya jalur penolakannya ikut
dijalankan). Empat mutasi baru, **semuanya tertangkap**: stok dipotong sejak
dipesan, pra-pesan tidak sampai ke dapur, pra-pesan dikembalikan ke stok
padahal belum pernah diambil, dan no-show resto dihanguskan sebagai omzet.
Tiga pola lama ikut disegarkan karena kodenya berubah.

### Percobaan nyata di aplikasi hidup

Reservasi R01 untuk pukul 21.00, 4 orang, 2× Tempe Mendoan + 1× Chicken Nugget
= **Rp 64.000** → layar hasil menampilkan kode check-in **254860** dan rincian
"Pesanan Anda · disiapkan saat datang" → di layar kasir muncul sebagai
**"R01 · RESTO · 4 ORG · kode 254860 · pra-order 3 porsi · 78m lagi"**.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 135 · 17 · 12 · 32 · 72 · 45
test:types nol galat · 112 pola mutasi cocok
```

---

## Foto produk asli masuk aplikasi · 13 Oktober 2026

Pemilik mengirim tautan folder Drive **"FOTO PRODUK"** — 51 foto studio
hidangan venue sendiri, tersusun dalam 14 subfolder per kategori.

### Yang dipakai

Sebelas kategori menu berganti dari **potongan halaman buku menu** ke **foto
produk asli**:

| Kategori di aplikasi | Dari folder |
|---|---|
| Smokehouse Ayam | MAINCOURSE AYAM (foto atas-meja) |
| Smokehouse Bebek | OLAHAN BEBEK |
| Smokehouse Buntut Sapi | BUNTUT |
| Beef Ribs | IGA |
| Family Package | IGA (piring besar) |
| Coffee Based | COFFEE BASED |
| Ice Blend | MILK BASED |
| Mocktail | MOCKTAIL |
| Fresh Juice | FRESH JUICE |
| Cold Drink | REFRESH DRINKS |
| Tradisional Drink | TRADITIONAL DRINK |

Ditambah satu **foto sambutan** di beranda Smokehouse (MENU DAILY PACKS —
satu meja penuh hidangan), dipasang melapisi tekstur bata. Batanya tetap di
belakang: kalau fotonya gagal dimuat, bandnya tetap maroon bertekstur, bukan
kotak kosong.

Semua dipotong 4:3, 800 px, webp — 9–81 KB per berkas. Hanya foto sambutan
yang tidak lazy-load, dan ukurannya dijaga 94 KB (anggaran muat-pertama
180 KB, L7 §7.5.2 `AST-01`).

### Tulisan cetak dibuang dari tiga foto lama

`light-bites`, `sayur`, dan `daging` adalah potongan halaman buku menu, dan
di dalam gambarnya ada tulisan cetak: *"LIGHT Bites"*, *"HOUSE OTHER
SUGGESTION"*, *"Pilihan Olahan Daging"*. Di sebelah foto studio yang bersih,
tulisan itu terbaca sebagai poster, bukan hidangan — dan teks harga yang
tercetak di dalam foto adalah janji yang tidak pernah dibaca aplikasi.

Dua dipotong sampai tinggal makanannya. Yang ketiga (`daging`) dibuang: yang
tersisa setelah tulisannya dipotong adalah tempat lilin, bukan hidangan.
Kategorinya sekarang tampil sebagai chip maroon yang rapi.

### Foto per hidangan: sengaja masih kosong

Folder foto tersusun **per kategori**, dan nama berkasnya nama kamera
(`DSC09570.jpg`). Di dalam satu folder, delapan varian ayam hanya berbeda
sambalnya — tidak ada cara jujur menentukan foto mana milik "Ayam Asap
Sambal Pecel" dan mana milik "Ayam Asap Cabe Ijo". Menebaknya berarti tamu
memesan sesuatu yang tidak seperti gambarnya.

Jalurnya sudah siap (`FOTO_ITEM` di `src/data/fotoMenu.ts`): begitu tiap foto
diberi nama hidangannya, layar menu tamu, layar reservasi, dan layar pesan
kasir langsung memakainya tanpa perubahan lain.

### Empat folder yang TIDAK punya rumah di menu

**SATE** (5 foto), **STEAK** (5 foto), **DESSERT** (4 foto), dan **MENU
BERKUAH** (1 foto) tidak punya kategori maupun hidangan yang cocok di menu
aplikasi — dan menu aplikasi disusun dari buku menu pemilik sendiri. Begitu
juga **PAKET 55 / 115 / 125**, yang terlihat seperti paket hemat tapi tidak
ada di daftar; yang ada hanya Family Package (Iga Bakar Jumbo).

Ini bukan soal foto. Kalau keempatnya memang dijual, **menunya yang kurang**,
dan tamu tidak bisa memesannya lewat aplikasi sama sekali. Menunggu jawaban
pemilik sebelum menambahkan apa pun — menebak daftar jual adalah menebak
harga.

Tiga kategori juga masih tanpa foto produk: Light Bites, Vegetables (keduanya
sekarang memakai potongan buku menu yang sudah dibersihkan), Smokehouse
Daging, Fried Rice, dan Fried Noodles.

### Kerapuhan waktu yang ikut ketahuan

Berkas uji dibangun dari **tanggal kalender** (`tanggalWib`), sementara mesin
mengelompokkan dengan **hari operasional** (ganti pukul 05.00, karena venue
tutup 02.00). Antara 00.00 dan 05.00 keduanya berbeda hari: harness membangun
dunianya di hari berikutnya lalu bertanya ke mesin tentang hari ini, dan
tidak menemukan apa pun.

Terbukti malam ini — seluruh rekap jatuh pada pukul 00.42, di jam yang justru
masih jam kerja venue. Tujuh berkas uji sekarang memakai `businessDateOf`.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 135 · 17 · 12 · 32 · 72 · 45
test:types nol galat · test:utc lolos · 112 pola mutasi cocok
```

---

## Korsel coverflow 3D — halaman depan & beranda Smokehouse · 13 Oktober 2026

Pemilik mengirim contoh komponen shadcn *"3-d-coverflow-carousel"* dan minta
bentuk itu dipakai di halaman makanan Smokehouse dan di beranda.

### Yang diambil, dan yang tidak

Diambil **interaksinya**: kartu berputar seperti sampul album, tetangganya
miring di kiri-kanan, geser jari, panah, titik halaman, putar otomatis.

**Warnanya tidak diambil.** Contohnya menulis warna langsung di dalam
komponen — latar `#0c0a09`, aksen emas `#c5a880`, tombol gradasi emas. Di
aplikasi ini itu tiga pelanggaran sekaligus terhadap `L7-design-system.md`:

| Aturan | Isi | Yang dilakukan |
|---|---|---|
| `DS-00b` | Tidak ada nilai hex di dalam komponen | Semua warna lewat token (`ink`, `cream`, `brick`, `amber`) |
| `DS-01` | Aksen wilayah Smokehouse = maroon, bukan emas | Eyebrow, garis bawah judul, dan nomor langkah memakai `brick-lit` |
| `DS-02` | Tombol aksi SELALU amber + teks near-black | CTA kartu amber, bukan gradasi emas |

Komponen contohnya juga ditulis untuk struktur shadcn (`/components/ui/`).
Proyek ini bukan shadcn: komponennya ada di `src/components/`, dan
menambahkan folder `ui/` hanya untuk satu berkas berarti dua konvensi hidup
berdampingan tanpa satu pun yang menang. Berkasnya: `src/components/Coverflow.tsx`.

### Tiga hal yang sengaja dibuat berbeda

**1 · Ukuran kartu ikut lebar wadahnya.** Contohnya memakai kartu 330×500 px
dengan tetangga digeser tetap 285 px dan 510 px. Di layar 360 px — lebar
rancangan yang diwajibkan `DS-00d` — kartunya terpotong dan tetangganya
keluar layar. Di sini ukurannya dihitung dari lebar wadah yang diukur
`ResizeObserver`, jadi kartu yang sama bekerja di HP 360 px maupun di kolom
setengah layar halaman depan versi desktop.

**2 · Panah tidak menyandera keyboard.** Contohnya memasang pendengar
`keydown` di `window`: panah kiri/kanan **di seluruh aplikasi** akan
menggeser korsel ini, termasuk saat kasir sedang mengetik di layar lain. Di
sini pendengarnya menempel di korselnya sendiri.

**3 · Latar buram memakai gambar yang sama lewat CSS.** Contohnya menaruh
`<img>` kedua berukuran penuh untuk efek buram di belakang — di jaringan
venue itu berarti foto besar diunduh dua kali.

Ditambah: putar otomatis berhenti saat disentuh, di-hover, atau difokus
keyboard, dan **tidak berjalan sama sekali** kalau perangkatnya minta gerak
dikurangi (`prefers-reduced-motion`).

### Isinya data sungguhan

Kartunya bukan contoh: tiap kartu satu kategori menu yang punya foto produk,
dengan **jumlah pilihan** dan **harga mulai** dibaca dari harga yang berlaku
di panel admin (`priceOf`) — bukan angka yang ditulis tangan di halaman
jualan. Mengetuknya membuka `/menu?kategori=…`, langsung di kategorinya.

Disusun di satu tempat (`src/lib/kartuMenu.ts`) dan dipakai dua layar. Kalau
tiap layar menyusun kartunya sendiri, yang pertama ketahuan adalah tamu yang
melihat "mulai Rp 18.000" di satu halaman dan angka lain di halaman
sebelahnya.

Kategori **tanpa** foto sengaja tidak ikut jadi kartu: kartu coverflow adalah
kartu foto, dan kartu berlatar kosong di antara foto hidangan terbaca seperti
gambar yang gagal dimuat. Kategori itu tetap tampil sebagai chip maroon di
bawah korselnya.

### Dipasang di dua tempat

- **Beranda Smokehouse** — menggantikan rel geser datar. Di rel, foto yang
  sedang dilihat tidak lebih penting dari tetangganya, jadi tidak ada yang
  "dipilihkan" untuk tamu.
- **Halaman depan**, bagian Smokehouse — menggantikan petak foto 2×2 yang
  diam.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 135 · 17 · 12 · 32 · 72 · 45
test:types nol galat (termasuk --noUnusedLocals untuk berkas yang disentuh)
```
