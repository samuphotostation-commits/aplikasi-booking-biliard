/**
 * Satu perintah untuk merakit aplikasi: `npm run app`
 *   1. vite build
 *   2. scripts/build-web.mjs → folder web/ (index.html + manifest + sw + ikon)
 * Lanjutkan dengan `npm run app:win` untuk membuat installer Windows.
 */
import { execFileSync } from "node:child_process";

const jalan = (cmd, args) =>
  execFileSync(cmd, args, { stdio: "inherit", shell: true });

jalan("npx", ["vite", "build"]);
jalan("node", ["scripts/build-web.mjs"]);
