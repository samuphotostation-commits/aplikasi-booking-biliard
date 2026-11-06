/**
 * SMOKEHOUSE — halaman venue resto (`/smokehouse`).
 *
 * Satu perjalanan menembus lorong asap dan bara: hidangan muncul dari kejauhan lalu
 * lewat melampaui kamera. Foto tampil utuh dalam bingkai, karena semua foto menu
 * mendatar dan akan terpotong kalau dipaksa memenuhi layar HP. Hanya membahas restoran.
 *
 * Halaman ini menandai venue tamu `smh`, supaya pesanan dari sini masuk rekap
 * Smokehouse. "Paling sering dipesan" dihitung dari penjualan 30 hari terakhir;
 * kalau belum ada datanya, judulnya berganti jadi "Andalan dapur".
 *
 * Tombol aksi tetap amber (`DS-01`). Di atas maroon, teks kecil memakai krem karena
 * amber di sana hanya 3,8:1. Jazzbury hanya sekali, di hero (L7 §7.4.1).
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Coverflow from "../components/Coverflow";
import { Judul, LabelSandi, Muncul } from "../components/motion/Adegan";
import { Bingkai, Perjalanan } from "../components/motion/Perjalanan";
import { Aksi, Aksi2, BilahVenue, PenutupVenue, TanyaJawab, wa } from "../components/BagianVenue";
import { aturBola } from "../lib/jamPanggung";
import { kartuKategori } from "../lib/kartuMenu";
import { FOTO_KATEGORI, FOTO_ITEM, FOTO_HERO_SMH } from "../data/fotoMenu";
import { MENU, findItem } from "../data/menu";
import {
  useAdmin, hourIdx, OPEN_IDX, CLOSE_IDX, mejaDijual, priceOf, penjualanProduk, shiftDate, businessDateOf,
} from "../lib/adminStore";
import { rupiah } from "../lib/core";
import { fmtHour } from "../data/venue";
import { setVenueTamu } from "../lib/venueAktif";

const PESAN_ACARA = "Halo Smokehouse, saya mau atur acara makan. Tanggal: ... Jumlah orang: ...";

/**
 * Hidangan yang ditawarkan kalau venue belum punya riwayat penjualan.
 *
 * SENGAJA diberi judul berbeda ("Andalan dapur"), bukan dipaksa tampil
 * sebagai "paling sering dipesan". Daftar pilihan sendiri yang menyamar jadi
 * statistik adalah kebohongan kecil yang mahal: pemilik akan membandingkannya
 * dengan laporan penjualannya sendiri dan menemukan keduanya tidak cocok.
 */
const ANDALAN = ["br-01", "sa-01", "fr-04", "lb-01", "sd-01", "cd-01"];

/** Tiga foto studio untuk bab hidangan; kategori tanpa foto dilewati. */
const GALERI = MENU.filter((c) => !c.staffOnly && FOTO_KATEGORI[c.id]).slice(0, 3)
  .map((c) => ({ nama: c.name, id: c.id, foto: FOTO_KATEGORI[c.id]! }));

const Isi = ({ children, lebar = "max-w-xl" }: { children: ReactNode; lebar?: string }) => (
  <div className={`mx-auto w-full ${lebar} px-5 pb-[11svh] pt-[9svh]`}>{children}</div>
);

