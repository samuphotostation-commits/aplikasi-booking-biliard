/* ═══════════════════════════════════════════════════════════════════
   LEMBAR CETAK GUDANG — KERTAS 80 MM (pemilik 18 Nov 2026, PDF revisi poin 8)

   "Pada menu gudang bisa dicetak, 3 kolom | Produk | Qty | Aktual |".
   Kepala: GUDANG · jenis gudang · nama pencetak · posisi · hari & tanggal ·
   jam:menit. Kolom AKTUAL sengaja kosong — diisi tangan saat hitung fisik,
   lalu angkanya dimasukkan lewat Kelola → Hitung ulang.

   Murni teks (seperti strukRekap.ts): tidak menyentuh printer, bisa diuji.
   ═══════════════════════════════════════════════════════════════════ */

const aman = (s: string) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
  "Agustus", "September", "Oktober", "November", "Desember"];

/** "Rabu, 18 November 2026" dan "16:35" — jam WIB, apa pun zona komputernya. */
export function waktuCetak(ms: number): { tanggal: string; jam: string } {
  const w = new Date(ms + 7 * 3_600_000);
  const dua = (n: number) => String(n).padStart(2, "0");
  return {
    tanggal: `${HARI[w.getUTCDay()]}, ${w.getUTCDate()} ${BULAN[w.getUTCMonth()]} ${w.getUTCFullYear()}`,
    jam: `${dua(w.getUTCHours())}:${dua(w.getUTCMinutes())}`,
  };
}

export function htmlCetakGudang(o: {
  /** "Gudang Billiard", "Gudang Bar", … */
  jenis: string;
  pencetak: string;
  posisi: string;
  at: number;
  /** `sisa` null = barang tidak dilacak stoknya (tetap dicetak, sisanya "–"). */
  baris: { nama: string; sisa: number | null }[];
}): string {
  const w = waktuCetak(o.at);
  const isi = o.baris.length
    ? o.baris.map((b, i) => `<tr><td class="c">${i + 1}</td><td class="n">${aman(b.nama)}</td><td class="c b">${b.sisa === null ? "–" : b.sisa}</td><td></td></tr>`).join("")
    : '<tr><td colspan="4" class="c" style="padding:2mm">Belum ada barang di gudang ini.</td></tr>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#000}
body{width:100%;max-width:72mm;padding:3mm 2mm 4mm;font-family:Arial,Helvetica,sans-serif}
.kotak{border:.5mm solid #000;padding:2mm}
h1{margin:0 0 1.5mm;text-align:center;font-size:17pt;letter-spacing:.06em}
.kepala{display:flex;justify-content:space-between;gap:2mm;font-size:8.6pt;line-height:1.3}
.kepala div:first-child{flex:1;min-width:0}.kepala div:last-child{text-align:right;white-space:nowrap}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin-top:2.5mm;font-size:9.4pt}
td,th{border:.3mm solid #000;padding:.8mm 1mm;vertical-align:top}
th{font-size:9.6pt}
tr{height:6.2mm}
.c{text-align:center}.b{font-weight:700}.n{line-height:1.15;word-break:break-word}
.ttd{display:flex;justify-content:space-between;margin-top:5mm;font-size:8.6pt}
.ttd div{width:46%;text-align:center}.ttd span{display:block;height:11mm;border-bottom:.3mm solid #000}</style></head><body>
<div class="kotak">
<h1>GUDANG</h1>
<div class="kepala">
<div><b>${aman(o.jenis.toUpperCase())}</b><br>${aman(o.pencetak)}<br>${aman(o.posisi)}</div>
<div>${aman(w.tanggal)}<br><b>${w.jam}</b></div>
</div>
<table><colgroup><col style="width:7mm"><col><col style="width:12mm"><col style="width:15mm"></colgroup>
<tr><th>No</th><th>PRODUK</th><th>SISA</th><th>AKTUAL</th></tr>
${isi}
</table>
<div class="ttd"><div><span></span>Penghitung</div><div><span></span>Diperiksa</div></div>
</div>
</body></html>`;
}
