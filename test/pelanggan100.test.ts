/* ═══════════════════════════════════════════════════════════════════
   SIMULASI 100 PELANGGAN DALAM SATU HARI OPERASIONAL

   Permintaan pemilik 7 Nov 2026: "jika ada 100 customer yang melakukan
   transaksi dan trial di aplikasi ini". Seratus pelanggan dengan perilaku
   berbeda berjalan lewat mesin yang sama dengan aplikasi, sebagai kejadian di
   jejak bersama, persis seperti di server:

     • booking meja biliar dari HP (tahan slot → QRIS → webhook → check-in),
       termasuk yang batal, telat bayar, tidak datang, berebut slot, dan
       notifikasi pembayaran ganda;
     • makan di Smokehouse: waiter membuka meja, tamu pesan dari HP, bayar di
       kasir atau QRIS di muka;
     • takeaway Smokehouse dari HP, bayar di kasir atau QRIS;
     • walk-in biliar lewat kasir SPL;
     • menu habis di tengah malam.

   Lalu semuanya diaudit: tidak ada meja dobel, setiap rupiah yang masuk
   punya tujuan (booking jadi atau pengembalian dana), rekap SPL + Smokehouse
   = rekap gabungan, kas laci per tempat cocok, dan HP tamu tidak pernah
   salah memvonis "slot diambil orang lain" (laporan 7 Nov 2026).

   npm run test:pelanggan · SEED=angka untuk hari yang lain
   ═══════════════════════════════════════════════════════════════════ */
import {
  applyAction, applyEntry, itemOf, priceLines, recap, replay, setClock, shiftCashExpected, tickState, entryOrder,
  jadwalUlangProblem, classOf,
  type Action, type Entry, type Genesis, type State,
} from "../src/lib/engine";
import { publicVenue, sesiDariSlot } from "../src/lib/publicView";
import { buangCerminanHold } from "../src/lib/customerStore";
import { MENU } from "../src/data/menu";
import { businessDateOf, dariWib } from "../src/lib/occupancy";
import type { LiveSession } from "../src/data/live";
import type { CartLine } from "../src/lib/store";

/* ── Acak yang bisa diulang ───────────────────────────────────────── */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.env.SEED ?? 20261110);
const rnd = mulberry32(SEED);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const antara = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

const MIN = 60_000, HOUR = 3_600_000;
const jam = (h: number, m = 0) => dariWib(2026, 11, h >= 24 ? 11 : 10, h % 24, m);
const HARI = businessDateOf(jam(12));

/* ── Pemeriksa ────────────────────────────────────────────────────── */
let bad = 0, total = 0;
const temuan: string[] = [];
const cek = (label: string, ok: boolean, detail = "") => {
  total++; if (!ok) { bad++; temuan.push(`${label}${detail ? ` — ${detail}` : ""}`); }
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  ${detail}`));
};

/* ── Dunia: jejak kejadian, diputar maju satu per satu ────────────── */
const genesis: Genesis = { at: jam(10), seed: false };
let st: State = replay(genesis, []);
const entries: Entry[] = [];
let n = 0;
let kini = jam(10);
setClock(() => kini);

/** Jadwal kejadian: [waktu, siapa, aksi-yang-dihitung-saat-itu, catatan]. */
type Rencana = { at: number; by: string | null; buat: () => Action | null; tag?: string };
const antre: Rencana[] = [];
const jadwal = (at: number, by: string | null, buat: () => Action | null, tag?: string) => antre.push({ at, by, buat, tag });

const KASIR_SPL = "u-rian", KASIR_SMH = "u-dewi", PEMILIK = "u-owner";
const ITEM_DAPUR = MENU.flatMap((c) => c.items).filter((i) => i.station === "kitchen" && i.price >= 15_000);
const ITEM_BAR = MENU.flatMap((c) => c.items).filter((i) => i.station === "bar");
const MEJA_BILIAR = Array.from({ length: 40 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`);
const MEJA_RESTO = Array.from({ length: 12 }, (_, i) => `S1${String(i + 1).padStart(2, "0")}`);

const baris = (itemId: string, qty: number, key: string): CartLine => ({ key, itemId, qty } as CartLine);
const keranjang = (k: string, banyak = antara(1, 3)): CartLine[] =>
  Array.from({ length: banyak }, (_, i) => baris(pick(i % 2 ? ITEM_BAR : ITEM_DAPUR).id, antara(1, 2), `${k}-${i}`))
    .filter((l, i, a) => a.findIndex((x) => x.itemId === l.itemId) === i);

