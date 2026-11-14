/* ═══════════════════════════════════════════════════════════════════
   SMOKEHOUSE — MEJA OWNER, ENTERTAIN, VIP (14 Nov 2026)

   Kasus dari lapangan: band akustik & owner mengambil makan-minum. Harus
   TERCATAT (stok, dapur, laporan) tapi tagihannya Rp 0. Jawabannya meja
   compliment: apa pun yang masuk ke meja Owner / Entertain otomatis jadi
   baris compliment. Meja VIP adalah meja makan biasa yang dibayar.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, recap, runningOn, settlementOf, guestOrderProblem, itemOf, namaMeja, mejaDijual, rekapTigaJenis, restoProblem,
  type Action, type Entry, type Genesis, type State,
} from "../src/lib/engine";
import { jenisCompliment, tableLabel } from "../src/data/venue";
import { businessDateOf, dariWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

// Hari operasional, bukan kalender — lihat catatan di smokehouse.test.ts.
const [Y, M, D] = businessDateOf(Date.now()).split("-").map(Number);
const jam = (h: number, m = 0) => dariWib(Y, M, D, h, m);

const NASGOR = "fr-01";   // dapur
const TEH = "cd-01";      // bar
const OWNER = "S1OW", ENT = "S1EN", VIP = "S1VP", R03 = "S103";
const KASIR = "u-dewi";   // kru kasir Smokehouse

function dunia() {
  const genesis: Genesis = { at: jam(5), seed: false };
  let n = 0;
  const entries: Entry[] = [];
  const push = (at: number, act: Action, by: string | null = "u-manager") =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
  push(jam(11), { t: "openShift", openingCash: 0 });
  push(jam(11, 1), { t: "openShift", openingCash: 0, venue: "smh" });
  const st = () => replay(genesis, entries);
  const pesan = (at: number, meja: string, id: string, qty: number, by = KASIR) => {
    const s = st();
    const it = itemOf(s, id)!;
    push(at, {
      t: "addFnb", sessionId: runningOn(s, meja)!.id, name: it.name, station: it.station,
      line: { key: `k-${id}-${at}`, itemId: id, qty, unitPrice: it.price, name: it.name, station: it.station },
    }, by);
  };
  return { push, st, pesan };
}
const harga = (s: State, id: string) => itemOf(s, id)!.price;
const stok = (s: State, id: string) => s.stock.find((r) => r.itemId === id)?.qty;

console.log("\n-- Tiga meja baru ada di denah Smokehouse --");
{
  const s = dunia().st();
  const dijual = mejaDijual(s).map((x) => x.id);
  t("Owner, Entertain, VIP dijual", [OWNER, ENT, VIP].every((id) => dijual.includes(id)), true);
  t("namanya tampil apa adanya", [OWNER, ENT, VIP].map((id) => namaMeja(s, id)), ["Owner", "Entertain", "VIP"]);
  t("label papan memakai nama", tableLabel("resto", 101, "Owner"), "Owner");
  t("meja R lama tetap R03", tableLabel("resto", 3), "R03");
  t("jenis compliment", [OWNER, ENT, VIP, R03].map((id) => jenisCompliment(id) ?? null), ["owner", "entertain", null, null]);
}

console.log("\n-- Band di meja Entertain: tercatat, tapi Rp 0 --");
{
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: ENT, guest: "" }, KASIR);
  t("tanpa nama penerima: ditolak", !!runningOn(d.st(), ENT), false);
  d.push(jam(19, 1), { t: "walkin", tableId: ENT, guest: "Band Akustik Senja" }, KASIR);
  t("dengan nama penerima: dibuka", runningOn(d.st(), ENT)?.guest, "Band Akustik Senja");

  const s0 = d.st();
  const stokNasgor = stok(s0, NASGOR), stokTeh = stok(s0, TEH);
  const nilai = harga(s0, NASGOR) * 3 + harga(s0, TEH) * 4;
  d.pesan(jam(19, 5), ENT, NASGOR, 3);
  d.pesan(jam(19, 6), ENT, TEH, 4);
  const s1 = d.st();
  const sesi = runningOn(s1, ENT)!;
  t("dua baris tercatat", sesi.fnb.length, 2);
  t("harganya Rp 0", sesi.fnb.map((l) => l.unitPrice), [0, 0]);
  t("harga asli disimpan sebagai compliment", sesi.fnb.reduce((n, l) => n + (l.comp ?? 0), 0), nilai);
  t("ditandai compliment Entertain", sesi.fnb.map((l) => l.compUntuk), ["entertain", "entertain"]);
  t("tiket tetap masuk dapur & bar",
    s1.tickets.filter((x) => x.sessionId === sesi.id).map((x) => x.station).sort(), ["bar", "kitchen"]);
  if (stokNasgor != null) t("stok nasi goreng berkurang", stok(s1, NASGOR), stokNasgor - 3);
  if (stokTeh != null) t("stok ice tea berkurang", stok(s1, TEH), stokTeh - 4);
  t("tagihan Rp 0", settlementOf(sesi, s1, jam(22)).due, 0);

  d.push(jam(22), { t: "settle", id: sesi.id, channel: "cash" }, KASIR);
  const s2 = d.st();
  const tutup = s2.sessions.find((x) => x.id === sesi.id)!;
  t("tab tertutup", tutup.status, "done");
  t("uang diterima Rp 0", tutup.settledAmount, 0);
  t("compliment tercatat di tab", tutup.settledCompliment, nilai);
  const r = recap(s2, undefined, "smh");
  t("omzet tidak bertambah", r.gross, 0);
  t("laporan: compliment total", r.compliment, nilai);
  t("laporan: rincian meja Entertain", r.complimentMeja, { owner: 0, entertain: nilai });
  const r3 = rekapTigaJenis(s2, businessDateOf(jam(12)), "smh");
  t("struk rekap Smokehouse: compliment Entertain", r3.complimentMeja?.entertain, nilai);
}

console.log("\n-- Reservasi tamu tidak memakai meja compliment --");
{
  const s = dunia().st();
  const besok = jam(19) + 86_400_000;
  t("reservasi langsung ke meja Entertain ditolak",
    restoProblem(s, { pax: 4, startsAt: besok, hours: 2, tableId: ENT }, jam(12)), "meja resto untuk jam itu sudah penuh");
  t("reservasi ke meja VIP boleh", restoProblem(s, { pax: 6, startsAt: besok, hours: 2, tableId: VIP }, jam(12)), null);
}

console.log("\n-- Owner, VIP, dan meja biasa --");
{
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: OWNER, guest: "Pak Budi & keluarga" }, KASIR);
  d.push(jam(19), { t: "walkin", tableId: VIP, guest: "Rombongan Andi" }, KASIR);
  d.pesan(jam(19, 5), OWNER, NASGOR, 2);
  d.pesan(jam(19, 5), VIP, NASGOR, 2);
  const s = d.st();
  t("meja Owner: Rp 0, compliment owner",
    runningOn(s, OWNER)!.fnb.map((l) => [l.unitPrice, l.compUntuk]), [[0, "owner"]]);
  t("meja VIP: dibayar penuh", settlementOf(runningOn(s, VIP)!, s, jam(21)).due > 0, true);
  t("meja VIP: bukan compliment", runningOn(s, VIP)!.fnb[0].comp, undefined);
  d.push(jam(21), { t: "settle", id: runningOn(s, OWNER)!.id, channel: "cash" }, KASIR);
  t("laporan: rincian meja Owner", recap(d.st(), undefined, "smh").complimentMeja?.owner, harga(s, NASGOR) * 2);
}

console.log("\n-- Celah yang ditutup --");
{
  const d = dunia();
  d.push(jam(19), { t: "walkin", tableId: ENT, guest: "Band" }, KASIR);
  t("pesanan QR tamu ke meja Entertain ditolak",
    guestOrderProblem(d.st(), { mode: "meja", tableId: ENT, pay: "kasir", lines: [{ key: "a", itemId: TEH, qty: 1 }] }, jam(19, 5)),
    "Entertain dipesan lewat kasir atau waiter");
  t("pesanan QR ke meja Owner juga ditolak",
    guestOrderProblem(d.st(), { mode: "meja", tableId: OWNER, pay: "kasir", lines: [{ key: "a", itemId: TEH, qty: 1 }] }, jam(19, 5)),
    "Owner dipesan lewat kasir atau waiter");

  // Pesanan tamu yang membayar dipindah ke meja Entertain = digratiskan.
  d.push(jam(19, 10), { t: "walkin", tableId: R03, guest: "Tamu bayar" }, KASIR);
  d.pesan(jam(19, 11), R03, NASGOR, 1);
  const kunci = runningOn(d.st(), R03)!.fnb[0].key;
  const pindah = (by: string, at: number) => d.push(at, {
    t: "moveFnb", fromId: runningOn(d.st(), R03)!.id, toId: runningOn(d.st(), ENT)!.id, keys: [kunci],
  } as Action, by);
  pindah(KASIR, jam(19, 20));
  t("kru kasir TIDAK bisa memindah pesanan ke meja Entertain", runningOn(d.st(), R03)!.fnb.length, 1);
  pindah("u-manager", jam(19, 21));
  t("manajer bisa (koreksi salah input)", runningOn(d.st(), R03)?.fnb.length ?? 0, 0);
  t("yang dipindah jadi compliment", runningOn(d.st(), ENT)!.fnb.map((l) => [l.unitPrice, l.compUntuk]), [[0, "entertain"]]);

  // Baris compliment tidak bisa dipindah KELUAR ke meja yang membayar.
  d.pesan(jam(19, 30), ENT, TEH, 1);
  d.push(jam(19, 31), { t: "walkin", tableId: "S104", guest: "Tamu lain" }, KASIR);
  const kunciEnt = runningOn(d.st(), ENT)!.fnb.map((l) => l.key);
  d.push(jam(19, 32), {
    t: "moveFnb", fromId: runningOn(d.st(), ENT)!.id, toId: runningOn(d.st(), "S104")!.id, keys: kunciEnt,
  } as Action, "u-manager");
  t("baris compliment tetap di meja Entertain", runningOn(d.st(), ENT)!.fnb.length, 2);
}

console.log(`\n${total - bad}/${total} lulus`);
if (bad) process.exit(1);
