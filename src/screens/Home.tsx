import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Mark } from "../components/UI";
import { AmbientBalls, Ball, RollingDivider } from "../components/motion/Billiard";
import { TABLES, TABLE_COUNT, PAKET_SIANG, VENUE } from "../data/venue";
import { useAdmin, hourIdx, OPEN_IDX, CLOSE_IDX, classOf } from "../lib/adminStore";
import { tableFreeForRange } from "../lib/occupancy";
import { rupiah } from "../lib/core";

// Diimpor lewat glob supaya Vite yang mengurus URL-nya — ini juga yang membuat
// build satu-berkas bisa menanam fotonya sebagai data URI tanpa tambalan regex.
const PHOTO_MAP = import.meta.glob("../assets/foto/*.webp", {
  eager: true, query: "?url", import: "default",
}) as Record<string, string>;

const PHOTOS = ["bl-147", "bl-167", "bl-138", "bl-176", "bl-119", "bl-159"]
  .map((n) => ({ n, url: PHOTO_MAP[`../assets/foto/${n}.webp`] }))
  .filter((p) => p.url);

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.06 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Home() {
  const nav = useNavigate();
  const { a: venue } = useAdmin();
  const RATES = venue.rates; // tarif terkini dari panel admin, bukan angka tertanam
  // Meja yang benar-benar bisa dipakai SEKARANG — dari sesi nyata, termasuk
  // booking yang segera mulai dan jeda bersih-bersih.
  const nowTs = Date.now();
  // Meja resto TIDAK ikut dihitung: kalimat di sebelahnya bilang "dari 34 meja
  // biliar", jadi kalau resto ikut, angkanya bisa lebih besar dari totalnya
  // sendiri ("46 meja kosong dari 34 meja biliar"). Kelasnya diambil dari
  // pengaturan pemilik, sama seperti layar booking.
  const freeNow = TABLES.filter((t) =>
    classOf(venue, t.id) !== "resto" &&
    tableFreeForRange(venue.sessions, t.id, nowTs, nowTs + 60_000, undefined, nowTs)).length;
  // Di luar jam buka (02.00–11.00) semua meja tampak "kosong" padahal venue tutup.
  const jamSekarang = hourIdx(nowTs);
  const tutup = jamSekarang < OPEN_IDX || jamSekarang >= CLOSE_IDX;

  return (
    <div className="pb-28">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative grain overflow-hidden brick-tex">
        <div className="absolute inset-0 bg-gradient-to-b from-ink/55 via-ink/70 to-ink" />
        <AmbientBalls />
        <div className="safe-t relative mx-auto max-w-lg px-5 pb-10 pt-8">
          <motion.div
            className="flex items-center gap-2 text-amber"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
          >
            <Mark size={34} />
            <div className="leading-none">
              <div className="font-display text-lg tracking-[0.22em]">SPL</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-cream/70">
                Sports Pool Lounge
              </div>
            </div>
          </motion.div>

          <motion.h1
            className="mt-8 font-display text-[2.7rem] uppercase leading-[0.95] tracking-[0.01em] text-cream"
            variants={fade} initial="hidden" animate="show" custom={0}
          >
            Meja siap.<br />
            <span className="text-amber">Tinggal kamu</span><br />yang datang.
          </motion.h1>

          <motion.p
            className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-cream/80"
            variants={fade} initial="hidden" animate="show" custom={1}
          >
            Booking meja biliar dan pesan makanan Smokehouse sekaligus. Bayar QRIS,
            slot langsung terkunci — tanpa chat, tanpa nunggu balasan.
          </motion.p>

          <motion.div
            className="mt-6 flex flex-col gap-2.5"
            variants={fade} initial="hidden" animate="show" custom={2}
          >
            <Button full onClick={() => nav("/booking")}>Booking Meja Sekarang</Button>
            <Button full variant="brick" onClick={() => nav("/booking?tipe=vip")}>Reservasi VIP &amp; VVIP Room</Button>
            <Button full variant="ghost" onClick={() => nav("/resto")}>Reservasi Meja Resto</Button>
            <Button full variant="ghost" onClick={() => nav("/menu")}>Lihat Menu Smokehouse</Button>
          </motion.div>

          {/* Status langsung */}
          <motion.div
            className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-ink-2/80 px-4 py-3 backdrop-blur"
            variants={fade} initial="hidden" animate="show" custom={3}
          >
            <span className="relative flex h-2.5 w-2.5">
              <motion.span
                className="absolute inline-flex h-full w-full rounded-full bg-emerald-400"
                animate={{ scale: [1, 2.1, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <p className="text-sm text-cream/85">
              {tutup ? (
                <>
                  <strong className="font-semibold text-amber">Tutup sekarang</strong>
                  <span className="text-dim"> · buka pukul 11.00, booking untuk nanti tetap bisa</span>
                </>
              ) : (
                <>
                  <strong className="font-semibold text-amber">{freeNow} meja</strong> kosong sekarang
                  <span className="text-dim"> · dari {TABLE_COUNT.regular + TABLE_COUNT.vip + TABLE_COUNT.vvip} meja biliar</span>
                </>
              )}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Tarif ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-lg px-5 pt-8">
        <div className="font-script text-2xl leading-none text-amber">Billiard</div>
        <h2 className="font-display text-2xl uppercase tracking-[0.06em] text-cream">Pricelist</h2>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <RateCard label="Siang" time="11.00 – 18.00" price={RATES.regularDay} n={1} c="#F0A202" />
          <RateCard label="Malam" time="18.00 – Tutup" price={RATES.regularNight} n={8} c="#0B0B0C" />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <RateCard label="VIP · no smoking" time="Sepanjang jam" price={RATES.vip} n={9} c="#F0A202" />
          <RateCard label="VVIP · bebas rokok" time="Sepanjang jam" price={RATES.vvip} n={3} c="#992212" />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Card className="relative overflow-hidden p-3.5">
            <div className="absolute -right-3 -top-3 opacity-20">
              <Ball n={2} size={54} color="#1F6F4A" />
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-dim">Promo</div>
            <div className="font-script text-xl leading-tight text-amber">Paket Siang</div>
            <div className="mt-1 font-serif text-xl font-bold text-cream">
              {rupiah(PAKET_SIANG.price)}
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {PAKET_SIANG.perks.map((p) => (
                <li key={p} className="text-[11px] leading-snug text-cream/70">• {p}</li>
              ))}
              <li className="text-[11px] leading-snug text-dim">• Mulai s/d 16.00 WIB</li>
            </ul>
          </Card>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-dim">
          Sesi yang melewati pukul 18.00 dihitung per jam — jam sebelum 18.00 memakai tarif
          siang, sesudahnya tarif malam. Rinciannya muncul sebelum kamu bayar.
        </p>
      </section>

      <RollingDivider />

      {/* ── Foto venue ───────────────────────────────────────── */}
      <section className="mx-auto max-w-lg">
        <div className="px-5">
          <div className="font-script text-2xl leading-none text-amber">Suasana</div>
          <h2 className="font-display text-2xl uppercase tracking-[0.06em] text-cream">
            Di Dalam SPL
          </h2>
        </div>
        <div className="no-bar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
          {PHOTOS.map((p, i) => (
            <motion.figure
              key={p.n}
              className="relative h-52 w-[74%] shrink-0 snap-center overflow-hidden rounded-2xl border border-line"
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.04 }}
            >
              <img
                src={p.url} alt="Suasana SPL Sports Pool Lounge"
                loading="lazy" className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
            </motion.figure>
          ))}
        </div>
      </section>

      {/* ── Cara pesan ───────────────────────────────────────── */}
      <section className="mx-auto mt-8 max-w-lg px-5">
        <div className="font-script text-2xl leading-none text-amber">Gampang</div>
        <h2 className="font-display text-2xl uppercase tracking-[0.06em] text-cream">Cara Pesan</h2>
        <ol className="mt-4 space-y-3">
          {[
            ["Pilih tanggal & jam", "Lihat meja mana yang masih kosong secara langsung."],
            ["Pilih meja", "Reguler atau VIP Room, sesuai jumlah orang."],
            ["Tambah makanan", "Opsional — pesan Smokehouse sekalian, satu tagihan."],
            ["Bayar QRIS", "Slot terkunci begitu pembayaran masuk. Dapat kode check-in."],
          ].map(([t, d], i) => (
            <motion.li
              key={t} className="flex gap-3"
              initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.4 }}
            >
              <Ball n={i + 1} size={30} color={["#F0A202", "#992212", "#1F6F4A", "#0B0B0C"][i]} />
              <div className="flex-1 pt-0.5">
                <div className="text-sm font-semibold text-cream">{t}</div>
                <div className="text-[13px] leading-snug text-dim">{d}</div>
              </div>
            </motion.li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto mt-10 max-w-lg px-5 text-center">
        <Mark size={40} />
        <p className="mt-2 font-script text-xl text-amber">Sports Pool Lounge</p>
        <p className="text-xs text-dim">&amp; Smokehouse Resto</p>
        <a
          href={VENUE.ig} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-mute underline underline-offset-4"
        >
          @sportspoollounge
        </a>
        {!import.meta.env.VITE_MODE_TAMU && (
          <div className="mt-6 border-t border-line pt-4">
            <Link to="/admin" className="text-[11px] text-dim underline underline-offset-4">
              Masuk panel staf
            </Link>
          </div>
        )}
      </footer>
    </div>
  );
}

function RateCard({
  label, time, price, n, c,
}: { label: string; time: string; price: number; n: number; c: string }) {
  return (
    <Card className="relative overflow-hidden p-3.5">
      <div className="absolute -right-3 -top-3 opacity-20">
        <Ball n={n} size={54} color={c} />
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-dim">{label}</div>
      <div className="text-[11px] text-cream/60">{time}</div>
      <div className="mt-2 font-serif text-2xl font-bold text-amber">{rupiah(price)}</div>
      <div className="text-[11px] text-dim">per jam</div>
    </Card>
  );
}
