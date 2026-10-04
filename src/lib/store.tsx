import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { MenuItem } from "../data/menu";
import { PAKET_SIANG, type TableType } from "../data/venue";
import {
  GATEWAY_EXPIRY_MIN, HOLD_GRACE_MIN, HOLD_MIN, PAKET_FREE_DRINKS,
  businessDateOf, priceLines, priceWith, runningOn, useAdmin, type State as VenueState,
} from "./adminStore";
import { diWib } from "./occupancy";
import { todayISO } from "./core";
import { riwayatMember, tokenMember, type RiwayatMemberItem } from "./member";
import { EVENT_GANTI_AKUN } from "./jejakTamu";

/** Pilihan nomor meja untuk pesan makanan kedaluwarsa sendiri — HP yang sama besok
 *  tidak boleh diam-diam memesan ke meja kemarin (yang mungkin sedang dipakai orang lain). */
const FNB_TABLE_TTL_MS = 8 * 3_600_000;

export type CartLine = {
  key: string;
  itemId: string;
  qty: number;
  variant?: string;
  note?: string;
  /** Harga satuan yang dikunci saat dipesan (0 = minuman gratis Paket Siang). */
  unitPrice?: number;
  /** Sudah dibayar online — tidak ditagih lagi & tidak kena promo. */
  prepaid?: boolean;
  /** Baris milik pesanan tamu (QR/takeaway) — supaya void memperbarui pesanan asalnya. */
  orderId?: string;
};

/** Cara tamu menerima pesanan makanan TANPA booking meja (PRD §7.3). */
export type FnbMode = "meja" | "takeaway";
export type FnbPay = "online" | "kasir";

export type Draft = {
  dateISO: string;
  startHour: number | null;
  hours: number;
  tableId: string | null;
  tableType: TableType;
  paketSiang: boolean;
  fnbMode: FnbMode;
  /** Meja tempat tamu sedang bermain (dari QR di meja, `?meja=T07`). */
  fnbTable: string | null;
  /** Kapan meja itu dipilih/di-scan. */
  fnbTableAt: number | null;
  /** Tab (sesi berjalan) milik tamu di meja itu. Tab ditutup → pilihan meja dilepas;
   *  kasir memindah meja → pilihan ikut pindah. */
  fnbSessionId: string | null;
  fnbPay: FnbPay;
};

/** Pembayaran QRIS yang sedang berjalan — muat ulang/kembali tidak membuat hold kedua
 *  yang mengunci slot milik tamu itu sendiri. */
export type Pending = {
  code: string;
  checkin: string;
  refId: string;
  at: number;
  booking: boolean;
  draft: Draft;
  cart: CartLine[];
  grand: number;
  intent: string;
};

/** Sidik niat pembayaran: apa yang dibeli, bukan kapan. */
export const intentOf = (d: Draft, cart: CartLine[], booking: boolean) =>
  JSON.stringify([
    booking ? [d.dateISO, d.startHour, d.hours, d.tableId, d.paketSiang] : [d.fnbMode, d.fnbTable, d.fnbPay],
    cart.map((l) => [l.itemId, l.qty, l.variant ?? ""]),
  ]);

/** Nasib sebuah pembayaran menurut data venue: diterima, ditolak (dana dicatat), atau masih terbuka. */
export function pendingOutcome(
  p: Pending, venue: Pick<VenueState, "sessions" | "orders" | "refunds">,
): { kind: "diterima" | "ditolak" | "terbuka"; total: number } {
  if (p.booking) {
    const s = venue.sessions.find((x) => x.id === p.refId);
    if (s && s.status !== "hold") return { kind: "diterima", total: s.paidOnline };
    if (!s && venue.refunds.some((r) => r.bookingCode === p.code)) return { kind: "ditolak", total: 0 };
    return { kind: "terbuka", total: 0 };
  }
  const o = venue.orders.find((x) => x.id === p.refId);
  if (o?.status === "diterima") return { kind: "diterima", total: o.value };
  if (o) return { kind: "ditolak", total: o.paidOnline };
  return { kind: "terbuka", total: 0 };
}

