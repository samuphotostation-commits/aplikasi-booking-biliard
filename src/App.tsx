import { AnimatePresence, motion } from "framer-motion";
import { Route, Routes, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { BottomNav } from "./components/UI";
import { BreakIntro, useIntroSeen } from "./components/motion/Billiard";
import { StoreProvider } from "./lib/store";
import { AdminProvider } from "./lib/adminStore";

/** Build khusus HP pelanggan: panel staf tidak ikut dibangun. */
const MODE_TAMU = !!import.meta.env.VITE_MODE_TAMU;
/**
 * SATU-SATUNYA LAYAR YANG IKUT MUATAN PERTAMA.
 *
 * Sisanya diminta saat alamatnya dibuka. Dulu semuanya `import` biasa, dan
 * hasilnya satu berkas 891 KB: orang yang membuka halaman depan dari tautan
 * Instagram ikut mengunduh papan kasir, laporan stok, jejak transaksi, dan
 * panel pengaturan — seluruh aplikasi kasir — sebelum satu huruf pun muncul
 * di layarnya.
 *
 * PENJAGA `{!MODE_TAMU && <Route …>}` DI BAWAH TIDAK MENOLONG SOAL INI, dan
 * itu yang paling mudah disalahpahami di berkas ini. Penjaga itu memutuskan
 * apa yang DIRENDER, bukan apa yang DIBUNDEL; selama berkasnya di-`import`
 * di puncak, pemaket tetap menyalin seluruh panel staf ke dalam bundel build
 * tamu. Yang benar-benar memotongnya adalah `import()` di bawah ini.
 *
 * Landing sengaja tetap statis: ia rute `/`, jadi me-lazy-kannya cuma
 * menambah satu perjalanan bolak-balik sebelum layar pertama.
 */
import Landing from "./screens/Landing";

const Home = lazy(() => import("./screens/Home"));
const Smokehouse = lazy(() => import("./screens/Smokehouse"));
const ReservasiResto = lazy(() => import("./screens/ReservasiResto"));
const BukuMenu = lazy(() => import("./screens/BukuMenu"));
const TampilTamu = lazy(() => import("./screens/TampilTamu"));
const Booking = lazy(() => import("./screens/Booking"));
const MenuScreen = lazy(() => import("./screens/MenuScreen"));
const Checkout = lazy(() => import("./screens/Checkout"));
const Payment = lazy(() => import("./screens/Payment"));
const Success = lazy(() => import("./screens/Success"));
const Orders = lazy(() => import("./screens/Orders"));
const Akun = lazy(() => import("./screens/Akun"));
const AdminShell = lazy(() => import("./screens/admin/AdminShell"));
const Board = lazy(() => import("./screens/admin/Board"));
const Kasir = lazy(() => import("./screens/admin/Kasir"));
const Kitchen = lazy(() => import("./screens/admin/Kitchen"));
const Gudang = lazy(() => import("./screens/admin/Gudang"));
const MenuAdmin = lazy(() => import("./screens/admin/MenuAdmin"));
const VoidScreen = lazy(() => import("./screens/admin/Void"));
const ShiftScreen = lazy(() => import("./screens/admin/Shift"));
const PromoScreen = lazy(() => import("./screens/admin/Promo"));
const Rekap = lazy(() => import("./screens/admin/Rekap"));
const Jejak = lazy(() => import("./screens/admin/Jejak"));
const Antar = lazy(() => import("./screens/admin/Antar"));
const Pengaturan = lazy(() => import("./screens/admin/Pengaturan"));
const PelangganScreen = lazy(() => import("./screens/admin/Pelanggan"));
const PesanScreen = lazy(() => import("./screens/admin/Pesan"));
const AbsenScreen = lazy(() => import("./screens/admin/Absen"));

/**
 * Jeda antar-layar. Latarnya `bg-ink` supaya perpindahan tidak pernah
 * berkedip putih — di ruangan gelap, satu bingkai putih jauh lebih terasa
 * daripada layar yang diam sesaat.
 */
function Memuat() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink" aria-busy="true">
      <span className="h-2 w-2 animate-ping rounded-full bg-amber" />
      <span className="sr-only">Memuat layar</span>
    </div>
  );
}

