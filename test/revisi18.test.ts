/* ═══════════════════════════════════════════════════════════════════
   PDF "REVISI UPDATE SPL" (pemilik 18 Nov 2026)

   Yang dibuktikan di mesin:
     1. Rekap — sewa meja di struk TIDAK lagi ikut menghitung barang counter,
        dan dipecah PAGI / SORE.
     3. Tombol BUKA / TUTUP — TUTUP ditolak selama meja jalan atau shift buka;
        saat TUTUP shift tidak bisa dibuka.
     4. Shift PAGI / SORE — pilihan kasir tersimpan dan dipakai rekap.
     6. Paket per jam — dihitung seperti open bill: siang sampai 18.00, malam
        sesudahnya, per menit; tetap dibayar penuh.
     7. Akun — kasir hanya mengatur stok gudangnya; Captain tidak bisa
        membuat akun puncak; Owner tidak membuka shift.
     8. Lembar cetak gudang.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, runningOn, itemOf, rekapSaring, sewaMejaSaring, omzetPerShift, settlementOf, kelasShift, shiftMilik, shiftBukaDi,
  operasionalBuka, alasanBelumTutup, hargaJamPaket, PAKET_JAM_PER_MENIT, bolehGudang,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { billOpenSession } from "../src/lib/billing";
import { businessDateOf, dariWib } from "../src/lib/occupancy";
import { htmlRekapPenjualan, sewaPagiSore } from "../src/lib/strukRekap";
import { htmlCetakGudang } from "../src/lib/strukGudang";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

// Hari uji selalu sesudah semua aturan baru berlaku.
const hari = businessDateOf(Math.max(Date.now(), PAKET_JAM_PER_MENIT + 86_400_000));
const [Y, M, D] = hari.split("-").map(Number);
const jam = (h: number, m = 0) => dariWib(Y, M, D, h, m);
const PEMILIK = "u-owner", RIAN = "u-rian", YOGA = "u-yoga", DEWI = "u-dewi";
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

console.log("\n-- 4 · Shift PAGI / SORE --");
push(jam(11), { t: "openShift", openingCash: 0, venue: "spl", kelas: "pagi" }, RIAN);
t("shift Rian tercatat PAGI", kelasShift(shiftMilik(st(), "spl", RIAN)!), "pagi");

// Pagi: sewa meja + barang counter.
push(jam(12), { t: "walkin", tableId: "T01", guest: "Pagi" }, RIAN);
pesan("T01", COUNTER, 2, RIAN, jam(12, 5));
pesan("T01", RESTO, 1, RIAN, jam(12, 6));
push(jam(13), { t: "settle", id: runningOn(st(), "T01")!.id, channel: "cash" }, RIAN);

// Ganti shift: Yoga mulai SORE walau jam 17.50 (pilihan kasir menang atas jam).
push(jam(17, 50), { t: "openShift", openingCash: 0, venue: "spl", kelas: "sore" }, YOGA);
t("shift Yoga tercatat SORE", kelasShift(shiftMilik(st(), "spl", YOGA)!), "sore");
push(jam(18), { t: "closeShift", countedCash: 0, venue: "spl" }, RIAN);

console.log("\n-- 6 · Paket per jam: siang/malam per menit, bayar penuh --");
// 2 jam mulai 17.30 = 30 menit tarif siang + 90 menit tarif malam.
push(jam(17, 30), { t: "walkin", tableId: "T02", guest: "Paket", hours: 2 }, YOGA);
const s2 = runningOn(st(), "T02")!;
const harapan = billOpenSession("regular", jam(17, 30), jam(19, 30), st().rates).amount;
t("harga paket = hitungan open bill 17.30–19.30", s2.tableAmount, harapan);
t("…sama dengan hargaJamPaket di layar", hargaJamPaket(st().rates, "regular", jam(17, 30), 2), harapan);
const siang = st().rates.regularDay, malam = st().rates.regularNight;
t("…= ½ jam siang + 1½ jam malam", s2.tableAmount, Math.ceil((siang * 0.5 + malam * 1.5) / 1000) * 1000);
t("jejak lama (sebelum aturan) tetap per jam utuh",
  hargaJamPaket(st().rates, "regular", PAKET_JAM_PER_MENIT - 3_600_000 * 24, 1) > 0, true);
// Berhenti lebih cepat (jam 18.30): tetap bayar penuh.
const due = settlementOf(runningOn(st(), "T02")!, st(), jam(18, 30)).due;
t("berhenti 1 jam lebih cepat tetap bayar paket penuh", due >= s2.tableAmount, true);

// Sore: tutup T02 dengan sewa + barang counter.
pesan("T02", COUNTER, 1, YOGA, jam(18, 40));
push(jam(19, 35), { t: "settle", id: s2.id, channel: "cash" }, YOGA);

console.log("\n-- 1 · Rekap: sewa meja tanpa barang counter, dipisah pagi/sore --");
const s = st();
const os = omzetPerShift(s, hari, "spl");
const sewaAsli = os.semua.sewaMeja;
const w = sewaMejaSaring(s, { dari: hari, sampai: hari, unit: "spl" });
t("sewa meja struk = sewa meja asli (barang counter tidak ikut)", w.total, sewaAsli);
const lini = rekapSaring(s, { dari: hari, sampai: hari, unit: "spl" }).perLini.biliar;
t("…dulu angka lini biliar (sewa + counter) yang tercetak", lini > sewaAsli, true);
const sewaPagi = os.shift.filter((b) => b.id === shiftMilik(replay(genesis, entries.slice(0, 2)), "spl", RIAN)?.id)
  .reduce((x, b) => x + b.sewaMeja, 0);
t("sewa PAGI = sewa di shift Rian", w.pagi, sewaPagi);
t("sewa PAGI + SORE = total", w.pagi + w.sore, w.total);
t("pecahan pagi/sore bisa dipercaya", w.terpecah, true);
const html = htmlRekapPenjualan({ venue: "spl", bizDate: hari, seksi: [], sewaMeja: sewaPagiSore(w.pagi, w.sore) });
t("struk mencetak SEWA MEJA PAGI", html.includes("SEWA MEJA PAGI"), true);
t("struk mencetak SEWA MEJA SORE", html.includes("SEWA MEJA SORE"), true);
const pagiSaja = sewaMejaSaring(s, { dari: hari, sampai: hari, unit: "spl", shift: "pagi" });
t("saringan Shift Pagi: hanya sewa pagi", [pagiSaja.pagi, pagiSaja.sore], [w.pagi, 0]);

console.log("\n-- 3 · BUKA / TUTUP operasional --");
t("belum pernah diatur = BUKA", operasionalBuka(st(), "spl"), true);
push(jam(20), { t: "walkin", tableId: "T03", guest: "Masih main" }, YOGA);
push(jam(20, 1), { t: "setOperasional", venue: "spl", buka: false }, YOGA);
t("TUTUP ditolak: meja masih jalan", operasionalBuka(st(), "spl"), true);
t("…alasannya menyebut meja", /meja jalan/.test(alasanBelumTutup(st(), "spl") ?? ""), true);
push(jam(20, 10), { t: "settle", id: runningOn(st(), "T03")!.id, channel: "cash" }, YOGA);
push(jam(20, 11), { t: "setOperasional", venue: "spl", buka: false }, YOGA);
t("TUTUP ditolak: shift Yoga belum ditutup", operasionalBuka(st(), "spl"), true);
push(jam(23), { t: "closeShift", countedCash: 0, venue: "spl" }, YOGA);
push(jam(23, 1), { t: "setOperasional", venue: "spl", buka: false }, YOGA);
t("meja & shift beres → TUTUP", operasionalBuka(st(), "spl"), false);
t("…Smokehouse tidak ikut tutup", operasionalBuka(st(), "smh"), true);
push(jam(23, 2), { t: "openShift", openingCash: 0, venue: "spl", kelas: "sore" }, RIAN);
t("saat TUTUP shift tidak bisa dibuka", shiftBukaDi(st(), "spl").length, 0);
push(jam(23, 3), { t: "setOperasional", venue: "smh", buka: false }, RIAN);
t("kasir SPL tidak bisa menutup Smokehouse", operasionalBuka(st(), "smh"), true);
push(jam(23, 5), { t: "setOperasional", venue: "spl", buka: true }, RIAN);
push(jam(23, 6), { t: "openShift", openingCash: 0, venue: "spl", kelas: "sore" }, RIAN);
t("BUKA lagi → shift bisa dibuka", shiftBukaDi(st(), "spl").length, 1);

console.log("\n-- 7 · Akun: stok kasir, Captain, Owner --");
push(jam(23, 10), { t: "setStock", itemId: COUNTER, qty: 10 }, RIAN);
push(jam(23, 11), { t: "setStock", itemId: BAR, qty: 10 }, RIAN);
push(jam(23, 12), { t: "setStock", itemId: RESTO, qty: 77 }, RIAN);
const stok = (id: string) => st().stock.find((r) => r.itemId === id)?.qty;
t("kasir Billiard mengatur Gudang Billiard", stok(COUNTER), 10);
t("kasir Billiard mengatur Gudang Bar", stok(BAR), 10);
t("kasir Billiard TIDAK bisa mengatur Gudang Resto", stok(RESTO) === 77, false);
push(jam(23, 13), { t: "setStock", itemId: RESTO, qty: 55 }, DEWI);
push(jam(23, 14), { t: "setStock", itemId: COUNTER, qty: 99 }, DEWI);
t("kasir Smokehouse mengatur Gudang Resto", stok(RESTO), 55);
t("kasir Smokehouse TIDAK bisa mengatur Gudang Billiard", stok(COUNTER), 10);
push(jam(23, 15), { t: "addStock", itemId: COUNTER, delta: 5, gudang: "central" } as Action, RIAN);
t("kasir tidak menyentuh Gudang Central", (st().gudangCentral ?? []).some((r) => r.itemId === COUNTER && (r.qty ?? 0) > 0), false);
t("bolehGudang: Rian → billiard & bar saja",
  (["central", "billiard", "resto", "bar"] as const).filter((g) => bolehGudang({ ...st(), me: st().employees.find((e) => e.id === RIAN)! }, g)),
  ["billiard", "bar"]);

push(jam(23, 20), { t: "saveEmployee", emp: { id: "u-cap", name: "Kapten", pin: "4321", role: "captain", active: true, venue: "spl" } }, PEMILIK);
push(jam(23, 21), { t: "saveEmployee", emp: { id: "u-own", name: "Owner", pin: "5432", role: "owner", active: true } }, PEMILIK);
t("akun Captain & Owner tersimpan", ["u-cap", "u-own"].map((id) => st().employees.find((e) => e.id === id)?.role), ["captain", "owner"]);
push(jam(23, 22), { t: "saveEmployee", emp: { id: "u-x1", name: "Bos Baru", pin: "6543", role: "superadmin", active: true } }, "u-cap");
t("Captain TIDAK bisa membuat superadmin", st().employees.some((e) => e.id === "u-x1"), false);
push(jam(23, 23), { t: "saveEmployee", emp: { id: "u-own", name: "Owner", pin: "5432", role: "kru_kasir", active: true, venue: "spl" } }, "u-cap");
t("Captain TIDAK bisa mengubah akun Owner", st().employees.find((e) => e.id === "u-own")?.role, "owner");
push(jam(23, 24), { t: "saveEmployee", emp: { id: "u-x2", name: "Kasir Baru", pin: "7654", role: "kru_kasir", active: true, venue: "spl" } }, "u-cap");
t("Captain bisa membuat akun kasir", st().employees.find((e) => e.id === "u-x2")?.role, "kru_kasir");
push(jam(23, 25), { t: "openShift", openingCash: 0, venue: "smh", kelas: "sore" }, "u-own");
t("Owner tidak membuka shift", shiftBukaDi(st(), "smh").length, 0);

console.log("\n-- 8 · Lembar cetak gudang --");
const lembar = htmlCetakGudang({ jenis: "Gudang Billiard", pencetak: "Rian", posisi: "Kru Kasir", at: jam(16, 35),
  baris: [{ nama: "Marlboro <12>", sisa: 4 }, { nama: "Kopi", sisa: null }] });
t("judul GUDANG", lembar.includes("<h1>GUDANG</h1>"), true);
t("kolom PRODUK · SISA · AKTUAL", ["PRODUK", "SISA", "AKTUAL"].every((x) => lembar.includes(`<th>${x}</th>`)), true);
t("jenis gudang, pencetak, posisi", ["GUDANG BILLIARD", "Rian", "Kru Kasir"].every((x) => lembar.includes(x)), true);
t("jam cetak WIB", lembar.includes("<b>16:35</b>"), true);
t("nama barang aman (tidak jadi tag)", lembar.includes("Marlboro &lt;12&gt;"), true);

console.log(`\n${total - bad}/${total} lulus`);
if (bad) process.exit(1);
