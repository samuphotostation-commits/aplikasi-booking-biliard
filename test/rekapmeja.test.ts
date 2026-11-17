/* ═══════════════════════════════════════════════════════════════════
   REKAP = TRANSAKSI (temuan pemilik 17 Nov 2026, urgent)

   "Orderan resto, bar, counter yang di dalam meja tidak kedata. Mestinya
   orderan di dalam meja masuk sesuai kategorinya. Pastikan semua data
   transaksi terekap detail per shift, dan keseluruhan shift sesuai
   kategori. Pastikan sama antara transaksi yang masuk dengan rekap."

   Semua jalur penutupan tab dicoba: Check Out biasa, bayar sebagian lalu
   Check Out, paket "bayar langsung" yang tertutup sendiri saat habis,
   paket habis yang tagihannya pindah ke Kasir, tunai, dan dua kasir dengan
   shift sendiri-sendiri. Lalu dicek: tiap barang ada di kategori yang benar,
   jumlah per kategori per shift = jumlah keseluruhan, dan uang yang masuk =
   pendapatan di rekap.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, runningOn, itemOf, rekapTigaJenis, omzetPerShift, settlementOf, SHIFT_PER_KASIR,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { businessDateOf, dariWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const hari = businessDateOf(Math.max(Date.now(), SHIFT_PER_KASIR + 86_400_000));
const [Y, M, D] = hari.split("-").map(Number);
const jam = (h: number, m = 0) => dariWib(Y, M, D, h, m);
const RIAN = "u-rian", YOGA = "u-yoga";
const RESTO = "lb-01", BAR = "cf-01", COUNTER = "bl-01";

const genesis: Genesis = { at: jam(5), seed: false };
let n = 0;
const entries: Entry[] = [];
const push = (at: number, act: Action, by: string) =>
  entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
const st = () => replay(genesis, entries);
let k = 0;
const pesan = (meja: string, itemId: string, qty: number, by: string, at: number) => {
  const it = itemOf(st(), itemId)!;
  push(at, { t: "addFnb", sessionId: runningOn(st(), meja)!.id, name: it.name, station: it.station,
    line: { key: `k${++k}`, itemId, qty } }, by);
};

push(jam(11), { t: "openShift", openingCash: 0, venue: "spl" }, RIAN);
push(jam(11, 1), { t: "openShift", openingCash: 0, venue: "spl" }, YOGA);

// 1. Open bill + resto/bar/counter, Check Out (SPL)
push(jam(12), { t: "walkin", tableId: "T01", guest: "A" }, RIAN);
pesan("T01", RESTO, 2, RIAN, jam(12, 5));
pesan("T01", BAR, 1, RIAN, jam(12, 6));
pesan("T01", COUNTER, 3, RIAN, jam(12, 7));
const a1 = runningOn(st(), "T01")!.id;
push(jam(13), { t: "settle", id: a1, channel: "checkout" }, RIAN);

// 2. Open bill, bayar sebagian lalu Check Out — kasir lain
push(jam(12, 10), { t: "walkin", tableId: "T02", guest: "B" }, YOGA);
pesan("T02", RESTO, 1, YOGA, jam(12, 11));
pesan("T02", BAR, 2, YOGA, jam(12, 12));
const a2 = runningOn(st(), "T02")!.id;
push(jam(12, 30), { t: "paySplit", id: a2, channel: "cash", amount: 20_000, label: "Orang 1" } as unknown as Action, YOGA);
push(jam(13, 30), { t: "settle", id: a2, channel: "checkout" }, YOGA);

// 3. Paket 1 jam bayar langsung, pesanan di dalam meja, tertutup sendiri saat habis
push(jam(14), { t: "walkin", tableId: "T03", guest: "C", hours: 1 }, RIAN);
pesan("T03", RESTO, 1, RIAN, jam(14, 2));
pesan("T03", COUNTER, 1, RIAN, jam(14, 3));
const a3 = runningOn(st(), "T03")!.id;
// Layar "bayar langsung" menagih paket PENUH (lihat `sesiTagih` di Board.tsx).
const due3 = settlementOf({ ...runningOn(st(), "T03")!, bayarDiMuka: true }, st(), jam(14, 4)).due;
push(jam(14, 4), { t: "paySplit", id: a3, channel: "checkout", amount: due3, label: "Bayar langsung" } as unknown as Action, RIAN);
push(jam(15, 5), { t: "tick" }, RIAN);

// 4. Paket 1 jam belum dibayar → habis → pindah ke Kasir → Check Out kasir lain
push(jam(15), { t: "walkin", tableId: "T04", guest: "D", hours: 1 }, RIAN);
pesan("T04", BAR, 2, RIAN, jam(15, 2));
const a4 = runningOn(st(), "T04")!.id;
push(jam(16, 2), { t: "tick" }, RIAN);
push(jam(16, 10), { t: "settle", id: a4, channel: "checkout" }, YOGA);

// 5. Tunai biasa
push(jam(17), { t: "walkin", tableId: "T05", guest: "E" }, YOGA);
pesan("T05", COUNTER, 2, YOGA, jam(17, 1));
const a5 = runningOn(st(), "T05")!.id;
push(jam(17, 40), { t: "settle", id: a5, channel: "cash" }, YOGA);

const s = st();
const tutup = (id: string) => s.sessions.find((x) => x.id === id)!;
t("semua tab tertutup", [a1, a2, a3, a4, a5].map((id) => tutup(id).status), ["done", "done", "done", "done", "done"]);

const r = rekapTigaJenis(s, hari, "spl");
const qty = (xs: { itemId: string; qty: number }[], id: string) => xs.find((x) => x.itemId === id)?.qty ?? 0;
console.log("\n-- Barang di dalam meja masuk kategorinya --");
t("Resto (Tempe Mendoan) = 2+1+1", qty(r.resto, RESTO), 4);
t("Bar (Espresso) = 1+2+2", qty(r.bar, BAR), 5);
t("Counter (rokok/botolan) = 3+1+2", qty(r.billiard, COUNTER), 6);

console.log("\n-- Jumlah barang = nilai F&B semua tab --");
const fnbTab = [a1, a2, a3, a4, a5].reduce((n0, id) => n0 + (tutup(id).settledFnb ?? 0), 0);
t("total barang rekap = settledFnb semua tab", r.totalBarang, fnbTab);

console.log("\n-- Per shift: kategori per shift dijumlah = keseluruhan --");
const os = omzetPerShift(s, hari, "spl");
const kat = (key: "resto" | "bar" | "counter") => os.shift.reduce((n0, b) => n0 + b.kategori[key], 0)
  + (os.tanpaShift ? os.tanpaShift.kategori[key] : 0);
t("resto per shift dijumlah = rekap resto", kat("resto"), r.totalResto);
t("bar per shift dijumlah = rekap bar", kat("bar"), r.totalBar);
t("counter per shift dijumlah = rekap counter", kat("counter"), r.totalBilliard);
t("barang per shift dijumlah = total barang", os.semua.barang, r.totalBarang);
t("tidak ada transaksi tanpa shift", os.tanpaShift, null);

console.log("\n-- Uang masuk = pendapatan rekap --");
const masuk = os.rincian.reduce((n0, x) => n0 + x.jumlah, 0);
t("jumlah semua transaksi = uang di rekap", masuk, r.uang.total);
t("uang di rekap = pendapatan (selisih 0)", r.uang.total - r.pendapatan, 0);

console.log(`\n${total - bad}/${total} lulus`);
if (bad) process.exit(1);
