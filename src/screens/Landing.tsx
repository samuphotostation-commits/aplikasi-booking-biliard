/**
 * LANDING SPL — halaman jualan, bukan halaman keterangan.
 *
 * Koreksi pemilik 25 Okt 2026: *"tampilan landing page ini menurut saya masih
 * berantakan dan masih jelek sekali"*, dengan sebuah foto acuan: halaman resto
 * bertema gelap, foto hidangan besar di kepala halaman, lalu baris kartu
 * berfoto, daftar harga, blok dua kolom, dan kaki halaman berkolom.
 *
 * EMPAT HAL YANG SALAH DI VERSI SEBELUMNYA, dan perbaikannya:
 *
 * 1. FONT JUDULNYA KELIRU, dan ini biang "berantakan"-nya. Semua judul memakai
 *    Emoland (`font-display`) — font angka kondensasi yang oleh
 *    `docs/lampiran/L7-design-system.md` §7.4.1 **dilarang untuk kalimat**.
 *    Satu halaman penuh kalimat kapital kondensasi terbaca sempit dan
 *    berteriak. Sekarang judul memakai Lido STF (`font-serif`), persis seperti
 *    yang ditulis skala tipografi §7.4.3 untuk `--t-display-1`/`--t-h1`;
 *    Emoland tinggal di tempatnya: ANGKA dan label kapital pendek.
 *
 * 2. FOTONYA DIPAKAI SEBAGAI LATAR, bukan sebagai barang. Foto venue
 *    digelapkan sampai 80% lalu ditulisi — hasilnya bukan foto, melainkan
 *    bidang coklat berisik. Sekarang fotonya berdiri sendiri di dalam
 *    bingkai, kontras penuh, dan kedalaman datang dari dua foto yang saling
 *    menumpang, bukan dari lapisan gelap.
 *
 * 3. SEMUANYA KARTU, DAN SEMUANYA DI TENGAH. Satu radius, satu border, satu
 *    isian, dari tarif sampai lowongan kerja — jadi tidak ada yang terbaca
 *    lebih penting dari yang lain. Sekarang tiap bagian memakai bentuk yang
 *    berbeda: tumpukan foto, pita angka, daftar tarif bergaris rambut, korsel,
 *    pita foto lebar penuh, kolom bergaris, lalu kaki halaman berkolom.
 *
 * 4. TIDAK ADA NAVIGASI. Halaman sepanjang ini tanpa kepala tetap berarti
 *    orang harus menggulir balik ke atas untuk memesan. Sekarang ada bilah
 *    atas yang menempel.
 *
 * YANG TETAP DIJAGA, sama seperti versi sebelumnya:
 *
 * - TIDAK ADA ANGKA KARANGAN. Tarif, jumlah meja, jumlah kategori, dan isi
 *   paket dibaca dari data venue yang berlaku. Halaman ini tidak akan pernah
 *   menjanjikan harga yang berbeda dari yang ditagih kasir.
 * - SEMUA TUJUAN TOMBOL TIDAK BERUBAH. Yang berubah rupanya, bukan ke mana
 *   perginya.
 * - WARNA AKSI SELALU AMBER DENGAN TEKS NEAR-BLACK (`DS-02`). Maroon kembali
 *   jadi warna WILAYAH Smokehouse — di versi lama ia sempat dipakai sebagai
 *   warna tombol, dan itu mengajarkan pelanggan dua warna untuk satu
 *   kebiasaan.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  useAdmin, hourIdx, OPEN_IDX, CLOSE_IDX, mejaDijual, kategoriJual, paketAktif,
} from "../lib/adminStore";
import { rupiah } from "../lib/core";
import { SmokeMark } from "../components/Smoke";
import Coverflow from "../components/Coverflow";
import { kartuKategori } from "../lib/kartuMenu";
import { Mark } from "../components/UI";
import { FOTO_HERO_SMH } from "../data/fotoMenu";
import {
  VENUE, WA_VENUE, WA_VENUE_TAMPIL, fmtHour, OPEN_HOUR, CLOSE_HOUR,
} from "../data/venue";

const PHOTO = import.meta.glob("../assets/foto/*.webp", {
  eager: true, query: "?url", import: "default",
}) as Record<string, string>;
const foto = (n: string) => PHOTO[`../assets/foto/${n}.webp`];

/** Foto yang dipakai, dipilih per peran — bukan diacak dari folder. */
const F_TARIF = foto("bl-187");  // tegak: pemain mid-shot, tingginya mengimbangi daftar tarif
const SUASANA = ["bl-036", "bl-153", "bl-167", "bl-147", "bl-119", "bl-138"]
  .map(foto).filter(Boolean) as string[];

/**
 * PANGGUNG HERO — urutannya disengaja, bukan diacak.
 *
 * YANG PERTAMA AULA BILIAR, dan ini koreksi dari urutan sebelumnya.
 *
 * Dulu yang pertama foto hidangan, dengan alasan "meja penuh makanan
 * menjawab 'tempat apa ini' lebih cepat daripada aula biliar". Alasan itu
 * benar untuk resto, dan salah untuk halaman ini — karena tombol besar tepat
 * di bawah foto itu berbunyi BOOKING MEJA. Di layar HP yang pertama terlihat
 * jadi piring nasi di atas tombol booking biliar, dan pembacanya harus
 * bekerja menyambungkan keduanya.
 *
 * Foto hero adalah janji; tombol hero adalah penagihannya. Keduanya harus
 * menunjuk barang yang sama. Hidangan tetap diceritakan — di nomor dua,
 * dan di seksi Smokehouse yang memang miliknya.
 *
 * Catatan kedua: pergantiannya 7 detik sekali, jadi foto nomor dua dan tiga
 * hanya dilihat pengunjung yang bertahan. Alasan tambahan kenapa nomor satu
 * harus yang paling menjelaskan.
 */
