# Aplikasi Android SPL

## Cara membuat APK

Dua aplikasi, satu proyek Android:

```bash
VITE_MODE_TAMU=1 WEB_OUT=web-tamu npm run app   # situs tamu
npm run apk                                     # release/SPL-Tamu-debug.apk

npm run app                                     # situs kasir
npm run apk:kasir                               # release/SPL-Kasir-debug.apk
```

| | ID paket | Nama | Memuat |
|---|---|---|---|
| Tamu | `id.spl.tamu` | SPL Sports Pool Lounge | spl-tamu.pages.dev |
| Kasir | `id.spl.kasir` | SPL Kasir | spl-kasir.pages.dev |

ID paketnya berbeda, jadi keduanya bisa terpasang berdampingan di satu HP.
`applicationId`, nama aplikasi, dan alamat situsnya ditimpa di folder kerja —
`android/` di repo tetap satu dan tidak perlu digandakan.

**Kasir di Android tidak bisa mencetak struk tanpa dialog.** Cetak senyap hanya
ada di aplikasi Windows (Electron); di WebView Android tombol Cetak Struk
praktis tidak berguna. Pakai APK kasir untuk memantau papan, buka/tutup meja,
dan menunjukkan QRIS — bukan untuk mencetak.

Yang dipakai: Java bawaan Android Studio (JBR) dan Android SDK di lokasi
bawaannya. Tidak perlu memasang JDK terpisah. Kalau letaknya berbeda, set
`JAVA_HOME` / `ANDROID_HOME` sebelum menjalankan.

## Dua hal yang perlu diketahui

**1. Proyek dibangun di folder lain.** Nama folder proyek ini mengandung spasi
(`aplikasi booking bliard`), dan Android Gradle Plugin gagal dengan
`java.io.IOException: Invalid file path` kalau jalurnya berspasi. Karena itu
`scripts/apk-tamu.mjs` menyalin folder `android/` ke
`%LOCALAPPDATA%\spl-android` dulu, membangun di sana, lalu membawa APK-nya
kembali ke `release/`.

**2. Isi aplikasi diambil dari situs, bukan dari dalam APK.**
`capacitor.config.json` mengarahkan `server.url` ke `https://spl-tamu.pages.dev`.

Untungnya:
* Masuk dengan Google tetap jalan. Kalau isi dijalankan dari dalam APK,
  alamatnya jadi `https://localhost` dan Google/Supabase menolak pengalihan
  baliknya — tamu tidak bisa masuk pakai Gmail.
* Perbaikan cukup `npm run terbitkan`. Tamu tidak perlu memasang ulang APK.

Konsekuensinya: aplikasi butuh internet untuk dibuka. Itu memang sudah
begitu — semua data (ketersediaan meja, harga, booking) ada di server.

Kalau nanti mau aplikasi yang berdiri sendiri, hapus blok `server` di
`capacitor.config.json`, lalu daftarkan `https://localhost` sebagai alamat
pengalihan yang diizinkan di Supabase **Authentication → URL Configuration**
dan di Google Cloud Console, kalau tidak masuk dengan Google akan gagal.

## Tanda tangan

APK sekarang memakai **kunci debug** — cukup untuk dipasang langsung di HP
(“izinkan pasang dari sumber ini”), tapi TIDAK bisa naik Play Store.

Untuk rilis nanti perlu keystore sendiri. Kunci itu harus disimpan baik-baik:
hilang berarti aplikasi yang sudah beredar tidak bisa diperbarui lagi, selamanya.

## Identitas aplikasi

| | |
|---|---|
| ID paket | `id.spl.tamu` |
| Nama | SPL Sports Pool Lounge |
| Ikon & splash | dibuat dari `public/spl-mark.png` oleh `@capacitor/assets` |
| minSdk | 22 (Android 5.1) · target 34 |