/* ── Catatan per pelanggan, untuk audit ───────────────────────────── */
type Jenis = "booking" | "rebut" | "dinein" | "takeaway" | "walkin";
type Pelanggan = {
  no: number; jenis: Jenis; nama: string; hasil: string;
  dibayarOnline: number; kode?: string; refId?: string;
};
const pelanggan: Pelanggan[] = [];
const uangMasukOnline: { kode: string; amount: number; ref: string }[] = [];
const vonisHp = { baru: 0, lama: 0, dicek: 0, skewMaks: 0 };
/** Tamu yang berhalangan dan memakai jadwal ulang gratis (8 Nov 2026). */
const jadwalUlangan = { coba: 0, berhasil: 0, bayarSelisih: 0 };

/* ── 1. Kasir membuka shift masing-masing tempat ──────────────────── */
jadwal(jam(10, 50), KASIR_SPL, () => ({ t: "openShift", openingCash: 300_000, venue: "spl" }));
jadwal(jam(10, 52), KASIR_SMH, () => ({ t: "openShift", openingCash: 200_000, venue: "smh" }));

/* ── 2. Membuat 100 pelanggan ─────────────────────────────────────── */
const komposisi: Jenis[] = [
  ...Array(34).fill("booking"), ...Array(6).fill("rebut"), ...Array(22).fill("dinein"),
  ...Array(18).fill("takeaway"), ...Array(20).fill("walkin"),
];
const slotDipakai: { tableId: string; startsAt: number; no: number }[] = [];

