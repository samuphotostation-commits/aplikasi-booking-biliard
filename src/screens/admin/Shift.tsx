import { useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useAdmin, shiftCashExpected, biayaLaci, omzetPerShift, businessDateOf, shiftDi } from "../../lib/adminStore";
import { PanelBiaya } from "./PanelBiaya";
import { JudulBagian, KepalaHalaman, Kosong, TombolAksi } from "./Tata";
import { rupiah } from "../../lib/core";
import CetakKasKasir from "./StrukSettlement";
import { VENUE_LABEL, type Venue } from "../../data/venue";
import type { Shift } from "../../data/staff";
import { useVenueAktif } from "../../lib/venueAktif";
import { jam } from "./AdminShell";

/* Tutup shift = mencocokkan uang di laci dengan catatan sistem.
   Selisihnya (variance) adalah angka paling penting bagi pemilik:
   selisih kecil wajar, selisih berulang dari orang yang sama tidak.

   SUSUNAN (perapian 14 Nov 2026, "masih tidak ramah user dan berantakan"):
     · Kepala: venue, siapa yang membuka, berapa lama, dan angka laci.
     · Kiri : TIGA LANGKAH tutup shift — cetak, hitung laci, tutup.
     · Kanan: biaya yang keluar dari laci hari ini.
     · Bawah: riwayat shift VENUE INI SAJA, dikelompokkan per hari. */

/** Selisih ≤ ini dianggap wajar (kuning), di atasnya merah. */
const SELISIH_WAJAR = 20_000;

const nadaSelisih = (v: number) => (v === 0 ? "hijau" : Math.abs(v) <= SELISIH_WAJAR ? "amber" : "merah");
const WARNA = { hijau: "text-emerald-400", amber: "text-amber", merah: "text-red-400" } as const;
const BINGKAI = {
  hijau: "border-emerald-500/40 bg-emerald-500/10",
  amber: "border-amber/40 bg-amber/10",
  merah: "border-red-500/40 bg-red-500/10",
} as const;
const tandaRp = (v: number) => `${v > 0 ? "+" : ""}${rupiah(v)}`;
const lamanya = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? `${m} menit` : `${Math.floor(m / 60)} jam ${m % 60} menit`;
};

export default function ShiftScreen() {
  const { a, dispatchA } = useAdmin();
  const venue = useVenueAktif();
  const shift = shiftDi(a, venue, Date.now());
  if (shift) return <ShiftBerjalan shift={shift} venue={venue} />;

  const bolehBuka = !!a.me && a.me.role !== "waiter";
  return (
    <div className="space-y-6 pb-6">
      <KepalaHalaman judul="Shift" venue={venue}
        ket={<>Belum ada shift yang buka di {VENUE_LABEL[venue]}. Tanpa shift, meja dan pembayaran belum bisa dipakai.</>}
        aksi={bolehBuka && (
          <TombolAksi utama onClick={() => dispatchA({ t: "openShift", openingCash: 0, venue })}>
            Buka shift {VENUE_LABEL[venue]}
          </TombolAksi>
        )} />
      <div className="rounded-2xl border border-dashed border-line p-4">
        <JudulBagian judul="Alur satu shift" />
        <ol className="grid gap-2 sm:grid-cols-3">
          {[
            ["Buka shift", "Kasir yang bertugas menekan Buka shift. Namanya tercatat di semua transaksi."],
            ["Jalankan", "Semua pembayaran tunai masuk hitungan laci. Biaya dari laci dicatat di sini."],
            ["Tutup shift", "Cetak struk closing, hitung uang di laci, lalu tutup. Selisihnya tersimpan."],
          ].map(([j, k], i) => (
            <li key={j} className="rounded-xl bg-ink-2 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber/15 text-[12px] font-bold text-amber">{i + 1}</span>
                <span className="text-[13px] font-semibold text-cream">{j}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-dim">{k}</p>
            </li>
          ))}
        </ol>
      </div>
      <RiwayatShift venue={venue} />
    </div>
  );
}

