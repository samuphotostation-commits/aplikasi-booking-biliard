import { useState } from "react";
import { QrisKasir } from "./QrisKasir";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../../components/UI";
import {
  useAdmin, settlementOf, checkinProblem, restoreProblem, businessDateOf, bookingLapsed, unservedLinesOf, lineValue,
  classOf, sessionType, meterEndOf, splitPaidOf,
  type GuestOrder, type State,
} from "../../lib/adminStore";
import { VOID_REASONS } from "../../data/staff";
import { TABLES, CLASS_SHORT } from "../../data/venue";

import { rupiah } from "../../lib/core";
import type { LiveSession } from "../../data/live";
import { Countdown, Elapsed, jam } from "./AdminShell";
import ClashAlert from "./ClashAlert";

/** Hasil void dibaca dari data sesudah aksi: berlaku, menunggu superadmin, atau ditolak mesin. */
function voidOutcome(before: State, after: State, what: string, refund: boolean) {
  const req = after.voids.length > before.voids.length ? after.voids[0] : null;
  if (!req) return `${what} tidak bisa di-void — sudah diserahkan, dibayar, atau berubah.`;
  if (req.status === "menunggu") return `Void ${what} diajukan ke superadmin.`;
  return `${what} di-void${refund && req.amount > 0 ? ", dana dicatat untuk dikembalikan" : ""}.`;
}

