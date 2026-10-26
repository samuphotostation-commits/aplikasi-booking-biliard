/**
 * DETAIL TRANSAKSI — satu baris per PEMBAYARAN, bukan per meja.
 *
 * Bentuknya mengikuti laporan yang sudah dicetak pemilik tiap malam (foto 12
 * Okt 2026): No · Jam · No. Transaksi · No. Meja · Keterangan · kolom per
 * kanal, lalu TOTAL KESELURUHAN dan TOTAL TRANSAKSI.
 *
 * Kenapa per pembayaran, bukan per meja: yang dicocokkan di akhir shift
 * adalah UANG YANG MASUK. Satu tab yang dibayar dua orang memang harus
 * muncul dua baris, kalau tidak jumlah kolomnya tidak akan pernah sama
 * dengan isi laci.
 *
 * Satu perbedaan yang DISENGAJA dari kertas lama: di sana kolomnya
 * "KAS · QRIS · MANDIRI" (+ BRI di baris total) — mesin EDC dipisah per
 * bank. Di sini EDC masih satu kolom, karena mesin hanya mencatat
 * "kartu/EDC" tanpa tahu banknya. Kalau pemilik perlu dipisah per bank,
 * itu perubahan di layar bayar dulu (kasir memilih mesinnya), baru di sini.
 */
import { useState } from "react";
import { rupiah, fmtDateLong } from "../../lib/core";
import { cetakStruk } from "../../lib/cetak";
import { unduhExcel } from "../../lib/excel";
import type { OmzetShift } from "../../lib/adminStore";
import { VENUE_LABEL, type Venue } from "../../data/venue";

const jamMenit = (ms: number) =>
  new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });

const KANAL: Record<string, string> = { cash: "KAS", qris_online: "QRIS", edc: "EDC" };

