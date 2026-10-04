import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card, PageHeader } from "../components/UI";
import { Ball, CueProgress, RackLoader } from "../components/motion/Billiard";
import { useStore, intentOf, pendingOutcome, pendingRecord, type Pending } from "../lib/store";
import {
  useAdmin, cartProblem, lineValue, slotProblem,
  GATEWAY_EXPIRY_MIN, HOLD_GRACE_MIN, HOLD_MIN,
} from "../lib/adminStore";
import { slotStart } from "../lib/occupancy";
import { VENUE } from "../data/venue";
import type { LiveSession } from "../data/live";

/** Build HP pelanggan: pembayaran online belum ada — bayar di kasir. */
const MODE_TAMU = !!import.meta.env.VITE_MODE_TAMU;
import { bookingCode, checkinCode, rupiah } from "../lib/core";
import { catatKode } from "../lib/customerStore";
import { buatQris, statusQris, type QrisTagihan } from "../lib/qris";
import { QrGambar } from "../components/QrGambar";

/* Halaman pembayaran QRIS.
   Ini SIMULASI — Midtrans belum tersambung karena butuh merchant &
   akun Supabase baru (PRD KK-23). Alurnya sudah persis alur asli:
   1. Halaman dibuka  → slot DITAHAN & harga dibekukan (hold, PRD KK-04).
   2. Tamu membayar   → "notifikasi pembayaran" diverifikasi ulang oleh mesin.
   3. Hasilnya dibaca dari data venue — layar tidak pernah menganggap lunas
      sebelum mesin menerimanya. Tombol "Saya sudah bayar" menggantikan
      webhook; saat backend siap, cukup tombol itu yang diganti. */

type Phase = "creating" | "waiting" | "checking" | "paid" | "rejected" | "expired" | "gagal";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Berapa sering status pembayaran ditanyakan ke server. */
const JEDA_CEK_MS = 4_000;

