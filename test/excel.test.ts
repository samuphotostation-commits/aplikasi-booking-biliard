/* ═══════════════════════════════════════════════════════════════════
   PENULIS .XLSX

   Berkas Excel ditulis sendiri tanpa pustaka (lihat src/lib/excel.ts), jadi
   yang diuji bukan "apakah kodenya jalan" melainkan "apakah hasilnya benar
   menurut pembaca ZIP LAIN". Karena itu berkasnya benar-benar ditulis ke
   cakram lalu dibongkar oleh Windows sendiri (Expand-Archive) — kalau CRC,
   offset, atau direktori pusatnya salah, perintah itu gagal. Memeriksanya
   dengan pembaca buatan sendiri tidak membuktikan apa pun.
   ═══════════════════════════════════════════════════════════════════ */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bikinXlsx } from "../src/lib/excel";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const BARIS = [
  ["Tanggal", "Barang", "Qty", "Total"],
  ["2026-10-09", "Marlboro Red", 2, 110_000],
  ["2026-10-09", 'Es Teh "spesial" & <besar>', 1, 8_000],
  ["2026-10-09", "Kosong", null, 0],
];

const dir = mkdtempSync(join(tmpdir(), "spl-xlsx-"));
const berkas = join(dir, "uji.xlsx");
// Expand-Archive hanya mau berkas ber-akhiran .zip. Isinya sama persis —
// yang diuji tetap bita yang sama, cuma namanya yang dibuat enak baginya.
const salinanZip = join(dir, "uji.zip");

console.log("-- Berkas terbentuk dan berbentuk ZIP --");
{
  const blob = bikinXlsx(BARIS, "Rekap Stok");
  const buf = Buffer.from(await blob.arrayBuffer());
  writeFileSync(berkas, buf);
  writeFileSync(salinanZip, buf);
  t("diawali tanda ZIP 'PK'", buf.subarray(0, 2).toString("latin1"), "PK");
  t("ada direktori pusat", buf.includes(Buffer.from("PK\u0001\u0002", "latin1")), true);
  t("ukurannya masuk akal (< 20 KB)", buf.length > 500 && buf.length < 20_000, true);
}

console.log("\n-- Dibongkar oleh pembaca ZIP Windows, bukan buatan sendiri --");
{
  const keluar = join(dir, "bongkar");
  let pesan = "";
  try {
    execFileSync("powershell", ["-NoProfile", "-Command",
      `Expand-Archive -LiteralPath '${salinanZip}' -DestinationPath '${keluar}' -Force`],
      { stdio: "pipe" });
  } catch (e) {
    pesan = String((e as { stderr?: Buffer }).stderr ?? e);
  }
  t("Expand-Archive berhasil (CRC & offset benar)", pesan, "");

  const ada = (p: string) => existsSync(join(keluar, ...p.split("/")));
  t("[Content_Types].xml ada", ada("[Content_Types].xml"), true);
  t("xl/workbook.xml ada", ada("xl/workbook.xml"), true);
  t("xl/worksheets/sheet1.xml ada", ada("xl/worksheets/sheet1.xml"), true);
  t("xl/styles.xml ada", ada("xl/styles.xml"), true);

  const sheet = readFileSync(join(keluar, "xl", "worksheets", "sheet1.xml"), "utf8");
  // Inti perbaikannya: angka harus jadi ANGKA, bukan teks seperti di CSV.
  t("110000 ditulis sebagai angka", sheet.includes("<v>110000</v>"), true);
  t("angka tidak dibungkus inlineStr", /t="inlineStr"><is><t[^>]*>110000/.test(sheet), false);
  t("teks tetap teks", sheet.includes("Marlboro Red"), true);
  t("kutip & kurung sudut di-escape, bukan merusak XML",
    sheet.includes("&quot;") || sheet.includes('Es Teh "spesial" &amp; &lt;besar&gt;'), true);
  t("sel kosong tidak jadi angka 0 palsu", /<c r="C4"[^>]*\/>/.test(sheet), true);
  t("baris judul memakai gaya tebal", /<c r="A1" s="1"/.test(sheet), true);

  const wb = readFileSync(join(keluar, "xl", "workbook.xml"), "utf8");
  t("nama lembar terbawa", wb.includes('name="Rekap Stok"'), true);
}

console.log("\n-- Nama lembar yang tidak sah dirapikan --");
{
  const blob = bikinXlsx([["a"]], "Rekap/Stok: 2026 [uji] yang namanya kepanjangan sekali");
  const teks = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  const m = teks.match(/<sheet name="([^"]*)"/);
  const nama = m?.[1] ?? "";
  t("tidak memuat karakter terlarang", /[:\\/?*[\]]/.test(nama), false);
  t("maksimal 31 huruf", nama.length <= 31, true);
}

rmSync(dir, { recursive: true, force: true });

console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
