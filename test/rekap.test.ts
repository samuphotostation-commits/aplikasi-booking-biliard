/* ═══════════════════════════════════════════════════════════════════
   REKAP 3 JENIS — BILLIARD · RESTO · BAR

   Bentuknya mengikuti struk "KAS KASIR SPL" yang dipakai pemilik tiap malam.
   Yang dijaga di sini bukan cuma angkanya, tapi dua hal yang dulu paling
   sering salah dibaca:

     1. "TOTAL OMZET" di kepala struk itu SEWA MEJA SAJA. Totalnya baru muncul
        sesudah barang ditambahkan. Dua angka itu tidak boleh tertukar.
     2. Barang yang sudah keluar tapi tabnya belum ditutup TIDAK boleh ikut
        dihitung sebagai penjualan — tempatnya di bagian "belum checkout".
   ═══════════════════════════════════════════════════════════════════ */
import {
  rekapTigaJenis, recap, replay, priceOf, kategoriJual, itemOf,
  paketAktif, paketOf, slotProblem, omzetPerShift, penjualanProduk, complimentOf,
  grupSesi, tagihanGrup, settlementOf, validAction, persenLini, LINI, statusVoidBaris,
  paketProblem, jamKejadian, MAKS_ANTRE_MS,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { findItem } from "../src/data/menu";
import { businessDateOf, dariWib, tanggalWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

/*
 * Hari dasar uji = HARI OPERASIONAL, bukan tanggal kalender.
 *
 * Hari operasional berganti pukul 05.00 (venue tutup 02.00). Antara 00.00
 * dan 05.00 tanggal kalender sudah maju sementara hari operasionalnya
 * belum -- dan harness yang memakai `tanggalWib` membangun dunianya di hari
 * berikutnya lalu bertanya ke mesin tentang hari ini. Hasilnya uji yang
 * hijau sepanjang siang dan merah tiap lewat tengah malam, di jam yang
 * justru masih jam kerja venue ini.
 */
const [Y, M, D] = businessDateOf(Date.now()).split("-").map(Number);
const jam = (h: number, m = 0) => dariWib(Y, M, D, h, m);
const harga = (id: string) => findItem(id)!.price;

const ROKOK = "bl-14";        // Marlboro Red \u00b7 counter biliar
const AQUA = "bl-03";         // Aqua \u00b7 counter biliar
const NASGOR = "fr-01";       // Nasi Goreng Telur \u00b7 dapur
const TEH = "cd-01";          // Ice Tea \u00b7 bar

function dunia(bukaShift = true) {
  const genesis: Genesis = { at: jam(5), seed: false };
  let n = 0;
  const entries: Entry[] = [];
  const push = (at: number, act: Action) =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by: "u-manager", act });
  // Aksi diurutkan mesin berdasarkan jamnya, jadi shift harus dibuka sebelum
  // jam paling awal yang dipakai tes — kalau tidak, aksinya ditolak diam-diam.
  if (bukaShift) push(jam(11), { t: "openShift", openingCash: 500_000 });
  return { genesis, entries, push };
}

/** Buka meja, pesan beberapa barang. Mengembalikan id sesinya. */
function bukaMeja(
  d: { genesis: Genesis; entries: Entry[]; push: (at: number, act: Action) => void },
  tableId: string, h: number, pesanan: [string, number][],
) {
  d.push(jam(h), { t: "walkin", tableId, guest: `Tamu ${tableId}` });
  const id = `w-${tableId}-${d.entries[d.entries.length - 1].id}-1`;
  pesanan.forEach(([itemId, qty], i) => {
    // Lewat `itemOf`, bukan `findItem`: barang tambahan pemilik tidak ada di
    // buku menu, dan tes harus memesannya persis seperti kasir sungguhan —
    // termasuk membekukan harga & nama di barisnya.
    const it = itemOf(replay(d.genesis, d.entries), itemId)!;
    d.push(jam(h, 5 + i), {
      t: "addFnb", sessionId: id, name: it.name, station: it.station,
      line: {
        key: `${tableId}-${itemId}`, itemId, qty,
        unitPrice: it.price, name: it.name, station: it.station,
      },
    });
  });
  return id;
}

console.log("-- Tiga jenis terpisah sesuai station barangnya --");
{
  const d = dunia();
  const id = bukaMeja(d, "T01", 18, [[ROKOK, 2], [AQUA, 3], [NASGOR, 1], [TEH, 2]]);
  d.push(jam(20), { t: "settle", id, channel: "cash" });
  const st = replay(d.genesis, d.entries);
  const r = rekapTigaJenis(st);

  t("rincian tersedia (hari belum tutup buku)", r.rincianTersedia, true);
  t("BILLIARD: 2 rokok + 3 aqua", r.totalBilliard, 2 * harga(ROKOK) + 3 * harga(AQUA));
  t("RESTO: 1 nasi goreng", r.totalResto, harga(NASGOR));
  t("BAR: 2 es teh", r.totalBar, 2 * harga(TEH));
  t("tiap jenis berisi barangnya sendiri",
    [r.billiard.length, r.resto.length, r.bar.length], [2, 1, 1]);
  t("qty terbawa benar", r.billiard.find((x) => x.itemId === ROKOK)?.qty, 2);
  t("total barang = jumlah ketiganya",
    r.totalBarang, r.totalBilliard + r.totalResto + r.totalBar);
}

console.log("\n-- Sewa meja dan total tidak boleh tertukar --");
{
  const d = dunia();
  const id = bukaMeja(d, "T01", 18, [[ROKOK, 1]]);
  d.push(jam(20), { t: "settle", id, channel: "cash" });
  const st = replay(d.genesis, d.entries);
  const r = rekapTigaJenis(st);

  t("sewa meja = angka biliar di rekap uang", r.sewaMeja, recap(st).billiard);
  t("sewa meja tidak nol (main 2 jam)", r.sewaMeja > 0, true);
  t("total semua = sewa meja + barang", r.totalSemua, r.sewaMeja + r.totalBarang);
  t("total semua lebih besar dari sewa meja saja", r.totalSemua > r.sewaMeja, true);
}

console.log("\n-- Tab yang belum ditutup: barangnya belum jadi penjualan --");
{
  const d = dunia();
  const ditutup = bukaMeja(d, "T01", 18, [[NASGOR, 1]]);
  d.push(jam(20), { t: "settle", id: ditutup, channel: "cash" });
  bukaMeja(d, "T02", 19, [[TEH, 4], [ROKOK, 1]]);   // sengaja tidak ditutup
  const r = rekapTigaJenis(replay(d.genesis, d.entries));

  t("yang belum ditutup tidak masuk BAR", r.totalBar, 0);
  t("yang belum ditutup tidak masuk BILLIARD", r.totalBilliard, 0);
  t("yang sudah ditutup tetap masuk RESTO", r.totalResto, harga(NASGOR));
  t("semua tercatat di bagian belum checkout",
    r.totalBelumCheckout, 4 * harga(TEH) + harga(ROKOK));
  t("belum checkout berisi 2 jenis barang", r.belumCheckout.length, 2);
}

console.log("\n-- Barang counter tidak membuat tiket dapur/bar --");
{
  const d = dunia();
  bukaMeja(d, "T01", 18, [[ROKOK, 2], [NASGOR, 1], [TEH, 1]]);
  const st = replay(d.genesis, d.entries);
  t("hanya 2 tiket: dapur + bar, rokok tidak ikut", st.tickets.length, 2);
  t("tidak ada tiket untuk rokok",
    st.tickets.some((x) => x.itemId === ROKOK), false);
  t("station tiket cuma dapur & bar",
    [...new Set(st.tickets.map((x) => x.station))].sort(), ["bar", "kitchen"]);
}

console.log("\n-- Pecahan per shift --");
{
  const d = dunia(false);
  d.push(jam(11), { t: "openShift", openingCash: 500_000 });
  const pagi = bukaMeja(d, "T01", 12, [[NASGOR, 1]]);   // venue buka jam 11
  d.push(jam(14), { t: "settle", id: pagi, channel: "cash" });
  d.push(jam(15), { t: "closeShift", countedCash: 0 });
  d.push(jam(15, 5), { t: "openShift", openingCash: 500_000 });
  const sore = bukaMeja(d, "T01", 18, [[TEH, 2]]);
  d.push(jam(20), { t: "settle", id: sore, channel: "cash" });
  const r = rekapTigaJenis(replay(d.genesis, d.entries));

  t("dua shift terbaca", r.shift.map((x) => x.nama), ["Shift Pagi", "Shift Sore"]);
  t("sewa meja terbagi ke dua shift",
    r.shift.every((x) => x.sewaMeja > 0), true);
  t("jumlah sewa meja per shift = sewa meja sehari",
    r.shift.reduce((n, x) => n + x.sewaMeja, 0), r.sewaMeja);
  t("barang ikut shift yang menutup tabnya",
    [r.shift[0].barang, r.shift[1].barang], [harga(NASGOR), 2 * harga(TEH)]);
}

console.log("\n-- Dua venue: rekapnya WAJIB terpisah --");
{
  const d = dunia();
  // SPL: meja biliar bermeteran + rokok counter.
  const spl = bukaMeja(d, "T01", 18, [[ROKOK, 2]]);
  d.push(jam(20), { t: "settle", id: spl, channel: "cash" });
  // Smokehouse: meja makan lantai 1, tanpa meteran, hanya makanan.
  const smh = bukaMeja(d, "S101", 18, [[NASGOR, 3]]);
  d.push(jam(20, 30), { t: "settle", id: smh, channel: "cash" });
  const st = replay(d.genesis, d.entries);

  const rSpl = rekapTigaJenis(st, undefined, "spl");
  const rSmh = rekapTigaJenis(st, undefined, "smh");
  const gab = rekapTigaJenis(st);

  t("meja Smokehouse memang bisa dibuka kasir",
    st.sessions.some((x) => x.tableId === "S101" && x.status === "done"), true);
  t("SPL hanya berisi barang SPL",
    [rSpl.totalBilliard, rSpl.totalResto], [2 * harga(ROKOK), 0]);
  t("Smokehouse hanya berisi barang Smokehouse",
    [rSmh.totalBilliard, rSmh.totalResto], [0, 3 * harga(NASGOR)]);
  t("meja makan tidak menagih sewa jam", rSmh.sewaMeja, 0);
  t("sewa meja hanya datang dari SPL", rSpl.sewaMeja > 0, true);
  t("gabungan = jumlah kedua venue", gab.totalBarang, rSpl.totalBarang + rSmh.totalBarang);
  t("gabungan sewa meja = sewa meja SPL", gab.sewaMeja, rSpl.sewaMeja);
  t("tidak ada venue yang bocor ke sebelah",
    rSpl.totalBarang + rSmh.totalBarang === gab.totalBarang && rSpl.totalBarang > 0 && rSmh.totalBarang > 0, true);
}

