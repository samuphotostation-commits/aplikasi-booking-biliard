/**
 * SPL SPORT — halaman venue biliar (`/sport`).
 *
 * Satu perjalanan: bola 8 datang dari gerbang, menggelinding melewati tiap bab, lalu
 * hilang di bab terakhir. Foto berganti di balik debu kapur, dan semua angka dibaca
 * dari data venue yang berlaku.
 *
 * Halaman ini menandai venue tamu `spl`, supaya pesanan dari sini masuk rekap SPL.
 */
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Ball } from "../components/motion/Billiard";
import { Judul, LabelSandi, Muncul } from "../components/motion/Adegan";
import { BabTeks, Perjalanan, type Bab } from "../components/motion/Perjalanan";
import { Aksi, Aksi2, BilahVenue, PenutupVenue, TanyaJawab, wa } from "../components/BagianVenue";
import { FOTO_SPORT, fotoVenue } from "../data/fotoVenue";
import { fmtHour } from "../data/venue";
import {
  CLOSE_IDX, OPEN_IDX, classOf, hourIdx, mejaDijual, namaMinumanPaket, paketAktif, useAdmin,
} from "../lib/adminStore";
import { tableFreeForRange } from "../lib/occupancy";
import { rupiah } from "../lib/core";
import { setVenueTamu } from "../lib/venueAktif";

const FELT = "linear-gradient(160deg,#0e3a29,#07140e 70%)";
const GELAP = "#07140e";

/** Sesudah hero bola turun lurus di rel kanan, satu arah sampai masuk lubang. */
const rel = (y: number) => ({
  bola: { x: 93, y, s: 0.14, o: 1 },
  bolaHp: { x: 93, y, s: 0.2, o: 1 },
});

/** Urutannya sama dengan urutan `BabTeks` di bawah. */
const BAB: Bab[] = [
  { foto: FOTO_SPORT, redup: 0.2, bola: { x: 76, y: 36, s: 0.86, o: 1 }, bolaHp: { x: 74, y: 24, s: 0.62, o: 1 } },
  { foto: fotoVenue("bl-187"), redup: 0.78, ...rel(20) },
  { warna: FELT, redup: 0.1, ...rel(32) },
  { foto: fotoVenue("bl-167"), fotoHp: fotoVenue("bl-036"), redup: 0.14, ...rel(44) },
  { foto: fotoVenue("bl-147"), fotoHp: fotoVenue("bl-153"), redup: 0.14, ...rel(54) },
  { foto: fotoVenue("bl-119"), fotoHp: fotoVenue("bl-188"), redup: 0.14, ...rel(64) },
  { foto: fotoVenue("bl-159"), redup: 0.46, ...rel(72) },
  { warna: GELAP, redup: 0, ...rel(80) },
  { warna: GELAP, redup: 0, bola: { x: 93, y: 86, s: 0.01, o: 0 }, bolaHp: { x: 93, y: 86, s: 0.01, o: 0 } },
];

