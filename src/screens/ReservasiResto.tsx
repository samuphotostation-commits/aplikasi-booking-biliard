/* ═══════════════════════════════════════════════════════════════════
   RESERVASI MEJA SMOKEHOUSE RESTO — MEJA **DAN** MAKANANNYA

   Koreksi pemilik 12 Okt 2026: *"untuk reservasi ini harus dengan makanannya
   sekalian saja, jadi tidak hanya meja yang direservasi"*.

   Jadi layar ini BUKAN booking biliar, dan bukan pula formulir meja yang
   kebetulan punya lampiran menu:

   1. TIDAK ADA SEWA WAKTU dan tidak ada pilihan durasi. Tamu memilih jam
      DATANG, titik. Mejanya ditahan {@link TAHAN_JAM} jam dari jam itu —
      angka itu urusan dapur & kasir supaya meja yang sama tidak dijanjikan
      ke dua rombongan, bukan sesuatu yang perlu dipikirkan tamu.
   2. TIDAK ADA BAYAR DI MUKA. Yang dijanjikan mejanya; makanannya dibayar
      di kasir saat pulang.
   3. MAKANANNYA WAJIB DIPILIH, minimal satu. Itu permintaan pemilik di
      atas. Kalau suatu saat pemilik ingin melonggarkannya, satu baris yang
      diubah: {@link MINIMAL_PESAN}.
   4. MAKANANNYA DIKIRIM SEBAGAI BARIS BILL SUNGGUHAN (`res.lines`), bukan
      ditempel sebagai teks di catatan. Versi sebelumnya menulis
      "Pra-pesan: 2x Nasi Goreng" ke dalam `note` — kalimat yang tidak bisa
      ditagih, tidak bisa dikoreksi, tidak bisa di-void, dan tidak pernah
      sampai ke dapur. Sekarang: masuk bill meja, muncul di layar kasir,
      dan tiketnya keluar saat tamu check-in.

   Yang TIDAK terjadi saat reservasi dibuat: stok TIDAK dipotong dan uang
   TIDAK ditagih. Keduanya baru terjadi saat tamunya datang — reservasi
   untuk dua minggu lagi tidak boleh menghilangkan barang dari penjualan
   malam ini. Lihat `checkin` di `engine.ts`.

   Panduan desain yang diikuti (`docs/lampiran/L7-design-system.md` §7.1):
   wilayah Smokehouse memakai maroon + tekstur bata, TAPI tombol aksi tetap
   amber di seluruh aplikasi.
   ═══════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../components/UI";
import { SmokeMark } from "../components/Smoke";
import { FOTO_KATEGORI, FOTO_ITEM } from "../data/fotoMenu";
import {
  useAdmin, restoProblem, classOf, priceOf, kategoriJual, RESTO_LEAD_MIN, mejaDijual, cariMeja,
} from "../lib/adminStore";
import { slotStart } from "../lib/occupancy";
import { TABLES, HOURS, fmtHour } from "../data/venue";
import { addDaysISO, fmtDateShort, todayISO, bookingCode, rupiah } from "../lib/core";
import { bacaProfil, simpanProfil, rapikanHp } from "../lib/profilTamu";
import { catatKode } from "../lib/customerStore";
import { setVenueTamu } from "../lib/venueAktif";
import type { CartLine } from "../lib/store";

/** Lama meja ditahan dari jam datang. Tidak ditampilkan sebagai pilihan. */
const TAHAN_JAM = 2;
const PAX = [2, 3, 4, 5, 6, 8, 10];
/** Berapa hidangan minimal yang harus ikut dipesan (permintaan pemilik). */
const MINIMAL_PESAN = 1;

