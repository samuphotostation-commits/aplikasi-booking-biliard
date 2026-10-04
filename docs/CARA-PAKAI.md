# SPL — cara memakai & keadaan sekarang

Diperbarui: 26 September 2026 (putaran 3: meteran 05.00, rekap rentang bebas, akun member tamu,
booking 30 menit sebelum main, meja open bill tidak dijual online, QRIS DOKU)

## 1. Tiga pintu masuk

| Untuk siapa | Alamat / berkas | Isi |
|---|---|---|
| **Staf** (kasir, dapur, pemilik) | **https://spl-kasir.pages.dev** | Panel lengkap. Wajib PIN — PIN diperiksa **server**, bukan perangkat |
| **Staf, aplikasi Windows** | `release\SPL-Kasir-Setup-1.0.0.exe` | Installer resmi. Klik dua kali → pilih folder → selesai. Ikon sendiri, layar penuh, tanpa bilah alamat, **cetak struk tanpa dialog**. Bisa dicopot lewat Settings → Apps |
| **Pelanggan** | **https://spl-tamu.pages.dev** | Booking biliar, reservasi meja resto, pesan makanan. Tidak ada panel staf di dalamnya |

> **Pindah hosting 27 Sep 2026:** situs sekarang di **Cloudflare Pages** (akun `grendsoni`), karena kredit deploy Netlify gratis habis. Alamat Netlify lama (`spl-kasir.netlify.app`, `spl-tamu.netlify.app`) MASIH HIDUP tapi isinya versi 26 Sep sore dan tidak bisa diperbarui — pakai alamat `.pages.dev`, dan minta staf memasang ulang PWA-nya dari alamat baru.

Server data: Supabase project **`spl-venue`** (`fhoxdsxabpohafilqxoz`) di org `grendsoni`, region Singapore.

## 2. Meja & tarif

| Kelas | Jumlah | Tarif | Catatan |
|---|---|---|---|
| Reguler | 30 meja | Rp 29.000/jam siang (11–18), Rp 39.000/jam malam | Paket Siang Rp 50.000 (2 jam + 2 minuman) |
| **VIP — no smoking** | VIP 1–2 | Rp 50.000/jam | |
| **VVIP — bebas rokok** | VIP 3–4 | Rp 60.000/jam **[perlu dikonfirmasi pemilik]** | |
| **Meja resto** | 12 meja | tanpa sewa waktu | Hanya bill makanan; bisa direservasi tamu |

Kelas tiap meja **bisa ditukar sendiri** di **Atur → Meja biliar → ketuk mejanya → Reguler / VIP / VVIP**.
Tarifnya juga diatur di halaman yang sama. Meja yang sedang dipakai atau sudah dibooking tidak bisa
pindah kelas — harga sudah terlanjur disepakati tamu.

## 3. Dua cara membuka meja

Papan → ketuk meja kosong → pilih:

| Pilihan | Untuk siapa | Cara menagih |
|---|---|---|
| **Open bill** | Tamu yang belum tahu mau main berapa lama | Meteran per menit (lihat aturan di bawah) |
| **Paket per jam** (1–4 jam) | Tamu yang minta "2 jam saja" | Harga blok tetap, tidak bertambah per menit; ada jam selesai & hitung mundur |

Paket per jam otomatis dibatasi jam tutup dan booking berikutnya — kalau hanya muat 2 jam,
tombol 3 & 4 jam mati sendiri. Bisa diperpanjang per jam seperti booking online.

## 4. Aturan meteran open bill

- **Batal dalam 5 menit pertama: tidak ditagih.** Tamu salah meja, bolanya kurang, berubah pikiran — tutup tab, Rp 0.
- **Lewat menit ke-5: langsung terhitung 30 menit.** Sesudah itu dihitung per menit.
- **Meteran berhenti sendiri pukul 05.00 pagi.** Bukan jam tutup 02.00 — permintaan pemilik, karena
  jam 02.00 venue bisa saja masih ramai dan tamunya memang masih main. Lewat 05.00 dipastikan tidak ada
  lagi tamu, jadi kalau komputer mati atau tab lupa ditutup, tamu TIDAK ditagih semalaman. Esoknya tab itu
  muncul di tab Kasir sebagai "Tab belum ditutup dari hari sebelumnya".
  (Jam 02.00 tetap berlaku sebagai batas **booking & perpanjangan**, bukan batas meteran.)
