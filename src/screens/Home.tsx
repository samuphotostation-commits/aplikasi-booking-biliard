/**
 * SPL SPORT — halaman venue biliar (`/sport`).
 *
 * Hanya membahas biliar: tarif, cara booking, suasana, acara, dan lokasi.
 * Bola 8 menggelinding mengikuti scroll di hero, lalu masuk lubang saat bagian
 * berikutnya naik.
 *
 * Halaman ini menandai venue tamu `spl`, supaya pesanan yang dibuat dari sini
 * masuk rekap SPL. Pasangannya ada di Smokehouse.tsx.
 *
 * Semua angka dibaca dari data venue yang berlaku, bukan ditulis di berkas ini.
 */
import { useEffect, useMemo, useRef } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform, useMotionValueEvent } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Ball } from "../components/motion/Billiard";
import {
  Adegan, Bola3D, GaleriGeser, GarisMaju, Judul, LabelSandi, Muncul, TEPI_NAIK, useGerakPenuh,
} from "../components/motion/Adegan";
import { Aksi, Aksi2, BilahVenue, PenutupVenue, TanyaJawab, wa } from "../components/BagianVenue";
import { FOTO_SPORT, fotoVenue } from "../data/fotoVenue";
import { fmtHour } from "../data/venue";
import {
  CLOSE_IDX, OPEN_IDX, classOf, hourIdx, mejaDijual, namaMinumanPaket, paketAktif, useAdmin,
} from "../lib/adminStore";
import { tableFreeForRange } from "../lib/occupancy";
import { rupiah } from "../lib/core";
import { setVenueTamu } from "../lib/venueAktif";

const SUASANA = ["bl-036", "bl-153", "bl-167", "bl-147", "bl-119", "bl-138"]
  .map((n) => ({ src: fotoVenue(n), alt: "Suasana SPL Sport" }))
  .filter((f) => f.src);

const LANGKAH = [
  ["Pilih tanggal & jam", "Lihat meja mana yang masih kosong secara langsung."],
  ["Pilih meja", "Reguler atau VIP Room, sesuai jumlah orang."],
  ["Bayar QRIS", "Slot terkunci begitu pembayaran masuk. Dapat kode check-in."],
  ["Check-in ke petugas", "Waktu mulai dihitung saat lampu mejamu dinyalakan."],
];
const WARNA_BOLA = ["#F0A202", "#992212", "#1F6F4A", "#0B0B0C"];

const PESAN_ACARA = "Halo SPL Sport, saya mau atur acara. Tanggal: ... Jumlah orang: ...";

