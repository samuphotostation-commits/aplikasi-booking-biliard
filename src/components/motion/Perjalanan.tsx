/**
 * PERJALANAN — satu panggung tetap untuk seluruh halaman venue.
 *
 * Diadaptasi dari igloo.inc. Halaman tidak lagi berupa panel yang bergantian:
 * foto hidup di lapisan `fixed` di belakang, dan bab-bab teks lewat di depannya.
 * Pergantian foto selalu terjadi di balik kabut, jadi tiap bab tersambung ke bab
 * berikutnya seperti kamera yang berjalan.
 *
 * Teks bergulir bawaan browser, panggungnya hanya mengubah `opacity` dan
 * `transform`. Karena panggung tidak ikut bergeser, tidak ada lagi selisih antara
 * gerak teks dan gerak latar, dan itulah yang sebelumnya terasa patah di HP.
 */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useMotionValue } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Ball } from "./Billiard";
import { perangkatLemah } from "./Adegan";
import { aturBola, bola, halus, nyalakanGulir, padaBingkai, type TitikBola } from "../../lib/jamPanggung";

const Panggung3D = lazy(() => import("./Panggung3D"));

export type Bab = {
  /** Foto penuh layar, atau kosong untuk latar warna `warna`. */
  foto?: string;
  /** Foto tegak untuk layar HP. Tanpa ini, foto mendatar tampil utuh selebar layar. */
  fotoHp?: string;
  warna?: string;
  /** Kegelapan di atas foto, 0 sampai 1, supaya teks bab terbaca. */
  redup: number;
  /** Tujuan bola di bab ini, kalau bab ini punya bola. */
  bola?: TitikBola;
  bolaHp?: TitikBola;
};

export function Perjalanan({ tema, bab, children }: { tema: "sport" | "smokehouse"; bab: Bab[]; children: ReactNode }) {
  const akar = useRef<HTMLDivElement>(null);
  const lapis = useRef<(HTMLDivElement | null)[]>([]);
  const gambar = useRef<(HTMLImageElement | null)[]>([]);
  const garis = useRef<HTMLDivElement>(null);
  const rel = useRef<HTMLDivElement>(null);
  const kuat = useMotionValue(0.8);
  const [lemah] = useState(perangkatLemah);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    const el = akar.current;
    if (!el) return;
    const matikan = lemah ? undefined : nyalakanGulir();

    let atas: number[] = [], tinggi = 0, tinggiLayar = 1, hp = false;
    const ukur = () => {
      atas = [...el.querySelectorAll<HTMLElement>("[data-bab]")].map((b) => b.getBoundingClientRect().top + window.scrollY);
      tinggi = document.documentElement.scrollHeight;
      tinggiLayar = window.innerHeight;
      hp = window.innerWidth < 768;
    };
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);

    let y = window.scrollY;
    // Halaman baru terbuka dari balik kabut, jadi tersambung dengan halaman sebelumnya.
    let masuk = 0.8;
    const lepas = padaBingkai(() => {
      masuk *= 0.965;
      // Di HP gulirnya tidak lewat Lenis, jadi panggung mengejarnya sendiri.
      y += (window.scrollY - y) * 0.14;
      const tengah = y + tinggiLayar * 0.5;
      const lebarKabut = tinggiLayar * 0.42;
      let aktif = 0, kabut = 0;

      for (let i = 0; i < bab.length; i++) {
        const batas = atas[i] ?? 0;
        if (tengah >= batas) aktif = i;
        const buka = i === 0 ? 1 : halus((tengah - (batas - lebarKabut * 0.5)) / lebarKabut);
        const l = lapis.current[i];
        if (l) {
          const tampak = buka > 0.001 && (i === bab.length - 1 || tengah < (atas[i + 1] ?? Infinity) + tinggiLayar);
          l.style.opacity = String(buka);
          l.style.visibility = tampak ? "visible" : "hidden";
        }
        const g = gambar.current[i];
        if (g && l?.style.visibility === "visible") {
          const lokal = (tengah - batas + tinggiLayar) / (tinggiLayar * 3);
          // Di HP nyaris tanpa zoom: foto sudah pas selebar layar.
          g.style.transform = `scale(${1 + Math.min(1, Math.max(0, lokal)) * (hp ? 0.025 : 0.1)})`;
        }
        if (i > 0) kabut = Math.max(kabut, 1 - Math.abs(tengah - batas) / lebarKabut);
      }
      kuat.set(Math.max(0, kabut, masuk));
      if (rel.current) rel.current.style.opacity = String(halus((tengah - tinggiLayar) / tinggiLayar));

      // Bola berjalan di antara dua titik bab, mengikuti kemajuan bab itu.
      const titik = (i: number) => (hp ? bab[i]?.bolaHp : undefined) ?? bab[i]?.bola;
      const dari = titik(aktif), ke = titik(aktif + 1);
      if (dari) {
        const awal = atas[aktif], akhir = atas[aktif + 1] ?? tinggi;
        const t = ke ? halus((tengah - awal) / Math.max(1, akhir - awal)) : 0;
        const c = (k: keyof TitikBola) => dari[k] + ((ke ?? dari)[k] - dari[k]) * t;
        aturBola({ x: c("x"), y: c("y"), s: c("s"), o: c("o") }, 0.14);
      }

      const maju = y / Math.max(1, tinggi - tinggiLayar);
      if (garis.current) garis.current.style.transform = `scaleX(${maju})`;
    });

    return () => { lepas(); ro.disconnect(); matikan?.(); };
  }, [bab, kuat, lemah]);

  const sport = tema === "sport";
  return (
    <div ref={akar} className={sport ? "bg-[#07140e]" : "bg-[#160807]"}>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink">
        {bab.map((b, i) => (
          <div key={i} ref={(n) => { lapis.current[i] = n; }}
            className="absolute inset-0 opacity-0 will-change-[opacity]" style={{ background: b.warna ?? "#0b0b0c" }}>
            {b.foto && !b.fotoHp && (
              <img src={b.foto} alt="" decoding="async" loading="lazy" className="foto-latar absolute inset-0 h-full w-full object-cover" />
            )}
            {b.foto && (
              <picture>
                {b.fotoHp && <source media="(max-aspect-ratio: 4/5)" srcSet={b.fotoHp} />}
                <img ref={(n) => { gambar.current[i] = n; }} src={b.foto} alt="" decoding="async"
                  fetchPriority={i === 0 ? "high" : "low"} loading={i === 0 ? "eager" : "lazy"}
                  className={`absolute inset-0 h-full w-full object-cover will-change-transform ${b.fotoHp ? "" : "foto-utuh"}`} />
              </picture>
            )}
            <div className="absolute inset-0" style={{ background: `rgba(7,6,6,${b.redup})` }} />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/80 to-transparent" />
          </div>
        ))}
        {!lemah && !gagal && (
          <Suspense fallback={null}>
            <Panggung3D jenis="asap" tema={tema} nilai={kuat} className="absolute inset-0" onGagal={() => setGagal(true)} />
          </Suspense>
        )}
        {/* Rel meja: jalur bola sepanjang halaman, berakhir di lubang. */}
        {sport && (
          <div ref={rel} className="absolute inset-0 opacity-0">
            <div className="absolute bottom-[14svh] left-[93vw] top-[17svh] w-0 -translate-x-1/2 border-l-2 border-dotted border-amber/40" />
            <div className="absolute left-[93vw] top-[86svh] h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber/70 bg-black shadow-[inset_0_6px_14px_#000]" />
          </div>
        )}
      </div>

      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]">
        <div ref={garis} className={`h-full origin-left ${sport ? "bg-amber" : "bg-cream"}`} style={{ transform: "scaleX(0)" }} />
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Satu bab teks. Latarnya transparan: yang di belakangnya adalah panggung. */
export function BabTeks({ id, tinggi = "min-h-svh", className = "", children }: {
  id?: string; tinggi?: string; className?: string; children: ReactNode;
}) {
  return <section id={id} data-bab className={`relative flex w-full ${tinggi} ${className}`}>{children}</section>;
}

