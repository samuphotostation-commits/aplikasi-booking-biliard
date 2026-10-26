/**
 * SMOKEHOUSE — beranda venue resto untuk pelanggan (`/smokehouse`).
 *
 * Dipisah dari beranda SPL Sport karena dua venue memang dua tempat: yang
 * datang untuk makan tidak perlu melihat tarif meja biliar, dan sebaliknya.
 *
 * PENTING: halaman ini menandai venue tamu jadi `smh`, supaya pesanan yang
 * dibuat dari sini masuk REKAP SMOKEHOUSE. Tanpa itu, semua pesanan tamu
 * jatuh ke rekap SPL dan pemisahan rekap yang diminta pemilik jadi bohong.
 *
 * ── Susunan layarnya mengikuti cara orang memakai aplikasi resto ──────
 *
 * Koreksi pemilik 12 Okt 2026: *"beranda yang Smokehouse bisa dibuat lebih
 * menarik lagi dan memang seperti aplikasi pemesanan yang ada di resto-resto,
 * dan pastikan tidak terkesan AI design"*.
 *
 * Yang diubah, berurutan dari yang paling menentukan:
 *
 * 1. DERETAN TOMBOL DI TENGAH DIBUANG. Lima tombol bertumpuk dengan logo di
 *    atasnya adalah bentuk "menu utama aplikasi", bukan bentuk aplikasi
 *    resto. Aplikasi resto membuka dengan HIDANGAN.
 * 2. SATU AJAKAN, BUKAN LIMA. Reservasi+makanan jadi satu kartu besar; sisanya
 *    turun jadi baris kecil. Lima tombol sederajat berarti tidak ada yang
 *    penting.
 * 3. ANGKA YANG TAMPIL ADALAH ANGKA SUNGGUHAN. "Paling sering dipesan"
 *    dihitung dari penjualan venue 30 hari terakhir (`penjualanProduk`).
 *    Kalau belum ada datanya, judulnya BERGANTI jadi "Andalan dapur" —
 *    bukan daftar yang sama berpura-pura jadi statistik.
 *
 * Panduan yang diikuti (`docs/lampiran/L7-design-system.md` §7.1 `DS-01`):
 * wilayah Smokehouse memakai maroon + tekstur bata, tapi TOMBOL AKSI tetap
 * amber di seluruh aplikasi — pelanggan tidak boleh belajar dua warna untuk
 * satu kebiasaan. Jazzbury maksimal satu kali per layar (§7.4.1): dipakai di
 * tagline hero saja.
 */
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/UI";
import Coverflow from "../components/Coverflow";
import { kartuKategori } from "../lib/kartuMenu";
import { SmokeMark, IkonResto } from "../components/Smoke";
import { FOTO_KATEGORI, FOTO_ITEM, FOTO_HERO_SMH } from "../data/fotoMenu";
import { MENU, findItem } from "../data/menu";
import {
  useAdmin, hourIdx, OPEN_IDX, CLOSE_IDX, priceOf, penjualanProduk, shiftDate, businessDateOf,
} from "../lib/adminStore";
import { rupiah } from "../lib/core";
import { fmtHour } from "../data/venue";
import { setVenueTamu } from "../lib/venueAktif";

const muncul = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.05 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

/** Kategori yang boleh dilihat pelanggan (rokok counter tidak ikut). */
const KATEGORI = MENU.filter((c) => !c.staffOnly);

/**
 * Hidangan yang ditawarkan kalau venue belum punya riwayat penjualan.
 *
 * SENGAJA diberi judul berbeda ("Andalan dapur"), bukan dipaksa tampil
 * sebagai "paling sering dipesan". Daftar pilihan sendiri yang menyamar jadi
 * statistik adalah kebohongan kecil yang mahal: pemilik akan membandingkannya
 * dengan laporan penjualannya sendiri dan menemukan keduanya tidak cocok.
 */
const ANDALAN = ["br-01", "sa-01", "fr-04", "lb-01", "sd-01", "cd-01"];

