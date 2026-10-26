/* ═══════════════════════════════════════════════════════════════════
   DUA ANAK PERUSAHAAN — SPL SPORT & SMOKEHOUSE

   Permintaan pemilik 12 Okt 2026: "login untuk super admin dan cashier dan
   karyawan per masing-masing juga beda, karena ini diibaratkan 2 anak
   perusahaan yang berbeda."

   Jadi akun staf bisa DIIKAT ke satu venue, dan ikatannya ditegakkan DI
   MESIN — bukan dengan menyembunyikan tab. Perangkat bisa berbohong: jejak
   kejadian dikirim dari HP/komputer mana pun, dan satu permintaan yang
   dirangkai tangan tidak pernah melewati layar.

   Simulasi menjaga arah "tidak boleh tapi berhasil" (INV-58). Berkas ini
   menjaga arah yang TIDAK PERNAH terlihat di simulasi: yang BOLEH wajib
   tetap boleh. Kasir Smokehouse yang diam-diam kehilangan hak menutup
   bill-nya sendiri hanya akan terlihat seperti "aksinya ditolak" — dan
   ditolak terjadi ribuan kali di simulasi tanpa satu pun tanda bahaya.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, runningOn, settlementOf, recap, recapRange, omzetPerShift, classOf,
  relocationTargets, jejakVenue, namaMeja, mejaDijual, validAction,
  type Action, type Entry, type Genesis, type State,
} from "../src/lib/engine";
import { EMPLOYEES } from "../src/data/staff";
import { venueDari, SEMUA_MEJA } from "../src/data/venue";
import { businessDateOf, dariWib, tanggalWib } from "../src/lib/occupancy";
import { findItem } from "../src/data/menu";

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

/* Pelakunya akun bawaan: Rian kasir SPL, Dewi kasir Smokehouse, Pak Budi
   pemilik (tanpa ikatan venue). */
const RIAN = "u-rian", DEWI = "u-dewi", BUDI = "u-owner";
const NASGOR = "fr-01";
const MEJA_SPL = "T04", MEJA_SMH = "S103";
/** Nama meja apa adanya — jejak menuliskannya, jadi uji membacanya dari sumber yang sama. */
const namaMejaSpl = namaMeja({ tableNames: {} }, MEJA_SPL);
const namaMejaSmh = namaMeja({ tableNames: {} }, MEJA_SMH);

function dunia() {
  const genesis: Genesis = { at: jam(5), seed: false };
  let n = 0;
  const entries: Entry[] = [];
  const push = (at: number, act: Action, by: string | null = BUDI) =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
  push(jam(11), { t: "openShift", openingCash: 0 });
  return { entries, push, st: () => replay(genesis, entries) };
}

const baris = (tag: string, itemId: string, qty: number) => ({ key: tag + "-" + itemId, itemId, qty });

console.log("-- Akun bawaan: siapa mengurus apa --");
{
  const cari = (id: string) => EMPLOYEES.find((e) => e.id === id)!;
  t("pemilik mengurus kedua venue", cari(BUDI).venue, undefined);
  t("Rian terikat SPL Sport", cari(RIAN).venue, "spl");
  t("Dewi terikat Smokehouse", cari(DEWI).venue, "smh");
  // Kunci induk: harus ada superadmin aktif yang tidak terikat venue, kalau
  // tidak satu venue bisa kehilangan pengurusnya tanpa jalan kembali.
  t("ada superadmin tanpa ikatan venue",
    EMPLOYEES.some((e) => e.active && e.role === "superadmin" && !e.venue), true);
  t("meja uji memang beda venue", [venueDari(MEJA_SPL), venueDari(MEJA_SMH)], ["spl", "smh"]);
}

