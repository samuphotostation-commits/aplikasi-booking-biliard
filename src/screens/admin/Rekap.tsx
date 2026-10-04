import { useState } from "react";
import { motion } from "framer-motion";
import {
  useAdmin, recap, recapRange, periodeRange, recapDates, businessDateOf, settledRefundsOf,
  clampRange, rangeDays, shiftDate, MAX_REKAP_HARI,
  ARCHIVE_ROW_DAYS, type Refund, type RekapPeriode,
} from "../../lib/adminStore";
import { TABLES } from "../../data/venue";
import { fmtDateLong, rupiah } from "../../lib/core";
import { saveTextFile } from "../../lib/saveFile";
import LaporanStok from "./LaporanStok";

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
  const { a, dispatchA, allow, peek } = useAdmin();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);
  const today = businessDateOf(Date.now());
  const dates = recapDates(a);
  const [picked, setPicked] = useState(today);
  const [periode, setPeriode] = useState<RekapPeriode>("hari");
  // Rentang bebas (mode custom): dua kolom tanggal, awalnya 7 hari terakhir.
  const [ct, setCt] = useState({ dari: shiftDate(today, -6), sampai: today });
  const bizDate = dates.includes(picked) ? picked : today;
  const isToday = bizDate === today;
  const r = recap(a, bizDate);
  // Periode: hari (seperti dulu), minggu (Senin–Minggu), bulan berjalan, atau rentang bebas.
  const rentang = periode === "custom" ? clampRange(ct.dari, ct.sampai) : { ...periodeRange(bizDate, periode), dipotong: false };
  const { dari, sampai } = rentang;
  const rp = periode === "hari" ? null : recapRange(a, dari, sampai);
  /** Angka uang yang ditampilkan: sehari, atau jumlah hari-hari dalam periode. */
  const u = rp ? { ...rp.money, counts: rp.counts } : r;
  const dayLabel = periode === "hari"
    ? (isToday ? "hari ini" : fmtDateLong(bizDate))
    : periode === "minggu" ? `minggu ${fmtDateLong(dari)} – ${fmtDateLong(sampai)}`
      : periode === "custom"
        ? (dari === sampai ? fmtDateLong(dari) : `${fmtDateLong(dari)} – ${fmtDateLong(sampai)} (${rangeDays(dari, sampai)} hari)`)
        : `bulan ${new Date(Number(dari.slice(0, 4)), Number(dari.slice(5, 7)) - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`;

  const OPEN_HOURS = 15;
  // Penyebut ikut periode: kalau yang dilihat 30 hari, kapasitasnya juga 30 hari —
  // kalau tidak, utilisasi sebulan terbaca seperti seperempat persen.
  const hariDihitung = rp ? rangeDays(dari, sampai) : 1;
  const kapasitas = TABLES.length * OPEN_HOURS * hariDihitung;
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
    dispatchA({ t: "settleRefund", id: f.id, method });
    const after = peek().refunds.find((x) => x.id === f.id);
    setRefundMsg(after?.settledAt
      ? `${f.guest}: ${rupiah(f.amount)} dicatat sudah dikembalikan (${METHOD_LABEL[method]}).`
      : "Tidak tercatat — hanya superadmin yang bisa menandai dana sudah dikembalikan.");
    setTimeout(() => setRefundMsg(null), 5000);
  }

  async function exportCSV() {
    const waktu = (ts?: number) => (ts ? new Date(ts).toLocaleString("id-ID") : "");
    const rows = [
      ["hari_operasional", "kode", "meja", "status", "sumber", "tamu", "mulai", "selesai", "kanal",
        "nilai_meja", "nilai_fnb", "diskon", "diterima_kasir", "prabayar_online"],
      ...r.done.map((s) => {
        const t = TABLES.find((x) => x.id === s.tableId);
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
    const csv = rows.map((r2) => r2.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const name = `rekap-spl-${bizDate}.csv`;
    const hasil = await saveTextFile(name, csv);
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
    const csv = rows.map((r2) => r2.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const hasil = await saveTextFile(`rekap-spl-${periode}-${dari}.csv`, csv);
    setSaveMsg(hasil === "tersimpan" ? "Rekap periode tersimpan."
      : hasil === "dibatalkan" ? "Penyimpanan dibatalkan." : "Gagal menyimpan berkas.");
    setTimeout(() => setSaveMsg(null), 4000);
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Periode rekap */}
      <div className="grid grid-cols-4 gap-2">
        {([["hari", "Harian"], ["minggu", "Mingguan"], ["bulan", "Bulanan"], ["custom", "Pilih tanggal"]] as const).map(([p, label]) => (
          <button key={p} onClick={() => setPeriode(p)} aria-pressed={periode === p}
            className={`min-h-[40px] rounded-xl border px-1 text-[12px] font-semibold ${
              periode === p ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
            }`}>{label}</button>
        ))}
      </div>

      {/* Rentang bebas: dua kalender + pintasan yang sering dipakai */}
      {periode === "custom" && (
        <section className="rounded-xl border border-line bg-ink-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-dim">Dari tanggal</span>
              <input type="date" value={ct.dari} max={today}
                onChange={(e) => e.target.value && setCt((c) => ({ ...c, dari: e.target.value }))}
                className="min-h-[40px] w-full rounded-lg border border-line bg-ink px-2 text-[13px] text-cream focus:border-amber focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-dim">Sampai tanggal</span>
              <input type="date" value={ct.sampai} max={today}
                onChange={(e) => e.target.value && setCt((c) => ({ ...c, sampai: e.target.value }))}
                className="min-h-[40px] w-full rounded-lg border border-line bg-ink px-2 text-[13px] text-cream focus:border-amber focus:outline-none" />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([
              ["7 hari terakhir", () => ({ dari: shiftDate(today, -6), sampai: today })],
              ["30 hari terakhir", () => ({ dari: shiftDate(today, -29), sampai: today })],
              ["Bulan ini", () => ({ dari: `${today.slice(0, 7)}-01`, sampai: today })],
              ["Bulan lalu", () => {
                const [y, m] = today.split("-").map(Number);
                const p = new Date(y, m - 2, 1);
                const awal = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}-01`;
                const akhir = new Date(p.getFullYear(), p.getMonth() + 1, 0);
                return { dari: awal, sampai: `${akhir.getFullYear()}-${String(akhir.getMonth() + 1).padStart(2, "0")}-${String(akhir.getDate()).padStart(2, "0")}` };
              }],
            ] as const).map(([label, f]) => (
              <button key={label} onClick={() => setCt(f())}
                className="rounded-full border border-line bg-ink px-2.5 py-1 text-[11px] text-mute hover:border-amber hover:text-amber">
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            {rentang.dipotong
              ? `Rentang dipotong ke ${MAX_REKAP_HARI} hari (${fmtDateLong(dari)} – ${fmtDateLong(sampai)}) supaya laporan tetap cepat dibuka.`
              : `Menghitung ${rangeDays(dari, sampai)} hari operasional: ${fmtDateLong(dari)} – ${fmtDateLong(sampai)}. Batas hari tetap jam 02.00.`}
          </p>
        </section>
      )}

      {/* Hari operasional (batas 02.00) */}
      <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink-2 px-3 py-2">
        <span className="text-[11px] uppercase tracking-[0.16em] text-dim">
          {rp ? "Hari untuk jejak audit" : "Hari operasional"}
        </span>
        <select
          value={bizDate}
          onChange={(e) => setPicked(e.target.value)}
          className="min-h-[36px] min-w-0 rounded-lg border border-line bg-ink px-2 text-[13px] text-cream focus:border-amber focus:outline-none"
        >
          {dates.map((d) => (
            <option key={d} value={d}>{d === today ? `Hari ini · ${fmtDateLong(d)}` : fmtDateLong(d)}</option>
          ))}
        </select>
      </label>

      {/* Rincian per hari dalam periode */}
      {rp && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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

      {/* Lima lapisan uang */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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
            <Line k="PBJT 10% — dipungut, bukan pendapatan" v={rupiah(u.tax)} warn />
            <Line k="Potongan MDR gateway" v={`− ${rupiah(u.mdr)}`} warn />
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
          PBJT adalah uang titipan untuk pemerintah daerah — bukan keuntungan.
          MDR QRIS memakai skema berjenjang: transaksi sampai Rp 500.000 bebas biaya
          untuk merchant kategori Usaha Mikro.
        </p>
      </section>

      {/* Pisah dua lini usaha — permintaan pemilik. Margin biliar dan
          smokehouse sangat berbeda; mencampurnya menyembunyikan mana yang
          sebenarnya menghasilkan. */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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
            <span className="text-[13px] text-dim">Total diskon promo diberikan</span>
            <span className="font-serif text-[14px] tabular-nums text-amber">− {rupiah(u.discount)}</span>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Angka ini sebelum potongan pajak dan MDR. Attach rate F&B —
          berapa besar belanja makanan dibanding sewa meja — adalah ukuran
          paling cepat untuk melihat apakah dapur benar-benar dimanfaatkan.
        </p>
      </section>

      {/* Dana pelanggan yang wajib dikembalikan — semua hari, tidak boleh tenggelam */}
      {a.refunds.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
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

      {/* Per kanal — tanpa ini laporan menyesatkan */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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

      {/* Operasional */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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
          Penyebut utilisasi adalah jam-meja tersedia ({TABLES.length} meja × {OPEN_HOURS} jam
          {hariDihitung > 1 ? ` × ${hariDihitung} hari` : ""}), bukan 24 jam. Meja rusak tetap dihitung
          supaya kerugiannya terlihat.
        </p>
      </section>

      {/* Laporan stok 05.00 → 05.00 */}
      <LaporanStok />

      {/* Jejak audit */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Jejak aktivitas
        </h2>
        {a.log.length === 0 ? (
          <div className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
            Belum ada aktivitas.
          </div>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
            {a.log.slice(0, 12).map((l, i) => (
              <div key={i} className="flex items-baseline gap-3 px-3 py-2">
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-dim">
                  {new Date(l.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 flex-1 text-[12px] leading-snug text-mute">{l.what}</span>
                {l.amount ? (
                  <span className="shrink-0 font-serif text-[12px] tabular-nums text-cream">
                    {rupiah(l.amount)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Setiap penutupan tab, perpanjangan, dan perubahan tarif tercatat lengkap dengan
          siapa pelakunya. Ini kontrol utama terhadap kebocoran kas.
        </p>
      </section>

      <div>
        <button
          onClick={() => (rp ? exportPeriodeCSV() : exportCSV())}
          disabled={rp ? rp.money.gross === 0 : (!adaTransaksi || !r.rowsAvailable)}
          className="min-h-[48px] w-full rounded-xl border border-line bg-ink-2 text-sm
            font-semibold text-cream hover:border-amber hover:text-amber disabled:opacity-40"
        >
          Unduh rekap CSV{rp ? " (per hari)" : ""}
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
