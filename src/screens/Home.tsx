/**
 * SPL SPORT — halaman venue biliar (`/sport`).
 *
 * Satu pukulan panjang: kamera mengikuti bola 8 menyusuri garis bidik amber di atas
 * meja, melewati bab demi bab, sampai bola masuk lubang di ujung. Arah bola selalu
 * sama, maju menjauh dari mata, jadi tidak pernah membingungkan.
 *
 * Halaman ini menandai venue tamu `spl`, supaya pesanan dari sini masuk rekap SPL.
 * Semua angka dibaca dari data venue yang berlaku.
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Ball } from "../components/motion/Billiard";
import { Bingkai, Perjalanan } from "../components/motion/Perjalanan";
import { Judul, LabelSandi, Muncul } from "../components/motion/Adegan";
import { Aksi, Aksi2, BilahVenue, PenutupVenue, TanyaJawab, wa } from "../components/BagianVenue";
import { FOTO_SPORT, fotoVenue } from "../data/fotoVenue";
import { fmtHour } from "../data/venue";
import {
  CLOSE_IDX, OPEN_IDX, classOf, hourIdx, mejaDijual, namaMinumanPaket, paketAktif, useAdmin,
} from "../lib/adminStore";
import { tableFreeForRange } from "../lib/occupancy";
import { rupiah } from "../lib/core";
import { setVenueTamu } from "../lib/venueAktif";

const SUASANA: [string, string][] = [
  ["bl-167", "Malam di aula utama."],
  ["bl-147", "Fokus di satu pukulan."],
  ["bl-119", "Datang berdua atau rame-rame."],
];

const LANGKAH = [
  ["Pilih tanggal & jam", "Lihat meja yang masih kosong."],
  ["Pilih meja", "Reguler atau VIP Room."],
  ["Bayar QRIS", "Slot terkunci, dapat kode check-in."],
  ["Check-in ke petugas", "Waktu mulai saat lampu mejamu menyala."],
];
const WARNA_BOLA = ["#F0A202", "#992212", "#1F6F4A", "#0B0B0C"];
const PESAN_ACARA = "Halo SPL Sport, saya mau atur acara. Tanggal: ... Jumlah orang: ...";

/** Isi satu bab: muat satu layar, dan menyisakan tempat untuk bola di bawah. */
const Isi = ({ children, lebar = "max-w-xl" }: { children: ReactNode; lebar?: string }) => (
  <div className={`mx-auto w-full ${lebar} px-5 pb-[20svh] pt-[9svh]`}>{children}</div>
);

