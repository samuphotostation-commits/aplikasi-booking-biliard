/**
 * PEMBERITAHUAN — SPL-5: bunyi + notifikasi peramban.
 *
 * Dipakai untuk tiga kejadian yang kalau terlewat merugikan langsung:
 * reservasi online masuk, pesanan baru sampai di dapur, dan pesanan selesai
 * dimasak (pramusaji harus mengantarnya).
 *
 * TIGA ATURAN YANG MEMBENTUK BERKAS INI:
 *
 * 1. TIDAK PERNAH BERBUNYI UNTUK YANG SUDAH ADA. Layar dapur yang dibuka jam
 *    delapan malam tidak boleh menyuarakan dua puluh tiket yang sudah di
 *    sana. Jadi daftar pertama selalu DISEMAI diam-diam; yang berbunyi hanya
 *    yang muncul SESUDAH itu.
 *
 * 2. BUNYI DIBANGKITKAN, BUKAN BERKAS SUARA. Satu berkas mp3 kecil pun harus
 *    diunduh, bisa gagal, dan ikut membesarkan jalur kritis. WebAudio bisa
 *    membunyikan nada yang cukup jelas tanpa satu bita pun aset.
 *
 * 3. IZIN TIDAK PERNAH DIMINTA SENDIRI. Peramban memang mengizinkan
 *    permintaan izin hanya setelah ada ketukan pengguna, tapi alasannya lebih
 *    sederhana: kotak izin yang muncul tanpa diminta adalah hal pertama yang
 *    ditolak orang, dan sesudah ditolak tidak bisa ditanya lagi. Jadi izinnya
 *    diminta lewat tombol di tab Atur, dan selama belum diberi, yang jalan
 *    hanya bunyinya.
 */

const KUNCI_SUARA = "spl:v1:notif-suara";

/* ── Setelan per perangkat ─────────────────────────────────────────── */

export const suaraNyala = (): boolean => {
  try {
    return window.localStorage.getItem(KUNCI_SUARA) !== "0";
  } catch {
    return true;       // mode privat: tetap berbunyi
  }
};

export function setSuaraNyala(on: boolean) {
  try { window.localStorage.setItem(KUNCI_SUARA, on ? "1" : "0"); } catch { /* mode privat */ }
}

/* ── Bunyi ─────────────────────────────────────────────────────────── */

export type JenisBunyi = "masuk" | "siap" | "reservasi";

/** Nada tiap kejadian: naik = sesuatu masuk, turun-naik = sesuatu selesai. */
const NADA: Record<JenisBunyi, number[]> = {
  masuk: [660, 880],
  siap: [880, 660, 880],
  reservasi: [520, 660, 780],
};

let audio: AudioContext | null = null;

/**
 * Bunyikan nada pendek. Sengaja TIDAK melempar galat: perangkat yang
 * memblokir audio tidak boleh menjatuhkan layar dapur — tiketnya tetap
 * terlihat, yang hilang cuma bunyinya.
 */
export function bunyikan(jenis: JenisBunyi) {
  if (!suaraNyala()) return;
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio = audio ?? new AC();
    // Peramban menangguhkan AudioContext yang dibuat sebelum ada ketukan.
    if (audio.state === "suspended") void audio.resume();
    const mulai = audio.currentTime;
    NADA[jenis].forEach((hz, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      // Naik-turun halus: nada yang dipotong mendadak berbunyi seperti "klik".
      const t0 = mulai + i * 0.14;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.14, t0 + 0.02);
      gain.gain.linearRampToValueAtTime(0, t0 + 0.13);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    });
  } catch { /* perangkat tanpa audio: diam saja */ }
}

/* ── Notifikasi peramban ───────────────────────────────────────────── */

export type IzinNotif = "diberikan" | "ditolak" | "belum" | "tidak-didukung";

export function izinNotif(): IzinNotif {
  if (typeof Notification === "undefined") return "tidak-didukung";
  return Notification.permission === "granted" ? "diberikan"
    : Notification.permission === "denied" ? "ditolak" : "belum";
}

/** Minta izin notifikasi. HANYA boleh dipanggil dari ketukan pengguna. */
export async function mintaIzinNotif(): Promise<IzinNotif> {
  if (typeof Notification === "undefined") return "tidak-didukung";
  try {
    await Notification.requestPermission();
  } catch { /* peramban lama memakai callback; abaikan */ }
  return izinNotif();
}

/**
 * Tampilkan notifikasi peramban, kalau diizinkan.
 *
 * `tag` membuat notifikasi dengan kejadian yang sama saling menimpa, bukan
 * menumpuk: sepuluh tiket baru dalam semenit tidak boleh meninggalkan sepuluh
 * kotak yang harus ditutup satu per satu.
 */
export function beriTahu(judul: string, isi: string, tag: string) {
  if (izinNotif() !== "diberikan") return;
  try {
    new Notification(judul, { body: isi, tag, icon: "/icon-192.png" });
  } catch { /* beberapa peramban melarang di luar service worker */ }
}

/** Bunyi + notifikasi sekaligus — satu panggilan untuk satu kejadian. */
export function kabarkan(jenis: JenisBunyi, judul: string, isi: string, tag: string) {
  bunyikan(jenis);
  beriTahu(judul, isi, tag);
}
