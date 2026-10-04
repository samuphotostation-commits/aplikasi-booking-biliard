import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useStore } from "../lib/store";
import { BallSpinner } from "./motion/Billiard";

/* ── Logo SPL: monogram di dalam rak segitiga ───────────────────── */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.88} viewBox="0 0 100 88" aria-label="SPL" role="img">
      <path d="M14 8 L86 8 L50 74 Z" fill="none" stroke="currentColor" strokeWidth="5"
        strokeLinejoin="round" />
      <text x="50" y="40" textAnchor="middle" fontFamily="Georgia, serif" fontSize="30"
        fontWeight="700" fill="currentColor">SPL</text>
      <circle cx="50" cy="79" r="8" fill="currentColor" />
      <text x="50" y="79.5" textAnchor="middle" dominantBaseline="central" fontSize="9"
        fontWeight="700" fill="#0B0B0C" fontFamily="Georgia, serif">8</text>
    </svg>
  );
}

/* ── Tombol ─────────────────────────────────────────────────────── */
export function Button({
  children, onClick, variant = "primary", disabled, busy, full, type = "button", className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "brick";
  disabled?: boolean;
  busy?: boolean;
  full?: boolean;
  type?: "button" | "submit";
  /** Warna khusus satu tombol (mis. hijau "Lunas" di papan kasir). Ditaruh
   *  paling belakang supaya menang dari gaya bawaan varian. */
  className?: string;
}) {
  // Teks di atas amber WAJIB near-black — putih hanya 2.13 kontras (PRD §9.2)
  const styles = {
    primary: "bg-amber text-ink hover:bg-amber-deep active:bg-amber-deep",
    brick: "bg-brick text-cream hover:bg-brick-lit active:bg-brick-lit",
    ghost: "bg-transparent text-cream ring-1 ring-line-2 hover:bg-ink-3 active:bg-ink-3",
  }[variant];

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      whileTap={disabled || busy ? undefined : { scale: 0.97 }}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5
        text-[15px] font-semibold tracking-wide transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${full ? "w-full" : ""} ${className}`}
    >
      {busy && <BallSpinner size={16} />}
      {children}
    </motion.button>
  );
}

/* ── Kartu ──────────────────────────────────────────────────────── */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-ink-2 ${className}`}>{children}</div>
  );
}

export function SectionTitle({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <div className="mb-4">
      {kicker && (
        <div className="font-script text-xl leading-none text-amber">{kicker}</div>
      )}
      <h2 className="font-display text-2xl uppercase tracking-[0.06em] text-cream">{title}</h2>
    </div>
  );
}

/* ── Bilah bawah: tetap terlihat, aman dari home indicator iPhone ── */
const TABS = [
  { to: "/", label: "Beranda", icon: HomeIcon },
  { to: "/booking", label: "Booking", icon: TableIcon },
  { to: "/menu", label: "Menu", icon: MenuIcon },
  { to: "/pesanan", label: "Pesanan", icon: TicketIcon },
  { to: "/akun", label: "Akun", icon: UserIcon },
];

export function BottomNav() {
  const { cartCount } = useStore();
  return (
    <nav
      className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 backdrop-blur-md"
      aria-label="Navigasi utama"
    >
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) =>
              `relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[10px]
               font-semibold uppercase tracking-wider transition-colors
               ${isActive ? "text-amber" : "text-dim hover:text-mute"}`
            }
          >
            {({ isActive }) => (
              <>
                <t.icon active={isActive} />
                <span>{t.label}</span>
                {t.to === "/menu" && cartCount > 0 && (
                  <span className="absolute right-[22%] top-2 min-w-[17px] rounded-full bg-amber px-1
                    text-[10px] font-bold leading-[17px] text-ink">
                    {cartCount}
                  </span>
                )}
                {isActive && (
                  <motion.span
                    layoutId="tab-dot"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-amber"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

type IconProps = { active?: boolean };
const sw = (a?: boolean) => (a ? 2.1 : 1.7);

function HomeIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}
function TableIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M2.5 9h2M19.5 9h2M2.5 15h2M19.5 15h2" />
    </svg>
  );
}
function MenuIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3v18M6 3c-1.6 0-2.5 1.6-2.5 4S4.4 11 6 11" />
      <path d="M14 3v7c0 1.7 1.3 3 3 3h1v8" /><path d="M18 3v10" />
    </svg>
  );
}
function UserIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.8 19.2c1.2-3.2 4-4.8 7.2-4.8s6 1.6 7.2 4.8" />
    </svg>
  );
}

function TicketIcon({ active }: IconProps) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v1a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5v-1a2.5 2.5 0 0 0 0-5Z" />
      <path d="M12 6v2M12 11v2M12 16v2" strokeDasharray="0.1 3" />
    </svg>
  );
}

/* ── Kepala halaman ─────────────────────────────────────────────── */
export function PageHeader({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <header className="safe-t bg-brick px-5 pb-5 pt-4">
      <div className="mx-auto max-w-lg">
        {kicker && <div className="font-script text-2xl leading-none text-amber">{kicker}</div>}
        <h1 className="font-display text-3xl uppercase leading-tight tracking-[0.04em] text-cream">
          {title}
        </h1>
        {sub && <p className="mt-1 text-sm text-cream/75">{sub}</p>}
      </div>
    </header>
  );
}
