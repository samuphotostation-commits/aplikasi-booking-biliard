/* ═══════════════════════════════════════════════════════════════════
   APA YANG BENAR-BENAR DILIHAT HP PELANGGAN

   Uji yang sudah ada hanya memastikan ringkasan publik MEMUAT tanda open
   bill. Itu tidak cukup: yang dikeluhkan pemilik adalah meja yang sedang
   dipakai TETAP DITAWARKAN ke tamu. Berkas ini menempuh jalur tamu yang
   sesungguhnya — potong ke ringkasan publik, susun ulang jadi sesi, lalu
   tanyakan persis yang ditanyakan layar booking.

   Semua waktu dipatok WIB dan meja bertanggal dipasang BESOK, supaya hasilnya
   tidak bergantung jam berapa tes ini dijalankan.
   ═══════════════════════════════════════════════════════════════════ */
import { init, slotProblem, type State } from "../src/lib/engine";
import { publicVenue, sesiDariSlot } from "../src/lib/publicView";
import { HOUR_MS, businessDateOf, openBillOn, slotStart, tanggalWib } from "../src/lib/occupancy";
import { addDaysISO, availableTables } from "../src/lib/core";
import type { LiveSession } from "../src/data/live";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const KINI = Date.now();
const HARI = tanggalWib(KINI);
const BESOK = addDaysISO(HARI, 1);
const JAM_BUKA = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

const sesi = (x: Partial<LiveSession> & { id: string; tableId: string }): LiveSession => ({
  source: "online", guest: "—", startsAt: KINI, endsAt: KINI + HOUR_MS,
  status: "running", fnb: [], tableAmount: 0, paidOnline: 0, ...x,
});

const venue: State = {
  ...init({ seed: false }),
  sessions: [
    // T05 — OPEN BILL SEKARANG: walk-in tanpa jam selesai, meteran jalan.
    sesi({ id: "w-T05", tableId: "T05", source: "walkin",
      startsAt: KINI - 40 * 60_000, endsAt: KINI - 10 * 60_000 }),
    // T06 — paket per jam BESOK 19.00–21.00 (harga blok, ada jam selesai).
    sesi({ id: "w-T06", tableId: "T06", source: "walkin", blockHours: 2, status: "booked",
      startsAt: slotStart(BESOK, 19), endsAt: slotStart(BESOK, 21) }),
    // T07 — booking online BESOK 21.00–22.00.
    sesi({ id: "o-T07", tableId: "T07", status: "booked", bookingCode: "SPL-UJI1",
      startsAt: slotStart(BESOK, 21), endsAt: slotStart(BESOK, 22) }),
  ],
};

console.log("-- Ringkasan publik membawa ketiganya --");
const pv = publicVenue(venue, KINI);
t("tiga slot terkirim", pv.slots.length, 3);
t("open bill ditandai", pv.slots.find((s) => s.tableId === "T05")?.openBill, true);
t("paket per jam TIDAK ditandai open bill", pv.slots.find((s) => s.tableId === "T06")?.openBill, undefined);

console.log("\n-- HP pelanggan menyusun ulang slot itu jadi sesi --");
const tamu = sesiDariSlot(pv.slots);
t("jumlah sesi sama", tamu.length, 3);
t("open bill kembali jadi walk-in tanpa blok jam",
  [tamu.find((s) => s.tableId === "T05")!.source, tamu.find((s) => s.tableId === "T05")!.blockHours], ["walkin", undefined]);
t("mesin tamu setuju T05 open bill", openBillOn(tamu, "T05", businessDateOf(KINI)), true);

console.log("\n-- Meja OPEN BILL tidak pernah ditawarkan hari ini, jam berapa pun --");
const kosong = (tgl: string, jam: number) => availableTables(tgl, jam, 1, tamu).map((x) => x.id);
t("T05 tidak muncul di jam mana pun hari ini",
  JAM_BUKA.filter((j) => kosong(businessDateOf(KINI), j).includes("T05")), []);
t("T05 bebas lagi besok (meteran hari ini saja)", kosong(BESOK, 19).includes("T05"), true);

console.log("\n-- Meja PAKET PER JAM tertutup selama jamnya --");
t("T06 tertutup jam 19", kosong(BESOK, 19).includes("T06"), false);
t("T06 tertutup jam 20", kosong(BESOK, 20).includes("T06"), false);
// Jam 21 masih tertutup: sesi selesai 21.00 dan meja terkunci 10 menit untuk
// bersih-bersih (TURNAROUND_MIN), jadi slot 21.00 memang belum bisa dijual.
t("T06 masih tertutup jam 21 (jeda bersih-bersih)", kosong(BESOK, 21).includes("T06"), false);
t("T06 terbuka lagi jam 22", kosong(BESOK, 22).includes("T06"), true);

console.log("\n-- Meja yang DIBOOKING tertutup pada jamnya --");
t("T07 tertutup jam 21", kosong(BESOK, 21).includes("T07"), false);
t("T07 terbuka jam 19", kosong(BESOK, 19).includes("T07"), true);

console.log("\n-- Meja yang bebas tetap bebas --");
t("T08 bebas besok jam 19", kosong(BESOK, 19).includes("T08"), true);

console.log("\n-- Mesin menolak kalau tamu tetap memaksa --");
const venueTamu: State = { ...init({ seed: false }), sessions: tamu, rates: venue.rates };
const tolak = (tableId: string, tgl: string, jam: number) =>
  !!slotProblem(venueTamu, { tableId, startsAt: slotStart(tgl, jam), hours: 1 }, KINI, true);
t("open bill T05 ditolak mesin hari ini", tolak("T05", businessDateOf(KINI), 23), true);
t("paket T06 ditolak mesin saat jamnya", tolak("T06", BESOK, 20), true);
t("booking T07 ditolak mesin saat jamnya", tolak("T07", BESOK, 21), true);
t("meja bebas T08 diterima mesin", tolak("T08", BESOK, 19), false);

console.log("");
console.log(bad === 0 ? `SEMUA BENAR (${total} pemeriksaan)` : `${bad} dari ${total} SALAH`);
if (bad > 0) process.exitCode = 1;
