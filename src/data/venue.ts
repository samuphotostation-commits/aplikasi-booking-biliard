// Data meja & tarif — angka nyata dari pemilik dan PRICELIST BILLIARD.pdf.
// 44 ruang: 40 biliar reguler + 2 VIP (bebas asap rokok) + 2 VVIP (boleh merokok).
//
// MEJA RESTO DIHAPUS 4 Okt 2026 (permintaan pemilik). Kelas `resto` SENGAJA
// masih dikenali tipe & label di bawah: jejak venue menyimpan `tableType` di
// dalam sesi, jadi sesi resto lama harus tetap bisa diputar ulang tanpa pecah.
// Yang hilang cuma mejanya — tidak ada lagi yang bisa dibuat baru.
//
// 40 meja reguler: 34 dipakai, 6 cadangan. Yang belum siap dijual bisa
// dinonaktifkan pemilik lewat Atur → Meja, bukan dengan mengubah kode.

/**
 * DUA VENUE DALAM SATU APLIKASI (roadmap 8 Okt 2026).
 *
 *   spl  — SPL Sport: meja biliar, bermeteran per jam
 *   smh  — Smokehouse: meja makan per lantai, tanpa meteran
 *
 * Venue sebuah meja tidak disimpan di State: ia melekat pada mejanya dan
 * tidak pernah pindah. Sesi, tiket, dan pesanan mewarisinya lewat `tableId`,
 * jadi tidak ada dua catatan yang bisa berbeda.
 *
 * Keputusan pemilik: **rekap kedua venue HARUS terpisah.**
 */
export type Venue = "spl" | "smh";

export const VENUE_LABEL: Record<Venue, string> = {
  spl: "SPL Sport",
  smh: "Smokehouse",
};

/** Kelas meja. Tarifnya dibedakan per kelas, dan kelas tiap meja bisa diubah
 *  superadmin di tab Atur (tersimpan di `State.tableTypes`). */
export type TableType = "regular" | "vip" | "vvip" | "resto";

export type PoolTable = {
  id: string;
  no: number;
  name: string;
  type: TableType;
  capacity: number;
  venue: Venue;
  /** Hanya Smokehouse: lantai berapa mejanya. */
  lantai?: number;
};

export const BILLIARD_TYPES: TableType[] = ["regular", "vip", "vvip"];

/** Nama kelas untuk layar — satu sumber supaya kasir & pelanggan menyebutnya sama. */
export const CLASS_LABEL: Record<TableType, string> = {
  regular: "Reguler",
  vip: "VIP (bebas asap rokok)",
  vvip: "VVIP (boleh merokok)",
  resto: "Meja resto",
};
export const CLASS_SHORT: Record<TableType, string> = {
  regular: "Reg", vip: "VIP", vvip: "VVIP", resto: "Resto",
};

/**
 * Label pendek meja di layar: 12 (reguler), V3 (VIP/VVIP), R05 (meja makan).
 *
 * Nomor meja makan DIBERI NOL DI DEPAN supaya sama persis dengan namanya di
 * papan, di struk, dan di pelat meja aslinya ("R03"). Sebelumnya layar kasir
 * menulis "R1" sementara struknya menulis "R01" — satu meja dengan dua nama
 * adalah cara tercepat membuat kasir dan dapur bicara tentang meja berbeda.
 */
export const tableLabel = (type: TableType, no: number) =>
  type === "resto" ? `R${String(no).padStart(2, "0")}` : type === "regular" ? String(no) : `V${no}`;

export const TABLES: PoolTable[] = [
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `T${String(i + 1).padStart(2, "0")}`,
    no: i + 1,
    name: `Meja ${i + 1}`,
    type: "regular" as const,
    capacity: 4,
    venue: "spl" as const,
  })),
  // VIP 1–2 bebas asap rokok · VIP 3–4 boleh merokok (VVIP). Kelas tiap ruang bisa
  // ditukar di tab Atur tanpa mengubah kode.
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `V${String(i + 1).padStart(2, "0")}`,
    no: i + 1,
    name: `VIP ${i + 1}`,
    type: (i < 2 ? "vip" : "vvip") as TableType,
    capacity: 8,
    venue: "spl" as const,
  })),
  // ── SMOKEHOUSE ───────────────────────────────────────────
  // LANTAI 1 SAJA (keputusan pemilik 12 Okt 2026: *"buat untuk lantai 1 saja
  // dulu mengingat lantai 2 masih on progress"*). Lantai 2 BUKAN dihapus dari
  // kode — definisinya tetap ada di `LANTAI_2` di bawah supaya jejak lama yang
  // sempat menyentuh meja S2xx tetap bisa diputar ulang; yang dilakukan hanya
  // tidak menjualnya.
  //
  // Jumlah 12 meja masih ANGKA SEMENTARA — denah aslinya belum ada. Nomornya
  // memakai R01–R12 mengikuti struk yang dipakai pemilik sekarang ("Meja :
  // R02"), supaya kasir membaca nomor yang sama dengan yang biasa dipegang.
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `S1${String(i + 1).padStart(2, "0")}`,
    no: i + 1,
    name: `R${String(i + 1).padStart(2, "0")}`,
    // Meja makan tidak bermeteran jam — kelasnya memakai `resto`, yang memang
    // sudah berarti "tanpa sewa waktu" di seluruh mesin.
    type: "resto" as TableType,
    capacity: i < 8 ? 4 : 8,
    venue: "smh" as const,
    lantai: 1,
  })),
];

