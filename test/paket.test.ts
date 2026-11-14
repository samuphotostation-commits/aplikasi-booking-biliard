/* ═══════════════════════════════════════════════════════════════════
   PAKET SPL — VIP & REGULAR, HARGA WEEKDAY/WEEKEND, HARI & JAM AKTIF

   Permintaan pemilik 14 Nov 2026:
     - Paket VIP (hanya meja VIP) dan Paket Regular, harganya sendiri-sendiri.
     - Harga weekday & weekend berbeda, bonusnya juga boleh berbeda:
         Paket VIP      65.000 weekday · 75.000 weekend
         Paket Regular  50.000 weekday + 2 Aqua · 55.000 weekend + 2 Ice Tea
     - Hari aktif bebas dipilih, jam aktif "dari … sampai …".
     - Paket bisa diubah, dinonaktifkan, dihapus.

   Yang diuji di sini adalah MESIN — layar boleh salah tampil, tapi harga
   yang ditagih harus benar.

   Tanggal tetap: Rabu 11 Nov 2026 (weekday), Kamis 12 Nov, Sabtu 14 Nov
   2026 (weekend).
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, paketAktif, paketOf, paketProblem, slotProblem, hargaPaket, validAction,
  jamMulaiPaket, jamSelesaiPaket, mulaiTerakhirPaket, kelasPaket, weekendPaket,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { dariWib } from "../src/lib/occupancy";
import { publicVenue } from "../src/lib/publicView";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const RABU = (h: number, m = 0) => dariWib(2026, 11, 11, h, m);
const KAMIS = (h: number, m = 0) => dariWib(2026, 11, 12, h, m);
const SABTU = (h: number, m = 0) => dariWib(2026, 11, 14, h, m);
const AQUA = "bl-03";
const TEH = "cd-01";   // Ice Tea

function dunia(hari: (h: number, m?: number) => number) {
  const genesis: Genesis = { at: hari(5), seed: false };
  let n = 0;
  const entries: Entry[] = [];
  const push = (at: number, act: Action) =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by: "u-manager", act });
  push(hari(11), { t: "openShift", openingCash: 0 });
  // Dua paket persis seperti contoh pemilik.
  push(hari(11, 2), { t: "savePaket", paket: {
    name: "Paket Regular", price: 50_000, hours: 2, freeDrinks: 0, isi: [{ itemId: AQUA, qty: 2 }],
    kelas: "regular", jamMulai: 11, jamSelesai: 18,
    weekend: { price: 55_000, freeDrinks: 0, isi: [{ itemId: TEH, qty: 2 }] },
  } });
  push(hari(11, 3), { t: "savePaket", paket: {
    name: "Paket VIP", price: 65_000, hours: 2, freeDrinks: 0,
    kelas: "vip", jamMulai: 11, jamSelesai: 26,
    weekend: { price: 75_000, freeDrinks: 0 },
  } });
  const st = () => replay(genesis, entries);
  const pk = (nama: string) => st().packages.find((x) => x.name === nama)!;
  return { genesis, entries, push, st, pk };
}

console.log("\n-- Paket lama tetap terbaca (migrasi lunak) --");
{
  const d = dunia(RABU);
  const siang = paketOf(d.st(), "siang")!;
  t("Paket Siang: kelas reguler", kelasPaket(siang), "regular");
  t("Paket Siang: berlaku dari jam buka", jamMulaiPaket(siang), 11);
  t("Paket Siang: selesai paling lambat 18.00 (mulai 16.00 + 2 jam)", jamSelesaiPaket(siang), 18);
  t("Paket Siang: mulai terakhir tetap 16.00", mulaiTerakhirPaket(siang), 16);
  t("Paket Siang: tanpa harga weekend → harga sama di Sabtu", hargaPaket(siang, SABTU(13)).price, 50_000);
  t("Paket Siang: bukan harga weekend", weekendPaket(siang, SABTU(13)), false);
  t("Paket Siang masih bisa dipakai hari Sabtu",
    paketProblem(d.st(), "siang", { kelas: "regular", hours: 2, startH: 13, startsAt: SABTU(13) }), null);

  // Kejadian savePaket BENTUK LAMA (lastStartHour) tetap diputar ulang apa adanya.
  d.push(RABU(12), { t: "savePaket", paket: {
    name: "Paket Lama", price: 90_000, hours: 3, freeDrinks: 1, lastStartHour: 20,
  } });
  const lama = d.pk("Paket Lama");
  t("bentuk lama tersimpan", !!lama, true);
  t("bentuk lama: lastStartHour 20", lama.lastStartHour, 20);
  t("bentuk lama: tanpa isian baru", [lama.kelas, lama.hari, lama.jamMulai, lama.jamSelesai, lama.weekend], [undefined, undefined, undefined, undefined, undefined]);
  t("bentuk lama masih sah bagi pemeriksa bentuk",
    validAction({ t: "savePaket", paket: { name: "x", price: 1, hours: 1, freeDrinks: 0, lastStartHour: 16 } }), true);
}

console.log("\n-- Paket Regular: harga & bonus ikut hari main --");
{
  const d = dunia(RABU);
  const reg = d.pk("Paket Regular");
  t("tersimpan dengan harga weekend", reg.weekend?.price, 55_000);
  t("lastStartHour diturunkan dari jam selesai − durasi", reg.lastStartHour, 16);
  t("Rabu = weekday", hargaPaket(reg, RABU(13)), { price: 50_000, freeDrinks: 0, isi: [{ itemId: AQUA, qty: 2 }], weekend: false });
  t("Sabtu = weekend", hargaPaket(reg, SABTU(13)), { price: 55_000, freeDrinks: 0, isi: [{ itemId: TEH, qty: 2 }], weekend: true });
  t("Minggu = weekend", hargaPaket(reg, dariWib(2026, 11, 15, 13)).weekend, true);
  t("Jumat = weekday", hargaPaket(reg, dariWib(2026, 11, 13, 20)).weekend, false);
  // Main jam 01.00 Sabtu dini hari masih HARI OPERASIONAL Jumat.
  t("Sabtu 01.00 dini hari = masih Jumat (weekday)", hargaPaket(reg, SABTU(1)).weekend, false);

  // Kasir membuka meja reguler hari RABU.
  d.push(RABU(13), { t: "walkin", tableId: "T05", guest: "Tamu Rabu", paketId: reg.id });
  const s1 = d.st().sessions.find((x) => x.tableId === "T05")!;
  t("Rabu: tagihan meja 50.000", s1?.tableAmount, 50_000);
  t("Rabu: isinya 2 Aqua (Rp 0)", s1?.fnb.map((l) => [l.itemId, l.qty, l.unitPrice]), [[AQUA, 2, 0]]);
}
{
  const d = dunia(SABTU);
  const reg = d.pk("Paket Regular");
  d.push(SABTU(13), { t: "walkin", tableId: "T05", guest: "Tamu Sabtu", paketId: reg.id });
  const s1 = d.st().sessions.find((x) => x.tableId === "T05")!;
  t("Sabtu: tagihan meja 55.000", s1?.tableAmount, 55_000);
  t("Sabtu: isinya 2 Ice Tea (Rp 0)", s1?.fnb.map((l) => [l.itemId, l.qty, l.unitPrice]), [[TEH, 2, 0]]);
}

console.log("\n-- Paket VIP hanya untuk meja VIP --");
{
  const d = dunia(RABU);
  const vip = d.pk("Paket VIP");
  t("kelas tersimpan", vip.kelas, "vip");
  t("meja reguler: ditolak dengan alasannya",
    paketProblem(d.st(), vip.id, { kelas: "regular", hours: 2, startH: 20, startsAt: RABU(20) }),
    "Paket VIP hanya untuk meja VIP");
  t("Paket Regular di meja VIP: ditolak",
    paketProblem(d.st(), d.pk("Paket Regular").id, { kelas: "vip", hours: 2, startH: 13, startsAt: RABU(13) }),
    "Paket Regular hanya untuk meja reguler");
  d.push(RABU(20), { t: "walkin", tableId: "T05", guest: "x", paketId: vip.id });
  t("mesin menolak buka meja reguler dengan Paket VIP",
    d.st().sessions.some((x) => x.tableId === "T05"), false);
  d.push(RABU(20, 1), { t: "walkin", tableId: "V01", guest: "Tamu VIP", paketId: vip.id });
  t("meja VIP 1 hari Rabu: 65.000",
    d.st().sessions.find((x) => x.tableId === "V01")?.tableAmount, 65_000);
  // V03 berkelas VVIP — bukan VIP.
  t("meja VVIP: ditolak",
    paketProblem(d.st(), vip.id, { kelas: "vvip", hours: 2, startH: 20, startsAt: RABU(20) }),
    "Paket VIP hanya untuk meja VIP");
}
{
  const d = dunia(SABTU);
  d.push(SABTU(20), { t: "walkin", tableId: "V02", guest: "Tamu VIP", paketId: d.pk("Paket VIP").id });
  t("meja VIP 2 hari Sabtu: 75.000",
    d.st().sessions.find((x) => x.tableId === "V02")?.tableAmount, 75_000);
}

console.log("\n-- Booking online: harga mengikuti TANGGAL MAIN --");
{
  // Dipesan hari Kamis untuk main hari Sabtu → harga weekend.
  const d = dunia(KAMIS);
  const reg = d.pk("Paket Regular");
  const sesi = {
    id: "ol-1", tableId: "T06", startsAt: SABTU(13), endsAt: SABTU(15),
    guest: "Tamu Online", fnb: [], paidOnline: 0, paket: reg.id,
  };
  t("bentuk hold dengan paket: sah", validAction({ t: "hold", session: sesi }), true);
  d.entries.push({ id: "h001", at: KAMIS(14), by: null, act: { t: "hold", session: sesi } as never });
  const hold = d.st().sessions.find((x) => x.id === "ol-1");
  t("ditahan", hold?.status, "hold");
  t("harga weekend walau dipesan hari Kamis", hold?.tableAmount, 55_000);

  const sesi2 = { ...sesi, id: "ol-2", tableId: "T07", startsAt: dariWib(2026, 11, 13, 13), endsAt: dariWib(2026, 11, 13, 15) };
  d.entries.push({ id: "h002", at: KAMIS(14, 1), by: null, act: { t: "hold", session: sesi2 } as never });
  t("main hari Jumat: harga weekday", d.st().sessions.find((x) => x.id === "ol-2")?.tableAmount, 50_000);
}

console.log("\n-- Hari aktif & rentang jam --");
{
  const d = dunia(RABU);
  d.push(RABU(12), { t: "savePaket", paket: {
    name: "Paket Kerja", price: 45_000, hours: 2, freeDrinks: 1,
    hari: [1, 2, 3, 4, 5], jamMulai: 13, jamSelesai: 17,
  } });
  const pk = d.pk("Paket Kerja");
  t("hari tersimpan Senin–Jumat", pk.hari, [1, 2, 3, 4, 5]);
  const cek = (ts: number, h: number) => paketProblem(d.st(), pk.id, { kelas: "regular", hours: 2, startH: h, startsAt: ts });
  t("Rabu 13.00: boleh", cek(RABU(13), 13), null);
  t("Rabu 15.00 (selesai 17.00): boleh", cek(RABU(15), 15), null);
  t("Rabu 12.00: sebelum jam mulai", cek(RABU(12), 12), "Paket Kerja berlaku 13.00–17.00 (mulai paling lambat 15.00)");
  t("Rabu 16.00: lewat (selesai 18.00 > 17.00)", cek(RABU(16), 16), "Paket Kerja berlaku 13.00–17.00 (mulai paling lambat 15.00)");
  t("Sabtu: tidak berlaku", cek(SABTU(13), 13), "Paket Kerja tidak berlaku hari Sabtu");
  t("booking online Sabtu juga ditolak",
    slotProblem(d.st(), { tableId: "T08", startsAt: SABTU(13), hours: 2, paket: pk.id }, KAMIS(12), true),
    "Paket Kerja tidak berlaku hari Sabtu");
  t("paket tanpa harga weekend tidak berubah di Sabtu", hargaPaket(pk, SABTU(13)).price, 45_000);

  // Hari weekend bisa diatur: Jumat–Minggu.
  d.push(RABU(12, 5), { t: "savePaket", paket: {
    name: "Paket Malam", price: 80_000, hours: 3, freeDrinks: 2, jamMulai: 18, jamSelesai: 26,
    hariWeekend: [5, 6, 0], weekend: { price: 95_000, freeDrinks: 3 },
  } });
  const mlm = d.pk("Paket Malam");
  t("Jumat malam ikut weekend bila diatur", hargaPaket(mlm, dariWib(2026, 11, 13, 20)), { price: 95_000, freeDrinks: 3, isi: [], weekend: true });
  t("Kamis tetap weekday", hargaPaket(mlm, KAMIS(20)).price, 80_000);
  t("mulai 23.00 (selesai 02.00): boleh",
    paketProblem(d.st(), mlm.id, { kelas: "regular", hours: 3, startH: 23, startsAt: RABU(23) }), null);
}

console.log("\n-- Ubah, nonaktifkan, aktifkan lagi, hapus --");
{
  const d = dunia(RABU);
  const reg = d.pk("Paket Regular");
  d.push(RABU(12), { t: "savePaket", paket: {
    id: reg.id, name: "Paket Regular", price: 52_000, hours: 2, freeDrinks: 0, isi: [{ itemId: AQUA, qty: 2 }],
    kelas: "regular", jamMulai: 11, jamSelesai: 18, weekend: null,
  } });
  const ubah = paketOf(d.st(), reg.id)!;
  t("diubah: harga baru", ubah.price, 52_000);
  t("diubah: harga weekend dihapus → sama tiap hari", hargaPaket(ubah, SABTU(13)).price, 52_000);
  t("tidak menambah paket baru", d.st().packages.filter((x) => x.name === "Paket Regular").length, 1);

  d.push(RABU(12, 5), { t: "removePaket", id: reg.id });
  t("nonaktif: hilang dari daftar jual", paketAktif(d.st()).some((x) => x.id === reg.id), false);
  t("nonaktif: masih tampil di panel (belum dihapus)", !!paketOf(d.st(), reg.id)?.dihapus, false);
  d.push(RABU(12, 6), { t: "aktifkanPaket", id: reg.id });
  t("aktif lagi", paketAktif(d.st()).some((x) => x.id === reg.id), true);

  // Meja dibuka dengan paketnya, LALU paketnya dihapus.
  d.push(RABU(13), { t: "walkin", tableId: "T09", guest: "x", paketId: reg.id });
  d.push(RABU(13, 30), { t: "removePaket", id: reg.id, hapus: true });
  const st = d.st();
  t("dihapus: tidak dijual", paketAktif(st).some((x) => x.id === reg.id), false);
  t("dihapus: ditandai, tidak dibuang", paketOf(st, reg.id)?.dihapus, true);
  t("bill lama tetap utuh", st.sessions.find((x) => x.tableId === "T09")?.tableAmount, 52_000);
  t("dihapus: tidak bisa dipakai",
    paketProblem(st, reg.id, { kelas: "regular", hours: 2, startH: 14, startsAt: RABU(14) }), "paket tidak tersedia");
  t("bentuk hapus sah", validAction({ t: "removePaket", id: "x", hapus: true }), true);
  t("bentuk aktifkan sah", validAction({ t: "aktifkanPaket", id: "x" }), true);
}

console.log("\n-- Isian yang tidak masuk akal ditolak --");
{
  const tolak = (label: string, paket: Record<string, unknown>) => {
    const d = dunia(RABU);
    const n = d.st().packages.length;
    d.push(RABU(12), { t: "savePaket", paket: {
      name: "Uji", price: 50_000, hours: 2, freeDrinks: 0, jamMulai: 11, jamSelesai: 18, ...paket,
    } as never });
    t(label, d.st().packages.length, n);
  };
  tolak("rentang lebih pendek dari durasi", { jamMulai: 16, jamSelesai: 17 });
  tolak("jam selesai lewat jam tutup 06.00", { jamSelesai: 31 });
  tolak("jam mulai sebelum jam buka", { jamMulai: 9 });
  tolak("tanpa hari aktif", { hari: [] });
  tolak("hari karangan", { hari: [7] });
  tolak("harga weekend negatif", { weekend: { price: -1, freeDrinks: 0 } });
  tolak("barang weekend karangan", { weekend: { price: 1, freeDrinks: 0, isi: [{ itemId: "hantu", qty: 1 }] } });
  tolak("hari weekend kosong", { hariWeekend: [], weekend: { price: 1, freeDrinks: 0 } });

  // Tujuh hari disimpan sebagai "tiap hari" (kosong) — paket yang sama, data lebih sederhana.
  const d = dunia(RABU);
  d.push(RABU(12), { t: "savePaket", paket: {
    name: "Tiap Hari", price: 1, hours: 1, freeDrinks: 0, jamMulai: 11, jamSelesai: 26, hari: [0, 1, 2, 3, 4, 5, 6],
  } });
  t("7 hari = tiap hari", d.pk("Tiap Hari").hari, undefined);
  // Paket Smokehouse tidak punya kelas meja.
  d.push(RABU(12, 1), { t: "savePaket", paket: {
    name: "Smh", price: 1, hours: 0, freeDrinks: 0, venue: "smh", kelas: "vip", jamMulai: 11, jamSelesai: 26,
  } });
  t("paket Smokehouse: kelas diabaikan", d.pk("Smh").kelas, undefined);
}

console.log("\n-- Paket ikut ringkasan publik untuk HP tamu --");
{
  const d = dunia(RABU);
  const pv = publicVenue(d.st(), RABU(12));
  const reg = pv.packages?.find((x) => x.name === "Paket Regular");
  t("paket buatan pemilik ikut diterbitkan", !!reg, true);
  t("harga weekend ikut", reg?.weekend?.price, 55_000);
  t("HP tamu menghitung harga Sabtu yang sama dengan mesin", reg && hargaPaket(reg, SABTU(13)).price, 55_000);
  t("kelas VIP ikut", pv.packages?.find((x) => x.name === "Paket VIP")?.kelas, "vip");
}

console.log(`\n${total - bad}/${total} lulus`);
if (bad) process.exit(1);
