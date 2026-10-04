/* Uji mutasi: apakah tes benar-benar menangkap bug?
   Setiap mutasi memasukkan kembali satu cacat nyata ke mesin (engine.ts /
   billing.ts) atau penyimpanan (venueStore.ts), menjalankan tes yang relevan
   (100 simulasi, uji ketahanan, atau uji sinkronisasi), lalu mengembalikan
   berkas asli (selalu).

   MUT_OUT / MUT_BACKUP mengarahkan berkas sementara (untuk salinan terisolasi). */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ENGINE = "src/lib/engine.ts";
const BILLING = "src/lib/billing.ts";
const VENUE = "src/lib/venueStore.ts";
const REMOTE = "src/lib/remote.ts";
const PUBLIC = "src/lib/publicView.ts";
const FILES = [ENGINE, BILLING, VENUE, REMOTE, PUBLIC];
const OUT = process.env.MUT_OUT ?? "node_modules/.cache";
/** Hanya jalankan mutasi nomor tertentu, mis. MUT_ONLY=28,68,69 — untuk perbaikan cepat. */
const ONLY = (process.env.MUT_ONLY ?? "").split(",").map((x) => Number(x.trim())).filter((x) => x > 0);
const BACKUP_DIR = process.env.MUT_BACKUP ?? "node_modules/.cache/mutation-backup";
const backupOf = (f) => `${BACKUP_DIR}/${f.replace(/[\\/]/g, "__")}`;

// Aman bila proses dihentikan paksa: kalau cadangan dari percobaan sebelumnya
// masih ada, berarti berkasnya mungkin tertinggal dalam keadaan termutasi.
mkdirSync(BACKUP_DIR, { recursive: true });
for (const f of FILES) {
  if (existsSync(backupOf(f))) {
    writeFileSync(f, readFileSync(backupOf(f), "utf8"));
    unlinkSync(backupOf(f));
    console.log(`${f} dipulihkan dari cadangan percobaan sebelumnya yang terhenti.`);
  }
}
// Cadangan lama (versi skrip sebelumnya yang hanya memutasi engine.ts).
const LEGACY = "node_modules/.cache/engine.mutation-backup.ts";
if (existsSync(LEGACY)) {
  writeFileSync(ENGINE, readFileSync(LEGACY, "utf8"));
  unlinkSync(LEGACY);
  console.log("engine.ts dipulihkan dari cadangan lama.");
}
const original = Object.fromEntries(FILES.map((f) => [f, readFileSync(f, "utf8")]));
for (const f of FILES) writeFileSync(backupOf(f), original[f]);
const restore = () => {
  for (const f of FILES) {
    writeFileSync(f, original[f]);
    if (existsSync(backupOf(f))) unlinkSync(backupOf(f));
  }
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restore(); process.exit(130); });

