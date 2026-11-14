/**
 * PEMBARUAN APLIKASI (permintaan pemilik 14 Nov 2026).
 *
 * Tiap kali situs kasir dipasang ulang, `versi.json` ikut terbit (lihat
 * scripts/build-web.mjs). Modul ini membandingkannya dengan versi halaman
 * yang sedang jalan di perangkat ini, lalu:
 *
 *   - Aplikasi Windows: mengunduh versi baru lewat Electron (electron/main.cjs),
 *     memeriksa sidik jarinya, lalu memuat ulang. Tidak perlu installer baru.
 *   - Browser & APK Android: cukup memuat ulang — keduanya membuka situs langsung.
 *
 * Satu keadaan untuk seluruh aplikasi (spanduk di atas + kartu di Pengaturan),
 * jadi server hanya ditanya satu kali per putaran.
 */
import { useSyncExternalStore } from "react";

type VersiServer = { build: string; dibuat?: number; aplikasi?: string; android?: string | null };
type Desktop = {
  versi(): Promise<{ build: string | null; dibuat: number | null; aplikasi: string; sumber: string }>;
  cekPembaruan(): Promise<{ ok: boolean; alasan?: string } & Partial<VersiServer>>;
  perbarui(): Promise<{ ok: boolean; sama?: boolean; alasan?: string }>;
};

const desktop = (): Desktop | undefined => (window as unknown as { splAplikasi?: Desktop }).splAplikasi;

export type JenisPerangkat = "windows" | "android" | "browser";
export const jenisPerangkat = (): JenisPerangkat =>
  desktop() ? "windows" : (window as unknown as { Capacitor?: unknown }).Capacitor ? "android" : "browser";

/** Alamat situs kasir — tempat versi.json & APK berada. */
export const SITUS_KASIR = "https://kasir.sportspoollounge.com";

/**
 * Versi halaman yang SEDANG JALAN: nama berkas masuk JS (ber-hash dari isinya).
 * Saat pengembangan (vite dev) tidak ada — pemeriksaan dimatikan.
 */
function buildHalaman(): string | null {
  if (import.meta.env.DEV) return null;
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/"]');
  return el ? (el.getAttribute("src") ?? "").split("/").pop()!.split("?")[0] || null : null;
}

export type KeadaanPembaruan = {
  saya: string | null;
  /** Versi aplikasi Windows (installer) — hanya di aplikasi Windows. */
  aplikasiWindows: string | null;
  terbaru: VersiServer | null;
  memeriksa: boolean;
  memperbarui: boolean;
  pesan: string | null;
  diperiksa: number | null;
};

let k: KeadaanPembaruan = {
  saya: null, aplikasiWindows: null, terbaru: null, memeriksa: false, memperbarui: false, pesan: null, diperiksa: null,
};
const pendengar = new Set<() => void>();
const ubah = (p: Partial<KeadaanPembaruan>) => { k = { ...k, ...p }; pendengar.forEach((f) => f()); };

export const adaPembaruan = (x: KeadaanPembaruan) => !!(x.saya && x.terbaru && x.terbaru.build !== x.saya);

/** Tanya server versi terbaru. Tidak pernah melempar galat. */
export async function periksaPembaruan(): Promise<void> {
  if (k.memeriksa) return;
  const saya = buildHalaman();
  if (!saya) return;
  ubah({ memeriksa: true, saya });
  try {
    const d = desktop();
    let v: VersiServer | null = null;
    if (d) {
      // Dari Electron, bukan fetch halaman: halaman spl://app tidak boleh
      // membaca situs lain (CORS), dan memang tidak perlu.
      const [r, info] = await Promise.all([d.cekPembaruan(), d.versi().catch(() => null)]);
      if (info) ubah({ aplikasiWindows: info.aplikasi });
      if (r.ok && r.build) v = { build: r.build, dibuat: r.dibuat, aplikasi: r.aplikasi, android: r.android };
      else throw new Error(r.alasan ?? "server tidak menjawab");
    } else {
      const r = await fetch(`/versi.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`server menjawab ${r.status}`);
      const j = await r.json() as Partial<VersiServer>;
      if (typeof j.build !== "string") throw new Error("versi.json tidak dikenali");
      v = { build: j.build, dibuat: j.dibuat, aplikasi: j.aplikasi, android: j.android ?? null };
    }
    ubah({ terbaru: v, pesan: null, diperiksa: Date.now() });
  } catch (e) {
    ubah({ pesan: `Belum bisa memeriksa pembaruan (${e instanceof Error ? e.message : String(e)}).`, diperiksa: Date.now() });
  } finally {
    ubah({ memeriksa: false });
  }
}

/** Pasang versi terbaru di perangkat ini. */
export async function perbaruiSekarang(): Promise<void> {
  const d = desktop();
  if (!d) { location.reload(); return; }
  ubah({ memperbarui: true, pesan: null });
  const r = await d.perbarui().catch((e) => ({ ok: false, alasan: String(e) } as { ok: boolean; alasan?: string }));
  if (r.ok) { location.reload(); return; }
  ubah({ memperbarui: false, pesan: `Pembaruan gagal: ${r.alasan ?? "tidak diketahui"}. Versi yang sekarang tetap dipakai.` });
}

let dipantau = false;
/** Mulai memeriksa berkala (sekali saja untuk seluruh aplikasi). */
export function mulaiPantauPembaruan(): void {
  if (dipantau || !buildHalaman()) return;
  dipantau = true;
  void periksaPembaruan();
  setInterval(() => void periksaPembaruan(), 10 * 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!k.diperiksa || Date.now() - k.diperiksa > 60_000)) void periksaPembaruan();
  });
}

export function usePembaruan(): KeadaanPembaruan {
  return useSyncExternalStore(
    (f) => { pendengar.add(f); return () => pendengar.delete(f); },
    () => k,
  );
}
