import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, PageHeader } from "../components/UI";
import { useAdmin, restoProblem, classOf, RESTO_LEAD_MIN } from "../lib/adminStore";
import { slotStart } from "../lib/occupancy";
import { TABLES, HOURS, fmtHour, VENUE } from "../data/venue";
import { addDaysISO, fmtDateShort, todayISO, bookingCode } from "../lib/core";
import { bacaProfil, simpanProfil, rapikanHp } from "../lib/profilTamu";
import { catatKode } from "../lib/customerStore";

/* ═══════════════════════════════════════════════════════════════════
   RESERVASI MEJA SMOKEHOUSE RESTO

   Beda dari booking biliar: tidak ada sewa waktu dan tidak ada bayar di
   muka — yang dijanjikan hanya mejanya. Tamu datang, tunjukkan kode,
   kasir mendudukkan. Kalau tidak datang 20 menit setelah jamnya, mejanya
   dilepas untuk tamu lain.
   ═══════════════════════════════════════════════════════════════════ */

const DURASI = [1, 2, 3];
const PAX = [2, 3, 4, 5, 6, 8, 10];

export default function RestoReservasi() {
  const { a: venue, dispatchA, peek, tick } = useAdmin();
  void tick;
  const profil = useMemo(() => bacaProfil(), []);
  const [tanggal, setTanggal] = useState(todayISO());
  const [jam, setJam] = useState<number | null>(null);
  const [jamLama, setJamLama] = useState(2);
  const [pax, setPax] = useState(4);
  const [nama, setNama] = useState(profil.nama);
  const [hp, setHp] = useState(profil.hp);
  const [catatan, setCatatan] = useState("");
  const [hasil, setHasil] = useState<{ kode: string; checkin: string; meja: string } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const hari = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysISO(todayISO(), i)), []);
  const mejaResto = TABLES.filter((t) => classOf(venue, t.id) === "resto");

  /** Berapa meja resto yang muat & kosong untuk satu jam. */
  const kosongPada = (h: number) => {
    const startsAt = slotStart(tanggal, h);
    return mejaResto.filter((t) => t.capacity >= pax &&
      !restoProblem(venue, { pax, startsAt, hours: jamLama, tableId: t.id })).length;
  };

  const startsAt = jam !== null ? slotStart(tanggal, jam) : 0;
  const masalah = jam === null ? null : restoProblem(venue, { pax, startsAt, hours: jamLama });
  const nomorOk = rapikanHp(hp).length >= 10;
  const siap = jam !== null && !masalah && nama.trim().length >= 2 && nomorOk;

  function kirim() {
    if (!siap) return;
    const kode = bookingCode();
    const id = `rr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    simpanProfil({ nama: nama.trim(), hp: rapikanHp(hp) });
    dispatchA({
      t: "reserveResto",
      res: {
        id, code: kode, guest: nama.trim(), phone: rapikanHp(hp), pax,
        startsAt, hours: jamLama, ...(catatan.trim() ? { note: catatan.trim() } : {}),
      },
    });
    const sesi = peek().sessions.find((s) => s.id === id);
    if (!sesi) {
      setGalat("Maaf, meja untuk jam itu baru saja penuh. Coba jam lain atau hubungi kami.");
      return;
    }
    catatKode(kode);
    setGalat(null);
    setHasil({
      kode, checkin: sesi.checkin ?? "-",
      meja: TABLES.find((t) => t.id === sesi.tableId)?.name ?? "Meja resto",
    });
  }

  if (hasil) {
    return (
      <div className="pb-32">
        <PageHeader kicker="Smokehouse Resto" title="Meja Dipesan" sub="Tunjukkan kode ini ke kasir saat datang." />
        <div className="px-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="p-5 text-center">
              <div className="text-[11px] uppercase tracking-[0.18em] text-dim">Kode check-in</div>
              <div className="font-display text-4xl tracking-[0.3em] text-amber">{hasil.checkin}</div>
              <div className="mt-3 text-sm text-cream">{hasil.meja} · {pax} orang</div>
              <div className="text-[13px] text-mute">
                {fmtDateShort(tanggal).dow} {fmtDateShort(tanggal).day} {fmtDateShort(tanggal).mon} · {fmtHour(jam!)} – {fmtHour(jam! + jamLama)}
              </div>
              <div className="mt-3 text-[11px] text-dim">No. reservasi {hasil.kode}</div>
            </Card>
          </motion.div>
          <div className="mt-4 rounded-xl border border-amber/40 bg-amber/8 px-4 py-3 text-[12px] leading-snug text-amber">
            Datang paling lambat 20 menit setelah jam reservasi — lewat itu mejanya dilepas untuk tamu lain.
            Reservasi tidak bisa diganti jadwalnya lewat aplikasi; hubungi kami langsung kalau ada perubahan.
          </div>
          <div className="mt-4">
            <Button full onClick={() => { setHasil(null); setJam(null); }}>Pesan meja lagi</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-40">
      <PageHeader
        kicker="Smokehouse Resto"
        title="Reservasi Meja"
        sub={`Tanpa bayar di muka. Makanan dipesan di tempat. ${mejaResto.length} meja tersedia.`}
      />

      <div className="space-y-5 px-5">
        {/* Tanggal */}
        <section>
          <Label>Tanggal</Label>
          <div className="no-bar -mx-5 flex gap-2 overflow-x-auto px-5">
            {hari.map((d) => (
              <button key={d} onClick={() => { setTanggal(d); setJam(null); }}
                aria-pressed={d === tanggal}
                className={`min-h-[56px] shrink-0 rounded-xl border px-4 text-center ${
                  d === tanggal ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-mute"
                }`}>
                <div className="text-[10px] uppercase tracking-wider opacity-70">
                  {d === todayISO() ? "Hari ini" : fmtDateShort(d).dow}
                </div>
                <div className="font-display text-base leading-tight">
                  {fmtDateShort(d).day} {fmtDateShort(d).mon}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Jumlah orang */}
        <section>
          <Label>Berapa orang</Label>
          <div className="flex flex-wrap gap-2">
            {PAX.map((n) => (
              <button key={n} onClick={() => { setPax(n); setJam(null); }} aria-pressed={pax === n}
                className={`min-h-[44px] min-w-[52px] rounded-xl border px-3 text-sm font-semibold ${
                  pax === n ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-cream"
                }`}>{n}</button>
            ))}
          </div>
          {pax > 8 && (
            <p className="mt-1.5 text-[12px] text-amber">
              Rombongan di atas 8 orang biasanya perlu gabung meja — hubungi kami lewat Instagram {VENUE.ig.split("/").filter(Boolean).pop()} supaya kami siapkan.
            </p>
          )}
        </section>

        {/* Lama duduk */}
        <section>
          <Label>Perkiraan lama</Label>
          <div className="flex gap-2">
            {DURASI.map((h) => (
              <button key={h} onClick={() => { setJamLama(h); setJam(null); }} aria-pressed={jamLama === h}
                className={`min-h-[44px] flex-1 rounded-xl border text-sm font-semibold ${
                  jamLama === h ? "border-amber bg-amber text-ink" : "border-line bg-ink-2 text-cream"
                }`}>{h} jam</button>
            ))}
          </div>
        </section>

        {/* Jam */}
        <section>
          <Label>Jam datang</Label>
          <div className="grid grid-cols-4 gap-2">
            {HOURS.filter((h) => h + jamLama <= 26).map((h) => {
              const sisa = kosongPada(h);
              const bisa = sisa > 0;
              return (
                <button key={h} disabled={!bisa} onClick={() => setJam(h)} aria-pressed={jam === h}
                  className={`min-h-[52px] rounded-xl border text-center ${
                    jam === h ? "border-amber bg-amber text-ink"
                      : bisa ? "border-line bg-ink-2 text-cream" : "border-line bg-ink-3 text-dim opacity-40"
                  }`}>
                  <div className="font-display text-sm leading-tight">{fmtHour(h)}</div>
                  <div className={`text-[9px] ${jam === h ? "text-ink/70" : "text-dim"}`}>
                    {bisa ? `${sisa} meja` : "penuh"}
                  </div>
                </button>
              );
            })}
          </div>
          {masalah && <p className="mt-2 text-[12px] text-red-400">{masalah}</p>}
          <p className="mt-2 text-[11px] text-dim">
            Reservasi paling cepat {RESTO_LEAD_MIN} menit sebelum datang. Untuk sekarang juga, langsung datang saja —
            kasir akan mencarikan meja kosong.
          </p>
        </section>

        {/* Data tamu */}
        <section className="space-y-2">
          <Label>Atas nama</Label>
          <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama"
            className="min-h-[48px] w-full rounded-xl border border-line bg-ink-2 px-4 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
          <input value={hp} onChange={(e) => setHp(e.target.value)} inputMode="tel" placeholder="Nomor HP / WhatsApp"
            className="min-h-[48px] w-full rounded-xl border border-line bg-ink-2 px-4 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
          <input value={catatan} onChange={(e) => setCatatan(e.target.value.slice(0, 120))}
            placeholder="Catatan (mis. dekat jendela, ulang tahun)"
            className="min-h-[48px] w-full rounded-xl border border-line bg-ink-2 px-4 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
          {hp && !nomorOk && <p className="text-[12px] text-red-400">Nomor HP belum lengkap.</p>}
        </section>

        <div className="rounded-xl border border-line bg-ink-2 px-3.5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Ketentuan</div>
          <ul className="mt-1 space-y-1 text-[12px] leading-snug text-mute">
            <li>• Reservasi meja resto gratis — makanan &amp; minuman dibayar di kasir saat pulang.</li>
            <li>• Datang paling lambat 20 menit setelah jam reservasi; lewat itu meja dilepas untuk tamu lain.</li>
            <li>• Jadwal yang sudah dibuat tidak bisa diganti lewat aplikasi — hubungi kami langsung.</li>
            <li>• Nama &amp; nomor HP dipakai kasir untuk menghubungi Anda bila perlu.</li>
          </ul>
        </div>

        {galat && <p role="alert" className="text-[13px] text-red-400">{galat}</p>}

        <Button full disabled={!siap} onClick={kirim}>
          {jam === null ? "Pilih jam dulu" : `Pesan meja · ${fmtHour(jam)} · ${pax} orang`}
        </Button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">{children}</div>
  );
}
