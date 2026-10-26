/**
 * Membuat gambar pratinjau tautan (`public/og-spl.jpg`).
 *
 * Ini gambar yang muncul saat tautan situs ditempel ke WhatsApp, Instagram,
 * atau Facebook — kanal utama venue ini. Tanpa gambar ini, yang terkirim cuma
 * tautan telanjang tanpa judul dan tanpa foto.
 *
 * KENAPA JPEG, bukan WebP yang sudah dipakai di seluruh aplikasi. Pengurai
 * pratinjau WhatsApp masih melewatkan WebP di sebagian perangkat; JPEG dibaca
 * semuanya. Ukurannya 1200x630, rasio yang diminta Open Graph.
 *
 * Hasilnya DISIMPAN DI REPO, bukan dibuat saat merakit situs. Fotonya jarang
 * ganti, dan menaruhnya di jalur rakit berarti `sharp` jadi syarat wajib untuk
 * menerbitkan — mahal untuk sesuatu yang berubah setahun sekali.
 *
 * Jalankan kalau fotonya diganti:  node scripts/buat-og.mjs
 */
import sharp from "sharp";

/**
 * Foto aula biliar yang paling ramai: pemain di depan, meja berjajar di
 * belakang. Satu lirik sudah menjawab "tempat apa ini" — dan itulah satu-
 * satunya tugas gambar pratinjau.
 */
const SUMBER = "src/assets/foto/bl-190.webp";
const HASIL = "public/og-spl.jpg";

const asal = await sharp(SUMBER).metadata();
await sharp(SUMBER)
  .resize(1200, 630, { fit: "cover", position: "centre" })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(HASIL);

const jadi = await sharp(HASIL).metadata();
console.log(`${SUMBER} ${asal.width}x${asal.height} -> ${HASIL} ${jadi.width}x${jadi.height}`);
