> **LAMPIRAN TEKNIS — bukan dokumen keputusan.**
> Jika isi berkas ini bertentangan dengan `PRD-SPL-BOOKING.md`, **PRD master yang menang.**
> Registri Keputusan Kanonik (§4) dan Konstanta Global (§5) di PRD master mengesampingkan angka apa pun di sini.

## 1. Ringkasan Produk & Konteks Bisnis

### 1.1 Ringkasan Eksekutif

SPL Sports Pool Lounge dan Smokehouse Resto adalah satu venue dengan dua sub-merek: area biliar dan dapur smokehouse. Hari ini keduanya berjalan tanpa sistem transaksi. Booking masuk lewat WhatsApp dan telepon, dicatat di papan tulis, dan omzet baru diketahui saat uang tunai dihitung dini hari. Tiga akibatnya berulang setiap minggu: meja bentrok antara pelanggan yang sudah janji dan tamu yang datang langsung, jam siang kosong tanpa cara terukur untuk mengisinya, dan pemilik tidak punya angka per meja per jam untuk memutuskan harga.

Produk ini adalah web app mobile-first (PWA, bukan aplikasi native) yang memindahkan tiga transaksi inti ke satu inventaris tunggal: pemesanan sesi meja dengan pembayaran QRIS di muka, pemesanan makanan-minuman yang menempel pada sesi meja yang sama, dan pencatatan sesi walk-in oleh kasir di sistem yang sama persis. Penggunanya empat kelompok: pelanggan reguler, rombongan pelanggan baru, kasir shift malam, dan pemilik.

MVP berhasil bila utilisasi meja naik, jam mati terisi, nilai rata-rata per tab naik karena F&B menempel ke booking, seluruh walk-in tercatat di sistem, dan pemilik bisa menutup buku harian dalam lima menit.

*(198 kata)*

---

### 1.2 Konteks Venue & Implikasi Produk

| ID | Fakta konteks | Implikasi langsung ke produk |
|---|---|---|
| CTX-01 | **Dua sub-merek dalam satu venue**: SPL — Sports Pool Lounge (biliar) dan Smokehouse Resto (F&B) | Aplikasi harus menyajikan dua merek dalam **satu shell, satu keranjang, satu tab meja**. Navigasi utama dua lajur: **Main** (sesi meja) dan **Makan** (F&B). Jangan bangun dua aplikasi. |
| CTX-02 | Identitas visual sudah terkunci: amber `#F0A202`, brick maroon `#992212`, latar near-black, tekstur bata, font Lido STF / Emoland / Jazzbury | Halaman pembayaran QRIS harus ber-brand SPL, bukan UI putih generik gateway. Ini alasan teknis memilih **Core API, bukan Snap**, di MVP. Jazzbury **tidak** dipakai untuk UI body/angka. |
| CTX-03 | Vibe industrial sports bar + smokehouse, gelap-hangat | Antarmuka default **dark**. Status meja tetap memakai konvensi industri (hijau=kosong, merah=dipakai, kuning=reserved, abu=maintenance) dengan hue disesuaikan ke palet, karena konvensi itu sudah dikenali staf POS biliar. |
| CTX-04 | Pemilik meminta hosting gratis dulu sebelum pindah ke domain sendiri | Stack MVP: Cloudflare Pages + Supabase Free + Brevo + GitHub. **Vercel Hobby dan GitHub Pages tereliminasi secara legal**, bukan teknis. Detail di seksi Arsitektur & Hosting. |
| CTX-05 | Pembayaran QRIS via Doku atau Midtrans | **Satu gateway saja di MVP: Midtrans Core API.** Membangun dua gateway sekaligus menggandakan permukaan bug rekonsiliasi tanpa menambah satu pun pelanggan yang bisa membayar. |
| CTX-06 | Mayoritas omzet hari ini kemungkinan besar masih tunai/EDC di kasir | Produk **tidak boleh** mengasumsikan semua uang lewat QRIS. Laporan wajib memisahkan channel sejak hari pertama. |

**[PERLU KONFIRMASI]** Semua angka kapasitas di seksi ini memakai **ASUMSI: 8 meja, jam operasional 10.00–02.00 WIB (16 jam), harga rata-rata tertimbang Rp 50.000/jam** — angka terakhir berada di dalam rentang terverifikasi pasar Indonesia (Rp 35.000–Rp 100.000/jam). Jumlah meja, jam buka, dan tarif riil wajib dikoreksi pemilik sebelum satu baris kode ditulis, karena **seluruh target metrik di §1.4 diturunkan dari tiga angka ini**.

**Papan hitung dasar (ASUMSI, dipakai berulang di dokumen ini):**

| Besaran | Perhitungan | Nilai |
|---|---|---|
| Kapasitas teoretis harian | 8 meja × 16 jam | **128 jam-meja/hari** |
| Kapasitas teoretis bulanan | 128 × 30 | **3.840 jam-meja/bulan** |
| Omzet meja per 1 jam-meja | — | **Rp 50.000** |
| **Nilai 1 poin persentase utilisasi** | 1% × 128 jam-meja × Rp 50.000 | **Rp 64.000/hari ≈ Rp 1.920.000/bulan** |

Angka terakhir adalah jangkar seluruh business case: **setiap 1 poin persentase kenaikan utilisasi meja bernilai ±Rp 1,92 juta per bulan.** Naik 12 poin (38% → 50%) bernilai ±Rp 23 juta per bulan — jauh melampaui seluruh biaya hosting berbayar (±Rp 427.000/bulan) dan seluruh MDR QRIS.

---

### 1.3 Masalah Saat Ini — Venue Biliar Tanpa Sistem

Setiap masalah di bawah diberi ID `MS-xx` supaya bisa dilacak ke requirement dan metrik. Kolom kerugian memakai papan hitung §1.2; semuanya **ASUMSI** frekuensi kecuali dinyatakan lain.

| ID | Masalah | Bagaimana terjadi hari ini | Kerugian konkret |
|---|---|---|---|
| **MS-01** | **Booking lewat WhatsApp tidak punya sumber kebenaran** | Pelanggan chat "Bang, Sabtu jam 8 dua jam ya". Balasan "oke" dari HP admin. Chat tenggelam di bawah 40 pesan lain. Shift berikutnya tidak tahu | ASUMSI 2 kejadian/minggu meja tidak tersedia saat pelanggan datang → 2 × 2 jam × Rp 50.000 = **Rp 400.000/minggu ≈ Rp 1,7 juta/bulan** dalam sesi hangus, **belum** menghitung kompensasi dan pelanggan yang tidak kembali |
| **MS-02** | **Papan tulis mati saat shift ganti** | Jadwal ditulis spidol. Terhapus sebagian, tulisan tidak terbaca, tidak ada riwayat. Saat papan penuh, booking H+2 tidak ditulis sama sekali | Booking jauh hari **praktis tidak bisa diterima**. Venue kehilangan seluruh segmen "rencana akhir pekan" dan booking rombongan yang justru bernilai paling besar |
| **MS-03** | **Telepon masuk saat jam paling sibuk** | Sabtu 20.30, kasir sedang menutup tab dan menerima bayaran, telepon berdering menanyakan "ada meja kosong?" | Setiap panggilan ASUMSI 3 menit. 12 panggilan/malam = **36 menit/malam kasir tidak melayani tamu di depannya**. Antrean kasir memanjang, tamu di meja menunggu tagihan |
| **MS-04** | **Salah catat & double-booking** | Dua pelanggan dijanjikan meja 3 jam 20.00 oleh dua staf berbeda. Atau walk-in dikasih meja yang sudah dijanjikan | Kompensasi (gratis 1 jam atau diskon F&B) ASUMSI Rp 100.000 per kejadian, 3 kejadian/bulan = **Rp 300.000/bulan** + kerusakan reputasi yang tidak terukur. Ini masalah yang **paling dirasakan pelanggan** |
| **MS-05** | **Jam mati 11.00–17.00 kosong tanpa upaya terukur** | Tidak ada happy hour, atau ada tapi hanya diumumkan lisan. Tidak ada kanal untuk menjualnya | Kapasitas jam mati = 6 jam × 8 meja = 48 jam-meja/hari. ASUMSI utilisasi 15% → **40,8 jam-meja menganggur setiap hari**. Pada Rp 35.000 (tarif happy hour) itu **Rp 1,4 juta/hari kapasitas hangus**, dan kapasitas tidak bisa disimpan untuk besok |
| **MS-06** | **Tidak tahu omzet harian, apalagi per meja** | Tutup buku = hitung uang di laci, cocokkan dengan ingatan. Tidak ada pemisahan omzet meja vs F&B | Pemilik tidak bisa menjawab: meja mana yang paling laku, jam berapa harga bisa dinaikkan, apakah kenaikan harga bulan lalu berhasil. **Keputusan harga diambil berdasarkan perasaan, di bisnis yang marginnya ditentukan oleh harga.** Tutup buku manual ASUMSI 45 menit/hari = **22 jam/bulan waktu pemilik atau kasir senior** |
| **MS-07** | **Tidak ada uang muka, tidak ada konsekuensi no-show** | Booking WA tanpa bayar. Tidak datang = tidak rugi apa-apa bagi pelanggan | Meja ditahan menunggu orang yang tidak datang. ASUMSI 3 no-show/minggu × 2 jam = 6 jam-meja/minggu = **Rp 1,2 juta/bulan kapasitas hilang**, terutama di jam prime yang paling mudah dijual ulang |
| **MS-08** | **F&B tidak menempel ke sesi meja** | Order makanan diteriakkan ke dapur, dibayar terpisah di kasir, tidak tercatat sebagai belanja meja mana | Tidak ada satu pun angka **belanja total per meja**. Attach rate F&B tidak diketahui, jadi tidak bisa dinaikkan. Ini pos yang **marginnya lebih tinggi daripada sewa meja** dan justru paling tidak terkelola |
| **MS-09** | **Kebocoran kas tidak terdeteksi** | Pembayaran tunai yang tidak diinput, void tanpa jejak, diskon "teman pemilik" | Tanpa struk bernomor urut dan rekonsiliasi shift, kebocoran hanya ketahuan kalau besar. ASUMSI konservatif 1% dari omzet tunai bulanan Rp 73 juta = **Rp 730.000/bulan** |
| **MS-10** | **Kepatuhan PBJT rapuh** | Tidak ada struk bernomor urut tanpa gap, tidak ada rekap DPP F&B vs DPP hiburan | Nomor struk yang melompat adalah **temuan pemeriksaan Bapenda**. Selisih klasifikasi PBJT hiburan 10% vs kategori bar 40% adalah risiko 30 poin persentase omzet — lihat §1.9 |
| **MS-11** | **Tidak ada basis data pelanggan** | Nomor WA tersebar di chat, tidak ada riwayat kunjungan | Tidak bisa reaktivasi pelanggan yang berhenti datang, tidak bisa membedakan pelanggan reguler dari sekali datang, tidak bisa membangun loyalty. **Semua ide monetisasi di §1.8 tidak mungkin dijalankan tanpa data ini.** |
| **MS-12** | **Perpanjangan sesi ditangani secara ad hoc** | Pelanggan minta tambah 1 jam. Staf mengira-ngira apakah meja itu ada booking berikutnya | Kalau ditolak padahal kosong = kehilangan penjualan termudah yang ada. Kalau diterima padahal ada booking = MS-04 terjadi lagi |

