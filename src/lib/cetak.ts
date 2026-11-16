/* ═══════════════════════════════════════════════════════════════════
   CETAK STRUK

   Dua jalur, dan pemakainya tidak perlu tahu sedang di jalur mana:

     • APLIKASI WINDOWS — Electron mencetak LANGSUNG ke printer struk yang
       dipilih pemilik. Tidak ada dialog: kasir menekan "Cetak Struk", kertas
       keluar. Itu bedanya saat malam ramai.
     • PERAMBAN — tidak ada cara mencetak tanpa dialog (semua peramban
       melarangnya), jadi jatuh ke `window.print()` seperti sebelumnya.

   Nama printer disimpan di perangkat, bukan di jejak venue: tiap komputer
   kasir punya printer sendiri, dan itu bukan urusan data venue.
   ═══════════════════════════════════════════════════════════════════ */

type Jembatan = {
  tersedia: true;
  daftarPrinter: () => Promise<{ nama: string; keterangan: string; bawaan: boolean }[]>;
  cetak: (printer?: string) => Promise<{ ok: boolean; alasan?: string }>;
  cetakHtml: (html: string, printer: string, opsi?: { pas?: boolean; lebarMm?: number }) => Promise<{ ok: boolean; alasan?: string }>;
};

/*
 * LEBAR KERTAS = 72 mm (foto pemilik 15 Nov 2026: driver POS-80C memakai
 * kertas "72 × 297 mm"). Struk lama dibuat persis 72 mm tanpa ruang tepi,
 * jadi sisi kanannya ("Rp 29.000", "cash") terpotong. Sekarang halaman 72 mm,
 * isi mengisi lebar halaman dengan tepi 2 mm, dan PANJANG halaman diukur dari
 * isinya — tidak lagi menggulung 297 mm kertas kosong.
 */
export const LEBAR_KERTAS_MM = 72;

/*
 * HALAMAN SELALU TEGAK (pemilik 15 Nov 2026, foto CO): kertas yang lebih
 * pendek dari lebarnya (CO 2 baris ±40 mm) dibaca Chrome/Windows sebagai
 * LANDSCAPE, lalu diputar ke kertas 80 × 210 mm — struk tampil melintang.
 * Jadi panjang halaman paling sedikit sedikit lebih dari lebarnya.
 */
export const TINGGI_MIN_MM = LEBAR_KERTAS_MM + 6;

/** Untuk aplikasi Windows: isi yang pendek dipanjangkan supaya halaman yang diukur tetap tegak. */
const tegak = (html: string) =>
  html.replace("</head>", `<style>html,body{min-height:${TINGGI_MIN_MM}mm}</style></head>`);

const jembatan = (): Jembatan | null =>
  (globalThis as unknown as { splCetak?: Jembatan }).splCetak ?? null;

/** Apakah perangkat ini bisa mencetak tanpa dialog (aplikasi Windows)? */
export const cetakSenyapMungkin = () => !!jembatan();

const K_PRINTER = "spl:v1:printer";

export const printerTersimpan = (): string => {
  try { return window.localStorage.getItem(K_PRINTER) ?? ""; } catch { return ""; }
};

export const simpanPrinter = (nama: string) => {
  try { window.localStorage.setItem(K_PRINTER, nama); } catch { /* mode privat */ }
};

export const daftarPrinter = async () => (await jembatan()?.daftarPrinter()) ?? [];

/*
 * PRINTER YANG DIPILIH HARUS BENAR-BENAR ADA (pemilik 15 Nov 2026: "kalau bisa
 * di-setup di aplikasi untuk printer yang dipilih agar tidak error lagi").
 *
 * Penyebab galat paling sering: nama printer tersimpan, lalu printernya
 * dicabut, diganti, atau namanya berubah di Windows — Electron menolak dengan
 * "Invalid deviceName". Sekarang namanya dicocokkan dulu dengan daftar
 * printer yang terpasang; kalau tidak ada, struk dicetak ke printer BAWAAN
 * Windows (tetap tanpa dialog) dan kasir diberi tahu supaya memilih ulang.
 */
export type CekPrinter = { printer: string; catatan?: string };
export async function printerSah(nama: string): Promise<CekPrinter> {
  if (!nama) return { printer: "" };
  const ada = await daftarPrinter().catch(() => []);
  if (ada.length === 0 || ada.some((p) => p.nama === nama)) return { printer: nama };
  return { printer: "", catatan: `printer "${nama}" tidak ditemukan — dicetak ke printer bawaan Windows. Pilih ulang di Pengaturan → Printer.` };
}

