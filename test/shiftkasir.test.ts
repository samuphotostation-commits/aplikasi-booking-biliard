/* ═══════════════════════════════════════════════════════════════════
   SHIFT PER KASIR (pemilik 17 Nov 2026)

   "Fitur shift multi, karena di sini ada 2 komputer aktif dan bakal ada
   penambahan PC." Pilihan pemilik: tiap kasir shift sendiri — modal dan
   hitungan laci sendiri, uang tercatat ke shift kasir yang menekan bayar.

   Yang dibuktikan:
     1. Dua kasir SPL membuka shift sendiri-sendiri, bersamaan.
     2. Satu kasir hanya satu shift per venue.
     3. Tunai & bayar sebagian masuk laci kasir yang menerimanya.
     4. Menutup shift sendiri tidak menyentuh shift kasir lain.
     5. Shift di depan ditutup → shift kasir lain naik menggantikannya.
     6. Kasir tidak bisa menutup shift kasir lain; pengurus keuangan bisa.
     7. Meteran open bill tidak berhenti selama masih ada shift yang buka.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, runningOn, shiftDi, shiftBukaDi, shiftMilik, shiftCashExpected, meterEndOf, SHIFT_PER_KASIR,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { businessDateOf, dariWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

// Hari uji selalu sesudah aturan berlaku.
const hari = businessDateOf(Math.max(Date.now(), SHIFT_PER_KASIR + 86_400_000));
const [Y, M, D] = hari.split("-").map(Number);
const jam = (h: number, m = 0) => dariWib(Y, M, D, h, m);
const RIAN = "u-rian", YOGA = "u-yoga", SINTA = "u-manager";

const genesis: Genesis = { at: jam(5), seed: false };
let n = 0;
const entries: Entry[] = [];
const push = (at: number, act: Action, by: string) =>
  entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
const st = () => replay(genesis, entries);
const nama = (xs: { employeeName: string }[]) => xs.map((x) => x.employeeName).sort();

console.log("\n-- 1 · Dua kasir SPL, dua shift bersamaan --");
push(jam(12), { t: "openShift", openingCash: 0, venue: "spl" }, RIAN);
push(jam(12, 1), { t: "openShift", openingCash: 0, venue: "spl" }, YOGA);
t("dua shift SPL buka", nama(shiftBukaDi(st(), "spl")), ["Rian", "Yoga"]);
t("shift di depan tetap Rian", shiftDi(st(), "spl", jam(12, 2))?.employeeName, "Rian");

console.log("\n-- 2 · Satu kasir satu shift --");
push(jam(12, 2), { t: "openShift", openingCash: 0, venue: "spl" }, YOGA);
t("Yoga tidak bisa membuka shift kedua", shiftBukaDi(st(), "spl").length, 2);

console.log("\n-- 3 · Uang masuk laci kasir yang menerima --");
push(jam(13), { t: "walkin", tableId: "T05", guest: "Tamu Rian" }, RIAN);
push(jam(13, 1), { t: "walkin", tableId: "T06", guest: "Tamu Yoga" }, YOGA);
push(jam(13, 2), { t: "walkin", tableId: "T07", guest: "Tamu bagi" }, YOGA);
const id5 = runningOn(st(), "T05")!.id, id6 = runningOn(st(), "T06")!.id, id7 = runningOn(st(), "T07")!.id;
push(jam(14), { t: "settle", id: id5, channel: "cash" }, RIAN);
push(jam(14, 1), { t: "settle", id: id6, channel: "cash" }, YOGA);
const shR = shiftMilik(st(), "spl", RIAN)!, shY = shiftMilik(st(), "spl", YOGA)!;
const tab = (id: string) => st().sessions.find((x) => x.id === id)!;
t("T05 tercatat di shift Rian", tab(id5).settledShiftId, shR.id);
t("T06 tercatat di shift Yoga", tab(id6).settledShiftId, shY.id);
const kasR = shiftCashExpected(st(), shR), kasY = shiftCashExpected(st(), shY);
t("laci Rian = tagihan T05", kasR, tab(id5).settledAmount);
t("laci Yoga = tagihan T06", kasY, tab(id6).settledAmount);
push(jam(14, 2), { t: "paySplit", id: id7, channel: "cash", amount: 10_000, label: "Orang 1" } as unknown as Action, YOGA);
const bayar = tab(id7).payments ?? [];
t("bayar sebagian masuk shift Yoga", bayar.map((p) => p.shiftId), [shY.id]);

console.log("\n-- 4 · Tutup shift sendiri --");
const sebelum = shiftCashExpected(st(), shY);
push(jam(15), { t: "closeShift", countedCash: sebelum, venue: "spl" }, YOGA);
t("shift Yoga tertutup, Rian masih buka", nama(shiftBukaDi(st(), "spl")), ["Rian"]);
const riw = st().shiftHistory.find((x) => x.id === shY.id);
t("riwayat Yoga: selisih 0", riw?.variance, 0);

console.log("\n-- 5 · Shift depan ditutup → kasir lain naik --");
push(jam(15, 5), { t: "openShift", openingCash: 0, venue: "spl" }, YOGA);
push(jam(16), { t: "closeShift", countedCash: shiftCashExpected(st(), shiftMilik(st(), "spl", RIAN)!), venue: "spl" }, RIAN);
t("shift di depan sekarang Yoga", shiftDi(st(), "spl", jam(16, 1))?.employeeName, "Yoga");
t("tinggal satu shift buka", shiftBukaDi(st(), "spl").length, 1);

console.log("\n-- 6 · Menutup shift orang lain --");
push(jam(16, 5), { t: "openShift", openingCash: 0, venue: "spl" }, RIAN);
const shR2 = shiftMilik(st(), "spl", RIAN)!;
push(jam(16, 10), { t: "closeShift", countedCash: 0, venue: "spl", shiftId: shR2.id }, YOGA);
t("Yoga TIDAK bisa menutup shift Rian", !!shiftMilik(st(), "spl", RIAN), true);
t("…shift Yoga sendiri juga tidak ikut tertutup", !!shiftMilik(st(), "spl", YOGA), true);
push(jam(16, 11), { t: "closeShift", countedCash: 0, venue: "spl", shiftId: shR2.id }, SINTA);
t("manajer bisa menutup shift Rian yang lupa ditutup", !!shiftMilik(st(), "spl", RIAN), false);
t("…shift Yoga tetap buka", !!shiftMilik(st(), "spl", YOGA), true);

console.log("\n-- 7 · Meteran open bill tidak berhenti selama ada shift --");
push(jam(17), { t: "openShift", openingCash: 0, venue: "spl" }, RIAN);
push(jam(17, 1), { t: "walkin", tableId: "T09", guest: "Open bill" }, RIAN);
const s9 = runningOn(st(), "T09")!;
push(jam(18), { t: "closeShift", countedCash: shiftCashExpected(st(), shiftMilik(st(), "spl", RIAN)!), venue: "spl" }, RIAN);
// Lewat 06.00 besok: meteran berhenti hanya kalau tidak ada shift yang buka.
t("Rian tutup, Yoga masih buka → meteran jalan terus lewat 06.00", meterEndOf(s9, jam(31), st()), jam(31));

console.log(`\n${total - bad}/${total} lulus`);
if (bad) process.exit(1);
