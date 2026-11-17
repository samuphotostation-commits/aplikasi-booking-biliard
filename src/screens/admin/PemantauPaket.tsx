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
  useAdmin, settlementOf, splitPaidOf, itemOf, namaMeja, sesiBerwaktu, businessDateOf, type State,
} from "../../lib/adminStore";
import type { LiveSession } from "../../data/live";
import { venueDari, type Venue } from "../../data/venue";
import { cetakElemen } from "../../lib/cetak";
import { rupiah } from "../../lib/core";
import { StrukResmi, barisStruk, infoMain, nomorStruk, type DataStruk } from "./StrukResmi";

const K_DIBUKA = "spl:v1:dibuka-di-sini";
/** Bill paket habis yang SUDAH dicetak di perangkat ini (otomatis atau manual). */
const K_TERCETAK = "spl:v1:bill-paket-tercetak";
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

const bacaTercetak = (): string[] => {
  try { return JSON.parse(window.localStorage.getItem(K_TERCETAK) ?? "[]") as string[]; } catch { return []; }
};
function tandaiTercetak(id: string) {
  try {
    const x = bacaTercetak().filter((y) => y !== id);
    window.localStorage.setItem(K_TERCETAK, JSON.stringify([...x, id].slice(-BATAS_CATATAN)));
  } catch { /* mode privat */ }
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

export function dataBill(st: State, s: LiveSession): DataStruk {
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
        tandaiTercetak(s.id);
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

/** Paket/booking yang waktunya sudah habis HARI INI (tagihan di Kasir atau tab yang ditutup otomatis). */
const paketHabisHariIni = (x: LiveSession, now: number, hari: string) =>
  sesiBerwaktu(x) && !x.uji && x.endsAt <= now && businessDateOf(x.endsAt) === hari && (
    x.status === "running"
    || (x.status === "done" && x.settledAt === x.endsAt && !x.settledChannel));

/*
 * DAFTAR BILL PAKET HABIS DI KASIR (temuan 17 Nov 2026: "pastikan bill paket
 * jika habis keluar otomatis; kalau tidak, buatkan kolom di Kasir untuk bill
 * yang belum keluar, lengkap dengan datanya"). Semua paket yang habis hari
 * ini, yang belum tercetak di PC ini paling atas, masing-masing dengan
 * tombol cetak 2 lembar.
 */
export function DaftarBillPaket({ venue }: { venue: Venue }) {
  const { a, tick } = useAdmin();
  void tick;
  const now = Date.now();
  const [, segarkan] = useState(0);
  const [cetak, setCetak] = useState<{ data: DataStruk; venue: Venue; id: string } | null>(null);
  const lembar = useRef<HTMLDivElement>(null);
  const tercetak = new Set(bacaTercetak());
  const hari = businessDateOf(now);
  const daftar = a.sessions
    .filter((x) => venueDari(x.mejaAsal ?? x.tableId) === venue && paketHabisHariIni(x, now, hari))
    .sort((x, y) => Number(tercetak.has(x.id)) - Number(tercetak.has(y.id)) || y.endsAt - x.endsAt);

  useEffect(() => {
    if (!cetak) return;
    const t = window.setTimeout(() => {
      const el = lembar.current?.querySelector<HTMLElement>("#struk");
      const selesai = () => { tandaiTercetak(cetak.id); setCetak(null); segarkan((n) => n + 1); };
      if (!el) { setCetak(null); return; }
      void cetakElemen(el, 2).finally(selesai);
    }, 300);
    return () => window.clearTimeout(t);
  }, [cetak]);

  if (daftar.length === 0) return null;
  const belum = daftar.filter((x) => !tercetak.has(x.id)).length;
  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-red-400/50 bg-red-500/5">
      <div className="flex items-center justify-between border-b border-red-400/30 px-3 py-2">
        <span className="text-[12px] font-bold uppercase tracking-wider text-red-200">Bill paket habis</span>
        <span className="text-[11px] text-red-200/80">{belum > 0 ? `${belum} belum tercetak di PC ini` : "semua sudah tercetak"}</span>
      </div>
      <ul className="divide-y divide-line">
        {daftar.map((x) => {
          const meja = x.mejaAsal ?? x.tableId;
          const bill = settlementOf(x, a, x.endsAt);
          const sudah = tercetak.has(x.id);
          const lunas = x.status === "done" || bill.due <= 0;
          return (
            <li key={x.id} className="flex items-center gap-2.5 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-cream">
                  {namaMeja(a, meja)} · {x.guest || "Tamu"}
                </div>
                <div className="truncate text-[11px] text-dim">
                  {jamTeks(x.startsAt)}–{jamTeks(x.endsAt)} · {lunas ? "lunas" : `tagihan ${rupiah(bill.dueTampil)}`}
                  {sudah ? " · sudah dicetak" : ""}
                </div>
              </div>
              <button disabled={!!cetak}
                onClick={() => setCetak({ data: dataBill(a, x), venue: venueDari(meja), id: x.id })}
                className={`min-h-[36px] shrink-0 rounded-lg px-3 text-[12px] font-bold disabled:opacity-40 ${
                  sudah ? "border border-line text-mute hover:text-cream" : "bg-amber text-ink"}`}>
                {cetak?.id === x.id ? "Mencetak…" : sudah ? "Cetak lagi" : "Cetak bill"}
              </button>
            </li>
          );
        })}
      </ul>
      <div ref={lembar} className="cetak-saja" aria-hidden="true">
        {cetak && <StrukResmi data={cetak.data} venue={cetak.venue} />}
      </div>
    </section>
  );
}

const jamTeks = (ts: number) => new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
