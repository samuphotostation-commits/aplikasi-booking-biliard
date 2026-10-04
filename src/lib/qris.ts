/* ═══════════════════════════════════════════════════════════════════
   QRIS DINAMIS DARI SISI HP TAMU

   HP tidak pernah memegang secret key gateway. Yang dilakukan di sini hanya:
     1. Minta QR ke Edge Function `qris-buat` (fungsi itu yang punya key).
     2. Tanyakan statusnya ke `payment_status(ref)` sampai lunas.

   Kalau gateway belum dikonfigurasi (key belum dipasang), fungsi server
   menjawab `belumAktif` dan layar otomatis kembali memakai "bayar di kasir".
   Jadi aplikasi tetap jalan sebelum merchant QRIS aktif.
   ═══════════════════════════════════════════════════════════════════ */

export type QrisTagihan = {
  ref: string;
  qrUrl?: string | null;
  qrString?: string | null;
  /**
   * Halaman pembayaran gateway yang harus DIBUKA tamu (DOKU Checkout).
   * Kalau ini terisi, `qrUrl` bukan gambar QR — jangan dipasang di <img>.
   */
  bayarUrl?: string | null;
  provider?: string | null;
  expiresAt: number;
};

export type QrisHasil =
  | { ok: true; tagihan: QrisTagihan }
  | { ok: false; belumAktif: true }
  | { ok: false; alasan: string };

export type QrisStatus = "menunggu" | "lunas" | "gagal" | "kedaluwarsa" | "tidak-ada";

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
const URL_ = env.VITE_SUPABASE_URL ?? "";
const KEY = env.VITE_SUPABASE_ANON_KEY ?? "";

/** QRIS hanya mungkin kalau aplikasi memang tersambung ke server venue. */
export const qrisMungkin = () => !!URL_ && !!KEY;

const kepala = () => ({
  "Content-Type": "application/json",
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
});

/**
 * Minta QR untuk sebuah tagihan. `act` adalah aksi venue yang akan ditulis
 * server ke jejak SETELAH pembayaran benar-benar masuk — bukan sekarang.
 */
export async function buatQris(input: {
  kode: string;
  amount: number;
  ringkas: string;
  act: unknown;
}): Promise<QrisHasil> {
  if (!qrisMungkin()) return { ok: false, belumAktif: true };
  try {
    const r = await fetch(`${URL_}/functions/v1/qris-buat`, {
      method: "POST", headers: kepala(), body: JSON.stringify(input),
    });
    const hasil = await r.json().catch(() => ({}));
    if (hasil?.belumAktif) return { ok: false, belumAktif: true };
    if (!r.ok || !hasil?.ref) return { ok: false, alasan: hasil?.error ?? `gateway tidak menjawab (${r.status})` };
    return {
      ok: true,
      tagihan: {
        ref: hasil.ref,
        qrUrl: hasil.bayarUrl ? null : hasil.qrUrl,      // halaman bayar bukan gambar QR
        qrString: hasil.qrString,
        bayarUrl: hasil.bayarUrl ?? null,
        provider: hasil.provider ?? null,
        expiresAt: Number(hasil.expiresAt),
      },
    };
  } catch {
    // Fungsi belum dipasang / tidak ada sinyal: jangan menghalangi tamu, pakai kasir.
    return { ok: false, belumAktif: true };
  }
}

/** Status pembayaran menurut SERVER (bukan menurut HP). */
export async function statusQris(ref: string, directCheck = true): Promise<QrisStatus> {
  if (!qrisMungkin()) return "tidak-ada";
  try {
    const r = await fetch(`${URL_}/rest/v1/rpc/payment_status`, {
      method: "POST", headers: kepala(), body: JSON.stringify({ p_ref: ref }),
    });
    const hasil = await r.json().catch(() => null);
    const st = hasil?.status;
    if (st === "lunas" || st === "gagal" || st === "kedaluwarsa") return st;

    // Basis data masih "menunggu" — itu belum tentu benar: notifikasi gateway
    // bisa hilang atau ditolak, dan tamu yang SUDAH membayar tidak boleh
    // menatap layar "menunggu" selamanya. Jadi minta server bertanya langsung
    // ke gateway (lihat cekQris) sebelum menyimpulkan apa pun.
    if (directCheck) {
      const lagi = await cekQris(ref);
      if (lagi === "lunas" || lagi === "gagal" || lagi === "kedaluwarsa") return lagi;
    }
    return st === "menunggu" ? "menunggu" : "tidak-ada";
  } catch {
    return "menunggu";
  }
}

