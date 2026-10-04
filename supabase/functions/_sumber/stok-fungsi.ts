/* ═══════════════════════════════════════════════════════════════════
   SPL — PINTU MASUK FUNGSI `stok-tutup` (sumber, sebelum dibundel)

   Pembungkus saja: bikin klien database dengan hak server, lalu serahkan ke
   `jalankan()` yang memutar ulang jejak venue dan menyimpan tutup buku stok
   harian. Lihat ./stok.ts untuk alasannya.

   Dibundel jadi satu berkas oleh `node scripts/bundel-terbit.mjs` karena
   bundler Supabase menolak import dari domain kita sendiri.
   ═══════════════════════════════════════════════════════════════════ */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jalankan } from "./stok.ts";

Deno.serve(async (req) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return await jalankan(db, req);
});
