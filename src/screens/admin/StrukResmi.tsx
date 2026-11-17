/**
 * STRUK RESMI — satu bentuk untuk SEMUA struk meja & takeaway.
 *
 * Pemilik 15 Nov 2026: "untuk cetak ulang hasil struknya beda dengan struk
 * resminya, harusnya sama saja, namun ada note cetak ulangnya." Dulu panel
 * cetak ulang punya tata letak sendiri. Sekarang struk saat bayar, Cek Bill,
 * dan cetak ulang memakai komponen INI; cetak ulang hanya menambah pita
 * "** CETAK ULANG **" di kepala dan jam cetak ulang di kaki — supaya kertas
 * kedua tidak bisa dipakai seolah-olah transaksi baru.
 */
import { lineValue, paketOf, meterEndOf, persenLini, pecahPajak, sesiBebasPajak, type State } from "../../lib/adminStore";
import { LOGO_STRUK } from "../../data/logoStruk";
import type { LiveSession } from "../../data/live";
import { rupiah } from "../../lib/core";
import { findItem } from "../../data/menu";
import type { CartLine } from "../../lib/store";
import type { Venue } from "../../data/venue";

export type DataStruk = {
  /** BILL BILLIARD (meja biliar: paket/open table, check-in, durasi, check-out) atau BILL F&B. */
  jenis?: "billiard" | "fnb";
  /** Paket yang dipakai, mis. "Open Table" / "Paket 2 Jam" / nama paket pemilik. */
  paket?: string;
  /** Jam check-out (selesai main). Kosong = masih main. */
  checkout?: number;
  /** Persen pajak lini BILIAR dari Pengaturan pajak — dicantumkan di bagian meja. */
  pajakMeja?: { ppn: number; service: number };
  /** Pembulatan naik saat bayar/cetak (bagian dari `billiard`). Ditulis "Round" di struk. */
  pembulatan?: number;
    no: string; meja: string; tamu: string; mulai: number; selesai: number;
    menit: number | null; billiard: number; fnb: number; diskon: number; promo?: string;
    /** Bagian diskon yang diberikan manual (SMH-11b) — dinamai apa adanya di struk. */
    diskonManual?: number;
    /** Nilai barang yang digratiskan venue. Dicetak supaya tamu tahu apa yang diberikan. */
    compliment?: number;
    prabayar: number; bayar: number; metode: string; kasir: string;
    /** `harga` = harga satuan (kolom @Harga di struk). */
    /**
     * `lunas` = baris ini SUDAH dibayar lewat bayar-sebagian (split bill).
     *
     * Permintaan pemilik 18 Okt 2026: "bill keluar sesuaikan yg sudah
     * dibayar dan yg belum dibayar". Mesin sudah lama tahu barisnya
     * (`paidLineKeys`) dan layar sudah menandainya — yang belum, kertasnya.
     * Tamu yang membayar bergantian tidak punya cara memeriksa bagiannya
     * sudah masuk atau belum.
     */
    items: { name: string; qty: number; harga: number; total: number; lunas?: boolean }[];
    /** Bayar tunai: uang yang diterima & kembaliannya (permintaan pemilik 8 Okt 2026). */
    tunaiDiterima?: number;
    kembalian?: number;
    /** true = BILL SEMENTARA untuk diperlihatkan ke tamu, BELUM dibayar.
     *  Harus terbaca jelas di kertas supaya tidak tertukar dengan struk lunas. */
    belumLunas?: boolean;
  };

/**
 * Satu baris pesanan seperti yang dicetak di struk.
 *
 * Compliment dinamai "compliment", BUKAN "(gratis)": minuman jatah Paket
 * Siang dan barang yang digratiskan venue sama-sama berharga nol, tapi bagi
 * pemilik keduanya hal yang sangat berbeda — yang satu bagian dari paket yang
 * dibayar tamu, yang satu biaya yang ditanggung venue.
 *
 * Namanya diambil dari BARISNYA dulu supaya barang tambahan pemilik (yang
 * tidak ada di buku menu) tetap bernama di kertas.
 */
