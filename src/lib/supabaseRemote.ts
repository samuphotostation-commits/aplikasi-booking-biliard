/* ═══════════════════════════════════════════════════════════════════
   SAMBUNGAN KE SUPABASE — pelaksana kontrak `Remote` (tahap S2b)

   Pintu ke server hanya tiga, semuanya dijaga SESI PIN:
     staff_login(pin)                 → token (berlaku 12 jam)
     fetch_events(token, sejakSeq)    → jejak kejadian
     staff_action(token, id, aksi)    → menambah kejadian

   Yang penting:
   • Jejak venue TIDAK bisa dibaca dengan kunci publik saja. Di dalamnya
     ada nama & nomor HP tamu — hanya perangkat yang sudah memasukkan PIN
     benar yang boleh membacanya.
   • PELAKU kejadian diambil server dari sesi PIN, bukan dari isian
     perangkat: perangkat tidak bisa mengaku jadi pemilik.
   • Urutan (`seq`) dan JAM kejadian juga ditetapkan server.
   • Siaran seketika memakai tabel denyut `venue_pings` yang isinya hanya
     nomor urut — tanpa data tamu sedikit pun. Begitu denyut terdengar,
     perangkat menarik kejadian barunya lewat sesi PIN.
   ═══════════════════════════════════════════════════════════════════ */
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Genesis } from "./engine";
import type { Proposal, PullResult, PushResult, Remote, ServerEntry } from "./remote";

type Row = { seq: number; id: string; at_ms: number; by_staff: string | null; act: unknown };

const HALAMAN = 1000;
const K_TOKEN = "spl:v1:token";

const toEntry = (r: Row): ServerEntry => ({
  seq: Number(r.seq),
  id: r.id,
  at: Number(r.at_ms),
  by: r.by_staff,
  act: r.act as ServerEntry["act"],
});

/** Hasil masuk dengan PIN. */
export type LoginHasil =
  | { ok: true; staffId: string; nama: string; peran: "superadmin" | "karyawan" }
  | { ok: false; alasan: string };

export type StaffRemote = Remote & {
  client: SupabaseClient;
  /** Masuk dengan PIN staf; server yang memeriksa, bukan perangkat. */
  login(pin: string): Promise<LoginHasil>;
  /** Kirim kode 6 angka ke email staf. Mengembalikan alasan kalau gagal. */
  kirimKodeEmail(email: string): Promise<string | null>;
  /** Tukar kode email menjadi sesi venue 12 jam. */
  loginEmail(email: string, kode: string): Promise<LoginHasil>;
  /** Tautkan/lepas email sebuah akun staf (superadmin). */
  setStaffEmail(staffId: string, email: string): Promise<string | null>;
  /** Lupakan sesi (tombol Kunci). */
  logout(): void;
  /** Sudah punya sesi PIN yang masih berlaku? */
  bersesi(): boolean;
  /** Terbitkan ringkasan publik untuk HP pelanggan (tanpa data pribadi). */
  publish(ringkasan: unknown, status: unknown[], genesisAt: number): Promise<void>;
  /** Setor kunjungan ke database pelanggan pemilik (idempoten per ref). */
  publishVisits(rows: unknown[]): Promise<number>;
  /** Daftar pelanggan untuk panel staf. */
  fetchCustomers(cari?: string): Promise<Pelanggan[]>;
  setNote(phone: string, catatan: string): Promise<void>;
  forget(phone: string): Promise<number>;
  /** Daftar MEMBER (tamu yang mendaftar sendiri lewat aplikasi) untuk blast promo. */
  fetchMembers(cari?: string): Promise<MemberBaris[]>;
  /** Tamu lupa PIN: kasir memberi PIN sementara. */
  resetMemberPin(phone: string): Promise<{ ok: boolean; pin?: string; alasan?: string }>;
  forgetMember(phone: string): Promise<number>;
  /** Absensi karyawan: selfie + jam, identitas dari token PIN. */
  absenCatat(jenis: "masuk" | "pulang", foto: string, catatan?: string): Promise<AbsenHasil>;
  absenDaftar(hari?: number): Promise<AbsenBaris[]>;
  absenFoto(id: number): Promise<string | null>;
  /** Tutup buku stok harian yang sudah disimpan server — fakta, bukan
   *  rekaan mundur dari sisa hari ini. Kosong kalau belum ada yang ditutup. */
  stokAmbil(dari: string, sampai: string): Promise<StokHarianBaris[]>;
  /** Antrean pesan ke tamu — dipakai layar Pesan di panel kasir. */
  pesanDaftar(limit?: number): Promise<PesanBaris[]>;
  pesanTandai(id: number, status: "terkirim" | "batal" | "antre"): Promise<boolean>;
  /** Blast promo ke member yang menyetujui. -1 = bukan superadmin. */
  pesanBlast(teks: string): Promise<number>;
  /** Daftarkan/ubah PIN staf di server supaya berlaku di semua perangkat (superadmin). */
  saveStaff(emp: { id: string; name: string; role: string; pin?: string; active: boolean }): Promise<string | null>;
  removeStaff(id: string): Promise<string | null>;
};

