import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdmin, venueVoid, businessDateOf } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { useVenueAktif } from "../../lib/venueAktif";
import { jam } from "./AdminShell";
import { VENUE_LABEL } from "../../data/venue";
import type { VoidRequest } from "../../data/staff";
import { JudulBagian, KepalaHalaman, Kosong } from "./Tata";

/* Void berjenjang:
   - Superadmin: void langsung berlaku, tercatat atas namanya.
   - Karyawan  : void hanya DIAJUKAN. Uang belum bergerak sampai disetujui.

   Kenapa dipisah — void adalah cara paling mudah menghilangkan uang tunai
   tanpa jejak. Kalau kasir bisa mem-void sendiri, laporan tidak bisa dipercaya.

   SUSUNAN (perapian 14 Nov 2026): dua tab — "Perlu diputuskan" dan
   "Riwayat". Riwayat bisa disaring (disetujui/ditolak/ditarik), dicari, dan
   dikelompokkan per hari, tidak lagi satu daftar panjang tanpa tanggal. */

type Hasil = "disetujui" | "ditolak" | "ditarik";
const hasilDari = (v: VoidRequest): Hasil | "menunggu" =>
  v.status === "menunggu" ? "menunggu" : v.decidedBy?.endsWith("(ditarik)") ? "ditarik" : v.status;

const BADGE: Record<Hasil, string> = {
  disetujui: "bg-emerald-500/20 text-emerald-300",
  ditolak: "bg-red-500/20 text-red-300",
  ditarik: "bg-ink text-mute",
};
const JENIS: Record<VoidRequest["targetKind"], string> = {
  sesi: "Seluruh tab", item: "1 barang", pesanan: "Pesanan HP",
};
const berlalu = (ts: number) => {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  return m < 1 ? "baru saja" : m < 60 ? `${m} menit lalu` : `${Math.floor(m / 60)} jam lalu`;
};

