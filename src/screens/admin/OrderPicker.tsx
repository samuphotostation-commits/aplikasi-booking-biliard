import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MenuItem } from "../../data/menu";
import {
  useAdmin, priceOf, kategoriJual, complimentMeja, settlementOf, lineValue, paketAktif, itemOf,
} from "../../lib/adminStore";
import { jenisCompliment, venueDari } from "../../data/venue";
import { rupiah as rp } from "../../lib/core";
import { rupiah } from "../../lib/core";
import { FOTO_ITEM } from "../../data/fotoMenu";
import PilihMenu from "./PilihMenu";

/* Kasir menambah makanan/minuman ke open bill yang sedang jalan.
   Pesanan langsung masuk tiket dapur/bar dan mengurangi stok. */

/** Catatan yang paling sering diminta tamu — satu ketukan, ikut tercetak di kertas checker. */
export const CATATAN_CEPAT = ["Pedas", "Tidak pedas", "Normal", "Tanpa es", "Es sedikit"] as const;
/** Pilihan yang saling meniadakan: memilih satu membuang yang lain. */
const LAWAN_CATATAN: Record<string, string[]> = {
  "pedas": ["tidak pedas", "normal"],
  "tidak pedas": ["pedas", "normal"],
  "normal": ["pedas", "tidak pedas"],
  "tanpa es": ["es sedikit"],
  "es sedikit": ["tanpa es"],
};