export default function Smokehouse() {
  const nav = useNavigate();
  const { a, tick } = useAdmin();
  void tick;
  const h = hourIdx(Date.now());
  const buka = h >= OPEN_IDX && h < CLOSE_IDX;

  useEffect(() => { setVenueTamu("smh"); }, []);

  /**
   * Hidangan terlaris 30 hari terakhir, dari penjualan venue sendiri.
   * Barang counter biliar (rokok) tidak ikut: itu bukan hidangan.
   */
  const laris = useMemo(() => {
    const sampai = businessDateOf(Date.now());
    const lap = penjualanProduk(a, shiftDate(sampai, -29), sampai, "smh");
    return lap.baris
      .filter((b) => b.qty > 0 && b.station !== "billiard" && findItem(b.itemId))
      .slice(0, 6)
      .map((b) => ({ itemId: b.itemId, nama: b.nama, qty: b.qty }));
  }, [a]);

  const pilihan = laris.length >= 3
    ? laris
    : ANDALAN.filter((id) => findItem(id)).map((id) => ({ itemId: id, nama: findItem(id)!.name, qty: 0 }));
  const pakaiAngka = laris.length >= 3;

  const kartu = useMemo(() => kartuKategori(a), [a]);
  const tanpaFoto = KATEGORI.filter((c) => !FOTO_KATEGORI[c.id]);

  return (
    <div className="pb-28">
      {/* ── Band wilayah Smokehouse (L7 §7.1): maroon + tekstur bata ──
          Tekstur hero seksi adalah satu dari tiga hal yang BOLEH berbeda per
          sub-merek (`DS-01`), jadi di sini batanya dilapisi foto hidangan
          venue sendiri. Batanya tetap di belakang: kalau fotonya gagal
          dimuat, bandnya tetap maroon bertekstur, bukan kotak kosong. */}
      <header className="brick-tex grain safe-t relative overflow-hidden px-5 pb-7 pt-6">
        {FOTO_HERO_SMH && (
          <img src={FOTO_HERO_SMH} alt="" aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-70" />
        )}
        {/* Gelap di bawah supaya tulisannya tetap terbaca di atas foto apa pun. */}
        <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/55 to-ink/92" />
        <div className="relative mx-auto max-w-lg">
          <div className="flex items-center gap-2.5 text-cream">
            <SmokeMark size={34} />
            <div className="font-display text-2xl uppercase leading-none tracking-[0.1em]">
              Smokehouse
            </div>
          </div>
          {/* Satu-satunya Jazzbury di layar ini (L7 §7.4.1). */}
          <p className="mt-2 font-script text-3xl leading-none text-amber">
            Dapur nyala sampai malam.
          </p>
          <p className="mt-2 max-w-[22rem] text-[13px] leading-relaxed text-cream/80">
            Panggangan, masakan rumahan, kopi, dan minuman segar — satu lokasi dengan SPL Sport.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
              buka ? "bg-amber text-ink" : "bg-ink/70 text-mute ring-1 ring-line-2"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${buka ? "bg-ink" : "bg-mute"}`} />
              {buka ? "Dapur buka" : "Dapur tutup"}
            </span>
            <span className="text-[11px] tabular-nums text-cream/70">
              {fmtHour(OPEN_IDX)}–{fmtHour(CLOSE_IDX)} setiap hari
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-5">
        {/* ── Satu ajakan utama: meja DAN makanannya sekalian ──────── */}
        <motion.section variants={muncul} initial="hidden" animate="show" custom={0}
          className="-mt-4 rounded-2xl border border-line bg-ink-2 p-4 shadow-lg shadow-ink/60">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-brick-lit"><IkonResto size={22} /></span>
            <div className="min-w-0">
              <h2 className="font-serif text-xl leading-tight text-cream">Pesan meja &amp; makanannya</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
                Pilih jam datang, lalu pilih hidangannya sekalian. Dapur menyiapkan saat Anda
                tiba — bayarnya di kasir waktu pulang.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Button full onClick={() => nav("/smokehouse/reservasi")}>Reservasi &amp; Pilih Menu</Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Tautan label="Pesan sekarang" sub="ambil / di meja" onClick={() => nav("/menu")} />
            <Tautan label="Pesanan saya" sub="lacak & kode" onClick={() => nav("/pesanan")} />
          </div>
        </motion.section>

        {/* ── Kategori berfoto: orang memilih makanan dengan mata ────
            Bentuk korselnya diminta pemilik 13 Okt 2026. Menggantikan rel
            geser datar: di rel, foto yang sedang dilihat tidak lebih penting
            dari tetangganya, jadi tidak ada yang "dipilihkan" untuk tamu. */}
        <motion.section variants={muncul} initial="hidden" animate="show" custom={1} className="mt-7">
          <Kepala judul="Jelajahi dapur" aksi="Semua menu" onAksi={() => nav("/menu")} />
          <Coverflow
            kartu={kartu}
            onPilih={(k) => nav(`/menu?kategori=${k.id}`)}
            className="-mx-1"
          />
          {/* Kategori tanpa foto jadi chip maroon — warna WILAYAH, bukan aksi. */}
          <div className="no-bar -mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5">
            {tanpaFoto.map((c) => (
              <button key={c.id} onClick={() => nav(`/menu?kategori=${c.id}`)}
                className="shrink-0 rounded-full border border-brick/60 bg-brick/15 px-3 py-1.5 text-[12px] text-cream/85 hover:bg-brick/30">
                {c.name}
              </button>
            ))}
          </div>
        </motion.section>

        {/* ── Terlaris dari penjualan sungguhan ────────────────────── */}
        <motion.section variants={muncul} initial="hidden" animate="show" custom={2} className="mt-7">
          <Kepala
            judul={pakaiAngka ? "Paling sering dipesan" : "Andalan dapur"}
            aksi="Lihat semua" onAksi={() => nav("/menu")}
          />
          <p className="-mt-1 mb-2 text-[11px] text-dim">
            {pakaiAngka ? "Dari pesanan 30 hari terakhir di Smokehouse." : "Pilihan dapur — belum ada riwayat pesanan."}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-2">
            {pilihan.map((p, i) => {
              const it = findItem(p.itemId)!;
              const foto = FOTO_ITEM[p.itemId];
              return (
                <li key={p.itemId}>
                  <button onClick={() => nav("/menu")} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-ink">
                      {foto
                        ? <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <span className="font-display text-[13px] tracking-[0.08em] text-brick-lit">{i + 1}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-cream">{it.name}</span>
                      <span className="text-[11px] text-dim">
                        {pakaiAngka ? `${p.qty} porsi terjual` : it.station === "bar" ? "Dari bar" : "Dari dapur"}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-[13px] tabular-nums tracking-[0.08em] text-amber">
                      {rupiah(priceOf(a, p.itemId))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.section>

        {/* ── Yang masih sering ditanya di tempat ──────────────────── */}
        <motion.section variants={muncul} initial="hidden" animate="show" custom={3} className="mt-7">
          <div className="grid grid-cols-2 gap-2">
            <Tautan label="Buku menu" sub="foto & harga" onClick={() => nav("/smokehouse/buku-menu")} />
            <Tautan label="SPL Sport" sub="meja biliar" onClick={() => nav("/sport")} />
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-dim">
            Sedang duduk di meja? Scan QR di mejanya — pesanan langsung masuk ke bill meja itu
            dan tinggal dibayar di kasir waktu pulang.
          </p>
        </motion.section>
      </div>
    </div>
  );
}

function Kepala({ judul, aksi, onAksi }: { judul: string; aksi: string; onAksi: () => void }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[13px] uppercase tracking-[0.14em] text-cream">{judul}</h2>
      <button onClick={onAksi} className="shrink-0 text-[12px] font-semibold text-amber">{aksi}</button>
    </div>
  );
}

function Tautan({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="rounded-xl border border-line bg-ink-2 px-3 py-2.5 text-left hover:border-line-2">
      <div className="text-[13px] text-cream">{label}</div>
      <div className="text-[11px] text-dim">{sub}</div>
    </button>
  );
}
