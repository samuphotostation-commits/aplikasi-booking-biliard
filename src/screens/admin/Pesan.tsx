/**
 * Tab PESAN — antrean pemberitahuan ke tamu lewat WhatsApp.
 *
 * Dua keadaan, dan layar ini jujur menunjukkan sedang di yang mana:
 *
 *  1. GERBANG BELUM DIPASANG (bawaan). Pesan menumpuk di sini dan kasir
 *     mengirimnya sekali ketuk — tombolnya membuka WhatsApp dengan nomor dan
 *     teksnya sudah terisi, lalu tandai terkirim. Tidak ada yang hilang, dan
 *     pemilik tidak perlu berlangganan apa pun untuk mulai memakai fitur ini.
 *
 *  2. GERBANG SUDAH DIPASANG. Antrean dihabiskan server tiap menit; layar ini
 *     jadi riwayat, dan yang gagal kirim tetap kelihatan lengkap dengan
 *     alasannya supaya bisa dikirim manual.
 *
 * Yang membuat antreannya terisi: pemicu "booking lunas" dan cron pengingat
 * H-1 di server (supabase/schema-pesan.sql) — bukan aplikasi ini. Jadi pesan
 * tetap dibuat walau tidak ada satu pun perangkat kasir yang menyala.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, PageHeader } from "../../components/UI";
import { useAdmin } from "../../lib/adminStore";
import { venueStore } from "../../lib/venueStore";
import type { PesanBaris } from "../../lib/supabaseRemote";

const JENIS: Record<PesanBaris["jenis"], string> = {
  booking: "Booking lunas",
  pengingat: "Pengingat H-1",
  promo: "Promo",
  manual: "Manual",
};

const WARNA: Record<PesanBaris["status"], string> = {
  antre: "bg-amber/15 text-amber",
  terkirim: "bg-emerald-500/15 text-emerald-400",
  gagal: "bg-red-500/15 text-red-300",
  batal: "bg-ink-3 text-dim",
};

const jam = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const nomorTampil = (hp: string) => (hp.startsWith("62") ? "0" + hp.slice(2) : hp);

export default function PesanScreen() {
  const { allow } = useAdmin();
  const store = venueStore() as ReturnType<typeof venueStore> & {
    pesanDaftar?: (limit?: number) => Promise<PesanBaris[]>;
    pesanTandai?: (id: number, status: "terkirim" | "batal" | "antre") => Promise<boolean>;
    pesanBlast?: (teks: string) => Promise<number>;
  };

  const [baris, setBaris] = useState<PesanBaris[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [teksBlast, setTeksBlast] = useState("");
  const [kabar, setKabar] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!store.pesanDaftar) return;
    setSibuk(true);
    try { setBaris(await store.pesanDaftar(200)); setGalat(null); }
    catch (e) { setGalat(e instanceof Error ? e.message : "Gagal memuat antrean."); }
    finally { setSibuk(false); }
  }, [store]);

  useEffect(() => { void muat(); }, [muat]);

  const antre = (baris ?? []).filter((p) => p.status === "antre");
  const gagal = (baris ?? []).filter((p) => p.status === "gagal");

  async function tandai(p: PesanBaris, status: "terkirim" | "batal" | "antre") {
    await store.pesanTandai?.(p.id, status);
    await muat();
  }

  /** Buka WhatsApp dengan nomor & teks sudah terisi — kasir tinggal menekan kirim. */
  function bukaWa(p: PesanBaris) {
    const alamat = "https://wa.me/" + p.hp + "?text=" + encodeURIComponent(p.teks);
    window.open(alamat, "_blank", "noreferrer");
  }

  async function kirimBlast() {
    const teks = teksBlast.trim();
    if (teks.length < 10) { setKabar("Tulis pesannya dulu (minimal 10 huruf)."); return; }
    setSibuk(true);
    try {
      const n = (await store.pesanBlast?.(teks)) ?? -2;
      if (n === -2) setKabar("Butuh sambungan ke server venue.");
      else if (n === -1) setKabar("Hanya superadmin yang boleh mengirim blast promo.");
      else { setKabar(n + " pesan masuk antrean."); setTeksBlast(""); await muat(); }
    } catch (e) { setKabar(e instanceof Error ? e.message : "Gagal mengantre blast."); }
    finally { setSibuk(false); }
  }

  return (
    <div className="pb-24">
      <PageHeader kicker="Pemberitahuan" title="Pesan ke Tamu"
        sub={baris === null ? undefined : antre.length + " menunggu dikirim"} />

      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {galat && (
          <Card className="p-4">
            <p className="text-sm text-amber">{galat}</p>
            <p className="mt-1 text-[12px] leading-snug text-dim">
              Antrean pesan disimpan di server venue. Tanpa sambungan, layar ini kosong —
              tapi pesannya tidak hilang, tetap menunggu di sana.
            </p>
          </Card>
        )}

        {allow("kelolaPromo") && (
          <Card className="space-y-2 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Blast promo</div>
            <textarea
              value={teksBlast}
              onChange={(e) => setTeksBlast(e.target.value.slice(0, 600))}
              rows={4}
              placeholder="Contoh: Malam ini Happy Hour sampai jam 20.00 — semua meja reguler diskon 20%. Datang bareng teman ya!"
              className="w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm leading-snug text-cream placeholder:text-dim"
            />
            <p className="text-[11px] leading-snug text-dim">
              Hanya dikirim ke member yang <span className="text-cream">menyetujui</span> dikirimi promo
              saat mendaftar — itu syarat UU PDP, dan servernya yang menegakkan, bukan layar ini.
              {teksBlast.length > 0 ? " · " + teksBlast.length + "/600 huruf" : ""}
            </p>
            <Button full disabled={sibuk || teksBlast.trim().length < 10} onClick={() => void kirimBlast()}>
              Masukkan ke antrean
            </Button>
            {kabar && <p className="text-center text-[12px] text-amber">{kabar}</p>}
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
            Antrean {gagal.length > 0 && <span className="text-red-300">· {gagal.length} gagal</span>}
          </div>
          <button onClick={() => void muat()} disabled={sibuk}
            className="min-h-[32px] rounded-lg border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber disabled:opacity-40">
            {sibuk ? "Memuat…" : "Muat ulang"}
          </button>
        </div>

        {baris !== null && baris.length === 0 && (
          <Card className="p-5 text-center">
            <p className="text-sm text-cream">Belum ada pesan.</p>
            <p className="mt-1 text-[12px] leading-snug text-dim">
              Pesan dibuat sendiri saat booking tamu lunas, dan sehari sebelum jadwal mainnya.
            </p>
          </Card>
        )}

        <div className="space-y-2">
          {(baris ?? []).map((p) => (
            <Card key={p.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-cream">
                    {p.nama || "Tamu"} · <span className="font-mono text-mute">{nomorTampil(p.hp)}</span>
                  </div>
                  <div className="text-[11px] text-dim">
                    {JENIS[p.jenis]}{p.ref ? " · " + p.ref : ""} · {jam(p.created_ms)}
                    {p.status === "terkirim" ? " · terkirim " + jam(p.sent_ms) : ""}
                  </div>
                </div>
                <span className={"shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " + WARNA[p.status]}>
                  {p.status}
                </span>
              </div>

              <p className="mt-2 whitespace-pre-line rounded-lg bg-ink px-3 py-2 text-[12px] leading-snug text-mute">
                {p.teks}
              </p>
              {p.galat && <p className="mt-1 text-[11px] text-red-300">{p.galat}</p>}

              {(p.status === "antre" || p.status === "gagal") && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button onClick={() => bukaWa(p)}
                    className="min-h-[36px] flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-200 hover:bg-emerald-500/20">
                    Buka WhatsApp
                  </button>
                  <button onClick={() => void tandai(p, "terkirim")}
                    className="min-h-[36px] rounded-lg border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber">
                    Tandai terkirim
                  </button>
                  <button onClick={() => void tandai(p, "batal")}
                    className="min-h-[36px] rounded-lg border border-line px-3 text-[12px] text-dim hover:border-red-400 hover:text-red-300">
                    Batal
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
