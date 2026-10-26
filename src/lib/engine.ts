/* ═══════════════════════════════════════════════════════════════════
   MESIN INTI OPERASIONAL — tanpa React.

   Semua aturan uang, meja, stok, void, dan shift hidup DI SINI SAJA.
   Layar hanya mengirim NIAT ("tutup tab meja 5 pakai tunai") dan
   menampilkan hasil; ia tidak pernah menentukan angka. Setiap aksi
   diverifikasi 100 simulasi di test/simulation.test.ts.

   Prinsip yang ditegakkan (PRD KK-24):
   R1  Guard gagal TERTUTUP — data tidak lengkap/izin kurang = tolak.
   R2  Uang dihitung ulang dari state, bukan dari angka kiriman layar.
   R3  Pembayaran online yang nominalnya tidak cocok = tolak & catat refund.
   R4  Deterministik — jejak kejadian yang sama menghasilkan state yang
       sama di perangkat mana pun (dasar sinkronisasi, lihat `replay`).
   ═══════════════════════════════════════════════════════════════════ */
import { seedSessions, seedTickets, type LiveSession, type PayChannel, type Payment, type Ticket } from "../data/live";
import {
  CLASS_LABEL, PAKET_SIANG, RATES, TABLES, SEMUA_MEJA, venueDari,
  type Paket, type PaketIsi,
  type Rates, type TableType, type Venue,
} from "../data/venue";
import { MENU, findItem, type MenuCategory, type MenuItem } from "../data/menu";
import {
  EMPLOYEES, ROLES_SAH, SEED_PROMOS, SEED_STOCK, can,
  type Employee, type Permission, type Role, type Shift, type StockRow, type VoidRequest,
} from "../data/staff";
import { bestPromo, billOpenSession, GRACE_MINUTES, type BillBreakdown, type Promo } from "./billing";
import type { CartLine } from "./store";
import {
  HOUR_MS, TURNAROUND_MIN, blockEndOf, businessDateOf, dariWib, diWib, findClashes, isActive,
  minutesUntilNext, nextSessionOn, openBillOn, tableFreeForRange, tanggalWib,
} from "./occupancy";

export type { Role };

/* ── Jam yang bisa dikendalikan (simulasi, tes, & putar ulang jejak) ── */
let clockFn: () => number = () => Date.now();
export const clock = () => clockFn();
export function setClock(fn: () => number) { clockFn = fn; }

/* ── ID deterministik ────────────────────────────────────────────────
   Saat memutar jejak, ID diturunkan dari ID kejadian — bukan dari urutan
   global — supaya dua perangkat selalu menghasilkan ID yang sama. */
let seq = 0;
let idBase: string | null = null;
export const nextId = (prefix: string) => `${prefix}-${idBase ?? clock().toString(36)}-${(++seq).toString(36)}`;
export function resetIds() { seq = 0; }

const MENU_CATEGORY_OF: Record<string, string> = Object.fromEntries(
  MENU.flatMap((c) => c.items.map((i) => [i.id, c.id])),
);

/* ── Aturan venue ────────────────────────────────────────────────── */
export const OPEN_IDX = 11;
export const CLOSE_IDX = 26;                  // 02.00
export const NO_SHOW_RELEASE_MIN = 20;        // PRD §5
export const EARLY_CHECKIN_MIN = 30;
/** PRD §5 min_lead_time_minutes — booking online paling cepat 30 menit sebelum main:
 *  tamu yang sudah di jalan jam 16.30 masih bisa mengambil slot jam 17.00. */
export const MIN_LEAD_MIN = 30;
/** PRD KK-04: QR berlaku 15 menit, hold di database 17 menit, dilepas pada T+19. */
export const GATEWAY_EXPIRY_MIN = 15;
export const HOLD_MIN = 17;
export const HOLD_GRACE_MIN = 2;
/** Jatah minuman Paket Siang bawaan — paket lain membawa angkanya sendiri. */
export const PAKET_FREE_DRINKS = PAKET_SIANG.freeDrinks;

/**
 * Cari paket. Sesi lama menyimpan `paket: "siang"`, dan id paket bawaan
 * memang "siang", jadi jejak lama tetap terbaca tanpa penerjemahan.
 */
export type { Paket };

export const paketOf = (st: Pick<State, "packages">, id?: string): Paket | undefined =>
  id ? (st.packages ?? [PAKET_SIANG]).find((p) => p.id === id) : undefined;

/** Paket yang masih dijual. */
export const paketAktif = (st: Pick<State, "packages">): Paket[] =>
  (st.packages ?? [PAKET_SIANG]).filter((p) => p.aktif !== false);
/** Toleransi batal open bill: 5 menit pertama tidak ditagih (lihat billing.ts). */
export const GRACE_MIN = GRACE_MINUTES;
/** Reservasi meja resto paling cepat 30 menit sebelum datang. */
/**
 * KAPAN "UBAH BARIS PESANAN" DITUTUP — 19 Okt 2026, 05.00 WIB.
 *
 * Permintaan pemilik 19 Okt 2026: *"untuk ini dihapus saja untuk fitur ubah,
 * menghindari manipulasi karyawan"*.
 *
 * KENAPA FITURNYA BERBAHAYA. `editFnb` bisa MENURUNKAN jumlah dan MENGGANTI
 * barang sebuah baris selama belum diantar dan belum dibayar. Jadi pesanan 3
 * porsi bisa dicatat 3, uangnya diterima untuk 3, lalu barisnya diubah jadi 1
 * sebelum bill dicetak — dan satu-satunya bekas yang tertinggal cuma satu
 * baris catatan yang tidak pernah dibaca siapa pun. Void tidak begitu: void
 * menuntut alasan DAN persetujuan superadmin.
 *
 * KENAPA PAKAI TANGGAL, BUKAN MENGHAPUS KODENYA. Seluruh keadaan venue
 * dihitung ulang dari jejak kejadian. Kalau aksinya dibuang atau ditolak
 * untuk semua waktu, koreksi yang SUDAH TERJADI minggu lalu berhenti berlaku
 * saat jejaknya diputar ulang — dan bill lama diam-diam berubah angkanya,
 * termasuk hari yang sudah tutup buku. Jadi batasnya waktu: kejadian sebelum
 * tanggal ini tetap berlaku persis seperti dulu, kejadian sesudahnya ditolak
 * mesin — dari perangkat mana pun, dengan peran apa pun.
 *
 * Layarnya juga sudah tidak punya tombolnya (lihat Board.tsx), tapi
 * menyembunyikan tombol bukan pengamanan: jejak kejadian dikirim dari
 * perangkat mana pun, dan perangkat bisa berbohong.
 */
export const KOREKSI_BARIS_DITUTUP = dariWib(2026, 10, 19, 5);

export const RESTO_LEAD_MIN = 30;
/** Hari LAPORAN STOK dimulai jam 05.00 (permintaan pemilik) - beda dari hari uang (02.00). */
export const STOCK_DAY_HOUR = 5;
/** Riwayat pergerakan stok yang disimpan (cukup untuk laporan beberapa hari). */
export const MAX_STOCK_MOVES = 2000;
/** [PERLU KONFIRMASI] minuman yang termasuk Paket Siang. */
export const PAKET_FREE_CATEGORIES = ["cold-drink"];

export type Refund = {
  id: string; at: number;
  /** Kode transaksi milik PEMBAYAR (kode booking atau kode pesanan) — dasar pencocokan dengan gateway. */
  bookingCode: string;
  guest: string;
  phone?: string;
  amount: number; reason: string;
  /** Diisi saat dana benar-benar dikembalikan (atau dijadikan kredit). */
  settledAt?: number;
  settledBy?: string;
  method?: "transfer" | "tunai" | "kredit";
};

/** Pesanan makanan tanpa booking: scan QR di meja, atau takeaway (PRD §7.3). */
export type GuestOrder = {
  id: string;
  code: string;
  at: number;
  guest: string;
  phone?: string;
  mode: "meja" | "takeaway";
  tableId?: string;
  /** online = QRIS di muka · kasir = masuk bill meja, dibayar saat tutup tab. */
  pay: "online" | "kasir";
  lines: CartLine[];
  value: number;
  paidOnline: number;
  /** Sesi meja tempat pesanan ditempelkan (mode meja). */
  sessionId?: string;
  status: "diterima" | "ditolak" | "void";
  reason?: string;
  /** Venue pesanan ini. Pesanan bermeja mewarisi dari mejanya; pesanan tanpa
   *  meja (takeaway / counter) membawanya sendiri karena tidak ada yang bisa
   *  menurunkannya. Tanpa penanda = SPL (semua jejak lama memang SPL). */
  venue?: Venue;
  /** Takeaway yang dibayar saat diambil di kasir. Tanpa ini = belum dibayar. */
  payment?: Payment;
};

/** Baris ringkas sesi yang sudah tutup buku — cukup untuk rekap, CSV, dan status riwayat pelanggan. */
export type ArchivedSession = Pick<LiveSession,
  "id" | "tableId" | "source" | "guest" | "bookingCode" | "checkin" | "status" | "startsAt" | "endsAt" | "settledAt" |
  "settledChannel" | "settledAmount" | "settledBilliard" | "settledFnb" | "settledDiscount" | "paidOnline" | "payments" |
  // Pecahan per lini usaha, dibekukan saat tab ditutup. Arsip sebelum 18 Okt
  // 2026 tidak punya ini — pembacanya WAJIB jatuh ke pajak venue tunggal.
  "settledLini" |
  // Dibawa ke arsip supaya rekap per shift & laporan compliment hari yang
  // sudah tutup buku tidak perlu menebak dari jam. Arsip lama tidak punya
  // keduanya -- pembacanya WAJIB menyiapkan jalur jatuhnya.
  "settledShiftId" | "settledCompliment" | "settledDiskonManual" | "settledMesin">;
/** Baris ringkas pesanan tamu yang sudah tutup buku. */
export type ArchivedOrder = Pick<GuestOrder,
  "id" | "code" | "at" | "guest" | "mode" | "tableId" | "pay" | "value" | "paidOnline" | "sessionId" | "status" | "reason" | "payment">
  & {
    /**
     * Pecahan nilai pesanan per lini, dihitung SAAT TUTUP BUKU — selagi
     * barisnya masih ada. Sesudah diarsipkan barisnya dilepas, dan tanpa
     * angka ini pajak takeaway hari lampau tidak bisa dipecah lagi.
     */
    lini?: Record<Lini, number>;
  };
/** Angka uang satu hari operasional (lihat `recap`). */
export type DayMoney = {
  billiard: number; fnb: number; discount: number; gross: number; diterima: number; prabayar: number;
  byChannel: Record<string, { n: number; gross: number }>; dpp: number; tax: number; mdr: number; net: number;
  /**
   * Pemecahan pajak PER LINI USAHA. Arsip lama tidak punya ini — layarnya
   * harus siap menerima `undefined`, bukan menampilkan nol yang seolah-olah
   * berarti "tidak ada penjualan di lini itu".
   */
  perLini?: Record<Lini, { gross: number; dpp: number; tax: number; service: number }>;
  /** Bagian service dari `gross`. Arsip lama belum punya ini — baca sebagai 0. */
  service?: number;
  /**
   * Nilai barang yang DIBERIKAN GRATIS (compliment). SENGAJA di luar rumus
   * `gross`: barangnya sudah dibuat harganya nol, jadi kalau ikut ditambahkan
   * ke omzet, omzet tidak lagi sama dengan uang yang diterima dan seluruh
   * laporan jadi tidak bisa dipertanggungjawabkan. Yang dijaga di sini adalah
   * permintaan pemilik yang sebenarnya: nilainya TIDAK HILANG dari laporan —
   * ia punya barisnya sendiri sebagai biaya yang ditanggung venue.
   */
  compliment?: number;
  /** Bagian `discount` yang diberikan kasir/manajer manual, bukan dari promo. */
  diskonManual?: number;
};
/** Hitungan operasional satu hari — tetap ada walau rincian barisnya sudah dilepas. */
export type DayCounts = { done: number; noShow: number; takeaway: number; takeawayValue: number; playedHours: number };
/** Satu hari operasional yang sudah tutup buku: angka rekap dibekukan, baris ringkasnya disimpan. */
export type DayArchive = {
  bizDate: string;
  money: DayMoney;
  counts: DayCounts;
  /** Rincian baris hanya disimpan {@link ARCHIVE_ROW_DAYS} hari; sesudahnya cukup angka & hitungan. */
  rowsDropped?: boolean;
  /**
   * Ringkasan penjualan PER PRODUK hari itu, dibekukan saat tutup buku.
   *
   * Tanpa ini, laporan penjualan per produk mati begitu harinya diarsipkan:
   * baris pesanannya dilepas, dan tidak ada apa pun di arsip yang bisa
   * menjawab "bulan lalu Indomie terjual berapa". Satu baris per barang per
   * venue — jauh lebih kecil daripada menyimpan seluruh pesanannya, dan
   * SENGAJA tidak ikut dilepas saat rincian baris dilepas.
   *
   * Arsip yang dibuat sebelum ini ada tidak punya penanda ini; pembacanya
   * WAJIB menyebut harinya kurang, bukan menampilkan nol.
   */
  produk?: ProdukHariBaris[];
  sessions: ArchivedSession[];
  orders: ArchivedOrder[];
  voids: VoidRequest[];
  refunds: Refund[];
};
/** Rincian transaksi arsip (untuk CSV & riwayat) disimpan sekian hari; angka rekap selamanya. */
export const ARCHIVE_ROW_DAYS = 35;

/**
 * Umur simpan RINGKASAN PER PRODUK di arsip (SPL-11).
 *
 * Jauh lebih lama daripada rincian barisnya, karena satu baris per barang
 * per hari jauh lebih kecil daripada seluruh pesanannya — tapi TIDAK
 * selamanya. Angka rekap (uang & hitungan) memang disimpan selamanya: itu
 * belasan angka per hari. Ringkasan produk bisa seratus baris per hari, dan
 * state ini disalin ke SETIAP perangkat; dibiarkan tumbuh setahun, yang
 * disinkronkan tiap kali aplikasi dibuka jadi megabita.
 *
 * 120 hari dipilih karena layar rekap sendiri tidak pernah bisa meminta
 * rentang lebih dari {@link MAX_REKAP_HARI} hari sekaligus — jadi setiap
 * pertanyaan yang BISA diajukan tentang kuartal berjalan masih terjawab
 * utuh. Hari yang lebih tua dari ini disebut apa adanya di layar sebagai
 * hari tanpa rincian, bukan dihitung nol.
 */
export const PRODUK_DAYS = 120;

/** `sessionId` (opsional) = tab yang dituju HP tamu. Bila tab di meja itu sudah berganti
 *  (tamu sudah pulang, orang lain yang main), pesanan ditolak — tidak masuk bill orang lain. */
export type GuestOrderRequest = Pick<
  GuestOrder, "id" | "code" | "guest" | "phone" | "mode" | "tableId" | "pay" | "lines" | "paidOnline" | "sessionId" | "venue"
>;

/** Satu pergerakan stok — dasar laporan stok 05.00–05.00. */
/**
 * GUDANG. Roadmap 8 Okt 2026: satu Gudang Central yang memasok Gudang Billiard
 * dan Gudang Resto — sedangkan GUDANG BAR BERDIRI SENDIRI dan sengaja TIDAK
 * menerima transfer dari Central.
 *
 * Gudang sebuah barang tidak disimpan per baris, melainkan ditentukan dari
 * `station` barangnya: counter biliar → billiard, dapur → resto, bar → bar.
 * Satu barang tidak mungkin ada di dua gudang penjualan sekaligus, jadi
 * menyimpannya dua kali hanya menciptakan kemungkinan keduanya berbeda.
 */
export type Gudang = "central" | "billiard" | "resto" | "bar";

/** Gudang penjualan sebuah barang — dari stationnya, bukan dari data terpisah. */
export const gudangDari = (
  itemId: string, state?: Pick<State, "customItems">,
): Exclude<Gudang, "central"> => {
  const st = (state ? itemOf(state, itemId) : findItem(itemId))?.station;
  return st === "billiard" ? "billiard" : st === "bar" ? "bar" : "resto";
};

/** Barang yang boleh dipasok dari Central. Bar berdiri sendiri. */
export const bolehDariCentral = (itemId: string, state?: Pick<State, "customItems">) =>
  gudangDari(itemId, state) !== "bar";

export type StockMove = {
  at: number;
  /** Gudang tempat pergerakan ini terjadi. Catatan lama tanpa ini = gudang
   *  penjualan barangnya (sebelum 9 Okt 2026 memang hanya ada itu). */
  gudang?: Gudang;
  itemId: string;
  /** Negatif = keluar (terjual/susut), positif = masuk/kembali. */
  delta: number;
  kind: "jual" | "kembali" | "masuk" | "susut" | "setel" | "opname" | "transfer";
};

/** Permintaan reservasi meja Smokehouse Resto dari HP tamu atau kasir. */
/**
 * Lini usaha untuk pemecahan pajak.
 *
 *   biliar — sewa meja + barang counter biliar (rokok, botolan)
 *   bar    — minuman (station `bar`)
 *   resto  — makanan (station `kitchen`)
 *
 * Diturunkan dari `station` baris, bukan disimpan terpisah: satu barang
 * tidak mungkin dijual dari dua lini sekaligus, dan menyimpannya dua kali
 * hanya menciptakan kemungkinan keduanya berbeda.
 */
export type Lini = "biliar" | "bar" | "resto";
export const LINI: Lini[] = ["biliar", "bar", "resto"];
export const LINI_LABEL: Record<Lini, string> = {
  biliar: "Meja Billiard", bar: "Bar", resto: "Resto",
};

/**
 * Masukkan satu transaksi ke ember lini, diskonnya dibagi menurut porsinya.
 *
 * Sisa pembulatan diberikan ke lini TERBESAR, bukan dibuang: kalau tidak,
 * jumlah per lini tidak persis sama dengan omzet, dan selisih satu rupiah di
 * laporan pajak adalah selisih yang harus dijelaskan ke orang pajak.
 */
function taruhLini(
  ember: Record<Lini | "lama", number>,
  pecah: Record<Lini, number> | undefined,
  kotor: number, diskon: number,
) {
  const bersih = kotor - diskon;
  if (!pecah) { ember.lama += bersih; return; }
  const total = LINI.reduce((n, k) => n + pecah[k], 0);
  if (total <= 0) { ember.lama += bersih; return; }
  let terpakai = 0;
  let terbesar: Lini = "biliar";
  for (const k of LINI) if (pecah[k] > pecah[terbesar]) terbesar = k;
  for (const k of LINI) {
    if (k === terbesar) continue;
    const bagian = Math.round(bersih * (pecah[k] / total));
    ember[k] += bagian; terpakai += bagian;
  }
  ember[terbesar] += bersih - terpakai;
}

/**
 * Isi paket sebagai baris bill Rp 0 — siap dilewatkan `fulfil`.
 *
 * Harganya nol karena sudah termasuk harga paket; yang TIDAK nol adalah
 * stok dan tiket dapurnya. Nama & station dibekukan di barisnya, sama
 * seperti baris pesanan biasa: barang yang kemudian dihapus dari buku menu
 * tetap terbaca di bill lama.
 */
export function isiPaket(
  st: Pick<State, "menuPrices" | "customItems">, pk: Paket, kunci: string,
): CartLine[] {
  return (pk.isi ?? []).flatMap((x, i) => {
    const item = itemOf(st, x.itemId);
    if (!item) return [];
    return [{
      key: `${kunci}-${i}`, itemId: item.id, qty: x.qty, unitPrice: 0,
      name: item.name, station: item.station, isiPaket: true as const,
    }];
  });
}

/** Pecahan satu sesi per lini: sewa meja masuk `biliar`, barangnya ikut stationnya. */
export function liniSesi(s: Pick<LiveSession, "fnb">, sewaMeja: number): Record<Lini, number> {
  const out = liniDariLines(s.fnb ?? []);
  return { ...out, biliar: out.biliar + sewaMeja };
}

/** Persen yang berlaku untuk satu lini. Tanpa pengaturan per lini = pajak venue. */
export const persenLini = (s: Pick<State, "pajak" | "pajakLini">, lini: Lini) =>
  s.pajakLini?.[lini] ?? s.pajak;

/** Nilai barang dipecah per lini, dari `station` tiap barisnya. */
export function liniDariLines(lines: CartLine[]): Record<Lini, number> {
  const out: Record<Lini, number> = { biliar: 0, bar: 0, resto: 0 };
  for (const l of lines) {
    const lini: Lini = l.station === "bar" ? "bar" : l.station === "billiard" ? "biliar" : "resto";
    out[lini] += lineValue(l);
  }
  return out;
}

export type RestoRequest = {
  id: string;
  code: string;
  guest: string;
  phone?: string;
  pax: number;
  startsAt: number;
  hours: number;
  tableId?: string;
  note?: string;
  /**
   * MAKANAN YANG DIPESAN SEKALIAN dengan mejanya (permintaan pemilik 12 Okt
   * 2026: *"reservasi ini harus dengan makanannya sekalian, jadi tidak hanya
   * meja yang direservasi"*).
   *
   * Masuk ke bill meja sebagai baris sungguhan bertanda `pra` — bukan
   * ditempel sebagai teks di catatan, yang tidak bisa ditagih, tidak bisa
   * dikoreksi, tidak bisa di-void, dan tidak pernah sampai ke dapur.
   */
  lines?: CartLine[];
};

export type State = {
  me: Employee | null;
  shift: Shift | null;
  shiftHistory: Shift[];
  employees: Employee[];
  sessions: LiveSession[];
  tickets: Ticket[];
  rates: Rates;
  /**
   * Persentase PPN & service, dipakai HANYA untuk memecah angka di laporan.
   *
   * Keputusan pemilik 8 Okt 2026: harga yang dilihat tamu SUDAH TERMASUK
   * keduanya. Jadi mengubah angka di sini tidak boleh menggeser satu rupiah
   * pun dari tagihan, omzet, atau uang yang diterima — yang berubah cuma
   * bagaimana `gross` dibagi jadi DPP / PPN / service. Dijaga oleh INV-53.
   */
  pajak: { ppn: number; service: number };
  /**
   * PPN & SERVICE PER LINI USAHA (permintaan pemilik 18 Okt 2026).
   *
   * Kosong = seluruh venue memakai `pajak` di atas, persis seperti sebelum
   * 18 Okt 2026. Jejak lama TIDAK boleh berubah angkanya hanya karena
   * kolom ini ditambahkan.
   *
   * Seperti `pajak`, ini TIDAK PERNAH MENAMBAH TAGIHAN. Harga menu sudah
   * termasuk pajak; persennya hanya memecah angka yang sama untuk laporan
   * (dpp + ppn + service = omzet). Itu yang dijaga INV-53, dan itu tetap
   * berlaku per lini.
   */
  pajakLini?: Record<Lini, { ppn: number; service: number }>;
  /** Kelas meja yang diubah superadmin (mis. VIP 3 dijadikan VVIP). Kosong = bawaan data meja. */
  tableTypes: Record<string, TableType>;
  /**
   * MEJA MANA YANG SEDANG DIJUAL, hanya yang BERBEDA dari bawaan.
   *
   * `true` = meja cadangan/lantai 2 yang diaktifkan pemilik; `false` = meja
   * bawaan yang ditarik dari peredaran. Yang tidak disebut di sini memakai
   * bawaannya (`TABLES`).
   *
   * Disimpan sebagai SELISIH, bukan daftar penuh: daftar penuh yang ikut
   * tersimpan di tiap jejak akan membeku, dan meja yang ditambahkan ke kode
   * nanti tidak pernah muncul di venue yang sudah jalan.
   */
  mejaPakai?: Record<string, boolean>;
  /**
   * JAM BUKA DIBEBASKAN — mode demo.
   *
   * Permintaan pemilik 23 Okt 2026: *"beberapa akses terkunci terutama pagi
   * atau lewat jamnya … agar saya bisa melakukan keseluruhan simulasi di jam
   * kapan pun untuk mendemonstrasikan aplikasi ini."*
   *
   * Yang dibuka HANYA pagar jam operasional (11.00–02.00). Harga, izin peran,
   * pagar venue, penahanan aksi uang saat terputus, dan seluruh aturan uang
   * lainnya TIDAK ikut longgar — kalau ikut, "mode demo" jadi pintu belakang
   * yang besarnya persis seluruh pagar yang dibangun di berkas ini.
   */
  jamBebas?: boolean;
  /**
   * Barang yang DITAMBAHKAN pemilik sendiri lewat tab Menu & Stok — di luar
   * buku menu yang tertanam di kode. Disimpan di jejak supaya muncul sama di
   * semua perangkat tanpa perlu membangun ulang aplikasi.
   */
  customItems: MenuItem[];
  /** Paket meja yang bisa dijual — bisa ditambah/diubah pemilik. */
  packages: Paket[];
  /** Nama meja yang diganti kasir. Yang tidak ada di sini = nama bawaan. */
  tableNames: Record<string, string>;
  /** Harga menu yang diubah superadmin. Yang tidak ada di sini = harga buku menu. */
  menuPrices: Record<string, number>;
  /** Pergerakan stok terbaru (terbaru dulu) — dasar laporan stok 05.00–05.00. */
  stockMoves: StockMove[];
  soldOut: string[];
  /** Stok SIAP JUAL, terbagi per gudang lewat `gudangDari(itemId)`. */
  stock: StockRow[];
  /** Gudang Central — pasokan yang belum dikeluarkan ke outlet. */
  gudangCentral: StockRow[];
  promos: Promo[];
  voids: VoidRequest[];
  refunds: Refund[];
  orders: GuestOrder[];
  /** Notifikasi pembayaran booking yang sudah diproses — diterima MAUPUN ditolak.
   *  Gateway bisa mengirim ulang; yang kedua tidak boleh membuat booking/refund lagi. */
  paymentIds: string[];
  lights: Record<string, boolean>;
  /**
   * JEJAK AKTIVITAS. `who` = nama akun pelakunya, `venue` = venue yang
   * disentuhnya (kosong = pengaturan tingkat grup: tarif, pajak, menu,
   * gudang — milik keduanya).
   *
   * Ini TAMPILAN, bukan sumber kebenaran: riwayat yang sebenarnya adalah
   * jejak kejadian (`entries`) yang diputar ulang untuk membangun state ini.
   * Yang disimpan di sini cuma potongan terbarunya, supaya layar tidak perlu
   * memutar ulang seluruh jejak setiap kali dibuka.
   */
  log: { at: number; who: string; what: string; amount?: number; venue?: Venue }[];
  /**
   * Mesin EDC yang ada di kasir (mis. Mandiri, BRI).
   *
   * Jadi DATA VENUE, bukan daftar tertanam di kode: mesin EDC datang dan
   * pergi mengikuti perjanjian dengan banknya, dan setiap kali itu terjadi
   * laporan lama harus tetap terbaca. Venue lama tanpa penanda memakai
   * {@link MESIN_EDC_BAWAAN}.
   */
  mesinEdc?: string[];
  /** Hari operasional kejadian terakhir — pergantiannya memicu tutup buku otomatis. */
  day: string;
  /** Hari yang sudah tutup buku, terlama dulu. Tidak ikut dipindai setiap aksi. */
  history: DayArchive[];
};

/** Mesin EDC bawaan — dari laporan kasir pemilik (KAS · QRIS · MANDIRI · BRI). */
/**
 * Meja mana yang PUNYA LAMPU.
 *
 * Lampu adalah barang biliar: tiap meja biliar punya lampu sendiri di
 * atasnya, dinyalakan kasir saat tamu mulai main. Meja makan Smokehouse
 * tidak punya — mencatat "lampu meja R03" berarti menghitung sesuatu yang
 * tidak ada, dan angkanya muncul di papan serta rekap venue resto.
 */
export const punyaLampu = (tableId: string): boolean =>
  (SEMUA_MEJA.find((t) => t.id === tableId)?.type ?? "regular") !== "resto";

export const MESIN_EDC_BAWAAN = ["Mandiri", "BRI"];

/** Mesin EDC venue ini, selalu berisi minimal satu. */
export const mesinEdc = (s: Pick<State, "mesinEdc">): string[] =>
  s.mesinEdc?.length ? s.mesinEdc : MESIN_EDC_BAWAAN;

export type Action =
  | { t: "tick" }
  | { t: "login"; emp: Employee }
  | { t: "logout" }
  | { t: "openShift"; openingCash: number; venue?: Venue }
  /** `expected` dari layar DIABAIKAN — mesin menghitung kas shift sendiri. */
  | { t: "closeShift"; countedCash: number; expected?: number }
  /** `hours` diisi = buka meja paket per jam (harga blok, ada jam selesai); kosong = open bill meteran.
   *  `paketId` diisi = buka meja memakai paket pemilik (harga, jam, jatah minuman & isinya dari paket itu). */
  | { t: "walkin"; tableId: string; guest: string; hours?: number; paketId?: string }
  | { t: "checkin"; code: string }
  | { t: "extend"; id: string; minutes: number }
  /** Angka uang dari layar DIABAIKAN — dihitung ulang dari state. */
  | { t: "settle"; id: string; channel: PayChannel; promoCode?: string;
      /** Diskon manual (%) — hanya untuk peran yang punya izin `beriDiskonManual`. */
      diskonPersen?: number;
      /** Mesin EDC yang dipakai; diabaikan untuk kanal selain `edc`. */
      mesin?: string;
      amount?: number; billiard?: number; fnb?: number; discount?: number }
  /** Compliment (SMH-11b): satu baris pesanan digratiskan, ditanggung venue. */
  | { t: "compliment"; sessionId: string; key: string; alasan?: string }
  /** Gabung meja (SMH-4): beberapa meja dibayar bersama sebagai satu bill. */
  | { t: "gabungMeja"; ids: string[] }
  /** Lepas satu meja dari gabungannya. */
  | { t: "pisahMeja"; id: string }
  | { t: "relocate"; id: string; toTableId: string }
  /** Koreksi pesanan yang salah item atau salah jumlah — selama belum diserahkan ke tamu. */
  | { t: "editFnb"; sessionId: string; key: string; qty?: number; itemId?: string; variant?: string }
  /** Salah nomor meja: pindahkan baris bill ke meja lain yang sedang jalan. */
  | { t: "moveFnb"; fromId: string; toId?: string; toTableId?: string; keys: string[] }
  /** Split bill: satu orang membayar sebagian lebih dulu, sisanya tetap di bill meja. */
  | { t: "paySplit"; id: string; channel: PayChannel; keys?: string[]; amount?: number; label?: string; mesin?: string }
  /** Meteran open bill dihentikan pada jam tertentu (aplikasi/komputer sempat mati). */
  | { t: "stopMeter"; id: string; at: number }
  /** Kelas meja: reguler / VIP (bebas asap rokok) / VVIP (boleh merokok). */
  | { t: "setTableClass"; tableId: string; type: TableType }
  /** Jual / tarik satu meja dari denah. Mejanya harus ada di katalog (`SEMUA_MEJA`). */
  | { t: "setMejaDipakai"; tableId: string; dipakai: boolean }
  /** Buka/tutup pagar jam operasional — mode demo. Superadmin saja. */
  | { t: "setJamBebas"; on: boolean }
  /** Ganti nama/nomor meja (permintaan pemilik: boleh oleh kasir). */
  | { t: "setTableName"; tableId: string; name: string }
  /** Akun staf — pemilik bisa menambah superadmin lain. */
  | { t: "saveEmployee"; emp: Employee }
  | { t: "removeEmployee"; id: string }
  /** Reservasi meja Smokehouse Resto (tanpa bayar di muka). */
  | { t: "reserveResto"; res: RestoRequest }
  | { t: "toggleMaintenance"; tableId: string; reason?: string }
  | { t: "addFnb"; sessionId: string; line: CartLine; name: string; station: "kitchen" | "bar" | "billiard" }
  | { t: "ticket"; id: string; status: Ticket["status"] }
  | { t: "setRate"; key: keyof State["rates"]; value: number }
  | { t: "setPajak"; key: "ppn" | "service"; value: number }
  /** PPN/service satu lini usaha. `lini` kosong = seluruh venue (aksi lama). */
  | { t: "setPajakLini"; lini: Lini; key: "ppn" | "service"; value: number }
  /** Daftar mesin EDC di kasir (Mandiri, BRI, …). */
  | { t: "setMesinEdc"; daftar: string[] }
  | { t: "setMenuPrice"; itemId: string; price: number }
  /** Tambah/ubah barang milik pemilik sendiri (di luar buku menu). */
  | { t: "saveMenuItem"; item: { id?: string; name: string; price: number; station: "kitchen" | "bar" | "billiard" } }
  /** Nonaktifkan barang tambahan — bukan menghapus, supaya riwayatnya tetap bernama. */
  | { t: "removeMenuItem"; id: string }
  /** Tambah/ubah paket meja (harga blok + jatah minuman). */
  | { t: "savePaket"; paket: {
      id?: string; name: string; price: number; hours: number; freeDrinks: number; lastStartHour: number;
      venue?: Venue; isi?: PaketIsi[];
    } }
  /** Jual satu paket ke meja yang sedang jalan (paket makanan Smokehouse, atau paket SPL di kasir). */
  | { t: "addPaket"; sessionId: string; paketId: string }
  /** Nonaktifkan paket — sesi lama yang memakainya tetap terbaca. */
  | { t: "removePaket"; id: string }
  | { t: "toggleSoldOut"; itemId: string; name: string }
  | { t: "setStock"; itemId: string; qty: number | null; gudang?: "central" }
  | { t: "addStock"; itemId: string; delta: number; reason?: string; gudang?: "central" }
  /** Pindahkan barang dari Gudang Central ke gudang penjualannya.
   *  Barang bar ditolak: Gudang Bar berdiri sendiri. */
  | { t: "transferStock"; itemId: string; qty: number }
  /** Hitung fisik: stok disetel ke jumlah yang benar-benar ada di rak.
   *  Selisihnya tercatat sebagai "opname" — itu yang membuat angka susut
   *  bisa dipercaya, bukan sekadar sisa hitungan sistem. */
  | { t: "stockCount"; counts: { itemId: string; qty: number }[]; note?: string }
  | { t: "savePromo"; promo: Promo }
  | { t: "deletePromo"; id: string }
  | { t: "requestVoid"; req: Omit<VoidRequest, "id" | "at" | "status" | "byId" | "byName"> }
  | { t: "decideVoid"; id: string; approve: boolean }
  | { t: "toggleLight"; tableId: string }
  | { t: "allLights"; on: boolean }
  /** Pelanggan membuka halaman QRIS: slot ditahan, harga dibekukan. */
  | { t: "hold"; session: LiveSession }
  | { t: "releaseHold"; id: string }
  /** Pembayaran booking online masuk (setara webhook). */
  | { t: "confirmOnline"; session: LiveSession }
  | { t: "guestOrder"; order: GuestOrderRequest }
  /** Booking yang terlanjur dilepas sebagai no-show dipulihkan (PRD BK-80). */
  | { t: "restoreNoShow"; id: string }
  /** Superadmin mencatat dana pelanggan sudah dikembalikan. */
  | { t: "settleRefund"; id: string; method: NonNullable<Refund["method"]> }
  /** Takeaway diambil & dibayar di kasir (pesanan makanan tanpa meja). */
  | { t: "settleOrder"; id: string; channel: PayChannel; mesin?: string };

