/* Data tambahan member: tanggal lahir dan domisili.
   Sengaja hanya tingkat kecamatan, bukan alamat lengkap: itu sudah cukup untuk
   membaca asal pelanggan, cepat diisi, dan tidak menyimpan alamat rumah orang. */

export const KECAMATAN_PADANG = [
  "Bungus Teluk Kabung", "Koto Tangah", "Kuranji", "Lubuk Begalung", "Lubuk Kilangan", "Nanggalo",
  "Padang Barat", "Padang Selatan", "Padang Timur", "Padang Utara", "Pauh",
];

export const AWALAN_LUAR = "Luar Padang";

const USIA_MIN = 10;
const USIA_MAKS = 100;

/** Angka yang diketik jadi HH/BB/TTTT, supaya tanggal cukup diketik di papan angka. */
export function rapikanTanggal(ketik: string): string {
  const a = ketik.replace(/\D/g, "").slice(0, 8);
  return [a.slice(0, 2), a.slice(2, 4), a.slice(4)].filter(Boolean).join("/");
}

/** HH/BB/TTTT jadi TTTT-BB-HH. null kalau tanggalnya tidak ada atau usianya tidak masuk akal. */
export function keIso(teks: string, kini = new Date()): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(teks);
  if (!m) return null;
  const [h, b, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(t, b - 1, h));
  if (d.getUTCFullYear() !== t || d.getUTCMonth() !== b - 1 || d.getUTCDate() !== h) return null;
  const usia = kini.getFullYear() - t;
  if (usia < USIA_MIN || usia > USIA_MAKS) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export const dariIso = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

export const domisiliLengkap = (v: string): boolean =>
  KECAMATAN_PADANG.includes(v) || (v.startsWith(`${AWALAN_LUAR} · `) && v.length > AWALAN_LUAR.length + 4);
