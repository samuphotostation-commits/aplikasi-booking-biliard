# Riset Integrasi Pembayaran QRIS Indonesia untuk Web App Booking Biliar + Resto (SPL Sports Pool Lounge / Smokehouse Resto) — Perbandingan Midtrans vs DOKU vs Xendit vs Tripay vs Mayar vs iPaymu, dengan rekomendasi MVP

## 1. Regulasi MDR QRIS — Dasar Biaya yang Tidak Bisa Ditawar Gateway

MDR (Merchant Discount Rate) QRIS **bukan variabel kompetitif antar payment gateway**. Bank Indonesia yang menetapkan plafonnya; gateway hanya menagihkan sesuai kategori merchant. Ini fakta paling penting untuk keputusan biaya: memilih gateway berdasarkan "siapa MDR QRIS-nya paling murah" adalah salah arah — semuanya 0,7% untuk merchant reguler.

### 1.1 Skema berlaku saat ini (efektif 15 Maret 2025)

| Kategori Merchant | Nilai Transaksi | MDR |
|---|---|---|
| Usaha Mikro (UMi) | ≤ Rp 500.000 | **0%** |
| Usaha Mikro (UMi) | > Rp 500.000 | **0,3%** |
| Usaha Kecil (UKE), Menengah (UME), Besar (UBE) | semua nilai | **0,7%** |
| Pendidikan | semua nilai | 0,6% |
| SPBU | semua nilai | 0,4% |
| BLU, PSO, G2P (bansos), P2G (pajak/paspor), donasi/nonprofit | semua nilai | 0% |

