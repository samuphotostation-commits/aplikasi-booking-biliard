import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, PageHeader } from "../components/UI";
import { Ball } from "../components/motion/Billiard";
import { MENU, type MenuItem } from "../data/menu";
import { TABLES, fmtHour } from "../data/venue";
import { useStore } from "../lib/store";
import { useAdmin, priceOf, runningOn } from "../lib/adminStore";
import { rupiah } from "../lib/core";

export default function MenuScreen() {
  const nav = useNavigate();
  const { state, dispatch, totals, cartCount } = useStore();
  const { a: venue } = useAdmin();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<MenuItem | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const secRefs = useRef<Record<string, HTMLElement | null>>({});

  // QR di meja membuka /menu?meja=T07 — pesanan otomatis ditujukan ke meja itu, dan
  // diikat ke tab yang sedang jalan di sana (tab ditutup → pilihan meja dilepas).
  const mejaParam = params.get("meja");
  useEffect(() => {
    if (mejaParam && TABLES.some((t) => t.id === mejaParam)) {
      dispatch({ t: "setFnb", mode: "meja", table: mejaParam, sessionId: runningOn(venue, mejaParam)?.id ?? null });
    }
  }, [mejaParam, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!q.trim()) return MENU;
    const s = q.toLowerCase();
    return MENU.map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(s)) }))
      .filter((c) => c.items.length > 0);
  }, [q]);

  const stockLeft = (id: string) => {
    const row = venue.stock.find((r) => r.itemId === id);
    return row && row.qty !== null ? row.qty : Infinity;
  };

  const qtyOf = (id: string) =>
    state.cart.filter((l) => l.itemId === id).reduce((n, l) => n + l.qty, 0);

  function add(item: MenuItem, variant?: string) {
    // Mesin menolak pembayaran yang melebihi stok; lebih baik dicegah di sini
    // daripada tamu sudah bayar lalu dananya harus dikembalikan.
    if (qtyOf(item.id) >= stockLeft(item.id)) return;
    dispatch({ t: "add", item, variant });
    setSheet(null);
    setFlash(item.id);
    setTimeout(() => setFlash(null), 700);
  }

  function onAddClick(item: MenuItem) {
    if (item.variant) setSheet(item);
    else add(item);
  }

  const { draft } = state;
  const bookingTable = draft.tableId && draft.startHour !== null ? TABLES.find((t) => t.id === draft.tableId) : null;
  const qrTable = !bookingTable && draft.fnbMode === "meja" && draft.fnbTable
    ? TABLES.find((t) => t.id === draft.fnbTable) : null;
  const qrRunning = qrTable ? !!runningOn(venue, qrTable.id) : false;

  return (
    <div className="pb-40">
      <PageHeader kicker="Smokehouse" title="Menu" sub="Pesan dari meja, sekalian booking, atau takeaway." />

      <div className="safe-t sticky top-0 z-20 border-b border-line bg-ink/95 px-5 py-3 backdrop-blur-md">
        <div className="mx-auto max-w-lg">
          {bookingTable && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2">
              <span className="flex-1 text-[12px] leading-snug text-cream">
                Pesanan ikut booking <strong>{bookingTable.name}</strong> · {fmtHour(draft.startHour!)}
              </span>
              <button onClick={() => dispatch({ t: "clearBooking" })}
                className="min-h-[32px] shrink-0 text-[11px] font-semibold text-amber underline underline-offset-4">
                Pesan makanan saja
              </button>
            </div>
          )}
          {qrTable && (
            <div className={`mb-2 rounded-xl border px-3 py-2 text-[12px] leading-snug ${
              qrRunning ? "border-emerald-500/40 bg-emerald-500/10 text-cream" : "border-amber/40 bg-amber/10 text-amber"
            }`}>
              Pesan untuk <strong>{qrTable.name}</strong> ·{" "}
              {qrRunning
                ? "meja sedang main, pesanan langsung ke dapur"
                : "meja belum dibuka kasir, minta kasir membuka meja dulu"}
            </div>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari menu…"
            aria-label="Cari menu"
            className="w-full rounded-xl border border-line bg-ink-2 px-4 py-2.5 text-cream
              placeholder:text-dim focus:border-amber focus:outline-none"
          />
          {!q && (
            <div className="no-bar -mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5">
              {MENU.map((c) => (
                <button
                  key={c.id}
                  onClick={() =>
                    secRefs.current[c.id]?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="min-h-[32px] shrink-0 rounded-full border border-line bg-ink-2 px-3
                    text-xs font-medium text-mute hover:border-amber hover:text-amber"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-lg px-5">
        {filtered.length === 0 && (
          <Card className="mt-6 px-4 py-10 text-center">
            <Ball n={8} size={34} className="mx-auto opacity-40" />
            <p className="mt-3 text-sm text-dim">Menu "{q}" tidak ketemu.</p>
          </Card>
        )}

        {filtered.map((cat) => (
          <section
            key={cat.id}
            ref={(el) => { secRefs.current[cat.id] = el; }}
            className="scroll-mt-32 pt-7"
          >
            {cat.kicker && (
              <div className="font-script text-xl leading-none text-amber">{cat.kicker}</div>
            )}
            <h2 className="mb-3 font-display text-2xl uppercase tracking-[0.05em] text-cream">
              {cat.name}
            </h2>

            <div className="space-y-2">
              {cat.items.map((it) => {
                const n = qtyOf(it.id);
                const habis = venue.soldOut.includes(it.id);
                const price = priceOf(venue, it.id);
                const left = stockLeft(it.id);
                const penuh = n >= left;
                return (
                  <Card key={it.id}
                    className={`relative flex items-center gap-3 overflow-hidden p-3 ${habis ? "opacity-55" : ""}`}>
                    <AnimatePresence>
                      {flash === it.id && (
                        <motion.span
                          className="absolute inset-0 bg-amber/15"
                          initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
                          transition={{ duration: 0.65 }}
                        />
                      )}
                    </AnimatePresence>

                    <div className="relative min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h3 className={`truncate text-[15px] font-semibold ${
                          habis ? "text-dim line-through" : "text-cream"
                        }`}>{it.name}</h3>
                        {habis && (
                          <span className="shrink-0 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px]
                            font-bold uppercase tracking-wider text-red-300">habis</span>
                        )}
                        {it.station === "bar" && (
                          <span className="shrink-0 rounded bg-ink-3 px-1.5 py-0.5 text-[9px]
                            uppercase tracking-wider text-dim">bar</span>
                        )}
                      </div>
                      {it.note && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-dim">{it.note}</p>
                      )}
                      {it.variant && (
                        <p className="mt-0.5 text-[11px] text-mute">{it.variant.label} tersedia</p>
                      )}
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-serif text-base font-bold text-amber">{rupiah(price)}</span>
                        {price !== it.price && (
                          <span className="font-serif text-[11px] text-dim line-through">{rupiah(it.price)}</span>
                        )}
                        {!habis && left !== Infinity && (left <= 5 || penuh) && (
                          <span className="text-[10px] text-amber/90">sisa {left}</span>
                        )}
                      </div>
                    </div>

                    <div className="relative shrink-0">
                      {habis ? (
                        <span className="block w-[92px] text-right text-[11px] leading-snug text-dim">
                          Sedang tidak tersedia
                        </span>
                      ) : n > 0 ? (
                        <div className="flex items-center gap-1.5 rounded-xl border border-amber bg-amber/10 p-1">
                          <button
                            onClick={() => {
                              const line = state.cart.find((l) => l.itemId === it.id);
                              if (line) dispatch({ t: "dec", key: line.key });
                            }}
                            aria-label={`Kurangi ${it.name}`}
                            className="h-8 w-8 rounded-lg text-lg font-bold text-amber"
                          >−</button>
                          <span className="min-w-[18px] text-center font-serif font-bold text-cream">{n}</span>
                          <button
                            onClick={() => onAddClick(it)}
                            disabled={penuh}
                            aria-label={`Tambah ${it.name}`}
                            className="h-8 w-8 rounded-lg text-lg font-bold text-amber disabled:opacity-30"
                          >+</button>
                        </div>
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => onAddClick(it)}
                          disabled={penuh}
                          aria-label={`Tambah ${it.name}`}
                          className="h-11 w-11 rounded-xl bg-amber text-xl font-bold text-ink disabled:opacity-30"
                        >+</motion.button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ── Sheet varian ────────────────────────────────── */}
      <AnimatePresence>
        {sheet && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSheet(null)}
            />
            <motion.div
              className="safe-b fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-line bg-ink-2 p-5"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              role="dialog" aria-modal="true" aria-label={`Pilihan untuk ${sheet.name}`}
            >
              <div className="mx-auto max-w-lg">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-2" />
                <h3 className="font-display text-xl uppercase tracking-wide text-cream">{sheet.name}</h3>
                <p className="mb-4 flex items-baseline gap-2">
                  <span className="font-serif text-lg font-bold text-amber">{rupiah(priceOf(venue, sheet.id))}</span>
                  {priceOf(venue, sheet.id) !== sheet.price && (
                    <span className="font-serif text-xs text-dim line-through">{rupiah(sheet.price)}</span>
                  )}
                </p>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
                  {sheet.variant!.label}
                </p>
                <div className="grid gap-2">
                  {sheet.variant!.options.map((o) => (
                    <button
                      key={o}
                      onClick={() => add(sheet, o)}
                      className="min-h-[48px] rounded-xl border border-line bg-ink px-4 text-left
                        text-[15px] text-cream hover:border-amber hover:text-amber"
                    >{o}</button>
                  ))}
                </div>
                <button
                  onClick={() => setSheet(null)}
                  className="mt-3 min-h-[44px] w-full text-sm text-dim"
                >Batal</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Bilah keranjang ─────────────────────────────── */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="safe-b fixed inset-x-0 bottom-[58px] z-20 border-t border-line bg-ink/95 px-5 py-3 backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <div className="flex-1">
                <div className="text-[11px] text-dim">{cartCount} item</div>
                <div className="font-serif text-xl font-bold text-amber">{rupiah(totals.grand)}</div>
              </div>
              <Button onClick={() => nav("/checkout")}>Lihat Pesanan</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
