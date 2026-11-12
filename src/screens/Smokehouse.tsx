/**
 * SMOKEHOUSE — halaman venue resto (`/smokehouse`).
 *
 * Satu perjalanan menembus asap: foto hidangan berganti di balik asap yang menebal
 * di antara bab. Hanya membahas restoran.
 *
 * Halaman ini menandai venue tamu `smh`, supaya pesanan dari sini masuk rekap
 * Smokehouse. "Paling sering dipesan" dihitung dari penjualan 30 hari terakhir;
 * kalau belum ada datanya, judulnya berganti jadi "Andalan dapur".
 *
 * Tombol aksi tetap amber (`DS-01`). Di atas maroon, teks kecil memakai krem karena
 * amber di sana hanya 3,8:1. Jazzbury hanya sekali, di hero (L7 §7.4.1).
 */
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Coverflow from "../components/Coverflow";
import { Judul, LabelSandi, Muncul } from "../components/motion/Adegan";
import { BabTeks, Perjalanan, type Bab } from "../components/motion/Perjalanan";
import { AjakMember, Aksi, Aksi2, BilahVenue, PenutupVenue, TanyaJawab, wa } from "../components/BagianVenue";
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

const BATA = "linear-gradient(170deg,#3a120c,#160807 70%)";
const GELAP = "#160807";

/** Tiga foto studio untuk bab galeri; kategori tanpa foto dilewati. */
const GALERI = MENU.filter((c) => !c.staffOnly && FOTO_KATEGORI[c.id]).slice(0, 3)
  .map((c) => ({ nama: c.name, foto: FOTO_KATEGORI[c.id]! }));