export default function DetailTransaksi({ os, pilih, nama, bizDate, venue }: {
  os: OmzetShift;
  /** null = semua shift. */
  pilih: string | null;
  nama: string;
  bizDate: string;
  venue?: Venue;
}) {
  const [buka, setBuka] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);
  const bilang = (t: string) => { setKabar(t); setTimeout(() => setKabar(null), 4000); };

  const baris = os.rincian.filter((x) => pilih === null || x.shiftId === pilih);
  if (baris.length === 0) return null;

  /** Mesin EDC yang BENAR-BENAR muncul di rincian ini, urut nama. */
  const mesin = [...new Set(baris.filter((x) => x.kanal === "edc" && !x.prabayar)
    .map((x) => x.mesin ?? "Tanpa mesin"))].sort();

  const jumlah = (f: (x: typeof baris[number]) => number) => baris.reduce((n, x) => n + f(x), 0);
  const kas = jumlah((x) => (!x.prabayar && x.kanal === "cash" ? x.jumlah : 0));
  const qris = jumlah((x) => (!x.prabayar && x.kanal === "qris_online" ? x.jumlah : 0));
  const edc = jumlah((x) => (!x.prabayar && x.kanal === "edc" ? x.jumlah : 0));
  const edcMesin = (m: string) =>
    jumlah((x) => (!x.prabayar && x.kanal === "edc" && (x.mesin ?? "Tanpa mesin") === m ? x.jumlah : 0));
  const prabayar = jumlah((x) => (x.prabayar ? x.jumlah : 0));
  const total = kas + qris + edc + prabayar;

  async function unduh() {
    const rows: (string | number)[][] = [
      ["DETAIL TRANSAKSI"],
      ["Hari", fmtDateLong(bizDate)],
      ["Venue", venue ? VENUE_LABEL[venue] : "Gabungan"],
      ["Shift", nama],
      [],
      ["No.", "Jam", "No. Transaksi", "No. Meja", "Keterangan", "KAS", "QRIS",
        ...mesin.map((m) => m.toUpperCase()), "Prabayar"],
      ...baris.map((x, i) => [
        i + 1, jamMenit(x.at), x.kode, x.meja, x.keterangan,
        !x.prabayar && x.kanal === "cash" ? x.jumlah : 0,
        !x.prabayar && x.kanal === "qris_online" ? x.jumlah : 0,
        ...mesin.map((m) =>
          !x.prabayar && x.kanal === "edc" && (x.mesin ?? "Tanpa mesin") === m ? x.jumlah : 0),
        x.prabayar ? x.jumlah : 0,
      ]),
      [],
      ["", "", "", "", "TOTAL KESELURUHAN", kas, qris, ...mesin.map(edcMesin), prabayar],
      ["", "", "", "", "TOTAL TRANSAKSI", total],
    ];
    const hasil = await unduhExcel(`detail-transaksi-${bizDate}`, rows, "Detail transaksi");
    if (hasil !== "dibatalkan") bilang(hasil === "gagal" ? "Gagal menyimpan berkas." : "Laporan tersimpan.");
  }

  async function cetak() {
    const hasil = await cetakStruk();
    if (!hasil.ok) bilang(`Gagal mencetak: ${hasil.alasan ?? "printer tidak menjawab"}`);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Detail transaksi · {baris.length} pembayaran
        </h2>
        <div className="flex gap-1.5">
          <button onClick={() => setBuka(!buka)}
            className="rounded-lg border border-line bg-ink-2 px-3 py-1.5 text-[11px] font-semibold text-mute hover:border-amber hover:text-amber">
            {buka ? "Tutup" : "Lihat"}
          </button>
          {buka && (
            <>
              <button onClick={unduh}
                className="rounded-lg border border-line bg-ink-2 px-3 py-1.5 text-[11px] font-semibold text-mute hover:border-amber hover:text-amber">
                Unduh Excel
              </button>
              <button onClick={cetak}
                className="rounded-lg border border-amber/50 bg-amber/10 px-3 py-1.5 text-[11px] font-semibold text-amber">
                Cetak
              </button>
            </>
          )}
        </div>
      </div>

      {kabar && <p role="status" className="mt-1.5 text-[12px] text-amber">{kabar}</p>}

      {buka && (
        <>
          <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-ink-2">
            <table className="w-full min-w-[560px] text-[11px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-dim">
                  <th className="w-8 px-2 py-2 text-right font-bold">No</th>
                  <th className="px-2 py-2 text-left font-bold">Jam</th>
                  <th className="px-2 py-2 text-left font-bold">No. Transaksi</th>
                  <th className="px-2 py-2 text-left font-bold">Meja</th>
                  <th className="px-2 py-2 text-left font-bold">Keterangan</th>
                  <th className="px-2 py-2 text-right font-bold">KAS</th>
                  <th className="px-2 py-2 text-right font-bold">QRIS</th>
                  {mesin.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-bold">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {baris.map((x, i) => (
                  <tr key={`${x.kode}-${x.at}-${i}`}>
                    <td className="px-2 py-1.5 text-right tabular-nums text-dim">{i + 1}</td>
                    <td className="px-2 py-1.5 tabular-nums text-mute">{jamMenit(x.at)}</td>
                    <td className="px-2 py-1.5 text-mute">{x.kode}</td>
                    <td className="px-2 py-1.5 text-cream">{x.meja}</td>
                    <td className="px-2 py-1.5 text-mute">
                      {x.keterangan}
                      {x.prabayar && <span className="ml-1 text-[10px] text-dim">(prabayar online)</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-cream">
                      {!x.prabayar && x.kanal === "cash" ? rupiah(x.jumlah) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-mute">
                      {x.kanal === "qris_online" ? rupiah(x.jumlah) : "—"}
                    </td>
                    {mesin.map((m) => (
                      <td key={m} className="px-2 py-1.5 text-right tabular-nums text-mute">
                        {!x.prabayar && x.kanal === "edc" && (x.mesin ?? "Tanpa mesin") === m
                          ? rupiah(x.jumlah) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-line bg-ink-3/60">
                  <td colSpan={5} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-dim">
                    Total keseluruhan
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-cream">{rupiah(kas)}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-cream">{rupiah(qris)}</td>
                  {mesin.map((m) => (
                    <td key={m} className="px-2 py-2 text-right font-bold tabular-nums text-cream">
                      {rupiah(edcMesin(m))}
                    </td>
                  ))}
                </tr>
                <tr className="bg-amber/10">
                  <td colSpan={5} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-amber">
                    Total transaksi{prabayar > 0 && " (termasuk prabayar online)"}
                  </td>
                  <td colSpan={2 + mesin.length} className="px-2 py-2 text-right font-bold tabular-nums text-amber">
                    {rupiah(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {prabayar > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-dim">
              {rupiah(prabayar)} di antaranya <span className="text-mute">prabayar online</span> —
              uangnya masuk sebelum tamu datang, jadi tidak pernah lewat laci kasir dan
              tidak ikut hitungan kas shift.
            </p>
          )}

          {/* Kertas 58mm — isinya sama, disusun memanjang supaya muat. */}
          <div id="struk" className="cetak-saja bg-cream p-3 font-mono text-[11px] leading-snug text-ink">
            <div className="text-center text-[13px] font-bold tracking-wider">DETAIL TRANSAKSI</div>
            <div className="text-center">{fmtDateLong(bizDate)}</div>
            <div className="text-center">{venue ? VENUE_LABEL[venue] : "SPL + Smokehouse"}</div>
            <div className="text-center">Kasir : {nama}</div>
            {/* BERKOLOM, persis susunan struk yang dipakai pemilik
                (foto 19 Okt 2026): No · Jam · No. Transaksi · No. Meja ·
                Keterangan, lalu satu kolom per cara bayar, lalu TOTAL
                KESELURUHAN per kolom dan TOTAL TRANSAKSI.

                Sebelumnya dicetak dua baris per transaksi supaya muat di
                kertas sempit — terbaca, tapi tidak bisa dijumlah dengan mata
                per kolom, dan itulah gunanya laporan ini. */}
            <table className="mt-1.5 w-full border-collapse text-[8px] leading-tight">
              <thead>
                <tr className="border-y border-ink/60">
                  <th className="px-[1px] text-left font-bold">No</th>
                  <th className="px-[1px] text-left font-bold">Jam</th>
                  <th className="px-[1px] text-left font-bold">No. Trx</th>
                  <th className="px-[1px] text-left font-bold">Meja</th>
                  <th className="px-[1px] text-left font-bold">Ket</th>
                  <th className="px-[1px] text-right font-bold">KAS</th>
                  <th className="px-[1px] text-right font-bold">QRIS</th>
                  {mesin.map((m) => (
                    <th key={m} className="px-[1px] text-right font-bold">{m.toUpperCase()}</th>
                  ))}
                  {prabayar > 0 && <th className="px-[1px] text-right font-bold">PRA</th>}
                </tr>
              </thead>
              <tbody>
                {baris.map((x, i) => {
                  // Satu nilai hanya boleh muncul di SATU kolom — kalau
                  // tidak, jumlah per kolom lebih besar dari uang yang
                  // benar-benar masuk.
                  const diKolom = (k: string) =>
                    !x.prabayar && x.kanal === k ? x.jumlah.toLocaleString("id-ID") : "";
                  return (
                    <tr key={`p-${x.kode}-${x.at}-${i}`} className="border-b border-ink/15">
                      <td className="px-[1px] align-top tabular-nums">{i + 1}</td>
                      <td className="px-[1px] align-top tabular-nums">{jamMenit(x.at)}</td>
                      <td className="px-[1px] align-top">{x.kode}</td>
                      <td className="px-[1px] align-top">{x.meja}</td>
                      <td className="px-[1px] align-top">{x.keterangan}</td>
                      <td className="px-[1px] text-right align-top tabular-nums">{diKolom("cash")}</td>
                      <td className="px-[1px] text-right align-top tabular-nums">
                        {!x.prabayar && x.kanal === "qris_online"
                          ? x.jumlah.toLocaleString("id-ID") : ""}
                      </td>
                      {mesin.map((m) => (
                        <td key={m} className="px-[1px] text-right align-top tabular-nums">
                          {!x.prabayar && x.kanal === "edc" && x.mesin === m
                            ? x.jumlah.toLocaleString("id-ID") : ""}
                        </td>
                      ))}
                      {prabayar > 0 && (
                        <td className="px-[1px] text-right align-top tabular-nums">
                          {x.prabayar ? x.jumlah.toLocaleString("id-ID") : ""}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/60 font-bold">
                  <td className="px-[1px]" colSpan={5}>TOTAL KESELURUHAN</td>
                  <td className="px-[1px] text-right tabular-nums">{kas.toLocaleString("id-ID")}</td>
                  <td className="px-[1px] text-right tabular-nums">{qris.toLocaleString("id-ID")}</td>
                  {mesin.map((m) => (
                    <td key={m} className="px-[1px] text-right tabular-nums">
                      {edcMesin(m).toLocaleString("id-ID")}
                    </td>
                  ))}
                  {prabayar > 0 && (
                    <td className="px-[1px] text-right tabular-nums">{prabayar.toLocaleString("id-ID")}</td>
                  )}
                </tr>
              </tfoot>
            </table>
            <div className="my-1 border-t border-ink/60" />
            <div className="flex justify-between text-[11px] font-bold">
              <span>TOTAL TRANSAKSI<br />
                <span className="text-[8px] font-normal">
                  (KAS + QRIS{mesin.length ? ` + ${mesin.map((m) => m.toUpperCase()).join(" + ")}` : ""}
                  {prabayar > 0 ? " + PRABAYAR" : ""})
                </span>
              </span>
              <span className="tabular-nums">{total.toLocaleString("id-ID")}</span>
            </div>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Satu baris = satu pembayaran, bukan satu meja: tab yang dibayar dua orang
            muncul dua kali. Begitulah laporan kas harus dibaca — yang dicocokkan adalah
            uang yang masuk, bukan banyaknya meja.
            {" "}Kolom EDC dipisah per mesin sesuai yang dipilih kasir saat membayar.
            Mesinnya diatur di <span className="text-mute">Atur → Mesin EDC</span>.
          </p>
        </>
      )}
    </section>
  );
}

