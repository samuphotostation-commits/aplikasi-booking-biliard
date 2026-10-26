/**
 * PANEL STRUK — lihat & cetak ulang struk yang sudah lewat.
 *
 * Permintaan pemilik 18 Okt 2026: *"panel print struk (bisa cek flashback
 * struk yg sebelum2nya)"*.
 *
 * MASALAH YANG DIPERBAIKI: struk hanya bisa dicetak SAAT ITU JUGA, dari
 * lembar meja atau Detail Transaksi. Kalau kertasnya habis, printernya macet,
 * atau tamu kembali setengah jam kemudian minta struknya — tidak ada jalan
 * sama sekali. Yang bisa dilakukan kasir hanya menuliskannya tangan.
 *
 * DUA HAL YANG DIJAGA DI SINI:
 *
 * 1. CETAK ULANG DITANDAI. Kertasnya mencetak "CETAK ULANG" beserta jam
 *    cetaknya. Struk kedua yang tidak bisa dibedakan dari yang pertama bisa
 *    dipakai seolah-olah dua transaksi — dan itu lubang kas, bukan
 *    kenyamanan.
 * 2. HARI YANG RINCIANNYA SUDAH DILEPAS DIKATAKAN APA ADANYA. Arsip lama
 *    membuang baris pesanannya untuk menjaga ukuran data; untuk hari itu
 *    yang bisa dicetak hanya ringkasannya. Layarnya mengatakan itu, bukan
 *    menampilkan struk kosong yang terlihat seperti transaksi tanpa isi.
 */
import { useMemo, useState } from "react";
import {
  useAdmin, recap, recapDates, businessDateOf, penjualanProduk, lineValue, itemOf,
} from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { cetakStruk } from "../../lib/cetak";
import { VENUE_LABEL } from "../../data/venue";
import { useVenueAktif } from "../../lib/venueAktif";
import { jam } from "./AdminShell";

/** Berapa hari ke belakang yang ditawarkan. Lebih dari ini jejaknya sudah dilepas. */
const HARI_MUNDUR = 90;

type Baris = {
  id: string;
  no: string;
  jenis: "meja" | "takeaway";
  nama: string;
  meja: string;
  at: number;
  nilai: number;
  kanal: string;
  /** Baris pesanannya, kalau masih ada. Arsip lama sudah melepasnya. */
  rincian: { nama: string; qty: number; total: number }[] | null;
  sewaMeja: number;
  diskon: number;
};

