/**
 * BAGIAN KEPALA PANEL (pemilik 18 Nov 2026, PDF "revisi update SPL"):
 *   · poin 3 — tombol BUKA / TUTUP operasional di sebelah "Sinkron", dengan
 *     peringatan merah "OPERASIONAL AKAN DI…" YA / TIDAK;
 *   · poin 4 — shift hanya dua pilihan: PAGI (dibuka crew, ±11.00–18.00) dan
 *     SORE (18.00 sampai crew menekan TUTUP);
 *   · poin 5 — jam berjalan (jam:menit:detik) dan hari/tanggal di bilah atas.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAdmin, operasionalBuka, alasanBelumTutup, kelasUsulan, type KelasShift } from "../../lib/adminStore";
import type { Venue } from "../../data/venue";
import { beritahu } from "../../lib/dialog";

const HARI = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
const BULAN = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI",
  "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

/** Jam WIB yang bergerak tiap detik — hanya komponen ini yang digambar ulang. */
export function JamHidup() {
  const [kini, setKini] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setKini(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const w = new Date(kini + 7 * 3_600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="shrink-0 border-l border-line-2 pl-3 leading-none" aria-label="Jam sekarang">
      <div className="font-display tabular-nums text-cream">
        <span className="text-[22px] font-bold">{dua(w.getUTCHours())}:{dua(w.getUTCMinutes())}</span>
        <span className="text-[15px] font-bold text-mute">:{dua(w.getUTCSeconds())}</span>
      </div>
      <div className="mt-0.5 whitespace-nowrap text-[9.5px] font-semibold tracking-[0.08em] text-dim">
        {HARI[w.getUTCDay()]} | {w.getUTCDate()} • {BULAN[w.getUTCMonth()]} • {w.getUTCFullYear()}
      </div>
    </div>
  );
}

/** Label shift pendek untuk kepala: "SHIFT PAGI". */
export const labelKelas = (k: KelasShift) => (k === "pagi" ? "SHIFT PAGI" : "SHIFT SORE");

/**
 * Dua tombol mulai shift: PAGI dan SORE. Yang cocok dengan jam sekarang
 * ditonjolkan, tapi kasir tetap memilih sendiri.
 */
export function PilihShift({ venue, kecil }: { venue: Venue; kecil?: boolean }) {
  const { dispatchA } = useAdmin();
  const usul = kelasUsulan(Date.now());
  const mulai = (kelas: KelasShift) => dispatchA({ t: "openShift", openingCash: 0, venue, kelas });
  if (kecil) {
    return (
      <span className="inline-flex shrink-0 overflow-hidden rounded-full border border-red-400/60">
        {(["pagi", "sore"] as const).map((k) => (
          <button key={k} onClick={() => mulai(k)}
            className={`px-2.5 py-1 text-[11px] font-bold ${k === usul ? "bg-amber text-ink" : "bg-red-500/10 text-red-200 hover:bg-red-500/20"}`}>
            Buka {k === "pagi" ? "PAGI" : "SORE"}
          </button>
        ))}
      </span>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["pagi", "sore"] as const).map((k) => (
        <button key={k} onClick={() => mulai(k)}
          className={`min-h-[64px] rounded-xl border-2 px-2 font-semibold ${
            k === usul ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-cream hover:border-amber"}`}>
          <div className="text-[17px] font-bold tracking-wide">SHIFT {k === "pagi" ? "PAGI" : "SORE"}</div>
          <div className={`text-[11px] font-normal ${k === usul ? "text-ink/70" : "text-dim"}`}>
            {k === "pagi" ? "11.00 – 18.00" : "18.00 – tutup"}
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * Tombol OPEN / TUTUP operasional. Hijau "OPEN" = venue sedang buka (tekan
 * untuk menutup); merah "TUTUP" = venue tutup (tekan untuk membuka). Selalu
 * lewat peringatan merah YA / TIDAK.
 */
export function TombolOperasional({ venue, besar }: { venue: Venue; besar?: boolean }) {
  const { a, dispatchA, allow, peek } = useAdmin();
  const [tanya, setTanya] = useState(false);
  if (!(allow("tutupTab") || allow("kelolaMeja"))) return null;
  const buka = operasionalBuka(a, venue);

  async function ya() {
    setTanya(false);
    if (buka) {
      const alasan = alasanBelumTutup(peek(), venue);
      if (alasan) { await beritahu(`Operasional belum bisa ditutup. ${alasan}`); return; }
    }
    dispatchA({ t: "setOperasional", venue, buka: !buka });
  }

  return (
    <>
      <button onClick={() => setTanya(true)}
        title={buka ? "Operasional sedang BUKA — tekan untuk menutup" : "Operasional TUTUP — tekan untuk membuka"}
        className={`shrink-0 rounded-lg border-2 font-display font-bold uppercase tracking-[0.12em] ${
          besar ? "min-h-[52px] w-full text-[18px]" : "min-h-[34px] px-3 text-[13px]"} ${
          buka ? "border-emerald-500 bg-emerald-600/25 text-emerald-200 hover:bg-emerald-600/40"
            : "border-red-500 bg-red-700/40 text-red-100 hover:bg-red-700/60"}`}>
        {buka ? "OPEN" : "TUTUP"}
      </button>
      {tanya && createPortal(
        <div role="presentation" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4"
          onKeyDown={(e) => { if (e.key === "Escape") setTanya(false); }}>
          <div role="alertdialog" aria-modal="true" aria-label="Konfirmasi operasional"
            className="w-full max-w-[620px] rounded-2xl border-2 border-red-500 bg-red-900 px-6 py-6 text-center shadow-2xl">
            <p className="font-display text-[28px] uppercase leading-tight tracking-wide text-cream sm:text-[34px]">
              Operasional akan {buka ? "ditutup" : "dibuka"}
            </p>
            <p className="mt-1 text-[13px] text-red-100/80">
              {buka
                ? "Sesudah TUTUP hanya Menu & Stok, Gudang, Rekap, Jejak, dan Pengaturan yang bisa dibuka."
                : "Sesudah BUKA, kasir memulai shift PAGI atau SORE."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <button autoFocus onClick={() => void ya()}
                className="min-h-[56px] rounded-md bg-sky-500 font-display text-[26px] text-ink hover:bg-sky-400">YA</button>
              <button onClick={() => setTanya(false)}
                className="min-h-[56px] rounded-md bg-black font-display text-[26px] text-cream hover:bg-ink-2">TIDAK</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
