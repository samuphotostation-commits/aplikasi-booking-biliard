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

/**
 * BERKAS MASUK DIBACA DARI index.html HASIL VITE, bukan ditebak dari isi folder.
 *
 * Sejak layar-layar dipecah jadi potongan yang baru diminta saat alamatnya
 * dibuka (`lazy()` di `src/App.tsx`), folder assets berisi PULUHAN berkas .js
 * dan hanya satu di antaranya yang berkas masuk. Cara lama memungut yang
 * pertama dikembalikan `readdirSync` — itu urutan folder, bukan urutan muat.
 * Begitu pemecahan dinyalakan, cara itu akan memasang sebuah potongan acak
 * sebagai berkas masuk, dan hasilnya halaman kosong tanpa satu pun pesan
 * galat yang menjelaskan sebabnya.
 *
 * Vite sudah menuliskan jawabannya sendiri di `dist/index.html`. Itu yang
 * dibaca, jadi berapa pun potongannya, yang dipasang selalu yang benar.
 */
const indexVite = readFileSync(join(DIST, "index.html"), "utf8");
const ambilAset = (pola, apa) => {
  const temu = indexVite.match(pola);
  if (!temu) throw new Error(`${apa} tidak ada di dist/index.html — jalankan vite build dulu`);
  return temu[1].replace(/^\.?\/?assets\//, "");
};
const jsFile = ambilAset(/<script[^>]+src="([^"]+\.js)"/, "berkas masuk JS");
const cssFile = ambilAset(/<link[^>]+href="([^"]+\.css)"/, "berkas CSS");

/**
 * SATU BERKAS vs BERKAS TERPISAH.
 *
 * Bawaan sekarang TERPISAH. Dulu semuanya ditanam ke dalam index.html dan
 * berkasnya jadi 3,5 MB — 2 MB foto + 0,6 MB huruf base64 — yang harus diunduh
 * dan diurai sebelum layar pertama muncul. Dipisah, kerangkanya tinggal ±250 KB,
 * huruf & foto menyusul sendiri tanpa menahan tampilan.
 *
 * `VITE_SATU_BERKAS=1` mengembalikan mode lama, untuk keperluan yang memang
 * butuh satu berkas berdiri sendiri. Di mode itu `vite.config.ts` ikut
 * mematikan pemecahan potongan — satu berkas berdiri sendiri tidak bisa
 * meminta potongan tambahan dari mana pun.
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

/**
 * KEPALA HALAMAN DIBEDAKAN ANTARA SITUS TAMU DAN SITUS KASIR.
 *
 * Dulu keduanya memakai kepala yang sama. Akibatnya dua hal: situs tamu
 * terbit tanpa satu pun keterangan untuk mesin pencari dan pratinjau tautan,
 * dan situs kasir — panel internal — ikut membawa judul yang terdengar seperti
 * halaman jualan. Sekarang masing-masing membawa miliknya sendiri.
 */
const tamu = !!process.env.VITE_MODE_TAMU;

/**
 * Alamat situs tamu, dipakai untuk alamat GAMBAR PRATINJAU dan alamat kanonis.
 *
 * Harus alamat PENUH, bukan relatif: pengurai pratinjau WhatsApp, Instagram,
 * dan Facebook mengambil gambarnya dari servernya sendiri, jadi "og-spl.jpg"
 * saja tidak menunjuk ke mana-mana bagi mereka.
 *
 * Bisa ditimpa lewat SITUS_URL saat venue pindah ke alamat sendiri, supaya
 * ganti domain tidak perlu menyentuh berkas ini.
 */
const ALAMAT_SITUS = (process.env.SITUS_URL ?? "https://spl-tamu.pages.dev").replace(/\/+$/, "");

/**
 * Judul membawa KOTA. Orang mencari "biliar Padang", bukan "SPL" — nama
 * venuenya justru yang paling terakhir mereka ketahui.
 */
