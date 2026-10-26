/**
 * VENUE YANG SEDANG DIBUKA di perangkat ini — SPL Sport atau Smokehouse.
 *
 * Ini setelan PERANGKAT, bukan data venue: komputer kasir biliar selalu
 * membuka SPL, komputer kasir resto selalu membuka Smokehouse. Kalau
 * disimpan di jejak, satu kasir berganti venue akan ikut mengganti layar
 * semua orang — dan itu persis yang tidak boleh terjadi saat ramai.
 *
 * Keputusan pemilik 8 Okt 2026: rekap kedua venue harus TERPISAH. Pilihan di
 * sini yang menentukan venue mana yang ditampilkan dan dilaporkan; rekap
 * gabungan disediakan terpisah untuk pemilik.
 */
import { useSyncExternalStore } from "react";
import type { Venue } from "../data/venue";

const KUNCI = "spl:v1:venue-aktif";
const pendengar = new Set<() => void>();

const bacaSimpanan = (): Venue => {
  try {
    return window.localStorage.getItem(KUNCI) === "smh" ? "smh" : "spl";
  } catch {
    return "spl";   // mode privat: SPL sebagai bawaan
  }
};

let kini: Venue = typeof window === "undefined" ? "spl" : bacaSimpanan();

export const venueAktif = () => kini;

export function setVenueAktif(v: Venue) {
  if (v === kini) return;
  kini = v;
  try { window.localStorage.setItem(KUNCI, v); } catch { /* mode privat */ }
  for (const fn of pendengar) fn();
}

function berlangganan(fn: () => void) {
  pendengar.add(fn);
  // Tab lain di komputer yang sama ikut berpindah.
  const onSimpan = (e: StorageEvent) => {
    if (e.key !== KUNCI) return;
    kini = e.newValue === "smh" ? "smh" : "spl";
    fn();
  };
  window.addEventListener("storage", onSimpan);
  return () => {
    pendengar.delete(fn);
    window.removeEventListener("storage", onSimpan);
  };
}

/** Venue yang sedang dibuka, ikut berubah sendiri saat dipindah. */
export const useVenueAktif = (): Venue =>
  useSyncExternalStore(berlangganan, venueAktif, () => "spl" as Venue);

/* ═════════════ Sisi TAMU ═════════════
   Kuncinya sengaja BEDA dari pilihan venue staf. Kalau disatukan, kasir yang
   iseng membuka halaman pelanggan di komputernya akan ikut memindahkan papan
   dan rekap venue-nya — dan itu baru ketahuan saat angkanya terlihat aneh.
   Dipakai supaya pesanan dari halaman Smokehouse masuk rekap Smokehouse. */

const KUNCI_TAMU = "spl:v1:venue-tamu";
const pendengarTamu = new Set<() => void>();

let kiniTamu: Venue = "spl";
try {
  if (typeof window !== "undefined") {
    kiniTamu = window.localStorage.getItem(KUNCI_TAMU) === "smh" ? "smh" : "spl";
  }
} catch { /* mode privat */ }

export const venueTamu = () => kiniTamu;

export function setVenueTamu(v: Venue) {
  if (v === kiniTamu) return;
  kiniTamu = v;
  try { window.localStorage.setItem(KUNCI_TAMU, v); } catch { /* mode privat */ }
  for (const fn of pendengarTamu) fn();
}

export const useVenueTamu = (): Venue =>
  useSyncExternalStore(
    (fn) => { pendengarTamu.add(fn); return () => pendengarTamu.delete(fn); },
    venueTamu,
    () => "spl" as Venue,
  );