type Hasil = { ok: boolean; alasan?: string };
const TANPA_JAWABAN: Hasil = { ok: false, alasan: "tidak ada jawaban dari printer" };

/**
 * Satu lembar struk ke printer struk. Kalau printer pilihan ditolak Windows
 * (nama tidak dikenal), diulang SEKALI ke printer bawaan — bukan untuk galat
 * lain, supaya kertas yang sebenarnya sudah keluar tidak tercetak dua kali.
 */
async function kirimStruk(j: Jembatan, html: string, nama: string): Promise<Hasil> {
  const sah = await printerSah(nama);
  const opsi = { pas: true, lebarMm: LEBAR_KERTAS_MM };
  const r = (await j.cetakHtml(tegak(html), sah.printer, opsi)) ?? TANPA_JAWABAN;
  if (!r.ok && sah.printer && /invalid|device|tidak ditemukan|not found/i.test(r.alasan ?? "")) {
    const r2 = (await j.cetakHtml(tegak(html), "", opsi)) ?? TANPA_JAWABAN;
    return r2.ok ? { ok: true, alasan: `printer "${nama}" menolak — dicetak ke printer bawaan Windows. Pilih ulang di Pengaturan → Printer.` } : r;
  }
  return r.ok && sah.catatan ? { ok: true, alasan: sah.catatan } : r;
}
/** Aplikasi Windows lama (≤ 1.3.0) menolak printer kosong. */
const aplikasiLama = (r: Hasil) => !r.ok && /printer belum dipilih/.test(r.alasan ?? "");

/**
 * Cetak apa yang sedang tampil. Di aplikasi Windows tanpa dialog; di peramban
 * lewat dialog bawaan. Mengembalikan alasan kalau gagal supaya layar bisa
 * memberi tahu kasir — bukan diam-diam tidak mencetak.
 */
/** Cetak SATU elemen struk tertentu (mis. bill otomatis saat paket habis), N lembar terpotong. */
export async function cetakElemen(el: HTMLElement, salinan = 1): Promise<{ ok: boolean; alasan?: string }> {
  const j = jembatan();
  const html = htmlStrukDariLayar(el);
  if (!j) return cetakLewatDialog(html, salinan);
  let catatan: string | undefined;
  for (let i = 0; i < Math.max(1, salinan); i++) {
    const r = await kirimStruk(j, html, printerTersimpan());
    if (!r.ok) return i > 0 ? { ok: true, alasan: `hanya ${i} dari ${salinan} lembar tercetak: ${r.alasan ?? ""}` } : r;
    catatan ??= r.alasan;
  }
  return { ok: true, alasan: catatan };
}

export async function cetakStruk(salinan = 1): Promise<{ ok: boolean; alasan?: string }> {
  const j = jembatan();
  /*
   * STRUK DICETAK SENDIRI, BUKAN SELURUH LAYAR (perbaikan 15 Nov 2026).
   *
   * Dulu yang dicetak adalah seluruh jendela panel dengan struk ditempel di
   * pojok atas. Halaman panel yang panjang dipecah Chromium jadi beberapa
   * halaman, dan struk yang "fixed" ikut tercetak di SETIAP halaman — dua
   * struk menyambung tanpa terpotong, ukurannya ikut jendela. Sekarang isi
   * #struk dicetak di jendela tersembunyi (cara yang sama dengan kertas
   * checker) selebar 72 mm, SATU perintah cetak per lembar: printer memotong
   * di akhir setiap perintah, jadi `salinan` = 2 menghasilkan dua struk yang
   * masing-masing terpotong.
   */
  const el = typeof document !== "undefined" ? document.getElementById("struk") : null;
  const printer = printerTersimpan();
  if (el) {
    const html = htmlStrukDariLayar(el);
    if (!j) return cetakLewatDialog(html, salinan);
    let catatan: string | undefined;
    for (let i = 0; i < Math.max(1, salinan); i++) {
      const r = await kirimStruk(j, html, printer);
      // Aplikasi Windows lama (≤ 1.3.0) menolak printer kosong: pakai cara lama.
      if (i === 0 && aplikasiLama(r)) break;
      if (!r.ok) return i > 0 ? { ok: true, alasan: `hanya ${i} dari ${salinan} lembar tercetak: ${r.alasan ?? ""}` } : r;
      catatan ??= r.alasan;
      if (i === Math.max(1, salinan) - 1) return { ok: true, alasan: catatan };
    }
  }
  // Cadangan (aplikasi lama tanpa printer dipilih): cara lama, printer bawaan Windows.
  if (!j) { window.print(); return { ok: true }; }
  const hasil = await j.cetak((await printerSah(printer)).printer);
  return hasil ?? TANPA_JAWABAN;
}

