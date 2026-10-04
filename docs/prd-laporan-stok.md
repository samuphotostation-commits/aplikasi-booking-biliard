# PRD — Laporan Stok: dari tebakan jadi catatan

Status: **SELESAI & TERPASANG** (A + B + C dikerjakan; opname seminggu sekali)
Tanggal usulan: 28 September 2026 · selesai: 29 September 2026

## 1. Keluhan

> "tidak sinkron dan tidak ada historical harian nya"

Layar Rekap → Laporan stok menampilkan seluruh item dengan Awal = Sisa dan
"0 barang terjual · Rp 0", padahal di Jejak Aktivitas hari yang sama ada tab
ditutup senilai Rp 163.500 dan Rp 307.000.

## 2. Temuan (sudah diperiksa, bukan dugaan)

**Mesinnya BENAR.** Simulasi 3 hari berjualan lewat jalur yang sama dengan
server (`replay` / `applyEntry`), termasuk sesudah titik simpan dibuat dan
jejak lamanya dibuang:

```
2026-09-26  awal=120  terjual=3  sisa=117   OK
2026-09-27  awal=117  terjual=3  sisa=114   OK
2026-09-28  awal=114  terjual=3  sisa=111   OK
```

Yang salah ada empat, semuanya di luar mesin:

### T1 — Tidak ada satu pun catatan stok yang disimpan
`stockMoves` adalah penyangga **di dalam memori**, dibangun ulang setiap kali
jejak diputar, dan dipotong di **2.000 baris terakhir**
(`engine.ts:911`, `MAX_STOCK_MOVES`). Begitu penuh, baris terlama hilang
diam-diam. Tidak ada tabel, tidak ada tutup buku stok — beda dengan uang yang
punya `closeBooks`.

### T2 — "Awal" dihitung MUNDUR dari "Sisa" hari ini
`Rekap.tsx`: `sisa = qty_sekarang - pergerakan_sesudahnya`, lalu
`awal = sisa - pergerakan_hari_itu`. Artinya satu pergerakan yang hilang
(karena T1) membuat **seluruh hari sebelumnya ikut salah**, dan tidak ada
apa pun untuk mencocokkannya. Kalau penyangganya kosong, rumus ini selalu
menghasilkan Awal = Sisa dan Terjual = 0 — persis yang terlihat di layar.

### T3 — Riwayat harian tidak benar-benar ada
Tombol hari hanya muncul untuk tanggal yang **kebetulan masih ada** di
penyangga, maksimal 10 tombol, tanpa pilih tanggal, tanpa rentang, tanpa CSV
periode. Rekap uang sudah punya "Pilih tanggal"; stok tidak.

### T4 — Stok dan uang dicatat pada saat yang berbeda
Stok berkurang saat barang **DIPESAN**; uang dihitung saat tab **DITUTUP**.
Tab yang dibuka Jumat dan dibayar Senin: uangnya masuk hari Senin, barangnya
sudah keluar hari Jumat. Di layar ini terlihat seperti "tidak sinkron" —
dan itu cocok dengan gejalanya: pergerakan stok terakhir 25 Sep, penutupan
tab hari ini.

## 3. Yang diusulkan

### A. Tutup stok harian jadi FAKTA tersimpan (menjawab T1 + T2)
Tabel baru `stok_harian` di server: satu baris per (tanggal, item) berisi
`awal, masuk, terjual, kembali, susut, opname, sisa, nilai_jual`.
Ditulis otomatis begitu melewati jam 05.00 oleh cron — cara kerjanya sama
dengan tutup buku uang. Sesudah itu angka hari kemarin **tidak bisa berubah
lagi** dan tidak bergantung perangkat mana pun.

Hari berjalan tetap dihitung langsung dari jejak (biar hidup), hari lampau
dibaca dari tabel.

### B. Riwayat yang sesungguhnya (menjawab T3)
- Pilih tanggal bebas + pintasan 7 hari / 30 hari / bulan ini / bulan lalu
  (memakai `periodeRange` yang sudah ada di rekap uang).
- Tabel rekap periode: total terjual & nilai per item sepanjang rentang.
- Grafik pemakaian per hari.
- Unduh CSV per rentang, bukan cuma satu hari.

