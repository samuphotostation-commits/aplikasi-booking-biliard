import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

/**
 * ALAMAT BERSIH: sportspoollounge.com/pesanan, tanpa tanda pagar.
 *
 * Aplikasi Windows berjalan dari skema spl:// tanpa server, jadi hanya di sana
 * rute tetap lewat hash. Ini ditentukan saat jalan karena berkasnya sama
 * dengan yang diterbitkan ke situs.
 */
const web = /^https?:$/.test(window.location.protocol);
const Router = web ? BrowserRouter : HashRouter;

/**
 * Tautan lama seperti /#/admin/kasir dan /?splakun=1#/pesanan masih beredar.
 * Dirapikan di tempat, sebelum aplikasi membaca alamatnya.
 */
if (web) {
  const { pathname, search, hash } = window.location;
  const q = new URLSearchParams(search);
  const adaPenanda = q.has("splakun");
  q.delete("splakun");
  const sisa = q.toString();
  const jalur = hash.startsWith("#/") ? hash.slice(1) : null;
  if (jalur || adaPenanda) {
    const sambung = (jalur ?? pathname).includes("?") ? "&" : "?";
    window.history.replaceState(null, "", `${jalur ?? pathname}${sisa ? sambung + sisa : ""}`);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
