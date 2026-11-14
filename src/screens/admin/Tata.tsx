/**
 * TATA LETAK BERSAMA PANEL (perapian 14 Nov 2026).
 *
 * Satu bentuk untuk semua menu: kepala halaman (judul, keterangan, aksi,
 * angka ringkas), kelompok berjudul, dan keadaan kosong. Hanya tampilan —
 * tidak ada logika di sini, jadi memakainya tidak mengubah fungsi layar mana pun.
 */
import { useEffect, useState, type ReactNode } from "react";
import { VENUE_LABEL, type Venue } from "../../data/venue";

/** Label venue yang sedang dilihat — SPL biru, Smokehouse emas, di semua layar sama. */
export function LabelVenue({ venue }: { venue: Venue }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
      venue === "smh" ? "border-amber/50 bg-amber/10 text-amber" : "border-sky-400/50 bg-sky-400/10 text-sky-300"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${venue === "smh" ? "bg-amber" : "bg-sky-300"}`} />
      {VENUE_LABEL[venue]}
    </span>
  );
}

/** Judul bagian dengan garis emas kecil, jumlah opsional, dan aksi di kanan. */
export function JudulBagian({ judul, jumlah, aksi }: { judul: ReactNode; jumlah?: number; aksi?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
        {judul}
      </h2>
      {jumlah !== undefined && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] tabular-nums text-mute">{jumlah}</span>}
      {aksi && <div className="ml-auto flex items-center gap-1.5">{aksi}</div>}
    </div>
  );
}

/** Kepala halaman: judul besar, satu kalimat penjelas, aksi utama, dan angka ringkas. */
export function KepalaHalaman({ judul, ket, aksi, angka, children, venue }: {
  judul: string; ket?: ReactNode; aksi?: ReactNode; venue?: Venue;
  angka?: { label: string; nilai: ReactNode; nada?: "amber" | "merah" | "hijau" | "biru" }[];
  children?: ReactNode;
}) {
  const warna = { amber: "text-amber", merah: "text-red-300", hijau: "text-emerald-300", biru: "text-sky-300" };
  return (
    <section className="rounded-2xl border border-line bg-ink-2">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl uppercase tracking-wide text-cream">{judul}</h1>
            {venue && <LabelVenue venue={venue} />}
          </div>
          {ket && <p className="mt-0.5 text-[12px] leading-snug text-mute">{ket}</p>}
        </div>
        {aksi && <div className="flex flex-wrap items-center gap-1.5">{aksi}</div>}
      </div>
      {angka && angka.length > 0 && (
        <div className="flex flex-wrap gap-px overflow-hidden rounded-b-2xl border-t border-line bg-line">
          {angka.map((x) => (
            <div key={x.label} className="min-w-[140px] flex-1 bg-ink-2 px-4 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-dim">{x.label}</div>
              <div className={`font-serif text-lg font-bold tabular-nums ${x.nada ? warna[x.nada] : "text-cream"}`}>{x.nilai}</div>
            </div>
          ))}
        </div>
      )}
      {children && <div className="border-t border-line px-4 py-3">{children}</div>}
    </section>
  );
}

/** Tombol aksi kepala halaman. `utama` = tombol emas. */
export function TombolAksi({ utama, onClick, children, disabled }: {
  utama?: boolean; onClick: () => void; children: ReactNode; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`min-h-[38px] rounded-lg px-3.5 text-[12px] font-bold disabled:opacity-40 ${
        utama ? "bg-amber text-ink hover:bg-amber-deep" : "border border-line bg-ink text-cream hover:border-amber hover:text-amber"
      }`}>{children}</button>
  );
}

/** Kelompok bagian berjudul kecil — memisahkan "perlu tindakan" dari "pekerjaan rutin". */
export function Kelompok({ judul, ket, nada, children }: {
  judul: string; ket?: string; nada?: "merah" | "amber"; children: ReactNode;
}) {
  const garis = nada === "merah" ? "border-red-500/40" : nada === "amber" ? "border-amber/40" : "border-line";
  const teks = nada === "merah" ? "text-red-300" : nada === "amber" ? "text-amber" : "text-dim";
  return (
    <div className={`space-y-4 rounded-2xl border border-dashed ${garis} p-3`}>
      <div>
        <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${teks}`}>{judul}</div>
        {ket && <div className="text-[11px] text-dim">{ket}</div>}
      </div>
      {children}
    </div>
  );
}

/** Dua kolom di layar lebar, satu kolom di HP. */
export function DuaKolom({ kiri, kanan }: { kiri: ReactNode; kanan: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">{kiri}</div>
      <div className="min-w-0 space-y-6">{kanan}</div>
    </div>
  );
}

/** Keadaan kosong yang seragam. */
export function Kosong({ teks }: { teks: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-ink-2/60 px-4 py-6 text-center text-[13px] text-dim">
      {teks}
    </div>
  );
}

/**
 * Layar lebar (≥ 1024 px, komputer kasir)? Dipakai panel yang punya tata
 * letak berbeda di komputer dan di HP — mis. panel meja tiga kolom.
 */
export function useLayarLebar(min = 1024): boolean {
  const kueri = `(min-width: ${min}px)`;
  const [lebar, setLebar] = useState(() => typeof window !== "undefined" && window.matchMedia(kueri).matches);
  useEffect(() => {
    const m = window.matchMedia(kueri);
    const ubah = () => setLebar(m.matches);
    ubah();
    m.addEventListener("change", ubah);
    return () => m.removeEventListener("change", ubah);
  }, [kueri]);
  return lebar;
}
