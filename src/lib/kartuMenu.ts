/**
 * Kartu hidangan untuk korsel coverflow — SATU sumber, dipakai beranda
 * Smokehouse dan halaman depan.
 *
 * Kalau tiap layar menyusun kartunya sendiri, dua layar akan menampilkan
 * kategori yang berbeda dengan harga yang dihitung dengan cara berbeda, dan
 * yang pertama ketahuan adalah tamu yang melihat "mulai Rp 18.000" di satu
 * halaman dan "mulai Rp 22.000" di halaman sebelahnya.
 *
 * Harga dibaca dari `priceOf` — harga yang BERLAKU di panel admin, bukan
 * harga yang tertulis di buku menu cetak.
 */
import type { KartuCoverflow } from "../components/Coverflow";
import { FOTO_KATEGORI } from "../data/fotoMenu";
import { kategoriJual, priceOf, type State } from "./adminStore";
import { rupiah } from "./core";

/**
 * Kategori yang punya foto, jadi kartu. Kategori tanpa foto SENGAJA tidak
 * ikut: kartu coverflow adalah kartu foto, dan kartu berlatar kosong di
 * antara foto hidangan terbaca seperti gambar yang gagal dimuat.
 */
export function kartuKategori(a: State, batas = 8): KartuCoverflow[] {
  return kategoriJual(a, { staf: false })
    .filter((c) => FOTO_KATEGORI[c.id] && c.items.length > 0)
    .slice(0, batas)
    .map((c) => {
      const harga = c.items.map((i) => priceOf(a, i.id)).filter((n) => n > 0);
      const mulai = harga.length ? Math.min(...harga) : 0;
      return {
        id: c.id,
        judul: c.name,
        subjudul: c.kicker,
        tag: `${c.items.length} pilihan`,
        teks: mulai ? `Mulai ${rupiah(mulai)}` : undefined,
        foto: FOTO_KATEGORI[c.id]!,
        // "Lihat & pesan" terbaca seperti tombol yang langsung memesan.
        // Yang sebenarnya terjadi: kartunya membuka daftar pilihan kategori
        // itu, dan memesannya masih beberapa langkah lagi.
        ctaLabel: "Lihat pilihan",
      };
    });
}
