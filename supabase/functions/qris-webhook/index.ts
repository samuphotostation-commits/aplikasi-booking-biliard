/* ═══════════════════════════════════════════════════════════════════
   SPL — KONFIRMASI PEMBAYARAN QRIS  (Supabase Edge Function)

   Dipanggil dua arah:
     1. GATEWAY, saat status pembayaran berubah (webhook/notifikasi).
     2. APLIKASI TAMU, dengan { ref } — layar bayar menanyakannya sendiri
        tiap beberapa detik.

   KENAPA DUA ARAH: notifikasi DOKU pernah ditolak 401 karena tanda tangannya
   tidak cocok dengan skema yang kita hitung, dan akibatnya tamu SUDAH
   MEMBAYAR tapi layarnya diam di "menunggu". Sekarang yang menentukan lunas
   bukan tanda tangan notifikasi, melainkan JAWABAN DOKU SENDIRI: untuk tiap
   tagihan kita tanya `/orders/v1/status/<invoice>` dengan permintaan yang
   kita tanda tangani sendiri. Notifikasi palsu tidak bisa melunasi apa pun,
   dan notifikasi yang hilang tidak lagi menggantung pembayaran.

   Midtrans tetap memakai pemeriksaan tanda tangan bawaannya (sha512) yang
   selama ini cocok, plus jalur tanya-status yang sama tidak diperlukan.

   Saat lunas: AKSI VENUE yang sudah dibekukan sejak QR dibuat ditulis ke
   `venue_events` dengan nominal SESUAI YANG BENAR-BENAR DIBAYAR. Mesin
   (engine.ts) yang memutuskan sisanya.

   Pasang dengan JWT dimatikan (--no-verify-jwt).
   ═══════════════════════════════════════════════════════════════════ */
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const sha512 = async (s: string) => hex(await crypto.subtle.digest("SHA-512", new TextEncoder().encode(s)));
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** Tanda tangan DOKU: HMAC-SHA256 atas komponen yang sudah ditentukan. */
async function tandaDoku(secret: string, komponen: string[]): Promise<string> {
  const kunci = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return `HMACSHA256=${b64(await crypto.subtle.sign("HMAC", kunci, new TextEncoder().encode(komponen.join("\n"))))}`;
}

