/**
 * PERJALANAN — satu dunia, kamera yang berjalan.
 *
 * Diadaptasi dari igloo.inc: halaman tidak digulir, kameranya yang maju. Dunianya
 * tetap di belakang, dan tiap bab datang dari kejauhan, berhenti sebentar di depan
 * mata, lalu lewat melampaui kamera. Scroll hanya mengendalikan posisi kamera.
 *
 * Bab harus muat satu layar, karena itulah yang membuatnya bisa diperlakukan seperti
 * benda. Isi yang panjang (tanya jawab, lokasi) ada di `ekor`, yang digulir biasa
 * sesudah perjalanan selesai.
 *
 * Perangkat lemah dan pengguna yang meminta gerak dikurangi mendapat bab-bab yang
 * tersusun biasa dari atas ke bawah.
 */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Ball } from "./Billiard";
import { perangkatLemah } from "./Adegan";
import { aturBola, bola, halus, nyalakanGulir, padaBingkai } from "../../lib/jamPanggung";

const Panggung3D = lazy(() => import("./Panggung3D"));

/** Jarak gulir satu bab. */
const PER_BAB = 1.15;

/** Bab masuk dari jauh, diam sebentar, lalu lewat melampaui kamera. */
function gerakBab(t: number): { skala: number; tampak: number } {
  if (t < -0.2) {
    const k = halus((t + 1) / 0.8);
    return { skala: 0.58 + 0.42 * k, tampak: k * k };
  }
  if (t < 0.28) return { skala: 1 + (t + 0.2) * 0.04, tampak: 1 };
  const k = (t - 0.28) / 0.6;
  return { skala: 1.02 + k * k * 1.1, tampak: Math.max(0, 1 - k * 1.5) };
}

export function Perjalanan({ tema, id, bab, ekor, fotoAwal, gelap }: {
  tema: "sport" | "smokehouse";
  /** Penanda bab untuk tautan bilah atas, urut sesuai `bab`. */
  id?: (string | undefined)[];
  bab: ReactNode[];
  ekor: ReactNode;
  /** Foto pintu gerbang, supaya masuknya menyambung. */
  fotoAwal?: string;
  gelap: string;
}) {
  const jalur = useRef<HTMLDivElement>(null);
  const lapis = useRef<(HTMLDivElement | null)[]>([]);
  const garis = useRef<HTMLDivElement>(null);
  const maju = useMotionValue(0);
  const [lemah] = useState(perangkatLemah);
  const [gagal, setGagal] = useState(false);
  const jumlah = bab.length;
  const sport = tema === "sport";

  useEffect(() => {
    if (lemah) return;
    const matikan = nyalakanGulir();
    bola.sumbu = [1, 0, 0];
    let panjang = 1, layar = 1, hp = false;
    const ukur = () => {
      layar = window.innerHeight;
      panjang = Math.max(1, (jalur.current?.offsetHeight ?? 1) - layar);
      hp = window.innerWidth < 768;
    };
    ukur();
    window.addEventListener("resize", ukur);

    let y = window.scrollY;
    const lepas = padaBingkai(() => {
      y += (window.scrollY - y) * 0.16;
      const p = Math.min(1, Math.max(0, y / panjang));
      // 10% terakhir milik bola: semua bab sudah lewat saat ia menuju lubang.
      const posisi = Math.min(1, p / 0.9) * (jumlah - 1 + 0.9);
      for (let i = 0; i < jumlah; i++) {
        const el = lapis.current[i];
        if (!el) continue;
        const t = posisi - i;
        const lihat = i === 0 ? t < 0.95 : t > -1 && t < 0.95;
        if (!lihat) { el.style.visibility = "hidden"; continue; }
        const { skala, tampak } = i === 0 && t < 0 ? { skala: 1, tampak: 1 } : gerakBab(t);
        el.style.visibility = "visible";
        el.style.opacity = String(tampak);
        el.style.transform = `scale(${skala})`;
        el.style.pointerEvents = tampak > 0.7 ? "auto" : "none";
      }
      maju.set(Math.min(1, p / 0.9));
      if (garis.current) garis.current.style.transform = `scaleX(${p})`;

      if (sport) {
        // Bola menahan posisinya selama kamera mengikuti, lalu lepas ke lubang.
        const lepasBola = halus((p - 0.9) / 0.09);
        const s = (hp ? 0.34 : 0.24) * (1 - lepasBola * 0.66);
        aturBola({ x: 50, y: 83 - lepasBola * 33, s, o: 1 - halus((p - 0.985) / 0.015) }, 0.2);
        bola.sudut = -y * 0.012;
      }
    });
    return () => { lepas(); matikan(); window.removeEventListener("resize", ukur); };
  }, [jumlah, lemah, maju, sport]);

  if (lemah) {
    return (
      <div style={{ background: gelap }}>
        {bab.map((b, i) => <section key={i} id={id?.[i]} className="flex min-h-svh items-center py-20">{b}</section>)}
        {ekor}
      </div>
    );
  }

  return (
    <div style={{ background: gelap }}>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        {!gagal && (
          <Suspense fallback={null}>
            <Panggung3D jenis={sport ? "meja" : "lorong"} nilai={maju} onGagal={() => setGagal(true)} />
          </Suspense>
        )}
      </div>

      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]">
        <div ref={garis} className={`h-full origin-left ${sport ? "bg-amber" : "bg-cream"}`} style={{ transform: "scaleX(0)" }} />
      </div>

      <div ref={jalur} className="relative" style={{ height: `${(jumlah + 0.6) * PER_BAB * 100}svh` }}>
        {id?.map((n, i) => n && (
          <span key={n} id={n} className="absolute" style={{ top: `${(i / (jumlah - 0.1)) * 100}%` }} />
        ))}
        <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
          {bab.map((b, i) => (
            <div key={i} ref={(n) => { lapis.current[i] = n; }}
              style={{ visibility: i === 0 ? "visible" : "hidden", pointerEvents: i === 0 ? "auto" : "none" }}
              className="absolute inset-0 flex items-center justify-center will-change-transform">
              {b}
            </div>
          ))}
        </div>
      </div>

      {fotoAwal && (
        <motion.img src={fotoAwal} alt="" aria-hidden initial={{ opacity: 1 }} animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="pointer-events-none fixed inset-0 z-[12] h-full w-full object-cover" />
      )}

      <div className="relative z-20" style={{ background: gelap }}>{ekor}</div>
    </div>
  );
}

