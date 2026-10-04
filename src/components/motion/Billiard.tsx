import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════
   Motion graphic bertema biliar.
   Semuanya SVG + framer-motion, tanpa aset video, dan menghormati
   prefers-reduced-motion (PRD §9.6).
   ═══════════════════════════════════════════════════════════════════ */

const BALL_COLORS = ["#F0A202", "#992212", "#1F6F4A", "#2B4C9B", "#D98F02", "#7A2E8C", "#0B0B0C"];

/* ── Bola tunggal dengan kilau & nomor ──────────────────────────── */
export function Ball({
  n, size = 28, color = "#0B0B0C", className = "",
}: { n?: number; size?: number; color?: string; className?: string }) {
  const light = color === "#0B0B0C" || color === "#992212" || color === "#2B4C9B" || color === "#7A2E8C";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`g${n ?? "x"}${color.slice(1)}`} cx="35%" cy="28%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".55" />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor="#000" stopOpacity=".55" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#g${n ?? "x"}${color.slice(1)})`} />
      {n !== undefined && (
        <>
          <circle cx="20" cy="20" r="9.5" fill={light ? "#FDF0DC" : "#FDF0DC"} />
          <text
            x="20" y="20" textAnchor="middle" dominantBaseline="central"
            fontSize="11" fontWeight="700" fill="#0B0B0C"
            fontFamily="Georgia, serif"
          >{n}</text>
        </>
      )}
      <ellipse cx="14" cy="12" rx="5" ry="3.4" fill="#fff" opacity=".35" transform="rotate(-28 14 12)" />
    </svg>
  );
}

/* ── Intro: stik memukul rak, bola berhamburan, logo muncul ─────── */
export function BreakIntro({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();

  // 1,2 detik, bukan 2,3. Pembuka ini tampil TIAP kali aplikasi dibuka (ditandai
  // di sessionStorage), dan jatuh tepat saat peramban sedang sibuk mengurai kode,
  // memuat huruf, dan menarik data — jadi animasinya yang tersendat, bukan
  // mempercantik. Dipersingkat supaya tetap jadi sambutan, bukan penghalang.
  useEffect(() => {
    const t = setTimeout(onDone, reduce ? 300 : 1200);
    return () => clearTimeout(t);
  }, [onDone, reduce]);

  // Formasi rak segitiga
  const rack: { x: number; y: number; c: string; n: number }[] = [];
  let idx = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col <= row; col++) {
      rack.push({
        x: 210 + row * 17,
        y: 100 - row * 9.6 + col * 19.2,
        c: BALL_COLORS[idx % BALL_COLORS.length],
        n: idx + 1,
      });
      idx++;
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink grain overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: "easeInOut" } }}
    >
      <div className="felt-tex absolute inset-0 opacity-25" />
      <svg viewBox="0 0 400 200" className="relative w-full max-w-lg px-6" aria-hidden="true">
        {/* Stik meluncur dari kiri */}
        <motion.g
          initial={{ x: -170 }}
          animate={reduce ? { x: -40 } : { x: [-170, -170, 8, -18] }}
          transition={{ duration: 0.85, times: [0, 0.35, 0.62, 1], ease: [0.2, 0.9, 0.3, 1] }}
        >
          <rect x="0" y="97" width="150" height="6" rx="3" fill="#C89B5A" />
          <rect x="140" y="97.5" width="16" height="5" rx="2.5" fill="#FDF0DC" />
          <rect x="156" y="98.5" width="5" height="3" rx="1.5" fill="#2B4C9B" />
        </motion.g>

        {/* Bola putih */}
        <motion.g
          initial={{ x: 0 }}
          animate={reduce ? { x: 20 } : { x: [0, 0, 34, 34] }}
          transition={{ duration: 0.85, times: [0, 0.38, 0.6, 1], ease: [0.2, 0.9, 0.3, 1] }}
        >
          <circle cx="172" cy="100" r="9" fill="#FDF0DC" />
          <ellipse cx="169" cy="96" rx="2.6" ry="1.8" fill="#fff" opacity=".8" />
        </motion.g>

        {/* Rak yang berhamburan */}
        {rack.map((b, i) => {
          const ang = (i / rack.length) * Math.PI * 2;
          const dist = 46 + (i % 4) * 26;
          return (
            <motion.g
              key={i}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={
                reduce
                  ? { x: 0, y: 0 }
                  : {
                      x: [0, 0, Math.cos(ang) * dist + 40],
                      y: [0, 0, Math.sin(ang) * dist * 0.5],
                      opacity: [1, 1, 0],
                    }
              }
              transition={{ duration: 1.5, times: [0, 0.4, 1], ease: [0.15, 0.75, 0.3, 1] }}
            >
              <circle cx={b.x} cy={b.y} r="9" fill={b.c} />
              <circle cx={b.x} cy={b.y} r="4.4" fill="#FDF0DC" />
              <text x={b.x} y={b.y} textAnchor="middle" dominantBaseline="central"
                fontSize="5.5" fontWeight="700" fill="#0B0B0C" fontFamily="Georgia, serif">{b.n}</text>
              <ellipse cx={b.x - 3} cy={b.y - 3.4} rx="2.4" ry="1.6" fill="#fff" opacity=".38" />
            </motion.g>
          );
        })}
      </svg>

      {/* Wordmark muncul setelah break */}
      <motion.div
        className="absolute inset-x-0 bottom-[24%] text-center px-6"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 1.15, duration: 0.55, ease: "easeOut" }}
      >
        <div className="font-display text-4xl tracking-[0.18em] text-amber">SPL</div>
        <div className="font-script text-2xl text-cream/85 -mt-1">Sports Pool Lounge</div>
      </motion.div>
    </motion.div>
  );
}

