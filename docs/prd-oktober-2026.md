# PRD — Putaran Oktober 2026

Status: **SELESAI & TERPASANG** — 8 nomor dikerjakan 5 Oktober 2026
Tanggal usulan: 4 Oktober 2026
Sumber: 8 permintaan pemilik + struk "KAS KASIR SPL" 3 Oktober 2026

---

## Yang sudah dipastikan pemilik

| Pertanyaan | Jawaban |
|---|---|
| Struk di foto itu menu atau rekap? | **Rekap penjualan hari itu**, bukan daftar menu |
| 6 meja cadangan untuk apa? | Pesanan makanan/minuman saja \u2014 atau dibuatkan jalur sendiri di kasir |
| Layar awal | **Email + password**, PIN tetap dipakai untuk ganti shift |
| Nomor 3 & 4 | Tidak ada, penomoran memang loncat |

### Satu anggapan yang saya ambil, mohon dikoreksi kalau salah

Karena struk itu rekap, **menu 107 item yang sekarang TIDAK diganti dan tidak dihapus.**
Yang ditambah hanya satu kategori yang memang belum ada sama sekali di aplikasi:
**barang counter biliar** (rokok, Aqua, Nutriboost, Peyek, dll) \u2014 19 jenis, diambil
dari bagian REKAP PENJUALAN BILLIARD di struk, lengkap dengan harga satuannya.

---

## 1 \u00b7 Hapus tampilan meja Smokehouse

Meja resto R01\u2013R12 beserta layar reservasinya dibuang: `RestoReservasi.tsx`,
rute `/resto`, kelas meja `resto`, aksi `reserveResto`, dan pintu masuknya di
layar tamu maupun papan kasir.

**Hati-hati:** kalau ada sesi resto yang masih hidup di jejak, mesin harus tetap
bisa memutarnya tanpa pecah \u2014 jadi kelas `resto` tetap dikenali mesin saat
membaca jejak lama, hanya tidak bisa dibuat baru dan tidak muncul di layar.

## 2 \u00b7 Kasir bisa pesan makanan/minuman saja, tanpa meja

Sekarang kasir hanya bisa **menagih** takeaway yang dibuat tamu dari HP; kasir
tidak bisa **membuat** pesanan sendiri. Ditambah tombol **"Pesan tanpa meja"**
di tab Kasir: pilih barang \u2192 keranjang \u2192 bayar (tunai / EDC / QRIS) \u2192 struk.
Memakai aksi `guestOrder` + `settleOrder` yang sudah ada, jadi tidak ada jalur
uang baru dan semua pengaman lama tetap berlaku.

Dengan ini, 6 meja cadangan **tidak lagi diperlukan** untuk pesanan tanpa meja \u2014
tapi tetap dibuat (lihat nomor 9) supaya rombongan yang cuma duduk makan tetap
bisa diberi meja dan open bill.

## 5, 6, 7 \u00b7 Rekap 3 jenis: Billiard \u00b7 Resto \u00b7 Bar

Mengikuti bentuk struk. Tiga tabel terpisah, tiap baris **qty \u00b7 nama \u00b7 total**,
masing-masing punya subtotal, lalu:

```
TOTAL BILLIARD   3.981.000
TOTAL CAFE       2.739.500
TOTAL BAR        4.380.000
Total Meja + Barang + Cafe   25.797.500
```

Dari struk juga terbaca: **TOTAL OMZET 14.697.000 = sewa meja saja**
(25.797.500 \u2212 11.100.500 barang). Jadi rekap baru memisahkan tegas
**sewa meja** dari **barang**, persis seperti struk, termasuk pecahan
**Shift Pagi / Shift Sore**.

Supaya bisa dikelompokkan bertiga, `station` yang sekarang hanya
`"kitchen" | "bar"` ditambah **`"billiard"`**:

| Jenis rekap | station | contoh |
|---|---|---|
| BILLIARD | `billiard` | rokok, Aqua, Nutriboost, Peyek \u2014 **19 item baru** |
| RESTO (CAFE) | `kitchen` | nasi goreng, ayam penyet, french fries |
| BAR | `bar` | kopi susu, es teler, lemon tea |

Barang `billiard` **tidak membuat tiket dapur** \u2014 langsung diserahkan di counter.

Juga ditambah bagian terakhir seperti di struk:
**"REKAP PENJUALAN F&B (BELUM CHECKOUT)"** \u2014 barang yang sudah keluar tapi
tabnya belum ditutup. Ini yang selama ini bikin rekap stok dan rekap uang
terlihat tidak cocok.

### 19 barang counter biliar yang ditambahkan (harga dari struk)

| Barang | Harga | | Barang | Harga |
|---|---:|---|---|---:|
| A Mild 12 | 30.000 | | Marlboro FB 12 | 30.000 |
| A Mild 16 | 40.000 | | Marlboro Ice Burst | 55.000 |
| Aqua | 6.000 | | Marlboro Light | 55.000 |
| Coca Cola botol | 10.000 | | Marlboro Red | 55.000 |
| Dji Sam Soe | 25.000 | | Nutriboost | 10.000 |
| Dji Sam Soe Kretek | 23.000 | | Peyek | 10.000 |
| Fanta botol | 10.000 | | Pulpy Orange | 10.000 |
| Ion Water | 10.000 | | Surya 12 | 30.000 |
| LA Ice | 39.000 | | Surya 16 | 40.000 |
| Lucky Strike | 37.000 | | | |

