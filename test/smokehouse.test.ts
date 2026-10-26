/* ═══════════════════════════════════════════════════════════════════
   SMOKEHOUSE — PESAN ONLINE & PESAN DI KASIR, SAMPAI DIBAYAR

   Dua alur yang diminta pemilik dijamin utuh di sini, dari pesanan sampai
   uangnya masuk:

     A. TAMU PESAN SENDIRI dari HP (scan QR di meja makan).
     B. KASIR MENCATAT pesanan langsung di meja, lalu menutup bill.

   Yang paling penting dan paling mudah salah: di resto, yang "membuka meja"
   adalah TAMU YANG DUDUK LALU MEMESAN — bukan kasir yang menekan tombol.
   Aturan lama (warisan meja biliar) menolak pesanan ke meja yang belum
   dibuka kasir, dan itu benar untuk biliar: membuka meja biliar menjalankan
   METERAN. Meja makan tidak bersewa waktu, jadi tidak ada satu rupiah pun
   yang bergerak karena mejanya terbuka.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, recap, rekapTigaJenis, runningOn, settlementOf, guestOrderProblem,
  penjualanProduk, omzetPerShift, itemOf, siapDiantar,
  type Action, type Entry, type Genesis, type State,
} from "../src/lib/engine";
import { findItem, MENU, ALL_ITEMS } from "../src/data/menu";
import { venueDari } from "../src/data/venue";
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

const NASGOR = "fr-01";     // Nasi Goreng Telur · dapur
const TEH = "cd-01";        // Ice Tea · bar
const IGA = "br-01";        // iga · dapur (kategori beef-ribs)

function dunia() {
  const genesis: Genesis = { at: jam(5), seed: false };
  let n = 0;
  const entries: Entry[] = [];
  const push = (at: number, act: Action, by: string | null = "u-manager") =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
  push(jam(11), { t: "openShift", openingCash: 0 });
  return { genesis, entries, push, st: () => replay(genesis, entries) };
}

const barisTamu = (tag: string, itemId: string, qty: number) => ({
  key: `${tag}-${itemId}`, itemId, qty,
});

console.log("-- A · Tamu scan QR di meja makan yang BELUM dibuka kasir --");
{
  const d = dunia();
  const meja = "S103";
  const st0 = d.st();
  t("mejanya memang masih kosong", !!runningOn(st0, meja), false);
  t("mesin mengizinkan pesanan ke meja resto yang kosong",
    guestOrderProblem(st0, {
      mode: "meja", tableId: meja, pay: "kasir", lines: [barisTamu("a", NASGOR, 2)], sessionId: undefined,
    }, jam(19)), null);

  d.push(jam(19), {
    t: "guestOrder",
    order: {
      id: "g-A1", code: "SPL-A1", guest: "Rina", mode: "meja", tableId: meja,
      pay: "kasir", lines: [barisTamu("a", NASGOR, 2), barisTamu("a", TEH, 2)], paidOnline: 0,
    },
  }, null);

  const st = d.st();
  const sesi = runningOn(st, meja);
  t("meja terbuka sendiri oleh pesanan itu", sesi?.status, "running");
  t("atas nama tamunya", sesi?.guest, "Rina");
  t("TANPA sewa meja", sesi?.tableAmount, 0);
  t("tanpa blok jam (bukan paket per jam)", (sesi as { blockHours?: number } | undefined)?.blockHours, undefined);
  t("pesanannya menempel di bill meja itu", sesi?.fnb.length, 2);
  t("pesanan tercatat diterima",
    st.orders.find((o) => o.id === "g-A1")?.status, "diterima");
  t("dan masuk rekap venue Smokehouse",
    st.orders.find((o) => o.id === "g-A1")?.venue, "smh");

  // Tiket dapur & bar terbentuk: nasi goreng ke dapur, es teh ke bar.
  const tiket = st.tickets.filter((x) => x.sessionId === sesi!.id);
  t("dua tiket keluar ke station masing-masing",
    tiket.map((x) => x.station).sort(), ["bar", "kitchen"]);

  // Tamu menambah pesanan lagi dari HP — masuk ke tab yang SAMA.
  d.push(jam(19, 30), {
    t: "guestOrder",
    order: {
      id: "g-A2", code: "SPL-A2", guest: "Rina", mode: "meja", tableId: meja,
      pay: "kasir", lines: [barisTamu("b", IGA, 1)], paidOnline: 0, sessionId: sesi!.id,
    },
  }, null);
  const st2 = d.st();
  t("pesanan kedua masuk tab yang sama", runningOn(st2, meja)?.fnb.length, 3);
  t("tidak ada tab kedua yang terbuka",
    st2.sessions.filter((x) => x.tableId === meja && x.status === "running").length, 1);

  // Kasir menutup bill: tunai, dengan kembalian.
  const sisa = settlementOf(runningOn(st2, meja)!, st2, jam(21)).due;
  t("tagihannya = jumlah barangnya, tanpa sewa meja",
    sisa, 2 * harga(NASGOR) + 2 * harga(TEH) + harga(IGA));

  d.push(jam(21), { t: "settle", id: runningOn(st2, meja)!.id, channel: "cash" });
  const st3 = d.st();
  const r = recap(st3, undefined, "smh");
  t("mejanya kembali kosong", !!runningOn(st3, meja), false);
  t("omzet Smokehouse = tagihan tadi", r.gross, sisa);
  t("sewa meja nol — ini resto", r.billiard, 0);
  t("uang berimbang", r.gross, r.diterima + r.prabayar);
  t("semuanya masuk kolom barang", rekapTigaJenis(st3, undefined, "smh").totalBarang, sisa);
}

console.log("\n-- A2 · Bayar di muka lewat QRIS dari HP --");
{
  const d = dunia();
  const meja = "S104";
  const nilai = 2 * harga(NASGOR);
  d.push(jam(19), {
    t: "guestOrder",
    order: {
      id: "g-B1", code: "SPL-B1", guest: "Doni", mode: "meja", tableId: meja,
      pay: "online", lines: [barisTamu("c", NASGOR, 2)], paidOnline: nilai,
    },
  }, null);
  const st = d.st();
  const sesi = runningOn(st, meja)!;
  t("meja terbuka & pesanan lunas di muka", st.orders.find((o) => o.id === "g-B1")?.paidOnline, nilai);
  t("prabayarnya menempel di tab meja", sesi.paidOnline, nilai);
  t("barisnya ditandai sudah dibayar", sesi.fnb.every((l) => l.prepaid), true);
  t("sisa tagihan nol", settlementOf(sesi, st, jam(20)).due, 0);

  // Nominal yang tidak cocok harus DITOLAK & dananya dicatat untuk dikembalikan.
  d.push(jam(19, 10), {
    t: "guestOrder",
    order: {
      id: "g-B2", code: "SPL-B2", guest: "Doni", mode: "meja", tableId: "S105",
      pay: "online", lines: [barisTamu("d", NASGOR, 1)], paidOnline: 1000,
    },
  }, null);
  const st2 = d.st();
  t("nominal tidak cocok ditolak", st2.orders.find((o) => o.id === "g-B2")?.status, "ditolak");
  t("dananya dicatat untuk dikembalikan",
    st2.refunds.some((x) => x.bookingCode === "SPL-B2" && x.amount === 1000), true);
  t("mejanya TIDAK ikut terbuka", !!runningOn(st2, "S105"), false);
}

console.log("\n-- B · Kasir mencatat pesanan langsung di meja --");
{
  const d = dunia();
  const meja = "S106";
  d.push(jam(18), { t: "walkin", tableId: meja, guest: "Keluarga Andi" });
  const sesiId = d.st().sessions.find((x) => x.tableId === meja)!.id;

  const it = (id: string) => itemOf(d.st(), id)!;
  for (const [id, qty] of [[NASGOR, 3], [TEH, 4]] as const) {
    d.push(jam(18, 5), {
      t: "addFnb", sessionId: sesiId, name: it(id).name, station: it(id).station,
      line: { key: `k-${id}`, itemId: id, qty, unitPrice: it(id).price, name: it(id).name, station: it(id).station },
    });
  }
  const st = d.st();
  t("pesanan kasir masuk bill", runningOn(st, meja)?.fnb.length, 2);
  t("tiket dapur & bar keluar",
    st.tickets.filter((x) => x.sessionId === sesiId).map((x) => x.station).sort(), ["bar", "kitchen"]);

  /* UBAH BARIS DITUTUP 19 Okt 2026 (permintaan pemilik: menghindari
     manipulasi karyawan). Satu baris bisa diturunkan jumlahnya tanpa
     persetujuan siapa pun dan tanpa bekas selain satu catatan — jadi
     jalurnya ditutup, dan koreksi salah input lewat VOID, yang menuntut
     alasan dan persetujuan.

     Yang diuji di sini: mesinnya menolak, bukan layarnya menyembunyikan. */
  const sebelumKoreksi = runningOn(d.st(), meja)?.fnb.find((l) => l.itemId === TEH)?.qty;
  d.push(jam(18, 40), {
    t: "editFnb", sessionId: sesiId, key: `k-${TEH}`, qty: 2,
  });
  t("ubah baris pesanan DITOLAK mesin",
    runningOn(d.st(), meja)?.fnb.find((l) => l.itemId === TEH)?.qty, sebelumKoreksi);

  // Bayar: sebagian tunai dulu (bayar patungan), sisanya kartu EDC.
  const sebelum = settlementOf(runningOn(d.st(), meja)!, d.st(), jam(20)).due;
  d.push(jam(20), { t: "paySplit", id: sesiId, channel: "cash", amount: 50_000 });
  const sisa = settlementOf(runningOn(d.st(), meja)!, d.st(), jam(20)).due;
  t("bayar sebagian mengurangi sisa tagihan", sisa, sebelum - 50_000);

  d.push(jam(20, 5), { t: "settle", id: sesiId, channel: "edc", mesin: "BRI" });
  const st2 = d.st();
  const r = recap(st2, undefined, "smh");
  t("tab tertutup", !!runningOn(st2, meja), false);
  t("uang berimbang", r.gross, r.diterima + r.prabayar);
  t("tunai & EDC tercatat terpisah",
    [r.byChannel.cash?.gross ?? 0, r.byChannel.edc?.gross ?? 0], [50_000, sebelum - 50_000]);

  const o = omzetPerShift(st2, undefined, "smh");
  t("EDC-nya tercatat di mesin BRI", o.semua.edcPer.BRI, sebelum - 50_000);
  t("rincian transaksi memuat dua pembayaran",
    o.rincian.filter((x) => !x.prabayar).length, 2);
}

