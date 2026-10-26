# Daftar revisi dari pemilik — 18 Oktober 2026

Sumber: kiriman WhatsApp pemilik (6 pesan + 5 foto layar + 1 foto struk).
Berkas ini **daftar kerja untuk disetujui dulu**, belum dikerjakan.

Tiap butir ditulis dengan empat hal: **apa yang diminta**, **keadaan
sekarang** (hasil periksa kode, bukan ingatan), **rencana perbaikan**, dan
**risikonya**. Yang masih perlu jawaban pemilik ditandai **❓**.

---

## A · PPN & service dipisah per lini usaha

**Diminta** — *"pada bagian ppn dan service bisa disetting dan pisah pada:
MEJA BILLIARD, BAR, RESTO. Sama tambahkan tombol konfirmasi ya/tidak."*
Disusul: *"ada pilihan, minuman (Bar – counter minuman kemasan), makanan
(resto)."*

**Sekarang** — pajak disimpan satu pasang untuk seluruh venue:
`pajak: { ppn: 10, service: 0 }`. Mengetik angkanya langsung tersimpan, tanpa
konfirmasi.

Satu hal yang penting dan mudah terlewat: **pajak di sistem ini tidak pernah
menambah tagihan.** Harga menu sudah termasuk pajak, dan persen PPN/service
hanya **memecah** angka yang sama untuk laporan (DPP + PPN + service =
omzet). Jadi mengubah persennya tidak pernah menggeser satu rupiah pun yang
ditagih ke tamu — itu dijaga invariant INV-53.

**Rencana**

1. `pajak` jadi tiga pasang: `biliar`, `bar`, `resto` — masing-masing punya
   PPN dan service sendiri.
2. Tiap baris penjualan dipetakan ke salah satunya:
   - **Meja Billiard** → sewa meja + barang counter biliar (rokok, botolan)
   - **Bar** → minuman (station `bar`)
   - **Resto** → makanan (station `kitchen`)
   Pemetaan ini sudah ada di mesin (`station` per baris), jadi tidak ada
   tebakan.
3. Laporan (rekap, Detail Transaksi, Excel) memecah pajak per lini.
4. Tombol **Simpan** + dialog konfirmasi "Ubah PPN Resto 10% → 11%? Ya /
   Tidak" sebelum tersimpan.
5. Pajak lama (satu pasang) tetap dibaca untuk jejak sebelum perubahan ini,
   supaya riwayat tidak berubah angkanya.

**❓ Pertanyaan** — apakah pajaknya tetap **sudah termasuk harga** (seperti
sekarang, hanya pemecahan laporan), atau untuk lini tertentu mau
**ditambahkan di atas harga** sehingga tamu membayar lebih? Keduanya bisa,
tapi yang kedua mengubah angka yang ditagih dan harus dipikirkan matang —
termasuk apakah struk lama ikut berubah.

**Risiko** — sedang. Menyentuh rumus uang, jadi perlu uji & invariant baru.

---

## B · Bill untuk pesanan tanpa meja (counter)

**Diminta** — *"kalau bisa keluar bill (bill ada pada bagian pesan tanpa
meja)."*

**Sekarang** — "Pesan tanpa meja" bisa mencatat pesanan dan menerima
pembayaran, tapi **tidak punya tombol cetak bill/struk**. Struk hanya ada di
lembar meja (Papan) dan di Detail Transaksi.

**Rencana** — tambahkan tombol **Cetak Bill** (sebelum bayar) dan **Cetak
Struk** (sesudah bayar) di layar pesan tanpa meja, memakai pencetak dan
format 58 mm yang sudah dipakai lembar meja. Tidak ada format baru yang
dibuat — satu format struk untuk semua, supaya tidak ada dua struk yang
berbeda untuk venue yang sama.

**Risiko** — kecil.

---

## C · Gudang: koreksi & tombol cepat

**Diminta** — *"pada bagian gudang ada opsi pengurangan (jika ada salah input
barang)"* dan *"bagian panel Gudang Resto, Gudang Bar, Counter bisa diubah
manual, kurangi, +5, +10, +20."*

**Sekarang** — layar Gudang hanya bisa **transfer** dari Gudang Central ke
outlet. Tidak ada pengurangan, tidak ada tombol cepat, tidak ada koreksi
manual di panel outlet.

**Rencana**

1. Tiap baris barang di Gudang Resto / Gudang Bar / Counter dapat:
   **−** · **+5** · **+10** · **+20** · dan kotak isi manual.
2. Pengurangan **wajib pakai alasan** (salah input / rusak / susut), tercatat
   di jejak dengan nama petugasnya. Tanpa alasan, selisih stok tidak bisa
   ditelusuri saat opname, dan gudang yang bisa dikurangi diam-diam adalah
   lubang kas yang paling sulit dilihat.
3. Semua pergerakan masuk laporan stok 05.00–05.00 yang sudah ada.

**Risiko** — kecil di mesin (jalur `addStock`/`setStock` sudah ada), tapi
perlu izin peran: siapa yang boleh mengurangi. **Usul:** kru gudang boleh
menambah, **pengurangan hanya manajer ke atas**.

---

## D · Tombol "ubah" di baris bill dihilangkan

**Diminta** — *"pas iko, fitur (ubah) hilangkan."*

**Sekarang** — tiap baris pesanan di lembar meja punya dua tombol kecil:
`ubah` dan `void`.

**Rencana** — buang `ubah`, sisakan `void`. Koreksi jumlah tetap bisa lewat
void lalu pesan ulang, dan itu meninggalkan jejak — sementara "ubah" bisa
menurunkan jumlah tanpa persetujuan siapa pun.

**Risiko** — kecil. Perlu dipastikan kasir tidak kehilangan jalan untuk
memperbaiki salah ketik; void baris sudah menutupinya.

---

## E · Bill memisahkan yang sudah & belum dibayar

**Diminta** — *"bill keluar sesuaikan yg sudah dbayar dan yg belum
dabayar."* (dari layar bayar per orang / split bill)

**Sekarang** — mesin **sudah tahu** baris mana yang sudah dilunasi per orang
(`paidLineKeys`), dan layar menandainya. Tapi **struk cetaknya belum
memisahkan** — semua baris dicetak sama.

**Rencana** — struk dibagi dua bagian berjudul: **SUDAH DIBAYAR** (dengan
metode & jamnya) dan **BELUM DIBAYAR**, lalu sisa tagihan di bawah. Yang
sudah dibayar ikut tercetak supaya tamu bisa mencocokkan, tapi tidak
dijumlahkan dua kali.

**Risiko** — kecil. Datanya sudah ada, yang berubah hanya tata cetaknya.

---

## F · Pindah meja ke meja mana saja

**Diminta** — *"pada menu pindah meja, tidak harus meja yg aktif, semua meja
bisa."*

**Sekarang** — pindah meja hanya menawarkan meja **sekelas** (`classOf`
sama) dan yang kosong pada rentang waktunya. Jadi meja reguler tidak bisa
dipindah ke VIP, dan meja biliar tidak bisa ke meja makan.

**Rencana** — tawarkan **semua meja yang kosong** pada rentang itu. Yang
tetap dijaga: meja tujuan benar-benar kosong (kalau tidak, dua rombongan
dijanjikan satu meja).

**❓ Pertanyaan — ini soal uang, bukan soal layar.** Kalau tamu tarif
reguler (Rp 29.000/jam) dipindah ke VIP (Rp 50.000/jam):

- **(1) Harga ikut meja baru** — dihitung ulang sejak pindah.
- **(2) Harga tetap seperti awal** — tamu bayar tarif meja lamanya.
- **(3) Kasir yang memilih** saat memindahkan.

Sekarang harga **dibekukan di sesi saat meja dibuka**, jadi tanpa keputusan
ini pindah ke VIP berarti tamu main di VIP dengan harga reguler. Saya belum
mengubah apa pun sampai pemilik memilih.

**Risiko** — menengah, karena menyentuh harga.

---

## G · Layar Dapur: kalimat, warna, urutan, dan jam

**Diminta**

> - Mulai Masak menjadi **ORDERAN DITERIMA** (kuning)
> - Tandai Siap menjadi **PROSES** (hijau)
> - **ORDERAN READY** (biru)
>
> jangan hilangkan pesanan, pisah letaknya berikan line garis dbawah bagi yg
> sudah biru
>
> tambahin: jam pesanan masuk dari kasir · jam pesanan selesai dimasak /
> orderan ready

**Sekarang**

| Keadaan | Tombol sekarang | Warna sekarang |
|---|---|---|
| baru | "Mulai masak" | amber |
| diproses | "Tandai siap" | biru |
| siap | "Sudah diantar" | hijau |
| selesai | — | **dibuang dari layar** |

Tiket menyimpan **jam masuk** (`at`), tapi **tidak menyimpan jam selesai**.

**Rencana**

1. Ganti kalimat & warna persis seperti diminta: **ORDERAN DITERIMA
   (kuning)** → **PROSES (hijau)** → **ORDERAN READY (biru)**.
2. Pesanan yang sudah biru **tidak dibuang** — turun ke bawah garis pemisah,
   masih terbaca sampai tutup buku.
3. Tambah **jam masuk** dan **jam ready** di tiap kartu, plus lama
   pengerjaannya ("18.42 → 18.57 · 15 menit"). Jam ready perlu disimpan di
   tiket, jadi ini perubahan mesin, bukan hanya layar.

**❓ Pertanyaan kecil** — tulisan itu nama **tombolnya** (apa yang ditekan)
atau nama **keadaannya** (status yang sedang berjalan)? Saya akan pakai
keduanya: tombol "ORDERAN DITERIMA" memindahkan ke keadaan berwarna kuning,
dan seterusnya. Kalau maksudnya beda, cukup bilang.

**Risiko** — kecil, tapi menyentuh jejak (`readyAt` baru di tiket).

---

## H · Shift: buang modal awal, tambah cetak transaksi

**Diminta** — *"hilangkan MODAL AWAL. Tambahkan fitur di shift: bisa cetak
semua transaksi (summary / detail)."*

**Sekarang** — buka shift meminta **modal awal laci**, dan selisih tutup
shift dihitung `yang dihitung − (modal awal + tunai masuk)`.

**Rencana**

1. Buang modal awal dari layar buka shift. Kas yang diharapkan = **tunai yang
   masuk selama shift**, titik.
2. Kolomnya **tetap ada di data** (bernilai 0) supaya shift lama tetap bisa
   diputar ulang dengan angka yang sama — riwayat tidak boleh berubah karena
   layarnya berubah.
3. Tombol cetak di tab Shift:
   - **Ringkas** — jumlah transaksi, omzet per kanal bayar, tunai di laci.
   - **Rinci** — semua transaksi shift itu satu per satu.

**Risiko** — menengah: menyentuh hitungan selisih kas, yang dijaga INV-09
dan INV-S5. Ujinya perlu disesuaikan dengan hati-hati.

---

## I · Panel cetak struk + riwayat

