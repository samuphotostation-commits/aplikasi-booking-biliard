# Pemberitahuan WhatsApp ke tamu

## Yang sudah jalan tanpa berlangganan apa pun

Pesan dibuat **di server**, bukan di aplikasi kasir — jadi tetap terbuat walau
tidak ada satu pun perangkat kasir yang menyala:

| Kapan | Isi |
|---|---|
| Booking tamu LUNAS | kode booking, kode check-in, meja, jam mulai |
| Sehari sebelum main (cron 10.00 WIB) | pengingat jam & kode check-in |
| Blast promo | teks bebas dari layar kasir, hanya ke member yang menyetujui |

Semuanya masuk antrean `pesan_keluar` dan muncul di tab **Pesan** di panel
kasir. Sekali ketuk "Buka WhatsApp" → WhatsApp terbuka dengan nomor dan teks
sudah terisi, tinggal tekan kirim, lalu "Tandai terkirim".

## Menyalakan pengiriman otomatis

Kalau pemilik berlangganan gerbang WhatsApp (Fonnte, Wablas, Qontak, dsb.),
isi tiga secret di **Supabase → Edge Functions → Secrets**:

| Secret | Isi |
|---|---|
| `WA_URL` | alamat kirim pesan milik penyedia |
| `WA_TOKEN` | kunci penyedia (dikirim di header `Authorization`) |
| `WA_BODY` | *opsional*. Cetakan badan JSON; `{hp}` dan `{teks}` diganti isi pesannya. Bawaannya mengikuti Fonnte: `{"target":"{hp}","message":"{teks}"}` |

Begitu `WA_URL` terisi, cron `spl-pesan` menghabiskan antrean tiap menit.
**Tidak ada yang perlu diubah di aplikasi** — layar Pesan otomatis berubah
fungsi jadi riwayat, dan yang gagal kirim tetap kelihatan lengkap dengan
alasannya supaya bisa dikirim manual.

Batas aman yang sudah terpasang: 20 pesan per menit, dan satu pesan berhenti
dicoba sesudah 3 kali gagal supaya kuota penyedia tidak terkuras.

## Kenapa antrean, bukan kirim langsung

Gerbang WhatsApp itu layanan berbayar yang belum tentu ada. Dengan antrean,
fiturnya berguna sejak hari pertama dan **tidak ada pesan yang hilang** saat
gerbangnya mati, kuotanya habis, atau nomornya belum terdaftar.

## Perlindungan data (UU PDP)

* Tabel `pesan_keluar` tidak bisa dibaca aplikasi tamu sama sekali; semua
  pintunya menuntut token staf.
* Blast promo **hanya** ke member dengan `setuju_promo = true`, dan hanya boleh
  dijalankan superadmin. Yang menegakkan servernya, bukan layar.
* Satu kejadian = satu pesan (indeks unik `jenis + ref + nomor`), jadi cron yang
  berjalan berulang tidak akan membanjiri tamu.