**Total kerugian kuantifikasi kasar (ASUMSI): Rp 4,3 juta/bulan kerugian langsung + Rp 42 juta/bulan kapasitas menganggur** (jam mati + no-show + utilisasi umum). Angka kedua bukan kerugian yang bisa ditagih, tapi itulah kolam yang menjadi target produk ini.

**Akar masalah tunggal dari MS-01 sampai MS-12: ada dua sumber kebenaran — kertas/kepala staf dan (nanti) database.** Selama walk-in tidak masuk ke sistem yang sama dengan booking online, tidak ada satu pun fitur di dokumen ini yang bekerja. Ini risiko adopsi manusia, bukan risiko teknis, dan tidak bisa diselesaikan dengan kode.

---

### 1.4 Tujuan Bisnis & Metrik Sukses

#### 1.4.1 Tujuan bisnis, berurut prioritas

| ID | Tujuan | Terhubung ke masalah |
|---|---|---|
| **G-01** | **Menaikkan utilisasi meja**, terutama di jam mati — kapasitas yang tidak terjual hari ini hilang selamanya | MS-05, MS-07 |
| **G-02** | **Menaikkan nilai rata-rata per tab** dengan menempelkan F&B ke sesi meja | MS-08 |
| **G-03** | **Menghilangkan bentrok meja** sehingga booking bisa dipercaya | MS-01, MS-02, MS-04, MS-12 |
| **G-04** | **Memberi pemilik angka harian yang bisa dipercaya** untuk keputusan harga, jadwal staf, dan menu | MS-06, MS-09, MS-10 |
| **G-05** | **Mengubah waktu staf dari administrasi menjadi pelayanan** | MS-03 |
| **G-06** | **Membangun basis data pelanggan** sebagai aset untuk Fase 2 | MS-11 |

#### 1.4.2 Metrik sukses

**Aturan pengukuran yang mengikat:** empat minggu pertama setelah go-live adalah **Bulan 0 — periode pengukuran baseline, bukan pengejaran target.** Semua baseline di tabel ini adalah ASUMSI dan **wajib diganti angka riil hasil Bulan 0** sebelum target dianggap mengikat. Menetapkan target di atas baseline yang dikarang adalah cara tercepat kehilangan kepercayaan pada dashboard.

| ID | Metrik | Definisi / rumus | Baseline (ASUMSI) | Target Bulan 3 | Target Bulan 6 | Sumber data |
|---|---|---|---|---|---|---|
| **KPI-01** | **Utilisasi meja keseluruhan** | Σ jam-meja terjual (status `seated`/`completed`) ÷ (jumlah meja aktif × jam operasional), per `business_date` | 38% | **45%** | **50%** | `bookings` |
| **KPI-02** | **Utilisasi jam mati** (11.00–17.00) | Sama, dibatasi slot 11.00–17.00 | 15% | **22%** | **28%** | `bookings` |
| **KPI-03** | **Nilai rata-rata per tab** (AOV) | Σ `total_amount` semua tab tertutup ÷ jumlah tab | Rp 135.000 | Rp 160.000 | **Rp 175.000** | `revenue_ledger` |
| **KPI-04** | **Attach rate F&B — keseluruhan** | Tab yang memuat ≥1 item F&B ÷ total tab | 45% | 55% | **62%** | `order_items` |
| **KPI-05** | **Attach rate F&B — booking online** | Booking online yang menyertakan ≥1 item F&B saat checkout ÷ total booking online | 0% (belum ada) | 30% | **45%** | `bookings` + `order_items` |
| **KPI-06** | **Porsi booking online** | Sesi ber-`channel='online'` ÷ total sesi | 0% | 20% | **35%** | `bookings.channel` |
| **KPI-07** | **Rasio no-show booking online** | Booking berstatus `no_show` ÷ booking `confirmed` | Tidak diketahui, tidak tercatat | < 8% | **< 5%** | `bookings` |
| **KPI-08** | **Cakupan pencatatan walk-in** | Sesi walk-in yang diinput sistem ÷ estimasi sesi walk-in riil (dicek lewat audit sampling mingguan oleh pemilik) | 0% | **100%** | **100%** | `bookings` + audit manual |
| **KPI-09** | **Waktu tutup buku harian** | Menit dari kasir menekan "Tutup Shift" sampai laporan siap dibaca pemilik | 45 menit | < 10 menit | **< 5 menit** | Stopwatch, diukur manual |
| **KPI-10** | **Selisih kas fisik vs sistem per shift** | \|kas laci − kas tercatat\| | Tidak diketahui | ≤ Rp 50.000 | **≤ Rp 20.000** | Shift report |
| **KPI-11** | **Payment success rate QRIS** | Pembayaran `settlement` ÷ QR yang di-generate | — | ≥ 85% | **≥ 92%** | `payments` |
| **KPI-12** | **Repeat rate 30 hari** | Pelanggan dengan ≥2 sesi dalam 30 hari ÷ pelanggan aktif | Tidak diketahui | Ukur saja | **≥ 30%** | `bookings.user_id` |
| **KPI-13** | **Rasio sesi diperpanjang** | Sesi dengan ≥1 extend ÷ total sesi | Tidak diketahui | Ukur saja | **≥ 18%** | `bookings` |

#### 1.4.3 Metrik penjaga (guardrail) — jangan sampai menang di satu angka, kalah di bisnis

| ID | Guardrail | Ambang | Kenapa |
|---|---|---|---|
| **GR-01** | Jumlah walk-in yang **ditolak** karena semua meja terjual online | ≤ 3 kejadian/minggu | KPI-06 bisa dinaikkan dengan menjual habis semua meja online, tetapi menolak pelanggan setia yang datang langsung adalah kerugian jangka panjang. Mitigasinya kuota meja `walk_in_only` di jam prime |
| **GR-02** | Keluhan "meja saya diambil orang" | **0** | Kalau ini terjadi walau sekali, G-03 gagal terlepas dari angka lain |
| **GR-03** | Rata-rata waktu kasir membuka sesi walk-in di sistem | ≤ 15 detik | Kalau input walk-in lambat, staf akan berhenti melakukannya dan KPI-08 runtuh, membawa seluruh sistem ikut runtuh |
| **GR-04** | Selisih antara omzet kotor di dashboard dan mutasi rekening + kas fisik | ≤ 0,5%/bulan | Dashboard yang tidak bisa direkonsiliasi akan ditinggalkan pemilik dalam bulan pertama |

**Rekonsiliasi dengan asumsi volume di dokumen riset:** pada utilisasi 50% dengan durasi rata-rata 2 jam, venue 8 meja menghasilkan ±32 sesi/hari. Ini konsisten dengan asumsi 30–40 transaksi/hari yang dipakai riset pembayaran dan hosting untuk menghitung kuota email, egress, dan MDR. Kalau jumlah meja riil berbeda jauh dari 8, **seluruh perhitungan kuota di seksi Arsitektur wajib dihitung ulang**.

---

### 1.5 Persona Pengguna

#### PER-01 — Rizal, 27 — Pelanggan Reguler