export function init(opts: { seed?: boolean } = {}): State {
  const now = clock();
  // Open bill contoh ikut membekukan tarif saat dibuka, sama seperti walk-in sungguhan.
  const sessions = (opts.seed === false ? [] : seedSessions(now)).map((x) =>
    x.status === "running" && x.source === "walkin" ? { ...x, rates: { ...RATES } } : x);
  const lights: Record<string, boolean> = {};
  for (const t of TABLES) {
    if (!punyaLampu(t.id)) continue;            // meja makan tidak punya lampu
    lights[t.id] = sessions.some((x) => x.tableId === t.id && x.status === "running");
  }
  return {
    me: null, shift: null, shiftHistory: [], employees: EMPLOYEES.map((e) => ({ ...e })),
    sessions, tickets: seedTickets(sessions, now),
    rates: { ...RATES }, pajak: { ppn: 10, service: 0 }, tableTypes: {}, tableNames: {}, customItems: [], packages: [{ ...PAKET_SIANG }], menuPrices: {}, stockMoves: [],
    soldOut: [], stock: SEED_STOCK.map((r) => ({ ...r })), gudangCentral: [],
    promos: SEED_PROMOS.map((p) => ({ ...p })),
    voids: [], refunds: [], orders: [], paymentIds: [], lights, log: [],
    day: businessDateOf(now), history: [],
  };
}

/* ═════════════ Perhitungan bersama (layar & mesin memakai yang sama) ═════════════ */

/** Meja yang dijual kalau pemilik tidak mengubah apa pun. */
const MEJA_BAWAAN = new Set(TABLES.map((t) => t.id));

/** Meja ini sedang dijual? */
export const mejaDipakai = (st: Pick<State, "mejaPakai">, tableId: string): boolean =>
  st.mejaPakai?.[tableId] ?? MEJA_BAWAAN.has(tableId);

/**
 * Meja yang SEDANG DIJUAL — inilah "denah" venue hari ini.
 *
 * Dipakai di mana pun dulu tertulis `TABLES`: papan, booking, pindah meja,
 * reservasi, rekap. `SEMUA_MEJA` tetap dipakai untuk MENCARI satu meja
 * (`cariMeja`), karena sesi lama di meja yang sudah ditarik harus tetap
 * terbaca namanya.
 */
export const mejaDijual = (st: Pick<State, "mejaPakai">) =>
  st.mejaPakai && Object.keys(st.mejaPakai).length
    ? SEMUA_MEJA.filter((t) => mejaDipakai(st, t.id))
    : TABLES;

/** Satu meja dari KATALOG — termasuk yang belum/tidak lagi dijual. */
export const cariMeja = (tableId: string) => SEMUA_MEJA.find((t) => t.id === tableId);

const nameOf = (tableId: string) => cariMeja(tableId)?.name ?? tableId;

/**
 * Nama meja yang DITAMPILKAN — nama ganti dari kasir kalau ada.
 *
 * Nama yang sudah tercetak di tiket dapur & struk TIDAK ikut berubah: keduanya
 * membekukan namanya saat dibuat. Itu disengaja — mengganti nama meja tidak
 * boleh mengubah bunyi struk yang sudah dipegang tamu.
 */
export const namaMeja = (st: Pick<State, "tableNames">, tableId: string) =>
  st.tableNames?.[tableId]?.trim() || nameOf(tableId);
/* Dari KATALOG PENUH, bukan dari meja yang kebetulan sedang dijual: meja
   makan cadangan yang baru diaktifkan harus langsung berkelas `resto`
   (tanpa sewa waktu). Kalau jatuh ke "regular", meteran Rp 29.000/jam mulai
   berjalan di meja yang seharusnya Rp 0. */
const typeOf = (tableId: string): TableType => cariMeja(tableId)?.type ?? "regular";

/** Kelas meja SEKARANG: pengaturan superadmin lebih dulu, lalu bawaan data meja. */
export const classOf = (st: Pick<State, "tableTypes">, tableId: string): TableType =>
  st.tableTypes?.[tableId] ?? typeOf(tableId);

/** Kelas yang DIBEKUKAN di sesi saat dibuka — mengubah kelas meja tidak menagih ulang tamu yang sedang main. */
export const sessionType = (s: Pick<LiveSession, "tableId" | "tableType">): TableType => s.tableType ?? typeOf(s.tableId);
/** Jam dalam hari operasional: 11..25, dan 02.00–10.59 menjadi 26..34 (tetap "malam",
 *  bukan kembali ke tarif siang, dan otomatis di luar jam buka). */
export const hourIdx = (ts: number) => { const h = diWib(ts).getUTCHours(); return h < OPEN_IDX ? h + 24 : h; };

/**
 * Jam `h` masih di dalam jam buka? SATU TEMPAT untuk enam pagar yang dulu
 * menuliskan perbandingannya sendiri-sendiri.
 *
 * Mode demo membukanya sekaligus. Ditulis begini, bukan dengan mengubah
 * `OPEN_IDX`/`CLOSE_IDX`, supaya jam buka yang sebenarnya tetap satu angka
 * yang jelas di kode — dan supaya semua pagar yang dilonggarkan bisa
 * dilihat dari satu tempat.
 */
export const dalamJamBuka = (s: Pick<State, "jamBebas">, h: number) =>
  s.jamBebas === true || (h >= OPEN_IDX && h < CLOSE_IDX);

/** Sampai jam berapa sesi boleh berjalan. Mode demo: tidak dibatasi. */
export const batasJamTutup = (s: Pick<State, "jamBebas">) =>
  s.jamBebas === true ? Number.POSITIVE_INFINITY : CLOSE_IDX;

export function rateWith(rates: State["rates"], type: TableType, hour: number) {
  if (type === "resto") return 0;
  if (type === "vip") return rates.vip;
  // Jejak lama (sebelum kelas VVIP ada) tidak punya tarif VVIP — pakai tarif VIP.
  if (type === "vvip") return rates.vvip ?? rates.vip;
  return hour < 18 ? rates.regularDay : rates.regularNight;
}

/** Harga blok jam penuh memakai tarif TERKINI (bukan konstanta). */
export function priceWith(rates: State["rates"], type: TableType, startHour: number, hours: number) {
  let total = 0;
  for (let i = 0; i < hours; i++) total += rateWith(rates, type, startHour + i);
  return total;
}

/** Harga satu menu SAAT INI. */
/**
 * Cari barang: yang DITAMBAHKAN pemilik dulu, baru buku menu.
 *
 * Urutannya begitu supaya pemilik bisa menimpa entri buku menu kalau perlu,
 * dan supaya barang tambahan tidak pernah tertutup oleh id yang kebetulan sama.
 */
export const itemOf = (st: Pick<State, "customItems">, itemId: string): MenuItem | undefined =>
  st.customItems?.find((i) => i.id === itemId) ?? findItem(itemId);

/** Seluruh barang yang bisa dijual — buku menu + tambahan pemilik. */
export const semuaItem = (st: Pick<State, "customItems">): MenuItem[] =>
  [...MENU.flatMap((c) => c.items), ...(st.customItems ?? [])];

/**
 * Daftar kategori untuk LAYAR PEMESANAN — buku menu + satu kategori
 * "Tambahan" berisi barang yang ditambahkan pemilik.
 *
 * `staf: false` membuang kategori yang hanya untuk kasir (rokok counter):
 * tidak ada yang memeriksa umur pembeli lewat HP. Barang NONAKTIF tidak ikut,
 * tapi namanya tetap terbaca di pesanan lama lewat `itemOf`.
 */
export function kategoriJual(
  st: Pick<State, "customItems">, opsi: { staf?: boolean } = {},
): MenuCategory[] {
  const dasar = opsi.staf ? MENU : MENU.filter((c) => !c.staffOnly);
  const tambahan = (st.customItems ?? []).filter((i) => i.aktif !== false
    // Barang counter tambahan (rokok, korek) ikut aturan yang sama dengan
    // kategori counter bawaan: TIDAK dijual lewat HP, karena tidak ada yang
    // memeriksa umur pembelinya. Tanpa baris ini, aturannya bocor begitu
    // pemilik menambah barang counter sendiri.
    && (opsi.staf || i.station !== "billiard"));
  return tambahan.length
    ? [...dasar, { id: "tambahan", name: "Tambahan", kicker: "ditambah pemilik", items: tambahan }]
    : dasar;
}

export const priceOf = (st: Pick<State, "menuPrices" | "customItems">, itemId: string) =>
  st.menuPrices[itemId] ?? itemOf(st, itemId)?.price ?? 0;

/**
 * Nilai satu baris. Harga DIKUNCI di baris saat dipesan (`unitPrice`), jadi
 * perubahan harga menu tidak mengubah pesanan yang sudah masuk.
 *
 * `unitPrice` dipercaya walau barangnya tidak ada di buku menu: barang
 * tambahan pemilik memang tidak di sana, dan baris hanya bisa masuk lewat
 * `cartProblem` yang sudah memastikan barangnya dikenal. Kalau tidak
 * dipercaya, seluruh bill barang tambahan jadi nol tanpa ada yang sadar.
 */
export const lineValue = (l: CartLine) => {
  if (l.unitPrice !== undefined) return l.unitPrice * l.qty;
  return (findItem(l.itemId)?.price ?? 0) * l.qty;
};

/**
 * SATU-SATUNYA cara memberi harga pesanan F&B — dipakai keranjang pelanggan,
 * booking online, pesanan QR, dan kasir: harga terkini + jatah minuman
 * gratis Paket Siang dipakai lebih dulu.
 */
export function priceLines(
  st: Pick<State, "menuPrices" | "customItems">, lines: CartLine[], freeCredits = 0,
) {
  const out: CartLine[] = [];
  let credits = Math.max(0, freeCredits);
  for (const l of lines) {
    const item = itemOf(st, l.itemId);
    const qty = Math.floor(l.qty);
    if (!item || !(qty >= 1)) continue;
    const price = priceOf(st, item.id);
    // Nama & station ikut DIBEKUKAN di baris: barang tambahan pemilik tidak
    // ada di buku menu, dan pesanan lama harus tetap terbaca utuh walau
    // barangnya kemudian dihapus.
    const extra = {
      ...(l.note ? { note: l.note } : {}),
      name: item.name, station: item.station,
    };
    const free = credits > 0 && PAKET_FREE_CATEGORIES.includes(MENU_CATEGORY_OF[item.id]) ? Math.min(credits, qty) : 0;
    if (free > 0) {
      out.push({ key: `${l.key}-gratis`, itemId: item.id, qty: free, variant: l.variant, unitPrice: 0, ...extra });
      credits -= free;
    }
    if (qty - free > 0) out.push({ key: l.key, itemId: item.id, qty: qty - free, variant: l.variant, unitPrice: price, ...extra });
  }
  return { lines: out, credits, total: out.reduce((n, l) => n + lineValue(l), 0) };
}

/**
 * Baris yang MEMAKAI jatah minuman paket — satu-satunya macam baris yang
 * mengembalikan jatahnya saat dibatalkan.
 *
 * "Harganya nol" tidak cukup, dan dulu itulah yang dipakai. Baris Rp 0
 * sekarang ada TIGA macam, dan artinya berbeda semua:
 *
 *   jatah minuman paket  — tamu memang punya hak sekian gelas; dibatalkan,
 *                          haknya kembali.
 *   compliment (`comp`)  — venue yang menanggung harganya; dibatalkan, tidak
 *                          ada hak apa pun yang kembali.
 *   isi paket            — harganya sudah di dalam harga paket; sama, tidak
 *                          ada hak yang kembali.
 *
 * Menghitung ketiganya sebagai jatah membuat tamu mendapat gelas gratis yang
 * tidak pernah dipakainya, dan venue membayarnya tanpa ada yang tahu —
 * terbukti oleh simulasi: INV-28 merah begitu compliment di meja Paket Siang
 * di-void.
 *
 * Kategorinya ikut diperiksa karena itulah syarat yang MEMBERI jatahnya
 * (lihat `priceLines`): yang bukan minuman dingin tidak pernah memakai jatah,
 * jadi tidak pernah mengembalikannya.
 */
const jatahMinuman = (l: CartLine) =>
  l.unitPrice === 0 && l.comp === undefined && !l.paket && !l.isiPaket
  && PAKET_FREE_CATEGORIES.includes(MENU_CATEGORY_OF[l.itemId]);

/** Nilai seluruh F&B dalam satu sesi (termasuk yang prabayar). */
export function fnbTotalOf(s: LiveSession): number {
  return s.fnb.reduce((n, l) => n + lineValue(l), 0);
}

/**
 * Jam tutup (02.00) SESUDAH sebuah waktu — batas akhir booking & perpanjangan.
 * Dihitung dari jam mulai sesi, jadi hasilnya sama di semua perangkat.
 */
export function closingAfter(ts: number): number {
  const biz = diWib(ts - 2 * HOUR_MS);
  return dariWib(biz.getUTCFullYear(), biz.getUTCMonth() + 1, biz.getUTCDate() + 1, CLOSE_IDX - 24);
}

/**
 * Batas akhir METERAN open bill: jam 05.00 pagi, bukan jam tutup 02.00 —
 * permintaan pemilik, karena jam 02.00 venue bisa saja masih ramai dan tamu
 * memang masih main. Lewat jam 05.00 dipastikan tidak ada lagi tamu, jadi
 * waktu sesudahnya bukan main, melainkan tab yang lupa ditutup / komputer mati.
 */
export function meterCapAfter(ts: number): number {
  const biz = diWib(ts - 2 * HOUR_MS);
  return dariWib(biz.getUTCFullYear(), biz.getUTCMonth() + 1, biz.getUTCDate() + 1, STOCK_DAY_HOUR);
}

/**
 * Sampai jam berapa meteran open bill dihitung.
 *
 * Kalau komputer/aplikasi mati dan tab tidak sempat ditutup, meteran TIDAK
 * berjalan semalaman: tagihan berhenti pukul 05.00 pagi (lihat `meterCapAfter`),
 * dan kasir tinggal menutup tabnya esok hari dengan angka yang benar.
 * Superadmin bisa menetapkan jam berhenti lain lewat aksi `stopMeter`.
 */
export const meterEndOf = (s: LiveSession, now = clock()): number =>
  s.stoppedAt !== undefined
    ? Math.max(s.startsAt, s.stoppedAt)
    : Math.max(s.startsAt, Math.min(now, meterCapAfter(s.startsAt)));

/** Nilai sewa meja: open bill per menit, booking online harga terkunci (+ perpanjangan). */
export function billiardTotalOf(
  s: LiveSession, rates: State["rates"], now = clock(),
): { amount: number; detail: BillBreakdown | null } {
  if (s.source !== "walkin" || s.status === "maintenance") return { amount: s.tableAmount, detail: null };
  // Paket per jam: harga blok yang sudah disepakati, bukan meteran. Toleransi batal
  // 5 menit tetap berlaku — tamu yang langsung pindah/batal tidak ditagih.
  if (s.blockHours) {
    const sampai = s.status === "running" ? now : (s.settledAt ?? s.endsAt);
    const lewat = Math.ceil(Math.max(0, sampai - s.startsAt) / 60_000);
    return { amount: lewat <= GRACE_MINUTES ? 0 : s.tableAmount, detail: null };
  }
  const end = s.status === "running" ? meterEndOf(s, now) : s.endsAt;
  // Tarif dibekukan saat meja dibuka — superadmin mengubah tarif tidak menagih ulang waktu yang sudah dimainkan.
  const detail = billOpenSession(sessionType(s), s.startsAt, end, s.rates ?? rates);
  return { amount: detail.amount, detail };
}

/**
 * Tagihan kasir sesi ini seandainya daftar F&B-nya menjadi `fnb` (tanpa promo).
 * Dipakai untuk menjaga: mengurangi bill tidak boleh membuat tagihan jatuh di bawah
 * uang yang SUDAH diterima lewat split bill — kalau tidak, uang tamu tidak berimbang.
 */
function counterWith(s: LiveSession, fnb: CartLine[], st: Pick<State, "rates">, now: number): number {
  const meja = s.source === "walkin" ? billiardTotalOf(s, st.rates, now).amount : (s.extraTable ?? 0);
  return meja + fnb.filter((l) => !l.prepaid).reduce((n, l) => n + lineValue(l), 0);
}

/** Kunci baris yang sudah dilunasi lewat split bill — tidak ditagih lagi dan tidak boleh diubah. */
export const paidLineKeys = (s: Pick<LiveSession, "payments">): Set<string> =>
  new Set((s.payments ?? []).flatMap((p) => p.keys ?? []));

/* ═════════════ SMH-4 · Gabung meja ═════════════
   Grup hanya PENANDA. Uangnya tetap milik mejanya masing-masing, jadi tidak
   ada rumus uang baru di sini — yang ada cuma cara mengumpulkan anggotanya. */

/** Sesi satu grup (termasuk sesi ini), urut nama meja. Tanpa grup = sendiri. */
export function grupSesi(st: Pick<State, "sessions" | "tableNames">, id: string): LiveSession[] {
  const diri = st.sessions.find((x) => x.id === id);
  if (!diri) return [];
  if (!diri.grup) return [diri];
  return st.sessions
    .filter((x) => x.grup === diri.grup)
    .sort((p, q) => namaMeja(st, p.tableId).localeCompare(namaMeja(st, q.tableId), "id"));
}

/**
 * Sisa tagihan satu grup = JUMLAH sisa tagihan tiap mejanya.
 *
 * Sengaja dihitung dengan memanggil `settlementOf` per meja, bukan dengan
 * rumus baru yang menjumlah barisnya sendiri: kalau ada dua rumus tagihan,
 * cepat atau lambat keduanya berbeda — dan yang berbeda itu uang tamu.
 */
export function tagihanGrup(
  st: Pick<State, "sessions" | "tableNames" | "rates" | "promos">, id: string, now = clock(), code?: string,
): number {
  return grupSesi(st, id)
    .filter((x) => x.status === "running")
    .reduce((n, x) => n + settlementOf(x, st, now, code).due, 0);
}

/** Nilai barang yang digratiskan di satu tab (compliment, SMH-11b). */
export const complimentOf = (s: Pick<LiveSession, "fnb">): number =>
  (s.fnb ?? []).reduce((n, l) => n + (l.comp ?? 0), 0);

/** Uang yang sudah diterima kasir SEBELUM tab ditutup (split bill / bayar per orang). */
export const splitPaidOf = (s: Pick<LiveSession, "payments">): number =>
  (s.payments ?? []).reduce((n, p) => n + p.amount, 0);

/**
 * SATU-SATUNYA rumus tutup tab. Dipakai layar untuk menampilkan tagihan
 * dan dipakai reducer untuk mencatat — tidak mungkin berbeda.
 *
 * Promo hanya memotong bagian yang dibayar DI KASIR. Yang sudah prabayar
 * online (sewa meja booking & pesanan pra-order) tidak ikut dipotong,
 * karena uangnya sudah diterima penuh.
 */
export function settlementOf(
  s: LiveSession, st: Pick<State, "rates" | "promos">, now = clock(), code?: string,
  diskonPersen = 0,
) {
  const bill = billiardTotalOf(s, st.rates, now);
  const billiard = bill.amount;
  const fnb = fnbTotalOf(s);
  const counterBilliard = s.source === "walkin" ? billiard : (s.extraTable ?? 0);
  const counterFnb = s.fnb.filter((l) => !l.prepaid).reduce((n, l) => n + lineValue(l), 0);
  /**
   * Promo dinilai pada AKHIR WAKTU YANG DITAGIH, bukan saat kasir menekan tombol.
   *
   * Meteran open bill berhenti pukul 05.00. Tab yang lupa ditutup baru disentuh
   * siang harinya akan "sekarang"-nya belasan jam sesudah tamunya pulang — dan
   * dulu itu membuatnya kebagian Happy Hour Siang yang tidak pernah dimainkan.
   * Untuk tab yang ditutup wajar, akhir tagih ≈ sekarang, jadi tidak ada bedanya.
   */
  const akhirTagih = s.source === "walkin" && !s.blockHours && s.status === "running"
    ? meterEndOf(s, now)
    : now;
  const promo = bestPromo(st.promos, counterBilliard, counterFnb, akhirTagih, code);
  // Split bill: yang sudah dibayar per orang dikurangkan dari sisa tagihan, dan promo
  // tidak boleh membuat tagihan jatuh di bawah uang yang sudah diterima kasir.
  const dibayarSebagian = splitPaidOf(s);
  /**
   * DISKON MANUAL (SMH-11b) TIDAK DITUMPUK dengan promo — yang dipakai hanya
   * yang lebih besar. Itu sikap yang sama dengan `bestPromo`, dan alasannya
   * sama: diskon bertumpuk adalah kebocoran margin yang paling sulit dilacak,
   * karena tidak ada satu angka pun di laporan yang salah — hanya hasil
   * akhirnya yang terlalu kecil.
   */
  const pst = Math.min(100, Math.max(0, Math.floor(diskonPersen)));
  const manual = pst > 0
    ? Math.floor(((counterBilliard + counterFnb) * pst) / 100)
    : 0;
  const diminta = Math.max(promo?.discount ?? 0, manual);
  const discount = Math.max(0, Math.min(diminta, counterBilliard + counterFnb - dibayarSebagian));
  /** Bagian diskon yang benar-benar berasal dari diskon manual (untuk laporan). */
  const diskonManual = manual >= (promo?.discount ?? 0) ? discount : 0;
  /** Seluruh tagihan kasir sebelum dikurangi pembayaran sebagian. */
  const tagihan = Math.max(0, counterBilliard + counterFnb - discount);
  const due = Math.max(0, tagihan - dibayarSebagian);
  return {
    billiard, fnb, counterBilliard, counterFnb, discount, diskonManual,
    tagihan, dibayarSebagian, due, promo, detail: bill.detail,
    /**
     * Nilai barang yang digratiskan di tab ini — DIHITUNG DARI BARISNYA.
     * Tidak ditimbun di sesi: baris compliment yang kemudian di-void atau
     * dipindah ke meja lain harus ikut membawa biayanya, dan angka timbunan
     * tidak akan pernah tahu itu terjadi.
     */
    compliment: complimentOf(s),
  };
}

/** Uang tunai yang seharusnya ada di laci untuk shift yang sedang jalan. */
export function shiftCashExpected(st: State, shift = st.shift): number {
  if (!shift) return 0;
  const tutupTab = st.sessions
    .filter((s) => s.status === "done" && s.settledShiftId === shift.id && s.settledChannel === "cash")
    .reduce((n, s) => n + (s.settledAmount ?? 0), 0);
  // Split bill: uang tunai yang sudah masuk laci sebelum tab ditutup ikut dihitung.
  const sebagian = st.sessions.reduce((n, s) => n + (s.payments ?? [])
    .filter((p) => p.shiftId === shift.id && p.channel === "cash")
    .reduce((m, p) => m + p.amount, 0), 0);
  // Takeaway yang dibayar tunai saat diambil juga masuk laci shift ini.
  const takeaway = st.orders.reduce((n, o) =>
    n + (o.payment && o.payment.shiftId === shift.id && o.payment.channel === "cash" ? o.payment.amount : 0), 0);
  return shift.openingCash + tutupTab + sebagian + takeaway;
}

/* ═════════════ Alasan penolakan — satu sumber untuk mesin DAN layar ═════════════
   Layar memanggil fungsi yang sama sebelum tamu membayar, supaya tamu tidak
   pernah membayar sesuatu yang pasti ditolak mesin. */

/**
 * Syarat satu paket bersewa waktu. null = boleh.
 *
 * SATU TEMPAT untuk dua pintu yang menjual paket yang sama: booking online
 * lewat `slotProblem`, dan kasir yang membuka meja lewat `walkin`. Kalau
 * syaratnya ditulis dua kali, cepat atau lambat keduanya berbeda — dan yang
 * berbeda itu harga yang ditagih ke tamu.
 *
 * Paket yang sudah dinonaktifkan tidak bisa dipakai lagi, tapi sesi lama yang
 * memakainya tetap terbaca (`paketOf` sengaja tidak menyaring aktif).
 */
export function paketProblem(
  s: Pick<State, "packages">, paketId: string,
  r: { kelas: TableType; hours: number; startH: number },
): string | null {
  const pk = paketOf(s, paketId);
  if (!pk || pk.aktif === false) return "paket tidak tersedia";
  if (pk.hours <= 0) return `${pk.name} bukan paket meja`;
  if (r.kelas !== "regular") return `${pk.name} hanya untuk meja reguler`;
  if (r.hours !== pk.hours) return `${pk.name} lamanya ${pk.hours} jam`;
  if (r.startH > pk.lastStartHour) return `${pk.name} paling lambat mulai jam ${pk.lastStartHour}.00`;
  return null;
}

/** Masalah slot booking online. null = boleh. */
export function slotProblem(
  s: Pick<State, "sessions" | "tableTypes" | "packages" | "mejaPakai" | "jamBebas">,
  /** `paket` = ID paket yang dipilih, bukan ya/tidak — sejak paket bisa
   *  lebih dari satu, "pakai paket" saja tidak cukup untuk menilai syaratnya. */
  r: { tableId: string; startsAt: number; hours: number; paket?: string },
  now = clock(), lead = true, ignoreId?: string,
): string | null {
  const table = cariMeja(r.tableId);
  if (!table) return "meja tidak dikenal";
  if (!mejaDipakai(s, r.tableId)) return "meja ini tidak dijual";
  const kelas = classOf(s, r.tableId);
  if (kelas === "resto") return "meja resto dipesan lewat reservasi resto";
  if (!Number.isInteger(r.hours) || r.hours < 1) return "durasi tidak valid";
  const d = new Date(r.startsAt);
  if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) return "jam mulai harus tepat di awal jam";
  const startH = hourIdx(r.startsAt);
  if (!dalamJamBuka(s, startH) || startH + r.hours > batasJamTutup(s)) return "di luar jam operasional";
  if (r.startsAt <= now) return "slot sudah lewat";
  if (lead && r.startsAt - now < MIN_LEAD_MIN * 60_000) return `booking online paling cepat ${MIN_LEAD_MIN} menit sebelum main`;
  if (r.paket) {
    const pp = paketProblem(s, r.paket, { kelas, hours: r.hours, startH });
    if (pp) return pp;
  }
  if (!tableFreeForRange(s.sessions, table.id, r.startsAt, r.startsAt + r.hours * HOUR_MS, ignoreId, now)) {
    return "slot sudah terisi";
  }
  // Hanya untuk booking online (lead): meja yang sedang dimainkan (running / open bill)
  // tidak boleh dijual lewat aplikasi pada hari yang sama karena tamu di lokasi sedang bermain.
  // Kasir (lead=false) tetap boleh mengatur meja itu sendiri karena dia melihat tamunya langsung.
  if (lead && (openBillOn(s.sessions, table.id, businessDateOf(r.startsAt)) ||
      s.sessions.some((x) => x.tableId === table.id && x.status === "running" && businessDateOf(x.startsAt) === businessDateOf(r.startsAt)))) {
    return "meja ini sedang aktif dipakai bermain — pilih meja lain";
  }
  return null;
}

/** Masalah isi keranjang: item tidak valid, habis, atau stok kurang. */
export function cartProblem(
  s: Pick<State, "soldOut" | "stock" | "customItems">, lines: CartLine[],
): string | null {
  const need: Record<string, number> = {};
  for (const l of lines) {
    // Barang tambahan pemilik ikut dikenali — ini satu-satunya pintu masuk
    // baris pesanan, jadi di sinilah barang tak dikenal harus dihentikan.
    const it = itemOf(s, l.itemId);
    if (!it || !Number.isInteger(l.qty) || l.qty < 1) return "item pesanan tidak valid";
    if (s.soldOut.includes(it.id)) return `${it.name} sedang habis`;
    need[it.id] = (need[it.id] ?? 0) + l.qty;
  }
  for (const [id, q] of Object.entries(need)) {
    const row = s.stock.find((r) => r.itemId === id);
    if (row && row.qty !== null && row.qty < q) return `stok ${itemOf(s, id)!.name} tinggal ${row.qty}`;
  }
  return null;
}

export const runningOn = (s: Pick<State, "sessions">, tableId?: string) =>
  tableId ? s.sessions.find((x) => x.tableId === tableId && x.status === "running") : undefined;

/** Masalah pesanan tamu (QR meja / takeaway). null = boleh. */
export function guestOrderProblem(
  s: State, o: Pick<GuestOrderRequest, "mode" | "tableId" | "pay" | "lines" | "sessionId">, now = clock(),
): string | null {
  if (o.lines.length === 0) return "pesanan masih kosong";
  const h = hourIdx(now);
  if (!dalamJamBuka(s, h)) return "Dapur sedang tutup. Buka lagi pukul 11.00.";
  if (o.mode === "meja") {
    const t = o.tableId ? cariMeja(o.tableId) : undefined;
    if (!t) return "pilih nomor meja dulu";
    if (!mejaDipakai(s, t.id)) return "meja ini tidak dijual";
    const run = runningOn(s, t.id);
    if (!run) {
      /*
       * MEJA RESTO MEMBUKA DIRINYA SENDIRI saat tamu memesan.
       *
       * Di resto, yang "membuka meja" adalah tamu yang duduk lalu memesan —
       * bukan kasir yang menekan tombol. Aturan lama ("minta kasir membuka
       * meja dulu") datang dari meja biliar, dan di sana memang benar:
       * membuka meja biliar MENJALANKAN METERAN, jadi hanya kasir yang boleh.
       * Meja makan tidak bersewa waktu — tidak ada rupiah pun yang bergerak
       * karena mejanya terbuka, jadi tidak ada alasan menahan tamu yang sudah
       * duduk dan lapar.
       *
       * Yang tetap dijaga: mejanya memang kosong pada jam itu (tidak sedang
       * rusak, dan tidak bentrok dengan reservasi yang sebentar lagi datang).
       */
      if (classOf(s, t.id) !== "resto") {
        return `${t.name} belum dibuka kasir — minta kasir membuka meja dulu`;
      }
      if (!tableFreeForRange(s.sessions, t.id, now, now + RESTO_BUKA_MENIT * 60_000, undefined, now)) {
        return `${t.name} sudah dipesan untuk jam ini — tanya kasir ya`;
      }
    }
    if (run && o.sessionId && !o.sessionId.startsWith("pub-") && run.id !== o.sessionId) {
      return `tab ${t.name} sudah berganti — scan QR di meja lagi`;
    }
  }
  // Takeaway boleh "bayar di kasir": dapur menyiapkan, tamu membayar saat mengambil.
  // Uangnya baru diakui setelah kasir menandai lunas (aksi `settleOrder`).
  return cartProblem(s, o.lines);
}

/* ── Stok ────────────────────────────────────────────────────────── */

/** Stok 0 selalu berarti habis. */
function syncSoldOut(stock: StockRow[], soldOut: string[]) {
  const zero = stock.filter((r) => r.qty === 0).map((r) => r.itemId);
  const out = new Set(soldOut);
  for (const id of zero) out.add(id);
  return [...out];
}

/** Kurangi stok untuk sekumpulan baris. null = stok tidak cukup (tolak). */
function takeStock(stock: StockRow[], lines: CartLine[]): StockRow[] | null {
  const need: Record<string, number> = {};
  for (const l of lines) need[l.itemId] = (need[l.itemId] ?? 0) + l.qty;
  for (const [id, q] of Object.entries(need)) {
    const row = stock.find((r) => r.itemId === id);
    if (row && row.qty !== null && row.qty < q) return null;
  }
  return stock.map((r) => (need[r.itemId] && r.qty !== null ? { ...r, qty: r.qty - need[r.itemId] } : r));
}

function returnStock(stock: StockRow[], soldOut: string[], lines: CartLine[]) {
  // Baris PRA-PESAN belum pernah memotong stok, jadi tidak ada yang bisa
  // dikembalikan. Disaring DI SINI, bukan di lima pemanggilnya (no-show,
  // void sesi, void baris, void pesanan, koreksi) — satu pemanggil yang lupa
  // berarti stok tercipta dari udara, dan itu baru ketahuan saat opname.
  lines = lines.filter((l) => !l.pra);
  const back: Record<string, number> = {};
  for (const l of lines) back[l.itemId] = (back[l.itemId] ?? 0) + l.qty;
  const next = stock.map((r) => (back[r.itemId] && r.qty !== null ? { ...r, qty: r.qty + back[r.itemId] } : r));
  // Hanya tanda habis OTOMATIS (stok tadinya 0) yang dicabut. Tanda habis manual
  // (mis. mesin es rusak) tetap berlaku walau ada barang yang kembali ke stok.
  const restocked = stock.filter((r) => back[r.itemId] && r.qty === 0).map((r) => r.itemId);
  return { stock: next, soldOut: soldOut.filter((id) => !restocked.includes(id)) };
}

/** Penuhi baris satu per satu; yang habis/stoknya kurang dipisahkan (untuk dikembalikan dananya). */
function fulfil(st: Pick<State, "soldOut" | "stock">, lines: CartLine[]) {
  let stock = st.stock;
  const taken: CartLine[] = [];
  const dropped: CartLine[] = [];
  for (const l of lines) {
    const next = st.soldOut.includes(l.itemId) ? null : takeStock(stock, [l]);
    if (!next) { dropped.push(l); continue; }
    stock = next;
    // Stoknya baru saja diambil, jadi barisnya bukan pra-pesan lagi. Dicopot
    // di sini supaya tidak ada jalan yang bisa memotong stoknya dua kali.
    taken.push(l.pra ? tanpaPra(l) : l);
  }
  return { taken, dropped, stock };
}

/** Baris yang sama tanpa penanda pra-pesan. */
const tanpaPra = (l: CartLine): CartLine => {
  const { pra: _p, ...sisa } = l;
  return sisa;
};

/** Kunci baris unik dalam satu sesi — void menunjuk baris lewat kuncinya. */
function withUniqueKeys(existing: CartLine[], lines: CartLine[], prefix: string): CartLine[] {
  const used = new Set(existing.map((l) => l.key));
  return lines.map((l) => {
    let key = l.key;
    for (let i = 1; used.has(key); i++) key = `${prefix}${l.key}~${i}`;
    used.add(key);
    return key === l.key ? l : { ...l, key };
  });
}

/* ── Audit ───────────────────────────────────────────────────────── */
/**
 * Batas baris jejak yang disimpan di state.
 *
 * Dinaikkan dari 500 ke 2.000 (21 Okt 2026): di malam ramai dengan dua venue,
 * 500 baris habis sebelum tengah malam, dan pemilik yang membuka panel jejak
 * besok pagi tidak menemukan apa-apa dari shift kemarin.
 *
 * Ini cuma potongan terbaru untuk ditampilkan — riwayat yang sebenarnya tetap
 * utuh di jejak kejadian (`entries`), yang diputar ulang membentuk state ini.
 * Menaikkannya tidak menambah apa pun yang dikirim antar perangkat; yang
 * dikirim kejadiannya, bukan state-nya.
 */
