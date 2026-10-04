import { TABLES, type PoolTable } from "../data/venue";
import type { LiveSession } from "../data/live";
import { busyHoursFromSessions, dariWib, tanggalWib } from "./occupancy";

export const rupiah = (n: number) =>
  "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });

export const rupiahShort = (n: number) =>
  n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);

/** Hari ini menurut kalender WIB — bukan menurut zona HP tamu. */
export const todayISO = () => tanggalWib(Date.now());

export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return tanggalWib(dariWib(y, m, d + days, 12));
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function fmtDateLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
}
export function fmtDateShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { dow: HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].slice(0, 3), day: d, mon: BULAN[m - 1] };
}

/* ── Ketersediaan ───────────────────────────────────────────────────
   Setiap tanggal dihitung MURNI dari sesi nyata di data venue: booking
   yang sudah dibayar, slot yang sedang ditahan selama pelanggan membayar,
   walk-in kasir, dan meja rusak. Dulu tanggal mendatang ditambah pola
   buatan supaya kalender "terlihat ramai" — itu membuat pelanggan melihat
   penuh padahal kosong, dan kasir tidak pernah melihatnya. Sudah dihapus. */

/** Jam terisi untuk satu meja pada satu tanggal — sumber yang sama dengan papan kasir. */
export function getBusyHours(
  tableId: string,
  dateISO: string,
  sessions: LiveSession[] = [],
): number[] {
  return [...busyHoursFromSessions(sessions, tableId, dateISO)];
}

export function isFree(
  tableId: string,
  dateISO: string,
  startHour: number,
  hours: number,
  sessions: LiveSession[] = [],
) {
  const busy = new Set(getBusyHours(tableId, dateISO, sessions));
  for (let h = 0; h < hours; h++) {
    if (busy.has(startHour + h)) return false;
    if (startHour + h >= 26) return false;
  }
  return true;
}

/** Berapa meja yang masih kosong pada satu jam — untuk strip jam di layar booking. */
export function freeCountAtHour(
  dateISO: string,
  hour: number,
  sessions: LiveSession[] = [],
  type?: PoolTable["type"],
  /** Kelas meja yang diubah pemilik (VIP ↔ VVIP). Tanpa ini hitungannya memakai kelas bawaan. */
  tableTypes?: Record<string, PoolTable["type"]>,
  todayISO?: string,
) {
  const isToday = todayISO ? dateISO === todayISO : false;
  return TABLES.filter((t) => {
    const kelas = tableTypes?.[t.id] ?? t.type;
    // Meja resto dipesan lewat halaman reservasi resto — tidak pernah ikut
    // hitungan meja biliar, kalau tidak strip jam menjanjikan meja yang tidak
    // pernah bisa dipilih tamu.
    if (kelas === "resto") return false;
    if (type && kelas !== type) return false;
    if (isToday && sessions.some((s) => s.tableId === t.id && s.status === "running")) return false;
    return !getBusyHours(t.id, dateISO, sessions).includes(hour);
  }).length;
}

export function availableTables(
  dateISO: string,
  startHour: number,
  hours: number,
  sessions: LiveSession[] = [],
) {
  return TABLES.filter((t) => isFree(t.id, dateISO, startHour, hours, sessions));
}

/** Kode booking bergaya SPL-8F3K2A (byte acak, bukan urutan — PRD SEC-10). */
export function bookingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `SPL-${s}`;
}

export function checkinCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