export default function Kasir() {
  const { a, dispatchA, byTable, tick, allow, peek } = useAdmin();
  void tick;
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [voidMsg, setVoidMsg] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);

  const now = Date.now();
  const today = businessDateOf(now);
  const booked = a.sessions.filter((s) => s.status === "booked").sort((x, y) => x.startsAt - y.startsAt);
  // Jadwal habis tanpa pernah bisa check-in (meja masih terpakai): butuh keputusan kasir.
  const lapsed = booked.filter((s) => bookingLapsed(s, now));
  const active = booked.filter((s) => !bookingLapsed(s, now));
  const pending = active.filter((s) => businessDateOf(s.startsAt) === today);
  const later = active.filter((s) => businessDateOf(s.startsAt) > today);
  const holds = a.sessions.filter((s) => s.status === "hold").sort((x, y) => x.startsAt - y.startsAt);
  const lateGuests = a.sessions
    .filter((s) => s.status === "noshow" && businessDateOf(s.startsAt) === today && now < s.endsAt)
    .sort((x, y) => x.startsAt - y.startsAt);
  const orders = a.orders.filter((o) => businessDateOf(o.at) === today).slice(0, 20);
  const openRefunds = a.refunds.filter((r) => !r.settledAt);

  const running = a.sessions
    .filter((s) => s.status === "running")
    .sort((x, y) => x.endsAt - y.endsAt);
  const reservasiResto = a.sessions.filter((s) => s.status === "booked" && sessionType(s) === "resto");
  void reservasiResto;

  const nameOf = (id?: string) => TABLES.find((t) => t.id === id)?.name ?? "—";
  const label = (id: string) => {
    const t = TABLES.find((x) => x.id === id)!;
    const k = classOf(a, id);
    return { no: k === "resto" ? `R${t.no}` : k === "regular" ? String(t.no) : `V${t.no}`, type: CLASS_SHORT[k] };
  };
  // Tab yang masih terbuka dari hari operasional sebelumnya: biasanya karena komputer
  // mati atau kasir lupa menutup. Meterannya sudah berhenti di jam tutup hari itu.
  const tabTertinggal = running.filter((s) => s.source === "walkin" && businessDateOf(s.startsAt) < today);
  // Pesanan HP yang baru masuk (15 menit terakhir) dan belum ada yang diantar.
  const pesananBaru = orders.filter((o) => o.status === "diterima" && now - o.at < 15 * 60_000 &&
    !a.tickets.some((t) => t.sessionId === (o.sessionId ?? o.id) && t.status === "served"));
  // Takeaway (pesan makanan saja, tanpa meja) yang menunggu diambil & dibayar.
  const takeawayBelumBayar = a.orders.filter((o) => o.status === "diterima" && !o.sessionId &&
    !o.payment && o.paidOnline === 0);

  const flash = (text: string) => {
    setVoidMsg(text);
    setTimeout(() => setVoidMsg(null), 5000);
  };

  function submit() {
    // Alasan penolakan diambil dari aturan yang sama dengan yang dipakai mesin,
    // dan hasilnya dibaca ulang dari data — layar tidak pernah bilang "berhasil"
    // untuk check-in yang ditolak.
    if (!a.shift) {
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

  return (
    <div className="space-y-6 pb-6">
      <ClashAlert />

      {/* ── Takeaway menunggu diambil & dibayar ─────────── */}
      {takeawayBelumBayar.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber">
            Takeaway menunggu diambil · {takeawayBelumBayar.length} ·{" "}
            {rupiah(takeawayBelumBayar.reduce((n, o) => n + o.value, 0))}
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-amber/40 bg-amber/5">
            {takeawayBelumBayar.map((o) => {
              const tk = a.tickets.filter((t) => t.sessionId === o.id);
              const siap = tk.length > 0 && tk.every((t) => t.status === "ready" || t.status === "served");
              return (
                <div key={o.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-cream">
                        {o.guest} · <span className="font-mono text-mute">{o.code}</span>
                      </div>
                      <div className="text-[11px] text-dim">
                        {jam(o.at)} · {o.lines.reduce((n, l) => n + l.qty, 0)} porsi ·{" "}
                        {siap ? <span className="text-emerald-400">siap diambil</span> : "dapur sedang menyiapkan"}
                        {o.phone && ` · ${o.phone}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-serif text-[13px] tabular-nums text-cream">
                      {rupiah(o.value)}
                    </div>
                  </div>
                  {allow("tutupTab") && (
                    <div className="mt-1.5 space-y-1.5">
                      {/* QR dinamis bernominal tepat untuk pesanan ini; yang menandai
                          lunas tetap tombol di bawahnya, ditekan kasir. */}
                      <QrisKasir amount={o.value} ringkas={`Pesanan ${o.code}`} kode={o.code} />
                    <div className="flex flex-wrap gap-1.5">
                      {([["cash", "Tunai"], ["edc", "Kartu/EDC"], ["qris_online", "QRIS"]] as const).map(([ch, label]) => (
                        <button key={ch}
                          onClick={() => {
                            dispatchA({ t: "settleOrder", id: o.id, channel: ch });
                            const lunas = !!peek().orders.find((x) => x.id === o.id)?.payment;
                            flash(lunas
                              ? `${o.code} lunas ${rupiah(o.value)} (${label}).`
                              : "Belum tercatat — buka shift dulu, atau pesanan sudah berubah.");
                          }}
                          className="min-h-[36px] rounded-lg border border-line bg-ink px-3 text-[12px] font-semibold text-cream">
                          {label}
                        </button>
                      ))}
                    </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
            Pesanan makanan tanpa meja. Uangnya baru masuk laporan setelah ditandai lunas di sini —
            jadi angka rekap tidak pernah menghitung pesanan yang belum diambil.
          </p>
        </section>
      )}

      {/* ── Tab yang tertinggal terbuka dari hari sebelumnya ── */}
      {tabTertinggal.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
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
                  Meterannya sudah berhenti otomatis pukul {jam(meterEndOf(s, now))} (batas meteran 05.00 pagi), jadi tamu tidak
                  ditagih semalaman. Tagihan sekarang {rupiah(settlementOf(s, a).due)} — tutup tabnya di tab Papan,
                  atau minta superadmin mengoreksi jam berhentinya kalau tamu memang pulang lebih awal.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {allow("lihatLaporanKeuangan") && openRefunds.length > 0 && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/8 px-3 py-2 text-[12px] text-red-300">
          {openRefunds.length} dana pelanggan ({rupiah(openRefunds.reduce((n, r) => n + r.amount, 0))}) belum
          dikembalikan — tandai selesai di Rekap setelah ditransfer.
        </p>
      )}

      {/* ── Check-in ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Check-in tamu
        </h2>
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

      {voidMsg && (
        <p role="status" className="rounded-xl border border-amber/40 bg-amber/8 px-3 py-2 text-[12px] text-amber">
          {voidMsg}
        </p>
      )}

      {/* ── Booking yang jadwalnya habis tanpa bisa masuk ── */}
      {lapsed.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
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

      {/* ── Akan datang (hari operasional ini) ───────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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
                        onClick={() => {
                          if (!confirm(`Batalkan ${sessionType(s) === "resto" ? "reservasi" : "booking"} ${s.guest}?` +
                            (s.paidOnline > 0 ? `

${rupiah(s.paidOnline)} yang sudah dibayar akan dicatat untuk dikembalikan.` : ""))) return;
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

      {/* ── Tamu yang terlanjur dilepas tapi datang ──────── */}
      {lateGuests.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
            Dilepas (tidak datang) · {lateGuests.length}
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
            {lateGuests.map((s) => {
              const problem = restoreProblem(a, s.id);
              const bisa = !problem && !!a.shift && allow("bukaMeja");
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-cream">{nameOf(s.tableId)} · {s.guest}</div>
                    <div className="text-[11px] text-dim">
                      {jam(s.startsAt)}–{jam(s.endsAt)} · kode {s.checkin}
                      {problem && <span className="text-red-300"> · {problem}</span>}
                      {!problem && !a.shift && <span className="text-amber"> · buka shift dulu</span>}
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

      {/* ── Pembayaran QRIS yang sedang berjalan ─────────── */}
      {holds.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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

      {/* ── Sedang jalan, urut paling cepat habis ────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Sedang main · {running.length}
        </h2>
        {running.length === 0 ? (
          <Empty text="Belum ada meja yang jalan." />
        ) : (
          <div className="space-y-2">
            {running.map((s) => {
              const t = label(s.tableId);
              const left = s.endsAt - now;
              const warn = s.source === "online" && left <= 10 * 60000;
              return (
                <motion.div
                  key={s.id} layout
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    warn ? "border-red-500/50 bg-red-500/8" : "border-line bg-ink-2"
                  }`}
                >
                  <div className="w-12 shrink-0 text-center">
                    <div className="font-display text-lg leading-none text-cream">{t.no}</div>
                    <div className="text-[9px] uppercase text-dim">{t.type}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-cream">{s.guest}</div>
                    <div className="text-[11px] text-dim">
                      {s.source === "online" ? "Booking online" : "Open bill · meteran jalan"}
                      {s.paidOnline > 0 && " · ada yang sudah dibayar online"}
                    </div>
                  </div>
                  <div className="text-right text-[13px] font-semibold">
                    {s.source === "walkin" && !s.blockHours
                      ? <Elapsed since={s.startsAt} />
                      : <Countdown endsAt={s.endsAt} />}
                    <div className="text-[11px] font-normal text-amber">
                      {rupiah(settlementOf(s, a).due)}
                      {splitPaidOf(s) > 0 && (
                        <span className="ml-1 text-[10px] text-emerald-400">+{rupiah(splitPaidOf(s))} dibayar</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Yang paling cepat habis ada di atas. Meja dengan sisa ≤ 10 menit ditandai merah —
          itu tanda untuk menawarkan perpanjangan sebelum slot berikutnya datang.
        </p>
      </section>

      {/* ── Pesanan dari HP tamu ─────────────────────────── */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Pesanan dari HP · {orders.length}
          {pesananBaru.length > 0 && (
            <span className="rounded-full bg-amber px-2 py-0.5 text-[10px] font-bold text-ink">
              {pesananBaru.length} baru
            </span>
          )}
        </h2>
        {orders.length === 0 ? (
          <Empty text="Belum ada pesanan dari QR meja atau takeaway hari ini." />
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
            {orders.map((o) => {
              // Tiket dicocokkan lewat kunci baris pesanan — bukan jam pesan, yang bisa kembar.
              const tk = a.tickets.filter((t) => t.sessionId === (o.sessionId ?? o.id) && o.lines.some((l) => l.key === t.lineKey));
              const served = tk.filter((t) => t.status === "served").length;
              const open = o.status === "diterima" ? unservedLinesOf(a, o) : [];
              const tabJalan = !o.sessionId || a.sessions.find((x) => x.id === o.sessionId)?.status === "running";
              const bisaVoid = open.length > 0 && tabJalan && allow("ajukanVoid");
              const baru = pesananBaru.some((x) => x.id === o.id);
              return (
                <div key={o.id} className={`px-3 py-2.5 ${baru ? "bg-amber/8" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-cream">
                        {baru && <span className="mr-1.5 rounded bg-amber px-1.5 text-[10px] font-bold text-ink">BARU</span>}
                        {o.mode === "takeaway" ? "Takeaway" : `QR ${nameOf(o.tableId)}`} · {o.guest}
                      </div>
                      <div className="text-[11px] text-dim">
                        {jam(o.at)} · {o.code} ·{" "}
                        {o.paidOnline > 0 ? "lunas online"
                          : o.payment ? `lunas di kasir (${o.payment.channel === "cash" ? "tunai" : o.payment.channel === "edc" ? "kartu" : "QRIS"})`
                            : o.sessionId ? "masuk bill meja" : "belum dibayar"}
                        {o.status === "diterima" && tk.length > 0 && ` · ${served}/${tk.length} diantar`}
                      </div>
                      {o.status !== "diterima" && (
                        <div className="text-[11px] text-red-300">
                          {o.status === "void" ? "Dibatalkan (void)" : `Ditolak: ${o.reason}`}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-serif text-[13px] tabular-nums text-cream">
                        {rupiah(o.status === "diterima" ? o.value : o.paidOnline)}
                      </div>
                      {bisaVoid && voidFor !== o.id && (
                        <button
                          onClick={() => setVoidFor(o.id)}
                          className="mt-0.5 min-h-[32px] text-[11px] text-red-300 underline underline-offset-2">
                          void
                        </button>
                      )}
                    </div>
                  </div>
                  {bisaVoid && voidFor === o.id && (
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 p-2">
                      <div className="text-[11px] text-red-200/90">
                        Void {open.length === o.lines.length ? "seluruh pesanan" : `${open.length} baris yang belum diserahkan`}
                        {" "}({rupiah(open.reduce((n, l) => n + lineValue(l), 0))})
                        {o.pay === "online" ? " — dana dicatat untuk dikembalikan." : " — tagihan di bill ikut berkurang."}
                        {" "}Pilih alasan:
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {VOID_REASONS.map((r) => (
                          <button key={r} onClick={() => voidOrder(o, r)}
                            className="min-h-[34px] rounded-lg border border-line bg-ink px-2.5 text-[12px] text-cream">
                            {r}
                          </button>
                        ))}
                        <button onClick={() => setVoidFor(null)} className="min-h-[34px] px-2 text-[12px] text-dim">Batal</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
          Pesanan QR yang dibayar online sudah lunas di bill meja; yang "bayar di kasir" ikut
          ditagih saat tutup tab. Takeaway (pesan makanan tanpa meja) dibayar saat diambil di kasir —
          tandai lunas di bagian atas. Yang sudah diserahkan tidak bisa di-void.
        </p>
      </section>

      {/* ── Ringkas: meja kosong siap dipakai ────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Meja kosong
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {TABLES.filter((t) => !byTable.get(t.id)).map((t) => (
            <span
              key={t.id}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/8 px-2.5 py-1
                text-[13px] font-semibold text-emerald-300"
            >{classOf(a, t.id) === "resto" ? `Resto ${t.no}`
              : classOf(a, t.id) === "regular" ? t.no
                : `${CLASS_SHORT[classOf(a, t.id)]} ${t.no}`}</span>
          ))}
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
      {text}
    </div>
  );
}
