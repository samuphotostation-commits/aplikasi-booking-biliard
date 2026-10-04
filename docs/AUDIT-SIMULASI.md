# Audit Menyeluruh & 100 Simulasi — SPL Booking

Tanggal: 13–15 & 22 September 2026 · 4 putaran · Cakupan: seluruh aplikasi (mesin inti, meteran, layar pelanggan, panel kasir/superadmin, penyimpanan & sinkronisasi, ketahanan berminggu-minggu)

Tujuan audit (permintaan pemilik): memastikan tidak ada yang kurang, semuanya **tersinkronisasi dan benar-benar berfungsi — bukan hanya tampilan**. Putaran 4 (permintaan 15 September): **matangkan dulu sebelum sinkronisasi HP ↔ tablet kasir dan aplikasi Windows/Android** — lihat `docs/PRD-SINKRONISASI-APLIKASI.md`.

---

## 1. Hasil akhir

| Pemeriksaan | Sebelum audit | Putaran 3 | Sesudah putaran 4 |
|---|---|---|---|
| 100 simulasi hari operasional | **0/100** bersih | 100/100 | **100/100** bersih |
| Invariant (aturan yang tidak boleh dilanggar) | **6/28** lolos | 41/41 | **43/43** lolos |
| Uji mutasi (bug nyata dimasukkan kembali — apakah tertangkap?) | belum ada | 48/48 | **67/67** tertangkap |
| Uji ketahanan berhari-hari (`test/soak.test.ts`) | — | — | **5/5** aturan, 14 hari (30 hari lolos) |
| Uji sinkronisasi antar-tab (`test/sync.test.ts`) | — | 10/10 | **23/23**, dibandingkan dengan pemutaran ulang semua kejadian |
| Uji sinkronisasi **lintas perangkat** (`test/remote.test.ts`, tahap S1) | — | — | **39/39**, dibandingkan dengan jejak resmi server |
| Uji okupansi meja & jam | 29/29 | 29/29 | 29/29 |
| Uji tagihan & promo | 23/23 | 30/30 | 30/30 |
| Typecheck TypeScript & build produksi | lolos | lolos | lolos |
| Uji end-to-end di browser | — | lolos | lolos, tanpa error konsol |

Satu simulasi berisi 80–100 langkah acak ditambah skenario terarah; total ±18.000 aksi ke mesin, dan setelah **setiap** aksi 43 invariant diperiksa. Di akhir setiap simulasi, seluruh jejaknya diputar ulang di "perangkat lain" (termasuk dengan urutan kejadian diacak) — ±1.250 putar-ulang — dan hasilnya wajib identik.

| Ketahanan (uji 10 hari, komputer yang sama) | Sebelum putaran 4 | Sesudah |
|---|---|---|
| Biaya per aksi hari ke-1 → hari ke-10 | 310 → **3.133 µs** (terus naik) | ±60–110 µs (konstan) |
| Membuka aplikasi setelah 10 hari | **14,5 detik** | 0,6 detik |
| Sesi yang ikut dipindai setiap aksi | 934 dan terus bertambah | ±110–220 (hari ini & kemarin) |
| Penyimpanan perangkat | ±1,3 MB per 10 hari → penuh ±5 minggu | 280 KB untuk 8 hari, stabil |

---

## 2. Cara audit dilakukan

