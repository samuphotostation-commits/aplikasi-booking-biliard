/**
 * PIN BARU UNTUK SEMUA KARYAWAN + DAFTAR SIAP KIRIM WHATSAPP.
 *
 * Permintaan pemilik 12 Nov 2026: untuk masa uji coba, semua karyawan diberi
 * NIP dan PIN awal sekaligus, lalu daftarnya dikirim lewat WhatsApp. Karyawan
 * mengganti PIN-nya sendiri nanti.
 *
 * PIN lama tidak bisa dibaca siapa pun (tersimpan teracak di server), jadi
 * satu-satunya cara membuat daftar adalah membuat PIN baru. Akun yang belum
 * punya NIP mendapat NIP dari server saat itu juga. PIN baru hanya tampil di
 * layar ini, sekali, dan tidak tercatat di jejak.
 *
 * Akun yang sedang dipakai masuk tidak ikut diganti, supaya pemilik tidak
 * terkunci dari layarnya sendiri.
 */
import { useState } from "react";
import { ROLE_LABEL, type Employee } from "../../data/staff";
import { VENUE_LABEL } from "../../data/venue";
import { pinAcak } from "./TambahBanyakAkun";

type Baris = { nama: string; nip: string; peran: string; tempat: string; pin: string; gagal?: string };

export function teksWa(baris: Baris[]): string {
  const kelompok = (judul: string, isi: Baris[]) =>
    isi.length ? [`*${judul}*`, ...isi.map((b, i) => `${i + 1}. ${b.nama} (${b.peran})\n   NIP: ${b.nip}\n   PIN: ${b.pin}`), ""] : [];
  const ok = baris.filter((b) => !b.gagal);
  return [
    "*AKUN KARYAWAN SPL — UJI COBA*",
    "Masuk di kasir.sportspoollounge.com atau aplikasi SPL Kasir.",
    "PIN ini sementara untuk uji coba dan akan diganti nanti.",
    "",
    ...kelompok("SPL SPORT", ok.filter((b) => b.tempat === VENUE_LABEL.spl)),
    ...kelompok("SMOKEHOUSE", ok.filter((b) => b.tempat === VENUE_LABEL.smh)),
    ...kelompok("KEDUA TEMPAT", ok.filter((b) => b.tempat === "Keduanya")),
    "Jangan bagikan PIN ke orang lain. Semua tindakan tercatat atas nama pemilik PIN.",
  ].join("\n");
}

export function PinMassal({ karyawan, simpan, onSelesai }: {
  karyawan: Employee[];
  /** Simpan PIN satu akun ke server. Mengembalikan NIP-nya, atau alasan gagal. */
  simpan: (e: Employee, pin: string) => Promise<{ alasan: string | null; nip?: string } | undefined>;
  onSelesai: () => void;
}) {
  const [baris, setBaris] = useState<Baris[] | null>(null);
  const [jalan, setJalan] = useState(0);
  const [disalin, setDisalin] = useState(false);

  async function mulai() {
    if (!confirm(`Buat PIN baru untuk ${karyawan.length} karyawan?\n\nPIN lama mereka langsung tidak berlaku. Akun yang sedang kamu pakai tidak ikut diganti.`)) return;
    const sudah = new Set<string>();
    const hasil: Baris[] = [];
    setJalan(1);
    for (const e of karyawan) {
      const pin = pinAcak(sudah);
      const h = await simpan(e, pin);
      hasil.push({
        nama: e.name, nip: h?.nip ?? e.nip ?? "-", peran: ROLE_LABEL[e.role],
        tempat: e.venue ? VENUE_LABEL[e.venue] : "Keduanya", pin,
        gagal: !h ? "tidak tersambung" : h.alasan ?? undefined,
      });
      setJalan(hasil.length + 1);
    }
    setBaris(hasil);
    setJalan(0);
    onSelesai();
  }

  async function salin() {
    try { await navigator.clipboard.writeText(teksWa(baris ?? [])); setDisalin(true); setTimeout(() => setDisalin(false), 3000); }
    catch { alert("Salin gagal. Tekan lama teks di bawah lalu salin manual."); }
  }

  if (!baris) {
    return (
      <div className="mt-2 rounded-xl border border-line bg-ink-2 p-3">
        <button onClick={() => void mulai()} disabled={jalan > 0 || karyawan.length === 0}
          className="min-h-[44px] w-full rounded-lg border border-amber/50 bg-amber/10 text-[13px] font-semibold text-amber disabled:opacity-50">
          {jalan > 0 ? `Membuat PIN… ${Math.min(jalan, karyawan.length)}/${karyawan.length}` : "Buat PIN awal semua karyawan + daftar WhatsApp"}
        </button>
        <p className="mt-2 text-[11px] leading-snug text-dim">
          Untuk uji coba: semua karyawan aktif mendapat NIP dan PIN baru sekaligus, lalu daftarnya siap dikirim ke grup WhatsApp.
          PIN lama tidak bisa dilihat siapa pun, jadi daftar hanya bisa dibuat dengan PIN baru.
        </p>
      </div>
    );
  }

  const gagal = baris.filter((b) => b.gagal);
  const teks = teksWa(baris);
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-amber/50 bg-amber/5 p-3">
      <p className="text-[13px] font-semibold text-amber">{baris.length - gagal.length} PIN baru dibuat. Kirim sekarang — daftar ini tidak bisa dibuka lagi.</p>
      {gagal.length > 0 && <p className="text-[12px] text-red-300">Belum berhasil: {gagal.map((b) => `${b.nama} (${b.gagal})`).join(", ")}.</p>}
      <textarea readOnly value={teks} rows={12} aria-label="Daftar NIP dan PIN untuk WhatsApp"
        className="w-full rounded-lg border border-line bg-ink p-3 font-mono text-[12px] leading-snug text-cream" />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => void salin()} className="min-h-[44px] rounded-lg bg-amber text-[13px] font-bold text-ink">
          {disalin ? "Tersalin ✓" : "Salin teks"}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(teks)}`} target="_blank" rel="noreferrer"
          className="flex min-h-[44px] items-center justify-center rounded-lg border border-line text-[13px] font-semibold text-cream">
          Buka WhatsApp
        </a>
      </div>
      <button onClick={() => setBaris(null)} className="min-h-[40px] w-full text-[12px] text-dim">Sudah dikirim, tutup</button>
    </div>
  );
}
