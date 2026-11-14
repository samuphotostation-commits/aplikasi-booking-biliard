import { useState } from "react";
import { useAdmin, businessDateOf, venueTiket, cariMeja, kodeSesi, type State } from "../../lib/adminStore";
import { jam } from "./AdminShell";
import type { Ticket } from "../../data/live";
import { VENUE_LABEL, type Venue } from "../../data/venue";
import { cetakKertas, printerBagian, cetakOtomatis, tandaiTercetak, tiketTercetak } from "../../lib/cetak";
import { htmlKertas, kelompokkan, kunciTiket } from "../../lib/cetakDapur";
import { galatCetakDapur } from "../../lib/pantauCetak";
import { KepalaHalaman, LabelVenue } from "./Tata";

/* ═══════════════════════════════════════════════════════════════════
   CHECKER — pengganti layar Dapur, untuk SPL Sport DAN Smokehouse

   Permintaan staf 14 Nov 2026: "yang di dapur tidak pakai monitor,
   langsung checker aja." Dapur bekerja dari KERTAS: tiap pesanan keluar
   otomatis di printer checker (lihat `usePantauCetak`), juru masak memasak
   dari kertas itu, lalu checker mencocokkan hidangan dengan kertasnya
   sebelum diantar.

   GABUNGAN DUA VENUE (pemilik 14 Nov 2026): "pesanan dari SPL Sport dan
   Smokehouse harus tetap jadi satu … beri pembatas atau kolom, tapi harus
   terlihat keduanya sekaligus, karena crew khusus ini gabungan." Jadi layar
   ini TIDAK mengikuti pilihan venue perangkat: dua kolom berdampingan (di
   layar sempit ditumpuk dengan pembatas), masing-masing berlabel venuenya.

   Satu kartu = satu meja, dengan dua tombol:
     · Cetak (ulang) — kalau kertasnya hilang/basah/printer macet.
     · Selesai, sudah diantar — semua hidangan meja itu ditutup sekaligus.
   ═══════════════════════════════════════════════════════════════════ */

const VENUES: Venue[] = ["spl", "smh"];

