/**
 * Menerbitkan ringkasan publik untuk HP pelanggan dari baris perintah.
 *
 * Biasanya perangkat staf yang melakukan ini sendiri setiap ada perubahan.
 * Skrip ini dipakai untuk memeriksa rantainya, atau menerbitkan sekali saat
 * belum ada perangkat staf yang online.
 *
 *   node scripts/terbitkan.mjs <PIN>
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { replay, tickState, type Entry, type Genesis } from "../src/lib/engine";
import { publicVenue } from "../src/lib/publicView";
import { businessDateOf } from "../src/lib/occupancy";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const pin = process.argv[2];
if (!pin) throw new Error("pakai: node scripts/terbitkan.mjs <PIN>");

/** Jaringan di lokasi ini kadang memutus TLS: ulangi beberapa kali sebelum menyerah. */
const fetchUlet: typeof fetch = async (url, init) => {
  let galat: unknown;
  for (let i = 0; i < 6; i++) {
    try { return await fetch(url as string, init); } catch (e) { galat = e; await new Promise((r) => setTimeout(r, 1200)); }
  }
  throw galat;
};

const c = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
  global: { fetch: fetchUlet },
});

const masuk = await c.rpc("staff_login", { p_pin: pin });
if (masuk.error || !masuk.data?.ok) throw new Error("PIN ditolak: " + (masuk.error?.message ?? masuk.data?.alasan));
const token = masuk.data.token as string;
console.log("masuk sebagai", masuk.data.nama);

const dunia = await c.from("venue_world").select("genesis_at, seed").limit(1).single();
if (dunia.error) throw new Error(dunia.error.message);
const genesis: Genesis = { at: Number(dunia.data.genesis_at), seed: false };

const ev = await c.rpc("fetch_events", { p_token: token, p_since: 0, p_limit: 2000 });
if (ev.error) throw new Error(ev.error.message);
const entries: Entry[] = (ev.data as { id: string; at_ms: number; by_staff: string | null; act: unknown }[])
  .map((r) => ({ id: r.id, at: Number(r.at_ms), by: r.by_staff, act: r.act as Entry["act"] }));
console.log("jejak server:", entries.length, "kejadian");

const kini = Date.now();
const st = tickState(replay(genesis, entries), kini);
const hariIni = businessDateOf(kini);
const status = [
  ...st.sessions.filter((x) => x.bookingCode).slice(0, 150).map((x) => ({ code: x.bookingCode, kind: "sesi", session: x })),
  ...st.orders.filter((o) => o.code && businessDateOf(o.at) === hariIni).slice(0, 150).map((o) => ({ code: o.code, kind: "pesanan", order: o })),
];
const ringkasan = publicVenue(st, kini);

const terbit = await c.rpc("publish_public_state", { p_state: ringkasan, p_status: status, p_genesis: genesis.at, p_token: token });
if (terbit.error) throw new Error(terbit.error.message);
console.log(`diterbitkan: ${ringkasan.slots.length} slot meja · ${status.length} kode status · tarif siang Rp ${ringkasan.rates.regularDay.toLocaleString("id-ID")}`);