komposisi.forEach((jenis, i) => {
  const no = i + 1;
  const p: Pelanggan = { no, jenis, nama: `Pelanggan ${no}`, hasil: "?", dibayarOnline: 0 };
  pelanggan.push(p);

  if (jenis === "booking" || jenis === "rebut") {
    // Booking: pilih meja & jam hari ini, bayar dari HP beberapa jam sebelumnya.
    let tableId: string, startsAt: number;
    if (jenis === "rebut" && slotDipakai.length) {
      const sasaran = pick(slotDipakai);               // berebut slot yang sama persis
      tableId = sasaran.tableId; startsAt = sasaran.startsAt;
    } else {
      tableId = pick(MEJA_BILIAR); startsAt = jam(antara(14, 23));
      slotDipakai.push({ tableId, startsAt, no });
    }
    const hours = antara(1, 3);
    const kode = `SPL-B${String(no).padStart(3, "0")}`;
    const refId = `o-${kode}`;
    const checkin = String(100000 + no);
    p.kode = kode; p.refId = refId;
    const pesanTahan = jenis === "rebut" ? jam(11, 30) + antara(0, 60) * MIN : jam(11) + antara(0, 150) * MIN;
    const payload: LiveSession = {
      id: refId, tableId, source: "online", guest: p.nama, phone: `62812000${String(no).padStart(4, "0")}`,
      startsAt, endsAt: startsAt + hours * HOUR, status: "hold", bookingCode: kode,
      fnb: rnd() < 0.3 ? keranjang(kode, 1) : [], tableAmount: 0, paidOnline: 0,
    } as LiveSession;
    const nasib = rnd();
    // 78% bayar tepat waktu · 8% batal · 6% telat bayar (hold sudah lewat) · 8% dibiarkan kedaluwarsa
    const perilaku = nasib < 0.78 ? "bayar" : nasib < 0.86 ? "batal" : nasib < 0.92 ? "telat" : "diam";
    const datang = rnd() < 0.85;
    const ganda = rnd() < 0.1;                         // gateway mengirim notifikasi dua kali
    const skew = antara(-4, 4) * MIN;                  // jam HP tamu meleset

    jadwal(pesanTahan, null, () => ({ t: "hold", session: payload }), `hold:${no}:${skew}`);
    const bayarPada = perilaku === "telat" ? pesanTahan + 25 * MIN : pesanTahan + antara(2, 9) * MIN;
    if (perilaku === "bayar" || perilaku === "telat") {
      const konfirmasi = () => {
        const h = st.sessions.find((x) => x.id === refId);
        // Nominal yang dibekukan saat QR dibuat (dicatat waktu hold diterima).
        const amount = tagihanTahan.get(refId) ?? 0;
        if (!amount) return null;                      // tidak pernah dapat QR → tidak bisa bayar
        void h;
        return { t: "confirmOnline", session: { ...payload, status: "booked", checkin, paidOnline: amount } } as Action;
      };
      jadwal(bayarPada, null, konfirmasi, `bayar:${no}`);
      if (ganda) jadwal(bayarPada + 20_000, null, konfirmasi, `ganda:${no}`);
    } else if (perilaku === "batal") {
      jadwal(pesanTahan + antara(1, 5) * MIN, null, () => ({ t: "releaseHold", id: refId }));
    }
    if (datang) jadwal(startsAt + antara(-10, 12) * MIN, KASIR_SPL, () => ({ t: "checkin", code: checkin }));
    // Berhalangan datang: 70% memakai jadwal ulang gratis 4 jam sebelum main, ke hari berikutnya.
    else if (perilaku === "bayar" && rnd() < 0.7 && Math.max(startsAt - 4 * HOUR, bayarPada + 5 * MIN) <= startsAt - 3 * HOUR) {
      jadwal(Math.max(startsAt - 4 * HOUR, bayarPada + 5 * MIN), null, () => {
        // Hanya booking yang benar-benar sudah dibayar yang bisa dipindah.
        if (!st.sessions.some((x) => x.id === refId && x.status === "booked")) return null;
        jadwalUlangan.coba++;
        const kelas = classOf(st, tableId);
        for (const hariLagi of [1, 2, 3]) {
          for (const meja of MEJA_BILIAR.filter((m) => classOf(st, m) === kelas)) {
            const ke = { tableId: meja, startsAt: startsAt + hariLagi * 24 * HOUR };
            const r = jadwalUlangProblem(st, refId, ke, kini);
            if (r.masalah) continue;
            const act: Action = { t: "jadwalUlang", id: refId, code: kode, ...ke };
            if (r.selisih > 0) {
              // Selisih dibayar QRIS: server pembayaran yang menulis nominal & penandanya.
              uangMasukOnline.push({ kode, amount: r.selisih, ref: refId });
              jadwalUlangan.bayarSelisih++;
              return { ...act, bayarTambah: r.selisih, bayarId: `byr-${kode}` } as Action;
            }
            return act;
          }
        }
        return null;
      }, `jadwalUlang:${no}`);
    }
    jadwal(startsAt + hours * HOUR, KASIR_SPL, () => {
      const s = st.sessions.find((x) => x.id === refId && x.status === "running");
      return s ? { t: "settle", id: s.id, channel: pick(["cash", "edc", "qris_online"] as const) } : null;
    });
    (p as Pelanggan & { perilaku?: string }).perilaku = perilaku;
  }

  if (jenis === "walkin") {
    const tableId = pick(MEJA_BILIAR);
    const mulai = jam(antara(12, 23), antara(0, 59));
    const lama = antara(60, 180) * MIN;
    jadwal(mulai, KASIR_SPL, () => ({ t: "walkin", tableId, guest: p.nama }), `walkin:${no}`);
    if (rnd() < 0.6) {
      jadwal(mulai + 20 * MIN, KASIR_SPL, () => {
        const s = st.sessions.find((x) => x.tableId === tableId && x.status === "running" && x.guest === p.nama);
        const it = itemOf(st, pick(ITEM_BAR).id);
        if (!s || !it) return null;
        return { t: "addFnb", sessionId: s.id, name: it.name, station: it.station,
          line: { key: `w${no}`, itemId: it.id, qty: antara(1, 3), unitPrice: it.price, name: it.name, station: it.station } as CartLine };
      });
    }
    jadwal(mulai + lama, KASIR_SPL, () => {
      const s = st.sessions.find((x) => x.tableId === tableId && x.status === "running" && x.guest === p.nama);
      return s ? { t: "settle", id: s.id, channel: pick(["cash", "cash", "edc", "qris_online"] as const) } : null;
    });
  }

  if (jenis === "dinein") {
    const tableId = pick(MEJA_RESTO);
    const datang = jam(antara(12, 22), antara(0, 59));
    const kode = `SPL-D${String(no).padStart(3, "0")}`;
    const online = rnd() < 0.3;
    p.kode = kode;
    jadwal(datang, KASIR_SMH, () => {
      if (st.sessions.some((x) => x.tableId === tableId && x.status === "running")) return null;   // meja sudah ada tamunya → pakai yang ada
      return { t: "walkin", tableId, guest: p.nama };
    });
    jadwal(datang + 3 * MIN, null, () => {
      const lines = keranjang(kode);
      const nilai = priceLines(st, lines).total;
      if (online) uangMasukOnline.push({ kode, amount: nilai, ref: `g-${kode}` });
      return { t: "guestOrder", order: {
        id: `g-${kode}`, code: kode, guest: p.nama, mode: "meja", tableId, pay: online ? "online" : "kasir",
        lines, paidOnline: online ? nilai : 0, venue: "smh",
      } };
    }, `dinein:${no}:${online ? "online" : "kasir"}`);
    jadwal(datang + antara(50, 110) * MIN, KASIR_SMH, () => {
      const s = st.sessions.find((x) => x.tableId === tableId && x.status === "running");
      return s ? { t: "settle", id: s.id, channel: pick(["cash", "edc", "qris_online"] as const) } : null;
    });
  }

  if (jenis === "takeaway") {
    const pesan = jam(antara(12, 23), antara(0, 59));
    const kode = `SPL-K${String(no).padStart(3, "0")}`;
    const online = rnd() < 0.5;
    const tidakDiambil = !online && rnd() < 0.1;
    p.kode = kode;
    jadwal(pesan, null, () => {
      const lines = keranjang(kode);
      const nilai = priceLines(st, lines).total;
      if (online) uangMasukOnline.push({ kode, amount: nilai, ref: `g-${kode}` });
      return { t: "guestOrder", order: {
        id: `g-${kode}`, code: kode, guest: p.nama, phone: `62813000${String(no).padStart(4, "0")}`, mode: "takeaway",
        pay: online ? "online" : "kasir", lines, paidOnline: online ? nilai : 0, venue: "smh",
      } };
    }, `takeaway:${no}:${online ? "online" : "kasir"}`);
    if (!online && !tidakDiambil) {
      jadwal(pesan + antara(15, 40) * MIN, KASIR_SMH, () => {
        const o = st.orders.find((x) => x.id === `g-${kode}` && x.status === "diterima" && !x.payment);
        return o ? { t: "settleOrder", id: o.id, channel: pick(["cash", "qris_online", "edc"] as const) } : null;
      });
    }
  }
});

