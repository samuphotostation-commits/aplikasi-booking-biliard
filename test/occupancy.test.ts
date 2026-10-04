import * as occ from "../src/lib/occupancy";
import { freeCountAtHour } from "../src/lib/core";
import { TABLES } from "../src/data/venue";
import { MIN_LEAD_MIN } from "../src/lib/engine";
import type { LiveSession } from "../src/data/live";

const now = Date.now();
const H = 3_600_000;
const S = (id: string, tableId: string, status: LiveSession["status"], sh: number, eh: number): LiveSession => ({
  id, tableId, source: "online", guest: "X",
  startsAt: now + sh * H, endsAt: now + eh * H, status,
  fnb: [], tableAmount: 0, paidOnline: 0,
});

let bad = 0;
let total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++;
  if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const sess = [S("a", "T01", "booked", 2, 4)];
console.log("-- Anti-bentrok online vs walk-in --");
t("walk-in 1 jam sekarang (aman)", occ.tableFreeForRange(sess, "T01", now, now + 1 * H), true);
t("walk-in 3 jam (menabrak booking)", occ.tableFreeForRange(sess, "T01", now, now + 3 * H), false);
t("meja lain bebas", occ.tableFreeForRange(sess, "T02", now, now + 4 * H), true);
t("sisa menit sebelum booking", occ.minutesUntilNext(sess, "T01", now), 120);

console.log("\n-- Slot bersentuhan TIDAK bentrok (half-open) --");
// Jaminan `[)` di level paling dasar: 20-21 dan 21-22 tidak boleh saling menolak.
t("overlaps(0-2, 2-3) = false", occ.overlaps(now, now + 2 * H, now + 2 * H, now + 3 * H), false);
t("overlaps(0-2.5, 2-3) = true", occ.overlaps(now, now + 2.5 * H, now + 2 * H, now + 3 * H), true);

// Di atas itu, penjadwalan meja menambahkan buffer bersih-bersih 10 menit.
const adj = [S("b", "T03", "booked", 2, 3)];
t("sesi 0-2 persis mepet booking -> ditolak (butuh 10m bersih)",
  occ.tableFreeForRange(adj, "T03", now, now + 2 * H), false);
t("sesi 0-1.8 (sisa 12m sebelum booking) -> diterima",
  occ.tableFreeForRange(adj, "T03", now, now + 1.8 * H), true);

console.log("\n-- Penguncian jam: tidak boleh mundur dari realtime --");
// Jam & tanggal uji dibaca dalam WIB — sama seperti mesinnya. Kalau tes ini
// memakai zona mesin penguji, ia hanya lolos di perangkat yang kebetulan WIB.
const today = occ.tanggalWib(now);
const nowH = occ.diWib(now).getUTCHours();
const g = (h: number) => occ.hourBookable(today, h, today, 60, now);
console.log(`  (jam sekarang: ${nowH}.00)`);
t(`jam ${nowH - 1} sudah lewat -> ditolak`, g(nowH - 1), { ok: false, why: "lewat" });
t(`jam ${nowH} sedang berjalan -> ditolak`, g(nowH), { ok: false, why: "lewat" });
t(`jam ${nowH + 1} kurang dari 60 mnt -> ditolak`, g(nowH + 1).ok, false);
t(`jam ${nowH + 2} -> diterima`, g(nowH + 2), { ok: true });
t("tanggal lain selalu boleh", occ.hourBookable("2099-01-01", 11, today, 60, now), { ok: true });

// Aturan nyata aplikasi: MIN_LEAD_MIN = 30 menit. Tamu yang sudah di jalan jam 16.30
// masih boleh mengambil slot jam 17.00 (permintaan pemilik) — 29 menit sudah terlambat.
{
  const iso30 = occ.tanggalWib(now);
  const [y30, m30, d30] = iso30.split("-").map(Number);
  const sore = occ.dariWib(y30, m30, d30, 16, 30);
  t("16.30 -> slot 17.00 masih boleh (lead 30 menit)",
    occ.hourBookable(iso30, 17, iso30, MIN_LEAD_MIN, sore), { ok: true });
  t("16.31 -> slot 17.00 sudah terlalu dekat",
    occ.hourBookable(iso30, 17, iso30, MIN_LEAD_MIN, sore + 60_000),
    { ok: false, why: "terlalu-dekat" });
}

