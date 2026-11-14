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
 * Jalankan:  npx vite build && node scripts/build-web.mjs
 * Alamat di-hash (#/admin) supaya bisa dihosting di path mana pun tanpa
 * pengaturan server khusus.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, rmSync, statSync, existsSync } from "node:fs";
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
const ALAMAT_SITUS = (process.env.SITUS_URL ?? "https://sportspoollounge.com").replace(/\/+$/, "");

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

/** Nama badan usaha & alamat: harus sama dengan src/data/venue.ts dan public/*.html. */
const BADAN_USAHA = "CV SMOKE HOUSE RESTO";
const ALAMAT_USAHA = "Jl. Batang Anai No. 2, Rimbo Kaluang, Padang Barat, Kota Padang, Sumatera Barat";

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
<meta name="twitter:image" content="${ALAMAT_SITUS}/og-spl.jpg">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "SPL Sports Pool Lounge & Smokehouse Resto",
  legalName: BADAN_USAHA,
  url: `${ALAMAT_SITUS}/`,
  image: `${ALAMAT_SITUS}/og-spl.jpg`,
  telephone: "+6285121180988",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Jl. Batang Anai No. 2, Rimbo Kaluang",
    addressLocality: "Padang Barat, Kota Padang",
    addressRegion: "Sumatera Barat",
    addressCountry: "ID",
  },
  openingHours: "Mo-Su 11:00-02:00",
  sameAs: ["https://www.instagram.com/sportspoollounge/"],
})}</script>` : "";

/**
 * Teks cadangan untuk pemeriksa yang TIDAK menjalankan JavaScript (termasuk
 * sebagian pemeriksa verifikasi bisnis): nama badan usaha, alamat, dan nomor
 * yang bisa dihubungi tetap terbaca di HTML mentahnya.
 */
const tanpaSkrip = tamu ? `
<noscript>
<div style="max-width:40rem;margin:0 auto;padding:24px 20px;font:16px/1.6 system-ui,sans-serif;color:#f2e9dc;background:#0e0d0c">
<h1 style="font-size:1.4rem">SPL Sports Pool Lounge &amp; Smokehouse Resto</h1>
<p>Biliar dan resto di Padang. Buka 11.00&ndash;02.00 setiap hari.</p>
<p>&copy; ${new Date().getFullYear()} ${BADAN_USAHA} &middot; ${ALAMAT_USAHA} &middot; WhatsApp 0851-2118-0988</p>
<p><a href="/ketentuan.html" style="color:#f0a202">Ketentuan</a> &middot; <a href="/privasi.html" style="color:#f0a202">Privasi</a></p>
</div>
</noscript>` : "";

/**
 * Alamat lama dan www diantar ke alamat resmi, dengan jalur dan kode login
 * tetap utuh. Hanya nama persis ini: pratinjau seperti abc123.spl-kasir.pages.dev
 * sengaja tidak ikut, supaya versi lama tetap bisa dibuka saat perlu mundur.
 */
const ALIH_ALAMAT = JSON.stringify(tamu
  ? { "www.sportspoollounge.com": ALAMAT_SITUS, "spl-tamu.pages.dev": ALAMAT_SITUS }
  : { "spl-kasir.pages.dev": "https://kasir.sportspoollounge.com" });

const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<script>(function(){var a=${ALIH_ALAMAT}[location.hostname];if(a)location.replace(a+location.pathname+location.search+location.hash)})()</script>
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
<div id="root"></div>${tanpaSkrip}
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
  start_url: "./",
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

// Halaman pasang firmware lampu (ESP Web Tools) — hanya di situs kasir.
// Berkas firmware diambil dari hasil kompilasi terakhir di paket rilis.
if (!tamu) {
  const FW = "release/Paket-Lampu-ESP32/2-ESP32/bin/lampu-esp32.ino.merged.bin";
  // Dikosongkan dulu: firmware versi lama tidak boleh ikut terbit.
  rmSync(join(OUT, "pasang-lampu"), { recursive: true, force: true });
  mkdirSync(join(OUT, "pasang-lampu"), { recursive: true });
  for (const f of ["index.html", "manifest.json"]) copyFileSync(`public/pasang-lampu/${f}`, join(OUT, "pasang-lampu", f));
  // Pustaka pemasang (esp-web-tools) ikut disimpan di situs sendiri: CDN luar
  // terbukti lambat (>20 detik) dan di lokasi tidak boleh jadi penghalang.
  mkdirSync(join(OUT, "pasang-lampu", "ewt"), { recursive: true });
  for (const f of readdirSync("public/pasang-lampu/ewt")) {
    copyFileSync(`public/pasang-lampu/ewt/${f}`, join(OUT, "pasang-lampu", "ewt", f));
  }
  /* merged.bin berukuran 4 MB dan mengisi 0x9000–0xDFFF (NVS) dengan FF.
     Ditulis utuh, ia MENGHAPUS Wi-Fi, kunci alat, dan nomor board yang
     sudah diisi di lokasi. Jadi dipotong dua: bootloader + tabel partisi
     (0x0–0x8FFF) dan otadata + aplikasi (0xE000 sampai akhir aplikasi).
     NVS di antaranya tidak disentuh. Letak partisi dibaca dari tabelnya
     sendiri; kalau bentuknya lain dari dugaan, build berhenti. */
  try {
    const m = readFileSync(FW);
    const pt = m.subarray(0x8000, 0x9000);
    const part = {};
    for (let i = 0; i + 32 <= pt.length && pt[i] === 0xaa && pt[i + 1] === 0x50; i += 32) {
      part[pt.subarray(i + 12, i + 28).toString("latin1").replace(/\0+$/, "")] = pt.readUInt32LE(i + 4);
    }
    if (part.nvs !== 0x9000 || part.otadata !== 0xe000 || part.app0 !== 0x10000) {
      throw new Error(`tabel partisi tak terduga: ${JSON.stringify(part)}`);
    }
    let akhir = m.length;
    while (akhir > 0x10000 && m[akhir - 1] === 0xff) akhir--;
    akhir = Math.ceil(akhir / 16) * 16;
    writeFileSync(join(OUT, "pasang-lampu", "spl-lampu-awal.bin"), m.subarray(0, 0x9000));
    writeFileSync(join(OUT, "pasang-lampu", "spl-lampu-aplikasi.bin"), m.subarray(0xe000, akhir));
  } catch (e) {
    console.warn(`PERINGATAN: firmware lampu tidak bisa disiapkan (${e.message}). Halaman pasang-lampu tanpa firmware.`);
  }
}

// Tipe berkas & izin juru simpan untuk host statis (Netlify membaca berkas _headers ini).
writeFileSync(join(OUT, "_headers"), `/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
/sw.js
  Content-Type: text/javascript; charset=utf-8
  Service-Worker-Allowed: /
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/versi.json
  Cache-Control: no-cache
  Access-Control-Allow-Origin: *
