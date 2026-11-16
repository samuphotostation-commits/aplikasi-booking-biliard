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
  versi: "1.3.5",
  nama: "SPL-Kasir-Setup-1.3.5.exe",
  ukuranMb: 98,
  sha256: "39db3d93f862a4ec439ab42160e2da5aaa4ad97283fbdfd8541394e2263fe01b",
  tanggal: "2026-11-16",
  halaman: "https://kasir.sportspoollounge.com/unduh/windows.html",
};
