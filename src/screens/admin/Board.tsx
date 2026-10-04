import { useState } from "react";
import { QrisKasir } from "./QrisKasir";
import { cetakSenyapMungkin, cetakStruk } from "../../lib/cetak";
import { motion, AnimatePresence } from "framer-motion";
import { TABLES, CLASS_LABEL, CLASS_SHORT, tableLabel } from "../../data/venue";
import { VOID_REASONS } from "../../data/staff";
import {
  useAdmin, recap, canOpenWalkin, blockEndOf, TURNAROUND_MIN, canExtend, nextSessionOn, hourIdx, OPEN_IDX, CLOSE_IDX,
  settlementOf, lineValue, maintenanceBlockers, relocationTargets, classOf, sessionType, meterEndOf,
  splitPaidOf, paidLineKeys, GRACE_MIN, maxWalkinHours, priceWith,
} from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { MENU, findItem } from "../../data/menu";
import { Countdown, Elapsed, jam, statusStyle } from "./AdminShell";
import ClashAlert from "./ClashAlert";
import OrderPicker from "./OrderPicker";
import { activeController } from "../../lib/lightController";
import { Button } from "../../components/UI";
import type { LiveSession } from "../../data/live";

export default function Board() {
  const { a, dispatchA, byTable, tick, allow } = useAdmin();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "running" | "free" | "soon">("all");
  const r = recap(a);
  void tick;

  const cocok = (t: (typeof TABLES)[number]) => {
    const s = byTable.get(t.id);
    if (filter === "running") return s?.status === "running";
    if (filter === "free") return !s;
    if (filter === "soon") return s?.status === "booked";
    return true;
  };
  const rows = TABLES.filter((t) => t.type !== "resto" && cocok(t));
  const restoRows = TABLES.filter((t) => t.type === "resto" && cocok(t));

  const sel = open ? TABLES.find((t) => t.id === open)! : null;
  const selSession = open ? byTable.get(open) : undefined;

  return (
    <div className="pb-6">
      <ClashAlert />

      <div className="grid grid-cols-4 gap-2">
        <Stat n={r.free} label="Kosong" tone="text-emerald-400" onClick={() => setFilter("free")} on={filter === "free"} />
        <Stat n={r.running} label="Dipakai" tone="text-red-400" onClick={() => setFilter("running")} on={filter === "running"} />
        <Stat n={r.booked} label="Booking" tone="text-amber" onClick={() => setFilter("soon")} on={filter === "soon"} />
        <Stat n={r.lampuNyala} label="Lampu" tone="text-yellow-300" onClick={() => setFilter("all")} on={filter === "all"} />
      </div>

      {allow("kontrolLampu") && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-dim">
            Lampu meja
            {!activeController.connected && <span className="text-amber/80"> · simulasi</span>}:
          </span>
          <button onClick={() => dispatchA({ t: "allLights", on: false })}
            className="min-h-[34px] rounded-lg border border-line bg-ink-2 px-3 text-[12px] text-mute">
            Matikan semua
          </button>
          <button onClick={() => dispatchA({ t: "allLights", on: true })}
            className="min-h-[34px] rounded-lg border border-line bg-ink-2 px-3 text-[12px] text-mute">
            Nyalakan semua
          </button>
        </div>
      )}

      {filter !== "all" && (
        <button onClick={() => setFilter("all")}
          className="mt-2 text-xs text-amber underline underline-offset-4">
          Tampilkan semua {TABLES.length} meja
        </button>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
        {rows.map((t) => <Tile key={t.id} table={t} onOpen={() => setOpen(t.id)} />)}
      </div>

      {restoRows.length > 0 && (
        <>
          <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
            Smokehouse Resto · {restoRows.length} meja
          </h3>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
            {restoRows.map((t) => <Tile key={t.id} table={t} onOpen={() => setOpen(t.id)} />)}
          </div>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
        <span>○ Kosong</span><span>● Dipakai</span><span>◔ Dibooking</span>
        <span>◌ Ditahan (tamu sedang bayar QRIS)</span>
        <span>✕ Rusak</span><span className="text-yellow-300">◉ Lampu nyala</span>
      </div>

      <AnimatePresence>
        {sel && (
          <TableSheet
            table={sel}
            session={selSession}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Satu kotak meja di papan — sama untuk meja biliar dan meja resto. */
function Tile({ table, onOpen }: { table: (typeof TABLES)[number]; onOpen: () => void }) {
  const { a, byTable } = useAdmin();
  const s = byTable.get(table.id);
  const st = statusStyle(s?.status ?? "free");
  const lampu = a.lights[table.id];
  const kelas = classOf(a, table.id);
  const bill = s && s.status === "running" ? settlementOf(s, a).due : 0;
  return (
    <motion.button layout whileTap={{ scale: 0.95 }} onClick={onOpen}
      className={`relative flex min-h-[80px] flex-col items-start justify-between rounded-xl
        border p-2 text-left ${st.ring}`}>
      <div className="flex w-full items-center justify-between">
        <span className="font-display text-lg leading-none text-cream">
          {kelas === "resto" ? `R${table.no}` : kelas === "regular" ? table.no : `V${table.no}`}
        </span>
        <span className="flex items-center gap-1">
          {kelas !== "regular" && (
            <span className={`text-[8px] font-bold uppercase tracking-wider ${kelas === "vvip" ? "text-brick-lit" : kelas === "vip" ? "text-amber/80" : "text-dim"}`}>
              {CLASS_SHORT[kelas]}
            </span>
          )}
          {lampu && <span className="text-[10px] leading-none text-yellow-300" title="Lampu menyala">◉</span>}
          <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden="true" />
        </span>
      </div>
      <div className="w-full">
        <div className="text-[9px] uppercase tracking-wider text-dim">
          {st.icon} {st.label}
        </div>
        {s?.status === "running" && (
          <>
            <div className="text-[11px] font-semibold">
              {s.source === "walkin" && !s.blockHours
                ? <Elapsed since={s.startsAt} /> : <Countdown endsAt={s.endsAt} />}
            </div>
            {s.source === "online" && bill <= 0 ? (
              <div className="truncate text-[10px] font-bold text-emerald-400">LUNAS (ONLINE)</div>
            ) : (
              <div className="truncate text-[10px] text-amber">{rupiah(bill)}</div>
            )}
          </>
        )}
        {s?.status === "booked" && (
          <div className="truncate text-[10px] text-amber">{s.guest}{s.pax ? ` · ${s.pax} org` : ""}</div>
        )}
        {s?.status === "hold" && (
          <div className="truncate text-[10px] text-amber/80">{s.guest} · bayar…</div>
        )}
      </div>
    </motion.button>
  );
}

function Stat({ n, label, tone, onClick, on }: {
  n: number; label: string; tone: string; onClick: () => void; on: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-2.5 text-left transition-colors ${
        on ? "border-amber bg-amber/10" : "border-line bg-ink-2"
      }`}>
      <div className={`font-display text-2xl leading-none ${tone}`}>{n}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-dim">{label}</div>
    </button>
  );
}

/* ═════════════ Sheet kelola meja ═════════════ */

function TableSheet({
  table, session, onClose,
}: { table: (typeof TABLES)[number]; session?: LiveSession; onClose: () => void }) {
  const { a, dispatchA, allow, peek } = useAdmin();
  const [guest, setGuest] = useState("");
  const [mode, setMode] = useState<"main" | "settle" | "maint" | "void" | "order" | "receipt" | "move" | "koreksi" | "split" | "pindahItem" | "meteran">("main");
  /** Baris F&B yang sedang di-void (null = void seluruh sesi). */
  const [voidKey, setVoidKey] = useState<string | null>(null);
  /** Baris yang sedang dikoreksi (salah jumlah / salah item). */
  const [koreksiKey, setKoreksiKey] = useState<string | null>(null);
  const [koreksiQty, setKoreksiQty] = useState(1);
  const [koreksiItem, setKoreksiItem] = useState("");
  /** Baris yang dipilih untuk dibayar per orang atau dipindah ke meja lain. */
  const [pilih, setPilih] = useState<string[]>([]);
  const [nominal, setNominal] = useState("");
  const [namaOrang, setNamaOrang] = useState("");
  const [jamStop, setJamStop] = useState("");
  /** Buka meja: null = open bill bermeteran, angka = paket per jam. */
  const [jamPaket, setJamPaket] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [struk, setStruk] = useState<{
    no: string; meja: string; tamu: string; mulai: number; selesai: number;
    menit: number | null; billiard: number; fnb: number; diskon: number; promo?: string;
    prabayar: number; bayar: number; metode: string; kasir: string;
    items: { name: string; qty: number; total: number }[];
  } | null>(null);
  const [kode, setKode] = useState("");
  const [alasan, setAlasan] = useState(VOID_REASONS[0]);

  const bisaBuka = canOpenWalkin(a.sessions, table.id);
  const kelas = classOf(a, table.id);
  const tarifKelas = kelas === "vip" ? a.rates.vip : kelas === "vvip" ? a.rates.vvip
    : hourIdx(Date.now()) < 18 ? a.rates.regularDay : a.rates.regularNight;
  const lampu = a.lights[table.id];
  const blockers = maintenanceBlockers(a, table.id);
  const nowTs = Date.now();
  const jamIdx = hourIdx(nowTs);
  const diLuarJam = jamIdx < OPEN_IDX || jamIdx >= CLOSE_IDX;
  // Open bill tidak punya jam selesai — kasir perlu tahu kapan meja harus kosong lagi.
  const nextBooking = nextSessionOn(a.sessions, table.id, nowTs);
  const harusSelesai = nextBooking ? nextBooking.startsAt - TURNAROUND_MIN * 60_000 : null;
  const voidLine = voidKey && session ? session.fnb.find((l) => l.key === voidKey) : undefined;
  const moveTargets = session && mode === "move" ? relocationTargets(a, session) : [];
  /** Paket per jam paling lama yang masih muat sebelum booking berikutnya / jam tutup. */
  const maksJam = Math.min(maxWalkinHours(a.sessions, table.id), Math.max(0, CLOSE_IDX - hourIdx(Date.now())));
  const hargaPaket = (j: number) => priceWith(a.rates, kelas, hourIdx(Date.now()), j);
  const extendProblem = (minutes: number) => {
    if (!session || canExtend(a, session.id, minutes)) return null;
    return hourIdx(session.endsAt) + minutes / 60 > CLOSE_IDX ? "melewati jam tutup 02.00" : "bentrok dengan booking berikutnya";
  };
  const flash = (text: string) => { setNote(text); setTimeout(() => setNote(null), 5000); };

  // Angka di layar HARUS sama dengan yang dicatat mesin — jadi layar memanggil
  // rumus yang sama (settlementOf), bukan menghitung sendiri.
  const calc = session ? settlementOf(session, a, Date.now(), kode || undefined) : null;
  const bill = calc ? { amount: calc.billiard, detail: calc.detail } : null;
  const fnb = calc?.fnb ?? 0;
  const billiard = calc?.billiard ?? 0;
  const promo = calc?.promo ?? null;
  const diskon = calc?.discount ?? 0;
  const due = calc?.due ?? 0;
  /** Uang yang sudah diterima kasir lewat split bill. */
  const sudahSplit = session ? splitPaidOf(session) : 0;
  const lunasKey = session ? paidLineKeys(session) : new Set<string>();
  /** Baris yang masih bisa dikoreksi / dipindah / dibayar per orang. */
  const barisBebas = (session?.fnb ?? []).filter((l) => !l.prepaid && l.unitPrice !== 0 && !lunasKey.has(l.key));
  const sudahDiantar = (key: string) =>
    a.tickets.some((t) => t.sessionId === session?.id && t.lineKey === key && t.status === "served");
  /** Meja lain yang sedang jalan — tujuan pindah pesanan yang salah meja. */
  const mejaJalan = a.sessions.filter((x) => x.status === "running" && x.id !== session?.id);
  const totalPilih = (session?.fnb ?? []).filter((l) => pilih.includes(l.key)).reduce((n, l) => n + lineValue(l), 0);
  const meterStop = session && session.source === "walkin" && session.status === "running"
    ? meterEndOf(session, Date.now()) : 0;
  const meterBerhenti = !!meterStop && meterStop < Date.now() - 60_000;

  const tutupMejaLunas = () => {
    if (!session) return;
    const at = Date.now();
    const final = settlementOf(session, a, at);
    setStruk({
      no: `SPL-${at.toString(36).toUpperCase().slice(-6)}`,
      meja: table.name, tamu: session.guest,
      mulai: session.startsAt, selesai: at,
      menit: final.detail?.billedMinutes ?? null,
      billiard: final.billiard, fnb: final.fnb, diskon: final.discount,
      promo: final.promo?.promo.name,
      prabayar: session.paidOnline + splitPaidOf(session), bayar: 0,
      metode: "Lunas Online (QRIS)", kasir: a.me?.name ?? "-",
      items: session.fnb.map((l) => {
        const it = findItem(l.itemId);
        return {
          name: `${it?.name ?? l.itemId}${l.variant ? ` (${l.variant})` : ""}${l.unitPrice === 0 ? " (gratis)" : ""}`,
          qty: l.qty, total: lineValue(l),
        };
      }),
    });
    dispatchA({ t: "settle", id: session.id, channel: "qris_online" });
    flash(`Meja ${table.name} selesai ditutup (Lunas Online).`);
    setMode("receipt");
  };

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="safe-b fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl
          border-t border-line bg-ink-2 p-5"
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        role="dialog" aria-modal="true" aria-label={`Kelola ${table.name}`}>
        <div className="mx-auto max-w-lg">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-2" />
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-2xl uppercase tracking-wide text-cream">{table.name}</h3>
            <span className="text-[11px] uppercase tracking-wider text-dim">
              {CLASS_LABEL[kelas]}{kelas !== "resto" && ` · ${rupiah(tarifKelas)}/jam`}
            </span>
          </div>

          {/* Lampu meja — selalu tersedia, bahkan saat meja kosong */}
          {allow("kontrolLampu") && (
            <button
              onClick={() => dispatchA({ t: "toggleLight", tableId: table.id })}
              className={`mt-3 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                lampu ? "border-yellow-400/50 bg-yellow-400/10" : "border-line bg-ink"
              }`}>
              <span className={`text-xl leading-none ${lampu ? "text-yellow-300" : "text-dim"}`}>
                {lampu ? "◉" : "○"}
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-cream">
                  Lampu {lampu ? "menyala" : "mati"}
                </div>
                <div className="text-[11px] text-dim">Ketuk untuk {lampu ? "mematikan" : "menyalakan"}</div>
              </div>
            </button>
          )}

          {/* ── Meja kosong → buka open bill ─────────────── */}
          {!session && mode === "main" && (
            <div className="mt-4 space-y-3">
              <input value={guest} onChange={(e) => setGuest(e.target.value)}
                placeholder="Nama tamu (opsional)"
                className="w-full rounded-xl border border-line bg-ink px-4 py-3 text-cream
                  placeholder:text-dim focus:border-amber focus:outline-none" />

              {kelas !== "resto" && (
                <div className="rounded-xl border border-line bg-ink p-3">
                  <div className="text-[11px] uppercase tracking-wider text-dim">Cara buka meja</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button onClick={() => setJamPaket(null)} aria-pressed={jamPaket === null}
                      className={`min-h-[44px] rounded-lg border px-2 text-[13px] font-semibold ${
                        jamPaket === null ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink-2 text-cream"
                      }`}>Open bill<div className="text-[10px] font-normal text-dim">meteran per menit</div></button>
                    <button onClick={() => setJamPaket(jamPaket === null ? Math.min(2, maksJam || 1) : jamPaket)}
                      aria-pressed={jamPaket !== null} disabled={maksJam < 1}
                      className={`min-h-[44px] rounded-lg border px-2 text-[13px] font-semibold disabled:opacity-35 ${
                        jamPaket !== null ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink-2 text-cream"
                      }`}>Paket per jam<div className="text-[10px] font-normal text-dim">harga tetap</div></button>
                  </div>
                  {jamPaket !== null && (
                    <>
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {[1, 2, 3, 4].map((j) => (
                          <button key={j} disabled={j > maksJam} onClick={() => setJamPaket(j)} aria-pressed={jamPaket === j}
                            className={`min-h-[44px] rounded-lg border text-[13px] font-semibold disabled:opacity-30 ${
                              jamPaket === j ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-cream"
                            }`}>
                            {j} jam
                            <div className={`text-[9px] font-normal ${jamPaket === j ? "text-ink/70" : "text-dim"}`}>
                              {rupiah(hargaPaket(j))}
                            </div>
                          </button>
                        ))}
                      </div>
                      {maksJam < 4 && (
                        <p className="mt-1.5 text-[11px] text-dim">
                          {maksJam < 1
                            ? "Tidak cukup waktu sebelum booking berikutnya — pakai open bill."
                            : `Maksimal ${maksJam} jam karena ada booking berikutnya atau jam tutup.`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-line bg-ink px-3.5 py-3 text-[13px]">
                <div className="mb-1.5 font-semibold text-cream">
                  {kelas === "resto" ? "Meja resto — tanpa meteran jam"
                    : jamPaket !== null ? `Paket ${jamPaket} jam · ${rupiah(hargaPaket(jamPaket))}`
                      : `Open bill — meteran jalan · ${rupiah(tarifKelas)}/jam`}
                </div>
                <ul className="space-y-0.5 text-[12px] leading-snug text-dim">
                  {kelas === "resto" ? (
                    <>
                      <li>• Yang ditagih hanya <span className="text-cream">makanan &amp; minuman</span></li>
                      <li>• Bisa dibayar per orang (split bill) saat tamu pulang bergantian</li>
                    </>
                  ) : jamPaket !== null ? (
                    <>
                      <li>• Harga <span className="text-cream">tetap</span>, tidak bertambah per menit</li>
                      <li>• Selesai pukul <span className="text-cream">{jam(Date.now() + jamPaket * 3_600_000)}</span>; bisa diperpanjang per jam</li>
                      <li>• Batal dalam {GRACE_MIN} menit pertama: tidak ditagih</li>
                    </>
                  ) : (
                    <>
                      <li>• Batal dalam <span className="text-cream">{GRACE_MIN} menit</span> pertama: tidak ditagih</li>
                      <li>• Lewat {GRACE_MIN} menit: langsung terhitung <span className="text-cream">30 menit</span></li>
                      <li>• Setelah itu dihitung <span className="text-cream">per menit</span>, berhenti otomatis pukul 05.00 pagi</li>
                    </>
                  )}
                </ul>
              </div>

              {!bisaBuka ? (
                <p className="text-[12px] leading-snug text-amber">
                  {diLuarJam
                    ? "Di luar jam operasional (11.00–02.00) — meja tidak bisa dibuka."
                    : "Meja ini tidak bisa dibuka — ada booking online yang segera masuk."}
                </p>
              ) : nextBooking && harusSelesai && (
                <p className="text-[12px] leading-snug text-amber/90">
                  Ada booking {nextBooking.guest} pukul {jam(nextBooking.startsAt)} — open bill harus ditutup
                  sebelum {jam(harusSelesai)}. Peringatan muncul 10 menit sebelumnya.
                </p>
              )}
              <Button full disabled={!bisaBuka || !allow("bukaMeja") || (jamPaket !== null && jamPaket > maksJam)}
                onClick={() => {
                  dispatchA({ t: "walkin", tableId: table.id, guest, ...(jamPaket !== null ? { hours: jamPaket } : {}) });
                  const dibuka = peek().sessions.some((x) => x.tableId === table.id && x.status === "running");
                  if (dibuka) onClose();
                  else flash("Meja tidak jadi dibuka — cek jam operasional atau booking berikutnya.");
                }}>
                {jamPaket !== null ? `Buka ${jamPaket} Jam · ${rupiah(hargaPaket(jamPaket))}` : "Mulai Open Bill"}
              </Button>
              {allow("kelolaMeja") && (
                <button onClick={() => setMode("maint")}
                  className="min-h-[40px] w-full text-xs text-dim underline underline-offset-4">
                  Tandai meja rusak
                </button>
              )}
            </div>
          )}

          {/* ── Slot ditahan: tamu sedang membayar QRIS ─── */}
          {session?.status === "hold" && mode === "main" && (
            <div className="mt-4 space-y-3">
              <div className="divide-y divide-line rounded-xl border border-amber/40">
                <Row k="Status" v="Ditahan — tamu sedang membayar" />
                <Row k="Tamu" v={session.guest} />
                <Row k="Jam booking" v={`${jam(session.startsAt)} – ${jam(session.endsAt)}`} />
                {session.holdUntil && <Row k="Dilepas otomatis" v={`${jam(session.holdUntil)} bila tidak dibayar`} />}
              </div>
              <p className="text-[12px] leading-snug text-dim">
                Slot ini tidak bisa dijual ke orang lain selama pembayaran berlangsung.
                Tidak ada tindakan kasir yang diperlukan.
              </p>
            </div>
          )}

          {/* ── Sesi aktif ───────────────────────────────── */}
          {session && session.status !== "hold" && mode === "main" && (
            <div className="mt-4 space-y-3">
              <div className="divide-y divide-line rounded-xl border border-line">
                <Row k="Status" v={statusStyle(session.status).label} />
                <Row k="Tamu" v={session.guest} />
                <Row k="Jenis" v={session.source === "online" ? "Booking online (prabayar)"
                  : session.blockHours ? `Paket ${session.blockHours} jam (bayar di kasir)` : "Open bill"} />
                {session.status === "running" && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-[13px] text-dim">
                      {session.source === "walkin" && !session.blockHours ? "Sudah berjalan" : "Sisa waktu"}
                    </span>
                    <span className="font-serif text-base font-bold">
                      {session.source === "walkin" && !session.blockHours
                        ? <Elapsed since={session.startsAt} />
                        : <Countdown endsAt={session.endsAt} />}
                    </span>
                  </div>
                )}
                <Row k="Mulai" v={jam(session.startsAt)} />
                {session.status !== "maintenance" && session.source === "online" && (
                  <Row k={`Terkunci s/d (+${TURNAROUND_MIN}m)`} v={jam(blockEndOf(session))} />
                )}
              </div>

              {/* Rincian tagihan berjalan */}
              {session.status === "running" && (
                <div className="divide-y divide-line rounded-xl border border-line">
                  {bill?.detail && (
                    <div className="px-4 py-2.5">
                      <div className="mb-1 flex justify-between text-[13px]">
                        <span className="text-dim">Meja ({bill.detail.billedMinutes} menit)</span>
                        <span className="font-serif text-cream">{rupiah(billiard)}</span>
                      </div>
                      {bill.detail.segments.map((sg, i) => (
                        <div key={i} className="flex justify-between text-[11px] text-dim">
                          <span>{String(sg.fromHour % 24).padStart(2, "0")}.00 · {Math.round(sg.minutes)} mnt @ {rupiah(sg.ratePerHour)}/jam</span>
                          <span className="tabular-nums">{rupiah(Math.round(sg.amount))}</span>
                        </div>
                      ))}
                      {bill.detail.minimumApplied && (
                        <p className="mt-1 text-[11px] text-amber/90">
                          Baru main {bill.detail.playedMinutes} menit — ditagih minimum 30 menit.
                        </p>
                      )}
                      {bill.detail.graceApplied && (
                        <p className="mt-1 text-[11px] text-emerald-400">
                          Masih dalam toleransi batal {GRACE_MIN} menit — kalau ditutup sekarang meja tidak ditagih.
                          Lewat menit ke-{GRACE_MIN}, langsung terhitung 30 menit.
                        </p>
                      )}
                      {meterBerhenti && (
                        <p className="mt-1 text-[11px] text-amber">
                          Meteran berhenti pukul {jam(meterStop)}
                          {session.stoppedAt ? " (dihentikan superadmin)" : " — batas meteran jam 05.00 pagi"}. Waktu sesudah itu tidak ditagih.
                        </p>
                      )}
                    </div>
                  )}
                  {sessionType(session) === "resto" && (
                    <Row k="Meja resto" v="tanpa sewa waktu" />
                  )}
                  {!bill?.detail && <Row k="Meja (prabayar)" v={rupiah(billiard)} />}
                  <Row k={`Makanan & minuman (${session.fnb.reduce((n, l) => n + l.qty, 0)} porsi)`} v={rupiah(fnb)} />
                  {diskon > 0 && (
                    <Row k={`Promo ${promo!.promo.name}`} v={`− ${rupiah(diskon)}`} accent />
                  )}
                  {session.paidOnline > 0 && (
                    <Row k="Sudah dibayar online" v={`− ${rupiah(session.paidOnline)}`} accent />
                  )}
                  {sudahSplit > 0 && (
                    <Row k={`Sudah dibayar di kasir (${(session.payments ?? []).length}×)`} v={`− ${rupiah(sudahSplit)}`} accent />
                  )}
                  {session.source === "online" && due <= 0 ? (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                      <span className="font-semibold text-emerald-300">Status tagihan</span>
                      <span className="font-serif text-lg font-bold text-emerald-400">LUNAS (Prabayar Online)</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-amber/10 px-4 py-3">
                      <span className="font-semibold text-cream">{sudahSplit > 0 ? "Sisa tagihan" : "Tagihan berjalan"}</span>
                      <span className="font-serif text-xl font-bold text-amber">{rupiah(due)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Daftar F&B: koreksi jumlah/item, atau void per baris */}
              {session.fnb.length > 0 && (
                <div className="rounded-xl border border-line">
                  <div className="border-b border-line px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-dim">
                    Pesanan
                  </div>
                  {session.fnb.map((l) => {
                    const it = findItem(l.itemId);
                    if (!it) return null;
                    const lunas = lunasKey.has(l.key);
                    const diantar = sudahDiantar(l.key);
                    const bisaKoreksi = session.status === "running" && !l.prepaid && !lunas && l.unitPrice !== 0 && !diantar;
                    return (
                      <div key={l.key} className="flex items-center gap-2 px-4 py-2">
                        <span className="flex-1 truncate text-[13px] text-cream">
                          {l.qty}× {it.name}{l.variant ? ` (${l.variant})` : ""}
                          {diantar && <span className="ml-1 text-[10px] text-dim">diantar</span>}
                        </span>
                        <span className="font-serif text-[13px] tabular-nums text-mute">
                          {l.unitPrice === 0 ? "gratis" : rupiah(lineValue(l))}
                        </span>
                        {l.prepaid ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300"
                            title="Sudah dibayar online — batalkan lewat void pesanan di tab Kasir">lunas</span>
                        ) : lunas ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300"
                            title="Sudah dibayar di kasir lewat split bill">dibayar</span>
                        ) : session.status === "running" && (
                          <>
                            {bisaKoreksi && allow("koreksiPesanan") && (
                              <button
                                onClick={() => {
                                  setKoreksiKey(l.key); setKoreksiQty(l.qty); setKoreksiItem(l.itemId); setMode("koreksi");
                                }}
                                className="min-h-[32px] rounded px-1.5 text-[11px] text-amber">ubah</button>
                            )}
                            <button
                              onClick={() => { setVoidKey(l.key); setMode("void"); }}
                              className="min-h-[32px] rounded px-1.5 text-[11px] text-red-300">void</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pembayaran yang sudah masuk sebelum tab ditutup */}
              {(session.payments ?? []).length > 0 && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                  <div className="border-b border-emerald-500/20 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                    Sudah dibayar di kasir
                  </div>
                  {(session.payments ?? []).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-1.5 text-[12px]">
                      <span className="truncate text-mute">
                        {jam(p.at)} · {p.channel === "cash" ? "Tunai" : p.channel === "edc" ? "Kartu/EDC" : "QRIS"}
                        {p.label ? ` · ${p.label}` : ""}{p.keys?.length ? ` · ${p.keys.length} pesanan` : ""}
                      </span>
                      <span className="shrink-0 font-serif tabular-nums text-cream">{rupiah(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {session.status === "maintenance" ? (
                <Button full variant="ghost"
                  onClick={() => { dispatchA({ t: "toggleMaintenance", tableId: table.id }); onClose(); }}>
                  Aktifkan Kembali Meja Ini
                </Button>
              ) : (
                <>
                  {session.status === "booked" && (
                    <p className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] leading-snug text-amber">
                      Tamu belum check-in. Masukkan kode check-in di tab Kasir saat tamu datang.
                      Kalau tidak datang 20 menit setelah mejanya siap, booking dilepas otomatis.
                    </p>
                  )}
                  {session.status === "booked" && bisaBuka && allow("bukaMeja") && (
                    <div className="rounded-xl border border-line bg-ink px-3.5 py-3">
                      <p className="text-[12px] leading-snug text-dim">
                        Meja masih bisa dipakai open bill singkat sampai {jam(session.startsAt - TURNAROUND_MIN * 60_000)}.
                      </p>
                      <Button full variant="ghost"
                        onClick={() => { dispatchA({ t: "walkin", tableId: table.id, guest }); onClose(); }}>
                        Mulai Open Bill
                      </Button>
                    </div>
                  )}
                  {session.source === "online" && session.status === "running" && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {[60, 120].map((m) => (
                          <Button key={m} variant="ghost" disabled={!!extendProblem(m)}
                            onClick={() => {
                              dispatchA({ t: "extend", id: session.id, minutes: m });
                              const after = peek().sessions.find((x) => x.id === session.id);
                              flash(after && after.endsAt > session.endsAt
                                ? `Diperpanjang sampai ${jam(after.endsAt)} — tambahan ditagih saat tutup tab.`
                                : "Perpanjangan ditolak.");
                            }}>
                            +{m / 60} jam
                          </Button>
                        ))}
                      </div>
                      {extendProblem(60) && (
                        <p className="text-[11px] leading-snug text-dim">Tidak bisa diperpanjang: {extendProblem(60)}.</p>
                      )}
                    </>
                  )}
                  {session.status === "running" && allow("bukaMeja") && (
                    <Button full variant="ghost" onClick={() => setMode("move")}>Pindah Meja</Button>
                  )}
                  {session.status === "running" && allow("koreksiPesanan") && barisBebas.length > 0 && (
                    <Button full variant="ghost"
                      onClick={() => { setPilih([]); setMode("pindahItem"); }}>
                      Pindahkan Pesanan ke Meja Lain
                    </Button>
                  )}
                  {session.status === "running" && allow("tutupTab") && due > 0 && (
                    <Button full variant="ghost"
                      onClick={() => { setPilih([]); setNominal(""); setNamaOrang(""); setMode("split"); }}>
                      Bayar Sebagian / Per Orang
                    </Button>
                  )}
                  {session.status === "running" && session.source === "walkin" && allow("koreksiWaktu") && (
                    <button onClick={() => { setJamStop(jam(meterEndOf(session, Date.now()))); setMode("meteran"); }}
                      className="min-h-[40px] w-full text-xs text-dim underline underline-offset-4">
                      Koreksi jam berhenti meteran
                    </button>
                  )}
                  {note && <p role="status" className="text-[12px] text-amber">{note}</p>}
                  {session.status === "running" && allow("orderFnb") && (
                    <Button full variant="ghost" onClick={() => setMode("order")}>
                      + Tambah Makanan / Minuman
                    </Button>
                  )}
                  {session.status === "running" && (
                    session.source === "online" && due <= 0 ? (
                      <Button full className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold" onClick={tutupMejaLunas}>
                        ✓ Selesai &amp; Tutup Meja (Lunas)
                      </Button>
                    ) : session.source === "online" && due > 0 ? (
                      <Button full onClick={() => setMode("settle")}>
                        Bayar Tambahan ({rupiah(due)}) &amp; Tutup Meja
                      </Button>
                    ) : (
                      <Button full onClick={() => setMode("settle")}>Tutup Tab &amp; Bayar</Button>
                    )
                  )}
                  {/* QR bisa ditunjukkan SEBELUM masuk layar tutup tab: tamu sering
                      minta bayar duluan sambil main. Nominalnya ikut tagihan berjalan. */}
                  {due > 0 && allow("tutupTab") && (
                    <QrisKasir amount={due} ringkas={`Bayar ${table.name}`} kode={table.id} />
                  )}
                  <button onClick={() => { setVoidKey(null); setMode("void"); }}
                    className="min-h-[40px] w-full text-xs text-red-300 underline underline-offset-4">
                    Void seluruh sesi ini
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Tutup tab ────────────────────────────────── */}
          {session && mode === "settle" && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-4 text-center">
                <div className="text-[11px] uppercase tracking-wider text-dim">
                  {session.source === "online" ? "Sisa Tagihan Tambahan" : "Total ditagih"}
                </div>
                <div className="font-serif text-3xl font-bold text-amber">{rupiah(due)}</div>
                <div className="mt-1 text-[11px] text-dim">
                  {session.source === "online" ? (
                    <>Sewa awal {rupiah(session.paidOnline)} sudah lunas online · Meja {rupiah(billiard)} · F&amp;B {rupiah(fnb)}</>
                  ) : (
                    <>Meja {rupiah(billiard)} · F&amp;B {rupiah(fnb)}</>
                  )}
                  {diskon > 0 && ` · promo −${rupiah(diskon)}`}
                  {sudahSplit > 0 && ` · sudah dibayar ${rupiah(sudahSplit)}`}
                </div>
                {session.source === "online" && (
                  <div className="mt-2 text-[11px] font-medium text-emerald-400">
                    Sewa awal telah lunas dibayar via online. Kasir hanya menagih sisa biaya perpanjangan / menu tambahan.
                  </div>
                )}
                {bill?.detail?.graceApplied && (
                  <div className="mt-1 text-[11px] text-emerald-400">
                    Batal dalam {GRACE_MIN} menit pertama — sewa meja tidak ditagih.
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-wider text-dim">
                  Kode promo (opsional)
                </label>
                <input value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())}
                  placeholder="mis. COMBO50"
                  className="w-full rounded-xl border border-line bg-ink px-4 py-2.5 uppercase
                    tracking-wider text-cream placeholder:normal-case placeholder:tracking-normal
                    placeholder:text-dim focus:border-amber focus:outline-none" />
                {promo && diskon > 0 && (
                  <p className="mt-1 text-[12px] text-emerald-400">
                    {promo.promo.name} berlaku — hemat {rupiah(diskon)}
                    {diskon < promo.discount && " (dibatasi: sebagian tagihan sudah dibayar)"}
                  </p>
                )}
              </div>

              {/* QR dinamis dengan nominal tepat — menggantikan stiker QR statis
                  yang nominalnya harus diketik tamu sendiri. Yang menutup tagihan
                  tetap tombol di bawah, ditekan kasir. */}
              <QrisKasir amount={due} ringkas={`Tutup tab ${table.name}`} kode={table.id} />

              <div className="text-[11px] uppercase tracking-wider text-dim">Metode pembayaran</div>
              <div className="grid gap-2">
                {([["cash", "Tunai"], ["edc", "Kartu / EDC"], ["qris_online", "QRIS di kasir"]] as const)
                  .map(([ch, label]) => (
                    <button key={ch}
                      onClick={() => {
                        const at = Date.now();
                        const final = settlementOf(session, a, at, kode || undefined);
                        setStruk({
                          no: `SPL-${at.toString(36).toUpperCase().slice(-6)}`,
                          meja: table.name, tamu: session.guest,
                          mulai: session.startsAt, selesai: at,
                          menit: final.detail?.billedMinutes ?? null,
                          billiard: final.billiard, fnb: final.fnb, diskon: final.discount,
                          promo: final.promo?.promo.name,
                          prabayar: session.paidOnline + splitPaidOf(session), bayar: final.due,
                          metode: label, kasir: a.me?.name ?? "-",
                          items: session.fnb.map((l) => {
                            const it = findItem(l.itemId);
                            return {
                              name: `${it?.name ?? l.itemId}${l.variant ? ` (${l.variant})` : ""}${l.unitPrice === 0 ? " (gratis)" : ""}`,
                              qty: l.qty, total: lineValue(l),
                            };
                          }),
                        });
                        dispatchA({ t: "settle", id: session.id, channel: ch, promoCode: kode || undefined });
                        setMode("receipt");
                      }}
                      className="min-h-[52px] rounded-xl border border-line bg-ink px-4 text-left
                        text-[15px] font-semibold text-cream hover:border-amber hover:text-amber">
                      {label}
                    </button>
                  ))}
              </div>
              <p className="text-[11px] leading-snug text-dim">
                Tagihan tidak dicetak otomatis. Setelah dibayar, struk ditampilkan
                dan hanya dicetak kalau tamu memintanya. Lampu meja mati sendiri.
              </p>
              <button onClick={() => setMode("main")} className="min-h-[40px] w-full text-sm text-dim">
                Kembali
              </button>
            </div>
          )}

          {/* ── Tambah pesanan ke open bill ─────────────── */}
          {session && mode === "order" && (
            <>
              <OrderPicker sessionId={session.id} onDone={() => setMode("main")} />
              <button onClick={() => setMode("main")} className="mt-1 min-h-[40px] w-full text-sm text-dim">
                Kembali
              </button>
            </>
          )}

          {/* ── Struk — ditampilkan, dicetak hanya bila diminta ── */}
          {mode === "receipt" && struk && (
            <div className="mt-4 space-y-3">
              <div id="struk" className="rounded-xl bg-cream p-4 font-mono text-[12px] leading-relaxed text-ink">
                <div className="text-center">
                  <div className="text-[15px] font-bold tracking-widest">SPL SPORTS POOL LOUNGE</div>
                  <div>&amp; Smokehouse Resto</div>
                  <div className="my-2 border-t border-dashed border-ink/40" />
                </div>
                <Baris k="No" v={struk.no} />
                <Baris k="Meja" v={struk.meja} />
                <Baris k="Tamu" v={struk.tamu} />
                <Baris k="Kasir" v={struk.kasir} />
                <Baris k="Waktu" v={`${jam(struk.mulai)} - ${jam(struk.selesai)}`} />
                <div className="my-2 border-t border-dashed border-ink/40" />
                <Baris k={`Sewa meja${struk.menit ? ` ${struk.menit} mnt` : ""}`} v={rupiah(struk.billiard)} />
                {struk.items.map((it, i) => (
                  <Baris key={i} k={`${it.qty}x ${it.name}`} v={rupiah(it.total)} />
                ))}
                {struk.diskon > 0 && <Baris k={`Promo ${struk.promo ?? ""}`} v={`-${rupiah(struk.diskon)}`} />}
                {struk.prabayar > 0 && <Baris k="Sudah dibayar" v={`-${rupiah(struk.prabayar)}`} />}
                <div className="my-2 border-t border-dashed border-ink/40" />
                <div className="flex justify-between text-[14px] font-bold">
                  <span>TOTAL</span><span>{rupiah(struk.bayar)}</span>
                </div>
                <Baris k="Metode" v={struk.metode} />
                <div className="mt-2 text-center text-[11px]">Harga sudah termasuk PBJT 10%</div>
                <div className="text-center text-[11px]">Terima kasih, sampai main lagi!</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={onClose}
                  className="min-h-[48px] rounded-xl border border-line bg-ink text-sm text-cream">
                  Selesai
                </button>
                <button onClick={() => void cetakStruk().then((r) => { if (!r.ok) flash(`Gagal mencetak: ${r.alasan ?? "printer tidak menjawab"}`); })}
                  className="min-h-[48px] rounded-xl bg-amber text-sm font-semibold text-ink">
                  Cetak Struk
                </button>
              </div>
              <p className="text-center text-[11px] text-dim">
                Pembayaran sudah tercatat. Cetak hanya kalau tamu meminta struk.
                {cetakSenyapMungkin()
                  ? " Langsung keluar ke printer struk — tanpa dialog."
                  : " Di peramban, dialog cetak muncul dulu."}
              </p>
            </div>
          )}

          {/* ── Pindah meja (tamu yang sedang main) ────────── */}
          {session && mode === "move" && (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] leading-snug text-mute">
                Pindahkan <span className="text-cream">{session.guest}</span> ke meja {CLASS_LABEL[sessionType(session)]} yang
                kosong. Meteran, pesanan, dan tiket dapur ikut pindah; lampu meja lama mati.
              </p>
              {moveTargets.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {moveTargets.map((t) => (
                    <button key={t.id}
                      onClick={() => {
                        dispatchA({ t: "relocate", id: session.id, toTableId: t.id });
                        const moved = peek().sessions.find((x) => x.id === session.id)?.tableId === t.id;
                        if (moved) onClose();
                        else { setMode("main"); flash("Pindah meja ditolak — meja tujuan baru saja terisi."); }
                      }}
                      className="min-h-[44px] min-w-[48px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-[13px] font-bold text-emerald-300">
                      {tableLabel(classOf(a, t.id), t.no)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-red-300">Tidak ada meja sejenis yang kosong cukup lama saat ini.</p>
              )}
              <button onClick={() => setMode("main")} className="min-h-[40px] w-full text-sm text-dim">Kembali</button>
            </div>
          )}

          {/* ── Koreksi pesanan: salah jumlah / salah item ── */}
          {session && mode === "koreksi" && koreksiKey && (() => {
            const line = session.fnb.find((l) => l.key === koreksiKey);
            if (!line) return null;
            const it = findItem(koreksiItem || line.itemId);
            return (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-amber/40 bg-amber/5 p-3">
                  <div className="text-sm font-semibold text-cream">
                    Koreksi: {line.qty}× {findItem(line.itemId)?.name ?? line.itemId}
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-mute">
                    Samakan bill dengan barang yang benar-benar keluar. Bisa selama pesanan belum diantar;
                    yang sudah diantar atau sudah dibayar harus lewat void.
                  </p>
                </div>

                <div className="rounded-xl border border-line bg-ink p-3">
                  <div className="text-[11px] uppercase tracking-wider text-dim">Jumlah</div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button onClick={() => setKoreksiQty(Math.max(1, koreksiQty - 1))}
                      className="min-h-[48px] w-14 rounded-lg border border-line text-xl text-cream">−</button>
                    <span className="min-w-[3ch] text-center font-serif text-2xl text-cream tabular-nums">{koreksiQty}</span>
                    <button onClick={() => setKoreksiQty(Math.min(99, koreksiQty + 1))}
                      className="min-h-[48px] w-14 rounded-lg border border-line text-xl text-cream">+</button>
                    <span className="ml-auto font-serif text-cream">
                      {rupiah((it ? (a.menuPrices[it.id] ?? it.price) : 0) * koreksiQty)}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-ink p-3">
                  <label className="text-[11px] uppercase tracking-wider text-dim">Ganti item (kalau salah menu)</label>
                  <select value={koreksiItem} onChange={(e) => setKoreksiItem(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-lg border border-line bg-ink-2 px-2 text-sm text-cream">
                    {MENU.map((c) => (
                      <optgroup key={c.id} label={c.name}>
                        {c.items.map((x) => (
                          <option key={x.id} value={x.id} disabled={a.soldOut.includes(x.id) && x.id !== line.itemId}>
                            {x.name} · {rupiah(a.menuPrices[x.id] ?? x.price)}{a.soldOut.includes(x.id) ? " (habis)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <Button full
                  onClick={() => {
                    dispatchA({
                      t: "editFnb", sessionId: session.id, key: line.key, qty: koreksiQty,
                      ...(koreksiItem && koreksiItem !== line.itemId ? { itemId: koreksiItem } : {}),
                    });
                    const after = peek().sessions.find((x) => x.id === session.id)?.fnb.find((l) => l.key === line.key);
                    setMode("main");
                    setKoreksiKey(null);
                    flash(after && (after.qty !== line.qty || after.itemId !== line.itemId)
                      ? `Pesanan dikoreksi jadi ${after.qty}× ${findItem(after.itemId)?.name ?? after.itemId}.`
                      : "Koreksi ditolak — stok kurang, sudah diantar, atau sudah dibayar.");
                  }}>Simpan Koreksi</Button>
                <button onClick={() => { setMode("main"); setKoreksiKey(null); }}
                  className="min-h-[40px] w-full text-sm text-dim">Batal</button>
              </div>
            );
          })()}

          {/* ── Pindahkan pesanan ke meja lain (salah nomor meja) ── */}
          {session && mode === "pindahItem" && (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] leading-snug text-mute">
                Pilih pesanan yang salah masuk ke meja ini, lalu pilih meja tujuannya. Tiket dapur ikut pindah.
                Pesanan yang dibayar online, sudah dibayar per orang, atau berasal dari QR tamu tidak bisa dipindah — pakai void.
              </p>
              <div className="divide-y divide-line rounded-xl border border-line">
                {barisBebas.map((l) => (
                  <button key={l.key}
                    onClick={() => setPilih(pilih.includes(l.key) ? pilih.filter((k) => k !== l.key) : [...pilih, l.key])}
                    aria-pressed={pilih.includes(l.key)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                    <span className={`h-4 w-4 shrink-0 rounded border ${pilih.includes(l.key) ? "border-amber bg-amber" : "border-line-2"}`} />
                    <span className="flex-1 truncate text-[13px] text-cream">
                      {l.qty}× {findItem(l.itemId)?.name ?? l.itemId}
                    </span>
                    <span className="font-serif text-[13px] tabular-nums text-mute">{rupiah(lineValue(l))}</span>
                  </button>
                ))}
              </div>
              {barisBebas.length === 0 && <p className="text-[12px] text-dim">Tidak ada pesanan yang bisa dipindah.</p>}
              {pilih.length > 0 && (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-dim">
                    Pindahkan {pilih.length} baris ({rupiah(totalPilih)}) ke:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {mejaJalan.map((x) => {
                      const t = TABLES.find((y) => y.id === x.tableId)!;
                      return (
                        <button key={x.id}
                          onClick={() => {
                            dispatchA({ t: "moveFnb", fromId: session.id, toId: x.id, keys: pilih });
                            const sisa = peek().sessions.find((y) => y.id === session.id)?.fnb ?? [];
                            const pindah = pilih.every((k) => !sisa.some((l) => l.key === k));
                            setPilih([]);
                            setMode("main");
                            flash(pindah ? `Pesanan dipindah ke ${t.name}.` : "Pindah ditolak — meja tujuan tidak sedang jalan atau baris sudah dibayar.");
                          }}
                          className="min-h-[44px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-[13px] font-semibold text-emerald-300">
                          {t.type === "resto" ? `R${t.no}` : t.type === "regular" ? t.no : `V${t.no}`}
                          <span className="ml-1 text-[10px] font-normal text-emerald-300/70">{x.guest}</span>
                        </button>
                      );
                    })}
                  </div>
                  {mejaJalan.length === 0 && <p className="text-[12px] text-red-300">Tidak ada meja lain yang sedang jalan.</p>}
                </>
              )}
              <button onClick={() => { setPilih([]); setMode("main"); }} className="min-h-[40px] w-full text-sm text-dim">Kembali</button>
            </div>
          )}

          {/* ── Split bill: bayar per orang ───────────────── */}
          {session && mode === "split" && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-center">
                <div className="text-[11px] uppercase tracking-wider text-dim">Sisa tagihan meja ini</div>
                <div className="font-serif text-2xl font-bold text-amber">{rupiah(due)}</div>
                {sudahSplit > 0 && <div className="text-[11px] text-dim">sudah dibayar {rupiah(sudahSplit)}</div>}
              </div>

              <div className="text-[11px] uppercase tracking-wider text-dim">1 · Pilih pesanan orang ini (opsional)</div>
              <div className="divide-y divide-line rounded-xl border border-line">
                {barisBebas.map((l) => (
                  <button key={l.key}
                    onClick={() => setPilih(pilih.includes(l.key) ? pilih.filter((k) => k !== l.key) : [...pilih, l.key])}
                    aria-pressed={pilih.includes(l.key)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                    <span className={`h-4 w-4 shrink-0 rounded border ${pilih.includes(l.key) ? "border-amber bg-amber" : "border-line-2"}`} />
                    <span className="flex-1 truncate text-[13px] text-cream">
                      {l.qty}× {findItem(l.itemId)?.name ?? l.itemId}
                    </span>
                    <span className="font-serif text-[13px] tabular-nums text-mute">{rupiah(lineValue(l))}</span>
                  </button>
                ))}
                {barisBebas.length === 0 && (
                  <p className="px-3 py-2.5 text-[12px] text-dim">Belum ada pesanan yang bisa dipilih — pakai nominal di bawah.</p>
                )}
              </div>

              {pilih.length === 0 && (
                <>
                  <div className="text-[11px] uppercase tracking-wider text-dim">atau · Bayar sejumlah</div>
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-ink px-4 py-3">
                    <span className="text-dim">Rp</span>
                    <input type="number" inputMode="numeric" min={0} step={1000} value={nominal}
                      onChange={(e) => setNominal(e.target.value)} placeholder="0"
                      className="w-full bg-transparent text-right font-serif text-xl tabular-nums text-cream focus:outline-none" />
                  </div>
                  <div className="flex gap-2">
                    {[2, 3, 4].map((n) => (
                      <button key={n} onClick={() => setNominal(String(Math.round(due / n / 500) * 500))}
                        className="flex-1 rounded-lg border border-line bg-ink-2 py-2 text-[12px] text-mute">
                        bagi {n} ({rupiah(Math.round(due / n / 500) * 500)})
                      </button>
                    ))}
                  </div>
                </>
              )}

              <input value={namaOrang} onChange={(e) => setNamaOrang(e.target.value.slice(0, 24))}
                placeholder="Nama / catatan (mis. Andi, Orang 2)"
                className="min-h-[44px] w-full rounded-xl border border-line bg-ink px-4 text-sm text-cream placeholder:text-dim" />

              {/* QR dinamis untuk bagian yang sedang dibayar orang ini. */}
              <QrisKasir
                amount={pilih.length ? totalPilih : Number(nominal) || 0}
                ringkas={`Split bill ${table.name}${namaOrang.trim() ? ` · ${namaOrang.trim()}` : ""}`}
                kode={table.id}
              />

              <div className="text-[11px] uppercase tracking-wider text-dim">2 · Cara bayar</div>
              <div className="grid gap-2">
                {([["cash", "Tunai"], ["edc", "Kartu / EDC"], ["qris_online", "QRIS di kasir"]] as const).map(([ch, label]) => (
                  <button key={ch}
                    disabled={pilih.length === 0 && !(Number(nominal) > 0)}
                    onClick={() => {
                      const sebelum = (peek().sessions.find((x) => x.id === session.id)?.payments ?? []).length;
                      dispatchA({
                        t: "paySplit", id: session.id, channel: ch,
                        ...(pilih.length ? { keys: pilih } : { amount: Number(nominal) }),
                        ...(namaOrang.trim() ? { label: namaOrang.trim() } : {}),
                      });
                      const setelah = peek().sessions.find((x) => x.id === session.id)?.payments ?? [];
                      const masuk = setelah.length > sebelum ? setelah[setelah.length - 1] : null;
                      setPilih([]); setNominal(""); setNamaOrang("");
                      setMode("main");
                      flash(masuk
                        ? `${rupiah(masuk.amount)} diterima (${label}). Sisa tagihan ${rupiah(settlementOf(peek().sessions.find((x) => x.id === session.id)!, peek()).due)}.`
                        : "Pembayaran ditolak — nominal melebihi sisa tagihan, atau shift belum dibuka.");
                    }}
                    className="min-h-[52px] rounded-xl border border-line bg-ink px-4 text-left text-[15px]
                      font-semibold text-cream hover:border-amber hover:text-amber disabled:opacity-35">
                    {label}
                    <span className="ml-2 text-[12px] font-normal text-dim">
                      {pilih.length ? rupiah(totalPilih) : Number(nominal) > 0 ? rupiah(Number(nominal)) : ""}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-dim">
                Uangnya langsung masuk laporan &amp; kas shift ini. Sisanya tetap di bill meja sampai tab ditutup.
                Pesanan yang sudah dibayar tidak bisa diubah atau di-void lagi.
              </p>
              <button onClick={() => { setPilih([]); setMode("main"); }} className="min-h-[40px] w-full text-sm text-dim">Kembali</button>
            </div>
          )}

          {/* ── Koreksi jam berhenti meteran ─────────────── */}
          {session && mode === "meteran" && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-amber/40 bg-amber/5 p-3 text-[12px] leading-snug text-mute">
                Meteran berhenti sendiri pukul 05.00 pagi ({jam(meterEndOf(session, Date.now()))}) kalau tab lupa ditutup atau
                komputer mati. Kalau tamu sebenarnya berhenti lebih awal, isi jam sebenarnya di bawah — tercatat atas nama Anda.
              </div>
              <label className="block text-[11px] uppercase tracking-wider text-dim">Jam berhenti (HH.MM hari ini)</label>
              <input value={jamStop} onChange={(e) => setJamStop(e.target.value)} placeholder="23.30"
                className="min-h-[48px] w-full rounded-xl border border-line bg-ink px-4 text-center font-serif text-xl text-cream placeholder:text-dim" />
              <Button full
                onClick={() => {
                  const m = /^(\d{1,2})[.:](\d{2})$/.exec(jamStop.trim());
                  if (!m) { flash("Format jam tidak dikenal — tulis seperti 23.30."); return; }
                  const d = new Date();
                  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
                  let at = d.getTime();
                  if (at > Date.now()) at -= 24 * 3_600_000;              // jam dini hari tadi
                  dispatchA({ t: "stopMeter", id: session.id, at });
                  const ok2 = peek().sessions.find((x) => x.id === session.id)?.stoppedAt === at;
                  setMode("main");
                  flash(ok2 ? `Meteran dihentikan pukul ${jam(at)}.`
                    : "Ditolak — jam harus di antara jam buka meja dan sekarang, dan tidak boleh di bawah uang yang sudah dibayar.");
                }}>Simpan jam berhenti</Button>
              <button onClick={() => setMode("main")} className="min-h-[40px] w-full text-sm text-dim">Batal</button>
            </div>
          )}

          {/* ── Void sesi / satu baris ───────────────────── */}
          {session && mode === "void" && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                <div className="text-sm font-semibold text-red-200">
                  {voidLine
                    ? `Void ${voidLine.qty}× ${findItem(voidLine.itemId)?.name ?? voidLine.itemId}`
                    : "Void seluruh sesi"}
                </div>
                <p className="mt-1 text-[12px] leading-snug text-red-200/80">
                  {allow("setujuiVoid")
                    ? "Anda superadmin — void langsung berlaku dan tercatat atas nama Anda."
                    : `Void akan diajukan ke superadmin. ${voidLine ? "Pesanan" : "Sesi"} tetap tercatat sampai disetujui.`}
                  {!voidLine && session.paidOnline > 0 && ` Dana online ${rupiah(session.paidOnline)} dicatat untuk dikembalikan ke pembayarnya.`}
                </p>
              </div>
              <div className="text-[11px] uppercase tracking-wider text-dim">Alasan (wajib)</div>
              <div className="grid gap-2">
                {VOID_REASONS.map((rr) => (
                  <button key={rr} onClick={() => setAlasan(rr)} aria-pressed={alasan === rr}
                    className={`min-h-[44px] rounded-xl border px-4 text-left text-sm ${
                      alasan === rr ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-cream"
                    }`}>{rr}</button>
                ))}
              </div>
              <Button full variant="brick"
                onClick={() => {
                  const before = peek().voids.length;
                  dispatchA({
                    t: "requestVoid",
                    req: voidLine
                      ? {
                          targetKind: "item", targetId: `${session.id}|${voidLine.key}`,
                          label: `${voidLine.qty}× ${findItem(voidLine.itemId)?.name ?? voidLine.itemId} · ${table.name}`,
                          amount: lineValue(voidLine), reason: alasan,
                        }
                      : {
                          targetKind: "sesi", targetId: session.id,
                          label: `Sesi ${table.name} · ${session.guest}`,
                          amount: due, reason: alasan,
                        },
                  });
                  // Hasil dibaca dari mesin: tercatat, menunggu, atau ditolak karena sudah berubah.
                  const req = peek().voids.length > before ? peek().voids[0] : null;
                  if (!voidLine && req?.status === "disetujui") { onClose(); return; }
                  setVoidKey(null);
                  setMode("main");
                  flash(!req ? "Void ditolak — data sudah berubah (mis. sudah dibayar)."
                    : req.status === "menunggu" ? "Void diajukan ke superadmin." : "Void berlaku.");
                }}>
                {allow("setujuiVoid") ? "Void Sekarang" : "Ajukan Void"}
              </Button>
              <button onClick={() => { setVoidKey(null); setMode("main"); }} className="min-h-[40px] w-full text-sm text-dim">
                Batal
              </button>
            </div>
          )}

          {/* ── Maintenance ──────────────────────────────── */}
          {mode === "maint" && blockers.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-[12px] leading-snug text-amber">
                Meja rusak terkunci sampai diaktifkan lagi, jadi tamu yang sudah memesan meja ini
                harus dipindah dulu. Setelah daftar di bawah kosong, meja bisa dinonaktifkan.
              </div>
              {blockers.map((b) => {
                const targets = b.status === "booked" ? relocationTargets(a, b) : [];
                return (
                  <div key={b.id} className="rounded-xl border border-line bg-ink p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-cream">{b.guest}</span>
                      <span className="shrink-0 text-[11px] text-dim">
                        {statusStyle(b.status).label} · {new Date(b.startsAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} {jam(b.startsAt)}
                      </span>
                    </div>
                    {b.status === "booked" ? (
                      targets.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {targets.slice(0, 10).map((t) => (
                            <button key={t.id}
                              onClick={() => dispatchA({ t: "relocate", id: b.id, toTableId: t.id })}
                              className="min-h-[36px] min-w-[44px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 text-[12px] font-bold text-emerald-300">
                              {tableLabel(classOf(a, t.id), t.no)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-red-300">Tidak ada meja pengganti — hubungi tamu.</p>
                      )
                    ) : (
                      <p className="mt-1 text-[11px] text-dim">
                        {b.status === "running" ? "Tutup tab, atau pakai tombol Pindah Meja di sesi ini." : "Tunggu pembayaran tamu selesai atau kedaluwarsa."}
                      </p>
                    )}
                  </div>
                );
              })}
              <button onClick={() => setMode("main")} className="min-h-[40px] w-full text-sm text-dim">
                Kembali
              </button>
            </div>
          )}
          {mode === "maint" && blockers.length === 0 && (
            <div className="mt-4 space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-dim">Alasan</div>
              <div className="grid gap-2">
                {["Kain meja sobek", "Lampu mati", "Bola/stik kurang", "Perbaikan terjadwal"].map((rr) => (
                  <button key={rr}
                    onClick={() => { dispatchA({ t: "toggleMaintenance", tableId: table.id, reason: rr }); onClose(); }}
                    className="min-h-[48px] rounded-xl border border-line bg-ink px-4 text-left
                      text-sm text-cream hover:border-amber hover:text-amber">{rr}</button>
                ))}
              </div>
              <button onClick={() => setMode("main")} className="min-h-[40px] w-full text-sm text-dim">
                Batal
              </button>
            </div>
          )}

          <button onClick={onClose} className="mt-3 min-h-[44px] w-full text-sm text-dim">Tutup</button>
        </div>
      </motion.div>
    </>
  );
}

function Baris({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="min-w-0 truncate">{k}</span>
      <span className="shrink-0 tabular-nums">{v}</span>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[13px] text-dim">{k}</span>
      <span className={`text-[13px] ${accent ? "text-emerald-400" : "text-cream"}`}>{v}</span>
    </div>
  );
}
