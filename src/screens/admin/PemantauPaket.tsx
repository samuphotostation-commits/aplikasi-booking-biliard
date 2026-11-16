/**
 * PEMANTAU PAKET HABIS (pemilik 16 Nov 2026) — dipasang sekali di kerangka admin.
 *
 * Saat waktu paket/booking habis:
 *   1. LAMPU MATI TANPA JEDA. Mesin sudah mematikan lampunya saat menghitung,
 *      tapi relay ESP32 baru menerima status baru ketika server menerbitkan
 *      ulang — dulu menunggu cron tiap menit ("percobaan delay 1 menit").
 *      Sekarang perangkat kasir yang sedang terbuka mengirim satu kejadian
 *      `tick` begitu paketnya habis, sehingga server langsung menerbitkan.
 *   2. BILL KELUAR OTOMATIS DI PC YANG MEMBUKA MEJANYA. Saat meja paket dibuka,
 *      perangkat itu mencatat ID tab-nya di penyimpanannya sendiri; saat
 *      waktunya habis, hanya perangkat itu yang mencetak bill 2 lembar —
 *      PC kasir lain tidak ikut mencetak.
 *   3. Meja kosong & tagihan pindah ke Kasir dikerjakan mesin
 *      (`selesaikanPaketHabis`), jadi sama di semua perangkat.
 */
import { useEffect, useRef, useState } from "react";
import {
  useAdmin, settlementOf, splitPaidOf, itemOf, namaMeja, sesiBerwaktu, type State,
} from "../../lib/adminStore";
import type { LiveSession } from "../../data/live";
import { venueDari, type Venue } from "../../data/venue";
import { cetakElemen } from "../../lib/cetak";
import { StrukResmi, barisStruk, infoMain, nomorStruk, type DataStruk } from "./StrukResmi";

const K_DIBUKA = "spl:v1:dibuka-di-sini";
const BATAS_CATATAN = 200;

type Catatan = { id: string; at: number }[];
const baca = (): Catatan => {
  try { return JSON.parse(window.localStorage.getItem(K_DIBUKA) ?? "[]") as Catatan; } catch { return []; }
};
const tulis = (x: Catatan) => {
  try { window.localStorage.setItem(K_DIBUKA, JSON.stringify(x.slice(-BATAS_CATATAN))); } catch { /* mode privat */ }
};

/** Catat: meja paket ini dibuka DARI PERANGKAT INI (bill-nya dicetak di sini saat habis). */
export function catatDibukaDiSini(id: string) {
  const x = baca().filter((c) => c.id !== id);
  tulis([...x, { id, at: Date.now() }]);
}

/**
 * Tab paket yang baru saja habis waktunya. Termasuk yang MASIH di mejanya
 * (tempat tagihan di Kasir sedang penuh, atau tiknya belum diproses) — bill
 * tetap keluar walau mejanya belum bisa dikosongkan.
 */
const baruHabis = (x: LiveSession, now: number) => now - x.endsAt < 30 * 60_000 && (
  (x.status === "running" && !!x.mejaAsal)
  || (x.status === "running" && sesiBerwaktu(x) && now >= x.endsAt)
  || (x.status === "done" && x.settledAt === x.endsAt && !x.settledChannel && (x.settledAmount ?? 0) === 0));

function dataBill(st: State, s: LiveSession): DataStruk {
  const jalan = s.status === "running";
  const bill = settlementOf(s, st, s.endsAt);
  const meja = s.mejaAsal ?? s.tableId;
  return {
    no: nomorStruk(s.id),
    ...infoMain(st, s, venueDari(meja), false, s.endsAt),
    meja: namaMeja(st, meja), tamu: s.guest, mulai: s.startsAt, selesai: s.endsAt,
    menit: bill.detail?.billedMinutes ?? null,
    billiard: bill.billiard, fnb: bill.fnb, diskon: bill.discount, pembulatan: bill.pembulatan,
    prabayar: s.paidOnline + splitPaidOf(s), bayar: jalan ? bill.due : s.paidOnline + splitPaidOf(s),
    metode: jalan ? "belum dibayar" : s.uji ? "Paket uji (Rp 0)" : "Lunas",
    kasir: st.me?.name ?? "-",
    belumLunas: jalan && bill.due > 0,
    items: s.fnb.map((l) => barisStruk(l, (id) => itemOf(st, id))),
  };
}

export default function PemantauPaket() {
  const { dispatchA, peek } = useAdmin();
  const sudahDetak = useRef(new Set<string>());
  const sedangCetak = useRef(false);
  const lembar = useRef<HTMLDivElement>(null);
  const [cetak, setCetak] = useState<{ data: DataStruk; venue: Venue } | null>(null);

  useEffect(() => {
    const iv = window.setInterval(() => {
      const now = Date.now();
      const st = peek();
      // 1) Lampu mati seketika: satu kejadian `tick` per tab yang baru habis.
      for (const x of st.sessions) {
        if (baruHabis(x, now) && !sudahDetak.current.has(x.id)) {
          sudahDetak.current.add(x.id);
          dispatchA({ t: "tick" });
          break;
        }
      }
      // 2) Bill otomatis — hanya untuk tab yang dibuka dari perangkat ini.
      if (sedangCetak.current) return;
      const catatan = baca();
      for (const c of catatan) {
        const s = st.sessions.find((x) => x.id === c.id);
        if (!s) { if (now - c.at > 2 * 24 * 3_600_000) tulis(baca().filter((y) => y.id !== c.id)); continue; }
        if (!baruHabis(s, now)) {
          if (s.status === "done" || s.status === "noshow") tulis(baca().filter((y) => y.id !== c.id));
          continue;
        }
        tulis(baca().filter((y) => y.id !== c.id));
        sedangCetak.current = true;
        setCetak({ data: dataBill(st, s), venue: venueDari(s.mejaAsal ?? s.tableId) });
        break;
      }
    }, 2000);
    return () => window.clearInterval(iv);
  }, [dispatchA, peek]);

  // Setelah struknya tergambar: cetak 2 lembar, lalu bersihkan.
  useEffect(() => {
    if (!cetak) return;
    const t = window.setTimeout(() => {
      const el = lembar.current?.querySelector<HTMLElement>("#struk");
      const selesai = () => { sedangCetak.current = false; setCetak(null); };
      if (!el) { selesai(); return; }
      void cetakElemen(el, 2).finally(selesai);
    }, 300);
    return () => window.clearTimeout(t);
  }, [cetak]);

  return (
    <div ref={lembar} className="cetak-saja" aria-hidden="true">
      {cetak && <StrukResmi data={cetak.data} venue={cetak.venue} />}
    </div>
  );
}
