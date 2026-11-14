# Panduan pasang — lampu meja biliar lewat ESP32-S3

Menghubungkan tombol lampu di aplikasi kasir dengan lampu meja yang
sebenarnya. Dua board ESP32-S3 yang sudah terpasang di panel **tidak perlu
dibongkar** — kabel dan pin-nya sama persis dengan firmware lama. Yang
diganti hanya isi programnya.

Waktu kerja: sekitar 45 menit, sekali saja.

---

## 1. Apa yang berubah dari firmware lama, dan kenapa

Firmware lama (`firmware-app-billiard.ino`) **menunggu diperintah**: panel
kasir harus menembak `http://10.151.57.203/lampu/T01`. Susunan itu terlihat
paling sederhana, tetapi tidak bisa bekerja di venue ini karena tiga hal:

1. **Browser memblokirnya.** Panel kasir dibuka lewat `https://`. Permintaan
   `http://` polos dari halaman `https://` diblokir browser — diam-diam,
   tanpa pesan apa pun ke kasir. Lampu tidak menyala dan tidak ada yang tahu
   kenapa. Ini bukan hal yang bisa "dicoba lagi"; browser memang tidak akan
   pernah mengirimnya.
2. **Hanya satu jaringan.** HP manajer di jaringan seluler tidak akan pernah
   bisa menyalakan lampu.
3. **Perintah sekali lewat.** Kalau ESP32 mati listrik, ia menyala lagi
   dengan semua relay OFF. Perintah "nyalakan T07" sudah lewat sejam lalu dan
   tidak pernah diulang — tamu main dalam gelap sampai kasir sadar.

Firmware baru **menarik**, bukan ditembak:

```
kasir / HP manajer / tablet
        │  aksi: buka meja, check-in, tombol lampu, tutup tab
        ▼
   venue_events (jejak kejadian)
        │  trigger
        ▼
   Edge Function `terbit`  ──▶  lampu_state   (status lampu tiap meja)
                                      │
            ESP32-S3 menanyakan tiap ±1 detik lewat HTTPS
                                      ▼
                                 SSR → lampu meja 220V
```

Akibatnya:

| | Firmware lama | Firmware baru |
|---|---|---|
| Kasir HTTPS | diblokir browser | jalan |
| HP manajer di luar venue | tidak bisa | bisa |
| ESP32 habis mati listrik | semua lampu mati | pulih sendiri < 1 detik |
| Internet putus | lampu tetap (sudah benar) | lampu tetap |
| Perlu IP statis / port forward | ya | tidak |
| Password Wi-Fi di dalam kode | ya | tidak, diisi di alat |
| Library tambahan | ArduinoJson | tidak ada |

Status lampu sekarang **kesimpulan mesin dari jejak kejadian**, bukan
perintah dari satu perangkat — sama seperti angka di papan dan di rekap.
Karena itu diterbitkan server, dan tetap benar walau tidak ada satu pun
tablet kasir yang terbuka.

---

## 2. Urutan pemasangan

Kerjakan berurutan. Langkah 1–3 bisa dari rumah; langkah 4 harus di venue.

### Langkah 1 — pasang bagian server (5 menit)

1. Buka Supabase → project venue → **SQL Editor**.
2. Tempel seluruh isi `supabase/schema-lampu.sql`, lalu **Run**.
3. Pastikan tidak ada pesan merah. Berkas ini aman dijalankan berulang.

### Langkah 2 — pasang ulang Edge Function `terbit` (5 menit)

Fungsi inilah yang mengisi status lampu. Tanpa langkah ini, tabelnya ada
tapi selalu kosong.

```bash
node scripts/bundel-terbit.mjs terbit
```

Lalu tempel isi `supabase/functions/terbit/index.ts` ke Supabase →
**Edge Functions** → `terbit` → Deploy. **JWT dimatikan** (seperti sebelumnya).

