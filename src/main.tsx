import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// Build untuk Artifact disajikan sebagai satu berkas tanpa server, jadi rute
// harus lewat hash (#/booking). Build biasa tetap memakai URL bersih.
const Router = import.meta.env.VITE_HASH_ROUTER ? HashRouter : BrowserRouter;

// Kembali dari layar Google: kodenya datang sebagai `?code=…` di query (PKCE),
// sedangkan rute aplikasi hidup di hash. Penanda `splakun` dipasang saat tombol
// Google ditekan; di sini kita lompat ke halaman Akun TANPA membuang query-nya,
// supaya pustaka Supabase masih menemukan kodenya dan sesi member terbentuk.
if (import.meta.env.VITE_HASH_ROUTER
  && /[?&]splakun=1/.test(window.location.search)
  && !window.location.hash.startsWith("#/akun")) {
  window.location.hash = "#/akun";
}

/**
 * TAUTAN BERSIH untuk dibagikan ke pelanggan.
 *
 * Rute aplikasi hidup di hash, tapi alamat seperti
 * `spl-tamu.pages.dev/smokehouse` jauh lebih enak dibagikan daripada
 * `…/#/smokehouse` — dan orang memang mengetiknya tanpa pagar. Cloudflare
 * Pages mengantar semua alamat ke index.html (lihat public/_redirects), lalu
 * baris di bawah ini memindahkannya ke hash yang setara.
 *
 * `replace` dipakai supaya tombol Kembali tidak memantul balik ke alamat
 * tanpa hash dan berputar-putar. Hanya jalan kalau hash-nya memang kosong,
 * jadi tidak pernah menimpa rute yang sudah ada — termasuk jalur Google di atas.
 */
if (import.meta.env.VITE_HASH_ROUTER) {
  const jalur = window.location.pathname.replace(/\/+$/, "");
  const bersih = jalur && jalur !== "/index.html" && !window.location.hash;
  if (bersih) {
    const asal = window.location.origin;
    window.location.replace(`${asal}/#${jalur}${window.location.search}`);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
