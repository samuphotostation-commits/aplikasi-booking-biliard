/* ═══════════════════════════════════════════════════════════════════
   PERILAKU FIRMWARE LAMPU — diuji tanpa ESP32

   Dua sisi ditiru lalu diadu satu sama lain:

     sisi server : apa yang DIHASILKAN `lampu_sinkron`
                   (string_agg di supabase/schema-lampu.sql)
     sisi alat   : apa yang DILAKUKAN `terapkanJawaban()`
                   (perangkat/lampu-esp32/lampu-esp32.ino)

   KENAPA ADA UJI SALINAN SEPERTI INI. Lampu meja tidak bisa diuji dengan
   memutar mesin venue: yang menyalakannya bukan aplikasi, melainkan alat
   di panel listrik yang menerjemahkan jawaban server jadi relay. Bagian
   penerjemah itulah yang paling gampang salah, dan satu-satunya cara
   mengujinya tanpa alat adalah menuliskannya ulang di sini.

   PETA PIN TIDAK DIKETIK ULANG — dibaca langsung dari berkas .ino. Jadi
   kalau teknisi memindahkan satu meja ke GPIO lain, uji ini ikut berubah
   dan tidak diam-diam menguji peta yang berbeda dengan yang di-upload.

   YANG HARUS DIINGAT: logika parsing di bawah adalah SALINAN. Kalau
   `terapkanJawaban()` di .ino diubah, berkas ini wajib ikut diubah —
   kalau tidak, ia menguji firmware yang sudah tidak ada lagi.
   ═══════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const NL = String.fromCharCode(10);

/* ── Peta pin dibaca dari firmware yang sebenarnya ───────────────── */

// Dibaca relatif terhadap akar proyek, BUKAN import.meta.url: uji ini
// dibundel esbuild ke node_modules/.cache lalu dijalankan dari sana, jadi
// jalur relatif berkasnya sudah tidak menunjuk ke mana-mana.
const INO = `${process.cwd()}/perangkat/lampu-esp32/lampu-esp32.ino`;
const src = readFileSync(INO, "utf8");

