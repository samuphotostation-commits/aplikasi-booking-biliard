import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MENU, type MenuItem } from "../../data/menu";
import { useAdmin, priceOf } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";

/* Ketersediaan menu + stok barang.

   Sold-out bisa di-toggle KARYAWAN — yang tahu stok habis duluan adalah
   orang di lantai; kalau harus menunggu superadmin, menu habis tetap terjual.
   Angka stok hanya bisa diubah SUPERADMIN — itu nilai persediaan.

   Barang berstok akan otomatis ditandai habis saat mencapai 0 (lihat
   reducer `addFnb`), jadi kasir tidak perlu ingat. */

export default function MenuAdmin() {
  const { a, dispatchA, allow } = useAdmin();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"semua" | "habis" | "stok">("semua");

  const stokOf = (id: string) => a.stock.find((r) => r.itemId === id);

  const cats = useMemo(() => {
    const s = q.trim().toLowerCase();
    return MENU.map((c) => ({
      ...c,
      items: c.items.filter((i) => {
        if (s && !i.name.toLowerCase().includes(s)) return false;
        if (tab === "habis") return a.soldOut.includes(i.id);
        if (tab === "stok") return !!stokOf(i.id);
        return true;
      }),
    })).filter((c) => c.items.length > 0);
  }, [q, tab, a.soldOut, a.stock]);

  const habisCount = a.soldOut.length;
  const menipis = a.stock.filter((r) => r.qty !== null && r.qty <= r.lowAt);

  return (
    <div className="pb-6">
      {menipis.length > 0 && (
        <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/8 p-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-300">
            Stok menipis · {menipis.length}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {menipis.map((r) => {
              const it = MENU.flatMap((c) => c.items).find((i) => i.id === r.itemId);
              return (
                <span key={r.itemId}
                  className="rounded-lg border border-red-500/30 bg-ink/50 px-2 py-1 text-[11px] text-cream">
                  {it?.name ?? r.itemId} <span className="text-red-300">· {r.qty}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="sticky top-[104px] z-20 -mx-4 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur-md">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cari menu…" aria-label="Cari menu"
          className="w-full rounded-xl border border-line bg-ink-2 px-4 py-2.5 text-cream
            placeholder:text-dim focus:border-amber focus:outline-none" />
        <div className="mt-2 flex gap-2">
          {([["semua", "Semua"], ["habis", `Habis · ${habisCount}`], ["stok", "Berstok"]] as const)
            .map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} aria-pressed={tab === v}
                className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors ${
                  tab === v ? "bg-amber text-ink" : "bg-ink-2 text-mute"
                }`}>{l}</button>
            ))}
        </div>
      </div>

      <div className="mt-4 space-y-5">
        {cats.map((c) => (
          <section key={c.id}>
            <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-cream">{c.name}</h2>
            <div className="space-y-1.5">
              {c.items.map((it) => {
                const off = a.soldOut.includes(it.id);
                const st = stokOf(it.id);
                const low = st?.qty !== null && st !== undefined && st.qty <= st.lowAt;
                return (
                  <motion.div key={it.id} layout
                    className={`rounded-xl border p-3 ${
                      off ? "border-red-500/40 bg-red-500/8" : "border-line bg-ink-2"
                    }`}>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => dispatchA({ t: "toggleSoldOut", itemId: it.id, name: it.name })}
                        disabled={!allow("tandaiHabis")}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50">
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-[14px] ${off ? "text-dim line-through" : "text-cream"}`}>
                            {it.name}
                          </div>
                          <div className="text-[11px] text-dim">
                            {rupiah(priceOf(a, it.id))}
                            {priceOf(a, it.id) !== it.price && <span className="text-amber/80"> (buku menu {rupiah(it.price)})</span>}
                            {" · "}{it.station === "bar" ? "Bar" : "Dapur"}
                            {st?.qty !== null && st !== undefined && (
                              <span className={low ? " text-red-300" : " text-mute"}>
                                {" · sisa "}{st.qty}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`flex h-7 w-[52px] shrink-0 items-center rounded-full px-0.5
                          transition-colors ${off ? "bg-red-500/70" : "bg-emerald-500/70"}`}>
                          <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 34 }}
                            className={`h-6 w-6 rounded-full bg-cream ${off ? "ml-auto" : ""}`} />
                        </span>
                        <span className={`w-11 shrink-0 text-right text-[10px] font-bold uppercase
                          tracking-wider ${off ? "text-red-300" : "text-emerald-400"}`}>
                          {off ? "Habis" : "Ada"}
                        </span>
                      </button>
                    </div>

                    {/* Harga menu — superadmin saja */}
                    {allow("ubahTarif") && <PriceEditor item={it} />}

                    {/* Pengelolaan stok — superadmin saja */}
                    {allow("kelolaStok") && (
                      <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
                        {st && st.qty !== null ? (
                          <>
                            <span className="text-[11px] text-dim">Stok</span>
                            <button onClick={() => dispatchA({ t: "addStock", itemId: it.id, delta: -1 })}
                              className="h-8 w-8 rounded-lg border border-line text-amber">−</button>
                            <span className="min-w-[36px] text-center font-serif text-sm font-bold text-cream">
                              {st.qty}
                            </span>
                            <button onClick={() => dispatchA({ t: "addStock", itemId: it.id, delta: 1 })}
                              className="h-8 w-8 rounded-lg border border-line text-amber">+</button>
                            <button onClick={() => dispatchA({ t: "addStock", itemId: it.id, delta: 12 })}
                              className="h-8 rounded-lg border border-line px-2 text-[11px] text-mute">+12</button>
                            <button onClick={() => dispatchA({ t: "setStock", itemId: it.id, qty: null })}
                              className="ml-auto text-[11px] text-dim underline underline-offset-2">
                              lepas
                            </button>
                          </>
                        ) : (
                          <button onClick={() => dispatchA({ t: "setStock", itemId: it.id, qty: 24 })}
                            className="text-[11px] text-dim underline underline-offset-2">
                            Lacak stok barang ini
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}

        {cats.length === 0 && (
          <div className="rounded-xl border border-line bg-ink-2 px-4 py-10 text-center text-sm text-dim">
            Tidak ada menu yang cocok.
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-dim">
        Barang berstok otomatis ditandai habis saat mencapai 0, dan tersedia lagi
        begitu stoknya diisi. Masakan dapur tidak dilacak stoknya — cukup
        ditandai habis manual.
      </p>
      {allow("ubahTarif") && (
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Perubahan harga langsung tampil di HP pelanggan dan kasir, tapi hanya berlaku untuk
          pesanan baru. Pesanan yang sudah masuk tetap memakai harga saat dipesan.
        </p>
      )}
    </div>
  );
}

/** Editor harga per menu. Nilai dikirim sebagai niat; mesin yang memvalidasi & mencatat. */
function PriceEditor({ item }: { item: MenuItem }) {
  const { a, dispatchA } = useAdmin();
  const current = priceOf(a, item.id);
  const [value, setValue] = useState(String(current));
  useEffect(() => { setValue(String(current)); }, [current]);
  const n = Math.round(Number(value));
  const changed = Number.isFinite(n) && n > 0 && n !== current;

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
      <span className="text-[11px] text-dim">Harga</span>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-ink px-2">
        <span className="text-[11px] text-dim">Rp</span>
        <input type="number" inputMode="numeric" min={500} step={500} value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Harga ${item.name}`}
          className="h-8 w-[84px] bg-transparent text-right font-serif text-sm tabular-nums text-cream focus:outline-none" />
      </div>
      <button disabled={!changed}
        onClick={() => dispatchA({ t: "setMenuPrice", itemId: item.id, price: n })}
        className="h-8 rounded-lg bg-amber px-3 text-[11px] font-bold text-ink disabled:opacity-30">
        Simpan
      </button>
      {current !== item.price && (
        <button onClick={() => dispatchA({ t: "setMenuPrice", itemId: item.id, price: item.price })}
          className="ml-auto text-[11px] text-dim underline underline-offset-2">
          Kembalikan
        </button>
      )}
    </div>
  );
}
