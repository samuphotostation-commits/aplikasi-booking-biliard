/**
 * DAFTAR MEMBER — tamu yang mendaftar sendiri di aplikasi sebelum booking.
 *
 * Permintaan pemilik: booking online harus lewat akun, supaya datanya menjadi
 * milik venue dan bisa dipakai blast promo. Halaman ini yang memakainya:
 * daftar member + izin promonya + tombol salin nomor / unduh CSV.
 *
 * Izin promo ditegakkan di sini: tombol "Salin nomor" HANYA mengambil yang
 * mencentang izin (UU PDP). PIN member tidak pernah bisa dilihat siapa pun —
 * kalau tamu lupa, kasir menekan Reset PIN dan membacakan PIN sementaranya.
 */
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../../lib/adminStore";
import { venueStore } from "../../lib/venueStore";
import type { MemberBaris } from "../../lib/supabaseRemote";
import { rupiah } from "../../lib/core";
import { saveTextFile } from "../../lib/saveFile";

const tanggal = (ms: number) =>
  new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const nomorTampil = (hp: string) => (hp.startsWith("62") ? "0" + hp.slice(2) : hp);

export default function DaftarMember() {
  const { allow } = useAdmin();
  const store = venueStore() as ReturnType<typeof venueStore> & {
    member?: (cari?: string) => Promise<MemberBaris[]>;
    resetPinMember?: (phone: string) => Promise<{ ok: boolean; pin?: string; alasan?: string }>;
    lupakanMember?: (phone: string) => Promise<number>;
  };

  const [cari, setCari] = useState("");
  const [hanyaSetuju, setHanyaSetuju] = useState(false);
  const [baris, setBaris] = useState<MemberBaris[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const muat = useCallback(async (q: string) => {
    if (!store.member) return;
    try {
      setBaris(await store.member(q));
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat");
    }
  }, [store]);

  useEffect(() => {
    const t = setTimeout(() => void muat(cari), cari ? 350 : 0);
    return () => clearTimeout(t);
  }, [cari, muat]);

  const semua = baris ?? [];
  const tampil = semua.filter((m) => !hanyaSetuju || m.setuju_promo);
  const bolehDiblast = tampil.filter((m) => m.setuju_promo);

  async function unduhCSV() {
    const rows = [
      ["nomor_hp", "nama", "email", "izin_promo", "daftar_sejak", "terakhir_aktif", "kunjungan", "belanja"],
      ...tampil.map((m) => [
        m.phone, m.nama, m.email, m.setuju_promo ? "ya" : "tidak",
        tanggal(Number(m.sejak_ms)), tanggal(Number(m.terakhir_ms)),
        String(m.kunjungan), String(Number(m.belanja || 0)),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const hasil = await saveTextFile(`member-spl-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setPesan(hasil === "tersimpan" ? "Daftar member tersimpan."
      : hasil === "dibatalkan" ? "Penyimpanan dibatalkan." : "Gagal menyimpan berkas.");
    setTimeout(() => setPesan(null), 4000);
  }

  async function salinNomor() {
    try {
      await navigator.clipboard.writeText(bolehDiblast.map((m) => m.phone).join("\n"));
      setPesan(`${bolehDiblast.length} nomor disalin — tinggal tempel di alat blast WhatsApp.`);
    } catch {
      setPesan("Tidak bisa menyalin di perangkat ini — pakai Unduh CSV.");
    }
    setTimeout(() => setPesan(null), 5000);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "Member", v: String(semua.length) },
          { k: "Izin promo", v: String(semua.filter((m) => m.setuju_promo).length) },
          { k: "Punya email", v: String(semua.filter((m) => m.email).length) },
          { k: "Belanja member", v: rupiah(semua.reduce((n, m) => n + Number(m.belanja || 0), 0)) },
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
        placeholder="Cari nama, nomor HP, atau email…"
        className="min-h-[44px] w-full rounded-xl border border-line bg-ink-2 px-4 text-sm text-cream placeholder:text-dim"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12px] text-mute">
          <input type="checkbox" checked={hanyaSetuju} onChange={(e) => setHanyaSetuju(e.target.checked)}
            className="h-4 w-4 accent-amber" />
          Hanya yang mengizinkan promo
        </label>
        <button onClick={() => void salinNomor()} disabled={bolehDiblast.length === 0}
          className="min-h-[36px] rounded-lg border border-line px-3 text-xs text-mute hover:border-amber hover:text-amber disabled:opacity-40">
          Salin {bolehDiblast.length} nomor (blast)
        </button>
        <button onClick={() => void unduhCSV()} disabled={tampil.length === 0}
          className="min-h-[36px] rounded-lg border border-line px-3 text-xs text-mute hover:border-amber hover:text-amber disabled:opacity-40">
          Unduh CSV
        </button>
      </div>

      {galat && <p role="alert" className="text-xs text-red-400">{galat}</p>}
      {pesan && <p className="text-[12px] text-amber">{pesan}</p>}

      {baris && tampil.length === 0 && (
        <div className="rounded-xl border border-line bg-ink-2 p-4 text-sm text-mute">
          {cari || hanyaSetuju
            ? "Tidak ada member yang cocok."
            : "Belum ada member. Tamu mendaftar sendiri di aplikasi sebelum booking — daftarnya muncul di sini."}
        </div>
      )}

      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-2">
        {tampil.map((m) => (
          <div key={m.phone} className="p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-cream">
                  {m.nama}
                  {m.setuju_promo && (
                    <span className="ml-2 rounded-full bg-amber/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber">
                      promo
                    </span>
                  )}
                </p>
                <a href={`https://wa.me/${m.phone}`} target="_blank" rel="noreferrer"
                  className="text-xs text-mute underline underline-offset-4">{nomorTampil(m.phone)}</a>
                {m.email && <p className="truncate text-[11px] text-dim">{m.email}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-serif text-sm text-cream tabular-nums">{rupiah(Number(m.belanja || 0))}</p>
                <p className="text-[11px] text-dim">
                  {m.kunjungan}× · member sejak {tanggal(Number(m.sejak_ms))}
                </p>
              </div>
            </div>

            {allow("lihatLaporanKeuangan") && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    if (!confirm(`Reset PIN member ${m.nama}? PIN lamanya langsung tidak berlaku dan semua perangkatnya keluar.`)) return;
                    const r = await store.resetPinMember?.(m.phone);
                    setPesan(r?.ok
                      ? `PIN sementara ${m.nama}: ${r.pin} — bacakan langsung ke tamunya, jangan dikirim lewat chat.`
                      : (r?.alasan ?? "Reset PIN gagal"));
                  }}
                  className="min-h-[36px] rounded-lg border border-line px-3 text-xs text-mute hover:border-amber hover:text-amber"
                >Reset PIN</button>
                <button
                  onClick={async () => {
                    if (!confirm(`Hapus akun member ${m.nama} (${nomorTampil(m.phone)})?\n\nRiwayat kunjungan & angka penjualan tidak ikut terhapus.`)) return;
                    await store.lupakanMember?.(m.phone);
                    void muat(cari);
                  }}
                  className="min-h-[36px] rounded-lg border border-line px-3 text-xs text-dim"
                >Hapus akun</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-snug text-dim">
        Blast promo hanya boleh ke member yang mencentang izin promo (UU PDP) — tombol "Salin nomor"
        sudah membuang yang tidak mengizinkan. PIN member tidak bisa dilihat siapa pun, termasuk pemilik;
        kalau tamu lupa, pakai Reset PIN.
      </p>
    </div>
  );
}
