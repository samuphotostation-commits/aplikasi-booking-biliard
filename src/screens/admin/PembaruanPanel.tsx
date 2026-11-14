/*
 * APLIKASI & PEMBARUAN (permintaan pemilik 14 Nov 2026):
 *   "kalau ada pembaharuan sisa update di sana, atau perangkat yang terpasang
 *    saat ini aplikasinya ada notif untuk update"
 *
 * Dua bagian:
 *   - `SpandukPembaruan` — muncul di atas SEMUA layar panel, di perangkat apa
 *     pun, begitu ada versi lebih baru di server. Satu tombol.
 *   - `PembaruanPanel` — kartu di Pengaturan: versi perangkat ini, versi terbaru,
 *     dan tautan unduh aplikasi (Windows & Android) yang ditempel pemilik.
 */
import { useEffect, useState } from "react";
import { RILIS_WINDOWS } from "../../data/rilisWindows";
import { useAdmin } from "../../lib/adminStore";
import {
  SITUS_KASIR, adaPembaruan, jenisPerangkat, mulaiPantauPembaruan, perbaruiSekarang, periksaPembaruan, usePembaruan,
} from "../../lib/pembaruan";

const pendek = (build: string | null | undefined) =>
  build ? build.replace(/^index-/, "").replace(/\.js$/, "") : "—";
const tanggal = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export function SpandukPembaruan() {
  const p = usePembaruan();
  useEffect(() => { mulaiPantauPembaruan(); }, []);
  if (!adaPembaruan(p)) return null;
  const win = jenisPerangkat() === "windows";
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-2.5">
      <p className="text-[12px] leading-snug text-emerald-300">
        <span className="font-semibold">Versi baru aplikasi kasir tersedia.</span>{" "}
        {win ? "Diunduh & dipasang otomatis, lalu layar dimuat ulang." : "Layar akan dimuat ulang."}{" "}
        Data &amp; pesanan yang belum terkirim tetap aman.
        {p.pesan && <span className="mt-1 block text-amber">{p.pesan}</span>}
      </p>
      <button onClick={() => void perbaruiSekarang()} disabled={p.memperbarui}
        className="min-h-[40px] rounded-lg bg-emerald-500 px-3 text-[13px] font-bold text-ink disabled:opacity-60">
        {p.memperbarui ? "Mengunduh…" : "Perbarui sekarang"}
      </button>
    </div>
  );
}

const kelasInput = "min-h-[42px] w-full rounded-lg border border-line bg-ink px-3 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none";

