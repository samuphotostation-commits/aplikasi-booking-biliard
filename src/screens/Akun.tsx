import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, PageHeader } from "../components/UI";
import {
  adaSesiGoogle, daftarMember, gantiPinMember, keluarMember, masukDenganGoogle, masukMember,
  memberMungkin, memberSaya, selesaikanGoogle, ubahMember,
  type Member,
} from "../lib/member";
import { bacaProfil, rapikanHp } from "../lib/profilTamu";

/* ═══════════════════════════════════════════════════════════════════
   AKUN MEMBER SPL

   Permintaan pemilik: sebelum booking diproses tamu harus daftar/masuk,
   supaya data membernya menjadi milik venue (untuk blast promo nanti).

   Identitasnya nomor HP + PIN 6 angka — tanpa email, tanpa SMS, supaya
   tamu yang sudah berdiri di depan meja tidak perlu menunggu kode apa pun.
   Lupa PIN diselesaikan kasir lewat tombol "Reset PIN" di panel Pelanggan.
   ═══════════════════════════════════════════════════════════════════ */

export default function Akun() {
  const [member, setMember] = useState<Member | null>(null);
  const [siap, setSiap] = useState(false);

  useEffect(() => {
    let batal = false;
    void memberSaya().then((m) => { if (!batal) { setMember(m); setSiap(true); } });
    return () => { batal = true; };
  }, []);

  return (
    <div className="pb-28">
      <PageHeader kicker="Member" title="Akun SPL"
        sub={member ? `Halo, ${member.nama}` : "Daftar sekali, booking berikutnya tinggal pilih meja"} />
      <div className="mx-auto max-w-lg space-y-4 px-5 py-5">
        {!memberMungkin() ? (
          <Card className="p-4 text-[13px] leading-relaxed text-mute">
            Akun member hanya tersedia di aplikasi yang tersambung ke server SPL.
            Di mode uji coba ini, booking cukup mengisi nama dan nomor HP.
          </Card>
        ) : !siap ? (
          <Card className="p-4 text-[13px] text-dim">Memuat akun…</Card>
        ) : member ? (
          <ProfilMember member={member} onChange={setMember} onKeluar={() => setMember(null)} />
        ) : (
          <PanelMasuk onMasuk={setMember} />
        )}
      </div>
    </div>
  );
}

/* ── Sudah masuk: ubah data & PIN ──────────────────────────────── */
function ProfilMember({ member, onChange, onKeluar }: {
  member: Member; onChange: (m: Member) => void; onKeluar: () => void;
}) {
  const [nama, setNama] = useState(member.nama);
  const [email, setEmail] = useState(member.email);
  const [setuju, setSetuju] = useState(member.setuju);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pinLama, setPinLama] = useState("");
  const [pinBaru, setPinBaru] = useState("");
  const [pinPesan, setPinPesan] = useState<string | null>(null);

  const berubah = nama !== member.nama || email !== member.email || setuju !== member.setuju;

  async function simpan() {
    setSibuk(true);
    const r = await ubahMember({ nama, email, setuju });
    setSibuk(false);
    if (r.ok) { onChange(r.member); setPesan("Tersimpan."); }
    else setPesan(r.alasan);
    setTimeout(() => setPesan(null), 4000);
  }

  async function gantiPin() {
    setPinPesan(null);
    const r = await gantiPinMember(pinLama, pinBaru);
    setPinPesan(r.ok ? "PIN diganti." : (r.alasan ?? "PIN gagal diganti"));
    if (r.ok) { setPinLama(""); setPinBaru(""); }
    setTimeout(() => setPinPesan(null), 5000);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-dim">Nomor member</div>
        <div className="font-serif text-xl text-cream tabular-nums">{member.hp}</div>
        <p className="mt-1 text-[11px] text-dim">
          Nomor ini yang dipakai saat booking — tidak bisa diubah sendiri. Kalau nomornya ganti, bilang ke kasir.
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <Isian label="Nama" value={nama} onChange={setNama} placeholder="Nama lengkap" />
        <Isian label="Email (opsional)" value={email} onChange={setEmail} placeholder="nama@email.com" type="email" />
        <label className="flex items-start gap-2.5 text-[12px] leading-snug text-mute">
          <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-amber" />
          <span>Boleh dikirimi info promo &amp; turnamen SPL lewat WhatsApp/email. Bisa dimatikan kapan saja.</span>
        </label>
        <Button full disabled={!berubah || sibuk} busy={sibuk} onClick={() => void simpan()}>Simpan perubahan</Button>
        {pesan && <p className="text-center text-[12px] text-amber">{pesan}</p>}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Ganti PIN</div>
        <Isian label="PIN lama" value={pinLama} onChange={setPinLama} placeholder="6 angka" type="pin" />
        <Isian label="PIN baru" value={pinBaru} onChange={setPinBaru} placeholder="6 angka" type="pin" />
        <Button full disabled={pinLama.length !== 6 || pinBaru.length !== 6} onClick={() => void gantiPin()}>
          Ganti PIN
        </Button>
        {pinPesan && <p className="text-center text-[12px] text-amber">{pinPesan}</p>}
        <p className="text-[11px] leading-snug text-dim">
          Lupa PIN? Minta kasir SPL me-reset — PIN sementara dibacakan langsung ke kamu.
        </p>
      </Card>

      <button
        onClick={() => void keluarMember().then(onKeluar)}
        className="min-h-[44px] w-full rounded-xl border border-line text-[13px] font-semibold text-mute hover:border-amber hover:text-amber"
      >Keluar dari akun</button>
    </div>
  );
}

