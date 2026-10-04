/**
 * Membuat APK SPL — aplikasi TAMU atau KASIR.
 *
 *   npm run apk          → release/SPL-Tamu-debug.apk   (booking untuk pelanggan)
 *   npm run apk:kasir    → release/SPL-Kasir-debug.apk  (panel operasional, pakai PIN)
 *
 * SATU proyek Android dipakai untuk keduanya. Yang membedakan cuma tiga hal —
 * `applicationId`, nama aplikasi, dan alamat situs yang dimuat — dan ketiganya
 * ditimpa DI FOLDER KERJA, bukan di `android/` yang ada di repo. Jadi tidak ada
 * dua salinan proyek Android yang harus dijaga tetap sama.
 *
 * KENAPA TIDAK LANGSUNG `gradlew`: nama folder proyek ini mengandung SPASI
 * ("aplikasi booking bliard"), dan Android Gradle Plugin gagal dengan
 * `java.io.IOException: Invalid file path` kalau jalurnya berspasi. Proyeknya
 * disalin dulu ke folder kerja tanpa spasi. Yang ikut disalin bukan cuma
 * `android/`: `capacitor.settings.gradle` menunjuk `../node_modules/@capacitor/android`
 * secara RELATIF, jadi paket itu harus ada di sebelahnya juga.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TARGET = {
  tamu: {
    appId: "id.spl.tamu",
    nama: "SPL Sports Pool Lounge",
    web: "web-tamu",
    situs: "https://spl-tamu.pages.dev",
    keluar: "SPL-Tamu-debug.apk",
  },
  kasir: {
    appId: "id.spl.kasir",
    nama: "SPL Kasir",
    web: "web",
    situs: "https://spl-kasir.pages.dev",
    keluar: "SPL-Kasir-debug.apk",
  },
};

const pilihan = (process.argv[2] ?? "tamu").toLowerCase();
const T = TARGET[pilihan];
if (!T) {
  console.error(`Target tidak dikenal: ${pilihan}. Pilih: ${Object.keys(TARGET).join(" | ")}`);
  process.exit(1);
}

const AKAR = process.cwd();
const KERJA = join(homedir(), "AppData", "Local", "spl-apk", pilihan);   // tanpa spasi
const PROYEK = join(KERJA, "android");
const JAVA_HOME = process.env.JAVA_HOME ?? "C:/Program Files/Android/Android Studio/jbr";
const ANDROID_HOME = process.env.ANDROID_HOME ?? join(homedir(), "AppData", "Local", "Android", "Sdk");

const jalan = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", shell: true, ...opts });

if (!existsSync(join(AKAR, T.web, "index.html"))) {
  console.error(`Folder ${T.web} belum dibangun. Jalankan dulu:\n  ${
    pilihan === "tamu" ? "VITE_MODE_TAMU=1 WEB_OUT=web-tamu npm run app" : "npm run app"}`);
  process.exit(1);
}
if (!existsSync(JAVA_HOME)) {
  console.error(`Java tidak ketemu di ${JAVA_HOME}. Pasang Android Studio, atau set JAVA_HOME.`);
  process.exit(1);
}

// Konfigurasi Capacitor diarahkan ke target ini, lalu DIKEMBALIKAN — supaya
// berkas di repo tetap apa adanya walau build-nya gagal di tengah jalan.
const KONFIG = join(AKAR, "capacitor.config.json");
const konfigAsli = readFileSync(KONFIG, "utf8");
try {
  writeFileSync(KONFIG, JSON.stringify({
    appId: T.appId,
    appName: T.nama,
    webDir: T.web,
    android: { allowMixedContent: false },
    server: { url: T.situs, cleartext: false, androidScheme: "https" },
  }, null, 2) + "\n");

  console.log(`1/5 · menyalin berkas web (${T.web}) ke proyek Android`);
  jalan("npx", ["cap", "sync", "android"]);
} finally {
  writeFileSync(KONFIG, konfigAsli);
}

console.log(`2/5 · menyiapkan folder kerja ${KERJA}`);
const lewati = new Set(["build", ".gradle", ".cxx"]);
const salin = (dari, ke) => cpSync(dari, ke, {
  recursive: true,
  filter: (src) => !(lewati.has(src.split(/[\/]/).pop()) && statSync(src).isDirectory()),
});
rmSync(join(PROYEK, "app", "src"), { recursive: true, force: true });   // buang sisa lama
mkdirSync(PROYEK, { recursive: true });
salin(join(AKAR, "android"), PROYEK);
salin(join(AKAR, "node_modules", "@capacitor", "android"),
      join(KERJA, "node_modules", "@capacitor", "android"));

console.log(`3/5 · menandai aplikasi sebagai ${T.appId} (${T.nama})`);
// `applicationId` boleh berbeda dari nama paket Java, jadi cukup satu baris ini
// yang ditimpa — kelas MainActivity tidak perlu dipindah folder.
const gradle = join(PROYEK, "app", "build.gradle");
writeFileSync(gradle, readFileSync(gradle, "utf8")
  .replace(/applicationId ".*"/, `applicationId "${T.appId}"`));
const strings = join(PROYEK, "app", "src", "main", "res", "values", "strings.xml");
writeFileSync(strings, readFileSync(strings, "utf8")
  .replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${T.nama}$2`)
  .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${T.nama}$2`));

// Jalur SDK ditulis dengan GARIS MIRING BIASA. Berkas .properties menganggap
// backslash sebagai escape, jadi "C:\Users\..." terbaca rusak dan Gradle gagal
// dengan "Invalid file path" — pesan yang menyesatkan, seolah-olah letak
// proyeknya yang salah.
const SEP = String.fromCharCode(92);
writeFileSync(join(PROYEK, "local.properties"),
  "sdk.dir=" + ANDROID_HOME.split(SEP).join("/") + String.fromCharCode(10));

console.log("4/5 · membangun APK (Gradle)");
// Jalur PENUH: di Windows, perintah relatif tidak dicari di dalam `cwd`.
const gradlew = join(PROYEK, process.platform === "win32" ? "gradlew.bat" : "gradlew");
jalan(`"${gradlew}"`, ["assembleDebug", "--no-daemon"], {
  cwd: PROYEK,
  env: { ...process.env, JAVA_HOME, ANDROID_HOME },
});

console.log("5/5 · menyalin APK ke release/");
const dari = join(PROYEK, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const ke = join(AKAR, "release", T.keluar);
mkdirSync(join(AKAR, "release"), { recursive: true });
cpSync(dari, ke);
console.log(`\nSelesai: ${ke}  (${(statSync(ke).size / 1024 / 1024).toFixed(1)} MB)`);
console.log('Kirim berkas ini ke HP Android, buka, izinkan "pasang dari sumber ini".');