Periksa hasilnya — buka panel kasir, tekan "Nyalakan semua", lalu di SQL
Editor jalankan:

```sql
select versi, updated_at, data from public.lampu_state;
```

`versi` harus bertambah dan `data` berisi `{"T01": true, ...}`.

### Langkah 3 — buat kunci alat (2 menit) — SUDAH DIKERJAKAN

> **Sudah terpasang 13 Nov 2026.** Kunci alat venue ini sudah dibuat dan
> hash-nya tersimpan di server. Kuncinya ada di catatan serah terima; kalau
> hilang, buat yang baru lewat langkah di bawah dan masukkan ulang ke kedua
> board. Langkah ini hanya perlu diulang kalau kuncinya diganti.



Di panel kasir (masuk sebagai pemilik/superadmin):

**Atur → Lampu meja — alat relay di venue → Buat kunci baru → Pasang kunci ini di server**

**Salin kuncinya sekarang.** Setelah halaman ditutup, kunci itu tidak bisa
dilihat lagi — server hanya menyimpan sidik jarinya. Kunci yang hilang bukan
bencana: tinggal buat yang baru, tetapi harus dimasukkan ulang ke tiap alat.

Simpan sementara di catatan HP; nanti diketik ke dua board.

### Langkah 4 — upload firmware ke kedua board (20 menit)

Siapkan Arduino IDE:

1. **File → Preferences → Additional boards manager URLs**, tambahkan:
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
2. **Tools → Board → Boards Manager** → pasang **esp32 by Espressif Systems** (versi 3.x).
3. **Tools → Board** → **ESP32S3 Dev Module**.
4. **Tidak ada library yang perlu dipasang.** ArduinoJson tidak dipakai lagi.
5. Pengaturan: Upload Speed `921600`, Flash Mode `QIO 80MHz`,
   USB CDC On Boot `Enabled`.

Lalu untuk **masing-masing** board:

1. Buka `perangkat/lampu-esp32/lampu-esp32.ino`.
2. Sambungkan board lewat USB-C, pilih port-nya, tekan **Upload**.
   Kalau port tidak muncul: tahan **BOOT**, tekan **RESET** sebentar,
   lepas **BOOT**, lalu upload.
3. Sesudah upload, alat membuka hotspot sendiri:
   - **Nama:** `SPL-Lampu-XXXX`
   - **Sandi:** `pasanglampu`
4. Sambungkan HP/laptop ke hotspot itu, buka **http://192.168.4.1**
5. Isi:

   | Kolom | Isi |
   |---|---|
   | Nama Wi-Fi venue | nama Wi-Fi biliar |
   | Password Wi-Fi | password-nya |
   | Alamat Supabase | `https://fhoxdsxabpohafilqxoz.supabase.co` |
   | Anon key Supabase | anon key project venue (Settings → API) |
   | Kunci alat | kunci dari langkah 3 |
   | Nomor board | **1** untuk board T01–T16, **2** untuk board T17–T30/VIP |
   | Nama alat | `board1` / `board2` (bebas, muncul di panel kasir) |
   | Jenis relay | Aktif LOW (modul yang terpasang sekarang) |

6. **Simpan & nyalakan ulang.**

**Tidak ada lagi `#define BOARD_ID`.** Satu berkas yang sama diupload ke dua
board; yang membedakan hanya pilihan "Nomor board" di halaman pengaturan.
Jadi tidak mungkin lagi salah upload firmware board 2 ke board 1.

### Langkah 5 — periksa (10 menit)

1. Di panel kasir, buka papan meja. Di sebelah tombol lampu harus muncul
   tanda hijau **"alat online (2)"**.
2. Tekan **Nyalakan semua**. Lampu harus menyala dalam 1–3 detik.
3. Tekan **Matikan semua**. Lampu harus padam.
4. Buka satu meja lewat walk-in. Hanya lampu meja itu yang menyala.
5. Cabut kabel LAN/matikan Wi-Fi sebentar. **Lampu harus tetap menyala** —
   kalau padam, firmware-nya salah upload.