| Aspek | Detail |
|---|---|
| **Konteks** | Karyawan swasta. Main 2–3× seminggu, biasanya Selasa/Kamis malam sepulang kerja bersama 2–3 rekan kantor, dan sesekali Sabtu. Durasi khas 2 jam. Sudah kenal nama kasir. Selalu pesan minuman, kadang makanan berat. Total belanja khas Rp 130.000–180.000 per kunjungan |
| **Device & kondisi** | ASUMSI: Android mid-range (RAM 4 GB), Chrome, kuota seluler, sinyal 4G di dalam venue kadang lemah karena dinding bata. Layar 6,1", satu tangan, sambil berjalan |
| **Kebutuhan** | Booking dalam **< 30 detik** tanpa membaca instruksi apa pun. Tahu meja favoritnya (meja 3, dekat colokan) kosong atau tidak **sebelum** memutuskan berangkat. Bisa memperpanjang sesi tanpa mencari kasir |
| **Frustrasi hari ini** | Chat WA tidak dibalas selama 40 menit. Datang ternyata penuh, pulang lagi. Minta tambah 1 jam, kasir bilang "sebentar saya cek dulu ya" lalu hilang 5 menit |
| **Job to be done** | *"Ketika saya dan teman kantor memutuskan main malam ini, saya ingin memastikan ada meja dan menguncinya dalam hitungan detik dari HP, supaya kami tidak buang waktu datang lalu ditolak."* |
| **Fitur yang melayaninya** | Status meja live di homepage, chip tanggal "Hari Ini", satu-tap ulangi booking terakhir (Fase 2), tombol Perpanjang, halaman "Booking Saya" |
| **Metrik yang dipengaruhi** | KPI-06, KPI-12, KPI-13 |

#### PER-02 — Dina, 24 — Pelanggan Baru / Rombongan

| Aspek | Detail |
|---|---|
| **Konteks** | Mengorganisir ulang tahun teman, 8 orang, Sabtu malam. Belum pernah ke SPL, menemukannya dari Instagram atau Google Maps. Butuh **2 meja bersebelahan** dan makanan sharing yang sudah siap saat rombongan datang. Sensitif terhadap kepastian: dia yang akan disalahkan kalau acaranya berantakan |
| **Device & kondisi** | ASUMSI: iPhone atau Android flagship, Instagram in-app browser (penting — beberapa fitur browser terbatas di sana), Wi-Fi rumah saat memesan |
| **Kebutuhan** | Bukti tertulis bahwa mejanya benar-benar terkunci. Harga total final, tanpa kejutan di kasir. Bisa memesan makanan di muka supaya tidak menunggu 30 menit setelah datang. Kebijakan pembatalan yang jelas — dia belum percaya venue ini |
| **Frustrasi hari ini** | "Nanti kami hubungi lagi" yang tidak pernah terjadi. Harga di Instagram beda dengan di kasir karena pajak. Datang jam 20.00 dengan 8 orang, makanan baru keluar jam 20.45 |
| **Job to be done** | *"Ketika saya mengatur acara untuk 8 teman, saya ingin memesan meja dan makanan sekaligus dengan bukti bayar yang bisa saya kirim ke grup, supaya saya tidak menanggung risiko acaranya gagal."* |
| **Frustrasi yang paling menentukan konversi** | **Total yang mengejutkan di layar bayar.** Ini penyebab abandonment nomor satu. Karena itu harga tayang **tax-inclusive** dan rincian PBJT tetap ditampilkan sebagai baris terpisah di ringkasan |
| **Fitur yang melayaninya** | Denah meja visual (pilih 2 meja bersebelahan), cross-sell F&B sebelum bayar, halaman Ringkasan Pesanan, kebijakan batal ditampilkan di halaman booking, tombol "Kirim bukti ke WhatsApp" |
| **Metrik yang dipengaruhi** | KPI-03, KPI-05, KPI-06 |

#### PER-03 — Agus, 31 — Kasir / Staf Operasional Shift Malam

**Ini persona yang menentukan hidup-matinya produk.** Kalau Agus berhenti memakai sistem, semua data menjadi sampah dan seluruh dashboard pemilik berbohong.

| Aspek | Detail |
|---|---|
| **Konteks** | Shift 17.00–02.00. Sendirian di kasir pada jam 19.00–21.00, dibantu satu runner setelahnya. Mengerjakan tujuh hal bersamaan: menerima tamu, membuka meja, menerima bayaran, mengangkat telepon, meneruskan order ke dapur, menutup tab, menengahi pelanggan yang mau perpanjang |
| **Device & kondisi** | Tablet 10" atau laptop lama di meja kasir, layar terkena cahaya lampu meja. Wi-Fi venue **tidak stabil** — pemadaman internet 1–2× per bulan adalah kepastian, bukan kemungkinan. HP pribadi dipakai kalau tablet dipinjam |
| **Kebutuhan** | Satu layar yang menjawab "meja mana kosong sekarang, dan mana yang akan dipakai booking dalam 1 jam ke depan" **tanpa scroll**. Membuka sesi walk-in dalam ≤ 15 detik. Sistem yang **tetap menampilkan jadwal hari ini saat internet mati** |
| **Frustrasi hari ini** | Papan tulis tidak terbaca. Ditelepon sambil menghitung uang. Pelanggan marah karena mejanya dipakai orang lain, padahal yang salah adalah catatan shift sebelumnya. Dituduh menghilangkan uang padahal tidak ada bukti tandingan |
| **Frustrasi terhadap sistem baru (harus diantisipasi)** | Sistem yang menambah pekerjaan tanpa mengurangi pekerjaan lain akan **dilewati**. Kalau input walk-in butuh 6 klik dan mengisi nama pelanggan, Agus akan menundanya "nanti kalau sepi" dan tidak pernah melakukannya |
| **Job to be done** | *"Ketika tamu berdiri di depan saya sementara telepon berdering, saya ingin membuka meja dengan dua ketukan dan tahu persis meja mana yang aman diberikan, supaya saya tidak menciptakan masalah untuk shift berikutnya."* |
| **Fitur yang melayaninya** | Peta meja realtime, tombol "Mulai Sesi Walk-in" (pilih meja → pilih durasi → selesai, **tanpa wajib isi nama**), peringatan keras "meja ini dibooking 55 menit lagi", PWA offline dengan jadwal hari ini ter-cache, indikator koneksi yang jujur, akun login per orang |
| **Metrik yang dipengaruhi** | KPI-08 (paling kritis), KPI-09, KPI-10, GR-03 |

#### PER-04 — Pak Hendra, 44 — Owner / Manajer

| Aspek | Detail |
|---|---|
| **Konteks** | Pemilik. Tidak selalu di venue; datang 3–4× seminggu, biasanya sore. Punya usaha lain. Membaca laporan pagi hari sambil sarapan, atau siang saat di perjalanan. Yang dia butuhkan bukan data, tapi **keputusan**: harga naik atau tidak, staf ditambah malam apa, menu mana yang dibuang |
| **Device & kondisi** | HP (mayoritas waktu) untuk laporan cepat; laptop di rumah untuk export dan rekonsiliasi bank bulanan |
| **Kebutuhan** | Satu layar pagi hari yang menjawab lima pertanyaan dalam 60 detik: berapa omzet semalam, berapa yang benar-benar masuk rekening, meja dan jam mana yang laku, apa yang aneh (void/diskon/refund), berapa kas selisih. Export untuk akuntan. Rekap PBJT untuk SPTPD |
| **Frustrasi hari ini** | Bertanya "semalam ramai?" dan dijawab "lumayan, Pak". Tidak bisa membuktikan kecurigaan kebocoran kas. Tidak tahu apakah promo bulan lalu berhasil. Menghitung pajak terutang dari tumpukan struk |
| **Frustrasi terhadap sistem baru (harus diantisipasi)** | **Dashboard yang angkanya tidak cocok dengan mutasi rekening akan langsung ditinggalkan.** Karena itu omzet kotor dan dana bersih diterima harus tampil berdampingan sejak layar pertama, lengkap dengan MDR dan tanggal settlement |
| **Job to be done** | *"Ketika saya bangun pagi, saya ingin tahu dalam satu menit apakah semalam bagus atau ada yang salah, supaya saya bisa mengambil satu keputusan hari ini alih-alih menunggu akhir bulan."* |
| **Fitur yang melayaninya** | Dashboard Pagi (§1.6c), pemisahan omzet meja vs F&B vs channel, heatmap okupansi (Fase 2), laporan Aktivitas Sensitif, rekap PBJT, export CSV, pengaturan harga & rate card |
| **Metrik yang dipengaruhi** | KPI-09, KPI-10, GR-04, dan secara tidak langsung **semua metrik lain**, karena dialah yang mengambil keputusan berdasarkan angka |

#### PER-05 — Dapur Smokehouse & Runner *(persona pendukung, mayoritas kebutuhannya Fase 2)*

| Aspek | Detail |
|---|---|
| **Konteks** | Dapur menerima order lewat teriakan atau kertas dari kasir. Runner mengantar ke meja |
| **Device** | Tidak ada device di MVP. Fase 2: layar KDS di dapur |
| **Kebutuhan** | Antrean order yang berurutan, terlihat, dan tidak hilang. Tahu order untuk meja berapa |
| **Frustrasi** | Order online yang masuk ke dashboard admin tetapi tidak sampai ke dapur = titik gagal operasional yang menghancurkan pengalaman PER-02 |
| **Job to be done** | *"Ketika order masuk, saya ingin melihatnya di satu antrean yang tidak bisa hilang, supaya tidak ada meja yang menunggu makanan yang tidak pernah dimasak."* |
| **Keputusan scope** | **KDS = Fase 2**, dengan satu pengecualian: kalau pemilik memperkirakan volume F&B online tinggi sejak minggu pertama, KDS naik ke MVP. **[PERLU KONFIRMASI]** Di MVP tanpa KDS, wajib ada SOP tertulis: dashboard admin berbunyi → kasir mencetak/menuliskan order → dapur. Tanpa SOP ini, fitur pesan F&B online **akan** gagal di lapangan |

---

### 1.6 User Journey End-to-End

#### (a) JRN-A — Booking Meja Online + Pesan Makanan dari Rumah

**Aktor:** PER-02 (Dina) · **Waktu:** Jumat 15.40, untuk Sabtu 20.00 · **Device:** HP, Wi-Fi rumah

