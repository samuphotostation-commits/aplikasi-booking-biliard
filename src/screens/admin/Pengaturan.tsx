import { Fragment, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "../../components/UI";
import {
  useAdmin, maintenanceBlockers, classOf, paketAktif, mesinEdc, priceOf, semuaItem, itemOf,
  mejaDijual, mejaDipakai, cariMeja,
} from "../../lib/adminStore";
import { venueStore } from "../../lib/venueStore";
import {
  TABLES, SEMUA_MEJA, PAKET_SIANG, CLASS_LABEL, VENUE_LABEL, type TableType, type Venue,
} from "../../data/venue";
import { useVenueAktif } from "../../lib/venueAktif";
import { LINI, LINI_LABEL, persenLini, type Lini } from "../../lib/engine";

/** Apa saja yang masuk tiap lini — ditulis di layar supaya tidak ditebak. */
const KETERANGAN_LINI: Record<Lini, string> = {
  biliar: "sewa meja + barang counter biliar (rokok, botolan)",
  bar: "minuman dari bar",
  resto: "makanan dari dapur",
};
import { ROLES, ROLE_LABEL, type Employee, type Role } from "../../data/staff";
import { rupiah } from "../../lib/core";
import { LayarTamu, PilihPrinter } from "./PilihPrinter";
import { jam } from "./AdminShell";
import QrisPanel from "./QrisPanel";
import {
  suaraNyala, setSuaraNyala, bunyikan, izinNotif, mintaIzinNotif, type IzinNotif,
} from "../../lib/notifikasi";

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
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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

export default function Pengaturan() {
  const { a, dispatchA, byTable, sync, resetData, peek, terbitkanSekarang, allow } = useAdmin();
  const venue = useVenueAktif();
  /** Paket venue yang sedang dibuka saja — dua venue, dua daftar. */
  const paketVenue = (a.packages ?? []).filter((pk) => (pk.venue ?? "spl") === venue);
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
  /** Borang tambah/ubah paket meja. */
  const [paketForm, setPaketForm] = useState<{
    id?: string; name: string; price: string; hours: string;
    freeDrinks: string; lastStartHour: string;
    venue: Venue;
    /** Isi paket: id barang → jumlah. */
    isi: Record<string, number>;
  } | null>(null);
  /** Pencarian barang di editor isi paket. */
  const [cariIsi, setCariIsi] = useState("");

  /** Tambah/kurangi satu barang di isi paket yang sedang disunting. */
  const ubahIsi = (itemId: string, d: number) =>
    setPaketForm((f) => f && ({
      ...f,
      isi: { ...f.isi, [itemId]: Math.max(0, Math.min(20, (f.isi[itemId] ?? 0) + d)) },
    }));
  const [pilihMeja, setPilihMeja] = useState<string | null>(null);

  const same = (x: typeof draft, y: typeof draft) =>
    x.regularDay === y.regularDay && x.regularNight === y.regularNight && x.vip === y.vip && x.vvip === y.vvip;
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
    (Object.keys(draft) as (keyof typeof draft)[]).forEach((k) => {
      if (draft[k] !== a.rates[k]) dispatchA({ t: "setRate", key: k, value: draft[k] });
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

  return (
    <div className="space-y-6 pb-6">
      {/* Printer struk: setelan PERANGKAT, bukan data venue — tiap komputer
          kasir punya printernya sendiri. */}
      <PilihPrinter />

      <LayarTamu />

      <BunyiNotif />

      {allow("ubahTarif") && <MesinEdc />}

      {allow("ubahTarif") && (<>
      {/* ── Tarif ────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Tarif per jam
        </h2>
        <div className="space-y-2">
          <RateField
            label="Reguler siang" hint="11.00 – 18.00"
            value={draft.regularDay}
            onChange={(v) => setDraft({ ...draft, regularDay: v })}
          />
          <RateField
            label="Reguler malam" hint="18.00 – tutup"
            value={draft.regularNight}
            onChange={(v) => setDraft({ ...draft, regularNight: v })}
          />
          <RateField
            label="VIP (bebas asap rokok)" hint={`sepanjang jam · ${hitung("vip")} ruang`}
            value={draft.vip}
            onChange={(v) => setDraft({ ...draft, vip: v })}
          />
          <RateField
            label="VVIP (boleh merokok)" hint={`sepanjang jam · ${hitung("vvip")} ruang`}
            value={draft.vvip}
            onChange={(v) => setDraft({ ...draft, vvip: v })}
          />
        </div>

        {/* Pratinjau — supaya tidak ada kejutan setelah disimpan */}
        <div className="mt-3 rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-[11px] uppercase tracking-wider text-dim">Pratinjau harga sesi</div>
          <div className="mt-1.5 space-y-1 text-[13px]">
            <PreviewRow label="Reguler 2 jam siang" value={draft.regularDay * 2} />
            <PreviewRow label="Reguler 2 jam malam" value={draft.regularNight * 2} />
            <PreviewRow
              label="Reguler 17.00–19.00 (lintas tarif)"
              value={draft.regularDay + draft.regularNight}
              accent
            />
            <PreviewRow label="VIP 3 jam" value={draft.vip * 3} />
            <PreviewRow label="VVIP 3 jam" value={draft.vvip * 3} />
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

      {allow("kelolaPromo") && (<>
      {/* ── Paket ─────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Paket {VENUE_LABEL[venue]} · {paketVenue.filter((pk) => pk.aktif !== false).length} aktif
        </h2>
        <p className="mb-2 text-[11px] leading-relaxed text-dim">
          {venue === "spl" ? (<>
            Paket SPL Sport <span className="text-cream">menggantikan tarif per jam</span> dengan harga
            blok. Paket yang aktif langsung muncul di layar buka meja kasir dan di booking online tamu.
          </>) : (<>
            Paket Smokehouse <span className="text-cream">tidak punya jam main</span> — isinya makanan
            &amp; minuman, dijual seperti satu barang di bill meja lewat layar pesan kasir.
          </>)}{" "}
          Keduanya boleh berisi barang; isinya memotong stok gudang dan masuk tiket dapur saat
          diserahkan. Daftar ini hanya memuat paket {VENUE_LABEL[venue]} — venue sebelah diurus dari
          venue-nya sendiri, lewat tombol di kanan atas.
        </p>

        {paketVenue.length === 0 && (
          <p className="rounded-xl border border-line bg-ink-2 px-4 py-5 text-center text-[13px] text-dim">
            Belum ada paket {VENUE_LABEL[venue]}.
          </p>
        )}

        <div className="space-y-2">
          {paketVenue.map((pk) => (
            <div key={pk.id}
              className={`rounded-xl border p-3.5 ${pk.aktif === false ? "border-line-2 bg-ink-3" : "border-line bg-ink-2"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-script text-xl leading-none ${pk.aktif === false ? "text-dim line-through" : "text-amber"}`}>
                  {pk.name}
                </span>
                <span className="font-serif text-lg font-bold text-cream">{rupiah(pk.price)}</span>
              </div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-brick-lit">
                {VENUE_LABEL[pk.venue ?? "spl"]}
              </div>
              <ul className="mt-1.5 space-y-0.5 text-[12px] text-mute">
                {pk.perks.map((x) => <li key={x}>• {x}</li>)}
                {pk.hours > 0 && <li>• Hanya meja reguler, mulai paling lambat jam {pk.lastStartHour}.00</li>}
              </ul>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => setPaketForm({
                    id: pk.id, name: pk.name, price: String(pk.price), hours: String(pk.hours),
                    freeDrinks: String(pk.freeDrinks), lastStartHour: String(pk.lastStartHour),
                    venue: pk.venue ?? "spl",
                    isi: Object.fromEntries((pk.isi ?? []).map((x) => [x.itemId, x.qty])),
                  })}
                  className="min-h-[34px] rounded-lg border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber">
                  Ubah
                </button>
                {pk.aktif !== false && (a.packages ?? []).length > 0 && (
                  <button onClick={() => dispatchA({ t: "removePaket", id: pk.id })}
                    className="min-h-[34px] rounded-lg border border-line px-3 text-[12px] text-dim">
                    Nonaktifkan
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {!paketForm ? (
          <button
            onClick={() => setPaketForm({
              name: "", price: "", hours: venue === "smh" ? "0" : "2", freeDrinks: "0",
              lastStartHour: "16", venue, isi: {},
            })}
            className="mt-2 min-h-[42px] w-full rounded-xl border border-amber/50 bg-amber/10 text-[13px] font-bold text-amber">
            + Tambah paket
          </button>
        ) : (
          <div className="mt-2 space-y-2 rounded-xl border border-line bg-ink-2 p-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              {paketForm.id ? "Ubah paket" : "Paket baru"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["spl", "smh"] as Venue[]).map((v) => (
                <button key={v}
                  onClick={() => setPaketForm({
                    ...paketForm, venue: v,
                    // Paket Smokehouse tidak bersewa waktu; jamnya dinolkan
                    // supaya tidak ada paket makanan yang diam-diam mengunci meja.
                    hours: v === "smh" ? "0" : (paketForm.hours === "0" ? "2" : paketForm.hours),
                  })}
                  aria-pressed={paketForm.venue === v}
                  className={`min-h-[42px] rounded-lg border text-[12px] font-semibold ${
                    paketForm.venue === v ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-mute"
                  }`}>{VENUE_LABEL[v]}</button>
              ))}
            </div>
            <input value={paketForm.name} placeholder="Nama paket (mis. Paket 2 Jam)"
              onChange={(e) => setPaketForm({ ...paketForm, name: e.target.value.slice(0, 40) })}
              className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            <div className="grid grid-cols-2 gap-2">
              {([
                ["price", "Harga (Rp)"], ["hours", "Durasi (jam)"],
                ["freeDrinks", "Minuman gratis"], ["lastStartHour", "Mulai terakhir (jam)"],
              ] as const).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[11px] text-dim">{label}</span>
                  <input value={paketForm[k]} inputMode="numeric"
                    onChange={(e) => setPaketForm({ ...paketForm, [k]: e.target.value.replace(/[^0-9]/g, "").slice(0, 9) })}
                    className="min-h-[42px] w-full rounded-lg border border-line bg-ink px-2 text-right text-[13px] tabular-nums text-cream focus:border-amber focus:outline-none" />
                </label>
              ))}
            </div>
            {/* ── ISI PAKET ─────────────────────────────────────── */}
            <div className="rounded-lg border border-line bg-ink p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
                  Isi paket · {Object.values(paketForm.isi).filter((n) => n > 0).length} barang
                </span>
                <span className="text-[11px] text-dim">
                  nilai normal {rupiah(Object.entries(paketForm.isi)
                    .reduce((n, [id, q]) => n + priceOf(a, id) * q, 0))}
                </span>
              </div>

              {Object.entries(paketForm.isi).filter(([, q]) => q > 0).length > 0 && (
                <ul className="mt-1.5 divide-y divide-line">
                  {Object.entries(paketForm.isi).filter(([, q]) => q > 0).map(([id, q]) => (
                    <li key={id} className="flex items-center gap-2 py-1 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-cream">{itemOf(a, id)?.name ?? id}</span>
                      <button onClick={() => ubahIsi(id, -1)}
                        className="h-7 w-7 rounded border border-line text-mute">−</button>
                      <span className="w-5 text-center tabular-nums text-cream">{q}</span>
                      <button onClick={() => ubahIsi(id, 1)}
                        className="h-7 w-7 rounded border border-line text-mute">+</button>
                    </li>
                  ))}
                </ul>
              )}

              <input value={cariIsi} onChange={(e) => setCariIsi(e.target.value)}
                placeholder="Cari barang untuk ditambahkan…"
                className="mt-1.5 min-h-[38px] w-full rounded-lg border border-line bg-ink-2 px-3 text-[12px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
              {cariIsi.trim() && (
                <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                  {semuaItem(a)
                    .filter((it) => it.name.toLowerCase().includes(cariIsi.trim().toLowerCase()))
                    .slice(0, 20)
                    .map((it) => (
                      <button key={it.id} onClick={() => { ubahIsi(it.id, 1); setCariIsi(""); }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-ink-2">
                        <span className="min-w-0 flex-1 truncate text-cream">{it.name}</span>
                        <span className="shrink-0 tabular-nums text-dim">{rupiah(priceOf(a, it.id))}</span>
                      </button>
                    ))}
                </div>
              )}
              <p className="mt-1.5 text-[11px] leading-snug text-dim">
                Harga isi <span className="text-cream">sudah termasuk</span> harga paket — barisnya
                masuk bill Rp 0. Yang tidak nol: stoknya berkurang dan tiketnya masuk dapur saat
                paket diserahkan, bukan saat dipesan.
              </p>
            </div>

            <p className="text-[11px] leading-snug text-dim">
              {paketForm.venue === "smh"
                ? "Paket Smokehouse dijual langsung ke bill meja makan — tanpa jam main, tanpa mengunci meja."
                : "Paket SPL menggantikan tarif per jam dengan harga blok. Syaratnya ditegakkan mesin: hanya meja reguler, durasi harus sama persis, dan tidak bisa dipesan setelah jam mulai terakhir."}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPaketForm(null)}
                className="min-h-[42px] flex-1 rounded-xl border border-line text-[13px] text-mute">Batal</button>
              <button
                onClick={() => {
                  const n = (x: string) => Math.round(Number(x) || 0);
                  dispatchA({ t: "savePaket", paket: {
                    id: paketForm.id, name: paketForm.name,
                    price: n(paketForm.price), hours: n(paketForm.hours),
                    freeDrinks: n(paketForm.freeDrinks), lastStartHour: n(paketForm.lastStartHour),
                    venue: paketForm.venue,
                    isi: Object.entries(paketForm.isi)
                      .filter(([, q]) => q > 0).map(([itemId, qty]) => ({ itemId, qty })),
                  } });
                  const tersimpan = (peek().packages ?? []).some((x) =>
                    x.name === paketForm.name.trim() && x.aktif !== false);
                  if (!tersimpan) {
                    setTableNote(paketForm.venue === "smh"
                      ? "Paket ditolak — cek nama, harga, jam mulai 11–25, dan isinya."
                      : "Paket ditolak — cek nama, durasi 1–6 jam, jam mulai 11–25, dan isinya.");
                    return;
                  }
                  setPaketForm(null);
                }}
                className="min-h-[42px] flex-[2] rounded-xl bg-amber text-[13px] font-bold text-ink">Simpan</button>
            </div>
          </div>
        )}
      </section>
      </>)}

      {allow("bukaKunciJam") && (
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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
            Biasanya meja hanya bisa dibuka pukul 11.00–02.00. Nyalakan ini untuk memperagakan
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
      {allow("kelolaMeja") && (<>
      {/* ── Meja biliar: kelas & status ──────────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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
                onClick={() => setPilihMeja(pilihMeja === t.id ? null : t.id)}
                aria-pressed={pilihMeja === t.id}
                className={`min-h-[46px] rounded-lg border text-[13px] font-semibold transition-colors ${
                  pilihMeja === t.id ? "border-amber bg-amber/15 text-amber"
                    : broken ? "border-line-2 bg-ink-3 text-dim line-through"
                      : kelas === "vvip" ? "border-brick bg-brick/25 text-cream"
                        : kelas === "vip" ? "border-amber/50 bg-amber/10 text-cream"
                          : "border-line bg-ink-2 text-cream"
                }`}
              >
                {t.type === "vip" || t.type === "vvip" ? `V${t.no}` : t.no}
                <div className="text-[9px] font-normal uppercase tracking-wider text-dim">
                  {kelas === "regular" ? "reg" : kelas}
                </div>
              </button>
            );
          })}
        </div>

        {mejaTerpilih && (
          <div className="mt-2 rounded-xl border border-amber/40 bg-amber/5 p-3">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-cream">{mejaTerpilih.name}</span>
              <button onClick={() => setPilihMeja(null)} className="text-[12px] text-dim">tutup</button>
            </div>
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
                if (!confirm(`Tarik ${mejaTerpilih.name} dari denah? `
                  + `Mejanya hilang dari papan dan dari booking tamu. Riwayatnya tetap tersimpan, `
                  + `dan bisa ditambahkan lagi kapan saja.`)) return;
                dispatchA({ t: "setMejaDipakai", tableId: mejaTerpilih.id, dipakai: false });
                setPilihMeja(null);
                void terbitkanSekarang?.();
              }}
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-line px-3 text-[12px] text-dim disabled:opacity-40">
              Tarik meja ini dari denah
            </button>
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
          ) : (<>
            <p className="mt-1 text-[11px] leading-relaxed text-dim">
              Ketuk untuk memakainya. Langsung muncul di papan kasir dan di booking tamu;
              namanya bisa diganti sesudahnya lewat “ubah nomor” di papan.
            </p>
            <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-8">
              {mejaCadangan.map((t) => (
                <button key={t.id}
                  onClick={() => {
                    dispatchA({ t: "setMejaDipakai", tableId: t.id, dipakai: true });
                    setPilihMeja(t.id);
                    void terbitkanSekarang?.();
                  }}
                  className="min-h-[44px] rounded-lg border border-dashed border-line-2 bg-ink
                    text-[13px] font-semibold text-dim hover:border-amber hover:text-amber">
                  {t.name}
                  {t.lantai === 2 && (
                    <div className="text-[9px] font-normal uppercase tracking-wider">lantai 2</div>
                  )}
                </button>
              ))}
            </div>
          </>)}
        </div>

        {tableNote && <p role="status" className="mt-2 text-[12px] text-amber">{tableNote}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Ketuk meja untuk mengatur kelasnya (Reguler / VIP bebas asap rokok / VVIP boleh merokok) atau menandainya rusak.
          Kelas menentukan tarif per jam meja itu. Meja yang sedang dipakai atau sudah dibooking tidak bisa
          berpindah kelas — harga sudah terlanjur disepakati tamu.
        </p>
      </section>

      {/* ── Akun staf ────────────────────────────────────── */}
      <AkunStaf />
      </>)}

      {allow("kelolaMeja") && (<>
      {/* ── QRIS dinamis ─────────────────────────────────── */}
      <QrisPanel />
      </>)}

      {allow("kelolaMeja") && (<>
      {/* ── Data simulasi ────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
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

    </div>
  );
}

/* ═════════════ Akun staf (bisa lebih dari satu superadmin) ═════════════ */

/** Urutan daftar staf: pengurus kedua venue dulu, lalu SPL, lalu Smokehouse. */
const urutStaf = (list: Employee[]) =>
  [...list].sort((x, y) => (x.venue ?? "").localeCompare(y.venue ?? "") || x.name.localeCompare(y.name));

function AkunStaf() {
  const { a, dispatchA, peek, sync } = useAdmin();
  // Mode server: PIN juga harus terdaftar di server supaya berlaku di perangkat lain.
  const store = venueStore() as ReturnType<typeof venueStore> & {
    simpanPinStaf?: (e: { id: string; name: string; role: string; pin?: string; active: boolean }) => Promise<string | null>;
    hapusPinStaf?: (id: string) => Promise<string | null>;
    tautkanEmail?: (staffId: string, email: string) => Promise<string | null>;
    aturSandi?: (staffId: string, password: string) => Promise<string | null>;
    daftarSandi?: () => Promise<Record<string, boolean>>;
  };
  const [buka, setBuka] = useState(false);
  const [form, setForm] = useState<{ id: string; name: string; pin: string; role: Role; venue?: Venue }>({
    id: "", name: "", pin: "", role: "kru_kasir", venue: "spl",
  });
  const [pesan, setPesan] = useState<string | null>(null);
  /** Siapa yang sudah punya password — penanda saja, hash-nya tidak pernah keluar server. */
  const [punyaSandi, setPunyaSandi] = useState<Record<string, boolean>>({});

  useEffect(() => { void store.daftarSandi?.().then(setPunyaSandi); }, [store]);

  const flash = (t: string) => { setPesan(t); setTimeout(() => setPesan(null), 4000); };
  const superaktif = a.employees.filter((e) => e.active && e.role === "superadmin").length;

  function simpan(emp: Employee) {
    /**
     * Ditolak = daftarnya TIDAK BERGERAK sama sekali.
     *
     * Sebelumnya penolakan hanya dikenali kalau JUMLAH akun tidak bertambah,
     * jadi setiap penolakan saat MENYUNTING akun yang sudah ada (ganti peran,
     * ganti venue, nonaktifkan superadmin terakhir) lewat tanpa suara: pesan
     * yang muncul justru "tersimpan", padahal mesin menolaknya.
     */
    const sebelum = JSON.stringify(a.employees);
    dispatchA({ t: "saveEmployee", emp });
    const sesudah = peek().employees;
    if (JSON.stringify(sesudah) === sebelum) {
      flash("Ditolak — PIN 4–6 angka & unik, email sah & unik, dan harus selalu tersisa satu superadmin aktif yang mengurus kedua venue.");
      return false;
    }
    // Mesin sudah menerima; sekarang salin PIN-nya ke server (kalau memakai server).
    const tersimpan = sesudah.find((x) => x.name === emp.name && x.pin === emp.pin)!;
    if (sync.mode === "server") {
      void store.simpanPinStaf?.({
        id: tersimpan.id, name: tersimpan.name, role: tersimpan.role, pin: tersimpan.pin, active: tersimpan.active,
      }).then(async (alasan) => {
        if (alasan) { flash(`Tersimpan di perangkat, TAPI server menolak PIN-nya: ${alasan}`); return; }
        // Email untuk masuk tanpa PIN ikut didaftarkan ke server.
        const e2 = await store.tautkanEmail?.(tersimpan.id, tersimpan.email ?? "");
        if (e2) flash(`Akun tersimpan, tapi email ditolak server: ${e2}`);
      });
    }
    flash(`Akun ${emp.name} tersimpan${sync.mode === "server" ? " & didaftarkan ke server" : ""}.`);
    return true;
  }

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
        Akun staf · {a.employees.length} ({superaktif} superadmin aktif)
      </h2>
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
                PIN {e.pin} · {ROLE_LABEL[e.role]} · {e.venue ? VENUE_LABEL[e.venue] : "kedua venue"}
              </div>
              <input
                defaultValue={e.email ?? ""} type="email" inputMode="email"
                placeholder="email untuk masuk tanpa PIN (opsional)"
                onBlur={(ev) => {
                  const nilai = ev.target.value.trim().toLowerCase();
                  if (nilai === (e.email ?? "")) return;
                  simpan({ ...e, email: nilai });
                }}
                className="mt-1 min-h-[34px] w-full rounded-lg border border-line bg-ink px-2 text-[11px] text-cream placeholder:text-dim"
              />
              {/* Password hanya berguna kalau emailnya sudah diisi — email itulah
                  yang diketik di layar masuk. Server menolak kalau belum ada. */}
              <input
                type="password" autoComplete="new-password"
                placeholder={punyaSandi[e.id] ? "password sudah ada · isi untuk mengganti" : "beri password (min. 8 huruf)"}
                onBlur={async (ev) => {
                  const nilai = ev.target.value;
                  if (!nilai) return;
                  ev.target.value = "";
                  const alasan = await store.aturSandi?.(e.id, nilai);
                  if (alasan) { flash(`Password ditolak: ${alasan}`); return; }
                  setPunyaSandi((d) => ({ ...d, [e.id]: true }));
                  flash(`Password ${e.name} disimpan.`);
                }}
                className="mt-1 min-h-[34px] w-full rounded-lg border border-line bg-ink px-2 text-[11px] text-cream placeholder:text-dim"
              />
            </div>
            <select
              value={e.role} aria-label={`Peran ${e.name}`}
              onChange={(ev) => simpan({ ...e, role: ev.target.value as Role })}
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
              <option value="">Keduanya</option>
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
          <input value={form.pin} inputMode="numeric"
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="PIN 4–6 angka"
            className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-sm tracking-[0.3em] text-cream placeholder:tracking-normal placeholder:text-dim" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROLES.map((r) => (
              <button key={r} onClick={() => setForm({ ...form, role: r })} aria-pressed={form.role === r}
                className={`min-h-[44px] rounded-lg border px-1 text-[12px] leading-tight ${
                  form.role === r ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
                }`}>{ROLE_LABEL[r]}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([["spl", VENUE_LABEL.spl], ["smh", VENUE_LABEL.smh], ["", "Keduanya"]] as const).map(([v, label]) => (
              <button key={v || "dua"} onClick={() => setForm({ ...form, venue: (v || undefined) as Venue | undefined })}
                aria-pressed={(form.venue ?? "") === v}
                className={`min-h-[44px] rounded-lg border px-1 text-[12px] leading-tight ${
                  (form.venue ?? "") === v ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
                }`}>{label}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button disabled={!form.name.trim() || form.pin.length < 4}
              onClick={() => {
                if (simpan({
                  id: "", name: form.name.trim(), pin: form.pin, role: form.role, active: true,
                  ...(form.venue ? { venue: form.venue } : {}),
                })) {
                  setForm({ id: "", name: "", pin: "", role: "kru_kasir", venue: "spl" });
                  setBuka(false);
                }
              }}>Simpan akun</Button>
            <button onClick={() => setBuka(false)} className="min-h-[44px] px-3 text-sm text-dim">Batal</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setBuka(true)}
          className="mt-2 min-h-[44px] w-full rounded-xl border border-line bg-ink-2 text-[13px] text-cream">
          + Tambah akun staf / superadmin
        </button>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-dim">
        Boleh ada lebih dari satu superadmin — pemilik, manajer, atau siapa pun yang berhak melihat
        laporan uang dan menyetujui void. Setiap tindakan tetap tercatat atas nama pemiliknya masing-masing,
        jadi jangan berbagi satu PIN berdua.
        <br /><br />
        <span className="text-mute">Email &amp; password:</span> itulah layar pertama aplikasi sekarang.
        Isi email dulu, baru passwordnya — server menolak password tanpa email, karena email itulah yang
        diketik saat masuk. <span className="text-cream">Tidak ada password bawaan</span>: selama belum
        Anda isikan, orang itu tetap masuk lewat PIN seperti biasa. Kosongkan kolomnya lalu simpan untuk
        mencabut passwordnya.
        <br /><br />
        <span className="text-mute">Kode lewat email</span> tetap ada sebagai jalan darurat kalau password
        lupa — 6 angka dikirim ke email yang sama, berlaku sebagai pengganti password sekali masuk.
        <br /><br />
        <span className="text-mute">PIN</span> tidak dihapus: itu yang dipakai untuk ganti kasir antar shift,
        karena mengetik email tiap pergantian terlalu lambat saat ramai.
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