1. **Mesin inti dipisah dari tampilan** (`src/lib/engine.ts`, meteran di `src/lib/billing.ts`). Semua aturan uang, meja, stok, void, shift, hold, dan pesanan hidup di satu tempat. Layar hanya mengirim niat dan membaca hasil — sesudah putaran 3, layar juga **membaca ulang hasil dari mesin** setelah setiap aksi penting (check-in, void, pindah meja, perpanjang, tandai refund), jadi tidak pernah menampilkan "berhasil" untuk aksi yang ditolak.
2. **100 simulasi acak tapi bisa diulang** (`test/simulation.test.ts`), empat jenis hari: *ramai*, *ganti shift*, *lintas hari* (melewati 02.00), dan *adversarial*. Ditambah **skenario terarah** untuk kasus yang jarang muncul secara acak: perpanjangan menjelang 02.00, meteran presisi 54 menit, tanda habis manual + koreksi stok, tamu booking menunggu lalu open bill penghalangnya di-void **atau dipindah meja**, HP rombongan lama memesan ke tab yang sudah ditutup, takeaway yang sebagian sudah diserahkan lalu di-void, booking Paket Siang yang hangus lalu dipulihkan saat minuman gratisnya sudah habis, tutup hari dengan tab yang dibiarkan jalan lintas hari.
3. **Uji mutasi** (`test/mutation.mjs`): 67 bug yang pernah/berpotensi ada dimasukkan kembali satu per satu ke mesin, meteran, penyimpanan, dan lapisan lintas perangkat, lalu dijalankan terhadap simulasi, uji tagihan, uji ketahanan, uji sinkronisasi antar-tab, dan uji lintas perangkat. Kalau tidak tertangkap, ujinya dianggap bolong dan diperkuat. Berkas yang dimutasi selalu dipulihkan, juga bila proses terhenti paksa.
4. **Audit independen (putaran 3)**: tiga pemeriksa terpisah — uang & meja, F&B, sinkronisasi — mencari cacat yang lolos; setiap klaim wajib dibuktikan dengan skrip yang bisa diulang sebelum diperbaiki.
5. **Uji sinkronisasi antar-tab** (`test/sync.test.ts`) dengan browser tiruan: 12 dunia × 3 tab × 250 aksi dengan siaran yang tiba acak harus berakhir identik; reset data saat ada tab basi; muat ulang; penyimpanan penuh. Tes ini dibuktikan bisa gagal: saat perbaikan cap genesis dimatikan, 5 dari 10 pemeriksaan merah.
6. **Uji end-to-end di browser** dengan beberapa tab (panel kasir, dapur, HP pelanggan).

---

## 3. Temuan & perbaikan

### Putaran 4 — pematangan sebelum sinkronisasi lintas perangkat

| # | Tingkat | Temuan | Dampak nyata | Perbaikan |
|---|---|---|---|---|
| 4.1 | kritis | Setiap aksi memindai seluruh riwayat sejak hari pertama | Aplikasi 10× lebih lambat setelah 10 hari; membuka aplikasi 14,5 dtk (tablet >1 menit) | Tutup buku harian otomatis: hari yang selesai sebelum kemarin diarsipkan, angkanya dibekukan persis |
| 4.2 | kritis | Jejak kejadian tidak pernah dibuang | Penyimpanan perangkat penuh ±5 minggu → data baru tidak tersimpan | Titik simpan otomatis; jejak yang sudah terlipat dibuang; aplikasi dibuka dari titik simpan |
| 4.3 | kritis | Satu kejadian rusak di jejak bersama membuat mesin crash | Semua perangkat gagal memutar jejak yang sama — aplikasi mati di semua perangkat | Validasi setiap kejadian (gagal tertutup) + jaring pengaman; INV-43 menyuntikkan 350 kejadian rusak |
| 4.4 | tinggi | Rekap, Promo, Atur bisa dibuka karyawan lewat alamat langsung | Laporan uang terlihat oleh semua staf | Halaman dikunci untuk superadmin |
| 4.5 | tinggi | PIN 4 digit bisa ditebak tanpa batas | Siapa pun di dekat tablet bisa masuk sebagai pemilik | Terkunci 30 dtk setelah 5 salah, berlipat sampai 15 menit, tetap berlaku walau dimuat ulang |
| 4.6 | tinggi | Titik simpan yang lebih lama bisa menimpa yang lebih baru | Kejadian di antaranya hilang saat aplikasi dibuka | Tab selalu memakai titik simpan terbaru sebelum membuat yang baru |
| 4.7 | tinggi | Tutup buku berjalan sebelum no-show dilepas pada detak yang sama | No-show hari itu tertinggal di luar arsip; rekap hari itu kurang satu transaksi | Lepas no-show & hold dulu, baru tutup buku |
| 4.8 | sedang | Karyawan yang login saat shift orang lain buka tidak diberi tahu | Uang masuk laci orang lain tanpa disadari | Banner shift milik siapa + alur serah terima di tab Shift |
| 4.9 | sedang | Tarif Rp 0 tampil "tersimpan" padahal ditolak; draf lama menimpa tarif dari perangkat lain | Tarif salah tanpa disadari | Validasi, peringatan perubahan dari perangkat lain, hasil dibaca ulang dari mesin |
| 4.10 | sedang | Promo yang tidak pernah bisa berlaku tersimpan diam-diam; hapus tanpa konfirmasi | Pemilik mengira promo aktif | Validasi jam, hari, nilai, kode ganda; konfirmasi hapus |
| 4.11 | sedang | Ketuk ganda "Kirim ke Dapur" di papan | Pesanan dobel di bill | Satu kali kirim |
| 4.12 | rendah | Beranda menulis "34 meja kosong" saat venue tutup | Tamu datang pagi ke venue yang tutup | "Tutup sekarang · buka pukul 11.00" |
| 4.13 | rendah | Rincian arsip & riwayat shift tumbuh tanpa batas | State membengkak pelan-pelan | Rincian transaksi 35 hari (angka rekap selamanya); riwayat shift 200 terakhir |