/** HTML utuh satu struk dari elemen #struk di layar, dengan gaya halaman ikut. */
function htmlStrukDariLayar(el: HTMLElement): string {
  const css = [...document.styleSheets].map((ss) => {
    try { return [...ss.cssRules].map((r) => r.cssText).join("\n"); } catch { return ""; }
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
@page { margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
*, *::before, *::after { box-sizing: border-box; }
#struk {
  position: static !important; visibility: visible !important; display: block !important;
  width: 100% !important; max-width: ${LEBAR_KERTAS_MM}mm !important; margin: 0 auto !important; padding: 1mm 2mm 2mm !important;
  border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
  background: #fff !important; color: #000 !important; font-size: 11px;
}
#struk * { visibility: visible !important; color: #000 !important; max-width: 100%; }
#struk table { width: 100% !important; table-layout: auto; }
</style></head><body>${el.outerHTML}</body></html>`;
}

/* ── Printer dapur dan bar ─────────────────────────────────────────
   Sama seperti printer struk: setelan perangkat. Komputer dapur memilih
   printer dapur, komputer bar memilih printer bar, dan masing-masing hanya
   mencetak bagiannya sendiri. */

type Bagian = "kitchen" | "bar";
const kunciPrinter = (b: Bagian) => `spl:v1:printer-${b}`;
const K_OTOMATIS = "spl:v1:cetak-otomatis";
const K_TERCETAK = "spl:v1:tercetak";
const BATAS_CATATAN = 1000;

export const printerBagian = (b: Bagian): string => {
  try { return window.localStorage.getItem(kunciPrinter(b)) ?? ""; } catch { return ""; }
};
export const simpanPrinterBagian = (b: Bagian, nama: string) => {
  try { window.localStorage.setItem(kunciPrinter(b), nama); } catch { /* mode privat */ }
};

/**
 * PRINTER KEDUA per bagian (permintaan pemilik 14 Nov 2026: "untuk SPL,
 * pastikan bisa pakai 2 printer untuk cetak checker"). Opsional: kalau
 * dipilih, setiap kertas keluar di DUA printer — mis. satu di checker, satu
 * di dapur. Kosong = satu printer seperti sebelumnya.
 */
const kunciPrinter2 = (b: Bagian) => `spl:v1:printer-${b}-2`;
export const printerBagian2 = (b: Bagian): string => {
  try { return window.localStorage.getItem(kunciPrinter2(b)) ?? ""; } catch { return ""; }
};
export const simpanPrinterBagian2 = (b: Bagian, nama: string) => {
  try { window.localStorage.setItem(kunciPrinter2(b), nama); } catch { /* mode privat */ }
};

export const cetakOtomatis = (): boolean => {
  try { return window.localStorage.getItem(K_OTOMATIS) === "1"; } catch { return false; }
};

/** Catatan yang sudah keluar, supaya memuat ulang panel tidak mencetak ulang. */
export const tiketTercetak = (): Set<string> => {
  try { return new Set(JSON.parse(window.localStorage.getItem(K_TERCETAK) ?? "[]") as string[]); }
  catch { return new Set(); }
};
export const tandaiTercetak = (kunci: string[]) => {
  const semua = [...tiketTercetak(), ...kunci].slice(-BATAS_CATATAN);
  try { window.localStorage.setItem(K_TERCETAK, JSON.stringify(semua)); } catch { /* mode privat */ }
};

/** Dinyalakan: tiket yang sudah ada dianggap tercetak supaya kertas tidak membanjir. */
export const aturCetakOtomatis = (nyala: boolean, tiketAda: string[]) => {
  if (nyala) tandaiTercetak(tiketAda);
  try { window.localStorage.setItem(K_OTOMATIS, nyala ? "1" : "0"); } catch { /* mode privat */ }
};

/** Di peramban lewat dialog cetak, dari bingkai tersembunyi supaya panelnya tidak ikut tercetak. */
/*
 * CETAK DI BROWSER (pemilik 15 Nov 2026: "double cetak struk ini masih harus
 * diisi manual angka 2-nya … kotak print-nya masih muncul").
 *
 * - DUA LEMBAR TANPA MENGETIK "2": kalau Chrome belum di-setup cetak langsung,
 *   dua salinan dikirim dalam SATU perintah cetak sebagai dua halaman, masing-
 *   masing setinggi struknya → sekali klik Print keluar 2 lembar.
 * - Kalau Chrome sudah dibuka lewat pintasan "cetak langsung" (--kiosk-printing),
 *   setiap salinan dikirim sebagai perintah cetak SENDIRI → printer memotong
 *   setiap lembar, tanpa kotak dialog.
 * - Mana yang berlaku diketahui dari lamanya `print()`: dengan kotak dialog
 *   halaman tertahan sampai kasir menekan Print; dengan cetak langsung ia
 *   kembali seketika. Kalau kotak dialog masih muncul, kasir diberi tahu cara
 *   mematikannya — bukan dibiarkan mengira itu memang begitu.
 */
const K_LANGSUNG = "spl:v1:cetak-langsung";
const cetakLangsungDiketahui = () => { try { return window.localStorage.getItem(K_LANGSUNG) === "1"; } catch { return false; } };
export const PESAN_KOTAK_DIALOG = "Kotak printer muncul karena Kasir dibuka di browser biasa. Supaya struk langsung keluar tanpa kotak: Pengaturan → Printer struk → ikuti 3 langkahnya (sekali saja).";

/** N salinan dalam satu dokumen, satu salinan per halaman. */
export function gandakan(html: string, n: number): string {
  const m = /<body([^>]*)>([\s\S]*)<\/body>/i.exec(html);
  if (n <= 1 || !m) return html;
  const satu = `<div class="spl-salinan">${m[2]}</div>`;
  const gaya = "<style>.spl-salinan{break-after:page;page-break-after:always}.spl-salinan:last-child{break-after:auto;page-break-after:auto}</style>";
  return html.replace(m[0], `<body${m[1]}>${Array.from({ length: n }, () => satu).join("")}</body>`).replace("</head>", `${gaya}</head>`);
}

/** Satu perintah cetak lewat bingkai tersembunyi. `dialog` = kotak printer sempat muncul. */
function satuPerintah(html: string, salinan: number): Promise<{ ok: boolean; dialog: boolean }> {
  return new Promise((selesai) => {
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-modals allow-same-origin");
    // Selebar kertas (bukan 0) supaya panjang isinya bisa diukur; tetap tidak terlihat.
    f.style.cssText = `position:fixed;left:-10000px;top:0;width:${LEBAR_KERTAS_MM}mm;height:400px;border:0;visibility:hidden`;
    f.srcdoc = gandakan(html, salinan);
    f.onload = () => {
      // Kertas setinggi SATU struk: tanpa ini Chrome memakai panjang bawaan
      // driver (297 mm) dan printer menggulung kertas kosong sebelum memotong.
      try {
        const d = f.contentDocument!;
        const pertama = d.querySelector(".spl-salinan");
        const bawah = pertama ? pertama.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(d.body).paddingBottom) || 0)
          : d.body.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(d.body).marginBottom) || 0);
        const mm = Math.max(TINGGI_MIN_MM, Math.ceil(Math.ceil(bawah) * 25.4 / 96) + 4);
        const gaya = d.createElement("style");
        gaya.textContent = `@page { size: ${LEBAR_KERTAS_MM}mm ${mm}mm; margin: 0; }`;
        d.head.appendChild(gaya);
      } catch { /* tetap cetak dengan ukuran bawaan */ }
      const mulai = performance.now();
      f.contentWindow?.print();
      const dialog = performance.now() - mulai > 400;
      try { window.localStorage.setItem(K_LANGSUNG, dialog ? "0" : "1"); } catch { /* mode privat */ }
      setTimeout(() => { f.remove(); selesai({ ok: true, dialog }); }, 600);
    };
    document.body.appendChild(f);
  });
}

async function cetakLewatDialog(html: string, salinan = 1): Promise<{ ok: boolean; alasan?: string }> {
  const n = Math.max(1, salinan);
  if (n > 1 && cetakLangsungDiketahui()) {
    // Cetak langsung: satu perintah per lembar → terpotong per lembar.
    for (let i = 0; i < n; i++) {
      const r = await satuPerintah(html, 1);
      if (r.dialog) return { ok: true, alasan: PESAN_KOTAK_DIALOG };
    }
    return { ok: true };
  }
  const r = await satuPerintah(html, n);
  return r.dialog ? { ok: true, alasan: PESAN_KOTAK_DIALOG } : { ok: true };
}

/** Kertas dapur: tanpa dialog di aplikasi Windows, lewat dialog di peramban. */
export async function cetakKertas(html: string, b: Bagian): Promise<{ ok: boolean; alasan?: string }> {
  const j = jembatan();
  if (!j) return cetakLewatDialog(html);
  const printer = printerBagian(b);
  if (!printer) return { ok: false, alasan: `pilih printer ${b === "bar" ? "bar" : "dapur"} di Pengaturan` };
  // Printer dapur TIDAK dialihkan ke printer bawaan: di PC kasir itu printer
  // struk, dan kertas dapur yang keluar di kasir sama saja dengan hilang.
  if ((await printerSah(printer)).catatan) {
    return { ok: false, alasan: `printer ${b === "bar" ? "bar" : "dapur"} "${printer}" tidak ditemukan di komputer ini — pilih ulang di Pengaturan → Printer` };
  }
  const r1 = (await j.cetakHtml(tegak(html), printer, { pas: true, lebarMm: LEBAR_KERTAS_MM })) ?? TANPA_JAWABAN;
  // Printer kedua dicetak sesudah yang pertama berhasil. Kalau yang KEDUA
  // gagal, kertasnya tetap dianggap keluar (yang utama sudah) — tapi kasir
  // diberi tahu, supaya tidak dicetak ulang dua-duanya tiap 30 detik.
  const kedua = printerBagian2(b);
  if (!r1.ok || !kedua || kedua === printer) return r1;
  const r2 = (await j.cetakHtml(tegak(html), kedua, { pas: true, lebarMm: LEBAR_KERTAS_MM })) ?? { ok: false, alasan: "tidak ada jawaban" };
  return r2.ok ? r1 : { ok: true, alasan: `printer kedua (${kedua}) gagal: ${r2.alasan ?? "tidak menjawab"}` };
}

/**
 * Struk rekap harian (HTML 80 mm utuh, dari `strukRekap.ts`) ke PRINTER STRUK
 * kasir. Di aplikasi Windows tanpa dialog; di peramban lewat dialog cetak.
 */
export async function cetakHtmlStruk(html: string, salinan = 1): Promise<{ ok: boolean; alasan?: string }> {
  const j = jembatan();
  if (!j) return cetakLewatDialog(html, salinan);
  // Printer struk belum dipilih = printer bawaan Windows, tetap tanpa dialog.
  // Satu perintah cetak per lembar → printer memotong setiap lembar.
  let catatan: string | undefined;
  for (let i = 0; i < Math.max(1, salinan); i++) {
    const r = await kirimStruk(j, html, printerTersimpan());
    if (aplikasiLama(r)) return { ok: false, alasan: "pilih printer struk di Pengaturan → Printer, atau perbarui aplikasi Windows ke versi terbaru" };
    if (!r.ok) return i > 0 ? { ok: true, alasan: `hanya ${i} dari ${salinan} lembar tercetak: ${r.alasan ?? ""}` } : r;
    catatan ??= r.alasan;
  }
  return { ok: true, alasan: catatan };
}

/** Struk percobaan: kecil, supaya terlihat apakah kertas terpotong pas di bawah tulisan terakhir. */
export function htmlStrukContoh(printer: string): string {
  const waktu = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
* { box-sizing: border-box; }
.s { width: 100%; max-width: ${LEBAR_KERTAS_MM}mm; margin: 0 auto; padding: 1mm 2mm 2mm; font: 12px/1.35 ui-monospace, Consolas, monospace; text-align: center; }
.b { font-weight: 700; font-size: 14px; }
hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
</style></head><body><div class="s">
<div class="b">SPL · PERCOBAAN PRINTER</div>
<div>${printer ? printer.replace(/[<>&]/g, "") : "printer bawaan Windows"}</div>
<div>${waktu}</div><hr>
<div>Kalau tulisan ini terbaca dan kertas</div>
<div>terpotong pas di bawah garis ini,</div>
<div>printer struk siap dipakai.</div><hr>
</div></body></html>`;
}