const PANGGUNG = [foto("bl-190"), FOTO_HERO_SMH, foto("bl-176")]
  .filter(Boolean) as string[];

/**
 * JAM TUTUP DALAM BAHASA ORANG, bukan format jam dinding.
 *
 * Dipakai di judul hero, dan karena itu harus DIHITUNG, tidak ditulis.
 * Judul sebelumnya berbunyi "Main sampai pagi" sementara pita angka tepat di
 * bawahnya berbunyi 11.00–02.00; kalimat pertama halaman ini dibantah oleh
 * datanya sendiri dalam jarak seratus piksel. Sekarang keduanya membaca
 * sumber yang sama, jadi mengubah jam tutup di satu tempat tidak bisa lagi
 * membuat judulnya berbohong.
 */
function jamBicara(j: number) {
  if (j === 24) return "tengah malam";
  // Spasi tanpa-putus: di layar sempit judulnya sempat patah jadi
  // "Main sampai jam 2" / "pagi." — satu kata yatim di barisnya sendiri.
  return j > 24 ? `jam ${j - 24} pagi` : `jam ${j}`;
}
const TUTUP_BICARA = jamBicara(CLOSE_HOUR);

/** Alamat dari buku menu resmi Smokehouse Resto. */
const ALAMAT = "Jl. Batang Anai No. 2, Rimbo Kaluang, Padang Barat, Kota Padang, Sumatera Barat";
const PETA = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("SPL Sports Pool Lounge " + ALAMAT)}`;

const wa = (pesan: string) => `https://wa.me/${WA_VENUE}?text=${encodeURIComponent(pesan)}`;

const KERJASAMA = [
  {
    label: "Event",
    judul: "Acara kamu, tempat kami",
    isi: "Ulang tahun, gathering kantor, nobar, atau turnamen biliar. Kasih tahu tanggal dan berapa orang, meja dan dapurnya kami siapkan.",
    cta: "Atur acara",
    pesan: "Halo SPL, saya mau atur acara di SPL & Smokehouse. Tanggal: ... Jumlah orang: ...",
  },
  {
    label: "Career",
    judul: "Betah kerja malam?",
    isi: "Tim kami isinya kasir, kru lantai, kru dapur, kru bar, dan kru gudang. Kirim posisi yang kamu incar dan pengalamanmu.",
    cta: "Kirim lamaran",
    pesan: "Halo SPL, saya mau melamar kerja. Posisi: ... Pengalaman: ... Domisili: ...",
  },
  {
    label: "Partnership",
    judul: "Mari tumbuh bareng",
    isi: "Supplier bahan dan minuman, sponsor turnamen, komunitas biliar, atau kolaborasi brand. Ceritakan bentuk kerja samanya.",
    cta: "Ajukan kerja sama",
    pesan: "Halo SPL, saya mau menawarkan kerja sama. Bentuknya: ...",
  },
] as const;

/* ══ Potongan kecil yang dipakai berulang ══════════════════════════ */

/**
 * Muncul saat tergulir ke layar.
 *
 * `useReducedMotion` dihormati di sini karena pagar CSS di `index.css` hanya
 * mematikan animasi CSS — gerakan yang digerakkan JS lolos dari pagar itu.
 * Yang dimatikan cuma perpindahan posisinya; kemunculannya tetap, supaya
 * urutan bacanya tidak hilang.
 */
function Muncul({ i = 0, className = "", anak }: { i?: number; className?: string; anak: ReactNode }) {
  const diam = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: diam ? 0 : 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {anak}
    </motion.div>
  );
}

/**
 * PANGGUNG FOTO HERO — foto berganti pelan, ikut mengembang pelan, dan
 * bergeser lebih lambat daripada halaman saat digulir.
 *
 * HANYA SATU FOTO YANG IKUT MUATAN PERTAMA. Sisanya baru diminta sesudah
 * lukisan pertama selesai: anggaran gambar muat-pertama 180 KB (L7 §7.5.2
 * `AST-01`), dan pergantian fotonya sendiri baru terjadi tujuh detik
 * kemudian — tidak ada gunanya mengunduh ketiganya sekaligus dan membuat
 * layar pertama datang terlambat di jaringan venue.
 *
 * Wadahnya sengaja LEBIH TINGGI dari layarnya (`-inset-y-[14%]`). Geseran
 * paralaksnya menarik foto ke bawah; tanpa kelebihan tinggi itu, tepi atas
 * foto akan meninggalkan pita kosong begitu halaman digulir sedikit.
 */