**Tes yang ikut dimatangkan.** Uji mutasi putaran ini membuktikan beberapa tes lama "hijau karena kebetulan":
- Tes sinkronisasi hanya memastikan semua tab **sama**, bukan **benar** — tab bisa kompak kehilangan kejadian yang sama. Sekarang dibandingkan dengan pemutaran ulang semua kejadian yang pernah dikirim.
- 100 simulasi hampir tidak pernah mengarsipkan hari. Ditambah skenario: tutup hari, tab yang dibiarkan jalan dua hari, shift lupa ditutup tiga hari, venue libur dua hari dengan booking dini hari, takeaway yang sebagian sudah diserahkan lalu di-void, open bill penghalang yang dipindah meja saat tamu booking menunggu, dan pemulihan no-show Paket Siang saat minuman gratisnya sudah habis. Tiga bug sisipan yang sempat lolos di tengah putaran (void takeaway sebagian, penghalang dipindah meja, jatah minuman gratis) kini masing-masing punya skenario terarah sendiri — sebelumnya hanya tertangkap kalau angka acak kebetulan menyusun kasusnya.
- Pengaman titik simpan diuji dengan tab yang jendela waktunya berbeda — tanpa pengamannya, 2 pemeriksaan langsung merah.

### Putaran 3 — audit independen + uji yang diperketat

