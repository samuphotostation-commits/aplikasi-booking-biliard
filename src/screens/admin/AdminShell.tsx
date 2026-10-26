import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Mark } from "../../components/UI";
import { Ball } from "../../components/motion/Billiard";
import { useAdmin, recap, businessDateOf, siapDiantar } from "../../lib/adminStore";
import { can, ROLE_LABEL, type Permission, type Role } from "../../data/staff";
import { VENUE_LABEL, type Venue } from "../../data/venue";
import { setVenueAktif, useVenueAktif } from "../../lib/venueAktif";
import { fmtDateLong, rupiah } from "../../lib/core";
import { usePantauKabar } from "../../lib/pantauKabar";

/* Login per KARYAWAN (bukan per peran) supaya setiap tindakan punya nama
   pelakunya di jejak audit — itu syarat kontrol kebocoran kas. */

/** Daftar PIN demo hanya untuk mode demo; build produksi: VITE_SHOW_DEMO_PINS=false. */
const SHOW_DEMO_PINS = import.meta.env.VITE_SHOW_DEMO_PINS !== "false";

/* PIN 4 digit mudah ditebak kalau boleh dicoba tanpa batas. Setelah 5 salah berturut-turut,
   keypad terkunci 30 detik, lalu dua kali lipat setiap kali terkunci lagi (maks 15 menit).
   Tersimpan di perangkat supaya tidak lepas hanya dengan memuat ulang halaman. */
const K_PINLOCK = "spl:v1:pinlock";
type PinLock = { fails: number; locks: number; until: number };
const readLock = (): PinLock => {
  try {
    const x = JSON.parse(window.localStorage.getItem(K_PINLOCK) ?? "null") as PinLock | null;
    return x && typeof x.fails === "number" ? x : { fails: 0, locks: 0, until: 0 };
  } catch { return { fails: 0, locks: 0, until: 0 }; }
};
const writeLock = (x: PinLock) => { try { window.localStorage.setItem(K_PINLOCK, JSON.stringify(x)); } catch { /* mode privat */ } };

/**
 * Tab panel internal + siapa yang boleh membukanya.
 *
 * `izin` memakai izin mesin yang SAMA dengan yang menolak aksinya, jadi tab
 * dan aksi tidak bisa diam-diam berbeda. `roles` dipakai untuk tab yang di
 * mesin tidak punya izin tersendiri (Dapur, Shift, Pesan, Pelanggan).
 * `null` = semua yang sudah masuk.
 */
const TABS: {
  to: string; label: string; end?: boolean;
  izin?: Permission; roles?: readonly Role[];
}[] = [
  { to: "/admin", label: "Papan", end: true, izin: "bukaMeja" },
  { to: "/admin/kasir", label: "Kasir", izin: "tutupTab" },
  { to: "/admin/dapur", label: "Dapur", roles: ["superadmin", "manager", "kru_kasir", "kru_kitchen", "kru_bar", "karyawan"] },
  // ANTAR duduk tepat sesudah Dapur, karena itu urutan kerjanya: dapur
  // menandai matang, pramusaji mengambil dan mengantar. Perannya sama dengan
  // Dapur — siapa pun yang di lantai boleh melihatnya.
  { to: "/admin/antar", label: "Antar", roles: ["superadmin", "manager", "kru_kasir", "kru_kitchen", "kru_bar", "karyawan"] },
  { to: "/admin/menu", label: "Menu & Stok", izin: "kelolaStok" },
  { to: "/admin/gudang", label: "Gudang", izin: "kelolaStok" },
  { to: "/admin/void", label: "Void", izin: "ajukanVoid" },
  // Buka/tutup shift sengaja tidak berizin di mesin: hampir semua aksi uang
  // menuntut shift terbuka, jadi yang bekerja di lantai harus bisa membukanya.
  { to: "/admin/shift", label: "Shift", roles: ["superadmin", "manager", "kru_kasir", "karyawan"] },
  // Absen dipakai SEMUA karyawan — identitasnya dari PIN masing-masing.
  { to: "/admin/absen", label: "Absen" },
  { to: "/admin/promo", label: "Promo", izin: "kelolaPromo" },
  { to: "/admin/pelanggan", label: "Pelanggan", roles: ["superadmin", "manager"] },
  // Karyawan boleh mengirim pemberitahuan booking; blast promo di dalamnya
  // tetap dikunci lewat izin kelolaPromo.
  { to: "/admin/pesan", label: "Pesan", roles: ["superadmin", "manager", "kru_kasir", "karyawan"] },
  { to: "/admin/rekap", label: "Rekap", izin: "lihatRekapPenjualan" },
  // Jejak dipisah dari Rekap (permintaan pemilik 21 Okt 2026): Rekap untuk
  // uang, Jejak untuk siapa melakukan apa.
  { to: "/admin/jejak", label: "Jejak", izin: "lihatJejak" },
  // Atur memuat beberapa bagian dengan izin berbeda (tarif, meja, akun staf).
  // Finance ikut masuk untuk mengatur harga; isinya dipagari sendiri-sendiri.
  { to: "/admin/atur", label: "Atur", roles: ["superadmin", "manager", "finance"] },
];