6. Cabut listrik satu ESP32 saat ada lampu menyala, pasang lagi.
   Lampu harus kembali menyala sendiri dalam beberapa detik.

---

## 3. Peta pin — tidak berubah dari firmware lama

### Board 1 — 16 kanal

| Meja | GPIO | | Meja | GPIO |
|---|---|---|---|---|
| T01 | 4 | | T09 | 42 |
| T02 | 5 | | T10 | 41 |
| T03 | 6 | | T11 | 40 |
| T04 | 7 | | T12 | 39 |
| T05 | 15 | | T13 | 38 |
| T06 | 16 | | T14 | 37 |
| T07 | 17 | | T15 | 36 |
| T08 | 18 | | T16 | 35 |

### Board 2 — 19 kanal

| Meja | GPIO | | Meja | GPIO |
|---|---|---|---|---|
| T17 | 4 | | T25 | 42 |
| T18 | 5 | | T26 | 41 |
| T19 | 6 | | T27 | 40 |
| T20 | 7 | | T28 | 39 |
| T21 | 15 | | T29 | 38 |
| T22 | 16 | | T30 | 37 |
| T23 | 17 | | V01 | 36 |
| T24 | 18 | | V02 | 35 |
| | | | V03 | 9 |
| | | | V04 | 10 |
| | | | T35 | 11 |

**Meja yang belum terpasang:** T31–T34 dan T36–T40 belum punya relay. Kalau
nanti dipasang, **tidak perlu upload ulang** — cukup isi kolom
**"Peta tambahan"** di halaman pengaturan alat, misalnya:

```
T31=12,T32=13,T33=14,T34=21
```

GPIO yang aman dipakai di ESP32-S3: **1–18, 21, 35–45**.
Jangan pakai 0 (tombol BOOT), 19/20 (USB), 26–32 (flash/PSRAM),
43/44 (dipakai Serial Monitor).

---

## 4. Membuka halaman alat sehari-hari

Sesudah tersambung ke Wi-Fi venue, halaman alat bisa dibuka dari jaringan
yang sama:

- Board 1: **http://lampu-spl1.local**
- Board 2: **http://lampu-spl2.local**

Kalau `.local` tidak jalan di jaringan itu, pakai IP yang tertulis di Serial
Monitor Arduino IDE saat alat menyala.

Halaman itu menampilkan tiap meja, GPIO-nya, nyala/mati, versi status, dan
kapan terakhir berhasil menghubungi server. Berguna saat mencari gangguan.

**Mengubah pengaturan nanti:** buka halaman alat → **Pengaturan**. Dari
jaringan venue, menyimpan perubahan **menuntut kunci alat** diketik ulang di
kolom "Kunci alat sekarang" — tanpa itu tidak ada yang berubah. Ini bukan
basa-basi: Wi-Fi venue juga dipakai tamu, dan tanpa penjaga itu siapa pun
yang menebak IP alat bisa mengarahkannya ke server lain.

Lupa kuncinya? Tahan tombol **BOOT** 3 detik kapan saja (tanpa menekan RESET) — hotspot
pengaturan terbuka tanpa kunci, karena di situ memang butuh akses fisik ke
panel.

**Menguji satu relay** tanpa menyentuh aplikasi (untuk teknisi saat memasang
kabel):

```
http://lampu-spl1.local/uji?kunci=KUNCI_ALAT&meja=T05&on=1
```

Server akan mengoreksinya dalam sedetik — ini memang hanya untuk memastikan
kabelnya benar, bukan cara mengendalikan lampu.

---

## 5. Kalau ada yang tidak beres

