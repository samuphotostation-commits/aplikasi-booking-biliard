/**
 * Pilih printer struk — setelan PERANGKAT, bukan data venue.
 *
 * Hanya muncul di aplikasi Windows, karena cuma di sana struk bisa keluar
 * tanpa dialog cetak. Di peramban bagian ini disembunyikan dan sebagai
 * gantinya dijelaskan kenapa dialognya tetap muncul — daripada memberi tombol
 * yang tidak melakukan apa-apa.
 */
import { useEffect, useState } from "react";
import { cetakSenyapMungkin, cetakStruk, daftarPrinter, printerTersimpan, simpanPrinter } from "../../lib/cetak";

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