console.log("\n-- C · Takeaway: dapur menyiapkan, bayar saat diambil --");
{
  const d = dunia();
  const nilai = 2 * harga(NASGOR);
  d.push(jam(19), {
    t: "guestOrder",
    order: {
      id: "g-T1", code: "SPL-T1", guest: "Sinta", mode: "takeaway",
      pay: "kasir", lines: [barisTamu("t", NASGOR, 2)], paidOnline: 0, venue: "smh",
    },
  }, null);
  const st = d.st();
  t("pesanan takeaway diterima", st.orders.find((o) => o.id === "g-T1")?.status, "diterima");
  t("tiket dapur keluar walau belum dibayar",
    st.tickets.some((x) => x.via?.includes("Takeaway")), true);
  t("BELUM jadi omzet sebelum dibayar", recap(st, undefined, "smh").gross, 0);

  d.push(jam(19, 30), { t: "settleOrder", id: "g-T1", channel: "cash" });
  const st2 = d.st();
  t("sesudah dibayar baru jadi omzet", recap(st2, undefined, "smh").gross, nilai);
  t("masuk kolom tunai", recap(st2, undefined, "smh").byChannel.cash?.gross, nilai);

  const hari = tanggalWib(jam(19));
  t("muncul di laporan penjualan per produk",
    penjualanProduk(st2, hari, hari, "smh").baris.find((b) => b.itemId === NASGOR)?.qty, 2);
}