**Diminta** — *"panel pront struk (bisa cek flashback struk yg
sebelum2nya)."* Dilampiri foto struk **KAS KASIR — REKAP PENJUALAN CAFE**
dengan kolom QTY · DESKRIPSI · TOTAL per hidangan.

**Sekarang** — struk hanya bisa dicetak **saat itu juga**, dari lembar meja
atau Detail Transaksi. Tidak ada daftar struk lama, tidak ada cetak ulang.

**Rencana**

1. Layar baru **Struk** di panel kasir: daftar transaksi hari ini dan
   hari-hari sebelumnya (dari arsip tutup buku), dicari dengan nomor struk,
   nama tamu, atau nomor meja.
2. Tiap baris bisa **dilihat** dan **dicetak ulang**, dengan tanda **CETAK
   ULANG** pada hasilnya — supaya struk cetak ulang tidak bisa dipakai
   seolah-olah transaksi kedua.
3. Format **REKAP PENJUALAN** seperti di foto (QTY · DESKRIPSI · TOTAL per
   hidangan) ditambahkan sebagai pilihan cetak. Datanya sudah ada di Laporan
   Produk — yang belum ada hanya tata cetak 58 mm-nya.

**Risiko** — kecil sampai menengah. Arsip lama yang rinciannya sudah dilepas
tidak bisa dicetak ulang per baris; untuk hari-hari itu hanya ringkasannya
yang tersedia, dan layarnya harus mengatakan itu, bukan menampilkan struk
kosong.

---

## Urutan kerja yang diusulkan

Dikerjakan per kumpulan, tiap kumpulan diuji dan diterbitkan sebelum lanjut —
supaya kalau ada yang keliru, yang perlu diperiksa sedikit.

| # | Kumpulan | Isi | Perkiraan |
|---|---|---|---|
| 1 | **Layar lantai** | D (buang "ubah") · G (dapur) · B (bill counter) | paling cepat, langsung terasa tiap hari |
| 2 | **Gudang & stok** | C | sedang |
| 3 | **Struk & cetak** | E (sudah/belum dibayar) · I (panel struk + rekap) | sedang |
| 4 | **Uang & pengaturan** | A (pajak per lini) · H (shift) | paling hati-hati, butuh uji & invariant baru |
| 5 | **Pindah meja** | F | menunggu jawaban soal harga |

---

## Yang saya tunggu jawabannya

1. **Pajak (A)** — tetap sudah termasuk harga, atau ditambahkan di atas harga
   untuk lini tertentu?
2. **Pindah meja (F)** — harga ikut meja baru, tetap seperti awal, atau kasir
   yang memilih?
3. **Gudang (C)** — pengurangan stok boleh dilakukan kru gudang, atau manajer
   ke atas saja?
4. **Dapur (G)** — tulisan ORDERAN DITERIMA / PROSES / ORDERAN READY itu nama
   tombol atau nama status? (saya akan pakai keduanya kalau tidak dijawab)
5. **Struk lama (I)** — mundur sampai berapa lama? Usul: **90 hari**, karena
   di atas itu jejaknya sudah dilepas dan yang tersisa hanya ringkasan.

Sisanya (B, D, E, G, H) sudah cukup jelas dan bisa langsung dikerjakan begitu
daftar ini disetujui.

---

# Status pengerjaan — 18 Oktober 2026 (dikerjakan)

Jawaban pemilik: **A dipisah · B = tamu SPL Sport juga bisa pesan tanpa meja ·
C gudang bisa diedit/diisi manual · D tidak perlu · G, H, I benar.**
**F belum dijawab** (harga saat pindah meja), jadi belum dikerjakan.

| Butir | Status | Yang berubah |
|---|---|---|
| **A** PPN & service per lini | **Selesai** | Tiga pasang persen: Meja Billiard · Bar · Resto, dengan konfirmasi ya/tidak. Tiap transaksi membekukan pecahan lininya saat tab ditutup, jadi laporan pajak hari lampau tidak berubah kalau persennya disetel ulang. Rekap menampilkan tabel per lini. |
| **B** Pesan tanpa meja | **Selesai** | Tamu SPL Sport punya tombol "Pesan Tanpa Meja · Ambil di Kasir" di beranda. Kasir bisa **Cetak Bill** sebelum tamu membayar. |
| **C** Gudang | **Selesai** | Isi manual, +5/+10/+20, dan pengurangan **wajib beralasan** (salah input, rusak, susut, dipakai sendiri, hasil opname) — berlaku di Central, Billiard, Resto, dan Bar. Alasannya tercatat di jejak bersama nama petugasnya. |
| **D** Buang tombol "ubah" | **Dilewati** | Atas keputusan pemilik. |
| **E** Bill sudah/belum dibayar | **Selesai** | Struk terbagi dua judul: BELUM DIBAYAR dan SUDAH DIBAYAR. Yang sudah dibayar tetap dicetak untuk dicocokkan, tidak dijumlah dua kali. |
| **F** Pindah meja semua meja | **Ditahan** | Menunggu keputusan harga (ikut meja baru / tetap / kasir memilih). |
| **G** Layar Dapur | **Selesai** | ORDERAN DITERIMA (kuning) → PROSES (hijau) → ORDERAN READY (biru). Pesanan ready tidak dibuang, turun ke bawah garis pemisah. Jam masuk kasir & jam ready dicatat di mesin, plus lama memasaknya. |
| **H** Shift | **Selesai** | Modal awal hilang dari layar (tetap tampil untuk shift lama yang modalnya bukan nol, supaya kasnya tidak terlihat tidak cocok). Tambah **Cetak ringkas** dan **Cetak rinci**. |
| **I** Panel struk | **Selesai** | Layar baru di tab Kasir: pilih hari (90 hari ke belakang), cari nomor/nama/meja, **cetak ulang** bertanda "CETAK ULANG", plus **Cetak rekap penjualan** (QTY · DESKRIPSI · TOTAL) seperti contoh struk pemilik. |

## Keputusan yang diambil tanpa menunggu jawaban

1. **Pajak tetap SUDAH TERMASUK harga.** Pemilik menjawab "dipisah", tidak
   meminta tagihan tamu berubah. Jadi persennya tetap hanya memecah laporan;
   tidak satu rupiah pun yang ditagih bergeser. Dijaga uji baru: mengubah PPN
   resto 10% → 11% dan bar → 0% TIDAK mengubah omzet, uang diterima, maupun
   tagihan tamu — yang berubah hanya pemecahannya.
2. **Pengurangan stok boleh dilakukan siapa pun yang berhak mengelola stok**,
   bukan manajer saja — pemilik menekankan gudangnya harus bisa diedit.
   Pengamanannya dipindah ke **alasan yang wajib diisi**, yang tercatat di
   jejak bersama nama petugasnya.
3. **Dapur:** tulisan dipakai sebagai nama tombol SEKALIGUS nama status, dengan
   warna titik status mengikuti warna yang diminta.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 157 · 17 · 12 · 32 · 72 · 45
test:types nol galat · test:utc lolos · 112 pola mutasi cocok
```

---

# Paket custom berisi makanan & minuman — 19 Oktober 2026

*"Untuk paket custom di SPL tidak hanya jam bermain tetapi bisa ditambahkan
makanan dan minuman di dalamnya dan konek ke stock gudang, dan di Smokehouse
juga bisa atur paket makanan sendiri."*

## Bentuknya

Paket sekarang punya dua kolom baru: **venue** (SPL Sport atau Smokehouse)
dan **isi** (daftar makanan/minuman yang sudah termasuk harganya).

| | Paket SPL Sport | Paket Smokehouse |
|---|---|---|
| Jam main | 1–6 jam, wajib | **0 jam** — tidak bersewa waktu |
| Cara dijual | Dibooking online, harga blok menggantikan tarif per jam | Diketuk kasir di layar pesan, langsung masuk bill meja |
| Isi | Boleh | Boleh |
| Isinya diserahkan | Saat tamu **check-in** | Saat paket **dijual** |

## Satu baris harga, isinya baris Rp 0

Harga paket masuk bill sebagai **satu baris**. Isinya masuk sebagai
baris-baris **Rp 0** tersendiri. Dipisah begitu supaya tiga hal benar
sekaligus tanpa rumus khusus:

- tamu ditagih **sekali** — harga paketnya,
- dapur menerima **tiap hidangan** sebagai tiket tersendiri,
- **stok berkurang per porsi**, lewat jalur stok yang sudah ada.

Baris harga paket **tidak** membuat tiket. Tanpa pagar itu, satu Paket
Keluarga mencetak dua tiket untuk makanan yang sama — satu atas nama
paketnya, satu lagi atas nama isinya.

## Kapan stoknya berkurang

Untuk paket SPL yang dibooking online: **saat tamu check-in**, bukan saat
booking dibuat. Alasannya sama dengan pra-pesan resto — paket bisa dibeli
berhari-hari sebelumnya, dan kalau stoknya dipotong saat itu, barangnya
hilang dari penjualan malam ini untuk tamu yang baru datang hari Sabtu.

Isi yang **habis** saat diserahkan dibuang dari paket dan disebutkan di
jejak. Kasir perlu tahu apa yang tidak bisa disajikan sebelum tamu
menanyakannya.

## Pagar yang dipasang

- Paket **Smokehouse tidak bisa dijual di meja biliar**, dan sebaliknya.
- Paket **bersewa waktu tidak bisa dijual sebagai baris bill** — itu blok
  meja; menjualnya di meja yang sudah jalan akan menagih harga bloknya tanpa
  memberi jam mainnya, jadi tamu membayar dua kali untuk jam yang sama.
- Paket **SPL 0 jam ditolak** — tamu membayar blok tanpa waktu main.
- Satu barang karangan di dalam isi menolak **seluruh** paket, bukan
  diterima separuh. Paket yang isinya diam-diam berkurang adalah janji yang
  tidak ditepati ke tamu yang sudah membayar.
- Paket Smokehouse tidak muncul di layar booking meja biliar.

## Akses per venue — sudah ada sejak 12 Oktober

*"Karyawan, cashier, manager untuk Smokehouse dan SPL Sport ini beda orang,
jadi akses bisa masing-masing, nanti disetting oleh owner."*

Ini **sudah berjalan**. Letaknya: **Atur → Akun staf**. Tiap baris akun punya
pemilih venue di sebelah pemilih peran: **SPL Sport · Smokehouse ·
Keduanya**. Daftarnya dikelompokkan tiga, jadi terbaca sebagai dua daftar
yang terpisah.

Yang menegakkannya adalah **mesinnya**, bukan layar: akun yang terikat satu
venue ditolak saat menyentuh meja, tab, pesanan, atau akun venue sebelah —
dari perangkat mana pun. Pemilik & manajer grup tanpa ikatan venue tetap
mengurus keduanya, dan harus selalu tersisa satu superadmin tanpa ikatan
supaya tidak ada venue yang kehilangan pengurusnya.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 176 · 17 · 12 · 32 · 72 · 45
test:types nol galat · test:utc lolos · 115 pola mutasi cocok
```

---

