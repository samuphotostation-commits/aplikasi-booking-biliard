/**
 * PAGAR BAHASA LAYAR — kosakata program tidak boleh sampai ke mata pengguna.
 *
 * Permintaan pemilik 23 Okt 2026: *"tolong audit keseluruhan text yang ada
 * baik dari sisi tamu dan sisi pemilik resto atau akun, pastikan bahasa yang
 * digunakan bukan bahasa AI atau bahasa program penjelasan."*
 *
 * Auditnya sekali jalan; yang membuatnya bertahan adalah berkas ini. Kata
 * seperti "webhook", "database", atau "mesin menolaknya" sampai ke layar bukan
 * karena ada yang memutuskan begitu — melainkan karena yang menulisnya sedang
 * berpikir sebagai pemrogram, dan tidak ada yang menegur. Ini yang menegur.
 *
 * Yang diperiksa cuma teks yang benar-benar dirender: isi antar-tag JSX dan
 * string yang berbentuk kalimat. Nama variabel, kelas CSS, kunci env, dan
 * komentar tidak ikut — komentar memang tempatnya menjelaskan ke pemrogram.
 *
 * CATATAN PENTING TENTANG CARA MEMINDAI. Teks JSX hampir selalu MEMANJANG
 * BEBERAPA BARIS: `>` ada di ujung satu baris, kalimatnya di baris-baris
 * berikutnya. Versi pertama berkas ini memindai per baris, jadi justru
 * melewatkan bentuk yang paling umum itu — ia melaporkan "bersih" sambil
 * hampir tidak memeriksa prosa sama sekali, dan baru ketahuan setelah sebuah
 * pelanggaran sengaja ditanam dan lolos. Karena itu pemindaiannya dilakukan
 * atas SELURUH isi berkas, lalu nomor barisnya dihitung dari posisi temuan.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Kata yang tidak pernah punya urusan di layar siapa pun. */
const TERLARANG = [
  "webhook", "edge function", "secret key", "endpoint", "payload", "localstorage",
  "reducer", "dispatch", "state machine", "database", "backend", "frontend",
  "deploy", "query", "json", "api key",
  // Kosakata internal aplikasi ini sendiri yang sempat bocor ke layar.
  "mesin menolak", "aksi uang", "jejak kejadian", "diputar ulang", "replay",
];

/**
 * DIIZINKAN APA ADANYA — dan alasannya ditulis, bukan sekadar dibisukan.
 *
 * Ini jalur menu di dalam produk ORANG LAIN (Supabase, dashboard penyedia
 * pembayaran). Yang memasang harus mengetiknya persis seperti tertulis di
 * sana; menerjemahkannya justru membuat petunjuknya tidak bisa diikuti.
 * Keduanya ada di blok "Untuk yang memasang · sekali saja", bukan di layar
 * yang dipakai kasir tiap malam.
 */
const SAH = [
  "Supabase → Edge Functions → Secrets",
  "alamat notifikasi/webhook diisi",
];

const AKAR = ["src/screens", "src/components"];

function berkas(dir) {
  const out = [];
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) out.push(...berkas(p));
    else if (nama.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Buang komentar, TAPI pertahankan barisnya.
 *
 * Isinya dikosongkan dan barisnya dibiarkan, supaya nomor baris yang
 * dilaporkan benar-benar menunjuk ke barisnya di berkas. (Pola komentar satu
 * baris sengaja tidak memakai `\s*` di depan: `\s` ikut menelan baris kosong
 * sebelumnya, dan nomor barisnya bergeser.)
 */
const tanpaKomentar = (teks) =>
  teks
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[^\S\n]*\/\/.*$/gm, "");

/**
 * Potongan ini KODE, bukan kalimat?
 *
 * Pagar yang berbunyi untuk kode akan diabaikan dalam seminggu, dan pagar
 * yang diabaikan sama saja dengan tidak ada. Yang disaring: pecahan ekspresi
 * (`? null : hasil ===` — pasangan kutip memang bisa meleset dan membuat kode
 * di antara dua string ikut terbaca sebagai kalimat) dan potongan yang
 * hurufnya terlalu sedikit untuk jadi kalimat.
 */
const kodeBukanKalimat = (s) =>
  /[=?!&|]|=>|\(\)|\$\{/.test(s) || !/\s/.test(s)
  || (s.match(/[A-Za-z]/g) ?? []).length < 8;

/** Kelas CSS, jalur berkas, dan satuan ukuran — bukan kalimat juga. */
const bukanProsa = (s) => /[{}#]|--|\b(?:px|rem|vh|vw)\b/.test(s);

let temuan = 0;
let diperiksa = 0;

for (const akar of AKAR) {
  for (const f of berkas(akar)) {
    const isi = tanpaKomentar(readFileSync(f, "utf8"));
    const barisDi = (pos) => isi.slice(0, pos).split("\n").length;

    const potongan = [];
    // Isi antar-tag JSX — boleh memanjang beberapa baris.
    for (const m of isi.matchAll(/>([^<>{}]{8,}?)</gs)) {
      potongan.push([m.index, m[1].replace(/\s+/g, " ").trim()]);
    }
    // String berkalimat: judul tombol, pesan, placeholder.
    for (const m of isi.matchAll(/"([^"\n]{12,})"/g)) {
      potongan.push([m.index, m[1].trim()]);
    }

    for (const [pos, frasa] of potongan) {
      if (!frasa || kodeBukanKalimat(frasa) || bukanProsa(frasa)) continue;
      if (SAH.some((x) => frasa.includes(x))) continue;
      diperiksa++;
      const kena = TERLARANG.filter((k) => frasa.toLowerCase().includes(k));
      if (kena.length) {
        temuan++;
        console.log(`${f}:${barisDi(pos)}  [${kena.join(", ")}]`);
        console.log(`    ${frasa.slice(0, 120)}`);
      }
    }
  }
}

console.log(
  temuan === 0
    ? `BAHASA LAYAR BERSIH (${diperiksa} kalimat diperiksa, ${TERLARANG.length} kata terlarang)`
    : `${temuan} KALIMAT MASIH MEMAKAI KOSAKATA PROGRAM`,
);
if (temuan > 0) process.exitCode = 1;
