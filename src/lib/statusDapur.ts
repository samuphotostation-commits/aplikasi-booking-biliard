/**
 * SATU KOSAKATA & SATU KODE WARNA UNTUK STATUS PESANAN DAPUR.
 *
 * Dipakai layar Dapur dan kartu meja di Papan. Sebelum berkas ini ada,
 * keduanya menuliskan sendiri kalimat dan warnanya: layar Dapur memakai empat
 * status, sementara kartu meja cuma mengenal dua keadaan ("porsi di dapur"
 * dan "siap diantar"). Kasir yang melihat Papan tidak bisa membedakan pesanan
 * yang BARU MASUK dari yang SEDANG DIMASAK — padahal itu beda antara "dapur
 * belum lihat" dan "tinggal tunggu".
 *
 * ── KENAPA LABEL DAN TOMBOL DIPISAH ────────────────────────────────────
 *
 * Sampai 28 Okt 2026 keduanya satu daftar, dan isinya BERGESER SATU LANGKAH:
 * kartu berstatus `new` menampilkan tulisan "ORDERAN DITERIMA" sebagai
 * keadaannya DAN "Orderan diterima" di tombolnya. Juru masak melihat kartu
 * yang mengaku sudah diterima, dengan tombol yang memintanya menerima lagi —
 * ditekan, tulisannya berubah jadi "Proses", lalu tombolnya berbunyi
 * "Proses" juga. Setiap kartu selalu terlihat seperti tidak bereaksi.
 *
 * Sekarang: `label` menjawab "ini sedang di mana", `aksi` menjawab "kalau
 * ditekan, jadi apa". Kosakatanya tetap kosakata pemilik (revisi 18 Okt
 * 2026) — yang diperbaiki penempatannya, bukan kata-katanya.
 */
import type { Ticket } from "../data/live";

export type StatusTiket = Ticket["status"];

export const STATUS_DAPUR: Record<StatusTiket, {
  /** Keadaan sekarang — lencana di kartu layar Dapur, yang kartunya lebar. */
  label: string;
  /** Versi pendek untuk kartu meja di Papan: lebarnya cuma ~90 px, dan label
   *  panjang di sana terpotong jadi "1 PORSI …" yang tidak memberi tahu apa pun. */
  pendek: string;
  /** Tulisan tombol: apa yang TERJADI kalau ditekan. Kosong = tidak ada lagi. */
  aksi?: string;
  /** Status sesudah tombolnya ditekan. */
  next?: StatusTiket;
  /** Warna teks, titik, dan bingkai kartu — satu kode untuk dua layar. */
  teks: string;
  titik: string;
  bingkai: string;
}> = {
  // Kuning: masuk, belum disentuh siapa pun di dapur.
  new: {
    label: "Baru masuk", pendek: "Baru", aksi: "Orderan diterima", next: "preparing",
    teks: "text-amber", titik: "bg-amber", bingkai: "border-amber/60 bg-amber/10",
  },
  // Hijau: dapur sudah melihat dan sedang mengerjakan.
  preparing: {
    label: "Dimasak", pendek: "Dimasak", aksi: "Orderan ready", next: "ready",
    teks: "text-emerald-300", titik: "bg-emerald-400", bingkai: "border-emerald-500/50 bg-emerald-500/10",
  },
  // Biru: matang. Sejak detik ini yang ditunggu kaki pramusaji, bukan dapur.
  ready: {
    label: "Siap diantar", pendek: "Siap antar", aksi: "Sudah diantar", next: "served",
    teks: "text-blue-300", titik: "bg-blue-400", bingkai: "border-blue-400/50 bg-blue-400/10",
  },
  // Abu: sudah sampai di meja. Tidak ada tombol lagi.
  served: {
    label: "Sudah diantar", pendek: "Diantar",
    teks: "text-dim", titik: "bg-dim", bingkai: "border-line bg-ink-2",
  },
};

/**
 * Urutan MENDESAK, bukan urutan alur.
 *
 * Yang sudah matang didahulukan: ia menunggu kaki pramusaji dan makin lama
 * makin dingin, sementara yang masih dimasak menunggu dapur yang memang
 * sedang bekerja. Dipakai kartu meja yang cuma muat satu-dua baris.
 */
export const URUT_MENDESAK: StatusTiket[] = ["ready", "new", "preparing", "served"];

/**
 * Sejak kapan tiket berada di status SEKARANG.
 *
 * Bukan `at` untuk semuanya: `at` adalah jam masuk kasir, jadi tiket yang
 * sudah matang akan terus menghitung seolah dapur masih mengerjakannya.
 * Yang berguna di layar adalah lama ia tertahan di keadaan sekarang —
 * itu yang menjawab "kenapa belum diantar".
 *
 * Jamnya dicatat mesin saat kejadiannya (lihat aksi `ticket` di engine.ts),
 * jadi dua perangkat yang membuka layar ini membaca angka yang sama.
 */
export const mulaiStatus = (t: Ticket): number =>
  t.status === "ready" || t.status === "served"
    ? (t.readyAt ?? t.terimaAt ?? t.at)
    : t.status === "preparing"
      ? (t.terimaAt ?? t.at)
      : t.at;

/** Menit sejak `ms`, tidak pernah negatif (jam perangkat bisa mundur). */
export const menitSejak = (ms: number, now = Date.now()) =>
  Math.max(0, Math.round((now - ms) / 60_000));

/** "7m" · "1j 05m" — cukup pendek untuk muat di kartu meja. */
export function lamaSingkat(menit: number): string {
  if (menit < 60) return `${menit}m`;
  return `${Math.floor(menit / 60)}j ${String(menit % 60).padStart(2, "0")}m`;
}
