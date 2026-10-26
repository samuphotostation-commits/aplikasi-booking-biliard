/**
 * REKAP PENJUALAN 3 JENIS — Billiard · Resto · Bar
 *
 * Bentuknya mengikuti struk "KAS KASIR SPL" yang sudah dipakai pemilik tiap
 * malam, supaya yang dibaca di layar dan yang keluar dari printer sama persis
 * dengan yang biasa dipegang.
 *
 * SATU HAL YANG DULU SERING SALAH DIBACA, dan sekarang dibuat tidak bisa:
 * "TOTAL OMZET" di kepala struk itu SEWA MEJA SAJA. Pada struk 3 Okt 2026
 * angkanya 14.697.000, sedangkan totalnya 25.797.500 setelah barang
 * ditambahkan. Di sini keduanya diberi nama sendiri dan ditaruh berjauhan.
 */
import { useMemo, useState } from "react";
import { useAdmin, rekapTigaJenis, type BarisBarang } from "../../lib/adminStore";
import { fmtDateLong, rupiah } from "../../lib/core";
import type { Venue } from "../../data/venue";
import { cetakSenyapMungkin, cetakStruk } from "../../lib/cetak";
import { unduhExcel } from "../../lib/excel";

const jamMenit = (ms: number) =>
  new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });

