/**
 * GERBANG — halaman depan sportspoollounge.com.
 *
 * Permintaan pemilik 7 Nov 2026: sejak layar pertama pengunjung langsung memilih
 * SPL Sport atau Smokehouse. Karena itu halaman ini hanya berisi dua pintu; seluruh
 * cerita pindah ke halaman venue masing-masing.
 *
 * Pintu yang dipilih melebar sampai memenuhi layar, lalu alamat berganti ke halaman
 * venue yang membuka dengan foto yang sama, jadi perpindahannya tidak terasa
 * berganti halaman.
 */
import { useEffect, useMemo, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Mark } from "../components/UI";
import { SmokeMark } from "../components/Smoke";
import { Ball } from "../components/motion/Billiard";
import { Bola3D } from "../components/motion/Adegan";
import { CLOSE_IDX, OPEN_IDX, classOf, hourIdx, mejaDijual, useAdmin } from "../lib/adminStore";
import { rupiah } from "../lib/core";
import { CLOSE_HOUR, OPEN_HOUR, fmtHour } from "../data/venue";
import { FOTO_HERO_SMH } from "../data/fotoMenu";
import { FOTO_SPORT } from "../data/fotoVenue";

type Pintu = "sport" | "smokehouse";

export default function Gerbang() {
  const nav = useNavigate();
  const { a } = useAdmin();
  const [sorot, setSorot] = useState<Pintu | null>(null);
  const [pilih, setPilih] = useState<Pintu | null>(null);

  const meja = useMemo(() => mejaDijual(a), [a]);
  const mejaBiliar = meja.filter((t) => classOf(a, t.id) !== "resto").length;
  const mejaMakan = meja.length - mejaBiliar;
  const h = hourIdx(Date.now());
  const buka = h >= OPEN_IDX && h < CLOSE_IDX;

  const arah = useMotionValue(0);
  const putar = useSpring(arah, { stiffness: 40, damping: 16 });
  useEffect(() => { arah.set(sorot === "sport" ? -2.4 : sorot === "smokehouse" ? 2.4 : 0); }, [sorot, arah]);

  function masuk(p: Pintu) {
    if (pilih) return;
    setPilih(p);
    window.setTimeout(() => nav(p === "sport" ? "/sport" : "/smokehouse"), 620);
  }

  const lebar = (p: Pintu) => pilih === p ? "flex-[100]" : pilih ? "flex-[0.0001]" : sorot === p ? "md:flex-[1.32] flex-1" : "flex-1";

  return (
    <div className="relative flex h-svh flex-col overflow-hidden bg-ink md:flex-row">
      <h1 className="sr-only">SPL Sports Pool Lounge dan Smokehouse Resto, Padang</h1>

      <button type="button" onClick={() => masuk("sport")}
        onMouseEnter={() => setSorot("sport")} onMouseLeave={() => setSorot(null)}
        onFocus={() => setSorot("sport")} onBlur={() => setSorot(null)}
        aria-label={`Masuk ke SPL Sport. ${mejaBiliar} meja biliar.`}
        style={{ transitionProperty: "flex-grow" }}
        className={`pintu-kiri group relative min-h-0 min-w-0 overflow-hidden text-left duration-[620ms] ease-[cubic-bezier(.76,0,.24,1)] ${lebar("sport")}`}>
        <img src={FOTO_SPORT} alt="" fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-ink/30" />
        <span aria-hidden className={`absolute inset-0 bg-ink transition-opacity duration-500 ${sorot === "smokehouse" ? "opacity-55" : "opacity-0"}`} />
        <span className={`absolute inset-x-0 bottom-0 block p-6 pb-20 transition-opacity duration-300 sm:p-10 sm:pb-24 ${pilih ? "opacity-0" : ""}`}>
          <span className="flex items-center gap-2 text-amber">
            <Mark size={26} />
            <span className="font-display text-[12px] uppercase tracking-[0.22em]">SPL Sport</span>
          </span>
          <span className="mt-3 block font-serif text-[2.5rem] font-bold leading-[1.02] tracking-[-0.015em] text-cream sm:text-[3.5rem]">
            Main biliar.
          </span>
          <span className="mt-2 block text-[14px] leading-snug text-cream/80">
            {mejaBiliar} meja, ruang VIP &amp; VVIP, mulai {rupiah(a.rates.regularDay)}/jam
          </span>
          <span className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber px-5 text-[13px]
            font-bold uppercase tracking-[0.1em] text-ink transition group-hover:bg-amber-deep">
            Masuk <span aria-hidden className="transition-transform group-hover:translate-x-1">&rarr;</span>
          </span>
        </span>
      </button>

      <button type="button" onClick={() => masuk("smokehouse")}
        onMouseEnter={() => setSorot("smokehouse")} onMouseLeave={() => setSorot(null)}
        onFocus={() => setSorot("smokehouse")} onBlur={() => setSorot(null)}
        aria-label={`Masuk ke Smokehouse. ${mejaMakan} meja makan.`}
        style={{ transitionProperty: "flex-grow" }}
        className={`pintu-kanan brick-tex group relative min-h-0 min-w-0 overflow-hidden text-left duration-[620ms] ease-[cubic-bezier(.76,0,.24,1)] ${lebar("smokehouse")}`}>
        {FOTO_HERO_SMH && (
          <img src={FOTO_HERO_SMH} alt="" fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]" />
        )}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#2a0f0a] via-brick/25 to-ink/30" />
        <span aria-hidden className={`absolute inset-0 bg-ink transition-opacity duration-500 ${sorot === "sport" ? "opacity-55" : "opacity-0"}`} />
        <span className={`absolute inset-x-0 bottom-0 block p-6 pb-20 transition-opacity duration-300 sm:p-10 sm:pb-24 ${pilih ? "opacity-0" : ""}`}>
          <span className="flex items-center gap-2 text-cream">
            <SmokeMark size={26} />
            <span className="font-display text-[12px] uppercase tracking-[0.22em]">Smokehouse</span>
          </span>
          <span className="mt-3 block font-serif text-[2.5rem] font-bold leading-[1.02] tracking-[-0.015em] text-cream sm:text-[3.5rem]">
            Makan enak.
          </span>
          <span className="mt-2 block text-[14px] leading-snug text-cream/80">
            Iga asap, masakan rumahan, kopi, {mejaMakan} meja makan
          </span>
          <span className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber px-5 text-[13px]
            font-bold uppercase tracking-[0.1em] text-ink transition group-hover:bg-amber-deep">
            Masuk <span aria-hidden className="transition-transform group-hover:translate-x-1">&rarr;</span>
          </span>
        </span>
      </button>

      {/* Bola 8 di garis tengah: tanda bahwa keduanya satu tempat. */}
      <div aria-hidden className={`bola-gerbang pointer-events-none absolute left-1/2 top-1/2 z-10 h-[92px] w-[92px]
        -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 sm:h-[116px] sm:w-[116px] ${pilih ? "opacity-0" : ""}`}>
        <Bola3D putar={putar} cadangan={<Ball n={8} size={92} color="#0B0B0C" />} />
      </div>

      <div className={`safe-b pointer-events-none absolute inset-x-0 bottom-0 z-10 transition-opacity duration-300 ${pilih ? "opacity-0" : ""}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 text-[12px] text-cream/75 sm:px-10">
          <span className="tabular-nums">
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${buka ? "bg-amber" : "bg-mute"}`} />
            {buka ? "Buka" : "Tutup"} &middot; {fmtHour(OPEN_HOUR)}&ndash;{fmtHour(CLOSE_HOUR)} &middot; Jl. Batang Anai, Padang
          </span>
          <button type="button" onClick={() => nav("/daftar")}
            className="pointer-events-auto min-h-[36px] shrink-0 font-semibold text-cream underline underline-offset-4 hover:text-amber">
            Daftar member
          </button>
        </div>
      </div>
    </div>
  );
}
