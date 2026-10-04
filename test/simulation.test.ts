/* ═══════════════════════════════════════════════════════════════════
   100 SIMULASI HARI OPERASIONAL

   Setiap simulasi menjalankan puluhan aksi acak (tapi bisa diulang lewat
   seed) langsung ke mesin inti — bukan ke tampilan: karyawan & superadmin
   bergantian, shift dibuka-tutup, walk-in, booking online lewat hold QRIS
   (termasuk yang sengaja berebut slot, telat bayar, dan notifikasi ganda),
   check-in, pesanan dari meja & takeaway, stok habis, void, promo, tarif &
   harga menu berubah, meja rusak, lampu, sampai melewati pergantian hari.

   Semua aksi dijalankan PERSIS seperti aplikasi menjalankannya: sebagai
   kejadian di jejak bersama (detak waktu + aksi). Setelah SETIAP kejadian,
   invariant diperiksa. Di akhir, jejaknya diputar ulang di "perangkat lain"
   — dengan urutan terima acak — dan hasilnya harus identik.
   ═══════════════════════════════════════════════════════════════════ */
import {
  reducer, init, setClock, resetIds, nextId, recap, billiardTotalOf, fnbTotalOf, lineValue,
  priceLines, priceOf, settlementOf, tickState, applyAction, applyEntry, replay, entryOrder, slotProblem,
  shiftCashExpected, classOf,
  HOLD_MIN, HOLD_GRACE_MIN, PAKET_FREE_DRINKS, PAKET_FREE_CATEGORIES, NO_SHOW_RELEASE_MIN,
  type State, type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { EMPLOYEES, can, type Employee } from "../src/data/staff";
import { TABLES, PAKET_SIANG, type TableType } from "../src/data/venue";
import { MENU, findItem } from "../src/data/menu";
import { blockEndOf, businessDateOf, findClashes, overlaps, slotStart, tanggalWib, dariWib } from "../src/lib/occupancy";
import { bestPromo } from "../src/lib/billing";
import type { LiveSession } from "../src/data/live";
import type { CartLine } from "../src/lib/store";

/* ── PRNG deterministik ───────────────────────────────────────────── */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Pencatat pelanggaran ─────────────────────────────────────────── */
const INV: Record<string, string> = {
  "INV-01": "Tidak ada double-booking (rentang tetap tidak bertumpuk)",
  "INV-02": "Sesi berjalan (open bill/overstay) yang tertabrak booking wajib diperingatkan",
  "INV-03": "Stok tidak pernah minus",
  "INV-04": "Stok 0 ⇒ menu otomatis ditandai habis",
  "INV-05": "Konservasi stok (tidak oversell, void/no-show mengembalikan stok)",
  "INV-06": "Uang per sesi: nilai − diskon = diterima kasir + prabayar",
  "INV-07": "Tutup tab dihitung ulang mesin, tidak percaya angka dari layar",
  "INV-08": "Rekap konsisten (kanal, pajak, lini usaha)",
  "INV-09": "Kas laci dihitung per shift, bukan akumulasi semua shift",
  "INV-10": "Karyawan tidak bisa menjalankan aksi superadmin",
  "INV-11": "Aksi uang wajib shift terbuka",
  "INV-12": "Void yang masih menunggu tidak menggerakkan uang/stok",
  "INV-13": "Transaksi yang sudah dibayar tidak bisa hilang lewat void",
  "INV-14": "Lampu: buka/check-in ⇒ nyala, tutup tab/void ⇒ mati",
  "INV-15": "Setiap perubahan tercatat di jejak audit beserta pelakunya",
  "INV-16": "ID sesi, void, tiket, pesanan & refund unik",
  "INV-17": "Meteran open bill tidak pernah turun & kelipatan Rp 500",
  "INV-18": "Booking online dihargai tarif terkini, atau harga beku saat hold",
  "INV-19": "Check-in tidak memperpanjang jam selesai booking",
  "INV-20": "Pesanan online masuk tiket dapur saat check-in",
  "INV-21": "Meja tidak bisa dibuka di luar jam operasional",
  "INV-22": "Booking online yang berebut slot ditolak & dananya tercatat",
  "INV-23": "Tutup tab hanya untuk sesi yang sedang berjalan",
  "INV-24": "Rekap hari ini hanya hari operasional ini (termasuk takeaway)",
  "INV-25": "No-show dilepas tepat 20 menit setelah meja bisa ditempati & prabayarnya tetap tercatat",
  "INV-26": "Perpanjangan dihargai sesuai tarif jam yang ditambahkan",
  "INV-27": "Relokasi tidak menimbulkan tabrakan & lampu ikut pindah",
  "INV-28": "Paket Siang: tepat 2 minuman gratis, tidak ditagih, void mengembalikan jatah",
  "INV-29": "Pesanan tamu (QR meja/takeaway) masuk dapur, bill & laporan — atau ditolak dengan dana tercatat",
  "INV-30": "Slot yang sedang dibayar (hold) tidak bisa diambil orang lain & dilepas tepat T+19",
  "INV-31": "Harga menu dikunci per baris: perubahan harga hanya untuk pesanan baru",
  "INV-32": "Putar ulang jejak di perangkat lain menghasilkan state yang identik",
  "INV-33": "Perangkat yang menerima kejadian dengan urutan acak tetap berakhir identik",
  "INV-34": "Tiket dapur yang belum diantar selalu mewakili baris bill/pesanan yang masih ada (void tidak salah sasaran)",
  "INV-35": "Tanda habis manual tidak dicabut oleh void, no-show, atau koreksi stok",
  "INV-36": "Refund dicatat atas nama pembayarnya: tiap pesanan QR dengan kodenya sendiri",
  "INV-37": "Mengubah tarif tidak menagih ulang waktu open bill yang sudah berjalan",
  "INV-38": "Perpanjangan tidak melewati jam tutup 02.00; jam setelah 02.00 bertarif malam",
  "INV-39": "Tamu yang mejanya masih dipakai sesi lain tidak dilepas sebagai no-show",
  "INV-40": "No-show yang dipulihkan langsung berjalan, pra-order masuk dapur, yang sudah habis dikembalikan dananya",
  "INV-41": "Refund tidak pernah hilang/berubah nominal, dan dicatat dikembalikan tepat sekali (waktu, petugas, metode)",
  "INV-42": "Tutup buku harian tidak mengubah uang: rekap hari yang diarsipkan identik, transaksi aktif/stok/kas tidak tersentuh",
  "INV-43": "Kejadian rusak/tidak dikenal di jejak bersama tidak membuat mesin crash dan tidak mengubah data",
  "INV-44": "Split bill: bayar sebagian tidak pernah melebihi sisa tagihan & tidak ada baris dibayar dua kali",
  "INV-45": "Koreksi pesanan/pindah meja: nilai & tiket ikut pindah, yang sudah dibayar/diserahkan tidak tersentuh",
  "INV-46": "Meteran berhenti di jam tutup & 5 menit pertama tidak ditagih",
  "INV-47": "Reservasi resto tidak menagih sewa meja dan selalu di meja resto yang muat",
  "INV-48": "Selalu ada superadmin aktif; PIN & email staf tidak pernah kembar",
  "INV-49": "Buka meja paket per jam: harga blok tetap, punya jam selesai, tidak bermeteran",
  "INV-50": "Takeaway bayar di kasir: uang diakui tepat sekali, sesuai nilai pesanannya",
  "INV-51": "Meja yang sedang open bill tidak pernah ditawarkan ke booking online",
};

type Hit = { count: number; sims: Set<number>; example: string };
const hits: Record<string, Hit> = {};
function fail(code: string, sim: number, step: number, msg: string) {
  const h = (hits[code] ??= { count: 0, sims: new Set(), example: "" });
  h.count++; h.sims.add(sim);
  if (!h.example) h.example = `sim#${sim} langkah ${step}: ${msg}`;
}

/* ── Utilitas domain ──────────────────────────────────────────────── */
const ACTIVE = new Set(["hold", "booked", "running", "maintenance"]);
// Paket per jam punya jam selesai & harga tetap — bukan open bill bermeteran.
const isOpenBill = (s: LiveSession) => s.status === "running" && s.source === "walkin" && !s.blockHours;
// Venue dipatok WIB. Oracle ini sengaja TIDAK memakai helper mesin — ditulis
// ulang sendiri — tapi zonanya harus sama, kalau tidak simulasi cuma lolos di
// mesin penguji yang kebetulan disetel WIB.
const WIB = 7 * 3_600_000;
const wibDate = (ts: number) => new Date(ts + WIB);
const wibTs = (y: number, bulan0: number, tgl: number, jam: number, menit = 0) =>
  Date.UTC(y, bulan0, tgl, jam, menit, 0, 0) - WIB;
// Hari operasional 11.00–02.00; jam sesudah tengah malam tetap "malam" (24, 25, 26, …).
const hourIdx = (ts: number) => { const h = wibDate(ts).getUTCHours(); return h < 11 ? h + 24 : h; };
/** Oracle no-show, ditulis ulang terpisah dari mesin: null = tidak boleh dilepas (meja masih
 *  dipakai sesi lain, atau tidak pernah bisa ditempati sepanjang jadwalnya).
 *  `ready` = kapan meja siap menurut catatan oracle sendiri (booking/penghalang dipindah atau di-void). */
const noShowDue = (sessions: LiveSession[], bk: LiveSession, ready: number): number | null => {
  const others = sessions.filter((x) => x.id !== bk.id && x.tableId === bk.tableId);
  if (others.some((x) => x.status === "running" && x.startsAt < bk.endsAt)) return null;
  const lastLeft = Math.max(bk.startsAt, ready, ...others
    .filter((x) => x.status === "done" && x.startsAt < bk.startsAt)
    .map((x) => x.settledAt ?? x.endsAt));
  if (lastLeft >= bk.endsAt) return null;
  return lastLeft + 20 * 60_000;
};
const rateAt = (st: State, type: TableType, h: number) =>
  type === "resto" ? 0 : type === "vip" ? st.rates.vip : type === "vvip" ? st.rates.vvip
    : h < 18 ? st.rates.regularDay : st.rates.regularNight;
const priceWith = (st: State, type: TableType, startH: number, hours: number) => {
  let t = 0; for (let i = 0; i < hours; i++) t += rateAt(st, type, startH + i); return t;
};
const BASE = { regularDay: 29_000, regularNight: 39_000, vip: 50_000, vvip: 60_000 };
const basePrice = (type: TableType, startH: number, hours: number) => {
  let t = 0;
  for (let i = 0; i < hours; i++) {
    const h = startH + i;
    t += type === "resto" ? 0 : type === "vip" ? BASE.vip : type === "vvip" ? BASE.vvip
      : h < 18 ? BASE.regularDay : BASE.regularNight;
  }
  return t;
};
const CATEGORY_OF: Record<string, string> = Object.fromEntries(MENU.flatMap((c) => c.items.map((i) => [i.id, c.id])));
const typeOf = (tableId: string) => TABLES.find((t) => t.id === tableId)!.type;
/** Kelas yang dibekukan di sesi (VIP/VVIP/reguler/resto). */
const sessType = (s: { tableId: string; tableType?: TableType }): TableType => s.tableType ?? typeOf(s.tableId);
const BILLIARD = TABLES.filter((t) => t.type !== "resto");
const RESTO = TABLES.filter((t) => t.type === "resto");
/** Batas meteran: jam 05.00 pagi sesudah hari operasional sesi itu (aplikasi bisa mati semalaman). */
const closeAfter = (ts: number) => {
  const b = wibDate(ts - 2 * 3_600_000);
  return wibTs(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + 1, 5);
};
/** Akhir waktu yang BENAR-BENAR ditagih untuk open bill — cerminan meterEndOf di mesin.
 *  Dipakai juga untuk menilai promo: tab yang lupa ditutup tidak boleh kebagian
 *  promo yang berlaku belasan jam sesudah tamunya pulang. */
/** Tanggal kemarin dari sebuah hari operasional — dipakai batas "tab tertinggal". */
const kemarinDari = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return tanggalWib(dariWib(y, m, d - 1, 12));
};

const oracleMeterEnd = (s: LiveSession, now: number) =>
  s.stoppedAt !== undefined
    ? Math.max(s.startsAt, s.stoppedAt)
    : Math.max(s.startsAt, Math.min(now, closeAfter(s.startsAt)));

/** Tagihan open bill: 5 menit pertama gratis, lalu minimum 30 menit per menit, berhenti di jam tutup, ke atas Rp 500. */
const oracleOpenBill = (s: LiveSession, rates: State["rates"], end: number) => {
  const type = sessType(s);
  if (type === "resto") return 0;                        // meja resto tidak punya meteran
  if (s.blockHours) {                                    // paket per jam: harga blok, bukan meteran
    const sampai = s.status === "running" ? end : (s.settledAt ?? s.endsAt);
    return Math.ceil(Math.max(0, sampai - s.startsAt) / 60_000) <= 5 ? 0 : s.tableAmount;
  }
  const r = s.rates ?? rates;
  const stop = s.stoppedAt ?? Math.min(end, closeAfter(s.startsAt));
  const played = Math.ceil(Math.max(0, stop - s.startsAt) / 60_000);
  if (played <= 5) return 0;                             // toleransi batal 5 menit
  const billed = Math.max(30, played);
  let perMinuteSum = 0;
  for (let m = 0; m < billed; m++) {
    const h = hourIdx(s.startsAt + m * 60_000);
    perMinuteSum += type === "vip" ? r.vip : type === "vvip" ? r.vvip : h >= 18 ? r.regularNight : r.regularDay;
  }
  return Math.ceil(perMinuteSum / 30_000) * 500;         // (Σ tarif/jam per menit) / 60, ke atas kelipatan 500
};
/** Kunci baris yang sudah dilunasi lewat split bill. */
const paidKeys = (s: LiveSession) => new Set((s.payments ?? []).flatMap((p) => p.keys ?? []));
const splitPaid = (s: { payments?: { amount: number }[] }) => (s.payments ?? []).reduce((n, p) => n + p.amount, 0);
const sum = (xs: CartLine[]) => xs.reduce((n, l) => n + lineValue(l), 0);
const soldQty = (st: State) => {
  const m: Record<string, number> = {};
  for (const s of st.sessions) for (const l of s.fnb) m[l.itemId] = (m[l.itemId] ?? 0) + l.qty;
  for (const o of st.orders) {
    if (o.status !== "diterima" || o.sessionId) continue;       // takeaway (yang menempel sudah ada di sesi)
    for (const l of o.lines) m[l.itemId] = (m[l.itemId] ?? 0) + l.qty;
  }
  return m;
};
const sig = (st: State) => JSON.stringify({ ...st, me: null });
const moneySig = (st: State) => JSON.stringify({ sessions: st.sessions, stock: st.stock, lights: st.lights, orders: st.orders, refunds: st.refunds });
const diffKeys = (x: State, y: State) =>
  (Object.keys(x) as (keyof State)[]).filter((k) => k !== "me" && JSON.stringify(x[k]) !== JSON.stringify(y[k])).join(", ");
const PERM: Partial<Record<Action["t"], Parameters<typeof can>[1]>> = {
  walkin: "bukaMeja", settle: "tutupTab", addFnb: "orderFnb", setRate: "ubahTarif", setMenuPrice: "ubahTarif",
  savePromo: "kelolaPromo", deletePromo: "kelolaPromo", setStock: "kelolaStok",
  addStock: "kelolaStok", decideVoid: "setujuiVoid", toggleMaintenance: "kelolaMeja",
  toggleSoldOut: "tandaiHabis", toggleLight: "kontrolLampu", allLights: "kontrolLampu",
  restoreNoShow: "bukaMeja", settleRefund: "lihatLaporanKeuangan",
  editFnb: "koreksiPesanan", moveFnb: "koreksiPesanan", paySplit: "tutupTab", stopMeter: "koreksiWaktu",
  settleOrder: "tutupTab",
  setTableClass: "kelolaMeja", saveEmployee: "kelolaKaryawan", removeEmployee: "kelolaKaryawan",
};
const NEEDS_SHIFT = new Set<Action["t"]>(["walkin", "settle", "addFnb", "checkin", "restoreNoShow", "editFnb", "moveFnb", "paySplit", "settleOrder"]);
const SYSTEM_ACTS = new Set<Action["t"]>(["confirmOnline", "hold", "releaseHold", "guestOrder", "reserveResto"]);
const ALL_ITEMS = MENU.flatMap((c) => c.items);
const BAR_ITEMS = ALL_ITEMS.filter((i) => i.station === "bar");
const COLD = ALL_ITEMS.filter((i) => PAKET_FREE_CATEGORIES.includes(CATEGORY_OF[i.id]));