console.log("\n-- Yang BOLEH wajib tetap boleh --");
{
  const d = dunia();
  // Kasir SPL membuka meja biliar; kasir Smokehouse mendudukkan tamu di meja makan.
  d.push(jam(19), { t: "walkin", tableId: MEJA_SPL, guest: "Andi" }, RIAN);
  d.push(jam(19), { t: "walkin", tableId: MEJA_SMH, guest: "Rina" }, DEWI);
  const st = d.st();
  const spl = runningOn(st, MEJA_SPL), smh = runningOn(st, MEJA_SMH);
  t("kasir SPL membuka meja biliarnya", spl?.guest, "Andi");
  t("kasir Smokehouse membuka meja makannya", smh?.guest, "Rina");

  d.push(jam(19, 10), {
    t: "addFnb", sessionId: spl!.id, line: baris("x", NASGOR, 1), name: "Andi", station: "kitchen",
  }, RIAN);
  d.push(jam(19, 10), {
    t: "addFnb", sessionId: smh!.id, line: baris("y", NASGOR, 2), name: "Rina", station: "kitchen",
  }, DEWI);
  const st2 = d.st();
  t("pesanan kasir SPL masuk bill-nya", runningOn(st2, MEJA_SPL)?.fnb.length, 1);
  t("pesanan kasir Smokehouse masuk bill-nya", runningOn(st2, MEJA_SMH)?.fnb.length, 1);

  d.push(jam(21), { t: "settle", id: spl!.id, channel: "cash" }, RIAN);
  d.push(jam(21), { t: "settle", id: smh!.id, channel: "cash" }, DEWI);
  const st3 = d.st();
  t("kasir SPL menutup tab-nya", st3.sessions.find((x) => x.id === spl!.id)?.status, "done");
  t("kasir Smokehouse menutup tab-nya", st3.sessions.find((x) => x.id === smh!.id)?.status, "done");
  // Uangnya masuk ke rekap venue masing-masing, tidak tercampur.
  t("omzet SPL hanya dari meja SPL", recap(st3, undefined, "spl").counts.done, 1);
  t("omzet Smokehouse hanya dari meja makannya", recap(st3, undefined, "smh").counts.done, 1);
}

console.log("\n-- Yang TIDAK boleh wajib ditolak mesin --");
{
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: MEJA_SPL, guest: "Andi" }, RIAN);
  d.push(jam(19), { t: "walkin", tableId: MEJA_SMH, guest: "Rina" }, DEWI);
  const spl = runningOn(d.st(), MEJA_SPL)!, smh = runningOn(d.st(), MEJA_SMH)!;

  // Semua ini DIKIRIM ke mesin, bukan diklik di layar: layarnya memang sudah
  // tidak menampilkannya, tapi yang menolak harus mesinnya.
  const ditolak = (label: string, act: Action, by: string) => {
    const sebelum = d.st();
    d.push(jam(20), act, by);
    const sesudah = d.st();
    t(label, JSON.stringify(sesudah.sessions) === JSON.stringify(sebelum.sessions)
      && JSON.stringify(sesudah.lights) === JSON.stringify(sebelum.lights), true);
    d.entries.pop();
  };

  ditolak("kasir Smokehouse tidak bisa membuka meja biliar",
    { t: "walkin", tableId: "T05", guest: "Nekat" }, DEWI);
  ditolak("kasir Smokehouse tidak bisa menutup tab meja biliar",
    { t: "settle", id: spl.id, channel: "cash" }, DEWI);
  ditolak("kasir Smokehouse tidak bisa menambah pesanan ke bill biliar",
    { t: "addFnb", sessionId: spl.id, line: baris("z", NASGOR, 1), name: "Andi", station: "kitchen" }, DEWI);
  ditolak("kasir Smokehouse tidak bisa menyalakan lampu meja biliar",
    { t: "toggleLight", tableId: MEJA_SPL }, DEWI);
  ditolak("kasir Smokehouse tidak bisa menyalakan semua lampu biliar",
    { t: "allLights", on: true }, DEWI);
  ditolak("kasir SPL tidak bisa menutup tab meja makan",
    { t: "settle", id: smh.id, channel: "cash" }, RIAN);
  ditolak("kasir SPL tidak bisa menggabungkan meja biliar dengan meja makan",
    { t: "gabungMeja", ids: [spl.id, smh.id] }, RIAN);
  ditolak("kasir SPL tidak bisa mengajukan void sesi meja makan",
    { t: "requestVoid", req: { targetKind: "sesi", targetId: smh.id, label: "", amount: 0, reason: "Salah input" } }, RIAN);

  // Pemilik tetap bisa keduanya — kalau tidak, pagar ini melumpuhkan venue.
  d.push(jam(20), { t: "settle", id: spl.id, channel: "cash" }, BUDI);
  d.push(jam(20), { t: "settle", id: smh.id, channel: "cash" }, BUDI);
  const akhir = d.st();
  t("pemilik menutup tab SPL", akhir.sessions.find((x) => x.id === spl.id)?.status, "done");
  t("pemilik menutup tab Smokehouse", akhir.sessions.find((x) => x.id === smh.id)?.status, "done");
}

