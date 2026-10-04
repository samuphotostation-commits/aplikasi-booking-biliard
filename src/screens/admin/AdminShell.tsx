import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Mark } from "../../components/UI";
import { Ball } from "../../components/motion/Billiard";
import { useAdmin, recap, businessDateOf } from "../../lib/adminStore";
import { fmtDateLong, rupiah } from "../../lib/core";

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

const TABS = [
  { to: "/admin", label: "Papan", end: true, superOnly: false },
  { to: "/admin/kasir", label: "Kasir", superOnly: false },
  { to: "/admin/dapur", label: "Dapur", superOnly: false },
  { to: "/admin/menu", label: "Menu & Stok", superOnly: false },
  { to: "/admin/void", label: "Void", superOnly: false },
  { to: "/admin/shift", label: "Shift", superOnly: false },
  // Absen dipakai SEMUA karyawan — identitasnya dari PIN masing-masing.
  { to: "/admin/absen", label: "Absen", superOnly: false },
  { to: "/admin/promo", label: "Promo", superOnly: true },
  { to: "/admin/pelanggan", label: "Pelanggan", superOnly: true },
  // Karyawan boleh mengirim pemberitahuan booking; blast promo di dalamnya
  // tetap dikunci untuk superadmin.
  { to: "/admin/pesan", label: "Pesan", superOnly: false },
  { to: "/admin/rekap", label: "Rekap", superOnly: true },
  { to: "/admin/atur", label: "Atur", superOnly: true },
];

export default function AdminShell() {
  const { a, dispatchA, role, sync, tick, signIn, signOut, kirimKodeEmail, signInEmail } = useAdmin();
  const nav = useNavigate();
  const path = useLocation().pathname;
  const [pin, setPin] = useState("");
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [modal, setModal] = useState("");
  const [lock, setLock] = useState<PinLock>(readLock);
  const [, rerender] = useState(0);
  /** Masuk dengan email: null = tertutup, "email" = isi alamat, "kode" = isi kode. */
  const [emailTahap, setEmailTahap] = useState<null | "email" | "kode">(null);
  const [email, setEmail] = useState("");
  const [kodeEmail, setKodeEmail] = useState("");
  const [emailPesan, setEmailPesan] = useState<string | null>(null);
  const [emailSibuk, setEmailSibuk] = useState(false);

  const r = recap(a);
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
        <p className="mt-1 text-sm text-dim">Masukkan PIN karyawan</p>

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

        {/* ── Masuk dengan email (untuk pemilik/manajer) ────────── */}
        <div className="mt-6 w-full max-w-[300px]">
          {emailTahap === null ? (
            <button onClick={() => { setEmailTahap("email"); setEmailPesan(null); }}
              className="min-h-[44px] w-full text-[13px] text-mute underline underline-offset-4">
              Masuk dengan email
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
                className="min-h-[36px] w-full text-[12px] text-dim">Kembali ke PIN</button>
            </div>
          )}
        </div>

        {SHOW_DEMO_PINS && (
          <div className="mt-8 w-full max-w-[300px] rounded-xl border border-line bg-ink-2 p-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
              PIN demo (disembunyikan di versi produksi)
            </p>
            {a.employees.map((e) => (
              <div key={e.id} className="flex justify-between py-0.5 text-[12px]">
                <span className="text-mute">{e.name}</span>
                <span className={e.role === "superadmin" ? "text-amber" : "text-cream"}>
                  {e.pin} · {e.role === "superadmin" ? "superadmin" : "karyawan"}
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
        <p className="mt-1 max-w-[30ch] text-center text-sm text-dim">
          Hai {a.me.name}. Hitung uang di laci dulu — angka ini yang dipakai
          mencocokkan kas saat tutup shift.
        </p>

        <div className="mt-6 w-full max-w-[300px]">
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-dim">
            Modal awal laci
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-4 py-3">
            <span className="text-dim">Rp</span>
            <input
              type="number" inputMode="numeric" min={0} step={50000}
              value={modal} onChange={(e) => setModal(e.target.value)}
              placeholder="0" autoFocus
              className="w-full bg-transparent text-right font-serif text-xl tabular-nums
                text-cream focus:outline-none"
            />
          </div>
          <div className="mt-2 flex gap-2">
            {[200000, 500000, 1000000].map((v) => (
              <button key={v} onClick={() => setModal(String(v))}
                className="flex-1 rounded-lg border border-line bg-ink-2 py-2 text-[12px] text-mute">
                {rupiah(v)}
              </button>
            ))}
          </div>

          {/* Wajib diisi (boleh 0): tombol ini berada tepat di bawah keypad PIN, jadi
              ketukan ganda saat login tidak boleh membuka shift dengan modal kosong. */}
          <button
            disabled={modal.trim() === ""}
            onClick={() => dispatchA({ t: "openShift", openingCash: Number(modal) || 0 })}
            className="mt-4 min-h-[52px] w-full rounded-xl bg-amber font-semibold text-ink disabled:opacity-35"
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
  const tabs = TABS.filter((t) => !t.superOnly || role === "superadmin");
  // Menyembunyikan tab tidak cukup: halaman laporan uang juga bisa dibuka lewat alamat langsung.
  const current = TABS.find((t) => !t.end && (path === t.to || path.startsWith(`${t.to}/`)));
  const terlarang = !!current?.superOnly && role !== "superadmin";
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
              {role === "superadmin" ? "Superadmin" : "Karyawan"} · {shiftOrangLain ? `shift ${a.shift.employeeName}` : "shift jalan"}
            </div>
          </div>
          {r.voidMenunggu > 0 && role === "superadmin" && (
            <NavLink to="/admin/void"
              className="rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-bold text-red-300">
              {r.voidMenunggu} void
            </NavLink>
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
        {sync.mode === "server" && !sync.online && (
          <p role="alert"
            className="mb-3 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-[12px] leading-snug text-red-300">
            <span className="font-semibold">Tidak tersambung ke server.</span> Papan tetap bisa dibaca dan dilayani —
            aksi uang (tutup tab, tutup shift, setujui void, tandai refund) ditahan sampai koneksi kembali.
            {sync.pending > 0 && ` ${sync.pending} aksi menunggu dikirim.`}
          </p>
        )}
        {sync.mode === "server" && sync.online && sync.pending > 0 && (
          <p className="mb-3 rounded-xl border border-amber/50 bg-amber/10 px-4 py-2.5 text-[12px] leading-snug text-amber">
            {sync.pending} aksi menunggu konfirmasi urutan dari server.
          </p>
        )}
        {sync.mode === "server" && sync.online && sync.problem && (
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
