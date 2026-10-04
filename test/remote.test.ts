/* ═══════════════════════════════════════════════════════════════════
   UJI SINKRONISASI LINTAS PERANGKAT (tahap S1 — server tiruan)

   `test/sync.test.ts` menguji beberapa tab di SATU perangkat. Berkas ini
   menguji yang sesungguhnya diminta pemilik: HP, tablet kasir, dan PC
   Windows — perangkat berbeda, penyimpanan berbeda — memakai satu jejak
   bersama yang urutannya ditentukan server.

   Pembanding kebenaran bukan "semua perangkat sama", melainkan: state
   setiap perangkat harus sama dengan memutar ulang JEJAK RESMI SERVER.
   ═══════════════════════════════════════════════════════════════════ */
import { Device, Tab, resetWorld, sleep } from "./fakeBrowser";
import { fakeServer, type FakeServer } from "./fakeServer";
import { createVenueStore, type VenueStore } from "../src/lib/venueStore";
import { canOpenWalkin, replay, tickState, type Genesis, type State } from "../src/lib/engine";
import { publicVenue } from "../src/lib/publicView";
import { EMPLOYEES } from "../src/data/staff";
import { TABLES } from "../src/data/venue";
// Jam tiruan dipatok WIB seperti mesinnya, bukan zona mesin penguji.
import { dariWib, tanggalWib } from "../src/lib/occupancy";
import { MENU } from "../src/data/menu";

/* ── Jam: perangkat vs server ────────────────────────────────────────
   Jam perangkat dibekukan (tes yang memajukannya) dan tidak pernah
   tertinggal dari jam server. Jam server maju sendiri setiap kejadian —
   inilah jam yang masuk jejak. */
const base = (() => { const [y, m, d] = tanggalWib(Date.now()).split("-").map(Number); return dariWib(y, m, d, 15); })();
let deviceNow = base;
let serverNow = base;
Date.now = () => (deviceNow = Math.max(deviceNow, serverNow));
const serverClock = () => (serverNow += 500);

