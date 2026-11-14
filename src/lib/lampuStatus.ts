/* ═══════════════════════════════════════════════════════════════════
   DENYUT NADI ALAT LAMPU — perhitungannya saja (tanpa React)

   Dipisah dari `lampuAlat.ts` supaya bisa diuji langsung di Node tanpa
   menyeret React dan seluruh penyimpanan venue ke dalam uji.

   SATU HAL YANG DIBEDAKAN DENGAN SENGAJA: "tidak tahu" bukan "mati".
   Kalau servernya yang tidak bisa ditanya — sesi PIN habis, atau
   `schema-lampu.sql` belum dijalankan — panel mengatakan apa adanya
   bahwa ia tidak tahu. Menampilkan "alat mati" dalam keadaan itu
   mengirim teknisi ke panel listrik untuk mencari gangguan yang
   sebenarnya ada di satu perintah SQL yang belum dijalankan.
   ═══════════════════════════════════════════════════════════════════ */
import type { LampuInfo } from "./supabaseRemote";

/** Alat menarik tiap ±1 detik; lewat 25 detik berarti ada yang salah. */
const AMBANG_ONLINE = 25_000;
/** Masih terlihat dalam 3 menit terakhir: sedang tersendat, belum tentu mati. */
const AMBANG_TERSENDAT = 180_000;

export type StatusJembatan = "memuat" | "tidak-tahu" | "belum-dipasang" | "mati" | "tersendat" | "online";

export type RingkasLampu = {
  status: StatusJembatan;
  /** Kalimat siap tampil untuk kasir. */
  teks: string;
  /** Berapa alat yang denyutnya masih segar. */
  hidup: number;
  /** Berapa alat yang pernah terdaftar. */
  total: number;
  info: LampuInfo | null;
};

export function ringkasLampu(info: LampuInfo | null, kini = Date.now()): RingkasLampu {
  if (!info) return { status: "memuat", teks: "memeriksa alat…", hidup: 0, total: 0, info };
  if (info.alasan) return { status: "tidak-tahu", teks: "status alat tidak diketahui", hidup: 0, total: 0, info };
  if (!info.berkunci) {
    return { status: "belum-dipasang", teks: "kunci alat belum dipasang", hidup: 0, total: info.alat.length, info };
  }
  if (info.alat.length === 0) {
    return { status: "mati", teks: "belum ada alat yang pernah terhubung", hidup: 0, total: 0, info };
  }

  const segar = info.alat.filter((x) => kini - Number(x.terakhir_ms) < AMBANG_ONLINE);
  const baru = info.alat.filter((x) => kini - Number(x.terakhir_ms) < AMBANG_TERSENDAT);
  const total = info.alat.length;

  if (segar.length === total) {
    return { status: "online", teks: `alat online (${total})`, hidup: segar.length, total, info };
  }
  if (segar.length > 0) {
    return {
      status: "tersendat",
      teks: `${segar.length} dari ${total} alat online`,
      hidup: segar.length, total, info,
    };
  }
  if (baru.length > 0) {
    return { status: "tersendat", teks: "alat tersendat", hidup: 0, total, info };
  }
  return { status: "mati", teks: `alat mati — ${jamTerakhir(info)}`, hidup: 0, total, info };
}

/** "terakhir terlihat 21.07" — jam, bukan "3 jam lalu": kasir mencocokkannya
 *  dengan jam kejadian lain (mati listrik, tutup toko). "3 jam lalu" memaksa
 *  orang berhitung mundur di kepala saat sedang sibuk. */
export function jamTerakhir(info: LampuInfo, kini = Date.now()): string {
  const ms = Math.max(0, ...info.alat.map((x) => Number(x.terakhir_ms) || 0));
  if (!ms) return "belum pernah terhubung";
  const d = new Date(ms);
  const hariIni = new Date(kini).toDateString() === d.toDateString();
  const jam = `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
  return hariIni
    ? `terakhir terlihat ${jam}`
    : `terakhir terlihat ${d.getDate()}/${d.getMonth() + 1} ${jam}`;
}

/** Kunci alat 20 huruf acak (huruf kecil + angka, ±100 bit) — dibuat di
 *  perangkat, tidak pernah ditebak server. Huruf kecil saja dan tanpa yang
 *  gampang tertukar (0/o, 1/l/i): kunci ini DIKETIK manusia di HP ke halaman
 *  pengaturan alat. Kunci lama 32 huruf campur besar-kecil terbukti gagal
 *  diketik benar di lokasi. */
export function buatKunciAlat(): string {
  const huruf = "abcdefghjkmnpqrstuvwxyz23456789";
  const acak = new Uint32Array(20);
  crypto.getRandomValues(acak);
  return Array.from(acak, (n) => huruf[n % huruf.length]).join("");
}

/** Tampilan berkelompok empat ("abcd-efgh-…") supaya mudah dibaca dan diketik.
 *  Tanda pisahnya bukan bagian dari kunci; alat membuangnya sendiri. */
export function tampilKunciAlat(k: string): string {
  return k.match(/.{1,4}/g)?.join("-") ?? k;
}