console.log("\n-- Pesanan tanpa meja ikut venue yang mencatatnya --");
{
  const d = dunia();
  const pesan = (kode: string, venue: "spl" | "smh", itemId: string, qty: number) => {
    d.push(jam(19), {
      t: "guestOrder",
      order: {
        id: `k-${kode}`, code: kode, guest: "Tamu counter", mode: "takeaway",
        pay: "kasir", paidOnline: 0, venue,
        lines: [{ key: `l-${kode}`, itemId, qty }],
      },
    });
    d.push(jam(19, 30), { t: "settleOrder", id: `k-${kode}`, channel: "cash" });
  };
  pesan("SPL-AAA111", "spl", ROKOK, 1);
  pesan("SPL-BBB222", "smh", NASGOR, 2);
  const st = replay(d.genesis, d.entries);

  t("pesanan counter SPL masuk rekap SPL",
    rekapTigaJenis(st, undefined, "spl").totalBilliard, harga(ROKOK));
  t("pesanan counter Smokehouse masuk rekap Smokehouse",
    rekapTigaJenis(st, undefined, "smh").totalResto, 2 * harga(NASGOR));
  t("tidak saling bocor", [
    rekapTigaJenis(st, undefined, "spl").totalResto,
    rekapTigaJenis(st, undefined, "smh").totalBilliard,
  ], [0, 0]);
}

console.log("\n-- Menu tambahan pemilik: bisa dijual, dan namanya tidak pernah hilang --");
{
  const d = dunia();
  d.push(jam(12), { t: "saveMenuItem", item: { name: "Nasi Kotak Rapat", price: 45_000, station: "kitchen" } });
  const st1 = replay(d.genesis, d.entries);
  const baru = st1.customItems[0];
  t("barang baru tercatat di jejak",
    [st1.customItems.length, baru?.name, baru?.price], [1, "Nasi Kotak Rapat", 45_000]);
  t("harganya terbaca lewat jalur harga biasa", priceOf(st1, baru.id), 45_000);
  t("ikut daftar jual kasir",
    kategoriJual(st1, { staf: true }).flatMap((c) => c.items).some((i) => i.id === baru.id), true);

  // Dijual 2 porsi lewat jalur nyata.
  const sesi = bukaMeja(d, "T01", 18, [[baru.id, 2]]);
  d.push(jam(20), { t: "settle", id: sesi, channel: "cash" });
  const st2 = replay(d.genesis, d.entries);
  const r = rekapTigaJenis(st2, undefined, "spl");
  t("masuk rekap RESTO (station dapur), bukan jadi nol",
    r.totalResto, 2 * 45_000);
  t("namanya muncul di rekap, bukan kodenya",
    r.resto.find((x) => x.itemId === baru.id)?.nama, "Nasi Kotak Rapat");

  // Dinonaktifkan: hilang dari daftar jual, TAPI riwayatnya tetap bernama.
  d.push(jam(21), { t: "removeMenuItem", id: baru.id });
  const st3 = replay(d.genesis, d.entries);
  t("tidak muncul lagi saat memesan",
    kategoriJual(st3, { staf: true }).flatMap((c) => c.items).some((i) => i.id === baru.id), false);
  t("riwayat penjualannya TETAP bernama",
    rekapTigaJenis(st3, undefined, "spl").resto.find((x) => x.itemId === baru.id)?.nama,
    "Nasi Kotak Rapat");
  t("nilainya tidak berubah setelah dinonaktifkan",
    rekapTigaJenis(st3, undefined, "spl").totalResto, 2 * 45_000);
}

console.log("\n-- Barang counter tambahan tidak membuat tiket & tidak dijual lewat HP --");
{
  const d = dunia();
  d.push(jam(12), { t: "saveMenuItem", item: { name: "Korek Api", price: 3_000, station: "billiard" } });
  const korek = replay(d.genesis, d.entries).customItems[0];
  bukaMeja(d, "T01", 18, [[korek.id, 1]]);
  const st = replay(d.genesis, d.entries);
  t("tidak ada tiket untuk barang counter",
    st.tickets.some((x) => x.itemId === korek.id), false);
  t("tetap masuk bill", st.sessions.find((x) => x.tableId === "T01")?.fnb?.length, 1);
  t("ADA di daftar kasir",
    kategoriJual(st, { staf: true }).flatMap((c) => c.items).some((i) => i.id === korek.id), true);
  // Aturan umur: barang counter tidak boleh dipesan lewat HP tanpa ada yang
  // memeriksa pembelinya — berlaku juga untuk barang counter yang ditambah
  // pemilik sendiri, bukan cuma kategori bawaan.
  t("TIDAK ikut menu HP pelanggan",
    kategoriJual(st).flatMap((c) => c.items).some((i) => i.id === korek.id), false);
}

console.log("\n-- Paket meja bisa ditambah pemilik, syaratnya tetap dijaga mesin --");
{
  const d = dunia();
  d.push(jam(12), { t: "savePaket", paket: {
    name: "Paket Malam", price: 90_000, hours: 3, freeDrinks: 1, lastStartHour: 20,
  } });
  const st = replay(d.genesis, d.entries);
  const pk = st.packages.find((x) => x.name === "Paket Malam")!;

  t("paket bawaan tetap ada", st.packages.some((x) => x.id === "siang"), true);
  t("paket baru tersimpan",
    [pk?.price, pk?.hours, pk?.freeDrinks, pk?.lastStartHour], [90_000, 3, 1, 20]);
  t("perks dibuatkan otomatis", pk?.perks, ["Main 3 jam", "Gratis 1 minuman"]);
  t("ikut daftar paket aktif", paketAktif(st).some((x) => x.id === pk.id), true);

  // Syaratnya ditegakkan MESIN, bukan cuma disembunyikan layar.
  const slot = (paket: string | undefined, hours: number, mulai: number) =>
    slotProblem(st, { tableId: "T05", startsAt: jam(mulai) + 86_400_000, hours, paket },
      jam(12), false);
  t("durasi sesuai paket: diterima", slot(pk.id, 3, 18), null);
  // Alasannya SEBUTKAN apa yang salah, bukan "syarat tidak terpenuhi": tamu
  // yang ditolak tanpa alasan akan mencoba lagi dengan pilihan yang sama.
  t("durasi beda: ditolak dan disebutkan lamanya",
    slot(pk.id, 2, 18), "Paket Malam lamanya 3 jam");
  t("mulai lewat batas: ditolak dan disebutkan batasnya",
    slot(pk.id, 3, 21), "Paket Malam paling lambat mulai jam 20.00");
  t("paket karangan: ditolak", slot("paket-hantu", 3, 18), "paket tidak tersedia");

  // Dinonaktifkan: tidak bisa dipesan lagi, TAPI sesi lama tetap terbaca.
  d.push(jam(13), { t: "removePaket", id: pk.id });
  const st2 = replay(d.genesis, d.entries);
  t("hilang dari daftar aktif", paketAktif(st2).some((x) => x.id === pk.id), false);
  t("tidak bisa dipesan lagi",
    slotProblem(st2, { tableId: "T05", startsAt: jam(18) + 86_400_000, hours: 3, paket: pk.id },
      jam(13), false), "paket tidak tersedia");
  t("harganya MASIH terbaca untuk sesi lama", paketOf(st2, pk.id)?.price, 90_000);
  t("paket bawaan tidak ikut mati", paketAktif(st2).some((x) => x.id === "siang"), true);
}

console.log("\n-- Angka paket yang tidak masuk akal ditolak --");
{
  const d = dunia();
  const tolak = (nama: string, p: Record<string, number | string>) => {
    d.push(jam(12), { t: "savePaket", paket: {
      name: nama, price: 50_000, hours: 2, freeDrinks: 0, lastStartHour: 16, ...p,
    } as never });
    return replay(d.genesis, d.entries).packages.some((x) => x.name === nama);
  };
  t("durasi 0 jam ditolak", tolak("Nol", { hours: 0 }), false);
  t("durasi 9 jam ditolak", tolak("Sembilan", { hours: 9 }), false);
  t("jam mulai di luar jam buka ditolak", tolak("Subuh", { lastStartHour: 5 }), false);
  t("nama kosong ditolak", tolak("", { name: "   " }), false);
  t("yang wajar diterima", tolak("Wajar", {}), true);
}


console.log("\n-- SMH-11b · Compliment: tagihan turun, nilainya TIDAK hilang --");
{
  const d = dunia();
  const id = bukaMeja(d, "T02", 18, [[NASGOR, 2], [TEH, 1]]);
  const nilaiNasgor = 2 * harga(NASGOR);
  d.push(jam(19), { t: "compliment", sessionId: id, key: `T02-${NASGOR}`, alasan: "tamu lama menunggu" });
  const st = replay(d.genesis, d.entries);
  const sesi = st.sessions.find((x) => x.id === id)!;
  const brs = sesi.fnb.find((l) => l.itemId === NASGOR)!;

  t("baris jadi gratis", brs.unitPrice, 0);
  t("harga aslinya disimpan di barisnya", brs.comp, nilaiNasgor);
  t("qty tidak berubah (barangnya memang keluar)", brs.qty, 2);
  t("nilai compliment tab dihitung dari barisnya", complimentOf(sesi), nilaiNasgor);

  d.push(jam(20), { t: "settle", id, channel: "cash" });
  const st2 = replay(d.genesis, d.entries);
  const r = recap(st2);
  t("omzet hanya sisa yang dibayar", r.fnb, harga(TEH));
  t("uang diterima = omzet (uang tetap berimbang)", r.gross, r.diterima + r.prabayar);
  t("compliment dilaporkan sebagai barisnya sendiri", r.compliment, nilaiNasgor);
  t("compliment BUKAN diskon", r.discount, 0);

  // Dua kali compliment di baris yang sama tidak menggandakan nilainya.
  const d2 = dunia();
  const id2 = bukaMeja(d2, "T03", 18, [[NASGOR, 1]]);
  d2.push(jam(19), { t: "compliment", sessionId: id2, key: `T03-${NASGOR}` });
  d2.push(jam(19, 5), { t: "compliment", sessionId: id2, key: `T03-${NASGOR}` });
  t("compliment dua kali tidak menggandakan",
    complimentOf(replay(d2.genesis, d2.entries).sessions.find((x) => x.id === id2)!), harga(NASGOR));
}

