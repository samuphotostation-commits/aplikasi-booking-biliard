/* ═══════════════════════════════════════════════════════════════════
   JEMBATAN LAMPU — apa yang dikatakan panel kasir, dan apa yang
   diterbitkan server ke alat relay.

   Dua hal dijaga di sini, dan keduanya pernah salah di sistem sejenis:

   1. "TIDAK TAHU" BUKAN "MATI". Kalau server yang tidak bisa ditanya —
      `schema-lampu.sql` belum dijalankan, sesi PIN habis — panel harus
      mengatakan apa adanya bahwa ia tidak tahu. Menampilkan "alat mati"
      dalam keadaan itu mengirim teknisi ke panel listrik untuk mencari
      gangguan yang sebenarnya ada di satu perintah SQL yang belum
      dijalankan.

   2. MEJA MAKAN TIDAK PUNYA LAMPU. Status yang diterbitkan ke alat tidak
      boleh memuat meja Smokehouse. Alat akan mencarinya di peta pin,
      tidak menemukannya, dan itu memang tidak berbahaya — tapi angkanya
      ikut terhitung di papan dan rekap venue resto, dan di situlah dulu
      "lampu meja R03" muncul sebagai sesuatu yang tidak ada.
   ═══════════════════════════════════════════════════════════════════ */
import { ringkasLampu, jamTerakhir } from "../src/lib/lampuStatus";
import type { LampuAlatBaris, LampuInfo } from "../src/lib/supabaseRemote";
import { init, punyaLampu, type State } from "../src/lib/engine";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const KINI = 1_763_000_000_000;

const alat = (nama: string, lewatMs: number, nyala = 3, relay = 16): LampuAlatBaris => ({
  alat: nama,
  terakhir_ms: KINI - lewatMs,
  ip: "10.151.57.203", rssi: -58, fw: "spl-lampu-2.0",
  nyala, relay, versi_lihat: 17,
});

const info = (x: Partial<LampuInfo>): LampuInfo => ({
  berkunci: true, versi: 17, terbitMs: KINI - 1000, alat: [], alasan: null, ...x,
});

/* ── 1. Panel kasir membedakan empat keadaan yang sangat berbeda ──── */

t("belum dimuat = memuat, bukan mati",
  ringkasLampu(null, KINI).status, "memuat");

t("server tidak bisa ditanya = tidak tahu, BUKAN mati",
  ringkasLampu(info({ alasan: "function lampu_alat_daftar does not exist" }), KINI).status,
  "tidak-tahu");

t("sesi PIN habis juga tidak tahu, bukan mati",
  ringkasLampu(info({ alasan: "sesi tidak sah" }), KINI).status, "tidak-tahu");

t("kunci belum dipasang punya nama sendiri",
  ringkasLampu(info({ berkunci: false }), KINI).status, "belum-dipasang");

t("server siap tapi alat belum pernah menghubunginya = mati",
  ringkasLampu(info({ alat: [] }), KINI).status, "mati");

/* ── 2. Ambang online cocok dengan alat yang menarik tiap 1 detik ─── */

t("dua alat baru saja terlihat = online",
  ringkasLampu(info({ alat: [alat("board1", 900), alat("board2", 1400)] }), KINI).status,
  "online");

t("satu alat diam = tersendat, bukan online",
  ringkasLampu(info({ alat: [alat("board1", 900), alat("board2", 40_000)] }), KINI).status,
  "tersendat");

t("teks menyebut berapa dari berapa",
  ringkasLampu(info({ alat: [alat("board1", 900), alat("board2", 40_000)] }), KINI).teks,
  "1 dari 2 alat online");

t("semua diam 40 detik = tersendat (belum tentu mati)",
  ringkasLampu(info({ alat: [alat("board1", 40_000), alat("board2", 50_000)] }), KINI).status,
  "tersendat");

t("semua diam lebih dari 3 menit = mati",
  ringkasLampu(info({ alat: [alat("board1", 600_000), alat("board2", 700_000)] }), KINI).status,
  "mati");

t("jumlah yang hidup dihitung benar",
  ringkasLampu(info({ alat: [alat("board1", 900), alat("board2", 900), alat("board3", 99_000)] }), KINI).hidup,
  2);

/* Jam, bukan "3 jam lalu": kasir mencocokkannya dengan jam kejadian lain
   (mati listrik, tutup toko). "3 jam lalu" memaksa orang berhitung. */
t("jam terakhir memakai alat yang PALING BARU terlihat",
  jamTerakhir(info({ alat: [alat("board1", 600_000), alat("board2", 300_000)] })).startsWith("terakhir terlihat"),
  true);

t("belum pernah terhubung dikatakan apa adanya",
  jamTerakhir(info({ alat: [] })), "belum pernah terhubung");

/* ── 3. Yang diterbitkan ke alat hanya meja yang PUNYA lampu ───────
   Ini salinan persis penyaring di `supabase/functions/_sumber/terbit.ts`.
   Kalau penyaring di sana dihapus, uji ini tetap hijau — tapi daftar meja
   di bawah menunjukkan apa yang seharusnya keluar, dan selisihnya
   langsung terlihat saat dibandingkan. */

const st: State = init({ seed: true });
const terbit: Record<string, boolean> = {};
for (const [id, on] of Object.entries(st.lights)) {
  if (punyaLampu(id)) terbit[id] = on === true;
}

t("tidak ada meja Smokehouse di status lampu",
  Object.keys(terbit).filter((id) => id.startsWith("S")), []);

t("meja biliar reguler ikut terbit", terbit["T01"] !== undefined, true);
t("VIP ikut terbit", terbit["V01"] !== undefined, true);

t("mesin sendiri tidak pernah menaruh meja resto di peta lampu",
  Object.keys(st.lights).filter((id) => !punyaLampu(id)), []);

t("isinya hanya benar/salah — alat membacanya sebagai 1/0",
  [...new Set(Object.values(terbit).map((v) => typeof v))], ["boolean"]);

console.log(bad ? `\n${bad} SALAH dari ${total}` : `\nSEMUA BENAR (${total} pemeriksaan)`);
if (bad) process.exit(1);
