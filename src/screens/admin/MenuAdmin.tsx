import { KepalaHalaman, TombolAksi } from "./Tata";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { findItem, type MenuItem } from "../../data/menu";
import { konfirmasi } from "../../lib/dialog";
import { useAdmin, priceOf, kategoriJual, venueTerdampakMenu, itemOf } from "../../lib/adminStore";
import { setVenueAktif, useVenueAktif } from "../../lib/venueAktif";
import { VENUE_LABEL, type Venue } from "../../data/venue";
import KategoriMenu from "./KategoriMenu";

/** Pilihan "Dijual di" — `null` = kedua venue (bawaan semua menu lama). */
const PILIHAN_VENUE: [Venue | null, string][] = [["spl", "SPL"], ["smh", "Smokehouse"], [null, "Keduanya"]];
const labelDijual = (v?: Venue) => (v ? `${VENUE_LABEL[v]} saja` : "Kedua venue");
import { rupiah } from "../../lib/core";

/* Ketersediaan menu + stok barang.

   Sold-out bisa di-toggle KARYAWAN — yang tahu stok habis duluan adalah
   orang di lantai; kalau harus menunggu superadmin, menu habis tetap terjual.
   Angka stok hanya bisa diubah SUPERADMIN — itu nilai persediaan.

   Barang berstok akan otomatis ditandai habis saat mencapai 0 (lihat
   reducer `addFnb`), jadi kasir tidak perlu ingat. */