console.log("\n-- SMH-11b · Compliment hanya untuk yang berhak & yang belum dibayar --");
{
  // Kasir biasa tidak punya izin `beriDiskonManual`.
  const d = dunia();
  const id = bukaMeja(d, "T04", 18, [[NASGOR, 1]]);
  d.entries.push({ id: "z001", at: jam(19), by: "u-rian", act: { t: "compliment", sessionId: id, key: `T04-${NASGOR}` } });
  t("kru lantai tidak bisa memberi compliment",
    complimentOf(replay(d.genesis, d.entries).sessions.find((x) => x.id === id)!), 0);

  // Yang sudah dibayar lewat split bill tidak bisa digratiskan — itu refund.
  const d2 = dunia();
  const id2 = bukaMeja(d2, "T05", 18, [[NASGOR, 1], [TEH, 1]]);
  d2.push(jam(19), { t: "paySplit", id: id2, channel: "cash", keys: [`T05-${NASGOR}`] });
  d2.push(jam(19, 30), { t: "compliment", sessionId: id2, key: `T05-${NASGOR}` });
  const st2 = replay(d2.genesis, d2.entries);
  t("baris yang sudah dibayar tidak bisa digratiskan",
    complimentOf(st2.sessions.find((x) => x.id === id2)!), 0);
}

console.log("\n-- SMH-11b · Diskon manual (%) --");
{
  const d = dunia();
  const id = bukaMeja(d, "T06", 18, [[NASGOR, 2]]);
  d.push(jam(20), { t: "settle", id, channel: "cash", diskonPersen: 10 });
  const st = replay(d.genesis, d.entries);
  const s = st.sessions.find((x) => x.id === id)!;
  const tagihanKotor = (s.settledBilliard ?? 0) + (s.settledFnb ?? 0);

  t("diskon 10% dari tagihan kasir", s.settledDiscount, Math.floor(tagihanKotor * 0.1));
  t("dicatat sebagai diskon MANUAL", s.settledDiskonManual, s.settledDiscount);
  const r = recap(st);
  t("rekap memisahkan diskon manual", r.diskonManual, s.settledDiscount);
  t("lini usaha tetap menjumlah ke omzet", r.billiard + r.fnb - r.discount, r.gross);
  t("omzet = uang diterima", r.gross, r.diterima + r.prabayar);

  // Di luar 0-100 dan tanpa izin: tidak terjadi apa-apa.
  const d2 = dunia();
  const id2 = bukaMeja(d2, "T07", 18, [[NASGOR, 1]]);
  d2.push(jam(20), { t: "settle", id: id2, channel: "cash", diskonPersen: 500 });
  const sA = replay(d2.genesis, d2.entries).sessions.find((x) => x.id === id2)!;
  t("diskon >100% tidak membuat tagihan negatif", sA.settledAmount! >= 0, true);

  const d3 = dunia();
  const id3 = bukaMeja(d3, "T08", 18, [[NASGOR, 1]]);
  d3.entries.push({ id: "z002", at: jam(20), by: "u-rian", act: { t: "settle", id: id3, channel: "cash", diskonPersen: 50 } });
  const sB = replay(d3.genesis, d3.entries).sessions.find((x) => x.id === id3)!;
  t("kru lantai tidak bisa memberi diskon manual", sB.settledDiscount, 0);
  t("tapi tabnya tetap tertutup (tamu sudah di kasir)", sB.status, "done");
}

console.log("\n-- SMH-14 · Omzet per shift (pagi/sore/ALL) --");
{
  const d = dunia();                                  // shift pagi dibuka 11.00
  const pagi = bukaMeja(d, "T09", 12, [[NASGOR, 1]]);
  d.push(jam(14), { t: "settle", id: pagi, channel: "cash" });
  d.push(jam(16), { t: "closeShift", countedCash: 0 });
  d.push(jam(16, 5), { t: "openShift", openingCash: 300_000 });
  const sore = bukaMeja(d, "T10", 18, [[TEH, 2]]);
  d.push(jam(21), { t: "settle", id: sore, channel: "edc" });

  const st = replay(d.genesis, d.entries);
  const o = omzetPerShift(st);
  const r = recap(st);

  t("dua shift terbaca", o.shift.map((x) => x.nama), ["Shift Pagi", "Shift Sore"]);
  t("tidak ada uang yang kehilangan shift", o.tanpaShift, null);
  t("shift pagi: tunai saja", [o.shift[0].tunai > 0, o.shift[0].edc], [true, 0]);
  t("shift sore: EDC saja", [o.shift[1].edc > 0, o.shift[1].tunai], [true, 0]);
  t("ALL = jumlah shift",
    o.semua.diterima, o.shift[0].diterima + o.shift[1].diterima);
  t("ALL sama dengan rekap harian", o.semua.diterima, r.diterima);
  t("pecahan kanal menjumlah ke diterima",
    o.semua.tunai + o.semua.qris + o.semua.edc, o.semua.diterima);
  t("barang shift pagi = nasi goreng", o.shift[0].barang, harga(NASGOR));
  t("barang shift sore = 2 ice tea", o.shift[1].barang, 2 * harga(TEH));
}

console.log("\n-- SMH-14 · Split bill lintas shift ikut shift penerimanya --");
{
  const d = dunia();
  const id = bukaMeja(d, "T11", 12, [[NASGOR, 1], [TEH, 1]]);
  // Satu orang bayar di shift pagi, sisanya ditutup di shift sore.
  d.push(jam(13), { t: "paySplit", id, channel: "cash", keys: [`T11-${NASGOR}`] });
  d.push(jam(16), { t: "closeShift", countedCash: 0 });
  d.push(jam(16, 5), { t: "openShift", openingCash: 0 });
  d.push(jam(17), { t: "settle", id, channel: "qris_online" });

  const st = replay(d.genesis, d.entries);
  const o = omzetPerShift(st);
  t("tunai tercatat di shift PAGI", o.shift[0].tunai, harga(NASGOR));
  t("sisanya QRIS di shift SORE", o.shift[1].qris > 0, true);
  t("pagi tidak kecipratan QRIS", o.shift[0].qris, 0);
  t("ALL = rekap harian", o.semua.diterima, recap(st).diterima);
}

console.log("\n-- SPL-11 · Laporan penjualan per produk --");
{
  const d = dunia();
  const a1 = bukaMeja(d, "T12", 18, [[NASGOR, 2], [TEH, 1]]);
  d.push(jam(20), { t: "settle", id: a1, channel: "cash" });
  const a2 = bukaMeja(d, "T13", 18, [[NASGOR, 1]]);
  d.push(jam(20, 30), { t: "settle", id: a2, channel: "edc" });

  const st = replay(d.genesis, d.entries);
  const hari = tanggalWib(jam(18));
  const lp = penjualanProduk(st, hari, hari);
  const nasgor = lp.baris.find((b) => b.itemId === NASGOR)!;

  t("qty digabung dari dua meja", nasgor.qty, 3);
  t("nilainya dijumlah", nasgor.total, 3 * harga(NASGOR));
  t("pecahan kanal tepat: 2 tunai, 1 EDC",
    [nasgor.tunai, nasgor.edc], [2 * harga(NASGOR), harga(NASGOR)]);
  t("tidak ada yang masuk 'lain'", lp.perKanal.lain, 0);
  t("urutan: terlaris dulu", lp.baris[0].itemId, NASGOR);
  t("semua hari ada rinciannya", lp.hariTanpaRincian, []);
  t("pecahan kanal menjumlah ke total",
    lp.perKanal.tunai + lp.perKanal.qris + lp.perKanal.edc + lp.perKanal.prabayar + lp.perKanal.lain,
    lp.total);
  // Jumlah seluruh produk HARUS sama dengan nilai barang di rekap tiga jenis.
  t("total produk = total barang rekap", lp.total, rekapTigaJenis(st).totalBarang);
}

console.log("\n-- SPL-11 · Compliment muncul sebagai barang keluar bernilai nol --");
{
  const d = dunia();
  const id = bukaMeja(d, "T14", 18, [[NASGOR, 1], [TEH, 2]]);
  d.push(jam(19), { t: "compliment", sessionId: id, key: `T14-${TEH}` });
  d.push(jam(20), { t: "settle", id, channel: "cash" });
  const st = replay(d.genesis, d.entries);
  const hari = tanggalWib(jam(18));
  const lp = penjualanProduk(st, hari, hari);
  const teh = lp.baris.find((b) => b.itemId === TEH)!;

  t("qty tetap tercatat", teh.qty, 2);
  t("uangnya nol", teh.total, 0);
  t("nilai yang digratiskan tercatat", teh.comp, 2 * harga(TEH));
  t("laporan menjumlah compliment", lp.comp, 2 * harga(TEH));
}

console.log("\n-- SPL-11 · Venue dipisah, dan rentang lebih dari sehari --");
{
  const d = dunia();
  const spl = bukaMeja(d, "T15", 18, [[NASGOR, 1]]);
  d.push(jam(20), { t: "settle", id: spl, channel: "cash" });
  const smh = bukaMeja(d, "S101", 18, [[TEH, 3]]);
  d.push(jam(20, 30), { t: "settle", id: smh, channel: "cash" });

  const st = replay(d.genesis, d.entries);
  const hari = tanggalWib(jam(18));
  const semua = penjualanProduk(st, hari, hari);
  const hanyaSpl = penjualanProduk(st, hari, hari, "spl");
  const hanyaSmh = penjualanProduk(st, hari, hari, "smh");

  t("gabungan memuat keduanya", semua.baris.length, 2);
  t("SPL hanya nasi goreng", hanyaSpl.baris.map((b) => b.itemId), [NASGOR]);
  t("Smokehouse hanya ice tea", hanyaSmh.baris.map((b) => b.itemId), [TEH]);
  t("venue tertulis di barisnya", hanyaSmh.baris[0].venue, "smh");
  t("jumlah dua venue = gabungan", hanyaSpl.total + hanyaSmh.total, semua.total);

  // Rentang yang memuat hari tanpa transaksi tidak menambah apa pun.
  const lebar = penjualanProduk(st, tanggalWib(jam(18) - 2 * 86_400_000), hari);
  t("hari kosong tidak mengubah angka", lebar.total, semua.total);
}


