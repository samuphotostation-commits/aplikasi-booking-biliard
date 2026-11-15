/**
 * Pilih printer struk — setelan PERANGKAT, bukan data venue.
 *
 * Hanya muncul di aplikasi Windows, karena cuma di sana struk bisa keluar
 * tanpa dialog cetak. Di peramban bagian ini disembunyikan dan sebagai
 * gantinya dijelaskan kenapa dialognya tetap muncul — daripada memberi tombol
 * yang tidak melakukan apa-apa.
 */
import { useEffect, useState } from "react";
import {
  aturCetakOtomatis, cetakKertas, cetakOtomatis, cetakSenyapMungkin, cetakHtmlStruk, htmlStrukContoh, PESAN_KOTAK_DIALOG, daftarPrinter, printerBagian,
  printerTersimpan, simpanPrinter, simpanPrinterBagian, printerBagian2, simpanPrinterBagian2,
} from "../../lib/cetak";
import { htmlKertas, kelompokkan, kunciTiket } from "../../lib/cetakDapur";
import { useAdmin } from "../../lib/adminStore";
import type { Ticket } from "../../data/live";
import { bukaJendelaTamu } from "../../lib/tampilTamu";
import { RILIS_WINDOWS } from "../../data/rilisWindows";
import { coOtomatis, aturCoOtomatis } from "../../lib/strukCO";

/** Versi installer Windows di PC ini (null di peramban / saat belum terbaca). */
function useVersiAplikasi(): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    const d = (window as unknown as { splAplikasi?: { versi(): Promise<{ aplikasi: string }> } }).splAplikasi;
    void d?.versi().then((x) => setV(x.aplikasi)).catch(() => {});
  }, []);
  return v;
}
/** 1.3.1 ke atas: kertas setinggi isinya, langsung terpotong. */
const versiPas = (v: string) => {
  const [a = 0, b = 0, c = 0] = v.split(".").map(Number);
  return a > 1 || (a === 1 && (b > 3 || (b === 3 && c >= 1)));
};

export function PilihPrinter() {
  const bisaSenyap = cetakSenyapMungkin();
  const [daftar, setDaftar] = useState<{ nama: string; keterangan: string; bawaan: boolean }[]>([]);
  const [pilih, setPilih] = useState(printerTersimpan());
  const [kabar, setKabar] = useState<string | null>(null);
  const [mencetak, setMencetak] = useState(false);
  const versi = useVersiAplikasi();
  const muat = () => void daftarPrinter().then(setDaftar);

  useEffect(() => { if (bisaSenyap) muat(); }, [bisaSenyap]);

  /** Printer tersimpan yang TIDAK ada lagi di Windows (dicabut / berganti nama). */
  const hilang = !!pilih && daftar.length > 0 && !daftar.some((p) => p.nama === pilih);
  const bawaan = daftar.find((p) => p.bawaan)?.nama;

  /** Uji cetak: 2 lembar kecil — terlihat apakah silent, terpotong, dan pas panjangnya. */
  async function uji() {
    setMencetak(true); setKabar(null);
    let pesan = "2 lembar percobaan terkirim tanpa dialog — cek: dua potongan, masing-masing pendek.";
    for (let i = 0; i < 2; i++) {
      const r = await cetakHtmlStruk(htmlStrukContoh(pilih || bawaan || ""));
      if (!r.ok) { pesan = `Gagal: ${r.alasan ?? "printer tidak menjawab"}`; break; }
      if (r.alasan) pesan = r.alasan;
    }
    setKabar(pesan); setMencetak(false);
  }

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">Printer struk</h2>

      {!bisaSenyap ? (
        <SetupPeramban />
      ) : (
        <div className="space-y-2">
          {versi && !versiPas(versi) && (
            <div className="rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">
              Aplikasi di PC ini versi {versi}: struk belum dipotong sesuai panjang isinya.
              {RILIS_WINDOWS && <> Pasang <a href={RILIS_WINDOWS.halaman} target="_blank" rel="noreferrer" className="font-bold underline">versi {RILIS_WINDOWS.versi}</a> sekali saja.</>}
            </div>
          )}
          <div className="flex gap-2">
            <select
              value={pilih} aria-label="Printer struk"
              onChange={(e) => { setPilih(e.target.value); simpanPrinter(e.target.value); setKabar(null); }}
              className={`min-h-[44px] min-w-0 flex-1 rounded-xl border bg-ink px-3 text-sm text-cream ${hilang ? "border-red-400" : "border-line"}`}
            >
              <option value="">Printer bawaan Windows{bawaan ? ` (${bawaan})` : ""}</option>
              {hilang && <option value={pilih}>{pilih} — tidak ditemukan</option>}
              {daftar.map((p) => (
                <option key={p.nama} value={p.nama}>
                  {p.nama}{p.bawaan ? " (bawaan)" : ""}
                </option>
              ))}
            </select>
            <button type="button" onClick={muat} title="Muat ulang daftar printer"
              className="min-h-[44px] shrink-0 rounded-xl border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber">
              Muat ulang
            </button>
          </div>
          {hilang ? (
            <p role="alert" className="text-[12px] leading-snug text-red-300">
              Printer “{pilih}” tidak ada lagi di komputer ini (dicabut atau berganti nama). Sampai dipilih ulang,
              struk dicetak ke printer bawaan Windows.
            </p>
          ) : daftar.length > 0 && (
            <p className="text-[12px] text-emerald-300">✓ Printer siap: {pilih || bawaan || "printer bawaan Windows"}</p>
          )}
          <p className="text-[11px] leading-snug text-dim">
            Struk & bill keluar <span className="text-cream">langsung tanpa kotak dialog</span>, 2 lembar, masing-masing
            terpotong, dan panjang kertasnya mengikuti isi struk (lebar 72 mm). Kosongkan = printer bawaan Windows.
          </p>
          <button
            type="button" disabled={mencetak}
            onClick={() => void uji()}
            className="min-h-[40px] w-full rounded-xl border border-amber/60 text-[13px] font-semibold text-amber hover:bg-amber/10 disabled:opacity-50"
          >
            {mencetak ? "Mencetak…" : "Uji cetak (2 lembar kecil)"}
          </button>
          {kabar && <p className="text-[12px] text-amber">{kabar}</p>}
        </div>
      )}
      <SakelarCO />
    </section>
  );
}