export const JEJAK_MAKS = 2_000;

function note(s: State, what: string, amount?: number, who?: string, at = clock()): State["log"] {
  return [{ at, who: who ?? s.me?.name ?? "sistem", what, amount }, ...s.log].slice(0, JEJAK_MAKS);
}

const allow = (s: State, p: Permission) => can(s.me?.role ?? null, p);

/**
 * Masih ada kunci induk? Yaitu superadmin aktif yang TIDAK terikat venue.
 *
 * Tanpa pagar ini pemilik bisa mengikat satu-satunya superadminnya ke
 * Smokehouse — lalu tidak ada seorang pun yang bisa mengurus SPL lagi, dan
 * tidak ada jalan kembali karena mengubah akun itu sendiri sudah terhitung
 * aksi lintas venue.
 */
const adaKunciInduk = (list: Employee[]) =>
  list.some((x) => x.active && x.role === "superadmin" && !x.venue);

/** Tiket membekukan nama meja SAAT DIBUAT — kalau namanya diganti nanti,
 *  tiket yang sudah di dapur tidak ikut berubah. */
const forSession = (st: Pick<State, "tableNames">, x: LiveSession) =>
  ({ id: x.id, tableName: namaMeja(st, x.tableId) });

function ticketsFor(target: { id: string; tableName: string }, lines: CartLine[], now: number, via?: string): Ticket[] {
  // Barang counter biliar (rokok, botolan) TIDAK membuat tiket: tidak ada yang
  // perlu disiapkan, kasir menyerahkannya langsung. Barisnya tetap masuk bill,
  // stok, dan rekap — yang tidak ada cuma tiketnya.
  return lines.flatMap((l) => {
    const it = findItem(l.itemId);
    if ((l.station ?? it?.station) === "billiard") return [];
    // Baris HARGA PAKET bukan hidangan: yang dimasak adalah isinya, yang
    // sudah punya barisnya sendiri. Tanpa pagar ini satu paket keluarga
    // mencetak dua tiket untuk makanan yang sama.
    if (l.paket) return [];
    return [{
      id: nextId("tk"), sessionId: target.id, tableName: target.tableName,
      itemId: l.itemId, name: l.name ?? it?.name ?? l.itemId, qty: l.qty, variant: l.variant,
      ...(l.note ? { note: l.note } : {}),
      // Nama & station dari BARIS dulu: barang tambahan pemilik tidak ada di
      // buku menu, dan pesanan lama harus tetap terbaca walau barangnya dihapus.
      station: (l.station ?? it?.station ?? "kitchen") as Ticket["station"], status: "new" as const, at: now, lineKey: l.key,
      ...(via ? { via } : {}),
    }];
  });
}

/* ═════════════ Detak waktu ═════════════
   Hasilnya TIDAK bergantung kapan detak dijalankan: no-show dicatat pada
   saat ia seharusnya dilepas (jam mulai + 20 menit), hold pada batasnya.
   Karena itu dua perangkat yang berdetak di detik berbeda tetap sama. */

/**
 * Kapan booking boleh dilepas sebagai no-show. Hitungan 20 menit baru berjalan
 * saat mejanya benar-benar bisa ditempati: tamu yang datang tepat waktu tapi
 * mejanya masih dipakai sesi sebelumnya tidak boleh kehilangan booking & uangnya.
 * null = belum bisa dilepas karena meja masih dipakai sesi lain.
 */
export function noShowDueAt(sessions: LiveSession[], bk: LiveSession, now = clock()): number | null {
  let from = Math.max(bk.startsAt, bk.readyAt ?? 0);
  for (const x of sessions) {
    if (x.id === bk.id || x.tableId !== bk.tableId) continue;
    if (x.status === "running" && x.startsAt < bk.endsAt && blockEndOf(x, now) > bk.startsAt) return null;
    if (x.status === "done" && x.startsAt < bk.startsAt) {
      const left = x.settledAt ?? x.endsAt;           // kapan rombongan sebelumnya benar-benar selesai
      if (left > from) from = left;
    }
  }
  // Meja tidak pernah bisa ditempati sepanjang jadwalnya: itu bukan no-show. Uang tamu
  // tidak diakui sebagai pendapatan — kasir yang memutuskan (void + refund).
  if (from >= bk.endsAt) return null;
  return from + NO_SHOW_RELEASE_MIN * 60_000;
}

/** Booking yang jadwalnya sudah lewat tanpa pernah bisa check-in — perlu keputusan kasir. */
export const bookingLapsed = (x: LiveSession, now = clock()) => x.status === "booked" && now >= x.endsAt;

/**
 * Sesi berjalan `leaving` meninggalkan mejanya (dipindah / di-void). Booking di meja itu
 * yang sudah lewat jam mulai tapi tertahan olehnya baru mulai menghitung 20 menit sekarang —
 * bukan langsung dilepas karena jam bookingnya sudah lama lewat.
 */
function markReady(sessions: LiveSession[], leaving: LiveSession, now: number): LiveSession[] {
  if (leaving.status !== "running") return sessions;
  return sessions.map((x) =>
    x.status === "booked" && x.id !== leaving.id && x.tableId === leaving.tableId && now > x.startsAt &&
    leaving.startsAt < x.endsAt && blockEndOf(leaving, now) > x.startsAt
      ? { ...x, readyAt: Math.max(x.readyAt ?? 0, now) }
      : x);
}

/* ═════════════ Tutup buku harian ═════════════
   Tanpa ini, setiap sesi, tiket, dan pesanan sejak hari pertama ikut dipindai pada
   SETIAP aksi: uji ketahanan 10 hari mencatat aksi 10× lebih lambat dan pemutaran
   ulang 14 detik. Hari yang sudah selesai sebelum kemarin dipindah ke arsip —
   angkanya dibekukan persis seperti rekap saat masih aktif. */

export const shiftDate = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  // Tengah hari WIB: jauh dari batas tanggal, jadi geseran hari tidak pernah meleset.
  return tanggalWib(dariWib(y, m, d + days, 12));
};

const compactSession = (x: ArchivedSession): ArchivedSession => ({
  id: x.id, tableId: x.tableId, source: x.source, guest: x.guest, bookingCode: x.bookingCode, checkin: x.checkin,
  status: x.status, startsAt: x.startsAt, endsAt: x.endsAt, settledAt: x.settledAt, settledChannel: x.settledChannel,
  settledAmount: x.settledAmount, settledBilliard: x.settledBilliard, settledFnb: x.settledFnb,
  settledDiscount: x.settledDiscount, paidOnline: x.paidOnline, payments: x.payments,
  settledShiftId: x.settledShiftId, settledCompliment: x.settledCompliment,
  settledDiskonManual: x.settledDiskonManual, settledMesin: x.settledMesin,
});

/**
 * Nama mesin EDC yang SAH untuk dicatat. Kanal selain EDC tidak punya mesin,
 * dan mesin yang tidak terdaftar di venue ini diabaikan — kalau tidak, satu
 * perangkat yang mengirim nama karangan akan membuat kolom laporan baru yang
 * tidak pernah bisa dicocokkan dengan setoran bank mana pun.
 */
const mesinSah = (s: Pick<State, "mesinEdc">, kanal: PayChannel, mesin?: string): string | undefined => {
  if (kanal !== "edc" || !mesin) return undefined;
  return mesinEdc(s).find((m) => m.toLowerCase() === mesin.trim().toLowerCase());
};

const compactOrder = (o: ArchivedOrder & { lines?: CartLine[] }): ArchivedOrder => ({
  id: o.id, code: o.code, at: o.at, guest: o.guest, mode: o.mode, tableId: o.tableId, pay: o.pay,
  value: o.value, paidOnline: o.paidOnline, sessionId: o.sessionId, status: o.status, reason: o.reason,
  payment: o.payment,
  // Dihitung di sini karena DI SINI barisnya masih ada.
  ...(o.lini ? { lini: o.lini } : o.lines ? { lini: liniDariLines(o.lines) } : {}),
});

/**
 * TAB TERTINGGAL yang TIDAK ADA TAGIHANNYA ditutup sendiri saat tutup buku.
 *
 * Satu tab yang lupa ditutup dulu mengunci hari itu selamanya: `closeBooks`
 * menolak mengarsipkan hari yang masih punya sesi berjalan, jadi rekapnya
 * menggantung dan mejanya tidak pernah bebas.
 *
 * Yang ditutup di sini HANYA yang sisa tagihannya nol — tamu batal dalam 5
 * menit, atau sudah lunas lewat split bill / prabayar online. Tidak ada
 * keputusan uang yang diambil mesin: angkanya memang sudah nol.
 *
 * Tab yang MASIH ADA TAGIHANNYA sengaja dibiarkan terbuka. Menutupnya berarti
 * menebak tamunya bayar tunai atau tidak sama sekali — itu urusan kasir, dan
 * layar Kasir sudah menandainya "tab belum ditutup dari hari sebelumnya".
 *
 * Batasnya sama dengan batas pengarsipan (lebih tua dari kemarin), supaya tab
 * semalam yang akan ditutup shift pagi tidak ikut tersapu.
 */
function closeAbandoned(s: State, today: string, now: number): State {
  const batas = shiftDate(today, -1);
  const tutup = s.sessions.filter((x) =>
    x.status === "running" && businessDateOf(x.startsAt) < batas && settlementOf(x, s, now).due <= 0);
  if (tutup.length === 0) return s;

  const ids = new Set(tutup.map((x) => x.id));
  let log = s.log;
  const lights = { ...s.lights };
  for (const x of tutup) {
    lights[x.tableId] = false;
    log = [{ at: now, who: "sistem",
      what: `Tab tertinggal ditutup otomatis · ${namaMeja(s, x.tableId)} · ${x.guest} · tidak ada tagihan`,
      amount: 0 }, ...log].slice(0, 500);
  }
  return {
    ...s,
    sessions: s.sessions.map((x) => {
      if (!ids.has(x.id)) return x;
      const bill = settlementOf(x, s, now);
      return {
        ...x, status: "done" as const,
        endsAt: x.source === "walkin" && !x.blockHours ? meterEndOf(x, now) : x.endsAt,
        // Tanpa kanal: memang tidak ada uang yang berpindah saat penutupan ini.
        settledChannel: undefined, settledAmount: 0,
        settledBilliard: bill.billiard, settledFnb: bill.fnb, settledDiscount: bill.discount,
        settledLini: liniSesi(x, bill.billiard),
        settledAt: now,
      };
    }),
    lights, log,
  };
}

function closeBooks(s: State, today: string, now: number): State {
  const yesterday = shiftDate(today, -1);
  const dayOf = businessDateOf;
  const isClosed = (x: LiveSession) => x.status === "done" || x.status === "noshow";
  // Hari yang masih hidup tidak diarsipkan: masih ada tab berjalan, ada tab yang baru
  // ditutup kemarin/hari ini, atau uangnya masih dihitung shift yang sedang buka.
  const blocked = new Set<string>();
  for (const x of s.sessions) {
    if (x.status === "running") blocked.add(dayOf(x.startsAt));
    else if (isClosed(x) && (dayOf(x.settledAt ?? x.endsAt) >= yesterday || (s.shift &&
      (x.settledShiftId === s.shift.id || (x.payments ?? []).some((p) => p.shiftId === s.shift!.id))))) {
      blocked.add(dayOf(x.startsAt));
    }
  }
  const liveIds = new Set(s.sessions.map((x) => x.id));
  const dates = new Set<string>();
  const consider = (d: string) => { if (d < yesterday && !blocked.has(d)) dates.add(d); };
  for (const x of s.sessions) if (isClosed(x)) consider(dayOf(x.startsAt));
  for (const o of s.orders) if (!o.sessionId || !liveIds.has(o.sessionId)) consider(dayOf(o.at));
  for (const v of s.voids) if (v.status !== "menunggu") consider(dayOf(v.decidedAt ?? v.at));
  for (const r of s.refunds) if (r.settledAt) consider(dayOf(r.settledAt));
  if (dates.size === 0) return { ...s, day: today };

  const goneSessions = new Set<string>(), goneOrders = new Set<string>(), goneVoids = new Set<string>(), goneRefunds = new Set<string>();
  const history = [...s.history];
  let log = s.log;
  for (const d of [...dates].sort()) {
    const sx = s.sessions.filter((x) => isClosed(x) && dayOf(x.startsAt) === d);
    const sxIds = new Set(sx.map((x) => x.id));
    const ox = s.orders.filter((o) => (o.sessionId && liveIds.has(o.sessionId) ? sxIds.has(o.sessionId) : dayOf(o.at) === d));
    const vx = s.voids.filter((v) => v.status !== "menunggu" && dayOf(v.decidedAt ?? v.at) === d);
    const rx = s.refunds.filter((r) => r.settledAt && dayOf(r.settledAt) === d);
    // Angka dibekukan dengan rumus yang SAMA dengan rekap saat hari itu masih aktif.
    const takeaway = s.orders.filter((o) => o.status === "diterima" && !o.sessionId && dayOf(o.at) === d);
    const money = dayMoney(sx, takeaway, s.orders, s);
    const counts = dayCounts(sx, takeaway);
    // Produk dibekukan SEBELUM barisnya dilepas, dengan rumus yang sama yang
    // dipakai laporan hari hidup — jadi angka beku tidak mungkin berbeda.
    const produk = produkHari(s, sx, takeaway);
    const entry: DayArchive = {
      bizDate: d, money, counts,
      produk,
      sessions: sx.map(compactSession), orders: ox.map(compactOrder), voids: vx, refunds: rx,
    };
    const i = history.findIndex((h) => h.bizDate === d);
    if (i >= 0) {
      const h = history[i];
      const byChannel = { ...h.money.byChannel };
      for (const [k, v] of Object.entries(money.byChannel)) byChannel[k] = { n: (byChannel[k]?.n ?? 0) + v.n, gross: (byChannel[k]?.gross ?? 0) + v.gross };
      const sum = (k: Exclude<keyof DayMoney, "byChannel" | "perLini">) => (h.money[k] ?? 0) + (money[k] ?? 0);
      // Dua arsip hari yang sama digabung: pecahan liniannya ikut dijumlah,
      // kalau tidak laporan pajak kehilangan separuh harinya tanpa suara.
      const perLini = (h.money.perLini || money.perLini) ? LINI.reduce((o, k) => {
        const x = h.money.perLini?.[k], y = money.perLini?.[k];
        o[k] = {
          gross: (x?.gross ?? 0) + (y?.gross ?? 0), dpp: (x?.dpp ?? 0) + (y?.dpp ?? 0),
          tax: (x?.tax ?? 0) + (y?.tax ?? 0), service: (x?.service ?? 0) + (y?.service ?? 0),
        };
        return o;
      }, {} as NonNullable<DayMoney["perLini"]>) : undefined;
      history[i] = {
        bizDate: d,
        money: { billiard: sum("billiard"), fnb: sum("fnb"), discount: sum("discount"), gross: sum("gross"), diterima: sum("diterima"),
          prabayar: sum("prabayar"), byChannel, dpp: sum("dpp"), tax: sum("tax"), service: sum("service"),
          mdr: sum("mdr"), net: sum("net"), compliment: sum("compliment"), diskonManual: sum("diskonManual"),
          ...(perLini ? { perLini } : {}) },
        counts: {
          done: h.counts.done + counts.done, noShow: h.counts.noShow + counts.noShow, takeaway: h.counts.takeaway + counts.takeaway,
          takeawayValue: h.counts.takeawayValue + counts.takeawayValue, playedHours: h.counts.playedHours + counts.playedHours,
        },
        ...(h.rowsDropped ? { rowsDropped: true } : {}),
        produk: gabungProduk(h.produk ?? [], produk),
        sessions: [...h.sessions, ...entry.sessions], orders: [...h.orders, ...entry.orders],
        voids: [...h.voids, ...vx], refunds: [...h.refunds, ...rx],
      };
    } else {
      history.push(entry);
    }
    sx.forEach((x) => goneSessions.add(x.id));
    ox.forEach((o) => goneOrders.add(o.id));
    vx.forEach((v) => goneVoids.add(v.id));
    rx.forEach((r) => goneRefunds.add(r.id));
    log = [{ at: now, who: "sistem", what: `Tutup buku hari ${d} · ${sx.length} sesi, ${ox.length} pesanan diarsipkan`, amount: money.gross }, ...log].slice(0, 500);
  }
  history.sort((p, q) => (p.bizDate < q.bizDate ? -1 : 1));
  // Rincian baris hari yang sudah lama dilepas; angka & hitungannya tetap.
  const rowCutoff = shiftDate(today, -ARCHIVE_ROW_DAYS);
  const produkCutoff = shiftDate(today, -PRODUK_DAYS);
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    let x = h;
    if (x.bizDate < rowCutoff && !x.rowsDropped) {
      x = {
        bizDate: x.bizDate, money: x.money, counts: x.counts, rowsDropped: true,
        // Ringkasan per produk TIDAK ikut dilepas di sini: ia yang membuat
        // laporan penjualan per produk masih bisa menjawab pertanyaan bulan
        // lalu, dan umurnya sendiri jauh lebih panjang (`PRODUK_DAYS`).
        ...(x.produk ? { produk: x.produk } : {}),
        sessions: [], orders: [], voids: [], refunds: [],
      };
    }
    if (x.bizDate < produkCutoff && x.produk) {
      const { produk: _p, ...sisa } = x;
      x = sisa;
    }
    if (x !== h) history[i] = x;
  }

  // Keadilan no-show tetap sama: booking yang hitungannya bergantung pada kapan rombongan
  // sebelumnya pulang menyimpan waktu itu sendiri, karena catatan rombongannya diarsipkan.
  const sessions = s.sessions.filter((x) => !goneSessions.has(x.id)).map((bk) => {
    if (bk.status !== "booked") return bk;
    let ready = Math.max(bk.startsAt, bk.readyAt ?? 0);
    for (const x of s.sessions) {
      if (!goneSessions.has(x.id) || x.status !== "done" || x.tableId !== bk.tableId || x.startsAt >= bk.startsAt) continue;
      ready = Math.max(ready, x.settledAt ?? x.endsAt);
    }
    return ready > Math.max(bk.startsAt, bk.readyAt ?? 0) ? { ...bk, readyAt: ready } : bk;
  });
  return {
    ...s, sessions, history, log, day: today,
    orders: s.orders.filter((o) => !goneOrders.has(o.id)),
    tickets: s.tickets.filter((k) => !goneSessions.has(k.sessionId) && !goneOrders.has(k.sessionId)),
    voids: s.voids.filter((v) => !goneVoids.has(v.id)),
    refunds: s.refunds.filter((r) => !goneRefunds.has(r.id)),
  };
}

export function tickState(s: State, now = clock()): State {
  // Lepas dulu no-show & hold yang jatuh tempo, BARU tutup buku — no-show milik hari yang
  // diarsipkan harus ikut masuk arsip hari itu, bukan tertinggal di luar rekapnya.
  const released = withStockMoves(s, releaseDue(s, now), now, () => "kembali");
  const today = businessDateOf(now);
  if (today <= released.day) return rapikanLampu(rapikanGrup(released));
  // Tab tertinggal tanpa tagihan ditutup DULU, baru bukunya — kalau tidak, satu
  // tab yang lupa ditutup mengunci rekap hari itu selamanya.
  return rapikanLampu(rapikanGrup(closeBooks(closeAbandoned(released, today, now), today, now)));
}

function releaseDue(s: State, now: number): State {
  type Ev = { at: number; x: LiveSession; kind: "noshow" | "hold" };
  const events: Ev[] = [];
  for (const x of s.sessions) {
    // Paling cepat dilepas 20 menit setelah jam mulai — booking lain tidak perlu dihitung.
    const due = x.status === "booked" && x.startsAt + NO_SHOW_RELEASE_MIN * 60_000 < now
      ? noShowDueAt(s.sessions, x, now) : null;
    if (due !== null && due < now) {
      events.push({ at: due, x, kind: "noshow" });
    } else if (x.status === "hold" && (x.holdUntil ?? 0) <= now) {
      events.push({ at: x.holdUntil ?? now, x, kind: "hold" });
    }
  }
  if (events.length === 0) return s;
  events.sort((p, q) => p.at - q.at || (p.x.id < q.x.id ? -1 : p.x.id > q.x.id ? 1 : 0));

  let stock = s.stock, soldOut = s.soldOut, log = s.log;
  const changed = new Map<string, LiveSession | null>();
  for (const ev of events) {
    const x = ev.x;
    if (ev.kind === "hold") {
      changed.set(x.id, null);
      log = [{ at: ev.at, who: "sistem", what: `Hold kedaluwarsa dilepas · ${namaMeja(s, x.tableId)} · ${x.guest}` }, ...log].slice(0, 500);
      continue;
    }
    // Barang pra-order tidak jadi disiapkan → kembali ke stok.
    const r = returnStock(stock, soldOut, x.fnb);
    stock = r.stock; soldOut = r.soldOut;
    log = [{ at: ev.at, who: "sistem", what: `No-show dilepas · ${namaMeja(s, x.tableId)} · ${x.guest}`, amount: x.paidOnline }, ...log].slice(0, 500);
    /*
     * YANG HANGUS HANYA YANG SUDAH DIBAYAR.
     *
     * No-show booking biliar memang diakui sebagai omzet: tamunya sudah
     * membayar di muka, uangnya ada di kas, dan slotnya terpakai percuma.
     * Identitasnya: omzet = yang diterima + prabayar.
     *
     * Pra-pesan reservasi resto tidak begitu — tidak ada uang yang masuk dan
     * dapur tidak pernah memasaknya. Menghitungnya sebagai omzet membuat
     * rekap mengaku menerima uang yang tidak pernah ada (terbukti: INV-08
     * langsung merah, "nilai 362000 ≠ diterima 220000 + prabayar 50000").
     */
    const hangus = x.fnb.filter((l) => !l.pra);
    changed.set(x.id, {
      ...x, status: "noshow", noShowFnb: x.fnb, fnb: [],
      settledAt: ev.at, settledAmount: 0, settledChannel: undefined,
      settledBilliard: x.tableAmount, settledFnb: fnbTotalOf({ ...x, fnb: hangus }), settledDiscount: 0,
      settledLini: liniSesi({ ...x, fnb: hangus }, x.tableAmount),
    });
  }
  const sessions = s.sessions.flatMap((x) => {
    if (!changed.has(x.id)) return [x];
    const y = changed.get(x.id);
    return y ? [y] : [];
  });
  return { ...s, sessions, stock, soldOut, log };
}

/* ═════════════ Reducer ═════════════ */

/** Jenis pergerakan stok untuk sebuah aksi — dasar laporan stok 05.00–05.00. */
export const stockKind = (a: Action, delta: number): StockMove["kind"] => {
  if (a.t === "stockCount") return "opname";
  if (a.t === "transferStock") return "transfer";
  if (a.t === "setStock") return "setel";
  if (a.t === "addStock") return delta > 0 ? "masuk" : "susut";
  return delta < 0 ? "jual" : "kembali";
};

/**
 * Catat SELISIH stok satu aksi ke riwayat pergerakan. Dihitung dari perbandingan
 * stok sebelum/sesudah, jadi tidak ada jalur perubahan stok yang bisa terlewat —
 * jual, void, no-show, koreksi, maupun barang masuk.
 */
function withStockMoves(before: State, after: State, at: number, kindOf: (delta: number) => StockMove["kind"]): State {
  const berubahJual = after.stock !== before.stock;
  const berubahCentral = after.gudangCentral !== before.gudangCentral;
  if (after === before || (!berubahJual && !berubahCentral)) return after;

  const moves: StockMove[] = [];
  const bandingkan = (lama: StockRow[], baru: StockRow[], gudang?: Gudang) => {
    const prev = new Map(lama.map((r) => [r.itemId, r.qty]));
    for (const r of baru) {
      const old = prev.get(r.itemId);
      if (old === undefined || old === null || r.qty === null || r.qty === old) continue;
      const delta = r.qty - old;
      moves.push({ at, itemId: r.itemId, delta, kind: kindOf(delta), ...(gudang ? { gudang } : {}) });
    }
  };
  // Gudang penjualan: tanpa penanda, supaya catatan lama dan baru sebentuk.
  if (berubahJual) bandingkan(before.stock, after.stock);
  if (berubahCentral) bandingkan(before.gudangCentral ?? [], after.gudangCentral ?? [], "central");

  if (moves.length === 0) return after;
  return { ...after, stockMoves: [...moves, ...(after.stockMoves ?? [])].slice(0, MAX_STOCK_MOVES) };
}

/** Hari LAPORAN STOK sebuah waktu — batas 05.00 pagi (permintaan pemilik). */
export function stockDateOf(ts: number): string {
  return tanggalWib(ts - STOCK_DAY_HOUR * HOUR_MS);
}

/** Hari stok sesudah/sebelum `hari` (format YYYY-MM-DD). WIB tidak kenal DST. */
const geserHariStok = (hari: string, arah: number) => {
  const [y, m, d] = hari.split("-").map(Number);
  return tanggalWib(dariWib(y, m, d, 12) + arah * 24 * HOUR_MS);
};

/** Satu baris tutup buku stok: fakta satu barang pada satu hari. */
export type StokHariBaris = {
  itemId: string;
  /** Sisa pada jam 05.00 pagi hari itu. */
  awal: number | null;
  masuk: number;
  terjual: number;
  kembali: number;
  susut: number;
  /** Selisih hasil hitung fisik (opname). Negatif = barang kurang dari catatan. */
  opname: number;
  /** Sisa pada jam 05.00 pagi besoknya. */
  sisa: number | null;
  nilaiJual: number;
};

type EmberStok = { masuk: number; terjual: number; kembali: number; susut: number; opname: number; nilai: number };
const emberStok = (): EmberStok => ({ masuk: 0, terjual: 0, kembali: 0, susut: 0, opname: 0, nilai: 0 });
const petaStok = (st: State) => new Map(st.stock.map((r) => [r.itemId, r.qty] as const));

/**
 * TUTUP BUKU STOK per hari, dihitung dari jejak — bukan direka mundur dari sisa
 * hari ini seperti layar lama. Sekali putar ulang menghasilkan semua hari:
 * stok difoto tiap kali melewati batas 05.00, dan tiap perubahan dikelompokkan
 * ke hari kejadiannya. Karena `awal` dan `sisa` diambil dari foto — bukan
 * dijumlahkan — barisnya selalu bisa diperiksa: awal + masuk - terjual +
 * kembali - susut + opname = sisa.
 *
 * Dipakai fungsi server `stok-tutup`; hasilnya disimpan supaya angka hari
 * lampau tidak bisa berubah lagi dan tidak bergantung perangkat mana pun.
 */
export function laporanStokHarian(
  genesis: Genesis, entries: Entry[], dariHari?: string, sampaiHari?: string,
): Record<string, StokHariBaris[]> {
  const urut = [...entries].sort(entryOrder);
  let st = replay(genesis, []);
  const hasil: Record<string, StokHariBaris[]> = {};

  let hari = stockDateOf(urut.length ? Math.min(genesis.at, urut[0].at) : genesis.at);
  let awal = petaStok(st);
  let ember = new Map<string, EmberStok>();
  const ambil = (id: string) => {
    let e = ember.get(id);
    if (!e) { e = emberStok(); ember.set(id, e); }
    return e;
  };

  const catat = (
    sebelum: Map<string, number | null>, sesudah: State, jenis: (delta: number) => StockMove["kind"],
  ) => {
    for (const r of sesudah.stock) {
      const lama = sebelum.get(r.itemId);
      if (lama === undefined || lama === null || r.qty === null || r.qty === lama) continue;
      const delta = r.qty - lama;
      const e = ambil(r.itemId);
      switch (jenis(delta)) {
        case "jual": e.terjual += -delta; e.nilai += -delta * priceOf(sesudah, r.itemId); break;
        case "kembali": e.kembali += delta; break;
        case "masuk": e.masuk += delta; break;
        case "susut": e.susut += -delta; break;
        case "opname": e.opname += delta; break;
        default: if (delta > 0) e.masuk += delta; else e.susut += -delta;   // setel manual
      }
    }
  };

  const tutupSampai = (batas: string) => {
    while (hari <= batas) {
      const sisa = petaStok(st);
      if (!dariHari || hari >= dariHari) {
        const ids = [...new Set([...awal.keys(), ...sisa.keys(), ...ember.keys()])].sort();
        hasil[hari] = ids.map((itemId) => {
          const e = ember.get(itemId) ?? emberStok();
          return {
            itemId,
            awal: awal.get(itemId) ?? null,
            masuk: e.masuk, terjual: e.terjual, kembali: e.kembali,
            susut: e.susut, opname: e.opname,
            sisa: sisa.get(itemId) ?? null,
            nilaiJual: Math.round(e.nilai),
          };
        });
      }
      awal = sisa;
      ember = new Map();
      hari = geserHariStok(hari, 1);
    }
  };

  for (const e of urut) {
    const h = stockDateOf(e.at);
    if (h > hari) tutupSampai(geserHariStok(h, -1));
    // Ditiru persis dari applyEntry: detak waktu dulu (bisa mengembalikan stok
    // pesanan no-show), baru aksinya.
    const sebelumTick = petaStok(st);
    const ditick = tickState(st, e.at);
    if (ditick !== st) catat(sebelumTick, ditick, () => "kembali");
    const sebelumAksi = petaStok(ditick);
    const next = applyAction(ditick, e);
    if (next !== ditick) catat(sebelumAksi, next, (d) => stockKind(e.act, d));
    st = next;
  }
  tutupSampai(sampaiHari && sampaiHari > hari ? sampaiHari : hari);
  return hasil;
}

export function reducer(s: State, a: Action): State {
  if (lintasVenue(s, a)) return s;              // staf venue sebelah: ditolak mesin
  const next = capVenue(s, rapikanLampu(rapikanGrup(reduce(s, a))), a);
  return next === s ? s : withStockMoves(s, next, clock(), (d) => stockKind(a, d));
}

/**
 * CAP VENUE pada tiap baris jejak baru — di SATU TEMPAT.
 *
 * Permintaan pemilik 21 Okt 2026: panel jejak aktivitas harus terpisah antara
 * SPL Sport dan Smokehouse. Yang dibutuhkan untuk itu cuma satu: tiap baris
 * tahu venue-nya.
 *
 * Dipasang di sini, bukan di ~60 pemanggil `note()`. Satu pemanggil yang lupa
 * berarti satu baris yang hilang dari kedua panel — dan baris yang hilang
 * dari jejak audit adalah persis baris yang paling ingin disembunyikan orang.
 * Venue-nya dibaca dari `venueAksi`, peta yang sama dengan yang dipakai pagar
 * venue: kalau aksinya menyentuh dua venue (pindah meja antar venue tidak
 * mungkin, tapi peta itu memang bisa mengembalikan dua) atau tidak menyentuh
 * meja mana pun (tarif, pajak, menu, gudang), barisnya tidak dicap dan tampil
 * di KEDUA panel — karena memang milik keduanya.
 */
function capVenue(sebelum: State, sesudah: State, a: Action): State {
  if (sesudah.log === sebelum.log) return sesudah;
  const vs = venueAksi(sebelum, a);
  if (vs.length !== 1) return sesudah;
  // Baris baru selalu di DEPAN (`note` menaruhnya di awal), jadi yang baru
  // adalah semua yang berada di atas baris teratas sebelumnya.
  const kepala = sebelum.log[0];
  const baru = kepala ? sesudah.log.indexOf(kepala) : sesudah.log.length;
  if (baru <= 0) return sesudah;
  return {
    ...sesudah,
    log: sesudah.log.map((l, i) => (i < baru ? { ...l, venue: vs[0] } : l)),
  };
}

/**
 * Jejak satu venue. Baris tanpa cap venue (pengaturan tingkat grup) ikut di
 * keduanya: tarif dan pajak memang berlaku untuk dua-duanya, dan
 * menyembunyikannya dari salah satu panel membuat perubahan harga seolah
 * tidak pernah terjadi.
 */
export const jejakVenue = (s: Pick<State, "log">, venue: Venue) =>
  s.log.filter((l) => l.venue === undefined || l.venue === venue);

/**
 * Penanda gabungan (SMH-4) dibersihkan DI SATU TEMPAT.
 *
 * Tab bisa keluar dari gabungannya lewat banyak pintu: ditutup kasir,
 * di-void, ditutup otomatis saat tutup buku, dilepas sendiri, atau dilepas
 * sebagai no-show. Kalau penandanya dibersihkan di tiap pintu, cepat atau
 * lambat ada satu pintu yang terlewat — dan sisanya adalah meja yang terus
 * ditulis "gabungan" dengan meja yang tamunya sudah pulang, dan kasir
 * berikutnya mencari meja pasangan yang tidak ada.
 *
 * Dua aturannya: hanya tab BERJALAN boleh bergrup, dan grup berisi satu
 * meja bukan grup.
 */
/**
 * Buang catatan lampu untuk meja yang memang TIDAK PUNYA LAMPU.
 *
 * Lampu barang biliar. Meja makan Smokehouse tidak punya, tapi belasan jalur
 * menyentuh peta lampu (buka meja, check-in, pindah meja, tutup tab, void,
 * pulihkan no-show) — menambalnya satu per satu berarti cepat atau lambat
 * ada yang terlewat, dan sisanya adalah "lampu meja R03" yang ikut terhitung
 * di papan dan rekap venue resto.
 */
function rapikanLampu(s: State): State {
  const asing = Object.keys(s.lights).filter((id) => !punyaLampu(id));
  if (asing.length === 0) return s;
  const lights = { ...s.lights };
  for (const id of asing) delete lights[id];
  return { ...s, lights };
}

/**
 * APAKAH AKSI INI MENYEBERANG KE VENUE SEBELAH?
 *
 * Keputusan pemilik 12 Okt 2026: SPL Sport dan Smokehouse diperlakukan seperti
 * DUA PERUSAHAAN. Kasir resto tidak mengurus meja biliar, dan sebaliknya.
 *
 * Pagarnya dipasang DI SATU TEMPAT — di `reducer`, pintu yang dilewati aksi
 * dari perangkat ini MAUPUN kejadian yang diputar ulang dari perangkat lain
 * (`applyAction` memasang pelakunya sebagai `me` lalu memanggil reducer ini).
 * Jadi menyembunyikan tabnya bukan pengamanan: perangkat bisa berbohong,
 * mesin tidak.
 *
 * Staf TANPA penanda venue (pemilik & manajer grup) tidak dibatasi.
 */
