/**
 * TAKEAWAY MENUNGGU DIAMBIL & DIBAYAR — satu daftar untuk Kasir (tab Pesanan)
 * DAN layar Counter (perbaikan 15 Nov 2026: "pesanan tanpa meja ini tidak
 * ada" — keterangan Counter menunjuk daftar ini, padahal daftarnya hanya ada
 * di Kasir). Sekarang pesanan yang baru dibuat di Counter langsung terlihat
 * di bawah formulirnya, lengkap dengan QR dinamis dan tombol Tunai/EDC/QRIS.
 */
import { useState } from "react";
import { useAdmin, mesinEdc } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { venueDari, type Venue } from "../../data/venue";
import { jam } from "./AdminShell";
import { KonfirmasiBayar } from "./KonfirmasiBayar";
import { QrisKasir } from "./QrisKasir";

export default function DaftarTakeaway({ venue, onKabar, kosongTampil }: {
  venue: Venue;
  onKabar: (teks: string) => void;
  /** Tampilkan keterangan saat daftarnya kosong (dipakai layar Counter). */
  kosongTampil?: boolean;
}) {
  const { a, dispatchA, allow, peek } = useAdmin();
  const [lunasi, setLunasi] = useState<{ id: string; ch: "cash" | "edc" | "qris_online"; label: string; mesin?: string } | null>(null);
  // Ikut venue: takeaway SPL tidak tampil di Smokehouse, dan sebaliknya.
  const takeawayBelumBayar = a.orders.filter((o) => o.status === "diterima" && !o.sessionId &&
    !o.payment && o.paidOnline === 0 && (o.tableId ? venueDari(o.tableId) === venue : (o.venue ?? "spl") === venue))
    .sort((x, y) => y.at - x.at);

  if (takeawayBelumBayar.length === 0) {
    return kosongTampil ? (
      <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[12px] text-dim">
        Belum ada takeaway yang menunggu dibayar.
      </p>
    ) : null;
  }
  return (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:content-[''] text-amber before:bg-amber">
            Takeaway menunggu diambil · {takeawayBelumBayar.length} ·{" "}
            {rupiah(takeawayBelumBayar.reduce((n, o) => n + o.value, 0))}
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-amber/40 bg-amber/5">
            {takeawayBelumBayar.map((o) => {
              const tk = a.tickets.filter((t) => t.sessionId === o.id);
              const siap = tk.length > 0 && tk.every((t) => t.status === "ready" || t.status === "served");
              return (
                <div key={o.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-cream">
                        {o.guest} · <span className="font-mono text-mute">{o.code}</span>
                      </div>
                      <div className="text-[11px] text-dim">
                        {jam(o.at)} · {o.lines.reduce((n, l) => n + l.qty, 0)} porsi ·{" "}
                        {o.menungguBayar
                          ? <span className="font-semibold text-amber">menunggu dibayar — belum masuk checker</span>
                          : siap ? <span className="text-emerald-400">siap diambil</span> : "dapur sedang menyiapkan"}
                        {o.phone && ` · ${o.phone}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-serif text-[13px] tabular-nums text-cream">
                      {rupiah(o.value)}
                    </div>
                  </div>
                  {allow("tutupTab") && (
                    <div className="mt-1.5 space-y-1.5">
                      {/* QR dinamis bernominal tepat untuk pesanan ini; yang menandai
                          lunas tetap tombol di bawahnya, ditekan kasir. */}
                      <QrisKasir amount={o.value} ringkas={`Pesanan ${o.code}`} kode={o.code} />
                    {lunasi?.id === o.id ? (
                      <KonfirmasiBayar judul={`Tandai ${o.code} lunas?`} total={o.value} metode={lunasi.label}
                        tombol="Ya, lunas" onBatal={() => setLunasi(null)}
                        onYa={() => {
                          const { ch, label, mesin } = lunasi;
                          const tolak = dispatchA({ t: "settleOrder", id: o.id, channel: ch, ...(mesin ? { mesin } : {}) });
                          const lunas = !!peek().orders.find((x) => x.id === o.id)?.payment;
                          setLunasi(null);
                          onKabar(lunas
                            ? `${o.code} lunas ${rupiah(o.value)} (${label}).`
                            : tolak ?? "Belum tercatat — buka shift dulu, atau pesanan sudah berubah.");
                        }} />
                    ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ["cash", "Tunai", undefined],
                        ["qris_online", "QRIS", undefined],
                        ...mesinEdc(a).map((m) => ["edc", `EDC ${m}`, m] as const),
                      ] as const).map(([ch, label, mesin]) => (
                        <button key={`${ch}-${mesin ?? ""}`}
                          onClick={() => setLunasi({ id: o.id, ch, label, ...(mesin ? { mesin } : {}) })}
                          className="min-h-[36px] rounded-lg border border-line bg-ink px-3 text-[12px] font-semibold text-cream">
                          {label}
                        </button>
                      ))}
                    </div>
                    )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
            Pesanan makanan tanpa meja. Uangnya baru masuk laporan setelah ditandai lunas di sini —
            jadi angka rekap tidak pernah menghitung pesanan yang belum diambil.
          </p>
        </section>
  );
}
