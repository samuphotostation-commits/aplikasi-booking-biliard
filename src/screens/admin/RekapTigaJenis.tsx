/**
 * REKAP HARIAN — format KAS KASIR yang dipakai pemilik tiap malam.
 *
 * SPL Sport memakai bentuk kertasnya persis: sewa meja per shift, Billiard,
 * Restoran, Bar, Total Meja + Barang + Cafe, biaya, dan pendapatan bersih.
 * Smokehouse memakai kerangka yang sama tanpa sewa meja, karena meja makan
 * tidak disewa. Gabungan hanya ringkasan untuk pemilik.
 *
 * Makanan yang dipesan di meja biliar masuk rekap SPL (keputusan pemilik
 * 7 Nov 2026), karena uangnya masuk laci SPL. Smokehouse melihat nilainya
 * sebagai satu baris informasi, tanpa ikut dijumlahkan.
 *
 * "TOTAL OMZET" di kepala struk SPL itu SEWA MEJA SAJA. Pada struk 3 Okt 2026
 * angkanya 14.697.000, sedangkan totalnya 25.797.500 setelah barang ditambahkan.
 */
import { useMemo, useState } from "react";
import { useAdmin, rekapTigaJenis, rekapJenisRentang, businessDateOf, type BarisBarang, type RekapTigaJenis as Rekap } from "../../lib/adminStore";
import { fmtDateLong, rupiah } from "../../lib/core";
import { VENUE_LABEL, type Venue } from "../../data/venue";
import { cetakSenyapMungkin, cetakStruk } from "../../lib/cetak";
import { unduhExcel } from "../../lib/excel";
import { PanelBiaya } from "./PanelBiaya";

const jamMenit = (ms: number) =>
  new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });

const JUDUL_STRUK = { spl: "KAS KASIR SPL", smh: "KAS KASIR SMOKEHOUSE" } as const;
const pakaiSewa = (v?: Venue) => v !== "smh";
const labelTotal = (v?: Venue) => (pakaiSewa(v) ? "Total Meja + Barang + Cafe" : "Total Restoran + Bar");
/** Selisih pendapatan dengan uang yang masuk. Harus nol. */
const selisih = (r: Rekap) => r.pendapatan - r.uang.total;

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

const Angka = ({ k, v, tebal, warna }: { k: string; v: string; tebal?: boolean; warna?: string }) => (
  <div className={`flex justify-between gap-3 ${tebal ? "text-[14px] font-bold" : "text-[12px]"}`}>
    <span className={tebal ? "text-cream" : "text-mute"}>{k}</span>
    <span className={`tabular-nums ${warna ?? (tebal ? "text-amber" : "text-cream")}`}>{v}</span>
  </div>
);

/** Kepala struk: sewa meja atau omzet per shift, atau per hari kalau rentang. */
function Kepala({ r, tanggal }: { r: Rekap; tanggal: (d: string) => string }) {
  const sewa = pakaiSewa(r.venue);
  return (
    <div className="mt-2 rounded-xl border border-line bg-ink-2 p-3">
      {r.harian ? r.harian.map((h) => (
        <div key={h.bizDate} className="flex justify-between text-[12px]">
          <span className="text-mute">{tanggal(h.bizDate)}</span>
          <span className="tabular-nums text-cream">{rupiah(sewa ? h.sewaMeja : h.pendapatan)}</span>
        </div>
      )) : r.shift.map((sh) => (
        <div key={sh.id} className="flex justify-between text-[12px]">
          <span className="text-mute">
            {sh.nama} <span className="text-dim">{jamMenit(sh.openedAt)}–{sh.closedAt ? jamMenit(sh.closedAt) : "jalan"}</span>
          </span>
          <span className="tabular-nums text-cream">{rupiah(sewa ? sh.sewaMeja : sh.omzet)}</span>
        </div>
      ))}
      {!r.harian && r.shift.length === 0 && r.totalSemua === 0 && <div className="text-[12px] text-dim">Belum ada penjualan.</div>}
      <div className="mt-1 flex justify-between border-t border-line pt-1 text-[13px] font-bold">
        <span className="text-dim">{sewa ? "TOTAL OMZET · sewa meja" : "TOTAL OMZET"}</span>
        <span className="tabular-nums text-amber">{rupiah(sewa ? r.sewaMeja : r.pendapatan)}</span>
      </div>
    </div>
  );
}