| Yang terlihat | Artinya | Yang dilakukan |
|---|---|---|
| Panel: **"kunci alat belum dipasang"** | Langkah 3 belum dikerjakan | Atur → Lampu meja → Buat kunci baru → Pasang |
| Panel: **"status alat tidak diketahui"** | `schema-lampu.sql` belum dijalankan, atau sesi PIN habis | Ulangi langkah 1; kalau sudah, masuk ulang dengan PIN |
| Panel: **"belum ada alat yang pernah terhubung"** | Server siap, alat belum pernah menghubunginya | Periksa Wi-Fi & kunci di halaman alat |
| Panel: **"1 dari 2 alat online"** | Satu board mati/kehilangan Wi-Fi | Cek listrik panel & sinyal Wi-Fi board itu |
| Panel: **"alat mati — terakhir terlihat 21.07"** | Dua-duanya diam sejak jam itu | Cocokkan dengan jam mati listrik / ganti password Wi-Fi |
| Halaman alat: **"server menjawab 401/403"** | Kunci alat salah atau sudah diganti | Masukkan ulang kunci terbaru di halaman alat |
| Halaman alat: **"server menjawab 404"** | `lampu_sinkron` belum ada di server | Ulangi langkah 1 |
| Lampu tidak berubah, tapi panel bilang online | Kabel/SSR, atau peta pin tidak cocok | Uji lewat `/uji?...` per meja |
| Semua lampu berkedip tiap alat restart | Jenis relay salah pilih | Ganti "Jenis relay" di halaman alat |
| Lampu padam saat internet putus | Firmware lama masih terpasang | Upload ulang firmware baru |

**Yang TIDAK boleh terjadi, dan memang dicegah firmware:** lampu padam
sendiri karena internet putus. Saat alat tidak bisa menghubungi server, ia
mempertahankan keadaan terakhir dan terus mencoba. Tidak ada satu pun jalur
di firmware yang mematikan relay karena kegagalan jaringan.

---

## 6. Keamanan

- ESP32 **hanya bisa membaca** status lampu. Satu-satunya fungsi yang boleh
  dipanggilnya adalah `lampu_sinkron`, dan yang keluar dari sana cuma baris
  seperti `T01=1`. Tidak ada jalan baginya menulis jejak venue, membaca nama
  atau nomor HP tamu, atau melihat angka uang.
- Kunci alat disimpan sebagai hash di server. Bocornya isi database tidak
  memberi orang kunci alat.
- Selama kunci belum dipasang, **tidak ada** alat yang bisa membaca apa pun
  (gagal tertutup) — bukan "semua boleh".
- Sertifikat HTTPS server tidak diperiksa alat (`setInsecure`). ESP32 tidak
  punya jam yang benar sebelum tersambung dan daftar CA-nya tidak pernah
  diperbarui. Yang lewat jalur ini hanya "meja mana yang lampunya menyala",
  jadi risikonya kecil dan disengaja.
- Password Wi-Fi tidak ada di dalam kode dan tidak ikut masuk ke repositori.
  Tersimpan di alatnya sendiri.

---

## 7. Apa yang sudah diuji, dan apa yang belum

Jujur soal ini penting: lampu menggantung di atas kepala tamu.

**Sudah diuji otomatis (`npm test`):**

| Uji | Isi |
|---|---|
| `test/lampu.test.ts` | panel kasir membedakan "alat mati" dari "tidak tahu" (18 pemeriksaan) |
| `test/lampu-firmware.test.ts` | perilaku firmware menerjemahkan jawaban server jadi relay (34) |
| `test/lampu-terbit.test.ts` | fungsi `terbit` yang asli menghitung peta lampu dari jejak (19) |

Yang dijaga uji-uji itu, antara lain: buka meja menyalakan lampunya; tombol
"nyalakan semua" mengenai 44 meja dan **tidak satu pun meja resto**; jawaban
server yang kosong, rusak, atau terpotong **tidak pernah memadamkan lampu**;
mati listrik memulihkan keadaan; dan peta pin di `.ino` tidak punya GPIO
kembar, tidak memakai pin terlarang ESP32-S3, dan setiap mejanya memang ada
di denah aplikasi.

