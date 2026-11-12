# Panel 100 Pembeli — SPL Sports Pool Lounge & Smokehouse

Tanggal: 8 November 2026 · Metode: founder-consumer (github.com/Jakeschincariol/founder-skill), dijalankan manual
Profil: [../customer.json](../customer.json) (draf dari PRD, belum dari data pelanggan asli) · Pitch: [../pitch.md](../pitch.md)
Data mentah: `answers/001.json` … `answers/100.json` · Hitungan: `node founder/panel/hitung.mjs` → `results.json`

> **Cara membaca angka ini.** Pembeli di panel ini adalah persona buatan AI, bukan pelanggan sungguhan.
> Model AI cenderung terlalu setuju, jadi persentase "mau" adalah **batas atas**. Kutipan di bawah adalah
> suara persona, **bukan testimoni**. Keputusan besar tetap perlu dicek ke pelanggan asli.

## Angka utama

**10 dari 100** pembeli akan memakai aplikasi dalam bulan pertama (rata-rata 1,6 kali per orang yang mau).

| Segmen | Pembeli | Mau | % |
|---|---|---|---|
| Keluarga & makan Smokehouse | 30 | 5 | 17% |
| Pemain reguler | 40 | 4 | 10% |
| Rombongan & kantor | 15 | 1 | 7% |
| Takeaway pekerja sekitar | 15 | 0 | 0% |

Semua yang mau memberi alasan "praktis". **Kesepuluhnya tetap menyebut keberatan yang sama**: booking yang
sudah dibayar tidak bisa dibatalkan atau dijadwal ulang.

## Tiga alasan utama menolak (90 orang)

1. **Tidak bisa batal atau jadwal ulang — 38 orang.**
   "Aku biasanya yang bayarin satu kelompok, dan kalau teman-teman molor atau batal, uangku hangus."
2. **Ribet daftar dengan Google — 32 orang.**
   "Aku nggak ingat Gmail-ku yang mana… mending langsung datang aja."
3. **Lebih suka langsung datang — 12 orang.**
   "Biasanya aku tanya kasir lewat WA lalu langsung datang, jarang penuh juga kalau malam biasa."

## Yang paling sering bisa mengubah "tidak" jadi "mau"

| Permintaan | Disebut oleh (dari 90 penolak) |
|---|---|
| Boleh **jadwal ulang sekali** / batal beberapa jam sebelumnya / uang jadi **kredit** | 56 |
| Masuk cukup dengan **nomor HP + kode OTP**, tanpa Google | 29 |
| **Pesan makanan tanpa daftar akun**, bayar di kasir | 25 |
| **Toleransi telat** lebih longgar dari 20 menit (mis. 30 menit) | 23 |
| Bayar di tempat / DP sebagian | 18 |
| Tetap ada **WhatsApp kasir** untuk bertanya | 11 |
| Jaminan uang kembali kalau meja ternyata tidak tersedia | 10 |
| Bukti meja malam sering penuh / ulasan teman | 10 |
| Booking 2–3 meja sekaligus untuk rombongan | 9 |

### Temuan penting: salah paham soal pesan makanan
21 penolak dari segmen Keluarga (14) dan Takeaway (7) mengira **pesan makanan wajib daftar akun Google**.
Di aplikasi sebenarnya **tidak**: hanya booking meja yang wajib member; pesan dari meja dan takeaway cukup nama
(takeaway + nomor HP), bisa bayar di kasir. Pitch-nya yang membuat salah paham karena kalimat "Masuk sekali dengan
akun Google" tidak menyebut bahwa itu hanya untuk booking meja. Ini sebab utama segmen Takeaway 0%.

## Harga meja reguler malam (median jawaban, per jam)

| Terlalu murah (ragu kualitas) | Murah, menguntungkan | Mulai mahal, masih dipertimbangkan | Terlalu mahal |
|---|---|---|---|
| Rp 20.000 | Rp 30.000 | Rp 45.000 | Rp 60.000 |

Tarif sekarang **Rp 39.000** berada di antara "menguntungkan" dan "mulai mahal". **Tidak ada satu pun** pembeli yang
menganggap Rp 39.000 terlalu mahal. Harga bukan penghalang; aturan booking-lah penghalangnya.

## Satu perubahan yang dikerjakan lebih dulu

**Izinkan jadwal ulang satu kali, sampai beberapa jam sebelum main (atau uang jadi kredit main berikutnya).**
Ini disebut 56 dari 90 penolak dan juga oleh kesepuluh pembeli yang mau. Ini keputusan kebijakan uang, jadi
pemilik yang menentukan batas jamnya (mis. 3 jam sebelum main).

Perbaikan murah yang bisa langsung jalan sambil menunggu keputusan itu:
1. Di halaman depan dan pesan promosi, tulis jelas: **"Pesan makanan & takeaway tanpa daftar akun"** dan
   **"Akun Google hanya untuk booking meja."**
2. Tampilkan tombol **WhatsApp kasir** di halaman booking untuk rombongan dan pertanyaan.

## Langkah berikut: uji ke pelanggan sungguhan
Sesuai tahap founder-launch: sebelum mengubah kebijakan, coba ke pelanggan nyata selama dua minggu, misalnya
tawarkan "jadwal ulang sekali gratis" ke pelanggan yang booking lewat aplikasi, dan targetkan **30 booking
aplikasi dalam 14 hari**. Kalau angka nyata jauh di bawah panel, percayai angka nyata.
