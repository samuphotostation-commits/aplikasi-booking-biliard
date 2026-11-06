/**
 * Potongan halaman yang dipakai SPL Sport dan Smokehouse.
 *
 * Bentuknya sama, isinya selalu milik satu venue: pemilik meminta tiap halaman
 * hanya membahas tempatnya sendiri, jadi tidak ada kalimat yang menyebut venue
 * tetangga. Satu-satunya jembatan ada di kaki halaman.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mark } from "./UI";
import { SmokeMark } from "./Smoke";
import { Adegan, Judul, LabelSandi, Muncul, TEPI_NAIK } from "./motion/Adegan";
import { useTirai, type Tema } from "./motion/Tirai";
import { CLOSE_HOUR, OPEN_HOUR, VENUE, WA_VENUE, WA_VENUE_TAMPIL, fmtHour } from "../data/venue";

export const ALAMAT = "Jl. Batang Anai No. 2, Rimbo Kaluang, Padang Barat, Kota Padang, Sumatera Barat";
const PETA = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("SPL Sports Pool Lounge " + ALAMAT)}`;
export const wa = (pesan: string) => `https://wa.me/${WA_VENUE}?text=${encodeURIComponent(pesan)}`;

const KELAS_AKSI = "inline-flex min-h-[52px] items-center justify-center rounded-xl text-[13.5px] transition active:scale-[0.985]";

/** Tombol utama: selalu amber (`DS-02`), maroon adalah warna wilayah. */
export function Aksi({ onClick, href, children, lebar }: {
  onClick?: () => void; href?: string; children: ReactNode; lebar?: boolean;
}) {
  const kelas = `${KELAS_AKSI} bg-amber px-7 font-bold uppercase tracking-[0.1em] text-ink hover:bg-amber-deep ${lebar ? "w-full" : ""}`;
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={kelas}>{children}</a>
    : <button type="button" onClick={onClick} className={kelas}>{children}</button>;
}

export function Aksi2({ onClick, href, children, lebar }: {
  onClick?: () => void; href?: string; children: ReactNode; lebar?: boolean;
}) {
  const kelas = `${KELAS_AKSI} border border-cream/25 bg-ink/40 px-7 font-semibold text-cream backdrop-blur-sm
    hover:border-amber/70 hover:text-amber ${lebar ? "w-full" : ""}`;
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={kelas}>{children}</a>
    : <button type="button" onClick={onClick} className={kelas}>{children}</button>;
}

const NAMA = { sport: "SPL Sport", smokehouse: "Smokehouse" } as const;
const TAUTAN = {
  sport: [["Tarif", "#tarif"], ["Suasana", "#suasana"], ["Acara", "#acara"], ["Lokasi", "#lokasi"]],
  smokehouse: [["Menu", "#menu"], ["Andalan", "#andalan"], ["Acara", "#acara"], ["Lokasi", "#lokasi"]],
} as const;

/** Bilah atas: bening di atas hero, padat begitu halaman digulir. */
export function BilahVenue({ tema, aksi, keAksi }: { tema: Tema; aksi: string; keAksi: string }) {
  const pergi = useTirai();
  const nav = useNavigate();
  const [padat, setPadat] = useState(false);
  useEffect(() => {
    const cek = () => setPadat(window.scrollY > 40);
    cek();
    window.addEventListener("scroll", cek, { passive: true });
    return () => window.removeEventListener("scroll", cek);
  }, []);

  return (
    <header className={`safe-t fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
      padat ? "border-b border-line/70 bg-ink/85 backdrop-blur-md" : "border-b border-transparent"}`}>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-2.5">
        <button type="button" aria-label="Kembali ke pilihan tempat" onClick={() => pergi("/", tema)}
          className="flex min-h-[40px] items-center gap-2.5 text-cream">
          <span className={tema === "sport" ? "text-amber" : ""}>
            {tema === "sport" ? <Mark size={28} /> : <SmokeMark size={28} />}
          </span>
          <span className="font-display text-[15px] uppercase tracking-[0.14em]">{NAMA[tema]}</span>
        </button>
        <nav className="ml-auto hidden items-center gap-6 md:flex">
          {TAUTAN[tema].map(([label, ke]) => (
            <a key={ke} href={ke} className="text-[13px] text-cream/75 transition hover:text-amber">{label}</a>
          ))}
          <Link to="/pesanan" className="text-[13px] text-cream/75 transition hover:text-amber">Pesanan</Link>
          <Link to="/akun" className="text-[13px] text-cream/75 transition hover:text-amber">Akun</Link>
        </nav>
        <button type="button" onClick={() => nav(keAksi)}
          className="ml-auto min-h-[38px] rounded-lg bg-amber px-4 text-[12px] font-bold uppercase tracking-[0.1em]
            text-ink transition hover:bg-amber-deep md:ml-0">
          {aksi}
        </button>
      </div>
    </header>
  );
}

