import type { CartLine } from "../lib/store";
import { TABLES, type Rates, type TableType } from "./venue";

/* Sesi meja yang hidup di lantai — baik dari booking online maupun
   walk-in yang dibuka kasir. Ini sumber kebenaran papan meja.
   Nanti dipetakan 1:1 ke tabel `bookings` di Supabase (PRD §8.3). */

/** noshow = booking online yang tidak datang; dilepas otomatis, prabayarnya tetap pendapatan.
 *  hold   = slot ditahan selama pelanggan membayar QRIS (PRD KK-04: 15/17/19 menit). */
export type LiveStatus = "hold" | "booked" | "running" | "done" | "maintenance" | "noshow";
export type PayChannel = "qris_online" | "cash" | "edc";

/** Satu kali bayar SEBAGIAN di kasir (split bill / bayar per orang).
 *  Sisanya tetap di bill meja sampai tab ditutup. */
export type Payment = {
  id: string;
  at: number;
  channel: PayChannel;
  amount: number;
  /** Shift tempat uangnya diterima — dasar hitung kas laci. */
  shiftId?: string;
  by?: string;
  /** Kalau bayar per pesanan: kunci baris yang dilunasi orang ini. */
  keys?: string[];
  /** Mis. "Orang 2" atau nama yang ditulis kasir. */
  label?: string;
};

export type LiveSession = {
  id: string;
  tableId: string;
  source: "online" | "walkin";
  guest: string;
  phone?: string;
  startsAt: number;
  endsAt: number;
  status: LiveStatus;
  bookingCode?: string;
  checkin?: string;
  fnb: CartLine[];
  tableAmount: number;
  paidOnline: number;
  settledChannel?: PayChannel;
  settledAmount?: number;
  /** Pecahan tagihan saat ditutup — dipakai laporan terpisah biliar vs F&B. */
  settledBilliard?: number;
  settledFnb?: number;
  settledDiscount?: number;
  /** Kapan tab ditutup / no-show dilepas — dasar rekap per hari operasional. */
  settledAt?: number;
  /** Shift tempat uangnya diterima — dasar hitung kas laci per shift. */
  settledShiftId?: string;
  /** Tambahan tagihan dari perpanjangan booking online (dibayar di kasir). */
  extraTable?: number;
  /** Paket Siang: sisa jatah minuman gratis. */
  freeDrinks?: number;
  paket?: "siang";
  /** Pesanan prabayar milik tamu no-show — dipindah ke sini supaya stok kembali. */
  noShowFnb?: CartLine[];
  /** Hold: kapan slot dilepas bila pembayaran tidak masuk (T+19). */
  holdUntil?: number;
  /** Hold: pesanan yang harganya dibekukan saat QR dibuat — baru jadi `fnb` setelah lunas. */
  holdLines?: CartLine[];
  /** Open bill: tarif saat meja dibuka. Perubahan tarif tidak mengubah waktu yang sudah dimainkan. */
  rates?: Rates;
  /** Kelas meja saat sesi dibuka (reguler/VIP/VVIP/resto) — dibekukan supaya
   *  mengubah kelas meja tidak menagih ulang tamu yang sedang main. */
  tableType?: TableType;
  /** Open bill: jam meteran dihentikan (aplikasi/komputer mati, atau dikoreksi superadmin). */
  stoppedAt?: number;
  /** Pembayaran sebagian (split bill) yang sudah diterima kasir. */
  payments?: Payment[];
  /** Reservasi resto: jumlah orang. */
  pax?: number;
  /** Buka meja PAKET PER JAM (bukan meteran): lama blok yang dibeli tamu di kasir. */
  blockHours?: number;
  /** Booking: kapan mejanya benar-benar siap setelah jam mulai (bookingnya dipindah meja, atau
   *  sesi yang menghalanginya dipindah/di-void). Hitungan 20 menit no-show dimulai dari sini. */
  readyAt?: number;
  note?: string;
};

export type Ticket = {
  id: string;
  sessionId: string;
  tableName: string;
  itemId: string;
  name: string;
  qty: number;
  variant?: string;
  station: "kitchen" | "bar";
  status: "new" | "preparing" | "ready" | "served";
  at: number;
  /** Asal pesanan bila bukan dari kasir, mis. "QR · Andi" atau "Takeaway · Sari". */
  via?: string;
  /** Kunci baris bill/pesanan yang diwakili tiket ini — void menghapus tiket baris yang TEPAT. */
  lineKey?: string;
};

/* ── Seed deterministik ────────────────────────────────────────────
   Supaya papan meja tidak kosong saat pertama dibuka dan kasir bisa
   melihat bentuk aslinya. Diganti data Supabase saat backend siap. */

const NAMES = [
  "Andi", "Dina", "Rizky", "Sari", "Bagus", "Tari", "Fajar", "Nisa",
  "Yoga", "Putri", "Hendra", "Maya", "Doni", "Lisa",
];

function seededRand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

