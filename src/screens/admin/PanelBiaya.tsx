/**
 * BIAYA HARIAN — baris "Jam · Deskripsi · Nilai" di struk KAS KASIR.
 *
 * Dipakai di tab Shift, tempat kasir mengeluarkan uang, dan di Rekap Harian,
 * tempat manager memeriksanya. Keduanya menulis ke catatan yang sama.
 */
import { useState } from "react";
import { useAdmin, biayaHari, shiftDi, type Biaya } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { jam } from "./AdminShell";
import type { Venue } from "../../data/venue";

const LABEL_SUMBER: Record<Biaya["sumber"], string> = { laci: "Laci kasir", rekening: "Rekening" };

export function PanelBiaya({ bizDate, venue, bisaTambah, polos, lipat }: {
  bizDate: string; venue: Venue; bisaTambah: boolean;
  /** Tanpa bingkai sendiri — dipakai di dalam kartu Rekap. */
  polos?: boolean;
  /** Formulir catat disembunyikan di balik tombol "+ Catat biaya" (Rekap). */
  lipat?: boolean;
}) {
  const [buka, setBuka] = useState(!lipat);
  const { a, dispatchA, allow, peek } = useAdmin();
  const [keterangan, setKeterangan] = useState("");
  const [nilai, setNilai] = useState("");
  // Laci hanya bisa dipilih kalau shift yang buka memang milik venue ini.
  const laciAda = !!shiftDi(a, venue, Date.now());
  const [pilihan, setSumber] = useState<Biaya["sumber"]>("laci");
  const sumber: Biaya["sumber"] = laciAda ? pilihan : "rekening";
  const [kabar, setKabar] = useState<string | null>(null);
  const daftar = biayaHari(a, bizDate, venue);
  const n = Number(nilai) || 0;

  function simpan() {
    const sebelum = peek().biaya?.length ?? 0;
    const tolak = dispatchA({ t: "catatBiaya", venue, keterangan, nilai: n, sumber });
    if ((peek().biaya?.length ?? 0) === sebelum) {
      setKabar(tolak ?? "Biaya belum tercatat.");
      return;
    }
    setKeterangan(""); setNilai(""); setKabar(`${rupiah(n)} tercatat.`);
    setTimeout(() => setKabar(null), 3500);
  }

  return (
    <div className={polos ? "" : "rounded-xl border border-line bg-ink-2 p-3"}>
      {daftar.length > 0 ? (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-dim">
              <th className="w-12 py-1 text-left font-bold">Jam</th>
              <th className="py-1 text-left font-bold">Deskripsi</th>
              <th className="py-1 text-right font-bold">Nilai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {daftar.map((b) => (
              <tr key={b.id}>
                <td className="py-1.5 align-top tabular-nums text-mute">{jam(b.at)}</td>
                <td className="py-1.5 pr-2 text-cream">
                  {b.keterangan}
                  <span className="block text-[11px] text-dim">{LABEL_SUMBER[b.sumber]} · {b.oleh}</span>
                </td>
                <td className="py-1.5 text-right align-top tabular-nums text-cream">
                  {rupiah(b.nilai)}
                  {allow("hapusBiaya") && a.biaya?.some((x) => x.id === b.id) && (
                    <button onClick={() => dispatchA({ t: "hapusBiaya", id: b.id })}
                      className="ml-2 min-h-[32px] text-[11px] text-red-300 underline underline-offset-2">hapus</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[12px] text-dim">Belum ada biaya tercatat.</p>
      )}

      {bisaTambah && allow("catatBiaya") && !buka && (
        <button onClick={() => setBuka(true)}
          className="mt-2 min-h-[38px] w-full rounded-lg border border-dashed border-line-2 text-[12px] font-semibold text-mute hover:border-amber hover:text-amber">
          + Catat biaya
        </button>
      )}
      {bisaTambah && allow("catatBiaya") && buka && (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          <input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} maxLength={80}
            placeholder="Deskripsi, misalnya beli es batu"
            className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <input value={nilai} inputMode="numeric" placeholder="Nilai (Rp)"
              onChange={(e) => setNilai(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
              className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-right text-[13px] tabular-nums text-cream placeholder:text-left placeholder:text-dim focus:border-amber focus:outline-none" />
            <div className="grid grid-cols-2 gap-1">
              {(["laci", "rekening"] as const).map((x) => (
                <button key={x} onClick={() => setSumber(x)} aria-pressed={sumber === x} disabled={x === "laci" && !laciAda}
                  className={`min-h-[44px] rounded-lg border px-1 text-[12px] disabled:opacity-35 ${
                    sumber === x ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-mute"
                  }`}>{LABEL_SUMBER[x]}</button>
              ))}
            </div>
          </div>
          <button onClick={simpan} disabled={!keterangan.trim() || n <= 0}
            className="min-h-[44px] w-full rounded-lg bg-amber text-[13px] font-bold text-ink hover:bg-amber-deep disabled:opacity-35">
            Catat biaya
          </button>
          <p className="text-[11px] leading-snug text-dim">
            {laciAda
              ? "Biaya dari laci mengurangi kas seharusnya di shift ini. Biaya rekening hanya mengurangi pendapatan."
              : "Tidak ada shift tempat ini yang buka, jadi biaya hanya bisa dicatat dari rekening."}
          </p>
        </div>
      )}
      {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}
    </div>
  );
}
