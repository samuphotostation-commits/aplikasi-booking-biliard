/**
 * Aplikasi kasir SPL untuk Windows.
 *
 * Isinya aplikasi yang sama dengan versi web (web/index.html) — dibungkus
 * jendela sendiri supaya ada ikon di Start Menu, layar penuh, dan tidak ada
 * bilah alamat yang bisa tertutup tidak sengaja saat jam sibuk.
 *
 * Halaman TIDAK dibuka lewat file:// melainkan lewat skema sendiri
 * "spl://app/…" yang didaftarkan sebagai asal yang aman. Bedanya penting:
 * dengan asal yang aman, penyimpanan perangkat (antrean aksi yang belum
 * terkirim) tetap hidup setelah aplikasi ditutup — kalau lewat file://,
 * Chromium mematikan penyimpanan itu dan antrean bisa hilang.
 *
 * Datanya sendiri tidak disimpan di dalam aplikasi ini: semuanya mengalir ke
 * jejak bersama di Supabase, jadi tablet kasir, HP staf, dan PC ini melihat
 * hal yang sama.
 */
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

/** Salinan situs kasir yang ikut di dalam installer. */
const AKAR_BAWAAN = path.join(__dirname, "..", "web");
const AWAL = "spl://app/index.html";

/* ── PEMBARUAN MANDIRI (permintaan pemilik 14 Nov 2026) ─────────────
   Dulu tiap perbaikan di situs kasir berarti memasang ulang installer di
   tiap PC. Sekarang aplikasi mengunduh versi terbaru situs kasir sendiri
   dari ASAL ke folder data pengguna, memeriksa sidik jari SHA-256 tiap
   berkas terhadap versi.json, lalu memakainya. Yang ikut berganti hanya isi
   halaman; jendela & jembatan cetak (berkas di folder electron/) tetap
   butuh installer baru — itu jarang sekali.

   Pengamannya:
   - Hanya dari ASAL (situs kasir sendiri, https), bukan alamat dari luar.
   - Satu berkas saja yang sidik jarinya tidak cocok → seluruh pembaruan
     dibuang; versi yang sedang dipakai tidak tersentuh.
   - Installer yang lebih baru dari unduhan selalu menang (lihat akarAktif). */
// SPL_ASAL_PEMBARUAN hanya untuk menguji di komputer pengembang (server tiruan).
const ASAL = process.env.SPL_ASAL_PEMBARUAN || "https://kasir.sportspoollounge.com";
const folderPembaruan = () => path.join(app.getPath("userData"), "pembaruan");
const bacaJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function akarAktif() {
  const bawaan = bacaJson(path.join(AKAR_BAWAAN, "versi.json"));
  const penunjuk = bacaJson(path.join(folderPembaruan(), "aktif.json"));
  if (penunjuk && typeof penunjuk.folder === "string" && /^[\w.-]+$/.test(penunjuk.folder)) {
    const dir = path.join(folderPembaruan(), penunjuk.folder);
    const v = bacaJson(path.join(dir, "versi.json"));
    if (v && fs.existsSync(path.join(dir, "index.html")) && (!bawaan || v.dibuat > bawaan.dibuat)) {
      return { akar: dir, versi: v, sumber: "pembaruan" };
    }
  }
  return { akar: AKAR_BAWAAN, versi: bawaan, sumber: "bawaan" };
}
let aktif = { akar: AKAR_BAWAAN, versi: null, sumber: "bawaan" };

