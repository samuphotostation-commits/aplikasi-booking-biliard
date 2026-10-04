/* ═══════════════════════════════════════════════════════════════════
   SPL — PINTU MASUK FUNGSI `terbit` (sumber, sebelum dibundel)

   Isinya cuma pembungkus: bikin klien database dengan hak server, lalu
   serahkan ke `jalankan()` yang memutar ulang jejak venue dan menerbitkan
   ringkasan untuk HP pelanggan.

   KENAPA DIBUNDEL, bukan di-import dari internet: bundler Supabase MENOLAK
   import dari domain sendiri ("Cannot import from spl-kasir.pages.dev").
   Yang boleh cuma jsr:/npm:/deno.land. Jadi seluruh mesin venue ikut
   ditempel ke satu berkas oleh `node scripts/bundel-terbit.mjs`, dan
   hasilnya — `supabase/functions/terbit/index.ts` — itulah yang dipasang.
   JANGAN menyunting berkas hasil itu; sunting yang ini lalu bundel ulang.
   ═══════════════════════════════════════════════════════════════════ */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jalankan } from "./terbit.ts";

Deno.serve(async (req) => {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return await jalankan(db, req);
});