console.log("\n-- D · Pagar yang tetap berlaku --");
{
  const d = dunia();
  // Meja BILIAR tetap harus dibuka kasir — membukanya menjalankan meteran.
  t("pesanan QR ke meja biliar kosong DITOLAK",
    !!guestOrderProblem(d.st(), {
      mode: "meja", tableId: "T05", pay: "kasir", lines: [barisTamu("x", NASGOR, 1)], sessionId: undefined,
    }, jam(19)), true);

  // Di luar jam dapur, semua pesanan ditolak.
  t("di luar jam buka ditolak",
    !!guestOrderProblem(d.st(), {
      mode: "meja", tableId: "S107", pay: "kasir", lines: [barisTamu("y", NASGOR, 1)], sessionId: undefined,
    }, jam(9)), true);

  // Meja resto yang sudah dipesan rombongan lain untuk jam itu tidak bisa
  // dibuka pesanan tamu lain.
  const d2 = dunia();
  d2.push(jam(12), {
    t: "reserveResto",
    res: {
      id: "rr-1", code: "SPL-RR1", guest: "Budi", phone: "081234567890",
      pax: 4, startsAt: jam(19), hours: 2,
    },
  }, null);
  const dipesan = d2.st().sessions.find((x) => x.id === "rr-1")!;
  t("reservasi tercatat", dipesan.status, "booked");
  t("meja yang sama tidak bisa dibuka pesanan tamu lain di jam itu",
    !!guestOrderProblem(d2.st(), {
      mode: "meja", tableId: dipesan.tableId, pay: "kasir",
      lines: [barisTamu("z", NASGOR, 1)], sessionId: undefined,
    }, jam(19, 5)), true);
}