export default function PembaruanPanel() {
  const { a, dispatchA, allow, peek } = useAdmin();
  const p = usePembaruan();
  const jenis = jenisPerangkat();
  const ada = adaPembaruan(p);
  const tautan = a.tautanUnduh ?? {};
  // APK kasir ikut terbit di situs kasir; tautan yang ditempel pemilik menang.
  const android = tautan.android ?? (p.terbaru?.android ? `${SITUS_KASIR}/${p.terbaru.android}` : undefined);
  // Installer Windows terbaru yang diterbitkan (Supabase Storage) menang; tautan manual = cadangan.
  const windows = RILIS_WINDOWS?.halaman ?? tautan.windows;
  const [ubah, setUbah] = useState<{ windows: string; android: string } | null>(null);
  const [catatan, setCatatan] = useState<string | null>(null);
  useEffect(() => { mulaiPantauPembaruan(); }, []);

  const salin = (url: string) => {
    void navigator.clipboard?.writeText(url).then(() => setCatatan("Tautan disalin — tinggal tempel di WhatsApp.")).catch(() => {});
  };

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">Aplikasi &amp; pembaruan</h2>
      <div className="space-y-2.5 rounded-xl border border-line bg-ink-2 p-3.5 text-[12px]">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-ink p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-dim">Perangkat ini</div>
            <div className="mt-0.5 font-semibold text-cream">
              {jenis === "windows" ? `Aplikasi Windows${p.aplikasiWindows ? ` ${p.aplikasiWindows}` : ""}`
                : jenis === "android" ? "Aplikasi Android" : "Browser"}
            </div>
            <div className="text-dim">versi halaman {pendek(p.saya)}</div>
          </div>
          <div className="rounded-lg border border-line bg-ink p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-dim">Terbaru di server</div>
            <div className="mt-0.5 font-semibold text-cream">{pendek(p.terbaru?.build)}</div>
            <div className="text-dim">{p.terbaru?.dibuat ? `diterbitkan ${tanggal(p.terbaru.dibuat)}` : p.memeriksa ? "memeriksa…" : "belum diperiksa"}</div>
          </div>
        </div>

        <p className={ada ? "font-semibold text-emerald-300" : "text-mute"}>
          {!p.saya ? "Pemeriksaan pembaruan hanya jalan di aplikasi yang sudah dipasang (bukan mode pengembangan)."
            : ada ? "Ada versi baru. Tekan Perbarui sekarang."
              : p.terbaru ? "Perangkat ini sudah memakai versi terbaru." : "Belum tahu — tekan Periksa sekarang."}
        </p>
        {p.pesan && <p className="text-amber">{p.pesan}</p>}
        <div className="flex gap-2">
          <button onClick={() => void periksaPembaruan()} disabled={p.memeriksa || !p.saya}
            className="min-h-[40px] flex-1 rounded-lg border border-line text-[12px] text-mute disabled:opacity-50">
            {p.memeriksa ? "Memeriksa…" : "Periksa sekarang"}
          </button>
          <button onClick={() => void perbaruiSekarang()} disabled={!ada || p.memperbarui}
            className="min-h-[40px] flex-1 rounded-lg bg-emerald-500 text-[12px] font-bold text-ink disabled:opacity-40">
            {p.memperbarui ? "Mengunduh…" : "Perbarui sekarang"}
          </button>
        </div>
        <p className="text-[11px] leading-snug text-dim">
          Semua perangkat memeriksa sendiri tiap 10 menit dan menampilkan pemberitahuan hijau di atas layar.
          Aplikasi Windows mengunduh pembaruannya sendiri; browser dan HP Android cukup dimuat ulang.
        </p>

        {/* ── Tautan unduh ───────────────────────────── */}
        <div className="rounded-lg border border-line bg-ink p-2.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Unduh aplikasi</div>
          {([
            [RILIS_WINDOWS ? `Windows (PC kasir) · versi ${RILIS_WINDOWS.versi}` : "Windows (PC kasir)", windows,
              RILIS_WINDOWS
                ? `Installer .exe terbaru${RILIS_WINDOWS.ukuranMb ? ` · ${RILIS_WINDOWS.ukuranMb} MB` : ""} · terbit ${RILIS_WINDOWS.tanggal} — klik Unduh, file .exe langsung terunduh dan diperiksa keutuhannya.`
                : "Installer .exe — pasang di PC baru, atau sekali di PC dengan SPL Kasir 1.1.x."],
            ["Android (HP / tablet)", android, "APK — membuka situs kasir langsung, jadi selalu versi terbaru."],
          ] as const).map(([label, url, ket]) => (
            <div key={label} className="mt-2 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-cream">{label}</div>
                <div className="text-[11px] text-dim">{url ? ket : "Belum ada tautan."}</div>
              </div>
              {url && (<>
                <a href={url} target="_blank" rel="noreferrer"
                  className="min-h-[34px] rounded-lg border border-amber/50 px-3 py-2 text-[12px] font-semibold text-amber">Unduh</a>
                <button onClick={() => salin(url)}
                  className="min-h-[34px] rounded-lg border border-line px-3 text-[12px] text-mute">Salin tautan</button>
              </>)}
            </div>
          ))}
          {catatan && <p className="mt-2 text-[11px] text-emerald-300">{catatan}</p>}

          {allow("kelolaMeja") && (ubah ? (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-dim">
                  Tautan installer Windows cadangan{RILIS_WINDOWS ? ` — saat ini tombol Unduh memakai installer resmi versi ${RILIS_WINDOWS.versi}` : " (mis. tautan Google Drive)"}
                </span>
                <input value={ubah.windows} placeholder="https://drive.google.com/…" className={kelasInput}
                  onChange={(e) => setUbah({ ...ubah, windows: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-dim">Tautan APK Android (kosongkan = pakai APK di situs kasir)</span>
                <input value={ubah.android} placeholder={`${SITUS_KASIR}/unduh/SPL-Kasir.apk`} className={kelasInput}
                  onChange={(e) => setUbah({ ...ubah, android: e.target.value })} />
              </label>
              <div className="flex gap-2">
                <button onClick={() => { setUbah(null); setCatatan(null); }}
                  className="min-h-[40px] flex-1 rounded-lg border border-line text-[12px] text-mute">Batal</button>
                <button onClick={() => {
                  const sebelum = peek().tautanUnduh;
                  dispatchA({ t: "setTautanUnduh", windows: ubah.windows, android: ubah.android });
                  const sesudah = peek().tautanUnduh;
                  const sama = JSON.stringify(sesudah ?? {}) === JSON.stringify({
                    ...(ubah.windows.trim() ? { windows: ubah.windows.trim() } : {}),
                    ...(ubah.android.trim() ? { android: ubah.android.trim() } : {}),
                  });
                  if (sesudah === sebelum && !sama) { setCatatan("Tautan ditolak — harus diawali https://"); return; }
                  setCatatan("Tautan tersimpan & tampil di semua perangkat.");
                  setUbah(null);
                }} className="min-h-[40px] flex-[2] rounded-lg bg-amber text-[12px] font-bold text-ink">Simpan tautan</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setCatatan(null); setUbah({ windows: tautan.windows ?? "", android: tautan.android ?? "" }); }}
              className="mt-3 min-h-[36px] rounded-lg border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber">
              Ubah tautan unduh
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