/** CO (Cafe Order) otomatis tiap pesanan meja — setelan perangkat kasir. */
function SakelarCO() {
  const [nyala, setNyala] = useState(coOtomatis());
  return (
    <label className="mt-2 flex items-start gap-2.5 rounded-xl border border-line bg-ink-2 px-3.5 py-3 text-[13px] text-cream">
      <input type="checkbox" checked={nyala} className="mt-0.5 h-4 w-4 accent-amber"
        onChange={(e) => { aturCoOtomatis(e.target.checked); setNyala(e.target.checked); }} />
      <span>
        Cetak <b>Cafe Order (CO)</b> otomatis setiap meja memesan makanan/minuman
        <span className="block text-[11px] text-dim">2 lembar terpotong, daftar pesanan tanpa harga — ke printer struk komputer ini.</span>
      </span>
    </label>
  );
}

/*
 * SETUP PRINTER DI VERSI WEB (pemilik 15 Nov 2026: "pastikan lagi karena ini
 * belum bisa di-setup yang di web"). Halaman web memang tidak boleh memilih
 * printer sendiri — itu aturan semua browser. Yang BISA: Chrome/Edge dibuka
 * dengan `--kiosk-printing`; struk lalu langsung keluar TANPA kotak dialog ke
 * PRINTER BAWAAN WINDOWS. Jadi "memilih printer" di versi web = menjadikan
 * printer struk (mis. POS-80C) printer bawaan Windows, sekali saja.
 */