/** Tanya jawab: `<details>` bawaan, tetap terbaca mesin pencari saat tertutup. */
export function TanyaJawab({ daftar }: { daftar: { t: string; j: string }[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {daftar.map((q) => (
        <details key={q.t} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[14.5px]
            font-semibold text-cream transition hover:text-amber [&::-webkit-details-marker]:hidden">
            {q.t}
            <span aria-hidden className="shrink-0 text-amber transition-transform duration-200 group-open:rotate-45">+</span>
          </summary>
          <p className="max-w-[52ch] pb-4 text-[13.5px] leading-relaxed text-mute">{q.j}</p>
        </details>
      ))}
    </div>
  );
}

/** Penutup: lokasi, member, dan kaki halaman. Isinya mengikuti venue. */
export function PenutupVenue({ tema, urut }: { tema: Tema; urut: number }) {
  const nav = useNavigate();
  const pergi = useTirai();
  const sport = tema === "sport";
  const lain: Tema = sport ? "smokehouse" : "sport";

  return (
    <Adegan id="lokasi" urut={urut} terakhir
      className={`${TEPI_NAIK} ${sport ? "bg-ink-2" : "bata-redup"}`}>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7">
          <LabelSandi teks="Lokasi" className="text-amber" />
          <Judul baris={["Datang langsung,", "kami buka tiap hari."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
          <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-cream/75">{ALAMAT}</p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Aksi href={PETA}>Petunjuk arah</Aksi>
            <Aksi2 href={wa(sport ? "Halo SPL Sport, saya mau tanya." : "Halo Smokehouse, saya mau tanya.")}>
              WhatsApp {WA_VENUE_TAMPIL}
            </Aksi2>
          </div>
        </div>
        <Muncul i={1} className="lg:col-span-5">
          <dl className="divide-y divide-line border-y border-line">
            <div className="flex items-baseline justify-between gap-4 py-4">
              <dt className="text-[12px] uppercase tracking-[0.14em] text-dim">Jam buka</dt>
              <dd className="font-display text-lg tabular-nums text-cream">{fmtHour(OPEN_HOUR)}&ndash;{fmtHour(CLOSE_HOUR)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-4">
              <dt className="text-[12px] uppercase tracking-[0.14em] text-dim">Hari</dt>
              <dd className="text-[14px] text-cream">Setiap hari</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 py-4">
              <dt className="text-[12px] uppercase tracking-[0.14em] text-dim">Instagram</dt>
              <dd>
                <a href={VENUE.ig} target="_blank" rel="noreferrer" className="text-[14px] text-amber hover:text-amber-deep">
                  @{VENUE.ig.split("/").filter(Boolean).pop()}
                </a>
              </dd>
            </div>
          </dl>
          <div className="mt-6">
            <Aksi2 lebar onClick={() => nav(sport ? "/sport/daftar" : "/smokehouse/daftar")}>Daftar member</Aksi2>
          </div>
        </Muncul>
      </div>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 text-[12px] text-dim">
          <span>{sport ? "SPL Sports Pool Lounge" : "Smokehouse Resto"} &middot; Padang</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={wa("Halo SPL, saya mau melamar kerja. Posisi: ... Pengalaman: ... Domisili: ...")}
              target="_blank" rel="noreferrer" className="hover:text-amber">Kirim lamaran</a>
            <a href={wa("Halo SPL, saya mau menawarkan kerja sama. Bentuknya: ...")}
              target="_blank" rel="noreferrer" className="hover:text-amber">Ajukan kerja sama</a>
            <a href="/privasi" className="hover:text-amber">Privasi</a>
            <a href="/ketentuan" className="hover:text-amber">Ketentuan</a>
            <button type="button" onClick={() => pergi(lain === "sport" ? "/sport" : "/smokehouse", lain)}
              className="font-semibold text-cream/80 hover:text-amber">
              Ke {NAMA[lain]} &rarr;
            </button>
          </nav>
        </div>
      </footer>
    </Adegan>
  );
}
