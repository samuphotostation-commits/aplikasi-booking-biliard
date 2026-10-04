> **LAMPIRAN TEKNIS — bukan dokumen keputusan.**
> Jika isi berkas ini bertentangan dengan `PRD-SPL-BOOKING.md`, **PRD master yang menang.**
> Registri Keputusan Kanonik (§4) dan Konstanta Global (§5) di PRD master mengesampingkan angka apa pun di sini.

## 7. Design System & Spesifikasi UI

### 7.0 Prinsip yang mengikat seluruh seksi ini

| ID | Prinsip | Konsekuensi konkret |
|---|---|---|
| `DS-00a` | **Gelap adalah default, bukan opsi.** Venue biliar gelap; amber #F0A202 mencapai kontras 9.25 (AAA) di atas near-black #0B0B0C tetapi hanya 2.13 (gagal total) di atas putih. | `:root` = tema gelap. Tema terang hanya diaktifkan lewat toggle eksplisit (`[data-theme="light"]`), **bukan** lewat `prefers-color-scheme`. |
| `DS-00b` | **Token dulu, komponen kemudian.** Tidak ada nilai hex, px, atau ms yang ditulis langsung di komponen. | Code review menolak PR yang memuat literal warna/spacing di luar file token. |
| `DS-00c` | **Satu shell, dua sub-merek.** SPL dan SMOKEHOUSE berbagi seluruh token, komponen, dan navigasi. | Lihat §7.1. |
| `DS-00d` | **Mobile-first harfiah.** Layout dirancang pada lebar 360 px lebih dulu, desktop adalah progressive enhancement. | Tidak ada komponen yang hanya berfungsi dengan hover. |
| `DS-00e` | **Kontras diukur, tidak dikira-kira.** Setiap pasangan warna teks/latar baru wajib diukur sebelum masuk token. | Lihat tabel §7.2.5 dan daftar "belum diukur" §7.2.6. |
| `DS-00f` | **Angka uang tidak pernah animasi count-up.** Uang tampil langsung, final, tabular. | Lihat §7.12. |

---

### 7.1 Arsitektur Dua Sub-Merek dalam Satu Shell

Venue punya dua identitas: **SPL — SPORTS POOL LOUNGE** (biliar) dan **SMOKEHOUSE RESTO** (F&B). Bahaya desain di sini adalah membuat aplikasi terasa seperti dua aplikasi yang dijahit, atau sebaliknya melebur keduanya sampai identitas hilang.

**Aturan pemisahan (`DS-01`):** sub-merek **hanya boleh** mengubah tiga hal. Selain tiga hal ini, semua identik.

| Yang boleh berubah per sub-merek | Yang **tidak boleh** berubah |
|---|---|
| 1. **Lockup di header seksi** (wordmark SPL vs SMOKEHOUSE, keduanya SVG, Lido STF) | Warna tombol CTA — **selalu amber #F0A202 dengan teks #0B0B0C**, di seluruh aplikasi |
| 2. **Satu token aksen seksi** `--accent-section`: amber untuk SPL, brick maroon #992212 untuk SMOKEHOUSE | Latar aplikasi, skala netral, radius, spacing, tipografi, komponen |
| 3. **Tekstur hero seksi**: gelap/felt untuk SPL, BRICKS untuk SMOKEHOUSE | Navigasi bawah, pola interaksi, bahasa status |

**Alasan aturan CTA (`DS-02`):** aplikasi ini memindahkan uang. Kalau tombol "Bayar" berwarna amber di halaman booking dan maroon di halaman F&B, pelanggan harus belajar dua kali. Satu warna aksi = satu kebiasaan. Maroon berperan sebagai **warna wilayah** (header band, chip kategori menu, latar banner danger), bukan warna aksi.

**Implementasi:**

```html
<main data-section="spl">      <!-- --accent-section: var(--c-amber-500) -->
<main data-section="smokehouse"> <!-- --accent-section: var(--c-maroon-500) -->
```

Perpindahan seksi ditandai oleh **band header setinggi 56 px** dengan warna `--accent-section` dan wordmark SVG di dalamnya, bukan oleh perubahan warna seluruh halaman. Saat pelanggan menambah F&B ke booking biliar (alur `UX-11`), band berubah dari amber ke maroon selama satu langkah, lalu kembali. Ini memberi sinyal "kamu sekarang di dapur" tanpa memaksa ganti aplikasi.

---

### 7.2 Design Token — Warna

#### 7.2.1 Warna merek (terverifikasi dari sampling piksel file logo)

| Token | Hex | Peran |
|---|---|---|
| `--c-amber-500` | **#F0A202** | Warna merek utama. CTA, aksen, highlight, ring fokus, angka penting |
| `--c-maroon-500` | **#992212** | Warna wilayah SMOKEHOUSE, latar lockup, latar banner danger |
| `--c-ink` | **#0B0B0C** | Near-black. Latar dasar tema gelap **dan** warna teks di atas amber |

Turunan operasional (dibuat dari dua warna merek, bukan warna baru):

| Token | Hex | Peran | Catatan kontras |
|---|---|---|---|
| `--c-amber-400` | #FFB627 | Hover tombol amber | Lebih terang dari #F0A202 → kontras terhadap teks #0B0B0C **naik** dari 9.25, aman tanpa pengukuran ulang |
| `--c-amber-600` | #C98502 | Pressed, border amber, garis grafik | Belum diukur — **hanya untuk fill/border, dilarang untuk teks** |
| `--c-maroon-400` | #B93A26 | Border/hover pada permukaan maroon | Belum diukur — dekoratif saja |
| `--c-maroon-600` | #7A1B0E | Pressed pada permukaan maroon | Belum diukur — dekoratif saja |

#### 7.2.2 Skala netral gelap (permukaan)

| Token | Hex | Peran |
|---|---|---|
| `--c-bg-base` | #0B0B0C | Latar halaman |
| `--c-surface-1` | #141416 | Kartu, sheet, header |
| `--c-surface-2` | #1C1C1F | Kartu di dalam kartu, input field, baris tabel selang-seling |
| `--c-surface-3` | #26262A | Skeleton, track slider, chip disabled |
| `--c-border-subtle` | #2E2E33 | Garis pemisah, border kartu |
| `--c-border-strong` | #3F3F46 | Border input, border tabel data |

**Aturan `DS-03`:** teks body hanya boleh berada di atas `--c-bg-base` atau `--c-surface-1`. Kontras `#FFFFFF`, `#A1A1AA`, dan `#F0A202` sudah diukur pada kedua permukaan itu. `--c-surface-2` dan `--c-surface-3` adalah permukaan **kontrol dan dekorasi** (input, skeleton, track), bukan permukaan bacaan panjang.

#### 7.2.3 Warna semantik (dipilih agar harmonis dengan palet hangat, semua diukur di atas #0B0B0C)

| Token | Hex | Rasio di #0B0B0C | Peran |
|---|---|---|---|
| `--c-success-text` | #4ADE80 | **11.29** AAA | Teks & ikon sukses, label "KOSONG" |
| `--c-success-solid` | #22C55E | **8.63** AAA | Fill badge, titik status, garis grafik |
| `--c-danger-text` | #F87171 | **7.11** AAA | Teks & ikon bahaya |
| `--c-danger-solid` | #EF4444 | **5.23** AA | Fill badge destruktif |
| `--c-warning` | #FBBF24 | **11.79** AAA | Teks & ikon peringatan |
| `--c-info` | #60A5FA | **7.74** AAA | Teks & ikon informasi, status reservasi mendatang |

**Aturan `DS-04` — konflik amber vs warning.** `#FBBF24` (warning) dan `#F0A202` (merek) berdekatan secara hue. Untuk mencegah pelanggan salah membaca peringatan sebagai ajakan bertindak:
- `--c-warning` **dilarang** dipakai sebagai fill tombol. Selamanya.
- Peringatan selalu tampil sebagai **teks + ikon segitiga**, di atas `--c-surface-1`, dengan border kiri 3 px `--c-warning`.
- Amber `--c-amber-500` **dilarang** dipakai untuk ikon status non-aksi kecuali status "sedang ditahan" (§7.7), karena "ditahan" memang bermakna "ada aksi yang harus kamu selesaikan".

**Aturan `DS-05` — danger memakai maroon, bukan merah asing.** Banner destruktif (pembatalan, refund, gagal bayar) memakai latar `--c-maroon-500` dengan teks `#FFFFFF` (**8.10**, AAA) dan ikon `--c-danger-text`. Ini menjaga bahasa warna tetap di dalam palet merek: merah bata adalah warna venue, bukan merah generik bootstrap.

#### 7.2.4 Tema terang (opsional, untuk admin di ruang terang / cetak laporan)

| Token | Hex | Rasio | Peran |
|---|---|---|---|
| `--c-bg-base` | #FFFFFF | — | Latar |
| `--c-surface-1` | #F7F4EF | belum diukur | Kartu (warm off-white, bukan abu dingin) |
| `--c-text-primary` | #0B0B0C | **19.67** AAA | Teks utama |
| `--c-amber-ink` | **#8A5D02** | **5.76** AA | **Pengganti amber untuk semua teks/link di tema terang** |
| `--c-maroon-500` | #992212 | **8.10** AAA | Heading seksi, teks aksen |
| CTA | fill #F0A202 + teks #0B0B0C | **9.25** AAA | Tombol tetap amber, tetap teks near-black |

#### 7.2.5 Matriks kontras — angka terukur, aturan yang lahir darinya

| Kombinasi | Rasio | Verdict | Aturan mengikat |
|---|---|---|---|
| #F0A202 di atas #0B0B0C | **9.25** | AAA | Boleh untuk teks apa pun |
| #F0A202 di atas #141416 | **8.65** | AAA | Boleh untuk teks apa pun |
| #F0A202 di atas #992212 | **3.81** | **GAGAL** normal, AA besar saja | `DS-06`: amber di atas maroon **hanya** untuk logo, ikon besar, dan teks ≥24 px bold. Dilarang untuk label, harga, dan body |
| #FFFFFF di atas #992212 | **8.10** | AAA | Teks di permukaan maroon **wajib** putih |
| #0B0B0C di atas #F0A202 | **9.25** | AAA | Teks di atas tombol amber **wajib** near-black |
| #FFFFFF di atas #F0A202 | **2.13** | **GAGAL TOTAL** | `DS-07`: teks putih di atas amber **haram**, tanpa pengecualian, termasuk untuk ikon |
| #F0A202 di atas #FFFFFF | **2.13** | **GAGAL TOTAL** | `DS-08`: amber dilarang jadi warna teks di tema terang. Gunakan #8A5D02 |
| #8A5D02 di atas #FFFFFF | **5.76** | AA | Amber-ink tema terang |
| #992212 di atas #FFFFFF | **8.10** | AAA | Heading tema terang |
| #FFFFFF di atas #0B0B0C | **19.67** | AAA | Teks utama tema gelap |
| #A1A1AA di atas #0B0B0C | **7.68** | AAA | Teks sekunder tema gelap |
| #71717A di atas #0B0B0C | **4.07** | **GAGAL** normal, AA besar | `DS-09`: #71717A hanya untuk teks ≥18.66 px bold / ≥24 px regular, placeholder, dan elemen dekoratif. **Bukan** body text, **bukan** label form |
| #22C55E / #4ADE80 di #0B0B0C | 8.63 / **11.29** | AAA | Sukses |
| #EF4444 / #F87171 di #0B0B0C | 5.23 / **7.11** | AA / AAA | Bahaya — pakai #F87171 untuk teks |
| #FBBF24 di #0B0B0C | **11.79** | AAA | Peringatan |
| #60A5FA di #0B0B0C | **7.74** | AAA | Informasi |

#### 7.2.6 Warna yang BELUM diukur — wajib diverifikasi sebelum rilis

`DS-10`: berikut token yang dipakai tetapi rasionya belum dihitung. Semuanya **hanya boleh dipakai sebagai fill, border, atau dekorasi**, tidak boleh menjadi latar teks kecil, sampai diukur dan dicatat di dokumen ini.

`--c-amber-600` · `--c-maroon-400` · `--c-maroon-600` · `--c-surface-2` · `--c-surface-3` · `--c-border-subtle` · `--c-border-strong` · seluruh token tema terang selain yang tercantum di §7.2.4.

Alat verifikasi: axe DevTools / Chrome Lighthouse / kontras checker WebAIM. Hasil pengukuran ditulis balik ke tabel §7.2.5 sebelum go-live.

#### 7.2.7 Blok CSS custom properties — siap tempel