console.log("\n-- SMH-4 · Gabung meja: satu bill, dua tab tetap tercatat --");
{
  const d = dunia();
  const a1 = bukaMeja(d, "S101", 18, [[NASGOR, 1]]);
  const a2 = bukaMeja(d, "S102", 18, [[TEH, 2]]);
  d.push(jam(19), { t: "gabungMeja", ids: [a1, a2] });
  const st = replay(d.genesis, d.entries);
  const s1 = st.sessions.find((x) => x.id === a1)!;
  const s2 = st.sessions.find((x) => x.id === a2)!;

  t("keduanya bertanda grup yang sama", [!!s1.grup, s1.grup === s2.grup], [true, true]);
  t("anggota grup terbaca dari salah satu meja", grupSesi(st, a1).map((x) => x.id).sort(), [a1, a2].sort());
  t("tagihan grup = jumlah tagihan tiap meja",
    tagihanGrup(st, a1, jam(19)),
    settlementOf(s1, st, jam(19)).due + settlementOf(s2, st, jam(19)).due);
  // Yang TIDAK terjadi: uang berpindah meja.
  t("pesanan tetap di mejanya masing-masing",
    [s1.fnb.length, s2.fnb.length, s1.fnb[0].itemId, s2.fnb[0].itemId],
    [1, 1, NASGOR, TEH]);

  // Tutup keduanya seperti kasir: satu kanal, dua aksi.
  d.push(jam(20), { t: "settle", id: a1, channel: "cash" });
  d.push(jam(20), { t: "settle", id: a2, channel: "cash" });
  const st2 = replay(d.genesis, d.entries);
  const r = recap(st2);
  t("dua tab tetap tercatat sendiri-sendiri", r.counts.done, 2);
  t("uang tetap berimbang", r.gross, r.diterima + r.prabayar);
  t("penanda grup dilepas saat tab ditutup",
    st2.sessions.filter((x) => (x.id === a1 || x.id === a2) && x.grup).length, 0);
}

console.log("\n-- SMH-4 · Gabungan yang tidak masuk akal ditolak --");
{
  const d = dunia();
  const spl = bukaMeja(d, "T20", 18, [[NASGOR, 1]]);
  const smh = bukaMeja(d, "S103", 18, [[TEH, 1]]);
  // Lintas venue: rekapnya wajib terpisah, jadi satu bill lintas venue ditolak.
  d.push(jam(19), { t: "gabungMeja", ids: [spl, smh] });
  t("lintas venue ditolak",
    replay(d.genesis, d.entries).sessions.find((x) => x.id === spl)!.grup, undefined);

  // Meja yang sama dua kali bukan gabungan.
  d.push(jam(19, 5), { t: "gabungMeja", ids: [spl, spl] });
  t("meja yang sama dua kali ditolak",
    replay(d.genesis, d.entries).sessions.find((x) => x.id === spl)!.grup, undefined);

  // Tab yang sudah ditutup tidak bisa digabung.
  const d2 = dunia();
  const x1 = bukaMeja(d2, "S104", 18, [[TEH, 1]]);
  const x2 = bukaMeja(d2, "S105", 18, [[TEH, 1]]);
  d2.push(jam(19), { t: "settle", id: x2, channel: "cash" });
  d2.push(jam(19, 30), { t: "gabungMeja", ids: [x1, x2] });
  t("tab yang sudah ditutup ditolak",
    replay(d2.genesis, d2.entries).sessions.find((x) => x.id === x1)!.grup, undefined);

  // Kru lantai boleh menggabung (izin `bukaMeja`), finance tidak.
  // Pelakunya kasir SMOKEHOUSE (u-dewi): mejanya S106 & S107, dan sejak akun
  // staf terikat venue (12 Okt 2026) kasir SPL memang tidak boleh menyentuh
  // meja makan — dulu baris ini memakai u-rian dan ikut lulus hanya karena
  // belum ada pagarnya.
  const d3 = dunia();
  const y1 = bukaMeja(d3, "S106", 18, [[TEH, 1]]);
  const y2 = bukaMeja(d3, "S107", 18, [[TEH, 1]]);
  d3.entries.push({ id: "z010", at: jam(19), by: "u-dewi", act: { t: "gabungMeja", ids: [y1, y2] } });
  t("kru lantai boleh menggabung",
    !!replay(d3.genesis, d3.entries).sessions.find((x) => x.id === y1)!.grup, true);
}

console.log("\n-- SMH-4 · Dua gabungan tidak digabung lagi, dan bisa dipisah --");
{
  const d = dunia();
  const p1 = bukaMeja(d, "S108", 18, [[TEH, 1]]);
  const p2 = bukaMeja(d, "S109", 18, [[TEH, 1]]);
  const q1 = bukaMeja(d, "S110", 18, [[TEH, 1]]);
  const q2 = bukaMeja(d, "S111", 18, [[TEH, 1]]);
  d.push(jam(19), { t: "gabungMeja", ids: [p1, p2] });
  d.push(jam(19, 1), { t: "gabungMeja", ids: [q1, q2] });
  d.push(jam(19, 2), { t: "gabungMeja", ids: [p1, q1] });
  const st = replay(d.genesis, d.entries);
  t("dua gabungan berbeda tidak digabung lagi",
    st.sessions.find((x) => x.id === p1)!.grup !== st.sessions.find((x) => x.id === q1)!.grup, true);

  // Meja ketiga ikut ke gabungan yang sudah ada.
  const r3 = bukaMeja(d, "S112", 18, [[TEH, 1]]);
  d.push(jam(19, 3), { t: "gabungMeja", ids: [p1, r3] });
  const st2 = replay(d.genesis, d.entries);
  t("meja ketiga ikut gabungan yang sudah ada", grupSesi(st2, p1).length, 3);

  // Dilepas satu: sisa dua, masih gabungan.
  d.push(jam(19, 4), { t: "pisahMeja", id: r3 });
  const st3 = replay(d.genesis, d.entries);
  t("yang dilepas tidak bergrup lagi", st3.sessions.find((x) => x.id === r3)!.grup, undefined);
  t("sisanya masih gabungan", grupSesi(st3, p1).length, 2);

  // Dilepas lagi: sisa satu, penandanya ikut dilepas — satu meja bukan gabungan.
  d.push(jam(19, 5), { t: "pisahMeja", id: p2 });
  const st4 = replay(d.genesis, d.entries);
  t("gabungan bersisa satu ikut dilepas",
    [st4.sessions.find((x) => x.id === p1)!.grup, st4.sessions.find((x) => x.id === p2)!.grup],
    [undefined, undefined]);
}


console.log("\n-- SPL-4 · Paket buatan pemilik bisa dibooking online --");
{
  const d = dunia();
  d.push(jam(12), { t: "savePaket", paket: {
    name: "Paket Ultah", price: 150_000, hours: 3, freeDrinks: 4, lastStartHour: 20,
  } });
  const pk = replay(d.genesis, d.entries).packages.find((x) => x.name === "Paket Ultah")!;

  // Bentuk kejadiannya HARUS dianggap sah. Sebelum perbaikan, pemeriksa
  // bentuk masih mematok "siang", jadi seluruh kejadiannya dibuang sebelum
  // sampai ke reducer — tamu cuma melihat slotnya gagal ditahan.
  const besok = jam(18) + 86_400_000;
  const sesi = {
    id: "ol-1", tableId: "T06", startsAt: besok, endsAt: besok + 3 * 3_600_000,
    guest: "Tamu Ultah", fnb: [], paidOnline: 0, paket: pk.id,
  };
  t("bentuk kejadian hold dengan paket pemilik: SAH", validAction({ t: "hold", session: sesi }), true);
  t("paket karangan juga sah BENTUKNYA (ditolak reducer, bukan dibuang)",
    validAction({ t: "hold", session: { ...sesi, paket: "paket-hantu" } }), true);

  // Dan benar-benar jadi: slotnya ditahan dengan harga paketnya.
  d.entries.push({ id: "h001", at: jam(13), by: null, act: { t: "hold", session: sesi } as never });
  const st = replay(d.genesis, d.entries);
  const hold = st.sessions.find((x) => x.id === "ol-1");
  t("slot ditahan", hold?.status, "hold");
  t("harganya harga paket, bukan tarif per jam", hold?.tableAmount, 150_000);
  t("jatah minuman gratis ikut paketnya", hold?.freeDrinks, 4);

  // Paket yang tidak ada tetap ditolak — di reducer, dengan alasan yang jelas.
  d.entries.push({ id: "h002", at: jam(13, 5), by: null,
    act: { t: "hold", session: { ...sesi, id: "ol-2", tableId: "T07", paket: "paket-hantu" } } as never });
  t("paket karangan ditolak reducer",
    replay(d.genesis, d.entries).sessions.some((x) => x.id === "ol-2"), false);
}