# "Ubah baris pesanan" dihapus — 19 Oktober 2026

*"Untuk ini dihapus saja untuk fitur ubah, menghindari manipulasi karyawan.
Tolong perhatian hal-hal gini."*

**Catatan jujur:** butir ini sudah ada di daftar 18 Okt sebagai butir D, dan
saya salah membaca jawaban *"point d tidak ada dan tidak perlu"* sebagai
"tidak perlu dikerjakan". Keliru. Sekarang dikerjakan.

## Kenapa tombol itu memang berbahaya

`editFnb` bisa **menurunkan jumlah** dan **mengganti barang** sebuah baris,
selama baris itu belum diantar dan belum dibayar. Jadi: pesanan 3 porsi
dicatat 3, uangnya diterima untuk 3, lalu barisnya diubah jadi 1 sebelum bill
dicetak. Satu-satunya bekas yang tertinggal adalah satu baris catatan yang
tidak pernah dibaca siapa pun.

Void tidak begitu: void menuntut **alasan** DAN **persetujuan superadmin**
kalau yang mengajukan bukan superadmin. Itu bedanya, dan itu sebabnya koreksi
salah input sekarang lewat void lalu pesan ulang.

## Yang dilakukan

1. **Tombol dan panelnya dibuang** dari lembar meja.
2. **Mesinnya menolak**, bukan cuma layarnya menyembunyikan. Menyembunyikan
   tombol bukan pengamanan: jejak kejadian dikirim dari perangkat mana pun,
   dan perangkat bisa berbohong.
3. **Pagarnya bertanggal** (`KOREKSI_BARIS_DITUTUP` = 19 Okt 2026, 05.00
   WIB), bukan kodenya yang dihapus. Alasannya penting: seluruh keadaan venue
   dihitung ulang dari jejak kejadian, jadi kalau aksinya ditolak untuk semua
   waktu, koreksi yang SUDAH TERJADI minggu lalu berhenti berlaku saat
   jejaknya diputar ulang — dan bill lama diam-diam berubah angkanya,
   termasuk hari yang sudah tutup buku. Kejadian sebelum tanggal ini tetap
   berlaku persis seperti dulu; sesudahnya ditolak, dari perangkat mana pun,
   dengan peran apa pun.
4. **Pagar sumber baru** (`npm run test:layar`): tidak ada layar yang boleh
   memanggil aksi yang sudah ditutup. Tanpa ini tombolnya bisa kembali
   berbulan-bulan kemudian lewat salin-tempel, dan tidak ada satu uji pun
   yang menyadarinya — ujinya menguji mesin, bukan tombol.

## Pagar yang membuktikannya

- Uji alur Smokehouse: `ubah baris pesanan DITOLAK mesin`.
- Simulasi 100 putaran dibangun di **Agustus 2026** (sebelum tanggal
  penutupan), dan di sana `editFnb` masih diterima 65 kali — bukti bahwa
  jejak lama tetap diputar ulang dengan hasil yang sama persis.
- Mutasi #116 (pagar tanggal dicabut) **tertangkap**.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 176 · 17 · 12 · 32 · 72 · 45
test:types nol galat · test:utc lolos · test:layar bersih · 116 pola mutasi cocok
```

---

# Void sekali saja · panel rekap kasir · presisi laporan — 19 Oktober 2026

## 1 · Void tidak bisa diajukan berulang

*"Void bisa diajukan berulang-ulang, harusnya satu kali saja untuk pesanan
yang sama. Jadi kalau sudah diajukan ada informasi sudah diajukan void, dan
kedetect jika sudah disetujui, agar kasir tidak bingung."*

**Akibat yang sebenarnya, bukan cuma kasir bingung:** dua pengajuan menunggu
untuk satu baris, lalu superadmin menyetujui keduanya. Barangnya hilang
sekali, tapi daftar void menghitung nilainya **dua kali** di laporan.

Yang dilakukan:

- **Mesin menolak** pengajuan kedua selama yang pertama masih **menunggu** —
  siapa pun yang mengajukannya, dari perangkat mana pun.
- **Layar menyebutkan statusnya** di baris yang bersangkutan: `void diajukan`
  (kuning, dengan nama pengaju & alasannya di tooltip) atau `void ditolak`
  (merah, dengan nama yang menolak). Tombol `void` hilang selama menunggu.
- Void **seluruh sesi** sama: kalau sudah diajukan, yang tampil tulisan
  statusnya, bukan tombol yang akan ditolak mesin.
- Yang sudah **ditolak** boleh diajukan lagi. Satu pengajuan **aktif**, bukan
  satu pengajuan seumur hidup — kalau superadmin salah menolak, barisnya
  tidak boleh terkunci selamanya.

## 2 · Panel rekap untuk kru kasir

*"Pada kru kasir, panel rekap ada tapi hanya fitur laporan rekap. Filter
data: tanggal/hari/minggu/bulan, resto, bar, counter, billiard."*

Izin baru **`lihatRekapPenjualan`** — terpisah dari `lihatLaporanKeuangan`.
Kru kasir membuka tab **Rekap** dan melihat **hanya laporan penjualan**; kas
shift, pajak, MDR gateway, selisih laci, dan uang bersih yang masuk rekening
tetap tertutup.

Dipisah di satu pintu (`Rekap` memanggil layar yang berbeda sesuai izin),
bukan dengan menyembunyikan bagian-bagiannya satu per satu — kalau disaring
per bagian, satu bagian baru yang lupa dipagari akan diam-diam terbuka untuk
orang lantai.

Saringannya persis yang diminta:

| Periode | Lini |
|---|---|
| Hari · Minggu · Bulan · Pilih tanggal | Semua · **Billiard** (sewa meja) · **Counter** (rokok & botolan) · **Bar** (minuman) · **Resto** (makanan) |

Hasilnya: total penjualan, rincian per barang (QTY · DESKRIPSI · TOTAL), dan
tombol cetak dengan susunan yang sama.

## 3 · Presisi laporan Detail Transaksi

Cetakannya sekarang **berkolom**, persis susunan struk yang dikirim pemilik:

```
No | Jam | No. Trx | Meja | Ket | KAS | QRIS | MANDIRI | BRI
...
TOTAL KESELURUHAN      82.000  1.696.000  193.000
TOTAL TRANSAKSI (KAS + QRIS + MANDIRI + BRI)   1.971.000
```

Sebelumnya dicetak dua baris per transaksi supaya muat di kertas sempit —
terbaca, tapi tidak bisa dijumlah dengan mata per kolom, dan itulah justru
gunanya laporan ini. Satu nilai hanya muncul di **satu** kolom; kalau tidak,
jumlah per kolom lebih besar dari uang yang benar-benar masuk.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 187 · 17 · 12 · 36 · 72 · 45
test:types nol galat · test:utc lolos · test:layar bersih · 116 pola mutasi cocok
```

---

# Putaran 19 Oktober 2026 (sore)

> *"UNTUK VOID HARUS DISETUJUI OLEH MANAGER ATAU OWNER SAAT INI BELUM
> BERFUNGSI, DAN FOTO YG SAYA KIRIMKAN INI TIDAK BISA DIGESER, HARUSNYA BISA
> UNTUK MEMPERMUDAH PEMESANAN, UNTUK FOTO KEDUA INI SUDAH DI PESAN NAMUN KALAU
> MAU PINDAH MEJA BISA LANGSUNG PINDAH KE MEJA KOSONG TIDAK PERLU AKTIFKAN
> MEJA DARI AWAL, JDI BISA PINDAH KESELURUHAN MEJA"*

## 1 · Persetujuan void yang "tidak berfungsi"

Dilacak dengan percobaan, bukan dengan tebakan. Hasilnya: tombolnya **tidak**
rusak — manajer Smokehouse memang bisa menyetujui void Smokehouse. Yang rusak
adalah **daftarnya**: layar Void menampilkan pengajuan DUA venue sekaligus.
Manajer yang terikat Smokehouse melihat pengajuan meja biliar, menekan
"Setujui", dan mesin menolaknya karena lintas venue — tanpa sepatah kata pun
di layar. Dari kursi manajer, yang terlihat persis sebuah tombol mati.

Dua perbaikan, dan keduanya diperlukan:

1. **Daftarnya ikut venue yang sedang dibuka** (`venueVoid` di mesin). Yang
   tidak bisa dipetakan ke venue mana pun — jejak lama — tetap ditampilkan:
   lebih baik terlihat oleh keduanya daripada hilang dari keduanya.
2. **Keputusannya selalu berkabar.** Sesudah `decideVoid`, layar membaca
   hasilnya dari mesin (`peek()`) dan mengatakan apa yang terjadi: disetujui,
   ditolak, atau *"pengajuan ini milik venue sebelah"*. Tombol yang diam
   adalah bug, walaupun mesinnya benar.

Kalimat "Menunggu superadmin" juga diperbaiki jadi "Menunggu manajer atau
pemilik" — manajer memang berhak memutuskan, dan kalimat lama membuat kasir
menunggu orang yang salah.

## 2 · Kategori di layar pesanan tidak bisa digeser

Strip kategori dulu `overflow-x-auto` dengan scrollbar disembunyikan. Di layar
kasir yang dipakai mouse tidak ada yang bisa diseret, dan tidak ada isyarat
bahwa masih ada isinya di sebelah kanan — jadi "Smokehouse Bebek", "Beef Ribs",
dan seluruh minuman tidak pernah terjangkau.

Sekarang **dibungkus ke baris berikutnya**: semua kategori kelihatan
sekaligus. Bukan diberi tombol panah — di kasir satu ketukan lebih murah
daripada dua, dan tinggi layarnya cukup.

## 3 · Pindah pesanan langsung ke meja kosong

Dulu tujuan pindah **wajib** meja yang sudah jalan. Jadi kasir harus membuka
meja tujuannya dulu, baru memindah: dua langkah untuk satu kejadian, dan di
jam ramai langkah pertamanya yang terlupakan — lalu daftar tujuannya kosong
dan layarnya terasa rusak.

Sekarang aksi `moveFnb` menerima **meja kosong** (`toTableId`), dan mesinnya
membuka meja itu sekalian. Mejanya dibuka **persis** seperti kasir membukanya
sendiri — lewat `canOpenWalkin`, pagar yang sama dengan tombol "buka meja":

| | Meja biliar | Meja resto |
|---|---|---|
| Dibuka sebagai | open bill | open bill |
| Sewa di muka | Rp 0 | Rp 0 |
| Meteran | mulai sekarang | tidak ada (meja makan tanpa sewa waktu) |
| Lampu | menyala | tidak punya lampu |

Jadi ini **bukan** jalan pintas yang membuat meja terisi tanpa tagihan:
hasilnya sama persis dengan dua langkah yang digantikannya. Jejaknya pun
menulis dua kejadian — "Meja dibuka (open bill)" lalu "Pesanan dipindah" —
supaya terbaca sama dengan kalau kasir membukanya manual.

