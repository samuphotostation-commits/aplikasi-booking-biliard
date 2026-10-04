/**
 * Menjalankan seluruh suite SEOLAH-OLAH di server: zona waktu UTC.
 *
 * Kenapa perlu: mesin venue pernah memakai waktu LOKAL perangkat, dan itu
 * lolos semua tes — karena yang menguji kebetulan disetel WIB. Begitu mesin
 * yang sama jalan di Supabase Edge (UTC), jam booking bergeser 7 jam, hold
 * ditolak "di luar jam operasional", dan ringkasan untuk HP pelanggan terbit
 * kosong. Sekarang zona dikunci ke WIB di src/lib/occupancy.ts — dan perintah
 * ini yang menjaga supaya tidak pelan-pelan balik lagi.
 *
 *   npm run test:utc
 */
import { execFileSync } from "node:child_process";

execFileSync("npm", ["test"], { stdio: "inherit", shell: true, env: { ...process.env, TZ: "UTC" } });