/**
 * Meja lantai 2 Smokehouse — ADA di sistem, TIDAK dijual.
 *
 * Lantai 2 masih dikerjakan (keputusan pemilik 12 Okt 2026). Kalau barisnya
 * dihapus begitu saja, setiap pencarian meja (`TABLES.find`) untuk jejak yang
 * sempat menyentuh meja itu akan mengembalikan `undefined` dan menjatuhkan
 * layar. Jadi mejanya tetap dikenal mesin, tapi tidak ikut `TABLES` — tidak
 * muncul di papan, tidak bisa dibooking, tidak ikut hitungan kapasitas.
 *
 * Saat denah lantai 2 sudah ada: pindahkan kembali ke `TABLES` dan sesuaikan
 * jumlah & nomornya dengan denah sebenarnya.
 */
export const LANTAI_2: PoolTable[] = Array.from({ length: 12 }, (_, i) => ({
  id: `S2${String(i + 1).padStart(2, "0")}`,
  no: i + 1,
  name: `2-${String(i + 1).padStart(2, "0")}`,
  type: "resto" as TableType,
  capacity: i < 8 ? 4 : 8,
  venue: "smh" as const,
  lantai: 2,
}));

/**
 * MEJA CADANGAN — dikenal mesin, belum dijual, siap diaktifkan pemilik.
 *
 * Permintaan pemilik 21 Okt 2026: *"tambahkan di pengaturan untuk tambah meja
 * semisal nanti ada tambahan meja yang dilakukan."*
 *
 * KENAPA CADANGAN DI KODE, BUKAN MEJA BEBAS DARI DATA. Venue dan kelas sebuah
 * meja dibaca banyak fungsi MURNI yang tidak memegang state — `venueDari`
 * (dipakai pagar venue, cap jejak, saringan paket), `typeOf`, `punyaLampu`.
 * Meja yang hanya ada di data tidak dikenali fungsi-fungsi itu dan akan
 * jatuh ke tebakan: meja makan baru diam-diam dianggap meja biliar, kasir
 * Smokehouse tidak bisa menyentuhnya, dan tarif per jam mulai berjalan di
 * meja yang seharusnya Rp 0. Dengan katalog di kode, tidak ada yang ditebak.
 *
 * Yang pindah ke data cuma SATU hal: meja mana yang sedang dijual
 * (`mejaDijual` di engine). Itu cukup untuk "tambah meja" tanpa membuka
 * lubang di tiga fungsi yang menjaga uang.
 *
 * Batasnya: 16 meja reguler + 4 VIP/VVIP untuk SPL, 12 meja makan lantai 1
 * untuk Smokehouse, ditambah 12 meja lantai 2 yang sudah ada di bawah. Kalau
 * suatu hari kurang, menambah baris di sini satu pekerjaan sebentar.
 */
export const CADANGAN: PoolTable[] = [
  ...Array.from({ length: 16 }, (_, i) => ({
    id: `T${String(i + 41).padStart(2, "0")}`,
    no: i + 41,
    name: `Meja ${i + 41}`,
    type: "regular" as TableType,
    capacity: 4,
    venue: "spl" as const,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `V${String(i + 5).padStart(2, "0")}`,
    no: i + 5,
    name: `VIP ${i + 5}`,
    type: (i < 2 ? "vip" : "vvip") as TableType,
    capacity: 8,
    venue: "spl" as const,
  })),
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `S1${String(i + 13).padStart(2, "0")}`,
    no: i + 13,
    name: `R${String(i + 13).padStart(2, "0")}`,
    type: "resto" as TableType,
    capacity: i < 8 ? 4 : 8,
    venue: "smh" as const,
    lantai: 1,
  })),
];

/** Meja yang dikenal mesin, termasuk yang belum dijual (lantai 2 & cadangan). */
export const SEMUA_MEJA: PoolTable[] = [...TABLES, ...LANTAI_2, ...CADANGAN];

