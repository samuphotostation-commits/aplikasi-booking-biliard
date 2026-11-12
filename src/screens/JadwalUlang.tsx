/**
 * JADWAL ULANG GRATIS SEKALI — dari menu Pesanan Saya.
 *
 * Keputusan pemilik 8 Nov 2026 (panel 100 pembeli): booking yang sudah dibayar
 * boleh dipindah satu kali, paling lambat 3 jam sebelum main, ke jadwal dalam
 * 14 hari. Jadwal baru lebih mahal: selisihnya dibayar QRIS di layar ini.
 * Lebih murah: selisih tidak dikembalikan.
 *
 * Semua aturannya milik mesin (`jadwalUlangProblem`), layar ini hanya
 * menawarkan pilihan yang pasti diterima.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "../components/UI";
import { QrGambar } from "../components/QrGambar";
import { useAdmin, classOf, jadwalUlangProblem, JADWAL_ULANG_BATAS_JAM, JADWAL_ULANG_HARI } from "../lib/adminStore";
import { CLOSE_HOUR, OPEN_HOUR, SEMUA_MEJA, fmtHour } from "../data/venue";
import { addDaysISO, fmtDateShort, rupiah, todayISO } from "../lib/core";
import { slotStart } from "../lib/occupancy";
import { buatQris, statusQris, type QrisTagihan } from "../lib/qris";
import { tokenMember } from "../lib/member";
import type { LiveSession } from "../data/live";

type Pilihan = { tableId: string; startsAt: number; selisih: number };

/** Boleh menawarkan jadwal ulang untuk booking ini? null = boleh. */
export function alasanTidakBisa(s: LiveSession, now = Date.now()): string | null {
  if (s.source !== "online" || s.status !== "booked") return "Hanya booking yang sudah dibayar dan belum check-in.";
  if (s.jadwalUlang) return "Jatah jadwal ulang gratis sudah dipakai.";
  if (now > s.startsAt - JADWAL_ULANG_BATAS_JAM * 3_600_000) return `Jadwal ulang paling lambat ${JADWAL_ULANG_BATAS_JAM} jam sebelum jam main.`;
  return null;
}

