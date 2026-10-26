/**
 * ANTAR — hidangan yang sudah matang dan menunggu diambil dari dapur.
 *
 * Temuan audit 21 Okt 2026, dilaporkan pemilik: *"ketika masuk ke dapur dan
 * orderan di proses di dapur dan masuk ke pengerjaan makanan dan selesai, ini
 * alurnya tidak tau kemana lagi. Jadi harusnya ada tampilan khusus
 * waiters/cashier untuk informasi bahwa menu ini sudah ready dan selesai dan
 * bisa diambil dari kitchen dan diantar ke customer."*
 *
 * Yang hilang memang satu mata rantai, dan letaknya persis di antara dua
 * orang: dapur menandai READY di layarnya sendiri, lalu tidak ada apa pun
 * yang memberitahu pramusaji. Satu-satunya tombol "Sudah diantar" ada di
 * layar DAPUR — orang yang tidak pernah tahu kapan makanannya sampai di meja.
 *
 * Layar ini dibuat untuk orang yang berjalan, bukan untuk yang duduk:
 *
 *   DIKELOMPOKKAN PER MEJA, bukan per hidangan. Pramusaji mengambil satu
 *     nampan untuk satu meja; daftar per hidangan membuatnya bolak-balik.
 *   YANG PALING LAMA MENUNGGU DI ATAS, dengan menitnya. Makanan yang dingin
 *     di meja saji adalah keluhan yang tidak pernah sampai ke pemilik.
 *   SATU TOMBOL BESAR PER MEJA. Tangannya sedang memegang piring.
 */
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdmin, siapDiantar } from "../../lib/adminStore";
import { VENUE_LABEL } from "../../data/venue";
import { useVenueAktif } from "../../lib/venueAktif";
import { jam } from "./AdminShell";
import type { Ticket } from "../../data/live";

export default function Antar() {
  const { a, dispatchA, tick } = useAdmin();
  void tick;                       // menit tunggu ikut berdetak
  const venue = useVenueAktif();

  /** Dikelompokkan per meja; meja dengan tunggu terlama lebih dulu. */
  const perMeja = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    for (const t of siapDiantar(a, venue)) {
      const arr = m.get(t.tableName);
      if (arr) arr.push(t); else m.set(t.tableName, [t]);
    }
    return [...m.entries()]
      .map(([meja, isi]) => ({
        meja, isi,
        // Menunggu dihitung sejak MATANG, bukan sejak dipesan: yang diukur di
        // sini berapa lama hidangan tergeletak di meja saji.
        sejak: Math.min(...isi.map((t) => t.readyAt ?? t.at)),
      }))
      .sort((p, q) => p.sejak - q.sejak);
  }, [a, venue]);

  const now = Date.now();

  return (
    <div className="space-y-4 pb-6">
      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Siap diantar · {VENUE_LABEL[venue]}
        </h2>
        <p className="text-[11px] leading-relaxed text-dim">
          Dapur menandai hidangan READY; di sinilah pramusaji melihatnya. Tekan tombolnya
          setelah benar-benar sampai di meja — itu yang membuat hidangannya hilang dari daftar
          ini dan dari layar dapur.
        </p>
      </section>

      {perMeja.length === 0 ? (
        <div className="rounded-2xl border border-line bg-ink-2 px-4 py-10 text-center">
          <div className="font-display text-xl text-dim">Tidak ada yang menunggu</div>
          <p className="mt-1 text-[12px] text-dim">
            Semua hidangan yang matang sudah diantar.
          </p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {perMeja.map(({ meja, isi, sejak }) => {
            const menit = Math.floor((now - sejak) / 60_000);
            /* Lebih dari 5 menit di meja saji: makanan mulai dingin. Angkanya
               sengaja rendah — ini bukan peringatan keterlambatan dapur, tapi
               pengingat bahwa hidangannya sudah selesai dan menunggu kaki. */
            const lama = menit >= 5;
            return (
              <motion.section key={meja} layout
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                className={`overflow-hidden rounded-2xl border ${
                  lama ? "border-amber bg-amber/10" : "border-blue-400/50 bg-blue-400/5"
                }`}>
                <div className="flex items-baseline justify-between gap-2 px-4 pt-3">
                  <span className="font-display text-2xl uppercase leading-none text-cream">{meja}</span>
                  <span className={`text-[13px] font-bold tabular-nums ${lama ? "text-amber" : "text-mute"}`}>
                    menunggu {menit}m
                  </span>
                </div>

                <ul className="mt-2 space-y-1 px-4">
                  {isi.map((t) => (
                    <li key={t.id} className="flex items-baseline gap-2">
                      <span className="font-display text-lg leading-none text-amber">{t.qty}×</span>
                      <span className="min-w-0 flex-1 text-[14px] leading-snug text-cream">
                        {t.name}{t.variant ? ` (${t.variant})` : ""}
                        {t.note && <span className="block text-[11px] text-amber/90">{t.note}</span>}
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-dim">
                        {t.station === "bar" ? "Bar" : "Dapur"} · {jam(t.readyAt ?? t.at)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Satu tombol untuk seluruh meja: pramusaji membawa satu nampan,
                    bukan satu piring per ketukan. */}
                <button
                  onClick={() => { for (const t of isi) dispatchA({ t: "ticket", id: t.id, status: "served" }); }}
                  className="mt-3 min-h-[52px] w-full bg-amber text-[15px] font-bold text-ink">
                  Sudah diantar ke {meja} · {isi.reduce((n, t) => n + t.qty, 0)} porsi
                </button>
              </motion.section>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}
