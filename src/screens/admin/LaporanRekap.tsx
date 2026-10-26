/**
 * LAPORAN REKAP — panel rekap untuk KRU KASIR.
 *
 * Permintaan pemilik 19 Okt 2026: *"pada kru kasir, panel rekap ada tapi
 * hanya fitur laporan rekap. Filter data: tanggal/hari/minggu/bulan, resto,
 * bar, counter, billiard."*
 *
 * Sengaja BUKAN tab Rekap yang lengkap. Tab Rekap memuat kas shift, pajak,
 * MDR gateway, selisih laci, dan uang bersih yang masuk rekening — angka
 * pemilik, bukan angka orang lantai. Yang dibutuhkan kasir cuma satu: apa
 * yang terjual hari ini, dan berapa. Memberi akses ke seluruh tab Rekap
 * supaya kasir bisa melihat satu angka itu berarti membuka sepuluh angka
 * lain yang tidak ada urusannya dengan pekerjaannya.
 *
 * Empat saringan lininya mengikuti cara venue ini menghitung:
 *
 *   Billiard — sewa meja (bukan barang)
 *   Counter  — rokok & botolan yang diserahkan langsung (station `billiard`)
 *   Bar      — minuman (station `bar`)
 *   Resto    — makanan (station `kitchen`)
 */
import { useMemo, useState } from "react";
import {
  useAdmin, recapRange, penjualanProduk, periodeRange, clampRange,
  businessDateOf, shiftDate, type RekapPeriode,
} from "../../lib/adminStore";
import { rupiah, fmtDateLong } from "../../lib/core";
import { cetakStruk } from "../../lib/cetak";
import { VENUE_LABEL } from "../../data/venue";
import { useVenueAktif } from "../../lib/venueAktif";
import { jam } from "./AdminShell";

/** Saringan lini. `semua` = semuanya, termasuk sewa meja. */
type Lini = "semua" | "billiard" | "counter" | "bar" | "resto";

const LABEL: Record<Lini, string> = {
  semua: "Semua", billiard: "Billiard", counter: "Counter", bar: "Bar", resto: "Resto",
};

/** Station barang yang masuk tiap lini. `billiard` tidak punya barang — itu sewa meja. */
const STATION: Partial<Record<Lini, "kitchen" | "bar" | "billiard">> = {
  resto: "kitchen", bar: "bar", counter: "billiard",
};

const PERIODE: [RekapPeriode, string][] = [
  ["hari", "Hari"], ["minggu", "Minggu"], ["bulan", "Bulan"], ["custom", "Pilih tanggal"],
];

