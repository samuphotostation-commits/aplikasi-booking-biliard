/* ═══════════════════════════════════════════════════════════════════
   REKAP PER VENUE, FORMAT KAS KASIR, DAN BIAYA

   Temuan 7 Nov 2026: dua hari sesudah transaksi, angka SPL dan Smokehouse
   berubah jadi angka gabungan, rincian barang hilang, dan rekap bulanan per
   venue ikut salah. Karena itu tiap angka di sini diperiksa DUA KALI: saat
   harinya masih hidup, dan sesudah tutup buku. Keduanya harus sama persis.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, recap, recapRange, rekapTigaJenis, rekapJenisRentang, itemOf, shiftCashExpected, shiftDi, trenBisnis,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { dariWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const NASGOR = "fr-01", TEH = "cd-01", AQUA = "bl-03";
const HARI = "2026-12-01";
const jam = (d: number, h: number, m = 0) => dariWib(2026, 12, d, h, m);

function dunia() {
  const genesis: Genesis = { at: jam(1, 5), seed: false };
  const entries: Entry[] = [];
  let n = 0;
  const push = (at: number, act: Action, by = "u-manager") =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
  const st = () => replay(genesis, entries);
  const buka = (d: number, h: number, tableId: string) => {
    push(jam(d, h), { t: "walkin", tableId, guest: `Tamu ${tableId}` });
    return `w-${tableId}-${entries[entries.length - 1].id}-1`;
  };
  const pesan = (d: number, h: number, sessionId: string, itemId: string, qty: number, key: string) => {
    const it = itemOf(st(), itemId)!;
    push(jam(d, h), { t: "addFnb", sessionId, name: it.name, station: it.station, line: { key, itemId, qty, unitPrice: it.price, name: it.name, station: it.station } });
  };
  return { push, st, buka, pesan };
}

/** Sehari penuh: meja biliar memesan makanan, meja resto memesan makanan, ada diskon dan biaya. */
function hariPenuh() {
  const d = dunia();
  d.push(jam(1, 11), { t: "openShift", openingCash: 0, venue: "spl" });
  d.push(jam(1, 11, 1), { t: "openShift", openingCash: 0, venue: "smh" });
  const a = d.buka(1, 12, "T01");
  d.pesan(1, 12, a, NASGOR, 2, "a1");
  d.pesan(1, 12, a, TEH, 2, "a2");
  d.pesan(1, 12, a, AQUA, 3, "a3");
  d.push(jam(1, 14), { t: "settle", id: a, channel: "cash", diskonPersen: 10 });
  const b = d.buka(1, 15, "T02");
  d.pesan(1, 15, b, NASGOR, 1, "b1");
  d.push(jam(1, 17), { t: "settle", id: b, channel: "qris_online" });
  const c = d.buka(1, 18, "S103");
  d.pesan(1, 18, c, NASGOR, 4, "c1");
  d.pesan(1, 18, c, TEH, 4, "c2");
  d.push(jam(1, 19), { t: "settle", id: c, channel: "cash" });
  d.push(jam(1, 20), { t: "catatBiaya", venue: "spl", keterangan: "Beli es batu", nilai: 25_000, sumber: "laci" });
  d.push(jam(1, 20, 5), { t: "catatBiaya", venue: "smh", keterangan: "Gas dapur", nilai: 90_000, sumber: "rekening" });
  return d;
}

const tutupBuku = (d: ReturnType<typeof dunia>) => {
  d.push(jam(1, 22), { t: "closeShift", countedCash: 0, venue: "spl" });
  d.push(jam(1, 22, 1), { t: "closeShift", countedCash: 0, venue: "smh" });
  d.push(jam(2, 12), { t: "openShift", openingCash: 0, venue: "spl" });
  d.push(jam(2, 22), { t: "closeShift", countedCash: 0, venue: "spl" });
  d.push(jam(4, 12), { t: "openShift", openingCash: 0, venue: "spl" });
};