export function JadwalUlang({ sesi, onTutup }: { sesi: LiveSession; onTutup: () => void }) {
  const { a, dispatchA } = useAdmin();
  const hari = useMemo(() => Array.from({ length: JADWAL_ULANG_HARI }, (_, i) => addDaysISO(todayISO(), i)), []);
  const [tanggal, setTanggal] = useState(hari[0]);
  const [pilih, setPilih] = useState<Pilihan | null>(null);
  const [tahap, setTahap] = useState<"pilih" | "bayar" | "kirim" | "selesai">("pilih");
  const [tagihan, setTagihan] = useState<QrisTagihan | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const jam = Math.round((sesi.endsAt - sesi.startsAt) / 3_600_000);
  const kelas = classOf(a, sesi.tableId);
  // Meja sekelas yang sama dulu, lalu meja sekelas lain — tarifnya sama.
  const meja = useMemo(() => [
    sesi.tableId,
    ...SEMUA_MEJA.filter((t) => t.id !== sesi.tableId && classOf(a, t.id) === kelas).map((t) => t.id),
  ], [a, sesi.tableId, kelas]);

  const pilihanJam = useMemo(() => {
    const out: Pilihan[] = [];
    for (let h = OPEN_HOUR; h + jam <= CLOSE_HOUR; h++) {
      const startsAt = slotStart(tanggal, h);
      for (const tableId of meja) {
        const r = jadwalUlangProblem(a, sesi.id, { tableId, startsAt });
        if (!r.masalah) { out.push({ tableId, startsAt, selisih: r.selisih }); break; }
      }
    }
    return out;
  }, [a, sesi.id, tanggal, meja, jam]);

  // Sesudah dikirim: tunggu sampai mesin benar-benar memindahnya.
  const terpindah = a.sessions.find((x) => x.id === sesi.id)?.jadwalUlang;
  useEffect(() => {
    if ((tahap === "kirim" || tahap === "bayar") && terpindah) setTahap("selesai");
  }, [tahap, terpindah]);

  // Selisih harga: tanya server sampai lunas.
  useEffect(() => {
    if (tahap !== "bayar" || !tagihan) return;
    const iv = setInterval(async () => {
      const st = await statusQris(tagihan.ref);
      if (st === "lunas") setTahap("kirim");
      else if (st === "gagal" || st === "kedaluwarsa") setPesan("Pembayaran selisih tidak selesai. Jadwal lama tetap berlaku.");
    }, 4000);
    return () => clearInterval(iv);
  }, [tahap, tagihan]);

  async function konfirmasi() {
    if (!pilih) return;
    setPesan(null);
    const act = { t: "jadwalUlang" as const, id: sesi.id, code: sesi.bookingCode ?? "", tableId: pilih.tableId, startsAt: pilih.startsAt };
    if (pilih.selisih <= 0) {
      const tolak = dispatchA(act);
      if (tolak) { setPesan(tolak); return; }
      setTahap("kirim");
      return;
    }
    const h = await buatQris({
      kode: `${act.code}-JU`, amount: pilih.selisih, ringkas: `Selisih jadwal ulang ${act.code}`, act, member: tokenMember() ?? "",
    });
    if (h.ok) { setTagihan(h.tagihan); setTahap("bayar"); }
    else setPesan("belumAktif" in h ? "Pembayaran QRIS belum aktif. Pilih jadwal bertarif sama, atau hubungi kasir." : h.alasan);
  }

  const namaMeja = (id: string) => SEMUA_MEJA.find((t) => t.id === id)?.name ?? id;

  return (
    <Card className="space-y-3 border-amber/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg uppercase tracking-wide text-cream">Jadwal ulang</h3>
        <button onClick={onTutup} className="text-[12px] text-dim hover:text-amber">Tutup</button>
      </div>

      {tahap === "selesai" ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-200">
            Jadwal baru tersimpan. Kode check-in tetap sama.
          </p>
          <Button full onClick={onTutup}>Selesai</Button>
        </div>
      ) : tahap === "kirim" ? (
        <p className="text-[13px] text-mute">Menyimpan jadwal baru…</p>
      ) : tahap === "bayar" && tagihan ? (
        <div className="space-y-3 text-center">
          <p className="text-[13px] text-mute">Bayar selisih <span className="font-semibold text-amber">{rupiah(pilih?.selisih ?? 0)}</span> untuk memindah jadwal.</p>
          {tagihan.qrString ? <div className="flex justify-center"><QrGambar payload={tagihan.qrString} /></div>
            : tagihan.bayarUrl ? (
              <a href={tagihan.bayarUrl} target="_blank" rel="noreferrer"
                className="flex min-h-[46px] items-center justify-center rounded-xl bg-amber text-sm font-bold text-ink">Buka halaman pembayaran QRIS</a>
            ) : null}
          <p className="text-[11px] text-dim">Layar ini berubah sendiri begitu pembayaran masuk.</p>
          {pesan && <p className="text-[12px] text-amber">{pesan}</p>}
        </div>
      ) : (
        <>
          <p className="text-[12px] leading-snug text-mute">
            Gratis satu kali. Pilih tanggal dan jam baru; lama main tetap {jam} jam. Jadwal bertarif lebih mahal
            cukup bayar selisihnya, yang lebih murah selisihnya tidak dikembalikan.
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {hari.map((d) => (
              <button key={d} onClick={() => { setTanggal(d); setPilih(null); }} aria-pressed={tanggal === d}
                className={`shrink-0 rounded-lg border px-3 py-2 text-[12px] ${tanggal === d ? "border-amber bg-amber/15 text-amber" : "border-line text-cream"}`}>
                {fmtDateShort(d).dow}<br /><span className="text-[11px] text-dim">{fmtDateShort(d).day} {fmtDateShort(d).mon}</span>
              </button>
            ))}
          </div>
          {pilihanJam.length === 0 ? (
            <p className="rounded-xl border border-line px-3 py-4 text-center text-[12px] text-dim">Tidak ada jam kosong di tanggal ini.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {pilihanJam.map((p) => {
                const on = pilih?.startsAt === p.startsAt && pilih.tableId === p.tableId;
                const h = Math.round((p.startsAt - slotStart(tanggal, 0)) / 3_600_000);
                return (
                  <button key={p.startsAt} onClick={() => setPilih(p)} aria-pressed={on}
                    className={`rounded-lg border px-2 py-2 text-left text-[12px] ${on ? "border-amber bg-amber/15" : "border-line"}`}>
                    <div className={`font-semibold tabular-nums ${on ? "text-amber" : "text-cream"}`}>{fmtHour(h)}</div>
                    <div className="truncate text-[10.5px] text-dim">{namaMeja(p.tableId)}</div>
                    <div className="text-[10.5px] text-mute">{p.selisih > 0 ? `+${rupiah(p.selisih)}` : "gratis"}</div>
                  </button>
                );
              })}
            </div>
          )}
          {pesan && <p className="rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-[12px] text-amber">{pesan}</p>}
          <Button full disabled={!pilih} onClick={() => void konfirmasi()}>
            {pilih ? (pilih.selisih > 0 ? `Bayar selisih ${rupiah(pilih.selisih)}` : "Pindahkan jadwal") : "Pilih jam baru"}
          </Button>
        </>
      )}
    </Card>
  );
}
