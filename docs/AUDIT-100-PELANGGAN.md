# Audit & Simulasi 100 Pelanggan — SPL & Smokehouse

Tanggal: 7 November 2026 · Uji: `npm run test:pelanggan` (berkas `test/pelanggan100.test.ts`)

## Apa yang disimulasikan

Seratus pelanggan dalam satu hari operasional (11.00–02.00), dijalankan lewat mesin aplikasi yang sama
dengan yang dipakai server, sebagai kejadian di jejak bersama. Server asli tidak disentuh.

| Jenis pelanggan | Jumlah | Perilaku yang diuji |
|---|---|---|
| Booking meja biliar dari HP | 34 | tahan slot → QRIS → bayar → check-in → main → tutup tab. 78% bayar tepat waktu, 8% batal, 6% telat bayar sesudah hold habis, 8% membiarkan QR kedaluwarsa. 15% tidak datang. 10% notifikasi pembayaran terkirim dua kali. Jam HP tamu meleset sampai 4 menit. |
| Booking berebut slot yang sama | 6 | memesan meja & jam yang persis sama dengan tamu lain |
| Makan di Smokehouse | 22 | waiter/kasir membuka meja resto, tamu pesan dari HP, 70% bayar di kasir, 30% QRIS di muka |
| Takeaway Smokehouse dari HP | 18 | 50% bayar di kasir saat ambil, 50% QRIS di muka, sebagian tidak diambil |
| Walk-in biliar lewat kasir | 20 | buka meja, pesan minuman, tutup tab tunai/EDC/QRIS |
| Menu habis | +2 | dua tamu memesan menu yang baru ditandai habis, sudah bayar QRIS |

Simulasi dijalankan untuk **20 hari berbeda (2.000 pelanggan)** dengan pola acak yang berbeda tiap hari.

## Hasil audit — semua lolos di 20 hari

| Pemeriksaan | Hasil |
|---|---|
| Tidak ada dua booking di meja & jam yang sama | ✅ |
| Setiap rupiah QRIS yang masuk = booking/pesanan jadi + dana dikembalikan | ✅ |
| Notifikasi bayar ganda tidak membuat uang tercatat dua kali | ✅ |
| Omzet SPL + Smokehouse = omzet gabungan (juga diterima kasir & prabayar) | ✅ |
| Omzet = diterima kasir + prabayar online | ✅ |
| Jumlah per kanal (tunai/EDC/QRIS kasir) = diterima kasir | ✅ |
| Smokehouse tidak pernah mendapat omzet sewa meja biliar | ✅ |
| HP tamu tidak salah memvonis "slot diambil orang lain" | ✅ (sesudah perbaikan 7 Nov) |
| Data identik bila diputar ulang di perangkat lain dengan urutan acak | ✅ |

### Angka dari 20 hari simulasi

- Booking online (800): 409 selesai main, 78 tidak datang (uang prabayar tetap tercatat), 54 batal sebelum bayar,
  46 QR dibiarkan kedaluwarsa, 210 ditolak karena slotnya sudah ditahan orang lain lebih dulu
  (120 di antaranya memang sengaja berebut).
- Pesanan makanan: 796 diterima, 44 ditolak (menu habis) — semuanya otomatis tercatat untuk dikembalikan dananya.
- Omzet rata-rata per hari simulasi: Rp 9,2 juta (SPL Rp 3,9 juta, Smokehouse Rp 5,3 juta).

## Temuan

### 1. Bug booking yang dilaporkan hari ini — sudah diperbaiki dan terbukti
Tanpa perbaikan 7 November, **100% tamu booking** (590 dari 590 hold di 20 hari) akan melihat
"Slot tidak bisa ditahan" sebelum QRIS muncul, walaupun slotnya sebenarnya aman. Dengan perbaikan, 0 kasus,
termasuk saat jam HP tamu meleset sampai 4 menit. Ini cocok dengan laporan "menu bayar online tidak tampil".

### 2. Walk-in bisa menghalangi booking yang sudah dibayar (3 dari ±490 booking terbayar)
Kasir boleh membuka walk-in di meja yang masih kosong 30 menit ke depan. Kalau walk-in itu
dibuka sebagai open bill dan tidak dipindahkan, tamu booking yang datang tidak bisa check-in
("Meja masih dipakai"). Bookingnya lalu menggantung sampai tutup dan uang prabayarnya tidak masuk rekap
sampai kasir memutuskan di menu Kasir → "Meja bermasalah" (pindah meja, atau void + kembalikan dana).

**Saran:** saat membuka walk-in di meja yang punya booking hari itu, wajibkan jam selesai sebelum booking
(tidak boleh open bill), atau tampilkan peringatan besar "Meja ini dibooking jam 16.00".

### 3. Takeaway "bayar di kasir" yang tidak diambil (16 pesanan dalam 20 hari)
Dapur sudah memasak, tapi pesanan tidak pernah dibayar. Saat ini pesanan itu tetap berstatus diterima
tanpa pembayaran.

**Saran:** tampilkan daftar "takeaway belum diambil" saat tutup shift, dan pertimbangkan wajib QRIS
untuk takeaway di atas nominal tertentu.

### 4. Menu habis sesudah tamu membuka keranjang (dugaan, dari simulasi mesin)
Kalau tamu sudah membuka keranjang sebelum menu ditandai habis, pesanannya ditolak mesin sesudah bayar
dan dananya tercatat untuk dikembalikan (benar dan aman), tapi tamu kecewa dan kasir harus mentransfer balik.

**Saran:** periksa status habis sekali lagi tepat sebelum QRIS dibuat.

## Batas simulasi

- Yang diuji adalah aturan dan uang di mesin aplikasi, bukan tampilan di HP, sinyal, atau login Google.
- Pembayaran memakai notifikasi tiruan; DOKU sungguhan sudah diuji terpisah dengan tagihan uji Rp 1.000.
- Perilaku pelanggan (persentase batal, telat, tidak datang) adalah asumsi, bukan data SPL.

---

# Bagian 2 — Panel 100 Pembeli (metode founder-consumer)

Laporan lengkap: [founder/panel/results.md](../founder/panel/results.md). Ringkasnya:

- **10 dari 100** persona pembeli akan memakai aplikasi di bulan pertama (batas atas; persona AI cenderung terlalu setuju).
  Keluarga Smokehouse 17%, pemain reguler 10%, rombongan 7%, takeaway 0%.
- Alasan menolak terbanyak: **booking tidak bisa dibatalkan/dijadwal ulang** (38), **ribet daftar Google** (32),
  **lebih suka langsung datang** (12).
- Yang paling sering bisa mengubah pikiran: **jadwal ulang sekali atau kredit** (56 dari 90 penolak),
  **masuk cukup nomor HP + OTP** (29), **pesan makanan tanpa daftar** (25 — padahal aplikasi memang sudah
  begitu; pitch-nya yang membuat salah paham).
- Harga meja malam Rp 39.000 diterima: tidak ada yang menganggapnya terlalu mahal.
- **Satu perubahan pertama:** izinkan jadwal ulang satu kali sampai beberapa jam sebelum main.