/**
 * Nomor WhatsApp venue (diberikan pemilik 12 Okt 2026: 0851-2118-0988).
 *
 * Ditulis dalam format internasional tanpa tanda baca karena itu yang
 * diterima tautan wa.me. Dipakai halaman depan untuk Event, Career, dan
 * Partnership — ketiganya membuka percakapan WhatsApp dengan pesan yang
 * sudah terisi, bukan formulir yang isinya tidak pernah dibaca siapa pun.
 */
export const WA_VENUE = "6285121180988";

/** Tampilan nomornya untuk dibaca manusia. */
export const WA_VENUE_TAMPIL = "0851-2118-0988";

export const BILLIARD_TABLES = TABLES.filter((t) => t.type !== "resto");
/** Kosong sejak 4 Okt 2026 — dibiarkan ada supaya kode lama tidak pecah. */
export const RESTO_TABLES = TABLES.filter((t) => t.type === "resto");

export const TABLE_COUNT = {
  regular: TABLES.filter((t) => t.type === "regular").length,
  vip: TABLES.filter((t) => t.type === "vip").length,
  vvip: TABLES.filter((t) => t.type === "vvip").length,
  resto: RESTO_TABLES.length,
  total: TABLES.length,
};

/** Venue sebuah meja. Meja tak dikenal dianggap SPL — jejak lama tidak punya
 *  penanda venue, dan seluruh isinya memang meja biliar. */
export const venueDari = (tableId: string): Venue =>
  SEMUA_MEJA.find((t) => t.id === tableId)?.venue ?? "spl";

export const mejaVenue = (v: Venue) => TABLES.filter((t) => t.venue === v);

/** Lantai yang dipakai sebuah venue, terurut. Kosong untuk SPL. */
export const lantaiVenue = (v: Venue) =>
  [...new Set(mejaVenue(v).map((t) => t.lantai).filter((x): x is number => !!x))].sort();

/* ── Tarif (PRICELIST BILLIARD.pdf) ────────────────────────────────
   Reguler  11.00–18.00  Rp 29.000 / jam
   Reguler  18.00–tutup  Rp 39.000 / jam
   VIP Room (bebas asap rokok)  Rp 50.000 / jam
   VVIP (boleh merokok)         Rp 60.000 / jam   [HARGA PERLU KONFIRMASI — ubah di tab Atur]
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

/**
 * PAKET MEJA — harga blok tetap + jatah minuman gratis.
 *
 * Dulu cuma satu nilai tetap di kode. Sejak 9 Okt 2026 pemilik bisa menambah
 * dan mengubahnya sendiri (`State.packages`); yang di bawah ini tinggal
 * BAWAANNYA saja, dipakai saat dunia baru dibuat.
 */
/** Satu barang yang SUDAH TERMASUK harga paket. */
export type PaketIsi = { itemId: string; qty: number };

export type Paket = {
  id: string;
  name: string;
  /** Harga blok, menggantikan tarif per jam. */
  price: number;
  /**
   * Lama main. **0 = paket tanpa sewa waktu** — paket makanan Smokehouse,
   * yang dijual seperti satu barang di bill meja, bukan sebagai blok jam.
   */
  hours: number;
  /** Berapa minuman dingin gratis yang ikut. */
  freeDrinks: number;
  /** Jam operasional terakhir yang boleh dipakai memulai (11..25). */
  lastStartHour: number;
  perks: string[];
  aktif?: boolean;
  /**
   * Venue pemilik paket. Kosong = SPL Sport (semua paket sebelum 19 Okt
   * 2026 memang paket meja biliar).
   *
   * Paket Smokehouse tidak pernah muncul di layar booking meja biliar, dan
   * sebaliknya — dua venue diperlakukan seperti dua perusahaan.
   */
  venue?: Venue;
  /**
   * MAKANAN & MINUMAN YANG IKUT DALAM PAKET (permintaan pemilik 19 Okt
   * 2026).
   *
   * Harganya SUDAH di dalam `price`, jadi barisnya masuk bill dengan nilai
   * Rp 0 — tamu tidak ditagih dua kali. Yang TIDAK nol: stoknya. Tiap porsi
   * di sini benar-benar keluar dari gudang dan benar-benar masuk tiket
   * dapur, karena memang ada yang memasaknya.
   *
   * Beda dengan `freeDrinks`, yang hanya memberi JATAH sekian minuman bebas
   * pilih. `isi` menyebutkan barangnya.
   */
  isi?: PaketIsi[];
};

/** Id-nya SENGAJA "siang": sesi lama menyimpan nilai itu di `paket`. */
export const PAKET_SIANG: Paket = {
  id: "siang",
  name: "Paket Siang",
  price: 50_000,
  hours: 2,
  freeDrinks: 2,
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
