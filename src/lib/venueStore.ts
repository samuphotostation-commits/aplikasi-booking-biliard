/* ═══════════════════════════════════════════════════════════════════
   PENYIMPANAN & SINKRONISASI DATA VENUE — tahap simulasi, tanpa server

   Yang disimpan BUKAN potret state, melainkan jejak kejadian (engine.ts
   `Entry`): siapa, kapan, aksi apa. Setiap layar memutarnya lewat reducer
   yang sama, jadi:

   - Muat ulang halaman  → data tidak hilang (jejak ada di localStorage).
   - Buka beberapa tab   → kasir, dapur, dan HP pelanggan di perangkat yang
     sama sinkron seketika (BroadcastChannel; cadangan: event `storage`).
   - Dua aksi berebut    → urutan (waktu, id) menentukan pemenang dengan cara
     yang sama di semua layar; yang kalah otomatis diputar ulang.
   - Dipakai berminggu-minggu → jejak yang sudah mapan dilipat ke TITIK SIMPAN
     (potret state pada kejadian tertentu) dan dibuang dari penyimpanan, jadi
     membuka aplikasi tidak memutar ulang dari hari pertama dan localStorage
     tidak penuh.

   Batas jujur: localStorage hanya berbagi di SATU browser/perangkat. Agar
   HP pelanggan dan tablet kasir yang berbeda perangkat ikut sinkron, jejak
   yang sama cukup dipindah ke tabel Supabase + Realtime (akun baru, PRD
   KK-23) — mesin dan urutannya tidak perlu diubah.
   ═══════════════════════════════════════════════════════════════════ */
import { EMPLOYEES, type Employee } from "../data/staff";
import {
  applyAction, applyEntry, entryOrder, replay, replayFrom, tickState,
  type Action, type Entry, type Genesis, type State,
} from "./engine";
import { offlineBlock, type Proposal, type Remote, type ServerEntry } from "./remote";
import { publicVenue } from "./publicView";
import { businessDateOf } from "./occupancy";
import { rapikanHp } from "./profilTamu";
import { remoteFromEnv } from "./supabaseRemote";
import { createCustomerStore } from "./customerStore";

const NS = "spl:v1";
const K_GENESIS = `${NS}:genesis`;
const K_SNAPSHOT = `${NS}:snapshot`;
const LOG_PREFIX = `${NS}:log:`;
const K_ME = `${NS}:me`;
/** Aksi yang sudah dikerjakan layar tapi belum diberi urutan oleh server. */
const K_OUTBOX = `${NS}:outbox`;
/** Nomor urut server terakhir yang sudah diketahui perangkat ini. */
const K_HEAD = `${NS}:head`;
/** Jejak per tab dipecah per 200 kejadian supaya tiap klik hanya menulis potongan kecil. */
const CHUNK = 200;

export type SyncInfo = {
  /** Data tersimpan di perangkat (tidak hilang saat dimuat ulang). */
  persisted: boolean;
  /** Cara layar lain di perangkat ini menerima perubahan. */
  live: "broadcast" | "storage" | "none";
  /** "lokal" = hanya perangkat ini; "server" = jejak bersama lintas perangkat. */
  mode: "lokal" | "server";
  /** Tersambung ke server (selalu true dalam mode lokal). */
  online: boolean;
  /** Aksi yang masih menunggu konfirmasi urutan dari server. */
  pending: number;
  /** Nomor urut server terakhir yang sudah diterima perangkat ini. */
  head: number;
  /** Aksi terakhir yang ditahan atau ditolak — untuk ditampilkan ke staf. */
  problem: string | null;
  /** Seluruh kejadian sejak genesis (termasuk yang sudah dilipat ke titik simpan). */
  entries: number;
  /** Kejadian sesudah titik simpan — yang diputar saat aplikasi dibuka. */
  tail: number;
  /** Kapan titik simpan terakhir dibuat (waktu kejadian terakhirnya). */
  snapshotAt: number | null;
  genesis: Genesis;
  storageError: string | null;
};

