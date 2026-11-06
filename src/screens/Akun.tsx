import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, PageHeader } from "../components/UI";
import {
  adaSesiGoogle, keluarMember, masukDenganGoogle, memberMungkin, memberSaya, selesaikanGoogle, ubahMember,
  type Member,
} from "../lib/member";
import { rapikanHp } from "../lib/profilTamu";

/* ═══════════════════════════════════════════════════════════════════
   AKUN MEMBER SPL

   Permintaan pemilik: sebelum booking diproses tamu harus daftar/masuk,
   supaya data membernya menjadi milik venue (untuk blast promo nanti).

   Identitasnya akun Google (emailnya pasti asli) + nomor HP yang wajib diisi.
   Tidak ada kata sandi atau PIN yang perlu diingat tamu.
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
        sub={member ? `Halo, ${member.nama}` : "Masuk dengan Google, booking berikutnya tinggal pilih meja"} />
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

/* ── Sudah masuk: ubah data ──────────────────────────────── */
function ProfilMember({ member, onChange, onKeluar }: {
  member: Member; onChange: (m: Member) => void; onKeluar: () => void;
}) {
  const [nama, setNama] = useState(member.nama);
  const [setuju, setSetuju] = useState(member.setuju);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const berubah = nama !== member.nama || setuju !== member.setuju;

  async function simpan() {
    setSibuk(true);
    const r = await ubahMember({ nama, setuju });
    setSibuk(false);
    if (r.ok) { onChange(r.member); setPesan("Tersimpan."); }
    else setPesan(r.alasan);
    setTimeout(() => setPesan(null), 4000);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-dim">Nomor member</div>
        <div className="font-serif text-xl text-cream tabular-nums">{member.hp}</div>
        <p className="mt-1 text-[11px] text-dim">
          Nomor ini yang dipakai saat booking — tidak bisa diubah sendiri. Kalau nomornya ganti, bilang ke kasir.
        </p>
        <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-dim">Akun Google</div>
        <div className="text-[14px] text-cream">{member.email}</div>
      </Card>

      <Card className="space-y-3 p-4">
        <Isian label="Nama" value={nama} onChange={setNama} placeholder="Nama lengkap" />
        <label className="flex items-start gap-2.5 text-[12px] leading-snug text-mute">
          <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-amber" />
          <span>Boleh dikirimi info promo &amp; turnamen SPL lewat WhatsApp/email. Bisa dimatikan kapan saja.</span>
        </label>
        <Button full disabled={!berubah || sibuk} busy={sibuk} onClick={() => void simpan()}>Simpan perubahan</Button>
        {pesan && <p className="text-center text-[12px] text-amber">{pesan}</p>}
      </Card>

      <button
        onClick={() => void keluarMember().then(onKeluar)}
        className="min-h-[44px] w-full rounded-xl border border-line text-[13px] font-semibold text-mute hover:border-amber hover:text-amber"
      >Keluar dari akun</button>
    </div>
  );
}

/* ── Belum masuk: Google lalu nomor HP ────────────────────────────── */
export function PanelMasuk({ onMasuk, ringkas, labelGoogle = "Lanjut dengan Google" }: {
  onMasuk: (m: Member) => void; ringkas?: boolean; labelGoogle?: string;
}) {
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
  const [sibuk, setSibuk] = useState(false);
  const [alasan, setAlasan] = useState<string | null>(null);

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
          Booking meja diproses atas nama member SPL. Masuk dengan akun Google kamu, lalu isi
          nomor HP sekali — dan kamu ikut dapat info promo lebih dulu.
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
        {cekGoogle ? "Memeriksa akun Google…" : labelGoogle}
      </button>
      {alasan && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">
          {alasan}
        </motion.p>
      )}
      <p className="text-[11px] leading-snug text-dim">
        Kami hanya memakai nama dan email akun Google kamu. Kata sandimu tidak pernah kami lihat.
      </p>
    </Card>
  );
}

/* ── Satu baris isian ──────────────────────────────────────────── */
function Isian({ label, value, onChange, placeholder, type = "text", ok }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; ok?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-dim">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border bg-ink px-4 py-3 text-cream placeholder:text-dim
          focus:outline-none ${ok === false ? "border-amber" : "border-line focus:border-amber"}`}
      />
    </label>
  );
}
