/**
 * FOTO MENU SMOKEHOUSE — diambil dari buku menu asli pemilik.
 *
 * Sumbernya `BUKU MENU SPL (6).pdf` (foto profesional milik venue sendiri,
 * bukan stok internet): halaman-halamannya dipotong pada bagian fotonya saja,
 * lalu dikecilkan jadi webp.
 *
 * DUA HAL YANG SENGAJA DILAKUKAN:
 *
 * 1. HARGA TIDAK IKUT DIPOTONG kalau bisa dihindari. Harga yang berlaku
 *    dibaca aplikasi dari panel admin; foto yang mencetak harga berbeda dari
 *    yang ditagih kasir adalah kesalahan yang paling mahal di layar menu.
 * 2. KATEGORI YANG HALAMANNYA CUMA DAFTAR HARGA (nasi goreng, mie, jus,
 *    cold drink) SENGAJA TIDAK DIBERI FOTO. Memakai foto hidangan lain yang
 *    "mirip" lebih buruk daripada tidak ada foto — tamu memesan sesuatu yang
 *    tidak seperti gambarnya. Layarnya menyiapkan tampilan tanpa foto yang
 *    tetap rapi untuk kategori itu.
 *
 * Kalau pemilik mengirim foto per hidangan nanti, cukup tambahkan berkasnya
 * di `src/assets/menu/` dan daftarkan di sini.
 */
const FOTO = import.meta.glob("../assets/menu/*.webp", {
  eager: true, query: "?url", import: "default",
}) as Record<string, string>;

const ambil = (nama: string): string | undefined => FOTO[`../assets/menu/${nama}.webp`];

/**
 * Foto per KATEGORI menu.
 *
 * Sebelas di antaranya DIGANTI 13 Okt 2026 dengan FOTO PRODUK ASLI dari
 * folder "FOTO PRODUK" milik pemilik — foto studio hidangannya sendiri,
 * bukan lagi potongan halaman buku menu. Bedanya besar di layar kecil:
 * potongan buku menu membawa serta teks dan harga cetak yang bisa berbeda
 * dari harga yang ditagih kasir, dan itu kesalahan yang paling mahal di
 * layar menu.
 *
 * Kategori yang tidak ada di sini memang belum ada fotonya.
 */
export const FOTO_KATEGORI: Record<string, string | undefined> = {
  "light-bites": ambil("light-bites"),
  "vegetables": ambil("sayur"),
  "smokehouse-ayam": ambil("ayam"),
  "smokehouse-bebek": ambil("bebek"),
  "smokehouse-buntut": ambil("buntut"),
  "beef-ribs": ambil("beef-ribs"),
  "family": ambil("family"),
  "coffee": ambil("kopi"),
  "ice-blend": ambil("ice-blend"),
  "mocktail": ambil("mocktail"),
  "juice": ambil("juice"),
  "cold-drink": ambil("cold-drink"),
  "tradisional": ambil("tradisional"),
  // TANPA FOTO, dan itu disengaja: fried-rice, fried-noodles, dan
  // smokehouse-daging. Halaman buku menunya cuma daftar harga, dan folder
  // foto produk pemilik belum memuat ketiganya — folder STEAK isinya steak,
  // bukan "Daging Asap Sambal …". Kategorinya tampil sebagai chip maroon
  // yang rapi; memakai foto hidangan lain yang kebetulan mirip membuat tamu
  // memesan sesuatu yang tidak seperti gambarnya.
};

/**
 * Foto sambutan beranda Smokehouse — hidangan venue sendiri, satu meja penuh.
 *
 * Ini satu-satunya foto yang TIDAK lazy-load, jadi ukurannya dijaga di bawah
 * 100 KB (anggaran gambar muat-pertama 180 KB, L7 §7.5.2 `AST-01`).
 */
export const FOTO_HERO_SMH = ambil("hero-smh");

/**
 * Foto PER HIDANGAN. MASIH KOSONG, dan itu keputusan — bukan pekerjaan yang
 * belum selesai.
 *
 * Folder "FOTO PRODUK" tersusun PER KATEGORI, dan nama berkasnya nama kamera
 * (`DSC09570.jpg`), bukan nama hidangan. Di dalam satu folder, delapan varian
 * ayam hanya berbeda sambalnya — tidak ada cara jujur menentukan foto mana
 * milik "Ayam Asap Sambal Pecel" dan mana milik "Ayam Asap Cabe Ijo" tanpa
 * pemiliknya menyebutkan. Menebaknya berarti tamu memesan sesuatu yang tidak
 * seperti gambarnya, dan itu lebih buruk daripada tidak ada foto.
 *
 * Begitu pemilik menyebutkan nama hidangan tiap foto: taruh berkasnya di
 * `src/assets/menu/` dan daftarkan di sini — layar menu tamu, layar reservasi,
 * dan layar pesan kasir langsung memakainya tanpa perubahan lain.
 *
 * Contoh: `"lb-05": ambil("tahu-walik"),`
 */
export const FOTO_ITEM: Record<string, string | undefined> = {};

/** Foto tambahan yang dipakai di luar kategori (mis. kepala halaman). */
export const FOTO_GORENGAN = ambil("gorengan");

/* ── Buku menu: halaman utuh, untuk dibuka tamu seperti menu di meja ── */
const HALAMAN = import.meta.glob("../assets/menu/halaman/*.webp", {
  eager: true, query: "?url", import: "default",
}) as Record<string, string>;

/** Halaman buku menu, urut. Halaman pertama sampulnya. */
export const BUKU_MENU: string[] = Object.keys(HALAMAN).sort().map((k) => HALAMAN[k]);
