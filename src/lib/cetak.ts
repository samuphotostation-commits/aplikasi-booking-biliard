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
  cetakHtml: (html: string, printer: string) => Promise<{ ok: boolean; alasan?: string }>;
};

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

/**
 * Cetak apa yang sedang tampil. Di aplikasi Windows tanpa dialog; di peramban
 * lewat dialog bawaan. Mengembalikan alasan kalau gagal supaya layar bisa
 * memberi tahu kasir — bukan diam-diam tidak mencetak.
 */
export async function cetakStruk(): Promise<{ ok: boolean; alasan?: string }> {
  const j = jembatan();
  if (!j) { window.print(); return { ok: true }; }
  const hasil = await j.cetak(printerTersimpan());
  return hasil ?? { ok: false, alasan: "tidak ada jawaban dari printer" };
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
function cetakLewatDialog(html: string): Promise<{ ok: boolean }> {
  return new Promise((selesai) => {
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-modals allow-same-origin");
    f.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    f.srcdoc = html;
    f.onload = () => {
      f.contentWindow?.print();
      setTimeout(() => { f.remove(); selesai({ ok: true }); }, 1000);
    };
    document.body.appendChild(f);
  });
}

/** Kertas dapur: tanpa dialog di aplikasi Windows, lewat dialog di peramban. */
export async function cetakKertas(html: string, b: Bagian): Promise<{ ok: boolean; alasan?: string }> {
  const j = jembatan();
  if (!j) return cetakLewatDialog(html);
  const printer = printerBagian(b);
  if (!printer) return { ok: false, alasan: `pilih printer ${b === "bar" ? "bar" : "dapur"} di Pengaturan` };
  const r1 = (await j.cetakHtml(html, printer)) ?? { ok: false, alasan: "tidak ada jawaban dari printer" };
  // Printer kedua dicetak sesudah yang pertama berhasil. Kalau yang KEDUA
  // gagal, kertasnya tetap dianggap keluar (yang utama sudah) — tapi kasir
  // diberi tahu, supaya tidak dicetak ulang dua-duanya tiap 30 detik.
  const kedua = printerBagian2(b);
  if (!r1.ok || !kedua || kedua === printer) return r1;
  const r2 = (await j.cetakHtml(html, kedua)) ?? { ok: false, alasan: "tidak ada jawaban" };
  return r2.ok ? r1 : { ok: true, alasan: `printer kedua (${kedua}) gagal: ${r2.alasan ?? "tidak menjawab"}` };
}

/**
 * Struk rekap harian (HTML 80 mm utuh, dari `strukRekap.ts`) ke PRINTER STRUK
 * kasir. Di aplikasi Windows tanpa dialog; di peramban lewat dialog cetak.
 */
export async function cetakHtmlStruk(html: string): Promise<{ ok: boolean; alasan?: string }> {
  const j = jembatan();
  if (!j) return cetakLewatDialog(html);
  const printer = printerTersimpan();
  if (!printer) return { ok: false, alasan: "pilih printer struk dulu di Pengaturan → Printer & layar" };
  return (await j.cetakHtml(html, printer)) ?? { ok: false, alasan: "tidak ada jawaban dari printer" };
}
