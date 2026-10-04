/* ═══════════════════════════════════════════════════════════════════
   MODE HP PELANGGAN (VITE_MODE_TAMU=1)

   Build ini dipakai pelanggan. Bedanya dengan aplikasi staf:

   • TIDAK pernah membaca jejak venue. Yang dibaca hanya RINGKASAN PUBLIK
     (`public_state`) yang diterbitkan perangkat staf: meja terpakai jam
     berapa, tarif, harga menu, promo, apa yang habis. Tidak ada nama,
     nomor HP, kode, atau angka uang tamu lain di dalamnya.
   • Hanya boleh mengirim tiga aksi pelanggan (pesan QR bayar di kasir,
     tahan slot, batal tahan) lewat `guest_action`. Server menolak aksi
     kasir/uang dari pintu ini.
   • Status pesanan/booking miliknya sendiri diambil per KODE lewat
     `guest_status` — kode hanya dipegang tamu itu dan kasir.

   Layar pelanggan tidak perlu diubah: dari ringkasan publik disusun
   State tiruan dengan bentuk yang sama, jadi Beranda/Booking/Menu
   bekerja seperti biasa.
   ═══════════════════════════════════════════════════════════════════ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EMPLOYEES, type Employee } from "../data/staff";
import { applyAction, init, tickState, type Action, type Entry, type Genesis, type State } from "./engine";
import { sesiDariSlot, type PublicVenue } from "./publicView";
import { tokenMember, riwayatMember } from "./member";
import { EVENT_GANTI_AKUN, kodeTersimpan, simpanKode } from "./jejakTamu";
import type { SyncInfo } from "./venueStore";
import type { LiveSession } from "../data/live";

type Listener = () => void;
// Kunci & perintah lupakan dipegang jejakTamu.ts (dipakai member.ts juga).
/** Ringkasan publik ditarik ulang sesering ini (dan setiap layar kembali terlihat). */
const JEDA_MS = 20_000;

/** Aksi yang boleh dikirim HP pelanggan — sama dengan daftar di server. */
const AKSI_TAMU = new Set<Action["t"]>(["hold", "releaseHold", "guestOrder", "reserveResto"]);



/** Susun State tiruan dari ringkasan publik: cukup untuk layar pelanggan. */
function stateDariRingkasan(pv: Partial<PublicVenue>, genesis: Genesis, milikSaya: unknown[]): State {
  const kosong = init({ seed: false });
  const sessions: LiveSession[] = sesiDariSlot(pv.slots ?? []);
  // Booking/pesanan milik tamu ini (dari guest_status) ditempelkan supaya layar
  // "Pesanan Saya" bisa menampilkannya.
  const punyaSaya = milikSaya.filter(Boolean) as { kind?: string; session?: LiveSession; order?: unknown }[];
  const sesiSaya = punyaSaya.filter((x) => x.kind === "sesi" && x.session).map((x) => x.session!) as LiveSession[];
  const pesananSaya = punyaSaya.filter((x) => x.kind === "pesanan" && x.order).map((x) => x.order) as State["orders"];

  return {
    ...kosong,
    sessions: [...sessions.filter((s) => !sesiSaya.some((m) => m.tableId === s.tableId && m.startsAt === s.startsAt)), ...sesiSaya],
    orders: pesananSaya ?? [],
    rates: pv.rates ?? kosong.rates,
    tableTypes: pv.tableTypes ?? {},
    menuPrices: pv.menuPrices ?? {},
    promos: pv.promos ?? [],
    soldOut: pv.soldOut ?? [],
    shift: null,
    me: null,
    employees: [] as Employee[],
  };
}