const MUTATIONS = [
  {
    name: "Booking online/hold tidak dicek bentrok slot",
    expect: ["INV-22", "INV-30", "INV-01"],
    from: `if (!tableFreeForRange(s.sessions, table.id, r.startsAt, r.startsAt + r.hours * HOUR_MS, ignoreId, now)) {`,
    to: `if (false) {`,
  },
  {
    name: "Tutup tab percaya angka dari layar",
    expect: ["INV-07"],
    from: `settledChannel: a.channel, settledAmount: bill.due,`,
    to: `settledChannel: a.channel, settledAmount: a.amount ?? bill.due,`,
  },
  {
    name: "Order F&B tanpa shift terbuka",
    expect: ["INV-11"],
    from: `if (!allow(s, "orderFnb") || !s.shift) return s;`,
    to: `if (!allow(s, "orderFnb")) return s;`,
  },
  {
    name: "Stok tidak dicek (boleh oversell)",
    expect: ["INV-05", "INV-03"],
    from: `if (row && row.qty !== null && row.qty < q) return null;`,
    to: `if (false) return null;`,
  },
  {
    name: "Kas shift pakai angka dari layar",
    expect: ["INV-09"],
    from: `const expected = shiftCashExpected(s);`,
    to: `const expected = a.expected ?? shiftCashExpected(s);`,
  },
  {
    name: "Karyawan boleh ubah tarif",
    expect: ["INV-10"],
    from: `if (!allow(s, "ubahTarif") || !(a.value > 0)) return s;`,
    to: `if (!s.me || !(a.value > 0)) return s;`,
  },
  {
    name: "Void boleh menghapus sesi yang sudah dibayar",
    expect: ["INV-13"],
    from: `if (!x || (x.status !== "running" && x.status !== "booked")) return null;`,
    to: `if (!x) return null;`,
  },
  {
    name: "Check-in menggeser jam selesai",
    expect: ["INV-19"],
    from: `const running: LiveSession = { ...bk, status: "running", startsAt };`,
    to: `const running: LiveSession = { ...bk, status: "running", startsAt, endsAt: now + (bk.endsAt - bk.startsAt) };`,
  },
  {
    name: "Promo memotong yang sudah prabayar",
    expect: ["INV-07"],
    from: `const counterBilliard = s.source === "walkin" ? billiard : (s.extraTable ?? 0);`,
    to: `const counterBilliard = billiard;`,
  },
  {
    name: "No-show tidak dilepas",
    expect: ["INV-25"],
    from: `      ? noShowDueAt(s.sessions, x, now) : null;`,
    to: `      ? null : null;`,
  },
  {
    name: "Tidak ada tiket dapur untuk pesanan online",
    expect: ["INV-20"],
    from: "tickets: [...ticketsFor(forSession(running), bk.fnb.filter((l) => l.prepaid), now, `Pra-order · ${bk.guest}`), ...s.tickets],",
    to: `tickets: s.tickets,`,
  },
  {
    name: "Rekap tidak dibatasi hari operasional",
    expect: ["INV-24"],
    from: `(s.status === "done" || s.status === "noshow") && businessDateOf(s.startsAt) === bizDate);`,
    to: `(s.status === "done" || s.status === "noshow"));`,
  },
  /* ── Fitur yang ditambahkan di audit putaran 2 ───────────────────── */
  {
    name: "Hold QRIS tidak pernah kedaluwarsa",
    expect: ["INV-30"],
    from: `} else if (x.status === "hold" && (x.holdUntil ?? 0) <= now) {`,
    to: `} else if (false) {`,
  },
  {
    name: "Pesanan QR diterima walau meja belum dibuka kasir",
    expect: ["INV-29"],
    edits: [
      ["if (!run) return `${t.name} belum dibuka kasir — minta kasir membuka meja dulu`;", ""],
      ["if (o.sessionId && !o.sessionId.startsWith(\"pub-\") && run.id !== o.sessionId) {", "if (run && o.sessionId && !o.sessionId.startsWith(\"pub-\") && run.id !== o.sessionId) {"],
    ],
  },
  {
    name: "Takeaway tidak masuk laporan",
    expect: ["INV-24", "INV-08"],
    from: `fnb += o.value; gross += o.value;`,
    to: ``,
  },
  {
    name: "Harga menu tidak dikunci di baris pesanan",
    expect: ["INV-31", "INV-29"],
    from: `out.push({ key: l.key, itemId: item.id, qty: qty - free, variant: l.variant, unitPrice: price, ...extra });`,
    to: `out.push({ key: l.key, itemId: item.id, qty: qty - free, variant: l.variant, ...extra });`,
  },
  {
    name: "Notifikasi pembayaran ganda diproses ulang",
    expect: ["INV-22"],
    from: `if (s.paymentIds.includes(sent.id)) return s;`,
    to: `if (false) return s;`,
  },
  {
    name: "Menu habis saat bayar tidak dikembalikan dananya",
    expect: ["INV-06", "INV-22"],
    from: `const f = fulfil(base, lines.map((l) => ({ ...l, prepaid: true })));\n  const refundAmt = f.dropped.reduce((n, l) => n + lineValue(l), 0);`,
    to: `const f = fulfil(base, lines.map((l) => ({ ...l, prepaid: true })));\n  const refundAmt = 0;`,
  },
  {
    name: "Void minuman gratis tidak mengembalikan jatah Paket Siang",
    expect: ["INV-28"],
    from: `...(line.unitPrice === 0 && x.freeDrinks !== undefined ? { freeDrinks: x.freeDrinks + line.qty } : {}),`,
    to: ``,
  },
  {
    name: "No-show dicatat pada jam detak, bukan jam seharusnya (tidak deterministik)",
    expect: ["INV-32", "INV-33", "INV-25"],
    from: `settledAt: ev.at, settledAmount: 0, settledChannel: undefined,`,
    to: `settledAt: Date.now(), settledAmount: 0, settledChannel: undefined,`,
  },
  {
    name: "ID dari penghitung global, bukan dari kejadian (perangkat lain beda ID)",
    expect: ["INV-32", "INV-33"],
    edits: [
      [`idBase = e.id.replace(/[^A-Za-z0-9]/g, ""); seq = 0;`, `idBase = null;`],
      [`try { return fn(); } finally { clockFn = prevClock; idBase = prevBase; seq = prevSeq; }`,
        `try { return fn(); } finally { clockFn = prevClock; idBase = prevBase; }`],
    ],
  },
  /* ── Temuan audit independen putaran 3 ───────────────────────────── */
  {
    name: "Rekap memakai jam tutup, bukan jam mulai (PRD KK-19)",
    expect: ["INV-24"],
    from: `businessDateOf(s.startsAt) === bizDate);`,
    to: `businessDateOf(s.settledAt ?? s.endsAt) === bizDate);`,
  },
  {
    name: "Void item mencari tiket lewat item + jumlah, bukan kunci baris",
    expect: ["INV-34"],
    from: `const keyed = s.tickets.some((t) => t.sessionId === sessionId && t.lineKey === key);`,
    to: `const keyed = false;`,
  },
  {
    name: "Tanda habis manual dicabut saat barang kembali ke stok (void/no-show)",
    expect: ["INV-35"],
    from: `const restocked = stock.filter((r) => back[r.itemId] && r.qty === 0).map((r) => r.itemId);`,
    to: `const restocked = Object.keys(back);`,
  },
  {
    name: "Koreksi stok mencabut tanda habis manual",
    expect: ["INV-35"],
    edits: [
      [`const soldOut = qty !== null && qty > 0 && prevQty === 0 ? s.soldOut.filter((x) => x !== a.itemId) : s.soldOut;`,
        `const soldOut = qty !== null && qty > 0 ? s.soldOut.filter((x) => x !== a.itemId) : s.soldOut;`],
      [`const soldOut = next > 0 && row.qty === 0 ? s.soldOut.filter((x) => x !== a.itemId) : s.soldOut;`,
        `const soldOut = next > 0 ? s.soldOut.filter((x) => x !== a.itemId) : s.soldOut;`],
    ],
  },
  {
    name: "Refund void sesi atas satu kode booking, bukan per pembayar",
    expect: ["INV-36"],
    edits: [
      [`const byOrder = attached.filter((o) => o.paidOnline > 0)`, `const byOrder = attached.filter((o) => false)`],
      [`const rest = sess.paidOnline - attached.reduce((n, o) => n + o.paidOnline, 0);`, `const rest = sess.paidOnline;`],
    ],
  },
  {
    name: "Void pesanan ikut membatalkan baris yang sudah diserahkan",
    expect: ["INV-13", "INV-36"],
    from: `return o.lines.filter((l) => !s.tickets.some((t) => t.sessionId === target && t.lineKey === l.key && t.status === "served"));`,
    to: `return o.lines;`,
  },
  {
    name: "Ubah tarif menagih ulang open bill yang sedang jalan",
    expect: ["INV-37"],
    from: `const detail = billOpenSession(sessionType(s), s.startsAt, end, s.rates ?? rates);`,
    to: `const detail = billOpenSession(sessionType(s), s.startsAt, end, rates);`,
  },
  {
    name: "Walk-in tidak membekukan tarif saat dibuka",
    expect: ["INV-37"],
    from: `rates: { ...s.rates },`,
    to: ``,
  },
  {
    name: "Open bill contoh (seed) tanpa tarif beku",
    expect: ["INV-37"],
    from: `x.status === "running" && x.source === "walkin" ? { ...x, rates: { ...RATES } } : x);`,
    to: `x);`,
  },
  {
    name: "Perpanjangan boleh melewati jam tutup 02.00",
    expect: ["INV-38"],
    from: `if (t.endsAt + minutes * 60_000 > closingAfter(t.startsAt)) return false;`,
    to: ``,
  },
  {
    name: "Jam sesudah 02.00 dianggap jam siang di mesin",
    expect: ["INV-38", "INV-21", "INV-18", "INV-26"],
    from: `export const hourIdx = (ts: number) => { const h = diWib(ts).getUTCHours(); return h < OPEN_IDX ? h + 24 : h; };`,
    to: `export const hourIdx = (ts: number) => { const h = diWib(ts).getUTCHours(); return h < 2 ? h + 24 : h; };`,
  },
  {
    name: "Meteran: jam sesudah 02.00 bertarif siang",
    file: BILLING,
    expect: ["INV-07", "INV-17"],
    from: `return h < OPEN_HOUR ? h + 24 : h;`,
    to: `return h < 2 ? h + 24 : h;`,
  },
  {
    name: "Meteran dijumlah dengan pecahan (galat desimal → kelebihan tagih Rp 500)",
    file: BILLING,
    expect: ["INV-07"],
    from: `amount: Math.ceil(rateMs / (3_600_000 * ROUND_TO)) * ROUND_TO,`,
    to: `amount: Math.ceil(segments.reduce((n, g) => n + (g.ratePerHour / 60) * g.minutes, 0) / ROUND_TO) * ROUND_TO,`,
  },
  {
    name: "No-show dilepas walau meja masih dipakai sesi lain",
    expect: ["INV-39", "INV-25"],
    from: `if (x.status === "running" && x.startsAt < bk.endsAt && blockEndOf(x, now) > bk.startsAt) return null;`,
    to: ``,
  },
  {
    name: "Booking yang tidak pernah bisa ditempati dilepas sebagai no-show",
    expect: ["INV-39"],
    from: `if (from >= bk.endsAt) return null;`,
    to: ``,
  },
  {
    name: "Penghalang di-void: booking yang menunggu langsung hangus",
    expect: ["INV-25", "INV-39"],
    from: `sessions: markReady(s.sessions.filter((x) => x.id !== req.targetId), sess, now),`,
    to: `sessions: s.sessions.filter((x) => x.id !== req.targetId),`,
  },
  {
    name: "Penghalang dipindah meja: booking yang menunggu langsung hangus",
    expect: ["INV-25", "INV-39"],
    from: `sessions: markReady(moved, t, now),`,
    to: `sessions: moved,`,
  },
  {
    name: "Booking dipindah meja setelah jam mulai: hitungan no-show tidak dimulai ulang",
    expect: ["INV-25"],
    from: `...(t.status === "booked" && now > t.startsAt ? { readyAt: Math.max(t.readyAt ?? 0, now) } : {}),`,
    to: ``,
  },
  {
    name: "Meteran berhenti di jam ke-48 (tab lupa ditutup tidak ditagih penuh)",
    file: BILLING,
    test: "billing",
    expect: ["BILLING"],
    from: `const maxSegments = Math.ceil(billedMinutes / 60) + 2;`,
    to: `const maxSegments = 48;`,
  },
  /* ── Pulihkan no-show & catatan refund ───────────────────────────── */
  {
    name: "Pulihkan no-show: pra-order yang sudah habis tidak dikembalikan dananya",
    expect: ["INV-40", "INV-06"],
    from: `const f = fulfil(s, x.noShowFnb ?? []);\n      const refundAmt = f.dropped.reduce((n, l) => n + lineValue(l), 0);`,
    to: `const f = fulfil(s, x.noShowFnb ?? []);\n      const refundAmt = 0;`,
  },
  {
    name: "Pulihkan no-show tanpa tiket dapur untuk pra-order",
    expect: ["INV-40"],
    from: "tickets: [...ticketsFor(forSession(running), f.taken, now, `Pra-order · ${x.guest}`), ...s.tickets],",
    to: `tickets: s.tickets,`,
  },
  {
    name: "Pulihkan no-show walau mejanya sudah dipakai orang lain",
    expect: ["INV-01", "INV-02"],
    from: `if (!tableFreeForRange(s.sessions, x.tableId, Math.min(now, x.startsAt), x.endsAt, x.id, now)) {`,
    to: `if (false) {`,
  },
  {
    name: "Pulihkan no-show tidak mengembalikan jatah minuman gratis yang habis",
    expect: ["INV-28"],
    from: `...(freeBack > 0 && x.freeDrinks !== undefined ? { freeDrinks: x.freeDrinks + freeBack } : {}),\n      };`,
    to: `};`,
  },
  {
    name: "Refund bisa dicatat dikembalikan dua kali",
    expect: ["INV-41"],
    from: `const r = s.refunds.find((x) => x.id === a.id && !x.settledAt);`,
    to: `const r = s.refunds.find((x) => x.id === a.id);`,
  },
  {
    name: "Karyawan bisa menandai refund selesai",
    expect: ["INV-10"],
    from: `if (!allow(s, "lihatLaporanKeuangan")) return s;\n      const r = s.refunds.find`,
    to: `if (!s.me) return s;\n      const r = s.refunds.find`,
  },
  {
    name: "Tamu online yang lewat jam dipindah ke meja yang sedang dipakai",
    expect: ["INV-01"],
    from: `    until: sess.source === "walkin" && !sess.blockHours
      ? Math.max(sess.endsAt, now + 30 * 60_000)
      : Math.max(sess.endsAt, now),`,
    to: `    until: sess.source === "walkin" && !sess.blockHours
      ? Math.max(sess.endsAt, now + 30 * 60_000)
      : sess.endsAt,`,
  },
  {
    name: "Pesanan QR masuk ke tab rombongan lain (tab tamu sudah ditutup)",
    expect: ["INV-29"],
    from: 'if (o.sessionId && !o.sessionId.startsWith("pub-") && run.id !== o.sessionId) {\n      return `tab ${t.name} sudah berganti — scan QR di meja lagi`;\n    }',
    to: ``,
  },
  /* ── Tutup buku harian (uji ketahanan berhari-hari) ──────────────── */
  {
    name: "Tutup buku mengarsipkan hari yang masih punya tab berjalan",
    expect: ["INV-42"],
    from: `if (x.status === "running") blocked.add(dayOf(x.startsAt));`,
    to: `if (x.status === "running") { /* dimatikan */ }`,
  },
  {
    name: "Tutup buku mengarsipkan uang yang masih dihitung shift yang buka",
    test: "soak",
    expect: ["INV-S5"],
    from: ` || (s.shift &&
      (x.settledShiftId === s.shift.id || (x.payments ?? []).some((p) => p.shiftId === s.shift!.id)))))`,
    to: `))`,
  },
  {
    name: "Arsip dulu baru lepas no-show (no-show hari itu tertinggal di luar arsipnya)",
    test: "soak",
    expect: ["INV-S2"],
    from: `  const released = withStockMoves(s, releaseDue(s, now), now, () => "kembali");\n  const today = businessDateOf(now);\n  if (today <= released.day) return released;`,
    to: `  const today = businessDateOf(now);\n  const arsipDulu = today > s.day ? closeBooks(closeAbandoned(s, today, now), today, now) : s;\n  const released = withStockMoves(arsipDulu, releaseDue(arsipDulu, now), now, () => "kembali");\n  if (true) return released;`,
  },
  {
    name: "Tutup buku tidak pernah berjalan (setiap aksi makin lambat)",
    test: "soak",
    expect: ["INV-S1"],
    from: `  return closeBooks(closeAbandoned(released, today, now), today, now);`,
    to: `  return closeAbandoned(released, today, now);`,
  },
  {
    name: "Arsip menghapus waktu pulang rombongan yang dipakai hitungan no-show",
    expect: ["INV-25", "INV-39"],
    from: `    return ready > Math.max(bk.startsAt, bk.readyAt ?? 0) ? { ...bk, readyAt: ready } : bk;`,
    to: `    return bk;`,
  },
  {
    name: "Tiket dapur transaksi yang diarsipkan tertinggal",
    expect: ["INV-34"],
    from: `    tickets: s.tickets.filter((k) => !goneSessions.has(k.sessionId) && !goneOrders.has(k.sessionId)),`,
    to: `    tickets: s.tickets,`,
  },
  {
    name: "Refund yang belum dikembalikan ikut diarsipkan",
    expect: ["INV-42"],
    from: `    const rx = s.refunds.filter((r) => r.settledAt && dayOf(r.settledAt) === d);`,
    to: `    const rx = s.refunds.filter((r) => dayOf(r.settledAt ?? r.at) === d);`,
  },
  /* ── Penyimpanan & sinkronisasi antar-tab ────────────────────────── */
  {
    name: "Jejak dari sebelum reset data diputar lagi",
    file: VENUE,
    test: "sync",
    expect: ["SYNC"],
    edits: [
      [`const fromThisWorld = (e: StoredEntry) => e.g === undefined || e.g === genesis.at;`, `const fromThisWorld = (e: StoredEntry) => true;`],
      [`if (stored && typeof stored.at === "number" && stored.at !== genesis.at) {`, `if (false) {`],
    ],
  },
  {
    name: "Titik simpan yang lebih lama menimpa yang lebih baru",
    file: VENUE,
    test: "sync",
    expect: ["SYNC"],
    from: `    adoptNewerSnapshot();\n    const horizon = Date.now() - SETTLE_MS;`,
    to: `    const horizon = Date.now() - SETTLE_MS;`,
  },
  {
    name: "Kejadian yang sudah terlipat di titik simpan diputar dua kali saat dibuka",
    file: VENUE,
    test: "sync",
    expect: ["SYNC"],
    from: `    for (const e of storedEntries()) if (afterSnap(e)) all.set(e.id, e);`,
    to: `    for (const e of storedEntries()) all.set(e.id, e);`,
  },
  {
    name: "Kejadian rusak di jejak bersama tidak divalidasi",
    expect: ["INV-43"],
    from: `  if (!isNum(e.at) || !(e.by === null || isStr(e.by)) || !validAction(e.act)) return st;`,
    to: ``,
  },
  {
    name: "Kejadian rusak tidak divalidasi DAN galat reducer tidak ditangkap (semua perangkat crash)",
    expect: ["INV-43"],
    edits: [
      [`  if (!isNum(e.at) || !(e.by === null || isStr(e.by)) || !validAction(e.act)) return st;`, ``],
      [`    try {\n      next = reducer(asActor, e.act);\n    } catch {`, `    {\n      next = reducer(asActor, e.act);\n    } if (false) {`],
    ],
  },
  {
    name: "Titik simpan melipat kejadian yang belum mapan (siaran terlambat hilang)",
    file: VENUE,
    test: "sync",
    expect: ["SYNC"],
    from: `    for (let i = 0; i < entries.length && entries[i].at <= horizon; i++) k = i;`,
    to: `    k = entries.length - 1;`,
  },
  {
    name: "Antrean aksi tidak disimpan — hilang saat aplikasi dibuka ulang",
    expect: ["LINTAS"],
    file: VENUE,
    test: "remote",
    from: `      outbox.push(p);
      write(K_OUTBOX, outbox);`,
    to: `      outbox.push(p);`,
  },
  {
    name: "Aksi uang tidak dikunci saat internet putus",
    expect: ["LINTAS"],
    file: REMOTE,
    test: "remote",
    from: `  if (online || !isMoneyAction(a)) return null;`,
    to: `  if (true) return null;`,
  },
  {
    name: "Kejadian resmi server tidak disimpan di perangkat",
    expect: ["LINTAS"],
    file: VENUE,
    test: "remote",
    from: `    if (fromServer && fresh.length) saveServerEntries(fresh);`,
    to: ``,
  },
  {
    name: "Dunia server diabaikan: perangkat memakai data dunia lamanya",
    expect: ["LINTAS"],
    file: VENUE,
    test: "remote",
    from: `      if (res.genesis.at !== genesis.at || res.genesis.seed !== genesis.seed) {`,
    to: `      if (false) {`,
  },
  {
    name: "Nomor urut server tidak dicatat (setiap kali menarik ulang dari awal)",
    expect: ["LINTAS"],
    file: VENUE,
    test: "remote",
    from: `      for (const e of list) if (isEntry(e)) head = Math.max(head, (e as ServerEntry).seq ?? 0);`,
    to: ``,
  },
  {
    name: "Tampilan publik ikut membawa identitas tamu",
    expect: ["LINTAS"],
    file: PUBLIC,
    test: "remote",
    from: `    slots.push({
      tableId: x.tableId,`,
    to: `    slots.push({
      ...x,
      tableId: x.tableId,`,
  },
  {
    name: "Toleransi batal 5 menit dihapus (tamu tetap ditagih 30 menit)",
    file: BILLING,
    expect: ["INV-46"],
    from: `  if (playedMinutes <= GRACE_MINUTES) {`,
    to: `  if (false) {`,
  },
  {
    name: "Meteran tidak berhenti jam 05.00 (komputer mati = ditagih semalaman)",
    expect: ["INV-46"],
    from: `    : Math.max(s.startsAt, Math.min(now, meterCapAfter(s.startsAt)));`,
    to: `    : Math.max(s.startsAt, now);`,
  },
  {
    name: "Bayar per orang tidak mengurangi sisa tagihan (tamu bayar dua kali)",
    expect: ["INV-06","INV-44","INV-08"],
    from: `  const due = Math.max(0, tagihan - dibayarSebagian);`,
    to: `  const due = tagihan;`,
  },
  {
    name: "Bayar sebagian boleh melebihi sisa tagihan",
    expect: ["INV-44","INV-06","INV-08"],
    from: `      if (!(amount > 0) || amount > sisa) return s;`,
    to: `      if (!(amount > 0)) return s;`,
  },
  {
    name: "Bayar per pesanan percaya nominal dari layar, bukan hitungan mesin",
    expect: ["INV-44"],
    from: `        amount = pilih.reduce((n, l) => n + lineValue(l), 0);`,
    to: `        amount = Math.round(a.amount ?? pilih.reduce((n, l) => n + lineValue(l), 0));`,
  },
  {
    name: "Koreksi pesanan boleh mengubah barang yang sudah diantar",
    expect: ["INV-45"],
    from: `      if (s.tickets.some((t) => t.sessionId === sess.id && t.lineKey === line.key && t.status === "served")) return s;`,
    to: `      void 0;`,
  },
  {
    name: "Pindah pesanan tidak memindahkan tiket dapur",
    expect: ["INV-45","INV-34"],
    from: `        tickets: s.tickets.map((t) => (t.sessionId === from.id && t.lineKey && peta.has(t.lineKey)\n          ? { ...t, sessionId: to.id, tableName: nameOf(to.tableId), lineKey: peta.get(t.lineKey)! }\n          : t)),`,
    to: `        tickets: s.tickets,`,
  },
  {
    name: "PIN staf boleh kembar (jejak audit jadi bohong)",
    expect: ["INV-48"],
    from: `      if (s.employees.some((x) => x.id !== id && x.pin === pin)) return s;`,
    to: `      void 0;`,
  },
  {
    name: "Venue boleh kehilangan seluruh superadmin aktifnya",
    expect: ["INV-48"],
    from: `      if (!list.some((x) => x.active && x.role === "superadmin")) return s;\n      if (JSON.stringify(list) === JSON.stringify(s.employees)) return s;`,
    to: `      if (JSON.stringify(list) === JSON.stringify(s.employees)) return s;`,
  },
  {
    name: "Reservasi resto tidak memeriksa kelas & kapasitas meja",
    expect: ["INV-47"],
    from: `    if (!t || classOf(s, t.id) !== "resto" || t.capacity < r.pax || !kosong(t.id)) return null;`,
    to: `    if (!t || !kosong(t.id)) return null;`,
  },
  {
    name: "Void sesi tidak mengembalikan uang split bill",
    expect: ["INV-36"],
    from: `      refunds: [...own, ...byOrder, ...bySplit, ...s.refunds],`,
    to: `      refunds: [...own, ...byOrder, ...s.refunds],`,
  },
  {
    name: "Meteran boleh dimundurkan di bawah uang yang sudah dibayar",
    expect: ["INV-06","INV-08"],
    from: `      if (counterWith({ ...t, stoppedAt: at }, t.fnb, s, now) < splitPaidOf(t)) return s;`,
    to: `      void 0;`,
  },
  {
    name: "Promo memotong tagihan di bawah uang yang sudah diterima",
    expect: ["INV-06","INV-07","INV-08"],
    from: `  const discount = Math.max(0, Math.min(promo?.discount ?? 0, counterBilliard + counterFnb - dibayarSebagian));`,
    to: `  const discount = promo?.discount ?? 0;`,
  },
  {
    name: "Kelas meja diabaikan: VIP/VVIP ditagih tarif reguler",
    expect: ["INV-46","INV-18"],
    from: `export const sessionType = (s: Pick<LiveSession, "tableId" | "tableType">): TableType => s.tableType ?? typeOf(s.tableId);`,
    to: `export const sessionType = (s: Pick<LiveSession, "tableId" | "tableType">): TableType => (s.tableId ? "regular" : "regular");`,
  },
  {
    name: "Meja yang sedang open bill tetap dijual ke booking online",
    expect: ["INV-51"],
    from: `  if (lead && (openBillOn(s.sessions, table.id, businessDateOf(r.startsAt)) ||`,
    to: `  if (false && (openBillOn(s.sessions, table.id, businessDateOf(r.startsAt)) ||`,
  },
  {
    name: "Takeaway yang sudah dibayar di kasir di-void tanpa mengembalikan uangnya",
    expect: ["INV-08","INV-13","INV-36","INV-50"],
    from: `    const kasirBack = Math.min(o.payment?.amount ?? 0, Math.max(0, value - refundAmt));`,
    to: `    const kasirBack = 0;`,
  },
];