Harga satuan dihitung dari total \u00f7 qty di struk, dan **ketiga subtotal struk
cocok persis** saat diperiksa ulang \u2014 jadi angkanya bisa dipercaya.

## 8 \u00b7 Layar QRIS menghadap pelanggan

QR dinamis sekarang hanya muncul di layar kasir, jadi tamu harus menengok ke
balik meja. Ditambah **jendela kedua** (`/tampil`) yang dibuka di monitor/tablet
menghadap tamu: QR besar, nominal, hitung mundur, dan berubah sendiri jadi
**"LUNAS"** begitu pembayaran masuk \u2014 tanpa kasir menyentuh apa pun.

Jalurnya tidak lewat internet: layar kasir dan layar tamu di komputer yang sama
berbagi keadaan lewat `BroadcastChannel`. Di aplikasi Windows dibuka sebagai
jendela kedua Electron ke layar yang mana pun.

## 9 \u00b7 40 meja biliar

T01\u2013T30 \u2192 **T01\u2013T40**. 34 dipakai, 6 cadangan (boleh dinonaktifkan lewat
Atur \u2192 Meja supaya tidak terjual online kalau belum siap). VIP 1\u20134 **tetap**
seperti sekarang \u2014 tarif VIP/VVIP dan aturan rokok adalah permintaan pemilik
sebelumnya, jadi tidak saya hapus tanpa diminta. Meja resto hilang (nomor 1).

Total ruang: **40 biliar + 4 VIP = 44** (sebelumnya 30 + 4 + 12 = 46).

## 10 \u00b7 Layar awal: email + password

Buka aplikasi \u2192 **email + password**. Sesudah masuk, ganti kasir antar shift
cukup PIN seperti sekarang.

- Kolom `staff_pins.password_hash` (bcrypt lewat `pgcrypto`), RPC
  `staff_login_password(p_email, p_password)` menukar jadi token venue 12 jam.
- Pemilik mengatur password staf di **Atur \u2192 Akun staf**.
- Login OTP email yang lama tetap ada sebagai jalan darurat kalau password lupa.
- **Tidak ada password bawaan.** Sebelum diisi pemilik, staf tetap masuk pakai
  PIN \u2014 jadi tidak ada satu malam pun kasir terkunci di luar aplikasi.

---

## Yang TIDAK diubah

Mesin uang, tarif, promo, QRIS DOKU, absensi, laporan stok 05.00, booking tamu,
dan menu 107 item yang sudah ada. Semua pengaman lama (51 invariant, 83 mutasi)
harus tetap hijau.

## Urutan pengerjaan

1. Meja 40 + hapus resto (nomor 9, 1) \u2014 paling dasar, menyentuh banyak layar
2. Station `billiard` + 19 barang (bagian dari 5/6/7)
3. Rekap 3 jenis (5, 6, 7)
4. Pesan tanpa meja di kasir (2)
5. Layar QRIS menghadap tamu (8)
6. Login email + password (10)

Tiap langkah: uji dulu, baru lanjut.

---

## Hasil (5 Oktober 2026)

| No | Yang dikerjakan | Di mana |
|---|---|---|
| 1 | Meja & layar reservasi resto dibuang | `venue.ts`, rute `/resto` + `RestoReservasi.tsx` dihapus |
| 2 | Kasir bisa pesan tanpa meja | `src/screens/admin/PesanTanpaMeja.tsx`, tombol di tab Kasir |
| 5,6,7 | Rekap Billiard · Resto · Bar + struk | `rekapTigaJenis()` di engine, `RekapTigaJenis.tsx` |
| 7 | 19 barang counter biliar | kategori `counter-biliar` di `menu.ts`, station `billiard` |
| 8 | Layar QRIS menghadap tamu | `src/lib/tampilTamu.ts`, rute `/tampil`, `TampilTamu.tsx` |
| 9 | 40 meja (T01–T40) + VIP 1–4 | `venue.ts` |
| 10 | Login email + password | `supabase/schema-sandi.sql`, layar masuk di `AdminShell.tsx` |

**Pengaman:** `npm run test:utc` hijau — 36 · 37 · **100/100 simulasi, 51/51 invariant** ·
23 · 40 · 19 · 18 · **23 (rekap, baru)**.

Dua invariant berubah, dan itu disengaja:
- **INV-47** (reservasi resto) dihapus bersama fiturnya, berikut satu mutan ujinya.
- **INV-52 BARU**: barang counter biliar tidak pernah membuat tiket dapur/bar.
  INV-20, INV-29, dan INV-40 ikut diajari aturan ini — ketiganya sempat merah
  dan itulah yang membuktikan jaringnya masih bekerja.

**Diverifikasi di aplikasi yang jalan:** papan menampilkan meja 1–40 + V1–V4 tanpa
meja resto; 19 barang counter dengan harga dari struk (2× Marlboro Red = Rp 110.000);
layar masuk membuka dengan email+password; `/tampil` berpindah sendiri
menunggu → QR → LUNAS dan **tidak punya satu pun tombol**.

**Catatan jujur:** pesanan tanpa meja ikut aturan jam buka venue (11.00–02.00),
jadi di luar jam itu ditolak dengan alasan "dapur sedang tutup" — termasuk untuk
rokok. Kalau rokok perlu bisa dijual di luar jam itu, bilang saja.