console.log("\n-- PPN & service per lini usaha (18 Okt 2026) --");
{
  /* Pemilik minta PPN & service bisa disetel terpisah untuk Meja Billiard,
     Bar, dan Resto. Yang dijaga di sini ADA DUA, dan yang kedua jauh lebih
     penting daripada yang pertama:

       1. Persennya memang dipakai per lini.
       2. Mengubah persen TIDAK MENGGESER SATU RUPIAH PUN yang ditagih —
          harga sudah termasuk pajak, jadi yang berubah cuma pemecahan
          laporannya. Itu INV-53, dan sekarang harus tetap berlaku walau
          tiap lini punya angkanya sendiri. */
  const d = dunia();
  // T01 meja biliar: sewa meja + nasi goreng (resto) + es teh (bar).
  const id = bukaMeja(d, "T01", 18, [[NASGOR, 1], [TEH, 2]]);
  d.push(jam(20), { t: "settle", id, channel: "cash" });

  const sebelum = replay(d.genesis, d.entries);
  const rSebelum = recap(sebelum);
  const sesi = sebelum.sessions.find((x) => x.id === id)!;

  t("pecahan lini tersimpan saat tutup tab", !!sesi.settledLini, true);
  t("makanan masuk lini resto", sesi.settledLini?.resto, harga(NASGOR));
  t("minuman masuk lini bar", sesi.settledLini?.bar, harga(TEH) * 2);
  t("sewa meja masuk lini biliar", sesi.settledLini?.biliar, sesi.settledBilliard);
  t("jumlah ketiga lini = seluruh transaksi",
    (sesi.settledLini!.biliar + sesi.settledLini!.bar + sesi.settledLini!.resto),
    (sesi.settledBilliard ?? 0) + (sesi.settledFnb ?? 0));

  t("rekap memecah per lini", !!rSebelum.perLini, true);
  t("jumlah omzet per lini = omzet",
    LINI.reduce((n, k) => n + rSebelum.perLini![k].gross, 0), rSebelum.gross);
  t("DPP + PPN + service = omzet",
    rSebelum.dpp + rSebelum.tax + (rSebelum.service ?? 0), rSebelum.gross);

  // Sekarang PPN resto dinaikkan jadi 11%, bar 0%.
  d.push(jam(21), { t: "setPajakLini", lini: "resto", key: "ppn", value: 11 });
  d.push(jam(21), { t: "setPajakLini", lini: "bar", key: "ppn", value: 0 });
  const sesudah = replay(d.genesis, d.entries);
  const rSesudah = recap(sesudah);

  t("persen resto tersimpan", persenLini(sesudah, "resto").ppn, 11);
  t("persen bar tersimpan", persenLini(sesudah, "bar").ppn, 0);
  t("persen biliar tidak ikut berubah", persenLini(sesudah, "biliar").ppn, 10);

  // INTI: uangnya tidak bergerak.
  t("omzet TIDAK berubah", rSesudah.gross, rSebelum.gross);
  t("yang diterima TIDAK berubah", rSesudah.diterima, rSebelum.diterima);
  t("tagihan tamu TIDAK berubah", sesudah.sessions.find((x) => x.id === id)?.settledAmount,
    sesi.settledAmount);
  // Yang berubah hanya pemecahannya.
  t("PPN total ikut berubah", rSesudah.tax !== rSebelum.tax, true);
  t("DPP + PPN + service tetap = omzet",
    rSesudah.dpp + rSesudah.tax + (rSesudah.service ?? 0), rSesudah.gross);
  t("bar 0% berarti PPN bar nol", rSesudah.perLini!.bar.tax, 0);
  t("dan DPP bar = omzet bar", rSesudah.perLini!.bar.dpp, rSesudah.perLini!.bar.gross);
}

console.log("\n-- Tutup buku membekukan pecahan lini --");
{
  /* Arsip melepas baris pesanannya untuk menjaga ukuran data. Kalau pecahan
     lininya tidak ikut dibekukan, pajak per lini hari lampau tidak bisa
     dihitung lagi — dan laporan pajak bulan lalu berubah angkanya tiap kali
     persennya disetel ulang. */
  const d = dunia();
  const id = bukaMeja(d, "T02", 18, [[NASGOR, 2]]);
  d.push(jam(20), { t: "settle", id, channel: "cash" });
  // Tutup buku baru jalan kalau shiftnya sudah ditutup DAN harinya sudah
  // lewat lebih dari sehari — selama masih bisa disentuh, angkanya belum beku.
  d.push(jam(22), { t: "closeShift", countedCash: 0 });
  d.push(jam(24 * 2 + 6), { t: "tick" });

  const st = replay(d.genesis, d.entries);
  const arsip = st.history[0];
  t("harinya diarsipkan", !!arsip, true);
  t("pecahan lini ikut beku", !!arsip?.money.perLini, true);
  t("omzet resto beku benar", arsip?.money.perLini?.resto.gross, harga(NASGOR) * 2);
  t("jumlah lini beku = omzet hari itu",
    LINI.reduce((n, k) => n + (arsip?.money.perLini?.[k].gross ?? 0), 0), arsip?.money.gross);
}

console.log("\n-- Paket berisi makanan & minuman (19 Okt 2026) --");
{
  /* Pemilik minta paket bisa berisi makanan & minuman, tersambung ke stok
     gudang, dan Smokehouse punya paketnya sendiri.

     Yang dijaga di sini adalah tiga hal yang mudah salah sekaligus:
     tamu ditagih SEKALI (harga paket, isinya Rp 0), dapur menerima tiap
     hidangannya sebagai tiket tersendiri TANPA tiket kembar untuk paketnya,
     dan stok berkurang per porsi. */
  const d = dunia();
  const stok = (st: ReturnType<typeof replay>, id: string) =>
    st.stock.find((r) => r.itemId === id)?.qty ?? 0;
  const tehAwal = stok(replay(d.genesis, d.entries), TEH);

  d.push(jam(11, 1), {
    t: "savePaket",
    paket: {
      name: "Paket Keluarga", price: 150_000, hours: 0, freeDrinks: 0, lastStartHour: 16,
      venue: "smh", isi: [{ itemId: NASGOR, qty: 2 }, { itemId: TEH, qty: 4 }],
    },
  });
  const stPk = replay(d.genesis, d.entries);
  const pk = (stPk.packages ?? []).find((p) => p.name === "Paket Keluarga");
  t("paket tersimpan", !!pk, true);
  t("venuenya Smokehouse", pk?.venue, "smh");
  t("tanpa jam main", pk?.hours, 0);
  t("isinya dua jenis", pk?.isi?.length, 2);
  t("isinya ikut ditulis di rincian paket",
    pk?.perks.some((x) => x.includes("Nasi Goreng")), true);
  t("membuat paket TIDAK memotong stok", stok(stPk, TEH), tehAwal);

  // Dijual di meja makan Smokehouse.
  const meja = bukaMeja(d, "S101", 18, []);
  d.push(jam(18, 10), { t: "addPaket", sessionId: meja, paketId: pk!.id });
  const st = replay(d.genesis, d.entries);
  const sesi = st.sessions.find((x) => x.id === meja)!;

  t("satu baris harga paket + dua baris isi", sesi.fnb.length, 3);
  t("baris paket ditandai", sesi.fnb.filter((l) => l.paket).length, 1);
  t("harga paket yang ditagih", sesi.fnb.find((l) => l.paket)?.unitPrice, 150_000);
  t("isinya Rp 0 — tidak ditagih dua kali",
    sesi.fnb.filter((l) => !l.paket).every((l) => l.unitPrice === 0), true);
  t("tagihannya sama dengan harga paket",
    settlementOf(sesi, st, jam(18, 20)).fnb, 150_000);

  // Stok & dapur.
  t("stok es teh berkurang 4 porsi", stok(st, TEH), tehAwal - 4);
  const tiket = st.tickets.filter((x) => x.sessionId === meja);
  t("dua tiket keluar — bukan tiga", tiket.length, 2);
  t("tidak ada tiket atas nama paketnya",
    tiket.some((x) => x.name === "Paket Keluarga"), false);
  t("dapur & bar sama-sama kebagian",
    [...new Set(tiket.map((x) => x.station))].sort(), ["bar", "kitchen"]);
}

console.log("\n-- Pagar paket --");
{
  const d = dunia();
  d.push(jam(11, 1), {
    t: "savePaket",
    paket: { name: "Paket SMH", price: 90_000, hours: 0, freeDrinks: 0, lastStartHour: 16,
      venue: "smh", isi: [{ itemId: NASGOR, qty: 1 }] },
  });
  d.push(jam(11, 2), {
    t: "savePaket",
    paket: { name: "Paket Main 2 Jam", price: 80_000, hours: 2, freeDrinks: 0, lastStartHour: 16,
      venue: "spl", isi: [{ itemId: TEH, qty: 2 }] },
  });
  const stAwal = replay(d.genesis, d.entries);
  const pkSmh = (stAwal.packages ?? []).find((p) => p.name === "Paket SMH")!;
  const pkSpl = (stAwal.packages ?? []).find((p) => p.name === "Paket Main 2 Jam")!;

  // Paket Smokehouse tidak bisa dijual di meja biliar.
  const mejaBiliar = bukaMeja(d, "T03", 18, []);
  d.push(jam(18, 10), { t: "addPaket", sessionId: mejaBiliar, paketId: pkSmh.id });
  t("paket Smokehouse ditolak di meja biliar",
    replay(d.genesis, d.entries).sessions.find((x) => x.id === mejaBiliar)!.fnb.length, 0);

  // Paket bersewa waktu tidak bisa dijual sebagai baris bill.
  d.push(jam(18, 11), { t: "addPaket", sessionId: mejaBiliar, paketId: pkSpl.id });
  t("paket bersewa waktu ditolak sebagai baris bill",
    replay(d.genesis, d.entries).sessions.find((x) => x.id === mejaBiliar)!.fnb.length, 0);

  // Barang karangan menolak SELURUH paket, bukan diterima separuh.
  const sebelum = (replay(d.genesis, d.entries).packages ?? []).length;
  d.push(jam(11, 3), {
    t: "savePaket",
    paket: { name: "Paket Karangan", price: 50_000, hours: 0, freeDrinks: 0, lastStartHour: 16,
      venue: "smh", isi: [{ itemId: NASGOR, qty: 1 }, { itemId: "barang-hantu", qty: 1 }] },
  });
  t("paket dengan barang karangan ditolak utuh",
    (replay(d.genesis, d.entries).packages ?? []).length, sebelum);

  // Paket SPL 0 jam ditolak: tamu membayar blok tanpa waktu main.
  d.push(jam(11, 4), {
    t: "savePaket",
    paket: { name: "Paket Nol Jam", price: 50_000, hours: 0, freeDrinks: 0, lastStartHour: 16,
      venue: "spl", isi: [] },
  });
  t("paket SPL 0 jam ditolak",
    (replay(d.genesis, d.entries).packages ?? []).some((p) => p.name === "Paket Nol Jam"), false);
}

