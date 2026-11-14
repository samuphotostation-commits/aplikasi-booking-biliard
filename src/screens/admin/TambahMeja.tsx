/**
 * FORMULIR TAMBAH MEJA — SATU untuk Papan ("+ Meja" di ujung tiap lantai)
 * dan Pengaturan → Meja (pemilik 15 Nov 2026: "tambah meja ini harusnya
 * relevan dengan pengaturan penambahan meja di superadmin, dan bisa per
 * lantai").
 *
 * Meja diambil dari katalog yang dikenal mesin (`cadanganMeja`): venue,
 * kelas, lantai, dan kapasitasnya sudah benar sejak awal. Yang dipilih kasir
 * hanya lantai (Smokehouse), kelas (SPL), dan namanya.
 */
import { useState } from "react";
import { useAdmin, cadanganMeja, lantaiVenue, mejaDipakai, namaMeja, kategoriMejaVenue, kategoriMejaDari } from "../../lib/adminStore";
import { COMPLIMENT_LABEL, type JenisCompliment } from "../../data/venue";
import { CLASS_LABEL, VENUE_LABEL, type TableType, type Venue } from "../../data/venue";

/*
 * KATEGORI DIPILIH DULU (pemilik 15 Nov 2026: "harusnya ada pilihan kategori
 * mejanya, begitupun SPL Sport, sebelum menambahkan meja").
 *   · SPL Sport  — Reguler / VIP (bebas asap rokok) / VVIP (boleh merokok).
 *     Kelas meja biliar bisa diubah bebas, jadi meja cadangan mana pun bisa
 *     dipakai; kelasnya langsung dipasang begitu meja ditambahkan.
 *   · Smokehouse — kategori meja: Reguler, VIP, Owner, Entertain, dan kategori
 *     buatan pemilik ("+ Kategori baru" langsung di formulir ini).
 */
type KategoriBaru = { kunci: string; label: string; ket: string; kelas?: TableType; kategoriMeja?: string };
const KATEGORI_SPL: KategoriBaru[] = [
  { kunci: "regular", label: "Reguler", ket: "tarif reguler", kelas: "regular" },
  { kunci: "vip", label: "VIP", ket: "bebas asap rokok", kelas: "vip" },
  { kunci: "vvip", label: "VVIP", ket: "boleh merokok", kelas: "vvip" },
];

