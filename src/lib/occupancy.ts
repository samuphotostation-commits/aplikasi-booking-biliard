import type { LiveSession } from "../data/live";
import { CLOSE_HOUR, OPEN_HOUR } from "../data/venue";

/* ═══════════════════════════════════════════════════════════════════
   SATU SUMBER KEBENARAN untuk "meja ini terpakai atau tidak".
   Dipakai bersama oleh booking online DAN panel kasir, supaya keduanya
   tidak mungkin menjual slot yang sama (PRD KK-10, KK-20).
   ═══════════════════════════════════════════════════════════════════ */

export const HOUR_MS = 3_600_000;

/* ═════════════════════════════════════════════════════════════════
   VENUE JALAN DI WIB — BUKAN DI ZONA PERANGKAT

   Dulu semua hitungan jam & tanggal memakai waktu LOKAL perangkat
   (new Date(y, m, d, jam), getHours(), getDate()). Itu diam-diam
   mengandaikan SETIAP perangkat disetel WIB. Begitu mesin yang sama
   dijalankan di server (Supabase Edge jalan di UTC), semuanya bergeser
   7 jam: booking jam 16.00 terbaca 09.00, ditolak "di luar jam
   operasional", dan ringkasan untuk HP pelanggan terbit KOSONG — meja
   terpakai jadi tidak bertanda dan tetap bisa dipesan tamu.

   Sekarang zonanya dikunci di sini: kasir, HP tamu (zona apa pun), dan
   server menghitung jam yang sama persis.
   ═════════════════════════════════════════════════════════════════ */
export const WIB_OFFSET_MIN = 7 * 60;
const WIB_MS = WIB_OFFSET_MIN * 60_000;

/** Tanggal/jam WIB sebuah timestamp. Komponennya dibaca lewat getUTC*. */
export const diWib = (ts: number) => new Date(ts + WIB_MS);

/** Timestamp dari komponen WIB (bulan 1-12; jam boleh > 23 untuk lewat tengah malam). */
export const dariWib = (y: number, bulan: number, tgl: number, jam = 0, menit = 0) =>
  Date.UTC(y, bulan - 1, tgl, jam, menit, 0, 0) - WIB_MS;