function ShiftBerjalan({ shift, venue }: { shift: Shift; venue: Venue }) {
  const { a, dispatchA } = useAdmin();
  /** Angka hitungan laci, hanya digit (tampilannya diberi titik ribuan). */
  const [hitung, setHitung] = useState("");
  const [konfirmasi, setKonfirmasi] = useState(false);
  /** Alasan shift gagal ditutup. Dulu tidak ada: tombolnya ditekan, tidak
   *  terjadi apa-apa, dan kasir menekannya lagi (temuan audit 21 Okt 2026). */
  const [kabarTutup, setKabarTutup] = useState<string | null>(null);

  const serahTerima = !!a.me && shift.employeeId !== a.me.id;
  // Hanya tunai yang diterima DI SHIFT INI. Menjumlah semua shift membuat kasir
  // shift kedua terlihat kurang/lebih uang padahal hitungannya benar.
  const seharusnya = shiftCashExpected(a, shift);
  const keluarLaci = biayaLaci(a, shift.id);
  const tunaiMasuk = seharusnya - shift.openingCash + keluarLaci;
  const dihitung = Number(hitung) || 0;
  const selisih = dihitung - seharusnya;
  const nada = nadaSelisih(selisih);

  /**
   * Angka cetaknya diambil dari `omzetPerShift` — SUMBER YANG SAMA dengan
   * layar Rekap. Menghitung ulang di sini berarti dua tempat yang bisa
   * diam-diam berbeda, dan yang pertama menemukan bedanya adalah pemilik
   * yang mencocokkan kertas dengan layar jam dua pagi.
   */
  const omzet = useMemo(
    () => omzetPerShift(a, businessDateOf(Date.now()), venue),
    [a, venue],
  );
  const baris = omzet.shift.find((x) => x.id === shift.id);
  const trx = omzet.rincian.filter((r) => r.shiftId === shift.id);

  function tutup() {
    const tolak = dispatchA({ t: "closeShift", countedCash: dihitung, venue });
    if (tolak) setKabarTutup(tolak);
  }

  return (
    <div className="space-y-6 pb-6">
      <KepalaHalaman judul="Shift berjalan" venue={venue}
        ket={<><span className="text-cream">{shift.employeeName}</span> · dibuka {jam(shift.openedAt)} ·
          berjalan {lamanya(Date.now() - shift.openedAt)}</>}
        angka={[
          { label: "Kas seharusnya di laci", nilai: rupiah(seharusnya), nada: "amber" },
          { label: "Penjualan tunai", nilai: rupiah(tunaiMasuk) },
          { label: "Biaya dari laci", nilai: keluarLaci > 0 ? `− ${rupiah(keluarLaci)}` : rupiah(0) },
          { label: "Transaksi shift ini", nilai: trx.length },
        ]}>
        <p className="text-[11px] leading-relaxed text-dim">
          {/* MODAL AWAL DIHILANGKAN dari layar (permintaan pemilik 18 Okt 2026);
              tetap ditulis untuk shift lama yang modalnya bukan nol. */}
          {shift.openingCash > 0 && <>Modal awal laci (shift lama) {rupiah(shift.openingCash)}. </>}
          Kas seharusnya = penjualan <span className="text-mute">tunai</span> − biaya dari laci.
          QRIS, EDC, dan transfer tidak menambah uang fisik di laci.
        </p>
      </KepalaHalaman>

      {Date.now() - shift.openedAt > 12 * 3_600_000 && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-[12px] leading-snug text-red-200">
          Shift ini sudah berjalan {lamanya(Date.now() - shift.openedAt)} — kemungkinan lupa ditutup.
          Tutup shift ini lalu buka shift baru supaya kas tiap kasir tidak tercampur.
        </p>
      )}

      {serahTerima && (
        <p className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-2.5 text-[12px] leading-snug text-amber">
          Shift ini dibuka oleh <span className="font-bold">{shift.employeeName}</span>. Menutupnya berarti serah terima:
          hitung laci bersama {shift.employeeName}. Anda tercatat sebagai penutup shift.
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ── KIRI: TIGA LANGKAH TUTUP SHIFT ── */}
        <section className="min-w-0">
          <JudulBagian judul="Tutup shift" />
          <ol className="space-y-3">
            <Langkah no={1} judul="Cetak struk closing" ket="Dua struk 80 mm: Rekap Penjualan dan Detail Transaksi shift ini.">
              {/* CLOSING SHIFT — dibuat oleh komponen yang SAMA dengan Rekap → Kas
                  Kasir, jadi kertas closing dan kertas rekap tidak pernah berbeda. */}
              <CetakKasKasir dari={businessDateOf(Date.now())} sampai={businessDateOf(Date.now())} venue={venue}
                shiftId={shift.id} namaShift={`${baris?.nama ?? "Shift"} · ${shift.employeeName}`} kecil />
              <p className="mt-2 text-[11px] leading-snug text-dim">
                Lupa mencetak? Shift yang sudah ditutup bisa dicetak ulang dari Rekap → Kas Kasir, pilih shift-nya.
              </p>
            </Langkah>

            <Langkah no={2} judul="Hitung uang di laci" ket="Hitung uang fisik, lalu ketik jumlahnya.">
              <div className="flex items-center gap-2 rounded-xl border border-line bg-ink px-4 py-3 focus-within:border-amber">
                <span className="text-dim">Rp</span>
                <input inputMode="numeric" value={hitung === "" ? "" : Number(hitung).toLocaleString("id-ID")}
                  onChange={(e) => { setHitung(e.target.value.replace(/[^0-9]/g, "").slice(0, 10)); setKonfirmasi(false); setKabarTutup(null); }}
                  placeholder="0" aria-label="Uang di laci"
                  className="w-full bg-transparent text-right font-serif text-2xl tabular-nums text-cream placeholder:text-dim focus:outline-none" />
              </div>
              {hitung !== "" && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className={`mt-2 rounded-xl border px-4 py-3 ${BINGKAI[nada]}`}>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-dim">
                    <div>Dihitung<div className="font-serif text-[14px] tabular-nums text-cream">{rupiah(dihitung)}</div></div>
                    <div>Seharusnya<div className="font-serif text-[14px] tabular-nums text-cream">{rupiah(seharusnya)}</div></div>
                    <div className="text-right">Selisih
                      <div className={`font-serif text-xl font-bold tabular-nums ${WARNA[nada]}`}>{tandaRp(selisih)}</div>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-snug text-mute">
                    {selisih === 0 ? "Pas. Laci cocok dengan catatan sistem."
                      : selisih > 0 ? "Uang di laci LEBIH dari catatan — cek transaksi yang belum diinput."
                      : "Uang di laci KURANG dari catatan — cek kembalian atau transaksi yang tidak tercatat."}
                  </p>
                </motion.div>
              )}
            </Langkah>

            <Langkah no={3} judul="Tutup shift" ket={hitung === "" ? "Isi hitungan laci dulu di langkah 2." : "Selisih ikut tersimpan atas nama penutup shift."}>
              {!konfirmasi ? (
                <button disabled={hitung === ""} onClick={() => setKonfirmasi(true)}
                  className="min-h-[48px] w-full rounded-xl bg-amber text-[14px] font-bold text-ink disabled:opacity-35">
                  {serahTerima ? `Tutup shift ${shift.employeeName}` : "Tutup shift"}
                </button>
              ) : (
                <div className="space-y-2 rounded-xl border border-red-500/40 bg-red-500/5 p-3">
                  <p className="text-center text-[13px] text-cream">
                    Tutup shift {serahTerima ? `${shift.employeeName} ` : ""}dengan selisih{" "}
                    <span className={`font-bold ${WARNA[nada]}`}>{tandaRp(selisih)}</span>?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setKonfirmasi(false)}
                      className="min-h-[46px] rounded-xl border border-line text-[13px] text-mute">Batal</button>
                    <button onClick={tutup}
                      className="min-h-[46px] rounded-xl bg-red-500/85 text-[14px] font-bold text-cream">Ya, tutup shift</button>
                  </div>
                  {kabarTutup && <p role="status" className="text-center text-[12px] leading-snug text-amber">{kabarTutup}</p>}
                </div>
              )}
            </Langkah>
          </ol>
        </section>

        {/* ── KANAN: BIAYA ── */}
        <section className="min-w-0">
          <JudulBagian judul="Biaya hari ini" />
          <PanelBiaya bizDate={businessDateOf(Date.now())} venue={venue} bisaTambah />
          <p className="mt-2 text-[11px] leading-snug text-dim">
            Biaya yang dibayar dari laci mengurangi kas seharusnya, jadi catat sebelum menghitung laci.
          </p>
        </section>
      </div>

      <RiwayatShift venue={venue} />
    </div>
  );
}

