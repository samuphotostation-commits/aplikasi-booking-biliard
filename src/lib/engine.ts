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
import { CLASS_LABEL, PAKET_SIANG, RATES, TABLES, type Rates, type TableType } from "../data/venue";
import { MENU, findItem } from "../data/menu";
import {
  EMPLOYEES, SEED_PROMOS, SEED_STOCK, can,
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
export const PAKET_FREE_DRINKS = 2;
/** Toleransi batal open bill: 5 menit pertama tidak ditagih (lihat billing.ts). */
export const GRACE_MIN = GRACE_MINUTES;
/** Reservasi meja resto paling cepat 30 menit sebelum datang. */
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
  /** Takeaway yang dibayar saat diambil di kasir. Tanpa ini = belum dibayar. */
  payment?: Payment;
};

/** Baris ringkas sesi yang sudah tutup buku — cukup untuk rekap, CSV, dan status riwayat pelanggan. */
export type ArchivedSession = Pick<LiveSession,
  "id" | "tableId" | "source" | "guest" | "bookingCode" | "checkin" | "status" | "startsAt" | "endsAt" | "settledAt" |
  "settledChannel" | "settledAmount" | "settledBilliard" | "settledFnb" | "settledDiscount" | "paidOnline" | "payments">;
/** Baris ringkas pesanan tamu yang sudah tutup buku. */
export type ArchivedOrder = Pick<GuestOrder,
  "id" | "code" | "at" | "guest" | "mode" | "tableId" | "pay" | "value" | "paidOnline" | "sessionId" | "status" | "reason" | "payment">;
/** Angka uang satu hari operasional (lihat `recap`). */
export type DayMoney = {
  billiard: number; fnb: number; discount: number; gross: number; diterima: number; prabayar: number;
  byChannel: Record<string, { n: number; gross: number }>; dpp: number; tax: number; mdr: number; net: number;
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
  sessions: ArchivedSession[];
  orders: ArchivedOrder[];
  voids: VoidRequest[];
  refunds: Refund[];
};
/** Rincian transaksi arsip (untuk CSV & riwayat) disimpan sekian hari; angka rekap selamanya. */
export const ARCHIVE_ROW_DAYS = 35;

/** `sessionId` (opsional) = tab yang dituju HP tamu. Bila tab di meja itu sudah berganti
 *  (tamu sudah pulang, orang lain yang main), pesanan ditolak — tidak masuk bill orang lain. */
export type GuestOrderRequest = Pick<
  GuestOrder, "id" | "code" | "guest" | "phone" | "mode" | "tableId" | "pay" | "lines" | "paidOnline" | "sessionId"
>;

/** Satu pergerakan stok — dasar laporan stok 05.00–05.00. */
export type StockMove = {
  at: number;
  itemId: string;
  /** Negatif = keluar (terjual/susut), positif = masuk/kembali. */
  delta: number;
  kind: "jual" | "kembali" | "masuk" | "susut" | "setel" | "opname";
};

/** Permintaan reservasi meja Smokehouse Resto dari HP tamu atau kasir. */
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
};

export type State = {
  me: Employee | null;
  shift: Shift | null;
  shiftHistory: Shift[];
  employees: Employee[];
  sessions: LiveSession[];
  tickets: Ticket[];
  rates: Rates;
  /** Kelas meja yang diubah superadmin (mis. VIP 3 dijadikan VVIP). Kosong = bawaan data meja. */
  tableTypes: Record<string, TableType>;
  /** Harga menu yang diubah superadmin. Yang tidak ada di sini = harga buku menu. */
  menuPrices: Record<string, number>;
  /** Pergerakan stok terbaru (terbaru dulu) — dasar laporan stok 05.00–05.00. */
  stockMoves: StockMove[];
  soldOut: string[];
  stock: StockRow[];
  promos: Promo[];
  voids: VoidRequest[];
  refunds: Refund[];
  orders: GuestOrder[];
  /** Notifikasi pembayaran booking yang sudah diproses — diterima MAUPUN ditolak.
   *  Gateway bisa mengirim ulang; yang kedua tidak boleh membuat booking/refund lagi. */
  paymentIds: string[];
  lights: Record<string, boolean>;
  log: { at: number; who: string; what: string; amount?: number }[];
  /** Hari operasional kejadian terakhir — pergantiannya memicu tutup buku otomatis. */
  day: string;
  /** Hari yang sudah tutup buku, terlama dulu. Tidak ikut dipindai setiap aksi. */
  history: DayArchive[];
};

export type Action =
  | { t: "tick" }
  | { t: "login"; emp: Employee }
  | { t: "logout" }
  | { t: "openShift"; openingCash: number }
  /** `expected` dari layar DIABAIKAN — mesin menghitung kas shift sendiri. */
  | { t: "closeShift"; countedCash: number; expected?: number }
  /** `hours` diisi = buka meja paket per jam (harga blok, ada jam selesai); kosong = open bill meteran. */
  | { t: "walkin"; tableId: string; guest: string; hours?: number }
  | { t: "checkin"; code: string }
  | { t: "extend"; id: string; minutes: number }
  /** Angka uang dari layar DIABAIKAN — dihitung ulang dari state. */
  | { t: "settle"; id: string; channel: PayChannel; promoCode?: string;
      amount?: number; billiard?: number; fnb?: number; discount?: number }
  | { t: "relocate"; id: string; toTableId: string }
  /** Koreksi pesanan yang salah item atau salah jumlah — selama belum diserahkan ke tamu. */
  | { t: "editFnb"; sessionId: string; key: string; qty?: number; itemId?: string; variant?: string }
  /** Salah nomor meja: pindahkan baris bill ke meja lain yang sedang jalan. */
  | { t: "moveFnb"; fromId: string; toId: string; keys: string[] }
  /** Split bill: satu orang membayar sebagian lebih dulu, sisanya tetap di bill meja. */
  | { t: "paySplit"; id: string; channel: PayChannel; keys?: string[]; amount?: number; label?: string }
  /** Meteran open bill dihentikan pada jam tertentu (aplikasi/komputer sempat mati). */
  | { t: "stopMeter"; id: string; at: number }
  /** Kelas meja: reguler / VIP (no smoking) / VVIP (bebas rokok). */
  | { t: "setTableClass"; tableId: string; type: TableType }
  /** Akun staf — pemilik bisa menambah superadmin lain. */
  | { t: "saveEmployee"; emp: Employee }
  | { t: "removeEmployee"; id: string }
  /** Reservasi meja Smokehouse Resto (tanpa bayar di muka). */
  | { t: "reserveResto"; res: RestoRequest }
  | { t: "toggleMaintenance"; tableId: string; reason?: string }
  | { t: "addFnb"; sessionId: string; line: CartLine; name: string; station: "kitchen" | "bar" }
  | { t: "ticket"; id: string; status: Ticket["status"] }
  | { t: "setRate"; key: keyof State["rates"]; value: number }
  | { t: "setMenuPrice"; itemId: string; price: number }
  | { t: "toggleSoldOut"; itemId: string; name: string }
  | { t: "setStock"; itemId: string; qty: number | null }
  | { t: "addStock"; itemId: string; delta: number; reason?: string }
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
  | { t: "settleOrder"; id: string; channel: PayChannel };

