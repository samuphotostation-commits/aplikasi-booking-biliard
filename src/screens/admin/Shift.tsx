import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAdmin, shiftCashExpected, omzetPerShift, businessDateOf } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { Button } from "../../components/UI";
import { cetakStruk } from "../../lib/cetak";
import { VENUE_LABEL } from "../../data/venue";
import { useVenueAktif } from "../../lib/venueAktif";
import { jam } from "./AdminShell";

/* Tutup shift = mencocokkan uang di laci dengan catatan sistem.
   Selisihnya (variance) adalah angka paling penting bagi pemilik:
   selisih kecil wajar, selisih berulang dari orang yang sama tidak. */

export default function ShiftScreen() {
  const { a, dispatchA } = useAdmin();
  const [hitung, setHitung] = useState("");
  const [konfirmasi, setKonfirmasi] = useState(false);
  /** Lembar cetak yang sedang disiapkan: ringkas atau rinci. */
  const [cetak, setCetak] = useState<null | { jenis: "ringkas" | "rinci"; at: number }>(null);
  const [kabarCetak, setKabarCetak] = useState<string | null>(null);
  /** Alasan shift gagal ditutup. Dulu tidak ada: tombolnya ditekan, tidak
   *  terjadi apa-apa, dan kasir menekannya lagi (temuan audit 21 Okt 2026). */
  const [kabarTutup, setKabarTutup] = useState<string | null>(null);
  const venue = useVenueAktif();

  const shift = a.shift!;
  const serahTerima = !!a.me && shift.employeeId !== a.me.id;
  const tanggal = (ts: number) => new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const hariIni = new Date().toDateString();
  // Hanya tunai yang diterima DI SHIFT INI. Menjumlah semua shift membuat kasir
  // shift kedua terlihat kurang/lebih uang padahal hitungannya benar.
  const seharusnya = shiftCashExpected(a);
  const tunaiMasuk = seharusnya - shift.openingCash;
  const dihitung = Number(hitung) || 0;
  const selisih = dihitung - seharusnya;

  const durasiMenit = Math.floor((Date.now() - shift.openedAt) / 60000);
  const durasi = `${Math.floor(durasiMenit / 60)}j ${durasiMenit % 60}m`;

  /**
   * Angka cetaknya diambil dari `omzetPerShift` — SUMBER YANG SAMA dengan
   * layar Rekap. Menghitung ulang di sini berarti dua tempat yang bisa
   * diam-diam berbeda, dan yang pertama menemukan bedanya adalah pemilik
   * yang mencocokkan kertas dengan layar jam dua pagi.
   */
  const omzet = useMemo(
    () => omzetPerShift(a, businessDateOf(Date.now()), venue),
    [a, venue],
  );
  const baris = omzet.shift.find((x) => x.id === shift.id);
  const trx = omzet.rincian.filter((r) => r.shiftId === shift.id);

  async function cetakLembar(jenis: "ringkas" | "rinci") {
    setCetak({ jenis, at: Date.now() });
    // Satu putaran gambar supaya lembarnya sudah ada di DOM saat dicetak.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const hasil = await cetakStruk();
    setKabarCetak(hasil.ok ? "Perintah cetak terkirim." : `Gagal mencetak: ${hasil.alasan ?? "printer tidak menjawab"}`);
    setTimeout(() => setKabarCetak(null), 4000);
    setCetak(null);
  }

  return (
    <div className="space-y-5 pb-6">
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Shift berjalan
        </h2>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-2">
          <Row k="Karyawan" v={shift.employeeName} />
          <Row k="Dibuka" v={`${jam(shift.openedAt)} · ${durasi} lalu`} />
          {/* MODAL AWAL DIHILANGKAN dari layar (permintaan pemilik 18 Okt
              2026). Laci memang selalu dikosongkan tiap ganti shift, jadi
              barisnya cuma menambah satu angka nol yang harus dibaca tiap
              malam.

              Barisnya TETAP muncul untuk shift lama yang modalnya bukan nol:
              kalau disembunyikan, kas shift itu terlihat tidak cocok dan
              tidak ada yang bisa menjelaskan kenapa. */}
          {shift.openingCash > 0 && (
            <Row k="Modal awal laci (shift lama)" v={rupiah(shift.openingCash)} />
          )}
          <Row k="Penjualan tunai" v={rupiah(tunaiMasuk)} />
          <div className="flex items-baseline justify-between bg-amber/10 px-4 py-3">
            <span className="font-semibold text-cream">Kas seharusnya</span>
            <span className="font-serif text-xl font-bold tabular-nums text-amber">
              {rupiah(seharusnya)}
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Hanya pembayaran <span className="text-mute">tunai</span> yang masuk hitungan laci.
          QRIS dan EDC tidak menambah uang fisik.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Tutup shift
        </h2>
        <div className="rounded-2xl border border-line bg-ink-2 p-4">
          <label className="mb-1 block text-[12px] text-mute">
            Hitung uang di laci sekarang
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink px-4 py-3">
            <span className="text-dim">Rp</span>
            <input type="number" inputMode="numeric" min={0} step={10000}
              value={hitung} onChange={(e) => { setHitung(e.target.value); setKonfirmasi(false); }}
              placeholder="0"
              className="w-full bg-transparent text-right font-serif text-xl tabular-nums
                text-cream focus:outline-none" />
          </div>

          {hitung !== "" && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className={`mt-3 rounded-xl border px-4 py-3 ${
                selisih === 0 ? "border-emerald-500/40 bg-emerald-500/10"
                  : Math.abs(selisih) <= 20_000 ? "border-amber/40 bg-amber/10"
                  : "border-red-500/40 bg-red-500/10"
              }`}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-cream">Selisih</span>
                <span className={`font-serif text-2xl font-bold tabular-nums ${
                  selisih === 0 ? "text-emerald-400"
                    : Math.abs(selisih) <= 20_000 ? "text-amber" : "text-red-400"
                }`}>
                  {selisih > 0 ? "+" : ""}{rupiah(selisih)}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-dim">
                {selisih === 0 ? "Pas. Laci cocok dengan catatan sistem."
                  : selisih > 0 ? "Uang di laci LEBIH dari catatan — cek transaksi yang belum diinput."
                  : "Uang di laci KURANG dari catatan — cek kembalian atau transaksi yang tidak tercatat."}
              </p>
            </motion.div>
          )}

          {serahTerima && (
            <p className="mt-3 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">
              Ini shift milik {shift.employeeName}. Menutupnya berarti serah terima: hitung laci bersama
              {" "}{shift.employeeName}. Anda tercatat sebagai penutup shift.
            </p>
          )}
          {!konfirmasi ? (
            <Button full disabled={hitung === ""} onClick={() => setKonfirmasi(true)}>
              {serahTerima ? `Tutup Shift ${shift.employeeName}` : "Tutup Shift"}
            </Button>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-center text-[13px] text-cream">
                Tutup shift {serahTerima ? `${shift.employeeName} ` : ""}dengan selisih {selisih > 0 ? "+" : ""}{rupiah(selisih)}?
              </p>
              <Button full variant="brick"
                onClick={() => {
                  const tolak = dispatchA({ t: "closeShift", countedCash: dihitung });
                  if (tolak) setKabarTutup(tolak);
                }}>
                Ya, Tutup Shift
              </Button>
              {kabarTutup && (
                <p role="status" className="text-center text-[12px] leading-snug text-amber">{kabarTutup}</p>
              )}
              <button onClick={() => setKonfirmasi(false)}
                className="min-h-[40px] w-full text-sm text-dim">Batal</button>
            </div>
          )}
        </div>
      </section>

      {/* CETAK TRANSAKSI SHIFT (permintaan pemilik 18 Okt 2026).
          Dua bentuk, karena dua kebutuhan yang berbeda: yang RINGKAS untuk
          ditempel di laporan harian, yang RINCI untuk mencocokkan satu per
          satu kalau angkanya tidak ketemu. */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Cetak transaksi shift ini
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => void cetakLembar("ringkas")}
            className="min-h-[46px] rounded-xl border border-line bg-ink-2 text-[13px] text-cream">
            Cetak ringkas
          </button>
          <button onClick={() => void cetakLembar("rinci")}
            className="min-h-[46px] rounded-xl border border-line bg-ink-2 text-[13px] text-cream">
            Cetak rinci · {trx.length} transaksi
          </button>
        </div>
        {kabarCetak && <p role="status" className="mt-2 text-[12px] text-amber">{kabarCetak}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Ringkas memuat jumlah transaksi dan omzet per cara bayar. Rinci memuat semua
          transaksi shift ini satu per satu, dengan jam dan nomor strukmya.
        </p>
      </section>

      {cetak && (
        <div id="struk" className="cetak-saja bg-white p-2 text-[11px] text-black">
          <div className="text-center">
            <div className="text-[13px] font-bold uppercase">Kas Kasir</div>
            <div className="text-[11px] font-bold uppercase">{VENUE_LABEL[venue]}</div>
            <div className="mt-1">{new Date(cetak.at).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            <div>Kasir : {shift.employeeName}</div>
            <div>Shift : {jam(shift.openedAt)} – {jam(cetak.at)}</div>
          </div>
          <div className="my-1 border-t border-dashed border-black" />

          <div className="font-bold uppercase">Ringkasan</div>
          <BarisCetak k="Jumlah transaksi" v={String(trx.length)} />
          <BarisCetak k="Tunai" v={rupiah(baris?.tunai ?? 0)} />
          <BarisCetak k="QRIS" v={rupiah(baris?.qris ?? 0)} />
          <BarisCetak k="EDC" v={rupiah(baris?.edc ?? 0)} />
          {Object.entries(baris?.edcPer ?? {}).map(([m, n]) => (
            <BarisCetak key={m} k={`  EDC ${m}`} v={rupiah(n)} />
          ))}
          {(baris?.prabayar ?? 0) > 0 && <BarisCetak k="Prabayar" v={rupiah(baris!.prabayar)} />}
          <div className="my-1 border-t border-dashed border-black" />
          <BarisCetak k="Sewa meja" v={rupiah(baris?.sewaMeja ?? 0)} />
          <BarisCetak k="Makanan & minuman" v={rupiah(baris?.barang ?? 0)} />
          {(baris?.diskon ?? 0) > 0 && <BarisCetak k="Diskon" v={`-${rupiah(baris!.diskon)}`} />}
          {(baris?.compliment ?? 0) > 0 && <BarisCetak k="Compliment" v={rupiah(baris!.compliment)} />}
          <div className="my-1 border-t border-black" />
          <div className="flex justify-between font-bold">
            <span>TOTAL DITERIMA</span>
            <span className="tabular-nums">{rupiah(baris?.diterima ?? 0)}</span>
          </div>
          <BarisCetak k="Kas seharusnya (tunai)" v={rupiah(seharusnya)} />

          {cetak.jenis === "rinci" && (
            <>
              <div className="my-1 border-t border-dashed border-black" />
              <div className="font-bold uppercase">Rincian transaksi</div>
              {trx.length === 0 && <div>Belum ada transaksi di shift ini.</div>}
              {trx.map((r, i) => (
                <div key={i} className="mt-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{jam(r.at)} {r.meja}</span>
                    <span className="shrink-0 tabular-nums">{rupiah(r.jumlah)}</span>
                  </div>
                  <div className="text-[10px]">
                    {r.kode} · {r.kanal}{r.mesin ? ` ${r.mesin}` : ""}
                    {r.keterangan ? ` · ${r.keterangan}` : ""}
                  </div>
                </div>
              ))}
            </>
          )}
          <div className="mt-2 text-center text-[10px]">
            Dicetak {jam(cetak.at)} oleh {a.me?.name ?? "-"}
          </div>
        </div>
      )}

      {a.shiftHistory.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
            Riwayat shift
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
            {a.shiftHistory.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-cream">{h.employeeName}</div>
                  <div className="text-[11px] text-dim">
                    {new Date(h.openedAt).toDateString() !== hariIni && `${tanggal(h.openedAt)} · `}
                    {jam(h.openedAt)} – {h.closedAt ? jam(h.closedAt) : "?"}
                    {h.openingCash > 0 && <>{" · modal "}{rupiah(h.openingCash)}</>}
                    {" · dihitung "}{rupiah(h.countedCash ?? 0)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-serif text-[13px] font-bold tabular-nums ${
                    (h.variance ?? 0) === 0 ? "text-emerald-400"
                      : Math.abs(h.variance ?? 0) <= 20_000 ? "text-amber" : "text-red-400"
                  }`}>
                    {(h.variance ?? 0) > 0 ? "+" : ""}{rupiah(h.variance ?? 0)}
                  </div>
                  <div className="text-[10px] text-dim">selisih</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BarisCetak({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="min-w-0 truncate">{k}</span>
      <span className="shrink-0 tabular-nums">{v}</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[13px] text-dim">{k}</span>
      <span className="font-serif text-[13px] tabular-nums text-cream">{v}</span>
    </div>
  );
}
