/**
 * ADEGAN — bahasa gerak halaman venue.
 *
 * Diadaptasi dari cara igloo.inc berpindah bagian: tiap bagian tidak berhenti
 * lalu berganti, melainkan bergeser mundur dan redup sementara bagian berikutnya
 * naik menutupinya. Bedanya, scroll bawaan peramban TIDAK dibajak: tombol kembali,
 * pencarian halaman, pembaca layar, dan gulir HP tetap bekerja seperti biasa.
 *
 * Semua gerakan hanya `transform` dan `opacity`, dan mati saat pengguna meminta
 * gerak dikurangi atau perangkatnya lemah.
 */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";

export const Panggung3D = lazy(() => import("./Panggung3D"));

/** HP kelas bawah atau mode hemat data: pakai gerak sederhana. */
export function perangkatLemah(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return !!n.connection?.saveData || (n.deviceMemory ?? 8) <= 2 || (n.hardwareConcurrency ?? 8) <= 2;
}

export function useGerakPenuh(): boolean {
  const kurangi = useReducedMotion();
  const [lemah] = useState(perangkatLemah);
  return !kurangi && !lemah;
}

/** Satu bagian halaman. Saat bagian berikutnya naik, yang ini mundur dan meredup. */
export function Adegan({ id, urut, className = "", children, terakhir }: {
  id?: string; urut: number; className?: string; children: ReactNode; terakhir?: boolean;
}) {
  const penuh = useGerakPenuh();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["end end", "end start"] });
  const y = useTransform(p, [0, 1], ["0vh", "86vh"]);
  const skala = useTransform(p, [0, 1], [1, 0.93]);
  const redup = useTransform(p, [0, 1], [0, 0.72]);
  const gerak = penuh && !terakhir;

  return (
    <section id={id} ref={ref} className="relative overflow-clip" style={{ zIndex: urut }}>
      <motion.div style={gerak ? { y, scale: skala } : undefined} className={`origin-bottom ${className}`}>
        {children}
      </motion.div>
      {gerak && <motion.div aria-hidden style={{ opacity: redup }} className="pointer-events-none absolute inset-0 bg-ink" />}
    </section>
  );
}

/** Tepi atas bagian yang naik menutupi bagian sebelumnya. */
export const TEPI_NAIK = "rounded-t-[28px] sm:rounded-t-[40px] shadow-[0_-24px_60px_rgba(0,0,0,.55)]";