export const barisStruk = (l: CartLine, namaMenu?: (id: string) => { name: string; price: number } | undefined) => {
  const menu = namaMenu ? namaMenu(l.itemId) : findItem(l.itemId);
  const nama = l.name ?? menu?.name ?? l.itemId;
  const tanda = l.comp ? " (compliment)" : (l.unitPrice ?? 0) === 0 ? " (gratis)" : "";
  return {
    name: `${nama}${l.variant ? ` (${l.variant})` : ""}${tanda}`,
    qty: l.qty,
    // Harga satuan DIBEKUKAN di barisnya; kolom @Harga di struk memakai ini,
    // bukan total dibagi jumlah — baris compliment akan membulat jadi 0 dan
    // tamu melihat harga satuan yang tidak pernah ada.
    harga: l.unitPrice ?? menu?.price ?? 0,
    total: lineValue(l),
  };
};

/**
 * Nomor struk dari ID tab — SAMA di struk pertama dan di cetak ulangnya.
 * (Dulu dari jam klik, yang berbeda beberapa milidetik dari jam tercatat.)
 */
export const nomorStruk = (id: string) => {
  let h = 0;
  for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return `SPL-${h.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
};

export function StrukResmi({ data, venue, cetakUlang }: {
  data: DataStruk;
  venue: Venue;
  /** Diisi = cetak ulang: pita CETAK ULANG + jam & nama yang mencetak ulang. */
  cetakUlang?: { at: number; oleh: string };
}) {
  /** Jam cetak: saat kertas ini dibuat (cetak ulang = jam cetak ulangnya). */
  const dicetak = cetakUlang?.at ?? Date.now();
  /*
   * FORMAT STRUK (pemilik 16 Nov 2026, foto struk lama): logo SPL di KIRI
   * ATAS, di sebelah kanannya SPORTS / POOL / LOUNGE tiga baris, BILLING di
   * kanan; lalu Meja #, no seri & tanggal, paket, jam main, Total Meja,
   * kotak "Deskripsi Barang", Round, Grand Total. Rapat supaya hemat kertas.
   */
  const pembulatan = data.pembulatan ?? 0;
  const biayaMeja = data.billiard - pembulatan;
  const totalBarang = data.items.reduce((n, x) => n + x.total, 0);
  const grand = data.billiard + totalBarang - data.diskon;
  const smh = venue === "smh";
  const nomorMeja = data.meja.replace(/^meja\s+/i, "");
  return (
    // Bingkai hitam (pemilik 17 Nov 2026).
    <div id="struk" className="rounded-xl border-2 border-black bg-cream px-3 py-2.5 font-mono text-[11px] leading-[1.35] text-ink">
      {/* ── Kepala: logo kiri, nama 3 baris, BILLING kanan ── */}
      <div className="flex items-center gap-2 border-b-2 border-ink pb-1">
        {/* Logo 30% lebih besar (pemilik 17 Nov 2026): 44 → 57 px. */}
        {!smh && <img src={LOGO_STRUK} alt="SPL" className="h-[57px] w-auto shrink-0" />}
        <div className="min-w-0 flex-1 font-bold leading-[1.05]">
          {smh ? (
            <><div className="text-[14px] tracking-widest">SMOKE HOUSE</div><div className="text-[11px] tracking-[0.3em]">RESTO</div></>
          ) : (
            // SPORTS sama besar dengan POOL & LOUNGE (pemilik 17 Nov 2026).
            <><div className="text-[12px] tracking-[0.3em]">SPORTS</div>
              <div className="text-[12px] tracking-[0.3em]">POOL</div>
              <div className="text-[12px] tracking-[0.3em]">LOUNGE</div></>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[12px] font-bold tracking-widest">BILLING</div>
          <div className="text-[9px] font-bold">{data.jenis === "billiard" ? "BILLIARD" : "F&B"}</div>
        </div>
      </div>
      {cetakUlang && <div className="mt-1 border-y border-ink text-center text-[12px] font-bold tracking-widest">** CETAK ULANG **</div>}
      {data.belumLunas && <div className="mt-1 border-y border-ink text-center text-[11px] font-bold tracking-wider">BILL SEMENTARA · BELUM DIBAYAR</div>}

      {/* ── Meja, nomor, tanggal ── */}
      <div className="mt-1 flex items-start justify-between gap-2">
        <span className="text-[13px] font-bold">{data.jenis === "billiard" ? `Meja #${nomorMeja}` : nomorMeja}</span>
        <span className="text-right text-[10px] leading-tight">{data.no}<br />{tanggalStruk(dicetak)} {jamMenit(dicetak)}</span>
      </div>
      {/* NAMA PELANGGAN 40% lebih besar (pemilik 17 Nov 2026): 10 → 14 px, tebal. */}
      {data.tamu.trim() && (
        <div className="truncate text-[14px] font-bold leading-tight">{data.tamu}</div>
      )}
      <div className="flex justify-between gap-2 text-[10px]">
        <span className="min-w-0 truncate italic">{data.jenis === "billiard" ? data.paket ?? "Open Table" : "F&B"}</span>
        <span className="shrink-0">Kasir: {data.kasir}</span>
      </div>

      {/* ── Bagian meja biliar ── */}
      {data.jenis === "billiard" && (
        <div className="mt-1 border-t border-dashed border-ink/50 pt-0.5">
          <Baris k="Jam" v={`${jamMenit(data.mulai)} s/d ${data.checkout ? jamMenit(data.checkout) : "main"}`} />
          <Baris k="Lama" v={durasi(data.mulai, data.checkout, data.menit)} />
          <Baris k="Biaya meja" v={ribuan(biayaMeja)} />
          <div className="flex justify-between font-bold"><span>Total Meja</span><span className="tabular-nums">{ribuan(biayaMeja)}</span></div>
          {data.pajakMeja && data.pajakMeja.ppn > 0 && data.billiard > 0 && (
            <div className="flex justify-between text-[9.5px]"><span>termasuk PPN {data.pajakMeja.ppn}%</span>
              <span className="tabular-nums">{ribuan(pecahPajak(biayaMeja, data.pajakMeja).tax)}</span></div>
          )}
        </div>
      )}
      {data.jenis !== "billiard" && data.billiard > 0 && (
        <Baris k={`Sewa meja${data.menit ? ` ${data.menit} mnt` : ""}`} v={ribuan(biayaMeja)} />
      )}

      {/* ── Kotak Deskripsi Barang ── */}
      {data.items.length > 0 && (
        <div className="mt-1 border border-ink px-1.5 py-0.5">
          <div className="flex justify-between font-bold underline underline-offset-2"><span>Deskripsi Barang</span><span>Jumlah</span></div>
          {data.items.some((x) => x.lunas) ? (<>
            {data.items.filter((x) => !x.lunas).map((it, i) => <BarisStruk key={`b${i}`} qty={it.qty} nama={it.name} harga={it.harga} total={it.total} />)}
            <div className="text-[9.5px] font-bold">SUDAH DIBAYAR</div>
            {data.items.filter((x) => x.lunas).map((it, i) => <BarisStruk key={`l${i}`} qty={it.qty} nama={`${it.name} (lunas)`} harga={it.harga} total={it.total} />)}
          </>) : data.items.map((it, i) => <BarisStruk key={i} qty={it.qty} nama={it.name} harga={it.harga} total={it.total} />)}
          <div className="flex justify-between font-bold"><span className="underline underline-offset-2">Total F&amp;B</span><span className="tabular-nums">{ribuan(totalBarang)}</span></div>
        </div>
      )}

      {/* ── Round & Grand Total ── */}
      <div className="mt-1">
        <Baris k={data.promo ? `Discount ${data.promo}` : "Discount"} v={data.diskon > 0 ? `-${ribuan(data.diskon)}` : "0"} />
        <Baris k="Round" v={ribuan(pembulatan)} />
        <div className="flex justify-between text-[13px] font-bold"><span>Grand Total</span><span className="tabular-nums">{ribuan(grand)}</span></div>
        {data.prabayar > 0 && <Baris k="Sudah dibayar" v={ribuan(data.prabayar)} />}
        {!data.belumLunas && (<>
          <Baris k="Dibayar" v={ribuan(data.tunaiDiterima ?? data.bayar)} />
          {(data.kembalian ?? 0) > 0 && <Baris k="Kembali" v={ribuan(data.kembalian ?? 0)} />}
          <Baris k="Metode" v={data.metode} />
        </>)}
      </div>
      {(data.compliment ?? 0) > 0 && (
        <div className="text-[10px]">Compliment (ditanggung venue) {rupiah(data.compliment ?? 0)}</div>
      )}
      <div className="mt-1 border-t-2 border-ink pt-0.5 text-center text-[10px] leading-tight">
        {data.belumLunas
          ? <div className="font-bold">Bukan bukti pembayaran. Mohon diperiksa dulu.</div>
          : <div className="font-bold italic">A new kind of Billiard Experience</div>}
        <div>Terima Kasih Sudah Berkunjung</div>
        {cetakUlang && <div className="text-[9px]">Dicetak ulang {tanggalStruk(cetakUlang.at)} {jamDetik(cetakUlang.at)} oleh {cetakUlang.oleh}</div>}
      </div>
    </div>
  );
}