console.log("\n-- Pindah meja: lintas venue memang mustahil dibentuk --");
{
  /* `relocate` menuntut meja tujuan SEKELAS, dan `setTableClass` menolak
     mengubah meja biliar jadi meja resto (dan sebaliknya) — tata letaknya
     beda. Jadi tidak ada jalan membentuk meja biliar yang sekelas meja
     makan: pagar venue di `relocate` adalah sabuk kedua yang hari ini tidak
     bisa diuji. Yang DIUJI di sini: pintu yang menutupnya memang masih
     tertutup. Kalau suatu hari denah Smokehouse yang asli membawa kelas meja
     bersama, pemeriksaan ini yang gagal lebih dulu — dan pagar venue di
     `relocate` sudah menunggu di tempatnya. */
  const d = dunia();
  d.push(jam(11, 5), { t: "setTableClass", tableId: "T20", type: "resto" }, BUDI);
  t("meja biliar tidak bisa dijadikan meja makan", classOf(d.st(), "T20"), "regular");
  d.push(jam(19), { t: "walkin", tableId: MEJA_SMH, guest: "Rina" }, DEWI);
  const smh = runningOn(d.st(), MEJA_SMH)!;
  d.push(jam(19, 30), { t: "relocate", id: smh.id, toTableId: "T20" }, DEWI);
  t("dan tamu meja makan tidak bisa dipindah ke meja biliar",
    d.st().sessions.find((x) => x.id === smh.id)?.tableId, MEJA_SMH);
}

console.log("\n-- Kas & laporan tidak pernah tercampur --");
{
  // Shift dibuka kasir Smokehouse di perangkat yang (katanya) sedang SPL —
  // kasnya tetap kas Smokehouse: akun yang menang, bukan perangkat.
  const d2 = dunia();
  d2.entries.length = 0;
  d2.push(jam(11), { t: "openShift", openingCash: 100_000, venue: "spl" }, DEWI);
  t("shift kasir Smokehouse tercatat sebagai kas Smokehouse", d2.st().shift?.venue, "smh");

  // Rekap rentang (Mingguan/Bulanan) WAJIB ikut venue. Sampai 12 Okt 2026
  // `recapRange` tidak menerima venue sama sekali, jadi memilih "Smokehouse"
  // lalu "Minggu ini" menampilkan angka DUA venue tanpa satu pun tanda.
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: MEJA_SPL, guest: "Andi" }, RIAN);
  d.push(jam(19), { t: "walkin", tableId: MEJA_SMH, guest: "Rina" }, DEWI);
  const spl = runningOn(d.st(), MEJA_SPL)!, smh = runningOn(d.st(), MEJA_SMH)!;
  d.push(jam(19, 10), {
    t: "addFnb", sessionId: smh.id, line: baris("y", NASGOR, 2), name: "Rina", station: "kitchen",
  }, DEWI);
  d.push(jam(21), { t: "settle", id: spl.id, channel: "cash" }, RIAN);
  d.push(jam(21), { t: "settle", id: smh.id, channel: "cash" }, DEWI);
  const st2 = d.st();

  const hariIni = tanggalWib(jam(19));
  const rSmh = recapRange(st2, hariIni, hariIni, "smh");
  const rSpl = recapRange(st2, hariIni, hariIni, "spl");
  const rDua = recapRange(st2, hariIni, hariIni);
  const nasgor = findItem(NASGOR)!.price * 2;
  t("rekap rentang Smokehouse = makanannya saja", rSmh.money.fnb, nasgor);
  t("rekap rentang SPL tidak memuat makanan Smokehouse", rSpl.money.fnb, 0);
  t("gabungan = jumlah keduanya", rDua.money.gross, rSmh.money.gross + rSpl.money.gross);
  t("dan gabungan memang lebih besar dari salah satunya", rDua.money.gross > rSmh.money.gross, true);

  // Omzet per shift juga per venue.
  const oSmh = omzetPerShift(st2, hariIni, "smh");
  t("omzet shift Smokehouse hanya satu transaksi", oSmh.semua.trx, 1);
  t("dan nilainya nilai meja makannya", oSmh.semua.barang, nasgor);
  // Sewa meja hanya ada di SPL: meja makan tidak bersewa waktu.
  t("Smokehouse tidak pernah punya sewa meja", oSmh.semua.sewaMeja, 0);
  t("SPL punya sewa meja", omzetPerShift(st2, hariIni, "spl").semua.sewaMeja > 0, true);
}