/** Satu baris di tab Pelanggan. */
export type Pelanggan = {
  phone: string; nama: string; kunjungan: number; belanja: number;
  pertama_ms: number; terakhir_ms: number; catatan: string | null;
};

/** Satu baris daftar member — akun yang dibuat sendiri oleh tamu di aplikasi. */
export type MemberBaris = {
  phone: string; nama: string; email: string; setuju_promo: boolean;
  sejak_ms: number; terakhir_ms: number; kunjungan: number; belanja: number;
};

/** Satu catatan absen. Fotonya diambil terpisah lewat absenFoto (berat). */
export type AbsenBaris = {
  id: number; staff_id: string; nama: string;
  jenis: "masuk" | "pulang"; at_ms: number;
  catatan: string | null; ada_foto: boolean;
};

export type AbsenHasil =
  | { ok: true; id: number; nama: string; at: number }
  | { ok: false; alasan: string };

/** Satu baris antrean pesan ke tamu. Jam dalam milidetik epoch. */
/** Satu baris tutup buku stok harian yang sudah disimpan server. */
export type StokHarianBaris = {
  tanggal: string; item_id: string;
  awal: number | null; masuk: number; terjual: number; kembali: number;
  susut: number; opname: number; sisa: number | null; nilai_jual: number;
};

export type PesanBaris = {
  id: number; hp: string; nama: string | null; teks: string;
  jenis: "booking" | "pengingat" | "promo" | "manual";
  ref: string | null;
  status: "antre" | "terkirim" | "gagal" | "batal";
  galat: string | null; created_ms: number; sent_ms: number | null;
};

export type SupabaseRemoteOptions = { url: string; anonKey: string };

const simpanToken = (t: string | null) => {
  try {
    if (t) window.sessionStorage.setItem(K_TOKEN, t);
    else window.sessionStorage.removeItem(K_TOKEN);
  } catch { /* mode privat: sesi hanya di memori */ }
};
const bacaToken = () => {
  try { return window.sessionStorage.getItem(K_TOKEN); } catch { return null; }
};

