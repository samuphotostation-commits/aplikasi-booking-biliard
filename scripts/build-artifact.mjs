/**
 * Menggabungkan hasil `vite build` menjadi SATU berkas HTML mandiri.
 *
 * Vite sudah menanam font & foto sebagai data URI (lihat `assetsInlineLimit`
 * di vite.config.ts saat VITE_HASH_ROUTER aktif), jadi di sini tinggal
 * menyatukan CSS + JS ke dalam satu berkas dan MELEPAS kerangka dokumen —
 * host Artifact menyediakan <!doctype>/<html>/<head>/<body> sendiri.
 *
 * Untuk produksi, pakai `npm run build` biasa lalu unggah folder `dist/`
 * ke Cloudflare Pages (PRD KK-22): aset terpisah jauh lebih hemat karena
 * bisa di-cache browser.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const OUT = "docs/spl-app.html";

const assets = readdirSync(join(DIST, "assets"));
const cssFile = assets.find((f) => f.endsWith(".css"));
const jsFile = assets.find((f) => f.endsWith(".js"));
if (!cssFile || !jsFile) throw new Error("Aset hasil build tidak ditemukan");

const css = readFileSync(join(DIST, "assets", cssFile), "utf8");
const js = readFileSync(join(DIST, "assets", jsFile), "utf8");

const html = [
  `<title>SPL Sports Pool Lounge</title>`,
  `<meta name="theme-color" content="#0B0B0C">`,
  `<meta name="description" content="Booking meja biliar &amp; pesan makanan di SPL Sports Pool Lounge dan Smokehouse Resto.">`,
  `<style>${css}</style>`,
  `<div id="root"></div>`,
  `<script type="module">${js}</script>`,
].join("\n");

writeFileSync(OUT, html);

const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
const stray = html.match(/["'(]\/(?:assets|fonts|foto)\//g);
const skeleton = html.match(/<!doctype|<html|<head>|<body>/i);

console.log(`${OUT} — ${mb} MB`);
console.log(`  font tertanam : ${(html.match(/data:font\//g) || []).length}`);
console.log(`  gambar tertanam: ${(html.match(/data:image\/webp/g) || []).length}`);
console.log(`  rujukan luar  : ${stray ? stray.length : 0}`);
console.log(`  kerangka html : ${skeleton ? "ADA (salah)" : "tidak ada (benar)"}`);
if (stray || skeleton) process.exitCode = 1;