let bad = 0, total = 0;
const t = (label: string, ok: boolean, detail = "") => {
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  ${detail}`));
};
const norm = (x: unknown) => JSON.stringify({ ...(x as object), me: null });
const owner = EMPLOYEES.find((e) => e.id === "u-owner")!;
const kasir = EMPLOYEES.find((e) => e.role === "karyawan" && e.active)!;
const items = MENU.flatMap((c) => c.items);
const freeTable = (v: State) => TABLES.find((x) => canOpenWalkin(v.sessions, x.id, Date.now()))!.id;

const TOKENS = { "tok-owner": owner.id, "tok-kasir": kasir.id };

type Dev = {
  name: string;
  device: Device;
  link: ReturnType<FakeServer["device"]>;
  store: VenueStore;
};
const opened: Dev[] = [];

function makeServer(seed = false) {
  serverNow = Math.max(serverNow, base);
  return fakeServer({ genesis: { at: base, seed }, now: serverClock, tokens: TOKENS });
}

/** Perangkat baru: penyimpanan sendiri, sambungan sendiri ke server. */
function newDevice(server: FakeServer, name: string, token?: keyof typeof TOKENS, opts: Parameters<typeof createVenueStore>[0] = {}): Dev {
  const device = new Device(name);
  new Tab(name, device).install();
  const link = server.device(token ? { token } : {});
  const store = createVenueStore({ remote: link.remote, retryMs: 60_000, ...opts });
  const dev = { name, device, link, store };
  opened.push(dev);
  return dev;
}

/** Aplikasi di perangkat yang sama dibuka ulang (jejak & antrean dibaca dari penyimpanannya). */
function reopen(server: FakeServer, dev: Dev, token?: keyof typeof TOKENS, opts: Parameters<typeof createVenueStore>[0] = {}): Dev {
  dev.store.stop();
  new Tab(`${dev.name}-buka-lagi`, dev.device).install();
  const link = server.device(token ? { token } : {});
  const store = createVenueStore({ remote: link.remote, retryMs: 60_000, ...opts });
  const next = { name: dev.name, device: dev.device, link, store };
  opened.push(next);
  return next;
}

/** Tunggu antrean terkirim, siaran tiba, dan setiap perangkat menarik yang tertinggal. */
async function settle(server: FakeServer, devs: Dev[]) {
  for (let i = 0; i < 3; i++) { await sleep(0); server.deliverAll(); }
  for (const d of devs) await d.store.sync();
  server.deliverAll();
  await sleep(0);
}

/** Kebenaran: putar ulang jejak resmi server. */
const truth = (server: FakeServer) => norm(tickState(replay(server.genesis as Genesis, server.log), Date.now()));
const allMatch = (server: FakeServer, devs: Dev[]) => devs.every((d) => norm(d.store.getView()) === truth(server));

/* ═══ 1. Satu jejak, tiga perangkat ═══════════════════════════════ */
console.log("-- HP, tablet kasir, dan PC memakai satu jejak bersama --");
{
  resetWorld();
  const server = makeServer();
  const pc = newDevice(server, "pc-kasir", "tok-owner");
  const tablet = newDevice(server, "tablet", "tok-kasir");
  const hp = newDevice(server, "hp-tamu");                    // tanpa token: hanya aksi pelanggan
  const devs = [pc, tablet, hp];

  pc.store.dispatch({ t: "login", emp: owner });
  tablet.store.dispatch({ t: "login", emp: kasir });
  pc.store.dispatch({ t: "openShift", openingCash: 300_000 });
  await settle(server, devs);

  const meja = freeTable(pc.store.getView());
  pc.store.dispatch({ t: "walkin", tableId: meja, guest: "Tamu PC" });
  await settle(server, devs);

  t("meja yang dibuka di PC langsung terlihat di tablet & HP",
    devs.every((d) => d.store.getView().sessions.some((s) => s.guest === "Tamu PC" && s.status === "running")));
  t("ketiga perangkat identik dengan jejak resmi server", allMatch(server, devs));
  t("nomor urut server berurutan 1..N tanpa bolong",
    server.log.every((e, i) => e.seq === i + 1));
  t("jam kejadian selalu maju (jam server, bukan jam perangkat)",
    server.log.every((e, i) => i === 0 || e.at > server.log[i - 1].at));

  // Pesanan dari HP tamu (tanpa token) tetap boleh: aksi pelanggan berjalan dengan pelaku null.
  const sess = pc.store.getView().sessions.find((s) => s.guest === "Tamu PC")!;
  const it = items.find((x) => !pc.store.getView().soldOut.includes(x.id))!;
  hp.store.dispatch({
    t: "guestOrder",
    order: {
      id: "g-hp-1", code: "SPL-HP1", guest: "Tamu HP", mode: "meja", tableId: meja, pay: "kasir",
      lines: [{ key: "hp-1", itemId: it.id, qty: 1 }], paidOnline: 0, sessionId: sess.id,
    },
  });
  await settle(server, devs);
  t("pesanan dari HP masuk bill & dapur di perangkat kasir",
    pc.store.getView().orders.some((o) => o.id === "g-hp-1" && o.status === "diterima") &&
    pc.store.getView().tickets.some((k) => k.sessionId === sess.id));
  t("pelaku kejadian dari HP tercatat tanpa nama staf",
    server.log.find((e) => e.act.t === "guestOrder")?.by === null);
}

/* ═══ 2. Perangkat tidak bisa berpura-pura jadi orang lain ════════ */
console.log("\n-- Pelaku diambil dari token PIN, bukan dari isian perangkat --");
{
  resetWorld();
  const server = makeServer();
  const pc = newDevice(server, "pc", "tok-owner");
  const tablet = newDevice(server, "tablet-nakal", "tok-kasir");
  const devs = [pc, tablet];
  pc.store.dispatch({ t: "login", emp: owner });
  await settle(server, devs);

  // Layar tablet "login" sebagai pemilik, lalu mencoba mengubah tarif (hanya superadmin).
  tablet.store.dispatch({ t: "login", emp: owner });
  const tarifLama = pc.store.getView().rates.regularDay;
  tablet.store.dispatch({ t: "setRate", key: "regularDay", value: 1_000 });
  await settle(server, devs);

  const e = server.log.find((x) => x.act.t === "setRate");
  t("kejadiannya tetap masuk jejak, tapi pelakunya = pemilik token (karyawan)", e?.by === kasir.id);
  t("tarif tidak berubah — mesin menolak aksi karyawan", pc.store.getView().rates.regularDay === tarifLama);
  t("semua perangkat tetap identik dengan jejak server", allMatch(server, devs));

  // Kejadian rusak dari perangkat nakal: ditolak server, jejak tidak bertambah.
  const sebelum = server.log.length;
  const res = await tablet.link.remote.push([{ id: "nakal-1", act: { t: "settle" } as never }]);
  t("aksi yang bentuknya tidak sah ditolak server (gagal tertutup)", res.ok === false && res.error === "ditolak");
  t("jejak server tidak bertambah karena kejadian rusak", server.log.length === sebelum);
}

/* ═══ 3. Internet putus ══════════════════════════════════════════ */
console.log("\n-- Internet putus di tablet kasir --");
{
  resetWorld();
  const server = makeServer();
  const pc = newDevice(server, "pc", "tok-owner");
  const tablet = newDevice(server, "tablet", "tok-kasir");
  const devs = [pc, tablet];
  pc.store.dispatch({ t: "login", emp: owner });
  tablet.store.dispatch({ t: "login", emp: kasir });
  pc.store.dispatch({ t: "openShift", openingCash: 200_000 });
  await settle(server, devs);

  const meja = freeTable(tablet.store.getView());
  tablet.link.online = false;
  const alasan = tablet.store.dispatch({ t: "walkin", tableId: meja, guest: "Tamu Offline" });
  await settle(server, [pc]);

  t("aksi pelayanan tetap jalan saat terputus", alasan === null &&
    tablet.store.getView().sessions.some((s) => s.guest === "Tamu Offline"));
  t("statusnya 'menunggu konfirmasi' & banner terputus muncul",
    tablet.store.info().pending === 1 && tablet.store.info().online === false);
  t("perangkat lain belum melihatnya (server belum memberi urutan)",
    !pc.store.getView().sessions.some((s) => s.guest === "Tamu Offline"));

  const sess = tablet.store.getView().sessions.find((s) => s.guest === "Tamu Offline")!;
  const tolak = tablet.store.dispatch({ t: "settle", id: sess.id, channel: "cash", amount: 0, billiard: 0, fnb: 0, discount: 0 });
  t("aksi uang DIKUNCI saat terputus, dengan alasan yang jelas", typeof tolak === "string" && /tidak tersambung/i.test(tolak));
  t("tab belum ditutup & antrean tidak bertambah",
    tablet.store.getView().sessions.find((s) => s.id === sess.id)?.status === "running" && tablet.store.info().pending === 1);

  // Aplikasi tablet ditutup-buka saat masih terputus: antrean tidak boleh hilang.
  const tablet2 = reopen(server, tablet, "tok-kasir");
  tablet2.link.online = false;
  t("antrean bertahan setelah aplikasi dibuka ulang", tablet2.store.info().pending === 1 &&
    tablet2.store.getView().sessions.some((s) => s.guest === "Tamu Offline"));

  tablet2.link.online = true;
  await settle(server, [pc, tablet2]);
  t("begitu tersambung, antrean terkirim & dapat urutan server",
    tablet2.store.info().pending === 0 && tablet2.store.info().online === true &&
    server.log.some((e) => e.act.t === "walkin"));
  t("perangkat lain ikut melihat meja itu",
    pc.store.getView().sessions.some((s) => s.guest === "Tamu Offline" && s.status === "running"));
  t("kedua perangkat identik dengan jejak server", allMatch(server, [pc, tablet2]));

  const kunciHilang = tablet2.store.dispatch({ t: "settle", id: sess.id, channel: "cash", amount: 0, billiard: 0, fnb: 0, discount: 0 });
  await settle(server, [pc, tablet2]);
  t("aksi uang boleh lagi setelah tersambung", kunciHilang === null &&
    pc.store.getView().sessions.find((s) => s.id === sess.id)?.status === "done");
}

/* ═══ 4. Kirim ulang tidak membuat data dobel ════════════════════ */
console.log("\n-- Jawaban server hilang di jalan, perangkat mengirim ulang --");
{
  resetWorld();
  const server = makeServer();
  const pc = newDevice(server, "pc", "tok-owner");
  pc.store.dispatch({ t: "login", emp: owner });
  await settle(server, [pc]);

  const p = { id: "ulang-1", act: { t: "openShift", openingCash: 150_000 } as const };
  const a = await pc.link.remote.push([p]);
  const b = await pc.link.remote.push([p]);                   // kirim ulang dengan id sama
  server.deliverAll();
  await settle(server, [pc]);

  t("kejadian yang sama tidak masuk dua kali", server.log.filter((e) => e.id === "ulang-1").length === 1);
  t("kirim ulang mendapat urutan yang sama",
    a.ok && b.ok && a.accepted[0].seq === b.accepted[0].seq && a.accepted[0].at === b.accepted[0].at);
  t("shift hanya terbuka satu kali", server.log.filter((e) => e.act.t === "openShift").length === 1 &&
    pc.store.getView().shift?.openingCash === 150_000);
}

/* ═══ 5. Rebutan meja: server yang menentukan pemenang ═══════════ */
console.log("\n-- Dua perangkat merebut meja yang sama --");
{
  resetWorld();
  const server = makeServer();
  const pc = newDevice(server, "pc", "tok-owner");
  const tablet = newDevice(server, "tablet", "tok-kasir");
  const devs = [pc, tablet];
  pc.store.dispatch({ t: "login", emp: owner });
  tablet.store.dispatch({ t: "login", emp: kasir });
  pc.store.dispatch({ t: "openShift", openingCash: 100_000 });
  await settle(server, devs);

  const meja = freeTable(pc.store.getView());
  pc.store.dispatch({ t: "walkin", tableId: meja, guest: "Rebut A" });
  tablet.store.dispatch({ t: "walkin", tableId: meja, guest: "Rebut B" });
  await settle(server, devs);

  const menang = pc.store.getView().sessions.filter((s) => s.tableId === meja && s.status === "running");
  t("hanya satu rombongan yang mendapat meja itu", menang.length === 1, `${menang.length} sesi`);
  t("kedua layar sepakat siapa yang menang (yang kalah kembali sendiri)",
    norm(pc.store.getView()) === norm(tablet.store.getView()) && allMatch(server, devs));
}

/* ═══ 6. Siaran tiba acak & terlambat ════════════════════════════ */
console.log("-- Siaran server tiba acak, sebagian terlambat --");
{
  let converged = 0;
  const SEEDS = 8;
  for (let seed = 1; seed <= SEEDS; seed++) {
    resetWorld();
    const server = makeServer();
    let x = seed;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const pc = newDevice(server, "pc", "tok-owner");
    const tablet = newDevice(server, "tablet", "tok-kasir");
    const hp = newDevice(server, "hp");
    const devs = [pc, tablet, hp];
    pc.store.dispatch({ t: "login", emp: owner });
    tablet.store.dispatch({ t: "login", emp: kasir });
    pc.store.dispatch({ t: "openShift", openingCash: 250_000 });
    await settle(server, devs);

    for (let step = 0; step < 24; step++) {
      const d = [pc, tablet][Math.floor(rnd() * 2)];
      const v = d.store.getView();
      const running = v.sessions.filter((s) => s.status === "running");
      if (rnd() < 0.5 || running.length === 0) {
        const bisa = TABLES.filter((tb) => canOpenWalkin(v.sessions, tb.id, Date.now()));
        if (bisa.length) d.store.dispatch({ t: "walkin", tableId: bisa[Math.floor(rnd() * bisa.length)].id, guest: `T${seed}-${step}` });
      } else {
        const s = running[Math.floor(rnd() * running.length)];
        const it = items[Math.floor(rnd() * items.length)];
        d.store.dispatch({ t: "addFnb", sessionId: s.id, name: it.name, station: it.station, line: { key: `f${seed}-${step}`, itemId: it.id, qty: 1 } });
      }
      await sleep(0);
      server.deliverSome(rnd);                                 // sebagian siaran tertinggal
    }
    await settle(server, devs);
    if (allMatch(server, devs)) converged++;
    for (const d of devs) d.store.stop();
  }
  t(`${SEEDS} dunia × 3 perangkat × 24 aksi: semua berakhir sama dengan jejak server`, converged === SEEDS, `${converged}/${SEEDS}`);
}

/* ═══ 7. Data direset di server ══════════════════════════════════ */
console.log("\n-- Data direset di server (dunia baru) --");
{
  resetWorld();
  const lama = makeServer();
  const pc = newDevice(lama, "pc", "tok-owner");
  pc.store.dispatch({ t: "login", emp: owner });
  pc.store.dispatch({ t: "openShift", openingCash: 100_000 });
  pc.store.dispatch({ t: "walkin", tableId: freeTable(pc.store.getView()), guest: "Dunia Lama" });
  await settle(lama, [pc]);
  t("perangkat punya data dunia lama", pc.store.getView().sessions.some((s) => s.guest === "Dunia Lama"));

  // Server dipasang ulang dengan genesis berbeda; perangkat yang sama menyambung lagi.
  serverNow += 60_000;
  const baru = fakeServer({ genesis: { at: base + 3_600_000, seed: false }, now: serverClock, tokens: TOKENS });
  const pc2 = reopen(baru, pc, "tok-owner");
  await settle(baru, [pc2]);
  t("perangkat mengikuti dunia server, data lama dibuang",
    !pc2.store.getView().sessions.some((s) => s.guest === "Dunia Lama") &&
    pc2.store.info().genesis.at === base + 3_600_000);
  t("hasilnya identik dengan jejak server yang baru", allMatch(baru, [pc2]));
}

/* ═══ 8. Titik simpan tetap bekerja di mode server ═══════════════ */
console.log("\n-- Dipakai lama: titik simpan di mode server --");
{
  resetWorld();
  const server = makeServer();
  const pc = newDevice(server, "pc", "tok-owner", { snapshotEvery: 20, settleMs: 0 });
  pc.store.dispatch({ t: "login", emp: owner });
  pc.store.dispatch({ t: "openShift", openingCash: 100_000 });
  for (let i = 0; i < 40; i++) {
    pc.store.dispatch({ t: "toggleLight", tableId: TABLES[i % TABLES.length].id });
    await sleep(0);
  }
  deviceNow = serverNow + 60_000;                              // kejadian sudah "mapan"
  await settle(server, [pc]);
  pc.store.dispatch({ t: "toggleLight", tableId: TABLES[0].id });
  await settle(server, [pc]);

  const info = pc.store.info();
  t("titik simpan dibuat & jejak yang diputar saat dibuka jadi pendek",
    info.snapshotAt !== null && info.tail < 25, `tail ${info.tail}`);
  t("nomor urut server yang sudah diterima tercatat", info.head === server.log.length, `head ${info.head} vs ${server.log.length}`);

  const pc2 = reopen(server, pc, "tok-owner", { snapshotEvery: 20, settleMs: 0 });
  await settle(server, [pc2]);
  t("dibuka ulang: identik dengan jejak server", allMatch(server, [pc2]));
}

/* ═══ 9. Token PIN habis ═════════════════════════════════════════ */
console.log("\n-- Token PIN habis di tengah shift --");
{
  resetWorld();
  const server = makeServer();
  const pc = newDevice(server, "pc", "tok-owner");
  pc.store.dispatch({ t: "login", emp: owner });
  await settle(server, [pc]);

  pc.link.token = "tok-hangus";                                // token tidak dikenal server
  pc.store.dispatch({ t: "openShift", openingCash: 100_000 });
  await settle(server, [pc]);
  const info = pc.store.info();
  t("aksinya ditahan (tidak dibuang) dan staf diberi tahu",
    info.pending === 1 && !!info.problem && /PIN/i.test(info.problem));

  pc.link.token = "tok-owner";
  await settle(server, [pc]);
  t("setelah PIN dimasukkan lagi, antrean terkirim", pc.store.info().pending === 0 &&
    pc.store.getView().shift?.openingCash === 100_000);
}

/* ═══ 10. Tampilan publik tanpa data pribadi ═════════════════════ */
console.log("\n-- Yang boleh dibaca HP pelanggan --");
{
  resetWorld();
  const server = makeServer();
  const pc = newDevice(server, "pc", "tok-owner");
  pc.store.dispatch({ t: "login", emp: owner });
  pc.store.dispatch({ t: "openShift", openingCash: 100_000 });
  const meja = freeTable(pc.store.getView());
  pc.store.dispatch({ t: "walkin", tableId: meja, guest: "Budi Santoso" });
  await settle(server, [pc]);
  const sess = pc.store.getView().sessions.find((s) => s.guest === "Budi Santoso")!;
  const it = items.find((x) => !pc.store.getView().soldOut.includes(x.id))!;
  // Booking online 1 jam di jam berikutnya (jam buka 15.00 → 16.00, tarif siang).
  const mulai = new Date(Date.now()); mulai.setHours(mulai.getHours() + 1, 0, 0, 0);
  const mejaBooking = TABLES.find((x) => x.type === "regular" && x.id !== meja)!;
  const bayar = pc.store.getView().rates.regularDay;
  pc.store.dispatch({
    t: "confirmOnline",
    session: {
      id: "o-PUB1", tableId: mejaBooking.id, source: "online", guest: "Siti Rahma",
      phone: "081234567890", startsAt: mulai.getTime(), endsAt: mulai.getTime() + 3_600_000,
      status: "booked", bookingCode: "SPL-PUB1", checkin: "PUB9", fnb: [], tableAmount: 0, paidOnline: bayar,
    },
  });
  pc.store.dispatch({ t: "addFnb", sessionId: sess.id, name: it.name, station: it.station, line: { key: "pub-1", itemId: it.id, qty: 2 } });
  await settle(server, [pc]);

  const v = pc.store.getView();
  const pub = JSON.stringify(publicVenue(v, Date.now()));
  t("booking online diterima server & mesin", v.sessions.some((x) => x.id === "o-PUB1" && x.status === "booked"));
  // Tarif memang publik; yang tidak boleh ikut adalah identitas dan angka uang per tamu.
  const rahasia = ["Budi Santoso", "Siti Rahma", "081234567890", "SPL-PUB1", "PUB9"];
  const terlarang = ["guest", "phone", "bookingCode", "checkin", "paidOnline", "tableAmount", "fnb", "settled", "note", "id"];
  const slotJson = JSON.stringify(publicVenue(v, Date.now()).slots);
  const bocor = [...rahasia.filter((x) => pub.includes(x)), ...terlarang.filter((k) => slotJson.includes(`"${k}"`))];
  t("tidak ada nama, nomor HP, kode booking, kode check-in, pesanan, atau angka uang tamu", bocor.length === 0, bocor.join(", "));
  const slots = publicVenue(v, Date.now()).slots;
  t("ketersediaan meja tetap lengkap (meja terpakai & booking tetap terlihat)",
    slots.some((s) => s.tableId === meja && s.status === "running") && slots.some((s) => s.status === "booked"));
  // Open bill harus ikut ditandai: tanpa ini HP pelanggan menawarkan meja yang
  // tamunya masih main tanpa jam selesai.
  t("meja open bill ditandai untuk HP pelanggan",
    slots.some((s) => s.tableId === meja && s.openBill === true));
  t("tarif, harga menu, promo, dan daftar habis ikut terkirim",
    publicVenue(v, Date.now()).rates.regularDay === v.rates.regularDay &&
    Array.isArray(publicVenue(v, Date.now()).soldOut));
}

for (const d of opened) d.store.stop();
console.log("");
console.log(bad === 0 ? `SEMUA BENAR (${total} pemeriksaan)` : `${bad} dari ${total} SALAH`);
if (bad > 0) process.exitCode = 1;
