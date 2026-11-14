import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  useAdmin, recap, recapRange, periodeRange, recapDates, businessDateOf, settledRefundsOf,
  clampRange, rangeDays, shiftDate, MAX_REKAP_HARI, omzetPerShift,
  ARCHIVE_ROW_DAYS, OPEN_IDX, CLOSE_IDX, mejaDijual, cariMeja, mesinEdc, labelKanal, rekapTigaJenis, rekapJenisRentang,
  type Refund, type RekapPeriode, type UnitRekap, type KelasShift,
} from "../../lib/adminStore";
import { TABLES } from "../../data/venue";
import { fmtDateLong, rupiah } from "../../lib/core";
import { LINI, LINI_LABEL, persenLini } from "../../lib/engine";

/** Angka tabel pajak: tanpa "Rp" supaya lima kolom muat di layar kasir. */
const ribu = (n: number) => n.toLocaleString("id-ID");
import { unduhExcel } from "../../lib/excel";
import LaporanStok from "./LaporanStok";
import DetailTransaksi from "./DetailTransaksi";
import RekapSaring from "./RekapSaring";
import { DuaKolom } from "./Tata";
import LaporanProduk from "./LaporanProduk";
import RekapTigaJenis from "./RekapTigaJenis";
import TrenPenjualan from "./TrenPenjualan";
import LaporanRekap from "./LaporanRekap";
import { useVenueAktif } from "../../lib/venueAktif";
import { VENUE_LABEL, type Venue } from "../../data/venue";

/* Rekap harian. Lima angka dipisah tegas (PRD §7.6):
   gross · pajak terpungut · MDR · net · dan pemisahan per kanal.
   Mencampurnya adalah kesalahan yang membuat pemilik salah baca untung. */

const CHANNEL_LABEL: Record<string, string> = {
  qris_online: "QRIS di kasir",
  cash: "Tunai",
  edc: "Kartu / EDC",
  prabayar: "Prabayar online (sudah masuk sebelumnya)",
};

const METHOD_LABEL: Record<NonNullable<Refund["method"]>, string> = {
  transfer: "Transfer", tunai: "Tunai", kredit: "Kredit toko",
};

export default function Rekap() {
  const { allow } = useAdmin();
  /*
   * KRU KASIR HANYA MELIHAT LAPORAN REKAP (permintaan pemilik 19 Okt 2026).
   *
   * Dipisah DI SINI, bukan dengan menyembunyikan bagian-bagiannya di bawah:
   * isi tab ini kas shift, pajak, MDR, selisih laci, dan uang bersih yang
   * masuk rekening. Menyaringnya satu per satu berarti satu bagian baru yang
   * lupa dipagari akan diam-diam terbuka untuk orang lantai.
   */
  if (!allow("lihatLaporanKeuangan")) return <LaporanRekap />;
  return <RekapKeuangan />;
}