console.log("\n-- Void: satu pengajuan per pesanan (19 Okt 2026) --");
{
  /* Keluhan pemilik: void bisa diajukan berulang-ulang untuk pesanan yang
     sama. Akibatnya bukan cuma kasir bingung — superadmin menyetujui dua
     pengajuan untuk satu baris, dan nilainya terhitung dua kali di daftar
     void sementara barangnya cuma hilang sekali. */
  const d = dunia();
  const id = bukaMeja(d, "T01", 18, [[NASGOR, 2]]);
  const st0 = replay(d.genesis, d.entries);
  const baris = st0.sessions.find((x) => x.id === id)!.fnb[0];
  const target = `${id}|${baris.key}`;

  // Kasir (bukan superadmin) mengajukan void — masuk antrean.
  d.entries.push({
    id: "zv1", at: jam(19), by: "u-rian",
    act: { t: "requestVoid", req: { targetKind: "item", targetId: target, label: "", amount: 0, reason: "Salah input" } },
  });
  t("pengajuan pertama masuk", replay(d.genesis, d.entries).voids.length, 1);
  t("statusnya menunggu", replay(d.genesis, d.entries).voids[0].status, "menunggu");

  // Ditekan lagi — harus ditolak mesin, bukan menumpuk.
  d.entries.push({
    id: "zv2", at: jam(19, 1), by: "u-rian",
    act: { t: "requestVoid", req: { targetKind: "item", targetId: target, label: "", amount: 0, reason: "Salah input" } },
  });
  const st2 = replay(d.genesis, d.entries);
  t("pengajuan kedua DITOLAK — tidak menumpuk", st2.voids.length, 1);
  t("status void baris terbaca layar",
    statusVoidBaris(st2, id, baris.key)?.status, "menunggu");

  // Orang lain pun tidak bisa mengajukan ulang target yang sama.
  d.entries.push({
    id: "zv3", at: jam(19, 2), by: "u-yoga",
    act: { t: "requestVoid", req: { targetKind: "item", targetId: target, label: "", amount: 0, reason: "Tamu batal" } },
  });
  t("kasir lain juga ditolak", replay(d.genesis, d.entries).voids.length, 1);

  // Disetujui → barisnya hilang, dan statusnya terbaca.
  d.push(jam(19, 5), { t: "decideVoid", id: replay(d.genesis, d.entries).voids[0].id, approve: true });
  const st3 = replay(d.genesis, d.entries);
  t("void disetujui", st3.voids[0].status, "disetujui");
  t("barisnya benar-benar hilang dari bill",
    st3.sessions.find((x) => x.id === id)!.fnb.length, 0);
  t("nilainya terhitung sekali saja", st3.voids.length, 1);
}

console.log("\n-- Void yang DITOLAK boleh diajukan lagi --");
{
  /* Satu pengajuan aktif, bukan satu pengajuan seumur hidup: kalau
     superadmin menolaknya dan ternyata memang perlu di-void, barisnya tidak
     boleh terkunci selamanya. */
  const d = dunia();
  const id = bukaMeja(d, "T02", 18, [[NASGOR, 1]]);
  const baris = replay(d.genesis, d.entries).sessions.find((x) => x.id === id)!.fnb[0];
  const target = `${id}|${baris.key}`;
  const ajukan = (n: string, at: number) => d.entries.push({
    id: n, at, by: "u-rian",
    act: { t: "requestVoid", req: { targetKind: "item", targetId: target, label: "", amount: 0, reason: "Salah input" } },
  });

  ajukan("zw1", jam(19));
  d.push(jam(19, 3), { t: "decideVoid", id: replay(d.genesis, d.entries).voids[0].id, approve: false });
  t("pengajuan pertama ditolak superadmin",
    replay(d.genesis, d.entries).voids[0].status, "ditolak");

  ajukan("zw2", jam(19, 10));
  t("boleh diajukan lagi sesudah ditolak", replay(d.genesis, d.entries).voids.length, 2);
  t("dan yang terbaca layar adalah yang menunggu",
    statusVoidBaris(replay(d.genesis, d.entries), id, baris.key)?.status, "menunggu");
}


console.log("\n-- Pindah pesanan langsung ke MEJA KOSONG (19 Okt 2026) --");
{
  /* Permintaan pemilik: *"kalau mau pindah meja bisa langsung pindah ke meja
     kosong, tidak perlu aktifkan meja dari awal, jadi bisa pindah keseluruhan
     meja."* Sebelumnya tujuannya WAJIB meja yang sudah jalan, jadi kasir
     harus membuka meja tujuannya dulu -- dua langkah, dan yang pertama
     sering terlupakan di jam ramai. */
  const d = dunia();
  const id = bukaMeja(d, "T01", 18, [[NASGOR, 2], [TEH, 1]]);
  const kunci = replay(d.genesis, d.entries).sessions.find((x) => x.id === id)!.fnb.map((l) => l.key);

  d.push(jam(19), { t: "moveFnb", fromId: id, toTableId: "T05", keys: kunci });
  const st = replay(d.genesis, d.entries);
  const baru = st.sessions.find((x) => x.tableId === "T05" && x.status === "running");

  t("meja tujuan dibuka sendiri oleh mesin", !!baru, true);
  t("SEMUA baris ikut pindah", baru?.fnb.length, 2);
  t("meja asal jadi kosong", st.sessions.find((x) => x.id === id)!.fnb.length, 0);
  t("nama tamunya ikut", baru?.guest, "Tamu T01");
  t("dibuka sebagai open bill, bukan paket jam", baru?.blockHours, undefined);
  t("tidak ada sewa di muka", baru?.tableAmount, 0);
  t("lampu meja barunya menyala", st.lights["T05"], true);
  t("jejak mencatat mejanya dibuka",
    st.log.some((x) => x.what.indexOf("Meja dibuka") === 0 && x.what.indexOf("Meja 5") > 0), true);
  t("jejak mencatat pindahnya",
    st.log.some((x) => x.what.indexOf("Pesanan dipindah") === 0), true);
  t("uang barangnya ikut ke meja baru",
    settlementOf(baru!, st, jam(19, 1)).fnb, 2 * harga(NASGOR) + harga(TEH));
  t("meja asal tinggal sewa mejanya saja",
    settlementOf(st.sessions.find((x) => x.id === id)!, st, jam(19, 1)).fnb, 0);
}

console.log("\n-- Pagar meja kosong tetap tertutup --");
{
  const d = dunia();
  const id = bukaMeja(d, "T01", 18, [[NASGOR, 1]]);
  const kunci = replay(d.genesis, d.entries).sessions.find((x) => x.id === id)!.fnb.map((l) => l.key);

  // Meja yang SEDANG DIPAKAI bukan meja kosong -- tidak boleh ditimpa.
  d.push(jam(18, 30), { t: "walkin", tableId: "T06", guest: "Tamu lain" });
  d.push(jam(19), { t: "moveFnb", fromId: id, toTableId: "T06", keys: kunci });
  t("meja yang sedang dipakai tidak bisa dibuka ulang",
    replay(d.genesis, d.entries).sessions.filter((x) => x.tableId === "T06").length, 1);
  t("barisnya tetap di meja asal",
    replay(d.genesis, d.entries).sessions.find((x) => x.id === id)!.fnb.length, 1);

  // Meja asalnya sendiri bukan tujuan yang sah.
  d.push(jam(19, 1), { t: "moveFnb", fromId: id, toTableId: "T01", keys: kunci });
  t("tidak bisa pindah ke mejanya sendiri",
    replay(d.genesis, d.entries).sessions.find((x) => x.id === id)!.fnb.length, 1);

  // Lintas venue: kasir SPL tidak bisa menumpahkan pesanan ke meja Smokehouse.
  d.entries.push({
    id: "zp1", at: jam(19, 2), by: "u-rian",
    act: { t: "moveFnb", fromId: id, toTableId: "S101", keys: kunci },
  });
  const stv = replay(d.genesis, d.entries);
  t("meja venue sebelah tidak ikut terbuka",
    stv.sessions.some((x) => x.tableId === "S101"), false);
  t("dan barisnya tidak ke mana-mana",
    stv.sessions.find((x) => x.id === id)!.fnb.length, 1);
}

console.log("\n-- Bentuk aksinya dijaga --");
{
  t("tanpa tujuan: ditolak",
    validAction({ t: "moveFnb", fromId: "w-1", keys: ["k"] } as unknown as Action), false);
  t("tujuan sesi: sah",
    validAction({ t: "moveFnb", fromId: "w-1", toId: "w-2", keys: ["k"] } as Action), true);
  t("tujuan meja kosong: sah",
    validAction({ t: "moveFnb", fromId: "w-1", toTableId: "T05", keys: ["k"] } as Action), true);
  t("tanpa baris: ditolak",
    validAction({ t: "moveFnb", fromId: "w-1", toTableId: "T05", keys: [] } as Action), false);
}


console.log("\n-- Kasir membuka meja DENGAN PAKET (21 Okt 2026) --");
{
  /* Permintaan pemilik: *"untuk paket tidak bisa terlihat disini padahal ada
     paket siang \u2026 pastikan aktif dan muncul di menu booking dan cashier
     ketika mengaktifkan bill."*

     Paket bersewa waktu tidak bisa dijual sebagai baris bill (`addPaket`
     menolaknya): harganya MENGGANTIKAN tarif per jam. Satu-satunya tempat
     yang benar adalah saat mejanya dibuka — persis seperti booking online
     memakainya. */
  const d = dunia();
  d.push(jam(13), { t: "walkin", tableId: "T01", guest: "Rudi", paketId: "siang" });
  const st = replay(d.genesis, d.entries);
  const sesi = st.sessions.find((x) => x.tableId === "T01")!;
  const pk = paketOf(st, "siang")!;

  t("mejanya terbuka", sesi.status, "running");
  t("harganya harga paket, bukan tarif per jam", sesi.tableAmount, pk.price);
  t("lamanya dari paket", sesi.blockHours, pk.hours);
  t("paketnya tercatat di sesi", sesi.paket, "siang");
  t("jatah minuman ikut", sesi.freeDrinks, pk.freeDrinks);
  t("jam selesainya 2 jam dari sekarang", sesi.endsAt - sesi.startsAt, pk.hours * 3_600_000);
  t("jejak menyebut nama paketnya",
    st.log.some((x) => x.what.indexOf("Meja dibuka (Paket Siang)") === 0), true);

  // Tagihannya harga blok, bukan meteran — dan tidak bertambah per menit.
  const b1 = settlementOf(sesi, st, jam(13, 30));
  const b2 = settlementOf(sesi, st, jam(14, 45));
  t("tagihan meja = harga paket", b1.billiard, pk.price);
  t("dan tidak bertambah per menit", b2.billiard, pk.price);
}

