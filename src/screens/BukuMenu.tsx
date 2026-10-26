/**
 * BUKU MENU SMOKEHOUSE — halaman menu aslinya, bisa dibuka tamu.
 *
 * Isinya foto halaman buku menu venue sendiri: hidangan, keterangan, pilihan
 * saus & sambal, dan harga seperti tercetak. Dipakai untuk MELIHAT-LIHAT;
 * yang dipesan tetap lewat layar Menu, karena di sanalah harga yang berlaku
 * dan stok yang sebenarnya dibaca dari panel kasir.
 *
 * Kenapa halaman utuh, bukan dipotong per hidangan: keterangan dan pilihan
 * sausnya menempel pada tata letaknya. Dipotong-potong, yang tersisa cuma
 * foto tanpa penjelasan — dan penjelasan itulah yang membuat orang memesan
 * iga 92 ribu tanpa bertanya dulu.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Button } from "../components/UI";
import { BUKU_MENU } from "../data/fotoMenu";

export default function BukuMenu() {
  const nav = useNavigate();
  const [besar, setBesar] = useState<number | null>(null);

  if (BUKU_MENU.length === 0) {
    return (
      <div className="pb-28">
        <PageHeader kicker="Smokehouse" title="Buku Menu" />
        <p className="px-5 text-sm text-dim">Buku menu belum tersedia.</p>
      </div>
    );
  }

  return (
    <div className="pb-32">
      <PageHeader
        kicker="Smokehouse Resto"
        title="Buku Menu"
        sub="Halaman menu aslinya — lengkap dengan keterangan dan pilihan saus."
      />

      <div className="mx-auto max-w-lg px-5">
        <div className="rounded-xl border border-brick/50 bg-brick/10 px-4 py-3 text-[12px] leading-relaxed text-cream">
          Harga di kertas ini bisa berbeda kalau ada penyesuaian.
          <span className="text-brick-lit"> Harga yang berlaku</span> selalu yang tampil
          di layar Menu — itu yang dipakai kasir saat menagih.
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {BUKU_MENU.map((src, i) => (
            <button key={src} onClick={() => setBesar(i)}
              className="overflow-hidden rounded-xl border border-line bg-ink-2">
              <img src={src} alt={`Halaman menu ${i + 1}`} loading="lazy"
                className="w-full object-cover" />
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button full onClick={() => nav("/menu")}>Pesan Sekarang</Button>
          <Button full variant="ghost" onClick={() => nav("/smokehouse/reservasi")}>Reservasi Meja</Button>
        </div>
      </div>

      {/* Satu halaman diperbesar. Ketuk di mana saja untuk menutup. */}
      {besar !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/95 p-3"
          onClick={() => setBesar(null)} role="dialog" aria-label="Halaman buku menu">
          <img src={BUKU_MENU[besar]} alt={`Halaman menu ${besar + 1}`}
            className="mx-auto w-full max-w-2xl rounded-xl" />
          <div className="safe-b sticky bottom-0 mt-3 flex items-center justify-between gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setBesar((n) => (n === null ? null : Math.max(0, n - 1))); }}
              disabled={besar === 0}
              className="min-h-[44px] flex-1 rounded-xl border border-line bg-ink-2 text-[13px] text-cream disabled:opacity-30">
              ← Sebelumnya
            </button>
            <span className="shrink-0 text-[12px] text-dim">{besar + 1} / {BUKU_MENU.length}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setBesar((n) => (n === null ? null : Math.min(BUKU_MENU.length - 1, n + 1))); }}
              disabled={besar === BUKU_MENU.length - 1}
              className="min-h-[44px] flex-1 rounded-xl border border-line bg-ink-2 text-[13px] text-cream disabled:opacity-30">
              Berikutnya →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
