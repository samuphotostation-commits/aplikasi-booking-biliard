/* ═══════════════════════════════════════════════════════════════════
   PETA IZIN TUJUH PERAN — diagram roadmap 8 Okt 2026

   Berkas ini menuliskan ULANG seluruh peta izin apa adanya, lalu
   membandingkannya dengan `CAN` di `src/data/staff.ts`. Terlihat membosankan,
   dan itu memang maksudnya: peta izin adalah satu-satunya bagian sistem yang
   100 simulasi acak TIDAK BISA menjaga sepenuhnya.

   Simulasi hanya bisa menangkap izin yang TERLALU LUAS (ada peran melakukan
   sesuatu yang seharusnya ditolak — INV-10). Izin yang TERLALU SEMPIT tidak
   pernah ketahuan: kru gudang yang diam-diam kehilangan hak mengelola stok
   akan terlihat seperti "aksinya ditolak", dan ditolak adalah hal yang
   normal terjadi ribuan kali di simulasi. Uji mutasi membuktikannya: mutan
   yang mencabut hak stok kru kitchen & bar LOLOS dari seluruh 100 simulasi.

   Jadi dua arah dijaga di sini: yang boleh WAJIB boleh, yang tidak boleh
   WAJIB ditolak. Kalau pemilik mengubah pembagian tugas, berkas ini yang
   diubah lebih dulu — dan uji yang gagal adalah daftar tempat yang harus
   ikut disesuaikan.
   ═══════════════════════════════════════════════════════════════════ */
import { CAN, can, ROLES, ROLES_SAH, type Permission, type Role } from "../src/data/staff";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

/**
 * Peta yang disetujui pemilik. Superadmin & Manager = All Access, jadi
 * keduanya tidak ditulis per baris — ditegakkan terpisah di bawah.
 */
const PETA: Record<Exclude<Role, "superadmin" | "manager">, Permission[]> = {
  // Keuangan: rekap, tarif, dan stok gudang. TIDAK menyentuh lantai.
  // Finance ikut melihat JEJAK AKTIVITAS: dialah yang mencocokkan kas, dan
  // selisih laci tidak pernah bisa dijelaskan tanpa melihat siapa melakukan apa.
  finance: ["lihatLaporanKeuangan", "lihatRekapPenjualan", "lihatJejak", "ubahTarif", "kelolaStok"],
  // Gudang: hanya stok.
  kru_gudang: ["kelolaStok"],
  // Kasir: meja, kasir, dapur — tanpa akses uang laporan & tanpa diskon.
  // Kru kasir ikut melihat LAPORAN REKAP PENJUALAN — apa yang terjual dan
  // berapa — tapi bukan laporan keuangan (kas shift, pajak, MDR, selisih
  // laci, uang bersih). Permintaan pemilik 19 Okt 2026.
  kru_kasir: ["bukaMeja", "tutupTab", "orderFnb", "koreksiPesanan", "kontrolLampu", "tandaiHabis", "ajukanVoid",
    "lihatRekapPenjualan"],
  // Dapur & bar: tiket + stok gudangnya sendiri.
  kru_kitchen: ["kelolaStok", "tandaiHabis", "ajukanVoid"],
  kru_bar: ["kelolaStok", "tandaiHabis", "ajukanVoid"],
  // Peran lama yang DIPERTAHANKAN supaya jejak staf lama tetap bisa diputar
  // ulang. Haknya sama dengan kru kasir.
  karyawan: ["bukaMeja", "tutupTab", "orderFnb", "koreksiPesanan", "kontrolLampu", "tandaiHabis", "ajukanVoid",
    "lihatRekapPenjualan"],
};

const SEMUA_IZIN = Object.keys(CAN) as Permission[];

console.log("-- Tujuh peran yang DITAWARKAN, plus satu peran lama yang masih SAH --");
// Yang bisa dipilih pemilik saat membuat akun: tepat tujuh.
t("peran yang ditawarkan", [...ROLES].sort(), [
  "finance", "kru_bar", "kru_gudang", "kru_kasir", "kru_kitchen", "manager", "superadmin",
].sort());
// `karyawan` SENGAJA tidak ditawarkan lagi, tapi tetap sah: jejak venue
// menyimpan peran di dalam kejadiannya, jadi membuangnya membuat riwayat staf
// lama tidak bisa diputar ulang.
t("karyawan tidak ditawarkan lagi", ROLES.includes("karyawan" as Role), false);
t("tapi karyawan masih sah di jejak lama", (ROLES_SAH as readonly string[]).includes("karyawan"), true);

