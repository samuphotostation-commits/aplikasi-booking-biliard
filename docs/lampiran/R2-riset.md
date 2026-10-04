# Riset Stack Hosting Gratis Layak-Produksi untuk Web App Transaksional SPL Sports Pool Lounge & Smokehouse Resto (verifikasi free tier per Agustus 2026)

## R0. Vonis Cepat

| ID | Platform / Layanan | Boleh Komersial di Tier Gratis? | Sleep / Pause? | Vonis untuk kasus ini |
|----|--------------------|--------------------------------|----------------|------------------------|
| HS-01 | **Vercel Hobby** | **TIDAK.** Dilarang eksplisit di Fair Use Guidelines | Tidak sleep, tapi bisa di-*pause* karena pelanggaran | **DISKUALIFIKASI TOTAL** |
| HS-02 | **GitHub Pages** | **TIDAK.** Dilarang eksplisit untuk e-commerce / transaksi komersial | Tidak | **DISKUALIFIKASI** (dan secara teknis mustahil) |
| HS-03 | **Cloudflare Pages** (static) | **YA** | Tidak pernah sleep | **DIPILIH** — frontend |
| HS-04 | **Cloudflare Workers** (free) | **YA** | Tidak pernah sleep | Cadangan / API tipis |
| HS-05 | **Netlify Free** | **YA** (eksplisit diizinkan) | Situs *pause* kalau credit habis | Alternatif kalau butuh SSR |
| HS-06 | **Render Free** | Tidak dilarang, **tapi docs bilang jangan untuk produksi** | **Ya — spin-down 15 menit**, cold start ±1 menit | **DITOLAK** untuk webhook |
| HS-07 | **Railway Trial** | Tidak dilarang | Habis kredit = mati | **DITOLAK** (bukan gratis permanen) |
| HS-08 | **Fly.io** | Tidak dilarang | — | **DITOLAK** (tidak ada free tier untuk akun baru) |
| HS-09 | **Deno Deploy Free** | Tidak dilarang | Tidak sleep | Layak sebagai cadangan |
| DB-01 | **Supabase Free** | **YA** (tidak ada larangan komersial) | **Ya — pause setelah 1 minggu tidak aktif** | **DIPILIH** — dengan mitigasi |

---

## R1. Vercel Hobby — Pasal Komersial (KRITIS, JANGAN DILEWATI)

### HS-01a. Bunyi aturannya (dikutip dari dokumentasi resmi Vercel, halaman *Fair Use Guidelines*, `last_updated: 2026-07-29`)

> "**Hobby teams** are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan."

Definisi "commercial usage" versi Vercel:

> "any Deployment that is used for the purpose of financial gain of **anyone** involved in **any part of the production** of the project, including a paid employee or consultant writing the code."

Contoh yang mereka sebut sendiri:
1. **"Any method of requesting or processing payment from visitors of the site"** ← ini persis fitur BK/PY di PRD Anda (QRIS Midtrans/Doku).
2. "Advertising the sale of a product or service" ← menu makanan/minuman dengan harga = ini.
3. "Receiving payment to create, update, or host the site" ← kalau Anda bayar developer, ini kena juga.
4. Affiliate linking sebagai tujuan utama.
5. Iklan (Google AdSense dll).
6. Bahkan **meminta donasi** dihitung commercial usage.

### HS-01b. Kesimpulan hukum-nya

Aplikasi booking meja biliar yang **menerima pembayaran QRIS** memenuhi **kriteria pertama secara harfiah**. Tidak ada zona abu-abu, tidak ada "yang penting traffic kecil". Larangan ini **tidak ada hubungannya dengan volume traffic** — ini soal sifat aplikasinya.

### HS-01c. Konsekuensi kalau nekat (dari KB Vercel "Why has my account or deployment been paused?")

| Aspek | Yang terjadi |
|-------|--------------|
| Deteksi | Vercel review manual/otomatis, atau laporan pihak ketiga |
| Efek | Production deployment **berhenti melayani**; pengunjung dapat error `503 DEPLOYMENT_PAUSED` |
| Pemulihan | **Tidak otomatis.** Harus di-resume manual, dan untuk pelanggaran komersial harus **upgrade plan dulu** |
| Notifikasi | Email berisi detail + langkah penyelesaian |

**Skenario terburuk yang realistis:** hari Sabtu malam, jam ramai, pelanggan sudah scan QRIS, lalu deployment di-pause. Uang sudah masuk ke Midtrans, tapi webhook tidak bisa diterima → slot tidak ter-booking → chaos di kasir. **Ini risiko operasional yang tidak boleh diambil untuk menghemat USD 20/bulan.**

### HS-01d. Batas teknis Vercel Hobby (untuk arsip, meski sudah didiskualifikasi)

| Resource | Hobby | Pro |
|----------|-------|-----|
| Fast Data Transfer | s/d 100 GB/bulan | s/d 1 TB |
| Fast Origin Transfer | s/d 10 GB/bulan | usage-based |
| Function Invocations | 1.000.000 | usage-based |
| Active CPU | 4 CPU-hrs | usage-based |
| Provisioned Memory | 360 GB-hrs | usage-based |
| Edge Requests | s/d 1.000.000 | 10.000.000 included |
| Function max duration | 300 detik | s/d 800 detik (config) |
| Runtime Logs | **1 jam** | 1 hari |
| Deployments/hari | 100 | 6.000 |
| Harga | Gratis | **USD 20 / user / bulan** |

### HS-01e. Pembunuh kedua: Cron di Vercel Hobby

| Plan | Jumlah cron/project | **Interval minimum** | Presisi |
|------|--------------------|--------------------|---------|
| Hobby | 100 | **Sekali per HARI** | Per-jam (**±59 menit**) |
| Pro | 100 | Sekali per menit | Per-menit |

Deploy dengan ekspresi `*/5 * * * *` akan **gagal saat deploy** dengan error: *"Hobby accounts are limited to daily cron jobs."*

Artinya fitur **auto-expire booking yang belum dibayar dalam 15 menit** secara teknis **mustahil** dijalankan dengan Vercel Cron di Hobby — bahkan seandainya larangan komersial tidak ada. Dua palu, satu paku.

---

## R2. Matriks Platform Compute Free Tier (angka terverifikasi, Agustus 2026)