export const pendingRecord = (p: Pending, total: number): Booking => ({
  kind: p.booking ? "booking" : "pesanan", code: p.code, refId: p.refId,
  checkin: p.booking ? p.checkin : undefined, draft: p.draft, lines: p.cart, total, createdAt: p.at,
});

/**
 * Catatan pesanan di HP pelanggan. Ini hanya penunjuk — status sebenarnya
 * (pindah meja, sedang main, ditolak, dsb.) selalu dibaca dari data venue
 * lewat `refId`, supaya layar pelanggan tidak pernah berbeda dengan kasir.
 */
export type Booking = {
  kind: "booking" | "pesanan";
  code: string;
  /** `o-<code>` = sesi booking · `g-<code>` = pesanan tamu. */
  refId: string;
  checkin?: string;
  draft: Draft;
  lines: CartLine[];
  total: number;
  createdAt: number;
};

type State = { draft: Draft; cart: CartLine[]; bookings: Booking[]; pending: Pending | null };

type Action =
  | { t: "setDate"; v: string }
  | { t: "setStart"; v: number | null }
  | { t: "setHours"; v: number }
  | { t: "setTable"; id: string | null; type: TableType }
  | { t: "setPaket"; v: boolean }
  /** Lepas pilihan meja/jam — untuk tamu yang hanya ingin pesan makanan. */
  | { t: "clearBooking" }
  /** `table` dipilih/di-scan saat `at`, dengan tab yang sedang jalan di meja itu (bila ada). */
  | { t: "setFnb"; mode?: FnbMode; table?: string | null; pay?: FnbPay; sessionId?: string | null; at?: number }
  /** Ikatkan pilihan meja ke tab tamu (meja baru dibuka, atau tamu dipindah kasir). */
  | { t: "bindFnb"; table: string; sessionId: string }
  | { t: "add"; item: MenuItem; variant?: string }
  | { t: "inc"; key: string }
  | { t: "dec"; key: string }
  | { t: "clearCart" }
  | { t: "confirm"; booking: Booking }
  /** Catat ke riwayat tanpa mengosongkan keranjang (pembayaran ditolak, atau niat lama). */
  | { t: "record"; booking: Booking }
  | { t: "setPending"; pending: Pending | null }
  | { t: "reset" }
  /** Akun berganti: riwayat & pembayaran tertunda milik pemilik lama dibuang. */
  | { t: "gantiAkun" }
  /** Daftar resmi milik akun yang sedang masuk — MENGGANTI isi lama, bukan menambah. */
  | { t: "riwayatAkun"; bookings: Booking[] };