export default function PanelStruk({ onTutup }: { onTutup: () => void }) {
  const { a } = useAdmin();
  const venue = useVenueAktif();
  const hariIni = businessDateOf(Date.now());
  const [hari, setHari] = useState(hariIni);
  const [q, setQ] = useState("");
  const [pilih, setPilih] = useState<Baris | null>(null);
  const [cetak, setCetak] = useState<null | { jenis: "struk" | "rekap"; at: number }>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const tanggalAda = useMemo(
    () => recapDates(a).filter((d) => d >= geser(hariIni, -HARI_MUNDUR)).slice(0, 60),
    [a, hariIni],
  );

  const r = useMemo(() => recap(a, hari, venue), [a, hari, venue]);

  const daftar: Baris[] = useMemo(() => {
    const dariMeja: Baris[] = r.done
      .filter((s) => s.status === "done")
      .map((s) => ({
        id: s.id,
        no: `SPL-${(s.settledAt ?? s.startsAt).toString(36).toUpperCase().slice(-6)}`,
        jenis: "meja" as const,
        nama: s.guest,
        meja: s.tableId,
        at: s.settledAt ?? s.endsAt,
        nilai: (s.settledBilliard ?? 0) + (s.settledFnb ?? 0) - (s.settledDiscount ?? 0),
        kanal: s.settledChannel ?? "-",
        // Sesi yang masih hidup punya barisnya; yang sudah diarsipkan tidak.
        rincian: barisDari(a, s.id),
        sewaMeja: s.settledBilliard ?? 0,
        diskon: s.settledDiscount ?? 0,
      }));
    const dariTakeaway: Baris[] = r.takeaway.map((o) => ({
      id: o.id, no: o.code, jenis: "takeaway" as const, nama: o.guest, meja: "Takeaway",
      at: o.payment?.at ?? o.at, nilai: o.value,
      kanal: o.payment?.channel ?? (o.paidOnline > 0 ? "qris" : "-"),
      rincian: barisPesanan(a, o.id),
      sewaMeja: 0, diskon: 0,
    }));
    const cari = q.trim().toLowerCase();
    return [...dariMeja, ...dariTakeaway]
      .filter((b) => !cari || b.no.toLowerCase().includes(cari)
        || b.nama.toLowerCase().includes(cari) || b.meja.toLowerCase().includes(cari))
      .sort((x, y) => y.at - x.at);
  }, [r, a, q]);

  const produk = useMemo(() => penjualanProduk(a, hari, hari, venue), [a, hari, venue]);

  async function lakukanCetak(jenis: "struk" | "rekap") {
    setCetak({ jenis, at: Date.now() });
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const hasil = await cetakStruk();
    setKabar(hasil.ok ? "Perintah cetak terkirim." : `Gagal mencetak: ${hasil.alasan ?? "printer tidak menjawab"}`);
    setTimeout(() => setKabar(null), 4000);
    setCetak(null);
  }

  return (
    <div className="rounded-xl border border-line bg-ink-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Struk — lihat &amp; cetak ulang
        </h2>
        <button onClick={onTutup} className="text-[12px] text-dim">tutup</button>
      </div>

      <div className="no-bar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {tanggalAda.map((d) => (
          <button key={d} onClick={() => { setHari(d); setPilih(null); }} aria-pressed={d === hari}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] ${
              d === hari ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-mute"
            }`}>
            {d === hariIni ? "Hari ini" : d.slice(5)}
          </button>
        ))}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nomor struk, nama tamu, atau meja…"
        className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />

      {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}

      <button onClick={() => void lakukanCetak("rekap")}
        className="mt-2 min-h-[42px] w-full rounded-xl border border-line bg-ink text-[12px] text-cream">
        Cetak rekap penjualan {hari === hariIni ? "hari ini" : hari} · {produk.baris.length} jenis
      </button>

      {daftar.length === 0 ? (
        <p className="mt-3 rounded-lg border border-line bg-ink px-3 py-6 text-center text-[13px] text-dim">
          Tidak ada transaksi pada hari itu.
        </p>
      ) : (
        <div className="mt-2 max-h-[46vh] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-ink">
          {daftar.map((b) => (
            <button key={b.id} onClick={() => setPilih(b)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                pilih?.id === b.id ? "bg-amber/10" : ""
              }`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-cream">
                  {b.meja} · {b.nama}
                </span>
                <span className="text-[11px] text-dim">
                  {jam(b.at)} · {b.no} · {b.kanal}
                  {b.rincian === null && " · rincian sudah dilepas"}
                </span>
              </span>
              <span className="shrink-0 text-[13px] tabular-nums text-amber">{rupiah(b.nilai)}</span>
            </button>
          ))}
        </div>
      )}

      {pilih && (
        <div className="mt-3 rounded-xl border border-amber/40 bg-amber/5 p-3">
          <div className="text-[13px] text-cream">{pilih.meja} · {pilih.nama}</div>
          <div className="text-[11px] text-dim">{pilih.no} · {jam(pilih.at)} · {pilih.kanal}</div>
          {pilih.rincian === null && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber">
              Hari ini sudah tutup buku dan baris pesanannya dilepas. Yang bisa dicetak
              hanya ringkasannya: nomor, jam, cara bayar, dan nilainya.
            </p>
          )}
          <button onClick={() => void lakukanCetak("struk")}
            className="mt-2 min-h-[44px] w-full rounded-xl bg-amber text-[13px] font-bold text-ink">
            Cetak ulang struk ini
          </button>
        </div>
      )}

      {/* ── Lembar cetak ─────────────────────────────────────────── */}
      {cetak && cetak.jenis === "struk" && pilih && (
        <div id="struk" className="cetak-saja bg-white p-2 text-[11px] text-black">
          <div className="text-center">
            <div className="text-[13px] font-bold uppercase">{VENUE_LABEL[venue]}</div>
            <div className="text-[12px] font-bold">** CETAK ULANG **</div>
            <div className="mt-1">No. : {pilih.no}</div>
            <div>Meja : {pilih.meja}</div>
            <div>Tamu : {pilih.nama}</div>
            <div>Transaksi : {hari} {jam(pilih.at)}</div>
          </div>
          <div className="my-1 border-t border-dashed border-black" />
          {pilih.rincian === null ? (
            <div>Rincian baris tidak tersedia untuk hari yang sudah tutup buku.</div>
          ) : (
            <table className="w-full">
              <tbody>
                {pilih.sewaMeja > 0 && (
                  <tr><td>1× SEWA MEJA</td>
                    <td className="w-20 text-right tabular-nums">{rupiah(pilih.sewaMeja)}</td></tr>
                )}
                {pilih.rincian.map((x, i) => (
                  <tr key={i}>
                    <td className="align-top">{x.qty}× {x.nama}</td>
                    <td className="w-20 text-right align-top tabular-nums">{rupiah(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pilih.diskon > 0 && (
            <div className="flex justify-between"><span>Diskon</span>
              <span className="tabular-nums">-{rupiah(pilih.diskon)}</span></div>
          )}
          <div className="my-1 border-t border-black" />
          <div className="flex justify-between font-bold">
            <span>TOTAL</span><span className="tabular-nums">{rupiah(pilih.nilai)}</span>
          </div>
          <div className="flex justify-between"><span>Metode</span><span>{pilih.kanal}</span></div>
          <div className="mt-2 text-center text-[10px]">
            Harga sudah termasuk pajak<br />
            Dicetak ulang {jam(cetak.at)} oleh {a.me?.name ?? "-"}<br />
            # TERIMA KASIH SUDAH BERKUNJUNG #
          </div>
        </div>
      )}

      {cetak && cetak.jenis === "rekap" && (
        <div id="struk" className="cetak-saja bg-white p-2 text-[11px] text-black">
          <div className="text-center">
            <div className="text-[13px] font-bold uppercase">Kas Kasir</div>
            <div className="text-[12px] font-bold uppercase">{VENUE_LABEL[venue]}</div>
            <div className="mt-1">{hari}</div>
            <div className="mt-1 text-[12px] font-bold uppercase">Rekap Penjualan</div>
          </div>
          <div className="my-1 border-t border-dashed border-black" />
          <table className="w-full">
            <thead>
              <tr className="border-b border-black">
                <th className="w-7 text-left">QTY</th>
                <th className="text-left">DESKRIPSI</th>
                <th className="w-20 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {produk.baris.map((b) => (
                <tr key={b.itemId}>
                  <td className="align-top tabular-nums">{b.qty}</td>
                  <td className="align-top uppercase">{b.nama}</td>
                  <td className="text-right align-top tabular-nums">{rupiah(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="my-1 border-t border-black" />
          <div className="flex justify-between font-bold">
            <span>TOTAL {produk.qty} PORSI</span>
            <span className="tabular-nums">{rupiah(produk.total)}</span>
          </div>
          {produk.hariTanpaRincian.length > 0 && (
            <div className="mt-1 text-[10px]">
              Catatan: {produk.hariTanpaRincian.length} hari rinciannya sudah dilepas.
            </div>
          )}
          <div className="mt-2 text-center text-[10px]">
            Dicetak {jam(cetak.at)} oleh {a.me?.name ?? "-"}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tanggal operasional digeser n hari. */
function geser(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Baris pesanan sebuah sesi — null kalau sesinya sudah diarsipkan. */
function barisDari(a: ReturnType<typeof useAdmin>["a"], id: string) {
  const s = a.sessions.find((x) => x.id === id);
  if (!s) return null;
  return s.fnb.map((l) => ({
    nama: l.name ?? itemOf(a, l.itemId)?.name ?? l.itemId,
    qty: l.qty, total: lineValue(l),
  }));
}

/** Baris sebuah pesanan takeaway — null kalau sudah diarsipkan. */
function barisPesanan(a: ReturnType<typeof useAdmin>["a"], id: string) {
  const o = a.orders.find((x) => x.id === id);
  if (!o) return null;
  return o.lines.map((l) => ({
    nama: l.name ?? itemOf(a, l.itemId)?.name ?? l.itemId,
    qty: l.qty, total: lineValue(l),
  }));
}