| ID | Platform | Batas gratis konkret | Komersial? | Sleep/Pause | Cocok untuk webhook payment? |
|----|----------|---------------------|-----------|-------------|------------------------------|
| HS-03 | **Cloudflare Pages** | Static assets: **bandwidth & request tidak dibatasi**; **500 builds/bulan**; custom domain gratis & tak terbatas | Ya | Tidak pernah | N/A (static) — tapi partner sempurna |
| HS-04 | **Cloudflare Workers Free** | **100.000 request/hari** (reset 00:00 UTC); **CPU 10 ms/invocation**; memory 128 MB; **50 subrequest/request**; 100 Worker/akun; env var 64/Worker @5 KB; ukuran Worker 3 MB terkompresi; **Cron Triggers: 5/akun**, durasi cron s/d 15 menit | Ya | Tidak pernah | **Ya**, asal logic-nya tipis (10 ms CPU itu ketat) |
| HS-04b | Cloudflare **D1** free | 5 juta rows read/hari, 100.000 rows written/hari, 5 GB storage | Ya | Tidak | Alternatif DB |
| HS-04c | Cloudflare **KV** free | 100.000 read/hari, **1.000 write/hari**, 1 GB | Ya | Tidak | Write 1.000/hari terlalu kecil untuk transaksi |
| HS-05 | **Netlify Free** | **300 credits/bulan** (model kredit, bukan kuota terpisah). ASUMSI dari dokumentasi & blog Netlify: ±100 GB bandwidth **atau** ±10 build medium — **berbagi pool yang sama**. Habis credit → **situs pause sampai siklus berikutnya**. Personal USD 9 (1.000 credits), Pro USD 20 (3.000 credits) | **Ya, eksplisit diizinkan** (boleh charge klien, tidak boleh resell hosting-nya) | Pause kalau credit habis | Bisa, tapi model credit = risiko mati mendadak. **[PERLU KONFIRMASI]** rasio credit→bandwidth terbaru |
| HS-06 | **Render Free** | **750 instance-hours/workspace/bulan**; **spin-down setelah 15 menit tanpa traffic**, spin-up **±1 menit**; Postgres 1 GB yang **expire 30 hari setelah dibuat** (+14 hari grace lalu **data dihapus**); Key Value = in-memory saja (hilang saat restart); static site gratis | Tidak dilarang eksplisit, **tapi docs menulis: "Do not use them for production applications"** | **YA — 15 menit** | **TIDAK.** Midtrans akan timeout ke instance yang tidur, dan DB gratis mati dalam 30 hari |
| HS-07 | **Railway** | Trial: **grant sekali USD 5**, kedaluwarsa 30 hari (sumber sekunder), tanpa kartu; limit per service: 2 replica, 1 GB RAM, 2 vCPU, 0,5 GB volume. Setelah trial → free tier terbatas ±USD 1 credit/bulan (**[PERLU KONFIRMASI]**). Hobby **USD 5/bulan** (termasuk USD 5 usage). Pro USD 20 | Tidak dilarang | Habis kredit = layanan mati | Tidak — bukan gratis berkelanjutan |
| HS-08 | **Fly.io** | **Tidak ada free tier untuk akun baru sejak Okt 2024.** Kredit trial USD 5, jendela trial pendek. Pay-as-you-go; app always-on termurah ±USD 2–5/bulan. Akun legacy masih dapat 3× shared-cpu-1x 256 MB + 3 GB volume + 100 GB transfer | Tidak dilarang | Machine bisa auto-stop | Tidak (bukan gratis) |
| HS-09 | **Deno Deploy Free** | **1 juta request/bulan**; **20 GB egress**; **15 CPU-hours/bulan**; 20 app aktif; KV 1 GiB; 50 custom domain/org. Pro USD 20 (5 juta req, 200 GB, 40 CPU-hrs) | Tidak dilarang | Tidak sleep | **Ya, layak** — kandidat cadangan terkuat setelah Cloudflare |

### HS-10. Catatan penting soal Cloudflare Workers 10 ms CPU

10 ms **CPU time**, bukan wall-clock. Menunggu jaringan (query ke Postgres, panggil API Midtrans) **tidak dihitung**. Jadi handler webhook yang isinya: verifikasi SHA-512 signature → satu `UPDATE` ke Postgres → balas 200, **muat dengan nyaman**. Yang tidak muat adalah SSR framework berat (render React di edge), image processing, atau parsing JSON raksasa.

**Implikasi arsitektur:** jangan taruh Next.js SSR di Workers Free. Pakai **SPA statis** (Vite + React / SvelteKit static / Next.js `output: export`) di Cloudflare Pages, dan semua logic di database + Edge Function.

---

## R3. GitHub Pages — Jawaban Tegas: TIDAK BISA DIPAKAI SENDIRIAN

User menyebut GitHub secara eksplisit, jadi ini dijawab langsung. Ada **empat** alasan independen, masing-masing sudah cukup untuk mendiskualifikasi.

### HS-02a. Alasan 1 — Dilarang oleh aturan GitHub sendiri

Dikutip dari dokumentasi resmi GitHub (*GitHub Pages limits*):

> "GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS)."

Aplikasi booking berbayar = "facilitating commercial transactions". Sama seperti Vercel Hobby: **dilarang, titik.**

### HS-02b. Alasan 2 — Tidak ada runtime server, jadi webhook Midtrans tidak punya alamat

GitHub Pages hanya menyajikan file statis (HTML/CSS/JS/gambar). Tidak ada proses server yang bisa menerima HTTP POST.

Alur pembayaran QRIS **wajib** begini:

```
Pelanggan bayar QRIS
      │
      ▼
Midtrans memproses
      │
      ▼  HTTP POST ke Notification URL milik Anda  ◄── BUTUH SERVER
Endpoint webhook Anda
      │  verifikasi signature_key
      ▼
UPDATE booking SET status='paid'
```

Tanpa endpoint server, **status pembayaran tidak pernah masuk ke sistem Anda**. Mengandalkan browser pelanggan untuk melapor "saya sudah bayar" adalah lubang penipuan terbuka: siapa pun bisa memalsukan panggilan itu dan mem-booking meja tanpa bayar.

### HS-02c. Alasan 3 — Tidak ada tempat menyimpan secret

Midtrans **Server Key** dipakai untuk membentuk `signature_key` (SHA-512 dari `order_id + status_code + gross_amount + ServerKey`). Server Key ini rahasia mutlak.

Di GitHub Pages, semua yang ter-deploy **bisa dibaca siapa saja** lewat *view source* atau langsung dari repo. Menaruh Server Key di sana = menyerahkan kunci brankas. Konsekuensinya bukan cuma booking palsu — orang bisa memanggil API Midtrans atas nama merchant Anda.

### HS-02d. Alasan 4 — Batas teknis lain

| Batas | Nilai |
|-------|-------|
| Ukuran repo sumber | rekomendasi 1 GB |
| Ukuran situs terbit | maks 1 GB |
| Bandwidth | **soft limit 100 GB/bulan** |
| Build | **soft limit 10 build/jam** |
| Database | **tidak ada** |
| Auth / session | **tidak ada** |
| Cron | **tidak ada** |

### HS-02e. Peran yang MASIH masuk akal untuk GitHub

GitHub tetap dipakai, tapi bukan sebagai host aplikasi:

| Peran | ID | Keterangan |
|-------|-----|-----------|
| Version control + source of truth | HS-02f | Wajib. Semua kode di sini |
| CI/CD | HS-02g | Cloudflare Pages auto-deploy dari push ke branch `main` |
| **Backup DB terjadwal** | HS-02h | GitHub Actions jalankan `pg_dump` harian → simpan ke private repo / object storage. **Ini krusial** karena Supabase Free tidak punya backup (lihat DB-06) |
| Scheduled job cadangan | HS-02i | Lihat CR-04 |
| Halaman marketing statis (tanpa transaksi) | HS-02j | Boleh, tapi tidak perlu — Cloudflare Pages lebih baik dan tidak melanggar apa pun |

---

## R4. Database + Auth + Realtime

### DB-01. Supabase Free — angka resmi dari halaman pricing (Agustus 2026)

| Item | Free | Pro (mulai USD 25/bulan) |
|------|------|--------------------------|
| Ukuran database | **500 MB** (Shared CPU, 500 MB RAM) | 8 GB disk included, lalu USD 0,125/GB |
| Egress | **5 GB** | 250 GB (lalu USD 0,09/GB) |
| Cached egress | 5 GB | 250 GB |
| File storage | **1 GB** | 100 GB |
| MAU (Auth) | **50.000** | 100.000 |
| Edge Function invocations | **500.000/bulan** | 2 juta |
| Realtime concurrent peak connections | **200** | 500 |
| Realtime messages | **2 juta/bulan** | 5 juta |
| Log retention | **1 jam** (auth audit), **1 hari** (API & DB) | 7 hari |
| Jumlah project aktif | **Maksimal 2** | — |
| **Pause karena tidak aktif** | **YA — setelah 1 minggu** | **Tidak** |
| Backup | **Tidak ada / tidak bisa diunduh** | Daily backup |