function BarisStruk({ qty, nama, harga, total }: {
  qty: number; nama: string; harga: number; total: number;
}) {
  return (
    <div className="flex justify-between gap-1" title={`@${ribuan(harga)}`}>
      <span className="min-w-0 flex-1 break-words">{qty} {nama}</span>
      <span className="shrink-0 text-right tabular-nums">{ribuan(total)}</span>
    </div>
  );
}

/** Angka struk tanpa "Rp" — kolomnya sempit dan satuannya sudah jelas. */
const ribuan = (n: number) => n.toLocaleString("id-ID");
const tanggalStruk = (ts: number) =>
  new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const jamMenit = (ts: number) =>
  new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
/** "1 jam 50 mnt" — dari menit yang ditagih kalau ada, kalau tidak dari jam main. */
function durasi(mulai: number, selesai?: number, menit?: number | null): string {
  const m = menit ?? Math.max(0, Math.round(((selesai ?? Date.now()) - mulai) / 60_000));
  const j = Math.floor(m / 60);
  return j > 0 ? `${j} jam${m % 60 ? ` ${m % 60} mnt` : ""}` : `${m} mnt`;
}

/**
 * Data biliar untuk struk: jenis paket, check-in, check-out.
 * Meja Smokehouse dan tab tanpa meja = BILL F&B (tidak ada sewa meja).
 */