/**
 * UJI COBA pemilik: membuat tagihan sungguhan di gateway (nominal kecil) yang
 * TIDAK terhubung ke aksi venue apa pun — dibayar atau tidak, jejak venue tidak
 * berubah. Dipakai untuk memastikan key, tanda tangan, dan webhook benar.
 */
export async function ujiQris(amount = 1000): Promise<QrisHasil> {
  if (!qrisMungkin()) return { ok: false, belumAktif: true };
  try {
    const r = await fetch(`${URL_}/functions/v1/qris-buat`, {
      method: "POST", headers: kepala(),
      body: JSON.stringify({ uji: true, amount, ringkas: "Uji koneksi QRIS SPL" }),
    });
    const hasil = await r.json().catch(() => ({}));
    if (hasil?.belumAktif) return { ok: false, belumAktif: true };
    if (!r.ok || !hasil?.ref) return { ok: false, alasan: hasil?.error ?? `gateway tidak menjawab (${r.status})` };
    return {
      ok: true,
      tagihan: {
        ref: hasil.ref,
        qrUrl: hasil.bayarUrl ? null : hasil.qrUrl,
        qrString: hasil.qrString,
        bayarUrl: hasil.bayarUrl ?? null,
        provider: hasil.provider ?? null,
        expiresAt: Number(hasil.expiresAt),
      },
    };
  } catch (e) {
    return { ok: false, alasan: e instanceof Error ? e.message : "tidak bisa menghubungi server" };
  }
}

/**
 * QRIS DI MEJA KASIR: QR dinamis dengan nominal TEPAT untuk tamu yang membayar
 * langsung di kasir. Tidak terikat aksi venue apa pun — yang menutup tab tetap
 * kasir dari layarnya sendiri sesudah pembayaran terdeteksi. Ini menggantikan
 * stiker QR statis yang nominalnya harus diketik tamu sendiri.
 */
export async function qrisKasir(amount: number, ringkas: string, kode?: string): Promise<QrisHasil> {
  if (!qrisMungkin()) return { ok: false, belumAktif: true };
  try {
    const r = await fetch(`${URL_}/functions/v1/qris-buat`, {
      method: "POST", headers: kepala(),
      body: JSON.stringify({ kasir: true, amount: Math.round(amount), ringkas, kode }),
    });
    const hasil = await r.json().catch(() => ({}));
    if (hasil?.belumAktif) return { ok: false, belumAktif: true };
    if (!r.ok || !hasil?.ref) return { ok: false, alasan: hasil?.error ?? `gateway tidak menjawab (${r.status})` };
    return {
      ok: true,
      tagihan: {
        ref: hasil.ref,
        qrUrl: hasil.bayarUrl ? null : hasil.qrUrl,
        qrString: hasil.qrString,
        bayarUrl: hasil.bayarUrl ?? null,
        provider: hasil.provider ?? null,
        expiresAt: Number(hasil.expiresAt),
      },
    };
  } catch (e) {
    return { ok: false, alasan: e instanceof Error ? e.message : "tidak bisa menghubungi server" };
  }
}

/**
 * Minta SERVER memastikan langsung ke gateway apakah tagihan ini sudah dibayar.
 *
 * Dipakai layar bayar sebagai jaring pengaman: notifikasi dari gateway bisa
 * hilang atau ditolak, dan tamu yang SUDAH membayar tidak boleh menatap layar
 * "menunggu" selamanya. Yang menentukan tetap jawaban gateway, bukan HP tamu.
 */
export async function cekQris(ref: string): Promise<QrisStatus> {
  if (!qrisMungkin()) return "tidak-ada";
  try {
    const r = await fetch(`${URL_}/functions/v1/qris-webhook`, {
      method: "POST", headers: kepala(), body: JSON.stringify({ ref }),
    });
    const hasil = await r.json().catch(() => null);
    const st = hasil?.status;
    return st === "lunas" || st === "gagal" || st === "kedaluwarsa" || st === "menunggu" ? st : "menunggu";
  } catch {
    return "menunggu";
  }
}

/** Apakah pemilik sudah menyalakan QRIS (key sudah dipasang)? */
export async function qrisAktif(): Promise<boolean> {
  if (!qrisMungkin()) return false;
  try {
    const r = await fetch(`${URL_}/rest/v1/payment_config?select=aktif&limit=1`, { headers: kepala() });
    const rows = await r.json().catch(() => []);
    return rows?.[0]?.aktif === true;
  } catch {
    return false;
  }
}
