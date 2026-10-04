/* ═══════════════════════════════════════════════════════════════════
   UJI KETAHANAN — operasional berhari-hari lewat jejak kejadian

   Simulasi utama menguji kebenaran aturan dalam 1–2 hari. Berkas ini
   menguji hal yang baru terasa setelah aplikasi dipakai berminggu-minggu:
   apakah setiap aksi makin lambat, berapa lama perangkat memutar ulang
   jejak saat dibuka, dan apakah datanya masih muat di penyimpanan HP.

   npm run test:soak (bawaan 14 hari; DAYS=30 untuk sebulan)
   ═══════════════════════════════════════════════════════════════════ */
import {
  applyEntry, canOpenWalkin, hourIdx, priceLines, recap, replay, setClock, shiftCashExpected, tickState,
  type Entry, type Genesis, type State,
} from "../src/lib/engine";
import { TABLES } from "../src/data/venue";
import { MENU } from "../src/data/menu";
import { businessDateOf, dariWib } from "../src/lib/occupancy";
import type { CartLine } from "../src/lib/store";

const DAYS = Number(process.env.DAYS ?? 14);
const HOUR = 3_600_000, MIN = 60_000;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260915);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const ITEMS = MENU.flatMap((c) => c.items);

// Jam awal dipatok WIB seperti mesinnya, bukan zona mesin penguji.
const first = dariWib(2026, 9, 1, 11);
const genesis: Genesis = { at: first - MIN, seed: false };
let st: State = replay(genesis, []);
const entries: Entry[] = [];
let n = 0;
let t = first;
setClock(() => t);

const OWNER = "u-owner", KASIR_SIANG = "u-rian", KASIR_MALAM = "u-yoga";

let bad = 0;
const failed = new Set<string>();
const fail = (code: string, msg: string) => { bad++; failed.add(code); if (bad <= 10) console.log(`FAIL  ${code} ${msg}`); };
const moneyOf = (r: ReturnType<typeof recap>) =>
  JSON.stringify([r.billiard, r.fnb, r.discount, r.gross, r.diterima, r.prabayar, r.byChannel, r.dpp, r.tax, r.mdr, r.net, r.done.length, r.noShow, r.takeaway.length]);

const push = (by: string | null, act: Entry["act"]) => {
  const e: Entry = { id: `soak:${String(++n).padStart(7, "0")}`, at: t, by, act };
  // Kejadian pertama di hari operasional baru memicu tutup buku: angka setiap hari yang
  // diarsipkan harus identik dengan rekapnya sesaat sebelum diarsipkan (sesudah no-show yang
  // jatuh tempo dilepas — keduanya terjadi pada detak yang sama).
  const today = businessDateOf(t);
  const releasedOnly = today > st.day ? tickState({ ...st, day: today }, t) : null;
  if (releasedOnly) {
    // Uang shift yang masih buka tidak boleh ikut berpindah ke arsip (kas laci jadi salah hitung).
    const archived = tickState(st, t);
    if (shiftCashExpected(archived) !== shiftCashExpected(releasedOnly)) {
      fail("INV-S5", `kas shift berubah saat tutup buku ${today} (${shiftCashExpected(releasedOnly)} → ${shiftCashExpected(archived)})`);
    }
  }
  st = applyEntry(st, e);
  entries.push(e);
  if (releasedOnly) {
    for (const h of st.history) {
      const prev = releasedOnly.history.find((x) => x.bizDate === h.bizDate);
      if (prev && JSON.stringify(prev) === JSON.stringify(h)) continue;
      if (moneyOf(recap(releasedOnly, h.bizDate)) !== moneyOf(recap(st, h.bizDate))) fail("INV-S2", `rekap ${h.bizDate} berubah saat tutup buku`);
    }
  }
};

const plannedEnd = new Map<string, number>();       // walk-in → kapan tamu minta tutup tab
const rows: string[] = [];
const kb = (x: unknown) => Math.round(JSON.stringify(x).length / 1024);
let walkN = 0, onlineN = 0, fnbN = 0;

// Kejadian nyata yang menguji pengaman tutup buku:
// - hari ke-5 s/d ke-7: kasir lupa menutup shift, laci terus berjalan tiga hari;
// - hari ke-9 tutup lebih awal 23.30 (ada booking 01.00 yang tidak datang), lalu venue libur 2 hari.
const lupaTutupShift = (d: number) => d >= 4 && d <= 6;
const tutupAwal = 8;
const libur = (d: number) => DAYS >= 12 && (d === 9 || d === 10);