- Kalau tamu sebenarnya pulang lebih awal, **superadmin** bisa mengoreksi jam berhentinya:
  Papan → meja → *Koreksi jam berhenti meteran*. Tercatat di jejak audit atas nama yang mengoreksi.

## 5. Yang bisa dilakukan kasir di satu meja

Papan → ketuk meja:

| Kebutuhan | Tombolnya |
|---|---|
| Salah jumlah / salah menu (belum diantar) | **ubah** di baris pesanannya |
| Pesanan masuk ke meja yang salah | **Pindahkan Pesanan ke Meja Lain** |
| Tamu bayar sendiri-sendiri | **Bayar Sebagian / Per Orang** (pilih pesanannya, atau isi nominal) |
| Tamu pindah meja | **Pindah Meja** (hanya ke meja sekelas) |
| Barang sudah diantar tapi salah | **void** (karyawan → butuh persetujuan superadmin) |
| Tutup tab | **Tutup Tab & Bayar** |

Aturan yang dijaga mesin:
- Pesanan yang **sudah diantar** atau **sudah dibayar** tidak bisa diubah diam-diam — harus lewat void.
- Mengubah/memindahkan pesanan **tidak boleh** membuat tagihan jatuh di bawah uang yang sudah diterima.
- Uang split bill langsung masuk laporan & kas shift yang sedang buka; sisanya tetap di bill meja.
- Kalau sesinya di-void, semua uang split bill-nya otomatis dicatat untuk dikembalikan.

## 6. Reservasi meja Smokehouse Resto

Tamu: **https://spl-tamu.netlify.app → Reservasi Meja Resto**. Tanpa bayar di muka; tamu mengisi
nama, nomor HP, jumlah orang, jam datang. Aplikasi memilihkan meja yang muat dan memberi **kode check-in 6 angka**.

Kasir: reservasi muncul di tab **Kasir → Booking hari ini** dengan label `RESTO`. Masukkan kodenya seperti
booking biliar. Meja resto tidak punya meteran jam — yang ditagih hanya makanannya, dan bisa dibayar per orang.
Kalau tamu tidak datang 20 menit setelah jamnya, mejanya dilepas otomatis.

## 7. Pesan makanan saja (tanpa meja)

Tamu: **https://spl-tamu.netlify.app → Menu → Checkout → Takeaway**. Pilih **"Saat ambil di kasir"**
(atau QRIS kalau sudah aktif). Dapur langsung menyiapkan; tamu menyebut kode pesanannya saat mengambil.

Kasir: pesanan muncul di **Kasir → "Takeaway menunggu diambil"** lengkap dengan nominalnya. Tekan
**Tunai / Kartu / QRIS** saat tamu membayar. Sebelum ditandai lunas, pesanan itu **tidak dihitung**
sebagai omzet — jadi laporan tidak pernah menghitung makanan yang belum diambil.

## 8. Akun staf, multi superadmin & masuk dengan email

**Atur → Akun staf.** Pemilik bisa menambah akun (karyawan atau superadmin), mengganti peran,
menonaktifkan, dan menghapus. Aturan yang dijaga:

- PIN 4–6 angka dan **tidak boleh kembar** — kalau dua orang punya PIN sama, jejak audit jadi bohong.
- **Selalu harus ada minimal satu superadmin aktif.**
- Akun yang shift-nya masih buka tidak bisa dihapus.
- Di mode server, PIN baru ikut didaftarkan ke server (butuh `supabase/schema-staf.sql` sudah dijalankan),
  jadi staf itu bisa masuk dari perangkat mana pun.