`);

// Tautan bersih: semua alamat diantar ke aplikasi, lalu main.tsx memindahkan
// jalurnya ke rute hash yang setara. Tanpa ini `/smokehouse` jadi 404 sebelum
// aplikasinya sempat jalan, dan tautan yang dibagikan pemilik mati.
copyFileSync("public/_redirects", join(OUT, "_redirects"));

/*
 * VERSI.JSON — penanda pembaruan (permintaan pemilik 14 Nov 2026).
 *
 * Aplikasi Windows menyimpan salinan situs ini DI DALAM installernya, jadi
 * tidak ikut berubah saat situs dipasang ulang. Berkas ini memberi tahu
 * perangkat yang terpasang bahwa ada versi baru, dan memberi aplikasi
 * Windows daftar berkas + sidik jari SHA-256 untuk mengunduhnya sendiri
 * (lihat electron/main.cjs). Browser & APK Android cukup memuat ulang.
 *
 * `build` = nama berkas masuk JS; nama itu ber-hash dari isinya, jadi
 * berganti tepat ketika kodenya berubah.
 */
if (!tamu && existsSync("release/SPL-Kasir-debug.apk")) {
  // APK kasir memuat situs langsung, jadi tidak pernah basi — cukup satu tautan unduh.
  mkdirSync(join(OUT, "unduh"), { recursive: true });
  copyFileSync("release/SPL-Kasir-debug.apk", join(OUT, "unduh", "SPL-Kasir.apk"));
}
if (!tamu && existsSync("public/unduh/windows.html")) {
  // Halaman unduh installer Windows (pemilik 15 Nov 2026): menyatukan bagian
  // installer dari Supabase Storage, memeriksa SHA-256, lalu menyimpan .exe.
  mkdirSync(join(OUT, "unduh"), { recursive: true });
  copyFileSync("public/unduh/windows.html", join(OUT, "unduh", "windows.html"));
}
{
  // Halaman hukum tidak dibutuhkan aplikasi kasir, dan Cloudflare MENGUBAH isinya
  // saat dilayani (pelindung alamat email) — sidik jarinya tidak akan pernah cocok,
  // dan satu berkas yang tidak cocok membatalkan seluruh pembaruan.
  const LEWATI = new Set(["versi.json", "_headers", "_redirects", "privasi.html", "ketentuan.html"]);
  const LEWATI_FOLDER = new Set(["pasang-lampu", "unduh", "pembaruan"]);
  const berkas = [];
  const jelajah = (rel) => {
    for (const f of readdirSync(join(OUT, rel))) {
      const r = rel ? `${rel}/${f}` : f;
      if (statSync(join(OUT, r)).isDirectory()) { if (!LEWATI_FOLDER.has(r)) jelajah(r); continue; }
      if (LEWATI.has(r)) continue;
      const isi = readFileSync(join(OUT, r));
      berkas.push({ p: r, h: createHash("sha256").update(isi).digest("hex"), n: isi.length });
    }
  };
  jelajah("");
  /* index.html DIUNDUH DARI SALINAN TEKS. Cloudflare Web Analytics menyisipkan
     skrip pelacak ke setiap halaman HTML yang diminta browser — termasuk
     aplikasi Windows — jadi sidik jari index.html yang dilayani tidak pernah
     sama dengan aslinya, dan pembaruannya selalu ditolak. Salinan .txt
     dilayani apa adanya. */
  mkdirSync(join(OUT, "pembaruan"), { recursive: true });
  copyFileSync(join(OUT, "index.html"), join(OUT, "pembaruan", "index.txt"));
  for (const b of berkas) if (b.p === "index.html") b.u = "pembaruan/index.txt";
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  writeFileSync(join(OUT, "versi.json"), JSON.stringify({
    build: satuBerkas ? versi : jsFile,
    aplikasi: pkg.version,
    dibuat: Date.now(),
    ...(existsSync(join(OUT, "unduh", "SPL-Kasir.apk")) ? { android: "unduh/SPL-Kasir.apk" } : {}),
    berkas,
  }));
}

const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log(`${OUT}/index.html ${mb} MB · manifest + sw (${versi}) + ikon siap diunggah`);
