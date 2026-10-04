/**
 * Memasang Edge Function ke Supabase lewat CLI — bukan lewat editor dashboard.
 *
 * Kenapa: editor dashboard berkali-kali "berhasil" tanpa benar-benar mengirim
 * isi yang baru (tombol Deploy-nya sering di luar layar dan klik sintetis tidak
 * memicunya), jadi fungsi lama tetap jalan tanpa ada yang sadar. Lewat CLI
 * hasilnya pasti dan bisa diulang.
 *
 * Sekali saja per komputer:  npx supabase login
 * Sesudah itu:               npm run pasang-fungsi           (semua fungsi)
 *                            npm run pasang-fungsi terbit    (satu saja)
 *
 * Catatan: `terbit` memuat MESIN VENUE yang dibundel — jalankan
 * `node scripts/bundel-terbit.mjs` dulu kalau src/lib berubah.
 */
import { execFileSync } from "node:child_process";

const REF = process.env.SUPABASE_PROJECT_REF ?? "fhoxdsxabpohafilqxoz";
const SEMUA = ["terbit", "stok-tutup", "qris-webhook", "qris-buat", "pesan-kirim"];
const pilih = process.argv.slice(2).filter((x) => !x.startsWith("-"));
const daftar = pilih.length ? pilih : SEMUA;

for (const nama of daftar) {
  console.log(`\n=== ${nama} ===`);
  execFileSync("npx", ["supabase@2.118.0", "--workdir", ".", "functions", "deploy", nama,
    "--project-ref", REF], { stdio: "inherit", shell: true });
}
console.log(`\nSelesai: ${daftar.join(", ")}`);
