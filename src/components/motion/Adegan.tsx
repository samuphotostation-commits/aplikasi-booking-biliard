/**
 * Potongan gerak kecil untuk isi bab: judul, label, dan kemunculan.
 *
 * Perpindahan antar-bab ada di `Perjalanan.tsx`. Yang di sini hanya bergerak
 * sekali saat tergulir ke layar, jadi tidak ikut memberati scroll.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** HP kelas bawah, mode hemat data, atau pengguna meminta gerak dikurangi. */
export function perangkatLemah(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const kurangi = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return kurangi || !!n.connection?.saveData || (n.deviceMemory ?? 8) <= 2 || (n.hardwareConcurrency ?? 8) <= 2;
}

export function Muncul({ i = 0, className = "", children }: { i?: number; className?: string; children: ReactNode }) {
  const kurangi = useReducedMotion();
  return (
    <motion.div className={className}
      initial={{ opacity: 0, y: kurangi ? 0 : 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ delay: 0.07 * i, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

/**
 * Judul yang naik dari balik garis, baris demi baris.
 *
 * Pemicunya di `h2`, bukan di barisnya: baris yang masih tersembunyi di balik
 * `overflow-hidden` tidak pernah dianggap terlihat oleh peramban.
 */
export function Judul({ baris, className = "" }: { baris: string[]; className?: string }) {
  const kurangi = useReducedMotion();
  return (
    <motion.h2 aria-label={baris.join(" ")} initial="sembunyi" whileInView="tampil"
      viewport={{ once: true, margin: "-8% 0px" }}
      className={`font-serif font-bold leading-[1.02] tracking-[-0.018em] text-cream ${className}`}>
      {baris.map((b, i) => (
        <span key={b} aria-hidden className="block overflow-hidden pb-[.1em]">
          <motion.span className="block"
            variants={{ sembunyi: { y: kurangi ? 0 : "112%" }, tampil: { y: 0 } }}
            transition={{ delay: i * 0.1, duration: 1, ease: [0.16, 1, 0.3, 1] }}>
            {b}
          </motion.span>
        </span>
      ))}
    </motion.h2>
  );
}

const HURUF = "0123456789ABCDEFGHKLMNPRSTUV";

/** Label pendek yang tersusun dari huruf acak. Khusus label Emoland yang pendek. */
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
    <span ref={ref} aria-label={teks} className={`font-display text-[11px] uppercase tracking-[0.24em] ${className}`}>
      <span aria-hidden>{isi}</span>
    </span>
  );
}