Peta pin dibaca uji **langsung dari berkas `.ino`**, jadi kalau teknisi
memindahkan satu meja ke GPIO lain, uji ikut berubah.

**Sudah diuji lewat jaringan sungguhan:** header dan kunci yang dipakai
firmware diterima server Supabase (PostgREST menjawab dengan galat fungsi,
bukan menolak kuncinya).

**Sudah diuji di server venue yang sebenarnya (13 Nov 2026):**

- `schema-lampu.sql` dijalankan di project `spl-venue` — **Success, tanpa galat**.
- `lampu_sinkron` dipanggil dengan kunci salah → `401 kunci alat salah`.
  Dipanggil sebelum kunci dipasang → `401 kunci alat belum dipasang`.
  **Gagal tertutup bekerja.**
- Dipanggil dengan kunci benar → `200` dan badan `"v=0"`; panggilan kedua
  dengan versi yang sama → `"v=0\nsama=1"`. Jalur hemat kuota bekerja.
- Denyut nadi tercatat di `lampu_alat`: nama alat, IP, RSSI, versi firmware,
  jumlah relay, dan jamnya. Indikator online di panel kasir akan terisi.

**SATU CACAT BESAR DITEMUKAN DI UJI INI, dan sudah diperbaiki:** firmware
semula meminta `Accept: text/plain`, dan PostgREST di Supabase menolaknya
dengan `406 None of these media types are available: text/plain`. Kalau tidak
ketahuan sebelum alat dipasang, **tidak satu lampu pun akan pernah menyala**,
dan gejalanya di panel kasir cuma "alat mati" — teknisi akan membongkar kabel
yang sebenarnya tidak apa-apa. Firmware sekarang memakai
`Accept: application/json` dan mengupas bungkus string JSON-nya.

**BELUM diuji:**

- Firmware **belum pernah dikompilasi**. Script `scripts/kompilasi-lampu.ps1`
  sudah siap, tapi unduhan core ESP32 dari GitHub di koneksi ini selalu
  diputus di tengah jalan (lewat IPv6 NAT64). Jalankan di koneksi lain:

  ```
  powershell -ExecutionPolicy Bypass -File scripts\kompilasi-lampu.ps1
  ```

  Hasilnya tercatat di `release/kompilasi-lampu.log`.
- **Belum diuji di alat sungguhan.** Relay, SSR, dan kabel 220V hanya bisa
  dibuktikan di tempat — daftar periksanya ada di Langkah 5.
- **Edge Function `terbit` belum dipasang ulang.** Selama belum,
  `lampu_state.data` tetap `{}` dan alat menerima `v=0` tanpa satu meja pun —
  artinya lampu tidak akan menyala walau semuanya yang lain sudah benar.
  Ini langkah yang tersisa, dan Langkah 2 menjelaskannya.

## 8. Berkas yang terkait

| Berkas | Isi |
|---|---|
| `supabase/schema-lampu.sql` | tabel + fungsi di server |
| `supabase/functions/_sumber/terbit.ts` | tempat status lampu dihitung & diterbitkan |
| `perangkat/lampu-esp32/lampu-esp32.ino` | firmware ESP32-S3 |
| `src/lib/lightController.ts` | catatan rancangan di sisi aplikasi |
| `src/lib/lampuAlat.ts` | denyut nadi alat untuk panel kasir |
| `src/screens/admin/Pengaturan.tsx` | Atur → Lampu meja (kunci alat) |
| `src/screens/admin/Board.tsx` | tanda online di papan meja |
| `scripts/kompilasi-lampu.ps1` | pasang core ESP32 lalu kompilasi firmware |
| `test/lampu*.test.ts` | uji otomatis, ikut `npm test` |
