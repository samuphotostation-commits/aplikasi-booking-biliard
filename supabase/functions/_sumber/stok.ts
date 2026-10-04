/* ═══════════════════════════════════════════════════════════════════
   SPL — TUTUP BUKU STOK HARIAN DI SERVER

   MASALAH YANG DIPERBAIKI: laporan stok dulu tidak punya catatan. Angkanya
   dihitung dari penyangga di memori perangkat (`stockMoves`, maks 2.000
   baris) dan kolom "Awal" direka MUNDUR dari sisa hari ini. Satu pergerakan
   hilang → semua hari sebelumnya salah, dan tidak ada apa pun untuk
   mencocokkan. Pemilik melihatnya sebagai "tidak sinkron dan tidak ada
   historical harian".

   Sekarang server yang menutup bukunya: jejak `venue_events` diputar ulang
   dengan MESIN YANG SAMA (engine.ts), stok difoto tiap melewati batas 05.00,
   lalu tiap hari yang sudah lewat disimpan ke `stok_harian`. Sesudah itu
   angka hari lampau tidak bisa berubah lagi dan tidak bergantung perangkat.

   Dipanggil cron tiap 05.10 WIB. Bisa juga dipanggil tangan untuk mengisi
   ulang dari awal:  POST .../stok-tutup?dari=2026-09-01
   (tanpa parameter: hanya hari yang belum tertutup, plus satu hari terakhir
   diulang kalau-kalau ada kejadian yang datang terlambat.)

   BERKAS INI SUMBER. Yang dipasang adalah hasil bundelnya,
   `supabase/functions/stok-tutup/index.ts` (dibuat oleh
   `node scripts/bundel-terbit.mjs`) — mesinnya ikut ditempel karena bundler
   Supabase menolak import dari domain kita sendiri.
   ═══════════════════════════════════════════════════════════════════ */
import { laporanStokHarian, stockDateOf, type Entry, type Genesis } from "../../../src/lib/engine";

/** Klien Supabase apa adanya — hanya bagian yang dipakai di sini. */
type Db = { from: (t: string) => any };

/** Sekali kirim sekian baris; upsert raksasa pernah kena batas ukuran badan. */
const SEKALI = 500;

const hariGeser = (hari: string, arah: number) => {
  const [y, m, d] = hari.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + arah)).toISOString().slice(0, 10);
};

export async function jalankan(db: Db, req?: Request): Promise<Response> {
  const mulai = Date.now();
  const minta = req ? new URL(req.url).searchParams.get("dari") : null;

  const { data: dunia } = await db.from("venue_world")
    .select("genesis_at, seed").eq("one_row", true).maybeSingle();
  const genesis: Genesis = { at: Number(dunia?.genesis_at ?? 0), seed: dunia?.seed === true };
  if (!genesis.at) return new Response("dunia belum ada", { status: 404 });

  // Dari hari mana dihitung ulang? Kalau tidak diminta: satu hari sebelum hari
  // terakhir yang sudah tertutup, supaya kejadian yang datang terlambat tetap
  // memperbaiki catatannya. Kalau belum ada apa-apa: seluruh riwayat.
  let dari = minta && /^\d{4}-\d{2}-\d{2}$/.test(minta) ? minta : undefined;
  if (!dari) {
    const { data } = await db.from("stok_harian")
      .select("tanggal").order("tanggal", { ascending: false }).limit(1).maybeSingle();
    if (data?.tanggal) dari = hariGeser(String(data.tanggal), -1);
  }

  // Jejak bisa panjang; diambil bertahap supaya tidak ada yang terpotong diam-diam.
  const entries: Entry[] = [];
  const HAL = 1000;
  for (let awal = 0; ; awal += HAL) {
    const { data, error } = await db.from("venue_events")
      .select("id, at_ms, by_staff, act")
      .eq("genesis_at", genesis.at)
      .order("seq", { ascending: true })
      .range(awal, awal + HAL - 1);
    if (error) return new Response(`gagal membaca jejak: ${error.message}`, { status: 500 });
    for (const r of data ?? []) {
      entries.push({ id: r.id as string, at: Number(r.at_ms), by: (r.by_staff as string | null) ?? null, act: r.act });
    }
    if (!data || data.length < HAL) break;
  }

  // Hari ini SENGAJA tidak ditutup: masih berjalan, dan layar kasir
  // menghitungnya sendiri dari jejak supaya hidup.
  const hariIni = stockDateOf(Date.now());
  const laporan = laporanStokHarian(genesis, entries, dari);

  const baris: Record<string, unknown>[] = [];
  for (const hari of Object.keys(laporan).sort()) {
    if (hari >= hariIni) continue;
    for (const x of laporan[hari]) {
      // Barang yang tidak dilacak stoknya tidak perlu disimpan.
      if (x.awal === null && x.sisa === null) continue;
      baris.push({
        tanggal: hari, item_id: x.itemId,
        awal: x.awal, masuk: x.masuk, terjual: x.terjual, kembali: x.kembali,
        susut: x.susut, opname: x.opname, sisa: x.sisa, nilai_jual: x.nilaiJual,
        ditutup_at: new Date().toISOString(),
      });
    }
  }

  let ditulis = 0;
  for (let i = 0; i < baris.length; i += SEKALI) {
    const { error } = await db.from("stok_harian")
      .upsert(baris.slice(i, i + SEKALI), { onConflict: "tanggal,item_id" });
    if (error) return new Response(`gagal menulis: ${error.message}`, { status: 500 });
    ditulis += Math.min(SEKALI, baris.length - i);
  }

  return new Response(JSON.stringify({
    ok: true, dari: dari ?? "sejak awal", sampai: hariGeser(hariIni, -1),
    hari: new Set(baris.map((b) => b.tanggal)).size, baris: ditulis,
    kejadian: entries.length, ms: Date.now() - mulai,
  }), { headers: { "Content-Type": "application/json" } });
}
