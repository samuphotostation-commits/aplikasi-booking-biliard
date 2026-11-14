/* ═══════════════════════════════════════════════════════════════════
   DENYUT NADI ALAT LAMPU — supaya kasir tahu alatnya mati

   Tanpa ini, alat relay yang mati (listrik panel dicabut, Wi-Fi diganti
   password, adaptor rusak) baru ketahuan saat ada tamu protes lampunya
   tidak menyala — dan kasir akan mencari gangguan di aplikasi, bukan di
   panel listrik.

   Alat menyetor denyut nadi tiap kali menarik status (±1 detik sekali),
   jadi "terakhir terlihat" di sini selalu segar kalau alatnya hidup.

   Perhitungannya sendiri ada di `lampuStatus.ts` (tanpa React, supaya
   bisa diuji langsung). Berkas ini hanya yang menyangkut React.
   ═══════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from "react";
import { venueStore } from "./venueStore";
import { ringkasLampu } from "./lampuStatus";
import type { LampuInfo } from "./supabaseRemote";

export { ringkasLampu, jamTerakhir, buatKunciAlat, tampilKunciAlat } from "./lampuStatus";
export type { RingkasLampu, StatusJembatan } from "./lampuStatus";

type StoreLampu = {
  lampuAlat?: () => Promise<LampuInfo>;
  lampuSetKunci?: (kunci: string) => Promise<string | null>;
};

/**
 * Memantau alat lampu selama layarnya terbuka.
 *
 * `aktif` false = sama sekali tidak menanyakan server (mis. layar venue
 * Smokehouse, yang mejanya memang tidak punya lampu). Jedanya 20 detik:
 * ini indikator, bukan kendali — alatnya sendiri yang menarik tiap detik,
 * dan panel tidak perlu ikut sesering itu.
 */
export function useLampuAlat(aktif = true, jedaMs = 20_000) {
  const store = venueStore() as ReturnType<typeof venueStore> & StoreLampu;
  const [info, setInfo] = useState<LampuInfo | null>(null);

  const muat = useCallback(async () => {
    if (!store.lampuAlat) return;
    try { setInfo(await store.lampuAlat()); } catch {
      setInfo({ berkunci: false, versi: null, terbitMs: null, alat: [], alasan: "tidak tersambung" });
    }
  }, [store]);

  useEffect(() => {
    if (!aktif) return;
    void muat();
    const iv = setInterval(() => { void muat(); }, jedaMs);
    return () => clearInterval(iv);
  }, [aktif, jedaMs, muat]);

  return {
    info,
    ringkas: ringkasLampu(info),
    muatUlang: muat,
    setKunci: (kunci: string) => (store.lampuSetKunci?.(kunci) ?? Promise.resolve("Butuh sambungan ke server venue.")),
  };
}