**Masuk dengan email** (untuk pemilik/manajer yang tidak mau menghafal PIN):

1. Superadmin mengisi kolom email pada akun staf di **Atur → Akun staf**.
2. Orang itu membuka panel staf → **"Masuk dengan email"** → isi alamatnya → **kode 6 angka**
   dikirim ke emailnya → masukkan kodenya → masuk seperti biasa (sesi 12 jam).
3. Kode hanya dikirim ke email yang memang terdaftar sebagai staf aktif.

> Email bawaan Supabase dibatasi beberapa pesan per jam. Kalau nanti dipakai sering,
> pasang SMTP sendiri (Resend/Brevo gratis) di Supabase → Authentication → SMTP.

> **Masih PR:** PIN bawaan (9999 / 8888 / 1234 / 2345 / 3456) belum diganti. Ganti lewat Atur → Akun staf,
> lalu hapus akun demo yang tidak dipakai.

## 9. Laporan

- **Rekap** (superadmin): pilih **Harian · Mingguan · Bulanan · Pilih tanggal** di atas layar.
  Mingguan = Senin–Minggu, bulanan = bulan berjalan; keduanya menjumlahkan rekap harian
  (jadi tidak mungkin berbeda dari jumlah hariannya) dan menampilkan grafik batang per hari —
  ketuk satu hari untuk membuka rekap hari itu. Unduh CSV mengikuti periode yang dipilih.
- **Pilih tanggal** = rentang bebas ala kalender: dua kolom tanggal (*dari* dan *sampai*) plus pintasan
  **7 hari terakhir · 30 hari terakhir · Bulan ini · Bulan lalu**. Rentang paling panjang 92 hari —
  lebih dari itu otomatis dipotong supaya laporan tetap cepat dibuka. Utilisasi meja ikut menyesuaikan
  periode (penyebutnya jam-meja × jumlah hari), jadi persentasenya tetap masuk akal untuk sebulan penuh.
- Isi rekap: omzet, pajak, MDR, net, per kanal, per lini usaha — per hari operasional (batas 02.00).
- **Laporan stok 05.00 → 05.00** di bawah Rekap: awal, masuk, terjual, kembali, susut, sisa per barang,
  plus unduh CSV. Batas 05.00 pagi sengaja berbeda dari hari uang supaya barang dihitung setelah semua tab selesai.
- **Pelanggan**: dua daftar dalam satu tab.
  - **Kunjungan** — terkumpul sendiri dari booking & pesanan bernomor HP.
  - **Member aplikasi** — tamu yang mendaftar sendiri sebelum booking (lihat §16). Ada izin promonya,
    tombol **Salin nomor (blast)** yang otomatis hanya mengambil yang mengizinkan, **Unduh CSV**,
    **Reset PIN** kalau tamu lupa, dan **Hapus akun** (UU PDP).

## 10. Pembayaran QRIS dinamis (Midtrans / DOKU)

Seluruh jalurnya **sudah terpasang**; yang tersisa hanya memasukkan secret key:

| Bagian | Keadaan |
|---|---|
| Tabel tagihan `payment_charges` + status publik | ✅ terpasang (`supabase/schema-qris.sql`) |
| Edge Function **`qris-buat`** (membuat QR, memegang secret key) | ✅ terpasang |
| Edge Function **`qris-webhook`** (menerima notifikasi bayar) | ✅ terpasang, JWT dimatikan |
| Layar tamu menampilkan QR & menunggu lunas sendiri | ✅ terpasang |
| Panel **Atur → QRIS dinamis** + tombol **Uji koneksi** | ✅ terpasang |
| **Secret key gateway** | ⬜ **belum** — ini yang tinggal diisi |

**Cara mengaktifkan (5 menit):**

1. Supabase → **Edge Functions → Secrets** → tambah:
   - Midtrans: `MIDTRANS_SERVER_KEY` = `Mid-server-…` (tambah `MIDTRANS_PRODUKSI` = `1` kalau sudah live)
   - atau DOKU: `DOKU_CLIENT_ID` + `DOKU_SECRET_KEY` (tambah `DOKU_PRODUKSI` = `1` kalau sudah live)
