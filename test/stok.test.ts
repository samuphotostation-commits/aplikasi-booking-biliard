/* ═══════════════════════════════════════════════════════════════════
   TUTUP BUKU STOK HARIAN

   Layar lama mereka-reka "Awal" dengan menghitung MUNDUR dari sisa hari ini,
   jadi satu pergerakan yang hilang membuat semua hari sebelumnya salah dan
   tidak ada apa pun untuk mencocokkannya. `laporanStokHarian` menggantinya:
   stok difoto tiap melewati batas 05.00, jadi tiap baris bisa diperiksa
   sendiri — awal + masuk - terjual + kembali - susut + opname = sisa.

   Jam ditulis dalam WIB, sama seperti mesinnya, supaya tes ini juga benar
   di server yang berjalan UTC (lihat npm run test:utc).
   ═══════════════════════════════════════════════════════════════════ */
import {
  laporanStokHarian, replay, stockDateOf, type Action, type Entry, type Genesis, type StokHariBaris,
} from "../src/lib/engine";
import { dariWib, tanggalWib } from "../src/lib/occupancy";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const HARI = 86_400_000;
const [Y, M, D] = tanggalWib(Date.now()).split("-").map(Number);
/** Jam WIB pada hari ini + `geser` hari. */
const jam = (geser: number, h: number, m = 0) => dariWib(Y, M, D, h, m) + geser * HARI;

const TEH = "cd-01";          // Ice Tea, stok awal 120
const KENTANG = "lb-04";      // Kentang Goreng, stok awal 60

function dunia() {
  const genesis: Genesis = { at: jam(-4, 5), seed: false };
  let n = 0;
  const entries: Entry[] = [];
  const push = (at: number, act: Action) =>
    entries.push({ id: `e${String(++n).padStart(4, "0")}`, at, by: "u-manager", act });
  return { genesis, entries, push };
}

/** Jual `qty` barang lewat jalur nyata: buka meja → pesan → tutup tab. */
function jualkan(
  d: { genesis: Genesis; entries: Entry[]; push: (at: number, act: Action) => void },
  geser: number, h: number, tableId: string, itemId: string, qty: number,
) {
  d.push(jam(geser, h - 1), { t: "openShift", openingCash: 500_000 });
  d.push(jam(geser, h), { t: "walkin", tableId, guest: `Tamu ${tableId} ${geser}` });
  // Id sesi ditentukan mesin dari id kejadian walkin-nya.
  const id = `w-${tableId}-${d.entries[d.entries.length - 1].id}-1`;
  d.push(jam(geser, h, 10), {
    t: "addFnb", sessionId: id, name: "x", station: "bar",
    line: { key: `k-${tableId}-${geser}`, itemId, qty },
  });
  d.push(jam(geser, h, 50), { t: "settle", id, channel: "cash" });
}

const cari = (baris: StokHariBaris[] | undefined, itemId: string) =>
  baris?.find((x) => x.itemId === itemId);

console.log("-- Tiga hari berjualan: tiap hari berdiri sendiri --");
{
  const d = dunia();
  jualkan(d, -2, 20, "T30", TEH, 3);
  jualkan(d, -1, 20, "T30", TEH, 5);
  jualkan(d, 0, 20, "T30", TEH, 2);
  const lap = laporanStokHarian(d.genesis, d.entries);
  const h = (g: number) => cari(lap[stockDateOf(jam(g, 12))], TEH);
  t("hari -2: 120 → jual 3 → 117", [h(-2)?.awal, h(-2)?.terjual, h(-2)?.sisa], [120, 3, 117]);
  t("hari -1: awal ikut sisa kemarin", [h(-1)?.awal, h(-1)?.terjual, h(-1)?.sisa], [117, 5, 112]);
  t("hari ini: awal ikut sisa kemarin", [h(0)?.awal, h(0)?.terjual, h(0)?.sisa], [112, 2, 110]);
}

console.log("\n-- Hari tanpa jualan tetap punya baris --");
{
  const d = dunia();
  jualkan(d, -3, 20, "T30", TEH, 4);
  jualkan(d, 0, 20, "T30", TEH, 1);
  const lap = laporanStokHarian(d.genesis, d.entries);
  const kosong = cari(lap[stockDateOf(jam(-1, 12))], TEH);
  t("hari kosong ada di laporan", !!kosong, true);
  t("hari kosong: tidak ada pergerakan, awal = sisa",
    [kosong?.awal, kosong?.terjual, kosong?.sisa], [116, 0, 116]);
}

