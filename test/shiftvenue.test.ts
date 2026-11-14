/* ═══════════════════════════════════════════════════════════════════
   KASIR & SHIFT PER VENUE (pemilik 14 Nov 2026)

   "Cashier SPL Sport dan Smokehouse ini berbeda, jadi ketika buka shift
   harusnya masing-masing berbeda."

   Alur yang dibuktikan, dari buka sampai tutup:
     1. Kasir SPL dan kasir Smokehouse membuka shift MASING-MASING, bersamaan.
     2. Perangkat yang sedang menampilkan venue lain tidak membelokkan shift.
     3. Kasir hanya bisa membuka/menagih meja venuenya sendiri.
     4. Tunai masuk laci venue yang benar — tidak pernah tercampur.
     5. Menutup shift satu venue tidak menyentuh shift venue sebelah.
     6. Serah terima: kasir berikutnya di venue yang sama membuka shift baru.
     7. Waiter tidak membuka shift. Akun kasir wajib terikat satu venue.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, runningOn, itemOf, shiftDi, shiftCashExpected, KASIR_WAJIB_VENUE,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { businessDateOf, dariWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const [Y, M, D] = businessDateOf(Date.now()).split("-").map(Number);
const jam = (h: number, m = 0) => dariWib(Y, M, D, h, m);
const NASGOR = "fr-01";
// Akun bawaan: Rian & Yoga = kasir SPL, Dewi = kasir Smokehouse, Sinta = superadmin kedua venue.
const RIAN = "u-rian", YOGA = "u-yoga", DEWI = "u-dewi", SINTA = "u-manager";

const genesis: Genesis = { at: jam(5), seed: false };
let n = 0;
const entries: Entry[] = [];
const push = (at: number, act: Action, by: string) =>
  entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
const st = () => replay(genesis, entries);
const sesi = (meja: string) => runningOn(st(), meja);

console.log("\n-- 1 · Dua kasir, dua shift, bersamaan --");
push(jam(12), { t: "openShift", openingCash: 0, venue: "spl" }, RIAN);
// Komputer Dewi kebetulan sedang menampilkan SPL — shiftnya tetap Smokehouse.
push(jam(12, 1), { t: "openShift", openingCash: 0, venue: "spl" }, DEWI);
t("shift SPL milik Rian", shiftDi(st(), "spl", jam(12, 2))?.employeeName, "Rian");
t("shift Smokehouse milik Dewi", shiftDi(st(), "smh", jam(12, 2))?.employeeName, "Dewi");
t("venue tercatat di shift", [shiftDi(st(), "spl", jam(12, 2))?.venue, shiftDi(st(), "smh", jam(12, 2))?.venue], ["spl", "smh"]);
push(jam(12, 3), { t: "openShift", openingCash: 0, venue: "spl" }, YOGA);
t("kasir SPL kedua tidak bisa membuka shift SPL yang sudah buka", shiftDi(st(), "spl", jam(12, 4))?.employeeName, "Rian");

console.log("\n-- 2 · Kasir hanya melayani meja venuenya --");
push(jam(13), { t: "walkin", tableId: "T05", guest: "Tamu SPL" }, RIAN);
push(jam(13, 1), { t: "walkin", tableId: "S106", guest: "Salah venue" }, RIAN);
push(jam(13, 2), { t: "walkin", tableId: "S106", guest: "Tamu SMH" }, DEWI);
push(jam(13, 3), { t: "walkin", tableId: "T06", guest: "Salah venue" }, DEWI);
t("Rian membuka meja SPL", sesi("T05")?.guest, "Tamu SPL");
t("Rian TIDAK bisa membuka meja Smokehouse", sesi("S106")?.guest, "Tamu SMH");
t("Dewi TIDAK bisa membuka meja SPL", !!sesi("T06"), false);

const it = itemOf(st(), NASGOR)!;
const pesan = (meja: string, key: string, by: string, at: number) => push(at, {
  t: "addFnb", sessionId: sesi(meja)!.id, name: it.name, station: it.station, line: { key, itemId: NASGOR, qty: 2 },
}, by);
pesan("T05", "a", RIAN, jam(13, 10));
pesan("S106", "b", DEWI, jam(13, 11));
const idT05 = sesi("T05")!.id, idS106 = sesi("S106")!.id;
push(jam(14), { t: "settle", id: idT05, channel: "cash" }, DEWI);
t("Dewi TIDAK bisa menagih meja SPL", sesi("T05")?.id, idT05);

console.log("\n-- 3 · Tunai masuk laci venue yang benar --");
push(jam(14, 1), { t: "settle", id: idT05, channel: "cash" }, RIAN);
push(jam(14, 2), { t: "settle", id: idS106, channel: "cash" }, DEWI);
const tagih = (id: string) => st().sessions.find((x) => x.id === id)!;
t("kedua meja lunas", [tagih(idT05).status, tagih(idS106).status], ["done", "done"]);
const shSpl = shiftDi(st(), "spl", jam(14, 3))!, shSmh = shiftDi(st(), "smh", jam(14, 3))!;
const kasSpl = shiftCashExpected(st(), shSpl), kasSmh = shiftCashExpected(st(), shSmh);
t("laci SPL berisi tagihan T05 saja", kasSpl > 0 && kasSpl !== kasSmh, true);
t("laci Smokehouse berisi tagihan S106 saja", kasSmh > 0, true);
t("pembayaran tercatat di shift venuenya",
  [tagih(idT05).settledShiftId, tagih(idS106).settledShiftId], [shSpl.id, shSmh.id]);

console.log("\n-- 4 · Tutup shift SPL tidak menyentuh Smokehouse --");
// Rian menekan tutup dari layar Smokehouse: DITOLAK (tidak menutup shift siapa pun
// dengan hitungan laci yang salah). Dari layar SPL: shift SPL-nya tertutup.
push(jam(15, 59), { t: "closeShift", countedCash: 0, venue: "smh" }, RIAN);
t("tutup dari layar venue lain ditolak, kedua shift tetap buka",
  [shiftDi(st(), "spl", jam(16))?.employeeName, shiftDi(st(), "smh", jam(16))?.employeeName], ["Rian", "Dewi"]);
push(jam(16), { t: "closeShift", countedCash: kasSpl, venue: "spl" }, RIAN);
t("shift SPL tertutup", shiftDi(st(), "spl", jam(16, 1)), null);
t("shift Smokehouse tetap buka", shiftDi(st(), "smh", jam(16, 1))?.employeeName, "Dewi");
const hSpl = st().shiftHistory[0];
t("riwayat: venue SPL, Rian, selisih 0", [hSpl.venue, hSpl.employeeName, hSpl.variance], ["spl", "Rian", 0]);
push(jam(16, 5), { t: "walkin", tableId: "T07", guest: "Tanpa shift" }, YOGA);
t("SPL tanpa shift: meja tidak bisa dibuka", !!sesi("T07"), false);
push(jam(16, 6), { t: "walkin", tableId: "S107", guest: "Tetap jalan" }, DEWI);
t("Smokehouse tetap melayani", sesi("S107")?.guest, "Tetap jalan");

console.log("\n-- 5 · Serah terima di SPL, Smokehouse tidak terganggu --");
push(jam(16, 10), { t: "openShift", openingCash: 0, venue: "smh" }, YOGA);
t("Yoga membuka shift SPL (bukan Smokehouse walau layarnya Smokehouse)", shiftDi(st(), "spl", jam(16, 11))?.employeeName, "Yoga");
t("shift Smokehouse masih milik Dewi", shiftDi(st(), "smh", jam(16, 11))?.employeeName, "Dewi");
const shYoga = shiftDi(st(), "spl", jam(16, 11))!;
t("laci shift Yoga mulai dari 0 (tunai Rian tidak terbawa)", shiftCashExpected(st(), shYoga), 0);
push(jam(17), { t: "closeShift", countedCash: kasSmh - 5000, venue: "smh" }, DEWI);
const hSmh = st().shiftHistory[0];
t("Dewi menutup shift Smokehouse-nya sendiri", [hSmh.venue, hSmh.employeeName, hSmh.variance], ["smh", "Dewi", -5000]);
t("shift SPL Yoga tidak ikut tertutup", shiftDi(st(), "spl", jam(17, 1))?.employeeName, "Yoga");

console.log("\n-- 6 · Waiter & akun kasir --");
const KEMARIN = KASIR_WAJIB_VENUE - 60_000, SESUDAH = KASIR_WAJIB_VENUE + 60_000;
push(KEMARIN, { t: "saveEmployee", emp: { id: "", name: "Kasir Lama Bebas", pin: "", role: "kru_kasir", active: true } }, SINTA);
t("akun kasir tanpa venue sebelum aturan tetap terputar ulang", st().employees.some((e) => e.name === "Kasir Lama Bebas"), true);
const nama = (x: string) => st().employees.some((e) => e.name === x);
const sesudah = (n: string, role: "kru_kasir" | "waiter" | "manager", venue?: "spl" | "smh") =>
  push(SESUDAH, { t: "saveEmployee", emp: { id: "", name: n, pin: "", role, active: true, ...(venue ? { venue } : {}) } }, SINTA);
sesudah("Kasir Baru Bebas", "kru_kasir");
sesudah("Waiter Bebas", "waiter");
sesudah("Kasir Baru SMH", "kru_kasir", "smh");
sesudah("Manager Grup", "manager");
t("kasir baru tanpa venue DITOLAK", nama("Kasir Baru Bebas"), false);
t("waiter tanpa venue DITOLAK", nama("Waiter Bebas"), false);
t("kasir baru dengan venue diterima", nama("Kasir Baru SMH"), true);
t("manager boleh mengurus kedua venue", nama("Manager Grup"), true);

push(jam(17, 30), { t: "saveEmployee", emp: { id: "", name: "Wawan", pin: "", role: "waiter", active: true, venue: "spl" } }, SINTA);
const wawan = st().employees.find((e) => e.name === "Wawan")!.id;
push(jam(17, 31), { t: "closeShift", countedCash: 0, venue: "spl" }, YOGA);
push(jam(17, 32), { t: "openShift", openingCash: 0, venue: "spl" }, wawan);
t("waiter tidak bisa membuka shift", shiftDi(st(), "spl", jam(17, 33)), null);

console.log(`\n${total - bad}/${total} lulus`);
if (bad) process.exit(1);
