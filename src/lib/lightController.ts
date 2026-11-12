/* ═══════════════════════════════════════════════════════════════════
   KONTROL LAMPU MEJA — jembatan ke relay ESP32-S3 di venue

   ── Bagaimana lampu menyala sekarang ──────────────────────────────

     kasir / HP manajer / tablet
            │  aksi (buka meja, check-in, tombol lampu, tutup tab)
            ▼
       venue_events  ──trigger──▶  Edge Function `terbit`
            │                            │ memutar ulang jejak dengan
            │                            │ mesin yang sama (engine.ts)
            │                            ▼
            │                     publish_lampu_server()  →  lampu_state
            │                                                    │
            └── papan kasir ikut berubah                         │
                                                                 │
                     ESP32-S3 menarik tiap ±1 detik (lampu_sinkron)
                                                                 ▼
                                                        SSR → lampu meja

   Status lampu BUKAN perintah yang dikirim satu perangkat. Ia kesimpulan
   mesin dari jejak kejadian — persis seperti angka di papan dan di rekap.
   Karena itu diterbitkan SERVER, dan tetap benar walau tidak ada satu pun
   tablet kasir yang terbuka.

   ── Kenapa aplikasi TIDAK menembak ESP32 langsung lagi ────────────

   Susunan lama (panel kasir POST ke http://10.151.57.203/lampu/T01)
   terlihat paling sederhana, tapi tidak bisa dipakai di venue ini:

   1. MIXED CONTENT. Panel kasir dibuka lewat https://. Browser memblokir
      permintaan http:// polos dari halaman https:// — diam-diam, tanpa
      pesan apa pun ke kasir. Lampu tidak menyala dan tidak ada yang tahu
      kenapa. Ini bukan masalah yang bisa "dicoba lagi": browser memang
      tidak akan pernah mengirimnya.
   2. HANYA SATU JARINGAN. HP manajer di jaringan seluler tidak akan
      pernah bisa menyalakan lampu — padahal itu salah satu alasan
      lampunya disambungkan ke aplikasi.
   3. PERINTAH SEKALI LEWAT. Kalau ESP32 sempat mati listrik, ia menyala
      lagi dengan semua relay OFF. Perintah "nyalakan T07" sudah lewat
      sejam yang lalu dan tidak pernah diulang — tamu main dalam gelap
      sampai kasir sadar dan menekan tombolnya lagi.

   Dengan alat yang MENARIK, ketiganya hilang sekaligus: tidak ada
   permintaan http dari browser, tidak perlu satu jaringan, dan alat yang
   baru menyala langsung menanyakan keadaan terbaru.

   ── Yang dijaga di sisi perangkat ─────────────────────────────────
   • Internet putus → lampu TETAP pada keadaan terakhir. Tidak ada
     perintah "matikan semua" yang bisa lahir dari kegagalan jaringan.
   • Listrik ESP32 mati → relay dipulihkan dari ingatan alat SEBELUM
     Wi-Fi tersambung, lalu dikoreksi server dalam hitungan detik.
   • Saklar manual fisik tetap harus ada sebagai cadangan.

   Firmware + panduan pasang: `perangkat/lampu-esp32/`.
   Bagian servernya: `supabase/schema-lampu.sql`.
   ═══════════════════════════════════════════════════════════════════ */

export interface LightController {
  /** Nama untuk ditampilkan di panel (mis. "Simulasi", "Relay venue"). */
  readonly name: string;
  /** Apakah perintah dari layar ini perlu diteruskan ke perangkat. */
  readonly connected: boolean;
  set(tableId: string, on: boolean): Promise<void>;
}

/**
 * Jembatan yang dipakai venue: server yang menerbitkan, alat yang menarik.
 *
 * `set()` sengaja TIDAK melakukan apa-apa, dan itu bukan kelalaian. Aksi
 * kasir sudah masuk jejak sebelum fungsi ini dipanggil; server menghitung
 * ulang status lampu dari jejak itu dan alat mengambilnya sendiri. Kalau
 * layar ikut menembak alat, akan ada DUA sumber kebenaran — dan yang kalah
 * balapan akan menimpa yang benar.
 *
 * Apakah alatnya hidup dijawab denyut nadi di `lampuAlat.ts`, bukan di
 * sini: perangkat kasir tidak pernah benar-benar tahu keadaan alat dari
 * hasil satu permintaan HTTP-nya sendiri.
 */
export const serverRelayController: LightController = {
  name: "Relay ESP32 (lewat server)",
  connected: true,
  async set() {
    /* sengaja kosong — lihat penjelasan di atas */
  },
};

/** Tidak ada perangkat terpasang: hanya mengubah status di aplikasi. */
export const simulatedController: LightController = {
  name: "Simulasi (belum ada perangkat)",
  connected: false,
  async set() {
    /* sengaja kosong */
  },
};

/**
 * Jalur langsung ke satu alat di jaringan yang sama — CADANGAN.
 *
 * Hanya berguna di dua keadaan: teknisi menguji kabel dari laptop di
 * tempat, atau panel kasir dibuka lewat http:// biasa di jaringan venue.
 * TIDAK dipakai sebagai jalur utama; alasannya ada di catatan paling atas.
 * Alat tetap menyediakan pintu ini di `/uji`, dikunci kunci alat.
 */
export function lanBridgeController(baseUrl: string, kunciAlat: string): LightController {
  return {
    name: "Relay venue (jaringan lokal)",
    connected: true,
    async set(tableId, on) {
      const u = `${baseUrl}/uji?kunci=${encodeURIComponent(kunciAlat)}`
        + `&meja=${encodeURIComponent(tableId)}&on=${on ? 1 : 0}`;
      const res = await fetch(u);
      if (!res.ok) throw new Error(`Relay menolak perintah (${res.status})`);
    },
  };
}

export const activeController: LightController = serverRelayController;