/** Foto di dalam bingkai: tampil utuh di HP, tidak dipaksa memenuhi layar. */
export function Bingkai({ src, alt, rasio = "aspect-[4/3]", className = "" }: {
  src?: string; alt: string; rasio?: string; className?: string;
}) {
  return (
    <figure className={`overflow-hidden rounded-2xl border border-cream/15 shadow-[0_24px_70px_rgba(0,0,0,.6)] ${rasio} ${className}`}>
      {src && <img src={src} alt={alt} className="h-full w-full object-cover" />}
    </figure>
  );
}

/** Ekor halaman: digulir biasa sesudah perjalanan selesai. */
export function BabTeks({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return <section id={id} className={`relative flex w-full ${className}`}>{children}</section>;
}

const RUTE_BOLA = ["/", "/sport", "/smokehouse"];
const UKURAN = 520;

/** Bola yang sama dari gerbang sampai halaman Sport. */
export function BolaBersama() {
  const { pathname } = useLocation();
  const kotak = useRef<HTMLDivElement>(null);
  const putar = useMotionValue(0);
  const [lemah] = useState(perangkatLemah);
  const [gagal, setGagal] = useState(false);
  const tampil = RUTE_BOLA.includes(pathname);

  useEffect(() => {
    if (!tampil) return;
    const p = { ...bola.tujuan };
    return padaBingkai(() => {
      const t = bola.tujuan, k = bola.tarikan;
      const dx = (t.x - p.x) * k;
      p.x += dx; p.y += (t.y - p.y) * k; p.s += (t.s - p.s) * k; p.o += (t.o - p.o) * Math.max(k, 0.12);
      if (Math.abs(dx) > 0.001 && bola.sumbu[1] === 1) bola.sudut += dx * 0.09;
      putar.set(bola.sudut);
      const el = kotak.current;
      if (el) {
        el.style.opacity = String(p.o);
        el.style.visibility = p.o < 0.01 ? "hidden" : "visible";
        el.style.transform = `translate3d(calc(${p.x}vw - 50%), calc(${p.y}svh - 50%), 0) scale(${p.s})`;
      }
    });
  }, [tampil, putar]);

  if (!tampil) return null;
  return (
    <div ref={kotak} aria-hidden style={{ width: `min(70vmin, ${UKURAN}px)`, height: `min(70vmin, ${UKURAN}px)`, opacity: 0 }}
      className="pointer-events-none fixed left-0 top-0 z-[11] will-change-transform">
      {lemah || gagal ? <Ball n={8} size={UKURAN} color="#0B0B0C" /> : (
        <Suspense fallback={null}>
          <Panggung3D jenis="bola" nilai={putar} onGagal={() => setGagal(true)} />
        </Suspense>
      )}
    </div>
  );
}
