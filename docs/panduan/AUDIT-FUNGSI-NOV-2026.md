# Audit fungsi aplikasi SPL

Tanggal: 7 November 2026. Dikerjakan pada aplikasi mode uji lokal dengan data contoh, jadi data asli tidak tersentuh. Halaman publik `sportspoollounge.com` dan layar masuk `kasir.sportspoollounge.com` hanya dibuka untuk dibaca.

## Hasil singkat

Alur utama berjalan dari awal sampai akhir tanpa error. Ada 3 masalah yang bisa membuat uang atau akses salah, dan 5 hal kecil. Masalah 1, 2, 3, dan 6 sudah diperbaiki di kode pada 7 November 2026 dan lolos semua pengaman. Perbaikan belum diterbitkan ke alamat resmi.

Aturan void dan PIN mulai berlaku di mesin pada 8 November 2026 pukul 05.00, supaya catatan lama tidak berubah. Kalau penerbitan terjadi sesudah tanggal itu, majukan tanggal `VOID_MENAHAN_BAYAR` dan `PIN_EMPAT_ANGKA` di `src/lib/engine.ts` sebelum menerbitkan.

## Yang sudah dicoba dan berjalan

| Peran | Alur |
|---|---|
| Tamu | Booking sampai kode check-in, pesan dari QR meja, takeaway, reservasi Smokehouse sampai layar isi data, Pesanan Saya |
| Kasir | Buka shift, open bill, paket per jam, pesan menu, cek bill, bayar per orang (dibuka), tutup tab dengan kembalian, pesan tanpa meja, ajukan void, hitung selisih saat tutup shift |
| Dapur dan pramusaji | Orderan diterima, Orderan ready, Sudah diantar |
| Manager | Setujui void, koreksi jam meteran, diskon manual, promo, jejak, serah terima shift (pesan peringatan) |
| Pemilik | Rekap, laporan stok, tarif, PPN, paket, meja, akun staf, pindah venue |

Akses tiap peran dibaca dari kode (`src/data/staff.ts`, `AdminShell.tsx`). Tab Kru Kasir dicoba langsung. Peran Manager, Finance, Gudang, Kitchen, dan Bar belum dicoba dengan akun terpisah.

## Masalah yang perlu diperbaiki

| No | Tingkat | Masalah | Dampak | Saran |
|---|---|---|---|---|
| 1 | Tinggi, **sudah diperbaiki** | Tab bisa ditutup saat void masih menunggu. Saat manager menekan Setujui, sistem menolak dan layar menulis "Void ditolak" | Tamu sudah membayar barang yang seharusnya batal, dan manager mengira tombolnya rusak | Tutup Tab dan Bayar Sebagian ditahan sampai void diputuskan. Kasir bisa menekan Tarik pengajuan kalau manager belum bisa dihubungi |
| 2 | Tinggi, **sudah diperbaiki** | Menekan metode pembayaran langsung menutup tab tanpa konfirmasi | Salah tekan Tunai padahal QRIS membuat laporan dan kas salah | Ada layar konfirmasi untuk tutup tab, bayar sebagian, dan takeaway. Sesudah dikonfirmasi, metode tetap belum bisa dikoreksi |
| 3 | Tinggi, **sudah diperbaiki** | Form akun menerima PIN 4 sampai 6 angka, tapi keypad masuk berhenti di 4 angka | Staf dengan PIN 5 atau 6 angka tidak bisa masuk memakai PIN | PIN baru wajib 4 angka. Akun lama yang PIN-nya lebih panjang diberi peringatan di Atur |
| 4 | Sedang | Bill Sementara menulis "Dibayar 60.000" dan "Pembayaran sudah tercatat", padahal belum dibayar | Membingungkan tamu dan kasir | Sembunyikan baris itu pada bill sementara |
| 5 | Rendah | Rincian meteran menulis "19.00 · 30 mnt" untuk meja yang mulai 19.30, dan baris "20.00 · 0 mnt Rp 50" | Rincian terlihat aneh, total tetap benar | Rapikan tampilan rincian |
| 6 | Rendah, **sudah diperbaiki** | Form void menulis "diajukan ke superadmin", padahal manager juga bisa menyetujui | Istilah tidak konsisten | Teks diganti jadi manager atau pemilik |
| 7 | Rendah | Salah ketik "strukmya" di layar Shift. Peringatan teknis React muncul di halaman Reservasi | Kecil, tidak mengganggu pemakaian | Rapikan saat perbaikan berikutnya |
| 8 | Rendah | `docs/CARA-PAKAI.md` sudah tertinggal, misalnya masih 30 meja reguler dan reservasi belum wajib memilih hidangan | Bisa menyesatkan kalau dipakai sebagai acuan | Perbarui, atau jadikan buku panduan ini acuan utama |

## Belum bisa dipastikan

| Hal | Alasan | Cara memastikan |
|---|---|---|
| QRIS online dan QRIS dinamis | Perlu transaksi sungguhan dan status gateway asli | Tekan Atur, QRIS, Uji koneksi Rp 1.000 |
| Masuk Google staf dan member | Tidak dicoba memakai akun asli | Satu staf dan satu member uji |
| Absen selfie | Perlu server dan kamera | Coba di HP staf |
| Tab Pelanggan dan Blast Promo | Perlu server | Buka dengan akun manager |
| Printer dapur otomatis | Perlu aplikasi Windows versi baru dan printer termal | Dipasang saat pembaruan aplikasi Windows |
| Pesan WhatsApp | Perlu data server | Satu booking uji |
| Internet putus | Diambil dari catatan dan kode, tidak diuji dengan memutus jaringan | Latihan saat pelatihan kasir |
| Kedipan tampilan di iPhone | Perlu iPhone asli | Coba di HP Anda |

## Catatan lain

- Lampu meja di Papan masih simulasi. Tombolnya tidak tersambung ke lampu fisik (`src/lib/lightController.ts`).
- Buku panduan sudah mengikuti perbaikan nomor 1, 2, 3, dan 6. Staf baru melihat perilaku ini setelah versi baru diterbitkan.
- Server masih menerima PIN 4 sampai 6 angka (`supabase/schema-staf.sql`). Aplikasi sudah menolak lebih dulu, jadi SQL tidak perlu dijalankan ulang.
