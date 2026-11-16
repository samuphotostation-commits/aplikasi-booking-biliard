import { useState } from "react";
import { KonfirmasiBayar } from "./KonfirmasiBayar";
import { catatDibukaDiSini } from "./PemantauPaket";
import { konfirmasi } from "../../lib/dialog";
import { QrisKasir } from "./QrisKasir";
import { LayarCounter } from "./PesanTanpaMeja";
import DaftarTakeaway, { bayarTakeaway } from "./DaftarTakeaway";
import DialogBayar from "./DialogBayar";
import PanelStruk from "./PanelStruk";
import { TableSheet } from "./Board";
import { infoMain } from "./StrukResmi";
import { useCetakPesanan } from "./CetakPesanan";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../../components/UI";
import { shiftDi,
  useAdmin, settlementOf, checkinProblem, restoreProblem, businessDateOf, bookingLapsed, unservedLinesOf, lineValue,
  classOf, sessionType, meterEndOf, splitPaidOf, mesinEdc, mejaDijual, cariMeja, bayarPesanan, sesiBerwaktu,
  type GuestOrder, type State,
} from "../../lib/adminStore";
import { VOID_REASONS } from "../../data/staff";
import { TABLES, CLASS_SHORT, VENUE_LABEL, tableLabel, venueDari } from "../../data/venue";
import { useVenueAktif } from "../../lib/venueAktif";

import { rupiah } from "../../lib/core";
import type { LiveSession } from "../../data/live";
import { Countdown, Elapsed, jam } from "./AdminShell";
import ClashAlert from "./ClashAlert";
import { JudulBagian, Kelompok, KepalaHalaman, TombolAksi, useLayarLebar } from "./Tata";

/** Hasil void dibaca dari data sesudah aksi: berlaku, menunggu superadmin, atau ditolak mesin. */
function voidOutcome(before: State, after: State, what: string, refund: boolean) {
  const req = after.voids.length > before.voids.length ? after.voids[0] : null;
  if (!req) return `${what} tidak bisa di-void — sudah diserahkan, dibayar, atau berubah.`;
  if (req.status === "menunggu") return `Void ${what} diajukan ke superadmin.`;
  return `${what} di-void${refund && req.amount > 0 ? ", dana dicatat untuk dikembalikan" : ""}.`;
}

type TabKasir = "booking" | "meja" | "pesanan";
const KUNCI_TAB = "spl:v1:kasir-tab";

