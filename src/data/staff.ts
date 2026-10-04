import type { Promo } from "../lib/billing";

/* ═══════════════════════════════════════════════════════════════════
   DUA TINGKAT AKSES (permintaan pemilik).

   superadmin — pemilik/manajer. Semua akses: laporan keuangan, promo,
                tarif, stok, void tanpa persetujuan, kelola karyawan.
   karyawan   — kasir/pramusaji. Hanya jual-beli: buka meja, open bill,
                order F&B, tutup tab, tandai menu habis.
                TIDAK bisa melihat laba, mengubah harga, atau void sendiri.

   Void oleh karyawan WAJIB disetujui superadmin. Itu kontrol kebocoran
   kas yang paling menentukan di usaha tunai.
   ═══════════════════════════════════════════════════════════════════ */

export type Role = "karyawan" | "superadmin";

export type Employee = {
  id: string;
  name: string;
  pin: string;
  role: Role;
  active: boolean;
  /** Email yang ditautkan supaya orang ini bisa masuk tanpa PIN (lihat supabase/schema-email.sql). */
  email?: string;
};

export const EMPLOYEES: Employee[] = [
  { id: "u-owner", name: "Pak Budi (Pemilik)", pin: "9999", role: "superadmin", active: true },
  { id: "u-manager", name: "Sinta (Manajer)", pin: "8888", role: "superadmin", active: true },
  { id: "u-rian", name: "Rian", pin: "1234", role: "karyawan", active: true },
  { id: "u-yoga", name: "Yoga", pin: "2345", role: "karyawan", active: true },
  { id: "u-dewi", name: "Dewi", pin: "3456", role: "karyawan", active: true },
];

/** Apa yang boleh dilakukan tiap peran. Dipakai untuk menyembunyikan tab
 *  DAN menolak aksi — jangan pernah hanya menyembunyikan tombol. */
export const CAN = {
  lihatLaporanKeuangan: ["superadmin"],
  ubahTarif: ["superadmin"],
  kelolaPromo: ["superadmin"],
  kelolaStok: ["superadmin"],
  kelolaMeja: ["superadmin"],
  kelolaKaryawan: ["superadmin"],
  setujuiVoid: ["superadmin"],
  beriDiskonManual: ["superadmin"],
  bukaMeja: ["superadmin", "karyawan"],
  koreksiPesanan: ["superadmin", "karyawan"],
  koreksiWaktu: ["superadmin"],
  tutupTab: ["superadmin", "karyawan"],
  orderFnb: ["superadmin", "karyawan"],
  tandaiHabis: ["superadmin", "karyawan"],
  kontrolLampu: ["superadmin", "karyawan"],
  ajukanVoid: ["superadmin", "karyawan"],
} as const;

export type Permission = keyof typeof CAN;

export const can = (role: Role | null, p: Permission): boolean =>
  !!role && (CAN[p] as readonly string[]).includes(role);

/* ── Shift ──────────────────────────────────────────────────────── */

export type Shift = {
  id: string;
  employeeId: string;
  employeeName: string;
  openedAt: number;
  closedAt?: number;
  /** Modal awal laci. */
  openingCash: number;
  /** Uang tunai yang benar-benar dihitung saat tutup shift. */
  countedCash?: number;
  /** Selisih hitung vs sistem — ini angka yang paling dilihat pemilik. */
  variance?: number;
};

/* ── Void ───────────────────────────────────────────────────────── */

export type VoidRequest = {
  id: string;
  at: number;
  byId: string;
  byName: string;
  /** pesanan = pesanan takeaway yang sudah dibayar online (belum diambil). */
  targetKind: "sesi" | "item" | "pesanan";
  targetId: string;
  label: string;
  amount: number;
  reason: string;
  status: "menunggu" | "disetujui" | "ditolak";
  decidedBy?: string;
  decidedAt?: number;
};

export const VOID_REASONS = [
  "Salah input",
  "Tamu batal",
  "Pesanan salah dibuat",
  "Barang habis",
  "Komplain tamu",
  "Meja bermasalah",
];

/* ── Promo bawaan ───────────────────────────────────────────────── */

export const SEED_PROMOS: Promo[] = [
  {
    id: "p-happy", code: "HAPPY", name: "Happy Hour Siang",
    kind: "percent", value: 20, scope: "billiard",
    daysOfWeek: [1, 2, 3, 4, 5], startHour: 11, endHour: 16,
    minSpend: 0, maxDiscount: 0, active: true, autoApply: true,
  },
  {
    id: "p-combo", code: "COMBO50", name: "Diskon F&B Rp 15.000",
    kind: "fixed", value: 15_000, scope: "fnb",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startHour: 11, endHour: 26,
    minSpend: 100_000, maxDiscount: 0, active: true, autoApply: false,
  },
  {
    id: "p-weekend", code: "MALAM10", name: "Diskon Malam Akhir Pekan",
    kind: "percent", value: 10, scope: "all",
    daysOfWeek: [5, 6], startHour: 21, endHour: 26,
    minSpend: 150_000, maxDiscount: 50_000, active: false, autoApply: true,
  },
];

/* ── Stok barang ────────────────────────────────────────────────── */

export type StockRow = {
  itemId: string;
  /** null = tidak dilacak stoknya (mis. kopi yang dibuat per pesanan). */
  qty: number | null;
  lowAt: number;
};

/** Hanya barang jadi/botolan yang masuk hitungan stok. Masakan dapur
 *  dibuat per pesanan, jadi cukup ditandai habis manual. */
export const SEED_STOCK: StockRow[] = [
  { itemId: "cd-01", qty: 120, lowAt: 24 },
  { itemId: "cd-02", qty: 40, lowAt: 12 },
  { itemId: "cd-03", qty: 36, lowAt: 12 },
  { itemId: "cd-06", qty: 30, lowAt: 12 },
  { itemId: "cd-07", qty: 18, lowAt: 12 },
  { itemId: "cd-10", qty: 8, lowAt: 12 },
  { itemId: "lb-01", qty: 25, lowAt: 10 },
  { itemId: "lb-04", qty: 60, lowAt: 20 },
  { itemId: "lb-06", qty: 14, lowAt: 10 },
  { itemId: "lb-09", qty: 6, lowAt: 8 },
  { itemId: "td-01", qty: 22, lowAt: 10 },
  { itemId: "ib-01", qty: 3, lowAt: 6 },
];
