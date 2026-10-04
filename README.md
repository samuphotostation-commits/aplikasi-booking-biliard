# SPL Booking Biliar

Aplikasi booking, kasir, dan operasional SPL Sports Pool Lounge & Smokehouse.
Project ini dibuat dengan React, Vite, TypeScript, Electron, Capacitor Android, dan Supabase.

## Fitur utama

- Dashboard kasir untuk meja biliar, resto, F&B, stok, promo, shift, dan laporan.
- Mode tamu untuk booking meja dan pemesanan dari HP.
- Sinkronisasi realtime berbasis Supabase.
- Build web, Electron Windows, dan APK Android.
- Integrasi QRIS disiapkan melalui Supabase Edge Functions.

## Setup lokal

1. Install dependency:

```bash
npm install
```

2. Buat file `.env.local` dari contoh:

```bash
cp .env.example .env.local
```

3. Jalankan mode lokal:

```bash
npm run dev
```

Tanpa `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`, aplikasi tetap berjalan dalam mode lokal/demo.

## Script penting

```bash
npm run test
npm run app
npm run app:jalan
npm run app:win
npm run apk
npm run apk:kasir
```

## Build web

Build aplikasi staf:

```bash
npm run app
```

Build aplikasi tamu:

```bash
VITE_MODE_TAMU=1 WEB_OUT=web-tamu npm run app
```

Folder `web/`, `web-tamu/`, `dist/`, dan `release/` adalah hasil build dan tidak ikut commit.

## Catatan keamanan

- `.env.local` tidak ikut Git.
- Secret Supabase, DOKU, Midtrans, dan WhatsApp harus disimpan di environment/secret manager masing-masing.
- Folder arsip besar seperti `/foto`, `/MENU-*`, dan `/Table Number-*` tidak ikut repo agar GitHub tetap ringan.