const freshDraft = (): Draft => ({
  dateISO: todayISO(),
  startHour: null,
  hours: 2,
  tableId: null,
  tableType: "regular",
  paketSiang: false,
  fnbMode: "meja",
  fnbTable: null,
  fnbTableAt: null,
  fnbSessionId: null,
  fnbPay: "online",
});

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "setDate":
      return { ...s, draft: { ...s.draft, dateISO: a.v, startHour: null, tableId: null } };
    case "setStart":
      return { ...s, draft: { ...s.draft, startHour: a.v, tableId: null } };
    case "setHours":
      return { ...s, draft: { ...s.draft, hours: a.v, tableId: null } };
    case "setTable":
      // Paket Siang hanya untuk meja reguler (sama dengan aturan mesin).
      // Paket Siang hanya untuk meja reguler — VIP/VVIP tidak termasuk.
      return { ...s, draft: { ...s.draft, tableId: a.id, tableType: a.type, paketSiang: a.type === "regular" ? s.draft.paketSiang : false } };
    case "setPaket":
      return { ...s, draft: { ...s.draft, paketSiang: a.v } };
    case "clearBooking":
      return { ...s, draft: { ...s.draft, startHour: null, tableId: null, paketSiang: false } };
    case "setFnb":
      return {
        ...s,
        draft: {
          ...s.draft,
          ...(a.mode ? { fnbMode: a.mode } : {}),
          ...(a.table !== undefined ? {
            fnbTable: a.table,
            fnbTableAt: a.table ? (a.at ?? Date.now()) : null,
            fnbSessionId: a.table ? (a.sessionId ?? null) : null,
          } : {}),
          ...(a.pay ? { fnbPay: a.pay } : {}),
          // Pindah ke takeaway: bawaannya bayar di kasir saat mengambil (QRIS menyusul).
          ...(a.mode === "takeaway" && !a.pay ? { fnbPay: "kasir" as const } : {}),
        },
      };
    case "bindFnb":
      if (s.draft.fnbTable === a.table && s.draft.fnbSessionId === a.sessionId) return s;
      return { ...s, draft: { ...s.draft, fnbTable: a.table, fnbSessionId: a.sessionId } };
    case "add": {
      const key = a.variant ? `${a.item.id}::${a.variant}` : a.item.id;
      const found = s.cart.find((l) => l.key === key);
      if (found)
        return { ...s, cart: s.cart.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) };
      return { ...s, cart: [...s.cart, { key, itemId: a.item.id, qty: 1, variant: a.variant }] };
    }
    case "inc":
      return { ...s, cart: s.cart.map((l) => (l.key === a.key ? { ...l, qty: l.qty + 1 } : l)) };
    case "dec":
      return {
        ...s,
        cart: s.cart.flatMap((l) =>
          l.key === a.key ? (l.qty <= 1 ? [] : [{ ...l, qty: l.qty - 1 }]) : [l],
        ),
      };
    case "clearCart":
      return { ...s, cart: [] };
    case "confirm": {
      const bookings = [a.booking, ...s.bookings.filter((b) => b.refId !== a.booking.refId)].slice(0, 50);
      // Pesanan dari meja: meja & cara bayar diingat supaya tamu bisa pesan lagi.
      const draft = a.booking.kind === "booking"
        ? {
            ...freshDraft(), fnbMode: s.draft.fnbMode, fnbTable: s.draft.fnbTable,
            fnbTableAt: s.draft.fnbTableAt, fnbSessionId: s.draft.fnbSessionId, fnbPay: s.draft.fnbPay,
          }
        : s.draft;
      return { draft, cart: [], bookings, pending: s.pending?.refId === a.booking.refId ? null : s.pending };
    }
    case "record": {
      if (s.bookings.some((b) => b.refId === a.booking.refId) && s.pending?.refId !== a.booking.refId) return s;
      const bookings = [a.booking, ...s.bookings.filter((b) => b.refId !== a.booking.refId)].slice(0, 50);
      return { ...s, bookings, pending: s.pending?.refId === a.booking.refId ? null : s.pending };
    }
    case "setPending":
      return { ...s, pending: a.pending };
    case "reset":
      return { ...s, draft: freshDraft() };
    case "riwayatAkun": {
      // Sengaja MENGGANTI, bukan menggabung: catatan lama di perangkat ini bisa
      // milik akun sebelumnya, dan menggabung berarti membocorkannya. Yang berhak
      // menentukan isi riwayat cuma server, lewat nomor HP resmi si member.
      // `pending` dibiarkan: itu pembayaran yang SEDANG berjalan di perangkat ini,
      // dan pemiliknya sudah pasti akun yang sedang masuk.
      return { ...s, bookings: a.bookings.slice(0, 50) };
    }
    case "gantiAkun":
      // Riwayat & niat bayar melekat pada ORANG, bukan pada perangkat. Perangkat
      // bersama (HP kasir, tablet lobi) dipakai bergantian, jadi ini wajib.
      return { ...s, bookings: [], pending: null };
  }
}

/* ── Tersimpan di HP ─────────────────────────────────────────────────
   Keranjang, pilihan, dan riwayat tidak hilang saat halaman dimuat ulang. */
const KEY = "spl:v1:customer";

/** Pembayaran yang lebih tua dari umur hold di mesin sudah pasti selesai atau kedaluwarsa. */
export const PENDING_TTL_MS = (Math.max(HOLD_MIN + HOLD_GRACE_MIN, GATEWAY_EXPIRY_MIN) + 5) * 60_000;

