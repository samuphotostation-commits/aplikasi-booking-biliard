import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card, PageHeader } from "../components/UI";
import { memberMungkin, memberSaya, type Member } from "../lib/member";
import { setVenueTamu, useVenueTamu } from "../lib/venueAktif";
import { PanelMasuk } from "./Akun";

/* ═══════════════════════════════════════════════════════════════════
   DAFTAR MEMBER

   Tujuan QR di venue: /sport/daftar dan /smokehouse/daftar. Alamatnya dipisah
   supaya tamu di Smokehouse tidak diajak booking biliar sesudah mendaftar.
   Mendaftar dan masuk adalah tombol yang sama, jadi member lama yang tersesat
   ke sini tetap selesai dengan benar.
   ═══════════════════════════════════════════════════════════════════ */

const MANFAAT = [
  "Booking berikutnya tinggal pilih meja, nama dan nomormu terisi sendiri.",
  "Riwayat booking dan pesanan tersimpan di akunmu.",
  "Info promo dan turnamen lebih dulu. Bisa dimatikan kapan saja.",
];

export default function Daftar() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const dariAlamat = pathname.startsWith("/smokehouse") ? "smh" : pathname.startsWith("/sport") ? "spl" : null;
  useEffect(() => { if (dariAlamat) setVenueTamu(dariAlamat); }, [dariAlamat]);
  const venue = useVenueTamu();
  const smh = (dariAlamat ?? venue) === "smh";

  const [member, setMember] = useState<Member | null>(null);
  const [siap, setSiap] = useState(false);
  useEffect(() => {
    let batal = false;
    void memberSaya().then((m) => { if (!batal) { setMember(m); setSiap(true); } });
    return () => { batal = true; };
  }, []);

  return (
    <div className="pb-28">
      <PageHeader kicker="Member SPL" title="Daftar member"
        sub={smh ? "Smokehouse Resto" : "SPL Sports Pool Lounge"} />
      <div className="mx-auto max-w-lg space-y-4 px-5 py-5">
        {!memberMungkin() ? (
          <Card className="p-4 text-[13px] leading-relaxed text-mute">
            Pendaftaran member hanya tersedia di situs resmi SPL.
          </Card>
        ) : !siap ? (
          <Card className="p-4 text-[13px] text-dim">Memuat…</Card>
        ) : member ? (
          <Card className="space-y-3 p-5 text-center">
            <p className="font-serif text-xl text-cream">Kamu sudah jadi member, {member.nama}.</p>
            <p className="text-[12.5px] leading-relaxed text-mute">
              Akunmu tersambung ke {member.email}.
            </p>
            <Button full onClick={() => nav(smh ? "/smokehouse/reservasi" : "/booking")}>
              {smh ? "Reservasi meja" : "Booking meja"}
            </Button>
            <Button full variant="ghost" onClick={() => nav("/akun")}>Lihat akun saya</Button>
          </Card>
        ) : (
          <>
            <ul className="space-y-2 text-[13px] leading-relaxed text-mute">
              {MANFAAT.map((m) => (
                <li key={m} className="flex gap-2.5">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                  {m}
                </li>
              ))}
            </ul>
            <PanelMasuk ringkas labelGoogle="Daftar dengan Google" onMasuk={setMember} />
            <p className="text-center text-[11.5px] leading-snug text-dim">
              Dua langkah saja: pilih akun Google, lalu isi nomor HP aktif. Sudah pernah daftar?
              Tombolnya sama, kamu langsung masuk.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