2. Di dashboard gateway, isi alamat notifikasi/webhook:
   `https://fhoxdsxabpohafilqxoz.supabase.co/functions/v1/qris-webhook`
3. Buka **Atur → QRIS dinamis → Uji koneksi (Rp 1.000)**. Tagihan uji itu nyata di gateway tapi tidak
   tersambung ke meja/pesanan mana pun — dibayar atau tidak, rekap dan jejak venue tidak berubah.
   Kalau statusnya berubah **LUNAS** sendiri, berarti key, tanda tangan, dan webhook semuanya benar.
4. Selesai. Layar bayar tamu otomatis berubah dari "bayar di kasir" menjadi pembayaran QRIS sungguhan.

**Khusus DOKU:** yang dipakai API **Checkout** (`/checkout/v1/payment`) — protokol yang sudah terbukti
jalan di akun DOKU pemilik (dipakai aplikasi photobooth-nya). Hasilnya halaman pembayaran DOKU:
di akun **produksi** halaman itu dikunci ke QRIS sehingga tamu langsung melihat QR, sedangkan di
**sandbox** DOKU tidak bisa mengaktifkan QRIS jadi semua metode tampil — cukup untuk membuktikan
alur uangnya (tagihan dibuat → dibayar → webhook → jejak venue). Layar tamu menampilkan tombol
"Buka halaman pembayaran QRIS" untuk kasus ini, dan tetap menunggu konfirmasi dari server.

**Yang dijaga:** secret key hanya ada di Edge Function (tidak pernah ikut ke HP/bundel web);
webhook memeriksa tanda tangan gateway; nominal yang dicatat = yang benar-benar dibayar;
aksi yang dirilis dibekukan sejak QR dibuat; dan kalau slotnya keburu diambil orang lain,
mesin menolak booking itu dan mencatat dananya untuk dikembalikan.

## 10b. Akun member tamu (daftar & masuk sebelum booking)

Permintaan pemilik: **booking online hanya diproses atas nama member**, supaya data tamunya menjadi
milik venue dan bisa dipakai blast promo.

- Tamu membuka **Akun** di aplikasi pelanggan → *Daftar baru*: nomor HP, nama, email (opsional),
  PIN 6 angka, dan centang izin promo. Berikutnya tinggal *Masuk* dengan HP + PIN (sesi 30 hari).
- Di layar Checkout booking, kalau belum masuk, yang muncul adalah panel **Masuk / Daftar** —
  tombol bayar baru hidup setelah tamu masuk. **Pesan makanan / takeaway tidak perlu akun.**
- Nama & nomor HP yang dipakai untuk booking **diambil server dari data member**, bukan dari yang
  diketik di layar, jadi tidak bisa dipalsukan.
- PIN disimpan sebagai hash (bcrypt) — tidak bisa dilihat siapa pun, termasuk pemilik. Salah 5 kali
  → terkunci 15 menit. Tamu lupa PIN: kasir menekan **Reset PIN** di tab Pelanggan → Member aplikasi,
  lalu membacakan PIN sementaranya.
- Daftar member + izin promonya ada di **Pelanggan → Member aplikasi** (lihat §9).
- Tanpa server (mode lokal/uji coba), akun member tidak aktif dan booking kembali memakai
  formulir nama/HP seperti sebelumnya.

Berkas: `supabase/schema-member.sql` (tabel `members`, `member_sessions`, fungsi `member_*`).

## 10c. Booking online: jarak waktu & meja yang sedang dipakai

- **Paling cepat 30 menit sebelum main** (dulu 1 jam). Tamu yang sudah di jalan jam 16.30 masih bisa
  mengambil slot jam 17.00; jam 16.31 sudah terlalu dekat.