console.log("\n-- Batas hari stok jam 05.00, bukan tengah malam --");
{
  const d = dunia();
  d.push(jam(0, 4), { t: "addStock", itemId: TEH, delta: 10 });   // 04.00 -> masih hari stok kemarin
  d.push(jam(0, 6), { t: "addStock", itemId: TEH, delta: 5 });    // 06.00 -> sudah hari stok baru
  const lap = laporanStokHarian(d.genesis, d.entries);
  const kemarin = cari(lap[stockDateOf(jam(-1, 12))], TEH);
  const iniHari = cari(lap[stockDateOf(jam(0, 12))], TEH);
  t("barang masuk jam 04.00 masuk hari stok kemarin", kemarin?.masuk, 10);
  t("barang masuk jam 06.00 masuk hari stok hari ini", iniHari?.masuk, 5);
  t("sisa kemarin menyambung jadi awal hari ini", [kemarin?.sisa, iniHari?.awal], [130, 130]);
}

console.log("\n-- Sesi di-void: barangnya kembali ke stok --");
{
  const d = dunia();
  d.push(jam(0, 18), { t: "openShift", openingCash: 500_000 });
  d.push(jam(0, 19), { t: "walkin", tableId: "T29", guest: "Tamu void" });
  const id = `w-T29-${d.entries[d.entries.length - 1].id}-1`;
  d.push(jam(0, 19, 5), {
    t: "addFnb", sessionId: id, name: "x", station: "bar",
    line: { key: "kv", itemId: TEH, qty: 7 },
  });
  t("terjual dulu 7", cari(laporanStokHarian(d.genesis, d.entries)[stockDateOf(jam(0, 12))], TEH)?.terjual, 7);

  d.push(jam(0, 19, 30), {
    t: "requestVoid", req: { targetKind: "sesi", targetId: id, reason: "tamu batal" },
  });
  const voidId = replay(d.genesis, d.entries).voids[0]?.id;
  t("permintaan void tercatat", typeof voidId, "string");
  d.push(jam(0, 19, 40), { t: "decideVoid", id: voidId, approve: true });

  const x = cari(laporanStokHarian(d.genesis, d.entries)[stockDateOf(jam(0, 12))], TEH);
  t("barang kembali ke stok", x?.kembali, 7);
  t("terjual tetap tercatat, bukan dihapus", x?.terjual, 7);
  t("sisa kembali seperti semula", [x?.awal, x?.sisa], [120, 120]);
}

console.log("\n-- Tiap baris harus bisa diperiksa sendiri --");
{
  const d = dunia();
  jualkan(d, -2, 20, "T30", TEH, 3);
  jualkan(d, -1, 21, "T29", KENTANG, 8);
  d.push(jam(-1, 9), { t: "addStock", itemId: TEH, delta: 12 });
  d.push(jam(0, 9), { t: "stockCount", counts: [{ itemId: TEH, qty: 100 }, { itemId: KENTANG, qty: 40 }] });
  jualkan(d, 0, 20, "T30", TEH, 4);
  const lap = laporanStokHarian(d.genesis, d.entries);
  let cocok = 0, periksa = 0;
  for (const hari of Object.keys(lap)) {
    for (const x of lap[hari]) {
      if (x.awal === null || x.sisa === null) continue;
      periksa++;
      if (x.awal + x.masuk - x.terjual + x.kembali - x.susut + x.opname === x.sisa) cocok++;
      else console.log(`    tidak cocok ${hari} ${x.itemId}: ${JSON.stringify(x)}`);
    }
  }
  t(`semua ${periksa} baris cocok: awal + masuk - terjual + kembali - susut + opname = sisa`, cocok, periksa);
  t("ada yang diperiksa", periksa > 20, true);
}

console.log("\n-- Rentang: hanya hari yang diminta yang dikembalikan --");
{
  const d = dunia();
  jualkan(d, -3, 20, "T30", TEH, 1);
  jualkan(d, 0, 20, "T30", TEH, 1);
  const dari = stockDateOf(jam(-1, 12));
  const lap = laporanStokHarian(d.genesis, d.entries, dari);
  t("hari sebelum rentang tidak ikut", lap[stockDateOf(jam(-3, 12))], undefined);
  t("hari pertama rentang ada", !!lap[dari], true);
  t("awal hari pertama rentang tetap benar (jejak lama tetap diputar)",
    cari(lap[dari], TEH)?.awal, 119);
}

console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