| # | Tingkat | Temuan | Dampak nyata | Perbaikan |
|---|---|---|---|---|
| 3.1 | kritis | No-show dilepas padahal meja masih dipakai rombongan sebelumnya | Tamu tepat waktu kehilangan booking & uangnya | Hitungan 20 menit baru dimulai saat meja benar-benar kosong |
| 3.2 | kritis | Begitu open bill penghalang dipindah/di-void, booking yang menunggu langsung hangus | Tamu dilepas justru saat kasir membebaskan mejanya | Hitungan dimulai dari saat penghalang pergi / booking dipindah meja |
| 3.3 | tinggi | Booking yang jadwalnya habis karena meja terus terpakai dianggap no-show | Uang tamu diakui pendapatan padahal tidak pernah bisa masuk | Tidak dilepas; masuk "Perlu keputusan" di Kasir (void + refund); tamu melihat "Jadwal terlewat · hubungi kasir" |
| 3.4 | tinggi | Tamu online yang lewat jam bisa dipindah ke meja yang sedang dipakai | Dua rombongan di satu meja | Meja tujuan wajib kosong mulai sekarang sampai tab ditutup |
| 3.5 | tinggi | Perpanjangan bisa melewati 02.00; jam sesudah 02.00 bertarif siang | Meja dijual di luar jam buka, lebih murah | Dibatasi jam tutup; setelah tengah malam tetap tarif malam |
| 3.6 | tinggi | Ubah tarif ikut menagih ulang open bill yang sedang jalan | Tamu ditagih tarif baru untuk waktu yang sudah dimainkan | Tarif dibekukan saat meja dibuka (termasuk meja contoh) |
| 3.7 | tinggi | Rekap harian memakai jam tutup tab (PRD KK-19 menyebut jam mulai) | Tab 20.00–02.10 masuk omzet hari berikutnya | Hari operasional dari jam mulai; pilih tanggal rekap; CSV per hari + refund |
| 3.8 | tinggi | Refund void sesi atas satu kode booking | Pembayar pesanan QR tidak tercatat untuk dikembalikan | Refund per pembayar |
| 3.9 | tinggi | Refund hanya 10 terakhir & tidak bisa ditandai selesai | Dana pelanggan tenggelam | Daftar lengkap; "sudah dikembalikan" mencatat metode, petugas, waktu — tidak bisa dua kali |
| 3.10 | tinggi | Void takeaway yang sebagian sudah diambil → refund penuh | Barang diserahkan, uang tetap kembali | Hanya baris yang belum diserahkan |
| 3.11 | tinggi | Pilihan meja untuk pesan makanan tersimpan selamanya di HP | Besoknya bisa masuk bill rombongan lain | Diikat ke tab tamu; tab ditutup → dilepas; mesin menolak pesanan ke tab yang sudah berganti |
| 3.12 | tinggi | Memuat ulang halaman bayar membuat hold kedua | Slot milik tamu sendiri terkunci 19 menit | Pembayaran berjalan disimpan & dipakai ulang; hasil yang tertinggal tetap masuk riwayat |
| 3.13 | sedang | Tab yang lupa ditutup > 48 jam berhenti ditagih | Sisa waktu tidak ditagih | Batas hitung mengikuti lamanya sesi |
| 3.14 | sedang | Galat desimal meteran | 35.000/jam × 54 menit ditagih Rp 32.000 (seharusnya 31.500) | Aritmetika bilangan bulat |
| 3.15 | sedang | Void item menghapus tiket dapur yang salah (baris kembar) | Dapur membatalkan pesanan yang masih harus dibuat | Dicocokkan lewat kunci baris |
| 3.16 | sedang | Tanda habis manual dicabut oleh void/no-show/koreksi stok | Menu yang sengaja ditutup terjual lagi | Hanya tanda habis otomatis (stok 0) yang dicabut |
| 3.17 | sedang | Void pesanan QR "bayar di kasir" tidak memperbarui pesanannya; tidak ada void pesanan QR di Kasir | Status tamu salah; baris lunas online tidak bisa dibatalkan | Pesanan ikut diperbarui; void pesanan QR dengan pilihan alasan |
| 3.18 | sedang | Pesanan QR terhitung dua kali di layar pelanggan | "Dibayar" booking ikut menjumlah pesanan makanan | Nilai masing-masing |
| 3.19 | sedang | Jejak lama hidup lagi setelah reset data (tab tertidur) | Transaksi yang dihapus muncul lagi | Kejadian bercap genesis |
| 3.20 | sedang | Papan: tidak ada tombol pindah meja untuk tamu yang main; perpanjangan tanpa alasan; void item selalu "Salah input" | Layar maintenance menyuruh memindah tanpa alat; jejak void tidak jujur | Tombol Pindah Meja, alasan penolakan, pilihan alasan void |
| 3.21 | sedang | Ketuk ganda "Kirim ke Dapur" / "Saya sudah bayar" | Dua pesanan untuk satu niat | Dijaga satu kali kirim |
| 3.22 | sedang | Batas check-in ≠ batas no-show | Layar bilang "masuk" untuk booking yang dilepas | Satu aturan; hasil check-in dibaca dari data |
| 3.23 | rendah | Jumlah meja per jam di mode VIP/Paket menghitung semua meja | "30 meja" padahal VIP penuh | Per jenis meja |
| 3.24 | rendah | Pulihkan no-show tidak mengembalikan jatah minuman gratis yang habis | Tamu Paket Siang kehilangan haknya | Jatah dikembalikan |

Temuan 3.2, 3.3, 3.4, 3.13 dan 3.24 **tidak ditemukan pemeriksa** — muncul karena invariant & skenario baru putaran ini (mis. invariant "satu meja tidak pernah dipakai dua rombongan bersamaan" langsung menemukan 3.4).

### Putaran 2 — sinkronisasi & fungsi yang ternyata "hanya tampilan"