console.log("\n-- Hitungan meja per jam: resto tidak pernah ikut --");
{
  const iso3 = occ.tanggalWib(now);
  const biliar = TABLES.filter((x) => x.type !== "resto").length;
  t("strip jam hanya menghitung meja biliar", freeCountAtHour(iso3, 20, [], undefined), biliar);
  // Kelas yang diubah pemilik ikut dipakai: satu meja reguler dijadikan resto.
  const mejaReguler = TABLES.find((x) => x.type === "regular")!;
  t("meja yang diubah pemilik jadi resto ikut dikeluarkan",
    freeCountAtHour(iso3, 20, [], undefined, { [mejaReguler.id]: "resto" }), biliar - 1);
  t("saring VIP hanya menghitung VIP",
    freeCountAtHour(iso3, 20, [], "vip"), TABLES.filter((x) => x.type === "vip").length);
}

console.log("\n-- Peringatan tabrakan T-10 / T-3 --");
const mk = (endMin: number): LiveSession[] => [
  { ...S("run", "T05", "running", -1, 0), endsAt: now + endMin * 60_000 },
  { ...S("nxt", "T05", "booked", 0, 2), startsAt: now + endMin * 60_000 + 3 * 60_000 },
];
t("sisa 8 menit -> T10", occ.findClashes(mk(8), now)[0]?.level, "T10");
t("sisa 2 menit -> T3", occ.findClashes(mk(2), now)[0]?.level, "T3");
t("sudah lewat -> OVER", occ.findClashes(mk(-5), now)[0]?.level, "OVER");
t("sisa 40 menit -> tidak ada peringatan", occ.findClashes(mk(40), now).length, 0);

console.log("\n-- Sesi bermenit ganjil tetap sinkron dengan grid jam --");
{
  // Hari ini pukul 13.17, walk-in 1 jam -> selesai 14.17, terkunci s/d 14.27
  const isoW = occ.tanggalWib(Date.now());
  const [yW, mW, dW] = isoW.split("-").map(Number);
  const t0 = occ.dariWib(yW, mW, dW, 13, 17);
  const iso = isoW;
  const walkin: LiveSession = {
    id: "w", tableId: "T09", source: "walkin", guest: "Tamu",
    startsAt: t0, endsAt: t0 + 60 * 60_000, status: "running",
    fnb: [], tableAmount: 29_000, paidOnline: 0,
  };
  const sess = [walkin];
  const tNow = t0 + 5 * 60_000; // jam uji dikunci 13.22 — tidak bergantung jam dinding

  const jamWib = (ts: number) => occ.diWib(ts).getUTCHours() + ":" + occ.diWib(ts).getUTCMinutes();
  t("selesai main 14.17", jamWib(walkin.endsAt), "14:17");
  t("meja terkunci s/d 14.27", jamWib(occ.blockEndOf(walkin, tNow)), "14:27");

  // Paket per jam: punya jam selesai sungguhan, jadi grid jam berlaku penuh.
  const paket: LiveSession = { ...walkin, blockHours: 1 };
  const busyPaket = [...occ.busyHoursFromSessions([paket], "T09", iso, tNow)].sort((a, b) => a - b);
  t("paket per jam: slot 13 & 14 tertutup, 15 terbuka", busyPaket, [13, 14]);

  // Open bill (tanpa jam selesai): tidak ada yang tahu kapan tamunya pulang, jadi
  // sisa hari itu ditutup untuk BOOKING ONLINE — permintaan pemilik.
  const busy = [...occ.busyHoursFromSessions(sess, "T09", iso, tNow)].sort((a, b) => a - b);
  t("open bill: sisa hari tertutup untuk online", busy.length, 15);
  t("open bill: jam 15 pun tidak ditawarkan online", busy.includes(15), true);

  t("kasir tetap boleh menjadwalkan 15.00 di meja open bill",
    occ.tableFreeForRange(sess, "T09", occ.slotStart(iso, 15), occ.slotStart(iso, 17), undefined, tNow), true);
  t("jam 14.00 bentrok dengan sesi yang masih jalan",
    occ.tableFreeForRange(sess, "T09", occ.slotStart(iso, 14), occ.slotStart(iso, 16), undefined, tNow), false);
}