/* ── 3. Menu habis di tengah malam: tamu yang memesannya sesudah itu ── */
const HABIS = ITEM_DAPUR[0];
jadwal(jam(20), KASIR_SMH, () => ({ t: "toggleSoldOut", itemId: HABIS.id, name: HABIS.name }));
for (const k of ["SPL-X901", "SPL-X902"]) {
  jadwal(jam(20, 30), null, () => {
    const lines = [baris(HABIS.id, 1, `${k}-0`)];
    const nilai = priceLines(st, lines).total;
    uangMasukOnline.push({ kode: k, amount: nilai, ref: `g-${k}` });
    return { t: "guestOrder", order: { id: `g-${k}`, code: k, guest: `Tamu ${k}`, mode: "takeaway", pay: "online", lines, paidOnline: nilai, venue: "smh" } };
  }, "habis");
}

/* ── 4. Tutup: shift ditutup dengan uang yang benar-benar dihitung ── */
const kasPerTempat: Record<"spl" | "smh", number> = { spl: 0, smh: 0 };
jadwal(jam(25, 50), KASIR_SPL, () => {
  kasPerTempat.spl = shiftCashExpected(st, st.shift?.venue === "spl" ? st.shift : (st.shiftSmh?.venue === "spl" ? st.shiftSmh : st.shift));
  return null;
});

/* ── Jalankan ─────────────────────────────────────────────────────── */
const tagihanTahan = new Map<string, number>();
const tahanDiterima = new Map<string, boolean>();
antre.sort((a, b) => a.at - b.at);
const ditolak: { tag?: string; t: string }[] = [];

