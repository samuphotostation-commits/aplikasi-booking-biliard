/* ═══════════════════════════════════════════════════════════════════
   SPL — PENGIRIM PESAN WHATSAPP (Supabase Edge Function)

   Menghabiskan antrean `pesan_keluar` lewat GERBANG WHATSAPP milik pemilik.
   Dipanggil cron tiap menit (lihat supabase/schema-pesan.sql).

   GERBANGNYA BELUM TENTU ADA — dan itu disengaja. Tanpa secret `WA_URL`,
   fungsi ini tidak melakukan apa-apa dan antreannya tetap utuh, supaya kasir
   bisa mengirimkannya sendiri sekali ketuk dari layar Pesan. Begitu pemilik
   memasang gerbangnya, antrean yang sama langsung terkirim otomatis tanpa
   satu pun perubahan di aplikasi.

   Bentuk permintaan gerbang dibuat BISA DIATUR karena tiap penyedia di
   Indonesia (Fonnte, Wablas, Qontak, …) beda-beda:
     WA_URL    alamat kirim pesan
     WA_TOKEN  kunci, dikirim di header Authorization
     WA_BODY   cetakan badan JSON; {hp} dan {teks} diganti isi pesannya.
               Bawaannya mengikuti Fonnte: {"target":"{hp}","message":"{teks}"}

   Pasang dengan JWT dimatikan (dipanggil pg_net tanpa token).
   ═══════════════════════════════════════════════════════════════════ */
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Sekali jalan maksimal sekian pesan — cron tiap menit, jadi antrean tetap habis. */
const SEKALI = 20;
/** Sesudah sekian kali gagal, berhenti dicoba supaya tidak menggerus kuota gerbang. */
const MAKS_COBA = 3;

const json = (isi: unknown, status = 200) =>
  new Response(JSON.stringify(isi), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async () => {
  const url = Deno.env.get("WA_URL") ?? "";
  const token = Deno.env.get("WA_TOKEN") ?? "";
  const cetakan = Deno.env.get("WA_BODY") ?? '{"target":"{hp}","message":"{teks}"}';

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  if (!url) {
    // Bukan galat: memang belum dipasang. Antrean sengaja dibiarkan utuh.
    const { count } = await db.from("pesan_keluar")
      .select("id", { count: "exact", head: true }).eq("status", "antre");
    return json({ belumAktif: true, antre: count ?? 0 });
  }

  const { data: antre, error } = await db.from("pesan_keluar")
    .select("id, hp, teks, percobaan")
    .eq("status", "antre")
    .lt("percobaan", MAKS_COBA)
    .order("created_at", { ascending: true })
    .limit(SEKALI);
  if (error) return json({ error: error.message }, 500);

  let terkirim = 0, gagal = 0;
  for (const p of antre ?? []) {
    // Teks dimasukkan lewat JSON.stringify supaya baris baru & tanda kutip di
    // dalam pesan tidak merusak badan permintaannya.
    const badan = cetakan
      .replace('"{hp}"', JSON.stringify(String(p.hp)))
      .replace('"{teks}"', JSON.stringify(String(p.teks)))
      .replace("{hp}", String(p.hp))
      .replace("{teks}", String(p.teks));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
        body: badan,
      });
      const balas = (await res.text()).slice(0, 200);
      if (res.ok) {
        await db.from("pesan_keluar")
          .update({ status: "terkirim", sent_at: new Date().toISOString(), galat: null })
          .eq("id", p.id);
        terkirim++;
      } else {
        const coba = (p.percobaan ?? 0) + 1;
        await db.from("pesan_keluar").update({
          percobaan: coba,
          status: coba >= MAKS_COBA ? "gagal" : "antre",
          galat: `HTTP ${res.status}: ${balas}`,
        }).eq("id", p.id);
        gagal++;
      }
    } catch (e) {
      const coba = (p.percobaan ?? 0) + 1;
      await db.from("pesan_keluar").update({
        percobaan: coba,
        status: coba >= MAKS_COBA ? "gagal" : "antre",
        galat: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      }).eq("id", p.id);
      gagal++;
    }
  }

  return json({ ok: true, diproses: antre?.length ?? 0, terkirim, gagal });
});