console.log("\n-- E · Reservasi meja MAKAN + makanannya sekalian --");
{
  /* Permintaan pemilik 12 Okt 2026: "reservasi ini harus dengan makanannya
     sekalian, jadi tidak hanya meja yang direservasi".

     Yang dijaga di sini bukan cuma "tersimpan", tapi KAPAN barangnya keluar
     dari rak: stok TIDAK boleh berkurang saat reservasi dibuat (reservasi
     bisa untuk dua minggu lagi), dan WAJIB berkurang saat tamunya datang. */
  const d = dunia();
  const stokDari = (st: State, id: string) => st.stock.find((r) => r.itemId === id)?.qty ?? 0;
  const tehAwal = stokDari(d.st(), TEH);

  d.push(jam(17), {
    t: "reserveResto",
    res: {
      id: "rr-E1", code: "SPL-E1", guest: "Keluarga Hadi", phone: "081299887766",
      pax: 4, startsAt: jam(20), hours: 2,
      lines: [barisTamu("e", NASGOR, 2), barisTamu("e", TEH, 3)],
    },
  }, null);

  const st = d.st();
  const res = st.sessions.find((x) => x.id === "rr-E1");
  t("reservasi tercatat", res?.status, "booked");
  t("di meja makan Smokehouse", res ? venueDari(res.tableId) : null, "smh");
  t("tanpa sewa meja", res?.tableAmount, 0);
  t("makanannya ikut tersimpan sebagai baris bill", res?.fnb.length, 2);
  t("dan ditandai pra-pesan", res?.fnb.every((l) => l.pra), true);
  t("harganya dikunci sejak dipesan",
    res?.fnb.find((l) => l.itemId === NASGOR)?.unitPrice, harga(NASGOR));
  // Inti temuannya: stok BELUM tersentuh.
  t("stok BELUM berkurang saat reservasi dibuat", stokDari(st, TEH), tehAwal);
  t("dapur belum menerima apa pun", st.tickets.filter((x) => x.sessionId === "rr-E1").length, 0);
  t("dan belum jadi omzet", recap(st, undefined, "smh").gross, 0);

  // Tamu datang.
  d.push(jam(20, 5), { t: "checkin", code: res!.checkin! }, "u-dewi");
  const st2 = d.st();
  const jalan = st2.sessions.find((x) => x.id === "rr-E1");
  t("check-in membuka mejanya", jalan?.status, "running");
  t("pra-pesan jadi baris bill biasa", jalan?.fnb.every((l) => !l.pra), true);
  t("BARU SEKARANG stoknya berkurang", stokDari(st2, TEH), tehAwal - 3);
  const tiket = st2.tickets.filter((x) => x.sessionId === "rr-E1");
  t("dapur & bar menerimanya", tiket.map((x) => x.station).sort(), ["bar", "kitchen"]);
  t("tagihannya sudah berisi makanannya",
    settlementOf(jalan!, st2, jam(20, 10)).fnb, harga(NASGOR) * 2 + harga(TEH) * 3);

  // Bayar.
  d.push(jam(21, 30), { t: "settle", id: "rr-E1", channel: "cash" }, "u-dewi");
  const st3 = d.st();
  t("tab tertutup", st3.sessions.find((x) => x.id === "rr-E1")?.status, "done");
  t("uangnya masuk rekap Smokehouse",
    recap(st3, undefined, "smh").fnb, harga(NASGOR) * 2 + harga(TEH) * 3);
  t("dan tidak masuk rekap SPL", recap(st3, undefined, "spl").gross, 0);
}