/* ── Satu simulasi ────────────────────────────────────────────────── */
type Coverage = Record<string, { ok: number; ditolak: number }>;
const coverage: Coverage = {};
let totalReplays = 0;

function runSim(sim: number) {
  const rnd = mulberry32(sim * 7919 + 17);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const kind = sim < 25 ? "ramai" : sim < 50 ? "ganti-shift" : sim < 75 ? "lintas-hari" : "adversarial";

  // Hari mulai berbeda-beda supaya promo per hari ikut teruji
  const base = wibTs(2026, 8, 14 + (sim % 7), 11, 5);
  let now = base;
  setClock(() => now);
  resetIds();

  const genesis: Genesis = { at: base, seed: sim % 2 === 0 };
  let st: State = init({ seed: genesis.seed });
  const entries: Entry[] = [];
  let entryN = 0;

  const prepaid = new Set<string>();               // `${sessionId}|${key}` yang dibayar online
  const extraTable: Record<string, number> = {};   // tambahan tagihan dari perpanjangan
  const settleLog: { id: string; channel: string; amount: number; shiftId?: string; at: number; split?: boolean }[] = [];
  const pending: { payload: LiveSession; amount: number }[] = [];   // QR yang sedang menunggu dibayar
  const manualOut = new Set<string>();             // menu yang ditandai habis manual oleh staf
  const readyFrom: Record<string, number> = {};    // booking → kapan mejanya siap lagi (catatan oracle)
  let longTab: string | null = null;               // tab yang dibiarkan jalan melewati dua pergantian hari
  const sentConfirms: LiveSession[] = [];          // untuk notifikasi ganda (diterima maupun ditolak)

  const karyawan = EMPLOYEES.filter((e) => e.role === "karyawan");
  const superadmin = EMPLOYEES.filter((e) => e.role === "superadmin");
  const steps = kind === "adversarial" ? 100 : 80;

  const dispatch = (a: Action, step: number, meta: Record<string, unknown> = {}) => {
    if (a.t === "login" || a.t === "logout") {
      const after = reducer(st, a);
      const cov = (coverage[a.t] ??= { ok: 0, ditolak: 0 });
      after.me?.id !== st.me?.id ? cov.ok++ : cov.ditolak++;
      st = after;
      return true;
    }
    // Persis seperti aplikasi: kejadian = detak waktu pada saatnya + aksi.
    const e: Entry = { id: `sim${sim}:${String(++entryN).padStart(6, "0")}`, at: now, by: st.me?.id ?? null, act: a };
    const ticked = tickState(st, now);
    if (ticked !== st) {
      (coverage["(detak) lepas otomatis"] ??= { ok: 0, ditolak: 0 }).ok++;
      check(st, ticked, { t: "tick" }, true, step, {});
    }
    const after = applyAction(ticked, e);
    entries.push(e);
    let accepted: boolean;
    if (a.t === "confirmOnline") {
      const id = a.session.id;
      accepted = after.sessions.some((x) => x.id === id && x.status === "booked") &&
        !ticked.sessions.some((x) => x.id === id && x.status === "booked");
    } else if (a.t === "hold") {
      accepted = after.sessions.some((x) => x.id === a.session.id && x.status === "hold") &&
        !ticked.sessions.some((x) => x.id === a.session.id);
    } else if (a.t === "guestOrder") {
      accepted = after.orders.some((o) => o.id === a.order.id && o.status === "diterima") &&
        !ticked.orders.some((o) => o.id === a.order.id);
    } else {
      accepted = sig(after) !== sig(ticked);
    }
    const cov = (coverage[a.t] ??= { ok: 0, ditolak: 0 });
    accepted ? cov.ok++ : cov.ditolak++;
    if (a.t === "requestVoid" || a.t === "decideVoid") {
      const gone = ticked.sessions.flatMap((x) => x.fnb.filter((l) => l.unitPrice === 0 && !l.prepaid).map((l) => `${x.id}|${l.key}`))
        .filter((k) => { const [sid, key] = k.split("|"); return !after.sessions.find((x) => x.id === sid)?.fnb.some((l) => l.key === key) && after.sessions.some((x) => x.id === sid); });
      if (gone.length) (coverage["(skenario) void minuman gratis"] ??= { ok: 0, ditolak: 0 }).ok += gone.length;
    }
    if (a.t === "confirmOnline" && meta.duplicate) (coverage["(skenario) webhook ganda"] ??= { ok: 0, ditolak: 0 }).ok++;
    if (a.t === "confirmOnline" && accepted && ticked.sessions.some((x) => x.id === a.session.id && x.status === "hold")) (coverage["(skenario) bayar lewat hold"] ??= { ok: 0, ditolak: 0 }).ok++;
    if (a.t === "confirmOnline" && accepted && after.refunds.length > ticked.refunds.length) (coverage["(skenario) menu habis saat bayar"] ??= { ok: 0, ditolak: 0 }).ok++;
    check(ticked, after, a, accepted, step, meta);
    st = after;
    return accepted;
  };

  const login = (emp: Employee, step: number) => {
    if (st.me?.id !== emp.id) dispatch({ t: "login", emp }, step);
  };

  /** Kejadian rusak masuk jejak bersama (versi aplikasi lain, payload terpotong, iseng). */
  const malformed = (step: number, act: unknown) => {
    const e = { id: `sim${sim}:${String(++entryN).padStart(6, "0")}`, at: now, by: st.me?.id ?? null, act } as unknown as Entry;
    const ticked = tickState(st, now);
    if (ticked !== st) check(st, ticked, { t: "tick" }, true, step, {});
    let after = ticked;
    try {
      after = applyAction(ticked, e);
    } catch (err) {
      fail("INV-43", sim, step, `mesin crash pada kejadian rusak: ${String(err).slice(0, 80)}`);
    }
    if (sig(after) !== sig(ticked)) fail("INV-43", sim, step, `kejadian rusak ${String(JSON.stringify(act)).slice(0, 60)} mengubah data`);
    entries.push(e);
    (coverage["(skenario) kejadian rusak diabaikan"] ??= { ok: 0, ditolak: 0 }).ok++;
    st = after;
  };

  const ensureShift = (step: number) => {
    if (!st.shift) dispatch({ t: "openShift", openingCash: pick([200_000, 500_000]) }, step);
  };

  /* ── Pemeriksa invariant ─────────────────────────────────────────── */
  function check(b: State, a: State, act: Action, ok: boolean, step: number, meta: Record<string, unknown>) {
    const f = (code: string, msg: string) => fail(code, sim, step, msg);
    const role = b.me?.role ?? null;

    // Tutup buku harian (pergantian hari operasional): catatan yang diarsipkan keluar dari state aktif.
    const rollover = a.day !== b.day;
    const aliveIn = (st: State) => ({ sessions: new Set(st.sessions.map((x) => x.id)), orders: new Set(st.orders.map((x) => x.id)) });
    if (rollover) {
      const live = aliveIn(a);
      const gone = b.sessions.filter((x) => !live.sessions.has(x.id));
      // Oracle no-show sendiri: kapan rombongan yang diarsipkan pulang tetap berlaku bagi booking di mejanya.
      for (const bk of a.sessions.filter((x) => x.status === "booked")) {
        for (const x of gone) {
          if (x.status === "done" && x.tableId === bk.tableId && x.startsAt < bk.startsAt) {
            readyFrom[bk.id] = Math.max(readyFrom[bk.id] ?? 0, x.settledAt ?? x.endsAt);
          }
        }
      }
      // INV-42 — angka hari yang diarsipkan identik dengan rekap saat masih aktif.
      const money = (r: ReturnType<typeof recap>) => JSON.stringify([r.billiard, r.fnb, r.discount, r.gross, r.diterima, r.prabayar, r.byChannel, r.dpp, r.tax, r.mdr, r.net, r.done.length, r.noShow, r.takeaway.length]);
      // Pembanding: state sesudah no-show yang jatuh tempo dilepas (detak yang sama) tapi sebelum diarsipkan.
      const releasedOnly = tickState({ ...b, day: a.day }, now);
      for (const h of a.history) {
        const prev = b.history.find((x) => x.bizDate === h.bizDate);
        if (prev && JSON.stringify(prev) === JSON.stringify(h)) continue;
        if (money(recap(releasedOnly, h.bizDate)) !== money(recap(a, h.bizDate))) f("INV-42", `rekap ${h.bizDate} berubah saat tutup buku`);
        const ids = new Set(h.sessions.map((x) => x.id));
        for (const x of b.sessions) {
          if ((x.status === "done" || x.status === "noshow") && businessDateOf(x.startsAt) === h.bizDate && !ids.has(x.id) && !live.sessions.has(x.id)) {
            f("INV-42", `sesi ${x.id} hilang tanpa arsip`);
          }
        }
      }
      // Tab TERTINGGAL tanpa tagihan ditutup otomatis oleh detak yang sama, lalu
      // ikut diarsipkan. Itu aturan barunya — satu tab yang lupa ditutup tidak
      // boleh mengunci rekap hari itu selamanya. Yang ditutup begini dikenali dari
      // `settledChannel` kosong: tidak ada uang yang berpindah.
      const tabTertinggal = new Set(
        b.sessions.filter((x) => x.status === "running" &&
          businessDateOf(x.startsAt) < kemarinDari(businessDateOf(now))).map((x) => x.id));
      const mejaTertinggal = new Set(
        b.sessions.filter((x) => tabTertinggal.has(x.id)).map((x) => x.tableId));
      for (const x of gone) {
        const expiredHold = x.status === "hold" && (x.holdUntil ?? 0) <= now;
        if (expiredHold || tabTertinggal.has(x.id)) continue;
        if (x.status !== "done" && x.status !== "noshow") f("INV-42", `sesi ${x.status} ${x.id} ikut diarsipkan`);
      }
      // Yang ditutup otomatis WAJIB nol tagihannya — kalau ada yang masih harus
      // ditagih ikut tertutup, mesin sedang menebak uang dan itu pelanggaran.
      for (const x of a.sessions) {
        if (tabTertinggal.has(x.id) && x.status === "done" && (x.settledAmount ?? 0) !== 0) {
          f("INV-42", `tab tertinggal ${x.id} ditutup otomatis dengan tagihan ${x.settledAmount}`);
        }
      }
      // Detak yang sama boleh melepas no-show (pra-order kembali ke stok) — itu dijaga INV-05.
      const released = a.sessions.some((x) => x.status === "noshow" && b.sessions.some((y) => y.id === x.id && y.status === "booked"));
      for (const k of ["stock", "shift", "rates", "promos", "menuPrices", "paymentIds", "lights"] as const) {
        if (k === "stock" && released) continue;
        if (k === "lights" && mejaTertinggal.size) {
          // Meja yang tabnya baru ditutup otomatis memang lampunya ikut mati,
          // sama seperti kalau kasir yang menutupnya. Meja lain tetap dijaga.
          const tanpa = (o: Record<string, boolean>) =>
            JSON.stringify(Object.fromEntries(Object.entries(o).filter(([t]) => !mejaTertinggal.has(t))));
          if (tanpa(a[k]) !== tanpa(b[k])) f("INV-42", `tutup buku mengubah ${k}`);
          continue;
        }
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) f("INV-42", `tutup buku mengubah ${k}`);
      }
      for (const r of b.refunds) if (!r.settledAt && !a.refunds.some((y) => y.id === r.id)) f("INV-42", `refund belum dikembalikan ${r.id} ikut diarsipkan`);
      for (const v of b.voids) if (v.status === "menunggu" && !a.voids.some((y) => y.id === v.id)) f("INV-42", `void menunggu ${v.id} ikut diarsipkan`);
      if (shiftCashExpected(a) !== shiftCashExpected(b)) f("INV-42", `kas shift berubah saat tutup buku`);
      if (a.history.length > b.history.length) (coverage["(skenario) tutup buku harian"] ??= { ok: 0, ditolak: 0 }).ok++;
    }
    // Hari yang sudah diarsipkan (kapan pun) tidak boleh punya transaksi selesai di luar arsipnya —
    // mis. tab dari hari itu yang dibiarkan jalan lalu ditutup belakangan. Diperiksa setiap langkah.
    if (a.history.length) {
      const archivedDays = new Set(a.history.map((h) => h.bizDate));
      const stray = a.sessions.find((x) => (x.status === "done" || x.status === "noshow") && archivedDays.has(businessDateOf(x.startsAt)));
      if (stray) f("INV-42", `hari ${businessDateOf(stray.startsAt)} diarsipkan sebagian — ${stray.id} selesai di luar arsip (setelah ${act.t})`);
    }

    // Pembukuan oracle — baris yang lunas online dicatat SEBELUM invariant uang diperiksa.
    if (act.t === "confirmOnline" && ok) {
      const got = a.sessions.find((x) => x.id === act.session.id);
      if (got) for (const l of got.fnb) prepaid.add(`${got.id}|${l.key}`);
    }
    if (act.t === "guestOrder" && ok && act.order.pay === "online") {
      const o = a.orders.find((x) => x.id === act.order.id);
      const s0 = o?.sessionId ? b.sessions.find((x) => x.id === o.sessionId) : undefined;
      const s1 = o?.sessionId ? a.sessions.find((x) => x.id === o.sessionId) : undefined;
      if (s0 && s1) for (const l of s1.fnb.slice(s0.fnb.length)) prepaid.add(`${s1.id}|${l.key}`);
    }
    // Meja booking baru siap saat penghalangnya dipindah/di-void, atau saat booking itu dipindah meja.
    if (ok && (act.t === "relocate" || act.t === "requestVoid" || act.t === "decideVoid")) {
      const left = b.sessions.filter((x) => x.status === "running" &&
        (act.t === "relocate" ? x.id === act.id : !a.sessions.some((y) => y.id === x.id)));
      for (const r0 of left) {
        for (const x of b.sessions) {
          if (x.status === "booked" && x.id !== r0.id && x.tableId === r0.tableId && now > x.startsAt && r0.startsAt < x.endsAt) readyFrom[x.id] = now;
        }
        (coverage["(skenario) penghalang booking pergi"] ??= { ok: 0, ditolak: 0 }).ok++;
      }
      const moved = act.t === "relocate" ? b.sessions.find((x) => x.id === act.id) : undefined;
      if (moved?.status === "booked" && now > moved.startsAt) readyFrom[moved.id] = now;
    }

    // INV-10 izin
    const perm = PERM[act.t];
    if (perm && !can(role, perm) && ok) f("INV-10", `${b.me?.name ?? "tanpa login"} berhasil ${act.t}`);

    // INV-11 shift
    if (NEEDS_SHIFT.has(act.t) && !b.shift && ok) f("INV-11", `${act.t} diterima tanpa shift terbuka`);

    // INV-01 / INV-22 / INV-30 double booking.
    // Sesi yang ujungnya ditentukan WAKTU BERJALAN (open bill, atau booking yang
    // tamunya belum pulang melewati jadwal) tidak bisa dicegah software — itu
    // overstay nyata. Yang wajib: kasir diperingatkan (INV-02). Semua sesi lain
    // tetap diperiksa ketat: rentangnya sama sekali tidak boleh bertumpuk.
    const dynamicEnd = (s: LiveSession) => s.status === "running" && (isOpenBill(s) || now > s.endsAt);
    const addedId = (act.t === "confirmOnline" || act.t === "hold") && ok ? act.session.id : null;
    for (const t of TABLES) {
      // Satu meja fisik: tidak pernah dua rombongan main bersamaan, dan meja rusak tidak sedang dipakai.
      const runningHere = a.sessions.filter((s) => s.tableId === t.id && s.status === "running");
      if (runningHere.length > 1) f("INV-01", `${t.id}: ${runningHere.length} sesi berjalan bersamaan setelah ${act.t}`);
      if (runningHere.length && a.sessions.some((s) => s.tableId === t.id && s.status === "maintenance")) {
        f("INV-01", `${t.id}: meja rusak masih dipakai setelah ${act.t}`);
      }
      const fixed = a.sessions.filter((s) => s.tableId === t.id && ACTIVE.has(s.status) && !dynamicEnd(s));
      for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) {
        const x = fixed[i], y = fixed[j];
        if (overlaps(x.startsAt, blockEndOf(x, now), y.startsAt, blockEndOf(y, now))) {
          const code = x.status === "hold" || y.status === "hold" ? "INV-30"
            : addedId && (x.id === addedId || y.id === addedId) ? "INV-22" : "INV-01";
          f(code, `${t.id}: ${x.status}(${x.source}) bertumpuk dengan ${y.status}(${y.source}) setelah ${act.t}`);
        }
      }
      // INV-02 sesi berjalan yang tertabrak booking wajib diperingatkan
      for (const r of a.sessions.filter((s) => s.tableId === t.id && dynamicEnd(s))) {
        // Booking yang jadwalnya sudah habis bukan tabrakan lagi — itu antrean keputusan kasir.
        const hit = a.sessions.some((s) => s.tableId === t.id && s.status === "booked" &&
          s.endsAt > now && s.startsAt < blockEndOf(r, now));
        if (hit && !findClashes(a.sessions, now).some((c) => c.running.id === r.id)) {
          f("INV-02", `${t.id}: ${isOpenBill(r) ? "open bill" : "booking lewat jadwal"} tertabrak booking tapi tidak ada peringatan`);
        }
      }
    }

    // INV-03 / INV-04 / INV-05 stok
    // Barang milik transaksi yang diarsipkan sudah terjual — bukan kembali ke stok.
    const live = aliveIn(a);
    const sb = rollover
      ? soldQty({ ...b, sessions: b.sessions.filter((x) => live.sessions.has(x.id)), orders: b.orders.filter((o) => live.orders.has(o.id)) })
      : soldQty(b);
    const sa = soldQty(a);
    for (const row of a.stock) {
      if (row.qty !== null && row.qty < 0) f("INV-03", `${row.itemId} stok ${row.qty}`);
      if (row.qty === 0 && !a.soldOut.includes(row.itemId)) f("INV-04", `${row.itemId} stok 0 tapi masih dijual`);
      const prev = b.stock.find((r) => r.itemId === row.itemId);
      if (!prev || prev.qty === null || row.qty === null) continue;
      let expected: number;
      if (act.t === "setStock" && act.itemId === row.itemId) expected = ok ? (act.qty ?? prev.qty) : prev.qty;
      else if (act.t === "addStock" && act.itemId === row.itemId) expected = ok ? Math.max(0, prev.qty + act.delta) : prev.qty;
      else expected = prev.qty - ((sa[row.itemId] ?? 0) - (sb[row.itemId] ?? 0));
      if (expected < 0) f("INV-05", `${row.itemId} terjual melebihi stok (${prev.qty} → butuh ${expected})`);
      else if (row.qty !== expected) f("INV-05", `${row.itemId} stok ${row.qty}, seharusnya ${expected} setelah ${act.t}`);
    }

    // INV-06 uang per sesi yang selesai (termasuk yang dibayar per orang / split bill)
    for (const s of a.sessions.filter((x) => x.status === "done")) {
      const nilai = (s.settledBilliard ?? 0) + (s.settledFnb ?? 0) - (s.settledDiscount ?? 0);
      const masuk = (s.settledAmount ?? 0) + s.paidOnline + splitPaid(s);
      if (nilai !== masuk) f("INV-06", `${s.id}: nilai ${nilai} ≠ diterima ${s.settledAmount} + prabayar ${s.paidOnline} + split ${splitPaid(s)}`);
    }
    // Prabayar sesi yang belum selesai harus sama dengan yang benar-benar lunas di dalamnya.
    for (const s of a.sessions.filter((x) => x.source === "online" && (x.status === "booked" || x.status === "running"))) {
      const lunas = (s.tableAmount - (s.extraTable ?? 0)) + s.fnb.filter((l) => prepaid.has(`${s.id}|${l.key}`)).reduce((n, l) => n + lineValue(l), 0);
      if (lunas !== s.paidOnline) f("INV-06", `${s.id}: prabayar tercatat ${s.paidOnline}, isi yang lunas ${lunas}`);
    }

    // INV-07 / INV-23 tutup tab
    if (act.t === "settle") {
      const sess = b.sessions.find((x) => x.id === act.id);
      if (sess && sess.status !== "running" && ok) f("INV-23", `tutup tab untuk sesi berstatus ${sess.status}`);
      if (sess && sess.status === "running" && ok) {
        const done = a.sessions.find((x) => x.id === act.id)!;
        // Oracle meteran ditulis ulang per menit dengan bilangan bulat — bukan memanggil mesin.
        const bill = sess.source === "walkin" ? oracleOpenBill(sess, b.rates, now) : sess.tableAmount;
        const fnb = fnbTotalOf(sess);
        const counterB = sess.source === "walkin" ? bill : (extraTable[sess.id] ?? 0);
        const counterF = sess.fnb.filter((l) => !prepaid.has(`${sess.id}|${l.key}`)).reduce((n, l) => {
          const it = findItem(l.itemId); return n + (it ? (l.unitPrice ?? it.price) * l.qty : 0);
        }, 0);
        // Promo dibatasi: tidak boleh memotong uang yang sudah diterima kasir lewat split bill.
        const dibayarDulu = splitPaid(sess);
        // Sama dengan mesin: promo dinilai pada akhir waktu yang ditagih.
        const akhirTagih = sess.source === "walkin" && !sess.blockHours && sess.status === "running"
          ? oracleMeterEnd(sess, now) : now;
        const disc = Math.max(0, Math.min(bestPromo(b.promos, counterB, counterF, akhirTagih, act.promoCode)?.discount ?? 0,
          counterB + counterF - dibayarDulu));
        const due = Math.max(0, counterB + counterF - disc - dibayarDulu);
        if (done.settledBilliard !== bill) f("INV-07", `meja tersimpan ${done.settledBilliard}, seharusnya ${bill}${meta.tamper ? " (angka layar dimanipulasi)" : ""}`);
        if (done.settledFnb !== fnb) f("INV-07", `F&B tersimpan ${done.settledFnb}, seharusnya ${fnb}`);
        if (done.settledDiscount !== disc) f("INV-07", `diskon tersimpan ${done.settledDiscount}, seharusnya ${disc} (promo tidak boleh memotong yang sudah prabayar)`);
        if (done.settledAmount !== due) f("INV-07", `ditagih ${done.settledAmount}, seharusnya ${due}${meta.tamper ? " (angka layar dimanipulasi)" : ""}`);
        if (a.lights[sess.tableId]) f("INV-14", `lampu ${sess.tableId} masih nyala setelah tutup tab`);
        settleLog.push({ id: sess.id, channel: act.channel, amount: done.settledAmount ?? 0, shiftId: b.shift?.id, at: now });
      }
    }

    // INV-44 split bill — nilainya dihitung ulang mesin & tidak pernah melebihi sisa tagihan
    if (act.t === "paySplit") {
      const s0 = b.sessions.find((x) => x.id === act.id);
      const s1 = a.sessions.find((x) => x.id === act.id);
      if (ok && s0 && s1) {
        const pays = s1.payments ?? [];
        const p = pays[pays.length - 1];
        const counterB = s0.source === "walkin" ? oracleOpenBill(s0, b.rates, now) : (extraTable[s0.id] ?? 0);
        const counterF = s0.fnb.filter((l) => !prepaid.has(`${s0.id}|${l.key}`)).reduce((n, l) => n + lineValue(l), 0);
        const akhirTagih2 = s0.source === "walkin" && !s0.blockHours && s0.status === "running"
          ? oracleMeterEnd(s0, now) : now;
        const disc = bestPromo(b.promos, counterB, counterF, akhirTagih2)?.discount ?? 0;
        const sisa = Math.max(0, counterB + counterF - disc - splitPaid(s0));
        if (!p) f("INV-44", `bayar sebagian ${act.id} tidak tercatat`);
        else {
          if (p.amount > sisa) f("INV-44", `bayar sebagian ${p.amount} melebihi sisa tagihan ${sisa}`);
          if (act.keys) {
            const want = act.keys.map((k) => s0.fnb.find((l) => l.key === k)).filter(Boolean)
              .reduce((n, l) => n + lineValue(l!), 0);
            if (p.amount !== want) f("INV-44", `bayar per pesanan ${p.amount}, isi barisnya ${want}`);
          }
          if (p.shiftId !== b.shift?.id) f("INV-44", `pembayaran tidak masuk shift yang sedang buka`);
          settleLog.push({ id: s1.id, channel: p.channel, amount: p.amount, shiftId: b.shift?.id, at: now, split: true });
        }
      } else if (!ok && moneySig(a) !== moneySig(b)) {
        f("INV-44", `bayar sebagian ditolak tapi data uang berubah`);
      }
    }
    for (const s of a.sessions) {
      const keys = (s.payments ?? []).flatMap((p) => p.keys ?? []);
      if (keys.length !== new Set(keys).size) f("INV-44", `baris dibayar dua kali di ${s.id}`);
      if ((s.payments ?? []).some((p) => p.amount <= 0)) f("INV-44", `pembayaran nol/negatif tercatat di ${s.id}`);
    }

    // INV-45 koreksi pesanan & pindah meja
    if (act.t === "editFnb" && ok) {
      const s0 = b.sessions.find((x) => x.id === act.sessionId)!;
      const s1 = a.sessions.find((x) => x.id === act.sessionId)!;
      const l0 = s0.fnb.find((l) => l.key === act.key)!;
      const l1 = s1.fnb.find((l) => l.key === act.key);
      if (l0.prepaid || l0.unitPrice === 0 || paidKeys(s0).has(l0.key)) f("INV-45", `baris prabayar/gratis/lunas ikut dikoreksi`);
      if (b.tickets.some((t) => t.sessionId === s0.id && t.lineKey === act.key && t.status === "served")) {
        f("INV-45", `baris yang sudah diserahkan ikut dikoreksi`);
      }
      if (!l1) f("INV-45", `koreksi malah menghapus baris ${act.key}`);
      else {
        if (act.qty !== undefined && l1.qty !== Math.floor(act.qty)) f("INV-45", `jumlah ${l1.qty}, diminta ${act.qty}`);
        if (act.itemId && l1.itemId !== act.itemId) f("INV-45", `item tidak berganti jadi ${act.itemId}`);
        const tk = a.tickets.find((t) => t.sessionId === s1.id && t.lineKey === act.key);
        if (tk && (tk.itemId !== l1.itemId || tk.qty !== l1.qty)) f("INV-45", `tiket dapur tidak ikut dikoreksi`);
      }
    }
    if (act.t === "moveFnb" && ok) {
      const from0 = b.sessions.find((x) => x.id === act.fromId)!;
      const from1 = a.sessions.find((x) => x.id === act.fromId)!;
      const to0 = b.sessions.find((x) => x.id === act.toId)!;
      const to1 = a.sessions.find((x) => x.id === act.toId)!;
      const moved = act.keys.map((k) => from0.fnb.find((l) => l.key === k)).filter(Boolean) as CartLine[];
      const nilai = sum(moved);
      if (sum(from1.fnb) !== sum(from0.fnb) - nilai) f("INV-45", `nilai bill meja asal salah setelah pindah`);
      if (sum(to1.fnb) !== sum(to0.fnb) + nilai) f("INV-45", `nilai bill meja tujuan salah setelah pindah`);
      if (act.keys.some((k) => from1.fnb.some((l) => l.key === k))) f("INV-45", `baris masih tertinggal di meja asal`);
      if (moved.some((l) => l.prepaid || l.orderId || paidKeys(from0).has(l.key))) f("INV-45", `baris prabayar/lunas/pesanan QR ikut dipindah`);
      if (a.tickets.some((t) => t.sessionId === from0.id && t.lineKey && act.keys.includes(t.lineKey))) {
        f("INV-45", `tiket dapur tidak ikut pindah meja`);
      }
    }

    // INV-46 meteran: berhenti di jam tutup, 5 menit pertama tidak ditagih
    for (const s of a.sessions.filter(isOpenBill)) {
      const mesin = billiardTotalOf(s, a.rates, now).amount;
      const oracle = oracleOpenBill(s, a.rates, now);
      if (mesin !== oracle) f("INV-46", `meteran ${s.id} ${mesin}, seharusnya ${oracle} (mulai ${wibDate(s.startsAt).getUTCHours()}.xx)`);
    }
    if (act.t === "stopMeter" && ok) {
      const s1 = a.sessions.find((x) => x.id === act.id)!;
      if (s1.stoppedAt !== Math.round(act.at)) f("INV-46", `jam berhenti tidak tersimpan`);
      if ((s1.stoppedAt ?? 0) > now || (s1.stoppedAt ?? 0) < s1.startsAt) f("INV-46", `jam berhenti di luar rentang sesi`);
    }

    // INV-47 reservasi resto
    if (act.t === "reserveResto" && ok) {
      const got = a.sessions.find((x) => x.id === act.res.id);
      if (!got) f("INV-47", `reservasi ${act.res.code} diterima tanpa sesi`);
      else {
        if (got.tableAmount !== 0 || got.paidOnline !== 0) f("INV-47", `reservasi resto menagih sewa meja`);
        if (typeOf(got.tableId) !== "resto") f("INV-47", `reservasi resto ditempatkan di ${got.tableId}`);
        const kapasitas = TABLES.find((t) => t.id === got.tableId)?.capacity ?? 0;
        if ((got.pax ?? 0) > kapasitas) f("INV-47", `${got.pax} orang di meja berkapasitas ${kapasitas}`);
        if (!got.checkin || !/^[0-9]{6}$/.test(got.checkin)) f("INV-47", `reservasi tanpa kode check-in 6 angka`);
      }
    }

    // INV-48 akun staf
    if (!a.employees.some((e) => e.active && e.role === "superadmin")) f("INV-48", `tidak ada superadmin aktif setelah ${act.t}`);
    const pinList = a.employees.map((e) => e.pin);
    if (pinList.length !== new Set(pinList).size) f("INV-48", `PIN staf kembar setelah ${act.t}`);
    const mailList = a.employees.map((e) => e.email).filter(Boolean);
    if (mailList.length !== new Set(mailList).size) f("INV-48", `email staf kembar setelah ${act.t}`);
    if (a.employees.some((e) => e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email))) {
      f("INV-48", `email staf tidak sah tersimpan setelah ${act.t}`);
    }

    // INV-49 buka meja paket per jam
    if (act.t === "walkin" && ok && act.hours !== undefined) {
      const w = a.sessions.find((x) => !b.sessions.some((y) => y.id === x.id))!;
      const jam = Math.floor(act.hours);
      const want = priceWith(b, sessType(w), hourIdx(w.startsAt), jam);
      if (w.blockHours !== jam) f("INV-49", `paket ${jam} jam tidak tercatat di sesinya`);
      if (w.endsAt !== w.startsAt + jam * 3_600_000) f("INV-49", `jam selesai paket salah (${Math.round((w.endsAt - w.startsAt) / 60000)} menit)`);
      if (w.tableAmount !== want) f("INV-49", `paket ${jam} jam dihargai ${w.tableAmount}, seharusnya ${want}`);
      if (billiardTotalOf(w, a.rates, now).amount !== 0) f("INV-49", `paket per jam sudah ditagih sebelum lewat toleransi 5 menit`);
      const nanti = billiardTotalOf(w, a.rates, w.startsAt + 40 * 60_000).amount;
      if (nanti !== want) f("INV-49", `paket per jam bermeteran (menit ke-40 ditagih ${nanti}, seharusnya tetap ${want})`);
    }

    // INV-50 takeaway dibayar di kasir
    if (act.t === "settleOrder") {
      const o0 = b.orders.find((x) => x.id === act.id);
      const o1 = a.orders.find((x) => x.id === act.id);
      if (ok && o0 && o1) {
        const bayar = o1.payment;
        if (o0.payment) f("INV-50", `pesanan ${o0.code} dibayar dua kali`);
        if (o0.sessionId) f("INV-50", `pesanan yang menempel di meja ikut dibayar terpisah`);
        if (!bayar) f("INV-50", `pembayaran takeaway ${o0.code} tidak tercatat`);
        else {
          if (bayar.amount !== o0.value - o0.paidOnline) f("INV-50", `takeaway ${o0.code} dibayar ${bayar.amount}, nilainya ${o0.value - o0.paidOnline}`);
          if (bayar.shiftId !== b.shift?.id) f("INV-50", `pembayaran takeaway tidak masuk shift yang sedang buka`);
          settleLog.push({ id: o1.id, channel: bayar.channel, amount: bayar.amount, shiftId: b.shift?.id, at: now, split: true });
        }
      } else if (!ok && moneySig(a) !== moneySig(b)) {
        f("INV-50", `pembayaran takeaway ditolak tapi data uang berubah`);
      }
    }

    // INV-51 open bill menutup meja itu untuk BOOKING ONLINE sisa hari itu.
    // Tamu online tidak bisa disuruh menunggu tamu yang tidak punya jam selesai.
    for (const ob of a.sessions.filter((x) => isOpenBill(x) && businessDateOf(x.startsAt) === businessDateOf(now))) {
      const jam = hourIdx(now) + 2;
      if (jam < 26) {
        const mulai = slotStart(businessDateOf(now), jam);
        if (!slotProblem(a, { tableId: ob.tableId, startsAt: mulai, hours: 1 }, now, true)) {
          f("INV-51", `meja ${ob.tableId} open bill tapi jam ${jam}.00 masih dijual online`);
        }
      }
    }

    // Hari yang masih punya sesi HIDUP tidak boleh ditutup buku — uangnya belum selesai.
    // Diperiksa setiap aksi, bukan hanya saat pergantian hari.
    for (const h of a.history) {
      const hidup = a.sessions.find((x) => (x.status === "running" || x.status === "hold") &&
        businessDateOf(x.startsAt) === h.bizDate);
      if (hidup) f("INV-42", `hari ${h.bizDate} diarsipkan padahal ${hidup.id} masih ${hidup.status}`);
    }

    // INV-08 / INV-24 / INV-25 rekap
    const today = businessDateOf(now);
    const r = recap(a, today);
    // PRD KK-19: hari operasional dari jam MULAI.
    const closedToday = a.sessions.filter((s) =>
      (s.status === "done" || s.status === "noshow") && businessDateOf(s.startsAt) === today);
    // Takeaway baru jadi penjualan setelah uangnya diterima (lunas online, atau dibayar
    // saat diambil di kasir). Yang masih menunggu diambil belum masuk omzet.
    const takeawayToday = a.orders.filter((o) => o.status === "diterima" && !o.sessionId &&
      businessDateOf(o.at) === today && (o.paidOnline > 0 || (o.payment?.amount ?? 0) > 0));
    const expGross = closedToday.reduce((n, s) =>
      n + (s.settledBilliard ?? 0) + (s.settledFnb ?? 0) - (s.settledDiscount ?? 0), 0)
      + takeawayToday.reduce((n, o) => n + sum(o.lines), 0);
    if (r.gross !== r.diterima + r.prabayar) f("INV-08", `rekap: nilai ${r.gross} ≠ diterima ${r.diterima} + prabayar ${r.prabayar}`);
    const kanal = Object.entries(r.byChannel).filter(([k]) => k !== "prabayar").reduce((n, [, v]) => n + v.gross, 0);
    if (kanal !== r.diterima) f("INV-08", `jumlah per kanal ${kanal} ≠ diterima ${r.diterima}`);
    if (r.dpp + r.tax !== r.gross) f("INV-08", `DPP + pajak ≠ nilai penjualan`);
    if (r.billiard + r.fnb - r.discount !== r.gross) f("INV-08", `lini usaha tidak menjumlah ke nilai penjualan`);
    if (r.gross !== expGross) f("INV-24", `rekap hari ini ${r.gross}, seharusnya ${expGross} (hanya ${today}, termasuk takeaway)`);
    for (const s of a.sessions) {
      if (s.status === "booked") {
        const due = noShowDue(a.sessions, s, readyFrom[s.id] ?? 0);
        if (due !== null && due < now) {
          f("INV-25", `${s.id} masih "booked" ${Math.round((now - due) / 60000)} menit setelah batas datang (setelah ${act.t})`);
        }
      }
      if (s.status === "noshow" && act.t === "tick" && !b.sessions.some((x) => x.id === s.id && x.status === "noshow")) {
        const was = b.sessions.find((x) => x.id === s.id)!;
        const due = noShowDue(b.sessions, was, readyFrom[s.id] ?? 0);
        if (due === null) f("INV-39", `${s.id} dilepas padahal ${s.tableId} masih dipakai / tidak pernah bisa ditempati`);
        else if (s.settledAt !== due) f("INV-25", `${s.id} no-show dicatat ${s.settledAt}, seharusnya ${due}`);
      }
      // INV-30 hold kedaluwarsa wajib sudah lepas
      if (s.status === "hold" && (s.holdUntil ?? 0) <= now) f("INV-30", `hold ${s.id} masih menahan slot ${Math.round((now - (s.holdUntil ?? 0)) / 60000)} menit setelah batasnya`);
    }

    // INV-09 kas per shift
    if (act.t === "closeShift" && ok && b.shift) {
      const cash = settleLog.filter((x) => x.shiftId === b.shift!.id && x.channel === "cash")
        .reduce((n, x) => n + x.amount, 0);
      const trueExpected = b.shift.openingCash + cash;
      const closed = a.shiftHistory[0];
      const v = (closed?.countedCash ?? 0) - trueExpected;
      if (closed?.variance !== v) f("INV-09", `selisih tercatat ${closed?.variance}, seharusnya ${v} (kas shift ini ${trueExpected})`);
    }

    // INV-12 / INV-13 void
    if (act.t === "requestVoid" && ok && role === "karyawan" && moneySig(a) !== moneySig(b)) {
      f("INV-12", `void karyawan langsung mengubah uang/stok sebelum disetujui`);
    }
    if ((act.t === "requestVoid" || act.t === "decideVoid") && ok) {
      for (const s of b.sessions.filter((x) => x.status === "done")) {
        const still = a.sessions.find((x) => x.id === s.id);
        if (!still || still.settledAmount !== s.settledAmount || JSON.stringify(still.fnb) !== JSON.stringify(s.fnb)) {
          f("INV-13", `transaksi lunas ${s.id} berubah/hilang lewat void`);
        }
      }
      for (const o of b.orders.filter((x) => x.status === "diterima" && !x.sessionId)) {
        const tk = b.tickets.filter((t) => t.sessionId === o.id);
        const selesai = tk.length > 0 && tk.every((t) => t.status === "served");
        const after = a.orders.find((x) => x.id === o.id);
        if (selesai && after?.status !== "diterima") f("INV-13", `takeaway ${o.code} yang sudah diserahkan ter-void`);
        if (after?.status === "void" && o.paidOnline > 0 && !a.refunds.some((x) => x.bookingCode === o.code && x.amount === o.paidOnline)) {
          f("INV-13", `takeaway ${o.code} di-void tanpa pengembalian dana`);
        }
        // Uang yang sudah diterima kasir untuk takeaway ini ikut keluar dari laci
        // kalau barangnya di-void — dan wajib ada catatan dana yang dikembalikan.
        const bayarSebelum = o.payment?.amount ?? 0;
        const bayarSesudah = after?.payment?.amount ?? 0;
        if (bayarSesudah < bayarSebelum) {
          const keluar = bayarSebelum - bayarSesudah;
          if (!a.refunds.some((x) => x.bookingCode === o.code && x.amount === keluar && !b.refunds.some((y) => y.id === x.id))) {
            f("INV-13", `takeaway ${o.code}: uang kasir ${keluar} hilang tanpa catatan pengembalian`);
          }
          for (let i = settleLog.length - 1; i >= 0; i--) {
            if (settleLog[i].id === o.id) { settleLog[i].amount -= keluar; break; }
          }
        }
        if (after && after.payment && after.payment.amount > after.value - after.paidOnline) {
          f("INV-50", `takeaway ${after.code}: uang diterima ${after.payment.amount} melebihi nilai pesanan ${after.value - after.paidOnline}`);
        }
      }
      for (const s of b.sessions.filter((x) => x.status === "running")) {
        if (!a.sessions.find((x) => x.id === s.id)) {
          if (a.lights[s.tableId]) f("INV-14", `lampu ${s.tableId} masih nyala setelah sesinya di-void`);
          // Sesi di-void: uang split bill-nya dikembalikan, jadi keluar lagi dari laci.
          for (let i = settleLog.length - 1; i >= 0; i--) if (settleLog[i].id === s.id && settleLog[i].split) settleLog.splice(i, 1);
        }
      }
    }

    // INV-14 lampu nyala saat buka meja / check-in
    if ((act.t === "walkin" || act.t === "checkin") && ok) {
      const opened = a.sessions.find((x) => x.status === "running" &&
        !b.sessions.find((y) => y.id === x.id && y.status === "running"));
      if (opened && !a.lights[opened.tableId]) f("INV-14", `lampu ${opened.tableId} mati setelah ${act.t}`);
    }

    // INV-15 jejak audit
    const silent = new Set(["login", "logout", "ticket", "tick"]);
    const changed = sig(a) !== sig(b);
    if (changed && !silent.has(act.t) && a.log[0] === b.log[0]) f("INV-15", `${act.t} mengubah data tanpa jejak audit`);
    if (changed && !silent.has(act.t) && !SYSTEM_ACTS.has(act.t) && b.me && a.log[0] && a.log[0] !== b.log[0] && a.log[0].who !== b.me.name) {
      f("INV-15", `jejak audit ${act.t} tidak mencatat pelaku ${b.me.name}`);
    }

    // INV-16 ID unik
    const dup = (xs: string[]) => xs.length !== new Set(xs).size;
    const hist = a.history;
    if (dup([...a.sessions, ...hist.flatMap((h) => h.sessions)].map((x) => x.id))) f("INV-16", `ID sesi ganda (termasuk arsip)`);
    if (dup([...a.voids, ...hist.flatMap((h) => h.voids)].map((x) => x.id))) f("INV-16", `ID void ganda (termasuk arsip)`);
    if (dup(a.tickets.map((x) => x.id))) f("INV-16", `ID tiket ganda`);
    if (dup([...a.orders, ...hist.flatMap((h) => h.orders)].map((x) => x.id))) f("INV-16", `ID pesanan ganda (termasuk arsip)`);
    if (dup([...a.refunds, ...hist.flatMap((h) => h.refunds)].map((x) => x.id))) f("INV-16", `ID refund ganda (termasuk arsip)`);
    for (const s of a.sessions) if (dup(s.fnb.map((l) => l.key))) f("INV-16", `kunci baris ganda di ${s.id} (void bisa salah sasaran)`);

    // INV-17 meteran
    for (const s of a.sessions.filter(isOpenBill)) {
      const m1 = billiardTotalOf(s, a.rates, now).amount;
      const m0 = billiardTotalOf(s, a.rates, Math.max(s.startsAt, now - 7 * 60_000)).amount;
      if (m1 < m0) f("INV-17", `meteran ${s.id} turun ${m0} → ${m1}`);
      if (m1 % 500 !== 0) f("INV-17", `meteran ${s.id} ${m1} bukan kelipatan 500`);
    }

    // INV-18 / INV-22 / INV-30 booking online
    if (act.t === "hold" && ok) {
      const got = a.sessions.find((x) => x.id === act.session.id)!;
      const hours = Math.round((got.endsAt - got.startsAt) / 3_600_000);
      const want = got.paket === "siang" ? PAKET_SIANG.price : priceWith(b, sessType(got), hourIdx(got.startsAt), hours);
      if (got.tableAmount !== want) f("INV-18", `hold ${got.id} dihargai ${got.tableAmount}, tarif terkini ${want}`);
      if (got.holdUntil !== now + (HOLD_MIN + HOLD_GRACE_MIN) * 60_000) f("INV-30", `hold ${got.id} dilepas pada menit ke-${Math.round(((got.holdUntil ?? 0) - now) / 60000)}, seharusnya 19`);
      if (JSON.stringify(a.stock) !== JSON.stringify(b.stock) || got.paidOnline !== 0 || got.fnb.length) f("INV-30", `hold ${got.id} menggerakkan stok/uang sebelum dibayar`);
    }
    if (act.t === "confirmOnline") {
      const sent = act.session;
      const heldBefore = b.sessions.find((x) => x.id === sent.id && x.status === "hold");
      const got = ok ? a.sessions.find((x) => x.id === sent.id) : undefined;
      if (meta.duplicate && b.paymentIds.includes(sent.id)) {
        if (sig(a) !== sig(b)) f("INV-22", `notifikasi ganda ${sent.bookingCode} mengubah data (booking/refund dobel)`);
      } else if (got) {
        const h = hourIdx(got.startsAt);
        const hours = Math.round((got.endsAt - got.startsAt) / 3_600_000);
        const want = heldBefore ? heldBefore.tableAmount
          : got.paket === "siang" ? PAKET_SIANG.price : priceWith(a, sessType(got), h, hours);
        if (got.tableAmount !== want) f("INV-18", `booking ${sent.id} dihargai ${got.tableAmount}, seharusnya ${want}${heldBefore ? " (harga beku saat hold)" : " (tarif terkini)"}`);
        for (const l of got.fnb) prepaid.add(`${got.id}|${l.key}`);
        const dibayar = sent.paidOnline;
        const refunded = a.refunds.filter((x) => x.bookingCode === sent.bookingCode && !b.refunds.includes(x)).reduce((n, x) => n + x.amount, 0);
        if (got.paidOnline + refunded !== dibayar) f("INV-22", `booking ${sent.id}: dibayar ${dibayar} ≠ tercatat ${got.paidOnline} + dikembalikan ${refunded}`);
      } else if (!ok && !b.sessions.some((x) => x.id === sent.id && x.status !== "hold")) {
        if (!a.refunds.some((x) => x.bookingCode === sent.bookingCode && !b.refunds.includes(x))) {
          f("INV-22", `booking ${sent.bookingCode} ditolak tapi dananya tidak tercatat untuk dikembalikan`);
        }
        if (a.sessions.some((x) => x.id === sent.id)) f("INV-30", `booking ${sent.id} ditolak tapi hold-nya masih menahan slot`);
      }
    }

    // INV-19 / INV-20 check-in
    if (act.t === "checkin" && ok) {
      const bk = b.sessions.find((x) => x.checkin === act.code && x.status === "booked")!;
      const run = a.sessions.find((x) => x.id === bk.id)!;
      if (run.endsAt !== bk.endsAt) f("INV-19", `check-in memindah jam selesai ${bk.id} (${Math.round((run.endsAt - bk.endsAt) / 60000)} menit)`);
      const pre = bk.fnb.filter((l) => prepaid.has(`${bk.id}|${l.key}`));
      for (const l of pre) {
        if (!a.tickets.some((t) => t.sessionId === bk.id && t.itemId === l.itemId)) {
          f("INV-20", `pesanan online ${l.itemId} untuk ${bk.id} tidak masuk dapur`);
        }
      }
    }

    // INV-21 jam operasional
    if (act.t === "walkin" && ok) {
      const h = hourIdx(now);
      if (h < 11 || h >= 26) f("INV-21", `meja dibuka pukul ${wibDate(now).getUTCHours()}.xx (di luar jam buka)`);
    }

    // INV-26 perpanjangan
    if (act.t === "extend" && ok) {
      const s0 = b.sessions.find((x) => x.id === act.id)!;
      const s1 = a.sessions.find((x) => x.id === act.id)!;
      if (s0.source === "online") {
        const want = priceWith(b, sessType(s0), hourIdx(s0.endsAt), act.minutes / 60);
        const got = s1.tableAmount - s0.tableAmount;
        if (got !== want) f("INV-26", `perpanjangan ${s0.id} dihargai ${got}, seharusnya ${want} (tarif jam ${hourIdx(s0.endsAt)})`);
        extraTable[s0.id] = (extraTable[s0.id] ?? 0) + got;
      }
      if (s0.status !== "running") f("INV-26", `perpanjangan diterima untuk sesi ${s0.status}`);
    }

    // INV-27 relokasi
    if (act.t === "relocate" && ok) {
      const s0 = b.sessions.find((x) => x.id === act.id)!;
      if (s0.status === "running" && (a.lights[s0.tableId] || !a.lights[act.toTableId])) {
        f("INV-27", `lampu tidak ikut pindah ${s0.tableId} → ${act.toTableId}`);
      }
    }

    // INV-28 Paket Siang
    for (const s of a.sessions) {
      const lines = s.status === "hold" ? (s.holdLines ?? []) : s.fnb;
      const gratis = lines.filter((l) => l.unitPrice === 0);
      if (s.paket !== "siang") {
        if (gratis.length) f("INV-28", `${s.id} bukan Paket Siang tapi punya minuman gratis`);
        continue;
      }
      if (s.status === "noshow") continue;
      const total = gratis.reduce((n, l) => n + l.qty, 0) + (s.freeDrinks ?? 0);
      if (total !== PAKET_FREE_DRINKS) f("INV-28", `${s.id}: gratis terpakai + sisa jatah = ${total}, seharusnya ${PAKET_FREE_DRINKS} setelah ${act.t}`);
      for (const l of gratis) {
        if (!PAKET_FREE_CATEGORIES.includes(CATEGORY_OF[l.itemId])) f("INV-28", `${s.id}: ${l.itemId} digratiskan padahal bukan minuman paket`);
      }
    }

    // INV-29 pesanan tamu
    if (act.t === "guestOrder") {
      const o = act.order;
      const got = a.orders.find((x) => x.id === o.id);
      const sessB = o.mode === "meja" ? b.sessions.find((x) => x.tableId === o.tableId && x.status === "running") : undefined;
      if (!got) {
        if (!b.orders.some((x) => x.id === o.id)) f("INV-29", `pesanan ${o.code} hilang tanpa jejak (tidak diterima maupun ditolak)`);
      } else if (ok) {
        if (o.mode === "meja" && !sessB) f("INV-29", `pesanan QR ${o.code} diterima padahal ${o.tableId} belum dibuka kasir`);
        if (o.sessionId && sessB?.id !== o.sessionId) f("INV-29", `pesanan QR ${o.code} masuk ke tab lain (tab tamu ${o.sessionId} sudah berganti)`);
        // Takeaway boleh "bayar di kasir", tapi uangnya belum boleh diakui sebelum dibayar.
        if (o.mode === "takeaway" && o.pay !== "online" && (got.payment || got.paidOnline > 0)) {
          f("INV-29", `takeaway ${o.code} dianggap lunas padahal belum dibayar di kasir`);
        }
        const want = priceLines(b, o.lines, sessB?.freeDrinks ?? 0).total;
        if (got.value !== want || sum(got.lines) !== want) f("INV-29", `pesanan ${o.code} bernilai ${got.value}, harga terkini ${want}`);
        const tk = a.tickets.filter((t) => t.sessionId === (got.sessionId ?? got.id) && !b.tickets.some((x) => x.id === t.id));
        const qtyTk = tk.reduce((n, t) => n + t.qty, 0), qtyLines = got.lines.reduce((n, l) => n + l.qty, 0);
        if (qtyTk !== qtyLines) f("INV-29", `pesanan ${o.code}: ${qtyLines} porsi dipesan, ${qtyTk} masuk dapur`);
        if (sessB) {
          const sA = a.sessions.find((x) => x.id === sessB.id)!;
          const added = sA.fnb.slice(sessB.fnb.length);
          if (o.pay === "online") {
            for (const l of added) prepaid.add(`${sA.id}|${l.key}`);
            if (sA.paidOnline - sessB.paidOnline !== got.value) f("INV-29", `pesanan QR lunas ${o.code} tidak tercatat sebagai prabayar meja`);
            if (settlementOf(sA, a, now).counterFnb !== settlementOf(sessB, b, now).counterFnb) f("INV-29", `pesanan QR lunas ${o.code} ikut ditagih lagi di kasir`);
          } else {
            const d = settlementOf(sA, a, now).counterFnb - settlementOf(sessB, b, now).counterFnb;
            if (d !== got.value) f("INV-29", `pesanan QR ${o.code} (bayar di kasir) menambah bill ${d}, seharusnya ${got.value}`);
          }
          if (sum(added) !== got.value) f("INV-29", `pesanan QR ${o.code} tidak menempel utuh ke bill meja`);
        }
      } else if (got.status === "ditolak" && !b.orders.some((x) => x.id === o.id)) {
        if (o.pay === "online" && o.paidOnline > 0 && !a.refunds.some((x) => x.bookingCode === o.code && x.amount === o.paidOnline)) {
          f("INV-29", `pesanan ${o.code} ditolak tapi dana ${o.paidOnline} tidak tercatat untuk dikembalikan`);
        }
        if (JSON.stringify(a.stock) !== JSON.stringify(b.stock) || JSON.stringify(a.sessions) !== JSON.stringify(b.sessions)) {
          f("INV-29", `pesanan ${o.code} ditolak tapi stok/bill berubah`);
        }
      }
    }

    // INV-31 harga menu terkunci per baris
    if (act.t === "setMenuPrice" && ok) {
      for (const s0 of b.sessions) {
        const s1 = a.sessions.find((x) => x.id === s0.id);
        if (!s1) continue;
        if (fnbTotalOf(s1) !== fnbTotalOf(s0) || sum(s1.holdLines ?? []) !== sum(s0.holdLines ?? [])) {
          f("INV-31", `nilai pesanan ${s0.id} berubah setelah harga menu diubah`);
        }
      }
      for (const o0 of b.orders) {
        const o1 = a.orders.find((x) => x.id === o0.id);
        if (o1 && sum(o1.lines) !== sum(o0.lines)) f("INV-31", `nilai pesanan ${o0.code} berubah setelah harga menu diubah`);
      }
    }
    if (ok && (act.t === "addFnb" || act.t === "guestOrder" || act.t === "hold")) {
      let fresh: CartLine[] = [];
      if (act.t === "addFnb") {
        const s0 = b.sessions.find((x) => x.id === act.sessionId)!;
        fresh = a.sessions.find((x) => x.id === act.sessionId)!.fnb.slice(s0.fnb.length);
      } else if (act.t === "guestOrder") fresh = a.orders.find((x) => x.id === act.order.id)!.lines;
      else fresh = a.sessions.find((x) => x.id === act.session.id)!.holdLines ?? [];
      for (const l of fresh) {
        if (l.unitPrice !== 0 && l.unitPrice !== priceOf(b, l.itemId)) {
          f("INV-31", `${act.t}: ${l.itemId} dikunci ${l.unitPrice}, harga saat dipesan ${priceOf(b, l.itemId)}`);
        }
      }
    }

    // INV-34 tiket dapur ↔ baris yang masih ada
    for (const t of a.tickets) {
      if (t.status === "served" || t.lineKey === undefined) continue;
      const sess = a.sessions.find((x) => x.id === t.sessionId);
      if (sess && sess.status !== "running") continue;           // tab sudah ditutup: dapur boleh menuntaskan
      const ord = sess ? undefined : a.orders.find((x) => x.id === t.sessionId);
      const line = sess ? sess.fnb.find((l) => l.key === t.lineKey) : ord?.lines.find((l) => l.key === t.lineKey);
      if (!line || line.itemId !== t.itemId || line.qty !== t.qty || (line.variant ?? "") !== (t.variant ?? "")) {
        f("INV-34", `tiket ${t.name}${t.variant ? ` (${t.variant})` : ""} di ${t.tableName} tidak mewakili baris mana pun setelah ${act.t}`);
      }
    }

    // INV-35 tanda habis manual
    if (act.t === "toggleSoldOut" && ok) {
      const row = b.stock.find((r) => r.itemId === act.itemId);
      if (a.soldOut.includes(act.itemId) && row?.qty !== 0) manualOut.add(act.itemId);
      else manualOut.delete(act.itemId);
    }
    for (const id of [...manualOut]) {
      if (a.stock.find((r) => r.itemId === id)?.qty === 0) { manualOut.delete(id); continue; }  // kini habis karena stok
      if (!a.soldOut.includes(id)) {
        f("INV-35", `${id} ditandai habis manual tapi tersedia lagi setelah ${act.t}`);
        manualOut.delete(id);
      }
    }

    // INV-36 refund atas nama pembayar (+ INV-13 untuk void pesanan sebagian)
    if ((act.t === "requestVoid" || act.t === "decideVoid") && ok) {
      const fresh = a.refunds.filter((r) => !b.refunds.some((x) => x.id === r.id));
      for (const s0 of b.sessions) {
        if (a.sessions.some((x) => x.id === s0.id)) continue;       // hanya sesi yang benar-benar di-void
        const attached = b.orders.filter((o) => o.sessionId === s0.id && o.status === "diterima" && o.paidOnline > 0);
        for (const o of attached) {
          if (!fresh.some((r) => r.bookingCode === o.code && r.amount === o.paidOnline)) {
            f("INV-36", `pesanan QR ${o.code} (${o.guest}) tidak mendapat refund atas kodenya sendiri`);
          }
        }
        // Uang split bill yang sudah diterima kasir juga harus dikembalikan saat sesinya di-void.
        const rest = Math.max(0, s0.paidOnline - attached.reduce((n, o) => n + o.paidOnline, 0)) + splitPaid(s0);
        const own = fresh.filter((r) => r.bookingCode === (s0.bookingCode ?? s0.id)).reduce((n, r) => n + r.amount, 0);
        if (own !== rest) f("INV-36", `refund atas ${s0.bookingCode ?? s0.id} ${own}, seharusnya ${rest}`);
      }
      const kind = act.t === "requestVoid" ? act.req.targetKind : b.voids.find((v) => v.id === act.id)?.targetKind;
      for (const o0 of b.orders) {
        const o1 = a.orders.find((x) => x.id === o0.id);
        if (!o1 || o0.status !== "diterima") continue;
        const dropped = o0.lines.filter((l) => !o1.lines.some((x) => x.key === l.key));
        if (dropped.length === 0) continue;
        if (kind === "pesanan") {
          const served = b.tickets.filter((t) => t.sessionId === (o0.sessionId ?? o0.id) && t.status === "served").map((t) => t.lineKey);
          if (dropped.some((l) => served.includes(l.key))) f("INV-13", `baris ${o0.code} yang sudah diserahkan ikut di-void`);
        }
        const prabayarKembali = o0.pay === "online" ? sum(dropped) : 0;
        // Takeaway yang sudah dibayar di kasir: uangnya ikut dikembalikan sebesar
        // barang yang di-void (tidak lebih besar dari yang pernah diterima).
        const kasirKembali = Math.min(o0.payment?.amount ?? 0, Math.max(0, sum(dropped) - prabayarKembali));
        const want = prabayarKembali + kasirKembali;
        const got = fresh.filter((r) => r.bookingCode === o0.code).reduce((n, r) => n + r.amount, 0);
        if (got !== want) f("INV-36", `void pesanan ${o0.code}: refund ${got}, seharusnya ${want}`);
        if (o1.value !== o0.value - sum(dropped)) f("INV-36", `nilai pesanan ${o0.code} tidak ikut berkurang setelah void`);
      }
    }

    // INV-37 tarif open bill dibekukan
    if (act.t === "setRate" && ok) {
      for (const s0 of b.sessions.filter(isOpenBill)) {
        const s1 = a.sessions.find((x) => x.id === s0.id)!;
        if (billiardTotalOf(s1, a.rates, now).amount !== billiardTotalOf(s0, b.rates, now).amount) {
          f("INV-37", `meteran ${s0.id} berubah setelah tarif diubah`);
        }
      }
    }

    // INV-38 jam tutup
    if (act.t === "extend" && ok) {
      const s1 = a.sessions.find((x) => x.id === act.id)!;
      if (hourIdx(s1.endsAt - 1) >= 26) f("INV-38", `${s1.id} diperpanjang sampai ${wibDate(s1.endsAt).getUTCHours()}.00, melewati jam tutup`);
    }

    // INV-40 pulihkan no-show
    if (act.t === "restoreNoShow" && ok) {
      const s0 = b.sessions.find((x) => x.id === act.id);
      const s1 = a.sessions.find((x) => x.id === act.id);
      if (!s0 || !s1 || s0.status !== "noshow" || s1.status !== "running") {
        f("INV-40", `pulihkan ${act.id}: ${s0?.status} → ${s1?.status}`);
      } else {
        if (now >= s0.endsAt) f("INV-40", `${s0.id} dipulihkan setelah jadwalnya habis`);
        if (s1.endsAt !== s0.endsAt) f("INV-19", `${s0.id} jam selesai bergeser saat dipulihkan`);
        if (!a.lights[s1.tableId]) f("INV-14", `lampu ${s1.tableId} mati setelah no-show dipulihkan`);
        const back = s0.noShowFnb ?? [];
        const dropped = back.filter((l) => !s1.fnb.some((k) => k.key === l.key));
        const fresh = a.refunds.filter((r) => !b.refunds.some((x) => x.id === r.id));
        const refunded = fresh.reduce((n, r) => n + r.amount, 0);
        if (refunded !== sum(dropped)) f("INV-40", `refund pra-order ${refunded}, seharusnya ${sum(dropped)}`);
        if (fresh.some((r) => r.bookingCode !== (s0.bookingCode ?? s0.id))) f("INV-36", `refund pulihkan ${s0.id} tidak atas kode bookingnya`);
        if (s1.paidOnline !== s0.paidOnline - sum(dropped)) f("INV-40", `prabayar ${s1.paidOnline}, seharusnya ${s0.paidOnline - sum(dropped)}`);
        for (const l of s1.fnb) {
          if (!a.tickets.some((t) => t.sessionId === s1.id && t.lineKey === l.key)) f("INV-40", `pra-order ${l.key} tidak masuk dapur`);
        }
        const freeBack = dropped.filter((l) => l.unitPrice === 0).reduce((n, l) => n + l.qty, 0);
        if (s0.freeDrinks !== undefined && s1.freeDrinks !== s0.freeDrinks + freeBack) f("INV-28", `jatah minuman gratis ${s1.freeDrinks}, seharusnya ${s0.freeDrinks + freeBack}`);
      }
    }

    // INV-41 refund: catatan tambah-saja, dikembalikan tepat sekali
    for (const r0 of b.refunds) {
      const r1 = a.refunds.find((x) => x.id === r0.id) ?? a.history.flatMap((h) => h.refunds).find((x) => x.id === r0.id);
      if (!r1) { f("INV-41", `refund ${r0.id} hilang setelah ${act.t}`); continue; }
      if (r1.amount !== r0.amount) f("INV-41", `nominal refund ${r0.id} berubah setelah ${act.t}`);
      if (r0.settledAt && (r1.settledAt !== r0.settledAt || r1.method !== r0.method)) f("INV-41", `refund ${r0.id} dicatat dikembalikan ulang`);
    }
    if (act.t === "settleRefund" && ok) {
      const r0 = b.refunds.find((x) => x.id === act.id);
      const r1 = a.refunds.find((x) => x.id === act.id);
      if (!r0 || r0.settledAt) f("INV-41", `refund ${act.id} yang sudah dikembalikan dicatat lagi`);
      if (!r1 || r1.settledAt !== now || r1.settledBy !== b.me?.name || r1.method !== act.method) f("INV-41", `catatan pengembalian ${act.id} tidak lengkap`);
    }
  }

  /* ── Pembentuk permintaan pelanggan ─────────────────────────────── */
  const randomLines = (tag: string, step: number, n = 1 + Math.floor(rnd() * 2)): CartLine[] =>
    Array.from({ length: n }, (_, i) => {
      const it = pick(ALL_ITEMS);
      const row = st.stock.find((r) => r.itemId === it.id);
      const qty = row && row.qty !== null && rnd() < 0.15 ? row.qty + 1 : 1 + Math.floor(rnd() * 2); // kadang melebihi stok
      return { key: `${tag}-${sim}-${step}-${i}`, itemId: it.id, qty };
    });

  const bookingPayload = (step: number) => {
    const t = pick(BILLIARD);
    const race = rnd() < (kind === "adversarial" ? 0.35 : 0.15);
    let startsAt: number, hours: number;
    const occupied = st.sessions.filter((s) => s.tableId === t.id && ACTIVE.has(s.status));
    if (race && occupied.length) {
      const o = pick(occupied);
      startsAt = Math.max(o.startsAt, now + 60 * 60_000); hours = 2;
      startsAt = new Date(startsAt).setMinutes(0, 0, 0);
    } else {
      const bd = businessDateOf(now);
      const h = 11 + Math.floor(rnd() * 14);
      startsAt = slotStart(bd, h);
      if (startsAt <= now + 60 * 60_000) startsAt += 24 * 3_600_000;
      hours = 1 + Math.floor(rnd() * 3);
    }
    const h = hourIdx(startsAt);
    const paket = classOf(st, t.id) === "regular" && h <= 16 && rnd() < 0.25;
    if (paket) hours = 2;
    const code = `SPL-S${sim}X${step}`;
    const lines = rnd() < 0.4 ? randomLines("pre", step) : [];
    if (paket && rnd() < 0.4) lines.push({ key: `cold-${sim}-${step}`, itemId: pick(COLD).id, qty: 1 });
    const payload = {
      id: `o-${code}`, tableId: t.id, source: "online", guest: `Online${step}`,
      startsAt, endsAt: startsAt + hours * 3_600_000, status: "booked",
      bookingCode: code, checkin: String(100000 + sim * 1000 + step), fnb: lines,
      tableAmount: 0, paidOnline: 0,
      ...(paket ? { paket: "siang" } : {}),
    } as LiveSession;
    const fresh = (paket ? PAKET_SIANG.price : priceWith(st, classOf(st, t.id), h, hours)) + priceLines(st, lines, paket ? PAKET_FREE_DRINKS : 0).total;
    const stale = (paket ? PAKET_SIANG.price : basePrice(t.type, h, hours)) +
      lines.reduce((n, l) => n + (findItem(l.itemId)?.price ?? 0) * l.qty, 0);
    return { payload, fresh, stale, race };
  };

  /* ── Skenario ─────────────────────────────────────────────────── */
  const script = sim % 3 === 0 ? { stage: 0, id: "" } : null;
  // Skenario terarah malam (simulasi lintas-hari): booking menjelang jam tutup 02.00
  // tidak boleh diperpanjang melewatinya, dan sesudah 02.00 meja tidak bisa dibuka.
  const night = kind === "lintas-hari" ? { stage: 0, bd: "", a: "", b: "" } : null;
  const nightAt = (hour: number, min: number) => slotStart(night!.bd, hour) + min * 60_000;
  const nightBooking = (hour: number, tag: string, step: number) => {
    const startsAt = slotStart(night!.bd, hour);
    const t = TABLES.find((x) => classOf(st, x.id) === "regular" && !slotProblem(st, { tableId: x.id, startsAt, hours: 2 }, now, false));
    if (!t) return "";
    const sent = {
      id: `o-NIGHT${tag}${sim}`, tableId: t.id, source: "online", guest: `Malam${tag}`, startsAt, endsAt: startsAt + 2 * 3_600_000,
      status: "booked", bookingCode: `SPL-NIGHT${tag}${sim}`, checkin: `N${tag}${sim}`, fnb: [], tableAmount: 0,
      paidOnline: priceWith(st, "regular", hour, 2),
    } as LiveSession;
    return dispatch({ t: "confirmOnline", session: sent }, step) ? sent.id : "";
  };
  for (let step = 1; step <= steps; step++) {
    // Waktu berjalan
    now += (1 + Math.floor(rnd() * 11)) * 60_000;
    if (rnd() < 0.06) now += (20 + Math.floor(rnd() * 40)) * 60_000;
    if (kind === "lintas-hari" && (step === 40 || step === 70)) {
      const d = wibDate(now); now = wibTs(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 11, 10);
    }

    if (night && night.stage < 4 && step >= 30) {
      if (night.stage === 0) night.bd = businessDateOf(now);
      const target = [nightAt(21, 50), nightAt(23, 5), nightAt(24, 5), nightAt(26, 5)][night.stage];
      if (target > now) now = target;
      if (businessDateOf(now) === night.bd) {
        login(superadmin[0], step);
        ensureShift(step);
        const cov = (coverage["(skenario) malam jelang 02.00"] ??= { ok: 0, ditolak: 0 });
        const sessOf = (id: string) => st.sessions.find((x) => x.id === id);
        if (night.stage === 0) {
          night.a = nightBooking(23, "A", step);          // 23.00–01.00
          night.b = nightBooking(24, "B", step);          // 00.00–02.00
        } else if (night.stage === 1 && sessOf(night.a)?.status === "booked") {
          const a0 = sessOf(night.a)!;
          if (dispatch({ t: "checkin", code: a0.checkin! }, step)) {
            // +1 jam → selesai tepat 02.00 (boleh bila mejanya kosong); +1 jam lagi → 03.00 (wajib ditolak)
            dispatch({ t: "extend", id: a0.id, minutes: 60 }, step);
            dispatch({ t: "extend", id: a0.id, minutes: 60 }, step) ? cov.ditolak++ : cov.ok++;
          }
        } else if (night.stage === 2 && sessOf(night.b)?.status === "booked") {
          const b0 = sessOf(night.b)!;
          if (dispatch({ t: "checkin", code: b0.checkin! }, step)) {
            dispatch({ t: "extend", id: b0.id, minutes: 60 }, step) ? cov.ditolak++ : cov.ok++;
            dispatch({ t: "extend", id: b0.id, minutes: 120 }, step) ? cov.ditolak++ : cov.ok++;
          }
        } else if (night.stage === 3) {
          const free = TABLES.find((t) => !st.sessions.some((x) => x.tableId === t.id && ACTIVE.has(x.status)));
          if (free) dispatch({ t: "walkin", tableId: free.id, guest: "Lewat02" }, step) ? cov.ditolak++ : cov.ok++;
        }
      }
      night.stage++;
    }

    // Skenario terarah Paket Siang (1 dari 3 simulasi): booking → check-in → minuman
    // gratis dipesan → kasir salah input lalu di-void → jatah harus kembali.
    if (script && script.stage < 4 && hourIdx(now) <= 15) {
      login(superadmin[0], step);
      ensureShift(step);
      if (script.stage === 0) {
        const startsAt = new Date(now).setMinutes(0, 0, 0) + 3_600_000;
        const t = TABLES.find((x) => classOf(st, x.id) === "regular" &&
          !slotProblem(st, { tableId: x.id, startsAt, hours: 2, paket: true }, now, false));
        if (t) {
          const code = `SPL-PAKET${sim}`;
          script.id = `o-${code}`;
          const sent = {
            id: script.id, tableId: t.id, source: "online", guest: "Paket", startsAt, endsAt: startsAt + 2 * 3_600_000,
            status: "booked", bookingCode: code, checkin: `P${sim}`, fnb: [], tableAmount: 0,
            paidOnline: PAKET_SIANG.price, paket: "siang",
          } as LiveSession;
          if (dispatch({ t: "confirmOnline", session: sent }, step)) script.stage = 1;
        }
      } else {
        const s = st.sessions.find((x) => x.id === script.id);
        if (!s || s.status === "noshow" || s.status === "done") script.stage = 4;
        else if (script.stage === 1 && s.status === "booked" && now >= s.startsAt - 30 * 60_000) {
          if (dispatch({ t: "checkin", code: s.checkin! }, step)) script.stage = 2;
        } else if (script.stage === 2 && s.status === "running") {
          const it = COLD.find((x) => !st.soldOut.includes(x.id));
          if (it) dispatch({ t: "addFnb", sessionId: s.id, name: it.name, station: it.station, line: { key: `paket-${sim}-${step}`, itemId: it.id, qty: 1 } }, step);
          if (st.sessions.find((x) => x.id === s.id)!.fnb.some((l) => l.unitPrice === 0)) script.stage = 3;
        } else if (script.stage === 3 && s.status === "running") {
          const free = s.fnb.find((l) => l.unitPrice === 0 && !l.prepaid);
          if (free) dispatch({ t: "requestVoid", req: { targetKind: "item", targetId: `${s.id}|${free.key}`, label: "item", amount: 0, reason: "Salah input" } }, step);
          script.stage = 4;
        }
      }
    }

    // Tutup hari (simulasi lintas-hari): semua tab ditutup & shift diserahkan sebelum lompat ke
    // hari berikutnya, supaya tutup buku otomatis benar-benar mengarsipkan hari pertama.
    if (kind === "lintas-hari" && (step === 39 || step === 69)) {
      login(superadmin[0], step);
      ensureShift(step);
      // Variasi yang menguji pengaman tutup buku: di langkah 39, separuh simulasi membiarkan
      // satu tab terlama tetap jalan melewati pergantian hari, dan separuh lagi tidak menutup
      // shift — hari yang masih "hidup" itu tidak boleh diarsipkan.
      const running = st.sessions.filter((x) => x.status === "running").sort((p, q) => p.startsAt - q.startsAt);
      if (step === 39 && sim % 4 === 1) longTab = running[0]?.id ?? null;
      for (const s of running) {
        if (s.id !== longTab) dispatch({ t: "settle", id: s.id, channel: "cash" }, step);
      }
      if (st.shift && !(step === 39 && sim % 2 === 0)) {
        const cash = settleLog.filter((x) => x.shiftId === st.shift!.id && x.channel === "cash").reduce((n, x) => n + x.amount, 0);
        dispatch({ t: "closeShift", countedCash: st.shift.openingCash + cash }, step);
      }
    }

    // Tab panjang akhirnya ditutup sesudah tutup buku kedua — harinya tidak boleh sudah diarsipkan.
    if (longTab && step === 72) {
      login(superadmin[0], step);
      ensureShift(step);
      if (st.sessions.some((x) => x.id === longTab && x.status === "running")) dispatch({ t: "settle", id: longTab, channel: "cash" }, step);
      longTab = null;
    }

    // ── Skenario terarah kecil (deterministik, tidak memakai angka acak) ──
    const freeRegular = (from: number, until: number) => TABLES.find((t) => classOf(st, t.id) === "regular" &&
      !st.sessions.some((x) => x.tableId === t.id && ACTIVE.has(x.status) && overlaps(x.startsAt, blockEndOf(x, now), from, until)));
    // (a) Meteran presisi: 35.000/jam × 54 menit harus tepat Rp 31.500 — bukan 32.000 karena galat desimal.
    if (sim % 4 === 1 && step === 2 && hourIdx(now) + 1 < 18) {
      login(superadmin[0], step);
      ensureShift(step);
      dispatch({ t: "setRate", key: "regularDay", value: 35_000 }, step);
      const t = freeRegular(now, now + 70 * 60_000);
      if (t && dispatch({ t: "walkin", tableId: t.id, guest: "Presisi" }, step)) {
        const w = st.sessions.find((x) => x.tableId === t.id && x.status === "running" && x.guest === "Presisi")!;
        now = w.startsAt + 54 * 60_000;
        if (dispatch({ t: "settle", id: w.id, channel: "cash" }, step)) (coverage["(skenario) meteran presisi 54 menit"] ??= { ok: 0, ditolak: 0 }).ok++;
      }
    }
    // (b) Tanda habis manual (mis. mesin es rusak) tidak dicabut oleh koreksi stok.
    if (sim % 4 === 3 && step === 3) {
      login(superadmin[0], step);
      const row = st.stock.find((r) => r.qty !== null && r.qty > 0 && !st.soldOut.includes(r.itemId));
      const it = row && findItem(row.itemId);
      if (row && it && dispatch({ t: "toggleSoldOut", itemId: it.id, name: it.name }, step)) {
        dispatch({ t: "addStock", itemId: it.id, delta: 6 }, step);
        dispatch({ t: "setStock", itemId: it.id, qty: 30 }, step);
        (coverage["(skenario) habis manual + koreksi stok"] ??= { ok: 0, ditolak: 0 }).ok++;
      }
    }
    // (e) Takeaway 2 item lunas online; satu sudah diserahkan dapur, lalu pesanan di-void —
    //     yang sudah diserahkan tetap terjual, hanya sisanya yang dibatalkan & dikembalikan dananya.
    if (sim % 4 === 3 && step === 7 && hourIdx(now) < 25) {
      login(superadmin[0], step);
      ensureShift(step);
      const items = ALL_ITEMS.filter((i) => !st.soldOut.includes(i.id) && (st.stock.find((r) => r.itemId === i.id)?.qty ?? 99) > 3).slice(0, 2);
      if (items.length === 2) {
        const lines: CartLine[] = items.map((it, i) => ({ key: `tk2-${sim}-${i}`, itemId: it.id, qty: 1 }));
        const id = `g-TK2-${sim}`;
        if (dispatch({ t: "guestOrder", order: { id, code: `SPL-TK2${sim}`, guest: "Takeaway dua", mode: "takeaway", pay: "online", lines, paidOnline: priceLines(st, lines).total } }, step)) {
          const tk = st.tickets.find((k) => k.sessionId === id && k.lineKey === lines[0].key);
          if (tk) dispatch({ t: "ticket", id: tk.id, status: "served" }, step);
          dispatch({ t: "requestVoid", req: { targetKind: "pesanan", targetId: id, label: "pesanan", amount: 0, reason: "Barang habis" } }, step);
          (coverage["(skenario) void takeaway sebagian sudah diserahkan"] ??= { ok: 0, ditolak: 0 }).ok++;
        }
      }
    }
    // (c) Tamu booking menunggu karena open bill sebelumnya belum selesai; open bill itu lalu di-void.
    //     Hitungan 20 menit no-show harus mulai dari saat void, bukan dari jam booking.
    if (sim % 4 === 2 && (step === 4 || step === 5)) {
      login(superadmin[0], step);
      ensureShift(step);
      if (step === 4) {
        const d = new Date(now + 60 * 60_000);
        if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) d.setHours(d.getHours() + 1, 0, 0, 0);
        const startsAt = d.getTime();
        const t = freeRegular(now, startsAt + 2 * 3_600_000);
        if (t && hourIdx(startsAt) + 2 <= 26 && dispatch({ t: "walkin", tableId: t.id, guest: "Molor" }, step)) {
          dispatch({
            t: "confirmOnline",
            session: {
              id: `o-WAIT${sim}`, tableId: t.id, source: "online", guest: "Menunggu", startsAt, endsAt: startsAt + 2 * 3_600_000,
              status: "booked", bookingCode: `SPL-WAIT${sim}`, checkin: `W${sim}`, fnb: [], tableAmount: 0,
              paidOnline: priceWith(st, "regular", hourIdx(startsAt), 2),
            } as LiveSession,
          }, step);
        }
      } else {
        const bk = st.sessions.find((x) => x.id === `o-WAIT${sim}` && x.status === "booked");
        const w = bk && st.sessions.find((x) => x.tableId === bk.tableId && x.status === "running" && x.guest === "Molor");
        if (bk && w) {
          if (now < bk.startsAt + 35 * 60_000) now = bk.startsAt + 35 * 60_000;
          if (dispatch({ t: "requestVoid", req: { targetKind: "sesi", targetId: w.id, label: "sesi", amount: 0, reason: "Salah input" } }, step)) {
            (coverage["(skenario) penghalang di-void, tamu menunggu"] ??= { ok: 0, ditolak: 0 }).ok++;
          }
        }
      }
    }

    // (f) Seperti (c), tetapi open bill penghalangnya DIPINDAH ke meja lain (bukan di-void).
    //     Hitungan 20 menit no-show juga harus mulai dari saat meja ditinggalkan.
    if (sim % 4 === 0 && (step === 8 || step === 9)) {
      login(superadmin[0], step);
      ensureShift(step);
      if (step === 8) {
        const d = new Date(now + 60 * 60_000);
        if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) d.setHours(d.getHours() + 1, 0, 0, 0);
        const startsAt = d.getTime();
        const t = freeRegular(now, startsAt + 2 * 3_600_000);
        if (t && hourIdx(startsAt) + 2 <= 26 && dispatch({ t: "walkin", tableId: t.id, guest: "Molor pindah" }, step)) {
          dispatch({
            t: "confirmOnline",
            session: {
              id: `o-MOVE${sim}`, tableId: t.id, source: "online", guest: "Menunggu pindah", startsAt, endsAt: startsAt + 2 * 3_600_000,
              status: "booked", bookingCode: `SPL-MOVE${sim}`, checkin: `M${sim}`, fnb: [], tableAmount: 0,
              paidOnline: priceWith(st, "regular", hourIdx(startsAt), 2),
            } as LiveSession,
          }, step);
        }
      } else {
        const bk = st.sessions.find((x) => x.id === `o-MOVE${sim}` && x.status === "booked");
        const w = bk && st.sessions.find((x) => x.tableId === bk.tableId && x.status === "running" && x.guest === "Molor pindah");
        if (bk && w) {
          if (now < bk.startsAt + 35 * 60_000) now = bk.startsAt + 35 * 60_000;
          const until = Math.max(w.endsAt, now + 30 * 60_000);
          const targets = TABLES.filter((t) => t.type === "regular" && t.id !== bk.tableId &&
            !st.sessions.some((x) => x.tableId === t.id && ACTIVE.has(x.status) && overlaps(x.startsAt, blockEndOf(x, now), now, until)));
          for (const to of targets) {
            if (dispatch({ t: "relocate", id: w.id, toTableId: to.id }, step)) {
              (coverage["(skenario) penghalang dipindah meja, tamu menunggu"] ??= { ok: 0, ditolak: 0 }).ok++;
              break;
            }
          }
        }
      }
    }

    // (g) Paket Siang dengan pra-order minuman gratis hangus jadi no-show; minumannya lalu ditandai
    //     habis. Saat kasir memulihkan bookingnya, jatah minuman gratis itu harus kembali.
    if (sim % 4 === 1 && step >= 10 && step <= 12 && hourIdx(now) <= 14) {
      login(superadmin[0], step);
      ensureShift(step);
      const id = `o-FREE${sim}`;
      const bk = st.sessions.find((x) => x.id === id);
      if (!bk && step === 10) {
        const cold = COLD.find((i) => !st.soldOut.includes(i.id) && (st.stock.find((r) => r.itemId === i.id)?.qty ?? 99) > 2);
        const startsAt = new Date(now).setMinutes(0, 0, 0) + 3_600_000;
        const t = cold && TABLES.find((x) => x.type === "regular" &&
          !slotProblem(st, { tableId: x.id, startsAt, hours: 2, paket: true }, now, false));
        if (cold && t) {
          dispatch({
            t: "confirmOnline",
            session: {
              id, tableId: t.id, source: "online", guest: "Paket hangus", startsAt, endsAt: startsAt + 2 * 3_600_000,
              status: "booked", bookingCode: `SPL-FREE${sim}`, checkin: `F${sim}`,
              fnb: [{ key: `free-${sim}`, itemId: cold.id, qty: 1 }], tableAmount: 0,
              paidOnline: PAKET_SIANG.price, paket: "siang",
            } as LiveSession,
          }, step);
        }
      } else if (bk?.status === "booked" && step === 11) {
        // Detak pada aksi berikut melepas no-show lebih dulu, baru minumannya ditandai habis.
        now = Math.max(now, bk.startsAt + (NO_SHOW_RELEASE_MIN + 1) * 60_000);
        const it = findItem(bk.fnb[0]?.itemId ?? "");
        if (it) dispatch({ t: "toggleSoldOut", itemId: it.id, name: it.name }, step);
      } else if (bk?.status === "noshow" && step === 12) {
        const c = (coverage["(skenario) pulihkan no-show, minuman gratis sudah habis"] ??= { ok: 0, ditolak: 0 });
        dispatch({ t: "restoreNoShow", id }, step) ? c.ok++ : c.ditolak++;
      }
    }

    // (h) Tab yang punya pesanan QR lunas atas nama tamu lain, lalu sesinya di-void:
    //     dana dikembalikan atas nama TIAP pembayar, bukan semuanya atas kode sesi.
    if (sim % 4 === 2 && step === 14 && hourIdx(now) + 1 < 26) {
      login(superadmin[0], step);
      ensureShift(step);
      const t = freeRegular(now, now + 60 * 60_000);
      const it = ALL_ITEMS.find((i) => !st.soldOut.includes(i.id) && (st.stock.find((r) => r.itemId === i.id)?.qty ?? 99) > 2);
      if (t && it && dispatch({ t: "walkin", tableId: t.id, guest: "Tab QR" }, step)) {
        const sess = st.sessions.find((x) => x.tableId === t.id && x.status === "running" && x.guest === "Tab QR")!;
        const lines: CartLine[] = [{ key: `qrpay-${sim}`, itemId: it.id, qty: 1 }];
        const ordered = dispatch({
          t: "guestOrder",
          order: {
            id: `g-QRPAY${sim}`, code: `SPL-QRPAY${sim}`, guest: "Tamu bayar sendiri", mode: "meja", tableId: t.id,
            pay: "online", lines, paidOnline: priceLines(st, lines).total, sessionId: sess.id,
          },
        }, step);
        if (ordered && dispatch({ t: "requestVoid", req: { targetKind: "sesi", targetId: sess.id, label: "sesi", amount: 0, reason: "Salah input" } }, step)) {
          (coverage["(skenario) void tab yang punya pesanan QR lunas"] ??= { ok: 0, ditolak: 0 }).ok++;
        }
      }
    }

    // (d) Rombongan lama sudah membayar & pulang, rombongan baru main di meja yang sama; HP rombongan
    //     lama masih menyimpan meja itu dan memesan "bayar di kasir" — tidak boleh masuk bill rombongan baru.
    if (sim % 4 === 0 && step === 6 && hourIdx(now) + 1 < 26) {
      login(superadmin[0], step);
      ensureShift(step);
      const t = freeRegular(now, now + 90 * 60_000);
      if (t && dispatch({ t: "walkin", tableId: t.id, guest: "Lama" }, step)) {
        const old = st.sessions.find((x) => x.tableId === t.id && x.status === "running" && x.guest === "Lama")!;
        now += 35 * 60_000;
        dispatch({ t: "settle", id: old.id, channel: "cash" }, step);
        if (dispatch({ t: "walkin", tableId: t.id, guest: "Baru" }, step)) {
          const it = ALL_ITEMS.find((i) => !st.soldOut.includes(i.id) && (st.stock.find((r) => r.itemId === i.id)?.qty ?? 99) > 2)!;
          const ok = dispatch({
            t: "guestOrder",
            order: {
              id: `g-STALE${sim}`, code: `SPL-STALE${sim}`, guest: "HP lama", mode: "meja", tableId: t.id, pay: "kasir",
              lines: [{ key: `stale-${sim}`, itemId: it.id, qty: 1 }], paidOnline: 0, sessionId: old.id,
            },
          }, step);
          const c = (coverage["(skenario) pesanan ke tab yang sudah ditutup"] ??= { ok: 0, ditolak: 0 });
          ok ? c.ok++ : c.ditolak++;
        }
      }
    }

    // (j) Tamu bayar hampir lunas lewat split bill, lalu superadmin mencoba memundurkan
    //     meteran ke awal. Harus DITOLAK: uang yang sudah diterima tidak boleh melebihi tagihan.
    if (sim % 5 === 2 && step === 12 && hourIdx(now) + 2 < 26) {
      login(superadmin[0], step);
      ensureShift(step);
      const t = freeRegular(now, now + 90 * 60_000);
      if (t && dispatch({ t: "walkin", tableId: t.id, guest: "Mundur" }, step)) {
        const w = st.sessions.find((x) => x.tableId === t.id && x.status === "running" && x.guest === "Mundur")!;
        now = w.startsAt + 50 * 60_000;
        const sisa = settlementOf(st.sessions.find((x) => x.id === w.id)!, st, now).due;
        if (sisa > 0 && dispatch({ t: "paySplit", id: w.id, channel: "cash", amount: sisa }, step)) {
          // Mundur ke menit ke-1: tagihan jadi 0, padahal uang sudah diterima.
          dispatch({ t: "stopMeter", id: w.id, at: w.startsAt + 60_000 }, step);
          (coverage["(skenario) meteran dimundurkan sesudah dibayar"] ??= { ok: 0, ditolak: 0 }).ok++;
        }
      }
    }

    // (i) Tamu melunasi SELURUH tagihan lewat split bill, lalu kasir memasukkan kode promo
    //     saat menutup tab. Promo TIDAK boleh memotong uang yang sudah diterima kasir —
    //     kalau boleh, venue seolah berutang ke tamu yang sudah membayar lunas.
    //     Dijalankan di akhir pekan (promo otomatis Happy Hour tidak berlaku).
    if (sim % 7 >= 5 && step === 8 && hourIdx(now) + 1 < 24 && !bestPromo(st.promos, 300_000, 300_000, now)) {
      login(superadmin[0], step);
      ensureShift(step);
      const t = freeRegular(now, now + 80 * 60_000);
      const mahal = ALL_ITEMS.find((i) => priceOf(st, i.id) >= 25_000 && !st.soldOut.includes(i.id) &&
        (st.stock.find((r) => r.itemId === i.id)?.qty ?? null) === null);
      if (t && mahal && dispatch({ t: "walkin", tableId: t.id, guest: "Lunas" }, step)) {
        const w = st.sessions.find((x) => x.tableId === t.id && x.status === "running" && x.guest === "Lunas")!;
        dispatch({ t: "addFnb", sessionId: w.id, name: mahal.name, station: mahal.station,
          line: { key: `lunas-${sim}`, itemId: mahal.id, qty: 5 } }, step);      // F&B ≥ 100rb → syarat COMBO50
        now = w.startsAt + 40 * 60_000;
        const w2 = st.sessions.find((x) => x.id === w.id)!;
        const sisa = settlementOf(w2, st, now).due;
        if (sisa > 0 && dispatch({ t: "paySplit", id: w.id, channel: "cash", amount: sisa, label: "Lunas di muka" }, step)) {
          dispatch({ t: "settle", id: w.id, channel: "cash", promoCode: "COMBO50" }, step);
          (coverage["(skenario) lunas duluan, promo di akhir"] ??= { ok: 0, ditolak: 0 }).ok++;
        }
      }
    }

    const actor = rnd() < (kind === "adversarial" ? 0.8 : 0.7) ? pick(karyawan) : pick(superadmin);
    login(actor, step);
    if (rnd() > 0.04) ensureShift(step);

    const w = rnd() * 100;
    const running = st.sessions.filter((s) => s.status === "running");
    const booked = st.sessions.filter((s) => s.status === "booked");

    if (w < 11) {
      // Sesekali meja resto dibuka kasir (tamu makan tanpa reservasi): tanpa meteran jam.
      // Sebagian tamu membeli PAKET PER JAM (harga blok), sisanya open bill bermeteran.
      const meja = rnd() < 0.15 ? pick(RESTO) : pick(BILLIARD);
      const paketJam = rnd() < 0.3 ? pick([1, 2, 3, 9]) : undefined;   // 9 jam sengaja: harus ditolak
      dispatch({ t: "walkin", tableId: meja.id, guest: `Tamu${step}`, ...(paketJam ? { hours: paketJam } : {}) }, step);
    } else if (w < 19) {
      // Pelanggan membuka halaman QRIS (hold), atau notifikasi bayar datang tanpa hold.
      const { payload, fresh, stale, race } = bookingPayload(step);
      if (rnd() < 0.8) {
        if (dispatch({ t: "hold", session: payload }, step, { race })) {
          const h = st.sessions.find((x) => x.id === payload.id)!;
          const amount = rnd() < 0.08 ? stale : h.tableAmount + sum(h.holdLines ?? []);
          if (rnd() < 0.65) {
            // Kebanyakan tamu langsung membayar. Kadang kasir menandai menu habis
            // tepat saat tamu sedang scan QR — pesanan itu harus dikembalikan dananya.
            const held = (h.holdLines ?? []).filter((l) => l.unitPrice !== 0);
            if (held.length && rnd() < 0.25) {
              const it = findItem(pick(held).itemId)!;
              login(pick(karyawan), step);
              if (!st.soldOut.includes(it.id)) dispatch({ t: "toggleSoldOut", itemId: it.id, name: it.name }, step);
            }
            const sent = { ...payload, paidOnline: amount };
            dispatch({ t: "confirmOnline", session: sent }, step);
            sentConfirms.push(sent);
          } else {
            pending.push({ payload, amount });
          }
        }
      } else {
        const sent = { ...payload, paidOnline: rnd() < 0.08 ? stale : fresh };
        dispatch({ t: "confirmOnline", session: sent }, step, { race });
        sentConfirms.push(sent);
      }
    } else if (w < 25 && (pending.length || sentConfirms.length)) {
      const r = rnd();
      if (sentConfirms.length && (r < 0.1 || !pending.length)) {
        // Notifikasi pembayaran ganda (gateway mengulang webhook)
        dispatch({ t: "confirmOnline", session: pick(sentConfirms) }, step, { duplicate: true });
      } else if (pending.length) {
        const i = Math.floor(rnd() * pending.length);
        const p = pending[i];
        if (r < 0.2) {
          dispatch({ t: "releaseHold", id: p.payload.id }, step);
          pending.splice(i, 1);
        } else if (r < 0.9) {
          const sent = { ...p.payload, paidOnline: p.amount };
          dispatch({ t: "confirmOnline", session: sent }, step);
          sentConfirms.push(sent);
          pending.splice(i, 1);
        }
        // sisanya: pelanggan belum bayar — hold jalan terus sampai kedaluwarsa
      }
    } else if (w < 31 && booked.length) {
      // Tamu biasanya datang mendekati jamnya; sesekali salah hari/terlalu awal.
      const due = booked.filter((s) => s.startsAt - 30 * 60_000 <= now && now < s.startsAt + 20 * 60_000);
      dispatch({ t: "checkin", code: (due.length && rnd() < 0.8 ? pick(due) : pick(booked)).checkin! }, step);
    } else if (w < 42 && running.length) {
      // Tamu Paket Siang yang masih punya jatah biasanya memesan minuman gratisnya.
      const paketAda = running.filter((x) => (x.freeDrinks ?? 0) > 0);
      const forPaket = paketAda.length > 0 && rnd() < 0.6;
      const s = forPaket ? pick(paketAda) : pick(running);
      const it = forPaket ? pick(COLD) : rnd() < 0.3 ? (rnd() < 0.5 ? pick(COLD) : pick(BAR_ITEMS)) : pick(ALL_ITEMS);
      const row = st.stock.find((r) => r.itemId === it.id);
      const qty = row && row.qty !== null && rnd() < 0.3 ? row.qty + 2 : 1 + Math.floor(rnd() * 3); // kadang sengaja melebihi stok
      dispatch({
        t: "addFnb", sessionId: s.id, name: it.name, station: it.station,
        line: { key: `k-${sim}-${step}`, itemId: it.id, qty },
      }, step);
    } else if (w < 49) {
      // Tamu memesan dari HP: scan QR di meja, atau takeaway
      const mode = rnd() < 0.65 ? "meja" : "takeaway";
      const tableId = mode === "meja" ? (rnd() < 0.8 && running.length ? pick(running).tableId : pick(TABLES).id) : undefined;
      // Takeaway sekarang boleh "bayar di kasir" (pesan makanan saja, bayar saat diambil).
      const pay = rnd() < 0.5 ? "online" : "kasir";
      const lines = randomLines("g", step, 1 + Math.floor(rnd() * 3));
      const sess = running.find((x) => x.tableId === tableId);
      const fresh = priceLines(st, lines, sess?.freeDrinks ?? 0).total;
      const paidOnline = pay === "online" ? (rnd() < 0.1 ? fresh + 1_000 : fresh) : 0;
      // HP tamu menyebut tab-nya; kadang tab itu sudah ditutup dan meja dipakai rombongan lain.
      const done = st.sessions.filter((x) => x.tableId === tableId && x.status === "done");
      const stale = mode === "meja" && done.length > 0 && rnd() < 0.12;
      const sessionId = mode === "meja" ? (stale ? pick(done).id : sess?.id) : undefined;
      const accepted = dispatch({
        t: "guestOrder",
        order: { id: `g-${sim}-${step}`, code: `SPL-G${sim}X${step}`, guest: `HP${step}`, mode, tableId, pay, lines, paidOnline, sessionId },
      }, step);
      if (stale) { const c = (coverage["(skenario) pesanan ke tab yang sudah ditutup"] ??= { ok: 0, ditolak: 0 }); accepted ? c.ok++ : c.ditolak++; }
    } else if (w < 58 && (running.length || booked.length)) {
      // Tab panjang sengaja dibiarkan hidup melewati dua pergantian hari (uji tutup buku),
      // jadi jangan ditutup/di-void oleh aksi acak.
      const bisaTutup = running.filter((x) => x.id !== longTab);
      const s = rnd() < 0.85 && bisaTutup.length ? pick(bisaTutup)
        : pick([...bisaTutup, ...booked].length ? [...bisaTutup, ...booked] : running);
      const tamper = rnd() < (kind === "adversarial" ? 0.4 : 0.1);
      // Angka yang akan dikirim layar saat ini
      const bill = billiardTotalOf(s, st.rates, now).amount;
      const fnb = fnbTotalOf(s);
      const disc = bestPromo(st.promos, bill, fnb, now)?.discount ?? 0;
      const due = Math.max(0, bill + fnb - disc - s.paidOnline);
      dispatch({
        t: "settle", id: s.id, channel: pick(["cash", "cash", "edc", "qris_online"] as const),
        promoCode: rnd() < 0.2 ? "COMBO50" : undefined,
        amount: tamper ? Math.round(due * 0.4) : due,
        billiard: tamper ? Math.round(bill * 0.4) : bill, fnb, discount: disc,
      }, step, { tamper });
    } else if (w < 63 && (st.sessions.length || st.orders.length)) {
      const takeaways = st.orders.filter((o) => o.status === "diterima" && !o.sessionId);
      if (takeaways.length && rnd() < 0.3) {
        dispatch({ t: "requestVoid", req: { targetKind: "pesanan", targetId: pick(takeaways).id, label: "pesanan", amount: 1, reason: "Barang habis" } }, step);
      } else {
        const pool = st.sessions.filter((x) => x.status !== "maintenance" && x.id !== longTab);
        // Kasir salah input minuman gratis Paket Siang — jatahnya harus kembali.
        const withFree = running.filter((x) => x.fnb.some((l) => l.unitPrice === 0 && !l.prepaid));
        const target = withFree.length && rnd() < 0.5 ? pick(withFree) : pool.length ? pick(pool) : null;
        if (target) {
          const free = target.fnb.filter((l) => l.unitPrice === 0 && !l.prepaid);
          const line = free.length ? pick(free) : target.fnb.length && rnd() < 0.5 ? pick(target.fnb) : null;
          dispatch({
            t: "requestVoid",
            req: line
              ? { targetKind: "item", targetId: `${target.id}|${line.key}`, label: "item", amount: 1, reason: "Salah input" }
              : { targetKind: "sesi", targetId: target.id, label: "sesi", amount: 1, reason: "Tamu batal" },
          }, step);
        }
      }
    } else if (w < 67) {
      const waiting = st.voids.filter((v) => v.status === "menunggu");
      if (waiting.length) dispatch({ t: "decideVoid", id: pick(waiting).id, approve: rnd() < 0.7 }, step);
    } else if (w < 70 && running.length) {
      dispatch({ t: "extend", id: pick(running).id, minutes: 60 }, step);
    } else if (w < 73 && (booked.length || running.length)) {
      const s = pick([...booked, ...running]);
      const sekelas = TABLES.filter((t) => classOf(st, t.id) === sessType(s) && t.id !== s.tableId);
      if (sekelas.length) dispatch({ t: "relocate", id: s.id, toTableId: pick(sekelas).id }, step);
    } else if (w < 76) {
      const open = st.tickets.filter((t) => t.status !== "served");
      if (open.length) {
        const t = pick(open);
        const next = { new: "preparing", preparing: "ready", ready: "served" } as const;
        dispatch({ t: "ticket", id: t.id, status: rnd() < 0.5 ? "served" : next[t.status as keyof typeof next] }, step);
      }
    } else if (w < 79) {
      const it = pick(ALL_ITEMS);
      dispatch({ t: "toggleSoldOut", itemId: it.id, name: it.name }, step);
    } else if (w < 82) {
      const row = pick(st.stock);
      if (rnd() < 0.5) dispatch({ t: "addStock", itemId: row.itemId, delta: pick([-3, 6, 12, 24]) }, step);
      else dispatch({ t: "setStock", itemId: row.itemId, qty: pick([0, 5, 30]) }, step);
    } else if (w < 84) {
      dispatch({ t: "setRate", key: pick(["regularDay", "regularNight", "vip", "vvip"] as const), value: pick([25_000, 35_000, 45_000, 55_000]) }, step);
    } else if (w < 87) {
      const it = rnd() < 0.5 ? pick(COLD) : pick(ALL_ITEMS);
      dispatch({ t: "setMenuPrice", itemId: it.id, price: Math.round(it.price * pick([0.8, 1, 1.25]) / 500) * 500 || 500 }, step);
    } else if (w < 89) {
      const p = pick(st.promos);
      if (p) dispatch({ t: "savePromo", promo: { ...p, active: !p.active } }, step);
    } else if (w < 91) {
      dispatch({ t: "toggleMaintenance", tableId: pick(TABLES).id, reason: "Uji" }, step);
    } else if (w < 94) {
      if (rnd() < 0.5) dispatch({ t: "toggleLight", tableId: pick(TABLES).id }, step);
      else dispatch({ t: "allLights", on: rnd() < 0.5 }, step);
    } else if (st.shift && (kind === "ganti-shift" || rnd() < 0.3)) {
      // Tutup shift: kasir jujur menghitung uang sesuai kenyataan
      const cash = settleLog.filter((x) => x.shiftId === st.shift!.id && x.channel === "cash").reduce((n, x) => n + x.amount, 0);
      const uiExpected = st.shift.openingCash + (recap(st).byChannel.cash?.gross ?? 0); // cara layar lama menghitung
      dispatch({ t: "closeShift", countedCash: st.shift.openingCash + cash, expected: uiExpected }, step);
      // Kadang karyawan lupa buka shift lalu langsung melayani
      if (rnd() < 0.5 && running.length) {
        const s = pick(running);
        dispatch({ t: "addFnb", sessionId: s.id, name: "x", station: "kitchen", line: { key: `ns-${sim}-${step}`, itemId: "lb-02", qty: 1 } }, step);
      }
    }

    // ── Koreksi kasir & split bill (permintaan pemilik: item 2, 4, 5, 7) ──
    const jalan = st.sessions.filter((s) => s.status === "running");
    if (jalan.length && rnd() < 0.3) {
      const s = pick(jalan);
      const bisa = s.fnb.filter((l) => !l.prepaid && l.unitPrice !== 0 && !paidKeys(s).has(l.key) && !l.orderId);
      const r = rnd();
      if (r < 0.3 && bisa.length) {
        // Salah jumlah / salah item — termasuk baris yang sudah diserahkan (harus ditolak).
        const l = pick(s.fnb.length && rnd() < 0.2 ? s.fnb : bisa);
        if (rnd() < 0.6) dispatch({ t: "editFnb", sessionId: s.id, key: l.key, qty: pick([1, 2, 5, 0]) }, step);
        else dispatch({ t: "editFnb", sessionId: s.id, key: l.key, itemId: pick(ALL_ITEMS).id }, step);
      } else if (r < 0.5 && bisa.length && jalan.length > 1) {
        // Salah nomor meja: pindahkan barisnya ke meja lain yang sedang jalan.
        const to = pick(jalan.filter((x) => x.id !== s.id));
        const keys = rnd() < 0.25 ? s.fnb.slice(0, 2).map((l) => l.key) : [pick(bisa).key];
        dispatch({ t: "moveFnb", fromId: s.id, toId: to.id, keys }, step);
      } else if (r < 0.85) {
        // Bayar per orang: lewat baris pesanan, atau nominal (kadang melebihi sisa tagihan).
        const sisa = settlementOf(s, st, now).due;
        if (rnd() < 0.45 && bisa.length) {
          dispatch({
            t: "paySplit", id: s.id, channel: pick(["cash", "edc"] as const), keys: [pick(bisa).key],
            label: `Orang ${(step % 4) + 1}`,
            // Layar kadang ikut mengirim nominal — mesin HARUS menghitung ulang dari barisnya.
            ...(rnd() < 0.3 ? { amount: 1_000 } : {}),
          }, step);
        } else {
          const nominal = rnd() < 0.15 ? sisa + 50_000 : Math.max(500, Math.round(sisa / 2 / 500) * 500);
          dispatch({ t: "paySplit", id: s.id, channel: pick(["cash", "cash", "qris_online"] as const), amount: nominal }, step);
        }
      } else {
        // Komputer sempat mati: superadmin menghentikan meteran pada jam sebenarnya.
        login(pick(superadmin), step);
        dispatch({ t: "stopMeter", id: s.id, at: now - pick([0, 10, 45, 999]) * 60_000 }, step);
      }
    }

    // Tamu memesan meja Smokehouse Resto lewat aplikasi (tanpa bayar di muka).
    if (rnd() < 0.1) {
      const h = 11 + Math.floor(rnd() * 13);
      let startsAt = slotStart(businessDateOf(now), h);
      if (startsAt <= now + 30 * 60_000) startsAt += 24 * 3_600_000;
      dispatch({
        t: "reserveResto",
        res: {
          id: `rr-${sim}-${step}`, code: `SPL-R${sim}X${step}`, guest: `Resto${step}`,
          phone: `0812${3000000 + sim * 100 + step}`,
          pax: 1 + Math.floor(rnd() * 9), startsAt, hours: 1 + Math.floor(rnd() * 2),
          ...(rnd() < 0.3 ? { tableId: pick(RESTO).id } : {}),
        },
      }, step);
    }

    // Pemilik mengelola akun staf & kelas meja (VIP ↔ VVIP).
    if (rnd() < 0.05) {
      login(pick(superadmin), step);
      const r = rnd();
      if (r < 0.45) {
        // Sebagian akun ditautkan email (masuk tanpa PIN); kadang emailnya sengaja
        // kembar atau ngawur — mesin harus menolaknya.
        const mail = rnd() < 0.5
          ? (rnd() < 0.2 ? "bukan-email" : rnd() < 0.3 ? `sama${sim}@spl.id` : `staf${step}.${sim}@spl.id`)
          : undefined;
        dispatch({ t: "saveEmployee", emp: { id: "", name: `Staf ${step}`, pin: String(4000 + ((sim * 13 + step) % 5000)), role: rnd() < 0.4 ? "superadmin" : "karyawan", active: true, ...(mail ? { email: mail } : {}) } }, step);
      } else if (r < 0.6) {
        dispatch({ t: "saveEmployee", emp: { id: "", name: "PIN kembar", pin: EMPLOYEES[0].pin, role: "karyawan", active: true } }, step);
      } else if (r < 0.75) {
        const target = pick(st.employees);
        dispatch({ t: "saveEmployee", emp: { ...target, active: false } }, step);
      } else if (r < 0.85) {
        dispatch({ t: "removeEmployee", id: pick(st.employees).id }, step);
      } else {
        const t = pick(BILLIARD);
        dispatch({ t: "setTableClass", tableId: t.id, type: pick(["regular", "vip", "vvip", "resto"] as const) }, step);
      }
    }

    // Takeaway "bayar di kasir" diambil tamunya — kasir menandai lunas.
    const takeawayBelum = st.orders.filter((o) => o.status === "diterima" && !o.sessionId && !o.payment && o.paidOnline === 0);
    if (takeawayBelum.length && rnd() < 0.5) {
      const o = pick(takeawayBelum);
      dispatch({ t: "settleOrder", id: o.id, channel: pick(["cash", "cash", "edc", "qris_online"] as const) }, step);
      // Kadang kasir menekan dua kali — pembayaran kedua harus diabaikan.
      if (rnd() < 0.2) dispatch({ t: "settleOrder", id: o.id, channel: "cash" }, step);
    }

    // Tamu yang sudah dilepas ternyata datang: kasir memulihkan booking-nya.
    const lepas = st.sessions.filter((x) => x.status === "noshow" && now < x.endsAt);
    if (lepas.length && rnd() < 0.3) {
      const s = pick(lepas);
      // Kadang menu pra-order-nya sudah habis dibeli orang lain — wajib dikembalikan dananya.
      const pre = (s.noShowFnb ?? []).filter((l) => !st.soldOut.includes(l.itemId));
      if (pre.length && rnd() < 0.35) {
        const it = findItem(pick(pre).itemId)!;
        dispatch({ t: "toggleSoldOut", itemId: it.id, name: it.name }, step);
      }
      dispatch({ t: "restoreNoShow", id: s.id }, step);
    }

    // Sesekali jejak bersama menerima kejadian rusak.
    if (rnd() < 0.04) {
      const sid = running.length ? pick(running).id : "tidak-ada";
      const bad: unknown[] = [
        { t: "addFnb", sessionId: sid },
        { t: "addFnb", sessionId: sid, station: "kitchen", line: { key: 7, itemId: null, qty: "2" } },
        { t: "guestOrder", order: { id: `g-rusak-${sim}-${step}`, code: "X", mode: "meja", pay: "online", lines: null, paidOnline: 0 } },
        { t: "savePromo", promo: { id: `p-rusak-${step}`, name: "Rusak", kind: "percent", value: 10, scope: "all", daysOfWeek: "semua" } },
        { t: "confirmOnline", session: { id: `o-rusak-${sim}-${step}`, tableId: "T01", startsAt: "besok", fnb: [] } },
        { t: "hold", session: { id: `h-rusak-${sim}-${step}`, tableId: "T01", startsAt: now, endsAt: now + 3_600_000, paidOnline: 0, fnb: [{ key: "k", itemId: "cd-01", qty: Infinity }] } },
        { t: "settle", id: sid, channel: "bitcoin" },
        { t: "setRate", key: "__proto__", value: 1 },
        { t: "requestVoid", req: { targetKind: "semua", targetId: 5 } },
        { t: "hapusSemuaData" },
        { t: "login", emp: superadmin[0] },
        null,
        "settle",
      ];
      malformed(step, pick(bad));
    }

    // Superadmin mencatat dana pelanggan sudah ditransfer balik — kadang menekan dua kali.
    if (st.refunds.length && rnd() < 0.12) {
      const open = st.refunds.filter((r) => !r.settledAt);
      const r = open.length && rnd() < 0.8 ? pick(open) : pick(st.refunds);
      dispatch({ t: "settleRefund", id: r.id, method: pick(["transfer", "tunai", "kredit"] as const) }, step);
    }
  }

  /* ── INV-32: perangkat lain memutar ulang jejak dari nol ─────────── */
  {
    // Jam dinding & urutan ID global sengaja dibuat berbeda: kalau mesin diam-diam
    // memakai Date.now() atau penghitung global, hasilnya akan berbeda.
    setClock(() => Date.now() + 987_654_321);
    for (let i = 0; i < 37; i++) nextId("polusi");
    try {
      const other = replay(genesis, entries);
      if (sig(other) !== sig(st)) fail("INV-32", sim, steps, `berbeda di: ${diffKeys(st, other)}`);
    } catch (err) {
      fail("INV-43", sim, steps, `putar ulang jejak crash: ${String(err).slice(0, 80)}`);
    }
    setClock(() => now);
  }

  /* ── INV-33: kejadian tiba terlambat & tidak berurutan ───────────── */
  {
    const arrival = entries
      .map((e, i) => ({ e, at: i + (rnd() < 0.12 ? 1 + Math.floor(rnd() * 8) : 0) + rnd() * 0.5 }))
      .sort((x, y) => x.at - y.at)
      .map((x) => x.e);
    let known: Entry[] = [];
    try {
      let dev = replay(genesis, []);
      for (const e of arrival) {
        const last = known[known.length - 1];
        if (!last || entryOrder(last, e) < 0) {
          dev = applyEntry(dev, e);                  // tiba berurutan: cukup tambahkan
          known.push(e);
        } else {
          known = [...known, e].sort(entryOrder);    // tiba terlambat: putar ulang
          dev = replay(genesis, known);
          totalReplays++;
        }
      }
      if (sig(dev) !== sig(st)) fail("INV-33", sim, steps, `berbeda di: ${diffKeys(st, dev)}`);
    } catch (err) {
      fail("INV-43", sim, steps, `perangkat lain crash saat memutar jejak: ${String(err).slice(0, 80)}`);
    }
  }
}