export function init(opts: { seed?: boolean } = {}): State {
  const now = clock();
  // Open bill contoh ikut membekukan tarif saat dibuka, sama seperti walk-in sungguhan.
  const sessions = (opts.seed === false ? [] : seedSessions(now)).map((x) =>
    x.status === "running" && x.source === "walkin" ? { ...x, rates: { ...RATES } } : x);
  const lights: Record<string, boolean> = {};
  for (const t of TABLES) lights[t.id] = sessions.some((x) => x.tableId === t.id && x.status === "running");
  return {
    me: null, shift: null, shiftHistory: [], employees: EMPLOYEES.map((e) => ({ ...e })),
    sessions, tickets: seedTickets(sessions, now),
    rates: { ...RATES }, tableTypes: {}, menuPrices: {}, stockMoves: [],
    soldOut: [], stock: SEED_STOCK.map((r) => ({ ...r })), promos: SEED_PROMOS.map((p) => ({ ...p })),
    voids: [], refunds: [], orders: [], paymentIds: [], lights, log: [],
    day: businessDateOf(now), history: [],
  };
}

/* ═════════════ Perhitungan bersama (layar & mesin memakai yang sama) ═════════════ */

const nameOf = (tableId: string) => TABLES.find((t) => t.id === tableId)?.name ?? tableId;
const typeOf = (tableId: string): TableType => TABLES.find((t) => t.id === tableId)?.type ?? "regular";

/** Kelas meja SEKARANG: pengaturan superadmin lebih dulu, lalu bawaan data meja. */
export const classOf = (st: Pick<State, "tableTypes">, tableId: string): TableType =>
  st.tableTypes?.[tableId] ?? typeOf(tableId);

/** Kelas yang DIBEKUKAN di sesi saat dibuka — mengubah kelas meja tidak menagih ulang tamu yang sedang main. */
export const sessionType = (s: Pick<LiveSession, "tableId" | "tableType">): TableType => s.tableType ?? typeOf(s.tableId);
/** Jam dalam hari operasional: 11..25, dan 02.00–10.59 menjadi 26..34 (tetap "malam",
 *  bukan kembali ke tarif siang, dan otomatis di luar jam buka). */
export const hourIdx = (ts: number) => { const h = diWib(ts).getUTCHours(); return h < OPEN_IDX ? h + 24 : h; };

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
export const priceOf = (st: Pick<State, "menuPrices">, itemId: string) =>
  st.menuPrices[itemId] ?? findItem(itemId)?.price ?? 0;

/** Nilai satu baris. Harga dikunci di baris saat dipesan (`unitPrice`),
 *  jadi perubahan harga menu tidak mengubah pesanan yang sudah masuk. */
export const lineValue = (l: CartLine) => {
  const it = findItem(l.itemId);
  return it ? (l.unitPrice ?? it.price) * l.qty : 0;
};

/**
 * SATU-SATUNYA cara memberi harga pesanan F&B — dipakai keranjang pelanggan,
 * booking online, pesanan QR, dan kasir: harga terkini + jatah minuman
 * gratis Paket Siang dipakai lebih dulu.
 */