function RekapKeuangan() {
  const { a, dispatchA, allow, peek } = useAdmin();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);
  const today = businessDateOf(Date.now());
  const dates = recapDates(a);
  /** Hari tertua yang tercatat — untuk pintasan "Semua data". */
  const hariPertama = dates[dates.length - 1] ?? today;
  const [picked, setPicked] = useState(today);
  const [periode, setPeriode] = useState<RekapPeriode | "tahun">("hari");
  /** Bulan & tahun yang dipilih untuk periode Bulanan / Tahunan. */
  const [bulanPilih, setBulanPilih] = useState(today.slice(0, 7));
  const [tahunPilih, setTahunPilih] = useState(today.slice(0, 4));
  /** Saringan shift & rekening (bagian Unit · Shift · Rekening dan struknya). */
  const [shiftSaring, setShiftSaring] = useState<KelasShift | "semua">("semua");
  const [kanalSaring, setKanalSaring] = useState<string[]>([]);
  /** Rekap Harian lebih dulu: itu format yang dipegang pemilik tiap malam. */
  const [bagian, setBagian] = useState<"harian" | "uang" | "saring" | "analisa">("harian");
  // Rentang bebas (mode custom): dua kolom tanggal, awalnya 7 hari terakhir.
  const [ct, setCt] = useState({ dari: shiftDate(today, -6), sampai: today });
  const bizDate = dates.includes(picked) ? picked : today;
  const isToday = bizDate === today;
  /**
   * Rekap SPL dan Smokehouse WAJIB terpisah (keputusan pemilik 8 Okt 2026),
   * jadi bawaannya venue yang sedang dibuka — bukan gabungan. Gabungan ada,
   * tapi harus dipilih sadar, supaya tidak ada yang salah baca angka dua
   * venue sebagai angka satu venue.
   */
  const venueAktifIni = useVenueAktif();
  const [lingkup, setLingkup] = useState<Venue | "semua">(venueAktifIni);
  /**
   * Staf yang terikat satu venue tidak punya lingkup untuk dipilih — angka
   * venue sebelah bukan urusannya, dan "Gabungan" berarti melihat keduanya.
   */
  const venueAkun = a.me?.venue;
  /*
   * Unit = VENUE. Bar TIDAK dipisah (keputusan pemilik 14 Nov 2026): makanan,
   * minuman bar, dan rokok yang dipesan di SPL masuk SPL Sport.
   */
  const dipakai: Venue | "semua" = venueAkun ?? lingkup;
  const venue = dipakai === "semua" ? undefined : dipakai;
  const unitSaring: UnitRekap = dipakai;
  const bagianAktif = bagian;
  /** Semua rekening (non-tunai): QRIS, tiap mesin EDC, prabayar, + yang muncul di data. */
  const rekeningSemua = [...new Set(["qris", ...mesinEdc(a).map((m) => `edc:${m}`), "prabayar"])];
  const r = recap(a, bizDate, venue);
  // Periode: hari (seperti dulu), minggu (Senin–Minggu), bulan berjalan, atau rentang bebas.
  const rentang = periode === "custom" ? clampRange(ct.dari, ct.sampai)
    : periode === "tahun" ? { dari: `${tahunPilih}-01-01`, sampai: `${tahunPilih}-12-31`, dipotong: false }
      : periode === "bulan" ? { ...periodeRange(`${bulanPilih}-01`, "bulan"), dipotong: false }
        : { ...periodeRange(bizDate, periode), dipotong: false };
  const { dari, sampai } = rentang;
  const rp = periode === "hari" ? null : recapRange(a, dari, sampai, venue);
  /**
   * SMH-13 & SMH-14 · omzet dipecah per shift dan per kanal bayar.
   *
   * Hanya untuk SATU hari: "Shift Pagi" seminggu adalah tujuh laci yang
   * berbeda dengan tujuh orang yang berbeda, dan menjumlahkannya menghasilkan
   * angka yang tidak bisa dipertanggungjawabkan siapa pun.
   */
  const os = periode === "hari" ? omzetPerShift(a, bizDate, venue) : null;
  /** Shift yang sedang dilihat. null = ALL (semua shift). */
  const [shiftPilih, setShiftPilih] = useState<string | null>(null);
  const barisShift = os
    ? (shiftPilih === null
        ? os.semua
        : [...os.shift, ...(os.tanpaShift ? [os.tanpaShift] : [])].find((x) => x.id === shiftPilih) ?? os.semua)
    : null;
  /** Angka uang yang ditampilkan: sehari, atau jumlah hari-hari dalam periode. */
  const u = rp ? { ...rp.money, counts: rp.counts } : r;
  const dayLabel = periode === "hari"
    ? (isToday ? "hari ini" : fmtDateLong(bizDate))
    : periode === "minggu" ? `minggu ${fmtDateLong(dari)} – ${fmtDateLong(sampai)}`
      : periode === "tahun" ? `tahun ${tahunPilih}`
      : periode === "custom"
        ? (dari === sampai ? fmtDateLong(dari) : `${fmtDateLong(dari)} – ${fmtDateLong(sampai)} (${rangeDays(dari, sampai)} hari)`)
        : `bulan ${new Date(Number(dari.slice(0, 4)), Number(dari.slice(5, 7)) - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`;

  const labelLingkupWaktu = periode === "hari"
    ? (isToday ? `Hari ini, ${fmtDateLong(bizDate)}` : fmtDateLong(bizDate))
    : `${fmtDateLong(dari)} – ${fmtDateLong(sampai > today ? today : sampai)}`;
  /** Angka utama (pendapatan, uang masuk, biaya, bersih) — rumus yang sama dengan tab Kas Kasir. */
  const rk = useMemo(() => (rp ? rekapJenisRentang(a, dari, sampai > today ? today : sampai, venue) : rekapTigaJenis(a, bizDate, venue)),
    [a, rp, dari, sampai, today, venue, bizDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const OPEN_HOURS = CLOSE_IDX - OPEN_IDX;   // 11.00–06.00 = 19 jam
  // Penyebut ikut periode: kalau yang dilihat 30 hari, kapasitasnya juga 30 hari —
  // kalau tidak, utilisasi sebulan terbaca seperti seperempat persen.
  const hariDihitung = rp ? rangeDays(dari, sampai) : 1;
  const kapasitas = mejaDijual(a).length * OPEN_HOURS * hariDihitung;
  const adaHariIni = rp ? dari <= today && today <= sampai : isToday;
  // Hanya jam main nyata dalam periode itu: tab yang ditutup (bukan no-show —
  // mejanya tidak dipakai), ditambah sesi yang sedang berjalan bila hari ini ikut dihitung.
  const terpakai = (rp ? rp.counts.playedHours : r.counts.playedHours) + (adaHariIni
    ? a.sessions.filter((s) => s.status === "running")
        .reduce((sum, s) => sum + Math.max(0, (Math.max(s.startsAt, Date.now()) - s.startsAt) / 3_600_000), 0)
    : 0);
  const utilisasi = Math.min(100, (terpakai / kapasitas) * 100);
  const adaTransaksi = r.counts.done + r.counts.noShow + r.counts.takeaway > 0;

  const openRefunds = a.refunds.filter((f) => !f.settledAt);
  const settledRefunds = settledRefundsOf(a);

  function settle(f: Refund, method: NonNullable<Refund["method"]>) {
    const tolak = dispatchA({ t: "settleRefund", id: f.id, method });
    const after = peek().refunds.find((x) => x.id === f.id);
    setRefundMsg(after?.settledAt
      ? `${f.guest}: ${rupiah(f.amount)} dicatat sudah dikembalikan (${METHOD_LABEL[method]}).`
      : tolak ?? "Tidak tercatat — hanya superadmin yang bisa menandai dana sudah dikembalikan.");
    setTimeout(() => setRefundMsg(null), 5000);
  }

  async function exportCSV() {
    const waktu = (ts?: number) => (ts ? new Date(ts).toLocaleString("id-ID") : "");
    const rows = [
      ["hari_operasional", "kode", "meja", "status", "sumber", "tamu", "mulai", "selesai", "kanal",
        "nilai_meja", "nilai_fnb", "diskon", "diterima_kasir", "prabayar_online"],
      ...r.done.map((s) => {
        const t = cariMeja(s.tableId);
        return [
          bizDate,
          s.bookingCode ?? s.id,
          t?.name ?? s.tableId,
          s.status === "noshow" ? "no-show" : "selesai",
          s.source,
          s.guest,
          waktu(s.startsAt),
          waktu(s.status === "noshow" ? s.settledAt : s.endsAt),
          s.settledChannel ?? "",
          String(s.settledBilliard ?? 0),
          String(s.settledFnb ?? 0),
          String(s.settledDiscount ?? 0),
          String(s.settledAmount ?? 0),
          String(s.paidOnline),
        ];
      }),
      // Takeaway dibayar di muka dan tidak punya sesi meja.
      ...r.takeaway.map((o) => [
        bizDate, o.code, "Takeaway", "takeaway", "hp", o.guest,
        waktu(o.at), "", "prabayar_online",
        "0", String(o.value), "0", "0", String(o.paidOnline),
      ]),
    ];
    // Dana pelanggan yang dicatat pada hari operasional ini — terpisah dari penjualan.
    const refundsHariIni = a.refunds.filter((f) => businessDateOf(f.at) === bizDate);
    if (refundsHariIni.length) {
      rows.push([], ["refund_dicatat", "kode", "tamu", "alasan", "nominal", "status", "dikembalikan_pada", "metode", "petugas"]);
      for (const f of refundsHariIni) {
        rows.push([waktu(f.at), f.bookingCode, f.guest, f.reason, String(f.amount),
          f.settledAt ? "sudah" : "belum", waktu(f.settledAt), f.method ?? "", f.settledBy ?? ""]);
      }
    }
    const hasil = await unduhExcel(`rekap-spl-${bizDate}`, rows, `Rekap ${bizDate}`);
    setSaveMsg(
      hasil === "tersimpan" ? "Rekap tersimpan."
        : hasil === "dibatalkan" ? "Penyimpanan dibatalkan."
        : "Gagal menyimpan berkas.",
    );
    setTimeout(() => setSaveMsg(null), 4000);
  }

  async function exportPeriodeCSV() {
    if (!rp) return;
    const rows: string[][] = [
      [`Rekap ${periode === "minggu" ? "mingguan" : periode === "bulan" ? "bulanan" : "rentang"} SPL`, `${dari} s/d ${sampai}`],
      [],
      ["hari", "nilai_penjualan", "diterima_kasir", "prabayar", "biliar", "fnb", "diskon", "dpp", "pbjt", "mdr", "net", "tab_ditutup", "no_show", "takeaway", "jam_main"],
      ...rp.hari.map((h) => [
        h.bizDate, String(h.money.gross), String(h.money.diterima), String(h.money.prabayar),
        String(h.money.billiard), String(h.money.fnb), String(h.money.discount),
        String(h.money.dpp), String(h.money.tax), String(h.money.mdr), String(h.money.net),
        String(h.counts.done), String(h.counts.noShow), String(h.counts.takeaway), h.counts.playedHours.toFixed(2),
      ]),
      [],
      ["TOTAL", String(u.gross), String(u.diterima), String(u.prabayar), String(u.billiard), String(u.fnb),
        String(u.discount), String(u.dpp), String(u.tax), String(u.mdr), String(u.net),
        String(u.counts.done), String(u.counts.noShow), String(u.counts.takeaway), u.counts.playedHours.toFixed(2)],
      [],
      ["per_kanal", "jumlah_transaksi", "nilai"],
      ...Object.entries(u.byChannel).map(([ch, v]) => [CHANNEL_LABEL[ch] ?? ch, String(v.n), String(v.gross)]),
    ];
    const hasil = await unduhExcel(`rekap-spl-${periode}-${dari}`, rows, `Rekap ${periode}`);
    setSaveMsg(hasil === "tersimpan" ? "Rekap periode tersimpan."
      : hasil === "dibatalkan" ? "Penyimpanan dibatalkan." : "Gagal menyimpan berkas.");
    setTimeout(() => setSaveMsg(null), 4000);
  }

  return (
    <div className="space-y-5 pb-6">
      {/* ── KEPALA REKAP (dirombak 14 Nov 2026, pemilik: "berantakan, tumpang tindih")
          Tiga lapis yang jelas bedanya:
            1. Judul + LINGKUP laporan (unit · periode · tanggal) — berlaku untuk semua tab.
            2. Empat ANGKA UTAMA — jawaban yang paling sering dicari, sebelum menggulir.
            3. TAB bergaris bawah — beda bentuk dengan tombol pilihan, jadi tidak tertukar.
          Saringan yang hanya berlaku di satu tab (shift, rekening) pindah ke tab itu. */}
      <section className="rounded-2xl border border-line bg-ink-2">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl uppercase tracking-wide text-cream">Rekap</h1>
            <p className="truncate text-[12px] text-mute">
              {dipakai === "semua" ? "SPL Sport + Smokehouse" : VENUE_LABEL[dipakai]} · {labelLingkupWaktu}
            </p>
          </div>
          {venueAkun && (
            <span className="rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1 text-[11px] font-semibold text-amber">
              Akun {VENUE_LABEL[venueAkun]}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-4 py-3">
          {!venueAkun && (
            <Kendali label="Unit">
              <Segmen pilihan={[["spl", "SPL Sport"], ["smh", "Smokehouse"], ["semua", "Gabungan"]] as const}
                nilai={dipakai} ubah={setLingkup} />
            </Kendali>
          )}
          <Kendali label="Periode">
            <Segmen pilihan={[["hari", "Harian"], ["minggu", "Mingguan"], ["bulan", "Bulanan"], ["tahun", "Tahunan"], ["custom", "Rentang"]] as const}
              nilai={periode} ubah={setPeriode} />
          </Kendali>
          <Kendali label={periode === "custom" ? "Dari – sampai" : periode === "bulan" ? "Bulan" : periode === "tahun" ? "Tahun" : periode === "minggu" ? "Minggu" : "Tanggal"}>
            <div className="flex flex-wrap items-center gap-1.5">
              {periode === "hari" && (
                <select value={bizDate} onChange={(e) => setPicked(e.target.value)} aria-label="Hari operasional" className={KOLOM}>
                  {dates.map((d) => (
                    <option key={d} value={d}>{d === today ? `Hari ini · ${fmtDateLong(d)}` : fmtDateLong(d)}</option>
                  ))}
                </select>
              )}
              {periode === "minggu" && <span className={`${KOLOM} inline-flex items-center`}>{fmtDateLong(dari)} – {fmtDateLong(sampai)}</span>}
              {periode === "bulan" && (
                <input type="month" value={bulanPilih} max={today.slice(0, 7)} aria-label="Bulan" className={KOLOM}
                  onChange={(e) => e.target.value && setBulanPilih(e.target.value)} />
              )}
              {periode === "tahun" && (
                <select value={tahunPilih} onChange={(e) => setTahunPilih(e.target.value)} aria-label="Tahun" className={KOLOM}>
                  {Array.from({ length: Math.max(1, Number(today.slice(0, 4)) - Number(hariPertama.slice(0, 4)) + 1) },
                    (_, k) => String(Number(today.slice(0, 4)) - k)).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              {periode === "custom" && (<>
                <input type="date" value={ct.dari} max={today} aria-label="Dari tanggal" className={KOLOM}
                  onChange={(e) => e.target.value && setCt((c) => ({ ...c, dari: e.target.value }))} />
                <span className="text-[12px] text-dim">–</span>
                <input type="date" value={ct.sampai} max={today} aria-label="Sampai tanggal" className={KOLOM}
                  onChange={(e) => e.target.value && setCt((c) => ({ ...c, sampai: e.target.value }))} />
                {([
                  ["7 hari", () => ({ dari: shiftDate(today, -6), sampai: today })],
                  ["30 hari", () => ({ dari: shiftDate(today, -29), sampai: today })],
                  ["Semua", () => ({ dari: hariPertama, sampai: today })],
                ] as const).map(([label, f]) => (
                  <button key={label} onClick={() => setCt(f())}
                    className="min-h-[38px] rounded-lg border border-line px-2.5 text-[11px] text-mute hover:border-amber hover:text-amber">
                    {label}
                  </button>
                ))}
              </>)}
            </div>
          </Kendali>
        </div>

        {(dipakai === "semua" || (r.venueTercampur && venue) || rentang.dipotong) && (
          <div className="space-y-1 border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-amber">
            {dipakai === "semua" && <p>Angka menjumlahkan SPL Sport dan Smokehouse. Untuk menyetor kas, pilih salah satu venue.</p>}
            {r.venueTercampur && venue && <p>Hari ini sudah terlalu lama, jadi angkanya tidak bisa lagi dipisah per venue.</p>}
            {rentang.dipotong && <p>Rentang dipotong ke {MAX_REKAP_HARI} hari.</p>}
          </div>
        )}
      </section>

      {/* ANGKA UTAMA — sama untuk semua tab, mengikuti unit & periode di atas. */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Angka utama">
        <Ubin label="Pendapatan" nilai={rupiah(rk.pendapatan)}
          ket={`${venue !== "smh" ? `Sewa ${rupiah(rk.sewaMeja)} · ` : ""}barang ${rupiah(rk.totalBarang)}${rk.diskon > 0 ? ` · diskon ${rupiah(rk.diskon)}` : ""}`} />
        <Ubin label="Uang masuk" nilai={rupiah(rk.uang.total)}
          ket={`Tunai ${rupiah(rk.uang.tunai)} · non-tunai ${rupiah(rk.uang.total - rk.uang.tunai)}`} />
        <Ubin label="Biaya" nilai={rupiah(rk.totalBiaya)} ket={`${rk.biaya.length} catatan`} />
        <Ubin label="Bersih" nilai={rupiah(rk.bersih)} ket="pendapatan − biaya" sorot />
      </section>

      {/* TAB — garis bawah, bukan tombol: beda bentuk dengan pilihan di atas. */}
      <nav className="no-bar flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Bagian rekap">
        {([["harian", "Kas Kasir"], ["uang", "Uang & Pajak"], ["saring", "Shift & Rekening"], ["analisa", "Analisa"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={bagianAktif === k} onClick={() => setBagian(k)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors ${
              bagianAktif === k ? "border-amber text-amber" : "border-transparent text-mute hover:text-cream"
            }`}>{label}</button>
        ))}
      </nav>

      {bagianAktif === "harian" && (
        <RekapTigaJenis dari={rp ? dari : bizDate} sampai={rp ? sampai : bizDate} venue={venue} hariIni={today} />
      )}

      {bagianAktif === "saring" && (<>
        {/* Saringan khusus tab ini — tidak di kepala, karena tab lain tidak memakainya. */}
        <section className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-2xl border border-line bg-ink-2 px-4 py-3">
          <Kendali label="Shift">
            <Segmen pilihan={[["semua", "Semua"], ["pagi", "Pagi"], ["sore", "Sore"]] as const}
              nilai={shiftSaring} ubah={setShiftSaring} />
          </Kendali>
          <Kendali label="Pembayaran">
            <div className="flex flex-wrap items-center gap-1.5">
              <Segmen pilihan={[["semua", "Semua"], ["tunai", "Cash"], ["rekening", "Rekening"]] as const}
                nilai={kanalSaring.length === 0 ? "semua"
                  : kanalSaring.length === 1 && kanalSaring[0] === "tunai" ? "tunai"
                    : rekeningSemua.every((k) => kanalSaring.includes(k)) ? "rekening" : "lain"}
                ubah={(x) => setKanalSaring(x === "semua" ? [] : x === "tunai" ? ["tunai"] : rekeningSemua)} />
              {rekeningSemua.map((k) => (
                <button key={k} aria-pressed={kanalSaring.includes(k)}
                  onClick={() => setKanalSaring((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x.filter((y) => y !== "tunai"), k]))}
                  className={`min-h-[34px] rounded-full border px-3 text-[11px] font-semibold ${
                    kanalSaring.includes(k) ? "border-amber bg-amber/15 text-amber" : "border-line text-dim hover:text-cream"
                  }`}>{kanalSaring.includes(k) ? "✓ " : ""}{labelKanal(k)}</button>
              ))}
            </div>
          </Kendali>
        </section>
        <RekapSaring unit={unitSaring} dari={dari} sampai={sampai > today ? today : sampai} shift={shiftSaring}
          kanal={kanalSaring} hariIni={today} perBulan={periode === "tahun"} />
      </>)}

      {bagianAktif === "uang" && (<>
      {/* Dana pelanggan yang wajib dikembalikan — semua hari, tidak boleh tenggelam */}
      {a.refunds.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:content-[''] text-red-300 before:bg-red-400">
            Dana perlu dikembalikan · {openRefunds.length}
            {openRefunds.length > 0 && ` · ${rupiah(openRefunds.reduce((n, f) => n + f.amount, 0))}`}
          </h2>
          {openRefunds.length === 0 ? (
            <div className="rounded-xl border border-line bg-ink-2 px-4 py-4 text-center text-[13px] text-dim">
              Semua dana pelanggan sudah dikembalikan.
            </div>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-red-500/40 bg-red-500/5">
              {openRefunds.map((f) => (
                <div key={f.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-cream">{f.guest} · {f.bookingCode}</div>
                      <div className="text-[11px] leading-snug text-dim">
                        {f.reason} · dicatat {new Date(f.at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {f.phone && ` · ${f.phone}`}
                      </div>
                    </div>
                    <div className="shrink-0 font-serif text-[14px] font-bold tabular-nums text-red-300">
                      {rupiah(f.amount)}
                    </div>
                  </div>
                  {allow("lihatLaporanKeuangan") && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-dim">Sudah dikembalikan lewat:</span>
                      {(Object.keys(METHOD_LABEL) as NonNullable<Refund["method"]>[]).map((m) => (
                        <button key={m} onClick={() => settle(f, m)}
                          className="min-h-[34px] rounded-lg border border-line bg-ink px-2.5 text-[12px] text-cream hover:border-amber hover:text-amber">
                          {METHOD_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {refundMsg && <p role="status" className="mt-1.5 text-[12px] text-amber">{refundMsg}</p>}
          {settledRefunds.length > 0 && (
            <details className="mt-2 rounded-xl border border-line bg-ink-2 px-3 py-2">
              <summary className="cursor-pointer text-[12px] text-mute">Sudah dikembalikan · {settledRefunds.length}</summary>
              <div className="mt-1 divide-y divide-line">
                {settledRefunds.map((f) => (
                  <div key={f.id} className="flex justify-between gap-3 py-1.5 text-[12px]">
                    <span className="min-w-0 truncate text-mute">
                      {f.guest} · {f.bookingCode} · {METHOD_LABEL[f.method ?? "transfer"]} oleh {f.settledBy}
                    </span>
                    <span className="shrink-0 font-serif tabular-nums text-dim">{rupiah(f.amount)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Pembayaran online yang tidak bisa dipenuhi (slot keburu diambil, tarif berubah,
            stok habis) atau booking/pesanan yang di-void. Uangnya sudah masuk, jadi harus dikembalikan
            atau dijadikan kredit — jangan dihitung sebagai pendapatan. Tandai setelah benar-benar ditransfer.
          </p>
        </section>
      )}


      {/* Perapian 14 Nov 2026: kiri = uangnya (lapisan & cara bayar),
          kanan = siapa yang menerimanya (shift) & dari lini mana. */}
      <DuaKolom
        kiri={<>
      {/* Lima lapisan uang */}
      <section>
        <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Uang {dayLabel}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-ink-2">
          <div className="flex items-baseline justify-between bg-amber/10 px-4 py-4">
            <span className="font-display text-lg uppercase tracking-wide text-cream">
              Nilai Penjualan
            </span>
            <span className="font-serif text-3xl font-bold tabular-nums text-amber">
              {rupiah(u.gross)}
            </span>
          </div>
          <div className="divide-y divide-line">
            <Line k="Dasar pengenaan (DPP)" v={rupiah(u.dpp)} muted />
            <Line k="PPN — dipungut, bukan pendapatan" v={rupiah(u.tax)} warn />
            {(u.service ?? 0) > 0 && (
              <Line k="Service — sudah termasuk harga" v={rupiah(u.service ?? 0)} />
            )}
            {/* PECAHAN PER LINI (permintaan pemilik 18 Okt 2026). Hanya
                muncul kalau datanya ada: hari yang sudah tutup buku sebelum
                perubahan ini tidak menyimpannya, dan menampilkan nol di situ
                akan terbaca seolah lini itu tidak berjualan. */}
            {u.perLini && LINI.some((k) => u.perLini![k].gross > 0) && (
              <div className="px-4 py-3">
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
                  Pecahan per lini usaha
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-dim">
                      <th className="text-left font-normal">Lini</th>
                      <th className="text-right font-normal">Omzet</th>
                      <th className="text-right font-normal">DPP</th>
                      <th className="text-right font-normal">PPN</th>
                      <th className="text-right font-normal">Service</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-mute">
                    {LINI.map((k) => {
                      const x = u.perLini![k];
                      const p = persenLini(a, k);
                      return (
                        <tr key={k}>
                          <td className="py-0.5 text-cream">
                            {LINI_LABEL[k]}
                            <span className="ml-1 text-[10px] text-dim">
                              {p.ppn}%{p.service > 0 ? ` +${p.service}%` : ""}
                            </span>
                          </td>
                          <td className="text-right">{ribu(x.gross)}</td>
                          <td className="text-right">{ribu(x.dpp)}</td>
                          <td className="text-right text-amber">{ribu(x.tax)}</td>
                          <td className="text-right">{ribu(x.service)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Line k="Potongan biaya QRIS & kartu" v={`− ${rupiah(u.mdr)}`} warn />
            <div className="flex items-baseline justify-between px-4 py-3">
              <span className="text-sm font-semibold text-cream">Masuk rekening (net)</span>
              <span className="font-serif text-xl font-bold tabular-nums text-emerald-400">
                {rupiah(u.net)}
              </span>
            </div>
          </div>
        </div>
        {u.prabayar > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line bg-ink-2 p-3">
              <div className="text-[10px] uppercase tracking-wider text-dim">Diterima di kasir</div>
              <div className="font-serif text-lg font-bold tabular-nums text-cream">{rupiah(u.diterima)}</div>
              <div className="text-[11px] text-dim">{rp ? "uang yang masuk di periode ini" : "uang yang masuk hari ini"}</div>
            </div>
            <div className="rounded-xl border border-line bg-ink-2 p-3">
              <div className="text-[10px] uppercase tracking-wider text-dim">Sudah dibayar online</div>
              <div className="font-serif text-lg font-bold tabular-nums text-cream">{rupiah(u.prabayar)}</div>
              <div className="text-[11px] text-dim">masuk saat booking</div>
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Nilai penjualan = semua yang terjual {rp ? "di rentang ini" : "hari ini"}, termasuk meja yang sudah
          dibayar online sebelumnya. Uang yang benar-benar diterima di kasir bisa
          lebih kecil — itu wajar, bukan kebocoran.
          PPN adalah uang titipan untuk pemerintah daerah — bukan keuntungan; persennya diatur di Pengaturan.
          MDR QRIS memakai skema berjenjang: transaksi sampai Rp 500.000 bebas biaya
          untuk merchant kategori Usaha Mikro.
        </p>
      </section>

      {/* Per kanal — tanpa ini laporan menyesatkan */}
      <section>
        <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Per kanal pembayaran
        </h2>
        {!adaTransaksi ? (
          <div className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
            Belum ada tab yang ditutup atau takeaway {dayLabel}.
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(u.byChannel).map(([ch, v]) => {
              const pct = u.gross > 0 ? (v.gross / u.gross) * 100 : 0;
              return (
                <div key={ch} className="rounded-xl border border-line bg-ink-2 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-cream">{CHANNEL_LABEL[ch] ?? ch}</span>
                    <span className="font-serif text-base font-bold tabular-nums text-cream">
                      {rupiah(v.gross)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-3">
                    <motion.div
                      className="h-full rounded-full bg-amber"
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-dim">
                    {v.n} transaksi · {pct.toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

        </>}
        kanan={<>
      {/* SMH-13 & SMH-14 · Omzet per shift: TUNAI | QRIS | EDC, pagi/sore/ALL */}
      {os && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
            Omzet per shift
          </h2>

          {os.shift.length === 0 && !os.tanpaShift ? (
            <div className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
              Belum ada shift dibuka {dayLabel}.
            </div>
          ) : (
            <>
              {/* Saringan: ALL · tiap shift. Bawaannya ALL supaya yang pertama
                  terlihat adalah angka harian yang utuh. */}
              <div className="no-bar flex gap-1.5 overflow-x-auto pb-1">
                {[{ id: null as string | null, nama: "Semua shift" },
                  ...os.shift.map((s) => ({ id: s.id as string | null, nama: s.nama })),
                  ...(os.tanpaShift ? [{ id: os.tanpaShift.id as string | null, nama: "Tanpa shift" }] : []),
                ].map((x) => (
                  <button key={x.id ?? "all"} onClick={() => setShiftPilih(x.id)}
                    aria-pressed={shiftPilih === x.id}
                    className={`shrink-0 rounded-lg border px-3 py-2 text-[12px] font-semibold ${
                      shiftPilih === x.id ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
                    }`}>
                    {x.nama}
                  </button>
                ))}
              </div>

              {barisShift && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-ink-2">
                  <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
                    <div>
                      <div className="text-[13px] font-semibold text-cream">{barisShift.nama}</div>
                      <div className="text-[11px] text-dim">
                        {barisShift.openedAt
                          ? `buka ${new Date(barisShift.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
                          : "gabungan"}
                        {barisShift.closedAt
                          ? ` · tutup ${new Date(barisShift.closedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
                          : barisShift.openedAt ? " · masih jalan" : ""}
                        {" · "}{barisShift.trx} pembayaran
                      </div>
                    </div>
                    <span className="font-serif text-2xl font-bold tabular-nums text-amber">
                      {rupiah(barisShift.diterima)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-line">
                    {([["TUNAI", barisShift.tunai], ["QRIS", barisShift.qris], ["EDC", barisShift.edc]] as const)
                      .map(([k, v]) => (
                        <div key={k} className="px-3 py-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">{k}</div>
                          <div className="font-serif text-[15px] font-bold tabular-nums text-cream">{rupiah(v)}</div>
                          <div className="text-[10px] text-dim">
                            {barisShift.diterima > 0 ? `${Math.round((v / barisShift.diterima) * 100)}%` : "—"}
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="divide-y divide-line border-t border-line">
                    <Line k="Sewa meja" v={rupiah(barisShift.sewaMeja)} muted />
                    <Line k="Makanan & minuman" v={rupiah(barisShift.barang)} muted />
                    {barisShift.diskon > 0 && <Line k="Diskon diberikan" v={`− ${rupiah(barisShift.diskon)}`} warn />}
                    {barisShift.compliment > 0 && (
                      <Line k="Compliment (ditanggung venue)" v={`− ${rupiah(barisShift.compliment)}`} warn />
                    )}
                    {barisShift.prabayar > 0 && (
                      <Line k="Prabayar online — tidak ada di laci" v={rupiah(barisShift.prabayar)} muted />
                    )}
                  </div>
                </div>
              )}

              <p className="mt-2 text-[11px] leading-relaxed text-dim">
                Satu pembayaran masuk shift tempat uangnya DITERIMA, bukan shift yang membuka
                mejanya — tab yang dibuka shift pagi dan dibayar shift sore adalah uang shift sore.
                Prabayar online dipisah karena uangnya tidak pernah lewat laci.
                {os.tanpaShift && " Baris \u201cTanpa shift\u201d adalah uang yang tidak bisa ditempelkan ke shift mana pun — biasanya jejak lama; sengaja ditampilkan supaya jumlahnya tetap cocok dengan rekap harian."}
              </p>
            </>
          )}
        </section>
      )}

      {/* Pisah dua lini usaha — permintaan pemilik. Margin biliar dan
          smokehouse sangat berbeda; mencampurnya menyembunyikan mana yang
          sebenarnya menghasilkan. */}
      <section>
        <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Per lini usaha
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <LineCard
            nama="SPL Biliar" sub="sewa meja"
            nilai={u.billiard} total={u.billiard + u.fnb} warna="text-amber" bar="bg-amber"
          />
          <LineCard
            nama="Smokehouse" sub="makanan & minuman"
            nilai={u.fnb} total={u.billiard + u.fnb} warna="text-emerald-400" bar="bg-emerald-500"
          />
        </div>
        {u.discount > 0 && (
          <div className="mt-2 flex items-baseline justify-between rounded-xl border border-line
            bg-ink-2 px-4 py-2.5">
            <span className="text-[13px] text-dim">
              Total diskon diberikan
              {(u.diskonManual ?? 0) > 0 && ` · ${rupiah(u.diskonManual ?? 0)} di antaranya diskon manual kasir`}
            </span>
            <span className="font-serif text-[14px] tabular-nums text-amber">− {rupiah(u.discount)}</span>
          </div>
        )}
        {/* SMH-11b: barang yang digratiskan punya barisnya sendiri. Nilainya
            TIDAK ikut omzet (barangnya memang tidak dibayar), tapi tidak boleh
            hilang dari laporan — ini biaya yang ditanggung venue. */}
        {(u.compliment ?? 0) > 0 && (
          <div className="mt-2 flex items-baseline justify-between rounded-xl border border-sky-500/40
            bg-sky-500/5 px-4 py-2.5">
            <span className="text-[13px] text-sky-200">
              Compliment — barang digratiskan venue
              {/* Rincian meja compliment (14 Nov 2026): owner & band terlihat terpisah. */}
              {u.complimentMeja && (
                <span className="mt-0.5 block text-[11px] text-sky-200/80">
                  Meja Owner {rupiah(u.complimentMeja.owner)} · Meja Entertain {rupiah(u.complimentMeja.entertain)}
                  {" · "}per item {rupiah(Math.max(0, (u.compliment ?? 0) - u.complimentMeja.owner - u.complimentMeja.entertain))}
                </span>
              )}
            </span>
            <span className="font-serif text-[14px] tabular-nums text-sky-200">{rupiah(u.compliment ?? 0)}</span>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Angka ini sebelum potongan pajak dan MDR. Attach rate F&B —
          berapa besar belanja makanan dibanding sewa meja — adalah ukuran
          paling cepat untuk melihat apakah dapur benar-benar dimanfaatkan.
        </p>
      </section>

        </>}
      />

      {/* Rincian per hari dalam periode */}
      {rp && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
            Per hari · {rp.hari.filter((h) => h.money.gross > 0).length} hari ada transaksi
          </h2>
          {rp.hari.every((h) => h.money.gross === 0) ? (
            <div className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
              Belum ada transaksi pada periode ini.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-ink-2">
              {rp.hari.filter((h) => h.money.gross > 0 || h.counts.done > 0).map((h) => {
                const pct = rp.terbaik && rp.terbaik.gross > 0 ? (h.money.gross / rp.terbaik.gross) * 100 : 0;
                return (
                  <button key={h.bizDate} onClick={() => { setPeriode("hari"); setPicked(h.bizDate); }}
                    className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-0">
                    <span className="w-24 shrink-0 text-[12px] text-mute">{fmtDateLong(h.bizDate).replace(/ \d{4}$/, "")}</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-3">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-amber/70" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-24 shrink-0 text-right font-serif text-[12px] tabular-nums text-cream">
                      {rupiah(h.money.gross)}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[11px] text-dim">{h.counts.done} tab</span>
                  </button>
                );
              })}
            </div>
          )}
          {rp.terbaik && (
            <p className="mt-1.5 text-[11px] text-dim">
              Hari terbaik: {fmtDateLong(rp.terbaik.bizDate)} · {rupiah(rp.terbaik.gross)}. Ketuk baris untuk membuka rekap hari itu.
            </p>
          )}
        </section>
      )}

      {/* Rincian yang menyusun angka di atas — bentuknya mengikuti laporan
          "DETAIL TRANSAKSI" yang sudah dicetak pemilik tiap malam. */}
      {os && barisShift && (
        <DetailTransaksi os={os} pilih={shiftPilih} nama={barisShift.nama} bizDate={bizDate} venue={venue} />
      )}

      {/* Struk settlement pindah ke tab Kas Kasir (satu tempat cetak, bisa per shift). */}

      </>)}

      {bagianAktif === "analisa" && (<>
      <DuaKolom kiri={<TrenPenjualan venue={venue} hariIni={today} />} kanan={<>
      {/* Operasional */}
      <section>
        <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Operasional
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Utilisasi meja" value={`${utilisasi.toFixed(0)}%`}
            hint={`${terpakai.toFixed(0)} dari ${kapasitas} jam-meja${hariDihitung > 1 ? ` · ${hariDihitung} hari` : ""}`} />
          <Metric label="Tab ditutup" value={String(u.counts.done)}
            hint={u.counts.noShow > 0 ? `${u.counts.noShow} no-show dilepas` : dayLabel} />
          <Metric label="Takeaway" value={String(u.counts.takeaway)}
            hint={rupiah(u.counts.takeawayValue)} />
          {/* Kondisi lantai hanya bermakna untuk saat ini. */}
          {isToday && (
            <>
              <Metric label="Sedang jalan" value={String(r.running)} hint={`${r.free} meja kosong`} />
              <Metric label="Meja rusak" value={String(r.maint)} hint="tidak bisa dijual" />
              <Metric label="QR sedang dibayar" value={String(r.holds)} hint="slot ditahan" />
            </>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Penyebut utilisasi adalah jam-meja tersedia ({mejaDijual(a).length} meja × {OPEN_HOURS} jam
          {hariDihitung > 1 ? ` × ${hariDihitung} hari` : ""}), bukan 24 jam. Meja rusak tetap dihitung
          supaya kerugiannya terlihat.
        </p>
      </section>
      </>} />

      {/* SPL-11 · penjualan per produk. Rentang & venue-nya diwarisi dari
          layar ini supaya tidak ada dua tanggal di satu halaman. */}
      <LaporanProduk dari={rp ? dari : bizDate} sampai={rp ? sampai : bizDate} venue={venue} />

      {/* Laporan stok 05.00 → 05.00 */}
      <LaporanStok />
      </>)}

      {/* JEJAK AKTIVITAS PINDAH KE TABNYA SENDIRI (permintaan pemilik 21 Okt
          2026: *"untuk rekap ini focus ke keuangan dan finance saja dan jejak
          aktivitas di panel khusus"*).

          Yang dulu ada di sini cuma 12 baris terakhir, tanpa nama pelakunya,
          dua venue bercampur — padahal keterangannya menjanjikan "tercatat
          lengkap dengan siapa pelakunya". Sekarang janjinya ditepati di tab
          Jejak: lengkap, bernama, bisa disaring per orang, dan terpisah per
          venue. Tab ini tinggal uang. */}

      {bagianAktif === "uang" && (
      <div>
        <button
          onClick={() => (rp ? exportPeriodeCSV() : exportCSV())}
          disabled={rp ? rp.money.gross === 0 : (!adaTransaksi || !r.rowsAvailable)}
          className="min-h-[48px] w-full rounded-xl border border-line bg-ink-2 text-sm
            font-semibold text-cream hover:border-amber hover:text-amber disabled:opacity-40"
        >
          Unduh rekap Excel{rp ? " (per hari)" : ""}
        </button>
        {!r.rowsAvailable ? (
          <p className="mt-1.5 text-center text-[11px] text-dim">
            Rincian per transaksi hanya disimpan {ARCHIVE_ROW_DAYS} hari; angka rekap di atas tetap lengkap.
          </p>
        ) : !adaTransaksi && (
          <p className="mt-1.5 text-center text-[11px] text-dim">
            Belum ada transaksi selesai untuk diekspor.
          </p>
        )}
        {saveMsg && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-1.5 text-center text-[12px] text-amber"
          >{saveMsg}</motion.p>
        )}
      </div>
      )}
    </div>
  );
}

function LineCard({
  nama, sub, nilai, total, warna, bar,
}: { nama: string; sub: string; nilai: number; total: number; warna: string; bar: string }) {
  const pct = total > 0 ? (nilai / total) * 100 : 0;
  return (
    <div className="rounded-xl border border-line bg-ink-2 p-3">
      <div className="text-[10px] uppercase tracking-wider text-dim">{nama}</div>
      <div className={`font-serif text-xl font-bold tabular-nums ${warna}`}>{rupiah(nilai)}</div>
      <div className="text-[11px] text-dim">{sub}</div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-3">
        <motion.div className={`h-full rounded-full ${bar}`}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }} />
      </div>
      <div className="mt-1 text-[11px] text-dim">{pct.toFixed(0)}% dari omzet</div>
    </div>
  );
}

function Line({ k, v, muted, warn }: { k: string; v: string; muted?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-2.5">
      <span className="pr-3 text-[13px] leading-snug text-dim">{k}</span>
      <span className={`shrink-0 font-serif text-sm tabular-nums ${
        warn ? "text-amber/90" : muted ? "text-mute" : "text-cream"
      }`}>{v}</span>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-2 p-3">
      <div className="text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className="font-display text-2xl leading-tight text-cream">{value}</div>
      <div className="text-[11px] text-dim">{hint}</div>
    </div>
  );
}

/** Gaya kolom isian (tanggal, bulan, tahun) — setinggi tombol segmen. */
const KOLOM = "min-h-[38px] rounded-lg border border-line bg-ink px-2.5 text-[13px] text-cream focus:border-amber focus:outline-none";

/** Label kecil di atas satu kendali. */
function Kendali({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">{label}</div>
      {children}
    </div>
  );
}

/** Tombol segmen: pilihan yang saling meniadakan, digabung dalam satu wadah. */
function Segmen<T extends string>({ pilihan, nilai, ubah }: {
  pilihan: readonly (readonly [T, string])[]; nilai: string; ubah: (x: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-ink p-0.5" role="radiogroup">
      {pilihan.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={nilai === v} onClick={() => ubah(v)}
          className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors ${
            nilai === v ? "bg-amber text-ink shadow-sm" : "text-mute hover:text-cream"
          }`}>{label}</button>
      ))}
    </div>
  );
}

/** Satu angka utama. */
function Ubin({ label, nilai, ket, sorot }: { label: string; nilai: string; ket: string; sorot?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${sorot ? "border-amber/50 bg-amber/10" : "border-line bg-ink-2"}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">{label}</div>
      <div className={`mt-1 truncate font-serif text-xl font-bold tabular-nums ${sorot ? "text-amber" : "text-cream"}`}>{nilai}</div>
      <div className="mt-0.5 truncate text-[11px] text-dim">{ket}</div>
    </div>
  );
}
