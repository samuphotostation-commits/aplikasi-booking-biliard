import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useAdmin } from "../../lib/adminStore";
import type { Ticket } from "../../data/live";

/* Kitchen Display sederhana (PRD KK-15).
   Empat status, tombol besar, tanpa routing per-station yang rumit —
   itu Fase 2. Yang penting tiket tidak lagi diteriakkan. */

const FLOW: Record<Ticket["status"], { next?: Ticket["status"]; cta: string; tone: string }> = {
  new: { next: "preparing", cta: "Mulai masak", tone: "border-amber/60 bg-amber/10" },
  preparing: { next: "ready", cta: "Tandai siap", tone: "border-blue-400/50 bg-blue-400/8" },
  ready: { next: "served", cta: "Sudah diantar", tone: "border-emerald-500/50 bg-emerald-500/8" },
  served: { cta: "Selesai", tone: "border-line bg-ink-2 opacity-50" },
};

const LABEL: Record<Ticket["status"], string> = {
  new: "Baru", preparing: "Diproses", ready: "Siap antar", served: "Selesai",
};

export default function Kitchen() {
  const { a, dispatchA } = useAdmin();
  const [station, setStation] = useState<"all" | "kitchen" | "bar">("all");

  const list = a.tickets
    .filter((t) => station === "all" || t.station === station)
    .filter((t) => t.status !== "served")
    .sort((x, y) => x.at - y.at);

  const served = a.tickets.filter((t) => t.status === "served").length;

  return (
    <div className="pb-6">
      <div className="mb-3 flex items-center gap-2">
        {([["all", "Semua"], ["kitchen", "Dapur"], ["bar", "Bar"]] as const).map(([v, l]) => {
          const n = a.tickets.filter(
            (t) => t.status !== "served" && (v === "all" || t.station === v),
          ).length;
          return (
            <button
              key={v} onClick={() => setStation(v)} aria-pressed={station === v}
              className={`min-h-[38px] rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${
                station === v ? "bg-amber text-ink" : "bg-ink-2 text-mute"
              }`}
            >{l} · {n}</button>
          );
        })}
        <span className="ml-auto text-[11px] text-dim">{served} selesai</span>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-ink-2 px-4 py-12 text-center">
          <div className="font-display text-2xl uppercase tracking-wide text-dim">Bersih</div>
          <p className="mt-1 text-sm text-dim">Tidak ada tiket menunggu.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {list.map((t) => {
              const f = FLOW[t.status];
              const mins = Math.floor((Date.now() - t.at) / 60000);
              const late = mins >= 15;
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  className={`rounded-xl border p-3 ${f.tone}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-lg uppercase leading-tight text-cream">
                        {t.tableName}
                      </div>
                      {t.via && <div className="text-[11px] text-amber/90">{t.via}</div>}
                      <div className="text-[10px] uppercase tracking-wider text-dim">
                        {t.station === "bar" ? "Bar" : "Dapur"} · {LABEL[t.status]}
                      </div>
                    </div>
                    <div className={`shrink-0 text-right text-[13px] font-bold tabular-nums ${
                      late ? "text-red-400" : "text-mute"
                    }`}>
                      {mins}m
                    </div>
                  </div>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-display text-xl text-amber">{t.qty}×</span>
                    <span className="text-[15px] leading-snug text-cream">{t.name}</span>
                  </div>
                  {t.variant && <div className="text-[12px] text-mute">{t.variant}</div>}

                  {f.next && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => dispatchA({ t: "ticket", id: t.id, status: f.next! })}
                      className="mt-3 min-h-[46px] w-full rounded-xl bg-amber text-[15px]
                        font-bold text-ink"
                    >{f.cta}</motion.button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-dim">
        Tiket lebih dari 15 menit ditandai merah. Urutan selalu yang paling lama di atas —
        bukan yang paling gampang dimasak.
      </p>
    </div>
  );
}