### DB-02. Apakah Supabase Free boleh untuk komersial?

**Boleh.** Tidak ada pasal larangan komersial di Terms of Service Supabase — berbeda 180 derajat dari Vercel Hobby. Kendala Supabase Free bersifat **operasional** (kapasitas, pause, tidak ada backup), bukan **legal**. Ini yang membuat kombinasi Cloudflare + Supabase legal 100%.

### DB-03. Kebijakan PAUSE — ini risiko nyata, perlu dipahami persis

Dari dokumentasi Supabase *Project Pausing* dan *Going into Production*:

> "A Free plan project is considered inactive if it does not receive sufficient user database activity over the past week."

> "We may pause applications on the Free Plan that exhibit low activity in a 7-day period to save on server resources."

| Aspek | Fakta |
|-------|-------|
| Ambang | ±7 hari tanpa aktivitas database dari user |
| Peringatan | Supabase mengirim **email peringatan ±1 minggu sebelum pause** |
| Saat paused | API mati total. Webhook Midtrans akan **gagal**. Aplikasi tidak bisa diakses |
| Restore | **Manual** dari Dashboard → *Resume project*. Butuh beberapa detik s/d 2–3 menit |
| Jendela restore | **1 tahun** sejak paused; lewat itu risiko dihapus permanen |
| Data | Utuh saat restore (kembali ke kondisi persis saat di-pause) |
| Kalau `pg_cron` internal jalan, apakah mencegah pause? | **Tidak dijamin.** Dokumentasi hanya menyebut "user database activity" dan tidak mengonfirmasi bahwa job internal dihitung. **[PERLU KONFIRMASI]** — jangan bertaruh pada ini |

**Penilaian risiko untuk SPL:** venue biliar + resto yang buka setiap hari akan menghasilkan aktivitas DB nyata setiap hari, jadi ambang 7 hari **hampir mustahil tersentuh saat operasional normal**. Yang berbahaya adalah:
- Periode libur panjang (renovasi, tutup Lebaran > 7 hari)
- Fase development sebelum launch, saat belum ada user
- Kalau semua traffic ternyata di-cache di frontend dan tidak menyentuh DB

**Mitigasi wajib (CR-05):** ping eksternal harian dari cron-job.org ke endpoint yang benar-benar melakukan `SELECT` ringan ke tabel — bukan sekadar buka dashboard.

### DB-04. Kapasitas 500 MB — cukup untuk berapa lama?

ASUMSI perhitungan (semua angka di bawah adalah estimasi teknis, bukan data pasar):
- 1 baris `bookings` ≈ 300 byte, 1 baris `orders` ≈ 300 byte, 1 baris `order_items` ≈ 150 byte
- ASUMSI volume: 40 booking + 60 order F&B per hari, rata-rata 4 item/order

| Komponen | Baris/tahun | Ukuran/tahun |
|----------|------------|--------------|
| bookings | ±14.600 | ±4,4 MB |
| orders | ±21.900 | ±6,6 MB |
| order_items | ±87.600 | ±13 MB |
| payments + audit log | ±36.500 | ±15 MB |
| Index (±60% dari data) | — | ±23 MB |
| **Total data aplikasi** | | **±62 MB/tahun** |
| Overhead Postgres + skema `auth` + `storage` | | ±80–120 MB |

**Kesimpulan DB-04:** 500 MB **cukup untuk 3–5 tahun data transaksi**, dengan syarat: (a) foto menu **tidak** disimpan sebagai bytea di DB — taruh di Supabase Storage atau Cloudflare R2/Images; (b) tabel log/webhook-raw di-*prune* berkala. Yang lebih dulu jadi masalah adalah **egress 5 GB/bulan**, bukan ukuran DB.

### DB-05. Egress 5 GB/bulan — ini batas yang benar-benar mengikat

ASUMSI: satu sesi pemakaian app ±400 KB traffic API (JSON polling status meja + realtime). 5 GB ÷ 400 KB ≈ **12.500 sesi/bulan** ≈ 415 sesi/hari. Aman untuk satu venue.

**Yang bisa meledakkan egress:** gambar menu yang disajikan lewat Supabase Storage. **Aturan arsitektur:** semua aset gambar disajikan dari **Cloudflare Pages / R2** (bandwidth tidak dibatasi), **bukan** dari Supabase Storage.

### DB-06. Supabase Free TIDAK punya backup — risiko terbesar untuk data keuangan

> "Database backups are not available for download for Free Plan projects."

Ini masalah serius: aplikasi ini memegang **catatan pembayaran**. Kalau ada `DELETE` tanpa `WHERE` atau migrasi salah, tidak ada jalan pulang.

**Mitigasi wajib sejak hari pertama (masuk MVP, bukan Fase 2):**
1. GitHub Actions terjadwal harian → `pg_dump` via connection string → enkripsi → commit ke **private** repo backup atau upload ke Cloudflare R2 (10 GB gratis).
2. Retensi 30 hari rolling.
3. Uji restore **satu kali** sebelum go-live. Backup yang belum pernah diuji restore = bukan backup.

### DB-07. Perbandingan alternatif database

| Layanan | Free tier (terverifikasi Agustus 2026) | Auth built-in? | Realtime? | Sleep/Pause | Verdict |
|---------|---------------------------------------|----------------|-----------|-------------|---------|
| **Supabase** | 500 MB DB, 5 GB egress, 50.000 MAU, 200 realtime conn, 500 rb edge fn, 2 project | **Ya** (email/magic link/OAuth) | **Ya** | **Pause 7 hari** | **PILIHAN** — satu-satunya yang memberi DB+Auth+Realtime+Functions+Cron sekaligus |
| **Neon** | **0,5 GB storage/project**, **100 CU-hours/project/bulan**, 100 project, 10 branch/project, **5 GB egress** | Tidak (perlu Auth.js/Clerk terpisah) | Tidak | **Scale-to-zero setelah 5 menit** (cold start, bukan pause permanen) | Postgres-nya bagus & tidak pernah "mati permanen", tapi Anda harus merakit auth+realtime sendiri → scope MVP meledak |
| **Turso** | 100 database, **5 GB storage**, **500 juta rows read/bulan**, 10 juta rows written/bulan, 3 GB sync, PITR 1 hari, tanpa kartu kredit. Paid: Developer USD 4,99/bulan | Tidak | Tidak | Tidak | Kuota paling longgar, tapi SQLite/libSQL + tanpa auth/realtime. Tidak cocok untuk booking dengan concurrency |
| **PlanetScale** | **TIDAK ADA FREE TIER.** Hobby dihapus April 2024 dan tidak pernah kembali. Termurah: PS-5 Postgres single-node **USD 5/bulan**; cluster HA 3-node dari USD 15 (Postgres) / USD 39 (Vitess MySQL) | Tidak | Tidak | — | **Coret dari daftar** |
| **Firebase Spark** | Firestore: **50.000 read/hari, 20.000 write/hari, 20.000 delete/hari, 1 GiB storage**; Hosting 10 GB storage | Ya (Firebase Auth) | Ya | Tidak | **Jebakan besar: Cloud Functions TIDAK bisa di-deploy di Spark — wajib upgrade ke Blaze (pay-as-you-go) dan wajib pasang kartu kredit** (sumber sekunder menyebut penegasan sejak 3 Feb 2026 — **[PERLU KONFIRMASI]**). Tanpa Cloud Functions, tidak ada webhook Midtrans. Ditambah NoSQL yang canggung untuk laporan keuangan & agregasi |

### DB-08. Kenapa Supabase menang meski punya risiko pause

