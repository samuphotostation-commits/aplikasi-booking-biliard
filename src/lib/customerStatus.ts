import type { CartLine } from "./store";
import type { LiveSession, Ticket } from "../data/live";
import type { ArchivedOrder, ArchivedSession, GuestOrder, Refund, State } from "./engine";
import type { Booking, Draft } from "./store";
import { businessDateOf, diWib } from "./occupancy";

/* Status pesanan pelanggan SELALU dibaca dari data venue, bukan dari salinan
   di HP — supaya "Pesanan Saya" tidak pernah bilang terkonfirmasi padahal
   kasir sudah memindah meja, tamu tidak datang, atau pembayaran ditolak.
   Hari yang sudah tutup buku dibaca dari arsipnya. */

export type Tone = "ok" | "wait" | "info" | "bad" | "muted";

export type CustomerStatus = {
  tone: Tone;
  label: string;
  session?: LiveSession | ArchivedSession;
  order?: GuestOrder | ArchivedOrder;
  refunds: Refund[];
  tickets: Ticket[];
  /** Yang dibayar untuk booking/pesanan INI saja (tanpa pesanan QR lain yang menempel di mejanya). */
  paid: number;
  /** Baris makanan milik booking/pesanan ini. */
  lines: CartLine[];
};

export const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-emerald-500/15 text-emerald-400",
  wait: "bg-amber/15 text-amber",
  info: "bg-sky-400/15 text-sky-300",
  bad: "bg-red-500/15 text-red-300",
  muted: "bg-ink-3 text-dim",
};

const refundLabel = (refunds: Refund[]) =>
  refunds.length === 0 ? ""
    : refunds.every((r) => r.settledAt) ? " · dana sudah dikembalikan" : " · dana sedang dikembalikan";

const isLive = <T extends object>(x: T | undefined, key: string): boolean => !!x && key in x;

export function customerStatus(b: Booking, a: State, now = Date.now()): CustomerStatus {
  const archivedSessions = a.history.flatMap((h) => h.sessions);
  const archivedOrders = a.history.flatMap((h) => h.orders);
  const refunds = [...a.refunds, ...a.history.flatMap((h) => h.refunds)].filter((r) => r.bookingCode === b.code);

  if (b.kind === "booking") {
    const live = a.sessions.find((x) => x.id === b.refId);
    const session: LiveSession | ArchivedSession | undefined = live ?? archivedSessions.find((x) => x.id === b.refId);
    // Pesanan QR yang dibayar dari meja setelah check-in punya kartu sendiri — jangan dihitung dua kali.
    const attachedPaid = session
      ? [...a.orders, ...archivedOrders].filter((o) => o.sessionId === session.id).reduce((n, o) => n + o.paidOnline, 0)
      : 0;
    // Hold belum lunas: yang ditampilkan adalah yang harus dibayar.
    const paid = !session || session.status === "hold" ? b.total : session.paidOnline - attachedPaid;
    const lines = live
      ? (live.status === "noshow" ? live.noShowFnb ?? [] : live.status === "hold" ? live.holdLines ?? b.lines : live.fnb)
          .filter((l) => live.status === "hold" || (l.prepaid && !l.orderId))
      : b.lines;
    const base = { session, refunds, tickets: [] as Ticket[], paid, lines };
    switch (session?.status) {
      case "hold": return { ...base, tone: "wait", label: "Menunggu pembayaran" };
      case "booked":
        return now >= session.endsAt
          ? { ...base, tone: "bad", label: "Jadwal terlewat · hubungi kasir" }
          : { ...base, tone: "ok", label: "Terkonfirmasi" };
      case "running": return { ...base, tone: "info", label: "Sedang main" };
      case "done": return { ...base, tone: "muted", label: "Selesai" };
      case "noshow": return { ...base, tone: "bad", label: "Tidak datang, dilepas" };
    }
    // "Tidak ditemukan" itu bahasa mesin, dan menakutkan bagi tamu yang baru
    // saja membayar. Yang sebenarnya terjadi: booking ini bukan milik akun yang
    // sedang masuk — biasanya karena dibuat dengan akun lain di perangkat ini.
    return refunds.length
      ? { ...base, paid: 0, tone: "bad", label: `Dibatalkan${refundLabel(refunds)}` }
      : { ...base, tone: "muted", label: "Bukan di akun ini" };
  }

  const liveOrder = a.orders.find((x) => x.id === b.refId);
  const order: GuestOrder | ArchivedOrder | undefined = liveOrder ?? archivedOrders.find((x) => x.id === b.refId);
  // Tiket dicocokkan lewat kunci baris pesanan ini, bukan jam pesan (dua pesanan bisa sedetik).
  const tickets = liveOrder
    ? a.tickets.filter((t) => t.sessionId === (liveOrder.sessionId ?? liveOrder.id) && liveOrder.lines.some((l) => l.key === t.lineKey))
    : [];
  const base = {
    order, refunds, tickets,
    paid: order ? (order.status === "diterima" ? order.value : order.paidOnline) : b.total,
    lines: liveOrder?.lines ?? b.lines,
  };
  if (!order) return { ...base, tone: "muted", label: "Bukan di akun ini" };
  if (order.status === "ditolak") return { ...base, tone: "bad", label: `Ditolak: ${order.reason ?? "tidak bisa diproses"}${refundLabel(refunds)}` };
  if (order.status === "void") return { ...base, paid: 0, tone: "bad", label: `Dibatalkan${refundLabel(refunds)}` };
  const partial = refunds.length > 0 ? " · sebagian dibatalkan" : "";
  // Pesanan dari hari yang sudah tutup buku sudah pasti selesai.
  if (!isLive(liveOrder, "lines") || (tickets.length > 0 && tickets.every((t) => t.status === "served"))) {
    return { ...base, tone: "muted", label: `${order.mode === "takeaway" ? "Sudah diambil" : "Sudah diantar"}${partial}` };
  }
  if (tickets.some((t) => t.status === "ready")) return { ...base, tone: "ok", label: `Siap${partial}` };
  if (tickets.some((t) => t.status === "preparing")) return { ...base, tone: "info", label: `Sedang dibuat${partial}` };
  return { ...base, tone: "wait", label: `Masuk dapur${partial}` };
}