### C. Yang bikin "lebih oke"
1. **Nilai rupiah per item** di tabel (sekarang hanya ada totalnya).
2. **Peringkat item terlaris** dalam periode.
3. **Opname / hitung fisik**: kasir isi jumlah fisik di akhir hari, sistem
   mencatat selisihnya sebagai susut dengan nama petugasnya. Ini yang membuat
   laporan stok bisa dipercaya — tanpa ini, "susut" selalu tebakan.
4. **Perkiraan habis**: "Ice Tea — sisa 18, rata-rata 6/hari → habis 3 hari
   lagi", supaya belanja tidak telat.
5. **Peringatan stok menipis** yang bisa diketuk langsung ke tab Menu & Stok.

### D. Perjelas T4, jangan disembunyikan
Tetap kurangi stok saat barang dipesan — barangnya memang sudah keluar dari
gudang. Tapi tambahkan keterangan di layar dan satu baris di rekap:
"x barang keluar untuk tab yang belum ditutup (Rp y)", supaya beda angkanya
dengan rekap uang bisa dijelaskan, bukan bikin bingung.

## 4. Ruang lingkup teknis

| Berkas | Perubahan |
|---|---|
| `supabase/schema-stok.sql` | **baru** — tabel `stok_harian`, RPC `stok_tutup_hari`, `stok_ambil(rentang)`, `stok_opname`, cron `spl-stok-tutup` tiap 05.10 WIB |
| `src/lib/engine.ts` | aksi baru `stockCount` (opname); `stockMoves` tetap, hanya jadi sumber hari berjalan |
| `src/lib/supabaseRemote.ts` + `venueStore.ts` | `stokAmbil`, `stokOpname` |
| `src/screens/admin/Rekap.tsx` | bagian Laporan stok dirombak: pilih tanggal, rentang, nilai Rp, peringkat, grafik, opname |
| `test/stok.test.ts` | **baru** — tutup hari, opname, lintas hari, hari tanpa jualan |
| mutasi | tambah mutan: tutup hari dilewati, opname tidak tercatat, awal≠sisa kemarin |

**Yang perlu pemilik lakukan:** menjalankan satu berkas SQL di dashboard
Supabase (seperti `schema-absensi.sql` kemarin).

## 5. Yang TIDAK diubah

Tarif, alur kasir, uang, booking, absensi — tidak disentuh. Laporan stok yang
lama tetap bisa dibaca sampai tabel barunya terisi.

## 6. Keputusan yang saya tunggu

1. Setuju arah A–D? Atau cukup A + B dulu (riwayat benar), C menyusul?
2. Opname fisik: mau diisi tiap hari, atau cukup seminggu sekali?
3. Jam tutup stok tetap 05.00?

---

## 7. Hasil (29 September 2026)

Semua disetujui pemilik (A + B + C, opname seminggu sekali) dan sudah jalan.

| Bagian | Di mana |
|---|---|
| Tutup buku stok per hari, dihitung dari jejak | `laporanStokHarian()` di `src/lib/engine.ts` |
| Opname (hitung fisik) | aksi `stockCount` + jenis pergerakan `opname` |
| Tabel + RPC + cron 05.10 WIB | `supabase/schema-stok.sql` |
| Fungsi server | `supabase/functions/_sumber/stok.ts` → `stok-tutup` |
| Layar baru | `src/screens/admin/LaporanStok.tsx` |
| Uji | `test/stok.test.ts` (18 pemeriksaan), ikut `npm test` & `npm run test:utc` |

Pengisian pertama berhasil: **4 hari, 51 baris, dari 180 kejadian, 305 ms**.
Isinya juga menjawab keluhan aslinya — 26–28 Sep memang **nol** barang terjual;
yang terjual cuma 25 Sep (3 barang, Rp 54.000, susut 1). Uang yang masuk hari-hari
itu berasal dari sewa meja dan tab lama, bukan makanan. Sekarang hal itu terlihat
langsung di panel **"Cocokkan dengan rekap uang"**.

Keputusan 3 (jam tutup stok) tetap 05.00, tidak diubah.
