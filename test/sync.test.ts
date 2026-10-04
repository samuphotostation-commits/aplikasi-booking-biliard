/* ═══════════════════════════════════════════════════════════════════
   UJI SINKRONISASI ANTAR-TAB (venueStore)

   Mesin sudah diuji 100 simulasi; berkas ini menguji LAPISAN DI ATASNYA:
   penyimpanan jejak di perangkat dan siaran antar-tab. Semuanya memakai
   browser tiruan (test/fakeBrowser.ts) supaya urutan siaran bisa diacak.
   ═══════════════════════════════════════════════════════════════════ */
import { Tab, deliverAll, deliverSome, posted, resetWorld, setQuota, shared, sleep } from "./fakeBrowser";
import { createVenueStore } from "../src/lib/venueStore";
import { canOpenWalkin, replay, tickState, type Entry, type Genesis, type State } from "../src/lib/engine";
import { EMPLOYEES } from "../src/data/staff";
import { TABLES } from "../src/data/venue";
// Jam tiruan dipatok WIB seperti mesinnya; kalau ikut zona mesin penguji, tes
// ini hanya lolos di perangkat yang kebetulan disetel WIB.
import { dariWib, tanggalWib } from "../src/lib/occupancy";
import { MENU } from "../src/data/menu";
import { slotStart } from "../src/lib/occupancy";
import { addDaysISO, todayISO } from "../src/lib/core";

// Jam tiruan mulai pukul 15.00 hari ini (maju 7 ms tiap dibaca): hasil tidak bergantung
// kapan tes dijalankan — di luar jam buka, walk-in memang ditolak mesin.
let fakeNow = (() => { const [y, m, d] = tanggalWib(Date.now()).split("-").map(Number); return dariWib(y, m, d, 15); })();
let frozen = false;
Date.now = () => (frozen ? fakeNow : (fakeNow += 7));
const setNow = (ts: number) => { fakeNow = ts; };

/**
 * Pembanding kebenaran, bukan sekadar "semua tab sama": state harus sama dengan memutar ulang
 * SEMUA kejadian yang pernah dikirim tab mana pun. Tanpa ini, tab-tab bisa kompak kehilangan
 * kejadian yang sama (mis. titik simpan melipat kejadian yang belum tiba) dan tetap terlihat "sinkron".
 */
function matchesTruth(views: State[], genesis: Genesis): boolean {
  const all = posted
    .filter((m): m is { type: string; genesisAt: number; entry: Entry } =>
      !!m && typeof m === "object" && (m as { type?: string }).type === "entry" && (m as { genesisAt?: number }).genesisAt === genesis.at)
    .map((m) => m.entry);
  const truth = norm(tickState(replay(genesis, all), fakeNow));
  return views.every((v) => norm(v) === truth);
}
const storageKB = () => Math.round([...shared.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0) / 1024);
const freeTable = (v: State) => TABLES.find((x) => canOpenWalkin(v.sessions, x.id, Date.now()))!.id;

