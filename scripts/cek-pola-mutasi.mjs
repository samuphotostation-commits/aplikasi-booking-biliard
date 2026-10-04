/**
 * Memeriksa apakah SEMUA pola uji mutasi masih cocok dengan sumber saat ini.
 *
 *   npm run test:pola     (beberapa detik)
 *
 * Kenapa perlu: uji mutasi menanam cacat dengan mencari-dan-mengganti teks di
 * `src/lib/*`. Begitu baris yang dicari berubah — karena kita sendiri yang
 * memperbaikinya — mutasinya berhenti menguji apa pun, DIAM-DIAM. Pernah
 * terjadi: 4 mutasi jadi basi sesudah mesin dikunci ke WIB, dan laporannya
 * cuma menulis "79/83 tertangkap" seolah ada 4 celah uji, padahal yang rusak
 * fixture-nya.
 *
 * Perintah ini memisahkan dua hal itu dalam hitungan detik, tanpa perlu
 * menunggu satu jam untuk menjalankan seluruh mutasi.
 */
import { readFileSync } from "node:fs";

const ENGINE = "src/lib/engine.ts", BILLING = "src/lib/billing.ts",
      VENUE = "src/lib/venueStore.ts", REMOTE = "src/lib/remote.ts", PUBLIC = "src/lib/publicView.ts";

const src = readFileSync("test/mutation.mjs", "utf8");
const daftar = src.slice(src.indexOf("const MUTATIONS"), src.indexOf("const results"));
const MUTATIONS = eval(`${daftar}; MUTATIONS`);   // eslint-disable-line no-eval

const isi = {};
for (const f of [ENGINE, BILLING, VENUE, REMOTE, PUBLIC]) isi[f] = readFileSync(f, "utf8");

let basi = 0;
MUTATIONS.forEach((m, i) => {
  const file = m.file ?? ENGINE;
  const nl = isi[file].includes("\r\n") ? "\r\n" : "\n";
  const cari = (m.edits ?? [[m.from, m.to]]).map(([from]) => from.replace(/\n/g, nl));
  const jml = cari.map((from) => isi[file].split(from).length - 1);
  const salah = jml.find((c) => c !== 1);
  if (salah !== undefined) {
    basi++;
    console.log(`#${i + 1}  ${salah === 0 ? "POLA TIDAK DITEMUKAN" : `MUNCUL ${salah}x`}  [${file}]  ${m.name}`);
  }
});

console.log(basi === 0
  ? `SEMUA POLA COCOK (${MUTATIONS.length} mutasi)`
  : `${basi} dari ${MUTATIONS.length} mutasi polanya BASI — perbaiki dulu, kalau tidak mutasi itu tidak menguji apa-apa`);
if (basi > 0) process.exitCode = 1;