/**
 * AKSI YANG TIDAK DIJARING PAGAR VENUE.
 *
 * Aksi tamu (`hold`, `confirmOnline`, `guestOrder`, `reserveResto`,
 * `releaseHold`) bukan aksi staf: yang melakukannya tamu dari HP-nya sendiri.
 * Di aplikasi tamu `me` memang kosong, jadi pagarnya tidak pernah menyala —
 * tapi begitu kejadian yang sama diputar ulang di perangkat KASIR (jejaknya
 * satu untuk semua perangkat), pelakunya dipasang dari kejadiannya, dan
 * pesanan tamu SPL akan ditolak hanya karena yang memutar ulang kebetulan
 * kasir Smokehouse. Hasilnya: pesanan yang diterima di satu perangkat hilang
 * di perangkat lain — kerusakan yang paling sulit dilacak. Terbukti oleh
 * simulasi: INV-22, INV-29, dan INV-30 langsung merah saat aksi tamu sempat
 * ikut dijaring.
 *
 * `openShift` juga lewat: venue shift diambil dari venue stafnya sendiri
 * (lihat `openShift`), jadi menolaknya hanya membuat kasir tidak bisa mulai
 * bekerja di perangkat yang kebetulan menampilkan venue sebelah.
 *
 * Dikecualikan DI SINI, di pagarnya — bukan dengan menghilangkan venue-nya
 * dari peta. Petanya tetap lengkap, karena jejak aktivitas memakai peta yang
 * sama untuk menaruh tiap baris di venue yang benar.
 */
const AKSI_LUAR_PAGAR = new Set<Action["t"]>([
  "hold", "confirmOnline", "guestOrder", "reserveResto", "releaseHold", "openShift",
]);

function lintasVenue(s: State, a: Action): boolean {
  const milik = s.me?.venue;
  if (!milik || AKSI_LUAR_PAGAR.has(a.t)) return false;
  return venueAksi(s, a).some((v) => v !== milik);
}

/**
 * Venue yang DISENTUH sebuah aksi — bisa dua (pindah meja, gabung, pindah
 * pesanan), bisa kosong.
 *
 * Kosong berarti aksinya tidak menyentuh meja mana pun: tarif, pajak, promo,
 * menu, stok gudang, mesin EDC. Itu pengaturan tingkat grup dan sudah dijaga
 * peran (`finance` ke atas), bukan venue — gudang pun memang satu untuk
 * keduanya.
 */
function venueAksi(s: State, a: Action): Venue[] {
  /*
   * AKSI TAMU TIDAK IKUT TERJARING — `hold`, `confirmOnline`, `guestOrder`,
   * `reserveResto`, `releaseHold`.
   *
   * Itu bukan aksi staf: yang melakukannya tamu dari HP-nya sendiri. Di
   * aplikasi tamu `me` memang kosong, jadi pagarnya tidak pernah menyala —
   * tapi begitu kejadian yang sama diputar ulang di perangkat KASIR (jejaknya
   * satu untuk semua perangkat), pelakunya dipasang dari kejadiannya dan
   * pesanan tamu SPL akan ditolak hanya karena yang memutar ulang kebetulan
   * kasir Smokehouse. Hasilnya: pesanan yang diterima di satu perangkat
   * hilang di perangkat lain — dan itu kerusakan yang paling sulit dilacak.
   *
   * Terbukti oleh simulasi: INV-22, INV-29, dan INV-30 langsung merah saat
   * aksi tamu sempat ikut dijaring.
   */
  const dariMeja = (tableId?: string): Venue[] => (tableId ? [venueDari(tableId)] : []);
  const dariSesi = (id?: string) => dariMeja(s.sessions.find((x) => x.id === id)?.tableId);
  const dariPesanan = (id?: string): Venue[] => {
    const o = s.orders.find((x) => x.id === id);
    return o ? [venueOrder(o)] : [];
  };
  // Void & tiket menunjuk sesi ATAU pesanan takeaway dengan satu id yang sama bentuknya.
  const dariTarget = (id: string) => [...dariSesi(id), ...dariPesanan(id)];
  const akunnya = (venue?: Venue): Venue[] => (venue ? [venue] : ["spl", "smh"]);

  switch (a.t) {
    case "walkin": case "toggleLight": case "toggleMaintenance":
    case "setTableName": case "setTableClass": case "setMejaDipakai":
      return dariMeja(a.tableId);
    // Aksi tamu: dipetakan supaya jejaknya masuk venue yang benar. Pagarnya
    // sendiri melewatinya — lihat `AKSI_LUAR_PAGAR`.
    case "hold": case "confirmOnline":
      return dariMeja(a.session.tableId);
    case "releaseHold":
      return dariSesi(a.id);
    case "guestOrder":
      return a.order.tableId ? dariMeja(a.order.tableId) : akunnya(a.order.venue);
    case "reserveResto":
      return ["smh"];
    // Lampu hanya ada di meja biliar (lihat `punyaLampu`), jadi "nyalakan
    // semua" selalu aksi SPL — kasir resto tidak punya urusan dengannya.
    case "allLights":
      return ["spl"];
    case "checkin":
      return dariMeja(s.sessions.find((x) => x.checkin === a.code && x.status === "booked")?.tableId);
    case "extend": case "settle": case "paySplit": case "stopMeter":
    case "pisahMeja": case "restoreNoShow":
      return dariSesi(a.id);
    // Meja tujuan ikut diperiksa walau `relocate` sudah menuntut meja SEKELAS
    // dan meja biliar tidak pernah bisa dijadikan meja resto (lihat
    // `setTableClass`) — jadi hari ini jalurnya mustahil ditempuh. Dibiarkan
    // sebagai sabuk kedua: begitu denah Smokehouse yang asli masuk dan ada
    // kelas meja yang dipakai kedua venue, pagarnya sudah di tempatnya.
    case "relocate":
      return [...dariSesi(a.id), ...dariMeja(a.toTableId)];
    case "compliment": case "editFnb": case "addFnb":
      return dariSesi(a.sessionId);
    case "moveFnb":
      return [...dariSesi(a.fromId), ...dariSesi(a.toId), ...dariMeja(a.toTableId)];
    case "gabungMeja":
      return a.ids.flatMap((id) => dariSesi(id));
    case "settleOrder":
      return dariPesanan(a.id);
    case "ticket": {
      const tk = s.tickets.find((x) => x.id === a.id);
      return tk ? dariTarget(tk.sessionId) : [];
    }
    case "requestVoid":
      return dariTarget(targetSesi(a.req.targetKind, a.req.targetId));
    case "decideVoid": {
      const v = s.voids.find((x) => x.id === a.id);
      return v ? dariTarget(targetSesi(v.targetKind, v.targetId)) : [];
    }
    case "settleRefund": {
      const r = s.refunds.find((x) => x.id === a.id);
      if (!r) return [];
      const sesi = s.sessions.find((x) => x.bookingCode === r.bookingCode);
      if (sesi) return [venueDari(sesi.tableId)];
      const o = s.orders.find((x) => x.code === r.bookingCode);
      return o ? [venueOrder(o)] : [];
    }
    /*
     * `openShift` SENGAJA tidak ada di sini.
     *
     * Venue shift bukan ditolak, tapi DIPAKSA: kasir Smokehouse yang membuka
     * shift di perangkat yang kebetulan sedang menampilkan SPL tetap membuka
     * kas Smokehouse (lihat case-nya). Kalau ikut dijaring di sini, yang
     * terjadi justru shiftnya GAGAL DIBUKA diam-diam — dan tanpa shift
     * terbuka, hampir semua aksi uang berhenti. Venue berhenti bukan karena
     * salah, tapi karena benar.
     */
    // Akun staf: kepala Smokehouse tidak boleh membuat akun SPL, dan tidak
    // boleh membuat akun TANPA venue — itu akun yang menguasai keduanya.
    case "saveEmployee":
      return akunnya(a.emp.venue);
    case "removeEmployee":
      return akunnya(s.employees?.find((x) => x.id === a.id)?.venue);
    default:
      return [];
  }
}

/** Sesi/pesanan yang ditunjuk sebuah void. Target "item" ditulis `sesi|baris`. */
const targetSesi = (kind: VoidRequest["targetKind"], targetId: string) =>
  kind === "item" ? targetId.split("|")[0] : targetId;

function rapikanGrup(s: State): State {
  const jalan = new Map<string, number>();
  for (const x of s.sessions) {
    if (x.grup && x.status === "running") jalan.set(x.grup, (jalan.get(x.grup) ?? 0) + 1);
  }
  const sah = (x: LiveSession) => !x.grup || (x.status === "running" && (jalan.get(x.grup) ?? 0) >= 2);
  if (s.sessions.every(sah)) return s;
  return {
    ...s,
    sessions: s.sessions.map((x) => {
      if (sah(x)) return x;
      const { grup: _g, ...tanpa } = x;
      return tanpa;
    }),
  };
}

