import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode: _mode }) => ({
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 5173 },
  // Alamat aset RELATIF: aplikasi dibuka dari berkas lokal (Electron) maupun
  // dari sub-folder hosting, jadi "/assets/..." tidak boleh dipakai.
  base: './',
  build: {
    /**
     * Menanam SELURUH aset sebagai data URI hanya untuk build satu-berkas.
     *
     * Dulu ini menyala untuk semua build beralamat #hash — termasuk situs tamu
     * dan kasir. Akibatnya index.html jadi 3,5 MB: 2 MB foto + 0,6 MB huruf
     * tertanam base64, padahal kode aplikasinya sendiri cuma 128 KB. Semua itu
     * harus diunduh dan diurai SEBELUM layar pertama muncul, dan satu perbaikan
     * kecil membatalkan simpanan 3,5 MB itu seluruhnya. Sekarang aset jadi
     * berkas terpisah: bisa disimpan browser, diunduh paralel, dan foto baru
     * dimuat saat discroll.
     */
    assetsInlineLimit: process.env.VITE_SATU_BERKAS ? 100_000_000 : 4096,
  },
}))
