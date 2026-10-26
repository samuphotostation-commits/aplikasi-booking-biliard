/**
 * PENULIS .XLSX — tanpa pustaka tambahan.
 *
 * MASALAH YANG DIPERBAIKI: semua laporan diunduh sebagai CSV, dan Excel
 * berbahasa Indonesia membacanya salah — "245000" kadang jadi teks, tanggal
 * jadi angka acak, dan pemisah desimal berkelahi dengan pemisah kolom. Pemilik
 * menyebutnya "csv nya belum excel yg benar", dan memang begitu.
 *
 * KENAPA DITULIS SENDIRI, bukan memasang SheetJS: berkas .xlsx itu cuma ZIP
 * berisi beberapa XML. Yang dibutuhkan laporan di sini hanya angka, teks, dan
 * baris tebal — tidak ada rumus, grafik, atau gaya rumit. Pustaka pembaca-
 * penulis lengkap berukuran ratusan kilobita dan ikut terunduh tiap kasir
 * membuka aplikasi di jam sibuk. Ini sekitar seratus baris dan tidak menambah
 * satu pun kilobita ke jalur kritis.
 *
 * ZIP-nya sengaja TANPA kompresi (metode "store"): isinya beberapa kilobita
 * XML, jadi tidak ada yang perlu dihemat, dan deflate tanpa pustaka hanya
 * menambah kemungkinan salah.
 */

/* ── CRC32: wajib ada di tiap entri ZIP ──────────────────────────── */
const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array<ArrayBuffer>): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABEL_CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ── ZIP "store" ─────────────────────────────────────────────────── */
type Entri = { nama: string; isi: Uint8Array<ArrayBuffer> };