const potret = (s: ReturnType<ReturnType<typeof dunia>["st"]>, v?: "spl" | "smh") => {
  const r = recap(s, HARI, v);
  const k = rekapTigaJenis(s, HARI, v);
  return {
    sewa: r.billiard, fnb: r.fnb, diskon: r.discount, jual: r.gross, tab: r.counts.done,
    billiard: k.billiard, resto: k.resto, bar: k.bar, total: k.totalSemua, pendapatan: k.pendapatan,
    biaya: k.totalBiaya, bersih: k.bersih, uang: k.uang.total,
  };
};

console.log("-- Angka hidup per venue --");
{
  const s = hariPenuh().st();
  const spl = rekapTigaJenis(s, HARI, "spl");
  const smh = rekapTigaJenis(s, HARI, "smh");
  t("makanan meja biliar masuk rekap SPL", spl.resto.map((x) => [x.itemId, x.qty]), [[NASGOR, 3]]);
  t("Smokehouse tidak memuat makanan meja biliar", smh.resto.map((x) => [x.itemId, x.qty]), [[NASGOR, 4]]);
  t("Smokehouse tidak punya sewa meja", smh.sewaMeja, 0);
  t("Smokehouse melihat nilai dapur untuk meja biliar", smh.dapurMejaBiliar, spl.totalResto + spl.totalBar);
  t("SPL tidak punya baris itu", spl.dapurMejaBiliar, 0);
  t("pendapatan = total − diskon", spl.pendapatan, spl.totalSemua - spl.diskon);
  t("pendapatan SPL sama dengan rekap uang", spl.pendapatan, recap(s, HARI, "spl").gross);
  t("pendapatan Smokehouse sama dengan rekap uang", smh.pendapatan, recap(s, HARI, "smh").gross);
  t("uang masuk SPL cocok dengan pendapatan", spl.uang.total, spl.pendapatan);
  t("uang masuk Smokehouse cocok dengan pendapatan", smh.uang.total, smh.pendapatan);
  t("biaya hanya milik venuenya", [spl.totalBiaya, smh.totalBiaya], [25_000, 90_000]);
  t("pendapatan − biaya", spl.bersih, spl.pendapatan - 25_000);
}

console.log("-- Sesudah tutup buku, angkanya tidak boleh berubah --");
{
  const d = hariPenuh();
  const hidup = { spl: potret(d.st(), "spl"), smh: potret(d.st(), "smh"), semua: potret(d.st()) };
  tutupBuku(d);
  const s = d.st();
  t("harinya memang sudah diarsipkan", s.history.some((h) => h.bizDate === HARI), true);
  t("SPL sama persis", potret(s, "spl"), hidup.spl);
  t("Smokehouse sama persis", potret(s, "smh"), hidup.smh);
  t("gabungan sama persis", potret(s), hidup.semua);
  t("tidak lagi ditandai tercampur", recap(s, HARI, "smh").venueTercampur, false);
  t("rincian barang tetap ada", rekapTigaJenis(s, HARI, "spl").rincianTersedia, true);
  t("nama barang tetap ada", rekapTigaJenis(s, HARI, "spl").billiard[0]?.itemId, AQUA);

  const spl = recapRange(s, "2026-12-01", "2026-12-04", "spl");
  const smh = recapRange(s, "2026-12-01", "2026-12-04", "smh");
  const semua = recapRange(s, "2026-12-01", "2026-12-04");
  t("rekap rentang per venue terpisah", [spl.money.billiard, smh.money.billiard], [hidup.spl.sewa, 0]);
  t("SPL + Smokehouse = gabungan", spl.money.gross + smh.money.gross, semua.money.gross);
}

console.log("-- Arsip lama tanpa pecahan venue --");
{
  const d = hariPenuh();
  const hidup = potret(d.st(), "smh");
  tutupBuku(d);
  const s = d.st();
  const arch = s.history.find((h) => h.bizDate === HARI)!;
  const { perVenue: _p, ...tanpa } = arch;
  const lama = { ...s, history: s.history.map((h) => (h.bizDate === HARI ? tanpa : h)) };
  t("masih bisa dipisah dari baris arsip", recap(lama, HARI, "smh").gross, hidup.jual);
  t("tidak ditandai tercampur", recap(lama, HARI, "smh").venueTercampur, false);
  const hilang = { ...lama, history: lama.history.map((h) => (h.bizDate === HARI ? { ...h, rowsDropped: true, sessions: [], orders: [] } : h)) };
  t("kalau barisnya juga hilang, jujur ditandai tercampur", recap(hilang, HARI, "smh").venueTercampur, true);
  t("angka gabungan tidak dipakai diam-diam", rekapTigaJenis(hilang, HARI, "smh").tercampur, true);
}