| # | Temuan | Dampak nyata | Perbaikan |
|---|---|---|---|
| A | **Pesanan makanan tanpa booking** (dari meja / takeaway) hanya tersimpan di HP tamu | Tidak masuk dapur, stok, bill kasir, maupun laporan | Pesanan tamu kini diproses mesin: QR meja (bayar QRIS atau masuk bill), takeaway (bayar di muka), tiket dapur berlabel asal, stok, rekap, void |
| B | **Data hilang saat halaman dimuat ulang** | Satu refresh = shift, transaksi, stok hilang | Jejak kejadian disimpan di perangkat dan diputar ulang saat dibuka |
| C | **Kasir, dapur, dan HP tidak sinkron** | Kasir tidak melihat pesanan/booking dari layar lain | Sinkron seketika antar-tab (BroadcastChannel, cadangan event storage); urutan kejadian menentukan pemenang secara sama di semua layar |
| D | **Slot tidak ditahan selama tamu membayar** | Dua orang bisa membayar slot yang sama | Hold PRD KK-04: QR 15 menit, hold 17 menit, dilepas T+19; harga dibekukan saat QR dibuat |
| E | Webhook ganda untuk pembayaran yang ditolak atau booking yang sudah di-void diproses ulang | Refund tercatat dua kali / booking hidup lagi | Daftar ID pembayaran yang sudah diproses (idempoten) |
| F | Menu habis tepat saat pembayaran masuk → seluruh booking ditolak | Tamu kehilangan meja karena satu minuman | Booking tetap jalan; hanya menu yang habis yang dananya dikembalikan |
| G | **Kalender tanggal mendatang memakai data palsu** | Tamu melihat "penuh" padahal kosong | Ketersediaan murni dari data nyata |
| H | **Harga makanan/minuman tidak bisa diubah admin** | Admin harus ubah kode | Editor harga (superadmin); harga dikunci per baris pesanan |
| I | Halaman bayar menyatakan lunas tanpa konfirmasi mesin | Tamu mengira sukses padahal ditolak | Hasil dibaca dari data venue; ditolak → layar refund dengan alasan |
| J | Beranda & booking memakai tarif tertanam | Harga tayang beda dengan yang ditagih | Tarif terkini dari panel admin |
| K | Meja rusak diam-diam terbuka lagi setelah 24 jam | Tamu datang ke meja rusak | Terkunci sampai diaktifkan; tamu yang sudah memesan wajib dipindah dulu |
| L | Promo per hari salah pada 00.00–02.00 | "Sabtu malam" pukul 01.00 tidak dapat promo | Mengikuti hari operasional |
| M | Void minuman gratis Paket Siang tidak mengembalikan jatah | Tamu kehilangan hak gratis | Jatah dikembalikan |
| N | Papan kasir menandai meja "Dibooking" untuk booking hari lain | Jumlah meja kosong hari ini terlalu kecil | Papan & rekap hanya memakai sesi yang relevan sekarang |
| O | Paket Siang bisa dipilih untuk meja VIP | Pasti ditolak setelah bayar | Dicegah di layar, sama dengan aturan mesin |
| P | "Pesanan Saya" tidak mengikuti status nyata | Tidak tahu dipindah meja, no-show, atau ditolak | Status langsung dari data venue, termasuk progres dapur |
| Q | Tautan "Masuk panel staf" rusak di versi online | Staf tidak bisa masuk dari beranda | Diperbaiki |
| R | Ketukan ganda PIN membuka shift dengan modal Rp 0 | Selisih kas palsu | Tombol mulai shift wajib diisi |
| S | Checkout tidak mencegah item habis/stok kurang/slot terisi | Tamu membayar sesuatu yang pasti ditolak | Validasi memakai fungsi mesin yang sama sebelum bayar |
| T | No-show dicatat pada jam detak, bukan jam seharusnya | Bisa masuk rekap hari berikutnya; beda antar-perangkat | Dicatat tepat pada batasnya |

### Putaran 1 — mesin inti (dasar 0/100 simulasi)

| # | Temuan | Dampak nyata |
|---|---|---|
| 1 | Booking online tidak dicek bentrok saat pembayaran masuk | Dua tamu memegang meja yang sama |
| 2 | Tutup tab mencatat angka kiriman layar | Kasir bisa menagih lebih kecil dari seharusnya |
| 3 | Promo ikut memotong bagian yang sudah dibayar online | Diskon ganda, laporan tidak seimbang |
| 4 | Kas laci shift menjumlah semua shift | Kasir shift kedua selalu "selisih" |
| 5 | Void bisa menghapus transaksi yang sudah dibayar | Uang hilang tanpa jejak |
| 6 | Check-in menggeser jam selesai | Tamu telat menabrak booking berikutnya |
| 7 | Pra-order online tidak pernah masuk dapur | Makanan tidak dibuat |
| 8 | Stok bisa minus; stok 0 masih dijual | Jual barang yang tidak ada |
| 9 | Karyawan bisa menonaktifkan meja | Pelanggaran hak akses |
| 10 | Aksi uang tanpa shift terbuka | Uang tidak masuk shift mana pun |
| 11 | Meja bisa dibuka di luar jam operasional | Data ngawur |
| 12 | Tutup tab untuk tamu yang belum check-in | Tagihan untuk sesi yang belum terjadi |
| 13 | Rekap tidak dibatasi hari operasional | Omzet hari ini tercampur kemarin |
| 14 | No-show tidak pernah dilepas | Meja kosong tidak bisa dijual |
| 15 | Perpanjangan dihargai tarif jam sekarang | Salah tarif siang/malam |
| 16 | Relokasi tidak memindahkan lampu | Lampu meja lama tetap nyala |
| 17 | Paket Siang: minuman gratis tidak tercatat | Gratis tidak terkendali |
| 18 | Booking memakai tarif lama setelah tarif diubah | Harga tidak konsisten |
| 19 | Open bill yang tertabrak booking tidak diperingatkan | Tamu online datang, meja masih dipakai |

