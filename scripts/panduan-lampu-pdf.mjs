/**
 * Panduan PDF: lampu meja lewat ESP32-S3 + aplikasi SPL Kasir di PC.
 *   node scripts/panduan-lampu-pdf.mjs  → release/Paket-Lampu-ESP32/Panduan-Lampu-ESP32-dan-PC-Kasir.pdf
 * Anon key Supabase dibaca dari .env.local (kunci publik, sama dengan yang ada di situs).
 */
// playwright-core dipasang di luar proyek (alat bantu, bukan dependensi aplikasi).
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright-core");
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("="))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL_SB = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const VERSI_APP = JSON.parse(readFileSync("package.json", "utf8")).version;
const LOGO = "data:image/png;base64," + readFileSync("build/icon.png").toString("base64");
const KOMPILASI = process.env.KOMPILASI ?? "";   // ringkasan hasil kompilasi, diisi saat dijalankan
const OUT = resolve("release/Paket-Lampu-ESP32");
mkdirSync(OUT, { recursive: true });

const PIN1 = [["T01", 4], ["T02", 5], ["T03", 6], ["T04", 7], ["T05", 15], ["T06", 16], ["T07", 17], ["T08", 18],
  ["T09", 42], ["T10", 41], ["T11", 40], ["T12", 39], ["T13", 38], ["T14", 37], ["T15", 36], ["T16", 35]];
const PIN2 = [["T17", 4], ["T18", 5], ["T19", 6], ["T20", 7], ["T21", 15], ["T22", 16], ["T23", 17], ["T24", 18],
  ["T25", 42], ["T26", 41], ["T27", 40], ["T28", 39], ["T29", 38], ["T30", 37], ["V01", 36], ["V02", 35],
  ["V03", 9], ["V04", 10], ["T35", 11]];
const tabelPin = (d) => `<table class="pin"><tr><th>Meja</th><th>GPIO</th><th>Meja</th><th>GPIO</th></tr>${
  Array.from({ length: Math.ceil(d.length / 2) }, (_, i) => `<tr><td>${d[i][0]}</td><td>${d[i][1]}</td><td>${d[i + Math.ceil(d.length / 2)]?.[0] ?? ""}</td><td>${d[i + Math.ceil(d.length / 2)]?.[1] ?? ""}</td></tr>`).join("")}</table>`;