export default function Home() {
  const nav = useNavigate();
  useEffect(() => { setVenueTamu("spl"); }, []);
  const { a: venue } = useAdmin();
  const R = venue.rates;

  const nowTs = Date.now();
  const mejaBiliar = useMemo(
    () => mejaDijual(venue).filter((t) => classOf(venue, t.id) !== "resto"), [venue]);
  const ruangVip = mejaBiliar.filter((t) => t.type === "vip" || t.type === "vvip").length;
  // Meja yang benar-benar bisa dipakai sekarang, dari sesi nyata.
  const kosong = mejaBiliar.filter((t) =>
    tableFreeForRange(venue.sessions, t.id, nowTs, nowTs + 60_000, undefined, nowTs)).length;
  const jam = hourIdx(nowTs);
  const buka = jam >= OPEN_IDX && jam < CLOSE_IDX;

  // Kalau pemilik mematikan paket di panel, bloknya hilang dengan sendirinya.
  const paket = paketAktif(venue).filter((p) => (p.venue ?? "spl") === "spl" && p.hours > 0).slice(0, 1);
  const minumanPaket = useMemo(() => namaMinumanPaket(venue), [venue]);

  const TARIF = [
    { nama: "Reguler siang", ket: "11.00 sampai 18.00", harga: R.regularDay },
    { nama: "Reguler malam", ket: "18.00 sampai tutup", harga: R.regularNight },
    { nama: "VIP Room", ket: "ruang tertutup, bebas asap rokok", harga: R.vip },
    { nama: "VVIP Room", ket: "ruang tertutup, boleh merokok", harga: R.vvip },
  ];

  const TANYA = [
    { t: "Harus bayar di muka?", j: "Iya, lewat QRIS waktu booking. Begitu bayarnya masuk, mejanya terkunci atas namamu dan tidak bisa diambil orang lain." },
    { t: "Hitungan jamnya mulai dari kapan?", j: "Dari saat kamu duduk dan kasir menyalakan lampu mejanya, bukan dari jam yang kamu pilih. Datang telat sedikit tidak memotong waktu mainmu." },
    { t: "Kalau mainnya lewat jam 18.00?", j: `Dihitung per jam dengan dua tarif: ${rupiah(R.regularDay)}/jam sebelum 18.00 dan ${rupiah(R.regularNight)}/jam sesudahnya. Rinciannya muncul sebelum kamu bayar.` },
    { t: "Bedanya VIP dan VVIP?", j: `Dua-duanya ruang tertutup. VIP ${rupiah(R.vip)}/jam, bebas asap rokok. VVIP ${rupiah(R.vvip)}/jam, merokok diperbolehkan.` },
    { t: "Bisa pesan makanan sambil main?", j: "Bisa. Menunya dipesan dari HP dari meja mana pun, dan pesanannya diantar ke mejamu." },
  ];

  return (
    <div className="bg-ink pb-16 md:pb-0">
      <GarisMaju warna="bg-amber" />
      <BilahVenue tema="sport" aksi="Booking" keAksi="/booking" />

      <Hero buka={buka} kosong={kosong} total={mejaBiliar.length}
        onBooking={() => nav("/booking")} onVip={() => nav("/booking?tipe=vip")} />

      <Adegan id="tarif" urut={1} className={`${TEPI_NAIK} bg-ink`}>
        <div className="mx-auto grid w-full max-w-6xl items-start gap-10 px-5 py-16 sm:py-24 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-6">
            <LabelSandi teks="Tarif" className="text-amber" />
            <Judul baris={["Pilih waktu main", "dan meja yang kamu mau."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
            <Muncul>
              <ul className="mt-7 divide-y divide-line border-y border-line">
                {TARIF.map((t) => (
                  <li key={t.nama} className="flex items-baseline justify-between gap-5 py-3.5">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold text-cream">{t.nama}</div>
                      <div className="text-[12px] text-mute">{t.ket}</div>
                    </div>
                    <div className="shrink-0 whitespace-nowrap">
                      <span className="font-display text-xl tabular-nums text-amber">{rupiah(t.harga)}</span>
                      <span className="ml-1 text-[11px] text-dim">/jam</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] leading-relaxed text-mute">
                Main melewati pukul 18.00? Jam sebelum 18.00 ikut tarif siang, sesudahnya tarif malam.
                Rinciannya ditampilkan sebelum kamu membayar.
              </p>
            </Muncul>

            {paket.map((p) => {
              const lepasan = p.hours * R.regularDay;
              const hemat = lepasan - p.price;
              return (
                <Muncul key={p.id} i={1}>
                  <div className="mt-6 rounded-2xl border border-amber/40 bg-amber/[0.07] p-5">
                    <span className="font-display text-[11px] uppercase tracking-[0.18em] text-amber">
                      Sesi dimulai paling lambat {fmtHour(p.lastStartHour)} WIB
                    </span>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
                      <h3 className="font-serif text-[1.5rem] font-bold leading-tight text-cream">{p.name}</h3>
                      <span className="whitespace-nowrap font-display text-[1.75rem] tabular-nums text-amber">{rupiah(p.price)}</span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">
                      Termasuk {p.hours} jam main biliar
                      {p.freeDrinks ? ` dan ${p.freeDrinks} minuman` : ""}
                      {p.freeDrinks && minumanPaket.length ? ` dari kategori ${minumanPaket.join(" atau ")}` : ""}.
                      {hemat > 0 && <> Hemat <span className="font-semibold text-cream">{rupiah(hemat)}</span> dari harga lepasan.</>}
                    </p>
                  </div>
                </Muncul>
              );
            })}
          </div>

          <Muncul i={1} className="lg:col-span-6">
            <figure className="overflow-hidden rounded-2xl border border-line">
              <img src={fotoVenue("bl-187")} width={800} height={1200} loading="lazy"
                alt="Pemain membidik di salah satu meja SPL Sport"
                className="aspect-[4/3] w-full object-cover sm:aspect-[4/5]" />
              <figcaption className="border-t border-line bg-ink-2 px-4 py-3 text-[12px] text-dim">
                {mejaBiliar.length - ruangVip} meja reguler dan {ruangVip} ruang VIP &amp; VVIP
              </figcaption>
            </figure>
          </Muncul>
        </div>
      </Adegan>

      <Adegan urut={2} className={`${TEPI_NAIK} felt-tex`}>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
          <LabelSandi teks="Cara booking" className="text-amber" />
          <Judul baris={["Empat langkah,", "tanpa chat."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
          <ol className="mt-9 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {LANGKAH.map(([t, d], i) => (
              <Muncul key={t} i={i}>
                <li className="list-none">
                  <Ball n={i + 1} size={46} color={WARNA_BOLA[i]} />
                  <div className="mt-3 text-[15px] font-semibold text-cream">{t}</div>
                  <div className="mt-1 text-[13px] leading-snug text-cream/70">{d}</div>
                </li>
              </Muncul>
            ))}
          </ol>
          <div className="mt-10 flex flex-col gap-2.5 sm:flex-row">
            <Aksi onClick={() => nav("/booking")}>Booking meja sekarang</Aksi>
            <Aksi2 onClick={() => nav("/menu?ambil=1")}>Pesan tanpa meja</Aksi2>
          </div>
        </div>
      </Adegan>

      <div id="suasana" />
      <GaleriGeser urut={3} foto={SUASANA}
        kepala={<>
          <LabelSandi teks="Suasana" className="text-amber" />
          <Judul baris={["Di dalam SPL Sport."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
        </>} />

      <Adegan id="acara" urut={4} className={TEPI_NAIK}>
        <div className="relative isolate overflow-hidden rounded-[inherit]">
          <img src={fotoVenue("bl-159")} alt="Aula SPL penuh orang saat turnamen biliar" loading="lazy"
            className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 via-45% to-transparent" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/85 via-ink/35 via-52% to-transparent" />
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-28">
            <div className="max-w-2xl">
              <LabelSandi teks="Acara" className="text-amber" />
              <Judul baris={["Turnamen atau gathering,", "rombonganmu muat."]} className="mt-3 text-[2.1rem] sm:text-[2.9rem]" />
              <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-cream/85">
                Turnamen biliar, gathering kantor, atau nobar. Kasih tahu tanggalnya dan berapa orang,
                meja dan ruangnya kami siapkan.
              </p>
              <ul className="mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-line/60 pt-5">
                {([[String(mejaBiliar.length), "meja biliar"], [String(ruangVip), "ruang tertutup"]] as const).map(([b, k]) => (
                  <li key={k} className="flex items-baseline gap-2">
                    <span className="font-display text-lg tabular-nums text-amber">{b}</span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-mute">{k}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7"><Aksi href={wa(PESAN_ACARA)}>Atur acara</Aksi></div>
            </div>
          </div>
        </div>
      </Adegan>

      <Adegan urut={5} className={`${TEPI_NAIK} bg-ink`}>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <LabelSandi teks="Tanya jawab" className="text-amber" />
            <Judul baris={["Sebelum kamu", "booking."]} className="mt-3 text-[2.1rem] sm:text-[2.7rem]" />
          </div>
          <Muncul i={1} className="lg:col-span-7"><TanyaJawab daftar={TANYA} /></Muncul>
        </div>
      </Adegan>

      <PenutupVenue tema="sport" urut={6} />
    </div>
  );
}

/** Hero yang tertahan selama digulir, supaya bola sempat menggelinding ke lubang. */
function Hero({ buka, kosong, total, onBooking, onVip }: {
  buka: boolean; kosong: number; total: number; onBooking: () => void; onVip: () => void;
}) {
  const penuh = useGerakPenuh();
  const jalur = useRef<HTMLElement>(null);
  const { scrollYProgress: p } = useScroll({ target: jalur, offset: ["start start", "end end"] });
  const halus = useSpring(p, { stiffness: 110, damping: 28, mass: 0.35 });

  const fotoSkala = useTransform(halus, [0, 1], [1, 1.14]);
  const gelap = useTransform(halus, [0, 0.8], [0, 0.6]);
  const teksY = useTransform(halus, [0, 0.55], [0, -90]);
  const teksO = useTransform(halus, [0.15, 0.55], [1, 0]);
  const bolaX = useTransform(halus, [0, 1], ["0vw", "-42vw"]);
  const bolaY = useTransform(halus, [0, 0.8, 1], ["0vh", "34vh", "46vh"]);
  const bolaS = useTransform(halus, [0, 0.8, 1], [1, 0.72, 0.1]);
  const bolaO = useTransform(halus, [0.9, 1], [1, 0]);

  const putar = useMotionValue(0);
  useMotionValueEvent(halus, "change", (x) => putar.set(x * -16));

  return (
    <section ref={jalur} className={`relative ${penuh ? "h-[210svh]" : ""}`} style={{ zIndex: 0 }}>
      <div className="sticky top-0 h-svh overflow-hidden bg-ink">
        <motion.img src={FOTO_SPORT} alt="Aula biliar SPL Sport" fetchPriority="high" style={{ scale: fotoSkala }}
          className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-ink/30" />
        <motion.div aria-hidden className="absolute inset-0 bg-[#0b2a1d]" style={{ opacity: gelap }} />

        <motion.div aria-hidden style={{ x: bolaX, y: bolaY, scale: bolaS, opacity: bolaO }}
          className="absolute right-[6%] top-[13%] z-10 h-[46vmin] w-[46vmin] max-h-[420px] max-w-[420px] sm:right-[9%] sm:top-[16%]">
          <Bola3D putar={putar} cadangan={<Ball n={8} size={280} color="#0B0B0C" />} />
        </motion.div>

        <motion.div style={{ y: teksY, opacity: teksO }}
          className="absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-6xl px-5 pb-24 sm:pb-16">
          <p className="naik font-display text-[12px] uppercase tracking-[0.22em] text-amber">SPL Sport &middot; Biliar Padang</p>
          <h1 className="mt-3 font-serif text-[2.9rem] font-bold leading-[1] tracking-[-0.015em] text-cream sm:text-[4.5rem]">
            <span className="naik block" style={{ animationDelay: ".08s" }}>Meja siap.</span>
            <span className="naik block" style={{ animationDelay: ".16s" }}>Tinggal kamu datang.</span>
          </h1>
          <p className="naik mt-4 max-w-[44ch] text-[15px] leading-relaxed text-cream/85" style={{ animationDelay: ".24s" }}>
            Pilih meja dan jam dari HP, bayar QRIS, slot langsung terkunci. Tanpa chat, tanpa nunggu balasan.
          </p>
          <div className="naik mt-6 flex flex-col gap-2.5 sm:flex-row" style={{ animationDelay: ".32s" }}>
            <Aksi onClick={onBooking}>Booking meja</Aksi>
            <Aksi2 onClick={onVip}>Reservasi VIP &amp; VVIP</Aksi2>
          </div>
          <p className="naik mt-4 text-[13px] text-cream/80" style={{ animationDelay: ".4s" }}>
            {buka
              ? <><strong className="font-semibold text-amber">{kosong} meja</strong> kosong sekarang, dari {total} meja biliar</>
              : <><strong className="font-semibold text-amber">Tutup sekarang.</strong> Buka pukul 11.00, booking untuk nanti tetap bisa</>}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