for (let d = 0; d < DAYS; d++) {
  if (libur(d)) continue;
  const dayStart = first + d * 24 * HOUR;            // 11.00
  const dayEnd = dayStart + 15 * HOUR;               // 02.00
  const bizDate = businessDateOf(dayStart);
  const beforeN = entries.length;
  const t0 = performance.now();
  const stopAt = d === tutupAwal && DAYS >= 12 ? dayStart + 12.5 * HOUR : dayEnd - 12 * MIN;

  t = dayStart;
  push(KASIR_SIANG, { t: "openShift", openingCash: 300_000 });
  for (const r of st.stock) if (r.qty !== null) push(OWNER, { t: "setStock", itemId: r.itemId, qty: 60 });
  let shiftSwapped = false;

  while (t < stopAt) {
    t += (1 + Math.floor(rnd() * 3)) * MIN;
    const kasir = shiftSwapped ? KASIR_MALAM : KASIR_SIANG;
    if (!shiftSwapped && !lupaTutupShift(d) && t >= dayStart + 8 * HOUR) {
      push(KASIR_SIANG, { t: "closeShift", countedCash: 0 });
      push(KASIR_MALAM, { t: "openShift", openingCash: 300_000 });
      shiftSwapped = true;
    }

    // Tamu walk-in yang minta tutup tab & booking online yang jamnya habis.
    for (const s of st.sessions) {
      if (s.status !== "running") continue;
      const due = s.source === "walkin" ? plannedEnd.get(s.id) ?? Infinity : s.endsAt;
      if (due <= t) push(kasir, { t: "settle", id: s.id, channel: pick(["cash", "edc", "qris_online"] as const) });
    }
    // Tamu booking datang (15% tidak datang → dilepas otomatis oleh detak).
    for (const s of st.sessions) {
      if (s.status === "booked" && s.startsAt - 30 * MIN <= t && t < s.startsAt + 10 * MIN && rnd() < 0.25) {
        if (rnd() < 0.85) push(kasir, { t: "checkin", code: s.checkin! });
      }
    }
    // Dapur memproses tiket.
    for (const k of st.tickets) {
      const age = t - k.at;
      if (k.status === "new" && age > 4 * MIN) push(kasir, { t: "ticket", id: k.id, status: "preparing" });
      else if (k.status === "preparing" && age > 12 * MIN) push(kasir, { t: "ticket", id: k.id, status: "ready" });
      else if (k.status === "ready" && age > 15 * MIN) push(kasir, { t: "ticket", id: k.id, status: "served" });
    }

    const r = rnd();
    const running = st.sessions.filter((s) => s.status === "running");
    if (r < 0.22) {
      const table = pick(TABLES);
      if (canOpenWalkin(st.sessions, table.id, t)) {
        const before = st.sessions.length;
        push(kasir, { t: "walkin", tableId: table.id, guest: `W${walkN++}` });
        const s = st.sessions[st.sessions.length - 1];
        if (st.sessions.length > before) plannedEnd.set(s.id, t + (30 + Math.floor(rnd() * 150)) * MIN);
      }
    } else if (r < 0.34) {
      // Booking online lewat hold QRIS untuk nanti malam atau besok.
      const table = pick(TABLES);
      const later = rnd() < 0.5 ? 0 : 24 * HOUR;
      const startsAt = new Date(t + later + (70 + Math.floor(rnd() * 240)) * MIN).setMinutes(0, 0, 0);
      const hours = 1 + Math.floor(rnd() * 3);
      if (hourIdx(startsAt) >= 11 && hourIdx(startsAt) + hours <= 26) {
        const code = `SPL-K${onlineN++}`;
        const lines: CartLine[] = rnd() < 0.3 ? [{ key: `pre-${code}`, itemId: pick(ITEMS).id, qty: 1 }] : [];
        const sent = {
          id: `o-${code}`, tableId: table.id, source: "online" as const, guest: `O${onlineN}`, phone: "0812000000",
          startsAt, endsAt: startsAt + hours * HOUR, status: "hold" as const, bookingCode: code,
          fnb: lines, tableAmount: 0, paidOnline: 0,
        };
        push(null, { t: "hold", session: sent });
        const h = st.sessions.find((x) => x.id === sent.id);
        if (h) {
          const paid = h.tableAmount + (h.holdLines ?? []).reduce((m, l) => m + (l.unitPrice ?? 0) * l.qty, 0);
          push(null, { t: "confirmOnline", session: { ...sent, status: "booked", checkin: `C${onlineN}`, paidOnline: paid } });
        }
      }
    } else if (r < 0.62 && running.length) {
      const s = pick(running);
      const it = pick(ITEMS.filter((i) => !st.soldOut.includes(i.id)));
      push(kasir, { t: "addFnb", sessionId: s.id, name: it.name, station: it.station, line: { key: `f${fnbN++}`, itemId: it.id, qty: 1 + Math.floor(rnd() * 2) } });
    } else if (r < 0.67 && running.length) {
      const s = pick(running);
      const lines: CartLine[] = [{ key: `q${fnbN++}`, itemId: pick(ITEMS.filter((i) => !st.soldOut.includes(i.id))).id, qty: 1 }];
      const pay = rnd() < 0.5 ? "online" as const : "kasir" as const;
      const paidOnline = pay === "online" ? priceLines(st, lines, s.freeDrinks ?? 0).total : 0;
      push(null, { t: "guestOrder", order: { id: `g-${fnbN}`, code: `SPL-G${fnbN}`, guest: "HP", mode: "meja", tableId: s.tableId, sessionId: s.id, pay, lines, paidOnline } });
    } else if (r < 0.69) {
      const lines: CartLine[] = [{ key: `tk${fnbN++}`, itemId: pick(ITEMS.filter((i) => !st.soldOut.includes(i.id))).id, qty: 1 }];
      push(null, { t: "guestOrder", order: { id: `g-${fnbN}`, code: `SPL-T${fnbN}`, guest: "TA", mode: "takeaway", pay: "online", lines, paidOnline: priceLines(st, lines).total } });
    } else if (r < 0.695 && running.length) {
      const s = pick(running);
      const l = s.fnb.find((x) => !x.prepaid);
      if (l) push(OWNER, { t: "requestVoid", req: { targetKind: "item", targetId: `${s.id}|${l.key}`, label: "", amount: 0, reason: "Salah input" } });
    }

    // Satu meja fisik tidak pernah dipakai dua rombongan.
    if (Math.floor(t / MIN) % 30 === 0) {
      const seen = new Set<string>();
      for (const s of st.sessions) if (s.status === "running") {
        if (seen.has(s.tableId)) fail("INV-S4", `hari ${d + 1}: ${s.tableId} dipakai dua sesi`);
        seen.add(s.tableId);
      }
    }
  }

  if (d === tutupAwal && DAYS >= 12) {
    // Tutup lebih awal sebelum libur: semua tab & shift ditutup, lalu masuk booking 01.00–02.00
    // yang tamunya tidak pernah datang. Kejadian berikutnya baru ada 2 hari kemudian.
    t = stopAt + 5 * MIN;
    for (const s of st.sessions.filter((x) => x.status === "running")) push(KASIR_MALAM, { t: "settle", id: s.id, channel: "cash" });
    push(st.shift?.employeeId ?? KASIR_MALAM, { t: "closeShift", countedCash: 0 });
    const table = TABLES.find((x) => x.type === "regular" && canOpenWalkin(st.sessions, x.id, t))!;
    const startsAt = dayStart + 14 * HOUR;             // 01.00 dini hari
    const sent = {
      id: "o-SPL-LIBUR", tableId: table.id, source: "online" as const, guest: "Tidak datang", phone: "0812000000",
      startsAt, endsAt: startsAt + HOUR, status: "hold" as const, bookingCode: "SPL-LIBUR", fnb: [], tableAmount: 0, paidOnline: 0,
    };
    push(null, { t: "hold", session: sent });
    const h = st.sessions.find((x) => x.id === sent.id);
    if (h) push(null, { t: "confirmOnline", session: { ...sent, status: "booked", checkin: "LIBUR1", paidOnline: h.tableAmount } });
    if (!st.sessions.some((x) => x.id === sent.id && x.status === "booked")) fail("INV-S4", "skenario libur: booking 01.00 gagal dibuat");
  } else {
    // Tutup hari: semua tab ditutup, shift malam ditutup lewat 02.00 (kecuali saat kasir lupa).
    t = dayEnd - 5 * MIN;
    for (const s of st.sessions.filter((x) => x.status === "running")) push(KASIR_MALAM, { t: "settle", id: s.id, channel: "cash" });
    t = dayEnd + 10 * MIN;
    if (!lupaTutupShift(d)) push(st.shift?.employeeId ?? KASIR_MALAM, { t: "closeShift", countedCash: 0 });
  }

  const ms = performance.now() - t0;
  const dayEntries = entries.length - beforeN;
  const rc = recap(st, bizDate);
  if (rc.gross !== rc.diterima + rc.prabayar) fail("INV-S4", `hari ${d + 1}: rekap tidak seimbang`);
  if (st.stock.some((x) => x.qty !== null && x.qty < 0)) fail("INV-S4", `hari ${d + 1}: stok minus`);
  // Tutup buku menjaga state aktif tetap kecil: hanya hari ini & kemarin yang ikut dipindai.
  if (d >= 3 && st.sessions.length > 400) fail("INV-S1", `hari ${d + 1}: ${st.sessions.length} sesi masih aktif (tutup buku tidak berjalan)`);
  for (const h of st.history) {
    if (st.sessions.some((x) => (x.status === "done" || x.status === "noshow") && businessDateOf(x.startsAt) === h.bizDate)) {
      fail("INV-S2", `hari ${h.bizDate} diarsipkan sebagian`);
    }
  }
  if (d === 0 || (d + 1) % 5 === 0 || d === DAYS - 1) {
    rows.push(
      `  hari ${String(d + 1).padStart(2)}  ${String(dayEntries).padStart(5)} kejadian  ` +
      `${(ms / dayEntries * 1000).toFixed(0).padStart(6)} µs/kejadian  ` +
      `sesi tersimpan ${String(st.sessions.length).padStart(5)}  state ${String(kb(st)).padStart(6)} KB  ` +
      `jejak ${String(kb(entries)).padStart(7)} KB  omzet Rp ${rc.gross.toLocaleString("id-ID")}`,
    );
  }
}