Karena kombinasi yang dibutuhkan PRD ini — **Postgres relasional + Auth email + Realtime + serverless function untuk webhook + cron + RLS** — hanya tersedia utuh di satu tempat pada tier gratis. Merakitnya dari Neon + Clerk + Deno Deploy + Upstash berarti **empat vendor, empat dashboard, empat titik gagal, empat kebijakan free tier yang bisa berubah**. Untuk MVP satu venue, itu over-engineering.

Tambahan yang penting untuk kasus ini: **Postgres Row Level Security (RLS)** memungkinkan frontend statis bicara langsung ke database dengan aman — pelanggan hanya bisa melihat booking miliknya, admin bisa melihat semua — tanpa perlu menulis lapisan API sendiri. Ini yang membuat arsitektur "SPA statis + Supabase" cukup untuk MVP.

---

## R5. Cron / Scheduled Job Gratis

Kebutuhan konkret dari PRD:

| ID | Job | Frekuensi ideal | Toleransi keterlambatan |
|----|-----|----------------|------------------------|
| CR-J1 | Auto-expire booking yang belum dibayar (hold 15 menit) | tiap 1 menit | **Rendah — ini yang paling ketat** |
| CR-J2 | Reminder H-2 jam ke pelanggan | tiap 15 menit | Sedang |
| CR-J3 | Tutup sesi yang lewat jam & bebaskan meja | tiap 5 menit | Sedang |
| CR-J4 | Rekap harian + tutup buku kasir | 1× sehari (mis. 03:00 WIB) | Tinggi |
| CR-J5 | Backup `pg_dump` | 1× sehari | Tinggi |
| CR-J6 | Keepalive anti-pause Supabase | 1× sehari | Tinggi |

### CR-01. Opsi cron gratis, dibandingkan

| ID | Opsi | Interval minimum | Batas | Biaya | Catatan |
|----|------|-----------------|-------|-------|---------|
| CR-01 | **Supabase Cron (`pg_cron`)** | **1 detik** (mendukung 1–59 detik) | Tersedia di **semua plan termasuk Free** | Rp 0 | Berjalan **di dalam** Postgres. Digabung `pg_net` bisa memanggil Edge Function / webhook HTTP eksternal. **Pilihan utama** |
| CR-02 | **Cloudflare Cron Triggers** | 1 menit | **5 cron trigger per akun** (Free); durasi eksekusi s/d 15 menit; CPU 10 ms | Rp 0 | Andal, tidak pernah tidur. Cadangan bagus |
| CR-03 | **Vercel Cron (Hobby)** | **1× per HARI**, presisi ±59 menit | 100 job/project | Rp 0 | **Tidak memenuhi CR-J1/J2/J3.** Sudah didiskualifikasi juga karena pasal komersial |
| CR-04 | **GitHub Actions `schedule`** | 5 menit (nominal) | Repo privat: kuota menit gratis terbatas. **Scheduled workflow otomatis dinonaktifkan setelah 60 hari tanpa aktivitas commit** | Rp 0 | Eksekusi sering **tertunda** saat runner sibuk — jangan dipakai untuk CR-J1. **Cocok untuk CR-J5 (backup)** |
| CR-05 | **cron-job.org** | **1 menit** (60×/jam) | Jumlah job tidak dibatasi (fair use); **timeout 30 detik**, response maks 64 KB, 100 API call/hari | Rp 0 | **Cocok untuk CR-J6 keepalive** dan sebagai *dead-man switch* eksternal |

### CR-06. Pola arsitektur yang benar — JANGAN gantungkan kebenaran data pada cron

Ini poin engineering paling penting di seksi ini.

**Pola salah:** "booking dianggap hangus kalau cron sudah menandainya hangus."
Kalau cron telat 3 menit, ada jendela 3 menit di mana slot terlihat masih terkunci padahal seharusnya sudah bebas — atau lebih buruk, dua orang bisa bayar untuk slot yang sama.

**Pola benar — kebenaran dihitung dari data, cron hanya membersihkan:**

1. Tabel `bookings` punya kolom `status` (`pending|paid|expired|cancelled`) **dan** `hold_expires_at timestamptz`.
2. Semua query ketersediaan memakai kondisi:
   `WHERE status='paid' OR (status='pending' AND hold_expires_at > now())`
   → Booking yang lewat waktu **otomatis tidak dihitung**, bahkan sebelum cron menyentuhnya. Cron jadi sekadar housekeeping, bukan penentu kebenaran.
3. Anti double-booking di level database, bukan di level aplikasi. Gunakan `EXCLUDE` constraint dengan `tstzrange`:
   ```sql
   ALTER TABLE bookings ADD CONSTRAINT no_overlap
   EXCLUDE USING gist (
     table_id WITH =,
     tstzrange(start_at, end_at) WITH &&
   ) WHERE (status IN ('pending','paid'));
   ```
   Ini membuat **race condition mustahil secara struktural** — dua request bersamaan, satu pasti ditolak oleh Postgres. Jauh lebih kuat daripada cek `SELECT` lalu `INSERT` di kode aplikasi.
4. `pg_cron` tiap 1 menit hanya menjalankan `UPDATE bookings SET status='expired' WHERE status='pending' AND hold_expires_at < now()` — murni untuk kerapian data dan laporan.

**Konsekuensi positif:** kalau cron mati seminggu pun, aplikasi tetap **benar**. Yang rusak hanya kerapian laporan. Ini yang memungkinkan pakai tier gratis dengan tenang.

---

## R6. Email Transaksional

### EM-01. Perbandingan

| ID | Layanan | Kuota gratis | Batas harian | Retensi log | Layak untuk OTP/magic link? |
|----|---------|-------------|--------------|-------------|----------------------------|
| EM-01 | **Supabase built-in SMTP** | **2 email per JAM per project** | ±48/hari | — | **TIDAK.** Supabase sendiri menyatakan ini "best-effort, non-production use cases" |
| EM-02 | **Resend Free** | **3.000 email/bulan** | **100 email/hari** | **30 hari** | **Ya** — 3 custom domain, API bersih, integrasi Supabase SMTP mudah |
| EM-03 | **Brevo Free** | **300 email/hari** (±9.000/bulan) | 300/hari | Unlimited log | **Ya** — kuota harian 3× Resend, tapi **kuota dibagi dengan email marketing** |
| EM-04 | Resend Pro | 50.000/bulan, USD 20/bulan, overage USD 0,90/1.000 | — | — | Untuk nanti |

### EM-05. Perangkap yang wajib diketahui: rate limit Auth Supabase

- Default SMTP bawaan Supabase: **2 auth email per jam per project**, dibagi rata untuk sign-up, invite, magic link, dan reset password. Kalau dipakai produksi, pelanggan ke-3 di jam yang sama langsung dapat error `429: email rate limit exceeded`.
- Setelah memasang **custom SMTP**, Supabase tetap memasang default **30 new users per hour**. Nilai ini **bisa dinaikkan** di *Authentication → Rate Limits*. **Wajib dinaikkan sebelum go-live**, kalau tidak malam pembukaan akan berantakan.

### EM-06. Hitung kebutuhan riil SPL

ASUMSI: 40 booking/hari, 30% pelanggan baru (butuh magic link), 100% booking dapat email konfirmasi, 20% dapat email reminder.

| Jenis email | Per hari | Per bulan |
|-------------|---------|-----------|
| Magic link / OTP login | 12 | 360 |
| Konfirmasi booking + pembayaran | 40 | 1.200 |
| Reminder | 8 | 240 |
| Notifikasi admin (order baru batch) | 5 | 150 |
| **Total** | **±65** | **±1.950** |