export function infoMain(
  st: Pick<State, "packages" | "pajak" | "pajakLini"> & Partial<Pick<State, "customItems" | "paketBebasPajak">>, s: LiveSession, venue: Venue, tanpaMeja: boolean, now: number,
): Pick<DataStruk, "jenis" | "paket" | "checkout" | "pajakMeja"> {
  if (venue === "smh" || (tanpaMeja && !s.mejaAsal)) return { jenis: "fnb" };
  const openBill = s.source === "walkin" && !s.blockHours && !s.paket;
  const paket = s.paket ? (paketOf(st, s.paket)?.name ?? "Paket")
    : s.blockHours ? `Paket ${s.blockHours} Jam`
      : s.source === "online" ? `Booking ${Math.max(1, Math.round((s.endsAt - s.startsAt) / 3_600_000))} Jam` : "Open Table";
  // Paket / booking: check-out SUDAH PASTI sejak check-in = check-in + lama paket
  // (pemilik 15 Nov 2026: "jam check-out langsung tertakar"). Open bill yang
  // masih jalan belum punya jam check-out.
  const checkout = s.status === "running"
    ? (!openBill ? s.endsAt : undefined)
    : openBill ? meterEndOf(s, now) : Math.min(s.endsAt, now);
  // Paket berisi minuman yang bebas pajak: baris "termasuk PPN" tidak dicetak.
  return { jenis: "billiard", paket, ...(checkout ? { checkout } : {}),
    ...(sesiBebasPajak(st, s) ? {} : { pajakMeja: persenLini(st, "biliar") }) };
}

const jamDetik = (ts: number) =>
  new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** Judul bagian di struk: garis putus-putus lalu nama bagian (BILLIARD / F&B). */
function JudulBagian({ teks }: { teks: string }) {
  return (
    <>
      <div className="my-1.5 border-t border-dashed border-ink/40" />
      <div className="mb-0.5 text-center text-[12px] font-bold tracking-[0.25em]">— {teks.toUpperCase()} —</div>
    </>
  );
}

function Baris({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="min-w-0 truncate">{k}</span>
      <span className="shrink-0 tabular-nums">{v}</span>
    </div>
  );
}
