import { AnimatePresence, motion } from "framer-motion";
import { Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { BottomNav } from "./components/UI";
import { BreakIntro, useIntroSeen } from "./components/motion/Billiard";
import { StoreProvider } from "./lib/store";
import { AdminProvider } from "./lib/adminStore";

/** Build khusus HP pelanggan: panel staf tidak ikut dibangun. */
const MODE_TAMU = !!import.meta.env.VITE_MODE_TAMU;
import Home from "./screens/Home";
import Booking from "./screens/Booking";
import MenuScreen from "./screens/MenuScreen";
import Checkout from "./screens/Checkout";
import Payment from "./screens/Payment";
import Success from "./screens/Success";
import Orders from "./screens/Orders";
import RestoReservasi from "./screens/RestoReservasi";
import Akun from "./screens/Akun";
import AdminShell from "./screens/admin/AdminShell";
import Board from "./screens/admin/Board";
import Kasir from "./screens/admin/Kasir";
import Kitchen from "./screens/admin/Kitchen";
import MenuAdmin from "./screens/admin/MenuAdmin";
import VoidScreen from "./screens/admin/Void";
import ShiftScreen from "./screens/admin/Shift";
import PromoScreen from "./screens/admin/Promo";
import Rekap from "./screens/admin/Rekap";
import Pengaturan from "./screens/admin/Pengaturan";
import PelangganScreen from "./screens/admin/Pelanggan";
import PesanScreen from "./screens/admin/Pesan";
import AbsenScreen from "./screens/admin/Absen";

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
  const isAdmin = !MODE_TAMU && loc.pathname.startsWith("/admin");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname]);

  return (
    <>
      {/* Tanpa AnimatePresence: halaman lama tidak perlu ditunggu selesai
          menghilang dulu sebelum yang baru boleh tampil. */}
      <motion.main key={isAdmin ? "admin" : loc.pathname} {...page}>
          <Routes location={loc}>
            <Route path="/" element={<Home />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/menu" element={<MenuScreen />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/bayar" element={<Payment />} />
            <Route path="/sukses" element={<Success />} />
            <Route path="/resto" element={<RestoReservasi />} />
            <Route path="/akun" element={<Akun />} />
            <Route path="/pesanan" element={<Orders />} />

            {/* Build HP pelanggan tidak memuat panel staf sama sekali. */}
            {!MODE_TAMU && <Route path="/admin" element={<AdminShell />}>
              <Route index element={<Board />} />
              <Route path="kasir" element={<Kasir />} />
              <Route path="dapur" element={<Kitchen />} />
              <Route path="menu" element={<MenuAdmin />} />
              <Route path="void" element={<VoidScreen />} />
              <Route path="shift" element={<ShiftScreen />} />
              <Route path="promo" element={<PromoScreen />} />
              <Route path="pelanggan" element={<PelangganScreen />} />
              <Route path="pesan" element={<PesanScreen />} />
              <Route path="absen" element={<AbsenScreen />} />
              <Route path="rekap" element={<Rekap />} />
              <Route path="atur" element={<Pengaturan />} />
            </Route>}
          </Routes>
      </motion.main>
      {!isAdmin && <BottomNav />}
    </>
  );
}

export default function App() {
  const { seen, markSeen } = useIntroSeen();
  // App berada di dalam Router (main.tsx). Di build online rute ada di hash,
  // jadi window.location.pathname tidak bisa dipakai.
  const isAdmin = useLocation().pathname.startsWith("/admin");

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
