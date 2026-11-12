// Membuat 100 kartu pembeli dari founder/customer.json + founder/pitch.md
// (metode founder-consumer: setiap pembeli membaca pitch yang sama persis).
// node founder/panel/kartu.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profil = JSON.parse(fs.readFileSync(path.join(AKAR, "customer.json"), "utf8"));
const pitch = fs.readFileSync(path.join(AKAR, "pitch.md"), "utf8").trim();
const N = Number(process.argv[2] ?? 100);

let seed = 20261107;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const DEPAN = ["Rizky", "Fajar", "Andi", "Dina", "Putri", "Rahmat", "Yoga", "Sari", "Ilham", "Nadia", "Fauzan", "Wulan",
  "Reza", "Tika", "Hendra", "Mega", "Arif", "Rini", "Bayu", "Indah", "Doni", "Ayu", "Taufik", "Siska", "Ikhsan",
  "Rara", "Fikri", "Lusi", "Hafiz", "Vira", "Aldo", "Nisa", "Gilang", "Cindy", "Rafi", "Melati", "Zul", "Desi"];
const BELAKANG = ["Saputra", "Putri", "Pratama", "Lestari", "Hidayat", "Syahputra", "Rahmadani", "Fitri", "Kurniawan",
  "Anggraini", "Firmansyah", "Yuliani", "Chaniago", "Piliang", "Tanjung", "Sikumbang", "Koto", "Caniago"];

// Jumlah per segmen mengikuti `share`, dibulatkan, sisanya ke segmen terbesar.
const kuota = profil.segments.map((s) => Math.round(s.share * N));
kuota[0] += N - kuota.reduce((a, b) => a + b, 0);

const dir = path.join(AKAR, "panel", "briefs");
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(AKAR, "panel", "answers"), { recursive: true });
const kartu = [];
let id = 0;
profil.segments.forEach((seg, si) => {
  for (let k = 0; k < kuota[si]; k++) {
    id++;
    const [umin, umax] = seg.age.split("–").map(Number);
    const usia = umin + Math.floor(rnd() * (umax - umin + 1));
    const [pmin, pmax] = seg.income_idr_per_month.split("–").map((x) => Number(x.replace(/\./g, "")));
    const gaji = Math.round((pmin + rnd() * (pmax - pmin)) / 250_000) * 250_000;
    const c = {
      id: String(id).padStart(3, "0"),
      nama: `${pick(DEPAN)} ${pick(BELAKANG)}`,
      usia, segmen: seg.name, catatanSegmen: seg.note,
      penghasilan: `Rp ${gaji.toLocaleString("id-ID")}/bulan`,
      kebiasaan: pick(profil.behaviours),
      habit: pick(profil.habits),
      keraguan: pick(profil.objections),
    };
    kartu.push(c);
    fs.writeFileSync(path.join(dir, `${c.id}.md`), brief(c));
  }
});
fs.writeFileSync(path.join(AKAR, "panel", "kartu.json"), JSON.stringify(kartu, null, 2));
console.log(`${kartu.length} kartu ditulis ke ${dir}`);

function brief(c) {
  return `# Kamu adalah pembeli #${c.id}

Kamu BUKAN asisten. Kamu memerankan satu orang sungguhan di Padang yang baru saja melihat tawaran di bawah.

- Nama: ${c.nama}, ${c.usia} tahun
- Segmen: ${c.segmen} (${c.catatanSegmen})
- Penghasilan: ${c.penghasilan}
- Kebiasaan: ${c.kebiasaan}
- Kebiasaan lain: ${c.habit}
- Keraguan yang kamu bawa: ${c.keraguan}

## Tawaran yang kamu lihat (persis seperti ini)

${pitch}

## Aturan

- Jangan mudah setuju. Orang sungguhan lebih sering melewatkan tawaran daripada mengambilnya.
  Putuskan seperti ${c.nama} memutuskan dengan uang dan waktunya sendiri.
- Jangan mengarang fakta tentang SPL yang tidak ada di tawaran di atas. Kalau tidak tahu, bilang tidak tahu.
- Jawab dalam bahasa Indonesia sehari-hari, dengan suaramu sendiri.
- "Membeli" berarti: dalam sebulan ke depan kamu benar-benar booking meja atau memesan makanan lewat aplikasi ini.

## Jawabanmu

Tulis HANYA satu objek JSON ke berkas \`founder/panel/answers/${c.id}.json\` (pakai alat Write, path relatif dari folder proyek), dengan bentuk persis:

\`\`\`json
{
  "id": "${c.id}",
  "membeli": true,
  "kali_bulan_pertama": 0,
  "kode_alasan": "salah satu: harga | ribet_daftar | bayar_dimuka | tidak_bisa_batal | lebih_suka_datang | kepercayaan | butuh_wa | cocok | praktis | lainnya",
  "alasan": "satu-dua kalimat dengan suaramu sendiri",
  "keberatan_utama": "satu kalimat",
  "yang_bisa_mengubah_pikiran": "satu kalimat",
  "harga_meja_malam_per_jam": {
    "terlalu_murah_sampai_ragu_kualitas": 0,
    "murah_menguntungkan": 0,
    "mulai_mahal_tapi_masih_dipertimbangkan": 0,
    "terlalu_mahal_tidak_akan_beli": 0
  }
}
\`\`\`

\`membeli\` true/false. \`kali_bulan_pertama\` = berapa kali kamu memakai aplikasi ini (booking atau pesan) dalam bulan pertama, 0 kalau tidak membeli.
Empat angka harga dalam rupiah per jam untuk meja biliar reguler malam hari. Sesudah menulis berkas, balas cukup dengan kata "selesai".
`;
}