export function createCustomerStore(opts: { url: string; anonKey: string }) {
  const client: SupabaseClient = createClient(opts.url, opts.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let genesis: Genesis = { at: 0, seed: false };
  let ringkasan: Partial<PublicVenue> = {};
  let milikSaya: unknown[] = [];
  let online = false;
  let problem: string | null = null;
  let pending = 0;
  let view: State = stateDariRingkasan({}, genesis, []);
  const listeners = new Set<Listener>();

  /**
   * Aksi milik tamu INI yang sudah diterima server tapi belum muncul di
   * ringkasan publik. Ringkasan hanya terbit ulang beberapa detik sekali (dan
   * dulu hanya kalau ada perangkat staf online), jadi tanpa lapisan ini hold
   * yang BERHASIL terlihat "hilang" pada penyegaran berikutnya dan tamu
   * mendapat pesan "slot baru saja diambil orang lain" — padahal mejanya
   * sudah tertahan untuk dia.
   */
  const sendiri: { e: Entry; sampai: number }[] = [];
  const UMUR_SENDIRI_MS = 3 * 60_000;

  const hitung = () => {
    const kini = Date.now();
    for (let i = sendiri.length - 1; i >= 0; i--) if (sendiri[i].sampai < kini) sendiri.splice(i, 1);
    let st = stateDariRingkasan(ringkasan, genesis, milikSaya);
    for (const { e } of sendiri) {
      // Kalau ringkasan sudah memuatnya, aksinya ditolak mesin (idempoten) dan
      // state tidak berubah — jadi aman diputar ulang berkali-kali.
      st = applyAction(st, e);
    }
    view = { ...tickState(st, kini), me: null };
  };
  const notify = () => { hitung(); listeners.forEach((l) => l()); };

  async function tarikRingkasan() {
    try {
      const { data, error } = await client.from("public_state").select("genesis_at, data").limit(1).single();
      if (error) throw new Error(error.message);
      genesis = { at: Number(data.genesis_at), seed: false };
      ringkasan = (data.data ?? {}) as Partial<PublicVenue>;
      online = true;
      problem = null;
    } catch {
      online = false;
    }
    notify();
  }

  async function tarikStatus() {
    let kode = kodeTersimpan();
    const hasil: unknown[] = [];
    const kodeSudahAda = new Set<string>();

    if (tokenMember()) {
      try {
        const dariMember = await riwayatMember();
        if (dariMember.length > 0) {
          const kodeMember = dariMember.map((x) => x.code).filter(Boolean);
          const gabung = Array.from(new Set([...kode, ...kodeMember]));
          simpanKode(gabung);
          kode = gabung;
          for (const item of dariMember) {
            if (item.status && typeof item.status === "object") {
              hasil.push(item.status);
              kodeSudahAda.add(item.code);
            }
          }
        }
      } catch { /* jaringan: fallback ke kode lokal */ }
    }

    // KODE DI PERANGKAT hanya dipakai kalau TIDAK ada member yang masuk.
    // `guest_status` cuma butuh kodenya — siapa pun yang memegang kode itu dapat
    // datanya. Kode sisa pemilik perangkat sebelumnya karena itu tidak boleh ikut
    // ditanyakan selama ada akun yang masuk; yang berlaku hanya daftar resmi akun.
    if (tokenMember()) { milikSaya = hasil; notify(); return; }

    if (!kode.length) {
      if (hasil.length > 0) { milikSaya = hasil; notify(); }
      return;
    }

    for (const k of kode) {
      if (kodeSudahAda.has(k)) continue;
      try {
        const { data } = await client.rpc("guest_status", { p_code: k });
        if (data) hasil.push(data);
      } catch { /* jaringan: dicoba lagi nanti */ }
    }
    milikSaya = hasil;
    notify();
  }

  async function sync() {
    await tarikRingkasan();
    await tarikStatus();
  }

  /** Kirim aksi pelanggan. Aksi lain diabaikan diam-diam (layar staf tidak ada di build ini). */
  function dispatch(action: Action): string | null {
    if (action.t === "login" || action.t === "logout" || action.t === "tick") { notify(); return null; }
    if (!AKSI_TAMU.has(action.t)) return "Aksi ini hanya bisa dilakukan kasir.";

    // Kode milik tamu ini disimpan supaya statusnya bisa dilacak.
    //
    // TERMASUK BOOKING MEJA (`hold`). Dulu tidak: kodenya tidak pernah
    // tersimpan, jadi `guest_status` tidak pernah ditanyakan untuk booking itu,
    // dan HP tamu tidak pernah tahu bookingnya SUDAH jadi. Akibatnya layar bayar
    // menggantung di "mengecek pembayaran" padahal uangnya sudah masuk dan
    // mejanya sudah tercatat — dan sesudah 3 menit (lapisan sementara habis)
    // hold-nya seolah lenyap dan tamu diberi tahu "slot diambil orang lain".
    const kode = action.t === "guestOrder" ? action.order.code
      : action.t === "reserveResto" ? action.res.code
      : action.t === "hold" ? action.session.bookingCode
      : undefined;
    if (kode) simpanKode([...kodeTersimpan(), kode]);

    // Pesanan QR menempel ke meja, bukan ke id sesi: id sesi di ringkasan publik
    // sengaja bukan id sebenarnya, jadi biarkan mesin venue yang mencocokkan meja.
    const bersih: Action = action.t === "guestOrder"
      ? {
          ...action,
          order: {
            ...action.order,
            sessionId: undefined,
            pay: action.order.pay === "online" ? "online" : "kasir",
            paidOnline: action.order.pay === "online" ? (action.order.paidOnline ?? 0) : 0,
          },
        }
      : action;

    pending++;
    notify();
    void (async () => {
      const id = `tamu:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
      try {
        // Token member ikut dikirim: server memakai nama & nomor HP yang TERDAFTAR
        // (tidak bisa dipalsukan dari layar), dan booking tanpa member ditolak.
        const { error } = await client.rpc("guest_action", { p_id: id, p_act: bersih, p_member: tokenMember() ?? "" });
        if (error) { problem = error.message; online = true; }
        else { problem = null; online = true; }
      } catch {
        online = false;
        problem = "Tidak tersambung — coba lagi setelah sinyal kembali.";
      } finally {
        pending--;
        notify();
        setTimeout(() => void sync(), 1200);           // tunggu papan kasir menerbitkan ulang
      }
    })();
    return null;
  }

  // Tampilan sementara: aksi tamu langsung terlihat di layarnya sendiri, dan
  // TETAP terlihat sampai ringkasan publik menyusul (lihat `sendiri`).
  function terapkanSementara(action: Action) {
    const e: Entry = { id: `sementara:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, at: Date.now(), by: null, act: action };
    sendiri.push({ e, sampai: Date.now() + UMUR_SENDIRI_MS });
    notify();
  }

  void sync();
  const iv = setInterval(() => void sync(), JEDA_MS);
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void sync();
    });
    // Akun berganti (masuk/keluar): lupakan booking pemilik sebelumnya SEKARANG,
    // jangan tunggu penyegaran berikutnya — kalau tidak, sekejap layar orang baru
    // masih menampilkan booking orang lama.
    window.addEventListener(EVENT_GANTI_AKUN, () => {
      milikSaya = [];
      sendiri.length = 0;
      hitung();
      notify();
      void sync();
    });
  } catch { /* di luar browser */ }

  return {
    subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
    getView: () => view,
    dispatch(action: Action) {
      const alasan = dispatch(action);
      if (!alasan && AKSI_TAMU.has(action.t)) terapkanSementara(action);
      return alasan;
    },
    refresh: notify,
    reset: () => { /* pelanggan tidak boleh mereset data venue */ },
    sync,
    terbitkanSekarang: async () => {},
    signIn: async () => "Panel staf tidak tersedia di aplikasi pelanggan.",
    signOut: () => {},
    stop: () => clearInterval(iv),
    info(): SyncInfo {
      return {
        persisted: false,
        live: "none",
        mode: "server",
        online,
        pending,
        head: 0,
        problem,
        entries: 0,
        tail: 0,
        snapshotAt: null,
        genesis,
        storageError: null,
      };
    },
  };
}

/** Daftar kode milik tamu ini (dipakai layar "Pesanan Saya"). */
export const kodeSaya = kodeTersimpan;
export { catatKode } from "./jejakTamu";
export const semuaPegawai = EMPLOYEES;
