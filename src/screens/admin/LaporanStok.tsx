/**
 * LAPORAN STOK 05.00 → 05.00 — riwayat harian, bukan tebakan.
 *
 * KENAPA DITULIS ULANG. Versi lama menghitung semuanya dari `stockMoves`,
 * penyangga DI DALAM MEMORI yang dibangun ulang tiap jejak diputar dan
 * dipotong di 2.000 baris terakhir; kolom "Awal" direka MUNDUR dari sisa hari
 * ini. Akibatnya satu pergerakan yang hilang membuat semua hari sebelumnya
 * salah, dan kalau penyangganya kosong layarnya selalu menampilkan
 * Awal = Sisa dan Terjual = 0 — walau tab-tab hari itu jelas berisi makanan.
 * Pemilik melihatnya sebagai "tidak sinkron dan tidak ada historical harian".
 *
 * Sekarang dua sumber, dan layar ini selalu mengatakan sedang memakai yang mana:
 *   • HARI LAMPAU dibaca dari `stok_harian` — tutup buku yang dihitung server
 *     dari jejak (supabase/functions/_sumber/stok.ts). Sudah jadi fakta:
 *     tidak berubah lagi, tidak bergantung perangkat.
 *   • HARI BERJALAN dihitung langsung dari jejak perangkat ini supaya hidup.
 *
 * Tiap baris bisa diperiksa sendiri:
 *   awal + masuk − terjual + kembali − susut + opname = sisa
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAdmin, recap, stockDateOf, priceOf, shiftDate, rangeDays, MAX_REKAP_HARI, STOCK_DAY_HOUR,
} from "../../lib/adminStore";
import { venueStore } from "../../lib/venueStore";
import type { StokHarianBaris } from "../../lib/supabaseRemote";
import { findItem } from "../../data/menu";
import { fmtDateLong, rupiah } from "../../lib/core";
import { saveTextFile } from "../../lib/saveFile";

/** Satu barang pada satu hari, dari sumber mana pun. */
type Baris = {
  itemId: string; nama: string;
  awal: number | null; masuk: number; terjual: number; kembali: number;
  susut: number; opname: number; sisa: number | null; nilai: number;
};

const kosong = (itemId: string): Baris => ({
  itemId, nama: findItem(itemId)?.name ?? itemId,
  awal: null, masuk: 0, terjual: 0, kembali: 0, susut: 0, opname: 0, sisa: null, nilai: 0,
});

const labelHari = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
};

/** Daftar tanggal dari..sampai (inklusif). */
function deretHari(dari: string, sampai: string): string[] {
  const out: string[] = [];
  for (let d = dari; d <= sampai && out.length <= MAX_REKAP_HARI; d = shiftDate(d, 1)) out.push(d);
  return out;
}

const JAM = STOCK_DAY_HOUR.toString().padStart(2, "0") + ".00";