const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.5 "Segoe UI", Arial, sans-serif; color: #1d1a17; margin: 0; }
.sampul { height: 262mm; background: #992212; color: #fbf3e6; padding: 22mm 18mm; display: flex; flex-direction: column; page-break-after: always; }
.sampul img { width: 46mm; height: 46mm; border-radius: 8mm; }
.sampul h1 { font-size: 30pt; line-height: 1.1; margin: 14mm 0 4mm; }
.sampul .sub { font-size: 13pt; color: #ffd98a; }
.sampul .kaki { margin-top: auto; font-size: 10pt; color: #f2d9b0; }
h2 { color: #992212; font-size: 15pt; margin: 0 0 3mm; padding-top: 2mm; border-bottom: 2px solid #F0A202; }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; color: #5a1409; }
.bab { page-break-before: always; }
ol, ul { padding-left: 6mm; margin: 2mm 0; } li { margin: 1.2mm 0; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0 4mm; font-size: 9.5pt; }
th, td { border: 1px solid #d9cdbb; padding: 1.6mm 2.2mm; text-align: left; vertical-align: top; }
th { background: #f6ecdc; }
table.pin { width: auto; } table.pin td, table.pin th { padding: 1mm 4mm; text-align: center; }
.kotak { border: 1.5px solid #F0A202; background: #fff7e6; border-radius: 3mm; padding: 3mm 4mm; margin: 3mm 0; }
.awas { border: 1.5px solid #992212; background: #fbeceb; border-radius: 3mm; padding: 3mm 4mm; margin: 3mm 0; }
.ok { color: #1f7a3a; font-weight: 600; } .belum { color: #992212; font-weight: 600; }
code, .kode { font-family: Consolas, monospace; font-size: 9pt; background: #f3eee6; padding: 0.3mm 1.2mm; border-radius: 1mm; word-break: break-all; }
.alur { font-family: Consolas, monospace; font-size: 9pt; background: #1d1a17; color: #f2e9dc; padding: 3mm 4mm; border-radius: 2mm; white-space: pre; }
.dua { display: flex; gap: 8mm; } .dua > div { flex: 1; }
</style></head><body>

<section class="sampul">
  <img src="${LOGO}" alt="Logo SPL">
  <h1>Lampu Meja Biliar<br>lewat ESP32-S3<br>&amp; Aplikasi PC Kasir</h1>
  <div class="sub">Panduan pasang, uji, dan perawatan — SPL Sports Pool Lounge</div>
  <div class="kaki">Versi aplikasi PC: SPL Kasir ${VERSI_APP} · Firmware: spl-lampu-2.3 · ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}<br>CV SMOKE HOUSE RESTO</div>
</section>

<section>
  <h2>1. Cara kerjanya</h2>
  <p>Lampu meja mengikuti status meja di aplikasi. Meja dibuka atau check-in, lampu menyala. Tab ditutup, void, atau no-show, lampu padam. Kasir juga bisa menekan tombol lampu satu meja, atau <b>Nyalakan semua</b> / <b>Matikan semua</b>.</p>
  <div class="alur">PC kasir / HP manajer / tablet  ──►  server SPL (Supabase)
                                         │  status lampu tiap meja
                                         ▼
          ESP32-S3 di panel menanyakan tiap ±1 detik lewat Wi-Fi (HTTPS)
                                         ▼
                         relay / SSR  ──►  lampu meja 220V</div>
  <ul>
    <li><b>Bisa dari perangkat mana pun</b>: PC kasir, HP manajer, tablet. Tidak perlu satu jaringan dengan ESP32.</li>
    <li><b>Internet putus</b>: lampu <u>tetap</u> pada keadaan terakhir, tidak padam sendiri. Begitu internet kembali, ESP32 menyesuaikan.</li>
    <li><b>Listrik ESP32 sempat mati</b>: saat menyala lagi, ESP32 langsung mengambil status terbaru dan menyalakan lampu meja yang sedang dipakai.</li>
    <li>Jeda dari tombol diklik sampai lampu menyala: sekitar 1–3 detik.</li>
    <li>ESP32 hanya bisa <b>membaca</b> status lampu. Tidak bisa mengubah data kasir, nama tamu, atau uang.</li>
  </ul>

  <h3>Isi paket</h3>
  <table>
    <tr><th>Berkas</th><th>Untuk</th></tr>
    <tr><td><code>1-PC-Kasir/SPL-Kasir-Setup-${VERSI_APP}.exe</code></td><td><b>Installer Windows</b> (disarankan) untuk PC kasir SPL Sport dan Smokehouse.</td></tr>
    <tr><td><code>1-PC-Kasir/SPL-Kasir-Portable-${VERSI_APP}.zip</code></td><td>Tanpa instal: ekstrak lalu jalankan <code>SPL Kasir.exe</code>.</td></tr>
    <tr><td><code>1-PC-Kasir/SPL-Kasir-${VERSI_APP}.iso</code></td><td>Isi sama dengan installer, dibungkus ISO.</td></tr>
    <tr><td><code>2-ESP32/bin/lampu-esp32.ino.merged.bin</code></td><td>Firmware lengkap untuk teknisi (esptool, alamat 0x0). <b>Menghapus</b> pengaturan alat; untuk pemasangan biasa pakai halaman pasang-lampu (Bab 4, cara A).</td></tr>
    <tr><td><code>2-ESP32/lampu-esp32/lampu-esp32.ino</code></td><td>Kode sumber firmware untuk Arduino IDE (Bab 4, cara B). Satu berkas untuk board 1 dan 2.</td></tr>
    <tr><td>Panduan ini (PDF)</td><td>Langkah pasang, uji, dan mengatasi gangguan.</td></tr>
  </table>

  <h3>Status bagian server</h3>
  <table>
    <tr><td>Tabel &amp; fungsi lampu di server</td><td class="ok">Sudah terpasang</td></tr>
    <tr><td>Kunci alat (sidik jari di server)</td><td class="ok">Sudah terpasang — alat dengan kunci salah ditolak</td></tr>
    <tr><td>Fungsi penerbit status lampu (<code>terbit</code>)</td><td class="ok">Sudah terpasang 13 Nov 2026</td></tr>
    <tr><td>Firmware ESP32</td><td><span class="ok">Berhasil dikompilasi 14 Nov 2026</span> (core esp32 3.3.12, 82% ruang program)</td></tr>
    <tr><td>Uji di panel &amp; lampu sungguhan</td><td class="belum">Dikerjakan di venue — lihat Bab 5</td></tr>
  </table>
</section>

<section class="bab">
  <h2>2. Pasang aplikasi di PC kasir</h2>
  <ol>
    <li><b>Tutup dulu SPL Kasir yang sedang terbuka</b> (termasuk ikon di pojok kanan bawah taskbar). Aplikasi hanya boleh terbuka satu kali.</li>
    <li>Salin <code>SPL-Kasir-Setup-${VERSI_APP}.exe</code> ke PC kasir (flashdisk / Google Drive), lalu klik dua kali.</li>
    <li>Kalau muncul layar biru <i>"Windows protected your PC"</i>: klik <b>More info</b> → <b>Run anyway</b>.</li>
    <li>Klik <b>Install</b> → <b>Finish</b>. Ikon <b>SPL Kasir</b> (logo SPL) muncul di Desktop.</li>
    <li>Buka SPL Kasir, masuk dengan <b>NIP + PIN</b>.</li>
  </ol>
  <p><b>PC yang menolak installer:</b> pakai <code>SPL-Kasir-Portable-${VERSI_APP}.zip</code> — klik kanan → <b>Extract All</b>, lalu buka <code>SPL Kasir.exe</code> di folder hasilnya (bisa disematkan ke taskbar).</p>
  <div class="kotak">Versi lama otomatis tertimpa, data tidak hilang (data ada di server). Semua PC kasir sebaiknya memakai versi ${VERSI_APP}: versi lama belum mengenal split bill per porsi.</div>

  <h3>Tombol lampu di aplikasi</h3>
  <ul>
    <li><b>Papan meja</b>: tiap meja biliar punya penanda lampu. Ketuk meja → tombol lampu untuk meja itu.</li>
    <li><b>Nyalakan semua / Matikan semua</b> ada di papan (untuk pembukaan dan penutupan venue).</li>
    <li>Di samping tombol lampu ada tanda alat: <b>hijau "alat online (2)"</b> berarti kedua ESP32 tersambung.</li>
    <li>Meja resto Smokehouse tidak punya lampu; tombol lampu tidak muncul di sana.</li>
  </ul>

  <h2 style="margin-top:8mm">3. Buat kunci alat (WAJIB, sekali)</h2>
  <p>Kunci lama tidak bisa dilihat lagi, jadi <b>buat satu kunci baru</b> dan pakai kunci yang sama di kedua board:</p>
  <ol>
    <li>Masuk sebagai superadmin → <b>Atur</b> → <b>Lampu meja — alat relay di venue</b>.</li>
    <li>Tekan <b>Buat kunci baru</b> <u>satu kali saja</u> → <b>Pasang kunci ini di server</b> → tunggu tulisan hijau "Kunci alat terpasang di server".</li>
    <li><b>Foto atau catat kuncinya sekarang</b> (20 huruf kecil/angka, tampil berkelompok seperti <code>abcd-efgh-jkmn-pqrs-tuvw</code>). Setelah halaman ditutup, kunci tidak bisa dilihat lagi. Jangan tekan "Buat kunci baru" lagi sesudah ini.</li>
    <li>Ketik kunci itu ke <b>kedua</b> board (Bab 4). Tanda <b>-</b> dan spasi boleh ikut diketik; alat membuangnya sendiri.</li>
  </ol>
</section>

<section class="bab">
  <h2>4. Pasang firmware ke ESP32-S3</h2>
  <p>Kabel dan pin <b>tidak perlu diubah</b>, sama dengan firmware lama. Yang diganti hanya programnya. Waktu: ±20 menit untuk dua board.</p>
  <h3>Cara A — lewat browser, tanpa Arduino IDE (paling mudah)</h3>
  <ol>
    <li>Sambungkan ESP32-S3 ke PC lewat kabel USB-C data. Buka Chrome/Edge ke <span class="kode">https://kasir.sportspoollounge.com/pasang-lampu/</span></li>
    <li>Tekan tombol kuning <b>Sambungkan &amp; pasang firmware</b>, pilih port ESP32 → <b>Connect</b> → <b>Install</b>. (Port tidak muncul: tahan <b>BOOT</b>, tekan <b>RESET</b>, lepas <b>BOOT</b>.)</li>
    <li>Pengaturan yang sudah ada di alat (Wi-Fi, kunci, nomor board) <b>tidak terhapus</b>.</li>
    <li>Selesai, tekan <b>RESET</b>. Alat baru: lanjut ke langkah 3 di bawah (hotspot SPL-Lampu).</li>
  </ol>
  <h3>Cara B — Arduino IDE. Siapkan sekali per laptop:</h3>
  <ol>
    <li>Pasang <b>Arduino IDE 2</b> dari arduino.cc.</li>
    <li><b>File → Preferences → Additional boards manager URLs</b>, tambahkan:<br><span class="kode">https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json</span></li>
    <li><b>Tools → Board → Boards Manager</b> → pasang <b>esp32 by Espressif Systems</b> (versi 3.x).</li>
    <li><b>Tools → Board → ESP32S3 Dev Module</b>. Lalu: USB CDC On Boot <b>Enabled</b>, Upload Speed <b>921600</b>.</li>
    <li>Tidak ada library tambahan yang perlu dipasang.</li>
  </ol>
  <h3>Untuk masing-masing board</h3>
  <ol>
    <li>Buka <code>2-ESP32/lampu-esp32/lampu-esp32.ino</code>.</li>
    <li>Sambungkan board lewat USB-C, pilih port-nya, tekan <b>Upload</b>. Kalau port tidak muncul: tahan <b>BOOT</b>, tekan <b>RESET</b> sebentar, lepas <b>BOOT</b>, upload lagi.</li>
    <li>Sesudah upload, alat membuka hotspot sendiri: nama <b>SPL-Lampu-XXXX</b>, sandi <b>pasanglampu</b>.</li>
    <li>Sambungkan HP/laptop ke hotspot itu, buka <b>http://192.168.4.1</b>.</li>
    <li>Isi halaman pengaturan:</li>
  </ol>
  <table>
    <tr><th style="width:34%">Kolom</th><th>Isi</th></tr>
    <tr><td>Nama Wi-Fi venue</td><td>nama Wi-Fi area biliar (2.4 GHz)</td></tr>
    <tr><td>Password Wi-Fi</td><td>password Wi-Fi tersebut</td></tr>
    <tr><td>Lanjutan — server</td><td><b>biarkan kosong</b>. Alamat server dan anon key sudah tertanam di firmware.</td></tr>
        <tr><td>Kunci alat</td><td>kunci dari Bab 3. Hurufnya terlihat saat diketik; setelah disimpan, halaman menampilkan 4 huruf terakhirnya untuk dicocokkan</td></tr>
    <tr><td>Nomor board</td><td><b>1</b> untuk board T01–T16 · <b>2</b> untuk board T17–T30, VIP, T35</td></tr>
    <tr><td>Nama alat</td><td><code>board1</code> / <code>board2</code></td></tr>
    <tr><td>Jenis relay</td><td><b>Aktif LOW</b> (modul yang terpasang sekarang)</td></tr>
  </table>
  <ol start="6"><li>Tekan <b>Simpan &amp; nyalakan ulang</b>. Ulangi untuk board kedua dengan Nomor board <b>2</b>.</li></ol>
  <div class="kotak">Halaman alat sehari-hari: <b>http://lampu-spl1.local</b> dan <b>http://lampu-spl2.local</b> (dari Wi-Fi venue). Lupa kunci alat: tahan tombol <b>BOOT</b> 3 detik (tanpa menekan RESET) saat alat menyala untuk membuka hotspot pengaturan lagi.</div>
</section>

<section class="bab">
  <h2>5. Uji di venue (wajib, ±10 menit)</h2>
  <table>
    <tr><th style="width:6%">#</th><th>Lakukan</th><th style="width:34%">Harus terjadi</th></tr>
    <tr><td>1</td><td>Buka SPL Kasir di PC → Papan.</td><td>Tanda hijau <b>"alat online (2)"</b>.</td></tr>
    <tr><td>2</td><td>Tekan <b>Nyalakan semua</b>.</td><td>Semua lampu biliar menyala dalam 1–3 detik.</td></tr>
    <tr><td>3</td><td>Tekan <b>Matikan semua</b>.</td><td>Semua lampu padam.</td></tr>
    <tr><td>4</td><td>Buka satu meja (walk-in), misalnya Meja 5.</td><td>Hanya lampu Meja 5 menyala.</td></tr>
    <tr><td>5</td><td>Tutup tab Meja 5.</td><td>Lampu Meja 5 padam.</td></tr>
    <tr><td>6</td><td>Ulangi dari HP manajer (kasir.sportspoollounge.com).</td><td>Lampu ikut berubah — tidak harus dari PC.</td></tr>
    <tr><td>7</td><td>Cabut internet/Wi-Fi sebentar saat ada lampu menyala.</td><td>Lampu <b>tetap menyala</b>.</td></tr>
    <tr><td>8</td><td>Cabut listrik satu ESP32, pasang lagi.</td><td>Lampu meja yang dipakai menyala lagi sendiri dalam beberapa detik.</td></tr>
  </table>
  <div class="awas">Kalau satu lampu tidak berubah padahal tanda alat hijau: kemungkinan kabel/SSR atau peta pin. Uji relay itu langsung: <span class="kode">http://lampu-spl1.local/uji?kunci=KUNCI_ALAT&amp;meja=T05&amp;on=1</span> (server akan mengembalikannya dalam sedetik — hanya untuk cek kabel).</div>

  <h2 style="margin-top:6mm">6. Peta pin (tidak berubah)</h2>
  <div class="dua"><div><h3>Board 1 — 16 kanal</h3>${tabelPin(PIN1)}</div><div><h3>Board 2 — 19 kanal</h3>${tabelPin(PIN2)}</div></div>
  <p>Meja T31–T34 dan T36–T40 belum punya relay. Kalau nanti dipasang, <b>tidak perlu upload ulang</b>: isi kolom <b>Peta tambahan</b> di halaman alat, misalnya <code>T31=12,T32=13,T33=14,T34=21</code>. GPIO aman: 1–18, 21, 35–45.</p>
</section>

<section class="bab">
  <h2>7. Kalau ada yang tidak beres</h2>
  <table>
    <tr><th style="width:32%">Yang terlihat</th><th style="width:30%">Artinya</th><th>Yang dilakukan</th></tr>
    <tr><td>Papan: "kunci alat belum dipasang"</td><td>Kunci belum ada di server</td><td>Bab 3</td></tr>
    <tr><td>Papan: "belum ada alat yang pernah terhubung"</td><td>ESP32 belum pernah menghubungi server</td><td>Cek Wi-Fi, alamat, anon key, dan kunci di halaman alat</td></tr>
    <tr><td>Papan: "1 dari 2 alat online"</td><td>Satu board mati / tidak dapat Wi-Fi</td><td>Cek listrik panel dan sinyal Wi-Fi board itu</td></tr>
    <tr><td>Papan: "alat mati — terakhir terlihat 21.07"</td><td>Kedua board diam sejak jam itu</td><td>Cek listrik / password Wi-Fi yang baru diganti</td></tr>
    <tr><td>Halaman alat: "server menjawab 401/403"</td><td>Kunci alat salah atau sudah diganti</td><td>Tahan BOOT 3 detik (tanpa RESET) → hotspot → ketik ulang kunci Bab 3; cocokkan 4 huruf terakhir</td></tr>
    <tr><td>Halaman alat: "server menjawab 404"</td><td>Alamat Supabase salah</td><td>Cek alamat di halaman alat</td></tr>
    <tr><td>Semua lampu berkedip tiap alat restart</td><td>Jenis relay salah</td><td>Ganti ke "Aktif LOW"/"Aktif HIGH"</td></tr>
    <tr><td>Lampu padam saat internet putus</td><td>Firmware lama masih terpasang</td><td>Upload ulang firmware dari paket ini</td></tr>
  </table>
  <h3>Keamanan</h3>
  <ul>
    <li>Password Wi-Fi tidak ada di dalam kode; tersimpan di alat masing-masing.</li>
    <li>Kunci alat disimpan di server sebagai sidik jari. Tanpa kunci yang benar, alat tidak mendapat data apa pun.</li>
    <li>Anon key di halaman ini adalah kunci publik (sama dengan yang dipakai situs), bukan rahasia.</li>
  </ul>
  <p style="margin-top:10mm;color:#7a6f63;font-size:9pt">CV SMOKE HOUSE RESTO · Jl. Batang Anai No. 2, Rimbo Kaluang, Padang Barat, Kota Padang · WhatsApp 0851-2118-0988</p>
</section>
</body></html>`;

const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage();
await p.setContent(html, { waitUntil: "load" });
const berkas = resolve(OUT, "Panduan-Lampu-ESP32-dan-PC-Kasir.pdf");
await p.pdf({ path: berkas, format: "A4", printBackground: true, displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#999">SPL — Lampu meja &amp; PC kasir · halaman <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
  margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" } });
await b.close();
console.log("PDF siap:", berkas, existsSync(berkas));