/** Tarif contoh per kelas meja — hanya untuk data pembuka papan. */
const seedRate = (type: TableType) => (type === "vvip" ? 60_000 : type === "vip" ? 50_000 : 39_000);

export function seedSessions(now = Date.now()): LiveSession[] {
  const rnd = seededRand("spl-board-v1");
  const out: LiveSession[] = [];
  const HOUR = 3_600_000;

  // Meja resto tidak ikut data contoh biliar — isinya reservasi, bukan meteran jam.
  for (const t of TABLES.filter((x) => x.type !== "resto")) {
    const r = rnd();

    if (r < 0.06) {
      out.push({
        id: `m-${t.id}`, tableId: t.id, source: "walkin", guest: "—",
        startsAt: now, endsAt: now + 24 * HOUR, status: "maintenance",
        fnb: [], tableAmount: 0, paidOnline: 0,
        note: "Kain meja sobek",
      });
      continue;
    }

    // Sedang dipakai
    if (r < 0.5) {
      const elapsed = Math.floor(rnd() * 90) * 60_000;
      const dur = (1 + Math.floor(rnd() * 3)) * HOUR;
      const online = rnd() < 0.45;
      out.push({
        id: `s-${t.id}`, tableId: t.id,
        source: online ? "online" : "walkin",
        guest: NAMES[Math.floor(rnd() * NAMES.length)],
        startsAt: now - elapsed,
        endsAt: now - elapsed + dur,
        status: "running",
        bookingCode: online ? `SPL-${t.id}${Math.floor(rnd() * 900 + 100)}` : undefined,
        fnb: [],
        tableType: t.type,
        tableAmount: seedRate(t.type) * (dur / HOUR),
        paidOnline: online ? seedRate(t.type) * (dur / HOUR) : 0,
      });
      continue;
    }

    // Booking yang akan datang
    if (r < 0.62) {
      const inMin = (10 + Math.floor(rnd() * 100)) * 60_000;
      out.push({
        id: `b-${t.id}`, tableId: t.id, source: "online",
        guest: NAMES[Math.floor(rnd() * NAMES.length)],
        startsAt: now + inMin,
        endsAt: now + inMin + 2 * HOUR,
        status: "booked",
        bookingCode: `SPL-${t.id}${Math.floor(rnd() * 900 + 100)}`,
        checkin: String(Math.floor(100000 + rnd() * 899999)),
        fnb: [], tableType: t.type, tableAmount: seedRate(t.type) * 2,
        paidOnline: seedRate(t.type) * 2,
      });
    }
  }

  // Satu skenario tabrakan yang SENGAJA dipasang, supaya kasir bisa melihat
  // bentuk peringatan T-10 tanpa harus menunggu kejadian nyata (PRD KK-08):
  // walk-in di Meja 7 habis 6 menit lagi, sementara pemesan online sudah
  // dijadwalkan masuk 11 menit lagi.
  const CLASH_TABLE = "T07";
  const cleaned = out.filter((s) => s.tableId !== CLASH_TABLE);
  cleaned.push(
    {
      id: "clash-run", tableId: CLASH_TABLE, source: "walkin", guest: "Fajar",
      startsAt: now - 114 * 60_000, endsAt: now + 6 * 60_000, status: "running",
      fnb: [], tableAmount: 78_000, paidOnline: 0,
    },
    {
      id: "clash-next", tableId: CLASH_TABLE, source: "online", guest: "Dina",
      startsAt: now + 11 * 60_000, endsAt: now + 131 * 60_000, status: "booked",
      bookingCode: "SPL-4KQ7M2", checkin: "418203",
      fnb: [], tableAmount: 78_000, paidOnline: 78_000,
    },
  );
  return cleaned;
}

export function seedTickets(sessions: LiveSession[], now = Date.now()): Ticket[] {
  const rnd = seededRand("spl-tickets-v1");
  const pool = [
    { id: "lb-04", name: "Kentang Goreng", station: "kitchen" as const },
    { id: "sa-01", name: "Ayam Asap Sambal Pecel", station: "kitchen" as const },
    { id: "cf-06", name: "Kopi Susu Creamy", station: "bar" as const },
    { id: "mk-05", name: "Strawbery Mojito", station: "bar" as const },
    { id: "fr-04", name: "Nasi Goreng Special Smoked House", station: "kitchen" as const },
    { id: "cd-01", name: "Ice Tea", station: "bar" as const },
  ];
  const running = sessions.filter((s) => s.status === "running");
  const out: Ticket[] = [];
  running.slice(0, 7).forEach((s, i) => {
    const p = pool[Math.floor(rnd() * pool.length)];
    const table = TABLES.find((t) => t.id === s.tableId)!;
    out.push({
      id: `tk-${i}`, sessionId: s.id, tableName: table.name,
      itemId: p.id, name: p.name, qty: 1 + Math.floor(rnd() * 2),
      station: p.station,
      status: (["new", "new", "preparing", "ready"] as const)[Math.floor(rnd() * 4)],
      at: now - Math.floor(rnd() * 22) * 60_000,
    });
  });
  return out;
}
