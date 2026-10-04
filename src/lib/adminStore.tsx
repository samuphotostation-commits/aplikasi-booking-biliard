import {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useSyncExternalStore, type ReactNode,
} from "react";
import type { LiveSession } from "../data/live";
import { can, type Role } from "../data/staff";
import { activeController } from "./lightController";
import { findClashes, floorByTable, type Action, type State } from "./engine";
import { venueStore, type SyncInfo } from "./venueStore";

export * from "./engine";

const Ctx = createContext<{
  a: State;
  dispatchA: (action: Action) => void;
  byTable: Map<string, LiveSession>;
  clashes: ReturnType<typeof findClashes>;
  tick: number;
  role: Role | null;
  allow: (p: Parameters<typeof can>[1]) => boolean;
  sync: SyncInfo;
  resetData: (seed: boolean) => void;
  /** State terbaru SEKETIKA setelah dispatch — layar membaca hasil dari mesin, bukan menebak. */
  peek: () => State;
  /** Mode server: PIN diperiksa server. Mengembalikan alasan kalau ditolak. */
  signIn: (pin: string) => Promise<string | null>;
  /** Masuk dengan email: kirim kode 6 angka ke email staf. */
  kirimKodeEmail: (email: string) => Promise<string | null>;
  /** Masuk dengan email: tukar kodenya jadi sesi venue. */
  signInEmail: (email: string, kode: string) => Promise<{ ok: true; staffId: string; nama: string; peran: Role } | { ok: false; alasan: string }>;
  signOut: () => void;
  terbitkanSekarang: () => Promise<void>;
} | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  // Mesin tidak dijalankan di dalam React: penyimpanan jejak yang memutarnya,
  // React hanya berlangganan hasilnya (lihat venueStore.ts).
  const store = venueStore();
  const a = useSyncExternalStore(store.subscribe, store.getView, store.getView);
  const [tick, bump] = useReducer((n: number) => n + 1, 0);

  // Detak 15 detik: meteran open bill, hitung mundur, peringatan T-10,
  // hold QRIS, no-show, dan penguncian jam bergantung pada waktu berjalan.
  useEffect(() => {
    const iv = setInterval(() => { store.refresh(); bump(); }, 15_000);
    return () => clearInterval(iv);
  }, [store]);

  // Aturan yang sama dengan hitungan "Kosong/Booking" di rekap — papan & angka tidak mungkin beda.
  const byTable = useMemo(() => floorByTable(a.sessions), [a.sessions, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Teruskan setiap perubahan lampu ke perangkat (atau simulasi). Hanya meja
  // yang BERUBAH yang dikirimi perintah, supaya relay tidak dibanjiri.
  const prevLights = useRef<Record<string, boolean>>(a.lights);
  useEffect(() => {
    const prev = prevLights.current;
    for (const [id, on] of Object.entries(a.lights)) {
      if (prev[id] !== on) activeController.set(id, on).catch(() => { /* dicatat di fase perangkat */ });
    }
    prevLights.current = a.lights;
  }, [a.lights]);

  const clashes = useMemo(() => findClashes(a.sessions), [a.sessions, tick]);
  const role = a.me?.role ?? null;
  const allow = useMemo(() => (p: Parameters<typeof can>[1]) => can(role, p), [role]);

  return (
    <Ctx.Provider value={{
      a, dispatchA: store.dispatch, byTable, clashes, tick, role, allow,
      sync: store.info(), resetData: store.reset, peek: store.getView,
      signIn: store.signIn, signOut: store.signOut,
      kirimKodeEmail: store.kirimKodeEmail, signInEmail: store.signInEmail,
      terbitkanSekarang: store.terbitkanSekarang,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAdmin() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin harus dipakai di dalam AdminProvider");
  return v;
}
