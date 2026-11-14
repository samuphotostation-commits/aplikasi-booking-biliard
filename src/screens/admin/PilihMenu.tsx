/**
 * PILIH MENU — satu cara memilih menu untuk panel meja dan Counter.
 *
 * Panduan UI/UX pemilik (15 Nov 2026, "ui ux SPL.pdf"):
 *   · "Buat kategori berdasarkan /admin/gudang" — 25+ kategori dulu tampil
 *     sebagai satu tumpukan tombol. Sekarang dikelompokkan dulu seperti
 *     gudangnya: Dapur (makanan), Bar (minuman), Counter (rokok, botolan).
 *   · "Tambahkan reset filter (Semua)" — tombol Semua di kelompok maupun
 *     kategori. Kategori "Semua" menampilkan seluruh menu kelompok itu,
 *     dipisah judul per kategori.
 *
 * Komponen ini hanya MENAMPILKAN dan menyaring. Petak menunya digambar oleh
 * pemakainya (`tile`), jadi aturan stok, varian, dan hitungan draf tetap di
 * layar masing-masing — tidak ada yang berubah perilakunya.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { MenuCategory, MenuItem } from "../../data/menu";
import { FOTO_KATEGORI } from "../../data/fotoMenu";

type Grup = "kitchen" | "bar" | "billiard";
const LABEL_GRUP: Record<Grup, string> = {
  kitchen: "Dapur · Makanan",
  bar: "Bar · Minuman",
  billiard: "Counter",
};
const URUT_GRUP: Grup[] = ["kitchen", "bar", "billiard"];

/** Kelompok sebuah kategori = station yang paling banyak di dalamnya (sama dengan gudangnya). */
export function grupKategori(c: MenuCategory): Grup {
  if (c.grup) return c.grup;               // diatur pemilik di Menu & Stok → Kategori
  const n: Record<Grup, number> = { kitchen: 0, bar: 0, billiard: 0 };
  for (const i of c.items) n[i.station]++;
  return URUT_GRUP.reduce((x, y) => (n[y] > n[x] ? y : x), "kitchen" as Grup);
}

export default function PilihMenu({ menu, tile, tinggi = "max-h-[42vh]", kolom = "grid-cols-2 sm:grid-cols-3", cariLabel = "Cari menu…" }: {
  menu: MenuCategory[];
  /** Satu petak menu — digambar pemakai. */
  tile: (it: MenuItem) => ReactNode;
  /** Tinggi maksimum daftar (kelas Tailwind). Kosong = ikut gulungan wadahnya. */
  tinggi?: string;
  /** Kolom petak (kelas Tailwind). */
  kolom?: string;
  cariLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [grup, setGrup] = useState<Grup | "semua">("semua");
  const [cat, setCat] = useState<string>("semua");

  const grupDari = useMemo(() => new Map(menu.map((c) => [c.id, grupKategori(c)])), [menu]);
  const adaGrup = URUT_GRUP.filter((g) => menu.some((c) => grupDari.get(c.id) === g));
  const kategoriTampil = menu.filter((c) => grup === "semua" || grupDari.get(c.id) === grup);
  const jumlah = (cs: MenuCategory[]) => cs.reduce((n, c) => n + c.items.length, 0);

  const cari = q.trim().toLowerCase();
  const hasilCari = cari ? menu.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(cari)) : [];
  const satu = !cari && cat !== "semua" ? menu.find((c) => c.id === cat) : undefined;
  const adaSaring = grup !== "semua" || cat !== "semua" || !!cari;

  const pilihGrup = (g: Grup | "semua") => { setGrup(g); setCat("semua"); };
  const reset = () => { setQ(""); setGrup("semua"); setCat("semua"); };

  return (
    <div className="space-y-2">
      <div className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={cariLabel} aria-label="Cari menu"
          className="w-full rounded-xl border border-line bg-ink px-4 py-2.5 pr-10 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
        {q && (
          <button onClick={() => setQ("")} aria-label="Hapus pencarian"
            className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-mute hover:text-cream">×</button>
        )}
      </div>

      {!cari && (<>
        {/* KELOMPOK (seperti Gudang) */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-ink p-1" role="radiogroup" aria-label="Kelompok menu">
          {(["semua", ...adaGrup] as const).map((g) => (
            <button key={g} role="radio" aria-checked={grup === g} onClick={() => pilihGrup(g)}
              className={`min-h-[36px] flex-1 whitespace-nowrap rounded-lg px-2.5 text-[12px] font-semibold ${
                grup === g ? "bg-amber text-ink" : "text-mute hover:text-cream"
              }`}>
              {g === "semua" ? "Semua" : LABEL_GRUP[g]}
              <span className={`ml-1 text-[11px] font-normal ${grup === g ? "text-ink/70" : "text-dim"}`}>
                {jumlah(g === "semua" ? menu : menu.filter((c) => grupDari.get(c.id) === g))}
              </span>
            </button>
          ))}
        </div>

        {/* KATEGORI di kelompok itu — "Semua" sebagai reset. Dibungkus, tidak digeser. */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setCat("semua")} aria-pressed={cat === "semua"}
            className={`min-h-[32px] rounded-full border px-3 text-[12px] font-semibold ${
              cat === "semua" ? "border-cream bg-cream text-ink" : "border-line bg-ink text-mute"
            }`}>Semua</button>
          {kategoriTampil.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}
              className={`min-h-[32px] rounded-full border px-3 text-[12px] ${
                cat === c.id ? "border-amber bg-amber text-ink" : "border-line bg-ink text-mute hover:text-cream"
              }`}>{c.name}</button>
          ))}
          {adaSaring && (
            <button onClick={reset} className="min-h-[32px] px-2 text-[12px] text-dim underline underline-offset-2">
              Atur ulang
            </button>
          )}
        </div>
      </>)}

      <div className={tinggi ? `${tinggi} overflow-y-auto pr-1` : ""}>
        {cari ? (
          hasilCari.length ? <div className={`grid gap-1.5 ${kolom}`}>{hasilCari.map(tile)}</div>
            : <p className="py-6 text-center text-[12px] text-dim">Tidak ada menu bernama “{q.trim()}”.</p>
        ) : satu ? (
          <>
            {FOTO_KATEGORI[satu.id] && (
              <div className="relative mb-2 overflow-hidden rounded-xl border border-line">
                <img src={FOTO_KATEGORI[satu.id]} alt="" aria-hidden="true" className="h-20 w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 px-3 pb-1.5 font-display text-lg uppercase tracking-wide text-cream">{satu.name}</div>
              </div>
            )}
            <div className={`grid gap-1.5 ${kolom}`}>{satu.items.map(tile)}</div>
          </>
        ) : (
          <div className="space-y-3">
            {kategoriTampil.map((c) => (
              <section key={c.id}>
                <button onClick={() => setCat(c.id)}
                  className="sticky top-0 z-[1] mb-1.5 flex w-full items-center gap-2 bg-ink-2/95 py-1 text-left backdrop-blur">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-cream">{c.name}</span>
                  <span className="text-[11px] text-dim">{c.items.length}</span>
                  <span className="h-px flex-1 bg-line" />
                </button>
                <div className={`grid gap-1.5 ${kolom}`}>{c.items.map(tile)}</div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
