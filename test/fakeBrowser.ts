/* Lingkungan browser tiruan untuk menguji sinkronisasi antar-tab tanpa browser:
   localStorage bersama (dengan event `storage`), sessionStorage per tab, dan
   BroadcastChannel yang pesannya dikirim manual — supaya urutan tiba bisa diacak. */
type Listener = (ev: any) => void;

/** Satu perangkat = satu localStorage + satu jalur siaran antar-tab. */
export class Device {
  map = new Map<string, string>();
  constructor(public name = "d0") { devices.push(this); }
}
const devices: Device[] = [];
const d0 = new Device();
/** Penyimpanan perangkat bawaan (uji antar-tab memakai ini). */
export const shared = d0.map;
const tabs: Tab[] = [];
let quotaBytes = Infinity;
export function setQuota(n: number) { quotaBytes = n; }
const used = (dev: Device) => [...dev.map.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);

type Msg = { to: FakeChannel; data: unknown };
const bus: Msg[] = [];
const channels: FakeChannel[] = [];
/** Semua siaran yang pernah dikirim — sumber kebenaran "kejadian apa saja yang benar-benar terjadi". */
export const posted: unknown[] = [];

class FakeChannel {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public name: string, public device: Device = d0) { channels.push(this); }
  postMessage(data: unknown) {
    posted.push(structuredClone(data));
    // Siaran BroadcastChannel hanya sampai ke tab di perangkat yang sama.
    for (const c of channels) {
      if (c !== this && c.name === this.name && c.device === this.device) bus.push({ to: c, data: structuredClone(data) });
    }
  }
}

/** Kirim semua siaran yang tertunda. */
export function deliverAll() {
  while (bus.length) {
    const m = bus.shift()!;
    m.to.onmessage?.({ data: m.data });
  }
}

/** Kirim sebagian siaran saja, dengan urutan acak (siaran bisa tiba terlambat). */
export function deliverSome(rnd: () => number) {
  const n = Math.floor(rnd() * (bus.length + 1));
  for (let i = 0; i < n && bus.length; i++) {
    const j = Math.floor(rnd() * bus.length);
    const [m] = bus.splice(j, 1);
    m.to.onmessage?.({ data: m.data });
  }
}

/** Mulai dunia baru: kosongkan penyimpanan, tab, dan siaran. */
export function resetWorld() {
  for (const d of devices) d.map.clear();
  devices.length = 0; devices.push(d0);
  tabs.length = 0; bus.length = 0; channels.length = 0; posted.length = 0; quotaBytes = Infinity;
}

export class Tab {
  listeners: Record<string, Listener[]> = {};
  session = new Map<string, string>();
  constructor(public name: string, public device: Device = d0) { tabs.push(this); }
  private fireStorage(key: string | null, newValue: string | null) {
    // Event `storage` hanya terdengar tab lain di perangkat yang sama.
    for (const t of tabs) if (t !== this && t.device === this.device) for (const l of t.listeners.storage ?? []) l({ key, newValue });
  }
  /** Pasang objek global tab ini; `createVenueStore()` sesudahnya memakai penyimpanan tab ini. */
  install() {
    const self = this;
    const mem = this.device.map;
    const localStorage = {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => {
        const prev = mem.get(k) ?? "";
        if (used(self.device) - prev.length + v.length + (mem.has(k) ? 0 : k.length) > quotaBytes) throw new Error("QuotaExceededError");
        mem.set(k, String(v));
        self.fireStorage(k, String(v));
      },
      removeItem: (k: string) => { mem.delete(k); self.fireStorage(k, null); },
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() { return mem.size; },
    };
    const sessionStorage = {
      getItem: (k: string) => self.session.get(k) ?? null,
      setItem: (k: string, v: string) => { self.session.set(k, v); },
      removeItem: (k: string) => { self.session.delete(k); },
    };
    const g = globalThis as any;
    g.window = { localStorage, sessionStorage, addEventListener: (t: string, l: Listener) => { (self.listeners[t] ??= []).push(l); } };
    g.document = { visibilityState: "visible", addEventListener: () => {} };
    g.BroadcastChannel = class extends FakeChannel {
      constructor(name: string) { super(name, self.device); }
    };
    return this;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
