import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useAdmin, businessDateOf } from "../../lib/adminStore";
import { STATUS_DAPUR, mulaiStatus, menitSejak, lamaSingkat } from "../../lib/statusDapur";
import { jam } from "./AdminShell";
import type { Ticket } from "../../data/live";

/* Kitchen Display sederhana (PRD KK-15).
   Empat status, tombol besar, tanpa routing per-station yang rumit —
   itu Fase 2. Yang penting tiket tidak lagi diteriakkan.

   ── Revisi pemilik 18 Okt 2026 ──────────────────────────────────────
   Tiga hal yang diminta, dan alasannya kenapa penting:

   1. KALIMAT & WARNA MENGIKUTI CARA DAPUR BICARA. "Mulai masak" diganti
      "Orderan diterima" — karena yang ditekan juru masak saat melihat
      tiket bukanlah janji bahwa ia sudah mulai memasak, tapi tanda bahwa
      pesanannya sudah dilihat. Kasir yang melihat layar ini butuh tahu
      persis itu.
   2. PESANAN YANG SUDAH SIAP TIDAK DIBUANG. Sebelumnya tiket "selesai"
      langsung hilang dari layar; kalau pramusaji lupa mengantar, tidak ada
      jejaknya di layar sama sekali. Sekarang turun ke bawah garis pemisah
      dan tetap terbaca sampai tutup buku.
   3. DUA JAM DITULIS: jam masuk dari kasir dan jam selesai dimasak. Itu
      satu-satunya cara menjawab "kenapa lama" tanpa saling menuduh.
   ──────────────────────────────────────────────────────────────────── */

/* Kosakata, warna, dan urutan status pindah ke `src/lib/statusDapur.ts`:
   kartu meja di Papan memakai yang sama persis, dan dua layar yang
   menuliskan sendiri kata "ready" adalah cara tercepat keduanya berbeda. */

