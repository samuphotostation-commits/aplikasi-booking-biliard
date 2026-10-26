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

/**
 * PERAN STAF — tujuh jenis, sesuai diagram roadmap 8 Okt 2026.
 *
 * `karyawan` DIPERTAHANKAN sebagai peran lama: jejak venue menyimpan peran di
 * dalam kejadiannya, jadi kalau nilai itu dibuang, seluruh riwayat staf lama
 * tidak bisa diputar ulang. Haknya dibuat persis sama dengan `kru_kasir`,
 * jadi tidak ada yang berubah untuk akun yang sudah ada.
 */
export type Role =
  | "superadmin"
  | "manager"
  | "finance"
  | "kru_gudang"
  | "kru_kasir"
  | "kru_kitchen"
  | "kru_bar"
  /** Peran lama sebelum 8 Okt 2026 — sama dengan `kru_kasir`. */
  | "karyawan";

/** Urutan tampil di layar pemilihan peran. `karyawan` sengaja tidak ikut. */
export const ROLES: Role[] = [
  "superadmin", "manager", "finance", "kru_gudang", "kru_kasir", "kru_kitchen", "kru_bar",
];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin",
  manager: "Manager",
  finance: "Finance",
  kru_gudang: "Kru Gudang",
  kru_kasir: "Kru Kasir",
  kru_kitchen: "Kru Kitchen",
  kru_bar: "Kru Bar",
  karyawan: "Kru Kasir (akun lama)",
};

/** Dipakai `validAction` memeriksa kejadian dari perangkat lain. `karyawan`
 *  ikut supaya jejak lama tetap bisa diputar ulang. */
export const ROLES_SAH = [
  "superadmin", "manager", "finance", "kru_gudang", "kru_kasir", "kru_kitchen", "kru_bar", "karyawan",
] as const;

/** Peran yang boleh membuka seluruh aplikasi. */
export const SEMUA_AKSES: Role[] = ["superadmin", "manager"];

export type Employee = {
  id: string;
  name: string;
  pin: string;
  role: Role;
  active: boolean;
  /** Email yang ditautkan supaya orang ini bisa masuk tanpa PIN (lihat supabase/schema-email.sql). */
  email?: string;
  /**
   * VENUE TEMPAT ORANG INI BEKERJA. Kosong = kedua venue (pemilik & manajer
   * grup).
   *
   * Permintaan pemilik 12 Okt 2026: SPL Sport dan Smokehouse diperlakukan
   * seperti DUA PERUSAHAAN yang berbeda, jadi kasir resto tidak mengurus
   * meja biliar dan sebaliknya. Ini bukan sekadar menyembunyikan tab:
   * mesinnya menolak aksi yang menyentuh meja venue sebelah — perangkat
   * bisa berbohong, mesin tidak.
   */
  venue?: "spl" | "smh";
};

export const EMPLOYEES: Employee[] = [
  // Pemilik & manajer grup TANPA penanda venue: mereka mengurus keduanya.
  { id: "u-owner", name: "Pak Budi (Pemilik)", pin: "9999", role: "superadmin", active: true },
  { id: "u-manager", name: "Sinta (Manajer)", pin: "8888", role: "superadmin", active: true },
  // Kru lantai TERIKAT venuenya. Pemilik bisa memindahkan atau melepas
  // ikatannya di tab Atur; yang tidak bisa dilepas hanya kunci induk di atas.
  { id: "u-rian", name: "Rian", pin: "1234", role: "kru_kasir", active: true, venue: "spl" },
  { id: "u-yoga", name: "Yoga", pin: "2345", role: "kru_kasir", active: true, venue: "spl" },
  { id: "u-dewi", name: "Dewi", pin: "3456", role: "kru_kasir", active: true, venue: "smh" },
];

/** Apa yang boleh dilakukan tiap peran. Dipakai untuk menyembunyikan tab
 *  DAN menolak aksi — jangan pernah hanya menyembunyikan tombol. */
