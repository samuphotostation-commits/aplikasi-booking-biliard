/* ═══════════════════════════════════════════════════════════════════
   STRUK REKAP HARIAN (SETTLEMENT) — KERTAS 80 MM

   Permintaan pemilik 14 Nov 2026, dengan contoh & spesifikasi PDF:
     1. REKAP PENJUALAN   — "KAS KASIR / SHR / Rekening All", per menu
        (QTY · DESKRIPSI · TOTAL), seksi Cafe lalu Bar, lalu total gabungan.
     2. DETAIL TRANSAKSI  — satu baris per pembayaran: No · Jam · No.
        Transaksi · No. Meja · Keterangan · satu kolom per cara bayar, lalu
        TOTAL KESELURUHAN dan TOTAL TRANSAKSI.
   Berlaku untuk SPL Sport dan Smokehouse.

   Empat temuan di struk lama yang SENGAJA diperbaiki (lembar spesifikasi §4):
     A. Kolom terakhir terpotong — lebar tabel dikunci 72 mm.
     B. Font seksi Cafe dan Bar berbeda — satu font untuk seluruh struk.
     C. Margin kiri/kanan tidak sama dan tabel kosong di ujung — margin
        3,5 mm kiri-kanan, dan tabel ujungnya diberi label tanda tangan.
     D. "Total transaksi" menyebut BRI tapi tidak menjumlahkannya — total
        dijumlah dari SEMUA kolom yang tercetak, dan labelnya dibuat dari
        kolom yang sama, jadi keduanya tidak bisa berbeda.

   Berkas ini murni teks (seperti `cetakDapur.ts`): tidak menyentuh printer,
   jadi seluruh aturannya bisa diuji.
   ═══════════════════════════════════════════════════════════════════ */
import type { BarisTransaksi, MenuSaring } from "./engine";
import type { Venue } from "../data/venue";

const aman = (s: string) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Qty: bilangan bulat apa adanya; pecahan (bayar terpisah per rekening) satu desimal. */
const angkaQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("id-ID", { maximumFractionDigits: 1 }));

/** 35.000 — pemisah ribuan titik, tanpa "Rp", tanpa desimal. */
export const angka = (n: number) => Math.round(n).toLocaleString("id-ID");

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
  "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-11-14" → "Sabtu, 14 November 2026". Dihitung dari tanggalnya, bukan zona waktu perangkat. */