const SUASANA = ["Malam di aula utama.", "Fokus di satu pukulan.", "Datang berdua atau rame-rame."];

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
    <Perjalanan tema="sport" bab={BAB}>
      <BilahVenue tema="sport" aksi="Booking" keAksi="/booking" />

      <BabTeks tinggi="min-h-[140svh]">
        <div className="mx-auto flex h-svh w-full max-w-6xl flex-col justify-end px-5 pb-24 sm:pb-14">
          <p className="naik font-display text-[12px] uppercase tracking-[0.22em] text-amber">SPL Sport &middot; Biliar Padang</p>
          <h1 className="mt-3 font-serif text-[3rem] font-bold leading-[.98] tracking-[-0.018em] text-cream sm:text-[5rem]">
            <span className="naik block" style={{ animationDelay: ".08s" }}>Meja siap.</span>
            <span className="naik block" style={{ animationDelay: ".16s" }}>Tinggal kamu datang.</span>
          </h1>
          <p className="naik mt-4 max-w-[44ch] text-[15px] leading-relaxed text-cream/85" style={{ animationDelay: ".24s" }}>
            Pilih meja dan jam dari HP, bayar QRIS, slot langsung terkunci. Tanpa chat, tanpa nunggu balasan.
          </p>
          <div className="naik mt-6 flex flex-col gap-2.5 sm:flex-row" style={{ animationDelay: ".32s" }}>
            <Aksi onClick={() => nav("/booking")}>Booking meja</Aksi>
            <Aksi2 onClick={() => nav("/booking?tipe=vip")}>Reservasi VIP &amp; VVIP</Aksi2>
          </div>
          <p className="naik mt-4 text-[13px] text-cream/80" style={{ animationDelay: ".4s" }}>
            {buka
              ? <><strong className="font-semibold text-amber">{kosong} meja</strong> kosong sekarang, dari {mejaBiliar.length} meja biliar</>
              : <><strong className="font-semibold text-amber">Tutup sekarang.</strong> Buka pukul 11.00, booking untuk nanti tetap bisa</>}
          </p>
        </div>
      </BabTeks>

      <BabTeks id="tarif" tinggi="min-h-[135svh]" className="items-center">
        <div className="mx-auto w-full max-w-6xl px-5 py-24">
          <div className="max-w-xl">
            <LabelSandi teks="Tarif" className="text-amber" />
            <Judul baris={["Pilih waktu main", "dan meja yang kamu mau."]} className="mt-3 text-[2.3rem] sm:text-[3.4rem]" />
            <Muncul>
              <ul className="mt-9">
                {TARIF.map((t) => (
                  <li key={t.nama} className="flex items-end justify-between gap-5 border-b border-cream/15 py-4">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold text-cream">{t.nama}</div>
                      <div className="text-[12.5px] text-cream/65">{t.ket}</div>
                    </div>
                    <div className="shrink-0 whitespace-nowrap">
                      <span className="font-display text-[1.7rem] leading-none tabular-nums text-amber">{rupiah(t.harga)}</span>
                      <span className="ml-1 text-[11px] text-cream/60">/jam</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] leading-relaxed text-cream/65">
                Main melewati pukul 18.00? Jam sebelum 18.00 ikut tarif siang, sesudahnya tarif malam.
                Rinciannya ditampilkan sebelum kamu membayar.
              </p>
            </Muncul>
            {paket.map((p) => {
              const hemat = p.hours * R.regularDay - p.price;
              return (
                <Muncul key={p.id} i={1}>
                  <div className="mt-8 border-l-2 border-amber pl-5">
                    <span className="font-display text-[11px] uppercase tracking-[0.18em] text-amber">
                      Sesi dimulai paling lambat {fmtHour(p.lastStartHour)} WIB
                    </span>
                    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-5">
                      <h3 className="font-serif text-[1.6rem] font-bold leading-tight text-cream">{p.name}</h3>
                      <span className="whitespace-nowrap font-display text-[1.7rem] tabular-nums text-amber">{rupiah(p.price)}</span>
                    </div>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-cream/70">
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
        </div>
      </BabTeks>

      <BabTeks tinggi="min-h-[125svh]" className="items-center">
        <div className="mx-auto w-full max-w-6xl px-5 py-24">
          <LabelSandi teks="Cara booking" className="text-amber" />
          <Judul baris={["Empat langkah,", "tanpa chat."]} className="mt-3 text-[2.3rem] sm:text-[3.4rem]" />
          <ol className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            {LANGKAH.map(([t, d], i) => (
              <Muncul key={t} i={i}>
                <li className="list-none">
                  <Ball n={i + 1} size={46} color={WARNA_BOLA[i]} />
                  <div className="mt-3 text-[15px] font-semibold text-cream">{t}</div>
                  <div className="mt-1 text-[13px] leading-snug text-cream/75">{d}</div>
                </li>
              </Muncul>
            ))}
          </ol>
          <div className="mt-10 flex flex-col gap-2.5 sm:flex-row">
            <Aksi onClick={() => nav("/booking")}>Booking meja sekarang</Aksi>
            <Aksi2 onClick={() => nav("/menu?ambil=1")}>Pesan tanpa meja</Aksi2>
          </div>
        </div>
      </BabTeks>

      {SUASANA.map((teks, i) => (
        <BabTeks key={teks} id={i === 0 ? "suasana" : undefined} tinggi="min-h-[120svh]" className="items-end">
          <div className="mx-auto w-full max-w-6xl px-5 pb-[22svh]">
            {i === 0 && <LabelSandi teks="Suasana" className="text-amber" />}
            <Judul baris={[teks]} className="mt-2 text-[2.2rem] [text-shadow:0_2px_24px_rgba(0,0,0,.6)] sm:text-[3.6rem]" />
          </div>
        </BabTeks>
      ))}

      <BabTeks id="acara" tinggi="min-h-[125svh]" className="items-center">
        <div className="mx-auto w-full max-w-6xl px-5 py-24">
          <div className="max-w-2xl">
            <LabelSandi teks="Acara" className="text-amber" />
            <Judul baris={["Turnamen atau gathering,", "rombonganmu muat."]} className="mt-3 text-[2.3rem] sm:text-[3.4rem]" />
            <Muncul>
              <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-cream/85">
                Turnamen biliar, gathering kantor, atau nobar. Kasih tahu tanggalnya dan berapa orang,
                meja dan ruangnya kami siapkan.
              </p>
              <ul className="mt-7 flex flex-wrap gap-x-8 gap-y-3">
                {([[String(mejaBiliar.length), "meja biliar"], [String(ruangVip), "ruang tertutup"]] as const).map(([b, k]) => (
                  <li key={k} className="flex items-baseline gap-2">
                    <span className="font-display text-2xl tabular-nums text-amber">{b}</span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-cream/70">{k}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7"><Aksi href={wa(PESAN_ACARA)}>Atur acara</Aksi></div>
            </Muncul>
          </div>
        </div>
      </BabTeks>

      <BabTeks tinggi="min-h-[110svh]" className="items-center">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-24 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <LabelSandi teks="Tanya jawab" className="text-amber" />
            <Judul baris={["Sebelum kamu", "booking."]} className="mt-3 text-[2.3rem] sm:text-[3.4rem]" />
          </div>
          <Muncul i={1} className="lg:col-span-7"><TanyaJawab daftar={TANYA} /></Muncul>
        </div>
      </BabTeks>

      <PenutupVenue tema="sport" />
    </Perjalanan>
  );
}
