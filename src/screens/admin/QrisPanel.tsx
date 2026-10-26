/**
 * PANEL QRIS DINAMIS — pemilik memasang gateway sendiri.
 *
 * Secret key TIDAK pernah ada di aplikasi ini: key hanya hidup di Supabase
 * Edge Function Secrets. Panel ini cuma (1) menunjukkan gateway sudah aktif
 * atau belum, (2) memberi alamat webhook yang harus dipasang di dashboard
 * gateway, dan (3) membuat TAGIHAN UJI COBA supaya seluruh rantai benar-benar
 * dibuktikan: buat tagihan → bayar → webhook → status berubah lunas.
 *
 * Tagihan uji tidak tersambung ke aksi venue apa pun, jadi dibayar atau tidak,
 * angka penjualan dan jejak venue tidak berubah sama sekali.
 */
import { useEffect, useState } from "react";
import { Button } from "../../components/UI";
import { qrisAktif, qrisMungkin, statusQris, ujiQris, type QrisStatus, type QrisTagihan } from "../../lib/qris";
import { QrGambar } from "../../components/QrGambar";
import { rupiah } from "../../lib/core";

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {};
const WEBHOOK = env.VITE_SUPABASE_URL ? `${env.VITE_SUPABASE_URL}/functions/v1/qris-webhook` : "";

export default function QrisPanel() {
  const [aktif, setAktif] = useState<boolean | null>(null);
  const [tagihan, setTagihan] = useState<QrisTagihan | null>(null);
  const [status, setStatus] = useState<QrisStatus | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => { void qrisAktif().then(setAktif); }, []);

  // Selama tagihan uji hidup, tanyakan statusnya ke server (bukan ke gateway).
  useEffect(() => {
    if (!tagihan) return;
    let hidup = true;
    const tanya = async () => {
      const st = await statusQris(tagihan.ref);
      if (!hidup) return;
      setStatus(st);
      if (st === "lunas" || st === "gagal" || st === "kedaluwarsa") return;
      setTimeout(() => void tanya(), 3000);
    };
    void tanya();
    return () => { hidup = false; };
  }, [tagihan]);

  async function uji() {
    setSibuk(true);
    setPesan(null);
    setStatus(null);
    const r = await ujiQris(1000);
    setSibuk(false);
    if (r.ok) { setTagihan(r.tagihan); setAktif(true); return; }
    setTagihan(null);
    setPesan(r.ok === false && "belumAktif" in r
      ? "Gateway belum dikonfigurasi. Isi dulu secret-nya di Supabase (lihat langkah di bawah)."
      : (r as { alasan: string }).alasan);
  }

  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
        QRIS dinamis (Midtrans / DOKU)
      </h2>

      <div className="space-y-3 rounded-xl border border-line bg-ink-2 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-mute">Pembayaran QRIS otomatis</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
            aktif ? "bg-amber/20 text-amber" : "bg-ink-3 text-dim"
          }`}>
            {aktif === null ? "memeriksa…" : aktif ? "aktif" : "belum aktif"}
          </span>
        </div>

        {!qrisMungkin() ? (
          <p className="text-[12px] leading-relaxed text-dim">
            Perangkat ini sedang belum tersambung, jadi QRIS otomatis belum bisa dicoba.
            Tamu tetap bisa memesan dan membayar di kasir seperti biasa.
          </p>
        ) : (
          <>
            <Button full busy={sibuk} onClick={() => void uji()}>
              Coba sekali — tagihan {rupiah(1000)}
            </Button>
            <p className="text-[11px] leading-snug text-dim">
              Tagihannya sungguhan, tapi tidak menempel ke meja atau pesanan mana pun.
              Dibayar atau tidak, laporan venue tidak ikut berubah.
            </p>
          </>
        )}

        {pesan && (
          <p className="rounded-lg border border-amber/50 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">
            {pesan}
          </p>
        )}

        {tagihan && (
          <div className="space-y-2 rounded-lg border border-line bg-ink p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.16em] text-dim">Ref uji</span>
              <span className="font-mono text-[11px] text-mute">{tagihan.ref}</span>
            </div>
            {tagihan.qrString ? (
              <div className="flex justify-center"><QrGambar payload={tagihan.qrString} size={180} /></div>
            ) : tagihan.bayarUrl ? (
              <a href={tagihan.bayarUrl} target="_blank" rel="noreferrer"
                className="flex min-h-[44px] items-center justify-center rounded-xl bg-amber px-4 text-sm font-bold text-ink">
                Buka halaman pembayaran gateway
              </a>
            ) : tagihan.qrUrl ? (
              <img src={tagihan.qrUrl} alt="QR uji coba" className="mx-auto h-[180px] w-[180px] rounded-lg bg-cream p-2" />
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.16em] text-dim">Status</span>
              <span className={`text-[13px] font-semibold ${
                status === "lunas" ? "text-amber" : status === "gagal" || status === "kedaluwarsa" ? "text-red-300" : "text-mute"
              }`}>
                {status === "lunas" ? "LUNAS — semuanya tersambung benar"
                  : status === "gagal" ? "gagal — pembayarannya ditolak"
                    : status === "kedaluwarsa" ? "tagihannya sudah kedaluwarsa"
                      : status === "tidak-ada" ? "tagihannya tidak ditemukan"
                        : "menunggu pembayaran…"}
              </span>
            </div>
            {status === "menunggu" && (
              <p className="text-[11px] leading-snug text-dim">
                Bayar tagihan ini dari HP. Kalau dalam 1–2 menit statusnya belum berubah jadi lunas,
                berarti kabar pembayarannya belum sampai ke aplikasi — lihat langkah pemasangan di bawah.
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg border border-line bg-ink p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
            Untuk yang memasang · sekali saja
          </p>
          <ol className="mt-1.5 space-y-1 text-[12px] leading-snug text-mute">
            <li>1. Supabase → Edge Functions → Secrets. Untuk DOKU isi <b>DOKU_CLIENT_ID</b> dan <b>DOKU_SECRET_KEY</b>
              (tambah <b>DOKU_PRODUKSI=1</b> kalau sudah pakai akun produksi). Untuk Midtrans cukup <b>MIDTRANS_SERVER_KEY</b>.</li>
            <li>2. Dashboard gateway → alamat notifikasi/webhook diisi:</li>
          </ol>
          <div className="mt-1.5 break-all rounded-lg border border-line bg-ink-2 p-2 font-mono text-[10px] text-mute">
            {WEBHOOK || "https://<project>.supabase.co/functions/v1/qris-webhook"}
          </div>
          <ol start={3} className="mt-1.5 space-y-1 text-[12px] leading-snug text-mute">
            <li>3. Tekan "Uji koneksi" di atas dan bayar tagihan {rupiah(1000)}-nya. Status harus berubah LUNAS sendiri.</li>
          </ol>
          <p className="mt-1.5 text-[11px] leading-snug text-dim">
            Kunci rahasianya tidak pernah masuk ke aplikasi ini maupun ke HP tamu — hanya disimpan di
            pusat data. Selama QRIS otomatis belum menyala, semua pembayaran kembali ke "bayar di kasir"
            dengan sendirinya.
          </p>
        </div>
      </div>
    </section>
  );
}