export default function Smokehouse() {
  const nav = useNavigate();
  const { a, tick } = useAdmin();
  void tick;
  const h = hourIdx(Date.now());
  const buka = h >= OPEN_IDX && h < CLOSE_IDX;

  useEffect(() => { setVenueTamu("smh"); aturBola({ o: 0, s: 0.02 }, 0.08); }, []);

  /** Hidangan terlaris 30 hari terakhir, dari penjualan venue sendiri. */
  const laris = useMemo(() => {
    const sampai = businessDateOf(Date.now());
    const lap = penjualanProduk(a, shiftDate(sampai, -29), sampai, "smh");
    return lap.baris
      .filter((b) => b.qty > 0 && b.station !== "billiard" && findItem(b.itemId))
      .slice(0, 4)
      .map((b) => ({ itemId: b.itemId, nama: b.nama, qty: b.qty }));
  }, [a]);

  const pilihan = laris.length >= 3
    ? laris
    : ANDALAN.filter((id) => findItem(id)).slice(0, 4).map((id) => ({ itemId: id, nama: findItem(id)!.name, qty: 0 }));
  const pakaiAngka = laris.length >= 3;

  const kartu = useMemo(() => kartuKategori(a), [a]);
  const mejaMakan = useMemo(() => mejaDijual(a).filter((t) => t.venue === "smh").length, [a]);

  const TANYA = [
    { t: "Reservasi meja bayar juga?", j: `Mejanya gratis dan tidak dihitung per jam, ${mejaMakan} meja makan semuanya begitu. Hidangan dipilih saat mengisi reservasi, dan cuma itu yang kamu bayar di kasir waktu pulang.` },
    { t: "Bisa pesan dari meja?", j: "Bisa. Scan QR di mejamu, dan pesanannya langsung masuk ke bill meja itu." },
    { t: "Bisa pesan untuk dibawa pulang?", j: "Bisa. Pesan dari HP, lalu ambil di kasir saat sudah siap." },
  ];

  const bab: ReactNode[] = [
    <Isi key="hero" lebar="max-w-2xl">
      <Bingkai src={FOTO_HERO_SMH} alt="Hidangan Smokehouse Resto" rasio="aspect-video" className="naik w-full" />
      <p className="naik mt-4 font-display text-[11px] uppercase tracking-[0.22em] text-cream" style={{ animationDelay: ".1s" }}>
        Smokehouse Resto &middot; Padang
      </p>
      {/* Satu-satunya Jazzbury di halaman ini. */}
      <p className="naik mt-1 font-script text-[1.8rem] leading-none text-amber" style={{ animationDelay: ".14s" }}>Dapur nyala sampai malam.</p>
      <h1 className="naik mt-1 font-serif text-[2.5rem] font-bold leading-[1] tracking-[-0.018em] text-cream sm:text-[3.6rem]" style={{ animationDelay: ".18s" }}>
        Diasap pelan, disajikan hangat.
      </h1>
      <div className="naik mt-4 grid grid-cols-[1.6fr_1fr] gap-2 sm:flex [&>*]:px-2 sm:[&>*]:px-7" style={{ animationDelay: ".26s" }}>
        <Aksi onClick={() => nav("/smokehouse/reservasi")}>Reservasi meja</Aksi>
        <Aksi2 onClick={() => nav("/smokehouse/buku-menu")}>Menu &amp; harga</Aksi2>
      </div>
      <p className="naik mt-3 text-[13px] tabular-nums text-cream/80" style={{ animationDelay: ".32s" }}>
        <strong className="font-semibold text-amber">{buka ? "Dapur buka" : "Dapur tutup"}</strong>
        {" "}&middot; {fmtHour(OPEN_IDX)}&ndash;{fmtHour(CLOSE_IDX)} setiap hari
      </p>
    </Isi>,

    <Isi key="iga">
      <LabelSandi teks="Dapur" className="text-amber" />
      <h2 className="mt-2 font-serif text-[2.3rem] font-bold leading-[1.03] text-cream sm:text-[3.2rem]">Iga asap, enaknya dimakan rame-rame.</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-cream/85">
        Dibakar pelan dan diasap dengan rempah, disajikan dengan saus Western atau sambal Nusantara.
        Ada juga nasi goreng, camilan, kopi, dan mocktail.
      </p>
      <div className="mt-5"><Aksi onClick={() => nav("/menu")}>Pesan sekarang</Aksi></div>
    </Isi>,

    <Isi key="menu" lebar="max-w-2xl">
      <h2 className="mb-3 font-serif text-[2rem] font-bold leading-[1.04] text-cream sm:text-[2.8rem]">Mau makan apa hari ini?</h2>
      <Coverflow kartu={kartu} label="Mau makan apa hari ini?" onPilih={(k) => nav(`/menu?kategori=${k.id}`)} />
    </Isi>,

    <Isi key="andalan">
      <LabelSandi teks={pakaiAngka ? "Terlaris" : "Pilihan dapur"} className="text-amber" />
      <h2 className="mt-2 font-serif text-[2.1rem] font-bold leading-[1.04] text-cream sm:text-[3rem]">
        {pakaiAngka ? "Paling sering dipesan." : "Andalan dapur kami."}
      </h2>
      <ul className="mt-4 rounded-2xl bg-ink/70 px-4">
        {pilihan.map((p, i) => {
          const it = findItem(p.itemId)!;
          const foto = FOTO_ITEM[p.itemId];
          return (
            <li key={p.itemId} className={i ? "border-t border-cream/10" : ""}>
              <button onClick={() => nav("/menu")} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink">
                  {foto ? <img src={foto} alt="" className="h-full w-full object-cover" />
                    : <span className="font-display text-[13px] text-cream">{i + 1}</span>}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-cream">{it.name}</span>
                <span className="shrink-0 font-display text-[14px] tabular-nums text-amber">{rupiah(priceOf(a, p.itemId))}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Isi>,

    ...GALERI.map((g) => (
      <Isi key={g.id} lebar="max-w-2xl">
        <Bingkai src={g.foto} alt={g.nama} className="w-full" />
        <h2 className="mt-4 font-serif text-[2.1rem] font-bold leading-[1.04] text-cream sm:text-[3rem]">{g.nama}</h2>
        <button onClick={() => nav(`/menu?kategori=${g.id}`)} className="mt-1 min-h-[40px] text-[13px] font-semibold text-amber">Lihat menunya &rarr;</button>
      </Isi>
    )),

    <Isi key="acara">
      <LabelSandi teks="Acara" className="text-amber" />
      <h2 className="mt-2 font-serif text-[2.3rem] font-bold leading-[1.03] text-cream sm:text-[3.2rem]">Makan bareng satu rombongan.</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-cream/85">
        Ulang tahun, buka bersama, atau makan keluarga. Family Package iga bakar memang dibuat
        untuk 3 sampai 4 orang. Kasih tahu tanggalnya, kami siapkan mejanya.
      </p>
      <div className="mt-5"><Aksi href={wa(PESAN_ACARA)}>Atur acara</Aksi></div>
    </Isi>,
  ];

  const id = ["awal", undefined, "menu", "andalan", ...GALERI.map(() => undefined), "acara"];

  return (
    <>
      <BilahVenue tema="smokehouse" aksi="Reservasi" keAksi="/smokehouse/reservasi" />
      <Perjalanan tema="smokehouse" gelap="#160807" fotoAwal={FOTO_HERO_SMH} id={id} bab={bab} ekor={
        <>
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-5">
              <LabelSandi teks="Tanya jawab" className="text-amber" />
              <Judul baris={["Sebelum kamu", "reservasi."]} className="mt-3 text-[2.3rem] sm:text-[3.4rem]" />
            </div>
            <Muncul i={1} className="lg:col-span-7"><TanyaJawab daftar={TANYA} /></Muncul>
          </div>
          <PenutupVenue tema="smokehouse" />
        </>
      } />
    </>
  );
}