export const TICKET_LABEL: Record<Ticket["status"], string> = {
  new: "Baru", preparing: "Diproses", ready: "Siap", served: "Diantar",
};

export const jamOf = (ts: number) => {
  // Jam ditulis dalam WIB, bukan zona HP tamu: satu booking harus terbaca sama
  // di HP, di web, dan di layar kasir.
  const d = diWib(ts);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/* ────────────────────────────────────────────────────────────────
   BOOKING YANG MELEKAT DI AKUN MEMBER, BUKAN DI HP

   Riwayat "Pesanan Saya" dulu hanya daftar di localStorage HP yang dipakai
   memesan. Buka di perangkat lain — walau akun membernya sama — dan
   riwayatnya kosong, bahkan layar "Berhasil Booking" bilang TIDAK DITEMUKAN.
   Sekarang server ikut mengirim booking milik akun ini (member_booking), dan
   fungsi di bawah mengubahnya jadi catatan yang bisa ditampilkan layar mana
   pun. Kode booking yang sudah ada di HP tidak diduplikasi.
   ──────────────────────────────────────────────────────────────── */
const draftDariSesi = (s: LiveSession): Draft => ({
  dateISO: businessDateOf(s.startsAt),
  startHour: diWib(s.startsAt).getUTCHours(),
  hours: Math.max(1, Math.round((s.endsAt - s.startsAt) / 3_600_000)),
  tableId: s.tableId,
  tableType: s.tableType ?? "regular",
  paketSiang: s.paket === "siang",
  fnbMode: "meja",
  fnbTable: s.tableId,
  fnbTableAt: null,
  fnbSessionId: s.id,
  fnbPay: "kasir",
});

/** Booking/pesanan milik akun ini yang BELUM tercatat di HP ini. */
export function bookingMilikAkun(a: State, sudah: Booking[]): Booking[] {
  const punya = new Set(sudah.map((b) => b.code));
  const hasil: Booking[] = [];
  for (const s of a.sessions) {
    // Sesi tamu LAIN datang dari ringkasan publik tanpa kode booking, jadi
    // syarat `bookingCode` sekaligus menjaga hanya milik akun ini yang tampil.
    if (!s.bookingCode || punya.has(s.bookingCode)) continue;
    punya.add(s.bookingCode);
    hasil.push({
      kind: "booking", code: s.bookingCode, refId: s.id, checkin: s.checkin,
      draft: draftDariSesi(s), lines: s.fnb ?? [], total: s.paidOnline ?? 0, createdAt: s.startsAt,
    });
  }
  for (const o of a.orders) {
    if (!o.code || punya.has(o.code)) continue;
    punya.add(o.code);
    hasil.push({
      kind: "pesanan", code: o.code, refId: o.id,
      draft: { ...draftDariSesi({ startsAt: o.at, endsAt: o.at, tableId: o.tableId ?? null } as LiveSession), fnbMode: o.mode },
      lines: o.lines ?? [], total: o.paidOnline ?? 0, createdAt: o.at,
    });
  }
  return hasil;
}