export default function VoidScreen() {
  const { a, dispatchA, allow, peek } = useAdmin();
  const venue = useVenueAktif();
  const bolehPutus = allow("setujuiVoid");
  const [kabar, setKabar] = useState<{ teks: string; baik: boolean } | null>(null);
  const [tab, setTab] = useState<"menunggu" | "riwayat">("menunggu");
  const [saring, setSaring] = useState<Hasil | "semua">("semua");
  const [q, setQ] = useState("");
  const [hari, setHari] = useState(7);

  /**
   * IKUT VENUE YANG SEDANG DIBUKA.
   *
   * MASALAH YANG DIPERBAIKI (laporan pemilik 19 Okt 2026: *"void harus
   * disetujui oleh manager atau owner, saat ini belum berfungsi"*):
   * daftarnya dulu menampilkan void KEDUA venue. Manajer yang terikat
   * Smokehouse melihat pengajuan meja biliar, menekan "Setujui", dan tidak
   * terjadi apa-apa — mesin menolaknya karena lintas venue, tapi layarnya
   * diam. Dari kursi manajer, yang terlihat adalah tombol yang rusak.
   *
   * Void yang tidak bisa dipetakan ke venue mana pun (jejak lama) tetap
   * ditampilkan: lebih baik terlihat oleh keduanya daripada hilang dari
   * keduanya.
   */
  const diVenue = (v: VoidRequest) => {
    const vn = venueVoid(a, v);
    return vn === null || vn === venue;
  };
  const menunggu = a.voids.filter((v) => v.status === "menunggu" && diVenue(v));
  const riwayat = a.voids.filter((v) => v.status !== "menunggu" && diVenue(v));

  const hitung = (h: Hasil) => riwayat.filter((v) => hasilDari(v) === h).length;
  const disetujuiHariIni = riwayat.filter((v) => hasilDari(v) === "disetujui"
    && businessDateOf(v.decidedAt ?? v.at) === businessDateOf(Date.now()));

  const riwayatTampil = useMemo(() => {
    const cari = q.trim().toLowerCase();
    const isi = riwayat
      .filter((v) => saring === "semua" || hasilDari(v) === saring)
      .filter((v) => !cari || `${v.label} ${v.byName} ${v.reason} ${v.decidedBy ?? ""}`.toLowerCase().includes(cari))
      .sort((x, y) => y.at - x.at);
    const peta = new Map<string, VoidRequest[]>();
    for (const v of isi) {
      const k = businessDateOf(v.at);
      peta.set(k, [...(peta.get(k) ?? []), v]);
    }
    return [...peta.entries()];
  }, [riwayat, saring, q]);

  /** Putuskan, lalu BACA hasilnya dari mesin — tombol tidak boleh diam. */
  function putuskan(id: string, approve: boolean) {
    dispatchA({ t: "decideVoid", id, approve });
    const sesudah = peek().voids.find((v) => v.id === id);
    setKabar(
      sesudah?.status === "disetujui" ? { teks: "Void disetujui — barangnya dikeluarkan dari bill.", baik: true }
        : sesudah?.status === "ditolak" && approve ? { teks: "Void tidak bisa dijalankan karena tabnya sudah dibayar. Selesaikan pengembalian dengan tamu.", baik: false }
        : sesudah?.status === "ditolak" ? { teks: "Void ditolak. Barangnya tetap di bill.", baik: true }
        : { teks: "Tidak bisa diputuskan dari sini — pengajuan ini milik venue sebelah. "
          + "Pindahkan venue di kanan atas, atau minta pemilik yang memutuskan.", baik: false },
    );
    setTimeout(() => setKabar(null), 5000);
  }

  const tanggal = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5 pb-6">
      <KepalaHalaman judul="Void" venue={venue}
        ket={<>Pembatalan barang atau tab. {bolehPutus
          ? "Anda bisa menyetujui atau menolak pengajuan."
          : "Pengajuan Anda menunggu keputusan manajer atau pemilik."}</>}
        angka={[
          { label: "Perlu diputuskan", nilai: menunggu.length, nada: menunggu.length ? "merah" : undefined },
          { label: "Disetujui hari ini", nilai: disetujuiHariIni.length },
          { label: "Nilai disetujui hari ini", nilai: rupiah(disetujuiHariIni.reduce((n, v) => n + v.amount, 0)) },
        ]} />

      {/* ── TAB ── */}
      <div className="flex gap-1 rounded-xl border border-line bg-ink p-1" role="tablist">
        {([["menunggu", "Perlu diputuskan", menunggu.length], ["riwayat", "Riwayat", riwayat.length]] as const).map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold ${
              tab === k ? "bg-amber text-ink" : "text-mute hover:text-cream"
            }`}>
            {l}
            <span className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${
              tab === k ? "bg-ink/20" : k === "menunggu" && n > 0 ? "bg-red-500/80 text-cream" : "bg-ink-2"
            }`}>{n}</span>
          </button>
        ))}
      </div>

      {kabar && (
        <p role="status" className={`rounded-xl border px-4 py-2.5 text-[12px] leading-snug ${
          kabar.baik ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber/40 bg-amber/10 text-amber"
        }`}>{kabar.teks}</p>
      )}

      {tab === "menunggu" ? (
        menunggu.length === 0 ? (
          <Kosong teks={<>
            Tidak ada pengajuan void yang menunggu di {VENUE_LABEL[venue]}.
            <span className="mt-1 block text-[11px]">
              Void diajukan dari meja di Papan atau Kasir: buka tabnya, pilih barang atau seluruh tab, lalu tulis alasannya.
            </span>
          </>} />
        ) : (
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {menunggu.map((v) => (
                <motion.div key={v.id} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                  className="overflow-hidden rounded-2xl border border-amber/50 bg-ink-2">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
                        {JENIS[v.targetKind]}
                      </span>
                      <div className="mt-1.5 text-[15px] font-semibold leading-snug text-cream">{v.label}</div>
                      <div className="mt-0.5 text-[11px] text-dim">
                        Diajukan <span className="text-mute">{v.byName}</span> · {jam(v.at)} · {berlalu(v.at)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] uppercase tracking-wider text-dim">Nilai</div>
                      <div className="font-serif text-xl font-bold tabular-nums text-amber">{rupiah(v.amount)}</div>
                    </div>
                  </div>
                  <div className="mx-4 mb-3 rounded-lg border border-line bg-ink px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-dim">Alasan</div>
                    <div className="text-[13px] text-cream">{v.reason}</div>
                  </div>
                  {bolehPutus ? (
                    <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
                      <button onClick={() => putuskan(v.id, false)}
                        className="min-h-[50px] bg-ink-2 text-[14px] font-semibold text-red-300 hover:bg-red-500/10">Tolak</button>
                      <button onClick={() => putuskan(v.id, true)}
                        className="min-h-[50px] bg-amber text-[14px] font-bold text-ink hover:bg-amber-deep">Setujui void</button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                      <p className="text-[11px] leading-snug text-dim">
                        Menunggu manajer atau pemilik. Tab belum bisa dibayar sampai diputuskan.
                      </p>
                      <button onClick={() => dispatchA({ t: "tarikVoid", id: v.id })}
                        className="min-h-[38px] shrink-0 rounded-lg border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber">
                        Tarik pengajuan
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )
      ) : (
        <section>
          <div className="space-y-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari barang, meja, nama, atau alasan…"
              aria-label="Cari riwayat void"
              className="w-full rounded-xl border border-line bg-ink-2 px-4 py-2.5 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            <div className="no-bar flex gap-1.5 overflow-x-auto">
              {([["semua", "Semua", riwayat.length], ["disetujui", "Disetujui", hitung("disetujui")],
                ["ditolak", "Ditolak", hitung("ditolak")], ["ditarik", "Ditarik", hitung("ditarik")]] as const).map(([k, l, n]) => (
                <button key={k} onClick={() => setSaring(k)} aria-pressed={saring === k}
                  className={`min-h-[34px] shrink-0 rounded-lg px-3 text-[12px] font-semibold ${
                    saring === k ? "bg-cream text-ink" : "bg-ink-2 text-mute hover:text-cream"
                  }`}>{l} · {n}</button>
              ))}
            </div>
          </div>

          {riwayatTampil.length === 0 ? (
            <div className="mt-3"><Kosong teks={riwayat.length ? "Tidak ada void yang cocok." : "Belum ada void yang diputuskan."} /></div>
          ) : (
            <div className="mt-4 space-y-4">
              {riwayatTampil.slice(0, hari).map(([iso, isi]) => (
                <div key={iso}>
                  <JudulBagian judul={tanggal(iso)} jumlah={isi.length}
                    aksi={<span className="text-[11px] text-dim">
                      disetujui {rupiah(isi.filter((v) => hasilDari(v) === "disetujui").reduce((n, v) => n + v.amount, 0))}
                    </span>} />
                  <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
                    {isi.map((v) => {
                      const h = hasilDari(v) as Hasil;
                      return (
                        <div key={v.id} className="flex items-start gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-[13px] text-cream">{v.label}</span>
                              <span className="text-[10px] text-dim">· {JENIS[v.targetKind]}</span>
                            </div>
                            <div className="text-[11px] leading-snug text-dim">
                              {jam(v.at)} · diajukan {v.byName}
                              {v.decidedBy && h !== "ditarik" && v.decidedBy !== v.byName && <> · diputuskan {v.decidedBy}</>}
                            </div>
                            <div className="text-[11px] text-mute">Alasan: {v.reason}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE[h]}`}>{h}</span>
                            <div className={`mt-1 font-serif text-[13px] tabular-nums ${h === "disetujui" ? "text-cream" : "text-dim line-through"}`}>
                              {rupiah(v.amount)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {riwayatTampil.length > hari && (
                <button onClick={() => setHari((n) => n + 14)}
                  className="min-h-[40px] w-full rounded-xl border border-line text-[12px] text-mute hover:border-amber hover:text-amber">
                  Tampilkan lebih lama ({riwayatTampil.length - hari} hari lagi)
                </button>
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-dim">
            Void yang ditolak tetap tersimpan. Pola pengajuan yang sering ditolak dari orang yang sama adalah
            sinyal yang perlu ditindaklanjuti.
          </p>
        </section>
      )}
    </div>
  );
}
