/* ═══════════════════════════════════════════════════════════════════
   PERSEN PAJAK DI LAYAR BAYAR = PERSEN DI LAPORAN

   Sampai 26 Okt 2026 ada DUA tempat yang memegang angka ini: `store.tsx`
   menanam `PBJT_RATE = 0.1` untuk layar bayar, sementara rekap membacanya
   dari pengaturan venue — yang sejak 18 Okt 2026 boleh berbeda PER LINI.

   Selama keduanya kebetulan 10% tidak ada yang terlihat salah. Begitu
   pemilik mengubahnya di panel Atur, layar bayar tetap menulis "PBJT 10%"
   sementara laporan memakai angka lain: tidak ada galat, tidak ada
   peringatan, cuma dua angka yang diam-diam berbeda.

   Berkas ini yang menahannya supaya tidak terjadi lagi. Yang diperiksa
   bukan "apakah 10% benar" — itu urusan pemilik dan kantor pajak —
   melainkan apakah layar bayar MENGIKUTI apa pun yang diatur.
   ═══════════════════════════════════════════════════════════════════ */
import { computeTotals, type Draft, type CartLine } from "../src/lib/store";
import { RATES, TABLES } from "../src/data/venue";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};
const benar = (label: string, syarat: boolean) => t(label, syarat, true);

/** Meja reguler pertama di denah — bukan id yang ditulis tangan. */
const MEJA = TABLES.find((m) => m.type === "regular")!;

const draft: Draft = {
  dateISO: "2026-10-26",
  startHour: 11, hours: 2,
  tableId: MEJA.id, tableType: "regular", paketId: null,
  fnbMode: "meja", fnbTable: null, fnbTableAt: null,
  fnbSessionId: null, fnbPay: "online",
};

/** Satu minuman (lini bar) dan satu hidangan (lini resto). */
const cart: CartLine[] = [
  { key: "a", itemId: "cd-01", qty: 2 },   // Ice Tea — station bar
  { key: "b", itemId: "lb-01", qty: 1 },   // Tempe Mendoan — station kitchen
];

const venue = (pajak: { ppn: number; service: number }, pajakLini?: Parameters<typeof computeTotals>[2]["pajakLini"]) => ({
  rates: { ...RATES }, menuPrices: {}, sessions: [], customItems: [], packages: [],
  tableTypes: {}, pajak, ...(pajakLini ? { pajakLini } : {}),
});

/* ── 1. Jumlahnya tidak pernah bocor ─────────────────────────────── */
const a = computeTotals(draft, cart, venue({ ppn: 10, service: 0 }));
t("dpp + pajak + service = total yang dibayar", a.dpp + a.tax + a.service, a.grand);

/* ── 2. Mengubah persen TIDAK menggeser tagihan (INV-53 di layar) ── */
const b = computeTotals(draft, cart, venue({ ppn: 5, service: 0 }));
t("total tidak berubah saat persen diubah", b.grand, a.grand);
t("dpp + pajak + service tetap utuh di persen lain", b.dpp + b.tax + b.service, b.grand);

/* ── 3. …tapi pecahannya IKUT. Ini inti perbaikannya ─────────────── */
benar("pajak 5% lebih kecil daripada 10%", b.tax < a.tax);
benar("dpp 5% lebih besar daripada 10%", b.dpp > a.dpp);
t("persen yang ditulis di layar ikut pengaturan", [a.persenPpn, b.persenPpn], [10, 5]);

/* ── 4. Service ditarik keluar, bukan dilebur ke pajak ───────────── */
const c = computeTotals(draft, cart, venue({ ppn: 10, service: 5 }));
benar("service > 0 saat diatur > 0", c.service > 0);
t("service tidak menggeser tagihan", c.grand, a.grand);
t("dpp + pajak + service tetap utuh dengan service", c.dpp + c.tax + c.service, c.grand);

/* ── 5. Persen berbeda per lini ──────────────────────────────────── */
const beda = computeTotals(draft, cart, venue({ ppn: 10, service: 0 }, {
  biliar: { ppn: 10, service: 0 },
  bar: { ppn: 5, service: 0 },
  resto: { ppn: 5, service: 0 },
}));
t("tagihan tetap sama walau persennya beda per lini", beda.grand, a.grand);
t("dpp + pajak + service tetap utuh per lini", beda.dpp + beda.tax + beda.service, beda.grand);
benar("pajaknya di antara tarif tertinggi dan terendah", beda.tax < a.tax && beda.tax > b.tax);
/* Tagihan mencampur meja biliar 10% dan makanan 5%: tidak ada SATU persen
   yang benar untuk seluruh tagihan, jadi layar bayar tidak menyebut angka. */
t("persen tidak ditulis saat lininya tidak seragam", beda.persenPpn, null);

/* ── 6. Keranjang satu lini tetap menyebut angkanya ──────────────── */
const fnbSaja = computeTotals(
  { ...draft, tableId: null, startHour: null },
  [{ key: "a", itemId: "cd-01", qty: 2 }],
  venue({ ppn: 10, service: 0 }, {
    biliar: { ppn: 11, service: 0 }, bar: { ppn: 7, service: 0 }, resto: { ppn: 7, service: 0 },
  }),
);
t("keranjang satu lini menyebut persen lini itu", fnbSaja.persenPpn, 7);

console.log(bad ? `\n${bad} SALAH dari ${total}` : `\nSEMUA BENAR (${total} pemeriksaan)`);
if (bad) process.exit(1);
