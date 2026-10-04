import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, PageHeader } from "../components/UI";
import { Ball, PocketPulse } from "../components/motion/Billiard";
import { useStore } from "../lib/store";
import { useAdmin, priceWith, rateWith, slotProblem, classOf, MIN_LEAD_MIN } from "../lib/adminStore";
import { HOUR_MS, blockEndOf, businessDateOf, hourBookable, isActive, openBillOn, overlaps, slotStart } from "../lib/occupancy";
import {
  HOURS, TABLES, fmtHour, PAKET_SIANG, BOOKING_TERMS, CLASS_LABEL, type TableType,
} from "../data/venue";
import {
  addDaysISO, availableTables, fmtDateLong, fmtDateShort, freeCountAtHour,
  rupiah, todayISO,
} from "../lib/core";

const DURATIONS = [1, 2, 3, 4];

// Jarak minimum booking online diambil dari mesin (MIN_LEAD_MIN), supaya layar dan
// mesin tidak mungkin berbeda: tamu tidak pernah melihat slot yang pasti ditolak.
// Kasir dikecualikan — walk-in memang harus bisa dibuka untuk saat ini juga.
const MIN_LEAD_MINUTES = MIN_LEAD_MIN;

export default function Booking() {
  const nav = useNavigate();
  const { state, dispatch, totals } = useStore();
  const { a: venue, tick } = useAdmin();
  const { draft } = state;
  const [params] = useSearchParams();
  const tipe = params.get("tipe");
  const vipMode = tipe === "vip" || tipe === "vvip";
  const [filter, setFilter] = useState<"all" | TableType>(tipe === "vvip" ? "vvip" : tipe === "vip" ? "vip" : "all");
  const [justPicked, setJustPicked] = useState<string | null>(null);

  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i)),
    [],
  );

  // `tick` dari store berdetak tiap 15 detik, jadi begitu jam berganti,
  // slot yang sudah lewat langsung terkunci sendiri tanpa perlu refresh.
  void tick;
  const isToday = draft.dateISO === todayISO();

  // Slot yang sedang ditahan untuk QR tamu INI sendiri tetap tampil tersedia baginya
  // (mis. kembali dari halaman bayar untuk mengganti durasi).
  const ownHold = state.pending?.booking ? state.pending.refId : undefined;
  const sessions = useMemo(
    () => (ownHold ? venue.sessions.filter((s) => !(s.id === ownHold && s.status === "hold")) : venue.sessions),
    [venue.sessions, ownHold],
  );
  // Jumlah meja per jam mengikuti jenis yang sedang dicari: mode VIP menghitung VIP saja,
  // Paket Siang menghitung meja reguler saja.
  const countType: TableType | undefined = draft.paketSiang ? "regular" : filter === "all" ? undefined : filter;

  const isMejaMain = (id: string) =>
    sessions.some((s) => s.tableId === id && s.status === "running" && businessDateOf(s.startsAt) === draft.dateISO);

  const free = useMemo(
    () => {
      if (draft.startHour === null) return [];
      const tables = availableTables(draft.dateISO, draft.startHour, draft.hours, sessions);
      if (isToday) {
        return tables.filter((t) => !isMejaMain(t.id));
      }
      return tables;
    },
    [draft.dateISO, draft.startHour, draft.hours, sessions, isToday],
  );

  const picked = TABLES.find((t) => t.id === draft.tableId) ?? null;
  /** Kelas meja mengikuti pengaturan pemilik (VIP no smoking / VVIP bebas), bukan bawaan data. */
  const kelas = (id: string) => classOf(venue, id);
  const kelasPicked = picked ? kelas(picked.id) : "regular";
  // Meja resto dipesan lewat halaman reservasi resto, bukan di sini.
  const freeBiliar = free.filter((t) => kelas(t.id) !== "resto");
  // Paket Siang khusus meja reguler — aturan yang sama ditegakkan mesin.
  const cocokSaring = (id: string) =>
    (filter === "all" || kelas(id) === filter) && (!draft.paketSiang || kelas(id) === "regular");
  const shown = freeBiliar.filter((t) => cocokSaring(t.id));
  /**
   * SEMUA meja biliar ikut ditampilkan — yang terisi pun. Dulu meja terpakai
   * disembunyikan, dan tamu tidak bisa membedakan "tidak ada" dari "sedang dipakai".
   * Sekarang mejanya tetap terlihat, ditandai jelas, dan tidak bisa ditekan.
   */
  const semuaBiliar = TABLES.filter((t) => kelas(t.id) !== "resto" && cocokSaring(t.id));

  /** Kenapa sebuah meja tidak bisa dipilih untuk jam & durasi yang dipilih tamu. */
  type StatusMeja = "bebas" | "main" | "dipakai" | "dibooking" | "rusak";
  const statusMeja = (id: string): StatusMeja => {
    const rel = sessions.filter((s) => s.tableId === id && isActive(s));
    if (rel.some((s) => s.status === "maintenance")) return "rusak";
    if (isToday && isMejaMain(id)) return "main";
    if (free.some((t) => t.id === id)) return "bebas";
    // Open bill: tamu masih main tanpa jam selesai — meja itu tidak dijual online
    // sampai kasir menutup tabnya.
    if (openBillOn(sessions, id, draft.dateISO)) return "dipakai";
    if (draft.startHour !== null) {
      const mulai = slotStart(draft.dateISO, draft.startHour);
      const akhir = mulai + draft.hours * HOUR_MS;
      if (rel.some((s) => s.status === "running" && overlaps(s.startsAt, blockEndOf(s), mulai, akhir))) return "dipakai";
    }
    return "dibooking";
  };
  const LABEL_STATUS: Record<Exclude<StatusMeja, "bebas">, string> = {
    main: "Sedang Main",
    dipakai: "Dipakai",
    dibooking: "Dibooking",
    rusak: "Rusak",
  };

  const paketEligible =
    draft.startHour !== null && draft.startHour <= PAKET_SIANG.lastStartHour &&
    (!picked || kelasPicked === "regular");

  // Meja yang dipilih bisa keburu ditahan/dibooking orang lain (atau jadi rusak)
  // selagi tamu masih memilih. Lepaskan pilihannya dan beri tahu.
  const [lost, setLost] = useState<string | null>(null);
  const pickedStillFree = !picked || free.some((t) => t.id === picked.id);
  useEffect(() => {
    if (picked && !pickedStillFree) {
      setLost(picked.name);
      dispatch({ t: "setTable", id: null, type: draft.tableType });
    }
  }, [picked, pickedStillFree, dispatch, draft.tableType]);

  const problem = picked && draft.startHour !== null
    ? slotProblem(venue, {
        tableId: picked.id, startsAt: slotStart(draft.dateISO, draft.startHour),
        hours: draft.hours, paket: draft.paketSiang,
      }, Date.now(), true, ownHold)
    : null;

  const breakdown =
    draft.startHour !== null && picked
      ? Array.from({ length: draft.hours }, (_, i) => ({ hour: draft.startHour! + i, rate: rateWith(venue.rates, kelasPicked, draft.startHour! + i) }))
      : [];

  function pickTable(id: string, type: TableType) {
    setLost(null);
    dispatch({ t: "setTable", id, type });
    setJustPicked(id);
    setTimeout(() => setJustPicked(null), 500);
  }

  return (
    <div className="pb-40">
      <PageHeader
        kicker={vipMode ? "Reservasi" : "Pilih"}
        title={vipMode ? "VIP Room" : "Booking Meja"}
        sub={vipMode
          ? `Ruang privat sampai 8 orang · VIP no smoking ${rupiah(venue.rates.vip)}/jam · VVIP bebas rokok ${rupiah(venue.rates.vvip)}/jam.`
          : "Lihat slot kosong secara langsung."}
      />

      <div className="mx-auto max-w-lg px-5">
        {/* ── Tanggal ─────────────────────────────────────── */}
        <Label>Tanggal</Label>
        <div className="no-bar -mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1">
          {days.map((d) => {
            const { dow, day, mon } = fmtDateShort(d);
            const on = d === draft.dateISO;
            return (
              <button
                key={d}
                onClick={() => dispatch({ t: "setDate", v: d })}
                aria-pressed={on}
                className={`min-h-[68px] w-[62px] shrink-0 snap-start rounded-xl border px-2 py-2
                  text-center transition-colors ${
                    on ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-cream"
                  }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  {dow}
                </div>
                <div className="font-display text-xl leading-tight">{day}</div>
                <div className="text-[10px] opacity-70">{mon}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-dim">{fmtDateLong(draft.dateISO)}</p>

        {/* ── Jam mulai ───────────────────────────────────── */}
        <Label>Jam mulai</Label>
        <div className="grid grid-cols-4 gap-2">
          {HOURS.map((h) => {
            const gate = hourBookable(draft.dateISO, h, todayISO(), MIN_LEAD_MINUTES);
            const past = !gate.ok;
            const n = freeCountAtHour(draft.dateISO, h, sessions, countType, venue.tableTypes, todayISO());
            const on = draft.startHour === h;
            const none = n === 0;
            const why = gate.ok ? null : gate.why === "lewat" ? "lewat" : "mepet";
            return (
              <button
                key={h}
                disabled={past || none}
                onClick={() => dispatch({ t: "setStart", v: h })}
                aria-pressed={on}
                className={`relative min-h-[52px] rounded-xl border px-1 py-1.5 transition-colors
                  disabled:opacity-25 ${
                    on ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-cream"
                  }`}
              >
                <div className="font-serif text-[15px] font-bold leading-tight">{fmtHour(h)}</div>
                <div className={`text-[10px] ${on ? "text-ink/70" : "text-dim"}`}>
                  {why ?? (none ? "penuh" : `${n} meja`)}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Durasi ──────────────────────────────────────── */}
        <Label>Durasi</Label>
        <div className="grid grid-cols-4 gap-2">
          {DURATIONS.map((d) => {
            const on = draft.hours === d && !draft.paketSiang;
            return (
              <button
                key={d}
                onClick={() => { dispatch({ t: "setHours", v: d }); dispatch({ t: "setPaket", v: false }); }}
                aria-pressed={on}
                className={`min-h-[46px] rounded-xl border text-sm font-semibold transition-colors ${
                  on ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-cream"
                }`}
              >
                {d} jam
              </button>
            );
          })}
        </div>

        {/* ── Paket Siang ─────────────────────────────────── */}
        <AnimatePresence>
          {paketEligible && (
            <motion.button
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              onClick={() => {
                const next = !draft.paketSiang;
                dispatch({ t: "setPaket", v: next });
                if (next) dispatch({ t: "setHours", v: PAKET_SIANG.hours });
              }}
              aria-pressed={draft.paketSiang}
              className={`mt-3 flex w-full items-center gap-3 overflow-hidden rounded-xl border px-4 py-3
                text-left transition-colors ${
                  draft.paketSiang ? "border-amber bg-amber/12" : "border-line bg-ink-2"
                }`}
            >
              <Ball n={2} size={34} color="#1F6F4A" />
              <div className="flex-1">
                <div className="font-script text-lg leading-none text-amber">Paket Siang</div>
                <div className="text-[11px] text-dim">2 jam + 2 minuman gratis</div>
              </div>
              <div className="text-right">
                <div className="font-serif text-lg font-bold text-cream">{rupiah(PAKET_SIANG.price)}</div>
                <div className="text-[10px] text-dim">
                  {draft.paketSiang ? "dipakai" : "hemat"}
                </div>
              </div>
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Meja ────────────────────────────────────────── */}
        <Label>
          Pilih meja
          {draft.startHour !== null && (
            <span className="ml-2 font-normal normal-case tracking-normal text-dim">
              {freeBiliar.length} kosong
            </span>
          )}
        </Label>

        {draft.startHour === null ? (
          <Card className="px-4 py-8 text-center">
            <Ball n={8} size={36} className="mx-auto opacity-40" />
            <p className="mt-3 text-sm text-dim">Pilih jam mulai dulu untuk melihat meja kosong.</p>
          </Card>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              {([
                ["all", `Semua (${freeBiliar.filter((t) => !draft.paketSiang || kelas(t.id) === "regular").length})`],
                ["regular", `Reguler (${freeBiliar.filter((t) => kelas(t.id) === "regular").length})`],
                ["vip", `VIP (${draft.paketSiang ? 0 : freeBiliar.filter((t) => kelas(t.id) === "vip").length})`],
                ["vvip", `VVIP (${draft.paketSiang ? 0 : freeBiliar.filter((t) => kelas(t.id) === "vvip").length})`],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setFilter(v)}
                  aria-pressed={filter === v}
                  disabled={(v === "vip" || v === "vvip") && draft.paketSiang}
                  className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors
                    disabled:opacity-35 ${
                    filter === v
                      ? "border-amber bg-amber text-ink"
                      : "border-line bg-ink-2 text-mute"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {draft.paketSiang && (
              <p className="-mt-1 mb-2 text-[11px] text-dim">Paket Siang khusus meja reguler.</p>
            )}
            {lost && (
              <p className="mb-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">
                {lost} baru saja diambil atau ditahan orang lain — pilih meja lain.
              </p>
            )}

            {shown.length === 0 && (
              <Card className="mb-3 px-4 py-4 text-center">
                <p className="text-sm text-cream">Tidak ada meja kosong untuk jam &amp; durasi ini.</p>
                <p className="mt-1 text-xs text-dim">Coba kurangi durasi atau geser jamnya.</p>
              </Card>
            )}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {semuaBiliar.map((t) => {
                const on = draft.tableId === t.id;
                const k = kelas(t.id);
                const st = statusMeja(t.id);
                const isMain = st === "main";
                const terisi = st !== "bebas";
                return (
                  <motion.button
                    key={t.id}
                    whileTap={terisi ? undefined : { scale: 0.94 }}
                    onClick={() => !terisi && pickTable(t.id, k)}
                    disabled={terisi}
                    aria-pressed={on}
                    aria-label={`${t.name}, ${CLASS_LABEL[k]}, ${terisi ? LABEL_STATUS[st].toLowerCase() : "kosong"}`}
                    className={`relative min-h-[64px] overflow-hidden rounded-xl border py-2 transition-colors ${
                      terisi
                        ? isMain
                          ? "cursor-not-allowed border-amber/40 bg-amber/10 text-amber/90 opacity-80"
                          : "cursor-not-allowed border-line/60 bg-ink text-dim opacity-70"
                        : on
                          ? "border-amber bg-amber text-ink"
                          : k === "vvip"
                            ? "border-brick bg-brick/25 text-cream"
                            : k === "vip"
                              ? "border-amber/50 bg-amber/10 text-cream"
                              : "border-line bg-ink-2 text-cream"
                    }`}
                  >
                    <PocketPulse show={justPicked === t.id} />
                    {terisi && (
                      /* Garis miring supaya bedanya terlihat juga tanpa warna (PRD §9.3). */
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0"
                        style={{
                          background: isMain
                            ? "repeating-linear-gradient(135deg, rgba(245,158,11,0.08) 0 6px, transparent 6px 12px)"
                            : "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 6px, transparent 6px 12px)",
                        }} />
                    )}
                    <div className={`font-display text-lg leading-none ${terisi ? "line-through decoration-dim/70" : ""}`}>{t.no}</div>
                    <div className={`text-[9px] uppercase tracking-wider ${on ? "text-ink/70" : "text-dim"}`}>
                      {k === "regular" ? "Reguler" : k === "vip" ? "VIP" : "VVIP"}
                    </div>
                    <div className={`text-[9px] ${on ? "text-ink/70" : isMain ? "font-bold text-amber" : terisi ? "font-bold text-amber/80" : "text-dim"}`}>
                      {terisi ? LABEL_STATUS[st] : `${t.capacity} org`}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Legenda — warna bukan satu-satunya pembawa info (PRD §9.3) */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dim">
              <Legend swatch="bg-ink-2 border-line-2" label="Reguler kosong" />
              <Legend swatch="bg-amber/10 border-amber/50" label="VIP · no smoking" />
              <Legend swatch="bg-brick/25 border-brick" label="VVIP · bebas rokok" />
              <Legend swatch="bg-amber border-amber" label="Dipilih" />
              <Legend swatch="bg-amber/10 border-amber/40" label="Sedang main (tidak bisa dipilih)" />
              <Legend swatch="bg-ink border-line/60" label="Dipakai / dibooking" />
            </div>

            <div className="mt-3 rounded-xl border border-line bg-ink-2 px-3.5 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Ketentuan booking</div>
              <ul className="mt-1 space-y-1 text-[12px] leading-snug text-mute">
                {BOOKING_TERMS.map((s) => <li key={s}>• {s}</li>)}
              </ul>
            </div>
          </>
        )}

        {/* ── Rincian harga ───────────────────────────────── */}
        {picked && draft.startHour !== null && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Label>Rincian</Label>
            <Card className="divide-y divide-line">
              <Row k={`${picked.name} · ${draft.hours} jam`} v={fmtHour(draft.startHour) + "–" + fmtHour(draft.startHour + draft.hours)} muted />
              {draft.paketSiang ? (
                <Row k="Paket Siang (2 jam + 2 minuman)" v={rupiah(PAKET_SIANG.price)} />
              ) : (
                breakdown.map((b) => (
                  <Row
                    key={b.hour}
                    k={`${fmtHour(b.hour)}–${fmtHour(b.hour + 1)}`}
                    v={rupiah(b.rate)}
                    muted
                  />
                ))
              )}
              <Row
                k="Subtotal meja"
                v={rupiah(draft.paketSiang ? PAKET_SIANG.price : priceWith(venue.rates, kelasPicked, draft.startHour, draft.hours))}
                bold
              />
            </Card>
            {!draft.paketSiang && breakdown.some((b) => b.rate !== breakdown[0].rate) && (
              <p className="mt-2 text-xs leading-relaxed text-amber/90">
                Sesi ini melewati pukul 18.00, jadi tarifnya berbeda tiap jam.
              </p>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Bilah aksi ──────────────────────────────────── */}
      <AnimatePresence>
        {picked && (
          <motion.div
            initial={{ y: 90 }} animate={{ y: 0 }} exit={{ y: 90 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="safe-b fixed inset-x-0 bottom-[58px] z-20 border-t border-line bg-ink/95 px-5 py-3 backdrop-blur-md"
          >
            {problem && (
              <p className="mx-auto mb-2 max-w-lg text-[12px] leading-snug text-amber">
                {problem.charAt(0).toUpperCase() + problem.slice(1)}.
              </p>
            )}
            <div className="mx-auto flex max-w-lg items-center gap-3">
              <div className="flex-1">
                <div className="text-[11px] text-dim">Total sementara</div>
                <div className="font-serif text-xl font-bold text-amber">{rupiah(totals.grand)}</div>
              </div>
              <Button onClick={() => nav("/menu")} variant="ghost">+ Makanan</Button>
              <Button disabled={!!problem} onClick={() => nav("/checkout")}>Lanjut</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
      {children}
    </h2>
  );
}

function Row({ k, v, muted, bold }: { k: string; v: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className={`text-[13px] ${muted ? "text-dim" : "text-cream"}`}>{k}</span>
      <span
        className={`font-serif tabular-nums ${
          bold ? "text-base font-bold text-amber" : muted ? "text-sm text-mute" : "text-sm text-cream"
        }`}
      >
        {v}
      </span>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded border ${swatch}`} />
      {label}
    </span>
  );
}