### EM-07. Vonis email

- **Resend Free (3.000/bulan) cukup untuk bulan-bulan awal**, tapi **batas 100/hari** akan tersentuh pada hari Sabtu ramai (65 rata-rata → puncak bisa 110+).
- **Rekomendasi: pakai Brevo Free (300/hari) sebagai SMTP utama Supabase Auth**, karena batas *harian*-nya yang jadi bottleneck, bukan batas bulanan. Syarat: jangan campur dengan blast marketing.
- **Alternatif lebih tahan banting:** Resend untuk magic link (volume kecil, deliverability bagus) + Brevo untuk konfirmasi/reminder (volume besar). Dua akun gratis, total 3.000/bulan + 300/hari.
- **Cara paling hemat email:** kurangi ketergantungan pada email. Lihat R7 — konfirmasi booking lebih baik lewat WhatsApp, email cukup untuk login + arsip struk.

### EM-08. Yang wajib disiapkan di DNS sejak awal

SPF, DKIM, dan DMARC untuk domain pengirim. Tanpa ini, email konfirmasi masuk spam dan pelanggan menelepon marah karena "tidak dapat bukti booking". Ini gratis, hanya butuh 3 record DNS di Cloudflare.

---

## R7. Notifikasi WhatsApp untuk Pasar Indonesia

Premis user benar: pelanggan Indonesia membaca WA, bukan email. Tapi trade-off-nya jauh lebih tajam daripada yang terlihat.

### WA-01. Perbandingan tiga jalur

| ID | Opsi | Biaya | Bisa kirim otomatis dari server? | Risiko | Prioritas |
|----|------|-------|----------------------------------|--------|-----------|
| WA-01 | **`wa.me` deep link** | **Rp 0** | **TIDAK.** Hanya membuka aplikasi WA di HP pelanggan/admin dengan pesan yang sudah terisi — **pelanggan/admin masih harus menekan Kirim** | Nol. Tidak ada API, tidak ada akun yang bisa diblokir | **MVP** |
| WA-02 | **Fonnte** (unofficial gateway) | Lite Rp 25.000/bln, Reguler Rp 66.000/bln, Regular Pro Rp 110.000/bln, Master Rp 175.000/bln. Ada versi gratis untuk development. **[PERLU KONFIRMASI]** harga terbaru langsung di fonnte.com | **Ya**, via REST API + webhook | **Tinggi.** Ini melanggar ToS WhatsApp — nomor bisa **dibanned permanen** tanpa peringatan. Kalau nomor yang di-banned adalah nomor bisnis utama SPL, itu kerugian nyata | **Fase 2**, dan **wajib pakai nomor terpisah**, bukan nomor utama venue |
| WA-03 | **WhatsApp Business API resmi (WABA/Meta)** | Per pesan template terkirim. Tarif Indonesia (sumber sekunder, **[PERLU KONFIRMASI]** ke BSP): marketing ±Rp 586,33; **utility ±Rp 356,65**; authentication ±Rp 356,65 — **belum termasuk PPN**. Meta memberi **1.000 service conversation gratis/bulan** per WABA. Pesan utility & authentication di dalam *customer service window* disebut gratis **sampai 1 Oktober 2026** | **Ya**, resmi & stabil | Rendah (legal). Butuh verifikasi bisnis Meta + BSP | **Fase 2–3** |

### WA-04. Hitungan biaya WABA untuk SPL

ASUMSI: 40 booking/hari × 2 pesan (konfirmasi + reminder) = 80 pesan utility/hari = **2.400 pesan/bulan**.

| Skenario | Perhitungan | Biaya/bulan |
|----------|------------|-------------|
| Semua di luar service window (worst case) | 2.400 × Rp 356,65 | **±Rp 856.000** + PPN |
| 1.000 pertama gratis (service conversation) | 1.400 × Rp 356,65 | **±Rp 499.000** + PPN |
| Sebagian besar dalam service window (pelanggan membalas duluan) | — | Mendekati **Rp 0** sampai 1 Okt 2026 |

**Perbandingan:** biaya WABA (±Rp 500–856 ribu/bulan) **lebih mahal daripada seluruh biaya hosting berbayar** (Supabase Pro ±Rp 412 ribu). Jadi WhatsApp resmi bukan "notifikasi murah" — ini pos biaya tersendiri yang harus masuk perhitungan bisnis.

### WA-05. Strategi bertahap yang direkomendasikan

**MVP (Rp 0):**
1. Setelah pembayaran sukses, halaman konfirmasi menampilkan tombol besar **"Kirim bukti booking ke WhatsApp saya"** → `https://wa.me/62xxxx?text=<detail booking ter-encode>`. Pelanggan menekan kirim sendiri, pesan masuk ke chat-nya sebagai arsip.
2. Untuk admin: dashboard realtime (Supabase Realtime) + **notifikasi suara di browser** + **Web Push (PWA)**. Ini gratis, instan, dan tidak butuh WA sama sekali. Admin yang duduk di kasir tidak perlu WA — dia butuh dashboard yang berbunyi.
3. Tombol `wa.me` ke nomor venue untuk komplain/pertanyaan.

**Fase 2 (Rp 25–110 ribu/bulan):** Fonnte dengan **nomor khusus notifikasi** (bukan nomor utama). Kirim konfirmasi + reminder otomatis. Terima kalau sewaktu-waktu nomor kena banned — itu sudah diperhitungkan, ganti nomor.

**Fase 3 (Rp 500 ribu+/bulan):** WABA resmi lewat BSP lokal, setelah volume booking membenarkan biayanya dan setelah 1 Okt 2026 (saat perubahan pricing Meta sudah jelas).

### WA-06. Peringatan penting

Web Push notification untuk **admin** menyelesaikan 80% kebutuhan "notifikasi realtime" dengan biaya Rp 0 dan tanpa risiko banned. Jangan bayar WhatsApp API hanya untuk memberi tahu admin sendiri — WhatsApp seharusnya untuk pelanggan.

---

## R8. Rekomendasi Stack Final

### ST-01. Opsi A — "Rp 0, 100% legal, tidak sleep" (REKOMENDASI untuk MVP)

| Lapisan | Pilihan | Biaya | Kenapa |
|---------|---------|-------|--------|
| Frontend | **Cloudflare Pages** — SPA statis (Vite + React, atau SvelteKit adapter-static, atau Next.js `output: export`) | Rp 0 | Bandwidth tidak dibatasi, tidak pernah sleep, komersial diizinkan, custom domain gratis, 500 build/bulan |
| Database | **Supabase Postgres Free** | Rp 0 | 500 MB, RLS, `EXCLUDE` constraint anti double-booking |
| Auth email | **Supabase Auth** (magic link / OTP email) | Rp 0 | 50.000 MAU |
| Realtime status meja | **Supabase Realtime** | Rp 0 | 200 concurrent connection — jauh di atas kebutuhan 1 venue |
| Webhook Midtrans/Doku | **Supabase Edge Function** (JWT verification **dimatikan** untuk endpoint ini) | Rp 0 | 500.000 invocation/bulan; URL publik HTTPS valid, port 443, sertifikat tepercaya — memenuhi syarat notification URL Midtrans |
| Cron | **`pg_cron` + `pg_net`** di dalam Supabase | Rp 0 | Interval s/d 1 detik, tersedia di Free |
| Email transaksional | **Brevo Free** (300/hari) sebagai custom SMTP Supabase; opsional Resend Free untuk magic link | Rp 0 | Melewati jebakan 2 email/jam |
| Notifikasi admin | **Supabase Realtime + Web Push (PWA) + suara browser** | Rp 0 | Instan, tanpa WA |
| Notifikasi pelanggan | **`wa.me` deep link** + email | Rp 0 | Tanpa risiko banned |
| Gambar menu | **Cloudflare Pages / R2** (bukan Supabase Storage) | Rp 0 | Melindungi kuota egress 5 GB Supabase |
| Backup | **GitHub Actions** → `pg_dump` harian → private repo / R2 | Rp 0 | Menambal ketiadaan backup di Supabase Free |
| Keepalive anti-pause | **cron-job.org** ping harian ke endpoint yang menyentuh DB | Rp 0 | Mitigasi pause 7 hari |
| Source & CI/CD | **GitHub** → auto-deploy ke Cloudflare Pages | Rp 0 | Peran GitHub yang benar |
| Payment | **Midtrans** atau **Doku** — QRIS **MDR 0,7%** per transaksi sukses (belum termasuk PPN), tanpa setup fee, tanpa biaya bulanan | Variabel | Bukan biaya hosting, tapi biaya transaksi |