console.log("\n-- Akun staf: kepala venue tidak bisa mengarang akun venue sebelah --");
{
  const d = dunia();
  // Manajer Smokehouse: akses penuh, TAPI terikat Smokehouse.
  d.push(jam(11, 1), {
    t: "saveEmployee",
    emp: { id: "", name: "Kepala SMH", pin: "7777", role: "manager", active: true, venue: "smh" },
  }, BUDI);
  const st = d.st();
  const kepala = st.employees.find((x) => x.name === "Kepala SMH");
  t("akun manajer Smokehouse dibuat", kepala?.role, "manager");
  t("terikat Smokehouse", kepala?.venue, "smh");

  const coba = (label: string, act: Action, by: string, want: unknown, lihat: (s: State) => unknown) => {
    d.push(jam(12), act, by);
    t(label, lihat(d.st()), want);
    d.entries.pop();
  };
  coba("kepala Smokehouse tidak bisa membuat akun SPL",
    { t: "saveEmployee", emp: { id: "", name: "Orang SPL", pin: "6161", role: "kru_kasir", active: true, venue: "spl" } },
    kepala!.id, undefined, (s) => s.employees.find((x) => x.name === "Orang SPL"));
  coba("juga tidak bisa membuat akun yang menguasai KEDUA venue",
    { t: "saveEmployee", emp: { id: "", name: "Orang Dua Venue", pin: "6262", role: "manager", active: true } },
    kepala!.id, undefined, (s) => s.employees.find((x) => x.name === "Orang Dua Venue"));
  coba("tapi boleh membuat akun Smokehouse",
    { t: "saveEmployee", emp: { id: "", name: "Pramusaji SMH", pin: "6363", role: "kru_kasir", active: true, venue: "smh" } },
    kepala!.id, "smh", (s) => s.employees.find((x) => x.name === "Pramusaji SMH")?.venue);
  coba("kepala Smokehouse tidak bisa menghapus kasir SPL",
    { t: "removeEmployee", id: RIAN }, kepala!.id, true, (s) => s.employees.some((x) => x.id === RIAN));

  // Kunci induk tidak bisa dicabut: pemilik pun tidak boleh mengikat
  // superadmin terakhirnya ke satu venue.
  const satu = dunia();
  for (const e of EMPLOYEES.filter((x) => x.role === "superadmin" && x.id !== BUDI)) {
    satu.push(jam(11, 2), { t: "removeEmployee", id: e.id }, BUDI);
  }
  const stSatu = satu.st();
  t("tinggal satu superadmin", stSatu.employees.filter((x) => x.active && x.role === "superadmin").length, 1);
  satu.push(jam(11, 3), {
    t: "saveEmployee", emp: { ...stSatu.employees.find((x) => x.id === BUDI)!, venue: "smh" },
  }, BUDI);
  t("superadmin terakhir tidak bisa diikat ke satu venue",
    satu.st().employees.find((x) => x.id === BUDI)?.venue, undefined);
}

console.log("\n-- Pesanan TAMU tidak pernah ikut terjaring --");
{
  /* Jejaknya satu untuk semua perangkat: pesanan tamu SPL harus tetap sah
     saat kejadiannya diputar ulang di komputer kasir Smokehouse. Kalau aksi
     tamu ikut dijaring, pesanan yang diterima di satu perangkat HILANG di
     perangkat lain — kerusakan yang paling sulit dilacak. */
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: MEJA_SPL, guest: "Andi" }, RIAN);
  const spl = runningOn(d.st(), MEJA_SPL)!;
  // `by` SENGAJA diisi kasir Smokehouse: itulah bentuk terburuknya.
  d.push(jam(19, 20), {
    t: "guestOrder",
    order: {
      id: "g-T1", code: "SPL-T1", guest: "Andi", mode: "meja", tableId: MEJA_SPL,
      pay: "kasir", lines: [baris("t", NASGOR, 1)], paidOnline: 0, sessionId: spl.id,
    },
  }, DEWI);
  const st = d.st();
  t("pesanan tamu di meja SPL tetap diterima", st.orders.find((o) => o.id === "g-T1")?.status, "diterima");
  t("dan menempel di bill mejanya", runningOn(st, MEJA_SPL)?.fnb.length, 1);
  t("nilainya masuk tagihan",
    settlementOf(runningOn(st, MEJA_SPL)!, st, jam(19, 30)).fnb, findItem(NASGOR)!.price);
}