protocol.registerSchemesAsPrivileged([
  {
    scheme: "spl",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

/** Layani berkas dari folder web/ — dan tolak apa pun di luar folder itu. */
function layaniBerkas(req) {
  const { pathname } = new URL(req.url);
  const diminta = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const akar = aktif.akar;
  const penuh = path.join(akar, diminta);
  if (!penuh.startsWith(akar + path.sep)) return new Response("Tidak ditemukan", { status: 404 });
  return net.fetch(pathToFileURL(penuh).toString());
}

/* ── Cetak struk TANPA dialog ──────────────────────────────────────
   Peramban selalu memunculkan dialog cetak; di aplikasi Windows tidak
   perlu. Pemilik memilih printer struk sekali di layar Atur, sesudah itu
   tombol Cetak Struk langsung keluar kertasnya.

   Ukuran kertas TIDAK dipaksa di sini: printer struk 58/80 mm sudah punya
   ukuran bawaannya sendiri di Windows, dan memaksanya dari sini justru
   membuat struk terpotong di sebagian model. */
ipcMain.handle("spl:daftar-printer", async (e) => {
  try {
    const daftar = await e.sender.getPrintersAsync();
    return daftar.map((p) => ({ nama: p.name, keterangan: p.displayName || p.description || "", bawaan: !!p.isDefault }));
  } catch {
    return [];
  }
});

/* Kertas dapur dicetak dari jendela tersembunyi, bukan dari layar panel, dan
   ke printer yang dipilih per bagian. Skrip dimatikan karena isinya memuat
   catatan yang diketik tamu. */
ipcMain.handle("spl:cetak-html", async (_e, html, printer) => {
  if (typeof html !== "string" || !html || !printer) return { ok: false, alasan: "printer belum dipilih" };
  const jendela = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await jendela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((selesai) => {
      jendela.webContents.print(
        { silent: true, printBackground: true, deviceName: printer, margins: { marginType: "none" } },
        (ok, alasan) => selesai(ok ? { ok: true } : { ok: false, alasan: alasan || "dibatalkan" }),
      );
    });
  } catch (err) {
    return { ok: false, alasan: String(err && err.message ? err.message : err) };
  } finally {
    jendela.destroy();
  }
});

ipcMain.handle("spl:cetak", async (e, printer) => {
  try {
    const hasil = await new Promise((selesai) => {
      e.sender.print(
        { silent: true, printBackground: true, ...(printer ? { deviceName: printer } : {}) },
        (ok, alasan) => selesai(ok ? { ok: true } : { ok: false, alasan: alasan || "dibatalkan" }),
      );
    });
    return hasil;
  } catch (err) {
    return { ok: false, alasan: String(err && err.message ? err.message : err) };
  }
});

/** Versi yang sedang dipakai aplikasi ini. */
ipcMain.handle("spl:versi", () => ({
  build: aktif.versi ? aktif.versi.build : null,
  dibuat: aktif.versi ? aktif.versi.dibuat : null,
  aplikasi: app.getVersion(),
  sumber: aktif.sumber,
}));

async function versiTerbaru() {
  const r = await net.fetch(`${ASAL}/versi.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`server menjawab ${r.status}`);
  const v = await r.json();
  if (!v || typeof v.build !== "string" || !Array.isArray(v.berkas)) throw new Error("versi.json tidak dikenali");
  return v;
}

/** Versi terbaru di server — tanpa daftar berkasnya. */
ipcMain.handle("spl:cek-pembaruan", async () => {
  try {
    const v = await versiTerbaru();
    return { ok: true, build: v.build, dibuat: v.dibuat, aplikasi: v.aplikasi, android: v.android ?? null };
  } catch (err) {
    return { ok: false, alasan: String(err && err.message ? err.message : err) };
  }
});

let sedangMemperbarui = false;
ipcMain.handle("spl:perbarui", async () => {
  if (sedangMemperbarui) return { ok: false, alasan: "pembaruan sedang berjalan" };
  sedangMemperbarui = true;
  const akar = folderPembaruan();
  let sementara = null;
  try {
    const v = await versiTerbaru();
    if (aktif.versi && v.build === aktif.versi.build) return { ok: true, sama: true };
    if (!v.berkas.some((b) => b && b.p === "index.html")) throw new Error("versi.json tanpa index.html");
    const nama = `b-${String(v.dibuat).replace(/\D/g, "")}-${crypto.randomBytes(3).toString("hex")}`;
    sementara = path.join(akar, `${nama}.unduh`);
    fs.mkdirSync(sementara, { recursive: true });
    for (const b of v.berkas) {
      // Jalur hanya huruf/angka biasa, tanpa ".." — berkas tidak boleh keluar folder.
      if (!b || typeof b.p !== "string" || !/^[\w.-]+(\/[\w.-]+)*$/.test(b.p) || b.p.split("/").includes("..")) {
        throw new Error(`jalur berkas tidak sah: ${b && b.p}`);
      }
      // `u` = alamat unduh lain untuk berkas yang sama (index.html → salinan .txt,
      // karena Cloudflare menyisipkan skrip ke HTML yang dilayani).
      const dari = typeof b.u === "string" && /^[\w.-]+(\/[\w.-]+)*$/.test(b.u) && !b.u.split("/").includes("..") ? b.u : b.p;
      const r = await net.fetch(`${ASAL}/${dari}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`${b.p}: server menjawab ${r.status}`);
      const isi = Buffer.from(await r.arrayBuffer());
      const sidik = crypto.createHash("sha256").update(isi).digest("hex");
      if (sidik !== b.h) throw new Error(`${b.p}: sidik jari tidak cocok`);
      const tujuan = path.join(sementara, ...b.p.split("/"));
      fs.mkdirSync(path.dirname(tujuan), { recursive: true });
      fs.writeFileSync(tujuan, isi);
    }
    fs.writeFileSync(path.join(sementara, "versi.json"), JSON.stringify(v));
    const jadi = path.join(akar, nama);
    fs.renameSync(sementara, jadi);
    sementara = null;
    fs.writeFileSync(path.join(akar, "aktif.json"), JSON.stringify({ folder: nama }));
    aktif = akarAktif();
    // Versi-versi lama dibuang; yang sedang dipakai tidak.
    for (const f of fs.readdirSync(akar)) {
      if (f !== nama && f !== "aktif.json") fs.rmSync(path.join(akar, f), { recursive: true, force: true });
    }
    return { ok: true, build: v.build };
  } catch (err) {
    return { ok: false, alasan: String(err && err.message ? err.message : err) };
  } finally {
    if (sementara) fs.rmSync(sementara, { recursive: true, force: true });
    sedangMemperbarui = false;
  }
});

function buatJendela() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    backgroundColor: "#0B0B0C",
    title: "SPL Kasir",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      // Jembatan sempit untuk cetak senyap saja — lihat electron/preload.cjs.
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadURL(AWAL);

  // Tautan ke luar dibuka di browser, bukan menimpa layar kasir.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("spl://")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  return win;
}

// Satu jendela saja: klik ikon kedua kali memunculkan jendela yang sudah ada.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    aktif = akarAktif();
    protocol.handle("spl", layaniBerkas);
    Menu.setApplicationMenu(null);
    buatJendela();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) buatJendela();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