export function tanggalPanjang(bizDate: string, denganHari = true): string {
  const [y, m, d] = bizDate.split("-").map(Number);
  const hari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${denganHari ? `${hari}, ` : ""}${d} ${BULAN[m - 1]} ${y}`;
}

const jamMenit = (ms: number) => {
  // Jam WIB (UTC+7) — struk dicetak di Padang, apa pun zona waktu komputernya.
  const t = new Date(ms + 7 * 3_600_000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
};

/** Nama outlet di kepala struk. "SHR" = Smokehouse, seperti struk lama pemilik. */
export const OUTLET: Record<Venue, string> = { spl: "SPL SPORT", smh: "SHR" };

/** Satu gaya untuk kedua struk (temuan B: satu font). */
const GAYA = `@page{size:80mm auto;margin:0}*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#000}
body{width:80mm;padding:4mm 3.5mm 8mm;font-family:Arial,Helvetica,sans-serif}
.j{text-align:center;font-weight:700;line-height:1.15}
.t{text-align:center;font-size:10.4pt;margin-top:.5mm}
table{border-collapse:collapse;width:72mm;max-width:72mm;table-layout:fixed}
td,th{border:.3mm solid #000;overflow:hidden}
.r{text-align:right}.c{text-align:center}.b{font-weight:700}`;

/* ── 1. REKAP PENJUALAN ───────────────────────────────────────────── */

export type SeksiRekap = { judul: string; label: string; baris: { qty: number; nama: string; total: number }[] };

/**
 * Seksi struk rekap dari ringkasan produk hari itu: dapur = CAFE, bar = BAR,
 * barang counter biliar (rokok, botolan) = BILLIARD (SPL). Nama digabung per menu dan diurutkan
 * alfabetis; seksi kosong tidak dicetak.
 */
export function seksiRekap(baris: Pick<MenuSaring, "station" | "nama" | "qty" | "total">[]): SeksiRekap[] {
  const urut: { station: MenuSaring["station"]; judul: string; label: string }[] = [
    { station: "kitchen", judul: "REKAP PENJUALAN CAFE", label: "Cafe" },
    { station: "bar", judul: "REKAP PENJUALAN BAR", label: "Bar" },
    // Sama dengan istilah struk KAS KASIR SPL yang sudah dipakai pemilik.
    { station: "billiard", judul: "REKAP PENJUALAN BILLIARD", label: "Billiard" },
  ];
  return urut.map((u) => {
    const peta = new Map<string, { qty: number; nama: string; total: number }>();
    for (const b of baris) {
      if (b.station !== u.station) continue;
      const nama = b.nama.trim().toUpperCase();
      const ada = peta.get(nama) ?? { qty: 0, nama, total: 0 };
      ada.qty += b.qty; ada.total += b.total;
      peta.set(nama, ada);
    }
    return { judul: u.judul, label: u.label,
      baris: [...peta.values()].filter((x) => x.qty > 0).sort((p, q) => p.nama.localeCompare(q.nama)) };
  }).filter((s) => s.baris.length > 0);
}

/** Satu blok penjualan (satu venue): seksi-seksinya + sewa meja. */
export type BlokRekap = { judul?: string; seksi: SeksiRekap[]; sewaMeja?: { sesi: number; total: number } };

const totalSeksi = (s: SeksiRekap) => s.baris.reduce((n, b) => n + b.total, 0);

function lengkapiSewa(b: BlokRekap): SeksiRekap[] {
  const seksi = [...b.seksi];
  if (b.sewaMeja && b.sewaMeja.total > 0) {
    seksi.push({ judul: "SEWA MEJA BILIAR", label: "Sewa Meja",
      baris: [{ qty: b.sewaMeja.sesi, nama: b.sewaMeja.sesi ? "SEWA MEJA (SESI)" : "SEWA MEJA", total: b.sewaMeja.total }] });
  }
  return seksi;
}

/** Kotak "Total (A + B) =" — label rata kanan, Courier tebal di contoh pemilik; di sini satu font (temuan B). */
const kotakTotal = (label: string, nilai: number, besar = false) => `<table style="margin-top:4mm;font-size:${besar ? 11 : 10}pt" class="b"><colgroup><col><col style="width:25mm"></colgroup>
<tr><td class="r" style="padding:.8mm 1mm">${aman(label)} =</td><td class="r" style="padding:0 1mm">${angka(nilai)}</td></tr></table>`;

function htmlSeksi(seksi: SeksiRekap[], awal: boolean): string {
  return seksi.map((s, i) => `
<div class="j" style="font-size:13.5pt;white-space:nowrap;margin-top:${awal && i === 0 ? 3 : 5}mm">${aman(s.judul)}</div>
<table style="margin-top:1mm;font-size:10.4pt">
<colgroup><col style="width:8.8mm"><col><col style="width:21mm"></colgroup>
<tr class="b c"><td>QTY</td><td>DESKRIPSI</td><td>TOTAL</td></tr>
${s.baris.map((b) => `<tr><td class="r" style="padding:0 1mm">${b.qty ? angkaQty(b.qty) : ""}</td><td style="padding:.6mm 1mm;line-height:1.15">${aman(b.nama)}</td><td class="r" style="padding:0 1mm">${angka(b.total)}</td></tr>`).join("")}
<tr class="b"><td colspan="2" class="r" style="border-left:0;border-bottom:0;padding:.6mm 1mm">GRAND TOTAL</td><td class="r" style="padding:0 1mm">${angka(totalSeksi(s))}</td></tr>
</table>
<table style="margin-top:2.5mm;font-size:9.8pt" class="b"><colgroup><col><col style="width:25mm"></colgroup>
<tr><td class="c" style="padding:.6mm 1mm">Total ${aman(s.label)}</td><td class="r" style="padding:0 1mm">${angka(totalSeksi(s))}</td></tr></table>`).join("");
}

/**
 * STRUK 1 — REKAP PENJUALAN (format PDF pemilik).
 *
 * Satu venue: `seksi` (+ `sewaMeja`). GABUNGAN: `blok`, satu per venue —
 * tiap blok berjudul nama venue dengan totalnya sendiri, lalu satu kotak
 * total gabungan. Dua venue tidak pernah dicampur dalam satu tabel menu:
 * kasnya disetor terpisah, jadi kertasnya pun harus bisa dibaca terpisah.
 */
export function htmlRekapPenjualan(o: {
  venue: Venue; bizDate: string; seksi?: SeksiRekap[];
  /** Sewa meja biliar (SPL). 0/kosong = tidak dicetak. */
  sewaMeja?: { sesi: number; total: number };
  /** Gabungan: satu blok per venue. Menggantikan `seksi`/`sewaMeja`. */
  blok?: BlokRekap[];
  /** Baris kedua kepala struk. Bawaan: nama outlet venue (SPL SPORT / SHR). */
  outlet?: string;
  /** Baris ketiga kepala struk. Bawaan: "Rekening All". */
  rekening?: string;
  /** Pengganti baris tanggal (mis. rentang periode) + baris tambahan (Kasir : SHIFT …). */
  keterangan?: string[];
  /** Rincian pembayaran (cash, QRIS, tiap rekening) dicetak di bawah total. */
  pembayaran?: { label: string; nilai: number }[];
}): string {
  const daftar: BlokRekap[] = o.blok ?? [{ seksi: o.seksi ?? [], ...(o.sewaMeja ? { sewaMeja: o.sewaMeja } : {}) }];
  let isi = "";
  let semua = 0;
  daftar.forEach((b, k) => {
    const seksi = lengkapiSewa(b);
    const total = seksi.reduce((n, x) => n + totalSeksi(x), 0);
    semua += total;
    if (b.judul) {
      isi += `<div class="j" style="font-size:15pt;margin-top:${k === 0 ? 4 : 7}mm;border-top:.6mm solid #000;border-bottom:.6mm solid #000;padding:1mm 0">${aman(b.judul)}</div>`;
    }
    isi += seksi.length ? htmlSeksi(seksi, k === 0 && !b.judul) : '<div class="t" style="margin-top:3mm">Belum ada penjualan.</div>';
    const label = seksi.length ? seksi.map((x) => x.label).join(" + ") : "Penjualan";
    isi += kotakTotal(b.judul ? `Total ${b.judul}` : `Total (${label})`, total, !b.judul);
  });
  if (daftar.length > 1) isi += kotakTotal(`Total (${daftar.map((b) => b.judul ?? "").join(" + ")})`, semua, true);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${GAYA}</style></head><body>
<div class="j" style="font-size:17.5pt">KAS KASIR<br>${aman(o.outlet ?? OUTLET[o.venue])}<br>${aman(o.rekening ?? "Rekening All")}</div>
${(o.keterangan ?? [tanggalPanjang(o.bizDate)]).map((k) => `<div class="t">${aman(k)}</div>`).join("")}
${isi}
${o.pembayaran && o.pembayaran.length ? `<div class="j" style="font-size:13.8pt;margin-top:5mm">PEMBAYARAN</div>
<table style="margin-top:1mm;font-size:10.4pt"><colgroup><col><col style="width:25mm"></colgroup>
${o.pembayaran.map((p) => `<tr><td style="padding:.6mm 1mm">${aman(p.label)}</td><td class="r" style="padding:0 1mm">${angka(p.nilai)}</td></tr>`).join("")}
<tr class="b"><td class="r" style="padding:.6mm 1mm">TOTAL DITERIMA</td><td class="r" style="padding:0 1mm">${angka(o.pembayaran.reduce((n, p) => n + p.nilai, 0))}</td></tr></table>` : ""}
${ttd()}
</body></html>`;
}

/** Temuan C: tabel kosong di ujung struk lama diberi label — kolom tanda tangan. */
const ttd = () => `<table style="margin-top:4mm;font-size:8.8pt">
<tr class="c"><td style="padding:.5mm">Kasir</td><td style="padding:.5mm">Diperiksa</td><td style="padding:.5mm">Disetujui</td></tr>
<tr><td style="height:12mm"></td><td></td><td></td></tr></table>`;

/* ── 2. DETAIL TRANSAKSI ──────────────────────────────────────────── */

export type KolomBayar = { label: string; cocok: (x: BarisTransaksi) => boolean };

/**
 * Kolom cara bayar: KAS dan QRIS selalu ada, lalu SATU KOLOM PER MESIN EDC
 * yang muncul hari itu (MANDIRI, BRI, …), lalu PRABAYAR kalau ada. Setiap
 * pembayaran masuk tepat satu kolom — jumlah per kolom = uang yang masuk.
 */
export function kolomBayar(baris: BarisTransaksi[]): KolomBayar[] {
  const mesin = [...new Set(baris.filter((x) => x.kanal === "edc" && !x.prabayar)
    .map((x) => x.mesin ?? "EDC"))].sort();
  return [
    { label: "KAS", cocok: (x) => !x.prabayar && x.kanal === "cash" },
    { label: "QRIS", cocok: (x) => !x.prabayar && x.kanal === "qris_online" },
    ...mesin.map((m) => ({ label: m.toUpperCase(), cocok: (x: BarisTransaksi) => !x.prabayar && x.kanal === "edc" && (x.mesin ?? "EDC") === m })),
    ...(baris.some((x) => x.prabayar) ? [{ label: "PRABAYAR", cocok: (x: BarisTransaksi) => !!x.prabayar }] : []),
  ];
}

export function htmlDetailTransaksi(o: {
  /** null = gabungan kedua venue. */
  venue: Venue | null; bizDate: string; kasir: string; baris: BarisTransaksi[];
}): string {
  const kolom = kolomBayar(o.baris);
  const perKolom = kolom.map((k) => o.baris.filter(k.cocok).reduce((n, x) => n + x.jumlah, 0));
  const total = perKolom.reduce((n, v) => n + v, 0);
  /*
   * LEBAR KOLOM DIHITUNG DARI ISINYA, total selalu 72 mm (temuan A).
   *
   * Tiap kolom uang selebar angka terpanjangnya ("1.262.000"); No, Jam,
   * No. Transaksi, dan No. Meja tetap; Keterangan mengambil sisanya. Huruf
   * dimulai sebesar mungkin (permintaan pemilik: perbesar 20–30%) dan baru
   * diturunkan kalau Keterangan tinggal kurang dari 7 mm.
   */
  // Banyak huruf terpanjang tiap kolom — ISI dan JUDULNYA. Kolom uang yang
  // isinya cuma "0" tetap selebar judulnya ("QRIS"), tidak terjepit jadi
  // satu huruf per baris (temuan di pratinjau 14 Nov 2026).
  const panjang = (xs: string[]) => Math.max(1, ...xs.map((x) => x.length));
  const hurufKiri = [
    panjang([String(o.baris.length), "No."]),
    5,                                                     // "11:23"
    panjang([...o.baris.map((x) => x.kode), "Transaksi"]),
    panjang([...o.baris.map((x) => x.meja), "Meja"]),
  ];
  const hurufUang = kolom.map((k, c) => Math.max(
    ...o.baris.map((x) => (k.cocok(x) ? angka(x.jumlah) : "0").length), angka(perKolom[c]).length,
    Math.ceil(k.label.length * 0.9)));
  const mmPerHuruf = (pt: number) => pt * 0.6 * 0.3528;       // lebar rata-rata satu huruf Arial
  let hurufTabel = 8.6;
  let tetapMm: number[] = [];
  let lebarUang: number[] = [];
  let lebarKet = 0;
  for (; hurufTabel > 5; hurufTabel = Math.round((hurufTabel - 0.2) * 10) / 10) {
    tetapMm = hurufKiri.map((n) => n * mmPerHuruf(hurufTabel) + 1.2);
    lebarUang = hurufUang.map((n) => n * mmPerHuruf(hurufTabel) + 1.2);
    lebarKet = 72 - tetapMm.reduce((n, v) => n + v, 0) - lebarUang.reduce((n, v) => n + v, 0);
    if (lebarKet >= 11) break;
  }
  // Keterangan boleh turun baris (nama tamu), jadi cukup 8 mm sekalipun sempit.
  const kiri = [...tetapMm, Math.max(8, lebarKet)];
  const skala = 72 / (kiri.reduce((n, v) => n + v, 0) + lebarUang.reduce((n, v) => n + v, 0));
  const mm = (w: number) => (w * Math.min(1, skala)).toFixed(2);
  const judul = o.venue === "smh" ? "DETAIL TRANSAKSI CAFE" : o.venue === "spl" ? "DETAIL TRANSAKSI SPL SPORT" : "DETAIL TRANSAKSI SPL + SHR";
  const sel = "padding:.4mm .5mm;white-space:nowrap;text-overflow:clip";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${GAYA}</style></head><body>
<div class="j" style="font-size:11.2pt">${judul}</div>
<div class="t" style="font-size:9pt">${tanggalPanjang(o.bizDate, false)}</div>
<div class="t" style="font-size:9.1pt;margin-top:1.5mm">Kasir : ${aman(o.kasir)}</div>
<table style="margin-top:2mm;font-size:${hurufTabel}pt">
<colgroup>${kiri.map((w) => `<col style="width:${mm(w)}mm">`).join("")}${lebarUang.map((w) => `<col style="width:${mm(w)}mm">`).join("")}</colgroup>
<tr class="c" style="height:6mm"><td>No.</td><td>Jam</td><td>No.<br>Transaksi</td><td>Meja</td><td>Ket.</td>${kolom.map((k) => `<td style="padding:.4mm .2mm;font-size:.85em;word-break:break-all">${aman(k.label)}</td>`).join("")}</tr>
${o.baris.map((x, i) => `<tr style="height:3.9mm"><td class="c">${i + 1}</td><td class="c">${jamMenit(x.at)}</td><td style="${sel}">${aman(x.kode)}</td><td class="c" style="${sel}">${aman(x.meja)}</td><td style="padding:.4mm .5mm;word-break:break-word;line-height:1.1">${aman(x.keterangan)}</td>${kolom.map((k) => `<td class="r" style="${sel}">${k.cocok(x) ? angka(x.jumlah) : "0"}</td>`).join("")}</tr>`).join("")}
<tr style="height:4.1mm"><td colspan="5" class="c">TOTAL KESELURUHAN</td>${perKolom.map((v) => `<td class="r b" style="${sel}">${angka(v)}</td>`).join("")}</tr>
<tr style="height:5.3mm"><td colspan="5" class="c" style="line-height:1.1">TOTAL TRANSAKSI<br>(${kolom.map((k) => aman(k.label)).join("+")})</td><td colspan="${kolom.length}" class="c b" style="font-size:8.8pt">${angka(total)}</td></tr>
</table>
${ttd()}
</body></html>`;
}