1. Dina membuka link SPL dari bio Instagram. Halaman depan gelap, wordmark Lido STF di atas tekstur bata, dan di bawahnya satu baris besar: **"5 dari 8 meja terisi sekarang."** *Sistem: `get_availability()` untuk `business_date` hari ini; angka ini adalah social proof sekaligus memenuhi kebutuhan "meja mana yang kosong".*
2. Ia mengetuk **"Booking Meja"**. Muncul chip tanggal horizontal: `Hari Ini · Besok · Min 25 Agu · …` sampai 14 hari ke depan. Ia memilih **Besok (Sab 24 Agu)**.
3. Muncul grid slot jam, 3 kolom, tiap kartu memuat jam, **harga slot itu**, dan sisa meja: `20.00–21.00 · Rp 70.000 · 3 meja`. Slot 11.00–17.00 tampil dengan label **Happy Hour Rp 45.000** — dan Dina melihat, untuk pertama kalinya, bahwa datang siang jauh lebih murah. *Sistem: harga diresolusi dari rate card berdasarkan (kelas meja, jenis hari, jam mulai). Slot yang penuh tampil redup + coret + label "Penuh" — pembeda tidak hanya warna.*
4. Ia memilih **20.00**. Muncul **denah meja** — siluet meja biliar disusun sesuai layout venue asli, bukan dropdown. Meja 3 dan 4 bersebelahan dan berwarna amber (tersedia). Ia mengetuk keduanya.
5. Slider durasi: ia geser ke **3 jam**. Ringkasan di sticky bottom bar berubah realtime: `Sab 24 Agu · 20.00–23.00 · Meja 3, 4 · Rp 420.000`.
6. Layar berikutnya: **"Sekalian pesan? Makanan siap saat kamu datang."** Ia menambahkan 1 platter smokehouse sharing dan 8 minuman. Bottom bar: **Rp 705.000**. *Ini titik konversi dengan dampak terbesar pada KPI-03 dan KPI-05 — posisinya setelah meja dipilih dan sebelum pembayaran adalah keputusan desain yang disengaja.*
7. **Login.** Ia memasukkan email; magic link dikirim. Ia juga mengisi **nomor WhatsApp (wajib)** — email untuk login, WA untuk kontak nyata. Tidak ada password.
8. **Ringkasan Pesanan.** Subtotal sesi, subtotal F&B, **PBJT (persentase ditampilkan)**, total. Di bawahnya, kebijakan pembatalan tertulis terbuka, bukan disembunyikan di T&C. Ia mengetuk **Bayar**.
9. *Sistem, di sinilah kebenaran ditegakkan:* satu transaksi pendek membuat baris `hold` di database. Exclusion constraint PostgreSQL memutuskan siapa yang menang kalau ada orang lain menekan tombol yang sama pada milidetik yang sama. Transaksi **commit dulu**, baru backend memanggil Midtrans — tidak ada HTTP call di dalam transaksi.
10. **Halaman QRIS ber-brand SPL**: latar near-black, QR di dalam bingkai amber, countdown besar berhuruf Emoland. Karena ini HP, di bawah QR ada tombol **"Simpan QR ke Galeri"** dan instruksi: *"Buka e-wallet → Scan → pilih ikon Galeri → pilih QR yang baru disimpan."* Ada juga tombol "Saya sudah bayar". *Sistem: polling status tiap 3–5 detik.*
11. Dina membayar dari e-wallet-nya. Dalam ±20 detik halaman berpindah sendiri ke **Sukses** tanpa ia me-refresh. *Sistem: webhook `settlement` diverifikasi signature SHA512, nominalnya dicocokkan dengan nilai order di database, dan hanya setelah itu status booking menjadi `confirmed`. Status `pending` tidak pernah mengunci meja.*
12. Halaman sukses menampilkan **QR check-in besar**, hitung mundur ke jam main, dan tombol **"Kirim bukti booking ke WhatsApp saya"**. Ia menekannya, WhatsApp terbuka dengan pesan terisi, ia kirim ke dirinya sendiri lalu forward ke grup. Email struk juga masuk. *Sistem: `wa.me` deep link — Rp 0, tanpa risiko nomor venue di-banned.*
13. Sabtu 20.05 ia datang. Kasir memindai QR-nya, status menjadi `checked_in`, timer meja berjalan, platter sudah keluar dari dapur.

**Cabang gagal yang wajib ditangani:**

| Cabang | Yang terjadi | Yang dilihat Dina |
|---|---|---|
| **Slot direbut orang lain di detik yang sama** | Database menolak dengan `23P01` | Bukan error teknis, melainkan: *"Slot ini baru saja diambil"* + 3 saran terdekat (Meja 5 @20.00, Meja 3 @21.00, Meja 7 @20.00) yang sudah ter-patch dari broadcast realtime. **Tidak ada auto-retry** — slotnya memang sudah hilang |
| **QR kedaluwarsa** | Hold dilepas, meja tersedia lagi | *"Waktu pembayaran habis. Slot Meja 3 & 4 jam 20.00 masih kosong — buat QR baru?"* Percobaan bayar kedua memakai `order_id` baru (`SPL-…-2`), bukan mengulang yang lama |
| **Bayar tepat saat hold sudah dilepas** | Uang sudah masuk, slot mungkin sudah diambil orang | Sistem mencoba merebut ulang slot lewat constraint. Kalau gagal: pembayaran tetap dicatat sah, dibuat tugas refund, dan **alert critical ke admin**. Dina dihubungi manual. Pembayaran tidak pernah "hilang diam-diam" |
| **Internet Dina putus di halaman QR** | — | Saat kembali online, halaman "Booking Saya" menampilkan status terkini. Kebenaran ada di server, bukan di layar |

#### (b) JRN-B — Walk-in, lalu Scan QR di Meja untuk Pesan Makanan

**Aktor:** PER-01 (Rizal) + PER-03 (Agus) · **Waktu:** Kamis 20.10

**Catatan scope yang harus jujur:** riset menempatkan *auto-binding* order dari QR meja langsung ke tab (FB-05) dan KDS (EX-09) di **Fase 2**. Journey di bawah menandai setiap langkah dengan **[MVP]** atau **[F2]**. Versi MVP tetap berfungsi penuh — bedanya kasir yang menautkan order ke tab, bukan sistem.

1. **[MVP]** Rizal dan dua temannya masuk tanpa booking. Agus melihat **peta meja realtime** di tablet kasir: meja 2, 5, 7 hijau; meja 1, 3, 4, 6 merah; meja 8 kuning dengan label kecil *"Booking 21.00 — Sari"*.
2. **[MVP]** Agus mengetuk **meja 5 → Mulai Sesi Walk-in → 2 jam**. Selesai, dua ketukan, ≤ 15 detik. Tidak wajib mengisi nama pelanggan. *Sistem: baris `bookings` dengan `channel='walk_in'` masuk ke **tabel yang sama** dengan booking online. Inilah satu-satunya alasan sistem online tidak akan menjual meja 5 ke orang lain.*
3. **[MVP]** Kalau Agus mengetuk meja 8 (yang punya booking 21.00), sistem menahan dengan peringatan keras: *"Meja 8 dibooking atas nama Sari jam 21.00 — 50 menit lagi. Maksimum sesi walk-in: 50 menit."* Durasi 2 jam **tidak bisa dipilih** kecuali Agus melakukan override dan mengisi alasan, yang tercatat di audit log.
4. **[MVP]** Rizal duduk. Di sudut meja ada **stiker QR ber-brand SPL** bertuliskan "Pesan dari meja ini". Ia memindainya dengan kamera HP.
5. **[MVP]** Terbuka halaman menu Smokehouse dengan **nomor meja sudah terisi otomatis** (`?meja=M-05`) — gelap, foto makanan besar, harga tax-inclusive. Ia memesan 3 minuman dan 1 porsi ribs.
6. **[MVP]** Ia memilih **"Bayar di kasir"**. Order masuk ke **dashboard admin secara realtime dengan bunyi notifikasi**, bertanda "Meja 5". Agus melihatnya, menautkannya ke tab meja 5 dengan satu ketukan, dan meneruskan ke dapur sesuai SOP.
   **[F2]** Order menempel otomatis ke tab tanpa intervensi kasir, dan muncul langsung di layar KDS dapur.
7. **[MVP]** Alternatif: Rizal memilih **"Bayar sekarang (QRIS)"**. Alurnya sama dengan langkah 9–11 JRN-A, hanya tanpa komponen sesi meja. *Ini memenuhi requirement pemilik bahwa F&B bisa dipesan berdiri sendiri, dan kebetulan menghasilkan transaksi yang secara natural terpisah dari pembayaran sesi — bukan hasil rekayasa pemecahan tagihan, yang dilarang aturan acquirer.*
8. **[MVP]** 21.50, Rizal minta tambah satu jam. Agus mengetuk **Perpanjang** di meja 5. Sistem mengecek realtime:
   - Slot 22.00–23.00 di meja 5 kosong → tawarkan perpanjang, bayar QRIS di HP Rizal atau tunai. Selesai.
   - Terisi → sistem **otomatis menawarkan meja alternatif**: *"Meja 5 dibooking 22.00. Meja 7 kosong sampai 24.00 — pindah?"*
   - Tidak ada alternatif → sistem sudah memberi tahu lebih awal: pada 21.40 muncul notifikasi *"Sesi berakhir 22.00 dan meja sudah dibooking setelahnya."* **Extend dikunci pada T-5 menit.** Pelanggan tidak pernah dikejutkan di menit terakhir.