Semua temuan putaran 1 diperbaiki dan dijaga invariant.

---

## 4. Daftar 41 invariant

| Kode | Aturan |
|---|---|
| INV-01 | Tidak ada double-booking; satu meja tidak pernah dipakai dua rombongan bersamaan; meja rusak tidak sedang dipakai |
| INV-02 | Sesi berjalan (open bill/overstay) yang tertabrak booking wajib diperingatkan |
| INV-03 | Stok tidak pernah minus |
| INV-04 | Stok 0 ⇒ menu otomatis ditandai habis |
| INV-05 | Konservasi stok (tidak oversell; void/no-show mengembalikan stok) |
| INV-06 | Uang per sesi: nilai − diskon = diterima kasir + prabayar |
| INV-07 | Tutup tab dihitung ulang mesin (oracle per menit, bilangan bulat), tidak percaya angka dari layar |
| INV-08 | Rekap konsisten (kanal, pajak, lini usaha) |
| INV-09 | Kas laci dihitung per shift |
| INV-10 | Karyawan tidak bisa menjalankan aksi superadmin |
| INV-11 | Aksi uang wajib shift terbuka |
| INV-12 | Void yang masih menunggu tidak menggerakkan uang/stok |
| INV-13 | Transaksi yang sudah dibayar/diserahkan tidak bisa hilang lewat void |
| INV-14 | Lampu: buka/check-in/pulihkan ⇒ nyala, tutup tab/void ⇒ mati |
| INV-15 | Setiap perubahan tercatat di jejak audit beserta pelakunya |
| INV-16 | ID sesi, void, tiket, pesanan, refund, dan baris pesanan unik |
| INV-17 | Meteran open bill tidak pernah turun & kelipatan Rp 500 |
| INV-18 | Booking online dihargai tarif terkini, atau harga beku saat hold |
| INV-19 | Check-in / pulihkan tidak memperpanjang jam selesai booking |
| INV-20 | Pesanan online masuk tiket dapur saat check-in |
| INV-21 | Meja tidak bisa dibuka di luar jam operasional |
| INV-22 | Booking yang berebut slot / webhook ganda ditolak & dananya tercatat tepat sekali |
| INV-23 | Tutup tab hanya untuk sesi yang sedang berjalan |
| INV-24 | Rekap hari ini hanya hari operasional ini, dari jam mulai (termasuk takeaway) |
| INV-25 | No-show dilepas tepat 20 menit setelah meja bisa ditempati & prabayarnya tetap tercatat |
| INV-26 | Perpanjangan dihargai sesuai tarif jam yang ditambahkan |
| INV-27 | Relokasi tidak menimbulkan tabrakan & lampu ikut pindah |
| INV-28 | Paket Siang: tepat 2 minuman gratis, tidak ditagih, void/pulihkan mengembalikan jatah |
| INV-29 | Pesanan tamu (QR/takeaway) masuk dapur, bill & laporan — atau ditolak dengan dana tercatat; tidak pernah masuk tab rombongan lain |
| INV-30 | Slot yang sedang dibayar tidak bisa diambil orang lain & dilepas tepat T+19 |
| INV-31 | Harga menu dikunci per baris; perubahan harga hanya untuk pesanan baru |
| INV-32 | Putar ulang jejak di perangkat lain menghasilkan state identik |
| INV-33 | Perangkat yang menerima kejadian dengan urutan acak tetap berakhir identik |
| INV-34 | Tiket dapur yang belum diantar selalu mewakili baris bill/pesanan yang masih ada |
| INV-35 | Tanda habis manual tidak dicabut oleh void, no-show, atau koreksi stok |
| INV-36 | Refund dicatat atas nama pembayarnya |
| INV-37 | Mengubah tarif tidak menagih ulang waktu open bill yang sudah berjalan |
| INV-38 | Perpanjangan tidak melewati jam tutup 02.00; jam setelah 02.00 bertarif malam |
| INV-39 | Tamu yang mejanya masih dipakai / tidak pernah bisa ditempati tidak dilepas sebagai no-show |
| INV-40 | No-show yang dipulihkan langsung berjalan, pra-order masuk dapur, yang sudah habis dikembalikan dananya |
| INV-41 | Refund tidak pernah hilang/berubah nominal, dan dicatat dikembalikan tepat sekali |