export default function TambahMeja({ venue, lantaiTetap, ringkas, onSelesai, onBatal }: {
  venue: Venue;
  /** Diisi = lantainya sudah pasti (dari Papan); kosong = pilih lantai di formulir. */
  lantaiTetap?: number;
  /** Tampilan kecil untuk petak di Papan. */
  ringkas?: boolean;
  onSelesai: (pesan: string, tableId: string) => void;
  onBatal?: () => void;
}) {
  const { a, dispatchA, peek, terbitkanSekarang } = useAdmin();
  const daftarLantai = venue === "smh" ? lantaiVenue(venue) : [];
  const [lantaiPilih, setLantai] = useState<number | undefined>(lantaiTetap ?? daftarLantai[0]);
  // Venue bisa berganti saat formulir terbuka — pilihan yang tidak berlaku lagi jatuh ke yang pertama.
  const lantai = lantaiTetap ?? (lantaiPilih !== undefined && daftarLantai.includes(lantaiPilih) ? lantaiPilih : daftarLantai[0]);
  const KATEGORI: KategoriBaru[] = venue === "spl" ? KATEGORI_SPL
    : kategoriMejaVenue(a, "smh").map((k) => ({
      kunci: k.id, label: k.nama, kategoriMeja: k.id,
      ket: k.compliment ? `compliment ${COMPLIMENT_LABEL[k.compliment].toLowerCase()} · Rp 0` : k.bawaan ? "meja makan" : "buatan pemilik",
    }));
  const [katPilih, setKat] = useState<string>(KATEGORI[0].kunci);
  const kat = KATEGORI.some((k) => k.kunci === katPilih) ? katPilih : KATEGORI[0].kunci;
  const kategori = KATEGORI.find((k) => k.kunci === kat) ?? KATEGORI[0];
  /** Kategori baru langsung dari formulir (Smokehouse). */
  const [buatBaru, setBuatBaru] = useState<{ nama: string; jenis: JenisCompliment | "" } | null>(null);
  const lt = venue === "smh" ? lantai : undefined;
  /** Meja katalog yang bisa dipakai untuk kategori ini. SPL: utamakan meja yang kelas bawaannya sama. */
  const pilihan = (k: KategoriBaru) => venue === "spl"
    ? [...cadanganMeja(a, venue, { kelas: k.kelas }), ...cadanganMeja(a, venue).filter((t) => t.type !== k.kelas)]
    : cadanganMeja(a, venue, { lantai: lt });
  const [nama, setNama] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const calon = pilihan(kategori)[0];

  function tambah() {
    if (!calon) { setGalat("Tidak ada lagi meja kosong di katalog untuk pilihan ini."); return; }
    dispatchA({ t: "setMejaDipakai", tableId: calon.id, dipakai: true });
    if (!mejaDipakai(peek(), calon.id)) {
      setGalat("Meja tidak bisa ditambahkan — ditolak mesin. Pastikan Anda superadmin/manager venue ini.");
      return;
    }
    // Kelas pilihan dipasang langsung (SPL) — kasir tidak perlu ke Pengaturan lagi.
    if (kategori.kelas && kategori.kelas !== calon.type) dispatchA({ t: "setTableClass", tableId: calon.id, type: kategori.kelas });
    // Kategori meja Smokehouse (Owner, Entertain, VIP, buatan pemilik) dipasang langsung.
    if (kategori.kategoriMeja && kategoriMejaDari(peek(), calon.id)?.id !== kategori.kategoriMeja) {
      dispatchA({ t: "setKategoriMeja", tableId: calon.id, kategori: kategori.kategoriMeja });
    }
    const n = nama.trim();
    if (n && n !== calon.name) dispatchA({ t: "setTableName", tableId: calon.id, name: n });
    void terbitkanSekarang?.();
    setNama(""); setGalat(null);
    onSelesai(`${namaMeja(peek(), calon.id)} ditambahkan${calon.lantai ? ` di lantai ${calon.lantai}` : ""}${
      ` · ${kategori.label}`}.`, calon.id);
  }

  const chip = (on: boolean) => `min-h-[34px] rounded-lg border px-2.5 text-[12px] font-semibold disabled:opacity-30 ${
    on ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-mute hover:text-cream"}`;

  return (
    <div className={ringkas ? "space-y-1.5" : "space-y-2"}>
      {/* 1 · KATEGORI MEJA — dipilih paling awal. */}
      <div>
        {!ringkas && <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-dim">1 · Kategori meja</div>}
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kategori meja">
          {KATEGORI.map((k) => {
            const sisa = pilihan(k).length;
            return (
              <button key={k.kunci} role="radio" aria-checked={kat === k.kunci} disabled={sisa === 0}
                onClick={() => setKat(k.kunci)} className={`${chip(kat === k.kunci)} text-left`}>
                {k.label}
                {!ringkas && <span className="block text-[10px] font-normal text-dim">{k.ket} · sisa {sisa}</span>}
              </button>
            );
          })}
          {venue === "smh" && !buatBaru && (
            <button onClick={() => setBuatBaru({ nama: "", jenis: "" })}
              className="min-h-[34px] rounded-lg border border-dashed border-amber/60 px-2.5 text-[12px] font-semibold text-amber hover:bg-amber/10">
              + Kategori baru
            </button>
          )}
        </div>
        {buatBaru && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber/40 bg-amber/5 p-1.5">
            <input autoFocus value={buatBaru.nama} onChange={(e) => setBuatBaru({ ...buatBaru, nama: e.target.value.slice(0, 30) })}
              placeholder="Nama kategori, mis. Outdoor" aria-label="Nama kategori meja baru"
              className="min-h-[34px] min-w-[140px] flex-1 rounded-lg border border-line bg-ink px-2 text-[12px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            <select value={buatBaru.jenis} onChange={(e) => setBuatBaru({ ...buatBaru, jenis: e.target.value as JenisCompliment | "" })}
              aria-label="Jenis kategori" className="min-h-[34px] rounded-lg border border-line bg-ink px-2 text-[12px] text-cream">
              <option value="">Meja biasa (bayar)</option>
              <option value="owner">Compliment owner (Rp 0)</option>
              <option value="entertain">Compliment entertain (Rp 0)</option>
            </select>
            <button disabled={!buatBaru.nama.trim()}
              onClick={() => {
                const nm = buatBaru.nama.trim();
                const id = `km-${nm.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "meja"}-${Date.now().toString(36).slice(-4)}`;
                dispatchA({ t: "buatKategoriMeja", id, nama: nm, venue: "smh", ...(buatBaru.jenis ? { compliment: buatBaru.jenis } : {}) });
                if (peek().kategoriMejaBaru?.[id]) { setKat(id); setBuatBaru(null); setGalat(null); }
                else setGalat("Kategori tidak dibuat — namanya sudah dipakai atau tidak sah.");
              }}
              className="min-h-[34px] rounded-lg bg-amber px-3 text-[12px] font-bold text-ink disabled:opacity-35">Simpan</button>
            <button onClick={() => setBuatBaru(null)} className="min-h-[34px] px-2 text-[12px] text-dim">batal</button>
          </div>
        )}
      </div>
      {venue === "smh" && lantaiTetap === undefined && daftarLantai.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Lantai">
          <span className="text-[11px] font-bold uppercase tracking-wider text-dim">2 · Lantai</span>
          {daftarLantai.map((l) => {
            const sisa = cadanganMeja(a, venue, { lantai: l }).length;
            return (
              <button key={l} role="radio" aria-checked={lantai === l} disabled={sisa === 0} onClick={() => setLantai(l)} className={chip(lantai === l)}>
                Lantai {l} <span className="font-normal text-dim">· sisa {sisa}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <input autoFocus={ringkas} value={nama} onChange={(e) => setNama(e.target.value.slice(0, 30))}
          onKeyDown={(e) => { if (e.key === "Enter") tambah(); if (e.key === "Escape") onBatal?.(); }}
          placeholder={calon?.name ?? "Nama meja"} aria-label="Nama meja baru"
          className={`min-w-0 flex-1 rounded-lg border border-line bg-ink px-2.5 text-cream placeholder:text-dim focus:border-amber focus:outline-none ${
            ringkas ? "min-h-[36px] text-[13px]" : "min-h-[44px] text-[14px]"}`} />
        <button onClick={tambah} disabled={!calon}
          className={`rounded-lg bg-amber px-4 font-bold text-ink disabled:opacity-40 ${ringkas ? "min-h-[36px] text-[12px]" : "min-h-[44px] text-[13px]"}`}>
          + Tambah
        </button>
        {onBatal && (
          <button onClick={onBatal} className={`rounded-lg border border-line px-2.5 text-mute ${ringkas ? "min-h-[36px] text-[12px]" : "min-h-[44px] text-[13px]"}`}>
            Batal
          </button>
        )}
      </div>
      {!ringkas && (
        <p className="text-[11px] leading-relaxed text-dim">
          {calon
            ? <>Meja berikutnya dari katalog: <span className="text-cream">{calon.name}</span>
              {calon.lantai ? ` · lantai ${calon.lantai}` : ""} · {kategori.kelas ? CLASS_LABEL[kategori.kelas] : CLASS_LABEL[calon.type]} · {calon.capacity} kursi.
              Nama boleh dikosongkan. Langsung muncul di papan kasir dan booking tamu {VENUE_LABEL[venue]}.</>
            : "Semua meja katalog untuk pilihan ini sudah dipakai."}
        </p>
      )}
      {galat && <p role="alert" className="text-[12px] text-red-300">{galat}</p>}
    </div>
  );
}