console.log("\n-- Perpanjangan skala 1 jam, bukan 30 menit --");
{
  const now2 = Date.now();
  const run: LiveSession = {
    id: "r", tableId: "T10", source: "walkin", guest: "T",
    startsAt: now2 - 50 * 60_000, endsAt: now2 + 10 * 60_000, status: "running",
    fnb: [], tableAmount: 29_000, paidOnline: 0,
  };
  const bookedFar: LiveSession = {
    id: "bf", tableId: "T10", source: "online", guest: "B",
    startsAt: now2 + 130 * 60_000, endsAt: now2 + 250 * 60_000, status: "booked",
    fnb: [], tableAmount: 0, paidOnline: 0,
  };
  const bookedNear: LiveSession = { ...bookedFar, id: "bn", startsAt: now2 + 45 * 60_000 };

  t("+1 jam saat booking 130m lagi -> boleh",
    occ.tableFreeForRange([run, bookedFar], "T10", run.startsAt, run.endsAt + 60 * 60_000, run.id), true);
  t("+1 jam saat booking 45m lagi -> ditolak",
    occ.tableFreeForRange([run, bookedNear], "T10", run.startsAt, run.endsAt + 60 * 60_000, run.id), false);
}

console.log("\n-- Open bill tetap mengunci meja selama meteran jalan --");
{
  const n = Date.now();
  // Open bill dimulai 50 menit lalu; kunci awal 30 menit sudah lewat 20 menit
  const ob: LiveSession = {
    id: "ob", tableId: "T20", source: "walkin", guest: "Walk-in",
    startsAt: n - 50 * 60_000, endsAt: n - 20 * 60_000, status: "running",
    fnb: [], tableAmount: 0, paidOnline: 0,
  };
  t("meja TIDAK dianggap kosong sekarang",
    occ.tableFreeForRange([ob], "T20", n, n + 60 * 60_000, undefined, n), false);
  t("terkunci sampai sekarang + 10 menit bersih",
    Math.round((occ.blockEndOf(ob, n) - n) / 60_000), 10);

  // Pemesan online masuk 8 menit lagi -> peringatan T10 walau open bill tak punya jam selesai
  const nextB: LiveSession = {
    id: "nb", tableId: "T20", source: "online", guest: "Online",
    startsAt: n + 18 * 60_000, endsAt: n + 138 * 60_000, status: "booked",
    fnb: [], tableAmount: 78_000, paidOnline: 78_000,
  };
  const c = occ.findClashes([ob, nextB], n);
  t("open bill + booking menjelang -> ada peringatan", c.length, 1);
  t("sisa waktu dihitung dari booking berikutnya - bersih-bersih", c[0]?.minutesLeft, 8);
}

console.log("\n-- Booking online lewat jam selesai tetap mengunci meja sampai tab ditutup --");
{
  const n = Date.now();
  const lewat: LiveSession = {
    id: "ov", tableId: "T30", source: "online", guest: "Belum pulang",
    startsAt: n - 150 * 60_000, endsAt: n - 30 * 60_000, status: "running",
    fnb: [], tableAmount: 78_000, paidOnline: 78_000,
  };
  t("meja belum dianggap kosong", occ.tableFreeForRange([lewat], "T30", n, n + 60 * 60_000, undefined, n), false);
}

console.log("");
console.log(bad === 0 ? `SEMUA BENAR (${total} pemeriksaan)` : `${bad} dari ${total} SALAH`);
if (bad > 0) process.exitCode = 1;