/** Muncul saat tergulir ke layar. */
export function Muncul({ i = 0, className = "", children }: { i?: number; className?: string; children: ReactNode }) {
  const kurangi = useReducedMotion();
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y: kurangi ? 0 : 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay: 0.06 * i, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/**
 * Judul yang naik dari balik garis, baris demi baris.
 *
 * Pemicunya di `h2`, bukan di barisnya: baris yang masih tersembunyi di balik
 * `overflow-hidden` tidak pernah dianggap terlihat oleh peramban, jadi kalau
 * dipicu dari sana judulnya tidak akan pernah muncul.
 */
export function Judul({ baris, className = "" }: { baris: string[]; className?: string }) {
  const kurangi = useReducedMotion();
  return (
    <motion.h2 aria-label={baris.join(" ")} initial="sembunyi" whileInView="tampil"
      viewport={{ once: true, margin: "-40px" }}
      className={`font-serif font-bold leading-[1.04] tracking-[-0.015em] text-cream ${className}`}>
      {baris.map((b, i) => (
        <span key={b} aria-hidden className="block overflow-hidden pb-[.08em]">
          <motion.span className="block"
            variants={{ sembunyi: { y: kurangi ? 0 : "108%" }, tampil: { y: 0 } }}
            transition={{ delay: i * 0.09, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}>
            {b}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  );
}

const HURUF = "0123456789ABCDEFGHKLMNPRSTUV";

/** Label pendek yang "tersusun" dari huruf acak, untuk label Emoland saja. */
export function LabelSandi({ teks, className = "" }: { teks: string; className?: string }) {
  const kurangi = useReducedMotion();
  const [isi, setIsi] = useState(teks);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (kurangi || !el) return;
    let t: ReturnType<typeof setInterval>;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      let langkah = 0;
      t = setInterval(() => {
        langkah += 1;
        setIsi([...teks].map((h, i) =>
          h === " " || i < langkah / 2 ? h : HURUF[Math.floor(Math.random() * HURUF.length)]).join(""));
        if (langkah / 2 >= teks.length) { clearInterval(t); setIsi(teks); }
      }, 28);
    }, { rootMargin: "-40px" });
    io.observe(el);
    return () => { io.disconnect(); clearInterval(t); };
  }, [teks, kurangi]);

  return (
    <span ref={ref} aria-label={teks} className={`font-display text-[11px] uppercase tracking-[0.22em] ${className}`}>
      <span aria-hidden>{isi}</span>
    </span>
  );
}

/** Scroll turun, foto bergeser ke samping. Di perangkat lemah jadi geser biasa. */
export function GaleriGeser({ foto, urut, kepala, warna = "bg-ink" }: {
  foto: { src: string; alt: string }[]; urut: number; kepala: ReactNode; warna?: string;
}) {
  const penuh = useGerakPenuh();
  const jalur = useRef<HTMLDivElement>(null);
  const baris = useRef<HTMLDivElement>(null);
  const [jarak, setJarak] = useState(0);
  const { scrollYProgress: p } = useScroll({ target: jalur, offset: ["start start", "end end"] });
  const halus = useSpring(p, { stiffness: 120, damping: 30, mass: 0.3 });
  const x = useTransform(halus, [0, 1], [0, -jarak]);

  useEffect(() => {
    const b = baris.current;
    if (!b) return;
    const ukur = () => setJarak(Math.max(0, b.scrollWidth - window.innerWidth + 32));
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(b);
    return () => ro.disconnect();
  }, []);

  if (!penuh) {
    return (
      <section className={`relative ${warna} ${TEPI_NAIK} py-14`} style={{ zIndex: urut }}>
        <div className="mx-auto max-w-6xl px-5">{kepala}</div>
        <div className="no-bar mt-7 flex snap-x gap-3 overflow-x-auto px-5">
          {foto.map((f) => (
            <img key={f.src} src={f.src} alt={f.alt} loading="lazy"
              className="aspect-[4/3] h-64 w-auto max-w-none shrink-0 snap-start rounded-2xl object-cover" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={jalur} className="relative" style={{ zIndex: urut, height: `calc(100svh + ${jarak}px)` }}>
      <div className={`sticky top-0 flex h-svh flex-col justify-center overflow-hidden ${warna} ${TEPI_NAIK}`}>
        <div className="mx-auto w-full max-w-6xl px-5">{kepala}</div>
        <motion.div ref={baris} style={{ x }} className="mt-7 flex w-max gap-3 px-5 sm:gap-4">
          {foto.map((f) => (
            <img key={f.src} src={f.src} alt={f.alt} loading="lazy"
              className="aspect-[4/3] h-[46svh] w-auto max-w-none rounded-2xl border border-line object-cover" />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/** Kemajuan baca: bola berjalan di atas garis tipis di tepi atas halaman. */
export function GarisMaju({ warna }: { warna: string }) {
  const { scrollYProgress } = useScroll();
  const halus = useSpring(scrollYProgress, { stiffness: 160, damping: 30, mass: 0.3 });
  const kiri = useTransform(halus, [0, 1], ["0%", "100%"]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]">
      <motion.div className={`h-full origin-left ${warna}`} style={{ scaleX: halus }} />
      <motion.span className={`absolute -top-[3px] -ml-1 h-2 w-2 rounded-full ${warna}`} style={{ left: kiri }} />
    </div>
  );
}

/** Bola 3D dengan cadangan 2D. Dipisah supaya pemanggil cukup memberi nilai putar. */
export function Bola3D({ putar, cadangan, className = "" }: {
  putar: MotionValue<number>; cadangan: ReactNode; className?: string;
}) {
  const penuh = useGerakPenuh();
  const [gagal, setGagal] = useState(false);
  if (!penuh || gagal) return <>{cadangan}</>;
  return (
    <Suspense fallback={cadangan}>
      <Panggung3D jenis="bola" nilai={putar} className={className} onGagal={() => setGagal(true)} />
    </Suspense>
  );
}

/** Asap dan bara; di perangkat lemah cukup gradasi hangat. */
export function Asap3D({ kuat, className = "" }: { kuat: MotionValue<number>; className?: string }) {
  const penuh = useGerakPenuh();
  const [gagal, setGagal] = useState(false);
  if (!penuh || gagal) {
    return <div aria-hidden className={`bg-gradient-to-t from-brick/40 via-transparent to-transparent ${className}`} />;
  }
  return (
    <Suspense fallback={null}>
      <Panggung3D jenis="asap" nilai={kuat} className={className} onGagal={() => setGagal(true)} />
    </Suspense>
  );
}
