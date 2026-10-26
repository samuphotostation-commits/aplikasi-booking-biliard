/**
 * PENGAWAS KEJADIAN YANG PERLU DIKABARKAN — SPL-5.
 *
 * Satu pengawas dipasang di kerangka panel (bukan di tiap layar), supaya
 * reservasi yang masuk tetap terdengar walau yang sedang dibuka tab Rekap.
 *
 * SIAPA MENDAPAT KABAR APA ditentukan perannya, bukan tab yang terbuka:
 * dapur tidak perlu tahu reservasi malam depan, dan kasir tidak perlu
 * mendengar tiap gorengan masuk — yang kasir perlu dengar adalah pesanan
 * SELESAI, karena itu dia yang mengantarnya.
 *
 * Daftar pertama selalu DISEMAI DIAM-DIAM. Tanpa itu, membuka panel jam
 * delapan malam akan membunyikan dua puluh tiket yang sudah ada, dan setelah
 * satu kali begitu, suaranya akan dimatikan selamanya oleh yang bekerja.
 */
import { useEffect, useRef } from "react";
import type { Role } from "../data/staff";
import type { State } from "./engine";
import { kabarkan } from "./notifikasi";

const DAPUR: Role[] = ["superadmin", "manager", "kru_kitchen", "kru_bar"];
const LANTAI: Role[] = ["superadmin", "manager", "kru_kasir", "karyawan"];

/**
 * Yang BARU muncul sejak panggilan sebelumnya.
 *
 * `simpan` dibaca DAN diperbarui: `null` berarti belum disemai, dan semaian
 * pertama tidak mengembalikan apa pun. Dipisah dari hooknya supaya aturan ini
 * bisa diuji tanpa peramban — ini satu-satunya bagian yang kalau salah
 * membuat layar dapur berbunyi dua puluh kali saat dibuka.
 */
export function yangBaru<T>(simpan: { current: Set<string> | null }, kini: Map<string, T>): T[] {
  if (simpan.current === null) {
    simpan.current = new Set(kini.keys());
    return [];
  }
  const keluar: T[] = [];
  for (const [id, nilai] of kini) {
    if (!simpan.current.has(id)) { simpan.current.add(id); keluar.push(nilai); }
  }
  // Yang sudah hilang dilupakan supaya himpunannya tidak tumbuh selamanya.
  for (const id of [...simpan.current]) if (!kini.has(id)) simpan.current.delete(id);
  return keluar;
}

export function usePantauKabar(a: State, role: Role | null) {
  /** null = belum disemai; sesudahnya berisi yang sudah pernah dilihat. */
  const tiketBaru = useRef<Set<string> | null>(null);
  const tiketSiap = useRef<Set<string> | null>(null);
  const reservasi = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!role) return;

    if (DAPUR.includes(role)) {
      const masuk = yangBaru(tiketBaru, new Map(
        a.tickets.filter((t) => t.status === "new").map((t) => [t.id, t] as const),
      ));
      if (masuk.length) {
        const satu = masuk[0];
        kabarkan("masuk",
          masuk.length === 1 ? "Pesanan baru" : `${masuk.length} pesanan baru`,
          masuk.length === 1
            ? `${satu.qty}× ${satu.name} · ${satu.tableName}`
            : masuk.map((t) => `${t.qty}× ${t.name}`).join(", "),
          "dapur-masuk");
      }
    }

    if (LANTAI.includes(role)) {
      const siap = yangBaru(tiketSiap, new Map(
        a.tickets.filter((t) => t.status === "ready").map((t) => [t.id, t] as const),
      ));
      if (siap.length) {
        const satu = siap[0];
        kabarkan("siap",
          siap.length === 1 ? "Pesanan siap diantar" : `${siap.length} pesanan siap diantar`,
          siap.length === 1
            ? `${satu.qty}× ${satu.name} · ${satu.tableName}`
            : siap.map((t) => `${t.tableName}: ${t.name}`).join(", "),
          "dapur-siap");
      }

      // Reservasi & booking online yang baru masuk. `hold` tidak ikut: slotnya
      // masih dibayar dan sering dilepas sendiri — mengabarkannya membuat
      // kasir berlari ke layar untuk sesuatu yang belum tentu jadi.
      const masukReservasi = yangBaru(reservasi, new Map(
        a.sessions
          .filter((s) => s.source === "online" && s.status === "booked")
          .map((s) => [s.id, s] as const),
      ));
      if (masukReservasi.length) {
        const satu = masukReservasi[0];
        const jam = new Date(satu.startsAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        kabarkan("reservasi",
          masukReservasi.length === 1 ? "Reservasi masuk" : `${masukReservasi.length} reservasi masuk`,
          masukReservasi.length === 1
            ? `${satu.guest} · ${jam}${satu.bookingCode ? ` · ${satu.bookingCode}` : ""}`
            : masukReservasi.map((s) => s.guest).join(", "),
          "reservasi-masuk");
      }
    }
  }, [a.tickets, a.sessions, role]);
}
