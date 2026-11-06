import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, PageHeader } from "../components/UI";
import {
  adaSesiGoogle, keluarMember, masukDenganGoogle, memberMungkin, memberSaya, selesaikanGoogle, ubahMember,
  type Member,
} from "../lib/member";
import { rapikanHp } from "../lib/profilTamu";
import { AWALAN_LUAR, KECAMATAN_PADANG, dariIso, domisiliLengkap, keIso, rapikanTanggal } from "../lib/dataMember";

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
  const [lahir, setLahir] = useState(dariIso(member.lahir));
  const [domisili, setDomisili] = useState(member.domisili);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const lahirIso = keIso(lahir);
  const berubah = nama !== member.nama || setuju !== member.setuju
    || lahirIso !== (member.lahir || null) || domisili !== member.domisili;
  // Member lama boleh menyimpan yang lain walau dua isian ini masih kosong.
  const sah = (lahir === "" || lahirIso !== null) && (domisili === "" || domisiliLengkap(domisili));

  async function simpan() {
    setSibuk(true);
    const r = await ubahMember({ nama, setuju, lahir: lahirIso ?? undefined, domisili });
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
        <IsianLahir value={lahir} onChange={setLahir} />
        <PilihDomisili value={domisili} onChange={setDomisili} />
        <label className="flex items-start gap-2.5 text-[12px] leading-snug text-mute">
          <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-amber" />
          <span>Boleh dikirimi info promo &amp; turnamen SPL lewat WhatsApp/email. Bisa dimatikan kapan saja.</span>
        </label>
        <Button full disabled={!berubah || !sah || sibuk} busy={sibuk} onClick={() => void simpan()}>Simpan perubahan</Button>
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
  const [lahir, setLahir] = useState("");
  const [domisili, setDomisili] = useState("");
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
    const r = await selesaikanGoogle({ hp: hpGoogle, lahir: keIso(lahir) ?? "", domisili });
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
          Tinggal tiga isian, tidak sampai semenit. Kasir memakai nomor HP kalau ada perubahan meja
          atau saat pesanan siap, dan sisanya membantu SPL menyesuaikan promo untukmu.
        </p>
        <Isian label="Nomor HP" value={hpGoogle} onChange={setHpGoogle} placeholder="08xxxxxxxxxx" type="tel"
          ok={hpGoogle === "" ? undefined : /^62[1-9][0-9]{7,13}$/.test(rapikanHp(hpGoogle))} />
        <IsianLahir value={lahir} onChange={setLahir} />
        <PilihDomisili value={domisili} onChange={setDomisili} />
        {alasan && (
          <p className="rounded-xl border border-amber/50 bg-amber/10 px-3 py-2 text-[12px] leading-snug text-amber">{alasan}</p>
        )}
        <Button full busy={sibuk}
          disabled={!/^62[1-9][0-9]{7,13}$/.test(rapikanHp(hpGoogle)) || !keIso(lahir) || !domisiliLengkap(domisili)}
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

/* Tanggal cukup diketik di papan angka: 17081995 jadi 17/08/1995.
   Pemilih tanggal bawaan HP memaksa orang menggulir puluhan tahun ke belakang. */
function IsianLahir({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-dim">Tanggal lahir</span>
      <input
        value={value} inputMode="numeric" placeholder="HH/BB/TTTT" autoComplete="bday"
        onChange={(e) => onChange(rapikanTanggal(e.target.value))}
        className={`w-full rounded-xl border bg-ink px-4 py-3 tabular-nums text-cream placeholder:text-dim focus:outline-none
          ${value.length === 10 && !keIso(value) ? "border-amber" : "border-line focus:border-amber"}`}
      />
      {value.length === 10 && !keIso(value) && (
        <span className="mt-1 block text-[11px] text-amber">Tanggal ini tidak ada. Contoh: 17/08/1995</span>
      )}
    </label>
  );
}

/* Pilihan, bukan ketikan: sekali ketuk, dan datanya bisa dihitung per kecamatan. */
function PilihDomisili({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const luar = value.startsWith(AWALAN_LUAR);
  const kota = luar ? value.slice(AWALAN_LUAR.length + 3) : "";
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-dim">Domisili</span>
        <select
          value={luar ? AWALAN_LUAR : value}
          onChange={(e) => onChange(e.target.value === AWALAN_LUAR ? `${AWALAN_LUAR} · ` : e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-line bg-ink px-3 text-cream focus:border-amber focus:outline-none"
        >
          <option value="" disabled>Pilih kecamatan</option>
          {KECAMATAN_PADANG.map((k) => <option key={k} value={k}>{k}</option>)}
          <option value={AWALAN_LUAR}>Luar Kota Padang</option>
        </select>
      </label>
      {luar && (
        <Isian label="Kota" value={kota} onChange={(v) => onChange(`${AWALAN_LUAR} · ${v}`)} placeholder="Misal: Bukittinggi" />
      )}
    </div>
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