/** Urutannya sama dengan urutan `BabTeks` di bawah. */
const BAB: Bab[] = [
  { foto: FOTO_HERO_SMH, redup: 0.2 },
  { foto: FOTO_HERO_SMH, redup: 0.8 },
  { warna: BATA, redup: 0.1 },
  ...GALERI.map((g) => ({ foto: g.foto, redup: 0.16 })),
  { warna: "#7a1b0e", redup: 0.35 },
  { warna: GELAP, redup: 0 },
  { warna: GELAP, redup: 0 },
];

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

  const TANYA = [
    { t: "Reservasi meja bayar juga?", j: `Mejanya gratis dan tidak dihitung per jam, ${mejaMakan} meja makan semuanya begitu. Hidangan dipilih saat mengisi reservasi, dan cuma itu yang kamu bayar di kasir waktu pulang.` },
    // Panel 100 pembeli (8 Nov 2026): banyak yang mengira pesan makanan wajib daftar akun Google.
    { t: "Perlu daftar akun untuk pesan makanan?", j: "Tidak. Pesan dari meja cukup isi nama, takeaway cukup nama dan nomor HP. Bayar di kasir atau QRIS. Akun member hanya dipakai untuk booking meja biliar." },
    { t: "Bisa pesan dari meja?", j: "Bisa, tanpa daftar akun. Scan QR di mejamu, dan pesanannya langsung masuk ke bill meja itu." },
    { t: "Bisa pesan untuk dibawa pulang?", j: "Bisa, tanpa daftar akun. Pesan dari HP, lalu ambil dan bayar di kasir saat sudah siap, atau bayar QRIS di muka." },
  ];

  return (
    <Perjalanan tema="smokehouse" bab={BAB}>
      <BilahVenue tema="smokehouse" aksi="Reservasi" keAksi="/smokehouse/reservasi" />

      <BabTeks tinggi="min-h-[120svh] md:min-h-[140svh]">
        <div className="mx-auto flex h-svh w-full max-w-6xl flex-col justify-end px-5 pb-24 sm:pb-14">
          <p className="naik font-display text-[12px] uppercase tracking-[0.22em] text-cream [text-shadow:0_1px_10px_#000]">Smokehouse Resto &middot; Padang</p>
          {/* Satu-satunya Jazzbury di halaman ini. */}
          <p className="naik mt-2 font-script text-[2rem] leading-none text-amber [text-shadow:0_2px_12px_#000,0_0_3px_#000]" style={{ animationDelay: ".08s" }}>
            Dapur nyala sampai malam.
          </p>
          <h1 className="mt-2 font-serif text-[3rem] font-bold leading-[.98] tracking-[-0.018em] text-cream sm:text-[5rem]">
            <span className="naik block" style={{ animationDelay: ".16s" }}>Diasap pelan,</span>
            <span className="naik block" style={{ animationDelay: ".24s" }}>disajikan hangat.</span>
          </h1>
          <div className="naik mt-6 flex flex-col gap-2.5 sm:flex-row" style={{ animationDelay: ".32s" }}>
            <Aksi onClick={() => nav("/smokehouse/reservasi")}>Reservasi &amp; pilih menu</Aksi>
            <Aksi2 onClick={() => nav("/smokehouse/buku-menu")}>Lihat menu &amp; harga</Aksi2>
          </div>
          <p className="naik mt-4 text-[13px] tabular-nums text-cream/80" style={{ animationDelay: ".4s" }}>
            <strong className="font-semibold text-amber">{buka ? "Dapur buka" : "Dapur tutup"}</strong>
            {" "}&middot; {fmtHour(OPEN_IDX)}&ndash;{fmtHour(CLOSE_IDX)} setiap hari
          </p>
        </div>
      </BabTeks>

      <BabTeks id="menu" tinggi="min-h-[135svh]" className="items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-24 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-5">
            <LabelSandi teks="Dapur" className="text-amber" />
            <Judul baris={["Iga asap, enaknya", "dimakan rame-rame."]} className="mt-3 text-[2.3rem] sm:text-[3.2rem]" />
            <Muncul>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-cream/80">
                Dibakar pelan dan diasap dengan rempah, disajikan dengan saus Western atau sambal Nusantara.
                Ada juga nasi goreng, camilan, kopi, dan mocktail.
              </p>
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                <Aksi onClick={() => nav("/menu")}>Pesan sekarang</Aksi>
                <Aksi2 onClick={() => nav("/smokehouse/buku-menu")}>Buku menu</Aksi2>
              </div>
            </Muncul>
          </div>
          <Muncul i={1} className="min-w-0 lg:col-span-7">
            <Coverflow kartu={kartu} label="Mau makan apa hari ini?" onPilih={(k) => nav(`/menu?kategori=${k.id}`)} />
            <div className="no-bar mt-3 flex gap-1.5 overflow-x-auto">
              {tanpaFoto.map((c) => (
                <button key={c.id} onClick={() => nav(`/menu?kategori=${c.id}`)}
                  className="shrink-0 rounded-full border border-cream/20 bg-ink/40 px-3 py-1.5 text-[12px] text-cream/85 hover:border-amber/70">
                  {c.name}
                </button>
              ))}
            </div>
          </Muncul>
        </div>
      </BabTeks>

      <BabTeks id="andalan" tinggi="min-h-svh md:min-h-[125svh]" className="items-center">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-24 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <LabelSandi teks={pakaiAngka ? "Terlaris" : "Pilihan dapur"} className="text-amber" />
            <Judul baris={pakaiAngka ? ["Paling sering", "dipesan."] : ["Andalan", "dapur kami."]} className="mt-3 text-[2.3rem] sm:text-[3.2rem]" />
            <p className="mt-3 text-[13px] text-cream/65">
              {pakaiAngka ? "Dari pesanan 30 hari terakhir di Smokehouse." : "Dipilih dapur, belum dari riwayat pesanan."}
            </p>
          </div>
          <Muncul i={1} className="min-w-0 lg:col-span-7">
            <ul>
              {pilihan.map((p, i) => {
                const it = findItem(p.itemId)!;
                const foto = FOTO_ITEM[p.itemId];
                return (
                  <li key={p.itemId} className={`border-b border-cream/15 ${i > 3 ? "hidden md:block" : ""}`}>
                    <button onClick={() => nav("/menu")} className="flex w-full items-center gap-3.5 py-3 text-left">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink/50">
                        {foto
                          ? <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <span className="font-display text-[14px] text-cream">{i + 1}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-cream">{it.name}</span>
                        <span className="text-[12px] text-cream/60">
                          {pakaiAngka ? `${p.qty} porsi terjual` : it.station === "bar" ? "Dari bar" : "Dari dapur"}
                        </span>
                      </span>
                      <span className="shrink-0 font-display text-[15px] tabular-nums text-amber">{rupiah(priceOf(a, p.itemId))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <AjakMember tema="smokehouse" teks="Pesan makanan tetap bisa tanpa akun. Dengan akun, riwayat pesananmu tersimpan dan info promo sampai lebih dulu." />
          </Muncul>
        </div>
      </BabTeks>

      {GALERI.map((g, i) => (
        <BabTeks key={g.nama} tinggi="min-h-svh md:min-h-[120svh]" className="items-end">
          <div className="mx-auto w-full max-w-6xl px-5 pb-[22svh]">
            {i === 0 && <LabelSandi teks="Dari dapur" className="text-amber" />}
            <Judul baris={[g.nama]} className="mt-2 text-[2.4rem] [text-shadow:0_2px_24px_rgba(0,0,0,.65)] sm:text-[3.8rem]" />
            <button onClick={() => nav("/menu")} className="mt-2 min-h-[40px] text-[13px] font-semibold text-amber">Lihat menunya &rarr;</button>
          </div>
        </BabTeks>
      ))}

      <BabTeks id="acara" tinggi="min-h-svh md:min-h-[120svh]" className="items-center">
        <div className="mx-auto w-full max-w-6xl px-5 py-24">
          <div className="max-w-2xl">
            <LabelSandi teks="Acara" className="text-cream" />
            <Judul baris={["Makan bareng", "satu rombongan."]} className="mt-3 text-[2.3rem] sm:text-[3.4rem]" />
            <Muncul>
              <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-cream/90">
                Ulang tahun, buka bersama, atau makan keluarga. Family Package iga bakar memang dibuat
                untuk 3 sampai 4 orang. Kasih tahu tanggalnya, kami siapkan mejanya.
              </p>
              <div className="mt-7"><Aksi href={wa(PESAN_ACARA)}>Atur acara</Aksi></div>
            </Muncul>
          </div>
        </div>
      </BabTeks>

      <BabTeks tinggi="min-h-svh md:min-h-[110svh]" className="items-center">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-24 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <LabelSandi teks="Tanya jawab" className="text-amber" />
            <Judul baris={["Sebelum kamu", "reservasi."]} className="mt-3 text-[2.3rem] sm:text-[3.4rem]" />
          </div>
          <Muncul i={1} className="lg:col-span-7"><TanyaJawab daftar={TANYA} /></Muncul>
        </div>
      </BabTeks>

      <PenutupVenue tema="smokehouse" />
    </Perjalanan>
  );
}