Di layar, tujuan dipisah dua kelompok: meja yang sedang jalan (hijau) dan meja
kosong (biru), karena memindah ke meja kosong MEMBUKA meja itu dan itu
kejadian yang berbeda dengan menitipkan pesanan ke tamu lain. Ditambah tombol
**"Pilih semua"** — *"jadi bisa pindah keseluruhan meja"*: memindah satu meja
penuh dengan mencentang satu per satu adalah cara paling mudah melewatkan satu
baris, dan baris yang tertinggal itu ditagihkan ke meja yang salah.

Pagarnya tetap tertutup, dan diuji:

- meja yang sedang dipakai tamu lain **tidak** bisa ditimpa;
- meja venue sebelah **tidak** ikut terbuka (kasir SPL tidak bisa menumpahkan
  pesanan ke meja Smokehouse);
- baris prabayar, yang sudah dibayar per orang, dan pesanan QR tamu tetap
  tidak bisa dipindah;
- tagihan meja asal tidak boleh jatuh di bawah uang yang sudah diterima di
  situ lewat split bill.

Daftar tujuan di layar disaring dengan `canOpenWalkin` — **pagar yang sama**
dengan yang dipakai mesin — supaya tidak ada tombol yang kelihatan hidup lalu
ditolak diam-diam.

## 4 · Sisa: kotak "Modal awal laci · Rp 0"

Dihapus dari layar buka shift. Angka Rp 0 yang dipajang besar-besar di kotak
sendiri terbaca sebagai nilai yang berarti sesuatu, padahal artinya cuma
"belum diisi". Keterangannya sekarang satu kalimat biasa.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 207 · 17 · 12 · 36 · 72 · 45
test:types nol galat · test:utc lolos · test:layar bersih · 118 pola mutasi cocok
mutasi baru #117 (pagar meja kosong) & #118 (uang split bill saat pindah) — keduanya tertangkap
```

---

# Point F dijawab · 19 Oktober 2026

> *"INI YG POINT F YG DIMAKSUD ADALAH YG UNTUK RESTO SMOKE HOUSE, YG SPL
> PERTAHANKAN."*

Pertanyaan harga yang menahan F sejak 18 Oktober **gugur dengan sendirinya**,
dan itu sebabnya jawabannya sesingkat ini: pertanyaannya cuma ada di SPL.

| | SPL Sport | Smokehouse |
|---|---|---|
| Aturan | **tetap** — hanya meja sekelas | semua meja makan yang kosong |
| Kenapa | reguler Rp 29.000/jam → VIP Rp 50.000/jam, dan harga dibekukan saat meja dibuka: tamu akan main di VIP dengan harga reguler | meja makan **tidak bersewa waktu** — pindah ke meja mana pun tidak menggeser satu rupiah pun |

Di Smokehouse **tidak ada yang perlu diubah**: seluruh meja makan sekelas
(`resto`), jadi "hanya meja sekelas" di sana sudah berarti "semua meja".
Diperiksa di aplikasi hidup: dari R05, tombol tujuannya menawarkan R01, R02,
R04, dan R06–R12 — sebelas meja, semua yang kosong.

Yang **ditambahkan** cuma pagarnya, di `test/venue.test.ts`: Smokehouse wajib
menawarkan semua meja makan kosong, dan SPL wajib TIDAK menawarkan VIP kepada
tamu reguler. Arah ini tidak pernah terlihat di simulasi — "tidak ditawarkan"
sama diamnya dengan "ditolak" — jadi kalau suatu hari saringan kelasnya
dilonggarkan untuk semua venue, berkas itulah yang berteriak.

```
venue 45 → 51 pemeriksaan · sisanya tidak berubah
```

## Menu lengkap — menunggu konfirmasi harga

Tautan folder **DATA WEB APP** tidak bisa dibuka isinya dari sini (hanya nama
foldernya yang terbaca). Yang terbaca adalah **UPDATE-BUKU-MENU (4).pdf**
(7 April 2026) di folder `SPL / menu` milik pemilik sendiri — lebih baru
sepuluh bulan dari `BUKU MENU SPL (6).pdf` (Juni 2025) yang dipakai menyusun
menu aplikasi.

Dua temuan, dan keduanya menahan pekerjaannya:

1. **± 95 hidangan belum ada di aplikasi**, termasuk delapan kategori yang
   sama sekali belum ada: Rice Bowl, Pendamping Nasi, Makanan Berkuah, Iga
   Traditional, Hot Plate, Steak, Others, dan dua kategori minuman.
2. **± 20 harga BERBEDA** dari yang ditagih kasir sekarang — bebek
   60.000 → 44.000, daging 55.000 → 40.000, ayam asap 36–37.000 → 28.000.

Tidak ada satu pun yang dipasang. Dua buku yang berbeda tidak bisa dua-duanya
benar, dan harga yang salah menagih setiap tamu malam itu dengan angka yang
salah — persis jenis kerusakan yang paling mahal dan paling sulit ditarik
kembali. Lembar konfirmasinya dikirim ke pemilik; begitu dijawab, seluruhnya
dipasang sekaligus.

Sebelas harga lain tidak terbaca pasti karena buku dua kolom dan cetakannya
saling tindih saat dibaca mesin (mis. Steak: 199.000 / 145.000 / 231.000 —
urutannya tidak jelas). Yang bertanda itu **tidak dipasang** sampai
dipastikan.

**PAKET 115 / 125 ketemu**: keduanya Smoke Grilled Beef Ribs — biasa dan
Double Cheese. **SATE dan DESSERT tidak ada di buku mana pun** yang bisa
dibaca, padahal foldernya berisi foto; kalau memang dijual, nama dan harganya
harus dikirim terpisah.

---

# Buku menu April 2026 dipasang · 19 Oktober 2026

> *"gunakan yg ada di gdrive saat ini sebagai patokan"*

Patokan harga berpindah dari `BUKU MENU SPL (6).pdf` (Juni 2025) ke
**`UPDATE-BUKU-MENU (4).pdf` (7 April 2026)**. Menu aplikasi **108 → 190
hidangan**, kategori **16 → 25**.

## Sembilan kategori yang sebelumnya tidak ada

| Kategori | Isi | Catatan |
|---|---|---|
| Pendamping Nasi | 13 | porsi kecil Rp 6.000–15.000 — selama ini tidak bisa ditagih sama sekali |
| Rice Bowl | 6 | |
| Makanan Berkuah | 6 | rumah folder foto "MENU BERKUAH" yang dulu tidak punya tempat |
| Iga Traditional | 5 | iga bakar bersambal, dipisah dari Beef Ribs persis seperti bukunya |
| Hot Plate | 4 | |
| Others | 9 | nasi putih, saus, emping |
| Kopi & Susu Sachet | 9 | kopi tubruk, Nutrisari, Extra Joss — minuman yang paling sering dipesan tamu biliar |
| Es Segar | 5 | |
| *(Steak)* | **0** | **belum dipasang** — lihat di bawah |

## Harga yang berubah

Delapan belas harga turun mengikuti buku. Yang terbesar:

| | Lama (buku 2025) | Baru (buku April 2026) |
|---|---|---|
| Bebek asap, 4 varian | 60.000 | **44.000** |
| Daging asap, 4 varian | 55.000 | **40.000** |
| Ayam asap & sauce, 5 varian | 36–37.000 | **28.000** |
| Cah Kangkung | 18.000 | **10.000** |
| Nasi Goreng Kampung | 33.000 | **29.000** |
| Kopi Susu Creamy | 40.000 | **35.000** |

Ditambah Kentang Goreng, Tahu Walik, Nugget, Sosis, Chicken Pop Corn, Capcay,
dan Sapo Tofu yang masing-masing turun Rp 1.000–3.000.

## Sebelas hidangan yang SENGAJA belum dipasang

Buku itu dicetak dua kolom, dan di beberapa halaman nama dan harganya saling
tindih saat dibaca mesin. Yang pasangannya tidak bisa dipastikan tidak
dimasukkan:

| Hidangan | Kemungkinan |
|---|---|
| Mie Goreng Ayam · Mienas | 26.000 atau 29.000 |
| Ayam Penyet · Ayam Cabe Ijo · Ayam Bakar Smoke House | 25.000 atau 28.000 |
| Smoked Sirloin · Tanderloin · Salmon Steak | 199.000 / 145.000 / 231.000, urutan tidak terbaca |
| Es Jeruk | 28.000 atau 23.000 |
| Orange Juice | tertulis dua kali: 25.000 dan 30.000 |
| Iga Bakar Jumbo (1,2 kg) 330.000 | kemungkinan hidangan yang sama dengan `fp-01`/`fp-02` |

Lebih baik hidangannya belum ada di layar daripada ada dengan harga yang
salah. Halaman STEAK karena itu belum punya kategori sama sekali — itu
hidangan termahal di buku, dan salah ke arah mana pun mahal.

## Yang TIDAK dibuang walau tidak ada di buku

Sembilan hidangan lama (Nasi Goreng Lada Hitam, Iga Slice Asap, Ayam Sauce
Rica Manado, Ice Honey Milk Tea, dll.) dan tujuh mocktail tetap tayang
dengan harga lamanya. Dua alasan:

1. **Halaman Mocktail-nya tidak terbaca** — mesin membacanya sebagai salinan
   halaman Milk Based. Itu cacat bacaan, bukan tanda hidangannya dihapus, dan
   Strawbery Mojito terjual hari ini juga.
2. **Risikonya tidak simetris.** Membuang hidangan yang ternyata masih
   dijual membuat kasir tidak bisa menagihnya malam itu juga — kerusakan
   langsung, di jam ramai. Membiarkan hidangan yang sudah tidak dijual
   paling-paling ditandai habis.

Akibatnya ada yang kelihatan ganjil di layar: Ayam Sauce Lada Hitam Rp 40.000
berdampingan dengan Ayam Asap Rp 28.000. Itu disengaja — pertanyaan yang
belum dijawab, bukan harga yang sudah diputuskan.

## Dua hal yang ikut diperbaiki karena menunya membesar

- **Strip kategori layar Counter** (`PesanTanpaMeja`) ikut dibungkus seperti
  layar pesan meja. Dengan 25 kategori, yang dulu "hampir muat" jadi
  separuhnya di luar layar — keluhan yang sama dengan yang dilaporkan pemilik
  pagi tadi, di layar yang berbeda.
- **Pagar data buku menu** (`test/smokehouse.test.ts`): id hidangan & kategori
  tidak boleh kembar, harga wajib bulat positif kelipatan seribu, station
  wajib dikenal mesin, dan rokok counter tidak boleh bocor ke menu HP tamu.
  Data yang diketik tangan rusak dengan cara yang sunyi: id kembar membuat
  stok yang satu dipotong penjualan yang lain, dan harga 0 membuat hidangan
  keluar dapur tanpa pernah ditagih.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 207 · 17 · 12 · 36 · 83 · 51
test:types nol galat · test:utc lolos · test:layar bersih · 118 pola mutasi cocok
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev (dicek, bundel live memuat harga baru)
```

---

# Paket pemilik muncul di kasir · 21 Oktober 2026