/** Boleh membuka tab ini? Dipakai untuk daftar tab DAN untuk alamat langsung. */
const bolehTab = (t: (typeof TABS)[number], role: Role | null) =>
  t.izin ? can(role, t.izin) : t.roles ? !!role && t.roles.includes(role) : !!role;

export default function AdminShell() {
  const { a, dispatchA, role, sync, tick, signIn, signOut, kirimKodeEmail, signInEmail, signInSandi,
    sambungkanLagi } = useAdmin();
  /**
   * SPL-5 · bunyi & notifikasi dipasang DI KERANGKA, bukan di tiap layar:
   * reservasi yang masuk harus tetap terdengar walau yang sedang dibuka tab
   * Rekap, dan dapur harus tetap mendengar pesanan baru walau layarnya sedang
   * menampilkan daftar yang sudah selesai.
   */
  usePantauKabar(a, role);
  const nav = useNavigate();
  const path = useLocation().pathname;
  const [pin, setPin] = useState("");
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [lock, setLock] = useState<PinLock>(readLock);
  const [, rerender] = useState(0);
  /** Masuk dengan email: null = tertutup, "email" = isi alamat, "kode" = isi kode. */
  const [emailTahap, setEmailTahap] = useState<null | "email" | "kode">(null);
  const [email, setEmail] = useState("");
  const [kodeEmail, setKodeEmail] = useState("");
  const [emailPesan, setEmailPesan] = useState<string | null>(null);
  const [emailSibuk, setEmailSibuk] = useState(false);
  /**
   * Layar pertama adalah EMAIL + PASSWORD (permintaan pemilik). PIN tetap ada
   * dan tinggal satu ketukan: pergantian kasir antar shift terjadi berkali-kali
   * semalam, dan mengetik email tiap kali terlalu lambat di meja kasir saat
   * ramai — yang lambat akan dicari jalan pintasnya.
   */
  const venue = useVenueAktif();
  const [menyambung, setMenyambung] = useState(false);
  const [caraMasuk, setCaraMasuk] = useState<"sandi" | "pin">("sandi");
  const [sandi, setSandi] = useState("");
  const [sandiPesan, setSandiPesan] = useState<string | null>(null);
  const [sandiSibuk, setSandiSibuk] = useState(false);

  async function masukSandi() {
    setSandiSibuk(true);
    setSandiPesan(null);
    const hasil = await signInSandi(email.trim(), sandi);
    setSandiSibuk(false);
    if (!hasil.ok) { setSandiPesan(hasil.alasan); return; }
    const emp = a.employees.find((x) => x.id === hasil.staffId)
      ?? { id: hasil.staffId, name: hasil.nama, pin: "", role: hasil.peran, active: true };
    dispatchA({ t: "login", emp });
    setSandi("");
  }

  /**
   * AKUN YANG TERIKAT VENUE MEMATOK LAYAR PERANGKAT INI.
   *
   * Satu tempat, bukan di tiap pintu masuk (PIN, email+sandi, kode email,
   * pilih-nama) — kalau ditambal per pintu, cepat atau lambat ada pintu baru
   * yang lupa, dan sisanya adalah kasir Smokehouse yang menatap papan biliar.
   *
   * Dipasang juga sebagai pagar hidup: kalau venue perangkat bergeser dari
   * tab lain, akun yang terikat langsung menariknya kembali.
   */
  const venueAkun = a.me?.venue;
  useEffect(() => {
    if (venueAkun) setVenueAktif(venueAkun);
  }, [venueAkun, venue]);

  const r = recap(a, undefined, venue);
  /** Hidangan matang yang masih menunggu pramusaji — nomor di tab Antar. */
  const menungguAntar = siapDiantar(a, venue).reduce((n, t) => n + t.qty, 0);
  const lockedFor = Math.max(0, Math.ceil((lock.until - Date.now()) / 1000));
  // Hitung mundur kunci PIN.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const iv = setInterval(() => rerender((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [lockedFor > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  void tick;

  function press(d: string) {
    if (pin.length >= 4 || lockedFor > 0) return;
    const next = pin + d;
    setPin(next);
    setErr(false);
    if (next.length === 4) {
      const emp = a.employees.find((e) => e.pin === next && e.active);
      if (emp) {
        const cleared = { fails: 0, locks: 0, until: 0 };
        writeLock(cleared); setLock(cleared);
        // Mode server: PIN yang sama diperiksa lagi di server dan menghasilkan
        // sesi 12 jam. Tanpa sesi itu jejak venue tidak bisa dibaca perangkat ini.
        void signIn(next).then((alasan) => setServerErr(alasan));
        setTimeout(() => { dispatchA({ t: "login", emp }); setPin(""); }, 160);
      } else {
        const fails = lock.fails + 1;
        const locks = fails >= 5 ? lock.locks + 1 : lock.locks;
        const updated: PinLock = fails >= 5
          ? { fails: 0, locks, until: Date.now() + Math.min(15 * 60, 30 * 2 ** (locks - 1)) * 1000 }
          : { ...lock, fails };
        writeLock(updated); setLock(updated);
        setTimeout(() => { setErr(true); setPin(""); }, 220);
      }
    }
  }

  /* ── Belum login ─────────────────────────────────────────────── */
  if (!a.me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6">
        <div className="text-amber"><Mark size={52} /></div>
        <h1 className="mt-3 font-display text-2xl uppercase tracking-[0.14em] text-cream">
          Panel Operasional
        </h1>
        <p className="mt-1 text-sm text-dim">
          {caraMasuk === "sandi" ? "Masuk dengan email & password" : "Masukkan PIN karyawan"}
        </p>

        {caraMasuk === "sandi" && (
          <div className="mt-6 w-full max-w-[320px] space-y-2">
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              type="email" inputMode="email" autoComplete="username" placeholder="email"
              className="min-h-[46px] w-full rounded-xl border border-line bg-ink px-3.5 text-sm text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            <input value={sandi} onChange={(e) => setSandi(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email.trim() && sandi) void masukSandi(); }}
              type="password" autoComplete="current-password" placeholder="password"
              className="min-h-[46px] w-full rounded-xl border border-line bg-ink px-3.5 text-sm text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
            <button
              disabled={sandiSibuk || !email.trim() || !sandi}
              onClick={() => void masukSandi()}
              className="min-h-[48px] w-full rounded-xl bg-amber text-[14px] font-bold text-ink disabled:opacity-40">
              {sandiSibuk ? "Memeriksa…" : "Masuk"}
            </button>
            {sandiPesan && <p role="alert" className="text-center text-[12px] leading-snug text-red-400">{sandiPesan}</p>}
            <button onClick={() => { setCaraMasuk("pin"); setSandiPesan(null); }}
              className="min-h-[44px] w-full rounded-xl border border-line text-[13px] text-mute hover:border-amber hover:text-amber">
              Ganti shift · masuk dengan PIN
            </button>
            <p className="pt-1 text-center text-[11px] leading-snug text-dim">
              Password diatur pemilik di Atur → Akun staf. Staf yang belum diberi password
              tetap masuk lewat PIN.
            </p>
          </div>
        )}

        {caraMasuk === "pin" && (
          <>
          <motion.div className="mt-6 flex gap-3"
            animate={err ? { x: [0, -9, 9, -6, 0] } : {}} transition={{ duration: 0.35 }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                pin.length > i ? "border-amber bg-amber" : "border-line-2"
              }`} />
            ))}
          </motion.div>
          {serverErr && (
            <p role="alert" className="mt-3 max-w-[32ch] text-center text-xs text-red-400">{serverErr}</p>
          )}
          {lockedFor > 0 ? (
            <p role="alert" className="mt-3 text-xs text-red-400">
              Terlalu banyak PIN salah. Coba lagi dalam {lockedFor >= 60 ? `${Math.ceil(lockedFor / 60)} menit` : `${lockedFor} detik`}.
            </p>
          ) : err && (
            <p className="mt-3 text-xs text-red-400">
              PIN tidak dikenal.{lock.fails >= 3 && ` ${5 - lock.fails} percobaan lagi sebelum keypad terkunci.`}
            </p>
          )}

          <div className={`mt-8 grid w-full max-w-[260px] grid-cols-3 gap-3 ${lockedFor > 0 ? "pointer-events-none opacity-40" : ""}`}>
            {["1","2","3","4","5","6","7","8","9"].map((d) => (
              <PinKey key={d} onClick={() => press(d)}>{d}</PinKey>
            ))}
            <PinKey onClick={() => nav("/")} small>Keluar</PinKey>
            <PinKey onClick={() => press("0")}>0</PinKey>
            <PinKey onClick={() => setPin(pin.slice(0, -1))} small>Hapus</PinKey>
          </div>
            <button onClick={() => { setCaraMasuk("sandi"); setServerErr(null); }}
              className="mt-4 min-h-[40px] text-[13px] text-mute underline underline-offset-4">
              Kembali ke email &amp; password
            </button>
          </>
        )}

        {/* ── Masuk dengan email (untuk pemilik/manajer) ────────── */}
        <div className="mt-6 w-full max-w-[300px]">
          {emailTahap === null ? (
            <button onClick={() => { setEmailTahap("email"); setEmailPesan(null); }}
              className="min-h-[44px] w-full text-[13px] text-mute underline underline-offset-4">
              Lupa password? Masuk dengan kode email
            </button>
          ) : (
            <div className="space-y-2 rounded-xl border border-line bg-ink-2 p-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
                {emailTahap === "email" ? "Masuk dengan email" : "Kode dari email"}
              </div>
              {emailTahap === "email" ? (
                <>
                  <input value={email} onChange={(e) => setEmail(e.target.value)}
                    type="email" inputMode="email" autoComplete="email" placeholder="email staf"
                    className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-sm text-cream placeholder:text-dim" />
                  <button
                    disabled={emailSibuk || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
                    onClick={async () => {
                      setEmailSibuk(true);
                      const alasan = await kirimKodeEmail(email.trim());
                      setEmailSibuk(false);
                      if (alasan) { setEmailPesan(alasan); return; }
                      setEmailPesan("Kode 6 angka dikirim ke email itu. Cek juga folder spam.");
                      setEmailTahap("kode");
                    }}
                    className="min-h-[44px] w-full rounded-lg bg-amber text-[13px] font-semibold text-ink disabled:opacity-40">
                    {emailSibuk ? "Mengirim…" : "Kirim kode"}
                  </button>
                </>
              ) : (
                <>
                  <input value={kodeEmail} onChange={(e) => setKodeEmail(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    inputMode="numeric" placeholder="6 angka"
                    className="min-h-[44px] w-full rounded-lg border border-line bg-ink px-3 text-center text-lg tracking-[0.3em] text-cream placeholder:text-sm placeholder:tracking-normal placeholder:text-dim" />
                  <button
                    disabled={emailSibuk || kodeEmail.length < 6}
                    onClick={async () => {
                      setEmailSibuk(true);
                      const hasil = await signInEmail(email.trim(), kodeEmail);
                      setEmailSibuk(false);
                      if (!hasil.ok) { setEmailPesan(hasil.alasan); return; }
                      // Pelaku di perangkat ini mengikuti akun staf yang emailnya dipakai.
                      // Akun DICARI DI STATE dulu: di sanalah ikatan venuenya
                      // tersimpan (akun staf hidup di jejak kejadian, seperti
                      // peran, tarif, dan menu). Jalur jatuhnya hanya untuk
                      // baris staf yang ada di server tapi tidak pernah dibuat
                      // lewat aplikasi — akun seperti itu tidak punya ikatan
                      // venue yang bisa dibaca, jadi diperlakukan sebagai
                      // pengurus kedua venue, sama seperti sebelum ada pagar ini.
                      const emp = a.employees.find((x) => x.id === hasil.staffId)
                        ?? { id: hasil.staffId, name: hasil.nama, pin: "", role: hasil.peran, active: true };
                      dispatchA({ t: "login", emp });
                      setEmailTahap(null); setKodeEmail(""); setEmailPesan(null);
                    }}
                    className="min-h-[44px] w-full rounded-lg bg-amber text-[13px] font-semibold text-ink disabled:opacity-40">
                    {emailSibuk ? "Memeriksa…" : "Masuk"}
                  </button>
                  <button onClick={() => { setEmailTahap("email"); setKodeEmail(""); }}
                    className="min-h-[36px] w-full text-[12px] text-dim">Ganti email / kirim ulang</button>
                </>
              )}
              {emailPesan && <p role="status" className="text-[12px] leading-snug text-amber">{emailPesan}</p>}
              <button onClick={() => { setEmailTahap(null); setEmailPesan(null); }}
                className="min-h-[36px] w-full text-[12px] text-dim">Tutup</button>
            </div>
          )}
        </div>

        {SHOW_DEMO_PINS && (
          <div className="mt-8 w-full max-w-[300px] rounded-xl border border-line bg-ink-2 p-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
              PIN demo (disembunyikan di versi produksi)
            </p>
            {a.employees.map((e) => (
              <div key={e.id} className="flex justify-between gap-2 py-0.5 text-[12px]">
                <span className="truncate text-mute">
                  {e.name}
                  {/* Venue akun ikut ditulis: inilah yang diuji pemilik saat
                      memastikan kasir Smokehouse tidak melihat meja biliar. */}
                  <span className="ml-1 text-dim">
                    {e.venue ? VENUE_LABEL[e.venue] : "2 venue"}
                  </span>
                </span>
                <span className={`shrink-0 ${e.role === "superadmin" ? "text-amber" : "text-cream"}`}>
                  {e.pin} · {ROLE_LABEL[e.role]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Sudah login, shift belum dibuka ─────────────────────────── */
  if (!a.shift) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6">
        <Ball n={8} size={48} />
        <h1 className="mt-4 font-display text-2xl uppercase tracking-wide text-cream">
          Buka Shift
        </h1>
        <p className="mt-1 max-w-[32ch] text-center text-sm text-dim">
          Hai {a.me.name}. Shift dimulai dengan laci <span className="text-cream">kosong</span> —
          semua tunai shift sebelumnya sudah disetor.
        </p>

        <div className="mt-6 w-full max-w-[300px]">
          {/*
            PRD §2.5 · SMH-12 — keputusan pemilik 12 Okt 2026: "shift mulai
            dari 0". Laci dikosongkan tiap pergantian shift, jadi modal awal
            SELALU Rp 0 dan tidak ada lagi yang perlu diketik.

            Kolom modalnya sengaja DIHILANGKAN, bukan diisi 0 otomatis: selama
            kolomnya masih ada, cepat atau lambat ada yang mengisinya "biar
            sama dengan kemarin", dan sejak itu kas shift tidak pernah cocok
            lagi tanpa ada yang tahu sebabnya.

            Angka modal pada shift LAMA tetap tersimpan apa adanya di jejak —
            pencocokan kas hari-hari sebelumnya tidak boleh berubah surut.
          */}
          {/* Angka "Rp 0" dibuang (permintaan pemilik 18 Okt 2026) — yang
              tersisa cuma kalimatnya, karena yang perlu diketahui kasir
              memang kalimatnya, bukan nolnya. */}
          <p className="rounded-xl border border-line bg-ink-2 px-4 py-3 text-center text-[12px] leading-relaxed text-dim">
            Laci dikosongkan setiap ganti shift. Yang dihitung saat tutup nanti adalah
            <span className="text-cream"> seluruh tunai yang masuk di shift ini</span>.
          </p>

          <button
            onClick={() => dispatchA({ t: "openShift", openingCash: 0, venue })}
            className="mt-4 min-h-[52px] w-full rounded-xl bg-amber font-semibold text-ink"
          >Mulai Shift</button>
          <button
            onClick={() => { signOut(); dispatchA({ t: "logout" }); }}
            className="mt-2 min-h-[44px] w-full text-sm text-dim"
          >Ganti karyawan</button>
        </div>
      </div>
    );
  }

  /* ── Panel utama ─────────────────────────────────────────────── */
  const tabs = TABS.filter((t) => bolehTab(t, role));
  // Menyembunyikan tab tidak cukup: halaman laporan uang juga bisa dibuka lewat alamat langsung.
  const current = TABS.find((t) => !t.end && (path === t.to || path.startsWith(`${t.to}/`)));
  const terlarang = !!current && !bolehTab(current, role);
  // Karyawan lain yang login saat shift orang lain masih buka: uangnya masuk laci shift itu.
  const shiftOrangLain = a.shift.employeeId !== a.me.id;
  // Data contoh dibuat relatif terhadap jam saat pertama dibuka; kalau hari
  // operasional sudah berganti, papan berisi tamu fiktif yang jamnya sudah lewat.
  const seedBasi = sync.genesis.seed && businessDateOf(sync.genesis.at) < businessDateOf(Date.now());

  return (
    <div className="min-h-screen bg-ink pb-20">
      <header className="safe-t sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl lg:max-w-6xl items-center gap-3 px-4 py-2.5">
          <span className="text-amber"><Mark size={26} /></span>
          <div className="min-w-0 flex-1 leading-none">
            <div className="truncate font-display text-sm uppercase tracking-[0.14em] text-cream">
              {a.me.name}
            </div>
            <div className="truncate text-[10px] uppercase tracking-wider text-dim">
              {role ? ROLE_LABEL[role] : "—"} · {VENUE_LABEL[venue]} · {shiftOrangLain ? `shift ${a.shift.employeeName}` : "shift jalan"}
            </div>
          </div>
          {r.voidMenunggu > 0 && role === "superadmin" && (
            <NavLink to="/admin/void"
              className="rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-bold text-red-300">
              {r.voidMenunggu} void
            </NavLink>
          )}
          {/* Pemilih venue. Setelan PERANGKAT, bukan data venue: komputer kasir
              biliar selalu SPL, komputer kasir resto selalu Smokehouse — kalau
              ikut jejak, satu orang berpindah akan menggeser layar semua orang.

              Akun yang TERIKAT satu venue tidak memilih: ditulis tetap. Yang
              menolak aksinya tetap mesin (`lintasVenue`) — ini cuma supaya
              tidak ada tombol yang menjanjikan sesuatu yang akan ditolak. */}
          {venueAkun ? (
            <div className="shrink-0 rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-1.5
                            text-[11px] font-semibold text-amber" title="Akun ini hanya mengurus satu venue">
              {VENUE_LABEL[venueAkun]}
            </div>
          ) : (
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-line">
              {(["spl", "smh"] as Venue[]).map((v) => (
                <button key={v} onClick={() => setVenueAktif(v)} aria-pressed={venue === v}
                  className={`min-h-[36px] px-2.5 text-[11px] font-semibold ${
                    venue === v ? "bg-amber text-ink" : "bg-ink-2 text-mute hover:text-cream"
                  }`}>
                  {VENUE_LABEL[v]}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => { signOut(); dispatchA({ t: "logout" }); }}
            className="min-h-[36px] rounded-lg border border-line px-3 text-xs text-mute hover:text-cream"
          >Kunci</button>
        </div>

        <div className="no-bar mx-auto flex max-w-3xl lg:max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) =>
                `relative shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  isActive ? "bg-amber text-ink" : "bg-ink-2 text-mute hover:text-cream"
                }`
              }>
              {t.label}
              {t.label === "Menu & Stok" && r.stokMenipis > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500/70 px-1.5 text-[10px] text-cream">
                  {r.stokMenipis}
                </span>
              )}
              {/* Biru, bukan merah: ini bukan masalah, ini pekerjaan yang
                  menunggu dikerjakan. */}
              {t.label === "Antar" && menungguAntar > 0 && (
                <span className="ml-1.5 rounded-full bg-blue-400/80 px-1.5 text-[10px] text-ink">
                  {menungguAntar}
                </span>
              )}
              {t.label === "Void" && r.voidMenunggu > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500/70 px-1.5 text-[10px] text-cream">
                  {r.voidMenunggu}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-3xl lg:max-w-6xl px-4 pt-4">
        {/* Tombolnya ada di spanduknya sendiri. Perangkat memang mencoba
            sendiri (mundur berlipat sampai 30 detik, dan seketika saat
            peramban melaporkan jaringan kembali), tapi di kasir yang sedang
            ditunggu tamu, setengah menit menatap spanduk merah terasa seperti
            aplikasi yang menyerah — dan yang pertama dilakukan orang adalah
            mencari tombol. */}
        {/* SESI HABIS ≠ JARINGAN PUTUS.

            Token venue berlaku 12 jam. Begitu habis, server menjawab
            "sesi tidak sah" untuk setiap kiriman — dan perangkat dulu
            melaporkannya sebagai "tidak tersambung ke server". Kasir menekan
            "coba sambungkan" berkali-kali, antreannya menumpuk, dan
            satu-satunya yang perlu dilakukan tidak pernah disebutkan.

            Spanduk ini mendahului spanduk jaringan karena penyebabnya memang
            lebih dalam: selama sesinya mati, tersambung pun tidak ada yang
            terkirim. */}
        {/* MODE DEMO — terlihat terus selagi menyala, di semua layar. Satu-satunya
            saklar yang melonggarkan aturan mesin: kalau tertinggal menyala di malam
            ramai, meja bisa dibuka pukul 04.00 tanpa ada yang menyadarinya. */}
        {a.jamBebas && (
          <p role="status"
            className="mb-3 rounded-xl border border-amber bg-amber/15 px-4 py-2 text-center text-[12px] font-semibold text-amber">
            Mode demo menyala — meja bisa dibuka kapan saja, di luar jam buka sekalipun.
            Jangan lupa dimatikan lagi di tab Atur.
          </p>
        )}
        {sync.mode === "server" && sync.sesiHabis ? (
          <div role="alert"
            className="mb-3 rounded-xl border border-amber/60 bg-amber/10 px-4 py-2.5 text-[12px] leading-snug text-amber">
            <span className="font-semibold">Waktu masuk Anda sudah habis.</span>{" "}
            Internetnya tidak apa-apa — Anda cuma perlu masuk lagi dengan PIN. Setiap 12 jam
            memang diminta ulang.
            {sync.pending > 0 && (
              <> <span className="font-semibold">{sync.pending} catatan belum terkirim</span> — semuanya
                aman dan langsung terkirim begitu Anda masuk.</>
            )}
            <button
              onClick={signOut}
              className="mt-2 block min-h-[40px] w-full rounded-lg bg-amber text-[13px] font-bold text-ink">
              Masuk lagi sekarang
            </button>
          </div>
        ) : sync.mode === "server" && !sync.online && (
          <div role="alert"
            className="mb-3 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-[12px] leading-snug text-red-300">
            <span className="font-semibold">Internet terputus.</span> Melayani tamu tetap bisa jalan —
            buka meja, catat pesanan, antar makanan. Yang ditahan dulu cuma yang menyangkut uang:
            tutup tab, bayar per orang, takeaway, tutup shift, setujui void, dan tandai refund.
            {sync.pending > 0 && (
              <> <span className="font-semibold">{sync.pending} catatan belum terkirim</span> — semuanya
                aman dan terkirim sendiri begitu internet kembali.</>
            )}
            <button
              onClick={() => { setMenyambung(true); void sambungkanLagi().finally(() => setMenyambung(false)); }}
              disabled={menyambung}
              className="mt-2 block min-h-[38px] w-full rounded-lg border border-red-400/60 bg-red-500/15
                text-[12px] font-bold text-cream disabled:opacity-50">
              {menyambung ? "Menyambungkan…" : "Coba sambungkan sekarang"}
            </button>
          </div>
        )}
        {sync.mode === "server" && sync.online && sync.pending > 0 && (
          <p className="mb-3 rounded-xl border border-amber/50 bg-amber/10 px-4 py-2.5 text-[12px] leading-snug text-amber">
            {sync.pending} aksi menunggu konfirmasi urutan dari server.
          </p>
        )}
        {/* Pesan terakhir dari server/mesin ditampilkan juga saat terputus:
            dulu hanya saat tersambung, padahal justru saat terputuslah
            pesannya paling perlu dibaca. */}
        {sync.mode === "server" && sync.problem && !sync.sesiHabis && (
          <p role="alert"
            className="mb-3 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-[12px] leading-snug text-red-300">
            {sync.problem}
          </p>
        )}
        {sync.storageError && (
          <p role="alert"
            className="mb-3 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-[12px] leading-snug text-red-300">
            <span className="font-semibold">Data tidak tersimpan di perangkat.</span> {sync.storageError}
          </p>
        )}
        {seedBasi && (
          <p className="mb-3 rounded-xl border border-amber/50 bg-amber/10 px-4 py-2.5 text-[12px] leading-snug text-amber">
            Data contoh dari {fmtDateLong(businessDateOf(sync.genesis.at))} masih dipakai —{" "}
            {role === "superadmin" ? (
              <NavLink to="/admin/atur" className="font-semibold underline underline-offset-4">
                reset di tab Atur.
              </NavLink>
            ) : (
              "minta superadmin reset."
            )}
          </p>
        )}
        {shiftOrangLain && (
          <p className="mb-3 rounded-xl border border-amber/50 bg-amber/10 px-4 py-2.5 text-[12px] leading-snug text-amber">
            Anda bekerja di shift <span className="font-semibold">{a.shift.employeeName}</span> — uang tunai yang Anda
            terima masuk laci shift itu. Untuk serah terima, tutup shift {a.shift.employeeName} di tab{" "}
            <NavLink to="/admin/shift" className="font-semibold underline underline-offset-4">Shift</NavLink>{" "}
            lalu buka shift Anda sendiri.
          </p>
        )}
        {terlarang ? (
          <div className="rounded-2xl border border-line bg-ink-2 px-4 py-10 text-center">
            <div className="font-display text-xl uppercase tracking-wide text-cream">Khusus superadmin</div>
            <p className="mx-auto mt-1 max-w-[34ch] text-sm text-dim">
              Halaman {current?.label} berisi laporan uang atau pengaturan venue. Minta superadmin membukanya.
            </p>
            <NavLink to="/admin" className="mt-4 inline-block text-sm font-semibold text-amber underline underline-offset-4">
              Kembali ke Papan
            </NavLink>
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}

function PinKey({
  children, onClick, small,
}: { children: React.ReactNode; onClick: () => void; small?: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.93 }} onClick={onClick}
      className={`flex min-h-[62px] items-center justify-center rounded-xl border border-line
        bg-ink-2 text-cream ${small ? "text-[11px] uppercase tracking-wider text-dim" : "font-display text-2xl"}`}
    >{children}</motion.button>
  );
}

/* Status meja: warna DAN ikon DAN teks — jangan hanya warna (PRD §9.3) */
export function statusStyle(status: string) {
  switch (status) {
    case "running":
      return { ring: "border-red-500/60 bg-red-500/12", dot: "bg-red-400", label: "Dipakai", icon: "●" };
    case "booked":
      return { ring: "border-amber/60 bg-amber/10", dot: "bg-amber", label: "Dibooking", icon: "◔" };
    case "hold":
      return { ring: "border-amber/40 border-dashed bg-amber/5", dot: "bg-amber/60", label: "Ditahan", icon: "◌" };
    case "maintenance":
      return { ring: "border-line-2 bg-ink-3", dot: "bg-dim", label: "Rusak", icon: "✕" };
    default:
      return { ring: "border-emerald-500/50 bg-emerald-500/8", dot: "bg-emerald-400", label: "Kosong", icon: "○" };
  }
}

/** Durasi berjalan sebuah open bill, dalam bentuk "1j 24m". */
export function Elapsed({ since }: { since: number }) {
  const m = Math.max(0, Math.floor((Date.now() - since) / 60000));
  const h = Math.floor(m / 60);
  return <span className="tabular-nums">{h > 0 ? `${h}j ${m % 60}m` : `${m}m`}</span>;
}

export function Countdown({ endsAt }: { endsAt: number }) {
  const left = endsAt - Date.now();
  const over = left <= 0;
  const m = Math.abs(Math.floor(left / 60000));
  const h = Math.floor(m / 60);
  const txt = h > 0 ? `${h}j ${m % 60}m` : `${m}m`;
  return (
    <span className={`tabular-nums ${over ? "text-red-400" : m <= 10 ? "text-amber" : "text-cream"}`}>
      {over ? `lewat ${txt}` : txt}
    </span>
  );
}

export const jam = (ts: number) =>
  new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