/**
 * Apa yang boleh dilakukan tiap peran — pemetaannya mengikuti diagram roadmap
 * (lampiran PDF 8 Okt 2026), yang dipilih pemilik saat ditanya.
 *
 *   Superadmin  semua
 *   Manager     semua          (diagram menulis "All Access")
 *   Finance     rekap · stok gudang · atur harga
 *   Kru Gudang  stok gudang
 *   Kru Kasir   meja · kasir · dapur
 *   Kru Kitchen dapur · stok gudang
 *   Kru Bar     dapur · stok gudang
 *
 * Dipakai untuk menyembunyikan tab DAN menolak aksi — jangan pernah hanya
 * menyembunyikan tombol: perangkat bisa berbohong, mesin tidak.
 *
 * CATATAN: buka/tutup shift dan ubah status tiket dapur memang TIDAK punya
 * izin tersendiri di mesin — siapa pun yang sudah masuk boleh. Itu disengaja:
 * hampir semua aksi uang menuntut shift terbuka, jadi kalau kasir tidak bisa
 * membuka shiftnya sendiri, venue berhenti sampai manajer datang.
 */
export const CAN = {
  // ── Uang & pengaturan ─────────────────────────────────────
  lihatLaporanKeuangan: ["superadmin", "manager", "finance"],
  /**
   * LAPORAN REKAP PENJUALAN — apa yang terjual dan berapa, itu saja.
   *
   * Dipisah dari `lihatLaporanKeuangan` (permintaan pemilik 19 Okt 2026:
   * *"pada kru kasir, panel rekap ada tapi hanya fitur laporan rekap"*).
   * Tab Rekap yang lengkap memuat kas shift, pajak, MDR gateway, selisih
   * laci, dan uang bersih yang masuk rekening — angka pemilik. Memberi
   * kasir akses ke seluruh tab itu supaya ia bisa melihat satu angka
   * penjualan berarti membuka sepuluh angka lain yang bukan urusannya.
   */
  lihatRekapPenjualan: ["superadmin", "manager", "finance", "kru_kasir", "karyawan"],
  /**
   * PANEL JEJAK AKTIVITAS — siapa melakukan apa, kapan.
   *
   * Permintaan pemilik 21 Okt 2026: *"jejak aktivitas di panel khusus untuk
   * memantau setiap perubahan dan aktivitas."*
   *
   * Sengaja TIDAK diberikan ke kru kasir dan karyawan, walau mereka boleh
   * melihat laporan penjualan. Jejak ini ada untuk mengawasi orang lantai;
   * yang diawasi tidak perlu melihat apa yang tercatat tentang dirinya
   * sebelum manajer melihatnya.
   */
  lihatJejak: ["superadmin", "manager", "finance"],
  /**
   * BUKA 24 JAM (mode demo) — superadmin SAJA, bukan manajer.
   *
   * Satu-satunya saklar yang melonggarkan aturan mesin, jadi yang boleh
   * memegangnya hanya pemilik. Manajer yang bisa menyalakannya berarti meja
   * bisa dibuka pukul 08.00 tanpa sepengetahuan pemilik, dan jam buka
   * berhenti berarti apa-apa.
   */
  bukaKunciJam: ["superadmin"],
  ubahTarif: ["superadmin", "manager", "finance"],
  kelolaPromo: ["superadmin", "manager"],
  kelolaMeja: ["superadmin", "manager"],
  kelolaKaryawan: ["superadmin", "manager"],
  setujuiVoid: ["superadmin", "manager"],
  beriDiskonManual: ["superadmin", "manager"],
  koreksiWaktu: ["superadmin", "manager"],
  // ── Stok gudang ──────────────────────────────────────────
  kelolaStok: ["superadmin", "manager", "finance", "kru_gudang", "kru_kitchen", "kru_bar"],
  // ── Lantai: meja, kasir, dapur ───────────────────────────────
  bukaMeja: ["superadmin", "manager", "kru_kasir", "karyawan"],
  tutupTab: ["superadmin", "manager", "kru_kasir", "karyawan"],
  orderFnb: ["superadmin", "manager", "kru_kasir", "karyawan"],
  koreksiPesanan: ["superadmin", "manager", "kru_kasir", "karyawan"],
  kontrolLampu: ["superadmin", "manager", "kru_kasir", "karyawan"],
  tandaiHabis: ["superadmin", "manager", "kru_kasir", "kru_kitchen", "kru_bar", "karyawan"],
  ajukanVoid: ["superadmin", "manager", "kru_kasir", "kru_kitchen", "kru_bar", "karyawan"],
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
  /** Venue tempat shift ini dibuka. Kas SPL dan Smokehouse tidak pernah
   *  tercampur. Shift lama tanpa penanda = SPL. */
  venue?: "spl" | "smh";
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
