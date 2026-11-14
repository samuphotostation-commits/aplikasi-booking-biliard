/* ═══════════════════════════════════════════════════════════════════
   CHECKER, CATATAN PESANAN, MEJA RESTO, STOK KRU DAPUR, REKAP PANJANG
   (permintaan staf & pemilik 14 Nov 2026)

   1. Catatan per hidangan ("tidak pedas") tersimpan di bill, ikut ke tiket,
      dan TERCETAK di kertas checker. Dirapikan di mesin, bukan di layar.
   2. Superadmin menambah, mengganti nama, dan menghapus meja resto. Nama
      kembar ditolak mesin; meja yang masih ada tamunya tidak bisa dihapus.
      Akun yang tidak dikenal daftar staf DITOLAK — itu penyebab aksi meja
      "hilang" di server.
   3. Kru Kitchen boleh mengubah stok gudang.
   4. Rekap keuangan bisa diminta lebih dari 92 hari.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, runningOn, itemOf, mejaDipakai, namaMeja, mejaDijual, clampRange, recapRange,
  rekapSaring, menuSaring, kategoriJual, susunKategori, kodeSesi, cadanganMeja, lantaiVenue, complimentMeja, kategoriMejaDari, kategoriMejaVenue, guestOrderProblem, venueTerdampakMenu, kelasShiftJam, shiftDate, menuShift, shiftHariItu, omzetPerShift, slotProblem, rateWith,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { htmlKertas, kelompokkan } from "../src/lib/cetakDapur";
import { htmlRekapPenjualan, htmlDetailTransaksi, seksiRekap, tanggalPanjang } from "../src/lib/strukRekap";
import type { ProdukHariBaris, BarisTransaksi } from "../src/lib/engine";
import { businessDateOf, dariWib } from "../src/lib/occupancy";
import { billOpenSession, businessDow } from "../src/lib/billing";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const [Y, M, D] = businessDateOf(Date.now()).split("-").map(Number);
const jam = (h: number, m = 0) => dariWib(Y, M, D, h, m);
const NASGOR = "fr-01";
const TEH = "cd-01";

function dunia() {
  const genesis: Genesis = { at: jam(5), seed: false };
  let n = 0;
  const entries: Entry[] = [];
  const push = (at: number, act: Action, by: string | null = "u-manager") =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
  push(jam(11), { t: "openShift", openingCash: 0 });
  push(jam(11, 1), { t: "openShift", openingCash: 0, venue: "smh" });
  return { genesis, entries, push, st: () => replay(genesis, entries) };
}

console.log("\n-- 1 · Catatan pesanan sampai ke kertas checker --");
{
  const d = dunia();
  d.push(jam(18), { t: "walkin", tableId: "S106", guest: "Andi" });
  const sesiId = d.st().sessions.find((x) => x.tableId === "S106")!.id;
  const it = (id: string) => itemOf(d.st(), id)!;
  d.push(jam(18, 5), {
    t: "addFnb", sessionId: sesiId, name: it(NASGOR).name, station: it(NASGOR).station,
    line: { key: "k1", itemId: NASGOR, qty: 1, note: "  Tidak   pedas  " },
  });
  d.push(jam(18, 5), {
    t: "addFnb", sessionId: sesiId, name: it(NASGOR).name, station: it(NASGOR).station,
    line: { key: "k2", itemId: NASGOR, qty: 1, note: "Pedas" },
  });
  d.push(jam(18, 5), {
    t: "addFnb", sessionId: sesiId, name: it(TEH).name, station: it(TEH).station,
    line: { key: "k3", itemId: TEH, qty: 2, note: "x".repeat(500) },
  });
  d.push(jam(18, 6), {
    t: "addFnb", sessionId: sesiId, name: it(TEH).name, station: it(TEH).station,
    line: { key: "k4", itemId: TEH, qty: 1, note: "   " },
  });
  const st = d.st();
  const fnb = runningOn(st, "S106")!.fnb;
  t("catatan dirapikan mesin di bill", fnb.find((l) => l.key === "k1")?.note, "Tidak pedas");
  t("dua porsi menu sama, catatan berbeda", fnb.filter((l) => l.itemId === NASGOR).map((l) => l.note), ["Tidak pedas", "Pedas"]);
  t("catatan dipotong 120 huruf", fnb.find((l) => l.key === "k3")?.note?.length, 120);
  t("catatan kosong tidak disimpan", "note" in (fnb.find((l) => l.key === "k4") ?? {}), false);
  const tiket = st.tickets.filter((x) => x.sessionId === sesiId);
  t("catatan ikut ke tiket", tiket.filter((x) => x.itemId === NASGOR).map((x) => x.note).sort(), ["Pedas", "Tidak pedas"]);
  const dapur = kelompokkan(tiket.filter((x) => x.station === "kitchen"));
  t("satu kertas dapur untuk satu kali pesan", dapur.length, 1);
  const html = htmlKertas(dapur[0]);
  t("catatan TERCETAK di kertas checker", html.includes("Tidak pedas") && html.includes(">Pedas<"), true);

  // Checker menutup pesanan langsung ke "diantar" (tanpa langkah dapur).
  for (const k of tiket) d.push(jam(18, 30), { t: "ticket", id: k.id, status: "served" });
  t("checker: semua tiket langsung diantar",
    d.st().tickets.filter((x) => x.sessionId === sesiId).every((x) => x.status === "served"), true);
}

console.log("\n-- 2 · Meja resto dikelola superadmin --");
{
  const d = dunia();
  t("R13 belum dijual", mejaDipakai(d.st(), "S113"), false);
  d.push(jam(12), { t: "setMejaDipakai", tableId: "S113", dipakai: true });
  t("tambah meja lantai 1 diterima", mejaDipakai(d.st(), "S113"), true);
  d.push(jam(12, 1), { t: "setMejaDipakai", tableId: "S201", dipakai: true });
  t("tambah meja lantai 2 diterima", mejaDipakai(d.st(), "S201"), true);
  t("meja baru muncul di denah", mejaDijual(d.st()).some((x) => x.id === "S201"), true);

  d.push(jam(12, 2), { t: "setTableName", tableId: "S101", name: "Teras 1" });
  t("ganti nama R01 → Teras 1", namaMeja(d.st(), "S101"), "Teras 1");
  d.push(jam(12, 3), { t: "setTableName", tableId: "S102", name: "teras 1" });
  t("nama kembar ditolak mesin", namaMeja(d.st(), "S102"), "R02");
  d.push(jam(12, 4), { t: "setTableName", tableId: "S113", name: "Pojok" });
  t("meja baru diberi nama", namaMeja(d.st(), "S113"), "Pojok");
  d.push(jam(12, 5), { t: "setTableName", tableId: "S101", name: "" });
  t("dikosongkan = kembali ke nama bawaan", namaMeja(d.st(), "S101"), "R01");

  // Kasir juga boleh mengganti nama (bukaMeja), tapi TIDAK boleh menambah/menghapus meja.
  d.push(jam(12, 6), { t: "setTableName", tableId: "S103", name: "Dekat Kasir" }, "u-dewi");
  t("kasir Smokehouse boleh ganti nama", namaMeja(d.st(), "S103"), "Dekat Kasir");
  d.push(jam(12, 7), { t: "setMejaDipakai", tableId: "S114", dipakai: true }, "u-dewi");
  t("kasir tidak boleh menambah meja", mejaDipakai(d.st(), "S114"), false);

  // Hapus meja: yang masih ada tamunya ditolak, yang kosong diterima.
  d.push(jam(18), { t: "walkin", tableId: "S104", guest: "Budi" });
  d.push(jam(18, 1), { t: "setMejaDipakai", tableId: "S104", dipakai: false });
  t("meja yang ada tamunya tidak bisa dihapus", mejaDipakai(d.st(), "S104"), true);
  d.push(jam(18, 2), { t: "setMejaDipakai", tableId: "S105", dipakai: false });
  t("meja kosong bisa dihapus", mejaDipakai(d.st(), "S105"), false);
  t("meja yang dihapus hilang dari denah", mejaDijual(d.st()).some((x) => x.id === "S105"), false);

  // PENYEBAB DITOLAK DI SERVER: pelaku tidak ada di daftar staf mesin.
  d.push(jam(19), { t: "setMejaDipakai", tableId: "S115", dipakai: true }, "akun-hanya-di-server");
  t("akun yang tidak dikenal mesin DITOLAK", mejaDipakai(d.st(), "S115"), false);
  d.push(jam(19, 1), {
    t: "saveEmployee",
    emp: { id: "akun-hanya-di-server", name: "Pemilik", pin: "", role: "superadmin", active: true },
  });
  d.push(jam(19, 2), { t: "setMejaDipakai", tableId: "S115", dipakai: true }, "akun-hanya-di-server");
  t("setelah akunnya disimpan di Atur, diterima", mejaDipakai(d.st(), "S115"), true);
}

console.log("\n-- 3 · Kru Kitchen mengubah stok gudang --");
{
  const d = dunia();
  d.push(jam(12), {
    t: "saveEmployee", emp: { id: "u-koki", name: "Koki", pin: "", role: "kru_kitchen", active: true, venue: "smh" },
  });
  d.push(jam(12, 1), { t: "setStock", itemId: NASGOR, qty: 40 }, "u-koki");
  t("kru kitchen: setel stok diterima", d.st().stock.find((r) => r.itemId === NASGOR)?.qty, 40);
  d.push(jam(12, 2), { t: "addStock", itemId: NASGOR, delta: 5 }, "u-koki");
  t("kru kitchen: tambah stok diterima", d.st().stock.find((r) => r.itemId === NASGOR)?.qty, 45);
}

console.log("\n-- 4 · Rekap keuangan tanpa batas 92 hari --");
{
  const r = clampRange("2025-01-01", "2026-11-14");
  t("rentang hampir dua tahun tidak dipotong", r.dipotong, false);
  const d = dunia();
  const hasil = recapRange(d.st(), "2025-11-01", businessDateOf(Date.now()));
  t("rekap setahun lebih: semua hari terhitung", hasil.hari.length > 365, true);
}

console.log("\n-- 5 · Struk settlement harian 80 mm (contoh PDF pemilik) --");
{
  const p = (nama: string, station: ProdukHariBaris["station"], qty: number, totalRp: number): ProdukHariBaris =>
    ({ itemId: nama, nama, station, venue: "smh", qty, total: totalRp, comp: 0, tunai: totalRp, qris: 0, edc: 0, prabayar: 0, lain: 0 } as ProdukHariBaris);
  const baris = [
    p("Nasi Goreng Ayam", "kitchen", 2, 70000), p("Ayam Geprek", "kitchen", 1, 26000),
    p("Nasi Goreng Ayam", "kitchen", 1, 35000), p("Mineral 600ml", "bar", 12, 72000),
    p("Orange Juice", "bar", 1, 30000),
  ];
  const seksi = seksiRekap(baris);
  t("seksi Cafe lalu Bar", seksi.map((x) => x.judul), ["REKAP PENJUALAN CAFE", "REKAP PENJUALAN BAR"]);
  t("menu sama digabung, urut alfabetis, huruf besar",
    seksi[0].baris.map((b) => `${b.qty} ${b.nama} ${b.total}`), ["1 AYAM GEPREK 26000", "3 NASI GORENG AYAM 105000"]);
  t("tanggal Indonesia", tanggalPanjang("2026-11-14"), "Sabtu, 14 November 2026");
  const h = htmlRekapPenjualan({ venue: "smh", bizDate: "2026-11-14", seksi });
  t("kepala KAS KASIR / SHR / Rekening All", h.includes("KAS KASIR<br>SHR<br>Rekening All"), true);
  t("grand total cafe 131.000", h.includes(">131.000<"), true);
  t("total gabungan (Cafe + Bar) = 233.000", h.includes("Total (Cafe + Bar) =") && h.includes(">233.000<"), true);
  t("ada kolom tanda tangan berlabel", h.includes(">Diperiksa<"), true);
  t("lebar tabel dikunci 72 mm", h.includes("width:72mm"), true);
  const spl = htmlRekapPenjualan({ venue: "spl", bizDate: "2026-11-14", seksi, sewaMeja: { sesi: 4, total: 200000 } });
  t("SPL: sewa meja ikut, total = 433.000", spl.includes("SEWA MEJA BILIAR") && spl.includes(">433.000<"), true);

  const at = jam(11, 23);
  const b = (kode: string, kanal: BarisTransaksi["kanal"], jumlah: number, mesin?: string): BarisTransaksi =>
    ({ shiftId: "s1", at, kode, meja: "R04", keterangan: "ATMI", kanal, jumlah, ...(mesin ? { mesin } : {}) });
  const dt = htmlDetailTransaksi({ venue: "smh", bizDate: "2026-11-14", kasir: "SHIFT PAGI", baris: [
    b("DI1", "cash", 12000), b("DI2", "qris_online", 23000), b("DI3", "edc", 50000, "Mandiri"), b("DI4", "edc", 7000, "BRI"),
  ] });
  t("detail: kolom per mesin EDC (BRI, MANDIRI) terlihat", dt.includes(">BRI<") && dt.includes(">MANDIRI<"), true);
  t("detail: total transaksi menjumlah SEMUA kolom (92.000)", dt.includes(">92.000<"), true);
  t("detail: label total dari kolom yang sama", dt.includes("(KAS+QRIS+BRI+MANDIRI)"), true);
  t("detail: kasir & judul", dt.includes("Kasir : SHIFT PAGI") && dt.includes("DETAIL TRANSAKSI CAFE"), true);
}

console.log("\n-- 6 · Kertas checker per meja, bukan per menu --");
{
  const d = dunia();
  // Satu kali kirim berisi tiga menu; tiap aksi mendapat jam yang berselisih milidetik.
  d.push(jam(15, 27), { t: "walkin", tableId: "S107", guest: "Meja 7" });
  const sid = d.st().sessions.find((x) => x.tableId === "S107")!.id;
  const it = (id: string) => itemOf(d.st(), id)!;
  const kirim = (key: string, id: string, ms: number) => d.entries.push({
    id: `x${key}`, at: jam(15, 28) + ms, by: "u-manager",
    act: { t: "addFnb", sessionId: sid, name: it(id).name, station: it(id).station, line: { key, itemId: id, qty: 1 } },
  });
  kirim("a", NASGOR, 0); kirim("b", "br-01", 3); kirim("c", TEH, 6);
  const tk = d.st().tickets.filter((x) => x.sessionId === sid);
  const kertas = kelompokkan(tk);
  t("satu kali kirim = satu kertas dapur + satu kertas bar", kertas.map((k) => `${k.bagian}:${k.item.length}`).sort(), ["bar:1", "kitchen:2"]);
  const dp = tk.find((x) => x.station === "kitchen")!;
  const lain = kelompokkan([...tk, { ...dp, id: "nanti", at: dp.at + 5 * 60_000 }]);
  t("pesanan susulan 5 menit kemudian = kertas baru", lain.filter((k) => k.bagian === "kitchen").length, 2);
}

console.log("\n-- 7 · Rekap disaring: unit = venue (Bar ikut venuenya), shift, rekening, periode --");
{
  const d = dunia();       // shift SPL & Smokehouse dibuka 11.00 = shift PAGI
  const it = (id: string) => itemOf(d.st(), id)!;
  const pesan = (sid: string, id: string, qty: number, at: number) => d.push(at, {
    t: "addFnb", sessionId: sid, name: it(id).name, station: it(id).station, line: { key: `${sid}-${id}`, itemId: id, qty },
  });
  // Smokehouse: nasi goreng (resto) + teh (bar), dibayar cash.
  d.push(jam(12), { t: "walkin", tableId: "S108", guest: "Andi" });
  const s1 = d.st().sessions.find((x) => x.tableId === "S108")!.id;
  pesan(s1, NASGOR, 2, jam(12, 1)); pesan(s1, TEH, 2, jam(12, 1));
  d.push(jam(13), { t: "settle", id: s1, channel: "cash" });
  const st = d.st();
  const nilai = (id: string, q: number) => itemOf(st, id)!.price * q;
  const hari = businessDateOf(Date.now());
  const semua = rekapSaring(st, { dari: hari, sampai: hari, unit: "semua" });
  const spl = rekapSaring(st, { dari: hari, sampai: hari, unit: "spl" });
  const smh = rekapSaring(st, { dari: hari, sampai: hari, unit: "smh" });
  // Keputusan pemilik 14 Nov 2026: Bar TIDAK dipisah — minuman ikut venue tempat dipesan.
  t("minuman bar ikut Smokehouse (dipesan di sana)", smh.total, nilai(NASGOR, 2) + nilai(TEH, 2));
  t("SPL tidak kebagian pesanan Smokehouse", spl.total, 0);
  t("gabungan = SPL + Smokehouse", semua.total, smh.total + spl.total);
  t("shift pagi menampung semuanya", rekapSaring(st, { dari: hari, sampai: hari, unit: "semua", shift: "pagi" }).total, semua.total);
  t("shift sore kosong", rekapSaring(st, { dari: hari, sampai: hari, unit: "semua", shift: "sore" }).total, 0);
  t("saring cash = semua (dibayar cash)", rekapSaring(st, { dari: hari, sampai: hari, unit: "semua", kanal: ["tunai"] }).total, semua.total);
  t("saring rekening QRIS = 0", rekapSaring(st, { dari: hari, sampai: hari, unit: "semua", kanal: ["qris", "edc:BRI"] }).total, 0);
  t("rentang setahun memuat hari ini", rekapSaring(st, { dari: shiftDate(hari, -364), sampai: hari, unit: "smh" }).total, smh.total);
  t("kelas shift: 11.00 pagi, 18.00 sore, 01.00 sore",
    [kelasShiftJam(jam(11)), kelasShiftJam(jam(18)), kelasShiftJam(jam(25))], ["pagi", "sore", "sore"]);

  // Rekap per MENU (isi struk KAS KASIR) mengikuti saringan yang sama.
  const m = (o: Partial<Parameters<typeof menuSaring>[1]>) =>
    menuSaring(st, { dari: hari, sampai: hari, unit: "semua", ...o }).baris.map((b) => `${b.qty} ${b.itemId} ${b.total}`);
  t("menu Smokehouse: nasi goreng + teh", m({ unit: "smh" }).sort(), [`2 ${NASGOR} ${nilai(NASGOR, 2)}`, `2 ${TEH} ${nilai(TEH, 2)}`].sort());
  t("menu SPL: kosong", m({ unit: "spl" }), []);
  t("menu shift sore: kosong", m({ shift: "sore" }), []);
  t("menu shift pagi: dua menu", m({ shift: "pagi" }).length, 2);
  t("menu rekening QRIS: kosong", m({ kanal: ["qris"] }), []);
  t("menu cash: dua menu", m({ kanal: ["tunai"] }).length, 2);

  const html = htmlRekapPenjualan({
    venue: "smh", bizDate: hari, outlet: "SHR", rekening: "Cash",
    keterangan: ["14 November 2026", "Shift Pagi"],
    seksi: seksiRekap(menuSaring(st, { dari: hari, sampai: hari, unit: "smh" }).baris),
    pembayaran: [{ label: "CASH", nilai: smh.total }],
  });
  t("struk saringan: kepala KAS KASIR / SHR / Cash", html.includes("KAS KASIR<br>SHR<br>Cash"), true);
  t("struk saringan: shift tercetak", html.includes(">Shift Pagi<"), true);
  t("struk saringan: kotak pembayaran", html.includes("PEMBAYARAN") && html.includes("TOTAL DITERIMA"), true);
  t("struk saringan: seksi Cafe & Bar (kategori menu, bukan unit)", html.includes("REKAP PENJUALAN CAFE") && html.includes("REKAP PENJUALAN BAR"), true);
}

console.log("\n-- 8 · Closing per shift & struk gabungan (panduan PDF pemilik) --");
{
  const d = dunia();       // shift SPL 11.00 & Smokehouse 11.01 (shift 1)
  const it = (id: string) => itemOf(d.st(), id)!;
  const pesan = (sid: string, id: string, qty: number, at: number) => d.push(at, {
    t: "addFnb", sessionId: sid, name: it(id).name, station: it(id).station, line: { key: `${sid}-${id}`, itemId: id, qty },
  });
  const buka = (meja: string, at: number) => {
    d.push(at, { t: "walkin", tableId: meja, guest: meja });
    return d.st().sessions.find((x) => x.tableId === meja && x.status === "running")!.id;
  };
  // Shift 1 Smokehouse: nasi goreng, cash.
  const s1 = buka("S108", jam(12)); pesan(s1, NASGOR, 2, jam(12, 1)); d.push(jam(13), { t: "settle", id: s1, channel: "cash" });
  // Ganti shift Smokehouse jam 15.00.
  d.push(jam(15), { t: "closeShift", countedCash: itemOf(d.st(), NASGOR)!.price * 2, venue: "smh" });
  d.push(jam(15, 1), { t: "openShift", openingCash: 0, venue: "smh" });
  // Shift 2 Smokehouse: teh, QRIS.
  const s2 = buka("S109", jam(16)); pesan(s2, TEH, 3, jam(16, 1)); d.push(jam(17), { t: "settle", id: s2, channel: "qris_online" });
  const st = d.st();
  const hari = businessDateOf(Date.now());
  const shifts = shiftHariItu(st, hari, "smh");
  t("dua shift Smokehouse hari ini", shifts.length, 2);
  const menu = (id: string | null) => menuShift(st, hari, "smh", id).baris.map((b) => `${b.qty} ${b.itemId}`).sort();
  t("shift 1: hanya nasi goreng", menu(shifts[0].id), [`2 ${NASGOR}`]);
  t("shift 2: hanya teh", menu(shifts[1].id), [`3 ${TEH}`]);
  t("semua shift: keduanya", menu(null), [`2 ${NASGOR}`, `3 ${TEH}`].sort());
  const os = omzetPerShift(st, hari, "smh");
  const uang = (id: string) => os.rincian.filter((x) => x.shiftId === id).reduce((n, x) => n + x.jumlah, 0);
  const nilaiMenu = (id: string) => menuShift(st, hari, "smh", id).baris.reduce((n, b) => n + b.total, 0);
  t("menu shift 1 = uang shift 1", nilaiMenu(shifts[0].id), uang(shifts[0].id));
  t("menu shift 2 = uang shift 2", nilaiMenu(shifts[1].id), uang(shifts[1].id));

  // Struk closing shift 2.
  const h2 = htmlRekapPenjualan({
    venue: "smh", bizDate: hari, outlet: "SHR", keterangan: [tanggalPanjang(hari), "Kasir : SHIFT 2"],
    seksi: seksiRekap(menuShift(st, hari, "smh", shifts[1].id).baris),
    pembayaran: [{ label: "QRIS", nilai: uang(shifts[1].id) }],
  });
  t("struk shift: KAS KASIR / SHR / Rekening All", h2.includes("KAS KASIR<br>SHR<br>Rekening All"), true);
  t("struk shift: baris kasir", h2.includes(">Kasir : SHIFT 2<"), true);
  t("struk shift: hanya Bar (teh)", h2.includes("REKAP PENJUALAN BAR") && !h2.includes("REKAP PENJUALAN CAFE"), true);
  t("struk shift: Total (Bar) =", h2.includes("Total (Bar) ="), true);

  // Struk GABUNGAN: satu blok per venue + total gabungan.
  const g = htmlRekapPenjualan({
    venue: "spl", bizDate: hari, outlet: "SPL + SHR",
    blok: [
      { judul: "SPL SPORT", seksi: [], sewaMeja: { sesi: 0, total: 100000 } },
      { judul: "SMOKEHOUSE", seksi: seksiRekap(menuShift(st, hari, "smh", null).baris) },
    ],
  });
  const totalSmh = nilaiMenu(shifts[0].id) + nilaiMenu(shifts[1].id);
  t("gabungan: blok SPL & Smokehouse", g.includes(">SPL SPORT<") && g.includes(">SMOKEHOUSE<"), true);
  t("gabungan: total per venue", g.includes("Total SPL SPORT =") && g.includes("Total SMOKEHOUSE ="), true);
  t("gabungan: total kedua venue", g.includes("Total (SPL SPORT + SMOKEHOUSE) =") && g.includes(`>${(100000 + totalSmh).toLocaleString("id-ID")}<`), true);
  const dt = htmlDetailTransaksi({ venue: null, bizDate: hari, kasir: "SEMUA SHIFT", baris: omzetPerShift(st, hari).rincian });
  t("detail gabungan: judul SPL + SHR", dt.includes("DETAIL TRANSAKSI SPL + SHR"), true);
}

console.log("\n-- 9 · Jam aktif: tamu = jam resmi, kasir = shift; meteran ikut shift; tarif weekend --");
{
  // Hari operasional berganti 06.00; jam resmi 11.00–06.00.
  t("hari operasional 05.59 masih hari ini, 06.00 hari berikutnya",
    [businessDateOf(jam(29, 59)) === businessDateOf(jam(12)), businessDateOf(jam(30)) === businessDateOf(jam(12))], [true, false]);

  // A. Shift SPL tetap buka sampai pagi: meteran jalan terus lewat 06.00.
  {
    const d = dunia();
    d.push(jam(22), { t: "walkin", tableId: "T05", guest: "Malam" });
    const sid = d.st().sessions.find((x) => x.tableId === "T05" && x.status === "running")!.id;
    d.push(jam(31), { t: "settle", id: sid, channel: "cash" });       // 07.00 besok, shift masih buka
    const s = d.st().sessions.find((x) => x.id === sid)!;
    const harap = billOpenSession("regular", jam(22), jam(31), s.rates).amount;
    t("shift buka: meteran tidak berhenti di 06.00", s.settledBilliard, harap);
  }
  // B. Shift SPL ditutup 03.00 tanpa pengganti: meteran berhenti di 06.00 (bukan 03.00).
  {
    const d = dunia();
    d.push(jam(22), { t: "walkin", tableId: "T06", guest: "Lupa" });
    const sid = d.st().sessions.find((x) => x.tableId === "T06" && x.status === "running")!.id;
    d.push(jam(27), { t: "closeShift", countedCash: 0 });
    d.push(jam(35), { t: "openShift", openingCash: 0 });                 // 11.00 besok
    d.push(jam(35, 5), { t: "settle", id: sid, channel: "cash" });
    const s = d.st().sessions.find((x) => x.id === sid)!;
    t("tanpa shift di 06.00: meteran berhenti 06.00", s.settledBilliard, billOpenSession("regular", jam(22), jam(30), s.rates).amount);
  }
  // C. Lembur: kasir membuka meja 07.00 (shift buka) → lembur; paket jam melewati 06.00 diterima.
  {
    const d = dunia();
    d.push(jam(29), { t: "walkin", tableId: "T07", guest: "Subuh", hours: 2 });
    t("paket 2 jam mulai 05.00 (lewat 06.00) diterima selama shift buka",
      d.st().sessions.some((x) => x.tableId === "T07" && x.status === "running"), true);
    d.push(jam(31), { t: "walkin", tableId: "T08", guest: "Pagi" });
    const s8 = d.st().sessions.find((x) => x.tableId === "T08");
    t("buka meja 07.00 (di luar jam resmi) = lembur", !!s8?.lembur, true);
    d.push(jam(22), { t: "walkin", tableId: "T09", guest: "Malam" });
    const s9 = d.st().sessions.find((x) => x.tableId === "T09");
    t("buka meja 22.00 (jam resmi) bukan lembur", !!s9 && !s9.lembur, true);
    const stNow = d.st();
    t("tamu tidak bisa booking online pukul 08.00",
      !!slotProblem(stNow, { tableId: "T10", startsAt: jam(32), hours: 1 }, jam(31), true), true);
  }
  // D. Tarif weekend: kosong = weekday; diisi = berlaku Sabtu & Minggu (hari operasional).
  {
    const d = dunia();
    d.push(jam(12), { t: "setRate", key: "regularNightWe", value: 45_000 });
    d.push(jam(12, 1), { t: "setRate", key: "vipWe", value: 70_000 });
    const st = d.st();
    t("tarif weekend tersimpan", [st.rates.regularNightWe, st.rates.vipWe], [45_000, 70_000]);
    t("weekday tetap", rateWith(st.rates, "regular", 20, 3), st.rates.regularNight);
    t("Sabtu malam pakai tarif weekend", rateWith(st.rates, "regular", 20, 6), 45_000);
    t("Minggu VIP pakai tarif weekend", rateWith(st.rates, "vip", 14, 0), 70_000);
    t("weekend siang kosong → ikut weekday", rateWith(st.rates, "regular", 14, 6), st.rates.regularDay);
    d.push(jam(12, 2), { t: "setRate", key: "vipWe", value: 0 });
    t("dikosongkan (0) → kembali ikut weekday", d.st().rates.vipWe, undefined);
    d.push(jam(12, 3), { t: "setRate", key: "vip", value: 0 });
    t("tarif weekday tidak boleh 0", d.st().rates.vip > 0, true);
    // Meteran memakai hari operasional: segmen dihitung per jam.
    const sabtu = (() => { for (let i = 0; i < 7; i++) { const x = dariWib(Y, M, D + i, 20); if (businessDow(x) === 6) return x; } return 0; })();
    const b = billOpenSession("regular", sabtu, sabtu + 3_600_000, st.rates);
    t("meteran Sabtu malam 1 jam = tarif weekend", b.amount, 45_000);
  }
}

console.log("\n-- 10 · Promo per venue (SPL Sport / Smokehouse / kedua venue) --");
{
  const promo = (id: string, venue?: "spl" | "smh") => ({
    id, code: id.toUpperCase(), name: `Promo ${id}`, kind: "percent" as const, value: 50, scope: "all" as const,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 48, minSpend: 0, maxDiscount: 0,
    active: true, autoApply: true, ...(venue ? { venue } : {}),
  });
  const diskonDi = (p: ReturnType<typeof promo>, meja: string) => {
    const d = dunia();
    // Promo lain (bawaan) dimatikan supaya yang diuji hanya promo ini.
    for (const x of d.st().promos) d.push(jam(11, 30), { t: "deletePromo", id: x.id });
    d.push(jam(11, 40), { t: "savePromo", promo: p });
    d.push(jam(12), { t: "walkin", tableId: meja, guest: "Uji" });
    const sid = d.st().sessions.find((x) => x.tableId === meja && x.status === "running")!.id;
    const it = itemOf(d.st(), NASGOR)!;
    d.push(jam(12, 1), { t: "addFnb", sessionId: sid, name: it.name, station: it.station, line: { key: "k", itemId: NASGOR, qty: 2 } });
    d.push(jam(13), { t: "settle", id: sid, channel: "cash" });
    return d.st().sessions.find((x) => x.id === sid)!.settledDiscount ?? 0;
  };
  t("promo SPL dipakai di meja SPL", diskonDi(promo("spl1", "spl"), "T05") > 0, true);
  t("promo SPL TIDAK dipakai di meja Smokehouse", diskonDi(promo("spl2", "spl"), "S106"), 0);
  t("promo Smokehouse dipakai di meja Smokehouse", diskonDi(promo("smh1", "smh"), "S106") > 0, true);
  t("promo Smokehouse TIDAK dipakai di meja SPL", diskonDi(promo("smh2", "smh"), "T05"), 0);
  t("promo kedua venue (lama, tanpa venue) dipakai di SPL", diskonDi(promo("dua1"), "T05") > 0, true);
  t("promo kedua venue dipakai di Smokehouse", diskonDi(promo("dua2"), "S106") > 0, true);

  // Pengurus yang terikat Smokehouse tidak boleh membuat promo SPL.
  const d = dunia();
  d.push(jam(11, 30), { t: "saveEmployee", emp: { id: "", name: "Mgr SMH", pin: "", role: "manager", active: true, venue: "smh" } });
  const mgr = d.st().employees.find((x) => x.name === "Mgr SMH")!.id;
  d.push(jam(12), { t: "savePromo", promo: promo("x1", "spl") }, mgr);
  d.push(jam(12, 1), { t: "savePromo", promo: promo("x2", "smh") }, mgr);
  t("manager Smokehouse: promo SPL ditolak, promo Smokehouse diterima",
    [d.st().promos.some((p) => p.id === "x1"), d.st().promos.some((p) => p.id === "x2")], [false, true]);
  d.push(jam(12, 2), { t: "savePromo", promo: { ...promo("x3"), venue: "abc" as never } });
  t("venue promo yang tidak dikenal ditolak", d.st().promos.some((p) => p.id === "x3"), false);
}

// ── 12. MENU PER VENUE (pemilik 14 Nov 2026) ────────────────────────
{
  console.log("\n-- 12 · Menu per venue (Dijual di SPL / Smokehouse / kedua venue) --");
  const d = dunia();
  const ada = (v: "spl" | "smh") =>
    kategoriJual(d.st(), { staf: true, venue: v }).some((c) => c.items.some((i) => i.id === NASGOR));
  t("menu lama dijual di kedua venue", [ada("spl"), ada("smh")], [true, true]);
  d.push(jam(11), { t: "setMenuVenue", itemId: NASGOR, venue: "spl" });
  t("menu SPL saja: tampil di SPL, hilang di Smokehouse", [ada("spl"), ada("smh")], [true, false]);
  t("tanpa venue = semua menu (laporan & menu admin)",
    kategoriJual(d.st(), { staf: true }).some((c) => c.items.some((i) => i.id === NASGOR)), true);

  const pesan = (meja: string, menit: number) => {
    d.push(jam(12, menit), { t: "walkin", tableId: meja, guest: "Uji" });
    const sid = d.st().sessions.find((x) => x.tableId === meja && x.status === "running")!.id;
    const it = itemOf(d.st(), NASGOR)!;
    d.push(jam(12, menit + 1), { t: "addFnb", sessionId: sid, name: it.name, station: it.station, line: { key: "k", itemId: NASGOR, qty: 1 } });
    return (d.st().sessions.find((x) => x.id === sid)!.fnb ?? []).length;
  };
  t("kasir: menu SPL masuk bill meja SPL", pesan("T05", 0), 1);
  t("kasir: menu SPL DITOLAK di meja Smokehouse", pesan("S106", 2), 0);

  const tamu = (mode: "meja" | "takeaway", tableId: string | undefined, venue?: "spl" | "smh") =>
    guestOrderProblem(d.st(), { mode, tableId, pay: "kasir", lines: [{ key: "k", itemId: NASGOR, qty: 1 }], venue } as never, jam(12, 5)) ?? "";
  t("HP tamu: menu SPL dari meja Smokehouse ditolak dengan alasan jelas", tamu("meja", "S106").includes("tidak dijual di Smokehouse"), true);
  t("HP tamu: takeaway Smokehouse ditolak", tamu("takeaway", undefined, "smh").includes("tidak dijual"), true);
  t("HP tamu: takeaway SPL tidak ditolak karena venue", tamu("takeaway", undefined, "spl").includes("tidak dijual"), false);

  d.push(jam(13), { t: "setMenuVenue", itemId: NASGOR, venue: null });
  t("dikembalikan ke kedua venue", [ada("spl"), ada("smh")], [true, true]);
  d.push(jam(13, 1), { t: "setMenuVenue", itemId: "tidak-ada", venue: "spl" });
  t("menu yang tidak ada diabaikan", d.st().menuVenue?.["tidak-ada"], undefined);
  d.push(jam(13, 2), { t: "setMenuVenue", itemId: NASGOR, venue: "abc" as never });
  t("venue yang tidak dikenal ditolak", d.st().menuVenue?.[NASGOR], undefined);

  t("venue terdampak", [venueTerdampakMenu(null, "spl"), venueTerdampakMenu("spl", "smh"), venueTerdampakMenu("smh", null)],
    [["smh"], ["spl", "smh"], ["spl"]]);
  // Pengurus Smokehouse hanya boleh mengubah yang berdampak ke Smokehouse.
  d.push(jam(13, 5), { t: "saveEmployee", emp: { id: "", name: "Mgr SMH", pin: "", role: "manager", active: true, venue: "smh" } });
  const mgr = d.st().employees.find((x) => x.name === "Mgr SMH")!.id;
  d.push(jam(13, 6), { t: "setMenuVenue", itemId: NASGOR, venue: "smh" }, mgr);
  t("manager Smokehouse tidak bisa mencabut menu dari SPL", d.st().menuVenue?.[NASGOR], undefined);
  d.push(jam(13, 7), { t: "setMenuVenue", itemId: NASGOR, venue: "spl" }, mgr);
  t("manager Smokehouse boleh mencabut menu dari Smokehouse", d.st().menuVenue?.[NASGOR], "spl");
}

// ── 13. KATEGORI MENU YANG BISA DIATUR (pemilik 15 Nov 2026) ────────
{
  console.log("\n-- 13 · Kategori menu diatur pemilik (nama, baru, urutan, kelompok, pindah) --");
  const d = dunia();
  const kat = (staf = true) => kategoriJual(d.st(), { staf });
  const cari = (id: string, staf = true) => kat(staf).find((c) => c.id === id);
  const di = (itemId: string, staf = true) => kat(staf).find((c) => c.items.some((i) => i.id === itemId))?.id;

  t("tanpa pengaturan = susunan buku menu", kat().map((c) => c.id).slice(0, 2), ["light-bites", "pendamping"]);
  d.push(jam(11), { t: "ubahKategori", id: "fried-rice", nama: "Nasi Goreng Spesial" });
  t("ganti nama kategori", cari("fried-rice")?.name, "Nasi Goreng Spesial");
  d.push(jam(11, 1), { t: "ubahKategori", id: "fried-rice", grup: "bar" });
  t("kelompok diatur pemilik", cari("fried-rice")?.grup, "bar");
  d.push(jam(11, 2), { t: "ubahKategori", id: "fried-noodles", nama: "Nasi Goreng Spesial" });
  t("nama kembar ditolak", cari("fried-noodles")?.name === "Nasi Goreng Spesial", false);

  d.push(jam(11, 3), { t: "buatKategori", id: "k-spesial-1", nama: "Menu Spesial", grup: "kitchen" });
  t("kategori baru yang kosong tidak tampil di layar pesan", !!cari("k-spesial-1"), false);
  t("tapi ada di susunan pengaturan", susunKategori(d.st(), { staf: true }).some((c) => c.id === "k-spesial-1"), true);
  d.push(jam(11, 4), { t: "pindahMenuKategori", itemId: NASGOR, kategoriId: "k-spesial-1" });
  t("menu dipindah ke kategori baru", di(NASGOR), "k-spesial-1");
  t("kategori baru tampil begitu ada isinya", cari("k-spesial-1")?.name, "Menu Spesial");
  t("tidak tertinggal di kategori asal", cari("fried-rice")?.items.some((i) => i.id === NASGOR), false);
  d.push(jam(11, 5), { t: "hapusKategori", id: "k-spesial-1" });
  t("kategori yang masih berisi tidak bisa dihapus", !!cari("k-spesial-1"), true);
  d.push(jam(11, 6), { t: "hapusKategori", id: "fried-rice" });
  t("kategori bawaan tidak bisa dihapus", !!cari("fried-rice"), true);

  d.push(jam(11, 7), { t: "urutKategori", urutan: ["k-spesial-1", "fried-rice"] });
  t("urutan diatur pemilik", kat().map((c) => c.id).slice(0, 3), ["k-spesial-1", "fried-rice", "light-bites"]);

  // Rokok dipindah ke kategori umum: tetap tidak tampil di HP tamu.
  d.push(jam(11, 8), { t: "pindahMenuKategori", itemId: "bl-01", kategoriId: "k-spesial-1" });
  t("menu kasir-saja yang dipindah: tampil di kasir", di("bl-01"), "k-spesial-1");
  t("menu kasir-saja yang dipindah: TIDAK tampil di HP tamu", di("bl-01", false), undefined);

  d.push(jam(11, 9), { t: "pindahMenuKategori", itemId: NASGOR, kategoriId: null });
  d.push(jam(11, 10), { t: "pindahMenuKategori", itemId: "bl-01", kategoriId: null });
  t("menu kembali ke kategori asal", [di(NASGOR), di("bl-01")], ["fried-rice", "counter-biliar"]);
  d.push(jam(11, 11), { t: "hapusKategori", id: "k-spesial-1" });
  t("kategori buatan yang sudah kosong bisa dihapus", susunKategori(d.st(), { staf: true }).some((c) => c.id === "k-spesial-1"), false);

  d.push(jam(11, 12), { t: "ubahKategori", id: "light-bites", nama: "x" }, "u-rian");
  t("kru kasir tidak bisa mengatur kategori", cari("light-bites")?.name, "Light Bites");
  d.push(jam(11, 13), { t: "buatKategori", id: "bukan id sah", nama: "Coba" });
  t("id kategori tidak sah ditolak", Object.keys(d.st().aturKategori?.kategori ?? {}).includes("bukan id sah"), false);

  d.push(jam(11, 14), { t: "resetKategori" });
  t("kembalikan ke susunan awal", [d.st().aturKategori, cari("fried-rice")?.name], [undefined, "Fried Rice"]);
}

// ── 14. LANTAI & KODE PESANAN DI CHECKER; TAMBAH MEJA PER LANTAI (pemilik 15 Nov 2026) ──
{
  console.log("\n-- 14 · Lantai & kode pesanan di tiket/kertas checker; tambah meja per lantai --");
  const d = dunia();
  const it = itemOf(d.st(), NASGOR)!;
  d.push(jam(12), { t: "walkin", tableId: "S106", guest: "Andi" });
  const sesi = d.st().sessions.find((x) => x.tableId === "S106" && x.status === "running")!;
  d.push(jam(12, 1), { t: "addFnb", sessionId: sesi.id, name: it.name, station: it.station, line: { key: "a", itemId: NASGOR, qty: 1 } });
  const tk = d.st().tickets.find((x) => x.sessionId === sesi.id)!;
  t("tiket Smokehouse membawa lantai", tk.lantai, 1);
  t("tiket membawa kode pesanan (sama dengan nomor transaksi)", tk.kode, kodeSesi(sesi));
  const html = htmlKertas(kelompokkan([tk])[0]);
  t("kertas checker menulis LANTAI dan kode", html.includes("LANTAI 1") && html.includes(`#${kodeSesi(sesi)}`), true);

  d.push(jam(12, 2), { t: "walkin", tableId: "T05", guest: "Budi" });
  const spl = d.st().sessions.find((x) => x.tableId === "T05" && x.status === "running")!;
  d.push(jam(12, 3), { t: "addFnb", sessionId: spl.id, name: it.name, station: it.station, line: { key: "b", itemId: NASGOR, qty: 1 } });
  const tkSpl = d.st().tickets.find((x) => x.sessionId === spl.id)!;
  t("meja SPL tanpa lantai, tetap ada kode", [tkSpl.lantai, tkSpl.kode], [undefined, kodeSesi(spl)]);
  t("kertas SPL tanpa tulisan lantai", htmlKertas(kelompokkan([tkSpl])[0]).includes("LANTAI"), false);

  // Katalog tambah meja per lantai — dipakai Papan DAN Pengaturan.
  t("lantai Smokehouse di katalog", lantaiVenue("smh"), [1, 2]);
  const l2 = cadanganMeja(d.st(), "smh", { lantai: 2 });
  t("cadangan lantai 2 semuanya lantai 2", l2.length > 0 && l2.every((x) => x.lantai === 2), true);
  d.push(jam(12, 4), { t: "setMejaDipakai", tableId: l2[0].id, dipakai: true });
  t("meja lantai 2 ditambahkan & hilang dari cadangan",
    [mejaDipakai(d.st(), l2[0].id), cadanganMeja(d.st(), "smh", { lantai: 2 }).some((x) => x.id === l2[0].id)], [true, false]);
  t("cadangan SPL bisa dipilih per kelas", cadanganMeja(d.st(), "spl", { kelas: "vip" }).every((x) => x.type === "vip"), true);

  // Pesanan pindah ke meja lantai 2: tiketnya ikut membawa lantai baru.
  d.push(jam(12, 5), { t: "walkin", tableId: l2[0].id, guest: "Citra" });
  const tujuan = d.st().sessions.find((x) => x.tableId === l2[0].id && x.status === "running")!;
  d.push(jam(12, 6), { t: "moveFnb", fromId: sesi.id, toId: tujuan.id, keys: ["a"] });
  const pindah = d.st().tickets.find((x) => x.sessionId === tujuan.id && x.itemId === NASGOR);
  t("tiket yang dipindah ke lantai 2 ikut lantai & kode meja baru", [pindah?.lantai, pindah?.kode], [2, kodeSesi(tujuan)]);
}

// ── 15. KATEGORI MEJA (Reguler/VIP/Owner/Entertain + buatan pemilik) ──
{
  console.log("\n-- 15 · Kategori meja Smokehouse: bawaan, buatan pemilik, aturan compliment --");
  const d = dunia();
  t("tanpa pengaturan: meja Owner bawaan tetap compliment", [complimentMeja(d.st(), "S1OW"), complimentMeja(d.st(), "S1EN"), complimentMeja(d.st(), "S106")],
    ["owner", "entertain", undefined]);
  t("kategori bawaan katalog", [kategoriMejaDari(d.st(), "S1VP")?.nama, kategoriMejaDari(d.st(), "S106")?.nama], ["VIP", "Reguler"]);

  // Meja baru berkategori Owner berperilaku persis seperti meja Owner.
  d.push(jam(11), { t: "setMejaDipakai", tableId: "S113", dipakai: true });
  d.push(jam(11, 1), { t: "setKategoriMeja", tableId: "S113", kategori: "smh-owner" });
  t("meja baru dipasang kategori Owner", complimentMeja(d.st(), "S113"), "owner");
  d.push(jam(12), { t: "walkin", tableId: "S113", guest: "" });
  t("meja compliment wajib nama penerima", !!runningOn(d.st(), "S113"), false);
  d.push(jam(12, 1), { t: "walkin", tableId: "S113", guest: "Pak Budi" });
  const sesi = runningOn(d.st(), "S113")!;
  const it = itemOf(d.st(), NASGOR)!;
  d.push(jam(12, 2), { t: "addFnb", sessionId: sesi.id, name: it.name, station: it.station, line: { key: "k", itemId: NASGOR, qty: 2 } });
  t("pesanan di meja Owner baru jadi Rp 0", runningOn(d.st(), "S113")!.fnb.every((l) => (l.unitPrice ?? 0) === 0), true);
  t("pesanan QR di meja itu ditolak",
    (guestOrderProblem(d.st(), { mode: "meja", tableId: "S113", pay: "kasir", lines: [{ key: "q", itemId: NASGOR, qty: 1 }] } as never, jam(12, 3)) ?? "").includes("lewat kasir"), true);
  d.push(jam(12, 4), { t: "setKategoriMeja", tableId: "S113", kategori: "smh-reguler" });
  t("kategori tidak bisa diganti saat meja dipakai", complimentMeja(d.st(), "S113"), "owner");
  d.push(jam(13), { t: "settle", id: sesi.id, channel: "cash" });
  const tutup = d.st().sessions.find((x) => x.id === sesi.id)!;
  t("jenis compliment dibekukan saat tab ditutup", tutup.settledComplimentJenis, "owner");

  // Kategori buatan pemilik.
  d.push(jam(13, 1), { t: "buatKategoriMeja", id: "km-outdoor-1", nama: "Outdoor", venue: "smh" });
  d.push(jam(13, 2), { t: "buatKategoriMeja", id: "km-band-1", nama: "Panggung Band", venue: "smh", compliment: "entertain" });
  d.push(jam(13, 3), { t: "buatKategoriMeja", id: "km-dobel-1", nama: "outdoor", venue: "smh" });
  t("kategori buatan pemilik tersimpan, nama kembar ditolak",
    kategoriMejaVenue(d.st(), "smh").filter((k) => !k.bawaan).map((k) => k.nama), ["Outdoor", "Panggung Band"]);
  d.push(jam(13, 4), { t: "setKategoriMeja", tableId: "S106", kategori: "km-band-1" });
  t("kategori buatan ber-compliment berlaku", [kategoriMejaDari(d.st(), "S106")?.nama, complimentMeja(d.st(), "S106")], ["Panggung Band", "entertain"]);
  d.push(jam(13, 5), { t: "hapusKategoriMeja", id: "km-band-1" });
  t("kategori yang masih dipakai meja tidak bisa dihapus", !!d.st().kategoriMejaBaru?.["km-band-1"], true);
  d.push(jam(13, 6), { t: "hapusKategoriMeja", id: "km-outdoor-1" });
  t("kategori yang tidak dipakai bisa dihapus", !!d.st().kategoriMejaBaru?.["km-outdoor-1"], false);
  d.push(jam(13, 7), { t: "setKategoriMeja", tableId: "S106", kategori: "smh-reguler" });
  t("kembali ke kategori katalog = catatan dihapus", d.st().mejaKategori?.["S106"], undefined);
  d.push(jam(13, 8), { t: "setKategoriMeja", tableId: "S107", kategori: "smh-vip" }, "u-rian");
  t("kru kasir tidak bisa mengubah kategori meja", kategoriMejaDari(d.st(), "S107")?.id, "smh-reguler");
  d.push(jam(13, 9), { t: "setKategoriMeja", tableId: "T05", kategori: "smh-vip" });
  t("meja biliar tidak memakai kategori meja resto", d.st().mejaKategori?.["T05"], undefined);
}

console.log(`\n${total - bad}/${total} lulus`);
if (bad) process.exit(1);
