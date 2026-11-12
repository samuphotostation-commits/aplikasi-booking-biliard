# Alat lampu meja biliar — ESP32-S3

Firmware untuk dua board ESP32-S3 yang menyalakan lampu meja biliar
mengikuti apa yang terjadi di aplikasi kasir.

- **Firmware:** `lampu-esp32.ino` — buka langsung di Arduino IDE.
- **Panduan pasang lengkap:** [`../../docs/PANDUAN-LAMPU-ESP32.md`](../../docs/PANDUAN-LAMPU-ESP32.md)
- **Bagian server:** `../../supabase/schema-lampu.sql`

## Ringkas

```
kasir / HP manajer / tablet
        │  aksi (buka meja, check-in, tombol lampu, tutup tab)
        ▼
   venue_events ──▶ Edge Function `terbit` ──▶ lampu_state
                                                   │
                     ESP32 menarik tiap ±1 detik (HTTPS)
                                                   ▼
                                              SSR → lampu
```

Alat **menarik**, tidak ditembak. Artinya: tidak perlu IP statis, tidak
perlu port forwarding, tidak kena blokir mixed-content browser, dan bisa
dikendalikan dari HP di luar venue.

## Yang perlu diingat

- **Satu berkas untuk kedua board.** Nomor board dipilih di halaman
  pengaturan alat, bukan di `#define`.
- **Tidak ada library tambahan.** Hanya yang bawaan core ESP32.
- **Password Wi-Fi tidak ada di dalam kode.** Diisi lewat halaman
  pengaturan dan tersimpan di alatnya.
- **Internet putus → lampu tetap menyala.** Tidak ada satu pun jalur di
  firmware yang mematikan relay karena kegagalan jaringan.
- **Listrik mati → lampu pulih sendiri.** Keadaan relay diingat alat dan
  dipasang kembali sebelum Wi-Fi tersambung.

## Peta pin (sama dengan firmware lama — kabel tidak berubah)

| Board 1 | GPIO | | Board 2 | GPIO |
|---|---|---|---|---|
| T01–T04 | 4, 5, 6, 7 | | T17–T20 | 4, 5, 6, 7 |
| T05–T08 | 15, 16, 17, 18 | | T21–T24 | 15, 16, 17, 18 |
| T09–T12 | 42, 41, 40, 39 | | T25–T28 | 42, 41, 40, 39 |
| T13–T16 | 38, 37, 36, 35 | | T29, T30, V01, V02 | 38, 37, 36, 35 |
| | | | V03, V04, T35 | 9, 10, 11 |

Meja T31–T34 dan T36–T40 belum punya relay. Kalau nanti dipasang, isi
kolom **Peta tambahan** di halaman pengaturan (`T31=12,T32=13`) — tanpa
upload ulang.
