/**
 * TREN PENJUALAN — satu kartu per bisnis.
 *
 * SPL Sport dan Smokehouse beda lokasi dan beda orang, jadi tiap bisnis punya
 * grafiknya sendiri, bukan dua warna di satu grafik. Warna hanya menandai
 * bisnisnya; angka selalu memakai warna teks supaya tetap terbaca.
 *
 * Amber merek sedikit di atas pita terang palet grafik, tapi kedua warna tidak
 * pernah berada di satu grafik, dan pembedaan warnanya lolos uji buta warna.
 * Tiap grafik punya tooltip dan tabel angka, jadi tidak ada informasi yang
 * hanya bisa dibaca dari warna atau tinggi batang.
 */
import { useMemo, useState } from "react";
import { useAdmin, trenBisnis, type TitikTren, type TrenBisnis } from "../../lib/adminStore";
import { fmtDateLong, rupiah } from "../../lib/core";
import { VENUE_LABEL, type Venue } from "../../data/venue";

const WARNA: Record<Venue, string> = { spl: "bg-amber-deep", smh: "bg-brick-lit" };

/** Angka sumbu dan label ringkas: 850 rb, 1,2 jt. */
function ringkas(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} rb`;
  // Sumbu jumlah transaksi bisa berhenti di 1, dan setengah transaksi tidak ada artinya.
  return Number.isInteger(n) ? String(n) : "";
}

/** Batas atas sumbu: angka bulat 1, 2, atau 5 kali kelipatan sepuluh. */
function atasSumbu(maks: number) {
  if (maks <= 0) return 1;
  const pangkat = 10 ** Math.floor(Math.log10(maks));
  const langkah = [1, 2, 5, 10].find((x) => x * pangkat >= maks) ?? 10;
  return langkah * pangkat;
}

function Batang({ titik, warna, formatNilai, keterangan }: {
  titik: TitikTren[]; warna: string; formatNilai: (n: number) => string; keterangan: string;
}) {
  const [aktif, setAktif] = useState<number | null>(null);
  const maks = Math.max(...titik.map((x) => x.nilai), 0);
  const atas = atasSumbu(maks);
  const puncak = titik.findIndex((x) => x.nilai === maks && maks > 0);
  const tampil = aktif === null ? null : titik[aktif];
  return (
    <div className="relative" role="img" aria-label={keterangan}>
      <div className="grid grid-cols-[34px_1fr] gap-1.5">
        <div className="flex h-36 flex-col justify-between text-right text-[10px] tabular-nums text-dim">
          <span>{ringkas(atas)}</span>
          <span>{ringkas(atas / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative h-36 border-b border-line">
          <div className="absolute inset-x-0 top-0 border-t border-line/60" />
          <div className="absolute inset-x-0 top-1/2 border-t border-line/60" />
          <div className="absolute inset-0 flex items-end gap-0.5">
            {titik.map((x, i) => (
              <button key={x.kunci} type="button" aria-label={`${x.judul}: ${formatNilai(x.nilai)}`}
                onMouseEnter={() => setAktif(i)} onMouseLeave={() => setAktif(null)}
                onFocus={() => setAktif(i)} onBlur={() => setAktif(null)}
                onClick={() => setAktif(aktif === i ? null : i)}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center">
                {i === puncak && (
                  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-cream"
                    style={{ bottom: `calc(${(x.nilai / atas) * 100}% + 2px)` }}>
                    {ringkas(x.nilai)}
                  </span>
                )}
                <span className={`block w-full max-w-[24px] rounded-t ${warna} ${x.berjalan ? "opacity-55" : ""} ${aktif === i ? "brightness-125" : ""}`}
                  style={{ height: `${(x.nilai / atas) * 100}%`, minHeight: x.nilai > 0 ? 2 : 0 }} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-[40px] mt-1 flex gap-0.5">
        {titik.map((x, i) => (
          <span key={x.kunci} className="min-w-0 flex-1 truncate text-center text-[10px] text-dim">
            {titik.length <= 12 || i % 2 === 0 ? x.label : ""}
          </span>
        ))}
      </div>
      {tampil && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-line-2 bg-ink px-2.5 py-1.5 text-[12px] shadow-lg">
          <div className="text-mute">{tampil.judul}</div>
          <div className="font-bold tabular-nums text-cream">{formatNilai(tampil.nilai)}</div>
          {tampil.tab !== undefined && <div className="text-dim">{tampil.tab} transaksi</div>}
        </div>
      )}
    </div>
  );
}

function Tabel({ titik, formatNilai }: { titik: TitikTren[]; formatNilai: (n: number) => string }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[12px] text-mute hover:text-amber">Lihat angka</summary>
      <table className="mt-1 w-full text-[12px]">
        <tbody className="divide-y divide-line">
          {titik.map((x) => (
            <tr key={x.kunci}>
              <td className="py-1 text-mute">{x.judul}{x.berjalan ? " (berjalan)" : ""}</td>
              <td className="py-1 text-right tabular-nums text-cream">{formatNilai(x.nilai)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const Kartu = ({ label, nilai, ket }: { label: string; nilai: string; ket: string }) => (
  <div className="rounded-xl border border-line bg-ink p-2.5">
    <div className="text-[10px] uppercase tracking-wider text-dim">{label}</div>
    <div className="font-serif text-[17px] font-bold tabular-nums text-cream">{nilai}</div>
    <div className="text-[11px] leading-snug text-mute">{ket}</div>
  </div>
);

function arah(x: { nilai: number; lalu: number }, nama: string) {
  if (x.lalu <= 0) return x.nilai > 0 ? `Belum ada pembanding ${nama}` : "Belum ada penjualan";
  const persen = Math.round(((x.nilai - x.lalu) / x.lalu) * 100);
  if (persen === 0) return `Sama dengan ${nama}`;
  return `${persen > 0 ? "▲ Naik" : "▼ Turun"} ${Math.abs(persen)}% dari ${nama}`;
}

function Bisnis({ t, v }: { t: TrenBisnis; v: Venue }) {
  const [skala, setSkala] = useState<"harian" | "mingguan" | "bulanan">("mingguan");
  const titik = t[skala];
  const warna = WARNA[v];
  const nama = VENUE_LABEL[v];
  const rp = (n: number) => rupiah(n);
  const rataHari = (n: number) => rupiah(Math.round(n));
  const judulSkala = { harian: "14 hari terakhir", mingguan: "12 minggu terakhir", bulanan: "12 bulan terakhir" }[skala];
  return (
    <section className="rounded-2xl border border-line bg-ink-2 p-3">
      <h2 className="flex items-center gap-2 font-display text-[16px] uppercase tracking-wide text-cream">
        <span aria-hidden className={`h-3 w-3 rounded-sm ${warna}`} />{nama}
      </h2>

      {t.kosong ? (
        <p className="mt-2 text-[13px] text-dim">Belum ada penjualan untuk dianalisa.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Kartu label="Minggu ini" nilai={rp(t.mingguIni.nilai)} ket={arah(t.mingguIni, "minggu lalu")} />
            <Kartu label="Bulan ini" nilai={rp(t.bulanIni.nilai)} ket={arah(t.bulanIni, "bulan lalu")} />
            <Kartu label="Hari paling ramai" nilai={t.hariRamai?.nama ?? "-"}
              ket={t.hariRamai ? `Rata-rata ${rataHari(t.hariRamai.rata)}` : "Data belum cukup"} />
            <Kartu label="Rata-rata per transaksi" nilai={rataHari(t.rataTransaksi)} ket="30 hari terakhir" />
            {t.hariTerbaik && (
              <Kartu label="Penjualan tertinggi" nilai={rp(t.hariTerbaik.nilai)} ket={fmtDateLong(t.hariTerbaik.bizDate)} />
            )}
            <Kartu label="Rata-rata per hari" nilai={rataHari(t.rataHari)} ket="Hari yang ada penjualan" />
            {t.jamRamai && (
              <Kartu label="Jam paling ramai" nilai={t.jamRamai.label} ket={`${t.jamRamai.tab} transaksi dalam 28 hari`} />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[12px] font-semibold text-cream">Penjualan {judulSkala}</h3>
            <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Skala grafik ${nama}`}>
              {(["harian", "mingguan", "bulanan"] as const).map((k) => (
                <button key={k} onClick={() => setSkala(k)} aria-pressed={skala === k}
                  className={`min-h-[36px] rounded-lg border px-2 text-[12px] capitalize ${
                    skala === k ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-mute"
                  }`}>{k}</button>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <Batang titik={titik} warna={warna} formatNilai={rp} keterangan={`Grafik batang penjualan ${nama}, ${judulSkala}`} />
            <p className="mt-1 text-[11px] text-dim">Batang pudar berarti periodenya masih berjalan.</p>
            <Tabel titik={titik} formatNilai={rp} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[12px] font-semibold text-cream">Rata-rata per hari dalam seminggu</h3>
              <Batang titik={t.hariMinggu} warna={warna} formatNilai={rataHari} keterangan={`Rata-rata penjualan ${nama} per hari`} />
              <Tabel titik={t.hariMinggu} formatNilai={rataHari} />
            </div>
            <div>
              <h3 className="mb-2 text-[12px] font-semibold text-cream">Jumlah transaksi per jam</h3>
              <Batang titik={t.jam} warna={warna} formatNilai={(n) => `${n} transaksi`} keterangan={`Jumlah transaksi ${nama} per jam`} />
              <Tabel titik={t.jam} formatNilai={(n) => `${n} transaksi`} />
            </div>
          </div>
          {t.tercampur && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber">
              Sebagian hari lama tidak bisa dipisah per tempat, jadi tidak ikut dihitung di sini.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default function TrenPenjualan({ venue, hariIni }: { venue?: Venue; hariIni: string }) {
  const { a } = useAdmin();
  const daftar = useMemo(
    () => (venue ? [venue] : (["spl", "smh"] as const)).map((v) => ({ v, t: trenBisnis(a, hariIni, v) })),
    [a, hariIni, venue],
  );
  return (
    <div className="space-y-3">
      {daftar.map(({ v, t }) => <Bisnis key={v} t={t} v={v} />)}
    </div>
  );
}
