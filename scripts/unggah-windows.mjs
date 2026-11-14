/**
 * TERBITKAN INSTALLER WINDOWS ke Supabase Storage (bucket publik "app").
 *
 *   node scripts/unggah-windows.mjs <path-installer.exe> <versi>
 *
 * Supabase membatasi 50 MB per berkas, installer Electron ±100 MB. Jadi
 * installer DIPECAH menjadi bagian 45 MB (unduh/<nama>.bagian-N) beserta
 * daftar isinya (unduh/terbaru.json: versi, ukuran, sidik jari SHA-256, daftar
 * bagian). Halaman /unduh/windows.html di situs kasir mengunduh semua bagian,
 * menyatukannya, MEMERIKSA sidik jarinya, lalu menyimpan satu berkas .exe —
 * jadi bagi pemakai tetap "klik Unduh, langsung terunduh".
 *
 * Sesudahnya `src/data/rilisWindows.ts` diperbarui; bangun & pasang situs
 * kasir supaya kolom Unduh di Pengaturan menyebut versi baru.
 *
 * Perlu: `npx supabase login` sekali per komputer (sama dengan pasang-fungsi).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

const [exe, versi] = process.argv.slice(2);
if (!exe || !/^\d+\.\d+\.\d+$/.test(versi ?? "")) {
  console.error("Pakai: node scripts/unggah-windows.mjs <installer.exe> <versi, mis. 1.3.0>");
  process.exit(1);
}
const REF = process.env.SUPABASE_PROJECT_REF ?? "fhoxdsxabpohafilqxoz";
const BUCKET = "app";
const PUBLIK = `https://${REF}.supabase.co/storage/v1/object/public/${BUCKET}`;
const BAGIAN = 45 * 1024 * 1024;

const data = readFileSync(exe);
const nama = basename(exe);
const sha256 = createHash("sha256").update(data).digest("hex");
const kerja = mkdtempSync(join(tmpdir(), "spl-unggah-"));

/** Unggah satu berkas dari folder kerja (CLI tidak menerima path "C:/…"). */
function unggah(berkas, tujuan, jenis, cache) {
  for (let coba = 1; coba <= 4; coba++) {
    try {
      execFileSync("npx", ["supabase@2.118.0", "storage", "cp", berkas, `ss:///${BUCKET}/${tujuan}`,
        "--experimental", "--project-ref", REF, "--content-type", jenis, "--cache-control", cache],
        { cwd: kerja, stdio: ["ignore", "pipe", "pipe"], shell: true });
      return;
    } catch (e) {
      const pesan = String(e.stdout ?? "") + String(e.stderr ?? "");
      if (coba === 4) throw new Error(`Gagal mengunggah ${tujuan}: ${pesan.slice(0, 400)}`);
      console.log(`  ulang ${tujuan} (${coba})…`);
    }
  }
}

const bagian = [];
for (let i = 0, n = 1; i < data.length; i += BAGIAN, n++) {
  const isi = data.subarray(i, Math.min(i + BAGIAN, data.length));
  const berkas = `${nama}.bagian-${n}`;
  writeFileSync(join(kerja, berkas), isi);
  console.log(`unggah ${berkas} (${(isi.length / 1048576).toFixed(1)} MB)…`);
  unggah(berkas, `unduh/${berkas}`, "application/octet-stream", "max-age=31536000");
  bagian.push({ url: `${PUBLIK}/unduh/${berkas}`, ukuran: isi.length });
}

const daftar = { versi, nama, ukuran: data.length, sha256, dibuat: new Date().toISOString(), bagian };
writeFileSync(join(kerja, `${nama}.json`), JSON.stringify(daftar, null, 2));
writeFileSync(join(kerja, "terbaru.json"), JSON.stringify(daftar, null, 2));
unggah(`${nama}.json`, `unduh/${nama}.json`, "application/json", "max-age=31536000");
unggah("terbaru.json", "unduh/terbaru.json", "application/json", "max-age=60");
rmSync(kerja, { recursive: true, force: true });

const mb = Math.round(data.length / 1048576);
// Tanggal WIB (UTC+7), bukan UTC — rilis jam 02.00 WIB tetap tanggal hari itu.
const tanggal = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
writeFileSync("src/data/rilisWindows.ts", `/**
 * INSTALLER WINDOWS TERBARU — DITULIS OTOMATIS oleh scripts/unggah-windows.mjs.
 *
 * Pemilik 15 Nov 2026: "ketika klik download langsung terdownload aplikasi
 * versi terbarunya". Installer ada di Supabase Storage (bucket "app",
 * folder unduh/), dipecah per 45 MB karena batas 50 MB Supabase. Halaman
 * /unduh/windows.html di situs kasir menyatukan & memeriksanya, lalu
 * menyimpan satu berkas .exe. Tautan manual di Pengaturan tetap cadangan.
 */
export const RILIS_WINDOWS: { versi: string; nama: string; ukuranMb: number; sha256: string; tanggal: string; halaman: string } | null = {
  versi: ${JSON.stringify(versi)},
  nama: ${JSON.stringify(nama)},
  ukuranMb: ${mb},
  sha256: ${JSON.stringify(sha256)},
  tanggal: ${JSON.stringify(tanggal)},
  halaman: "https://kasir.sportspoollounge.com/unduh/windows.html",
};
`);
console.log(`\nSelesai: ${nama} · ${mb} MB · ${bagian.length} bagian · sha256 ${sha256.slice(0, 16)}…`);
console.log(`Daftar: ${PUBLIK}/unduh/terbaru.json`);