for (const r of antre) {
  kini = r.at;
  const act = r.buat();
  if (!act) continue;
  const e: Entry = { id: `sim:${String(++n).padStart(5, "0")}`, at: r.at, by: r.by, act };
  const sebelum = st;
  st = applyEntry(st, e);
  entries.push(e);
  if (st === sebelum || JSON.stringify(st.sessions) === JSON.stringify(tickState(sebelum, r.at).sessions) && act.t !== "guestOrder" && act.t !== "settleOrder" && act.t !== "toggleSoldOut" && act.t !== "openShift") {
    ditolak.push({ tag: r.tag, t: act.t });
  }

  if (act.t === "hold") {
    const h = st.sessions.find((x) => x.id === act.session.id && x.status === "hold");
    tahanDiterima.set(act.session.id, !!h);
    if (h) {
      const nominal = h.tableAmount + (h.holdLines ?? []).reduce((s, l) => s + (l.unitPrice ?? 0) * l.qty, 0);
      tagihanTahan.set(h.id, nominal);

      // Apa yang dilihat HP tamu sesudah ringkasan publik menyusul (dengan jam HP meleset)?
      const skew = Number(r.tag?.split(":")[2] ?? 0);
      const ringkas = { ...st, sessions: sesiDariSlot(publicVenue(st, r.at).slots) };
      const eHp: Entry = { ...e, at: r.at + skew };
      // HP yang jamnya kecepatan dan menganggap slotnya kurang dari 30 menit lagi
      // tidak pernah sampai ke halaman bayar (checkout memakai jam HP yang sama).
      if (act.session.startsAt - eHp.at < 30 * MIN) continue;
      const lihatLama = applyAction(ringkas, eHp).sessions.some((x) => x.id === h.id);
      const lihatBaru = applyAction({ ...ringkas, sessions: buangCerminanHold(ringkas.sessions, eHp) }, eHp)
        .sessions.some((x) => x.id === h.id);
      vonisHp.dicek++;
      if (!lihatLama) vonisHp.lama++;
      if (!lihatBaru) vonisHp.baru++;
      vonisHp.skewMaks = Math.max(vonisHp.skewMaks, Math.abs(skew));
    }
  }
  if (act.t === "jadwalUlang" && st.sessions.find((x) => x.id === act.id)?.jadwalUlang) jadwalUlangan.berhasil++;
  if (act.t === "confirmOnline" && !r.tag?.startsWith("ganda")) {
    uangMasukOnline.push({ kode: act.session.bookingCode!, amount: act.session.paidOnline, ref: act.session.id });
  }
}
// Malam selesai: detak terakhir sesudah jam tutup.
kini = jam(26, 30);
st = tickState(st, kini);

if (process.env.DEBUG) {
  for (const s of st.sessions.filter((x) => x.status === "booked")) {
    const ev = entries.filter((e) => JSON.stringify(e.act).includes(s.id)).map((e) => `${new Date(e.at + 7 * HOUR).toISOString().slice(11, 16)} ${e.act.t}`);
    console.log("MASIH BOOKED", s.id, s.tableId, new Date(s.startsAt + 7 * HOUR).toISOString().slice(11, 16), "checkin", s.checkin, ev.join(" | "));
    const ci = entries.filter((e) => e.act.t === "checkin" && (e.act as { code: string }).code === s.checkin).map((e) => new Date(e.at + 7 * HOUR).toISOString().slice(11, 16));
    console.log("   checkin dicoba:", ci.join(", ") || "tidak", "| sesi lain di meja itu:", st.sessions.filter((x) => x.tableId === s.tableId && x.id !== s.id).map((x) => `${x.status} ${new Date(x.startsAt + 7 * HOUR).toISOString().slice(11, 16)}-${new Date(x.endsAt + 7 * HOUR).toISOString().slice(11, 16)}`).join("; "));
  }
}
/* ═══ AUDIT ═══════════════════════════════════════════════════════ */
console.log(`\n== Simulasi 100 pelanggan · ${HARI} · seed ${SEED} · ${entries.length} kejadian ==\n`);

console.log("-- A. Meja tidak pernah dobel --");
{
  const aktif = st.sessions.filter((s) => ["hold", "booked", "running"].includes(s.status));
  let dobel = 0;
  for (const a of aktif) for (const b of aktif) {
    if (a.id < b.id && a.tableId === b.tableId && a.startsAt < b.endsAt && b.startsAt < a.endsAt
      && a.source !== "walkin" && b.source !== "walkin") dobel++;
  }
  cek("tidak ada dua booking di meja & jam yang sama", dobel === 0, `${dobel} pasang`);
}

