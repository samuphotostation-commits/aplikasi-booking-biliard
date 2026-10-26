/**
 * PAGAR SUMBER — aksi yang sudah ditutup tidak boleh dipanggil layar lagi.
 *
 * Beberapa aksi mesin sengaja dibiarkan ADA supaya jejak lama tetap bisa
 * diputar ulang, tapi TIDAK BOLEH dipakai lagi oleh layar mana pun. Tanpa
 * pemeriksaan ini, tombolnya bisa kembali berbulan-bulan kemudian lewat
 * salin-tempel dari layar lain, dan tidak ada satu uji pun yang menyadarinya
 * — ujinya menguji mesin, bukan tombol.
 *
 * Dijalankan `npm run test:layar`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Aksi yang ditutup: nama aksi → kenapa, supaya pesan galatnya menjelaskan. */
const DITUTUP = {
  editFnb:
    "ubah baris pesanan ditutup 19 Okt 2026 (menghindari manipulasi karyawan) — "
    + "koreksi salah input lewat void, yang menuntut alasan & persetujuan",
};

function semuaBerkas(dir) {
  return readdirSync(dir).flatMap((nama) => {
    const p = join(dir, nama);
    return statSync(p).isDirectory() ? semuaBerkas(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

/*
 * Hanya LAYAR yang diperiksa, bukan `src/lib`: mesinnya memang masih
 * mendefinisikan dan menerima aksi itu untuk kejadian lama — justru itu
 * sebabnya pagar ini ada di sisi layar.
 */
let salah = 0;
for (const berkas of [...semuaBerkas("src/screens"), ...semuaBerkas("src/components")]) {
  const isi = readFileSync(berkas, "utf8");
  for (const [aksi, alasan] of Object.entries(DITUTUP)) {
    // Yang dicari: dispatch aksinya, bukan sekadar penyebutan namanya di komentar.
    const pola = new RegExp(`t:\\s*"${aksi}"`);
    if (pola.test(isi)) {
      console.log(`LAYAR MEMANGGIL AKSI YANG DITUTUP  [${berkas}]  ${aksi}`);
      console.log(`  ${alasan}`);
      salah++;
    }
  }
}

console.log(salah === 0
  ? `TIDAK ADA LAYAR YANG MEMANGGIL AKSI TERTUTUP (${Object.keys(DITUTUP).length} aksi diperiksa)`
  : `${salah} tempat memanggil aksi yang sudah ditutup`);
process.exit(salah === 0 ? 0 : 1);
