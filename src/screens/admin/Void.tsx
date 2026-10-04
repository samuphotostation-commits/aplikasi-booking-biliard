import { motion, AnimatePresence } from "framer-motion";
import { useAdmin } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { jam } from "./AdminShell";

/* Void berjenjang:
   - Superadmin: void langsung berlaku, tercatat atas namanya.
   - Karyawan  : void hanya DIAJUKAN. Uang belum bergerak sampai disetujui.

   Kenapa dipisah — void adalah cara paling mudah menghilangkan uang tunai
   tanpa jejak. Kalau kasir bisa mem-void sendiri, laporan tidak bisa dipercaya. */

const BADGE = {
  menunggu: "bg-amber/20 text-amber",
  disetujui: "bg-emerald-500/20 text-emerald-300",
  ditolak: "bg-red-500/20 text-red-300",
};

export default function VoidScreen() {
  const { a, dispatchA, allow } = useAdmin();
  const menunggu = a.voids.filter((v) => v.status === "menunggu");
  const riwayat = a.voids.filter((v) => v.status !== "menunggu");

  return (
    <div className="space-y-6 pb-6">
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Menunggu persetujuan · {menunggu.length}
        </h2>

        {menunggu.length === 0 ? (
          <Empty text="Tidak ada pengajuan void." />
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {menunggu.map((v) => (
                <motion.div key={v.id} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-xl border border-amber/50 bg-amber/8 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold text-cream">{v.label}</div>
                      <div className="text-[11px] text-dim">
                        {jam(v.at)} · diajukan {v.byName}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-serif text-lg font-bold tabular-nums text-amber">
                        {rupiah(v.amount)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-dim">
                        {v.targetKind === "sesi" ? "seluruh sesi" : v.targetKind === "pesanan" ? "pesanan dari HP" : "1 item"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-line bg-ink/50 px-2.5 py-1.5">
                    <span className="text-[11px] text-dim">Alasan: </span>
                    <span className="text-[12px] text-cream">{v.reason}</span>
                  </div>

                  {allow("setujuiVoid") ? (
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => dispatchA({ t: "decideVoid", id: v.id, approve: false })}
                        className="min-h-[44px] rounded-lg border border-line bg-ink-2 text-[13px]
                          font-semibold text-cream">Tolak</button>
                      <button
                        onClick={() => dispatchA({ t: "decideVoid", id: v.id, approve: true })}
                        className="min-h-[44px] rounded-lg bg-amber text-[13px] font-bold text-ink">
                        Setujui</button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-dim">
                      Menunggu superadmin. Sesi/item masih aktif sampai disetujui.
                    </p>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Riwayat void
        </h2>
        {riwayat.length === 0 ? (
          <Empty text="Belum ada void yang diputuskan." />
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
            {riwayat.map((v) => (
              <div key={v.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-cream">{v.label}</div>
                    <div className="text-[11px] text-dim">
                      {jam(v.at)} · {v.byName}
                      {v.decidedBy && v.decidedBy !== v.byName && ` → ${v.decidedBy}`}
                      {" · "}{v.reason}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase
                      tracking-wider ${BADGE[v.status]}`}>{v.status}</span>
                    <div className="mt-0.5 font-serif text-[12px] tabular-nums text-mute">
                      {rupiah(v.amount)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Void yang ditolak tetap tersimpan. Pola pengajuan yang sering ditolak
          dari orang yang sama adalah sinyal yang perlu ditindaklanjuti.
        </p>
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