export default function LaporanStok() {
  const { a, dispatchA, allow } = useAdmin();
  const store = venueStore() as ReturnType<typeof venueStore> & {
    stokAmbil?: (dari: string, sampai: string) => Promise<StokHarianBaris[]>;
  };

  const hariIni = stockDateOf(Date.now());
  const [dari, setDari] = useState(() => shiftDate(hariIni, -6));
  const [sampai, setSampai] = useState(hariIni);
  const [server, setServer] = useState<StokHarianBaris[] | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [buka, setBuka] = useState(hariIni);
  const [pesan, setPesan] = useState<string | null>(null);
  const [opname, setOpname] = useState<Record<string, string> | null>(null);

  const muat = useCallback(async () => {
    if (!store.stokAmbil) return;
    setSibuk(true);
    try { setServer(await store.stokAmbil(dari, sampai)); setGalat(null); }
    catch (e) { setGalat(e instanceof Error ? e.message : "Gagal memuat riwayat stok."); }
    finally { setSibuk(false); }
  }, [store, dari, sampai]);

  useEffect(() => { void muat(); }, [muat]);

  /* ── Hari berjalan: dihitung langsung dari jejak perangkat ini ──── */
  const hariLokal = useMemo(() => {
    const moves = (a.stockMoves ?? []).filter((m) => stockDateOf(m.at) === hariIni);
    const peta = new Map<string, Baris>();
    for (const row of a.stock) {
      const b = kosong(row.itemId);
      b.sisa = row.qty;
      peta.set(row.itemId, b);
    }
    for (const m of moves) {
      const b = peta.get(m.itemId) ?? kosong(m.itemId);
      switch (m.kind) {
        case "jual": b.terjual += -m.delta; b.nilai += -m.delta * priceOf(a, m.itemId); break;
        case "kembali": b.kembali += m.delta; break;
        case "masuk": b.masuk += m.delta; break;
        case "susut": b.susut += -m.delta; break;
        case "opname": b.opname += m.delta; break;
        default: if (m.delta > 0) b.masuk += m.delta; else b.susut += -m.delta;
      }
      peta.set(m.itemId, b);
    }
    // Awal = sisa sekarang dikurangi seluruh pergerakan hari ini. Untuk HARI
    // BERJALAN ini aman: pergerakan hari ini pasti masih ada di penyangga.
    for (const b of peta.values()) {
      if (b.sisa === null) continue;
      b.awal = b.sisa - (b.masuk - b.terjual + b.kembali - b.susut + b.opname);
    }
    return peta;
  }, [a, hariIni]);

  /* ── Gabungan: hari lampau dari server, hari ini dari jejak ─────── */
  const { perHari, adaServer } = useMemo(() => {
    const perHari = new Map<string, Map<string, Baris>>();
    for (const r of server ?? []) {
      const hari = String(r.tanggal).slice(0, 10);
      let peta = perHari.get(hari);
      if (!peta) { peta = new Map(); perHari.set(hari, peta); }
      peta.set(r.item_id, {
        itemId: r.item_id, nama: findItem(r.item_id)?.name ?? r.item_id,
        awal: r.awal, masuk: r.masuk, terjual: r.terjual, kembali: r.kembali,
        susut: r.susut, opname: r.opname, sisa: r.sisa, nilai: Number(r.nilai_jual ?? 0),
      });
    }
    if (hariIni >= dari && hariIni <= sampai) perHari.set(hariIni, hariLokal);
    return { perHari, adaServer: (server ?? []).length > 0 };
  }, [server, hariLokal, hariIni, dari, sampai]);

  const hari = deretHari(dari, sampai);
  const hariTampil = perHari.has(buka) ? buka : (hari.filter((d) => perHari.has(d)).pop() ?? hariIni);
  const tabel = [...(perHari.get(hariTampil)?.values() ?? [])]
    .filter((x) => x.awal !== null || x.sisa !== null || x.terjual || x.masuk || x.susut || x.opname)
    .sort((x, y) => y.terjual - x.terjual || x.nama.localeCompare(y.nama));

  /* ── Ringkasan sepanjang rentang ────────────────────────────────── */
  const ringkas = useMemo(() => {
    const per = new Map<string, { nama: string; terjual: number; nilai: number; susut: number; opname: number }>();
    const harian: { hari: string; nilai: number; terjual: number }[] = [];
    for (const d of hari) {
      const peta = perHari.get(d);
      let nilai = 0, terjual = 0;
      for (const b of peta?.values() ?? []) {
        const p = per.get(b.itemId) ?? { nama: b.nama, terjual: 0, nilai: 0, susut: 0, opname: 0 };
        p.terjual += b.terjual; p.nilai += b.nilai; p.susut += b.susut; p.opname += b.opname;
        per.set(b.itemId, p);
        nilai += b.nilai; terjual += b.terjual;
      }
      harian.push({ hari: d, nilai, terjual });
    }
    const daftar = [...per.entries()].map(([itemId, p]) => ({ itemId, ...p }))
      .sort((x, y) => y.nilai - x.nilai || y.terjual - x.terjual);
    return {
      daftar, harian,
      totalTerjual: daftar.reduce((n, x) => n + x.terjual, 0),
      totalNilai: daftar.reduce((n, x) => n + x.nilai, 0),
      totalSusut: daftar.reduce((n, x) => n + x.susut, 0),
      totalOpname: daftar.reduce((n, x) => n + x.opname, 0),
      hariBerisi: harian.filter((h) => perHari.has(h.hari)).length,
    };
  }, [hari, perHari]);

  /** Perkiraan habis: sisa terkini dibagi rata-rata pemakaian per hari. */
  const perkiraan = useMemo(() => {
    const n = Math.max(1, ringkas.hariBerisi);
    return a.stock
      .filter((r) => r.qty !== null)
      .map((r) => {
        const laku = ringkas.daftar.find((x) => x.itemId === r.itemId)?.terjual ?? 0;
        const rata = laku / n;
        return {
          itemId: r.itemId, nama: findItem(r.itemId)?.name ?? r.itemId,
          sisa: r.qty as number, rata,
          hari: rata > 0 ? (r.qty as number) / rata : Infinity,
        };
      })
      .filter((x) => x.rata > 0 && x.hari <= 10)
      .sort((x, y) => x.hari - y.hari)
      .slice(0, 6);
  }, [a.stock, ringkas]);

  /* ── Unduh CSV seluruh rentang, bukan cuma satu hari ────────────── */
  async function unduh() {
    const rows: (string | number)[][] = [
      [`Laporan stok ${dari} s/d ${sampai} (batas hari ${JAM})`],
      ["Tanggal", "Item", "Awal", "Masuk", "Terjual", "Kembali", "Susut", "Opname", "Sisa", "Nilai terjual"],
    ];
    for (const d of hari) {
      for (const b of perHari.get(d)?.values() ?? []) {
        if (b.awal === null && b.sisa === null && !b.terjual) continue;
        rows.push([d, b.nama, b.awal ?? "-", b.masuk, b.terjual, b.kembali, b.susut, b.opname, b.sisa ?? "-", b.nilai]);
      }
    }
    rows.push([], ["TOTAL", "", "", "", ringkas.totalTerjual, "", ringkas.totalSusut, ringkas.totalOpname, "", ringkas.totalNilai]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const hasil = await saveTextFile(`stok-spl-${dari}_${sampai}.csv`, "\uFEFF" + csv);
    setPesan(hasil === "dibatalkan" ? null : hasil === "gagal" ? "Gagal menyimpan berkas." : "Laporan stok tersimpan.");
    setTimeout(() => setPesan(null), 4000);
  }

  /* ── Opname: kasir mengisi jumlah FISIK, selisihnya jadi susut resmi ── */
  function bukaOpname() {
    const isi: Record<string, string> = {};
    for (const r of a.stock) if (r.qty !== null) isi[r.itemId] = String(r.qty);
    setOpname(isi);
  }

  function simpanOpname() {
    if (!opname) return;
    const counts = Object.entries(opname)
      .map(([itemId, v]) => ({ itemId, qty: Math.max(0, Math.floor(Number(v))) }))
      .filter((c) => Number.isFinite(c.qty));
    if (counts.length === 0) { setOpname(null); return; }
    dispatchA({ t: "stockCount", counts });
    setOpname(null);
    setPesan("Hasil hitung fisik tersimpan. Selisihnya masuk kolom Opname.");
    setTimeout(() => setPesan(null), 5000);
  }

  const selisihOpname = opname
    ? a.stock.reduce((n, r) => {
        const v = opname[r.itemId];
        if (r.qty === null || v === undefined || v === "") return n;
        return n + (Math.max(0, Math.floor(Number(v))) - r.qty);
      }, 0)
    : 0;

  const puncakGrafik = Math.max(1, ...ringkas.harian.map((h) => h.nilai));

  /**
   * PEMBANDING yang selama ini tidak ada, dan itulah yang membuat laporan
   * terasa "tidak sinkron": barang keluar saat DIPESAN (hari stok, batas
   * 05.00), uang masuk saat tab DITUTUP (hari uang, batas 02.00). Dua angka
   * ini memang boleh berbeda — yang tidak boleh adalah pemilik tidak tahu
   * kenapa. Jadi keduanya ditampilkan berdampingan, apa adanya.
   */
  const banding = useMemo(() => {
    const uang = recap(a, hariTampil);
    const barang = [...(perHari.get(hariTampil)?.values() ?? [])].reduce((n, x) => n + x.nilai, 0);
    return { uang: uang.fnb, barang, selisih: uang.fnb - barang };
  }, [a, hariTampil, perHari]);

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
        Laporan stok · {JAM} → {JAM}
      </h2>

      {/* Rentang tanggal — sama caranya dengan rekap uang */}
      <div className="rounded-xl border border-line bg-ink-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-dim">Dari tanggal</span>
            <input type="date" value={dari} max={sampai}
              onChange={(e) => e.target.value && setDari(e.target.value)}
              className="min-h-[40px] w-full rounded-lg border border-line bg-ink px-2 text-[13px] text-cream focus:border-amber focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-dim">Sampai tanggal</span>
            <input type="date" value={sampai} max={hariIni}
              onChange={(e) => e.target.value && setSampai(e.target.value)}
              className="min-h-[40px] w-full rounded-lg border border-line bg-ink px-2 text-[13px] text-cream focus:border-amber focus:outline-none" />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {([
            ["Hari ini", () => [hariIni, hariIni]],
            ["7 hari", () => [shiftDate(hariIni, -6), hariIni]],
            ["30 hari", () => [shiftDate(hariIni, -29), hariIni]],
            ["Bulan ini", () => [`${hariIni.slice(0, 7)}-01`, hariIni]],
          ] as const).map(([label, f]) => (
            <button key={label} onClick={() => { const [d, s] = f(); setDari(d); setSampai(s); setBuka(s); }}
              className="rounded-full border border-line bg-ink px-2.5 py-1 text-[11px] text-mute hover:border-amber hover:text-amber">
              {label}
            </button>
          ))}
          {allow("kelolaStok") && (
            <button onClick={bukaOpname}
              className="ml-auto rounded-full border border-amber/50 bg-amber/10 px-2.5 py-1 text-[11px] text-amber">
              Hitung fisik (opname)
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          {rangeDays(dari, sampai)} hari · {fmtDateLong(dari)} – {fmtDateLong(sampai)}.
          {" "}Hari stok dihitung dari jam {JAM} pagi sampai jam yang sama besoknya —
          beda dari hari uang yang tutup jam 02.00, supaya barang dihitung setelah semua tab selesai.
        </p>
      </div>

      {/* Jujur soal sumber angkanya */}
      {(galat || (!adaServer && dari < hariIni)) && (
        <p className="mt-2 rounded-lg border border-amber/40 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed text-amber">
          {galat
            ? `Riwayat dari server tidak terbaca: ${galat}`
            : "Tutup buku stok di server belum berisi hari-hari ini. Yang tampil hanya hari berjalan, " +
              "dihitung dari jejak perangkat ini. Begitu fungsi stok-tutup berjalan, riwayatnya muncul sendiri."}
        </p>
      )}

      {/* Ringkasan periode */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ["Terjual", `${ringkas.totalTerjual} barang`, "text-cream"],
          ["Nilai", rupiah(ringkas.totalNilai), "text-amber"],
          ["Susut", `${ringkas.totalSusut} barang`, ringkas.totalSusut > 0 ? "text-red-300" : "text-mute"],
          ["Selisih opname", `${ringkas.totalOpname > 0 ? "+" : ""}${ringkas.totalOpname}`,
            ringkas.totalOpname < 0 ? "text-red-300" : "text-mute"],
        ] as const).map(([label, nilai, warna]) => (
          <div key={label} className="rounded-xl border border-line bg-ink-2 p-3">
            <div className="text-[10px] uppercase tracking-wider text-dim">{label}</div>
            <div className={`font-serif text-lg font-bold tabular-nums ${warna}`}>{nilai}</div>
          </div>
        ))}
      </div>

      {/* Grafik nilai per hari — sekaligus pemilih hari */}
      {hari.length > 1 && (
        <div className="mt-3 rounded-xl border border-line bg-ink-2 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-dim">Nilai barang terjual per hari</div>
          <div className="no-bar flex items-end gap-1 overflow-x-auto">
            {ringkas.harian.map((h) => (
              <button key={h.hari} onClick={() => setBuka(h.hari)} title={`${labelHari(h.hari)} · ${rupiah(h.nilai)}`}
                className="flex min-w-[24px] flex-1 flex-col items-center gap-1">
                <div className="flex h-20 w-full items-end">
                  <div
                    className={`w-full rounded-t ${h.hari === hariTampil ? "bg-amber" : perHari.has(h.hari) ? "bg-amber/35" : "bg-ink-3"}`}
                    style={{ height: `${Math.max(2, (h.nilai / puncakGrafik) * 100)}%` }} />
                </div>
                <span className={`text-[9px] tabular-nums ${h.hari === hariTampil ? "text-amber" : "text-dim"}`}>
                  {h.hari.slice(8)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Peringkat barang terlaris sepanjang rentang */}
      {ringkas.daftar.some((x) => x.terjual > 0) && (
        <div className="mt-3 rounded-xl border border-line bg-ink-2 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-dim">Terlaris {rangeDays(dari, sampai)} hari ini</div>
          <div className="space-y-1.5">
            {ringkas.daftar.filter((x) => x.terjual > 0).slice(0, 8).map((x, i) => (
              <div key={x.itemId} className="flex items-center gap-2 text-[12px]">
                <span className="w-4 text-right tabular-nums text-dim">{i + 1}</span>
                <span className="flex-1 truncate text-cream">{x.nama}</span>
                <span className="tabular-nums text-mute">{x.terjual}×</span>
                <span className="w-24 text-right tabular-nums text-amber">{rupiah(x.nilai)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Perkiraan habis — supaya belanja tidak telat */}
      {perkiraan.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-red-300">Perlu dibelanjakan</div>
          <div className="space-y-1">
            {perkiraan.map((x) => (
              <div key={x.itemId} className="flex items-center gap-2 text-[12px]">
                <span className="flex-1 truncate text-cream">{x.nama}</span>
                <span className="tabular-nums text-mute">sisa {x.sisa}</span>
                <span className="tabular-nums text-dim">{x.rata.toFixed(1)}/hari</span>
                <span className="w-20 text-right tabular-nums text-red-300">
                  {x.hari < 1 ? "hari ini" : `± ${Math.floor(x.hari)} hari`}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-dim">
            Dihitung dari rata-rata pemakaian {ringkas.hariBerisi} hari yang ada datanya.
          </p>
        </div>
      )}

      {/* Tabel satu hari */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          {hariTampil === hariIni ? "Hari ini" : labelHari(hariTampil)}
          <span className="ml-2 font-normal normal-case tracking-normal text-dim">
            {hariTampil === hariIni ? "· dihitung langsung dari jejak" : "· tutup buku server"}
          </span>
        </div>
        <button onClick={() => void muat()} disabled={sibuk}
          className="min-h-[32px] shrink-0 rounded-lg border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber disabled:opacity-40">
          {sibuk ? "Memuat…" : "Muat ulang"}
        </button>
      </div>

      {tabel.length === 0 ? (
        <div className="mt-2 rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-sm text-dim">
          Belum ada catatan stok untuk hari ini.
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-ink-2">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wider text-dim">
                <th className="px-3 py-2 text-left font-bold">Item</th>
                <th className="px-2 py-2 text-right font-bold">Awal</th>
                <th className="px-2 py-2 text-right font-bold">Masuk</th>
                <th className="px-2 py-2 text-right font-bold">Terjual</th>
                <th className="px-2 py-2 text-right font-bold">Kembali</th>
                <th className="px-2 py-2 text-right font-bold">Susut</th>
                <th className="px-2 py-2 text-right font-bold">Opname</th>
                <th className="px-2 py-2 text-right font-bold">Sisa</th>
                <th className="px-3 py-2 text-right font-bold">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tabel.map((x) => {
                const low = a.stock.find((r) => r.itemId === x.itemId)?.lowAt ?? 0;
                const tipis = x.sisa !== null && x.sisa <= low;
                // Baris yang tidak bisa dipertanggungjawabkan ditandai, bukan disembunyikan.
                const cocok = x.awal === null || x.sisa === null ||
                  x.awal + x.masuk - x.terjual + x.kembali - x.susut + x.opname === x.sisa;
                return (
                  <tr key={x.itemId} className={tipis ? "bg-red-500/5" : ""}>
                    <td className="px-3 py-1.5 text-cream">
                      {x.nama}
                      {!cocok && <span className="ml-1 text-[10px] text-red-300" title="Angkanya tidak menutup">⚠</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-mute">{x.awal ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-emerald-400">{x.masuk || ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-cream">{x.terjual || ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-mute">{x.kembali || ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-red-300">{x.susut || ""}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${x.opname < 0 ? "text-red-300" : "text-mute"}`}>
                      {x.opname ? (x.opname > 0 ? "+" : "") + x.opname : ""}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${tipis ? "text-red-300" : "text-cream"}`}>
                      {x.sisa ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-amber">{x.nilai ? rupiah(x.nilai) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-mute">
        <span>{tabel.reduce((n, x) => n + x.terjual, 0)} barang terjual hari itu</span>
        <span className="text-cream">{rupiah(tabel.reduce((n, x) => n + x.nilai, 0))}</span>
        <button onClick={() => void unduh()}
          className="ml-auto min-h-[36px] rounded-lg border border-line px-3 text-[12px] text-cream hover:border-amber hover:text-amber">
          Unduh CSV {rangeDays(dari, sampai)} hari
        </button>
      </div>
      {pesan && <p role="status" className="mt-1 text-[12px] text-amber">{pesan}</p>}

      <div className="mt-2 rounded-xl border border-line bg-ink-2 p-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-dim">Cocokkan dengan rekap uang</div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
          <span className="text-mute">Barang keluar <span className="tabular-nums text-cream">{rupiah(banding.barang)}</span></span>
          <span className="text-mute">Uang F&amp;B <span className="tabular-nums text-cream">{rupiah(banding.uang)}</span></span>
          <span className={`tabular-nums ${banding.selisih === 0 ? "text-emerald-400" : "text-amber"}`}>
            {banding.selisih === 0 ? "cocok" : `beda ${rupiah(Math.abs(banding.selisih))}`}
          </span>
        </div>
        {banding.selisih !== 0 && (
          <p className="mt-1 text-[10px] leading-snug text-dim">
            {banding.selisih > 0
              ? "Uang lebih besar: ada tab lama yang barangnya keluar hari sebelumnya tapi baru dibayar hari ini."
              : "Barang lebih besar: ada tab hari ini yang belum ditutup, jadi uangnya belum dihitung."}
          </p>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-dim">
        Barang berkurang saat DIPESAN, sedangkan uang dihitung saat tab DITUTUP. Tab yang dibuka
        semalam dan baru dibayar siang ini muncul di rekap uang hari ini, tapi barangnya sudah
        keluar kemarin — jadi dua angka itu memang tidak selalu sama hari. "Kembali" = pesanan
        yang di-void atau booking batal, barangnya masuk stok lagi. "Opname" = selisih hitung fisik.
      </p>

      {/* Hitung fisik (opname) */}
      {opname && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog" aria-modal="true" aria-label="Hitung fisik stok">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-ink-2 p-4 sm:rounded-2xl">
            <h3 className="font-serif text-lg font-bold text-cream">Hitung fisik (opname)</h3>
            <p className="mt-1 text-[12px] leading-snug text-dim">
              Isi jumlah yang BENAR-BENAR ada di rak. Selisihnya dicatat sebagai opname, bukan
              menimpa riwayat penjualan. Disarankan seminggu sekali.
            </p>
            <div className="mt-3 space-y-1.5">
              {a.stock.filter((r) => r.qty !== null).map((r) => (
                <div key={r.itemId} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[13px] text-cream">{findItem(r.itemId)?.name ?? r.itemId}</span>
                  <span className="w-16 text-right text-[11px] tabular-nums text-dim">sistem {r.qty}</span>
                  <input type="number" inputMode="numeric" min={0} value={opname[r.itemId] ?? ""}
                    onChange={(e) => setOpname((o) => ({ ...(o ?? {}), [r.itemId]: e.target.value }))}
                    className="min-h-[38px] w-20 rounded-lg border border-line bg-ink px-2 text-right text-[13px] tabular-nums text-cream focus:border-amber focus:outline-none" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`text-[12px] tabular-nums ${selisihOpname < 0 ? "text-red-300" : "text-mute"}`}>
                Selisih {selisihOpname > 0 ? "+" : ""}{selisihOpname}
              </span>
              <button onClick={() => setOpname(null)}
                className="ml-auto min-h-[40px] rounded-lg border border-line px-4 text-[13px] text-mute">Batal</button>
              <button onClick={simpanOpname}
                className="min-h-[40px] rounded-lg bg-amber px-4 text-[13px] font-bold text-ink">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