export default function Kitchen() {
  const { a, dispatchA, tick } = useAdmin();
  void tick;
  const [station, setStation] = useState<"all" | "kitchen" | "bar">("all");

  const diStation = (t: Ticket) => station === "all" || t.station === station;

  /**
   * Masih dikerjakan — di atas garis, TANPA saringan hari.
   *
   * Tiket kemarin yang belum matang bukan sampah yang perlu disembunyikan:
   * itu justru satu-satunya petunjuk bahwa ada pesanan yang tidak pernah
   * selesai. Ia harus tetap berteriak sampai ada yang menutupnya.
   */
  const jalan = a.tickets.filter((t) => diStation(t) && t.status !== "ready" && t.status !== "served")
    .sort((x, y) => x.at - y.at);

  /**
   * Sudah matang / sudah diantar — HANYA HARI OPERASIONAL INI.
   *
   * Sebelumnya tanpa saringan sama sekali, dan tumpukannya tidak pernah
   * berhenti bertambah: layar dapur pemilik menunjukkan 74 tiket "sudah
   * ready" bercampur dari beberapa hari, dan daftar sepanjang itu berhenti
   * dibaca orang — yang berarti pesanan yang benar-benar lupa diantar hari
   * ini tenggelam di antara tiket kemarin yang sudah lama beres.
   *
   * Harinya hari OPERASIONAL (berganti pukul 02.00), bukan tanggal kalender:
   * tiket jam 01.00 masih milik shift malam yang sama.
   */
  const hariIni = businessDateOf(Date.now());
  const selesaiSemua = a.tickets.filter((t) => diStation(t) && (t.status === "ready" || t.status === "served"));
  const selesai = selesaiSemua
    .filter((t) => businessDateOf(t.readyAt ?? t.at) === hariIni)
    .sort((x, y) => (y.readyAt ?? y.at) - (x.readyAt ?? x.at));
  const selesaiLama = selesaiSemua.length - selesai.length;

  return (
    <div className="pb-6">
      <div className="mb-3 flex items-center gap-2">
        {([["all", "Semua"], ["kitchen", "Dapur"], ["bar", "Bar"]] as const).map(([v, l]) => {
          const n = a.tickets.filter(
            (t) => t.status !== "ready" && t.status !== "served" && (v === "all" || t.station === v),
          ).length;
          return (
            <button
              key={v} onClick={() => setStation(v)} aria-pressed={station === v}
              className={`min-h-[38px] rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${
                station === v ? "bg-amber text-ink" : "bg-ink-2 text-mute"
              }`}
            >{l} · {n}</button>
          );
        })}
        <span className="ml-auto text-[11px] text-dim">{selesai.length} ready / diantar hari ini</span>
      </div>

      {jalan.length === 0 ? (
        <div className="rounded-2xl border border-line bg-ink-2 px-4 py-12 text-center">
          <div className="font-display text-2xl uppercase tracking-wide text-dim">Bersih</div>
          <p className="mt-1 text-sm text-dim">Tidak ada tiket menunggu.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {jalan.map((t) => <Kartu key={t.id} t={t} onLanjut={(s) => dispatchA({ t: "ticket", id: t.id, status: s })} />)}
          </AnimatePresence>
        </div>
      )}

      {selesai.length > 0 && (
        <section className="mt-6">
          {/* Garis pemisah yang diminta pemilik: yang sudah biru ada di
              bawahnya, tetap terbaca, tidak hilang dari layar. */}
          <div className="mb-3 flex items-center gap-3">
            <span className="h-px flex-1 bg-line-2" />
            <span className="font-display text-[11px] uppercase tracking-[0.18em] text-blue-300">
              Sudah ready hari ini · {selesai.length}
            </span>
            <span className="h-px flex-1 bg-line-2" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {selesai.map((t) => (
              <Kartu key={t.id} t={t} onLanjut={(s) => dispatchA({ t: "ticket", id: t.id, status: s })} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-dim">
        Angka di kartu adalah lama tiket bertahan di keadaannya sekarang, bukan sejak masuk
        kasir — lewat 15 menit ditandai merah. Urutan selalu yang paling lama di atas, bukan
        yang paling gampang dimasak. Pesanan yang sudah ready turun ke bawah garis supaya
        ketahuan kalau ada yang lupa diantar, dan daftar itu dimulai bersih tiap hari
        operasional.
        {selesaiLama > 0 && (
          <> {selesaiLama} tiket hari sebelumnya tidak ditampilkan; riwayatnya ada di Jejak.</>
        )}
      </p>
    </div>
  );
}

function Kartu({ t, onLanjut }: { t: Ticket; onLanjut: (s: Ticket["status"]) => void }) {
  const f = STATUS_DAPUR[t.status];

  /**
   * Lama tertahan di keadaan SEKARANG, bukan sejak masuk kasir.
   *
   * Angka lama menghitung dari `at` untuk semua kartu, jadi tiket yang sudah
   * matang sepuluh menit lalu tetap menampilkan "25m" seolah dapur masih
   * mengerjakannya — dan pertanyaan yang sebenarnya ("sudah berapa lama ini
   * nganggur di meja saji?") tidak terjawab di mana pun.
   */
  const diam = menitSejak(mulaiStatus(t));
  /** Merah berlaku juga untuk yang sudah matang: makanan dingin itu masalah. */
  const late = diam >= 15 && t.status !== "served";
  /** Lama memasak sebenarnya: dari masuk kasir sampai ready. */
  const masak = t.readyAt ? Math.max(0, Math.round((t.readyAt - t.at) / 60000)) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      className={`rounded-xl border p-3 ${f.bingkai} ${t.status === "served" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg uppercase leading-tight text-cream">
            {t.tableName}
          </div>
          {t.via && <div className="text-[11px] text-amber/90">{t.via}</div>}
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-dim">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${f.titik}`} />
            {t.station === "bar" ? "Bar" : "Dapur"} · <span className={f.teks}>{f.label}</span>
          </div>
        </div>
        <div className={`shrink-0 text-right text-[13px] font-bold tabular-nums ${
          late ? "text-red-400" : "text-mute"
        }`}>
          {lamaSingkat(diam)}
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-xl text-amber">{t.qty}×</span>
        <span className="text-[15px] leading-snug text-cream">{t.name}</span>
      </div>
      {t.variant && <div className="text-[12px] text-mute">{t.variant}</div>}
      {/* Catatan tamu ditonjolkan: inilah yang paling sering
          terlewat dan paling mahal kalau salah masak. */}
      {t.note && (
        <div className="mt-1 rounded-lg border border-amber/40 bg-amber/10 px-2 py-1 text-[12px] font-semibold leading-snug text-amber">
          {t.note}
        </div>
      )}

      {/* Dua jam yang diminta pemilik. Jam ready hanya muncul kalau memang
          sudah ada — tiket lama (sebelum 18 Okt 2026) tidak menyimpannya,
          dan menuliskan jam karangan untuk tiket lama lebih buruk daripada
          tidak menulis apa-apa. */}
      {/* Tiga jam, bukan dua. Jam DITERIMA yang dulu tidak ditulis padahal
          sudah dicatat mesin — selisih "masuk kasir → diterima" itulah lama
          pesanan menganggur sebelum ada yang menyentuhnya, dan itu angka
          yang berbeda sama sekali dari lama memasaknya. */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-dim">
        <span>Masuk kasir <span className="text-mute">{jam(t.at)}</span></span>
        {t.terimaAt && <span>Diterima <span className="text-emerald-300">{jam(t.terimaAt)}</span></span>}
        {t.readyAt && <span>Ready <span className="text-blue-300">{jam(t.readyAt)}</span></span>}
        {masak !== null && <span>Masak <span className="text-mute">{lamaSingkat(masak)}</span></span>}
      </div>

      {/* Tombol menyebut APA YANG TERJADI kalau ditekan, bukan keadaan kartu
          sekarang — lencana di atas yang menyebut keadaannya. Sampai 28 Okt
          2026 keduanya kalimat yang sama, jadi tiap kartu selalu terlihat
          seperti tidak bereaksi saat ditekan. */}
      {f.next && f.aksi && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onLanjut(f.next!)}
          className="mt-3 min-h-[46px] w-full rounded-xl bg-amber text-[15px] font-bold text-ink"
        >{f.aksi}</motion.button>
      )}
    </motion.div>
  );
}