export function supabaseRemote(opts: SupabaseRemoteOptions): StaffRemote {
  const client = createClient(opts.url, opts.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  let token: string | null = bacaToken();
  let genesis: Genesis = { at: 0, seed: false };
  let channel: RealtimeChannel | null = null;

  /** Jaringan gagal → dilempar (dicoba lagi). Sesi tidak sah → ditandai supaya staf diminta PIN. */
  const sesiHilang = (pesan: string) => /sesi tidak sah|42501|JWT|permission/i.test(pesan);

  async function dunia(): Promise<Genesis> {
    const { data, error } = await client.from("public_state").select("genesis_at").limit(1).single();
    if (error) throw new Error(error.message);
    genesis = { at: Number(data.genesis_at), seed: false };
    return genesis;
  }

  return {
    client,

    bersesi: () => !!token,

    async login(pin: string): Promise<LoginHasil> {
      const { data, error } = await client.rpc("staff_login", { p_pin: pin });
      if (error) throw new Error(error.message);
      const h = data as { ok: boolean; token?: string; staffId?: string; nama?: string; peran?: string; alasan?: string };
      if (!h?.ok || !h.token) return { ok: false, alasan: h?.alasan ?? "PIN ditolak server" };
      token = h.token;
      simpanToken(token);
      return { ok: true, staffId: h.staffId!, nama: h.nama!, peran: h.peran as "superadmin" | "karyawan" };
    },

    logout() {
      token = null;
      simpanToken(null);
      void client.auth.signOut().catch(() => { /* tidak apa-apa: sesi email hanya di memori */ });
    },

    /**
     * Kode 6 angka dikirim HANYA ke email yang sudah ditautkan superadmin ke
     * akun staf — supaya pintu ini tidak bisa dipakai mengirimi email siapa pun.
     */
    async kirimKodeEmail(email: string) {
      const bersih = email.trim().toLowerCase();
      const { data, error } = await client.rpc("email_staf_terdaftar", { p_email: bersih });
      if (error) return error.message;
      if (data !== true) return "Email ini belum ditautkan ke akun staf. Minta superadmin menautkannya di tab Atur.";
      const { error: kirim } = await client.auth.signInWithOtp({
        email: bersih, options: { shouldCreateUser: true },
      });
      return kirim ? kirim.message : null;
    },

    async loginEmail(email: string, kode: string): Promise<LoginHasil> {
      const { error } = await client.auth.verifyOtp({
        email: email.trim().toLowerCase(), token: kode.trim(), type: "email",
      });
      if (error) return { ok: false, alasan: /expired|invalid/i.test(error.message) ? "Kode salah atau sudah kedaluwarsa." : error.message };
      const { data, error: e2 } = await client.rpc("staff_login_email");
      if (e2) return { ok: false, alasan: e2.message };
      const h = data as { ok: boolean; token?: string; staffId?: string; nama?: string; peran?: string; alasan?: string };
      if (!h?.ok || !h.token) return { ok: false, alasan: h?.alasan ?? "Email ditolak server" };
      token = h.token;
      simpanToken(token);
      return { ok: true, staffId: h.staffId!, nama: h.nama!, peran: h.peran as "superadmin" | "karyawan" };
    },

    async setStaffEmail(staffId: string, email: string) {
      if (!token) return "Belum masuk dengan PIN.";
      const { error } = await client.rpc("set_staff_email", { p_token: token, p_id: staffId, p_email: email });
      return error ? error.message : null;
    },

    async pull(sinceSeq: number): Promise<PullResult> {
      const g = await dunia();
      if (!token) return { genesis: g, entries: [], head: sinceSeq };   // belum masuk PIN
      const entries: ServerEntry[] = [];
      let from = sinceSeq;
      for (;;) {
        const { data, error } = await client.rpc("fetch_events", { p_token: token, p_since: from, p_limit: HALAMAN });
        if (error) {
          if (sesiHilang(error.message)) { token = null; simpanToken(null); return { genesis: g, entries: [], head: sinceSeq }; }
          throw new Error(error.message);
        }
        const rows = (data ?? []) as Row[];
        for (const r of rows) entries.push(toEntry(r));
        if (rows.length < HALAMAN) break;
        from = Number(rows[rows.length - 1].seq);
      }
      const head = entries.length ? entries[entries.length - 1].seq : sinceSeq;
      return { genesis: g, entries, head };
    },

    async push(items: Proposal[]): Promise<PushResult> {
      if (!token) return { ok: false, error: "kedaluwarsa", message: "Sesi PIN habis — masukkan PIN lagi." };
      const accepted: ServerEntry[] = [];
      for (const p of items) {
        const { data, error } = await client.rpc("staff_action", { p_token: token, p_id: p.id, p_act: p.act });
        if (error) {
          if (sesiHilang(error.message)) {
            token = null; simpanToken(null);
            return { ok: false, error: "kedaluwarsa", message: "Sesi PIN habis — masukkan PIN lagi." };
          }
          if (/tidak sah|terlalu besar|22023/i.test(error.message)) {
            return { ok: false, error: "ditolak", message: `Server menolak aksi ${p.act?.t}: ${error.message}` };
          }
          throw new Error(error.message);                    // gangguan jaringan: dicoba lagi
        }
        const row = (Array.isArray(data) ? data[0] : data) as Row | null;
        if (!row) return { ok: false, error: "ditolak", message: `Aksi ${p.act?.t} tidak diterima server.` };
        accepted.push(toEntry(row));
      }
      return { ok: true, accepted };
    },

    async publish(ringkasan: unknown, status: unknown[], genesisAt: number) {
      // Token sesi PIN ikut dikirim: server hanya menerima ringkasan dari perangkat staf.
      const { error } = await client.rpc("publish_public_state", {
        p_state: ringkasan, p_status: status, p_genesis: genesisAt || null, p_token: token,
      });
      if (error) throw new Error(error.message);
    },

    async publishVisits(rows: unknown[]) {
      if (!token || !rows.length) return 0;
      const { data, error } = await client.rpc("publish_visits", { p_token: token, p_rows: rows });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },

    async fetchCustomers(cari?: string) {
      if (!token) return [];
      const { data, error } = await client.rpc("fetch_customers", { p_token: token, p_cari: cari ?? null, p_limit: 300 });
      if (error) throw new Error(error.message);
      return (data ?? []) as Pelanggan[];
    },

    async fetchMembers(cari?: string) {
      if (!token) return [];
      const { data, error } = await client.rpc("fetch_members", { p_token: token, p_cari: cari ?? null, p_limit: 1000 });
      if (error) throw new Error(error.message);
      return (data ?? []) as MemberBaris[];
    },

    async resetMemberPin(phone: string) {
      if (!token) return { ok: false, alasan: "Belum masuk dengan PIN." };
      const { data, error } = await client.rpc("member_reset_pin", { p_token: token, p_hp: phone });
      if (error) return { ok: false, alasan: error.message };
      const r = data as { ok?: boolean; pin?: string; alasan?: string };
      return r?.ok ? { ok: true, pin: r.pin } : { ok: false, alasan: r?.alasan ?? "Reset PIN gagal" };
    },

    /* ── Absensi karyawan ─────────────────────────────────────────── */

    /** Siapa yang absen ditentukan SERVER dari token — tidak bisa dipalsukan layar. */
    async absenCatat(jenis: "masuk" | "pulang", foto: string, catatan?: string) {
      if (!token) return { ok: false, alasan: "Belum masuk dengan PIN." };
      const { data, error } = await client.rpc("absen_catat", {
        p_token: token, p_jenis: jenis, p_foto: foto, p_catatan: catatan ?? null,
      });
      if (error) return { ok: false, alasan: error.message };
      return (data ?? { ok: false, alasan: "server tidak menjawab" }) as AbsenHasil;
    },

    async absenDaftar(hari = 14) {
      if (!token) return [];
      const { data, error } = await client.rpc("absen_daftar", { p_token: token, p_hari: hari });
      if (error) throw new Error(error.message);
      return (data ?? []) as AbsenBaris[];
    },

    async absenFoto(id: number) {
      if (!token) return null;
      const { data, error } = await client.rpc("absen_foto", { p_token: token, p_id: id });
      if (error) return null;
      return (data as string | null) ?? null;
    },

    /* ── Antrean pesan ke tamu (WhatsApp) ─────────────────────────── */

    /** Tutup buku stok harian (fakta hari lampau, dihitung server). */
    async stokAmbil(dari: string, sampai: string) {
      if (!token) return [];
      const { data, error } = await client.rpc("stok_ambil", { p_token: token, p_dari: dari, p_sampai: sampai });
      if (error) throw new Error(error.message);
      return (data ?? []) as StokHarianBaris[];
    },

    async pesanDaftar(limit = 100) {
      if (!token) return [];
      const { data, error } = await client.rpc("pesan_daftar", { p_token: token, p_limit: limit });
      if (error) throw new Error(error.message);
      return (data ?? []) as PesanBaris[];
    },

    async pesanTandai(id: number, status: "terkirim" | "batal" | "antre") {
      if (!token) return false;
      const { data, error } = await client.rpc("pesan_tandai", { p_token: token, p_id: id, p_status: status });
      if (error) throw new Error(error.message);
      return data === true;
    },

    /** Kirim ke SEMUA member yang menyetujui promo. -1 = bukan superadmin. */
    async pesanBlast(teks: string) {
      if (!token) return -1;
      const { data, error } = await client.rpc("pesan_blast", { p_token: token, p_teks: teks });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },

    async forgetMember(phone: string) {
      if (!token) return 0;
      const { data, error } = await client.rpc("forget_member", { p_token: token, p_hp: phone });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },

    async setNote(phone: string, catatan: string) {
      if (!token) return;
      const { error } = await client.rpc("set_customer_note", { p_token: token, p_phone: phone, p_catatan: catatan });
      if (error) throw new Error(error.message);
    },

    async forget(phone: string) {
      if (!token) return 0;
      const { data, error } = await client.rpc("forget_customer", { p_token: token, p_phone: phone });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },

    /** null = berhasil; selain itu alasan penolakan server (untuk ditampilkan apa adanya). */
    async saveStaff(emp) {
      if (!token) return "Belum masuk dengan PIN.";
      const { error } = await client.rpc("upsert_staff", {
        p_token: token, p_id: emp.id, p_nama: emp.name, p_peran: emp.role,
        p_pin: emp.pin ?? null, p_aktif: emp.active,
      });
      return error ? error.message : null;
    },

    async removeStaff(id: string) {
      if (!token) return "Belum masuk dengan PIN.";
      const { error } = await client.rpc("delete_staff", { p_token: token, p_id: id });
      return error ? error.message : null;
    },

    /** Denyut dari server (tanpa data) → tarik kejadian barunya lewat sesi PIN. */
    subscribe(cb: (entries: ServerEntry[]) => void) {
      channel?.unsubscribe();
      let sibuk = false;
      let terakhir = 0;
      const tarik = async () => {
        if (sibuk || !token) return;
        sibuk = true;
        try {
          const { data, error } = await client.rpc("fetch_events", { p_token: token, p_since: terakhir, p_limit: HALAMAN });
          if (!error && data) {
            const rows = data as Row[];
            if (rows.length) {
              terakhir = Number(rows[rows.length - 1].seq);
              cb(rows.map(toEntry));
            }
          }
        } catch { /* jaringan: detak berikutnya mencoba lagi */ } finally { sibuk = false; }
      };
      channel = client
        .channel("venue_pings")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "venue_pings" }, () => { void tarik(); })
        .subscribe();
      return () => { channel?.unsubscribe(); channel = null; };
    },
  };
}

/**
 * Sambungan dari variabel lingkungan. Tanpa `VITE_SUPABASE_URL` +
 * `VITE_SUPABASE_ANON_KEY`, aplikasi tetap jalan dalam mode lokal
 * (data hanya di perangkat ini) — persis seperti sebelumnya.
 */
export function remoteFromEnv(): StaffRemote | null {
  // Di luar Vite (mis. saat uji otomatis di Node) `import.meta.env` tidak ada — itu mode lokal.
  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return supabaseRemote({ url, anonKey });
}