console.log("\n-- Jatah minuman paket jalan dari kasir --");
{
  const d = dunia();
  d.push(jam(13), { t: "walkin", tableId: "T02", guest: "Rudi", paketId: "siang" });
  const id = replay(d.genesis, d.entries).sessions.find((x) => x.tableId === "T02")!.id;
  const teh = itemOf(replay(d.genesis, d.entries), TEH)!;
  // Tiga es teh: dua masuk jatah paket, yang ketiga ditagih.
  d.push(jam(13, 10), {
    t: "addFnb", sessionId: id, name: teh.name, station: teh.station,
    line: { key: "p-teh", itemId: TEH, qty: 3, unitPrice: teh.price, name: teh.name, station: teh.station },
  });
  const st = replay(d.genesis, d.entries);
  const sesi = st.sessions.find((x) => x.id === id)!;
  t("jatahnya terpakai habis", sesi.freeDrinks, 0);
  t("hanya satu gelas yang ditagih",
    settlementOf(sesi, st, jam(13, 20)).fnb, harga(TEH));
}

console.log("\n-- Isi paket keluar dari gudang saat meja dibuka --");
{
  const d = dunia();
  // Paket baru pemilik: 2 jam, berisi satu nasi goreng.
  d.push(jam(11, 5), {
    t: "savePaket",
    paket: {
      name: "Paket Main + Makan", price: 120_000, hours: 2, freeDrinks: 0,
      lastStartHour: 20, venue: "spl", isi: [{ itemId: NASGOR, qty: 1 }],
    },
  });
  const baru = replay(d.genesis, d.entries).packages!.find((p) => p.name === "Paket Main + Makan")!;
  const stokAwal = 5;
  d.push(jam(11, 6), { t: "setStock", itemId: NASGOR, qty: stokAwal });

  d.push(jam(13), { t: "walkin", tableId: "T03", guest: "Rudi", paketId: baru.id });
  const st = replay(d.genesis, d.entries);
  const sesi = st.sessions.find((x) => x.tableId === "T03")!;

  t("isi paket jadi baris bill", sesi.fnb.length, 1);
  t("barisnya Rp 0 — sudah termasuk harga paket", sesi.fnb[0].unitPrice, 0);
  t("yang ditagih hanya harga paketnya",
    settlementOf(sesi, st, jam(13, 30)).fnb, 0);
  t("stok gudang berkurang satu porsi",
    st.stock.find((r) => r.itemId === NASGOR)?.qty, stokAwal - 1);
  t("dapur menerima tiketnya",
    st.tickets.filter((k) => k.sessionId === sesi.id && k.itemId === NASGOR).length, 1);
}

console.log("\n-- Pagar paket di kasir --");
{
  const tolak = (label: string, at: number, act: Action, meja: string) => {
    const d = dunia();
    d.push(at, act);
    t(label, replay(d.genesis, d.entries).sessions.some((x) => x.tableId === meja), false);
  };

  // Meja VIP: Paket Siang hanya untuk meja reguler.
  tolak("paket ditolak di meja VIP", jam(13),
    { t: "walkin", tableId: "V01", guest: "Rudi", paketId: "siang" }, "V01");
  // Lewat jam 16.00 — batas mulai Paket Siang.
  tolak("paket ditolak sesudah batas jam mulainya", jam(18),
    { t: "walkin", tableId: "T04", guest: "Rudi", paketId: "siang" }, "T04");
  // Paket SPL tidak boleh membuka meja Smokehouse.
  tolak("paket SPL ditolak di meja Smokehouse", jam(13),
    { t: "walkin", tableId: "S104", guest: "Rudi", paketId: "siang" }, "S104");
  // Paket yang tidak ada.
  tolak("paket yang tidak dikenal ditolak", jam(13),
    { t: "walkin", tableId: "T05", guest: "Rudi", paketId: "entah" }, "T05");
  // Dua cara buka sekaligus: ditolak, bukan dipilih salah satu diam-diam.
  tolak("paket + jam sekaligus ditolak", jam(13),
    { t: "walkin", tableId: "T06", guest: "Rudi", paketId: "siang", hours: 3 } as Action, "T06");

  // Paket yang dinonaktifkan tidak bisa dipakai lagi.
  {
    const d = dunia();
    d.push(jam(11, 5), { t: "removePaket", id: "siang" });
    d.push(jam(13), { t: "walkin", tableId: "T07", guest: "Rudi", paketId: "siang" });
    t("paket yang dinonaktifkan ditolak",
      replay(d.genesis, d.entries).sessions.some((x) => x.tableId === "T07"), false);
  }

  // Paket Smokehouse BERSEWA WAKTU tidak boleh membuka meja biliar. Mesin
  // menerima paket smh berjam (1–6), jadi pagar venue-lah satu-satunya yang
  // menahannya — kelas mejanya sendiri sah (T09 reguler), dan tanpa pagar itu
  // harga blok meja makan masuk ke bill meja biliar.
  {
    const d = dunia();
    d.push(jam(11, 5), {
      t: "savePaket",
      paket: { name: "Paket Resto 2 Jam", price: 90_000, hours: 2, freeDrinks: 0, lastStartHour: 20, venue: "smh" },
    });
    const pkSmh = replay(d.genesis, d.entries).packages!.find((p) => p.name === "Paket Resto 2 Jam")!;
    t("mesin memang menerima paket Smokehouse berjam", pkSmh.hours, 2);
    d.push(jam(13), { t: "walkin", tableId: "T09", guest: "Rudi", paketId: pkSmh.id });
    t("tapi paket Smokehouse berjam ditolak di meja biliar",
      replay(d.genesis, d.entries).sessions.some((x) => x.tableId === "T09"), false);
  }

  // Paket Smokehouse (0 jam) bukan cara membuka meja — itu baris bill.
  {
    const d = dunia();
    d.push(jam(11, 5), {
      t: "savePaket",
      paket: { name: "Paket Nasi", price: 60_000, hours: 0, freeDrinks: 0, lastStartHour: 23, venue: "smh" },
    });
    const pkSmh = replay(d.genesis, d.entries).packages!.find((p) => p.name === "Paket Nasi")!;
    d.push(jam(13), { t: "walkin", tableId: "S105", guest: "Rudi", paketId: pkSmh.id });
    t("paket 0 jam tidak bisa membuka meja",
      replay(d.genesis, d.entries).sessions.some((x) => x.tableId === "S105"), false);
  }
}

console.log("\n-- Syarat paket: satu aturan untuk booking & kasir --");
{
  const st = replay(dunia().genesis, dunia().entries);
  t("meja reguler, 2 jam, jam 13: boleh",
    paketProblem(st, "siang", { kelas: "regular", hours: 2, startH: 13 }), null);
  t("meja VIP: ditolak dengan alasannya",
    paketProblem(st, "siang", { kelas: "vip", hours: 2, startH: 13 }),
    "Paket Siang hanya untuk meja reguler");
  t("lama tidak cocok: ditolak",
    paketProblem(st, "siang", { kelas: "regular", hours: 3, startH: 13 }),
    "Paket Siang lamanya 2 jam");
  t("lewat batas jam mulai: ditolak",
    paketProblem(st, "siang", { kelas: "regular", hours: 2, startH: 17 }),
    "Paket Siang paling lambat mulai jam 16.00");
}


console.log("\n-- Jatah minuman hanya kembali untuk baris yang memakainya --");
{
  /*
   * Bug yang ditemukan simulasi 21 Okt 2026 (INV-28 merah di sim#12).
   *
   * Dulu jatah dikembalikan untuk SETIAP baris Rp 0 yang di-void. Padahal
   * baris Rp 0 ada tiga macam, dan dua di antaranya tidak pernah memakai
   * jatah: barang yang di-compliment (venue yang menanggung harganya) dan
   * isi paket (harganya sudah di dalam harga paket). Akibatnya: void satu
   * compliment di meja Paket Siang MENAMBAH jatah minuman tamu, dan venue
   * memberi gelas gratis yang tidak pernah dipakai siapa pun.
   */
  const d = dunia();
  d.push(jam(13), { t: "walkin", tableId: "T08", guest: "Rudi", paketId: "siang" });
  const id = replay(d.genesis, d.entries).sessions.find((x) => x.tableId === "T08")!.id;
  const teh = itemOf(replay(d.genesis, d.entries), TEH)!;
  const nasgor = itemOf(replay(d.genesis, d.entries), NASGOR)!;

  // Satu es teh memakai jatah (2 \u2192 1), satu nasi goreng ditagih penuh.
  d.push(jam(13, 5), {
    t: "addFnb", sessionId: id, name: teh.name, station: teh.station,
    line: { key: "j-teh", itemId: TEH, qty: 1, unitPrice: teh.price, name: teh.name, station: teh.station },
  });
  d.push(jam(13, 6), {
    t: "addFnb", sessionId: id, name: nasgor.name, station: nasgor.station,
    line: { key: "j-ng", itemId: NASGOR, qty: 1, unitPrice: nasgor.price, name: nasgor.name, station: nasgor.station },
  });
  t("jatah terpakai satu", replay(d.genesis, d.entries).sessions.find((x) => x.id === id)!.freeDrinks, 1);

  // Nasi gorengnya di-compliment — harganya jadi 0, tapi itu BUKAN jatah.
  d.push(jam(13, 10), { t: "compliment", sessionId: id, key: "j-ng", alasan: "Tamu lama" });
  const stC = replay(d.genesis, d.entries);
  const comp = stC.sessions.find((x) => x.id === id)!.fnb.find((l) => l.key === "j-ng")!;
  t("compliment berharga nol", comp.unitPrice, 0);
  t("dan menyimpan harga aslinya", comp.comp, nasgor.price);
  t("jatah tidak ikut bertambah oleh compliment",
    stC.sessions.find((x) => x.id === id)!.freeDrinks, 1);

  // Compliment-nya di-void. Jatah minuman TIDAK boleh ikut kembali.
  d.push(jam(13, 15), {
    t: "requestVoid",
    req: { targetKind: "item", targetId: `${id}|j-ng`, label: "item", amount: 0, reason: "Salah input" },
  });
  d.push(jam(13, 16), {
    t: "decideVoid", id: replay(d.genesis, d.entries).voids[0].id, approve: true,
  });
  const stV = replay(d.genesis, d.entries);
  const sesi = stV.sessions.find((x) => x.id === id)!;
  t("barisnya hilang", sesi.fnb.some((l) => l.key === "j-ng"), false);
  t("jatah TETAP satu — compliment tidak pernah memakainya", sesi.freeDrinks, 1);
  t("terpakai + sisa tetap sama dengan jatah paket",
    sesi.fnb.filter((l) => l.unitPrice === 0 && l.comp === undefined).reduce((n, l) => n + l.qty, 0)
      + (sesi.freeDrinks ?? 0), paketOf(stV, "siang")!.freeDrinks);

  // Dan minuman jatahnya sendiri, kalau di-void, MEMANG mengembalikan jatah.
  d.push(jam(13, 20), {
    t: "requestVoid",
    req: { targetKind: "item", targetId: `${id}|j-teh-gratis`, label: "item", amount: 0, reason: "Tamu batal" },
  });
  const menunggu = replay(d.genesis, d.entries).voids.find((v) => v.status === "menunggu");
  if (menunggu) d.push(jam(13, 21), { t: "decideVoid", id: menunggu.id, approve: true });
  t("void minuman jatah mengembalikan jatahnya",
    replay(d.genesis, d.entries).sessions.find((x) => x.id === id)!.freeDrinks, 2);
}


