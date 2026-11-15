/**
 * CAFE ORDER (CO) — daftar pesanan TANPA HARGA.
 *
 * Arahan pemilik (PDF 15 Nov 2026 + foto CO lama): saat meja pesan makanan &
 * minuman dan bayarnya di akhir, yang paling perlu dicetak adalah CO-nya —
 * "list orderan makanan". Isinya: no seri, tanggal, kasir, jam cetak, meja,
 * lalu pesanan & jumlahnya. Tanpa harga (harga ada di BILL).
 *
 * Dicetak ke printer struk, 2 lembar, masing-masing terpotong (sama seperti
 * contoh pemilik), sepanjang isinya saja.
 */
import { LEBAR_KERTAS_MM } from "./cetak";

export type BarisCO = { nama: string; qty: number; varian?: string; catatan?: string; station?: "kitchen" | "bar" | "billiard" };

const aman = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function htmlCafeOrder(o: {
  venue: "spl" | "smh";
  no: string;
  meja: string;
  tamu?: string;
  kasir: string;
  at: number;
  baris: BarisCO[];
  /** "TAMBAHAN" kalau ini pesanan susulan di meja yang sudah pesan. */
  catatanAtas?: string;
  /** Bagian CO: "MAKANAN" atau "MINUMAN · KEMASAN · ROKOK". */
  bagian?: string;
}): string {
  const d = new Date(o.at);
  const tgl = d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const jam = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
  const baris = o.baris.map((b) => `<tr><td class="n">${aman(b.nama)}${b.varian ? ` <i>(${aman(b.varian)})</i>` : ""}${
    b.catatan ? `<div class="c">* ${aman(b.catatan)}</div>` : ""}</td><td class="q">${b.qty}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000}
body{width:100%;max-width:${LEBAR_KERTAS_MM}mm;padding:2mm 2.5mm 3mm;font-family:Arial,Helvetica,sans-serif;font-size:10pt}
.v{text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:12pt;letter-spacing:.5px}
.j{text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:15pt;font-weight:700;margin-top:.5mm}
.t{text-align:center;font-weight:700;border:.4mm solid #000;margin-top:1mm;padding:.5mm}
.b{text-align:center;font-size:11.5pt;font-weight:800;border-top:.8mm solid #000;border-bottom:.8mm solid #000;margin-top:1mm;padding:.4mm 0;letter-spacing:.5px}
.r{display:flex;justify-content:space-between;gap:2mm;margin-top:1mm}
.m{font-size:12pt;font-weight:700;margin-top:1.5mm}
table{width:100%;border-collapse:collapse;margin-top:1mm;border-top:.4mm solid #000}
td{padding:1mm 0;vertical-align:top;border-bottom:.2mm dashed #000}
.n{font-size:11.5pt;font-weight:700;text-transform:uppercase}.q{width:12mm;text-align:right;font-size:13pt;font-weight:700}
.c{font-size:9.5pt;font-weight:400;text-transform:none}
.k{margin-top:1.5mm;font-size:8.5pt;text-align:center}
</style></head><body>
<div class="v">${o.venue === "smh" ? "SMOKE HOUSE RESTO" : "SPORT POOL LOUNGE"}</div>
<div class="j">CAFE ORDER</div>
${o.bagian ? `<div class="b">${aman(o.bagian)}</div>` : ""}
${o.catatanAtas ? `<div class="t">${aman(o.catatanAtas)}</div>` : ""}
<div class="r"><span>${aman(o.no)}</span><span>${tgl} ${jam}</span></div>
<div class="r"><span>Kasir : ${aman(o.kasir)}</span><span>Cetak ${jam}</span></div>
<div class="m">Meja : ${aman(o.meja)}${o.tamu && !o.meja.includes(o.tamu) ? ` · ${aman(o.tamu)}` : ""}</div>
<table>${baris}</table>
<div class="k">Total ${o.baris.reduce((n, b) => n + b.qty, 0)} porsi</div>
</body></html>`;
}

/*
 * CO DIPISAH PER BAGIAN (pemilik 16 Nov 2026): untuk crew ada DUA CO —
 *   CO MAKANAN (dapur)
 *   CO MINUMAN + kemasan + rokok (bar & counter)
 * masing-masing 2 rangkap. Bagian yang tidak ada pesanannya tidak dicetak.
 */
export const BAGIAN_CO = [
  { kunci: "makanan", judul: "MAKANAN", cocok: (b: BarisCO) => !b.station || b.station === "kitchen" },
  { kunci: "minuman", judul: "MINUMAN · KEMASAN · ROKOK", cocok: (b: BarisCO) => b.station === "bar" || b.station === "billiard" },
] as const;

/** Satu HTML CO per bagian yang ada isinya. */
export function htmlCafeOrderTerpisah(info: Omit<Parameters<typeof htmlCafeOrder>[0], "baris" | "bagian">, baris: BarisCO[]): string[] {
  return BAGIAN_CO.flatMap((g) => {
    const isi = baris.filter(g.cocok);
    return isi.length ? [htmlCafeOrder({ ...info, baris: isi, bagian: g.judul })] : [];
  });
}

const K_CO_OTOMATIS = "spl:v1:co-otomatis";
/** CO dicetak otomatis setiap pesanan meja (bawaan: YA). Setelan perangkat. */
export const coOtomatis = (): boolean => {
  try { return window.localStorage.getItem(K_CO_OTOMATIS) !== "0"; } catch { return true; }
};
export const aturCoOtomatis = (nyala: boolean) => {
  try { window.localStorage.setItem(K_CO_OTOMATIS, nyala ? "1" : "0"); } catch { /* mode privat */ }
};