function petaDariIno(nama: string): [string, number][] {
  const blok = new RegExp(`static const PetaRelay ${nama}\\[\\] = \\{([\\s\\S]*?)\\n\\};`).exec(src);
  if (!blok) throw new Error(`peta ${nama} tidak ketemu di lampu-esp32.ino`);
  return [...blok[1].matchAll(/\{\s*"([^"]+)"\s*,\s*(\d+)\s*\}/g)].map((m) => [m[1], Number(m[2])]);
}

const BOARD: Record<1 | 2, [string, number][]> = {
  1: petaDariIno("PETA_BOARD1"),
  2: petaDariIno("PETA_BOARD2"),
};

/* ── Sisi server: tiruan lampu_sinkron ───────────────────────────── */

function serverJawab(lampu: Record<string, boolean>, versi: number, versiAlat: number | null): string {
  if (versiAlat !== null && versiAlat === versi) return `v=${versi}${NL}sama=1`;
  const baris = Object.keys(lampu).sort().map((k) => `${k}=${lampu[k] ? 1 : 0}`);
  return `v=${versi}` + (baris.length ? NL + baris.join(NL) : "");
}

/**
 * BENTUK JAWABAN YANG SEBENARNYA — diperiksa langsung ke Supabase venue
 * pada 13 Nov 2026.
 *
 * Firmware semula meminta `Accept: text/plain` supaya dapat teks mentah.
 * PostgREST di Supabase MENOLAKNYA:
 *
 *   406  {"code":"PGRST107","message":"None of these media types are
 *         available: text/plain"}
 *
 * Kalau itu tidak ketahuan sebelum alat dipasang, tiap tarikan gagal dan
 * lampu TIDAK AKAN PERNAH menyala — dan di panel kasir gejalanya cuma
 * "alat mati", yang mengirim teknisi memeriksa kabel yang sebenarnya
 * tidak apa-apa.
 *
 * Dengan `Accept: application/json`, badannya adalah STRING JSON:
 *
 *   "v=0\nsama=1"
 *
 * Itulah yang diuji di bawah sebagai bentuk utama.
 */
const bentukJsonString = (teks: string) => JSON.stringify(teks);

/* ── Sisi alat: tiruan firmware ──────────────────────────────────── */

type Kanal = { meja: string; pin: number; on: boolean };

class Alat {
  kanal: Kanal[];
  versi = -1;
  private nvs: { n: number; nyala: string[] } | null = null;

  constructor(board: 1 | 2, petaExtra = "") {
    this.kanal = BOARD[board].map(([meja, pin]) => ({ meja, pin, on: false }));
    for (const bagian of petaExtra.split(",").map((x) => x.trim()).filter(Boolean)) {
      const [m, p] = bagian.split("=");
      const pin = Number(p);
      if (m?.trim() && pin > 0 && pin < 49 && this.cari(m.trim()) < 0) {
        this.kanal.push({ meja: m.trim(), pin, on: false });
      }
    }
  }

  cari(meja: string) { return this.kanal.findIndex((k) => k.meja.toUpperCase() === meja.toUpperCase()); }
  nyala() { return this.kanal.filter((k) => k.on).map((k) => k.meja).sort(); }

  /** normalkanBadan() */
  private normalkan(b: string): string {
    b = b.trim();
    if (!b.startsWith('"')) return b;
    let out = "";
    for (let i = 1; i < b.length - 1; i++) {
      if (b[i] === "\\" && i + 1 < b.length - 1) {
        const n = b[++i];
        if (n === "n") out += NL;
        else if (n === "t") out += "\t";
        else if (n !== "r") out += n;
      } else out += b[i];
    }
    return out;
  }

  /** terapkanJawaban() */
  terima(badan: string): number {
    badan = this.normalkan(badan);
    let versiBaru = this.versi, penuh = false, adaSama = false, diubah = 0;
    const disebut = new Set<number>();

    for (const mentah of badan.split(NL)) {
      const baris = mentah.trim();
      if (!baris) continue;
      const eq = baris.indexOf("=");
      if (eq <= 0) continue;
      const k = baris.slice(0, eq).trim();
      const v = baris.slice(eq + 1).trim();

      if (k === "v") { versiBaru = parseInt(v, 10) || 0; continue; }
      if (k === "sama") { adaSama = true; continue; }

      penuh = true;
      const idx = this.cari(k);
      if (idx < 0) continue;                      // meja milik board sebelah
      disebut.add(idx);
      const on = v === "1" || v === "true";
      if (this.kanal[idx].on !== on) { this.kanal[idx].on = on; diubah++; }
    }

    // Meja yang ditarik dari denah hilang dari daftar — relaynya harus padam.
    if (penuh) {
      for (let j = 0; j < this.kanal.length; j++) {
        if (!disebut.has(j) && this.kanal[j].on) { this.kanal[j].on = false; diubah++; }
      }
    }
    if (penuh || adaSama) this.versi = versiBaru;
    return diubah;
  }

  simpan() { this.nvs = { n: this.kanal.length, nyala: this.nyala() }; }

  /** pulihkanKeadaan() — mati listrik lalu menyala lagi */
  matiHidup() {
    const nyala = this.nvs && this.nvs.n === this.kanal.length ? this.nvs.nyala : [];
    for (const k of this.kanal) k.on = nyala.includes(k.meja);
    this.versi = -1;
  }
}

/* ── Denah venue seperti yang diterbitkan server ─────────────────── */

const MEJA = [
  ...Array.from({ length: 40 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 4 }, (_, i) => `V${String(i + 1).padStart(2, "0")}`),
];
const semuaMati = Object.fromEntries(MEJA.map((m) => [m, false]));

/* ═════════════════ Uji ═════════════════ */

// 1. Nyala pertama: alat belum tahu apa-apa, server kirim daftar penuh.
const a1 = new Alat(1), a2 = new Alat(2);
const lampu: Record<string, boolean> = { ...semuaMati, T05: true, T18: true, V03: true };
const penuh7 = serverJawab(lampu, 7, -1);
a1.terima(penuh7); a2.terima(penuh7);
t("board 1 hanya menyalakan mejanya sendiri", a1.nyala(), ["T05"]);
t("board 2 hanya menyalakan mejanya sendiri", a2.nyala(), ["T18", "V03"]);
t("versi diikuti alat", [a1.versi, a2.versi], [7, 7]);

// 2. Tarikan berikutnya tanpa perubahan: jawaban pendek, relay diam.
const hemat = serverJawab(lampu, 7, a1.versi);
t("jawaban hemat memang pendek", hemat, `v=7${NL}sama=1`);
t("tidak ada relay berubah saat sama=1", a1.terima(hemat), 0);
t("lampu tetap menyala sesudah sama=1", a1.nyala(), ["T05"]);

// 3-4. Kasir menyalakan T07, lalu menutup tab T05.
lampu.T07 = true;
a1.terima(serverJawab(lampu, 8, a1.versi));
t("lampu baru ikut menyala", a1.nyala(), ["T05", "T07"]);
lampu.T05 = false;
a1.terima(serverJawab(lampu, 9, a1.versi));
t("lampu yang ditutup ikut padam", a1.nyala(), ["T07"]);

// 5. Bentuk string JSON — INILAH yang benar-benar dikirim PostgREST.
const b = new Alat(1);
b.terima(bentukJsonString(serverJawab(lampu, 9, -1)));
t("bentuk string JSON dibaca sama", b.nyala(), ["T07"]);
t("versi terbaca dari bentuk string JSON", b.versi, 9);

/* Badan apa adanya dari server venue, disalin dari jawaban sungguhan.

   `"v=0"` tanpa satu baris meja pun adalah jawaban SAH selama
   `lampu_state.data` masih `{}` — yaitu sebelum Edge Function `terbit`
   menerbitkan peta lampu untuk pertama kalinya. Bentuknya tidak bisa
   dibedakan dari badan yang terpotong di tengah jalan, jadi alat memilih
   TIDAK mempercayai nomor versinya dan menarik daftar penuh lagi.

   Itu disengaja, dan ongkosnya nol: selama keadaan itu jawabannya cuma
   lima bita, dan begitu `terbit` sekali berjalan petanya berisi 44 meja
   dan versinya langsung diikuti. Menukar ini dengan "percaya saja" berarti
   satu badan terpotong bisa mengunci alat pada keadaan basi selamanya. */
const nyata = new Alat(1);
nyata.terima('"v=0"');
t("peta kosong tidak dipercaya sebagai versi", nyata.versi, -1);
nyata.terima('"v=0\\nsama=1"');
t("jawaban nyata 'sama' terbaca", [nyata.versi, nyata.nyala()], [0, []]);
const nyata2 = new Alat(1);
nyata2.terima('"v=3\\nT01=0\\nT02=1\\nT03=0"');
t("daftar penuh bentuk nyata menyalakan meja yang benar", nyata2.nyala(), ["T02"]);
t("versi dari daftar penuh bentuk nyata", nyata2.versi, 3);

/* 6. KESELAMATAN — inti seluruh rancangan ini.
      Tidak ada jawaban rusak, kosong, atau salah bentuk yang boleh
      memadamkan lampu. Tamu sedang bermain di bawahnya. */
for (const rusak of ["", "   ", "v=", "<html>502 Bad Gateway</html>", "v=9", "sama=1", "{}", "null"]) {
  const sebelum = a1.nyala();
  a1.terima(rusak);
  t(`jawaban rusak ${JSON.stringify(rusak.slice(0, 26))} tidak memadamkan lampu`, a1.nyala(), sebelum);
}

/* 6b. Badan terpotong: versi TIDAK boleh ikut naik. Kalau naik, server
       selamanya menjawab "sama=1" dan alat terkunci pada keadaan basi. */
const f = new Alat(1);
f.terima(serverJawab({ T01: true, T02: false }, 20, -1));
t("versi naik dari daftar penuh", f.versi, 20);
f.terima("v=99");
t("versi TIDAK naik dari jawaban terpotong", f.versi, 20);
f.terima(`v=99${NL}sama=1`);
t("versi naik dari penanda sama", f.versi, 99);

// 7. Meja ditarik dari denah (Atur → Meja): hilang dari daftar, lampu padam.
const tanpaT07 = Object.fromEntries(Object.entries(lampu).filter(([k]) => k !== "T07"));
a1.terima(serverJawab(tanpaT07, 10, a1.versi));
t("meja yang ditarik dari denah ikut padam", a1.nyala(), []);

// 8. Mati listrik saat tamu sedang main.
const c = new Alat(1);
c.terima(serverJawab({ ...semuaMati, T03: true, T12: true }, 11, -1));
c.simpan();
t("sebelum mati listrik", c.nyala(), ["T03", "T12"]);
c.matiHidup();
t("sesudah listrik kembali, lampu pulih sebelum Wi-Fi", c.nyala(), ["T03", "T12"]);
t("versi dilupakan supaya menarik daftar penuh lagi", c.versi, -1);

// 9. Nomor board diubah: peta lama tidak lagi berarti.
const d = new Alat(1);
d.terima(serverJawab({ ...semuaMati, T03: true }, 11, -1));
d.simpan();
d.kanal = BOARD[2].map(([meja, pin]) => ({ meja, pin, on: false }));
d.matiHidup();
t("ganti board tidak menyalakan meja yang salah", d.nyala(), []);

// 10. Peta tambahan untuk meja yang dipasang belakangan.
const e = new Alat(1, "T31=12,T32=13");
e.terima(serverJawab({ ...semuaMati, T31: true }, 12, -1));
t("meja dari peta tambahan ikut dikendalikan", e.nyala(), ["T31"]);
t("peta tambahan tidak menggeser kanal bawaan",
  e.kanal.slice(0, BOARD[1].length).map((k) => k.pin), BOARD[1].map(([, p]) => p));

/* 11-13. Peta pin yang benar-benar di-upload, diperiksa apa adanya. */

t("setiap meja yang dikabeli ada di denah aplikasi",
  ([1, 2] as const).flatMap((b2) => BOARD[b2].filter(([m]) => !MEJA.includes(m)).map(([m]) => m)), []);

for (const brd of [1, 2] as const) {
  const pin = BOARD[brd].map(([, p]) => p);
  t(`board ${brd} tidak punya GPIO kembar`, pin.length, new Set(pin).size);
}

// GPIO yang TIDAK boleh dipakai di ESP32-S3: 0 tombol BOOT, 19/20 USB,
// 26–32 flash/PSRAM, 43/44 UART0 (Serial Monitor).
const TERLARANG = new Set([0, 19, 20, 26, 27, 28, 29, 30, 31, 32, 43, 44]);
for (const brd of [1, 2] as const) {
  t(`board ${brd} tidak memakai GPIO terlarang`,
    [...new Set(BOARD[brd].map(([, p]) => p).filter((p) => TERLARANG.has(p) || p > 48))].sort((x, y) => x - y), []);
}

// Dua board tidak boleh mengaku memegang meja yang sama.
const bentrok = BOARD[1].map(([m]) => m).filter((m) => BOARD[2].some(([n]) => n === m));
t("tidak ada meja yang dipegang dua board sekaligus", bentrok, []);

/* 14-18. Server yang tertanam di firmware HARUS sama persis dengan situs.
   Firmware 2.1 menanam anon key terpotong (37 dari 46 huruf), sehingga
   setiap tarikan ditolak 401 "Invalid API key". Uji ini menangkapnya
   sebelum firmware sampai ke alat. */
const envTeks = [".env.local", ".env.production", ".env"]
  .map((f) => { try { return readFileSync(`${process.cwd()}/${f}`, "utf8"); } catch { return ""; } })
  .join(NL).replace(/\r/g, "");
const dariEnv = (k: string, awal: string) =>
  envTeks.split(NL).map((b) => b.trim()).find((b) => b.startsWith(`${k}=${awal}`))?.slice(k.length + 1) ?? "";
const tertanam = (k: string) => new RegExp(`${k}\\s*=\\s*"([^"]*)"`).exec(src)?.[1] ?? "";

const ANON_SITUS = dariEnv("VITE_SUPABASE_ANON_KEY", "sb_");
t("anon key situs terbaca dari .env", ANON_SITUS.length > 40, true);
t("anon key di firmware = anon key situs (utuh, tidak terpotong)", tertanam("ANON_BAWAAN"), ANON_SITUS);
t("alamat server di firmware = alamat situs", tertanam("URL_BAWAAN"), dariEnv("VITE_SUPABASE_URL", "https:"));

const manifest = JSON.parse(readFileSync(`${process.cwd()}/public/pasang-lampu/manifest.json`, "utf8"));
t("versi di halaman pasang = versi firmware", manifest.version, tertanam("FW_VERSI"));

// Pengaturan alat (Wi-Fi, kunci alat, nomor board) tinggal di NVS
// 0x9000–0xDFFF. Pasang lewat browser tidak boleh menimpanya, supaya
// memperbarui firmware tidak menghapus isian yang sudah dibuat di lokasi.
const NVS_AWAL = 0x9000, NVS_AKHIR = 0xe000;
let menimpaNvs: string[];
try {
  menimpaNvs = (manifest.builds[0].parts as { path: string; offset: number }[])
    .filter((x) => x.offset < NVS_AKHIR &&
      x.offset + readFileSync(`${process.cwd()}/web/pasang-lampu/${x.path}`).length > NVS_AWAL)
    .map((x) => x.path);
} catch {
  menimpaNvs = ["(web/pasang-lampu belum dibangun — jalankan npm run app)"];
}
t("pasang lewat browser tidak menghapus pengaturan alat (NVS)", menimpaNvs, []);

console.log(bad ? `\n${bad} SALAH dari ${total}` : `\nSEMUA BENAR (${total} pemeriksaan)`);
if (bad) process.exit(1);
