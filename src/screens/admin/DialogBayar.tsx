/**
 * DIALOG BAYAR — satu pembayaran atau SPLIT (PDF pemilik 15 Nov 2026):
 *
 *   SPLIT BILL
 *   Pembayaran 1 · Rp …… · via [QR] [Tunai]
 *   Pembayaran 2 · Rp …… · via [QR] [Tunai]
 *   (+) tambah
 *
 * Tiap baris punya nominal & metodenya sendiri (QRIS dinamis ditampilkan
 * sesuai nominal baris itu). Pembayaran diselesaikan SEKALIGUS begitu
 * jumlahnya pas — tidak pernah ada pesanan setengah lunas di laporan.
 */
import { useState } from "react";
import { useAdmin, mesinEdc } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { QrisKasir } from "./QrisKasir";
import type { PayChannel } from "../../data/live";

export type BagianBayar = { channel: PayChannel; amount: number; mesin?: string };
type Metode = { ch: BagianBayar["channel"]; label: string; mesin?: string };
type Baris = { nominal: string; metode: Metode | null; qr: boolean };

export default function DialogBayar({ total, kode, ringkas, onSelesai, onBatal, hanyaCheckout = false }: {
  total: number;
  /** SPL (pemilik 16 Nov 2026): tanpa tunai/QRIS/EDC — hanya CHECK OUT. */
  hanyaCheckout?: boolean;
  kode: string;
  ringkas: string;
  /** Kirim ke mesin; kembalikan pesan galat, atau null bila berhasil. */
  onSelesai: (bagian: BagianBayar[]) => string | null;
  onBatal: () => void;
}) {
  const { a } = useAdmin();
  const metode: Metode[] = hanyaCheckout ? [{ ch: "checkout", label: "Checkout" }] : [
    { ch: "cash", label: "Tunai" },
    { ch: "qris_online", label: "QRIS" },
    ...mesinEdc(a).map((m) => ({ ch: "edc" as const, label: `EDC ${m}`, mesin: m })),
  ];
  /** SPL: metode sudah pasti Checkout — kasir tidak perlu memilih apa-apa. */
  const awal = hanyaCheckout ? metode[0] : null;
  const [baris, setBaris] = useState<Baris[]>([{ nominal: String(total), metode: awal, qr: false }]);
  const [galat, setGalat] = useState<string | null>(null);

  const angka = (b: Baris) => Math.round(Number(b.nominal) || 0);
  const terisi = baris.reduce((n, b) => n + angka(b), 0);
  const sisa = total - terisi;
  const siap = sisa === 0 && baris.every((b) => b.metode && angka(b) > 0);
  const ubah = (i: number, isi: Partial<Baris>) => setBaris((x) => x.map((b, j) => (j === i ? { ...b, ...isi } : b)));

  /** Bagi rata ke semua baris; baris terakhir menanggung sisa pembulatan. */
  function bagiRata(n: number) {
    const per = Math.floor(total / n / 100) * 100;
    setBaris((x) => Array.from({ length: n }, (_, i) => ({
      nominal: String(i === n - 1 ? total - per * (n - 1) : per),
      metode: x[i]?.metode ?? awal, qr: false,
    })));
  }

  function tambah() {
    setBaris((x) => {
      const isi = x.reduce((n, b) => n + angka(b), 0);
      return [...x, { nominal: String(Math.max(0, total - isi)), metode: awal, qr: false }];
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-amber/50 bg-ink p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber">
          {baris.length > 1 ? `Split bill · ${baris.length} pembayaran` : "Pembayaran"}
        </span>
        <span className="ml-auto text-[11px] text-dim">Bagi rata:</span>
        {[2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => bagiRata(n)}
            className="min-h-[30px] rounded-lg border border-line px-2 text-[11px] text-mute hover:border-amber hover:text-amber">{n}×</button>
        ))}
      </div>

      {baris.map((b, i) => (
        <div key={i} className="rounded-lg border border-line bg-ink-2 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-[92px] shrink-0 text-[12px] font-semibold text-cream">Pembayaran {i + 1}</span>
            <div className="flex min-w-[130px] flex-1 items-center gap-1 rounded-lg border border-line bg-ink px-2 focus-within:border-amber">
              <span className="text-[11px] text-dim">Rp</span>
              <input inputMode="numeric" value={b.nominal === "" ? "" : Number(b.nominal).toLocaleString("id-ID")}
                onChange={(e) => { ubah(i, { nominal: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) }); setGalat(null); }}
                aria-label={`Nominal pembayaran ${i + 1}`}
                className="min-h-[36px] w-full bg-transparent text-right font-serif text-[15px] tabular-nums text-cream focus:outline-none" />
            </div>
            {baris.length > 1 && (
              <button onClick={() => setBaris((x) => x.filter((_, j) => j !== i))} aria-label={`Hapus pembayaran ${i + 1}`}
                className="h-9 w-9 shrink-0 rounded-lg border border-line text-mute hover:border-red-400 hover:text-red-300">×</button>
            )}
          </div>
          {!hanyaCheckout && <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] text-dim">via</span>
            {metode.map((m) => {
              const on = b.metode?.ch === m.ch && b.metode?.mesin === m.mesin;
              return (
                <button key={`${m.ch}-${m.mesin ?? ""}`} onClick={() => ubah(i, { metode: m, qr: m.ch === "qris_online" })} aria-pressed={on}
                  className={`min-h-[34px] rounded-lg border px-2.5 text-[12px] font-semibold ${
                    on ? "border-amber bg-amber text-ink" : "border-line bg-ink text-cream hover:border-amber"
                  }`}>{m.label}</button>
              );
            })}
          </div>}
          {b.qr && b.metode?.ch === "qris_online" && angka(b) > 0 && (
            <div className="mt-1.5">
              <QrisKasir amount={angka(b)} ringkas={`${ringkas}${baris.length > 1 ? ` · bagian ${i + 1}` : ""}`} kode={kode} />
            </div>
          )}
        </div>
      ))}

      <button onClick={tambah}
        className="min-h-[36px] w-full rounded-lg border border-dashed border-amber/60 text-[12px] font-semibold text-amber hover:bg-amber/10">
        (+) Tambah pembayaran
      </button>

      <div className="flex items-baseline justify-between rounded-lg bg-ink-2 px-3 py-2 text-[12px]">
        <span className="text-dim">Total {rupiah(total)} · terisi {rupiah(terisi)}</span>
        <span className={`font-bold ${sisa === 0 ? "text-emerald-300" : "text-red-300"}`}>
          {sisa === 0 ? "pas" : sisa > 0 ? `kurang ${rupiah(sisa)}` : `lebih ${rupiah(-sisa)}`}
        </span>
      </div>
      {galat && <p role="alert" className="text-[12px] text-red-300">{galat}</p>}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <button onClick={onBatal} className="min-h-[44px] rounded-xl border border-line text-[13px] text-mute">Batal</button>
        <button disabled={!siap}
          onClick={() => {
            const hasil = onSelesai(baris.map((x) => ({
              channel: x.metode!.ch, amount: angka(x), ...(x.metode!.mesin ? { mesin: x.metode!.mesin } : {}),
            })));
            if (hasil) setGalat(hasil);
          }}
          className="min-h-[44px] rounded-xl bg-amber text-[14px] font-bold text-ink disabled:opacity-35">
          {hanyaCheckout ? `Check Out · ${rupiah(terisi)}` : "Selesaikan pembayaran"}
        </button>
      </div>
      {!siap && (
        <p className="text-[11px] text-dim">
          {sisa !== 0 ? "Jumlah semua pembayaran harus pas dengan total." : "Pilih metode untuk setiap pembayaran."}
        </p>
      )}
    </div>
  );
}