console.log("\n-- E2 · Reservasi yang tidak datang tidak menghanguskan apa pun --");
{
  /* No-show booking biliar memang diakui omzet: uangnya sudah dibayar di
     muka. Reservasi resto tidak pernah membayar, jadi tidak ada yang hangus
     — dan rekap tidak boleh mengaku menerima uang yang tidak pernah ada. */
  const d = dunia();
  const tehAwal = d.st().stock.find((r) => r.itemId === TEH)?.qty ?? 0;
  d.push(jam(17), {
    t: "reserveResto",
    res: {
      id: "rr-E2", code: "SPL-E2", guest: "Tidak Datang", phone: "081200001111",
      pax: 2, startsAt: jam(19), hours: 2,
      lines: [barisTamu("f", TEH, 2)],
    },
  }, null);
  t("reservasinya jadi", d.st().sessions.find((x) => x.id === "rr-E2")?.status, "booked");

  // Lewat batas datang: mejanya dilepas mesin sendiri.
  d.push(jam(21), { t: "tick" }, null);
  const st = d.st();
  const x = st.sessions.find((v) => v.id === "rr-E2");
  t("mejanya dilepas", x?.status, "noshow");
  t("tidak ada yang dihanguskan", x?.settledFnb, 0);
  t("stok tetap utuh", st.stock.find((r) => r.itemId === TEH)?.qty, tehAwal);
  const r = recap(st, undefined, "smh");
  t("rekap tetap berimbang", r.gross, r.diterima + r.prabayar);
  t("dan omzetnya nol", r.gross, 0);
}

console.log("\n-- E3 · Barang yang habis sebelum tamu datang dibatalkan, bukan dijual --");
{
  const d = dunia();
  d.push(jam(16), {
    t: "reserveResto",
    res: {
      id: "rr-E3", code: "SPL-E3", guest: "Rombongan Sore", phone: "081233334444",
      pax: 4, startsAt: jam(20), hours: 2,
      lines: [barisTamu("g", NASGOR, 1), barisTamu("g", TEH, 2)],
    },
  }, null);
  const kode = d.st().sessions.find((x) => x.id === "rr-E3")!.checkin!;
  // Sorenya es tehnya habis.
  d.push(jam(18), { t: "toggleSoldOut", itemId: TEH, name: "Ice Tea" }, "u-dewi");
  d.push(jam(20, 2), { t: "checkin", code: kode }, "u-dewi");

  const st = d.st();
  const jalan = st.sessions.find((x) => x.id === "rr-E3")!;
  t("yang masih ada tetap masuk bill", jalan.fnb.map((l) => l.itemId), [NASGOR]);
  t("yang habis dibuang dari bill", jalan.fnb.some((l) => l.itemId === TEH), false);
  t("tagihannya hanya yang bisa disajikan",
    settlementOf(jalan, st, jam(20, 10)).fnb, harga(NASGOR));
  t("tidak ada dana yang perlu dikembalikan", st.refunds.length, 0);
  t("dan kasir diberi tahu barangnya apa",
    st.log.some((l) => l.what.includes("HABIS & dibatalkan")), true);
}