export default function OrderPicker({
  sessionId, onDone, alur = false, onLewati,
}: {
  sessionId: string; onDone: () => void;
  /**
   * ALUR BERTAHAP (pemilik 15 Nov 2026): MENU → PESANAN → BILL, satu langkah
   * per layar, layar hampir penuh. Dipakai panel meja sesudah meja dibuka.
   */
  alur?: boolean;
  /** Tombol "Lewati" di langkah Menu — tamu belum mau pesan, langsung ke bill. */
  onLewati?: () => void;
}) {
  const { a, dispatchA } = useAdmin();
  // Hanya menu yang dijual di venue meja ini (menu khusus venue sebelah disembunyikan).
  const vMeja = venueDari(a.sessions.find((x) => x.id === sessionId)?.tableId ?? "");
  const MENU = kategoriJual(a, { staf: true, venue: vMeja });
  const [pick, setPick] = useState<MenuItem | null>(null);
  const [draft, setDraft] = useState<Record<string, { item: MenuItem; qty: number; variant?: string; note?: string }>>({});
  const sent = useRef(false);
  const [langkah, setLangkah] = useState<"menu" | "pesanan">("menu");


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

  /** Tambah satu porsi ke baris draf yang SUDAH ada (termasuk baris pisahan). */
  function tambahBaris(k: string) {
    const d = draft[k];
    if (!d) return;
    const st = stokOf(d.item.id);
    const sudah = Object.values(draft).filter((x) => x.item.id === d.item.id).reduce((n, x) => n + x.qty, 0);
    if (st?.qty !== null && st !== undefined && sudah >= st.qty) return;
    setDraft((x) => ({ ...x, [k]: { ...x[k], qty: x[k].qty + 1 } }));
  }

  /**
   * PISAH SATU PORSI ke baris sendiri — supaya dua nasi goreng bisa dicatat
   * "1 pedas, 1 tidak pedas". Tanpa ini catatan berlaku untuk seluruh jumlah.
   */
  function pisah(k: string) {
    setDraft((x) => {
      const cur = x[k];
      if (!cur || cur.qty < 2) return x;
      let i = 2;
      while (x[`${k}#${i}`]) i++;
      return { ...x, [k]: { ...cur, qty: cur.qty - 1 }, [`${k}#${i}`]: { item: cur.item, variant: cur.variant, qty: 1 } };
    });
  }

  /** Tombol cepat: ketuk sekali menambah, ketuk lagi membuang. Pedas & tidak pedas saling meniadakan. */
  function ketukCatatan(k: string, label: string) {
    setDraft((x) => {
      const cur = x[k];
      if (!cur) return x;
      const bagian = (cur.note ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const ada = bagian.some((b) => b.toLowerCase() === label.toLowerCase());
      const lawan = LAWAN_CATATAN[label.toLowerCase()] ?? [];
      const sisa = bagian.filter((b) => b.toLowerCase() !== label.toLowerCase() && !lawan.includes(b.toLowerCase()));
      const note = (ada ? sisa : [...sisa, label]).join(", ").slice(0, 120);
      return { ...x, [k]: { ...cur, note } };
    });
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

  /** Petak satu menu — sama di tata letak sempit maupun lebar. */
  const petak = (it: MenuItem) => {
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
          };

  const pilihMenu = (
    <PilihMenu menu={MENU} tile={petak}
      tinggi={alur ? "" : "max-h-[42vh]"}
      kolom={alur ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" : "grid-cols-2 sm:grid-cols-3"} />
  );

  const blokAtas = (<>
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
  </>);
  const blokVarian = (
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

  );
  const blokDaftar = (<>
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
                <button onClick={() => tambahBaris(k)} className="h-7 w-7 rounded-lg border border-line text-amber">+</button>
              </div>
              {/* Tombol cepat catatan dapur — permintaan staf Smokehouse 14 Nov 2026. */}
              <div className="mt-1 flex flex-wrap gap-1">
                {CATATAN_CEPAT.map((c) => {
                  const on = (d.note ?? "").split(",").some((b) => b.trim().toLowerCase() === c.toLowerCase());
                  return (
                    <button key={c} onClick={() => ketukCatatan(k, c)} aria-pressed={on}
                      className={`min-h-[30px] rounded-full border px-2.5 text-[11px] font-semibold ${
                        on ? "border-amber bg-amber text-ink" : "border-line bg-ink text-mute"
                      }`}>{c}</button>
                  );
                })}
                {d.qty > 1 && (
                  <button onClick={() => pisah(k)}
                    title="Pisahkan 1 porsi supaya bisa diberi catatan berbeda"
                    className="min-h-[30px] rounded-full border border-dashed border-line-2 px-2.5 text-[11px] text-dim hover:border-amber hover:text-amber">
                    Pisah 1 porsi
                  </button>
                )}
              </div>
              {/* SMH-3: catatan per baris, diketik bebas — "ayam bagian dada,
                  pedas". Ikut tercetak di tiket dapur, bukan cuma di bill. */}
              <input
                value={d.note ?? ""}
                onChange={(e) => setDraft((x) => ({ ...x, [k]: { ...x[k], note: e.target.value.slice(0, 120) } }))}
                placeholder="Catatan lain (mis. bagian dada, saus dipisah)"
                className="mt-1 min-h-[34px] w-full rounded-lg border border-line bg-ink px-2 text-[12px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            </div>
          ))}
          <div className="space-y-0.5 bg-amber/10 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-cream">{lines.reduce((n, [, d]) => n + d.qty, 0)} item baru</span>
              {sesi && complimentMeja(a, sesi.tableId) ? (
                // Meja compliment: mesin menjadikannya Rp 0 — layar tidak boleh menyebut angka lain.
                <span className="text-right font-serif text-base font-bold text-sky-200">
                  Rp 0 <span className="block text-[10px] font-normal text-dim">compliment · nilai {rupiah(total)}</span>
                </span>
              ) : (
                <span className="font-serif text-base font-bold text-amber">{rupiah(total)}</span>
              )}
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

  </>);
  const tombolKirim = (
      <button onClick={kirim} disabled={lines.length === 0}
        className="min-h-[50px] w-full rounded-xl bg-amber font-semibold text-ink disabled:opacity-40">
        Kirim ke Checker &amp; Tambah ke Bill
      </button>
  );
  const nItem = lines.reduce((n, [, d]) => n + d.qty, 0);

  if (alur) {
    const LANGKAH = [["buka", "Buka meja"], ["menu", "Menu"], ["pesanan", "Pesanan"], ["bill", "Bill"]] as const;
    const ke = LANGKAH.findIndex(([k]) => k === langkah);
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* PENUNJUK LANGKAH — kasir selalu tahu sedang di mana dan apa berikutnya. */}
        <ol className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Langkah">
          {LANGKAH.map(([k, l], i) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                i < ke ? "bg-emerald-500/80 text-ink" : i === ke ? "bg-amber text-ink" : "bg-ink text-dim"
              }`}>{i < ke ? "✓" : i + 1}</span>
              <span className={i === ke ? "font-semibold text-cream" : "text-dim"}>{l}</span>
              {i < LANGKAH.length - 1 && <span className="px-1 text-dim">→</span>}
            </li>
          ))}
        </ol>

        {langkah === "menu" ? (<>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {blokAtas}
            {pilihMenu}
            {blokVarian}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-ink px-3 py-2.5">
            <div className="min-w-0 flex-1 text-[13px]">
              {nItem > 0
                ? <><span className="font-semibold text-cream">{nItem} item dipilih</span>
                    <span className="ml-2 font-serif text-amber">{rupiah(total)}</span></>
                : <span className="text-dim">Ketuk menu untuk menambah pesanan.</span>}
            </div>
            {onLewati && (
              <button onClick={onLewati}
                className="min-h-[46px] rounded-xl border border-line px-4 text-[13px] text-mute hover:text-cream">
                {nItem > 0 ? "Batal, ke bill" : "Lewati, ke bill"}
              </button>
            )}
            <button onClick={() => setLangkah("pesanan")} disabled={nItem === 0}
              className="min-h-[46px] rounded-xl bg-amber px-5 text-[14px] font-bold text-ink disabled:opacity-35">
              Lanjut ke Pesanan →
            </button>
          </div>
        </>) : (<>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mx-auto max-w-2xl space-y-3">
              <p className="text-[12px] text-mute">
                Periksa jumlahnya dan beri catatan untuk dapur/bar. Catatan ikut tercetak di kertas checker.
              </p>
              {nItem === 0 && (
                <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[12px] text-dim">
                  Pesanan kosong — kembali ke menu untuk memilih.
                </div>
              )}
              {blokDaftar}
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-2xl flex-wrap gap-2">
            <button onClick={() => setLangkah("menu")}
              className="min-h-[50px] rounded-xl border border-line px-4 text-[13px] text-cream hover:border-amber">
              ← Tambah menu lagi
            </button>
            <div className="min-w-[220px] flex-1">{tombolKirim}</div>
          </div>
        </>)}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {blokAtas}
      {pilihMenu}
      {blokVarian}
      {blokDaftar}
      {tombolKirim}
    </div>
  );
}
