import { useMemo, useState } from "react";
import {
  useAdmin, rekapSaring, menuSaring, labelKanal, UNIT_LABEL,
  type UnitRekap, type KelasShift,
} from "../../lib/adminStore";
import { fmtDateLong, rupiah } from "../../lib/core";
import { unduhExcel } from "../../lib/excel";
import { cetakHtmlStruk } from "../../lib/cetak";
import { htmlRekapPenjualan, seksiRekap, tanggalPanjang } from "../../lib/strukRekap";

/**
 * REKAP DENGAN SARINGAN (permintaan pemilik 14 Nov 2026). Pilihannya —
 * unit, periode, shift, pembayaran — ada di KEPALA layar Rekap (satu tempat);
 * bagian ini hanya menampilkan hasilnya dan mencetak struknya dalam format
 * "KAS KASIR" yang dikirim pemilik.
 */
const OUTLET_UNIT: Record<UnitRekap, string> = { spl: "SPL SPORT", smh: "SHR", semua: "SPL + SHR" };

export default function RekapSaring({ unit, dari, sampai, shift, kanal, hariIni, perBulan }: {
  unit: UnitRekap; dari: string; sampai: string; shift: KelasShift | "semua"; kanal: string[];
  hariIni: string; perBulan: boolean;
}) {
  const { a } = useAdmin();
  const venueBatas = a.me?.venue;
  const [lihat, setLihat] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);
  const opsi = { dari, sampai, unit, shift, kanal, ...(venueBatas ? { venueBatas } : {}) };
  const h = useMemo(() => rekapSaring(a, opsi), [a, dari, sampai, unit, shift, kanal.join(), venueBatas]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Hari yang tidak punya rincian MENU untuk saringan ini (struk tidak bisa memuatnya). */
  const menuKurang = useMemo(() => menuSaring(a, opsi).hariTanpaRincian, [a, dari, sampai, unit, shift, kanal.join(), venueBatas]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelShift = shift === "semua" ? "Semua shift" : shift === "pagi" ? "Shift Pagi" : "Shift Sore";
  const labelBayar = kanal.length === 0 ? "Rekening All"
    : kanal.length === 1 && kanal[0] === "tunai" ? "Cash" : `Rekening ${kanal.map(labelKanal).join(" + ")}`;
  const labelPeriode = dari === sampai ? tanggalPanjang(dari) : `${tanggalPanjang(dari, false)} – ${tanggalPanjang(sampai, false)}`;

  const rincian = perBulan
    ? Array.from({ length: 12 }, (_, i) => {
        const ym = `${dari.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
        return { label: new Date(Date.UTC(Number(dari.slice(0, 4)), i, 1)).toLocaleDateString("id-ID", { month: "long", timeZone: "UTC" }),
          total: h.hari.filter((x) => x.bizDate.startsWith(ym)).reduce((n, x) => n + x.total, 0) };
      })
    : h.hari.filter((x) => x.total !== 0).map((x) => ({ label: fmtDateLong(x.bizDate), total: x.total }));

  /** Struk "KAS KASIR" untuk saringan yang sedang dipilih. */
  function htmlStruk(): string {
    const menu = menuSaring(a, opsi);
    const sewa = unit === "spl" || unit === "semua" ? h.perLini.biliar : 0;
    return htmlRekapPenjualan({
      venue: unit === "smh" ? "smh" : "spl", bizDate: dari,
      outlet: OUTLET_UNIT[unit], rekening: labelBayar,
      keterangan: [labelPeriode, ...(shift === "semua" ? [] : [labelShift])],
      seksi: seksiRekap(menu.baris),
      ...(sewa > 0 ? { sewaMeja: { sesi: 0, total: sewa } } : {}),
      pembayaran: Object.entries(h.perKanal).sort((p, q) => q[1] - p[1]).map(([k, v]) => ({ label: labelKanal(k).toUpperCase(), nilai: v })),
    });
  }

  async function cetak() {
    const r = await cetakHtmlStruk(htmlStruk());
    setKabar(r.ok ? "Struk terkirim ke printer." : `Gagal mencetak: ${r.alasan ?? "printer tidak menjawab"}`);
    setTimeout(() => setKabar(null), 5000);
  }

  async function unduh() {
    await unduhExcel(`rekap-${unit}-${dari}-${sampai}`, [
      ["REKAP", `${UNIT_LABEL[unit]} · ${labelShift} · ${labelBayar}`], ["Periode", labelPeriode], [],
      ["Total", h.total], [],
      ["Per unit"], ...Object.entries(h.perUnit).map(([k, v]) => [UNIT_LABEL[k as UnitRekap], v]), [],
      ["Per shift"], ["Pagi", h.perShift.pagi], ["Sore", h.perShift.sore], [],
      ["Per pembayaran"], ...Object.entries(h.perKanal).map(([k, v]) => [labelKanal(k), v]), [],
      [perBulan ? "Bulan" : "Tanggal", "Total"], ...rincian.map((r) => [r.label, r.total]),
    ], "Rekap");
  }

  const Baris = ({ label, nilai }: { label: string; nilai: string }) => (
    <div className="flex items-baseline justify-between px-3 py-1.5 text-[13px]">
      <span className="text-mute">{label}</span><span className="tabular-nums text-cream">{nilai}</span>
    </div>
  );
  const kotak = "rounded-xl border border-line bg-ink-2";
  const judul = "mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-dim";

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-amber/50 bg-amber/10 p-3">
        <div className="text-[11px] text-dim">{UNIT_LABEL[unit]} · {labelShift} · {labelBayar}</div>
        <div className="text-[11px] text-dim">{labelPeriode}</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className="font-serif text-2xl font-bold tabular-nums text-amber">{rupiah(h.total)}</span>
          <div className="flex gap-1.5">
            <button onClick={() => setLihat(!lihat)} aria-pressed={lihat}
              className="min-h-[38px] rounded-lg border border-line bg-ink-2 px-3 text-[12px] font-semibold text-mute hover:border-amber hover:text-amber">
              {lihat ? "Tutup struk" : "Lihat struk"}
            </button>
            <button onClick={() => void unduh()}
              className="min-h-[38px] rounded-lg border border-line bg-ink-2 px-3 text-[12px] font-semibold text-mute hover:border-amber hover:text-amber">
              Unduh Excel
            </button>
            <button onClick={() => void cetak()}
              className="min-h-[38px] rounded-lg bg-amber px-4 text-[12px] font-bold text-ink">
              Cetak struk
            </button>
          </div>
        </div>
        {kabar && <p role="status" className="mt-1.5 text-[12px] text-amber">{kabar}</p>}
      </div>

      {lihat && (
        <iframe title="Pratinjau struk rekap" sandbox="" srcDoc={htmlStruk()}
          className="mx-auto block h-[640px] w-[320px] max-w-full rounded border border-line bg-white" />
      )}

      <div className={`grid gap-3 ${unit === "semua" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {/* Per unit hanya berarti untuk Gabungan — untuk satu venue angkanya sama dengan total. */}
        {unit === "semua" && (
          <div className={kotak}>
            <div className={`${judul} px-3 pt-2`}>Per unit</div>
            {(["spl", "smh"] as const).map((u) => <Baris key={u} label={UNIT_LABEL[u]} nilai={rupiah(h.perUnit[u])} />)}
          </div>
        )}
        <div className={kotak}>
          <div className={`${judul} px-3 pt-2`}>Per shift</div>
          <Baris label="Pagi" nilai={rupiah(h.perShift.pagi)} />
          <Baris label="Sore / malam" nilai={rupiah(h.perShift.sore)} />
        </div>
        <div className={kotak}>
          <div className={`${judul} px-3 pt-2`}>Per pembayaran</div>
          {Object.keys(h.perKanal).length === 0
            ? <Baris label="—" nilai={rupiah(0)} />
            : Object.entries(h.perKanal).sort((p, q) => q[1] - p[1]).map(([k, v]) => <Baris key={k} label={labelKanal(k)} nilai={rupiah(v)} />)}
        </div>
      </div>

      {dari !== sampai && (
        <div className={kotak}>
          <div className={`${judul} px-3 pt-2`}>{perBulan ? "Per bulan" : "Per hari"}</div>
          {rincian.length === 0
            ? <p className="px-3 pb-2 text-[12px] text-dim">Belum ada transaksi pada periode ini.</p>
            : <div className="divide-y divide-line">{rincian.map((r) => <Baris key={r.label} label={r.label} nilai={rupiah(r.total)} />)}</div>}
        </div>
      )}

      {menuKurang.length > 0 && (
        <p className="text-[11px] leading-relaxed text-amber">
          Rincian menu {menuKurang.length} hari ({fmtDateLong(menuKurang[0])}
          {menuKurang.length > 1 ? ` – ${fmtDateLong(menuKurang[menuKurang.length - 1])}` : ""}) tidak tersedia untuk
          saringan ini{shift !== "semua" ? " (pecahan per shift baru dicatat sejak 14 Nov 2026)" : " (lebih dari 120 hari)"} —
          tabel menu di struk tidak memuat hari itu, tapi kotak Pembayaran tetap lengkap.
        </p>
      )}
      {h.hariTanpaRincian.length > 0 && (
        <p className="text-[11px] leading-relaxed text-amber">
          {h.hariTanpaRincian.length} hari diarsipkan sebelum saringan ini ada, jadi tidak bisa dipecah per
          unit/shift/rekening. Totalnya tetap ada di bagian Uang.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-dim">
        Semua yang dipesan di SPL Sport (sewa meja, makanan, minuman bar, rokok) masuk SPL Sport; yang dipesan di
        Smokehouse masuk Smokehouse.
        Shift pagi = shift yang dibuka antara 06.00 dan 16.00 WIB; selebihnya sore/malam. Hari ini: {fmtDateLong(hariIni)}.
      </p>
    </section>
  );
}
