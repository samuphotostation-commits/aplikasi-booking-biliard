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
const STAF = "src/data/staff.ts";
const FILES = [ENGINE, BILLING, VENUE, REMOTE, PUBLIC, STAF];
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
    from: `if (!allow(s, "orderFnb") || !s.shift) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      const item = itemOf(s, a.line.itemId);`,
    to: `if (!allow(s, "orderFnb")) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      const item = itemOf(s, a.line.itemId);`,
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
    // Transfer gudang harus MEMINDAH, bukan menciptakan. Mutan ini membiarkan
    // Central mengirim lebih banyak daripada yang dipunyainya.
    name: "Transfer gudang boleh melebihi isi Central",
    expect: ["INV-54"],
    from: `      if (!asal || asal.qty === null || asal.qty < qty) return s;`,
    to: `      if (!asal || asal.qty === null) return s;`,
  },
  {
    // Gudang Bar berdiri sendiri — kalau pagar ini hilang, stok bar bisa
    // ditambah dari Central tanpa ada yang sadar.
    name: "Gudang Bar ikut dipasok Central",
    expect: ["INV-54"],
    from: `      if (!it || !bolehDariCentral(a.itemId, s)) return s;`,
    to: `      if (!it) return s;`,
  },
  {
    // PPN & service sudah termasuk harga (keputusan pemilik 8 Okt 2026), jadi
    // pemecahannya harus menjumlah TEPAT ke gross — tidak boleh ada rupiah
    // yang hilang atau muncul karena pembulatan.
    name: "Pemecahan PPN/service tidak lagi menjumlah tepat ke gross",
    expect: ["INV-08"],
    from: `    const taxK = sisaK - serviceK;`,
    to: `    const taxK = Math.round(dppK * (p.ppn / 100));`,
  },
  {
    // Service 0% harus benar-benar 0, bukan sisa pembulatan — kalau tidak,
    // laporan memunculkan "service" yang tidak pernah dipungut siapa pun.
    name: "Service muncul walau persennya 0",
    expect: ["INV-08"],
    from: `    const serviceK = p.service > 0 && totalPersen > 0
      ? Math.round(sisaK * (p.service / totalPersen)) : 0;`,
    to: `    const serviceK = Math.round(sisaK / 2);`,
  },
  {
    // Peta izin 7 peran (8 Okt 2026) harus benar-benar menolak, bukan sekadar
    // menyembunyikan tab. Mutan ini memberi kru gudang hak membuka meja.
    name: "Kru gudang boleh membuka meja",
    file: STAF,
    test: "peran",
    expect: ["PERAN"],
    from: `  bukaMeja: ["superadmin", "manager", "kru_kasir", "karyawan"],`,
    to: `  bukaMeja: ["superadmin", "manager", "kru_kasir", "karyawan", "kru_gudang"],`,
  },
  {
    // Kebalikannya: peran yang memang bertugas di gudang tidak boleh kehilangan
    // haknya diam-diam. Kalau ini LOLOS, berarti tidak ada yang menguji
    // bahwa kru gudang benar-benar bisa bekerja.
    name: "Kru kitchen & bar kehilangan hak stok gudang",
    file: STAF,
    test: "peran",
    expect: ["PERAN"],
    from: `  kelolaStok: ["superadmin", "manager", "finance", "kru_gudang", "kru_kitchen", "kru_bar"],`,
    to: `  kelolaStok: ["superadmin", "manager", "finance", "kru_gudang"],`,
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
    from: `const running: LiveSession = { ...bk, status: "running", startsAt, fnb };`,
    to: `const running: LiveSession = { ...bk, status: "running", startsAt, fnb, endsAt: now + (bk.endsAt - bk.startsAt) };`,
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
    from: "...ticketsFor(forSession(s, running), [...bk.fnb.filter((l) => l.prepaid), ...f.taken], now, `Pra-order · ${bk.guest}`),",
    to: "",
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
    name: "Pesanan QR diterima walau meja BILIAR belum dibuka kasir",
    expect: ["INV-29"],
    from: `      if (classOf(s, t.id) !== "resto") {
        return \`\${t.name} belum dibuka kasir — minta kasir membuka meja dulu\`;
      }`,
    to: ``,
  },
  {
    // Kebalikannya: meja resto yang dibuka pesanan tamu TETAP harus kosong.
    // Tanpa pemeriksaan ini, pesanan bisa masuk ke meja yang sudah dipesan
    // rombongan lain untuk jam yang sama.
    name: "Meja resto dibuka pesanan tamu walau bentrok reservasi",
    expect: ["INV-01", "INV-29"],
    from: `      if (!tableFreeForRange(s.sessions, t.id, now, now + RESTO_BUKA_MENIT * 60_000, undefined, now)) {
        return \`\${t.name} sudah dipesan untuk jam ini — tanya kasir ya\`;
      }`,
    to: ``,
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
    from: `...(jatahMinuman(line) && x.freeDrinks !== undefined ? { freeDrinks: x.freeDrinks + line.qty } : {}),`,
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
    from: `        tableAmount: pk ? pk.price : (jam ? priceWith(s.rates, kelas, h, jam) : 0),
        rates: { ...s.rates },`,
    to: `        tableAmount: pk ? pk.price : (jam ? priceWith(s.rates, kelas, h, jam) : 0),`,
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
    from: `const refundAmt = f.dropped.filter((l) => l.prepaid).reduce((n, l) => n + lineValue(l), 0);`,
    to: `const refundAmt = 0;`,
  },
  {
    name: "Pulihkan no-show tanpa tiket dapur untuk pra-order",
    expect: ["INV-40"],
    from: "tickets: [...ticketsFor(forSession(s, running), f.taken, now, `Pra-order · ${x.guest}`), ...s.tickets],",
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
    from: 'if (run && o.sessionId && !o.sessionId.startsWith("pub-") && run.id !== o.sessionId) {\n      return `tab ${t.name} sudah berganti — scan QR di meja lagi`;\n    }',
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
    from: `  const released = withStockMoves(s, releaseDue(s, now), now, () => "kembali");\n  const today = businessDateOf(now);\n  if (today <= released.day) return rapikanLampu(rapikanGrup(released));`,
    to: `  const today = businessDateOf(now);\n  const arsipDulu = today > s.day ? closeBooks(closeAbandoned(s, today, now), today, now) : s;\n  const released = withStockMoves(arsipDulu, releaseDue(arsipDulu, now), now, () => "kembali");\n  if (true) return released;`,
  },
  {
    name: "Tutup buku tidak pernah berjalan (setiap aksi makin lambat)",
    test: "soak",
    expect: ["INV-S1"],
    from: `  return rapikanLampu(rapikanGrup(closeBooks(closeAbandoned(released, today, now), today, now)));`,
    to: `  return rapikanLampu(rapikanGrup(closeAbandoned(released, today, now)));`,
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
    from: `        tickets: s.tickets.map((t) => (t.sessionId === from.id && t.lineKey && peta.has(t.lineKey)\n          ? { ...t, sessionId: to.id, tableName: namaMeja(s, to.tableId), lineKey: peta.get(t.lineKey)! }\n          : t)),`,
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
    from: `      if (!adaKunciInduk(list)) return s;\n      if (JSON.stringify(list) === JSON.stringify(s.employees)) return s;`,
    to: `      if (JSON.stringify(list) === JSON.stringify(s.employees)) return s;`,
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
    from: `  const discount = Math.max(0, Math.min(diminta, counterBilliard + counterFnb - dibayarSebagian));`,
    to: `  const discount = diminta;`,
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
  /* ── SMH-11b & SMH-14 & SPL-11 (Okt 2026) ───────────────────────── */
  {
    name: "Compliment boleh diberikan siapa saja",
    expect: ["INV-10"],
    from: `      if (!allow(s, "beriDiskonManual") || !s.shift) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      if (!sess || sess.status !== "running") return s;
      const line = sess.fnb.find((l) => l.key === a.key);`,
    to: `      if (!s.shift) return s;
      const sess = s.sessions.find((x) => x.id === a.sessionId);
      if (!sess || sess.status !== "running") return s;
      const line = sess.fnb.find((l) => l.key === a.key);`,
  },
  {
    name: "Compliment pada baris yang sudah dibayar (uang tamu hilang)",
    expect: ["INV-06","INV-08","INV-44"],
    from: `      if (line.prepaid || paidLineKeys(sess).has(line.key)) return s;
      // Sudah gratis (minuman Paket Siang, atau sudah di-compliment).`,
    to: `      // Sudah gratis (minuman Paket Siang, atau sudah di-compliment).`,
  },
  {
    name: "Diskon manual ditumpuk dengan promo",
    expect: ["INV-07"],
    from: `  const diminta = Math.max(promo?.discount ?? 0, manual);`,
    to: `  const diminta = (promo?.discount ?? 0) + manual;`,
  },
  {
    name: "Diskon manual diterima walau perannya tidak berhak",
    expect: ["INV-07","INV-10"],
    from: `      const pst = allow(s, "beriDiskonManual") ? (a.diskonPersen ?? 0) : 0;`,
    to: `      const pst = a.diskonPersen ?? 0;`,
  },
  {
    name: "Nilai compliment tidak dibekukan saat tab ditutup",
    expect: ["INV-56"],
    from: `          ...(bill.compliment > 0 ? { settledCompliment: bill.compliment } : {}),`,
    to: ``,
  },
  {
    name: "Compliment dihitung sebagai omzet barang",
    expect: ["INV-56"],
    from: `      b.total += nilai;`,
    to: `      b.total += nilai + (l.comp ?? 0);`,
  },
  {
    name: "Split bill tidak ikut dihitung di omzet per shift",
    expect: ["INV-55"],
    from: `    for (const p of s.payments ?? []) {
      if (p.amount > 0) {
        terima(cari(p.shiftId, p.at), p.channel, p.amount, {
          at: p.at, kode, meja, keterangan: p.label ? \`\${s.guest} · \${p.label}\` : s.guest,
          ...(p.mesin ? { mesin: p.mesin } : {}),
        });
      }
    }`,
    to: ``,
  },
  {
    name: "Omzet per shift memaksa pembayaran tanpa shift ke kanal tunai",
    expect: ["INV-55"],
    from: `    if (kanal === "cash") b.tunai += jumlah;
    else if (kanal === "edc") {
      b.edc += jumlah;
      // Mesin lama tanpa penanda dikumpulkan sendiri, BUKAN dibagi rata ke
      // mesin yang ada — setoran bank hanya bisa dicocokkan dengan angka yang
      // benar-benar tercatat atas namanya.
      const m = baris.mesin ?? "Tanpa mesin";
      b.edcPer[m] = (b.edcPer[m] ?? 0) + jumlah;
    }
    else b.qris += jumlah;`,
    to: `    b.tunai += jumlah;`,
  },
  {
    name: "Baris prabayar dilaporkan sebagai penjualan tunai per produk",
    expect: ["INV-56"],
    from: `  if (l.prepaid) return "prabayar";`,
    to: `  if (l.prepaid) return "tunai";`,
  },
  /* ── SMH-4 gabung meja ──────────────────────────────────────────── */
  {
    name: "Gabung meja lintas venue diizinkan",
    expect: ["INV-57"],
    from: `      if (new Set(anggota.map((x) => venueDari(x.tableId))).size > 1) return s;`,
    to: ``,
  },
  {
    name: "Gabungan menerima tab yang sudah ditutup",
    expect: ["INV-57"],
    from: `      if (anggota.some((x) => x.status !== "running")) return s;`,
    to: ``,
  },
  {
    name: "Penanda gabungan tidak pernah dibersihkan",
    expect: ["INV-57"],
    from: `  const next = capVenue(s, rapikanLampu(rapikanGrup(reduce(s, a))), a);`,
    to: `  const next = capVenue(s, rapikanLampu(reduce(s, a)), a);`,
  },
  {
    name: "Tab yang sudah ditutup tetap boleh bergrup",
    expect: ["INV-57"],
    from: `  const sah = (x: LiveSession) => !x.grup || (x.status === "running" && (jalan.get(x.grup) ?? 0) >= 2);`,
    to: `  const sah = (x: LiveSession) => !x.grup || (jalan.get(x.grup) ?? 0) >= 2;`,
  },
  {
    name: "Gabungan bersisa satu meja dibiarkan jadi grup",
    expect: ["INV-57"],
    edits: [[
      `  const sah = (x: LiveSession) => !x.grup || (x.status === "running" && (jalan.get(x.grup) ?? 0) >= 2);`,
      `  const sah = (x: LiveSession) => !x.grup || (x.status === "running" && (jalan.get(x.grup) ?? 0) >= 1);`,
    ]],
  },
  {
    name: "Mesin EDC karangan ikut masuk laporan",
    expect: ["INV-55"],
    from: `  if (kanal !== "edc" || !mesin) return undefined;
  return mesinEdc(s).find((m) => m.toLowerCase() === mesin.trim().toLowerCase());`,
    to: `  if (kanal !== "edc" || !mesin) return undefined;
  return mesin.trim();`,
  },
  {
    name: "Tagihan gabungan cuma menghitung meja pertama",
    expect: ["INV-57"],
    from: `  return grupSesi(st, id)
    .filter((x) => x.status === "running")
    .reduce((n, x) => n + settlementOf(x, st, now, code).due, 0);`,
    to: `  const xs = grupSesi(st, id).filter((x) => x.status === "running");
  return xs.length ? settlementOf(xs[0], st, now, code).due : 0;`,
  },
  {
    // Pagar venue dicabut seluruhnya: kasir Smokehouse bisa mengurus meja biliar.
    name: "Pagar venue dimatikan",
    expect: ["INV-58"],
    from: `  if (lintasVenue(s, a)) return s;              // staf venue sebelah: ditolak mesin`,
    to: `  if (false) return s;                          // staf venue sebelah: ditolak mesin`,
  },
  {
    // Hanya disembunyikan layarnya, mesinnya membiarkan — bentuk kesalahan yang
    // paling mudah terjadi: "kan tombolnya sudah tidak ada".
    name: "Pagar venue hanya memeriksa venue pertama yang disentuh",
    expect: ["INV-58"],
    from: `  return venueAksi(s, a).some((v) => v !== milik);`,
    to: `  return venueAksi(s, a).slice(0, 1).some((v) => v !== milik);`,
  },
  /* DIHAPUS — mutan ekuivalen: "Pindah meja tidak memeriksa venue tujuan".
     `relocate` sudah menuntut meja tujuan SEKELAS, dan `setTableClass`
     menolak mengubah meja biliar jadi meja resto (dan sebaliknya). Jadi
     tidak ada satu pun keadaan di mana mutan ini berperilaku berbeda —
     dibiarkan sebagai mutasi, ia akan selamanya tercatat "tes bolong" untuk
     lubang yang tidak ada. Pagarnya tetap dipasang di mesin sebagai sabuk
     kedua, dengan alasannya ditulis di sana. */
  {
    file: STAF,
    test: "venue",
    // Kalau ini LOLOS, berarti tidak ada yang menguji bahwa akun bisa diikat
    // ke satu venue — dan "dua perusahaan" cuma tulisan di layar.
    name: "Penanda venue akun staf diabaikan",
    expect: ["VENUE"],
    from: `  { id: "u-dewi", name: "Dewi", pin: "3456", role: "kru_kasir", active: true, venue: "smh" },`,
    to: `  { id: "u-dewi", name: "Dewi", pin: "3456", role: "kru_kasir", active: true },`,
  },
  {
    // Stok dipotong sejak reservasi dibuat. Reservasi untuk dua minggu lagi
    // akan menghilangkan barang dari penjualan MALAM INI tanpa ada yang
    // memakannya — dan laporan stok harian ikut bohong.
    name: "Pra-pesan reservasi memotong stok sejak dipesan",
    test: "smh",
    expect: ["SMH"],
    from: `  const pra = withUniqueKeys([], priceLines(s, diminta, 0).lines, "pra")
    .map((l): CartLine => ({ ...l, pra: true }));`,
    to: `  const pra = withUniqueKeys([], priceLines(s, diminta, 0).lines, "pra");`,
  },
  {
    // Kebalikannya: pra-pesan tidak pernah sampai ke dapur saat tamunya
    // datang. Tamu merasa sudah memesan, dapur tidak tahu apa-apa.
    name: "Pra-pesan tidak ikut dikirim ke dapur saat check-in",
    test: "smh",
    expect: ["SMH"],
    from: `          ...ticketsFor(forSession(s, running), [...bk.fnb.filter((l) => l.prepaid), ...f.taken], now, \`Pra-order · \${bk.guest}\`),`,
    to: `          ...ticketsFor(forSession(s, running), bk.fnb.filter((l) => l.prepaid), now, \`Pra-order · \${bk.guest}\`),`,
  },
  {
    // Baris yang belum pernah memotong stok ikut "dikembalikan" ke stok:
    // barang tercipta dari udara, dan baru ketahuan saat opname.
    name: "Pra-pesan ikut dikembalikan ke stok walau belum pernah diambil",
    expect: ["INV-05"],
    from: `  lines = lines.filter((l) => !l.pra);`,
    to: `  lines = lines.slice();`,
  },
  {
    // No-show reservasi resto dihanguskan sebagai omzet, padahal tidak ada
    // satu rupiah pun yang pernah masuk.
    name: "No-show resto menghanguskan makanan yang tak pernah dibayar",
    expect: ["INV-08"],
    from: `      settledBilliard: x.tableAmount, settledFnb: fnbTotalOf({ ...x, fnb: hangus }), settledDiscount: 0,`,
    to: `      settledBilliard: x.tableAmount, settledFnb: fnbTotalOf(x), settledDiscount: 0,`,
  },
  {
    // Isi paket tidak memotong stok: gudang terlihat penuh padahal
    // barangnya sudah keluar, dan baru ketahuan saat opname.
    name: "Isi paket tidak memotong stok",
    test: "rekap",
    expect: ["REKAP"],
    from: `      const f = fulfil(s, isi);`,
    to: `      const f = { taken: isi, dropped: [], stock: s.stock };`,
  },
  {
    // Baris harga paket ikut membuat tiket: dapur menerima dua tiket untuk
    // makanan yang sama, satu atas nama paketnya.
    name: "Baris harga paket ikut jadi tiket dapur",
    test: "rekap",
    expect: ["REKAP"],
    from: `    if (l.paket) return [];`,
    to: ``,
  },
  {
    // Paket bersewa waktu boleh dijual sebagai baris bill: tamu membayar
    // harga blok tanpa mendapat jam mainnya.
    name: "Paket bersewa waktu boleh dijual sebagai baris bill",
    test: "rekap",
    expect: ["REKAP"],
    from: `      if (pk.hours > 0) return s;`,
    to: ``,
  },
  {
    // Pagar tanggal dicabut: karyawan bisa menurunkan jumlah baris lagi,
    // tanpa alasan dan tanpa persetujuan siapa pun.
    name: "Ubah baris pesanan hidup lagi",
    test: "smh",
    expect: ["SMH"],
    from: `      if (now >= KOREKSI_BARIS_DITUTUP) return s;`,
    to: ``,
  },
  {
    // Pagar meja kosong dicabut: pindah pesanan membuka meja yang sedang
    // DIPAKAI tamu lain -- dua sesi di satu meja, dan tagihan yang menumpuk
    // di meja yang sama tanpa ada yang tahu milik siapa.
    name: "Pindah ke meja kosong tidak memeriksa mejanya memang kosong",
    test: "rekap",
    expect: ["REKAP"],
    from: `        if (!canOpenWalkin(s.sessions, meja.id, now)) return s;`,
    to: ``,
  },
  {
    // Uang yang sudah dibayar per orang di meja asal tidak dijaga lagi:
    // barisnya dipindah keluar, tagihan meja asal jatuh di bawah uang yang
    // sudah diterima, dan selisihnya hilang dari rekap.
    name: "Pindah pesanan boleh membuat tagihan lebih kecil dari uang yang sudah dibayar",
    test: "sim",
    expect: ["INV-06", "INV-07", "INV-45"],
    from: `      if (counterWith(from, from.fnb.filter((l) => !dipindah.has(l.key)), s, now) < splitPaidOf(from)) return s;`,
    to: ``,
  },
  {
    // Jatah minuman dikembalikan untuk SETIAP baris Rp 0 — bug sungguhan yang
    // ditemukan simulasi 21 Okt 2026: void satu compliment di meja Paket Siang
    // menambah jatah minuman tamu, dan venue memberi gelas gratis cuma-cuma.
    name: "Void baris Rp 0 apa pun mengembalikan jatah minuman paket",
    test: "rekap",
    expect: ["REKAP"],
    from: `const jatahMinuman = (l: CartLine) =>
  l.unitPrice === 0 && l.comp === undefined && !l.paket && !l.isiPaket
  && PAKET_FREE_CATEGORIES.includes(MENU_CATEGORY_OF[l.itemId]);`,
    to: `const jatahMinuman = (l: CartLine) => l.unitPrice === 0;`,
  },
  {
    // Pagar venue dicabut dari buka-meja-pakai-paket: paket SPL bisa membuka
    // meja Smokehouse, dan harga blok biliar masuk ke bill meja makan.
    name: "Paket venue sebelah boleh membuka meja",
    test: "rekap",
    expect: ["REKAP"],
    from: `        if ((pk.venue ?? "spl") !== venueDari(a.tableId)) return s;`,
    to: ``,
  },
  {
    // Syarat kelas meja dicabut: Paket Siang (harga meja reguler) dipakai
    // membuka meja VVIP yang tarifnya jauh lebih mahal.
    name: "Paket meja reguler boleh dipakai di meja VIP",
    test: "rekap",
    expect: ["REKAP"],
    from: `  if (r.kelas !== "regular") return \`\${pk.name} hanya untuk meja reguler\`;`,
    to: ``,
  },
  {
    // Cap venue dicabut dari jejak: panel jejak Smokehouse ikut menampilkan
    // setiap tutup tab, void, dan diskon meja biliar — dan sebaliknya. Dua
    // venue yang diperlakukan seperti dua perusahaan kembali bercampur persis
    // di tempat yang paling tidak boleh bercampur: catatan pengawasannya.
    name: "Jejak aktivitas tidak dicap venue",
    test: "venue",
    expect: ["VENUE"],
    from: `  const next = capVenue(s, rapikanLampu(rapikanGrup(reduce(s, a))), a);`,
    to: `  const next = rapikanLampu(rapikanGrup(reduce(s, a)));`,
  },
  {
    // Dikembalikan ke daftar lama: bayar per orang dan takeaway bayar di kasir
    // kembali lolos saat internet mati. Kasir menerima uangnya di layar,
    // mencetak struk, tamu pulang — lalu kejadiannya ditolak saat tersambung
    // karena sudah didahului perangkat lain. Uang di laci, tanpa catatan.
    name: "Bayar per orang & takeaway lolos saat terputus",
    file: REMOTE,
    test: "sync",
    expect: ["SYNC"],
    from: `export const MONEY_ACTIONS = new Set<Action["t"]>([
  "settle", "paySplit", "settleOrder", "closeShift", "decideVoid", "settleRefund",
]);`,
    to: `export const MONEY_ACTIONS = new Set<Action["t"]>(["settle", "closeShift", "decideVoid", "settleRefund"]);`,
  },
  {
    // Kelas meja dibaca dari meja yang kebetulan sedang DIJUAL, bukan dari
    // katalog: meja makan cadangan yang baru diaktifkan jatuh ke "regular",
    // dan meteran Rp 29.000/jam mulai berjalan di meja yang seharusnya Rp 0.
    name: "Kelas meja baru ditebak, bukan dibaca katalog",
    test: "venue",
    expect: ["VENUE"],
    from: `const typeOf = (tableId: string): TableType => cariMeja(tableId)?.type ?? "regular";`,
    to: `const typeOf = (tableId: string): TableType => TABLES.find((t) => t.id === tableId)?.type ?? "regular";`,
  },
  {
    // Pagar "meja ini sedang dijual" dicabut dari buka meja: meja yang sudah
    // ditarik dari denah bisa dibuka lagi, dan tamunya duduk di meja yang
    // tidak ada di papan siapa pun.
    name: "Meja yang ditarik dari denah masih bisa dibuka",
    test: "venue",
    expect: ["VENUE"],
    from: `      if (!table || !mejaDipakai(s, a.tableId) || !allow(s, "bukaMeja") || !s.shift) return s;`,
    to: `      if (!table || !allow(s, "bukaMeja") || !s.shift) return s;`,
  },
  {
    // Jam kejadian kembali selalu jam server: meja yang dibuka tiga jam lalu
    // di perangkat yang terputus tercatat baru dibuka saat kirimannya sampai,
    // dan meterannya menagih nyaris nol.
    name: "Jam kejadian memakai jam kiriman, bukan jam aksinya",
    test: "rekap",
    expect: ["REKAP"],
    from: `  const at = jamKejadian(e);
  clockFn = () => at;`,
    to: `  clockFn = () => e.at;`,
  },
  {
    // Pagar jam perangkat dicabut: perangkat dengan jam yang dimajukan bisa
    // mengarang kejadian di masa depan — dan memindahkan omzet ke hari
    // berikutnya tanpa ada yang menyadarinya.
    name: "Jam perangkat dipercaya melebihi jam server",
    test: "rekap",
    expect: ["REKAP"],
    from: `  return Math.min(e.at, Math.max(dev, e.at - MAKS_ANTRE_MS));`,
    to: `  return dev;`,
  },
];