**Total biaya tetap: Rp 0/bulan** (di luar domain dan MDR pembayaran).
**Total vendor: 4** (Cloudflare, Supabase, Brevo, GitHub) + 1 payment gateway. Cukup ramping untuk dikelola satu orang.

### ST-02. Kenapa Cloudflare Pages, bukan Netlify Free?

Netlify **boleh** komersial dan itu poin bagus. Tapi model **300 credits/bulan** membuat bandwidth dan build berbagi satu dompet — 20 kali deploy di minggu perilisan bisa menghabiskan jatah, dan **situs pause sampai siklus berikutnya**. Untuk aplikasi yang menerima uang, "situs pause karena terlalu sering deploy" adalah mode kegagalan yang tidak bisa diterima. Cloudflare Pages memberi bandwidth tak dibatasi dengan 500 build/bulan yang terpisah — batasnya lebih sulit tersentuh dan lebih mudah diprediksi.

Netlify Free tetap **alternatif nomor satu** kalau nanti Anda benar-benar butuh SSR/ISR yang tidak nyaman di Workers Free.

### ST-03. Opsi B — "Berbayar minimum, tenang" (target 3–6 bulan setelah launch)

| Item | Biaya USD | Biaya IDR (ASUMSI kurs Rp 16.500/USD, **[PERLU KONFIRMASI]**) |
|------|-----------|-------------------|
| Supabase Pro | 25 | ±Rp 412.500 |
| Cloudflare Pages | 0 | Rp 0 |
| Brevo/Resend Free | 0 | Rp 0 |
| Domain `.com` (Cloudflare Registrar, at-cost) | ±10,44/tahun | ±Rp 14.400/bulan |
| **Total** | **±25,9** | **±Rp 427.000/bulan** |

Yang Anda **beli** dengan Rp 412 ribu itu, konkretnya: **tidak ada pause**, **daily backup otomatis**, DB 8 GB, egress 250 GB, log retention 7 hari (penting untuk investigasi sengketa pembayaran), dan akses email support. Untuk bisnis yang memutar uang setiap hari, ini murah — setara ±7 sesi biliar per bulan.

### ST-04. Yang TIDAK direkomendasikan, dan alasannya dalam satu kalimat

| Ditolak | Alasan |
|---------|--------|
| Vercel Hobby | Melanggar ToS secara harfiah (memproses pembayaran) **dan** cron dibatasi 1×/hari |
| GitHub Pages sendirian | Dilarang untuk transaksi komersial, tidak ada server untuk webhook, tidak ada tempat aman untuk Server Key |
| Render Free | Spin-down 15 menit membunuh webhook; Postgres gratis **dihapus setelah 30 hari** |
| Railway Trial | Kredit sekali pakai, bukan free tier berkelanjutan |
| Fly.io | Tidak ada free tier untuk akun baru sejak Okt 2024 |
| Firebase Spark | Cloud Functions wajib upgrade Blaze + kartu kredit; NoSQL menyulitkan laporan keuangan |
| PlanetScale | Free tier sudah tidak ada sejak April 2024 |

---

## R9. Path Migrasi ke Domain Sendiri dan Tier Berbayar

### MG-01. Tahapan

| Tahap | Pemicu | Perubahan | Biaya tetap/bulan |
|-------|--------|-----------|-------------------|
| **T0 — MVP** | Sekarang | Opsi A, domain `*.pages.dev` bawaan Cloudflare, Midtrans **Sandbox** | **Rp 0** |
| **T1 — Go-live** | Siap terima uang asli | Beli domain, aktifkan custom domain di Cloudflare Pages (gratis), aktifkan Midtrans **Production** (butuh verifikasi merchant), verifikasi domain email di Brevo/Resend | **±Rp 15.000** (domain diamortisasi) |
| **T2 — Stabilisasi** | Sudah jalan 1–3 bulan / DB > 350 MB / egress > 4 GB / takut kena pause saat libur | Upgrade **Supabase Pro** | **±Rp 427.000** |
| **T3 — Skala** | > 2.400 pesan WA/bulan dibutuhkan, atau > 3.000 email/bulan | Tambah Fonnte (Rp 66.000) atau WABA (±Rp 500.000), Resend Pro (±Rp 330.000) bila perlu | **±Rp 500.000 – 1.300.000** |

### MG-02. Yang berubah SECARA TEKNIS saat pindah ke domain sendiri (checklist)

| ID | Item | Keterangan |
|----|------|-----------|
| MG-02a | DNS | Pindahkan nameserver domain ke Cloudflare (gratis). Cloudflare Registrar menjual domain **at-cost** tanpa markup — biasanya lebih murah daripada registrar lokal untuk `.com` |
| MG-02b | Custom domain Cloudflare Pages | Gratis, SSL otomatis, tidak ada batas jumlah domain |
| MG-02c | **Supabase Auth redirect URL** | **Wajib diubah.** `Site URL` + `Redirect URLs` di Supabase harus menunjuk ke domain baru, kalau tidak magic link akan mengarah ke domain lama dan login **rusak total** |
| MG-02d | **Midtrans Notification URL** | **Wajib diubah** ke URL Edge Function produksi. Ganti juga Client Key & Server Key dari sandbox ke production |
| MG-02e | CORS | Batasi origin yang diizinkan ke domain baru saja |
| MG-02f | SPF / DKIM / DMARC | Tambahkan record dari Brevo/Resend ke DNS Cloudflare, verifikasi domain pengirim |
| MG-02g | Supabase custom domain (opsional) | Endpoint API tetap `xxxx.supabase.co` kecuali membeli add-on custom domain (±USD 10/bulan — **[PERLU KONFIRMASI]** harga terbaru). **Tidak perlu untuk MVP** — pelanggan tidak melihat URL API |
| MG-02h | Content Security Policy | Perlu menyertakan domain Snap Midtrans agar popup pembayaran tidak diblokir |

### MG-03. Biaya transaksi (bukan hosting, tapi harus masuk model bisnis)

| Item | Midtrans | Doku |
|------|----------|------|
| QRIS MDR | **0,7%** per transaksi sukses, belum termasuk PPN | **0,7%**, belum termasuk PPN |
| Setup fee | Tidak ada | Tidak ada |
| Biaya bulanan | Tidak ada | Tidak ada |
| Settlement | — | T+1 hari kerja |

Contoh konkret: sesi biliar Rp 60.000 → MDR ±Rp 420. Order F&B Rp 150.000 → MDR ±Rp 1.050. Pada 40 booking + 60 order/hari dengan rata-rata Rp 100.000, MDR bulanan ±Rp 2.100.000. **[PERLU KONFIRMASI]** apakah MDR ini dibebankan ke pelanggan atau ditanggung venue — ini keputusan bisnis yang mempengaruhi tampilan harga di aplikasi.

