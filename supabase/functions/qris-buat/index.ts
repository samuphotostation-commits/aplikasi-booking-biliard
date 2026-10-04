/* ═══════════════════════════════════════════════════════════════════
   SPL — MEMBUAT QRIS DINAMIS  (Supabase Edge Function)

   HP tamu memanggil fungsi ini untuk meminta QR pembayaran. SECRET KEY
   gateway hanya ada di sini (environment variable), tidak pernah ikut ke
   HP maupun ke bundel web.

   Pasang secret-nya (pilih salah satu gateway):
     Midtrans : MIDTRANS_SERVER_KEY = Mid-server-xxxxxxxx
                MIDTRANS_PRODUKSI   = 1   (kosongkan untuk sandbox)
     DOKU     : DOKU_CLIENT_ID      = BRN-xxxx
                DOKU_SECRET_KEY     = SK-xxxx
                DOKU_PRODUKSI       = 1   (kosongkan untuk sandbox)

   Catatan DOKU: yang dipakai API Checkout (/checkout/v1/payment) — protokol
   yang SUDAH TERBUKTI jalan di akun DOKU pemilik (dipakai aplikasi photobooth
   miliknya). Hasilnya halaman pembayaran DOKU; di produksi halaman itu dikunci
   ke QRIS supaya tamu langsung melihat QR. Sandbox DOKU tidak bisa mengaktifkan
   QRIS, jadi di sandbox semua metode dibiarkan tampil — cukup untuk simulasi
   alur uangnya (tagihan dibuat → dibayar → webhook → jejak venue).

   Tanpa secret itu fungsi menjawab { belumAktif: true } dan aplikasi
   otomatis kembali memakai "bayar di kasir".

   Badan permintaan:
     { kode, amount, ringkas, act }
       kode    : kode booking/pesanan milik tamu (untuk dicocokkan)
       amount  : rupiah bulat yang harus dibayar
       ringkas : keterangan singkat untuk struk gateway
       act     : AKSI VENUE yang akan ditulis ke jejak saat pembayaran lunas
                 (mis. { t: "confirmOnline", session: {...} })
       uji     : true = TAGIHAN UJI COBA. Dipakai pemilik untuk memastikan
                 sambungan gateway benar-benar jalan. Tagihannya nyata di
                 gateway, tapi `act` dikosongkan sehingga pembayarannya TIDAK
                 pernah menulis apa pun ke jejak venue.
   ═══════════════════════════════════════════════════════════════════ */
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Aksi venue yang boleh dirilis lewat pembayaran. Selain ini ditolak. */
const AKSI_BOLEH = new Set(["confirmOnline", "guestOrder"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "metode tidak didukung" }, 405);

  const midtransKey = Deno.env.get("MIDTRANS_SERVER_KEY") ?? "";
  const dokuId = Deno.env.get("DOKU_CLIENT_ID") ?? "";
  const dokuSecret = Deno.env.get("DOKU_SECRET_KEY") ?? "";
  const provider = midtransKey ? "midtrans" : (dokuId && dokuSecret ? "doku" : "");
  if (!provider) return json({ belumAktif: true, pesan: "QRIS belum dikonfigurasi — pembayaran di kasir." });

  let body: {
    kode?: string; amount?: number; ringkas?: string; act?: { t?: string };
    uji?: boolean; kasir?: boolean; cek?: boolean; ref?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "badan permintaan tidak sah" }, 400); }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ── Pengecekan status langsung ke gateway (fallback bila webhook terlambat) ──
  if (body.cek === true && body.ref) {
    const cekRef = String(body.ref).trim();
    const { data: row } = await db.from("payment_charges").select("*").eq("ref", cekRef).maybeSingle();
    if (!row) return json({ status: "tidak-ada" });
    if (row.status === "lunas") return json({ status: "lunas", dibayar: row.amount });

    // Jika masih "menunggu", tanya langsung ke gateway
    let stGateway = "";
    let nominalGateway = 0;
    try {
      if (row.provider === "doku" && dokuId && dokuSecret) {
        const produksi = !!Deno.env.get("DOKU_PRODUKSI");
        const host = produksi ? "https://api.doku.com" : "https://api-sandbox.doku.com";
        const path = `/orders/v1/status/${encodeURIComponent(cekRef)}`;
        const requestId = crypto.randomUUID();
        const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
        const komponen =
          `Client-Id:${dokuId}\n` +
          `Request-Id:${requestId}\n` +
          `Request-Timestamp:${timestamp}\n` +
          `Request-Target:${path}`;
        const kunci = await crypto.subtle.importKey(
          "raw", new TextEncoder().encode(dokuSecret),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
        );
        const tanda = btoa(String.fromCharCode(...new Uint8Array(
          await crypto.subtle.sign("HMAC", kunci, new TextEncoder().encode(komponen)),
        )));
        const res = await fetch(`${host}${path}`, {
          method: "GET",
          headers: {
            "Client-Id": dokuId,
            "Request-Id": requestId,
            "Request-Timestamp": timestamp,
            Signature: `HMACSHA256=${tanda}`,
          },
        });
        if (res.ok) {
          const dt = await res.json().catch(() => ({}));
          const txStatus = String(dt?.transaction?.status ?? dt?.status ?? "").toUpperCase();
          stGateway = txStatus;
          nominalGateway = Math.round(Number(dt?.order?.amount ?? dt?.transaction?.amount ?? row.amount));
        }
      } else if (row.provider === "midtrans" && midtransKey) {
        const host = Deno.env.get("MIDTRANS_PRODUKSI")
          ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
        const res = await fetch(`${host}/v2/${encodeURIComponent(cekRef)}/status`, {
          headers: { Authorization: `Basic ${btoa(`${midtransKey}:`)}` },
        });
        if (res.ok) {
          const dt = await res.json().catch(() => ({}));
          stGateway = String(dt?.transaction_status ?? "").toLowerCase();
          nominalGateway = Math.round(Number(dt?.gross_amount ?? row.amount));
        }
      }
    } catch { /* jika gagal koneksi gateway, kembalikan status database */ }

    const isLunas = stGateway === "SUCCESS" || stGateway === "PAID" || stGateway === "SETTLEMENT" || stGateway === "settlement" || stGateway === "capture";
    if (isLunas) {
      const dibayar = nominalGateway || row.amount;
      if (row.act) {
        const act = structuredClone(row.act) as Record<string, unknown>;
        if (act.t === "confirmOnline" && act.session && typeof act.session === "object") {
          (act.session as Record<string, unknown>).paidOnline = dibayar;
        } else if (act.t === "guestOrder" && act.order && typeof act.order === "object") {
          (act.order as Record<string, unknown>).paidOnline = dibayar;
          (act.order as Record<string, unknown>).pay = "online";
        }
        const eventId = `bayar:${cekRef}`;
        try {
          const { data: dunia } = await db.from("venue_world").select("genesis_at").eq("one_row", true).maybeSingle();
          const genesis = Number(dunia?.genesis_at ?? 0);
          const { data: terakhir } = await db.from("venue_events")
            .select("at_ms").eq("genesis_at", genesis).order("at_ms", { ascending: false }).limit(1).maybeSingle();
          const at = Math.max(Date.now(), Number(terakhir?.at_ms ?? 0) + 1);
          await db.from("venue_events").insert({ id: eventId, at_ms: at, by_staff: null, act, genesis_at: genesis });
        } catch { /* abaikan jika sudah ada */ }

        if (row.kode) {
          try {
            if (act.t === "confirmOnline" && act.session) {
              await db.from("public_status").upsert({
                code: row.kode,
                data: { code: row.kode, kind: "sesi", session: act.session },
                updated_at: new Date().toISOString(),
              });
            } else if (act.t === "guestOrder" && act.order) {
              await db.from("public_status").upsert({
                code: row.kode,
                data: { code: row.kode, kind: "pesanan", order: act.order },
                updated_at: new Date().toISOString(),
              });
            }
          } catch { /* tidak fatal */ }
        }

        const phone = String(
          ((act as Record<string, unknown>).session as Record<string, unknown> | undefined)?.phone ??
          ((act as Record<string, unknown>).order as Record<string, unknown> | undefined)?.phone ?? ""
        ).trim();
        if (phone && row.kode) {
          try {
            await db.from("member_bookings").upsert({
              phone, code: row.kode, ref_id: cekRef,
              kind: (act as Record<string, unknown>).t === "guestOrder" ? "pesanan" : "booking",
              created_at: new Date().toISOString(),
            });
          } catch { /* tidak fatal */ }
        }
      }
      await db.from("payment_charges")
        .update({ status: "lunas", paid_at: new Date().toISOString() })
        .eq("ref", cekRef);
      return json({ status: "lunas", dibayar });
    }

    return json({ status: row.status });
  }

  // Uji coba pemilik: tagihan sungguhan di gateway, tapi tanpa aksi venue.
  const uji = body.uji === true;
  // QRIS DI MEJA KASIR: tamu bayar di depan kasir, jadi tagihannya juga tanpa aksi
  // venue — yang menutup tab tetap kasir dari layarnya sendiri (aksi uang tidak
  // boleh lewat pintu ini). Fungsi ini cuma menyediakan QR dengan nominal tepat,
  // menggantikan stiker QR statis yang nominalnya harus diketik manual.
  const kasir = body.kasir === true;
  const kode = uji ? `UJI-${Date.now().toString(36).toUpperCase()}`
    // Kasir menitipkan kodenya sendiri (mis. nomor meja) supaya tagihan ini
    // bisa dilacak balik ke tab mana saat rekonsiliasi. Tanpa itu, yang
    // tercatat cuma jam pembuatannya dan tidak ada yang bisa dicocokkan.
    : kasir ? `KASIR-${String(body.kode ?? "").trim().slice(0, 20) || Date.now().toString(36).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-4)}`
    : String(body.kode ?? "").trim();
  const amount = uji ? Math.min(Math.max(Math.round(Number(body.amount ?? 1000)), 1000), 50_000)
    : Math.round(Number(body.amount ?? 0));
  const act = (uji || kasir) ? null : body.act;
  if (kode.length < 4 || kode.length > 40) return json({ error: "kode tidak sah" }, 400);
  if (!(amount > 0) || amount > 50_000_000) return json({ error: "nominal tidak sah" }, 400);
  if (!uji && !kasir && (!act || typeof act !== "object" || !AKSI_BOLEH.has(String(act.t)))) {
    return json({ error: "aksi tidak diizinkan" }, 400);
  }

  // Satu kode = satu tagihan aktif. Kalau tamu membuka ulang halaman bayar,
  // QR yang sama dipakai lagi supaya tidak ada dua tagihan untuk satu booking.
  const { data: lama } = await db.from("payment_charges")
    .select("*").eq("kode", kode).eq("status", "menunggu")
    .gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
  if (lama && lama.amount === amount) {
    return json({
      ref: lama.ref, qrString: lama.qr_string,
      qrUrl: lama.provider === "doku" ? null : lama.qr_url,
      bayarUrl: lama.provider === "doku" ? lama.qr_url : null,
      provider: lama.provider, expiresAt: Date.parse(lama.expires_at),
    });
  }

  const ref = `SPL-${kode}-${Date.now().toString(36).toUpperCase()}`;
  const kedaluwarsa = new Date(Date.now() + 15 * 60_000);
  let qrString: string | null = null;
  let qrUrl: string | null = null;
  /** DOKU: halaman pembayaran yang harus DIBUKA tamu (bukan gambar QR). */
  let bayarUrl: string | null = null;

  try {
    if (provider === "midtrans") {
      const host = Deno.env.get("MIDTRANS_PRODUKSI")
        ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
      const res = await fetch(`${host}/v2/charge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${btoa(`${midtransKey}:`)}`,
        },
        body: JSON.stringify({
          payment_type: "qris",
          transaction_details: { order_id: ref, gross_amount: amount },
          qris: { acquirer: "gopay" },
          custom_expiry: { expiry_duration: 15, unit: "minute" },
          item_details: [{ id: kode, price: amount, quantity: 1, name: (body.ringkas ?? "SPL").slice(0, 50) }],
        }),
      });
      const hasil = await res.json();
      if (!res.ok || !["201", "200"].includes(String(hasil.status_code ?? ""))) {
        return json({ error: `gateway menolak: ${hasil.status_message ?? res.status}` }, 502);
      }
      qrString = hasil.qr_string ?? null;
      qrUrl = (hasil.actions ?? []).find((a: { name: string }) => a.name === "generate-qr-code")?.url ?? null;
    } else {
      // ── DOKU Checkout (halaman bayar; di produksi dikunci ke QRIS) ──
      const produksi = !!Deno.env.get("DOKU_PRODUKSI");
      const host = produksi ? "https://api.doku.com" : "https://api-sandbox.doku.com";
      const path = "/checkout/v1/payment";
      const requestId = crypto.randomUUID();
      const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const webhook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/qris-webhook`;
      const payload = JSON.stringify({
        order: { invoice_number: ref, amount, callback_url: webhook },
        payment: {
          payment_due_date: 15,
          ...(produksi ? { payment_method_types: ["QRIS"] } : {}),
        },
        customer: { id: kode.slice(0, 40), name: (body.ringkas ?? "Tamu SPL").slice(0, 50) },
        notification: { url: webhook },
      });
      const digest = btoa(String.fromCharCode(...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)),
      )));
      const komponen =
        `Client-Id:${dokuId}\n` +
        `Request-Id:${requestId}\n` +
        `Request-Timestamp:${timestamp}\n` +
        `Request-Target:${path}\n` +
        `Digest:${digest}`;
      const kunci = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(dokuSecret),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
      );
      const tanda = btoa(String.fromCharCode(...new Uint8Array(
        await crypto.subtle.sign("HMAC", kunci, new TextEncoder().encode(komponen)),
      )));
      const res = await fetch(`${host}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Id": dokuId,
          "Request-Id": requestId,
          "Request-Timestamp": timestamp,
          Signature: `HMACSHA256=${tanda}`,
        },
        body: payload,
      });
      const hasil = await res.json().catch(() => ({}));
      if (!res.ok) {
        const pesan = hasil?.error?.message ?? hasil?.message ?? `HTTP ${res.status}`;
        return json({ error: `gateway menolak: ${pesan}` }, 502);
      }
      // Checkout menjawab halaman bayar.
      const halaman = hasil?.response?.payment?.url ?? hasil?.payment?.url ?? null;
      if (!halaman) return json({ error: "DOKU tidak mengirim halaman pembayaran" }, 502);

      // Lalu AMBIL ISI QRIS-nya supaya tamu bisa scan langsung di layar SPL,
      // tanpa pindah ke halaman DOKU. Cara ini dipakai juga oleh aplikasi
      // photobooth pemilik dan sudah terbukti jalan di akun DOKU yang sama.
      const token = halaman.split("/").pop() ?? "";
      const checkoutHost = produksi ? "https://checkout.doku.com" : "https://sandbox.doku.com";
      try {
        const qr = await fetch(`${checkoutHost}/checkout/v1/payment/${token}/generate-qris`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token_id: token }),
        });
        if (qr.ok) {
          const isi = await qr.json().catch(() => ({}));
          qrString = isi?.qr_code ?? isi?.qris?.qr_code ?? null;
        }
      } catch { /* QR langsung gagal diambil: tamu tetap bisa lewat halaman DOKU */ }

      // Halaman DOKU tetap dikirim sebagai cadangan kalau QR-nya tidak didapat.
      bayarUrl = halaman;
      qrUrl = null;
    }
  } catch (e) {
    return json({ error: `tidak bisa menghubungi gateway: ${e instanceof Error ? e.message : e}` }, 502);
  }

  if (!qrString && !qrUrl && !bayarUrl) return json({ error: "gateway tidak mengirim QR" }, 502);

  const { error } = await db.from("payment_charges").insert({
    ref, provider, kode, amount, act, qr_string: qrString, qr_url: qrUrl ?? bayarUrl,
    expires_at: kedaluwarsa.toISOString(),
  });
  if (error) return json({ error: `gagal menyimpan tagihan: ${error.message}` }, 500);
  await db.from("payment_config").update({ provider, aktif: true, updated_at: new Date().toISOString() }).eq("one_row", true);

  return json({ ref, qrString, qrUrl, bayarUrl, provider, expiresAt: kedaluwarsa.getTime() });
});