function reduce(s: State, a: Action): State {
  const now = clock();

  switch (a.t) {
    case "tick":
      return tickState(s, now);

    case "login":
      return { ...s, me: a.emp };
    case "logout":
      return { ...s, me: null };

    case "openShift": {
      if (!s.me || s.shift) return s;
      // Venue staf yang terikat MENANG atas pilihan perangkat: kalau kasir
      // Smokehouse membuka shift di perangkat yang kebetulan sedang menampilkan
      // SPL, kasnya tetap kas Smokehouse.
      const venue = s.me.venue ?? a.venue;
      const sh: Shift = {
        id: nextId("sh"), employeeId: s.me.id, employeeName: s.me.name,
        openedAt: now, openingCash: Math.max(0, Math.round(a.openingCash)),
        ...(venue ? { venue } : {}),
      };
      return { ...s, shift: sh, log: note(s, `Shift dibuka`, sh.openingCash) };
    }

    case "closeShift": {
      if (!s.me || !s.shift) return s;
      const expected = shiftCashExpected(s);
      const counted = Math.max(0, Math.round(a.countedCash));
      const closed: Shift = { ...s.shift, closedAt: now, countedCash: counted, variance: counted - expected };
      return {
        // Riwayat shift dibatasi supaya state tidak tumbuh tanpa batas (±3 bulan untuk 2 shift/hari).
        ...s, shift: null, shiftHistory: [closed, ...s.shiftHistory].slice(0, 200),
        log: note(s, `Shift ditutup · kas seharusnya ${expected} · selisih ${closed.variance! >= 0 ? "+" : ""}${closed.variance}`, counted),
      };
    }

    /* ── Buka meja: open bill (meteran) atau paket per jam ──────── */
    case "walkin": {
      const table = cariMeja(a.tableId);
      if (!table || !mejaDipakai(s, a.tableId) || !allow(s, "bukaMeja") || !s.shift) return s;
      const h = hourIdx(now);
      if (!dalamJamBuka(s, h)) return s;
      const kelas = classOf(s, a.tableId);

      /**
       * PAKET PEMILIK SEBAGAI CARA MEMBUKA MEJA.
       *
       * Permintaan pemilik 21 Okt 2026: *"untuk paket tidak bisa terlihat
       * disini padahal ada paket siang … pastikan aktif dan muncul di menu
       * booking dan cashier ketika mengaktifkan bill."*
       *
       * Paket bersewa waktu TIDAK bisa dijual sebagai baris bill (lihat
       * `addPaket`): harganya menggantikan tarif per jam, jadi menjualnya ke
       * meja yang sudah jalan menagih harga bloknya tanpa memberi jam
       * mainnya. Satu-satunya tempat yang benar adalah di sini, saat mejanya
       * dibuka — persis seperti booking online memakainya.
       *
       * Syaratnya dibaca dari `paketProblem`, fungsi yang SAMA dengan yang
       * dipakai booking online. Dua pintu, satu aturan.
       */
      const pk = a.paketId ? paketOf(s, a.paketId) : undefined;
      if (a.paketId) {
        if (a.hours !== undefined) return s;             // satu cara buka saja
        if (!pk) return s;
        // Paket venue sebelah tidak dijual di sini — dua venue, dua daftar.
        if ((pk.venue ?? "spl") !== venueDari(a.tableId)) return s;
        if (paketProblem(s, a.paketId, { kelas, hours: pk.hours, startH: h })) return s;
        if (h + pk.hours > batasJamTutup(s)) return s;
      }

      // `hours` diisi = tamu membeli blok jam dengan harga tetap (ada jam selesai).
      // Kosong = open bill, meteran berjalan sampai kasir menutupnya.
      const jam = pk ? pk.hours : (a.hours === undefined ? 0 : Math.floor(a.hours));
      if (!pk && a.hours !== undefined) {
        if (!(jam >= 1) || jam > 4 || h + jam > batasJamTutup(s)) return s;
        if (kelas === "resto") return s;                 // meja resto tidak dijual per jam
      }
      const end = jam ? now + jam * HOUR_MS : now + 30 * 60_000;
      if (!tableFreeForRange(s.sessions, a.tableId, now, end, undefined, now)) return s;

      // Isi paket diserahkan SAAT MEJA DIBUKA — tamunya memang sudah di sini,
      // jadi stoknya berkurang dan dapur menerima tiketnya sekarang juga.
      const isi = pk ? isiPaket(s, pk, `pk-${nextId("x")}`) : [];
      const f = isi.length ? fulfil(s, isi) : { taken: [], dropped: [], stock: s.stock };
      const habis = f.dropped.map((l) => l.name ?? l.itemId).join(", ");

      const sess: LiveSession = {
        id: nextId(`w-${a.tableId}`), tableId: a.tableId, source: "walkin",
        guest: a.guest || "Tamu", startsAt: now, endsAt: end,
        status: "running", fnb: f.taken, paidOnline: 0,
        tableAmount: pk ? pk.price : (jam ? priceWith(s.rates, kelas, h, jam) : 0),
        rates: { ...s.rates },
        // Kelas meja dibekukan: mengubah VIP↔VVIP nanti tidak menagih ulang tamu ini.
        tableType: kelas,
        ...(jam ? { blockHours: jam } : {}),
        ...(pk ? { paket: pk.id, freeDrinks: pk.freeDrinks } : {}),
      };
      return {
        ...s, sessions: [...s.sessions, sess],
        stock: f.stock, soldOut: syncSoldOut(f.stock, s.soldOut),
        tickets: f.taken.length
          ? [...ticketsFor(forSession(s, sess), f.taken, now, `Paket · ${pk!.name}`), ...s.tickets]
          : s.tickets,
        lights: punyaLampu(a.tableId) ? { ...s.lights, [a.tableId]: true } : s.lights,
        log: note(s, `Meja dibuka (${pk ? pk.name : jam ? `paket ${jam} jam` : "open bill"}) · ${table.name}`
          + (habis ? ` · isi paket HABIS & dibatalkan: ${habis}` : ""), sess.tableAmount || undefined),
      };
    }

    /* ── Check-in booking online ────────────────────────────────── */
    case "checkin": {
      if (!allow(s, "bukaMeja") || !s.shift) return s;
      if (checkinProblem(s, a.code, now)) return s;
      const bk = s.sessions.find((x) => x.checkin === a.code && x.status === "booked")!;
      // Jam selesai TIDAK bergeser: datang telat = kehilangan waktu, bukan menabrak
      // booking berikutnya. Datang lebih awal boleh mulai sekarang kalau mejanya kosong.
      const startsAt = Math.min(now, bk.startsAt);
      /*
       * PRA-PESAN RESERVASI RESTO MEMOTONG STOK DI SINI — bukan saat
       * reservasinya dibuat. Inilah saat tamunya benar-benar datang dan
       * dapur mulai memasak.
       *
       * Hanya baris bertanda `pra` yang dilewatkan `fulfil`. Baris yang
       * sudah dibayar online (booking biliar) SUDAH memotong stoknya saat
       * pembayaran masuk — kalau ikut dilewatkan di sini, stoknya terpotong
       * dua kali untuk satu porsi yang sama.
       */
      const praBk = bk.fnb.filter((l) => l.pra);
      /*
       * ISI PAKET ikut diserahkan DI SINI (permintaan pemilik 19 Okt 2026).
       *
       * Paket dibeli saat booking, kadang berhari-hari sebelumnya. Kalau
       * stoknya dipotong saat itu, barangnya hilang dari penjualan malam ini
       * untuk tamu yang baru datang hari Sabtu. Jadi sama seperti pra-pesan
       * resto: barangnya keluar dari gudang saat tamunya benar-benar datang.
       */
      const pkBk = paketOf(s, bk.paket);
      const isiBk = pkBk ? isiPaket(s, pkBk, `pk-${bk.id}`) : [];
      const f = (praBk.length || isiBk.length)
        ? fulfil(s, [...praBk, ...isiBk])
        : { taken: [], dropped: [], stock: s.stock };
      const diambil = new Map(f.taken.map((l) => [l.key, l] as const));
      // Urutan baris dipertahankan; yang barangnya habis dibuang dari bill.
      // Isi paket ditambahkan di belakang, karena sebelumnya memang belum ada.
      const kunciIsi = new Set(isiBk.map((l) => l.key));
      const fnb = [
        ...bk.fnb.filter((l) => !l.pra || diambil.has(l.key)).map((l) => diambil.get(l.key) ?? l),
        ...f.taken.filter((l) => kunciIsi.has(l.key)),
      ];
      const habis = f.dropped.map((l) => l.name ?? findItem(l.itemId)?.name ?? l.itemId).join(", ");
      const running: LiveSession = { ...bk, status: "running", startsAt, fnb };
      return {
        ...s, stock: f.stock, soldOut: syncSoldOut(f.stock, s.soldOut),
        sessions: s.sessions.map((x) => (x.id === bk.id ? running : x)),
        tickets: [
          ...ticketsFor(forSession(s, running), [...bk.fnb.filter((l) => l.prepaid), ...f.taken], now, `Pra-order · ${bk.guest}`),
          ...s.tickets,
        ],
        lights: { ...s.lights, [bk.tableId]: true },
        log: note(s, `Check-in ${a.code} · ${namaMeja(s, bk.tableId)} · ${bk.guest}`
          + (isiBk.length ? ` · isi paket ${pkBk!.name} diserahkan` : "")
          + (habis ? ` · HABIS & dibatalkan: ${habis}` : "")),
      };
    }

    /* ── Perpanjang booking online (per jam) ────────────────────── */
    case "extend": {
      if (!allow(s, "bukaMeja") || !s.shift) return s;
      const t = s.sessions.find((x) => x.id === a.id);
      if (!t || !canExtend(s, t.id, a.minutes, now)) return s;
      const newEnd = t.endsAt + a.minutes * 60_000;
      const add = priceWith(s.rates, sessionType(t), hourIdx(t.endsAt), a.minutes / 60);
      return {
        ...s,
        sessions: s.sessions.map((x) => x.id === a.id
          ? { ...x, endsAt: newEnd, tableAmount: x.tableAmount + add, extraTable: (x.extraTable ?? 0) + add }
          : x),
        log: note(s, `Perpanjang ${a.minutes / 60} jam · ${namaMeja(s, t.tableId)}`, add),
      };
    }

    /* ── Pindah meja ────────────────────────────────────────────── */
    case "relocate": {
      if (!allow(s, "bukaMeja")) return s;
      const t = s.sessions.find((x) => x.id === a.id);
      const to = mejaDipakai(s, a.toTableId) ? cariMeja(a.toTableId) : undefined;
      // Hanya ke meja SEKELAS: harga VIP/VVIP/reguler berbeda, dan meja resto bukan meja biliar.
      if (!t || !to || to.id === t.tableId || classOf(s, to.id) !== sessionType(t)) return s;
      if (t.status !== "booked" && t.status !== "running") return s;
      const { from, until } = relocationRange(t, now);
      if (!tableFreeForRange(s.sessions, to.id, from, until, t.id, now)) return s;
      const lights = t.status === "running"
        ? { ...s.lights, [t.tableId]: false, [to.id]: true }
        : s.lights;
      // Booking yang dipindah setelah jam mulainya: 20 menit dihitung dari meja barunya siap.
      const moved = s.sessions.map((x) => (x.id === a.id ? {
        ...x, tableId: to.id,
        ...(t.status === "booked" && now > t.startsAt ? { readyAt: Math.max(t.readyAt ?? 0, now) } : {}),
      } : x));
      return {
        ...s,
        sessions: markReady(moved, t, now),
        tickets: s.tickets.map((k) => (k.sessionId === t.id ? { ...k, tableName: to.name } : k)),
        orders: s.orders.map((o) => (o.sessionId === t.id ? { ...o, tableId: to.id } : o)),
        lights,
        log: note(s, `Pindah meja · ${namaMeja(s, t.tableId)} → ${to.name} · ${t.guest}`),
      };
    }

    /* ── Tutup tab ──────────────────────────────────────────────── */
    case "settle": {
      if (!allow(s, "tutupTab") || !s.shift) return s;
      const t = s.sessions.find((x) => x.id === a.id);
      if (!t || t.status !== "running") return s;
      /**
       * Diskon manual DIABAIKAN kalau perannya tidak berhak. Bukan ditolak
       * seluruh pembayarannya: tamu sudah berdiri di kasir, dan menolak
       * pembayaran karena kolom diskon terisi akan membuat kasir mengakalinya
       * dengan cara lain. Yang dijaga cukup satu: diskonnya tidak terjadi.
       */
      const pst = allow(s, "beriDiskonManual") ? (a.diskonPersen ?? 0) : 0;
      const bill = settlementOf(t, s, now, a.promoCode, pst);
      return {
        ...s,
        sessions: s.sessions.map((x) => x.id === a.id ? {
          ...x, status: "done" as const,
          // Open bill: jam selesai = jam meteran berhenti (bisa lebih awal kalau aplikasi mati).
          // Paket per jam & booking online: jam selesainya sudah tetap sejak awal.
          endsAt: x.source === "walkin" && !x.blockHours ? meterEndOf(x, now) : x.endsAt,
          settledChannel: a.channel, settledAmount: bill.due,
          ...(mesinSah(s, a.channel, a.mesin) ? { settledMesin: mesinSah(s, a.channel, a.mesin) } : {}),
          settledBilliard: bill.billiard, settledFnb: bill.fnb, settledDiscount: bill.discount,
          settledLini: liniSesi(x, bill.billiard),
          settledAt: now, settledShiftId: s.shift!.id,
          ...(bill.diskonManual > 0 ? { settledDiskonManual: bill.diskonManual } : {}),
          ...(bill.compliment > 0 ? { settledCompliment: bill.compliment } : {}),
        } : x),
        lights: { ...s.lights, [t.tableId]: false },
        log: note(s, `Tab ditutup · ${namaMeja(s, t.tableId)} · ${a.channel.toUpperCase()}${bill.promo ? ` · promo ${bill.promo.promo.name}` : ""}${bill.diskonManual > 0 ? ` · diskon manual ${pst}%` : ""}${bill.compliment > 0 ? ` · compliment ${bill.compliment}` : ""}`, bill.due),
      };
    }

    /* ── Gabung meja: beberapa meja jadi satu bill ──────────────── */
    case "gabungMeja": {
      if (!allow(s, "bukaMeja") || !s.shift) return s;
      const ids = [...new Set(a.ids)];
      if (ids.length < 2) return s;
      const sesi = ids.map((id) => s.sessions.find((x) => x.id === id));
      if (sesi.some((x) => !x)) return s;
      const anggota = sesi as LiveSession[];
      // Hanya meja yang sedang jalan: menggabung tab yang sudah ditutup berarti
      // menggabung uang yang sudah masuk laporan.
      if (anggota.some((x) => x.status !== "running")) return s;
      // SATU GRUP TIDAK PERNAH LINTAS VENUE. Rekap SPL dan Smokehouse wajib
      // terpisah (keputusan pemilik 8 Okt 2026); satu bill yang memuat meja
      // dua venue membuat pemisahan itu bohong tanpa ada satu angka pun yang
      // kelihatan salah.
      if (new Set(anggota.map((x) => venueDari(x.tableId))).size > 1) return s;
      // Kalau sebagian sudah punya grup, semuanya ikut grup itu — tapi kalau
      // yang diminta bergabung berasal dari DUA grup berbeda, ditolak:
      // menggabung dua gabungan hampir selalu salah tekan, dan akibatnya satu
      // bill raksasa yang harus dipisah satu per satu saat tamu menunggu.
      const grupAda = [...new Set(anggota.map((x) => x.grup).filter((x): x is string => !!x))];
      if (grupAda.length > 1) return s;
      const tag = grupAda[0] ?? nextId("gr");
      if (anggota.every((x) => x.grup === tag)) return s;      // sudah segrup
      const ikut = new Set(ids);
      const nama = anggota.map((x) => namaMeja(s, x.tableId)).join(" + ");
      return {
        ...s,
        sessions: s.sessions.map((x) => (ikut.has(x.id) ? { ...x, grup: tag } : x)),
        log: note(s, `Meja digabung · ${nama}`),
      };
    }

    /* ── Pisah satu meja dari gabungannya ───────────────────────── */
    case "pisahMeja": {
      if (!allow(s, "bukaMeja") || !s.shift) return s;
      const t = s.sessions.find((x) => x.id === a.id);
      if (!t || !t.grup) return s;
      // Yang dilepas hanya meja ini. Gabungan yang jadi bersisa satu meja
      // dibersihkan `rapikanGrup` — bukan di sini, supaya cuma ada satu
      // tempat yang memutuskan apa itu grup yang sah.
      return {
        ...s,
        sessions: s.sessions.map((x) => {
          if (x.id !== t.id) return x;
          const { grup: _g, ...tanpa } = x;
          return tanpa;
        }),
        log: note(s, `Meja dilepas dari gabungan · ${namaMeja(s, t.tableId)}`),
      };
    }

    /* ── Compliment: satu baris digratiskan, ditanggung venue ───── */
    case "compliment": {
      if (!allow(s, "beriDiskonManual") || !s.shift) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      if (!sess || sess.status !== "running") return s;
      const line = sess.fnb.find((l) => l.key === a.key);
      if (!line) return s;
      // Yang sudah dibayar tidak bisa digratiskan — uangnya sudah diterima.
      // Mengembalikannya adalah refund, dan itu jalur yang lain.
      if (line.prepaid || paidLineKeys(sess).has(line.key)) return s;
      // Sudah gratis (minuman Paket Siang, atau sudah di-compliment).
      if ((line.unitPrice ?? 0) === 0) return s;
      const nilai = lineValue(line);
      if (nilai <= 0) return s;
      // Harganya dijadikan 0 dan harga ASLINYA disimpan di barisnya: tagihan
      // tamu benar-benar berkurang, tapi nilai yang digratiskan tidak hilang
      // dari laporan. Barangnya TIDAK dikembalikan ke stok — barangnya memang
      // keluar dan diminum/dimakan tamu; yang gratis uangnya, bukan barangnya.
      const baru: CartLine = { ...line, unitPrice: 0, comp: nilai };
      const fnbBaru = sess.fnb.map((l) => (l.key === line.key ? baru : l));
      // Tidak boleh menjatuhkan tagihan di bawah uang yang sudah dibayar per orang.
      if (counterWith(sess, fnbBaru, s, now) < splitPaidOf(sess)) return s;
      const nama = line.name ?? itemOf(s, line.itemId)?.name ?? line.itemId;
      return {
        ...s,
        sessions: s.sessions.map((x) => (x.id === sess.id ? { ...x, fnb: fnbBaru } : x)),
        // Pesanan QR yang menempel ikut diperbarui supaya angkanya tidak
        // berbeda dari bill meja.
        orders: line.orderId
          ? s.orders.map((o) => (o.id === line.orderId
              ? { ...o, lines: o.lines.map((l) => (l.key === line.key ? baru : l)), value: Math.max(0, o.value - nilai) }
              : o))
          : s.orders,
        log: note(s, `Compliment · ${namaMeja(s, sess.tableId)} · ${line.qty}× ${nama}${a.alasan ? ` · ${a.alasan}` : ""}`, nilai),
      };
    }

    /* ── Koreksi pesanan: salah item atau salah jumlah ──────────── */
    case "editFnb": {
      if (!allow(s, "koreksiPesanan") || !s.shift) return s;
      // DITUTUP 19 Okt 2026 — lihat `KOREKSI_BARIS_DITUTUP`.
      if (now >= KOREKSI_BARIS_DITUTUP) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      if (!sess || sess.status !== "running") return s;
      const line = sess.fnb.find((l) => l.key === a.key);
      if (!line) return s;
      // Yang sudah dibayar (online atau split bill) tidak boleh diubah diam-diam — pakai void.
      if (line.prepaid || paidLineKeys(sess).has(line.key)) return s;
      // Minuman gratis Paket Siang ikut menghitung jatah: koreksinya lewat void.
      if (line.unitPrice === 0) return s;
      // Sudah diserahkan ke tamu: barangnya sudah keluar, itu void — bukan koreksi input.
      if (s.tickets.some((t) => t.sessionId === sess.id && t.lineKey === line.key && t.status === "served")) return s;
      const item = itemOf(s, a.itemId ?? line.itemId);
      if (!item) return s;
      const qty = Math.floor(a.qty ?? line.qty);
      if (!(qty >= 1) || qty > 99) return s;
      const ganti = item.id !== line.itemId;
      if (ganti && s.soldOut.includes(item.id)) return s;
      const variant = a.variant !== undefined ? a.variant : ganti ? undefined : line.variant;
      if (!ganti && qty === line.qty && variant === line.variant) return s;
      const { variant: _lama, ...sisa } = line;
      const baru: CartLine = {
        ...sisa, itemId: item.id, qty,
        unitPrice: ganti ? priceOf(s, item.id) : line.unitPrice,
        ...(variant ? { variant } : {}),
      };
      // Stok: kembalikan baris lama, ambil baris baru. Kurang stok = koreksi ditolak.
      const kembali = returnStock(s.stock, s.soldOut, [line]);
      const stock = takeStock(kembali.stock, [baru]);
      if (!stock) return s;
      const fnbBaru = sess.fnb.map((l) => (l.key === line.key ? baru : l));
      // Tidak boleh mengecilkan tagihan di bawah uang yang sudah dibayar per orang.
      if (counterWith(sess, fnbBaru, s, now) < splitPaidOf(sess)) return s;
      const selisih = lineValue(baru) - lineValue(line);
      const namaLama = itemOf(s, line.itemId)?.name ?? line.itemId;
      return {
        ...s, stock, soldOut: syncSoldOut(stock, kembali.soldOut),
        sessions: s.sessions.map((x) => (x.id === sess.id ? { ...x, fnb: fnbBaru } : x)),
        // Pesanan QR yang menempel ikut diperbarui supaya angkanya tidak berbeda dari bill.
        orders: line.orderId
          ? s.orders.map((o) => (o.id === line.orderId
              ? { ...o, lines: o.lines.map((l) => (l.key === line.key ? baru : l)), value: o.value + selisih }
              : o))
          : s.orders,
        // Dapur ikut diperbarui; kalau itemnya berganti atau jumlahnya naik, tiketnya dibuat ulang.
        tickets: s.tickets.flatMap((t) => {
          if (t.sessionId !== sess.id || t.lineKey !== line.key) return [t];
          // Diganti jadi barang counter: tidak ada yang perlu disiapkan lagi.
          if (item.station === "billiard") return [];
          const { variant: _v, ...tt } = t;
          return [{
            ...tt, itemId: item.id, name: item.name, qty, station: item.station,
            status: ganti || qty > line.qty ? ("new" as const) : t.status,
            ...(variant ? { variant } : {}),
          }];
        }),
        log: note(s, `Koreksi pesanan · ${namaMeja(s, sess.tableId)} · ${line.qty}× ${namaLama} → ${qty}× ${item.name}`, selisih),
      };
    }

    /* ── Salah nomor meja: pindahkan baris ke meja lain ─────────── */
    case "moveFnb": {
      if (!allow(s, "koreksiPesanan") || !s.shift) return s;
      const from = s.sessions.find((x) => x.id === a.fromId);
      if (!from || from.status !== "running") return s;
      const diminta = new Set(a.keys);
      const sudahBayar = paidLineKeys(from);
      // Baris prabayar, yang sudah dibayar split, minuman gratis paket, dan baris
      // pesanan QR tidak ikut: uangnya sudah menempel pada pemilik/pesanannya.
      const pindah = from.fnb.filter((l) => diminta.has(l.key) && !l.prepaid && !sudahBayar.has(l.key) &&
        l.unitPrice !== 0 && !l.orderId);
      if (pindah.length === 0 || pindah.length !== diminta.size) return s;   // gagal tertutup: semua atau tidak sama sekali
      const dipindah = new Set(pindah.map((l) => l.key));
      // Meja asal tidak boleh jadi lebih kecil dari uang yang sudah dibayar per orang di situ.
      if (counterWith(from, from.fnb.filter((l) => !dipindah.has(l.key)), s, now) < splitPaidOf(from)) return s;

      /**
       * TUJUANNYA BOLEH MEJA KOSONG — mejanya dibuka di sini juga.
       *
       * Permintaan pemilik 19 Okt 2026: *"kalau mau pindah meja bisa langsung
       * pindah ke meja kosong, tidak perlu aktifkan meja dari awal, jadi bisa
       * pindah keseluruhan meja."* Sebelumnya tujuannya wajib meja yang SUDAH
       * jalan, jadi kasir harus membuka mejanya dulu baru memindah: dua
       * langkah untuk satu kejadian, dan di jam ramai langkah pertamanya yang
       * terlupakan — lalu daftar tujuannya kosong dan layarnya terasa rusak.
       *
       * Mejanya dibuka PERSIS seperti kasir membukanya sendiri (`walkin` open
       * bill, lewat `canOpenWalkin` yang sama): meteran mulai sekarang di meja
       * biliar, Rp 0 di meja resto yang memang tidak bersewa waktu. Jadi ini
       * bukan jalan pintas yang membuat meja terisi tanpa tagihan — hasilnya
       * sama persis dengan dua langkah yang digantikannya.
       */
      let dibuka: LiveSession | null = null;
      let calon = a.toId ? s.sessions.find((x) => x.id === a.toId) : undefined;
      if (!calon && a.toTableId) {
        const meja = cariMeja(a.toTableId);
        if (!meja || !mejaDipakai(s, a.toTableId) || meja.id === from.tableId) return s;
        if (!canOpenWalkin(s.sessions, meja.id, now)) return s;
        dibuka = {
          id: nextId(`w-${meja.id}`), tableId: meja.id, source: "walkin",
          guest: from.guest, startsAt: now, endsAt: now + 30 * 60_000,
          status: "running", fnb: [], paidOnline: 0, tableAmount: 0,
          // Kelas meja dibekukan saat dibuka — sama seperti `walkin`.
          rates: { ...s.rates }, tableType: classOf(s, meja.id),
        };
        calon = dibuka;
      }
      const to = calon;
      if (!to || to.id === from.id || to.status !== "running") return s;

      const baru = withUniqueKeys(to.fnb, pindah, `p${to.id}:`);
      const peta = new Map(pindah.map((l, i) => [l.key, baru[i].key]));
      const nilai = pindah.reduce((n, l) => n + lineValue(l), 0);
      // Dibukanya meja adalah kejadian tersendiri — dicatat tersendiri juga,
      // supaya jejaknya terbaca sama dengan kalau kasir membukanya manual.
      let log = s.log;
      if (dibuka) log = note({ ...s, log }, `Meja dibuka (open bill) · ${namaMeja(s, dibuka.tableId)}`);
      log = note({ ...s, log },
        `Pesanan dipindah · ${namaMeja(s, from.tableId)} → ${namaMeja(s, to.tableId)} · ${pindah.length} baris`, nilai);
      return {
        ...s,
        sessions: (dibuka ? [...s.sessions, dibuka] : s.sessions).map((x) =>
          x.id === from.id ? { ...x, fnb: x.fnb.filter((l) => !dipindah.has(l.key)) }
            : x.id === to.id ? { ...x, fnb: [...x.fnb, ...baru] } : x),
        ...(dibuka && punyaLampu(dibuka.tableId) ? { lights: { ...s.lights, [dibuka.tableId]: true } } : {}),
        // Tiket dapur ikut pindah supaya pramusaji mengantar ke meja yang benar.
        tickets: s.tickets.map((t) => (t.sessionId === from.id && t.lineKey && peta.has(t.lineKey)
          ? { ...t, sessionId: to.id, tableName: namaMeja(s, to.tableId), lineKey: peta.get(t.lineKey)! }
          : t)),
        log,
      };
    }

    /* ── Split bill: bayar sebagian / per orang ─────────────────── */
    case "paySplit": {
      if (!allow(s, "tutupTab") || !s.shift) return s;
      const t = s.sessions.find((x) => x.id === a.id);
      if (!t || t.status !== "running") return s;
      const sisa = settlementOf(t, s, now).due;
      if (sisa <= 0) return s;
      let amount: number;
      let keys: string[] | undefined;
      if (a.keys && a.keys.length) {
        const sudah = paidLineKeys(t);
        const minta = new Set(a.keys);
        // Nilainya dihitung ulang mesin dari baris yang dipilih — bukan dari angka layar.
        const pilih = t.fnb.filter((l) => minta.has(l.key) && !l.prepaid && !sudah.has(l.key) && lineValue(l) > 0);
        if (pilih.length !== minta.size) return s;
        amount = pilih.reduce((n, l) => n + lineValue(l), 0);
        keys = pilih.map((l) => l.key);
      } else {
        amount = Math.round(a.amount ?? 0);
      }
      if (!(amount > 0) || amount > sisa) return s;
      const bayar: Payment = {
        id: nextId("pay"), at: now, channel: a.channel, amount, shiftId: s.shift.id,
        ...(s.me ? { by: s.me.name } : {}), ...(keys ? { keys } : {}),
        ...(a.label ? { label: a.label.slice(0, 24) } : {}),
        ...(mesinSah(s, a.channel, a.mesin) ? { mesin: mesinSah(s, a.channel, a.mesin) } : {}),
      };
      return {
        ...s,
        sessions: s.sessions.map((x) => (x.id === t.id ? { ...x, payments: [...(x.payments ?? []), bayar] } : x)),
        log: note(s, `Bayar sebagian · ${namaMeja(s, t.tableId)} · ${a.channel.toUpperCase()}${bayar.label ? ` · ${bayar.label}` : ""}`, amount),
      };
    }

    /* ── Meteran dihentikan manual (listrik/komputer mati) ──────── */
    case "stopMeter": {
      if (!allow(s, "koreksiWaktu")) return s;
      const t = s.sessions.find((x) => x.id === a.id);
      if (!t || t.status !== "running" || t.source !== "walkin") return s;
      const at = Math.round(a.at);
      if (!Number.isFinite(at) || at > now || at < t.startsAt) return s;
      if (t.stoppedAt === at) return s;
      // Tidak boleh memundurkan meteran di bawah uang yang sudah dibayar per orang.
      if (counterWith({ ...t, stoppedAt: at }, t.fnb, s, now) < splitPaidOf(t)) return s;
      return {
        ...s,
        sessions: s.sessions.map((x) => (x.id === t.id ? { ...x, stoppedAt: at } : x)),
        log: note(s, `Meteran dihentikan · ${namaMeja(s, t.tableId)} · pukul ${jamLog(at)}`),
      };
    }

    /* ── Kelas meja: VIP (bebas asap) ↔ VVIP (boleh merokok) ────── */
    case "setTableName": {
      // Pemilik minta ini bisa dilakukan KASIR, bukan cuma pemilik — nomor meja
      // di lantai kadang berubah dan tidak masuk akal menunggu superadmin.
      // Siapa yang menggantinya tetap tercatat di jejak aktivitas.
      if (!allow(s, "bukaMeja")) return s;
      const meja = cariMeja(a.tableId);
      if (!meja) return s;
      const nama = a.name.trim().slice(0, 30);
      const lamaNama = namaMeja(s, a.tableId);
      if (nama === lamaNama) return s;
      const tableNames = { ...s.tableNames };
      // Dikosongkan = kembali ke nama bawaan, bukan meja tanpa nama.
      if (!nama || nama === meja.name) delete tableNames[a.tableId];
      else tableNames[a.tableId] = nama;
      return {
        ...s, tableNames,
        log: note(s, `Nama meja diubah · ${lamaNama} → ${nama || meja.name}`),
      };
    }

    /* ── Tambah / tarik meja dari denah ──────────────────────────── */
    case "setJamBebas": {
      if (!allow(s, "bukaKunciJam")) return s;
      if ((s.jamBebas === true) === a.on) return s;
      return {
        ...s, jamBebas: a.on,
        // Ditulis di jejak dengan nama pelakunya: ini satu-satunya saklar yang
        // melonggarkan aturan mesin, jadi harus selalu bisa ditelusuri siapa
        // yang menyalakannya dan kapan.
        log: note(s, `Mode demo ${a.on
          ? "DINYALAKAN — meja bisa dibuka 24 jam"
          : "dimatikan — jam buka 11.00–02.00 berlaku lagi"}`),
      };
    }

    case "setMejaDipakai": {
      if (!allow(s, "kelolaMeja")) return s;
      const t = cariMeja(a.tableId);
      if (!t) return s;                                   // bukan meja yang dikenal katalog
      if (mejaDipakai(s, a.tableId) === a.dipakai) return s;
      /*
       * MENARIK MEJA yang masih ada tamunya tidak boleh: sesinya akan
       * menghilang dari papan sementara tamunya masih duduk dan tagihannya
       * masih berjalan. Dijaga dengan pagar yang SAMA dengan menandai meja
       * rusak — satu aturan untuk "meja ini sedang tidak bisa diganggu".
       *
       * MENJUAL meja baru tidak perlu pagar: meja yang belum pernah dipakai
       * tidak punya apa pun yang bisa rusak.
       */
      if (!a.dipakai && maintenanceBlockers(s, a.tableId).length > 0) return s;
      const mejaPakai = { ...(s.mejaPakai ?? {}) };
      // Kembali ke bawaannya = tidak perlu dicatat sebagai selisih.
      if (a.dipakai === MEJA_BAWAAN.has(a.tableId)) delete mejaPakai[a.tableId];
      else mejaPakai[a.tableId] = a.dipakai;
      return {
        ...s, mejaPakai,
        // Meja biliar baru butuh catatan lampunya; yang ditarik tidak lagi.
        lights: a.dipakai
          ? (punyaLampu(a.tableId) && !(a.tableId in s.lights)
              ? { ...s.lights, [a.tableId]: false } : s.lights)
          : Object.fromEntries(Object.entries(s.lights).filter(([id]) => id !== a.tableId)),
        log: note(s, `Meja ${a.dipakai ? "DITAMBAHKAN ke" : "ditarik dari"} denah · ${namaMeja(s, t.id)}`),
      };
    }

    case "setTableClass": {
      if (!allow(s, "kelolaMeja")) return s;
      const t = cariMeja(a.tableId);
      if (!t) return s;
      const bawaan = typeOf(t.id);
      // Meja biliar tidak bisa dijadikan meja resto (dan sebaliknya) — tata letaknya beda.
      if ((a.type === "resto") !== (bawaan === "resto")) return s;
      // Tamu yang sedang main/memesan sudah menyepakati harganya: selesaikan dulu.
      if (maintenanceBlockers(s, t.id).length > 0) return s;
      const tableTypes = { ...s.tableTypes };
      if (a.type === bawaan) delete tableTypes[t.id];
      else tableTypes[t.id] = a.type;
      if (JSON.stringify(tableTypes) === JSON.stringify(s.tableTypes ?? {})) return s;
      return { ...s, tableTypes, log: note(s, `Kelas meja diubah · ${t.name} → ${CLASS_LABEL[a.type]}`) };
    }

    /* ── Akun staf (bisa lebih dari satu superadmin) ────────────── */
    case "saveEmployee": {
      if (!allow(s, "kelolaKaryawan")) return s;
      const name = (a.emp.name ?? "").trim().slice(0, 40);
      const pin = (a.emp.pin ?? "").trim();
      if (!name || !/^[0-9]{4,6}$/.test(pin)) return s;
      // SEMUA peran yang dikenal boleh dibuat. Sampai 12 Okt 2026 baris ini
      // hanya menerima "superadmin" dan "karyawan" — warisan dari sebelum
      // peran dipecah tujuh (8 Okt) — padahal layar Atur sudah menawarkan
      // ketujuhnya dan bawaan formulirnya `kru_kasir`. Akibatnya membuat akun
      // Kru Kasir, Finance, atau Kru Gudang GAGAL DIAM-DIAM: tombolnya
      // ditekan, tidak ada yang tersimpan, tidak ada pesan apa pun.
      if (!(ROLES_SAH as readonly string[]).includes(a.emp.role)) return s;
      if (a.emp.venue && a.emp.venue !== "spl" && a.emp.venue !== "smh") return s;
      const lama = s.employees.find((x) => x.id === a.emp.id);
      const id = lama ? lama.id : nextId("u");
      if (s.employees.some((x) => x.id !== id && x.pin === pin)) return s;      // PIN harus unik
      // Email untuk masuk tanpa PIN — juga harus unik, kalau tidak jejak audit salah orang.
      const email = (a.emp.email ?? "").trim().toLowerCase().slice(0, 80);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return s;
      if (email && s.employees.some((x) => x.id !== id && (x.email ?? "") === email)) return s;
      const next: Employee = {
        id, name, pin, role: a.emp.role, active: a.emp.active !== false,
        ...(email ? { email } : {}),
        ...(a.emp.venue ? { venue: a.emp.venue } : {}),
      };
      const list = lama ? s.employees.map((x) => (x.id === id ? next : x)) : [...s.employees, next];
      if (list.length > 40) return s;
      if (!adaKunciInduk(list)) return s;
      if (JSON.stringify(list) === JSON.stringify(s.employees)) return s;
      return {
        ...s, employees: list,
        log: note(s, `Akun staf ${lama ? "diperbarui" : "dibuat"} · ${name} · ${next.role}${next.active ? "" : " (nonaktif)"}`),
      };
    }

    case "removeEmployee": {
      if (!allow(s, "kelolaKaryawan")) return s;
      const emp = s.employees.find((x) => x.id === a.id);
      if (!emp) return s;
      if (s.shift?.employeeId === emp.id) return s;            // tutup shiftnya dulu
      const list = s.employees.filter((x) => x.id !== a.id);
      if (!adaKunciInduk(list)) return s;
      return { ...s, employees: list, log: note(s, `Akun staf dihapus · ${emp.name}`) };
    }

    /* ── Reservasi meja Smokehouse Resto ────────────────────────── */
    case "reserveResto":
      return reserveResto(s, a.res, now);

    /* ── Meja rusak ─────────────────────────────────────────────── */
    case "toggleMaintenance": {
      if (!allow(s, "kelolaMeja")) return s;
      const existing = s.sessions.find((x) => x.tableId === a.tableId && x.status === "maintenance");
      if (existing) {
        return {
          ...s, sessions: s.sessions.filter((x) => x.id !== existing.id),
          log: note(s, `Maintenance selesai · ${namaMeja(s, a.tableId)}`),
        };
      }
      // Meja rusak terkunci sampai diaktifkan lagi, jadi tamu yang sudah memesan
      // meja ini (hari ini atau hari lain) harus dipindahkan dulu.
      if (!mejaDipakai(s, a.tableId) || !cariMeja(a.tableId)
        || maintenanceBlockers(s, a.tableId).length > 0) return s;
      return {
        ...s,
        sessions: [...s.sessions, {
          id: nextId(`m-${a.tableId}`), tableId: a.tableId, source: "walkin", guest: "—",
          startsAt: now, endsAt: now + 24 * HOUR_MS, status: "maintenance",
          fnb: [], tableAmount: 0, paidOnline: 0, note: a.reason || "Maintenance",
        }],
        lights: { ...s.lights, [a.tableId]: false },
        log: note(s, `Meja dinonaktifkan · ${namaMeja(s, a.tableId)} · ${a.reason || "maintenance"}`),
      };
    }

    /* ── Pesan makanan/minuman ke bill ──────────────────────────── */
    case "addFnb": {
      if (!allow(s, "orderFnb") || !s.shift) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      const item = itemOf(s, a.line.itemId);
      if (!sess || sess.status !== "running" || !item) return s;
      const qty = Math.floor(a.line.qty);
      if (qty < 1 || s.soldOut.includes(item.id)) return s;

      // Harga terkini dikunci di baris; jatah minuman gratis Paket Siang dipakai lebih dulu.
      const priced = priceLines(s, [{ ...a.line, itemId: item.id, qty }], sess.freeDrinks ?? 0);
      const lines = withUniqueKeys(sess.fnb, priced.lines, "k");

      const stock = takeStock(s.stock, lines);
      if (!stock) return s;                        // tidak boleh jual melebihi stok
      return {
        ...s, stock, soldOut: syncSoldOut(stock, s.soldOut),
        sessions: s.sessions.map((x) => x.id === sess.id
          ? { ...x, fnb: [...x.fnb, ...lines], freeDrinks: sess.freeDrinks !== undefined ? priced.credits : undefined }
          : x),
        tickets: [...ticketsFor(forSession(s, sess), lines, now), ...s.tickets],
        log: note(s, `Order F&B · ${namaMeja(s, sess.tableId)} · ${qty}× ${item.name}`, priced.total),
      };
    }

    case "ticket": {
      if (!s.me || !s.tickets.some((t) => t.id === a.id && t.status !== a.status)) return s;
      /*
       * JAMNYA DICATAT DI MESIN, bukan dihitung layar.
       *
       * Layar dapur bisa dibuka beberapa jam sesudahnya, atau di perangkat
       * lain; kalau jamnya diambil dari jam perangkat saat menggambar, tiap
       * perangkat menampilkan angka yang berbeda untuk pesanan yang sama.
       * Dicatat sekali, di kejadiannya, lalu dibaca apa adanya.
       *
       * Hanya diisi kalau belum ada: mundur dari "ready" ke "proses" lalu
       * maju lagi tidak boleh menghapus jam masak yang sudah tercatat.
       */
      const cap = a.status === "preparing" ? { terimaAt: now }
        : a.status === "ready" ? { readyAt: now }
        : {};
      return {
        ...s,
        tickets: s.tickets.map((t) => (t.id === a.id
          ? {
              ...t, status: a.status,
              ...(cap.terimaAt !== undefined && t.terimaAt === undefined ? { terimaAt: now } : {}),
              ...(cap.readyAt !== undefined && t.readyAt === undefined ? { readyAt: now } : {}),
            }
          : t)),
      };
    }

    case "setRate": {
      if (!allow(s, "ubahTarif") || !(a.value > 0)) return s;
      return { ...s, rates: { ...s.rates, [a.key]: Math.round(a.value) }, log: note(s, `Tarif diubah · ${a.key} → ${a.value}`) };
    }

    case "setMesinEdc": {
      if (!allow(s, "ubahTarif")) return s;
      // Dirapikan di sini, bukan di layar: nama mesin masuk ke laporan uang,
      // jadi spasi berlebih & nama kembar harus hilang sebelum tersimpan.
      const bersih = [...new Set(
        a.daftar.map((x) => x.trim().slice(0, 20)).filter(Boolean)
          .map((x) => x.replace(/\s+/g, " ")),
      )];
      if (bersih.length === 0) return s;
      if (JSON.stringify(bersih) === JSON.stringify(mesinEdc(s))) return s;
      return {
        ...s, mesinEdc: bersih,
        log: note(s, `Mesin EDC diubah · ${bersih.join(", ")}`),
      };
    }

    case "setPajakLini": {
      if (!allow(s, "ubahTarif")) return s;
      if (!(a.value >= 0) || a.value > 50) return s;
      const nilai = Math.round(a.value * 100) / 100;
      const dasar = s.pajakLini ?? {
        biliar: { ...s.pajak }, bar: { ...s.pajak }, resto: { ...s.pajak },
      };
      if (dasar[a.lini][a.key] === nilai) return s;
      return {
        ...s,
        pajakLini: { ...dasar, [a.lini]: { ...dasar[a.lini], [a.key]: nilai } },
        log: note(s, `${a.key === "ppn" ? "PPN" : "Service"} ${LINI_LABEL[a.lini]} diubah · `
          + `${dasar[a.lini][a.key]}% → ${nilai}% (hanya pemecahan laporan)`),
      };
    }

    case "setPajak": {
      if (!allow(s, "ubahTarif")) return s;
      // 0–50% saja. Di luar itu pasti salah ketik, dan laporannya jadi omong kosong.
      if (!(a.value >= 0) || a.value > 50) return s;
      const nilai = Math.round(a.value * 100) / 100;
      if (s.pajak[a.key] === nilai) return s;
      return {
        ...s, pajak: { ...s.pajak, [a.key]: nilai },
        log: note(s, `${a.key === "ppn" ? "PPN" : "Service"} diubah · ${s.pajak[a.key]}% → ${nilai}% (hanya pemecahan laporan)`),
      };
    }

    /* ── Harga menu (superadmin). Pesanan yang sudah masuk tidak berubah. ── */
    case "saveMenuItem": {
      if (!allow(s, "ubahTarif")) return s;
      const nama = a.item.name.trim().slice(0, 60);
      const harga = Math.round(a.item.price);
      if (!nama || !Number.isFinite(harga) || !(harga >= 0)) return s;
      const lama = a.item.id ? (s.customItems ?? []).find((i) => i.id === a.item.id) : undefined;
      // Id barang tambahan TIDAK boleh menimpa buku menu — kalau tertimpa,
      // pesanan lama yang menunjuk id itu berubah artinya diam-diam.
      if (a.item.id && !lama) return s;
      const baru: MenuItem = lama
        ? { ...lama, name: nama, price: harga, station: a.item.station, aktif: true }
        : { id: nextId("mn"), name: nama, price: harga, station: a.item.station, aktif: true };
      const customItems = lama
        ? (s.customItems ?? []).map((i) => (i.id === baru.id ? baru : i))
        : [...(s.customItems ?? []), baru];
      return {
        ...s, customItems,
        log: note(s, `${lama ? "Menu diubah" : "Menu baru"} · ${nama} · ${harga}`, harga),
      };
    }

    /* ── Jual paket ke meja yang sedang jalan ───────────────────── */
    case "addPaket": {
      if (!allow(s, "orderFnb") || !s.shift) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      const pk = paketOf(s, a.paketId);
      if (!sess || sess.status !== "running" || !pk || pk.aktif === false) return s;
      // Paket venue sebelah tidak dijual di sini — dua venue, dua daftar.
      if ((pk.venue ?? "spl") !== venueDari(sess.tableId)) return s;
      /*
       * HANYA PAKET TANPA JAM yang bisa dijual sebagai baris bill.
       *
       * Paket bersewa waktu adalah BLOK MEJA: harganya menggantikan tarif
       * per jam dan jam selesainya mengunci meja. Menjualnya sebagai satu
       * baris di meja yang sudah jalan akan menagih harga bloknya tanpa
       * memberi waktu mainnya — tamu membayar dua kali untuk jam yang sama.
       */
      if (pk.hours > 0) return s;

      const kunci = `pk-${pk.id}-${nextId("x")}`;
      /*
       * HARGA PAKET satu baris, ISINYA baris-baris Rp 0.
       *
       * Dipisah begitu supaya tiga hal sekaligus benar tanpa rumus khusus:
       * tamu ditagih sekali (harga paket), dapur menerima tiap hidangannya
       * sebagai tiket tersendiri, dan stoknya berkurang per porsi — semua
       * lewat jalur yang sudah ada, bukan jalur baru yang harus dijaga
       * sendiri.
       */
      const barisHarga: CartLine = {
        key: kunci, itemId: `paket:${pk.id}`, qty: 1, unitPrice: pk.price,
        name: pk.name, station: (pk.venue ?? "spl") === "smh" ? "kitchen" : "billiard",
        paket: true,
      };
      const isi = isiPaket(s, pk, kunci);
      // Stok diambil DI SINI, saat paketnya benar-benar dijual. Yang habis
      // dibuang dari paket dan disebutkan di jejak — kasir perlu tahu apa
      // yang tidak bisa disajikan sebelum tamu menanyakannya.
      const f = fulfil(s, isi);
      const habis = f.dropped.map((l) => l.name ?? l.itemId).join(", ");
      const lines = withUniqueKeys(sess.fnb, [barisHarga, ...f.taken], "k");
      return {
        ...s, stock: f.stock, soldOut: syncSoldOut(f.stock, s.soldOut),
        sessions: s.sessions.map((x) => (x.id === sess.id ? { ...x, fnb: [...x.fnb, ...lines] } : x)),
        tickets: [...ticketsFor(forSession(s, sess), lines, now, `Paket · ${pk.name}`), ...s.tickets],
        log: note(s, `Paket dijual · ${pk.name} · ${namaMeja(s, sess.tableId)}`
          + (habis ? ` · isi HABIS & dibatalkan: ${habis}` : ""), pk.price),
      };
    }

    case "savePaket": {
      if (!allow(s, "kelolaPromo")) return s;
      const nama = a.paket.name.trim().slice(0, 40);
      const harga = Math.round(a.paket.price);
      const jam = Math.round(a.paket.hours);
      const minum = Math.round(a.paket.freeDrinks);
      const mulai = Math.round(a.paket.lastStartHour);
      // Pagar angka: paket 0 jam atau 9 jam sama-sama tidak masuk akal, dan
      // jam mulai di luar jam operasional membuat paketnya tidak pernah bisa
      // dipesan — lebih baik ditolak daripada diam-diam tidak muncul.
      const venuePk: Venue = a.paket.venue ?? "spl";
      /*
       * PAKET SMOKEHOUSE BOLEH 0 JAM, paket SPL tidak.
       *
       * Meja makan memang tidak bersewa waktu (lihat `RESTO_BUKA_MENIT`),
       * jadi paket makanan 0 jam itu wajar. Paket meja biliar 0 jam berarti
       * tamu membayar blok tanpa waktu main — itu pasti salah ketik, dan
       * menerimanya berarti ada tamu yang membayar untuk tidak dapat apa-apa.
       */
      const batasBawah = venuePk === "smh" ? 0 : 1;
      if (!nama || !(harga >= 0) || !(jam >= batasBawah && jam <= 6)) return s;
      if (!(minum >= 0 && minum <= 20)) return s;
      if (!(mulai >= OPEN_IDX && mulai < CLOSE_IDX)) return s;
      // Isi paket: barangnya wajib dikenal dan jumlahnya masuk akal. Satu
      // barang karangan membuat SELURUH paket ditolak, bukan diterima
      // separuh — paket yang isinya diam-diam berkurang adalah janji yang
      // tidak ditepati ke tamu yang sudah membayar.
      const isi = (a.paket.isi ?? []).filter((x) => x.qty > 0);
      if (isi.length > 20) return s;
      for (const x of isi) {
        if (!itemOf(s, x.itemId) || !Number.isInteger(x.qty) || x.qty < 1 || x.qty > 20) return s;
      }
      const daftar = s.packages ?? [];
      const lama = a.paket.id ? daftar.find((p) => p.id === a.paket.id) : undefined;
      if (a.paket.id && !lama) return s;
      const perks = [
        ...(jam > 0 ? [`Main ${jam} jam`] : []),
        ...(minum > 0 ? [`Gratis ${minum} minuman`] : []),
        ...isi.map((x) => `${x.qty}× ${itemOf(s, x.itemId)!.name}`),
      ];
      const baru: Paket = {
        id: lama?.id ?? nextId("pk"),
        name: nama, price: harga, hours: jam, freeDrinks: minum, lastStartHour: mulai,
        perks, aktif: true,
        ...(venuePk !== "spl" ? { venue: venuePk } : {}),
        ...(isi.length ? { isi } : {}),
      };
      return {
        ...s,
        packages: lama ? daftar.map((p) => (p.id === baru.id ? baru : p)) : [...daftar, baru],
        log: note(s, `${lama ? "Paket diubah" : "Paket baru"} · ${nama} · `
          + `${jam > 0 ? `${jam} jam · ` : ""}${isi.length ? `${isi.length} barang · ` : ""}${harga}`, harga),
      };
    }

    case "removePaket": {
      if (!allow(s, "kelolaPromo")) return s;
      const pk = (s.packages ?? []).find((p) => p.id === a.id);
      if (!pk || pk.aktif === false) return s;
      // Dinonaktifkan, BUKAN dihapus: sesi lama menyimpan id paketnya, dan
      // kalau hilang, tagihan sesi itu tidak bisa dijelaskan lagi.
      return {
        ...s,
        packages: s.packages.map((p) => (p.id === a.id ? { ...p, aktif: false } : p)),
        log: note(s, `Paket dinonaktifkan · ${pk.name}`),
      };
    }

    case "removeMenuItem": {
      if (!allow(s, "ubahTarif")) return s;
      const it = (s.customItems ?? []).find((i) => i.id === a.id);
      if (!it || it.aktif === false) return s;
      // Dinonaktifkan, BUKAN dihapus: barang yang pernah terjual harus tetap
      // bernama di pesanan & laporan lama.
      return {
        ...s,
        customItems: s.customItems.map((i) => (i.id === a.id ? { ...i, aktif: false } : i)),
        soldOut: s.soldOut.filter((x) => x !== a.id),
        log: note(s, `Menu dinonaktifkan · ${it.name}`),
      };
    }

    case "setMenuPrice": {
      if (!allow(s, "ubahTarif")) return s;
      const it = findItem(a.itemId);
      if (!it || !Number.isFinite(a.price) || !(a.price > 0)) return s;
      const price = Math.round(a.price);
      if (priceOf(s, it.id) === price) return s;
      const menuPrices = { ...s.menuPrices };
      if (price === it.price) delete menuPrices[it.id];
      else menuPrices[it.id] = price;
      return { ...s, menuPrices, log: note(s, `Harga menu diubah · ${it.name} → ${price}`, price) };
    }

    case "toggleSoldOut": {
      if (!allow(s, "tandaiHabis") || !itemOf(s, a.itemId)) return s;
      const on = s.soldOut.includes(a.itemId);
      const row = s.stock.find((r) => r.itemId === a.itemId);
      if (on && row?.qty === 0) return s;          // stok 0 tidak bisa dijual lagi
      return {
        ...s,
        soldOut: on ? s.soldOut.filter((x) => x !== a.itemId) : [...s.soldOut, a.itemId],
        log: note(s, `${on ? "Tersedia lagi" : "Ditandai HABIS"} · ${a.name}`),
      };
    }

    case "setStock": {
      if (!allow(s, "kelolaStok")) return s;
      if (a.qty !== null && !(a.qty >= 0)) return s;
      if (a.gudang === "central") {
        // Central tidak pernah dijual langsung, jadi tidak menyentuh soldOut.
        if (a.qty === null || !itemOf(s, a.itemId)) return s;
        const qtyC = Math.floor(a.qty);
        const adaC = (s.gudangCentral ?? []).some((r) => r.itemId === a.itemId);
        const central = adaC
          ? s.gudangCentral.map((r) => (r.itemId === a.itemId ? { ...r, qty: qtyC } : r))
          : [...(s.gudangCentral ?? []), { itemId: a.itemId, qty: qtyC, lowAt: 0 }];
        return { ...s, gudangCentral: central,
          log: note(s, `Gudang Central diatur · ${itemOf(s, a.itemId)?.name ?? a.itemId} → ${qtyC}`) };
      }
      const qty = a.qty === null ? null : Math.floor(a.qty);
      const exists = s.stock.some((r) => r.itemId === a.itemId);
      const stock = exists
        ? s.stock.map((r) => (r.itemId === a.itemId ? { ...r, qty } : r))
        : [...s.stock, { itemId: a.itemId, qty, lowAt: 10 }];
      const prevQty = s.stock.find((r) => r.itemId === a.itemId)?.qty;
      const soldOut = qty !== null && qty > 0 && prevQty === 0 ? s.soldOut.filter((x) => x !== a.itemId) : s.soldOut;
      return { ...s, stock, soldOut: syncSoldOut(stock, soldOut), log: note(s, `Stok diatur · ${itemOf(s, a.itemId)?.name ?? a.itemId} → ${qty ?? "tidak dilacak"}`) };
    }

    case "addStock": {
      if (!allow(s, "kelolaStok")) return s;
      if (a.gudang === "central") {
        if (!itemOf(s, a.itemId) || !Number.isFinite(a.delta)) return s;
        const lamaC = (s.gudangCentral ?? []).find((r) => r.itemId === a.itemId);
        const nextC = Math.max(0, (lamaC?.qty ?? 0) + Math.round(a.delta));
        const central = lamaC
          ? s.gudangCentral.map((r) => (r.itemId === a.itemId ? { ...r, qty: nextC } : r))
          : [...(s.gudangCentral ?? []), { itemId: a.itemId, qty: nextC, lowAt: 0 }];
        return { ...s, gudangCentral: central,
          log: note(s, `Gudang Central ${a.delta > 0 ? "+" : ""}${Math.round(a.delta)} · ${itemOf(s, a.itemId)?.name ?? a.itemId}`
            + (a.reason ? ` · ${a.reason}` : "")) };
      }
      const row = s.stock.find((r) => r.itemId === a.itemId);
      if (!row || row.qty === null || !Number.isFinite(a.delta)) return s;
      const next = Math.max(0, row.qty + Math.round(a.delta));
      const stock = s.stock.map((r) => (r.itemId === a.itemId ? { ...r, qty: next } : r));
      const soldOut = next > 0 && row.qty === 0 ? s.soldOut.filter((x) => x !== a.itemId) : s.soldOut;
      /*
       * ALASAN IKUT DITULIS DI JEJAK.
       *
       * Tanpa ini, pengurangan stok manual tidak bisa dibedakan dari
       * penjualan saat opname: dua angka yang sama-sama membuat stok
       * berkurang, satu sah dan satu belum tentu. Layar Gudang mewajibkan
       * alasan untuk pengurangan — yang menyimpannya harus mesin, kalau
       * tidak kewajiban itu cuma hiasan layar.
       */
      return { ...s, stock, soldOut: syncSoldOut(stock, soldOut),
        log: note(s, `Stok ${a.delta > 0 ? "+" : ""}${a.delta} · ${itemOf(s, a.itemId)?.name ?? a.itemId}`
          + (a.reason ? ` · ${a.reason}` : "")) };
    }

    case "transferStock": {
      if (!allow(s, "kelolaStok")) return s;
      const it = itemOf(s, a.itemId);
      // Gudang Bar berdiri sendiri — Central tidak memasoknya (roadmap 8 Okt 2026).
      if (!it || !bolehDariCentral(a.itemId, s)) return s;
      const qty = Math.floor(a.qty);
      if (!(qty > 0)) return s;
      const asal = (s.gudangCentral ?? []).find((r) => r.itemId === a.itemId);
      // Tidak boleh mengirim lebih dari yang ada: transfer MEMINDAH, tidak menciptakan.
      if (!asal || asal.qty === null || asal.qty < qty) return s;
      const tujuan = s.stock.find((r) => r.itemId === a.itemId);
      if (tujuan && tujuan.qty === null) return s;      // barang tidak dilacak stoknya

      const central = s.gudangCentral.map((r) => (r.itemId === a.itemId ? { ...r, qty: (r.qty ?? 0) - qty } : r));
      const stock = tujuan
        ? s.stock.map((r) => (r.itemId === a.itemId ? { ...r, qty: (r.qty ?? 0) + qty } : r))
        : [...s.stock, { itemId: a.itemId, qty, lowAt: 0 }];
      return {
        ...s, gudangCentral: central, stock, soldOut: syncSoldOut(stock, s.soldOut),
        log: note(s, `Transfer gudang · ${qty}× ${it.name} · Central → ${gudangDari(a.itemId)}`),
      };
    }

    case "stockCount": {
      if (!allow(s, "kelolaStok")) return s;
      // Hanya barang yang memang dilacak. Barang ber-qty null sengaja dilewati:
      // pemilik sudah memutuskan barang itu tidak dihitung.
      const fisik = new Map(a.counts.map((c) => [c.itemId, Math.max(0, Math.floor(c.qty))]));
      let ubah = 0, selisih = 0;
      const stock = s.stock.map((r) => {
        const q = fisik.get(r.itemId);
        if (q === undefined || r.qty === null || q === r.qty) return r;
        ubah++; selisih += q - r.qty;
        return { ...r, qty: q };
      });
      if (ubah === 0) return s;
      return {
        ...s, stock, soldOut: syncSoldOut(stock, s.soldOut),
        log: note(s, `Opname stok · ${ubah} barang, selisih ${selisih > 0 ? "+" : ""}${selisih}`),
      };
    }

    case "savePromo": {
      if (!allow(s, "kelolaPromo")) return s;
      const p = a.promo;
      if (!p.name.trim() || p.value < 0 || (p.kind === "percent" && p.value > 100)) return s;
      const exists = s.promos.some((x) => x.id === p.id);
      return {
        ...s,
        promos: exists ? s.promos.map((x) => (x.id === p.id ? p : x)) : [...s.promos, p],
        log: note(s, `Promo ${exists ? "diubah" : "dibuat"} · ${p.name}${p.active ? "" : " (nonaktif)"}`),
      };
    }

    case "deletePromo":
      if (!allow(s, "kelolaPromo") || !s.promos.some((p) => p.id === a.id)) return s;
      return { ...s, promos: s.promos.filter((p) => p.id !== a.id), log: note(s, `Promo dihapus`) };

    /* ── Void ───────────────────────────────────────────────────── */
    case "requestVoid": {
      if (!allow(s, "ajukanVoid")) return s;
      /*
       * SATU PENGAJUAN AKTIF PER PESANAN (permintaan pemilik 19 Okt 2026:
       * *"void bisa diajukan berulang-ulang, harusnya satu kali saja untuk
       * pesanan yang sama"*).
       *
       * Sebelum ini, kasir yang menekan "Ajukan Void" dua kali — karena
       * layarnya tidak memberi tahu pengajuan pertamanya sudah masuk —
       * membuat dua baris menunggu untuk barang yang sama. Lalu superadmin
       * menyetujui keduanya, dan baris itu di-void dua kali: yang kedua
       * tidak menemukan apa-apa, tapi daftar voidnya terlanjur menghitung
       * nilainya dua kali di laporan.
       *
       * Yang dijaga: selama masih MENUNGGU, pengajuan kedua ditolak. Yang
       * sudah diputuskan tidak menghalangi — kalau superadmin menolaknya dan
       * ternyata memang perlu di-void, kasir masih bisa mengajukan lagi.
       */
      if (s.voids.some((v) => v.status === "menunggu"
        && v.targetKind === a.req.targetKind && v.targetId === a.req.targetId)) return s;
      const target = describeVoid(s, a.req.targetKind, a.req.targetId, now);
      if (!target) return s;                        // yang sudah dibayar tidak bisa di-void
      const auto = s.me!.role === "superadmin";
      const req: VoidRequest = {
        ...a.req, label: target.label, amount: target.amount,
        id: nextId("v"), at: now, byId: s.me!.id, byName: s.me!.name,
        status: auto ? "disetujui" : "menunggu",
        decidedBy: auto ? s.me!.name : undefined, decidedAt: auto ? now : undefined,
      };
      const applied = auto ? applyVoid(s, req, now) : s;
      return {
        ...applied, voids: [req, ...applied.voids],
        log: note(applied, `Void ${auto ? "langsung" : "diajukan"} · ${req.label} · ${req.reason}`, req.amount),
      };
    }

    case "decideVoid": {
      if (!allow(s, "setujuiVoid")) return s;
      const req = s.voids.find((v) => v.id === a.id);
      if (!req || req.status !== "menunggu") return s;
      // Validasi ulang saat diputuskan: bisa saja sudah dibayar sejak diajukan.
      const stillValid = !!describeVoid(s, req.targetKind, req.targetId, now);
      const approve = a.approve && stillValid;
      const decided: VoidRequest = {
        ...req, status: approve ? "disetujui" : "ditolak",
        decidedBy: a.approve && !stillValid ? "sistem (sudah dibayar/berubah)" : s.me!.name,
        decidedAt: now,
      };
      const applied = approve ? applyVoid(s, decided, now) : s;
      return {
        ...applied, voids: applied.voids.map((v) => (v.id === a.id ? decided : v)),
        log: note(applied, `Void ${approve ? "DISETUJUI" : "ditolak"} · ${req.label} (diajukan ${req.byName})${a.approve && !stillValid ? " — target sudah dibayar" : ""}`, req.amount),
      };
    }

    case "toggleLight": {
      if (!allow(s, "kontrolLampu") || !punyaLampu(a.tableId) || !(a.tableId in s.lights)) return s;
      const next = !s.lights[a.tableId];
      return { ...s, lights: { ...s.lights, [a.tableId]: next }, log: note(s, `Lampu ${namaMeja(s, a.tableId)} ${next ? "DINYALAKAN" : "dimatikan"}`) };
    }

    case "allLights": {
      if (!allow(s, "kontrolLampu")) return s;
      const lights: Record<string, boolean> = {};
      for (const t of mejaDijual(s)) if (punyaLampu(t.id)) lights[t.id] = a.on;
      if (JSON.stringify(lights) === JSON.stringify(s.lights)) return s;
      return { ...s, lights, log: note(s, `Semua lampu ${a.on ? "dinyalakan" : "dimatikan"}`) };
    }

    /* ── Pelanggan: tahan slot selama membayar ──────────────────── */
    case "hold":
      return holdSlot(s, a.session, now);

    case "releaseHold": {
      const h = s.sessions.find((x) => x.id === a.id && x.status === "hold");
      if (!h) return s;
      return {
        ...s, sessions: s.sessions.filter((x) => x.id !== h.id),
        log: note(s, `Hold dibatalkan pelanggan · ${namaMeja(s, h.tableId)} · ${h.guest}`, undefined, "sistem"),
      };
    }

    /* ── Pembayaran booking online masuk (setara webhook) ───────── */
    case "confirmOnline":
      return confirmOnline(s, a.session, now);

    /* ── Pesanan tamu dari meja (QR) atau takeaway ──────────────── */
    case "guestOrder":
      return guestOrder(s, a.order, now);

    /* ── Pulihkan no-show yang ternyata datang — langsung check-in ── */
    case "restoreNoShow": {
      if (!allow(s, "bukaMeja") || !s.shift || restoreProblem(s, a.id, now)) return s;
      const x = s.sessions.find((v) => v.id === a.id)!;
      // Pesanan pra-order dikembalikan ke bill; yang stoknya sudah terjual ke orang lain dikembalikan dananya.
      const f = fulfil(s, x.noShowFnb ?? []);
      // Hanya baris yang MEMANG SUDAH DIBAYAR yang bisa dikembalikan dananya.
      // Pra-pesan reservasi resto tidak pernah ditagih di muka — menghitungnya
      // sebagai refund akan membuat `paidOnline` jadi minus, dan uang venue
      // berkurang untuk makanan yang tidak pernah dibayar siapa pun.
      const refundAmt = f.dropped.filter((l) => l.prepaid).reduce((n, l) => n + lineValue(l), 0);
      // Minuman gratis Paket Siang yang tidak bisa disajikan lagi mengembalikan jatahnya.
      const freeBack = f.dropped.filter(jatahMinuman).reduce((n, l) => n + l.qty, 0);
      const { settledAt: _a, settledAmount: _b, settledChannel: _c, settledBilliard: _d, settledFnb: _e,
        settledDiscount: _f, noShowFnb: _g, ...rest } = x;
      const running: LiveSession = {
        ...rest, status: "running", startsAt: Math.min(now, x.startsAt), fnb: f.taken,
        paidOnline: x.paidOnline - refundAmt,
        ...(freeBack > 0 && x.freeDrinks !== undefined ? { freeDrinks: x.freeDrinks + freeBack } : {}),
      };
      return {
        ...s, stock: f.stock, soldOut: syncSoldOut(f.stock, s.soldOut),
        sessions: s.sessions.map((v) => (v.id === x.id ? running : v)),
        tickets: [...ticketsFor(forSession(s, running), f.taken, now, `Pra-order · ${x.guest}`), ...s.tickets],
        lights: { ...s.lights, [x.tableId]: true },
        refunds: refundAmt > 0
          ? [refundRow(x.bookingCode ?? x.id, x.guest, x.phone, refundAmt, "menu pra-order sudah habis saat booking dipulihkan", now), ...s.refunds]
          : s.refunds,
        log: note(s, `No-show dipulihkan & check-in · ${namaMeja(s, x.tableId)} · ${x.guest}`),
      };
    }

    /* ── Takeaway diambil & dibayar di kasir ────────────────────── */
    case "settleOrder": {
      if (!allow(s, "tutupTab") || !s.shift) return s;
      const o = s.orders.find((x) => x.id === a.id);
      // Hanya pesanan takeaway yang belum dibayar. Pesanan yang menempel di meja
      // ikut ditagih saat tab mejanya ditutup.
      if (!o || o.status !== "diterima" || o.sessionId || o.payment) return s;
      const sisa = o.value - o.paidOnline;
      if (!(sisa > 0)) return s;
      const bayar: Payment = {
        id: nextId("pay"), at: now, channel: a.channel, amount: sisa, shiftId: s.shift.id,
        ...(s.me ? { by: s.me.name } : {}),
        ...(mesinSah(s, a.channel, a.mesin) ? { mesin: mesinSah(s, a.channel, a.mesin) } : {}),
      };
      return {
        ...s,
        orders: s.orders.map((x) => (x.id === o.id ? { ...x, payment: bayar } : x)),
        log: note(s, `Takeaway dibayar · ${o.code} · ${o.guest} · ${a.channel.toUpperCase()}`, sisa),
      };
    }

    case "settleRefund": {
      if (!allow(s, "lihatLaporanKeuangan")) return s;
      const r = s.refunds.find((x) => x.id === a.id && !x.settledAt);
      if (!r) return s;
      return {
        ...s,
        refunds: s.refunds.map((x) => (x.id === r.id ? { ...x, settledAt: now, settledBy: s.me!.name, method: a.method } : x)),
        log: note(s, `Dana dikembalikan (${a.method}) · ${r.guest} · ${r.bookingCode}`, r.amount),
      };
    }
  }
  return s;
}