function SetupPeramban() {
  const [kabar, setKabar] = useState<string | null>(null);
  const alamat = `${window.location.origin}/admin`;
  const profil = String.raw`--user-data-dir="%LOCALAPPDATA%\SPL-Kasir-Chrome"`;
  const perintah = `chrome.exe --kiosk-printing ${profil} --app=${alamat}`;
  const isiCmd = [
    "@echo off",
    "rem SPL Kasir - cetak struk langsung tanpa kotak dialog (ke printer bawaan Windows)",
    String.raw`set "B=%ProgramFiles%\Google\Chrome\Application\chrome.exe"`,
    String.raw`if not exist "%B%" set "B=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"`,
    String.raw`if not exist "%B%" set "B=%LocalAppData%\Google\Chrome\Application\chrome.exe"`,
    String.raw`if not exist "%B%" set "B=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"`,
    `start "" "%B%" --kiosk-printing ${profil} --app=${alamat}`,
    "",
  ].join("\r\n");
  function unduh() {
    const url = URL.createObjectURL(new Blob([isiCmd], { type: "application/octet-stream" }));
    const el = document.createElement("a");
    el.href = url; el.download = "SPL Kasir - cetak langsung.cmd";
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function uji() {
    const r = await cetakHtmlStruk(htmlStrukContoh(""));
    setKabar(!r.ok ? `Gagal: ${r.alasan ?? ""}`
      : r.alasan === PESAN_KOTAK_DIALOG ? "✗ Kotak printer masih muncul — Kasir ini belum dibuka lewat pintasan di langkah 2. Tutup jendela ini, buka pintasan “SPL Kasir - cetak langsung”, lalu uji lagi."
        : "✓ Tercetak langsung tanpa kotak printer. Setup selesai.");
  }
  const Langkah = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="flex gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber text-[12px] font-bold text-ink">{n}</span>
      <div className="min-w-0 flex-1 text-[12px] leading-snug text-mute">{children}</div>
    </li>
  );
  return (
    <div className="space-y-3 rounded-xl border border-amber/50 bg-amber/5 px-3.5 py-3">
      <p className="text-[12px] font-bold leading-snug text-amber">
        Kasir dibuka lewat browser. Supaya struk langsung keluar tanpa kotak printer, ikuti 3 langkah ini sekali saja di PC kasir:
      </p>
      <ol className="space-y-2.5">
        <Langkah n={1}>
          Jadikan printer struk (mis. <span className="text-cream">POS-80C</span>) <span className="text-cream">printer bawaan Windows</span>:
          Pengaturan Windows → Bluetooth &amp; perangkat → Printer &amp; pemindai → pilih printernya →
          <span className="text-cream"> Jadikan default</span>. Matikan juga “Biarkan Windows mengatur printer default”.
        </Langkah>
        <Langkah n={2}>
          Unduh pintasan ini, taruh di Desktop, lalu buka Kasir <span className="text-cream">selalu lewat pintasan itu</span>
          (login sekali di jendela barunya).
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" onClick={unduh}
              className="min-h-[36px] rounded-lg bg-amber px-3 text-[12px] font-bold text-ink">Unduh pintasan “cetak langsung”</button>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(perintah).then(() => setKabar("Perintah pintasan disalin."))}
              className="min-h-[36px] rounded-lg border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber">Salin perintahnya</button>
          </div>
          <div className="mt-1 text-[11px] text-dim">Kalau Windows bertanya “jalankan file ini?”, pilih Jalankan / Run.</div>
        </Langkah>
        <Langkah n={3}>
          Tekan uji cetak. Benar kalau: <span className="text-cream">tidak ada kotak dialog</span>, kertas pendek, dan terpotong tepat di bawah tulisan.
          <button type="button" onClick={() => void uji()}
            className="mt-1.5 block min-h-[36px] rounded-lg border border-amber/60 px-3 text-[12px] font-semibold text-amber hover:bg-amber/10">Uji cetak</button>
        </Langkah>
      </ol>
      {kabar && <p className="text-[12px] text-amber">{kabar}</p>}
      {RILIS_WINDOWS && (
        <p className="border-t border-line pt-2 text-[11px] leading-snug text-dim">
          Alternatif yang bisa memilih printer langsung dari sini (termasuk printer dapur/bar):{" "}
          <a href={RILIS_WINDOWS.halaman} target="_blank" rel="noreferrer" className="font-semibold text-amber underline">
            aplikasi Windows SPL Kasir {RILIS_WINDOWS.versi}
          </a>.
        </p>
      )}
    </div>
  );
}

/** Kertas contoh: mencoba printer tanpa harus membuat pesanan sungguhan. */
const contoh = (station: Ticket["station"]): Ticket => ({
  id: "contoh", sessionId: "contoh", tableName: "CONTOH", itemId: "contoh", name: "Percobaan printer", qty: 1,
  station, status: "new", at: Date.now(), note: "Kalau terbaca, printer siap.",
});

