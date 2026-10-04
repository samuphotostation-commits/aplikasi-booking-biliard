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
const { pathToFileURL } = require("node:url");

const AKAR = path.join(__dirname, "..", "web");
const AWAL = "spl://app/index.html";

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
  const penuh = path.join(AKAR, diminta);
  if (!penuh.startsWith(AKAR)) return new Response("Tidak ditemukan", { status: 404 });
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

function buatJendela() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    backgroundColor: "#0B0B0C",
    title: "SPL Kasir",
    icon: path.join(AKAR, "ikon-1080.png"),
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
