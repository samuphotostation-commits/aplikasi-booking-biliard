import { useState } from "react";
import { motion } from "framer-motion";
import { useAdmin, shiftCashExpected } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { Button } from "../../components/UI";
import { jam } from "./AdminShell";

/* Tutup shift = mencocokkan uang di laci dengan catatan sistem.
   Selisihnya (variance) adalah angka paling penting bagi pemilik:
   selisih kecil wajar, selisih berulang dari orang yang sama tidak. */

export default function ShiftScreen() {
  const { a, dispatchA } = useAdmin();
  const [hitung, setHitung] = useState("");
  const [konfirmasi, setKonfirmasi] = useState(false);

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

  return (
    <div className="space-y-5 pb-6">
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Shift berjalan
        </h2>
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-2">
          <Row k="Karyawan" v={shift.employeeName} />
          <Row k="Dibuka" v={`${jam(shift.openedAt)} · ${durasi} lalu`} />
          <Row k="Modal awal laci" v={rupiah(shift.openingCash)} />
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
                onClick={() => dispatchA({ t: "closeShift", countedCash: dihitung })}>
                Ya, Tutup Shift
              </Button>
              <button onClick={() => setKonfirmasi(false)}
                className="min-h-[40px] w-full text-sm text-dim">Batal</button>
            </div>
          )}
        </div>
      </section>

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
                    {" · modal "}{rupiah(h.openingCash)}{" · dihitung "}{rupiah(h.countedCash ?? 0)}
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[13px] text-dim">{k}</span>
      <span className="font-serif text-[13px] tabular-nums text-cream">{v}</span>
    </div>
  );
}
