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
 * tombol transfer tidak muncul untuk barang bar, itu memang aturannya, bukan
 * tampilan yang lupa.
 *
 * Gudang sebuah barang ditentukan dari `station`-nya, bukan disimpan terpisah:
 * satu barang tidak mungkin ada di dua gudang penjualan sekaligus, dan
 * menyimpannya dua kali hanya menciptakan kemungkinan keduanya berbeda.
 */
import { useMemo, useState } from "react";
import {
  useAdmin, gudangDari, bolehDariCentral, semuaItem, itemOf,
  type Gudang as JenisGudang,
} from "../../lib/adminStore";

import { PageHeader } from "../../components/UI";

const LABEL: Record<JenisGudang, string> = {
  central: "Gudang Central",
  billiard: "Gudang Billiard",
  resto: "Gudang Resto",
  bar: "Gudang Bar",
};

/**
 * Alasan pengurangan stok. WAJIB dipilih — dan itu bukan formalitas.
 *
 * Stok yang bisa dikurangi tanpa keterangan tidak bisa dibedakan dari barang
 * yang terjual saat opname: keduanya cuma angka yang mengecil. Satu alasan
 * per pengurangan adalah bedanya antara selisih yang bisa ditelusuri dan
 * selisih yang hanya bisa didiamkan.
 */
const ALASAN_KURANG = ["Salah input", "Barang rusak", "Susut / kedaluwarsa", "Dipakai sendiri", "Hasil opname"];