const RUTE_BOLA = ["/", "/sport", "/smokehouse"];
const UKURAN = 520;

/** Bola yang sama dari gerbang sampai halaman Sport. Selalu hidup di atas panggung. */
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
    let sudut = 0;
    return padaBingkai(() => {
      const t = bola.tujuan, k = bola.tarikan;
      const dx = (t.x - p.x) * k, dy = (t.y - p.y) * k;
      p.x += dx; p.y += dy; p.s += (t.s - p.s) * k; p.o += (t.o - p.o) * Math.max(k, 0.12);
      // Berputar sejauh jarak tempuhnya, jadi bola benar-benar menggelinding.
      sudut += (dx + dy * 0.6) * 0.09;
      putar.set(sudut);
      const el = kotak.current;
      if (el) {
        el.style.opacity = String(p.o);
        el.style.visibility = p.o < 0.01 ? "hidden" : "visible";
        el.style.transform = `translate3d(calc(${p.x}vw - 50%), calc(${p.y}svh - 50%), 0) scale(${p.s})`;
      }
    });
  }, [tampil, putar]);

  if (!tampil) return null;
  const cadangan = <Ball n={8} size={UKURAN} color="#0B0B0C" />;
  return (
    <div ref={kotak} aria-hidden style={{ width: `min(70vmin, ${UKURAN}px)`, height: `min(70vmin, ${UKURAN}px)`, opacity: 0 }}
      className="pointer-events-none fixed left-0 top-0 z-[5] will-change-transform">
      {lemah || gagal ? cadangan : (
        <Suspense fallback={null}>
          <Panggung3D jenis="bola" nilai={putar} onGagal={() => setGagal(true)} />
        </Suspense>
      )}
    </div>
  );
}
