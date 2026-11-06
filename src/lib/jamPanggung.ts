/**
 * JAM PANGGUNG — satu detak untuk semua gerakan halaman depan dan venue.
 *
 * Patah-patah versi sebelumnya datang dari banyak hitungan yang berjalan sendiri:
 * tiap bagian punya pegas dan pendengar scroll-nya masing-masing, jadi bola,
 * foto, dan teks tidak pernah bergerak di bingkai yang sama. Sekarang hanya ada
 * satu `requestAnimationFrame`: Lenis menghaluskan scroll, lalu semua pendengar
 * membaca nilai yang sama di bingkai yang sama.
 *
 * Lenis tidak membajak scroll: posisi tetap posisi browser, jadi tombol kembali,
 * pencarian, dan pembaca layar tetap bekerja.
 */
import Lenis from "lenis";

type Pendengar = (ms: number) => void;

const pendengar = new Set<Pendengar>();
let lenis: Lenis | null = null;
let jalan = 0;

function detak(ms: number) {
  jalan = requestAnimationFrame(detak);
  lenis?.raf(ms);
  for (const f of pendengar) f(ms);
}

/** Pasang pendengar tiap bingkai. Mengembalikan fungsi pelepasnya. */
export function padaBingkai(f: Pendengar): () => void {
  pendengar.add(f);
  if (!jalan) jalan = requestAnimationFrame(detak);
  return () => {
    pendengar.delete(f);
    if (pendengar.size === 0) { cancelAnimationFrame(jalan); jalan = 0; }
  };
}

/** Scroll roda yang halus. Di layar sentuh gulir bawaan HP tetap dipakai. */
export function nyalakanGulir(): () => void {
  if (lenis) return () => {};
  const l = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, anchors: { offset: -64 } });
  lenis = l;
  return () => { l.destroy(); if (lenis === l) lenis = null; };
}

export function keAtas() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}

/* ── Bola bersama ──────────────────────────────────────────────────
   Satu bola untuk gerbang dan halaman Sport, bukan dua bola di dua halaman.
   Halaman hanya menyebut tujuannya; `BolaBersama` yang menggelindingkannya ke
   sana, jadi berpindah halaman tidak memutus gerakannya. */

export type TitikBola = { x: number; y: number; s: number; o: number };

export const bola: { tujuan: TitikBola; tarikan: number } = {
  tujuan: { x: -24, y: 50, s: 0.4, o: 0 },
  tarikan: 0.08,
};

export const aturBola = (t: Partial<TitikBola>, tarikan = 0.09) => {
  bola.tujuan = { ...bola.tujuan, ...t };
  bola.tarikan = tarikan;
};

export const halus = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
