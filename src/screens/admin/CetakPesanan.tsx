/**
 * CETAK PESANAN F&B / COUNTER SESUDAH CHECK OUT (pemilik 16 Nov 2026, SPL):
 *
 *   untuk customer : BILL total (semua pesanan digabung) — 2 rangkap
 *   untuk crew     : CO MAKANAN                          — 2 rangkap (jika ada)
 *                    CO MINUMAN + kemasan + rokok        — 2 rangkap (jika ada)
 *
 * Jadi paling banyak 6 lembar, masing-masing terpotong. Bill memakai struk
 * resmi yang sama dengan meja (bagian F&B saja); CO memakai CAFE ORDER.
 */
import { useState } from "react";
import { useAdmin, itemOf, bayarPesanan, type GuestOrder, type State } from "../../lib/adminStore";
import { cetakStruk, cetakHtmlStruk } from "../../lib/cetak";
import { htmlCafeOrderTerpisah } from "../../lib/strukCO";
import { venueDari, type Venue } from "../../data/venue";
import { StrukResmi, barisStruk, type DataStruk } from "./StrukResmi";

const venuePesanan = (o: GuestOrder): Venue => (o.tableId ? venueDari(o.tableId) : o.venue ?? "spl");

function dataBill(a: State, o: GuestOrder): DataStruk {
  const bagian = bayarPesanan(o);
  return {
    jenis: "fnb", no: o.code, meja: o.mode === "takeaway" ? "Takeaway" : "Counter", tamu: o.guest,
    mulai: o.at, selesai: bagian[0]?.at ?? Date.now(), menit: null,
    billiard: 0, fnb: o.value, diskon: 0, prabayar: o.paidOnline,
    bayar: bagian.reduce((n, p) => n + p.amount, 0) || o.value,
    metode: bagian.length ? [...new Set(bagian.map((p) => (p.channel === "checkout" ? "Checkout" : p.channel === "cash" ? "Tunai" : p.channel === "edc" ? "EDC" : "QRIS")))].join(" + ") : "Checkout",
    kasir: a.me?.name ?? "-",
    items: o.lines.map((l) => barisStruk(l, (id) => itemOf(a, id))),
  };
}

export function useCetakPesanan(onKabar?: (t: string) => void) {
  const { a, peek } = useAdmin();
  const [o, setO] = useState<GuestOrder | null>(null);

  async function cetak(id: string) {
    const ord = peek().orders.find((x) => x.id === id);
    if (!ord) return;
    setO(ord);
    // Tunggu struk tergambar, lalu: bill 2 rangkap, CO makanan 2, CO minuman 2.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r1 = await cetakStruk(2);
    setO(null);
    if (!r1.ok) { onKabar?.(`Bill gagal dicetak: ${r1.alasan ?? "printer tidak menjawab"}`); return; }
    const lembar = htmlCafeOrderTerpisah({
      venue: venuePesanan(ord), no: ord.code, meja: ord.mode === "takeaway" ? "Takeaway" : "Counter", tamu: ord.guest,
      kasir: peek().me?.name ?? "-", at: Date.now(),
    }, ord.lines.map((l) => ({
      nama: l.name ?? itemOf(peek(), l.itemId)?.name ?? l.itemId, qty: l.qty,
      station: l.station ?? itemOf(peek(), l.itemId)?.station,
      ...(l.variant ? { varian: l.variant } : {}), ...(l.note ? { catatan: l.note } : {}),
    })));
    for (const html of lembar) {
      const r = await cetakHtmlStruk(html, 2);
      if (!r.ok) { onKabar?.(`CO gagal dicetak: ${r.alasan ?? "printer tidak menjawab"}`); return; }
    }
    if (r1.alasan) onKabar?.(r1.alasan);
  }

  const elemen = o ? (
    <div className="cetak-saja"><StrukResmi data={dataBill(a, o)} venue={venuePesanan(o)} /></div>
  ) : null;
  return { cetak, elemen };
}
