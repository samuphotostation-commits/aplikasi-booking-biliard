/**
 * LAYAR MENGHADAP TAMU (rute /tampil)
 *
 * Dibuka sekali di monitor atau tablet yang menghadap tamu di depan kasir.
 * Isinya cuma tiga keadaan — menunggu, QR, lunas — dengan huruf besar supaya
 * terbaca dari seberang meja.
 *
 * Tidak ada tombol apa pun di sini, dan itu disengaja: layar ini dilihat
 * siapa saja yang lewat, jadi tidak boleh ada satu pun hal yang bisa ditekan
 * orang lain untuk mengubah uang. Yang menutup tagihan tetap kasir.
 */
import { useEffect, useState } from "react";
import { QrGambar } from "../components/QrGambar";
import { rupiah } from "../lib/core";
import { dengarTampil, tampilTerakhir, type TampilTamu as Isi } from "../lib/tampilTamu";

export default function TampilTamu() {
  const [isi, setIsi] = useState<Isi>(() => tampilTerakhir());

  useEffect(() => dengarTampil(setIsi), []);

  // Monitor pelanggan menyala semalaman: jangan biarkan layarnya tidur.
  useEffect(() => {
    let lepas: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((w) => { lepas = w; }).catch(() => { /* tidak didukung */ });
    return () => { void lepas?.release().catch(() => { /* sudah lepas */ }); };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 py-10 text-center">
      <div className="mb-8">
        <div className="font-serif text-2xl font-bold tracking-widest text-amber">SPL</div>
        <div className="text-[12px] uppercase tracking-[0.3em] text-dim">Sports Pool Lounge</div>
      </div>

      {isi.jenis === "diam" && (
        <>
          <p className="font-serif text-3xl text-cream">Selamat datang</p>
          <p className="mt-3 text-base text-dim">Silakan ke kasir untuk membayar.</p>
        </>
      )}

      {isi.jenis === "qr" && (
        <>
          <p className="text-sm uppercase tracking-[0.2em] text-dim">{isi.ringkas}</p>
          <p className="mt-1 font-serif text-5xl font-bold tabular-nums text-amber">{rupiah(isi.nominal)}</p>
          <div className="mt-6 rounded-2xl bg-white p-4">
            <QrGambar payload={isi.qrString} size={320} />
          </div>
          <p className="mt-6 max-w-md text-lg leading-snug text-cream">
            Pindai dengan m-banking atau e-wallet apa pun
          </p>
          <p className="mt-1 text-sm text-dim">Layar ini berubah sendiri setelah pembayaran masuk.</p>
        </>
      )}

      {isi.jenis === "lunas" && (
        <>
          <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-emerald-400">
            <span className="text-6xl text-emerald-400" aria-hidden>✓</span>
          </div>
          <p className="mt-6 font-serif text-5xl font-bold text-emerald-300">LUNAS</p>
          <p className="mt-2 font-serif text-3xl tabular-nums text-cream">{rupiah(isi.nominal)}</p>
          <p className="mt-4 text-base text-dim">Terima kasih, sampai ketemu lagi.</p>
        </>
      )}

      {isi.jenis === "gagal" && (
        <>
          <p className="font-serif text-3xl text-amber">Pembayaran belum selesai</p>
          <p className="mt-3 max-w-md text-base leading-snug text-cream">{isi.pesan}</p>
          <p className="mt-2 text-sm text-dim">Silakan tanya kasir.</p>
        </>
      )}
    </div>
  );
}