/**
 * PERPINDAHAN HALAMAN — sengaja dibikin hampir tak terasa.
 *
 * Dulu: `AnimatePresence mode="wait"` + animasi keluar 0,24 dtk + animasi
 * masuk 0,24 dtk. Artinya setiap kali tamu menekan menu bawah, layar kosong
 * hampir setengah detik sebelum halaman baru muncul — dan karena gulir
 * direset saat alamat berubah, halaman LAMA sempat terlihat melompat ke atas
 * dulu. Di HP itu terbaca seperti aplikasi tersendat.
 *
 * Sekarang halaman lama langsung hilang dan yang baru muncul dengan pudar
 * 0,12 dtk. Hanya `opacity` yang dianimasikan — tanpa geser `y`, supaya
 * peramban tidak perlu menghitung tata letak ulang tiap bingkai.
 */
const page = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.12, ease: "easeOut" as const },
};

function Shell() {
  const loc = useLocation();
  const layarTamu = !MODE_TAMU && loc.pathname.startsWith("/tampil");
  const diLanding = loc.pathname === "/";
  const isAdmin = (!MODE_TAMU && loc.pathname.startsWith("/admin")) || layarTamu || diLanding;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname]);

  return (
    <>
      {/* Tanpa AnimatePresence: halaman lama tidak perlu ditunggu selesai
          menghilang dulu sebelum yang baru boleh tampil. */}
      <motion.main key={isAdmin ? "admin" : loc.pathname} {...page}>
          <Suspense fallback={<Memuat />}>
          <Routes location={loc}>
            {/* Landing utama = master. Tiap venue punya alamatnya sendiri
                supaya tautannya bisa dibagikan langsung ke pelanggan. */}
            <Route path="/" element={<Landing />} />
            <Route path="/sport" element={<Home />} />
            <Route path="/smokehouse" element={<Smokehouse />} />
            {/* Reservasi meja MAKAN — bukan booking biliar. Koreksi pemilik
                12 Okt 2026: yang dipesan di Smokehouse adalah meja restonya. */}
            <Route path="/smokehouse/reservasi" element={<ReservasiResto />} />
            <Route path="/smokehouse/buku-menu" element={<BukuMenu />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/menu" element={<MenuScreen />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/bayar" element={<Payment />} />
            <Route path="/sukses" element={<Success />} />
            <Route path="/akun" element={<Akun />} />
            <Route path="/pesanan" element={<Orders />} />

            {/* Build HP pelanggan tidak memuat panel staf sama sekali. */}
            {/* Layar menghadap tamu: jendela kedua di monitor depan kasir.
                Sengaja di luar AdminShell — tanpa PIN, tanpa menu, tanpa
                satu pun tombol yang bisa mengubah uang. */}
            {!MODE_TAMU && <Route path="/tampil" element={<TampilTamu />} />}
            {!MODE_TAMU && <Route path="/admin" element={<AdminShell />}>
              <Route index element={<Board />} />
              <Route path="kasir" element={<Kasir />} />
              <Route path="dapur" element={<Kitchen />} />
              <Route path="gudang" element={<Gudang />} />
              <Route path="menu" element={<MenuAdmin />} />
              <Route path="void" element={<VoidScreen />} />
              <Route path="shift" element={<ShiftScreen />} />
              <Route path="promo" element={<PromoScreen />} />
              <Route path="pelanggan" element={<PelangganScreen />} />
              <Route path="pesan" element={<PesanScreen />} />
              <Route path="absen" element={<AbsenScreen />} />
              <Route path="rekap" element={<Rekap />} />
              <Route path="jejak" element={<Jejak />} />
              <Route path="antar" element={<Antar />} />
              <Route path="atur" element={<Pengaturan />} />
            </Route>}
          </Routes>
          </Suspense>
      </motion.main>
      {!isAdmin && <BottomNav />}
    </>
  );
}

export default function App() {
  const { seen, markSeen } = useIntroSeen();
  // App berada di dalam Router (main.tsx). Di build online rute ada di hash,
  // jadi window.location.pathname tidak bisa dipakai.
  // Intro juga dilewati di layar menghadap tamu: monitor itu menyala
  // semalaman dan tidak boleh memutar animasi pembuka tiap dimuat ulang.
  const jalur = useLocation().pathname;
  const isAdmin = jalur.startsWith("/admin") || jalur.startsWith("/tampil");

  return (
    <AdminProvider>
      <StoreProvider>
        <AnimatePresence>
          {!seen && !isAdmin && <BreakIntro onDone={markSeen} />}
        </AnimatePresence>
        <Shell />
      </StoreProvider>
    </AdminProvider>
  );
}