9. **[MVP]** 22.55 Rizal menutup tab. Agus melihat **satu tagihan**: sesi 3 jam + F&B, dikurangi apa yang sudah dibayar QRIS, sisa dibayar tunai. Struk **bernomor urut tanpa gap** tercetak, memuat NPWPD, rincian item, PBJT dengan persentasenya, total, metode bayar, dan ID kasir.
10. **[MVP]** *Sistem: tab ini punya satu `session_id` dengan **banyak** record pembayaran berbeda channel (`qris_online`, `cash`). Inilah yang membuat laporan bisa memisahkan omzet per channel dan per kategori.*

**Cabang internet mati (pasti terjadi, ASUMSI 1–2×/bulan):** indikator di tablet berubah merah: *"Offline — 3 item belum tersinkron."* **[MVP]** Jadwal booking hari ini tetap tampil dari cache PWA, sehingga Agus tetap tahu meja mana yang tidak boleh diberikan. Tombol "Jadwal Hari Ini" bisa dicetak setiap pagi sebagai cadangan kertas. **[F2]** Kasir bisa mencatat sesi walk-in dan order ke antrean lokal yang tersinkron otomatis saat online kembali; konflik masuk antrean yang diselesaikan admin manual, **tidak pernah auto-resolve**. Pembayaran QRIS tidak mungkin offline — fallback tunai atau QRIS statis bank.

#### (c) JRN-C — Owner Mengecek Laporan Pagi Hari

**Aktor:** PER-04 (Pak Hendra) · **Waktu:** Minggu 08.40, di rumah, dari HP · **Periode yang dilaporkan:** `business_date` Sabtu 23 Agu (sesi 10.00 Sabtu s/d 02.00 Minggu — batas hari operasional **02.00 WIB**, bukan tengah malam, sehingga sesi jam 01.00 tidak terpotong ke hari berikutnya)

1. Ia membuka aplikasi. Karena rolenya `owner`, layar pertama adalah **Dashboard Pagi**, bukan halaman booking.
2. **Baris paling atas — dua angka berdampingan, bukan satu:**
   `Omzet kotor Rp 4.180.000` · `Dana bersih diterima Rp 4.150.700`
   Di bawahnya keterangan kecil: `MDR QRIS Rp 8.300 · PBJT terutang Rp 380.000 · Settlement QRIS masuk rekening 26 Agu`. *Ini menjawab GR-04 sejak layar pertama. Angka omzet kotor saja adalah cara tercepat kehilangan kepercayaan pemilik pada bulan kedua.*
3. **Breakdown kategori:** Sewa meja Rp 2.830.000 (68%) · F&B Rp 1.350.000 (32%). Ia langsung melihat attach rate F&B semalam: **61% tab memuat F&B** — di atas target Bulan 3.
4. **Breakdown channel:** QRIS online Rp 1.240.000 · Tunai Rp 2.190.000 · EDC Rp 750.000. Porsi online semalam **30%**, naik dari 22% dua minggu lalu.
5. **Utilisasi:** `Semalam 58% · Rata-rata 30 hari 44%`. Strip per jam menunjukkan 20.00–23.00 hampir penuh, sementara **13.00–16.00 kosong total**. Strip per meja menunjukkan meja 7 dan 8 (di pojok, jauh dari colokan) jauh tertinggal dari meja 1–4.
6. **Aktivitas Sensitif — satu daftar yang bisa dibaca dalam 30 detik:** 1 void (Agus, "salah input minuman", 20.14) · 1 diskon manual 15% (Agus, "teman pemilik", Rp 27.000) · 0 refund · 1 override konflik walk-in (Agus, meja 8, "tamu hanya 40 menit"). Setiap baris memuat **siapa (akun per orang, bukan akun bersama), kapan, dari apa ke apa, dan alasannya**.
7. **Rekonsiliasi kas:** Shift malam — kas sistem Rp 2.190.000, kas fisik Rp 2.185.000, **selisih Rp 5.000** (dalam ambang KPI-10). Hijau.
8. **Hari ini:** 6 booking sudah masuk untuk Minggu, 2 di antaranya rombongan.
9. **Ia mengambil dua keputusan, dan ini seluruh tujuan produk:**
   - Melihat 13.00–16.00 kosong tiga hari berturut-turut, ia membuka **Pengaturan Harga** dan membuat rate card `HH-WD` Rp 35.000 untuk Senin–Kamis 11.00–16.00, berlaku mulai besok. *Sistem: rate card baru punya `effective_from`; booking yang sudah dibuat kemarin **tidak berubah nilainya** karena harga di-snapshot ke booking saat transaksi. Tanpa snapshot ini, laporan keuangan rusak dan bisa timbul sengketa dengan pelanggan.*
   - Melihat meja 7 dan 8 tertinggal, ia menandai catatan untuk memasang colokan tambahan — keputusan belanja modal yang sebelumnya tidak punya dasar angka apa pun.
10. Untuk keperluan akuntan, ia mengetuk **Export CSV** periode 1–23 Agustus. Ada dua view yang berbeda dan keduanya benar: **berdasarkan tanggal transaksi** (untuk analisis penjualan) dan **berdasarkan tanggal settlement** (untuk mencocokkan dengan mutasi rekening). Mencampur keduanya adalah sumber kesalahan pembukuan nomor satu.
11. Sekali sebulan ia membuka **Rekap Pajak Terutang**: DPP F&B, DPP hiburan, dan PBJT terutang masing-masing — langsung bisa disalin ke SPTPD.

**Total waktu langkah 1–8: di bawah 60 detik.** Itu spesifikasinya, bukan aspirasinya. Kalau butuh lebih lama, dashboard-nya gagal.

---

### 1.7 Scope MVP vs Non-Scope

**Definisi MVP yang mengikat:** MVP = 10 requirement eksplisit pemilik, **ditambah lima penambahan yang bersifat menyelamatkan operasional, bukan mempercantik.** Kelima penambahan itu ada karena tanpanya sepuluh requirement pemilik akan gagal di lapangan minggu pertama:

1. **Sesi walk-in di sistem yang sama** — tanpa ini, seluruh anti-double-booking runtuh di dunia nyata.
2. **Peta meja realtime untuk kasir** — tanpa ini, kasir kembali ke papan tulis.
3. **Alur perpanjang sesi dengan saran meja alternatif** — situasi paling sering terjadi di venue biliar.
4. **PWA offline yang mempertahankan jadwal hari ini** — internet venue **akan** mati.
5. **Audit log dengan akun per orang** — tanpa ini, requirement #8 (laporan keuangan) tidak bisa dipercaya.

#### Tabel IN / NANTI / OUT

