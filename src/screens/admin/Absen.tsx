/**
 * Tab ABSEN — karyawan absen masuk & pulang dengan selfie.
 *
 * SIAPA yang absen tidak pernah diketik: servernya membaca token PIN yang
 * sedang dipakai perangkat ini. Karena PIN tiap karyawan berbeda, tidak ada
 * cara mengabsenkan orang lain selain memegang PIN-nya — dan itu memang
 * intinya. Jam juga dari server, bukan jam HP yang bisa digeser.
 *
 * Fotonya dikecilkan di perangkat (±360px, JPEG) sebelum dikirim: yang
 * dibutuhkan bukti wajah, bukan foto 4 MB. Server membuang fotonya sendiri
 * sesudah 90 hari — jamnya tetap tinggal untuk rekap.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, PageHeader } from "../../components/UI";
import { useAdmin } from "../../lib/adminStore";
import { venueStore } from "../../lib/venueStore";
import type { AbsenBaris, AbsenHasil } from "../../lib/supabaseRemote";

/** Sisi terpanjang foto yang dikirim. Cukup untuk mengenali wajah, ±20 KB. */
const SISI = 360;

const jam = (ms: number) =>
  new Date(ms).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const hariIni = (ms: number) => {
  const d = new Date(ms);
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
};

export default function AbsenScreen() {
  const { a } = useAdmin();
  const store = venueStore() as ReturnType<typeof venueStore> & {
    absenCatat?: (jenis: "masuk" | "pulang", foto: string, catatan?: string) => Promise<AbsenHasil>;
    absenDaftar?: (hari?: number) => Promise<AbsenBaris[]>;
    absenFoto?: (id: number) => Promise<string | null>;
  };

  const video = useRef<HTMLVideoElement | null>(null);
  const aliran = useRef<MediaStream | null>(null);
  const [siapKamera, setSiapKamera] = useState(false);
  const [galatKamera, setGalatKamera] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);
  const [riwayat, setRiwayat] = useState<AbsenBaris[]>([]);
  const [lihat, setLihat] = useState<{ id: number; src: string } | null>(null);

  const muat = useCallback(async () => {
    try { setRiwayat(await (store.absenDaftar?.(14) ?? Promise.resolve([]))); } catch { /* tanpa server: kosong */ }
  }, [store]);

  useEffect(() => { void muat(); }, [muat]);

  // Kamera dinyalakan saat layar dibuka dan DIMATIKAN saat ditinggalkan —
  // lampu kamera yang menyala terus di tablet kasir bikin resah.
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } }, audio: false,
        });
        if (batal) { s.getTracks().forEach((t) => t.stop()); return; }
        aliran.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        setSiapKamera(true);
      } catch (e) {
        setGalatKamera(e instanceof Error && e.name === "NotAllowedError"
          ? "Izin kamera ditolak. Aktifkan izin kamera untuk aplikasi ini, lalu buka lagi layar Absen."
          : "Kamera tidak bisa dibuka di perangkat ini.");
      }
    })();
    return () => { batal = true; aliran.current?.getTracks().forEach((t) => t.stop()); aliran.current = null; };
  }, []);

  /** Ambil satu bingkai, kecilkan, jadikan JPEG. */
  function jepret() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const sisi = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement("canvas");
    c.width = SISI; c.height = SISI;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Dipotong jadi bujur sangkar dari tengah, lalu dicerminkan supaya terasa
    // seperti cermin — sama dengan yang dilihat karyawan di layar.
    ctx.translate(SISI, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, (v.videoWidth - sisi) / 2, (v.videoHeight - sisi) / 2, sisi, sisi, 0, 0, SISI, SISI);
    setFoto(c.toDataURL("image/jpeg", 0.55));
    setKabar(null);
  }

  async function kirim(jenis: "masuk" | "pulang") {
    if (!foto) { setKabar("Ambil selfie dulu."); return; }
    setSibuk(true);
    try {
      const r = await (store.absenCatat?.(jenis, foto, catatan) ??
        Promise.resolve({ ok: false as const, alasan: "Butuh sambungan ke server venue." }));
      if (r.ok) {
        setKabar(`Absen ${jenis} tercatat ${jam(r.at)} — ${r.nama}.`);
        setFoto(null); setCatatan("");
        await muat();
      } else setKabar(r.alasan);
    } finally { setSibuk(false); }
  }

  const milikSaya = riwayat.filter((x) => x.staff_id === (a.me?.id ?? ""));
  const terakhir = milikSaya[0];
  const sudahMasuk = terakhir?.jenis === "masuk";

  return (
    <div className="pb-24">
      <PageHeader kicker="Kehadiran" title="Absen Karyawan"
        sub={a.me ? `${a.me.name} · ${hariIni(Date.now())}` : undefined} />

      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4 lg:max-w-5xl lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        <Card className="space-y-3 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
            {sudahMasuk ? "Sedang bertugas" : "Belum absen masuk"}
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border border-line bg-ink">
            {foto ? (
              <img src={foto} alt="Selfie absen" className="h-full w-full object-cover" />
            ) : (
              <video ref={video} muted playsInline
                className="h-full w-full -scale-x-100 object-cover" />
            )}
            {!siapKamera && !foto && !galatKamera && (
              <div className="absolute inset-0 grid place-items-center text-[12px] text-dim">Menyalakan kamera…</div>
            )}
          </div>

          {galatKamera && <p className="text-[12px] leading-snug text-amber">{galatKamera}</p>}

          <input value={catatan} onChange={(e) => setCatatan(e.target.value.slice(0, 80))}
            placeholder="Catatan (opsional) — mis. terlambat, tukar shift"
            className="min-h-[42px] w-full rounded-xl border border-line bg-ink px-3 text-sm text-cream placeholder:text-dim" />

          {!foto ? (
            <Button full disabled={!siapKamera} onClick={jepret}>Ambil Selfie</Button>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button full disabled={sibuk || sudahMasuk} onClick={() => void kirim("masuk")}>Absen Masuk</Button>
                <Button full variant="ghost" disabled={sibuk || !sudahMasuk} onClick={() => void kirim("pulang")}>Absen Pulang</Button>
              </div>
              <button onClick={() => setFoto(null)}
                className="min-h-[36px] w-full text-[12px] text-dim underline underline-offset-4">
                Ambil ulang fotonya
              </button>
            </div>
          )}

          {kabar && <p className="text-center text-[12px] text-amber">{kabar}</p>}
          <p className="text-[11px] leading-snug text-dim">
            Yang tercatat adalah pemilik PIN yang sedang dipakai perangkat ini, dan jamnya
            diambil dari server — bukan dari jam HP. Foto dihapus sendiri setelah 90 hari.
          </p>
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
            Riwayat 14 hari {riwayat.length > 0 ? `· ${riwayat.length}` : ""}
          </div>
          {riwayat.length === 0 && (
            <p className="text-[12px] leading-snug text-dim">
              Belum ada catatan absen. Butuh sambungan ke server venue.
            </p>
          )}
          <div className="space-y-1.5">
            {riwayat.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-cream">
                    {x.nama} · <span className={x.jenis === "masuk" ? "text-emerald-400" : "text-amber"}>{x.jenis}</span>
                  </div>
                  <div className="text-[11px] text-dim">{jam(x.at_ms)}{x.catatan ? ` · ${x.catatan}` : ""}</div>
                </div>
                {x.ada_foto && (
                  <button onClick={() => void store.absenFoto?.(x.id).then((src) => src && setLihat({ id: x.id, src }))}
                    className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-mute hover:border-amber hover:text-amber">
                    Foto
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {lihat && (
        <button onClick={() => setLihat(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-ink/90 p-6">
          <img src={lihat.src} alt="Foto absen" className="max-h-[70vh] rounded-2xl border border-line" />
        </button>
      )}
    </div>
  );
}