export type VenueStoreOptions = {
  /** Buat titik simpan bila jejak sesudah titik simpan sebelumnya melebihi ini. */
  snapshotEvery?: number;
  /** Hanya kejadian yang lebih tua dari ini yang dilipat — siaran antar-tab yang
   *  terlambat tetap bisa masuk urutan yang benar. */
  settleMs?: number;
  /** Server penentu urutan. Tanpa ini, jejak hanya hidup di perangkat ini. */
  remote?: Remote & {
    /** Mode server: PIN diperiksa server dan menghasilkan sesi. */
    login?: (pin: string) => Promise<{ ok: true } | { ok: false; alasan: string }>;
    logout?: () => void;
    bersesi?: () => boolean;
    /** Menerbitkan ringkasan publik untuk HP pelanggan. */
    publish?: (ringkasan: unknown, status: unknown[], genesisAt: number) => Promise<void>;
    /** Setor kunjungan ke database pelanggan pemilik. */
    publishVisits?: (rows: unknown[]) => Promise<number>;
    fetchCustomers?: (cari?: string) => Promise<import("./supabaseRemote").Pelanggan[]>;
    setNote?: (phone: string, catatan: string) => Promise<void>;
    forget?: (phone: string) => Promise<number>;
    /** Daftar member (tamu yang mendaftar sendiri) untuk blast promo. */
    fetchMembers?: (cari?: string) => Promise<import("./supabaseRemote").MemberBaris[]>;
    resetMemberPin?: (phone: string) => Promise<{ ok: boolean; pin?: string; alasan?: string }>;
    forgetMember?: (phone: string) => Promise<number>;
    /** Absensi karyawan. */
    absenCatat?: (jenis: "masuk" | "pulang", foto: string, catatan?: string) => Promise<import("./supabaseRemote").AbsenHasil>;
    absenDaftar?: (hari?: number) => Promise<import("./supabaseRemote").AbsenBaris[]>;
    absenFoto?: (id: number) => Promise<string | null>;
    /** Tutup buku stok harian dari server (fakta hari lampau). */
    stokAmbil?: (dari: string, sampai: string) => Promise<import("./supabaseRemote").StokHarianBaris[]>;
    /** Antrean pesan ke tamu (WhatsApp) — layar Pesan di panel kasir. */
    pesanDaftar?: (limit?: number) => Promise<import("./supabaseRemote").PesanBaris[]>;
    pesanTandai?: (id: number, status: "terkirim" | "batal" | "antre") => Promise<boolean>;
    pesanBlast?: (teks: string) => Promise<number>;
    /** Akun staf di server (PIN) — supaya akun baru berlaku di semua perangkat. */
    saveStaff?: (emp: { id: string; name: string; role: string; pin?: string; active: boolean }) => Promise<string | null>;
    removeStaff?: (id: string) => Promise<string | null>;
    /** Masuk dengan email: kirim kode, lalu tukar kodenya jadi sesi venue. */
    kirimKodeEmail?: (email: string) => Promise<string | null>;
    loginEmail?: (email: string, kode: string) => Promise<{ ok: true; staffId: string; nama: string; peran: "superadmin" | "karyawan" } | { ok: false; alasan: string }>;
    setStaffEmail?: (staffId: string, email: string) => Promise<string | null>;
  };
  /** Jeda sebelum mencoba menyambung lagi setelah gagal (dilipatduakan sampai 30 dtk). */
  retryMs?: number;
};

type Listener = () => void;

/** Sesi yang masih memakai meja — dipakai saat memilih status mana yang diterbitkan. */
const ACTIVE_STATUS = new Set(["booked", "hold", "running"]);

/** Titik simpan: state tepat sesudah kejadian `upto` (jejak sampai situ sudah dilipat). */
type Snapshot = { genesisAt: number; upto: { id: string; at: number }; count: number; state: State };

function attempt<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

