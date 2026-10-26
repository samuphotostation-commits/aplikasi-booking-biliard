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
import { useMemo, useState } from "react";
import { useAdmin, jejakVenue, businessDateOf } from "../../lib/adminStore";
import { rupiah } from "../../lib/core";
import { VENUE_LABEL } from "../../data/venue";
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
      "Takeaway", "Pesanan dibayar", "Setoran"],
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

export default function Jejak() {
  const { a } = useAdmin();
  const venue = useVenueAktif();
  const [jenis, setJenis] = useState<Jenis>("semua");
  const [siapa, setSiapa] = useState<string>("semua");
  const [q, setQ] = useState("");
  const [batas, setBatas] = useState(100);

  const semua = useMemo(() => jejakVenue(a, venue), [a, venue]);

  /** Nama yang pernah muncul di jejak venue ini, urut abjad. */
  const orang = useMemo(
    () => [...new Set(semua.map((l) => l.who))].sort((p, r) => p.localeCompare(r, "id")),
    [semua],
  );

  const cari = q.trim().toLowerCase();
  const baris = useMemo(() => semua.filter((l) => {
    if (siapa !== "semua" && l.who !== siapa) return false;
    if (jenis !== "semua" && jenisDari(l.what) !== jenis) return false;
    if (cari && !`${l.who} ${l.what}`.toLowerCase().includes(cari)) return false;
    return true;
  }), [semua, siapa, jenis, cari]);

  /** Berapa baris yang menggerakkan uang, dan berapa nilainya — ringkas di atas. */
  const berat = baris.filter((l) => BERAT.has(jenisDari(l.what)));

  /* Baris dikelompokkan per HARI OPERASIONAL (berganti 05.00), bukan per
     tanggal kalender: shift yang jalan sampai jam 2 pagi tetap satu malam. */
  const perHari = useMemo(() => {
    const m = new Map<string, typeof baris>();
    for (const l of baris.slice(0, batas)) {
      const h = businessDateOf(l.at);
      const arr = m.get(h);
      if (arr) arr.push(l); else m.set(h, [l]);
    }
    return [...m.entries()];
  }, [baris, batas]);

  return (
    <div className="space-y-4 pb-6">
      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
          Jejak aktivitas · {VENUE_LABEL[venue]}
        </h2>
        <p className="mb-2.5 text-[11px] leading-relaxed text-dim">
          Siapa melakukan apa, dan jam berapa. Catatan ini tidak bisa diubah atau dihapus
          oleh siapa pun — termasuk oleh yang melakukannya.
        </p>

        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, meja, atau kejadian…"
          className="min-h-[44px] w-full rounded-xl border border-line bg-ink px-4 text-[13px]
            text-cream placeholder:text-dim focus:border-amber focus:outline-none" />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["semua", ...Object.keys(JENIS)] as Jenis[]).map((k) => (
            <button key={k} onClick={() => setJenis(k)} aria-pressed={jenis === k}
              className={`min-h-[36px] rounded-lg border px-3 text-[12px] font-semibold ${
                jenis === k ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
              }`}>
              {k === "semua" ? "Semua" : JENIS[k as keyof typeof JENIS].label}
            </button>
          ))}
        </div>

        {orang.length > 1 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["semua", ...orang].map((nm) => (
              <button key={nm} onClick={() => setSiapa(nm)} aria-pressed={siapa === nm}
                className={`min-h-[34px] rounded-lg border px-2.5 text-[12px] ${
                  siapa === nm ? "border-brick-lit bg-brick text-cream" : "border-line bg-ink-2 text-mute"
                }`}>
                {nm === "semua" ? "Semua orang" : nm}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Kotak k="Kejadian" v={String(baris.length)} />
        <Kotak k={`Menggerakkan uang · ${berat.length}`}
          v={rupiah(berat.reduce((n, l) => n + (l.amount ?? 0), 0))} />
      </section>

      {baris.length === 0 ? (
        <p className="rounded-xl border border-line bg-ink-2 px-4 py-8 text-center text-[13px] text-dim">
          {semua.length === 0
            ? "Belum ada aktivitas di venue ini."
            : "Tidak ada yang cocok dengan saringan ini."}
        </p>
      ) : (
        <div className="space-y-3">
          {perHari.map(([hari, isi]) => (
            <section key={hari}>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
                {new Date(`${hari}T12:00:00`).toLocaleDateString("id-ID",
                  { weekday: "long", day: "numeric", month: "long" })} · {isi.length}
              </h3>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
                {isi.map((l, i) => {
                  const jn = jenisDari(l.what);
                  return (
                    <div key={`${l.at}-${i}`} className="flex items-baseline gap-2.5 px-3 py-2">
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-dim">{jam(l.at)}</span>
                      <span className="min-w-0 flex-1">
                        {/* NAMA PELAKUNYA DI DEPAN — itu yang dicari saat panel ini dibuka. */}
                        <span className={`mr-1.5 text-[12px] font-semibold ${
                          BERAT.has(jn) ? "text-amber" : "text-cream"}`}>{l.who}</span>
                        <span className="text-[12px] leading-snug text-mute">{l.what}</span>
                      </span>
                      {l.amount ? (
                        <span className="shrink-0 font-serif text-[12px] tabular-nums text-cream">
                          {rupiah(l.amount)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {baris.length > batas && (
            <button onClick={() => setBatas(batas + 200)}
              className="min-h-[44px] w-full rounded-xl border border-line bg-ink-2 text-[13px] text-cream">
              Tampilkan lebih banyak · sisa {baris.length - batas}
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-dim">
        Yang tampil di sini riwayat terbaru. Catatan lengkapnya tersimpan utuh dan sama di
        semua perangkat.
      </p>
    </div>
  );
}

function Kotak({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink-2 px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-dim">{k}</div>
      <div className="font-serif text-lg font-bold tabular-nums text-cream">{v}</div>
    </div>
  );
}