export default function ReservasiResto() {
  const { a: venue, dispatchA, peek, tick } = useAdmin();
  void tick;
  const profil = useMemo(() => bacaProfil(), []);
  const [tanggal, setTanggal] = useState(todayISO());
  const [jam, setJam] = useState<number | null>(null);
  const [pax, setPax] = useState(4);
  const [nama, setNama] = useState(profil.nama);
  const [hp, setHp] = useState(profil.hp);
  const [catatan, setCatatan] = useState("");
  const [pesan, setPesan] = useState<Record<string, number>>({});
  const [kat, setKat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [hasil, setHasil] = useState<
    { kode: string; checkin: string; meja: string; jam: number; baris: [string, number][]; total: number } | null
  >(null);
  const [galat, setGalat] = useState<string | null>(null);

  // Masuk lewat layar ini = tamu Smokehouse. Tanpa penanda ini, pesanan yang
  // dibuat sesudahnya jatuh ke rekap SPL.
  useMemo(() => { setVenueTamu("smh"); return null; }, []);

  const hari = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i)), []);
  const mejaResto = mejaDijual(venue).filter((t) => classOf(venue, t.id) === "resto");
  /** Menu yang boleh dilihat tamu (rokok counter tidak ikut). */
  const kategori = useMemo(() => kategoriJual(venue, { staf: false }), [venue]);
  const katAktif = kat ?? kategori[0]?.id ?? "";

  /**
   * Keadaan satu jam datang: berapa meja yang muat & kosong, dan KENAPA
   * kalau nol.
   *
   * "Penuh" dan "sudah lewat" adalah dua hal yang sangat berbeda bagi tamu —
   * yang pertama berarti coba jam lain, yang kedua berarti coba besok. Satu
   * label "penuh" untuk keduanya membuat jam 11.00 malam ini terlihat seperti
   * restoran yang laris, padahal jamnya memang sudah berlalu.
   */
  const keadaanJam = (h: number) => {
    const startsAt = slotStart(tanggal, h);
    const umum = restoProblem(venue, { pax, startsAt, hours: TAHAN_JAM });
    if (umum && !umum.startsWith("meja resto")) return { sisa: 0, alasan: "lewat" };
    const sisa = mejaResto.filter((t) => t.capacity >= pax &&
      !restoProblem(venue, { pax, startsAt, hours: TAHAN_JAM, tableId: t.id })).length;
    return { sisa, alasan: sisa > 0 ? "" : "penuh" };
  };

  const startsAt = jam !== null ? slotStart(tanggal, jam) : 0;
  const masalah = jam === null ? null : restoProblem(venue, { pax, startsAt, hours: TAHAN_JAM });
  const nomorOk = rapikanHp(hp).length >= 10;

  const baris = Object.entries(pesan).filter(([, q]) => q > 0);
  const jumlahItem = baris.reduce((n, [, q]) => n + q, 0);
  const total = baris.reduce((n, [id, q]) => n + priceOf(venue, id) * q, 0);
  const semuaItem = useMemo(() => kategori.flatMap((c) => c.items), [kategori]);
  const namaItem = (id: string) => semuaItem.find((i) => i.id === id)?.name ?? id;
  const ubah = (id: string, d: number) =>
    setPesan((p) => ({ ...p, [id]: Math.max(0, Math.min(20, (p[id] ?? 0) + d)) }));

  const cariBersih = cari.trim().toLowerCase();
  const tampil = cariBersih
    ? kategori
        .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(cariBersih)) }))
        .filter((c) => c.items.length > 0)
    : kategori.filter((c) => c.id === katAktif);

  const kurang = jam === null ? "Pilih jam datang dulu"
    : masalah ? "Jam itu sudah penuh"
    : jumlahItem < MINIMAL_PESAN ? "Pilih minimal satu hidangan"
    : nama.trim().length < 2 ? "Isi nama dulu"
    : !nomorOk ? "Nomor HP belum lengkap"
    : null;

  function kirim() {
    if (kurang) return;
    const kode = bookingCode();
    const id = `rr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    simpanProfil({ nama: nama.trim(), hp: rapikanHp(hp) });
    // Makanannya dikirim sebagai BARIS, bukan kalimat. Harganya tidak ikut
    // dikirim: mesin yang mengunci harga dari buku menunya sendiri, supaya
    // perangkat tamu tidak bisa menentukan harga.
    const lines: CartLine[] = baris.map(([itemId, qty], i) => ({
      key: `pra${i}-${itemId}`, itemId, qty,
    }));
    dispatchA({
      t: "reserveResto",
      res: {
        id, code: kode, guest: nama.trim(), phone: rapikanHp(hp), pax,
        startsAt, hours: TAHAN_JAM, lines,
        ...(catatan.trim() ? { note: catatan.trim().slice(0, 300) } : {}),
      },
    });
    const sesi = peek().sessions.find((s) => s.id === id);
    if (!sesi) {
      setGalat("Maaf, meja untuk jam itu baru saja penuh. Coba jam lain atau hubungi kami.");
      return;
    }
    catatKode(kode);
    setGalat(null);
    setHasil({
      kode, checkin: sesi.checkin ?? "-", jam: jam!, baris, total,
      meja: cariMeja(sesi.tableId)?.name ?? "Meja resto",
    });
  }

  /* ── Sesudah dipesan ─────────────────────────────────────────── */
  if (hasil) {
    return (
      <div className="pb-32">
        <Band judul="Meja Dipesan" sub="Tunjukkan kode ini ke kasir saat datang." />
        <div className="mx-auto max-w-lg px-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="-mt-4 rounded-2xl border border-line bg-ink-2 p-5 text-center shadow-lg shadow-ink/60">
            <div className="text-[11px] uppercase tracking-[0.18em] text-dim">Kode check-in</div>
            <div className="font-display text-4xl tracking-[0.3em] text-amber">{hasil.checkin}</div>
            <div className="mt-3 text-sm text-cream">{hasil.meja} · {pax} orang</div>
            <div className="text-[13px] text-mute">
              {fmtDateShort(tanggal).dow} {fmtDateShort(tanggal).day} {fmtDateShort(tanggal).mon} · datang {fmtHour(hasil.jam)}
            </div>
            <div className="mt-3 text-[11px] text-dim">No. reservasi {hasil.kode}</div>
          </motion.div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-ink-2">
            <div className="border-b border-line px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              Pesanan Anda · disiapkan saat datang
            </div>
            <ul className="divide-y divide-line">
              {hasil.baris.map(([id, q]) => (
                <li key={id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                  <span className="font-display text-[12px] tracking-[0.08em] text-brick-lit">{q}×</span>
                  <span className="min-w-0 flex-1 truncate text-cream">{namaItem(id)}</span>
                  <span className="shrink-0 tabular-nums text-mute">{rupiah(priceOf(venue, id) * q)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between px-4 py-2.5">
              <span className="text-[12px] text-mute">Perkiraan tagihan</span>
              <span className="font-display text-[15px] tabular-nums tracking-[0.08em] text-amber">{rupiah(hasil.total)}</span>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-dim">
              Belum ditagih. Dibayar di kasir waktu pulang, dan masih bisa ditambah di tempat.
            </p>
          </div>

          <div className="mt-3 rounded-xl border border-amber/40 bg-amber/8 px-4 py-3 text-[12px] leading-snug text-amber">
            Datang paling lambat 20 menit setelah jam reservasi — lewat itu mejanya dilepas untuk tamu lain.
            Kalau ada perubahan, hubungi kami langsung.
          </div>
          <div className="mt-4">
            <Button full onClick={() => { setHasil(null); setJam(null); setPesan({}); }}>Pesan meja lagi</Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Formulir ────────────────────────────────────────────────── */
  return (
    <div className="pb-44">
      <Band judul="Reservasi Meja" sub={`Meja dan makanannya sekalian. ${mejaResto.length} meja makan, tanpa bayar di muka.`} />

      <div className="mx-auto max-w-lg space-y-7 px-5 pt-5">
        {/* ── 1 · Kapan & berapa orang ─────────────────────────── */}
        <section>
          <Langkah n={1} judul="Kapan datang" />
          <div className="no-bar -mx-5 flex gap-2 overflow-x-auto px-5">
            {hari.map((d) => (
              <button key={d} onClick={() => { setTanggal(d); setJam(null); }}
                aria-pressed={d === tanggal}
                className={`min-h-[56px] shrink-0 rounded-xl border px-4 text-center ${
                  d === tanggal ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-mute"
                }`}>
                <div className="text-[10px] uppercase tracking-wider opacity-70">
                  {d === todayISO() ? "Hari ini" : fmtDateShort(d).dow}
                </div>
                <div className="font-display text-base leading-tight">
                  {fmtDateShort(d).day} {fmtDateShort(d).mon}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PAX.map((n) => (
              <button key={n} onClick={() => { setPax(n); setJam(null); }} aria-pressed={pax === n}
                className={`min-h-[44px] min-w-[52px] rounded-xl border px-3 text-sm font-semibold ${
                  pax === n ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-cream"
                }`}>{n}</button>
            ))}
            <span className="self-center text-[12px] text-dim">orang</span>
          </div>
          {pax > 8 && (
            <p className="mt-1.5 text-[12px] text-amber">
              Rombongan di atas 8 orang biasanya perlu gabung meja — hubungi kami dulu supaya disiapkan.
            </p>
          )}

          <div className="mt-3 grid grid-cols-4 gap-2">
            {HOURS.filter((h) => h + TAHAN_JAM <= 26).map((h) => {
              const { sisa, alasan } = keadaanJam(h);
              const bisa = sisa > 0;
              return (
                <button key={h} disabled={!bisa} onClick={() => setJam(h)} aria-pressed={jam === h}
                  className={`min-h-[52px] rounded-xl border text-center ${
                    jam === h ? "border-amber bg-amber text-ink"
                      : bisa ? "border-line bg-ink-2 text-cream" : "border-line bg-ink-3 text-dim opacity-40"
                  }`}>
                  <div className="font-display text-sm leading-tight">{fmtHour(h)}</div>
                  <div className={`text-[9px] ${jam === h ? "text-ink/70" : "text-dim"}`}>
                    {bisa ? `${sisa} meja` : alasan}
                  </div>
                </button>
              );
            })}
          </div>
          {masalah && <p className="mt-2 text-[12px] text-red-400">{masalah}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Tidak ada hitungan jam seperti meja biliar — Anda boleh duduk selama makan.
            Mejanya kami tahan {TAHAN_JAM} jam dari jam datang. Reservasi paling cepat
            {" "}{RESTO_LEAD_MIN} menit sebelum datang; untuk sekarang juga, langsung datang saja.
          </p>
        </section>

        {/* ── 2 · Pilih hidangannya ────────────────────────────── */}
        <section>
          <Langkah n={2} judul="Pilih hidangannya" wajib />

          <input value={cari} onChange={(e) => setCari(e.target.value)}
            placeholder="Cari hidangan…" aria-label="Cari hidangan"
            className="min-h-[44px] w-full rounded-xl border border-line bg-ink-2 px-4 text-[14px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />

          {/* Chip kategori: MAROON — warna wilayah Smokehouse (L7 §7.1),
              bukan warna aksi. Yang amber hanya tombol yang memindahkan uang. */}
          {!cariBersih && (
            <div className="no-bar -mx-5 mt-2.5 flex gap-1.5 overflow-x-auto px-5">
              {kategori.map((c) => (
                <button key={c.id} onClick={() => setKat(c.id)} aria-pressed={c.id === katAktif}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] ${
                    c.id === katAktif
                      ? "border-brick-lit bg-brick text-cream"
                      : "border-line bg-ink-2 text-mute hover:text-cream"
                  }`}>{c.name}</button>
              ))}
            </div>
          )}

          {tampil.map((c) => (
            <div key={c.id} className="mt-3">
              {FOTO_KATEGORI[c.id] && !cariBersih && (
                <div className="relative mb-2 overflow-hidden rounded-xl border border-line">
                  <img src={FOTO_KATEGORI[c.id]} alt="" loading="lazy" className="h-28 w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <div className="font-display text-[14px] uppercase tracking-[0.1em] text-cream">{c.name}</div>
                    {c.kicker && <div className="text-[11px] text-cream/70">{c.kicker}</div>}
                  </div>
                </div>
              )}
              {cariBersih && (
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">{c.name}</div>
              )}
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-2">
                {c.items.map((it) => {
                  const q = pesan[it.id] ?? 0;
                  const habis = venue.soldOut.includes(it.id);
                  const foto = FOTO_ITEM[it.id];
                  return (
                    <li key={it.id} className={`flex items-center gap-3 px-3 py-2.5 ${habis ? "opacity-45" : ""}`}>
                      {foto && (
                        <img src={foto} alt="" loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] text-cream">{it.name}</div>
                        <div className="text-[12px] tabular-nums text-dim">
                          {rupiah(priceOf(venue, it.id))}
                          {habis && <span className="ml-2 text-red-400">habis hari ini</span>}
                        </div>
                      </div>
                      {q > 0 && (
                        <>
                          <button onClick={() => ubah(it.id, -1)} aria-label={`Kurangi ${it.name}`}
                            className="h-9 w-9 shrink-0 rounded-lg border border-line text-cream">−</button>
                          <span className="w-5 shrink-0 text-center text-[14px] tabular-nums text-cream">{q}</span>
                        </>
                      )}
                      <button onClick={() => ubah(it.id, 1)} disabled={habis} aria-label={`Tambah ${it.name}`}
                        className="h-9 w-9 shrink-0 rounded-lg border border-amber/50 bg-amber/10 text-lg leading-none text-amber disabled:opacity-40">
                        +
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {tampil.length === 0 && (
            <p className="mt-3 text-[13px] text-dim">Tidak ada hidangan yang cocok dengan “{cari}”.</p>
          )}
        </section>

        {/* ── 3 · Atas nama ───────────────────────────────────── */}
        <section>
          <Langkah n={3} judul="Atas nama" />
          <div className="space-y-2">
            <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama"
              className="min-h-[48px] w-full rounded-xl border border-line bg-ink-2 px-4 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            <input value={hp} onChange={(e) => setHp(e.target.value)} inputMode="tel" placeholder="Nomor HP / WhatsApp"
              className="min-h-[48px] w-full rounded-xl border border-line bg-ink-2 px-4 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            <input value={catatan} onChange={(e) => setCatatan(e.target.value.slice(0, 120))}
              placeholder="Catatan (mis. dekat jendela, ulang tahun, tidak pedas)"
              className="min-h-[48px] w-full rounded-xl border border-line bg-ink-2 px-4 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            {hp && !nomorOk && <p className="text-[12px] text-red-400">Nomor HP belum lengkap.</p>}
          </div>
        </section>

        <div className="rounded-xl border border-line bg-ink-2 px-3.5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Ketentuan</div>
          <ul className="mt-1 space-y-1 text-[12px] leading-snug text-mute">
            <li>• Reservasi mejanya <span className="text-cream">gratis</span> — yang dibayar hanya makanan &amp; minuman, di kasir.</li>
            <li>• Tidak ada sewa waktu; mejanya ditahan {TAHAN_JAM} jam dari jam datang.</li>
            <li>• Datang paling lambat 20 menit setelah jam reservasi; lewat itu meja dilepas untuk tamu lain.</li>
            <li>• Hidangan disiapkan saat Anda datang, bukan sekarang — masih bisa ditambah di tempat.</li>
          </ul>
        </div>

        {galat && <p role="alert" className="text-[13px] text-red-400">{galat}</p>}
      </div>

      {/* ── Ringkasan menempel: isi keranjang selalu terlihat ────── */}
      <div className="safe-b fixed inset-x-0 bottom-[64px] z-30 border-t border-line bg-ink/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <AnimatePresence initial={false}>
            {jumlahItem > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="mb-2 flex items-baseline justify-between gap-3 overflow-hidden">
                <span className="min-w-0 truncate text-[12px] text-mute">
                  {jumlahItem} porsi · {baris.map(([id, q]) => `${q}× ${namaItem(id)}`).join(", ")}
                </span>
                <span className="shrink-0 font-display text-[15px] tabular-nums tracking-[0.08em] text-amber">
                  {rupiah(total)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <Button full disabled={!!kurang} onClick={kirim}>
            {kurang ?? `Pesan meja ${fmtHour(jam!)} · ${pax} orang · ${jumlahItem} porsi`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Band wilayah Smokehouse — maroon + tekstur bata (L7 §7.1 `DS-01`). */
function Band({ judul, sub }: { judul: string; sub: string }) {
  return (
    <header className="brick-tex grain safe-t relative overflow-hidden px-5 pb-7 pt-5">
      <div className="absolute inset-0 bg-gradient-to-b from-ink/45 via-ink/25 to-ink/80" />
      <div className="relative mx-auto max-w-lg">
        <div className="flex items-center gap-2 text-cream/90">
          <SmokeMark size={22} />
          <span className="font-display text-[12px] uppercase tracking-[0.18em]">Smokehouse Resto</span>
        </div>
        <h1 className="mt-2 font-display text-3xl uppercase leading-tight tracking-[0.04em] text-cream">{judul}</h1>
        <p className="mt-1 max-w-[24rem] text-[13px] leading-relaxed text-cream/75">{sub}</p>
      </div>
    </header>
  );
}

function Langkah({ n, judul, wajib }: { n: number; judul: string; wajib?: boolean }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brick font-display text-[12px] tracking-[0.08em] text-cream">
        {n}
      </span>
      <h2 className="font-display text-[13px] uppercase tracking-[0.14em] text-cream">{judul}</h2>
      {wajib && <span className="text-[11px] text-dim">wajib</span>}
    </div>
  );
}
