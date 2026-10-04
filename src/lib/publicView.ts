/* ═══════════════════════════════════════════════════════════════════
   TAMPILAN PUBLIK — apa yang boleh dibaca HP pelanggan

   HP pelanggan TIDAK boleh menerima jejak venue: di dalamnya ada nama dan
   nomor HP tamu lain, kode booking, kode check-in, dan angka uang. Yang
   dibutuhkan halaman booking hanya: meja mana terpakai jam berapa, tarif,
   harga menu, apa yang habis, dan promo yang berlaku.

   Fungsi di sini memotong state menjadi bentuk itu — dan uji
   `test/remote.test.ts` memastikan tidak ada satu pun data pribadi yang
   ikut terbawa. Di tahap S2, inilah bentuk yang disajikan tampilan publik
   Supabase (tanpa perlu hak baca ke tabel jejak).
   ═══════════════════════════════════════════════════════════════════ */
import type { LiveSession } from "../data/live";
import type { State } from "./engine";
import { isOpenBill } from "./occupancy";
import type { LiveStatus } from "../data/live";

/** Satu pemakaian meja, tanpa identitas siapa pun. */
export type PublicSlot = {
  tableId: string;
  startsAt: number;
  endsAt: number;
  /** "hold" = sedang dibayar orang lain; slotnya tertahan sampai `until`. */
  status: Extract<LiveStatus, "booked" | "hold" | "running">;
  until?: number;
  /**
   * Meja ini sedang open bill: tamunya masih main TANPA jam selesai. Bukan data
   * pribadi (tidak ada nama/uang), tapi wajib ikut supaya HP pelanggan tahu meja
   * itu tidak bisa dipesan malam itu — kalau tidak, layar tamu menawarkan meja
   * yang kenyataannya masih terpakai.
   */
  openBill?: true;
};

export type PublicVenue = {
  at: number;
  slots: PublicSlot[];
  soldOut: string[];
  rates: State["rates"];
  /** Kelas tiap meja yang diubah pemilik (VIP ↔ VVIP) — menentukan tarif yang dilihat tamu. */
  tableTypes: State["tableTypes"];
  menuPrices: State["menuPrices"];
  promos: State["promos"];
};

/**
 * KEBALIKAN `publicVenue`: slot publik dikembalikan jadi sesi yang bisa dibaca
 * aturan ketersediaan (occupancy.ts) persis seperti di perangkat kasir.
 *
 * Ditaruh di sini, bersebelahan dengan yang memotongnya, supaya kedua arah
 * tidak bisa pelan-pelan berbeda — dan supaya bisa diuji langsung. Dulu
 * pemetaan ini bersembunyi di dalam customerStore dan tidak pernah teruji:
 * yang diuji cuma "flag open bill ikut terkirim", bukan "mejanya benar-benar
 * tidak ditawarkan ke tamu".
 */
export function sesiDariSlot(slots: PublicSlot[]): LiveSession[] {
  return slots.map((s, i) => ({
    id: `pub-${i}`,
    tableId: s.tableId,
    // Open bill ditandai sebagai walk-in tanpa jam selesai supaya aturan
    // ketersediaan di HP pelanggan sama persis dengan di perangkat kasir.
    source: s.openBill ? "walkin" : "online",
    guest: "—",                      // identitas tamu lain memang tidak dikirim
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    status: s.status,
    fnb: [],
    tableAmount: 0,
    paidOnline: 0,
    ...(s.until ? { holdUntil: s.until } : {}),
  }));
}

/** Slot yang masih memengaruhi ketersediaan: yang sudah selesai/hangus tidak perlu dikirim. */
const LIVE: LiveStatus[] = ["booked", "hold", "running"];

/**
 * Potongan state yang boleh dibaca siapa pun. Tidak memuat nama, nomor HP,
 * kode booking/check-in, pesanan, maupun angka uang tamu lain.
 */
export function publicVenue(s: State, now: number, days = 14): PublicVenue {
  const until = now + days * 24 * 60 * 60_000;
  const slots: PublicSlot[] = [];
  for (const x of s.sessions) {
    if (!LIVE.includes(x.status) || x.endsAt < now - 24 * 60 * 60_000 || x.startsAt > until) continue;
    slots.push({
      tableId: x.tableId,
      startsAt: x.startsAt,
      endsAt: x.endsAt,
      status: x.status as PublicSlot["status"],
      ...(x.status === "hold" && x.holdUntil !== undefined ? { until: x.holdUntil } : {}),
      ...(isOpenBill(x) ? { openBill: true as const } : {}),
    });
  }
  return {
    at: now,
    slots,
    soldOut: [...s.soldOut],
    rates: { ...s.rates },
    tableTypes: { ...(s.tableTypes ?? {}) },
    menuPrices: { ...s.menuPrices },
    promos: s.promos.map((p) => ({ ...p })),
  };
}
