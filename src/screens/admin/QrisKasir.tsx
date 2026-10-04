import { useEffect, useRef, useState } from "react";
import { QrGambar } from "../../components/QrGambar";
import { rupiah } from "../../lib/core";
import { qrisKasir, statusQris, type QrisTagihan } from "../../lib/qris";

/* ═══════════════════════════════════════════════════════════════════
   QRIS DINAMIS DI MEJA KASIR

   Dulu tombol "QRIS di kasir" langsung menutup tagihan tanpa menampilkan
   apa pun — tamu harus memakai stiker QR statis dan mengetik sendiri
   nominalnya, yang gampang salah dan sulit dicocokkan. Sekarang kasir bisa
   memunculkan QR dengan NOMINAL TEPAT di layar.

   Yang menutup tab tetap KASIR lewat tombolnya sendiri. Panel ini hanya
   menyediakan QR dan memberi tahu begitu gateway memastikan uangnya masuk —
   jadi tidak ada jalan baru untuk mengubah uang dari luar layar kasir.
   ═══════════════════════════════════════════════════════════════════ */

const JEDA_MS = 4000;

export function QrisKasir({ amount, ringkas, kode }: { amount: number; ringkas: string; kode?: string }) {
  const [tagihan, setTagihan] = useState<QrisTagihan | null>(null);
  const [status, setStatus] = useState<"diam" | "membuat" | "menunggu" | "lunas" | "gagal">("diam");
  const [alasan, setAlasan] = useState<string | null>(null);
  const diminta = useRef(false);
  /**
   * Nominal SAAT QR DIBUAT. Meteran open bill terus berjalan, jadi tagihan
   * bisa naik sesudah QR terpampang — dan tamu akan membayar angka yang lama.
   * Selisihnya kecil tapi nyata, dan kasir tidak akan sadar kalau tidak
   * diberi tahu. Di sini dibandingkan terus dan diperingatkan.
   */
  const [nominalQr, setNominalQr] = useState<number | null>(null);

  async function buat() {
    if (diminta.current || !(amount > 0)) return;
    diminta.current = true;
    setStatus("membuat");
    setAlasan(null);
    const h = await qrisKasir(amount, ringkas, kode);
    if (h.ok) { setTagihan(h.tagihan); setNominalQr(amount); setStatus("menunggu"); return; }
    diminta.current = false;
    setStatus("gagal");
    setAlasan("belumAktif" in h
      ? "QRIS belum dinyalakan pemilik — terima tunai/EDC, atau pakai QR statis."
      : h.alasan);
  }

  // Tanya gateway sampai lunas. Yang memutuskan tetap gateway, bukan layar ini.
  useEffect(() => {
    if (!tagihan || status !== "menunggu") return;
    const iv = setInterval(async () => {
      const st = await statusQris(tagihan.ref);
      if (st === "lunas") setStatus("lunas");
      else if (st === "gagal" || st === "kedaluwarsa") { setStatus("gagal"); setAlasan("Tagihan kedaluwarsa — buat QR baru."); }
    }, JEDA_MS);
    return () => clearInterval(iv);
  }, [tagihan, status]);

  if (status === "diam") {
    return (
      <button type="button" onClick={() => void buat()} disabled={!(amount > 0)}
        className="min-h-[44px] w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4
          text-[13px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40">
        Tampilkan QRIS dinamis · {rupiah(amount)}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/8 p-4 text-center">
      {status === "membuat" && <p className="text-[13px] text-cream">Membuat kode QR…</p>}

      {tagihan?.qrString && status !== "gagal" && (
        <div className="flex flex-col items-center gap-2">
          <QrGambar payload={tagihan.qrString} size={200} />
          <div className="font-serif text-2xl font-bold tabular-nums text-amber">{rupiah(amount)}</div>
        </div>
      )}

      {status === "menunggu" && nominalQr !== null && amount !== nominalQr && (
        <div className="mt-2 rounded-lg border border-amber/50 bg-amber/10 px-3 py-2">
          <p className="text-[12px] font-semibold text-amber">
            Tagihan sudah berubah jadi {rupiah(amount)}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-cream">
            QR ini masih untuk {rupiah(nominalQr)} — meterannya jalan terus. Buat QR baru
            supaya tamu membayar angka yang benar.
          </p>
          <button type="button" onClick={() => { diminta.current = false; setTagihan(null); setNominalQr(null); setStatus("diam"); }}
            className="mt-2 min-h-[36px] w-full rounded-lg border border-amber/50 text-[12px] font-semibold text-amber">
            Buat QR baru
          </button>
        </div>
      )}

      {status === "menunggu" && (
        <p className="mt-2 text-[12px] leading-snug text-cream">
          Minta tamu scan dengan m-banking / e-wallet apa pun.
          Layar ini berubah sendiri begitu pembayaran masuk.
        </p>
      )}

      {status === "lunas" && (
        <div className="mt-2">
          <p className="text-sm font-bold text-emerald-300">Pembayaran diterima · {rupiah(amount)}</p>
          <p className="mt-1 text-[12px] leading-snug text-cream">
            Sekarang tekan <span className="font-semibold">QRIS di kasir</span> di bawah untuk menutup tagihannya.
          </p>
        </div>
      )}

      {status === "gagal" && (
        <div>
          <p className="text-[13px] text-amber">{alasan ?? "Kode QR gagal dibuat."}</p>
          <button type="button" onClick={() => { diminta.current = false; void buat(); }}
            className="mt-2 min-h-[38px] w-full rounded-xl border border-line text-[12px] text-mute hover:border-amber hover:text-amber">
            Coba lagi
          </button>
        </div>
      )}

      {tagihan && (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-dim">{tagihan.ref}</p>
      )}
    </div>
  );
}
