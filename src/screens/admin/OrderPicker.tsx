import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MenuItem } from "../../data/menu";
import {
  useAdmin, priceOf, kategoriJual, settlementOf, lineValue, paketAktif, itemOf,
} from "../../lib/adminStore";
import { venueDari } from "../../data/venue";
import { rupiah as rp } from "../../lib/core";
import { rupiah } from "../../lib/core";
import { FOTO_KATEGORI, FOTO_ITEM } from "../../data/fotoMenu";

/* Kasir menambah makanan/minuman ke open bill yang sedang jalan.
   Pesanan langsung masuk tiket dapur/bar dan mengurangi stok. */

export default function OrderPicker({
  sessionId, onDone,
}: { sessionId: string; onDone: () => void }) {
  const { a, dispatchA } = useAdmin();
  const MENU = kategoriJual(a, { staf: true });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(MENU[0].id);
  const [pick, setPick] = useState<MenuItem | null>(null);
  const [draft, setDraft] = useState<Record<string, { item: MenuItem; qty: number; variant?: string; note?: string }>>({});
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
        line: {
          key: `${k}-${Date.now()}`, itemId: d.item.id, qty: d.qty, variant: d.variant,
          ...(d.note?.trim() ? { note: d.note.trim() } : {}),
        },
      });
    }
    onDone();
  }

  const lines = Object.entries(draft);
  // Perkiraan memakai harga terkini (bisa diubah superadmin); angka final,
  // termasuk minuman gratis Paket Siang, dihitung mesin.
  const total = lines.reduce((n, [, d]) => n + priceOf(a, d.item.id) * d.qty, 0);
  const sesi = a.sessions.find((x) => x.id === sessionId);
  /** Yang SUDAH ada di bill meja ini — kasir selalu ditanya "sekarang berapa?". */
  const sudahDiBill = sesi
    ? (sesi.source === "walkin" ? settlementOf(sesi, a).billiard : (sesi.extraTable ?? 0))
      + sesi.fnb.reduce((n, l) => n + lineValue(l), 0)
    : 0;

  /** Foto per HIDANGAN. Kosong sampai pemilik mengirim fotonya satu-satu. */
  const fotoItem = (id: string) => FOTO_ITEM[id];
  /** Foto kategori yang sedang dibuka — satu spanduk, bukan diulang tiap petak. */
  const fotoKategori = q.trim() ? undefined : FOTO_KATEGORI[cat];
  const namaKategori = MENU.find((c) => c.id === cat)?.name ?? "";

  /**
   * PAKET YANG BISA DIJUAL DI MEJA INI.
   *
   * Hanya paket TANPA jam main: paket bersewa waktu adalah blok meja, bukan
   * baris bill — menjualnya di meja yang sudah jalan akan menagih harga
   * bloknya tanpa memberi waktu mainnya. Mesin menolaknya juga; di sini
   * tombolnya memang tidak ditawarkan, supaya kasir tidak menekan sesuatu
   * yang akan ditolak diam-diam.
   */
  const paketMeja = sesi
    ? paketAktif(a).filter((pk) => pk.hours === 0 && (pk.venue ?? "spl") === venueDari(sesi.tableId))
    : [];

  return (
    <div className="mt-4 space-y-3">
      {paketMeja.length > 0 && (
        <section className="rounded-xl border border-amber/40 bg-amber/5 p-2.5">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber">
            Paket · langsung masuk bill
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {paketMeja.map((pk) => (
              <button key={pk.id}
                onClick={() => dispatchA({ t: "addPaket", sessionId, paketId: pk.id })}
                className="rounded-lg border border-line bg-ink p-2 text-left hover:border-amber">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] text-cream">{pk.name}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-amber">{rp(pk.price)}</span>
                </div>
                <div className="truncate text-[11px] text-dim">
                  {(pk.isi ?? []).map((x) => `${x.qty}× ${itemOf(a, x.itemId)?.name ?? x.itemId}`).join(" · ")
                    || "tanpa isi"}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-dim">
            Sekali ketuk: harga paket masuk bill, isinya masuk tiket dapur, dan stoknya berkurang.
          </p>
        </section>
      )}

      {(sesi?.freeDrinks ?? 0) > 0 && (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] leading-snug text-emerald-300">
          Sisa {sesi!.freeDrinks} minuman gratis Paket Siang — otomatis dipakai untuk minuman dingin.
        </p>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu…"
        className="w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-cream
          placeholder:text-dim focus:border-amber focus:outline-none" />

      {/* SEMUA KATEGORI KELIHATAN SEKALIGUS — dibungkus ke baris berikutnya,
          bukan digeser menyamping.

          Laporan pemilik 19 Okt 2026: stripnya tidak bisa digeser, jadi
          kategori di sebelah kanan ("Smokehouse Bebek", "Beef Ribs", minuman)
          tidak pernah terjangkau. Penyebabnya `overflow-x-auto` dengan
          scrollbar disembunyikan: di layar kasir yang dipakai mouse, tidak ada
          yang bisa diseret dan tidak ada isyarat bahwa masih ada isinya di
          sebelah kanan.

          Dibungkus, bukan diberi tombol panah: di kasir satu ketukan lebih
          murah daripada dua, dan tinggi layarnya cukup. */}
      {!q && (
        <div className="flex flex-wrap gap-1.5">
          {MENU.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
              className={`min-h-[34px] rounded-full border px-3 text-[12px] ${
                cat === c.id ? "border-amber bg-amber text-ink" : "border-line bg-ink text-mute"
              }`}>{c.name}</button>
          ))}
        </div>
      )}

      {fotoKategori && (
        <div className="relative overflow-hidden rounded-xl border border-line">
          <img src={fotoKategori} alt="" aria-hidden="true" className="h-20 w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-3 pb-1.5 font-display text-lg uppercase tracking-wide text-cream">
            {namaKategori}
          </div>
        </div>
      )}

      <div className="max-h-[42vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {list.map((it) => {
            const habis = a.soldOut.includes(it.id);
            const st = stokOf(it.id);
            const sudah = Object.values(draft).filter((d) => d.item.id === it.id).reduce((n, d) => n + d.qty, 0);
            const gambar = fotoItem(it.id);
            return (
              <button key={it.id} disabled={habis}
                onClick={() => (it.variant ? setPick(it) : tambah(it))}
                className={`relative overflow-hidden rounded-xl border text-left disabled:opacity-40 ${
                  sudah > 0 ? "border-amber bg-amber/10" : "border-line bg-ink"
                }`}>
                {gambar && (
                  <img src={gambar} alt="" aria-hidden="true" loading="lazy" className="h-16 w-full object-cover" />
                )}
                <div className="p-2">
                  <div className={`line-clamp-2 min-h-[2.1em] text-[12px] leading-tight ${
                    habis ? "text-dim line-through" : "text-cream"
                  }`}>{it.name}</div>
                  <div className="mt-0.5 text-[11px] text-amber">
                    {rupiah(priceOf(a, it.id))}
                  </div>
                  <div className="text-[10px] text-dim">
                    {habis ? "habis" : st?.qty !== null && st !== undefined ? `sisa ${st.qty}` : "\u00a0"}
                  </div>
                </div>
                {sudah > 0 && (
                  <span className="absolute right-1.5 top-1.5 min-w-[22px] rounded-full bg-amber px-1.5
                    text-center text-[12px] font-bold leading-[22px] text-ink">
                    {sudah}
                  </span>
                )}
              </button>
            );
          })}
        </div>
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
            <div key={k} className="border-b border-line px-3 py-2 last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-cream">
                  {d.item.name}{d.variant ? ` (${d.variant})` : ""}
                </span>
                <button onClick={() => kurang(k)} className="h-7 w-7 rounded-lg border border-line text-amber">−</button>
                <span className="w-5 text-center font-serif text-sm text-cream">{d.qty}</span>
                <button onClick={() => tambah(d.item, d.variant)} className="h-7 w-7 rounded-lg border border-line text-amber">+</button>
              </div>
              {/* SMH-3: catatan per baris, diketik bebas — "ayam bagian dada,
                  pedas". Ikut tercetak di tiket dapur, bukan cuma di bill. */}
              <input
                value={d.note ?? ""}
                onChange={(e) => setDraft((x) => ({ ...x, [k]: { ...x[k], note: e.target.value.slice(0, 120) } }))}
                placeholder="Catatan (mis. bagian dada, pedas)"
                className="mt-1 min-h-[34px] w-full rounded-lg border border-line bg-ink px-2 text-[12px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            </div>
          ))}
          <div className="space-y-0.5 bg-amber/10 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-cream">{lines.reduce((n, [, d]) => n + d.qty, 0)} item baru</span>
              <span className="font-serif text-base font-bold text-amber">{rupiah(total)}</span>
            </div>
            {sudahDiBill > 0 && (
              <>
                <div className="flex items-center justify-between text-[11px] text-dim">
                  <span>Sudah di bill meja ini</span>
                  <span className="tabular-nums">{rupiah(sudahDiBill)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-amber/20 pt-0.5 text-[12px] text-cream">
                  <span>Perkiraan bill jadi</span>
                  <span className="font-serif tabular-nums">{rupiah(sudahDiBill + total)}</span>
                </div>
              </>
            )}
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