/** Satu langkah bernomor di kartu tutup shift. */
function Langkah({ no, judul, ket, children }: { no: number; judul: string; ket?: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl border border-line bg-ink-2 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber text-[13px] font-bold text-ink">{no}</span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-cream">{judul}</div>
          {ket && <div className="text-[11px] leading-snug text-dim">{ket}</div>}
        </div>
      </div>
      {children}
    </li>
  );
}

/**
 * Riwayat shift VENUE INI SAJA (dulu tercampur SPL & Smokehouse), dikelompokkan
 * per hari bisnis. Tujuh hari terakhir dulu; sisanya lewat "Tampilkan lebih".
 */
function RiwayatShift({ venue }: { venue: Venue }) {
  const { a } = useAdmin();
  const [hari, setHari] = useState(7);
  const daftar = a.shiftHistory.filter((h) => (h.venue ?? "spl") === venue);
  const perHari = useMemo(() => {
    const peta = new Map<string, Shift[]>();
    for (const h of [...daftar].sort((x, y) => y.openedAt - x.openedAt)) {
      const k = businessDateOf(h.openedAt);
      peta.set(k, [...(peta.get(k) ?? []), h]);
    }
    return [...peta.entries()];
  }, [daftar]);

  if (daftar.length === 0) {
    return (
      <section>
        <JudulBagian judul={`Riwayat shift ${VENUE_LABEL[venue]}`} />
        <Kosong teks="Belum ada shift yang ditutup di venue ini." />
      </section>
    );
  }
  const totalSelisih = daftar.reduce((n, h) => n + (h.variance ?? 0), 0);
  const tidakPas = daftar.filter((h) => (h.variance ?? 0) !== 0).length;
  const tanggal = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section>
      <JudulBagian judul={`Riwayat shift ${VENUE_LABEL[venue]}`} jumlah={daftar.length}
        aksi={<span className={`text-[11px] ${tidakPas ? "text-amber" : "text-dim"}`}>
          {tidakPas} tidak pas · total selisih <span className={`font-bold ${WARNA[nadaSelisih(totalSelisih)]}`}>{tandaRp(totalSelisih)}</span>
        </span>} />
      <div className="space-y-4">
        {perHari.slice(0, hari).map(([iso, isi]) => (
          <div key={iso}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">{tanggal(iso)}</div>
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
              {isi.map((h) => {
                const v = h.variance ?? 0;
                const n = nadaSelisih(v);
                return (
                  <div key={h.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-cream">{h.employeeName}</div>
                      <div className="text-[11px] text-dim">
                        {jam(h.openedAt)} – {h.closedAt ? jam(h.closedAt) : "?"}
                        {h.closedAt && ` · ${lamanya(h.closedAt - h.openedAt)}`}
                        {h.openingCash > 0 && ` · modal ${rupiah(h.openingCash)}`}
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="text-[10px] uppercase tracking-wider text-dim">dihitung</div>
                      <div className="font-serif text-[13px] tabular-nums text-mute">{rupiah(h.countedCash ?? 0)}</div>
                    </div>
                    <div className="w-[110px] shrink-0 text-right">
                      <div className="text-[10px] uppercase tracking-wider text-dim">{v === 0 ? "pas" : v > 0 ? "lebih" : "kurang"}</div>
                      <div className={`font-serif text-[14px] font-bold tabular-nums ${WARNA[n]}`}>{tandaRp(v)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {perHari.length > hari && (
        <button onClick={() => setHari((n) => n + 14)}
          className="mt-3 min-h-[40px] w-full rounded-xl border border-line text-[12px] text-mute hover:border-amber hover:text-amber">
          Tampilkan lebih lama ({perHari.length - hari} hari lagi)
        </button>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-dim">
        Selisih sampai {rupiah(SELISIH_WAJAR)} ditandai kuning, di atasnya merah. Selisih kecil wajar;
        selisih berulang dari orang yang sama perlu ditindaklanjuti.
      </p>
    </section>
  );
}
