/**
 * JEJAK AKTIVITAS — siapa melakukan apa, kapan, di venue mana.
 *
 * Permintaan pemilik 21 Okt 2026: *"jejak aktivitasnya bisa dibuat lengkap
 * bahkan sampai akun yg melakukannya agar tracking lebih detail … dan jejak
 * aktivitas di panel khusus untuk memantau setiap perubahan dan aktivitas,
 * dan pastikan di pisah juga antara spl sport dan smokehouse nya."*
 *
 * Dulu jejaknya menumpang di bawah tab Rekap: 12 baris terakhir, tanpa nama
 * pelakunya, dua venue bercampur — padahal keterangan di bawahnya menjanjikan
 * "tercatat lengkap dengan siapa pelakunya". Yang dijanjikan memang tercatat;
 * yang tidak ada cuma tempat untuk membacanya.
 *
 * TIGA HAL YANG MEMBEDAKAN PANEL INI DARI SEBUAH DAFTAR BIASA:
 *
 * 1. NAMA PELAKUNYA DI DEPAN, bukan di belakang. Yang dicari pemilik saat
 *    membuka panel ini hampir selalu "siapa", bukan "apa".
 * 2. BISA DISARING PER ORANG DAN PER JENIS. Jejak tanpa saringan adalah
 *    dinding teks: yang mencurigakan tenggelam di antara yang biasa.
 * 3. YANG MENGGERAKKAN UANG DITANDAI. Buka meja, tutup tab, void, diskon,
 *    dan perubahan tarif berbeda bobotnya dengan menyalakan lampu.
 */
import { JudulBagian, KepalaHalaman, Kosong } from "./Tata";
import { useMemo, useState } from "react";
import { useAdmin, jejakVenue, businessDateOf } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { useVenueAktif } from "../../lib/venueAktif";
import { jam } from "./AdminShell";

/**
 * Jenis kejadian, dibaca dari kalimat jejaknya.
 *
 * Kalimatnya memang bahasa manusia dan bukan kode — itu disengaja sejak awal,
 * supaya jejak lama tetap terbaca utuh walau kodenya berubah. Konsekuensinya:
 * pengelompokan di sini membaca kata-kata depannya, dan kalimat yang tidak
 * dikenali jatuh ke "Lainnya" — tidak pernah hilang.
 */
const JENIS = {
  uang: {
    label: "Uang",
    kata: ["Tab ditutup", "Bayar sebagian", "Pembayaran", "Refund", "Dana dikembalikan",
      "Takeaway", "Pesanan dibayar", "Setoran", "Biaya"],
  },
  void: { label: "Void & diskon", kata: ["Void", "Compliment", "Diskon"] },
  meja: {
    label: "Meja",
    kata: ["Meja dibuka", "Pindah meja", "Pesanan dipindah", "Perpanjang", "Gabung",
      "Pisah", "Check-in", "Meja dinonaktifkan", "No-show", "Dipulihkan"],
  },
  pesanan: { label: "Pesanan", kata: ["Pesanan", "Koreksi pesanan", "Paket dijual", "Reservasi"] },
  atur: {
    label: "Pengaturan",
    kata: ["Tarif", "Pajak", "Harga", "Paket", "Promo", "Akun staf", "Menu", "Barang",
      "Nama meja", "Kelas meja", "Mesin EDC", "Gudang", "Stok", "Opname", "Transfer"],
  },
  shift: { label: "Shift", kata: ["Shift", "Absen", "Tutup buku"] },
} as const;

type Jenis = keyof typeof JENIS | "semua";

const jenisDari = (what: string): keyof typeof JENIS | "lain" => {
  for (const [k, v] of Object.entries(JENIS)) {
    if (v.kata.some((w) => what.startsWith(w))) return k as keyof typeof JENIS;
  }
  return "lain";
};

/** Kejadian yang menggerakkan uang — ditandai supaya tidak tenggelam. */
const BERAT = new Set<ReturnType<typeof jenisDari>>(["uang", "void"]);

/** Warna label jenis di tiap baris — supaya mata langsung menemukan uang & void. */
const WARNA_JENIS: Record<ReturnType<typeof jenisDari>, string> = {
  uang: "bg-emerald-500/15 text-emerald-300",
  void: "bg-red-500/15 text-red-300",
  meja: "bg-sky-400/15 text-sky-300",
  pesanan: "bg-amber/15 text-amber",
  atur: "bg-purple-400/15 text-purple-300",
  shift: "bg-cream/10 text-cream",
  lain: "bg-ink text-dim",
};