```css
/* ============================================================
   SPL DESIGN TOKENS v1.0
   Tema gelap = DEFAULT. Tema terang = opt-in via [data-theme="light"].
   Sengaja TIDAK memakai prefers-color-scheme: venue ini gelap.
   ============================================================ */
:root {
  /* ---- MEREK (terverifikasi dari file logo) ---- */
  --c-amber-500: #F0A202;
  --c-amber-400: #FFB627;   /* hover  */
  --c-amber-600: #C98502;   /* pressed/border — DILARANG untuk teks */
  --c-maroon-500: #992212;
  --c-maroon-400: #B93A26;
  --c-maroon-600: #7A1B0E;
  --c-ink:        #0B0B0C;

  /* ---- PERMUKAAN (tema gelap) ---- */
  --c-bg-base:     #0B0B0C;
  --c-surface-1:   #141416;
  --c-surface-2:   #1C1C1F;
  --c-surface-3:   #26262A;
  --c-border-subtle: #2E2E33;
  --c-border-strong: #3F3F46;

  /* ---- TEKS (rasio di atas --c-bg-base) ---- */
  --c-text-primary:   #FFFFFF;  /* 19.67 AAA */
  --c-text-secondary: #A1A1AA;  /*  7.68 AAA */
  --c-text-muted:     #71717A;  /*  4.07 — teks besar/placeholder saja */
  --c-text-on-amber:  #0B0B0C;  /*  9.25 AAA — SATU-SATUNYA teks di atas amber */
  --c-text-on-maroon: #FFFFFF;  /*  8.10 AAA */
  --c-text-brand:     #F0A202;  /*  9.25 AAA di atas base */

  /* ---- SEMANTIK ---- */
  --c-success-text:  #4ADE80;  /* 11.29 */
  --c-success-solid: #22C55E;  /*  8.63 */
  --c-danger-text:   #F87171;  /*  7.11 */
  --c-danger-solid:  #EF4444;  /*  5.23 */
  --c-warning:       #FBBF24;  /* 11.79 — DILARANG jadi fill tombol */
  --c-info:          #60A5FA;  /*  7.74 */

  /* ---- AKSEN SEKSI (di-override oleh [data-section]) ---- */
  --accent-section: var(--c-amber-500);

  /* ---- RADIUS ---- */
  --r-0:   0px;
  --r-xs:  4px;    /* badge, tag kecil */
  --r-sm:  8px;    /* input, chip, tombol kecil */
  --r-md:  12px;   /* tombol, kartu kecil */
  --r-lg:  16px;   /* kartu meja, kartu menu */
  --r-xl:  20px;   /* bottom sheet, modal */
  --r-2xl: 28px;   /* hero card */
  --r-pill: 999px; /* chip tanggal, status badge */

  /* ---- SPACING (basis 4 px) ---- */
  --s-0:  0px;    --s-1:  4px;   --s-2:  8px;   --s-3: 12px;
  --s-4: 16px;    --s-5: 20px;   --s-6: 24px;   --s-8: 32px;
  --s-10:40px;    --s-12:48px;   --s-16:64px;   --s-20:80px;

  /* ---- SHADOW & GLOW ----
     Di latar near-black, drop shadow hampir tak terlihat.
     Elevasi dibangun dari border + inner highlight, bukan bayangan. */
  --sh-0: none;
  --sh-1: 0 1px 0 0 rgba(255,255,255,.04) inset,
          0 1px 2px rgba(0,0,0,.6);
  --sh-2: 0 1px 0 0 rgba(255,255,255,.05) inset,
          0 6px 16px -6px rgba(0,0,0,.75);
  --sh-3: 0 1px 0 0 rgba(255,255,255,.06) inset,
          0 18px 40px -12px rgba(0,0,0,.85);
  --glow-amber: 0 0 0 1px var(--c-amber-500),
                0 0 28px -8px rgba(240,162,2,.55);
  --glow-danger: 0 0 0 1px var(--c-danger-solid),
                 0 0 28px -8px rgba(239,68,68,.45);
  --ring-focus: 0 0 0 2px var(--c-bg-base), 0 0 0 4px var(--c-amber-500);
  --ring-focus-on-amber: 0 0 0 2px var(--c-amber-500), 0 0 0 4px var(--c-ink);

  /* ---- MOTION ---- */
  --dur-instant: 80ms;
  --dur-fast:   140ms;
  --dur-base:   220ms;
  --dur-slow:   320ms;
  --dur-sheet:  380ms;
  --ease-out:    cubic-bezier(0.16, 1, 0.30, 1);   /* expo-out, default */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-in:     cubic-bezier(0.55, 0, 1, 0.45);

  /* ---- Z-INDEX ---- */
  --z-base: 0;      --z-sticky: 100;  --z-header: 200;
  --z-overlay: 300; --z-drawer: 310;  --z-sheet: 320;
  --z-modal: 400;   --z-toast: 500;   --z-envbanner: 900;

  /* ---- LAYOUT ---- */
  --container-max: 480px;   /* konten pelanggan tetap satu kolom di desktop */
  --container-admin: 1440px;
  --tap-min: 44px;
  --tap-primary: 48px;
  --bottomnav-h: 64px;
  --safe-b: env(safe-area-inset-bottom, 0px);
}

[data-section="smokehouse"] { --accent-section: var(--c-maroon-500); }
[data-section="spl"]        { --accent-section: var(--c-amber-500); }

/* ============================================================
   TEMA TERANG — opt-in. Amber DILARANG jadi warna teks di sini.
   ============================================================ */
[data-theme="light"] {
  --c-bg-base:   #FFFFFF;
  --c-surface-1: #F7F4EF;   /* warm off-white, bukan abu dingin */
  --c-surface-2: #EFE9E1;
  --c-surface-3: #E4DCD1;
  --c-border-subtle: #DED5C9;
  --c-border-strong: #B9AC9B;

  --c-text-primary:   #0B0B0C;  /* 19.67 AAA */
  --c-text-secondary: #44444B;  /* BELUM DIUKUR — verifikasi sebelum rilis */
  --c-text-muted:     #6B6B73;  /* BELUM DIUKUR */
  --c-text-brand:     #8A5D02;  /* 5.76 AA — pengganti amber untuk teks */

  --c-success-text: #15803D;    /* BELUM DIUKUR */
  --c-danger-text:  #B91C1C;    /* BELUM DIUKUR */
  --c-warning:      #92400E;    /* BELUM DIUKUR */
  --c-info:         #1D4ED8;    /* BELUM DIUKUR */

  --sh-1: 0 1px 2px rgba(11,11,12,.08);
  --sh-2: 0 6px 16px -6px rgba(11,11,12,.16);
  --sh-3: 0 18px 40px -12px rgba(11,11,12,.22);
  --ring-focus: 0 0 0 2px #FFFFFF, 0 0 0 4px #8A5D02;
}

/* CTA identik di kedua tema: fill amber, teks near-black. */
.btn-primary {
  background: var(--c-amber-500);
  color: var(--c-text-on-amber);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-instant: 1ms; --dur-fast: 1ms; --dur-base: 1ms;
    --dur-slow: 1ms;    --dur-sheet: 1ms;
  }
}
```

---

### 7.3 Design Token — Radius, Spacing, Shadow, Motion (tabel referensi)

| Kategori | Token | Nilai | Dipakai di |
|---|---|---|---|
| Radius | `--r-xs` … `--r-pill` | 4 / 8 / 12 / 16 / 20 / 28 / 999 px | badge → chip → tombol → kartu → sheet → hero → pill |
| Spacing | `--s-1` … `--s-20` | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 | padding kartu = `--s-4`; gap grid slot = `--s-2`; margin seksi = `--s-8` |
| Shadow | `--sh-1/2/3` | inset highlight + drop | kartu / sheet / modal |
| Glow | `--glow-amber` | ring 1 px + blur amber | slot terpilih, kartu meja aktif, countdown <60 s |
| Fokus | `--ring-focus` | 2 px offset gelap + 2 px amber | semua elemen fokusable |
| Durasi | 80 / 140 / 220 / 320 / 380 ms | | tap feedback / hover / transisi umum / drawer / bottom sheet |
| Easing | `--ease-out` (default) | `cubic-bezier(.16,1,.3,1)` | masuk elemen |
| Easing | `--ease-in` | `cubic-bezier(.55,0,1,.45)` | keluar elemen |
| Spring (framer) | `{ type:"spring", stiffness:420, damping:34, mass:.9 }` | | drawer, sheet, kartu terpilih |

**Aturan `DS-11`:** durasi >400 ms dilarang untuk apa pun yang berada di jalur transaksi (pilih slot → checkout → bayar). Setiap 100 ms animasi di jalur itu adalah 100 ms yang membuat pelanggan ragu.

---

### 7.4 Sistem Tipografi

#### 7.4.1 Peran tiap font

| Font | File tersedia | Peran | Batas keras |
|---|---|---|---|
| **Lido STF** | `.otf`/`.ttf` saja — **tidak ada format web**, wajib dikonversi. Varian: Regular, Bold, BoldItalic, Cond, CondBold, Italic | Wordmark, heading H1–H2, judul layar, nama menu premium | **Dilarang** untuk teks <18 px dan untuk paragraf >2 baris |
| **Emoland** | `.otf`/`.ttf`/`.woff` — **tidak ada `.woff2`**. 9 weight + 10 italic = 19 file; 1 weight `.woff` = 65–72 KB; kalau dimuat semua >1 MB | Angka besar (countdown, total harga, KPI dashboard), label uppercase kondensasi (chip jam, status badge, nomor meja) | **Dilarang** untuk kalimat. Minimum 13 px dengan `letter-spacing: .08em`. Di bawah 13 px, fallback ke font body |
| **Jazzbury** | sudah punya `.woff2` (1 file) | Aksen dekoratif: tagline hero, kop empty state, label "Happy Hour", kartu ucapan/e-receipt | **Dilarang** di komponen UI, form, tabel, dan navigasi. Maksimal **satu** pemakaian per layar. Lazy-load |
| **Font body** (rekomendasi baru) | — | Seluruh teks UI: body, label form, tabel, tombol, harga di daftar, angka kecil | Wajib punya `tabular-nums` |

#### 7.4.2 Rekomendasi font body — keputusan dan alasannya

`DS-12`: **font body = system UI stack, bukan webfont.**

```css
--font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, "Noto Sans", sans-serif;
```

Alasan, berurutan dari yang paling menentukan:

1. **0 KB dan 0 ms.** Tidak ada request, tidak ada FOUT/FOIT, teks tampil di frame pertama. Pada 3G/4G lemah di venue Indonesia, ini keuntungan terbesar yang bisa diambil tanpa mengorbankan apa pun.
2. **Ketiga font merek memang tidak layak untuk teks kecil.** Lido adalah serif klasik (serif tipis hancur di 14 px pada layar Android 720p), Emoland kondensasi ekstrem (lebar huruf sempit → keterbacaan turun drastis di ukuran UI), Jazzbury script (mustahil dibaca sebagai body).
3. **Hasil akhirnya tetap on-brand.** Identitas SPL dibawa oleh warna, tekstur, wordmark Lido, dan angka Emoland — bukan oleh font paragraf. Roboto di Android dan SF di iOS keduanya grotesk netral yang menemani serif dengan baik.
4. **Konsistensi lintas perangkat tidak sepenting yang dikira** untuk teks 14–16 px. Yang dilihat pelanggan adalah harga, jam, dan tombol — dan tiga hal itu memakai Emoland/Lido/amber.

**Alternatif kalau pemilik menolak system stack** (`DS-12b`, **[PERLU KONFIRMASI]**): **Inter** (SIL OFL, gratis komersial), self-hosted, variable font subset Latin — target **≤26 KB woff2**. Jangan pakai Google Fonts CDN (request pihak ketiga + CSP tambahan untuk halaman pembayaran); host sendiri dari Cloudflare Pages.

#### 7.4.3 Skala tipografi

Root 16 px. Semua ukuran dalam `rem`. Kolom "mobile" adalah nilai default; kolom "≥768" hanya berlaku untuk layar admin dan hero.

| Token | Font | Mobile (size/line) | ≥768 | Weight | Letter-spacing | Pemakaian |
|---|---|---|---|---|---|---|
| `--t-display-1` | Lido STF Bold | 2.5rem / 2.75rem | 3.5rem / 3.75rem | 700 | -0.01em | Hero landing (SVG lebih disarankan) |
| `--t-display-2` | Lido STF Bold | 2rem / 2.375rem | 2.5rem / 2.875rem | 700 | -0.01em | Judul seksi besar |
| `--t-h1` | Lido STF Bold | 1.75rem / 2.125rem | 2rem / 2.5rem | 700 | -0.005em | Judul layar |
| `--t-h2` | Lido STF Bold | 1.375rem / 1.75rem | 1.5rem / 2rem | 700 | 0 | Judul kartu besar, nama kategori menu |
| `--t-h3` | body stack | 1.125rem / 1.5rem | 1.25rem / 1.75rem | 600 | 0 | Judul kartu, nama item menu |
| `--t-body-lg` | body stack | 1.0625rem / 1.625rem | — | 400 | 0 | Paragraf penting, deskripsi menu |
| `--t-body` | body stack | 1rem / 1.5rem | — | 400 | 0 | **Default seluruh UI** |
| `--t-body-sm` | body stack | 0.875rem / 1.25rem | — | 400 | 0 | Teks sekunder, helper form. **Ukuran teks terkecil yang diizinkan untuk informasi** |
| `--t-caption` | body stack | 0.75rem / 1rem | — | 500 | 0.01em | Hanya untuk metadata non-esensial (timestamp, ID transaksi) |
| `--t-num-xl` | Emoland Black | 3rem / 3rem | 4rem / 4rem | 900 | 0.01em | **Countdown pembayaran** |
| `--t-num-lg` | Emoland Bold | 2rem / 2.125rem | 2.5rem / 2.625rem | 700 | 0.01em | Total harga, KPI dashboard |
| `--t-num-md` | Emoland Bold | 1.375rem / 1.5rem | — | 700 | 0.01em | Harga per slot, nomor meja di kartu |
| `--t-label` | Emoland SemiBold | 0.8125rem / 1rem | — | 600 | 0.08em, UPPERCASE | Chip jam, status badge, header tabel |
| `--t-script` | Jazzbury | 1.75rem / 2.25rem | 2.25rem / 2.75rem | 400 | 0 | Aksen dekoratif, maks 1× per layar |