export default function MenuAdmin() {
  const { a, dispatchA, allow } = useAdmin();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"semua" | "habis" | "stok">("semua");
  /** Daftar menu, atau pengaturan kategori (pemilik 15 Nov 2026). */
  const [lihat, setLihat] = useState<"menu" | "kategori">("menu");
  /** Kartu menu yang sedang dibuka pengaturannya (satu saja). */
  const [bukaAtur, setBukaAtur] = useState<string | null>(null);
  /*
   * PEMISAHAN VENUE (pemilik 14 Nov 2026), sama dengan Pengaturan & Promo.
   * Daftar menampilkan menu yang dijual di venue terpilih (termasuk menu
   * kedua venue). Menu khusus venue sebelah disembunyikan, jumlahnya disebut.
   */
  const venue = useVenueAktif();
  const venueAkun = a.me?.venue;
  const MENU = kategoriJual(a, { staf: true, venue });
  const jumlahSemua = kategoriJual(a, { staf: true }).reduce((n, c) => n + c.items.length, 0);
  /** Borang tambah/ubah barang milik pemilik sendiri. */
  const [form, setForm] = useState<
    { id?: string; name: string; price: string; station: "kitchen" | "bar" | "billiard" } | null
  >(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const bilang = (t: string) => { setKabar(t); setTimeout(() => setKabar(null), 4000); };

  function simpanMenu() {
    if (!form) return;
    const harga = Math.round(Number(form.price.replace(/[^0-9]/g, "")));
    if (!form.name.trim() || !Number.isFinite(harga) || harga < 0) {
      bilang("Nama dan harga harus diisi."); return;
    }
    dispatchA({ t: "saveMenuItem", item: { id: form.id, name: form.name, price: harga, station: form.station } });
    bilang(form.id ? "Menu diperbarui." : `"${form.name.trim()}" ditambahkan.`);
    setForm(null);
  }

  const stokOf = (id: string) => a.stock.find((r) => r.itemId === id);

  const cats = useMemo(() => {
    const s = q.trim().toLowerCase();
    return MENU.map((c) => ({
      ...c,
      items: c.items.filter((i) => {
        if (s && !i.name.toLowerCase().includes(s)) return false;
        if (tab === "habis") return a.soldOut.includes(i.id);
        if (tab === "stok") return !!stokOf(i.id);
        return true;
      }),
    })).filter((c) => c.items.length > 0);
  }, [q, tab, a.soldOut, a.stock, venue, a.menuVenue, a.customItems, a.menuNames]);

  const habisCount = a.soldOut.length;
  const menipis = a.stock.filter((r) => r.qty !== null && r.qty <= r.lowAt);

  const semuaItem = MENU.flatMap((c) => c.items);
  const tersembunyi = jumlahSemua - semuaItem.length;
  const khusus = semuaItem.filter((i) => a.menuVenue?.[i.id] === venue).length;

  async function hapusMenu(it: MenuItem) {
    if (!(await konfirmasi(`Hapus "${it.name}" dari menu?

Tidak bisa dipesan lagi di kasir maupun HP tamu. Pesanan & laporan lama tetap terbaca, dan menunya bisa dipulihkan kapan saja.`, "Ya, hapus"))) return;
    dispatchA({ t: "removeMenuItem", id: it.id });
    setBukaAtur(null);
    bilang(`"${it.name}" dihapus dari menu.`);
  }

  function ubahVenue(itemId: string, name: string, v: Venue | null) {
    const alasan = dispatchA({ t: "setMenuVenue", itemId, venue: v });
    bilang(alasan ?? (v === null ? `"${name}" dijual di kedua venue.`
      : v === venue ? `"${name}" sekarang hanya dijual di ${VENUE_LABEL[v]}.`
      : `"${name}" dipindah ke ${VENUE_LABEL[v]} — tidak tampil lagi di daftar ${VENUE_LABEL[venue]}.`));
  }
  return (
    <div className="pb-6">
      {/* ── KEPALA MENU & STOK (perapian 14 Nov 2026) ── */}
      <div className="mb-4">
        <KepalaHalaman judul="Menu & Stok"
          ket={<>Harga, ketersediaan, stok, dan venue tempat tiap menu dijual — sekarang menampilkan
            menu <span className="text-cream">{VENUE_LABEL[venue]}</span>.</>}
          aksi={<>
            {venueAkun ? (
              <span className="rounded-lg border border-amber/50 bg-amber/10 px-3 py-1.5 text-[12px] font-bold text-amber">
                {VENUE_LABEL[venueAkun]}
              </span>
            ) : (
              <div className="inline-flex gap-0.5 rounded-xl border border-line bg-ink p-0.5" role="radiogroup" aria-label="Venue menu">
                {(["spl", "smh"] as const).map((v) => (
                  <button key={v} role="radio" aria-checked={venue === v} onClick={() => setVenueAktif(v)}
                    className={`min-h-[34px] rounded-lg px-3 text-[12px] font-bold ${
                      venue === v ? "bg-amber text-ink" : "text-mute hover:text-cream"
                    }`}>{VENUE_LABEL[v]}</button>
                ))}
              </div>
            )}
            {allow("ubahTarif") && (
              <div className="inline-flex gap-0.5 rounded-xl border border-line bg-ink p-0.5" role="radiogroup" aria-label="Tampilan">
                {([["menu", "Daftar menu"], ["kategori", "Atur kategori"]] as const).map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={lihat === k} onClick={() => setLihat(k)}
                    className={`min-h-[34px] rounded-lg px-3 text-[12px] font-bold ${
                      lihat === k ? "bg-cream text-ink" : "text-mute hover:text-cream"
                    }`}>{l}</button>
                ))}
              </div>
            )}
            {allow("ubahTarif") && !form && lihat === "menu" && (
              <TombolAksi utama onClick={() => setForm({ name: "", price: "", station: "kitchen" })}>+ Tambah menu baru</TombolAksi>
            )}
          </>}
          angka={[
            { label: `Menu ${VENUE_LABEL[venue]}`, nilai: semuaItem.length },
            { label: "Khusus venue ini", nilai: khusus },
            { label: "Ditandai habis", nilai: habisCount, nada: habisCount ? "merah" : undefined },
            { label: "Stok menipis", nilai: menipis.length, nada: menipis.length ? "amber" : undefined },
          ]} />
      </div>

      {lihat === "kategori" ? <KategoriMenu /> : (<>
      {/* Tambah barang sendiri — tanpa ini pemilik harus menunggu aplikasi
          dibangun ulang hanya untuk menjual satu menu baru. */}
      {allow("ubahTarif") && (form || (a.customItems ?? []).length > 0 || kabar) && (
        <div className="mb-4 rounded-2xl border border-line bg-ink-2 p-3">
          {!form ? (
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Menu tambahan pemilik</div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
                {form.id ? "Ubah menu" : "Menu baru"}
              </div>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 60) })}
                placeholder="Nama menu"
                className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
              <input value={form.price} inputMode="numeric"
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^0-9]/g, "").slice(0, 9) })}
                placeholder="Harga (rupiah)"
                className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-right text-[13px] tabular-nums text-cream placeholder:text-left placeholder:text-dim focus:border-amber focus:outline-none" />
              <div className="grid grid-cols-3 gap-1.5">
                {([["kitchen", "Dapur"], ["bar", "Bar"], ["billiard", "Counter"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setForm({ ...form, station: k })} aria-pressed={form.station === k}
                    className={`min-h-[40px] rounded-lg border text-[12px] ${
                      form.station === k ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"
                    }`}>{label}</button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-dim">
                Dapur &amp; Bar membuat tiket pesanan. <span className="text-cream">Counter</span> tidak —
                barang jadi yang langsung diserahkan kasir (rokok, botolan), dan tidak muncul di menu HP pelanggan.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setForm(null)}
                  className="min-h-[42px] flex-1 rounded-xl border border-line text-[13px] text-mute">Batal</button>
                <button onClick={simpanMenu}
                  className="min-h-[42px] flex-[2] rounded-xl bg-amber text-[13px] font-bold text-ink">Simpan</button>
              </div>
            </div>
          )}
          {(a.customItems ?? []).length > 0 && !form && (
            <div className="mt-2 space-y-1">
              {(a.customItems ?? []).map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-[12px]">
                  <span className={`flex-1 truncate ${it.aktif === false ? "text-dim line-through" : "text-cream"}`}>
                    {it.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-dim">{labelDijual(a.menuVenue?.[it.id])}</span>
                  <span className="tabular-nums text-mute">{rupiah(priceOf(a, it.id))}</span>
                  <button onClick={() => setForm({ id: it.id, name: it.name, price: String(priceOf(a, it.id)), station: it.station })}
                    className="min-h-[30px] rounded-lg border border-line px-2 text-[11px] text-mute">ubah</button>
                  {it.aktif !== false ? (
                    <button onClick={() => { dispatchA({ t: "removeMenuItem", id: it.id }); bilang(`"${it.name}" dinonaktifkan.`); }}
                      className="min-h-[30px] rounded-lg border border-line px-2 text-[11px] text-dim">nonaktifkan</button>
                  ) : (
                    <button onClick={() => { dispatchA({ t: "pulihkanMenu", id: it.id }); bilang(`"${it.name}" dipulihkan.`); }}
                      className="min-h-[30px] rounded-lg border border-line px-2 text-[11px] text-amber">pulihkan</button>
                  )}
                </div>
              ))}
              <p className="pt-1 text-[11px] leading-snug text-dim">
                Menu yang dinonaktifkan tidak muncul lagi saat memesan, tapi namanya tetap
                terbaca di pesanan dan laporan lama — kalau dihapus betulan, riwayat
                penjualannya berubah jadi deretan kode tanpa nama.
              </p>
            </div>
          )}
          {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}
        </div>
      )}

      {menipis.length > 0 && (
        <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/8 p-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-300">
            Stok menipis · {menipis.length}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {menipis.map((r) => {
              const it = itemOf(a, r.itemId);
              return (
                <span key={r.itemId}
                  className="rounded-lg border border-red-500/30 bg-ink/50 px-2 py-1 text-[11px] text-cream">
                  {it?.name ?? r.itemId} <span className="text-red-300">· {r.qty}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="sticky top-[104px] z-20 -mx-4 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur-md">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cari menu…" aria-label="Cari menu"
          className="w-full rounded-xl border border-line bg-ink-2 px-4 py-2.5 text-cream
            placeholder:text-dim focus:border-amber focus:outline-none" />
        <div className="mt-2 flex gap-2">
          {([["semua", "Semua"], ["habis", `Habis · ${habisCount}`], ["stok", "Berstok"]] as const)
            .map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} aria-pressed={tab === v}
                className={`min-h-[34px] rounded-lg px-3 text-[12px] font-semibold transition-colors ${
                  tab === v ? "bg-amber text-ink" : "bg-ink-2 text-mute"
                }`}>{l}</button>
            ))}
        </div>
      </div>

      {/* Kategori: dua kolom di layar lebar supaya daftar tidak memanjang ke bawah. */}
      <div className="mt-4 grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {cats.map((c) => (
          <section key={c.id}>
            <h2 className="mb-2 font-display text-lg uppercase tracking-wide text-cream">{c.name}</h2>
            <div className="space-y-1.5">
              {c.items.map((it) => {
                const off = a.soldOut.includes(it.id);
                const st = stokOf(it.id);
                const low = st?.qty !== null && st !== undefined && st.qty <= st.lowAt;
                return (
                  /*
                   * KARTU RINGKAS (pemilik 17 Nov 2026: "Menu & Stok buat lebih compact,
                   * tiap ubah stok jauh ke bawah"). Satu baris: nama, harga, stok −/+,
                   * Ada/Habis. Pengaturan lain (dijual di, nama, harga, stok cepat,
                   * hapus) dibuka lewat "Atur" — hanya satu kartu terbuka sekaligus.
                   */
                  <motion.div key={it.id} layout
                    className={`rounded-xl border px-2.5 py-1.5 ${
                      off ? "border-red-500/40 bg-red-500/8" : bukaAtur === it.id ? "border-amber/60 bg-ink-2" : "border-line bg-ink-2"
                    }`}>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-[13.5px] leading-tight ${off ? "text-dim line-through" : "text-cream"}`}>{it.name}</div>
                        <div className="truncate text-[11px] text-dim">
                          {rupiah(priceOf(a, it.id))}
                          {priceOf(a, it.id) !== it.price && <span className="text-amber/80"> (buku {rupiah(it.price)})</span>}
                          {" · "}{it.station === "bar" ? "Bar" : "Dapur"}
                          {a.menuVenue?.[it.id] && <span className="text-amber"> · {labelDijual(a.menuVenue[it.id])}</span>}
                        </div>
                      </div>
                      {allow("kelolaStok") && st && st.qty !== null && (
                        <div className={`flex shrink-0 items-center rounded-lg border ${low ? "border-red-400/60" : "border-line"}`}>
                          <button onClick={() => dispatchA({ t: "addStock", itemId: it.id, delta: -1 })} aria-label={`Kurangi stok ${it.name}`}
                            className="h-8 w-7 text-amber hover:bg-white/5">−</button>
                          <span className={`min-w-[30px] text-center font-serif text-[13px] font-bold tabular-nums ${low ? "text-red-300" : "text-cream"}`}>{st.qty}</span>
                          <button onClick={() => dispatchA({ t: "addStock", itemId: it.id, delta: 1 })} aria-label={`Tambah stok ${it.name}`}
                            className="h-8 w-7 text-amber hover:bg-white/5">+</button>
                        </div>
                      )}
                      <button
                        onClick={() => dispatchA({ t: "toggleSoldOut", itemId: it.id, name: it.name })}
                        disabled={!allow("tandaiHabis")} aria-pressed={!off} aria-label={`${it.name}: ${off ? "habis" : "ada"}`}
                        className={`h-8 w-[58px] shrink-0 rounded-lg text-[10.5px] font-bold uppercase tracking-wider disabled:opacity-50 ${
                          off ? "bg-red-500/70 text-white" : "bg-emerald-500/20 text-emerald-300"}`}>
                        {off ? "Habis" : "Ada"}
                      </button>
                      {(allow("ubahTarif") || allow("kelolaStok")) && (
                        <button onClick={() => setBukaAtur(bukaAtur === it.id ? null : it.id)} aria-expanded={bukaAtur === it.id}
                          className={`h-8 shrink-0 rounded-lg border px-2 text-[11px] font-semibold ${
                            bukaAtur === it.id ? "border-amber bg-amber/15 text-amber" : "border-line text-mute hover:border-amber hover:text-amber"}`}>
                          Atur {bukaAtur === it.id ? "▴" : "▾"}
                        </button>
                      )}
                    </div>

                    {bukaAtur === it.id && (<>
                      {/* DIJUAL DI — venue tempat menu ini muncul di kasir & HP tamu. */}
                      {allow("ubahTarif") && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
                          <span className="text-[11px] text-dim">Dijual di</span>
                          {PILIHAN_VENUE.map(([v, label]) => {
                            const kini = a.menuVenue?.[it.id] ?? null;
                            const pilih = kini === v;
                            const boleh = !venueAkun || venueTerdampakMenu(kini, v).every((x) => x === venueAkun);
                            return (
                              <button key={label} aria-pressed={pilih} disabled={pilih || !boleh}
                                onClick={() => ubahVenue(it.id, it.name, v)}
                                className={`h-8 rounded-lg border px-2.5 text-[11px] font-semibold disabled:cursor-default ${
                                  pilih ? (v ? "border-amber bg-amber/15 text-amber" : "border-sky-400/50 bg-sky-400/10 text-sky-300")
                                    : "border-line text-mute hover:border-amber hover:text-amber disabled:opacity-35"
                                }`}>{label}</button>
                            );
                          })}
                        </div>
                      )}

                      {allow("ubahTarif") && <NamaEditor item={it} />}
                      {allow("ubahTarif") && <PriceEditor item={it} />}

                      {allow("kelolaStok") && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
                          <span className="text-[11px] text-dim">Stok</span>
                          {st && st.qty !== null ? (<>
                            {/* Tambah cepat — mengisi stok sekardus tidak perlu dua puluh ketukan. */}
                            {[5, 10, 20].map((n) => (
                              <button key={n} onClick={() => dispatchA({ t: "addStock", itemId: it.id, delta: n })}
                                className="h-8 rounded-lg border border-line px-2 text-[11px] text-mute hover:border-amber hover:text-amber">
                                +{n}
                              </button>
                            ))}
                            <button onClick={() => dispatchA({ t: "setStock", itemId: it.id, qty: null })}
                              className="ml-auto text-[11px] text-dim underline underline-offset-2">berhenti lacak stok</button>
                          </>) : (
                            <button onClick={() => dispatchA({ t: "setStock", itemId: it.id, qty: 24 })}
                              className="h-8 rounded-lg border border-line px-2 text-[11px] text-mute hover:border-amber hover:text-amber">
                              Lacak stok barang ini
                            </button>
                          )}
                        </div>
                      )}

                      {/* HAPUS MENU (pemilik 17 Nov 2026). Bisa dipulihkan dari daftar di bawah. */}
                      {allow("ubahTarif") && (
                        <div className="mt-2 flex items-center justify-end border-t border-line pt-2">
                          <button onClick={() => void hapusMenu(it)}
                            className="h-8 rounded-lg border border-red-500/50 px-3 text-[11px] font-semibold text-red-300 hover:bg-red-500/15">
                            Hapus menu
                          </button>
                        </div>
                      )}
                    </>)}
                  </motion.div>
                );
              })}
            </div>
          </section>
        ))}

        {cats.length === 0 && (
          <div className="rounded-xl border border-line bg-ink-2 px-4 py-10 text-center text-sm text-dim">
            Tidak ada menu yang cocok.
          </div>
        )}
      </div>

      {allow("ubahTarif") && (a.menuDihapus ?? []).length > 0 && (
        <div className="mt-4 rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Menu yang dihapus · {(a.menuDihapus ?? []).length}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(a.menuDihapus ?? []).map((id) => (
              <span key={id} className="flex items-center gap-1.5 rounded-lg border border-line bg-ink px-2 py-1 text-[12px] text-dim">
                <span className="line-through">{itemOf(a, id)?.name ?? id}</span>
                <button onClick={() => { dispatchA({ t: "pulihkanMenu", id }); bilang(`"${itemOf(a, id)?.name ?? id}" dipulihkan.`); }}
                  className="rounded border border-line px-1.5 text-[11px] text-amber hover:border-amber">pulihkan</button>
              </span>
            ))}
          </div>
        </div>
      )}
      {kabar && <p role="status" className="mt-2 text-[12px] text-amber">{kabar}</p>}

      {tersembunyi > 0 && (
        <p className="mt-4 text-[11px] leading-relaxed text-dim">
          {tersembunyi} menu khusus {VENUE_LABEL[venue === "spl" ? "smh" : "spl"]} tidak ditampilkan — pilih venue itu di atas untuk melihatnya.
        </p>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-dim">
        "Dijual di" menentukan menu tampil di kasir, waiter, dan HP tamu venue mana. Menu lama
        bawaannya dijual di kedua venue. Harga, habis/ada, dan stok tetap satu untuk kedua venue.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-dim">
        Barang berstok otomatis ditandai habis saat mencapai 0, dan tersedia lagi
        begitu stoknya diisi. Masakan dapur tidak dilacak stoknya — cukup
        ditandai habis manual.
      </p>
      {allow("ubahTarif") && (
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Perubahan harga langsung tampil di HP pelanggan dan kasir, tapi hanya berlaku untuk
          pesanan baru. Pesanan yang sudah masuk tetap memakai harga saat dipesan.
        </p>
      )}
      </>)}
    </div>
  );
}

/** Editor NAMA menu (temuan 16 Nov 2026). Nama baru langsung dipakai di kasir, HP tamu, checker & struk. */
function NamaEditor({ item }: { item: MenuItem }) {
  const { a, dispatchA } = useAdmin();
  const bawaan = findItem(item.id)?.name;      // undefined = barang tambahan pemilik
  const [buka, setBuka] = useState(false);
  const [value, setValue] = useState(item.name);
  useEffect(() => { setValue(item.name); }, [item.name]);
  const bersih = value.trim().replace(/\s+/g, " ");
  const simpan = () => {
    if (!bersih || bersih === item.name) { setBuka(false); return; }
    dispatchA({ t: "setMenuName", itemId: item.id, name: bersih });
    setBuka(false);
  };
  if (!buka) {
    return (
      <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
        <span className="text-[11px] text-dim">Nama</span>
        <button onClick={() => setBuka(true)}
          className="h-8 rounded-lg border border-line px-3 text-[11px] font-semibold text-mute hover:border-amber hover:text-amber">
          Ubah nama
        </button>
        {bawaan && a.menuNames?.[item.id] && (
          <>
            <span className="min-w-0 truncate text-[11px] text-dim">asli: {bawaan}</span>
            <button onClick={() => dispatchA({ t: "setMenuName", itemId: item.id, name: "" })}
              className="ml-auto shrink-0 text-[11px] text-dim underline underline-offset-2">
              Kembalikan
            </button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
      <span className="text-[11px] text-dim">Nama</span>
      <input value={value} autoFocus maxLength={60}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") simpan(); if (e.key === "Escape") setBuka(false); }}
        aria-label={`Nama baru untuk ${item.name}`}
        className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-ink px-2 text-[13px] text-cream focus:border-amber focus:outline-none" />
      <button disabled={!bersih || bersih === item.name} onClick={simpan}
        className="h-8 shrink-0 rounded-lg bg-amber px-3 text-[11px] font-bold text-ink disabled:opacity-30">
        Simpan
      </button>
      <button onClick={() => { setValue(item.name); setBuka(false); }} className="h-8 shrink-0 px-1 text-[11px] text-dim">Batal</button>
    </div>
  );
}

/** Editor harga per menu. Nilai dikirim sebagai niat; mesin yang memvalidasi & mencatat. */
function PriceEditor({ item }: { item: MenuItem }) {
  const { a, dispatchA } = useAdmin();
  const current = priceOf(a, item.id);
  const [value, setValue] = useState(String(current));
  useEffect(() => { setValue(String(current)); }, [current]);
  const n = Math.round(Number(value));
  const changed = Number.isFinite(n) && n > 0 && n !== current;

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
      <span className="text-[11px] text-dim">Harga</span>
      <div className="flex items-center gap-1 rounded-lg border border-line bg-ink px-2">
        <span className="text-[11px] text-dim">Rp</span>
        <input type="number" inputMode="numeric" min={500} step={500} value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Harga ${item.name}`}
          className="h-8 w-[84px] bg-transparent text-right font-serif text-sm tabular-nums text-cream focus:outline-none" />
      </div>
      <button disabled={!changed}
        onClick={() => dispatchA({ t: "setMenuPrice", itemId: item.id, price: n })}
        className="h-8 rounded-lg bg-amber px-3 text-[11px] font-bold text-ink disabled:opacity-30">
        Simpan
      </button>
      {current !== item.price && (
        <button onClick={() => dispatchA({ t: "setMenuPrice", itemId: item.id, price: item.price })}
          className="ml-auto text-[11px] text-dim underline underline-offset-2">
          Kembalikan
        </button>
      )}
    </div>
  );
}