/** Pendapatan dan pencocokan uang. Kalau tidak nol, kelihatan saat itu juga. */
function Pencocokan({ r }: { r: Rekap }) {
  const beda = selisih(r);
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Pencocokan uang</h3>
      <div className="space-y-1 rounded-xl border border-line bg-ink-2 p-3">
        <Angka k="Tunai" v={rupiah(r.uang.tunai)} />
        <Angka k="QRIS" v={rupiah(r.uang.qris)} />
        {Object.keys(r.uang.edcPer).length > 0
          ? Object.entries(r.uang.edcPer).map(([m, n]) => <Angka key={m} k={`EDC ${m}`} v={rupiah(n)} />)
          : <Angka k="EDC" v={rupiah(r.uang.edc)} />}
        <Angka k="Prabayar online" v={rupiah(r.uang.prabayar)} />
        <div className="border-t border-line pt-1"><Angka k="Total uang masuk" v={rupiah(r.uang.total)} tebal /></div>
        <p className={`text-[12px] font-semibold ${beda === 0 ? "text-emerald-400" : "text-red-300"}`}>
          {beda === 0 ? "Cocok dengan pendapatan." : `Beda ${rupiah(Math.abs(beda))} dari pendapatan. Periksa Detail Transaksi di bagian Uang.`}
        </p>
      </div>
    </section>
  );
}

const SBaris = ({ k, v, tebal }: { k: string; v: string; tebal?: boolean }) => (
  <div className={`flex justify-between gap-2 ${tebal ? "font-bold" : ""}`}>
    <span className="min-w-0 break-words">{k}</span>
    <span className="shrink-0 tabular-nums">{v}</span>
  </div>
);

const Garis = () => <div className="my-1 border-t border-dashed border-black/40" />;

function BlokStruk({ judul, baris, total, labelTotal }: {
  judul: string; baris: BarisBarang[]; total: number; labelTotal: string;
}) {
  if (baris.length === 0) return null;
  return (
    <>
      <Garis />
      <div className="font-bold">{judul}</div>
      {baris.map((x) => <SBaris key={x.itemId} k={`${x.qty}  ${x.nama}`} v={rupiah(x.total)} />)}
      <SBaris k={labelTotal} v={rupiah(total)} tebal />
    </>
  );
}

/** Kertas satu venue. Dipakai juga oleh gabungan dalam bentuk `ringkas`. */
function StrukVenue({ r, ringkas, tanggal }: { r: Rekap; ringkas?: boolean; tanggal: (d: string) => string }) {
  const sewa = pakaiSewa(r.venue);
  return (
    <>
      {r.harian
        ? r.harian.map((h) => <SBaris key={h.bizDate} k={tanggal(h.bizDate)} v={rupiah(sewa ? h.sewaMeja : h.pendapatan)} />)
        : r.shift.map((sh) => <SBaris key={sh.id} k={sh.nama.toUpperCase()} v={rupiah(sewa ? sh.sewaMeja : sh.omzet)} />)}
      <SBaris k="TOTAL OMZET" v={rupiah(sewa ? r.sewaMeja : r.pendapatan)} tebal />
      {ringkas ? (
        <>
          <Garis />
          {sewa && <SBaris k="Total Billiard" v={rupiah(r.totalBilliard)} />}
          <SBaris k="Total Cafe" v={rupiah(r.totalResto)} />
          <SBaris k="Total Bar" v={rupiah(r.totalBar)} />
        </>
      ) : (
        <>
          {sewa && <BlokStruk judul="REKAP PENJUALAN BILLIARD" baris={r.billiard} total={r.totalBilliard} labelTotal="TOTAL BILLIARD" />}
          <BlokStruk judul="REKAP PENJUALAN RESTORAN" baris={r.resto} total={r.totalResto} labelTotal="TOTAL CAFE" />
          <BlokStruk judul="REKAP PENJUALAN BAR" baris={r.bar} total={r.totalBar} labelTotal="TOTAL BAR" />
        </>
      )}
      <Garis />
      <SBaris k={labelTotal(r.venue)} v={rupiah(r.totalSemua)} tebal />
      {r.diskon > 0 && <SBaris k="Diskon & promo" v={`-${rupiah(r.diskon)}`} />}
      {!ringkas && (
        <>
          <Garis />
          <div className="font-bold">Jam  Deskripsi  Nilai</div>
          {r.biaya.map((b) => <SBaris key={b.id} k={`${jamMenit(b.at)}  ${b.keterangan}`} v={rupiah(b.nilai)} />)}
        </>
      )}
      <SBaris k="TOTAL BIAYA" v={rupiah(r.totalBiaya)} tebal />
      <Garis />
      <SBaris k="Total (Pendapatan - Biaya)" v={rupiah(r.bersih)} tebal />
      {!ringkas && (
        <>
          <Garis />
          <SBaris k="Tunai" v={rupiah(r.uang.tunai)} />
          <SBaris k="QRIS" v={rupiah(r.uang.qris)} />
          <SBaris k="EDC" v={rupiah(r.uang.edc)} />
          <SBaris k="Prabayar online" v={rupiah(r.uang.prabayar)} />
          <SBaris k="Total uang masuk" v={rupiah(r.uang.total)} tebal />
          {r.dapurMejaBiliar > 0 && (
            <>
              <Garis />
              <SBaris k="Pesanan dapur untuk meja biliar" v={rupiah(r.dapurMejaBiliar)} />
              <div>Sudah masuk rekap SPL Sport.</div>
            </>
          )}
          <BlokStruk judul="REKAP PENJUALAN F&B (BELUM CHECKOUT)" baris={r.belumCheckout}
            total={r.totalBelumCheckout} labelTotal="GRAND TOTAL" />
        </>
      )}
    </>
  );
}

