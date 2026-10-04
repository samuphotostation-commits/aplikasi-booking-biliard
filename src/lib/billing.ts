import { OPEN_HOUR, rateForHour, type Rates, type TableType } from "../data/venue";
// Jam & hari SELALU dibaca dalam WIB, tidak ikut zona perangkat — lihat occupancy.ts.
import { diWib } from "./occupancy";

/* ═══════════════════════════════════════════════════════════════════
   PERHITUNGAN UANG BILIAR
   Dua model yang sengaja dibedakan:

   1. RESERVASI ONLINE — dibayar di muka dalam blok jam penuh.
      Pelanggan membeli kepastian slot, bukan meteran. Lihat
      `sessionPrice()` di data/venue.ts.

   2. OPEN BILL DI LANTAI — meteran berjalan. Minimum 30 menit,
      sesudahnya dihitung PER MENIT sampai kasir menutup tab.
      Itulah fungsi di berkas ini.

   Tarif berubah pukul 18.00, jadi perhitungan per menit TIDAK boleh
   memakai satu tarif untuk seluruh sesi — harus dipotong per segmen jam.
   ═══════════════════════════════════════════════════════════════════ */

/** Menit minimum yang tetap ditagih walau tamu baru main sebentar. */
export const MIN_BILLED_MINUTES = 30;

/**
 * TOLERANSI BATAL (permintaan pemilik). Meja yang baru dibuka lalu ditutup
 * dalam 5 menit pertama TIDAK ditagih — tamu salah meja, bolanya kurang, atau
 * berubah pikiran. Lewat menit ke-5, tagihan langsung dihitung 30 menit penuh.
 */
export const GRACE_MINUTES = 5;

/** Pembulatan ke atas ke kelipatan rupiah terdekat — memudahkan kembalian tunai. */
export const ROUND_TO = 500;

export const roundRupiah = (n: number) => Math.ceil(n / ROUND_TO) * ROUND_TO;

/** Indeks jam operasional dari sebuah timestamp: 11..25, dan 02.00–10.59 menjadi 26..34
 *  supaya waktu setelah lewat tengah malam tetap bertarif malam, bukan siang. */
function hourIndexOf(ts: number): number {
  const h = diWib(ts).getUTCHours();
  return h < OPEN_HOUR ? h + 24 : h;
}

/** Awal jam berikutnya setelah `ts`. */
function nextHourBoundary(ts: number): number {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime() + 3_600_000;
}

export type BillBreakdown = {
  /** Menit yang benar-benar dimainkan. */
  playedMinutes: number;
  /** Menit yang ditagih (0 dalam masa toleransi, sesudahnya minimum 30). */
  billedMinutes: number;
  /** Apakah tagihan naik karena aturan minimum. */
  minimumApplied: boolean;
  /** Masih dalam 5 menit pertama: tidak ditagih sama sekali. */
  graceApplied: boolean;
  /** Rincian per segmen tarif, untuk ditunjukkan ke tamu. */
  segments: { fromHour: number; minutes: number; ratePerHour: number; amount: number }[];
  /** Sebelum pembulatan. */
  rawAmount: number;
  /** Yang ditagih. */
  amount: number;
};

/**
 * Hitung tagihan meja untuk open bill.
 *
 * Contoh: mulai 17.40, tutup 18.20 (40 menit).
 *   17.40–18.00 = 20 menit @ Rp 29.000/jam = Rp  9.667
 *   18.00–18.20 = 20 menit @ Rp 39.000/jam = Rp 13.000
 *   total Rp 22.667 -> dibulatkan Rp 23.000
 */
