> **LAMPIRAN TEKNIS — bukan dokumen keputusan.**
> Jika isi berkas ini bertentangan dengan `PRD-SPL-BOOKING.md`, **PRD master yang menang.**
> Registri Keputusan Kanonik (§4) dan Konstanta Global (§5) di PRD master mengesampingkan angka apa pun di sini.

## 3. SPESIFIKASI FUNGSIONAL — PEMESANAN MAKANAN & MINUMAN (SMOKEHOUSE RESTO)

### 3.0 Ruang Lingkup dan Prinsip Desain

Modul F&B adalah **modul terbesar kedua setelah booking**, dan secara operasional justru yang paling sering gagal di lapangan. Kegagalannya jarang teknis — biasanya karena order online tidak sampai ke dapur, atau karena satu pelanggan menghasilkan tiga catatan pembayaran terpisah yang tidak pernah bertemu di laporan.

Empat prinsip yang mengunci seluruh seksi ini:

| ID | Prinsip | Konsekuensi Desain |
|---|---|---|
| FB-P1 | **Satu tab per sesi meja.** Semua item — sesi biliar, F&B pra-pesan, F&B saat main, F&B pesan ke waiter — masuk ke satu `order` yang sama, diidentifikasi `session_id`. | Model data: `orders` 1—N `order_items`, dan `orders` 1—N `payments`. **Bukan** satu kolom `payment_method` di `orders`. |
| FB-P2 | **Dapur tidak boleh mengandalkan teriakan.** Setiap item F&B yang dibayar atau dikonfirmasi harus muncul di layar dapur/bar secara otomatis. | KDS (Kitchen Display System) naik dari Fase 2 ke **MVP** — lihat justifikasi di §3.6.1. |
| FB-P3 | **Harga dan pajak di-snapshot saat transaksi.** Admin mengubah harga besok tidak boleh mengubah nilai order kemarin. | `order_items.unit_price_locked`, `order_items.tax_rate_locked`, `orders.tax_rate_snapshot`. |
| FB-P4 | **Stok F&B tidak dijamin real-time di MVP.** Sistem hanya mengenal dua kondisi: `available` dan `sold_out` (toggle manual staf), plus opsional `stock_qty` untuk item terbatas. | Tidak ada inventory management di MVP (itu Fase 3, `EX-11`). Konsekuensinya: **wajib** ada kebijakan penanganan item habis setelah dibayar — lihat §3.8. |

**Batas modul.** Seksi ini **tidak** mencakup: manajemen stok bahan baku, resep/BOM, purchasing, dan integrasi tapping box Bapenda. Semua itu ada di seksi Roadmap.

---

### 3.1 Tiga Mode Pemesanan

Ketiga mode ini bukan tiga fitur terpisah — ketiganya menulis ke **struktur data yang sama** (`orders` + `order_items`) dan berakhir di **KDS yang sama**. Yang berbeda hanya titik masuk, waktu pembayaran, dan cara pesanan diikat ke meja.

#### 3.1.1 Tabel Pembanding Tiga Mode

| Aspek | **Mode A — F&B saat booking online** | **Mode B — Scan QR di meja** | **Mode C — Takeaway / Pickup** |
|---|---|---|---|
| **Kode mode** | `PREORDER` | `DINE_IN_QR` | `TAKEAWAY` |
| **Perlu booking meja?** | Ya, F&B menempel pada booking | Tidak. Meja bisa hasil booking **atau** walk-in | Tidak. Tidak ada meja sama sekali |
| **Perlu login?** | Ya (sudah login untuk booking) | **Tidak wajib** — guest checkout dengan nomor WA | Ya (butuh identitas untuk pickup) |
| **Titik masuk** | Langkah 4 alur booking (`UX-11`, cross-sell sebelum bayar) | Scan QR statis yang ditempel di meja → `spl.app/t/M-03` | Menu utama app → "Pesan Bawa Pulang" |
| **Waktu pembayaran** | **Prepaid penuh**, satu QRIS bersama sesi meja | **Dua opsi** (lihat §3.1.3): bayar langsung QRIS, atau masuk open bill dibayar saat tutup tab | **Prepaid penuh** QRIS |
| **Kapan tiket masuk KDS** | Dijadwalkan — lihat §3.5 (default: T-10 menit dari jam sesi) | **Langsung** saat `settlement` (prepaid) atau saat konfirmasi kasir (open bill) | Langsung saat `settlement` |
| **Identitas meja** | `orders.table_id` dari booking | `orders.table_id` dari kode QR meja | `NULL` |
| **Nomor pesanan ke pelanggan** | `booking_code` (`SPL-260823-0042`) | Nomor tab meja (`M-03 #7`) | **Nomor antrean pickup** (`TA-047`) |
| **Cara diserahkan** | Diantar runner ke meja | Diantar runner ke meja | Dipanggil / notif WA, diambil di counter |
| **Bisa tambah item lagi?** | Ya, jadi open bill setelah check-in | Ya, order berikutnya masuk tab yang sama | Tidak. Order baru = tiket baru |
| **Prioritas** | **MUST** | **SHOULD** (MVP jika sempat, Fase 2 jika tidak) | **COULD** (Fase 2) |