console.log("\n-- Pagar data buku menu (patokan: buku April 2026) --");
{
  /*
   * Buku menu adalah DATA, dan data yang diketik tangan rusak dengan cara
   * yang sunyi. Tiga kerusakan yang pernah benar-benar terjadi di POS mana
   * pun, dan ketiganya baru ketahuan setelah uang berpindah:
   *
   *   id kembar   → dua hidangan berbagi satu kunci: stok yang satu dipotong
   *                 oleh penjualan yang lain, dan void menunjuk baris keliru.
   *   harga 0     → hidangan keluar dapur tanpa pernah ditagih.
   *   station     → salah dapur/bar: tiketnya tidak pernah sampai, dan
   *                 rekap lininya masuk ember yang salah.
   *
   * Dijaga di sini, bukan di layar: layar hanya menampilkan apa yang ada.
   */
  const ids = ALL_ITEMS.map((i) => i.id);
  t("tidak ada id hidangan yang kembar", ids.length - new Set(ids).size, 0);
  t("tidak ada kategori yang kosong", MENU.filter((c) => c.items.length === 0).length, 0);
  t("tidak ada id kategori yang kembar",
    MENU.length - new Set(MENU.map((c) => c.id)).size, 0);
  t("semua harga bulat, positif, dan kelipatan Rp 1.000",
    ALL_ITEMS.filter((i) => !Number.isInteger(i.price) || i.price <= 0 || i.price % 1000 !== 0).map((i) => i.id), []);
  t("semua station dikenal mesin",
    ALL_ITEMS.filter((i) => !["kitchen", "bar", "billiard"].includes(i.station)).map((i) => i.id), []);
  t("semua hidangan bernama", ALL_ITEMS.filter((i) => !i.name.trim()).map((i) => i.id), []);
  // Rokok & botolan counter TIDAK boleh bocor ke menu HP tamu: tidak ada yang
  // memeriksa umur pembelinya di sana.
  t("hanya kategori counter yang staffOnly",
    MENU.filter((c) => c.staffOnly).map((c) => c.id), ["counter-biliar"]);
  t("seluruh barang counter berstation billiard",
    MENU.find((c) => c.id === "counter-biliar")!.items.filter((i) => i.station !== "billiard").length, 0);
  // Harga yang dipakai contoh di seluruh uji lain — kalau salah satu bergeser
  // tanpa sengaja, angka di berkas uji lain ikut bergeser tanpa ada yang sadar.
  t("Nasi Goreng Telur tetap 25.000", findItem("fr-01")!.price, 25_000);
  t("Tempe Mendoan tetap 18.000", findItem("lb-01")!.price, 18_000);
  t("Ice Tea tetap 10.000", findItem("cd-01")!.price, 10_000);
}

console.log("\n-- Antrean ANTAR: matang, menunggu pramusaji (audit 21 Okt 2026) --");
{
  /*
   * Temuan audit yang dilaporkan pemilik: dapur menandai READY di layarnya
   * sendiri, lalu tidak ada apa pun yang memberitahu pramusaji — dan
   * satu-satunya tombol "Sudah diantar" ada di layar DAPUR, orang yang tidak
   * pernah tahu kapan makanannya sampai di meja.
   */
  const d = dunia();
  const meja = "S104";
  d.push(jam(19), { t: "walkin", tableId: meja, guest: "Rina" });
  const sesi = runningOn(d.st(), meja)!;
  const ng = itemOf(d.st(), NASGOR)!;
  d.push(jam(19, 2), {
    t: "addFnb", sessionId: sesi.id, name: ng.name, station: ng.station,
    line: { key: "an-1", itemId: NASGOR, qty: 2, unitPrice: ng.price, name: ng.name, station: ng.station },
  });
  const tiket = d.st().tickets.find((k) => k.sessionId === sesi.id)!;

  t("baru masuk: belum masuk antrean antar", siapDiantar(d.st(), "smh").length, 0);

  d.push(jam(19, 10), { t: "ticket", id: tiket.id, status: "preparing" });
  t("sedang dimasak: belum masuk antrean antar", siapDiantar(d.st(), "smh").length, 0);

  d.push(jam(19, 20), { t: "ticket", id: tiket.id, status: "ready" });
  const antre = siapDiantar(d.st(), "smh");
  t("matang: masuk antrean antar", antre.length, 1);
  t("dengan mejanya", antre[0]?.tableName, "R04");
  t("dan jumlah porsinya", antre[0]?.qty, 2);
  t("venue sebelah tidak melihatnya", siapDiantar(d.st(), "spl").length, 0);
  t("jam matangnya tercatat untuk menghitung lama tunggu",
    typeof d.st().tickets.find((k) => k.id === tiket.id)!.readyAt, "number");

  d.push(jam(19, 25), { t: "ticket", id: tiket.id, status: "served" });
  t("sudah diantar: keluar dari antrean", siapDiantar(d.st(), "smh").length, 0);
}

console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
