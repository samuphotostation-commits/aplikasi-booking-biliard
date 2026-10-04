import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Mark, PageHeader } from "../components/UI";
import { Ball } from "../components/motion/Billiard";
import { useStore, type CartLine } from "../lib/store";
import { useAdmin, businessDateOf, lineValue } from "../lib/adminStore";
import { TABLES } from "../data/venue";
import { findItem } from "../data/menu";
import { fmtDateLong, rupiah } from "../lib/core";
import { TICKET_LABEL, TONE_CLASS, bookingMilikAkun, customerStatus, jamOf } from "../lib/customerStatus";

export default function Success() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { refId?: string } };
  const { state } = useStore();
  const { a } = useAdmin();
  // Kalau HP ini belum punya catatannya (mis. dibuka di perangkat lain dengan
  // akun yang sama, atau halaman dimuat ulang), pakai booking milik akun yang
  // dikirim server — jangan bilang "tidak ditemukan" untuk booking yang ada.
  const dariAkun = bookingMilikAkun(a, state.bookings);
  const semua = [...state.bookings, ...dariAkun];
  const record = semua.find((b) => b.refId === loc.state?.refId) ?? semua[0];

  if (!record) {
    return (
      <div className="mx-auto max-w-lg px-5 pt-16 text-center">
        <Ball n={8} size={40} className="mx-auto opacity-40" />
        <p className="mt-4 text-cream">Belum ada pesanan.</p>
        <div className="mt-5"><Button full onClick={() => nav("/booking")}>Booking Meja</Button></div>
      </div>
    );
  }

  const st = customerStatus(record, a);
  const isBooking = record.kind === "booking";
  const s = st.session;
  const o = st.order;
  const tableName = (id?: string | null) => TABLES.find((t) => t.id === id)?.name;

  const title = isBooking
    ? s?.status === "noshow" ? "Booking Dilepas"
      : !s ? (st.refunds.length ? "Booking Dibatalkan" : "Booking")
      : "Booking Terkunci"
    : o?.status === "ditolak" ? "Pesanan Ditolak"
      : o?.status === "void" ? "Pesanan Dibatalkan"
      : "Pesanan Terkirim";

  const lines: CartLine[] = st.lines;
  const moved = isBooking && s && record.draft.tableId && s.tableId !== record.draft.tableId;
  const showCheckin = isBooking && s && (s.status === "booked" || s.status === "running");

  return (
    <div className="pb-28">
      <PageHeader kicker={st.tone === "bad" ? "Perhatian" : "Berhasil"} title={title} />

      <div className="mx-auto max-w-lg px-5 pt-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Tiket */}
          <div className="relative overflow-hidden rounded-2xl border border-amber/40 bg-ink-2">
            <div className="brick-tex relative px-5 py-4 text-center">
              <div className="absolute inset-0 bg-ink/45" />
              <div className="relative flex flex-col items-center text-amber">
                <Mark size={38} />
                <div className="mt-1 font-script text-xl leading-none">Sports Pool Lounge</div>
              </div>
            </div>

            {/* Takikan tiket */}
            <div className="relative h-4">
              <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink" />
              <div className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-ink" />
              <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-line-2" />
            </div>

            <div className="px-5 pb-5">
              <div className="text-center">
                <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${TONE_CLASS[st.tone]}`}>
                  {st.label}
                </span>
                {showCheckin ? (
                  <>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-dim">Kode check-in</div>
                    <motion.div
                      className="font-display text-5xl tracking-[0.14em] text-amber"
                      initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 220, damping: 16 }}
                    >{s!.checkin}</motion.div>
                    <div className="mt-1 text-[11px] text-dim">Tunjukkan ke kasir saat datang</div>
                  </>
                ) : !isBooking && o?.status === "diterima" ? (
                  <>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-dim">Kode pesanan</div>
                    <div className="font-display text-3xl tracking-[0.1em] text-amber">{record.code}</div>
                  </>
                ) : null}
              </div>

              <div className="mt-4 divide-y divide-line rounded-xl border border-line">
                {isBooking && <Row k="Kode booking" v={record.code} mono />}
                {isBooking && s && (
                  <>
                    <Row k="Meja" v={`${tableName(s.tableId) ?? s.tableId}${moved ? ` (dipindah dari ${tableName(record.draft.tableId)})` : ""}`} />
                    <Row k="Tanggal" v={fmtDateLong(businessDateOf(s.startsAt))} />
                    <Row k="Jam" v={`${jamOf(s.startsAt)} – ${jamOf(s.endsAt)}`} />
                  </>
                )}
                {!isBooking && o && (
                  <>
                    <Row k="Tujuan" v={o.mode === "takeaway" ? "Takeaway · ambil di kasir" : `Diantar ke ${tableName(o.tableId) ?? "meja"}`} />
                    <Row k="Pembayaran" v={o.pay !== "kasir" ? "Lunas QRIS"
                      : o.mode === "takeaway" ? "Dibayar saat diambil di kasir" : "Dibayar saat tutup tab"} />
                  </>
                )}
                {lines.length > 0 && (
                  <Row k="Makanan" v={`${lines.reduce((n, l) => n + l.qty, 0)} porsi`} />
                )}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-[13px] text-cream">
                    {!isBooking && o?.pay === "kasir"
                      ? (o.mode === "takeaway" ? "Bayar saat ambil" : "Masuk bill meja")
                      : s?.status === "hold" ? "Harus dibayar" : "Dibayar"}
                  </span>
                  <span className="font-serif text-xl font-bold tabular-nums text-amber">
                    {rupiah(st.paid)}
                  </span>
                </div>
              </div>

              {st.refunds.length > 0 && (
                <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/8 px-3 py-2">
                  {st.refunds.map((r) => (
                    <div key={r.id} className="flex justify-between gap-3 text-[12px] leading-snug">
                      <span className="text-red-200">Dikembalikan: {r.reason}</span>
                      <span className="shrink-0 font-serif tabular-nums text-red-200">{rupiah(r.amount)}</span>
                    </div>
                  ))}
                  <p className="mt-1 text-[11px] text-dim">Kasir akan menghubungi nomor yang kamu isi.</p>
                </div>
              )}

              {lines.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
                    Pesanan Smokehouse
                  </div>
                  <ul className="space-y-0.5">
                    {lines.map((l) => {
                      const it = findItem(l.itemId);
                      return it ? (
                        <li key={l.key} className="flex justify-between text-[12px] text-mute">
                          <span>{l.qty}× {it.name}{l.variant ? ` (${l.variant})` : ""}</span>
                          <span className="tabular-nums">{l.unitPrice === 0 ? "gratis" : rupiah(lineValue(l))}</span>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              )}

              {!isBooking && st.tickets.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Di dapur</div>
                  <ul className="space-y-0.5">
                    {st.tickets.map((t) => (
                      <li key={t.id} className="flex justify-between text-[12px] text-mute">
                        <span>{t.qty}× {t.name}</span>
                        <span className={t.status === "ready" ? "text-emerald-400" : t.status === "served" ? "text-dim" : "text-amber"}>
                          {TICKET_LABEL[t.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!s && isBooking && !st.refunds.length && (
                <p className="mt-3 text-center text-[12px] text-dim">
                  Booking ini tidak ada di akun yang sedang masuk — mungkin dibuat
                  dengan akun lain. Kalau ini memang punyamu, tunjukkan kodenya ke kasir SPL.
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {isBooking && (s?.status === "booked" || s?.status === "hold") && (
          <Card className="mt-4 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              Yang perlu diingat
            </div>
            <ul className="mt-1.5 space-y-1 text-[12px] leading-snug text-mute">
              <li>• Check-in paling cepat 30 menit sebelum jam main.</li>
              <li>• Datang maksimal 20 menit setelah jam mulai, lewat itu meja dilepas dan pembayaran hangus.</li>
              <li>• Makanan pra-order disiapkan saat kamu check-in, bukan sebelumnya.</li>
              <li className="text-amber/90">• Booking yang sudah dibayar <strong>tidak bisa dibatalkan</strong> dan <strong>tidak bisa diganti jadwalnya</strong>.</li>
            </ul>
          </Card>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Button full onClick={() => nav("/pesanan")}>Lihat Pesanan Saya</Button>
          <Button full variant="ghost" onClick={() => nav("/")}>Kembali ke Beranda</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="shrink-0 text-[13px] text-dim">{k}</span>
      <span className={`text-right text-[13px] text-cream ${mono ? "font-mono tracking-wide" : ""}`}>{v}</span>
    </div>
  );
}
