/* ═══════════════════════════════════════════════════════════════════
   PERBAIKAN AUDIT 7 NOV 2026: VOID MENAHAN BAYAR, PIN 4 ANGKA

   Tiap aturan diuji dua kali: sesudah tanggal berlakunya, dan sebelum tanggal
   itu. Yang kedua sama pentingnya, karena seluruh keadaan venue dihitung ulang
   dari jejak. Tab yang sudah ditutup minggu lalu tidak boleh berubah hanya
   karena aturannya sekarang lebih ketat.
   ═══════════════════════════════════════════════════════════════════ */
import {
  replay, itemOf, voidMenungguSesi, VOID_MENAHAN_BAYAR, PIN_EMPAT_ANGKA,
  type Action, type Entry, type Genesis,
} from "../src/lib/engine";
import { dariWib } from "../src/lib/occupancy";
import { EMPLOYEES } from "../src/data/staff";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const NASGOR = "fr-01";

/** Satu hari di tanggal tertentu, dengan kasir membuka meja dan memesan satu barang. */
function dunia(y: number, m: number, d: number) {
  const jam = (h: number, mnt = 0) => dariWib(y, m, d, h, mnt);
  const genesis: Genesis = { at: jam(5), seed: false };
  let n = 0;
  const entries: Entry[] = [];
  const push = (at: number, act: Action, by = "u-rian") =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by, act });
  const st = () => replay(genesis, entries);
  push(jam(11), { t: "openShift", openingCash: 0 });
  push(jam(18), { t: "walkin", tableId: "T01", guest: "Andi" });
  const id = `w-T01-${entries[entries.length - 1].id}-1`;
  const it = itemOf(st(), NASGOR)!;
  push(jam(18, 5), {
    t: "addFnb", sessionId: id, name: it.name, station: it.station,
    line: { key: "b1", itemId: NASGOR, qty: 1, unitPrice: it.price, name: it.name, station: it.station },
  });
  const ajukan = () => push(jam(18, 10), {
    t: "requestVoid", req: { targetKind: "item", targetId: `${id}|b1`, label: "", amount: 0, reason: "Salah input" },
  });
  return { jam, push, st, id, ajukan, statusTab: () => st().sessions.find((x) => x.id === id)!.status };
}

console.log("-- Tanggal aturan --");
t("aturan void berlaku 8 Nov 2026 pukul 05.00", VOID_MENAHAN_BAYAR, dariWib(2026, 11, 8, 5));
t("aturan PIN berlaku 8 Nov 2026 pukul 05.00", PIN_EMPAT_ANGKA, dariWib(2026, 11, 8, 5));

console.log("-- Void menunggu menahan pembayaran --");
{
  const d = dunia(2026, 12, 1);
  d.ajukan();
  t("void tercatat menunggu", voidMenungguSesi(d.st(), d.id).length, 1);
  d.push(d.jam(19), { t: "settle", id: d.id, channel: "cash" });
  t("tutup tab ditolak", d.statusTab(), "running");
  d.push(d.jam(19, 1), { t: "paySplit", id: d.id, channel: "cash", amount: 1_000 });
  t("bayar sebagian ditolak", (d.st().sessions.find((x) => x.id === d.id)!.payments ?? []).length, 0);

  const vid = d.st().voids[0].id;
  d.push(d.jam(19, 2), { t: "decideVoid", id: vid, approve: true }, "u-manager");
  t("manager tetap bisa menyetujui", d.st().voids[0].status, "disetujui");
  t("barangnya keluar dari bill", d.st().sessions.find((x) => x.id === d.id)!.fnb.length, 0);
  d.push(d.jam(19, 3), { t: "settle", id: d.id, channel: "cash" });
  t("sesudah diputuskan tab bisa ditutup", d.statusTab(), "done");
}

console.log("-- Void ditolak juga melepas tab --");
{
  const d = dunia(2026, 12, 1);
  d.ajukan();
  d.push(d.jam(19), { t: "decideVoid", id: d.st().voids[0].id, approve: false }, "u-manager");
  d.push(d.jam(19, 1), { t: "settle", id: d.id, channel: "cash" });
  t("tab tertutup", d.statusTab(), "done");
  t("barangnya tetap di bill", d.st().sessions.find((x) => x.id === d.id)!.fnb.length, 1);
}

console.log("-- Kasir bisa menarik pengajuan kalau manager belum bisa dihubungi --");
{
  const d = dunia(2026, 12, 1);
  d.ajukan();
  d.push(d.jam(19), { t: "tarikVoid", id: d.st().voids[0].id });
  const st = d.st();
  t("tidak ada lagi yang menunggu", voidMenungguSesi(st, d.id).length, 0);
  t("tetap tersimpan di riwayat atas nama yang menarik", st.voids[0].decidedBy, "Rian (ditarik)");
  t("barangnya tetap di bill", st.sessions.find((x) => x.id === d.id)!.fnb.length, 1);
  d.push(d.jam(19, 1), { t: "settle", id: d.id, channel: "cash" });
  t("tab bisa ditutup", d.statusTab(), "done");
  const vid = d.st().voids[0].id;
  d.push(d.jam(19, 2), { t: "decideVoid", id: vid, approve: true }, "u-manager");
  t("pengajuan yang ditarik tidak bisa disetujui lagi", d.st().voids[0].decidedBy, "Rian (ditarik)");
}

console.log("-- Jejak sebelum tanggal aturan tidak berubah --");
{
  const d = dunia(2026, 11, 1);
  d.ajukan();
  d.push(d.jam(19), { t: "settle", id: d.id, channel: "cash" });
  t("tab lama yang ditutup saat void menunggu tetap tertutup", d.statusTab(), "done");
}

console.log("-- PIN harus 4 angka --");
{
  const emp = (pin: string, id = "") => ({ id, name: "Staf Baru", pin, role: "kru_kasir" as const, active: true, venue: "spl" as const });
  const pinBaru = (y: number, m: number, d: number, pin: string) => {
    const w = dunia(y, m, d);
    w.push(w.jam(19), { t: "saveEmployee", emp: emp(pin) }, "u-manager");
    return w.st().employees.some((e) => e.pin === pin);
  };
  t("PIN 4 angka diterima", pinBaru(2026, 12, 1, "4321"), true);
  t("PIN 5 angka ditolak", pinBaru(2026, 12, 1, "43210"), false);
  t("PIN 6 angka ditolak", pinBaru(2026, 12, 1, "432100"), false);
  t("PIN 3 angka ditolak", pinBaru(2026, 12, 1, "432"), false);
  t("jejak lama dengan PIN 6 angka tetap berlaku", pinBaru(2026, 11, 1, "432100"), true);

  const w = dunia(2026, 11, 1);
  w.push(w.jam(19), { t: "saveEmployee", emp: emp("432100") }, "u-manager");
  const lama = w.st().employees.find((e) => e.pin === "432100")!;
  w.push(dariWib(2026, 12, 1, 12), { t: "saveEmployee", emp: { ...lama, role: "kru_gudang" } }, "u-manager");
  t("akun lama masih bisa diubah perannya tanpa mengganti PIN",
    w.st().employees.find((e) => e.id === lama.id)!.role, "kru_gudang");
  t("PIN bawaan sudah 4 angka semua", EMPLOYEES.every((e) => /^\d{4}$/.test(e.pin)), true);
}

console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
