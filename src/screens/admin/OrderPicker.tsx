import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MENU, type MenuItem } from "../../data/menu";
import { useAdmin, priceOf } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";

/* Kasir menambah makanan/minuman ke open bill yang sedang jalan.
   Pesanan langsung masuk tiket dapur/bar dan mengurangi stok. */

export default function OrderPicker({
  sessionId, onDone,
}: { sessionId: string; onDone: () => void }) {
  const { a, dispatchA } = useAdmin();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(MENU[0].id);
  const [pick, setPick] = useState<MenuItem | null>(null);
  const [draft, setDraft] = useState<Record<string, { item: MenuItem; qty: number; variant?: string }>>({});
  const sent = useRef(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return MENU.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(s));
    return MENU.find((c) => c.id === cat)?.items ?? [];
  }, [q, cat]);

  const stokOf = (id: string) => a.stock.find((r) => r.itemId === id);
  const keyOf = (id: string, v?: string) => (v ? `${id}::${v}` : id);

  function tambah(item: MenuItem, variant?: string) {
    const k = keyOf(item.id, variant);
    const st = stokOf(item.id);
    const sudah = Object.values(draft).filter((d) => d.item.id === item.id).reduce((n, d) => n + d.qty, 0);
    if (st?.qty !== null && st !== undefined && sudah >= st.qty) return; // jangan jual melebihi stok
    setDraft((d) => ({ ...d, [k]: { item, variant, qty: (d[k]?.qty ?? 0) + 1 } }));
    setPick(null);
  }

  function kurang(k: string) {
    setDraft((d) => {
      const cur = d[k];
      if (!cur) return d;
      if (cur.qty <= 1) { const { [k]: _, ...rest } = d; return rest; }
      return { ...d, [k]: { ...cur, qty: cur.qty - 1 } };
    });
  }

  function kirim() {
    // Ketuk ganda sebelum layar berganti tidak boleh mengirim pesanan dua kali.
    if (sent.current) return;
    sent.current = true;
    for (const [k, d] of Object.entries(draft)) {
      dispatchA({
        t: "addFnb", sessionId, name: d.item.name, station: d.item.station,
        line: { key: `${k}-${Date.now()}`, itemId: d.item.id, qty: d.qty, variant: d.variant },
      });
    }
    onDone();
  }

  const lines = Object.entries(draft);
  // Perkiraan memakai harga terkini (bisa diubah superadmin); angka final,
  // termasuk minuman gratis Paket Siang, dihitung mesin.
  const total = lines.reduce((n, [, d]) => n + priceOf(a, d.item.id) * d.qty, 0);
  const sesi = a.sessions.find((x) => x.id === sessionId);

  return (
    <div className="mt-4 space-y-3">
      {(sesi?.freeDrinks ?? 0) > 0 && (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] leading-snug text-emerald-300">
          Sisa {sesi!.freeDrinks} minuman gratis Paket Siang — otomatis dipakai untuk minuman dingin.
        </p>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu…"
        className="w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-cream
          placeholder:text-dim focus:border-amber focus:outline-none" />

      {!q && (
        <div className="no-bar -mx-5 flex gap-1.5 overflow-x-auto px-5">
          {MENU.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
              className={`min-h-[34px] shrink-0 rounded-full border px-3 text-[12px] ${
                cat === c.id ? "border-amber bg-amber text-ink" : "border-line bg-ink text-mute"
              }`}>{c.name}</button>
          ))}
        </div>
      )}

      <div className="max-h-[38vh] space-y-1.5 overflow-y-auto pr-1">
        {list.map((it) => {
          const habis = a.soldOut.includes(it.id);
          const st = stokOf(it.id);
          return (
            <button key={it.id} disabled={habis}
              onClick={() => (it.variant ? setPick(it) : tambah(it))}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-ink
                px-3 py-2.5 text-left disabled:opacity-40">
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[14px] ${habis ? "text-dim line-through" : "text-cream"}`}>
                  {it.name}
                </div>
                <div className="text-[11px] text-dim">
                  {rupiah(priceOf(a, it.id))}
                  {habis && " · habis"}
                  {!habis && st?.qty !== null && st !== undefined && ` · sisa ${st.qty}`}
                </div>
              </div>
              {!habis && <span className="text-xl font-bold text-amber">+</span>}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {pick && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-xl border border-amber/40 bg-amber/5 p-3">
            <div className="mb-1.5 text-[12px] text-cream">{pick.name} — {pick.variant!.label}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {pick.variant!.options.map((o) => (
                <button key={o} onClick={() => tambah(pick, o)}
                  className="min-h-[42px] rounded-lg border border-line bg-ink text-[13px] text-cream">
                  {o}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {lines.length > 0 && (
        <div className="rounded-xl border border-line">
          {lines.map(([k, d]) => (
            <div key={k} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-[13px] text-cream">
                {d.item.name}{d.variant ? ` (${d.variant})` : ""}
              </span>
              <button onClick={() => kurang(k)} className="h-7 w-7 rounded-lg border border-line text-amber">−</button>
              <span className="w-5 text-center font-serif text-sm text-cream">{d.qty}</span>
              <button onClick={() => tambah(d.item, d.variant)} className="h-7 w-7 rounded-lg border border-line text-amber">+</button>
            </div>
          ))}
          <div className="flex items-center justify-between bg-amber/10 px-3 py-2.5">
            <span className="text-[13px] text-cream">{lines.reduce((n, [, d]) => n + d.qty, 0)} item</span>
            <span className="font-serif text-base font-bold text-amber">{rupiah(total)}</span>
          </div>
        </div>
      )}

      <button onClick={kirim} disabled={lines.length === 0}
        className="min-h-[50px] w-full rounded-xl bg-amber font-semibold text-ink disabled:opacity-40">
        Kirim ke Dapur &amp; Tambah ke Bill
      </button>
    </div>
  );
}