/**
 * Pelanggan membuka halaman QRIS. Slot DITAHAN dan harga DIBEKUKAN (PRD §7.2)
 * supaya dua orang tidak membayar slot yang sama. Tidak ada uang yang
 * bergerak, jadi penolakan cukup berupa "tidak ada hold" — layar
 * membacanya sebagai "slot baru saja diambil orang lain".
 */
function holdSlot(s: State, sent: LiveSession, now: number): State {
  if (s.sessions.some((x) => x.id === sent.id)) return s;                // idempoten
  const hours = Math.round((sent.endsAt - sent.startsAt) / HOUR_MS);
  if (sent.endsAt - sent.startsAt !== hours * HOUR_MS) return s;
  const paket = !!sent.paket;
  if (slotProblem(s, { tableId: sent.tableId, startsAt: sent.startsAt, hours, paket: sent.paket }, now, true)) return s;
  if (cartProblem(s, sent.fnb)) return s;
  const table = cariMeja(sent.tableId)!;
  const kelas = classOf(s, table.id);
  const pk = paketOf(s, sent.paket);
  const tableAmount = paket && pk ? pk.price : priceWith(s.rates, kelas, hourIdx(sent.startsAt), hours);
  const priced = priceLines(s, sent.fnb, paket && pk ? pk.freeDrinks : 0);
  const hold: LiveSession = {
    id: sent.id, tableId: table.id, source: "online", guest: sent.guest || "Pelanggan", phone: sent.phone,
    startsAt: sent.startsAt, endsAt: sent.endsAt, status: "hold", bookingCode: sent.bookingCode,
    fnb: [], tableAmount, paidOnline: 0, tableType: kelas,
    holdUntil: now + (HOLD_MIN + HOLD_GRACE_MIN) * 60_000, holdLines: priced.lines,
    ...(paket && pk ? { paket: pk.id, freeDrinks: priced.credits } : {}),
  };
  return {
    ...s, sessions: [...s.sessions, hold],
    log: note(s, `Slot ditahan · ${table.name} · ${hold.guest} · menunggu pembayaran`, tableAmount + priced.total, "sistem"),
  };
}

/**
 * Pembayaran booking online diterima. Setara handler webhook Midtrans:
 * slot, harga, dan stok DIVERIFIKASI ULANG di sini. Kalau ada yang tidak
 * cocok, booking ditolak dan dananya dicatat untuk dikembalikan —
 * tidak pernah diterima diam-diam (PRD WH-10).
 *
 * - Ada hold aktif  → harga beku saat hold dipakai.
 * - Hold sudah lepas → slot dicek ulang dengan harga terkini; kalau sudah
 *   diambil orang lain, dana dikembalikan (PRD §7.2 `paid_unfulfilled`).
 * - Menu yang habis sejak QR dibuat → booking tetap jalan, menu itu saja
 *   yang dananya dikembalikan.
 */
function confirmOnline(s: State, sent: LiveSession, now: number): State {
  if (s.paymentIds.includes(sent.id)) return s;                          // notifikasi ganda: idempoten
  const next = processPayment(s, sent, now);
  return { ...next, paymentIds: [...s.paymentIds, sent.id] };
}

function processPayment(s: State, sent: LiveSession, now: number): State {
  const existing = s.sessions.find((x) => x.id === sent.id);
  if (existing && existing.status !== "hold") return s;                   // notifikasi ganda: idempoten
  const base: State = existing ? { ...s, sessions: s.sessions.filter((x) => x.id !== existing.id) } : s;
  const code = sent.bookingCode ?? sent.id;

  const reject = (reason: string): State => ({
    ...base,
    refunds: [{ id: nextId("rf"), at: now, bookingCode: code, guest: sent.guest, amount: sent.paidOnline, reason }, ...base.refunds],
    log: note(base, `Booking online DITOLAK · ${code} · ${reason} · dana dikembalikan`, sent.paidOnline, "sistem"),
  });

  const hold = existing ?? null;
  const from = hold ?? sent;
  const table = cariMeja(from.tableId);
  if (!table) return reject("meja tidak dikenal");
  const hours = Math.round((from.endsAt - from.startsAt) / HOUR_MS);
  if (hours < 1 || from.endsAt - from.startsAt !== hours * HOUR_MS) return reject("durasi tidak valid");
  const paket = !!from.paket;
  const problem = slotProblem(base, { tableId: table.id, startsAt: from.startsAt, hours, paket: from.paket }, now, false);
  if (problem) return reject(problem === "slot sudah terisi" ? "slot sudah terisi saat pembayaran masuk" : problem);

  let tableAmount: number, lines: CartLine[], credits: number;
  if (hold) {
    tableAmount = hold.tableAmount;
    lines = hold.holdLines ?? [];
    credits = hold.freeDrinks ?? 0;
  } else {
    for (const l of sent.fnb) {
      if (!itemOf(s, l.itemId) || !Number.isInteger(l.qty) || l.qty < 1) return reject("item pesanan tidak valid");
    }
    const pk2 = paketOf(base, sent.paket);
    tableAmount = paket && pk2 ? pk2.price : priceWith(base.rates, classOf(base, table.id), hourIdx(from.startsAt), hours);
    const priced = priceLines(base, sent.fnb, paket && pk2 ? pk2.freeDrinks : 0);
    lines = priced.lines;
    credits = priced.credits;
  }

  const required = tableAmount + lines.reduce((n, l) => n + lineValue(l), 0);
  if (sent.paidOnline !== required) {
    return reject(`nominal tidak cocok (dibayar ${sent.paidOnline}, seharusnya ${required})`);
  }

  const f = fulfil(base, lines.map((l) => ({ ...l, prepaid: true })));
  const refundAmt = f.dropped.reduce((n, l) => n + lineValue(l), 0);
  const freeBack = f.dropped.filter(jatahMinuman).reduce((n, l) => n + l.qty, 0);
  const session: LiveSession = {
    id: sent.id, tableId: table.id, source: "online", guest: sent.guest || from.guest,
    phone: sent.phone ?? from.phone, startsAt: from.startsAt, endsAt: from.endsAt, status: "booked",
    bookingCode: sent.bookingCode, checkin: sent.checkin,
    fnb: f.taken, tableAmount, paidOnline: required - refundAmt, extraTable: 0,
    tableType: hold?.tableType ?? classOf(base, table.id),
    ...(paket && from.paket ? { paket: from.paket, freeDrinks: credits + freeBack } : {}),
  };
  const refunds = refundAmt > 0
    ? [{
        id: nextId("rf"), at: now, bookingCode: code, guest: session.guest, amount: refundAmt,
        reason: `menu habis saat pembayaran masuk: ${f.dropped.map((l) => l.name ?? findItem(l.itemId)?.name ?? l.itemId).join(", ")}`,
      }, ...base.refunds]
    : base.refunds;
  return {
    ...base, stock: f.stock, soldOut: syncSoldOut(f.stock, base.soldOut), refunds,
    sessions: [...base.sessions, session],
    log: note(base, `Booking online masuk · ${table.name} · ${session.guest}${refundAmt > 0 ? " · sebagian menu dikembalikan" : ""}`, required, "sistem"),
  };
}

/**
 * Pesanan tamu tanpa booking.
 * - QR meja + bayar online : menempel ke sesi meja sebagai baris LUNAS.
 * - QR meja + bayar kasir  : masuk bill meja, dibayar saat tutup tab.
 * - Takeaway               : wajib bayar di muka, dapur langsung dapat tiket.
 */
/**
 * Berapa lama meja resto dianggap "terpakai" saat dibuka pesanan tamu.
 *
 * Dipakai hanya untuk memeriksa bentrok dengan reservasi — meja makan tidak
 * bersewa waktu, jadi angka ini bukan tagihan dan bukan batas duduk. Sama
 * dengan jendela yang dipakai kasir saat membuka meja (`walkin`).
 */
export const RESTO_BUKA_MENIT = 30;

/** Sesi meja makan yang dibuka oleh pesanan tamu sendiri. */
function sesiRestoBaru(s: State, tableId: string, guest: string, now: number): LiveSession {
  return {
    id: nextId(`w-${tableId}`), tableId, source: "walkin",
    guest: guest || "Tamu", startsAt: now, endsAt: now + RESTO_BUKA_MENIT * 60_000,
    status: "running", fnb: [], paidOnline: 0,
    // Tanpa sewa waktu: meja resto bertarif 0, dan tidak ada blok jam.
    tableAmount: 0, rates: { ...s.rates }, tableType: classOf(s, tableId),
  };
}

function guestOrder(s: State, o: GuestOrderRequest, now: number): State {
  if (s.orders.some((x) => x.id === o.id)) return s;                     // idempoten
  const guest = o.guest?.trim() || "Tamu";
  const paidIn = o.pay === "online" ? Math.max(0, o.paidOnline) : 0;

  const reject = (reason: string): State => ({
    ...s,
    orders: [{
      id: o.id, code: o.code, at: now, guest, phone: o.phone, mode: o.mode, tableId: o.tableId,
      pay: o.pay, lines: [], value: 0, paidOnline: paidIn, status: "ditolak", reason,
      ...(o.venue ? { venue: o.venue } : {}),
    }, ...s.orders],
    refunds: paidIn > 0
      ? [{ id: nextId("rf"), at: now, bookingCode: o.code, guest, amount: paidIn, reason }, ...s.refunds]
      : s.refunds,
    log: note(s, `Pesanan tamu DITOLAK · ${o.code} · ${reason}${paidIn > 0 ? " · dana dikembalikan" : ""}`, paidIn || undefined, "sistem"),
  });

  const problem = guestOrderProblem(s, o, now);
  if (problem) return reject(problem);

  // Meja resto yang belum terbuka dibuka SEKARANG oleh pesanan ini sendiri
  // (lihat `guestOrderProblem`). Sesinya dibuat dulu supaya barisnya punya
  // tempat menempel, persis seperti meja yang dibuka kasir.
  const adaSesi = o.mode === "meja" ? runningOn(s, o.tableId) : undefined;
  const bukaSendiri = !adaSesi && o.mode === "meja" && !!o.tableId && classOf(s, o.tableId) === "resto"
    ? sesiRestoBaru(s, o.tableId, o.guest?.trim() || "Tamu", now)
    : undefined;
  // Sesinya BELUM dimasukkan ke state di sini — baru sesudah seluruh
  // pemeriksaan lolos. Kalau dimasukkan sekarang, pesanan yang DITOLAK
  // (nominal tidak cocok, stok kurang) tetap meninggalkan meja terbuka atas
  // nama tamu yang pesanannya tidak pernah jadi.
  const sess = adaSesi ?? bukaSendiri;
  const priced = priceLines(s, o.lines, sess?.freeDrinks ?? 0);
  if (o.pay === "online" && o.paidOnline !== priced.total) {
    return reject(`nominal tidak cocok (dibayar ${o.paidOnline}, seharusnya ${priced.total})`);
  }
  const prepaid = o.pay === "online";
  const keyed = sess ? withUniqueKeys(sess.fnb, priced.lines, `${o.id}:`) : priced.lines;
  // Setiap baris membawa ID pesanannya — void baris di bill ikut memperbarui pesanan tamu.
  const lines = keyed.map((l) => ({ ...l, orderId: o.id, ...(prepaid ? { prepaid: true } : {}) }));
  const stock = takeStock(s.stock, lines);
  if (!stock) return reject("stok pesanan tidak cukup");

  // Semua pemeriksaan lolos: barulah mejanya benar-benar dibuka.
  if (bukaSendiri) {
    s = { ...s, sessions: [...s.sessions, bukaSendiri] };     // meja makan: tanpa lampu
  }

  const tObj = o.tableId ? cariMeja(o.tableId) : undefined;
  const order: GuestOrder = {
    id: o.id, code: o.code, at: now, guest, phone: o.phone, mode: o.mode,
    tableId: sess?.tableId ?? o.tableId, pay: o.pay, lines, value: priced.total,
    paidOnline: prepaid ? priced.total : 0, sessionId: sess?.id, status: "diterima",
    // Pesanan bermeja mewarisi venue mejanya; yang tanpa meja membawa sendiri.
    venue: (sess?.tableId ?? o.tableId) ? venueDari((sess?.tableId ?? o.tableId)!) : o.venue,
  };
  const target = sess
    ? forSession(s, sess)
    : { id: o.id, tableName: o.mode === "meja" && tObj ? tObj.name : `Takeaway ${o.code.slice(-4)}` };
  return {
    ...s, stock, soldOut: syncSoldOut(stock, s.soldOut),
    sessions: sess
      ? s.sessions.map((x) => x.id === sess.id ? {
          ...x, fnb: [...x.fnb, ...lines], paidOnline: x.paidOnline + order.paidOnline,
          freeDrinks: x.freeDrinks !== undefined ? priced.credits : undefined,
        } : x)
      : s.sessions,
    orders: [order, ...s.orders],
    tickets: [...ticketsFor(target, lines, now, `${sess ? "QR" : o.mode === "meja" ? `QR ${tObj?.name ?? ""}` : "Takeaway"} · ${guest}`), ...s.tickets],
    log: note(s, `Pesanan ${sess ? `QR ${namaMeja(s, sess.tableId)}` : o.mode === "meja" ? `QR ${tObj?.name ?? o.tableId ?? ""}` : "takeaway"} · ${guest}${bukaSendiri ? " · meja dibuka pesanan ini" : ""} · ${prepaid ? "lunas online" : "masuk bill meja"}`, priced.total, "sistem"),
  };
}

/** Jam "14.05" tanpa locale — teks jejak audit harus sama persis di semua perangkat. */
const jamLog = (ts: number) => {
  const d = diWib(ts);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** Meja resto yang cocok: yang diminta tamu, atau meja terkecil yang muat & kosong. null = penuh. */
function restoTableFor(
  s: Pick<State, "sessions" | "tableTypes" | "mejaPakai">,
  r: Pick<RestoRequest, "pax" | "startsAt" | "hours" | "tableId">,
  now: number,
): string | null {
  const until = r.startsAt + r.hours * HOUR_MS;
  const kosong = (id: string) => tableFreeForRange(s.sessions, id, r.startsAt, until, undefined, now);
  if (r.tableId) {
    const t = cariMeja(r.tableId);
    if (!t || !mejaDipakai(s, t.id) || classOf(s, t.id) !== "resto"
      || t.capacity < r.pax || !kosong(t.id)) return null;
    return t.id;
  }
  const muat = mejaDijual(s).filter((t) => classOf(s, t.id) === "resto" && t.capacity >= r.pax && kosong(t.id))
    .sort((p, q) => p.capacity - q.capacity || (p.id < q.id ? -1 : 1));
  return muat[0]?.id ?? null;
}

/** Kenapa reservasi meja resto ditolak. null = boleh. Dipakai layar tamu DAN mesin. */
export function restoProblem(
  s: Pick<State, "sessions" | "tableTypes" | "jamBebas">,
  r: Pick<RestoRequest, "pax" | "startsAt" | "hours" | "tableId">,
  now = clock(),
): string | null {
  if (!Number.isInteger(r.pax) || r.pax < 1 || r.pax > 30) return "jumlah orang tidak valid";
  if (!Number.isInteger(r.hours) || r.hours < 1 || r.hours > 4) return "durasi tidak valid";
  const d = new Date(r.startsAt);
  if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) return "jam mulai harus tepat di awal jam";
  const startH = hourIdx(r.startsAt);
  if (!dalamJamBuka(s, startH) || startH + r.hours > batasJamTutup(s)) return "di luar jam buka resto";
  if (r.startsAt <= now) return "jam itu sudah lewat";
  if (r.startsAt - now < RESTO_LEAD_MIN * 60_000) return `reservasi paling cepat ${RESTO_LEAD_MIN} menit sebelum datang`;
  if (restoTableFor(s, r, now) === null) return "meja resto untuk jam itu sudah penuh";
  return null;
}

/** Kode check-in 6 angka yang deterministik dari id kejadian — sama di semua perangkat. */
function kodeCheckin(s: Pick<State, "sessions">, seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  for (let n = 0; n < 50; n++) {
    const kode = String(100000 + (Math.abs((h >>> 0) + n * 7919) % 900000));
    if (!s.sessions.some((x) => x.checkin === kode)) return kode;
  }
  return String(100000 + (Math.abs(h >>> 0) % 900000));
}

/**
 * Reservasi meja Smokehouse Resto. Tidak ada uang di muka dan tidak ada meteran
 * jam — yang dijanjikan hanya mejanya. Tamu check-in dengan kode seperti booking
 * biliar, dan kalau tidak datang mejanya dilepas otomatis (20 menit).
 */
function reserveResto(s: State, r: RestoRequest, now: number): State {
  if (s.sessions.some((x) => x.id === r.id)) return s;                  // idempoten
  const guest = (r.guest ?? "").trim();
  const phone = (r.phone ?? "").replace(/[^0-9+]/g, "");
  if (guest.length < 2 || phone.replace(/\D/g, "").length < 9) return s;
  if (restoProblem(s, r, now)) return s;
  /*
   * MAKANAN YANG DIPESAN SEKALIAN.
   *
   * Barangnya wajib dikenal dan jumlahnya masuk akal — kalau tidak,
   * reservasinya DITOLAK UTUH, bukan diterima separuh. Reservasi yang
   * mejanya jadi tapi makanannya diam-diam hilang adalah bentuk kegagalan
   * yang paling buruk: tamu merasa sudah memesan, dapur tidak tahu apa-apa.
   *
   * Barang yang sedang habis TIDAK ditolak di sini. Reservasi bisa untuk
   * dua minggu lagi, dan "habis hari ini" tidak berarti habis hari itu;
   * yang memeriksa ketersediaan adalah check-in, saat dapur mulai memasak.
   */
  const diminta = r.lines ?? [];
  if (diminta.length > 40) return s;
  for (const l of diminta) {
    if (!itemOf(s, l.itemId) || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 20) return s;
  }
  // Harga DIKUNCI sekarang: tamu memesan dengan harga yang dilihatnya hari
  // ini, dan perubahan harga sesudahnya tidak boleh menagih ulang.
  const pra = withUniqueKeys([], priceLines(s, diminta, 0).lines, "pra")
    .map((l): CartLine => ({ ...l, pra: true }));
  const tableId = restoTableFor(s, r, now)!;
  const sess: LiveSession = {
    id: r.id, tableId, source: "online", guest: guest.slice(0, 40), phone,
    startsAt: r.startsAt, endsAt: r.startsAt + r.hours * HOUR_MS, status: "booked",
    bookingCode: r.code, checkin: kodeCheckin(s, r.id),
    fnb: pra, tableAmount: 0, paidOnline: 0, tableType: "resto", pax: r.pax,
    ...(r.note ? { note: r.note.slice(0, 300) } : {}),
  };
  return {
    ...s, sessions: [...s.sessions, sess],
    log: note(s, `Reservasi resto · ${namaMeja(s, tableId)} · ${sess.guest} · ${r.pax} orang · ${jamLog(r.startsAt)}`
      + (pra.length ? ` · pra-pesan ${pra.length} baris` : ""), undefined, "sistem"),
  };
}

/**
 * Status void sebuah target — satu sumber untuk reducer DAN layar.
 *
 * Layar wajib memakai ini, bukan mencari sendiri di `s.voids`: kalau layar
 * memakai aturan yang sedikit berbeda dari mesin, tombolnya akan menawarkan
 * sesuatu yang mesinnya tolak diam-diam — dan itu persis keluhan yang
 * membuat aturan ini ada.
 */
export function statusVoid(
  s: Pick<State, "voids">, kind: VoidRequest["targetKind"], targetId: string,
): VoidRequest | undefined {
  const milik = s.voids.filter((v) => v.targetKind === kind && v.targetId === targetId);
  // Yang menunggu paling penting dibaca kasir; sesudahnya yang terakhir diputuskan.
  return milik.find((v) => v.status === "menunggu")
    ?? milik.sort((x, y) => (y.decidedAt ?? y.at) - (x.decidedAt ?? x.at))[0];
}

/**
 * Venue sebuah pengajuan void, atau null kalau tidak bisa dipetakan.
 *
 * Dipakai layar Void untuk menyaring daftarnya. Null berarti targetnya sudah
 * tidak ada (jejak lama, sesi yang sudah diarsipkan) — barisnya tetap
 * ditampilkan di kedua venue, karena hilang dari keduanya lebih buruk.
 */
export function venueVoid(
  s: Pick<State, "sessions" | "orders">, v: Pick<VoidRequest, "targetKind" | "targetId">,
): Venue | null {
  const id = v.targetKind === "item" ? v.targetId.split("|")[0] : v.targetId;
  const sesi = s.sessions.find((x) => x.id === id);
  if (sesi) return venueDari(sesi.tableId);
  const o = s.orders.find((x) => x.id === id);
  return o ? venueOrder(o) : null;
}

/**
 * Venue sebuah tiket dapur — lewat sesinya, atau lewat pesanan takeaway-nya.
 *
 * `null` untuk tiket yang sasarannya sudah tidak ada: ditampilkan di KEDUA
 * venue, karena tiket yang hilang dari dua-duanya adalah hidangan yang tidak
 * pernah diantar ke siapa pun.
 */
export function venueTiket(
  s: Pick<State, "sessions" | "orders">, t: Pick<Ticket, "sessionId">,
): Venue | null {
  const sesi = s.sessions.find((x) => x.id === t.sessionId);
  if (sesi) return venueDari(sesi.tableId);
  const o = s.orders.find((x) => x.id === t.sessionId);
  return o ? venueOrder(o) : null;
}

/**
 * Hidangan yang sudah MATANG tapi belum diantar, di satu venue.
 *
 * Dipakai layar Antar dan nomor di tabnya. Ditaruh di mesin, bukan di
 * layarnya, karena dua layar membacanya — dan selektor yang tinggal di salah
 * satu layar membuat layar yang lain mengimpornya melingkar.
 */
export const siapDiantar = (
  s: Pick<State, "sessions" | "orders" | "tickets">, venue: Venue,
): Ticket[] =>
  s.tickets.filter((t) => {
    if (t.status !== "ready") return false;
    const v = venueTiket(s, t);
    return v === null || v === venue;
  });

/** Status void satu BARIS pesanan — kuncinya `sesi|baris`. */
export const statusVoidBaris = (s: Pick<State, "voids">, sessionId: string, key: string) =>
  statusVoid(s, "item", `${sessionId}|${key}`);

/** Kenapa check-in ditolak — satu sumber alasan untuk reducer dan layar. null = boleh. */
export function checkinProblem(s: State, code: string, now = clock()): string | null {
  const bk = s.sessions.find((x) => x.checkin === code && x.status === "booked");
  if (!bk) {
    const any = s.sessions.find((x) => x.checkin === code);
    if (any?.status === "noshow") return "Booking ini sudah dilepas karena tidak datang.";
    if (any?.status === "running" || any?.status === "done") return "Kode ini sudah dipakai check-in.";
    return "Kode tidak ditemukan.";
  }
  if (now >= bk.endsAt) return "Waktu booking sudah habis.";
  // Batas yang sama dengan detak no-show — layar tidak boleh bilang "masuk" untuk
  // booking yang di detik yang sama dilepas mesin.
  const due = noShowDueAt(s.sessions, bk, now);
  if (due !== null && due < now) return "Booking ini sudah lewat batas datang dan dilepas.";
  if (now < bk.startsAt - EARLY_CHECKIN_MIN * 60_000) {
    return `Terlalu awal — check-in paling cepat ${EARLY_CHECKIN_MIN} menit sebelum jam booking.`;
  }
  const startsAt = Math.min(now, bk.startsAt);
  if (!tableFreeForRange(s.sessions, bk.tableId, startsAt, bk.endsAt, bk.id, now)) {
    return `${namaMeja(s, bk.tableId)} masih dipakai — tunggu atau pindahkan tamu ke meja lain.`;
  }
  return null;
}

/** Kenapa booking no-show tidak bisa dipulihkan (lalu langsung check-in). null = boleh. */
export function restoreProblem(s: State, id: string, now = clock()): string | null {
  const x = s.sessions.find((v) => v.id === id && v.status === "noshow");
  if (!x) return "Booking tidak ditemukan.";
  if (now >= x.endsAt) return "Waktu booking sudah habis.";
  if (!tableFreeForRange(s.sessions, x.tableId, Math.min(now, x.startsAt), x.endsAt, x.id, now)) {
    return `${namaMeja(s, x.tableId)} sudah terisi lagi — tidak bisa dipulihkan di meja ini.`;
  }
  return null;
}

/** Sesi yang harus diselesaikan/dipindah dulu sebelum meja boleh dinonaktifkan. */
export function maintenanceBlockers(s: Pick<State, "sessions">, tableId: string, now = clock()) {
  // Booking yang jadwalnya sudah habis tidak lagi memakai meja — tidak menghalangi maintenance.
  return s.sessions.filter((x) =>
    x.tableId === tableId && (x.status === "running" || x.status === "hold" || (x.status === "booked" && !bookingLapsed(x, now))));
}

const refundRow = (code: string, guest: string, phone: string | undefined, amount: number, reason: string, now: number): Refund =>
  ({ id: nextId("rf"), at: now, bookingCode: code, guest, ...(phone ? { phone } : {}), amount, reason });

/** Baris pesanan tamu yang belum diserahkan (belum ada tiket "served" untuknya). */
export function unservedLinesOf(s: Pick<State, "tickets">, o: GuestOrder): CartLine[] {
  const target = o.sessionId ?? o.id;
  return o.lines.filter((l) => !s.tickets.some((t) => t.sessionId === target && t.lineKey === l.key && t.status === "served"));
}

/** Target void yang sah beserta nilainya; null = tidak boleh di-void. */
function describeVoid(s: State, kind: VoidRequest["targetKind"], targetId: string, now: number) {
  if (kind === "sesi") {
    const x = s.sessions.find((v) => v.id === targetId);
    if (!x || (x.status !== "running" && x.status !== "booked")) return null;
    const bill = settlementOf(x, s, now);
    return { label: `Sesi ${namaMeja(s, x.tableId)} · ${x.guest}`, amount: bill.billiard + bill.fnb };
  }
  if (kind === "pesanan") {
    const o = s.orders.find((v) => v.id === targetId);
    if (!o || o.status !== "diterima") return null;
    // Pesanan QR yang menempel hanya bisa di-void selama tab mejanya masih jalan.
    if (o.sessionId && s.sessions.find((x) => x.id === o.sessionId)?.status !== "running") return null;
    // Yang sudah diserahkan dianggap terjual; hanya sisa yang belum dibuat yang bisa di-void.
    const open = unservedLinesOf(s, o);
    if (open.length === 0) return null;
    return {
      label: `${o.mode === "takeaway" ? "Takeaway" : "Pesanan QR"} ${o.code} · ${o.guest}`,
      amount: open.reduce((n, l) => n + lineValue(l), 0),
    };
  }
  const [sessionId, key] = targetId.split("|");
  const x = s.sessions.find((v) => v.id === sessionId);
  const line = x?.fnb.find((l) => l.key === key);
  if (!x || x.status !== "running" || !line || line.prepaid) return null;
  // Baris yang sudah dilunasi per orang, atau yang membuat tagihan jatuh di bawah uang
  // yang sudah diterima, tidak bisa di-void begitu saja — uangnya harus dikembalikan dulu.
  if (paidLineKeys(x).has(key)) return null;
  if (counterWith(x, x.fnb.filter((l) => l.key !== key), s, now) < splitPaidOf(x)) return null;
  return { label: `${line.qty}× ${findItem(line.itemId)?.name ?? line.itemId} · ${namaMeja(s, x.tableId)}`, amount: lineValue(line) };
}

