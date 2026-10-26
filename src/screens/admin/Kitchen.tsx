import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useAdmin } from "../../lib/adminStore";
import { jam } from "./AdminShell";
import type { Ticket } from "../../data/live";

/* Kitchen Display sederhana (PRD KK-15).
   Empat status, tombol besar, tanpa routing per-station yang rumit —
   itu Fase 2. Yang penting tiket tidak lagi diteriakkan.

   ── Revisi pemilik 18 Okt 2026 ──────────────────────────────────────
   Tiga hal yang diminta, dan alasannya kenapa penting:

   1. KALIMAT & WARNA MENGIKUTI CARA DAPUR BICARA. "Mulai masak" diganti
      "Orderan diterima" — karena yang ditekan juru masak saat melihat
      tiket bukanlah janji bahwa ia sudah mulai memasak, tapi tanda bahwa
      pesanannya sudah dilihat. Kasir yang melihat layar ini butuh tahu
      persis itu.
   2. PESANAN YANG SUDAH SIAP TIDAK DIBUANG. Sebelumnya tiket "selesai"
      langsung hilang dari layar; kalau pramusaji lupa mengantar, tidak ada
      jejaknya di layar sama sekali. Sekarang turun ke bawah garis pemisah
      dan tetap terbaca sampai tutup buku.
   3. DUA JAM DITULIS: jam masuk dari kasir dan jam selesai dimasak. Itu
      satu-satunya cara menjawab "kenapa lama" tanpa saling menuduh.
   ──────────────────────────────────────────────────────────────────── */

const FLOW: Record<Ticket["status"], { next?: Ticket["status"]; cta: string; tone: string; dot: string }> = {
  // Kuning: baru masuk, belum disentuh siapa pun.
  new: { next: "preparing", cta: "Orderan diterima", tone: "border-amber/60 bg-amber/10", dot: "bg-amber" },
  // Hijau: sedang dikerjakan.
  preparing: { next: "ready", cta: "Proses", tone: "border-emerald-500/50 bg-emerald-500/10", dot: "bg-emerald-400" },
  // Biru: matang, tinggal diantar.
  ready: { next: "served", cta: "Orderan ready", tone: "border-blue-400/50 bg-blue-400/10", dot: "bg-blue-400" },
  served: { cta: "Sudah diantar", tone: "border-line bg-ink-2", dot: "bg-dim" },
};

const LABEL: Record<Ticket["status"], string> = {
  new: "Orderan diterima", preparing: "Proses", ready: "Orderan ready", served: "Sudah diantar",
};

