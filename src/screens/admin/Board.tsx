import { useState } from "react";
import { QrisKasir } from "./QrisKasir";
import { cetakSenyapMungkin, cetakStruk } from "../../lib/cetak";
import { motion, AnimatePresence } from "framer-motion";
import { TABLES, CLASS_LABEL, CLASS_SHORT, VENUE_LABEL, tableLabel, venueDari } from "../../data/venue";
import { VOID_REASONS } from "../../data/staff";
import { STATUS_DAPUR, URUT_MENDESAK, mulaiStatus, menitSejak, lamaSingkat } from "../../lib/statusDapur";
import {
  useAdmin, recap, canOpenWalkin, blockEndOf, TURNAROUND_MIN, canExtend, nextSessionOn, hourIdx, OPEN_IDX, CLOSE_IDX, namaMeja,
  dalamJamBuka, batasJamTutup,
  settlementOf, lineValue, maintenanceBlockers, relocationTargets, classOf, sessionType, meterEndOf,
  splitPaidOf, paidLineKeys, GRACE_MIN, maxWalkinHours, priceWith, grupSesi, mesinEdc, punyaLampu,
  statusVoid, statusVoidBaris, paketAktif, paketProblem, mejaDijual, cariMeja,
} from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { MENU, findItem } from "../../data/menu";
import { Countdown, Elapsed, jam, statusStyle } from "./AdminShell";
import ClashAlert from "./ClashAlert";
import OrderPicker from "./OrderPicker";
import PesanTanpaMeja from "./PesanTanpaMeja";
import { activeController } from "../../lib/lightController";
import { Button } from "../../components/UI";
import type { LiveSession } from "../../data/live";
import type { CartLine } from "../../lib/store";
import { useVenueAktif } from "../../lib/venueAktif";

/**
 * Satu baris pesanan seperti yang dicetak di struk.
 *
 * Compliment dinamai "compliment", BUKAN "(gratis)": minuman jatah Paket
 * Siang dan barang yang digratiskan venue sama-sama berharga nol, tapi bagi
 * pemilik keduanya hal yang sangat berbeda — yang satu bagian dari paket yang
 * dibayar tamu, yang satu biaya yang ditanggung venue.
 *
 * Namanya diambil dari BARISNYA dulu supaya barang tambahan pemilik (yang
 * tidak ada di buku menu) tetap bernama di kertas.
 */
const barisStruk = (l: CartLine) => {
  const nama = l.name ?? findItem(l.itemId)?.name ?? l.itemId;
  const tanda = l.comp ? " (compliment)" : (l.unitPrice ?? 0) === 0 ? " (gratis)" : "";
  return {
    name: `${nama}${l.variant ? ` (${l.variant})` : ""}${tanda}`,
    qty: l.qty,
    // Harga satuan DIBEKUKAN di barisnya; kolom @Harga di struk memakai ini,
    // bukan total dibagi jumlah — baris compliment akan membulat jadi 0 dan
    // tamu melihat harga satuan yang tidak pernah ada.
    harga: l.unitPrice ?? findItem(l.itemId)?.price ?? 0,
    total: lineValue(l),
  };
};

