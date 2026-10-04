import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button, Card, PageHeader } from "../components/UI";
import { Ball } from "../components/motion/Billiard";
import { useStore } from "../lib/store";
import { useAdmin, businessDateOf } from "../lib/adminStore";
import { TABLES } from "../data/venue";
import { fmtDateLong, rupiah } from "../lib/core";
import { TONE_CLASS, bookingMilikAkun, customerStatus, jamOf } from "../lib/customerStatus";
import { memberSaya, type Member } from "../lib/member";

export default function Orders() {
  const nav = useNavigate();
  const { state } = useStore();
  const { a } = useAdmin();
  const [member, setMember] = useState<Member | null>(null);

  useEffect(() => {
    let batal = false;
    void memberSaya().then((m) => {
      if (!batal) setMember(m);
    });
    return () => { batal = true; };
  }, []);

  // Riwayat = catatan di HP ini DITAMBAH booking yang melekat di akun member
  // (dikirim server). Tanpa yang kedua, buka di perangkat lain dengan akun yang
  // sama dan layarnya kosong padahal bookingnya ada.
  const list = [...state.bookings, ...bookingMilikAkun(a, state.bookings)]
    .sort((x, y) => y.createdAt - x.createdAt);

  if (list.length === 0) {
    return (
      <div className="pb-28">
        <PageHeader kicker="Riwayat" title="Pesanan Saya" />
        <div className="mx-auto max-w-lg px-5 pt-12 text-center">
          <Ball n={8} size={44} className="mx-auto opacity-40" />
          <p className="mt-4 text-cream">Belum ada pesanan.</p>
          <p className="mt-1 text-sm text-dim">
            Booking dan pesanan makananmu akan muncul di sini lengkap dengan statusnya.
          </p>
          <div className="mt-6"><Button full onClick={() => nav("/booking")}>Booking Meja</Button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <PageHeader kicker="Riwayat" title="Pesanan Saya" sub={`${list.length} pesanan`} />
      <div className="mx-auto max-w-lg space-y-3 px-5 pt-5">
        {member && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-[12px] text-emerald-200">
            <span className="truncate">Tersinkronisasi dengan akun <strong>{member.nama}</strong> ({member.hp})</span>
            <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Member</span>
          </div>
        )}
        {list.map((b, i) => {
          const st = customerStatus(b, a);
          const s = st.session;
          const o = st.order;
          const tableId = b.kind === "booking" ? (s?.tableId ?? b.draft.tableId) : (o?.tableId ?? null);
          const table = TABLES.find((t) => t.id === tableId);
          const vip = table?.type === "vip" || table?.type === "vvip";
          const heading = b.kind === "booking"
            ? table?.name ?? "Booking meja"
            : o?.mode === "takeaway" ? "Takeaway" : `Pesanan ke ${table?.name ?? "meja"}`;
          const when = b.kind === "booking" && s
            ? `${fmtDateLong(businessDateOf(s.startsAt))} · ${jamOf(s.startsAt)}–${jamOf(s.endsAt)}`
            : `${fmtDateLong(businessDateOf(b.createdAt))} · ${jamOf(b.createdAt)}`;
          const nilai = st.paid;

          return (
            <motion.div
              key={b.refId}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
            >
              <Card className="overflow-hidden">
                <button onClick={() => nav("/sukses", { state: { refId: b.refId } })}
                  className="w-full text-left">
                  <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <Ball
                      n={b.kind === "pesanan" ? 3 : vip ? 9 : 1} size={30}
                      color={b.kind === "pesanan" ? "#1F6F4A" : vip ? "#992212" : "#F0A202"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-lg uppercase tracking-wide text-cream">
                        {heading}
                      </div>
                      <div className="truncate text-[11px] text-dim">{when}</div>
                    </div>
                    <span className={`max-w-[46%] shrink-0 truncate rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${TONE_CLASS[st.tone]}`}>
                      {st.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1">
                      {b.kind === "booking" && s && (s.status === "booked" || s.status === "running") ? (
                        <>
                          <div className="text-[11px] uppercase tracking-wider text-dim">Check-in</div>
                          <div className="font-display text-2xl tracking-[0.1em] text-amber">{s.checkin}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-[11px] uppercase tracking-wider text-dim">Kode</div>
                          <div className="font-mono text-[13px] tracking-wide text-mute">{b.code}</div>
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      {b.kind === "pesanan" && st.tickets.length > 0 && (
                        <div className="text-[11px] text-dim">
                          {st.tickets.filter((t) => t.status === "served").length}/{st.tickets.length} diantar
                        </div>
                      )}
                      {st.refunds.length > 0 && (
                        <div className="text-[11px] text-red-300">
                          {rupiah(st.refunds.reduce((n, r) => n + r.amount, 0))} dikembalikan
                        </div>
                      )}
                      <div className="font-serif text-lg font-bold tabular-nums text-cream">
                        {rupiah(nilai)}
                      </div>
                    </div>
                  </div>
                </button>
              </Card>
            </motion.div>
          );
        })}

        <p className="pt-2 text-center text-[11px] leading-relaxed text-dim">
          {member
            ? `Riwayat pesanan tersambung ke akun member (${member.hp}) dan otomatis muncul di perangkat mana pun kamu login.`
            : "Masuk atau daftar Member SPL di menu Akun untuk menyinkronkan riwayat booking ke perangkat lain."}
        </p>
      </div>
    </div>
  );
}