Skenario langka yang sengaja dipastikan teruji (angka dari satu putaran 100 simulasi): pelepasan otomatis no-show/hold 463×, bayar lewat hold 329×, habis manual + koreksi stok 25×, kejadian rusak diabaikan tanpa crash 344×, perpanjangan & buka meja jelang 02.00 36×, menu habis tepat saat bayar 32×, meteran presisi 54 menit 25×, penghalang booking dipindah/di-void 229×, tamu booking menunggu lalu penghalang di-void 25×, tamu booking menunggu lalu penghalang dipindah meja 24×, pesanan ke tab yang sudah ditutup (wajib ditolak) 31×, pulihkan no-show saat minuman gratisnya sudah habis 15×, tutup buku harian 25×, void minuman gratis Paket Siang 42×, void tab yang punya pesanan QR lunas milik tamu lain 25×, void takeaway yang sebagian sudah diserahkan 25×, webhook ganda 298×, no-show dipulihkan 195×, refund ditandai dikembalikan 154×.

---

## 5. Uji end-to-end di browser

| Langkah | Hasil |
|---|---|
| Superadmin login, buka shift, buka open bill Meja 2 → muat ulang halaman | Login, shift, dan sesi tetap ada |
| HP A scan QR Meja 2 (`/menu?meja=T02`), pesan Kentang Goreng, bayar QRIS | Masuk dapur berlabel "QR · Andi QR", stok berkurang, lunas di bill meja |
| Dapur menekan "Mulai masak" | Halaman sukses HP A berubah ke "Sedang dibuat" **tanpa muat ulang** |
| HP A booking Meja 5 jam 18.00, membuka halaman QRIS | Papan kasir langsung "◌ Ditahan · bayar…" |
| HP B mencoba slot yang sama | Meja 5 tidak tersedia, muncul pemberitahuan |
| HP A membayar | Kode check-in tampil; papan kasir "◔ Dibooking" |
| Superadmin ubah harga Kentang Goreng Rp 23.000 → Rp 25.000 | HP B langsung menampilkan harga baru; pesanan QR sebelumnya tetap Rp 23.000 |
| HP B pesan takeaway, superadmin void dari layar Kasir | HP B langsung "Dibatalkan · dana dikembalikan"; banner refund muncul di kasir |
| **Putaran 3** — booking Meja 8, halaman QRIS **dimuat ulang**, kembali ke Booking & Ringkasan, lalu bayar | Kode QR tetap sama & hitung mundur berlanjut; Meja 8 tetap tersedia bagi tamu itu; tepat 1 hold & 1 booking tercatat |
| Peringatan bentrok Meja 7 → "pindahkan Fajar yang sedang main" ke Meja 2 | Meteran Rp 72.000 ikut pindah; Meja 7 kembali "Dibooking"; check-in Dina langsung berhasil |
| HP scan QR Meja 2, pesan "bayar di kasir", tombol kirim **diketuk dua kali** | Tepat 1 pesanan, terikat ke tab Fajar; tiket dapur tampil di HP |
| Kasir void pesanan QR itu (alasan "Salah input"), lalu menutup tab Meja 2 | HP langsung "Dibatalkan" tanpa refund (belum dibayar); pilihan meja di HP otomatis dilepas setelah tab ditutup |
| Takeaway lunas QRIS (tombol bayar diketuk dua kali) → void "Barang habis" → Rekap "Transfer" | 1 pesanan; refund Rp 10.000 tercatat lalu "sudah dikembalikan"; HP "Dibatalkan · dana sudah dikembalikan" |
| Booking mode VIP | Jumlah per jam "4 meja" (sebelumnya ikut menghitung meja reguler) |
| **Putaran 4** — PIN salah 5 kali, lalu halaman dimuat ulang | "Terlalu banyak PIN salah. Coba lagi dalam 30 detik"; sesudah dimuat ulang tetap terkunci (28 detik); setelah waktunya habis PIN superadmin diterima |
| Atur: tarif Reguler siang diisi Rp 0 | "Tarif harus lebih dari Rp 0." dan tombol Simpan tarif nonaktif; baris jejak kejadian, titik simpan, dan tutup buku tampil |
| Promo baru dengan kode COMBO50 yang sudah ada dan jam selesai sebelum jam mulai | Dua masalah terdaftar: kode sudah dipakai promo lain; jam selesai harus sesudah jam mulai |
| Layar dikunci, karyawan masuk saat shift superadmin masih buka, lalu membuka alamat Rekap langsung | Banner "Anda bekerja di shift …"; Rekap menampilkan "Khusus superadmin" tanpa angka penjualan |
| Konsol browser & log server selama seluruh uji | Tanpa error |

