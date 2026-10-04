// Data meja & tarif — angka nyata dari pemilik dan PRICELIST BILLIARD.pdf.
// 46 meja: 30 biliar reguler + 2 VIP (no smoking) + 2 VVIP (bebas) + 12 meja resto.

/** Kelas meja. Tarifnya dibedakan per kelas, dan kelas tiap meja bisa diubah
 *  superadmin di tab Atur (tersimpan di `State.tableTypes`). */
export type TableType = "regular" | "vip" | "vvip" | "resto";

export type PoolTable = {
  id: string;
  no: number;
  name: string;
  type: TableType;
  capacity: number;
};

export const BILLIARD_TYPES: TableType[] = ["regular", "vip", "vvip"];

/** Nama kelas untuk layar — satu sumber supaya kasir & pelanggan menyebutnya sama. */
export const CLASS_LABEL: Record<TableType, string> = {
  regular: "Reguler",
  vip: "VIP (no smoking)",
  vvip: "VVIP (bebas rokok)",
  resto: "Meja resto",
};
export const CLASS_SHORT: Record<TableType, string> = {
  regular: "Reg", vip: "VIP", vvip: "VVIP", resto: "Resto",
};

/** Label pendek meja di layar: 12 (reguler), V3 (VIP/VVIP), R5 (resto). */
export const tableLabel = (type: TableType, no: number) =>
  type === "resto" ? `R${no}` : type === "regular" ? String(no) : `V${no}`;

export const TABLES: PoolTable[] = [
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `T${String(i + 1).padStart(2, "0")}`,
    no: i + 1,
    name: `Meja ${i + 1}`,
    type: "regular" as const,
    capacity: 4,
  })),
  // VIP 1–2 no smoking · VIP 3–4 bebas rokok (VVIP). Kelas tiap ruang bisa
  // ditukar di tab Atur tanpa mengubah kode.
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `V${String(i + 1).padStart(2, "0")}`,
    no: i + 1,
    name: `VIP ${i + 1}`,
    type: (i < 2 ? "vip" : "vvip") as TableType,
    capacity: 8,
  })),
  // Meja Smokehouse Resto: tidak ada meteran jam, hanya tempat duduk +
  // bill makanan. Bisa direservasi tamu lewat aplikasi.
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `R${String(i + 1).padStart(2, "0")}`,
    no: i + 1,
    name: `Resto ${i + 1}`,
    type: "resto" as const,
    capacity: i < 8 ? 4 : 8,
  })),
];

export const BILLIARD_TABLES = TABLES.filter((t) => t.type !== "resto");
export const RESTO_TABLES = TABLES.filter((t) => t.type === "resto");

export const TABLE_COUNT = {
  regular: TABLES.filter((t) => t.type === "regular").length,
  vip: TABLES.filter((t) => t.type === "vip").length,
  vvip: TABLES.filter((t) => t.type === "vvip").length,
  resto: RESTO_TABLES.length,
  total: TABLES.length,
};

/* ── Tarif (PRICELIST BILLIARD.pdf) ────────────────────────────────
   Reguler  11.00–18.00  Rp 29.000 / jam
   Reguler  18.00–tutup  Rp 39.000 / jam
   VIP Room (no smoking) Rp 50.000 / jam
   VVIP (bebas rokok)    Rp 60.000 / jam   [PERLU KONFIRMASI — ubah di tab Atur]
   Meja resto            tanpa sewa waktu (Rp 0), hanya bill makanan
   Paket Siang           Rp 50.000  (2 jam + 2 minuman, sampai 16.00) */

export const OPEN_HOUR = 11;
export const CLOSE_HOUR = 26; // 02:00 dini hari = jam ke-26 hari operasional (PRD KK-19)
export const DAY_RATE_END = 18;

export const RATES = {
  regularDay: 29_000,
  regularNight: 39_000,
  vip: 50_000,
  vvip: 60_000,
} as const;

export type Rates = { regularDay: number; regularNight: number; vip: number; vvip: number };

export const PAKET_SIANG = {
  id: "paket-siang",
  name: "Paket Siang",
  price: 50_000,
  hours: 2,
  perks: ["Gratis 2 jam main", "Gratis 2 minuman"],
  lastStartHour: 16, // hanya bisa dipesan untuk mulai sampai jam 16.00
};

/** Tarif per jam untuk satu jam yang dimulai pada `hour` (11..25). */
export function rateForHour(type: TableType, hour: number): number {
  if (type === "resto") return 0;
  if (type === "vip") return RATES.vip;
  if (type === "vvip") return RATES.vvip;
  return hour < DAY_RATE_END ? RATES.regularDay : RATES.regularNight;
}

/**
 * Harga sesi dihitung PER JAM YANG DILEWATI, bukan tarif tunggal —
 * sesi 17.00–19.00 melintasi batas 18.00 sehingga jam pertama Rp 29.000
 * dan jam kedua Rp 39.000. Menghitungnya dengan satu tarif akan salah tagih.
 */
export function sessionPrice(type: TableType, startHour: number, hours: number): number {
  let total = 0;
  for (let h = 0; h < hours; h++) total += rateForHour(type, startHour + h);
  return total;
}

/** Rincian per jam, untuk ditampilkan supaya pelanggan paham angkanya. */
export function priceBreakdown(type: TableType, startHour: number, hours: number) {
  return Array.from({ length: hours }, (_, h) => ({
    hour: startHour + h,
    rate: rateForHour(type, startHour + h),
  }));
}

export const HOURS: number[] = Array.from(
  { length: CLOSE_HOUR - OPEN_HOUR },
  (_, i) => OPEN_HOUR + i,
);

/** 25 → "01.00", 11 → "11.00" */
export const fmtHour = (h: number) => `${String(h % 24).padStart(2, "0")}.00`;

export const VENUE = {
  name: "SPL — Sports Pool Lounge",
  resto: "Smokehouse Resto",
  ig: "https://www.instagram.com/sportspoollounge/",
  holdMinutes: 15, // PRD KK-04: countdown yang dilihat pelanggan
};

/** Ketentuan booking yang ditampilkan ke tamu (permintaan pemilik). */
export const BOOKING_TERMS = [
  "Booking yang sudah dibayar tidak bisa dibatalkan dan tidak bisa diganti jadwalnya.",
  "Datang paling lambat 20 menit setelah jam mulai — lewat itu meja dilepas untuk tamu lain dan pembayaran hangus.",
  "Waktu main dihitung dari jam booking, bukan dari jam kedatangan.",
];
