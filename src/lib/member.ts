/* ═══════════════════════════════════════════════════════════════════
   AKUN MEMBER TAMU

   Permintaan pemilik: sebelum booking diproses, tamu harus daftar atau
   masuk, supaya datanya menjadi milik venue (untuk blast promo nanti).

   • Akun hanya bisa dibuat lewat Google, jadi emailnya pasti asli.
   • Nomor HP wajib diisi sekali sesudah Google (Google tidak memberikannya).
   • Token sesi 30 hari disimpan di HP tamu.
   • Tanpa server (mode lokal/uji) semua fungsi menjawab `tersedia: false`
     dan layar kembali ke formulir nama/HP seperti sebelumnya.

   Pintunya ada di supabase/schema-member.sql — tabel `members` hanya bisa
   dibaca perangkat staf, tidak pernah oleh HP pelanggan lain.
   ═══════════════════════════════════════════════════════════════════ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lupakanJejakTamu } from "./jejakTamu";
import { simpanProfil } from "./profilTamu";
import type { LiveSession } from "../data/live";
import type { GuestOrder } from "./engine";

export type Member = {
  hp: string; nama: string; email: string; setuju: boolean; sejak: number;
  /** TTTT-BB-HH, kosong untuk member lama yang belum mengisi. */
  lahir: string;
  domisili: string;
};
export type DataDaftar = { hp: string; lahir: string; domisili: string };
export type HasilMember = { ok: true; member: Member } | { ok: false; alasan: string };

const K_TOKEN = "spl:v1:member";
// Dibaca lewat penjaga: berkas ini ikut terbundel di uji Node yang tidak punya
// import.meta.env sama sekali.
const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
const URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;

/** Akun member hanya ada kalau aplikasi tersambung ke server venue. */
export const memberMungkin = (): boolean => !!(URL && KEY);

let klien: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (!memberMungkin()) return null;
  // persistSession WAJIB hidup: masuk dengan Google keluar dari aplikasi dulu
  // (ke halaman Google) lalu kembali — sesinya harus selamat menyeberangi itu.
  // storageKey dibedakan supaya tidak bertabrakan dengan sesi email panel staf.
  klien ??= createClient(URL!, KEY!, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
      flowType: "pkce",
      storageKey: "spl-member-auth",
    },
  });
  return klien;
}

/**
 * Kembali ke halaman yang sedang dibuka, supaya tamu yang login di tengah
 * checkout tidak terlempar. Halamannya harus ada di Redirect URLs Supabase.
 */
const alamatKembali = (): string => window.location.origin + window.location.pathname;

/** Buka layar pilih akun Google. Aplikasi akan kembali sendiri ke halaman Akun. */
export async function masukDenganGoogle(): Promise<{ ok: boolean; alasan?: string }> {
  const c = sb();
  if (!c) return { ok: false, alasan: "Masuk Google butuh sambungan ke server venue." };
  try {
    const { error } = await c.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: alamatKembali(), queryParams: { prompt: "select_account" } },
    });
    if (error) return { ok: false, alasan: error.message };
    return { ok: true };
  } catch (e) { return { ok: false, alasan: galat(e) }; }
}

export type HasilStafGoogle =
  | { ok: true; token: string; staffId: string; nama: string; peran: string; nip?: string; venue?: "spl" | "smh" | null }
  | { ok: false; alasan: string };

/**
 * Staf yang baru kembali dari Google: tukar sesinya jadi sesi venue 12 jam.
 * null = tidak ada sesi Google. Sesi Google selalu dibuang sesudahnya, supaya
 * orang berikutnya di perangkat kasir memilih akunnya sendiri.
 */
export async function selesaikanGoogleStaf(): Promise<HasilStafGoogle | null> {
  const c = sb();
  if (!c || !(await adaSesiGoogle())) return null;
  try {
    const { data, error } = await c.rpc("staff_login_email");
    if (error) return { ok: false, alasan: error.message };
    const r = data as { ok?: boolean; alasan?: string; token?: string; staffId?: string; nama?: string; peran?: string; nip?: string; venue?: "spl" | "smh" | null };
    if (!r?.ok || !r.token) return { ok: false, alasan: r?.alasan ?? "Masuk dengan Google gagal" };
    return { ok: true, token: r.token, staffId: r.staffId!, nama: r.nama!, peran: r.peran!, nip: r.nip, venue: r.venue };
  } catch (e) {
    return { ok: false, alasan: galat(e) };
  } finally {
    try { await c.auth.signOut(); } catch { /* sesi lokal tetap dilupakan */ }
  }
}

/** Sedang ada sesi Google yang belum ditukar jadi member? */
export async function adaSesiGoogle(): Promise<boolean> {
  const c = sb();
  if (!c) return false;
  try { return !!(await c.auth.getSession()).data.session; } catch { return false; }
}

export type HasilGoogle =
  | { ok: true; member: Member }
  | { ok: false; perluHp: true; nama: string; email: string }
  | { ok: false; alasan: string };

/**
 * Tukar sesi Google menjadi akun member SPL. Panggilan pertama bisa menjawab
 * `perluHp`: nomor HP, tanggal lahir, dan domisili tidak ada di akun Google.
 */