**Catatan operasional (`docs.midtrans.com`):** mulai 1 April 2026 pembayaran GoPay dialihkan ke aplikasi GoPay standalone secara bertahap, dan Midtrans menandai `payment_type` transaksi sebagai `qris` — **format field JSON di webhook/HTTP Notification & Get Status API berubah**. Handler webhook harus ditulis defensif terhadap perubahan field, jangan hardcode struktur JSON.

---

## R10. Batas-Batas yang Akan Tersentuh Duluan (urutan prioritas monitoring)

| Urutan | Batas | Nilai | Perkiraan kapan tersentuh | Aksi |
|--------|-------|-------|--------------------------|------|
| 1 | Resend **100 email/hari** | 100/hari | Hari Sabtu ramai pertama | Pakai Brevo (300/hari) sejak awal |
| 2 | Supabase **egress 5 GB/bulan** | 5 GB | Jika gambar menu disajikan dari Supabase Storage → bisa dalam hitungan minggu | Sajikan semua gambar dari Cloudflare |
| 3 | Supabase **pause 7 hari** | 7 hari | Saat venue tutup panjang atau fase pre-launch | cron-job.org keepalive harian |
| 4 | Supabase **DB 500 MB** | 500 MB | ±3–5 tahun (dengan prune log) | Prune tabel webhook-raw & audit log |
| 5 | Cloudflare Workers **100.000 req/hari** | 100k/hari | Sangat jauh untuk 1 venue | — |
| 6 | Supabase **50.000 MAU** | 50k | Sangat jauh untuk 1 venue | — |

---

## R11. Sumber Terverifikasi