export default function LaporanRekap() {
  const { a } = useAdmin();
  const venue = useVenueAktif();
  const hariIni = businessDateOf(Date.now());
  const [periode, setPeriode] = useState<RekapPeriode>("hari");
  const [ct, setCt] = useState({ dari: shiftDate(hariIni, -6), sampai: hariIni });
  const [lini, setLini] = useState<Lini>("semua");
  const [cetak, setCetak] = useState<number | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const rentang = periode === "custom"
    ? clampRange(ct.dari, ct.sampai)
    : { ...periodeRange(hariIni, periode), dipotong: false };
  const { dari, sampai } = rentang;

  const uang = useMemo(() => recapRange(a, dari, sampai, venue), [a, dari, sampai, venue]);
  const produk = useMemo(() => penjualanProduk(a, dari, sampai, venue), [a, dari, sampai, venue]);

  /** Baris barang sesudah disaring lininya. Lini `billiard` tidak punya barang. */
  const baris = useMemo(() => {
    if (lini === "billiard") return [];
    const st = STATION[lini];
    return st ? produk.baris.filter((b) => b.station === st) : produk.baris;
  }, [produk, lini]);

  const sewaMeja = uang.money.billiard;
  const nilaiBarang = baris.reduce((n, b) => n + b.total, 0);
  const porsi = baris.reduce((n, b) => n + b.qty, 0);
  /** Sewa meja ikut dihitung hanya kalau liniannya memang memuatnya. */
  const ikutSewa = lini === "semua" || lini === "billiard";
  const total = nilaiBarang + (ikutSewa ? sewaMeja : 0);

  async function lakukanCetak() {
    setCetak(Date.now());
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const hasil = await cetakStruk();
    setKabar(hasil.ok ? "Perintah cetak terkirim." : `Gagal mencetak: ${hasil.alasan ?? "printer tidak menjawab"}`);
    setTimeout(() => setKabar(null), 4000);
    setCetak(null);
  }

  return (
    <div className="space-y-4 pb-6">
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Laporan rekap · {VENUE_LABEL[venue]}
        </h2>

        <div className="grid grid-cols-4 gap-2">
          {PERIODE.map(([p, label]) => (
            <button key={p} onClick={() => setPeriode(p)} aria-pressed={periode === p}
              className={`min-h-[40px] rounded-xl border px-1 text-[12px] font-semibold ${
                periode === p ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
              }`}>{label}</button>
          ))}
        </div>

        {periode === "custom" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([["dari", "Dari"], ["sampai", "Sampai"]] as const).map(([k, label]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[11px] text-dim">{label}</span>
                <input type="date" value={ct[k]} max={hariIni}
                  onChange={(e) => setCt({ ...ct, [k]: e.target.value })}
                  className="min-h-[42px] w-full rounded-lg border border-line bg-ink px-2 text-[13px] text-cream" />
              </label>
            ))}
          </div>
        )}

        <div className="no-bar mt-2 flex gap-1.5 overflow-x-auto">
          {(Object.keys(LABEL) as Lini[]).map((v) => (
            <button key={v} onClick={() => setLini(v)} aria-pressed={lini === v}
              className={`min-h-[38px] shrink-0 rounded-lg border px-3 text-[12px] font-semibold ${
                lini === v ? "border-brick-lit bg-brick text-cream" : "border-line bg-ink-2 text-mute"
              }`}>{LABEL[v]}</button>
          ))}
        </div>

        <p className="mt-2 text-[11px] text-dim">
          {dari === sampai ? fmtDateLong(dari) : `${dari} s/d ${sampai}`}
          {rentang.dipotong && " · rentang dipotong ke batas yang tersimpan"}
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-ink-2">
        <div className="flex items-baseline justify-between bg-amber/10 px-4 py-3">
          <span className="text-sm font-semibold text-cream">
            {lini === "semua" ? "Total penjualan" : `Penjualan ${LABEL[lini]}`}
          </span>
          <span className="font-serif text-2xl font-bold tabular-nums text-amber">{rupiah(total)}</span>
        </div>
        <div className="divide-y divide-line text-[13px]">
          {ikutSewa && (
            <Baris k="Sewa meja billiard" v={rupiah(sewaMeja)} />
          )}
          {lini !== "billiard" && (
            <Baris k={`Barang terjual · ${porsi} porsi`} v={rupiah(nilaiBarang)} />
          )}
          {lini === "semua" && uang.money.discount > 0 && (
            <Baris k="Diskon" v={`− ${rupiah(uang.money.discount)}`} />
          )}
        </div>
      </section>

      {kabar && <p role="status" className="text-[12px] text-amber">{kabar}</p>}

      <button onClick={() => void lakukanCetak()}
        className="min-h-[46px] w-full rounded-xl border border-line bg-ink-2 text-[13px] text-cream">
        Cetak rekap penjualan
      </button>

      <section>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Rincian barang · {baris.length} jenis
        </h3>
        {baris.length === 0 ? (
          <p className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-[13px] text-dim">
            {lini === "billiard"
              ? "Billiard hanya memuat sewa meja — tidak ada barang."
              : "Belum ada barang terjual di rentang ini."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-ink-2">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-dim">
                  <th className="w-10 px-2 py-1.5 text-left">Qty</th>
                  <th className="px-2 py-1.5 text-left">Deskripsi</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {baris.map((b) => (
                  <tr key={b.itemId}>
                    <td className="px-2 py-1 tabular-nums text-mute">{b.qty}</td>
                    <td className="px-2 py-1 text-cream">{b.nama}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-cream">{rupiah(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {produk.hariTanpaRincian.length > 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            {produk.hariTanpaRincian.length} hari di rentang ini rincian barangnya sudah dilepas
            dari jejak — angkanya ikut di total, tapi tidak bisa dipecah per barang lagi.
          </p>
        )}
      </section>

      {/* ── Lembar cetak: persis susunan struk rekap yang dipakai pemilik ── */}
      {cetak !== null && (
        <div id="struk" className="cetak-saja bg-white p-2 text-[11px] text-black">
          <div className="text-center">
            <div className="text-[13px] font-bold uppercase">Rekap Penjualan</div>
            <div className="text-[12px] font-bold uppercase">{VENUE_LABEL[venue]}</div>
            <div className="mt-1">{dari === sampai ? fmtDateLong(dari) : `${dari} s/d ${sampai}`}</div>
            <div>Kasir : {a.me?.name ?? "-"}</div>
            {lini !== "semua" && <div className="font-bold">Lini : {LABEL[lini]}</div>}
          </div>
          <div className="my-1 border-t border-dashed border-black" />
          <table className="w-full">
            <thead>
              <tr className="border-b border-black">
                <th className="w-7 text-left">QTY</th>
                <th className="text-left">DESKRIPSI</th>
                <th className="w-20 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.itemId}>
                  <td className="align-top tabular-nums">{b.qty}</td>
                  <td className="align-top uppercase">{b.nama}</td>
                  <td className="text-right align-top tabular-nums">{rupiah(b.total)}</td>
                </tr>
              ))}
              {ikutSewa && sewaMeja > 0 && (
                <tr>
                  <td className="align-top">—</td>
                  <td className="align-top uppercase">Sewa meja billiard</td>
                  <td className="text-right align-top tabular-nums">{rupiah(sewaMeja)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="my-1 border-t border-black" />
          <div className="flex justify-between font-bold">
            <span>TOTAL {porsi} PORSI</span>
            <span className="tabular-nums">{rupiah(total)}</span>
          </div>
          <div className="mt-2 text-center text-[10px]">
            Dicetak {jam(cetak)} oleh {a.me?.name ?? "-"}
          </div>
        </div>
      )}
    </div>
  );
}

function Baris({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-2">
      <span className="text-mute">{k}</span>
      <span className="font-serif tabular-nums text-cream">{v}</span>
    </div>
  );
}