function zip(entri: Entri[]): Blob {
  const enc = new TextEncoder();
  const lokal: Uint8Array<ArrayBuffer>[] = [];
  const pusat: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const e of entri) {
    const nama = enc.encode(e.nama);
    const crc = crc32(e.isi);
    const n = e.isi.length;

    const kepala = new DataView(new ArrayBuffer(30));
    kepala.setUint32(0, 0x04034b50, true);   // tanda berkas lokal
    kepala.setUint16(4, 20, true);           // versi minimum
    kepala.setUint16(6, 0x0800, true);       // bendera: nama berkas UTF-8
    kepala.setUint16(8, 0, true);            // metode 0 = store
    kepala.setUint16(10, 0, true);           // jam (tidak dipakai)
    kepala.setUint16(12, 0x21, true);        // tanggal (1 Jan 1980; tetap supaya hasilnya sama tiap kali)
    kepala.setUint32(14, crc, true);
    kepala.setUint32(18, n, true);
    kepala.setUint32(22, n, true);
    kepala.setUint16(26, nama.length, true);
    kepala.setUint16(28, 0, true);
    lokal.push(new Uint8Array(kepala.buffer), nama as Uint8Array<ArrayBuffer>, e.isi);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);       // tanda direktori pusat
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, n, true);
    cd.setUint32(24, n, true);
    cd.setUint16(28, nama.length, true);
    cd.setUint32(42, offset, true);
    pusat.push(new Uint8Array(cd.buffer), nama as Uint8Array<ArrayBuffer>);

    offset += 30 + nama.length + n;
  }

  const panjangPusat = pusat.reduce((a, b) => a + b.length, 0);
  const akhir = new DataView(new ArrayBuffer(22));
  akhir.setUint32(0, 0x06054b50, true);
  akhir.setUint16(8, entri.length, true);
  akhir.setUint16(10, entri.length, true);
  akhir.setUint32(12, panjangPusat, true);
  akhir.setUint32(16, offset, true);

  return new Blob([...lokal, ...pusat, new Uint8Array(akhir.buffer)],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* ── XLSX ────────────────────────────────────────────────────────── */

/** Satu sel: angka tetap angka, teks tetap teks. Itu inti perbaikannya. */
export type Sel = string | number | null | undefined;

const aman = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Excel menolak berkas yang memuat karakter kendali.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** Nama kolom Excel: 0 → A, 26 → AA. */
function kolom(i: number): string {
  let n = i + 1, out = "";
  while (n > 0) { const sisa = (n - 1) % 26; out = String.fromCharCode(65 + sisa) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

function lembar(baris: Sel[][], tebalBarisPertama: boolean): string {
  const isi = baris.map((r, y) => {
    const sel = r.map((v, x) => {
      const ref = `${kolom(x)}${y + 1}`;
      const gaya = tebalBarisPertama && y === 0 ? ' s="1"' : "";
      if (v === null || v === undefined || v === "") return `<c r="${ref}"${gaya}/>`;
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${gaya}><v>${v}</v></c>`;
      return `<c r="${ref}"${gaya} t="inlineStr"><is><t xml:space="preserve">${aman(String(v))}</t></is></c>`;
    }).join("");
    return `<row r="${y + 1}">${sel}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${isi}</sheetData></worksheet>`;
}

/** Hanya dua gaya: biasa dan tebal (untuk baris judul). */
const GAYA = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>`
  + `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
  + `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>`
  + `<borders count="1"><border/></borders>`
  + `<cellStyleXfs count="1"><xf/></cellStyleXfs>`
  + `<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>`
  + `</styleSheet>`;

/**
 * Susun satu berkas .xlsx berisi satu lembar.
 * Baris pertama dianggap judul kolom dan dicetak tebal.
 */
export function bikinXlsx(baris: Sel[][], namaLembar = "Laporan"): Blob {
  const enc = new TextEncoder();
  const b = (nama: string, teks: string): Entri => ({ nama, isi: enc.encode(teks) as Uint8Array<ArrayBuffer> });
  // Nama lembar Excel: maksimal 31 huruf, tanpa : \ / ? * [ ]
  const judul = aman(namaLembar.replace(/[:\\/?*[\]]/g, " ").slice(0, 31)) || "Laporan";

  return zip([
    b("[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
      + `</Types>`),
    b("_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
      + `</Relationships>`),
    b("xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`
      + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheets><sheet name="${judul}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    b("xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + `</Relationships>`),
    b("xl/styles.xml", GAYA),
    b("xl/worksheets/sheet1.xml", lembar(baris, true)),
  ]);
}

/**
 * Ubah sel yang SEBENARNYA angka jadi angka.
 *
 * Laporan di aplikasi ini dulu dibangun untuk CSV, jadi semuanya sudah
 * terlanjur jadi teks. Yang TIDAK boleh ikut diubah: nomor HP dan kode yang
 * berawalan nol — "08123456789" bukan angka 8.123.456.789, dan Excel akan
 * memakan nol depannya tanpa ada yang sadar.
 */
export const angkakan = (v: Sel): Sel => {
  if (typeof v === "number") return v;
  const t = String(v ?? "").trim();
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(t)) return v;
  return Number(t);
};

/**
 * Unduh satu laporan sebagai .xlsx. Kalau unduhan biner tidak tersedia di
 * lingkungan itu, jatuh ke CSV — lebih baik berkas yang kurang rapi daripada
 * tombol yang diam.
 */
export async function unduhExcel(
  namaDasar: string, baris: Sel[][], namaLembar = "Laporan",
): Promise<"tersimpan" | "dibatalkan" | "gagal"> {
  const { bisaUnduhBiner, saveBlobFile, saveTextFile } = await import("./saveFile");
  const rapi = baris.map((r) => r.map(angkakan));
  if (bisaUnduhBiner()) {
    return saveBlobFile(`${namaDasar}.xlsx`, bikinXlsx(rapi, namaLembar));
  }
  const csv = baris
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join(String.fromCharCode(13, 10));
  return saveTextFile(`${namaDasar}.csv`, csv);
}