console.log("\n-- B. Setiap rupiah online punya tujuan --");
const semuaSesi = [...st.sessions, ...st.history.flatMap((h) => (h as { rows?: LiveSession[] }).rows ?? [])];
{
  const refundPer = (kode: string) => st.refunds.filter((r) => r.bookingCode === kode).reduce((s, r) => s + r.amount, 0);
  let hilang = 0, dobelTerima = 0;
  const contoh: string[] = [];
  for (const u of uangMasukOnline) {
    const sesi = st.sessions.find((s) => s.id === u.ref);
    const order = st.orders.find((o) => o.id === u.ref);
    const diterima = (sesi?.paidOnline ?? 0) + (order && order.status === "diterima" ? order.paidOnline : 0);
    const kembali = refundPer(u.kode);
    if (diterima + kembali < u.amount) { hilang++; if (contoh.length < 3) contoh.push(`${u.kode}: masuk ${u.amount}, tercatat ${diterima}, dikembalikan ${kembali}`); }
    if (diterima > u.amount) dobelTerima++;
  }
  void semuaSesi;
  cek("uang online yang masuk = booking/pesanan jadi + dana dikembalikan", hilang === 0, contoh.join(" · "));
  cek("notifikasi ganda tidak membuat uang tercatat dua kali", dobelTerima === 0, `${dobelTerima} kode`);
  const totalMasuk = uangMasukOnline.reduce((s, u) => s + u.amount, 0);
  console.log(`      uang masuk online ${totalMasuk.toLocaleString("id-ID")} · dikembalikan ${st.refunds.reduce((s, r) => s + r.amount, 0).toLocaleString("id-ID")} (${st.refunds.length} kasus)`);
}

console.log("\n-- C. Rekap per tempat --");
const rAll = recap(st, HARI), rSpl = recap(st, HARI, "spl"), rSmh = recap(st, HARI, "smh");
{
  cek("omzet SPL + Smokehouse = omzet gabungan", rSpl.gross + rSmh.gross === rAll.gross, `${rSpl.gross} + ${rSmh.gross} ≠ ${rAll.gross}`);
  cek("diterima kasir SPL + Smokehouse = gabungan", rSpl.diterima + rSmh.diterima === rAll.diterima, `${rSpl.diterima} + ${rSmh.diterima} ≠ ${rAll.diterima}`);
  cek("prabayar online SPL + Smokehouse = gabungan", rSpl.prabayar + rSmh.prabayar === rAll.prabayar, `${rSpl.prabayar} + ${rSmh.prabayar} ≠ ${rAll.prabayar}`);
  cek("omzet = diterima kasir + prabayar online", rAll.gross === rAll.diterima + rAll.prabayar, `${rAll.gross} ≠ ${rAll.diterima} + ${rAll.prabayar}`);
  const perKanal = Object.entries(rAll.byChannel).filter(([k]) => k !== "prabayar").reduce((s, [, c]) => s + c.gross, 0);
  cek("jumlah per kanal bayar di kasir = diterima kasir", perKanal === rAll.diterima, `${perKanal} ≠ ${rAll.diterima}`);
  cek("kanal prabayar = prabayar online", (rAll.byChannel.prabayar?.gross ?? 0) === rAll.prabayar, `${rAll.byChannel.prabayar?.gross} ≠ ${rAll.prabayar}`);
  cek("Smokehouse tidak punya omzet sewa meja biliar", rSmh.billiard === 0, `${rSmh.billiard}`);
  cek("tidak ada angka bercampur antar tempat", !rSpl.venueTercampur && !rSmh.venueTercampur);
}

console.log("\n-- D. HP tamu tidak salah memvonis 'slot diambil orang lain' --");
cek(`hold milik sendiri tetap terlihat di HP (${vonisHp.dicek} hold, jam HP meleset s/d ${vonisHp.skewMaks / MIN} menit)`,
  vonisHp.baru === 0, `${vonisHp.baru} vonis salah`);
console.log(`      sebelum perbaikan 7 Nov: ${vonisHp.lama} dari ${vonisHp.dicek} tamu akan melihat "Slot tidak bisa ditahan"`);

console.log("\n-- F. Jadwal ulang gratis untuk tamu yang berhalangan --");
cek(`setiap permintaan jadwal ulang yang sah diterima (${jadwalUlangan.berhasil} dari ${jadwalUlangan.coba}, ${jadwalUlangan.bayarSelisih} bayar selisih)`,
  jadwalUlangan.berhasil === jadwalUlangan.coba, `${jadwalUlangan.coba - jadwalUlangan.berhasil} gagal`);
