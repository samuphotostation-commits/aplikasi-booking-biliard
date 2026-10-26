/**
 * LAPORAN PENJUALAN PER PRODUK — SPL-11.
 *
 * Permintaan pemilik: "laporan penjualan per produk (tunai), per hari ·
 * minggu · bulan · manual". Jadi yang dijawab layar ini dua pertanyaan
 * sekaligus: barang apa yang paling menghasilkan, dan dari kanal mana
 * uangnya datang — karena yang paling sering dicek pemilik adalah TUNAI.
 *
 * Rentang tanggal & venue TIDAK dipilih di sini: keduanya diwarisi dari layar
 * Rekap yang memuatnya. Kalau layar ini punya pemilih sendiri, akan ada dua
 * tanggal di satu halaman dan angka yang berbeda tanpa ada yang salah.
 *
 * Satu hal yang sengaja ditampilkan apa adanya: hari yang sudah tutup buku
 * SEBELUM laporan ini ada tidak punya rincian produk. Harinya disebut satu
 * per satu, bukan dihitung nol — laporan yang diam-diam kurang hari lebih
 * berbahaya daripada laporan yang mengaku tidak lengkap.
 */
import { useMemo, useState } from "react";
import { useAdmin, penjualanProduk, type KanalProduk } from "../../lib/adminStore";
import { fmtDateLong, rupiah } from "../../lib/core";
import { unduhExcel } from "../../lib/excel";
import type { Venue } from "../../data/venue";

const STATION_LABEL: Record<string, string> = {
  kitchen: "Dapur", bar: "Bar", billiard: "Counter biliar",
};

const KANAL_LABEL: Record<KanalProduk, string> = {
  tunai: "Tunai", qris: "QRIS", edc: "Kartu / EDC",
  prabayar: "Prabayar online", lain: "Tidak tercatat",
};

type Urut = "nilai" | "qty" | "nama";