function applyVoid(s: State, req: VoidRequest, now: number): State {
  if (req.targetKind === "sesi") {
    const sess = s.sessions.find((x) => x.id === req.targetId);
    if (!sess) return s;
    const back = returnStock(s.stock, s.soldOut, sess.fnb);
    // Uang online tidak boleh lenyap, dan dicatat atas nama PEMBAYARNYA: tiap pesanan QR
    // yang lunas atas kodenya sendiri, sisanya atas kode booking/meja.
    const attached = s.orders.filter((o) => o.sessionId === sess.id && o.status === "diterima");
    const byOrder = attached.filter((o) => o.paidOnline > 0)
      .map((o) => refundRow(o.code, o.guest, o.phone, o.paidOnline, `void: ${req.reason}`, now));
    const rest = sess.paidOnline - attached.reduce((n, o) => n + o.paidOnline, 0);
    const own = rest > 0 ? [refundRow(sess.bookingCode ?? sess.id, sess.guest, sess.phone, rest, `void: ${req.reason}`, now)] : [];
    // Uang split bill yang sudah diterima kasir juga harus dikembalikan.
    const bySplit = (sess.payments ?? []).filter((p) => p.amount > 0)
      .map((p) => refundRow(sess.bookingCode ?? sess.id, sess.guest, sess.phone, p.amount, `void: ${req.reason}`, now));
    return {
      ...s, stock: back.stock, soldOut: syncSoldOut(back.stock, back.soldOut),
      refunds: [...own, ...byOrder, ...bySplit, ...s.refunds],
      sessions: markReady(s.sessions.filter((x) => x.id !== req.targetId), sess, now),
      orders: s.orders.map((o) => (o.sessionId === sess.id && o.status === "diterima" ? { ...o, status: "void" as const } : o)),
      lights: { ...s.lights, [sess.tableId]: false },
      tickets: s.tickets.filter((t) => t.sessionId !== req.targetId),
    };
  }
  if (req.targetKind === "pesanan") {
    const o = s.orders.find((x) => x.id === req.targetId);
    if (!o) return s;
    const open = unservedLinesOf(s, o);
    if (open.length === 0) return s;
    const keys = new Set(open.map((l) => l.key));
    const value = open.reduce((n, l) => n + lineValue(l), 0);
    const refundAmt = o.pay === "online" ? value : 0;
    // Takeaway yang SUDAH dibayar di kasir (aksi `settleOrder`) lalu sebagian barangnya
    // di-void: uangnya tidak boleh diam-diam tetap tercatat sebagai omzet. Kelebihan
    // bayarnya dikeluarkan lagi dari kas/kanal hari itu dan masuk daftar dana yang
    // wajib dikembalikan — aturan yang sama dengan split bill pada sesi.
    const kasirBack = Math.min(o.payment?.amount ?? 0, Math.max(0, value - refundAmt));
    const freeBack = open.filter(jatahMinuman).reduce((n, l) => n + l.qty, 0);
    const remaining = o.lines.filter((l) => !keys.has(l.key));
    const target = o.sessionId ?? o.id;
    const back = returnStock(s.stock, s.soldOut, open);
    return {
      ...s, stock: back.stock, soldOut: syncSoldOut(back.stock, back.soldOut),
      sessions: o.sessionId
        ? s.sessions.map((x) => (x.id === o.sessionId ? {
            ...x, fnb: x.fnb.filter((l) => !(l.orderId === o.id && keys.has(l.key))),
            paidOnline: x.paidOnline - refundAmt,
            ...(freeBack > 0 && x.freeDrinks !== undefined ? { freeDrinks: x.freeDrinks + freeBack } : {}),
          } : x))
        : s.sessions,
      orders: s.orders.map((x) => (x.id === o.id ? {
        ...x, lines: remaining, value: x.value - value, paidOnline: x.paidOnline - refundAmt,
        ...(x.payment ? { payment: { ...x.payment, amount: x.payment.amount - kasirBack } } : {}),
        status: remaining.length > 0 ? ("diterima" as const) : ("void" as const),
      } : x)),
      tickets: s.tickets.filter((t) => !(t.sessionId === target && t.lineKey !== undefined && keys.has(t.lineKey))),
      refunds: [
        ...(refundAmt > 0 ? [refundRow(o.code, o.guest, o.phone, refundAmt, `void: ${req.reason}`, now)] : []),
        ...(kasirBack > 0 ? [refundRow(o.code, o.guest, o.phone, kasirBack, `void sesudah dibayar di kasir: ${req.reason}`, now)] : []),
        ...s.refunds,
      ],
    };
  }
  const [sessionId, key] = req.targetId.split("|");
  const sess = s.sessions.find((x) => x.id === sessionId);
  const line = sess?.fnb.find((l) => l.key === key);
  if (!sess || !line) return s;
  const back = returnStock(s.stock, s.soldOut, [line]);
  // Tiket dicocokkan lewat kunci baris. Pola lama (item + jumlah) hanya untuk tiket
  // tanpa kunci, dan tidak dipakai bila baris ini memang punya tiket (mis. sudah diantar).
  const keyed = s.tickets.some((t) => t.sessionId === sessionId && t.lineKey === key);
  let removedTicket = false;
  return {
    ...s, stock: back.stock, soldOut: syncSoldOut(back.stock, back.soldOut),
    // Minuman gratis Paket Siang yang di-void mengembalikan jatahnya ke tamu.
    sessions: s.sessions.map((x) => (x.id === sessionId ? {
      ...x, fnb: x.fnb.filter((l) => l.key !== key),
      ...(jatahMinuman(line) && x.freeDrinks !== undefined ? { freeDrinks: x.freeDrinks + line.qty } : {}),
    } : x)),
    // Baris dari pesanan QR "bayar di kasir": pesanan asalnya ikut diperbarui.
    orders: line.orderId
      ? s.orders.map((o) => {
          if (o.id !== line.orderId) return o;
          const lines = o.lines.filter((l) => l.key !== key);
          return { ...o, lines, value: o.value - lineValue(line), status: lines.length > 0 ? o.status : ("void" as const) };
        })
      : s.orders,
    tickets: s.tickets.filter((t) => {
      if (t.sessionId !== sessionId || t.status === "served") return true;
      const match = keyed ? t.lineKey === key
        : !removedTicket && t.lineKey === undefined && t.itemId === line.itemId && t.qty === line.qty;
      if (match) { removedTicket = true; return false; }
      return true;
    }),
  };
}

/* ═════════════ Turunan untuk layar ═════════════ */

/**
 * Rentang yang harus kosong di meja tujuan saat sesi dipindah. Tamu yang sedang main
 * menempati meja baru mulai SEKARANG sampai tab ditutup: open bill minimal 30 menit,
 * dan booking online yang sudah lewat jam selesainya (tamu belum pulang) tetap
 * dihitung menempati — rentang kosong tidak boleh membuat meja terisi tampak bebas.
 */
function relocationRange(sess: LiveSession, now: number) {
  if (sess.status !== "running") return { from: sess.startsAt, until: sess.endsAt };
  return {
    from: now,
    // Open bill tidak punya jam selesai (minimal 30 menit); paket per jam & booking punya.
    until: sess.source === "walkin" && !sess.blockHours
      ? Math.max(sess.endsAt, now + 30 * 60_000)
      : Math.max(sess.endsAt, now),
  };
}

export function relocationTargets(
  st: Pick<State, "sessions" | "tableTypes" | "mejaPakai">, sess: LiveSession, now = clock(),
) {
  if (sess.status !== "booked" && sess.status !== "running") return [];
  const kelas = sessionType(sess);
  // Rentang yang SAMA dengan yang diperiksa reducer "relocate".
  const { from, until } = relocationRange(sess, now);
  return mejaDijual(st).filter((t) => t.id !== sess.tableId && classOf(st, t.id) === kelas &&
    tableFreeForRange(st.sessions, t.id, from, until, sess.id, now));
}

/** Perpanjangan booking online: kelipatan 1 jam, tidak menabrak, tidak melewati jam tutup 02.00. */
export function canExtend(s: Pick<State, "sessions">, id: string, minutes: number, now = clock()) {
  const t = s.sessions.find((x) => x.id === id);
  // Booking online DAN paket per jam sama-sama punya jam selesai, jadi sama-sama bisa diperpanjang.
  if (!t || t.status !== "running" || (t.source !== "online" && !t.blockHours)) return false;
  if (minutes <= 0 || minutes % 60 !== 0) return false;
  // Dibandingkan langsung ke jam tutup 02.00, bukan lewat indeks jam: paket per jam
  // dibuka pada menit berapa pun (mis. 22.37), jadi jam selesainya tidak bulat.
  if (t.endsAt + minutes * 60_000 > closingAfter(t.startsAt)) return false;
  return tableFreeForRange(s.sessions, t.tableId, now, t.endsAt + minutes * 60_000, t.id, now);
}

export function maxWalkinHours(sessions: LiveSession[], tableId: string, now = clock()) {
  const mins = minutesUntilNext(sessions, tableId, now);
  if (mins === Infinity) return 4;
  return Math.max(0, Math.min(4, Math.floor((mins - TURNAROUND_MIN) / 60)));
}

export function canOpenWalkin(
  sessions: LiveSession[], tableId: string, now = clock(), s: Pick<State, "jamBebas"> = {},
) {
  if (!dalamJamBuka(s, hourIdx(now))) return false;
  return tableFreeForRange(sessions, tableId, now, now + 30 * 60_000, undefined, now);
}

export { blockEndOf, TURNAROUND_MIN, nextSessionOn, businessDateOf, bestPromo, findClashes };

/**
 * Isi papan meja SEKARANG, satu sesi per meja: yang sedang main atau rusak lebih
 * dulu, lalu booking/hold yang akan segera datang. Booking yang masih jauh tetap
 * mengunci slotnya di jadwal, tapi tidak membuat meja tampak terisi sekarang.
 */
export function floorByTable(sessions: LiveSession[], now = clock()) {
  const waiting = (x: LiveSession) => x.status === "booked" || x.status === "hold";
  const m = new Map<string, LiveSession>();
  for (const s of sessions) {
    if (!isActive(s)) continue;
    // Booking/hold baru "menempati" papan menjelang jamnya (check-in awal 30 menit +
    // bersih-bersih). Sebelum itu mejanya tetap bisa dijual walk-in sampai batasnya.
    if (waiting(s) && s.startsAt - now > (EARLY_CHECKIN_MIN + TURNAROUND_MIN) * 60_000) continue;
    // Booking yang jadwalnya sudah habis tidak menempati meja lagi (ditangani di Kasir).
    if (waiting(s) && now >= s.endsAt) continue;
    const cur = m.get(s.tableId);
    if (!cur || (waiting(cur) && !waiting(s)) || (waiting(cur) && waiting(s) && s.startsAt < cur.startsAt)) {
      m.set(s.tableId, s);
    }
  }
  return m;
}

/** MDR QRIS berjenjang per transaksi (PRD KK-21): ≤ Rp 500.000 bebas biaya. */
const mdrOf = (amt: number) => (amt <= 500_000 ? 0 : Math.round(amt * 0.003));

/**
 * Rekap SATU hari operasional (batas 02.00).
 * nilai penjualan = diterima di kasir + prabayar online — selalu.
 */
/* ═════════════ REKAP 3 JENIS: BILLIARD · RESTO · BAR ═════════════
   Bentuknya mengikuti struk "KAS KASIR SPL" yang sudah dipakai pemilik tiap
   malam: tiga tabel qty · nama · total, masing-masing bersubtotal, lalu sewa
   meja dipisah tegas dari barang.

   PELAJARAN DARI STRUK 3 OKT 2026: "TOTAL OMZET" di kepala struk itu SEWA MEJA
   SAJA (14.697.000), bukan total semuanya — totalnya 25.797.500 sesudah
   ditambah barang 11.100.500. Dua angka itu dulu sering tertukar saat dibaca,
   jadi di sini namanya dibuat tidak bisa salah baca: `sewaMeja` dan
   `totalSemua`.

   Pengelompokannya dari `station` barangnya, bukan dari kategori menu:
   billiard = rokok & botolan counter, kitchen = resto, bar = minuman. */

export type BarisBarang = { itemId: string; nama: string; qty: number; total: number };

export type RekapTigaJenis = {
  bizDate: string;
  billiard: BarisBarang[];
  resto: BarisBarang[];
  bar: BarisBarang[];
  totalBilliard: number;
  totalResto: number;
  totalBar: number;
  totalBarang: number;
  /** Sewa meja saja — di struk inilah yang tertulis "TOTAL OMZET". */
  sewaMeja: number;
  /** Sewa meja + seluruh barang — di struk: "Total Meja + Barang + Cafe". */
  totalSemua: number;
  /** Potongan promo/diskon hari itu; penyebab `totalBarang` ≠ nilai F&B di rekap uang. */
  diskon: number;
  /** false = hari itu sudah tutup buku dan baris pesanannya sudah dilepas dari
   *  arsip (lihat `compactSession`), jadi yang tersisa cuma angka totalnya.
   *  Layar WAJIB mengatakan ini apa adanya, bukan menampilkan tabel kosong. */
  rincianTersedia: boolean;
  /** Sudah keluar dari dapur/bar tapi tabnya belum ditutup — bagian terakhir struk. */
  belumCheckout: BarisBarang[];
  totalBelumCheckout: number;
  shift: { id: string; nama: string; openedAt: number; closedAt: number | null; sewaMeja: number; barang: number }[];
};

function kumpulkanBarang(ember: Map<string, BarisBarang>, lines: CartLine[]) {
  for (const l of lines) {
    // Nama dari BARIS dulu: barang tambahan pemilik tidak ada di buku menu,
    // dan barang yang sudah dinonaktifkan harus tetap bernama di laporan lama.
    const nama = l.name ?? findItem(l.itemId)?.name;
    if (!nama) continue;
    const b = ember.get(l.itemId) ?? { itemId: l.itemId, nama, qty: 0, total: 0 };
    b.qty += l.qty;
    b.total += lineValue(l);
    ember.set(l.itemId, b);
  }
}

const urutBarang = (m: Map<string, BarisBarang>) =>
  [...m.values()].sort((x, y) => x.nama.localeCompare(y.nama, "id"));
const jumlahBarang = (xs: BarisBarang[]) => xs.reduce((n, x) => n + x.total, 0);

export function rekapTigaJenis(
  a: State, bizDate = businessDateOf(clock()), venue?: Venue,
): RekapTigaJenis {
  const r = recap(a, bizDate, venue);

  const ember: Record<"billiard" | "kitchen" | "bar", Map<string, BarisBarang>> = {
    billiard: new Map(), kitchen: new Map(), bar: new Map(),
  };
  const taruh = (lines: CartLine[]) => {
    for (const l of lines) {
      // Station dari BARIS dulu — alasan yang sama dengan namanya.
      const st = l.station ?? findItem(l.itemId)?.station;
      if (!st) continue;
      kumpulkanBarang(ember[st], [l]);
    }
  };

  // Barisnya diambil dari sesi HIDUP, bukan dari arsip: arsip sengaja melepas
  // rincian pesanan supaya tidak membengkak. Struk harian memang dicetak saat
  // harinya belum tutup buku, jadi ini jalur yang sebenarnya dipakai.
  const rincianTersedia = !r.archived;
  const idDone = new Set(r.done.map((x) => x.id));
  const idTake = new Set(r.takeaway.map((o) => o.id));
  if (rincianTersedia) {
    for (const x of a.sessions) if (idDone.has(x.id)) taruh(x.fnb ?? []);
    for (const o of a.orders) {
      if (!idTake.has(o.id)) continue;
      // Sama persis dengan rekap uang: takeaway yang BELUM dibayar belum jadi
      // penjualan. Kalau dihitung di sini, dua laporan jadi berbeda tanpa sebab.
      if (o.paidOnline + (o.payment?.amount ?? 0) <= 0) continue;
      taruh(o.lines ?? []);
    }
  }

  // Tab yang masih terbuka: barangnya sudah keluar, uangnya belum diakui.
  const buka = new Map<string, BarisBarang>();
  for (const s of a.sessions) {
    if (s.status !== "running" && s.status !== "booked" && s.status !== "hold") continue;
    if (businessDateOf(s.startsAt) !== bizDate) continue;
    if (venue && venueDari(s.tableId) !== venue) continue;
    kumpulkanBarang(buka, s.fnb ?? []);
  }

  const billiard = urutBarang(ember.billiard);
  const resto = urutBarang(ember.kitchen);
  const bar = urutBarang(ember.bar);
  const totalBilliard = jumlahBarang(billiard);
  const totalResto = jumlahBarang(resto);
  const totalBar = jumlahBarang(bar);
  const totalBarang = totalBilliard + totalResto + totalBar;
  const belumCheckout = urutBarang(buka);

  // Sewa meja per shift: ditentukan dari KAPAN TAB DITUTUP, karena uangnya
  // masuk laci shift yang sedang jaga saat itu — bukan shift yang membukanya.
  const semuaShift = shiftHariItu(a, bizDate, venue);
  const shift = semuaShift.map((sh) => {
    const habis = sh.closedAt ?? Infinity;
    const punya = r.done.filter((x) => {
      const t = x.settledAt ?? x.endsAt;
      return t >= sh.openedAt && t < habis;
    });
    const emberShift = new Map<string, BarisBarang>();
    if (rincianTersedia) {
      const ids = new Set(punya.map((x) => x.id));
      for (const x of a.sessions) if (ids.has(x.id)) kumpulkanBarang(emberShift, x.fnb ?? []);
    }
    return {
      id: sh.id,
      nama: sh.nama,
      openedAt: sh.openedAt,
      closedAt: sh.closedAt ?? null,
      sewaMeja: punya.reduce((n, x) => n + (x.settledBilliard ?? 0), 0),
      barang: jumlahBarang([...emberShift.values()]),
    };
  });

  return {
    bizDate,
    billiard, resto, bar,
    totalBilliard, totalResto, totalBar, totalBarang,
    sewaMeja: r.billiard,
    totalSemua: r.billiard + totalBarang,
    diskon: r.discount,
    rincianTersedia,
    belumCheckout,
    totalBelumCheckout: jumlahBarang(belumCheckout),
    shift,
  };
}

/** Venue sebuah pesanan. Tanpa penanda & tanpa meja = SPL (jejak lama). */
export const venueOrder = (o: Pick<GuestOrder, "venue" | "tableId">): Venue =>
  o.venue ?? (o.tableId ? venueDari(o.tableId) : "spl");

/**
 * Rekap satu hari. `venue` kosong = GABUNGAN kedua venue.
 *
 * Keputusan pemilik 8 Okt 2026: rekap SPL dan Smokehouse harus TERPISAH, jadi
 * layar WAJIB mengoper venue yang sedang dibuka. Gabungan hanya disediakan
 * sebagai pilihan tambahan untuk pemilik, bukan bawaan.
 */
export function recap(a: State, bizDate = businessDateOf(clock()), venue?: Venue) {
  // Hari yang sudah tutup buku memakai angka yang dibekukan saat diarsipkan.
  const arch = a.history.find((h) => h.bizDate === bizDate);
  // PRD KK-19: hari operasional ditentukan dari JAM MULAI (batas 02.00). Tab yang
  // dibuka 20.00 dan ditutup 02.10 tetap omzet malam itu, bukan hari berikutnya.
  // Saringan venue. Tanpa `venue` = gabungan; dengan venue, SEMUA angka di
  // bawah ikut tersaring — uang, hitungan, dan jumlah meja sekaligus. Kalau
  // sebagian saja yang disaring, laporannya jadi campuran yang tidak ada
  // artinya dan itu lebih berbahaya daripada tidak disaring sama sekali.
  const diVenue = (tableId?: string) => !venue || (!!tableId && venueDari(tableId) === venue);
  const semua: ArchivedSession[] = arch
    ? arch.sessions
    : a.sessions.filter((s) => (s.status === "done" || s.status === "noshow") && businessDateOf(s.startsAt) === bizDate);
  const closed = venue ? semua.filter((s) => diVenue(s.tableId)) : semua;
  const semuaTa: ArchivedOrder[] = (arch ? arch.orders : a.orders)
    .filter((o) => o.status === "diterima" && !o.sessionId && businessDateOf(o.at) === bizDate);
  const takeaway = venue ? semuaTa.filter((o) => venueOrder(o) === venue) : semuaTa;
  // Hari yang sudah tutup buku memakai angka beku, dan angka itu GABUNGAN.
  // Menyaringnya mustahil tanpa menghitung ulang dari baris yang sudah
  // dilepas, jadi penandanya dikembalikan apa adanya lewat `venueTercampur`.
  const money = arch ? arch.money : dayMoney(closed, takeaway, a.orders, a);
  const counts = arch ? arch.counts : dayCounts(closed, takeaway);

  const perTable = floorByTable(a.sessions, clock());
  const vals = [...perTable.values()].filter((s) => diVenue(s.tableId));
  const mejaVenue = venue ? mejaDijual(a).filter((t) => t.venue === venue) : mejaDijual(a);
  const terpakai = [...perTable.keys()].filter((id) => diVenue(id)).length;

  return {
    bizDate, archived: !!arch, rowsAvailable: !arch?.rowsDropped, done: closed, takeaway, counts, ...money,
    venue,
    /** true = angka ini GABUNGAN dua venue walau venue diminta (hari beku). */
    venueTercampur: !!venue && !!arch,
    cashExpected: shiftCashExpected(a),
    noShow: counts.noShow,
    running: vals.filter((s) => s.status === "running").length,
    booked: vals.filter((s) => s.status === "booked" || s.status === "hold").length,
    holds: a.sessions.filter((s) => s.status === "hold").length,
    maint: vals.filter((s) => s.status === "maintenance").length,
    free: mejaVenue.length - terpakai,
    lampuNyala: Object.entries(a.lights).filter(([id, on]) => on && diVenue(id)).length,
    voidMenunggu: a.voids.filter((v) => v.status === "menunggu").length,
    stokMenipis: a.stock.filter((r) => r.qty !== null && r.qty <= r.lowAt).length,
    refundTotal: a.refunds.reduce((n, r) => n + r.amount, 0),
    refundOutstanding: a.refunds.filter((r) => !r.settledAt).reduce((n, r) => n + r.amount, 0),
    refundOpen: a.refunds.filter((r) => !r.settledAt).length,
  };
}

/** Hitungan operasional satu hari: tab ditutup, no-show, takeaway, dan jam main nyata. */
function dayCounts(closed: ArchivedSession[], takeaway: ArchivedOrder[]): DayCounts {
  const played = closed.filter((s) => s.status === "done")
    .reduce((n, s) => n + Math.max(0, ((s.settledAt ?? s.endsAt) - s.startsAt) / 3_600_000), 0);
  return {
    done: closed.filter((s) => s.status === "done").length,
    noShow: closed.filter((s) => s.status === "noshow").length,
    takeaway: takeaway.length,
    takeawayValue: takeaway.reduce((n, o) => n + o.value, 0),
    // Dibulatkan per menit supaya angka arsip stabil saat dijumlah dan diputar ulang.
    playedHours: Math.round(played * 60) / 60,
  };
}

/** Angka uang satu hari: nilai penjualan = diterima di kasir + prabayar online — selalu. */
function dayMoney(
  closed: ArchivedSession[], takeaway: ArchivedOrder[], orders: ArchivedOrder[],
  pjk: Pick<State, "pajak" | "pajakLini">,
): DayMoney {
  const pajak = pjk.pajak;
  /**
   * Dasar pajak DIKUMPULKAN PER LINI, bukan satu angka untuk semua.
   *
   * Ember `lama` untuk transaksi yang tidak punya pecahan lini: arsip
   * sebelum 18 Okt 2026, dan takeaway lampau yang barisnya sudah dilepas.
   * Transaksi itu memakai pajak venue tunggal persis seperti dulu — angkanya
   * tidak boleh bergeser hanya karena kolom barunya ditambahkan.
   */
  const dasar: Record<Lini | "lama", number> = { biliar: 0, bar: 0, resto: 0, lama: 0 };
  let billiard = 0, fnb = 0, discount = 0, gross = 0, diterima = 0, prabayar = 0;
  let compliment = 0, diskonManual = 0;
  const byChannel: Record<string, { n: number; gross: number }> = {};
  const addPrabayar = (amt: number) => {
    prabayar += amt;
    byChannel.prabayar = { n: (byChannel.prabayar?.n ?? 0) + 1, gross: (byChannel.prabayar?.gross ?? 0) + amt };
  };
  for (const s of closed) {
    const b = s.settledBilliard ?? 0, f = s.settledFnb ?? 0, d = s.settledDiscount ?? 0;
    billiard += b; fnb += f; discount += d; gross += b + f - d;
    taruhLini(dasar, s.settledLini, b + f, d);
    // Dua angka di bawah SENGAJA di luar rumus omzet (lihat `DayMoney`).
    compliment += s.settledCompliment ?? 0;
    diskonManual += s.settledDiskonManual ?? 0;
    const amt = s.settledAmount ?? 0;
    diterima += amt;
    if (amt > 0 && s.settledChannel) {
      byChannel[s.settledChannel] = { n: (byChannel[s.settledChannel]?.n ?? 0) + 1, gross: (byChannel[s.settledChannel]?.gross ?? 0) + amt };
    }
    // Split bill: setiap pembayaran sebagian adalah uang yang benar-benar diterima kasir.
    for (const p of s.payments ?? []) {
      if (p.amount <= 0) continue;
      diterima += p.amount;
      byChannel[p.channel] = { n: (byChannel[p.channel]?.n ?? 0) + 1, gross: (byChannel[p.channel]?.gross ?? 0) + p.amount };
    }
    if (s.paidOnline > 0) addPrabayar(s.paidOnline);
  }
  for (const o of takeaway) {
    // Takeaway yang belum dibayar BELUM jadi penjualan — dapur sudah menyiapkan,
    // tapi uangnya baru diakui saat tamu mengambil & membayar di kasir.
    const dibayar = o.paidOnline + (o.payment?.amount ?? 0);
    if (dibayar <= 0) continue;
    fnb += o.value; gross += o.value;
    // Pesanan yang masih hidup punya barisnya; yang sudah diarsipkan
    // membawa pecahan yang dibekukan saat tutup buku.
    const pecah = o.lini ?? ((o as { lines?: CartLine[] }).lines
      ? liniDariLines((o as { lines?: CartLine[] }).lines!) : undefined);
    taruhLini(dasar, pecah, o.value, 0);
    if (o.paidOnline > 0) addPrabayar(o.paidOnline);
    if (o.payment && o.payment.amount > 0) {
      diterima += o.payment.amount;
      const c = o.payment.channel;
      byChannel[c] = { n: (byChannel[c]?.n ?? 0) + 1, gross: (byChannel[c]?.gross ?? 0) + o.payment.amount };
    }
  }

  /**
   * Harga SUDAH TERMASUK pajak & service, jadi `gross` tidak pernah berubah —
   * yang dilakukan di sini cuma memecahnya. Sekarang dipecah PER LINI, karena
   * tiap lini boleh punya persen sendiri (permintaan pemilik 18 Okt 2026).
   *
   * Dihitung per ember lalu dijumlah, bukan sekali untuk seluruh omzet:
   * dengan begitu dpp + tax + service tetap TEPAT sama dengan gross — tiap
   * ember menyisakan nol rupiah, jadi jumlahnya juga nol.
   */
  const perLini = {} as Record<Lini, { gross: number; dpp: number; tax: number; service: number }>;
  let dpp = 0, tax = 0, service = 0;
  for (const k of [...LINI, "lama"] as (Lini | "lama")[]) {
    const g = dasar[k];
    const p = k === "lama" ? pajak : persenLini(pjk, k);
    const bagi = 1 + (p.ppn + p.service) / 100;
    const dppK = Math.round(g / bagi);
    // Sisanya dibagi, bukan dihitung ulang: tidak ada rupiah hilang di
    // pembulatan, dan kalau service 0% angkanya benar-benar 0.
    const sisaK = g - dppK;
    const totalPersen = p.ppn + p.service;
    const serviceK = p.service > 0 && totalPersen > 0
      ? Math.round(sisaK * (p.service / totalPersen)) : 0;
    const taxK = sisaK - serviceK;
    dpp += dppK; tax += taxK; service += serviceK;
    if (k !== "lama") perLini[k] = { gross: g, dpp: dppK, tax: taxK, service: serviceK };
    else if (g > 0) {
      // Transaksi tanpa pecahan lini dilaporkan di lini yang paling mungkin
      // jadi asalnya — meja biliar — supaya jumlah per lini tetap = omzet.
      perLini.biliar = {
        gross: perLini.biliar.gross + g, dpp: perLini.biliar.dpp + dppK,
        tax: perLini.biliar.tax + taxK, service: perLini.biliar.service + serviceK,
      };
    }
  }
  // MDR dihitung PER PEMBAYARAN: booking, pesanan QR yang menempel, dan takeaway
  // masing-masing transaksi QRIS sendiri.
  const attached = (sid: string) => orders.filter((o) => o.sessionId === sid && o.status === "diterima" && o.paidOnline > 0);
  const mdr = closed.reduce((n, s) => {
    const parts = attached(s.id);
    const own = s.paidOnline - parts.reduce((m, o) => m + o.paidOnline, 0);
    return n + (s.settledChannel === "qris_online" ? mdrOf(s.settledAmount ?? 0) : 0)
      + (s.payments ?? []).reduce((m, p) => m + (p.channel === "qris_online" ? mdrOf(p.amount) : 0), 0)
      + (own > 0 ? mdrOf(own) : 0) + parts.reduce((m, o) => m + mdrOf(o.paidOnline), 0);
  }, 0) + takeaway.reduce((n, o) => n + mdrOf(o.paidOnline)
    + (o.payment?.channel === "qris_online" ? mdrOf(o.payment.amount) : 0), 0);

  return {
    billiard, fnb, discount, gross, diterima, prabayar, byChannel,
    dpp, tax, service, mdr, net: gross - mdr, compliment, diskonManual,
    perLini,
  };
}


/* ═════════════ SMH-14 · Omzet per shift (pagi/sore/ALL) ═════════════ */

/**
 * Daftar shift sebuah hari operasional, SUDAH BERNAMA.
 *
 * Dipakai bersama oleh rekap tiga jenis dan omzet per shift. Kalau tiap
 * laporan menamainya sendiri, "Shift Pagi" di satu laporan bisa berarti
 * shift yang lain di laporan sebelahnya — dan tidak ada yang akan sadar.
 */
export function shiftHariItu(
  a: Pick<State, "shift" | "shiftHistory">, bizDate: string, venue?: Venue,
): (Shift & { nama: string })[] {
  const semua = [...(a.shift ? [a.shift] : []), ...a.shiftHistory]
    .filter((sh) => businessDateOf(sh.openedAt) === bizDate)
    // Shift lama tanpa penanda dianggap SPL — semua jejak lama memang SPL.
    .filter((sh) => !venue || (sh.venue ?? "spl") === venue)
    .sort((x, y) => x.openedAt - y.openedAt);
  return semua.map((sh, i) => ({
    ...sh,
    nama: semua.length === 2 ? (i === 0 ? "Shift Pagi" : "Shift Sore") : `Shift ${i + 1}`,
  }));
}

export type BarisOmzetShift = {
  id: string;
  nama: string;
  openedAt: number | null;
  closedAt: number | null;
  /** Uang yang BENAR-BENAR diterima di shift ini. */
  tunai: number;
  qris: number;
  edc: number;
  /** Prabayar online: uangnya masuk sebelum tamu datang, jadi TIDAK di laci. */
  prabayar: number;
  /** Pecahan EDC per mesin (Mandiri, BRI, …). Jumlahnya = `edc`. */
  edcPer: Record<string, number>;
  /** tunai + qris + edc (tanpa prabayar — itu bukan uang shift ini). */
  diterima: number;
  /** Banyaknya pembayaran, bukan banyaknya tab. */
  trx: number;
  sewaMeja: number;
  barang: number;
  diskon: number;
  compliment: number;
};

/**
 * Satu baris di "DETAIL TRANSAKSI" — satu PEMBAYARAN, bukan satu tab.
 *
 * Bentuknya mengikuti laporan yang sudah dicetak pemilik tiap malam (foto 12
 * Okt 2026): jam · no. transaksi · no. meja · keterangan · kolom per kanal.
 * Satu tab yang dibayar dua orang muncul dua baris — memang begitu laporan
 * kasnya harus dibaca, karena yang dicocokkan adalah uang yang masuk, bukan
 * banyaknya meja.
 */
export type BarisTransaksi = {
  /** Shift tempat uangnya diterima; sama dengan `BarisOmzetShift.id`. */
  shiftId: string;
  at: number;
  kode: string;
  meja: string;
  keterangan: string;
  kanal: PayChannel;
  jumlah: number;
  /** Mesin EDC yang dipakai, kalau kanalnya EDC. */
  mesin?: string;
  /** true = prabayar online: uangnya TIDAK pernah lewat laci kasir. */
  prabayar?: boolean;
};

export type OmzetShift = {
  bizDate: string;
  venue?: Venue;
  shift: BarisOmzetShift[];
  /** Baris ALL — penjumlahan semua shift, TERMASUK yang tanpa shift. */
  semua: BarisOmzetShift;
  /**
   * Uang yang tidak bisa ditempelkan ke shift mana pun: jejak lama sebelum
   * penanda shift ada, atau pembayaran di luar jam shift. Ditampilkan apa
   * adanya — kalau disembunyikan, jumlah per shift tidak akan sama dengan
   * rekap harian dan tidak ada yang tahu kenapa.
   */
  tanpaShift: BarisOmzetShift | null;
  /** Rincian per pembayaran, terurut waktu — untuk laporan "Detail Transaksi". */
  rincian: BarisTransaksi[];
};

const TANPA_SHIFT = "tanpa-shift";

const barisOmzet = (id: string, nama: string, openedAt: number | null, closedAt: number | null): BarisOmzetShift => ({
  id, nama, openedAt, closedAt,
  tunai: 0, qris: 0, edc: 0, edcPer: {}, prabayar: 0, diterima: 0, trx: 0,
  sewaMeja: 0, barang: 0, diskon: 0, compliment: 0,
});

