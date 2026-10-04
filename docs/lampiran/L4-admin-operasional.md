> **LAMPIRAN TEKNIS — bukan dokumen keputusan.**
> Jika isi berkas ini bertentangan dengan `PRD-SPL-BOOKING.md`, **PRD master yang menang.**
> Registri Keputusan Kanonik (§4) dan Konstanta Global (§5) di PRD master mengesampingkan angka apa pun di sini.

## 4. Panel Admin & Operasional

Seksi ini mendefinisikan sisi internal aplikasi: apa yang dilihat staf, apa yang boleh mereka ubah, dan bagaimana sistem mencegah kebocoran uang. Prioritas memakai MoSCoW: **M** (Must — wajib ada di MVP, produk tidak bisa rilis tanpanya), **S** (Should — sangat diinginkan di MVP, boleh geser ke rilis 1.1 kalau waktu mepet), **C** (Could — Fase 2), **W** (Won't now — Fase 3, dicatat agar tidak lupa dan agar struktur data disiapkan).

Prinsip yang mengikat seluruh seksi ini, diturunkan dari riset:

1. **Satu inventaris tunggal.** Walk-in wajib masuk tabel `bookings` yang sama dengan booking online. Kalau kasir mencatat di kertas, exclusion constraint tidak melihatnya dan sistem online akan menjual meja yang sedang dipakai tamu offline. Ini risiko bisnis terbesar dari seluruh desain, dan solusinya separuh SOP, separuh produk.
2. **Semua uang masuk sistem, apa pun channel-nya.** Cash dan EDC dicatat sebagai `payments` dengan `channel` berbeda, bukan dibiarkan di luar. Dashboard yang hanya menampilkan omzet online akan menyesatkan pemilik sejak hari pertama.
3. **Tidak ada akun bersama.** Satu orang satu akun. "Login kasir" yang dipakai lima orang membuat audit log tidak berguna, dan audit log yang tidak berguna adalah undangan terbuka untuk kecurangan internal.
4. **Kasir tidak melihat uang total, tidak menyentuh harga.** Ini bukan soal kepercayaan personal, ini soal desain kontrol internal.

---

### 4.1 Model Peran & Hak Akses (RBAC)

#### 4.1.1 Definisi peran

| Kode | Peran | Siapa | Perangkat khas | Jumlah akun khas |
|---|---|---|---|---|
| `owner` | **OWNER** | Pemilik venue | HP pribadi + laptop | 1–2 |
| `manager` | **MANAJER** | Manajer operasional / supervisor shift | Tablet + laptop kantor | 1–3 |
| `cashier` | **KASIR** | Staf kasir per shift | Tablet/PC kasir di counter | 3–8 |
| `kitchen` | **DAPUR/BAR** | Koki, bartender | Tablet dinding dapur & bar | 2–4 |
| `floor` | **STAF MEJA** (opsional) | Waiter / runner | HP pribadi (PWA) | 0–6 |

**[PERLU KONFIRMASI]** Berapa jumlah staf per peran di SPL? Ini menentukan apakah `is_staff()` berbasis query tabel (cukup untuk <20 akun) atau perlu dipindah ke JWT custom claim.

**[PERLU KONFIRMASI]** Apakah peran STAF MEJA akan dipakai sejak awal? Kalau venue kecil dan kasir merangkap runner, peran ini bisa dilewati di MVP — tapi kolom `role` tetap harus menerima nilainya sejak awal agar tidak perlu migrasi.

Implementasi enum peran (memperluas `profiles.role` dari Seksi Arsitektur Data):

```sql
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('customer','floor','kitchen','cashier','manager','owner'));
```

Urutan hierarki: `customer` < `floor` < `kitchen` < `cashier` < `manager` < `owner`. Tetapi **hierarki ini tidak murni menaik** — dapur melihat tiket order yang tidak dilihat kasir, dan kasir melihat uang yang tidak dilihat dapur. Karena itu izin didefinisikan per-kapabilitas, bukan per-level.

#### 4.1.2 Matriks hak akses

Notasi: **✓** = penuh · **R** = read-only · **±** = terbatas, lihat catatan · **✗** = tidak ada akses (menu tidak ditampilkan sama sekali, bukan sekadar tombol disabled)

**A. Operasional harian**

| Kapabilitas | OWNER | MANAJER | KASIR | DAPUR/BAR | STAF MEJA |
|---|---|---|---|---|---|
| Lihat papan meja live | ✓ | ✓ | ✓ | R | R |
| Buka sesi walk-in | ✓ | ✓ | ✓ | ✗ | ✗ |
| Check-in booking (scan QR) | ✓ | ✓ | ✓ | ✗ | ± (scan saja) |
| Perpanjang sesi | ✓ | ✓ | ✓ | ✗ | ✗ |
| Pindah booking antar meja | ✓ | ✓ | ✓ | ✗ | ✗ |
| Tandai `no_show` | ✓ | ✓ | ✓ | ✗ | ✗ |
| Tutup sesi & tutup tab | ✓ | ✓ | ✓ | ✗ | ✗ |
| Buat booking manual (telepon/WA) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Batalkan booking | ✓ | ✓ | ± wajib alasan, hanya booking hari ini | ✗ | ✗ |
| Lihat antrian tiket F&B | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ubah status tiket (diterima → dimasak → siap) | ✓ | ✓ | ± hanya "siap → diantar" | ✓ | ± hanya "siap → diantar" |
| Input order F&B untuk pelanggan | ✓ | ✓ | ✓ | ✗ | ✓ |
| Void item F&B sebelum dimasak | ✓ | ✓ | ± wajib alasan | ✗ | ✗ |
| Void item F&B setelah dimasak | ✓ | ✓ | ✗ (minta manajer) | ✗ | ✗ |
| Set meja ke `maintenance` | ✓ | ✓ | ± maks 24 jam, wajib alasan | ✗ | ✗ |

**B. Uang & pembayaran**

| Kapabilitas | OWNER | MANAJER | KASIR | DAPUR/BAR | STAF MEJA |
|---|---|---|---|---|---|
| Catat pembayaran cash | ✓ | ✓ | ✓ | ✗ | ✗ |
| Catat pembayaran EDC | ✓ | ✓ | ✓ | ✗ | ✗ |
| Catat pembayaran QRIS statis kasir | ✓ | ✓ | ✓ | ✗ | ✗ |
| Lihat total tagihan satu tab | ✓ | ✓ | ✓ | ✗ | R (tanpa nominal total) |
| Beri diskon manual | ✓ tanpa batas | ✓ maks 25% | ± maks 10%, wajib alasan | ✗ | ✗ |
| Lihat omzet shift **sendiri** | ✓ | ✓ | ✓ | ✗ | ✗ |
| Lihat omzet **harian venue** | ✓ | ✓ | **✗** | ✗ | ✗ |
| Lihat laporan keuangan (P&L, gross vs net, MDR) | ✓ | R | **✗** | ✗ | ✗ |
| Lihat laporan pajak (rekap PBJT) | ✓ | R | **✗** | ✗ | ✗ |
| Buka/tutup shift kasir | ✓ | ✓ | ✓ (shift sendiri) | ✗ | ✗ |
| Approve selisih kas shift | ✓ | ✓ | **✗** | ✗ | ✗ |
| Tandai refund sudah diproses di Dashboard MAP | ✓ | ✓ | ✗ | ✗ | ✗ |
| Terbitkan store credit / voucher | ✓ | ✓ | ✗ | ✗ | ✗ |
| Export CSV/XLSX laporan | ✓ | ✓ | ✗ | ✗ | ✗ |

**C. Konfigurasi**

| Kapabilitas | OWNER | MANAJER | KASIR | DAPUR/BAR | STAF MEJA |
|---|---|---|---|---|---|
| Tambah/hapus/nonaktifkan meja | ✓ | ± nonaktifkan saja | ✗ | ✗ | ✗ |
| **Ubah tarif sesi (rate card)** | ✓ | **✗** | **✗** | ✗ | ✗ |
| **Ubah harga item F&B** | ✓ | ± maks ±15% dari harga dasar | **✗** | ✗ | ✗ |
| CRUD kategori & item menu | ✓ | ✓ | ✗ | ✗ | ✗ |
| Toggle sold-out item | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ubah jam operasional & hari libur | ✓ | ✓ | ✗ | ✗ | ✗ |
| Ubah tarif pajak & service charge | ✓ | **✗** | ✗ | ✗ | ✗ |
| Ubah kebijakan pembatalan | ✓ | ✗ | ✗ | ✗ | ✗ |
| Kelola banner promo | ✓ | ✓ | ✗ | ✗ | ✗ |
| Kelola akun staf & peran | ✓ | ± tidak bisa membuat `manager`/`owner` | ✗ | ✗ | ✗ |
| Reset password staf | ✓ | ✓ | ✗ | ✗ | ✗ |
| Ubah kredensial payment gateway | ✓ | ✗ | ✗ | ✗ | ✗ |

**D. Data pelanggan & audit**

| Kapabilitas | OWNER | MANAJER | KASIR | DAPUR/BAR | STAF MEJA |
|---|---|---|---|---|---|
| Cari pelanggan by nama/HP | ✓ | ✓ | ✓ | ✗ | ✗ |
| Lihat riwayat booking pelanggan | ✓ | ✓ | ± 10 terakhir | ✗ | ✗ |
| Lihat **total belanja seumur hidup** pelanggan | ✓ | ✓ | **✗** | ✗ | ✗ |
| Tulis catatan internal pelanggan | ✓ | ✓ | ✓ | ✗ | ✗ |
| Blacklist pelanggan | ✓ | ✓ | ✗ (hanya usul) | ✗ | ✗ |
| Export data pelanggan | ✓ | ✗ | ✗ | ✗ | ✗ |
| Lihat audit log | ✓ | R | ± hanya aksi sendiri | ✗ | ✗ |
| Lihat laporan "Aktivitas Sensitif" harian | ✓ | ✓ | ✗ | ✗ | ✗ |

#### 4.1.3 Requirement RBAC

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-01 | Enam peran (`customer`, `floor`, `kitchen`, `cashier`, `manager`, `owner`) tersimpan di `profiles.role`, ditegakkan lewat RLS dan RPC `SECURITY DEFINER`, bukan hanya disembunyikan di UI | **M** |
| AD-02 | **Kasir tidak memiliki jalur apa pun** untuk melihat omzet harian venue, laporan keuangan, laporan pajak, atau mengubah tarif sesi. Ditegakkan di level RLS (policy `revenue_ledger` dan `rate_cards` mengecualikan `cashier`), sehingga memanipulasi request dari browser pun tidak berhasil | **M** |
| AD-03 | Satu akun per orang. Sistem menolak login konkuren >2 sesi aktif untuk satu akun staf dan menampilkan peringatan ke manajer | **S** |
| AD-04 | Menu yang tidak diizinkan **tidak dirender sama sekali**, bukan ditampilkan dalam keadaan disabled — mengurangi godaan dan mengurangi pertanyaan "kenapa saya tidak bisa klik ini" | **M** |
| AD-05 | Setiap RPC yang mengubah data sensitif memvalidasi peran di dalam fungsi (`if not public.has_role(auth.uid(), 'manager') then raise exception ...`), tidak mengandalkan filter client | **M** |
| AD-06 | Batas diskon per peran dikonfigurasi di tabel `role_limits`, bukan hard-code (kasir 10%, manajer 25%, owner tak terbatas — nilai default, dapat diubah owner) | **S** |
| AD-07 | PIN 4–6 digit untuk aksi cepat di layar kasir (void, diskon, buka laci) sebagai lapisan kedua di atas sesi login, agar tablet kasir yang ditinggal terbuka tidak bisa disalahgunakan | **S** |
| AD-08 | Auto-logout layar kasir setelah 30 menit idle (konfigurabel), tapi **papan meja tetap tampil** dalam mode read-only agar tidak mengganggu operasional visual | **S** |
| AD-09 | Owner dapat membuat akun sementara berbatas waktu (`expires_at`) untuk staf harian/event | **C** |
| AD-10 | Peran kustom yang dibuat sendiri oleh owner dengan matriks izin granular | **W** |

Fungsi pemeriksa peran yang menggantikan `is_staff()` sederhana:

```sql
create or replace function public.has_role(p_uid uuid, p_min_role text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select case p.role
              when 'owner'    then 5 when 'manager' then 4
              when 'cashier'  then 3 when 'kitchen' then 2
              when 'floor'    then 1 else 0 end
       from public.profiles p where p.id = p_uid)
    >= case p_min_role
         when 'owner'   then 5 when 'manager' then 4
         when 'cashier' then 3 when 'kitchen' then 2
         when 'floor'   then 1 else 0 end,
  false);
$$;
```

Untuk kapabilitas yang **tidak** menaik (dapur melihat tiket, kasir tidak), pakai fungsi terpisah `public.has_capability(p_uid, 'kds.update_ticket')` yang membaca tabel `role_capabilities`. Di MVP, isi tabel itu dengan matriks §4.1.2 sebagai seed data.

---

### 4.2 Dashboard Operasional Real-time (Layar Utama Kasir)

Ini layar yang dilihat staf 8 jam sehari. Kalau layar ini lambat, membingungkan, atau mati saat internet putus, staf akan kembali ke kertas dan seluruh produk gagal.

#### 4.2.1 Target perangkat & tata letak makro

**Target utama: tablet 10 inci landscape (1280×800) atau PC kasir (1366×768).** Bukan HP — kasir butuh melihat banyak meja sekaligus. Layar pelanggan tetap mobile-first, layar kasir tidak.

Struktur tiga kolom, dengan tinggi header dan footer tetap:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER (tinggi 56px, latar #14100E, border bawah amber 1px)                  │
│ [SPL logogram] Sab 29 Agu 2026 · 20:47 WIB  │ ● Tersambung │ Shift: Dimas    │
│                              7/10 meja aktif │ 🔔 3 │ [Menu] [Profil]        │
├──────────────────────┬─────────────────────────────┬─────────────────────────┤
│ KOLOM KIRI  (24%)    │ KOLOM TENGAH (46%)          │ KOLOM KANAN (30%)       │
│ ANTRIAN HARI INI     │ PAPAN MEJA LIVE             │ ORDER F&B MASUK         │
│                      │                             │                         │
│ [Tab: Akan Datang]   │  ┌────┐ ┌────┐ ┌────┐       │ [Tab: Baru | Proses]    │
│ [Tab: Sedang Main]   │  │M-01│ │M-02│ │M-03│       │                         │
│ [Tab: Selesai]       │  └────┘ └────┘ └────┘       │ ┌─────────────────────┐ │
│                      │  ┌────┐ ┌────┐ ┌────┐       │ │ #A-041  M-03  20:44 │ │
│ ┌──────────────────┐ │  │M-04│ │M-05│ │M-06│       │ │ 1x Beef Ribs        │ │
│ │ 21:00  Budi S.   │ │  └────┘ └────┘ └────┘       │ │ 2x Lemon Tea        │ │
│ │ M-03 · 2 jam     │ │  ┌────┐ ┌────┐ ┌────┐       │ │ [Terima] [Tolak]    │ │
│ │ ● Lunas online   │ │  │M-07│ │V-01│ │V-02│       │ └─────────────────────┘ │
│ │ [Check-in]       │ │  └────┘ └────┘ └────┘       │ ...                     │
│ └──────────────────┘ │                             │                         │
│ ...                  │  [Legenda warna]            │                         │
├──────────────────────┴─────────────────────────────┴─────────────────────────┤
│ FOOTER AKSI CEPAT (tinggi 64px, sticky)                                      │
│ [+ Walk-in]  [Scan QR Check-in]  [+ Order F&B]  [Tutup Tab]  [Tutup Shift]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Pada layar <1024px (tablet portrait / HP manajer), tiga kolom berubah menjadi **tab bawah**: `Meja | Antrian | Order | Lainnya`. Papan meja tetap default.

#### 4.2.2 Header — detail konkret

| Elemen | Posisi | Perilaku |
|---|---|---|
| Logogram SPL (monogram dalam rak segitiga) | kiri, 32px | Statis; klik = kembali ke papan meja |
| Tanggal + jam berjalan | kiri setelah logo | Font Emoland, angka jam update tiap detik. **Jam ini adalah jam server**, bukan jam perangkat — mencegah selisih timer karena tablet salah setel |
| Indikator koneksi | tengah | Tiga state jujur: **● Tersambung** (hijau), **◐ Menyambung ulang** (amber, berdenyut), **● Offline — 3 item belum tersinkron** (merah). Wajib menyebut jumlah item pending, bukan sekadar "offline" |
| Ringkasan okupansi | tengah | "7/10 meja aktif" — angka besar, font Emoland |
| Lonceng notifikasi | kanan | Badge angka order baru yang belum dilihat. Klik = buka panel kanan |
| Identitas shift | kanan | "Shift: Dimas · buka 17:00" — membuat akuntabilitas terlihat sepanjang waktu |

#### 4.2.3 Papan meja live — komponen inti

Setiap meja adalah kartu berukuran minimal **160×120 px** (cukup besar untuk disentuh jari, memenuhi target sentuh 44px dengan margin). Kartu disusun dalam grid yang **mencerminkan denah fisik venue**, bukan urutan alfabet — admin dapat mengatur posisi grid tiap meja di §4.3.

Isi kartu meja, dari atas ke bawah:

```
┌────────────────────────────┐
│ M-03            [VIP chip] │  ← kode meja (Emoland Bold 20px) + chip tipe
│                            │
│      01:12:38              │  ← timer besar (Emoland 32px, tabular numerals)
│      sisa waktu            │
│                            │
│ Budi S. · 4 org            │  ← nama tamu + jumlah orang (Lido STF 13px)
│ ▓▓▓▓▓▓▓▓▓▓░░░░ 68%         │  ← progress bar sesi
│ Tab: Rp 245.000            │  ← total tagihan berjalan
│ ⚠ Booking 22:00 (Rina)     │  ← peringatan booking berikutnya, muncul T-30 mnt
└────────────────────────────┘
```

**Konvensi warna** — memakai konvensi industri (hijau/merah/kuning, sudah familiar dari Kasirbox dan POS biliar lain) yang di-*tune* ke palet SPL agar tetap on-brand di atas latar near-black:

| State | Warna isi | Warna aksen | Label teks | Ikon |
|---|---|---|---|---|
| Kosong | `#1A1512` (near-black) | border `#2A2320` | "KOSONG" | — |
| Sedang dipakai | `#14100E` | border + timer `#F0A202` (amber) | timer hitung mundur | ▶ |
| Reserved (akan datang) | `#14100E` | border putus-putus `#C9A227` | "21:00 · Budi" | ⏱ |
| Waktu hampir habis (≤10 mnt) | `#2A1410` | border `#F0A202` **berdenyut 1,5 s** | timer + "SEGERA HABIS" | ⚠ |
| Lewat waktu (overtime) | `#3A1208` | border `#992212` (brick maroon) | "+00:07:15" merah | ⏰ |
| Maintenance | `#1A1512` 40% opacity | garis diagonal `#5A5A5A` | "PERBAIKAN" + alasan | 🔧 |
| Walk-in tanpa batas waktu | `#14100E` | border `#F0A202` | timer **naik**, bukan turun | ▶ |

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-11 | Papan meja live menampilkan semua meja aktif dalam grid yang mencerminkan denah fisik | **M** |
| AD-12 | Timer hitung mundur per meja, presisi detik, **dihitung dari `ends_at` dikurangi jam server**, bukan dari counter lokal yang bisa hanyut. Sinkronisasi ulang tiap 60 detik | **M** |
| AD-13 | Warna status **tidak boleh menjadi satu-satunya pembeda** — setiap state punya label teks dan ikon. Wajib untuk aksesibilitas dan untuk staf yang buta warna | **M** |
| AD-14 | State "hampir habis" (≤10 menit, konfigurabel) berdenyut dan naik ke urutan atas grid secara otomatis | **M** |
| AD-15 | State "overtime" menampilkan timer **naik** berwarna maroon dengan nominal biaya tambahan berjalan (kalau kebijakan overtime diaktifkan) | **S** |
| AD-16 | Peringatan "meja ini dibooking jam X (nama)" muncul di kartu pada T-30 menit dan berubah keras pada T-15 menit | **M** |
| AD-17 | Tap kartu meja membuka **panel aksi geser** (bottom sheet di tablet) berisi: Perpanjang · Pindah Meja · Tambah Order F&B · Lihat Tab · Tutup Sesi · Catatan | **M** |
| AD-18 | Toggle tampilan: **Grid Denah** (default) ↔ **Daftar Padat** (tabel, untuk venue >16 meja) | **S** |
| AD-19 | Grid meja tetap tampil dan timer tetap berjalan **saat offline**, memakai data yang di-cache service worker; hanya aksi tulis yang di-antre | **M** |

#### 4.2.4 Kolom kiri — antrian booking hari ini

Tiga tab: **Akan Datang** (default) · **Sedang Main** · **Selesai/Batal**.

Kartu antrian, dari atas ke bawah:

```
┌─────────────────────────────────┐
│ 21:00 – 23:00        [2 jam]    │  ← jam besar Emoland, durasi sebagai chip
│ Budi Santoso                    │  ← Lido STF 15px
│ M-03 · 4 orang · 0812-3456-7890 │
│ ● LUNAS ONLINE Rp 140.000       │  ← chip status bayar, hijau
│ 📝 "Minta meja dekat jendela"   │  ← catatan pelanggan kalau ada
│ ┌───────────┐ ┌───────┐ ┌─────┐ │
│ │ CHECK-IN  │ │ Pindah│ │ ⋮   │ │
│ └───────────┘ └───────┘ └─────┘ │
└─────────────────────────────────┘
```

Urutan: menaik berdasarkan `starts_at`. Booking yang sudah lewat jam mulai tapi belum check-in **naik ke paling atas** dengan latar amber redup dan label **"TELAT 8 MENIT · sisa grace 7 menit"**, berdasarkan grace period 15 menit dari riset operasional.

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-20 | Antrian hari ini terurut waktu, dengan pemisah visual "SEKARANG" pada posisi jam berjalan | **M** |
| AD-21 | Booking telat naik ke atas dengan countdown sisa grace period | **M** |
| AD-22 | Setelah grace habis, kartu berubah ke state `no_show` **secara otomatis** dan meja dilepas untuk walk-in — dengan tombol "Batalkan No-Show" selama 30 menit kalau tamu ternyata datang | **M** |
| AD-23 | Tombol **CHECK-IN** besar sebagai aksi primer di setiap kartu; check-in juga bisa lewat scan QR di footer | **M** |
| AD-24 | Chip status pembayaran selalu terlihat: `LUNAS ONLINE` (hijau) · `MENUNGGU BAYAR` (amber + countdown hold) · `BAYAR DI TEMPAT` (abu) · `SEBAGIAN` (amber) | **M** |
| AD-25 | Filter cepat: semua · belum check-in · sedang main · belum lunas | **S** |
| AD-26 | Tombol "Cetak/Tampilkan Jadwal Hari Ini" — satu halaman ringkas yang bisa dicetak atau di-screenshot tiap pagi sebagai backup kertas saat listrik/internet mati | **M** |

#### 4.2.5 Kolom kanan — order F&B masuk

Tiga tab: **Baru** (badge angka) · **Diproses** · **Siap Diantar**.

Kartu order:

```
┌────────────────────────────────────┐
│ #A-041   M-03   ⏱ 2 mnt lalu       │  ← nomor order, meja, umur order
│ ────────────────────────────────── │
│ 1× Smoked Beef Ribs                │
│ 2× Lemon Tea                       │
│    └ "es sedikit"                  │  ← catatan per item
│ ────────────────────────────────── │
│ Rp 110.000 · ● LUNAS ONLINE        │
│ ┌────────────┐  ┌────────────────┐ │
│ │  TERIMA    │  │  Tolak/Ubah    │ │
│ └────────────┘  └────────────────┘ │
└────────────────────────────────────┘
```

Umur order (`⏱ 2 mnt lalu`) berubah warna: <5 menit abu, 5–10 menit amber, >10 menit maroon berdenyut. Ini yang mencegah order online terlupakan — masalah operasional paling umum saat order masuk dari kanal yang tidak dilihat langsung.

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-27 | Order F&B baru muncul di kolom kanan **secara realtime** lewat Supabase Broadcast channel `admin:orders`, tanpa refresh | **M** |
| AD-28 | **Notifikasi suara** saat order baru: bunyi khas 2 nada, volume dapat diatur, dapat di-mute per shift. Wajib ada tombol **"Aktifkan Suara"** yang ditekan sekali saat shift dibuka — browser memblokir autoplay audio sampai ada interaksi user, dan ini penyebab nomor satu "kok tidak bunyi" | **M** |
| AD-29 | **Notifikasi visual**: badge angka di header + kartu order baru masuk dengan animasi slide + flash amber 600 ms pada border panel | **M** |
| AD-30 | **Web Push (PWA)** ke perangkat manajer saat ada order baru di luar jam sibuk atau saat tab tidak aktif | **S** |
| AD-31 | Indikator umur order dengan eskalasi warna (abu → amber → maroon berdenyut) | **M** |
| AD-32 | Layar dapur/bar terpisah (`/kds`) dengan tampilan tiket besar, hanya menampilkan item yang relevan untuk stasiun itu (dapur vs bar), tanpa nominal harga sama sekali | **S** |
| AD-33 | Routing item ke stasiun (`kitchen` / `bar`) berdasarkan field `station` di item menu | **S** |
| AD-34 | Estimasi waktu siap per item, ditampilkan ke pelanggan di app | **C** |
| AD-35 | Integrasi printer thermal untuk cetak tiket dapur otomatis | **C** |

#### 4.2.6 Perilaku offline

Diturunkan langsung dari riset: venue di Indonesia **akan** kehilangan internet, dan insiden pertama menentukan apakah staf percaya pada sistem.

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-36 | PWA dengan service worker; layar kasir tetap terbuka dan menampilkan jadwal + papan meja hari ini dari cache saat internet putus | **M** |
| AD-37 | Indikator koneksi jujur dengan jumlah item belum tersinkron (lihat §4.2.2) | **M** |
| AD-38 | Saat offline, kasir tetap bisa **mencatat** sesi walk-in dan order F&B ke antrean lokal (IndexedDB), disinkronkan otomatis saat online. Pembayaran QRIS tidak mungkin offline — fallback ke cash atau QRIS statis bank | **C** |
| AD-39 | Konflik sync (booking online masuk saat kasir offline membuat walk-in di meja & jam yang sama) masuk **antrean konflik** untuk diselesaikan manual oleh manajer. **Jangan pernah auto-resolve** | **C** |
| AD-40 | Rekomendasi operasional non-software terdokumentasi: UPS kecil untuk router + tablet kasir. **ASUMSI** biaya Rp 700.000–1.500.000 **[PERLU KONFIRMASI]** harga pasar terkini | **S** |

---

### 4.3 Manajemen Meja

#### 4.3.1 Model data

```sql
alter table public.billiard_tables
  add column capacity          smallint not null default 4 check (capacity between 1 and 20),
  add column grid_row          smallint,          -- posisi di denah papan meja
  add column grid_col          smallint,
  add column controller_channel smallint,         -- HW-01: disiapkan untuk relay lampu Fase 3
  add column walk_in_only      boolean not null default false,
  add column notes             text;

create table public.table_maintenance (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.billiard_tables(id) on delete restrict,
  reason      text not null,
  reason_code text not null check (reason_code in
                ('kain_robek','cue_rusak','bola_hilang','lampu_mati','servis_rutin','lainnya')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,                        -- null = sampai dicabut manual
  created_by  uuid not null references auth.users(id),
  resolved_at timestamptz,
  cost        integer check (cost >= 0),          -- biaya perbaikan, Rupiah penuh
  created_at  timestamptz not null default now()
);
```

`table_type` diperluas dari Seksi Arsitektur Data:

```sql
alter table public.billiard_tables drop constraint if exists billiard_tables_table_type_check;
alter table public.billiard_tables add constraint billiard_tables_table_type_check
  check (table_type in ('regular','vip','tournament'));
```

**ASUMSI** definisi tipe meja, **[PERLU KONFIRMASI]** ke pemilik:

| Tipe | Karakteristik | Implikasi harga |
|---|---|---|
| `regular` | Meja standar di area terbuka | Tarif dasar |
| `vip` | Ruang tertutup / area terpisah, sofa, TV sendiri | +30–40% dari tarif dasar |
| `tournament` | Meja kompetisi (kain lebih cepat, pencahayaan standar turnamen) | Tarif dasar atau premium; sering di-blok untuk liga |

#### 4.3.2 Layar manajemen meja

Layout: **tabel di kiri (70%) + panel edit di kanan (30%)**, bukan modal. Panel edit yang menempel membuat admin bisa mengubah beberapa meja berturut-turut tanpa membuka-tutup dialog.

Kolom tabel: `Kode | Nama | Tipe | Kapasitas | Status | Posisi Denah | Sesi Hari Ini | Omzet Hari Ini | Aksi`

Di bawah tabel: **editor denah** — kanvas grid drag-and-drop di mana admin menyeret kartu meja ke posisi yang mencerminkan tata letak fisik venue. Posisi ini yang dipakai papan meja live (§4.2.3).

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-41 | CRUD meja: tambah meja baru dengan kode unik, nama, tipe, kapasitas | **M** |
| AD-42 | **Meja tidak pernah dihapus permanen** kalau punya riwayat booking. Tombol "Hapus" pada meja yang punya riwayat otomatis berubah menjadi "Nonaktifkan" dengan penjelasan. FK `ON DELETE RESTRICT` menegakkan ini di level DB | **M** |
| AD-43 | Toggle `is_active`. Meja nonaktif hilang dari booking online dan dari papan meja, tapi riwayatnya tetap muncul di laporan | **M** |
| AD-44 | Tipe meja: `regular` / `vip` / `tournament`, terhubung ke rate card (§4.4) | **M** |
| AD-45 | Kapasitas orang per meja, ditampilkan ke pelanggan saat memilih meja | **S** |
| AD-46 | Status maintenance dengan **alasan wajib** (kode + teks bebas) dan **rentang tanggal** (`starts_at`, `ends_at` opsional) | **M** |
| AD-47 | Saat meja di-set maintenance, sistem **menampilkan daftar booking terdampak** dan menawarkan **relokasi 1-klik** ke meja setara yang kosong di jam yang sama | **M** |
| AD-48 | Kalau tidak ada meja pengganti → sistem menawarkan **refund penuh** atau **store credit +20%** ke pelanggan terdampak. Ini kesalahan venue, bukan pelanggan | **M** |
| AD-49 | Meja `maintenance` tidak pernah muncul di grid booking online, dan `get_availability()` mengecualikannya | **M** |
| AD-50 | Flag `walk_in_only`: admin menandai N meja yang tidak pernah dijual online pada jam prime, menjaga pelanggan setia yang datang langsung tidak pernah ditolak | **M** |
| AD-51 | Editor denah drag-and-drop untuk posisi meja di papan live | **S** |
| AD-52 | Log maintenance per meja (kapan, berapa lama, `reason_code`, biaya) → dasar keputusan ganti kain/meja | **S** |
| AD-53 | Kolom `controller_channel` (nullable) disiapkan sejak MVP untuk kontrol lampu relay, walau belum dipakai. Biaya nol sekarang, menghindari migrasi menyakitkan nanti | **M** |
| AD-54 | Notifikasi otomatis "kain meja M-03 sudah 8 bulan sejak diganti" berdasarkan log maintenance | **W** |

---

### 4.4 Manajemen Harga (Rate Card Engine)

Ini fitur dengan konsekuensi finansial terbesar di panel admin, dan yang paling mudah salah dirancang. Riset menunjukkan industri biliar Indonesia memakai lima dimensi harga sekaligus — harga tidak boleh menjadi satu kolom di tabel `tables`.

#### 4.4.1 Model data

```sql
create table public.rate_cards (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                    -- 'Prime Weekend', 'Happy Hour Weekday'
  table_type      text not null check (table_type in ('regular','vip','tournament')),

  -- Cakupan hari: array ISO day-of-week (1=Senin .. 7=Minggu)
  days_of_week    smallint[] not null check (array_length(days_of_week,1) between 1 and 7),
  applies_holiday boolean not null default false,   -- berlaku pada hari libur nasional

  -- Cakupan jam dalam waktu WIB. end_time boleh < start_time (melintasi tengah malam).
  start_time      time not null,
  end_time        time not null,

  price_per_hour  integer not null check (price_per_hour > 0),   -- Rupiah penuh

  -- Spesifisitas: makin tinggi makin menang. Dihitung otomatis, bisa di-override.
  priority        integer not null default 0,

  effective_from  date not null default current_date,
  effective_to    date,                             -- null = berlaku selamanya
  is_active       boolean not null default true,

  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),

  constraint rate_cards_effective_order check (effective_to is null or effective_to >= effective_from)
);

create index rate_cards_lookup_idx
  on public.rate_cards (table_type, is_active, effective_from, effective_to);
```

Tabel hari libur nasional terpisah, karena tarif weekend biasanya berlaku juga di tanggal merah:

```sql
create table public.holidays (
  holiday_date date primary key,
  name         text not null,
  is_national  boolean not null default true,
  created_by   uuid references auth.users(id)
);
```

**[PERLU KONFIRMASI]** Apakah hari libur nasional dikenai tarif weekend? Default asumsi: **ya**.

#### 4.4.2 Resolusi konflik aturan — spesifisitas berjenjang

Ini bagian yang wajib dijelaskan eksplisit, karena admin **akan** membuat aturan yang tumpang tindih dan sistem harus punya jawaban yang deterministik dan bisa dijelaskan ke pemilik.

**Skor spesifisitas** dihitung otomatis saat rate card disimpan (dan disimpan ke kolom `priority` sehingga bisa dilihat dan di-override):

| Komponen | Bobot | Alasan |
|---|---|---|
| Jumlah hari yang dicakup makin sedikit | `(7 − jumlah_hari) × 1000` | Aturan untuk 1 hari tertentu lebih spesifik daripada aturan 7 hari |
| Rentang jam makin sempit | `(1440 − durasi_menit) × 1` | Aturan 2 jam lebih spesifik daripada aturan 12 jam |
| `applies_holiday = true` | `+ 5000` | Aturan khusus tanggal merah selalu menang atas aturan hari biasa |
| `effective_to` diisi (berbatas waktu) | `+ 3000` | Promo periodik menang atas tarif permanen |
| Override manual owner | nilai `priority` diisi tangan | Pintu darurat |

**Algoritma resolusi**, dijalankan per **segmen 30 menit** dari sesi:

```
1. Ambil semua rate_cards yang:
   - table_type cocok dengan tipe meja
   - is_active = true
   - tanggal booking ada di dalam [effective_from, effective_to]
   - hari (ISO dow) ada di days_of_week
     ATAU (tanggal adalah hari libur DAN applies_holiday = true)
   - jam segmen ada di dalam [start_time, end_time)
2. Kalau 0 hasil  -> pakai billiard_tables.hourly_price sebagai fallback,
                     DAN tampilkan peringatan ke admin "ada lubang tarif"
3. Kalau 1 hasil  -> pakai itu
4. Kalau >1 hasil -> urutkan: priority DESC, effective_from DESC, created_at DESC
                     -> ambil teratas
5. Harga segmen = price_per_hour / 2  (segmen 30 menit)
6. Harga sesi   = SUM(harga semua segmen)
```

**Keputusan penting yang di-*hardcode* dan tidak dikonfigurasi:** sesi yang melintasi batas time-band dihitung **per segmen sesuai band masing-masing**, bukan memakai band jam mulai. Sesi 19.00–22.00 dengan Happy Hour berakhir 20.00 dibayar 2 segmen tarif siang + 4 segmen tarif prime. Ini lebih adil, lebih transparan, dan menutup celah eksploitasi "booking 19.30 untuk dapat harga siang selama 3 jam". **[PERLU KONFIRMASI]** ke pemilik — kalau pemilik lebih suka aturan sederhana "harga mengikuti jam mulai", itu satu baris perubahan tapi harus diputuskan sekarang, bukan setelah rilis.

Fungsi kalkulasi:

```sql
create or replace function public.calc_table_price(
  p_table_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
) returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_type  text;
  v_fallback integer;
  v_total integer := 0;
  v_seg   timestamptz;
  v_price integer;
begin
  select table_type, hourly_price into v_type, v_fallback
    from public.billiard_tables where id = p_table_id;

  v_seg := p_starts_at;
  while v_seg < p_ends_at loop
    select rc.price_per_hour into v_price
      from public.rate_cards rc
     where rc.table_type = v_type
       and rc.is_active
       and (v_seg at time zone 'Asia/Jakarta')::date
           between rc.effective_from and coalesce(rc.effective_to, 'infinity'::date)
       and (
             extract(isodow from (v_seg at time zone 'Asia/Jakarta'))::smallint = any(rc.days_of_week)
             or (rc.applies_holiday and exists (
                   select 1 from public.holidays h
                    where h.holiday_date = (v_seg at time zone 'Asia/Jakarta')::date))
           )
       and (
             case when rc.end_time > rc.start_time
                  then (v_seg at time zone 'Asia/Jakarta')::time >= rc.start_time
                   and (v_seg at time zone 'Asia/Jakarta')::time <  rc.end_time
                  else (v_seg at time zone 'Asia/Jakarta')::time >= rc.start_time   -- melintasi tengah malam
                    or (v_seg at time zone 'Asia/Jakarta')::time <  rc.end_time
             end
           )
     order by rc.priority desc, rc.effective_from desc, rc.created_at desc
     limit 1;

    v_total := v_total + coalesce(v_price, v_fallback) / 2;   -- segmen 30 menit
    v_seg   := v_seg + interval '30 minutes';
  end loop;

  return v_total;
end;
$$;
```

#### 4.4.3 Layar editor tarif

Layout dua bagian vertikal:

**Atas — kalender heatmap tarif (wajib, ini yang membuat editor bisa dipahami).** Grid 7 kolom (Sen–Min) × baris jam operasional (10:00–02:00, per jam). Setiap sel diwarnai gradasi amber berdasarkan tarif: makin gelap makin murah, makin terang makin mahal. Sel menampilkan angka tarif. **Sel yang tidak tercakup rate card mana pun diberi latar maroon dengan tanda ⚠** — inilah cara admin melihat "lubang tarif" dalam satu pandangan, tanpa harus menelusuri daftar aturan.

Toggle di atas heatmap: `[Regular] [VIP] [Tournament]` dan pemilih tanggal efektif (agar admin bisa melihat "seperti apa tarif pada 17 Agustus?").

**Bawah — daftar rate card** terurut `priority DESC`, dengan kolom: `Nama | Tipe Meja | Hari | Jam | Harga/jam | Prioritas | Berlaku | Status | Aksi`. Baris yang saling tumpang tindih diberi ikon rantai 🔗 yang, saat di-hover, menyorot baris lawannya dan menampilkan "Aturan ini menang pada Sab 20:00–22:00".

**Form tambah/edit rate card** — panel geser dari kanan:

```
Nama aturan       [ Prime Weekend                    ]
Tipe meja         [ ● Regular  ○ VIP  ○ Tournament   ]
Hari              [✓Sen ✓Sel ✓Rab ✓Kam ✓Jum ✓Sab ✓Min]
                  [✓] Berlaku juga pada hari libur nasional
Jam mulai         [ 18:00 ]   Jam selesai [ 02:00 ]
                  ℹ Melintasi tengah malam — dipahami sistem
Harga per jam     [ Rp 70.000 ]
Berlaku dari      [ 01/09/2026 ]  sampai [ (kosong = selamanya) ]
Prioritas         [ 8420 ] (dihitung otomatis) [ Override ]

┌─ PREVIEW HARGA ────────────────────────────────────┐
│ Simulasi: [Sab 06/09/2026] [20:00] durasi [2 jam]  │
│ Meja: [M-03 Regular]                               │
│                                                    │
│  20:00–20:30   Prime Weekend      Rp 35.000        │
│  20:30–21:00   Prime Weekend      Rp 35.000        │
│  21:00–21:30   Prime Weekend      Rp 35.000        │
│  21:30–22:00   Prime Weekend      Rp 35.000        │
│  ─────────────────────────────────────────────     │
│  Subtotal sesi                    Rp 140.000       │
│  PBJT hiburan 10%                 sudah termasuk   │
│  TOTAL DIBAYAR PELANGGAN          Rp 140.000       │
│                                                    │
│ ⚠ PERUBAHAN vs aturan sekarang:                    │
│   Sab 20:00–22:00 : Rp 120.000 → Rp 140.000 (+17%) │
│   Jum 18:00–20:00 : Rp  90.000 → Rp 140.000 (+56%) │
│   3 booking yang sudah ada TIDAK berubah harganya  │
└────────────────────────────────────────────────────┘

              [ Batal ]  [ Simpan Aturan ]
```

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-55 | Rate card engine dengan dimensi: tipe meja × hari × rentang jam × periode efektif | **M** |
| AD-56 | Resolusi konflik deterministik berbasis skor spesifisitas yang **ditampilkan ke admin** (kolom Prioritas), bukan aturan tersembunyi | **M** |
| AD-57 | **Preview harga wajib sebelum simpan**, menampilkan rincian per segmen 30 menit dan total | **M** |
| AD-58 | Preview juga menampilkan **daftar perubahan** dibanding aturan yang berlaku sekarang, dalam persen dan Rupiah | **M** |
| AD-59 | **Harga di-snapshot ke `bookings.table_amount` saat booking dibuat.** Perubahan rate card **tidak pernah retroaktif**. Preview menegaskan ini secara tertulis | **M** |
| AD-60 | Kalender heatmap tarif 7×jam-operasional dengan penandaan "lubang tarif" berwarna maroon | **M** |
| AD-61 | Rate card **tidak pernah dihapus**, hanya diberi `effective_to` atau `is_active = false`. Riwayat tarif wajib utuh untuk audit dan rekonsiliasi | **M** |
| AD-62 | Dukungan rentang jam melintasi tengah malam (18:00–02:00) | **M** |
| AD-63 | Tabel hari libur nasional yang dikelola admin, dengan flag per rate card `applies_holiday` | **S** |
| AD-64 | Hanya **OWNER** yang dapat mengubah rate card. Manajer read-only. Ditegakkan di RLS | **M** |
| AD-65 | Perubahan rate card **selalu** masuk audit log dengan nilai lama dan baru | **M** |
| AD-66 | Peringatan sebelum simpan kalau ada booking masa depan yang jatuh di rentang aturan baru — dengan jumlahnya, agar owner tahu implikasinya | **S** |
| AD-67 | Paket durasi berjenjang (2 jam Rp 85.000, 5 jam Rp 220.000) sebagai entitas terpisah dari rate card per jam | **C** |
| AD-68 | Penjadwalan aktivasi rate card di masa depan ("mulai berlaku 1 Oktober, jangan aktif sekarang") — sudah didukung oleh `effective_from`, tinggal UI-nya | **S** |
| AD-69 | Simulasi dampak pendapatan: "kalau tarif ini dipakai bulan lalu, omzet akan Rp X lebih tinggi/rendah" | **W** |

---

### 4.5 Manajemen Menu F&B

#### 4.5.1 Model data

```sql
create table public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  icon        text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.menu_categories(id) on delete restrict,
  sku           text not null unique,               -- 'FB-BEEFRIBS'
  name          text not null,
  description   text,
  price         integer not null check (price > 0),  -- Rupiah penuh, tax-inclusive
  image_url     text,                                -- disajikan dari Cloudflare, BUKAN Supabase Storage
  station       text not null default 'kitchen'
                check (station in ('kitchen','bar','none')),
  tax_category  text not null default 'fnb'
                check (tax_category in ('fnb','entertainment','non_taxable')),
  is_available  boolean not null default true,       -- toggle sold-out cepat
  sold_out_until timestamptz,                        -- sold-out otomatis pulih
  sort_order    integer not null default 0,
  prep_minutes  smallint,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Penjadwalan tampil (menu sarapan, menu tengah malam)
create table public.menu_schedules (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid references public.menu_items(id) on delete cascade,
  category_id  uuid references public.menu_categories(id) on delete cascade,
  days_of_week smallint[] not null,
  start_time   time not null,
  end_time     time not null,
  is_active    boolean not null default true,
  constraint menu_schedules_target check (
    (item_id is not null) <> (category_id is not null)     -- tepat satu yang diisi
  )
);
```

**Aturan arsitektur yang tidak bisa ditawar:** `image_url` menunjuk ke **Cloudflare Pages atau R2**, bukan Supabase Storage. Egress Supabase Free hanya 5 GB/bulan dan gambar menu adalah cara tercepat menghabiskannya. Upload dari panel admin diunggah ke R2 lewat Edge Function, bukan langsung ke Supabase Storage.

#### 4.5.2 Layar manajemen menu

Layout: **sidebar kategori (20%) + grid item (55%) + panel edit (25%)**.

Sidebar kategori: daftar vertikal yang bisa di-drag untuk mengubah urutan, dengan angka jumlah item dan toggle aktif per kategori.

Grid item: kartu 3 kolom, masing-masing menampilkan thumbnail, nama, harga, chip stasiun (`🍳 Dapur` / `🍹 Bar`), dan **toggle sold-out sebagai switch besar langsung di kartu** — tidak perlu masuk ke form edit. Ini penting: saat ayam habis jam 21.00, kasir butuh mematikannya dalam 2 detik, bukan 6 klik.

Panel edit: form item dengan preview kartu seperti yang dilihat pelanggan, ter-update realtime saat mengetik.

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-70 | CRUD kategori menu: nama, ikon, urutan tampil (drag-and-drop), toggle aktif | **M** |
| AD-71 | CRUD item menu: SKU, nama, deskripsi, harga, kategori, stasiun, kategori pajak | **M** |
| AD-72 | Upload foto item dengan **kompresi & resize otomatis di client** sebelum upload (maks 1200px sisi panjang, WebP, target <150 KB), disimpan ke Cloudflare R2 | **M** |
| AD-73 | **Toggle sold-out satu ketukan** langsung dari grid, tanpa membuka form. Dapat dilakukan semua peran termasuk dapur dan staf meja | **M** |
| AD-74 | Sold-out otomatis pulih pada waktu tertentu (`sold_out_until`), default "sampai besok jam buka" agar staf tidak lupa menyalakannya lagi | **S** |
| AD-75 | Urutan tampil item drag-and-drop dalam kategori | **M** |
| AD-76 | Penjadwalan menu per item **atau** per kategori (hari + rentang jam), mis. menu sarapan 10:00–14:00 | **S** |
| AD-77 | Item di luar jadwal tampil **tidak muncul** di menu pelanggan, tapi masih bisa dipesan manual oleh kasir dengan konfirmasi | **S** |
| AD-78 | Harga item **tax-inclusive** — angka yang tampil adalah angka yang dibayar. Rincian pajak muncul sebagai baris terpisah di ringkasan pesanan. **[PERLU KONFIRMASI]** ke pemilik | **M** |
| AD-79 | Perubahan harga item masuk audit log dengan nilai lama dan baru | **M** |
| AD-80 | Harga item di-**snapshot** ke `order_items.price_locked` saat order dibuat | **M** |
| AD-81 | Duplikat item (untuk membuat varian cepat) | **S** |
| AD-82 | Varian & modifier (ukuran, level pedas, topping berbayar) | **C** |
| AD-83 | Bundling paket (sesi + F&B dalam satu SKU) | **C** |
| AD-84 | Manajemen stok dengan pengurangan otomatis dan sold-out otomatis saat stok nol | **W** |
| AD-85 | Resep & harga pokok penjualan (COGS) per item untuk analisis margin | **W** |

---

### 4.6 Manajemen Booking Manual

#### 4.6.1 Buat booking walk-in

Aksi paling sering dipakai di layar kasir. Harus selesai dalam **<15 detik** dan **<5 ketukan**.

Alur: tap kartu meja kosong di papan → bottom sheet "Buka Sesi Walk-in" muncul:

```
┌─ BUKA SESI WALK-IN — M-05 (Regular) ───────────────┐
│                                                    │
│ Durasi   [1 jam] [2 jam] [3 jam] [Open/tanpa batas]│
│                                                    │
│ ⚠ M-05 dibooking Rina jam 22:00 (1 jam 13 mnt lagi)│
│   Durasi maksimum: 1 jam 8 menit                   │
│   [3 jam] dan [Open] dinonaktifkan                 │
│                                                    │
│ Jumlah orang  [− 4 +]                              │
│ Nama (opsional) [                    ] [🔍 Cari]   │
│ No. HP (opsional) [                  ]             │
│                                                    │
│ Estimasi: 20:47 – 21:47 · Rp 55.000                │
│                                                    │
│              [ Batal ]  [ MULAI SESI ]             │
└────────────────────────────────────────────────────┘
```

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-86 | Buka sesi walk-in dalam ≤5 ketukan dari papan meja; booking masuk **tabel `bookings` yang sama** dengan `channel = 'walk_in'` | **M** |
| AD-87 | Sistem **memblokir** pemilihan durasi yang menabrak booking berikutnya, menampilkan nama pemesan dan sisa waktu. Override hanya oleh manajer, wajib alasan, tercatat di audit log | **M** |
| AD-88 | Mode **Open/tanpa batas** untuk walk-in — timer naik, tagihan dihitung saat sesi ditutup, dibulatkan ke atas per 30 menit. Tidak tersedia kalau ada booking berikutnya | **M** |
| AD-89 | Countdown "meja akan dipakai booking" muncul di layar kasir 15 menit sebelum sesi walk-in harus berakhir, dengan bunyi peringatan | **M** |
| AD-90 | Nama & HP opsional untuk walk-in, dengan pencarian pelanggan lama (autocomplete dari nomor HP) | **S** |
| AD-91 | Booking manual via telepon/WA: form lengkap dengan pemilih tanggal masa depan, ditandai `channel = 'phone'`, dan opsi "bayar di tempat" | **M** |

#### 4.6.2 Pindah booking antar meja

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-92 | Pindah booking ke meja lain lewat **drag-and-drop kartu di papan meja** (tablet: long-press lalu seret) | **S** |
| AD-93 | Fallback non-drag: tombol "Pindah Meja" di panel aksi → daftar meja yang **tersedia pada rentang waktu yang sama**, dengan meja tidak-tersedia ditampilkan abu beserta alasannya | **M** |
| AD-94 | Perpindahan divalidasi oleh **exclusion constraint di database**. Kalau gagal (`23P01`), tampilkan "Meja itu baru saja terisi" — jangan pernah tampilkan error SQL mentah | **M** |
| AD-95 | Kalau meja tujuan berbeda tipe (regular → VIP), sistem menampilkan **selisih harga** dan meminta keputusan: tagih selisih · gratiskan (wajib alasan) · batalkan | **M** |
| AD-96 | Perpindahan mengirim notifikasi ke pelanggan (in-app + `wa.me` deep link untuk kasir menekan kirim) | **S** |
| AD-97 | Semua perpindahan tercatat di audit log dengan meja asal, meja tujuan, dan alasan | **M** |

#### 4.6.3 Perpanjang, batalkan, no-show, check-in

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-98 | **Perpanjang sesi** dari layar kasir dan dari app pelanggan. Satu statement `UPDATE bookings SET ends_at = ends_at + interval`, dilindungi exclusion constraint | **M** |
| AD-99 | Kalau slot berikutnya terisi → sistem **otomatis mencari meja alternatif** kosong di jam berikutnya dan menawarkan "pindah ke M-05 setelah 22:00" | **M** |
| AD-100 | Kalau tidak ada alternatif → beritahu **lebih awal**, pada T-20 menit, jangan mengejutkan pelanggan di menit terakhir | **M** |
| AD-101 | **Hard stop** perpanjangan pada T-5 menit dari booking berikutnya | **M** |
| AD-102 | Perpanjangan dibayar: QRIS in-app (pelanggan) atau cash/EDC di kasir. Harga perpanjangan memakai rate card **jam perpanjangan**, bukan jam mulai sesi asli | **M** |
| AD-103 | **Batalkan booking** dengan **alasan wajib** dari daftar terstruktur (`permintaan_pelanggan`, `meja_rusak`, `venue_tutup`, `duplikat`, `salah_input`, `lainnya`) + teks bebas | **M** |
| AD-104 | Pembatalan booking yang sudah lunas **tidak otomatis melakukan refund**. Sistem membuat `refund_task` yang harus diproses manual admin di Dashboard MAP Midtrans, lalu ditandai selesai di sistem. Refund otomatis via API ditunda ke Fase 3 | **M** |
| AD-105 | Sistem menampilkan **kebijakan refund yang berlaku** untuk booking itu saat pembatalan (>24 jam: 100%, 6–24 jam: 50% atau store credit 100%, <6 jam: tanpa refund), dan menghitung nominalnya otomatis | **M** |
| AD-106 | Peringatan keras kalau pembayaran berumur **>7 hari** — jendela refund QRIS OFF-US sudah lewat, hanya store credit yang mungkin | **M** |
| AD-107 | **Tandai no-show** manual, dan otomatis setelah grace period 15 menit (konfigurabel) | **M** |
| AD-108 | Tombol "Batalkan No-Show" tersedia 30 menit setelah penandaan, kalau tamu ternyata datang terlambat | **M** |
| AD-109 | **Check-in via scan QR** booking pelanggan; kamera tablet atau scanner USB. Status → `seated`, timer meja mulai | **M** |
| AD-110 | Check-in manual (cari nama/HP) sebagai fallback kalau QR tidak bisa dibaca | **M** |
| AD-111 | Sesi tetap dihitung **dari jam booking, bukan jam kedatangan**. Booking 20:00–22:00 yang check-in 20:20 tetap berakhir 22:00. Ditulis jelas di halaman konfirmasi pelanggan sebelum bayar | **M** |
| AD-112 | Waitlist: pelanggan masuk antrean saat penuh, dinotifikasi kalau ada pembatalan | **C** |
| AD-113 | Flag pelanggan repeat-no-show (≥3× dalam 90 hari) → wajib bayar penuh di muka | **C** |

---

### 4.7 Pencatatan Pembayaran Non-Online (Cash & EDC)

**Ini seksi yang menentukan apakah dashboard keuangan berguna atau menyesatkan.** Kalau hanya pembayaran QRIS online yang tercatat, pemilik akan melihat "omzet Rp 12 juta" padahal sebenarnya Rp 47 juta — dan akan berhenti mempercayai sistem dalam minggu pertama.

#### 4.7.1 Model data

Struktur `payments` diperluas menjadi **many-to-one terhadap satu tab/booking**, karena satu tab dapat dibayar dengan beberapa metode:

```sql
alter table public.payments
  add column channel text not null default 'qris_online'
      check (channel in ('qris_online','cash','edc_debit','edc_credit',
                         'qris_static','transfer','store_credit','voucher')),
  add column recorded_by     uuid references auth.users(id),   -- siapa kasirnya
  add column shift_id        uuid references public.cashier_shifts(id),
  add column edc_ref         text,                             -- 6 digit approval code EDC
  add column edc_bank        text,                             -- 'BCA','Mandiri','BRI'
  add column cash_received   integer check (cash_received >= 0),
  add column cash_change     integer check (cash_change   >= 0),
  add column note            text;

-- Index unik "satu QR aktif per booking" hanya berlaku untuk channel online.
drop index if exists payments_one_active_per_booking;
create unique index payments_one_active_qris_per_booking
  on public.payments (booking_id)
  where status in ('pending','paid') and channel = 'qris_online';
```

Tabel shift kasir — fondasi rekonsiliasi kas:

```sql
create table public.cashier_shifts (
  id                uuid primary key default gen_random_uuid(),
  cashier_id        uuid not null references auth.users(id),
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  business_date     date not null,
  opening_float     integer not null check (opening_float >= 0),   -- modal awal laci
  expected_cash     integer,        -- dihitung sistem saat tutup
  counted_cash      integer,        -- diinput kasir saat tutup
  variance          integer generated always as (counted_cash - expected_cash) stored,
  variance_reason   text,
  approved_by       uuid references auth.users(id),
  approved_at       timestamptz,
  status            text not null default 'open'
                    check (status in ('open','pending_approval','approved','disputed')),
  created_at        timestamptz not null default now()
);

create unique index cashier_shifts_one_open_per_cashier
  on public.cashier_shifts (cashier_id) where status = 'open';
```

#### 4.7.2 Alur tutup tab

Layar "Tutup Tab" adalah layar paling sering dipakai kasir setelah papan meja:

```
┌─ TUTUP TAB — M-03 · Budi Santoso ──────────────────────┐
│                                                        │
│ Sesi biliar 20:00–22:00 (2 jam)          Rp 140.000    │
│ 1× Smoked Beef Ribs                      Rp  60.000    │
│ 2× Lemon Tea                             Rp  50.000    │
│ ──────────────────────────────────────────────────     │
│ Subtotal                                 Rp 250.000    │
│ Diskon                                   Rp       0    │
│ TOTAL (sudah termasuk PBJT)              Rp 250.000    │
│                                                        │
│ SUDAH DIBAYAR:                                         │
│   ● QRIS online (booking)  20:14        −Rp 140.000    │
│ ──────────────────────────────────────────────────     │
│ SISA TAGIHAN                             Rp 110.000    │
│                                                        │
│ Bayar dengan:                                          │
│  [ 💵 CASH ]  [ 💳 EDC ]  [ 📱 QRIS Kasir ]  [ 🎟 Kredit ]│
│                                                        │
│  ┌─ CASH dipilih ──────────────────────────────────┐   │
│  │ Uang diterima  [ Rp 150.000 ]                   │   │
│  │ [50rb][100rb][150rb][Uang pas]  ← tombol cepat  │   │
│  │ KEMBALIAN                        Rp  40.000     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                        │
│  [ + Tambah metode bayar lain ]   ← split payment      │
│                                                        │
│           [ Batal ]  [ TUTUP TAB & CETAK STRUK ]       │
└────────────────────────────────────────────────────────┘
```

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-114 | **Konsep "Tab Meja"**: semua item — sesi biliar, F&B online, F&B pesan di kasir, F&B pesan ke waiter — masuk satu tab yang diidentifikasi `booking_id` | **M** |
| AD-115 | Satu tab dapat memiliki **banyak record pembayaran** dengan channel berbeda (split payment). Model data `payments[]` many-to-one, bukan satu kolom `payment_method` | **M** |
| AD-116 | Kasir melihat **"sudah dibayar online Rp X, sisa Rp Y"** dengan jelas saat menutup tab | **M** |
| AD-117 | **Cash**: input uang diterima dengan tombol pecahan cepat, kembalian dihitung otomatis dan ditampilkan besar | **M** |
| AD-118 | **EDC**: input nominal + **6 digit approval code** + pilihan bank. Approval code wajib — inilah yang dipakai merekonsiliasi dengan settlement bank EDC | **M** |
| AD-119 | **QRIS statis kasir** (QR cetak di meja kasir, bukan lewat aplikasi): dicatat sebagai channel terpisah dengan nominal manual. **Tidak** dianggap sama dengan `qris_online` karena settlement-nya berbeda rekening/laporan | **M** |
| AD-120 | Setiap pembayaran non-online mencatat `recorded_by` (kasir) dan `shift_id` — tanpa ini rekonsiliasi kas mustahil | **M** |
| AD-121 | **Struk bernomor urut tanpa gap**. Void menghasilkan record void, bukan menghapus nomor. Gap adalah temuan pemeriksaan Bapenda | **M** |
| AD-122 | Struk memuat: nama & alamat usaha, NPWPD, nomor struk, tanggal-waktu, rincian item, subtotal, pajak + persentase, total, metode bayar, ID kasir | **M** |
| AD-123 | Struk dapat dicetak (printer thermal 58/80mm) **dan** dikirim sebagai e-receipt lewat email / `wa.me` deep link | **S** |
| AD-124 | **Shift kasir**: buka shift dengan modal awal laci, tutup shift dengan hitung fisik uang. Sistem menghitung `expected_cash`, kasir input `counted_cash`, selisih dihitung otomatis | **M** |
| AD-125 | Selisih kas **wajib diberi alasan** kalau melebihi ambang (default Rp 10.000, konfigurabel) dan **wajib di-approve manajer/owner** — kasir tidak bisa approve shift sendiri | **M** |
| AD-126 | Laporan shift menampilkan rincian per channel: cash, EDC per bank, QRIS statis, QRIS online (informatif — tidak masuk hitungan laci) | **M** |
| AD-127 | Dashboard keuangan **selalu** menampilkan omzet terpisah per channel dan per kategori (sewa meja vs F&B). Tidak ada satu angka tunggal tanpa rincian | **M** |
| AD-128 | Dashboard menampilkan **omzet kotor** dan **dana bersih diterima** berdampingan: gross − PBJT − MDR − payout fee = net | **M** |
| AD-129 | Dua view laporan terpisah: berbasis **tanggal transaksi** (analisis penjualan) dan berbasis **tanggal settlement** (rekonsiliasi bank) | **M** |
| AD-130 | Export CSV/XLSX untuk akuntan, memuat semua kolom `gross_amount`, `mdr_fee`, `net_amount`, `settlement_date`, channel, kategori pajak | **M** |
| AD-131 | Laporan **"Rekap Pajak Terutang"** bulanan: DPP F&B, DPP hiburan, PBJT terutang masing-masing — langsung dapat dipakai mengisi SPTPD | **M** |
| AD-132 | Halaman rekonsiliasi: daftar transaksi `settlement` yang belum dicocokkan dengan mutasi rekening | **C** |
| AD-133 | Tarik data settlement otomatis dari Midtrans Iris/Payout API | **W** |

**Risiko fraud yang harus disadari pemilik:** pembayaran cash yang tidak diinput sistem adalah kebocoran omzet paling mudah dan paling sulit dideteksi. Kontrol yang tersedia di MVP: (a) struk bernomor urut wajib untuk setiap penutupan tab, (b) rekonsiliasi kas fisik vs sistem di setiap tutup shift dengan approval manajer, (c) laporan "Aktivitas Sensitif" harian (§4.8). Tidak ada satu pun kontrol ini yang bersifat teknis murni — semuanya butuh manajer yang benar-benar membaca laporannya.

---

### 4.8 Audit Log

Riset menyebut ini sebagai satu-satunya pertahanan terhadap kecurangan internal, dan audit log hanya berguna kalau **akun per orang** ditegakkan (AD-03).

#### 4.8.1 Model data

```sql
create table public.audit_log (
  id            bigserial primary key,
  actor_id      uuid references auth.users(id),      -- null = sistem/cron
  actor_role    text,                                 -- di-snapshot, peran bisa berubah nanti
  actor_name    text,                                 -- di-snapshot, nama bisa berubah
  action        text not null,                        -- 'booking.cancel','price.update', ...
  severity      text not null default 'info'
                check (severity in ('info','notable','sensitive','critical')),
  entity_type   text not null,                        -- 'booking','rate_card','menu_item', ...
  entity_id     text not null,
  before_value  jsonb,
  after_value   jsonb,
  reason        text,                                 -- wajib untuk severity >= 'sensitive'
  shift_id      uuid references public.cashier_shifts(id),
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  business_date date generated always as
                (((created_at at time zone 'Asia/Jakarta') - interval '2 hours')::date) stored
);

create index audit_log_entity_idx   on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx    on public.audit_log (actor_id, created_at desc);
create index audit_log_sensitive_idx on public.audit_log (business_date, severity)
  where severity in ('sensitive','critical');

-- Append-only ditegakkan di database, bukan hanya di konvensi.
revoke update, delete on public.audit_log from authenticated, anon;
create rule audit_log_no_update as on update to public.audit_log do instead nothing;
create rule audit_log_no_delete as on delete to public.audit_log do instead nothing;
```

#### 4.8.2 Aksi yang wajib dicatat

| Aksi | `severity` | Alasan wajib? |
|---|---|---|
| `price.rate_card.create/update/deactivate` | **critical** | ✓ |
| `price.menu_item.update` | **sensitive** | ✓ |
| `tax.rate.update` | **critical** | ✓ |
| `booking.cancel` | **sensitive** | ✓ |
| `booking.move_table` | notable | ✓ |
| `booking.extend` | info | ✗ |
| `booking.override_walkin_conflict` | **critical** | ✓ |
| `booking.no_show.mark` / `.revert` | notable | ✗ / ✓ |
| `discount.apply` | **sensitive** | ✓ |
| `order.void_item` (sebelum dimasak) | **sensitive** | ✓ |
| `order.void_item` (setelah dimasak) | **critical** | ✓ |
| `payment.record_cash` | info | ✗ |
| `payment.delete/adjust` | **critical** | ✓ |
| `refund.mark_processed` | **critical** | ✓ |
| `store_credit.issue` | **sensitive** | ✓ |
| `shift.close` dengan selisih > ambang | **sensitive** | ✓ |
| `shift.approve` | notable | ✗ |
| `table.create/deactivate` | notable | ✓ |
| `table.maintenance.set` | notable | ✓ |
| `menu_item.sold_out.toggle` | info | ✗ |
| `settings.update` (jam operasional, kebijakan) | **sensitive** | ✓ |
| `user.create/role_change/deactivate` | **critical** | ✓ |
| `customer.blacklist` | **sensitive** | ✓ |
| `auth.login_failed` (≥3× berturut) | notable | ✗ |
| `data.export` | **sensitive** | ✗ |

#### 4.8.3 Layar audit log & laporan aktivitas sensitif

**Layar Audit Log** (owner penuh, manajer read-only): tabel dengan filter di atas — rentang tanggal · aktor · peran · tipe aksi · severity · entity. Setiap baris dapat diperluas untuk menampilkan diff `before_value` vs `after_value` berdampingan, dengan field yang berubah disorot amber.

**Laporan "Aktivitas Sensitif" harian** adalah fitur yang membuat audit log benar-benar dipakai — bukan sekadar ada. Satu halaman yang bisa dibaca pemilik dalam 30 detik, dikirim otomatis tiap pagi:

```
AKTIVITAS SENSITIF — Sabtu, 29 Agustus 2026
═══════════════════════════════════════════════════════

💰 DISKON MANUAL                        3 kejadian · Rp 87.000
   20:14  Dimas (kasir)   M-03  −Rp 25.000 (10%)
          "pelanggan komplain meja bergelombang"
   21:47  Sari  (manajer) M-07  −Rp 42.000 (20%)
          "kompensasi order telat 40 menit"
   23:02  Dimas (kasir)   M-01  −Rp 20.000 (8%)
          "member lama, ulang tahun"

🗑 VOID ITEM                            2 kejadian · Rp 120.000
   ⚠ 22:31 Dimas (kasir) #A-055 1× Beef Ribs (SETELAH DIMASAK)
          "salah input meja"                        ← perlu ditinjau
   19:08  Sari (manajer)  #A-012 2× Lemon Tea
          "pelanggan batal sebelum dibuat"

❌ PEMBATALAN BOOKING                   1 kejadian · Rp 140.000
   18:22  Sari (manajer)  BK-0412 Budi S.
          "meja rusak, tidak ada pengganti" → store credit +20%

💵 SELISIH KAS SHIFT
   Shift Dimas 17:00–01:00   −Rp 15.000   ⚠ BELUM DI-APPROVE
          "kembalian salah hitung, sudah dicatat"

🔧 PERUBAHAN KONFIGURASI                tidak ada
🔑 PERUBAHAN AKUN                       tidak ada
═══════════════════════════════════════════════════════
Total nilai aktivitas sensitif hari ini: Rp 347.000 (2,1% omzet)
```

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-134 | Audit log **append-only** ditegakkan di level database (revoke UPDATE/DELETE + rule), bukan hanya konvensi aplikasi | **M** |
| AD-135 | Setiap entri memuat: aktor, peran & nama ter-snapshot, aksi, entity, nilai sebelum & sesudah (JSONB), alasan, waktu, shift, IP | **M** |
| AD-136 | Perubahan **harga sesi (rate card)** dan **tarif pajak** selalu `severity = 'critical'` dengan alasan wajib | **M** |
| AD-137 | **Pembatalan booking**, **diskon manual**, **void order**, dan **refund** selalu tercatat dengan alasan wajib | **M** |
| AD-138 | Aksi dengan `severity >= 'sensitive'` **ditolak di level RPC** kalau `reason` kosong atau <10 karakter — bukan divalidasi di client | **M** |
| AD-139 | Laporan "Aktivitas Sensitif" harian, dapat dibaca dalam 30 detik, dengan total nilai dan persentase terhadap omzet | **M** |
| AD-140 | Laporan tersebut dikirim otomatis ke owner tiap pagi (email + Web Push) | **S** |
| AD-141 | Diff `before`/`after` ditampilkan berdampingan dengan field berubah disorot | **S** |
| AD-142 | Retensi audit log **minimal 24 bulan**. Prune otomatis hanya untuk `severity = 'info'` setelah 6 bulan — melindungi kuota 500 MB Supabase Free tanpa kehilangan jejak yang penting | **M** |
| AD-143 | Audit log ikut dalam `pg_dump` harian ke GitHub Actions (backup) | **M** |
| AD-144 | Alert realtime ke owner untuk `severity = 'critical'` (Web Push instan, bukan menunggu laporan pagi) | **S** |
| AD-145 | Deteksi anomali: kasir dengan rasio void/diskon jauh di atas rata-rata rekan, atau selisih kas berulang | **C** |
| AD-146 | Export audit log ke CSV untuk audit eksternal | **S** |

---

### 4.9 Pengaturan Umum

#### 4.9.1 Model data

```sql
create table public.venue_settings (
  key          text primary key,
  value        jsonb not null,
  value_type   text not null check (value_type in ('string','number','boolean','json','time','money')),
  category     text not null,        -- 'jam','pajak','kebijakan','kontak','tampilan'
  label        text not null,
  description  text,
  min_role     text not null default 'owner',       -- peran minimum untuk mengubah
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now()
);

create table public.operating_hours (
  day_of_week  smallint primary key check (day_of_week between 1 and 7),
  is_open      boolean not null default true,
  open_time    time not null default '10:00',
  close_time   time not null default '02:00',       -- boleh < open_time (lewat tengah malam)
  last_booking_time time not null default '00:00',  -- booking terakhir yang boleh dimulai
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now()
);

create table public.venue_closures (
  id           uuid primary key default gen_random_uuid(),
  starts_date  date not null,
  ends_date    date not null,
  reason       text not null,
  closure_type text not null check (closure_type in ('libur_nasional','cuti_bersama','renovasi','private_event','lainnya')),
  block_online_booking boolean not null default true,
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  constraint venue_closures_date_order check (ends_date >= starts_date)
);
```

#### 4.9.2 Daftar pengaturan

| Kelompok | Kunci | Tipe | Default (ASUMSI) | Peran min. |
|---|---|---|---|---|
| **Jam** | jam buka/tutup per hari | time × 7 | 10:00–02:00 | manager |
| | booking terakhir yang boleh dimulai | time | 00:00 | manager |
| | granularitas slot | number | 30 menit | owner |
| | durasi booking min / maks online | number | 1 jam / 4 jam | owner |
| | booking paling cepat (lead time) | number | 1 jam dari sekarang | manager |
| | booking paling jauh | number | 14 hari | manager |
| | buffer antar sesi | number | 0 menit | owner |
| **Hold & bayar** | durasi hold pembayaran | number | 10 menit | owner |
| | expiry QRIS | number | 8 menit | owner |
| | grace period check-in | number | 15 menit | manager |
| **Pajak** | `tax_rate_fnb` | number | 10% **[PERLU KONFIRMASI]** Perda setempat | **owner** |
| | `tax_rate_billiard` | number | 10% **[PERLU KONFIRMASI]** — bisa 40% kalau dikategorikan bar | **owner** |
| | `service_charge_rate` | number | 0% | **owner** |
| | harga tayang tax-inclusive | boolean | true | **owner** |
| | NPWPD | string | — | **owner** |
| **Kebijakan** | teks kebijakan pembatalan | text | lihat §4.9.3 | owner |
| | ambang refund penuh | number | 24 jam | owner |
| | ambang refund 50% | number | 6 jam | owner |
| | store credit sebagai default | boolean | true | owner |
| | teks S&K | text | — | owner |
| | teks kebijakan privasi | text | — | owner |
| **Kontak** | nomor WhatsApp venue | string | — | manager |
| | email venue | string | — | manager |
| | alamat & Google Maps link | string | — | manager |
| | jam layanan CS | string | — | manager |
| **Tampilan** | banner promo (gambar + teks + link + jadwal aktif) | json | — | manager |
| | pesan pengumuman di homepage | text | — | manager |
| | ambang "hampir habis" papan meja | number | 10 menit | manager |
| | volume & aktifkan notifikasi suara | json | aktif, 70% | cashier |

#### 4.9.3 Teks kebijakan pembatalan — usulan default

**[PERLU KONFIRMASI]** Ini keputusan bisnis, bukan teknis. Diturunkan dari benchmark Lusso Billiard dan dibatasi oleh jendela refund QRIS OFF-US 7 hari:

| Waktu pembatalan | Kebijakan | Catatan |
|---|---|---|
| > 24 jam sebelum sesi | Refund 100% **atau** store credit 110% | Store credit ditawarkan lebih dulu |
| 6–24 jam sebelum sesi | Refund 50% **atau** store credit 100% | — |
| < 6 jam sebelum sesi | Tanpa refund, reschedule gratis 1× | Reschedule maks H+7 |
| No-show | Tanpa refund | — |
| Dibatalkan oleh SPL | Refund 100% + store credit 20% | Meja rusak, venue tutup mendadak |

Kebijakan ini **wajib ditampilkan di halaman booking sebelum pembayaran**, bukan disembunyikan di halaman S&K.

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-147 | Jam operasional dapat diatur **per hari**, mendukung jam tutup melewati tengah malam | **M** |
| AD-148 | Hari libur / penutupan venue dengan rentang tanggal dan alasan; memblokir booking online pada rentang itu | **M** |
| AD-149 | Sistem **menampilkan booking terdampak** saat penutupan venue dibuat dan menawarkan pembatalan massal + store credit | **M** |
| AD-150 | Tarif pajak sebagai **konfigurasi database dengan `effective_from`**, bukan konstanta kode. Minimal dua tarif independen: `tax_rate_fnb` dan `tax_rate_billiard` | **M** |
| AD-151 | Perubahan tarif pajak **tidak retroaktif** terhadap transaksi yang sudah terjadi | **M** |
| AD-152 | Service charge sebagai persentase terpisah; **[PERLU KONFIRMASI]** DPP PBJT dihitung dari (subtotal + service charge) | **S** |
| AD-153 | Teks kebijakan pembatalan, S&K, dan privasi dapat diedit lewat editor teks kaya sederhana, dengan **versioning** — versi yang berlaku saat pelanggan booking disimpan sebagai referensi kalau ada sengketa | **S** |
| AD-154 | Nomor WhatsApp venue dipakai untuk semua `wa.me` deep link di aplikasi | **M** |
| AD-155 | Banner promo dengan gambar, teks, link tujuan, dan **jadwal aktif** (tanggal mulai–selesai) | **S** |
| AD-156 | Semua perubahan pengaturan masuk audit log dengan nilai lama dan baru | **M** |
| AD-157 | Peringatan pra-simpan untuk pengaturan berisiko tinggi (pajak, jam operasional) yang menjelaskan dampaknya dalam bahasa manusia | **S** |
| AD-158 | Pengaturan multi-cabang (venue kedua) | **W** |

---

### 4.10 Manajemen Pelanggan

#### 4.10.1 Model data

```sql
alter table public.profiles
  add column whatsapp        text,
  add column birthday        date,
  add column internal_note   text,                  -- tidak pernah terlihat pelanggan
  add column is_blacklisted  boolean not null default false,
  add column blacklist_reason text,
  add column blacklisted_by  uuid references auth.users(id),
  add column blacklisted_at  timestamptz,
  add column marketing_consent boolean not null default false,
  add column consent_at      timestamptz;

create table public.customer_notes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  note        text not null,
  note_type   text not null default 'general'
              check (note_type in ('general','preference','complaint','praise','warning')),
  author_id   uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);
```

**Statistik pelanggan** dihitung lewat view, bukan disimpan sebagai kolom yang mudah basi:

```sql
create or replace view public.customer_stats as
select
  p.id                                                          as customer_id,
  count(b.id) filter (where b.status in ('completed','seated')) as total_visits,
  count(b.id) filter (where b.status = 'no_show')               as total_no_shows,
  count(b.id) filter (where b.status = 'cancelled')             as total_cancellations,
  coalesce(sum(b.total_amount) filter (where b.status = 'completed'), 0) as lifetime_value,
  max(b.starts_at) filter (where b.status = 'completed')        as last_visit_at,
  count(b.id) filter (
    where b.status = 'no_show' and b.starts_at > now() - interval '90 days'
  )                                                             as no_shows_90d
from public.profiles p
left join public.bookings b on b.user_id = p.id
where p.role = 'customer'
group by p.id;
```

`lifetime_value` **tidak boleh** dilihat kasir (§4.1.2 tabel D) — inilah alasan statistik ini disajikan lewat view ber-RLS, bukan kolom di `profiles`.

#### 4.10.2 Layar pelanggan

**Daftar pelanggan**: pencarian di paling atas (satu kotak, mencari nama · nomor HP · email · kode booking sekaligus, karena kasir tidak punya waktu memilih filter). Kolom: `Nama | WhatsApp | Kunjungan | Terakhir Datang | No-show | Status`. Chip status: `Reguler` · `Sering datang` (≥10 kunjungan) · `Perlu perhatian` (≥2 no-show 90 hari) · `Blacklist`.

**Detail pelanggan** — tiga tab:

1. **Ringkasan** — kontak, statistik (kunjungan, LTV *hanya untuk manajer ke atas*, terakhir datang, meja favorit, jam favorit), chip status.
2. **Riwayat** — timeline booking + order, dapat difilter, dengan status dan nominal per baris.
3. **Catatan internal** — daftar catatan dengan tipe berwarna, penulis, dan waktu. **Selalu diberi label jelas "TIDAK TERLIHAT OLEH PELANGGAN"** agar staf tidak salah menulis di kolom yang salah.

| ID | Requirement | MoSCoW |
|---|---|---|
| AD-159 | Pencarian pelanggan satu kotak: nama, nomor HP, email, atau kode booking sekaligus | **M** |
| AD-160 | Halaman detail pelanggan dengan riwayat booking & order lengkap | **M** |
| AD-161 | Statistik: jumlah kunjungan, terakhir datang, jumlah no-show, jumlah pembatalan | **M** |
| AD-162 | **Lifetime value hanya terlihat manajer & owner**, tidak untuk kasir | **M** |
| AD-163 | Catatan internal per pelanggan dengan tipe (`preference`, `complaint`, `warning`, ...), penulis, dan waktu. Diberi label "tidak terlihat pelanggan" | **M** |
| AD-164 | Catatan bertipe `warning` **muncul otomatis** sebagai peringatan di layar kasir saat pelanggan itu check-in | **S** |
| AD-165 | **Blacklist** dengan alasan wajib, dicatat siapa dan kapan. Pelanggan blacklist tidak bisa membuat booking online baru dan ditandai merah di layar kasir | **M** |
| AD-166 | Blacklist hanya oleh manajer/owner; kasir hanya bisa **mengusulkan** (membuat catatan `warning` + notifikasi ke manajer) | **M** |
| AD-167 | Pesan penolakan untuk pelanggan blacklist bersifat netral ("silakan hubungi kami untuk memesan"), **jangan** menyatakan bahwa mereka di-blacklist — menghindari konfrontasi di venue | **M** |
| AD-168 | Cabut blacklist dengan alasan, tercatat di audit log | **M** |
| AD-169 | Penggabungan duplikat pelanggan (satu orang, dua nomor HP) | **S** |
| AD-170 | Flag repeat no-show otomatis (≥3× dalam 90 hari) → wajib bayar penuh di muka, tidak boleh DP | **C** |
| AD-171 | Segmentasi pelanggan untuk broadcast (belum datang 30 hari, ulang tahun bulan ini, top 20 LTV) | **C** |
| AD-172 | Consent marketing terpisah dari consent transaksional; broadcast promosi hanya ke yang `marketing_consent = true` | **S** |
| AD-173 | Membership prepaid dengan saldo & poin | **C** |
| AD-174 | Export data pelanggan (owner saja, tercatat sebagai `data.export` di audit log) | **S** |

---

### 4.11 Ringkasan Prioritas Seksi 4

| MoSCoW | Jumlah ID | Cakupan |
|---|---|---|
| **Must (M)** | 104 | RBAC & penegakan RLS, papan meja live + timer + notifikasi, walk-in dalam sistem yang sama, manajemen meja & maintenance, rate card engine + preview + snapshot harga, CRUD menu + sold-out, booking manual lengkap, pencatatan cash/EDC + shift + struk bernomor, audit log append-only + laporan aktivitas sensitif, jam operasional & pajak konfigurabel, pencarian & blacklist pelanggan |
| **Should (S)** | 40 | KDS terpisah, editor denah drag-and-drop, Web Push, penjadwalan menu, PIN aksi cepat, e-receipt, versioning teks kebijakan, banner promo, penggabungan duplikat pelanggan |
| **Could (C)** | 19 | Sinkronisasi offline dua arah, waitlist, varian & modifier menu, paket durasi, rekonsiliasi settlement, segmentasi pelanggan, membership prepaid |
| **Won't now (W)** | 11 | Peran kustom granular, manajemen stok & COGS, simulasi dampak tarif, deteksi anomali kecurangan, kontrol lampu meja, multi-cabang, Iris/Payout API |

**Tiga hal di seksi ini yang paling sering diremehkan dan paling mahal kalau dilewat:**

1. **Walk-in wajib masuk sistem (AD-86, AD-87).** Ini bukan fitur, ini prasyarat. Tanpa penegakan SOP, exclusion constraint di database menjaga sesuatu yang tidak mencerminkan kenyataan lantai.
2. **Pencatatan cash & EDC (AD-114 s/d AD-127).** Tanpa ini, dashboard keuangan menampilkan sebagian kecil omzet dan pemilik akan berhenti mempercayainya dalam bulan pertama — persis skenario kegagalan yang paling ingin dihindari.
3. **Snapshot harga (AD-59, AD-80).** Perubahan tarif yang retroaktif merusak laporan keuangan dan menciptakan sengketa dengan pelanggan yang sudah membayar. Satu kolom `price_locked`, diputuskan hari ini, menghindari perbaikan data manual berbulan-bulan kemudian.