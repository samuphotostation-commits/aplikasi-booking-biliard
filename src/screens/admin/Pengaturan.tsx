import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "../../components/UI";
import { useAdmin, maintenanceBlockers, classOf } from "../../lib/adminStore";
import { venueStore } from "../../lib/venueStore";
import { TABLES, PAKET_SIANG, CLASS_LABEL, type TableType } from "../../data/venue";
import type { Employee, Role } from "../../data/staff";
import { rupiah } from "../../lib/core";
import { PilihPrinter } from "./PilihPrinter";
import { jam } from "./AdminShell";
import QrisPanel from "./QrisPanel";

/* Pengaturan tarif, kelas meja, akun staf & data — hanya manajer/owner (PRD §7.5).
   Perubahan tarif TIDAK mengubah booking yang sudah dibuat: harga
   dibekukan sebagai snapshot saat hold dibuat (PRD §7.2), dan kelas meja
   dibekukan di sesinya saat meja dibuka. */

const KELAS_BILIAR: TableType[] = ["regular", "vip", "vvip"];

export default function Pengaturan() {
  const { a, dispatchA, byTable, sync, resetData, peek, terbitkanSekarang } = useAdmin();
  const [confirmReset, setConfirmReset] = useState<null | boolean>(null);
  const [draft, setDraft] = useState(a.rates);
  /** Tarif yang menjadi dasar suntingan — untuk mendeteksi perubahan dari perangkat lain. */
  const [baseRates, setBaseRates] = useState(a.rates);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [tableNote, setTableNote] = useState<string | null>(null);
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

  const biliar = TABLES.filter((t) => t.type !== "resto");
  const resto = TABLES.filter((t) => t.type === "resto");
  const hitung = (k: TableType) => biliar.filter((t) => classOf(a, t.id) === k).length;
  const mejaTerpilih = pilihMeja ? TABLES.find((t) => t.id === pilihMeja) ?? null : null;

  return (
    <div className="space-y-6 pb-6">
      {/* Printer struk: setelan PERANGKAT, bukan data venue — tiap komputer
          kasir punya printernya sendiri. */}
      <PilihPrinter />

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
            label="VIP (no smoking)" hint={`sepanjang jam · ${hitung("vip")} ruang`}
            value={draft.vip}
            onChange={(v) => setDraft({ ...draft, vip: v })}
          />
          <RateField
            label="VVIP (bebas rokok)" hint={`sepanjang jam · ${hitung("vvip")} ruang`}
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
      </section>

      {/* ── Paket ────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Paket aktif
        </h2>
        <div className="rounded-xl border border-line bg-ink-2 p-3.5">
          <div className="flex items-baseline justify-between">
            <span className="font-script text-xl leading-none text-amber">{PAKET_SIANG.name}</span>
            <span className="font-serif text-lg font-bold text-cream">
              {rupiah(PAKET_SIANG.price)}
            </span>
          </div>
          <ul className="mt-1.5 space-y-0.5 text-[12px] text-mute">
            {PAKET_SIANG.perks.map((p) => <li key={p}>• {p}</li>)}
            <li>• Hanya untuk meja reguler, mulai paling lambat jam {PAKET_SIANG.lastStartHour}.00</li>
          </ul>
        </div>
      </section>

      {/* ── Meja biliar: kelas & status ──────────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Meja biliar · {biliar.length}
        </h2>
        <div className="mb-2 flex flex-wrap gap-3 text-[12px] text-dim">
          <span>{hitung("regular")} reguler</span>
          <span className="text-amber/90">{hitung("vip")} VIP (no smoking)</span>
          <span className="text-brick-lit">{hitung("vvip")} VVIP (bebas rokok)</span>
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
          </div>
        )}
        {tableNote && <p role="status" className="mt-2 text-[12px] text-amber">{tableNote}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Ketuk meja untuk mengatur kelasnya (Reguler / VIP no smoking / VVIP bebas rokok) atau menandainya rusak.
          Kelas menentukan tarif per jam meja itu. Meja yang sedang dipakai atau sudah dibooking tidak bisa
          berpindah kelas — harga sudah terlanjur disepakati tamu.
        </p>
      </section>

      {/* ── Meja resto ───────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Meja Smokehouse Resto · {resto.length}
        </h2>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          {resto.map((t) => {
            const s = byTable.get(t.id);
            const broken = s?.status === "maintenance";
            return (
              <button key={t.id} onClick={() => setPilihMeja(pilihMeja === t.id ? null : t.id)}
                className={`min-h-[42px] rounded-lg border text-[12px] font-semibold ${
                  pilihMeja === t.id ? "border-amber bg-amber/15 text-amber"
                    : broken ? "border-line-2 bg-ink-3 text-dim line-through" : "border-line bg-ink-2 text-cream"
                }`}>
                R{t.no}
                <div className="text-[9px] font-normal text-dim">{t.capacity} kursi</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Meja resto tidak punya meteran jam — yang ditagih hanya makanan &amp; minumannya.
          Tamu bisa memesan meja resto dari aplikasi (reservasi tanpa bayar di muka), dan kasir
          mendudukkan mereka dengan kode check-in seperti booking biliar.
        </p>
      </section>

      {/* ── Akun staf ────────────────────────────────────── */}
      <AkunStaf />

      {/* ── QRIS dinamis ─────────────────────────────────── */}
      <QrisPanel />

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
    </div>
  );
}

