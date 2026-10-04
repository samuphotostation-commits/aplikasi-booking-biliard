/**
 * Jembatan sempit antara halaman kasir dan Electron — HANYA untuk mencetak.
 *
 * Kenapa ada: di peramban, mencetak struk selalu memunculkan dialog cetak.
 * Untuk kasir yang menutup puluhan tab semalam, itu satu ketukan tambahan
 * setiap kali dan sumber salah pilih printer. Di aplikasi Windows, Electron
 * bisa mencetak LANGSUNG ke printer struk yang sudah dipilih pemilik.
 *
 * Yang dibuka ke halaman sengaja cuma tiga hal, tidak ada akses berkas atau
 * Node sama sekali: daftar printer, cetak senyap, dan penanda "ini aplikasi
 * Windows" supaya versi web tahu harus memakai window.print() biasa.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("splCetak", {
  /** Penanda: hanya ada di aplikasi Windows. Versi web tidak punya ini. */
  tersedia: true,
  /** Nama printer yang terpasang di komputer ini. */
  daftarPrinter: () => ipcRenderer.invoke("spl:daftar-printer"),
  /**
   * Cetak halaman yang sedang tampil tanpa dialog.
   * `printer` kosong = printer bawaan Windows.
   * Mengembalikan { ok } atau { ok: false, alasan }.
   */
  cetak: (printer) => ipcRenderer.invoke("spl:cetak", printer ?? ""),
});
