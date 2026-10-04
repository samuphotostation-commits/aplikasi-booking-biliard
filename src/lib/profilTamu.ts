/* ═══════════════════════════════════════════════════════════════════
   PROFIL TAMU DI HP SENDIRI

   Nama, nomor HP, dan email disimpan DI HP tamu saja (localStorage) supaya
   formulir booking berikutnya tidak perlu diisi ulang. Tidak ada akun, tidak
   ada kata sandi, tidak ada yang dikirim ke server dari sini.

   Data yang sampai ke pemilik hanya yang memang menyertai booking/pesanan
   yang dibuat tamu — dikumpulkan dari jejak venue oleh perangkat staf
   (lihat `customer_visits` di supabase/schema-pelanggan.sql).

   UU PDP: tamu bisa menghapus profil di HP-nya kapan saja lewat `lupakan()`,
   dan bisa minta kasir menghapus riwayatnya dari database venue.
   ═══════════════════════════════════════════════════════════════════ */
const K = "spl:v1:profil";

export type ProfilTamu = { nama: string; hp: string; email: string; setuju: boolean };

const KOSONG: ProfilTamu = { nama: "", hp: "", email: "", setuju: false };

export function bacaProfil(): ProfilTamu {
  try {
    const x = JSON.parse(window.localStorage.getItem(K) ?? "null") as Partial<ProfilTamu> | null;
    if (!x) return KOSONG;
    return {
      nama: typeof x.nama === "string" ? x.nama : "",
      hp: typeof x.hp === "string" ? x.hp : "",
      email: typeof x.email === "string" ? x.email : "",
      setuju: x.setuju === true,
    };
  } catch { return KOSONG; }
}

export function simpanProfil(p: Partial<ProfilTamu>) {
  try {
    const gabung = { ...bacaProfil(), ...p };
    window.localStorage.setItem(K, JSON.stringify(gabung));
  } catch { /* mode privat: cukup dipakai sekali ini saja */ }
}

/** Hapus profil dari HP ini. Riwayat di venue dihapus terpisah oleh kasir. */
export function lupakanProfil() {
  try { window.localStorage.removeItem(K); } catch { /* abaikan */ }
}

/** 0812… → 62812…, supaya satu orang tidak terhitung dua kali di database pemilik. */
export function rapikanHp(hp: string): string {
  const angka = (hp ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!angka) return "";
  if (angka.startsWith("62")) return angka;
  if (angka.startsWith("0")) return "62" + angka.slice(1);
  if (angka.startsWith("8")) return "62" + angka;
  return angka;
}