console.log("-- Format per periode --");
{
  const d = hariPenuh();
  tutupBuku(d);
  const h1 = d.buka(4, 13, "T03");
  d.pesan(4, 13, h1, AQUA, 2, "d1");
  d.push(jam(4, 15), { t: "settle", id: h1, channel: "cash" });
  const s = d.st();
  const r = rekapJenisRentang(s, "2026-12-01", "2026-12-04", "spl");
  const satu = rekapTigaJenis(s, HARI, "spl");
  const dua = rekapTigaJenis(s, "2026-12-04", "spl");
  t("baris hari hanya untuk hari yang ada penjualan", r.harian?.map((h) => h.bizDate), [HARI, "2026-12-04"]);
  t("sewa meja dijumlah", r.sewaMeja, satu.sewaMeja + dua.sewaMeja);
  t("barang yang sama digabung", r.billiard.find((x) => x.itemId === AQUA)?.qty, 5);
  t("pendapatan dijumlah", r.pendapatan, satu.pendapatan + dua.pendapatan);
  t("biaya ikut terbawa", r.totalBiaya, 25_000);
  t("uang masuk tetap cocok", r.uang.total, r.pendapatan);
}

console.log("-- Biaya dan laci --");
{
  const d = dunia();
  d.push(jam(1, 11), { t: "openShift", openingCash: 0, venue: "spl" });
  const a = d.buka(1, 12, "T01");
  d.pesan(1, 12, a, AQUA, 3, "a1");
  d.push(jam(1, 13), { t: "settle", id: a, channel: "cash" });
  const kas = shiftCashExpected(d.st());
  d.push(jam(1, 14), { t: "catatBiaya", venue: "spl", keterangan: "Beli es", nilai: 10_000, sumber: "laci" }, "u-rian");
  t("biaya laci mengurangi kas seharusnya", shiftCashExpected(d.st()), kas - 10_000);
  d.push(jam(1, 15), { t: "catatBiaya", venue: "spl", keterangan: "Listrik", nilai: 50_000, sumber: "rekening" });
  t("biaya rekening tidak menyentuh laci", shiftCashExpected(d.st()), kas - 10_000);
  d.push(jam(1, 16), { t: "catatBiaya", venue: "spl", keterangan: "  ", nilai: 5_000, sumber: "laci" });
  d.push(jam(1, 16, 1), { t: "catatBiaya", venue: "spl", keterangan: "Nol", nilai: 0, sumber: "laci" });
  t("biaya tanpa keterangan atau nilai ditolak", d.st().biaya?.length, 2);
  const id = d.st().biaya![0].id;
  d.push(jam(1, 17), { t: "hapusBiaya", id }, "u-rian");
  t("kasir tidak bisa menghapus", d.st().biaya![0].dihapusOleh, undefined);
  d.push(jam(1, 17, 1), { t: "hapusBiaya", id });
  t("manager bisa menghapus, kas kembali", shiftCashExpected(d.st()), kas);
  t("yang dihapus tetap tersimpan", d.st().biaya?.length, 2);
  t("yang dihapus tidak ikut rekap", rekapTigaJenis(d.st(), HARI, "spl").totalBiaya, 50_000);
  d.push(jam(1, 18), { t: "closeShift", countedCash: 0 });
  d.push(jam(1, 19), { t: "catatBiaya", venue: "spl", keterangan: "Tanpa shift", nilai: 1_000, sumber: "laci" });
  t("biaya laci ditolak kalau shift tutup", d.st().biaya?.length, 2);
}

