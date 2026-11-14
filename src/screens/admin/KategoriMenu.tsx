/**
 * KATEGORI MENU — diatur pemilik (15 Nov 2026).
 *
 * Permintaan: "filter makanan ini ada menu edit-nya yang menentukan kategori
 * makanan, yang nanti juga berpengaruh ke tampilan pemesanan, jadi bisa
 * di-set up kalau ada tambahan dan yang diganti."
 *
 * Yang bisa diatur, dan langsung berlaku di layar pesan kasir, Counter, dan
 * menu HP tamu:
 *   · ganti nama kategori, buat kategori baru, hapus kategori buatan sendiri
 *     (yang sudah kosong — menu tidak boleh hilang karena kategorinya dihapus);
 *   · urutan kategori (naik/turun);
 *   · kelompok di layar pesan: Dapur · Makanan / Bar · Minuman / Counter;
 *   · memindah menu ke kategori lain.
 * Semua lewat mesin, jadi tercatat di Jejak dan sama di semua perangkat.
 */
import { useState } from "react";
import { useAdmin, susunKategori, type GrupMenu } from "../../lib/adminStore";
import { grupKategori } from "./PilihMenu";
import { JudulBagian, Kosong } from "./Tata";

const LABEL_GRUP: Record<GrupMenu, string> = { kitchen: "Dapur · Makanan", bar: "Bar · Minuman", billiard: "Counter" };

