/**
 * GUDANG — Central · Billiard · Resto · Bar
 *
 * Susunannya mengikuti diagram roadmap 8 Okt 2026:
 *
 *            GUDANG CENTRAL
 *           ╱              ╲              GUDANG BAR
 *   Gudang Billiard   Gudang Resto       (berdiri sendiri)
 *
 * GUDANG BAR SENGAJA TIDAK DIPASOK CENTRAL. Itu permintaan pemilik, dan
 * mesinnya yang menegakkan (`bolehDariCentral`) — bukan layar ini. Jadi kalau
 * tombol kirim tidak muncul untuk barang bar, itu memang aturannya, bukan
 * tampilan yang lupa.
 *
 * Gudang sebuah barang ditentukan dari `station`-nya, bukan disimpan terpisah:
 * satu barang tidak mungkin ada di dua gudang penjualan sekaligus, dan
 * menyimpannya dua kali hanya menciptakan kemungkinan keduanya berbeda.
 *
 * TAMPILAN (perapian 14 Nov 2026, permintaan pemilik: "list barang masih
 * panjang, sulit mencari, tidak user friendly"):
 *   · Empat gudang tampil sebagai kartu ringkasan (jumlah barang, menipis, habis).
 *   · Penyaring: Semua / Menipis / Habis, dan venue tempat barang dijual.
 *   · Daftar dikelompokkan per kategori menu, dengan tombol lompat & lipat.
 *   · Satu tombol "Kelola" per barang membuka panel Tambah / Kurangi /
 *     Hitung ulang / Kirim — menggantikan deretan tombol kecil di tiap baris.
 *   · Jumlah bebas (bukan hanya 5/10/20) untuk tambah, kurangi, dan kirim.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  useAdmin, gudangDari, bolehDariCentral, semuaItem, itemOf, kategoriJual,
  type Gudang as JenisGudang,
} from "../../lib/adminStore";
import { VENUE_LABEL, type Venue } from "../../data/venue";
import type { MenuItem } from "../../data/menu";
import { KepalaHalaman, Kosong } from "./Tata";

const LABEL: Record<JenisGudang, string> = {
  central: "Gudang Central",
  billiard: "Gudang Billiard",
  resto: "Gudang Resto",
  bar: "Gudang Bar",
};
/** Satu baris penjelasan peran tiap gudang — tampil di kartunya. */
const PERAN: Record<JenisGudang, string> = {
  central: "Pemasok utama · kirim ke Billiard & Resto",
  billiard: "Barang counter kasir (rokok, botolan, snack)",
  resto: "Bahan & menu dapur",
  bar: "Minuman bar · berdiri sendiri, tidak dari Central",
};
const URUTAN: JenisGudang[] = ["central", "billiard", "resto", "bar"];

/**
 * Alasan pengurangan stok. WAJIB dipilih — dan itu bukan formalitas.
 *
 * Stok yang bisa dikurangi tanpa keterangan tidak bisa dibedakan dari barang
 * yang terjual saat opname: keduanya cuma angka yang mengecil. Satu alasan
 * per pengurangan adalah bedanya antara selisih yang bisa ditelusuri dan
 * selisih yang hanya bisa didiamkan.
 */
const ALASAN_KURANG = ["Salah input", "Barang rusak", "Susut / kedaluwarsa", "Dipakai sendiri", "Hasil opname"];

type Saring = "semua" | "menipis" | "habis" | "ada" | "kosong";
type Status = "habis" | "menipis" | "aman" | "kosong";
type Mode = "tambah" | "kurangi" | "hitung" | "kirim";