cek("booking yang dijadwal ulang tidak jadi no-show hari ini",
  st.sessions.filter((x) => x.jadwalUlang).every((x) => x.status === "booked" && x.startsAt > jam(26)));

console.log("\n-- E. Diputar ulang di perangkat lain, urutan terima acak --");
{
  const acak = [...entries].sort(() => rnd() - 0.5);
  const lain = tickState(replay(genesis, acak), kini);
  const sidik = (x: State) => JSON.stringify([recap(x, HARI), x.refunds.length, x.orders.length]);
  cek("hasil identik dengan perangkat kasir", sidik(lain) === sidik(st));
  void entryOrder;
}

/* ── Ringkasan untuk laporan ─────────────────────────────────────── */
const hasilBooking = pelanggan.filter((p) => p.jenis === "booking" || p.jenis === "rebut").map((p) => {
  const s = st.sessions.find((x) => x.id === p.refId);
  const arsip = st.history.some((h) => JSON.stringify(h).includes(p.refId!));
  const perilaku = (p as Pelanggan & { perilaku?: string }).perilaku;
  const tahan = tahanDiterima.get(p.refId!);
  const status = s?.status ?? (arsip ? "selesai (arsip)" : tahan === false ? "slot ditolak (sudah dipakai)" : perilaku === "batal" ? "batal" : perilaku === "diam" ? "kedaluwarsa" : "tidak jadi");
  return { no: p.no, jenis: p.jenis, perilaku, status, refund: st.refunds.some((r) => r.bookingCode === p.kode) };
});
const hitungStatus = hasilBooking.reduce<Record<string, number>>((m, x) => { m[x.status] = (m[x.status] ?? 0) + 1; return m; }, {});
const pesanan = st.orders;
const jamRamai = (() => {
  const per: Record<string, number> = {};
  for (const e of entries) if (["walkin", "guestOrder", "hold", "checkin"].includes(e.act.t)) {
    const h = new Date(e.at + 7 * HOUR).getUTCHours(); per[h] = (per[h] ?? 0) + 1;
  }
  return Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, c]) => `${h}.00 (${c})`).join(", ");
})();

const ringkasan = {
  hari: HARI, seed: SEED, kejadian: entries.length,
  pelanggan: komposisi.reduce<Record<string, number>>((m, j) => { m[j] = (m[j] ?? 0) + 1; return m; }, {}),
  booking: hitungStatus,
  pesanan: {
    diterima: pesanan.filter((o) => o.status === "diterima").length,
    ditolak: pesanan.filter((o) => o.status === "ditolak").map((o) => `${o.code}: ${o.reason}`),
    takeawayBelumDibayar: pesanan.filter((o) => o.mode === "takeaway" && o.status === "diterima" && o.pay === "kasir" && !o.payment).length,
  },
  noShow: rAll.noShow,
  refund: st.refunds.map((r) => ({ kode: r.bookingCode, jumlah: r.amount, alasan: r.reason })),
  uang: {
    gabungan: { omzet: rAll.gross, diterimaKasir: rAll.diterima, prabayarOnline: rAll.prabayar, perKanal: rAll.byChannel, pajak: rAll.tax },
    spl: { omzet: rSpl.gross, sewaMeja: rSpl.billiard, makanMinum: rSpl.fnb },
    smokehouse: { omzet: rSmh.gross, makanMinum: rSmh.fnb },
  },
  jamRamai,
  hpTamu: vonisHp,
  jadwalUlang: jadwalUlangan,
  aksiDitolakMesin: ditolak.reduce<Record<string, number>>((m, x) => { m[x.t] = (m[x.t] ?? 0) + 1; return m; }, {}),
  temuan,
};
if (process.env.LAPORAN) {
  const fs = await import("node:fs");
  fs.writeFileSync(process.env.LAPORAN, JSON.stringify(ringkasan, null, 2));
}
console.log("\nRINGKASAN " + JSON.stringify({ jadwalUlang: jadwalUlangan, booking: hitungStatus, pesanan: ringkasan.pesanan, noShow: rAll.noShow, refund: st.refunds.length, omzet: rAll.gross, spl: rSpl.gross, smh: rSmh.gross, jamRamai }));
void kasPerTempat;
console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
