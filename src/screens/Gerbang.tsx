/**
 * GERBANG — halaman depan sportspoollounge.com.
 *
 * Sejak layar pertama pengunjung memilih SPL Sport atau Smokehouse. Di bawah dua
 * pintu ada ringkasan kedua bisnis, untuk yang belum tahu tempat ini apa.
 *
 * Pembukanya sekali per kunjungan: bola 8 menggelinding dari kiri ke garis tengah,
 * dan begitu tiba, layar terbelah membuka dua pintu. Bola yang sama lanjut ke
 * halaman Sport (lihat `BolaBersama`), jadi perpindahannya tidak terputus.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mark } from "../components/UI";
import { SmokeMark } from "../components/Smoke";
import { perangkatLemah } from "../components/motion/Adegan";
import { Aksi, Aksi2, ALAMAT, wa } from "../components/BagianVenue";
import { Judul, LabelSandi, Muncul } from "../components/motion/Adegan";
import { CLOSE_IDX, OPEN_IDX, classOf, hourIdx, mejaDijual, useAdmin } from "../lib/adminStore";
import { rupiah } from "../lib/core";
import { CLOSE_HOUR, OPEN_HOUR, WA_VENUE_TAMPIL, fmtHour } from "../data/venue";
import { FOTO_HERO_SMH } from "../data/fotoMenu";
import { FOTO_SPORT } from "../data/fotoVenue";
import { aturBola, bola, halus, keAtas, nyalakanGulir, padaBingkai } from "../lib/jamPanggung";

type Pintu = "sport" | "smokehouse";
const K_PEMBUKA = "spl-pembuka";

const sudahDibuka = () => {
  try { return sessionStorage.getItem(K_PEMBUKA) === "1"; } catch { return true; }
};

export default function Gerbang() {
  const nav = useNavigate();
  const { a } = useAdmin();
  const [sorot, setSorot] = useState<Pintu | null>(null);
  const [pilih, setPilih] = useState<Pintu | null>(null);
  const [terbuka, setTerbuka] = useState(() => sudahDibuka() || perangkatLemah());
  const pintu = useRef<HTMLDivElement>(null);

  const meja = useMemo(() => mejaDijual(a), [a]);
  const mejaBiliar = meja.filter((t) => classOf(a, t.id) !== "resto").length;
  const mejaMakan = meja.length - mejaBiliar;
  const h = hourIdx(Date.now());
  const buka = h >= OPEN_IDX && h < CLOSE_IDX;

  // Pembuka: bola menggelinding masuk, lalu layar terbelah.
  useEffect(() => {
    if (terbuka) { bola.sumbu = [0, 1, 0]; aturBola({ x: 50, y: 50, s: 0.3, o: 1 }); return; }
    bola.tujuan = { x: -22, y: 50, s: 0.44, o: 1 };
    bola.sumbu = [0, 1, 0];
    const a1 = setTimeout(() => aturBola({ x: 50, y: 50, s: 0.44, o: 1 }, 0.045), 120);
    const a2 = setTimeout(() => {
      setTerbuka(true);
      aturBola({ s: 0.3 }, 0.06);
      try { sessionStorage.setItem(K_PEMBUKA, "1"); } catch { /* mode privat */ }
    }, 1500);
    return () => { clearTimeout(a1); clearTimeout(a2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll: bola turun ke ringkasan, pintu meredup. Mengikuti jam panggung yang sama.
  useEffect(() => {
    const matikan = perangkatLemah() ? undefined : nyalakanGulir();
    const lepas = padaBingkai(() => {
      if (pilih || !terbuka) return;
      const t = halus(window.scrollY / window.innerHeight);
      aturBola({ y: 50 + t * 62, s: 0.3 + t * 0.34, x: 50 + t * 28, o: 1 - halus((t - 0.7) / 0.3) }, 0.14);
      if (pintu.current) pintu.current.style.opacity = String(1 - t * 0.75);
    });
    return () => { lepas(); matikan?.(); };
  }, [pilih, terbuka]);

  function masuk(p: Pintu) {
    if (pilih) return;
    keAtas();
    setPilih(p);
    aturBola(p === "sport" ? { x: 50, y: 83, s: 0.3 } : { s: 0.02, o: 0 }, 0.05);
    window.setTimeout(() => nav(p === "sport" ? "/sport" : "/smokehouse"), 640);
  }

  const lebar = (p: Pintu) => pilih === p ? "flex-[100]" : pilih ? "flex-[0.0001]" : sorot === p ? "md:flex-[1.3] flex-1" : "flex-1";

  const Tombol = ({ p, foto, judul, sub }: { p: Pintu; foto?: string; judul: string; sub: string }) => (
    <button type="button" onClick={() => masuk(p)}
      onMouseEnter={() => setSorot(p)} onMouseLeave={() => setSorot(null)}
      onFocus={() => setSorot(p)} onBlur={() => setSorot(null)}
      aria-label={`Masuk ke ${p === "sport" ? "SPL Sport" : "Smokehouse"}. ${sub}`}
      style={{ transitionProperty: "flex-grow" }}
      className={`group relative min-h-0 min-w-0 overflow-hidden text-left duration-[640ms] ease-[cubic-bezier(.76,0,.24,1)] ${
        p === "sport" ? "bg-[#07140e]" : "bg-[#160807]"} ${lebar(p)}`}>
      {foto && <img src={foto} alt="" fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]" />}
      <span aria-hidden className={`absolute inset-0 bg-gradient-to-t ${
        p === "sport" ? "from-[#07140e] via-[#07140e]/40" : "from-[#160807] via-[#160807]/40"} to-ink/25`} />
      <span aria-hidden className={`absolute inset-0 bg-ink transition-opacity duration-500 ${
        sorot && sorot !== p ? "opacity-55" : "opacity-0"}`} />
      <span className={`absolute inset-x-0 bottom-0 block p-6 pb-14 transition-opacity duration-300 sm:p-10 sm:pb-16 ${pilih ? "opacity-0" : ""}`}>
        <span className={`flex items-center gap-2 ${p === "sport" ? "text-amber" : "text-cream"}`}>
          {p === "sport" ? <Mark size={26} /> : <SmokeMark size={26} />}
          <span className="font-display text-[12px] uppercase tracking-[0.22em]">{p === "sport" ? "SPL Sport" : "Smokehouse"}</span>
        </span>
        <span className="mt-3 block font-serif text-[2.6rem] font-bold leading-[1.02] tracking-[-0.018em] text-cream sm:text-[4rem]">
          {judul}
        </span>
        <span className="mt-2 block text-[14px] leading-snug text-cream/80">{sub}</span>
        <span className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber px-5 text-[13px]
          font-bold uppercase tracking-[0.1em] text-ink transition group-hover:bg-amber-deep">
          Masuk <span aria-hidden className="transition-transform group-hover:translate-x-1">&rarr;</span>
        </span>
      </span>
    </button>
  );

  return (
    <div className="bg-ink">
      <h1 className="sr-only">SPL Sports Pool Lounge dan Smokehouse Resto, Padang</h1>

      <div className="relative h-svh overflow-hidden">
        <div ref={pintu} className="flex h-full flex-col md:flex-row">
          <Tombol p="sport" foto={FOTO_SPORT} judul="Main biliar."
            sub={`${mejaBiliar} meja, ruang VIP & VVIP, mulai ${rupiah(a.rates.regularDay)}/jam`} />
          <Tombol p="smokehouse" foto={FOTO_HERO_SMH} judul="Makan enak."
            sub={`Iga asap, masakan rumahan, kopi, ${mejaMakan} meja makan`} />
        </div>

        {/* Dua daun tirai pembuka. Bola menggelinding di depannya, lalu keduanya membelah. */}
        <div aria-hidden className={`pointer-events-none absolute inset-0 z-[3] ${terbuka ? "" : "bg-ink"}`} />
        <div aria-hidden style={{ transform: terbuka ? "translateY(-101%)" : "none" }}
          className="tirai-gerbang pointer-events-none absolute inset-x-0 top-0 z-[4] h-1/2 border-b border-amber/30 bg-ink" />
        <div aria-hidden style={{ transform: terbuka ? "translateY(101%)" : "none" }}
          className="tirai-gerbang pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-1/2 bg-ink" />

        <button type="button" aria-label="Lihat info" onClick={() => document.getElementById("info")?.scrollIntoView()}
          className={`absolute inset-x-0 bottom-3 z-10 mx-auto w-max text-[11px] uppercase tracking-[0.2em] text-cream/70
            transition-opacity duration-300 ${pilih || !terbuka ? "opacity-0" : ""}`}>
          Scroll <span aria-hidden className="ml-1 inline-block animate-bounce">&darr;</span>
        </button>
      </div>

      <section id="info" className="relative z-10 bg-ink">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
          <LabelSandi teks="SPL Padang" className="text-amber" />
          <Judul baris={["Satu lokasi,", "dua tempat nongkrong."]} className="mt-3 text-[2.2rem] sm:text-[3.4rem]" />

          <div className="mt-10 grid gap-8 sm:grid-cols-2 sm:gap-12">
            <Muncul>
              <h3 className="flex items-center gap-2 font-display text-[12px] uppercase tracking-[0.2em] text-amber">
                <Mark size={22} /> SPL Sport
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-cream/80">
                Biliar dengan {mejaBiliar} meja dan ruang VIP &amp; VVIP. Pilih meja dan jam dari HP, bayar QRIS,
                slotnya langsung terkunci.
              </p>
              <button type="button" onClick={() => masuk("sport")}
                className="mt-3 min-h-[40px] text-[13px] font-semibold text-amber hover:text-amber-deep">
                Lihat tarif &amp; booking &rarr;
              </button>
            </Muncul>
            <Muncul i={1}>
              <h3 className="flex items-center gap-2 font-display text-[12px] uppercase tracking-[0.2em] text-cream">
                <SmokeMark size={22} /> Smokehouse Resto
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-cream/80">
                Iga asap, masakan rumahan, kopi, dan minuman segar. {mejaMakan} meja makan, reservasi gratis
                tanpa hitungan jam.
              </p>
              <button type="button" onClick={() => masuk("smokehouse")}
                className="mt-3 min-h-[40px] text-[13px] font-semibold text-amber hover:text-amber-deep">
                Lihat menu &amp; reservasi &rarr;
              </button>
            </Muncul>
          </div>

          <Muncul i={2}>
            <dl className="mt-12 grid gap-x-10 gap-y-4 border-t border-line pt-6 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-dim">Jam buka</dt>
                <dd className="mt-1 text-[15px] tabular-nums text-cream">
                  {fmtHour(OPEN_HOUR)}&ndash;{fmtHour(CLOSE_HOUR)} setiap hari
                  <span className={`ml-2 text-[12px] ${buka ? "text-amber" : "text-mute"}`}>{buka ? "Buka sekarang" : "Sedang tutup"}</span>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-[0.14em] text-dim">Alamat</dt>
                <dd className="mt-1 text-[15px] text-cream">{ALAMAT}</dd>
              </div>
            </dl>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
              <Aksi onClick={() => nav("/daftar")}>Daftar member</Aksi>
              <Aksi2 href={wa("Halo SPL, saya mau tanya.")}>WhatsApp {WA_VENUE_TAMPIL}</Aksi2>
            </div>
          </Muncul>
        </div>
      </section>
    </div>
  );
}