- **Meja yang sedang open bill tidak ditawarkan sama sekali malam itu.** Open bill tidak punya jam
  selesai — tidak ada yang tahu kapan tamunya pulang — jadi menjual slot berikutnya lewat aplikasi
  sama saja menjual meja yang belum tentu kosong. Meja itu muncul lagi begitu kasir menutup tabnya.
- Meja yang dibuka **paket per jam** tetap ditawarkan untuk jam sesudah paketnya selesai (+10 menit
  bersih-bersih), karena jam selesainya pasti.
- Kasir di lantai tidak ikut dibatasi: dia melihat tamunya langsung, jadi tetap bisa menjadwalkan
  meja itu dari panel staf.

## 11. Ketentuan yang ditampilkan ke tamu

Di halaman Booking, Checkout, saat bayar, dan di struk digital:

1. Booking yang sudah dibayar **tidak bisa dibatalkan** dan **tidak bisa diganti jadwalnya**.
2. Datang paling lambat 20 menit setelah jam mulai — lewat itu meja dilepas dan pembayaran hangus.
3. Waktu main dihitung dari jam booking, bukan dari jam kedatangan.

## 12. Siapa boleh melihat apa

| | Staf (sesudah PIN benar) | HP pelanggan |
|---|---|---|
| Jejak kejadian venue (berisi nama & nomor HP tamu) | ✅ | ❌ ditolak server |
| Ringkasan publik: meja terpakai jam berapa, kelas & tarif meja, harga menu, promo, stok habis | ✅ | ✅ |
| Status booking/pesanan **milik sendiri** (lewat kodenya) | ✅ | ✅ |
| Buka meja, tutup tab, split bill, koreksi pesanan, void, shift, tarif, laporan | ✅ | ❌ ditolak server |
| Pesan dari QR meja (bayar di kasir), tahan slot, reservasi meja resto | ✅ | ✅ |

PIN salah 20 kali dalam 10 menit membuat pintu PIN terkunci sementara.

## 13. Kalau internet putus

- Papan meja, bill berjalan, dan menu **tetap terbaca** di perangkat staf.
- Buka meja, check-in, pesan makanan, koreksi pesanan, pindah meja, lampu → **tetap jalan**, mengantre,
  terkirim sendiri saat tersambung lagi.
- Tutup tab, **bayar sebagian**, tutup shift, setujui void, tandai refund → **ditahan** sampai tersambung,
  supaya uang tidak tercatat dua kali oleh dua perangkat.
- Antrean tidak hilang walau aplikasi ditutup atau komputer mati.

## 14. Menerbitkan versi baru

```bash
npm test                                        # semua pengaman harus hijau dulu
npm run app                                     # rakit aplikasi staf     → folder web/
VITE_MODE_TAMU=1 WEB_OUT=web-tamu npm run app   # rakit aplikasi pelanggan → folder web-tamu/
npm run app:win                                 # aplikasi Windows → release/SPL-Kasir-Setup-1.0.0.exe
```

Lalu zip isi `web/` dan `web-tamu/`, buka **Cloudflare → Workers & Pages → spl-kasir / spl-tamu →
Create deployment → unggah zip-nya**. (Netlify lama hanya dipakai kalau kreditnya pulih.)

Berkas SQL yang harus sudah dijalankan di Supabase (SQL Editor, boleh diulang):
`schema.sql` → `schema-tamu.sql` → `schema-pin.sql` → `schema-pelanggan.sql` → `schema-staf.sql` →
`schema-email.sql` → `schema-qris.sql` → **`schema-member.sql`** (paling baru).

Catatan urutan: `schema-member.sql` membuat ulang pintu `guest_action` versi 3 argumen (dengan token
member), jadi jalankan **sesudah** `schema-tamu.sql`. Kalau `schema-tamu.sql` dijalankan ulang nanti,
jalankan lagi `schema-member.sql` sesudahnya.

Edge Function (sudah terpasang, hanya perlu dipasang ulang kalau kodenya berubah):
Supabase → Edge Functions → Deploy a new function → **Via Editor** → tempel isi
`supabase/functions/qris-buat/index.ts` dan `supabase/functions/qris-webhook/index.ts`
(khusus webhook: matikan "Verify JWT").