| ID | Area / Fitur | Status | Referensi requirement | Alasan penempatan |
|---|---|---|---|---|
| **SC-01** | Login email (magic link / OTP), tanpa password | **IN** | Pemilik #1, `UX-15` | Password lupa = beban customer support |
| **SC-02** | Nomor WhatsApp wajib saat booking | **IN** | `UX-16` | Realita Indonesia: email untuk login, WA untuk kontak |
| **SC-03** | Booking sesi meja: tanggal → jam → denah meja → durasi | **IN** | Pemilik #2, `UX-01…UX-07` | Inti produk |
| **SC-04** | Rate card engine (happy hour, weekday/weekend, kelas meja) + snapshot harga ke booking | **IN** | Pemilik #7, `EX-03` | Harga **tidak boleh** kolom di tabel meja. Snapshot mencegah perubahan harga bersifat retroaktif |
| **SC-05** | Pembayaran QRIS via Midtrans Core API, halaman ber-brand SPL | **IN** | Pemilik #3 | Satu gateway saja |
| **SC-06** | Anti double-booking di level database (exclusion constraint) + status hold | **IN** | `PAY/EXP` | **Non-negotiable.** Pengecekan di level kode aplikasi pasti bocor |
| **SC-07** | Webhook idempoten: verifikasi SHA512, validasi nominal, guard out-of-order, cron rekonsiliasi | **IN** | `WH-01…WH-08` | Tanpa ini, pembayaran sah bisa hilang atau pembayaran palsu bisa diterima |
| **SC-08** | Status meja live untuk pelanggan ("5 dari 8 terisi") | **IN** | Pemilik #4, `UX-14`, `EX-13` | Memenuhi requirement #4 sekaligus jadi social proof dan mengurangi telepon masuk |
| **SC-09** | Peta meja realtime untuk kasir (hijau/merah/kuning/abu) | **IN** | `OPS-05` | Penambahan penyelamat #2 |
| **SC-10** | Sesi walk-in diinput kasir ke sistem yang sama + peringatan bentrok booking | **IN** | `OPS-01…OPS-04` | Penambahan penyelamat #1 |
| **SC-11** | Pemesanan F&B: menyertai booking **dan** berdiri sendiri | **IN** | Pemilik #5 | Requirement eksplisit pemilik |
| **SC-12** | Cross-sell F&B di alur checkout booking | **IN** | `UX-11` | Titik konversi dengan dampak terbesar pada KPI-03 dan KPI-05 |
| **SC-13** | QR stiker di meja → menu → order masuk dashboard admin bertanda nomor meja; **kasir menautkan ke tab** | **IN** | turunan Pemilik #5 | Versi minimal. Auto-binding penuh tetap Fase 2 |
| **SC-14** | Tab meja: satu sesi, banyak item, banyak record pembayaran lintas channel | **IN** | `FB-01…FB-04` | Tanpa ini laporan keuangan tidak nyambung |
| **SC-15** | Dashboard admin realtime + notifikasi suara browser + Web Push (PWA) | **IN** | Pemilik #6, `WA-01` | Menyelesaikan 80% kebutuhan notifikasi dengan Rp 0 dan tanpa risiko banned |
| **SC-16** | Admin: kelola jumlah meja, kelas meja, status maintenance | **IN** | Pemilik #7, `AD-01…AD-04` | Requirement eksplisit |
| **SC-17** | Admin: ubah harga sesi & harga menu (dengan `effective_from`) | **IN** | Pemilik #7 | Requirement eksplisit |
| **SC-18** | Dashboard keuangan: gross vs net, per kategori, per channel, dua view (tanggal transaksi & tanggal settlement) | **IN** | Pemilik #8, `FIN-07`, `FIN-08`, `TAX-09` | Requirement eksplisit |
| **SC-19** | Export CSV/XLSX untuk akuntan | **IN** | `FIN-10` | Murah, langsung dipakai tiap bulan |
| **SC-20** | Rekap PBJT terutang per bulan (DPP F&B & DPP hiburan terpisah) | **IN** | `TAX-07` | Fitur yang membuat pemilik jatuh cinta pada sistem |
| **SC-21** | Struk bernomor urut tanpa gap, memuat NPWPD & rincian pajak | **IN** | `TAX-05`, `TAX-06`, `TAX-08` | Gap nomor struk = temuan pemeriksaan Bapenda |
| **SC-22** | Role terpisah (owner / admin / cashier), **akun per orang** | **IN** | `AD-07`, `AD-08` | Penambahan penyelamat #5 |
| **SC-23** | Audit log immutable + laporan harian Aktivitas Sensitif | **IN** | `AD-06`, `AD-09`, `AD-10` | Penambahan penyelamat #5 |
| **SC-24** | Shift report & rekonsiliasi kas fisik vs sistem | **IN** | `EX-12` | ROI langsung terhadap MS-09 |
| **SC-25** | Perpanjang sesi + saran meja alternatif otomatis | **IN** | `OPS-12…OPS-16` | Penambahan penyelamat #3 |
| **SC-26** | Check-in QR + grace period 15 menit + status no-show | **IN** | `OPS-06…OPS-08` | Menghilangkan ambiguitas "sudah datang atau belum" |
| **SC-27** | PWA offline: jadwal hari ini ter-cache + indikator koneksi jujur + cetak jadwal harian | **IN** | `OPS-18`, `OPS-19`, `OPS-22` | Penambahan penyelamat #4 |
| **SC-28** | Store credit sebagai kompensasi default; refund uang manual lewat dashboard gateway | **IN** | `RFD-06`, `RFD-07` | Refund otomatis + bug = uang hilang. Store credit menahan uang di dalam venue |
| **SC-29** | Backup `pg_dump` harian + satu kali uji restore sebelum go-live | **IN** | `DB-06` | Aplikasi ini memegang catatan uang dan free tier tidak punya backup |
| **SC-30** | Tombol "Kirim bukti booking ke WhatsApp" (`wa.me` deep link) | **IN** | `WA-01` | Rp 0, tanpa risiko banned |
| — | — | — | — | — |
| **SC-31** | Notifikasi WhatsApp otomatis (reminder H-1 jam, konfirmasi) | **NANTI — Fase 2** | `OPS-09`, `WA-02` | Butuh gateway berbayar dan nomor terpisah karena risiko banned |
| **SC-32** | KDS (Kitchen Display System) | **NANTI — Fase 2** | `EX-09` | **Naik ke MVP kalau volume F&B online diperkirakan tinggi sejak awal** — [PERLU KONFIRMASI] |
| **SC-33** | QR meja auto-binding ke tab tanpa intervensi kasir | **NANTI — Fase 2** | `FB-05`, `EX-08` | SC-13 sudah menutup kebutuhan minimalnya |
| **SC-34** | Membership prepaid + poin | **NANTI — Fase 2** | `EX-02` | ROI tertinggi setelah MVP, tapi butuh data pelanggan yang baru terkumpul setelah MVP jalan |
| **SC-35** | DP / bayar sebagian | **NANTI — Fase 2** | `EX-01` | Menambah state pembayaran parsial ke sistem yang belum terbukti stabil |
| **SC-36** | Heatmap okupansi (jam × hari) | **NANTI — Fase 2** | `EX-05` | Butuh minimal 8 minggu data agar bermakna |
| **SC-37** | Waitlist slot penuh | **NANTI — Fase 2** | `OPS-17` | Baru relevan setelah utilisasi prime mendekati penuh |
| **SC-38** | Offline write queue (IndexedDB) + resolusi konflik manual | **NANTI — Fase 2** | `OPS-20`, `OPS-21` | Kompleksitas tinggi; SC-27 sudah menutup 80% rasa sakitnya |
| **SC-39** | Halaman rekonsiliasi settlement vs mutasi rekening | **NANTI — Fase 2** | `FIN-09` | Manual dulu lewat export CSV |
| **SC-40** | Manajemen stok F&B otomatis | **NANTI — Fase 3** | `EX-11` | Butuh disiplin input yang belum ada |
| **SC-41** | Turnamen / liga internal dengan bracket | **NANTI — Fase 3** | `EX-06` | Diferensiator kuat, tapi produk terpisah |
| **SC-42** | Kontrol lampu meja via relay | **NANTI — Fase 3** | `HW-03`, `HW-04` | Pekerjaan kelistrikan dengan risiko kebakaran & asuransi, bukan pekerjaan software. Di MVP hanya disiapkan kolom `controller_channel` (nullable) — biaya nol, menghindari migrasi menyakitkan nanti |
| **SC-43** | Split bill antar pemain | **NANTI — Fase 3** | `FB-06` | Permintaan nyata belum terbukti |
| **SC-44** | Refund otomatis via API | **NANTI — Fase 3** | `RFD-08`, `PAY-19` | Volume pembatalan rendah; refund salah jauh lebih mahal daripada refund lambat |
| **SC-45** | Integrasi tapping box Bapenda | **NANTI — Fase 3** | `TAX-11` | Hanya kalau daerah mewajibkan — [PERLU KONFIRMASI] |
| — | — | — | — | — |
| **SC-46** | Aplikasi native iOS/Android | **OUT** | — | Pemilik eksplisit meminta berbasis web. Native menambah dua toolchain, dua proses review store, dan nol pelanggan tambahan |
| **SC-47** | Gateway pembayaran kedua (DOKU) di MVP | **OUT** | `PAY-08` | Menggandakan permukaan bug rekonsiliasi. Dievaluasi ulang kalau volume online melewati ±Rp 100 juta/bulan (DOKU unggul di settlement T+1) |
| **SC-48** | Kartu kredit / Virtual Account di MVP | **OUT** | `PAY-16` | QRIS sudah interoperabel dengan seluruh e-wallet dan m-banking Indonesia. VA/kartu butuh NPWP dan menambah permukaan bug tanpa menambah pelanggan yang bisa membayar |
| **SC-49** | Baris biaya "Biaya QRIS" / surcharge ke pelanggan | **OUT — dilarang** | `PAY-01` | Bank Indonesia menyatakan MDR ditanggung merchant dan **tidak boleh** dibebankan ke konsumen. Serap ke margin |
| **SC-50** | Fitur auto-split tagihan menjadi beberapa transaksi ≤Rp 100.000 | **OUT — dilarang** | — | *Transaction splitting* melanggar aturan acquirer dan bisa berujung penonaktifan merchant |
| **SC-51** | Multi-venue / multi-cabang | **OUT** | — | Satu venue. Arsitektur tidak dipaksa multi-tenant, tetapi zona waktu memakai nama IANA (`Asia/Jakarta`), bukan hard-code `+07`, supaya cabang WITA/WIT tidak memaksa penulisan ulang |
| **SC-52** | Modul HR / absensi / payroll staf | **OUT** | — | Bukan masalah yang diminta dipecahkan |
| **SC-53** | Marketplace / listing di platform pihak ketiga | **OUT** | — | Fase jauh, dan bukan produk ini |
| **SC-54** | Deploy di Vercel Hobby atau GitHub Pages | **OUT — terlarang** | `HS-01`, `HS-02` | Keduanya melarang penggunaan komersial secara eksplisit; GitHub Pages juga tidak punya runtime server untuk webhook maupun tempat aman untuk Server Key |

#### Definition of Done MVP

MVP dianggap selesai hanya bila **seluruh** butir berikut terpenuhi:

1. Uji bukti anti double-booking lolos: dua sesi bersebelahan sukses, satu sesi overlap ditolak database dengan `23P01`.
2. Sembilan skenario uji pembayaran (`QA-01` s/d `QA-09`) lolos di sandbox, termasuk webhook duplikat, webhook out-of-order, nominal tidak cocok, dan webhook hilang total.
3. Kasir bisa membuka sesi walk-in dalam ≤ 15 detik (diukur, bukan diperkirakan).
4. Tablet kasir dicabut dari internet, jadwal hari ini tetap tampil.
5. `pg_dump` harian berjalan **dan** satu kali restore sudah diuji ke database kosong.
6. Custom SMTP terpasang dan rate limit Supabase Auth sudah dinaikkan dari default 30 new users/hour.
7. Pemilik bisa menutup buku satu hari dan mencocokkan angkanya dengan kas fisik + mutasi rekening, dengan selisih ≤ 0,5%.
8. Struk bernomor urut tanpa gap setelah 50 transaksi uji termasuk void.

#### Aturan penjaga scope