export function omzetPerShift(
  a: State, bizDate = businessDateOf(clock()), venue?: Venue,
): OmzetShift {
  const r = recap(a, bizDate, venue);
  const shifts = shiftHariItu(a, bizDate, venue);
  const baris = new Map<string, BarisOmzetShift>(
    shifts.map((sh) => [sh.id, barisOmzet(sh.id, sh.nama, sh.openedAt, sh.closedAt ?? null)]),
  );
  let tanpa: BarisOmzetShift | null = null;
  const rincian: BarisTransaksi[] = [];
  const ambil = (id: string): BarisOmzetShift => {
    if (id !== TANPA_SHIFT) return baris.get(id)!;
    if (!tanpa) tanpa = barisOmzet(TANPA_SHIFT, "Tanpa shift", null, null);
    return tanpa;
  };

  /**
   * Shift tempat satu pembayaran terjadi. Penanda shift yang DICATAT saat
   * pembayaran selalu dipakai lebih dulu; jamnya hanya jalur jatuh untuk
   * jejak lama yang belum punya penanda. Keduanya gagal = tanpa shift,
   * bukan dibuang dan bukan dipaksa masuk shift pertama.
   */
  const cari = (shiftId: string | undefined, at: number | undefined): string => {
    if (shiftId && baris.has(shiftId)) return shiftId;
    if (at !== undefined) {
      const f = shifts.find((sh) => at >= sh.openedAt && at < (sh.closedAt ?? Infinity));
      if (f) return f.id;
    }
    return TANPA_SHIFT;
  };

  const terima = (
    id: string, kanal: PayChannel, jumlah: number, baris: Omit<BarisTransaksi, "shiftId" | "kanal" | "jumlah">,
  ) => {
    const b = ambil(id);
    if (kanal === "cash") b.tunai += jumlah;
    else if (kanal === "edc") {
      b.edc += jumlah;
      // Mesin lama tanpa penanda dikumpulkan sendiri, BUKAN dibagi rata ke
      // mesin yang ada — setoran bank hanya bisa dicocokkan dengan angka yang
      // benar-benar tercatat atas namanya.
      const m = baris.mesin ?? "Tanpa mesin";
      b.edcPer[m] = (b.edcPer[m] ?? 0) + jumlah;
    }
    else b.qris += jumlah;
    b.diterima += jumlah;
    b.trx += 1;
    rincian.push({ ...baris, shiftId: id, kanal, jumlah });
  };

  for (const s of r.done) {
    const tutup = cari(s.settledShiftId, s.settledAt ?? s.endsAt);
    const kode = s.bookingCode ?? s.id.slice(-8).toUpperCase();
    const meja = namaMeja(a, s.tableId);
    const amt = s.settledAmount ?? 0;
    if (amt > 0 && s.settledChannel) {
      terima(tutup, s.settledChannel, amt, {
        at: s.settledAt ?? s.endsAt, kode, meja, keterangan: s.guest,
        ...(s.settledMesin ? { mesin: s.settledMesin } : {}),
      });
    }
    for (const p of s.payments ?? []) {
      if (p.amount > 0) {
        terima(cari(p.shiftId, p.at), p.channel, p.amount, {
          at: p.at, kode, meja, keterangan: p.label ? `${s.guest} · ${p.label}` : s.guest,
          ...(p.mesin ? { mesin: p.mesin } : {}),
        });
      }
    }
    const b = ambil(tutup);
    if (s.paidOnline > 0) {
      b.prabayar += s.paidOnline;
      rincian.push({
        shiftId: tutup, at: s.settledAt ?? s.endsAt, kode, meja,
        keterangan: s.guest, kanal: "qris_online", jumlah: s.paidOnline, prabayar: true,
      });
    }
    // Lini usaha & potongan mengikuti shift PENUTUP tab: itu saat uangnya
    // diakui, dan itu juga shift yang akan dimintai pertanggungjawaban.
    b.sewaMeja += s.settledBilliard ?? 0;
    b.barang += s.settledFnb ?? 0;
    b.diskon += s.settledDiscount ?? 0;
    b.compliment += s.settledCompliment ?? 0;
  }

  for (const o of r.takeaway) {
    // Sama dengan rekap uang: takeaway yang belum dibayar belum jadi penjualan.
    const dibayar = o.paidOnline + (o.payment?.amount ?? 0);
    if (dibayar <= 0) continue;
    const id = o.payment ? cari(o.payment.shiftId, o.payment.at) : cari(undefined, o.at);
    const b = ambil(id);
    const meja = o.tableId ? namaMeja(a, o.tableId) : "Takeaway";
    if (o.paidOnline > 0) {
      b.prabayar += o.paidOnline;
      rincian.push({
        shiftId: id, at: o.at, kode: o.code, meja, keterangan: o.guest,
        kanal: "qris_online", jumlah: o.paidOnline, prabayar: true,
      });
    }
    if (o.payment && o.payment.amount > 0) {
      terima(id, o.payment.channel, o.payment.amount, {
        at: o.payment.at, kode: o.code, meja, keterangan: o.guest,
        ...(o.payment.mesin ? { mesin: o.payment.mesin } : {}),
      });
    }
    b.barang += o.value;
  }

  const daftar = [...baris.values()];
  const semua = barisOmzet("all", "Semua shift", null, null);
  for (const b of [...daftar, ...(tanpa ? [tanpa as BarisOmzetShift] : [])]) {
    semua.tunai += b.tunai; semua.qris += b.qris; semua.edc += b.edc;
    for (const [m, v] of Object.entries(b.edcPer)) semua.edcPer[m] = (semua.edcPer[m] ?? 0) + v;
    semua.prabayar += b.prabayar; semua.diterima += b.diterima; semua.trx += b.trx;
    semua.sewaMeja += b.sewaMeja; semua.barang += b.barang;
    semua.diskon += b.diskon; semua.compliment += b.compliment;
  }

  rincian.sort((x, y) => x.at - y.at || (x.kode < y.kode ? -1 : 1));
  return { bizDate, venue, shift: daftar, semua, tanpaShift: tanpa, rincian };
}

/* ═════════════ SPL-11 · Laporan penjualan per produk ═════════════ */

/** Kanal uang untuk laporan produk. `lain` = tidak bisa ditentukan dari jejak. */
export type KanalProduk = "tunai" | "qris" | "edc" | "prabayar" | "lain";

export type ProdukHariBaris = {
  itemId: string;
  nama: string;
  station: "kitchen" | "bar" | "billiard";
  venue: Venue;
  qty: number;
  /** Uang yang masuk dari barang ini (sudah termasuk pecahan per kanal). */
  total: number;
  /** Nilai yang DIGRATISKAN (compliment) — tidak ikut `total`. */
  comp: number;
  tunai: number;
  qris: number;
  edc: number;
  prabayar: number;
  lain: number;
};

const barisProduk = (
  itemId: string, nama: string, station: ProdukHariBaris["station"], venue: Venue,
): ProdukHariBaris => ({
  itemId, nama, station, venue, qty: 0, total: 0, comp: 0,
  tunai: 0, qris: 0, edc: 0, prabayar: 0, lain: 0,
});

const kunciProduk = (itemId: string, venue: Venue) => `${venue}|${itemId}`;

/** Gabungkan dua daftar baris produk (dipakai saat satu hari diarsipkan dua kali). */
export function gabungProduk(a: ProdukHariBaris[], b: ProdukHariBaris[]): ProdukHariBaris[] {
  const peta = new Map<string, ProdukHariBaris>();
  for (const x of [...a, ...b]) {
    const k = kunciProduk(x.itemId, x.venue);
    const p = peta.get(k) ?? barisProduk(x.itemId, x.nama, x.station, x.venue);
    p.qty += x.qty; p.total += x.total; p.comp += x.comp;
    p.tunai += x.tunai; p.qris += x.qris; p.edc += x.edc;
    p.prabayar += x.prabayar; p.lain += x.lain;
    peta.set(k, p);
  }
  return [...peta.values()];
}

/**
 * Kanal yang membayar SATU BARIS pesanan.
 *
 * Diambil setepat mungkin dari jejak, bukan dibagi rata: baris prabayar sudah
 * dibayar online, baris yang dilunasi lewat split bill menyimpan kunci
 * barisnya di pembayaran itu, dan sisanya dibayar dengan kanal penutup tab.
 * Yang benar-benar tidak bisa ditentukan masuk `lain` — JANGAN dipaksa masuk
 * tunai, karena laporan tunai adalah laporan yang paling dipercaya pemilik.
 */
function kanalBaris(s: ArchivedSession, l: CartLine): KanalProduk {
  if (l.prepaid) return "prabayar";
  for (const p of s.payments ?? []) {
    if (p.keys?.includes(l.key)) {
      return p.channel === "cash" ? "tunai" : p.channel === "edc" ? "edc" : "qris";
    }
  }
  if ((s.settledAmount ?? 0) > 0 && s.settledChannel) {
    return s.settledChannel === "cash" ? "tunai" : s.settledChannel === "edc" ? "edc" : "qris";
  }
  return "lain";
}

/**
 * Penjualan per produk untuk SATU hari operasional, dihitung dari baris
 * pesanan yang masih hidup. Dipakai dua kali: oleh laporan hari yang belum
 * tutup buku, dan oleh tutup buku untuk MEMBEKUKAN angkanya. Satu rumus,
 * jadi angka beku tidak mungkin berbeda dari angka hidupnya.
 */
export function produkHari(
  st: State, sesi: ArchivedSession[], takeaway: ArchivedOrder[],
): ProdukHariBaris[] {
  const peta = new Map<string, ProdukHariBaris>();
  const taruh = (
    venue: Venue, lines: CartLine[], kanal: (l: CartLine) => KanalProduk,
  ) => {
    for (const l of lines) {
      const nama = l.name ?? itemOf(st, l.itemId)?.name;
      const station = l.station ?? itemOf(st, l.itemId)?.station;
      if (!nama || !station) continue;
      const k = kunciProduk(l.itemId, venue);
      const b = peta.get(k) ?? barisProduk(l.itemId, nama, station, venue);
      const nilai = lineValue(l);
      b.qty += l.qty;
      b.total += nilai;
      b.comp += l.comp ?? 0;
      if (nilai > 0) b[kanal(l)] += nilai;
      peta.set(k, b);
    }
  };

  const hidup = new Map(st.sessions.map((x) => [x.id, x] as const));
  for (const s of sesi) {
    const penuh = hidup.get(s.id);
    if (!penuh) continue;        // rincian barisnya sudah dilepas arsip
    taruh(venueDari(s.tableId), penuh.fnb ?? [], (l) => kanalBaris(s, l));
  }
  const pesanan = new Map(st.orders.map((o) => [o.id, o] as const));
  for (const o of takeaway) {
    const dibayar = o.paidOnline + (o.payment?.amount ?? 0);
    if (dibayar <= 0) continue;
    const penuh = pesanan.get(o.id);
    if (!penuh) continue;
    const kanal: KanalProduk = o.paidOnline >= o.value
      ? "prabayar"
      : o.payment
        ? (o.payment.channel === "cash" ? "tunai" : o.payment.channel === "edc" ? "edc" : "qris")
        : "lain";
    taruh(venueOrder(o), penuh.lines ?? [], () => kanal);
  }
  return [...peta.values()];
}

export type LaporanProduk = {
  dari: string;
  sampai: string;
  venue?: Venue;
  baris: ProdukHariBaris[];
  qty: number;
  total: number;
  comp: number;
  perKanal: Record<KanalProduk, number>;
  /**
   * Hari dalam rentang yang rincian produknya TIDAK ADA (tutup buku sebelum
   * fitur ini ada, atau barisnya sudah dilepas). Layar WAJIB menyebutkannya —
   * laporan yang diam-diam kurang hari lebih berbahaya daripada laporan kosong.
   */
  hariTanpaRincian: string[];
};

export function penjualanProduk(
  a: State, dari: string, sampai: string, venue?: Venue,
): LaporanProduk {
  let kumpul: ProdukHariBaris[] = [];
  const hariTanpaRincian: string[] = [];
  let d = dari;
  for (let i = 0; d <= sampai && i < MAX_REKAP_HARI; i++, d = shiftDate(d, 1)) {
    const arch = a.history.find((h) => h.bizDate === d);
    if (arch) {
      if (arch.produk) kumpul = gabungProduk(kumpul, arch.produk);
      else hariTanpaRincian.push(d);
      continue;
    }
    const r = recap(a, d);
    kumpul = gabungProduk(kumpul, produkHari(a, r.done, r.takeaway));
  }

  const baris = kumpul
    .filter((b) => !venue || b.venue === venue)
    .sort((x, y) => y.total - x.total || x.nama.localeCompare(y.nama, "id"));
  const perKanal: Record<KanalProduk, number> = { tunai: 0, qris: 0, edc: 0, prabayar: 0, lain: 0 };
  for (const b of baris) {
    perKanal.tunai += b.tunai; perKanal.qris += b.qris; perKanal.edc += b.edc;
    perKanal.prabayar += b.prabayar; perKanal.lain += b.lain;
  }
  return {
    dari, sampai, venue, baris,
    qty: baris.reduce((n, b) => n + b.qty, 0),
    total: baris.reduce((n, b) => n + b.total, 0),
    comp: baris.reduce((n, b) => n + b.comp, 0),
    perKanal, hariTanpaRincian,
  };
}

/* ═════════════ Rekap per periode (harian · mingguan · bulanan) ═════════════
   Angka satu hari SELALU dihitung `recap()`; periode hanya menjumlahkannya.
   Dengan begitu rekap mingguan/bulanan tidak mungkin berbeda dari jumlah
   rekap hariannya — termasuk untuk hari yang sudah tutup buku. */

export type RekapPeriode = "hari" | "minggu" | "bulan" | "custom";

/**
 * Rentang hari operasional sebuah periode yang memuat `bizDate`. Minggu = Senin–Minggu.
 * Untuk `custom` rentangnya ditentukan pengguna sendiri lewat `clampRange`, jadi di sini
 * hanya dikembalikan satu hari sebagai nilai awal yang aman.
 */
export function periodeRange(bizDate: string, p: RekapPeriode): { dari: string; sampai: string } {
  if (p === "hari" || p === "custom") return { dari: bizDate, sampai: bizDate };
  const [y, m, d] = bizDate.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (p === "bulan") {
    const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { dari: `${y}-${pad(m)}-01`, sampai: `${y}-${pad(m)}-${pad(akhir)}` };
  }
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();   // 0 = Minggu
  const dari = shiftDate(bizDate, -(dow === 0 ? 6 : dow - 1));
  return { dari, sampai: shiftDate(dari, 6) };
}

export type RekapPeriodeHasil = {
  dari: string; sampai: string;
  money: DayMoney;
  counts: DayCounts;
  /** Rincian per hari (untuk grafik & tabel), terlama dulu. */
  hari: { bizDate: string; money: DayMoney; counts: DayCounts }[];
  /** Hari dengan omzet tertinggi dalam periode ini. */
  terbaik: { bizDate: string; gross: number } | null;
};

/** Batas aman supaya rekap tahunan tidak membekukan layar. */
export const MAX_REKAP_HARI = 92;

/**
 * Rapikan rentang tanggal pilihan pemilik (mode custom): urutannya dibalik kalau
 * tanggal akhir lebih awal, dan panjangnya dipotong di MAX_REKAP_HARI hari supaya
 * tidak ada yang tidak sengaja meminta rekap dua tahun lalu menggantung layarnya.
 */
export function clampRange(dari: string, sampai: string): { dari: string; sampai: string; dipotong: boolean } {
  const a0 = dari <= sampai ? dari : sampai;
  const b0 = dari <= sampai ? sampai : dari;
  const maks = shiftDate(a0, MAX_REKAP_HARI - 1);
  return b0 > maks ? { dari: a0, sampai: maks, dipotong: true } : { dari: a0, sampai: b0, dipotong: false };
}

/** Jumlah hari dalam sebuah rentang (inklusif). */
export function rangeDays(dari: string, sampai: string): number {
  let n = 0;
  for (let d = dari; d <= sampai && n <= MAX_REKAP_HARI; d = shiftDate(d, 1)) n++;
  return n;
}

/**
 * Rekap beberapa hari. `venue` kosong = GABUNGAN, sama seperti `recap`.
 *
 * Sampai 12 Okt 2026 fungsi ini TIDAK menerima venue sama sekali, padahal
 * layar Rekap punya tombol lingkup venue. Akibatnya: pilih "Smokehouse", lalu
 * pilih "Minggu ini" — angkanya tetap angka dua venue, tanpa satu pun tanda
 * bahwa lingkupnya diabaikan. Hanya "Hari" yang benar.
 */
export function recapRange(a: State, dari: string, sampai: string, venue?: Venue): RekapPeriodeHasil {
  const money: DayMoney = {
    billiard: 0, fnb: 0, discount: 0, gross: 0, diterima: 0, prabayar: 0,
    byChannel: {}, dpp: 0, tax: 0, service: 0, mdr: 0, net: 0,
    compliment: 0, diskonManual: 0,
  };
  const counts: DayCounts = { done: 0, noShow: 0, takeaway: 0, takeawayValue: 0, playedHours: 0 };
  const hari: RekapPeriodeHasil["hari"] = [];
  let terbaik: RekapPeriodeHasil["terbaik"] = null;

  let d = dari;
  for (let i = 0; d <= sampai && i < MAX_REKAP_HARI; i++, d = shiftDate(d, 1)) {
    const r = recap(a, d, venue);
    const m: DayMoney = {
      billiard: r.billiard, fnb: r.fnb, discount: r.discount, gross: r.gross, diterima: r.diterima,
      prabayar: r.prabayar, byChannel: r.byChannel, dpp: r.dpp, tax: r.tax, service: r.service ?? 0,
      mdr: r.mdr, net: r.net, compliment: r.compliment ?? 0, diskonManual: r.diskonManual ?? 0,
    };
    hari.push({ bizDate: d, money: m, counts: r.counts });
    money.billiard += m.billiard; money.fnb += m.fnb; money.discount += m.discount;
    money.gross += m.gross; money.diterima += m.diterima; money.prabayar += m.prabayar;
    money.dpp += m.dpp; money.tax += m.tax; money.mdr += m.mdr; money.net += m.net;
    money.service = (money.service ?? 0) + (m.service ?? 0);
    money.compliment = (money.compliment ?? 0) + (m.compliment ?? 0);
    money.diskonManual = (money.diskonManual ?? 0) + (m.diskonManual ?? 0);
    for (const [k, v] of Object.entries(m.byChannel)) {
      money.byChannel[k] = { n: (money.byChannel[k]?.n ?? 0) + v.n, gross: (money.byChannel[k]?.gross ?? 0) + v.gross };
    }
    counts.done += r.counts.done; counts.noShow += r.counts.noShow;
    counts.takeaway += r.counts.takeaway; counts.takeawayValue += r.counts.takeawayValue;
    counts.playedHours += r.counts.playedHours;
    if (m.gross > 0 && (!terbaik || m.gross > terbaik.gross)) terbaik = { bizDate: d, gross: m.gross };
  }
  // Pajak dijumlah dari pembulatan harian; rapikan supaya DPP + pajak + service
  // = omzet periode. Service WAJIB ikut dikurangkan: tanpa itu ia terhitung
  // dua kali — sekali sebagai service, sekali lagi di dalam DPP.
  money.dpp = money.gross - money.tax - (money.service ?? 0);
  counts.playedHours = Math.round(counts.playedHours * 60) / 60;
  return { dari, sampai, money, counts, hari, terbaik };
}

/** Hari operasional yang punya transaksi (terbaru dulu) — untuk memilih tanggal rekap. */
export function recapDates(a: State, now = clock()): string[] {
  const days = new Set<string>([businessDateOf(now)]);
  for (const h of a.history) days.add(h.bizDate);
  for (const s of a.sessions) if (s.status === "done" || s.status === "noshow") days.add(businessDateOf(s.startsAt));
  for (const o of a.orders) if (o.status === "diterima" && !o.sessionId) days.add(businessDateOf(o.at));
  return [...days].sort().reverse();
}

/** Refund yang sudah dikembalikan, termasuk yang sudah tutup buku (terbaru dulu). */
export const settledRefundsOf = (a: Pick<State, "refunds" | "history">) =>
  [...a.refunds.filter((r) => r.settledAt), ...a.history.flatMap((h) => h.refunds)]
    .sort((p, q) => (q.settledAt ?? 0) - (p.settledAt ?? 0));

/* ═══════════════════════════════════════════════════════════════════
   SINKRONISASI — jejak kejadian (event log)

   Yang disimpan dan dibagikan antar layar BUKAN state, melainkan daftar
   niat yang sudah dikirim: { kapan, siapa, aksi }. Setiap perangkat
   memutarnya lewat reducer yang sama, diurutkan (waktu, id), sehingga
   semua perangkat PASTI sampai pada state yang sama — termasuk siapa
   yang menang saat dua orang membayar slot yang sama.
   ═══════════════════════════════════════════════════════════════════ */

export type Entry = { id: string; at: number; by: string | null; act: Action };
export type Genesis = { at: number; seed: boolean };

export const entryOrder = (x: Entry, y: Entry) =>
  x.at - y.at || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/**
 * Sebuah aksi boleh "mundur" paling jauh SEHARI dari jam server.
 *
 * Lebih dari itu, jam perangkatnyalah yang patut dicurigai — bukan antrean
 * yang memang sepanjang itu — dan lebih baik memakai jam server daripada
 * memindahkan omzet ke hari yang salah.
 */
export const MAKS_ANTRE_MS = 24 * 60 * 60_000;

/**
 * JAM SEBUAH KEJADIAN: saat AKSINYA TERJADI, bukan saat kirimannya sampai.
 *
 * Server menetapkan jam kejadian pada saat kiriman tiba (`staff_action`:
 * `clock_timestamp()`). Itu benar selama perangkat tersambung — selisihnya
 * sepersekian detik. Tapi perangkat yang terputus menumpuk aksinya di
 * antrean, dan saat tersambung SEMUANYA dicap dengan jam yang sama.
 *
 * Akibatnya (dilaporkan pemilik 21 Okt 2026, 41 aksi menunggu): seluruh
 * tiket dapur tertulis "Masuk kasir 20.56 · Ready 20.56 · 0m", padahal
 * dipesan dan dimasak pada jam yang berbeda-beda. Dan yang tidak terlihat
 * di layar jauh lebih mahal: meja yang dibuka pukul 18.00 ikut tercatat
 * mulai 20.56, jadi meterannya menagih tiga jam lebih sedikit.
 *
 * Karena itu perangkat menitipkan jamnya sendiri di dalam aksinya (`at0`),
 * dan di sinilah jam itu dipakai — DENGAN DUA PAGAR:
 *
 *   tidak pernah LEBIH LAMBAT dari jam server, supaya jam perangkat yang
 *     salah (atau dimajukan sengaja) tidak bisa mengarang kejadian di masa
 *     depan atau menggeser omzet ke hari berikutnya;
 *   tidak lebih dari sehari lebih awal (`MAKS_ANTRE_MS`).
 *
 * URUTAN kejadian tetap milik server (`entryOrder` memakai `e.at`). Yang
 * diubah hanya jam yang dicatat, bukan siapa duluan.
 */
export function jamKejadian(e: Entry): number {
  const dev = (e.act as { at0?: unknown } | null)?.at0;
  if (typeof dev !== "number" || !Number.isFinite(dev)) return e.at;
  return Math.min(e.at, Math.max(dev, e.at - MAKS_ANTRE_MS));
}

function inEntry<T>(e: Entry, fn: () => T): T {
  const prevClock = clockFn, prevBase = idBase, prevSeq = seq;
  const at = jamKejadian(e);
  clockFn = () => at;
  idBase = e.id.replace(/[^A-Za-z0-9]/g, ""); seq = 0;
  try { return fn(); } finally { clockFn = prevClock; idBase = prevBase; seq = prevSeq; }
}

/* ── Validasi kejadian — GAGAL TERTUTUP (PRD KK-24 R1) ─────────────
   Jejak dibagikan ke semua perangkat. Satu kejadian rusak (payload tidak lengkap,
   dari versi aplikasi lain, atau dikirim dengan sengaja) tidak boleh membuat mesin
   crash — kalau crash, SEMUA perangkat gagal memutar ulang jejak yang sama selamanya.
   Kejadian yang bentuknya tidak sah diperlakukan sebagai tidak berlaku. */

const isStr = (x: unknown): x is string => typeof x === "string";
const isOptStr = (x: unknown) => x === undefined || typeof x === "string";
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const oneOf = <T extends string>(x: unknown, xs: readonly T[]): x is T => typeof x === "string" && (xs as readonly string[]).includes(x);

const validLine = (l: unknown) =>
  isObj(l) && isStr(l.key) && isStr(l.itemId) && isNum(l.qty) && isOptStr(l.variant) && isOptStr(l.note) &&
  (l.unitPrice === undefined || isNum(l.unitPrice)) && (l.prepaid === undefined || typeof l.prepaid === "boolean") &&
  isOptStr(l.orderId) && isOptStr(l.name) &&
  // Penanda pra-pesan hanya boleh persis `true`. Nilai lain yang kebetulan
  // truthy akan berperilaku seperti pra-pesan di setiap jalur stok.
  (l.pra === undefined || l.pra === true) &&
  (l.station === undefined || oneOf(l.station, ["kitchen", "bar", "billiard"] as const));
const validLines = (xs: unknown) => Array.isArray(xs) && xs.length <= 200 && xs.every(validLine);

const validSessionPayload = (x: unknown) =>
  isObj(x) && isStr(x.id) && isStr(x.tableId) && isNum(x.startsAt) && isNum(x.endsAt) && isOptStr(x.guest) &&
  isOptStr(x.phone) && isOptStr(x.bookingCode) && isOptStr(x.checkin) && validLines(x.fnb) && isNum(x.paidOnline) &&
  isOptStr(x.paket);

const validPromo = (p: unknown) =>
  isObj(p) && isStr(p.id) && p.id.length > 0 && isStr(p.code) && isStr(p.name) && oneOf(p.kind, ["percent", "fixed"] as const) &&
  isNum(p.value) && oneOf(p.scope, ["billiard", "fnb", "all"] as const) &&
  Array.isArray(p.daysOfWeek) && p.daysOfWeek.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) &&
  Number.isInteger(p.startHour) && Number.isInteger(p.endHour) && isNum(p.minSpend) && isNum(p.maxDiscount) &&
  typeof p.active === "boolean" && typeof p.autoApply === "boolean";

/** Bentuk aksi yang sah untuk dicatat di jejak. Nilai bisnis (izin, stok, jam) tetap diperiksa reducer. */
export function validAction(a: unknown): a is Action {
  if (!isObj(a) || !isStr(a.t)) return false;
  switch (a.t) {
    case "tick": return true;
    case "openShift": return isNum(a.openingCash) && (a.venue === undefined || oneOf(a.venue, ["spl", "smh"] as const));
    case "closeShift": return isNum(a.countedCash) && (a.expected === undefined || isNum(a.expected));
    case "walkin": return isStr(a.tableId) && isOptStr(a.guest) && (a.hours === undefined || isNum(a.hours)) &&
      isOptStr(a.paketId);
    case "checkin": return isStr(a.code);
    case "extend": return isStr(a.id) && isNum(a.minutes);
    case "settle": return isStr(a.id) && oneOf(a.channel, ["cash", "edc", "qris_online"] as const) && isOptStr(a.promoCode)
      && (a.diskonPersen === undefined || isNum(a.diskonPersen)) && isOptStr(a.mesin);
    case "compliment": return isStr(a.sessionId) && isStr(a.key) && isOptStr(a.alasan);
    case "gabungMeja": return Array.isArray(a.ids) && a.ids.length >= 2 && a.ids.length <= 20 && a.ids.every(isStr);
    case "pisahMeja": return isStr(a.id);
    case "relocate": return isStr(a.id) && isStr(a.toTableId);
    case "toggleMaintenance": return isStr(a.tableId) && isOptStr(a.reason);
    case "addFnb": return isStr(a.sessionId) && validLine(a.line) && isOptStr(a.name) && oneOf(a.station, ["kitchen", "bar", "billiard"] as const);
    case "ticket": return isStr(a.id) && oneOf(a.status, ["new", "preparing", "ready", "served"] as const);
    case "setRate": return oneOf(a.key, ["regularDay", "regularNight", "vip", "vvip"] as const) && isNum(a.value);
    case "setPajak": return oneOf(a.key, ["ppn", "service"] as const) && isNum(a.value);
    case "setPajakLini": return oneOf(a.lini, ["biliar", "bar", "resto"] as const) &&
      oneOf(a.key, ["ppn", "service"] as const) && isNum(a.value);
    case "setMenuPrice": return isStr(a.itemId) && isNum(a.price);
    case "saveMenuItem": return isObj(a.item) && isOptStr(a.item.id) && isStr(a.item.name) &&
      isNum(a.item.price) && oneOf(a.item.station, ["kitchen", "bar", "billiard"] as const);
    case "removeMenuItem": return isStr(a.id);
    case "savePaket": return isObj(a.paket) && isOptStr(a.paket.id) && isStr(a.paket.name) &&
      isNum(a.paket.price) && isNum(a.paket.hours) && isNum(a.paket.freeDrinks) && isNum(a.paket.lastStartHour) &&
      (a.paket.venue === undefined || oneOf(a.paket.venue, ["spl", "smh"] as const)) &&
      (a.paket.isi === undefined || (Array.isArray(a.paket.isi) &&
        a.paket.isi.every((x: unknown) => isObj(x) && isStr(x.itemId) && isNum(x.qty))));
    case "addPaket": return isStr(a.sessionId) && isStr(a.paketId);
    case "removePaket": return isStr(a.id);
    case "toggleSoldOut": return isStr(a.itemId) && isOptStr(a.name);
    case "setStock": return isStr(a.itemId) && (a.qty === null || isNum(a.qty)) &&
      (a.gudang === undefined || a.gudang === "central");
    case "addStock": return isStr(a.itemId) && isNum(a.delta) && isOptStr(a.reason) &&
      (a.gudang === undefined || a.gudang === "central");
    case "transferStock": return isStr(a.itemId) && isNum(a.qty) && a.qty > 0;
    case "stockCount": return Array.isArray(a.counts) && a.counts.length > 0 && a.counts.length <= 300 &&
      a.counts.every((c: unknown) => isObj(c) && isStr(c.itemId) && isNum(c.qty) && c.qty >= 0) && isOptStr(a.note);
    case "savePromo": return validPromo(a.promo);
    case "deletePromo": return isStr(a.id);
    case "requestVoid": return isObj(a.req) && oneOf(a.req.targetKind, ["sesi", "item", "pesanan"] as const) &&
      isStr(a.req.targetId) && isStr(a.req.reason) && isOptStr(a.req.label);
    case "decideVoid": return isStr(a.id) && typeof a.approve === "boolean";
    case "toggleLight": return isStr(a.tableId);
    case "allLights": return typeof a.on === "boolean";
    case "hold":
    case "confirmOnline": return validSessionPayload(a.session);
    case "releaseHold": return isStr(a.id);
    case "guestOrder": return isObj(a.order) && isStr(a.order.id) && isStr(a.order.code) && isOptStr(a.order.guest) &&
      isOptStr(a.order.phone) && oneOf(a.order.mode, ["meja", "takeaway"] as const) && isOptStr(a.order.tableId) &&
      oneOf(a.order.pay, ["online", "kasir"] as const) && validLines(a.order.lines) && isNum(a.order.paidOnline) &&
      isOptStr(a.order.sessionId);
    case "restoreNoShow": return isStr(a.id);
    case "settleRefund": return isStr(a.id) && oneOf(a.method, ["transfer", "tunai", "kredit"] as const);
    case "settleOrder": return isStr(a.id) && oneOf(a.channel, ["cash", "edc", "qris_online"] as const) && isOptStr(a.mesin);
    case "setMesinEdc": return Array.isArray(a.daftar) && a.daftar.length <= 8 && a.daftar.every(isStr);
    case "editFnb": return isStr(a.sessionId) && isStr(a.key) && (a.qty === undefined || isNum(a.qty)) &&
      isOptStr(a.itemId) && isOptStr(a.variant);
    // Tujuannya SATU: sesi yang sedang jalan, atau meja kosong yang dibuka sekalian.
    case "moveFnb": return isStr(a.fromId) && isOptStr(a.toId) && isOptStr(a.toTableId) &&
      (isStr(a.toId) || isStr(a.toTableId)) && Array.isArray(a.keys) &&
      a.keys.length > 0 && a.keys.length <= 200 && a.keys.every(isStr);
    case "paySplit": return isStr(a.id) && oneOf(a.channel, ["cash", "edc", "qris_online"] as const) &&
      (a.amount === undefined || isNum(a.amount)) && isOptStr(a.label) && isOptStr(a.mesin) &&
      (a.keys === undefined || (Array.isArray(a.keys) && a.keys.length <= 200 && a.keys.every(isStr)));
    case "stopMeter": return isStr(a.id) && isNum(a.at);
    case "setTableClass": return isStr(a.tableId) && oneOf(a.type, ["regular", "vip", "vvip", "resto"] as const);
    case "setMejaDipakai": return isStr(a.tableId) && typeof a.dipakai === "boolean";
    case "setJamBebas": return typeof a.on === "boolean";
    case "setTableName": return isStr(a.tableId) && isStr(a.name);
    case "saveEmployee": return isObj(a.emp) && isStr(a.emp.id) && isStr(a.emp.name) && isStr(a.emp.pin) &&
      oneOf(a.emp.role, ROLES_SAH) && typeof a.emp.active === "boolean" &&
      isOptStr(a.emp.email) &&
      (a.emp.venue === undefined || oneOf(a.emp.venue, ["spl", "smh"] as const));
    case "removeEmployee": return isStr(a.id);
    case "reserveResto": return isObj(a.res) && isStr(a.res.id) && isStr(a.res.code) && isStr(a.res.guest) &&
      isOptStr(a.res.phone) && isNum(a.res.pax) && isNum(a.res.startsAt) && isNum(a.res.hours) &&
      isOptStr(a.res.tableId) && isOptStr(a.res.note) &&
      (a.res.lines === undefined || (Array.isArray(a.res.lines) && a.res.lines.every(validLine)));
    default: return false;                          // login/logout & aksi tak dikenal bukan isi jejak
  }
}

/** Jalankan aksi sebuah kejadian atas nama pelakunya; `me` perangkat ini tidak berubah. */
export function applyAction(st: State, e: Entry): State {
  if (!isNum(e.at) || !(e.by === null || isStr(e.by)) || !validAction(e.act)) return st;
  return inEntry(e, () => {
    // Pelaku dicari di daftar staf MILIK STATE dulu: akun yang dibuat pemilik lewat
    // tab Atur harus ikut dikenali saat jejak diputar ulang di perangkat lain.
    const actor = e.by ? st.employees?.find((x) => x.id === e.by) ?? EMPLOYEES.find((x) => x.id === e.by) ?? null : null;
    const asActor = st.me?.id === actor?.id ? st : { ...st, me: actor };
    let next: State;
    try {
      next = reducer(asActor, e.act);
    } catch {
      // Jaring pengaman terakhir: reducer murni (tidak mengubah state lama), jadi
      // mengabaikan kejadian yang tetap memicu galat aman dan sama di semua perangkat.
      return st;
    }
    if (next === asActor) return st;
    return next.me === st.me ? next : { ...next, me: st.me };
  });
}

/** Satu kejadian = detak waktu pada saat kejadian + aksinya. */
export function applyEntry(st: State, e: Entry): State {
  return applyAction(tickState(st, jamKejadian(e)), e);
}

/** Lanjutkan dari titik simpan: state yang sudah pasti + kejadian sesudahnya, diurutkan. */
export function replayFrom(start: State, entries: Entry[]): State {
  let st = start;
  for (const e of [...entries].sort(entryOrder)) st = applyEntry(st, e);
  return st;
}

/** State dari nol: genesis + seluruh jejak, diurutkan. */
export function replay(genesis: Genesis, entries: Entry[]): State {
  const prevClock = clockFn;
  clockFn = () => genesis.at;
  let st: State;
  try { st = init({ seed: genesis.seed }); } finally { clockFn = prevClock; }
  for (const e of [...entries].sort(entryOrder)) st = applyEntry(st, e);
  return st;
}