> *"untuk paket tidak bisa terlihat disini padahal ada paket siang, dan
> harusnya di setting ada tambahan untuk membuat menu paket tersendiri yg bisa
> di aktifkan selain paket siang … pastikan aktif dan muncul di menu booking
> dan cashier ketika mengaktifkan bill, dan pastikan fitur ini antara
> smokehouse dan spl sport terpisah."*

## Yang sudah ada, dan yang benar-benar hilang

Membuat paket sendiri **sudah bisa** sejak 9 Okt (tab Atur), dan paket sudah
muncul di booking online tamu. Yang hilang cuma satu, dan memang yang difoto
pemilik: **layar buka meja kasir**. Di situ hanya ada "Open bill" dan "Paket
per jam 1/2/3/4" — blok jam polos berharga tarif, bukan paket bernama milik
pemilik. Paket Siang tidak pernah kelihatan di sana.

## Kenapa tempatnya memang di situ, bukan di layar pesan

Paket bersewa waktu **tidak bisa** dijual sebagai baris bill, dan mesin
memang menolaknya (`addPaket`): harganya MENGGANTIKAN tarif per jam, jadi
menjualnya ke meja yang sudah jalan menagih harga bloknya tanpa memberi jam
mainnya — tamu membayar dua kali untuk jam yang sama.

Satu-satunya tempat yang benar adalah saat mejanya dibuka. Jadi aksi `walkin`
sekarang menerima `paketId`, persis seperti booking online memakainya:

| | Dari paket |
|---|---|
| Harga meja | `pk.price` — bukan tarif per jam, dan tidak bertambah per menit |
| Jam selesai | `pk.hours` dari sekarang |
| Jatah minuman | `pk.freeDrinks` |
| Isi paket | diserahkan **saat itu juga**: stok berkurang, dapur menerima tiketnya |

Syaratnya dibaca dari **`paketProblem`, fungsi yang sama dengan yang dipakai
booking online**. Dua pintu, satu aturan — kalau ditulis dua kali, cepat atau
lambat keduanya berbeda, dan yang berbeda itu harga yang ditagih ke tamu.
Alasan penolakannya juga diperjelas: dulu "syarat Paket Malam tidak
terpenuhi", sekarang "Paket Malam paling lambat mulai jam 20.00".

Di layar, paket pemilik dipisah dari "Paket per jam" karena memang beda
barang. Yang tampil hanya paket yang **pasti diterima** — daftarnya disaring
dengan `paketProblem` yang sama, jadi tidak ada tombol yang kelihatan hidup
lalu ditolak diam-diam. Paket Siang tidak muncul lewat jam 16.00, dan itu
benar.

## Terpisah per venue

| | |
|---|---|
| Tab Atur | daftar paket ikut venue yang sedang dibuka; paket baru lahir di venue itu |
| Buka meja | hanya paket venue meja itu — mesin menolak paket venue sebelah |
| Layar pesan | paket Smokehouse (0 jam) saja, lewat `addPaket` |
| Booking tamu | paket SPL bersewa waktu saja |

## Bug yang ditemukan simulasi sambil jalan

Begitu jalur paket baru ikut diacak di simulasi, **INV-28 langsung merah** —
dan yang ketahuan bukan kode baru, melainkan cacat lama:

> Jatah minuman dikembalikan untuk **setiap** baris Rp 0 yang di-void.

Padahal baris Rp 0 ada tiga macam, dan artinya berbeda semua: jatah minuman
paket, barang yang di-**compliment** (venue yang menanggung harganya), dan
**isi paket** (harganya sudah di dalam harga paket). Akibatnya: void satu
compliment di meja Paket Siang MENAMBAH jatah minuman tamu, dan venue memberi
gelas gratis yang tidak pernah dipakai siapa pun. Isi paket akan memperlebar
lubang yang sama.

Diperbaiki dengan satu definisi, `jatahMinuman`, dipakai di keempat tempat
yang mengembalikan jatah. Isi paket diberi tanda sendiri (`isiPaket`) supaya
tidak pernah tertukar dengan jatah minuman.

## Pagar

Uji baru (`test/rekap.test.ts`, 234 → 244 pemeriksaan): harga & lama dari
paket, jatah minuman jalan dari kasir, isi paket memotong stok dan masuk
dapur, serta penolakan di meja VIP, lewat jam mulai, lintas venue, paket
nonaktif, paket 0 jam, dan "paket + jam sekaligus". Ditambah uji regresi
compliment-di-meja-paket.

Simulasi ikut membuka meja dengan paket acak dari seluruh daftar, di meja
acak dari seluruh denah — justru supaya jalur yang DITOLAK ikut terinjak.

Tiga mutasi baru, ketiganya tertangkap; dua pola lama disegarkan karena
kodenya berubah. Mutasi #120 sempat LOLOS dan menemukan uji yang bolong:
pagar venue ternyata belum pernah diuji dari arah Smokehouse → SPL. Ujinya
ditambahkan.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 244 · 17 · 12 · 36 · 83 · 51
test:types nol galat · test:layar bersih · 121 pola mutasi cocok
dicoba di aplikasi: buat paket di Atur → muncul di buka meja kasir → meja terbuka
  dengan harga blok → paket yang sama muncul di booking tamu
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev
```

---

# Panel jejak & papan Smokehouse · 21 Oktober 2026

> *"untuk smoke house kalau bisa ada papan tampilan meja untuk monitoring …
> dengan pesanannya langsung yg di order … jejak aktivitasnya bisa dibuat
> lengkap bahkan sampai akun yg melakukannya … untuk rekap ini focus ke
> keuangan dan finance saja dan jejak aktivitas di panel khusus … pastikan di
> pisah juga antara spl sport dan smokehouse nya."*

## 1 · Papan Smokehouse menampilkan pesanannya

Ubin meja makan sekarang memuat isi pesanannya langsung: tiga hidangan
teratas (`2× Tempe Mendoan`), sisanya diringkas, dan satu baris amber
**"3 porsi di dapur"** untuk yang belum diantar.

Sengaja **tidak** dipasang di SPL. Di Smokehouse yang dipantau sepanjang
malam adalah "meja itu pesan apa, mana yang masih ditunggu dapur"; di SPL
yang dipantau meteran dan tagihan, dan 44 ubin berisi daftar hidangan cuma
jadi dinding teks.

## 2 · Jejak aktivitas pindah ke tabnya sendiri

Yang dulu ada di bawah tab Rekap: **12 baris terakhir, tanpa nama pelakunya,
dua venue bercampur** — padahal keterangan di bawahnya menjanjikan "tercatat
lengkap dengan siapa pelakunya". Yang dijanjikan memang tercatat sejak awal
(`note()` selalu menyimpan `who`); yang tidak ada cuma tempat untuk
membacanya.

Tab **Jejak** yang baru:

| | |
|---|---|
| Nama pelakunya | **di depan**, bukan di belakang — yang dicari saat panel ini dibuka hampir selalu "siapa" |
| Saringan jenis | Uang · Void & diskon · Meja · Pesanan · Pengaturan · Shift |
| Saringan orang | satu tombol per akun yang pernah muncul |
| Pencarian | nama, meja, atau kejadian |
| Pengelompokan | per **hari operasional** (berganti 05.00), bukan tanggal kalender |
| Penanda | kejadian yang menggerakkan uang diberi warna dan dijumlah di atas |

Batas simpan dinaikkan **500 → 2.000 baris**: di malam ramai dengan dua venue,
500 habis sebelum tengah malam, dan pemilik yang membuka panel besok pagi
tidak menemukan apa-apa dari shift kemarin. Ini tidak menambah apa pun yang
dikirim antar perangkat — yang dikirim kejadiannya, bukan state-nya, dan
riwayat yang sebenarnya memang jejak kejadian itu sendiri.

Izin barunya `lihatJejak` (superadmin · manager · finance). **Kru kasir dan
karyawan sengaja tidak diberi**, walau mereka boleh melihat laporan penjualan:
jejak ini ada untuk mengawasi orang lantai, dan yang diawasi tidak perlu
melihat catatan tentang dirinya lebih dulu. Finance ikut masuk — dialah yang
mencocokkan kas, dan selisih laci tidak pernah bisa dijelaskan tanpa melihat
siapa melakukan apa.

Tab **Rekap** sekarang tinggal uang.

## 3 · Terpisah per venue — dan satu pagar yang ikut dirapikan

Tiap baris jejak diberi **cap venue**, dipasang di SATU tempat (`capVenue` di
`reducer`), bukan di ~60 pemanggil `note()`. Satu pemanggil yang lupa berarti
satu baris yang hilang dari kedua panel — dan baris yang hilang dari jejak
audit adalah persis baris yang paling ingin disembunyikan orang.

Baris yang **tidak** dicap (tarif, pajak, menu, gudang) tampil di **kedua**
panel, karena memang milik keduanya. Menyembunyikan perubahan tarif dari
salah satu panel membuatnya seolah tidak pernah terjadi.

Untuk itu peta venue (`venueAksi`) dilengkapi dengan aksi tamu, yang selama
ini sengaja dikosongkan supaya pagar venue tidak menolaknya. Yang
dikecualikan sekarang **pagarnya** (`AKSI_LUAR_PAGAR`), bukan petanya — jadi
pesanan tamu tetap diterima di perangkat mana pun (INV-22/29/30 tetap hijau),
tapi jejaknya masuk panel yang benar.

## 4 · Tambah & hapus akun — sudah ada

Tab Atur → Akun staf sudah memuat semuanya sejak sebelumnya: tombol **"+
Tambah akun staf / superadmin"**, pilihan peran (7 peran), pilihan venue,
PIN, email, password, nonaktifkan, dan **hapus** dengan pagar (tidak bisa
menghapus superadmin terakhir yang mengurus kedua venue, atau orang yang
shiftnya masih buka). Daftarnya pun sudah berkelompok per venue. Tidak ada
yang perlu ditambah.

## 5 · Tambah MEJA — belum dikerjakan, dan ini alasannya

Daftar meja sekarang **konstanta di kode** (`TABLES` di `src/data/venue.ts`),
disentuh 20 tempat di mesin dan 15 berkas lain. Yang membuatnya bukan
pekerjaan sore ini adalah satu baris:

```ts
export const venueDari = (tableId: string): Venue =>
  SEMUA_MEJA.find((t) => t.id === tableId)?.venue ?? "spl";
```

Meja yang hanya ada di data — bukan di kode — tidak dikenali fungsi itu, dan
**jatuh ke "spl"**. Padahal `venueDari` dipakai pagar venue, cap jejak, dan
penyaringan paket. Meja makan baru yang diam-diam dianggap meja biliar
membuat kasir Smokehouse tidak bisa menyentuhnya, jejaknya masuk panel yang
salah, dan paket venue sebelah bisa membukanya.

Jadi memindahkan daftar meja dari kode ke data harus dikerjakan sebagai
perubahannya sendiri, dengan uji dan putaran simulasinya sendiri — bukan
ditempelkan di sore yang sama dengan empat perubahan lain. Disampaikan ke
pemilik, menunggu perintah.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 23 · soak · 40 · 19 · 18 · 244 · 17 · 12 · 36 · 83 · 62
test:types nol galat · test:utc lolos · test:layar bersih · 122 pola mutasi cocok
mutasi baru #122 (cap venue pada jejak) tertangkap; pola #101 disegarkan
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev
```

