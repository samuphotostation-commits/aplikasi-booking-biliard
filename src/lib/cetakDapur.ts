/* ═══════════════════════════════════════════════════════════════════
   KERTAS DAPUR

   Satu kertas = satu kali pesan untuk satu meja di satu bagian. Tiket di mesin
   dibuat per hidangan, jadi tanpa pengelompokan pesanan lima menu keluar jadi
   lima sobekan kertas yang harus dikumpulkan lagi oleh juru masak.

   Tiap hidangan punya kotak kosong supaya bisa dicentang dengan pulpen saat
   dikerjakan. Berkas ini murni teks: tidak menyentuh printer atau peramban,
   jadi seluruh aturannya bisa diuji.
   ═══════════════════════════════════════════════════════════════════ */
import type { Ticket } from "../data/live";

export type Bagian = Ticket["station"];

export type KertasDapur = {
  bagian: Bagian;
  meja: string;
  via?: string;
  /** Lantai meja & kode pesanan — ditulis di bawah nomor meja (pemilik 15 Nov 2026). */
  lantai?: number;
  kode?: string;
  at: number;
  item: Ticket[];
};

/** Kertas yang lebih tua dari ini tidak dicetak otomatis: pesanan seperti itu sudah basi. */
const BATAS_OTOMATIS_MS = 2 * 60 * 60_000;

/** Nomor tiket bisa bergeser saat jejak diputar ulang; isinya tidak. */
export const kunciTiket = (t: Ticket) =>
  [t.sessionId, t.at, t.station, t.itemId, t.variant ?? "", t.lineKey ?? ""].join("|");

/**
 * Jarak paling jauh antar-tiket yang masih dianggap SATU KALI PESAN.
 *
 * Kasir mengirim satu pesanan berisi beberapa menu sebagai beberapa aksi
 * `addFnb` berturut-turut, dan tiap aksi mendapat jamnya sendiri — selisihnya
 * cuma milidetik. Dulu kertas dikelompokkan per jam PERSIS, jadi pesanan lima
 * menu keluar jadi lima kertas dan lima kartu checker (laporan staf 14 Nov
 * 2026: "harusnya per meja, bukan satu satuan").
 */
export const JEDA_SATU_PESAN_MS = 30_000;

/** Tiket satu meja & satu bagian yang masuk berdekatan = satu kertas. */
export function kelompokkan(tiket: Ticket[]): KertasDapur[] {
  const hasil: KertasDapur[] = [];
  const terakhir = new Map<string, KertasDapur>();
  for (const t of [...tiket].sort((x, y) => x.at - y.at)) {
    const k = `${t.sessionId}|${t.station}`;
    const ada = terakhir.get(k);
    if (ada && t.at - ada.at <= JEDA_SATU_PESAN_MS) ada.item.push(t);
    else {
      const baru: KertasDapur = {
        bagian: t.station, meja: t.tableName, via: t.via, at: t.at, item: [t],
        ...(t.lantai ? { lantai: t.lantai } : {}), ...(t.kode ? { kode: t.kode } : {}),
      };
      hasil.push(baru);
      terakhir.set(k, baru);
    }
  }
  return hasil.sort((x, y) => x.at - y.at);
}

/** Yang perlu keluar otomatis: baru masuk, belum pernah dicetak, dan belum basi. */
export function perluDicetak(tiket: Ticket[], sudah: Set<string>, kini: number): Ticket[] {
  return tiket.filter((t) =>
    t.status === "new" && !sudah.has(kunciTiket(t)) && kini - t.at <= BATAS_OTOMATIS_MS);
}

const aman = (s: string) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dua = (n: number) => String(n).padStart(2, "0");
const jamTeks = (ms: number) => {
  const d = new Date(ms);
  return `${dua(d.getHours())}:${dua(d.getMinutes())}`;
};

/** Hitam putih penuh dan huruf besar: kertas termal dibaca dari jauh, di dapur yang panas. */
export function htmlKertas(k: KertasDapur, opsi: { ulang?: boolean } = {}): string {
  const baris = k.item.map((t) => `<div class="i"><span class="c"></span><div class="t">
<b>${t.qty}× ${aman(t.name)}</b>${t.variant ? `<div class="v">${aman(t.variant)}</div>` : ""}${
  t.note ? `<div class="n">${aman(t.note)}</div>` : ""}</div></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000}
body{font-family:Arial,Helvetica,sans-serif;padding:2mm 3mm 10mm}
.b{display:flex;justify-content:space-between;font-size:11pt;font-weight:700;border-bottom:2px solid #000;padding-bottom:1mm}
.m{font-size:22pt;font-weight:800;line-height:1.1;margin-top:2mm;word-break:break-word}
.a{font-size:10pt;margin-top:.5mm}.u{background:#000;color:#fff;padding:0 2mm}
.k{font-size:12pt;font-weight:700;margin-top:.5mm}
.i{display:flex;gap:2mm;margin-top:3mm;break-inside:avoid}
.c{flex:none;width:5mm;height:5mm;border:2px solid #000;margin-top:.5mm}
.t{flex:1;min-width:0;font-size:14pt;line-height:1.2;word-break:break-word}
.v{font-size:11pt;font-weight:400}.n{margin-top:1mm;background:#000;color:#fff;font-size:12pt;font-weight:700;padding:1mm 1.5mm}
.e{margin-top:4mm;border-top:2px solid #000;padding-top:1mm;font-size:10pt;display:flex;justify-content:space-between}
</style></head><body>
<div class="b"><span>${k.bagian === "bar" ? "BAR" : "DAPUR"}</span>${opsi.ulang ? '<span class="u">CETAK ULANG</span>' : ""}<span>${jamTeks(k.at)}</span></div>
<div class="m">${aman(k.meja)}</div>${k.lantai || k.kode ? `<div class="k">${
  [k.lantai ? `LANTAI ${k.lantai}` : "", k.kode ? `#${aman(k.kode)}` : ""].filter(Boolean).join(" · ")}</div>` : ""}${k.via ? `<div class="a">${aman(k.via)}</div>` : ""}
${baris}
<div class="e"><span>${k.item.reduce((n, t) => n + t.qty, 0)} porsi</span><span>${k.item.length} menu</span></div>
</body></html>`;
}