export default function Gudang() {
  const { a, dispatchA, allow } = useAdmin();
  const bolehUbah = allow("kelolaStok");
  // Termasuk barang tambahan pemilik — kalau tidak, barang itu punya stok
  // tapi tidak pernah muncul di layar gudang.
  const SEMUA_BARANG = semuaItem(a);
  const [pilih, setPilih] = useState<JenisGudang>("central");
  const [q, setQ] = useState("");
  const [saring, setSaring] = useState<Saring>("ada");
  const [venue, setVenue] = useState<Venue | "semua">("semua");
  const [lipat, setLipat] = useState<Set<string>>(new Set());
  const [kabar, setKabar] = useState<string | null>(null);
  /** Barang yang panel kelolanya sedang terbuka. */
  const [buka, setBuka] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("tambah");
  const [isi, setIsi] = useState("");
  const [alasan, setAlasan] = useState(ALASAN_KURANG[0]);
  const [lihatTakDilacak, setLihatTakDilacak] = useState(false);
  const [lacak, setLacak] = useState<string | null>(null);
  const [isiLacak, setIsiLacak] = useState("");

  const bilang = (t: string) => { setKabar(t); setTimeout(() => setKabar(null), 3500); };

  const central = a.gudangCentral ?? [];
  const barisCentral = (id: string) => central.find((r) => r.itemId === id);
  const qtyCentral = (id: string) => barisCentral(id)?.qty ?? 0;
  const barisOutlet = (id: string) => a.stock.find((r) => r.itemId === id);
  const qtyOutlet = (id: string) => barisOutlet(id)?.qty ?? null;
  const namaBarang = (id: string) => itemOf(a, id)?.name ?? id;

  /** Kategori menu tiap barang — dasar pengelompokan daftar. */
  const kategoriDari = useMemo(() => {
    const peta = new Map<string, string>();
    for (const c of kategoriJual(a, { staf: true })) for (const i of c.items) peta.set(i.id, c.name);
    return peta;
  }, [a.customItems]);

  /** Jumlah di gudang `g` (null = barang tidak dilacak di gudang itu). */
  const qtyDi = (id: string, g: JenisGudang) => (g === "central" ? qtyCentral(id) : qtyOutlet(id));
  const batasDi = (id: string, g: JenisGudang) => (g === "central" ? barisCentral(id)?.lowAt ?? 0 : barisOutlet(id)?.lowAt ?? 0);
  /** Central kosong itu wajar (pasokan belum masuk) — bukan "habis" yang perlu dicek. */
  const statusDi = (id: string, g: JenisGudang): Status => {
    const n = qtyDi(id, g) ?? 0;
    if (n <= 0) return g === "central" ? "kosong" : "habis";
    return n <= batasDi(id, g) ? "menipis" : "aman";
  };

  /** Barang yang tampil di gudang `g` (sebelum dicari & disaring). */
  const barangDi = (g: JenisGudang) => SEMUA_BARANG.filter((it) => (g === "central"
    // Central: tampilkan yang ada isinya, atau yang memang bisa dipasok.
    ? qtyCentral(it.id) > 0 || bolehDariCentral(it.id, a)
    : gudangDari(it.id, a) === g && qtyOutlet(it.id) !== null));

  const ringkas = useMemo(() => Object.fromEntries(URUTAN.map((g) => {
    const b = barangDi(g);
    return [g, {
      barang: b.length,
      menipis: b.filter((it) => statusDi(it.id, g) === "menipis").length,
      habis: b.filter((it) => statusDi(it.id, g) === "habis").length,
      kosong: b.filter((it) => statusDi(it.id, g) === "kosong").length,
      unit: b.reduce((n, it) => n + Math.max(0, qtyDi(it.id, g) ?? 0), 0),
    }];
  })) as Record<JenisGudang, { barang: number; menipis: number; habis: number; kosong: number; unit: number }>,
  [a.gudangCentral, a.stock, a.customItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const dasar = useMemo(() => barangDi(pilih), [pilih, a.gudangCentral, a.stock, a.customItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const daftar = useMemo(() => {
    const cari = q.trim().toLowerCase();
    return dasar
      .filter((it) => !cari || it.name.toLowerCase().includes(cari))
      .filter((it) => saring === "semua"
        || (saring === "ada" ? statusDi(it.id, pilih) !== "kosong" : statusDi(it.id, pilih) === saring))
      .filter((it) => venue === "semua" || !a.menuVenue?.[it.id] || a.menuVenue[it.id] === venue)
      .sort((x, y) => x.name.localeCompare(y.name, "id"));
  }, [dasar, q, saring, venue, a.menuVenue]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Daftar dikelompokkan per kategori, urutan kategori mengikuti buku menu. */
  const grup = useMemo(() => {
    const urut = [...new Set([...kategoriDari.values()])];
    const peta = new Map<string, MenuItem[]>();
    for (const it of daftar) {
      const k = kategoriDari.get(it.id) ?? "Lainnya";
      peta.set(k, [...(peta.get(k) ?? []), it]);
    }
    return [...peta.entries()].sort(([x], [y]) => {
      const ix = urut.indexOf(x), iy = urut.indexOf(y);
      return (ix < 0 ? 999 : ix) - (iy < 0 ? 999 : iy);
    });
  }, [daftar, kategoriDari]);

  const tidakDilacak = pilih === "central" ? []
    : SEMUA_BARANG.filter((it) => gudangDari(it.id, a) === pilih && qtyOutlet(it.id) === null)
      .sort((x, y) => x.name.localeCompare(y.name, "id"));

  // ── Aksi ──────────────────────────────────────────────────────────
  const diCentral = pilih === "central" ? { gudang: "central" as const } : {};

  function tambah(itemId: string, n: number) {
    dispatchA({ t: "addStock", itemId, delta: n, ...diCentral });
    bilang(`${namaBarang(itemId)} +${n} di ${LABEL[pilih]}.`);
  }

  /** Kurangi stok dengan alasan — outlet maupun Central. */
  function kurangi(itemId: string, n: number) {
    const ada = qtyDi(itemId, pilih) ?? 0;
    if (n > ada) { bilang(`Cuma ada ${ada}. Stok tidak bisa jadi minus.`); return; }
    dispatchA({ t: "addStock", itemId, delta: -n, reason: alasan, ...diCentral });
    bilang(`${namaBarang(itemId)} -${n} · ${alasan}`);
  }

  /** Hitung ulang: angka stok ditulis apa adanya (hasil hitung fisik). */
  function setel(itemId: string, n: number) {
    dispatchA({ t: "setStock", itemId, qty: n, ...diCentral });
    bilang(`${namaBarang(itemId)} diatur jadi ${n}.`);
  }

  function kirim(itemId: string, n: number) {
    const sebelum = qtyCentral(itemId);
    if (n > sebelum) { bilang(`Central cuma punya ${sebelum}. Kirim memindah barang, bukan membuat.`); return; }
    dispatchA({ t: "transferStock", itemId, qty: n });
    bilang(`${n} ${namaBarang(itemId)} dikirim ke ${LABEL[gudangDari(itemId, a)]}.`);
  }

  function jalankan(itemId: string, n: number) {
    if (mode === "tambah") tambah(itemId, n);
    else if (mode === "kurangi") kurangi(itemId, n);
    else if (mode === "kirim") kirim(itemId, n);
    else setel(itemId, n);
  }

  function bukaPanel(id: string) {
    if (buka === id) { setBuka(null); return; }
    setBuka(id); setIsi(""); setMode("tambah");
  }

  const pindahGudang = (g: JenisGudang) => { setPilih(g); setBuka(null); setSaring(g === "central" ? "ada" : "semua"); setLipat(new Set()); };
  const r = ringkas[pilih];

  return (
    <div className="space-y-4 pb-24">
      <KepalaHalaman judul="Gudang"
        ket={<>Pilih gudang di bawah, cari barangnya, lalu tekan <span className="text-cream">Kelola</span> untuk
          menambah, mengurangi, menghitung ulang, atau mengirim dari Central.</>}
        angka={pilih === "central" ? [
          { label: "Barang ada isi", nilai: r.barang - r.kosong },
          { label: "Total unit", nilai: r.unit.toLocaleString("id-ID") },
          { label: "Bisa dipasok, masih kosong", nilai: r.kosong },
        ] : [
          { label: `Barang · ${LABEL[pilih].replace("Gudang ", "")}`, nilai: r.barang },
          { label: "Total unit", nilai: r.unit.toLocaleString("id-ID") },
          { label: "Menipis", nilai: r.menipis, nada: r.menipis ? "amber" : undefined },
          { label: "Habis", nilai: r.habis, nada: r.habis ? "merah" : undefined },
        ]} />

      {/* ── KARTU GUDANG ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label="Pilih gudang">
        {URUTAN.map((g) => {
          const x = ringkas[g];
          const aktif = pilih === g;
          return (
            <button key={g} role="tab" aria-selected={aktif} onClick={() => pindahGudang(g)} aria-label={LABEL[g]}
              className={`rounded-2xl border p-3 text-left transition-colors ${
                aktif ? "border-amber bg-amber/10" : "border-line bg-ink-2 hover:border-amber/50"
              }`}>
              <div className={`font-display text-[15px] uppercase tracking-wide ${aktif ? "text-amber" : "text-cream"}`}>
                {LABEL[g]}
              </div>
              <div className="mt-0.5 line-clamp-2 min-h-[28px] text-[11px] leading-snug text-dim">{PERAN[g]}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-ink px-2 py-0.5 tabular-nums text-mute">
                  {g === "central" ? `${x.barang - x.kosong} ada isi` : `${x.barang} barang`}
                </span>
                {x.menipis > 0 && <span className="rounded-full bg-amber/15 px-2 py-0.5 font-semibold text-amber">{x.menipis} menipis</span>}
                {x.habis > 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-300">{x.habis} habis</span>}
              </div>
            </button>
          );
        })}
      </div>

      {pilih === "bar" && (
        <p className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-[12px] leading-relaxed text-mute">
          Gudang Bar <span className="text-cream">berdiri sendiri</span> — tidak dipasok Gudang Central.
          Barang masuk dicatat langsung di sini dengan <span className="text-cream">Kelola → Tambah</span>.
        </p>
      )}
      {pilih === "central" && (
        <p className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-[12px] leading-relaxed text-mute">
          Stok Central adalah pasokan yang <span className="text-cream">belum dikeluarkan</span> ke outlet.
          Kirim ke Gudang Billiard atau Resto lewat <span className="text-cream">Kelola → Kirim</span>.
        </p>
      )}

      {/* ── CARI & SARING (menempel di atas saat menggulir) ── */}
      <div className="sticky top-[104px] z-20 -mx-4 space-y-2 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur-md">
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cari barang di ${LABEL[pilih]}…`}
            aria-label="Cari barang"
            className="w-full rounded-xl border border-line bg-ink-2 px-4 py-2.5 pr-10 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Hapus pencarian"
              className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-mute hover:text-cream">×</button>
          )}
        </div>
        <div className="no-bar flex items-center gap-1.5 overflow-x-auto">
          {(pilih === "central"
            ? [["ada", `Ada isi · ${r.barang - r.kosong}`], ["kosong", `Kosong · ${r.kosong}`], ["semua", `Semua · ${r.barang}`]] as const
            : [["semua", `Semua · ${r.barang}`], ["menipis", `Menipis · ${r.menipis}`], ["habis", `Habis · ${r.habis}`]] as const)
            .map(([v, l]) => (
              <button key={v} onClick={() => setSaring(v)} aria-pressed={saring === v}
                className={`min-h-[34px] shrink-0 rounded-lg px-3 text-[12px] font-semibold ${
                  saring === v
                    ? v === "habis" ? "bg-red-500/80 text-cream" : v === "menipis" ? "bg-amber text-ink" : "bg-cream text-ink"
                    : "bg-ink-2 text-mute hover:text-cream"
                }`}>{l}</button>
            ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          {([["semua", "Semua venue"], ["spl", VENUE_LABEL.spl], ["smh", VENUE_LABEL.smh]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setVenue(v)} aria-pressed={venue === v}
              className={`min-h-[34px] shrink-0 rounded-lg border px-3 text-[12px] ${
                venue === v ? "border-amber bg-amber/10 text-amber" : "border-line text-mute hover:text-cream"
              }`}>{l}</button>
          ))}
        </div>
        {grup.length > 1 && (
          <div className="no-bar flex gap-1.5 overflow-x-auto" aria-label="Lompat ke kategori">
            {grup.map(([k, items]) => (
              <button key={k}
                onClick={() => document.getElementById(`gudang-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-mute hover:border-amber hover:text-amber">
                {k} <span className="text-dim">{items.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {kabar && (
        <p role="status" className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">{kabar}</p>
      )}

      {/* ── DAFTAR PER KATEGORI ── */}
      {grup.length === 0 ? (
        <Kosong teks={dasar.length === 0
          ? (pilih === "central" ? "Gudang Central masih kosong." : "Belum ada barang dilacak di gudang ini.")
          : pilih === "central" && saring === "ada" && !q
            ? "Gudang Central masih kosong. Pilih \"Kosong\" di atas untuk mengisi barang yang baru datang."
            : "Tidak ada barang yang cocok dengan pencarian atau saringan."} />
      ) : (
        <div className="space-y-4">
          {grup.map(([k, items]) => {
            const terlipat = lipat.has(k) && !q;
            const masalah = items.filter((it) => { const x = statusDi(it.id, pilih); return x === "habis" || x === "menipis"; }).length;
            return (
              <section key={k} id={`gudang-${k}`} className="scroll-mt-[220px]">
                <button onClick={() => setLipat((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
                  aria-expanded={!terlipat} aria-label={`Kategori ${k}, ${items.length} barang`}
                  className="mb-2 flex w-full items-center gap-2 text-left">
                  <span className={`text-[11px] text-dim transition-transform ${terlipat ? "" : "rotate-90"}`}>▶</span>
                  <h2 className="font-display text-[15px] uppercase tracking-wide text-cream">{k}</h2>
                  <span className="text-[11px] text-dim">{items.length} barang</span>
                  {masalah > 0 && <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold text-amber">{masalah} perlu dicek</span>}
                  <span className="ml-2 h-px flex-1 bg-line" />
                </button>
                {!terlipat && (
                  <div className="grid gap-1.5 lg:grid-cols-2">
                    {items.map((it) => (
                      <Baris key={it.id} it={it} pilih={pilih}
                        qty={qtyDi(it.id, pilih)} status={statusDi(it.id, pilih)}
                        qtyCentral={qtyCentral(it.id)} qtyOutlet={qtyOutlet(it.id)}
                        tujuan={gudangDari(it.id, a)} bolehKirim={bolehDariCentral(it.id, a)}
                        venueJual={a.menuVenue?.[it.id]}
                        bolehUbah={bolehUbah} terbuka={buka === it.id} onBuka={() => bukaPanel(it.id)}>
                        {buka === it.id && bolehUbah && (
                          <PanelKelola pilih={pilih} mode={mode} setMode={(m) => { setMode(m); setIsi(""); }}
                            isi={isi} setIsi={setIsi} alasan={alasan} setAlasan={setAlasan}
                            qty={qtyDi(it.id, pilih) ?? 0} qtyCentral={qtyCentral(it.id)}
                            bolehKirim={pilih === "central" && bolehDariCentral(it.id, a)}
                            tujuan={LABEL[gudangDari(it.id, a)]}
                            onJalan={(n) => jalankan(it.id, n)} onTutup={() => setBuka(null)} />
                        )}
                      </Baris>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ── BARANG BELUM DILACAK ── */}
      {tidakDilacak.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line p-3">
          <button onClick={() => setLihatTakDilacak((v) => !v)} aria-expanded={lihatTakDilacak}
            className="flex w-full items-center gap-2 text-left">
            <span className={`text-[11px] text-dim transition-transform ${lihatTakDilacak ? "rotate-90" : ""}`}>▶</span>
            <span className="text-[12px] text-mute">
              {tidakDilacak.length} barang di {LABEL[pilih]} belum dilacak stoknya
            </span>
          </button>
          {lihatTakDilacak && (
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {tidakDilacak.map((it) => (
                <div key={it.id} className="flex items-center gap-2 rounded-lg bg-ink-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-cream">{it.name}</span>
                  {/* Jumlah awal wajib diisi: stok 0 langsung menandai menunya habis. */}
                  {bolehUbah && (lacak === it.id ? (
                    <>
                      <input autoFocus value={isiLacak} inputMode="numeric" placeholder="jumlah"
                        onChange={(e) => setIsiLacak(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                        aria-label={`Jumlah awal ${it.name}`}
                        className="h-8 w-20 rounded-lg border border-line bg-ink px-2 text-center text-[12px] tabular-nums text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
                      <button disabled={isiLacak === ""}
                        onClick={() => {
                          const n = Math.floor(Number(isiLacak));
                          dispatchA({ t: "setStock", itemId: it.id, qty: n });
                          bilang(`${it.name} mulai dilacak dengan stok ${n}.`);
                          setLacak(null); setIsiLacak("");
                        }}
                        className="h-8 shrink-0 rounded-lg bg-amber px-2.5 text-[11px] font-bold text-ink disabled:opacity-35">Simpan</button>
                    </>
                  ) : (
                    <button onClick={() => { setLacak(it.id); setIsiLacak(""); }}
                      className="h-8 shrink-0 rounded-lg border border-line px-2.5 text-[11px] text-mute hover:border-amber hover:text-amber">
                      Mulai lacak
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 text-[11px] leading-relaxed text-dim">
        <p>
          <span className="text-cream">Kurangi</span> wajib memilih alasan, dan alasannya tercatat di jejak bersama
          nama petugasnya — stok yang berkurang tanpa keterangan tidak bisa dibedakan dari barang terjual saat opname.
          <span className="text-cream"> Hitung ulang</span> menulis angka hasil hitung fisik apa adanya.
        </p>
        <p>
          <span className="text-cream">Kirim</span> memindahkan barang, tidak membuat yang baru — jumlah Central ditambah
          outlet selalu tetap, dan kiriman yang melebihi isi Central ditolak. Tiap perpindahan tercatat di laporan stok.
          Penyaring venue memakai pengaturan "Dijual di" di Menu &amp; Stok.
        </p>
      </div>
    </div>
  );
}

/** Satu barang: nama, keterangan, jumlah besar berwarna, dan tombol Kelola. */
function Baris({
  it, pilih, qty, status, qtyCentral, qtyOutlet, tujuan, bolehKirim, venueJual, bolehUbah, terbuka, onBuka, children,
}: {
  it: MenuItem; pilih: JenisGudang; qty: number | null; status: Status;
  qtyCentral: number; qtyOutlet: number | null; tujuan: JenisGudang; bolehKirim: boolean; venueJual?: Venue;
  bolehUbah: boolean; terbuka: boolean; onBuka: () => void; children?: ReactNode;
}) {
  const warna = status === "habis" ? "text-red-300" : status === "menipis" ? "text-amber" : status === "kosong" ? "text-dim" : "text-cream";
  return (
    <div className={`rounded-xl border bg-ink-2 ${
      terbuka ? "border-amber/60 lg:col-span-2" : status === "habis" ? "border-red-500/35" : status === "menipis" ? "border-amber/35" : "border-line"
    }`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] text-cream">{it.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-dim">
            {pilih === "central"
              ? bolehKirim
                ? <span>→ {LABEL[tujuan].replace("Gudang ", "")} · di sana {qtyOutlet ?? "tidak dilacak"}</span>
                : <span>Bar berdiri sendiri</span>
              : bolehKirim ? <span>di Central {qtyCentral}</span> : <span>tidak dipasok Central</span>}
            {venueJual && (
              <span className="rounded-full border border-amber/40 px-1.5 text-[10px] font-semibold text-amber">
                {VENUE_LABEL[venueJual]}
              </span>
            )}
            {(status === "habis" || status === "menipis") && (
              <span className={`text-[10px] font-bold uppercase ${warna}`}>{status === "habis" ? "habis" : "menipis"}</span>
            )}
          </div>
        </div>
        <span className={`shrink-0 font-serif text-2xl font-bold tabular-nums ${warna}`}>{qty ?? "—"}</span>
        {bolehUbah && (
          <button onClick={onBuka} aria-expanded={terbuka}
            className={`h-10 shrink-0 rounded-lg border px-3 text-[12px] font-semibold ${
              terbuka ? "border-amber bg-amber text-ink" : "border-line text-mute hover:border-amber hover:text-amber"
            }`}>
            {terbuka ? "Tutup" : "Kelola"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** Panel kelola satu barang: pilih aksi, pilih/isi jumlah, jalankan. */
function PanelKelola({
  pilih, mode, setMode, isi, setIsi, alasan, setAlasan, qty, qtyCentral, bolehKirim, tujuan, onJalan, onTutup,
}: {
  pilih: JenisGudang; mode: Mode; setMode: (m: Mode) => void; isi: string; setIsi: (s: string) => void;
  alasan: string; setAlasan: (s: string) => void; qty: number; qtyCentral: number;
  bolehKirim: boolean; tujuan: string; onJalan: (n: number) => void; onTutup: () => void;
}) {
  const pilihan: [Mode, string][] = [
    ["tambah", "Tambah"], ["kurangi", "Kurangi"], ["hitung", "Hitung ulang"],
    ...(bolehKirim ? [["kirim", `Kirim ke ${tujuan.replace("Gudang ", "")}`] as [Mode, string]] : []),
  ];
  const n = Math.floor(Number(isi));
  const angkaSah = isi.trim() !== "" && Number.isFinite(n) && (mode === "hitung" ? n >= 0 : n > 0);
  const batas = mode === "kurangi" ? qty : mode === "kirim" ? qtyCentral : Infinity;
  const kelebihan = angkaSah && n > batas;
  const cepat = mode === "kurangi" ? [1, 5, 10] : [5, 10, 20, 50];
  const sesudah = !angkaSah ? null
    : mode === "tambah" ? qty + n : mode === "kurangi" ? qty - n : mode === "kirim" ? qtyCentral - n : n;
  const label = { tambah: "Tambah", kurangi: "Kurangi", hitung: "Simpan hitungan", kirim: "Kirim" }[mode];

  return (
    <div className="border-t border-amber/30 bg-amber/5 px-3 py-3">
      <div className="grid grid-cols-2 gap-1 sm:flex" role="radiogroup" aria-label="Pilih aksi stok">
        {pilihan.map(([m, l]) => (
          <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
            className={`min-h-[38px] rounded-lg px-3 text-[12px] font-semibold sm:flex-1 ${
              mode === m
                ? m === "kurangi" ? "bg-red-500/80 text-cream" : m === "kirim" ? "bg-emerald-500/80 text-ink" : "bg-amber text-ink"
                : "border border-line bg-ink text-mute hover:text-cream"
            }`}>{l}</button>
        ))}
      </div>

      {mode === "kurangi" && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wider text-dim">Alasan (wajib)</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {ALASAN_KURANG.map((r) => (
              <button key={r} onClick={() => setAlasan(r)} aria-pressed={alasan === r}
                className={`h-8 rounded-lg border px-2.5 text-[11px] ${
                  alasan === r ? "border-red-400 bg-red-500/15 text-red-200" : "border-line bg-ink text-mute"
                }`}>{r}</button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 text-[11px] uppercase tracking-wider text-dim">
        {mode === "hitung" ? "Jumlah hasil hitung fisik" : "Jumlah"}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {mode !== "hitung" && cepat.map((c) => (
          <button key={c} onClick={() => setIsi(String(c))} disabled={c > batas}
            className={`h-10 min-w-[44px] rounded-lg border px-2.5 text-[13px] tabular-nums disabled:opacity-30 ${
              isi === String(c) ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
            }`}>{c}</button>
        ))}
        <input value={isi} inputMode="numeric"
          onChange={(e) => setIsi(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
          placeholder={mode === "hitung" ? String(qty) : "lainnya"} aria-label="Jumlah"
          className="h-10 w-24 rounded-lg border border-line bg-ink px-2 text-center text-[14px] tabular-nums text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 text-[12px] text-mute">
          {kelebihan
            ? <span className="text-red-300">{mode === "kirim" ? "Central" : "Stok"} cuma {batas}.</span>
            : sesudah !== null
              ? <>{mode === "kirim" ? "Central" : pilih === "central" ? "Central" : "Stok"}: {mode === "kirim" ? qtyCentral : qty}
                  {" → "}<span className="font-bold text-cream">{sesudah}</span></>
              : <span className="text-dim">Pilih atau ketik jumlahnya.</span>}
        </div>
        <button onClick={onTutup} className="h-10 rounded-lg border border-line px-3 text-[12px] text-mute">Batal</button>
        <button disabled={!angkaSah || kelebihan} onClick={() => { onJalan(n); setIsi(""); }}
          className={`h-10 rounded-lg px-4 text-[13px] font-bold disabled:opacity-35 ${
            mode === "kurangi" ? "bg-red-500/85 text-cream" : mode === "kirim" ? "bg-emerald-500 text-ink" : "bg-amber text-ink"
          }`}>{label}</button>
      </div>
    </div>
  );
}