/** Kartu ringkas satu venue di tampilan gabungan. */
function KartuVenue({ r, v }: { r: Rekap; v: Venue }) {
  return (
    <div className="space-y-1 rounded-xl border border-line bg-ink-2 p-3">
      <h3 className="font-display text-[15px] uppercase tracking-wide text-cream">{VENUE_LABEL[v]}</h3>
      {v === "spl" && <Angka k="Sewa meja" v={rupiah(r.sewaMeja)} />}
      {v === "spl" && <Angka k="Billiard" v={rupiah(r.totalBilliard)} />}
      <Angka k="Restoran" v={rupiah(r.totalResto)} />
      <Angka k="Bar" v={rupiah(r.totalBar)} />
      {r.diskon > 0 && <Angka k="Diskon & promo" v={`− ${rupiah(r.diskon)}`} />}
      <Angka k="Biaya" v={`− ${rupiah(r.totalBiaya)}`} />
      <div className="border-t border-line pt-1"><Angka k="Pendapatan − Biaya" v={rupiah(r.bersih)} tebal /></div>
    </div>
  );
}

export default function RekapTigaJenis({ dari, sampai, venue, hariIni }: {
  dari: string; sampai: string; venue?: Venue; hariIni: string;
}) {
  const { a, allow } = useAdmin();
  const satuHari = dari === sampai;
  const buat = (v?: Venue) => (satuHari ? rekapTigaJenis(a, dari, v) : rekapJenisRentang(a, dari, sampai, v));
  const r = useMemo(() => buat(venue), [a, dari, sampai, venue]);   // eslint-disable-line react-hooks/exhaustive-deps
  const spl = useMemo(() => (venue ? null : buat("spl")), [a, dari, sampai, venue]);   // eslint-disable-line react-hooks/exhaustive-deps
  const smh = useMemo(() => (venue ? null : buat("smh")), [a, dari, sampai, venue]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [kabar, setKabar] = useState<string | null>(null);
  const bilang = (teks: string) => { setKabar(teks); setTimeout(() => setKabar(null), 4500); };
  const tanggal = (d: string) => fmtDateLong(d).replace(/ \d{4}$/, "");
  const judulWaktu = satuHari ? fmtDateLong(dari) : `${fmtDateLong(dari)} – ${fmtDateLong(sampai)}`;
  const namaLaporan = venue ? VENUE_LABEL[venue] : "Gabungan";

  async function unduh() {
    const rows: (string | number)[][] = [[`Rekap ${namaLaporan}`, judulWaktu], []];
    const bagian = (judul: string, baris: BarisBarang[], total: number) => {
      if (baris.length === 0) return;
      rows.push([judul], ["Qty", "Deskripsi", "Total"]);
      for (const x of baris) rows.push([x.qty, x.nama, x.total]);
      rows.push(["", `TOTAL ${judul}`, total], []);
    };
    const satu = (x: Rekap, v?: Venue) => {
      const sewa = pakaiSewa(v);
      if (x.harian) for (const h of x.harian) rows.push([h.bizDate, "", sewa ? h.sewaMeja : h.pendapatan]);
      else for (const sh of x.shift) rows.push([sh.nama, "", sewa ? sh.sewaMeja : sh.omzet]);
      rows.push(["", sewa ? "TOTAL OMZET (sewa meja)" : "TOTAL OMZET", sewa ? x.sewaMeja : x.pendapatan], []);
      if (sewa) bagian("BILLIARD", x.billiard, x.totalBilliard);
      bagian("RESTORAN", x.resto, x.totalResto);
      bagian("BAR", x.bar, x.totalBar);
      rows.push(["", labelTotal(v), x.totalSemua]);
      if (x.diskon > 0) rows.push(["", "Diskon & promo", -x.diskon]);
      rows.push(["", "Pendapatan", x.pendapatan], [], ["Jam", "Deskripsi", "Nilai"]);
      for (const b of x.biaya) rows.push([jamMenit(b.at), b.keterangan, b.nilai]);
      rows.push(["", "TOTAL BIAYA", x.totalBiaya], ["", "Total (Pendapatan - Biaya)", x.bersih], []);
      rows.push(["", "Tunai", x.uang.tunai], ["", "QRIS", x.uang.qris], ["", "EDC", x.uang.edc],
        ["", "Prabayar online", x.uang.prabayar], ["", "Total uang masuk", x.uang.total], []);
      if (x.dapurMejaBiliar > 0) rows.push(["", "Pesanan dapur untuk meja biliar (masuk rekap SPL)", x.dapurMejaBiliar], []);
      bagian("BELUM CHECKOUT", x.belumCheckout, x.totalBelumCheckout);
    };
    if (spl && smh) {
      rows.push(["SPL SPORT"]); satu(spl, "spl");
      rows.push(["SMOKEHOUSE"]); satu(smh, "smh");
      rows.push(["", "TOTAL GABUNGAN (Pendapatan - Biaya)", r.bersih]);
    } else satu(r, venue);
    const akhiran = venue ?? "gabungan";
    const hasil = await unduhExcel(`rekap-${akhiran}-${dari}${satuHari ? "" : `-${sampai}`}`, rows, "Rekap penjualan");
    if (hasil !== "dibatalkan") bilang(hasil === "gagal" ? "Gagal menyimpan berkas." : "Rekap tersimpan.");
  }

  async function cetak() {
    const hasil = await cetakStruk();
    if (!hasil.ok) bilang(`Gagal mencetak: ${hasil.alasan ?? "printer tidak menjawab"}`);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
            Rekap {satuHari ? "harian" : "periode"} · {namaLaporan}
          </h2>
          <p className="text-[12px] text-mute">{judulWaktu}</p>
        </div>
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

      {r.tercampur && (
        <p className="mt-2 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed text-amber">
          Sebagian hari di laporan ini sudah terlalu lama, sehingga angkanya tidak bisa lagi dipisah per tempat.
        </p>
      )}
      {!r.rincianTersedia && (
        <p className="mt-2 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed text-amber">
          Rincian per barang untuk sebagian hari ini sudah tidak tersimpan. Totalnya tetap benar.
        </p>
      )}

      {spl && smh ? (
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <KartuVenue r={spl} v="spl" />
            <KartuVenue r={smh} v="smh" />
          </div>
          <div className="rounded-xl border border-amber/40 bg-amber/5 p-3">
            <Angka k="Total Pendapatan − Biaya kedua tempat" v={rupiah(r.bersih)} tebal />
            <p className="mt-1 text-[11px] leading-relaxed text-dim">
              Uang masuk {rupiah(r.uang.total)}. Untuk mencocokkan kas, pilih SPL Sport atau Smokehouse.
            </p>
          </div>
        </div>
      ) : (
        <>
          <Kepala r={r} tanggal={tanggal} />
          {pakaiSewa(venue) && (
            <Tabel judul="Rekap penjualan Billiard" labelTotal="Total Billiard" baris={r.billiard} total={r.totalBilliard} />
          )}
          <Tabel judul="Rekap penjualan Restoran" labelTotal="Total Cafe" baris={r.resto} total={r.totalResto} />
          <Tabel judul="Rekap penjualan Bar" labelTotal="Total Bar" baris={r.bar} total={r.totalBar} />

          <div className="mt-3 space-y-1 rounded-xl border border-amber/40 bg-amber/5 p-3">
            {pakaiSewa(venue) && <Angka k="Sewa meja" v={rupiah(r.sewaMeja)} />}
            {r.rincianTersedia && <Angka k="Barang" v={rupiah(r.totalBarang)} />}
            <div className="border-t border-amber/30 pt-1"><Angka k={labelTotal(venue)} v={rupiah(r.totalSemua)} tebal /></div>
            {r.diskon > 0 && <Angka k="Diskon & promo" v={`− ${rupiah(r.diskon)}`} />}
            {r.compliment > 0 && <Angka k="Compliment, sudah di luar total" v={rupiah(r.compliment)} warna="text-sky-200" />}
          </div>

          {r.dapurMejaBiliar > 0 && (
            <div className="mt-2 rounded-xl border border-line bg-ink-2 p-3">
              <Angka k="Pesanan dapur untuk meja biliar" v={rupiah(r.dapurMejaBiliar)} />
              <p className="mt-1 text-[11px] leading-relaxed text-dim">
                Sudah masuk rekap SPL Sport, jadi tidak dijumlahkan di sini.
              </p>
            </div>
          )}

          <section className="mt-4">
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Biaya</h3>
            {venue && satuHari
              ? <PanelBiaya bizDate={dari} venue={venue} bisaTambah={dari === hariIni && allow("catatBiaya")} />
              : (
                <div className="space-y-1 rounded-xl border border-line bg-ink-2 p-3">
                  {r.biaya.map((b) => <Angka key={b.id} k={`${tanggal(businessDateOf(b.at))} · ${b.keterangan}`} v={rupiah(b.nilai)} />)}
                  {r.biaya.length === 0 && <p className="text-[12px] text-dim">Belum ada biaya tercatat.</p>}
                </div>
              )}
            <div className="mt-2 space-y-1 rounded-xl border border-amber/40 bg-amber/5 p-3">
              <Angka k="Total biaya" v={rupiah(r.totalBiaya)} />
              <div className="border-t border-amber/30 pt-1"><Angka k="Total (Pendapatan − Biaya)" v={rupiah(r.bersih)} tebal /></div>
            </div>
          </section>

          {!r.tercampur && <Pencocokan r={r} />}

          <Tabel judul="Rekap penjualan F&amp;B (belum checkout)" labelTotal="Grand total"
            baris={r.belumCheckout} total={r.totalBelumCheckout} />
          {r.belumCheckout.length > 0 && (
            <p className="mt-1 text-[11px] leading-relaxed text-dim">
              Barang di atas sudah keluar dari dapur atau bar tapi tabnya belum ditutup, jadi
              <span className="text-cream"> belum dihitung sebagai penjualan</span>.
            </p>
          )}
        </>
      )}
      {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}

      {/* Struk kertas — tidak tampil di layar, hanya saat dicetak. */}
      <div id="struk" className="cetak-saja bg-white p-2 font-mono text-[11px] leading-snug text-black">
        <div className="text-center">
          <div className="text-[13px] font-bold tracking-widest">{venue ? JUDUL_STRUK[venue] : "REKAP GABUNGAN"}</div>
          <div>Rekening All</div>
          <div>{judulWaktu}</div>
        </div>
        <Garis />
        {spl && smh ? (
          <>
            <div className="font-bold">SPL SPORT</div>
            <StrukVenue r={spl} ringkas tanggal={tanggal} />
            <Garis />
            <div className="font-bold">SMOKEHOUSE</div>
            <StrukVenue r={smh} ringkas tanggal={tanggal} />
            <Garis />
            <SBaris k="TOTAL KEDUA TEMPAT" v={rupiah(r.bersih)} tebal />
          </>
        ) : <StrukVenue r={r} tanggal={tanggal} />}
        <div className="mt-2 text-center text-[10px]">dicetak {jamMenit(Date.now())}</div>
      </div>
    </section>
  );
}