console.log("\n-- Point F \u00b7 pindah meja: Smokehouse bebas, SPL dipertahankan --");
{
  /*
   * Jawaban pemilik 19 Okt 2026: *"ini yg point F yg dimaksud adalah yg untuk
   * resto Smoke House, yg SPL pertahankan."*
   *
   * Jadi aturannya BEDA per venue, dan dua-duanya dijaga di sini:
   *
   *   Smokehouse — semua meja makan yang kosong boleh jadi tujuan. Tidak ada
   *     soal harga: meja makan tidak bersewa waktu, pindah ke meja mana pun
   *     tidak menggeser satu rupiah pun.
   *
   *   SPL Sport — TETAP hanya meja sekelas. Reguler Rp 29.000/jam tidak boleh
   *     pindah ke VIP Rp 50.000/jam, karena harga dibekukan saat meja dibuka:
   *     tamunya akan main di VIP dengan harga reguler, dan selisihnya hilang
   *     tanpa ada yang memutuskannya.
   *
   * Arah ini TIDAK pernah terlihat di simulasi — "tidak ditawarkan" sama
   * diamnya dengan "ditolak". Kalau saringan kelasnya suatu hari dilonggarkan
   * untuk semua venue, berkas inilah yang berteriak.
   */
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: MEJA_SMH, guest: "Rina" }, DEWI);
  d.push(jam(19), { t: "walkin", tableId: "S107", guest: "Tamu lain" }, DEWI);
  d.push(jam(19), { t: "walkin", tableId: MEJA_SPL, guest: "Andi" }, RIAN);
  const st = d.st();

  const smh = runningOn(st, MEJA_SMH)!;
  const tujuanSmh = relocationTargets(st, smh, jam(19, 30)).map((x) => x.id);
  // Dari meja yang sedang DIJUAL, bukan dari katalog: sejak 21 Okt 2026
  // katalog memuat meja cadangan yang belum diaktifkan pemilik, dan meja yang
  // tidak dijual memang tidak boleh ditawarkan sebagai tujuan pindah.
  const mejaSmhKosong = mejaDijual(st)
    .filter((x) => x.venue === "smh" && x.id !== MEJA_SMH && x.id !== "S107")
    .map((x) => x.id);
  t("Smokehouse: SEMUA meja makan yang kosong ditawarkan",
    tujuanSmh.slice().sort(), mejaSmhKosong.slice().sort());
  t("meja makan yang sedang dipakai tidak ditawarkan", tujuanSmh.includes("S107"), false);
  t("dan meja biliar tidak pernah ikut", tujuanSmh.some((id) => venueDari(id) === "spl"), false);

  const spl = runningOn(st, MEJA_SPL)!;
  const tujuanSpl = relocationTargets(st, spl, jam(19, 30)).map((x) => x.id);
  t("SPL: meja VIP TIDAK ditawarkan ke tamu reguler",
    tujuanSpl.some((id) => classOf(st, id) !== "regular"), false);
  t("SPL: meja reguler lain tetap ditawarkan", tujuanSpl.length > 0, true);
  t("SPL: meja makan tidak pernah ikut", tujuanSpl.some((id) => venueDari(id) === "smh"), false);
}

