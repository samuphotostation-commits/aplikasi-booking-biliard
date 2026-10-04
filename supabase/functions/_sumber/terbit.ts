/* ═══════════════════════════════════════════════════════════════════
   SPL — PENERBIT RINGKASAN PUBLIK DI SERVER

   MASALAH YANG DIPERBAIKI: dulu ringkasan untuk HP pelanggan HANYA
   diterbitkan oleh perangkat staf yang sedang terbuka. Kalau tidak ada
   kasir online (pagi hari, tablet mati), tamu melihat ketersediaan basi
   berjam-jam dan booking-nya seolah gagal ("slot baru saja diambil orang
   lain") padahal server menerimanya. Sekarang server sendiri yang
   menghitungnya, jadi tidak bergantung pada perangkat mana pun.

   Cara kerjanya sama persis dengan yang dilakukan perangkat staf: putar
   ulang jejak `venue_events` lewat MESIN yang sama (engine.ts), lalu ambil
   potongan yang boleh dibaca publik (`publicVenue`) — tanpa nama, nomor HP,
   kode, pesanan, atau angka uang tamu.

   BERKAS INI SUMBER. Yang dipasang ke Supabase adalah hasil bundelnya,
   `supabase/functions/terbit/index.ts` (dibuat oleh
   `node scripts/bundel-terbit.mjs`) — seluruh mesin ikut ditempel di sana
   karena bundler Supabase menolak import dari domain kita sendiri.
   Sesudah mengubah berkas ini: bundel ulang, lalu pasang ulang Edge
   Function `terbit`.
   ═══════════════════════════════════════════════════════════════════ */
import { applyEntry, businessDateOf, entryOrder, replay, tickState, type Entry, type Genesis } from "../../../src/lib/engine";
import { publicVenue } from "../../../src/lib/publicView";

const AKTIF = new Set(["hold", "booked", "running", "maintenance"]);

/**
 * Berapa kejadian yang TIDAK mengubah apa pun (ditolak mesin), dikelompokkan
 * per jenis aksi. Dipakai untuk memeriksa: ringkasan kosong padahal jejaknya
 * panjang biasanya berarti mesin menolak, bukan datanya tidak terbaca.
 */
function hitungDitolak(genesis: Genesis, entries: Entry[]): Record<string, number> {
  const n: Record<string, number> = {};
  let st = replay(genesis, []);
  for (const e of [...entries].sort(entryOrder)) {
    const next = applyEntry(st, e);
    if (next === st) {
      const t = String((e.act as { t?: string })?.t ?? "?");
      n[t] = (n[t] ?? 0) + 1;
    }
    st = next;
  }
  return n;
}

/** Klien Supabase apa adanya — hanya bagian yang dipakai di sini. */
type Db = {
  from: (t: string) => any;
  rpc: (f: string, p: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

export async function jalankan(db: Db, req?: Request): Promise<Response> {
  // Pemeriksaan mahal (memutar ulang jejak sekali lagi) hanya kalau diminta:
  //   POST .../terbit?cek=1
  const cek = !!req && new URL(req.url).searchParams.get("cek") === "1";
  const mulai = Date.now();

  const { data: dunia } = await db.from("venue_world").select("genesis_at, seed").eq("one_row", true).maybeSingle();
  const genesis: Genesis = { at: Number(dunia?.genesis_at ?? 0), seed: dunia?.seed === true };

  // Jejak bisa panjang; diambil bertahap supaya tidak ada yang terpotong diam-diam.
  const entries: Entry[] = [];
  const HAL = 1000;
  for (let dari = 0; ; dari += HAL) {
    const { data, error } = await db.from("venue_events")
      .select("id, at_ms, by_staff, act")
      .eq("genesis_at", genesis.at)
      .order("seq", { ascending: true })
      .range(dari, dari + HAL - 1);
    if (error) return new Response(`gagal membaca jejak: ${error.message}`, { status: 500 });
    for (const r of data ?? []) {
      entries.push({ id: r.id as string, at: Number(r.at_ms), by: (r.by_staff as string | null) ?? null, act: r.act });
    }
    if (!data || data.length < HAL) break;
  }

  const kini = Date.now();
  const st = tickState(replay(genesis, entries), kini);
  const ringkasan = publicVenue(st, kini);

  const hariIni = businessDateOf(kini);
  const status = [
    ...st.sessions
      .filter((x) => x.bookingCode && (AKTIF.has(x.status) || businessDateOf(x.startsAt) === hariIni))
      .slice(0, 150)
      .map((x) => ({ code: x.bookingCode, kind: "sesi", session: x })),
    ...st.orders
      .filter((o) => o.code && businessDateOf(o.at) === hariIni)
      .slice(0, 150)
      .map((o) => ({ code: o.code, kind: "pesanan", order: o })),
  ];

  const { error } = await db.rpc("publish_public_state_server", {
    p_state: ringkasan, p_status: status, p_genesis: genesis.at,
  });
  if (error) return new Response(`gagal menerbitkan: ${error.message}`, { status: 500 });

  return new Response(JSON.stringify({
    // Penanda versi mesin yang benar-benar terpasang — sekali waktu fungsi ini
    // sudah "berhasil dipasang" menurut dashboard tapi isinya masih yang lama.
    ok: true, versi: "wib-1", zonaMenit: new Date().getTimezoneOffset(),
    kejadian: entries.length, slot: ringkasan.slots.length,
    kode: status.length, ms: Date.now() - mulai,
    // Angka pemeriksa: kalau ringkasan kosong padahal jejaknya panjang, di sinilah
    // kelihatan apakah mesin MENOLAK kejadiannya (dan yang mana).
    sesi: st.sessions.length, pesanan: st.orders.length, refund: st.refunds.length,
    ...(cek ? { ditolak: hitungDitolak(genesis, entries) } : {}),
  }), { headers: { "Content-Type": "application/json" } });
}