export default function Kasir() {
  const { a, dispatchA, byTable, tick, allow, peek } = useAdmin();
  void tick;
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [voidMsg, setVoidMsg] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [pesanBuka, setPesanBuka] = useState(false);
  /** Pesanan takeaway dan metode yang menunggu konfirmasi kasir. */
  const [lunasi, setLunasi] = useState<{ id: string; ch: "cash" | "edc" | "qris_online"; label: string; mesin?: string } | null>(null);
  const [strukBuka, setStrukBuka] = useState(false);
  /** Tab yang terakhir dibuka di perangkat ini — kasir kembali ke tempat yang sama. */
  const [tab, setTab] = useState<TabKasir>(() => {
    try { const v = localStorage.getItem(KUNCI_TAB); return v === "meja" || v === "pesanan" ? v : "booking"; }
    catch { return "booking"; }
  });
  /** Layar komputer: panel Pesanan tetap di kanan, jadi tab "Pesanan" tidak perlu. */
  const lebar = useLayarLebar(1180);
  const tabPakai: TabKasir = tab;
  /** Meja yang panel bayarnya dibuka dari kolom Billiard. */
  const [bukaMeja, setBukaMeja] = useState<string | null>(null);
  const [bayarHp, setBayarHp] = useState<string | null>(null);
  /** SPL: Check Out pesanan → bill 2 rangkap + CO makanan 2 + CO minuman 2. */
  const { cetak: cetakPesanan, elemen: lembarPesanan } = useCetakPesanan((t) => flash(t));
  const pilihTab = (t: TabKasir) => { setTab(t); try { localStorage.setItem(KUNCI_TAB, t); } catch { /* mode privat */ } };

  const now = Date.now();
  const today = businessDateOf(now);
  /**
   * SEMUA DAFTAR DI LAYAR INI IKUT VENUE YANG SEDANG DIBUKA, sama seperti
   * papan meja. Kasir Smokehouse yang melihat tujuh meja biliar di daftar
   * "sedang jalan" bukan cuma terganggu — ia bisa menutup tab venue sebelah.
   */
  const venue = useVenueAktif();
  const diVenue = (tableId?: string) => !!tableId && venueDari(tableId) === venue;
  const booked = a.sessions.filter((s) => s.status === "booked" && diVenue(s.tableId))
    .sort((x, y) => x.startsAt - y.startsAt);
  // Jadwal habis tanpa pernah bisa check-in (meja masih terpakai): butuh keputusan kasir.
  const lapsed = booked.filter((s) => bookingLapsed(s, now));
  const active = booked.filter((s) => !bookingLapsed(s, now));
  const pending = active.filter((s) => businessDateOf(s.startsAt) === today);
  const later = active.filter((s) => businessDateOf(s.startsAt) > today);
  const holds = a.sessions.filter((s) => s.status === "hold" && diVenue(s.tableId))
    .sort((x, y) => x.startsAt - y.startsAt);
  const lateGuests = a.sessions
    .filter((s) => s.status === "noshow" && diVenue(s.tableId)
      && businessDateOf(s.startsAt) === today && now < s.endsAt)
    .sort((x, y) => x.startsAt - y.startsAt);
  // Pesanan tanpa meja (takeaway/counter) membawa penanda venuenya sendiri.
  const orders = a.orders
    .filter((o) => businessDateOf(o.at) === today
      && (o.tableId ? diVenue(o.tableId) : (o.venue ?? "spl") === venue))
    // F&B: yang belum dibayar di atas, lalu yang terbaru (arahan pemilik).
    .sort((x, y) => Number(!!(x.payment || x.paidOnline >= x.value || x.sessionId || x.status !== "diterima"))
      - Number(!!(y.payment || y.paidOnline >= y.value || y.sessionId || y.status !== "diterima")) || y.at - x.at)
    .slice(0, 30);
  // Dana yang belum dikembalikan, ikut venue lewat kode booking/pesanannya.
  // Yang tidak bisa dipetakan tetap tampil — lebih baik terlihat di dua venue daripada hilang.
  const venueRefund = (kode: string) => {
    const sesi = a.sessions.find((x) => x.bookingCode === kode);
    if (sesi?.tableId) return venueDari(sesi.tableId);
    const o = a.orders.find((x) => x.code === kode);
    return o ? (o.tableId ? venueDari(o.tableId) : o.venue ?? "spl") : null;
  };
  const openRefunds = a.refunds.filter((r) => {
    if (r.settledAt) return false;
    const v = venueRefund(r.bookingCode);
    return v === null || v === venue;
  });

  const running = a.sessions
    .filter((s) => s.status === "running" && diVenue(s.tableId))
    .sort((x, y) => x.endsAt - y.endsAt);

  /*
   * BILLIARD: bill meja hari ini, yang sudah & belum bayar (arahan pemilik).
   * Urutan: belum bayar dulu — yang WAKTUNYA HABIS paling atas (paket habis /
   * open bill berhenti: lampunya mati sendiri dan bill-nya "pindah" ke sini
   * untuk ditagih) — lalu yang terbaru; sesudahnya yang sudah lunas.
   */
  const waktuHabis = (s: LiveSession) => s.status === "running" && (
    (sesiBerwaktu(s) && now >= s.endsAt) || (!sesiBerwaktu(s) && meterEndOf(s, now, a) < now - 60_000));
  const mejaHariIni = a.sessions
    .filter((s) => diVenue(s.tableId) && (s.status === "running"
      || (s.status === "done" && businessDateOf(s.settledAt ?? s.endsAt) === today)))
    .sort((x, y) => {
      const r = (s: LiveSession) => (s.status !== "running" ? 2 : waktuHabis(s) ? 0 : 1);
      return r(x) - r(y) || (r(x) === 2 ? (y.settledAt ?? y.endsAt) - (x.settledAt ?? x.endsAt) : y.startsAt - x.startsAt);
    });
  const kanalLabel = (c?: string) => (c === "cash" ? "Tunai" : c === "edc" ? "EDC" : c === "qris_online" ? "QRIS" : c === "checkout" ? "Checkout" : "online");

  const nameOf = (id?: string) => (id ? cariMeja(id)?.name : undefined) ?? "—";
  const label = (id: string) => {
    const t = cariMeja(id)!;
    const k = classOf(a, id);
    // Lewat `tableLabel`, bukan rumus sendiri: ini salinan KETIGA dari aturan
    // yang sama, dan salinan yang tertinggal menulis "R1" sementara papan dan
    // struk menulis "R01" — satu meja dengan dua nama.
    return { no: tableLabel(k, t.no, t.name), type: CLASS_SHORT[k] };
  };
  // Tab yang masih terbuka dari hari operasional sebelumnya: biasanya karena komputer
  // mati atau kasir lupa menutup. Meterannya sudah berhenti di jam tutup hari itu.
  const tabTertinggal = running.filter((s) => s.source === "walkin" && businessDateOf(s.startsAt) < today);
  // Pesanan HP yang baru masuk (15 menit terakhir) dan belum ada yang diantar.
  const pesananBaru = orders.filter((o) => o.status === "diterima" && now - o.at < 15 * 60_000 &&
    !a.tickets.some((t) => t.sessionId === (o.sessionId ?? o.id) && t.status === "served"));
  // Takeaway (pesan makanan saja, tanpa meja) yang menunggu diambil & dibayar.
  // Ikut venue (perbaikan 14 Nov 2026): dulu takeaway SPL ikut tampil di kasir Smokehouse.
  const takeawayBelumBayar = a.orders.filter((o) => o.status === "diterima" && !o.sessionId &&
    !o.payment && o.paidOnline === 0 && (o.tableId ? diVenue(o.tableId) : (o.venue ?? "spl") === venue));

  const flash = (text: string) => {
    setVoidMsg(text);
    setTimeout(() => setVoidMsg(null), 5000);
  };

  function submit() {
    // Alasan penolakan diambil dari aturan yang sama dengan yang dipakai mesin,
    // dan hasilnya dibaca ulang dari data — layar tidak pernah bilang "berhasil"
    // untuk check-in yang ditolak.
    if (!shiftDi(a, venue, Date.now())) {
      setMsg({ ok: false, text: "Buka shift dulu sebelum melayani tamu." });
      return;
    }
    const problem = checkinProblem(a, code);
    if (problem) {
      setMsg({ ok: false, text: problem });
      return;
    }
    const found = a.sessions.find((s) => s.checkin === code && s.status === "booked")!;
    dispatchA({ t: "checkin", code });
    const after = peek();
    const now2 = after.sessions.find((s) => s.id === found.id);
    if (now2?.status !== "running") {
      setMsg({ ok: false, text: checkinProblem(after, code) ?? "Check-in tidak tercatat — coba lagi." });
      return;
    }
    // Booking paket yang check-in di PC ini: bill-nya keluar otomatis di sini
    // saat waktunya habis (dulu hanya meja yang dibuka dari Papan yang dicatat).
    if (sesiBerwaktu(now2)) catatDibukaDiSini(now2.id);
    setMsg({ ok: true, text: `${found.guest} masuk ke ${nameOf(now2.tableId)}. Timer jalan.` });
    setCode("");
    setTimeout(() => setMsg(null), 4000);
  }

  function voidBooking(s: LiveSession) {
    const before = peek();
    dispatchA({
      t: "requestVoid",
      req: {
        targetKind: "sesi", targetId: s.id,
        label: `Booking ${nameOf(s.tableId)} · ${s.guest}`, amount: s.paidOnline,
        reason: bookingLapsed(s) ? "Meja bermasalah" : "Tamu batal",
      },
    });
    flash(voidOutcome(before, peek(), `Booking ${s.bookingCode ?? s.guest}`, true));
  }

  function restore(s: LiveSession) {
    dispatchA({ t: "restoreNoShow", id: s.id });
    const after = peek().sessions.find((x) => x.id === s.id);
    flash(after?.status === "running"
      ? `${s.guest} dipulihkan dan langsung check-in di ${nameOf(after.tableId)}.`
      : restoreProblem(peek(), s.id) ?? "Booking tidak bisa dipulihkan.");
  }

  function voidOrder(o: GuestOrder, reason: string) {
    const before = peek();
    const what = `${o.mode === "takeaway" ? "Takeaway" : "Pesanan QR"} ${o.code}`;
    dispatchA({
      t: "requestVoid",
      req: {
        targetKind: "pesanan", targetId: o.id,
        label: `${what} · ${o.guest}`, amount: o.value, reason,
      },
    });
    setVoidFor(null);
    flash(voidOutcome(before, peek(), what, o.pay === "online"));
  }

  const shiftIni = shiftDi(a, venue, now);
  const jumlahTab: Record<TabKasir, number> = {
    booking: pending.length + holds.length,
    meja: running.length,
    pesanan: orders.length + takeawayBelumBayar.length,
  };
  const adaTindakan = tabTertinggal.length > 0 || lapsed.length > 0 || lateGuests.length > 0
    || (takeawayBelumBayar.length > 0 && !lebar) || (allow("lihatLaporanKeuangan") && openRefunds.length > 0);

  /*
   * PANEL PESANAN (PDF pemilik 15 Nov 2026): di layar komputer selalu tampil
   * di KANAN — untuk mencocokkan pesanan yang belum dibayar dan cara bayarnya.
   * Tabelnya: keterangan pesanan · qty · status pembayaran · tombol Bayar
   * (aktif hanya kalau masih bisa dibayar di kasir).
   */
  const statusBayar = (o: GuestOrder): { teks: string; nada: string } => {
    if (o.status === "void") return { teks: "dibatalkan (void)", nada: "text-red-300" };
    if (o.status !== "diterima") return { teks: `ditolak: ${o.reason ?? ""}`, nada: "text-red-300" };
    if (o.paidOnline > 0 && o.paidOnline >= o.value) return { teks: "lunas online", nada: "text-emerald-300" };
    const bagian = bayarPesanan(o);
    if (bagian.length) {
      const nama = (c: string) => (c === "cash" ? "tunai" : c === "edc" ? "EDC" : c === "checkout" ? "checkout" : "QRIS");
      return { teks: `lunas · ${bagian.map((p) => nama(p.channel)).join(" + ")}`, nada: "text-emerald-300" };
    }
    if (o.sessionId) return { teks: `ditagih di meja ${nameOf(o.tableId)}`, nada: "text-sky-300" };
    return { teks: o.menungguBayar ? "belum dibayar · tahan checker" : "belum dibayar", nada: "text-amber" };
  };
  const bisaDibayar = (o: GuestOrder) => o.status === "diterima" && !o.sessionId && !o.payment && o.value - o.paidOnline > 0;

  const panelPesanan = (
    <div className="space-y-5">
      <DaftarTakeaway venue={venue} onKabar={flash} />

      <section>
        <JudulBagian judul="Pesanan dari HP & counter" jumlah={orders.length}
          aksi={pesananBaru.length > 0 && <span className="rounded-full bg-amber px-2 py-0.5 text-[10px] font-bold text-ink">{pesananBaru.length} baru</span>} />
        {orders.length === 0 ? (
          <Empty text="Belum ada pesanan dari QR meja atau takeaway hari ini." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-ink-2">
            <div className="grid grid-cols-[minmax(0,1fr)_36px_minmax(0,0.9fr)_84px] gap-2 border-b border-line bg-ink px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-dim">
              <span>Keterangan pesanan</span><span className="text-center">Qty</span><span>Status pembayaran</span><span className="text-right">Bayar</span>
            </div>
            <div className="divide-y divide-line">
              {orders.map((o) => {
                const open = o.status === "diterima" ? unservedLinesOf(a, o) : [];
                const tabJalan = !o.sessionId || a.sessions.find((x) => x.id === o.sessionId)?.status === "running";
                const bisaVoid = open.length > 0 && tabJalan && allow("ajukanVoid");
                const baru = pesananBaru.some((x) => x.id === o.id);
                const st = statusBayar(o);
                const aktif = bisaDibayar(o) && allow("tutupTab");
                return (
                  <div key={o.id} className={baru ? "bg-amber/8" : ""}>
                    <div className="grid grid-cols-[minmax(0,1fr)_36px_minmax(0,0.9fr)_84px] items-center gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] text-cream">
                          {baru && <span className="mr-1 rounded bg-amber px-1 text-[9px] font-bold text-ink">BARU</span>}
                          {o.mode === "takeaway" ? "Takeaway" : `QR ${nameOf(o.tableId)}`} · {o.guest}
                        </div>
                        <div className="truncate text-[10px] text-dim">
                          {jam(o.at)} · <span className="font-mono">{o.code}</span> · {rupiah(o.status === "diterima" ? o.value : o.paidOnline)}
                          {bisaVoid && voidFor !== o.id && (
                            <button onClick={() => setVoidFor(o.id)} className="ml-1.5 text-red-300 underline underline-offset-2">void</button>
                          )}
                        </div>
                      </div>
                      <span className="text-center font-serif text-[13px] tabular-nums text-cream">{o.lines.reduce((n, l) => n + l.qty, 0)}</span>
                      <span className={`text-[11px] font-semibold leading-tight ${st.nada}`}>{st.teks}</span>
                      <button disabled={!aktif} onClick={() => setBayarHp(bayarHp === o.id ? null : o.id)}
                        className={`min-h-[34px] rounded-lg text-[12px] font-bold ${aktif
                          ? "bg-amber text-ink hover:bg-amber-deep" : "border border-line text-dim opacity-60"}`}>
                        {aktif ? (bayarHp === o.id ? "Tutup" : "Bayar") : bayarPesanan(o).length || o.paidOnline >= o.value && o.value > 0 ? "Lunas" : "—"}
                      </button>
                    </div>
                    {aktif && bayarHp === o.id && (
                      <div className="px-3 pb-3">
                        <DialogBayar total={o.value - o.paidOnline} kode={o.code} ringkas={`Pesanan ${o.code}`} hanyaCheckout={venue === "spl"}
                          onBatal={() => setBayarHp(null)}
                          onSelesai={(bagian) => {
                            const galat = bayarTakeaway(dispatchA, peek, o.id, bagian);
                            if (!galat) {
                              setBayarHp(null); flash(`${o.code} lunas ${rupiah(o.value)}${bagian.length > 1 ? ` · split ${bagian.length}×` : ""}.`);
                              if (venue === "spl") void cetakPesanan(o.id);
                            }
                            return galat;
                          }} />
                      </div>
                    )}
                    {bisaVoid && voidFor === o.id && (
                      <div className="mx-3 mb-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2">
                        <div className="text-[11px] text-red-200/90">
                          Void {open.length === o.lines.length ? "seluruh pesanan" : `${open.length} baris yang belum diserahkan`}
                          {" "}({rupiah(open.reduce((n, l) => n + lineValue(l), 0))})
                          {o.pay === "online" ? " — dana dicatat untuk dikembalikan." : " — tagihan di bill ikut berkurang."}
                          {" "}Pilih alasan:
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {VOID_REASONS.map((r) => (
                            <button key={r} onClick={() => voidOrder(o, r)}
                              className="min-h-[34px] rounded-lg border border-line bg-ink px-2.5 text-[12px] text-cream">{r}</button>
                          ))}
                          <button onClick={() => setVoidFor(null)} className="min-h-[34px] px-2 text-[12px] text-dim">Batal</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
          Tombol Bayar aktif hanya untuk pesanan tanpa meja yang belum dibayar; pesanan QR meja ditagih saat
          tab mejanya ditutup. Bayar bisa split: beberapa pembayaran dengan metode berbeda.
        </p>
      </section>
    </div>
  );

  return (
    <div className="min-w-0 space-y-5 pb-6">
      <ClashAlert />

      {/* ── KEPALA KASIR (susunan ulang 14 Nov 2026): venue, shift, aksi ── */}
      <KepalaHalaman judul="Kasir" venue={venue}
        ket={shiftIni
          ? <>Shift <span className="text-cream">{shiftIni.employeeName}</span> sejak {jam(shiftIni.openedAt)} ·
            check-in tamu, meja yang jalan, dan pesanan.</>
          : <span className="text-red-300">Shift {VENUE_LABEL[venue]} belum buka — buka di menu Shift sebelum melayani tamu.</span>}
        aksi={allow("tutupTab") && (<>
          <TombolAksi utama onClick={() => { setPesanBuka(!pesanBuka); setStrukBuka(false); }}>
            {pesanBuka ? "Tutup pesan tanpa meja" : "+ Pesan tanpa meja"}
          </TombolAksi>
          <TombolAksi onClick={() => { setStrukBuka(!strukBuka); setPesanBuka(false); }}>
            {strukBuka ? "Tutup struk" : "Struk lama · cetak ulang"}
          </TombolAksi>
        </>)}
        angka={[
          { label: "Booking hari ini", nilai: pending.length, nada: pending.length ? "amber" : undefined },
          { label: venue === "smh" ? "Meja terisi" : "Sedang main", nilai: running.length },
          { label: "Pesanan HP", nilai: pesananBaru.length ? `${orders.length} · ${pesananBaru.length} baru` : orders.length,
            nada: pesananBaru.length ? "amber" : undefined },
          { label: "Meja kosong", nilai: mejaDijual(a).filter((t) => diVenue(t.id) && !byTable.get(t.id)).length, nada: "hijau" },
        ]} />

      {/* ── Counter: pesan tanpa meja, layar hampir penuh (panduan pemilik 15 Nov 2026) ── */}
      <AnimatePresence>
        {allow("tutupTab") && pesanBuka && (
          <LayarCounter onTutup={() => setPesanBuka(false)} onDone={(kode) => {
            setPesanBuka(false);
            if (kode) { flash(`Pesanan ${kode} dibuat — tagih di tab Pesanan.`); pilihTab("pesanan"); }
          }} />
        )}
      </AnimatePresence>

      {/* ── Panel struk: lihat & cetak ulang yang sudah lewat ────── */}
      {allow("tutupTab") && strukBuka && <PanelStruk onTutup={() => setStrukBuka(false)} />}

      {voidMsg && (
        <p role="status" className="rounded-xl border border-amber/40 bg-amber/8 px-3 py-2 text-[12px] text-amber">
          {voidMsg}
        </p>
      )}

      {/* ── PERLU TINDAKAN: hanya muncul kalau ada yang harus diurus ── */}
      {adaTindakan && (
        <Kelompok judul="Perlu tindakan" ket="Urus ini lebih dulu." nada="merah">
      {takeawayBelumBayar.length > 0 && !lebar && (
        <button onClick={() => pilihTab("pesanan")}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-left">
          <span className="text-[13px] text-amber">
            {takeawayBelumBayar.length} takeaway menunggu diambil &amp; dibayar ·{" "}
            {rupiah(takeawayBelumBayar.reduce((n, o) => n + o.value, 0))}
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-amber">Buka tab Pesanan →</span>
        </button>
      )}
      {/* ── Tab yang tertinggal terbuka dari hari sebelumnya ── */}
      {tabTertinggal.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:content-[''] text-red-300 before:bg-red-400">
            Tab belum ditutup dari hari sebelumnya · {tabTertinggal.length}
          </h2>
          <div className="space-y-2">
            {tabTertinggal.map((s) => (
              <div key={s.id} className="rounded-xl border border-red-500/40 bg-red-500/8 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-cream">{nameOf(s.tableId)} · {s.guest}</span>
                  <span className="shrink-0 text-[11px] text-dim">
                    dibuka {new Date(s.startsAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} {jam(s.startsAt)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-red-200/90">
                  Meterannya sudah berhenti otomatis pukul {jam(meterEndOf(s, now, a))} (06.00, tidak ada shift yang buka), jadi tamu tidak
                  ditagih semalaman. Tagihan sekarang {rupiah(settlementOf(s, a).due)} — tutup tabnya di tab Papan,
                  atau minta superadmin mengoreksi jam berhentinya kalau tamu memang pulang lebih awal.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Booking yang jadwalnya habis tanpa bisa masuk ── */}
      {lapsed.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:content-[''] text-red-300 before:bg-red-400">
            Perlu keputusan · {lapsed.length}
          </h2>
          <div className="space-y-2">
            {lapsed.map((s) => (
              <div key={s.id} className="rounded-xl border border-red-500/40 bg-red-500/8 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-cream">{nameOf(s.tableId)} · {s.guest}</span>
                  <span className="shrink-0 text-[11px] text-dim">
                    {new Date(s.startsAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} {jam(s.startsAt)}–{jam(s.endsAt)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-red-200/90">
                  Jadwalnya habis sementara meja masih terpakai, jadi tamu tidak pernah bisa check-in.
                  Ini bukan no-show: {rupiah(s.paidOnline)} belum diakui sebagai pendapatan.
                </p>
                <button
                  onClick={() => voidBooking(s)}
                  className="mt-2 min-h-[40px] rounded-lg border border-red-500/50 px-3 text-[12px] font-semibold text-red-200">
                  {allow("setujuiVoid") ? "Void & catat refund" : "Ajukan void & refund"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tamu yang terlanjur dilepas tapi datang ──────── */}
      {lateGuests.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
            Dilepas (tidak datang) · {lateGuests.length}
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
            {lateGuests.map((s) => {
              const problem = restoreProblem(a, s.id);
              const bisa = !problem && !!shiftDi(a, venue, Date.now()) && allow("bukaMeja");
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-cream">{nameOf(s.tableId)} · {s.guest}</div>
                    <div className="text-[11px] text-dim">
                      {jam(s.startsAt)}–{jam(s.endsAt)} · kode {s.checkin}
                      {problem && <span className="text-red-300"> · {problem}</span>}
                      {!problem && !shiftDi(a, venue, Date.now()) && <span className="text-amber"> · buka shift dulu</span>}
                    </div>
                  </div>
                  <button
                    disabled={!bisa}
                    onClick={() => restore(s)}
                    className="min-h-[40px] shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3
                      text-[12px] font-semibold text-emerald-300 disabled:opacity-35">
                    Pulihkan &amp; check-in
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
            Untuk tamu yang ternyata datang setelah dilepas otomatis — hanya bisa selama jadwalnya belum
            habis dan mejanya belum dipakai orang lain.
          </p>
        </section>
      )}

      {allow("lihatLaporanKeuangan") && openRefunds.length > 0 && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/8 px-3 py-2 text-[12px] text-red-300">
          {openRefunds.length} dana pelanggan ({rupiah(openRefunds.reduce((n, r) => n + r.amount, 0))}) belum
          dikembalikan — tandai selesai di Rekap setelah ditransfer.
        </p>
      )}

        </Kelompok>
      )}

      {/* ── Check-in ─────────────────────────────────────── */}
      <section>
        <JudulBagian judul="Check-in tamu" aksi={<span className="text-[11px] text-dim">ketik 6 digit kode dari tamu, lalu Enter</span>} />
        <div className="rounded-2xl border border-line bg-ink-2 p-4">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && submit()}
              inputMode="numeric"
              placeholder="6 digit"
              aria-label="Kode check-in"
              className="min-w-0 flex-1 rounded-xl border border-line bg-ink px-4 py-3
                text-center font-display text-2xl tracking-[0.3em] text-cream
                placeholder:font-sans placeholder:text-base placeholder:tracking-normal
                placeholder:text-dim focus:border-amber focus:outline-none"
            />
            <Button disabled={code.length !== 6} onClick={submit}>Masuk</Button>
          </div>
          <AnimatePresence>
            {msg && (
              <motion.p
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`mt-2 text-[13px] ${msg.ok ? "text-emerald-400" : "text-red-400"}`}
              >{msg.text}</motion.p>
            )}
          </AnimatePresence>
        </div>
      </section>


      {/* ── TIGA PANEL (arahan pemilik, PDF 15 Nov 2026): KASIR hanya berisi
          BOOKING | BILLIARD | F&B — tempat pembayaran untuk yang belum bayar di
          awal. Layar komputer: tiga kolom berdampingan. Layar sempit: tab. ── */}
      {!lebar && (
      <div className="sticky top-[104px] z-20 -mx-4 border-b border-line bg-ink/95 px-4 py-2 backdrop-blur-md">
        <div className="flex gap-1 rounded-xl border border-line bg-ink p-1" role="tablist" aria-label="Bagian kasir">
          {([
            ["booking", "Booking"],
            ["meja", venue === "smh" ? "Meja" : "Billiard"],
            ["pesanan", "F&B"],
          ] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tabPakai === k} onClick={() => pilihTab(k)}
              className={`flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold ${
                tabPakai === k ? "bg-amber text-ink" : "text-mute hover:text-cream"
              }`}>
              {l}
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                tabPakai === k ? "bg-ink/20"
                  : k === "pesanan" && (pesananBaru.length || takeawayBelumBayar.length) ? "bg-amber text-ink" : "bg-ink-2"
              }`}>{jumlahTab[k]}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      <div className={lebar ? "grid items-start gap-4 lg:grid-cols-3" : ""}>
      {(lebar || tabPakai === "booking") && (
        <KolomKasir judul="Booking" jumlah={pending.length + holds.length} warna="booking" lebar={lebar}>
          <div className="min-w-0 space-y-6">
      {/* ── Akan datang (hari operasional ini) ───────────── */}
      <section>
        <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Booking hari ini · {pending.length}
        </h2>
        {pending.length === 0 ? (
          <Empty text="Belum ada booking yang menunggu hari ini." />
        ) : (
          <div className="space-y-2">
            {pending.map((s) => {
              const t = label(s.tableId);
              const mins = Math.round((s.startsAt - now) / 60000);
              const soon = mins <= 15;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    soon ? "border-amber/60 bg-amber/8" : "border-line bg-ink-2"
                  }`}
                >
                  <div className="w-12 shrink-0 text-center">
                    <div className="font-display text-lg leading-none text-cream">{t.no}</div>
                    <div className="text-[9px] uppercase text-dim">{t.type}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-cream">
                      {s.guest}
                      {sessionType(s) === "resto" && (
                        <span className="ml-2 rounded-full bg-felt/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                          resto{s.pax ? ` · ${s.pax} org` : ""}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-dim">
                      {s.bookingCode} · kode <span className="text-mute">{s.checkin}</span>
                      {s.fnb.length > 0 && ` · pra-order ${s.fnb.reduce((n, l) => n + l.qty, 0)} porsi`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[13px] font-semibold ${soon ? "text-amber" : "text-cream"}`}>
                      {mins <= 0 ? "sekarang" : mins < 90 ? `${mins}m lagi` : jam(s.startsAt)}
                    </div>
                    <div className="text-[11px] text-dim">
                      {sessionType(s) === "resto" ? "reservasi meja" : `${rupiah(s.paidOnline)} lunas`}
                    </div>
                    {allow("ajukanVoid") && (
                      <button
                        onClick={async () => {
                          if (!(await konfirmasi(`Batalkan ${sessionType(s) === "resto" ? "reservasi" : "booking"} ${s.guest}?` +
                            (s.paidOnline > 0 ? `

${rupiah(s.paidOnline)} yang sudah dibayar akan dicatat untuk dikembalikan.` : ""), "Ya, batalkan"))) return;
                          voidBooking(s);
                        }}
                        className="mt-0.5 min-h-[30px] text-[11px] text-red-300 underline underline-offset-2">
                        batalkan
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {later.length > 0 && (
          <details className="mt-2 rounded-xl border border-line bg-ink-2 px-3 py-2">
            <summary className="cursor-pointer text-[12px] text-mute">Booking hari lain · {later.length}</summary>
            <div className="mt-1 divide-y divide-line">
              {later.map((s) => (
                <div key={s.id} className="flex justify-between gap-2 py-1.5 text-[12px]">
                  <span className="truncate text-cream">{nameOf(s.tableId)} · {s.guest}</span>
                  <span className="shrink-0 text-dim">
                    {new Date(s.startsAt).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })} {jam(s.startsAt)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

          </div>
          <div className="min-w-0 space-y-6">
      {/* ── Pembayaran QRIS yang sedang berjalan ─────────── */}
      {holds.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
            Sedang membayar QRIS · {holds.length}
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-dashed border-amber/40 bg-amber/5">
            {holds.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]">
                <span className="truncate text-cream">{nameOf(s.tableId)} · {s.guest} · {jam(s.startsAt)}</span>
                <span className="shrink-0 text-dim">dilepas {s.holdUntil ? jam(s.holdUntil) : "—"}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-dim">
            Slot ini ditahan untuk tamu yang sedang scan QR — tidak bisa dipakai walk-in.
          </p>
        </section>
      )}

      <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-[11px] leading-relaxed text-dim">
        Booking yang sudah dibayar online masuk ke sini. Tamu datang → minta kode 6 digit → ketik di kotak check-in di atas.
        Tamu yang datang terlambat setelah dilepas muncul di "Perlu tindakan".
      </p>
          </div>
        </KolomKasir>
      )}

      {(lebar || tabPakai === "meja") && (
        <KolomKasir judul={venue === "smh" ? "Meja" : "Billiard"} jumlah={mejaHariIni.filter((x) => x.status === "running").length}
          warna="billiard" lebar={lebar}>
          {mejaHariIni.length === 0 ? (
            <Empty text={venue === "smh" ? "Belum ada bill meja hari ini." : "Belum ada bill meja biliar hari ini."} />
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
              {mejaHariIni.map((s) => {
                // Tagihan paket yang waktunya habis tetap disebut dengan meja aslinya.
                const t = label(s.mejaAsal ?? s.tableId);
                const tab = !!cariMeja(s.tableId)?.tanpaMeja && !s.mejaAsal;
                const jalan = s.status === "running";
                const habis = waktuHabis(s);
                const info = infoMain(a, s, venue, !!cariMeja(s.tableId)?.tanpaMeja, now);
                const nilai = jalan ? settlementOf(s, a).dueTampil
                  : s.settledAmount ?? (s.settledBilliard ?? 0) + (s.settledFnb ?? 0) - (s.settledDiscount ?? 0);
                return (
                  <div key={s.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${habis ? "bg-red-500/10" : ""}`}>
                    <div className="w-11 shrink-0 text-center">
                      <div className="font-display text-lg leading-none text-cream">
                        {tab ? "—" : t.no}
                      </div>
                      <div className="text-[9px] uppercase text-dim">{tab ? "tab" : t.type}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-cream">{s.guest}</div>
                      <div className="truncate text-[11px] text-dim">
                        {info.jenis === "billiard" ? info.paket : "F&B"} · {jam(s.startsAt)}{sesiBerwaktu(s) ? `–${jam(s.endsAt)}` : ""}
                        {jalan && (s.source === "walkin" && !s.blockHours
                          ? <> · <Elapsed since={s.startsAt} /></> : !habis && <> · sisa <Countdown endsAt={s.endsAt} /></>)}
                      </div>
                      <div className={`text-[11px] font-semibold ${habis && nilai > 0 ? "text-red-300" : jalan && nilai > 0 ? "text-sky-300" : "text-emerald-300"}`}>
                        {!jalan ? `Lunas · ${kanalLabel(s.settledChannel)}`
                          : nilai <= 0 ? (habis ? "Lunas online · waktu habis, tutup meja" : "Lunas online · sedang main")
                            : habis ? "Waktu habis · tagih sekarang" : "Belum bayar"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-serif text-[13px] tabular-nums ${jalan ? "text-amber" : "text-mute"}`}>{rupiah(nilai)}</div>
                      <button disabled={!jalan || !allow("tutupTab")} onClick={() => setBukaMeja(s.tableId)}
                        className={`mt-1 min-h-[32px] w-[72px] rounded-lg text-[12px] font-bold ${jalan && allow("tutupTab")
                          ? habis ? "bg-red-500 text-white hover:bg-red-400" : "bg-amber text-ink hover:bg-amber-deep"
                          : "border border-line text-dim opacity-60"}`}>
                        {!jalan ? "Lunas" : nilai <= 0 ? "Tutup" : "Bayar"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
            Urutan: belum bayar di atas (waktu habis paling atas, lalu yang terbaru), lalu yang sudah lunas.
            Paket yang habis / open bill yang berhenti otomatis pindah ke atas daftar ini — lampunya mati sendiri.
          </p>
        </KolomKasir>
      )}

      {(lebar || tabPakai === "pesanan") && (
        <KolomKasir judul="F&B" jumlah={orders.length} warna="fnb" lebar={lebar}>{panelPesanan}</KolomKasir>
      )}
      </div>

      {lembarPesanan}
      <AnimatePresence>
        {bukaMeja && cariMeja(bukaMeja) && (
          <TableSheet table={cariMeja(bukaMeja)!} session={byTable.get(bukaMeja)} onClose={() => setBukaMeja(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Satu kolom kasir dengan kepala berwarna (Booking merah, Billiard biru, F&B kuning). */
function KolomKasir({ judul, jumlah, warna, lebar, children }: {
  judul: string; jumlah: number; warna: "booking" | "billiard" | "fnb"; lebar: boolean; children: React.ReactNode;
}) {
  const kepala = warna === "booking" ? "bg-[#8e3b3b] text-white" : warna === "billiard" ? "bg-sky-600 text-white" : "bg-amber text-ink";
  return (
    <section className={`min-w-0 overflow-hidden rounded-2xl border border-line bg-ink-2/40 ${lebar ? "" : "mt-3"}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 ${kepala}`}>
        <span className="font-display text-xl uppercase tracking-wide">{judul}</span>
        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[12px] font-bold tabular-nums">{jumlah}</span>
      </div>
      <div className="space-y-4 p-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
      {text}
    </div>
  );
}
