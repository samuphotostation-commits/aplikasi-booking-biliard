/**
 * PESAN TANPA MEJA — kasir menjual makanan, minuman, atau rokok langsung.
 *
 * MASALAH YANG DIPERBAIKI: tamu yang cuma membeli kopi atau sebungkus rokok
 * tidak punya meja, dan kasir tidak punya tempat memasukkannya. Yang bisa
 * dilakukan hanya MENAGIH takeaway yang dibuat tamu sendiri dari HP — kasir
 * tidak bisa MEMBUATNYA. Akibatnya penjualan seperti itu tidak tercatat di
 * mana pun, atau dipaksa lewat meja kosong supaya ada tempatnya.
 *
 * Jalur uangnya SENGAJA tidak baru: pesanan ini dibuat sebagai takeaway
 * "bayar di kasir" (`guestOrder` → `settleOrder`), persis seperti pesanan
 * takeaway dari HP. Jadi semua pengaman lama ikut berlaku tanpa kecuali —
 * termasuk aturan bahwa takeaway yang belum dibayar BUKAN omzet.
 *
 * Begitu terkirim, pesanannya muncul di daftar "Takeaway menunggu diambil &
 * dibayar" tepat di layar yang sama, lengkap dengan QR dinamis dan tombol
 * Tunai/EDC/QRIS yang sudah ada.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import PilihMenu from "./PilihMenu";
import { cetakStruk } from "../../lib/cetak";
import { VENUE_LABEL } from "../../data/venue";
import { jam } from "./AdminShell";
import type { MenuItem } from "../../data/menu";
import { useAdmin, priceOf, kategoriJual } from "../../lib/adminStore";
import { bookingCode, rupiah } from "../../lib/core";
import { venueAktif } from "../../lib/venueAktif";

export default function PesanTanpaMeja({ onDone, lebar = false }: { onDone: (kode: string | null) => void; lebar?: boolean }) {
  const { a, dispatchA, peek } = useAdmin();
  const MENU = kategoriJual(a, { staf: true, venue: venueAktif() });
  const [nama, setNama] = useState("");
  const [draft, setDraft] = useState<Record<string, { item: MenuItem; qty: number }>>({});
  const [galat, setGalat] = useState<string | null>(null);
  const [cetak, setCetak] = useState<{ at: number } | null>(null);
  const sent = useRef(false);


  const stokOf = (id: string) => a.stock.find((r) => r.itemId === id);
  const habis = (id: string) => a.soldOut.includes(id);

  function tambah(item: MenuItem) {
    const st = stokOf(item.id);
    const sudah = draft[item.id]?.qty ?? 0;
    // Tidak boleh menjual melebihi stok — pengaman yang sama dipakai layar lain.
    if (st && st.qty !== null && sudah >= st.qty) return;
    setDraft((d) => ({ ...d, [item.id]: { item, qty: sudah + 1 } }));
  }

  function kurang(id: string) {
    setDraft((d) => {
      const cur = d[id];
      if (!cur) return d;
      if (cur.qty <= 1) { const { [id]: _buang, ...sisa } = d; return sisa; }
      return { ...d, [id]: { ...cur, qty: cur.qty - 1 } };
    });
  }

  const lines = Object.values(draft);
  const total = lines.reduce((n, d) => n + priceOf(a, d.item.id) * d.qty, 0);

  async function cetakBill() {
    if (lines.length === 0) return;
    setCetak({ at: Date.now() });
    // Satu putaran gambar supaya lembarnya sudah ada di DOM saat dicetak.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const hasil = await cetakStruk();
    if (!hasil.ok) setGalat(`Gagal mencetak: ${hasil.alasan ?? "printer tidak menjawab"}`);
    setCetak(null);
  }

  function kirim() {
    if (sent.current || lines.length === 0) return;
    sent.current = true;
    const code = bookingCode();
    const id = `k-${code}`;
    dispatchA({
      t: "guestOrder",
      order: {
        id, code, guest: nama.trim() || "Tamu kasir", mode: "takeaway",
        // Pesanan tanpa meja tidak punya apa pun yang bisa menunjukkan venue-nya,
        // jadi venue yang sedang dibuka kasir ikut dicatat — kalau tidak,
        // penjualannya jatuh ke rekap venue yang salah.
        venue: venueAktif(),
        pay: "kasir", paidOnline: 0,
        lines: lines.map((d) => ({ key: `${d.item.id}-${id}`, itemId: d.item.id, qty: d.qty })),
      },
    });
    // Mesin boleh menolak (dapur tutup, stok kurang, shift belum dibuka).
    // Kalau ditolak, jangan pura-pura berhasil.
    const masuk = peek().orders.find((o) => o.id === id);
    if (!masuk || masuk.status !== "diterima") {
      sent.current = false;
      setGalat(masuk?.reason ?? "Pesanan ditolak — cek shift, jam dapur, atau stok.");
      return;
    }
    onDone(code);
  }

  const petak = (it: MenuItem) => {
    const st = stokOf(it.id);
    const kosong = habis(it.id) || st?.qty === 0;
    const sudah = draft[it.id]?.qty ?? 0;
    return (
      <button key={it.id} disabled={kosong} onClick={() => tambah(it)}
        className={`relative rounded-xl border p-2 text-left ${
          kosong ? "border-line-2 bg-ink-3 text-dim" : sudah > 0 ? "border-amber bg-amber/10 text-cream" : "border-line bg-ink-2 text-cream hover:border-amber"
        }`}>
        <div className="line-clamp-2 min-h-[2.1em] text-[12px] leading-snug">{it.name}</div>
        <div className="mt-0.5 text-[11px] tabular-nums text-amber">{rupiah(priceOf(a, it.id))}</div>
        {kosong ? <div className="text-[10px] text-red-300">habis</div>
          : st?.qty !== null && st !== undefined ? <div className="text-[10px] text-dim">sisa {st.qty}</div> : null}
        {sudah > 0 && (
          <span className="absolute right-1.5 top-1.5 min-w-[22px] rounded-full bg-amber px-1.5 text-center text-[12px] font-bold leading-[22px] text-ink">{sudah}</span>
        )}
      </button>
    );
  };

  const menuPilih = (
    <PilihMenu menu={MENU} tile={petak} cariLabel="Cari makanan, minuman, atau rokok…"
      tinggi={lebar ? "max-h-[calc(100vh-240px)]" : "max-h-[40vh]"}
      kolom={lebar ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"} />
  );

  /* LAYAR COUNTER LEBAR (panduan UI/UX pemilik 15 Nov 2026): menu memenuhi
     kolom kiri; nama tamu, pesanan, dan tombol bayar di kolom kanan. */
  if (lebar) {
    return (
      <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="min-w-0" aria-label="Menu">{menuPilih}</section>
        <section className="min-w-0 space-y-3 lg:border-l lg:border-line lg:pl-5" aria-label="Pesanan">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Pesanan</div>
      <input value={nama} onChange={(e) => setNama(e.target.value.slice(0, 40))}
        placeholder="Nama tamu (boleh dikosongkan)"
        className="w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />

          {lines.length === 0 && (
            <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[12px] text-dim">
              Belum ada yang dipilih. Ketuk menu di kiri.
            </div>
          )}
      {lines.length > 0 && (
        <div className="rounded-xl border border-line bg-ink-2 p-2">
          {lines.map((d) => (
            <div key={d.item.id} className="flex items-center gap-2 py-0.5 text-[12px]">
              <span className="flex-1 truncate text-cream">{d.item.name}</span>
              <button onClick={() => kurang(d.item.id)}
                className="min-h-[28px] w-7 rounded border border-line text-mute">−</button>
              <span className="w-6 text-center tabular-nums text-cream">{d.qty}</span>
              <button onClick={() => tambah(d.item)}
                className="min-h-[28px] w-7 rounded border border-line text-mute">+</button>
              <span className="w-20 text-right tabular-nums text-cream">{rupiah(priceOf(a, d.item.id) * d.qty)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-line pt-1 text-[13px] font-bold">
            <span className="text-dim">Total</span>
            <span className="tabular-nums text-amber">{rupiah(total)}</span>
          </div>
        </div>
      )}

      {galat && <p role="alert" className="text-[12px] text-red-300">{galat}</p>}

      <div className="flex gap-2">
        <button onClick={() => onDone(null)}
          className="min-h-[44px] flex-1 rounded-xl border border-line text-[13px] text-mute">Batal</button>
        {/* CETAK BILL sebelum dibayar (permintaan pemilik 18 Okt 2026).
            Tamu yang beli di counter sering minta rinciannya dulu sebelum
            membayar — sama seperti tamu bermeja. Sebelum ini satu-satunya
            cara adalah membacakannya. */}
        <button onClick={cetakBill} disabled={lines.length === 0}
          className="min-h-[44px] flex-1 rounded-xl border border-line text-[13px] text-cream disabled:opacity-40">
          Cetak Bill
        </button>
        <button onClick={kirim} disabled={lines.length === 0}
          className="min-h-[44px] flex-[2] rounded-xl bg-amber text-[13px] font-bold text-ink disabled:opacity-40">
          Buat pesanan {lines.length > 0 && `· ${rupiah(total)}`}
        </button>
      </div>

      {/* Lembar cetaknya hanya ada di DOM saat dicetak: `#struk` adalah satu
          jangkar yang dipakai seluruh aplikasi (lihat `@media print` di
          index.css), jadi dua lembar yang hidup bersamaan akan saling
          menimpa di kertas. */}
      {cetak && (
        <div id="struk" className="cetak-saja bg-white p-2 text-[11px] text-black">
          <div className="text-center">
            <div className="text-[13px] font-bold uppercase">{VENUE_LABEL[venueAktif()]}</div>
            <div className="text-[11px] font-bold uppercase">Bill — belum dibayar</div>
            <div className="mt-1">{new Date(cetak.at).toLocaleDateString("id-ID")} · {jam(cetak.at)}</div>
            <div>Kasir : {a.me?.name ?? "-"}</div>
            {nama.trim() && <div>Tamu : {nama.trim()}</div>}
          </div>
          <div className="my-1 border-t border-dashed border-black" />
          <table className="w-full">
            <tbody>
              {lines.map((d) => (
                <tr key={d.item.id}>
                  <td className="align-top">{d.qty}× {d.item.name}</td>
                  <td className="w-20 text-right align-top tabular-nums">
                    {rupiah(priceOf(a, d.item.id) * d.qty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="my-1 border-t border-dashed border-black" />
          <div className="flex justify-between font-bold">
            <span>TOTAL</span><span className="tabular-nums">{rupiah(total)}</span>
          </div>
          <div className="mt-2 text-center text-[10px]">
            Harga sudah termasuk pajak<br />
            Bill ini BELUM pembayaran — bayar di kasir
          </div>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-dim">
        Pesanannya langsung muncul di daftar <span className="text-cream">Takeaway menunggu
        diambil &amp; dibayar</span> di atas — di situ ada QR dinamis dan tombol Tunai / EDC /
        QRIS untuk menagihnya. Belum dihitung sebagai omzet sampai dibayar.
      </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input value={nama} onChange={(e) => setNama(e.target.value.slice(0, 40))}
        placeholder="Nama tamu (boleh dikosongkan)"
        className="w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />

      {menuPilih}

      {lines.length > 0 && (
        <div className="rounded-xl border border-line bg-ink-2 p-2">
          {lines.map((d) => (
            <div key={d.item.id} className="flex items-center gap-2 py-0.5 text-[12px]">
              <span className="flex-1 truncate text-cream">{d.item.name}</span>
              <button onClick={() => kurang(d.item.id)}
                className="min-h-[28px] w-7 rounded border border-line text-mute">−</button>
              <span className="w-6 text-center tabular-nums text-cream">{d.qty}</span>
              <button onClick={() => tambah(d.item)}
                className="min-h-[28px] w-7 rounded border border-line text-mute">+</button>
              <span className="w-20 text-right tabular-nums text-cream">{rupiah(priceOf(a, d.item.id) * d.qty)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-line pt-1 text-[13px] font-bold">
            <span className="text-dim">Total</span>
            <span className="tabular-nums text-amber">{rupiah(total)}</span>
          </div>
        </div>
      )}

      {galat && <p role="alert" className="text-[12px] text-red-300">{galat}</p>}

      <div className="flex gap-2">
        <button onClick={() => onDone(null)}
          className="min-h-[44px] flex-1 rounded-xl border border-line text-[13px] text-mute">Batal</button>
        {/* CETAK BILL sebelum dibayar (permintaan pemilik 18 Okt 2026).
            Tamu yang beli di counter sering minta rinciannya dulu sebelum
            membayar — sama seperti tamu bermeja. Sebelum ini satu-satunya
            cara adalah membacakannya. */}
        <button onClick={cetakBill} disabled={lines.length === 0}
          className="min-h-[44px] flex-1 rounded-xl border border-line text-[13px] text-cream disabled:opacity-40">
          Cetak Bill
        </button>
        <button onClick={kirim} disabled={lines.length === 0}
          className="min-h-[44px] flex-[2] rounded-xl bg-amber text-[13px] font-bold text-ink disabled:opacity-40">
          Buat pesanan {lines.length > 0 && `· ${rupiah(total)}`}
        </button>
      </div>

      {/* Lembar cetaknya hanya ada di DOM saat dicetak: `#struk` adalah satu
          jangkar yang dipakai seluruh aplikasi (lihat `@media print` di
          index.css), jadi dua lembar yang hidup bersamaan akan saling
          menimpa di kertas. */}
      {cetak && (
        <div id="struk" className="cetak-saja bg-white p-2 text-[11px] text-black">
          <div className="text-center">
            <div className="text-[13px] font-bold uppercase">{VENUE_LABEL[venueAktif()]}</div>
            <div className="text-[11px] font-bold uppercase">Bill — belum dibayar</div>
            <div className="mt-1">{new Date(cetak.at).toLocaleDateString("id-ID")} · {jam(cetak.at)}</div>
            <div>Kasir : {a.me?.name ?? "-"}</div>
            {nama.trim() && <div>Tamu : {nama.trim()}</div>}
          </div>
          <div className="my-1 border-t border-dashed border-black" />
          <table className="w-full">
            <tbody>
              {lines.map((d) => (
                <tr key={d.item.id}>
                  <td className="align-top">{d.qty}× {d.item.name}</td>
                  <td className="w-20 text-right align-top tabular-nums">
                    {rupiah(priceOf(a, d.item.id) * d.qty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="my-1 border-t border-dashed border-black" />
          <div className="flex justify-between font-bold">
            <span>TOTAL</span><span className="tabular-nums">{rupiah(total)}</span>
          </div>
          <div className="mt-2 text-center text-[10px]">
            Harga sudah termasuk pajak<br />
            Bill ini BELUM pembayaran — bayar di kasir
          </div>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-dim">
        Pesanannya langsung muncul di daftar <span className="text-cream">Takeaway menunggu
        diambil &amp; dibayar</span> di atas — di situ ada QR dinamis dan tombol Tunai / EDC /
        QRIS untuk menagihnya. Belum dihitung sebagai omzet sampai dibayar.
      </p>
    </div>
  );
}

/**
 * LAYAR COUNTER — hampir layar penuh, dengan (x) TUTUP di atas (panduan
 * UI/UX pemilik 15 Nov 2026). Dipakai dari Papan maupun Kasir supaya kasir
 * menemukan bentuk yang sama di dua tempat. Esc juga menutup.
 */
export function LayarCounter({ onTutup, onDone }: { onTutup: () => void; onDone: (kode: string | null) => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onTutup]);
  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-ink/80 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onTutup} />
      <motion.div role="dialog" aria-modal="true" aria-label="Counter · pesan tanpa meja"
        className="safe-b fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col overflow-hidden rounded-3xl border border-line bg-ink-2 sm:inset-x-4 lg:inset-x-6 lg:top-4 lg:bottom-4"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl uppercase tracking-wide text-cream">Counter · pesan tanpa meja</div>
            <div className="text-[11px] text-dim">Makanan, minuman, rokok untuk dibawa — ditagih di Kasir, tab Pesanan.</div>
          </div>
          <button onClick={onTutup}
            className="min-h-[42px] shrink-0 rounded-xl border border-line px-4 text-[13px] font-semibold text-cream hover:border-red-400 hover:text-red-300">
            ✕ Tutup
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PesanTanpaMeja lebar onDone={onDone} />
        </div>
      </motion.div>
    </>
  );
}
