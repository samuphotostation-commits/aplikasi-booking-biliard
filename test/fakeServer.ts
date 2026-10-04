/* Server tiruan untuk menguji sinkronisasi lintas perangkat tanpa Supabase.

   Meniru persis yang akan dilakukan Edge Function + Realtime nanti:
   - nomor urut `seq` dan JAM SERVER ditetapkan di sini, bukan di perangkat;
   - pelaku diambil dari token PIN, bukan dari isian perangkat;
   - kirim ulang dengan id yang sama tidak membuat kejadian dobel;
   - bentuk aksi divalidasi (gagal tertutup) sebelum masuk jejak;
   - siarannya dikirim manual, jadi tes bisa membuatnya tiba terlambat/acak.

   Server TIDAK menjalankan aturan bisnis — itu tetap milik engine.ts. */
import { validAction, type Genesis } from "../src/lib/engine";
import type { Proposal, PullResult, PushResult, Remote, ServerEntry } from "../src/lib/remote";

type Sub = { cb: (entries: ServerEntry[]) => void; alive: boolean };

export function fakeServer(opts: { genesis: Genesis; now: () => number; tokens?: Record<string, string> }) {
  const tokens = opts.tokens ?? {};
  const log: ServerEntry[] = [];
  const seen = new Map<string, ServerEntry>();
  const subs: Sub[] = [];
  const queue: { sub: Sub; entries: ServerEntry[] }[] = [];
  const stat = { push: 0, pull: 0, ditolak: 0, dobel: 0, offline: 0 };
  const clone = (e: ServerEntry): ServerEntry => ({ ...e, act: structuredClone(e.act) });

  function commit(p: Proposal, actor: string | null): ServerEntry | "ditolak" {
    const dup = seen.get(p.id);
    if (dup) { stat.dobel++; return dup; }                       // kirim ulang: kejadian yang sama
    if (!validAction(p.act)) { stat.ditolak++; return "ditolak"; }
    // Jam server tidak pernah mundur: kejadian baru selalu di ujung jejak.
    const at = Math.max(opts.now(), (log[log.length - 1]?.at ?? 0) + 1);
    const e: ServerEntry = { id: p.id, at, by: actor, act: structuredClone(p.act), seq: log.length + 1 };
    log.push(e);
    seen.set(e.id, e);
    return e;
  }

  function broadcast(entries: ServerEntry[]) {
    if (!entries.length) return;
    for (const sub of subs) if (sub.alive) queue.push({ sub, entries: entries.map(clone) });
  }

  /** Satu perangkat. `online` bisa dimatikan tes untuk meniru internet putus. */
  function device(o: { token?: string; online?: boolean } = {}) {
    const self = {
      token: o.token,
      online: o.online !== false,
      remote: null as unknown as Remote,
    };
    self.remote = {
      async pull(sinceSeq: number): Promise<PullResult> {
        stat.pull++;
        if (!self.online) { stat.offline++; throw new Error("jaringan"); }
        return { genesis: opts.genesis, entries: log.filter((e) => e.seq > sinceSeq).map(clone), head: log.length };
      },
      async push(items: Proposal[]): Promise<PushResult> {
        stat.push++;
        if (!self.online) { stat.offline++; throw new Error("jaringan"); }
        if (self.token !== undefined && !(self.token in tokens)) {
          return { ok: false, error: "kedaluwarsa", message: "Sesi PIN sudah habis — masukkan PIN lagi." };
        }
        const actor = self.token === undefined ? null : tokens[self.token];
        const accepted: ServerEntry[] = [];
        for (const p of items) {
          const e = commit(p, actor ?? null);
          if (e === "ditolak") return { ok: false, error: "ditolak", message: `Aksi ${p.act?.t} ditolak server.` };
          accepted.push(clone(e));
        }
        broadcast(accepted);
        return { ok: true, accepted };
      },
      subscribe(cb: (entries: ServerEntry[]) => void) {
        const sub: Sub = { cb, alive: true };
        subs.push(sub);
        return () => { sub.alive = false; };
      },
    };
    return self;
  }

  return {
    device,
    /** Jejak resmi server — pembanding kebenaran untuk semua perangkat. */
    log,
    genesis: opts.genesis,
    stat,
    pending: () => queue.length,
    /** Kirim semua siaran yang tertunda. */
    deliverAll() {
      while (queue.length) {
        const m = queue.shift()!;
        if (m.sub.alive) m.sub.cb(m.entries);
      }
    },
    /** Kirim sebagian siaran saja, urutannya acak (siaran bisa tiba terlambat). */
    deliverSome(rnd: () => number) {
      const n = Math.floor(rnd() * (queue.length + 1));
      for (let i = 0; i < n && queue.length; i++) {
        const j = Math.floor(rnd() * queue.length);
        const [m] = queue.splice(j, 1);
        if (m.sub.alive) m.sub.cb(m.entries);
      }
    },
    /** Buang siaran yang tertunda — meniru perangkat yang kehilangan koneksi Realtime. */
    dropPending() { queue.length = 0; },
  };
}

export type FakeServer = ReturnType<typeof fakeServer>;