**Aturan tambahan:**
- `DS-13`: seluruh angka uang dan jam memakai `font-variant-numeric: tabular-nums`. Countdown yang lebarnya berubah tiap detik adalah cacat, bukan gaya.
- `DS-14`: `<input>` minimal `font-size: 1rem` (16 px). Di bawah itu iOS Safari melakukan auto-zoom saat fokus dan merusak layout checkout.
- `DS-15`: panjang baris paragraf maksimal 68 karakter (`max-width: 34rem`).

#### 7.4.4 Strategi webfont, subsetting, dan `@font-face`

Kondisi awal yang harus diperbaiki:

| Masalah terukur | Konsekuensi | Tindakan |
|---|---|---|
| Lido STF tidak punya format web sama sekali | Tidak bisa dipakai di web tanpa konversi | Konversi `.otf` → `.woff2` |
| Emoland tidak punya `.woff2`; `.woff` = 65–72 KB/weight; 19 file | Kalau naif dimuat semua, >1 MB font | Ambil **maksimal 2 weight**, konversi ke `.woff2`, subset agresif |
| Jazzbury sudah `.woff2` | Aman | Lazy-load |

`DS-16` — **anggaran font total ≤ 90 KB untuk seluruh aplikasi.**

| File yang dimuat | Subset | Target ukuran |
|---|---|---|
| `LidoSTF-Bold.subset.woff2` | Latin + angka + tanda baca | **≤ 25 KB** |
| `LidoSTF-Regular.subset.woff2` (opsional, hanya jika dipakai) | idem | ≤ 25 KB |
| `Emoland-Bold.subset.woff2` | **angka + A–Z + a–z + `.,:-/%()Rp` saja** | **≤ 14 KB** |
| `Emoland-Black.subset.woff2` | **angka + `:.` saja** (khusus countdown) | **≤ 8 KB** |
| `Jazzbury.subset.woff2` | Latin dasar, **lazy** | ≤ 18 KB, tidak dihitung di first load |
| Lido Cond / CondBold | **Tidak dimuat.** Wordmark dijadikan SVG | 0 KB |

Perintah subsetting konkret (`fonttools`):

```bash
# Lido STF Bold — heading
pyftsubset LidoSTFBold.otf \
  --output-file=LidoSTF-Bold.subset.woff2 --flavor=woff2 \
  --layout-features='kern,liga' --no-hinting --desubroutinize \
  --unicodes="U+0020-007E,U+00A0,U+00B0,U+00E9,U+2013,U+2014,U+2018-201A,U+201C-201E,U+2022,U+2026"

# Emoland Bold — label & angka
pyftsubset Emoland-Bold.ttf \
  --output-file=Emoland-Bold.subset.woff2 --flavor=woff2 \
  --layout-features='kern,tnum' --no-hinting \
  --unicodes="U+0020,U+0025,U+0028-0029,U+002C-002F,U+0030-003A,U+0041-005A,U+0061-007A"

# Emoland Black — HANYA angka & titik dua untuk countdown
pyftsubset Emoland-Black.ttf \
  --output-file=Emoland-Black.subset.woff2 --flavor=woff2 \
  --layout-features='tnum' --no-hinting \
  --unicodes="U+0030-0039,U+003A,U+002E,U+0020"
```

```css
@font-face {
  font-family: "Lido STF";
  src: url("/fonts/LidoSTF-Bold.subset.woff2") format("woff2");
  font-weight: 700; font-style: normal;
  font-display: swap;
  /* Kurangi CLS saat swap dari fallback serif */
  size-adjust: 100%; ascent-override: 92%; descent-override: 24%;
}
@font-face {
  font-family: "Emoland";
  src: url("/fonts/Emoland-Bold.subset.woff2") format("woff2");
  font-weight: 700; font-style: normal; font-display: swap;
}
@font-face {
  font-family: "Emoland Display";
  src: url("/fonts/Emoland-Black.subset.woff2") format("woff2");
  font-weight: 900; font-style: normal; font-display: block; /* countdown: jangan tampil dua kali */
}
@font-face {           /* dimuat lewat CSS halaman yang memakainya saja */
  font-family: "Jazzbury";
  src: url("/fonts/Jazzbury.subset.woff2") format("woff2");
  font-weight: 400; font-display: optional;
}
:root {
  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --font-head: "Lido STF", Georgia, "Times New Roman", serif;
  --font-num:  "Emoland", var(--font-body);
  --font-num-display: "Emoland Display", "Emoland", var(--font-body);
  --font-script: "Jazzbury", cursive;
}
```

Hanya **dua** file yang di-`preload`:

```html
<link rel="preload" as="font" type="font/woff2" crossorigin
      href="/fonts/LidoSTF-Bold.subset.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin
      href="/fonts/Emoland-Bold.subset.woff2">
```

`DS-17` — **[PERLU KONFIRMASI] lisensi webfont.** Folder `FONT/lido-stf/` berisi berkas `sharefonts.net.txt`. Lisensi *desktop* tidak otomatis mencakup *webfont embedding*, dan aplikasi ini akan berbentuk situs publik komersial. Sebelum konversi `.woff2` dilakukan, pemilik wajib memastikan lisensi Lido STF (dan Emoland) mencakup pemakaian web. Jika tidak: (a) beli lisensi webfont, atau (b) **jadikan seluruh pemakaian Lido sebagai SVG** (wordmark + maksimal 3 judul statis) dan pakai serif fallback untuk heading dinamis. Opsi (b) berbiaya nol dan justru menghemat 50 KB.

---

### 7.5 Tekstur dan Aset Gambar

#### 7.5.1 Kondisi aset saat ini — terukur

| File | Dimensi | Ukuran | Masalah |
|---|---|---|---|
| `TEXTURE/BRICKS.png` | 1920 × 1080 | **4,9 MB** | PNG untuk tekstur fotografis = format salah. Sendirian sudah melebihi anggaran seluruh halaman |
| `TEXTURE/yan-ots-…unsplash.jpg` (beton) | 3024 × 4032 | **3,7 MB** | Resolusi kamera mentah, 4× lebih besar dari kebutuhan layar |
| `LOGO/SPL LOGO 3.png` | 8854 × 2886 | 428 KB | Bitmap raksasa untuk artwork datar |
| `LOGO/SPL LOGO UTAMA (2).png` | 5667 × 5668 | 372 KB | idem |
| `LOGO/SMOKEHOUSE LOGO UTAMA (2).png` | 8375 × 1370 | 370 KB | idem |
| `LOGO/LOGOGRAM.png` | 2325 × 2046 | 249 KB | idem |
| `LOGO/SPL.png` | 1080 × 1080 | 54 KB | Cocok jadi basis ikon PWA |
| **Total mentah** | | **± 11 MB** | Tidak layak dikirim ke koneksi mobile Indonesia |

#### 7.5.2 Target optimasi — angka mengikat

`AST-01` — **anggaran gambar first load halaman pelanggan ≤ 180 KB.** Semua di luar itu lazy-load.

| Aset | Format target | Dimensi render | Target ukuran |
|---|---|---|---|
| Tekstur bata — **tile seamless** (dipakai `background-repeat`) | AVIF + WebP fallback | 512 × 512 | **AVIF ≤ 28 KB · WebP ≤ 45 KB** |
| Tekstur bata — hero full-bleed (kalau tile tidak memadai) | AVIF + WebP | 1600 × 900 | **AVIF ≤ 80 KB · WebP ≤ 130 KB** |
| Tekstur beton | AVIF grayscale | 800 × 800 tile | **≤ 22 KB** |
| Wordmark SPL | **SVG** (vektorisasi ulang, bukan trace bitmap) | vektor | **≤ 6 KB setelah SVGO** |
| Wordmark SMOKEHOUSE | **SVG** | vektor | **≤ 6 KB** |
| Logogram (monogram + rak + stik + bola 8) | **SVG** | vektor | **≤ 12 KB** |
| Ikon PWA 192 / 512 / maskable-512 | PNG (dari SVG) | sesuai | ≤ 8 / 24 / 24 KB |
| Favicon | SVG + ICO 32px fallback | — | ≤ 2 KB |
| Foto menu F&B | AVIF, `loading="lazy"`, `decoding="async"` | 640 × 480 (kartu), 1024 × 768 (detail) | **≤ 45 KB / ≤ 90 KB per foto** |

`AST-02`: **semua logo wajib dijadikan SVG.** Artwork ini adalah bentuk datar dengan sedikit warna — persis kasus yang SVG selesaikan sempurna. Keuntungannya bukan hanya ukuran: SVG tajam di layar 3×, bisa diwarnai lewat `currentColor` (satu file untuk versi amber, putih, dan maroon), dan bisa di-inline sehingga menghilangkan satu request di jalur kritis.

`AST-03`: **foto menu tidak boleh disajikan dari Supabase Storage.** Kuota egress Supabase Free 5 GB/bulan akan habis dalam hitungan minggu. Semua gambar disajikan dari Cloudflare Pages / R2.

`AST-04`: pipeline build wajib memuat langkah kompresi otomatis (`sharp` / `squoosh-cli`) dan **gagal build** kalau ada aset di `/public/img` melebihi ambang di tabel di atas. Ini satu-satunya cara mencegah aset 5 MB masuk lagi enam bulan kemudian.

#### 7.5.3 Aturan pemakaian tekstur

