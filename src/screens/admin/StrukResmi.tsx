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
import { lineValue, paketOf, meterEndOf, persenLini, pecahPajak, type State } from "../../lib/adminStore";
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
  return (
    <div id="struk" className="rounded-xl bg-cream p-4 font-mono text-[12px] leading-relaxed text-ink">
      <div className="text-center">
        {/* Bill SPL memakai LOGO SPL (pemilik 16 Nov 2026). */}
        {venue !== "smh" && (
          <img src={LOGO_STRUK} alt="SPL" className="mx-auto mb-1 h-[64px] w-auto" />
        )}
        <div className="text-[15px] font-bold leading-tight tracking-widest">
          {venue === "smh" ? "SMOKE HOUSE" : "SPL SPORTS"}
        </div>
        <div className="text-[15px] font-bold leading-tight tracking-widest">
          {venue === "smh" ? "RESTO" : "POOL LOUNGE"}
        </div>
        <div className="mt-1 text-[13px] font-bold tracking-widest">
          {data.jenis === "billiard" ? "BILL BILLIARD" : "BILL F&B"}
        </div>
        {cetakUlang && (
          <div className="my-1 border-y-2 border-ink py-1 text-[14px] font-bold tracking-widest">** CETAK ULANG **</div>
        )}
        {data.belumLunas && (
          <div className="my-1 border-y-2 border-ink py-1 text-[14px] font-bold tracking-widest">
            BILL SEMENTARA · BELUM DIBAYAR
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[13px] font-bold">
        <span>Meja :</span><span>{data.meja.replace(/^meja\s+/i, "")}</span>
      </div>
      <div className="my-1.5 border-t border-dashed border-ink/40" />
      {/* Isi kepala sesuai arahan pemilik (PDF 15 Nov 2026): no seri, tanggal,
          kasir, jam cetak — lalu khusus biliar: paket, check-in, durasi, check-out. */}
      <Baris k={`No. : ${data.no}`} v={tanggalStruk(dicetak)} />
      <div className="break-words">Kasir : {data.kasir}</div>
      <Baris k="Jam cetak" v={jamDetik(dicetak)} />
      {/*
        DUA BAGIAN TERPISAH (pemilik 15 Nov 2026, panduan PDF lampiran 2):
        BILLIARD — sewa meja: paket/open table, check-in, durasi, check-out,
        subtotalnya sendiri; lalu F&B — pesanan makanan/minuman dengan
        subtotalnya sendiri. Total di bawah tetap angka dari mesin.
      */}
      {data.jenis === "billiard" && (
        <>
          <JudulBagian teks="Billiard" />
          <Baris k="Paket" v={data.paket ?? "Open Table"} />
          <Baris k="Check-in" v={jamMenit(data.mulai)} />
          <Baris k="Durasi" v={durasi(data.mulai, data.checkout, data.menit)} />
          <Baris k="Check-out" v={data.checkout ? jamMenit(data.checkout) : "masih main"} />
          <div className="mt-0.5 flex justify-between border-t border-dotted border-ink/40 pt-0.5 font-bold">
            <span>Subtotal Billiard</span><span className="tabular-nums">{ribuan(data.billiard)}</span>
          </div>
          {/* PPN meja biliar sesuai Pengaturan → Pajak (harga sudah termasuk pajak). */}
          {data.pajakMeja && data.pajakMeja.ppn > 0 && data.billiard > 0 && (
            <Baris k={`  termasuk PPN ${data.pajakMeja.ppn}%`} v={ribuan(pecahPajak(data.billiard, data.pajakMeja).tax)} />
          )}
          {data.pajakMeja && data.pajakMeja.service > 0 && data.billiard > 0 && (
            <Baris k={`  termasuk service ${data.pajakMeja.service}%`} v={ribuan(pecahPajak(data.billiard, data.pajakMeja).service)} />
          )}
        </>
      )}

      {(data.items.length > 0 || data.jenis !== "billiard") && (
        <>
          <JudulBagian teks="F&B" />
          <div className="flex justify-between gap-1 text-[11px] font-bold">
            <span className="flex-1">Qty Menu</span>
            <span className="w-[52px] text-right">@Harga</span>
            <span className="w-[56px] text-right">Jumlah</span>
          </div>
        </>
      )}
      {/* Bill F&B yang (jarang) punya sewa meja tetap menuliskannya sebagai baris. */}
      {data.jenis !== "billiard" && data.billiard > 0 && (
        <BarisStruk qty={1} nama={`SEWA MEJA${data.menit ? ` ${data.menit} MNT` : ""}`}
          harga={data.billiard} total={data.billiard} />
      )}
      {/* DUA KELOMPOK kalau ada yang sudah dibayar per orang.
          Yang sudah dibayar tetap dicetak supaya tamu bisa
          mencocokkan, tapi tidak dijumlahkan dua kali — jumlah di
          bawah memakai angka dari mesin, bukan dari daftar ini. */}
      {data.items.some((x) => x.lunas) ? (
        <>
          {data.items.filter((x) => !x.lunas).length > 0 && (
            <>
              <div className="mt-1 text-[11px] font-bold">BELUM DIBAYAR</div>
              {data.items.filter((x) => !x.lunas).map((it, i) => (
                <BarisStruk key={`b${i}`} qty={it.qty} nama={it.name} harga={it.harga} total={it.total} />
              ))}
            </>
          )}
          <div className="mt-1 text-[11px] font-bold">SUDAH DIBAYAR</div>
          {data.items.filter((x) => x.lunas).map((it, i) => (
            <BarisStruk key={`l${i}`} qty={it.qty} nama={`${it.name} (lunas)`} harga={it.harga} total={it.total} />
          ))}
        </>
      ) : (
        data.items.map((it, i) => (
          <BarisStruk key={i} qty={it.qty} nama={it.name} harga={it.harga} total={it.total} />
        ))
      )}
      {data.items.length > 0 && (
        <div className="mt-0.5 flex justify-between border-t border-dotted border-ink/40 pt-0.5 font-bold">
          <span>Subtotal F&amp;B</span><span className="tabular-nums">{ribuan(data.items.reduce((n, x) => n + x.total, 0))}</span>
        </div>
      )}
      <div className="my-1.5 border-t border-dashed border-ink/40" />

      <Baris k="Total" v={ribuan(data.billiard + data.items.reduce((n, x) => n + x.total, 0))} />
      <Baris k={(data.diskonManual ?? 0) > 0 ? "Discount" : data.promo ? `Discount ${data.promo}` : "Discount"}
        v={ribuan(data.diskon)} />
      <div className="my-1 border-t border-ink/60" />
      <div className="flex justify-between text-[13px] font-bold">
        <span>Total Bersih</span>
        <span>{ribuan(data.billiard + data.items.reduce((n, x) => n + x.total, 0) - data.diskon)}</span>
      </div>
      {data.prabayar > 0 && <Baris k="Sudah dibayar" v={ribuan(data.prabayar)} />}
      <Baris k="Dibayar" v={ribuan(data.tunaiDiterima ?? data.bayar)} />
      <div className="my-1 border-t border-ink/60" />
      <div className="flex justify-between text-[13px] font-bold">
        <span>Kembali</span><span>{ribuan(data.kembalian ?? 0)}</span>
      </div>
      {!data.belumLunas && <Baris k="Metode" v={data.metode} />}

      {/* Compliment ditulis TERPISAH dan tidak ikut hitungan: barisnya
          di atas sudah bernilai nol. Tetap dicetak supaya tamu tahu
          apa yang diberikan, dan supaya kertasnya cocok dengan rekap. */}
      {(data.compliment ?? 0) > 0 && (
        <div className="mt-1 text-[11px]">
          Compliment (ditanggung venue) {rupiah(data.compliment ?? 0)}
        </div>
      )}
      {data.belumLunas && (
        <div className="mt-2 text-center text-[11px] font-bold">
          Bukan bukti pembayaran. Mohon diperiksa dulu sebelum dibayar.
        </div>
      )}
      {!data.belumLunas && <div className="mt-2 text-center text-[11px] font-bold italic">A new kind of Billiard Experience</div>}
      <div className="text-center text-[11px]"># TERIMA KASIH SUDAH BERKUNJUNG #</div>
      {cetakUlang && (
        <div className="mt-1 text-center text-[10px]">
          Dicetak ulang {tanggalStruk(cetakUlang.at)} {jamDetik(cetakUlang.at)} oleh {cetakUlang.oleh}
        </div>
      )}
    </div>
  );
}

function BarisStruk({ qty, nama, harga, total }: {
  qty: number; nama: string; harga: number; total: number;
}) {
  return (
    <div className="flex justify-between gap-1 text-[11px]">
      <span className="min-w-0 flex-1 break-words">{qty} {nama}</span>
      <span className="w-[52px] shrink-0 text-right tabular-nums">{ribuan(harga)}</span>
      <span className="w-[56px] shrink-0 text-right tabular-nums">{ribuan(total)}</span>
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
  st: Pick<State, "packages" | "pajak" | "pajakLini">, s: LiveSession, venue: Venue, tanpaMeja: boolean, now: number,
): Pick<DataStruk, "jenis" | "paket" | "checkout" | "pajakMeja"> {
  if (venue === "smh" || tanpaMeja) return { jenis: "fnb" };
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
  return { jenis: "billiard", paket, ...(checkout ? { checkout } : {}), pajakMeja: persenLini(st, "biliar") };
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