function load(): State {
  const empty: State = { draft: freshDraft(), cart: [], bookings: [], pending: null };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Partial<State>;
    let d = { ...freshDraft(), ...(p.draft ?? {}) };
    if (d.dateISO < todayISO()) d = { ...d, dateISO: todayISO(), startHour: null, tableId: null, paketSiang: false };
    // Versi lama tidak mencatat kapan meja dipilih — anggap basi.
    if (d.fnbTable && (!d.fnbTableAt || Date.now() - d.fnbTableAt > FNB_TABLE_TTL_MS)) {
      d = { ...d, fnbTable: null, fnbTableAt: null, fnbSessionId: null };
    }
    const pend = p.pending;
    return {
      draft: d,
      cart: Array.isArray(p.cart) ? p.cart.filter((l) => l && typeof l.itemId === "string" && l.qty >= 1) : [],
      bookings: Array.isArray(p.bookings) ? p.bookings.filter((b) => b && b.code && b.refId && b.kind) : [],
      pending: pend && typeof pend.refId === "string" && typeof pend.at === "number" && typeof pend.intent === "string"
        ? pend : null,
    };
  } catch {
    return empty;
  }
}

function itemKeBooking(it: RiwayatMemberItem): Booking | null {
  if (!it || !it.code || !it.refId) return null;
  const st = it.status;
  const s = st?.session;
  const o = st?.order;
  const startsAt = s?.startsAt ?? it.createdAt;
  const dateISO = s?.startsAt ? businessDateOf(s.startsAt) : todayISO();
  const startHour = s?.startsAt ? diWib(s.startsAt).getUTCHours() : null;
  const hours = s?.startsAt && s?.endsAt ? Math.max(1, Math.round((s.endsAt - s.startsAt) / 3_600_000)) : 2;

  const draft: Draft = {
    ...freshDraft(),
    dateISO,
    startHour,
    hours,
    tableId: s?.tableId ?? o?.tableId ?? null,
    tableType: s?.tableType ?? "regular",
    paketSiang: s?.paket === "siang",
    fnbMode: o?.mode ?? "meja",
    fnbTable: o?.tableId ?? null,
    fnbPay: o?.pay ?? "online",
  };

  return {
    kind: it.kind ?? (it.refId.startsWith("g-") ? "pesanan" : "booking"),
    code: it.code,
    refId: it.refId,
    checkin: s?.checkin,
    draft,
    lines: (s?.fnb ?? o?.lines ?? []) as CartLine[],
    total: s?.paidOnline ?? o?.paidOnline ?? o?.value ?? 0,
    createdAt: it.createdAt,
  };
}

/* ── Perhitungan uang ────────────────────────────────────────────────
   PRD KK-03: harga tayang TAX-INCLUSIVE. Angka yang dilihat pelanggan
   adalah angka yang dibayar; pajak ditarik mundur dari total, bukan
   ditambahkan di atasnya. PBJT 10% masih [PERLU KONFIRMASI]. */
export const PBJT_RATE = 0.1;

export function computeTotals(
  draft: Draft, cart: CartLine[],
  venue: Pick<VenueState, "rates" | "menuPrices" | "sessions"> & { tableTypes?: VenueState["tableTypes"] },
) {
  // Rumus yang SAMA dengan yang dipakai mesin saat memverifikasi pembayaran —
  // tarif & harga menu terkini, jatah minuman gratis. Kalau berbeda, pembayaran ditolak.
  const booking = draft.tableId !== null && draft.startHour !== null;
  const tableType = (draft.tableId && venue.tableTypes?.[draft.tableId])
    ? venue.tableTypes[draft.tableId]
    : draft.tableType;
  const tableTotal = !booking
    ? 0
    : draft.paketSiang
      ? PAKET_SIANG.price
      : priceWith(venue.rates, tableType, draft.startHour!, draft.hours);

  const credits = booking
    ? (draft.paketSiang ? PAKET_FREE_DRINKS : 0)
    : draft.fnbMode === "meja"
      ? (runningOn(venue, draft.fnbTable ?? undefined)?.freeDrinks ?? 0)
      : 0;
  const priced = priceLines(venue, cart, credits);

  const fnbTotal = priced.total;
  const grand = tableTotal + fnbTotal;
  const dpp = Math.round(grand / (1 + PBJT_RATE));
  const tax = grand - dpp;
  return { booking, tableTotal, fnbTotal, grand, dpp, tax, lines: priced.lines };
}

