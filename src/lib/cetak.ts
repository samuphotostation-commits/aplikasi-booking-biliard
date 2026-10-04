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