export default function LaporanProduk({ dari, sampai, venue }: {
  dari: string; sampai: string; venue?: Venue;
}) {
  const { a } = useAdmin();
  const [urut, setUrut] = useState<Urut>("nilai");
  const [stasiun, setStasiun] = useState<"semua" | "kitchen" | "bar" | "billiard">("semua");
  const [hanyaTunai, setHanyaTunai] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);

  const bilang = (t: string) => { setKabar(t); setTimeout(() => setKabar(null), 4000); };

  const lap = useMemo(() => penjualanProduk(a, dari, sampai, venue), [a, dari, sampai, venue]);

  const baris = useMemo(() => {
    const dipilih = lap.baris
      .filter((b) => stasiun === "semua" || b.station === stasiun)
      // Saringan "hanya tunai": yang ditampilkan tetap barisnya, bukan
      // angkanya yang diubah — barang yang tidak pernah dibayar tunai
      // memang tidak ada isinya di laporan tunai.
      .filter((b) => !hanyaTunai || b.tunai > 0);
    const urutkan = {
      nilai: (x: typeof dipilih[number], y: typeof dipilih[number]) =>
        (hanyaTunai ? y.tunai - x.tunai : y.total - x.total) || x.nama.localeCompare(y.nama, "id"),
      qty: (x: typeof dipilih[number], y: typeof dipilih[number]) =>
        y.qty - x.qty || x.nama.localeCompare(y.nama, "id"),
      nama: (x: typeof dipilih[number], y: typeof dipilih[number]) => x.nama.localeCompare(y.nama, "id"),
    }[urut];
    return [...dipilih].sort(urutkan);
  }, [lap, urut, stasiun, hanyaTunai]);

  const totalTampil = baris.reduce((n, b) => n + (hanyaTunai ? b.tunai : b.total), 0);
  const qtyTampil = baris.reduce((n, b) => n + b.qty, 0);
  const judulRentang = dari === sampai ? fmtDateLong(dari) : `${fmtDateLong(dari)} – ${fmtDateLong(sampai)}`;

  async function unduh() {
    const rows: (string | number)[][] = [
      ["LAPORAN PENJUALAN PER PRODUK"],
      ["Rentang", judulRentang],
      ["Venue", venue === "smh" ? "Smokehouse" : venue === "spl" ? "SPL Sport" : "Gabungan"],
      [],
      ["Barang", "Tempat", "Qty", "Total", "Tunai", "QRIS", "EDC", "Prabayar", "Tidak tercatat", "Compliment"],
      ...baris.map((b) => [
        b.nama, STATION_LABEL[b.station] ?? b.station, b.qty, b.total,
        b.tunai, b.qris, b.edc, b.prabayar, b.lain, b.comp,
      ]),
      [],
      ["", "JUMLAH", qtyTampil, baris.reduce((n, b) => n + b.total, 0),
        lap.perKanal.tunai, lap.perKanal.qris, lap.perKanal.edc,
        lap.perKanal.prabayar, lap.perKanal.lain, lap.comp],
    ];
    if (lap.hariTanpaRincian.length) {
      rows.push([], ["Hari tanpa rincian produk", lap.hariTanpaRincian.join(", ")]);
    }
    const hasil = await unduhExcel(`penjualan-produk-${dari}_${sampai}`, rows, "Per produk");
    if (hasil !== "dibatalkan") bilang(hasil === "gagal" ? "Gagal menyimpan berkas." : "Laporan tersimpan.");
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Penjualan per produk
        </h2>
        {baris.length > 0 && (
          <button onClick={unduh}
            className="rounded-lg border border-line bg-ink-2 px-3 py-1.5 text-[11px] font-semibold text-mute hover:border-amber hover:text-amber">
            Unduh Excel
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {([["semua", "Semua"], ["kitchen", "Dapur"], ["bar", "Bar"], ["billiard", "Counter"]] as const)
          .map(([k, label]) => (
            <button key={k} onClick={() => setStasiun(k)} aria-pressed={stasiun === k}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                stasiun === k ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
              }`}>
              {label}
            </button>
          ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <button onClick={() => setHanyaTunai(!hanyaTunai)} aria-pressed={hanyaTunai}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
            hanyaTunai ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
          }`}>
          Hanya tunai
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        {([["nilai", "Nilai"], ["qty", "Jumlah"], ["nama", "Nama"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setUrut(k)} aria-pressed={urut === k}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
              urut === k ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
            }`}>
            urut: {label}
          </button>
        ))}
      </div>

      {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}

      {lap.hariTanpaRincian.length > 0 && (
        <p className="mt-2 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed text-amber">
          {lap.hariTanpaRincian.length} hari dalam rentang ini sudah tutup buku sebelum laporan
          per produk ada, jadi rinciannya tidak tersimpan: {lap.hariTanpaRincian.join(", ")}.
          Angka di bawah belum memuat hari-hari itu.
        </p>
      )}

      {baris.length === 0 ? (
        <div className="mt-2 rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
          Belum ada barang terjual {judulRentang.toLowerCase()}.
        </div>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(KANAL_LABEL) as KanalProduk[])
              .filter((k) => lap.perKanal[k] > 0 || k === "tunai")
              .map((k) => (
                <div key={k} className="rounded-xl border border-line bg-ink-2 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-dim">{KANAL_LABEL[k]}</div>
                  <div className="font-serif text-[15px] font-bold tabular-nums text-cream">
                    {rupiah(lap.perKanal[k])}
                  </div>
                  <div className="text-[10px] text-dim">
                    {lap.total > 0 ? `${Math.round((lap.perKanal[k] / lap.total) * 100)}% dari barang` : "—"}
                  </div>
                </div>
              ))}
          </div>

          <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-ink-2">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-dim">
                  <th className="px-2 py-2 text-left font-bold">Barang</th>
                  <th className="w-12 px-2 py-2 text-right font-bold">Qty</th>
                  <th className="px-2 py-2 text-right font-bold">Tunai</th>
                  <th className="px-2 py-2 text-right font-bold">QRIS</th>
                  <th className="px-2 py-2 text-right font-bold">EDC</th>
                  <th className="px-3 py-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {baris.map((b) => (
                  <tr key={`${b.venue}|${b.itemId}`}>
                    <td className="px-2 py-1.5 text-cream">
                      {b.nama}
                      <span className="ml-1.5 text-[10px] text-dim">
                        {STATION_LABEL[b.station] ?? b.station}
                        {!venue && ` · ${b.venue === "smh" ? "SMH" : "SPL"}`}
                      </span>
                      {b.comp > 0 && (
                        <span className="ml-1.5 text-[10px] text-sky-300" title="Nilai barang yang digratiskan venue">
                          compliment {rupiah(b.comp)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-mute">{b.qty}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-cream">{b.tunai > 0 ? rupiah(b.tunai) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-mute">{b.qris > 0 ? rupiah(b.qris) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-mute">{b.edc > 0 ? rupiah(b.edc) : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-cream">{rupiah(b.total)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line bg-ink-3/60">
                  <td className="px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-dim">
                    {hanyaTunai ? "Jumlah tunai" : "Jumlah"}
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums text-mute">{qtyTampil}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-dim">{rupiah(baris.reduce((n, b) => n + b.tunai, 0))}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-dim">{rupiah(baris.reduce((n, b) => n + b.qris, 0))}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-dim">{rupiah(baris.reduce((n, b) => n + b.edc, 0))}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-amber">{rupiah(totalTampil)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Kanal diambil dari jejak pembayarannya, bukan dibagi rata: baris yang dibayar
            lewat split bill mengikuti kanal orang yang membayarnya, baris prabayar mengikuti
            pembayaran onlinenya, sisanya mengikuti kanal penutup tab. Yang benar-benar tidak
            bisa ditentukan masuk “tidak tercatat” — sengaja, supaya laporan tunai tetap bisa dipercaya.
            {lap.comp > 0 && ` Compliment ${rupiah(lap.comp)} TIDAK dihitung sebagai uang masuk; barangnya tetap tercatat keluar.`}
          </p>
        </>
      )}
    </section>
  );
}