---

# Audit alur pesanan · 21 Oktober 2026

> *"di proses selesai namun tidak mengakhiri meja … padahal tadi saya sudah
> buat payment sampai akhir dan cetak struk, statusnya tidak berubah … ketika
> orderan di proses di dapur dan selesai, ini alurnya tidak tahu ke mana lagi
> … tolong audit dan cek lagi lebih dalam."*

## Temuan 1 · Struk tercetak untuk pembayaran yang tidak pernah tercatat

**Jawabannya ada di spanduk merah di foto itu sendiri:** *"Tidak tersambung ke
server … aksi uang ditahan sampai koneksi kembali. 29 aksi menunggu
dikirim."* Mejanya tidak berubah karena `settle` memang DITAHAN saat terputus
— itu bekerja sesuai rancangan (PRD sinkronisasi, keputusan 2).

Yang **tidak** bekerja adalah apa yang dilihat kasir. Jalur bayar selalu
lanjut ke layar struk apa pun jawaban mesin. Penolakannya cuma lewat sebagai
pesan sekejap, struk tercetak, tamu pulang — dan uangnya tidak ada catatannya.

Akarnya satu baris tipe:

```ts
dispatchA: (action: Action) => void;     // dulu
dispatchA: (action: Action) => string | null;   // sekarang
```

Penyimpanan **sudah** mengembalikan alasan penolakannya sejak awal. Tipenya
yang membuangnya — jadi seluruh layar memanggilnya seolah selalu berhasil.

Diperbaiki di lima jalur uang:

| Jalur | Dulu | Sekarang |
|---|---|---|
| Tutup tab & bayar | selalu lanjut ke struk | **tetap di layar bayar** kalau tidak satu pun tab tertutup |
| Tutup tab "lunas online" | selalu lanjut ke struk | sama |
| Bayar per orang | pesan tebakan ("melebihi sisa tagihan") | alasan dari mesin lebih dulu |
| Takeaway bayar di kasir | pesan tebakan ("buka shift dulu") | alasan dari mesin lebih dulu |
| Tutup shift | **diam saja** | alasannya ditulis di bawah tombolnya |

Pesannya pun tidak lagi sopan: *"Pembayaran TIDAK tercatat — mesin
menolaknya. Jangan cetak struk."* Struk untuk pembayaran yang tidak tercatat
adalah kebohongan yang dipegang tamu.

## Temuan 2 · Dua aksi uang lolos dari penahanan saat terputus

`paySplit` (bayar per orang) dan `settleOrder` (takeaway bayar di kasir)
mencatat pembayaran persis seperti `settle`, tapi tidak ada di daftar aksi
yang ditahan. Selama ini lolos.

Bahayanya bukan "uang tercatat dua kali" — mesin memang menolak penutupan
kedua saat jejaknya disatukan. Yang terjadi justru kebalikannya, dan lebih
buruk: perangkat yang terputus menerima pembayarannya di layar, kasir
mencetak struk, tamu pulang, lalu kejadiannya ditolak saat tersambung karena
sudah didahului perangkat lain. **Uang di laci, tanpa catatan.** Keduanya
sekarang ikut ditahan.

## Temuan 3 · Mata rantai yang putus antara dapur dan pramusaji

Dapur menandai READY di layarnya sendiri, lalu **tidak ada apa pun yang
memberitahu pramusaji** — dan satu-satunya tombol "Sudah diantar" ada di layar
DAPUR, orang yang tidak pernah tahu kapan makanannya sampai di meja.

Tab **Antar** yang baru, dibuat untuk orang yang berjalan:

- **dikelompokkan per meja**, bukan per hidangan — pramusaji membawa satu
  nampan untuk satu meja;
- **yang paling lama menunggu di atas**, dengan menitnya, dihitung sejak
  MATANG (bukan sejak dipesan): yang diukur berapa lama hidangan tergeletak
  di meja saji. Lewat 5 menit kartunya berubah amber;
- **satu tombol besar per meja** — tangannya sedang memegang piring;
- **nomor di tabnya** (biru, bukan merah: ini pekerjaan yang menunggu, bukan
  masalah), jadi tidak perlu dibuka untuk tahu ada yang menunggu;
- **penanda di papan**: ubin meja berubah dari amber "3 porsi di dapur" jadi
  biru **"3 porsi SIAP DIANTAR"**.

Terpisah per venue lewat `venueTiket` — tiket yang sasarannya sudah tidak ada
tampil di keduanya, karena tiket yang hilang dari dua-duanya adalah hidangan
yang tidak pernah diantar ke siapa pun.

## Yang diperiksa dan ternyata sudah benar

| Alur | Hasil |
|---|---|
| Booking online: hold → bayar → booked → check-in → running | utuh, termasuk pelepasan no-show T+20 |
| Pesanan QR tamu di meja | masuk bill + tiket dapur; meja makan kosong ikut terbuka sendiri |
| Kasir offline: buka meja → pesan → tiket → bayar | utuh |
| Tutup tab → meja hijau lagi | benar — yang gagal kemarin karena penahanan offline di atas |
| Pembayaran ganda dua perangkat | ditolak mesin saat jejaknya disatukan |

## Pagar baru

`test/sync.test.ts` menjaga daftar aksi yang ditahan DUA ARAH: enam aksi uang
wajib ditahan, dan tujuh aksi pelayanan (buka meja, pesan, check-in, tiket,
buka shift, lampu, pindah pesanan) wajib TETAP jalan — kalau ikut ditahan,
venue berhenti melayani hanya karena internetnya mati.

`test/smokehouse.test.ts` menjaga antrean antar sepanjang siklusnya: baru
masuk → dimasak → matang (masuk antrean) → diantar (keluar antrean), termasuk
bahwa venue sebelah tidak pernah melihatnya.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 38 · soak · 40 · 19 · 18 · 244 · 17 · 12 · 36 · 91 · 62
test:types nol galat · test:layar bersih · 123 pola mutasi cocok
mutasi baru #123 (dua aksi uang lolos saat terputus) tertangkap
dicoba di aplikasi: dapur tandai READY → muncul di tab Antar dengan menit tunggunya
  → "Sudah diantar" → hilang dari antrean & nomor tabnya turun
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev
```

---

# Tambah meja & sambungan server · 21 Oktober 2026

> *"dari saran perbaikan tadi tolong lakukan dan after itu konek ke server
> biar update"*

## 1 · Sambungan server — diperiksa dulu, karena itu yang paling mendesak

Diperiksa langsung ke servernya, bukan ditebak:

| Yang diperiksa | Hasil |
|---|---|
| Kredensial ikut terbangun ke bundel yang tayang | **ya** — URL + publishable key ada di berkasnya |
| Server menjawab | **ya** — HTTP 200, `genesis_at` terbaca |
| Logika coba-ulang | ada — mundur berlipat 2 → 30 detik, plus saat tab terlihat lagi |

Jadi backend-nya sehat dan aplikasinya memang mencoba sendiri. Spanduk merah
di foto pemilik berarti perangkat itu yang sedang tanpa jaringan.

Dua hal tetap diperbaiki, karena menunggu 30 detik di depan tamu terasa
seperti aplikasi yang menyerah:

- **Sambung seketika saat jaringan kembali.** Peristiwa `online` dari peramban
  menyala tepat saat perangkat mendapat jaringan lagi; sebelumnya perangkat
  menunggu jadwal coba-ulang berikutnya.
- **Tombol "Coba sambungkan sekarang" di spanduknya sendiri.** Yang pertama
  dilakukan orang saat melihat peringatan adalah mencari tombol.

Kalimat spanduknya juga diperbaiki: sekarang menyebut **bayar per orang** dan
**takeaway** (keduanya ikut ditahan sejak audit kemarin), dan menegaskan
*"semuanya terkirim sendiri begitu tersambung; tidak ada yang hilang"* —
karena itulah yang paling ingin diketahui kasir yang melihat 29 aksi
menumpuk.

## 2 · Tambah meja

### Rancangannya: yang pindah ke data cuma SATU hal

Daftar meja TETAP di kode. Yang pindah ke data adalah **meja mana yang sedang
dijual** (`mejaPakai`, disimpan sebagai selisih dari bawaan).

Alasannya satu baris:

```ts
export const venueDari = (tableId: string): Venue =>
  SEMUA_MEJA.find((t) => t.id === tableId)?.venue ?? "spl";
```

Venue dan kelas sebuah meja dibaca banyak fungsi **murni** yang tidak
memegang state — `venueDari` (dipakai pagar venue, cap jejak, saringan
paket), `typeOf`, `punyaLampu`. Meja yang hanya ada di data tidak dikenali
fungsi-fungsi itu dan jatuh ke tebakan: meja makan baru diam-diam dianggap
meja biliar, kasir Smokehouse tidak bisa menyentuhnya, dan **tarif
Rp 29.000/jam mulai berjalan di meja yang seharusnya Rp 0**.

Dengan katalog di kode, tidak ada yang ditebak. Harganya: ada batas.

### Katalog cadangan

| Venue | Cadangan siap pakai |
|---|---|
| SPL Sport | Meja 41–56 (reguler) + VIP 5–8 |
| Smokehouse | R13–R24 (lantai 1) + 12 meja lantai 2 yang sudah ada sejak 12 Okt |

Totalnya 100 meja dikenal mesin, 56 dijual sebagai bawaan. Kalau suatu hari
kurang, menambah baris di `CADANGAN` satu pekerjaan sebentar.

### Yang bisa dilakukan pemilik

Tab **Atur → Meja {venue}**, dan bagian ini sekarang **ikut venue yang sedang
dibuka** (dulu selalu menampilkan meja biliar):

- **Tambah meja** — ketuk salah satu kotak bergaris putus. Langsung muncul di
  papan kasir **dan** di booking tamu; namanya bisa diganti sesudahnya.
- **Tarik meja dari denah** — beda dengan "rusak". Rusak = sementara, mejanya
  tetap di papan dengan tanda silang. Ditarik = mejanya memang tidak ada lagi
  di ruangan, jadi hilang dari papan, dari booking tamu, dan dari penyebut
  utilisasi. **Riwayatnya tetap utuh** — sesi lama tetap terbaca namanya.
- Meja yang masih ada tamunya **tidak bisa ditarik** (pagar yang sama dengan
  menandai meja rusak).

Denahnya ikut **diterbitkan ke aplikasi tamu**. Tanpa itu meja baru ada di
kasir, kosong semalaman, dan tidak seorang pun bisa memesannya.

### Yang disentuh

35 tempat yang dulu membaca daftar meja di kode kini membaca denah
(`mejaDijual`) atau katalog (`cariMeja`), dipilih per tempat sesuai perannya:

| Peran | Memakai | Kenapa |
|---|---|---|
| Mencari satu meja | `cariMeja` (katalog) | sesi lama di meja yang ditarik tetap terbaca namanya |
| Menampilkan denah | `mejaDijual` | papan, booking, pindah meja, reservasi, utilisasi |
| Pagar "boleh dibuka" | `mejaDipakai` | meja yang tidak dijual tidak bisa dibuka atau dibooking |

## Pagar

19 pemeriksaan baru di `test/venue.test.ts`, termasuk yang paling penting:
**meja makan cadangan yang baru diaktifkan wajib berkelas `resto` dan
meterannya wajib Rp 0**. Ditambah: meja yang belum dijual tidak bisa dibuka,
meja yang masih ada tamunya tidak bisa ditarik, kru kasir tidak bisa menambah
meja, dan kasir SPL tidak bisa menambah meja Smokehouse.

Dua mutasi baru, keduanya tertangkap — salah satunya persis bug yang
dikhawatirkan: kelas meja ditebak, bukan dibaca katalog.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 38 · soak · 40 · 19 · 18 · 244 · 17 · 12 · 36 · 91 · 81
test:types nol galat · test:layar bersih · 125 pola mutasi cocok
dicoba di aplikasi: Atur → tambah "Meja 41" → langsung muncul di papan sebagai meja kosong
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev
```