let bad = 0, total = 0;
const t = (label: string, ok: boolean, detail = "") => {
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  ${detail}`));
};
const norm = (x: unknown) => JSON.stringify({ ...(x as object), me: null });
const owner = EMPLOYEES.find((e) => e.id === "u-owner")!;
const kasir = EMPLOYEES.find((e) => e.role === "karyawan")!;
const items = MENU.flatMap((c) => c.items);

console.log("-- Banyak tab mengirim aksi bersamaan, siaran tiba acak --");
{
  let converged = 0;
  const SEEDS = 12;
  for (let seed = 1; seed <= SEEDS; seed++) {
    resetWorld();
    let x = seed;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const stores = [0, 1, 2].map((i) => { new Tab(`t${i}`).install(); return createVenueStore(); });
    stores[0].dispatch({ t: "login", emp: owner });
    stores[1].dispatch({ t: "login", emp: kasir });
    stores[2].dispatch({ t: "login", emp: owner });
    stores[0].dispatch({ t: "openShift", openingCash: 100_000 });
    deliverAll();
    const tomorrow = addDaysISO(todayISO(), 1);
    for (let step = 0; step < 250; step++) {
      const s = pick(stores);
      const v = s.getView();
      const running = v.sessions.filter((y) => y.status === "running");
      const r = rnd();
      if (r < 0.15) s.dispatch({ t: "walkin", tableId: pick(TABLES).id, guest: `g${step}` });
      else if (r < 0.3 && running.length) s.dispatch({ t: "addFnb", sessionId: pick(running).id, name: "x", station: "kitchen", line: { key: `k${seed}-${step}`, itemId: pick(items).id, qty: 1 + Math.floor(rnd() * 3) } });
      else if (r < 0.4 && running.length) s.dispatch({ t: "settle", id: pick(running).id, channel: pick(["cash", "edc"] as const) });
      else if (r < 0.55) {
        // Dua tab bisa menahan slot yang sama sebelum saling mendengar — pemenangnya harus sama di semua tab.
        const code = `SPL-S${seed}X${step}`;
        const startsAt = slotStart(tomorrow, 11 + Math.floor(rnd() * 12));
        const sess = { id: `o-${code}`, tableId: pick(TABLES.slice(0, 3)).id, source: "online" as const, guest: "c", startsAt, endsAt: startsAt + 3_600_000, status: "hold" as const, bookingCode: code, fnb: [], tableAmount: 0, paidOnline: 0 };
        s.dispatch({ t: "hold", session: sess });
        const h = s.getView().sessions.find((y) => y.id === sess.id);
        if (h && rnd() < 0.7) s.dispatch({ t: "confirmOnline", session: { ...sess, status: "booked", checkin: `C${seed}${step}`, paidOnline: h.tableAmount } });
      } else if (r < 0.65) s.dispatch({ t: "toggleLight", tableId: pick(TABLES).id });
      else if (r < 0.72) s.dispatch({ t: "setRate", key: "regularNight", value: 30_000 + Math.floor(rnd() * 20) * 1000 });
      else if (r < 0.8 && running.length) s.dispatch({ t: "requestVoid", req: { targetKind: "sesi", targetId: pick(running).id, label: "", amount: 0, reason: "tes" } });
      else if (r < 0.85) { const w = v.voids.find((y) => y.status === "menunggu"); if (w) s.dispatch({ t: "decideVoid", id: w.id, approve: rnd() < 0.5 }); }
      if (rnd() < 0.35) deliverSome(rnd);
    }
    deliverAll(); await sleep(80); deliverAll();
    frozen = true;
    stores.forEach((s) => s.refresh());
    new Tab("baru").install();
    const fresh = createVenueStore();
    const ok = matchesTruth([...stores.map((s) => s.getView()), fresh.getView()], fresh.info().genesis);
    frozen = false;
    if (ok) converged++;
    else console.log(`        seed ${seed} berbeda dari pemutaran ulang semua kejadian`);
  }
  t(`${SEEDS} dunia × 3 tab × 250 aksi: semua tab & tab baru sama dengan pemutaran ulang semua kejadian`, converged === SEEDS, `${converged}/${SEEDS}`);
}

console.log("\n-- Muat ulang halaman: data tidak hilang --");
{
  resetWorld();
  new Tab("kasir").install();
  const a = createVenueStore();
  a.dispatch({ t: "login", emp: owner });
  a.dispatch({ t: "openShift", openingCash: 250_000 });
  a.dispatch({ t: "walkin", tableId: freeTable(a.getView()), guest: "Reload" });
  a.dispatch({ t: "setRate", key: "vip", value: 61_000 });
  const before = norm(a.getView());
  new Tab("kasir-dimuat-ulang").install();
  const b = createVenueStore();
  t("state setelah dimuat ulang sama persis", norm(b.getView()) === before);
  t("shift & open bill masih ada", !!b.getView().shift && b.getView().sessions.some((s) => s.guest === "Reload" && s.status === "running"));
}

console.log("\n-- Reset data saat ada tab yang belum mendengar reset --");
{
  resetWorld();
  new Tab("kasir").install();
  const A = createVenueStore();
  new Tab("atur").install();
  const B = createVenueStore();
  A.dispatch({ t: "login", emp: owner });
  A.dispatch({ t: "openShift", openingCash: 500_000 });
  A.dispatch({ t: "setRate", key: "vip", value: 77_777 });
  deliverAll(); await sleep(80);
  B.reset(false);                                   // superadmin mereset di tab lain
  A.dispatch({ t: "toggleLight", tableId: "T03" }); // tab kasir mengklik sebelum siaran reset tiba
  deliverAll(); await sleep(120); deliverAll();
  new Tab("baru").install();
  const C = createVenueStore();
  for (const [name, s] of [["tab kasir", A], ["tab atur", B], ["tab baru", C]] as const) {
    const v = s.getView();
    t(`${name}: jejak sebelum reset tidak hidup lagi`, !v.shift && v.rates.vip !== 77_777 && s.info().entries === 0,
      `shift=${!!v.shift} vip=${v.rates.vip} entries=${s.info().entries}`);
  }
  t("tidak ada potongan jejak lama tersisa di penyimpanan", ![...shared.keys()].some((k) => k.includes(":log:") && JSON.parse(shared.get(k)!).length > 0));
}

console.log("\n-- Kejadian bercap dunia lain diabaikan (siaran/penyimpanan basi) --");
{
  resetWorld();
  new Tab("a").install();
  const A = createVenueStore();
  A.dispatch({ t: "login", emp: owner });
  A.dispatch({ t: "openShift", openingCash: 100_000 });
  const g = A.info().genesis.at;
  // Potongan jejak dari dunia lama yang tertulis belakangan oleh tab yang tertidur.
  shared.set("spl:v1:log:basi:0", JSON.stringify([{ id: "basi:000001", at: Date.now() + 5, by: owner.id, g: g - 1, act: { t: "setRate", key: "vip", value: 12_345 } }]));
  new Tab("b").install();
  const B = createVenueStore();
  t("tab baru tidak memutar kejadian dunia lama", B.getView().rates.vip !== 12_345 && B.info().entries === A.info().entries);
}

console.log("\n-- Titik simpan: jejak lama dilipat & dibuang, membuka aplikasi tetap identik --");
{
  resetWorld();
  const opts = { snapshotEvery: 60, settleMs: 1_000 };
  new Tab("kasir").install();
  const A = createVenueStore(opts);
  A.dispatch({ t: "login", emp: owner });
  A.dispatch({ t: "openShift", openingCash: 100_000 });
  for (let i = 0; i < 400; i++) {
    fakeNow += 20_000;
    const v = A.getView();
    const running = v.sessions.filter((s) => s.status === "running");
    if (i % 3 === 0 || running.length === 0) A.dispatch({ t: "walkin", tableId: freeTable(v), guest: `s${i}` });
    else if (i % 3 === 1) A.dispatch({ t: "toggleLight", tableId: running[0].tableId });
    else A.dispatch({ t: "settle", id: running[0].id, channel: "cash" });
  }
  fakeNow += 5_000;
  A.dispatch({ t: "toggleLight", tableId: "T01" });
  const info = A.info();
  const logged = [...shared.entries()].filter(([k]) => k.includes(":log:")).reduce((n, [, v]) => n + (JSON.parse(v) as unknown[]).length, 0);
  t("titik simpan dibuat", info.snapshotAt !== null, JSON.stringify(info));
  t(`jejak yang diputar saat dibuka tinggal ${info.tail} dari ${info.entries} kejadian`, info.tail < 130 && info.entries >= 400);
  t(`kejadian yang masih tersimpan di penyimpanan hanya ${logged}`, logged === info.tail);
  frozen = true;
  A.refresh();
  new Tab("dibuka-lagi").install();
  const B = createVenueStore(opts);
  t("aplikasi yang dibuka dari titik simpan identik & tidak kehilangan kejadian", matchesTruth([A.getView(), B.getView()], B.info().genesis));
  frozen = false;
  t("jumlah kejadian tetap tercatat utuh", B.info().entries === info.entries);
}

console.log("\n-- Titik simpan yang lebih lama tidak boleh menimpa yang lebih baru --");
{
  resetWorld();
  // Tab B punya jendela mapan lebih panjang (mis. jamnya tertinggal), jadi potongannya lebih
  // tua dari titik simpan tab A. Kalau B menimpa, jejak di antaranya — yang sudah dibuang A — hilang.
  new Tab("a").install();
  const A = createVenueStore({ snapshotEvery: 40, settleMs: 1_000 });
  new Tab("b").install();
  const B = createVenueStore({ snapshotEvery: 40, settleMs: 30 * 60_000 });
  A.dispatch({ t: "login", emp: owner });
  A.dispatch({ t: "openShift", openingCash: 100_000 });
  for (let i = 0; i < 120; i++) {
    fakeNow += 20_000;
    A.dispatch({ t: "toggleLight", tableId: TABLES[i % TABLES.length].id });
    deliverAll();
  }
  const aUpto = A.info().snapshotAt;
  // 15 menit kemudian B punya cukup kejadian "mapan" menurut jendelanya sendiri untuk membuat
  // titik simpan — tapi potongannya masih lebih tua dari titik simpan A.
  fakeNow += 15 * 60_000;
  B.dispatch({ t: "toggleLight", tableId: "T02" });
  deliverAll();
  frozen = true;
  A.refresh(); B.refresh();
  new Tab("baru").install();
  const C = createVenueStore({ snapshotEvery: 40, settleMs: 1_000 });
  t("tab A membuat titik simpan", aUpto !== null);
  t("titik simpan tersimpan tidak mundur", (C.info().snapshotAt ?? 0) >= (aUpto ?? Infinity));
  t("tab baru, A, dan B sama dengan pemutaran ulang semua kejadian", matchesTruth([A.getView(), B.getView(), C.getView()], C.info().genesis));
  frozen = false;
}

console.log("\n-- Titik simpan di banyak tab dengan siaran acak --");
{
  let converged = 0;
  const SEEDS = 8;
  for (let seed = 1; seed <= SEEDS; seed++) {
    resetWorld();
    let x = seed * 7919;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const opts = { snapshotEvery: 40, settleMs: 3_000 };
    const stores = [0, 1, 2].map((i) => { new Tab(`t${i}`).install(); return createVenueStore(opts); });
    stores[0].dispatch({ t: "login", emp: owner });
    stores[1].dispatch({ t: "login", emp: kasir });
    stores[2].dispatch({ t: "login", emp: owner });
    stores[0].dispatch({ t: "openShift", openingCash: 100_000 });
    deliverAll();
    for (let step = 0; step < 300; step++) {
      fakeNow += 50;
      const s = pick(stores);
      const v = s.getView();
      const running = v.sessions.filter((y) => y.status === "running");
      const r = rnd();
      if (r < 0.3) s.dispatch({ t: "walkin", tableId: pick(TABLES).id, guest: `g${step}` });
      else if (r < 0.55 && running.length) s.dispatch({ t: "addFnb", sessionId: pick(running).id, name: "x", station: "kitchen", line: { key: `k${seed}-${step}`, itemId: pick(items).id, qty: 1 } });
      else if (r < 0.7 && running.length) s.dispatch({ t: "settle", id: pick(running).id, channel: "cash" });
      else s.dispatch({ t: "toggleLight", tableId: pick(TABLES).id });
      // Siaran tiba acak, tapi tidak pernah tertunda lebih lama dari jendela mapan titik simpan.
      if (step % 15 === 14) deliverAll(); else if (rnd() < 0.4) deliverSome(rnd);
    }
    deliverAll(); await sleep(80); deliverAll();
    frozen = true;
    stores.forEach((s) => s.refresh());
    new Tab("baru").install();
    const fresh = createVenueStore(opts);
    const snapshots = stores.filter((s) => s.info().snapshotAt !== null).length;
    const ok = matchesTruth([...stores.map((s) => s.getView()), fresh.getView()], fresh.info().genesis);
    frozen = false;
    if (ok && snapshots > 0) converged++;
    else console.log(`        seed ${seed} berbeda dari kebenaran (tab dengan titik simpan: ${snapshots})`);
  }
  t(`${SEEDS} dunia × 3 tab dengan titik simpan: semua tab & tab baru sama dengan pemutaran ulang semua kejadian`, converged === SEEDS, `${converged}/${SEEDS}`);
}

console.log("\n-- Dipakai berhari-hari: penyimpanan tidak penuh --");
{
  resetWorld();
  const opts = { snapshotEvery: 200, settleMs: 5 * 60_000 };
  const firstDay = dariWib(2026, 9, 1, 11);
  setNow(firstDay - 60_000);                        // genesis tepat sebelum hari pertama
  new Tab("kasir").install();
  const A = createVenueStore(opts);
  A.reset(false);
  const DAYS = 8;
  let actions = 0;
  for (let d = 0; d < DAYS; d++) {
    setNow(firstDay + d * 24 * 3_600_000);
    A.dispatch({ t: "login", emp: owner });
    A.dispatch({ t: "openShift", openingCash: 200_000 });
    const until = firstDay + d * 24 * 3_600_000 + 14 * 3_600_000;
    while (fakeNow < until) {
      fakeNow += 3 * 60_000;
      const v = A.getView();
      const running = v.sessions.filter((s) => s.status === "running");
      const r = ((fakeNow / 60_000) * 7919) % 10;
      if (r < 3 && running.length < 20) { const id = TABLES.find((x) => canOpenWalkin(v.sessions, x.id, Date.now()))?.id; if (id) A.dispatch({ t: "walkin", tableId: id, guest: "tamu" }); }
      else if (r < 7 && running.length) A.dispatch({ t: "addFnb", sessionId: running[0].id, name: "x", station: "bar", line: { key: `b${actions}`, itemId: "cd-01", qty: 1 } });
      else if (running.length) A.dispatch({ t: "settle", id: running[running.length - 1].id, channel: "cash" });
      actions++;
    }
    for (const s of A.getView().sessions.filter((x) => x.status === "running")) A.dispatch({ t: "settle", id: s.id, channel: "cash" });
    A.dispatch({ t: "setStock", itemId: "cd-01", qty: 500 });
    A.dispatch({ t: "closeShift", countedCash: 0 });
  }
  fakeNow += 10 * 60_000;
  A.dispatch({ t: "toggleLight", tableId: "T01" });
  const info = A.info();
  frozen = true;
  A.refresh();
  new Tab("dibuka-lagi").install();
  const B = createVenueStore(opts);
  t(`${DAYS} hari · ${info.entries} kejadian: penyimpanan ${storageKB()} KB (batas umum ±5.000 KB)`, storageKB() < 1_500, `${storageKB()} KB`);
  t(`hari yang sudah tutup buku: ${A.getView().history.length}`, A.getView().history.length >= DAYS - 3);
  t(`membuka aplikasi hanya memutar ${info.tail} kejadian terakhir`, info.tail < 400);
  t("aplikasi yang dibuka lagi identik & tidak kehilangan kejadian", matchesTruth([A.getView(), B.getView()], B.info().genesis));
  frozen = false;
}

console.log("\n-- Penyimpanan perangkat penuh --");
{
  resetWorld();
  new Tab("a").install();
  const A = createVenueStore();
  A.dispatch({ t: "login", emp: owner });
  A.dispatch({ t: "openShift", openingCash: 100_000 });
  setQuota([...shared.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0) + 10);
  A.dispatch({ t: "walkin", tableId: freeTable(A.getView()), guest: "Penuh" });
  t("aplikasi tetap jalan (aksi tetap berlaku di tab ini)", A.getView().sessions.some((s) => s.guest === "Penuh"));
  t("peringatan penyimpanan penuh muncul", !!A.info().storageError && !A.info().persisted);
}

console.log("");
console.log(bad === 0 ? `SEMUA BENAR (${total} pemeriksaan)` : `${bad} dari ${total} SALAH`);
if (bad > 0) process.exitCode = 1;
