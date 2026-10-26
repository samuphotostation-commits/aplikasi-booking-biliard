/**
 * Mengubah huruf di `src/assets/fonts/` jadi WOFF2.
 *
 * KENAPA. Dua huruf judul masih TTF mentah — LidoSTF 195 KB dan LidoSTFBold
 * 171 KB — dan dua lagi masih WOFF1 yang memakai zlib. WOFF2 memakai Brotli
 * plus penyederhanaan tabel glif, dan untuk huruf teks biasa hasilnya sekitar
 * separuh TTF. Huruf ikut jalur muat pertama: selama ia belum turun, judul
 * halaman dirender dengan huruf cadangan lalu melompat saat yang asli tiba.
 *
 * DUA JALUR MASUK, karena berkas sumbernya dua macam:
 *   .ttf  → langsung dipadatkan wawoff2.
 *   .woff → WOFF1 tidak bisa dibaca pemadat WOFF2; isinya harus dikembalikan
 *           dulu jadi sfnt (TTF), baru dipadatkan. Pembongkarannya ditulis di
 *           sini, bukan ditarik dari pustaka lain: WOFF1 cuma wadah sederhana
 *           — kepala 44 byte, daftar tabel 20 byte per tabel, dan tiap tabel
 *           di-deflate dengan zlib yang sudah ada di Node.
 *
 * Hasilnya DISIMPAN DI REPO dan dirujuk langsung oleh `src/index.css`. Huruf
 * tidak pernah berubah, jadi memasang pemadatnya di jalur rakit cuma membuat
 * setiap orang yang merakit menanggung ongkos yang berlaku sekali seumur
 * proyek.
 *
 * Jalankan kalau ada huruf baru:  node scripts/buat-woff2.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const { compress, decompress } = createRequire(import.meta.url)("wawoff2");

const DIR = "src/assets/fonts";

/**
 * WOFF1 → sfnt.
 *
 * Tata letaknya: kepala 44 byte (jumlah tabel ada di offset 12), lalu satu
 * entri 20 byte per tabel berisi tag, posisi, panjang terpadat, panjang asli,
 * dan sidik jarinya. Sebuah tabel dipadatkan HANYA kalau hasilnya lebih
 * pendek dari aslinya — kalau sama panjang, ia disimpan apa adanya. Itu
 * sebabnya pembandingan panjang di bawah, bukan sebuah penanda.
 */
function woff1KeSfnt(buf) {
  if (buf.toString("latin1", 0, 4) !== "wOFF") throw new Error("bukan berkas WOFF1");
  const flavor = buf.readUInt32BE(4);
  const jumlah = buf.readUInt16BE(12);

  const tabel = [];
  for (let i = 0, p = 44; i < jumlah; i++, p += 20) {
    const panjangPadat = buf.readUInt32BE(p + 8);
    const panjangAsli = buf.readUInt32BE(p + 12);
    const mentah = buf.subarray(buf.readUInt32BE(p + 4), buf.readUInt32BE(p + 4) + panjangPadat);
    tabel.push({
      tag: Buffer.from(buf.subarray(p, p + 4)),
      sidik: buf.readUInt32BE(p + 16),
      panjangAsli,
      isi: panjangPadat < panjangAsli ? inflateSync(mentah) : mentah,
    });
  }
  // Daftar tabel sfnt WAJIB urut menaik menurut tag. WOFF1 hampir selalu
  // sudah begitu, tapi urutannya tidak dijamin oleh wadahnya.
  tabel.sort((a, b) => a.tag.compare(b.tag));

  // Tiap tabel mulai di kelipatan 4; sisanya diisi nol.
  const isiRata = tabel.map((t) => {
    const sisa = (4 - (t.isi.length % 4)) % 4;
    return sisa ? Buffer.concat([t.isi, Buffer.alloc(sisa)]) : t.isi;
  });

  let posisi = 12 + 16 * jumlah;
  const keluar = Buffer.alloc(posisi + isiRata.reduce((s, d) => s + d.length, 0));

  const pangkat = Math.floor(Math.log2(jumlah));
  keluar.writeUInt32BE(flavor, 0);
  keluar.writeUInt16BE(jumlah, 4);
  keluar.writeUInt16BE(16 * 2 ** pangkat, 6);
  keluar.writeUInt16BE(pangkat, 8);
  keluar.writeUInt16BE(jumlah * 16 - 16 * 2 ** pangkat, 10);

  tabel.forEach((t, i) => {
    const p = 12 + 16 * i;
    t.tag.copy(keluar, p);
    keluar.writeUInt32BE(t.sidik, p + 4);
    keluar.writeUInt32BE(posisi, p + 8);
    keluar.writeUInt32BE(t.panjangAsli, p + 12);
    isiRata[i].copy(keluar, posisi);
    posisi += isiRata[i].length;
  });
  return keluar;
}

/** Tag tabel sebuah sfnt: kepala 12 byte, lalu 16 byte per tabel. */
function tagTabel(sfnt) {
  const jumlah = sfnt.readUInt16BE(4);
  const tag = new Set();
  for (let i = 0; i < jumlah; i++) tag.add(sfnt.toString("latin1", 12 + 16 * i, 16 + 16 * i));
  return tag;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let sebelum = 0, sesudah = 0;

for (const nama of readdirSync(DIR).sort()) {
  if (!/\.(ttf|otf|woff)$/i.test(nama)) continue;
  const asal = readFileSync(join(DIR, nama));
  const sfnt = nama.toLowerCase().endsWith(".woff") ? woff1KeSfnt(asal) : asal;
  const hasil = Buffer.from(await compress(sfnt));

  // Pagar: bongkar lagi hasilnya dan bandingkan DAFTAR TAG, bukan jumlahnya.
  // Huruf yang rusak tidak pernah memberi galat — ia cuma diam-diam diganti
  // huruf cadangan, dan itu baru ketahuan oleh mata, biasanya sesudah terbit.
  //
  // DSIG boleh hilang, dan memang selalu hilang: ia tanda tangan digital atas
  // isi berkasnya, dan WOFF2 menata ulang tabel glif — tanda tangan lama jadi
  // tidak sah, jadi pemadatnya membuangnya. Yang tidak boleh hilang adalah
  // tabel yang menentukan bentuk dan jarak huruf.
  const balik = Buffer.from(await decompress(hasil));
  const hilang = [...tagTabel(sfnt)].filter((t) => !tagTabel(balik).has(t) && t !== "DSIG");
  if (hilang.length) throw new Error(`${nama}: tabel hilang — ${hilang.join(", ")}`);

  const wajib = ["cmap", "head", "hhea", "hmtx", "maxp"];
  const kurang = wajib.filter((t) => !tagTabel(balik).has(t));
  if (kurang.length) throw new Error(`${nama}: tabel wajib tidak ada — ${kurang.join(", ")}`);

  const tujuan = join(DIR, nama.replace(/\.(ttf|otf|woff)$/i, ".woff2"));
  if (existsSync(tujuan) && nama.toLowerCase().endsWith(".woff2")) continue;
  writeFileSync(tujuan, hasil);
  sebelum += asal.length;
  sesudah += hasil.length;
  console.log(`${nama.padEnd(22)} ${kb(asal.length).padStart(9)} -> ${kb(hasil.length).padStart(9)}  (${tagTabel(balik).size} tabel)`);
}

console.log(`\nTotal ${kb(sebelum)} -> ${kb(sesudah)} · hemat ${kb(sebelum - sesudah)}`);
