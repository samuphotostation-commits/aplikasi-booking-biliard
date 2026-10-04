/* ═══════════════════════════════════════════════════════════════════
   LAPISAN KIRIM KEJADIAN KE SERVER (tahap S1 — kontraknya saja)

   Server TIDAK menulis ulang aturan bisnis. Tugasnya tiga:

   1. Penentu urutan — setiap kejadian diberi nomor `seq` dan JAM SERVER,
      jadi tablet yang jamnya salah tidak mengacaukan meteran atau no-show.
   2. Penjaga pintu   — pelaku (`by`) diambil dari token PIN, bukan dari
      isian perangkat; bentuk aksi divalidasi sebelum masuk jejak.
   3. Penyiar         — kejadian yang masuk dikirim ke semua perangkat staf.

   Aturan mainnya tetap di `engine.ts`: semua perangkat memutar jejak yang
   sama dan pasti sampai pada hasil yang sama.

   Berkas ini hanya kontrak + aturan yang dipakai bersama. Pelaksananya:
   server tiruan di `test/fakeServer.ts` (S1) dan Supabase (S2).
   ═══════════════════════════════════════════════════════════════════ */
import type { Action, Entry, Genesis } from "./engine";

/**
 * Aksi yang diusulkan perangkat. `id` unik per perangkat — kirim ulang tidak dobel.
 * `by` hanya catatan lokal supaya tampilan sementara memakai pelaku yang benar;
 * server MENGABAIKANNYA dan memakai pemilik token PIN.
 */
export type Proposal = { id: string; act: Action; by?: string | null };

/** Kejadian yang sudah diberi urutan & jam oleh server. */
export type ServerEntry = Entry & { seq: number };

export type PullResult = { genesis: Genesis; entries: ServerEntry[]; head: number };

export type PushError =
  | "jaringan"      // tidak tersambung / server tidak menjawab — boleh dicoba lagi
  | "ditolak"       // bentuk aksi tidak sah, atau perangkat tidak berhak
  | "kedaluwarsa";  // token PIN habis — staf harus memasukkan PIN lagi

export type PushResult =
  | { ok: true; accepted: ServerEntry[] }
  | { ok: false; error: PushError; message: string };

export type Remote = {
  /** Ambil kejadian sesudah `sinceSeq`. Dipakai saat aplikasi dibuka & setelah terputus. */
  pull(sinceSeq: number): Promise<PullResult>;
  /** Kirim aksi. Server yang menetapkan urutan, jam, dan pelaku. */
  push(items: Proposal[]): Promise<PushResult>;
  /** Kejadian dari perangkat lain (Realtime). Mengembalikan fungsi berhenti. */
  subscribe(cb: (entries: ServerEntry[]) => void): () => void;
};

/**
 * Aksi yang memindahkan uang atau menutup catatan keuangan. Saat internet
 * putus, aksi ini DIKUNCI sampai tersambung lagi (PRD sinkronisasi, keputusan 2):
 * kalau dikerjakan dua perangkat sekaligus tanpa penentu urutan, uangnya bisa
 * tercatat dua kali. Aksi pelayanan (buka meja, pesan makanan, check-in,
 * lampu) tetap boleh jalan dan menyusul terkirim.
 *
 * `openShift` sengaja TIDAK dikunci: mencatat modal laci tidak memindahkan
 * uang, dan tanpanya venue sama sekali tidak bisa beroperasi saat internet
 * mati di jam buka. Shift kedua tetap diabaikan mesin di semua perangkat.
 */
export const MONEY_ACTIONS = new Set<Action["t"]>(["settle", "closeShift", "decideVoid", "settleRefund"]);

export const isMoneyAction = (a: Action) => MONEY_ACTIONS.has(a.t);

/** Alasan aksi ditahan saat terputus — null berarti boleh jalan. */
export function offlineBlock(a: Action, online: boolean): string | null {
  if (online || !isMoneyAction(a)) return null;
  return "Tidak tersambung ke server — aksi uang ditahan sampai koneksi kembali.";
}