console.log("-- Shift dan laci per tempat --");
{
  const d = dunia();
  // Rian kasir SPL, Dewi kasir Smokehouse: akunnya terikat tempat masing-masing.
  d.push(jam(1, 11), { t: "openShift", openingCash: 0 }, "u-rian");
  d.push(jam(1, 11, 5), { t: "openShift", openingCash: 0 }, "u-dewi");
  let s = d.st();
  t("dua shift buka bersamaan", [shiftDi(s, "spl", jam(1, 12))?.employeeName, shiftDi(s, "smh", jam(1, 12))?.employeeName], ["Rian", "Dewi"]);

  d.push(jam(1, 12), { t: "walkin", tableId: "T01", guest: "A" }, "u-rian");
  const a = "w-T01-e0003-1";
  d.push(jam(1, 12, 1), { t: "walkin", tableId: "S103", guest: "B" }, "u-dewi");
  const b = "w-S103-e0004-1";
  const nasi = itemOf(d.st(), NASGOR)!;
  d.push(jam(1, 12, 2), { t: "addFnb", sessionId: b, name: nasi.name, station: nasi.station, line: { key: "b1", itemId: NASGOR, qty: 2, unitPrice: nasi.price, name: nasi.name, station: nasi.station } }, "u-dewi");
  d.push(jam(1, 13), { t: "settle", id: b, channel: "cash" }, "u-dewi");
  d.push(jam(1, 13, 5), { t: "settle", id: a, channel: "cash" }, "u-rian");
  s = d.st();
  const shSpl = shiftDi(s, "spl", jam(1, 14))!, shSmh = shiftDi(s, "smh", jam(1, 14))!;
  t("tunai Smokehouse masuk laci Smokehouse", shiftCashExpected(s, shSmh), nasi.price * 2);
  t("laci SPL hanya berisi uang SPL", shiftCashExpected(s, shSpl), s.sessions.find((x) => x.id === a)!.settledAmount);
  t("tab tercatat di shift tempatnya", s.sessions.find((x) => x.id === b)!.settledShiftId, shSmh.id);

  d.push(jam(1, 15), { t: "catatBiaya", venue: "smh", keterangan: "Gas", nilai: 10_000, sumber: "laci" }, "u-dewi");
  t("biaya laci mengurangi laci tempat itu saja", shiftCashExpected(d.st(), shSmh), nasi.price * 2 - 10_000);
  d.push(jam(1, 15, 1), { t: "catatBiaya", venue: "spl", keterangan: "Lintas", nilai: 10_000, sumber: "laci" }, "u-dewi");
  t("kasir tidak bisa memakai laci tempat lain", d.st().biaya?.length, 1);

  d.push(jam(1, 16), { t: "closeShift", countedCash: 0, venue: "spl" }, "u-dewi");
  t("kasir tidak bisa menutup shift tempat lain", !!shiftDi(d.st(), "spl", jam(1, 17)), true);
  d.push(jam(1, 16, 1), { t: "closeShift", countedCash: nasi.price * 2 - 10_000 }, "u-dewi");
  s = d.st();
  t("Smokehouse tutup, SPL tetap jalan", [!!shiftDi(s, "smh", jam(1, 17)), !!shiftDi(s, "spl", jam(1, 17))], [false, true]);
  t("selisih Smokehouse nol", s.shiftHistory[0].variance, 0);
  d.push(jam(1, 17), { t: "walkin", tableId: "S104", guest: "C" }, "u-dewi");
  t("meja Smokehouse tidak bisa dibuka tanpa shift Smokehouse", d.st().sessions.some((x) => x.tableId === "S104"), false);
  d.push(jam(1, 17, 1), { t: "walkin", tableId: "T02", guest: "D" }, "u-rian");
  t("meja SPL tetap bisa dibuka", d.st().sessions.some((x) => x.tableId === "T02"), true);
}