export default function Kitchen() {
  const { a, dispatchA, tick } = useAdmin();
  void tick;
  const [station, setStation] = useState<"all" | "kitchen" | "bar">("all");

  const diStation = (t: Ticket) => station === "all" || t.station === station;
  /** Masih dikerjakan — di atas garis. */
  const jalan = a.tickets.filter((t) => diStation(t) && t.status !== "ready" && t.status !== "served")
    .sort((x, y) => x.at - y.at);
  /** Sudah matang / sudah diantar — di bawah garis, TIDAK dibuang. */
  const selesai = a.tickets.filter((t) => diStation(t) && (t.status === "ready" || t.status === "served"))
    .sort((x, y) => (y.readyAt ?? y.at) - (x.readyAt ?? x.at));

  return (
    <div className="pb-6">
      <div className="mb-3 flex items-center gap-2">
        {([["all", "Semua"], ["kitchen", "Dapur"], ["bar", "Bar"]] as const).map(([v, l]) => {
          const n = a.tickets.filter(
            (t) => t.status !== "ready" && t.status !== "served" && (v === "all" || t.station === v),
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
        <span className="ml-auto text-[11px] text-dim">{selesai.length} ready / diantar</span>
      </div>

      {jalan.length === 0 ? (
        <div className="rounded-2xl border border-line bg-ink-2 px-4 py-12 text-center">
          <div className="font-display text-2xl uppercase tracking-wide text-dim">Bersih</div>
          <p className="mt-1 text-sm text-dim">Tidak ada tiket menunggu.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {jalan.map((t) => <Kartu key={t.id} t={t} onLanjut={(s) => dispatchA({ t: "ticket", id: t.id, status: s })} />)}
          </AnimatePresence>
        </div>
      )}

      {selesai.length > 0 && (
        <section className="mt-6">
          {/* Garis pemisah yang diminta pemilik: yang sudah biru ada di
              bawahnya, tetap terbaca, tidak hilang dari layar. */}
          <div className="mb-3 flex items-center gap-3">
            <span className="h-px flex-1 bg-line-2" />
            <span className="font-display text-[11px] uppercase tracking-[0.18em] text-blue-300">
              Sudah ready · {selesai.length}
            </span>
            <span className="h-px flex-1 bg-line-2" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {selesai.map((t) => (
              <Kartu key={t.id} t={t} onLanjut={(s) => dispatchA({ t: "ticket", id: t.id, status: s })} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-dim">
        Tiket lebih dari 15 menit ditandai merah. Urutan selalu yang paling lama di atas —
        bukan yang paling gampang dimasak. Pesanan yang sudah ready tidak hilang dari layar:
        turun ke bawah garis supaya ketahuan kalau ada yang lupa diantar.
      </p>
    </div>
  );
}

function Kartu({ t, onLanjut }: { t: Ticket; onLanjut: (s: Ticket["status"]) => void }) {
  const f = FLOW[t.status];
  const sudah = t.status === "ready" || t.status === "served";
  const mins = Math.floor((Date.now() - t.at) / 60000);
  const late = mins >= 15 && !sudah;
  /** Lama memasak sebenarnya: dari masuk kasir sampai ready. */
  const masak = t.readyAt ? Math.max(0, Math.round((t.readyAt - t.at) / 60000)) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      className={`rounded-xl border p-3 ${f.tone} ${t.status === "served" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg uppercase leading-tight text-cream">
            {t.tableName}
          </div>
          {t.via && <div className="text-[11px] text-amber/90">{t.via}</div>}
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-dim">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${f.dot}`} />
            {t.station === "bar" ? "Bar" : "Dapur"} · {LABEL[t.status]}
          </div>
        </div>
        <div className={`shrink-0 text-right text-[13px] font-bold tabular-nums ${
          late ? "text-red-400" : "text-mute"
        }`}>
          {sudah ? (masak !== null ? `${masak}m` : "—") : `${mins}m`}
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-xl text-amber">{t.qty}×</span>
        <span className="text-[15px] leading-snug text-cream">{t.name}</span>
      </div>
      {t.variant && <div className="text-[12px] text-mute">{t.variant}</div>}
      {/* Catatan tamu ditonjolkan: inilah yang paling sering
          terlewat dan paling mahal kalau salah masak. */}
      {t.note && (
        <div className="mt-1 rounded-lg border border-amber/40 bg-amber/10 px-2 py-1 text-[12px] font-semibold leading-snug text-amber">
          {t.note}
        </div>
      )}

      {/* Dua jam yang diminta pemilik. Jam ready hanya muncul kalau memang
          sudah ada — tiket lama (sebelum 18 Okt 2026) tidak menyimpannya,
          dan menuliskan jam karangan untuk tiket lama lebih buruk daripada
          tidak menulis apa-apa. */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-dim">
        <span>Masuk kasir <span className="text-mute">{jam(t.at)}</span></span>
        {t.readyAt && <span>Ready <span className="text-blue-300">{jam(t.readyAt)}</span></span>}
      </div>

      {f.next && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onLanjut(f.next!)}
          className="mt-3 min-h-[46px] w-full rounded-xl bg-amber text-[15px] font-bold text-ink"
        >{f.cta}</motion.button>
      )}
    </motion.div>
  );
}
