// Menghitung hasil panel: node founder/panel/hitung.mjs
// Memeriksa bentuk setiap jawaban, lalu menulis founder/panel/results.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const kartu = JSON.parse(fs.readFileSync(path.join(DIR, "kartu.json"), "utf8"));
const KODE = ["harga", "ribet_daftar", "bayar_dimuka", "tidak_bisa_batal", "lebih_suka_datang", "kepercayaan", "butuh_wa", "cocok", "praktis", "lainnya"];
const HARGA = ["terlalu_murah_sampai_ragu_kualitas", "murah_menguntungkan", "mulai_mahal_tapi_masih_dipertimbangkan", "terlalu_mahal_tidak_akan_beli"];

const jawaban = [], hilang = [], rusak = [];
for (const c of kartu) {
  const f = path.join(DIR, "answers", `${c.id}.json`);
  if (!fs.existsSync(f)) { hilang.push(c.id); continue; }
  try {
    const raw = fs.readFileSync(f, "utf8").replace(/^```(json)?|```$/gm, "").trim();
    const j = JSON.parse(raw);
    const ok = typeof j.membeli === "boolean" && Number.isFinite(j.kali_bulan_pertama)
      && KODE.includes(j.kode_alasan) && typeof j.alasan === "string"
      && HARGA.every((k) => Number.isFinite(j.harga_meja_malam_per_jam?.[k]));
    if (!ok) { rusak.push(c.id); continue; }
    jawaban.push({ ...j, kartu: c });
  } catch { rusak.push(c.id); }
}

const persen = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const beli = jawaban.filter((j) => j.membeli);
const perSegmen = {};
for (const j of jawaban) {
  const s = (perSegmen[j.kartu.segmen] ??= { n: 0, beli: 0, kali: 0 });
  s.n++; if (j.membeli) { s.beli++; s.kali += j.kali_bulan_pertama; }
}
for (const s of Object.values(perSegmen)) { s.persenBeli = persen(s.beli, s.n); s.rataKali = s.beli ? +(s.kali / s.beli).toFixed(1) : 0; }

const hitungKode = (xs) => Object.entries(xs.reduce((m, j) => { m[j.kode_alasan] = (m[j.kode_alasan] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
const tolak = jawaban.filter((j) => !j.membeli);
const alasanTolak = hitungKode(tolak).map(([k, n]) => ({ kode: k, n, contoh: tolak.find((j) => j.kode_alasan === k)?.alasan, dari: tolak.find((j) => j.kode_alasan === k)?.kartu.segmen }));
const alasanBeli = hitungKode(beli).map(([k, n]) => ({ kode: k, n }));
const keberatan = jawaban.map((j) => ({ id: j.kartu.id, segmen: j.kartu.segmen, membeli: j.membeli, keberatan: j.keberatan_utama, ubah: j.yang_bisa_mengubah_pikiran }));

const harga = Object.fromEntries(HARGA.map((k) => [k, median(jawaban.map((j) => j.harga_meja_malam_per_jam[k]))]));
const hasil = {
  dijawab: jawaban.length, hilang, rusak,
  persenBeli: persen(beli.length, jawaban.length),
  rataKaliBulanPertama: beli.length ? +(beli.reduce((s, j) => s + j.kali_bulan_pertama, 0) / beli.length).toFixed(1) : 0,
  perSegmen, alasanTolak, alasanBeli, hargaMedian: harga,
  terlaluMahalDi39rb: persen(jawaban.filter((j) => j.harga_meja_malam_per_jam.terlalu_mahal_tidak_akan_beli <= 39_000).length, jawaban.length),
  keberatan,
};
fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify(hasil, null, 2));
console.log(JSON.stringify({ ...hasil, keberatan: undefined }, null, 2));