console.log("\n-- Jejak aktivitas: bernama pelakunya & terpisah per venue --");
{
  /*
   * Permintaan pemilik 21 Okt 2026: *"jejak aktivitasnya bisa dibuat lengkap
   * bahkan sampai akun yg melakukannya \u2026 dan pastikan di pisah juga antara
   * spl sport dan smokehouse nya."*
   *
   * Dua arah dijaga di sini, dan keduanya tidak pernah terlihat di simulasi:
   * baris yang HARUS muncul di panel sebuah venue, dan baris yang HARUS
   * muncul di KEDUANYA (pengaturan tingkat grup). Jejak audit yang kehilangan
   * satu baris persis kehilangan baris yang paling ingin disembunyikan orang.
   */
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: MEJA_SPL, guest: "Andi" }, RIAN);
  d.push(jam(19, 1), { t: "walkin", tableId: MEJA_SMH, guest: "Rina" }, DEWI);
  // Tarif: pengaturan tingkat grup, tidak menyentuh meja mana pun.
  d.push(jam(19, 2), { t: "setRate", key: "vip", value: 55_000 }, BUDI);
  const st = d.st();

  const spl = jejakVenue(st, "spl");
  const smh = jejakVenue(st, "smh");
  const cari = (ls: typeof st.log, awalan: string) => ls.find((l) => l.what.indexOf(awalan) === 0);

  t("buka meja biliar tercatat di panel SPL",
    cari(spl, `Meja dibuka (open bill) \u00b7 ${namaMejaSpl}`)?.who, "Rian");
  t("dan TIDAK muncul di panel Smokehouse",
    !!cari(smh, `Meja dibuka (open bill) \u00b7 ${namaMejaSpl}`), false);

  t("buka meja makan tercatat di panel Smokehouse",
    cari(smh, `Meja dibuka (open bill) \u00b7 ${namaMejaSmh}`)?.who, "Dewi");
  t("dan TIDAK muncul di panel SPL",
    !!cari(spl, `Meja dibuka (open bill) \u00b7 ${namaMejaSmh}`), false);

  // Tarif berlaku untuk dua-duanya, jadi barisnya milik dua-duanya.
  t("perubahan tarif muncul di panel SPL", !!cari(spl, "Tarif"), true);
  t("dan juga di panel Smokehouse", !!cari(smh, "Tarif"), true);
  t("dengan nama pelakunya", cari(spl, "Tarif")?.who, "Pak Budi (Pemilik)");

  // Setiap baris jejak bernama \u2014 tidak ada yang anonim.
  t("tidak ada baris jejak tanpa nama", st.log.filter((l) => !l.who).length, 0);
}

console.log("\n-- Pesanan tamu ikut masuk panel venue yang benar --");
{
  /*
   * Aksi tamu dulu SENGAJA tidak dipetakan venue-nya, supaya pagar venue
   * tidak menolaknya saat jejaknya diputar ulang di perangkat kasir venue
   * sebelah (INV-22/29/30). Sejak 21 Okt 2026 petanya dilengkapi dan yang
   * dikecualikan adalah PAGARNYA, bukan petanya \u2014 jadi pesanan tamu tetap
   * diterima di perangkat mana pun, tapi jejaknya masuk panel yang benar.
   */
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: MEJA_SMH, guest: "Rina" }, DEWI);
  const smhSesi = runningOn(d.st(), MEJA_SMH)!;
  d.push(jam(19, 5), {
    t: "guestOrder",
    order: {
      id: "g-J1", code: "JJ1", guest: "Tamu QR", mode: "meja", tableId: MEJA_SMH,
      pay: "kasir", lines: [baris("j", NASGOR, 1)], paidOnline: 0, sessionId: smhSesi.id,
    },
  }, null);
  const st = d.st();
  t("pesanan tamu diterima", st.orders.find((o) => o.id === "g-J1")?.status, "diterima");
  const di = (v: "spl" | "smh") => jejakVenue(st, v).some((l) => l.what.indexOf("Pesanan QR") === 0);
  t("jejaknya masuk panel Smokehouse", di("smh"), true);
  t("dan tidak bocor ke panel SPL", di("spl"), false);
}