/** Tanya DOKU: invoice ini sudah dibayar atau belum? Ini yang menentukan, bukan notifikasi. */
async function statusDiDoku(invoice: string): Promise<{ lunas: boolean; gagal: boolean; dibayar: number; mentah: string }> {
  const clientId = Deno.env.get("DOKU_CLIENT_ID") ?? "";
  const secret = Deno.env.get("DOKU_SECRET_KEY") ?? "";
  const host = Deno.env.get("DOKU_PRODUKSI") ? "https://api.doku.com" : "https://api-sandbox.doku.com";
  const target = `/orders/v1/status/${encodeURIComponent(invoice)}`;
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const signature = await tandaDoku(secret, [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${timestamp}`,
    `Request-Target:${target}`,
  ]);
  const res = await fetch(`${host}${target}`, {
    method: "GET",
    headers: {
      "Client-Id": clientId, "Request-Id": requestId,
      "Request-Timestamp": timestamp, Signature: signature,
    },
  });
  const teks = await res.text();
  if (!res.ok) return { lunas: false, gagal: false, dibayar: 0, mentah: `HTTP ${res.status}: ${teks.slice(0, 200)}` };
  let j: Record<string, any> = {};
  try { j = JSON.parse(teks); } catch { /* jawaban bukan JSON */ }
  const t = j?.transaction ?? j?.response?.transaction ?? {};
  const o = j?.order ?? j?.response?.order ?? {};
  const st = String(t?.status ?? j?.status ?? "").toUpperCase().trim();
  return {
    lunas: st === "SUCCESS" || st === "PAID" || st === "SETTLEMENT",
    gagal: ["FAILED", "EXPIRED", "CANCELLED", "CANCELED", "REFUNDED", "VOID"].includes(st),
    dibayar: Math.round(Number(o?.amount ?? t?.amount ?? 0)),
    mentah: st || teks.slice(0, 120),
  };
}

/** Nomor urut & jam ditentukan server, sama seperti pintu kasir/tamu. */
async function tulisKejadian(db: ReturnType<typeof createClient>, id: string, act: unknown) {
  const { data: dunia } = await db.from("venue_world").select("genesis_at").eq("one_row", true).maybeSingle();
  const genesis = Number(dunia?.genesis_at ?? 0);
  const { data: terakhir } = await db.from("venue_events")
    .select("at_ms").eq("genesis_at", genesis).order("at_ms", { ascending: false }).limit(1).maybeSingle();
  const at = Math.max(Date.now(), Number(terakhir?.at_ms ?? 0) + 1);
  const { error } = await db.from("venue_events")
    .insert({ id, at_ms: at, by_staff: null, act, genesis_at: genesis });
  // Kiriman ganda: id yang sama sudah ada → bukan galat.
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("metode tidak didukung", { status: 405, headers: CORS });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const mentah = await req.text();
  let body: Record<string, any> = {};
  try { body = JSON.parse(mentah); } catch { /* badan kosong: boleh, asal ada ref */ }

  // Ref bisa datang dari aplikasi ({ ref }) atau dari notifikasi gateway.
  const ref = String(
    body.ref ?? body?.order?.invoice_number ?? body.invoice ?? body.order_id ?? "",
  ).trim();
  if (!ref) return new Response("ref kosong", { status: 400, headers: CORS });

  const { data: tagihan } = await db.from("payment_charges").select("*").eq("ref", ref).maybeSingle();
  if (!tagihan) return new Response("tagihan tidak dikenal", { status: 404, headers: CORS });
  if (tagihan.status === "lunas") {
    return new Response(JSON.stringify({ status: "lunas" }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  let lunas = false, gagal = false, dibayar = 0, catatan = "";

  if (tagihan.provider === "midtrans") {
    const midtransKey = Deno.env.get("MIDTRANS_SERVER_KEY") ?? "";
    if (body.signature_key && midtransKey) {
      const hitung = await sha512(`${ref}${body.status_code}${body.gross_amount}${midtransKey}`);
      if (hitung !== String(body.signature_key)) {
        return new Response("tanda tangan tidak cocok", { status: 401, headers: CORS });
      }
      const st = String(body.transaction_status ?? "");
      lunas = st === "settlement" || (st === "capture" && String(body.fraud_status ?? "accept") === "accept");
      gagal = ["deny", "cancel", "expire", "failure"].includes(st);
      dibayar = Math.round(Number(body.gross_amount ?? 0));
    } else {
      return new Response("notifikasi midtrans tanpa tanda tangan", { status: 401, headers: CORS });
    }
  } else {
    // DOKU: SELALU tanya ke gateway, siapa pun yang memanggil kita.
    const cek = await statusDiDoku(ref);
    lunas = cek.lunas; gagal = cek.gagal; dibayar = cek.dibayar || Number(tagihan.amount);
    catatan = cek.mentah;
  }

  if (gagal) {
    await db.from("payment_charges").update({ status: "gagal" }).eq("ref", ref);
    return new Response(JSON.stringify({ status: "gagal", catatan }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }
  if (!lunas) {
    return new Response(JSON.stringify({ status: "menunggu", catatan }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Nominal yang ditulis ke jejak = yang BENAR-BENAR dibayar menurut gateway.
  const act = structuredClone(tagihan.act) as Record<string, unknown> | null;
  if (act) {
    if (act.t === "confirmOnline" && act.session && typeof act.session === "object") {
      (act.session as Record<string, unknown>).paidOnline = dibayar;
    } else if (act.t === "guestOrder" && act.order && typeof act.order === "object") {
      (act.order as Record<string, unknown>).paidOnline = dibayar;
      (act.order as Record<string, unknown>).pay = "online";
    }
  }

  const eventId = `bayar:${ref}`;
  if (act) {
    try {
      await tulisKejadian(db, eventId, act);
    } catch (e) {
      return new Response(`gagal menulis kejadian: ${e instanceof Error ? e.message : e}`, { status: 500, headers: CORS });
    }

    if (tagihan.kode) {
      try {
        if (act.t === "confirmOnline" && act.session) {
          await db.from("public_status").upsert({
            code: tagihan.kode,
            data: { code: tagihan.kode, kind: "sesi", session: act.session },
            updated_at: new Date().toISOString(),
          });
        } else if (act.t === "guestOrder" && act.order) {
          await db.from("public_status").upsert({
            code: tagihan.kode,
            data: { code: tagihan.kode, kind: "pesanan", order: act.order },
            updated_at: new Date().toISOString(),
          });
        }
      } catch { /* tidak fatal */ }
    }

    const phone = String(
      (act.session as Record<string, unknown> | undefined)?.phone ??
      (act.order as Record<string, unknown> | undefined)?.phone ?? ""
    ).trim();
    if (phone && tagihan.kode) {
      try {
        await db.from("member_bookings").upsert({
          phone, code: tagihan.kode, ref_id: ref,
          kind: act.t === "guestOrder" ? "pesanan" : "booking",
          created_at: new Date().toISOString(),
        });
      } catch { /* tidak fatal */ }
    }
  }
  await db.from("payment_charges")
    .update({ status: "lunas", paid_at: new Date().toISOString(), ...(act ? { event_id: eventId } : {}) })
    .eq("ref", ref);

  return new Response(JSON.stringify({ status: "lunas", dibayar }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