/** `YYYY-MM-DD` menurut kalender WIB. */
export const tanggalWib = (ts: number) => {
  const d = diWib(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/**
 * Buffer bersih-bersih & rack ulang setelah sesi selesai (PRD §5 turnaround_minutes).
 *
 * Ini yang membuat sesi bermenit-ganjil tetap sinkron dengan grid jam:
 * sesi TIDAK harus mulai di jam bulat, tapi meja tetap terkunci sampai
 * `endsAt + buffer`. Walk-in 13.17–14.17 mengunci sampai 14.27, sehingga
 * slot 14.00 tertutup dan slot 15.00 terbuka — tanpa pembulatan tagihan.
 */
export const TURNAROUND_MIN = 10;

/** Sesi yang menempati meja. `done` dan `noshow` sudah melepas meja.
 *  `hold` ikut menempati: slot yang sedang dibayar tidak boleh dijual ke orang lain. */
export const isActive = (s: LiveSession) =>
  s.status === "hold" || s.status === "booked" || s.status === "running" || s.status === "maintenance";

/** Meja rusak terkunci sampai diaktifkan kembali — bukan 24 jam lalu diam-diam terbuka lagi. */
export const MAINTENANCE_END = Number.MAX_SAFE_INTEGER;

/** Open bill yang sedang jalan tidak punya jam selesai — meterannya terus berjalan.
 *  Meja yang dibuka PAKET PER JAM punya jam selesai, jadi bukan open bill. */
export const isOpenBill = (s: LiveSession) =>
  s.status === "running" && s.source === "walkin" && !s.blockHours;

/**
 * Ada open bill di meja ini pada hari operasional itu?
 *
 * Open bill tidak punya jam selesai — tidak seorang pun tahu kapan tamunya pulang.
 * Untuk BOOKING ONLINE meja seperti itu dianggap terpakai sampai tutup: menjual
 * slot jam berikutnya lewat aplikasi sama saja menjual meja yang belum tentu kosong,
 * dan tamu online yang datang membawa bukti bayar tidak bisa disuruh menunggu.
 * Kasir di lantai tetap bebas mengatur meja itu (pindah, perpanjang, tutup tab).
 */
export const openBillOn = (sessions: LiveSession[], tableId: string, dateISO: string) =>
  sessions.some((s) => s.tableId === tableId && isOpenBill(s) && businessDateOf(s.startsAt) === dateISO);

/**
 * Sampai kapan meja benar-benar tidak bisa dijual lagi.
 *
 * PENTING untuk open bill: `endsAt` hanya kunci awal 30 menit. Selama meteran
 * masih jalan, meja tetap terpakai sampai SEKARANG — kalau tidak, begitu lewat
 * menit ke-30 sistem mengira meja kosong dan pelanggan online bisa memesannya
 * padahal tamu masih bermain.
 */
export function blockEndOf(s: LiveSession, now = Date.now()): number {
  if (s.status === "maintenance") return MAINTENANCE_END;
  // SEMUA sesi yang sedang berjalan menempati meja sampai tab ditutup —
  // termasuk booking online yang sudah lewat jam selesai tapi tamunya belum
  // pulang. Jadwal boleh habis; meja baru kosong kalau kasir menutup tab.
  const end = s.status === "running" ? Math.max(s.endsAt, now) : s.endsAt;
  return end + TURNAROUND_MIN * 60_000;
}

/** Awal slot jam ke-`hour` pada tanggal operasional `dateISO`.
 *  `hour` boleh > 23 (24 = 00.00 besok, 25 = 01.00 besok) — Date menangani rollover. */
export function slotStart(dateISO: string, hour: number): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return dariWib(y, m, d, hour);
}

/** Tanggal operasional sebuah timestamp — batas hari jam 02.00 (PRD KK-19). */
export function businessDateOf(ts: number): string {
  return tanggalWib(ts - 2 * HOUR_MS);
}

/** Jam operasional sekarang dalam indeks 11..25. Di luar jam buka → null. */
export function currentHourIndex(now = Date.now()): number | null {
  const h = diWib(now).getUTCHours();
  const idx = h < 2 ? h + 24 : h;
  return idx >= OPEN_HOUR && idx < CLOSE_HOUR ? idx : null;
}

/** Dua rentang waktu bertabrakan? Half-open `[)` — sesi 20–21 dan 21–22 TIDAK bentrok. */
export const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

/**
 * Jam-jam yang sudah terpakai pada satu meja di satu tanggal, dihitung dari
 * sesi NYATA (booking online yang sudah dibayar + walk-in + maintenance).
 */
export function busyHoursFromSessions(
  sessions: LiveSession[],
  tableId: string,
  dateISO: string,
  now = Date.now(),
): Set<number> {
  const busy = new Set<number>();
  // Open bill: seluruh sisa hari itu ditutup untuk booking online (lihat `openBillOn`).
  if (openBillOn(sessions, tableId, dateISO)) {
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) busy.add(h);
    return busy;
  }
  const rel = sessions.filter((s) => s.tableId === tableId && isActive(s));
  if (rel.length === 0) return busy;

  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    const s0 = slotStart(dateISO, h);
    const s1 = s0 + HOUR_MS;
    for (const s of rel) {
      // Maintenance memblokir seluruh hari operasional meja itu
      if (s.status === "maintenance" && businessDateOf(s.startsAt) === dateISO) {
        busy.add(h);
        break;
      }
      if (overlaps(s.startsAt, blockEndOf(s, now), s0, s1)) {
        busy.add(h);
        break;
      }
    }
  }
  return busy;
}

