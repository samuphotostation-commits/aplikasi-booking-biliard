/**
 * Ikon Windows (.ico) dari logo SPL — dipakai .exe, installer, dan pintasan.
 *
 * Logo di web/ikon-1080.png punya ruang kosong lebar; di ukuran 16–32 px
 * logonya jadi titik. Maka bagian tengahnya dipotong lebih dekat dulu, lalu
 * disimpan dalam 7 ukuran di satu berkas .ico (format PNG di dalam ICO,
 * didukung Windows Vista ke atas).
 *
 *   node scripts/buat-ikon-win.mjs   → build/icon.ico
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const SUMBER = "public/../web/ikon-1080.png";
const UKURAN = [16, 24, 32, 48, 64, 128, 256];

// Potong 600×600 di tengah (logo kira-kira x 288–792, y 318–762).
const inti = await sharp(SUMBER).extract({ left: 240, top: 240, width: 600, height: 600 }).png().toBuffer();

const gambar = await Promise.all(UKURAN.map((s) => sharp(inti).resize(s, s, { kernel: "lanczos3" }).png().toBuffer()));

// Susun berkas ICO: header 6 byte, 16 byte per entri, lalu data PNG.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(UKURAN.length, 4);
const entri = [];
let posisi = 6 + 16 * UKURAN.length;
UKURAN.forEach((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(gambar[i].length, 8); e.writeUInt32LE(posisi, 12);
  posisi += gambar[i].length;
  entri.push(e);
});
mkdirSync("build", { recursive: true });
writeFileSync("build/icon.ico", Buffer.concat([header, ...entri, ...gambar]));
await sharp(inti).resize(512, 512).png().toFile("build/icon.png");
console.log("build/icon.ico siap (" + UKURAN.join(", ") + " px)");
