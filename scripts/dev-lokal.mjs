/**
 * Server pengembangan MODE LOKAL.
 *
 * `npm run dev` biasa membaca .env.local, jadi aplikasinya tersambung ke Supabase
 * venue yang SUNGGUHAN — tidak boleh dipakai untuk coba-coba fitur. Skrip ini
 * mengosongkan dua variabel itu supaya aplikasi berjalan dengan data di browser
 * saja (localStorage), persis mode lokal yang diuji `npm test`.
 */
import { spawn } from "node:child_process";

const env = { ...process.env, VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", VITE_SHOW_DEMO_PINS: "true" };
const bin = "node_modules/vite/bin/vite.js";
const vite = spawn(process.execPath, [bin, "--port", "5174", "--strictPort"], { stdio: "inherit", env });
vite.on("exit", (kode) => process.exit(kode ?? 0));