const JUDUL = tamu
  ? "SPL Sports Pool Lounge &mdash; Biliar &amp; Smokehouse Resto di Padang"
  : "SPL Sports Pool Lounge &mdash; Kasir";

const RINGKASAN = tamu
  ? "Booking meja biliar dan pesan makanan di SPL Sports Pool Lounge &amp; Smokehouse Resto, Jl. Batang Anai, Padang. Pilih jam dari HP, bayar QRIS, meja terkunci atas namamu. Buka 11.00&ndash;02.00 tiap hari."
  : "Panel kasir &amp; booking meja biliar SPL Sports Pool Lounge.";

/**
 * Pratinjau tautan. Hanya untuk situs tamu — panel kasir tidak punya urusan
 * tampil cantik di linimasa siapa pun.
 */
const kepalaSosial = tamu ? `
<link rel="canonical" href="${ALAMAT_SITUS}/">
<meta property="og:type" content="business.business">
<meta property="og:site_name" content="SPL Sports Pool Lounge">
<meta property="og:locale" content="id_ID">
<meta property="og:title" content="${JUDUL}">
<meta property="og:description" content="${RINGKASAN}">
<meta property="og:url" content="${ALAMAT_SITUS}/">
<meta property="og:image" content="${ALAMAT_SITUS}/og-spl.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Aula biliar SPL Sports Pool Lounge dengan pemain sedang membidik">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${JUDUL}">
<meta name="twitter:description" content="${RINGKASAN}">
<meta name="twitter:image" content="${ALAMAT_SITUS}/og-spl.jpg">` : "";

const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${JUDUL}</title>
<meta name="description" content="${RINGKASAN}">${kepalaSosial}
<meta name="theme-color" content="#0B0B0C">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${tamu ? "SPL" : "SPL Kasir"}">
<!--
  SEMUA alamat relatif dihitung dari AKAR, apa pun kedalaman alamatnya.

  Tanpa ini, satu alamat bertingkat seperti /smokehouse/reservasi membuat
  peramban mencari "assets/..." di /smokehouse/assets/... - tidak ada, lalu
  aturan pengalihan mengantarnya ke index.html, dan yang diterima peramban
  adalah HTML bertipe text/html alih-alih JS/CSS. Hasilnya HALAMAN HITAM
  tanpa satu pun pesan galat yang menjelaskan sebabnya.

  Di aplikasi Windows (skema spl://) ini tetap aman: penangannya membuang
  garis miring depan lalu menggabungkannya ke folder aplikasi, jadi
  "/assets/x.js" menunjuk berkas yang sama dengan "assets/x.js".

  CATATAN: jangan pakai tanda petik-balik di komentar ini - seluruh HTML di
  bawah adalah satu template literal JS, dan satu petik-balik saja memutusnya.
-->
<base href="/">
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
  name: tamu ? "SPL Sports Pool Lounge" : "SPL Sports Pool Lounge — Kasir",
  short_name: tamu ? "SPL" : "SPL Kasir",
  description: tamu
    ? "Booking meja biliar & pesan makanan di SPL Sports Pool Lounge, Padang."
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

// Gambar pratinjau tautan, dibuat oleh `scripts/buat-og.mjs`. Ikut terbit
// hanya di situs tamu — tautan kasir tidak pernah dibagikan ke siapa pun.
if (tamu) copyFileSync("public/og-spl.jpg", join(OUT, "og-spl.jpg"));

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

// Tautan bersih: semua alamat diantar ke aplikasi, lalu main.tsx memindahkan
// jalurnya ke rute hash yang setara. Tanpa ini `/smokehouse` jadi 404 sebelum
// aplikasinya sempat jalan, dan tautan yang dibagikan pemilik mati.
copyFileSync("public/_redirects", join(OUT, "_redirects"));

const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log(`${OUT}/index.html ${mb} MB · manifest + sw (${versi}) + ikon siap diunggah`);