/* ── Belum masuk: daftar atau masuk ────────────────────────────── */
export function PanelMasuk({ onMasuk, ringkas }: { onMasuk: (m: Member) => void; ringkas?: boolean }) {
  const profil = bacaProfil();
  const [tab, setTab] = useState<"masuk" | "daftar">("masuk");
  // Kembali dari Google: tukar sesinya jadi akun member. Kalau nomor HP belum
  // ada (Google memang tidak memberikannya), tanyakan sekali di sini.
  const [google, setGoogle] = useState<{ nama: string; email: string } | null>(null);
  const [hpGoogle, setHpGoogle] = useState("");
  const [cekGoogle, setCekGoogle] = useState(false);
  useEffect(() => {
    let batal = false;
    void (async () => {
      if (!(await adaSesiGoogle()) || batal) return;
      setCekGoogle(true);
      const r = await selesaikanGoogle();
      if (batal) return;
      setCekGoogle(false);
      if (r.ok) onMasuk(r.member);
      else if ("perluHp" in r) setGoogle({ nama: r.nama, email: r.email });
      else setAlasan(r.alasan);
    })();
    return () => { batal = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [hp, setHp] = useState(profil.hp);
  const [nama, setNama] = useState(profil.nama);
  const [email, setEmail] = useState(profil.email);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [setuju, setSetuju] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [alasan, setAlasan] = useState<string | null>(null);

  const hpOk = /^62[1-9][0-9]{7,13}$/.test(rapikanHp(hp));
  const siapMasuk = hpOk && pin.length === 6;
  const siapDaftar = hpOk && pin.length === 6 && pin === pin2 && nama.trim().length >= 2;

  async function jalan() {
    setAlasan(null);
    setSibuk(true);
    const r = tab === "masuk"
      ? await masukMember(hp, pin)
      : await daftarMember({ hp, nama: nama.trim(), pin, email: email.trim(), setuju });
    setSibuk(false);
    if (r.ok) onMasuk(r.member);
    else setAlasan(r.alasan);
  }

  // Sesudah Google: tinggal satu isian nomor HP.
  async function lanjutGoogle() {
    setAlasan(null);
    setSibuk(true);
    const r = await selesaikanGoogle(hpGoogle);
    setSibuk(false);
    if (r.ok) onMasuk(r.member);
    else if (!("perluHp" in r)) setAlasan(r.alasan);
  }

  if (google) {
    return (
      <Card className="space-y-3 p-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-dim">Masuk sebagai</div>
          <div className="text-[15px] font-semibold text-cream">{google.nama}</div>
          <div className="text-[12px] text-mute">{google.email}</div>
        </div>
        <p className="text-[12px] leading-relaxed text-mute">
          Tinggal satu langkah: nomor HP kamu. Kasir memakainya kalau ada perubahan meja
          atau saat pesanan siap — Google tidak memberikan nomor.
        </p>
        <Isian label="Nomor HP" value={hpGoogle} onChange={setHpGoogle} placeholder="08xxxxxxxxxx" type="tel"
          ok={hpGoogle === "" ? undefined : /^62[1-9][0-9]{7,13}$/.test(rapikanHp(hpGoogle))} />
        {alasan && (
          <p className="rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">{alasan}</p>
        )}
        <Button full busy={sibuk} disabled={!/^62[1-9][0-9]{7,13}$/.test(rapikanHp(hpGoogle))}
          onClick={() => void lanjutGoogle()}>Selesaikan pendaftaran</Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      {!ringkas && (
        <p className="text-[12px] leading-relaxed text-mute">
          Booking meja diproses atas nama member SPL. Sekali daftar, nomor dan namamu tersimpan —
          dan kamu ikut dapat info promo lebih dulu.
        </p>
      )}

      <button
        onClick={() => void masukDenganGoogle()}
        disabled={cekGoogle}
        className="flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl border border-line
          bg-cream px-4 text-[14px] font-bold text-ink hover:bg-white disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2 5.1-4.4 6.700v5.6h7.1c4.2-3.9 6.6-9.6 6.6-16.3z" />
          <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.6c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.8C7.9 41.1 15.4 46 24 46z" />
          <path fill="#FBBC05" d="M11.6 28c-.5-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.8H4.3C2.8 17 2 20.4 2 23.9s.8 6.9 2.3 9.9l7.3-5.8z" />
          <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.3 30 2 24 2 15.4 2 7.9 6.9 4.3 14.1l7.3 5.8c1.8-5.2 6.6-9.1 12.4-9.1z" />
        </svg>
        {cekGoogle ? "Memeriksa akun Google…" : "Lanjut dengan Google"}
      </button>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-dim">
        <span className="h-px flex-1 bg-line" />atau nomor HP<span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([["masuk", "Masuk"], ["daftar", "Daftar baru"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setAlasan(null); }} aria-pressed={tab === k}
            className={`min-h-[40px] rounded-xl border text-[13px] font-semibold ${
              tab === k ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-mute"
            }`}>{label}</button>
        ))}
      </div>

      <Isian label="Nomor HP" value={hp} onChange={setHp} placeholder="08xxxxxxxxxx" type="tel"
        ok={hp === "" ? undefined : hpOk} />
      {tab === "daftar" && (
        <>
          <Isian label="Nama" value={nama} onChange={setNama} placeholder="Nama lengkap" />
          <Isian label="Email (opsional)" value={email} onChange={setEmail} placeholder="nama@email.com" type="email" />
        </>
      )}
      <Isian label={tab === "daftar" ? "Buat PIN (6 angka)" : "PIN"} value={pin} onChange={setPin}
        placeholder="••••••" type="pin" />
      {tab === "daftar" && (
        <>
          <Isian label="Ulangi PIN" value={pin2} onChange={setPin2} placeholder="••••••" type="pin"
            ok={pin2 === "" ? undefined : pin2 === pin} />
          <label className="flex items-start gap-2.5 text-[12px] leading-snug text-mute">
            <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber" />
            <span>Boleh dikirimi info promo &amp; turnamen SPL. Bisa dimatikan kapan saja di halaman Akun.</span>
          </label>
        </>
      )}

      {alasan && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">
          {alasan}
        </motion.p>
      )}

      <Button full disabled={tab === "masuk" ? !siapMasuk : !siapDaftar} busy={sibuk} onClick={() => void jalan()}>
        {tab === "masuk" ? "Masuk" : "Daftar & lanjut"}
      </Button>
      <p className="text-[11px] leading-snug text-dim">
        PIN hanya untuk akun SPL — jangan pakai PIN ATM. Lupa PIN? Minta kasir me-reset saat kamu datang.
      </p>
    </Card>
  );
}

/* ── Satu baris isian ──────────────────────────────────────────── */
function Isian({ label, value, onChange, placeholder, type = "text", ok }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; ok?: boolean;
}) {
  const pin = type === "pin";
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-dim">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        type={pin ? "password" : type}
        inputMode={pin ? "numeric" : type === "tel" ? "tel" : undefined}
        autoComplete={pin ? "off" : undefined}
        maxLength={pin ? 6 : undefined}
        onChange={(e) => onChange(pin ? e.target.value.replace(/[^0-9]/g, "").slice(0, 6) : e.target.value)}
        className={`w-full rounded-xl border bg-ink px-4 py-3 text-cream placeholder:text-dim
          focus:outline-none ${ok === false ? "border-amber" : "border-line focus:border-amber"}`}
      />
    </label>
  );
}