export function priceLines(st: Pick<State, "menuPrices">, lines: CartLine[], freeCredits = 0) {
  const out: CartLine[] = [];
  let credits = Math.max(0, freeCredits);
  for (const l of lines) {
    const item = findItem(l.itemId);
    const qty = Math.floor(l.qty);
    if (!item || !(qty >= 1)) continue;
    const price = priceOf(st, item.id);
    const extra = l.note ? { note: l.note } : {};
    const free = credits > 0 && PAKET_FREE_CATEGORIES.includes(MENU_CATEGORY_OF[item.id]) ? Math.min(credits, qty) : 0;
    if (free > 0) {
      out.push({ key: `${l.key}-gratis`, itemId: item.id, qty: free, variant: l.variant, unitPrice: 0, ...extra });
      credits -= free;
    }
    if (qty - free > 0) out.push({ key: l.key, itemId: item.id, qty: qty - free, variant: l.variant, unitPrice: price, ...extra });
  }
  return { lines: out, credits, total: out.reduce((n, l) => n + lineValue(l), 0) };
}

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
export function settlementOf(s: LiveSession, st: Pick<State, "rates" | "promos">, now = clock(), code?: string) {
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
  const discount = Math.max(0, Math.min(promo?.discount ?? 0, counterBilliard + counterFnb - dibayarSebagian));
  /** Seluruh tagihan kasir sebelum dikurangi pembayaran sebagian. */
  const tagihan = Math.max(0, counterBilliard + counterFnb - discount);
  const due = Math.max(0, tagihan - dibayarSebagian);
  return { billiard, fnb, counterBilliard, counterFnb, discount, tagihan, dibayarSebagian, due, promo, detail: bill.detail };
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

/** Masalah slot booking online. null = boleh. */
export function slotProblem(
  s: Pick<State, "sessions" | "tableTypes">,
  r: { tableId: string; startsAt: number; hours: number; paket?: boolean },
  now = clock(), lead = true, ignoreId?: string,
): string | null {
  const table = TABLES.find((t) => t.id === r.tableId);
  if (!table) return "meja tidak dikenal";
  const kelas = classOf(s, r.tableId);
  if (kelas === "resto") return "meja resto dipesan lewat reservasi resto";
  if (!Number.isInteger(r.hours) || r.hours < 1) return "durasi tidak valid";
  const d = new Date(r.startsAt);
  if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) return "jam mulai harus tepat di awal jam";
  const startH = hourIdx(r.startsAt);
  if (startH < OPEN_IDX || startH + r.hours > CLOSE_IDX) return "di luar jam operasional";
  if (r.startsAt <= now) return "slot sudah lewat";
  if (lead && r.startsAt - now < MIN_LEAD_MIN * 60_000) return `booking online paling cepat ${MIN_LEAD_MIN} menit sebelum main`;
  if (r.paket && (kelas !== "regular" || r.hours !== PAKET_SIANG.hours || startH > PAKET_SIANG.lastStartHour)) {
    return "syarat Paket Siang tidak terpenuhi";
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
export function cartProblem(s: Pick<State, "soldOut" | "stock">, lines: CartLine[]): string | null {
  const need: Record<string, number> = {};
  for (const l of lines) {
    const it = findItem(l.itemId);
    if (!it || !Number.isInteger(l.qty) || l.qty < 1) return "item pesanan tidak valid";
    if (s.soldOut.includes(it.id)) return `${it.name} sedang habis`;
    need[it.id] = (need[it.id] ?? 0) + l.qty;
  }
  for (const [id, q] of Object.entries(need)) {
    const row = s.stock.find((r) => r.itemId === id);
    if (row && row.qty !== null && row.qty < q) return `stok ${findItem(id)!.name} tinggal ${row.qty}`;
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
  if (h < OPEN_IDX || h >= CLOSE_IDX) return "dapur sedang tutup (buka 11.00–02.00)";
  if (o.mode === "meja") {
    const t = TABLES.find((x) => x.id === o.tableId);
    if (!t) return "pilih nomor meja dulu";
    const run = runningOn(s, t.id);
    if (!run) return `${t.name} belum dibuka kasir — minta kasir membuka meja dulu`;
    if (o.sessionId && !o.sessionId.startsWith("pub-") && run.id !== o.sessionId) {
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
    taken.push(l);
  }
  return { taken, dropped, stock };
}

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
function note(s: State, what: string, amount?: number, who?: string, at = clock()): State["log"] {
  return [{ at, who: who ?? s.me?.name ?? "sistem", what, amount }, ...s.log].slice(0, 500);
}

const allow = (s: State, p: Permission) => can(s.me?.role ?? null, p);

const forSession = (x: LiveSession) => ({ id: x.id, tableName: nameOf(x.tableId) });

function ticketsFor(target: { id: string; tableName: string }, lines: CartLine[], now: number, via?: string): Ticket[] {
  return lines.map((l) => {
    const it = findItem(l.itemId);
    return {
      id: nextId("tk"), sessionId: target.id, tableName: target.tableName,
      itemId: l.itemId, name: it?.name ?? l.itemId, qty: l.qty, variant: l.variant,
      station: it?.station ?? "kitchen", status: "new" as const, at: now, lineKey: l.key,
      ...(via ? { via } : {}),
    };
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
});

const compactOrder = (o: ArchivedOrder): ArchivedOrder => ({
  id: o.id, code: o.code, at: o.at, guest: o.guest, mode: o.mode, tableId: o.tableId, pay: o.pay,
  value: o.value, paidOnline: o.paidOnline, sessionId: o.sessionId, status: o.status, reason: o.reason,
  payment: o.payment,
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
      what: `Tab tertinggal ditutup otomatis · ${nameOf(x.tableId)} · ${x.guest} · tidak ada tagihan`,
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
    const money = dayMoney(sx, takeaway, s.orders);
    const counts = dayCounts(sx, takeaway);
    const entry: DayArchive = {
      bizDate: d, money, counts,
      sessions: sx.map(compactSession), orders: ox.map(compactOrder), voids: vx, refunds: rx,
    };
    const i = history.findIndex((h) => h.bizDate === d);
    if (i >= 0) {
      const h = history[i];
      const byChannel = { ...h.money.byChannel };
      for (const [k, v] of Object.entries(money.byChannel)) byChannel[k] = { n: (byChannel[k]?.n ?? 0) + v.n, gross: (byChannel[k]?.gross ?? 0) + v.gross };
      const sum = (k: Exclude<keyof DayMoney, "byChannel">) => h.money[k] + money[k];
      history[i] = {
        bizDate: d,
        money: { billiard: sum("billiard"), fnb: sum("fnb"), discount: sum("discount"), gross: sum("gross"), diterima: sum("diterima"),
          prabayar: sum("prabayar"), byChannel, dpp: sum("dpp"), tax: sum("tax"), mdr: sum("mdr"), net: sum("net") },
        counts: {
          done: h.counts.done + counts.done, noShow: h.counts.noShow + counts.noShow, takeaway: h.counts.takeaway + counts.takeaway,
          takeawayValue: h.counts.takeawayValue + counts.takeawayValue, playedHours: h.counts.playedHours + counts.playedHours,
        },
        ...(h.rowsDropped ? { rowsDropped: true } : {}),
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
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    if (h.bizDate < rowCutoff && !h.rowsDropped) {
      history[i] = { bizDate: h.bizDate, money: h.money, counts: h.counts, rowsDropped: true, sessions: [], orders: [], voids: [], refunds: [] };
    }
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
  if (today <= released.day) return released;
  // Tab tertinggal tanpa tagihan ditutup DULU, baru bukunya — kalau tidak, satu
  // tab yang lupa ditutup mengunci rekap hari itu selamanya.
  return closeBooks(closeAbandoned(released, today, now), today, now);
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
      log = [{ at: ev.at, who: "sistem", what: `Hold kedaluwarsa dilepas · ${nameOf(x.tableId)} · ${x.guest}` }, ...log].slice(0, 500);
      continue;
    }
    // Barang pra-order tidak jadi disiapkan → kembali ke stok.
    const r = returnStock(stock, soldOut, x.fnb);
    stock = r.stock; soldOut = r.soldOut;
    log = [{ at: ev.at, who: "sistem", what: `No-show dilepas · ${nameOf(x.tableId)} · ${x.guest}`, amount: x.paidOnline }, ...log].slice(0, 500);
    changed.set(x.id, {
      ...x, status: "noshow", noShowFnb: x.fnb, fnb: [],
      settledAt: ev.at, settledAmount: 0, settledChannel: undefined,
      settledBilliard: x.tableAmount, settledFnb: fnbTotalOf(x), settledDiscount: 0,
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
  if (after === before || after.stock === before.stock) return after;
  const prev = new Map(before.stock.map((r) => [r.itemId, r.qty]));
  const moves: StockMove[] = [];
  for (const r of after.stock) {
    const old = prev.get(r.itemId);
    if (old === undefined || old === null || r.qty === null || r.qty === old) continue;
    const delta = r.qty - old;
    moves.push({ at, itemId: r.itemId, delta, kind: kindOf(delta) });
  }
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
  const next = reduce(s, a);
  return next === s ? s : withStockMoves(s, next, clock(), (d) => stockKind(a, d));
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
      const sh: Shift = {
        id: nextId("sh"), employeeId: s.me.id, employeeName: s.me.name,
        openedAt: now, openingCash: Math.max(0, Math.round(a.openingCash)),
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
      const table = TABLES.find((t) => t.id === a.tableId);
      if (!table || !allow(s, "bukaMeja") || !s.shift) return s;
      const h = hourIdx(now);
      if (h < OPEN_IDX || h >= CLOSE_IDX) return s;
      const kelas = classOf(s, a.tableId);
      // `hours` diisi = tamu membeli blok jam dengan harga tetap (ada jam selesai).
      // Kosong = open bill, meteran berjalan sampai kasir menutupnya.
      const jam = a.hours === undefined ? 0 : Math.floor(a.hours);
      if (a.hours !== undefined) {
        if (!(jam >= 1) || jam > 4 || h + jam > CLOSE_IDX) return s;
        if (kelas === "resto") return s;                 // meja resto tidak dijual per jam
      }
      const end = jam ? now + jam * HOUR_MS : now + 30 * 60_000;
      if (!tableFreeForRange(s.sessions, a.tableId, now, end, undefined, now)) return s;
      const sess: LiveSession = {
        id: nextId(`w-${a.tableId}`), tableId: a.tableId, source: "walkin",
        guest: a.guest || "Tamu", startsAt: now, endsAt: end,
        status: "running", fnb: [], paidOnline: 0,
        tableAmount: jam ? priceWith(s.rates, kelas, h, jam) : 0,
        rates: { ...s.rates },
        // Kelas meja dibekukan: mengubah VIP↔VVIP nanti tidak menagih ulang tamu ini.
        tableType: kelas,
        ...(jam ? { blockHours: jam } : {}),
      };
      return {
        ...s, sessions: [...s.sessions, sess],
        lights: { ...s.lights, [a.tableId]: true },
        log: note(s, `Meja dibuka (${jam ? `paket ${jam} jam` : "open bill"}) · ${table.name}`, sess.tableAmount || undefined),
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
      const running: LiveSession = { ...bk, status: "running", startsAt };
      return {
        ...s,
        sessions: s.sessions.map((x) => (x.id === bk.id ? running : x)),
        tickets: [...ticketsFor(forSession(running), bk.fnb.filter((l) => l.prepaid), now, `Pra-order · ${bk.guest}`), ...s.tickets],
        lights: { ...s.lights, [bk.tableId]: true },
        log: note(s, `Check-in ${a.code} · ${nameOf(bk.tableId)} · ${bk.guest}`),
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
        log: note(s, `Perpanjang ${a.minutes / 60} jam · ${nameOf(t.tableId)}`, add),
      };
    }

    /* ── Pindah meja ────────────────────────────────────────────── */
    case "relocate": {
      if (!allow(s, "bukaMeja")) return s;
      const t = s.sessions.find((x) => x.id === a.id);
      const to = TABLES.find((x) => x.id === a.toTableId);
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
        log: note(s, `Pindah meja · ${nameOf(t.tableId)} → ${to.name} · ${t.guest}`),
      };
    }

    /* ── Tutup tab ──────────────────────────────────────────────── */
    case "settle": {
      if (!allow(s, "tutupTab") || !s.shift) return s;
      const t = s.sessions.find((x) => x.id === a.id);
      if (!t || t.status !== "running") return s;
      const bill = settlementOf(t, s, now, a.promoCode);
      return {
        ...s,
        sessions: s.sessions.map((x) => x.id === a.id ? {
          ...x, status: "done" as const,
          // Open bill: jam selesai = jam meteran berhenti (bisa lebih awal kalau aplikasi mati).
          // Paket per jam & booking online: jam selesainya sudah tetap sejak awal.
          endsAt: x.source === "walkin" && !x.blockHours ? meterEndOf(x, now) : x.endsAt,
          settledChannel: a.channel, settledAmount: bill.due,
          settledBilliard: bill.billiard, settledFnb: bill.fnb, settledDiscount: bill.discount,
          settledAt: now, settledShiftId: s.shift!.id,
        } : x),
        lights: { ...s.lights, [t.tableId]: false },
        log: note(s, `Tab ditutup · ${nameOf(t.tableId)} · ${a.channel.toUpperCase()}${bill.promo ? ` · promo ${bill.promo.promo.name}` : ""}`, bill.due),
      };
    }

    /* ── Koreksi pesanan: salah item atau salah jumlah ──────────── */
    case "editFnb": {
      if (!allow(s, "koreksiPesanan") || !s.shift) return s;
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
      const item = findItem(a.itemId ?? line.itemId);
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
      const namaLama = findItem(line.itemId)?.name ?? line.itemId;
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
        tickets: s.tickets.map((t) => {
          if (t.sessionId !== sess.id || t.lineKey !== line.key) return t;
          const { variant: _v, ...tt } = t;
          return {
            ...tt, itemId: item.id, name: item.name, qty, station: item.station,
            status: ganti || qty > line.qty ? ("new" as const) : t.status,
            ...(variant ? { variant } : {}),
          };
        }),
        log: note(s, `Koreksi pesanan · ${nameOf(sess.tableId)} · ${line.qty}× ${namaLama} → ${qty}× ${item.name}`, selisih),
      };
    }

    /* ── Salah nomor meja: pindahkan baris ke meja lain ─────────── */
    case "moveFnb": {
      if (!allow(s, "koreksiPesanan") || !s.shift) return s;
      const from = s.sessions.find((x) => x.id === a.fromId);
      const to = s.sessions.find((x) => x.id === a.toId);
      if (!from || !to || from.id === to.id) return s;
      if (from.status !== "running" || to.status !== "running") return s;
      const diminta = new Set(a.keys);
      const sudahBayar = paidLineKeys(from);
      // Baris prabayar, yang sudah dibayar split, minuman gratis paket, dan baris
      // pesanan QR tidak ikut: uangnya sudah menempel pada pemilik/pesanannya.
      const pindah = from.fnb.filter((l) => diminta.has(l.key) && !l.prepaid && !sudahBayar.has(l.key) &&
        l.unitPrice !== 0 && !l.orderId);
      if (pindah.length === 0 || pindah.length !== diminta.size) return s;   // gagal tertutup: semua atau tidak sama sekali
      const baru = withUniqueKeys(to.fnb, pindah, `p${to.id}:`);
      const peta = new Map(pindah.map((l, i) => [l.key, baru[i].key]));
      const nilai = pindah.reduce((n, l) => n + lineValue(l), 0);
      // Meja asal tidak boleh jadi lebih kecil dari uang yang sudah dibayar per orang di situ.
      if (counterWith(from, from.fnb.filter((l) => !peta.has(l.key)), s, now) < splitPaidOf(from)) return s;
      return {
        ...s,
        sessions: s.sessions.map((x) =>
          x.id === from.id ? { ...x, fnb: x.fnb.filter((l) => !peta.has(l.key)) }
            : x.id === to.id ? { ...x, fnb: [...x.fnb, ...baru] } : x),
        // Tiket dapur ikut pindah supaya pramusaji mengantar ke meja yang benar.
        tickets: s.tickets.map((t) => (t.sessionId === from.id && t.lineKey && peta.has(t.lineKey)
          ? { ...t, sessionId: to.id, tableName: nameOf(to.tableId), lineKey: peta.get(t.lineKey)! }
          : t)),
        log: note(s, `Pesanan dipindah · ${nameOf(from.tableId)} → ${nameOf(to.tableId)} · ${pindah.length} baris`, nilai),
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
      };
      return {
        ...s,
        sessions: s.sessions.map((x) => (x.id === t.id ? { ...x, payments: [...(x.payments ?? []), bayar] } : x)),
        log: note(s, `Bayar sebagian · ${nameOf(t.tableId)} · ${a.channel.toUpperCase()}${bayar.label ? ` · ${bayar.label}` : ""}`, amount),
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
        log: note(s, `Meteran dihentikan · ${nameOf(t.tableId)} · pukul ${jamLog(at)}`),
      };
    }

    /* ── Kelas meja: VIP (no smoking) ↔ VVIP (bebas rokok) ──────── */
    case "setTableClass": {
      if (!allow(s, "kelolaMeja")) return s;
      const t = TABLES.find((x) => x.id === a.tableId);
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
      if (a.emp.role !== "superadmin" && a.emp.role !== "karyawan") return s;
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
      };
      const list = lama ? s.employees.map((x) => (x.id === id ? next : x)) : [...s.employees, next];
      if (list.length > 40) return s;
      // Harus selalu ada superadmin aktif — kalau tidak, venue terkunci selamanya.
      if (!list.some((x) => x.active && x.role === "superadmin")) return s;
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
      if (!list.some((x) => x.active && x.role === "superadmin")) return s;
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
          log: note(s, `Maintenance selesai · ${nameOf(a.tableId)}`),
        };
      }
      // Meja rusak terkunci sampai diaktifkan lagi, jadi tamu yang sudah memesan
      // meja ini (hari ini atau hari lain) harus dipindahkan dulu.
      if (!TABLES.some((t) => t.id === a.tableId) || maintenanceBlockers(s, a.tableId).length > 0) return s;
      return {
        ...s,
        sessions: [...s.sessions, {
          id: nextId(`m-${a.tableId}`), tableId: a.tableId, source: "walkin", guest: "—",
          startsAt: now, endsAt: now + 24 * HOUR_MS, status: "maintenance",
          fnb: [], tableAmount: 0, paidOnline: 0, note: a.reason || "Maintenance",
        }],
        lights: { ...s.lights, [a.tableId]: false },
        log: note(s, `Meja dinonaktifkan · ${nameOf(a.tableId)} · ${a.reason || "maintenance"}`),
      };
    }

    /* ── Pesan makanan/minuman ke bill ──────────────────────────── */
    case "addFnb": {
      if (!allow(s, "orderFnb") || !s.shift) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      const item = findItem(a.line.itemId);
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
        tickets: [...ticketsFor(forSession(sess), lines, now), ...s.tickets],
        log: note(s, `Order F&B · ${nameOf(sess.tableId)} · ${qty}× ${item.name}`, priced.total),
      };
    }

    case "ticket":
      if (!s.me || !s.tickets.some((t) => t.id === a.id && t.status !== a.status)) return s;
      return { ...s, tickets: s.tickets.map((t) => (t.id === a.id ? { ...t, status: a.status } : t)) };

    case "setRate": {
      if (!allow(s, "ubahTarif") || !(a.value > 0)) return s;
      return { ...s, rates: { ...s.rates, [a.key]: Math.round(a.value) }, log: note(s, `Tarif diubah · ${a.key} → ${a.value}`) };
    }

    /* ── Harga menu (superadmin). Pesanan yang sudah masuk tidak berubah. ── */
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
      if (!allow(s, "tandaiHabis") || !findItem(a.itemId)) return s;
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
      const qty = a.qty === null ? null : Math.floor(a.qty);
      const exists = s.stock.some((r) => r.itemId === a.itemId);
      const stock = exists
        ? s.stock.map((r) => (r.itemId === a.itemId ? { ...r, qty } : r))
        : [...s.stock, { itemId: a.itemId, qty, lowAt: 10 }];
      const prevQty = s.stock.find((r) => r.itemId === a.itemId)?.qty;
      const soldOut = qty !== null && qty > 0 && prevQty === 0 ? s.soldOut.filter((x) => x !== a.itemId) : s.soldOut;
      return { ...s, stock, soldOut: syncSoldOut(stock, soldOut), log: note(s, `Stok diatur · ${findItem(a.itemId)?.name ?? a.itemId} → ${qty ?? "tidak dilacak"}`) };
    }

    case "addStock": {
      if (!allow(s, "kelolaStok")) return s;
      const row = s.stock.find((r) => r.itemId === a.itemId);
      if (!row || row.qty === null || !Number.isFinite(a.delta)) return s;
      const next = Math.max(0, row.qty + Math.round(a.delta));
      const stock = s.stock.map((r) => (r.itemId === a.itemId ? { ...r, qty: next } : r));
      const soldOut = next > 0 && row.qty === 0 ? s.soldOut.filter((x) => x !== a.itemId) : s.soldOut;
      return { ...s, stock, soldOut: syncSoldOut(stock, soldOut), log: note(s, `Stok ${a.delta > 0 ? "+" : ""}${a.delta} · ${findItem(a.itemId)?.name ?? a.itemId}`) };
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
      if (!allow(s, "kontrolLampu") || !(a.tableId in s.lights)) return s;
      const next = !s.lights[a.tableId];
      return { ...s, lights: { ...s.lights, [a.tableId]: next }, log: note(s, `Lampu ${nameOf(a.tableId)} ${next ? "DINYALAKAN" : "dimatikan"}`) };
    }

    case "allLights": {
      if (!allow(s, "kontrolLampu")) return s;
      const lights: Record<string, boolean> = {};
      for (const t of TABLES) lights[t.id] = a.on;
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
        log: note(s, `Hold dibatalkan pelanggan · ${nameOf(h.tableId)} · ${h.guest}`, undefined, "sistem"),
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
      const refundAmt = f.dropped.reduce((n, l) => n + lineValue(l), 0);
      // Minuman gratis Paket Siang yang tidak bisa disajikan lagi mengembalikan jatahnya.
      const freeBack = f.dropped.filter((l) => l.unitPrice === 0).reduce((n, l) => n + l.qty, 0);
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
        tickets: [...ticketsFor(forSession(running), f.taken, now, `Pra-order · ${x.guest}`), ...s.tickets],
        lights: { ...s.lights, [x.tableId]: true },
        refunds: refundAmt > 0
          ? [refundRow(x.bookingCode ?? x.id, x.guest, x.phone, refundAmt, "menu pra-order sudah habis saat booking dipulihkan", now), ...s.refunds]
          : s.refunds,
        log: note(s, `No-show dipulihkan & check-in · ${nameOf(x.tableId)} · ${x.guest}`),
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
  const paket = sent.paket === "siang";
  if (slotProblem(s, { tableId: sent.tableId, startsAt: sent.startsAt, hours, paket }, now, true)) return s;
  if (cartProblem(s, sent.fnb)) return s;
  const table = TABLES.find((t) => t.id === sent.tableId)!;
  const kelas = classOf(s, table.id);
  const tableAmount = paket ? PAKET_SIANG.price : priceWith(s.rates, kelas, hourIdx(sent.startsAt), hours);
  const priced = priceLines(s, sent.fnb, paket ? PAKET_FREE_DRINKS : 0);
  const hold: LiveSession = {
    id: sent.id, tableId: table.id, source: "online", guest: sent.guest || "Pelanggan", phone: sent.phone,
    startsAt: sent.startsAt, endsAt: sent.endsAt, status: "hold", bookingCode: sent.bookingCode,
    fnb: [], tableAmount, paidOnline: 0, tableType: kelas,
    holdUntil: now + (HOLD_MIN + HOLD_GRACE_MIN) * 60_000, holdLines: priced.lines,
    ...(paket ? { paket: "siang" as const, freeDrinks: priced.credits } : {}),
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
  const table = TABLES.find((t) => t.id === from.tableId);
  if (!table) return reject("meja tidak dikenal");
  const hours = Math.round((from.endsAt - from.startsAt) / HOUR_MS);
  if (hours < 1 || from.endsAt - from.startsAt !== hours * HOUR_MS) return reject("durasi tidak valid");
  const paket = from.paket === "siang";
  const problem = slotProblem(base, { tableId: table.id, startsAt: from.startsAt, hours, paket }, now, false);
  if (problem) return reject(problem === "slot sudah terisi" ? "slot sudah terisi saat pembayaran masuk" : problem);

  let tableAmount: number, lines: CartLine[], credits: number;
  if (hold) {
    tableAmount = hold.tableAmount;
    lines = hold.holdLines ?? [];
    credits = hold.freeDrinks ?? 0;
  } else {
    for (const l of sent.fnb) {
      if (!findItem(l.itemId) || !Number.isInteger(l.qty) || l.qty < 1) return reject("item pesanan tidak valid");
    }
    tableAmount = paket ? PAKET_SIANG.price : priceWith(base.rates, classOf(base, table.id), hourIdx(from.startsAt), hours);
    const priced = priceLines(base, sent.fnb, paket ? PAKET_FREE_DRINKS : 0);
    lines = priced.lines;
    credits = priced.credits;
  }

  const required = tableAmount + lines.reduce((n, l) => n + lineValue(l), 0);
  if (sent.paidOnline !== required) {
    return reject(`nominal tidak cocok (dibayar ${sent.paidOnline}, seharusnya ${required})`);
  }

  const f = fulfil(base, lines.map((l) => ({ ...l, prepaid: true })));
  const refundAmt = f.dropped.reduce((n, l) => n + lineValue(l), 0);
  const freeBack = f.dropped.filter((l) => l.unitPrice === 0).reduce((n, l) => n + l.qty, 0);
  const session: LiveSession = {
    id: sent.id, tableId: table.id, source: "online", guest: sent.guest || from.guest,
    phone: sent.phone ?? from.phone, startsAt: from.startsAt, endsAt: from.endsAt, status: "booked",
    bookingCode: sent.bookingCode, checkin: sent.checkin,
    fnb: f.taken, tableAmount, paidOnline: required - refundAmt, extraTable: 0,
    tableType: hold?.tableType ?? classOf(base, table.id),
    ...(paket ? { paket: "siang" as const, freeDrinks: credits + freeBack } : {}),
  };
  const refunds = refundAmt > 0
    ? [{
        id: nextId("rf"), at: now, bookingCode: code, guest: session.guest, amount: refundAmt,
        reason: `menu habis saat pembayaran masuk: ${f.dropped.map((l) => findItem(l.itemId)?.name ?? l.itemId).join(", ")}`,
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
function guestOrder(s: State, o: GuestOrderRequest, now: number): State {
  if (s.orders.some((x) => x.id === o.id)) return s;                     // idempoten
  const guest = o.guest?.trim() || "Tamu";
  const paidIn = o.pay === "online" ? Math.max(0, o.paidOnline) : 0;

  const reject = (reason: string): State => ({
    ...s,
    orders: [{
      id: o.id, code: o.code, at: now, guest, phone: o.phone, mode: o.mode, tableId: o.tableId,
      pay: o.pay, lines: [], value: 0, paidOnline: paidIn, status: "ditolak", reason,
    }, ...s.orders],
    refunds: paidIn > 0
      ? [{ id: nextId("rf"), at: now, bookingCode: o.code, guest, amount: paidIn, reason }, ...s.refunds]
      : s.refunds,
    log: note(s, `Pesanan tamu DITOLAK · ${o.code} · ${reason}${paidIn > 0 ? " · dana dikembalikan" : ""}`, paidIn || undefined, "sistem"),
  });

  const problem = guestOrderProblem(s, o, now);
  if (problem) return reject(problem);

  const sess = o.mode === "meja" ? runningOn(s, o.tableId) : undefined;
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

  const tObj = TABLES.find((x) => x.id === o.tableId);
  const order: GuestOrder = {
    id: o.id, code: o.code, at: now, guest, phone: o.phone, mode: o.mode,
    tableId: sess?.tableId ?? o.tableId, pay: o.pay, lines, value: priced.total,
    paidOnline: prepaid ? priced.total : 0, sessionId: sess?.id, status: "diterima",
  };
  const target = sess
    ? forSession(sess)
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
    log: note(s, `Pesanan ${sess ? `QR ${nameOf(sess.tableId)}` : o.mode === "meja" ? `QR ${tObj?.name ?? o.tableId ?? ""}` : "takeaway"} · ${guest} · ${prepaid ? "lunas online" : "masuk bill meja"}`, priced.total, "sistem"),
  };
}

/** Jam "14.05" tanpa locale — teks jejak audit harus sama persis di semua perangkat. */
const jamLog = (ts: number) => {
  const d = diWib(ts);
  return `${String(d.getUTCHours()).padStart(2, "0")}.${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

/** Meja resto yang cocok: yang diminta tamu, atau meja terkecil yang muat & kosong. null = penuh. */
function restoTableFor(
  s: Pick<State, "sessions" | "tableTypes">,
  r: Pick<RestoRequest, "pax" | "startsAt" | "hours" | "tableId">,
  now: number,
): string | null {
  const until = r.startsAt + r.hours * HOUR_MS;
  const kosong = (id: string) => tableFreeForRange(s.sessions, id, r.startsAt, until, undefined, now);
  if (r.tableId) {
    const t = TABLES.find((x) => x.id === r.tableId);
    if (!t || classOf(s, t.id) !== "resto" || t.capacity < r.pax || !kosong(t.id)) return null;
    return t.id;
  }
  const muat = TABLES.filter((t) => classOf(s, t.id) === "resto" && t.capacity >= r.pax && kosong(t.id))
    .sort((p, q) => p.capacity - q.capacity || (p.id < q.id ? -1 : 1));
  return muat[0]?.id ?? null;
}

/** Kenapa reservasi meja resto ditolak. null = boleh. Dipakai layar tamu DAN mesin. */
export function restoProblem(
  s: Pick<State, "sessions" | "tableTypes">,
  r: Pick<RestoRequest, "pax" | "startsAt" | "hours" | "tableId">,
  now = clock(),
): string | null {
  if (!Number.isInteger(r.pax) || r.pax < 1 || r.pax > 30) return "jumlah orang tidak valid";
  if (!Number.isInteger(r.hours) || r.hours < 1 || r.hours > 4) return "durasi tidak valid";
  const d = new Date(r.startsAt);
  if (d.getMinutes() || d.getSeconds() || d.getMilliseconds()) return "jam mulai harus tepat di awal jam";
  const startH = hourIdx(r.startsAt);
  if (startH < OPEN_IDX || startH + r.hours > CLOSE_IDX) return "di luar jam buka resto";
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
  const tableId = restoTableFor(s, r, now)!;
  const sess: LiveSession = {
    id: r.id, tableId, source: "online", guest: guest.slice(0, 40), phone,
    startsAt: r.startsAt, endsAt: r.startsAt + r.hours * HOUR_MS, status: "booked",
    bookingCode: r.code, checkin: kodeCheckin(s, r.id),
    fnb: [], tableAmount: 0, paidOnline: 0, tableType: "resto", pax: r.pax,
    ...(r.note ? { note: r.note.slice(0, 120) } : {}),
  };
  return {
    ...s, sessions: [...s.sessions, sess],
    log: note(s, `Reservasi resto · ${nameOf(tableId)} · ${sess.guest} · ${r.pax} orang · ${jamLog(r.startsAt)}`, undefined, "sistem"),
  };
}

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
    return `${nameOf(bk.tableId)} masih dipakai — tunggu atau pindahkan tamu ke meja lain.`;
  }
  return null;
}

/** Kenapa booking no-show tidak bisa dipulihkan (lalu langsung check-in). null = boleh. */
export function restoreProblem(s: State, id: string, now = clock()): string | null {
  const x = s.sessions.find((v) => v.id === id && v.status === "noshow");
  if (!x) return "Booking tidak ditemukan.";
  if (now >= x.endsAt) return "Waktu booking sudah habis.";
  if (!tableFreeForRange(s.sessions, x.tableId, Math.min(now, x.startsAt), x.endsAt, x.id, now)) {
    return `${nameOf(x.tableId)} sudah terisi lagi — tidak bisa dipulihkan di meja ini.`;
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
    return { label: `Sesi ${nameOf(x.tableId)} · ${x.guest}`, amount: bill.billiard + bill.fnb };
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
  return { label: `${line.qty}× ${findItem(line.itemId)?.name ?? line.itemId} · ${nameOf(x.tableId)}`, amount: lineValue(line) };
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
    const freeBack = open.filter((l) => l.unitPrice === 0).reduce((n, l) => n + l.qty, 0);
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
      ...(line.unitPrice === 0 && x.freeDrinks !== undefined ? { freeDrinks: x.freeDrinks + line.qty } : {}),
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

export function relocationTargets(st: Pick<State, "sessions" | "tableTypes">, sess: LiveSession, now = clock()) {
  if (sess.status !== "booked" && sess.status !== "running") return [];
  const kelas = sessionType(sess);
  // Rentang yang SAMA dengan yang diperiksa reducer "relocate".
  const { from, until } = relocationRange(sess, now);
  return TABLES.filter((t) => t.id !== sess.tableId && classOf(st, t.id) === kelas &&
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

export function canOpenWalkin(sessions: LiveSession[], tableId: string, now = clock()) {
  const h = hourIdx(now);
  if (h < OPEN_IDX || h >= CLOSE_IDX) return false;
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
export function recap(a: State, bizDate = businessDateOf(clock())) {
  // Hari yang sudah tutup buku memakai angka yang dibekukan saat diarsipkan.
  const arch = a.history.find((h) => h.bizDate === bizDate);
  // PRD KK-19: hari operasional ditentukan dari JAM MULAI (batas 02.00). Tab yang
  // dibuka 20.00 dan ditutup 02.10 tetap omzet malam itu, bukan hari berikutnya.
  const closed: ArchivedSession[] = arch
    ? arch.sessions
    : a.sessions.filter((s) => (s.status === "done" || s.status === "noshow") && businessDateOf(s.startsAt) === bizDate);
  const takeaway: ArchivedOrder[] = (arch ? arch.orders : a.orders)
    .filter((o) => o.status === "diterima" && !o.sessionId && businessDateOf(o.at) === bizDate);
  const money = arch ? arch.money : dayMoney(closed, takeaway, a.orders);
  const counts = arch ? arch.counts : dayCounts(closed, takeaway);

  const perTable = floorByTable(a.sessions, clock());
  const vals = [...perTable.values()];

  return {
    bizDate, archived: !!arch, rowsAvailable: !arch?.rowsDropped, done: closed, takeaway, counts, ...money,
    cashExpected: shiftCashExpected(a),
    noShow: counts.noShow,
    running: vals.filter((s) => s.status === "running").length,
    booked: vals.filter((s) => s.status === "booked" || s.status === "hold").length,
    holds: a.sessions.filter((s) => s.status === "hold").length,
    maint: vals.filter((s) => s.status === "maintenance").length,
    free: TABLES.length - perTable.size,
    lampuNyala: Object.values(a.lights).filter(Boolean).length,
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
function dayMoney(closed: ArchivedSession[], takeaway: ArchivedOrder[], orders: ArchivedOrder[]): DayMoney {
  let billiard = 0, fnb = 0, discount = 0, gross = 0, diterima = 0, prabayar = 0;
  const byChannel: Record<string, { n: number; gross: number }> = {};
  const addPrabayar = (amt: number) => {
    prabayar += amt;
    byChannel.prabayar = { n: (byChannel.prabayar?.n ?? 0) + 1, gross: (byChannel.prabayar?.gross ?? 0) + amt };
  };
  for (const s of closed) {
    const b = s.settledBilliard ?? 0, f = s.settledFnb ?? 0, d = s.settledDiscount ?? 0;
    billiard += b; fnb += f; discount += d; gross += b + f - d;
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
    if (o.paidOnline > 0) addPrabayar(o.paidOnline);
    if (o.payment && o.payment.amount > 0) {
      diterima += o.payment.amount;
      const c = o.payment.channel;
      byChannel[c] = { n: (byChannel[c]?.n ?? 0) + 1, gross: (byChannel[c]?.gross ?? 0) + o.payment.amount };
    }
  }

  const dpp = Math.round(gross / 1.1);
  const tax = gross - dpp;
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

  return { billiard, fnb, discount, gross, diterima, prabayar, byChannel, dpp, tax, mdr, net: gross - mdr };
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

export function recapRange(a: State, dari: string, sampai: string): RekapPeriodeHasil {
  const money: DayMoney = {
    billiard: 0, fnb: 0, discount: 0, gross: 0, diterima: 0, prabayar: 0,
    byChannel: {}, dpp: 0, tax: 0, mdr: 0, net: 0,
  };
  const counts: DayCounts = { done: 0, noShow: 0, takeaway: 0, takeawayValue: 0, playedHours: 0 };
  const hari: RekapPeriodeHasil["hari"] = [];
  let terbaik: RekapPeriodeHasil["terbaik"] = null;

  let d = dari;
  for (let i = 0; d <= sampai && i < MAX_REKAP_HARI; i++, d = shiftDate(d, 1)) {
    const r = recap(a, d);
    const m: DayMoney = {
      billiard: r.billiard, fnb: r.fnb, discount: r.discount, gross: r.gross, diterima: r.diterima,
      prabayar: r.prabayar, byChannel: r.byChannel, dpp: r.dpp, tax: r.tax, mdr: r.mdr, net: r.net,
    };
    hari.push({ bizDate: d, money: m, counts: r.counts });
    money.billiard += m.billiard; money.fnb += m.fnb; money.discount += m.discount;
    money.gross += m.gross; money.diterima += m.diterima; money.prabayar += m.prabayar;
    money.dpp += m.dpp; money.tax += m.tax; money.mdr += m.mdr; money.net += m.net;
    for (const [k, v] of Object.entries(m.byChannel)) {
      money.byChannel[k] = { n: (money.byChannel[k]?.n ?? 0) + v.n, gross: (money.byChannel[k]?.gross ?? 0) + v.gross };
    }
    counts.done += r.counts.done; counts.noShow += r.counts.noShow;
    counts.takeaway += r.counts.takeaway; counts.takeawayValue += r.counts.takeawayValue;
    counts.playedHours += r.counts.playedHours;
    if (m.gross > 0 && (!terbaik || m.gross > terbaik.gross)) terbaik = { bizDate: d, gross: m.gross };
  }
  // Pajak dijumlah dari pembulatan harian; rapikan supaya DPP + pajak = omzet periode.
  money.dpp = money.gross - money.tax;
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

function inEntry<T>(e: Entry, fn: () => T): T {
  const prevClock = clockFn, prevBase = idBase, prevSeq = seq;
  clockFn = () => e.at;
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
  isOptStr(l.orderId);
const validLines = (xs: unknown) => Array.isArray(xs) && xs.length <= 200 && xs.every(validLine);

const validSessionPayload = (x: unknown) =>
  isObj(x) && isStr(x.id) && isStr(x.tableId) && isNum(x.startsAt) && isNum(x.endsAt) && isOptStr(x.guest) &&
  isOptStr(x.phone) && isOptStr(x.bookingCode) && isOptStr(x.checkin) && validLines(x.fnb) && isNum(x.paidOnline) &&
  (x.paket === undefined || x.paket === "siang");

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
    case "openShift": return isNum(a.openingCash);
    case "closeShift": return isNum(a.countedCash) && (a.expected === undefined || isNum(a.expected));
    case "walkin": return isStr(a.tableId) && isOptStr(a.guest) && (a.hours === undefined || isNum(a.hours));
    case "checkin": return isStr(a.code);
    case "extend": return isStr(a.id) && isNum(a.minutes);
    case "settle": return isStr(a.id) && oneOf(a.channel, ["cash", "edc", "qris_online"] as const) && isOptStr(a.promoCode);
    case "relocate": return isStr(a.id) && isStr(a.toTableId);
    case "toggleMaintenance": return isStr(a.tableId) && isOptStr(a.reason);
    case "addFnb": return isStr(a.sessionId) && validLine(a.line) && isOptStr(a.name) && oneOf(a.station, ["kitchen", "bar"] as const);
    case "ticket": return isStr(a.id) && oneOf(a.status, ["new", "preparing", "ready", "served"] as const);
    case "setRate": return oneOf(a.key, ["regularDay", "regularNight", "vip", "vvip"] as const) && isNum(a.value);
    case "setMenuPrice": return isStr(a.itemId) && isNum(a.price);
    case "toggleSoldOut": return isStr(a.itemId) && isOptStr(a.name);
    case "setStock": return isStr(a.itemId) && (a.qty === null || isNum(a.qty));
    case "addStock": return isStr(a.itemId) && isNum(a.delta) && isOptStr(a.reason);
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
    case "settleOrder": return isStr(a.id) && oneOf(a.channel, ["cash", "edc", "qris_online"] as const);
    case "editFnb": return isStr(a.sessionId) && isStr(a.key) && (a.qty === undefined || isNum(a.qty)) &&
      isOptStr(a.itemId) && isOptStr(a.variant);
    case "moveFnb": return isStr(a.fromId) && isStr(a.toId) && Array.isArray(a.keys) &&
      a.keys.length > 0 && a.keys.length <= 200 && a.keys.every(isStr);
    case "paySplit": return isStr(a.id) && oneOf(a.channel, ["cash", "edc", "qris_online"] as const) &&
      (a.amount === undefined || isNum(a.amount)) && isOptStr(a.label) &&
      (a.keys === undefined || (Array.isArray(a.keys) && a.keys.length <= 200 && a.keys.every(isStr)));
    case "stopMeter": return isStr(a.id) && isNum(a.at);
    case "setTableClass": return isStr(a.tableId) && oneOf(a.type, ["regular", "vip", "vvip", "resto"] as const);
    case "saveEmployee": return isObj(a.emp) && isStr(a.emp.id) && isStr(a.emp.name) && isStr(a.emp.pin) &&
      oneOf(a.emp.role, ["superadmin", "karyawan"] as const) && typeof a.emp.active === "boolean" &&
      isOptStr(a.emp.email);
    case "removeEmployee": return isStr(a.id);
    case "reserveResto": return isObj(a.res) && isStr(a.res.id) && isStr(a.res.code) && isStr(a.res.guest) &&
      isOptStr(a.res.phone) && isNum(a.res.pax) && isNum(a.res.startsAt) && isNum(a.res.hours) &&
      isOptStr(a.res.tableId) && isOptStr(a.res.note);
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
  return applyAction(tickState(st, e.at), e);
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