const TESTS = {
  sim: { src: "test/simulation.test.ts", env: { SIMS: "100" }, parse: (out) => [...out.matchAll(/✗ (INV-\d+)/g)].map((x) => x[1]) },
  billing: { src: "test/billing.test.ts", env: {}, parse: (out) => (/SALAH/.test(out) || /Error/.test(out) ? ["BILLING"] : []) },
  soak: { src: "test/soak.test.ts", env: { DAYS: "14" }, parse: (out) => [...out.matchAll(/✗ (INV-S\d+)/g)].map((x) => x[1]) },
  sync: { src: "test/sync.test.ts", env: {}, parse: (out) => (/^FAIL /m.test(out) || /Error/.test(out) ? ["SYNC"] : []) },
  remote: { src: "test/remote.test.ts", env: {}, parse: (out) => (/^FAIL /m.test(out) || /Error/.test(out) ? ["LINTAS"] : []) },
};

const only = process.env.ONLY ? new Set(process.env.ONLY.split(",").map(Number)) : null;
const results = [];
try {
  for (const [i, m] of MUTATIONS.entries()) {
    if (only && !only.has(i + 1)) continue;
    if (ONLY.length && !ONLY.includes(i + 1)) continue;
    const file = m.file ?? ENGINE;
    const test = TESTS[m.test ?? "sim"];
    // Pola multi-baris ditulis dengan "\n"; sesuaikan dengan akhir baris berkasnya (CRLF di Windows).
    const nl = original[file].includes("\r\n") ? "\r\n" : "\n";
    const edits = (m.edits ?? [[m.from, m.to]]).map(([from, to]) => [from.replace(/\n/g, nl), to.replace(/\n/g, nl)]);
    const counts = edits.map(([from]) => original[file].split(from).length - 1);
    const bad = counts.find((c) => c !== 1);
    if (bad !== undefined) {
      results.push({ ...m, n: i + 1, status: bad === 0 ? "POLA TIDAK DITEMUKAN" : `POLA MUNCUL ${bad}x` });
      continue;
    }
    let mutated = original[file];
    for (const [from, to] of edits) mutated = mutated.replace(from, to);
    writeFileSync(file, mutated);
    let out = "";
    const bundle = `${OUT}/mut-${m.test ?? "sim"}.mjs`;
    try {
      execSync(`npx esbuild ${test.src} --bundle --platform=node --format=esm --outfile=${bundle} --log-level=error`, { stdio: "pipe" });
      out = execSync(`node ${bundle}`, { stdio: "pipe", env: { ...process.env, ...test.env } }).toString();
    } catch (e) {
      out = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    } finally {
      writeFileSync(file, original[file]);
    }
    const failedInv = test.parse(out);
    const caught = m.expect.some((code) => failedInv.includes(code));
    results.push({ ...m, n: i + 1, status: caught ? "TERTANGKAP" : failedInv.length ? "tertangkap invariant lain" : "LOLOS (tes bolong!)", failedInv });
    console.log(`  [${i + 1}/${MUTATIONS.length}] ${caught ? "✓" : "✗"} ${m.name}`);
  }
} finally {
  restore(); // selalu kembalikan berkas asli
}
for (const f of FILES) {
  if (readFileSync(f, "utf8") !== original[f]) throw new Error(`${f} GAGAL dipulihkan — periksa manual!`);
}

console.log("\nUJI MUTASI — apakah simulasi menangkap bug yang sengaja dimasukkan?\n");
let bolong = 0;
for (const r of results) {
  const ok = r.status === "TERTANGKAP";
  if (!ok) bolong++;
  console.log(`  ${ok ? "✓" : "✗"} #${r.n} ${r.name}`);
  console.log(`      diharapkan ${r.expect.join("/")} · ${r.status}${r.failedInv?.length ? ` · gagal: ${r.failedInv.join(", ")}` : ""}`);
}
console.log(`\n${results.length - bolong}/${results.length} mutasi tertangkap`);
if (bolong) process.exitCode = 1;