export default function Payment() {
  const nav = useNavigate();
  const { state, dispatch, totals } = useStore();
  const { a: venue, dispatchA } = useAdmin();
  const loc = useLocation() as { state?: { nama?: string; hp?: string } };
  const nama = loc.state?.nama?.trim() ?? "";
  const hp = loc.state?.hp || undefined;

  // Satu niat pembayaran = satu kode. Isi pesanan dibekukan saat halaman dibuka
  // (keranjang dikosongkan begitu pesanan diterima) dan disimpan di HP: muat ulang
  // atau kembali ke halaman ini memakai kode & hold yang SAMA — bukan hold kedua
  // yang mengunci slot milik tamu itu sendiri selama 19 menit.
  const snap = useRef<Pending | null>(null);
  const replaced = useRef<Pending | null>(null);
  if (!snap.current) {
    const p = state.pending;
    const intent = intentOf(state.draft, state.cart, totals.booking);
    if (p && p.intent === intent && Date.now() - p.at < (HOLD_MIN + HOLD_GRACE_MIN) * 60_000) {
      snap.current = p;
    } else {
      const c = bookingCode();
      snap.current = {
        code: c, checkin: checkinCode(), refId: `${totals.booking ? "o" : "g"}-${c}`, at: Date.now(),
        booking: totals.booking, draft: state.draft, cart: state.cart, grand: totals.grand, intent,
      };
      replaced.current = p;
    }
  }
  const { code, checkin, draft, cart, booking, refId } = snap.current;
  const orderId = `${code}-1`;                         // PRD PAY-04: SPL-{kode}-{percobaan}

  // Niat lama yang digantikan: kalau ternyata sudah dibayar, catat ke riwayat;
  // kalau masih berupa hold, lepaskan slotnya.
  useEffect(() => {
    const old = replaced.current;
    if (old) {
      const out = pendingOutcome(old, venue);
      if (out.kind !== "terbuka") dispatch({ t: "record", booking: pendingRecord(old, out.total) });
      else if (old.booking) dispatchA({ t: "releaseHold", id: old.refId });
    }
    if (state.pending?.refId !== refId) dispatch({ t: "setPending", pending: snap.current });
    // Daftarkan kodenya supaya HP ini boleh menanyakan status booking-nya sendiri
    // ke server (guest_status). Tanpa ini layar tidak pernah tahu bookingnya jadi,
    // dan halaman bayar menggantung walau uangnya sudah masuk. Dipanggil juga saat
    // halaman dimuat ulang, jadi niat lama yang belum terdaftar ikut pulih.
    catatKode(code);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = useMemo<LiveSession | null>(() => {
    if (!booking) return null;
    const startsAt = slotStart(draft.dateISO, draft.startHour!);
    return {
      id: refId, tableId: draft.tableId!, source: "online", guest: nama || "Pelanggan", phone: hp,
      startsAt, endsAt: startsAt + draft.hours * 3_600_000, status: "hold", bookingCode: code,
      fnb: cart, tableAmount: 0, paidOnline: 0,
      ...(draft.paketSiang ? { paket: "siang" as const } : {}),
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [phase, setPhase] = useState<Phase>("creating");
  const [why, setWhy] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [now, setNow] = useState(Date.now());
  /** QRIS sungguhan dari gateway (kalau secret key-nya sudah dipasang pemilik). */
  const [tagihan, setTagihan] = useState<QrisTagihan | null>(null);
  const [qrisGagal, setQrisGagal] = useState<string | null>(null);
  const qrisDiminta = useRef(false);
  const holdSent = useRef(false);
  const paidAmount = useRef(0);
  const paying = useRef(false);

  const hold = booking ? venue.sessions.find((x) => x.id === refId) : undefined;
  const heldAmount = hold?.status === "hold"
    ? hold.tableAmount + (hold.holdLines ?? []).reduce((n, l) => n + lineValue(l), 0)
    : null;
  const amount = booking ? (heldAmount ?? (paidAmount.current || snap.current.grand)) : snap.current.grand;

  // Tidak ada yang dibayar → kembali.
  useEffect(() => {
    if (!booking && (cart.length === 0 || snap.current!.grand <= 0)) nav("/checkout", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Kembali ke kode yang pembayarannya sudah terkirim (mis. halaman dimuat ulang saat
  // "mengecek"): langsung baca hasilnya, jangan menahan slot atau menagih lagi.
  const alreadySent = pendingOutcome(snap.current, venue).kind !== "terbuka";

  // Tahan slot sekali saja (StrictMode menjalankan efek dua kali saat dev). Hold
  // bersifat idempoten per kode, jadi memakai ulang kode yang sama aman.
  useEffect(() => {
    if (!payload || holdSent.current || alreadySent) return;
    holdSent.current = true;
    dispatchA({ t: "hold", session: payload });
  }, [payload, dispatchA]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Membuat kode QRIS"
  useEffect(() => {
    const t = setTimeout(() => setCreated(true), 1100);
    return () => clearTimeout(t);
  }, []);

  const problemNow = () =>
    (payload && (slotProblem(venue, {
      tableId: payload.tableId, startsAt: payload.startsAt, hours: draft.hours, paket: draft.paketSiang,
    }, Date.now(), true) ?? cartProblem(venue, cart))) || "slot baru saja diambil orang lain";

  useEffect(() => {
    if (phase === "creating" && created) {
      if (pendingOutcome(snap.current!, venue).kind !== "terbuka") {
        paidAmount.current = booking ? (hold?.paidOnline ?? 0) : snap.current!.grand;
        setSubmitted(true);
        setPhase("checking");
      } else if (!booking || hold?.status === "hold") setPhase("waiting");
      else { setWhy(problemNow()); setPhase("gagal"); }
    }
    // Hold lenyap sebelum dibayar (mis. kalah urutan dengan tab lain).
    //
    // TAPI kalau kode QR sudah terbit, layar TIDAK BOLEH memvonis gagal sendiri:
    // tamu bisa saja sudah membayar, dan yang menentukan cuma server. Salah
    // vonis di sini pernah bikin tamu dibilang "slot diambil orang lain"
    // padahal uangnya sudah masuk dan mejanya tercatat.
    if (phase === "waiting" && booking && !hold && !tagihan) {
      setWhy("slot diambil orang lain sebelum pembayaran masuk");
      setPhase("gagal");
    }
  }, [phase, created, hold, tagihan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hitung mundur QR: 15 menit sejak hold dibuat (hold di mesin sendiri 17 + 2 menit).
  const qrEndsAt = hold?.holdUntil
    ? hold.holdUntil - (HOLD_MIN + HOLD_GRACE_MIN - GATEWAY_EXPIRY_MIN) * 60_000
    : snap.current.at + VENUE.holdMinutes * 60_000;
  const total = GATEWAY_EXPIRY_MIN * 60;
  const left = Math.max(0, Math.round((qrEndsAt - now) / 1000));

  useEffect(() => {
    if (phase !== "waiting" && phase !== "checking") return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase === "waiting" && left <= 0) {
      if (booking) dispatchA({ t: "releaseHold", id: refId });
      dispatch({ t: "setPending", pending: null });
      setPhase("expired");
    }
  }, [phase, left]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Aksi venue yang akan dirilis server begitu pembayaran benar-benar masuk. */
  const aksiPembayaran = () => payload
    ? { t: "confirmOnline", session: { ...payload, status: "booked", checkin, paidOnline: amount } }
    : {
        t: "guestOrder",
        order: {
          id: refId, code, guest: nama || "Tamu", phone: hp, mode: draft.fnbMode,
          tableId: draft.fnbMode === "meja" ? draft.fnbTable ?? undefined : undefined,
          sessionId: draft.fnbMode === "meja"
            ? (draft.fnbSessionId && !draft.fnbSessionId.startsWith("pub-") ? draft.fnbSessionId : undefined)
            : undefined,
          pay: "online", lines: cart, paidOnline: amount,
        },
      };

  // Minta QR sungguhan sekali saja, begitu tagihannya pasti (hold sudah jadi).
  useEffect(() => {
    if (phase !== "waiting" || qrisDiminta.current || amount <= 0) return;
    qrisDiminta.current = true;
    void buatQris({
      kode: code, amount, act: aksiPembayaran(),
      ringkas: booking ? `Booking meja SPL ${code}` : `Pesanan Smokehouse ${code}`,
    }).then((h) => {
      if (h.ok) setTagihan(h.tagihan);
      else if (!("belumAktif" in h)) setQrisGagal(h.alasan);
    });
  }, [phase, amount]); // eslint-disable-line react-hooks/exhaustive-deps

  const accepted = () => {
    dispatch({
      t: "confirm",
      booking: {
        kind: booking ? "booking" : "pesanan", code, refId, checkin: booking ? checkin : undefined,
        draft, lines: cart, total: paidAmount.current || amount, createdAt: Date.now(),
      },
    });
    setPhase("paid");
    setTimeout(() => nav("/sukses", { replace: true, state: { refId } }), 1300);
  };

  const [checkingManual, setCheckingManual] = useState(false);
  const periksaManual = async () => {
    if (!tagihan || checkingManual) return;
    setCheckingManual(true);
    try {
      const st = await statusQris(tagihan.ref, true);
      if (st === "lunas") {
        paidAmount.current = amount;
        setSubmitted(true);
        accepted();
      } else if (st === "gagal" || st === "kedaluwarsa") {
        setQrisGagal("Pembayaran tidak selesai. Coba lagi atau bayar di kasir.");
      } else {
        setQrisGagal("Pembayaran belum terdeteksi. Pastikan transfer berhasil di aplikasi bank/e-wallet.");
        setTimeout(() => setQrisGagal(null), 4000);
      }
    } finally {
      setCheckingManual(false);
    }
  };

  // Tanya server sampai lunas. Yang menentukan lunas adalah GATEWAY, bukan tombol di HP.
  // Jalan juga saat "mengecek": kalau data venue belum sempat menyusul, jawaban
  // gateway-lah yang mengeluarkan layar dari keadaan menggantung.
  useEffect(() => {
    if (!tagihan || (phase !== "waiting" && phase !== "checking")) return;
    const iv = setInterval(async () => {
      const st = await statusQris(tagihan.ref);
      if (st === "lunas") {
        paidAmount.current = amount;
        setSubmitted(true);
        accepted();
      } else if (st === "gagal" || st === "kedaluwarsa") {
        setQrisGagal("Pembayaran tidak selesai. Coba lagi atau bayar di kasir.");
      }
    }, JEDA_CEK_MS);
    return () => clearInterval(iv);
  }, [tagihan, phase, amount]); // eslint-disable-line react-hooks/exhaustive-deps

  function simulatePayment() {
    if (paying.current) return;                        // ketuk ganda tidak mengirim dua pembayaran
    paying.current = true;
    paidAmount.current = amount;
    setPhase("checking");
    setTimeout(() => {
      if (payload) {
        dispatchA({
          t: "confirmOnline",
          session: { ...payload, status: "booked", checkin, paidOnline: paidAmount.current },
        });
      } else {
        dispatchA({
          t: "guestOrder",
          order: {
            id: refId, code, guest: nama || "Tamu", phone: hp, mode: draft.fnbMode,
            tableId: draft.fnbMode === "meja" ? draft.fnbTable ?? undefined : undefined,
            // Tab milik tamu: kalau sudah berganti, mesin menolak & mencatat pengembalian dana.
            sessionId: draft.fnbMode === "meja" ? draft.fnbSessionId ?? undefined : undefined,
            pay: "online", lines: cart, paidOnline: paidAmount.current,
          },
        });
      }
      setSubmitted(true);
    }, 1600);
  }

  // Hasil verifikasi dibaca dari data venue — bukan diasumsikan berhasil.
  useEffect(() => {
    if (!submitted || phase !== "checking") return;
    if (booking) {
      const s = venue.sessions.find((x) => x.id === refId);
      if (s && s.status !== "hold") accepted();
      else if (!s) {
        const rf = venue.refunds.find((r) => r.bookingCode === code);
        if (rf) { setWhy(rf.reason); setPhase("rejected"); }
        else if (tagihan) accepted(); // Konfirmasi dari gateway diutamakan
      }
    } else {
      const o = venue.orders.find((x) => x.id === refId);
      if (o?.status === "diterima") accepted();
      else if (o?.status === "ditolak") { setWhy(o.reason ?? "pesanan ditolak"); setPhase("rejected"); }
      else if (tagihan) accepted();
    }
  }, [submitted, phase, venue, tagihan]); // eslint-disable-line react-hooks/exhaustive-deps

  function batal() {
    if (booking) dispatchA({ t: "releaseHold", id: refId });
    dispatch({ t: "setPending", pending: null });
    nav("/checkout");
  }

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const pct = (left / total) * 100;

  return (
    <div className="pb-28">
      <PageHeader kicker="Pembayaran" title="QRIS" />

      <div className="mx-auto max-w-lg px-5 pt-5">
        <AnimatePresence mode="wait">
          {phase === "creating" && (
            <motion.div key="c" exit={{ opacity: 0 }}>
              <Card className="px-4 py-6">
                <RackLoader label={booking ? "Menahan slot & membuat kode QRIS" : "Membuat kode QRIS"} />
              </Card>
            </motion.div>
          )}

          {(phase === "waiting" || phase === "checking") && (
            <motion.div
              key="w" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} className="space-y-4"
            >
              {/* Countdown */}
              <Card className="p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
                    Selesaikan dalam
                  </span>
                  <span className="font-display text-2xl tabular-nums text-amber">{mm}:{ss}</span>
                </div>
                <CueProgress value={pct} />
                <p className="mt-2 text-[11px] leading-snug text-dim">
                  {booking
                    ? "Slot mejamu sedang ditahan dan tidak bisa diambil orang lain selama hitungan ini. Lewat dari itu, meja dilepas lagi."
                    : "Kode QR berlaku selama hitungan ini."}
                </p>
              </Card>

              {/* QR */}
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line bg-brick/20 px-4 py-2.5">
                  <span className="font-script text-lg leading-none text-amber">Scan & Bayar</span>
                  <span className="text-[10px] uppercase tracking-wider text-cream/60">{orderId}</span>
                </div>
                <div className="flex flex-col items-center gap-3 p-5">
                  {tagihan?.qrString ? (
                    /* QR digambar di layar SPL sendiri — tamu tinggal scan, tidak perlu
                       pindah ke halaman gateway. Isi QRIS-nya datang dari server. */
                    <QrGambar payload={tagihan.qrString} />
                  ) : tagihan?.bayarUrl ? (
                    /* Cadangan kalau isi QRIS tidak bisa diambil: halaman bayar gateway. */
                    <a href={tagihan.bayarUrl} target="_blank" rel="noreferrer"
                      className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-amber
                        px-4 text-sm font-bold text-ink hover:bg-amber-deep">
                      Buka halaman pembayaran QRIS
                    </a>
                  ) : tagihan?.qrUrl ? (
                    <img src={tagihan.qrUrl} alt="Kode QRIS pembayaran"
                      className="h-[200px] w-[200px] rounded-lg bg-cream p-2" />
                  ) : MODE_TAMU ? (
                    /* Tidak ada QR sungguhan: JANGAN menampilkan QR tiruan — tamu pernah
                       menyangka itu kode bayar. Yang tampil hanya keterangan di bawah. */
                    <div className="w-full rounded-lg border border-dashed border-line px-4 py-8 text-center text-[12px] leading-snug text-dim">
                      Kode QR belum bisa dibuat sekarang.
                    </div>
                  ) : (
                    <FakeQR seed={orderId} />
                  )}
                  <div className="text-center">
                    <div className="text-[11px] uppercase tracking-wider text-dim">Total tagihan</div>
                    <div className="font-serif text-3xl font-bold tabular-nums text-amber">
                      {rupiah(amount)}
                    </div>
                    {booking && heldAmount !== null && heldAmount !== snap.current.grand && (
                      <p className="mt-1 max-w-[30ch] text-[11px] leading-snug text-dim">
                        Harga mengikuti tarif saat kode QR dibuat.
                      </p>
                    )}
                  </div>
                  {tagihan?.bayarUrl && !tagihan?.qrString && (
                    <p className="max-w-[34ch] text-center text-[11px] leading-snug text-dim">
                      Halaman pembayaran terbuka di tab baru. Setelah dibayar, kembali ke sini —
                      layar ini yang menunggu konfirmasi dari server, jadi jangan ditutup.
                    </p>
                  )}
                  <p className="max-w-[30ch] text-center text-[11px] leading-snug text-dim">
                    Buka aplikasi m-banking atau e-wallet mana pun, pilih bayar QRIS,
                    lalu scan kode di atas.
                  </p>
                </div>
              </Card>

              {phase === "checking" ? (
                <Card className="px-4 py-5">
                  <div className="flex items-center justify-center gap-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    ><Ball n={8} size={22} /></motion.div>
                    <span className="text-sm text-cream">Mengecek pembayaran…</span>
                  </div>
                </Card>
              ) : (
                <>
                  {tagihan ? (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/8 p-4 text-center">
                      <p className="text-sm font-semibold text-emerald-300">Menunggu pembayaran</p>
                      <p className="mt-1 text-[12px] leading-snug text-cream">
                        Scan kode di atas dengan aplikasi apa pun yang mendukung QRIS.
                        Halaman ini berubah sendiri begitu pembayaranmu masuk — tidak perlu menekan apa pun.
                      </p>
                      {qrisGagal && <p className="mt-1 text-[12px] text-amber">{qrisGagal}</p>}
                      <button
                        type="button"
                        onClick={periksaManual}
                        disabled={checkingManual}
                        className="mt-3 inline-flex min-h-[38px] w-full items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        {checkingManual ? "Mengecek status pembayaran…" : "Sudah bayar? Cek status sekarang"}
                      </button>
                    </div>
                  ) : MODE_TAMU ? (
                    <div className="rounded-xl border border-amber/50 bg-amber/10 p-4 text-center">
                      <p className="text-sm font-semibold text-amber">Bayar di kasir</p>
                      <p className="mt-1 text-[12px] leading-snug text-cream">
                        Pembayaran QRIS online belum diaktifkan. Slot ini ditahan untuk kamu —
                        tunjukkan layar ini di kasir SPL untuk membayar dan mengunci mejanya.
                      </p>
                      {qrisGagal && <p className="mt-1 text-[12px] text-amber/80">{qrisGagal}</p>}
                    </div>
                  ) : (
                    <>
                      <Button full onClick={simulatePayment}>Saya sudah bayar</Button>
                      <p className="text-center text-[11px] leading-snug text-dim">
                        Mode demo — tombol ini menggantikan notifikasi Midtrans.
                        Di versi asli, status berubah sendiri begitu pembayaran masuk.
                      </p>
                    </>
                  )}
                  {booking && (
                    <p className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-[11px] leading-snug text-dim">
                      Dengan membayar, kamu setuju: booking yang sudah dibayar <span className="text-cream">tidak bisa dibatalkan</span>{" "}
                      dan <span className="text-cream">tidak bisa diganti jadwalnya</span>. Datang maksimal 20 menit setelah jam mulai.
                    </p>
                  )}
                  <button onClick={batal} className="min-h-[40px] w-full text-sm text-dim underline underline-offset-4">
                    {booking ? "Batalkan sebelum bayar & lepas slot" : "Batalkan"}
                  </button>
                </>
              )}
            </motion.div>
          )}

          {phase === "paid" && (
            <motion.div
              key="p" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              className="py-12 text-center"
            >
              <PocketDrop />
              <h2 className="mt-4 font-display text-3xl uppercase tracking-wide text-amber">
                Lunas
              </h2>
              <p className="mt-1 text-sm text-cream/80">
                {booking ? "Mejamu sudah terkunci." : "Pesananmu sudah masuk dapur."}
              </p>
            </motion.div>
          )}

          {phase === "rejected" && (
            <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="px-4 py-8 text-center">
                <Ball n={8} size={40} className="mx-auto opacity-40" />
                <h2 className="mt-3 font-display text-xl uppercase tracking-wide text-cream">
                  {booking ? "Booking tidak bisa diproses" : "Pesanan tidak bisa diproses"}
                </h2>
                <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-relaxed text-dim">
                  Pembayaranmu sudah masuk, tapi {why}. Dana {rupiah(paidAmount.current)} dicatat
                  untuk dikembalikan — kasir akan menghubungi nomor yang kamu isi.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <Button full onClick={() => nav(booking ? "/booking" : "/menu")}>
                    {booking ? "Pilih Slot Lain" : "Kembali ke Menu"}
                  </Button>
                  <Button full variant="ghost" onClick={() => nav("/")}>Ke Beranda</Button>
                </div>
              </Card>
            </motion.div>
          )}

          {phase === "gagal" && (
            <motion.div key="g" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="px-4 py-8 text-center">
                <Ball n={8} size={40} className="mx-auto opacity-40" />
                <h2 className="mt-3 font-display text-xl uppercase tracking-wide text-cream">
                  Slot tidak bisa ditahan
                </h2>
                <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-relaxed text-dim">
                  {why ? cap(why) : "Slot baru saja diambil orang lain"}. Belum ada uang yang terpotong.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <Button full onClick={() => nav("/booking")}>Pilih Slot Lain</Button>
                  <Button full variant="ghost" onClick={() => nav("/checkout")}>Kembali ke Ringkasan</Button>
                </div>
              </Card>
            </motion.div>
          )}

          {phase === "expired" && (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="px-4 py-8 text-center">
                <Ball n={8} size={40} className="mx-auto opacity-40" />
                <h2 className="mt-3 font-display text-xl uppercase tracking-wide text-cream">
                  Waktu habis
                </h2>
                <p className="mt-1 text-sm text-dim">
                  {booking ? "Slot sudah dilepas. " : ""}Tidak ada uang yang terpotong.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <Button full onClick={() => nav("/checkout")}>Buat QR Baru</Button>
                  <Button full variant="ghost" onClick={() => nav("/")}>Ke Beranda</Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* QR palsu deterministik — pola yang sama untuk order id yang sama.
   Diganti dengan actions[].url dari Midtrans saat backend siap (PRD PAY-06). */
function FakeQR({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const out: boolean[] = [];
    for (let i = 0; i < 625; i++) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      out.push(((h >>> 0) % 100) < 47);
    }
    return out;
  }, [seed]);

  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c > 17) || (r > 17 && c < 7);

  return (
    <motion.div
      className="rounded-2xl bg-cream p-3"
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
    >
      <svg width="200" height="200" viewBox="0 0 25 25" shapeRendering="crispEdges" role="img"
        aria-label="Kode QRIS untuk pembayaran">
        <rect width="25" height="25" fill="#FDF0DC" />
        {cells.map((on, i) => {
          const r = Math.floor(i / 25), c = i % 25;
          if (isFinder(r, c)) return null;
          return on ? <rect key={i} x={c} y={r} width="1" height="1" fill="#0B0B0C" /> : null;
        })}
        {[[0, 0], [0, 18], [18, 0]].map(([r, c], i) => (
          <g key={i}>
            <rect x={c} y={r} width="7" height="7" fill="#0B0B0C" />
            <rect x={c + 1} y={r + 1} width="5" height="5" fill="#FDF0DC" />
            <rect x={c + 2} y={r + 2} width="3" height="3" fill="#992212" />
          </g>
        ))}
      </svg>
    </motion.div>
  );
}

/* Animasi bola masuk kantong saat lunas */
function PocketDrop() {
  return (
    <svg viewBox="0 0 200 90" className="mx-auto w-56" aria-hidden="true">
      <ellipse cx="168" cy="45" rx="20" ry="19" fill="#0B0B0C" />
      <ellipse cx="168" cy="45" rx="20" ry="19" fill="none" stroke="#26262A" strokeWidth="2" />
      <motion.g
        initial={{ x: -150, opacity: 1 }}
        animate={{ x: [-150, 0, 8], opacity: [1, 1, 0], scale: [1, 1, 0.5] }}
        transition={{ duration: 1.1, times: [0, 0.75, 1], ease: [0.3, 0.8, 0.4, 1] }}
      >
        <motion.g
          animate={{ rotate: 720 }}
          transition={{ duration: 1.1, ease: "linear" }}
          style={{ originX: "168px", originY: "45px" }}
        >
          <circle cx="168" cy="45" r="14" fill="#F0A202" />
          <circle cx="168" cy="45" r="6.5" fill="#FDF0DC" />
          <text x="168" y="45.5" textAnchor="middle" dominantBaseline="central"
            fontSize="8" fontWeight="700" fill="#0B0B0C" fontFamily="Georgia, serif">8</text>
        </motion.g>
      </motion.g>
    </svg>
  );
}
