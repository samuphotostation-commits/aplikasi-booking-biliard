/* ═══════════════════════════════════════════════════════════════════
   JEJAK TAMU DI PERANGKAT INI — DAN CARA MELUPAKANNYA

   Masalah yang diperbaiki: riwayat booking tersimpan di HP (daftar kode di
   `spl:v1:kode-saya` dan catatan di `spl:v1:customer`). Keduanya BERTAHAN
   sesudah tamu keluar dari akun — jadi begitu orang lain masuk dengan akunnya
   sendiri di perangkat yang sama, yang muncul masih booking pemilik akun
   sebelumnya. Itu kebocoran data antar-akun, bukan sekadar tampilan salah.

   Berkas ini satu-satunya pemegang kunci penyimpanan itu, plus satu perintah
   untuk MELUPAKAN semuanya. `member.ts` memanggilnya setiap token member
   berubah (masuk, daftar, masuk lewat Google, maupun keluar), dan penyimpan
   lain ikut membersihkan diri lewat kejadian `spl:ganti-akun`.

   Ditaruh terpisah supaya tidak ada import melingkar: member.ts dan
   customerStore.ts sama-sama boleh memakainya.
   ═══════════════════════════════════════════════════════════════════ */

const K_KODE = "spl:v1:kode-saya";

/** Dipancarkan saat pemilik perangkat berganti. Penyimpan lain ikut bersih-bersih. */
export const EVENT_GANTI_AKUN = "spl:ganti-akun";

export const kodeTersimpan = (): string[] => {
  try { return JSON.parse(window.localStorage.getItem(K_KODE) ?? "[]") as string[]; } catch { return []; }
};

export const simpanKode = (kode: string[]) => {
  try { window.localStorage.setItem(K_KODE, JSON.stringify(kode.slice(-20))); } catch { /* mode privat */ }
};

export const catatKode = (kode: string) => simpanKode([...kodeTersimpan(), kode]);

/**
 * Buang semua jejak tamu sebelumnya dari perangkat ini. Dipanggil saat akun
 * berganti — termasuk saat keluar, karena perangkat bersama (HP kasir, tablet
 * lobi) paling sering dipakai bergantian.
 */
export function lupakanJejakTamu() {
  try { window.localStorage.removeItem(K_KODE); } catch { /* mode privat */ }
  try { window.dispatchEvent(new Event(EVENT_GANTI_AKUN)); } catch { /* bukan browser */ }
}