export async function selesaikanGoogle(d?: DataDaftar): Promise<HasilGoogle> {
  const c = sb();
  if (!c) return { ok: false, alasan: "Butuh sambungan ke server venue." };
  try {
    const { data, error } = await c.rpc("member_google", {
      p_hp: d?.hp ?? null, p_lahir: d?.lahir ?? null, p_domisili: d?.domisili ?? null,
    });
    if (error) return { ok: false, alasan: error.message };
    const r = data as { ok?: boolean; perluHp?: boolean; alasan?: string; token?: string; profil?: unknown; nama?: string; email?: string };
    if (r?.perluHp) return { ok: false, perluHp: true, nama: r.nama ?? "", email: r.email ?? "" };
    const m = bacaProfilServer(r?.profil);
    if (!r?.ok || !r.token || !m) return { ok: false, alasan: r?.alasan ?? "Masuk dengan Google gagal" };
    simpanToken(r.token);
    return { ok: true, member: pakai(m) };
  } catch (e) { return { ok: false, alasan: galat(e) }; }
}

export function tokenMember(): string | null {
  try { return window.localStorage.getItem(K_TOKEN); } catch { return null; }
}
function simpanToken(t: string | null) {
  // Token berganti = pemilik perangkat berganti (masuk, daftar, lewat Google,
  // atau keluar). Riwayat milik akun sebelumnya HARUS dibuang di sini — kalau
  // tidak, orang berikutnya yang masuk di HP yang sama melihat booking orang lain.
  let lama: string | null = null;
  try { lama = window.localStorage.getItem(K_TOKEN); } catch { /* mode privat */ }
  try {
    if (t) window.localStorage.setItem(K_TOKEN, t);
    else window.localStorage.removeItem(K_TOKEN);
  } catch { /* mode privat: cukup untuk sesi ini */ }
  if (lama !== t) lupakanJejakTamu();
}

const bacaProfilServer = (x: unknown): Member | null => {
  const p = x as Partial<Member> | null;
  if (!p || typeof p.hp !== "string") return null;
  return {
    hp: p.hp,
    nama: typeof p.nama === "string" ? p.nama : "",
    email: typeof p.email === "string" ? p.email : "",
    setuju: p.setuju === true,
    sejak: typeof p.sejak === "number" ? p.sejak : 0,
    lahir: typeof p.lahir === "string" ? p.lahir : "",
    domisili: typeof p.domisili === "string" ? p.domisili : "",
  };
};

/** Profil disalin ke profil HP supaya formulir lain ikut terisi. */
function pakai(m: Member) {
  simpanProfil({ nama: m.nama, hp: m.hp, email: m.email, setuju: m.setuju });
  return m;
}

const galat = (e: unknown): string => {
  const pesan = e instanceof Error ? e.message : String(e);
  return /fetch|network|Failed/i.test(pesan) ? "Tidak tersambung — coba lagi setelah sinyal kembali." : pesan;
};

/** Siapa yang sedang masuk di HP ini? null = belum masuk / sesi habis. */
export async function memberSaya(): Promise<Member | null> {
  const c = sb();
  const t = tokenMember();
  if (!c || !t) return null;
  try {
    const { data, error } = await c.rpc("member_saya", { p_token: t });
    if (error) return null;
    const m = bacaProfilServer(data);
    if (!m) { simpanToken(null); return null; }
    return pakai(m);
  } catch { return null; }
}

export async function ubahMember(p: { nama?: string; setuju?: boolean; lahir?: string; domisili?: string }): Promise<HasilMember> {
  const c = sb();
  const t = tokenMember();
  if (!c || !t) return { ok: false, alasan: "Silakan masuk dulu." };
  try {
    const { data, error } = await c.rpc("member_ubah", {
      p_token: t,
      p_nama: p.nama ?? null,
      p_setuju: p.setuju ?? null,
      p_lahir: p.lahir || null,
      p_domisili: p.domisili || null,
    });
    if (error) return { ok: false, alasan: error.message };
    const r = data as { ok?: boolean; alasan?: string; profil?: unknown };
    const m = bacaProfilServer(r?.profil);
    if (!r?.ok || !m) return { ok: false, alasan: r?.alasan ?? "Perubahan gagal disimpan" };
    return { ok: true, member: pakai(m) };
  } catch (e) { return { ok: false, alasan: galat(e) }; }
}

export async function keluarMember(): Promise<void> {
  const c = sb();
  const t = tokenMember();
  simpanToken(null);
  if (!c) return;
  try { await c.auth.signOut(); } catch { /* tidak ada sesi Google */ }
  if (!t) return;
  try { await c.rpc("member_keluar", { p_token: t }); } catch { /* token lokal sudah dibuang */ }
}

export type RiwayatMemberItem = {
  code: string;
  refId: string;
  kind: "booking" | "pesanan";
  createdAt: number;
  status?: {
    code?: string;
    kind?: string;
    session?: LiveSession;
    order?: GuestOrder;
  } | null;
};

/**
 * Riwayat booking dan pesanan yang melekat pada akun member yang sedang login.
 * Mengembalikan array kosong jika belum login atau belum tersambung ke server venue.
 */
export async function riwayatMember(): Promise<RiwayatMemberItem[]> {
  const c = sb();
  const t = tokenMember();
  if (!c || !t) return [];
  try {
    const { data, error } = await c.rpc("member_bookings", { p_token: t });
    if (error || !Array.isArray(data)) return [];
    return data as RiwayatMemberItem[];
  } catch {
    return [];
  }
}