const Ctx = createContext<{
  state: State;
  dispatch: React.Dispatch<Action>;
  totals: ReturnType<typeof computeTotals>;
  cartCount: number;
} | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const { a: venue } = useAdmin();

  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* mode privat: tetap jalan tanpa simpan */ }
  }, [state]);

  // Akun berganti → riwayat pemilik lama dibuang dari perangkat ini.
  useEffect(() => {
    const bersih = () => dispatch({ t: "gantiAkun" });
    window.addEventListener(EVENT_GANTI_AKUN, bersih);
    return () => window.removeEventListener(EVENT_GANTI_AKUN, bersih);
  }, []);

  // Riwayat mengikuti AKUN, bukan perangkat.
  //
  // Dulu daftar dari server hanya DITAMBAHKAN ke catatan lokal, jadi booking akun
  // sebelumnya tetap nangkring di HP yang sama — bocor ke orang berikutnya yang
  // masuk. Sekarang, selama ada member yang masuk, daftar dari server MENGGANTI
  // isi lokal seluruhnya (termasuk kalau daftarnya kosong), jadi perangkat yang
  // terlanjur menyimpan data akun lain ikut bersih sendiri.
  useEffect(() => {
    let batal = false;
    const tarik = () => {
      if (!tokenMember()) return;                    // tamu tanpa akun: catatan lokal apa adanya
      void riwayatMember().then((list) => {
        if (batal) return;
        const bookings = (list ?? []).map(itemKeBooking).filter((b): b is Booking => !!b);
        dispatch({ t: "riwayatAkun", bookings });
      });
    };
    tarik();
    window.addEventListener(EVENT_GANTI_AKUN, tarik);
    return () => { batal = true; window.removeEventListener(EVENT_GANTI_AKUN, tarik); };
  }, []);

  // Pilihan meja untuk pesan makanan mengikuti TAB tamu, bukan nomor meja semata.
  const { fnbTable, fnbSessionId } = state.draft;
  useEffect(() => {
    if (!fnbTable) return;
    if (fnbSessionId) {
      const s = venue.sessions.find((x) => x.id === fnbSessionId);
      if (!s || s.status !== "running") dispatch({ t: "setFnb", table: null });       // tab sudah ditutup / di-void
      else if (s.tableId !== fnbTable) dispatch({ t: "bindFnb", table: s.tableId, sessionId: s.id }); // dipindah kasir
    } else {
      const r = runningOn(venue, fnbTable);
      if (r) dispatch({ t: "bindFnb", table: fnbTable, sessionId: r.id });              // meja baru dibuka kasir
    }
  }, [venue.sessions, fnbTable, fnbSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pembayaran yang tertinggal (halaman dimuat ulang / ditutup saat "mengecek"):
  // hasilnya tetap dibaca dari data venue dan dicatat ke riwayat — tidak pernah hilang.
  const pending = state.pending;
  useEffect(() => {
    if (!pending) return;
    const out = pendingOutcome(pending, venue);
    if (out.kind === "diterima") {
      // Keranjang hanya dikosongkan bila isinya memang yang dibayar.
      const same = intentOf(state.draft, state.cart, pending.booking) === pending.intent;
      dispatch({ t: same ? "confirm" : "record", booking: pendingRecord(pending, out.total) });
    } else if (out.kind === "ditolak") {
      dispatch({ t: "record", booking: pendingRecord(pending, out.total) });
    } else if (Date.now() - pending.at > PENDING_TTL_MS) {
      dispatch({ t: "setPending", pending: null });
    }
  }, [pending, venue.sessions, venue.orders, venue.refunds]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(
    () => computeTotals(state.draft, state.cart, venue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.draft, state.cart, venue.rates, venue.menuPrices, venue.sessions],
  );
  const cartCount = useMemo(() => state.cart.reduce((n, l) => n + l.qty, 0), [state.cart]);
  return <Ctx.Provider value={{ state, dispatch, totals, cartCount }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore harus dipakai di dalam StoreProvider");
  return v;
}