/** Rentang waktu, dihitung dalam HARI OPERASIONAL. */
const RENTANG = [["hari", "Hari ini"], ["7", "7 hari"], ["30", "30 hari"], ["semua", "Semua"]] as const;
type Rentang = (typeof RENTANG)[number][0];

const geserHari = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/*
 * SUSUNAN (perapian 14 Nov 2026, "masih tidak ramah user dan berantakan"):
 *   · Kepala: venue + angka ringkas (kejadian, orang, uang, void).
 *   · Saringan menempel di atas: cari, rentang waktu, jenis (dengan jumlah),
 *     dan orang sebagai pilihan tarik-turun — dulu deretan tombol nama yang
 *     memanjang seiring bertambahnya staf.
 *   · Tiap baris memakai label jenis berwarna; kepala hari menyebut jumlah
 *     kejadian dan uang yang bergerak hari itu.
 */
export default function Jejak() {
  const { a } = useAdmin();
  const venue = useVenueAktif();
  const [jenis, setJenis] = useState<Jenis>("semua");
  const [siapa, setSiapa] = useState<string>("semua");
  const [rentang, setRentang] = useState<Rentang>("7");
  const [q, setQ] = useState("");
  const [batas, setBatas] = useState(150);

  const semua = useMemo(() => jejakVenue(a, venue), [a, venue]);
  const hariIni = businessDateOf(Date.now());
  const dariHari = rentang === "semua" ? "" : rentang === "hari" ? hariIni : geserHari(hariIni, -(Number(rentang) - 1));

  /** Jejak dalam rentang waktu — dasar hitungan jenis & orang. */
  const dalamRentang = useMemo(
    () => (dariHari ? semua.filter((l) => businessDateOf(l.at) >= dariHari) : semua),
    [semua, dariHari],
  );

  /** Nama yang muncul di rentang ini, urut abjad. */
  const orang = useMemo(
    () => [...new Set(dalamRentang.map((l) => l.who))].sort((p, r) => p.localeCompare(r, "id")),
    [dalamRentang],
  );

  const cari = q.trim().toLowerCase();
  const tanpaJenis = useMemo(() => dalamRentang.filter((l) => {
    if (siapa !== "semua" && l.who !== siapa) return false;
    if (cari && !`${l.who} ${l.what}`.toLowerCase().includes(cari)) return false;
    return true;
  }), [dalamRentang, siapa, cari]);
  const baris = useMemo(
    () => (jenis === "semua" ? tanpaJenis : tanpaJenis.filter((l) => jenisDari(l.what) === jenis)),
    [tanpaJenis, jenis],
  );
  const jumlahJenis = (k: Jenis) => (k === "semua" ? tanpaJenis.length : tanpaJenis.filter((l) => jenisDari(l.what) === k).length);

  /** Berapa baris yang menggerakkan uang, dan berapa nilainya — ringkas di atas. */
  const berat = baris.filter((l) => BERAT.has(jenisDari(l.what)));
  const nVoid = baris.filter((l) => jenisDari(l.what) === "void").length;

  /* Baris dikelompokkan per HARI OPERASIONAL, bukan per tanggal kalender:
     shift yang jalan sampai lewat tengah malam tetap satu malam. */
  const perHari = useMemo(() => {
    const m = new Map<string, typeof baris>();
    for (const l of baris.slice(0, batas)) {
      const h = businessDateOf(l.at);
      const arr = m.get(h);
      if (arr) arr.push(l); else m.set(h, [l]);
    }
    return [...m.entries()];
  }, [baris, batas]);

  const adaSaring = jenis !== "semua" || siapa !== "semua" || !!cari || rentang !== "7";
  const ulangSaring = () => { setJenis("semua"); setSiapa("semua"); setQ(""); setRentang("7"); };

  return (
    <div className="space-y-4 pb-6">
      <KepalaHalaman judul="Jejak aktivitas" venue={venue}
        ket="Siapa melakukan apa, dan jam berapa. Catatan ini tidak bisa diubah atau dihapus oleh siapa pun — termasuk oleh yang melakukannya."
        angka={[
          { label: "Kejadian", nilai: baris.length },
          { label: "Orang", nilai: new Set(baris.map((l) => l.who)).size },
          { label: `Menggerakkan uang · ${berat.length}`, nilai: rupiah(berat.reduce((n, l) => n + (l.amount ?? 0), 0)), nada: "amber" },
          { label: "Void & diskon", nilai: nVoid, nada: nVoid ? "merah" : undefined },
        ]} />

      {/* ── SARINGAN — menempel di atas saat menggulir ── */}
      <section className="sticky top-[104px] z-20 -mx-4 space-y-2 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-[2]">
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari jejak"
              placeholder="Cari nama, meja, menu, atau kejadian…"
              className="min-h-[42px] w-full rounded-xl border border-line bg-ink-2 px-4 pr-10 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            {q && (
              <button onClick={() => setQ("")} aria-label="Hapus pencarian"
                className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-mute hover:text-cream">×</button>
            )}
          </div>
          <select value={siapa} onChange={(e) => setSiapa(e.target.value)} aria-label="Saring per orang"
            className="min-h-[42px] min-w-[160px] flex-1 rounded-xl border border-line bg-ink-2 px-3 text-[13px] text-cream focus:border-amber focus:outline-none">
            <option value="semua">Semua orang ({orang.length})</option>
            {orang.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
          </select>
        </div>

        <div className="no-bar flex items-center gap-1.5 overflow-x-auto">
          {RENTANG.map(([k, l]) => (
            <button key={k} onClick={() => setRentang(k)} aria-pressed={rentang === k}
              className={`min-h-[34px] shrink-0 rounded-lg px-3 text-[12px] font-semibold ${
                rentang === k ? "bg-cream text-ink" : "bg-ink-2 text-mute hover:text-cream"
              }`}>{l}</button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          {(["semua", ...Object.keys(JENIS)] as Jenis[]).map((k) => (
            <button key={k} onClick={() => setJenis(k)} aria-pressed={jenis === k}
              className={`min-h-[34px] shrink-0 rounded-lg border px-3 text-[12px] font-semibold ${
                jenis === k ? "border-amber bg-amber/10 text-amber" : "border-line text-mute hover:text-cream"
              }`}>
              {k === "semua" ? "Semua jenis" : JENIS[k as keyof typeof JENIS].label}
              <span className="ml-1 text-[11px] font-normal text-dim">{jumlahJenis(k)}</span>
            </button>
          ))}
          {adaSaring && (
            <button onClick={ulangSaring} className="min-h-[34px] shrink-0 px-2 text-[12px] text-dim underline underline-offset-2">
              Atur ulang
            </button>
          )}
        </div>
      </section>

      {baris.length === 0 ? (
        <Kosong teks={semua.length === 0
          ? "Belum ada aktivitas di venue ini."
          : <>Tidak ada yang cocok dengan saringan ini.{rentang !== "semua" && " Coba pilih rentang \"Semua\"."}</>} />
      ) : (
        <div className="space-y-4">
          {perHari.map(([hari, isi]) => {
            const uangHari = isi.filter((l) => BERAT.has(jenisDari(l.what))).reduce((n, l) => n + (l.amount ?? 0), 0);
            return (
              <section key={hari}>
                <JudulBagian
                  judul={new Date(`${hari}T12:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
                  jumlah={isi.length}
                  aksi={uangHari > 0 && <span className="text-[11px] text-dim">uang bergerak <span className="text-amber">{rupiah(uangHari)}</span></span>} />
                <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
                  {isi.map((l, i) => {
                    const jn = jenisDari(l.what);
                    return (
                      <div key={`${l.at}-${i}`} className={`flex items-start gap-3 px-3 py-2.5 ${BERAT.has(jn) ? "bg-amber/[0.03]" : ""}`}>
                        <span className="w-11 shrink-0 pt-0.5 font-mono text-[12px] tabular-nums text-dim">{jam(l.at)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {/* NAMA PELAKUNYA DI DEPAN — itu yang dicari saat panel ini dibuka. */}
                            <button onClick={() => setSiapa(l.who)} title={`Lihat jejak ${l.who} saja`}
                              className={`text-[13px] font-semibold hover:underline ${BERAT.has(jn) ? "text-amber" : "text-cream"}`}>
                              {l.who}
                            </button>
                            <span className={`rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wider ${WARNA_JENIS[jn]}`}>
                              {jn === "lain" ? "Lainnya" : JENIS[jn].label}
                            </span>
                          </div>
                          <div className="text-[12px] leading-snug text-mute">{l.what}</div>
                        </div>
                        {l.amount ? (
                          <span className="shrink-0 pt-0.5 font-serif text-[13px] tabular-nums text-cream">{rupiah(l.amount)}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {baris.length > batas && (
            <button onClick={() => setBatas(batas + 300)}
              className="min-h-[44px] w-full rounded-xl border border-line bg-ink-2 text-[13px] text-cream hover:border-amber">
              Tampilkan lebih banyak · sisa {baris.length - batas}
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-dim">
        Ketuk nama untuk melihat jejak orang itu saja. Catatan lengkapnya tersimpan utuh dan sama di semua perangkat;
        Jejak venue sebelah ada di pilihan venue kanan atas.
      </p>
    </div>
  );
}
