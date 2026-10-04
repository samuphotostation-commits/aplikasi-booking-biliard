import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TABLES, CLASS_LABEL, tableLabel } from "../../data/venue";
import { useAdmin, relocationTargets, canExtend as bisaPerpanjang, classOf } from "../../lib/adminStore";
import type { Clash } from "../../lib/occupancy";

/* PRD KK-08 — kejadian nomor satu di lantai biliar.
   Tamu yang sedang main belum selesai, sementara pemesan online sudah datang.
   Semua jaminan anti-double-booking di database tidak ada artinya kalau
   manusia yang menempati meja tidak bisa dipindahkan. */

const LEVEL = {
  T10: { ring: "border-amber/60 bg-amber/10", text: "text-amber", label: "10 menit lagi" },
  T3: { ring: "border-orange-500/60 bg-orange-500/12", text: "text-orange-300", label: "3 menit lagi" },
  OVER: { ring: "border-red-500/60 bg-red-500/12", text: "text-red-300", label: "SUDAH LEWAT" },
};

export default function ClashAlert() {
  const { clashes } = useAdmin();
  if (clashes.length === 0) return null;

  return (
    <section className="mb-4">
      <h2 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
        <motion.span
          className="inline-block h-2 w-2 rounded-full bg-red-400"
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        Perlu tindakan · {clashes.length}
      </h2>
      <div className="space-y-2">
        {clashes.map((c) => <ClashCard key={c.running.id} clash={c} />)}
      </div>
    </section>
  );
}

function ClashCard({ clash }: { clash: Clash }) {
  const { a, dispatchA } = useAdmin();
  const [mode, setMode] = useState<"idle" | "move" | "movePlayer">("idle");
  const L = LEVEL[clash.level];

  const tbl = TABLES.find((t) => t.id === clash.running.tableId)!;
  const targets = relocationTargets(a, clash.next);
  // Alternatif yang sering lebih mudah: tamu yang masih main yang pindah meja.
  const playerTargets = relocationTargets(a, clash.running);

  // Open bill tidak punya jam selesai (meteran jalan) — perpanjangan hanya
  // bermakna untuk booking online. Aturannya sama persis dengan mesin
  // (tidak menabrak, tidak melewati 02.00).
  const isOnline = clash.running.source === "online";
  const canExtend = isOnline && bisaPerpanjang(a, clash.running.id, 60);

  const mins = Math.abs(clash.minutesLeft);

  return (
    <motion.div layout className={`rounded-xl border p-3 ${L.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg uppercase leading-tight text-cream">
            {tbl.name}
          </div>
          <div className="text-[12px] leading-snug text-mute">
            <span className="text-cream">{clash.running.guest}</span>
            {clash.running.source === "walkin" ? " (walk-in)" : " (online)"} masih main
          </div>
        </div>
        <div className={`shrink-0 text-right ${L.text}`}>
          <div className="font-display text-xl leading-none">
            {clash.minutesLeft < 0 ? `+${mins}m` : `${mins}m`}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider">{L.label}</div>
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-line bg-ink/50 px-2.5 py-2">
        <div className="text-[11px] text-dim">Berikutnya di meja ini</div>
        <div className="text-[13px] text-cream">
          {clash.next.guest} ·{" "}
          {new Date(clash.next.startsAt).toLocaleTimeString("id-ID", {
            hour: "2-digit", minute: "2-digit",
          })}
          {clash.next.status === "hold" ? (
            <span className="text-amber"> · sedang membayar QRIS</span>
          ) : clash.next.paidOnline > 0 && (
            <span className="text-emerald-400"> · sudah bayar</span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === "idle" ? (
          <motion.div key="i" className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              disabled={!canExtend}
              onClick={() => dispatchA({ t: "extend", id: clash.running.id, minutes: 60 })}
              className="min-h-[44px] rounded-lg border border-line bg-ink-2 text-[13px]
                font-semibold text-cream disabled:opacity-35"
              title={!isOnline ? "Open bill tidak perlu diperpanjang — meteran terus jalan" : canExtend ? undefined : "Tidak bisa — booking berikutnya sudah mepet"}
            >
              {isOnline ? "Perpanjang 1 jam" : "Minta tamu selesai"}
            </button>
            <button
              disabled={targets.length === 0 || clash.next.status === "hold"}
              onClick={() => setMode("move")}
              className="min-h-[44px] rounded-lg bg-amber text-[13px] font-bold text-ink
                disabled:opacity-35"
            >
              Pindah pemesan
            </button>
            {playerTargets.length > 0 && (
              <button
                onClick={() => setMode("movePlayer")}
                className="col-span-2 min-h-[40px] rounded-lg border border-line bg-ink-2 text-[12px] text-mute"
              >
                Atau pindahkan {clash.running.guest} yang sedang main
              </button>
            )}
          </motion.div>
        ) : mode === "movePlayer" ? (
          <motion.div
            key="p" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className="mt-2.5 overflow-hidden"
          >
            <div className="mb-1.5 text-[11px] text-dim">
              Pindahkan <span className="text-cream">{clash.running.guest}</span> (meteran & pesanan ikut) ke:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {playerTargets.slice(0, 12).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    dispatchA({ t: "relocate", id: clash.running.id, toTableId: t.id });
                    setMode("idle");
                  }}
                  className="min-h-[40px] min-w-[44px] rounded-lg border border-emerald-500/40
                    bg-emerald-500/10 px-2.5 text-[13px] font-bold text-emerald-300"
                >{tableLabel(classOf(a, t.id), t.no)}</button>
              ))}
            </div>
            <button onClick={() => setMode("idle")} className="mt-2 min-h-[36px] text-[12px] text-dim">Batal</button>
          </motion.div>
        ) : (
          <motion.div
            key="m" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className="mt-2.5 overflow-hidden"
          >
            <div className="mb-1.5 text-[11px] text-dim">
              Pindahkan <span className="text-cream">{clash.next.guest}</span> ke meja{" "}
              {CLASS_LABEL[classOf(a, tbl.id)]} yang kosong:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {targets.slice(0, 12).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    dispatchA({ t: "relocate", id: clash.next.id, toTableId: t.id });
                    setMode("idle");
                  }}
                  className="min-h-[40px] min-w-[44px] rounded-lg border border-emerald-500/40
                    bg-emerald-500/10 px-2.5 text-[13px] font-bold text-emerald-300"
                >{tableLabel(classOf(a, t.id), t.no)}</button>
              ))}
            </div>
            <button
              onClick={() => setMode("idle")}
              className="mt-2 min-h-[36px] text-[12px] text-dim"
            >Batal</button>
          </motion.div>
        )}
      </AnimatePresence>

      {!canExtend && targets.length === 0 && playerTargets.length === 0 && (
        <p className="mt-2 text-[11px] leading-snug text-red-300">
          Tidak ada meja pengganti dan tidak bisa diperpanjang. Hubungi pemesan
          sekarang dan tawarkan kredit toko sebagai kompensasi.
        </p>
      )}
    </motion.div>
  );
}