console.log("-- Tren per bisnis --");
{
  const d = hariPenuh();
  tutupBuku(d);
  const b2 = d.buka(4, 13, "T03");
  d.pesan(4, 13, b2, AQUA, 2, "d1");
  d.push(jam(4, 15), { t: "settle", id: b2, channel: "cash" });
  const s = d.st();
  const spl = trenBisnis(s, "2026-12-04", "spl");
  const smh = trenBisnis(s, "2026-12-04", "smh");
  const senin = rekapTigaJenis(s, "2026-11-30", "spl").pendapatan;
  const selasa = rekapTigaJenis(s, HARI, "spl").pendapatan;
  const jumat = rekapTigaJenis(s, "2026-12-04", "spl").pendapatan;
  t("grafik harian 14 batang, mingguan dan bulanan 12", [spl.harian.length, spl.mingguan.length, spl.bulanan.length], [14, 12, 12]);
  t("batang harian sama dengan rekap", spl.harian.find((x) => x.kunci === HARI)?.nilai, selasa);
  t("batang minggu berjalan = jumlah harinya", spl.mingguan[11].nilai, senin + selasa + jumat);
  t("batang bulan berjalan memuat Desember saja", spl.bulanan[11].nilai, selasa + jumat);
  t("batang terakhir ditandai berjalan", [spl.mingguan[11].berjalan, spl.bulanan[10].berjalan], [true, false]);
  t("Smokehouse hanya berisi miliknya", smh.harian.find((x) => x.kunci === HARI)?.nilai, rekapTigaJenis(s, HARI, "smh").pendapatan);
  t("hari ramai SPL adalah Selasa", spl.hariRamai?.nama, "Selasa");
  t("hari penjualan tertinggi", spl.hariTerbaik?.bizDate, HARI);
  t("jam ramai Smokehouse", smh.jamRamai?.label, "18.00–19.00");
  t("pembanding minggu lalu kosong", spl.mingguIni.lalu, 0);
  t("rata-rata per transaksi", spl.rataTransaksi, Math.round((selasa + jumat) / 3));
  t("bisnis tanpa penjualan ditandai kosong", trenBisnis(dunia().st(), "2026-12-04", "smh").kosong, true);
}

console.log("-- NIP akun staf --");
{
  const d = dunia();
  const akun = (id: string, name: string, nip: string, pin = "") => ({ id, name, pin, nip, role: "kru_kasir" as const, active: true, venue: "spl" as const });
  d.push(jam(1, 11), { t: "saveEmployee", emp: akun("", "Baru", "spl010") });
  let baru = d.st().employees.find((e) => e.name === "Baru");
  t("akun bisa dibuat tanpa PIN di jejak", baru?.pin, "");
  t("NIP disimpan huruf besar", baru?.nip, "SPL010");
  d.push(jam(1, 11, 1), { t: "saveEmployee", emp: akun("", "Kembar", "SPL010") });
  t("NIP kembar ditolak", d.st().employees.some((e) => e.name === "Kembar"), false);
  d.push(jam(1, 11, 2), { t: "saveEmployee", emp: akun("", "Aneh", "a b") });
  t("NIP tidak sah ditolak", d.st().employees.some((e) => e.name === "Aneh"), false);
  d.push(jam(1, 11, 3), { t: "saveEmployee", emp: akun("", "Dua", "SPL011") });
  t("dua akun tanpa PIN di jejak tidak dianggap kembar", d.st().employees.some((e) => e.name === "Dua"), true);
  d.push(jam(1, 11, 4), { t: "saveEmployee", emp: { ...baru!, role: "kru_gudang" } });
  baru = d.st().employees.find((e) => e.name === "Baru");
  t("akun bisa disunting tanpa mengubah NIP", [baru?.role, baru?.nip], ["kru_gudang", "SPL010"]);
}

console.log("-- Sebelum tanggal aturan: tetap satu shift --");
{
  const nov = (h: number) => dariWib(2026, 11, 1, h);
  const g: Genesis = { at: nov(5), seed: false };
  const e: Entry[] = [
    { id: "e1", at: nov(11), by: "u-rian", act: { t: "openShift", openingCash: 0 } },
    { id: "e2", at: nov(12), by: "u-dewi", act: { t: "openShift", openingCash: 0 } },
    { id: "e3", at: nov(13), by: "u-dewi", act: { t: "walkin", tableId: "S103", guest: "A" } },
  ];
  const s = replay(g, e);
  t("shift kedua tetap ditolak", s.shiftSmh ?? null, null);
  t("meja resto tetap memakai shift yang ada", s.sessions.some((x) => x.tableId === "S103"), true);
}

console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