---

## 6. Batasan yang jujur

| Hal | Keadaan sekarang | Yang dibutuhkan |
|---|---|---|
| Sinkron **antar-perangkat** (HP pelanggan ↔ tablet kasir yang berbeda) | Lapisannya sudah dibuat & diuji dengan server tiruan (tahap S1: antrean kirim, urutan server, mode terputus, tampilan publik) — di aplikasi masih mode lokal, sinkron antar-tab di satu perangkat | Server sungguhan: Supabase dengan **akun baru** (bukan akun photobooth). Jejak kejadian yang sama tinggal dipindah; mesin tidak berubah. Lihat `docs/PRD-SINKRONISASI-APLIKASI.md` §6.1 |
| Pembayaran QRIS | Simulasi (tombol "Saya sudah bayar" menggantikan webhook) | Merchant Midtrans + Edge Function |
| Login email pelanggan | Belum (nama/HP/email diisi di checkout) | Supabase Auth |
| PIN staf | PIN demo di perangkat | Autentikasi server |
| Lampu meja | Simulasi; kontrolnya sudah memakai antarmuka perangkat | Relay/bridge + teknisi listrik |
| Paket Siang: minuman yang termasuk | Asumsi kategori minuman dingin | **Perlu konfirmasi pemilik** |
| PBJT 10% | Asumsi | **Perlu konfirmasi** |
| QR meja untuk "bayar di kasir" | Pesanan diikat ke tab yang sedang jalan (tab berganti → ditolak), tapi siapa pun yang tahu nomor meja masih bisa memesan ke tab itu; kasir bisa void baris yang disengketakan | Produksi: token QR berganti per sesi |
| Booking yang terlewat karena meja terus terpakai | Tidak dilepas otomatis; muncul di Kasir untuk void + refund | Kebijakan kompensasi (refund penuh / kredit) — **perlu keputusan pemilik** |

---

## 7. Menjalankan ulang

```bash
npm test                 # okupansi 29 · tagihan 30 · 100 simulasi · 43 invariant · antar-tab 23 · ketahanan 14 hari · lintas perangkat 39
npm run test:sim         # hanya 100 simulasi
npm run test:sync        # hanya uji sinkronisasi antar-tab
npm run test:soak        # hanya uji ketahanan (DAYS=30 npm run test:soak untuk 30 hari)
npm run test:remote      # hanya uji lintas perangkat (server tiruan)
node test/mutation.mjs   # 67 mutasi (±18 menit; memulihkan berkas yang dimutasi otomatis)
                         # ONLY=27,38 node test/mutation.mjs → hanya mutasi tertentu
npx tsc --noEmit         # typecheck
```

**Jalankan uji mutasi di salinan terisolasi**, bukan langsung di folder proyek: berkas dimutasi di tempat, jadi kalau prosesnya dibunuh paksa, `engine.ts` bisa tertinggal dalam keadaan termutasi. Salin `src` + `test` ke folder sementara, buat junction `node_modules`, lalu jalankan dengan `MUT_OUT=.mut MUT_BACKUP=.mut/backup`.