/** Satu tabel jenis: qty · nama · total, persis urutan kolom di struk. */
function Tabel({ judul, labelTotal, baris, total }: {
  judul: string; labelTotal: string; baris: BarisBarang[]; total: number;
}) {
  if (baris.length === 0) return null;
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">{judul}</h3>
      <div className="overflow-hidden rounded-xl border border-line bg-ink-2">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wider text-dim">
              <th className="w-10 px-2 py-1.5 text-right font-bold">Qty</th>
              <th className="px-2 py-1.5 text-left font-bold">Deskripsi</th>
              <th className="px-3 py-1.5 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {baris.map((x) => (
              <tr key={x.itemId}>
                <td className="px-2 py-1 text-right tabular-nums text-mute">{x.qty}</td>
                <td className="px-2 py-1 text-cream">{x.nama}</td>
                <td className="px-3 py-1 text-right tabular-nums text-cream">{rupiah(x.total)}</td>
              </tr>
            ))}
            <tr className="border-t border-line bg-ink-3/60">
              <td />
              <td className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">{labelTotal}</td>
              <td className="px-3 py-1.5 text-right font-bold tabular-nums text-amber">{rupiah(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Baris struk kertas: kiri-kanan, lebar 58mm. */
const SBaris = ({ k, v, tebal }: { k: string; v: string; tebal?: boolean }) => (
  <div className={`flex justify-between gap-2 ${tebal ? "font-bold" : ""}`}>
    <span className="min-w-0 break-words">{k}</span>
    <span className="shrink-0 tabular-nums">{v}</span>
  </div>
);

function BlokStruk({ judul, baris, total, labelTotal }: {
  judul: string; baris: BarisBarang[]; total: number; labelTotal: string;
}) {
  if (baris.length === 0) return null;
  return (
    <>
      <div className="my-1 border-t border-dashed border-black/40" />
      <div className="font-bold">{judul}</div>
      {baris.map((x) => <SBaris key={x.itemId} k={`${x.qty}  ${x.nama}`} v={rupiah(x.total)} />)}
      <SBaris k={labelTotal} v={rupiah(total)} tebal />
    </>
  );
}

export default function RekapTigaJenis({ bizDate, venue }: { bizDate: string; venue?: Venue }) {
  const { a } = useAdmin();
  const r = useMemo(() => rekapTigaJenis(a, bizDate, venue), [a, bizDate, venue]);
  const [kabar, setKabar] = useState<string | null>(null);

  const bilang = (teks: string) => { setKabar(teks); setTimeout(() => setKabar(null), 4500); };

  async function unduh() {
    const rows: (string | number)[][] = [[`Rekap penjualan ${bizDate}`], []];
    const bagian = (judul: string, baris: BarisBarang[], total: number) => {
      if (baris.length === 0) return;
      rows.push([judul], ["Qty", "Deskripsi", "Total"]);
      for (const x of baris) rows.push([x.qty, x.nama, x.total]);
      rows.push(["", `TOTAL ${judul}`, total], []);
    };
    for (const sh of r.shift) rows.push([sh.nama, "sewa meja", sh.sewaMeja]);
    rows.push(["", "TOTAL OMZET (sewa meja)", r.sewaMeja], []);
    bagian("BILLIARD", r.billiard, r.totalBilliard);
    bagian("RESTORAN", r.resto, r.totalResto);
    bagian("BAR", r.bar, r.totalBar);
    rows.push(["", "TOTAL MEJA + BARANG", r.totalSemua], []);
    bagian("BELUM CHECKOUT", r.belumCheckout, r.totalBelumCheckout);
    const hasil = await unduhExcel(`rekap-jual-spl-${bizDate}`, rows, "Rekap penjualan");
    if (hasil !== "dibatalkan") bilang(hasil === "gagal" ? "Gagal menyimpan berkas." : "Rekap tersimpan.");
  }

  async function cetak() {
    const hasil = await cetakStruk();
    if (!hasil.ok) bilang(`Gagal mencetak: ${hasil.alasan ?? "printer tidak menjawab"}`);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Rekap penjualan · Billiard · Resto · Bar
        </h2>
        <div className="flex gap-1.5">
          <button onClick={() => void unduh()}
            className="min-h-[34px] rounded-lg border border-line px-3 text-[12px] text-cream hover:border-amber hover:text-amber">
            Unduh Excel
          </button>
          <button onClick={() => void cetak()}
            className="min-h-[34px] rounded-lg bg-amber px-3 text-[12px] font-bold text-ink">
            {cetakSenyapMungkin() ? "Cetak struk" : "Cetak"}
          </button>
        </div>
      </div>

      {!r.rincianTersedia ? (
        <p className="mt-2 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed text-amber">
          Hari ini sudah tutup buku, dan rincian barisnya dilepas dari arsip supaya tidak
          membengkak — yang tersimpan tinggal angka totalnya. Rincian per barang hanya ada
          untuk hari yang belum tutup buku; struk hariannya memang dicetak malam itu juga.
        </p>
      ) : (
        <>
          {/* Kepala struk: sewa meja per shift — inilah yang di struk disebut TOTAL OMZET */}
          <div className="mt-2 rounded-xl border border-line bg-ink-2 p-3">
            {r.shift.length === 0 && (
              <div className="text-[12px] text-dim">Belum ada shift dibuka hari ini.</div>
            )}
            {r.shift.map((sh) => (
              <div key={sh.id} className="flex justify-between text-[12px]">
                <span className="text-mute">
                  {sh.nama}{" "}
                  <span className="text-dim">
                    {jamMenit(sh.openedAt)}–{sh.closedAt ? jamMenit(sh.closedAt) : "jalan"}
                  </span>
                </span>
                <span className="tabular-nums text-cream">{rupiah(sh.sewaMeja)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-line pt-1 text-[13px] font-bold">
              <span className="text-dim">TOTAL OMZET · sewa meja</span>
              <span className="tabular-nums text-amber">{rupiah(r.sewaMeja)}</span>
            </div>
          </div>

          <Tabel judul="Rekap penjualan Billiard" labelTotal="Total Billiard"
            baris={r.billiard} total={r.totalBilliard} />
          <Tabel judul="Rekap penjualan Restoran" labelTotal="Total Cafe"
            baris={r.resto} total={r.totalResto} />
          <Tabel judul="Rekap penjualan Bar" labelTotal="Total Bar"
            baris={r.bar} total={r.totalBar} />

          <div className="mt-3 rounded-xl border border-amber/40 bg-amber/5 p-3">
            <div className="flex justify-between text-[12px]">
              <span className="text-mute">Sewa meja</span>
              <span className="tabular-nums text-cream">{rupiah(r.sewaMeja)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-mute">Barang (Billiard + Resto + Bar)</span>
              <span className="tabular-nums text-cream">{rupiah(r.totalBarang)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-amber/30 pt-1 text-[14px] font-bold">
              <span className="text-cream">Total Meja + Barang</span>
              <span className="tabular-nums text-amber">{rupiah(r.totalSemua)}</span>
            </div>
            {r.diskon > 0 && (
              <p className="mt-1 text-[10px] leading-snug text-dim">
                Potongan promo {rupiah(r.diskon)} belum dikurangkan di sini — angka di atas
                harga sebelum diskon, sama seperti struk.
              </p>
            )}
          </div>

          <Tabel judul="Rekap penjualan F&amp;B (belum checkout)" labelTotal="Grand total"
            baris={r.belumCheckout} total={r.totalBelumCheckout} />
          {r.belumCheckout.length > 0 && (
            <p className="mt-1 text-[11px] leading-relaxed text-dim">
              Barang di atas sudah keluar dari dapur/bar tapi tabnya belum ditutup, jadi
              <span className="text-cream"> belum dihitung sebagai penjualan</span>. Inilah sebab
              rekap barang dan rekap uang kadang tidak sama persis.
            </p>
          )}
        </>
      )}
      {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}

      {/* Struk kertas — tidak tampil di layar, hanya saat dicetak. */}
      {r.rincianTersedia && (
        <div id="struk" className="cetak-saja bg-white p-2 font-mono text-[11px] leading-snug text-black">
          <div className="text-center">
            <div className="text-[13px] font-bold tracking-widest">KAS KASIR SPL</div>
            <div>Rekening All</div>
            <div>{fmtDateLong(bizDate)}</div>
          </div>
          <div className="my-1 border-t border-dashed border-black/40" />
          {r.shift.map((sh) => <SBaris key={sh.id} k={sh.nama.toUpperCase()} v={rupiah(sh.sewaMeja)} />)}
          <SBaris k="TOTAL OMZET" v={rupiah(r.sewaMeja)} tebal />

          <BlokStruk judul="REKAP PENJUALAN BILLIARD" baris={r.billiard}
            total={r.totalBilliard} labelTotal="TOTAL BILLIARD" />
          <BlokStruk judul="REKAP PENJUALAN RESTORAN" baris={r.resto}
            total={r.totalResto} labelTotal="TOTAL CAFE" />
          <BlokStruk judul="REKAP PENJUALAN BAR" baris={r.bar}
            total={r.totalBar} labelTotal="TOTAL BAR" />

          <div className="my-1 border-t border-dashed border-black/40" />
          <SBaris k="Total Meja + Barang + Cafe" v={rupiah(r.totalSemua)} tebal />

          <BlokStruk judul="REKAP PENJUALAN F&B (BELUM CHECKOUT)" baris={r.belumCheckout}
            total={r.totalBelumCheckout} labelTotal="GRAND TOTAL" />
          <div className="mt-2 text-center text-[10px]">dicetak {jamMenit(Date.now())}</div>
        </div>
      )}
    </section>
  );
}