console.log("\n-- Tambah & tarik meja (21 Okt 2026) --");
{
  /*
   * Permintaan pemilik: *"tambahkan di pengaturan untuk tambah meja semisal
   * nanti ada tambahan meja yang dilakukan."*
   *
   * Yang pindah ke data cuma SATU hal: meja mana yang sedang dijual.
   * Katalognya tetap di kode, karena venue dan kelas sebuah meja dibaca
   * fungsi-fungsi MURNI yang tidak memegang state (`venueDari`, `typeOf`,
   * `punyaLampu`) — dan meja yang hanya ada di data akan membuat ketiganya
   * menebak. Dua baris pertama di bawah menjaga tebakan itu tidak pernah
   * terjadi.
   */
  const BARU_SMH = "S113";      // meja makan cadangan
  const BARU_SPL = "T41";       // meja biliar cadangan

  t("meja cadangan Smokehouse dikenal venue-nya", venueDari(BARU_SMH), "smh");
  t("meja cadangan SPL dikenal venue-nya", venueDari(BARU_SPL), "spl");

  {
    const d = dunia();
    t("belum dijual: tidak ada di denah",
      mejaDijual(d.st()).some((x) => x.id === BARU_SMH), false);
    // Belum dijual = belum bisa dibuka, walau idnya dikenal mesin.
    d.push(jam(19), { t: "walkin", tableId: BARU_SMH, guest: "Rina" }, DEWI);
    t("belum dijual: tidak bisa dibuka kasir", !!runningOn(d.st(), BARU_SMH), false);

    d.push(jam(19, 1), { t: "setMejaDipakai", tableId: BARU_SMH, dipakai: true }, BUDI);
    t("sesudah ditambahkan: masuk denah",
      mejaDijual(d.st()).some((x) => x.id === BARU_SMH), true);
    t("dan kelasnya meja makan, bukan tebakan reguler",
      classOf(d.st(), BARU_SMH), "resto");

    d.push(jam(19, 2), { t: "walkin", tableId: BARU_SMH, guest: "Rina" }, DEWI);
    const sesi = runningOn(d.st(), BARU_SMH);
    t("dan kasir Smokehouse bisa membukanya", !!sesi, true);
    // Inilah yang dijaga baris "kelasnya meja makan" di atas: kalau kelasnya
    // jatuh ke reguler, meteran Rp 29.000/jam mulai jalan di meja makan.
    t("tanpa sewa waktu — meteran tetap Rp 0",
      settlementOf(sesi!, d.st(), jam(21)).billiard, 0);
  }

  {
    // Meja biliar baru: lampunya ikut dikenal, dan tarifnya tarif reguler.
    const d = dunia();
    d.push(jam(19), { t: "setMejaDipakai", tableId: BARU_SPL, dipakai: true }, BUDI);
    t("meja biliar baru punya catatan lampu", BARU_SPL in d.st().lights, true);
    d.push(jam(19, 1), { t: "walkin", tableId: BARU_SPL, guest: "Andi" }, RIAN);
    t("kasir SPL bisa membukanya", !!runningOn(d.st(), BARU_SPL), true);
    t("dan lampunya menyala", d.st().lights[BARU_SPL], true);
  }

  {
    // MENARIK meja: hilang dari denah, riwayatnya tetap terbaca.
    const d = dunia();
    d.push(jam(19), { t: "walkin", tableId: MEJA_SPL, guest: "Andi" }, RIAN);
    const sesi = runningOn(d.st(), MEJA_SPL)!;
    d.push(jam(19, 5), { t: "setMejaDipakai", tableId: MEJA_SPL, dipakai: false }, BUDI);
    t("meja yang masih ada tamunya TIDAK bisa ditarik",
      mejaDijual(d.st()).some((x) => x.id === MEJA_SPL), true);

    d.push(jam(20), { t: "settle", id: sesi.id, channel: "cash" }, RIAN);
    d.push(jam(20, 1), { t: "setMejaDipakai", tableId: MEJA_SPL, dipakai: false }, BUDI);
    t("sesudah tabnya ditutup, mejanya bisa ditarik",
      mejaDijual(d.st()).some((x) => x.id === MEJA_SPL), false);
    t("tapi sesi lamanya tetap terbaca namanya",
      namaMeja(d.st(), MEJA_SPL), namaMejaSpl);
    t("dan tidak bisa dibuka lagi sebelum ditambahkan kembali",
      (() => {
        d.push(jam(20, 5), { t: "walkin", tableId: MEJA_SPL, guest: "Baru" }, RIAN);
        return !!runningOn(d.st(), MEJA_SPL);
      })(), false);
  }

  {
    // Hak akses: hanya yang boleh mengelola meja.
    const d = dunia();
    d.push(jam(19), { t: "setMejaDipakai", tableId: BARU_SPL, dipakai: true }, RIAN);
    t("kru kasir tidak bisa menambah meja",
      mejaDijual(d.st()).some((x) => x.id === BARU_SPL), false);
  }

  {
    // Pagar venue tetap berlaku untuk denah.
    const d = dunia();
    d.push(jam(19), { t: "setMejaDipakai", tableId: BARU_SMH, dipakai: true }, RIAN);
    t("kasir SPL tidak bisa menambah meja Smokehouse",
      mejaDijual(d.st()).some((x) => x.id === BARU_SMH), false);
  }

  // Bentuk aksinya dijaga.
  t("bentuk aksi sah", validAction({ t: "setMejaDipakai", tableId: "T41", dipakai: true } as Action), true);
  t("tanpa tableId: ditolak",
    validAction({ t: "setMejaDipakai", dipakai: true } as unknown as Action), false);
}

console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
