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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