const TESTS = {
  sim: { src: "test/simulation.test.ts", env: { SIMS: "100" }, parse: (out) => [...out.matchAll(/✗ (INV-\d+)/g)].map((x) => x[1]) },
  billing: { src: "test/billing.test.ts", env: {}, parse: (out) => (/SALAH/.test(out) || /Error/.test(out) ? ["BILLING"] : []) },
  soak: { src: "test/soak.test.ts", env: { DAYS: "14" }, parse: (out) => [...out.matchAll(/✗ (INV-S\d+)/g)].map((x) => x[1]) },
  sync: { src: "test/sync.test.ts", env: {}, parse: (out) => (/^FAIL /m.test(out) || /Error/.test(out) ? ["SYNC"] : []) },
  remote: { src: "test/remote.test.ts", env: {}, parse: (out) => (/^FAIL /m.test(out) || /Error/.test(out) ? ["LINTAS"] : []) },
  // Peta izin: satu-satunya bagian yang harus dijaga DUA ARAH (hak yang
  // hilang tidak pernah terlihat di simulasi — ditolak adalah hal normal).
  peran: { src: "test/peran.test.ts", env: {}, parse: (out) => (/^FAIL /m.test(out) || /Error/.test(out) ? ["PERAN"] : []) },
  // Pemisahan dua venue: arah "yang boleh wajib tetap boleh" juga tidak
  // pernah terlihat di simulasi, sama alasannya dengan peta izin.
  venue: { src: "test/venue.test.ts", env: {}, parse: (out) => (/^FAIL /m.test(out) || /Error/.test(out) ? ["VENUE"] : []) },
  // Alur Smokehouse ujung ke ujung: pesan online, pesan di kasir, dan
  // reservasi meja + makanannya sekalian.
  smh: { src: "test/smokehouse.test.ts", env: {}, parse: (out) => (/^FAIL /m.test(out) || /Error/.test(out) ? ["SMH"] : []) },
  // Rekap tiga jenis, omzet per shift, pajak per lini, dan paket berisi barang.
  rekap: { src: "test/rekap.test.ts", env: {}, parse: (out) => (/^FAIL /m.test(out) || /Error/.test(out) ? ["REKAP"] : []) },
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
