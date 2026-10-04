/**
 * Membundel FUNGSI SERVER beserta seluruh mesin venue jadi SATU berkas each.
 *
 *   terbit      → supabase/functions/terbit/index.ts
 *   stok-tutup  → supabase/functions/stok-tutup/index.ts
 *
 * Kenapa ditempel jadi satu, bukan di-import dari situs staf: bundler
 * Supabase menolak import dari domain sendiri —
 *   "Failed to bundle the function (reason: Cannot import from
 *    spl-kasir.pages.dev:443 ...)"
 * — yang diizinkan hanya jsr:/npm:/deno.land. Maka `jsr:@supabase/supabase-js`
 * dibiarkan sebagai import (external), sisanya ikut ditempel.
 *
 * Hasilnya dimampatkan supaya muat ditempel ke editor dashboard.
 * JANGAN menyuntingnya; sunting `supabase/functions/_sumber/*.ts` lalu:
 *
 *   node scripts/bundel-terbit.mjs              (semua)
 *   node scripts/bundel-terbit.mjs stok-tutup   (satu saja)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";

const FUNGSI = {
  terbit: {
    sumber: "supabase/functions/_sumber/terbit-fungsi.ts",
    keluar: process.env.TERBIT_OUT ?? "supabase/functions/terbit/index.ts",
    tugas: "menghitung ulang ringkasan publik untuk HP pelanggan tiap ada kejadian\n" +
      "// baru, supaya ketersediaan meja & harga tidak basi walau tidak ada perangkat\n" +
      "// kasir yang online.",
  },
  "stok-tutup": {
    sumber: "supabase/functions/_sumber/stok-fungsi.ts",
    keluar: "supabase/functions/stok-tutup/index.ts",
    tugas: "menutup buku STOK tiap hari yang sudah lewat dan menyimpannya ke\n" +
      "// `stok_harian`, supaya angka hari lampau jadi fakta — bukan direka mundur\n" +
      "// dari sisa hari ini oleh perangkat yang kebetulan sedang terbuka.",
  },
};

const pilih = process.argv.slice(2).filter((x) => !x.startsWith("-"));
const daftar = pilih.length ? pilih : Object.keys(FUNGSI);
for (const nama of daftar) {
  if (!FUNGSI[nama]) throw new Error(`fungsi tidak dikenal: ${nama} (ada: ${Object.keys(FUNGSI).join(", ")})`);
}

// Diperiksa tipenya DULU. Berkas di supabase/ tidak ikut `tsc` proyek (tsconfig
// hanya memuat src), dan itu pernah lolos: argumen replay() tertukar sehingga
// fungsi yang sudah terpasang mati dengan "t is not iterable". Sekarang bundel
// gagal duluan kalau tipenya tidak cocok.
execFileSync("npx", ["tsc", "--noEmit", "-p", "supabase/functions/_sumber/tsconfig.json"],
  { stdio: "inherit", shell: true });

// ZONA WAKTU. Mesin venue dipatok WIB lewat src/lib/occupancy.ts, tapi format
// tanggal/jam bawaan Deno tetap ikut zona proses. Server Supabase jalan di UTC,
// jadi baris ini disisipkan paling atas — sebelum kode mesin apa pun jalan.
const zona = 'try { Deno.env.set("TZ", "Asia/Jakarta"); } catch { /* biarkan bawaan */ }' + String.fromCharCode(10);

for (const nama of daftar) {
  const { sumber, keluar, tugas } = FUNGSI[nama];
  execFileSync("npx", ["esbuild", sumber,
    "--bundle", "--format=esm", "--platform=neutral", "--target=es2022",
    "--external:jsr:*", "--external:npm:*", "--external:https://*",
    "--minify", "--legal-comments=none", `--outfile=${keluar}`, "--log-level=warning"],
    { stdio: "inherit", shell: true });

  const kepala = `// DIBUAT OTOMATIS oleh scripts/bundel-terbit.mjs — JANGAN DISUNTING DI SINI.
// Sumbernya: ${sumber} (+ mesin venue src/lib).
// Tugas fungsi ini: ${tugas}
// Pasang dengan JWT DIMATIKAN.
`;
  writeFileSync(keluar, kepala + zona + readFileSync(keluar, "utf8"));
  console.log(`${keluar} ${(statSync(keluar).size / 1024).toFixed(0)} KB siap dipasang`);
}