function PanggungFoto() {
  const diam = useReducedMotion();
  const [siap, setSiap] = useState<string[]>(() => PANGGUNG.slice(0, 1));
  const [kini, setKini] = useState(0);
  const { scrollY } = useScroll();
  const geser = useTransform(scrollY, [0, 760], [0, 90]);

  /**
   * Foto kedua dan ketiga diminta SESUDAH halaman selesai memuat, bukan 1,4
   * detik sesudah layar pertama dilukis.
   *
   * Penghitung waktu tidak tahu apa pun tentang jaringan: ia tetap berdering
   * walau huruf dan kode untuk layar pertama masih mengantre. Di jaringan
   * venue itu berarti dua foto besar ikut berebut jalur dengan berkas yang
   * justru sedang ditunggu mata. Peristiwa `load` menunggu antrean itu
   * kosong dulu.
   */
  useEffect(() => {
    if (PANGGUNG.length < 2) return;
    let t: ReturnType<typeof setTimeout>;
    const mulai = () => { t = setTimeout(() => setSiap(PANGGUNG), 600); };
    if (document.readyState === "complete") mulai();
    else window.addEventListener("load", mulai, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("load", mulai);
    };
  }, []);

  useEffect(() => {
    if (diam || siap.length < 2) return;
    const t = setInterval(() => setKini((n) => (n + 1) % siap.length), 7_000);
    return () => clearInterval(t);
  }, [diam, siap.length]);

  return (
    <motion.div aria-hidden style={{ y: diam ? 0 : geser }}
      className="absolute -inset-y-[14%] left-0 right-0 -z-10 overflow-hidden bg-ink">
      {siap.map((src, n) => (
        <img key={src} src={src} alt="" decoding="async"
          // Foto pertama ADALAH layar pertama: ia pantas mendahului antrean.
          // Dua sisanya diminta belakangan dan tidak boleh menyerobot.
          fetchPriority={n === 0 ? "high" : "low"}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity
            duration-[1200ms] ease-out ${n === kini ? "opacity-100" : "opacity-0"}
            ${diam ? "scale-[1.05]" : "zoom-pelan"}`} />
      ))}
    </motion.div>
  );
}

/**
 * Satu baris hero yang naik saat halaman dibuka.
 *
 * GERAKANNYA CSS, bukan JavaScript, dan itu keputusan — bukan penyederhanaan.
 * Teks hero adalah kalimat terpenting di seluruh situs. Versi pertama baris
 * ini memakai pustaka gerakan, dan hasilnya layar sambutan berdiri KOSONG
 * beberapa detik tiap kali halaman dibuka di tab yang sedang tidak dilihat:
 * pustakanya menahan teksnya di opasitas nol sampai ia sendiri sempat jalan.
 * Animasi CSS berjalan sejak lukisan pertama dan tidak bisa digagalkan oleh
 * apa pun di luar berkas gaya.
 *
 * Dirender sebagai `span` blok, bukan `div`: dua di antaranya tinggal di
 * dalam `<h1>`, dan `<div>` di dalam heading bukan HTML yang sah.
 */
function Masuk({ jeda, children, className = "" }: {
  jeda: number; children: ReactNode; className?: string;
}) {
  return (
    <span className={`naik block ${className}`} style={{ animationDelay: `${jeda}s` }}>
      {children}
    </span>
  );
}

function Seksi({ id, gelap, anak }: { id?: string; gelap?: boolean; anak: ReactNode }) {
  return (
    <section id={id} className={gelap ? "bg-ink-2/50" : ""}>
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-20 lg:py-24">{anak}</div>
    </section>
  );
}

/**
 * Tombol aksi utama. Satu warna aksi di seluruh aplikasi (`DS-02`).
 *
 * `rapat` cuma memangkas isian kiri-kanan, dipakai di bilah bawah HP: dua
 * tombol berdampingan dengan `px-7` tidak muat di layar 360 px. Bentuk dan
 * warnanya tetap satu sumber — menyalin gaya tombolnya ke sana justru cara
 * paling cepat membuat warna aksi bercabang diam-diam.
 */
function Aksi({ onClick, href, anak, lebar, rapat }: {
  onClick?: () => void; href?: string; anak: ReactNode; lebar?: boolean; rapat?: boolean;
}) {
  const kelas = `inline-flex min-h-[52px] items-center justify-center rounded-xl bg-amber
    ${rapat ? "px-3" : "px-7"}
    text-[13.5px] font-bold uppercase tracking-[0.1em] text-ink transition
    hover:bg-amber-deep active:scale-[0.985] ${lebar ? "w-full" : ""}`;
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={kelas}>{anak}</a>
    : <button type="button" onClick={onClick} className={kelas}>{anak}</button>;
}

/** Tombol kedua: garis tipis, bukan maroon. Maroon warna wilayah, bukan aksi. */
function Aksi2({ onClick, href, anak, lebar, rapat }: {
  onClick?: () => void; href?: string; anak: ReactNode; lebar?: boolean; rapat?: boolean;
}) {
  const kelas = `inline-flex min-h-[52px] items-center justify-center rounded-xl border border-line-2
    bg-ink-2 ${rapat ? "px-3" : "px-7"}
    text-[13.5px] font-semibold text-cream transition
    hover:border-amber/60 hover:text-amber active:scale-[0.985] ${lebar ? "w-full" : ""}`;
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={kelas}>{anak}</a>
    : <button type="button" onClick={onClick} className={kelas}>{anak}</button>;
}

/** Tautan kaki halaman — satu bentuk, dipakai untuk rute dalam dan luar. */
function TautanKaki({ ke, href, anak }: { ke?: string; href?: string; anak: ReactNode }) {
  const nav = useNavigate();
  const kelas = "text-left text-[13px] text-mute transition hover:text-amber";
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={kelas}>{anak}</a>
    : <button type="button" onClick={() => nav(ke!)} className={kelas}>{anak}</button>;
}

/* ══ Halaman ═══════════════════════════════════════════════════════ */

export default function Landing() {
  const nav = useNavigate();
  const { a: venue } = useAdmin();
  const [jam, setJam] = useState(() => hourIdx(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setJam(hourIdx(Date.now())), 60_000);
    return () => clearInterval(t);
  }, []);
  const buka = jam >= OPEN_IDX && jam < CLOSE_IDX;

  const R = venue.rates;

  /* Semua angka di halaman ini dibaca dari denah & menu yang BERLAKU, bukan
     dari angka bawaan — meja yang ditambah pemilik lewat Atur ikut terhitung
     di sini tanpa menyentuh berkas ini. */
  const mejaJual = useMemo(() => mejaDijual(venue), [venue]);
  const mejaReguler = mejaJual.filter((t) => t.type === "regular").length;
  const ruangVip = mejaJual.filter((t) => t.type === "vip" || t.type === "vvip").length;
  const mejaBiliar = mejaReguler + ruangVip;
  const mejaResto = mejaJual.filter((t) => t.venue === "smh").length;
  const kategori = useMemo(() => kategoriJual(venue, { staf: false }), [venue]);
  const kartuMenu = useMemo(() => kartuKategori(venue, 6), [venue]);

  /* Paket biliar yang benar-benar aktif di panel admin. Kalau pemilik
     mematikannya, barisnya hilang dari daftar tarif — bukan jadi janji
     yang tidak ditepati kasir. */
  const paket = paketAktif(venue)
    .filter((p) => (p.venue ?? "spl") === "spl" && p.hours > 0)
    .slice(0, 1);

  const FAKTA: [string, string][] = [
    [String(mejaReguler), "meja reguler"],
    [String(ruangVip), "ruang VIP & VVIP"],
    [`${fmtHour(OPEN_HOUR)}–${fmtHour(CLOSE_HOUR)}`, "buka tiap hari"],
    [String(kategori.length), "kategori menu"],
  ];

  const TARIF = [
    { nama: "Reguler siang", ket: `${fmtHour(OPEN_HOUR)} sampai 18.00`, harga: R.regularDay, satuan: "/jam" },
    { nama: "Reguler malam", ket: `18.00 sampai ${fmtHour(CLOSE_HOUR)}`, harga: R.regularNight, satuan: "/jam" },
    { nama: "VIP Room", ket: "ruang tertutup, no smoking", harga: R.vip, satuan: "/jam" },
    { nama: "VVIP Room", ket: "ruang tertutup, bebas rokok", harga: R.vvip, satuan: "/jam" },
  ];

  return (
    // `pb-24` di HP menyediakan tempat untuk bilah aksi bawah, supaya baris
    // terakhir kaki halaman tidak tertutup olehnya.
    <div className="min-h-dvh bg-ink pb-24 md:pb-0">
      {/* ══ BILAH ATAS ════════════════════════════════════════════ */}
      <div className="safe-t sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-2.5">
          <span className="text-amber"><Mark size={26} /></span>
          <span className="font-serif text-[15px] font-bold tracking-[0.1em] text-cream">SPL</span>
          <nav className="ml-auto hidden items-center gap-6 md:flex">
            <button type="button" onClick={() => nav("/sport")}
              className="text-[13px] text-mute transition hover:text-amber">SPL Sport</button>
            <button type="button" onClick={() => nav("/smokehouse")}
              className="text-[13px] text-mute transition hover:text-amber">Smokehouse</button>
            <button type="button" onClick={() => nav("/smokehouse/buku-menu")}
              className="text-[13px] text-mute transition hover:text-amber">Buku menu</button>
          </nav>
          {/* Disembunyikan di HP. Di sana aksinya pindah ke bilah bawah yang
              terjangkau ibu jari; dua tombol booking di satu layar cuma
              menambah keputusan tanpa menambah jalan keluar. */}
          <button type="button" onClick={() => nav("/sport")}
            className="ml-auto hidden min-h-[38px] rounded-lg bg-amber px-4 text-[12px] font-bold uppercase
              tracking-[0.1em] text-ink transition hover:bg-amber-deep md:ml-0 md:block">
            Booking meja
          </button>
        </div>
      </div>

      {/* ══ HERO LAYAR PENUH ══════════════════════════════════════
          Permintaan pemilik 25 Okt 2026: *"bisa dibuat full saja untuk
          welcome screen awal landing page untuk fotonya"* — dan tata
          letaknya diganti, bukan dirapikan.

          Yang sebelumnya: dua kolom, foto di kanan dalam bingkai. Rapi,
          tapi fotonya jadi ILUSTRASI di sebelah teks. Sekarang fotonya
          jadi RUANGANNYA: satu layar penuh, teksnya berdiri di sudut
          bawah-kiri seperti poster.

          TIGA GERAKAN, dan masing-masing ada alasannya:

          1. Foto berganti pelan tiap 7 detik. Satu foto hanya bisa
             menceritakan satu dari dua venue; bergantian menceritakan
             keduanya tanpa memotong layar jadi dua.
          2. Zoom sangat pelan (`zoom-pelan`) supaya bidang sebesar ini
             tidak terbaca sebagai gambar diam yang ditempel.
          3. Foto bergeser lebih lambat dari halaman saat digulir. Beda
             kecepatan inilah yang membuat layar terasa punya kedalaman.

          Semuanya `transform` dan `opacity` saja, jadi tidak ada satu pun
          perhitungan tata letak yang diulang tiap frame. Dan semuanya
          berhenti kalau perangkatnya minta gerakan dikurangi. */}
      <header className="relative isolate flex min-h-[calc(100svh-3.4rem)] flex-col overflow-hidden">
        <PanggungFoto />

        {/* Kegelapan DITARUH DI TEMPAT TEKSNYA, bukan selembar di atas
            seluruh foto: pita dari bawah untuk layar sempit, ditambah
            kolom dari kiri begitu layarnya melebar. Separuh kanan atas
            fotonya tetap utuh kontrasnya. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t
          from-ink via-ink/85 via-42% to-transparent" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r
          from-ink/90 via-ink/55 via-46% to-transparent" />

        {/* Isian tegaknya dirampingkan di HP. Judul hero kini dua baris lebih
            panjang ("Main sampai jam 2 pagi"), dan dengan isian lama layar
            pertama tumbuh melewati tinggi layar — pita angkanya mendarat
            tepat di belakang bilah aksi bawah. Yang dipangkas isian hero,
            bukan ukuran hurufnya: judul adalah kalimat terpenting di situs
            ini, dan mengecilkannya untuk memenangkan 30 piksel adalah
            pertukaran yang salah arah. */}
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-5 pb-6 pt-20
          sm:pb-14 sm:pt-24">
          <Masuk jeda={0.05}>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${buka ? "bg-felt" : "bg-dim"}`} aria-hidden />
              <span className="font-display text-[11px] uppercase tracking-[0.18em] text-amber">
                {buka ? `Buka sampai ${fmtHour(CLOSE_HOUR)}` : `Buka lagi ${fmtHour(OPEN_HOUR)}`}
              </span>
            </div>
          </Masuk>

          {/* Satu-satunya Jazzbury di layar ini (L7 §7.4.1). */}
          <Masuk jeda={0.13}>
            <p className="mt-3 font-script text-[2rem] leading-none text-amber sm:text-[2.6rem]">
              Sports Pool Lounge
            </p>
          </Masuk>

          <h1 className="mt-2 font-serif text-[2.6rem] font-bold leading-[1]
            tracking-[-0.022em] text-cream sm:text-[4rem] lg:text-[4.75rem]">
            <Masuk jeda={0.21}>Main sampai {TUTUP_BICARA}.</Masuk>
            <Masuk jeda={0.29} className="text-amber">Makan sampai kenyang.</Masuk>
          </h1>

          <Masuk jeda={0.39}>
            <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-cream/90 sm:text-base">
              {mejaBiliar} meja biliar, ruang VIP, dan dapur asap Smokehouse di satu tempat
              di Jalan Batang Anai. Pilih jamnya dari HP, bayar QRIS, mejanya terkunci
              atas namamu.
            </p>
          </Masuk>

          <Masuk jeda={0.47}>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
              <Aksi onClick={() => nav("/sport")} anak="Booking meja" />
              <Aksi2 onClick={() => nav("/smokehouse/reservasi")} anak="Reservasi meja resto" />
            </div>
          </Masuk>
        </div>

        {/* ── Pita angka, menempel di kaki layar sambutan ────────────
            Angkanya tetap angka sungguhan; tempatnya saja yang pindah ke
            dalam foto, supaya layar pertama selesai di satu layar. */}
        <div className="relative border-t border-line/70 bg-ink/75 backdrop-blur-sm">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-2.5 px-5 py-3.5
            sm:flex sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-9 sm:py-4">
            {FAKTA.map(([besar, kecil]) => (
              <li key={kecil} className="flex items-baseline gap-2">
                <span className="whitespace-nowrap font-display text-[15px] tabular-nums tracking-[0.02em] text-amber sm:text-lg">
                  {besar}
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-mute">{kecil}</span>
              </li>
            ))}
          </ul>
        </div>
      </header>

      {/* ══ SPL SPORT · DAFTAR TARIF ══════════════════════════════
          Tarifnya daftar bergaris rambut, bukan empat kotak berbingkai.
          Kartu memberi berat yang sama ke semua barisnya; daftar bisa
          dibaca sekali lirik dari atas ke bawah, dan itulah cara orang
          membaca harga. */}
      <Seksi id="sport" anak={
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-14">
          <Muncul className="lg:col-span-6" anak={
            <>
              <div className="flex items-center gap-2 text-amber">
                <Mark size={24} />
                <span className="font-display text-[11px] uppercase tracking-[0.22em]">SPL Sport</span>
              </div>
              <h2 className="mt-4 text-balance font-serif text-[2.1rem] font-bold leading-[1.02]
                tracking-[-0.015em] text-cream sm:text-[2.7rem]">
                Mejanya siap.<br />Tinggal pilih jamnya.
              </h2>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-mute">
                Pilih meja dan jam dari HP, bayar QRIS, slotnya langsung terkunci atas namamu.
                Tanpa chat, tanpa menunggu dibalas. Begitu kamu duduk, lampu mejanya dinyalakan
                kasir, dan hitungan waktunya baru jalan dari situ.
              </p>

              <ul className="mt-7 divide-y divide-line border-y border-line">
                {TARIF.map((t) => (
                  <li key={t.nama} className="flex items-baseline justify-between gap-5 py-3.5">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold text-cream">{t.nama}</div>
                      <div className="text-[12px] text-mute">{t.ket}</div>
                    </div>
                    <div className="shrink-0 whitespace-nowrap">
                      <span className="font-display text-xl tabular-nums text-amber">{rupiah(t.harga)}</span>
                      <span className="ml-1 text-[11px] text-dim">{t.satuan}</span>
                    </div>
                  </li>
                ))}
                {paket.map((p) => (
                  <li key={p.id} className="-mx-3 flex items-baseline justify-between gap-5 bg-amber/5 px-3 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14.5px] font-semibold text-cream">{p.name}</span>
                        <span className="rounded bg-amber px-1.5 py-px font-display text-[10px]
                          uppercase tracking-[0.1em] text-ink">Promo</span>
                      </div>
                      <div className="text-[12px] text-mute">
                        {p.hours} jam main{p.freeDrinks ? ` dan ${p.freeDrinks} minuman` : ""}
                        {` · mulai sampai ${fmtHour(p.lastStartHour)}`}
                      </div>
                    </div>
                    <div className="shrink-0 whitespace-nowrap">
                      <span className="font-display text-xl tabular-nums text-amber">{rupiah(p.price)}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-[12px] leading-relaxed text-mute">
                Sesi yang melewati pukul 18.00 dihitung per jam dengan dua tarif. Rinciannya
                muncul sebelum kamu bayar.
              </p>

              <div className="mt-7">
                <Aksi onClick={() => nav("/sport")} anak="Booking meja" />
              </div>
            </>
          } />

          {F_TARIF && (
            <Muncul i={1} className="lg:col-span-6" anak={
              <figure className="overflow-hidden rounded-2xl border border-line">
                <img src={F_TARIF} width={800} height={1200} loading="lazy"
                  alt="Pemain membidik di salah satu meja SPL Sport"
                  className="aspect-[4/3] w-full object-cover sm:aspect-[4/5]" />
                <figcaption className="border-t border-line bg-ink-2 px-4 py-3 text-[12px] text-dim">
                  {mejaReguler} meja reguler dan {ruangVip} ruang VIP, semuanya satu lokasi
                </figcaption>
              </figure>
            } />
          )}
        </div>
      } />

      {/* ══ SMOKEHOUSE ════════════════════════════════════════════
          Korsel 3D hidangan (bentuknya diminta pemilik 13 Okt 2026).
          Fotonya foto produk venue sendiri; jumlah pilihan dan harga
          mulainya dibaca dari data menu yang berlaku. */}
      <Seksi gelap anak={
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <Muncul className="lg:col-span-6" anak={
            <Coverflow
              kartu={kartuMenu}
              label="Dari dapur Smokehouse"
              onPilih={(k) => nav(`/menu?kategori=${k.id}`)}
            />
          } />

          <Muncul i={1} className="lg:col-span-6" anak={
            <>
              {/* Lockup wilayah Smokehouse (`DS-01`): maroon jadi LATARNYA, bukan
                  warna hurufnya. Maroon #992212 sebagai teks 11 px cuma 2,73:1
                  di atas near-black; sebagai latar dengan teks cream ia 8,10
                  (AAA) — dan itu memang bentuk yang ditulis `DS-05`. */}
              <div className="inline-flex items-center gap-2 rounded-full bg-brick px-3.5 py-1.5 text-cream">
                <SmokeMark size={20} />
                <span className="font-display text-[11px] uppercase tracking-[0.18em]">
                  Smokehouse Resto
                </span>
              </div>
              <h2 className="mt-4 text-balance font-serif text-[2.1rem] font-bold leading-[1.02]
                tracking-[-0.015em] text-cream sm:text-[2.7rem]">
                Iga asap yang<br />bikin balik lagi.
              </h2>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-mute">
                Dibakar pelan dan diasap dengan rempah, disajikan dengan pilihan saus Western
                atau sambal Nusantara. Ada juga nasi goreng, cemilan buat nemenin main, kopi,
                dan mocktail sampai tengah malam.
              </p>

              <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
                <li className="flex gap-3 text-[13.5px] text-mute">
                  <span className="font-display text-[13px] tabular-nums text-amber">{mejaResto}</span>
                  meja makan, reservasi gratis dan tanpa hitungan jam
                </li>
                <li className="flex gap-3 text-[13.5px] text-mute">
                  <span className="font-display text-[13px] tabular-nums text-amber">{kategori.length}</span>
                  kategori menu, bisa dipesan dari HP dan diantar ke mejamu
                </li>
                <li className="flex gap-3 text-[13.5px] text-mute">
                  <span className="font-display text-[13px] tabular-nums text-amber">3&ndash;4</span>
                  orang kenyang dari satu Family Package iga bakar
                </li>
              </ul>

              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                <Aksi onClick={() => nav("/smokehouse/buku-menu")} anak="Lihat buku menu" />
                <Aksi2 onClick={() => nav("/smokehouse/reservasi")} anak="Reservasi meja resto" />
              </div>
            </>
          } />
        </div>
      } />

      {/* ══ SUASANA ═══════════════════════════════════════════════
          Pita foto lebar penuh dengan TINGGI SAMA dan lebar mengikuti
          rasio aslinya. Foto tegak dan mendatar jadi berselang-seling
          sendiri, tepi atas-bawahnya tetap lurus, dan tidak ada satu
          petak kosong pun — kesalahan yang dibuat mozaik sebelumnya. */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-5 pt-14 sm:pt-20 lg:pt-24">
          <Muncul anak={
            // Baris "Foto venue sendiri, bukan foto contoh" dibuang. Tidak ada
            // tamu yang pernah curiga fotonya stok; kalimat itu menanamkan
            // kecurigaan yang tadinya tidak ada, lalu membantahnya sendiri.
            <h2 className="text-balance font-serif text-[1.9rem] font-bold leading-tight
              tracking-[-0.015em] text-cream sm:text-[2.4rem]">
              Malam biasa di SPL.
            </h2>
          } />
        </div>
        <Muncul i={1} anak={
          <div className="no-bar mt-7 flex snap-x gap-2.5 overflow-x-auto px-5 pb-2 sm:gap-3.5">
            {SUASANA.map((src, i) => (
              <figure key={src}
                className="h-48 shrink-0 snap-start overflow-hidden rounded-xl border border-line sm:h-72 lg:h-80">
                <img src={src} alt={i === 0 ? "Suasana lantai SPL Sport" : ""} loading="lazy"
                  className="h-full w-auto max-w-none object-cover" />
              </figure>
            ))}
          </div>
        } />
      </section>

      {/* ══ KERJA SAMA ════════════════════════════════════════════
          Kolom bergaris, bukan tiga kartu berbingkai. Tiga kartu
          seragam berdampingan adalah bentuk yang paling cepat terbaca
          sebagai halaman buatan mesin. */}
      <Seksi id="kerjasama" anak={
        <>
          <Muncul anak={
            <div className="max-w-2xl">
              <h2 className="text-balance font-serif text-[2.1rem] font-bold leading-[1.02]
                tracking-[-0.015em] text-cream sm:text-[2.7rem]">
                Punya rencana? Kami dengerin.
              </h2>
            </div>
          } />

          <div className="mt-9 grid border-t border-line md:grid-cols-3">
            {KERJASAMA.map((k, i) => (
              <Muncul key={k.label} i={i}
                className="border-b border-line py-7 md:border-b-0 md:border-l md:border-line md:pl-7
                  md:first:border-l-0 md:first:pl-0"
                anak={
                  <>
                    <span className="font-display text-[11px] uppercase tracking-[0.2em] text-amber">
                      {k.label}
                    </span>
                    <h3 className="mt-2.5 font-serif text-[1.4rem] font-bold leading-tight text-cream">
                      {k.judul}
                    </h3>
                    <p className="mt-2.5 max-w-[40ch] text-[13.5px] leading-relaxed text-mute">{k.isi}</p>
                    <a href={wa(k.pesan)} target="_blank" rel="noreferrer"
                      className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 text-[13px]
                        font-bold text-amber transition hover:text-amber-deep">
                      {k.cta} <span aria-hidden>&rarr;</span>
                    </a>
                  </>
                } />
            ))}
          </div>
        </>
      } />

      {/* ══ MAMPIR ════════════════════════════════════════════════ */}
      <Seksi gelap anak={
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
          <Muncul className="lg:col-span-7" anak={
            <>
              <h2 className="text-balance font-serif text-[2.1rem] font-bold leading-[1.02]
                tracking-[-0.015em] text-cream sm:text-[2.7rem]">
                Satu lokasi,<br />dua tempat nongkrong.
              </h2>
              <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-mute">{ALAMAT}</p>
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                <Aksi href={PETA} anak="Buka di peta" />
                <Aksi2 href={wa("Halo SPL, saya mau tanya.")} anak={`WhatsApp ${WA_VENUE_TAMPIL}`} />
              </div>
            </>
          } />

          <Muncul i={1} className="lg:col-span-5" anak={
            <dl className="divide-y divide-line border-y border-line">
              <div className="flex items-baseline justify-between gap-4 py-4">
                <dt className="text-[12px] uppercase tracking-[0.14em] text-dim">Jam buka</dt>
                <dd className="font-display text-lg tabular-nums text-cream">
                  {fmtHour(OPEN_HOUR)}&ndash;{fmtHour(CLOSE_HOUR)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-4">
                <dt className="text-[12px] uppercase tracking-[0.14em] text-dim">Hari</dt>
                <dd className="text-[14px] text-cream">Setiap hari, termasuk akhir pekan</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-4">
                <dt className="text-[12px] uppercase tracking-[0.14em] text-dim">Instagram</dt>
                <dd>
                  <a href={VENUE.ig} target="_blank" rel="noreferrer"
                    className="text-[14px] text-amber transition hover:text-amber-deep">
                    @{VENUE.ig.split("/").filter(Boolean).pop()}
                  </a>
                </dd>
              </div>
            </dl>
          } />
        </div>
      } />

      {/* ══ AJAKAN TERAKHIR ═══════════════════════════════════════
          Penutup yang berhenti, bukan yang memudar jadi kaki halaman.
          Marknya besar di belakang teks sebagai bidang, bukan hiasan. */}
      <section className="grain relative isolate overflow-hidden border-t border-amber/40">
        <div aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2
            -translate-y-1/2 text-amber/[0.06]">
          <Mark size={360} />
        </div>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 text-center sm:py-24">
          <h2 className="text-balance font-serif text-[2.1rem] font-bold leading-[1.02]
            tracking-[-0.015em] text-cream sm:text-[3rem]">
            Malam ini mau main atau makan?
          </h2>
          <p className="mt-3 text-[14.5px] text-mute">Dua-duanya bisa. Pilih pintunya.</p>
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-2.5 sm:flex-row">
            {/* Nama wilayah ("SPL Sport" / "Smokehouse") diganti kata kerja.
                Nama brand di atas tombol memberi tahu pembaca ke mana ia
                pergi, bukan apa yang akan terjadi di sana. */}
            <Aksi lebar onClick={() => nav("/sport")} anak="Booking meja" />
            <Aksi2 lebar onClick={() => nav("/smokehouse")} anak="Lihat Smokehouse" />
          </div>
        </div>
      </section>

      {/* ══ KAKI HALAMAN ══════════════════════════════════════════ */}
      <footer className="border-t border-line bg-ink-2/40">
        <div className="mx-auto grid w-full max-w-6xl gap-9 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-amber"><Mark size={30} /></span>
              <span className="font-serif text-lg font-bold tracking-[0.1em] text-cream">SPL</span>
            </div>
            <p className="mt-3 max-w-[30ch] text-[12.5px] leading-relaxed text-dim">
              Sports Pool Lounge &amp; Smokehouse Resto. {ALAMAT}
            </p>
          </div>

          <nav className="flex flex-col items-start gap-2.5">
            <h3 className="font-display text-[11px] uppercase tracking-[0.2em] text-amber">SPL Sport</h3>
            <TautanKaki ke="/sport" anak="Booking meja" />
            <TautanKaki ke="/sport" anak="Tarif &amp; jam main" />
            <TautanKaki ke="/pesanan" anak="Booking saya" />
          </nav>

          <nav className="flex flex-col items-start gap-2.5">
            <h3 className="font-display text-[11px] uppercase tracking-[0.2em] text-amber">Smokehouse</h3>
            <TautanKaki ke="/smokehouse/buku-menu" anak="Buku menu" />
            <TautanKaki ke="/smokehouse/reservasi" anak="Reservasi meja" />
            <TautanKaki ke="/menu" anak="Pesan sekarang" />
          </nav>

          <nav className="flex flex-col items-start gap-2.5">
            <h3 className="font-display text-[11px] uppercase tracking-[0.2em] text-amber">Hubungi</h3>
            <TautanKaki href={wa("Halo SPL, saya mau tanya.")} anak={`WhatsApp ${WA_VENUE_TAMPIL}`} />
            <TautanKaki href={VENUE.ig} anak="Instagram" />
            <TautanKaki href={PETA} anak="Lihat di peta" />
          </nav>
        </div>

        <div className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2
            px-5 py-4 text-[11px] text-dim">
            <span>SPL Sports Pool Lounge &amp; Smokehouse Resto &middot; Padang</span>
            <span className="tabular-nums">
              Buka {fmtHour(OPEN_HOUR)}&ndash;{fmtHour(CLOSE_HOUR)} setiap hari
            </span>
          </div>
        </div>
      </footer>

      {/* ══ BILAH AKSI BAWAH — HP SAJA ════════════════════════════
          Di bawah 768 px, bilah atas hanya menyisakan logo: tautan SPL Sport,
          Smokehouse, dan Buku menu semuanya `hidden md:flex`. Akibatnya satu-
          satunya cara membuka buku menu dari HP adalah menggulir 4.500 piksel
          sampai kaki halaman — di perangkat yang justru membawa hampir seluruh
          kunjungan.

          Yang dipasang bilah bawah, bukan tombol hamburger. Menu lipat menukar
          tiga tautan dengan satu ketukan tambahan dan satu lapisan yang harus
          ditutup lagi; untuk DUA aksi, harganya tidak sepadan. Bilah bawah
          membuat keduanya selalu ada, selalu di jangkauan ibu jari, tanpa
          menutupi apa pun yang sedang dibaca.

          Dua, bukan empat: booking biliar dan buku menu adalah dua hal yang
          benar-benar dicari orang di halaman ini. Reservasi resto tetap hidup
          lewat tombolnya di hero dan di seksi Smokehouse. */}
      <div className="safe-b fixed inset-x-0 bottom-0 z-40 border-t border-line
        bg-ink/95 backdrop-blur-md md:hidden">
        <div className="flex gap-2.5 px-4 py-2.5">
          <Aksi rapat lebar onClick={() => nav("/sport")} anak="Booking meja" />
          <Aksi2 rapat lebar onClick={() => nav("/smokehouse/buku-menu")} anak="Buku menu" />
        </div>
      </div>
    </div>
  );
}
