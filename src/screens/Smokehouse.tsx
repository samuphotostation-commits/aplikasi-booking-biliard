/**
 * SMOKEHOUSE — halaman venue resto (`/smokehouse`).
 *
 * Hanya membahas restoran: hidangan, reservasi, acara, dan lokasi. Yang datang
 * untuk makan tidak perlu melihat tarif meja biliar.
 *
 * Halaman ini menandai venue tamu `smh`, supaya pesanan yang dibuat dari sini
 * masuk rekap Smokehouse.
 *
 * "Paling sering dipesan" dihitung dari penjualan 30 hari terakhir. Kalau belum
 * ada datanya, judulnya berganti jadi "Andalan dapur", bukan daftar yang sama
 * berpura-pura jadi statistik.
 *
 * Wilayah ini memakai maroon dan tekstur bata (`DS-01`), tapi tombol aksi tetap
 * amber. Jazzbury hanya sekali, di hero (L7 §7.4.1).
 */
import { useEffect, useMemo, useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Coverflow from "../components/Coverflow";
import { Adegan, Asap3D, GaleriGeser, GarisMaju, Judul, LabelSandi, Muncul, TEPI_NAIK, useGerakPenuh } from "../components/motion/Adegan";
import { Aksi, Aksi2, BilahVenue, PenutupVenue, TanyaJawab, wa } from "../components/BagianVenue";
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

  /** Hidangan terlaris 30 hari terakhir, dari penjualan venue sendiri. */
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
  const mejaMakan = useMemo(() => mejaDijual(a).filter((t) => t.venue === "smh").length, [a]);
  const galeri = useMemo(() => KATEGORI
    .filter((c) => FOTO_KATEGORI[c.id])
    .map((c) => ({ src: FOTO_KATEGORI[c.id]!, alt: c.name })), []);

  const TANYA = [
    { t: "Reservasi meja bayar juga?", j: `Mejanya gratis dan tidak dihitung per jam, ${mejaMakan} meja makan semuanya begitu. Hidangan dipilih saat mengisi reservasi, dan cuma itu yang kamu bayar di kasir waktu pulang.` },
    { t: "Bisa pesan dari meja?", j: "Bisa. Scan QR di mejamu, dan pesanannya langsung masuk ke bill meja itu." },
    { t: "Bisa pesan untuk dibawa pulang?", j: "Bisa. Pesan dari HP, lalu ambil di kasir saat sudah siap." },
  ];

  return (
    <div className="bg-[#160807] pb-16 md:pb-0">
      <GarisMaju warna="bg-brick-lit" />
      <BilahVenue tema="smokehouse" aksi="Reservasi" keAksi="/smokehouse/reservasi" />

      <Hero buka={buka} onReservasi={() => nav("/smokehouse/reservasi")} onMenu={() => nav("/smokehouse/buku-menu")} />

      <Adegan id="menu" urut={1} className={`${TEPI_NAIK} bata-redup`}>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:py-24 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <LabelSandi teks="Dapur" className="text-amber" />
            <Judul baris={["Iga asap, enaknya", "dimakan rame-rame."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-cream/75">
              Dibakar pelan dan diasap dengan rempah, disajikan dengan saus Western atau sambal Nusantara.
              Ada juga nasi goreng, camilan, kopi, dan mocktail.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <Aksi onClick={() => nav("/menu")}>Pesan sekarang</Aksi>
              <Aksi2 onClick={() => nav("/smokehouse/buku-menu")}>Buku menu</Aksi2>
            </div>
          </div>
          <Muncul i={1} className="min-w-0 lg:col-span-7">
            <Coverflow kartu={kartu} label="Mau makan apa hari ini?" onPilih={(k) => nav(`/menu?kategori=${k.id}`)} />
            <div className="no-bar mt-3 flex gap-1.5 overflow-x-auto">
              {tanpaFoto.map((c) => (
                <button key={c.id} onClick={() => nav(`/menu?kategori=${c.id}`)}
                  className="shrink-0 rounded-full border border-brick/60 bg-brick/15 px-3 py-1.5 text-[12px] text-cream/85 hover:bg-brick/30">
                  {c.name}
                </button>
              ))}
            </div>
          </Muncul>
        </div>
      </Adegan>

      <Adegan id="andalan" urut={2} className={`${TEPI_NAIK} bg-ink`}>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <LabelSandi teks={pakaiAngka ? "Terlaris" : "Pilihan dapur"} className="text-amber" />
            <Judul baris={pakaiAngka ? ["Paling sering", "dipesan."] : ["Andalan", "dapur kami."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
            <p className="mt-3 text-[13px] text-dim">
              {pakaiAngka ? "Dari pesanan 30 hari terakhir di Smokehouse." : "Dipilih dapur, belum dari riwayat pesanan."}
            </p>
          </div>
          <Muncul i={1} className="lg:col-span-7">
            <ul className="divide-y divide-line border-y border-line">
              {pilihan.map((p, i) => {
                const it = findItem(p.itemId)!;
                const foto = FOTO_ITEM[p.itemId];
                return (
                  <li key={p.itemId}>
                    <button onClick={() => nav("/menu")} className="flex w-full items-center gap-3.5 py-3 text-left">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-ink-2">
                        {foto
                          ? <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <span className="font-display text-[14px] text-brick-lit">{i + 1}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-cream">{it.name}</span>
                        <span className="text-[12px] text-dim">
                          {pakaiAngka ? `${p.qty} porsi terjual` : it.station === "bar" ? "Dari bar" : "Dari dapur"}
                        </span>
                      </span>
                      <span className="shrink-0 font-display text-[14px] tabular-nums text-amber">{rupiah(priceOf(a, p.itemId))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Muncul>
        </div>
      </Adegan>

      <GaleriGeser urut={3} foto={galeri} warna="bata-redup"
        kepala={<>
          <LabelSandi teks="Dari dapur" className="text-amber" />
          <Judul baris={["Lihat dulu,", "baru pilih."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
        </>} />

      <Adegan id="acara" urut={4} className={TEPI_NAIK}>
        <div className="relative isolate overflow-hidden rounded-[inherit] bg-brick">
          <div aria-hidden className="brick-tex absolute inset-0 -z-10" />
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-28">
            <div className="max-w-2xl">
              <LabelSandi teks="Acara" className="text-cream" />
              <Judul baris={["Makan bareng", "satu rombongan."]} className="mt-3 text-[2.1rem] sm:text-[2.9rem]" />
              <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-cream/90">
                Ulang tahun, buka bersama, atau makan keluarga. Family Package iga bakar memang dibuat
                untuk 3 sampai 4 orang. Kasih tahu tanggalnya, kami siapkan mejanya.
              </p>
              <div className="mt-7"><Aksi href={wa(PESAN_ACARA)}>Atur acara</Aksi></div>
            </div>
          </div>
        </div>
      </Adegan>

      <Adegan urut={5} className={`${TEPI_NAIK} bg-ink`}>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <LabelSandi teks="Tanya jawab" className="text-amber" />
            <Judul baris={["Sebelum kamu", "reservasi."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
          </div>
          <Muncul i={1} className="lg:col-span-7"><TanyaJawab daftar={TANYA} /></Muncul>
        </div>
      </Adegan>

      <PenutupVenue tema="smokehouse" urut={6} />
    </div>
  );
}

/** Hero tertahan selama digulir: asap menebal sampai menutupi layar, lalu bagian berikutnya naik. */
function Hero({ buka, onReservasi, onMenu }: { buka: boolean; onReservasi: () => void; onMenu: () => void }) {
  const penuh = useGerakPenuh();
  const jalur = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: jalur, offset: ["start start", "end end"] });
  const halus = useSpring(p, { stiffness: 110, damping: 28, mass: 0.35 });
  const fotoSkala = useTransform(halus, [0, 1], [1, 1.16]);
  const teksY = useTransform(halus, [0, 0.55], [0, -90]);
  const teksO = useTransform(halus, [0.15, 0.55], [1, 0]);
  const kuat = useTransform(halus, [0.1, 1], [0, 1]);

  return (
    <section ref={jalur} className={`relative ${penuh ? "h-[210svh]" : ""}`} style={{ zIndex: 0 }}>
      <div className="brick-tex sticky top-0 h-svh overflow-hidden bg-[#2a0f0a]">
        {FOTO_HERO_SMH && (
          <motion.img src={FOTO_HERO_SMH} alt="Hidangan Smokehouse Resto" fetchPriority="high" style={{ scale: fotoSkala }}
            className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#1f0b08] via-ink/40 to-ink/25" />
        <Asap3D kuat={kuat} className="absolute inset-0" />

        <motion.div style={{ y: teksY, opacity: teksO }}
          className="absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-6xl px-5 pb-24 sm:pb-16">
          <p className="naik font-display text-[12px] uppercase tracking-[0.22em] text-cream">Smokehouse Resto &middot; Padang</p>
          {/* Satu-satunya Jazzbury di halaman ini (L7 §7.4.1). */}
          <p className="naik mt-2 font-script text-[2rem] leading-none text-amber" style={{ animationDelay: ".08s" }}>
            Dapur nyala sampai malam.
          </p>
          <h1 className="mt-2 font-serif text-[2.9rem] font-bold leading-[1] tracking-[-0.015em] text-cream sm:text-[4.5rem]">
            <span className="naik block" style={{ animationDelay: ".16s" }}>Diasap pelan,</span>
            <span className="naik block" style={{ animationDelay: ".24s" }}>disajikan hangat.</span>
          </h1>
          <div className="naik mt-6 flex flex-col gap-2.5 sm:flex-row" style={{ animationDelay: ".32s" }}>
            <Aksi onClick={onReservasi}>Reservasi &amp; pilih menu</Aksi>
            <Aksi2 onClick={onMenu}>Lihat menu &amp; harga</Aksi2>
          </div>
          <p className="naik mt-4 text-[13px] tabular-nums text-cream/80" style={{ animationDelay: ".4s" }}>
            <strong className="font-semibold text-amber">{buka ? "Dapur buka" : "Dapur tutup"}</strong>
            {" "}&middot; {fmtHour(OPEN_IDX)}&ndash;{fmtHour(CLOSE_IDX)} setiap hari
          </p>
        </motion.div>
      </div>
    </section>
  );
}
