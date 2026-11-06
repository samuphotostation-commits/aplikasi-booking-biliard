import { motion, AnimatePresence } from "framer-motion";

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