| ID | Aturan |
|---|---|
| **SG-01** | Setiap permintaan fitur baru sebelum go-live default-nya **Fase 2**, kecuali bisa dibuktikan bahwa tanpanya salah satu dari 10 requirement pemilik gagal berfungsi |
| **SG-02** | Tidak ada fitur baru masuk MVP tanpa satu fitur MVP lain keluar (**one-in, one-out**) |
| **SG-03** | Semua fitur Fase 2/3 hanya boleh dimulai setelah KPI-08 (cakupan pencatatan walk-in) mencapai 100% selama dua minggu berturut-turut. Membangun di atas data yang bolong adalah pemborosan |

---

### 1.8 Ide Tambahan Bernilai Bisnis

Dinilai dari sudut pemilik usaha (uang masuk, uang bocor, waktu staf) dan senior developer (biaya bangun, biaya rawat, risiko). **Effort**: S = ≤ 3 hari, M = 1–2 minggu, L = > 2 minggu. Semua estimasi rupiah adalah **ASUMSI** berbasis papan hitung §1.2.

| ID | Ide | Dampak bisnis | Effort | Ketergantungan | Fase | Alasan penempatan |
|---|---|---|---|---|---|---|
| **IDE-01** | **Voucher / happy hour jam mati** | Menyerang MS-05 langsung. Menaikkan utilisasi jam mati 15%→28% bernilai **±Rp 6,5 juta/bulan**. Kapasitas jam mati adalah aset yang paling murah untuk dijual karena tidak menambah biaya tetap apa pun | **S** | Rate card engine (sudah IN sebagai SC-04) | **MVP** | Rate card sudah dibangun untuk requirement pemilik #7. Happy hour hanyalah konfigurasi di atasnya — **effort mendekati nol, dampak terbesar dari seluruh daftar ini** |
| **IDE-02** | **Halaman status live publik** ("6 dari 8 meja terisi") yang bisa dibagikan | Mengurangi telepon masuk (MS-03, ±36 menit/malam waktu kasir), jadi social proof, dan menambah sinyal SEO lokal | **S** | `get_availability()` | **MVP** | Sudah menjadi SC-08; disebut di sini karena nilai bisnisnya sering diremehkan |
| **IDE-03** | **Shift report & rekonsiliasi kas** | Menyerang MS-09. ASUMSI mengurangi kebocoran 1%→0,2% dari omzet tunai = **±Rp 580.000/bulan**, plus efek jera yang tidak terukur | **S** | Audit log, role | **MVP** | ROI langsung, effort kecil. Sudah SC-24 |
| **IDE-04** | **Membership prepaid + poin** (deposit Rp 500.000 dapat bonus 1 jam) | Dua efek sekaligus: **kas masuk di muka** dan retensi. ASUMSI 40 member × Rp 500.000 = Rp 20 juta kas di muka, dan member ASUMSI datang 1,6× lebih sering. Ini ide dengan ROI tertinggi setelah MVP | **M** | Basis data pelanggan (baru ada setelah MVP jalan), dompet saldo, aturan kedaluwarsa | **Fase 2** | Butuh data pelanggan riil untuk menentukan nilai bonus, dan menambah "uang di dalam sistem" yang punya konsekuensi akuntansi (saldo pelanggan = **kewajiban**, bukan pendapatan). Jangan bangun di atas sistem yang belum terbukti stabil |
| **IDE-05** | **Deposit / DP untuk booking besar** (bayar 50%, sisanya di tempat) | Menaikkan konversi booking rombongan dan event yang nilainya besar dan terasa mahal untuk dibayar penuh di muka | **M** | Pembayaran parsial, aturan pelunasan, kebijakan hangus | **Fase 2** | Menambah state pembayaran parsial ke alur yang di MVP sengaja dibuat biner (lunas / belum). Tunggu sampai webhook terbukti stabil selama 4 minggu |
| **IDE-06** | **Sewa meja rombongan / paket event** (blok 4+ meja, minimum spend F&B) | Transaksi bernilai jauh di atas rata-rata (ASUMSI Rp 1,5–3 juta per event) dan mengisi jam yang biasanya sepi (Minggu siang, hari kerja awal minggu) | **M** | Booking multi-meja, minimum spend, DP (IDE-05) | **Fase 2** | Di MVP, booking >4 jam atau >2 meja tetap bisa dilayani **lewat admin secara manual** — jalur ini sudah cukup untuk menguji apakah permintaannya nyata sebelum membangun fiturnya |
| **IDE-07** | **Notifikasi WhatsApp otomatis** (konfirmasi + reminder H-1 jam) | Menekan no-show (KPI-07) dan mengurangi telepon "jadi tidak ya?". Tapi biayanya nyata: gateway unofficial Rp 25.000–110.000/bulan dengan **risiko nomor di-banned permanen**, atau WABA resmi **±Rp 500.000–856.000/bulan** — lebih mahal daripada seluruh biaya hosting berbayar | **M** | Nomor WA terpisah (bukan nomor utama venue), template pesan | **Fase 2** | Di MVP, `wa.me` deep link (SC-30) memberi 70% manfaatnya dengan biaya Rp 0 dan risiko nol. **Notifikasi admin tidak boleh lewat WhatsApp sama sekali** — Web Push + suara browser sudah menyelesaikannya gratis |
| **IDE-08** | **Ajakan review Google setelah check-out** | Review Google Maps adalah kanal akuisisi organik terpenting untuk venue fisik. Kirim link review 2 jam setelah tab ditutup, hanya ke pelanggan yang sesinya berjalan normal | **S** | Data kontak pelanggan, trigger pasca-sesi | **Fase 2** | Effort kecil, dampak akuisisi besar. Tidak di MVP hanya karena butuh kanal pengiriman (email/WA) yang stabil dulu. **Jangan pernah menawarkan imbalan untuk review** — melanggar kebijakan Google dan bisa menghapus seluruh review venue |
| **IDE-09** | **Referral antar pemain** (kode undangan, keduanya dapat kredit) | Biliar adalah olahraga sosial; hampir tidak ada yang datang sendirian. Akuisisi organik dengan biaya variabel yang terkendali | **M** | Store credit (SC-28), membership (IDE-04), anti-abuse | **Fase 3** | Tanpa store credit dan membership yang matang, referral menjadi lubang penyalahgunaan (akun ganda). Bangun setelah IDE-04 |
| **IDE-10** | **Turnamen / liga internal** dengan pendaftaran dan bracket online | Diferensiator paling kuat terhadap kompetitor dan paling selaras dengan merek "Sports Pool Lounge". Mengunci kalender jam sepi berminggu-minggu di muka, dan peserta membawa penonton yang membeli F&B | **L** | Booking multi-meja, sistem peserta, bracket, pembayaran pendaftaran | **Fase 3** | Praktis produk terpisah. Tetapi **bisa diuji tanpa software sama sekali**: jalankan satu turnamen manual, ukur permintaannya, baru putuskan |
| **IDE-11** | **Heatmap okupansi (jam × hari)** | Dasar data-driven pricing. Setelah heatmap ada, keputusan menaikkan tarif prime 10% menjadi keputusan berbasis bukti, bukan keberanian | **S** | Minimal 8 minggu data | **Fase 2** | Effort-nya kecil justru karena datanya sudah dikumpulkan sejak MVP. **Jangan bangun sebelum datanya ada** — heatmap dua minggu menyesatkan |
| **IDE-12** | **Booking meja resto (non-biliar) untuk Smokehouse** | Memonetisasi sisi F&B secara mandiri dan memanfaatkan merek kedua yang sudah ada | **M** | Inventaris meja resto terpisah dari meja biliar | **Fase 2** | Menggunakan ulang seluruh mesin booking; hanya butuh jenis inventaris baru. Tunggu bukti bahwa sisi biliar sudah stabil |
| **IDE-13** | **Gift card / voucher hadiah** yang bisa dibeli online | Kas masuk di muka, dan sebagian tidak pernah ditukarkan (breakage). Kuat di musim akhir tahun dan Ramadan/Lebaran | **M** | Store credit, kode voucher, kedaluwarsa | **Fase 3** | Punya konsekuensi akuntansi dan konsumen (kedaluwarsa voucher diatur). Tunda sampai store credit matang |
| **IDE-14** | **Paket korporat / liga kantor** (langganan bulanan blok jam tetap) | Pendapatan berulang yang bisa diprediksi, mengisi malam hari kerja yang paling sulit dijual | **M** | Booking berulang, invoice/penagihan | **Fase 3** | Perlu penjualan manual dulu. **Uji dengan spreadsheet dan 2 perusahaan sebelum menulis kode apa pun** |
| **IDE-15** | **Booking coach / kelas privat biliar** | Margin tinggi, mengisi jam mati, membangun komunitas pemain baru yang kemudian menjadi pelanggan reguler | **M** | Inventaris coach sebagai sumber daya terpisah dari meja | **Fase 3** | Menambah dimensi inventaris kedua (meja **dan** orang) — kompleksitas yang tidak sepadan sebelum permintaannya terbukti |

**Yang sengaja TIDAK direkomendasikan sama sekali:**

| Ide | Alasan penolakan |
|---|---|
| Program poin yang bisa ditukar diskon persentase | Melatih pelanggan menunggu diskon dan menggerus tarif prime yang justru paling mudah dijual. Kalau loyalty dibangun (IDE-04), hadiahnya sebaiknya **jam main bonus di jam mati** — biaya marginalnya mendekati nol dan sekaligus menyerang MS-05 |
| Diskon flash "meja kosong sekarang, potong 50%" | Melatih pelanggan reguler menunda kedatangan sampai muncul diskon. Kanibalisasi tarif penuh lebih besar daripada tambahan volume |
| Gamifikasi/leaderboard skor pemain | Butuh input skor manual yang tidak akan pernah dilakukan konsisten oleh staf maupun pemain |