export default function KategoriMenu() {
  const { a, dispatchA, peek } = useAdmin();
  const daftar = susunKategori(a, { staf: true });
  const atur = a.aturKategori;
  const [buka, setBuka] = useState<string | null>(null);
  const [ubahNama, setUbahNama] = useState<{ id: string; nama: string } | null>(null);
  const [baruNama, setBaruNama] = useState("");
  const [baruGrup, setBaruGrup] = useState<GrupMenu>("kitchen");
  const [kabar, setKabar] = useState<{ teks: string; baik: boolean } | null>(null);
  const bilang = (teks: string, baik = true) => { setKabar({ teks, baik }); setTimeout(() => setKabar(null), 4500); };

  /** Kirim aksi, lalu baca dari mesin apakah benar berubah. */
  function kirim(aksi: Parameters<typeof dispatchA>[0], berhasil: string, gagal: string) {
    const sebelum = JSON.stringify(peek().aturKategori ?? null);
    dispatchA(aksi);
    const sesudah = JSON.stringify(peek().aturKategori ?? null);
    bilang(sebelum !== sesudah ? berhasil : gagal, sebelum !== sesudah);
  }

  function geser(i: number, arah: -1 | 1) {
    const ids = daftar.map((c) => c.id);
    const j = i + arah;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    dispatchA({ t: "urutKategori", urutan: ids });
  }

  function buat() {
    const nama = baruNama.trim();
    if (!nama) return;
    const slug = nama.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "kategori";
    const id = `k-${slug}-${Date.now().toString(36).slice(-4)}`;
    kirim({ t: "buatKategori", id, nama, grup: baruGrup },
      `Kategori "${nama}" dibuat. Pindahkan menu ke dalamnya lewat tombol "Isi".`,
      "Kategori tidak dibuat — namanya sudah dipakai atau tidak sah.");
    setBaruNama("");
    setBuka(id);
  }

  function simpanNama() {
    if (!ubahNama) return;
    kirim({ t: "ubahKategori", id: ubahNama.id, nama: ubahNama.nama },
      "Nama kategori disimpan.", "Nama tidak berubah — kosong atau sudah dipakai kategori lain.");
    setUbahNama(null);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-line bg-ink-2 p-3">
        <JudulBagian judul="Kategori baru" />
        <div className="flex flex-wrap gap-2">
          <input value={baruNama} onChange={(e) => setBaruNama(e.target.value.slice(0, 40))}
            onKeyDown={(e) => { if (e.key === "Enter") buat(); }}
            placeholder="Nama kategori, mis. Menu Spesial" aria-label="Nama kategori baru"
            className="min-h-[44px] min-w-[200px] flex-1 rounded-xl border border-line bg-ink px-3 text-[14px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
          <select value={baruGrup} onChange={(e) => setBaruGrup(e.target.value as GrupMenu)} aria-label="Kelompok kategori baru"
            className="min-h-[44px] rounded-xl border border-line bg-ink px-3 text-[13px] text-cream">
            {(Object.keys(LABEL_GRUP) as GrupMenu[]).map((g) => <option key={g} value={g}>{LABEL_GRUP[g]}</option>)}
          </select>
          <button onClick={buat} disabled={!baruNama.trim()}
            className="min-h-[44px] rounded-xl bg-amber px-4 text-[13px] font-bold text-ink disabled:opacity-35">+ Buat kategori</button>
        </div>
      </div>

      {kabar && (
        <p role="status" className={`rounded-xl border px-3 py-2 text-[12px] ${
          kabar.baik ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber/40 bg-amber/10 text-amber"
        }`}>{kabar.teks}</p>
      )}

      <div>
        <JudulBagian judul="Urutan & isi kategori" jumlah={daftar.length}
          aksi={atur && (
            <button onClick={() => {
              if (!confirm("Kembalikan semua kategori ke susunan buku menu? Nama, urutan, kelompok, kategori baru, dan menu yang dipindah akan dihapus.")) return;
              kirim({ t: "resetKategori" }, "Kategori kembali ke susunan buku menu.", "Tidak ada yang berubah.");
            }} className="text-[12px] text-dim underline underline-offset-2 hover:text-red-300">
              Kembalikan ke susunan awal
            </button>
          )} />
        {daftar.length === 0 ? <Kosong teks="Belum ada kategori." /> : (
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ink-2">
            {daftar.map((c, i) => {
              const diatur = atur?.kategori[c.id];
              const grupKini = grupKategori(c);
              return (
                <div key={c.id}>
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <div className="flex flex-col">
                      <button onClick={() => geser(i, -1)} disabled={i === 0} aria-label={`Naikkan ${c.name}`}
                        className="h-6 w-8 rounded-t-lg border border-line text-[11px] text-mute hover:text-amber disabled:opacity-25">▲</button>
                      <button onClick={() => geser(i, 1)} disabled={i === daftar.length - 1} aria-label={`Turunkan ${c.name}`}
                        className="h-6 w-8 rounded-b-lg border border-t-0 border-line text-[11px] text-mute hover:text-amber disabled:opacity-25">▼</button>
                    </div>
                    <div className="min-w-[160px] flex-1">
                      {ubahNama?.id === c.id ? (
                        <div className="flex gap-1.5">
                          <input autoFocus value={ubahNama.nama} onChange={(e) => setUbahNama({ id: c.id, nama: e.target.value.slice(0, 40) })}
                            onKeyDown={(e) => { if (e.key === "Enter") simpanNama(); if (e.key === "Escape") setUbahNama(null); }}
                            aria-label="Nama kategori"
                            className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-amber bg-ink px-2 text-[13px] text-cream focus:outline-none" />
                          <button onClick={simpanNama} className="min-h-[36px] rounded-lg bg-amber px-3 text-[12px] font-bold text-ink">Simpan</button>
                          <button onClick={() => setUbahNama(null)} className="min-h-[36px] px-2 text-[12px] text-dim">batal</button>
                        </div>
                      ) : (
                        <button onClick={() => setUbahNama({ id: c.id, nama: c.name })} className="text-left" title="Ketuk untuk mengganti nama">
                          <span className="text-[14px] font-semibold text-cream">{c.name}</span>
                          <span className="ml-2 text-[11px] text-dim">{c.items.length} menu</span>
                          {diatur?.baru && <span className="ml-2 rounded bg-amber/15 px-1.5 text-[10px] font-bold text-amber">BARU</span>}
                          {c.staffOnly && <span className="ml-2 rounded bg-ink px-1.5 text-[10px] text-dim">kasir saja</span>}
                          <span className="ml-2 text-[11px] text-dim underline underline-offset-2">ubah nama</span>
                        </button>
                      )}
                    </div>
                    <select value={diatur?.grup ?? ""} aria-label={`Kelompok ${c.name}`}
                      onChange={(e) => kirim({ t: "ubahKategori", id: c.id, grup: (e.target.value || null) as GrupMenu | null },
                        `Kelompok "${c.name}" disimpan.`, "Kelompok tidak berubah.")}
                      className="min-h-[36px] rounded-lg border border-line bg-ink px-2 text-[12px] text-cream">
                      <option value="">Otomatis ({LABEL_GRUP[grupKini]})</option>
                      {(Object.keys(LABEL_GRUP) as GrupMenu[]).map((g) => <option key={g} value={g}>{LABEL_GRUP[g]}</option>)}
                    </select>
                    <button onClick={() => setBuka(buka === c.id ? null : c.id)} aria-expanded={buka === c.id}
                      className={`min-h-[36px] rounded-lg border px-3 text-[12px] font-semibold ${
                        buka === c.id ? "border-amber bg-amber text-ink" : "border-line text-mute hover:border-amber hover:text-amber"
                      }`}>{buka === c.id ? "Tutup" : "Isi"}</button>
                    {diatur?.baru && c.items.length === 0 && (
                      <button onClick={() => kirim({ t: "hapusKategori", id: c.id }, `Kategori "${c.name}" dihapus.`, "Kategori tidak bisa dihapus.")}
                        className="min-h-[36px] rounded-lg border border-line px-3 text-[12px] text-red-300 hover:border-red-400">Hapus</button>
                    )}
                  </div>
                  {buka === c.id && (
                    <div className="border-t border-line bg-ink/60 px-3 py-2.5">
                      {c.items.length === 0 ? (
                        <p className="text-[12px] text-dim">
                          Kategori ini masih kosong — tidak tampil di layar pesan. Buka kategori lain, lalu pindahkan menunya ke sini.
                        </p>
                      ) : (
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {c.items.map((it) => (
                            <div key={it.id} className="flex items-center gap-2 rounded-lg bg-ink-2 px-2.5 py-1.5">
                              <span className="min-w-0 flex-1 truncate text-[12px] text-cream">
                                {it.name}
                                {atur?.pindah[it.id] && <span className="ml-1 text-[10px] text-amber">dipindah</span>}
                              </span>
                              <select value={c.id} aria-label={`Pindahkan ${it.name}`}
                                onChange={(e) => {
                                  const ke = daftar.find((x) => x.id === e.target.value);
                                  kirim({ t: "pindahMenuKategori", itemId: it.id, kategoriId: e.target.value },
                                    `${it.name} dipindah ke ${ke?.name ?? "kategori lain"}.`, "Menu tidak dipindah.");
                                }}
                                className="min-h-[32px] max-w-[150px] rounded-lg border border-line bg-ink px-1.5 text-[11px] text-mute">
                                {daftar.map((x) => <option key={x.id} value={x.id}>{x.id === c.id ? "Pindah ke…" : x.name}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-dim">
        Kategori yang kosong tidak tampil di layar pesan. Kelompok menentukan letaknya di tombol
        Dapur · Makanan / Bar · Minuman / Counter saat memesan. Menu "kasir saja" (mis. rokok) tetap tidak tampil
        di HP tamu walau dipindah ke kategori lain. Semua perubahan tercatat di Jejak.
      </p>
    </section>
  );
}
