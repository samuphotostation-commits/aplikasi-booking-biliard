import { useState } from "react";
import {
  useAdmin, omzetPerShift, menuShift, menuSaring, rekapSaring, labelKanal,
  type BarisTransaksi,
} from "../../lib/adminStore";
import { cetakHtmlStruk } from "../../lib/cetak";
import {
  htmlDetailTransaksi, htmlRekapPenjualan, kolomBayar, seksiRekap, tanggalPanjang, type BlokRekap,
} from "../../lib/strukRekap";
import { VENUE_LABEL, type Venue } from "../../data/venue";

/**
 * CETAK KAS KASIR — dua struk 80 mm menurut panduan pemilik (PDF 14 Nov 2026):
 *   1. Rekap Penjualan  ("KAS KASIR / SHR / Rekening All", per menu)
 *   2. Detail Transaksi (per pembayaran, satu kolom per cara bayar)
 *
 * SATU-SATUNYA tempat struk rekap dibuat. Dipakai di Rekap → Kas Kasir (pilih
 * shift) dan di tab Shift (closing shift yang sedang berjalan), supaya kertas
 * closing dan kertas rekap tidak pernah berbeda bentuk atau angka.
 *
 * `shiftId` null = semua shift. `venue` kosong = gabungan (satu blok per venue).
 * Detail Transaksi hanya untuk SATU hari — baris per pembayaran sebulan tidak
 * muat dibaca di kertas.
 */
export default function CetakKasKasir({ dari, sampai, venue, shiftId, namaShift, kecil }: {
  dari: string; sampai: string; venue?: Venue; shiftId: string | null; namaShift: string;
  /** Tombol saja, tanpa keterangan (tab Shift). */
  kecil?: boolean;
}) {
  const { a } = useAdmin();
  const [lihat, setLihat] = useState<null | "rekap" | "detail">(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const satuHari = dari === sampai;
  const venues: Venue[] = venue ? [venue] : ["spl", "smh"];
  const outlet = venue === "smh" ? "SHR" : venue === "spl" ? "SPL SPORT" : "SPL + SHR";
  const labelWaktu = satuHari ? tanggalPanjang(dari) : `${tanggalPanjang(dari, false)} – ${tanggalPanjang(sampai, false)}`;
  const keterangan = [labelWaktu, ...(shiftId ? [`Kasir : ${namaShift.toUpperCase()}`] : [])];

  /** Pembayaran satu hari (dan satu shift) — sumbernya rincian yang sama dengan Detail Transaksi. */
  const barisBayar = (v?: Venue): BarisTransaksi[] =>
    omzetPerShift(a, dari, v).rincian.filter((x) => !shiftId || x.shiftId === shiftId);

  let kurang = false;
  function blokVenue(v: Venue): BlokRekap {
    if (satuHari) {
      const m = menuShift(a, dari, v, shiftId);
      if (!m.tersedia) kurang = true;
      const os = omzetPerShift(a, dari, v);
      const sewa = v === "spl" ? (shiftId ? os.shift.find((x) => x.id === shiftId)?.sewaMeja ?? (os.tanpaShift?.id === shiftId ? os.tanpaShift.sewaMeja : 0) : os.semua.sewaMeja) : 0;
      return { judul: venue ? undefined : VENUE_LABEL[v].toUpperCase(), seksi: seksiRekap(m.baris), ...(sewa > 0 ? { sewaMeja: { sesi: 0, total: sewa } } : {}) };
    }
    const m = menuSaring(a, { dari, sampai, unit: v });
    if (m.hariTanpaRincian.length) kurang = true;
    const sewa = v === "spl" ? rekapSaring(a, { dari, sampai, unit: "spl" }).perLini.biliar : 0;
    return { judul: venue ? undefined : VENUE_LABEL[v].toUpperCase(), seksi: seksiRekap(m.baris), ...(sewa > 0 ? { sewaMeja: { sesi: 0, total: sewa } } : {}) };
  }

  function htmlRekap(): string {
    const blok = venues.map(blokVenue);
    let pembayaran: { label: string; nilai: number }[];
    if (satuHari) {
      const baris = barisBayar(venue);
      pembayaran = kolomBayar(baris).map((k) => ({ label: k.label, nilai: baris.filter(k.cocok).reduce((n, x) => n + x.jumlah, 0) }));
    } else {
      const h = rekapSaring(a, { dari, sampai, unit: venue ?? "semua" });
      pembayaran = Object.entries(h.perKanal).map(([k, v]) => ({ label: labelKanal(k).toUpperCase(), nilai: v }));
    }
    return htmlRekapPenjualan({
      venue: venue ?? "spl", bizDate: dari, outlet, keterangan, pembayaran,
      ...(venue ? { seksi: blok[0].seksi, ...(blok[0].sewaMeja ? { sewaMeja: blok[0].sewaMeja } : {}) } : { blok }),
    });
  }

  const htmlDetail = () => htmlDetailTransaksi({
    venue: venue ?? null, bizDate: dari, kasir: shiftId ? namaShift.toUpperCase() : "SEMUA SHIFT", baris: barisBayar(venue),
  });

  async function cetak(jenis: "rekap" | "detail") {
    const r = await cetakHtmlStruk(jenis === "rekap" ? htmlRekap() : htmlDetail());
    setKabar(r.ok ? "Struk terkirim ke printer." : `Gagal mencetak: ${r.alasan ?? "printer tidak menjawab"}`);
    setTimeout(() => setKabar(null), 5000);
  }

  // Dihitung sekali untuk peringatan "rincian tidak tersedia".
  if (!kecil) venues.forEach(blokVenue);

  const tombol = (jenis: "rekap" | "detail", label: string) => (
    <div className="flex">
      <button onClick={() => void cetak(jenis)}
        className="min-h-[38px] rounded-l-lg bg-amber px-3 text-[12px] font-bold text-ink">
        Cetak {label}
      </button>
      <button onClick={() => setLihat(lihat === jenis ? null : jenis)} aria-pressed={lihat === jenis}
        title="Lihat struk sebelum dicetak"
        className={`min-h-[38px] rounded-r-lg border-l border-ink/30 px-2.5 text-[12px] font-semibold ${
          lihat === jenis ? "bg-amber-deep text-ink" : "bg-amber/80 text-ink hover:bg-amber"
        }`}>
        {lihat === jenis ? "Tutup" : "Lihat"}
      </button>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {tombol("rekap", "Rekap Penjualan")}
        {satuHari && tombol("detail", "Detail Transaksi")}
      </div>
      {kabar && <p role="status" className="mt-1.5 text-[12px] text-amber">{kabar}</p>}
      {!kecil && kurang && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber">
          Sebagian hari tidak menyimpan rincian menu {shiftId ? "per shift" : ""} — tabel menunya tidak lengkap,
          tapi kotak Pembayaran tetap lengkap.
        </p>
      )}
      {lihat && (
        <iframe title="Pratinjau struk" sandbox="" srcDoc={lihat === "rekap" ? htmlRekap() : htmlDetail()}
          className="mt-2 block h-[640px] w-[320px] max-w-full rounded border border-line bg-white" />
      )}
    </div>
  );
}