**Catatan prioritas.** Hanya **Mode A yang MUST untuk MVP** — ini yang diminta pemilik secara eksplisit (requirement #5) dan ini titik konversi tertinggi. Mode B adalah *revenue multiplier* terbesar tetapi menambah permukaan kompleksitas (guest session, QR per meja, open bill). Mode C paling kecil nilainya untuk venue biliar dan sengaja diletakkan paling akhir.

---

#### 3.1.2 Mode A — F&B Ditambahkan Saat Booking Online (`PREORDER`)

**Alur lengkap:**

```
1. Pelanggan pilih tanggal → jam → meja → durasi          (Seksi 2, alur booking)
2. Layar "Sekalian pesan?" muncul SEBELUM ringkasan       (UX-11)
   ├─ Katalog menu tampil dengan foto + harga
   ├─ Pelanggan pilih item, varian, add-on, catatan
   └─ Pilih waktu saji: "Saat saya datang" / jam spesifik  (§3.5)
3. Layar Ringkasan Pesanan                                 (UX-08)
   ├─ Subtotal sesi meja
   ├─ Subtotal F&B
   ├─ PBJT (dua tarif terpisah — lihat §3.4)
   ├─ Service charge (jika diaktifkan)
   ├─ Diskon/voucher
   └─ TOTAL — satu angka
4. SATU transaksi QRIS untuk semuanya                      (PAY-01)
5. Webhook settlement → booking confirmed + order confirmed
6. Tiket F&B DIJADWALKAN, belum masuk KDS                  (§3.5)
7. T-10 menit dari jam sesi → tiket muncul di KDS
8. Pelanggan datang, check-in QR                           (OPS-08)
9. Runner mengantar ke meja
```

**Keputusan penting — satu `order_id` Midtrans, bukan dua.** Sesi meja dan F&B dibayar dalam **satu transaksi QRIS**. Alasannya bukan efisiensi teknis, melainkan konversi: dua kali scan QRIS = dua kali kesempatan pelanggan berubah pikiran, dan dua kali risiko pembayaran parsial (sesi terbayar, F&B tidak) yang menciptakan state setengah jadi yang menyakitkan untuk direkonsiliasi.

> **Peringatan regulasi — jangan pecah transaksi.** Menggabungkan sesi Rp 120.000 + F&B Rp 145.000 = Rp 265.000 dalam satu QRIS berarti transaksi melewati batas Rp 100.000 dan (setelah 1 Okt 2026, jika SPL diklasifikasikan UKE) kena MDR 0,7%. **Jangan** membangun fitur yang otomatis memecah tagihan menjadi dua transaksi ≤Rp 100.000 untuk menghindari MDR — itu *transaction splitting* yang dilarang aturan acquirer dan berisiko penonaktifan merchant. Mode A digabung; pemisahan alami hanya terjadi antara Mode A (bayar saat reservasi) dan order tambahan saat sesi berjalan (bayar terpisah) — yang memang alur bisnis natural, bukan rekayasa.

**Edge case yang harus ditangani:**

| Kondisi | Perilaku sistem |
|---|---|
| Pembayaran expired/gagal | **Seluruh** order batal — booking DAN F&B. Tidak ada state "sesi terbayar tapi F&B tidak". |
| Pelanggan batal booking > 24 jam | F&B ikut dibatalkan, masuk kebijakan refund/store credit yang sama (`RFD-06`) |
| Pelanggan no-show | Tiket F&B yang **belum diproses** (`BARU`) → auto-cancel. Tiket yang sudah `DIPROSES`/`SIAP` → **tidak refund** (bahan sudah terpakai). Ini harus tertulis di halaman checkout. |
| Item jadi sold-out sebelum jam sesi | Lihat §3.8 — notifikasi proaktif + pilihan ganti/kredit |

---

#### 3.1.3 Mode B — Scan QR di Meja (`DINE_IN_QR`)

Mode ini menjawab kenyataan lapangan: **mayoritas pelanggan biliar adalah walk-in**, dan mereka memesan makanan *setelah* mulai main, bukan sebelum datang.

**Alur:**

```
1. Setiap meja punya STIKER QR PERMANEN (bukan dinamis)
   URL: https://spl.app/t/{table_code}?k={secret}
2. Pelanggan scan → halaman menu terbuka
3. Sistem resolve konteks meja:
   ├─ Ada sesi aktif di meja itu? → item masuk ke tab sesi tsb
   └─ Tidak ada sesi aktif?       → lihat "Guard Rail" di bawah
4. Pelanggan pilih item → keranjang
5. Checkout, dua opsi (dikonfigurasi admin):
   ├─ [B1] BAYAR LANGSUNG: QRIS per order. Tiket ke KDS setelah settlement.
   └─ [B2] OPEN BILL: item masuk tab, dibayar saat tutup tab di kasir.
6. Runner mengantar
```

**Guard rail keamanan — ini yang paling sering bocor pada implementasi QR meja:**

| ID | Requirement | Alasan |
|---|---|---|
| `FB-31` | URL QR meja **wajib** memuat token rahasia per meja (`?k=<random 16 char>`), bukan sekadar nomor meja yang bisa ditebak | Tanpa ini, siapa pun bisa mengetik `spl.app/t/M-05` dari rumah dan menambah item ke tab orang lain |
| `FB-32` | Token per meja dapat **di-rotate** oleh admin satu klik (mencetak ulang stiker) | Jika foto QR tersebar di media sosial |
| `FB-33` | **Mode B2 (open bill) hanya aktif jika ada sesi aktif di meja itu.** Tanpa sesi aktif, hanya B1 (bayar langsung) yang tersedia | Mencegah orang menumpuk tagihan di meja kosong |
| `FB-34` | Guest checkout: cukup **nama panggilan + nomor WA**, tanpa login. OTP WA tidak diwajibkan di MVP | Friksi login adalah pembunuh konversi terbesar untuk order di tempat |
| `FB-35` | Batas nilai open bill tanpa pembayaran (default **Rp 500.000**, konfigurabel). Melewati batas → kasir mendapat alert dan wajib meminta pembayaran sebagian | Batasi eksposur *dine-and-dash* |
| `FB-36` | Untuk sesi hasil **booking online**, order dari QR meja otomatis terikat ke `user_id` pemilik booking | Riwayat pelanggan tetap utuh |

**[PERLU KONFIRMASI]** Apakah pemilik mengizinkan open bill (B2) sama sekali? Open bill adalah kenyamanan besar untuk pelanggan tapi membuka risiko kabur tanpa bayar. Alternatif konservatif: **semua order QR meja wajib bayar di muka (B1 saja)** di 3 bulan pertama, lalu buka B2 setelah terlihat pola pelanggan.

---

#### 3.1.4 Mode C — Takeaway / Pickup (`TAKEAWAY`)

**Alur:**

```
1. Pelanggan buka app → "Pesan Bawa Pulang"
2. Pilih item (menu difilter: item yang ditandai takeaway_available)
3. Pilih waktu ambil: "Secepatnya (±25 menit)" atau jam spesifik
4. Bayar QRIS penuh di muka
5. Sistem terbitkan NOMOR ANTREAN PICKUP (TA-047)
6. Tiket masuk KDS pada waktu = jam ambil − prep_time_minutes
7. Status SIAP → notifikasi ke pelanggan (wa.me deep link / email)
8. Pelanggan datang ke counter, sebut nomor, staf tandai DIANTAR → SELESAI
```

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-40` | Flag `takeaway_available` per item menu. Mocktail dengan es dan item plating kompleks bisa dimatikan | **SHOULD** |
| `FB-41` | Prepaid penuh wajib. Tidak ada opsi bayar saat ambil | **SHOULD** |
| `FB-42` | Nomor antrean pickup berbeda namespace dari nomor meja (`TA-xxx` vs `M-xx #n`) | **SHOULD** |
| `FB-43` | Kebijakan tidak diambil: **tanpa refund** setelah 60 menit dari waktu ambil, makanan dibuang. Wajib tertulis di checkout | **SHOULD** |
| `FB-44` | **Tidak ada delivery** di roadmap manapun. Delivery = ongkir, kurir, zona, SLA — bisnis yang sama sekali berbeda | **WON'T** |

---

### 3.2 Struktur Katalog Menu

#### 3.2.1 Hierarki dan Model Data

```
menu_categories (Grill & Smoke, Sides, Burger & Sandwich, Kopi, Mocktail, ...)
  └── menu_items (Smoked Beef Ribs)
        ├── menu_option_groups (Tingkat Pedas, Ukuran Porsi, Pilihan Saus)
        │     └── menu_options (Original / Medium / Extra Hot ...)
        └── menu_addons (Extra Cheese, Extra Sauce, Upsize Fries)
```

**Perbedaan `option_group` vs `addon` — ini bukan detail kosmetik:**

| | **Option Group** | **Add-on** |
|---|---|---|
| Sifat | **Pilihan wajib/eksklusif** dari satu dimensi | **Tambahan opsional**, bisa banyak |
| Contoh | Tingkat pedas: pilih **tepat satu** | Extra cheese, extra sauce, upsize |
| Efek harga | Bisa `+0` atau `price_delta` | Selalu `price_delta > 0` |
| Kalau tidak dipilih | Item **tidak bisa** masuk keranjang (jika `is_required`) | Item tetap bisa dipesan |
| Efek ke dapur | **Muncul di tiket sebagai modifier wajib** | Muncul sebagai baris tambahan |

Memisahkan keduanya mencegah bug klasik: pelanggan memesan wings tanpa memilih level pedas, dapur menebak, pelanggan komplain.

#### 3.2.2 Requirement Katalog

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-01` | Katalog berjenjang: kategori → item → option group → option; plus add-on per item. Kategori punya `sort_order` dan bisa dinonaktifkan tanpa dihapus | **MUST** |
| `FB-02` | Setiap item punya: `name`, `description` (maks 200 karakter), `photo_url`, `base_price` (integer Rupiah), `prep_time_minutes`, `station` (`kitchen`/`bar`), `tax_category`, `is_active`, `sort_order` | **MUST** |
| `FB-03` | Foto item **disajikan dari Cloudflare Pages/R2, bukan Supabase Storage** — melindungi kuota egress 5 GB/bulan. Format WebP, maks 200 KB, rasio 4:3, lazy-load | **MUST** |
| `FB-04` | Item tanpa foto tetap boleh tayang, memakai placeholder ber-brand (siluet rak biliar amber di atas near-black) — bukan kotak abu-abu kosong | **MUST** |
| `FB-05` | **Toggle SOLD OUT satu ketuk** di panel staf: daftar item, satu switch per item, berlaku < 3 detik ke semua device via Realtime broadcast | **MUST** |
| `FB-06` | Sold-out punya **dua mode**: `sold_out_today` (auto-reset pukul 02:00 WIB saat tutup) dan `sold_out_indefinite` (manual reset). Default: `sold_out_today` | **MUST** |
| `FB-07` | Item sold-out **tetap tampil di menu** dengan overlay redup + label "Habis Hari Ini" + tombol nonaktif. **Jangan disembunyikan** — pelanggan yang mencari item favoritnya dan tidak menemukannya akan mengira menu berubah | **MUST** |
| `FB-08` | Item dengan stok terbatas: kolom `stock_qty` (nullable). `NULL` = tidak dilacak. Jika terisi, setiap order mengurangi qty; mencapai 0 → otomatis `sold_out_today` | **SHOULD** |
| `FB-09` | Saat `stock_qty` ≤ 3, tampilkan badge "Sisa 3 porsi" — urgensi jujur, bukan urgensi palsu. Jangan pernah tampilkan angka sisa yang dikarang | **SHOULD** |
| `FB-10` | Pengurangan `stock_qty` terjadi pada **`settlement`** (bukan saat masuk keranjang), dilakukan atomik: `UPDATE menu_items SET stock_qty = stock_qty - $1 WHERE id = $2 AND stock_qty >= $1` — nol baris ter-update berarti stok habis | **SHOULD** |
| `FB-11` | Option group punya: `is_required` (bool), `min_select`, `max_select`. Contoh: Tingkat Pedas `is_required=true, min=1, max=1`; Pilihan Saus `is_required=false, min=0, max=2` | **MUST** |
| `FB-12` | Option dan add-on punya `price_delta` (integer, boleh 0, boleh negatif untuk "tanpa keju −Rp 3.000") dan flag `is_available` sendiri — saus habis tidak boleh mematikan seluruh item | **MUST** |
| `FB-13` | Catatan bebas per item, maks 120 karakter ("tanpa bawang", "saus dipisah"). Ditampilkan **mencolok** di tiket dapur, bukan sebagai teks kecil | **MUST** |
| `FB-14` | Admin bisa mengubah harga item kapan saja. Perubahan **tidak retroaktif** — `unit_price_locked` di `order_items` sudah menyimpan harga saat transaksi (`FB-P3`) | **MUST** |
| `FB-15` | Jadwal ketersediaan per item: `available_from`/`available_until` (jam) dan `available_days` (array hari). Contoh: menu sarapan hanya 11.00–15.00 | **COULD** (Fase 2) |
| `FB-16` | Menu bundling/paket (`PKG-DUO`: 2 jam happy hour + 2 soft drink) sebagai tipe item khusus yang meng-expand menjadi beberapa `order_items` | **COULD** (Fase 2) |
| `FB-17` | Multi-bahasa (ID/EN) untuk nama & deskripsi item | **WON'T** (MVP) |

#### 3.2.3 Contoh Data Awal Menu — **CONTOH, WAJIB DIGANTI PEMILIK**

**[PERLU KONFIRMASI]** Seluruh isi tabel di bawah adalah **contoh seed data** untuk keperluan pengembangan dan pengujian, bukan menu SPL yang sebenarnya. Harga di-anchor ke kisaran sports bar kelas menengah Indonesia. Pemilik wajib mengganti nama item, deskripsi, harga, dan waktu masak dengan data riil sebelum go-live.

**Kategori:**

| Kode | Nama Kategori | Station | Urutan |
|---|---|---|---|
| `GRILL` | Grill & Smoke | kitchen | 1 |
| `BITES` | Bites & Sharing | kitchen | 2 |
| `BURGER` | Burger & Sandwich | kitchen | 3 |
| `RICE` | Nasi & Mie | kitchen | 4 |
| `SIDES` | Sides | kitchen | 5 |
| `COFFEE` | Kopi & Teh | bar | 6 |
| `MOCKTAIL` | Mocktail & Soda | bar | 7 |
| `BEER` | Bir & Cider **[PERLU KONFIRMASI]** | bar | 8 |

> **[PERLU KONFIRMASI — DAMPAK PAJAK BESAR]** Kategori `BEER` sengaja ditandai. Menjual minuman beralkohol berpotensi membuat Bapenda mengklasifikasikan SPL sebagai **"bar" → PBJT 40%**, bukan 10%. Sebelum kategori ini diaktifkan, konfirmasikan ke konsultan pajak. Jika venue menjual alkohol, `tax_category` untuk kategori ini kemungkinan berbeda dari F&B biasa — dan sistem sudah menyediakan `tax_category` per item justru untuk kasus ini.

**Item (contoh seed):**

| Kode | Nama | Kategori | Harga | Prep | Station | `tax_category` | Catatan |
|---|---|---|---|---|---|---|---|
| `FB-RIBS-HALF` | Smoked Beef Ribs (½ rack) | GRILL | Rp 128.000 | 18 mnt | kitchen | `fnb` | Signature |
| `FB-RIBS-FULL` | Smoked Beef Ribs (full rack) | GRILL | Rp 235.000 | 22 mnt | kitchen | `fnb` | Sharing 3–4 org |
| `FB-BRISKET` | Sliced Beef Brisket 150 gr | GRILL | Rp 115.000 | 15 mnt | kitchen | `fnb` | `stock_qty` dilacak |
| `FB-PORK-N/A` | — | — | — | — | — | — | **[PERLU KONFIRMASI]** halal/non-halal |
| `FB-WINGS-6` | Smoked Wings (6 pcs) | BITES | Rp 62.000 | 12 mnt | kitchen | `fnb` | Punya level pedas |
| `FB-WINGS-12` | Smoked Wings (12 pcs) | BITES | Rp 110.000 | 15 mnt | kitchen | `fnb` | |
| `FB-NACHOS` | Loaded Nachos | BITES | Rp 68.000 | 10 mnt | kitchen | `fnb` | Sharing |
| `FB-PLATTER` | Smokehouse Platter | BITES | Rp 285.000 | 25 mnt | kitchen | `fnb` | Ribs + wings + brisket + sides |
| `FB-BURGER-BEEF` | Smokehouse Beef Burger | BURGER | Rp 78.000 | 14 mnt | kitchen | `fnb` | |
| `FB-BURGER-CHIC` | Crispy Chicken Burger | BURGER | Rp 68.000 | 12 mnt | kitchen | `fnb` | |
| `FB-NASGOR` | Nasi Goreng Smokehouse | RICE | Rp 55.000 | 12 mnt | kitchen | `fnb` | |
| `FB-MIEGOR` | Mie Goreng Spesial | RICE | Rp 52.000 | 12 mnt | kitchen | `fnb` | |
| `FB-FRIES` | Truffle Fries | SIDES | Rp 42.000 | 8 mnt | kitchen | `fnb` | |
| `FB-ONIONRING` | Onion Rings | SIDES | Rp 38.000 | 8 mnt | kitchen | `fnb` | |
| `FB-COLESLAW` | Coleslaw | SIDES | Rp 25.000 | 3 mnt | kitchen | `fnb` | |
| `FB-AMERICANO` | Iced Americano | COFFEE | Rp 28.000 | 4 mnt | bar | `fnb` | |
| `FB-LATTE` | Iced Latte | COFFEE | Rp 34.000 | 5 mnt | bar | `fnb` | |
| `FB-LEMONTEA` | Lemon Tea | COFFEE | Rp 25.000 | 3 mnt | bar | `fnb` | |
| `FB-MOJITO` | Virgin Mojito | MOCKTAIL | Rp 45.000 | 5 mnt | bar | `fnb` | Non-alkohol |
| `FB-BERRY` | Berry Smash | MOCKTAIL | Rp 48.000 | 5 mnt | bar | `fnb` | |
| `FB-SODA` | Soft Drink (kaleng) | MOCKTAIL | Rp 18.000 | 1 mnt | bar | `fnb` | |
| `FB-WATER` | Air Mineral 600 ml | MOCKTAIL | Rp 12.000 | 1 mnt | bar | `fnb` | |

**Option group (contoh):**

| Item | Option Group | Wajib? | Min/Max | Opsi (`price_delta`) |
|---|---|---|---|---|
| `FB-WINGS-6`, `FB-WINGS-12` | Tingkat Pedas | Ya | 1/1 | Original (0), Smoky BBQ (0), Medium Hot (0), Extra Hot (0), Honey Garlic (+Rp 5.000) |
| `FB-BURGER-BEEF` | Tingkat Kematangan | Ya | 1/1 | Medium (0), Medium Well (0), Well Done (0) |
| `FB-RIBS-HALF`, `FB-RIBS-FULL` | Pilihan Saus | Tidak | 0/2 | House BBQ (0), Carolina Mustard (0), Spicy Chipotle (0) |
| `FB-AMERICANO`, `FB-LATTE` | Suhu | Ya | 1/1 | Iced (0), Hot (0) |
| `FB-AMERICANO`, `FB-LATTE` | Level Gula | Ya | 1/1 | Normal (0), Less Sugar (0), No Sugar (0) |
| `FB-NASGOR`, `FB-MIEGOR` | Tingkat Pedas | Ya | 1/1 | Tidak Pedas (0), Sedang (0), Pedas (0), Extra Pedas (0) |

**Add-on (contoh):**

| Add-on | Berlaku untuk | `price_delta` |
|---|---|---|
| Extra Cheese | Burger, Nachos, Fries | +Rp 12.000 |
| Extra BBQ Sauce | Grill, Bites | +Rp 8.000 |
| Upsize Fries | Burger | +Rp 15.000 |
| Telur Mata Sapi | Rice | +Rp 10.000 |
| Extra Shot Espresso | Coffee | +Rp 8.000 |
| Tanpa Bawang | Semua kitchen | Rp 0 |

---

### 3.3 Keranjang Gabungan (Unified Cart)

#### 3.3.1 Konsep

Satu keranjang aktif per pengguna, dapat berisi **maksimal satu sesi meja** + **N item F&B**. Ini mengikuti guard rail Ayo (`UX-13`): pelanggan tidak boleh punya dua keranjang booking bersamaan.

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-20` | Satu keranjang aktif per user. Memulai booking baru saat keranjang berisi booking lain → dialog konfirmasi "Booking sebelumnya akan dihapus" | **MUST** |
| `FB-21` | Keranjang boleh berisi F&B **tanpa** sesi meja (Mode B & C). Tidak boleh berisi **dua** sesi meja | **MUST** |
| `FB-22` | Keranjang bertahan di `localStorage` + disinkronkan ke DB saat login, agar tidak hilang jika app tertutup | **SHOULD** |
| `FB-23` | Saat keranjang di-*checkout*, sistem **memvalidasi ulang** harga, ketersediaan slot, dan status sold-out semua item. Ada perubahan → tampilkan diff dan minta konfirmasi ulang. **Jangan pernah** langsung charge dengan harga lama | **MUST** |
| `FB-24` | Keranjang kedaluwarsa setelah **60 menit** tanpa aktivitas (slot meja belum di-*hold* pada tahap ini — hold baru terjadi saat menekan "Bayar") | **SHOULD** |
| `FB-25` | Sticky bottom bar menampilkan jumlah item + total berjalan, selalu terlihat (`UX-07`) | **MUST** |

**Kapan slot meja di-hold?** Bukan saat item masuk keranjang. Hold (`bookings.status='hold'`, 10 menit) baru dibuat saat pelanggan menekan **"Bayar"** di halaman Ringkasan Pesanan. Ini disengaja: menahan slot selama pelanggan menelusuri menu selama 20 menit akan menyandera meja prime tanpa komitmen apa pun.

#### 3.3.2 Urutan Perhitungan Total — **URUTANNYA MENGIKAT**

Urutan ini bukan preferensi; salah urutan menghasilkan angka yang berbeda dan laporan pajak yang salah.

```
LANGKAH 1  Subtotal Sesi Meja
           = SUM(booking_items.price_locked)
           Dihitung dari rate card sesuai time-band (§ Seksi 2)

LANGKAH 2  Subtotal F&B
           = SUM per item:
               (unit_price_locked
                + SUM(option.price_delta)
                + SUM(addon.price_delta)
               ) × quantity

LANGKAH 3  Subtotal Sebelum Diskon
           = Langkah 1 + Langkah 2

LANGKAH 4  Diskon / Voucher                      ← SEBELUM pajak & service
           Diterapkan pada basis yang sesuai scope voucher:
             scope='fnb'      → hanya subtotal F&B
             scope='table'    → hanya subtotal sesi
             scope='all'      → keseluruhan
           Hasilnya: diskon_meja, diskon_fnb (dipisah, wajib)

LANGKAH 5  Service Charge (jika diaktifkan)      ← SEBELUM pajak
           = (Subtotal F&B − diskon_fnb) × service_charge_rate
           HANYA atas F&B, TIDAK atas sewa meja
           [PERLU KONFIRMASI] apakah SPL memungut service charge sama sekali

LANGKAH 6  Dasar Pengenaan Pajak (DPP), dipisah dua:
           DPP_fnb  = (Subtotal F&B − diskon_fnb) + Service Charge
           DPP_meja = (Subtotal Sesi − diskon_meja)

LANGKAH 7  PBJT, dihitung TERPISAH per kategori:
           PBJT_fnb  = ROUND(DPP_fnb  × tax_rate_fnb)
           PBJT_meja = ROUND(DPP_meja × tax_rate_billiard)
           Dibulatkan ke Rupiah penuh, di level total per kategori,
           BUKAN per item (mengurangi akumulasi error pembulatan) — TAX-04

LANGKAH 8  Biaya Admin Payment Gateway
           = Rp 0. TIDAK PERNAH ADA BARIS INI.
           MDR diserap ke margin — PAY-01, aturan Bank Indonesia

LANGKAH 9  TOTAL DIBAYAR PELANGGAN
           = DPP_fnb + DPP_meja + PBJT_fnb + PBJT_meja

LANGKAH 10 (Pencatatan internal, TIDAK ditampilkan ke pelanggan)
           MDR         = ROUND(TOTAL × mdr_rate)
           NET_DITERIMA = TOTAL − PBJT_total − MDR
```

**Tiga aturan yang tidak boleh dilanggar:**

| ID | Aturan | Alasan |
|---|---|---|
| `FB-26` | **PBJT dihitung terpisah untuk F&B dan sewa meja** dengan tarif masing-masing (`tax_rate_fnb`, `tax_rate_billiard`), keduanya konfigurasi database dengan `effective_from` — bukan konstanta di kode (`TAX-01`) | Perda bisa menetapkan tarif berbeda; kategori hiburan berpotensi 10% atau 40% |
| `FB-27` | **Service charge hanya atas F&B**, tidak atas sewa meja, dan **masuk DPP PBJT** (dasar pengenaan PBJT F&B termasuk service charge) | Ketentuan PBJT: dasar pengenaan = jumlah yang dibayar ke restoran, termasuk service charge |
| `FB-28` | **Tidak ada baris "biaya admin"/"biaya QRIS"** di manapun di UI, struk, atau email. MDR diserap ke harga | Bank Indonesia melarang MDR dibebankan ke konsumen (`PAY-01`) |

**Keputusan tampilan harga — tax-inclusive vs exclusive.**

**[PERLU KONFIRMASI]** Rekomendasi kuat: **harga menu ditayangkan TAX-EXCLUSIVE, dengan PBJT sebagai baris terpisah yang jelas di ringkasan**, mengikuti konvensi restoran Indonesia yang sudah dipahami pelanggan ("harga belum termasuk pajak 10%"). Alasan memilih ini alih-alih tax-inclusive: (a) pelanggan Indonesia sudah terbiasa dengan pola ini di semua restoran, (b) mempermudah rekonsiliasi SPTPD karena DPP terlihat langsung, (c) jika tarif Perda berubah, harga menu tidak perlu dicetak ulang. **Kompensasi wajib:** disclaimer "Harga belum termasuk PBJT 10%" harus tampil **di header katalog menu**, bukan hanya di kaki halaman — pelanggan tidak boleh terkejut di layar bayar.

Jika pemilik memilih tax-inclusive, sistem tetap mendukung: flag `venue_settings.price_display_mode ∈ {inclusive, exclusive}`, dan seluruh perhitungan dibalik (DPP = harga_tayang ÷ (1 + tarif)).

#### 3.3.3 Contoh Perhitungan Nyata — Angka Rupiah

**Skenario:** Sabtu 29 Agustus 2026. Budi memesan Meja 3 (standard) untuk 20.00–22.00 (2 jam, tarif `PRIME-WE` **ASUMSI** Rp 70.000/jam), plus F&B pra-pesan.

**ASUMSI parameter:** `tax_rate_fnb` = 10%, `tax_rate_billiard` = 10%, `service_charge_rate` = 0% (tidak dipungut), `mdr_rate` = 0,7%, mode tampilan = **tax-exclusive**.

**Isi keranjang:**

| # | Item | Rincian | Qty | Harga satuan | Subtotal |
|---|---|---|---|---|---|
| 1 | Sesi Meja 3 | 20.00–22.00, `PRIME-WE` @Rp 70.000/jam | 2 jam | Rp 70.000 | **Rp 140.000** |
| 2 | Smoked Beef Ribs (½ rack) | + House BBQ (Rp 0) | 1 | Rp 128.000 | Rp 128.000 |
| 3 | Smoked Wings (6 pcs) | Medium Hot (Rp 0) | 1 | Rp 62.000 | Rp 62.000 |
| 4 | Truffle Fries | + Extra Cheese (+Rp 12.000) | 1 | Rp 54.000 | Rp 54.000 |
| 5 | Iced Americano | Iced, Less Sugar | 2 | Rp 28.000 | Rp 56.000 |
| 6 | Air Mineral 600 ml | — | 2 | Rp 12.000 | Rp 24.000 |

**Perhitungan langkah demi langkah:**

| Langkah | Uraian | Perhitungan | Nilai |
|---|---|---|---|
| 1 | Subtotal Sesi Meja | 2 × Rp 70.000 | **Rp 140.000** |
| 2 | Subtotal F&B | 128.000 + 62.000 + 54.000 + 56.000 + 24.000 | **Rp 324.000** |
| 3 | Subtotal sebelum diskon | 140.000 + 324.000 | Rp 464.000 |
| 4 | Voucher `WELCOME10` (10% F&B, maks Rp 25.000) | 10% × 324.000 = 32.400 → **di-cap** 25.000 | diskon_fnb = **−Rp 25.000**<br>diskon_meja = Rp 0 |
| 5 | Service charge (0%) | — | **Rp 0** |
| 6a | DPP F&B | 324.000 − 25.000 + 0 | **Rp 299.000** |
| 6b | DPP Sesi Meja | 140.000 − 0 | **Rp 140.000** |
| 7a | PBJT F&B (10%) | ROUND(299.000 × 0,10) | **Rp 29.900** |
| 7b | PBJT Hiburan (10%) | ROUND(140.000 × 0,10) | **Rp 14.000** |
| 8 | Biaya admin gateway | — | **Rp 0** |
| 9 | **TOTAL DIBAYAR** | 299.000 + 140.000 + 29.900 + 14.000 | **Rp 482.900** |

**Tampilan di layar Ringkasan Pesanan (persis seperti ini):**

```
┌─────────────────────────────────────────────────┐
│  RINGKASAN PESANAN                              │
│  Sab, 29 Agu 2026 · 20.00–22.00 · Meja 3        │
├─────────────────────────────────────────────────┤
│  SESI BILIAR                                    │
│  Meja 3 · 2 jam (Prime Weekend)      Rp 140.000 │
├─────────────────────────────────────────────────┤
│  MAKANAN & MINUMAN                              │
│  Smoked Beef Ribs ½ rack             Rp 128.000 │
│    └ House BBQ Sauce                            │
│  Smoked Wings 6 pcs                   Rp 62.000 │
│    └ Medium Hot                                 │
│  Truffle Fries                        Rp 54.000 │
│    └ + Extra Cheese                             │
│  Iced Americano  × 2                  Rp 56.000 │
│    └ Iced · Less Sugar                          │
│  Air Mineral 600ml × 2                Rp 24.000 │
│                                                 │
│  Disajikan: saat saya datang (20.00)            │
├─────────────────────────────────────────────────┤
│  Subtotal sesi meja                  Rp 140.000 │
│  Subtotal F&B                        Rp 324.000 │
│  Voucher WELCOME10                   − Rp 25.000│
│  PBJT F&B (10%)                       Rp 29.900 │
│  PBJT Hiburan (10%)                   Rp 14.000 │
├─────────────────────────────────────────────────┤
│  TOTAL                               Rp 482.900 │
├─────────────────────────────────────────────────┤
│  Batal >24 jam: kredit toko 100%                │
│  Batal <6 jam: tanpa refund                     │
│                                                 │
│         [  BAYAR DENGAN QRIS  ]                 │
└─────────────────────────────────────────────────┘
```

**Pencatatan internal (tidak pernah terlihat pelanggan):**

| Komponen | Nilai |
|---|---|
| Gross (dibayar pelanggan) | Rp 482.900 |
| PBJT disetor ke Pemda | Rp 43.900 |
| MDR Midtrans (**ASUMSI** 0,7%, kategori UKE) | Rp 3.380 |
| **Net masuk rekening venue** | **Rp 435.620** (90,2% dari gross) |

> Jika SPL diklasifikasikan **UMi**, MDR untuk transaksi ≤Rp 500.000 adalah **Rp 0**, sehingga net menjadi **Rp 439.000**. Selisih Rp 3.380 per transaksi ini yang, dikalikan volume, menjadi ±Rp 12,4 juta/tahun. Lihat catatan klasifikasi merchant di seksi Pembayaran.

**Contoh kedua — Mode B, order kecil saat main (tanpa sesi meja di keranjang):**

| Item | Qty | Harga | Subtotal |
|---|---|---|---|
| Smoked Wings 6 pcs (Extra Hot) | 1 | Rp 62.000 | Rp 62.000 |
| Lemon Tea | 2 | Rp 25.000 | Rp 50.000 |
| **Subtotal F&B** | | | **Rp 112.000** |
| **PBJT F&B 10%** | | | **Rp 11.200** |
| **TOTAL** | | | **Rp 123.200** |

MDR (**ASUMSI** UKE 0,7%) = Rp 862. Net = Rp 111.138.

---

### 3.4 Snapshot Pajak dan Harga

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-29` | `order_items` menyimpan: `unit_price_locked`, `option_price_delta_locked`, `addon_price_delta_locked`, `tax_category_locked`, `tax_rate_locked`. Laporan **tidak boleh** join ke tabel harga master | **MUST** |
| `FB-30` | `orders` menyimpan snapshot agregat: `subtotal_table`, `subtotal_fnb`, `discount_table`, `discount_fnb`, `service_charge`, `dpp_fnb`, `dpp_table`, `tax_fnb`, `tax_table`, `total_amount`, `mdr_fee`, `net_amount`. Semua `integer` Rupiah penuh — **tidak pernah `float`** | **MUST** |

---

### 3.5 Penjadwalan Waktu Saji

Ini fitur kecil yang berdampak besar: tanpa penjadwalan, ribs yang dipesan pukul 14.00 untuk sesi pukul 20.00 akan mendarat di dapur pukul 14.00 dan dingin sebelum pelanggan datang.

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-50` | Pelanggan memilih `serve_mode` per **order** (bukan per item) di layar checkout: `ON_ARRIVAL` (default) atau `SCHEDULED` | **MUST** |
| `FB-51` | `ON_ARRIVAL`: `serve_at` = `booking.starts_at`. Tiket masuk KDS pada `serve_at − max(prep_time_minutes seluruh item) − 5 menit buffer` | **MUST** |
| `FB-52` | `SCHEDULED`: pelanggan memilih jam dari dropdown kelipatan 15 menit, dibatasi **dalam rentang sesi booking**. Booking 20.00–22.00 → pilihan 20.00 s/d 21.30 (minimal 30 menit sebelum sesi berakhir) | **MUST** |
| `FB-53` | Sistem memvalidasi `serve_at` tidak melewati jam tutup dapur (**ASUMSI** 01.00 WIB, konfigurabel — dapur tutup lebih awal dari venue) | **MUST** |
| `FB-54` | **Fire time dihitung mundur dari prep_time terlama, bukan dijumlahkan.** Ribs (18 mnt) + Americano (4 mnt) → fire time = serve_at − 18 − 5 = serve_at − 23 menit. Item bar dengan prep pendek difire belakangan agar tidak basi | **MUST** |
| `FB-55` | Tiket bar dan tiket dapur punya **fire time berbeda** untuk order yang sama, dihitung dari `prep_time` masing-masing station. Minuman tidak boleh menunggu 20 menit di counter | **MUST** |
| `FB-56` | Pelanggan bisa mengubah `serve_at` **hingga fire time**, lewat halaman "Booking Saya". Setelah tiket masuk KDS (`BARU` → `DIPROSES`), tidak bisa diubah sendiri — harus lewat staf | **SHOULD** |
| `FB-57` | Layar checkout menampilkan estimasi jujur: "Perkiraan siap 20.23" — dihitung dari fire time + prep_time, bukan angka bulat yang dikarang | **SHOULD** |
| `FB-58` | Jika pelanggan **check-in lebih awal** dari `serve_at` di mode `ON_ARRIVAL`, staf mendapat tombol "Fire sekarang" di layar kasir | **SHOULD** |
| `FB-59` | Jika pelanggan **belum check-in** pada `serve_at` (mode `ON_ARRIVAL`), tiket **tetap difire** sesuai jadwal — makanan sudah dibayar, dan menahannya membuat pelanggan yang datang telat 10 menit harus menunggu 20 menit lagi. **[PERLU KONFIRMASI]** apakah pemilik lebih memilih menahan tiket sampai check-in (menghemat bahan pada no-show, tapi memperlambat pelanggan yang telat sedikit) | **MUST** |

---

### 3.6 Alur Dapur & Bar (Kitchen Display System)

#### 3.6.1 Kenapa KDS Naik ke MVP

Riset operasional menempatkan KDS di Fase 2, dengan catatan "**MVP kalau volume F&B online diharapkan tinggi sejak awal**" (`EX-09`). Untuk SPL kondisi itu terpenuhi: requirement #5 pemilik menempatkan pemesanan F&B sebagai fitur inti setara booking, dan Mode A (cross-sell saat booking) adalah titik konversi tertinggi yang dirancang di `UX-11`.

Tanpa KDS, satu-satunya jalur order online ke dapur adalah kasir membaca layar lalu berteriak — yang berarti: order hilang saat kasir sibuk, tidak ada jejak waktu, tidak ada cara mengukur apakah dapur telat, dan tidak ada cara membuktikan siapa yang salah saat pelanggan komplain. **KDS bukan kemewahan; ia adalah satu-satunya mekanisme yang membuat Mode A benar-benar berfungsi.**

Namun ruang lingkupnya dijaga ketat: KDS MVP adalah **satu halaman web** yang menampilkan kartu tiket dan tombol status. Bukan aplikasi terpisah, bukan hardware khusus. Dijalankan di tablet murah atau layar TV dengan browser, memakai PWA yang sama dengan layar kasir.

#### 3.6.2 Struktur Tiket

Satu `order` dapat menghasilkan **beberapa tiket** — satu per station.

```
order (SPL-260829-0042)
  ├── kitchen_ticket  #K-118   fire 19.37   [Ribs, Wings, Fries]
  └── bar_ticket      #B-241   fire 19.55   [Americano ×2, Air Mineral ×2]
```

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-60` | Tiket dipecah otomatis per `station` (`kitchen` / `bar`) berdasarkan atribut item. Satu order = 1–2 tiket | **MUST** |
| `FB-61` | Setiap tiket memuat: nomor tiket, nomor meja / nomor pickup, waktu fire, waktu target saji, daftar item + qty + **semua modifier** + catatan pelanggan, mode order (`PREORDER`/`DINE_IN_QR`/`TAKEAWAY`), dan penanda apakah order sudah dibayar | **MUST** |
| `FB-62` | Modifier dan catatan pelanggan ditampilkan dengan **kontras tinggi**, bukan teks kecil abu-abu. Catatan alergi/pantangan ditandai khusus (border amber tebal) | **MUST** |
| `FB-63` | **Penanda urgensi berbasis waktu**: kartu berubah warna saat mendekati/melewati target saji — normal (netral), amber (T-5 menit), merah + kedip halus (lewat target). Warna mengikuti palet SPL, bukan warna default framework | **MUST** |
| `FB-64` | Item yang **belum dibayar** (open bill Mode B2) diberi badge "BELUM BAYAR" agar dapur tahu konteksnya, tetapi tetap diproses | **SHOULD** |

#### 3.6.3 Status Tiket — State Machine

Status berlaku **di level tiket** (per station), bukan per order. Satu order bisa punya tiket dapur `SIAP` sementara tiket bar masih `DIPROSES`.

| Status | Arti | Siapa yang mengubah | Transisi berikutnya |
|---|---|---|---|
| `BARU` | Tiket sudah difire, muncul di KDS, belum disentuh | Sistem (otomatis pada fire time) | `DIPROSES`, `DIBATALKAN` |
| `DIPROSES` | Koki/bartender mulai mengerjakan | Staf station (tap kartu) | `SIAP`, `DIBATALKAN` |
| `SIAP` | Selesai dimasak, menunggu diambil runner | Staf station | `DIANTAR`, `DIBATALKAN` |
| `DIANTAR` | Runner membawa ke meja / diserahkan di counter | Runner / kasir | `SELESAI` |
| `SELESAI` | Dikonfirmasi sampai. Tiket keluar dari layar aktif | Runner / otomatis 10 menit setelah `DIANTAR` | — (terminal) |
| `DIBATALKAN` | Dibatalkan dengan alasan wajib | Staf (butuh alasan) | — (terminal) |

```
                  fire time
                      │
                      ▼
   ┌──────┐  tap  ┌──────────┐  tap  ┌──────┐  tap  ┌─────────┐  tap/auto  ┌─────────┐
   │ BARU │ ────► │ DIPROSES │ ────► │ SIAP │ ────► │ DIANTAR │ ─────────► │ SELESAI │
   └───┬──┘       └────┬─────┘       └───┬──┘       └─────────┘            └─────────┘
       │               │                 │
       └───────────────┴─────────────────┘
                       ▼
                ┌─────────────┐
                │ DIBATALKAN  │  (wajib alasan, tercatat di audit log AD-09)
                └─────────────┘
```

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-65` | Enam status persis seperti di atas. Perubahan status hanya maju satu langkah; mundur satu langkah diizinkan **hanya** dengan alasan dan tercatat di audit log (koki salah tap) | **MUST** |
| `FB-66` | Setiap transisi mencatat `timestamp` + `staff_id`. Ini yang memungkinkan laporan waktu masak rata-rata dan investigasi komplain | **MUST** |
| `FB-67` | **Tombol besar, minimal 64×64 px**, jarak antar tombol minimal 16 px. Layar KDS dioperasikan dengan tangan berminyak sambil terburu-buru | **MUST** |
| `FB-68` | **Undo 10 detik** setelah setiap perubahan status, tanpa perlu alasan. Setelah 10 detik, mundur butuh alasan | **MUST** |
| `FB-69` | Notifikasi suara + getar visual saat tiket baru masuk. Volume dan on/off dapat diatur per station | **MUST** |
| `FB-70` | Tiket `SELESAI` hilang dari layar aktif tetapi dapat dilihat di tab "Riwayat Hari Ini" | **MUST** |
| `FB-71` | Pembatalan tiket **wajib mengisi alasan** dari daftar pilihan (`bahan habis`, `salah input`, `permintaan pelanggan`, `lainnya`) + catatan bebas. Masuk laporan Aktivitas Sensitif (`AD-10`) | **MUST** |
| `FB-72` | Item dapat dibatalkan **per baris**, tidak harus seluruh tiket. Membatalkan satu item dari tiket 5 item tidak boleh membatalkan empat lainnya | **MUST** |
| `FB-73` | Status tiket disiarkan ke pelanggan lewat Realtime: "Pesananmu sedang dimasak" → "Pesananmu siap diantar". Ini mengurangi pertanyaan ke waiter secara drastis | **SHOULD** |

#### 3.6.4 Tata Letak Layar KDS

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-74` | Tiga kolom: **BARU** \| **DIPROSES** \| **SIAP**. Tiket `DIANTAR`/`SELESAI` keluar dari grid. Kartu diurutkan berdasarkan **target saji terdekat**, bukan waktu masuk | **MUST** |
| `FB-75` | Filter station: layar dapur hanya menampilkan tiket `kitchen`, layar bar hanya `bar`. Satu venue bisa memakai satu layar dengan toggle jika ruang terbatas | **MUST** |
| `FB-76` | **Mode offline (PWA).** Jika internet putus, KDS tetap menampilkan tiket yang sudah ter-cache dan menerima perubahan status ke antrean lokal (IndexedDB), disinkronkan saat online kembali. Indikator koneksi jujur di header (`OPS-22`) | **MUST** |
| `FB-77` | **Tombol cetak tiket fisik** (opsional, jika printer thermal tersedia) sebagai backup saat layar bermasalah | **COULD** (Fase 2) |
| `FB-78` | Ringkasan atas layar: jumlah tiket aktif, tiket terlambat, waktu masak rata-rata hari ini | **SHOULD** |
| `FB-79` | **Layar Runner terpisah** (atau tab): hanya menampilkan tiket `SIAP`, diurutkan berdasarkan nomor meja, dengan tombol besar `DIANTAR` | **SHOULD** |

---

### 3.7 Order Tambahan Saat Sesi Berjalan (Open Bill)

Ini alur yang paling sering dipakai dalam praktik: pelanggan sudah main satu jam, lapar, pesan lagi.

#### 3.7.1 Konsep Tab Meja

Satu **sesi meja** memiliki satu **tab** (`order` dengan `is_open_bill = true`). Semua order tambahan selama sesi masuk ke tab yang sama sebagai `order_batch` baru.

```
Sesi Meja 3 (20.00–22.00)  ── tab #T-0042
   ├── batch #1  20.00  PREORDER    Ribs, Wings, Fries, Americano ×2  [LUNAS, prepaid]
   ├── batch #2  20.48  DINE_IN_QR  Nachos, Lemon Tea ×2              [OPEN]
   ├── batch #3  21.15  DINE_IN_QR  Soft Drink ×3                     [OPEN]
   └── batch #4  21.30  EXTEND      Perpanjang sesi 1 jam             [OPEN]
```

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-80` | Satu sesi meja = satu tab. Order tambahan masuk sebagai batch baru dalam tab yang sama, dengan `batch_seq` berurutan | **MUST** |
| `FB-81` | Setiap batch punya status pembayaran sendiri: `PAID_UPFRONT` atau `UNPAID_OPEN`. Tab menampilkan **"Sudah dibayar Rp X · Belum dibayar Rp Y"** (`FB-03` riset) | **MUST** |
| `FB-82` | Order tambahan dapat masuk dari **tiga titik**: (a) scan QR meja oleh pelanggan, (b) diinput kasir, (c) diinput waiter di tablet. Ketiganya menulis ke tab yang sama | **MUST** |
| `FB-83` | Perpanjangan sesi (`OPS-12`–`OPS-16`) masuk sebagai batch di tab yang sama, bukan sebagai booking terpisah — sehingga total belanja per meja tetap satu angka | **MUST** |
| `FB-84` | Item pada batch `UNPAID_OPEN` **tetap difire ke dapur** setelah dikonfirmasi (oleh kasir atau otomatis jika sesi berasal dari booking terverifikasi). Menahan makanan sampai bayar akan membunuh pengalaman | **MUST** |
| `FB-85` | Batas eksposur open bill (`FB-35`): default Rp 500.000. Melewati batas → alert ke kasir, batch berikutnya wajib prepaid sampai tab dikurangi | **MUST** |

#### 3.7.2 Penutupan Tab

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-86` | Tab ditutup oleh kasir. Layar penutupan menampilkan: seluruh batch, total tab, **yang sudah dibayar**, dan **sisa tagihan** | **MUST** |
| `FB-87` | Sisa tagihan dapat dibayar dengan **kombinasi metode**: QRIS in-app, QRIS statis kasir, tunai, EDC debit/kredit, store credit. Setiap pembayaran menghasilkan record `payments` terpisah dengan `channel` masing-masing (`FB-02` riset) | **MUST** |
| `FB-88` | **Pelanggan dapat menutup tab sendiri lewat app** dengan QRIS, tanpa antre di kasir. Kasir mendapat notifikasi tab lunas. Ini menghilangkan antrean penutupan di jam ramai | **SHOULD** |
| `FB-89` | Penutupan tab **wajib menghasilkan struk bernomor urut tanpa gap** (`TAX-06`, `TAX-08`), memuat: nama & alamat usaha, NPWPD, nomor struk, tanggal-waktu, rincian item seluruh batch, subtotal per kategori, PBJT terpisah + persentase, total, rincian metode bayar, ID kasir | **MUST** |
| `FB-90` | Tab yang belum ditutup pada akhir shift muncul di **shift report** sebagai item yang harus diselesaikan. Tab tidak boleh menggantung melewati pergantian hari operasional (02.00 WIB) | **MUST** |
| `FB-91` | **Rekonsiliasi kas wajib** saat tutup shift: cash fisik di laci vs cash tercatat sistem, selisih wajib dijelaskan (`EX-12`) | **MUST** |
| `FB-92` | Split bill antar pemain di satu meja | **WON'T** (MVP) — Fase 3 (`FB-06` riset) |

#### 3.7.3 Perhitungan Pajak pada Tab Multi-Batch

Pajak dihitung **per batch pada saat batch dikonfirmasi**, memakai `tax_rate` yang berlaku saat itu, lalu dijumlahkan di tingkat tab. Tidak dihitung ulang saat penutupan.

Alasannya: jika tarif Perda berubah pada tengah malam (kasus langka tapi nyata saat pergantian tahun), batch sebelum dan sesudah perubahan harus memakai tarif masing-masing. Menghitung ulang seluruh tab saat penutupan akan salah.

**Contoh tab multi-batch:**

| Batch | Item | Subtotal | PBJT 10% | Total batch | Status |
|---|---|---|---|---|---|
| #1 (prepaid) | Sesi 2 jam + F&B pra-pesan | Rp 439.000 | Rp 43.900 | Rp 482.900 | **LUNAS** (QRIS online) |
| #2 | Nachos + Lemon Tea ×2 | Rp 118.000 | Rp 11.800 | Rp 129.800 | OPEN |
| #3 | Soft Drink ×3 | Rp 54.000 | Rp 5.400 | Rp 59.400 | OPEN |
| #4 | Perpanjang sesi 1 jam @Rp 70.000 | Rp 70.000 | Rp 7.000 | Rp 77.000 | OPEN |
| **TOTAL TAB** | | **Rp 681.000** | **Rp 68.100** | **Rp 749.100** | |
| **Sudah dibayar** | | | | **Rp 482.900** | |
| **SISA TAGIHAN** | | | | **Rp 266.200** | |

Layar kasir menampilkan persis angka ini. Pelanggan membayar Rp 266.200 dengan metode pilihannya; struk memuat seluruh empat batch.

---

### 3.8 Penanganan Item Habis Setelah Dibayar

Ini skenario yang **pasti terjadi** dan paling merusak kepercayaan jika ditangani buruk: pelanggan membayar Rp 128.000 untuk ribs pukul 14.00, datang pukul 20.00, ribs habis.

#### 3.8.1 Pencegahan Lebih Dulu

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-100` | Item dengan `stock_qty` dilacak: kuota **dikurangi saat `settlement`**, bukan saat masuk keranjang. Order pra-pesan Mode A **menahan** kuota sejak dibayar — jadi ribs yang sudah dibayar untuk pukul 20.00 tidak bisa dijual habis oleh walk-in pukul 18.00 | **MUST** |
| `FB-101` | Panel staf menampilkan **"Terjual + Terpesan (belum disajikan)"** per item, bukan hanya terjual. Kepala dapur harus melihat 6 rack ribs sudah terikat untuk malam ini sebelum memutuskan menerima order ke-7 | **MUST** |
| `FB-102` | Saat staf menandai item `sold_out`, sistem **langsung menampilkan daftar order pra-pesan terdampak** yang belum difire, dengan tombol aksi per order | **MUST** |

#### 3.8.2 Alur Penanganan

```
Staf toggle SOLD OUT pada FB-RIBS-HALF
         │
         ▼
Sistem query: order PREORDER berisi item ini, status tiket = BARU, belum difire
         │
         ├─ Tidak ada → selesai, item hilang dari menu
         │
         └─ Ada 3 order terdampak
                  │
                  ▼
         Panel "Order Terdampak" muncul di layar staf
         Per order, staf memilih satu aksi:
         ┌──────────────────────────────────────────────┐
         │ [1] Hubungi pelanggan & tawarkan pengganti   │  ← default
         │ [2] Ganti otomatis dengan item setara        │
         │ [3] Batalkan item → store credit             │
         │ [4] Batalkan item → refund uang              │
         └──────────────────────────────────────────────┘
                  │
                  ▼
         Notifikasi terkirim ke pelanggan (in-app + email + wa.me)
```

| ID | Requirement | Prioritas |
|---|---|---|
| `FB-103` | **Notifikasi proaktif, bukan reaktif.** Pelanggan diberitahu segera saat item ditandai habis — bukan saat ia tiba di meja. Waktu adalah mata uang di sini: pelanggan yang tahu 3 jam sebelumnya masih punya pilihan | **MUST** |
| `FB-104` | **Kebijakan default: STORE CREDIT senilai 110% harga item** (`RFD-06`, `PAY-15`). Ribs Rp 128.000 → kredit Rp 140.800, berlaku 90 hari. Ini lebih baik untuk bisnis (uang tetap di venue, mendorong kunjungan ulang) **dan** lebih baik untuk pelanggan (kompensasi di atas nilai) | **MUST** |
| `FB-105` | **Ganti item setara** dengan selisih harga: item pengganti lebih murah → selisih jadi store credit; lebih mahal → pelanggan membayar selisih saat datang. Tidak pernah ada refund tunai untuk selisih kecil | **MUST** |
| `FB-106` | Admin dapat mendefinisikan **daftar substitusi** per item (`FB-RIBS-HALF` → `FB-BRISKET`, `FB-WINGS-12`) agar penawaran pengganti relevan, bukan acak | **SHOULD** |
| `FB-107` | **Refund uang hanya dengan approval manual admin** lewat Dashboard Midtrans MAP, dicatat manual di sistem (`RFD-07`, `PAY-14`). Tidak ada refund otomatis via API di MVP | **MUST** |
| `FB-108` | **Peringatan jendela refund:** pembayaran QRIS OFF-US (e-wallet selain GoPay) hanya bisa direfund dalam **7 hari** (`RFD-04`). Sistem menampilkan sisa hari refund pada layar admin, dan menandai merah saat < 2 hari | **MUST** |
| `FB-109` | Jika item habis saat tiket **sudah `DIPROSES`** (bahan sudah terpakai/rusak): staf membatalkan item dengan alasan `bahan habis`, sistem otomatis menerbitkan store credit 110%. Tidak menunggu keputusan pelanggan | **MUST** |
| `FB-110` | Store credit disimpan sebagai saldo di `profiles.store_credit_balance` (integer Rupiah) dengan tabel `store_credit_ledger` append-only: `+` saat diterbitkan, `−` saat dipakai. **Tidak pernah `UPDATE` saldo langsung tanpa baris ledger** | **MUST** |
| `FB-111` | Store credit dapat dipakai di langkah 4 perhitungan (diskon), berlaku untuk sesi meja **dan** F&B, tidak dapat diuangkan | **MUST** |
| `FB-112` | Setiap penerbitan store credit karena item habis tercatat di laporan **Aktivitas Sensitif** (`AD-10`) — pemilik harus bisa melihat pola "ribs habis 12 kali bulan ini" yang berarti masalah forecasting, bukan masalah pelanggan | **MUST** |

#### 3.8.3 Matriks Keputusan Cepat untuk Staf

| Kondisi | Aksi default sistem | Kompensasi |
|---|---|---|
| Habis, tiket belum difire, pelanggan belum datang, > 2 jam sebelum sesi | Notifikasi + tawaran ganti | Ganti setara, atau credit 110% |
| Habis, tiket belum difire, < 2 jam sebelum sesi | Notifikasi + tawaran ganti + telepon staf | Credit 110% |
| Habis, pelanggan sudah di meja | Waiter menawarkan langsung | Ganti setara + 1 minuman gratis |
| Habis saat tiket sudah `DIPROSES` | Batalkan item, terbitkan credit otomatis | Credit 110% |
| Habis pada order **takeaway** yang sudah dibayar | Telepon sebelum waktu ambil | Ganti setara atau credit 110% |
| Habis berulang (item sama ≥ 3× seminggu) | Alert ke pemilik di dashboard | — (masalah operasional, bukan kompensasi) |

---

### 3.9 Ringkasan Prioritas MoSCoW

| Prioritas | Requirement |
|---|---|
| **MUST (MVP)** | FB-01, FB-02, FB-03, FB-04, FB-05, FB-06, FB-07, FB-11, FB-12, FB-13, FB-14, FB-20, FB-21, FB-23, FB-25, FB-26, FB-27, FB-28, FB-29, FB-30, FB-50, FB-51, FB-52, FB-53, FB-54, FB-55, FB-59, FB-60, FB-61, FB-62, FB-63, FB-65, FB-66, FB-67, FB-68, FB-69, FB-70, FB-71, FB-72, FB-74, FB-75, FB-76, FB-80, FB-81, FB-82, FB-83, FB-84, FB-85, FB-86, FB-87, FB-89, FB-90, FB-91, FB-100, FB-101, FB-102, FB-103, FB-104, FB-105, FB-107, FB-108, FB-109, FB-110, FB-111, FB-112 |
| **SHOULD** | FB-08, FB-09, FB-10, FB-22, FB-24, FB-31, FB-32, FB-33, FB-34, FB-35, FB-36, FB-40, FB-41, FB-42, FB-43, FB-56, FB-57, FB-58, FB-64, FB-73, FB-78, FB-79, FB-88, FB-106 |
| **COULD (Fase 2)** | FB-15, FB-16, FB-77 |
| **WON'T (MVP)** | FB-17, FB-44, FB-92 |

**Catatan scope.** Mode B (`FB-31`–`FB-36`) ditandai SHOULD, bukan MUST. Jika waktu pengembangan menipis, MVP dapat dirilis dengan **Mode A saja + input order oleh kasir/waiter** — pelanggan memesan lewat waiter, waiter menginput di tablet, tiket tetap masuk KDS. Nilai operasional KDS tetap penuh; yang hilang hanya kenyamanan self-order. Mode B kemudian ditambahkan tanpa mengubah struktur data apa pun, karena `orders`/`order_items`/tiket sudah dirancang mode-agnostic.

---

### 3.10 Acceptance Criteria (Given/When/Then)

#### AC-FB-01 — Keranjang gabungan menghitung total dengan urutan yang benar (`FB-26`, `FB-27`, `FB-28`)

```gherkin
Given pelanggan sudah login dan memilih Meja 3 untuk Sabtu 29 Agu 2026, 20.00–22.00
  And tarif PRIME-WE adalah Rp 70.000/jam
  And keranjang berisi F&B senilai Rp 324.000
  And voucher WELCOME10 aktif (10% F&B, cap Rp 25.000)
  And tax_rate_fnb = 10% dan tax_rate_billiard = 10%
  And service_charge_rate = 0%
When pelanggan membuka halaman Ringkasan Pesanan
Then subtotal sesi meja ditampilkan Rp 140.000
  And subtotal F&B ditampilkan Rp 324.000
  And diskon voucher ditampilkan −Rp 25.000 dan hanya mengurangi basis F&B
  And PBJT F&B ditampilkan Rp 29.900 dihitung dari DPP Rp 299.000
  And PBJT Hiburan ditampilkan Rp 14.000 dihitung dari DPP Rp 140.000
  And TOTAL ditampilkan Rp 482.900
  And TIDAK ADA baris bernama "biaya admin", "biaya QRIS", atau sejenisnya
  And seluruh nilai disimpan sebagai integer Rupiah penuh tanpa desimal
```

#### AC-FB-02 — Toggle sold-out menyebar cepat dan tidak menyembunyikan item (`FB-05`, `FB-07`)

```gherkin
Given item FB-RIBS-HALF berstatus available
  And ada 4 device pelanggan sedang membuka katalog menu
When staf menekan toggle SOLD OUT pada FB-RIBS-HALF di panel staf
Then dalam waktu kurang dari 3 detik keempat device menampilkan item tersebut
     dengan overlay redup, label "Habis Hari Ini", dan tombol tambah nonaktif
  And item TIDAK hilang dari daftar menu
  And item tidak dapat ditambahkan ke keranjang manapun
  And pada pukul 02.00 WIB status otomatis kembali available (mode sold_out_today)
  And perubahan tercatat di audit log dengan staff_id dan timestamp
```

#### AC-FB-03 — Item sold-out setelah dibayar memicu kompensasi otomatis (`FB-102`, `FB-103`, `FB-104`)

```gherkin
Given Budi telah membayar lunas order PREORDER berisi 1× FB-RIBS-HALF (Rp 128.000)
  And sesi Budi dijadwalkan pukul 20.00 hari ini
  And tiket dapur untuk order tersebut masih berstatus BARU dan belum difire
  And sekarang pukul 17.00
When staf menandai FB-RIBS-HALF sebagai SOLD OUT
Then panel "Order Terdampak" menampilkan order Budi dengan empat pilihan aksi
  And Budi menerima notifikasi in-app dalam waktu kurang dari 30 detik
  And notifikasi memuat nama item, alasan, dan pilihan pengganti dari daftar substitusi
When staf memilih "Batalkan item → store credit"
Then item FB-RIBS-HALF dihapus dari tiket dapur tanpa membatalkan item lain pada tiket yang sama
  And store credit senilai Rp 140.800 (110%) diterbitkan ke akun Budi
  And satu baris positif tercatat di store_credit_ledger dengan referensi order dan alasan
  And saldo profiles.store_credit_balance bertambah Rp 140.800
  And kejadian ini muncul di laporan Aktivitas Sensitif hari itu
  And sisa item pada order Budi tetap terjadwal dan tidak berubah
```

#### AC-FB-04 — Tiket dipecah per station dengan fire time berbeda (`FB-54`, `FB-55`, `FB-60`)

```gherkin
Given order PREORDER berisi:
      1× Smoked Beef Ribs (prep 18 menit, station kitchen)
      1× Truffle Fries (prep 8 menit, station kitchen)
      2× Iced Americano (prep 4 menit, station bar)
  And serve_mode = ON_ARRIVAL dengan booking.starts_at = 20.00
  And buffer sistem = 5 menit
When sistem menjadwalkan tiket
Then terbentuk tepat 2 tiket: satu kitchen dan satu bar
  And tiket kitchen memiliki fire time 19.37 (20.00 − 18 menit − 5 menit buffer)
  And tiket bar memiliki fire time 19.51 (20.00 − 4 menit − 5 menit buffer)
  And prep_time TIDAK dijumlahkan; yang dipakai adalah prep_time terlama per station
When jam menunjukkan 19.37
Then tiket kitchen muncul di kolom BARU pada layar KDS dapur dengan notifikasi suara
  And tiket bar BELUM muncul di layar KDS bar
When jam menunjukkan 19.51
Then tiket bar muncul di kolom BARU pada layar KDS bar
```

#### AC-FB-05 — State machine tiket hanya bergerak maju, mundur butuh alasan (`FB-65`, `FB-66`, `FB-68`, `FB-72`)

```gherkin
Given tiket dapur #K-118 berstatus BARU berisi 3 baris item
When koki menekan kartu tiket sekali
Then status berubah menjadi DIPROSES
  And tercatat timestamp dan staff_id koki tersebut
  And tombol "Undo" muncul selama 10 detik
When koki menekan "Undo" dalam 8 detik
Then status kembali ke BARU tanpa meminta alasan
  And kedua transisi tetap tercatat di audit log
When koki menekan kartu lagi sehingga status DIPROSES, lalu menunggu 15 detik
  And koki mencoba mengembalikan status ke BARU
Then sistem meminta alasan wajib sebelum mengizinkan perubahan
  And perubahan mundur tercatat di laporan Aktivitas Sensitif
When koki membatalkan satu baris item dari tiket dengan alasan "bahan habis"
Then hanya baris item tersebut yang berstatus DIBATALKAN
  And dua baris item lain pada tiket yang sama tetap aktif
  And tiket tidak keluar dari layar KDS
```

#### AC-FB-06 — Open bill menggabungkan semua batch dalam satu tab dan satu struk (`FB-80`, `FB-81`, `FB-86`, `FB-87`, `FB-89`)

```gherkin
Given sesi Meja 3 aktif dengan tab #T-0042
  And batch #1 (prepaid QRIS online) senilai Rp 482.900 berstatus PAID_UPFRONT
  And batch #2 (scan QR meja) senilai Rp 129.800 berstatus UNPAID_OPEN
  And batch #3 (input kasir) senilai Rp 59.400 berstatus UNPAID_OPEN
  And batch #4 (perpanjang sesi 1 jam) senilai Rp 77.000 berstatus UNPAID_OPEN
When kasir membuka layar penutupan tab
Then layar menampilkan keempat batch secara terpisah dengan waktu dan sumbernya
  And total tab ditampilkan Rp 749.100
  And "Sudah dibayar" ditampilkan Rp 482.900
  And "Sisa tagihan" ditampilkan Rp 266.200
When pelanggan membayar Rp 150.000 tunai dan Rp 116.200 dengan QRIS statis kasir
Then terbentuk 2 record payments terpisah dengan channel 'cash' dan 'qris_static_kasir'
  And tab berubah status menjadi CLOSED
  And struk tercetak dengan nomor urut berikutnya tanpa gap
  And struk memuat NPWPD, rincian seluruh 4 batch, PBJT sebagai baris terpisah beserta persentase,
      total, rincian kedua metode pembayaran, dan ID kasir
  And laporan keuangan mencatat omzet terpisah per channel dan per kategori (meja vs F&B)
```

#### AC-FB-07 — Validasi ulang keranjang sebelum charge mencegah harga basi (`FB-23`)

```gherkin
Given keranjang pelanggan berisi 1× Smoked Wings 6 pcs dengan harga tersimpan Rp 62.000
  And keranjang sudah terbuka selama 25 menit
  And admin telah mengubah harga item tersebut menjadi Rp 68.000
  And slot Meja 3 pukul 20.00 telah diambil pelanggan lain
When pelanggan menekan tombol "Bayar"
Then sistem memvalidasi ulang harga, ketersediaan slot, dan status sold-out seluruh item
  And sistem TIDAK membuat hold booking dan TIDAK memanggil Midtrans Charge API
  And pelanggan melihat layar perubahan yang memuat:
      "Slot 20.00 Meja 3 baru saja diambil" beserta 3 saran slot terdekat
      "Harga Smoked Wings berubah dari Rp 62.000 menjadi Rp 68.000"
  And pelanggan harus menekan "Lanjutkan dengan perubahan ini" sebelum charge dijalankan
When pelanggan menyetujui dan memilih slot pengganti
Then hold booking dibuat dengan harga terbaru yang di-snapshot ke price_locked
  And barulah Midtrans Charge API dipanggil, di luar transaksi database pembuatan hold
```

#### AC-FB-08 — Order QR meja tanpa token valid ditolak (`FB-31`, `FB-33`)

```gherkin
Given meja M-05 memiliki token QR rahasia aktif
When seseorang mengakses URL https://spl.app/t/M-05 tanpa parameter token
Then sistem menampilkan halaman menu READ-ONLY tanpa kemampuan memesan
  And tidak ada keranjang yang dapat dibuat untuk meja tersebut
When seseorang mengakses URL dengan token yang salah
Then sistem menolak dengan pesan netral "Silakan scan ulang QR di meja Anda"
  And percobaan tercatat di log keamanan
When pelanggan memindai QR asli di meja M-05 yang TIDAK memiliki sesi aktif
Then hanya opsi pembayaran langsung (B1) yang tersedia
  And opsi open bill (B2) tidak ditampilkan
When pelanggan memindai QR asli di meja M-05 yang MEMILIKI sesi aktif
Then item yang dipesan masuk ke tab sesi tersebut
  And kedua opsi pembayaran tersedia sesuai konfigurasi admin
```

---

### 3.11 Daftar Konfirmasi Pemilik untuk Seksi Ini

| # | Pertanyaan | Dampak jika salah |
|---|---|---|
| 1 | **[PERLU KONFIRMASI]** Menu riil: nama item, harga, waktu masak, kategori, station | Seluruh seed data §3.2.3 adalah contoh; harga produksi salah akan merusak laporan sejak hari pertama |
| 2 | **[PERLU KONFIRMASI]** Apakah venue menjual **alkohol**? | Menentukan risiko klasifikasi PBJT 40% vs 10% — dampak finansial terbesar di seluruh PRD |
| 3 | **[PERLU KONFIRMASI]** Harga menu tayang **tax-inclusive atau exclusive**? | Mengubah seluruh tampilan harga dan arah perhitungan DPP |
| 4 | **[PERLU KONFIRMASI]** Apakah SPL memungut **service charge**? Berapa persen? | Masuk DPP PBJT; mempengaruhi total dan pembagian tip staf |
| 5 | **[PERLU KONFIRMASI]** Apakah **open bill (B2)** diizinkan, atau semua order QR meja wajib prepaid? | Menentukan eksposur risiko dine-and-dash dan kompleksitas MVP |
| 6 | **[PERLU KONFIRMASI]** Batas nilai open bill sebelum wajib bayar (default Rp 500.000) | Eksposur kerugian per meja |
| 7 | **[PERLU KONFIRMASI]** Jam tutup **dapur** (berbeda dari jam tutup venue) | Validasi `serve_at` dan fire time tiket terakhir |
| 8 | **[PERLU KONFIRMASI]** Mode `ON_ARRIVAL`: fire tiket sesuai jadwal walau pelanggan belum check-in, atau tunggu check-in? (`FB-59`) | Trade-off antara bahan terbuang pada no-show vs pelanggan telat menunggu lama |
| 9 | **[PERLU KONFIRMASI]** Nilai kompensasi store credit untuk item habis (usulan 110%) dan masa berlakunya (usulan 90 hari) | Beban kompensasi vs kepuasan pelanggan |
| 10 | **[PERLU KONFIRMASI]** Menu **halal / non-halal** — mempengaruhi item smokehouse (pork) dan segmentasi pasar | Salah asumsi di seed data dapat menyinggung pelanggan |
| 11 | **[PERLU KONFIRMASI]** Apakah ada **runner terpisah** dari kasir, atau kasir merangkap mengantar? | Menentukan apakah `FB-79` (layar runner) perlu dibangun |
| 12 | **[PERLU KONFIRMASI]** Item mana yang **stoknya perlu dilacak** (`stock_qty`) — brisket dan ribs biasanya, minuman kaleng biasanya tidak | Beban input harian staf vs akurasi ketersediaan |