console.log("\n-- Superadmin & Manager: All Access --");
/*
 * SATU PENGECUALIAN, sengaja ditulis di sini dan bukan dihapus dari ujinya:
 * `bukaKunciJam` (mode demo, buka 24 jam) milik SUPERADMIN SAJA.
 *
 * Itu satu-satunya saklar yang melonggarkan aturan mesin. Manajer yang bisa
 * menyalakannya berarti meja bisa dibuka pukul 08.00 tanpa sepengetahuan
 * pemilik — dan jam buka berhenti berarti apa-apa. Kalau suatu hari ada izin
 * kedua yang masuk daftar ini, itu keputusan yang harus diambil sadar-sadar.
 */
const HANYA_SUPERADMIN: Permission[] = ["bukaKunciJam"];
t("superadmin punya semua izin", SEMUA_IZIN.filter((p) => !can("superadmin", p)), []);
t("manager punya semua izin KECUALI yang khusus pemilik",
  SEMUA_IZIN.filter((p) => !can("manager", p)), HANYA_SUPERADMIN);
t("dan yang khusus pemilik memang dipegang superadmin",
  HANYA_SUPERADMIN.filter((p) => !can("superadmin", p)), []);

console.log("\n-- Peran lain: dua arah, boleh DAN tidak boleh --");
for (const [peran, boleh] of Object.entries(PETA) as [Role, Permission[]][]) {
  // Arah 1 — yang boleh WAJIB boleh. Inilah arah yang tidak pernah dijaga
  // simulasi: hak yang dicabut diam-diam cuma terlihat seperti penolakan biasa.
  const hilang = boleh.filter((p) => !can(peran, p));
  t(`${peran}: tidak ada hak yang hilang`, hilang, []);
  // Arah 2 — yang tidak terdaftar WAJIB ditolak.
  const lebih = SEMUA_IZIN.filter((p) => !boleh.includes(p) && can(peran, p));
  t(`${peran}: tidak ada hak berlebih`, lebih, []);
}

console.log("\n-- Pagar yang mudah terlewat saat peta diubah --");
// Uang & pengaturan: tidak boleh bocor ke lantai maupun gudang.
for (const p of ["lihatLaporanKeuangan", "beriDiskonManual", "setujuiVoid", "kelolaPromo",
  "kelolaMeja", "kelolaKaryawan", "koreksiWaktu"] as Permission[]) {
  const lantai = (["kru_kasir", "kru_kitchen", "kru_bar", "kru_gudang", "karyawan"] as Role[])
    .filter((r) => can(r, p));
  t(`${p} tidak dipegang kru lantai/gudang`, lantai, []);
}
// Diskon manual & compliment (SMH-11b) berbagi satu izin — keduanya memotong
// uang yang sudah ditagih, jadi keduanya setinggi manajer.
t("beriDiskonManual hanya superadmin & manager",
  (ROLES_SAH as readonly Role[]).filter((r) => can(r, "beriDiskonManual")), ["superadmin", "manager"]);
// Finance mengatur harga tapi TIDAK boleh menyentuh meja & tab.
t("finance tidak bisa membuka meja", can("finance", "bukaMeja"), false);
t("finance tidak bisa menutup tab", can("finance", "tutupTab"), false);
// Kru gudang tidak boleh ikut melayani lantai.
t("kru gudang tidak bisa membuka meja", can("kru_gudang", "bukaMeja"), false);
t("kru gudang tidak bisa order F&B", can("kru_gudang", "orderFnb"), false);
// Dapur & bar WAJIB bisa mengelola stok gudangnya sendiri.
t("kru kitchen boleh kelola stok", can("kru_kitchen", "kelolaStok"), true);
t("kru bar boleh kelola stok", can("kru_bar", "kelolaStok"), true);
// Tanpa peran (belum masuk) tidak boleh apa pun.
t("tanpa peran: nol izin", SEMUA_IZIN.filter((p) => can(null, p)), []);


// Laporan REKAP PENJUALAN dan laporan KEUANGAN adalah dua hak yang berbeda:
// kasir boleh tahu apa yang terjual, tidak boleh tahu kas shift & pajak.
t("kru kasir melihat rekap penjualan", can("kru_kasir", "lihatRekapPenjualan"), true);
t("tapi TIDAK melihat laporan keuangan", can("kru_kasir", "lihatLaporanKeuangan"), false);
t("kru gudang tidak melihat rekap penjualan", can("kru_gudang", "lihatRekapPenjualan"), false);
t("kru kitchen tidak melihat rekap penjualan", can("kru_kitchen", "lihatRekapPenjualan"), false);

console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