## 15. Yang masih perlu dilakukan

| Hal | Keadaan | Catatan |
|---|---|---|
| **Ganti PIN staf** | Masih bawaan | Sekarang bisa sendiri lewat Atur → Akun staf |
| **Tarif VVIP** | Sementara Rp 60.000/jam | Ubah di Atur → Tarif per jam kalau angkanya beda |
| **Pembagian VIP/VVIP** | VIP 1–2 no smoking, VIP 3–4 bebas | Ubah di Atur → Meja biliar |
| Pembayaran QRIS | Jalur lengkap sudah terpasang | Tinggal isi secret key Midtrans/DOKU — lihat bagian 10 |
| **Kredensial DOKU** | Belum dipasang di Supabase | Isi `DOKU_CLIENT_ID` + `DOKU_SECRET_KEY` (sandbox dulu), lalu tekan Uji koneksi |
| Project Supabase gratis | Tidur setelah ±7 hari tanpa aktivitas | Perlu pengingat harian kalau venue tutup lama |
| Installer `.exe` resmi (NSIS) | **Sudah jadi** (29 Sep 2026) | `release/SPL-Kasir-Setup-1.0.0.exe`, 95 MB. Unduhan komponen NSIS dari GitHub memang sering putus di jaringan ini — ULANGI saja perintahnya, sesudah tersimpan di cache tidak pernah gagal lagi |
| Ringkasan untuk HP pelanggan | Diterbitkan perangkat staf tiap ada perubahan | Kalau tidak ada perangkat staf online seharian, jalankan `node scripts/terbitkan.mjs <PIN>` sekali |

## 16. Perubahan 26 September 2026 (putaran 4)

- **QR QRIS tampil langsung di layar SPL.** Server mengambil isi QRIS dari DOKU
  (`/checkout/v1/payment/<token>/generate-qris`) dan aplikasi menggambarnya sendiri —
  tamu tidak lagi dilempar ke halaman DOKU. Kalau isi QRIS gagal diambil, tombol
  "Buka halaman pembayaran QRIS" tetap muncul sebagai cadangan.
- **Meja terisi kini TERLIHAT di layar tamu**, tidak lagi disembunyikan: nomornya dicoret,
  diberi arsir, diberi label **Dipakai / Dibooking / Rusak**, dan tidak bisa ditekan.
- **Daftar/masuk dengan Google (Gmail)** untuk member — lihat §17.

## 17. Menyalakan "Lanjut dengan Google" (sekali saja, ±5 menit)

Kode aplikasi & fungsi servernya **sudah terpasang**; yang kurang hanya izin dari Google.
Semua langkah di bawah dikerjakan pemilik karena menyangkut kredensial.

1. Buka **console.cloud.google.com** → buat project (mis. "SPL Venue") →
   **APIs & Services → OAuth consent screen** → External → isi nama aplikasi "SPL Sports
   Pool Lounge", email dukungan, lalu Save.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - *Authorized JavaScript origins*: `https://spl-tamu.pages.dev` dan `https://spl-kasir.pages.dev`
   - *Authorized redirect URI*: `https://fhoxdsxabpohafilqxoz.supabase.co/auth/v1/callback`
3. Salin **Client ID** dan **Client secret**.
4. Supabase → **Authentication → Sign In / Providers → Google** → Enable → tempel kedua
   nilai itu → Save.
5. Selesai. Tombol "Lanjut dengan Google" di halaman Akun langsung berfungsi.

Yang dijaga: pencocokan akun hanya lewat identitas Google (`auth_uid`) — nomor HP atau
email yang diketik TIDAK pernah bisa dipakai mengambil alih akun member lain. Kalau nomor
yang dimasukkan sudah terdaftar dengan PIN, Google ditolak dan tamu diminta masuk dengan
PIN dulu lalu menautkan Google dari halaman Akun.