console.log("\n-- Jam kejadian: saat AKSINYA terjadi, bukan saat kirimannya sampai --");
{
  /*
   * Laporan pemilik 21 Okt 2026: *"waktu untuk pesanan di proses ini tidak
   * akurat \u2026 harusnya tidak mengikuti jam saat ini, kan punya waktu mulai
   * dan proses yang beda-beda."*
   *
   * Penyebabnya di server: `staff_action` mencap kejadian dengan
   * `clock_timestamp()` SAAT KIRIMAN TIBA. Selama tersambung itu benar
   * (selisih sepersekian detik). Perangkat yang terputus menumpuk aksinya,
   * lalu SEMUANYA dicap jam yang sama saat akhirnya terkirim.
   *
   * Yang terlihat: seluruh tiket dapur tertulis jam yang sama, 0 menit.
   * Yang TIDAK terlihat jauh lebih mahal: meja yang dibuka pukul 18.00 ikut
   * tercatat mulai 20.56, dan meterannya menagih tiga jam lebih sedikit.
   */
  const kirim = (at: number, at0: number | undefined, act: Action, id: string) => ({
    id, at, by: "u-manager",
    act: (at0 === undefined ? act : { ...act, at0 }) as Action,
  });

  // Meja dibuka pukul 18.00, kirimannya baru sampai pukul 21.00.
  {
    const d = dunia();
    d.entries.push(kirim(jam(21), jam(18), { t: "walkin", tableId: "T20", guest: "Andi" }, "q1"));
    const st = replay(d.genesis, d.entries);
    const sesi = st.sessions.find((x) => x.tableId === "T20")!;
    t("mejanya tercatat dibuka pukul 18.00, bukan 21.00", sesi.startsAt, jam(18));
    // Inilah uangnya: tiga jam main yang nyaris hilang dari tagihan.
    t("dan meterannya menagih tiga jam, bukan nol",
      settlementOf(sesi, st, jam(21)).billiard > 0, true);
  }

  // Tanpa titipan jam (jejak lama) \u2014 perilakunya persis seperti dulu.
  {
    const d = dunia();
    d.entries.push(kirim(jam(21), undefined, { t: "walkin", tableId: "T21", guest: "Andi" }, "q2"));
    t("jejak lama tanpa titipan jam tetap memakai jam server",
      replay(d.genesis, d.entries).sessions.find((x) => x.tableId === "T21")!.startsAt, jam(21));
  }

  // Jam perangkat MAJU: tidak boleh mengarang kejadian di masa depan.
  {
    const d = dunia();
    d.entries.push(kirim(jam(21), jam(23), { t: "walkin", tableId: "T22", guest: "Andi" }, "q3"));
    t("jam perangkat yang maju diabaikan \u2014 dipakai jam server",
      replay(d.genesis, d.entries).sessions.find((x) => x.tableId === "T22")!.startsAt, jam(21));
  }

  // Mundur lebih dari sehari: jam perangkatnya yang patut dicurigai.
  {
    const d = dunia();
    const jauh = jam(21) - 3 * 24 * 60 * 60_000;
    d.entries.push(kirim(jam(21), jauh, { t: "walkin", tableId: "T23", guest: "Andi" }, "q4"));
    t("mundur lebih dari sehari dipotong di batas sehari",
      replay(d.genesis, d.entries).sessions.find((x) => x.tableId === "T23")!.startsAt,
      jam(21) - MAKS_ANTRE_MS);
  }

  // Dua aksi yang menyusul bersamaan tetap punya jam masing-masing.
  {
    const d = dunia();
    const ng = itemOf(replay(d.genesis, d.entries), NASGOR)!;
    d.entries.push(kirim(jam(21), jam(18), { t: "walkin", tableId: "T24", guest: "Andi" }, "q5"));
    const id = replay(d.genesis, d.entries).sessions.find((x) => x.tableId === "T24")!.id;
    d.entries.push(kirim(jam(21, 0), jam(19), {
      t: "addFnb", sessionId: id, name: ng.name, station: ng.station,
      line: { key: "qq", itemId: NASGOR, qty: 1, unitPrice: ng.price, name: ng.name, station: ng.station },
    } as Action, "q6"));
    const st = replay(d.genesis, d.entries);
    const tiket = st.tickets.find((k) => k.sessionId === id)!;
    t("tiket dapur memakai jam pesanannya sendiri", tiket.at, jam(19));
    t("bukan jam yang sama dengan buka mejanya",
      tiket.at !== st.sessions.find((x) => x.id === id)!.startsAt, true);
  }

  t("jamKejadian: tanpa at0 \u2014 jam server",
    jamKejadian({ id: "z", at: jam(20), by: null, act: { t: "tick" } as Action }), jam(20));
}

console.log("\n-- Mode demo: membuka JAM saja (23 Okt 2026) --");
{
  /*
   * Permintaan pemilik: *"beberapa akses terkunci terutama pagi atau lewat
   * jamnya ... agar saya bisa melakukan keseluruhan simulasi di jam kapan pun."*
   *
   * Yang dijaga di sini BUKAN cuma "mode demo bekerja", tapi terutama apa yang
   * TIDAK ikut longgar. Saklar yang melonggarkan satu aturan selalu menggoda
   * untuk melonggarkan yang lain, dan nilainya persis sebesar seluruh pagar
   * yang dibangun di mesin ini.
   */
  const PAGI = 9;    // pukul 09.00 - di luar jam buka 11.00-02.00
  /* Shift dibuka pukul 07.00: hampir semua aksi uang menuntut shift terbuka,
     dan harness bawaan membukanya pukul 11.00 — sesudah jam yang diuji di sini.
     Yang diuji pagar JAM, bukan pagar shift. */
  const pagiHari = () => {
    const d = dunia(false);
    d.push(jam(7), { t: "openShift", openingCash: 0 });
    return d;
  };

  {
    const d = pagiHari();
    d.push(jam(PAGI), { t: "walkin", tableId: "T30", guest: "Andi" });
    t("pagi hari, mode demo mati: meja tidak bisa dibuka",
      replay(d.genesis, d.entries).sessions.some((x) => x.tableId === "T30"), false);
  }

  {
    const d = pagiHari();
    d.push(jam(8), { t: "setJamBebas", on: true });
    t("mode demo menyala", replay(d.genesis, d.entries).jamBebas, true);
    d.push(jam(PAGI), { t: "walkin", tableId: "T31", guest: "Andi" });
    const st = replay(d.genesis, d.entries);
    const sesi = st.sessions.find((x) => x.tableId === "T31");
    t("pagi hari, mode demo nyala: meja bisa dibuka", !!sesi, true);
    t("dan meterannya tetap menagih, bukan nol",
      settlementOf(sesi!, st, jam(PAGI + 2)).billiard > 0, true);
    t("penyalaannya tercatat di jejak dengan nama pelakunya",
      st.log.some((l) => l.what.indexOf("Mode demo DINYALAKAN") === 0 && !!l.who), true);

    d.push(jam(PAGI, 30), { t: "setJamBebas", on: false });
    d.push(jam(PAGI, 31), { t: "walkin", tableId: "T32", guest: "Budi" });
    t("dimatikan lagi: pagar jam berlaku lagi",
      replay(d.genesis, d.entries).sessions.some((x) => x.tableId === "T32"), false);
  }

  // YANG TIDAK IKUT LONGGAR.
  {
    const d = pagiHari();
    d.push(jam(8), { t: "setJamBebas", on: true });

    d.entries.push({ id: "zd1", at: jam(8, 5), by: "u-rian", act: { t: "setJamBebas", on: false } });
    t("kru kasir tidak bisa mematikan mode demo",
      replay(d.genesis, d.entries).jamBebas, true);

    d.entries.push({ id: "zd2", at: jam(PAGI), by: "u-rian", act: { t: "walkin", tableId: "S105", guest: "X" } });
    t("pagar venue tetap berlaku",
      replay(d.genesis, d.entries).sessions.some((x) => x.tableId === "S105"), false);

    d.push(jam(PAGI), { t: "walkin", tableId: "T41", guest: "X" });
    t("meja yang belum dijual tetap tidak bisa dibuka",
      replay(d.genesis, d.entries).sessions.some((x) => x.tableId === "T41"), false);

    d.push(jam(PAGI), { t: "walkin", tableId: "T33", guest: "Andi" });
    const sesi = replay(d.genesis, d.entries).sessions.find((x) => x.tableId === "T33")!;
    t("tarifnya tetap dibekukan seperti biasa", !!sesi.rates, true);
    t("dan kelas mejanya tetap dibaca katalog", sesi.tableType, "regular");
  }

  t("bentuk aksinya dijaga", validAction({ t: "setJamBebas", on: true } as Action), true);
  t("tanpa nilai on: ditolak", validAction({ t: "setJamBebas" } as unknown as Action), false);
}
console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
