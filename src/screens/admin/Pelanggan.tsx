/**
 * Tab PELANGGAN — database tamu milik venue.
 *
 * Isinya terkumpul sendiri dari booking & pesanan yang menyertakan nomor HP;
 * tidak ada yang perlu diketik ulang staf. Nomor dirapikan (0812… → 62812…)
 * supaya satu orang tidak terhitung dua kali.
 *
 * Data ini hanya terbuka untuk perangkat dengan sesi PIN — HP pelanggan tidak
 * bisa membacanya sama sekali (dijaga server, lihat supabase/schema-pelanggan.sql).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdmin } from "../../lib/adminStore";
import { venueStore } from "../../lib/venueStore";
import type { Pelanggan } from "../../lib/supabaseRemote";
import { rupiah } from "../../lib/core";
import DaftarMember from "./MemberList";

const tanggal = (ms: number) =>
  new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const nomorTampil = (hp: string) => (hp.startsWith("62") ? "0" + hp.slice(2) : hp);

export default function PelangganScreen() {
  const { sync, allow } = useAdmin();
  const store = venueStore() as ReturnType<typeof venueStore> & {
    pelanggan?: (cari?: string) => Promise<Pelanggan[]>;
    catatanPelanggan?: (phone: string, catatan: string) => Promise<void>;
    lupakanPelanggan?: (phone: string) => Promise<number>;
  };

  const [cari, setCari] = useState("");
  const [baris, setBaris] = useState<Pelanggan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  // Dua daftar: kunjungan (terkumpul sendiri dari transaksi) dan MEMBER
  // (tamu yang mendaftar sendiri di aplikasi — dipakai untuk blast promo).
  const [tab, setTab] = useState<"kunjungan" | "member">("kunjungan");

  const muat = useCallback(async (q: string) => {
    if (!store.pelanggan) return;
    setSibuk(true);
    try {
      setBaris(await store.pelanggan(q));
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setSibuk(false);
    }
  }, [store]);

  useEffect(() => {
    const t = setTimeout(() => void muat(cari), cari ? 350 : 0);
    return () => clearTimeout(t);
  }, [cari, muat]);

  const ringkas = useMemo(() => {
    const d = baris ?? [];
    return {
      orang: d.length,
      kunjungan: d.reduce((n, x) => n + x.kunjungan, 0),
      belanja: d.reduce((n, x) => n + Number(x.belanja || 0), 0),
      langganan: d.filter((x) => x.kunjungan >= 3).length,
    };
  }, [baris]);

  if (sync.mode !== "server") {
    return (
      <div className="rounded-xl border border-line bg-ink-2 p-4 text-sm text-mute">
        Database pelanggan tersimpan di server. Aplikasi ini sedang berjalan tanpa server,
        jadi daftarnya belum bisa ditampilkan.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {([["kunjungan", "Kunjungan"], ["member", "Member aplikasi"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`min-h-[40px] rounded-xl border text-[13px] font-semibold ${
              tab === k ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink-2 text-mute"
            }`}>{label}</button>
        ))}
      </div>

      {tab === "member" ? <DaftarMember /> : (<>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "Pelanggan", v: String(ringkas.orang) },
          { k: "Kunjungan", v: String(ringkas.kunjungan) },
          { k: "Langganan (3×+)", v: String(ringkas.langganan) },
          { k: "Total belanja", v: rupiah(ringkas.belanja) },
        ].map((x) => (
          <div key={x.k} className="rounded-xl border border-line bg-ink-2 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">{x.k}</p>
            <p className="mt-1 font-serif text-lg text-cream tabular-nums">{x.v}</p>
          </div>
        ))}
      </div>

      <input
        value={cari}
        onChange={(e) => setCari(e.target.value)}
        placeholder="Cari nama atau nomor HP…"
        className="min-h-[44px] w-full rounded-xl border border-line bg-ink-2 px-4 text-sm text-cream placeholder:text-dim"
      />

      {galat && <p role="alert" className="text-xs text-red-400">{galat}</p>}
      {sibuk && !baris && <p className="text-sm text-dim">Memuat…</p>}

      {baris && baris.length === 0 && (
        <div className="rounded-xl border border-line bg-ink-2 p-4 text-sm text-mute">
          {cari
            ? "Tidak ada pelanggan yang cocok."
            : "Belum ada data. Setiap booking atau pesanan yang menyertakan nomor HP akan muncul di sini sendiri."}
        </div>
      )}

      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
        {(baris ?? []).map((p) => (
          <div key={p.phone} className="p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-cream">
                  {p.nama}
                  {p.kunjungan >= 3 && (
                    <span className="ml-2 rounded-full bg-amber/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
                      langganan
                    </span>
                  )}
                </p>
                <a href={`https://wa.me/${p.phone}`} target="_blank" rel="noreferrer"
                  className="text-xs text-mute underline underline-offset-4">
                  {nomorTampil(p.phone)}
                </a>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-serif text-sm text-cream tabular-nums">{rupiah(Number(p.belanja || 0))}</p>
                <p className="text-[11px] text-dim">{p.kunjungan}× · terakhir {tanggal(Number(p.terakhir_ms))}</p>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                defaultValue={p.catatan ?? ""}
                placeholder="Catatan (mis. suka VIP 2, rombongan kantor)"
                onBlur={(e) => {
                  const nilai = e.target.value.trim();
                  if (nilai !== (p.catatan ?? "")) void store.catatanPelanggan?.(p.phone, nilai);
                }}
                className="min-h-[36px] flex-1 rounded-lg border border-line bg-ink px-3 text-xs text-cream placeholder:text-dim"
              />
              {allow("lihatLaporanKeuangan") && (
                <button
                  onClick={async () => {
                    if (!confirm(`Hapus seluruh riwayat ${p.nama} (${nomorTampil(p.phone)}) dari database pelanggan?\n\nTransaksi di laporan keuangan tidak ikut terhapus.`)) return;
                    await store.lupakanPelanggan?.(p.phone);
                    void muat(cari);
                  }}
                  className="min-h-[36px] rounded-lg border border-line px-3 text-xs text-dim"
                >Hapus data</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-snug text-dim">
        Data ini terkumpul dari booking &amp; pesanan yang menyertakan nomor HP. Pelanggan berhak meminta
        datanya dihapus (UU PDP) — pakai tombol "Hapus data"; angka penjualan di Rekap tidak terpengaruh.
      </p>
      </>)}
    </div>
  );
}