- [Vercel Hobby Plan (docs)](https://vercel.com/docs/plans/hobby.md)
- [Vercel Fair Use Guidelines — Commercial usage](https://vercel.com/docs/limits/fair-use-guidelines)
- [Vercel Cron Jobs — Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel KB — Why has my account or deployment been paused?](https://vercel.com/kb/guide/why-is-my-account-deployment-blocked)
- [GitHub Pages limits (docs.github.com)](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase — Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase — Going into Production checklist](https://supabase.com/docs/guides/platform/going-into-prod)
- [Supabase — Cron / pg_cron](https://supabase.com/docs/guides/cron)
- [Cloudflare Workers — Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers — Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Pages Functions — Pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Netlify Pricing](https://www.netlify.com/pricing/) · [Netlify Support — commercial use on Free plan](https://answers.netlify.com/t/can-we-use-netlify-free-plan-for-commercial-purposes/41545)
- [Render — Deploy for Free (docs)](https://render.com/docs/free)
- [Railway — Pricing Plans (docs)](https://docs.railway.com/pricing/plans)
- [Deno Deploy Pricing](https://deno.com/deploy/pricing)
- [Neon Pricing](https://neon.com/pricing)
- [Turso Pricing](https://turso.tech/pricing)
- [Resend Pricing](https://resend.com/pricing) · [Brevo Transactional Email](https://www.brevo.com/products/transactional-email/)
- [cron-job.org FAQ](https://cron-job.org/en/faq/)
- [Midtrans — HTTP(S) Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks) · [Midtrans — biaya QRIS](https://docs.midtrans.com/docs/what-is-the-applicable-transaction-fee-for-qris) · [Midtrans — QRIS reference](https://docs.midtrans.com/reference/qris)
- [Fonnte](https://fonnte.com/) · [Firebase Pricing](https://firebase.google.com/pricing)

---

## R12. Asumsi yang Perlu Dikonfirmasi Pemilik

| ID | Asumsi | Dampak jika salah |
|----|--------|------------------|
| AS-01 | **[PERLU KONFIRMASI]** Volume ±40 booking + 60 order F&B per hari | Semua perhitungan kuota egress, email, dan WA bergeser proporsional |
| AS-02 | **[PERLU KONFIRMASI]** Kurs Rp 16.500/USD | Estimasi biaya bulanan bergeser |
| AS-03 | **[PERLU KONFIRMASI]** Venue tidak pernah tutup > 7 hari berturut-turut | Risiko Supabase pause naik drastis; keepalive jadi wajib mutlak |
| AS-04 | **[PERLU KONFIRMASI]** MDR 0,7% ditanggung venue, bukan dibebankan ke pelanggan | Mempengaruhi tampilan harga & margin |
| AS-05 | **[PERLU KONFIRMASI]** Harga paket Fonnte terbaru (angka dari sumber sekunder) | Estimasi biaya Fase 2 |
| AS-06 | **[PERLU KONFIRMASI]** Tarif per pesan WABA Indonesia & status "gratis sampai 1 Okt 2026" — verifikasi ke BSP resmi | Estimasi biaya Fase 3 bisa meleset besar |
| AS-07 | **[PERLU KONFIRMASI]** Apakah `pg_cron` internal dihitung sebagai aktivitas yang mencegah pause Supabase | Menentukan apakah keepalive eksternal wajib atau sekadar sabuk pengaman |
| AS-08 | **[PERLU KONFIRMASI]** Harga add-on custom domain Supabase (±USD 10/bulan) | Hanya relevan di T3 |
| AS-09 | **[PERLU KONFIRMASI]** Rasio credit→bandwidth Netlify Free terbaru | Hanya relevan jika beralih dari Cloudflare |
| AS-10 | **[PERLU KONFIRMASI]** Firebase Cloud Functions wajib Blaze sejak 3 Feb 2026 (sumber sekunder) | Firebase sudah ditolak karena alasan lain juga |
| AS-11 | **[PERLU KONFIRMASI]** Pilihan payment gateway final: Midtrans atau Doku (tarif QRIS identik 0,7%; pembeda ada di metode pembayaran lain, dashboard, dan kecepatan settlement) | Mempengaruhi implementasi webhook & SDK |

## Risiko
- KRITIS — Vercel Hobby melarang penggunaan komersial secara eksplisit di Fair Use Guidelines, dan definisinya secara harfiah mencakup 'any method of requesting or processing payment from visitors of the site'. Konsekuensi: deployment di-pause, pengunjung dapat error 503 DEPLOYMENT_PAUSED, dan pemulihan TIDAK otomatis (harus upgrade dulu). Risiko nyata: sistem mati di jam ramai setelah pelanggan membayar.
- KRITIS — Vercel Cron di plan Hobby dibatasi SEKALI PER HARI dengan presisi ±59 menit. Fitur auto-expire booking 15 menit secara teknis mustahil; deploy dengan ekspresi cron lebih sering akan GAGAL saat build.
- KRITIS — GitHub Pages dilarang eksplisit untuk 'facilitating commercial transactions', tidak punya runtime server sehingga webhook Midtrans tidak punya endpoint, dan tidak punya tempat aman untuk Midtrans Server Key (semua file publik). Tidak bisa dipakai sendirian dengan cara apa pun.
- TINGGI — Supabase Free di-pause setelah ±7 hari tanpa aktivitas database. Saat paused, API mati total dan webhook pembayaran gagal. Restore harus MANUAL dari dashboard. Bahaya terbesar saat venue tutup panjang atau fase pre-launch. Tidak dikonfirmasi apakah pg_cron internal mencegah pause — butuh keepalive eksternal.
- TINGGI — Supabase Free TIDAK punya backup dan backup tidak bisa diunduh. Untuk aplikasi yang memegang catatan pembayaran, satu kesalahan migrasi atau DELETE tanpa WHERE berarti data keuangan hilang permanen. Wajib pasang pg_dump harian via GitHub Actions sejak hari pertama, dan uji restore sebelum go-live.
- TINGGI — SMTP bawaan Supabase hanya 2 email per JAM per project dan dinyatakan sendiri oleh Supabase sebagai non-production. Tanpa custom SMTP, pelanggan ketiga di jam yang sama gagal login dengan error 429. Setelah pasang custom SMTP pun masih ada default 30 new users/hour yang WAJIB dinaikkan manual sebelum go-live.
- SEDANG — Batas Resend Free 100 email/hari (bukan batas bulanan 3.000) akan tersentuh pada Sabtu ramai. Brevo Free 300/hari lebih aman, tapi kuotanya dibagi dengan email marketing.
- SEDANG — Egress Supabase Free hanya 5 GB/bulan. Jika gambar menu disajikan dari Supabase Storage, kuota bisa habis dalam hitungan minggu. Semua aset gambar wajib disajikan dari Cloudflare Pages/R2.
- SEDANG — Cloudflare Workers Free membatasi CPU 10 ms per invocation. Cukup untuk handler webhook tipis, TIDAK cukup untuk SSR framework berat. Arsitektur harus SPA statis, bukan Next.js SSR di edge.
- SEDANG — Fonnte adalah WhatsApp gateway unofficial yang melanggar ToS WhatsApp; nomor bisa dibanned permanen tanpa peringatan. Wajib memakai nomor terpisah, bukan nomor bisnis utama venue.
- SEDANG — Biaya WhatsApp Business API resmi (±Rp 500.000-856.000/bulan pada 2.400 pesan) LEBIH MAHAL daripada seluruh biaya hosting berbayar. WhatsApp resmi bukan solusi notifikasi murah.
- SEDANG — Netlify Free memakai model 300 credits/bulan di mana bandwidth dan build berbagi satu pool; kalau credit habis situs PAUSE sampai siklus berikutnya. Deploy intensif di minggu perilisan bisa mematikan situs produksi.
- RENDAH-SEDANG — Render Free spin-down setelah 15 menit tanpa traffic dengan cold start ±1 menit (webhook Midtrans akan timeout), dan Postgres gratisnya EXPIRE 30 hari setelah dibuat lalu data dihapus setelah 14 hari grace. Dokumentasi Render sendiri menulis 'Do not use them for production applications'.
- RENDAH-SEDANG — Railway hanya memberi grant sekali USD 5 (bukan free tier berkelanjutan) dan Fly.io sudah tidak punya free tier untuk akun baru sejak Oktober 2024. PlanetScale menghapus free tier sejak April 2024. Ketiganya bukan opsi gratis.
- RENDAH-SEDANG — Firebase Spark tidak bisa deploy Cloud Functions sama sekali; wajib upgrade ke Blaze dan memasang kartu kredit. Tanpa Cloud Functions tidak ada webhook Midtrans.
- RENDAH — GitHub Actions scheduled workflow otomatis dinonaktifkan setelah 60 hari tanpa commit, dan eksekusinya sering tertunda saat runner sibuk. Jangan dipakai untuk job yang sensitif waktu seperti auto-expire booking; pakai hanya untuk backup harian.
- RENDAH — Mulai 1 April 2026 Midtrans mengubah alur GoPay ke aplikasi standalone dan menandai payment_type sebagai 'qris', yang mengubah format field JSON di webhook. Handler webhook harus defensif terhadap perubahan struktur JSON.
- RISIKO KEBENARAN DATA — Menggantungkan expiry booking pada cron menciptakan jendela race condition. Wajib pakai kolom hold_expires_at yang dievaluasi di setiap query ketersediaan, ditambah EXCLUDE constraint GiST di Postgres agar double-booking mustahil secara struktural, bukan sekadar dicek di kode aplikasi.

## Rekomendasi
STACK FINAL — Opsi A ("Rp 0, legal komersial, tidak pernah sleep"): Cloudflare Pages (SPA statis: Vite+React atau SvelteKit adapter-static) untuk frontend + Supabase Free untuk Postgres, Auth email magic link, Realtime status meja, Edge Function penerima webhook Midtrans/Doku, dan pg_cron+pg_net untuk scheduled job + Brevo Free (300 email/hari) sebagai custom SMTP Supabase + GitHub untuk source, CI/CD, dan pg_dump harian ke private repo + cron-job.org untuk keepalive anti-pause + notifikasi admin lewat Supabase Realtime & Web Push PWA (bukan WhatsApp) + notifikasi pelanggan lewat wa.me deep link. Total biaya tetap Rp 0/bulan, empat vendor, semuanya legal untuk komersial, tidak ada satu pun yang sleep atau spin-down.

BUANG VERCEL HOBBY SEPENUHNYA. Bukan karena kuotanya kecil, tapi karena Fair Use Guidelines Vercel melarang komersial secara harfiah dengan contoh pertama "any method of requesting or processing payment from visitors of the site" — persis fitur inti aplikasi ini. Ditambah cron Hobby yang dibatasi sekali per hari, yang membuat auto-expire booking 15 menit mustahil. Kalau nanti tetap ingin ekosistem Vercel, itu berarti Vercel Pro USD 20/user/bulan, dan pada harga itu Supabase Pro USD 25 memberi nilai jauh lebih besar.

JAWABAN LANGSUNG UNTUK "HOSTING DI GITHUB": GitHub tetap dipakai, tapi sebagai version control, CI/CD, dan mesin backup — bukan sebagai host aplikasi. GitHub Pages tidak bisa dipakai sendirian karena tiga alasan yang masing-masing sudah fatal: (1) ToS-nya melarang eksplisit situs yang memfasilitasi transaksi komersial, (2) tidak ada runtime server sehingga webhook Midtrans tidak punya alamat untuk dikirimi POST — tanpa itu status pembayaran tidak pernah masuk ke sistem, (3) tidak ada tempat menyimpan Midtrans Server Key karena semua file yang ter-deploy bisa dibaca publik.

TIGA HAL YANG WAJIB DIPASANG SEJAK HARI PERTAMA, BUKAN FASE 2: (1) EXCLUDE constraint GiST di tabel bookings agar double-booking mustahil secara struktural di level Postgres, digabung dengan kolom hold_expires_at yang dievaluasi di setiap query ketersediaan sehingga kebenaran data tidak bergantung pada cron; (2) pg_dump harian via GitHub Actions karena Supabase Free tidak punya backup sama sekali dan aplikasi ini memegang catatan uang — plus satu kali uji restore sebelum go-live; (3) custom SMTP di Supabase Auth dan menaikkan rate limit dari default 30 new users/hour, karena SMTP bawaan Supabase hanya 2 email per jam dan akan mematikan login di malam pembukaan.

TITIK UPGRADE YANG DIREKOMENDASIKAN: pindah ke Supabase Pro (USD 25 ≈ Rp 412.500/bulan, ASUMSI kurs Rp 16.500) setelah 1-3 bulan operasional, atau lebih cepat kalau DB melewati 350 MB, egress melewati 4 GB/bulan, atau venue berencana tutup lebih dari 7 hari. Yang dibeli dengan uang itu bukan kapasitas, tapi ketiadaan pause, daily backup otomatis, dan log retention 7 hari untuk investigasi sengketa pembayaran — setara ±7 sesi biliar per bulan. Total biaya tahap ini ±Rp 427.000/bulan termasuk domain. WhatsApp otomatis ditunda ke Fase 2 (Fonnte Rp 25.000-110.000/bulan dengan nomor terpisah, sadar risiko banned) atau Fase 3 (WABA resmi ±Rp 500.000-856.000/bulan) — perhatikan bahwa biaya WhatsApp resmi lebih besar daripada seluruh biaya hosting, jadi jangan masukkan ke MVP.