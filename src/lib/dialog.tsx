/**
 * KOTAK KONFIRMASI DI DALAM APLIKASI — pengganti `confirm()` / `alert()`.
 *
 * Temuan 16 Nov 2026: "kolom untuk mengetik (cari menu, nama customer) sering
 * tidak bisa, harus logout dan login ulang". Di aplikasi Windows (Electron),
 * kotak bawaan `confirm()`/`alert()` adalah jendela sistem; begitu ditutup,
 * jendela kasir sering kehilangan fokus keyboard — tombol masih bisa diklik,
 * tapi kolom ketik diam. Kotak ini digambar di halaman sendiri, jadi fokus
 * tidak pernah berpindah ke jendela lain.
 *
 * Pemakaian: `if (!(await konfirmasi("Hapus?"))) return;` dan
 * `await beritahu("Gagal…")`.
 */
import { useEffect, useRef, useState } from "react";

type Permintaan = { pesan: string; ok: string; batal: string | null; besar?: boolean; selesai: (ya: boolean) => void };

let antre: Permintaan[] = [];
const pendengar = new Set<() => void>();
const kabari = () => pendengar.forEach((f) => f());

function minta(pesan: string, ok: string, batal: string | null, besar = false): Promise<boolean> {
  return new Promise((selesai) => {
    antre = [...antre, { pesan, ok, batal, besar, selesai }];
    kabari();
  });
}

/** Ya/Tidak. Hasil `true` kalau orangnya memilih tombol pertama. */
export const konfirmasi = (pesan: string, ok = "Ya, lanjutkan", batal = "Batal") => minta(pesan, ok, batal);
/** Pemberitahuan satu tombol. */
export const beritahu = (pesan: string) => minta(pesan, "OK", null).then(() => undefined);
/**
 * PERINGATAN BESAR di tengah layar (pemilik 17 Nov 2026: "agar crew patuh
 * aturan, buat efek notif besar di tengah layar kalau nama tidak diisi").
 */
export const peringatanBesar = (pesan: string, ok = "Saya isi sekarang") => minta(pesan, ok, null, true).then(() => undefined);

/** Dipasang SEKALI di akar aplikasi. */
export function TempatDialog() {
  const [, segarkan] = useState(0);
  const tombolOk = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const f = () => segarkan((n) => n + 1);
    pendengar.add(f);
    return () => { pendengar.delete(f); };
  }, []);
  const kini = antre[0];
  useEffect(() => { if (kini) tombolOk.current?.focus(); }, [kini]);
  if (!kini) return null;

  const jawab = (ya: boolean) => {
    antre = antre.slice(1);
    kini.selesai(ya);
    kabari();
  };
  if (kini.besar) {
    return (
      <div role="presentation" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4"
        onKeyDown={(e) => { if (e.key === "Escape") jawab(true); }}>
        <div role="alertdialog" aria-modal="true" aria-label="Peringatan"
          className="w-full max-w-xl animate-[getar_0.45s_ease-in-out] rounded-3xl border-4 border-red-500 bg-ink-2 px-6 py-8 text-center shadow-[0_0_60px_rgba(239,68,68,0.55)]">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-[46px] font-black leading-none text-white">!</div>
          <p className="mt-4 whitespace-pre-line font-display text-[30px] uppercase leading-tight tracking-wide text-red-200">{kini.pesan}</p>
          <button ref={tombolOk} onClick={() => jawab(true)}
            className="mt-6 min-h-[56px] w-full rounded-2xl bg-red-600 px-6 text-[18px] font-extrabold uppercase tracking-wider text-white hover:bg-red-500">
            {kini.ok}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div role="presentation" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(e) => { if (e.key === "Escape") jawab(false); }}>
      <div role="alertdialog" aria-modal="true" aria-label="Konfirmasi"
        className="w-full max-w-sm rounded-2xl border border-line bg-ink-2 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-cream">{kini.pesan}</p>
        <div className="mt-4 flex justify-end gap-2">
          {kini.batal !== null && (
            <button onClick={() => jawab(false)}
              className="min-h-[42px] rounded-lg border border-line px-4 text-[13px] font-semibold text-mute hover:text-cream">
              {kini.batal}
            </button>
          )}
          <button ref={tombolOk} onClick={() => jawab(true)}
            className="min-h-[42px] rounded-lg bg-amber px-4 text-[13px] font-bold text-ink">
            {kini.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
