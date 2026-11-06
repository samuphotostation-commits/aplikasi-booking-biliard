/** Foto venue yang dipakai halaman depan dan halaman SPL Sport. */
const FOTO = import.meta.glob("../assets/foto/*.webp", {
  eager: true, query: "?url", import: "default",
}) as Record<string, string>;

export const fotoVenue = (nama: string): string => FOTO[`../assets/foto/${nama}.webp`];

/** Pintu Sport di halaman depan dan hero SPL Sport memakai foto yang sama, supaya perpindahannya menyambung. */
export const FOTO_SPORT = fotoVenue("bl-190");