Sumber: [Bank Indonesia — MDR QRIS Bagi Merchant](https://www.bi.go.id/id/publikasi/ruang-media/cerita-bi/Pages/mdr-qris.aspx)

### 1.2 Skema BARU — efektif 1 Oktober 2026 (perluasan MDR 0%)

Diumumkan Bank Indonesia (Plt. Gubernur Destry Damayanti) pada 17–19 Agustus 2026:

| Kategori Merchant | Batas Bebas MDR | MDR di Atas Batas |
|---|---|---|
| Usaha Mikro (UMi) | ≤ Rp 500.000 → **0%** | 0,3% |
| Usaha Kecil / Menengah / Besar | ≤ Rp 100.000 → **0%** | 0,7% |
| Pendidikan | ≤ Rp 100.000 → **0%** | 0,6% |
| SPBU | ≤ Rp 100.000 → **0%** | 0,4% |

Sumber: [Kompas](https://www.kompas.com/tren/read/2026/08/19/110000365/mulai-1-oktober-2026-transaksi-qris-hingga-rp-500.000-bebas-mdr-ini), [Infobank](https://infobanknews.com/bi-bebaskan-tarif-mdr-qris-transaksi-rp100-ribu-mulai-1-oktober-2026)

**[PERLU KONFIRMASI]** Per tanggal riset ini (23 Agustus 2026), kebijakan tersebut masih berupa **pengumuman kebijakan**, belum ditemukan nomor PBI/PADG formalnya. Halaman harga publik Midtrans, DOKU, dan Xendit **masih menulis 0,7% flat** dan belum mencerminkan tier 0%. Sebelum go-live, tanyakan tertulis ke gateway terpilih: *"Apakah tier MDR 0% untuk transaksi ≤Rp100.000 sudah diimplementasikan di sistem billing Anda per 1 Oktober 2026, dan bagaimana kategori merchant saya diklasifikasikan?"*

### 1.3 Kategori merchant SPL ditentukan oleh omzet — ini uang nyata

Kriteria UMKM mengacu PP No. 7 Tahun 2021:

| Kategori | Modal Usaha (di luar tanah & bangunan) | Hasil Penjualan Tahunan |
|---|---|---|
| Usaha Mikro | ≤ Rp 1 miliar | ≤ Rp 2 miliar |
| Usaha Kecil | > Rp 1 M – 5 M | > Rp 2 M – 15 M |
| Usaha Menengah | > Rp 5 M – 10 M | > Rp 15 M – 50 M |

**Implikasi finansial langsung untuk SPL.** Kalau omzet tahunan venue ≤ Rp 2 miliar (≈ Rp 167 juta/bulan), SPL berhak diklasifikasikan **Usaha Mikro (UMi)** → MDR **0% untuk semua transaksi ≤ Rp 500.000**. Praktis **hampir seluruh transaksi booking + F&B akan gratis MDR**. Ini bukan detail kecil — ini selisih jutaan rupiah per tahun.

**[PERLU KONFIRMASI]** Berapa omzet tahunan SPL saat ini? Jawaban ini menentukan apakah biaya QRIS Anda 0% atau 0,7%. Jika UMi, **wajib** minta gateway mengklasifikasikan merchant sebagai UMi saat onboarding — gateway cenderung men-default merchant online ke UKE/UME (0,7%) kalau tidak diprotes.

### 1.4 MDR TIDAK BOLEH dibebankan ke customer

Bank Indonesia menyatakan eksplisit: *"biaya MDR ini ditanggung oleh merchant dan tidak boleh dibebankan kepada konsumen."*

| ID | Aturan | Konsekuensi Desain |
|---|---|---|
| PAY-01 | Dilarang menambahkan baris "Biaya QRIS 0,7%" / "Biaya admin QRIS Rp X" di checkout | Harga yang tampil di menu = harga yang dibayar. MDR diserap ke margin. |
| PAY-02 | Jika ingin menutup biaya, naikkan harga dasar secara merata | Contoh: sesi Rp 50.000 → Rp 50.000 tetap; margin sudah memperhitungkan 0,7% |
| PAY-03 | "Biaya layanan" flat yang berlaku sama untuk SEMUA metode bayar (termasuk tunai di kasir) adalah wilayah abu-abu | **[PERLU KONFIRMASI]** ke gateway/legal. Jangan dilabeli sebagai biaya QRIS. |

### 1.5 Simulasi biaya nyata untuk SPL

**ASUMSI** (perlu dikoreksi pemilik): tarif sesi biliar Rp 50.000/jam, rata-rata booking 2 jam = Rp 100.000; rata-rata order F&B Rp 85.000; 35 transaksi online/hari; 30 hari/bulan.

| Skenario | Nilai Transaksi | Volume/bulan | MDR sebagai UKE (0,7%) | MDR sebagai UMi (0%) |
|---|---|---|---|---|
| Booking sesi 2 jam | Rp 100.000 | 600 trx = Rp 60.000.000 | Rp 420.000 | **Rp 0** |
| Order F&B | Rp 85.000 | 450 trx = Rp 38.250.000 | Rp 267.750 | **Rp 0** |
| Booking + F&B digabung | Rp 185.000 | 200 trx = Rp 37.000.000 | Rp 259.000 | **Rp 0** |
| Booking grup/event | Rp 750.000 | 30 trx = Rp 22.500.000 | Rp 157.500 | Rp 67.500 (0,3%) |
| **Total** | — | **Rp 157.750.000** | **Rp 1.104.250/bulan** | **Rp 67.500/bulan** |

Selisih ≈ **Rp 12,4 juta per tahun** hanya dari klasifikasi kategori merchant. Prioritaskan urusan ini di atas optimasi teknis apa pun.

**Catatan strategi split transaksi.** Setelah 1 Oktober 2026, memisahkan pembayaran booking dan F&B menjadi dua transaksi ≤Rp100.000 secara teknis menghasilkan MDR 0% untuk keduanya. **Jangan menjadikan ini rekayasa sistematis** (memecah satu tagihan Rp 180.000 jadi dua Rp 90.000) — itu masuk kategori *transaction splitting* yang dilarang aturan acquirer dan bisa berujung penonaktifan merchant. Yang aman: alur bisnis yang memang natural terpisah (bayar booking saat reservasi, bayar F&B saat pesan di meja). Desain MVP kita kebetulan memang seperti itu.

---

## 2. Perbandingan Onboarding Merchant — Ini Filter Pertama, Bukan Harga

| Gateway | Terima Perorangan? | Dokumen Minimum (perorangan) | Dokumen Badan Usaha | Lama Approval |
|---|---|---|---|---|
| **Midtrans** | **YA** | **KTP saja** (WNI) untuk *Starter Pack*: Bank Transfer + GoPay + **QRIS**. NPWP hanya jika mau aktifkan kartu kredit/debit | Akta terbaru, SK Menkumham, KTP+NPWP Direktur, NPWP Perusahaan, NIB/SIUP/TDP | **1–3 hari kerja**; kartu kredit 10 hari kerja |
| **DOKU** | YA | KTP; NIB (dari OSS); rekening bank IDR atas nama sesuai KTP; email & no. HP aktif | Akta, NPWP badan, NIB | **1–2 hari kerja** setelah dokumen valid |
| **Xendit** | **TIDAK** — eksplisit menolak *individual business* | — (harus badan usaha) | NIB (atau TDP+SIUP), Akta Pengangkatan Direktur Terakhir, SK Menkumham | Bervariasi; lebih lama karena review korporat |
| **Tripay** | YA (aggregator, onboarding ringan) | KTP + data usaha | — | Cepat (hari yang sama–2 hari) |
| **Mayar** | YA | KTP | — | Cepat |
| **iPaymu** | YA — dikenal paling longgar, bisa perorangan tanpa badan usaha | KTP + rekening | — | Cepat |

Sumber: [Midtrans — dokumen legalitas](https://docs.midtrans.com/docs/apa-saja-dokumen-legalitas-yang-diperlukan-untuk-registrasi-akun-midtrans), [Midtrans Passport](https://midtrans.com/id/passport), [Xendit Help Center — individual businesses](https://help.xendit.co/hc/en-us/articles/360035083911-Can-Individual-businesses-use-Xendit-s-services)

**Xendit tereliminasi di tahap ini** jika SPL belum berbentuk PT/CV. Ini keputusan biner, bukan trade-off.

Temuan operasional penting Midtrans: nama pemilik rekening bank **harus sama persis** dengan nama di KTP yang didaftarkan. Ketidakcocokan nama adalah penyebab tersering pencairan dana macet.

---

## 3. Perbandingan Biaya Lengkap

| Item | Midtrans | DOKU | Xendit | Tripay | Mayar | iPaymu |
|---|---|---|---|---|---|---|
| **QRIS** | **0,7%** (PPN sudah termasuk) | **0,7%** (belum termasuk PPN) | 0,70% (incl. VAT) **+ Rp 4.000 processing fee** | **Rp 750 + 0,7%** | 0,7% (excl. pajak) **+ platform fee mulai 1,5%** | 0,7% |
| Virtual Account | Rp 4.000 | Rp 4.000 (BCA Rp 4.500) | bervariasi + Rp 4.000 | — | — | — |
| GoPay | 2% | — | — | — | — | — |
| DANA / OVO | 1,5% / 1,5% | 1,5% / 2–3,18% | OVO 3,00% + Rp 4.000 | — | — | — |
| ShopeePay | 2% | 2–4% | 2,50% + Rp 4.000 | — | — | — |
| Kartu Kredit | 2,9% + Rp 2.000 | 2,80% + Rp 2.000 | 2,90% + Rp 2.000 + Rp 4.000 | — | — | — |
| Biaya setup | Rp 0 | Rp 0 | Rp 0 | Rp 0 | Rp 0 | Rp 0 |
| Biaya bulanan | Rp 0 | Rp 0 | Rp 0 | Rp 0 | Rp 0 (paket dasar) | Rp 0 |
| Biaya payout/disbursement | Rp 5.000/transfer | — | — | — | — | — |

Sumber: [Midtrans — Biaya](https://midtrans.com/id/biaya), [DOKU — Pricing](https://www.doku.com/en-us/pricing), [Xendit — Pricing](https://www.xendit.co/en/pricing/), [Mayar — QRIS untuk Bisnis](https://mayar.id/blog/qris-untuk-bisnis-biaya-cara-daftar-kapan-dana-cair)

**Perangkap biaya yang mudah terlewat:**

| ID | Temuan | Dampak pada transaksi Rp 100.000 |
|---|---|---|
| PAY-04 | Xendit menambah **Rp 4.000 processing fee** per transaksi di atas MDR | 0,7% (Rp 700) + Rp 4.000 = **Rp 4.700 = 4,7% efektif**. Mematikan untuk transaksi kecil. |
| PAY-05 | Mayar menambah **platform fee mulai 1,5%** di atas channel fee | 0,7% + 1,5% = **2,2%**. Tiga kali lipat Midtrans. |
| PAY-06 | Tripay menambah **Rp 750 flat** | Rp 700 + Rp 750 = Rp 1.450 = 1,45% efektif |
| PAY-07 | DOKU 0,7% **belum termasuk PPN** (halaman harga menulis *"Excludes VAT"*) | 0,7% × 1,11 ≈ **0,777%** efektif |
| PAY-08 | Midtrans 0,7% **sudah termasuk PPN** — dinyatakan eksplisit: *"Semua biaya transaksi tidak termasuk PPN, kecuali untuk QRIS, GoPay, dan ShopeePay"* | **0,70%** efektif — paling murah di kelasnya |

Untuk profil transaksi SPL (rata-rata Rp 85.000–185.000, volume tinggi, nilai kecil), **fee flat per transaksi jauh lebih mematikan daripada persentase**. Midtrans dan DOKU adalah satu-satunya yang bersih dari fee flat di jalur QRIS.

---

## 4. Alur Teknis QRIS — Detail Implementasi

### 4.1 Midtrans — Core API (rekomendasi untuk SPL)

**Endpoint charge:**
- Sandbox: `POST https://api.sandbox.midtrans.com/v2/charge`
- Production: `POST https://api.midtrans.com/v2/charge`
- Auth: HTTP Basic, username = `ServerKey`, password kosong (base64 dari `ServerKey:`)

**Request:**
```json
{
  "payment_type": "qris",
  "transaction_details": {
    "order_id": "SPL-BK-20260823-000412",
    "gross_amount": 185000
  },
  "item_details": [
    { "id": "SESI-2H-M03", "price": 100000, "quantity": 1, "name": "Sesi Biliar 2 Jam - Meja 3" },
    { "id": "FB-LEMONTEA", "price": 25000, "quantity": 1, "name": "Lemon Tea" },
    { "id": "FB-BEEFRIBS",  "price": 60000, "quantity": 1, "name": "Smoked Beef Ribs" }
  ],
  "customer_details": {
    "first_name": "Budi", "last_name": "Santoso",
    "email": "budi@example.com", "phone": "081234567890"
  },
  "qris": { "acquirer": "gopay" },
  "custom_expiry": {
    "order_time": "2026-08-23 19:30:00 +0700",
    "expiry_duration": 15,
    "unit": "minute"
  }
}
```

**Response:**
```json
{
  "status_code": "201",
  "status_message": "QRIS transaction is created",
  "transaction_id": "0d8178e1-c6c7-4ab4-81a6-893be9d924ab",
  "order_id": "SPL-BK-20260823-000412",
  "gross_amount": "185000.00",
  "payment_type": "qris",
  "transaction_status": "pending",
  "expiry_time": "2026-08-23 19:45:00",
  "actions": [
    {
      "name": "generate-qr-code",
      "method": "GET",
      "url": "https://api.midtrans.com/v2/qris/0d8178e1-c6c7-4ab4-81a6-893be9d924ab/qr-code"
    }
  ]
}
```

**Cara menampilkan QR:** ambil `actions[]` dengan `name == "generate-qr-code"`, pasang `url`-nya langsung sebagai `src` pada tag `<img>`. Endpoint tersebut mengembalikan gambar PNG QR. Tidak perlu library QR generator di sisi frontend.

Sumber: [Midtrans — QRIS API Reference](https://docs.midtrans.com/reference/qris)

**Expiry:**

| Parameter | Nilai |
|---|---|
| Default expiry | **15 menit** |
| Minimum aman | **15 menit** — dokumentasi menyatakan expiry scheduler hanya andal pada ≥15 menit; di bawah itu bisa telat karena batch processing |
| Maksimum (acquirer `gopay`) | 7 hari |
| Maksimum (acquirer `airpay shopee`) | 5 hari |
| Cara set | objek `custom_expiry` (`order_time`, `expiry_duration`, `unit`) |

Sumber: [Midtrans — Custom Expiry Object](https://docs.midtrans.com/reference/custom-expiry-object)

**Rekomendasi untuk SPL: `expiry_duration = 15 minute`** — cukup untuk user membuka e-wallet dan bayar, cukup pendek supaya slot meja tidak tersandera lama.

### 4.2 Snap vs Core API — keputusan arsitektur

| Aspek | Snap (popup/redirect Midtrans) | Core API (QR di halaman sendiri) |
|---|---|---|
| Kecepatan implementasi | 1–2 hari | 3–5 hari |
| Kontrol visual | Rendah — tampilan Midtrans, tidak bisa dibuat gelap-amber-bata | Penuh — QR ditaruh di halaman ber-brand SPL |
| Metode bayar | Semua sekaligus (QRIS, VA, e-wallet, kartu) | Satu per satu, harus dibangun manual |
| Rekomendasi | **Fase 2** kalau mau tambah VA/kartu | **MVP** — QRIS saja, halaman ber-brand |

Karena venue ini punya identitas visual kuat (amber #F0A202, brick maroon #992212, latar near-black, font Lido STF/Emoland) dan MVP-nya **hanya QRIS**, Core API adalah pilihan yang tepat: halaman pembayaran tetap konsisten dengan brand, tidak melompat ke UI putih generik Midtrans.

### 4.3 UX mobile — masalah yang hampir selalu terlewat

Aplikasi ini mobile-first. **User tidak bisa memindai QR yang tampil di layar HP-nya sendiri.**

| ID | Solusi | Prioritas |
|---|---|---|
| PAY-09 | Tombol **"Simpan QR ke Galeri"** + instruksi: *"Buka aplikasi e-wallet → Scan → pilih ikon Galeri → pilih QR yang baru disimpan"* | **MVP** |
| PAY-10 | Tampilkan countdown timer sisa waktu (15:00 → 00:00) yang jelas dan besar | **MVP** |
| PAY-11 | Polling status ke server tiap 3–5 detik selama halaman QR terbuka; begitu `settlement` → langsung pindah ke halaman sukses tanpa user refresh | **MVP** |
| PAY-12 | Tombol "Saya sudah bayar" yang memicu cek status manual (fallback kalau polling gagal) | **MVP** |
| PAY-13 | Deteksi desktop → tampilkan QR besar untuk discan dari HP; deteksi mobile → tampilkan alur simpan-galeri | Fase 2 |
| PAY-14 | Untuk GoPay khusus, Midtrans menyediakan action `deeplink-redirect` yang membuka app Gojek langsung. Tidak ada deeplink universal untuk semua wallet QRIS | Fase 2 |

Catatan penting: jika pelanggan membayar dengan cara memindai QRIS (bukan lewat deeplink GoPay), webhook Midtrans datang dengan `"payment_type": "qris"`, bukan `"gopay"`. Logika backend harus menangani keduanya.

### 4.4 DOKU — untuk perbandingan

DOKU mengikuti standar **BI-SNAP**, yang secara struktural lebih berat:

| Operasi | Endpoint |
|---|---|
| Generate QR | `POST /snap-adapter/b2b/v1.0/qr/qr-mpm-generate` |
| Query status | `POST /snap-adapter/b2b/v1.0/qr/qr-mpm-query` (`serviceCode: "47"`) |
| Refund | `POST /snap-adapter/b2b/v1.0/qr/qr-mpm-refund` |
| Cancel | `POST /snap-adapter/b2b/v1.0/qr/qr-mpm-cancel` |
| Decode | `POST /snap-adapter/b2b/v1.0/qr/qr-mpm-decode` |

- Field QR ada di **`qrContent`** — berupa **string EMVCo mentah**, bukan URL gambar. Artinya frontend **wajib** meng-generate gambar QR sendiri (misal library `qrcode`). Satu langkah kerja ekstra dibanding Midtrans.
- Expiry via `validityPeriod` (ISO 8601). **Default 30 hari jika tidak diisi** — sangat berbahaya untuk booking meja; wajib di-override eksplisit.
- Perlu B2B access token terlebih dulu sebelum charge (dua round-trip, bukan satu).

Sumber: [DOKU — QRIS API Reference](https://developers.doku.com/accept-payments/direct-api/snap/integration-guide/qris)

---

## 5. Webhook / HTTP Notification

### 5.1 Verifikasi signature — Midtrans

```
signature_key = SHA512( order_id + status_code + gross_amount + ServerKey )
```

Catatan implementasi yang sering menyebabkan bug:
- `gross_amount` **harus** dipakai persis seperti string yang dikirim di payload, termasuk 2 desimal: `"185000.00"`, bukan `185000`.
- `status_code` juga string: `"200"`.
- Konkatenasi polos tanpa separator apa pun.
- Bandingkan hasil hash dengan `signature_key` menggunakan **constant-time comparison** untuk menghindari timing attack.
- Jika tidak cocok → **buang request, balas 200**, jangan balas error (mencegah gateway retry request palsu).

Sumber: [Midtrans — HTTP(S) Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks)

### 5.2 Daftar lengkap `transaction_status`

| Status | Arti | Aksi untuk booking SPL |
|---|---|---|
| `pending` | QR sudah dibuat, belum dibayar | Slot ditahan (`hold`), timer jalan |
| `settlement` | **Dana masuk — final sukses untuk QRIS** | **Konfirmasi booking, kunci slot, kirim notifikasi ke admin** |
| `capture` | Sukses untuk kartu kredit (perlu cek `fraud_status`) | Tidak relevan di MVP QRIS-only |
| `authorize` | Dana di-hold pada kartu, belum di-capture | Tidak relevan di MVP |
| `deny` | Ditolak | Lepas hold slot, tampilkan pesan gagal |
| `cancel` | Dibatalkan merchant/gateway | Lepas hold slot |
| `expire` | QR kedaluwarsa | Lepas hold slot, tawarkan buat ulang |
| `failure` | Gangguan di sisi Midtrans | Lepas hold slot, log untuk investigasi |
| `refund` | Sudah direfund penuh | Batalkan booking, catat di laporan keuangan |
| `partial_refund` | Direfund sebagian | Sesuaikan nominal di laporan |

`fraud_status` bernilai `accept` atau `deny`; **tidak selalu ada** pada metode risiko rendah seperti QRIS.

**Aturan emas: untuk QRIS, satu-satunya status yang boleh memicu konfirmasi booking adalah `settlement`.** Jangan pernah `pending`.

### 5.3 Perilaku retry Midtrans

| HTTP response Anda | Jumlah retry |
|---|---|
| 2xx | 0 (dianggap sukses) |
| 500 | 1× |
| 503 | 4× |
| 400 / 404 | 2× |
| 307 / 308 | Ikuti redirect (maks 5) |
| Lainnya | 5× |

Interval retry: **2 menit → 10 menit → 30 menit → 90 menit → 210 menit**, dengan jitter acak.

Timeout HTTP Midtrans: **30 detik**. Target respons Anda: **< 5 detik**.

### 5.4 Notifikasi berulang & out-of-order — desain wajib

| ID | Requirement | Implementasi |
|---|---|---|
| WH-01 | Endpoint webhook **idempoten** | Tabel `payment_events` dengan UNIQUE constraint pada `(order_id, transaction_status, status_code)`. Insert duplikat → tangkap conflict, balas 200, jangan proses ulang. |
| WH-02 | Balas 200 secepat mungkin, proses berat di belakang | Terima → verifikasi signature → simpan event mentah → balas 200 → proses async (job queue / Supabase Edge Function terpisah) |
| WH-03 | Tangani out-of-order (`settlement` datang sebelum `pending`) | Simpan urutan status sebagai state machine. Jangan pernah menurunkan status dari `settlement` ke `pending`. Dokumentasi Midtrans menyarankan: abaikan notifikasi lama, atau panggil Get Status API untuk status terkini. |
| WH-04 | **Jangan percaya nominal di webhook begitu saja** | Bandingkan `gross_amount` dari webhook dengan nominal di tabel `orders` milik Anda. Beda → tolak, jangan konfirmasi booking, alert admin. |
| WH-05 | Verifikasi ulang lewat Get Status API sebelum aksi berisiko | `GET /v2/{order_id}/status` — sumber kebenaran tunggal. Wajib dipanggil sebelum mengunci slot. |
| WH-06 | Endpoint harus HTTPS publik, bukan localhost / VPN / port aneh | Midtrans eksplisit menolak endpoint semacam itu |
| WH-07 | Parse JSON secara toleran — abaikan field baru yang tidak dikenal | Jangan pakai strict schema validation yang melempar error pada field asing |
| WH-08 | Rekonsiliasi terjadwal sebagai jaring pengaman | Cron tiap 5 menit: ambil semua order berstatus `pending` yang usianya > 20 menit, panggil Get Status API, sinkronkan. Menangkap webhook yang hilang total. |

### 5.5 Jebakan `order_id` — penyebab bug produksi paling umum

`order_id` **harus unik** di seluruh riwayat merchant. Mengirim `order_id` yang sedang aktif atau sudah dibayar → error **406 duplicate order_id**.

- `order_id` yang sudah **expired** boleh dipakai ulang, tetapi mengandalkan ini rapuh.
- **Pola yang benar:** relasi one-to-many antara booking internal dan order Midtrans.
  - Booking internal: `booking_id = 412`
  - Percobaan bayar ke-1: `order_id = "SPL-412-1"`
  - Percobaan ke-2 setelah expired: `order_id = "SPL-412-2"`
- Simpan `midtrans_order_id` di tabel `payments`, bukan di tabel `bookings`.

Midtrans juga mendukung **idempotency-key** header: request identik dengan key yang sama mengembalikan respons yang sama tanpa membuat transaksi ganda. Berguna saat backend Anda timeout dan perlu retry charge.

Sumber: [Midtrans — Error Code & Response Code](https://docs.midtrans.com/docs/error-code-and-response-code)

### 5.6 DOKU — verifikasi signature

Algoritma berbeda dan lebih rumit: **HMAC-SHA256 base64**, dengan komponen `Client-Id`, `Request-Id`, `Request-Timestamp`, `Request-Target`, dan `Digest` (SHA-256 base64 dari body) yang disusun satu per baris dipisah `\n` (tanpa `\n` di akhir), lalu di-hash dengan Secret Key, dan hasilnya diberi prefix `HMACSHA256=`.

DOKU menegaskan idempotensi: *"HTTP Notification endpoints might occasionally receive the same event more than once."* Namun dokumentasi DOKU **tidak mencantumkan kebijakan retry** (jumlah & interval) maupun panduan out-of-order — poin minus untuk debugging produksi.

Sumber: [DOKU — Generate and Validate Signature](https://dashboard.doku.com/docs/docs/technical-references/generate-signature/), [DOKU — HTTP Notification Best Practice](https://jokul.doku.com/docs/docs/http-notification/http-notification-best-practice/)

---

## 6. Sandbox & Testing

| Pertanyaan | Midtrans |
|---|---|
| Bisa tes tanpa merchant terverifikasi? | **YA.** Akun sandbox dibuat otomatis saat sign-up dan gratis. Tidak perlu KTP, tidak perlu approval. |
| Cara simulasi bayar QRIS | Salin **URL QR code** dari `actions[0].url`, tempelkan ke **[QRIS Simulator](https://simulator.sandbox.midtrans.com/v2/qris/index)**, klik bayar |
| URL simulator lama | `https://simulator.sandbox.midtrans.com/qris/index` (untuk akun sandbox yang dibuat sebelum 4 November 2024) |
| Webhook di sandbox | Berfungsi penuh. Set Notification URL di dashboard sandbox. Untuk development lokal gunakan tunnel (ngrok/cloudflared) karena localhost ditolak. |

Sumber: [Midtrans — Testing Payment on Sandbox](https://docs.midtrans.com/docs/testing-payment-on-sandbox)

**Peringatan resmi dari dokumentasi:** referensi pembayaran yang dihasilkan di Sandbox **bisa saja identik** dengan referensi yang aktif di lingkungan produksi payment provider. **Jangan pernah membayar sungguhan ke QR hasil sandbox** — dana bisa hilang.

**Ini keunggulan besar Midtrans untuk SPL:** developer bisa membangun dan menguji seluruh alur booking → charge → webhook → konfirmasi slot **hari ini juga**, paralel dengan proses verifikasi merchant yang butuh 1–3 hari kerja. Tidak ada waktu terbuang.

### Skenario test wajib sebelum go-live

| ID | Skenario | Ekspektasi |
|---|---|---|
| QA-01 | Bayar sukses via simulator | Webhook `settlement` → booking terkonfirmasi, slot terkunci |
| QA-02 | Biarkan QR expired 15 menit | Webhook `expire` → hold slot dilepas, slot tersedia lagi |
| QA-03 | Kirim webhook dengan signature salah | Ditolak, booking **tidak** berubah, tercatat di log |
| QA-04 | Kirim webhook `settlement` yang sama 3× | Booking terkonfirmasi 1× saja, tidak ada duplikat notifikasi ke admin |
| QA-05 | Kirim `settlement` dulu, lalu `pending` (out-of-order) | Status tetap `settlement`, tidak turun |
| QA-06 | Webhook dengan `gross_amount` berbeda dari order | Ditolak, alert admin |
| QA-07 | Dua user booking slot yang sama bersamaan | Hanya satu yang berhasil hold; satunya dapat pesan "slot baru saja diambil" |
| QA-08 | Webhook gagal terkirim total (matikan endpoint) | Cron rekonsiliasi menangkap dan mengoreksi dalam ≤ 5 menit |
| QA-09 | Charge di-retry karena timeout, `order_id` sama | Tidak ada transaksi ganda (idempotency-key) |

---

## 7. Settlement & Rekonsiliasi Keuangan

| Gateway | Settlement QRIS | Catatan |
|---|---|---|
| **Midtrans** | Dokumentasi resmi: transaksi baru bisa diajukan pencairan setelah settlement **3 hari kerja** — *"waktu cut off yang sudah ditetapkan dari pihak bank"*. Sumber pihak ketiga menyebut QRIS bisa dicairkan dalam **2 hari kerja** | **[PERLU KONFIRMASI]** langsung ke Midtrans. Pencairan bisa diajukan setiap hari kerja. Biaya payout **Rp 5.000/transfer**. Ada minimum untuk auto-payout (contoh yang ditampilkan: Rp 50.000). |
| **DOKU** | **T+1** (H+1 hari kerja), transfer setiap hari kerja pukul **12.00–14.00 WIB**, otomatis | Unggul untuk arus kas harian |
| **Xendit** | **T+2 hari kerja** | — |
| **iPaymu** | H+1 hari kerja | — |

Sumber: [Midtrans — Kapan menerima dana](https://docs.midtrans.com/docs/kapan-saya-menerima-dana-transaksi-dari-midtrans), [DOKU blog — QRIS DOKU](https://www.doku.com/en-us/blog/qris-doku-satu-qr-untuk-semua-pembayaran-lengkap-dengan-refund-online-laporan-terpusat-dan-dukungan-cross-border)

**Ini satu-satunya kategori di mana DOKU menang telak atas Midtrans.** Untuk bisnis F&B dengan perputaran bahan baku harian, selisih T+1 vs T+3 itu terasa. Tetapi untuk MVP dengan volume online yang belum besar (mayoritas omzet masih tunai/EDC di kasir), selisih 2 hari kerja bukan alasan cukup untuk mengorbankan kemudahan onboarding dan kualitas sandbox.

### Implikasi wajib untuk Dashboard Keuangan (AD-08)

Perbedaan **gross vs net** ini adalah sumber kesalahan pembukuan nomor satu:

| ID | Field di database | Definisi |
|---|---|---|
| FIN-01 | `gross_amount` | Nominal yang dibayar pelanggan |
| FIN-02 | `mdr_fee` | Potongan MDR (0% / 0,3% / 0,7% tergantung kategori & nilai) |
| FIN-03 | `net_amount` | `gross_amount − mdr_fee` — **ini yang benar-benar masuk rekening** |
| FIN-04 | `settlement_date` | Tanggal dana efektif masuk rekening — **beda dengan tanggal transaksi** |
| FIN-05 | `settlement_batch_id` | ID batch pencairan dari gateway, untuk mencocokkan dengan mutasi rekening |
| FIN-06 | `payout_fee` | Rp 5.000 per transfer pencairan (Midtrans) |

| ID | Requirement | Prioritas |
|---|---|---|
| FIN-07 | Dashboard menampilkan **omzet kotor** dan **dana bersih diterima** berdampingan, tidak hanya salah satu | **MVP** |
| FIN-08 | Laporan berbasis **tanggal transaksi** (untuk analisis penjualan) dan **tanggal settlement** (untuk rekonsiliasi bank) — dua view terpisah | **MVP** |
| FIN-09 | Halaman "Rekonsiliasi": daftar transaksi `settlement` yang belum dicocokkan dengan mutasi rekening | Fase 2 |
| FIN-10 | Export CSV/XLSX untuk diserahkan ke akuntan/pajak | **MVP** |
| FIN-11 | Tarik data settlement otomatis dari Midtrans Iris/Payout API | Fase 3 |

**Jebakan yang harus dihindari:** jangan mencatat pendapatan sebesar `gross_amount` di laporan laba-rugi tanpa mencatat MDR sebagai beban. Kalau tidak, buku selalu selisih dan pemilik akan kehilangan kepercayaan pada dashboard-nya sendiri dalam bulan pertama.

---

## 8. Expired, Cancel, dan Refund QRIS

### 8.1 Expired — jalur paling sering terjadi

| ID | Requirement | Detail |
|---|---|---|
| EXP-01 | Slot meja ditahan dengan status `hold` + `hold_expires_at`, bukan langsung `booked` | Durasi hold = expiry QRIS + buffer 60 detik |
| EXP-02 | Slot **hanya** menjadi `booked` setelah webhook `settlement` diverifikasi | Tidak ada pengecualian |
| EXP-03 | Cron tiap 1 menit melepas hold yang kedaluwarsa | Jangan andalkan hanya webhook `expire` |
| EXP-04 | UI menampilkan slot ber-`hold` sebagai "sedang diproses", bukan "tersedia" | Mencegah dua orang membayar untuk slot yang sama |
| EXP-05 | Anti double-booking di level database, bukan hanya di kode aplikasi | PostgreSQL: `EXCLUDE USING gist (table_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE (status IN ('hold','booked'))`. Ini menutup race condition secara struktural. |

### 8.2 Cancel

Untuk transaksi berstatus `pending` (belum dibayar), gunakan **Cancel API**, bukan Refund API. `POST /v2/{order_id}/cancel`.

### 8.3 Refund QRIS — **DIDUKUNG**, ini temuan penting

Berlawanan dengan anggapan umum bahwa QRIS tidak bisa direfund, dokumentasi Midtrans menyatakan refund berlaku untuk: **kartu kredit, e-wallet, QRIS, ShopeePay, DANA, OVO, Kredivo, dan Akulaku.**

**Endpoint:** `POST BASE_URL/v2/{order_id|transaction_id}/refund`

| Field | Sifat | Keterangan |
|---|---|---|
| `refund_key` | Opsional | ID refund milik merchant. Memungkinkan retry dengan key sama dalam 7 hari. Hanya huruf, angka, dash, underscore. |
| `amount` | Opsional | Default = nominal penuh. Diisi untuk partial refund. |
| `reason` | Opsional | Alasan refund |

| Response Code | Arti |
|---|---|
| 200 | Refund disetujui |
| 406 | Duplicate refund ID |
| 412 | Status transaksi tidak bisa diubah |
| 414 | Nominal refund tidak valid |

**Batasan yang harus masuk ke desain:**

| ID | Batasan | Konsekuensi |
|---|---|---|
| RFD-01 | Refund **hanya** untuk transaksi berstatus `Settlement` | Transaksi `pending` → pakai Cancel API |
| RFD-02 | Dana harus tersedia di saldo Midtrans | Jika saldo kurang, refund gagal. Sisakan buffer saldo. |
| RFD-03 | **Partial refund didukung** untuk QRIS (tidak didukung untuk ShopeePay & OVO) | Bisa refund sebagian, misal batal F&B tapi booking meja jalan |
| RFD-04 | **Jendela waktu refund: GoPay QRIS ON-US 45 hari, OFF-US 7 hari** | **Kritis.** Jika pelanggan bayar dari e-wallet non-GoPay (OFF-US), refund hanya mungkin dalam **7 hari**. Kebijakan pembatalan SPL harus lebih pendek dari 7 hari. |
| RFD-05 | Bisa lewat Dashboard MAP (tombol refund) maupun Refund API | MVP: cukup lewat dashboard manual oleh admin |

Sumber: [Midtrans — Refund Transactions](https://docs.midtrans.com/reference/refund-transaction), [Midtrans — Bagaimana cara refund transaksi](https://docs.midtrans.com/docs/how-can-i-refund-transaction)

### 8.4 Kebijakan pembatalan yang disarankan untuk SPL

**[PERLU KONFIRMASI]** ke pemilik — ini keputusan bisnis, bukan teknis:

| Waktu Pembatalan oleh Pelanggan | Usulan Kebijakan | Alasan |
|---|---|---|
| > 24 jam sebelum sesi | Refund 100% | Meja masih mudah dijual ulang |
| 6–24 jam sebelum sesi | Refund 50% atau kredit toko 100% | Kompensasi risiko meja kosong |
| < 6 jam sebelum sesi | Tanpa refund, tawarkan reschedule 1× | Meja hampir pasti kosong |
| No-show | Tanpa refund | — |
| Dibatalkan oleh SPL | Refund 100% + kompensasi | Kesalahan merchant |

| ID | Requirement | Prioritas |
|---|---|---|
| RFD-06 | **Kredit toko (store credit) sebagai default, bukan refund uang** | **MVP** |
| RFD-07 | Refund uang hanya via approval manual admin di Dashboard MAP | **MVP** |
| RFD-08 | Refund otomatis via API | Fase 3 |

**Rekomendasi kuat: jangan bangun refund otomatis di MVP.** Volume pembatalan di venue biliar rendah, jendela refund OFF-US cuma 7 hari, dan refund yang salah jauh lebih mahal daripada refund yang lambat. Tangani manual lewat dashboard Midtrans, catat manual di sistem. **Store credit** malah lebih baik untuk bisnis: uang tetap di dalam venue dan mendorong kunjungan ulang.

---

## 9. Matriks Keputusan Akhir

Bobot mencerminkan realitas UMKM yang butuh cepat jalan dengan tim kecil, bukan kebutuhan enterprise.

| Kriteria | Bobot | Midtrans | DOKU | Xendit | Tripay | Mayar | iPaymu |
|---|---|---|---|---|---|---|---|
| Terima merchant perorangan | 20% | 5 | 4 | **0** | 5 | 5 | 5 |
| Biaya efektif QRIS | 20% | **5** (0,70% incl. PPN) | 4 (0,777%) | 1 (4,7% @Rp100k) | 2 (1,45%) | 1 (2,2%) | 4 |
| Kualitas dokumentasi & DX | 15% | **5** | 3 | 5 | 2 | 2 | 2 |
| Sandbox tanpa verifikasi | 15% | **5** (simulator QRIS 1 klik) | 3 | 4 | 2 | 2 | 2 |
| Kecepatan settlement | 10% | 3 (T+2/T+3) | **5** (T+1) | 3 (T+2) | 4 | 3 | 4 |
| Kemudahan onboarding | 10% | **5** (KTP saja) | 4 | 1 | 4 | 4 | 5 |
| Refund QRIS & partial refund | 5% | **5** | 4 | 4 | 2 | 2 | 2 |
| Ekosistem SDK & komunitas ID | 5% | **5** | 3 | 4 | 3 | 2 | 2 |
| **Skor tertimbang** | 100% | **4,70** | 3,80 | 2,00 | 3,15 | 2,70 | 3,55 |

---

## 10. Requirement ID Pembayaran untuk PRD

| ID | Requirement | Prioritas |
|---|---|---|
| PAY-01 | Integrasi Midtrans Core API, `payment_type: "qris"`, acquirer `gopay` | **MVP** |
| PAY-02 | Halaman QR ber-brand SPL (amber #F0A202 di atas near-black, wordmark Lido STF, angka countdown Emoland) | **MVP** |
| PAY-03 | Expiry 15 menit via `custom_expiry`, countdown besar & terbaca | **MVP** |
| PAY-04 | Tombol "Simpan QR ke Galeri" + instruksi scan-dari-galeri untuk mobile | **MVP** |
| PAY-05 | Polling status tiap 3–5 detik + tombol "Saya sudah bayar" | **MVP** |
| PAY-06 | Endpoint webhook idempoten dengan verifikasi SHA512 + validasi `gross_amount` | **MVP** |
| PAY-07 | Verifikasi ulang via Get Status API sebelum mengunci slot | **MVP** |
| PAY-08 | Cron rekonsiliasi tiap 5 menit untuk order `pending` berumur > 20 menit | **MVP** |
| PAY-09 | Cron pelepas hold tiap 1 menit | **MVP** |
| PAY-10 | Constraint EXCLUDE di PostgreSQL untuk anti double-booking | **MVP** |
| PAY-11 | Pola `order_id` one-to-many: `SPL-{booking_id}-{attempt}` | **MVP** |
| PAY-12 | Idempotency-key pada request charge | **MVP** |
| PAY-13 | Simpan `gross_amount`, `mdr_fee`, `net_amount`, `settlement_date` terpisah | **MVP** |
| PAY-14 | Refund manual lewat Dashboard MAP + pencatatan manual di sistem | **MVP** |
| PAY-15 | Store credit sebagai mekanisme kompensasi default | **MVP** |
| PAY-16 | Tambah Snap untuk VA & kartu kredit (booking event besar) | Fase 2 |
| PAY-17 | Deeplink GoPay untuk pengguna mobile | Fase 2 |
| PAY-18 | Halaman rekonsiliasi settlement vs mutasi rekening | Fase 2 |
| PAY-19 | Refund otomatis via Refund API | Fase 3 |
| PAY-20 | Tarik data settlement otomatis via Iris/Payout API | Fase 3 |
| PAY-21 | Abstraksi `PaymentProvider` interface agar bisa swap gateway tanpa bongkar domain | Fase 2 |

---

## 11. Daftar Aksi Non-Teknis untuk Pemilik (kerjakan paralel dengan development)

| # | Aksi | Estimasi |
|---|---|---|
| 1 | Daftar akun Midtrans, ambil Sandbox Server Key & Client Key — **bisa hari ini, tanpa dokumen** | 10 menit |
| 2 | Siapkan **KTP** + halaman depan buku tabungan; **pastikan nama rekening identik dengan nama di KTP** | 1 jam |
| 3 | Ajukan verifikasi Midtrans Passport (Starter Pack: Bank Transfer + GoPay + QRIS) | 1–3 hari kerja |
| 4 | **Konfirmasi omzet tahunan** untuk menentukan kategori UMi vs UKE — minta klasifikasi UMi secara tertulis jika omzet ≤ Rp 2 miliar | Kritis |
| 5 | Tanyakan tertulis: implementasi tier MDR 0% ≤Rp100.000 per 1 Oktober 2026 & settlement QRIS T+berapa | Kritis |
| 6 | Tetapkan kebijakan pembatalan & refund secara tertulis (lihat §8.4), tampilkan di halaman checkout | Keputusan bisnis |
| 7 | Siapkan NPWP **hanya jika** ingin menerima kartu kredit di Fase 2 | Fase 2 |

Sources: [Bank Indonesia — MDR QRIS](https://www.bi.go.id/id/publikasi/ruang-media/cerita-bi/Pages/mdr-qris.aspx) · [Kompas — MDR QRIS 1 Oktober 2026](https://www.kompas.com/tren/read/2026/08/19/110000365/mulai-1-oktober-2026-transaksi-qris-hingga-rp-500.000-bebas-mdr-ini) · [Infobank](https://infobanknews.com/bi-bebaskan-tarif-mdr-qris-transaksi-rp100-ribu-mulai-1-oktober-2026) · [Midtrans — Biaya](https://midtrans.com/id/biaya) · [Midtrans — Passport](https://midtrans.com/id/passport) · [Midtrans — Dokumen Legalitas](https://docs.midtrans.com/docs/apa-saja-dokumen-legalitas-yang-diperlukan-untuk-registrasi-akun-midtrans) · [Midtrans — QRIS API](https://docs.midtrans.com/reference/qris) · [Midtrans — Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks) · [Midtrans — Handle Notifications](https://docs.midtrans.com/reference/handle-notifications) · [Midtrans — Custom Expiry](https://docs.midtrans.com/reference/custom-expiry-object) · [Midtrans — Sandbox Testing](https://docs.midtrans.com/docs/testing-payment-on-sandbox) · [Midtrans — Refund](https://docs.midtrans.com/reference/refund-transaction) · [Midtrans — Cara Refund](https://docs.midtrans.com/docs/how-can-i-refund-transaction) · [Midtrans — Pencairan Dana](https://docs.midtrans.com/docs/kapan-saya-menerima-dana-transaksi-dari-midtrans) · [DOKU — Pricing](https://www.doku.com/en-us/pricing) · [DOKU — QRIS API](https://developers.doku.com/accept-payments/direct-api/snap/integration-guide/qris) · [DOKU — Signature](https://dashboard.doku.com/docs/docs/technical-references/generate-signature/) · [DOKU — Notification Best Practice](https://jokul.doku.com/docs/docs/http-notification/http-notification-best-practice/) · [Xendit — Pricing](https://www.xendit.co/en/pricing/) · [Xendit — Individual Businesses](https://help.xendit.co/hc/en-us/articles/360035083911-Can-Individual-businesses-use-Xendit-s-services) · [Xendit — QRIS](https://www.xendit.co/en-id/payment-channel/qris/) · [Mayar — QRIS untuk Bisnis](https://mayar.id/blog/qris-untuk-bisnis-biaya-cara-daftar-kapan-dana-cair) · [Hukumonline — Kriteria UMKM PP 7/2021](https://www.hukumonline.com/klinik/a/kriteria-umkm-terbaru-lt697a59963bdc9/)

## Risiko
- KLASIFIKASI KATEGORI MERCHANT — RISIKO FINANSIAL TERBESAR. Gateway cenderung men-default merchant online ke kategori UKE/UME (MDR 0,7%). Jika omzet tahunan SPL <= Rp 2 miliar, SPL berhak kategori Usaha Mikro (UMi) dengan MDR 0% untuk transaksi <= Rp 500.000. Selisihnya sekitar Rp 12,4 juta per tahun pada asumsi volume Rp 157 juta/bulan. Mitigasi: minta klasifikasi UMi secara TERTULIS saat onboarding, jangan menerima klasifikasi default.
- KEBIJAKAN MDR 0% 1 OKTOBER 2026 BELUM TERKONFIRMASI DI SISI GATEWAY. Pengumuman BI (17-19 Agustus 2026) belum ditemukan nomor PBI/PADG formalnya, dan halaman harga publik Midtrans/DOKU/Xendit masih menulis 0,7% flat. Mitigasi: jangan memasukkan penghematan ini ke proyeksi keuangan sampai ada konfirmasi tertulis dari gateway; hitung skenario konservatif 0,7%.
- DOUBLE BOOKING (RACE CONDITION). Dua pelanggan bisa membayar untuk slot meja yang sama jika pengecekan ketersediaan hanya dilakukan di level kode aplikasi. Akibatnya pelanggan datang, meja sudah dipakai, dan refund QRIS OFF-US hanya bisa dalam 7 hari. Mitigasi WAJIB: constraint EXCLUDE USING gist dengan tstzrange di PostgreSQL, ditambah status hold + hold_expires_at, bukan sekadar validasi di aplikasi.
- KONFIRMASI BOOKING BERDASARKAN STATUS YANG SALAH. Mengonfirmasi slot saat transaction_status 'pending' (bukan 'settlement') berarti meja terkunci tanpa dana masuk. Mitigasi: HANYA status 'settlement' yang boleh mengunci slot, dan wajib diverifikasi ulang via Get Status API sebelum aksi.
- WEBHOOK PALSU / MANIPULASI NOMINAL. Endpoint webhook publik bisa dikirimi payload palsu berisi settlement untuk order apa pun. Mitigasi: verifikasi SHA512(order_id + status_code + gross_amount + ServerKey) dengan gross_amount sebagai string persis (contoh '185000.00'), constant-time comparison, DAN bandingkan gross_amount webhook dengan nominal di database sendiri.
- WEBHOOK HILANG ATAU DATANG OUT-OF-ORDER. Pelanggan sudah bayar tetapi booking tidak pernah terkonfirmasi karena webhook gagal terkirim, atau status turun dari settlement kembali ke pending. Retry Midtrans berinterval 2/10/30/90/210 menit dengan jitter, terlalu lambat untuk booking meja. Mitigasi: cron rekonsiliasi tiap 5 menit memanggil Get Status API untuk semua order pending berumur > 20 menit, plus state machine yang tidak pernah menurunkan status.
- WEBHOOK DIPROSES BERULANG (NON-IDEMPOTEN). Notifikasi yang sama datang beberapa kali menyebabkan booking ganda, notifikasi admin ganda, atau pencatatan pendapatan ganda di laporan keuangan. Mitigasi: tabel payment_events dengan UNIQUE constraint (order_id, transaction_status, status_code), balas 200 pada duplikat tanpa memproses ulang.
- ERROR 406 DUPLICATE ORDER_ID SAAT PELANGGAN RETRY BAYAR. order_id wajib unik seumur hidup merchant; menggunakan booking_id langsung akan gagal pada percobaan bayar kedua. Mitigasi: pola one-to-many SPL-{booking_id}-{attempt}, simpan midtrans_order_id di tabel payments terpisah.
- MEMBEBANKAN MDR KE PELANGGAN MELANGGAR ATURAN BANK INDONESIA. BI menyatakan eksplisit biaya MDR ditanggung merchant dan tidak boleh dibebankan kepada konsumen. Menambahkan baris 'biaya QRIS' di checkout berisiko sanksi dan penonaktifan merchant. Mitigasi: serap MDR ke margin harga; jangan pernah melabeli surcharge sebagai biaya QRIS.
- TRANSACTION SPLITTING YANG DISENGAJA. Memecah satu tagihan menjadi beberapa transaksi <= Rp 100.000 untuk menghindari MDR termasuk pelanggaran aturan acquirer dan bisa berujung penonaktifan merchant. Mitigasi: hanya pisahkan pembayaran jika memang alur bisnisnya natural terpisah (booking saat reservasi, F&B saat pesan di meja); jangan bangun fitur auto-split.
- JENDELA REFUND QRIS OFF-US HANYA 7 HARI. Jika pelanggan membayar dari e-wallet selain GoPay, refund hanya mungkin dalam 7 hari sejak transaksi. Kebijakan pembatalan yang lebih longgar dari 7 hari akan menciptakan kewajiban yang tidak bisa dieksekusi lewat gateway. Mitigasi: batasi jendela pembatalan berbayar di bawah 7 hari, dan jadikan store credit sebagai kompensasi default.
- REFUND GAGAL KARENA SALDO MIDTRANS TIDAK CUKUP. Refund hanya bisa diproses jika status transaksi Settlement DAN dana tersedia di saldo. Jika semua dana sudah ditarik ke rekening, refund akan ditolak. Mitigasi: sisakan buffer saldo di Midtrans, jangan set auto-payout 100%.
- SETTLEMENT MIDTRANS TIDAK JELAS ANTARA T+2 DAN T+3. Dokumentasi resmi menyebut 3 hari kerja sebagai cut-off bank, sumber pihak ketiga menyebut QRIS 2 hari kerja. DOKU jauh lebih cepat di T+1. Ketidakpastian ini mengganggu perencanaan arus kas untuk pembelian bahan baku F&B. Mitigasi: konfirmasi tertulis ke Midtrans sebelum go-live; jangan sandarkan pembelian bahan baku harian pada dana online.
- PEMBUKUAN SALAH KARENA MENCAMPUR GROSS DAN NET. Mencatat pendapatan sebesar gross_amount tanpa mencatat MDR sebagai beban membuat buku selalu selisih dengan mutasi rekening, dan pemilik akan kehilangan kepercayaan pada dashboard dalam bulan pertama. Mitigasi: simpan gross_amount, mdr_fee, net_amount, payout_fee, settlement_date sebagai kolom terpisah sejak hari pertama; sediakan dua view laporan (tanggal transaksi vs tanggal settlement).
- UX MOBILE GAGAL KARENA PELANGGAN TIDAK BISA SCAN QR DI LAYARNYA SENDIRI. Aplikasi ini mobile-first, tetapi QRIS mengasumsikan QR dipindai dari perangkat lain. Tanpa penanganan, tingkat kegagalan pembayaran akan tinggi. Mitigasi: tombol Simpan QR ke Galeri plus instruksi scan-dari-galeri, wajib masuk MVP bukan Fase 2.
- MENGGUNAKAN QR SANDBOX UNTUK PEMBAYARAN SUNGGUHAN. Dokumentasi Midtrans memperingatkan referensi pembayaran sandbox bisa identik dengan referensi aktif di lingkungan produksi provider, sehingga dana bisa hilang. Mitigasi: pemisahan environment yang ketat, banner peringatan besar di build sandbox, credential sandbox dan produksi tidak pernah berada di file env yang sama.
- EXPIRY QRIS DI BAWAH 15 MENIT TIDAK ANDAL. Dokumentasi Midtrans menyatakan expiry scheduler hanya andal pada >= 15 menit karena batch processing; set lebih pendek menyebabkan slot tertahan lebih lama dari yang ditampilkan ke pelanggan. Mitigasi: gunakan 15 menit, dan jalankan cron pelepas hold sendiri tiap 1 menit sebagai sumber kebenaran, jangan bergantung pada webhook expire.
- XENDIT TIDAK MENERIMA MERCHANT PERORANGAN. Jika SPL belum berbadan hukum PT/CV, Xendit tidak bisa dipakai sama sekali; ini eliminasi biner, bukan trade-off. Ditambah processing fee Rp 4.000 per transaksi yang membuat biaya efektif mencapai 4,7% pada transaksi Rp 100.000. Mitigasi: jangan pertimbangkan Xendit sampai SPL berbadan hukum dan nilai transaksi rata-rata jauh lebih besar.
- VENDOR LOCK-IN KE MIDTRANS. Jika logika Midtrans tersebar di seluruh codebase, migrasi ke DOKU (misalnya demi settlement T+1 saat volume tumbuh) menjadi pekerjaan besar. Mitigasi: bungkus di balik interface PaymentProvider dengan method createQrCharge / getStatus / handleWebhook / refund; domain booking tidak boleh mengenal nama Midtrans.
- NAMA REKENING BANK TIDAK SAMA DENGAN NAMA KTP. Ini penyebab tersering pencairan dana macet di Midtrans, dan baru ketahuan saat pencairan pertama, yaitu setelah aplikasi sudah live dan menerima uang pelanggan. Mitigasi: verifikasi kecocokan nama sebelum submit dokumen onboarding.

## Rekomendasi
**MIDTRANS adalah pemenang tunggal untuk MVP. Gunakan Core API dengan `payment_type: "qris"`, acquirer `gopay`, expiry 15 menit.** Skor tertimbang 4,70 dari 5 — unggul telak atas DOKU (3,80), iPaymu (3,55), Tripay (3,15), Mayar (2,70), dan Xendit (2,00).

Alasannya operasional, bukan teknis:

**Pertama, SPL bisa mulai coding hari ini.** Sandbox Midtrans aktif otomatis saat sign-up tanpa dokumen, tanpa approval, dan menyediakan QRIS Simulator satu klik — cukup tempel URL QR ke `simulator.sandbox.midtrans.com/v2/qris/index`. Seluruh alur booking → charge → webhook → konfirmasi slot bisa dibangun dan diuji paralel dengan verifikasi merchant yang butuh 1–3 hari kerja. Tidak ada hari yang terbuang menunggu.

**Kedua, onboarding-nya paling ringan di pasar.** Starter Pack Midtrans hanya butuh **KTP** untuk WNI, dan itu sudah langsung mengaktifkan Bank Transfer, GoPay, dan **QRIS**. NPWP baru diperlukan kalau nanti ingin menerima kartu kredit di Fase 2. Bandingkan dengan Xendit yang menolak merchant perorangan sama sekali dan mensyaratkan NIB + Akta + SK Menkumham. Jika SPL belum berbentuk PT/CV, Xendit bukan sekadar lebih mahal — Xendit mustahil.

**Ketiga, biayanya paling bersih.** QRIS Midtrans 0,7% dan halaman harga resminya menyatakan PPN **sudah termasuk** untuk QRIS, GoPay, dan ShopeePay. Efektifnya benar-benar 0,70%. DOKU 0,7% belum termasuk PPN (≈0,777%), Tripay menambah Rp 750 flat (1,45% pada transaksi Rp 100.000), Mayar menambah platform fee mulai 1,5% (total 2,2%), dan Xendit menambah processing fee Rp 4.000 yang meledakkan biaya efektif jadi 4,7% pada transaksi Rp 100.000. Untuk profil SPL — transaksi banyak dengan nilai kecil Rp 85.000–185.000 — fee flat per transaksi jauh lebih merusak daripada persentase. Hanya Midtrans dan DOKU yang bersih dari fee flat di jalur QRIS.

**Keempat, dokumentasi dan DX-nya yang terbaik.** Midtrans mengembalikan QR sebagai **URL gambar siap pakai** di `actions[].url` — cukup dipasang sebagai `src` pada tag `<img>`. DOKU mengembalikan `qrContent` berupa string EMVCo mentah yang harus di-render sendiri jadi gambar, memerlukan B2B access token lebih dulu (dua round-trip), dan default `validityPeriod`-nya **30 hari** jika tidak diisi — sangat berbahaya untuk booking meja kalau developer lupa meng-override. Verifikasi signature Midtrans juga jauh lebih sederhana: satu SHA512 dari empat nilai yang dikonkatenasi, versus HMAC-SHA256 base64 DOKU dengan lima komponen bertingkat dan prefix khusus. Untuk tim kecil, selisih kompleksitas ini berbanding lurus dengan jumlah bug produksi.

**Kelima, kebijakan retry dan panduan out-of-order-nya terdokumentasi eksplisit** (2/10/30/90/210 menit, tabel retry per HTTP code, saran memanggil Get Status API saat status datang tidak berurutan). DOKU tidak mendokumentasikan kebijakan retry maupun panduan out-of-order sama sekali — kekurangan yang baru terasa sakit saat produksi bermasalah jam 11 malam.

**Keenam, refund QRIS didukung penuh termasuk partial refund**, lewat Dashboard MAP maupun API. Ini membantah anggapan umum bahwa QRIS tidak bisa direfund.

**Satu-satunya kekalahan Midtrans adalah settlement.** DOKU T+1 (transfer otomatis tiap hari kerja 12.00–14.00 WIB) versus Midtrans T+2/T+3. Untuk bisnis F&B dengan perputaran bahan baku harian, ini nyata. Tetapi di MVP, mayoritas omzet SPL masih tunai/EDC di kasir dan volume online belum besar — selisih 2 hari kerja tidak sebanding dengan mengorbankan onboarding KTP-saja dan sandbox instan. Jika volume online tumbuh signifikan (di atas ~Rp 100 juta/bulan), evaluasi ulang pindah ke DOKU demi arus kas.

**Karena itu, wajib bungkus di balik interface `PaymentProvider`** dengan method `createQrCharge`, `getStatus`, `handleWebhook`, dan `refund`. Domain booking tidak boleh mengenal nama Midtrans sama sekali. Ini pekerjaan setengah hari yang membuat migrasi ke DOKU nanti jadi pekerjaan dua hari, bukan dua minggu.

**Prioritas nomor satu justru bukan teknis, melainkan komersial: pastikan klasifikasi kategori merchant.** Jika omzet tahunan SPL ≤ Rp 2 miliar, SPL berhak kategori Usaha Mikro (UMi) dengan MDR **0% untuk semua transaksi ≤ Rp 500.000** — yang berarti praktis **seluruh** transaksi booking dan F&B bebas MDR. Gateway men-default merchant online ke UKE/UME (0,7%) kalau tidak diminta. Selisihnya sekitar **Rp 12,4 juta per tahun**. Minta klasifikasi UMi secara tertulis saat onboarding, dan sekaligus konfirmasikan dua hal: apakah tier MDR 0% untuk transaksi ≤Rp100.000 per 1 Oktober 2026 sudah diimplementasikan di sistem billing mereka, dan settlement QRIS sebenarnya T+berapa. Kedua jawaban ini bernilai lebih besar daripada optimasi kode mana pun di proyek ini.

**Untuk MVP, batasi metode pembayaran ke QRIS saja.** QRIS sudah interoperabel dengan seluruh e-wallet dan mobile banking di Indonesia — menambah VA atau kartu kredit di MVP hanya menambah permukaan bug tanpa menambah pelanggan yang bisa membayar. Simpan untuk Fase 2 lewat Snap, saat ada permintaan nyata dari booking event besar.