export default function Board() {
  const { a, dispatchA, byTable, tick, allow } = useAdmin();
  const venue = useVenueAktif();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "running" | "free" | "soon">("all");
  /** SPL-2 · lembar "Counter" dari papan: pesan tanpa meja tanpa pindah tab. */
  const [counter, setCounter] = useState(false);
  const [kabarCounter, setKabarCounter] = useState<string | null>(null);
  const r = recap(a, undefined, venue);
  void tick;

  const cocok = (t: (typeof TABLES)[number]) => {
    const s = byTable.get(t.id);
    if (filter === "running") return s?.status === "running";
    if (filter === "free") return !s;
    if (filter === "soon") return s?.status === "booked";
    return true;
  };
  // Papan hanya menampilkan meja venue yang sedang dibuka — dua venue tidak
  // pernah tercampur di satu layar, termasuk hitungan di atasnya.
  // Denah yang sedang dijual — bukan daftar meja di kode. Meja cadangan yang
  // diaktifkan pemilik muncul di sini tanpa perubahan kode apa pun.
  const mejaVenueIni = mejaDijual(a).filter((t) => t.venue === venue);
  const rows = mejaVenueIni.filter(cocok);
  // Smokehouse dikelompokkan per lantai; SPL tidak punya lantai.
  const lantai = [...new Set(rows.map((t) => t.lantai).filter((x): x is number => !!x))].sort();
  // Hitungan di atas papan ikut venue yang dibuka — `recap` menghitung SEMUA
  // meja, dan memakai angka itu di sini akan menampilkan meja venue sebelah.
  /** Pesanan yang masih disiapkan dapur/bar untuk venue ini. */
  const dapurJalan = a.tickets.filter((t) => t.status !== "served"
    && a.sessions.some((s) => s.id === t.sessionId && mejaVenueIni.some((m) => m.id === s.tableId))).length;
  const hitung = mejaVenueIni.reduce((n, t) => {
    const x = byTable.get(t.id);
    if (!x) n.kosong++;
    else if (x.status === "running") n.jalan++;
    else if (x.status === "booked" || x.status === "hold") n.booking++;
    if (a.lights[t.id]) n.lampu++;
    return n;
  }, { kosong: 0, jalan: 0, booking: 0, lampu: 0 });

  const sel = open ? cariMeja(open)! : null;
  const selSession = open ? byTable.get(open) : undefined;

  return (
    <div className="pb-6">
      <ClashAlert />

      <div className="grid grid-cols-4 gap-2">
        <Stat n={hitung.kosong} label="Kosong" tone="text-emerald-400" onClick={() => setFilter("free")} on={filter === "free"} />
        <Stat n={hitung.jalan} label="Dipakai" tone="text-red-400" onClick={() => setFilter("running")} on={filter === "running"} />
        <Stat n={hitung.booking} label="Booking" tone="text-amber" onClick={() => setFilter("soon")} on={filter === "soon"} />
        {/* Meja makan tidak punya lampu — yang berguna di resto adalah
            berapa pesanan yang masih ditunggu dapur. */}
        {venue === "smh"
          ? <Stat n={dapurJalan} label="Di dapur" tone="text-sky-300" onClick={() => setFilter("all")} on={filter === "all"} />
          : <Stat n={hitung.lampu} label="Lampu" tone="text-yellow-300" onClick={() => setFilter("all")} on={filter === "all"} />}
      </div>

      {allow("kontrolLampu") && venue !== "smh" && (
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
          Tampilkan semua {mejaVenueIni.length} meja
        </button>
      )}

      {allow("tutupTab") && (
        <div className="mt-3">
          <button onClick={() => setCounter(true)}
            className="flex min-h-[52px] w-full items-center justify-between rounded-xl border
              border-amber/50 bg-amber/10 px-4 text-left">
            <span className="text-[13px] font-bold text-amber">
              Counter · pesan tanpa meja
            </span>
            <span className="text-[11px] text-amber/80">makanan · minuman · rokok →</span>
          </button>
          {kabarCounter && <p role="status" className="mt-1.5 text-[12px] text-amber">{kabarCounter}</p>}
        </div>
      )}

      {lantai.length === 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
          {rows.map((t) => <Tile key={t.id} table={t} onOpen={() => setOpen(t.id)} />)}
        </div>
      ) : (
        // SMH-1: tata letak per lantai. Denah aslinya belum ada — untuk
        // sementara meja hanya dikelompokkan, belum diletakkan sesuai posisi.
        lantai.map((lt) => (
          <section key={lt} className="mt-3">
            <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
              Lantai {lt} · {rows.filter((t) => t.lantai === lt).length} meja
            </h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
              {rows.filter((t) => t.lantai === lt).map((t) => (
                <Tile key={t.id} table={t} onOpen={() => setOpen(t.id)} />
              ))}
            </div>
          </section>
        ))
      )}


      <AnimatePresence>
        {sel && (
          <TableSheet
            table={sel}
            session={selSession}
            onClose={() => setOpen(null)}
          />
        )}
        {counter && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setCounter(false)} />
            <motion.div
              className="safe-b fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl
                border-t border-line bg-ink-2 p-5"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="font-display text-xl uppercase tracking-wide text-cream">Counter</div>
                  <div className="text-[11px] text-dim">
                    Pesanan tanpa meja — ditagih di tab Kasir, daftar takeaway.
                  </div>
                </div>
                <button onClick={() => setCounter(false)} className="text-[12px] text-dim">tutup</button>
              </div>
              <PesanTanpaMeja onDone={(kode) => {
                setCounter(false);
                if (kode) {
                  setKabarCounter(`Pesanan ${kode} dibuat — tagih di tab Kasir, daftar takeaway.`);
                  setTimeout(() => setKabarCounter(null), 6000);
                }
              }} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Satu kotak meja di papan — sama untuk meja biliar dan meja resto. */
/**
 * Isi pesanan satu meja, digabung per hidangan.
 *
 * Dipakai papan Smokehouse (permintaan pemilik 21 Okt 2026: *"papan tampilan
 * meja untuk monitoring … dengan pesanannya langsung yg di order jadi bisa
 * memantau"*). Nama dibaca dari BARISNYA dulu: barang tambahan pemilik tidak
 * ada di buku menu, dan hidangan yang kemudian dihapus tetap harus terbaca.
 */
function ringkasPesanan(s: LiveSession): [string, number][] {
  const m = new Map<string, number>();
  for (const l of s.fnb) {
    const nm = l.name ?? findItem(l.itemId)?.name ?? l.itemId;
    m.set(nm, (m.get(nm) ?? 0) + l.qty);
  }
  return [...m.entries()];
}

function Tile({ table, onOpen }: { table: (typeof TABLES)[number]; onOpen: () => void }) {
  const { a, byTable } = useAdmin();
  const s = byTable.get(table.id);
  const st = statusStyle(s?.status ?? "free");
  const lampu = a.lights[table.id];
  const kelas = classOf(a, table.id);
  const nama = namaMeja(a, table.id);
  const bill = s && s.status === "running" ? settlementOf(s, a).due : 0;
  /*
   * PESANAN DI UBIN — hanya meja makan.
   *
   * Di Smokehouse, yang dipantau sepanjang malam adalah "meja itu sudah
   * pesan apa, dan mana yang masih ditunggu dapur". Di SPL yang dipantau
   * meteran dan tagihan, dan 44 ubin berisi daftar hidangan cuma jadi
   * dinding teks — jadi ini sengaja tidak dipasang di sana.
   */
  const pesanan = table.venue === "smh" && s?.status === "running" ? ringkasPesanan(s) : [];
  const tiketMeja = s && table.venue === "smh"
    ? a.tickets.filter((t) => t.sessionId === s.id) : [];
  /**
   * Pesanan meja ini DIKELOMPOKKAN PER KEADAAN, bukan dihitung jadi dua
   * ember "sudah matang / belum".
   *
   * Dua ember tidak bisa membedakan pesanan yang DAPUR BELUM SENTUH dari
   * yang sedang dimasak — padahal itu beda antara "ada yang harus ditegur"
   * dan "tinggal tunggu". Kasir yang berdiri di depan Papan mengambil
   * keputusan yang berbeda untuk keduanya.
   *
   * `sejak` dihitung dari kapan tiket masuk ke keadaan SEKARANG, jadi
   * angkanya menjawab "sudah berapa lama tertahan di sini", bukan "sudah
   * berapa lama sejak dipesan".
   */
  const perStatus = URUT_MENDESAK.flatMap((st) => {
    if (st === "served") return [];
    const isi = tiketMeja.filter((t) => t.status === st);
    if (isi.length === 0) return [];
    return [{
      st,
      porsi: isi.reduce((n, t) => n + t.qty, 0),
      sejak: Math.min(...isi.map(mulaiStatus)),
    }];
  });
  return (
    <motion.button layout whileTap={{ scale: 0.95 }} onClick={onOpen}
      className={`relative flex min-h-[80px] flex-col items-start justify-between rounded-xl
        border p-2 text-left ${st.ring}`}>
      <div className="flex w-full items-center justify-between">
        <span className="font-display text-lg leading-none text-cream">
          {/* Nama ganti dari kasir menang (SMH-16). Kalau tidak ada: meja
              Smokehouse memakai nomor R01–R12 seperti di struk yang dipakai
              pemilik sekarang, meja biliar memakai nomornya sendiri. */}
          {a.tableNames?.[table.id]?.trim()
            ?? (table.venue === "smh" ? table.name
              : kelas === "regular" ? String(table.no) : `V${table.no}`)}
        </span>
        <span className="flex items-center gap-1">
          {/* Kelas meja hanya berarti di SPL. Di Smokehouse semuanya sama,
              jadi menempelkan "RESTO" di 24 kotak cuma jadi bising. */}
          {kelas !== "regular" && !table.lantai && (
            <span className={`text-[8px] font-bold uppercase tracking-wider ${kelas === "vvip" ? "text-brick-lit" : kelas === "vip" ? "text-amber/80" : "text-dim"}`}>
              {CLASS_SHORT[kelas]}
            </span>
          )}
          {table.capacity >= 8 && table.lantai && (
            <span className="text-[8px] font-bold uppercase tracking-wider text-dim">{table.capacity} kursi</span>
          )}
          {lampu && punyaLampu(table.id) && (
            <span className="text-[10px] leading-none text-yellow-300" title="Lampu menyala">◉</span>
          )}
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

        {/* Daftar pesanannya, maksimal tiga baris. Lebih dari itu ubinnya
            jadi lebih tinggi dari gunanya — yang ingin melihat seluruhnya
            mengetuk mejanya. */}
        {pesanan.length > 0 && (
          <div className="mt-1 space-y-px border-t border-line/60 pt-1">
            {pesanan.slice(0, 3).map(([nm, q]) => (
              <div key={nm} className="truncate text-[9px] leading-tight text-mute">
                <span className="font-semibold text-cream">{q}×</span> {nm}
              </div>
            ))}
            {pesanan.length > 3 && (
              <div className="text-[9px] leading-tight text-dim">+{pesanan.length - 3} hidangan lagi</div>
            )}
          </div>
        )}
        {/* Satu baris per keadaan, warnanya sama dengan layar Dapur — kuning
            baru masuk, hijau dimasak, biru siap diantar. Yang paling mendesak
            di atas: matang lebih mendesak daripada masih dimasak, karena yang
            satu menunggu kaki pramusaji dan makin dingin, yang satu menunggu
            dapur yang memang sedang bekerja.

            Dipotong dua baris: kartunya kecil, dan meja yang punya tiga
            keadaan sekaligus tetap terbaca dari dua yang paling mendesak. */}
        {perStatus.slice(0, 2).map(({ st, porsi, sejak }) => {
          const w = STATUS_DAPUR[st];
          const menit = menitSejak(sejak);
          return (
            <div key={st}
              className={`mt-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${w.teks}`}>
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${w.titik}`} aria-hidden />
              <span className="truncate">{porsi}&times; {w.pendek}</span>
              {/* Lewat 15 menit jadi merah, aturan yang sama dengan layar Dapur. */}
              <span className={`ml-auto shrink-0 tabular-nums ${menit >= 15 ? "text-red-400" : "opacity-75"}`}>
                {lamaSingkat(menit)}
              </span>
            </div>
          );
        })}
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
  /**
   * SMH-2: di Smokehouse, mengetuk meja yang sedang dipakai LANGSUNG membuka
   * daftar menu — itu yang dikerjakan pelayan sepanjang malam. Di SPL meja
   * dibuka untuk banyak hal lain (meteran, perpanjang, pindah), jadi di sana
   * tetap mulai dari lembar mejanya.
   */
  const [mode, setMode] = useState<"main" | "settle" | "maint" | "void" | "order" | "receipt" | "move" | "split" | "pindahItem" | "meteran" | "gabung">(
    table.venue === "smh" && session?.status === "running" ? "order" : "main",
  );
  /** Baris F&B yang sedang di-void (null = void seluruh sesi). */
  const [voidKey, setVoidKey] = useState<string | null>(null);
  /** Baris yang dipilih untuk dibayar per orang atau dipindah ke meja lain. */
  const [pilih, setPilih] = useState<string[]>([]);
  const [nominal, setNominal] = useState("");
  const [namaOrang, setNamaOrang] = useState("");
  const [jamStop, setJamStop] = useState("");
  /** Buka meja: null = open bill bermeteran, angka = paket per jam. */
  const [jamPaket, setJamPaket] = useState<number | null>(null);
  /** Paket pemilik yang dipilih untuk membuka meja. Saling meniadakan dengan `jamPaket`. */
  const [paketPilih, setPaketPilih] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** SMH-16: nama meja boleh diganti kasir. Kosongkan = kembali ke bawaan. */
  const [gantiNama, setGantiNama] = useState<string | null>(null);
  const [struk, setStruk] = useState<{
    no: string; meja: string; tamu: string; mulai: number; selesai: number;
    menit: number | null; billiard: number; fnb: number; diskon: number; promo?: string;
    /** Bagian diskon yang diberikan manual (SMH-11b) — dinamai apa adanya di struk. */
    diskonManual?: number;
    /** Nilai barang yang digratiskan venue. Dicetak supaya tamu tahu apa yang diberikan. */
    compliment?: number;
    prabayar: number; bayar: number; metode: string; kasir: string;
    /** `harga` = harga satuan (kolom @Harga di struk). */
    /**
     * `lunas` = baris ini SUDAH dibayar lewat bayar-sebagian (split bill).
     *
     * Permintaan pemilik 18 Okt 2026: "bill keluar sesuaikan yg sudah
     * dibayar dan yg belum dibayar". Mesin sudah lama tahu barisnya
     * (`paidLineKeys`) dan layar sudah menandainya — yang belum, kertasnya.
     * Tamu yang membayar bergantian tidak punya cara memeriksa bagiannya
     * sudah masuk atau belum.
     */
    items: { name: string; qty: number; harga: number; total: number; lunas?: boolean }[];
    /** Bayar tunai: uang yang diterima & kembaliannya (permintaan pemilik 8 Okt 2026). */
    tunaiDiterima?: number;
    kembalian?: number;
    /** true = BILL SEMENTARA untuk diperlihatkan ke tamu, BELUM dibayar.
     *  Harus terbaca jelas di kertas supaya tidak tertukar dengan struk lunas. */
    belumLunas?: boolean;
  } | null>(null);
  /** Uang tunai yang diserahkan tamu — hanya alat bantu kasir, tidak masuk jejak. */
  const [tunai, setTunai] = useState("");
  const [kode, setKode] = useState("");
  /** Diskon manual (%) — SMH-11b. Kosong = tidak ada diskon manual. */
  const [diskonPct, setDiskonPct] = useState("");
  const [alasan, setAlasan] = useState(VOID_REASONS[0]);

  const bisaBuka = canOpenWalkin(a.sessions, table.id, Date.now(), a);
  const kelas = classOf(a, table.id);
  const tarifKelas = kelas === "vip" ? a.rates.vip : kelas === "vvip" ? a.rates.vvip
    : hourIdx(Date.now()) < 18 ? a.rates.regularDay : a.rates.regularNight;
  const lampu = a.lights[table.id];
  const blockers = maintenanceBlockers(a, table.id);
  const nowTs = Date.now();
  const jamIdx = hourIdx(nowTs);
  const diLuarJam = !dalamJamBuka(a, jamIdx);
  // Open bill tidak punya jam selesai — kasir perlu tahu kapan meja harus kosong lagi.
  const nextBooking = nextSessionOn(a.sessions, table.id, nowTs);
  const harusSelesai = nextBooking ? nextBooking.startsAt - TURNAROUND_MIN * 60_000 : null;
  const voidLine = voidKey && session ? session.fnb.find((l) => l.key === voidKey) : undefined;
  const moveTargets = session && mode === "move" ? relocationTargets(a, session) : [];
  /** Paket per jam paling lama yang masih muat sebelum booking berikutnya / jam tutup. */
  // Mode demo tidak dibatasi jam tutup — yang tersisa cuma jarak ke booking berikutnya.
  const maksJam = Math.min(
    maxWalkinHours(a.sessions, table.id),
    Math.max(0, batasJamTutup(a) - hourIdx(Date.now())),
  );
  /**
   * PAKET PEMILIK yang bisa dipakai membuka meja INI, sekarang.
   *
   * Disaring dengan `paketProblem` — pagar yang SAMA dengan yang dipakai
   * mesin dan booking online. Jadi paket yang tampil di sini pasti diterima;
   * tidak ada tombol yang kelihatan hidup lalu ditolak diam-diam.
   *
   * Paket Smokehouse (0 jam) tidak ikut: itu bukan cara membuka meja, itu
   * baris bill yang dijual lewat layar pesan.
   */
  const paketMeja = paketAktif(a).filter((pk) =>
    pk.hours > 0 && (pk.venue ?? "spl") === venueDari(table.id) && pk.hours <= maksJam
    && !paketProblem(a, pk.id, { kelas, hours: pk.hours, startH: jamIdx }));
  const paketDipakai = paketPilih ? paketMeja.find((pk) => pk.id === paketPilih) : undefined;
  const hargaPaket = (j: number) => priceWith(a.rates, kelas, hourIdx(Date.now()), j);
  const extendProblem = (minutes: number) => {
    if (!session || canExtend(a, session.id, minutes)) return null;
    return hourIdx(session.endsAt) + minutes / 60 > CLOSE_IDX ? "melewati jam tutup 02.00" : "bentrok dengan booking berikutnya";
  };
  const flash = (text: string) => { setNote(text); setTimeout(() => setNote(null), 5000); };

  /**
   * Pindahkan baris terpilih ke sesi yang sedang jalan ATAU ke meja kosong.
   *
   * Hasilnya dibaca dari mesin (`peek`), bukan diandaikan: kalau meja
   * tujuannya keburu terisi atau barisnya sudah dibayar, kasir harus tahu
   * sekarang — bukan menemukannya nanti saat menutup bill.
   */
  function pindahkanPesanan(ke: { sesiId?: string; mejaId?: string }, nama: string) {
    if (!session) return;
    dispatchA({
      t: "moveFnb", fromId: session.id, keys: pilih,
      ...(ke.sesiId ? { toId: ke.sesiId } : {}), ...(ke.mejaId ? { toTableId: ke.mejaId } : {}),
    });
    const sisa = peek().sessions.find((y) => y.id === session.id)?.fnb ?? [];
    const jadi = pilih.every((k) => !sisa.some((l) => l.key === k));
    setPilih([]);
    setMode("main");
    flash(jadi ? `Pesanan dipindah ke ${nama}.`
      : "Pindah ditolak — meja tujuan baru saja terisi, atau barisnya sudah dibayar.");
  }

  // Angka di layar HARUS sama dengan yang dicatat mesin — jadi layar memanggil
  // rumus yang sama (settlementOf), bukan menghitung sendiri.
  /** Persen diskon manual yang sedang diketik, sudah dijinakkan 0–100. */
  const pctManual = Math.min(100, Math.max(0, Math.floor(Number(diskonPct) || 0)));
  const calc = session ? settlementOf(session, a, Date.now(), kode || undefined, pctManual) : null;
  const bill = calc ? { amount: calc.billiard, detail: calc.detail } : null;
  const fnb = calc?.fnb ?? 0;
  const billiard = calc?.billiard ?? 0;
  const promo = calc?.promo ?? null;
  const diskon = calc?.discount ?? 0;
  const due = calc?.due ?? 0;
  /** Uang yang sudah diterima kasir lewat split bill. */
  const sudahSplit = session ? splitPaidOf(session) : 0;
  /* ── SMH-4 · gabung meja ───────────────────────────────────────────
     Anggota grup dan tagihannya diambil dari mesin, bukan dihitung di sini:
     yang tertulis di layar harus angka yang sama dengan yang akan dicatat. */
  const anggotaGrup = session ? grupSesi(a, session.id) : [];
  const digabung = anggotaGrup.length > 1;
  /** Anggota grup selain meja ini — yang akan ikut ditutup bersama. */
  const grupLain = anggotaGrup.filter((x) => x.id !== session?.id && x.status === "running");
  const dueGrup = due + grupLain.reduce((n, x) => n + settlementOf(x, a, Date.now(), kode || undefined, pctManual).due, 0);
  /** Calon meja gabungan: sedang jalan, venue yang sama, belum segrup. */
  const bisaDigabung = session
    ? a.sessions.filter((x) => x.status === "running" && x.id !== session.id
        && venueDari(x.tableId) === venueDari(session.tableId)
        && (!x.grup || !session.grup || x.grup !== session.grup))
    : [];
  /** Uang tunai yang diserahkan tamu. Hanya alat bantu hitung kembalian —
   *  yang masuk jejak tetap nilai tagihannya, bukan angka ini. */
  const diterima = Math.max(0, Math.round(Number(tunai.replace(/[^0-9]/g, "")) || 0));
  const kembalian = diterima - dueGrup;
  const lunasKey = session ? paidLineKeys(session) : new Set<string>();
  /** Baris yang masih bisa dikoreksi / dipindah / dibayar per orang. */
  const barisBebas = (session?.fnb ?? []).filter((l) => !l.prepaid && l.unitPrice !== 0 && !lunasKey.has(l.key));
  const sudahDiantar = (key: string) =>
    a.tickets.some((t) => t.sessionId === session?.id && t.lineKey === key && t.status === "served");
  /** Meja lain yang sedang jalan — tujuan pindah pesanan yang salah meja.
   *  Venue sebelah tidak ikut: mesin menolaknya, jadi tombolnya hanya akan mati. */
  const mejaJalan = a.sessions.filter((x) => x.status === "running" && x.id !== session?.id
    && (!session || venueDari(x.tableId) === venueDari(session.tableId)));
  /**
   * MEJA KOSONG juga boleh jadi tujuan — mesin yang membukanya (lihat
   * `moveFnb`). Disaring dengan `canOpenWalkin`, pagar yang SAMA dengan yang
   * dipakai mesin, supaya tidak ada tombol yang kelihatan hidup lalu ditolak.
   */
  const mejaKosong = session
    ? mejaDijual(a).filter((t) => t.id !== session.tableId
        && venueDari(t.id) === venueDari(session.tableId)
        && canOpenWalkin(a.sessions, t.id, nowTs, a))
    : [];
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
      meja: namaMeja(a, table.id), tamu: session.guest,
      mulai: session.startsAt, selesai: at,
      menit: final.detail?.billedMinutes ?? null,
      billiard: final.billiard, fnb: final.fnb, diskon: final.discount,
      promo: final.promo?.promo.name,
      ...(final.compliment > 0 ? { compliment: final.compliment } : {}),
      prabayar: session.paidOnline + splitPaidOf(session), bayar: 0,
      metode: "Lunas Online (QRIS)", kasir: a.me?.name ?? "-",
      items: session.fnb.map((l) => ({ ...barisStruk(l), lunas: lunasKey.has(l.key) })),
    });
    // Sama seperti jalur bayar biasa: struk hanya kalau mesin benar-benar
    // menutup tabnya (temuan audit 21 Okt 2026).
    const tolak = dispatchA({ t: "settle", id: session.id, channel: "qris_online" });
    if (peek().sessions.find((x) => x.id === session.id)?.status === "running") {
      flash(tolak ?? "Tab belum tertutup, jadi pembayarannya belum tercatat. Jangan cetak struk dulu.");
      return;
    }
    flash(`${namaMeja(a, table.id)} selesai ditutup (Lunas Online).`);
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
        role="dialog" aria-modal="true" aria-label={`Kelola ${namaMeja(a, table.id)}`}>
        <div className="mx-auto max-w-lg">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-2" />
          <div className="flex items-baseline justify-between">
            {gantiNama === null ? (
              <h3 className="font-display text-2xl uppercase tracking-wide text-cream">
                {namaMeja(a, table.id)}
                {allow("bukaMeja") && (
                  <button onClick={() => setGantiNama(namaMeja(a, table.id))}
                    className="ml-2 align-middle text-[11px] font-normal normal-case tracking-normal text-dim underline underline-offset-4">
                    ubah nomor
                  </button>
                )}
              </h3>
            ) : (
              <div className="flex items-center gap-1.5">
                <input autoFocus value={gantiNama}
                  onChange={(e) => setGantiNama(e.target.value.slice(0, 30))}
                  onKeyDown={(e) => { if (e.key === "Enter") { dispatchA({ t: "setTableName", tableId: table.id, name: gantiNama }); setGantiNama(null); } }}
                  placeholder={table.name}
                  className="min-h-[38px] w-40 rounded-lg border border-line bg-ink px-2 text-[15px] text-cream focus:border-amber focus:outline-none" />
                <button onClick={() => { dispatchA({ t: "setTableName", tableId: table.id, name: gantiNama }); setGantiNama(null); }}
                  className="min-h-[38px] rounded-lg bg-amber px-3 text-[12px] font-bold text-ink">Simpan</button>
                <button onClick={() => setGantiNama(null)}
                  className="min-h-[38px] rounded-lg border border-line px-2 text-[12px] text-dim">batal</button>
              </div>
            )}
            <span className="text-[11px] uppercase tracking-wider text-dim">
              {CLASS_LABEL[kelas]}{kelas !== "resto" && ` · ${rupiah(tarifKelas)}/jam`}
            </span>
          </div>

          {/* Lampu meja — selalu tersedia bahkan saat meja kosong, TAPI hanya
              untuk meja biliar: meja makan Smokehouse tidak punya lampu. */}
          {allow("kontrolLampu") && punyaLampu(table.id) && (
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
                    <button onClick={() => { setJamPaket(null); setPaketPilih(null); }}
                      aria-pressed={jamPaket === null && !paketPilih}
                      className={`min-h-[44px] rounded-lg border px-2 text-[13px] font-semibold ${
                        jamPaket === null && !paketPilih ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink-2 text-cream"
                      }`}>Open bill<div className="text-[10px] font-normal text-dim">meteran per menit</div></button>
                    <button onClick={() => { setPaketPilih(null); setJamPaket(jamPaket === null ? Math.min(2, maksJam || 1) : jamPaket); }}
                      aria-pressed={jamPaket !== null} disabled={maksJam < 1}
                      className={`min-h-[44px] rounded-lg border px-2 text-[13px] font-semibold disabled:opacity-35 ${
                        jamPaket !== null ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink-2 text-cream"
                      }`}>Paket per jam<div className="text-[10px] font-normal text-dim">harga tetap</div></button>
                  </div>

                  {/* PAKET PEMILIK — permintaan pemilik 21 Okt 2026: *"untuk paket
                      tidak bisa terlihat disini padahal ada paket siang."*

                      Dipisah dari "Paket per jam" karena memang beda barang:
                      yang di atas blok jam polos berharga tarif, yang ini paket
                      bernama milik pemilik, lengkap dengan jatah minuman dan
                      isinya. Yang tampil hanya paket venue ini — paket
                      Smokehouse tidak pernah muncul di meja biliar. */}
                  {paketMeja.length > 0 && (
                    <>
                      <div className="mt-2.5 text-[11px] uppercase tracking-wider text-dim">
                        Paket {VENUE_LABEL[venueDari(table.id)]}
                      </div>
                      <div className="mt-1.5 space-y-1.5">
                        {paketMeja.map((pk) => (
                          <button key={pk.id}
                            onClick={() => { setJamPaket(null); setPaketPilih(paketPilih === pk.id ? null : pk.id); }}
                            aria-pressed={paketPilih === pk.id}
                            className={`w-full rounded-lg border px-3 py-2 text-left ${
                              paketPilih === pk.id ? "border-amber bg-amber/15" : "border-line bg-ink-2"
                            }`}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className={`font-script text-lg leading-none ${
                                paketPilih === pk.id ? "text-amber" : "text-cream"}`}>{pk.name}</span>
                              <span className="font-serif text-[15px] font-bold tabular-nums text-cream">
                                {rupiah(pk.price)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-dim">
                              {pk.hours} jam{pk.freeDrinks > 0 ? ` · ${pk.freeDrinks} minuman gratis` : ""}
                              {pk.isi?.length ? ` · ${pk.isi.length} hidangan termasuk` : ""}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
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
                    : paketDipakai ? `${paketDipakai.name} · ${rupiah(paketDipakai.price)}`
                      : jamPaket !== null ? `Paket ${jamPaket} jam · ${rupiah(hargaPaket(jamPaket))}`
                        : `Open bill — meteran jalan · ${rupiah(tarifKelas)}/jam`}
                </div>
                <ul className="space-y-0.5 text-[12px] leading-snug text-dim">
                  {kelas === "resto" ? (
                    <>
                      <li>• Yang ditagih hanya <span className="text-cream">makanan &amp; minuman</span></li>
                      <li>• Bisa dibayar per orang (split bill) saat tamu pulang bergantian</li>
                    </>
                  ) : paketDipakai ? (
                    <>
                      {paketDipakai.perks.map((p) => <li key={p}>• {p}</li>)}
                      <li>• Harga <span className="text-cream">tetap</span>, tidak bertambah per menit</li>
                      <li>• Selesai pukul <span className="text-cream">{jam(Date.now() + paketDipakai.hours * 3_600_000)}</span>; bisa diperpanjang per jam</li>
                      {!!paketDipakai.isi?.length && (
                        <li>• Hidangannya <span className="text-cream">langsung masuk dapur</span> saat meja dibuka</li>
                      )}
                      <li>• Batal dalam {GRACE_MIN} menit pertama: tidak ditagih</li>
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
                  dispatchA({
                    t: "walkin", tableId: table.id, guest,
                    ...(paketDipakai ? { paketId: paketDipakai.id } : jamPaket !== null ? { hours: jamPaket } : {}),
                  });
                  const dibuka = peek().sessions.some((x) => x.tableId === table.id && x.status === "running");
                  if (!dibuka) flash("Meja tidak jadi dibuka — cek jam operasional atau booking berikutnya.");
                  else if (kelas === "resto") setMode("order");   // resto: langsung catat pesanan
                  else onClose();
                }}>
                {paketDipakai ? `Buka ${paketDipakai.name} · ${rupiah(paketDipakai.price)}`
                  : jamPaket !== null ? `Buka ${jamPaket} Jam · ${rupiah(hargaPaket(jamPaket))}`
                    : kelas === "resto" ? "Duduk & Mulai Pesan" : "Mulai Open Bill"}
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
                <Row k="Jenis" v={session.source === "online" && session.bookingCode ? "Booking online (prabayar)"
                  : session.blockHours ? `Paket ${session.blockHours} jam (bayar di kasir)`
                  : kelas === "resto" ? "Meja makan (bayar di kasir)" : "Open bill"} />
                {session.status === "running" && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-[13px] text-dim">
                      {kelas === "resto" ? "Sudah duduk"
                        : session.source === "walkin" && !session.blockHours ? "Sudah berjalan" : "Sisa waktu"}
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

              {/* Daftar F&B: void per baris. TOMBOL "UBAH" SENGAJA TIDAK ADA —
                  lihat `editFnb` di engine.ts. Koreksi salah input dilakukan
                  dengan void lalu pesan ulang, karena void meninggalkan jejak
                  dan butuh persetujuan; mengubah jumlah tidak. */}
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
                    const voidBaris = statusVoidBaris(a, session.id, l.key);
                    return (
                      <div key={l.key} className="flex items-center gap-2 px-4 py-2">
                        <span className="flex-1 truncate text-[13px] text-cream">
                          {l.qty}× {it.name}{l.variant ? ` (${l.variant})` : ""}
                          {diantar && <span className="ml-1 text-[10px] text-dim">diantar</span>}
                        </span>
                        <span className="font-serif text-[13px] tabular-nums text-mute">
                          {l.comp
                            ? <span className="text-sky-300" title={`Compliment — nilainya ${rupiah(l.comp)}, ditanggung venue`}>compliment</span>
                            : l.unitPrice === 0 ? "gratis" : rupiah(lineValue(l))}
                        </span>
                        {l.prepaid ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300"
                            title="Sudah dibayar online — batalkan lewat void pesanan di tab Kasir">lunas</span>
                        ) : lunas ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300"
                            title="Sudah dibayar di kasir lewat split bill">dibayar</span>
                        ) : session.status === "running" && (
                          <>
                            {/* STATUS VOID BARIS INI — permintaan pemilik 19 Okt 2026.
                                Tanpa penanda ini kasir tidak tahu pengajuannya sudah
                                masuk, lalu menekan lagi, dan void yang sama menumpuk
                                di meja superadmin. Mesin menolak pengajuan kedua;
                                di sini alasannya ditulis supaya tidak terasa rusak. */}
                            {voidBaris?.status === "menunggu" ? (
                              <span className="rounded bg-amber/15 px-1.5 text-[10px] text-amber"
                                title={`Diajukan ${voidBaris.byName} · ${voidBaris.reason} — menunggu persetujuan superadmin`}>
                                void diajukan
                              </span>
                            ) : voidBaris?.status === "ditolak" ? (
                              <span className="rounded bg-red-500/15 px-1.5 text-[10px] text-red-300"
                                title={`Ditolak ${voidBaris.decidedBy ?? "superadmin"}`}>
                                void ditolak
                              </span>
                            ) : null}
                            {/* SMH-11b · Compliment: barangnya tetap keluar dan tetap
                                tercatat, yang digratiskan uangnya. Nilainya muncul
                                sebagai biaya venue di rekap, bukan hilang. */}
                            {bisaKoreksi && allow("beriDiskonManual") && (
                              <button
                                onClick={() => {
                                  dispatchA({ t: "compliment", sessionId: session.id, key: l.key, alasan: "diberikan kasir" });
                                  const after = peek().sessions.find((x) => x.id === session.id)?.fnb.find((k) => k.key === l.key);
                                  flash(after?.comp
                                    ? `${l.qty}× ${it.name} jadi compliment — ${rupiah(after.comp)} ditanggung venue.`
                                    : "Compliment ditolak — baris sudah dibayar atau sudah gratis.");
                                }}
                                className="min-h-[32px] rounded px-1.5 text-[11px] text-sky-300">compliment</button>
                            )}
                            {voidBaris?.status !== "menunggu" && (
                              <button
                                onClick={() => { setVoidKey(l.key); setMode("void"); }}
                                className="min-h-[32px] rounded px-1.5 text-[11px] text-red-300">void</button>
                            )}
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
                  {/* SMH-4 · Gabungan: ditulis di atas tombolnya supaya kasir tahu
                      tab ini akan ditutup bersama meja lain SEBELUM menekan bayar. */}
                  {digabung && (
                    <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 px-3.5 py-3">
                      <div className="text-[12px] font-semibold text-sky-200">
                        Satu bill dengan: {anggotaGrup.filter((x) => x.id !== session.id).map((x) => namaMeja(a, x.tableId)).join(", ")}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-dim">
                        Tagihan gabungan {rupiah(dueGrup)} — tiap meja tetap punya catatan uangnya
                        sendiri, jadi laporannya tidak berubah.
                      </div>
                      {allow("bukaMeja") && (
                        <button
                          onClick={() => {
                            dispatchA({ t: "pisahMeja", id: session.id });
                            const after = peek().sessions.find((x) => x.id === session.id);
                            flash(after?.grup ? "Tidak bisa dilepas." : `${namaMeja(a, table.id)} dilepas dari gabungan.`);
                          }}
                          className="mt-1.5 min-h-[34px] text-[12px] text-sky-300 underline underline-offset-4">
                          Lepas meja ini dari gabungan
                        </button>
                      )}
                    </div>
                  )}
                  {session.status === "running" && allow("bukaMeja") && (
                    <Button full variant="ghost" onClick={() => setMode("move")}>Pindah Meja</Button>
                  )}
                  {session.status === "running" && allow("bukaMeja") && bisaDigabung.length > 0 && (
                    <Button full variant="ghost" onClick={() => setMode("gabung")}>
                      {digabung ? "Tambah Meja ke Gabungan" : "Gabung dengan Meja Lain"}
                    </Button>
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
                  {/* Cek bill: diperlihatkan ke tamu SEBELUM dibayar. Kertasnya
                      ditandai BELUM DIBAYAR supaya tidak dikira struk lunas. */}
                  {session.status === "running" && (
                    <button
                      onClick={() => {
                        const at = Date.now();
                        const cek = settlementOf(session, a, at, kode || undefined, pctManual);
                        setStruk({
                          no: `CEK-${at.toString(36).toUpperCase().slice(-6)}`,
                          meja: namaMeja(a, table.id), tamu: session.guest,
                          mulai: session.startsAt, selesai: at,
                          menit: cek.detail?.billedMinutes ?? null,
                          billiard: cek.billiard, fnb: cek.fnb, diskon: cek.discount,
                          promo: cek.promo?.promo.name,
                          ...(cek.diskonManual > 0 ? { diskonManual: cek.diskonManual } : {}),
                          ...(cek.compliment > 0 ? { compliment: cek.compliment } : {}),
                          prabayar: session.paidOnline + splitPaidOf(session), bayar: cek.due,
                          metode: "belum dibayar", kasir: a.me?.name ?? "-",
                          belumLunas: true,
                          items: session.fnb.map((l) => ({ ...barisStruk(l), lunas: lunasKey.has(l.key) })),
                        });
                        setMode("receipt");
                      }}
                      className="min-h-[44px] w-full rounded-xl border border-line text-[13px] text-mute hover:border-amber hover:text-amber">
                      Cek bill · perlihatkan ke tamu dulu
                    </button>
                  )}
                  {/* QR bisa ditunjukkan SEBELUM masuk layar tutup tab: tamu sering
                      minta bayar duluan sambil main. Nominalnya ikut tagihan berjalan. */}
                  {due > 0 && allow("tutupTab") && (
                    <QrisKasir amount={due} ringkas={`Bayar ${namaMeja(a, table.id)}`} kode={table.id} />
                  )}
                  {/* Sama seperti void per baris: kalau pengajuannya sudah
                      masuk, yang ditampilkan statusnya — bukan tombol yang
                      akan ditolak mesin. */}
                  {statusVoid(a, "sesi", session.id)?.status === "menunggu" ? (
                    <div className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-center text-[12px] text-amber">
                      Void sesi sudah diajukan — menunggu persetujuan superadmin
                    </div>
                  ) : (
                    <button onClick={() => { setVoidKey(null); setMode("void"); }}
                      className="min-h-[40px] w-full text-xs text-red-300 underline underline-offset-4">
                      Void seluruh sesi ini
                      {statusVoid(a, "sesi", session.id)?.status === "ditolak" && " (pengajuan sebelumnya ditolak)"}
                    </button>
                  )}
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

              {/* SMH-11b · Diskon manual (%). Hanya muncul untuk peran yang
                  berhak — dan mesin menolaknya lagi di sisinya, jadi perangkat
                  yang berbohong tidak bisa memberi diskon sendiri. */}
              {allow("beriDiskonManual") && (
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-wider text-dim">
                    Diskon manual (%) — opsional
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input value={diskonPct} inputMode="numeric"
                      onChange={(e) => setDiskonPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                      placeholder="0"
                      className="h-10 w-20 rounded-lg border border-line bg-ink px-3 text-right text-[15px] tabular-nums text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
                    {[5, 10, 20, 50].map((n) => (
                      <button key={n} onClick={() => setDiskonPct(String(n))}
                        className="rounded-full border border-line bg-ink px-2.5 py-1 text-[11px] text-mute hover:border-amber hover:text-amber">
                        {n}%
                      </button>
                    ))}
                    {diskonPct && (
                      <button onClick={() => setDiskonPct("")}
                        className="rounded-full border border-line bg-ink px-2.5 py-1 text-[11px] text-dim">hapus</button>
                    )}
                  </div>
                  {pctManual > 0 && (
                    <p className="mt-1 text-[11px] leading-relaxed text-amber">
                      Potong {rupiah(diskon)} dari tagihan kasir.
                      {promo && promo.discount > 0 && " Diskon manual TIDAK ditumpuk dengan promo — yang dipakai hanya yang lebih besar."}
                    </p>
                  )}
                </div>
              )}

              {/* QR dinamis dengan nominal tepat — menggantikan stiker QR statis
                  yang nominalnya harus diketik tamu sendiri. Yang menutup tagihan
                  tetap tombol di bawah, ditekan kasir. */}
              {digabung && (
                <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-200">
                    Satu bill · {anggotaGrup.length} meja
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {anggotaGrup.filter((x) => x.status === "running").map((x) => (
                      <div key={x.id} className="flex justify-between text-[12px]">
                        <span className="text-mute">{namaMeja(a, x.tableId)} · {x.guest}</span>
                        <span className="tabular-nums text-cream">
                          {rupiah(settlementOf(x, a, Date.now(), kode || undefined, pctManual).due)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 flex justify-between border-t border-sky-500/20 pt-1.5 text-[13px] font-bold">
                    <span className="text-sky-200">Total gabungan</span>
                    <span className="tabular-nums text-sky-100">{rupiah(dueGrup)}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-dim">
                    Menekan metode pembayaran di bawah akan menutup SEMUA meja di atas sekaligus.
                  </p>
                </div>
              )}

              <QrisKasir amount={dueGrup} ringkas={`Tutup tab ${anggotaGrup.map((x) => namaMeja(a, x.tableId)).join(" + ")}`} kode={table.id} />

              <div className="text-[11px] uppercase tracking-wider text-dim">Metode pembayaran</div>
              <div className="grid gap-2">
                {/*
                  SATU TOMBOL PER MESIN EDC (permintaan pemilik 12 Okt 2026).
                  Laporan kasir mereka memang memisahkan setoran per bank, dan
                  pemisahan itu hanya bisa benar kalau kasir memilih mesinnya
                  SAAT membayar — sesudahnya tidak ada lagi yang tahu kartu
                  tadi digesek di mesin yang mana.
                */}
                {([
                  ["cash", "Tunai", undefined],
                  ["qris_online", "QRIS di kasir", undefined],
                  ...mesinEdc(a).map((m) => ["edc", `Kartu / EDC · ${m}`, m] as const),
                ] as const)
                  .map(([ch, label, mesin]) => (
                    <button key={`${ch}-${mesin ?? ""}`}
                      onClick={() => {
                        const at = Date.now();
                        /**
                         * SMH-4 · satu bill untuk meja yang digabung.
                         *
                         * Tiap meja tetap DITUTUP SENDIRI-SENDIRI dengan rumus
                         * uang yang sama seperti biasa — yang disatukan cuma
                         * struknya dan satu kali pembayaran. Dengan begitu
                         * laporan tetap bisa menjawab meja mana menghasilkan
                         * apa, dan seluruh pagar uang yang sudah ada berlaku
                         * tanpa satu pun pengecualian baru.
                         */
                        const ikut = [session, ...grupLain];
                        const hitungan = ikut.map((x) => ({
                          sesi: x,
                          bill: settlementOf(x, a, at, kode || undefined, pctManual),
                        }));
                        const jumlah = (f: (h: typeof hitungan[number]) => number) =>
                          hitungan.reduce((n, h) => n + f(h), 0);
                        const totalDue = jumlah((h) => h.bill.due);
                        setStruk({
                          no: `SPL-${at.toString(36).toUpperCase().slice(-6)}`,
                          meja: ikut.map((x) => namaMeja(a, x.tableId)).join(" + "),
                          tamu: session.guest,
                          mulai: Math.min(...ikut.map((x) => x.startsAt)), selesai: at,
                          menit: hitungan[0].bill.detail?.billedMinutes ?? null,
                          billiard: jumlah((h) => h.bill.billiard),
                          fnb: jumlah((h) => h.bill.fnb),
                          diskon: jumlah((h) => h.bill.discount),
                          promo: hitungan[0].bill.promo?.promo.name,
                          ...(jumlah((h) => h.bill.diskonManual) > 0
                            ? { diskonManual: jumlah((h) => h.bill.diskonManual) } : {}),
                          ...(jumlah((h) => h.bill.compliment) > 0
                            ? { compliment: jumlah((h) => h.bill.compliment) } : {}),
                          prabayar: jumlah((h) => h.sesi.paidOnline + splitPaidOf(h.sesi)),
                          bayar: totalDue,
                          metode: label, kasir: a.me?.name ?? "-",
                          ...(ch === "cash" && diterima >= totalDue
                            ? { tunaiDiterima: diterima, kembalian: diterima - totalDue }
                            : {}),
                          // Baris tiap meja diberi nama mejanya kalau digabung —
                          // tanpa itu tamu melihat dua nasi goreng tanpa tahu
                          // yang mana punya mejanya.
                          items: ikut.flatMap((x) => x.fnb.map((l) => {
                            const b = barisStruk(l);
                            return ikut.length > 1
                              ? { ...b, name: `${namaMeja(a, x.tableId)} · ${b.name}` }
                              : b;
                          })),
                        });
                        /*
                          STRUK HANYA DICETAK KALAU MESIN BENAR-BENAR MENUTUP TABNYA.

                          Temuan audit 21 Okt 2026 (laporan pemilik: *"saya sudah
                          buat payment sampai akhir dan cetak struk, statusnya
                          tidak berubah"*). Dulu layar ini SELALU lanjut ke struk,
                          apa pun jawaban mesin: saat internet mati, aksi uang
                          ditahan (lihat `MONEY_ACTIONS`), penolakannya cuma lewat
                          sebagai pesan sekejap, lalu struk tercetak dan tamu
                          pulang — sementara mejanya tetap merah dan uangnya tidak
                          pernah tercatat. Struk untuk pembayaran yang tidak
                          tercatat adalah kebohongan yang dipegang tamu.
                        */
                        const tolakan = ikut
                          .map((x) => dispatchA({
                            t: "settle", id: x.id, channel: ch, promoCode: kode || undefined,
                            ...(pctManual > 0 ? { diskonPersen: pctManual } : {}),
                            ...(mesin ? { mesin } : {}),
                          }))
                          .find((r): r is string => !!r);
                        const sisaTerbuka = peek().sessions
                          .filter((x) => ikut.some((y) => y.id === x.id) && x.status === "running");
                        if (sisaTerbuka.length === ikut.length) {
                          // Tidak satu pun tertutup: tetap di layar bayar.
                          flash(tolakan
                            ?? "Pembayaran belum tercatat. Jangan cetak struk dulu — periksa shift "
                              + "masih buka, dan tagihan ini belum ditutup orang lain.");
                          return;
                        }
                        if (sisaTerbuka.length) {
                          flash(`${sisaTerbuka.length} dari ${ikut.length} meja gabungan belum tertutup — `
                            + `uangnya belum tercatat untuk meja itu. Cek di papan sebelum tamu pulang.`);
                        }
                        setDiskonPct("");
                        setMode("receipt");
                      }}
                      className="min-h-[52px] rounded-xl border border-line bg-ink px-4 text-left
                        text-[15px] font-semibold text-cream hover:border-amber hover:text-amber">
                      {label}
                    </button>
                  ))}
              </div>
              {/* SMH-10: nominal tunai & kembalian. Pecahan cepat supaya kasir
                  tidak perlu mengetik angka panjang saat antre. */}
              <div className="rounded-xl border border-line bg-ink-2 p-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Bayar tunai (opsional)</div>
                <input
                  value={tunai} inputMode="numeric"
                  onChange={(e) => setTunai(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
                  placeholder="uang diterima dari tamu"
                  className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-right text-[15px] tabular-nums text-cream placeholder:text-left placeholder:text-[13px] placeholder:text-dim focus:border-amber focus:outline-none" />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[dueGrup, 50_000, 100_000, 200_000].filter((n, i, xs) => n > 0 && xs.indexOf(n) === i).map((n) => (
                    <button key={n} onClick={() => setTunai(String(n))}
                      className="rounded-full border border-line bg-ink px-2.5 py-1 text-[11px] text-mute hover:border-amber hover:text-amber">
                      {n === dueGrup ? "uang pas" : rupiah(n)}
                    </button>
                  ))}
                  {tunai && (
                    <button onClick={() => setTunai("")}
                      className="rounded-full border border-line bg-ink px-2.5 py-1 text-[11px] text-dim">hapus</button>
                  )}
                </div>
                {diterima > 0 && (
                  <div className={`mt-2 flex justify-between text-[14px] font-bold ${
                    kembalian < 0 ? "text-red-300" : "text-emerald-300"}`}>
                    <span>{kembalian < 0 ? "Kurang" : "Kembalian"}</span>
                    <span className="tabular-nums">{rupiah(Math.abs(kembalian))}</span>
                  </div>
                )}
                <p className="mt-1 text-[11px] leading-snug text-dim">
                  Angka ini cuma membantu menghitung kembalian dan ikut tercetak di struk —
                  yang tercatat sebagai penjualan tetap nilai tagihannya.
                </p>
              </div>

              <p className="text-[11px] leading-snug text-dim">
                Tagihan tidak dicetak otomatis. Setelah dibayar, struk ditampilkan
                dan hanya dicetak kalau tamu memintanya.
                {/* Lampu barang biliar — meja makan tidak punya, jadi
                    kalimatnya pun tidak boleh muncul di sana. */}
                {punyaLampu(table.id) && " Lampu meja mati sendiri."}
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
              {/* Di Smokehouse layar ini yang pertama terbuka, jadi "Kembali"
                  menyesatkan — tidak ada yang ditinggalkan. */}
              <button onClick={() => setMode("main")} className="mt-1 min-h-[40px] w-full text-sm text-dim">
                {table.venue === "smh" ? "Lihat bill meja ini" : "Kembali"}
              </button>
            </>
          )}

          {/* ── Struk — ditampilkan, dicetak hanya bila diminta ── */}
          {mode === "receipt" && struk && (
            <div className="mt-4 space-y-3">
              {/*
                BENTUK STRUK mengikuti struk yang sudah dipakai pemilik tiap
                hari (foto 12 Okt 2026): judul venue, "Meja :" di kepala,
                No/Kasir berpasangan dengan tanggal/jam, lalu tabel
                Qty · Menu · @Harga · Jumlah, dan blok
                Total → Discount → Total Bersih → Dibayar → Kembali.

                Alasannya bukan selera: kasir dan tamu sudah hafal letak
                angkanya. Struk dengan angka yang sama tapi letak berbeda
                membuat setiap pemeriksaan jadi lebih lambat, dan yang
                lambat akan dilewati.
              */}
              <div id="struk" className="rounded-xl bg-cream p-4 font-mono text-[12px] leading-relaxed text-ink">
                <div className="text-center">
                  <div className="text-[15px] font-bold leading-tight tracking-widest">
                    {venueDari(table.id) === "smh" ? "SMOKE HOUSE" : "SPL SPORTS"}
                  </div>
                  <div className="text-[15px] font-bold leading-tight tracking-widest">
                    {venueDari(table.id) === "smh" ? "RESTO" : "POOL LOUNGE"}
                  </div>
                  {struk.belumLunas && (
                    <div className="my-1 border-y-2 border-ink py-1 text-[14px] font-bold tracking-widest">
                      BILL SEMENTARA · BELUM DIBAYAR
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex justify-between text-[13px] font-bold">
                  <span>Meja :</span><span>{struk.meja.replace(/^meja\s+/i, "")}</span>
                </div>
                <div className="my-1.5 border-t border-dashed border-ink/40" />
                <div className="flex justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate">No. : {struk.no}</span>
                  <span className="shrink-0">{tanggalStruk(struk.selesai)}</span>
                </div>
                <div className="flex justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate">Kasir : {struk.kasir}</span>
                  <span className="shrink-0 tabular-nums">{jamDetik(struk.selesai)}</span>
                </div>
                <div className="my-1.5 border-t border-dashed border-ink/40" />

                <div className="flex justify-between gap-1 text-[11px] font-bold">
                  <span className="flex-1">Qty Menu</span>
                  <span className="w-[52px] text-right">@Harga</span>
                  <span className="w-[56px] text-right">Jumlah</span>
                </div>
                {/* Sewa meja ikut jadi baris barang — di struk pemilik tidak ada
                    baris khusus untuk itu, dan meja Smokehouse memang Rp 0. */}
                {struk.billiard > 0 && (
                  <BarisStruk qty={1} nama={`SEWA MEJA${struk.menit ? ` ${struk.menit} MNT` : ""}`}
                    harga={struk.billiard} total={struk.billiard} />
                )}
                {/* DUA KELOMPOK kalau ada yang sudah dibayar per orang.
                    Yang sudah dibayar tetap dicetak supaya tamu bisa
                    mencocokkan, tapi tidak dijumlahkan dua kali — jumlah di
                    bawah memakai angka dari mesin, bukan dari daftar ini. */}
                {struk.items.some((x) => x.lunas) ? (
                  <>
                    {struk.items.filter((x) => !x.lunas).length > 0 && (
                      <>
                        <div className="mt-1 text-[11px] font-bold">BELUM DIBAYAR</div>
                        {struk.items.filter((x) => !x.lunas).map((it, i) => (
                          <BarisStruk key={`b${i}`} qty={it.qty} nama={it.name} harga={it.harga} total={it.total} />
                        ))}
                      </>
                    )}
                    <div className="mt-1 text-[11px] font-bold">SUDAH DIBAYAR</div>
                    {struk.items.filter((x) => x.lunas).map((it, i) => (
                      <BarisStruk key={`l${i}`} qty={it.qty} nama={`${it.name} (lunas)`} harga={it.harga} total={it.total} />
                    ))}
                  </>
                ) : (
                  struk.items.map((it, i) => (
                    <BarisStruk key={i} qty={it.qty} nama={it.name} harga={it.harga} total={it.total} />
                  ))
                )}
                <div className="my-1.5 border-t border-dashed border-ink/40" />

                <Baris k="Total" v={ribuan(struk.billiard + struk.items.reduce((n, x) => n + x.total, 0))} />
                <Baris k={(struk.diskonManual ?? 0) > 0 ? "Discount" : struk.promo ? `Discount ${struk.promo}` : "Discount"}
                  v={ribuan(struk.diskon)} />
                <div className="my-1 border-t border-ink/60" />
                <div className="flex justify-between text-[13px] font-bold">
                  <span>Total Bersih</span>
                  <span>{ribuan(struk.billiard + struk.items.reduce((n, x) => n + x.total, 0) - struk.diskon)}</span>
                </div>
                {struk.prabayar > 0 && <Baris k="Sudah dibayar" v={ribuan(struk.prabayar)} />}
                <Baris k="Dibayar" v={ribuan(struk.tunaiDiterima ?? struk.bayar)} />
                <div className="my-1 border-t border-ink/60" />
                <div className="flex justify-between text-[13px] font-bold">
                  <span>Kembali</span><span>{ribuan(struk.kembalian ?? 0)}</span>
                </div>
                {!struk.belumLunas && <Baris k="Metode" v={struk.metode} />}

                {/* Compliment ditulis TERPISAH dan tidak ikut hitungan: barisnya
                    di atas sudah bernilai nol. Tetap dicetak supaya tamu tahu
                    apa yang diberikan, dan supaya kertasnya cocok dengan rekap. */}
                {(struk.compliment ?? 0) > 0 && (
                  <div className="mt-1 text-[11px]">
                    Compliment (ditanggung venue) {rupiah(struk.compliment ?? 0)}
                  </div>
                )}
                {struk.belumLunas && (
                  <div className="mt-2 text-center text-[11px] font-bold">
                    Bukan bukti pembayaran. Mohon diperiksa dulu sebelum dibayar.
                  </div>
                )}
                {!struk.belumLunas && <div className="mt-2 text-center text-[11px]">Harga sudah termasuk pajak</div>}
                <div className="text-center text-[11px]"># TERIMA KASIH SUDAH BERKUNJUNG #</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => (struk.belumLunas ? setMode("main") : onClose())}
                  className="min-h-[48px] rounded-xl border border-line bg-ink text-sm text-cream">
                  {struk.belumLunas ? "Kembali" : "Selesai"}
                </button>
                <button onClick={() => void cetakStruk().then((r) => { if (!r.ok) flash(`Gagal mencetak: ${r.alasan ?? "printer tidak menjawab"}`); })}
                  className="min-h-[48px] rounded-xl bg-amber text-sm font-semibold text-ink">
                  {struk.belumLunas ? "Cetak Bill" : "Cetak Struk"}
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
          {/* ── Pindahkan pesanan ke meja lain (salah nomor meja) ── */}
          {/* SMH-4 · pilih meja yang digabung. Tidak perlu meja kosong:
              justru meja yang sedang dipakai yang digabung tamunya. */}
          {session && mode === "gabung" && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-3">
                <div className="text-sm font-semibold text-cream">Gabung meja jadi satu bill</div>
                <p className="mt-1 text-[12px] leading-snug text-mute">
                  Pesanan dan sewa tiap meja TETAP di mejanya masing-masing — yang digabung
                  hanya cara membayarnya. Jadi tidak ada uang yang berpindah, dan rekapnya
                  tetap bisa menunjukkan meja mana menghasilkan apa.
                </p>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink">
                {bisaDigabung.map((x) => {
                  const sisa = settlementOf(x, a, Date.now()).due;
                  return (
                    <button key={x.id}
                      onClick={() => {
                        dispatchA({ t: "gabungMeja", ids: [session.id, x.id] });
                        const after = peek().sessions.find((y) => y.id === session.id);
                        setMode("main");
                        flash(after?.grup
                          ? `${namaMeja(a, table.id)} + ${namaMeja(a, x.tableId)} jadi satu bill.`
                          : "Gabung ditolak — meja venue lain, atau salah satunya sudah punya gabungan sendiri.");
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-cream">
                          {namaMeja(a, x.tableId)} · {x.guest}
                        </span>
                        <span className="block text-[11px] text-dim">
                          {x.grup ? "sudah punya gabungan sendiri" : "sedang jalan"}
                        </span>
                      </span>
                      <span className="shrink-0 font-serif text-[13px] tabular-nums text-amber">{rupiah(sisa)}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setMode("main")} className="min-h-[40px] w-full text-sm text-dim">Batal</button>
            </div>
          )}

          {session && mode === "pindahItem" && (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] leading-snug text-mute">
                Pilih pesanan yang salah masuk ke meja ini, lalu pilih meja tujuannya — boleh meja yang
                sedang jalan, boleh meja kosong. Tiket dapur ikut pindah. Pesanan yang dibayar online,
                sudah dibayar per orang, atau berasal dari QR tamu tidak bisa dipindah — pakai void.
              </p>
              {/* PILIH SEMUA — permintaan pemilik 19 Okt 2026: *"jadi bisa pindah
                  keseluruhan meja."* Memindah satu meja penuh dengan mencentang
                  satu per satu adalah cara paling mudah melewatkan satu baris,
                  dan baris yang tertinggal itu ditagihkan ke meja yang salah. */}
              {barisBebas.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-dim">
                    {pilih.length} dari {barisBebas.length} baris dipilih
                  </span>
                  <button
                    onClick={() => setPilih(pilih.length === barisBebas.length ? [] : barisBebas.map((l) => l.key))}
                    className="min-h-[36px] rounded-lg border border-line bg-ink-2 px-3 text-[12px] font-semibold text-cream">
                    {pilih.length === barisBebas.length ? "Kosongkan" : "Pilih semua"}
                  </button>
                </div>
              )}
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
                  {mejaJalan.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {mejaJalan.map((x) => {
                        const t = cariMeja(x.tableId)!;
                        return (
                          <button key={x.id}
                            onClick={() => pindahkanPesanan({ sesiId: x.id }, namaMeja(a, t.id))}
                            className="min-h-[44px] rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-[13px] font-semibold text-emerald-300">
                            {tableLabel(classOf(a, t.id), t.no)}
                            <span className="ml-1 text-[10px] font-normal text-emerald-300/70">{x.guest}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* MEJA KOSONG — tidak perlu dibuka dulu (permintaan pemilik
                      19 Okt 2026). Dipisah warnanya dari meja yang sedang jalan:
                      memindah ke meja kosong MEMBUKA meja itu, dan itu kejadian
                      yang berbeda dengan menitipkan pesanan ke tamu lain. */}
                  {mejaKosong.length > 0 && (
                    <>
                      <div className="text-[11px] uppercase tracking-wider text-dim">
                        {mejaJalan.length ? "atau ke meja kosong" : "Meja kosong"} — mejanya dibuka sekalian:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {mejaKosong.map((t) => (
                          <button key={t.id}
                            onClick={() => pindahkanPesanan({ mejaId: t.id }, namaMeja(a, t.id))}
                            className="min-h-[44px] rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 text-[13px] font-semibold text-sky-300">
                            {tableLabel(classOf(a, t.id), t.no)}
                            <span className="ml-1 text-[10px] font-normal text-sky-300/70">kosong</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] leading-snug text-dim">
                        Meja kosong dibuka atas nama <span className="text-mute">{session.guest}</span> sebagai open bill
                        {kelas === "resto"
                          ? " — meja makan tidak bersewa waktu, jadi tidak ada tambahan biaya."
                          : " — meteran meja barunya mulai dihitung sejak sekarang."}
                      </p>
                    </>
                  )}

                  {mejaJalan.length === 0 && mejaKosong.length === 0 && (
                    <p className="text-[12px] text-red-300">
                      Tidak ada meja lain yang bisa menerima pesanan ini sekarang
                      {diLuarJam ? " — di luar jam buka." : "."}
                    </p>
                  )}
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
                {([
                  ["cash", "Tunai", undefined],
                  ["qris_online", "QRIS di kasir", undefined],
                  ...mesinEdc(a).map((m) => ["edc", `Kartu / EDC · ${m}`, m] as const),
                ] as const).map(([ch, label, mesin]) => (
                  <button key={`${ch}-${mesin ?? ""}`}
                    disabled={pilih.length === 0 && !(Number(nominal) > 0)}
                    onClick={() => {
                      const sebelum = (peek().sessions.find((x) => x.id === session.id)?.payments ?? []).length;
                      const tolak = dispatchA({
                        t: "paySplit", id: session.id, channel: ch,
                        ...(pilih.length ? { keys: pilih } : { amount: Number(nominal) }),
                        ...(namaOrang.trim() ? { label: namaOrang.trim() } : {}),
                        ...(mesin ? { mesin } : {}),
                      });
                      const setelah = peek().sessions.find((x) => x.id === session.id)?.payments ?? [];
                      const masuk = setelah.length > sebelum ? setelah[setelah.length - 1] : null;
                      setPilih([]); setNominal(""); setNamaOrang("");
                      setMode("main");
                      flash(masuk
                        ? `${rupiah(masuk.amount)} diterima (${label}). Sisa tagihan ${rupiah(settlementOf(peek().sessions.find((x) => x.id === session.id)!, peek()).due)}.`
                        // Alasan dari mesin lebih dulu: sejak 21 Okt 2026 bayar
                        // per orang ikut ditahan saat internet mati, dan tebakan
                        // "melebihi sisa tagihan" akan menyesatkan kasir.
                        : tolak ?? "Pembayaran ditolak — nominal melebihi sisa tagihan, atau shift belum dibuka.");
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

/** Satu baris tabel struk: "Qty Menu · @Harga · Jumlah". */
function BarisStruk({ qty, nama, harga, total }: {
  qty: number; nama: string; harga: number; total: number;
}) {
  return (
    <div className="flex justify-between gap-1 text-[11px]">
      <span className="min-w-0 flex-1 break-words">{qty} {nama}</span>
      <span className="w-[52px] shrink-0 text-right tabular-nums">{ribuan(harga)}</span>
      <span className="w-[56px] shrink-0 text-right tabular-nums">{ribuan(total)}</span>
    </div>
  );
}

/** Angka struk tanpa "Rp" — kolomnya sempit dan satuannya sudah jelas. */
const ribuan = (n: number) => n.toLocaleString("id-ID");
const tanggalStruk = (ts: number) =>
  new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const jamDetik = (ts: number) =>
  new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

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