---

# Sesi staf & jam kejadian · 21 Oktober 2026 (malam)

> *"bantu agar bisa terhubung ke server"* · *"waktu untuk pesanan di proses
> ini juga tidak akurat … harusnya tidak mengikuti jam saat ini, kan punya
> waktu mulai dan proses yang beda-beda, tolong audit detail terkait ini"*

Dua laporan, satu akar yang sama: **perangkat yang terputus berjam-jam.**

## Temuan A · "Tidak tersambung ke server" padahal servernya sehat

Dibuktikan langsung ke server, bukan ditebak:

```
POST /rest/v1/rpc/fetch_events   (token kedaluwarsa)
→ {"code":"42501","message":"sesi tidak sah"}
```

Server **hidup dan menjawab**. Yang mati **sesi stafnya** — token venue
berlaku 12 jam. Begitu habis, server menolak setiap kiriman, remote membuang
tokennya, `push` mengembalikan `kedaluwarsa`, dan penyimpanan memanggil
`markOffline()`.

Jadi layar menampilkan **pesan jaringan untuk masalah yang sama sekali bukan
jaringan**. Lebih buruk: pesan yang benar sebenarnya sudah ada
(`problem = "Sesi PIN habis — masukkan PIN lagi."`), tapi spanduknya hanya
muncul saat `sync.online` — yaitu persis keadaan yang TIDAK sedang terjadi.
Kasir menekan "coba sambungkan" berkali-kali, antreannya menumpuk sampai 41
aksi, dan satu-satunya yang perlu dilakukan tidak pernah disebutkan.

**Diperbaiki:**

| | |
|---|---|
| `SyncInfo.sesiHabis` | sesi mati dibedakan dari jaringan putus, dibaca dari remote-nya sendiri |
| Spanduk sendiri | amber: *"Sesi staf sudah habis — bukan masalah jaringan"*, + tombol **Masuk lagi sekarang** |
| Antrean | disebutkan ikut aman: *"tersimpan dan langsung terkirim begitu Anda masuk"* |
| Aksi uang | **ikut ditahan selama sesi mati** — lihat di bawah |
| Pesan mesin | ditampilkan juga saat terputus; dulu hanya saat tersambung |

Lubang yang ikut ketahuan: selama antrean masih kosong, perangkat mengira
dirinya tersambung (menarik jejak memang tidak butuh sesi). Kasir bisa
menutup tab, layarnya menampilkan tab tertutup — lalu kirimannya ditolak dan
uangnya tidak pernah tercatat. Sekarang sesi mati menahan aksi uang persis
seperti jaringan putus.

## Temuan B · Jam tiket dapur semuanya sama

Semua tiket tertulis **"Masuk kasir 20.56 · Ready 20.56 · 0m"**, padahal
dipesan dan dimasak pada jam yang berbeda-beda.

Penyebabnya di server (`supabase/schema-pin.sql`):

```sql
select greatest((extract(epoch from clock_timestamp()) * 1000)::bigint,
                coalesce(max(at_ms), 0) + 1) into v_at from public.venue_events …
```

Jam kejadian ditetapkan **saat kiriman tiba**, dan `Proposal` tidak pernah
membawa jam perangkat. Selama tersambung itu benar — selisihnya sepersekian
detik. Tapi 41 aksi yang menumpuk berjam-jam **semuanya dicap jam yang sama**
saat akhirnya terkirim.

### Yang tidak terlihat di layar jauh lebih mahal

Bukan cuma tampilan. Meja yang dibuka pukul 18.00 ikut tercatat mulai 20.56
— jadi **meterannya menagih tiga jam lebih sedikit**. Begitu pula jam tutup
tab menentukan hari operasional dan shift mana yang menerima uangnya.

### Perbaikannya

Perangkat menitipkan jamnya sendiri di dalam aksinya (`at0`; server menyimpan
`act` apa adanya sebagai JSONB, jadi **tidak perlu migrasi SQL**), dan mesin
memakainya lewat `jamKejadian` — dengan dua pagar:

- **tidak pernah lebih lambat dari jam server**, supaya jam perangkat yang
  salah atau dimajukan tidak bisa mengarang kejadian di masa depan atau
  menggeser omzet ke hari berikutnya;
- **tidak lebih dari sehari lebih awal** (`MAKS_ANTRE_MS`); lebih dari itu,
  jam perangkatnyalah yang patut dicurigai.

**URUTAN kejadian tetap milik server** (`entryOrder` tetap memakai jam
server). Yang diubah hanya jam yang dicatat, bukan siapa duluan — dan
jejak lama tanpa `at0` diputar ulang persis seperti sebelumnya.

Diubah di **satu tempat**: `inEntry`, satu-satunya fungsi yang menetapkan jam
mesin saat jejak diputar ulang.

## Yang tetap tidak bisa diperbaiki

**41 aksi yang sudah terlanjur menumpuk** di perangkat pemilik akan tetap
mendarat dengan jam yang sama saat terkirim: jam aslinya memang tidak pernah
tercatat di mana pun. Yang bisa dilakukan hanya memeriksa Rekap sesudah
tersambung. Perbaikan di atas berlaku untuk aksi berikutnya.

## Pagar

8 pemeriksaan baru di `test/rekap.test.ts` — termasuk yang menjaga uangnya:
meja yang dibuka tiga jam sebelum kirimannya sampai **wajib menagih tiga jam,
bukan nol**. Ditambah: jam perangkat yang maju diabaikan, mundur lebih dari
sehari dipotong, jejak lama tanpa `at0` tidak berubah perilakunya, dan dua
aksi yang menyusul bersamaan tetap punya jamnya masing-masing.

4 pemeriksaan baru di `test/remote.test.ts`: sesi habis dibedakan dari
jaringan putus, aksi uang ditahan, aksi pelayanan tetap jalan, dan tandanya
hilang sesudah masuk lagi.

4 mutasi baru, semuanya tertangkap.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 38 · soak · 44 · 19 · 18 · 252 · 17 · 12 · 36 · 91 · 81
test:types nol galat · test:utc lolos · test:layar bersih · 127 pola mutasi cocok
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev
```

---

# Mode demo & audit bahasa layar · 23 Oktober 2026

> *"apakah ada tombol khusus di pengaturan untuk mematikan pengunci ini agar
> saya bisa melakukan keseluruhan simulasi di jam kapan pun … dan tolong audit
> keseluruhan text yang ada … pastikan bahasa yang digunakan bukan bahasa AI
> atau bahasa program penjelasan."*

## 1 · Mode demo — Atur → Mode demo → "Nyalakan mode demo"

Meja hanya bisa dibuka pukul 11.00–02.00. Sekarang pagar itu bisa dibuka
untuk peragaan.

**Yang dibuka hanya JAM.** Enam pagar jam dilonggarkan sekaligus lewat satu
fungsi (`dalamJamBuka`), bukan dengan mengubah `OPEN_IDX`/`CLOSE_IDX` — jadi
jam buka yang sebenarnya tetap satu angka yang jelas di kode, dan semua yang
dilonggarkan bisa dilihat dari satu tempat.

**Yang TIDAK ikut longgar**, dan diuji satu per satu:

| | |
|---|---|
| Harga & tarif | tetap — meteran tetap menagih seperti biasa, bukan nol |
| Izin peran | tetap — kru kasir tidak bisa menyalakan/mematikannya |
| Pagar venue | tetap — kasir SPL tetap tidak bisa membuka meja Smokehouse |
| Denah meja | tetap — meja yang belum dijual tetap tidak bisa dibuka |
| Penahanan uang saat terputus | tetap |

Saklarnya **superadmin saja**, bukan manajer: ini satu-satunya saklar yang
melonggarkan aturan mesin, dan manajer yang bisa menyalakannya berarti meja
bisa dibuka pukul 08.00 tanpa sepengetahuan pemilik. Pengecualian izin ini
ditulis terang-terangan di `test/peran.test.ts`, bukan disembunyikan dengan
melemahkan ujinya.

Dua hal yang membuatnya tidak bisa tertinggal menyala: **spanduk amber di
semua layar** selama menyala, dan penyalaannya **tercatat di Jejak** lengkap
dengan nama pelakunya.

## 2 · Audit bahasa layar

Yang diperiksa: seluruh teks yang dirender di `src/screens` dan
`src/components` — sisi tamu dan sisi staf.

**Sisi tamu ternyata sudah bersih.** Kalimatnya sudah bersuara venue, bukan
suara aplikasi: *"Kasih tahu tanggal dan berapa orang — meja, dapur, dan
jamnya kami siapkan."* Tidak ada yang diubah di sana.

**Yang bocor ada di sisi staf**, dan hampir semuanya kalimat yang saya tulis
sendiri beberapa hari terakhir:

| Dulu | Sekarang |
|---|---|
| "Pembayaran TIDAK tercatat — mesin menolaknya" | "Pembayaran belum tercatat. Jangan cetak struk dulu — periksa shift masih buka…" |
| "Sesi staf sudah habis — bukan masalah jaringan" | "Waktu masuk Anda sudah habis. Internetnya tidak apa-apa — Anda cuma perlu masuk lagi dengan PIN." |
| "Tidak tersambung ke server. Papan tetap bisa dibaca dan dilayani — aksi uang … ditahan" | "Internet terputus. Melayani tamu tetap bisa jalan — buka meja, catat pesanan, antar makanan. Yang ditahan dulu cuma yang menyangkut uang…" |
| "41 aksi menunggu dikirim" | "41 catatan belum terkirim — semuanya aman" |
| "Database pelanggan tersimpan di server" | "Daftar pelanggan tersimpan di pusat data" |
| "LUNAS — webhook sampai, rantainya benar" | "LUNAS — semuanya tersambung benar" |
| "Secret key … hanya Edge Function yang memegangnya" | "Kunci rahasianya … hanya disimpan di pusat data" |
| "Potongan MDR gateway" | "Potongan biaya QRIS & kartu" |
| "Riwayat yang sebenarnya adalah jejak kejadian itu sendiri — diputar ulang sama persis" | "Catatan lengkapnya tersimpan utuh dan sama di semua perangkat" |

Blok "Untuk yang memasang · sekali saja" di panel QRIS **sengaja tetap
teknis**: isinya jalur menu di dalam produk orang lain (Supabase, dashboard
penyedia pembayaran) yang harus diketik persis. Yang diubah judulnya, supaya
jelas bagian itu bukan untuk pemilik.

## 3 · Pagar supaya tidak balik lagi

`npm run test:bahasa` (`scripts/cek-bahasa.mjs`) memindai setiap kalimat yang
dirender dan menolak 21 kata yang tidak pernah punya urusan di layar siapa
pun — webhook, database, payload, endpoint, "mesin menolak", "aksi uang", dan
seterusnya. Audit sekali jalan akan luntur dalam sebulan; berkas inilah yang
membuatnya bertahan.

**Versi pertamanya cacat dan hampir lolos.** Ia memindai per baris, padahal
teks JSX hampir selalu memanjang beberapa baris — jadi ia melaporkan "bersih"
sambil hampir tidak memeriksa prosa sama sekali. Ketahuan karena sebuah
pelanggaran sengaja ditanam dan lolos. Sesudah ditulis ulang (memindai
seluruh isi berkas, nomor baris dihitung dari posisi temuan), jumlah kalimat
yang benar-benar diperiksa naik dari 2.499 potongan campur-kode menjadi
**2.952 kalimat** — dan langsung menemukan satu "mesin menolak" yang
terlewat di layar Gudang.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 38 · soak · 44 · 19 · 18 · 265 · 17 · 12 · 37 · 91 · 81
test:types nol galat · test:layar bersih · test:bahasa bersih · 127 pola mutasi cocok
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev
```

