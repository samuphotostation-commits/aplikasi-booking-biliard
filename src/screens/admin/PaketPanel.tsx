/*
 * PAKET — tambah, ubah, nonaktifkan, hapus (panel Atur).
 *
 * Permintaan pemilik 14 Nov 2026:
 *   - Paket SPL ada dua jenis: Paket Regular (meja reguler) dan Paket VIP
 *     (meja VIP), harganya diatur sendiri-sendiri.
 *   - Tiap paket punya harga WEEKDAY dan WEEKEND, dan bonusnya (minuman / isi)
 *     juga boleh berbeda.
 *   - Hari aktif dipilih bebas, jam aktif "dari jam … sampai jam …".
 *   - Paket bisa diubah, dinonaktifkan, dan dihapus.
 *
 * Semua aturan itu DITEGAKKAN MESIN (`savePaket`, `paketProblem`,
 * `hargaPaket` di engine.ts) — formulir ini hanya mengisinya.
 *
 * Jam ditulis sebagai JAM DINDING (11.00 … 02.00) lewat pilihan, bukan
 * diketik: dulu isian "Mulai terakhir (jam)" diketik angka, dan "3" (maksud
 * 03.00) ditolak mesin tanpa penjelasan karena mesin menghitung 01.00 = 25.
 */
import { useState } from "react";
import {
  useAdmin, priceOf, semuaItem, itemOf, OPEN_IDX, CLOSE_IDX,
  kelasPaket, jamMulaiPaket, jamSelesaiPaket, mulaiTerakhirPaket, hariWeekendPaket, jamTeks,
} from "../../lib/adminStore";
import { HARI_WEEKEND_BAWAAN, VENUE_LABEL, type Paket, type PaketIsi, type Venue } from "../../data/venue";
import { rupiah } from "../../lib/core";

/** Urutan tampil Senin dulu; nilainya tetap 0 = Minggu … 6 = Sabtu. */
const HARI_URUT = [1, 2, 3, 4, 5, 6, 0];
const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HARI_PANJANG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "Setiap hari", "Senin–Jumat", "Sabtu, Minggu", … */
export function teksHari(hari: number[] | undefined): string {
  if (!hari || hari.length >= 7) return "Setiap hari";
  const urut = HARI_URUT.filter((d) => hari.includes(d));
  // Rangkaian berurutan (menurut urutan Senin dulu) ditulis "A–B".
  const posisi = urut.map((d) => HARI_URUT.indexOf(d));
  const runtut = posisi.every((p, i) => i === 0 || p === posisi[i - 1] + 1);
  if (runtut && urut.length >= 3) return `${HARI_PANJANG[urut[0]]}–${HARI_PANJANG[urut[urut.length - 1]]}`;
  return urut.map((d) => HARI_PANJANG[d]).join(", ");
}

type Isi = Record<string, number>;
type Form = {
  id?: string; venue: Venue; name: string; kelas: "regular" | "vip";
  hours: string; jamMulai: number; jamSelesai: number; hari: number[];
  price: string; freeDrinks: string; isi: Isi;
  bedaWeekend: boolean; hariWeekend: number[];
  priceW: string; freeDrinksW: string; isiW: Isi;
};

const keIsi = (xs: PaketIsi[] | undefined): Isi => Object.fromEntries((xs ?? []).map((x) => [x.itemId, x.qty]));
const dariIsi = (isi: Isi): PaketIsi[] =>
  Object.entries(isi).filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty }));
const angka = (x: string) => Math.round(Number(x) || 0);
const SEMUA_HARI = [0, 1, 2, 3, 4, 5, 6];

function formBaru(venue: Venue): Form {
  return {
    venue, name: "", kelas: "regular",
    hours: venue === "smh" ? "0" : "2", jamMulai: OPEN_IDX, jamSelesai: venue === "smh" ? CLOSE_IDX : 18,
    hari: SEMUA_HARI, price: "", freeDrinks: "0", isi: {},
    bedaWeekend: false, hariWeekend: HARI_WEEKEND_BAWAAN, priceW: "", freeDrinksW: "0", isiW: {},
  };
}

function formDari(pk: Paket): Form {
  return {
    id: pk.id, venue: pk.venue ?? "spl", name: pk.name, kelas: kelasPaket(pk),
    hours: String(pk.hours), jamMulai: jamMulaiPaket(pk), jamSelesai: jamSelesaiPaket(pk),
    hari: pk.hari ?? SEMUA_HARI, price: String(pk.price), freeDrinks: String(pk.freeDrinks), isi: keIsi(pk.isi),
    bedaWeekend: !!pk.weekend, hariWeekend: hariWeekendPaket(pk),
    priceW: String(pk.weekend?.price ?? pk.price), freeDrinksW: String(pk.weekend?.freeDrinks ?? pk.freeDrinks),
    isiW: keIsi(pk.weekend ? pk.weekend.isi ?? pk.isi : pk.isi),
  };
}