console.log(`\nUJI KETAHANAN ${DAYS} HARI · ${entries.length.toLocaleString("id-ID")} kejadian\n`);
for (const r of rows) console.log(r);

// Perangkat yang baru dibuka memutar ulang seluruh jejak.
const r0 = performance.now();
const again = replay(genesis, entries);
const replayMs = performance.now() - r0;
const same = JSON.stringify({ ...again, me: null }) === JSON.stringify({ ...st, me: null });
console.log(`\n  Putar ulang seluruh jejak saat aplikasi dibuka: ${(replayMs / 1000).toFixed(2)} dtk (komputer ini)`);
console.log(`  Hasil putar ulang identik: ${same ? "ya" : "TIDAK"}`);
console.log(`  Ukuran jejak ${Math.round(JSON.stringify(entries).length / 1024 / 1024 * 10) / 10} MB · batas localStorage umum ±5 MB`);
console.log(`  Hari yang sudah tutup buku: ${st.history.length}`);
if (!same) fail("INV-S3", "putar ulang berbeda dari state berjalan");
// Dua hari libur tidak punya transaksi, dan hari ini/kemarin belum boleh diarsipkan.
if (DAYS >= 5 && st.history.length < DAYS - 5) fail("INV-S1", `hanya ${st.history.length} hari yang tutup buku dari ${DAYS} hari`);

const LABEL: Record<string, string> = {
  "INV-S1": "Tutup buku harian menjaga state aktif tetap kecil",
  "INV-S2": "Angka rekap setiap hari identik sebelum & sesudah diarsipkan",
  "INV-S3": "Putar ulang jejak berminggu-minggu menghasilkan state identik",
  "INV-S4": "Tidak ada meja dipakai dua sesi, stok minus, atau rekap tidak seimbang",
  "INV-S5": "Kas shift yang masih buka tidak berubah saat tutup buku (kasir lupa tutup shift berhari-hari)",
};
console.log("");
for (const [code, label] of Object.entries(LABEL)) console.log(`  ${failed.has(code) ? "✗" : "✓"} ${code}  ${label}`);
console.log(bad === 0 ? "\nKEBENARAN: tidak ada pelanggaran" : `\n${bad} PELANGGARAN`);
if (bad > 0) process.exitCode = 1;
