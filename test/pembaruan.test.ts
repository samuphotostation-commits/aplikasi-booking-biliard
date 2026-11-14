/* Tautan unduh aplikasi di tab Atur (14 Nov 2026). */
import { replay, validAction, type Action, type Entry, type Genesis } from "../src/lib/engine";
import { dariWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};
const jam = (h: number, m = 0) => dariWib(2026, 11, 11, h, m);

function dunia() {
  const genesis: Genesis = { at: jam(5), seed: false };
  const entries: Entry[] = [];
  let n = 0;
  const push = (at: number, act: Action, by = "u-manager") =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
  return { push, st: () => replay(genesis, entries) };
}

const DRIVE = "https://drive.google.com/file/d/abc/view";

console.log("\n-- Tautan unduh aplikasi --");
{
  const d = dunia();
  t("awal: belum ada tautan", d.st().tautanUnduh, undefined);
  d.push(jam(12), { t: "setTautanUnduh", windows: `  ${DRIVE} `, android: "" });
  t("tautan Windows tersimpan (dirapikan)", d.st().tautanUnduh, { windows: DRIVE });
  d.push(jam(12, 1), { t: "setTautanUnduh", windows: "http://tidak-aman.com/x.exe", android: "" });
  t("http (tanpa s) ditolak", d.st().tautanUnduh, { windows: DRIVE });
  d.push(jam(12, 2), { t: "setTautanUnduh", windows: "javascript:alert(1)", android: "" });
  t("javascript: ditolak", d.st().tautanUnduh, { windows: DRIVE });
  d.push(jam(12, 3), { t: "setTautanUnduh", windows: DRIVE, android: "https://contoh.com/a.apk" });
  t("tautan Android ikut", d.st().tautanUnduh?.android, "https://contoh.com/a.apk");
  d.push(jam(12, 4), { t: "setTautanUnduh", windows: "", android: "" });
  t("dikosongkan = dihapus", d.st().tautanUnduh, {});
  d.push(jam(12, 5), { t: "setTautanUnduh", windows: DRIVE, android: "" }, "u-rian");
  t("kru kasir tidak boleh mengubah", d.st().tautanUnduh, {});
  t("bentuk aksi sah", validAction({ t: "setTautanUnduh", windows: DRIVE, android: "" }), true);
  t("bentuk tanpa android tidak sah", validAction({ t: "setTautanUnduh", windows: DRIVE }), false);
}

console.log(`\n${total - bad}/${total} lulus`);
if (bad) process.exit(1);