/** Boleh dipesan online? Menegakkan aturan waktu (tidak mundur dari realtime). */
export function hourBookable(
  dateISO: string,
  hour: number,
  todayISO: string,
  minLeadMinutes: number,
  now = Date.now(),
): { ok: true } | { ok: false; why: "lewat" | "terlalu-dekat" } {
  if (dateISO !== todayISO) return { ok: true };
  const start = slotStart(dateISO, hour);
  if (start <= now) return { ok: false, why: "lewat" };
  if (start - now < minLeadMinutes * 60_000) return { ok: false, why: "terlalu-dekat" };
  return { ok: true };
}

/** Sesi berikutnya pada meja ini setelah `after` — dipakai untuk membatasi walk-in & perpanjangan. */
export function nextSessionOn(
  sessions: LiveSession[],
  tableId: string,
  after: number,
): LiveSession | null {
  const upcoming = sessions
    .filter((s) => s.tableId === tableId && (s.status === "booked" || s.status === "hold") && s.startsAt > after)
    .sort((a, b) => a.startsAt - b.startsAt);
  return upcoming[0] ?? null;
}

/** Berapa menit tersisa sebelum booking berikutnya menabrak. Infinity kalau bebas. */
export function minutesUntilNext(
  sessions: LiveSession[],
  tableId: string,
  from: number,
): number {
  const nx = nextSessionOn(sessions, tableId, from);
  return nx ? Math.floor((nx.startsAt - from) / 60_000) : Infinity;
}

/** Meja bebas untuk rentang waktu tertentu? Dipakai walk-in, extend, dan relokasi. */
export function tableFreeForRange(
  sessions: LiveSession[],
  tableId: string,
  start: number,
  end: number,
  ignoreSessionId?: string,
  now = Date.now(),
): boolean {
  // Sesi baru juga menyisakan buffer setelahnya, jadi kedua sisi dibandingkan
  // dalam bentuk rentang terblokir — bukan rentang tagihan.
  const myEnd = end + TURNAROUND_MIN * 60_000;
  return !sessions.some(
    (s) =>
      s.tableId === tableId &&
      isActive(s) &&
      s.id !== ignoreSessionId &&
      overlaps(s.startsAt, blockEndOf(s, now), start, myEnd),
  );
}

/* ── Peringatan tabrakan (PRD KK-08) ───────────────────────────────
   Kejadian nomor satu di lantai: tamu walk-in belum selesai padahal
   pemesan online sudah berdiri di depan kasir. */

export type Clash = {
  running: LiveSession;
  next: LiveSession;
  minutesLeft: number;   // sisa waktu sesi berjalan (bisa negatif = sudah lewat)
  level: "T10" | "T3" | "OVER";
};

export function findClashes(sessions: LiveSession[], now = Date.now()): Clash[] {
  const out: Clash[] = [];
  for (const s of sessions) {
    if (s.status !== "running") continue;
    const nx = nextSessionOn(sessions, s.tableId, s.startsAt);
    if (!nx) continue;

    let minutesLeft: number;
    if (isOpenBill(s)) {
      // Open bill: tidak ada jam selesai. Yang penting adalah berapa lama lagi
      // pemesan berikutnya datang, dikurangi waktu bersih-bersih meja.
      minutesLeft = Math.floor((nx.startsAt - TURNAROUND_MIN * 60_000 - now) / 60_000);
    } else {
      // Sesi prabayar: hanya relevan kalau booking berikutnya mepet dengan akhirnya
      const gapMin = Math.floor((nx.startsAt - blockEndOf(s, now)) / 60_000);
      if (gapMin > 15) continue;
      minutesLeft = Math.floor((s.endsAt - now) / 60_000);
    }
    if (minutesLeft > 10) continue;

    out.push({
      running: s,
      next: nx,
      minutesLeft,
      level: minutesLeft < 0 ? "OVER" : minutesLeft <= 3 ? "T3" : "T10",
    });
  }
  return out.sort((a, b) => a.minutesLeft - b.minutesLeft);
}
