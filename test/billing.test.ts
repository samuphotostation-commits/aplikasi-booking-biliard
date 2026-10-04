import { billOpenSession, bestPromo, discountOf, GRACE_MINUTES, MIN_BILLED_MINUTES, roundRupiah } from "../src/lib/billing";
import { SEED_PROMOS } from "../src/data/staff";
// Jam uji dibaca dalam WIB, sama seperti mesinnya — kalau memakai zona mesin
// penguji, tes ini hanya lolos di perangkat yang kebetulan disetel WIB.
import { dariWib, diWib, tanggalWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const at = (h: number, m = 0) => {
  const [y, mo, d] = tanggalWib(Date.now()).split("-").map(Number);
  return dariWib(y, mo, d, h, m);
};
/** Timestamp WIB jam `h` pada hari-kerja `dow` (0=Minggu) pertama mulai hari ini. */
const atDow = (dow: number, h: number) => {
  let ts = at(h);
  while (diWib(ts).getUTCDay() !== dow) ts += 24 * 3_600_000;
  return ts;
};
const RATES = { regularDay: 29_000, regularNight: 39_000, vip: 50_000, vvip: 60_000 };

console.log("-- Toleransi batal 5 menit, lalu langsung 30 menit --");
{
  const a = billOpenSession("regular", at(13, 0), at(13, 3), RATES);
  t("batal menit ke-3: tidak ditagih", a.amount, 0);
  t("ditandai toleransi", [a.graceApplied, a.billedMinutes], [true, 0]);
  const b = billOpenSession("regular", at(13, 0), at(13, 5), RATES);
  t(`tepat menit ke-${GRACE_MINUTES} masih gratis`, b.amount, 0);
  const c = billOpenSession("regular", at(13, 0), at(13, 6), RATES);
  t("menit ke-6 langsung 30 menit", [c.graceApplied, c.billedMinutes, c.amount], [false, 30, 14_500]);
}

console.log("\n-- VVIP (bebas rokok) & meja resto --");
{
  const v = billOpenSession("vvip", at(13, 0), at(15, 0), RATES);
  t("VVIP 2 jam = 2 × 60.000", v.amount, 120_000);
  const n = billOpenSession("vvip", at(20, 0), at(22, 0), RATES);
  t("VVIP malam sama tarifnya", n.amount, 120_000);
  const r = billOpenSession("resto", at(19, 0), at(22, 0), RATES);
  t("meja resto tidak menagih waktu", [r.amount, r.billedMinutes], [0, 0]);
}

console.log("\n-- Open bill: minimum 30 menit --");
{
  const b = billOpenSession("regular", at(13, 0), at(13, 10), RATES);
  t("main 10 menit -> ditagih 30 menit", b.billedMinutes, MIN_BILLED_MINUTES);
  t("ditandai kena minimum", b.minimumApplied, true);
  // 30 menit @ 29.000/jam = 14.500 -> bulat ke atas kelipatan 500 = 14.500
  t("tagihan 30 menit siang", b.amount, 14_500);
}

console.log("\n-- Per menit setelah 30 menit --");
{
  const b = billOpenSession("regular", at(13, 0), at(13, 45), RATES);
  t("main 45 menit -> ditagih 45", b.billedMinutes, 45);
  // 45/60 * 29.000 = 21.750 -> bulat atas 500 = 22.000
  t("tagihan 45 menit siang", b.amount, 22_000);
}
{
  const b = billOpenSession("regular", at(13, 0), at(14, 7), RATES);
  // 67/60 * 29.000 = 32.383 -> 32.500
  t("main 1 jam 7 menit", b.amount, 32_500);
}

console.log("\n-- Lintas tarif pukul 18.00 --");
{
  const b = billOpenSession("regular", at(17, 40), at(18, 20), RATES);
  t("dua segmen tarif", b.segments.length, 2);
  t("segmen 1 = 20 menit @29.000", [b.segments[0].minutes, b.segments[0].ratePerHour], [20, 29_000]);
  t("segmen 2 = 20 menit @39.000", [b.segments[1].minutes, b.segments[1].ratePerHour], [20, 39_000]);
  // 20/60*29000 + 20/60*39000 = 9.666,7 + 13.000 = 22.666,7 -> 23.000
  t("total dibulatkan", b.amount, 23_000);
}

console.log("\n-- VIP tarif tunggal --");
{
  const b = billOpenSession("vip", at(13, 0), at(15, 0), RATES);
  t("VIP 2 jam", b.amount, 100_000);
  const c = billOpenSession("vip", at(20, 0), at(22, 0), RATES);
  t("VIP malam sama tarifnya", c.amount, 100_000);
}

console.log("\n-- Regresi audit: tidak ada galat desimal & malam tetap malam --");
{
  // 35.000/jam × 54 menit = 31.500 tepat. Penjumlahan pecahan dulu menghasilkan
  // 31.500,000…04 lalu dibulatkan ke 32.000 (tamu kelebihan tagih Rp 500).
  const b = billOpenSession("regular", at(13, 0), at(13, 54), { ...RATES, regularDay: 35_000 });
  t("35.000/jam × 54 menit = 31.500 (bukan 32.000)", b.amount, 31_500);
  t("nilai mentah tepat 31.500", b.rawAmount, 31_500);
  // Lewat tengah malam sampai sesudah 02.00: seluruhnya tarif malam, bukan kembali ke siang.
  const c = billOpenSession("regular", at(1, 50), at(3, 0), RATES);
  t("01.50–03.00 = 70 menit @39.000 = 45.500", c.amount, 45_500);
  t("jam 02.00 tetap bertarif malam", c.segments.map((s) => s.ratePerHour), [39_000, 39_000]);
  // Tab yang lupa ditutup 60 jam: seluruh waktunya ditagih, tidak berhenti di jam ke-48.
  const vip60 = billOpenSession("vip", at(13, 0), at(13, 0) + 60 * 3_600_000, RATES);
  t("VIP 60 jam = 60 × 50.000", vip60.amount, 3_000_000);
}

console.log("\n-- Pembulatan ke atas kelipatan 500 --");
t("21.750 -> 22.000", roundRupiah(21_750), 22_000);
t("22.000 tetap", roundRupiah(22_000), 22_000);
t("22.001 -> 22.500", roundRupiah(22_001), 22_500);

console.log("\n-- Promo --");
{
  const happy = SEED_PROMOS.find((p) => p.id === "p-happy")!;
  t("happy hour 20% dari meja saja", discountOf(happy, 100_000, 80_000), 20_000);

  const combo = SEED_PROMOS.find((p) => p.id === "p-combo")!;
  t("combo butuh min belanja 100k F&B", discountOf(combo, 100_000, 80_000), 0);
  t("combo berlaku saat F&B 120k", discountOf(combo, 0, 120_000), 15_000);

  const capped = { ...happy, maxDiscount: 15_000 };
  t("batas maksimum diskon dihormati", discountOf(capped, 100_000, 0), 15_000);
}

console.log("\n-- Promo tidak bertumpuk, ambil yang terbaik --");
{
  const senin = atDow(1, 13);
  const hasil = bestPromo(SEED_PROMOS, 200_000, 200_000, senin, "COMBO50");
  // happy hour 20% x 200.000 (meja) = 40.000  vs  combo 15.000 -> happy menang
  t("pilih diskon terbesar", hasil?.discount, 40_000);
  t("hanya satu promo dipakai", hasil?.promo.id, "p-happy");
}

console.log("\n-- Promo nonaktif tidak berlaku --");
{
  const off = SEED_PROMOS.find((p) => p.id === "p-weekend")!;
  t("weekend nonaktif", off.active, false);
  const sabtu = atDow(6, 22);
  t("tidak terpakai walau jamnya cocok",
    bestPromo([off], 500_000, 0, sabtu), null);
}

console.log("\n-- Hari promo mengikuti hari operasional (batas 02.00) --");
{
  const malamSabtu = { ...SEED_PROMOS.find((p) => p.id === "p-weekend")!, active: true };
  // Minggu 01.00 dini hari masih "Sabtu malam" bagi tamu dan kasir.
  const mingguDini = atDow(0, 1);
  t("Sabtu malam pukul 01.00 (Minggu kalender) tetap dapat promo",
    bestPromo([malamSabtu], 500_000, 0, mingguDini)?.discount, 50_000);
  // Sabtu 01.00 dini hari masih "Jumat malam" — Jumat juga termasuk hari promo ini.
  const seninDini = atDow(1, 1);
  t("Minggu malam pukul 01.00 (Senin kalender) tidak dapat promo akhir pekan",
    bestPromo([malamSabtu], 500_000, 0, seninDini), null);
}

console.log("");
console.log(bad === 0 ? `SEMUA BENAR (${total} pemeriksaan)` : `${bad} dari ${total} SALAH`);
if (bad > 0) process.exitCode = 1;