export default function Gudang() {
  const { a, dispatchA, allow } = useAdmin();
  // Termasuk barang tambahan pemilik — kalau tidak, barang itu punya stok
  // tapi tidak pernah muncul di layar gudang.
  const SEMUA_BARANG = semuaItem(a);
  const [pilih, setPilih] = useState<JenisGudang>("central");
  const [q, setQ] = useState("");
  const [kabar, setKabar] = useState<string | null>(null);
  /** Barang yang panel koreksinya sedang terbuka. */
  const [koreksi, setKoreksi] = useState<string | null>(null);
  const [isi, setIsi] = useState("");
  const [alasan, setAlasan] = useState(ALASAN_KURANG[0]);

  const bilang = (t: string) => { setKabar(t); setTimeout(() => setKabar(null), 3500); };

  const central = a.gudangCentral ?? [];
  const qtyCentral = (id: string) => central.find((r) => r.itemId === id)?.qty ?? 0;
  const qtyOutlet = (id: string) => a.stock.find((r) => r.itemId === id)?.qty ?? null;

  const daftar = useMemo(() => {
    const cari = q.trim().toLowerCase();
    return SEMUA_BARANG
      .filter((it) => (pilih === "central" ? true : gudangDari(it.id, a) === pilih))
      .filter((it) => !cari || it.name.toLowerCase().includes(cari))
      .filter((it) => (pilih === "central"
        // Central: tampilkan yang ada isinya, atau yang memang bisa dipasok.
        ? qtyCentral(it.id) > 0 || bolehDariCentral(it.id, a)
        : qtyOutlet(it.id) !== null))
      .sort((x, y) => x.name.localeCompare(y.name, "id"));
  }, [pilih, q, a.gudangCentral, a.stock]);

  const namaBarang = (id: string) => itemOf(a, id)?.name ?? id;

  /** Kurangi stok dengan alasan — outlet maupun Central. */
  function kurangi(itemId: string, n: number, dimana: JenisGudang) {
    const ada = dimana === "central" ? qtyCentral(itemId) : (qtyOutlet(itemId) ?? 0);
    if (n > ada) { bilang(`Cuma ada ${ada}. Stok tidak bisa jadi minus.`); return; }
    dispatchA({
      t: "addStock", itemId, delta: -n, reason: alasan,
      ...(dimana === "central" ? { gudang: "central" as const } : {}),
    });
    bilang(`${namaBarang(itemId)} -${n} · ${alasan}`);
  }

  /** Isi manual: angka stok ditulis apa adanya (hasil hitung fisik). */
  function setel(itemId: string, dimana: JenisGudang) {
    const n = Math.floor(Number(isi));
    if (!Number.isFinite(n) || n < 0 || isi.trim() === "") { bilang("Isi angkanya dulu, minimal 0."); return; }
    dispatchA({
      t: "setStock", itemId, qty: n,
      ...(dimana === "central" ? { gudang: "central" as const } : {}),
    });
    setIsi(""); setKoreksi(null);
    bilang(`${namaBarang(itemId)} diatur jadi ${n}.`);
  }

  function transfer(itemId: string, qty: number) {
    const sebelum = qtyCentral(itemId);
    if (qty > sebelum) { bilang(`Central cuma punya ${sebelum}. Transfer memindah barang, bukan membuat.`); return; }
    dispatchA({ t: "transferStock", itemId, qty });
  }

  const tidakDilacak = pilih !== "central"
    && SEMUA_BARANG.filter((it) => gudangDari(it.id, a) === pilih && qtyOutlet(it.id) === null).length;

  return (
    <div className="pb-24">
      <PageHeader kicker="Persediaan" title="Gudang"
        sub={pilih === "central" ? "pasokan yang belum dikeluarkan" : "stok siap jual"} />

      <div className="mx-auto max-w-3xl px-4 pt-4 lg:max-w-6xl">
        <div className="no-bar flex gap-1.5 overflow-x-auto">
          {(["central", "billiard", "resto", "bar"] as JenisGudang[]).map((g) => (
            <button key={g} onClick={() => setPilih(g)} aria-pressed={pilih === g}
              className={`shrink-0 rounded-lg border px-3 py-2 text-[12px] font-semibold ${
                pilih === g ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
              }`}>
              {LABEL[g]}
            </button>
          ))}
        </div>

        {pilih === "bar" && (
          <p className="mt-2 rounded-lg border border-line bg-ink-2 px-3 py-2 text-[11px] leading-relaxed text-dim">
            Gudang Bar <span className="text-cream">berdiri sendiri</span> — tidak dipasok Gudang Central.
            Barang masuknya dicatat langsung di tab Menu &amp; Stok.
          </p>
        )}

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari barang…"
          className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-2.5 text-cream placeholder:text-dim focus:border-amber focus:outline-none" />

        {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}

        {daftar.length === 0 ? (
          <div className="mt-3 rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
            {pilih === "central" ? "Gudang Central masih kosong." : "Belum ada barang dilacak di gudang ini."}
          </div>
        ) : (
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
            {daftar.map((it) => {
              const diCentral = qtyCentral(it.id);
              const diOutlet = qtyOutlet(it.id);
              const tujuan = gudangDari(it.id, a);
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-cream">{it.name}</div>
                    <div className="text-[11px] text-dim">
                      {pilih === "central"
                        ? <>tujuan {LABEL[tujuan]} · di outlet {diOutlet ?? "—"}</>
                        : <>di Central {diCentral}</>}
                    </div>
                  </div>

                  <span className="shrink-0 font-serif text-lg font-bold tabular-nums text-cream">
                    {pilih === "central" ? diCentral : diOutlet ?? "—"}
                  </span>

                  {/* TAMBAH CEPAT — berlaku di Central MAUPUN outlet
                      (permintaan pemilik 18 Okt 2026: panel Gudang Resto,
                      Gudang Bar, dan Counter juga bisa diubah manual). */}
                  {allow("kelolaStok") && (
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {[5, 10, 20].map((n) => (
                        <button key={n}
                          onClick={() => dispatchA({
                            t: "addStock", itemId: it.id, delta: n,
                            ...(pilih === "central" ? { gudang: "central" as const } : {}),
                          })}
                          className="h-8 rounded-lg border border-line px-2 text-[11px] text-mute hover:border-amber hover:text-amber">
                          +{n}
                        </button>
                      ))}
                      <button onClick={() => { setKoreksi(koreksi === it.id ? null : it.id); setIsi(""); }}
                        aria-expanded={koreksi === it.id}
                        className={`h-8 rounded-lg border px-2 text-[11px] ${
                          koreksi === it.id ? "border-amber bg-amber/10 text-amber" : "border-line text-mute hover:border-amber hover:text-amber"
                        }`}>
                        koreksi
                      </button>
                      {pilih === "central" && (bolehDariCentral(it.id, a) ? (
                        [5, 10, 20].map((n) => (
                          <button key={`k${n}`} disabled={diCentral < n} onClick={() => transfer(it.id, n)}
                            className="h-8 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] text-emerald-200 disabled:opacity-30">
                            kirim {n}
                          </button>
                        ))
                      ) : (
                        <span className="text-[10px] text-dim">bar berdiri sendiri</span>
                      ))}
                    </div>
                  )}

                  {/* Panel koreksi: isi manual ATAU kurangi dengan alasan. */}
                  {koreksi === it.id && allow("kelolaStok") && (
                    <div className="mt-1 w-full rounded-xl border border-amber/40 bg-amber/5 p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] uppercase tracking-wider text-dim">Isi manual</span>
                        <input value={isi} inputMode="numeric"
                          onChange={(e) => setIsi(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                          placeholder={String(pilih === "central" ? diCentral : diOutlet ?? 0)}
                          aria-label={`Jumlah stok ${it.name}`}
                          className="h-9 w-24 rounded-lg border border-line bg-ink px-2 text-[13px] tabular-nums text-cream placeholder:text-dim" />
                        <button onClick={() => setel(it.id, pilih)}
                          className="h-9 rounded-lg bg-amber px-3 text-[12px] font-bold text-ink">
                          Simpan
                        </button>
                        <span className="text-[11px] text-dim">
                          dari {pilih === "central" ? diCentral : diOutlet ?? 0}
                        </span>
                      </div>

                      <div className="mt-2 border-t border-line pt-2">
                        <div className="text-[11px] uppercase tracking-wider text-dim">Kurangi — alasannya wajib</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ALASAN_KURANG.map((r) => (
                            <button key={r} onClick={() => setAlasan(r)} aria-pressed={alasan === r}
                              className={`h-8 rounded-lg border px-2 text-[11px] ${
                                alasan === r ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-mute"
                              }`}>{r}</button>
                          ))}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {[1, 5, 10, 20].map((n) => (
                            <button key={n} onClick={() => kurangi(it.id, n, pilih)}
                              className="h-8 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 text-[11px] text-red-200">
                              -{n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!!tidakDilacak && (
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            {tidakDilacak} barang di gudang ini belum dilacak stoknya. Nyalakan pelacakannya
            di tab Menu &amp; Stok dulu supaya ikut terhitung di sini.
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-dim">
          <span className="text-cream">Koreksi</span> dipakai kalau ada salah input atau hasil hitung
          fisik berbeda: isi manual menulis angkanya apa adanya, sedangkan tombol merah menguranginya
          dengan alasan. Alasannya ikut tercatat di jejak bersama nama petugasnya — stok yang
          berkurang tanpa keterangan tidak bisa dibedakan dari barang terjual saat opname.
        </p>

        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Transfer <span className="text-cream">memindahkan</span> barang, tidak membuat yang baru —
          jumlah Central ditambah outlet selalu tetap, dan kiriman yang melebihi isi Central
          tidak bisa dilakukan. Tiap perpindahan tercatat di laporan stok sebagai pemasukan outlet.
        </p>
      </div>
    </div>
  );
}
