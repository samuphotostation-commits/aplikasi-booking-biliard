/**
 * Merakit versi WEB yang bisa dipasang sebagai aplikasi (PWA).
 *
 * Hasilnya folder `web/`:
 *   index.html          — kerangka aplikasi (kecil)
 *   assets/             — JS, CSS, huruf, dan foto sebagai berkas terpisah
 *   manifest.webmanifest — supaya browser menawarkan "Install"
 *   sw.js               — juru simpan: sesudah dibuka sekali, aplikasi jalan walau internet putus
 *   ikon-1080.png       — ikon aplikasi
 *
 * Jalankan:  VITE_HASH_ROUTER=1 npx vite build && node scripts/build-web.mjs
 * Alamat di-hash (#/admin) supaya bisa dihosting di path mana pun tanpa
 * pengaturan server khusus.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const DIST = "dist";
const OUT = process.env.WEB_OUT ?? "web";
mkdirSync(OUT, { recursive: true });

const assets = readdirSync(join(DIST, "assets"));
const cssFile = assets.find((f) => f.endsWith(".css"));
const jsFile = assets.find((f) => f.endsWith(".js"));
if (!cssFile || !jsFile) throw new Error("Aset hasil build tidak ditemukan — jalankan vite build dulu");

/**
 * SATU BERKAS vs BERKAS TERPISAH.
 *
 * Bawaan sekarang TERPISAH. Dulu semuanya ditanam ke dalam index.html dan
 * berkasnya jadi 3,5 MB — 2 MB foto + 0,6 MB huruf base64 — yang harus diunduh
 * dan diurai sebelum layar pertama muncul. Dipisah, kerangkanya tinggal ±250 KB,
 * huruf & foto menyusul sendiri tanpa menahan tampilan.
 *
 * `VITE_SATU_BERKAS=1` mengembalikan mode lama, untuk keperluan yang memang
 * butuh satu berkas berdiri sendiri.
 */
const satuBerkas = !!process.env.VITE_SATU_BERKAS;
const css = readFileSync(join(DIST, "assets", cssFile), "utf8");
const js = readFileSync(join(DIST, "assets", jsFile), "utf8");

// Aset disalin apa adanya; nama berkasnya sudah ber-hash dari Vite, jadi aman
// disimpan browser selamanya dan otomatis berganti saat isinya berubah.
rmSync(join(OUT, "assets"), { recursive: true, force: true });
if (!satuBerkas) {
  mkdirSync(join(OUT, "assets"), { recursive: true });
  for (const f of assets) copyFileSync(join(DIST, "assets", f), join(OUT, "assets", f));
}

const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SPL Sports Pool Lounge</title>
<meta name="description" content="Booking meja biliar &amp; pesan makanan di SPL Sports Pool Lounge dan Smokehouse Resto.">
<meta name="theme-color" content="#0B0B0C">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="SPL Kasir">
<link rel="icon" href="ikon-1080.png">
<link rel="apple-touch-icon" href="ikon-1080.png">
<link rel="manifest" href="manifest.webmanifest">
${satuBerkas ? `<style>${css}</style>` : `<link rel="stylesheet" href="assets/${cssFile}">`}
</head>
<body>
<div id="root"></div>
${satuBerkas ? `<script type="module">${js}</script>` : `<script type="module" src="assets/${jsFile}"></script>`}
<script>
  // Juru simpan: aplikasi tetap terbuka saat internet putus (papan tetap terbaca).
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
</script>
</body>
</html>`;
writeFileSync(join(OUT, "index.html"), html);

const versi = createHash("sha256").update(html).digest("hex").slice(0, 12);
writeFileSync(join(OUT, "manifest.webmanifest"), JSON.stringify({
  name: process.env.VITE_MODE_TAMU ? "SPL Sports Pool Lounge" : "SPL Sports Pool Lounge — Kasir",
  short_name: process.env.VITE_MODE_TAMU ? "SPL" : "SPL Kasir",
  description: process.env.VITE_MODE_TAMU
    ? "Booking meja biliar & pesan makanan di SPL Sports Pool Lounge."
    : "Panel kasir & booking meja biliar SPL Sports Pool Lounge.",
  start_url: "./index.html",
  scope: "./",
  display: "standalone",
  orientation: "any",
  background_color: "#0B0B0C",
  theme_color: "#0B0B0C",
  lang: "id",
  icons: [
    { src: "ikon-1080.png", sizes: "1080x1080", type: "image/png", purpose: "any" },
    { src: "ikon-1080.png", sizes: "1080x1080", type: "image/png", purpose: "maskable" },
  ],
}, null, 2));

// Juru simpan sederhana: simpan kerangka aplikasi, layani dari simpanan saat offline.
const praSimpan = satuBerkas ? [] : [`./assets/${cssFile}`, `./assets/${jsFile}`];
writeFileSync(join(OUT, "sw.js"), `const VERSI = "spl-${versi}";
const BERKAS = ["./", "./index.html", "./manifest.webmanifest", "./ikon-1080.png"${praSimpan.map((f) => `, "${f}"`).join("")}];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(BERKAS)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSI).map((x) => caches.delete(x)))));
  self.clients.claim();
});

// Hanya berkas aplikasi yang disimpan. Panggilan ke Supabase SELALU lewat jaringan —
// data venue tidak boleh basi karena simpanan.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Kerangka aplikasi DAN semua aset ber-hash (huruf, foto) ikut disimpan,
  // jadi kunjungan berikutnya tidak mengunduh ulang apa pun.
  const aset = url.pathname.includes("/assets/");
  if (!aset && !BERKAS.some((b) => url.pathname.endsWith(b.replace("./", "")))) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const salinan = r.clone(); caches.open(VERSI).then((c) => c.put(e.request, salinan)); return r; })
      .catch(() => caches.match(e.request).then((r) => r ?? caches.match("./index.html"))),
  );
});
`);

copyFileSync("public/spl-mark.png", join(OUT, "ikon-1080.png"));

// Halaman hukum berdiri sendiri (bukan bagian aplikasi React) supaya alamatnya
// rapi tanpa tanda pagar: dibutuhkan tamu, UU PDP, dan layar izin Google.
copyFileSync("public/privasi.html", join(OUT, "privasi.html"));
copyFileSync("public/ketentuan.html", join(OUT, "ketentuan.html"));

// Tipe berkas & izin juru simpan untuk host statis (Netlify membaca berkas _headers ini).
writeFileSync(join(OUT, "_headers"), `/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
/sw.js
  Content-Type: text/javascript; charset=utf-8
  Service-Worker-Allowed: /
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`);

const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log(`${OUT}/index.html ${mb} MB · manifest + sw (${versi}) + ikon siap diunggah`);