/* ═════════════ Akun staf (bisa lebih dari satu superadmin) ═════════════ */

function AkunStaf() {
  const { a, dispatchA, peek, sync } = useAdmin();
  // Mode server: PIN juga harus terdaftar di server supaya berlaku di perangkat lain.
  const store = venueStore() as ReturnType<typeof venueStore> & {
    simpanPinStaf?: (e: { id: string; name: string; role: string; pin?: string; active: boolean }) => Promise<string | null>;
    hapusPinStaf?: (id: string) => Promise<string | null>;
    tautkanEmail?: (staffId: string, email: string) => Promise<string | null>;
  };
  const [buka, setBuka] = useState(false);
  const [form, setForm] = useState<{ id: string; name: string; pin: string; role: Role }>({
    id: "", name: "", pin: "", role: "karyawan",
  });
  const [pesan, setPesan] = useState<string | null>(null);

  const flash = (t: string) => { setPesan(t); setTimeout(() => setPesan(null), 4000); };
  const superaktif = a.employees.filter((e) => e.active && e.role === "superadmin").length;

  function simpan(emp: Employee) {
    const sebelum = a.employees.length;
    dispatchA({ t: "saveEmployee", emp });
    const sesudah = peek().employees;
    const ada = sesudah.find((x) => x.name === emp.name && x.pin === emp.pin);
    if (!ada && sesudah.length === sebelum) {
      flash("Ditolak — PIN harus 4–6 angka & unik, email harus sah & unik, dan minimal satu superadmin harus tetap aktif.");
      return false;
    }
    // Mesin sudah menerima; sekarang salin PIN-nya ke server (kalau memakai server).
    const tersimpan = ada ?? sesudah.find((x) => x.name === emp.name && x.pin === emp.pin)!;
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
        {a.employees.map((e) => (
          <div key={e.id} className="flex items-center gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-cream">
                {e.name}
                {!e.active && <span className="ml-2 text-[11px] text-dim">(nonaktif)</span>}
              </div>
              <div className="text-[11px] text-dim">
                PIN {e.pin} · {e.role === "superadmin" ? "superadmin" : "karyawan"}
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
            </div>
            <button
              onClick={() => simpan({ ...e, role: e.role === "superadmin" ? "karyawan" : "superadmin" })}
              className="min-h-[36px] shrink-0 rounded-lg border border-line px-2.5 text-[11px] text-mute">
              jadikan {e.role === "superadmin" ? "karyawan" : "superadmin"}
            </button>
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
                  flash("Tidak bisa dihapus — shift orang ini masih buka, atau ini superadmin aktif terakhir.");
                } else {
                  if (sync.mode === "server") void store.hapusPinStaf?.(e.id);
                  flash(`Akun ${e.name} dihapus.`);
                }
              }}
              className="min-h-[36px] shrink-0 rounded-lg border border-line px-2.5 text-[11px] text-red-300">
              hapus
            </button>
          </div>
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
          <div className="grid grid-cols-2 gap-2">
            {(["karyawan", "superadmin"] as Role[]).map((r) => (
              <button key={r} onClick={() => setForm({ ...form, role: r })} aria-pressed={form.role === r}
                className={`min-h-[44px] rounded-lg border text-[13px] ${
                  form.role === r ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
                }`}>{r === "karyawan" ? "Karyawan" : "Superadmin"}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button disabled={!form.name.trim() || form.pin.length < 4}
              onClick={() => {
                if (simpan({ id: "", name: form.name.trim(), pin: form.pin, role: form.role, active: true })) {
                  setForm({ id: "", name: "", pin: "", role: "karyawan" });
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
        <span className="text-mute">Masuk dengan email:</span> isi alamat email di atas, lalu orang itu bisa
        memilih "Masuk dengan email" di layar PIN — kode 6 angka dikirim ke emailnya dan berlaku sebagai
        pengganti PIN. Berguna untuk pemilik yang tidak mau menghafal PIN, dan tetap tercatat atas namanya.
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