| ID | Aturan |
|---|---|
| `AST-05` | Tekstur bata **hanya** di: (a) hero landing, (b) band header SMOKEHOUSE, (c) latar halaman konfirmasi booking, (d) latar empty state besar. Tidak di tempat lain |
| `AST-06` | Opacity bata **0,12–0,18** di atas `--c-bg-base`, dengan lapisan `linear-gradient` near-black dari bawah agar teks di atasnya tetap terbaca. Di band SMOKEHOUSE: bata `opacity .22` di atas `--c-maroon-500` dengan `mix-blend-mode: multiply` |
| `AST-07` | **Dilarang** ada teks body, tabel, angka harga, atau form di atas tekstur. Tekstur boleh berada di belakang wordmark, heading ≥24 px, dan ruang kosong saja |
| `AST-08` | Tekstur beton (abu #949494–#9C9C9C) opacity **0,05–0,08**, grayscale, hanya untuk latar panel admin dan Kitchen Display — memberi tekstur industrial tanpa mengganggu keterbacaan data |
| `AST-09` | Tekstur **dimatikan total** saat `prefers-reduced-transparency` atau saat perangkat melaporkan `deviceMemory ≤ 2` (Android kelas bawah) |
| `AST-10` | Tekstur di-load dengan `background-image` di CSS yang berada di luar critical CSS, sehingga first paint tidak menunggu tekstur |

```css
.hero-brick {
  position: relative;
  background-color: var(--c-bg-base);
}
.hero-brick::before {
  content: "";
  position: absolute; inset: 0;
  background-image: image-set(url("/img/brick-tile.avif") type("image/avif"),
                              url("/img/brick-tile.webp") type("image/webp"));
  background-size: 512px 512px;
  opacity: .15;
  pointer-events: none;
}
.hero-brick::after {           /* jaminan keterbacaan */
  content: "";
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(11,11,12,.35) 0%, rgba(11,11,12,.92) 78%);
  pointer-events: none;
}
```

---

### 7.6 Bahasa Warna Status Meja (aman untuk buta warna)

Konvensi industri (hijau/merah/kuning) sudah dikenal staf dan pelanggan Indonesia dari POS biliar lokal — dipertahankan, tetapi **hue disesuaikan ke palet hangat** dan **warna tidak pernah menjadi satu-satunya pembawa informasi**.

`DS-18` — **setiap status wajib membawa 4 penanda sekaligus: warna + ikon + pola isian + teks.** Deuteranopia (buta warna merah-hijau, ±8% pria) membuat hijau dan merah bisa terlihat identik; ikon dan pola-lah yang menyelamatkan.

| Status | Warna teks/border | Ikon | Pola isian | Label teks | Dipakai di |
|---|---|---|---|---|---|
| **Kosong** | `--c-success-text` #4ADE80 | Lingkaran outline (⬡ kosong) | Tanpa isian, border 1 px | `KOSONG` | Grid slot, kartu meja, live board |
| **Ditahan** (menunggu bayar) | `--c-amber-500` #F0A202 | Jam pasir | **Garis diagonal 45°** (`repeating-linear-gradient`, jarak 6 px) | `DIPROSES` | Grid slot, live board |
| **Dipakai** (sedang bermain) | `--c-danger-text` #F87171 | Bola 8 solid | **Isian solid** + border 2 px | `DIPAKAI · sisa 42m` | Kartu meja, live board |
| **Reservasi** (dibayar, belum datang) | `--c-info` #60A5FA | Kalender | **Titik-titik** (dotted 2 px) | `RESERVASI 20.00` | Kartu meja, live board |
| **Servis** | `--c-text-muted` #71717A | Kunci pas + silang | **Strip horizontal tipis**, saturasi 0 | `SERVIS` | Kartu meja, grid (tidak muncul di booking online) |
| **Lewat** | `--c-text-muted` #71717A pada `--c-surface-2` | — | Redup 45% | `—` + `text-decoration: line-through` | Grid slot |
| **Walk-in** (sesi offline oleh kasir) | `--c-maroon-400` | Orang berjalan | Isian solid maroon | `WALK-IN` | Live board & kartu meja **saja**, tidak pernah di sisi pelanggan |

Tambahan wajib:

- `DS-19`: setiap sel status membawa `aria-label` lengkap dalam Bahasa Indonesia, mis. `aria-label="Meja 3, jam 20.00 sampai 21.00, kosong, Rp 70.000"`. Screen reader tidak melihat warna.
- `DS-20`: pada layar Live Board admin tersedia toggle **"Mode Kontras Tinggi"** yang mengganti isian warna dengan pola + label teks besar saja. Berguna untuk layar TV murah di kasir yang reproduksi warnanya buruk.
- `DS-21`: legend status **selalu terlihat** di Live Board (bar tipis di bawah header), bukan disembunyikan di tooltip.

---

### 7.7 Katalog Komponen Inti

Notasi state: **D**=default, **H**=hover (desktop saja), **A**=active/pressed, **F**=focus-visible, **S**=selected, **X**=disabled, **L**=loading, **E**=error.

#### `CMP-01` Button

| Varian | D | H | A | F | X | L |
|---|---|---|---|---|---|---|
| **Primary** (CTA bayar/booking) | fill `--c-amber-500`, teks `#0B0B0C`, `--r-md`, tinggi 48 px, `--t-body` 600 | fill `--c-amber-400` (kontras teks naik) | fill `--c-amber-600`, `scale(.98)`, `--dur-instant` | `--ring-focus-on-amber` | fill `--c-surface-3`, teks `--c-text-muted`, `cursor:not-allowed`, **tetap dirender, tidak disembunyikan** | spinner 16 px near-black + label berubah jadi teks proses ("Membuat QR…"), lebar tombol **dikunci** agar layout tidak lompat |
| **Secondary** | transparan, border 1 px `--c-border-strong`, teks `--c-text-primary` | border `--c-amber-500`, teks `--c-amber-500` | `scale(.98)` | `--ring-focus` | border & teks `--c-text-muted` | idem |
| **Ghost** | transparan, teks `--c-text-secondary` | teks `--c-text-primary`, bg `--c-surface-2` | — | `--ring-focus` | teks `--c-text-muted` | — |
| **Destructive** | fill `--c-maroon-500`, teks `#FFFFFF` (8.10 AAA) | fill `--c-maroon-400` | fill `--c-maroon-600` | `--ring-focus` | `--c-surface-3` | idem |
| **Icon-only** | 44 × 44 min, radius `--r-pill` | bg `--c-surface-2` | — | `--ring-focus` | opacity .4 | — |

Aturan: tinggi minimum 44 px (`--tap-min`), CTA utama 48 px. Tombol full-width di mobile untuk aksi utama. **Dilarang** ada dua tombol Primary di satu viewport.

#### `CMP-02` Input (teks, email, nomor WA, angka)

| State | Spesifikasi |
|---|---|
| D | bg `--c-surface-2`, border 1 px `--c-border-strong`, radius `--r-sm`, tinggi 48 px, padding `--s-3`, `font-size: 1rem` (wajib, anti-zoom iOS) |
| Label | **selalu di atas field**, `--t-body-sm` 500, warna `--c-text-secondary`. Placeholder bukan pengganti label |
| H | border `--c-border-strong` → lebih terang |
| F | border `--c-amber-500` + `--ring-focus` |
| X | bg `--c-surface-1`, teks `--c-text-muted`, ikon gembok kecil |
| E | border `--c-danger-solid`, pesan error di bawah field `--t-body-sm` warna `--c-danger-text` + ikon segitiga, `aria-invalid="true"`, `aria-describedby` menunjuk pesan |
| L | shimmer skeleton pada field, atau spinner kanan-dalam untuk validasi async (mis. cek ketersediaan) |

Varian khusus: **Input nomor WhatsApp** dengan prefix `+62` yang tidak bisa dihapus, `inputmode="tel"`, auto-strip `0` di depan, dan contoh format di helper text.

#### `CMP-03` Select

Di mobile **tidak memakai `<select>` native yang dipoles**, tetapi memicu **Bottom Sheet** berisi daftar opsi (radio list, tinggi baris 48 px). Alasan: `<select>` native tidak bisa menampilkan harga/status per opsi, dan tampilannya tak terkendali. Di desktop (admin) memakai combobox custom dengan `role="listbox"`, navigasi panah, ketik-untuk-cari, Escape untuk tutup.

State: D / H (baris `--c-surface-2`) / S (checkmark amber + teks `--c-amber-500`) / X / L (3 skeleton row) / E (border merah pada trigger).

#### `CMP-04` Date Picker & Time Picker

**Date picker pelanggan = chip tanggal horizontal, bukan kalender.**

- Baris chip scroll horizontal, 14 hari ke depan, `scroll-snap-type: x mandatory`.
- Chip: lebar min 64 px, tinggi 64 px, radius `--r-lg`. Isi dua baris: label hari (`Sen`, `--t-label`) dan tanggal (`25`, `--t-num-md`).
- Label khusus: `HARI INI`, `BESOK`, lalu `Sen 25 Agu`.
- S: fill `--c-amber-500`, teks `#0B0B0C`, `--glow-amber`.
- X (hari lewat / venue tutup): `--c-surface-2`, teks `--c-text-muted`, ikon gembok, `aria-disabled`.
- Indikator ketersediaan mikro di bawah tiap chip: bar tipis 3 px yang panjangnya menunjukkan proporsi slot kosong (hijau → amber → merah). Ini membuat pelanggan langsung memilih hari yang longgar.

**Time picker** tidak berupa dropdown jam, melainkan **grid Slot Chip** (`CMP-06`).

**Admin date range picker** (dashboard keuangan): kalender dua bulan berdampingan di desktop, preset cepat (`Hari ini`, `Kemarin`, `7 hari`, `Bulan ini`, `Bulan lalu`, `Kustom`). Wajib menyertakan toggle **"Berdasarkan tanggal transaksi / tanggal settlement"** (FIN-08).

#### `CMP-05` Table Card (kartu meja)

Kartu representasi satu meja fisik.

```
┌──────────────────────────────┐
│ ▦ M-03            [DIPAKAI]  │  ← nomor meja (Emoland) + Status Badge
│ Meja Standar                 │  ← --t-body-sm, --c-text-secondary
│ ──────────────────────────── │
│ 20.00 – 22.00 · Budi S.      │  ← sesi aktif (hanya admin)
│ ⏱ sisa 42:17                 │  ← Emoland, warna status
│ ──────────────────────────── │
│ [Perpanjang]      [Tutup]    │  ← aksi (admin) / [Pilih] (pelanggan)
└──────────────────────────────┘
```

| State | Spesifikasi |
|---|---|
| D (kosong) | bg `--c-surface-1`, border 1 px `--c-border-subtle`, radius `--r-lg` |
| S (dipilih pelanggan) | border 2 px `--c-amber-500` + `--glow-amber`, checkmark amber di pojok kanan atas |
| Status dipakai | border kiri 4 px `--c-danger-text`, isian pola solid tipis |
| Status ditahan | border kiri 4 px `--c-amber-500`, pola diagonal |
| Status servis | seluruh kartu saturasi 0, opacity .55, ikon kunci pas, tidak bisa diklik |
| H | `translateY(-2px)`, `--sh-2` |
| L | Skeleton dengan bentuk kartu identik (tinggi tetap, tidak boleh berubah saat data masuk) |
| E | Kartu tetap ditampilkan dengan overlay "Data gagal dimuat" + tombol Coba Lagi. Jangan hilangkan kartunya |

Untuk pelanggan, versi kartu meja disederhanakan: nomor meja, tipe (Standar/VIP), harga/jam, status. **Tidak pernah menampilkan nama pemesan lain** — sesuai desain `get_availability()` yang secara struktural tidak mengembalikan `user_id`.

#### `CMP-06` Slot Chip (chip jam)

Elemen paling sering disentuh di aplikasi. Grid 3 kolom di mobile, gap `--s-2`.

```
┌──────────────┐
│    20.00     │  --t-label (Emoland)
│  Rp 70.000   │  --t-body-sm, tabular-nums
│   3 meja     │  --t-caption, --c-text-secondary
└──────────────┘
```

| State | Spesifikasi |
|---|---|
| D (kosong) | bg `--c-surface-1`, border 1 px `--c-border-subtle`, teks `--c-text-primary`, min-height 64 px |
| H | border `--c-amber-600` |
| S | fill `--c-amber-500`, semua teks `#0B0B0C`, `--glow-amber`, ikon centang kecil |
| Ditahan orang lain | pola diagonal amber, teks `--c-text-secondary`, label `DIPROSES`, tidak bisa diklik |
| Penuh | bg `--c-surface-2`, teks `--c-text-muted`, harga di-`line-through`, label `PENUH`, `aria-disabled="true"` |
| Lewat | opacity .4, tidak fokusable, `tabindex="-1"` |
| L | skeleton dengan tinggi 64 px identik |
| E (gagal hold) | shake 1× 160 px/s ringan + border `--c-danger-solid` 800 ms, lalu kembali ke D, disertai Toast "Slot baru saja diambil" |

`CMP-06a`: chip yang **penuh tetap ditampilkan**, tidak disembunyikan. Melihat mana yang penuh adalah informasi (dan social proof), bukan sampah.

#### `CMP-07` Timeline Ketersediaan

Pandangan horizontal 1 baris per meja × sumbu waktu 10.00–02.00. Dipakai di Admin Live Board dan (versi ringkas) di layar pilih meja desktop.

- Tinggi baris 44 px, sticky kolom kiri berisi kode meja.
- Sumbu waktu: tick tiap 1 jam (garis `--c-border-subtle`), tick tiap 30 menit (garis lebih redup).
- Blok booking: radius `--r-xs`, warna & pola menurut §7.6, label di dalam blok kalau lebar cukup (`20.00–22.00 Budi`), kalau sempit hanya warna + tooltip.
- **Garis "sekarang"**: vertikal 2 px `--c-amber-500` dengan bulatan di atas, bergerak tiap menit, `aria-hidden`.
- Scroll horizontal dengan `scroll-snap` per jam; posisi awal otomatis di jam sekarang minus 1 jam.
- Empty: "Belum ada booking hari ini" + garis waktu tetap digambar (jangan kosongkan kanvas).
- Error: pita merah di atas timeline, data terakhir yang ter-cache tetap ditampilkan dengan label "Data pukul 20.14 (offline)".

#### `CMP-08` Cart Drawer (keranjang)

Desktop: drawer kanan lebar 400 px. Mobile: **bottom sheet** full-width, tinggi maksimum 88 svh.

- Header: judul "Pesanan Kamu" + tombol tutup 44 px + jumlah item.
- Body scroll: daftar item (sesi biliar selalu di paling atas, dipisah divider dari item F&B), tiap baris punya stepper qty (−/angka/+, tombol 44 px), harga kanan tabular.
- Sesi biliar **tidak punya stepper**; punya tombol "Ubah" yang kembali ke pemilihan slot.
- Footer sticky: subtotal sesi, subtotal F&B, **baris pajak PBJT dengan persentasenya** (TAX-05), total besar `--t-num-lg` amber, tombol Primary full-width.
- **Dilarang** ada baris "biaya QRIS" / "biaya admin pembayaran" (PAY-01, larangan Bank Indonesia).
- Guard satu keranjang aktif (UX-13): kalau pelanggan memulai booking baru sementara ada keranjang aktif, tampilkan modal konfirmasi "Keranjang sebelumnya akan dihapus".
- State kosong: ikon logogram outline opacity .12, teks "Keranjang masih kosong", tombol "Lihat menu Smokehouse".
- State loading: skeleton 2 baris.
- State error harga berubah: banner amber di atas daftar "Harga slot berubah sejak kamu memilih. Total baru: Rp X" dengan tombol Terima/Batal — jangan pernah diam-diam mengubah total.

#### `CMP-09` Bottom Sheet

- Radius atas `--r-xl`, bg `--c-surface-1`, handle bar 36 × 4 px `--c-border-strong` di tengah atas.
- Overlay `rgba(11,11,12,.72)` + `backdrop-filter: blur(2px)` (dimatikan pada perangkat low-end).
- Masuk: spring `{stiffness:420,damping:34}`; keluar: `--dur-fast` `--ease-in`.
- Drag-to-dismiss dengan ambang 96 px atau velocity >500 px/s.
- Fokus di-trap; Escape menutup; `aria-modal="true"`, `role="dialog"`, `aria-labelledby` ke judul.
- Padding bawah wajib `calc(var(--s-6) + var(--safe-b))`.
- **Sheet tidak boleh dipakai untuk konfirmasi destruktif** — itu tugas Modal (`CMP-15`), karena sheet terlalu mudah tertutup tak sengaja.

#### `CMP-10` Toast

- Posisi mobile: **atas**, di bawah header (bukan bawah — bawah tertutup bottom nav dan sticky CTA). Desktop: kanan bawah.
- Lebar maks 420 px, radius `--r-md`, bg `--c-surface-2`, border kiri 3 px warna semantik, ikon 20 px, teks `--t-body-sm`.
- Durasi: info/sukses 4 s, error 8 s, error dengan aksi **tidak auto-dismiss**.
- Maksimal 3 toast bertumpuk; sisanya antre.
- `role="status"` untuk info/sukses, `role="alert"` untuk error.
- Toast **dilarang** menjadi satu-satunya tempat menyampaikan kegagalan pembayaran — itu harus muncul sebagai state halaman.

#### `CMP-11` Empty State

Struktur baku: ilustrasi logogram outline (opacity .12, maks 120 px) → judul `--t-h3` → satu kalimat penjelas `--t-body-sm` `--c-text-secondary` → satu tombol aksi → (opsional) satu baris aksen Jazzbury.

| Konteks | Judul | Aksi |
|---|---|---|
| Belum ada booking | "Belum ada booking" | "Cari meja kosong" |
| Slot habis di tanggal itu | "Semua meja penuh hari ini" | "Lihat besok" + "Masuk waitlist" (Fase 2) |
| Keranjang kosong | "Keranjang masih kosong" | "Lihat menu" |
| Riwayat kosong | "Belum ada riwayat" | "Booking pertama kamu" |
| Hasil filter kosong (admin) | "Tidak ada data pada rentang ini" | "Reset filter" |
| Offline tanpa cache | "Belum ada data tersimpan" | "Coba lagi" |

#### `CMP-12` Skeleton Loader

- Bentuk skeleton **wajib identik dimensinya** dengan konten aslinya (CLS = 0).
- Warna: `--c-surface-2` dengan sweep `--c-surface-3`, durasi 1200 ms linear.
- Pada `prefers-reduced-motion`, sweep dimatikan; skeleton menjadi blok statis.
- Batas: maksimal 6 skeleton row per daftar; sisanya cukup satu spinner di bawah.
- Skeleton **hanya** untuk load pertama. Refresh data yang sudah ada memakai indikator halus (bar 2 px di bawah header), bukan mengosongkan layar.

#### `CMP-13` Countdown Timer

Komponen paling kritis di jalur uang.

- Angka: `--t-num-xl` (Emoland Black), `tabular-nums`, format `MM:SS`.
- Sumber kebenaran: **`expires_at` dari server**, bukan durasi yang di-hardcode di client. Client menghitung `expires_at − now()` dan melakukan resinkronisasi tiap polling status. **[PERLU KONFIRMASI]** anggaran waktu final — riset pembayaran menyebut QRIS 15 menit / hold 17 menit, riset arsitektur data menyebut QRIS 8 / hold 10 / release 12. UI tidak terpengaruh pilihan mana pun **asalkan** tidak ada angka yang ditulis di client.
- Ambang visual:
  - `> 25%` sisa: warna `--c-text-primary`, ring progres `--c-amber-500`.
  - `≤ 25%` sisa: warna `--c-warning`.
  - `≤ 60 detik`: warna `--c-danger-text` + pulse `scale 1 → 1.03 → 1` tiap detik.
  - `00:00`: berganti menjadi state "QR kedaluwarsa" + tombol "Buat QR Baru".
- Ring progres melingkar di sekitar QR (stroke 4 px, `stroke-dasharray` animasi linear per detik).
- Aksesibilitas: elemen countdown `aria-hidden="true"`; pengumuman lewat elemen `aria-live="polite"` terpisah yang **hanya** bicara pada 5 menit, 2 menit, 1 menit, dan 10 detik. Screen reader yang membaca tiap detik adalah penyiksaan.
- Saat tab tidak aktif, timer tetap benar karena dihitung dari `expires_at`, bukan dari akumulasi `setInterval`.

#### `CMP-14` Status Badge

- Tinggi 24 px, radius `--r-pill`, padding `0 --s-2`, `--t-label`, ikon 12 px di kiri.
- Varian mengikuti tabel §7.6 (warna + ikon + teks, tiga penanda minimum).
- Varian pembayaran: `MENUNGGU BAYAR` (amber), `LUNAS` (hijau), `KEDALUWARSA` (muted), `DIBATALKAN` (maroon), `REFUND` (info).
- Badge **selalu** memuat teks. Badge titik-warna tanpa teks dilarang.

#### `CMP-15` Modal Konfirmasi

- Dipakai untuk aksi destruktif dan aksi yang butuh alasan (AD-09: pembatalan, refund, diskon manual, void item, override konflik walk-in, ubah harga).
- Struktur: judul `--t-h2` → kalimat konsekuensi konkret (bukan "Apakah Anda yakin?") → **field alasan wajib** untuk aksi sensitif → dua tombol (Ghost "Batal" kiri, Destructive kanan).
- Contoh judul yang benar: "Batalkan booking M-03 20.00 atas nama Budi?" dengan body "Slot akan langsung dilepas dan pelanggan menerima notifikasi. Refund diproses manual di Dashboard Midtrans."
- Tombol destruktif **disabled sampai field alasan terisi ≥10 karakter**.
- Untuk aksi paling berbahaya (hapus meja yang punya riwayat, ubah harga massal), tambahkan konfirmasi ketik-ulang kode (`Ketik M-03 untuk konfirmasi`).
- `role="alertdialog"`, fokus awal ke tombol Batal (bukan ke tombol destruktif), fokus trap, Escape = Batal.
- Overlay tidak menutup modal saat diklik (mencegah kehilangan input alasan).

---

### 7.8 Spesifikasi Layar per Layar

Notasi: `[H]` header, `[S]` sticky, `→` aksi.

---

#### `UI-01` Landing / Home

**Tujuan:** dalam 5 detik pengunjung tahu (a) ini tempat apa, (b) ada berapa meja kosong sekarang, (c) tombol untuk booking.

**Elemen atas → bawah:**
1. `[H]` Header transparan di atas hero: logogram SVG 32 px kiri, ikon profil/masuk kanan.
2. **Hero** tinggi 68 svh, latar bata (opacity .15 + gradient near-black), wordmark **SPL — SPORTS POOL LOUNGE** SVG, di bawahnya satu baris Jazzbury sebagai tagline (satu-satunya Jazzbury di layar ini).
3. **Kartu Status Live** (`UX-14`, `EX-13`) — elemen paling berharga di halaman ini:
   `6 dari 8 meja terisi` dengan 8 titik status berpola (§7.6), dan baris kedua `Slot kosong terdekat: 21.30`. Terhubung ke Supabase Realtime channel `availability:{business_date}`.
4. `[S]` **CTA Primary full-width** "Booking Meja Sekarang" — sticky di bawah begitu hero ter-scroll melewati 50%.
5. Strip **Happy Hour** (kalau aktif): band amber tipis, `HAPPY HOUR 11.00–17.00 · Rp 35.000/jam`, teks `#0B0B0C`.
6. Band **SMOKEHOUSE RESTO** (maroon + bata, `data-section="smokehouse"`): wordmark SVG + 3 kartu menu unggulan horizontal scroll → "Pesan Makanan" (Secondary, bukan Primary — satu Primary per layar).
7. Seksi **Jam Operasional & Lokasi**: jam buka, tombol `wa.me` untuk tanya, tombol peta.
8. Seksi **Kebijakan Pembatalan** ringkas (`UX-10`) — 3 baris, dengan link ke detail.
9. Footer: NPWPD, alamat, tautan syarat.

**Aksi utama:** Booking Meja Sekarang.

**Kondisi kosong/error:** kalau data status live gagal, kartu status berubah jadi "Status meja tidak tersedia saat ini" + tombol muat ulang — **hero dan CTA tetap tampil**. Kalau venue tutup (di luar jam operasional), CTA berubah jadi "Booking untuk Besok" dan kartu status menampilkan `TUTUP · Buka lagi 11.00`.

---

#### `UI-02` Pilih Tanggal & Meja

**Tujuan:** dari niat ke slot terpilih dalam ≤3 ketukan. Urutan **Tanggal → Jam → Meja** (`UX-01`).

**Elemen atas → bawah:**
1. `[H]` Back + judul "Pilih Jadwal" + ikon info (buka sheet kebijakan).
2. `[S]` **Chip tanggal** horizontal 14 hari (`CMP-04`) dengan bar ketersediaan mikro.
3. Filter tipe meja: segmented control `Semua · Standar · VIP`.
4. **Grid Slot Chip** (`CMP-06`), 3 kolom, dikelompokkan per label waktu: `SIANG (11.00–17.00)`, `SORE (17.00–20.00)`, `MALAM (20.00–02.00)` dengan header `--t-label`. Harga tampil di tiap chip → tarif dinamis jadi terlihat, dan happy hour laku.
5. Setelah satu slot dipilih → muncul **Denah Meja** (`UX-05`) inline di bawah grid, animasi expand: siluet meja biliar sederhana disusun sesuai layout venue asli, tiap meja adalah `CMP-05` versi ringkas. Meja penuh/servis tetap digambar dengan pola masing-masing.
6. `[S]` **Bottom Summary Bar**: `Sab 24 Agu · 20.00 · Meja 3 · Rp 70.000` + tombol Primary "Lanjut".

**Aksi utama:** pilih slot → pilih meja → Lanjut.

**Kondisi kosong/error:**
- Semua slot penuh di tanggal itu → Empty State "Semua meja penuh" + tombol "Lihat besok" + tampilkan tetap grid penuhnya (jangan kosongkan).
- Venue tutup di tanggal itu → chip tanggal disabled dengan ikon gembok; kalau tetap dibuka, tampilkan "Venue tutup pada tanggal ini".
- Gagal fetch → tampilkan grid skeleton + banner "Gagal memuat jadwal" + Coba Lagi. Kalau ada cache hari itu, tampilkan cache dengan label waktu ambil data.
- **Realtime patch:** saat broadcast `slot_changed` masuk, chip yang terpengaruh berubah state dengan crossfade `--dur-fast`, **tanpa** me-refetch dan **tanpa** menggeser layout.

---

#### `UI-03` Detail Slot & Durasi

**Tujuan:** tentukan durasi dan kunci harga sebelum masuk keranjang.

**Elemen atas → bawah:**
1. `[H]` Back + "Atur Durasi".
2. Kartu ringkas: Meja 3 · Standar · Sab 24 Agu · mulai 20.00.
3. **Slider durasi 1–4 jam** dengan step 30 menit (`UX-06`, `PR-01`–`PR-03`). Di bawah slider, chip cepat `1j · 2j · 3j`. Track `--c-surface-3`, fill `--c-amber-500`, thumb 28 px dengan ring near-black.
4. **Rincian harga per band waktu** — penting karena tarif melintasi time-band:
   `20.00–21.00 · Prime · Rp 70.000` / `21.00–22.00 · Prime · Rp 70.000`. Transparansi ini mencegah sengketa.
5. Peringatan konflik: kalau durasi yang dipilih menabrak booking berikutnya, slider terkunci di batas maksimum dan muncul baris info `--c-info`: "Meja ini sudah dibooking mulai 22.00. Maksimum 2 jam."
6. Kotak **Aturan Sesi** (`OPS-07`): "Sesi dihitung dari jam booking, bukan jam kedatangan. Datang maksimal 20.15." Ditampilkan **sebelum** bayar, bukan di e-receipt saja.
7. Cross-sell F&B (`UX-11`): kartu maroon "Sekalian pesan? Platter Smokehouse siap saat kamu datang" → membuka `UI-04` dengan konteks booking.
8. `[S]` Bottom bar: total `--t-num-lg` + "Tambah ke Keranjang".

**Kondisi kosong/error:** kalau slot terambil orang lain saat halaman ini terbuka (broadcast masuk), tampilkan **modal**: "Slot ini baru saja diambil" dengan 3 saran alternatif terdekat (meja lain jam sama, meja sama jam berikutnya) — jangan lempar pelanggan kembali ke halaman kosong.

---

#### `UI-04` Menu F&B (SMOKEHOUSE)

**Tujuan:** menambah item F&B, baik menyertai booking maupun berdiri sendiri.

**Elemen atas → bawah:**
1. `[H]` **Band maroon** dengan wordmark SMOKEHOUSE SVG (`data-section="smokehouse"`), tekstur bata multiply.
2. Konteks: kalau datang dari booking → pita amber tipis "Untuk booking Meja 3, Sab 24 Agu 20.00". Kalau berdiri sendiri → selector "Pesan untuk: Dine-in / Ambil sendiri" **[PERLU KONFIRMASI]** apakah takeaway dilayani.
3. `[S]` **Tab kategori** horizontal scroll: `Smokehouse · Snack · Nasi · Minuman · Kopi · Paket`. Tab aktif underline maroon 3 px.
4. Search field (muncul di ≥6 kategori).
5. **Daftar item**: kartu horizontal — foto 88 × 88 (AVIF, lazy), nama `--t-h3`, deskripsi 2 baris `--c-text-secondary`, harga `--t-num-md`, tombol tambah 44 × 44 di kanan yang berubah jadi stepper setelah ditambah.
6. Badge item: `HABIS` (muted, kartu saturasi 0, tidak bisa ditambah), `PEDAS` (ikon cabai), `FAVORIT` (amber).
7. `[S]` Bar keranjang mengambang: `3 item · Rp 145.000` → buka `CMP-08`.

**Kondisi kosong/error:** kategori kosong → "Menu kategori ini belum tersedia". Semua item habis → "Dapur sedang penuh, coba beberapa saat lagi". Gagal load foto → placeholder logogram outline di atas `--c-surface-2`, **jangan** kotak putih.

---

#### `UI-05` Keranjang & Checkout

**Tujuan:** gerbang wajib sebelum pembayaran (`UX-08`, pola Ringkasan Order TIX ID).

**Elemen atas → bawah:**
1. `[H]` Back + "Ringkasan Pesanan".
2. Blok **Sesi Biliar**: meja, tanggal, jam, durasi, harga terkunci + tombol "Ubah".
3. Blok **Makanan & Minuman**: daftar item + stepper + tombol "Tambah lagi".
4. Blok **Data Pemesan**: nama, email (dari akun), **nomor WhatsApp wajib** (`UX-16`), catatan opsional.
5. Blok **Rincian Biaya**:
   `Subtotal sesi` · `Subtotal F&B` · `PBJT 10%` (persentase wajib tampil, TAX-05) · `Total`.
   **Tidak ada baris biaya QRIS** (PAY-01).
   Harga tayang **tax-inclusive** (TAX-03) dengan pajak dirinci sebagai baris informasi.
6. Blok **Kebijakan Pembatalan** (`UX-10`) — teks penuh, bukan link, dengan checkbox "Saya mengerti kebijakan pembatalan" yang wajib dicentang.
7. `[S]` Bottom bar: total `--t-num-lg` amber + "Bayar dengan QRIS".

**Aksi utama:** Bayar dengan QRIS → membuat hold + charge.

**Kondisi kosong/error:**
- Keranjang kosong → Empty State + "Lihat jadwal".
- Slot hilang saat checkout (23P01) → modal "Slot baru saja diambil" + saran alternatif; keranjang F&B **dipertahankan**.
- Harga berubah → banner + tombol Terima/Batal.
- Gagal membuat QR (gateway down) → state halaman penuh, bukan toast: "Gagal menghubungi sistem pembayaran. Slot kamu masih ditahan sampai 20.12." + tombol Coba Lagi + tombol "Bayar di kasir" (menyimpan booking sebagai `hold` dengan catatan).

---

#### `UI-06` Halaman Pembayaran QRIS

**Tujuan:** pelanggan menyelesaikan pembayaran di HP-nya sendiri — masalah yang paling sering gagal karena QR tidak bisa discan dari layar yang sama.

**Elemen atas → bawah:**
1. Banner lingkungan (`--z-envbanner`): **hanya di build sandbox**, pita merah full-width "MODE UJI COBA — JANGAN BAYAR DENGAN UANG ASLI". Wajib, sesuai peringatan Midtrans bahwa referensi sandbox bisa identik dengan produksi.
2. `[H]` "Pembayaran" (tanpa tombol back — keluar lewat tombol eksplisit di bawah, agar tidak tak sengaja meninggalkan hold).
3. **Countdown** (`CMP-13`) `--t-num-xl` di tengah + ring progres melingkar mengelilingi QR.
4. **QR code** di atas kartu putih (QRIS wajib kontras tinggi; ini satu-satunya area putih besar di aplikasi gelap — dibingkai border amber 2 px agar tetap on-brand), ukuran 240 × 240 px minimum. Sumber: `actions[].url` Midtrans dipasang langsung sebagai `src` `<img>`.
5. **Tombol "Simpan QR ke Galeri"** (Secondary, full-width) — `PAY-09`, **wajib MVP**.
6. **Instruksi 3 langkah bernomor** di bawahnya: "1. Simpan QR · 2. Buka aplikasi e-wallet/m-banking → Scan → pilih ikon Galeri · 3. Pilih QR yang baru disimpan". Ditulis lengkap, bukan tooltip.
7. Nominal `--t-num-lg` amber + kode order kecil (`--t-caption`, bisa di-copy).
8. **Tombol "Saya sudah bayar"** (Ghost) — memicu cek status manual (`PAY-12`).
9. Indikator polling halus: titik amber berkedip + teks "Mengecek pembayaran…" (polling 3–5 detik, `PAY-11`).
10. Tombol Ghost "Batalkan pembayaran" di paling bawah → modal konfirmasi.

**Transisi sukses:** begitu status `settlement` terdeteksi (polling atau realtime), halaman **langsung** berganti ke `UI-07` tanpa refresh, dengan animasi ring amber menutup + checkmark.

**Kondisi kosong/error:**
- Countdown habis → seluruh area QR di-blur + overlay "QR kedaluwarsa" + tombol "Buat QR Baru" (yang membuat `order_id` attempt berikutnya).
- Polling gagal 3× berturut-turut → banner info "Koneksi tidak stabil. Kalau kamu sudah bayar, tekan Saya sudah bayar." — **jangan** menampilkan error yang membuat pelanggan mengira pembayarannya gagal.
- Pembayaran ditolak/`deny` → state halaman penuh dengan latar maroon, teks putih, penjelasan, tombol Coba Lagi.
- **Kasus paling kritis** — pembayaran masuk setelah slot hilang: halaman menampilkan "Pembayaran kamu diterima, tetapi meja sudah tidak tersedia. Tim kami akan menghubungi kamu dalam 15 menit untuk refund atau penggantian jadwal." + nomor WA venue. Jangan pernah menampilkan error teknis di sini.

---

#### `UI-07` Konfirmasi Booking (dengan QR check-in)

**Tujuan:** memberi bukti yang bisa ditunjukkan di kasir, dan mendorong arsip ke WhatsApp.

**Elemen atas → bawah:**
1. Hero pendek bertekstur bata + ikon centang amber 64 px (animasi sekali, `--dur-slow`).
2. Judul `--t-h1` "Booking Terkonfirmasi" + satu baris Jazzbury sebagai sentuhan hangat.
3. **Kartu Tiket** (elemen utama): border amber, latar `--c-surface-1`, berisi:
   - Kode booking `SPL-260824-0042` (Emoland, besar, bisa di-copy)
   - **QR check-in** 200 × 200 di kartu putih (`OPS-08`)
   - Meja · Tanggal · Jam · Durasi · Jumlah tamu
   - Total dibayar
   - Garis putus-putus + notch kiri-kanan (bentuk tiket robek)
4. Kotak aturan: "Datang maksimal 20.15. Sesi tetap berakhir 22.00."
5. **Tombol "Kirim bukti ke WhatsApp saya"** (Primary) → `wa.me` deep link berisi detail ter-encode (`WA-05`, biaya Rp 0).
6. Tombol Secondary: "Tambah ke Kalender" (.ics), "Simpan Tiket sebagai Gambar".
7. Tombol Ghost: "Lihat Booking Saya".
8. Kartu upsell F&B kalau belum memesan makanan.

**Kondisi kosong/error:** kalau QR check-in gagal digenerate, tampilkan kode booking besar sebagai fallback dengan catatan "Tunjukkan kode ini ke kasir" — booking tetap sah.

---

#### `UI-08` Riwayat & Detail Booking

**Tujuan:** akses cepat ke tiket aktif, dan arsip untuk klaim.

**Riwayat:**
1. `[H]` "Booking Saya" + filter segmented `Aktif · Selesai · Batal`.
2. **Booking aktif** ditampilkan sebagai kartu besar di atas dengan **countdown menuju jam main** (`Mulai dalam 2 jam 14 menit`) dan tombol "Tampilkan QR".
3. Daftar riwayat: kartu ringkas (tanggal, meja, jam, total, Status Badge).
4. Infinite scroll dengan 6 skeleton row.

**Detail Booking:**
1. Kartu Tiket (sama seperti `UI-07`).
2. Rincian pembayaran: metode, waktu bayar, kode order, **rincian pajak**.
3. Rincian item F&B (kalau ada).
4. **Tombol "Perpanjang"** (`OPS-12`) — aktif hanya saat sesi berjalan atau ≤30 menit sebelum berakhir. Menampilkan sheet: kalau slot berikutnya kosong → tawarkan 30/60 menit + bayar; kalau terisi → tawarkan **pindah ke meja alternatif** (`OPS-14`); kalau tidak ada → jelaskan jujur.
5. Tombol "Batalkan Booking" (Destructive, Ghost weight) dengan kebijakan yang berlaku ditampilkan di modal.
6. Tombol `wa.me` "Hubungi Venue".

**Kondisi kosong/error:** riwayat kosong → Empty State. Booking dibatalkan venue (meja rusak, `AD-03`) → banner maroon di atas kartu: "Booking ini dibatalkan oleh venue. Kompensasi: voucher +20%. Hubungi kami." 

---

#### `UI-09` Profil

**Tujuan:** minimal, tidak menahan orang di sini.

**Elemen atas → bawah:**
1. Avatar inisial dalam lingkaran amber (teks near-black) + nama + email.
2. Field nama, nomor WhatsApp (editable), email (read-only, dipakai untuk magic link).
3. **Saldo Store Credit** (`PAY-15`, `RFD-06`) — kartu amber dengan nominal `--t-num-lg` + riwayat kredit.
4. Toggle: notifikasi email, notifikasi Web Push, **tema terang/gelap**.
5. Tautan: Kebijakan Pembatalan, Syarat & Ketentuan, Kontak.
6. Tombol Ghost "Keluar".
7. Versi aplikasi + status koneksi (`OPS-22`).

**Kondisi error:** gagal simpan profil → toast error + field mempertahankan input pengguna (jangan reset).

---

#### `UI-10` Admin — Live Board

**Tujuan:** satu layar yang bisa dipahami kasir dalam 3 detik dari jarak 2 meter. Ini layar yang paling lama ditatap staf, jadi kepadatannya berbeda dari sisi pelanggan.

**Layout desktop/tablet (≥768):**
```
┌─ Header: SPL Live · [Sab 24 Agu] · ● Tersambung · 20:14 ───────────┐
│ KPI: Meja terisi 6/8 · Order aktif 4 · Omzet hari ini Rp 2.140.000 │
├─ Legend status: ⬡Kosong ▨Diproses ■Dipakai ⋯Reservasi ═Servis ─────┤
│ ┌───────────────── GRID KARTU MEJA (2–4 kolom) ─────────────────┐  │
│ │  M-01 ⬡     M-02 ■ 42:17   M-03 ⋯ 21.00   M-04 ═ SERVIS      │  │
│ └───────────────────────────────────────────────────────────────┘  │
├─ TIMELINE KETERSEDIAAN (CMP-07), 1 baris per meja ─────────────────┤
├─ PANEL KANAN: Order F&B masuk (realtime) · Booking baru ───────────┤
└─ Bar aksi: [Mulai Sesi Walk-in] [Cari Booking] [Tutup Shift] ──────┘
```

**Mobile (kasir pakai HP):** KPI jadi baris scroll horizontal, grid kartu meja 2 kolom, timeline dipindah ke tab kedua, panel order jadi tab ketiga. Tab bar di bawah: `Meja · Jadwal · Order`.

**Perilaku wajib:**
- **Notifikasi order baru**: suara + toast + badge — Supabase Realtime channel `admin:orders`, tanpa WhatsApp (`WA-06`).
- **Mulai Sesi Walk-in** (`OPS-01`): sheet pilih meja + durasi. Kalau meja punya booking mendatang, sistem menampilkan **peringatan keras** dan mengunci durasi maksimum (`OPS-02`): "Meja 3 dibooking atas nama Budi jam 20.00 (55 menit lagi). Maksimum sesi walk-in: 55 menit." Override butuh alasan tertulis (`AD-09`).
- **Countdown "meja akan dipakai booking"** (`OPS-03`) muncul di kartu meja pada T-15 menit dengan warna `--c-warning`.
- **Indikator koneksi jujur** (`OPS-22`): pil di header — hijau "Tersambung" / merah "Offline — 3 item belum tersinkron". Saat offline, jadwal hari ini tetap tampil dari cache PWA (`OPS-18`) dengan label waktu ambil data.
- Tombol "Cetak Jadwal Hari Ini" (`OPS-19`).

**Kondisi kosong/error:** belum ada booking → timeline tetap digambar dengan pesan "Belum ada booking hari ini". Realtime terputus → banner amber "Koneksi realtime terputus, memuat ulang tiap 30 detik" dan sistem beralih ke polling.

---

#### `UI-11` Admin — Kelola Meja & Harga

**Tujuan:** memenuhi requirement pemilik #7 (atur jumlah meja, ubah harga sesi) tanpa merusak booking yang sudah ada.

**Elemen atas → bawah:**
1. Tab: `Meja` · `Rate Card` · `Jam Operasional`.
2. **Tab Meja:** tabel/daftar kartu — kode, nama, tipe (Standar/VIP), status aktif, `controller_channel` (disiapkan untuk Fase 3 kontrol lampu, `HW-01`), tombol Edit. Tombol "Tambah Meja".
   - Menonaktifkan meja → modal: "Meja M-04 punya 3 booking mendatang" + **daftar booking terdampak** dan tombol **relokasi 1-klik** (`AD-02`). Kalau tidak ada pengganti, tawarkan refund/voucher (`AD-03`).
   - **Meja tidak bisa dihapus** kalau punya riwayat — hanya dinonaktifkan. Tombol Hapus disabled dengan tooltip alasannya.
3. **Tab Rate Card:** daftar tarif dengan kolom `Nama · Kelas meja · Tipe hari · Jam mulai–selesai · Harga/jam · Berlaku dari · Status`. Contoh baris: `PRIME-WE · Standar · Jum–Min · 17.00–01.00 · Rp 70.000 · 01 Sep 2026 · Aktif`.
   - Mengubah harga **selalu** membuat rate card baru dengan `effective_from`, tidak pernah menimpa yang lama. UI menegaskan ini: field tanggal berlaku wajib diisi, dengan teks "Booking yang sudah ada tidak akan berubah harganya."
   - Preview: kalkulator kecil "Sesi 2 jam Sabtu 20.00 = Rp 140.000" yang ter-update saat form diisi.
4. **Tab Jam Operasional:** jam buka/tutup per hari, hari libur, kuota meja `walk_in_only` per jam prime (`OPS-04`).

**Kondisi error:** rate card yang tumpang tindih → validasi inline sebelum simpan, tampilkan baris yang bentrok. Simpan gagal → form mempertahankan seluruh input.

---

#### `UI-12` Admin — Kelola Menu

**Tujuan:** ubah harga & ketersediaan F&B dalam hitungan detik saat jam ramai.

**Elemen atas → bawah:**
1. Search + filter kategori + toggle "Tampilkan yang habis saja".
2. Daftar item: foto kecil, nama, harga (inline-editable), **toggle Tersedia/Habis besar 44 px** — ini aksi paling sering, harus satu ketukan tanpa masuk halaman detail.
3. Tombol "Tambah Item" → form: nama, kategori, harga, deskripsi, foto (upload dengan kompresi otomatis di client sebelum kirim, `AST-01`), `tax_category` (`fnb`/`non_taxable`), flag pedas/favorit.
4. Aksi massal: pilih beberapa item → "Tandai Habis" / "Naikkan harga X%".

**Kondisi kosong/error:** menu kosong → Empty State + "Tambah item pertama". Upload foto >2 MB → ditolak di client dengan pesan "Foto dikompres otomatis ke maks 45 KB" (bukan error, informasi).

---

#### `UI-13` Admin — Dashboard Keuangan

**Tujuan:** pemilik memahami kondisi usaha dalam 30 detik, dan bisa mengisi SPTPD tanpa kalkulator.

**Elemen atas → bawah:**
1. **Date range picker** + toggle **"Tanggal transaksi / Tanggal settlement"** (`FIN-08`) — ini bukan detail kecil, ini pemisah antara laporan penjualan dan rekonsiliasi bank.
2. **Baris KPI** (`--t-num-lg`, Emoland):
   `Omzet Kotor` · `PBJT Terutang` · `MDR Gateway` · `**Dana Bersih Diterima**` (`FIN-07`, `TAX-09`).
   Keempatnya ditampilkan berdampingan. Menampilkan omzet kotor saja adalah cara tercepat kehilangan kepercayaan pemilik di bulan pertama.
3. **Grafik omzet harian** — batang, warna amber, sumbu tabular. Overlay garis "dana bersih" warna `--c-info`.
4. **Breakdown per channel** (`FB-04`): QRIS online · Tunai kasir · EDC · Transfer. Donut + tabel angka.
5. **Breakdown per kategori**: Sewa meja vs F&B.
6. **Rekap Pajak Terutang** (`TAX-07`): DPP F&B, DPP hiburan, PBJT masing-masing, siap salin ke SPTPD.
7. **Laporan Aktivitas Sensitif** (`AD-10`): semua void, diskon manual, refund, dan override hari itu — satu daftar, bisa dibaca dalam 30 detik, dengan nama staf dan alasan.
8. **Heatmap okupansi** jam × hari (Fase 2, `EX-05`) — placeholder di MVP.
9. Tombol **Export CSV/XLSX** (`FIN-10`).

**Aturan tampilan angka:** semua uang `tabular-nums`, format `Rp 1.234.567` (pemisah titik), tanpa desimal. Angka negatif (refund, biaya) warna `--c-danger-text` dengan tanda minus, bukan tanda kurung.

**Kondisi kosong/error:** rentang tanpa data → "Tidak ada transaksi pada rentang ini" + tombol reset. **Jangan pernah menampilkan angka placeholder atau data contoh** di dashboard keuangan — nol harus terlihat sebagai nol.

---

#### `UI-14` Kitchen Display (KDS)

**Tujuan:** dapur melihat order tanpa dibacakan. Layar ini dilihat dari 1,5–2 meter oleh orang yang tangannya kotor — desainnya berbeda total dari layar lain.

**Aturan khusus layar ini:**
- Ukuran teks minimum **20 px**; nama item **24 px bold**.
- Target sentuh minimum **64 px** (bukan 44).
- Tidak ada hover, tidak ada tooltip, tidak ada menu bertingkat.
- Latar `--c-bg-base` dengan tekstur beton opacity .06.
- **Tanpa scroll horizontal.** Kolom kanban.

**Layout:** tiga kolom — `MASUK` · `DIMASAK` · `SIAP`.
Tiap kartu order:
```
┌──────────────────────────┐
│ #0042   MEJA 3    04:12  │ ← nomor order, meja, umur order (Emoland)
│ ──────────────────────── │
│ 2× Smoked Beef Ribs      │ ← 24 px bold
│ 1× Lemon Tea (less ice)  │ ← catatan tampil, tidak dipotong
│ ──────────────────────── │
│ [    MULAI MASAK    ]    │ ← tombol 64 px full-width
└──────────────────────────┘
```
- **Warna kartu berdasarkan umur order**, bukan berdasarkan jenis: <5 menit `--c-border-subtle`, 5–10 menit border `--c-warning`, >10 menit border `--c-danger-solid` + pulse lambat. Ini yang membuat KDS berguna.
- Order baru masuk dengan **suara + kartu slide-in dari atas** (satu-satunya animasi di layar ini).
- Order takeaway/dine-in dibedakan dengan ikon besar, bukan warna.

**Kondisi kosong/error:** tidak ada order → logogram outline besar + "Belum ada order" + jam besar. Offline → banner merah tebal di atas: "OFFLINE — order baru tidak masuk" (harus mengganggu, karena konsekuensinya nyata).

**Prioritas:** KDS adalah **Fase 2** (`EX-09`), naik ke MVP hanya jika volume F&B online diperkirakan tinggi sejak awal. Spesifikasi ditulis sekarang agar model data order sudah menyiapkan field yang dibutuhkan (status per item, timestamp masuk/mulai/siap).

---

### 7.9 Aturan Mobile-First

| ID | Aturan | Nilai |
|---|---|---|
| `MOB-01` | Breakpoint | `base` 0–479 (desain utama, target 360 px) · `sm` 480 · `md` 768 (tablet/kasir) · `lg` 1024 (admin) · `xl` 1280 (dashboard) |
| `MOB-02` | Container pelanggan | `max-width: 480px`, terpusat. Di desktop aplikasi pelanggan **tidak melebar** — melebar hanya membuat form terlihat aneh dan menambah pekerjaan tanpa menambah konversi |
| `MOB-03` | Container admin | `max-width: 1440px`, layout grid dengan side rail di ≥1024 |
| `MOB-04` | Target sentuh | **minimum 44 × 44 px** untuk semua elemen interaktif; **48 px** untuk CTA utama; **64 px** di Kitchen Display. Jarak antar target minimal 8 px |
| `MOB-05` | Navigasi bawah pelanggan | 5 item, tinggi 64 px + `safe-area-inset-bottom`: `Beranda · Booking · Menu · Booking Saya · Profil`. Ikon 24 px + label 11 px (label wajib, ikon saja tidak cukup jelas). Item aktif: ikon + label `--c-amber-500` + indikator bar 3 px di atas |
| `MOB-06` | Sticky CTA | Bar aksi bawah selalu duduk **di atas** bottom nav, bukan menutupinya. Konten halaman diberi `padding-bottom: calc(var(--bottomnav-h) + 72px + var(--safe-b))` |
| `MOB-07` | Bottom nav disembunyikan | Di layar Pembayaran QRIS (`UI-06`) dan Checkout (`UI-05`) — jalur uang tidak boleh punya jalan keluar yang tidak disengaja |
| `MOB-08` | Navigasi admin | Bottom tab di <768; side rail 72 px (ikon saja) di 768–1023; side rail 240 px (ikon + label) di ≥1024 |
| `MOB-09` | Orientasi | Portrait untuk pelanggan; **landscape wajib didukung** untuk Live Board dan KDS (layar TV/tablet kasir) |
| `MOB-10` | Input | `inputmode` yang tepat di setiap field (`tel`, `email`, `numeric`), `autocomplete` diisi benar, `font-size: 16px` minimum |
| `MOB-11` | Scroll | Tidak ada scroll horizontal di `body`. Konten lebar (timeline, tabel keuangan) di-scroll di dalam container `overflow-x: auto` sendiri dengan indikator gradien di tepi |

#### Perilaku PWA (`MOB-12` – `MOB-18`)

| ID | Item | Spesifikasi |
|---|---|---|
| `MOB-12` | Manifest | `name: "SPL Sports Pool Lounge"`, `short_name: "SPL"`, `display: "standalone"`, `orientation: "portrait"` (pelanggan) / `"any"` (admin), `theme_color: "#0B0B0C"`, `background_color: "#0B0B0C"`, `start_url: "/?src=pwa"` |
| `MOB-13` | Ikon | 192 px, 512 px, dan **512 px maskable** (logogram di dalam safe zone 80%, latar `#0B0B0C` — logo transparan akan dipotong bulat oleh Android). Apple touch icon 180 px |
| `MOB-14` | Splash | iOS memerlukan `apple-touch-startup-image` per ukuran; minimal sediakan varian iPhone umum. Latar `#0B0B0C` + logogram amber di tengah. Android menghasilkan splash otomatis dari manifest |
| `MOB-15` | Install prompt | **Jangan tampilkan saat kunjungan pertama.** Tangkap `beforeinstallprompt`, simpan, lalu tampilkan banner non-modal **setelah booking pertama berhasil** (`UI-07`) dengan teks "Pasang SPL di HP kamu supaya tiket & QR selalu ada, walau sinyal jelek." Tolak sekali = jangan tanya lagi 30 hari |
| `MOB-16` | Offline shell | Service worker mem-precache: app shell, font subset, logo SVG, ikon, CSS. Strategi: `stale-while-revalidate` untuk shell, `network-first` dengan fallback cache untuk data jadwal, **`network-only` untuk semua endpoint pembayaran** (jangan pernah menyajikan status pembayaran dari cache) |
| `MOB-17` | Cache jadwal hari ini | `OPS-18`: jadwal booking hari berjalan disimpan di IndexedDB dan tetap tampil saat offline dengan **label waktu pengambilan data** yang jujur ("Data pukul 20.14") |
| `MOB-18` | Indikator offline | Pita persisten di bawah header (bukan toast): `--c-warning` "Offline — menampilkan data tersimpan". Untuk admin, tambahkan hitungan item belum tersinkron |
| `MOB-19` | Update aplikasi | Saat service worker baru siap, tampilkan toast "Versi baru tersedia" + tombol Muat Ulang. **Jangan** reload otomatis — bisa terjadi saat kasir sedang mengetik |

---

### 7.10 Aksesibilitas

| ID | Requirement |
|---|---|
| `A11Y-01` | **Fokus keyboard terlihat di semua elemen.** `:focus-visible` memakai `--ring-focus` (2 px offset gelap + 2 px amber). Pada tombol amber, ring memakai `--ring-focus-on-amber` (near-black di luar) agar tetap terlihat. `outline: none` tanpa pengganti dilarang di seluruh codebase |
| `A11Y-02` | **Skip link** "Lompat ke konten utama" sebagai elemen fokusable pertama |
| `A11Y-03` | **Urutan fokus** mengikuti urutan visual. Bottom sheet & modal melakukan fokus trap; saat ditutup, fokus **kembali ke elemen pemicu** |
| `A11Y-04` | **Grid meja & grid slot** memakai `role="grid"`, tiap baris `role="row"`, tiap sel `role="gridcell"`. Navigasi panah kiri/kanan/atas/bawah antar sel, `Home`/`End` ke ujung baris, `Enter`/`Space` memilih. Sel penuh memakai `aria-disabled="true"` (**bukan** `disabled`, agar tetap bisa dijelajahi dan dibaca screen reader) |
| `A11Y-05` | **`aria-label` sel slot** ditulis lengkap: `"Meja 3, Sabtu 24 Agustus, 20.00 sampai 21.00, tersedia, Rp 70.000"`. Untuk sel penuh: `"…, penuh, tidak dapat dipilih"` |
| `A11Y-06` | **Perubahan realtime** diumumkan lewat `aria-live="polite"` yang di-throttle: maksimal satu pengumuman per 10 detik, berbentuk ringkasan ("2 slot berubah status"), bukan satu pengumuman per slot |
| `A11Y-07` | **Countdown**: elemen visual `aria-hidden="true"`; pengumuman terpisah `aria-live="polite"` hanya pada 5 menit, 2 menit, 1 menit, 10 detik |
| `A11Y-08` | **Ukuran teks minimum** 14 px (`--t-body-sm`) untuk informasi; 12 px hanya untuk metadata non-esensial. Aplikasi harus tetap berfungsi saat browser di-zoom 200% dan saat `font-size` OS dinaikkan |
| `A11Y-09` | **Warna bukan satu-satunya penanda** (§7.6): setiap status membawa ikon + pola + teks |
| `A11Y-10` | **`prefers-reduced-motion`**: semua `transform`, `scale`, dan gerakan posisi dimatikan; transisi disederhanakan menjadi `opacity` ≤120 ms; skeleton sweep berhenti; pulse countdown diganti perubahan warna statis; drag-to-dismiss tetap berfungsi |
| `A11Y-11` | **Form**: setiap input punya `<label>` terhubung (`for`/`id`), error dihubungkan lewat `aria-describedby` + `aria-invalid`, dan ringkasan error di atas form dengan tautan ke field bermasalah |
| `A11Y-12` | **Bahasa** `<html lang="id">`; teks alternatif gambar dalam Bahasa Indonesia; logogram dekoratif `alt=""` |
| `A11Y-13` | **Target audit**: WCAG 2.1 **AA**. Sebelum go-live, jalankan axe DevTools di 14 layar dan catat hasilnya. Nol violation kategori *serious* dan *critical* |
| `A11Y-14` | **Tidak ada informasi yang hanya disampaikan lewat suara** (notifikasi order KDS harus punya padanan visual yang mencolok) |

---

### 7.11 Micro-interaction dengan framer-motion

Prinsip pemilihan: animasi dibuat kalau ia **menjawab pertanyaan pengguna** ("apa yang barusan berubah?", "dari mana benda ini datang?", "sistemnya jalan atau hang?"). Kalau tidak, itu biaya tanpa hasil — dan pada Android kelas bawah, biaya itu berbentuk jank.

#### Layak dibuat

| ID | Interaksi | Implementasi | Kenapa layak |
|---|---|---|---|
| `MOT-01` | **Slot chip terpilih** | `layoutId="slot-highlight"` — sorotan amber berpindah dari chip lama ke chip baru dengan spring `{stiffness:420,damping:34}` | Mata mengikuti perpindahan, tidak perlu mencari lagi mana yang terpilih. Ini animasi paling bernilai di aplikasi |
| `MOT-02` | **Cart drawer / bottom sheet** | `motion.div` dengan `drag="y"`, `dragConstraints`, `dragElastic={0.05}`, spring masuk, `--dur-fast` keluar | Menjelaskan asal dan arah panel; drag-to-dismiss adalah gestur yang sudah dikuasai pengguna |
| `MOT-03` | **Kartu meja berubah status** | Crossfade warna border + isian `--dur-base`, ditambah **satu** pulse `scale 1 → 1.02 → 1` yang hanya berjalan sekali | Di Live Board, kasir tidak menatap layar terus-menerus. Pulse sekali menarik perhatian; pulse berulang menjadi kebisingan visual |
| `MOT-04` | **Countdown <60 detik** | Pulse `scale` + transisi warna ke `--c-danger-text` | Urgensi nyata, konsekuensinya uang |
| `MOT-05` | **Ring progres QR** | `SVG stroke-dashoffset` animasi linear, di-drive dari `expires_at` | Memberi rasa "sistem sedang menunggu bersamamu" |
| `MOT-06` | **Toast masuk/keluar** | `AnimatePresence`, slide 8 px + fade, `--dur-fast` | Mencegah teks muncul mendadak tanpa asal |
| `MOT-07` | **Slot gagal di-hold** | Shake horizontal 3 siklus amplitudo 6 px, 240 ms total, + border merah | Umpan balik kegagalan yang terasa fisik, lebih cepat dipahami daripada membaca toast |
| `MOT-08` | **Skeleton → konten** | Crossfade `--dur-fast`, dimensi identik | Menghilangkan kedipan layout |
| `MOT-09` | **Konfirmasi booking sukses** | Ring amber menutup + checkmark stroke draw, 600 ms, **sekali** | Satu momen perayaan di seluruh aplikasi. Ini titik yang tepat |
| `MOT-10` | **Stepper qty** | Angka slide vertikal 120 ms saat berubah | Murah, memperjelas arah perubahan |

#### Tidak layak — jangan dibuat

| Yang ditolak | Alasan |
|---|---|
| **Transisi antar-halaman penuh** (slide/fade seluruh route) | Menambah 200–300 ms ke setiap navigasi di jalur transaksi. Pelanggan yang mau booking tidak sedang menikmati perjalanan |
| **Parallax pada tekstur bata** | Memaksa repaint tiap frame scroll pada gambar besar. Jank paling terasa justru di perangkat yang paling banyak dipakai pelanggan |
| **Angka uang count-up** di dashboard keuangan | Menyesatkan (angka salah terlihat selama animasi), memperlambat pembacaan, dan pada laporan keuangan itu tidak lucu |
| **Stagger animation** pada grid 30+ slot chip | Slot terakhir baru muncul setelah 800 ms. Pengguna menunggu sesuatu yang sudah ada |
| **3D tilt / hover glow berat** pada kartu meja | Tidak ada hover di mobile; di desktop admin hanya menghabiskan GPU |
| **Confetti saat pembayaran sukses** | Berlebihan untuk transaksi rutin, dan berat. `MOT-09` sudah cukup |
| **Animasi loading kustom bertema bola biliar** | Menggoda, tapi menambah bundle dan memperpanjang persepsi waktu tunggu. Spinner 16 px lebih baik |
| **Animasi pada Kitchen Display** selain kartu baru masuk | Layar itu dilihat sekilas berulang kali; gerakan mengganggu pembacaan |

#### Aturan teknis motion

| ID | Aturan |
|---|---|
| `MOT-11` | Hanya animasikan `transform` dan `opacity`. Animasi `width`, `height`, `top`, `left`, `box-shadow` dilarang di komponen yang tampil >10× per layar |
| `MOT-12` | `layout` animation framer-motion **dimatikan** pada daftar >20 item (grid slot, daftar menu). Gunakan crossfade sederhana |
| `MOT-13` | `will-change` hanya dipasang saat interaksi dimulai dan dilepas setelah selesai |
| `MOT-14` | Seluruh durasi dibaca dari token CSS, bukan angka literal di komponen. `useReducedMotion()` dari framer-motion dipakai di setiap komponen beranimasi |
| `MOT-15` | Bundle: impor `framer-motion` secara selektif (`m` + `LazyMotion` dengan `domAnimation`) untuk menekan ukuran, karena aplikasi ini SPA statis di Cloudflare Pages dan setiap KB dibayar oleh pelanggan di koneksi 4G |

---

### 7.12 Checklist Implementasi Design System

| # | Item | Selesai bila |
|---|---|---|
| 1 | File token CSS tunggal (`tokens.css`) | Tidak ada literal hex/px/ms di komponen mana pun |
| 2 | Pengukuran kontras token §7.2.6 | Semua nilai tercatat di tabel §7.2.5 |
| 3 | Konversi & subsetting font | Total ≤90 KB, terverifikasi lewat Network tab |
| 4 | Klarifikasi lisensi webfont (`DS-17`) | Jawaban tertulis dari pemilik |
| 5 | Vektorisasi 3 logo ke SVG | LOGOGRAM ≤12 KB, wordmark ≤6 KB masing-masing |
| 6 | Kompresi tekstur | BRICKS 4,9 MB → tile AVIF ≤28 KB |
| 7 | Guard ukuran aset di pipeline build | Build gagal saat ada aset melewati ambang `AST-01` |
| 8 | Storybook / halaman katalog komponen | 15 komponen × semua state terlihat dalam satu halaman |
| 9 | Audit axe DevTools 14 layar | 0 violation serious/critical |
| 10 | Uji perangkat nyata | Android kelas bawah (RAM 2–3 GB) + iPhone lama, di jaringan 4G lemah (throttle "Slow 4G") |
| 11 | Uji simulasi buta warna | Deuteranopia & protanopia pada Live Board dan grid slot; semua status masih terbaca |
| 12 | Uji zoom 200% & font OS besar | Tidak ada teks terpotong atau tombol tumpang tindih |

---

### 7.13 Asumsi & Keputusan yang Perlu Konfirmasi Pemilik

| ID | Pertanyaan | Dampak jika salah |
|---|---|---|
| `DSQ-01` | **[PERLU KONFIRMASI]** Lisensi Lido STF & Emoland mencakup pemakaian webfont? (folder `lido-stf` memuat `sharefonts.net.txt`) | Risiko hukum + kemungkinan harus mengganti strategi tipografi menjadi SVG-only |
| `DSQ-02` | **[PERLU KONFIRMASI]** Anggaran waktu pembayaran final: QRIS 15 mnt / hold 17 mnt, **atau** QRIS 8 / hold 10 / release 12? Dua bagian riset menyebut angka berbeda | UI tidak terpengaruh (countdown dibaca dari `expires_at`), tetapi copywriting instruksi dan ekspektasi pelanggan iya |
| `DSQ-03` | **[PERLU KONFIRMASI]** Harga tayang tax-inclusive (rekomendasi) atau tax-exclusive? | Mengubah seluruh tampilan harga di `UI-02`, `UI-03`, `UI-04`, `UI-05` |
| `DSQ-04` | **[PERLU KONFIRMASI]** Tarif PBJT riil di daerah SPL (10% hiburan vs 40% kategori bar) | Menentukan angka yang tampil di baris pajak, bukan hanya konfigurasi |
| `DSQ-05` | **[PERLU KONFIRMASI]** Jumlah dan layout fisik meja (untuk denah `UX-05`) | Denah meja tidak bisa dibuat akurat tanpa ini; fallback ke grid generik |
| `DSQ-06` | **[PERLU KONFIRMASI]** Apakah venue melayani takeaway F&B? | Menambah satu selector di `UI-04` dan alur berbeda di KDS |
| `DSQ-07` | **[PERLU KONFIRMASI]** Apakah tema terang benar-benar dibutuhkan, atau cukup gelap saja untuk MVP? | Menghemat ±1 hari kerja dan menghapus 8 token yang belum diukur |
| `DSQ-08` | **[PERLU KONFIRMASI]** KDS masuk MVP atau Fase 2? | Menentukan apakah `UI-14` dibangun sekarang |
| `DSQ-09` | **[PERLU KONFIRMASI]** Nama tampilan resmi di aplikasi: "SPL", "SPL Sports Pool Lounge", atau nama venue lengkap? | Mempengaruhi wordmark SVG, manifest PWA, dan judul e-receipt |