const kelasInput = "min-h-[42px] w-full rounded-lg border border-line bg-ink px-2 text-[13px] text-cream focus:border-amber focus:outline-none";

/** Deretan tombol hari Sen … Min. */
function PilihHari({ nilai, onChange, label }: { nilai: number[]; onChange: (h: number[]) => void; label: string }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] text-dim">{label}</span>
      <div className="grid grid-cols-7 gap-1">
        {HARI_URUT.map((d) => {
          const on = nilai.includes(d);
          return (
            <button key={d} type="button" aria-pressed={on}
              onClick={() => onChange(on ? nilai.filter((x) => x !== d) : [...nilai, d])}
              className={`min-h-[38px] rounded-lg border text-[12px] font-semibold ${
                on ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-dim"}`}>
              {HARI_PENDEK[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Daftar barang yang SUDAH TERMASUK harga paket. */
function IsiEditor({ judul, isi, onChange }: { judul: string; isi: Isi; onChange: (x: Isi) => void }) {
  const { a } = useAdmin();
  const [cari, setCari] = useState("");
  const ubah = (id: string, d: number) =>
    onChange({ ...isi, [id]: Math.max(0, Math.min(20, (isi[id] ?? 0) + d)) });
  const ada = Object.entries(isi).filter(([, q]) => q > 0);
  return (
    <div className="rounded-lg border border-line bg-ink p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
          {judul} · {ada.length} barang
        </span>
        <span className="text-[11px] text-dim">
          nilai normal {rupiah(ada.reduce((n, [id, q]) => n + priceOf(a, id) * q, 0))}
        </span>
      </div>
      {ada.length > 0 && (
        <ul className="mt-1.5 divide-y divide-line">
          {ada.map(([id, q]) => (
            <li key={id} className="flex items-center gap-2 py-1 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-cream">{itemOf(a, id)?.name ?? id}</span>
              <button type="button" onClick={() => ubah(id, -1)} className="h-7 w-7 rounded border border-line text-mute">−</button>
              <span className="w-5 text-center tabular-nums text-cream">{q}</span>
              <button type="button" onClick={() => ubah(id, 1)} className="h-7 w-7 rounded border border-line text-mute">+</button>
            </li>
          ))}
        </ul>
      )}
      <input value={cari} onChange={(e) => setCari(e.target.value)}
        placeholder="Cari barang untuk ditambahkan (mis. Aqua, Ice Tea)…"
        className="mt-1.5 min-h-[38px] w-full rounded-lg border border-line bg-ink-2 px-3 text-[12px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
      {cari.trim() && (
        <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
          {semuaItem(a)
            .filter((it) => it.name.toLowerCase().includes(cari.trim().toLowerCase()))
            .slice(0, 20)
            .map((it) => (
              <button key={it.id} type="button" onClick={() => { ubah(it.id, 1); setCari(""); }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-ink-2">
                <span className="min-w-0 flex-1 truncate text-cream">{it.name}</span>
                <span className="shrink-0 tabular-nums text-dim">{rupiah(priceOf(a, it.id))}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function Angka({ label, nilai, onChange }: { label: string; nilai: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-dim">{label}</span>
      <input value={nilai} inputMode="numeric"
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
        className={`${kelasInput} text-right tabular-nums`} />
    </label>
  );
}

export default function PaketPanel({ venue }: { venue: Venue }) {
  const { a, dispatchA, peek } = useAdmin();
  const [form, setForm] = useState<Form | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [yakinHapus, setYakinHapus] = useState<string | null>(null);
  const paketVenue = (a.packages ?? []).filter((pk) => (pk.venue ?? "spl") === venue && !pk.dihapus);
  const nama = (id: string) => itemOf(a, id)?.name ?? id;
  const isiTeks = (xs: PaketIsi[] | undefined) => (xs ?? []).map((x) => `${x.qty}× ${nama(x.itemId)}`).join(", ");

  function simpan(f: Form) {
    const spl = f.venue === "spl";
    const jamMain = angka(f.hours);
    // Pesan yang menjelaskan KENAPA — mesin hanya bilang ya/tidak.
    if (!f.name.trim()) return setPesan("Nama paket belum diisi.");
    if (!f.price) return setPesan("Harga weekday belum diisi.");
    if (spl && !(jamMain >= 1 && jamMain <= 6)) return setPesan("Durasi paket SPL 1–6 jam.");
    if (!f.hari.length) return setPesan("Pilih minimal satu hari aktif.");
    if (spl && f.jamSelesai - f.jamMulai < jamMain) {
      return setPesan(`Rentang ${jamTeks(f.jamMulai)}–${jamTeks(f.jamSelesai)} lebih pendek dari durasi ${jamMain} jam.`);
    }
    if (f.bedaWeekend && !f.hariWeekend.length) return setPesan("Pilih hari yang memakai harga weekend.");
    if (f.bedaWeekend && !f.priceW) return setPesan("Harga weekend belum diisi.");
    const sebelum = peek().packages;
    dispatchA({ t: "savePaket", paket: {
      id: f.id, name: f.name, venue: f.venue,
      price: angka(f.price), hours: spl ? jamMain : 0, freeDrinks: angka(f.freeDrinks), isi: dariIsi(f.isi),
      ...(spl ? { kelas: f.kelas } : {}),
      hari: f.hari,
      jamMulai: spl ? f.jamMulai : OPEN_IDX, jamSelesai: spl ? f.jamSelesai : CLOSE_IDX,
      // Tetap dikirim supaya pemeriksa bentuk versi lama (server yang belum
      // diperbarui) tidak membuang kejadiannya. Mesin baru menurunkannya sendiri.
      lastStartHour: (spl ? f.jamSelesai : CLOSE_IDX) - Math.max(spl ? jamMain : 0, 1),
      hariWeekend: f.hariWeekend,
      weekend: f.bedaWeekend
        ? { price: angka(f.priceW), freeDrinks: angka(f.freeDrinksW), isi: dariIsi(f.isiW) }
        : null,
    } });
    if (peek().packages === sebelum) {
      return setPesan("Paket ditolak mesin — cek harga, jumlah minuman (0–20), dan isi paket.");
    }
    setPesan(null);
    setForm(null);
  }

  const set = (p: Partial<Form>) => setForm((f) => f && { ...f, ...p });
  const pilihJam = (dari: number, sampai: number) =>
    Array.from({ length: sampai - dari + 1 }, (_, i) => dari + i);

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">
        Paket {VENUE_LABEL[venue]} · {paketVenue.filter((pk) => pk.aktif !== false).length} aktif
      </h2>
      <p className="mb-2 text-[11px] leading-relaxed text-dim">
        {venue === "spl" ? (<>
          Paket SPL Sport <span className="text-cream">menggantikan tarif per jam</span> dengan harga
          blok. Paket yang aktif langsung muncul di layar buka meja kasir dan di booking online tamu,
          dengan harga yang <span className="text-cream">otomatis</span> mengikuti hari main (weekday / weekend).
        </>) : (<>
          Paket Smokehouse <span className="text-cream">tidak punya jam main</span> — isinya makanan
          &amp; minuman, dijual seperti satu barang di bill meja lewat layar pesan kasir.
        </>)}
      </p>

      {paketVenue.length === 0 && (
        <p className="rounded-xl border border-line bg-ink-2 px-4 py-5 text-center text-[13px] text-dim">
          Belum ada paket {VENUE_LABEL[venue]}.
        </p>
      )}

      <div className="space-y-2">
        {paketVenue.map((pk) => {
          const mati = pk.aktif === false;
          return (
            <div key={pk.id} className={`rounded-xl border p-3.5 ${mati ? "border-line-2 bg-ink-3" : "border-line bg-ink-2"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-script text-xl leading-none ${mati ? "text-dim line-through" : "text-amber"}`}>{pk.name}</span>
                <span className="text-right font-serif text-[15px] font-bold leading-tight text-cream">
                  {rupiah(pk.price)}{pk.weekend && <span className="block text-[12px] font-normal text-mute">weekend {rupiah(pk.weekend.price)}</span>}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-brick-lit">
                {VENUE_LABEL[pk.venue ?? "spl"]}
                {pk.hours > 0 && ` · meja ${kelasPaket(pk) === "vip" ? "VIP" : "reguler"}`}
                {mati && " · nonaktif"}
              </div>
              <ul className="mt-1.5 space-y-0.5 text-[12px] text-mute">
                <li>• {teksHari(pk.hari)}
                  {pk.hours > 0 && `, ${jamTeks(jamMulaiPaket(pk))}–${jamTeks(jamSelesaiPaket(pk))} (mulai paling lambat ${jamTeks(mulaiTerakhirPaket(pk))})`}
                </li>
                {pk.hours > 0 && <li>• Main {pk.hours} jam</li>}
                <li>• {pk.weekend ? "Weekday: " : ""}
                  {[pk.freeDrinks > 0 ? `${pk.freeDrinks} minuman bebas pilih` : "", isiTeks(pk.isi)].filter(Boolean).join(", ") || "tanpa bonus"}
                </li>
                {pk.weekend && (
                  <li>• Weekend ({teksHari(hariWeekendPaket(pk))}):{" "}
                    {[pk.weekend.freeDrinks > 0 ? `${pk.weekend.freeDrinks} minuman bebas pilih` : "",
                      isiTeks(pk.weekend.isi ?? pk.isi)].filter(Boolean).join(", ") || "tanpa bonus"}
                  </li>
                )}
              </ul>
              {yakinHapus === pk.id ? (
                <div className="mt-2 rounded-lg border border-brick/50 bg-brick/10 p-2 text-[12px] text-cream">
                  Hapus {pk.name}? Paket hilang dari daftar ini, kasir, dan booking tamu. Bill lama yang
                  memakainya tetap tersimpan.
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => setYakinHapus(null)}
                      className="min-h-[34px] flex-1 rounded-lg border border-line text-[12px] text-mute">Batal</button>
                    <button onClick={() => { dispatchA({ t: "removePaket", id: pk.id, hapus: true }); setYakinHapus(null); }}
                      className="min-h-[34px] flex-1 rounded-lg bg-brick text-[12px] font-bold text-cream">Ya, hapus</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-1.5">
                  <button onClick={() => { setPesan(null); setForm(formDari(pk)); }}
                    className="min-h-[34px] rounded-lg border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber">
                    Ubah
                  </button>
                  {mati ? (
                    <button onClick={() => dispatchA({ t: "aktifkanPaket", id: pk.id })}
                      className="min-h-[34px] rounded-lg border border-amber/50 px-3 text-[12px] text-amber">
                      Aktifkan lagi
                    </button>
                  ) : (
                    <button onClick={() => dispatchA({ t: "removePaket", id: pk.id })}
                      className="min-h-[34px] rounded-lg border border-line px-3 text-[12px] text-dim">
                      Nonaktifkan
                    </button>
                  )}
                  <button onClick={() => setYakinHapus(pk.id)}
                    className="min-h-[34px] rounded-lg border border-line px-3 text-[12px] text-dim hover:border-brick hover:text-brick-lit">
                    Hapus
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!form ? (
        <button onClick={() => { setPesan(null); setForm(formBaru(venue)); }}
          className="mt-2 min-h-[42px] w-full rounded-xl border border-amber/50 bg-amber/10 text-[13px] font-bold text-amber">
          + Tambah paket
        </button>
      ) : (
        <div className="mt-2 space-y-2.5 rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
            {form.id ? "Ubah paket" : "Paket baru"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["spl", "smh"] as Venue[]).map((v) => (
              <button key={v} type="button"
                onClick={() => set({
                  venue: v,
                  // Paket Smokehouse tidak bersewa waktu; jamnya dinolkan
                  // supaya tidak ada paket makanan yang diam-diam mengunci meja.
                  hours: v === "smh" ? "0" : (form.hours === "0" ? "2" : form.hours),
                })}
                aria-pressed={form.venue === v}
                className={`min-h-[42px] rounded-lg border text-[12px] font-semibold ${
                  form.venue === v ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-mute"}`}>
                {VENUE_LABEL[v]}
              </button>
            ))}
          </div>
          <input value={form.name} placeholder={form.venue === "spl" ? "Nama paket (mis. Paket VIP)" : "Nama paket"}
            onChange={(e) => set({ name: e.target.value.slice(0, 40) })}
            className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />

          {form.venue === "spl" && (<>
            <div>
              <span className="mb-1 block text-[11px] text-dim">Jenis paket (meja yang boleh memakai)</span>
              <div className="grid grid-cols-2 gap-2">
                {([["regular", "Paket Regular", "meja reguler"], ["vip", "Paket VIP", "meja VIP saja"]] as const).map(([k, l, ket]) => (
                  <button key={k} type="button" aria-pressed={form.kelas === k} onClick={() => set({ kelas: k })}
                    className={`min-h-[46px] rounded-lg border text-[13px] font-semibold ${
                      form.kelas === k ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-mute"}`}>
                    {l}<div className="text-[10px] font-normal text-dim">{ket}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Angka label="Durasi (jam)" nilai={form.hours} onChange={(v) => set({ hours: v })} />
              <label className="block">
                <span className="mb-1 block text-[11px] text-dim">Berlaku dari jam</span>
                <select value={form.jamMulai} className={kelasInput}
                  onChange={(e) => {
                    const jm = Number(e.target.value);
                    set({ jamMulai: jm, jamSelesai: Math.max(form.jamSelesai, Math.min(CLOSE_IDX, jm + 1)) });
                  }}>
                  {pilihJam(OPEN_IDX, CLOSE_IDX - 1).map((h) => <option key={h} value={h}>{jamTeks(h)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-dim">sampai jam</span>
                <select value={form.jamSelesai} className={kelasInput}
                  onChange={(e) => set({ jamSelesai: Number(e.target.value) })}>
                  {pilihJam(form.jamMulai + 1, CLOSE_IDX).map((h) => <option key={h} value={h}>{jamTeks(h)}</option>)}
                </select>
              </label>
            </div>
            {angka(form.hours) >= 1 && form.jamSelesai - form.jamMulai >= angka(form.hours) && (
              <p className="-mt-1 text-[11px] text-dim">
                Main harus selesai sebelum {jamTeks(form.jamSelesai)}, jadi paket {angka(form.hours)} jam bisa mulai{" "}
                <span className="text-cream">{jamTeks(form.jamMulai)}–{jamTeks(form.jamSelesai - angka(form.hours))}</span>.
              </p>
            )}
          </>)}

          <PilihHari label="Hari aktif" nilai={form.hari} onChange={(h) => set({ hari: h })} />

          {/* ── HARGA WEEKDAY ─────────────────────────────── */}
          <div className="space-y-2 rounded-lg border border-line p-2.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              {form.bedaWeekend ? "Harga weekday" : "Harga"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Angka label="Harga (Rp)" nilai={form.price} onChange={(v) => set({ price: v })} />
              <Angka label="Minuman bebas pilih" nilai={form.freeDrinks} onChange={(v) => set({ freeDrinks: v })} />
            </div>
            <IsiEditor judul="Isi / bonus" isi={form.isi} onChange={(x) => set({ isi: x })} />
          </div>

          {/* ── HARGA WEEKEND ─────────────────────────────── */}
          <label className="flex items-center gap-2 text-[13px] text-cream">
            <input type="checkbox" checked={form.bedaWeekend}
              onChange={(e) => set({
                bedaWeekend: e.target.checked,
                // Mulai dari isian weekday supaya pemilik tinggal mengubah yang beda.
                ...(e.target.checked && !form.priceW ? { priceW: form.price, freeDrinksW: form.freeDrinks, isiW: form.isi } : {}),
              })}
              className="h-5 w-5 accent-amber" />
            Harga / bonus weekend berbeda
          </label>
          {form.bedaWeekend && (
            <div className="space-y-2 rounded-lg border border-amber/40 p-2.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber">Harga weekend</div>
              <PilihHari label="Hari yang memakai harga weekend" nilai={form.hariWeekend}
                onChange={(h) => set({ hariWeekend: h })} />
              <div className="grid grid-cols-2 gap-2">
                <Angka label="Harga (Rp)" nilai={form.priceW} onChange={(v) => set({ priceW: v })} />
                <Angka label="Minuman bebas pilih" nilai={form.freeDrinksW} onChange={(v) => set({ freeDrinksW: v })} />
              </div>
              <IsiEditor judul="Isi / bonus weekend" isi={form.isiW} onChange={(x) => set({ isiW: x })} />
            </div>
          )}

          <p className="text-[11px] leading-snug text-dim">
            {form.venue === "smh"
              ? "Paket Smokehouse dijual langsung ke bill meja makan — tanpa jam main, tanpa mengunci meja."
              : "Ditegakkan mesin: hanya kelas meja yang dipilih, durasi sama persis, hanya di hari & jam aktif. Harga weekday/weekend dipilih otomatis menurut hari main (main lewat tengah malam ikut hari sebelumnya)."}
            {" "}Isi / bonus <span className="text-cream">sudah termasuk</span> harga — masuk bill Rp 0, stoknya
            berkurang dan tiketnya masuk dapur saat paket diserahkan.
          </p>
          {pesan && <p className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">{pesan}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setForm(null); setPesan(null); }}
              className="min-h-[42px] flex-1 rounded-xl border border-line text-[13px] text-mute">Batal</button>
            <button type="button" onClick={() => simpan(form)}
              className="min-h-[42px] flex-[2] rounded-xl bg-amber text-[13px] font-bold text-ink">Simpan</button>
          </div>
        </div>
      )}
    </section>
  );
}
