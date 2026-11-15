/**
 * INSTALLER WINDOWS TERBARU — DITULIS OTOMATIS oleh scripts/unggah-windows.mjs.
 *
 * Pemilik 15 Nov 2026: "ketika klik download langsung terdownload aplikasi
 * versi terbarunya". Installer ada di Supabase Storage (bucket "app",
 * folder unduh/), dipecah per 45 MB karena batas 50 MB Supabase. Halaman
 * /unduh/windows.html di situs kasir menyatukan & memeriksanya, lalu
 * menyimpan satu berkas .exe. Tautan manual di Pengaturan tetap cadangan.
 */
export const RILIS_WINDOWS: { versi: string; nama: string; ukuranMb: number; sha256: string; tanggal: string; halaman: string } | null = {
  versi: "1.3.3",
  nama: "SPL-Kasir-Setup-1.3.3.exe",
  ukuranMb: 98,
  sha256: "8f0c7e0cdf18ab3a32fbf79da6625cc7d2e8d9b4a2b0ef99a221b6e89d5e3bb4",
  tanggal: "2026-11-16",
  halaman: "https://kasir.sportspoollounge.com/unduh/windows.html",
};
