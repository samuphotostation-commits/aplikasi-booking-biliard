import { rupiah } from "../../lib/core";

/**
 * LANGKAH TERAKHIR SEBELUM UANG TERCATAT.
 *
 * Temuan audit 7 Nov 2026: tombol metode pembayaran dulu langsung menutup tab,
 * jadi salah tekan Tunai padahal tamu membayar QRIS langsung masuk laporan dan
 * kas shift, tanpa ada jalan koreksi. Di sini kasir melihat total dan metodenya
 * sekali lagi sebelum menekan.
 */
export function KonfirmasiBayar({ judul, total, metode, tunai = 0, tombol, onYa, onBatal, pesan }: {
  judul: string;
  total: number;
  metode: string;
  /** Uang tunai yang diterima. 0 = tidak diisi, jadi tidak ada hitungan kembalian. */
  tunai?: number;
  tombol: string;
  onYa: () => void;
  onBatal: () => void;
  pesan?: string | null;
}) {
  const kurang = tunai > 0 && tunai < total;
  return (
    <div className="rounded-2xl border border-amber/60 bg-amber/10 p-4" role="group" aria-label={judul}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber">{judul}</div>
      <div className="mt-2 font-serif text-3xl font-bold tabular-nums text-cream">{rupiah(total)}</div>
      <dl className="mt-2 space-y-1 text-[14px]">
        <div className="flex justify-between gap-3">
          <dt className="text-mute">Metode</dt>
          <dd className="font-semibold text-cream">{metode}</dd>
        </div>
        {tunai > 0 && (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-mute">Uang diterima</dt>
              <dd className="tabular-nums text-cream">{rupiah(tunai)}</dd>
            </div>
            <div className={`flex justify-between gap-3 font-bold ${kurang ? "text-red-300" : "text-emerald-300"}`}>
              <dt>{kurang ? "Kurang" : "Kembalian"}</dt>
              <dd className="tabular-nums">{rupiah(Math.abs(tunai - total))}</dd>
            </div>
          </>
        )}
      </dl>
      {kurang && (
        <p className="mt-2 text-[12px] leading-snug text-red-300">
          Uang tamu belum cukup. Tekan Ganti, lalu perbaiki nominalnya.
        </p>
      )}
      {pesan && <p role="status" className="mt-2 text-[12px] leading-snug text-amber">{pesan}</p>}
      <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
        <button type="button" onClick={onBatal}
          className="min-h-[52px] rounded-xl border border-line bg-ink px-3 text-[14px] font-semibold text-cream">
          Ganti
        </button>
        <button type="button" onClick={onYa} disabled={kurang}
          className="min-h-[52px] rounded-xl bg-amber px-3 text-[15px] font-bold text-ink hover:bg-amber-deep disabled:opacity-35">
          {tombol}
        </button>
      </div>
    </div>
  );
}