/* ── Jalankan ─────────────────────────────────────────────────────── */
const N = Number(process.env.SIMS ?? 100);
const t0 = Date.now();
for (let i = 0; i < N; i++) runSim(i);
const ms = Date.now() - t0;

const totalActions = Object.entries(coverage)
  .filter(([k]) => !k.startsWith("("))
  .reduce((n, [, c]) => n + c.ok + c.ditolak, 0);
console.log(`\n${N} simulasi · ${totalActions} aksi · ${totalReplays} putar-ulang perangkat lain · ${ms} ms\n`);

console.log("CAKUPAN AKSI (diterima / ditolak mesin)");
for (const [k, c] of Object.entries(coverage).sort()) {
  console.log(`  ${k.padEnd(24)} ${String(c.ok).padStart(5)} / ${String(c.ditolak).padStart(5)}`);
}

console.log("\nHASIL INVARIANT");
let bad = 0;
for (const code of Object.keys(INV)) {
  const h = hits[code];
  if (!h) { console.log(`  ✓ ${code}  ${INV[code]}`); continue; }
  bad++;
  console.log(`  ✗ ${code}  ${INV[code]}`);
  console.log(`        ${h.count} pelanggaran di ${h.sims.size} simulasi`);
  console.log(`        contoh: ${h.example}`);
}
const simsFailed = new Set(Object.values(hits).flatMap((h) => [...h.sims])).size;
console.log(`\n${N - simsFailed}/${N} simulasi bersih · ${Object.keys(INV).length - bad}/${Object.keys(INV).length} invariant lolos`);
if (bad > 0) process.exitCode = 1;