export default function Home() {
  const nav = useNavigate();
  useEffect(() => { setVenueTamu("spl"); }, []);
  const { a: venue } = useAdmin();
  const R = venue.rates;

  const nowTs = Date.now();
  const mejaBiliar = useMemo(
    () => mejaDijual(venue).filter((t) => classOf(venue, t.id) !== "resto"), [venue]);
  const ruangVip = mejaBiliar.filter((t) => t.type === "vip" || t.type === "vvip").length;
  const kosong = mejaBiliar.filter((t) =>
    tableFreeForRange(venue.sessions, t.id, nowTs, nowTs + 60_000, undefined, nowTs)).length;
  const jam = hourIdx(nowTs);
  const buka = jam >= OPEN_IDX && jam < CLOSE_IDX;

  const paket = paketAktif(venue).filter((p) => (p.venue ?? "spl") === "spl" && p.hours > 0).slice(0, 1);
  const minumanPaket = useMemo(() => namaMinumanPaket(venue), [venue]);

  const TARIF = [
    { nama: "Reguler siang", ket: "11.00 sampai 18.00", harga: R.regularDay },
    { nama: "Reguler malam", ket: "18.00 sampai tutup", harga: R.regularNight },
    { nama: "VIP Room", ket: "tertutup, bebas asap rokok", harga: R.vip },
    { nama: "VVIP Room", ket: "tertutup, boleh merokok", harga: R.vvip },
  ];

  const TANYA = [
    { t: "Harus bayar di muka?", j: "Iya, lewat QRIS waktu booking. Begitu bayarnya masuk, mejanya terkunci atas namamu dan tidak bisa diambil orang lain." },
    { t: "Hitungan jamnya mulai dari kapan?", j: "Dari saat kamu duduk dan kasir menyalakan lampu mejanya, bukan dari jam yang kamu pilih. Datang telat sedikit tidak memotong waktu mainmu." },
    { t: "Kalau mainnya lewat jam 18.00?", j: `Dihitung per jam dengan dua tarif: ${rupiah(R.regularDay)}/jam sebelum 18.00 dan ${rupiah(R.regularNight)}/jam sesudahnya. Rinciannya muncul sebelum kamu bayar.` },
    { t: "Bedanya VIP dan VVIP?", j: `Dua-duanya ruang tertutup. VIP ${rupiah(R.vip)}/jam, bebas asap rokok. VVIP ${rupiah(R.vvip)}/jam, merokok diperbolehkan.` },
    { t: "Bisa pesan makanan sambil main?", j: "Bisa. Menunya dipesan dari HP dari meja mana pun, dan pesanannya diantar ke mejamu." },
  ];

  const bab: ReactNode[] = [
    <Isi key="hero" lebar="max-w-2xl">
      <Bingkai src={FOTO_SPORT} alt="Aula biliar SPL Sport" rasio="aspect-[3/2]" className="naik max-h-[30svh] w-full" />
      <p className="naik mt-4 font-display text-[11px] uppercase tracking-[0.22em] text-amber" style={{ animationDelay: ".1s" }}>
        SPL Sport &middot; Biliar Padang
      </p>
      <h1 className="naik mt-2 font-serif text-[2.5rem] font-bold leading-[1] tracking-[-0.018em] text-cream sm:text-[3.6rem]" style={{ animationDelay: ".16s" }}>
        Meja siap. Tinggal kamu datang.
      </h1>
      <div className="naik mt-4 grid grid-cols-[1.35fr_1fr] gap-2 sm:flex [&>*]:px-3 sm:[&>*]:px-7" style={{ animationDelay: ".24s" }}>
        <Aksi onClick={() => nav("/booking")}>Booking meja</Aksi>
        <Aksi2 onClick={() => nav("/booking?tipe=vip")}>VIP &amp; VVIP</Aksi2>
      </div>
      <p className="naik mt-3 text-[13px] text-cream/80" style={{ animationDelay: ".3s" }}>
        {buka
          ? <><strong className="font-semibold text-amber">{kosong} meja</strong> kosong dari {mejaBiliar.length} meja biliar</>
          : <><strong className="font-semibold text-amber">Tutup sekarang.</strong> Buka pukul 11.00, booking untuk nanti tetap bisa</>}
      </p>
    </Isi>,

    <Isi key="tarif">
      <LabelSandi teks="Tarif" className="text-amber" />
      <h2 className="mt-2 font-serif text-[2.1rem] font-bold leading-[1.04] text-cream sm:text-[3rem]">Harga per jam.</h2>
      <ul className="mt-4 rounded-2xl bg-ink/70 px-4">
        {TARIF.map((t, i) => (
          <li key={t.nama} className={`flex items-center justify-between gap-4 py-3 ${i ? "border-t border-cream/10" : ""}`}>
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold text-cream">{t.nama}</div>
              <div className="text-[12px] text-cream/65">{t.ket}</div>
            </div>
            <span className="shrink-0 font-display text-[1.45rem] leading-none tabular-nums text-amber">{rupiah(t.harga)}</span>
          </li>
        ))}
      </ul>
    </Isi>,

    ...paket.map((p) => {
      const hemat = p.hours * R.regularDay - p.price;
      return (
        <Isi key={p.id}>
          <LabelSandi teks="Promo siang" className="text-amber" />
          <h2 className="mt-2 font-serif text-[2.4rem] font-bold leading-[1.02] text-cream sm:text-[3.4rem]">{p.name}</h2>
          <p className="mt-2 font-display text-[2.6rem] leading-none tabular-nums text-amber">{rupiah(p.price)}</p>
          <p className="mt-3 rounded-2xl bg-ink/70 p-4 text-[14px] leading-relaxed text-cream/85">
            Termasuk {p.hours} jam main biliar
            {p.freeDrinks ? ` dan ${p.freeDrinks} minuman` : ""}
            {p.freeDrinks && minumanPaket.length ? ` dari kategori ${minumanPaket.join(" atau ")}` : ""}.
            {hemat > 0 && <> Hemat {rupiah(hemat)} dari harga lepasan.</>}
            {" "}Sesi dimulai paling lambat {fmtHour(p.lastStartHour)} WIB.
          </p>
        </Isi>
      );
    }),

    <Isi key="cara">
      <LabelSandi teks="Cara booking" className="text-amber" />
      <h2 className="mt-2 font-serif text-[2.1rem] font-bold leading-[1.04] text-cream sm:text-[3rem]">Empat langkah, tanpa chat.</h2>
      <ol className="mt-4 space-y-2.5 rounded-2xl bg-ink/70 p-4">
        {LANGKAH.map(([t, d], i) => (
          <li key={t} className="flex items-center gap-3">
            <Ball n={i + 1} size={34} color={WARNA_BOLA[i]} />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-cream">{t}</div>
              <div className="text-[12px] text-cream/70">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4"><Aksi lebar onClick={() => nav("/booking")}>Booking meja sekarang</Aksi></div>
    </Isi>,

    ...SUASANA.map(([f, teks]) => (
      <Isi key={f} lebar="max-w-2xl">
        <Bingkai src={fotoVenue(f)} alt={teks} rasio="aspect-[3/2]" className="w-full" />
        <h2 className="mt-4 font-serif text-[2rem] font-bold leading-[1.05] text-cream sm:text-[2.8rem]">{teks}</h2>
      </Isi>
    )),

    <Isi key="acara" lebar="max-w-2xl">
      <Bingkai src={fotoVenue("bl-159")} alt="Aula SPL penuh orang saat turnamen biliar" rasio="aspect-[3/2]" className="max-h-[28svh] w-full" />
      <LabelSandi teks="Acara" className="mt-4 block text-amber" />
      <h2 className="mt-1 font-serif text-[2rem] font-bold leading-[1.04] text-cream sm:text-[2.8rem]">Turnamen atau gathering, rombonganmu muat.</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-cream/80">
        {mejaBiliar.length} meja biliar dan {ruangVip} ruang tertutup. Kasih tahu tanggalnya dan berapa orang.
      </p>
      <div className="mt-4"><Aksi href={wa(PESAN_ACARA)}>Atur acara</Aksi></div>
    </Isi>,
  ];

  const id = ["awal", "tarif", ...paket.map(() => undefined), undefined, "suasana", undefined, undefined, "acara"];

  return (
    <>
      <BilahVenue tema="sport" aksi="Booking" keAksi="/booking" />
      <Perjalanan tema="sport" gelap="#07140e" fotoAwal={FOTO_SPORT} id={id} bab={bab} ekor={
        <>
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-5">
              <LabelSandi teks="Tanya jawab" className="text-amber" />
              <Judul baris={["Sebelum kamu", "booking."]} className="mt-3 text-[2.3rem] sm:text-[3.4rem]" />
            </div>
            <Muncul i={1} className="lg:col-span-7"><TanyaJawab daftar={TANYA} /></Muncul>
          </div>
          <PenutupVenue tema="sport" />
        </>
      } />
    </>
  );
}