---

# Halaman depan dirombak · 25 Oktober 2026

> *"tampilan landing page ini menurut saya masih berantakan dan masih jelek
> sekali, tolong perbaiki, saya kirim referensi di foto 2, namun pastikan untuk
> color dan warna masih dengan guidance rule dan font dari SPL … gunakan foto2
> dari SPL Sport dan menu yang sudah pernah saya bagikan sebelumnya di gdrive.
> pastikan fungsi keseluruhannya tidak ada yang berubah."*

## 1 · Biang "berantakan"-nya: font judulnya memang salah

Semua judul di halaman itu memakai **Emoland** — font ANGKA kondensasi yang
oleh `docs/lampiran/L7-design-system.md` §7.4.1 **dilarang untuk kalimat**.
Satu halaman penuh kalimat kapital kondensasi terbaca sempit, rapat, dan
berteriak. Itu bukan selera; itu aturan yang sudah tertulis dan dilanggar.

Sekarang:

| Font | Perannya di halaman ini |
|---|---|
| **Lido STF** (`font-serif`) | semua judul — persis `--t-display-1`/`--t-h1` di skala §7.4.3 |
| **Emoland** (`font-display`) | hanya ANGKA (tarif, jumlah meja, jam) dan label kapital pendek |
| **Jazzbury** (`font-script`) | satu kali saja di seluruh layar: *"Sports Pool Lounge"* di hero (§7.4.1) |

## 2 · Tiga hal lain yang diperbaiki

**Fotonya dipakai sebagai LATAR, bukan sebagai barang.** Foto venue digelapkan
sampai 80% lalu ditulisi — hasilnya bukan foto, melainkan bidang coklat
berisik. Sekarang fotonya berdiri di dalam bingkai dengan kontras penuh, dan
kedalamannya datang dari dua foto yang saling menumpang: foto hidangan di
belakang, foto pemain biliar menumpang di depannya dengan cincin gelap di
tepinya. Foto yang menutupi foto lain selalu lebih meyakinkan daripada efek
apa pun di atas satu foto.

**Semuanya kartu, dan semuanya di tengah.** Satu radius, satu border, satu
isian — dari tarif sampai lowongan kerja — jadi tidak ada yang terbaca lebih
penting dari yang lain. Sekarang tiap bagian punya bentuknya sendiri:

| Bagian | Bentuknya |
|---|---|
| Hero | dua kolom, tumpukan foto bertumpang-tindih |
| Angka venue | pita keterangan satu baris, bukan empat ubin angka besar |
| SPL Sport | daftar tarif bergaris rambut + satu foto tegak |
| Smokehouse | korsel 3D + daftar poin, lockup maroon |
| Suasana | pita foto lebar penuh, tinggi sama & lebar mengikuti rasio aslinya |
| Kerja sama | tiga kolom bergaris, tanpa bingkai |
| Mampir | dua kolom: ajakan + tabel keterangan |
| Penutup | pita gelap dengan lambang SPL besar di belakangnya |
| Kaki halaman | empat kolom tautan |

**Tidak ada navigasi.** Halaman sepanjang ini tanpa kepala berarti orang harus
menggulir balik ke atas untuk memesan. Sekarang ada bilah atas yang menempel,
dengan tombol Booking yang selalu terlihat.

## 3 · Dua pelanggaran kontras yang ikut ketahuan

Keduanya bukan bawaan ronde ini, tapi diperbaiki sekalian karena memang salah:

| Yang salah | Angkanya | Sekarang |
|---|---|---|
| Lockup "SMOKEHOUSE RESTO" ditulis dengan huruf maroon 11 px | 2,73:1 — gagal | maroon jadi LATARNYA, hurufnya cream — 8,10 (AAA), bentuk yang memang ditulis `DS-05` |
| Tombol "Lihat Buku Menu" berlatar maroon | — | amber dengan teks near-black. `DS-02`: satu warna aksi di seluruh aplikasi. Maroon warna **wilayah**, bukan warna tombol |

## 4 · Yang sengaja TIDAK berubah

- **Semua tujuan tombol sama persis.** Yang berubah rupanya, bukan ke mana
  perginya. Korsel hidangan yang diminta 13 Okt tetap di tempatnya.
- **Tidak ada angka karangan.** Tarif, jumlah meja, jumlah kategori, dan isi
  Paket Siang dibaca dari data venue yang berlaku — meja yang ditambah pemilik
  lewat Atur ikut terhitung tanpa menyentuh berkas halaman depan. Kalau Paket
  Siang dimatikan di panel admin, barisnya hilang dari daftar tarif, bukan jadi
  janji yang tidak ditepati kasir.
- **Fotonya foto venue sendiri.** Lima belas foto SPL Sport dan foto produk
  Smokehouse dari folder pemilik; tidak ada satu pun foto stok.

## 5 · Yang diperiksa

Dibuka sungguhan di dua lebar: **360 px** (lebar rancangan wajib `DS-00d`) dan
1366 px. Tidak ada geseran mendatar di keduanya, judul hero berhenti di dua
baris di desktop, dan tombolnya terlihat tanpa menggulir di layar 360×800.
Gerakan muncul-saat-tergulir menghormati `prefers-reduced-motion` lewat
`useReducedMotion` — pagar CSS di `index.css` hanya mematikan animasi CSS,
gerakan yang digerakkan JS lolos dari pagar itu.

```
36 · 41 · 100/100 simulasi, 57/57 invariant · 38 · soak · 44 · 19 · 18 · 265 · 17 · 12 · 37 · 91 · 81
699 pemeriksaan hijau · test:types nol galat · test:layar bersih
test:bahasa bersih (2.988 kalimat) · test:utc 81 · 127 pola mutasi cocok
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev
```

## 6 · Hero diganti jadi layar sambutan penuh · 25 Oktober 2026 (lanjutan)

> *"bagian ini saya tidak suka jelek sekali, tolong cari format layout lain
> dan saya ingin ada animasi motion-nya juga. dan bisa dibuat full saja untuk
> welcome screen awal landing page untuk fotonya."*

**Tata letaknya diganti, bukan dirapikan.** Yang tadi: dua kolom, foto di
kanan dalam bingkai — rapi, tapi fotonya jadi ILUSTRASI di sebelah teks.
Sekarang fotonya jadi RUANGANNYA: satu layar penuh, teksnya berdiri di sudut
bawah-kiri seperti poster, dan pita angka venue menempel di kakinya supaya
layar pertama selesai dalam satu layar.

**Empat gerakan, masing-masing ada alasannya:**

| Gerakan | Kenapa |
|---|---|
| Foto berganti tiap 7 detik | satu foto hanya bisa menceritakan satu dari dua venue; bergantian menceritakan keduanya tanpa memotong layar jadi dua |
| Zoom sangat pelan | bidang sebesar ini kalau diam terbaca seperti gambar yang ditempel |
| Foto bergeser lebih lambat dari halaman saat digulir | beda kecepatan inilah yang membuat layar terasa punya kedalaman |
| Baris teks naik bergantian saat dibuka | urutan bacanya jadi terarah: nama venue, janji, keterangan, tombol |

Semuanya `transform` dan `opacity` saja — tidak ada satu pun perhitungan tata
letak yang diulang tiap frame. Foto pertamanya saja yang ikut muatan pertama;
dua sisanya baru diminta sesudah lukisan pertama selesai, karena anggaran
gambar muat-pertama 180 KB (L7 §7.5.2 `AST-01`) dan pergantian fotonya sendiri
baru terjadi tujuh detik kemudian.

### Satu kesalahan yang ketahuan dan diperbaiki

Versi pertama gerakan masuknya memakai pustaka gerakan (JavaScript). Hasilnya
**layar sambutan berdiri KOSONG beberapa detik tiap kali halaman dibuka** —
pustakanya menahan teks di opasitas nol sampai ia sendiri sempat jalan, dan di
tab yang sedang tidak dilihat ia tidak jalan sama sekali. Teks hero adalah
kalimat terpenting di seluruh situs; ia tidak boleh menunggu siapa pun.

Sekarang gerakan masuknya **animasi CSS**: jalan sejak lukisan pertama dan
tidak bisa digagalkan oleh apa pun di luar berkas gaya. Sekalian satu pagar
lama diperbaiki — blok `prefers-reduced-motion` di `index.css` dulu cuma
memendekkan DURASI animasi, jadi animasi berjeda setengah detik tetap
menyembunyikan isinya selama itu. Sekarang jedanya ikut dinolkan.

Kegelapan untuk teksnya ditaruh **di tempat teksnya** (pita dari bawah + kolom
dari kiri), bukan selembar di atas seluruh foto — separuh kanan atas fotonya
tetap utuh kontrasnya.

```
699 pemeriksaan hijau · 100/100 simulasi, 57/57 invariant
test:types · test:layar · test:bahasa · test:pola — bersih
diperiksa di 360×800 dan 1366×860: muat satu layar, tanpa geseran mendatar
terbit: spl-kasir.pages.dev · spl-tamu.pages.dev
```
