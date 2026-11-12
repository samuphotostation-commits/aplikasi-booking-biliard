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

### Langkah 3 — buat kunci alat (2 menit)

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

**Mengubah pengaturan nanti:** buka halaman alat → **Pengaturan**, atau tahan
tombol **BOOT** 3 detik saat alat menyala untuk memunculkan hotspot lagi.

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

## 7. Berkas yang terkait

| Berkas | Isi |
|---|---|
| `supabase/schema-lampu.sql` | tabel + fungsi di server |
| `supabase/functions/_sumber/terbit.ts` | tempat status lampu dihitung & diterbitkan |
| `perangkat/lampu-esp32/lampu-esp32.ino` | firmware ESP32-S3 |
| `src/lib/lightController.ts` | catatan rancangan di sisi aplikasi |
| `src/lib/lampuAlat.ts` | denyut nadi alat untuk panel kasir |
| `src/screens/admin/Pengaturan.tsx` | Atur → Lampu meja (kunci alat) |
| `src/screens/admin/Board.tsx` | tanda online di papan meja |