export function billOpenSession(
  type: TableType,
  startsAt: number,
  endsAt: number,
  rates?: Rates,
): BillBreakdown {
  const playedMs = Math.max(0, endsAt - startsAt);
  const playedMinutes = Math.ceil(playedMs / 60_000);
  // Meja resto tidak punya meteran waktu — yang ditagih hanya makanannya.
  if (type === "resto") {
    return { playedMinutes, billedMinutes: 0, minimumApplied: false, graceApplied: false, segments: [], rawAmount: 0, amount: 0 };
  }
  // Toleransi batal: 5 menit pertama gratis, sesudahnya langsung 30 menit.
  if (playedMinutes <= GRACE_MINUTES) {
    return { playedMinutes, billedMinutes: 0, minimumApplied: false, graceApplied: true, segments: [], rawAmount: 0, amount: 0 };
  }
  const billedMinutes = Math.max(MIN_BILLED_MINUTES, playedMinutes);
  const billedEnd = startsAt + billedMinutes * 60_000;

  const segments: BillBreakdown["segments"] = [];
  let cursor = startsAt;
  // Dijumlah sebagai bilangan bulat (tarif × milidetik). Menjumlah pecahan
  // (tarif/60 × menit) menumpuk galat desimal: 35.000/jam × 54 menit menjadi
  // 31.500,000…04 dan pembulatan ke atas menagih Rp 500 lebih.
  let rateMs = 0;

  // Setiap putaran maju ke batas jam berikutnya, jadi pasti selesai. Batasnya
  // dihitung dari lamanya sesi — BUKAN angka tetap: tab yang lupa ditutup lebih
  // dari 2 hari dulu berhenti dihitung di jam ke-48 (tamu tidak ditagih sisanya).
  const maxSegments = Math.ceil(billedMinutes / 60) + 2;
  let guard = 0;
  while (cursor < billedEnd && guard++ < maxSegments) {
    const h = hourIndexOf(cursor);
    const segEnd = Math.min(nextHourBoundary(cursor), billedEnd);
    const ms = segEnd - cursor;
    const perHour = rateOf(type, h, rates);

    segments.push({ fromHour: h, minutes: Math.round((ms / 60_000) * 100) / 100, ratePerHour: perHour, amount: (perHour * ms) / 3_600_000 });
    rateMs += perHour * ms;
    cursor = segEnd;
  }

  return {
    playedMinutes,
    billedMinutes,
    minimumApplied: playedMinutes < MIN_BILLED_MINUTES,
    graceApplied: false,
    segments,
    rawAmount: Math.round(rateMs / 3_600_000),
    amount: Math.ceil(rateMs / (3_600_000 * ROUND_TO)) * ROUND_TO,
  };
}

function rateOf(type: TableType, hour: number, rates?: Rates): number {
  if (!rates) return rateForHour(type, hour);
  if (type === "resto") return 0;
  if (type === "vip") return rates.vip;
  if (type === "vvip") return rates.vvip ?? rates.vip;
  return hour < 18 ? rates.regularDay : rates.regularNight;
}

/* ── Promo ──────────────────────────────────────────────────────── */

export type PromoScope = "billiard" | "fnb" | "all";

export type Promo = {
  id: string;
  code: string;
  name: string;
  kind: "percent" | "fixed";
  value: number;              // persen (0-100) atau rupiah
  scope: PromoScope;
  daysOfWeek: number[];       // 0=Minggu
  startHour: number;          // indeks jam operasional
  endHour: number;
  minSpend: number;
  maxDiscount: number;        // 0 = tanpa batas
  active: boolean;
  autoApply: boolean;         // true = happy hour, tidak perlu kode
};

/**
 * Hari promo mengikuti HARI OPERASIONAL (batas 02.00, PRD KK-19), bukan tanggal
 * kalender: pukul 01.00 Minggu dini hari masih "Sabtu malam" bagi tamu dan kasir.
 */
export const businessDow = (at: number) => diWib(at - 2 * 3_600_000).getUTCDay();

export function promoApplies(p: Promo, at: number, dow = businessDow(at)): boolean {
  if (!p.active) return false;
  if (!p.daysOfWeek.includes(dow)) return false;
  const h = hourIndexOf(at);
  return h >= p.startHour && h < p.endHour;
}

/** Diskon untuk satu promo terhadap subtotal biliar & F&B. */
export function discountOf(p: Promo, billiard: number, fnb: number): number {
  const base = p.scope === "billiard" ? billiard : p.scope === "fnb" ? fnb : billiard + fnb;
  if (base < p.minSpend) return 0;
  const raw = p.kind === "percent" ? (base * p.value) / 100 : p.value;
  const capped = p.maxDiscount > 0 ? Math.min(raw, p.maxDiscount) : raw;
  return Math.min(base, Math.floor(capped));
}

/**
 * Promo terbaik yang berlaku. Sengaja TIDAK menumpuk beberapa promo —
 * diskon bertumpuk adalah sumber kebocoran margin yang paling sulit dilacak.
 */
export function bestPromo(
  promos: Promo[],
  billiard: number,
  fnb: number,
  at = Date.now(),
  manualCode?: string,
): { promo: Promo; discount: number } | null {
  const dow = businessDow(at);
  const pool = promos.filter(
    (p) =>
      promoApplies(p, at, dow) &&
      (p.autoApply || (manualCode && p.code.toUpperCase() === manualCode.toUpperCase())),
  );
  let best: { promo: Promo; discount: number } | null = null;
  for (const p of pool) {
    const d = discountOf(p, billiard, fnb);
    if (d > 0 && (!best || d > best.discount)) best = { promo: p, discount: d };
  }
  return best;
}
