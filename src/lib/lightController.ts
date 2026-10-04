/* ═══════════════════════════════════════════════════════════════════
   KONTROL LAMPU MEJA — lapisan adaptor

   Aplikasi web di browser TIDAK bisa menyalakan lampu fisik secara
   langsung. Dibutuhkan perangkat di venue. Susunan yang umum dan murah:

     [Panel kasir]  --HTTPS-->  [Server/Supabase]  --MQTT/WebSocket-->
     [Bridge lokal di venue]  --> [Papan relay 8/16 channel] --> lampu meja

   Bridge lokal biasanya ESP32 atau Raspberry Pi yang terhubung ke WiFi
   venue. Satu papan relay 16 channel bisa menangani 16 meja; 34 meja
   butuh 3 papan. Relay WAJIB dipasang teknisi listrik — lampu meja
   biliar memakai listrik 220V.

   Aturan keselamatan yang harus dijaga di sisi perangkat:
   - Kalau koneksi ke server putus, lampu TIDAK boleh mati sendiri
     (tamu sedang main). Perangkat mempertahankan status terakhir.
   - Saklar manual fisik tetap harus ada sebagai cadangan.

   Di aplikasi, semua perubahan status lampu sudah dicatat di jejak
   audit. Begitu perangkat terpasang, cukup ganti `activeController`
   dengan implementasi nyata — tidak ada layar yang perlu diubah.
   ═══════════════════════════════════════════════════════════════════ */

export interface LightController {
  /** Nama untuk ditampilkan di panel (mis. "Simulasi", "Relay venue"). */
  readonly name: string;
  /** Apakah perangkat fisik benar-benar tersambung. */
  readonly connected: boolean;
  set(tableId: string, on: boolean): Promise<void>;
}

/** Tidak ada perangkat terpasang: hanya mengubah status di aplikasi. */
export const simulatedController: LightController = {
  name: "Simulasi (belum ada perangkat)",
  connected: false,
  async set() {
    /* sengaja kosong */
  },
};

/**
 * Contoh implementasi untuk bridge lokal ber-HTTP. Belum dipakai —
 * alamat, format, dan autentikasinya ditentukan saat perangkat dipasang.
 */
export function httpBridgeController(baseUrl: string, token: string): LightController {
  return {
    name: "Relay venue",
    connected: true,
    async set(tableId, on) {
      const res = await fetch(`${baseUrl}/lampu/${encodeURIComponent(tableId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ on }),
      });
      if (!res.ok) throw new Error(`Relay menolak perintah (${res.status})`);
    },
  };
}

export const activeController: LightController = simulatedController;