**Urutan eksekusi Fase 2 yang direkomendasikan** (ROI menurun): IDE-11 heatmap → IDE-04 membership prepaid → IDE-08 review Google → IDE-07 notifikasi WhatsApp → IDE-05 DP → IDE-06 paket rombongan → IDE-12 booking meja resto.

---

### 1.9 Risiko Tingkat Bisnis yang Mempengaruhi Seksi Ini

Risiko teknis dibahas di seksinya masing-masing. Tiga risiko di bawah bersifat bisnis dan **bisa membatalkan asumsi seluruh dokumen**, jadi ditempatkan di seksi pertama.

| ID | Risiko | Dampak | Mitigasi & pemilik aksi |
|---|---|---|---|
| **RSK-01** | **Klasifikasi PBJT.** Venue bernama "Sports Pool Lounge" dengan bar berpotensi diklasifikasikan Bapenda sebagai **bar (40%)**, bukan jasa hiburan umum (10%) | Selisih **30 poin persentase dari omzet** — cukup untuk menentukan untung atau rugi. Mempengaruhi struktur harga, bukan sekadar konfigurasi | **[PERLU KONFIRMASI]** Pemilik menanyakan ke Bapenda/konsultan pajak **sebelum harga ditetapkan**: berapa tarif Perda setempat untuk (a) makanan-minuman dan (b) jasa kesenian & hiburan; apakah penjualan alkohol memicu kategori bar; apakah omzet sewa meja dan F&B dipisah di SPTPD; apakah daerah mewajibkan tapping box. Produk memitigasi dengan menjadikan tarif pajak **konfigurasi database ber-`effective_from`**, bukan konstanta di kode |
| **RSK-02** | **Klasifikasi kategori merchant gateway.** Gateway men-default merchant online ke UKE/UME (MDR 0,7%). Kalau omzet tahunan ≤ Rp 2 miliar, SPL berhak kategori Usaha Mikro dengan **MDR 0% untuk transaksi ≤ Rp 500.000** | Selisih **±Rp 12,4 juta/tahun** pada volume Rp 157 juta/bulan | **[PERLU KONFIRMASI]** Berapa omzet tahunan SPL? Kalau ≤ Rp 2 miliar, minta klasifikasi UMi **secara tertulis** saat onboarding. Sekaligus tanyakan: apakah tier MDR 0% ≤Rp 100.000 per 1 Oktober 2026 sudah diimplementasikan, dan settlement QRIS T+berapa. **Jangan masukkan penghematan ini ke proyeksi keuangan sampai ada jawaban tertulis** — hitung skenario konservatif 0,7% |
| **RSK-03** | **Adopsi staf.** Kalau walk-in tetap dicatat di kertas, ada dua sumber kebenaran dan seluruh produk gagal terlepas dari kualitas kodenya | Semua metrik menjadi fiksi; dashboard pemilik berbohong; double-booking tetap terjadi | Ini **risiko manusia, bukan teknis**. Mitigasi: GR-03 (input walk-in ≤ 15 detik), KPI-08 diaudit mingguan oleh pemilik lewat sampling, SOP tertulis, dan pelatihan sebelum go-live. **SG-03 memblokir seluruh pekerjaan Fase 2 sampai KPI-08 mencapai 100% selama dua minggu** |

---

### 1.10 Konvensi ID & Temuan Audit atas Dokumen Riset

**Temuan yang harus diselesaikan sebelum seksi-seksi berikutnya ditulis** — dua dokumen riset memakai prefix ID yang sama untuk hal berbeda, dan satu parameter kunci berbeda nilainya antar dokumen.

| ID temuan | Konflik | Resolusi yang diusulkan |
|---|---|---|
| **AU-01** | Prefix `PAY-xx` dipakai tiga kali dengan makna berbeda: riset pembayaran §1.4 (`PAY-01` = larangan surcharge MDR), riset pembayaran §10 (`PAY-01` = integrasi Midtrans Core API), riset operasional §R5.5 (`PAY-01` = hold slot 17 menit) | Seksi Pembayaran wajib **menomori ulang secara kanonik** dalam satu tabel tunggal. Seksi 1 tidak memakai prefix `PAY` sama sekali dan hanya merujuk deskripsinya |
| **AU-02** | **Durasi hold & expiry QRIS berbeda antar dokumen.** Riset pembayaran: expiry Midtrans **15 menit**, dengan peringatan eksplisit bahwa *"expiry scheduler hanya andal pada ≥15 menit"*. Riset operasional: QRIS 15 menit + hold DB 17 menit. Riset arsitektur data: QRIS **8 menit** + hold DB 10 menit + grace 2 menit | **Angka yang dipakai di seluruh dokumen ini, termasuk narasi JRN-A: QRIS 15 menit, hold DB 17 menit, job pelepasan +2 menit grace.** Alasan: ini satu-satunya konfigurasi yang tidak melanggar batas keandalan scheduler Midtrans, sekaligus mempertahankan prinsip *expiry gateway < expiry DB < eksekusi job*. **[PERLU KONFIRMASI]** ke pemilik: 15 menit menahan slot cukup lama di Sabtu malam; kalau pemilik ingin lebih pendek, itu **tidak bisa dilakukan lewat `custom_expiry` Midtrans** dan harus lewat mekanisme lain yang perlu dirancang khusus |
| **AU-03** | Prefix `FB-xx` dipakai untuk "F&B / tab meja" di riset operasional dan juga muncul sebagai contoh generik di brief pemilik | Seksi F&B memakai `FB-xx` secara kanonik; seksi lain tidak boleh memakainya |

**Namespace ID yang berlaku untuk seksi ini:** `CTX` (konteks), `MS` (masalah), `G` (tujuan), `KPI` (metrik), `GR` (guardrail), `PER` (persona), `JRN` (journey), `SC` (scope), `SG` (penjaga scope), `IDE` (ide tambahan), `RSK` (risiko bisnis), `AU` (temuan audit). Seksi berikutnya **tidak boleh** memakai prefix-prefix ini.

---

### 1.11 Rekap Asumsi & Butir [PERLU KONFIRMASI] Seksi 1

Tidak satu pun angka di bawah boleh dipakai sebagai dasar keputusan produksi sebelum dikonfirmasi pemilik. Butir bertanda **BLOKIR** menghentikan pekerjaan teknis sampai terjawab.

| ID | Butir | Dampak jika salah | Status |
|---|---|---|---|
| **AS1-01** | Jumlah meja = **8** | Seluruh papan hitung §1.2, semua target KPI, dan estimasi kuota egress/email/MDR bergeser proporsional | **BLOKIR** |
| **AS1-02** | Jam operasional **10.00–02.00 WIB** | Kapasitas teoretis, grid slot, dan batas `business_date` 02.00 | **BLOKIR** |
| **AS1-03** | Harga rata-rata tertimbang **Rp 50.000/jam**; struktur happy hour/prime/weekend/VIP seperti contoh riset | Seluruh proyeksi omzet dan nilai per poin utilisasi | **BLOKIR** |
| **AS1-04** | Klasifikasi PBJT: hiburan **10%**, bukan bar 40% (RSK-01) | Struktur harga dan viabilitas bisnis | **BLOKIR** |
| **AS1-05** | Omzet tahunan menentukan kategori merchant UMi vs UKE (RSK-02) | ±Rp 12,4 juta/tahun biaya MDR | **BLOKIR** |
| **AS1-06** | Utilisasi baseline **38%**, jam mati **15%**, attach rate F&B **45%**, AOV **Rp 135.000** | Semua target KPI. **Diganti wajib oleh hasil pengukuran Bulan 0** | Tinggi |
| **AS1-07** | Harga tayang **tax-inclusive** untuk booking online | Konversi checkout dan tampilan seluruh harga di aplikasi | Tinggi |
| **AS1-08** | Durasi hold pembayaran **15 menit QRIS / 17 menit DB** (AU-02) | Berapa lama slot Sabtu malam tersandera | Tinggi |
| **AS1-09** | Kebijakan pembatalan mengikuti model venue biliar sejenis: ≥24 jam refund 100%, <24 jam refund 50%, reschedule maks H-1 sekali. Jendela pembatalan berbayar **wajib di bawah 7 hari** karena refund QRIS OFF-US hanya mungkin dalam 7 hari | Kewajiban yang tidak bisa dieksekusi lewat gateway | Tinggi |
| **AS1-10** | Grace period check-in **15 menit**; sesi dihitung dari **jam booking, bukan jam kedatangan** | Kejelasan yang harus tertulis di halaman konfirmasi sebelum pelanggan membayar | Sedang |
| **AS1-11** | Volume F&B online rendah di awal → **KDS = Fase 2** (SC-32) | Kalau tinggi, KDS naik ke MVP dan scope bertambah 1–2 minggu | Sedang |
| **AS1-12** | Venue **tidak pernah tutup > 7 hari berturut-turut** | Risiko Supabase Free di-pause; keepalive eksternal menjadi wajib mutlak | Sedang |
| **AS1-13** | Jumlah staf yang butuh akun (owner/admin/cashier) dan apakah mereka bersedia login per orang | Kualitas audit log; kalau akun bersama tetap dipakai, SC-23 kehilangan seluruh nilainya | Sedang |
| **AS1-14** | Booking paling jauh **14 hari**, paling cepat **H+1 jam**, durasi maks online **4 jam** | Eksposur perubahan harga dan bentrok dengan walk-in di depan kasir | Sedang |
| **AS1-15** | Frekuensi kejadian di §1.3 (2 bentrok/minggu, 3 no-show/minggu, 12 telepon/malam, kebocoran kas 1%) | Besaran kerugian yang dikutip, bukan arah kesimpulannya | Rendah |