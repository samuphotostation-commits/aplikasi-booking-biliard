/**
 * Menerbitkan kedua situs ke Cloudflare Pages.
 *
 * Dipakai sesudah `npm run app` (staf) dan build tamu. Pertama kali dijalankan,
 * wrangler membuka browser sekali untuk minta izin akun Cloudflare — tekan
 * "Allow", sesudah itu tidak ditanya lagi.
 *
 *   npm run terbitkan
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const situs = [
  { folder: "web", project: "spl-kasir" },
  { folder: "web-tamu", project: "spl-tamu" },
];

for (const { folder, project } of situs) {
  if (!existsSync(folder)) {
    console.error(`Folder ${folder} belum ada — jalankan dulu:
  npm run app
  VITE_MODE_TAMU=1 WEB_OUT=web-tamu npm run app`);
    process.exit(1);
  }
  console.log(`\n=== ${project} (${folder}) ===`);
  execFileSync("npx", ["wrangler", "pages", "deploy", folder,
    "--project-name", project, "--branch", "main", "--commit-dirty=true"],
    { stdio: "inherit", shell: true });
}
console.log("\nSelesai. https://spl-kasir.pages.dev · https://spl-tamu.pages.dev");