export default function Checker() {
  const { a, dispatchA, tick } = useAdmin();
  void tick;
  const [pesan, setPesan] = useState<string | null>(null);
  const [, segarkan] = useState(0);
  /** Penyaring untuk layar sempit; di layar lebar kedua kolom selalu tampil. */
  const [lihat, setLihat] = useState<Venue | "semua">("semua");

  /** Tiket lama yang tidak bisa dipetakan ke venue dianggap SPL (bawaan sebelum Smokehouse). */
  const venueDari = (t: Ticket): Venue => venueTiket(a, t) ?? "spl";
  /** Lantai & kode untuk tiket lama yang belum membawanya sendiri. */
  const info = infoTiket(a);
  const hariIni = businessDateOf(Date.now());
  const perVenue = Object.fromEntries(VENUES.map((v) => {
    const milik = a.tickets.filter((t) => venueDari(t) === v);
    return [v, {
      // SATU KARTU PER MEJA: semua pesanan meja itu yang belum diantar.
      buka: perMeja(milik.filter((t) => t.status !== "served"), info).sort((x, y) => y.at - x.at),
      selesai: perMeja(milik.filter((t) => t.status === "served" && businessDateOf(t.at) === hariIni), info).sort((x, y) => y.at - x.at),
    }];
  })) as Record<Venue, { buka: KertasMeja[]; selesai: KertasMeja[] }>;

  const sudah = tiketTercetak();
  const tercetak = (k: KertasMeja) => k.item.every((t) => sudah.has(kunciTiket(t)));

  /** Cetak kertas meja ini — satu kertas per bagian (dapur/bar) per kali pesan. */
  async function cetak(k: KertasMeja) {
    for (const kertas0 of kelompokkan(k.item)) {
      const kertas = { ...kertas0, lantai: kertas0.lantai ?? k.lantai, kode: kertas0.kode ?? k.kode };
      const r = await cetakKertas(htmlKertas(kertas, { ulang: kertas.item.every((t) => sudah.has(kunciTiket(t))) }), kertas.bagian);
      if (!r.ok) { setPesan(`Gagal mencetak ${k.meja}: ${r.alasan ?? "printer tidak menjawab"}`); return; }
      tandaiTercetak(kertas.item.map(kunciTiket));
    }
    setPesan(null);
    segarkan((n) => n + 1);
  }

  function selesaikan(k: KertasMeja) {
    for (const t of k.item) {
      const alasan = dispatchA({ t: "ticket", id: t.id, status: "served" });
      if (alasan) { setPesan(alasan); return; }
    }
    setPesan(null);
  }

  const printerSiap = !!printerBagian("kitchen");
  const otomatis = cetakOtomatis();
  /** Akun yang terikat satu venue hanya bisa menandai meja venuenya sendiri (aturan mesin). */
  const venueAkun = a.me?.venue;
  const totalBuka = VENUES.reduce((n, v) => n + perVenue[v].buka.length, 0);
  const totalSelesai = VENUES.reduce((n, v) => n + perVenue[v].selesai.length, 0);

  return (
    <div className="space-y-4 pb-6">
      <KepalaHalaman judul="Checker"
        ket="Pesanan SPL Sport dan Smokehouse sekaligus — satu kartu per meja. Cocokkan hidangan dengan kertasnya, lalu tandai sudah diantar."
        angka={[
          { label: `${VENUE_LABEL.spl} · belum diantar`, nilai: perVenue.spl.buka.length, nada: perVenue.spl.buka.length ? "biru" : undefined },
          { label: `${VENUE_LABEL.smh} · belum diantar`, nilai: perVenue.smh.buka.length, nada: perVenue.smh.buka.length ? "amber" : undefined },
          { label: "Sudah diantar hari ini", nilai: totalSelesai },
        ]} />

      {(!printerSiap || !otomatis) && (
        <p className="rounded-xl border border-amber/50 bg-amber/10 px-4 py-2.5 text-[12px] leading-snug text-amber">
          {!printerSiap
            ? "Printer checker belum dipilih di komputer ini. Minta superadmin membuka Pengaturan → Printer & layar, memilih printer checker di pilihan Dapur, lalu menyalakan cetak otomatis."
            : "Cetak otomatis belum dinyalakan di komputer ini — pesanan baru tidak keluar sendiri. Nyalakan di Pengaturan → Printer & layar."}
        </p>
      )}
      {galatCetakDapur() && (
        <p role="alert" className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-[13px] leading-snug text-red-300">
          {galatCetakDapur()}
        </p>
      )}
      {pesan && (
        <p role="alert" className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-[13px] leading-snug text-red-300">
          {pesan}
        </p>
      )}

      {/* Penyaring — hanya di layar sempit, tempat kedua venue ditumpuk. */}
      <div className="flex gap-1 rounded-xl border border-line bg-ink p-1 lg:hidden" role="radiogroup" aria-label="Venue yang ditampilkan">
        {([["semua", `Semua · ${totalBuka}`], ["spl", `${VENUE_LABEL.spl} · ${perVenue.spl.buka.length}`],
          ["smh", `${VENUE_LABEL.smh} · ${perVenue.smh.buka.length}`]] as const).map(([k, l]) => (
          <button key={k} role="radio" aria-checked={lihat === k} onClick={() => setLihat(k)}
            className={`min-h-[40px] flex-1 rounded-lg px-2 text-[12px] font-semibold ${
              lihat === k ? "bg-amber text-ink" : "text-mute hover:text-cream"
            }`}>{l}</button>
        ))}
      </div>

      {/* DUA KOLOM: SPL Sport | Smokehouse. Garis tengah sebagai pembatas. */}
      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-line">
        {VENUES.map((v, i) => {
          const { buka, selesai } = perVenue[v];
          const bolehTandai = !venueAkun || venueAkun === v;
          return (
            <section key={v} aria-label={`Checker ${VENUE_LABEL[v]}`}
              className={`${lihat !== "semua" && lihat !== v ? "hidden lg:block" : ""} ${i === 0 ? "lg:pr-4" : "lg:pl-4"} min-w-0`}>
              <div className={`sticky top-[104px] z-10 -mx-1 mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 backdrop-blur-md ${
                v === "smh" ? "border-amber/40 bg-ink/90" : "border-sky-400/40 bg-ink/90"
              }`}>
                <LabelVenue venue={v} />
                <span className="text-[12px] text-cream">{buka.length} meja belum diantar</span>
                <span className="ml-auto text-[11px] text-dim">{selesai.length} selesai</span>
              </div>

              {!bolehTandai && buka.length > 0 && (
                <p className="mb-2 text-[11px] leading-snug text-dim">
                  Akun Anda terikat {VENUE_LABEL[venueAkun!]} — meja {VENUE_LABEL[v]} hanya bisa dicetak ulang.
                  Penandaan diantar oleh kru {VENUE_LABEL[v]} atau kru gabungan.
                </p>
              )}

              {buka.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center">
                  <div className="font-display text-xl uppercase tracking-wide text-dim">Bersih</div>
                  <p className="mt-1 text-[12px] text-dim">Semua pesanan {VENUE_LABEL[v]} sudah diantar.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {buka.map((k) => (
                    <Kartu key={k.sessionId} k={k} venue={v} tercetak={tercetak(k)}
                      onCetak={() => void cetak(k)} onSelesai={bolehTandai ? () => selesaikan(k) : undefined} />
                  ))}
                </div>
              )}

              {selesai.length > 0 && (
                <details className="mt-4 rounded-xl border border-line bg-ink-2/50 px-3 py-2">
                  <summary className="cursor-pointer text-[12px] text-mute">
                    Sudah diantar hari ini · {selesai.length}
                  </summary>
                  <div className="mt-2 space-y-2 opacity-70">
                    {selesai.slice(0, 30).map((k) => (
                      <Kartu key={k.sessionId} k={k} venue={v} tercetak={tercetak(k)} onCetak={() => void cetak(k)} />
                    ))}
                  </div>
                </details>
              )}
            </section>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-dim">
        Pesanan dari kasir dan waiter kedua venue langsung keluar di printer checker, lengkap dengan catatannya
        (mis. “tidak pedas”). Dapur memasak dari kertas itu. Setelah hidangannya dicek dan diantar,
        tekan “Selesai, sudah diantar”. Layar ini selalu menampilkan kedua venue, apa pun venue yang dipilih di atas.
      </p>
    </div>
  );
}

/** Semua tiket satu meja (satu sesi/pesanan) dalam satu kartu. */
type KertasMeja = { sessionId: string; meja: string; via?: string; lantai?: number; kode?: string; at: number; item: Ticket[] };

/** Lantai & kode pesanan dari data meja/pesanan — cadangan untuk tiket lama. */
function infoTiket(a: State) {
  return (sessionId: string): { lantai?: number; kode?: string } => {
    const sesi = a.sessions.find((x) => x.id === sessionId);
    if (sesi) return { lantai: cariMeja(sesi.tableId)?.lantai, kode: kodeSesi(sesi) };
    const o = a.orders.find((x) => x.id === sessionId);
    return o ? { lantai: o.tableId ? cariMeja(o.tableId)?.lantai : undefined, kode: o.code } : {};
  };
}

function perMeja(tiket: Ticket[], info: (sessionId: string) => { lantai?: number; kode?: string }): KertasMeja[] {
  const peta = new Map<string, KertasMeja>();
  for (const t of [...tiket].sort((x, y) => x.at - y.at)) {
    const ada = peta.get(t.sessionId);
    if (ada) { ada.item.push(t); ada.at = Math.max(ada.at, t.at); }
    else {
      const cadangan = t.lantai && t.kode ? {} : info(t.sessionId);
      peta.set(t.sessionId, {
        sessionId: t.sessionId, meja: t.tableName, via: t.via, at: t.at, item: [t],
        lantai: t.lantai ?? cadangan.lantai, kode: t.kode ?? cadangan.kode,
      });
    }
  }
  return [...peta.values()];
}

function Kartu({ k, venue, tercetak, onCetak, onSelesai }: {
  k: KertasMeja; venue: Venue; tercetak: boolean; onCetak: () => void; onSelesai?: () => void;
}) {
  const menit = Math.max(0, Math.floor((Date.now() - Math.min(...k.item.map((t) => t.at))) / 60000));
  return (
    <div className={`rounded-xl border border-line border-l-4 bg-ink-2 p-3 ${venue === "smh" ? "border-l-amber" : "border-l-sky-400"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg uppercase leading-tight text-cream">{k.meja}</div>
          {(k.lantai || k.kode) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {k.lantai && <span className="rounded bg-sky-400/15 px-1.5 font-bold text-sky-300">Lantai {k.lantai}</span>}
              {k.kode && <span className="font-mono text-mute">#{k.kode}</span>}
            </div>
          )}
          {k.via && <div className="text-[11px] text-amber/90">{k.via}</div>}
          <div className="text-[10px] uppercase tracking-wider text-dim">
            {k.item.length} menu · {k.item.reduce((n, t) => n + t.qty, 0)} porsi · terakhir masuk {jam(k.at)}
            {onSelesai && menit >= 20 && <span className="text-red-300"> · menunggu {menit} menit</span>}
          </div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
          tercetak ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
        }`}>{tercetak ? "tercetak" : "belum tercetak"}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {k.item.map((t) => (
          <li key={t.id}>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg text-amber">{t.qty}×</span>
              <span className="text-[15px] leading-snug text-cream">{t.name}</span>
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-dim">
                {t.station === "bar" ? "bar" : "dapur"} · {jam(t.at)}
              </span>
            </div>
            {t.variant && <div className="pl-7 text-[12px] text-mute">{t.variant}</div>}
            {t.note && (
              <div className="ml-7 mt-0.5 rounded-lg border border-amber/40 bg-amber/10 px-2 py-1 text-[13px] font-bold leading-snug text-amber">
                {t.note}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-1.5">
        <button onClick={onCetak}
          className="min-h-[44px] flex-1 rounded-xl border border-line text-[12px] font-semibold text-mute hover:border-amber hover:text-amber">
          {tercetak ? "Cetak ulang" : "Cetak"}
        </button>
        {onSelesai && (
          <button onClick={onSelesai}
            className="min-h-[44px] flex-[2] rounded-xl bg-amber text-[14px] font-bold text-ink">
            Selesai, sudah diantar
          </button>
        )}
      </div>
    </div>
  );
}
