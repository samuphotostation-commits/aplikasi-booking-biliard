/**
 * Pilih printer struk — setelan PERANGKAT, bukan data venue.
 *
 * Hanya muncul di aplikasi Windows, karena cuma di sana struk bisa keluar
 * tanpa dialog cetak. Di peramban bagian ini disembunyikan dan sebagai
 * gantinya dijelaskan kenapa dialognya tetap muncul — daripada memberi tombol
 * yang tidak melakukan apa-apa.
 */
import { useEffect, useState } from "react";
import {
  aturCetakOtomatis, cetakKertas, cetakOtomatis, cetakSenyapMungkin, cetakStruk, daftarPrinter, printerBagian,
  printerTersimpan, simpanPrinter, simpanPrinterBagian,
} from "../../lib/cetak";
import { htmlKertas, kelompokkan, kunciTiket } from "../../lib/cetakDapur";
import { useAdmin } from "../../lib/adminStore";
import type { Ticket } from "../../data/live";
import { bukaJendelaTamu } from "../../lib/tampilTamu";

export function PilihPrinter() {
  const bisaSenyap = cetakSenyapMungkin();
  const [daftar, setDaftar] = useState<{ nama: string; keterangan: string; bawaan: boolean }[]>([]);
  const [pilih, setPilih] = useState(printerTersimpan());
  const [kabar, setKabar] = useState<string | null>(null);

  useEffect(() => { if (bisaSenyap) void daftarPrinter().then(setDaftar); }, [bisaSenyap]);

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Printer struk</h2>

      {!bisaSenyap ? (
        <p className="rounded-xl border border-line bg-ink-2 px-3.5 py-3 text-[12px] leading-snug text-dim">
          Di peramban, struk selalu lewat dialog cetak — itu aturan peramban, tidak bisa
          dilewati aplikasi mana pun. Pakai <span className="text-cream">aplikasi Windows SPL Kasir</span>{" "}
          kalau ingin struk langsung keluar begitu tombol ditekan.
        </p>
      ) : (
        <div className="space-y-2">
          <select
            value={pilih}
            onChange={(e) => { setPilih(e.target.value); simpanPrinter(e.target.value); setKabar(null); }}
            className="min-h-[44px] w-full rounded-xl border border-line bg-ink px-3 text-sm text-cream"
          >
            <option value="">Printer bawaan Windows</option>
            {daftar.map((p) => (
              <option key={p.nama} value={p.nama}>
                {p.nama}{p.bawaan ? " (bawaan)" : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] leading-snug text-dim">
            Ukuran kertas diambil dari setelan printer di Windows — 58 mm atau 80 mm diatur
            di sana, bukan di sini. Struk keluar langsung tanpa dialog.
          </p>
          <button
            type="button"
            onClick={() => void cetakStruk().then((r) => setKabar(r.ok ? "Perintah cetak terkirim." : `Gagal: ${r.alasan ?? "printer tidak menjawab"}`))}
            className="min-h-[40px] w-full rounded-xl border border-line text-[13px] text-mute hover:border-amber hover:text-amber"
          >
            Coba cetak halaman ini
          </button>
          {kabar && <p className="text-[12px] text-amber">{kabar}</p>}
        </div>
      )}
    </section>
  );
}

/** Kertas contoh: mencoba printer tanpa harus membuat pesanan sungguhan. */
const contoh = (station: Ticket["station"]): Ticket => ({
  id: "contoh", sessionId: "contoh", tableName: "CONTOH", itemId: "contoh", name: "Percobaan printer", qty: 1,
  station, status: "new", at: Date.now(), note: "Kalau terbaca, printer siap.",
});

/** Printer dapur dan bar. Setelan perangkat, seperti printer struk. */
export function PrinterDapur() {
  const { a } = useAdmin();
  const bisaSenyap = cetakSenyapMungkin();
  const [daftar, setDaftar] = useState<{ nama: string }[]>([]);
  const [pilih, setPilih] = useState({ kitchen: printerBagian("kitchen"), bar: printerBagian("bar") });
  const [otomatis, setOtomatis] = useState(cetakOtomatis());
  const [kabar, setKabar] = useState<string | null>(null);

  useEffect(() => { if (bisaSenyap) void daftarPrinter().then(setDaftar); }, [bisaSenyap]);

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Printer dapur &amp; bar</h2>
      {!bisaSenyap ? (
        <p className="rounded-xl border border-line bg-ink-2 px-3.5 py-3 text-[12px] leading-snug text-dim">
          Cetak otomatis hanya jalan di <span className="text-cream">aplikasi Windows SPL Kasir</span> pada
          komputer dapur. Di peramban, tombol Cetak di tab Dapur tetap bisa dipakai lewat dialog cetak.
        </p>
      ) : (
        <div className="space-y-2">
          {(["kitchen", "bar"] as const).map((b) => (
            <div key={b} className="flex gap-2">
              <select
                value={pilih[b]} aria-label={b === "bar" ? "Printer bar" : "Printer dapur"}
                onChange={(e) => {
                  simpanPrinterBagian(b, e.target.value);
                  setPilih((p) => ({ ...p, [b]: e.target.value }));
                }}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-sm text-cream"
              >
                <option value="">{b === "bar" ? "Bar" : "Dapur"}: tidak dicetak di komputer ini</option>
                {daftar.map((p) => <option key={p.nama} value={p.nama}>{b === "bar" ? "Bar" : "Dapur"}: {p.nama}</option>)}
              </select>
              <button type="button" disabled={!pilih[b]}
                onClick={() => void cetakKertas(htmlKertas(kelompokkan([contoh(b)])[0]), b)
                  .then((r) => setKabar(r.ok ? "Kertas contoh terkirim." : `Gagal: ${r.alasan}`))}
                className="min-h-[44px] shrink-0 rounded-xl border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber disabled:opacity-40">
                Coba
              </button>
            </div>
          ))}
          <label className="flex items-start gap-2.5 rounded-xl border border-line bg-ink-2 px-3.5 py-3 text-[13px] text-cream">
            <input type="checkbox" checked={otomatis} className="mt-0.5 h-4 w-4 accent-amber"
              onChange={(e) => {
                aturCetakOtomatis(e.target.checked, a.tickets.map(kunciTiket));
                setOtomatis(e.target.checked);
              }} />
            <span>
              Cetak otomatis tiap pesanan baru
              <span className="mt-0.5 block text-[11px] leading-snug text-dim">
                Nyalakan di satu komputer saja untuk tiap bagian, supaya kertas tidak keluar dua kali.
              </span>
            </span>
          </label>
          {kabar && <p className="text-[12px] text-amber">{kabar}</p>}
        </div>
      )}
    </section>
  );
}

/**
 * Layar menghadap tamu — juga setelan PERANGKAT, bukan data venue: monitor
 * keduanya menempel di satu komputer kasir, bukan milik venue secara umum.
 */
export function LayarTamu() {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">Layar menghadap tamu</h2>
      <div className="rounded-xl border border-line bg-ink-2 p-3.5">
        <p className="text-[12px] leading-relaxed text-dim">
          Buka jendela kedua, lalu geser ke monitor atau tablet yang menghadap tamu. QR dinamis
          muncul di sana dengan ukuran besar dan berubah sendiri jadi{" "}
          <span className="text-cream">LUNAS</span> begitu pembayaran masuk — kasir tidak perlu
          memutar layarnya lagi.
        </p>
        <button
          type="button"
          onClick={() => bukaJendelaTamu()}
          className="mt-2 min-h-[42px] w-full rounded-xl border border-amber/50 bg-amber/10 text-[13px] font-semibold text-amber"
        >
          Buka jendela layar tamu
        </button>
        <p className="mt-2 text-[11px] leading-snug text-dim">
          Tidak ada satu pun tombol di layar itu, jadi aman diletakkan menghadap ruangan.
          Biarkan jendelanya terbuka semalaman; layarnya dijaga supaya tidak tidur sendiri.
        </p>
      </div>
    </section>
  );
}