/* ── Loader: rak segitiga berdenyut ─────────────────────────────── */
export function RackLoader({ label = "Memuat" }: { label?: string }) {
  const pos = [
    [0, 0], [-1, 1], [1, 1], [-2, 2], [0, 2], [2, 2],
  ];
  return (
    <div className="flex flex-col items-center gap-3 py-10" role="status" aria-live="polite">
      <div className="relative h-16 w-20">
        {pos.map(([cx, cy], i) => (
          <motion.div
            key={i}
            className="absolute h-4 w-4 rounded-full"
            style={{
              left: `calc(50% + ${cx * 9}px - 8px)`,
              top: `${cy * 15}px`,
              background: BALL_COLORS[i % BALL_COLORS.length],
            }}
            animate={{ scale: [1, 1.28, 1], opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 1.1, delay: i * 0.09, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="text-xs uppercase tracking-[0.2em] text-dim">{label}</span>
    </div>
  );
}

/* ── Bola 8 berputar untuk tombol yang sedang bekerja ───────────── */
export function BallSpinner({ size = 18 }: { size?: number }) {
  return (
    <motion.span
      className="inline-block"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      aria-hidden="true"
    >
      <Ball n={8} size={size} color="#0B0B0C" />
    </motion.span>
  );
}

/* ── Bola menggelinding sebagai pembatas seksi ──────────────────── */
export function RollingDivider() {
  const reduce = useReducedMotion();
  return (
    <div className="relative my-8 h-6 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <motion.div
        className="absolute top-1/2 -mt-3"
        initial={{ x: "-12%" }}
        animate={reduce ? { x: "50%" } : { x: ["-12%", "108%"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
      >
        <motion.div
          animate={reduce ? {} : { rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        >
          <Ball n={8} size={24} />
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ── Progress berbentuk stik biliar ─────────────────────────────── */
export function CueProgress({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-3 w-full" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-3" />
      <motion.div
        className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full"
        style={{ background: "linear-gradient(90deg,#8B5E2A,#C89B5A,#F0A202)" }}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      <motion.div
        className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-cream ring-2 ring-amber"
        animate={{ left: `calc(${pct}% - 6px)` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

/* ── Ketuk bola: umpan balik saat memilih slot ──────────────────── */
export function PocketPulse({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-amber"
          initial={{ opacity: 0.9, scale: 0.94 }}
          animate={{ opacity: 0, scale: 1.14 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  );
}

/* ── Bola ambient melayang di latar hero ────────────────────────── */
export function AmbientBalls() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const balls = [
    { n: 8, c: "#0B0B0C", s: 54, x: "8%", y: "18%", d: 0 },
    { n: 1, c: "#F0A202", s: 34, x: "78%", y: "12%", d: 1.4 },
    { n: 3, c: "#992212", s: 42, x: "86%", y: "62%", d: 0.7 },
    { n: 6, c: "#1F6F4A", s: 26, x: "16%", y: "72%", d: 2.1 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {balls.map((b, i) => (
        <motion.div
          key={i}
          className="absolute opacity-[0.16]"
          style={{ left: b.x, top: b.y }}
          animate={{ y: [0, -18, 0], rotate: [0, 18, 0] }}
          transition={{ duration: 7 + i, delay: b.d, repeat: Infinity, ease: "easeInOut" }}
        >
          <Ball n={b.n} color={b.c} size={b.s} />
        </motion.div>
      ))}
    </div>
  );
}

export function useIntroSeen() {
  // Dibungkus try/catch: di mode penyamaran / penyimpanan diblokir, sessionStorage
  // melempar galat dan dulu itu membuat seluruh aplikasi gagal tampil.
  const [seen, setSeen] = useState(() => {
    try { return sessionStorage.getItem("spl-intro") === "1"; } catch { return true; }
  });
  const markSeen = () => {
    try { sessionStorage.setItem("spl-intro", "1"); } catch { /* mode privat */ }
    setSeen(true);
  };
  return { seen, markSeen };
}
