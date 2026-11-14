import { Fragment, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "../../components/UI";
import {
  useAdmin, maintenanceBlockers, classOf, mesinEdc,
  mejaDijual, mejaDipakai, cariMeja, namaMeja,
} from "../../lib/adminStore";
import { venueStore } from "../../lib/venueStore";
import {
  TABLES, SEMUA_MEJA, CLASS_LABEL, VENUE_LABEL, type TableType, type Venue,
} from "../../data/venue";
import { setVenueAktif, useVenueAktif } from "../../lib/venueAktif";
import { LINI, LINI_LABEL, persenLini, PERAN_SATU_VENUE, kategoriMejaVenue, kategoriMejaDari, type Lini } from "../../lib/engine";

/** Apa saja yang masuk tiap lini — ditulis di layar supaya tidak ditebak. */
const KETERANGAN_LINI: Record<Lini, string> = {
  biliar: "sewa meja + barang counter biliar (rokok, botolan)",
  bar: "minuman dari bar",
  resto: "makanan dari dapur",
};
import { ROLES, ROLE_LABEL, type Employee, type Role } from "../../data/staff";
import { rupiah } from "../../lib/core";
import { LayarTamu, PilihPrinter, PrinterDapur } from "./PilihPrinter";
import { jam } from "./AdminShell";
import QrisPanel from "./QrisPanel";
import { TambahBanyakAkun } from "./TambahBanyakAkun";
import TambahMeja from "./TambahMeja";
import { PinMassal } from "./PinMassal";
import PaketPanel from "./PaketPanel";
import PembaruanPanel from "./PembaruanPanel";
import {
  suaraNyala, setSuaraNyala, bunyikan, izinNotif, mintaIzinNotif, type IzinNotif,
} from "../../lib/notifikasi";
import { buatKunciAlat, tampilKunciAlat, useLampuAlat } from "../../lib/lampuAlat";

/* Pengaturan tarif, kelas meja, akun staf & data — hanya manajer/owner (PRD §7.5).
   Perubahan tarif TIDAK mengubah booking yang sudah dibuat: harga
   dibekukan sebagai snapshot saat hold dibuat (PRD §7.2), dan kelas meja
   dibekukan di sesinya saat meja dibuka. */

const KELAS_BILIAR: TableType[] = ["regular", "vip", "vvip"];

/**
 * SPL-5 · Bunyi & notifikasi — setelan PER PERANGKAT, bukan data venue.
 *
 * Layar dapur ingin berbunyi, komputer kasir di ruang belakang mungkin tidak.
 * Kalau disimpan di jejak, satu orang mematikan suara akan mematikannya untuk
 * semua orang — dan itu baru ketahuan saat ada pesanan yang tidak diantar.
 *
 * Izin notifikasi HANYA diminta dari tombol di bawah. Kotak izin yang muncul
 * sendiri adalah hal pertama yang ditolak orang, dan sesudah ditolak peramban
 * tidak mengizinkan bertanya lagi.
 */
/**
 * MESIN EDC — daftar mesin kartu yang ada di kasir.
 *
 * Jadi data venue karena mesin EDC datang & pergi mengikuti perjanjian
 * dengan banknya. Yang penting: nama di sini muncul sebagai TOMBOL di layar
 * bayar dan sebagai KOLOM di laporan, jadi menuliskannya persis seperti nama
 * yang dipakai saat rekonsiliasi setoran membuat pencocokannya sepele.
 */
function MesinEdc() {
  const { a, dispatchA, peek } = useAdmin();
  const [draf, setDraf] = useState(() => mesinEdc(a).join(", "));
  const [kabar, setKabar] = useState<string | null>(null);

  const simpan = () => {
    const daftar = draf.split(",").map((x: string) => x.trim()).filter(Boolean);
    dispatchA({ t: "setMesinEdc", daftar });
    const sesudah = mesinEdc(peek());
    setDraf(sesudah.join(", "));
    setKabar(daftar.length ? `Mesin EDC: ${sesudah.join(", ")}` : "Minimal satu mesin.");
    setTimeout(() => setKabar(null), 4000);
  };

  return (
    <section>
      <h2 id="atur-edc" className="scroll-mt-28 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
        Mesin EDC di kasir
      </h2>
      <div className="rounded-xl border border-line bg-ink-2 p-3.5">
        <input value={draf} onChange={(e) => setDraf(e.target.value)}
          placeholder="Mandiri, BRI"
          className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-[14px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={simpan}
            className="min-h-[40px] rounded-lg border border-amber/50 bg-amber/10 px-4 text-[13px] font-semibold text-amber">
            Simpan
          </button>
          <span className="text-[11px] text-dim">Pisahkan dengan koma</span>
        </div>
        {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Tiap mesin jadi tombolnya sendiri di layar bayar dan kolomnya sendiri di
          laporan Detail Transaksi — supaya setoran tiap bank bisa dicocokkan tanpa
          menghitung ulang. Transaksi lama yang belum memilih mesin tetap terbaca
          sebagai &ldquo;Tanpa mesin&rdquo;, bukan dibagi rata.
        </p>
      </div>
    </section>
  );
}

function BunyiNotif() {
  const [suara, setSuara] = useState(suaraNyala());
  const [izin, setIzin] = useState<IzinNotif>(izinNotif());

  return (
    <section>
      <h2 id="atur-bunyi" className="scroll-mt-28 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
        Bunyi &amp; notifikasi perangkat ini
      </h2>
      <div className="rounded-xl border border-line bg-ink-2 p-3.5">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-cream">
            Bunyi saat pesanan masuk, pesanan siap, &amp; reservasi datang
          </span>
          <input type="checkbox" checked={suara}
            onChange={(e) => { setSuaraNyala(e.target.checked); setSuara(e.target.checked); }}
            className="size-5 accent-amber" />
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {([["masuk", "Coba bunyi pesanan"], ["siap", "Coba bunyi siap"], ["reservasi", "Coba bunyi reservasi"]] as const)
            .map(([j, label]) => (
              <button key={j} type="button" onClick={() => bunyikan(j)}
                className="rounded-full border border-line bg-ink px-2.5 py-1 text-[11px] text-mute hover:border-amber hover:text-amber">
                {label}
              </button>
            ))}
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <div className="text-[12px] text-cream">
            Notifikasi peramban:{" "}
            <span className={izin === "diberikan" ? "text-emerald-400" : izin === "ditolak" ? "text-red-300" : "text-amber"}>
              {izin === "diberikan" ? "aktif"
                : izin === "ditolak" ? "diblokir di pengaturan peramban"
                  : izin === "tidak-didukung" ? "tidak didukung perangkat ini" : "belum diizinkan"}
            </span>
          </div>
          {izin === "belum" && (
            <button type="button"
              onClick={async () => setIzin(await mintaIzinNotif())}
              className="mt-2 min-h-[42px] w-full rounded-xl border border-amber/50 bg-amber/10 text-[13px] font-semibold text-amber">
              Izinkan notifikasi
            </button>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Tanpa izin notifikasi, bunyinya tetap jalan — yang tidak muncul hanya kotak
            pemberitahuannya saat jendela ini tidak sedang dilihat.
            {izin === "ditolak" && " Izin yang sudah diblokir harus dibuka dari pengaturan situs di peramban; aplikasi tidak bisa menanyakannya lagi."}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═════════════ Lampu meja — alat relay ESP32 ═════════════

   Satu-satunya tempat kunci alat dibuat dan dipasang. Kuncinya TIDAK
   pernah bisa dibaca lagi sesudah disimpan (server hanya menyimpan
   hash-nya), jadi layar ini menampilkannya sekali, besar-besar, dengan
   peringatan untuk menyalinnya dulu. Kunci yang hilang bukan bencana —
   tinggal buat yang baru — tapi harus dimasukkan ulang ke tiap alat. */

function LampuMeja() {
  const { ringkas, info, muatUlang, setKunci } = useLampuAlat(true, 15_000);
  const [kunciBaru, setKunciBaru] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<{ ok: boolean; teks: string } | null>(null);

  const pasang = async () => {
    const k = kunciBaru ?? buatKunciAlat();
    setKunciBaru(k);
    setSibuk(true);
    const alasan = await setKunci(k);
    setSibuk(false);
    setKabar(alasan ? { ok: false, teks: alasan } : { ok: true, teks: "Kunci alat terpasang di server." });
    if (!alasan) void muatUlang();
  };

  const nada =
    ringkas.status === "online" ? "text-emerald-400"
    : ringkas.status === "tersendat" ? "text-amber"
    : ringkas.status === "mati" ? "text-red-300" : "text-dim";

  return (
    <section>
      <h2 id="atur-lampu" className="scroll-mt-28 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
        Lampu meja — alat relay di venue
      </h2>
      <div className="rounded-xl border border-line bg-ink-2 p-3.5">
        <div className="text-[13px] text-cream">
          Status: <span className={nada}>{ringkas.teks}</span>
        </div>

        {info?.alat.length ? (
          <div className="mt-2 space-y-1">
            {info.alat.map((x) => (
              <div key={x.alat} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-mute">{x.alat}</span>
                <span className="text-dim">
                  {(x.nyala ?? 0)}/{(x.relay ?? 0)} nyala · {x.ip ?? "?"} · {x.rssi ?? "?"} dBm · {jam(Number(x.terakhir_ms))}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {info?.alasan && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber/90">
            Server belum bisa ditanya soal alat lampu: {info.alasan}. Kalau ini baru dipasang,
            jalankan dulu <code>supabase/schema-lampu.sql</code> di SQL Editor project venue.
          </p>
        )}

        <div className="mt-3 border-t border-line pt-3">
          <div className="text-[12px] text-cream">
            Kunci alat: {info?.berkunci
              ? <span className="text-emerald-400">sudah dipasang</span>
              : <span className="text-amber">belum dipasang</span>}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-dim">
            Kunci ini yang dimasukkan ke halaman pengaturan tiap ESP32. Tanpa kunci yang benar,
            alat tidak bisa membaca status lampu sama sekali.
          </p>

          {kunciBaru && (
            <div className="mt-2 rounded-lg border border-amber/40 bg-amber/10 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-amber">Catat / foto sekarang — tidak bisa dilihat lagi</div>
              <div className="mt-1 select-all break-all font-mono text-[17px] tracking-wide text-cream">{tampilKunciAlat(kunciBaru)}</div>
              <div className="mt-1 text-[11px] text-dim">Ketik persis seperti ini di halaman pengaturan ESP32 (huruf kecil semua; tanda - boleh ikut atau tidak).</div>
              <button type="button"
                onClick={() => { void navigator.clipboard?.writeText(kunciBaru).catch(() => { /* tanpa izin papan klip: salin manual */ }); }}
                className="mt-2 rounded-full border border-line bg-ink px-2.5 py-1 text-[11px] text-mute hover:border-amber hover:text-amber">
                Salin
              </button>
            </div>
          )}

          <button type="button" disabled={sibuk} onClick={() => { setKunciBaru(buatKunciAlat()); setKabar(null); }}
            className="mt-2 min-h-[42px] w-full rounded-xl border border-line bg-ink text-[13px] text-mute disabled:opacity-50">
            Buat kunci baru
          </button>
          {kunciBaru && (
            <button type="button" disabled={sibuk} onClick={() => { void pasang(); }}
              className="mt-2 min-h-[42px] w-full rounded-xl border border-amber/50 bg-amber/10 text-[13px] font-semibold text-amber disabled:opacity-50">
              {sibuk ? "Memasang…" : "Pasang kunci ini di server"}
            </button>
          )}
          {kabar && (
            <div className={`mt-2 text-[12px] ${kabar.ok ? "text-emerald-400" : "text-red-300"}`}>{kabar.teks}</div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Memasang kunci baru membuat alat yang masih memakai kunci lama berhenti menerima status —
            lampunya TIDAK padam, tetap pada keadaan terakhir sampai kuncinya diperbarui di alat.
            Panduan lengkap: <code>docs/PANDUAN-LAMPU-ESP32.md</code>.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Pengaturan() {
  const { a, dispatchA, byTable, sync, resetData, peek, terbitkanSekarang, allow } = useAdmin();
  const venue = useVenueAktif();
  const [confirmReset, setConfirmReset] = useState<null | boolean>(null);
  const [draft, setDraft] = useState(a.rates);
  /** Tarif yang menjadi dasar suntingan — untuk mendeteksi perubahan dari perangkat lain. */
  const [baseRates, setBaseRates] = useState(a.rates);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [tableNote, setTableNote] = useState<string | null>(null);
  /** Perubahan persen pajak yang MENUNGGU konfirmasi ya/tidak. */
  const [ubahPajak, setUbahPajak] = useState<
    null | { lini: Lini; key: "ppn" | "service"; dari: number; ke: number }
  >(null);
  const [pilihMeja, setPilihMeja] = useState<string | null>(null);
  /** Kategori Pengaturan yang sedang dibuka — diingat per perangkat. */
  const [kategori, setKategori] = useState<string>(() => {
    try { return localStorage.getItem("spl:v1:pengaturan-kategori") ?? ""; } catch { return ""; }
  });
  /** Isian "nama meja" untuk meja yang sedang dipilih. null = belum diubah. */
  const [namaBaru, setNamaBaru] = useState<string | null>(null);
  /** Formulir tambah meja. */

  /** Delapan tarif: empat weekday + empat weekend (kosong/0 = sama dengan weekday). */
  const KUNCI_TARIF = ["regularDay", "regularNight", "vip", "vvip", "regularDayWe", "regularNightWe", "vipWe", "vvipWe"] as const;
  const same = (x: typeof draft, y: typeof draft) => KUNCI_TARIF.every((k) => (x[k] ?? 0) === (y[k] ?? 0));
  const dirty = !same(draft, a.rates);
  const editing = !same(draft, baseRates);
  const remoteChanged = !same(baseRates, a.rates);
  const invalid = draft.regularDay <= 0 || draft.regularNight <= 0 || draft.vip <= 0 || draft.vvip <= 0;

  // Tarif diubah dari perangkat/tab lain: kalau sedang tidak menyunting, ikuti tarif terbaru.
  useEffect(() => {
    if (!editing) { setDraft(a.rates); setBaseRates(a.rates); }
  }, [a.rates]); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(n: { ok: boolean; text: string }) {
    setNote(n);
    setTimeout(() => setNote(null), 3500);
  }

  async function save() {
    KUNCI_TARIF.forEach((k) => {
      if ((draft[k] ?? 0) !== (a.rates[k] ?? 0)) dispatchA({ t: "setRate", key: k, value: draft[k] ?? 0 });
    });
    // Dibaca ulang dari mesin — layar tidak mengaku "tersimpan" untuk tarif yang ditolak.
    const after = peek().rates;
    if (same(after, draft)) {
      setBaseRates(after);
      flash({ ok: true, text: "Tarif tersimpan" });
      await terbitkanSekarang?.();
    } else {
      flash({ ok: false, text: "Sebagian tarif ditolak — pastikan semua tarif lebih dari Rp 0." });
    }
  }

  function toggleTable(tableId: string, broken: boolean) {
    dispatchA({ t: "toggleMaintenance", tableId });
    const nowBroken = peek().sessions.some((x) => x.tableId === tableId && x.status === "maintenance");
    if (nowBroken === broken) setTableNote("Status meja tidak berubah — mungkin baru saja ada tamu atau booking di meja itu.");
    else {
      setTableNote(null);
      void terbitkanSekarang?.();
    }
  }

  /** Ganti nama meja. Dikirim hanya kalau memang berubah — nama sama = aksi kosong yang ditolak mesin. */
  function gantiNama(tableId: string, nama: string) {
    const bersih = nama.trim().slice(0, 30);
    if (bersih === namaMeja(a, tableId)) { setNamaBaru(null); return; }
    const kembar = bersih && mejaDijual(a).some((t) => t.id !== tableId
      && namaMeja(a, t.id).trim().toLowerCase() === bersih.toLowerCase());
    if (kembar) {
      setTableNote(`Nama "${bersih}" sudah dipakai meja lain — pilih nama lain supaya kasir dan checker tidak tertukar.`);
      return;
    }
    dispatchA({ t: "setTableName", tableId, name: bersih });
    if (namaMeja(peek(), tableId) !== (bersih || cariMeja(tableId)?.name)) {
      setTableNote("Nama meja tidak berubah — ditolak mesin.");
    } else {
      setTableNote(null);
      setNamaBaru(null);
      void terbitkanSekarang?.();
    }
  }

  // TAMBAH MEJA: lihat `TambahMeja` — satu formulir untuk Pengaturan dan Papan.

  function setKelas(tableId: string, type: TableType) {
    dispatchA({ t: "setTableClass", tableId, type });
    if (classOf(peek(), tableId) !== type) {
      setTableNote("Kelas meja tidak berubah — selesaikan atau pindahkan dulu tamu/booking di meja itu.");
    } else {
      setTableNote(null);
      void terbitkanSekarang?.();
    }
  }

  /* DENAH VENUE INI — meja yang sedang dijual. Dulu bagian ini selalu
     menampilkan meja biliar, apa pun venue yang sedang dibuka; sejak 21 Okt
     2026 ia ikut venue, seperti sisa aplikasi. */
  const biliar = mejaDijual(a).filter((t) => t.venue === venue);
  const hitung = (k: TableType) => biliar.filter((t) => classOf(a, t.id) === k).length;
  const mejaTerpilih = pilihMeja ? cariMeja(pilihMeja) ?? null : null;
  /** Meja yang dikenal mesin tapi belum dijual — calon "tambah meja". */
  const mejaCadangan = SEMUA_MEJA.filter((t) => t.venue === venue && !mejaDipakai(a, t.id));

  /*
   * PENGATURAN (dirombak 14 Nov 2026, pemilik: "terlalu sulit dicek, SPL dan
   * Smokehouse tidak ada pemisahnya").
   *
   * Satu KATEGORI tampil sekali waktu (menu di kiri; di HP di atas), bukan satu
   * halaman panjang. Tiap kategori menyebut CAKUPANNYA: venue yang dipilih,
   * kedua venue, perangkat ini, atau sistem — dan pemilih venue ada di kepala
   * halaman, karena tarif, paket, meja, dan lampu memang berbeda per venue.
   * Isi tiap bagian tidak diubah: bagian yang sama, tombol yang sama.
   */
  type Kat = "tarif" | "paket" | "meja" | "lampu" | "akun" | "bayar" | "perangkat" | "sistem";
  const KATEGORI: { id: Kat; label: string; ket: string; cakupan: "venue" | "dua" | "perangkat" | "sistem"; boleh: boolean }[] = [
    // Di Smokehouse isinya tinggal pajak, yang berlaku untuk kedua venue.
    { id: "tarif", label: venue === "spl" ? "Tarif & pajak" : "Pajak", cakupan: venue === "spl" ? "venue" : "dua",
      ket: venue === "spl" ? "Tarif sewa meja per jam (weekday & weekend) dan pemecahan PPN/service di laporan."
        : "Pemecahan PPN/service per lini di laporan.", boleh: allow("ubahTarif") },
    { id: "paket", label: "Paket", cakupan: "venue", ket: "Paket yang dijual di venue ini.", boleh: allow("kelolaPromo") },
    { id: "meja", label: "Meja", cakupan: "venue", ket: "Tambah, ganti nama, hapus, kelas, dan meja rusak.", boleh: allow("kelolaMeja") },
    { id: "lampu", label: "Lampu meja", cakupan: "venue", ket: "Alat relay lampu meja biliar.", boleh: allow("kontrolLampu") && venue === "spl" },
    { id: "akun", label: "Akun staf", cakupan: "dua", ket: "Akun, peran, PIN, dan venue tiap karyawan.", boleh: allow("kelolaMeja") },
    { id: "bayar", label: "Pembayaran", cakupan: "dua", ket: "Mesin EDC dan QRIS dinamis.", boleh: allow("ubahTarif") || allow("kelolaMeja") },
    { id: "perangkat", label: "Printer & layar", cakupan: "perangkat", ket: "Printer struk, printer checker/bar, layar tamu, dan bunyi di komputer ini.", boleh: true },
    { id: "sistem", label: "Sistem", cakupan: "sistem", ket: "Mode demo, pembaruan aplikasi, dan data.", boleh: true },
  ];
  const tersedia = KATEGORI.filter((k) => k.boleh);
  const kat = tersedia.find((k) => k.id === kategori) ?? tersedia[0];
  const pilihKat = (id: Kat) => {
    setKategori(id);
    try { localStorage.setItem("spl:v1:pengaturan-kategori", id); } catch { /* mode privat */ }
    // Isi kategori baru dibaca dari atas, bukan dari posisi gulir kategori sebelumnya.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const CAKUPAN = {
    venue: { teks: VENUE_LABEL[venue], kelas: "border-amber/50 bg-amber/10 text-amber" },
    dua: { teks: "Kedua venue", kelas: "border-sky-400/40 bg-sky-400/10 text-sky-300" },
    perangkat: { teks: "Perangkat ini saja", kelas: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
    sistem: { teks: "Sistem", kelas: "border-line bg-ink text-mute" },
  } as const;
  const grup: { judul: string; isi: typeof tersedia }[] = [
    { judul: `Venue · ${VENUE_LABEL[venue]}`, isi: tersedia.filter((k) => k.cakupan === "venue") },
    { judul: "Kedua venue", isi: tersedia.filter((k) => k.cakupan === "dua") },
    { judul: "Perangkat & sistem", isi: tersedia.filter((k) => k.cakupan === "perangkat" || k.cakupan === "sistem") },
  ].filter((g) => g.isi.length > 0);

  return (
    <div className="space-y-4 pb-6">
      {/* ── KEPALA: judul + PEMISAH VENUE ── */}
      <section className="rounded-2xl border border-line bg-ink-2">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl uppercase tracking-wide text-cream">Pengaturan</h1>
            <p className="text-[12px] text-mute">Pilih kategori di kiri. Label di tiap kategori menyebut untuk siapa pengaturannya berlaku.</p>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">Sedang mengatur venue</div>
            {a.me?.venue ? (
              <span className="inline-block rounded-lg border border-amber/50 bg-amber/10 px-3 py-1.5 text-[12px] font-bold text-amber">
                {VENUE_LABEL[a.me.venue]}
              </span>
            ) : (
              <div className="inline-flex gap-0.5 rounded-xl border border-line bg-ink p-0.5" role="radiogroup" aria-label="Venue yang diatur">
                {(["spl", "smh"] as const).map((v) => (
                  <button key={v} role="radio" aria-checked={venue === v} onClick={() => setVenueAktif(v)}
                    className={`min-h-[36px] rounded-lg px-4 text-[13px] font-bold ${
                      venue === v ? "bg-amber text-ink" : "text-mute hover:text-cream"
                    }`}>{VENUE_LABEL[v]}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* ── MENU KATEGORI: kolom kiri di layar lebar, deret di atas di HP ── */}
        <nav aria-label="Kategori pengaturan"
          className="no-bar -mx-4 flex gap-3 overflow-x-auto px-4 lg:sticky lg:top-28 lg:mx-0 lg:block lg:space-y-4 lg:overflow-visible lg:rounded-2xl lg:border lg:border-line lg:bg-ink-2 lg:p-3">
          {grup.map((g) => (
            <div key={g.judul} className="shrink-0 lg:shrink">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-dim lg:px-2">{g.judul}</div>
              <div className="flex gap-1 lg:flex-col">
                {g.isi.map((k) => (
                  <button key={k.id} onClick={() => pilihKat(k.id)} aria-current={kat?.id === k.id ? "page" : undefined}
                    className={`shrink-0 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
                      kat?.id === k.id ? "bg-amber text-ink" : "border border-line bg-ink text-mute hover:text-cream lg:border-transparent lg:bg-transparent"
                    }`}>{k.label}</button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* ── ISI KATEGORI ── */}
        <div className="min-w-0 space-y-6">
          {kat && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <div className="min-w-0">
                <h2 className="font-display text-lg uppercase tracking-wide text-cream">{kat.label}</h2>
                <p className="text-[12px] text-mute">{kat.ket}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${CAKUPAN[kat.cakupan].kelas}`}>
                Berlaku: {kat.id === "tarif" ? (venue === "spl" ? "tarif SPL Sport · pajak kedua venue" : "kedua venue") : CAKUPAN[kat.cakupan].teks}
              </span>
            </div>
          )}
          {kat?.id === "tarif" && (<>
      {allow("ubahTarif") && (<>
      {/* ── Tarif ────────────────────────────────────────── */}
      <section>
        {venue === "spl" ? (<>
        <h2 id="atur-tarif" className="scroll-mt-28 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Tarif per jam
        </h2>
        {/* TARIF WEEKDAY & WEEKEND (permintaan pemilik 14 Nov 2026). Satu baris per
            kelas, dua kolom: weekday (Senin–Jumat) dan weekend (Sabtu & Minggu,
            menurut hari operasional — main jam 03.00 Minggu pagi masih Sabtu).
            Kolom weekend kosong = memakai tarif weekday. */}
        <div className="overflow-hidden rounded-2xl border border-line bg-ink-2">
          <div className="grid grid-cols-[minmax(0,1fr)_112px_112px] items-center gap-2 border-b border-line px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-dim">
            <span>Kelas · jam</span><span className="text-right">Weekday</span><span className="text-right">Weekend</span>
          </div>
          {([
            ["regularDay", "regularDayWe", "Reguler siang", "11.00 – 18.00"],
            ["regularNight", "regularNightWe", "Reguler malam", "18.00 – tutup & lembur"],
            ["vip", "vipWe", "VIP (bebas asap rokok)", `sepanjang jam · ${hitung("vip")} ruang`],
            ["vvip", "vvipWe", "VVIP (boleh merokok)", `sepanjang jam · ${hitung("vvip")} ruang`],
          ] as const).map(([k, kWe, label, hint]) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_112px_112px] items-center gap-2 border-b border-line/60 px-3 py-2.5 last:border-b-0">
              <div className="min-w-0">
                <div className="truncate text-[13px] text-cream">{label}</div>
                <div className="truncate text-[11px] text-dim">{hint}</div>
              </div>
              <InputTarif label={`${label} weekday`} value={draft[k]} onChange={(v) => setDraft({ ...draft, [k]: v ?? 0 })} />
              <InputTarif label={`${label} weekend`} value={draft[kWe]} kosongBoleh placeholder={String(draft[k] || "")}
                onChange={(v) => setDraft({ ...draft, [kWe]: v ?? 0 })} />
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
          Weekend = Sabtu & Minggu (hari operasional, berganti pukul 06.00). Kosongkan kolom weekend untuk memakai
          tarif weekday. Jam lewat tutup (lembur) memakai tarif malam.
        </p>

        {/* Pratinjau — supaya tidak ada kejutan setelah disimpan */}
        <div className="mt-3 rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-[11px] uppercase tracking-wider text-dim">Pratinjau harga sesi · weekday / weekend</div>
          <div className="mt-1.5 space-y-1 text-[13px]">
            {([
              ["Reguler 2 jam siang", 2 * draft.regularDay, 2 * (draft.regularDayWe || draft.regularDay)],
              ["Reguler 2 jam malam", 2 * draft.regularNight, 2 * (draft.regularNightWe || draft.regularNight)],
              ["Reguler 17.00–19.00 (lintas tarif)", draft.regularDay + draft.regularNight,
                (draft.regularDayWe || draft.regularDay) + (draft.regularNightWe || draft.regularNight)],
              ["VIP 3 jam", 3 * draft.vip, 3 * (draft.vipWe || draft.vip)],
              ["VVIP 3 jam", 3 * draft.vvip, 3 * (draft.vvipWe || draft.vvip)],
            ] as const).map(([l, wd, we]) => (
              <div key={l} className="flex items-baseline justify-between gap-2">
                <span className="text-mute">{l}</span>
                <span className="font-serif tabular-nums text-cream">
                  {rupiah(wd)} <span className="text-dim">/</span> <span className={we !== wd ? "text-amber" : ""}>{rupiah(we)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {editing && remoteChanged && (
          <p className="mt-3 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">
            Tarif baru saja diubah dari perangkat lain ({rupiah(a.rates.regularDay)} · {rupiah(a.rates.regularNight)} ·{" "}
            {rupiah(a.rates.vip)} · {rupiah(a.rates.vvip)}). Periksa lagi sebelum menyimpan, atau batalkan untuk memakai tarif terbaru.
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Button disabled={!dirty || invalid} onClick={save}>Simpan tarif</Button>
          {(dirty || editing) && (
            <button
              onClick={() => { setDraft(a.rates); setBaseRates(a.rates); }}
              className="min-h-[44px] text-sm text-dim"
            >Batalkan</button>
          )}
          {note && (
            <motion.span
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
              className={`text-[13px] ${note.ok ? "text-emerald-400" : "text-red-300"}`}
            >{note.text}</motion.span>
          )}
        </div>
        {invalid && <p className="mt-1.5 text-[11px] text-red-300">Tarif harus lebih dari Rp 0.</p>}

        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Perubahan tarif hanya berlaku untuk booking baru. Booking yang sudah dibayar
          memakai harga saat dipesan, dan meja yang sedang jalan memakai tarif saat dibuka —
          pelanggan tidak boleh ikut berubah harganya di tengah jalan.
        </p>

        </>) : (
          <p className="rounded-xl border border-line bg-ink-2 px-3 py-3 text-[12px] leading-relaxed text-mute">
            Smokehouse tidak memakai tarif sewa per jam — yang ditagih hanya makanan &amp; minuman, dan harganya
            diatur di <span className="text-cream">Menu &amp; Stok</span>. Untuk tarif meja biliar, pilih
            <span className="text-cream"> SPL Sport</span> di atas.
          </p>
        )}
        {/* PPN & SERVICE PER LINI USAHA (permintaan pemilik 18 Okt 2026).
            HANYA pemecahan laporan, bukan penambah harga. */}
        <div className="mt-3 rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
            PPN &amp; service per lini usaha
          </div>

          <div className="mt-2 space-y-2">
            {LINI.map((lini) => {
              const p = persenLini(a, lini);
              return (
                <div key={lini} className="rounded-lg border border-line bg-ink px-3 py-2">
                  <div className="text-[12px] font-semibold text-cream">{LINI_LABEL[lini]}</div>
                  <div className="text-[10px] leading-snug text-dim">{KETERANGAN_LINI[lini]}</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {([["ppn", "PPN"], ["service", "Service"]] as const).map(([k, label]) => (
                      <label key={k} className="block">
                        <span className="mb-1 block text-[11px] text-dim">{label} (%)</span>
                        <input
                          type="number" min={0} max={50} step={0.5} defaultValue={p[k]}
                          key={`${lini}-${k}-${p[k]}`}
                          onBlur={(ev) => {
                            const v = Number(ev.target.value);
                            if (!Number.isFinite(v) || v === p[k]) { ev.target.value = String(p[k]); return; }
                            // Dikonfirmasi dulu, baru tersimpan.
                            setUbahPajak({ lini, key: k, dari: p[k], ke: Math.round(v * 100) / 100 });
                            ev.target.value = String(p[k]);
                          }}
                          className="min-h-[40px] w-full rounded-lg border border-line bg-ink-2 px-2 text-right text-[13px] tabular-nums text-cream focus:border-amber focus:outline-none" />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* KONFIRMASI YA/TIDAK — diminta pemilik. Persen pajak masuk ke
              laporan yang dibawa ke orang pajak; satu angka yang terketik
              salah lalu langsung tersimpan baru ketahuan sebulan kemudian. */}
          {ubahPajak && (
            <div className="mt-2 rounded-xl border border-amber/50 bg-amber/10 p-3">
              <div className="text-[13px] leading-snug text-cream">
                Ubah <span className="font-bold">{ubahPajak.key === "ppn" ? "PPN" : "Service"}{" "}
                {LINI_LABEL[ubahPajak.lini]}</span> dari{" "}
                <span className="tabular-nums">{ubahPajak.dari}%</span> jadi{" "}
                <span className="font-bold tabular-nums text-amber">{ubahPajak.ke}%</span>?
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    dispatchA({ t: "setPajakLini", lini: ubahPajak.lini, key: ubahPajak.key, value: ubahPajak.ke });
                    const jadi = persenLini(peek(), ubahPajak.lini)[ubahPajak.key];
                    setTableNote(jadi === ubahPajak.ke
                      ? `${ubahPajak.key === "ppn" ? "PPN" : "Service"} ${LINI_LABEL[ubahPajak.lini]} jadi ${jadi}%.`
                      : "Persen ditolak — harus 0 sampai 50.");
                    setUbahPajak(null);
                  }}
                  className="min-h-[42px] flex-1 rounded-lg bg-amber text-[13px] font-bold text-ink">
                  Ya, ubah
                </button>
                <button onClick={() => setUbahPajak(null)}
                  className="min-h-[42px] flex-1 rounded-lg border border-line bg-ink text-[13px] text-mute">
                  Tidak
                </button>
              </div>
            </div>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Harga yang dilihat tamu <span className="text-cream">sudah termasuk</span> keduanya, jadi
            mengubah angka di sini <span className="text-cream">tidak menaikkan satu rupiah pun</span> dari
            tagihan — yang berubah cuma cara laporan memecah nilai penjualan jadi DPP, PPN, dan service.
            Transaksi yang sudah tutup buku tetap memakai persen yang berlaku saat itu.
          </p>
        </div>
      </section>
      </>)}
          </>)}
          {kat?.id === "paket" && (<>
      {allow("kelolaPromo") && (<>
      {/* ── Paket: lihat PaketPanel.tsx ───────────── */}
      <div id="atur-paket" className="scroll-mt-28"><PaketPanel venue={venue} /></div>
      </>)}
          </>)}
          {kat?.id === "meja" && (<>
      {allow("kelolaMeja") && (
      <section>
        <h2 id="atur-meja" className="scroll-mt-28 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Meja {VENUE_LABEL[venue]} · {biliar.length}
        </h2>
        <div className="mb-2 flex flex-wrap gap-3 text-[12px] text-dim">
          {venue === "spl" ? (<>
            <span>{hitung("regular")} reguler</span>
            <span className="text-amber/90">{hitung("vip")} VIP (bebas asap rokok)</span>
            <span className="text-brick-lit">{hitung("vvip")} VVIP (boleh merokok)</span>
          </>) : (
            <span>{hitung("resto")} meja makan · tanpa sewa waktu</span>
          )}
        </div>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
          {biliar.map((t) => {
            const s = byTable.get(t.id);
            const broken = s?.status === "maintenance";
            const kelas = classOf(a, t.id);
            return (
              <button
                key={t.id}
                onClick={() => { setPilihMeja(pilihMeja === t.id ? null : t.id); setNamaBaru(null); }}
                aria-pressed={pilihMeja === t.id}
                className={`min-h-[46px] rounded-lg border text-[13px] font-semibold transition-colors ${
                  pilihMeja === t.id ? "border-amber bg-amber/15 text-amber"
                    : broken ? "border-line-2 bg-ink-3 text-dim line-through"
                      : kelas === "vvip" ? "border-brick bg-brick/25 text-cream"
                        : kelas === "vip" ? "border-amber/50 bg-amber/10 text-cream"
                          : "border-line bg-ink-2 text-cream"
                }`}
              >
                {t.type === "resto" ? <span className="block truncate px-1">{namaMeja(a, t.id)}</span>
                  : t.type === "vip" || t.type === "vvip" ? `V${t.no}` : t.no}
                <div className="text-[9px] font-normal uppercase tracking-wider text-dim">
                  {kelas === "resto" ? (t.lantai ? `lantai ${t.lantai}` : "resto") : kelas === "regular" ? "reg" : kelas}
                </div>
              </button>
            );
          })}
        </div>

        {mejaTerpilih && (
          <div className="mt-2 rounded-xl border border-amber/40 bg-amber/5 p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-cream">
                {namaMeja(a, mejaTerpilih.id)}
                {namaMeja(a, mejaTerpilih.id) !== mejaTerpilih.name && (
                  <span className="ml-1.5 text-[11px] font-normal text-dim">(kode {mejaTerpilih.name})</span>
                )}
              </span>
              <button onClick={() => setPilihMeja(null)} className="text-[12px] text-dim">tutup</button>
            </div>
            {/* GANTI NAMA MEJA — permintaan staf Smokehouse 14 Nov 2026 ("R01, R02
                bisa dirubah?"). Nama baru langsung dipakai di papan, struk, dan
                kertas checker berikutnya; kertas yang sudah tercetak tetap. */}
            <div className="mt-2 text-[11px] uppercase tracking-wider text-dim">Nama meja</div>
            <div className="mt-1 flex gap-1.5">
              <input value={namaBaru ?? namaMeja(a, mejaTerpilih.id)}
                onChange={(e) => setNamaBaru(e.target.value.slice(0, 30))}
                onKeyDown={(e) => { if (e.key === "Enter" && namaBaru !== null) gantiNama(mejaTerpilih.id, namaBaru); }}
                placeholder={mejaTerpilih.name} aria-label="Nama meja"
                className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 text-[14px] text-cream focus:border-amber focus:outline-none" />
              <button disabled={namaBaru === null || namaBaru.trim() === namaMeja(a, mejaTerpilih.id)}
                onClick={() => namaBaru !== null && gantiNama(mejaTerpilih.id, namaBaru)}
                className="min-h-[44px] shrink-0 rounded-lg bg-amber px-4 text-[12px] font-bold text-ink disabled:opacity-40">
                Simpan nama
              </button>
            </div>
            <p className="mt-1 text-[11px] text-dim">Kosongkan lalu simpan untuk kembali ke nama bawaan ({mejaTerpilih.name}).</p>
            {mejaTerpilih.type !== "resto" && (
              <>
                <div className="mt-2 text-[11px] uppercase tracking-wider text-dim">Kelas & tarif meja ini</div>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {KELAS_BILIAR.map((k) => (
                    <button key={k} onClick={() => setKelas(mejaTerpilih.id, k)}
                      aria-pressed={classOf(a, mejaTerpilih.id) === k}
                      className={`min-h-[44px] rounded-lg border px-2 text-[12px] font-semibold ${
                        classOf(a, mejaTerpilih.id) === k ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
                      }`}>
                      {k === "regular" ? "Reguler" : k === "vip" ? "VIP" : "VVIP"}
                      <div className="text-[10px] font-normal text-dim">
                        {rupiah(k === "regular" ? a.rates.regularNight : k === "vip" ? a.rates.vip : a.rates.vvip)}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {/* KATEGORI MEJA SMOKEHOUSE (pemilik 15 Nov 2026): Reguler, VIP, Owner,
                Entertain, atau kategori buatan sendiri. Owner/Entertain = compliment Rp 0. */}
            {mejaTerpilih.venue === "smh" && (
              <>
                <div className="mt-2 text-[11px] uppercase tracking-wider text-dim">Kategori meja</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {kategoriMejaVenue(a, "smh").map((k) => {
                    const on = kategoriMejaDari(a, mejaTerpilih.id)?.id === k.id;
                    return (
                      <button key={k.id} aria-pressed={on}
                        onClick={() => {
                          dispatchA({ t: "setKategoriMeja", tableId: mejaTerpilih.id, kategori: k.id });
                          setTableNote(kategoriMejaDari(peek(), mejaTerpilih.id)?.id === k.id
                            ? `${namaMeja(a, mejaTerpilih.id)} sekarang kategori ${k.nama}.`
                            : "Kategori tidak berubah — selesaikan dulu tamu atau booking di meja ini.");
                        }}
                        className={`min-h-[40px] rounded-lg border px-3 text-[12px] font-semibold ${
                          on ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
                        }`}>
                        {k.nama}
                        {k.compliment && <span className="block text-[10px] font-normal text-sky-300">compliment · Rp 0</span>}
                      </button>
                    );
                  })}
                  {kategoriMejaVenue(a, "smh").filter((k) => !k.bawaan && !Object.values(a.mejaKategori ?? {}).includes(k.id)).map((k) => (
                    <button key={`hapus-${k.id}`}
                      onClick={() => { dispatchA({ t: "hapusKategoriMeja", id: k.id }); setTableNote(`Kategori ${k.nama} dihapus.`); }}
                      className="min-h-[40px] rounded-lg border border-dashed border-line px-2 text-[11px] text-red-300"
                      title="Kategori ini tidak dipakai meja mana pun">hapus “{k.nama}”</button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-dim">Kategori baru dibuat dari formulir “Tambah meja” di bawah. Tidak bisa diganti saat meja sedang dipakai.</p>
              </>
            )}
            <button
              disabled={!byTable.get(mejaTerpilih.id) && maintenanceBlockers(a, mejaTerpilih.id).length > 0}
              onClick={() => toggleTable(mejaTerpilih.id, byTable.get(mejaTerpilih.id)?.status === "maintenance")}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-[12px] text-cream disabled:opacity-40">
              {byTable.get(mejaTerpilih.id)?.status === "maintenance" ? "Aktifkan kembali meja ini" : "Tandai meja rusak"}
            </button>
            {/* TARIK DARI DENAH — beda dengan "rusak". Rusak = sementara, mejanya
                tetap di papan dengan tanda silang. Ditarik = mejanya memang
                tidak ada lagi di ruangan, jadi hilang dari papan, dari booking
                tamu, dan dari penyebut utilisasi. Riwayatnya tetap utuh. */}
            <button
              disabled={maintenanceBlockers(a, mejaTerpilih.id).length > 0}
              onClick={() => {
                const nm = namaMeja(a, mejaTerpilih.id);
                if (!confirm(`Hapus ${nm} dari denah? `
                  + `Mejanya hilang dari papan dan dari booking tamu. Riwayat & laporannya tetap tersimpan, `
                  + `dan bisa ditambahkan lagi kapan saja.`)) return;
                dispatchA({ t: "setMejaDipakai", tableId: mejaTerpilih.id, dipakai: false });
                if (mejaDipakai(peek(), mejaTerpilih.id)) {
                  setTableNote(`${nm} tidak bisa dihapus — masih ada tamu, pesanan, atau booking di meja itu.`);
                  return;
                }
                setTableNote(`${nm} dihapus dari denah.`);
                setPilihMeja(null);
                void terbitkanSekarang?.();
              }}
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-red-500/40 px-3 text-[12px] text-red-300 disabled:opacity-40">
              Hapus meja ini dari denah
            </button>
            {maintenanceBlockers(a, mejaTerpilih.id).length > 0 && (
              <p className="mt-1 text-[11px] text-dim">Belum bisa dihapus: masih ada tamu, pesanan, atau booking di meja ini.</p>
            )}
          </div>
        )}
        {/* TAMBAH MEJA (permintaan pemilik 21 Okt 2026). Mejanya diambil dari
            katalog yang sudah dikenal mesin — venue, kelas, dan kapasitasnya
            sudah benar sejak awal, jadi tidak ada yang ditebak saat meja baru
            mulai dipakai. Namanya bisa diganti setelah ditambahkan. */}
        <div className="mt-3 rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
            Tambah meja {VENUE_LABEL[venue]}
          </div>
          {mejaCadangan.length === 0 ? (
            <p className="mt-1.5 text-[12px] text-dim">
              Semua meja yang dikenal mesin sudah dipakai di venue ini.
            </p>
          ) : (
            <div className="mt-2">
              {/* FORMULIR YANG SAMA dengan "+ Meja" di Papan (pemilik 15 Nov 2026):
                  pilih lantai (Smokehouse) atau kelas (SPL), beri nama, tambah. */}
              <TambahMeja key={venue} venue={venue} onSelesai={(pesan, id) => {
                setTableNote(`${pesan} Juga bisa langsung dari Papan lewat kotak "+ Meja" di ujung tiap lantai.`);
                setPilihMeja(id);
                setNamaBaru(null);
              }} />
            </div>
          )}
        </div>

        {tableNote && <p role="status" className="mt-2 text-[12px] text-amber">{tableNote}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Ketuk meja untuk mengganti namanya, menghapusnya, mengatur kelasnya (Reguler / VIP bebas asap rokok / VVIP boleh merokok), atau menandainya rusak.
          Kelas menentukan tarif per jam meja itu. Meja yang sedang dipakai atau sudah dibooking tidak bisa
          berpindah kelas — harga sudah terlanjur disepakati tamu.
        </p>
      </section>
      )}
          </>)}
          {kat?.id === "lampu" && (<>
      {allow("kontrolLampu") && <LampuMeja />}
          </>)}
          {kat?.id === "akun" && (<>
      {allow("kelolaMeja") && <AkunStaf />}
          </>)}
          {kat?.id === "bayar" && (<>
      {allow("ubahTarif") && <MesinEdc />}
      {allow("kelolaMeja") && (<>
      {/* ── QRIS dinamis ─────────────────────────────────── */}
      <div id="atur-qris" className="scroll-mt-28"><QrisPanel /></div>
      </>)}
          </>)}
          {kat?.id === "perangkat" && (<>
      {/* Printer struk: setelan PERANGKAT, bukan data venue — tiap komputer
          kasir punya printernya sendiri. */}
      <div id="atur-printer" className="scroll-mt-28"><PilihPrinter /></div>
      <PrinterDapur />
      <div id="atur-layar" className="scroll-mt-28"><LayarTamu /></div>
      <BunyiNotif />
          </>)}
          {kat?.id === "sistem" && (<>
      {allow("bukaKunciJam") && (
      <section>
        <h2 id="atur-demo" className="scroll-mt-28 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Mode demo
        </h2>
        <div className={`rounded-xl border p-3.5 ${
          a.jamBebas ? "border-amber bg-amber/10" : "border-line bg-ink-2"
        }`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-cream">Buka meja 24 jam</span>
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              a.jamBebas ? "text-amber" : "text-dim"
            }`}>{a.jamBebas ? "menyala" : "mati"}</span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-mute">
            Tamu hanya bisa booking & pesan dari HP pukul 11.00–06.00; kasir tetap bisa membuka meja di luar jam itu selama shift buka (lembur). Nyalakan ini untuk memperagakan
            aplikasi di luar jam itu — pagi, siang, kapan saja.
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-dim">
            Yang dibuka hanya jamnya. Harga, hak akses tiap peran, pemisahan SPL dan Smokehouse,
            serta penahanan pembayaran saat internet mati tetap berlaku seperti biasa.
            Penyalaannya tercatat di Jejak lengkap dengan nama Anda.
          </p>
          <button
            onClick={() => dispatchA({ t: "setJamBebas", on: !a.jamBebas })}
            className={`mt-2.5 min-h-[46px] w-full rounded-xl text-[13px] font-bold ${
              a.jamBebas ? "border border-line bg-ink text-cream" : "bg-amber text-ink"
            }`}>
            {a.jamBebas ? "Matikan — kembali ke jam buka biasa" : "Nyalakan mode demo"}
          </button>
        </div>
      </section>
      )}
      <div id="atur-pembaruan" className="scroll-mt-28"><PembaruanPanel /></div>
      {allow("kelolaMeja") && (<>
      {/* ── Data simulasi ────────────────────────────────── */}
      <section>
        <h2 id="atur-data" className="scroll-mt-28 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
          Data &amp; sinkronisasi
        </h2>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
          <InfoRow k="Penyimpanan"
            v={sync.persisted ? "Tersimpan di perangkat ini" : "Tidak tersimpan — mode privat atau penyimpanan diblokir"}
            bad={!sync.persisted} />
          <InfoRow k="Server"
            v={sync.mode === "lokal"
              ? "Belum tersambung server — data hanya hidup di perangkat ini"
              : sync.online
                ? `Tersambung · ${sync.head.toLocaleString("id-ID")} kejadian bernomor urut server${sync.pending ? ` · ${sync.pending} menunggu konfirmasi` : ""}`
                : `Terputus — aksi uang ditahan${sync.pending ? ` · ${sync.pending} aksi menunggu dikirim` : ""}`}
            bad={sync.mode === "server" && !sync.online} />
          <InfoRow k="Antar-layar"
            v={sync.live === "broadcast" ? "Sinkron seketika antar-tab di perangkat ini"
              : sync.live === "storage" ? "Sinkron lewat penyimpanan browser" : "Tidak sinkron antar-tab"}
            bad={sync.live === "none"} />
          <InfoRow k="Jejak" v={`${sync.entries.toLocaleString("id-ID")} kejadian tercatat`} />
          <InfoRow k="Titik simpan"
            v={sync.snapshotAt
              ? `${new Date(sync.snapshotAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · membuka aplikasi memutar ${sync.tail.toLocaleString("id-ID")} kejadian terakhir`
              : `Belum ada — dibuat otomatis setelah jejak cukup panjang (${sync.tail.toLocaleString("id-ID")} kejadian)`} />
          <InfoRow k="Tutup buku" v={a.history.length ? `${a.history.length} hari sudah diarsipkan` : "Belum ada hari yang diarsipkan"} />
          <InfoRow k="Data dimulai"
            v={`${new Date(sync.genesis.at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} ${jam(sync.genesis.at)} · ${sync.genesis.seed ? "dengan data contoh" : "tanpa data contoh"}`} />
        </div>
        {sync.storageError && (
          <p className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
            {sync.storageError}
          </p>
        )}

        {confirmReset === null ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmReset(true)}
              className="min-h-[46px] rounded-xl border border-line bg-ink-2 px-3 text-[13px] text-cream">
              Reset dengan data contoh
            </button>
            <button onClick={() => setConfirmReset(false)}
              className="min-h-[46px] rounded-xl border border-line bg-ink-2 px-3 text-[13px] text-cream">
              Mulai kosong
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
            <p className="text-[13px] leading-snug text-red-200">
              Yakin? Semua transaksi dihapus di semua tab perangkat ini
              {confirmReset ? ", lalu diisi ulang dengan data contoh" : ""}.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="brick" onClick={() => { resetData(confirmReset); setConfirmReset(null); }}>
                Ya, reset
              </Button>
              <button onClick={() => setConfirmReset(null)} className="min-h-[48px] text-sm text-dim">Batal</button>
            </div>
          </div>
        )}
      </section>
      </>)}
          </>)}
        </div>
      </div>
    </div>
  );
}

/* ═════════════ Akun staf (bisa lebih dari satu superadmin) ═════════════ */

/** Urutan daftar staf: pengurus kedua venue dulu, lalu SPL, lalu Smokehouse. */
const urutStaf = (list: Employee[]) =>
  [...list].sort((x, y) => (x.venue ?? "").localeCompare(y.venue ?? "") || x.name.localeCompare(y.name));

function AkunStaf() {
  const venueAktif = useVenueAktif();
  const { a, dispatchA, peek, sync } = useAdmin();
  // Mode server: PIN juga harus terdaftar di server supaya berlaku di perangkat lain.
  const store = venueStore() as ReturnType<typeof venueStore> & {
    simpanPinStaf?: (e: { id: string; name: string; role: string; pin?: string; active: boolean; nip?: string; venue?: string }) => Promise<{ alasan: string | null; nip?: string }>;
    daftarNip?: () => Promise<Record<string, { nip: string | null; terkunci: boolean }>>;
    hapusPinStaf?: (id: string) => Promise<string | null>;
    daftarStafServer?: () => Promise<{ id: string; nama: string; peran: string; aktif: boolean }[]>;
    tautkanEmail?: (staffId: string, email: string) => Promise<string | null>;
    daftarGmail?: () => Promise<Record<string, boolean>>;
  };
  const [buka, setBuka] = useState(false);
  const [form, setForm] = useState<{ id: string; name: string; pin: string; nip: string; role: Role; venue?: Venue }>({
    id: "", name: "", pin: "", nip: "", role: "kru_kasir", venue: "spl",
  });
  /** NIP dan status kunci menurut server. Akun lama hanya punya NIP di sana. */
  const [dataNip, setDataNip] = useState<Record<string, { nip: string | null; terkunci: boolean }>>({});
  const muatNip = () => { void store.daftarNip?.().then(setDataNip); };
  /**
   * AKUN SERVER YANG TIDAK DIKENAL MESIN. Server mencatat pelaku tiap kejadian
   * dengan id di tabel stafnya; kalau id itu tidak ada di daftar staf aplikasi,
   * semua aksinya ditolak saat jejak diputar ulang (penyebab "tambah meja" dan
   * "ganti nama meja" hilang, 14 Nov 2026). Tombol "Catat" menyalinnya ke sini.
   */
  const [stafServer, setStafServer] = useState<{ id: string; nama: string; peran: string; aktif: boolean }[]>([]);
  const muatServer = () => { void store.daftarStafServer?.().then(setStafServer); };
  const belumTercatat = stafServer.filter((x) => x.aktif && !a.employees.some((e) => e.id === x.id)
    && (ROLES as string[]).includes(x.peran));
  /** Akun yang PIN-nya sedang diatur ulang. */
  const [ulangPin, setUlangPin] = useState<{ id: string; pin: string } | null>(null);
  const [banyak, setBanyak] = useState(false);
  /**
   * Simpanan ke server dikirim satu per satu. Kalau dikirim bersamaan, dua
   * akun baru bisa mendapat nomor NIP yang sama dari server.
   */
  const rantai = useRef<Promise<unknown>>(Promise.resolve());
  function antre<T>(kerja: () => Promise<T> | undefined): Promise<T | undefined> {
    const hasil = rantai.current.then(() => kerja());
    rantai.current = hasil.catch(() => undefined);
    return hasil;
  }
  const [pesan, setPesan] = useState<string | null>(null);
  /** Siapa yang Gmail-nya sudah terbukti lewat masuk Google. */
  const [terbukti, setTerbukti] = useState<Record<string, boolean>>({});

  useEffect(() => { void store.daftarGmail?.().then(setTerbukti); muatNip(); muatServer(); }, [store]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (t: string) => { setPesan(t); setTimeout(() => setPesan(null), 4000); };
  const superaktif = a.employees.filter((e) => e.active && e.role === "superadmin").length;

  /** `pinBaru` hanya diisi kalau PIN memang diganti; suntingan lain tidak menyentuh PIN. */
  /** Ganti PIN satu akun. Di server PIN tidak menyentuh jejak. */
  function simpanPin(e: Employee, pin: string) {
    if (sync.mode !== "server") return simpan({ ...e, pin }, pin);
    void antre(() => store.simpanPinStaf?.({
      id: e.id, name: e.name, role: e.role, active: e.active, pin,
      ...(dataNip[e.id]?.nip ?? e.nip ? { nip: (dataNip[e.id]?.nip ?? e.nip)! } : {}),
      ...(e.venue ? { venue: e.venue } : {}),
    })).then((h) => {
      flash(h?.alasan ? `PIN belum tersimpan: ${h.alasan}` : `PIN ${e.name} sudah diganti.`);
      muatNip();
    });
    return true;
  }

  function simpan(emp: Employee, pinBaru?: string) {
    /**
     * Ditolak = daftarnya TIDAK BERGERAK sama sekali.
     *
     * Sebelumnya penolakan hanya dikenali kalau JUMLAH akun tidak bertambah,
     * jadi setiap penolakan saat MENYUNTING akun yang sudah ada (ganti peran,
     * ganti venue, nonaktifkan superadmin terakhir) lewat tanpa suara: pesan
     * yang muncul justru "tersimpan", padahal mesin menolaknya.
     */
    // Dibaca dari mesin, bukan dari layar: saat beberapa akun dibuat beruntun,
    // daftar di layar belum sempat diperbarui di antara dua simpanan.
    const kini = peek().employees;
    const sebelum = JSON.stringify(kini);
    const lama = new Set(kini.map((x) => x.id));
    const server = sync.mode === "server";
    // Di server, PIN hanya disimpan teracak di tabel staf, tidak di jejak yang bisa dibaca.
    const nipAuto = !emp.nip && !server
      ? `SPL${String(Math.max(0, ...kini.map((x) => Number(/^SPL(\d+)$/.exec(x.nip ?? "")?.[1] ?? 0))) + 1).padStart(3, "0")}`
      : emp.nip;
    dispatchA({ t: "saveEmployee", emp: { ...emp, pin: server ? (lama.has(emp.id) ? emp.pin : "") : (pinBaru ?? emp.pin), ...(nipAuto ? { nip: nipAuto } : {}) } });
    const sesudah = peek().employees;
    if (JSON.stringify(sesudah) === sebelum) {
      flash("Ditolak — NIP harus unik, PIN harus 4 angka, email sah & unik, dan harus selalu tersisa satu superadmin aktif yang mengurus kedua venue.");
      return false;
    }
    const tersimpan = sesudah.find((x) => (emp.id ? x.id === emp.id : !lama.has(x.id)))!;
    const hasilId = tersimpan.id;
    if (server) {
      void antre(() => store.simpanPinStaf?.({
        id: tersimpan.id, name: tersimpan.name, role: tersimpan.role, active: tersimpan.active,
        ...(pinBaru ? { pin: pinBaru } : {}),
        ...(tersimpan.nip ? { nip: tersimpan.nip } : {}),
        ...(tersimpan.venue ? { venue: tersimpan.venue } : {}),
      })).then(async (h) => {
        if (!h) return;
        if (h.alasan) { flash(`Tersimpan di perangkat, TAPI server menolak: ${h.alasan}`); return; }
        if (h.nip && h.nip !== tersimpan.nip) dispatchA({ t: "saveEmployee", emp: { ...tersimpan, nip: h.nip } });
        if (h.nip && !lama.has(tersimpan.id)) flash(`Akun ${tersimpan.name} dibuat. NIP: ${h.nip}`);
        muatNip();
        // Gmail hanya dikirim kalau kolomnya memang disentuh: ganti peran atau venue
        // tidak boleh menghapus Gmail yang sudah tertaut di server.
        if (emp.email === undefined) return;
        const e2 = await store.tautkanEmail?.(tersimpan.id, emp.email);
        if (e2) flash(`Akun tersimpan, tapi email ditolak server: ${e2}`);
      });
    }
    return hasilId;
  }

  return (
    <section>
      <h2 id="atur-akun" className="scroll-mt-28 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
        Akun staf · {a.employees.length} ({superaktif} superadmin aktif)
      </h2>
      {belumTercatat.length > 0 && (
        <div role="alert" className="mb-2 rounded-xl border border-red-500/50 bg-red-500/10 p-3">
          <p className="text-[12px] leading-snug text-red-300">
            <span className="font-semibold">{belumTercatat.length} akun ada di server tapi belum tercatat di aplikasi.</span>{" "}
            Perubahan dari akun ini (mis. tambah meja) ditolak server sampai dicatat.
          </p>
          <div className="mt-2 space-y-1.5">
            {belumTercatat.map((x) => (
              <div key={x.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-cream">
                  {x.nama} <span className="text-[11px] text-dim">· {ROLE_LABEL[x.peran as Role] ?? x.peran}</span>
                </span>
                <button
                  onClick={() => {
                    dispatchA({ t: "saveEmployee", emp: { id: x.id, name: x.nama, pin: "", role: x.peran as Role, active: true } });
                    flash(peek().employees.some((e) => e.id === x.id)
                      ? `Akun ${x.nama} tercatat. Atur venue-nya kalau perlu.`
                      : `Akun ${x.nama} tidak bisa dicatat — periksa nama/NIP.`);
                  }}
                  className="min-h-[36px] shrink-0 rounded-lg bg-amber px-3 text-[12px] font-bold text-ink">
                  Catat
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
        {urutStaf(a.employees).map((e, i, arr) => (
          <Fragment key={e.id}>
            {/* Kepala kelompok: pemilik meminta SPL Sport dan Smokehouse
                diperlakukan seperti dua perusahaan, jadi daftarnya pun dibaca
                sebagai dua daftar — bukan satu daftar yang venuenya harus
                dicari satu-satu di kolom paling kanan. */}
            {(i === 0 || (arr[i - 1].venue ?? "") !== (e.venue ?? "")) && (
              <div className="bg-ink px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
                {e.venue ? VENUE_LABEL[e.venue] : "Mengurus kedua venue"}
              </div>
            )}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-cream">
                {e.name}
                {!e.active && <span className="ml-2 text-[11px] text-dim">(nonaktif)</span>}
              </div>
              <div className="text-[11px] text-dim">
                NIP {dataNip[e.id]?.nip ?? e.nip ?? "belum ada"} · {ROLE_LABEL[e.role]} · {e.venue ? VENUE_LABEL[e.venue] : "kedua venue"}
              </div>
              {/* Kasir & waiter bekerja di SATU venue (pemilik 14 Nov 2026). */}
              {!e.venue && PERAN_SATU_VENUE.includes(e.role) && (
                <p className="text-[11px] font-semibold text-red-300">
                  {ROLE_LABEL[e.role]} harus memilih SPL Sport atau Smokehouse — sekarang bisa membuka shift di kedua venue.
                </p>
              )}
              {dataNip[e.id]?.terkunci && (
                <p className="text-[11px] text-amber">Akun terkunci karena PIN salah. Atur ulang PIN untuk membukanya.</p>
              )}
              {ulangPin?.id === e.id ? (
                <div className="mt-1 flex items-center gap-1.5">
                  <input value={ulangPin.pin} inputMode="numeric" aria-label={`PIN baru ${e.name}`} placeholder="PIN baru 4 angka"
                    onChange={(ev) => setUlangPin({ id: e.id, pin: ev.target.value.replace(/\D/g, "").slice(0, 4) })}
                    className="min-h-[34px] w-32 rounded-lg border border-line bg-ink px-2 text-[12px] tracking-widest text-cream placeholder:tracking-normal placeholder:text-dim" />
                  <button disabled={ulangPin.pin.length !== 4}
                    onClick={() => { const nilai = ulangPin.pin; if (simpanPin(e, nilai)) setUlangPin(null); }}
                    className="min-h-[34px] rounded-lg bg-amber px-2.5 text-[11px] font-bold text-ink disabled:opacity-40">Simpan</button>
                  <button onClick={() => setUlangPin(null)} className="min-h-[34px] px-1 text-[11px] text-dim">Batal</button>
                </div>
              ) : (
                <button onClick={() => setUlangPin({ id: e.id, pin: "" })}
                  className="mt-0.5 min-h-[28px] text-[11px] text-amber underline underline-offset-2">Atur ulang PIN</button>
              )}
              <input
                defaultValue={e.email ?? ""} type="email" inputMode="email"
                placeholder="Gmail staf ini"
                onBlur={(ev) => {
                  const nilai = ev.target.value.trim().toLowerCase();
                  if (nilai === (e.email ?? "")) return;
                  simpan({ ...e, email: nilai });
                }}
                className="mt-1 min-h-[34px] w-full rounded-lg border border-line bg-ink px-2 text-[11px] text-cream placeholder:text-dim"
              />
              <div className={`mt-1 text-[10px] ${terbukti[e.id] ? "text-emerald-400" : "text-dim"}`}>
                {terbukti[e.id] ? "Gmail terverifikasi" : e.email ? "Gmail terdaftar, belum pernah diverifikasi" : "Belum ada Gmail: Lupa PIN belum bisa dipakai"}
              </div>
            </div>
            <select
              value={e.role} aria-label={`Peran ${e.name}`}
              onChange={(ev) => {
                const role = ev.target.value as Role;
                // Kasir/waiter tanpa venue: langsung diikat ke venue yang sedang dibuka.
                simpan(!e.venue && PERAN_SATU_VENUE.includes(role) ? { ...e, role, venue: venueAktif } : { ...e, role });
              }}
              className="min-h-[36px] shrink-0 rounded-lg border border-line bg-ink px-2 text-[11px] text-cream">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              {e.role === "karyawan" && <option value="karyawan">{ROLE_LABEL.karyawan}</option>}
            </select>
            <select
              value={e.venue ?? ""} aria-label={`Venue ${e.name}`}
              onChange={(ev) => {
                const v = ev.target.value;
                const { venue: _v, ...tanpa } = e;
                simpan(v ? { ...e, venue: v as Venue } : tanpa);
              }}
              className="min-h-[36px] shrink-0 rounded-lg border border-line bg-ink px-2 text-[11px] text-cream">
              <option value="spl">{VENUE_LABEL.spl}</option>
              <option value="smh">{VENUE_LABEL.smh}</option>
              {(!PERAN_SATU_VENUE.includes(e.role) || !e.venue) && <option value="">Keduanya</option>}
            </select>
            <button
              onClick={() => simpan({ ...e, active: !e.active })}
              className="min-h-[36px] shrink-0 rounded-lg border border-line px-2.5 text-[11px] text-mute">
              {e.active ? "nonaktifkan" : "aktifkan"}
            </button>
            <button
              onClick={() => {
                if (!confirm(`Hapus akun ${e.name}? Jejak tindakannya di laporan tetap tersimpan.`)) return;
                dispatchA({ t: "removeEmployee", id: e.id });
                if (peek().employees.some((x) => x.id === e.id)) {
                  flash("Tidak bisa dihapus — shift orang ini masih buka, atau ini superadmin terakhir yang mengurus kedua venue.");
                } else {
                  if (sync.mode === "server") void store.hapusPinStaf?.(e.id);
                  flash(`Akun ${e.name} dihapus.`);
                }
              }}
              className="min-h-[36px] shrink-0 rounded-lg border border-line px-2.5 text-[11px] text-red-300">
              hapus
            </button>
          </div>
          </Fragment>
        ))}
      </div>

      {pesan && <p role="status" className="mt-2 text-[12px] text-amber">{pesan}</p>}

      {buka ? (
        <div className="mt-2 space-y-2 rounded-xl border border-line bg-ink-2 p-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nama staf"
            className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-sm text-cream placeholder:text-dim" />
          <input value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value.toUpperCase().slice(0, 12) })}
            placeholder="NIP (kosongkan untuk nomor otomatis)"
            className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-sm text-cream placeholder:text-dim" />
          <input value={form.pin} inputMode="numeric"
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            placeholder="PIN 4 angka"
            className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-sm tracking-[0.3em] text-cream placeholder:tracking-normal placeholder:text-dim" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROLES.map((r) => (
              <button key={r} aria-pressed={form.role === r}
                onClick={() => setForm({ ...form, role: r, ...(PERAN_SATU_VENUE.includes(r) && !form.venue ? { venue: venueAktif } : {}) })}
                className={`min-h-[44px] rounded-lg border px-1 text-[12px] leading-tight ${
                  form.role === r ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
                }`}>{ROLE_LABEL[r]}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([["spl", VENUE_LABEL.spl], ["smh", VENUE_LABEL.smh], ["", "Keduanya"]] as const).map(([v, label]) => (
              <button key={v || "dua"} disabled={!v && PERAN_SATU_VENUE.includes(form.role)}
                onClick={() => setForm({ ...form, venue: (v || undefined) as Venue | undefined })}
                aria-pressed={(form.venue ?? "") === v}
                className={`min-h-[44px] rounded-lg border px-1 text-[12px] leading-tight disabled:opacity-35 ${
                  (form.venue ?? "") === v ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
                }`}>{label}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button disabled={!form.name.trim() || form.pin.length !== 4}
              onClick={() => {
                if (simpan({
                  id: "", name: form.name.trim(), pin: form.pin, role: form.role, active: true,
                  ...(form.nip.trim() ? { nip: form.nip.trim() } : {}),
                  ...(form.venue ? { venue: form.venue } : {}),
                }, form.pin)) {
                  setForm({ id: "", name: "", pin: "", nip: "", role: "kru_kasir", venue: "spl" });
                  setBuka(false);
                }
              }}>Simpan akun</Button>
            <button onClick={() => setBuka(false)} className="min-h-[44px] px-3 text-sm text-dim">Batal</button>
          </div>
        </div>
      ) : banyak ? (
        <div className="mt-2">
          <TambahBanyakAkun venueAwal={venueAktif} simpan={(emp, pin) => simpan(emp, pin)}
            nipDari={(id) => dataNip[id]?.nip ?? a.employees.find((x) => x.id === id)?.nip}
            onTutup={() => setBanyak(false)} />
        </div>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button onClick={() => setBuka(true)}
            className="min-h-[44px] w-full rounded-xl border border-line bg-ink-2 text-[13px] text-cream">
            + Tambah akun staf / superadmin
          </button>
          <button onClick={() => setBanyak(true)}
            className="min-h-[44px] w-full rounded-xl border border-line bg-ink-2 text-[13px] text-cream">
            + Tambah banyak akun dari daftar
          </button>
        </div>
      )}

      {a.me?.role === "superadmin" && sync.mode === "server" && !buka && !banyak && (
        <PinMassal
          karyawan={a.employees.filter((e) => e.active && e.id !== a.me?.id)}
          simpan={(e, pin) => antre(() => store.simpanPinStaf?.({
            id: e.id, name: e.name, role: e.role, active: e.active, pin,
            ...((dataNip[e.id]?.nip ?? e.nip) ? { nip: (dataNip[e.id]?.nip ?? e.nip)! } : {}),
            ...(e.venue ? { venue: e.venue } : {}),
          }))}
          onSelesai={muatNip}
        />
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-dim">
        Boleh ada lebih dari satu superadmin — pemilik, manajer, atau siapa pun yang berhak melihat
        laporan uang dan menyetujui void. Setiap tindakan tetap tercatat atas nama pemiliknya masing-masing,
        jadi jangan berbagi satu PIN berdua.
        <br /><br />
        <span className="text-mute">Karyawan masuk dengan NIP dan PIN.</span> Isi Gmail orangnya di atas supaya
        dia bisa memakai Lupa PIN sendiri. Tanpa Gmail, PIN hanya bisa diatur ulang dari sini.
        <br /><br />
        <span className="text-mute">PIN</span> tetap dipakai untuk ganti kasir antar shift, karena memilih akun
        Google tiap pergantian terlalu lambat saat ramai. Aplikasi Windows juga masuk dengan PIN.
      </p>
    </section>
  );
}

function InfoRow({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <span className="shrink-0 text-[12px] text-dim">{k}</span>
      <span className={`text-right text-[12px] ${bad ? "text-red-300" : "text-cream"}`}>{v}</span>
    </div>
  );
}

/** Satu kolom tarif. `kosongBoleh` = boleh dikosongkan (tarif weekend → ikut weekday). */
function InputTarif({ label, value, onChange, kosongBoleh, placeholder }: {
  label: string; value?: number; onChange: (v: number | undefined) => void; kosongBoleh?: boolean; placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <span className="text-[11px] text-dim">Rp</span>
      <input
        type="number" inputMode="numeric" min={0} step={1000} value={value ? value : kosongBoleh ? "" : 0}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" && kosongBoleh ? undefined : Math.max(0, Number(e.target.value) || 0))}
        aria-label={`Tarif ${label}`}
        className="w-[88px] rounded-lg border border-line bg-ink px-2 py-1.5 text-right font-serif text-[15px] tabular-nums text-cream placeholder:text-dim/60 focus:border-amber focus:outline-none" />
    </div>
  );
}

function RateField({
  label, hint, value, onChange,
}: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-ink-2 p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-cream">{label}</div>
        <div className="text-[11px] text-dim">{hint}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] text-dim">Rp</span>
        <input
          type="number" inputMode="numeric" min={0} step={1000} value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          aria-label={`Tarif ${label}`}
          className="w-[104px] rounded-lg border border-line bg-ink px-2.5 py-2 text-right
            font-serif text-base tabular-nums text-cream focus:border-amber focus:outline-none"
        />
      </div>
    </div>
  );
}

function PreviewRow({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={accent ? "text-amber/90" : "text-mute"}>{label}</span>
      <span className="font-serif tabular-nums text-cream">{rupiah(value)}</span>
    </div>
  );
}

/** Nama kelas untuk layar lain yang mengimpor dari sini. */
export const kelasLabel = CLASS_LABEL;