/** Printer dapur dan bar. Setelan perangkat, seperti printer struk. */
export function PrinterDapur() {
  const { a } = useAdmin();
  const bisaSenyap = cetakSenyapMungkin();
  const [daftar, setDaftar] = useState<{ nama: string }[]>([]);
  const [pilih, setPilih] = useState({ kitchen: printerBagian("kitchen"), bar: printerBagian("bar") });
  const [pilih2, setPilih2] = useState({ kitchen: printerBagian2("kitchen"), bar: printerBagian2("bar") });
  const [otomatis, setOtomatis] = useState(cetakOtomatis());
  const [kabar, setKabar] = useState<string | null>(null);

  useEffect(() => { if (bisaSenyap) void daftarPrinter().then(setDaftar); }, [bisaSenyap]);

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">Printer dapur &amp; bar</h2>
      {!bisaSenyap ? (
        <p className="rounded-xl border border-line bg-ink-2 px-3.5 py-3 text-[12px] leading-snug text-dim">
          Cetak otomatis hanya jalan di <span className="text-cream">aplikasi Windows SPL Kasir</span> pada
          komputer dapur. Di peramban, tombol Cetak di tab Checker tetap bisa dipakai lewat dialog cetak.
        </p>
      ) : (
        <div className="space-y-2">
          {(["kitchen", "bar"] as const).map((b) => (
            <div key={b} className="space-y-1.5">
            <div className="flex gap-2">
              <select
                value={pilih[b]} aria-label={b === "bar" ? "Printer bar" : "Printer dapur"}
                onChange={(e) => {
                  simpanPrinterBagian(b, e.target.value);
                  setPilih((p) => ({ ...p, [b]: e.target.value }));
                }}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-sm text-cream"
              >
                <option value="">{b === "bar" ? "Bar" : "Dapur"}: tidak dicetak di komputer ini</option>
                {daftar.map((p) => <option key={p.nama} value={p.nama}>{b === "bar" ? "Bar" : "Dapur"}: {p.nama}</option>)}
              </select>
              <button type="button" disabled={!pilih[b]}
                onClick={() => void cetakKertas(htmlKertas(kelompokkan([contoh(b)])[0]), b)
                  .then((r) => setKabar(r.ok ? "Kertas contoh terkirim." : `Gagal: ${r.alasan}`))}
                className="min-h-[44px] shrink-0 rounded-xl border border-line px-3 text-[12px] text-mute hover:border-amber hover:text-amber disabled:opacity-40">
                Coba
              </button>
            </div>
            {pilih[b] && (
              <select
                value={pilih2[b]} aria-label={b === "bar" ? "Printer bar kedua" : "Printer checker kedua"}
                onChange={(e) => {
                  simpanPrinterBagian2(b, e.target.value);
                  setPilih2((p) => ({ ...p, [b]: e.target.value }));
                }}
                className="min-h-[40px] w-full rounded-xl border border-dashed border-line bg-ink px-3 text-[13px] text-mute"
              >
                <option value="">{b === "bar" ? "Bar" : "Dapur"} · printer kedua: tidak dipakai</option>
                {daftar.filter((p) => p.nama !== pilih[b]).map((p) => (
                  <option key={p.nama} value={p.nama}>{b === "bar" ? "Bar" : "Dapur"} · printer kedua: {p.nama}</option>
                ))}
              </select>
            )}
            </div>
          ))}
          <p className="text-[11px] leading-snug text-dim">
            Printer kedua opsional: kalau dipilih, setiap kertas pesanan keluar di dua printer sekaligus
            (mis. satu untuk checker, satu untuk dapur). Catatan pesanan seperti “tidak pedas” ikut tercetak di keduanya.
          </p>
          <label className="flex items-start gap-2.5 rounded-xl border border-line bg-ink-2 px-3.5 py-3 text-[13px] text-cream">
            <input type="checkbox" checked={otomatis} className="mt-0.5 h-4 w-4 accent-amber"
              onChange={(e) => {
                aturCetakOtomatis(e.target.checked, a.tickets.map(kunciTiket));
                setOtomatis(e.target.checked);
              }} />
            <span>
              Cetak otomatis tiap pesanan baru
              <span className="mt-0.5 block text-[11px] leading-snug text-dim">
                Nyalakan di satu komputer saja untuk tiap bagian, supaya kertas tidak keluar dua kali.
              </span>
            </span>
          </label>
          {kabar && <p className="text-[12px] text-amber">{kabar}</p>}
        </div>
      )}
    </section>
  );
}

/**
 * Layar menghadap tamu — juga setelan PERANGKAT, bukan data venue: monitor
 * keduanya menempel di satu komputer kasir, bukan milik venue secara umum.
 */
export function LayarTamu() {
  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-cream before:h-3.5 before:w-1 before:shrink-0 before:rounded-full before:bg-amber before:content-['']">Layar menghadap tamu</h2>
      <div className="rounded-xl border border-line bg-ink-2 p-3.5">
        <p className="text-[12px] leading-relaxed text-dim">
          Buka jendela kedua, lalu geser ke monitor atau tablet yang menghadap tamu. QR dinamis
          muncul di sana dengan ukuran besar dan berubah sendiri jadi{" "}
          <span className="text-cream">LUNAS</span> begitu pembayaran masuk — kasir tidak perlu
          memutar layarnya lagi.
        </p>
        <button
          type="button"
          onClick={() => bukaJendelaTamu()}
          className="mt-2 min-h-[42px] w-full rounded-xl border border-amber/50 bg-amber/10 text-[13px] font-semibold text-amber"
        >
          Buka jendela layar tamu
        </button>
        <p className="mt-2 text-[11px] leading-snug text-dim">
          Tidak ada satu pun tombol di layar itu, jadi aman diletakkan menghadap ruangan.
          Biarkan jendelanya terbuka semalaman; layarnya dijaga supaya tidak tidur sendiri.
        </p>
      </div>
    </section>
  );
}