function randomOrigin() {
  const bytes = new Uint8Array(6);
  try { crypto.getRandomValues(bytes); } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

/** Kejadian di penyimpanan membawa cap genesis `g`: jejak dari sebelum reset tidak ikut diputar. */
type StoredEntry = Entry & { g?: number };

const isEntry = (e: unknown): e is StoredEntry => {
  const x = e as Entry;
  return !!x && typeof x.id === "string" && typeof x.at === "number" && !!x.act && typeof x.act.t === "string";
};

const isSnapshot = (x: unknown): x is Snapshot => {
  const s = x as Snapshot;
  return !!s && typeof s.genesisAt === "number" && !!s.upto && typeof s.upto.id === "string" &&
    typeof s.upto.at === "number" && typeof s.count === "number" && !!s.state && Array.isArray(s.state.sessions);
};

const seqOf = (e: Entry) => Number(e.id.slice(e.id.lastIndexOf(":") + 1)) || 0;

export function createVenueStore(opts: VenueStoreOptions = {}) {
  const SNAPSHOT_EVERY = opts.snapshotEvery ?? 400;
  const SETTLE_MS = opts.settleMs ?? 5 * 60_000;
  const remote = opts.remote ?? null;
  const RETRY_MS = opts.retryMs ?? 2_000;
  const RETRY_MAX = 30_000;

  const local = attempt(() => {
    const s = window.localStorage;
    s.setItem(`${NS}:probe`, "1");
    s.removeItem(`${NS}:probe`);
    return s;
  });
  const session = attempt(() => window.sessionStorage);
  // Asal baru setiap kali halaman dimuat — tab duplikat tidak pernah menimpa jejak tab lain.
  const origin = randomOrigin();
  const channel = attempt(() => (typeof BroadcastChannel === "function" ? new BroadcastChannel(NS) : null));

  let storageError: string | null = null;
  let genesis: Genesis = { at: Date.now(), seed: true };
  let snap: Snapshot | null = null;
  /** State pada titik simpan (atau genesis bila belum ada). */
  let snapBase: State;
  /** Kejadian SESUDAH titik simpan, terurut. */
  let entries: Entry[] = [];
  let ids = new Set<string>();
  let own: Entry[] = [];
  let n = 0;
  let base: State;
  let me: Employee | null = null;
  let view: State;
  const listeners = new Set<Listener>();
  /** Aksi yang sudah terlihat di layar tapi belum diberi urutan server. */
  let outbox: Proposal[] = [];
  let head = 0;
  let online = !remote;
  let problem: string | null = null;
  let sending = false;
  let retryAt: ReturnType<typeof setTimeout> | null = null;
  let retryMs = RETRY_MS;

  const read = <T,>(key: string): T | null =>
    attempt(() => {
      const raw = local?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    });

  const write = (key: string, value: unknown) => {
    if (!local) return false;
    try {
      local.setItem(key, JSON.stringify(value));
      storageError = null;
      return true;
    } catch {
      storageError = "Penyimpanan perangkat penuh — perubahan baru tidak tersimpan. Reset data simulasi di menu Atur.";
      return false;
    }
  };

  const logKeys = () => {
    const out: string[] = [];
    if (!local) return out;
    attempt(() => {
      for (let i = 0; i < local.length; i++) {
        const k = local.key(i);
        if (k?.startsWith(LOG_PREFIX)) out.push(k);
      }
    });
    return out;
  };

  // Tab yang tertidur saat tab lain mereset data bisa menulis ulang jejak lamanya.
  // Kejadian bercap genesis lain diabaikan; yang tanpa cap (versi lama) tetap diterima.
  const fromThisWorld = (e: StoredEntry) => e.g === undefined || e.g === genesis.at;
  /** Kejadian yang belum termasuk titik simpan. */
  const afterSnap = (e: Entry) => !snap || entryOrder(e, { id: snap.upto.id, at: snap.upto.at, by: null, act: { t: "tick" } }) > 0;

  const storedEntries = () => {
    const all: Entry[] = [];
    for (const k of logKeys()) for (const e of read<unknown[]>(k) ?? []) if (isEntry(e) && fromThisWorld(e)) all.push(e);
    return all;
  };

  const storedSnapshot = (): Snapshot | null => {
    const s = read<unknown>(K_SNAPSHOT);
    return isSnapshot(s) && s.genesisAt === genesis.at ? s : null;
  };

  function loadAll() {
    const g = read<Genesis>(K_GENESIS);
    if (g && typeof g.at === "number") {
      genesis = { at: g.at, seed: g.seed !== false };
    } else if (remote) {
      // Dunia ditentukan server: jangan mengarang genesis sendiri (nanti data contoh
      // ikut muncul lalu hilang). Sebelum tersambung, papan kosong dan banner
      // "belum tersambung" yang tampil.
      genesis = { at: 0, seed: false };
    } else {
      genesis = { at: Date.now(), seed: true };
      write(K_GENESIS, genesis);
    }
    snap = storedSnapshot();
    snapBase = snap ? { ...snap.state, me: null } : replay(genesis, []);
    const all = new Map<string, Entry>();
    for (const e of storedEntries()) if (afterSnap(e)) all.set(e.id, e);
    for (const e of own) if (afterSnap(e)) all.set(e.id, e);   // milik tab ini yang mungkin gagal tersimpan
    entries = [...all.values()].sort(entryOrder);
    ids = new Set(entries.map((e) => e.id));
    base = replayFrom(snapBase, entries);
    if (remote) {
      outbox = (read<Proposal[]>(K_OUTBOX) ?? []).filter((p) => !!p && typeof p.id === "string" && !!p.act);
      head = read<number>(K_HEAD) ?? 0;
      for (const e of entries) head = Math.max(head, (e as ServerEntry).seq ?? 0);
    }
  }

  /** Simpan kejadian resmi server ke penyimpanan perangkat (agar dibuka cepat & bisa dibaca offline). */
  function saveServerEntries(list: Entry[]) {
    if (!local) return;
    const byChunk = new Map<number, Entry[]>();
    for (const e of list) {
      const c = Math.floor(Math.max(((e as ServerEntry).seq ?? 1) - 1, 0) / CHUNK);
      const arr = byChunk.get(c) ?? [];
      arr.push({ ...e, g: genesis.at } as StoredEntry);
      byChunk.set(c, arr);
    }
    for (const [c, list2] of byChunk) {
      const key = `${LOG_PREFIX}srv:${c}`;
      const merged = new Map<string, Entry>();
      for (const e of read<unknown[]>(key) ?? []) if (isEntry(e)) merged.set(e.id, e);
      for (const e of list2) merged.set(e.id, e);
      write(key, [...merged.values()]);
    }
  }

  /** Titik simpan dari tab lain yang lebih baru: pakai, jejak yang sudah terlipat dilepas. */
  function adoptNewerSnapshot() {
    const s = storedSnapshot();
    if (!s || (snap && entryOrder(
      { id: s.upto.id, at: s.upto.at, by: null, act: { t: "tick" } },
      { id: snap.upto.id, at: snap.upto.at, by: null, act: { t: "tick" } },
    ) <= 0)) return false;
    snap = s;
    snapBase = { ...s.state, me: null };
    entries = entries.filter(afterSnap);
    ids = new Set(entries.map((e) => e.id));
    own = own.filter(afterSnap);
    base = replayFrom(snapBase, entries);
    return true;
  }

  /** Lipat jejak yang sudah mapan ke titik simpan, lalu buang dari penyimpanan. */
  function maybeSnapshot() {
    if (!local || entries.length < SNAPSHOT_EVERY) return;
    // Tab lain mungkin sudah membuat titik simpan yang lebih baru — pakai itu, jangan
    // menimpanya dengan yang lebih lama (jejak di antaranya sudah dibuang tab itu).
    adoptNewerSnapshot();
    const horizon = Date.now() - SETTLE_MS;
    let k = -1;
    for (let i = 0; i < entries.length && entries[i].at <= horizon; i++) k = i;
    if (k + 1 < Math.ceil(SNAPSHOT_EVERY / 2)) return;
    const cut = entries.slice(0, k + 1);
    const last = cut[cut.length - 1];
    const next: Snapshot = {
      genesisAt: genesis.at, upto: { id: last.id, at: last.at },
      count: (snap?.count ?? 0) + cut.length,
      state: { ...replayFrom(snapBase, cut), me: null },
    };
    if (!write(K_SNAPSHOT, next)) return;
    snap = next;
    snapBase = next.state;
    entries = entries.filter(afterSnap);
    ids = new Set(entries.map((e) => e.id));
    own = own.filter(afterSnap);
    // Buang jejak yang sudah terlipat dari penyimpanan (semua tab).
    for (const key of logKeys()) {
      const list = read<unknown[]>(key) ?? [];
      const keep = list.filter((e) => isEntry(e) && fromThisWorld(e) && afterSnap(e));
      if (keep.length === list.length) continue;
      if (keep.length === 0) attempt(() => local.removeItem(key));
      else write(key, keep);
    }
  }

  function computeView() {
    // Detak tampilan: no-show & hold kedaluwarsa langsung terlihat, tapi TIDAK
    // disimpan — hasilnya deterministik, jadi kejadian berikutnya sampai pada
    // hasil yang sama di semua layar.
    let st = tickState(base, Date.now());
    // Aksi yang menunggu urutan server tetap terlihat seketika di layar yang mengirimnya.
    // Begitu server mengonfirmasi, aksi itu masuk jejak dengan JAM SERVER dan tampilan
    // dihitung ulang — kalau ternyata ditolak aturan, tampilannya kembali sendiri.
    for (const p of outbox) st = applyAction(st, { id: p.id, at: Date.now(), by: p.by ?? me?.id ?? null, act: p.act });
    view = { ...st, me };
  }

  function notify() {
    computeView();
    listeners.forEach((l) => l());
  }

  function mergeIncoming(list: unknown[], fromServer = false) {
    if (fromServer) {
      // Nomor urut tertinggi dicatat walau kejadiannya sudah dikenal — supaya
      // `pull` berikutnya tidak meminta ulang dari awal.
      const before = head;
      for (const e of list) if (isEntry(e)) head = Math.max(head, (e as ServerEntry).seq ?? 0);
      if (head !== before) write(K_HEAD, head);
    }
    const fresh = list.filter(isEntry)
      .filter((e) => fromThisWorld(e) && afterSnap(e) && !ids.has(e.id))
      .sort(entryOrder);
    if (fromServer && fresh.length) saveServerEntries(fresh);
    if (fresh.length === 0) return;
    let needReplay = false;
    for (const e of fresh) {
      ids.add(e.id);
      const last = entries[entries.length - 1];
      entries.push(e);
      if (needReplay || (last && entryOrder(last, e) >= 0)) needReplay = true;
      else base = applyEntry(base, e);
    }
    if (needReplay) {
      // Ada kejadian yang tiba terlambat: urutkan dan putar ulang dari titik simpan.
      entries.sort(entryOrder);
      base = replayFrom(snapBase, entries);
    }
    maybeSnapshot();
    notify();
  }

  /* ── Server penentu urutan (mode server) ────────────────────────── */

  function markOnline() {
    retryMs = RETRY_MS;
    if (online) return;
    online = true;
    problem = null;
    notify();
  }

  function markOffline() {
    if (online) {
      online = false;
      notify();
    }
    if (retryAt) return;
    retryAt = attempt(() => setTimeout(() => { retryAt = null; void sync(); }, retryMs)) ?? null;
    retryMs = Math.min(retryMs * 2, RETRY_MAX);
  }

  /**
   * Server memakai dunia lain (data direset di sana, atau perangkat ini baru pertama
   * menyambung) — perangkat mengikuti server. Antrean hanya dipertahankan pada kontak
   * pertama; kalau dunianya benar-benar berganti, aksi lama tidak dikirim ke dunia baru.
   */
  function adoptWorld(g: Genesis, keepOutbox = false) {
    for (const k of logKeys()) attempt(() => local?.removeItem(k));
    attempt(() => local?.removeItem(K_SNAPSHOT));
    genesis = { at: g.at, seed: g.seed !== false };
    write(K_GENESIS, genesis);
    snap = null;
    snapBase = replay(genesis, []);
    entries = [];
    ids = new Set();
    own = [];
    if (!keepOutbox) outbox = [];                   // aksi dari dunia lama tidak dikirim ulang
    head = 0;
    write(K_OUTBOX, outbox);
    write(K_HEAD, head);
    base = snapBase;
  }

  /** Ambil kejadian baru dari server. */
  async function pullOnce() {
    if (!remote) return;
    try {
      const res = await remote.pull(head);
      if (res.genesis.at !== genesis.at || res.genesis.seed !== genesis.seed) {
        // Kontak pertama (perangkat masih kosong) ≠ data direset di server.
        adoptWorld(res.genesis, head === 0 && entries.length === 0 && !snap);
      }
      markOnline();
      mergeIncoming(res.entries, true);
      notify();
    } catch {
      markOffline();
    }
  }

  /**
   * Kirim antrean satu per satu supaya urutannya terjaga dan satu aksi yang
   * ditolak tidak ikut menahan aksi lain.
   */
  async function flush() {
    if (!remote || sending) return;
    sending = true;
    try {
      while (outbox.length) {
        const p = outbox[0];
        let res;
        try {
          res = await remote.push([p]);
        } catch {
          markOffline();
          return;
        }
        if (res.ok) {
          outbox = outbox.filter((x) => x.id !== p.id);
          write(K_OUTBOX, outbox);
          markOnline();
          mergeIncoming(res.accepted, true);
          notify();
          terbitkanNanti();
        } else if (res.error === "ditolak") {
          // Tidak akan pernah diterima server: buang supaya antrean tidak macet.
          outbox = outbox.filter((x) => x.id !== p.id);
          write(K_OUTBOX, outbox);
          problem = res.message;
          markOnline();
          notify();
        } else {
          problem = res.message;                    // token PIN habis: antrean ditahan
          markOffline();
          return;
        }
      }
    } finally {
      sending = false;
    }
  }

  /** Satu putaran sinkronisasi: ambil yang baru, lalu kirim antrean. */
  async function sync() {
    if (!remote) return;
    await pullOnce();
    await flush();
    terbitkanNanti();
  }

  /**
   * Ringkasan untuk HP pelanggan diterbitkan dari perangkat staf: mesin hanya
   * hidup di perangkat, jadi perangkatlah yang menghitung potongan yang boleh
   * dibaca publik (tanpa nama, nomor HP, pesanan, atau angka uang tamu lain).
   */
  let terbitTimer: ReturnType<typeof setTimeout> | null = null;

  async function terbitkanSekarang() {
    if (terbitTimer) {
      attempt(() => clearTimeout(terbitTimer!));
      terbitTimer = null;
    }
    if (!remote?.publish || !remote.bersesi?.()) return;
    try {
      const kini = Date.now();
      const st = tickState(base, kini);
      const hariIni = businessDateOf(kini);
      const status = [
        ...st.sessions
          .filter((x) => x.bookingCode && (ACTIVE_STATUS.has(x.status) || businessDateOf(x.startsAt) === hariIni))
          .slice(0, 150)
          .map((x) => ({ code: x.bookingCode, kind: "sesi", session: x })),
        ...st.orders
          .filter((o) => o.code && businessDateOf(o.at) === hariIni)
          .slice(0, 150)
          .map((o) => ({ code: o.code, kind: "pesanan", order: o })),
      ];
      await remote.publish(publicVenue(st, kini), status, genesis.at);
      // Database pelanggan pemilik: satu baris per booking/pesanan yang punya nomor HP.
      const kunjungan = [
        ...st.sessions
          .filter((x) => x.phone && (x.status === "done" || ACTIVE_STATUS.has(x.status)))
          .slice(-200)
          .map((x) => ({
            ref: x.id, phone: rapikanHp(x.phone!), nama: x.guest, jenis: "booking",
            at: x.settledAt ?? x.startsAt,
            amount: (x.settledAmount ?? 0) + (x.paidOnline ?? 0),
          })),
        ...st.orders
          .filter((o) => o.phone && o.status === "diterima")
          .slice(-200)
          .map((o) => ({
            ref: o.id, phone: rapikanHp(o.phone!), nama: o.guest, jenis: "pesanan",
            at: o.at, amount: o.paidOnline || 0,
          })),
      ].filter((x) => x.phone.length >= 9);
      if (kunjungan.length) await remote.publishVisits?.(kunjungan);
    } catch { /* dicoba lagi pada perubahan berikutnya */ }
  }

  function terbitkanNanti() {
    if (!remote?.publish || !remote.bersesi?.() || terbitTimer) return;
    terbitTimer = attempt(() => setTimeout(async () => {
      terbitTimer = null;
      await terbitkanSekarang();
    }, 1_500)) ?? null;
  }

  function resync() {
    const g = read<Genesis>(K_GENESIS);
    if (g && g.at !== genesis.at) {
      own = [];                                     // tab lain mereset data simulasi
      loadAll();
      notify();
      return;
    }
    adoptNewerSnapshot();
    mergeIncoming(storedEntries());
  }

  /** Mengembalikan alasan kalau aksi ditahan (mis. terputus), atau null kalau diterima. */
  function dispatch(action: Action): string | null {
    if (action.t === "login") {
      me = action.emp;
      attempt(() => session?.setItem(K_ME, action.emp.id));
      notify();
      return null;
    }
    if (action.t === "logout") {
      me = null;
      attempt(() => session?.removeItem(K_ME));
      notify();
      return null;
    }
    if (action.t === "tick") { notify(); return null; }

    if (remote) {
      // Aksi uang ditahan saat terputus: tanpa penentu urutan, dua perangkat bisa
      // mencatat uang yang sama dua kali. Aksi pelayanan tetap boleh jalan.
      const block = offlineBlock(action, online);
      if (block) { problem = block; notify(); return block; }
      const p: Proposal = { id: `${origin}:${String(++n).padStart(6, "0")}`, act: action, by: me?.id ?? null };
      outbox.push(p);
      write(K_OUTBOX, outbox);
      notify();                                     // terlihat seketika, status "menunggu konfirmasi"
      void flush();
      return null;
    }

    // Data sudah direset di tab lain tapi siarannya terlewat: aksi ini dibuat dari
    // layar yang sudah basi. Muat dunia baru dan jangan tulis ulang jejak lama.
    const stored = read<Genesis>(K_GENESIS);
    if (stored && typeof stored.at === "number" && stored.at !== genesis.at) {
      own = [];
      loadAll();
      notify();
      return null;
    }

    // Waktu kejadian tidak boleh mundur dari kejadian terakhir yang sudah diketahui,
    // supaya kejadian baru selalu berada di ujung jejak.
    const last = entries[entries.length - 1] ?? (snap ? { at: snap.upto.at } : undefined);
    const now = Date.now();
    const at = last && last.at >= now ? last.at + 1 : now;
    const e: StoredEntry = { id: `${origin}:${String(++n).padStart(6, "0")}`, at, by: me?.id ?? null, act: action, g: genesis.at };
    entries.push(e);
    ids.add(e.id);
    own.push(e);
    base = applyEntry(base, e);

    const chunk = Math.floor((n - 1) / CHUNK);
    write(`${LOG_PREFIX}${origin}:${chunk}`, own.filter((x) => Math.floor((seqOf(x) - 1) / CHUNK) === chunk));
    attempt(() => channel?.postMessage({ type: "entry", genesisAt: genesis.at, entry: e }));
    maybeSnapshot();
    notify();
    return null;
  }

  function reset(seed: boolean) {
    for (const k of logKeys()) attempt(() => local?.removeItem(k));
    attempt(() => local?.removeItem(K_SNAPSHOT));
    outbox = [];
    head = 0;
    problem = null;
    write(K_OUTBOX, outbox);
    write(K_HEAD, head);
    genesis = { at: Date.now(), seed };
    write(K_GENESIS, genesis);
    snap = null;
    snapBase = replay(genesis, []);
    entries = [];
    ids = new Set();
    own = [];                                       // `n` sengaja tidak diulang: ID lama tidak dipakai lagi
    base = snapBase;
    attempt(() => channel?.postMessage({ type: "reset", genesisAt: genesis.at }));
    notify();
  }

  /* ── Menerima perubahan dari layar lain ─────────────────────────── */
  if (channel) {
    channel.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { type?: string; genesisAt?: number; entry?: unknown } | null;
      if (!msg || typeof msg !== "object") return;
      if (msg.genesisAt !== genesis.at) { resync(); return; }
      if (msg.type === "entry") mergeIncoming([msg.entry]);
    };
  }

  let pending: ReturnType<typeof setTimeout> | null = null;
  const scheduleResync = () => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; resync(); }, 60);
  };

  attempt(() => window.addEventListener("storage", (ev: StorageEvent) => {
    if (ev.key === null || ev.key === K_GENESIS || ev.key === K_SNAPSHOT) { scheduleResync(); return; }
    // Tanpa BroadcastChannel, event storage adalah satu-satunya jalur: cukup baca potongan yang berubah.
    if (!channel && ev.key.startsWith(LOG_PREFIX) && ev.newValue) {
      mergeIncoming(attempt(() => JSON.parse(ev.newValue!) as unknown[]) ?? []);
    }
  }));
  // Tab yang lama tertidur bisa melewatkan siaran — cocokkan ulang saat terlihat lagi.
  attempt(() => document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleResync();
  }));

  /* ── Mulai ──────────────────────────────────────────────────────── */
  const meId = attempt(() => session?.getItem(K_ME));
  me = EMPLOYEES.find((x) => x.id === meId && x.active) ?? null;
  loadAll();
  computeView();

  // Mode server: dengarkan siaran server, lalu ambil yang tertinggal & kirim antrean
  // yang masih menggantung dari sesi sebelumnya.
  let unsubscribe: (() => void) | null = null;
  if (remote) {
    unsubscribe = attempt(() => remote.subscribe((list) => {
      markOnline();
      mergeIncoming(list, true);
      notify();
    })) ?? null;
    void sync();
  }

  return {
    subscribe(l: Listener) {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },
    getView: () => view,
    dispatch,
    /** Hitung ulang tampilan (detak waktu) tanpa menyimpan apa pun. */
    refresh: notify,
    reset,
    /** Satu putaran sinkronisasi dengan server (mode lokal: tidak melakukan apa-apa). */
    sync,
    /** Terbitkan public_state seketika ke server tanpa menunggu timer. */
    terbitkanSekarang,
    /**
     * Masuk dengan PIN. Mode lokal: tidak melakukan apa-apa (PIN sudah
     * diperiksa layar). Mode server: PIN diperiksa SERVER dan menghasilkan
     * sesi 12 jam — tanpa sesi itu, jejak venue tidak bisa dibaca sama sekali.
     * Mengembalikan alasan kalau ditolak, atau null kalau berhasil.
     */
    async signIn(pin: string): Promise<string | null> {
      if (!remote?.login) return null;
      try {
        const hasil = await remote.login(pin);
        if (!hasil.ok) { problem = hasil.alasan; notify(); return hasil.alasan; }
        problem = null;
        await sync();
        notify();
        return null;
      } catch {
        markOffline();
        return "Tidak tersambung ke server — coba lagi setelah koneksi kembali.";
      }
    },
    /** Kirim kode masuk ke email staf (mode server saja). */
    kirimKodeEmail: (email: string) =>
      (remote?.kirimKodeEmail?.(email) ?? Promise.resolve("Mode lokal: masuk cukup dengan PIN.")),
    /**
     * Masuk dengan email + kode. Hasilnya sama dengan masuk lewat PIN: sesi
     * venue 12 jam, lalu jejak ditarik dari server.
     */
    async signInEmail(email: string, kode: string) {
      if (!remote?.loginEmail) return { ok: false as const, alasan: "Mode lokal: masuk cukup dengan PIN." };
      try {
        const hasil = await remote.loginEmail(email, kode);
        if (!hasil.ok) { problem = hasil.alasan; notify(); return hasil; }
        problem = null;
        await sync();
        notify();
        return hasil;
      } catch (e) {
        markOffline();
        return { ok: false as const, alasan: e instanceof Error ? e.message : "Tidak tersambung ke server." };
      }
    },
    /** Tautkan email ke akun staf (superadmin, mode server). */
    tautkanEmail: (staffId: string, email: string) =>
      (remote?.setStaffEmail?.(staffId, email) ?? Promise.resolve(null)),
    /**
     * Daftarkan akun staf ke SERVER (mode lokal: tidak perlu apa-apa).
     * Aturan bisnisnya sudah dijalankan mesin; ini hanya menyalin PIN-nya ke
     * server supaya staf itu bisa masuk dari perangkat lain.
     */
    simpanPinStaf: (emp: { id: string; name: string; role: string; pin?: string; active: boolean }) =>
      (remote?.saveStaff?.(emp) ?? Promise.resolve(null)),
    hapusPinStaf: (id: string) => (remote?.removeStaff?.(id) ?? Promise.resolve(null)),
    /** Daftar pelanggan (butuh sesi PIN). */
    pelanggan: (cari?: string) => (remote?.fetchCustomers?.(cari) ?? Promise.resolve([])),
    catatanPelanggan: (phone: string, catatan: string) => (remote?.setNote?.(phone, catatan) ?? Promise.resolve()),
    lupakanPelanggan: (phone: string) => (remote?.forget?.(phone) ?? Promise.resolve(0)),
    /** Daftar member yang mendaftar sendiri lewat aplikasi tamu (butuh sesi PIN). */
    member: (cari?: string) => (remote?.fetchMembers?.(cari) ?? Promise.resolve([])),
    resetPinMember: (phone: string) =>
      (remote?.resetMemberPin?.(phone) ?? Promise.resolve({ ok: false, alasan: "Butuh sambungan ke server venue." })),
    lupakanMember: (phone: string) => (remote?.forgetMember?.(phone) ?? Promise.resolve(0)),
    /** Absensi karyawan — butuh server: fotonya disimpan di sana, bukan di HP. */
    absenCatat: (jenis: "masuk" | "pulang", foto: string, catatan?: string) =>
      (remote?.absenCatat?.(jenis, foto, catatan) ??
        Promise.resolve({ ok: false as const, alasan: "Butuh sambungan ke server venue." })),
    absenDaftar: (hari?: number) => (remote?.absenDaftar?.(hari) ?? Promise.resolve([])),
    absenFoto: (id: number) => (remote?.absenFoto?.(id) ?? Promise.resolve(null)),
    /** Tutup buku stok harian. Tanpa server: kosong — layar jatuh ke hitungan
     *  langsung dari jejak perangkat ini, dan mengatakannya apa adanya. */
    stokAmbil: (dari: string, sampai: string) => (remote?.stokAmbil?.(dari, sampai) ?? Promise.resolve([])),
    /** Antrean pesan ke tamu. Tanpa sambungan server: kosong, layarnya bilang begitu. */
    pesanDaftar: (limit?: number) => (remote?.pesanDaftar?.(limit) ?? Promise.resolve([])),
    pesanTandai: (id: number, status: "terkirim" | "batal" | "antre") =>
      (remote?.pesanTandai?.(id, status) ?? Promise.resolve(false)),
    pesanBlast: (teks: string) => (remote?.pesanBlast?.(teks) ?? Promise.resolve(-2)),
    /** Kunci layar: sesi PIN di perangkat ini dilupakan. */
    signOut() {
      remote?.logout?.();
      notify();
    },
    /** Lepas langganan siaran server — dipakai saat halaman ditutup/diuji. */
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      if (retryAt) { attempt(() => clearTimeout(retryAt!)); retryAt = null; }
    },
    info(): SyncInfo {
      return {
        persisted: !!local && !storageError,
        live: channel ? "broadcast" : local ? "storage" : "none",
        mode: remote ? "server" : "lokal",
        online,
        pending: outbox.length,
        head,
        problem,
        entries: (snap?.count ?? 0) + entries.length,
        tail: entries.length,
        snapshotAt: snap?.upto.at ?? null,
        genesis,
        storageError,
      };
    },
  };
}

export type VenueStore = ReturnType<typeof createVenueStore>;

let singleton: VenueStore | null = null;
/**
 * Satu penyimpanan per halaman (StrictMode memasang komponen dua kali).
 * Kalau alamat Supabase disetel (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY),
 * aplikasi memakai jejak bersama di server; kalau tidak, tetap mode lokal.
 */
export function venueStore(): VenueStore {
  if (singleton) return singleton;
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
  // Build khusus HP pelanggan: tidak pernah menyentuh jejak venue sama sekali.
  if (env.VITE_MODE_TAMU && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    singleton = createCustomerStore({ url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY }) as unknown as VenueStore;
    return singleton;
  }
  return (singleton = createVenueStore({ remote: remoteFromEnv() ?? undefined }));
}
