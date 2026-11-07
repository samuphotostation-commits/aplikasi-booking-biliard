/**
 * TAMBAH BANYAK AKUN SEKALIGUS.
 *
 * Pemilik biasanya menerima daftar karyawan dalam bentuk pesan WhatsApp:
 * "Sherly = Kasir", "Wahyu = Waiter". Daftar itu bisa ditempel apa adanya.
 * Tiap orang mendapat PIN acak 4 angka yang hanya tampil sekali di layar ini,
 * untuk dicatat atau dicetak lalu dibagikan. PIN tidak tersimpan di jejak.
 */
import { useState } from "react";
import { ROLES, ROLE_LABEL, type Employee, type Role } from "../../data/staff";
import { VENUE_LABEL, type Venue } from "../../data/venue";
import { cetakStruk } from "../../lib/cetak";

/** Tebakan peran dari tulisan di daftar. Pemilik tetap bisa mengubahnya sebelum dibuat. */
export function tebakPeran(teks: string): Role {
  const t = teks.toLowerCase();
  if (/waiter|pelayan|runner/.test(t)) return "waiter";
  if (/leader|supervisor|spv|manager|manajer/.test(t)) return "manager";
  if (/dapur|kitchen|cook|koki/.test(t)) return "kru_kitchen";
  if (/barista|\bbar\b/.test(t)) return "kru_bar";
  if (/gudang/.test(t)) return "kru_gudang";
  if (/finance|keuangan/.test(t)) return "finance";
  return "kru_kasir";
}

/** Baris "Nama = Peran" atau nama saja. Baris kosong dan judul satu kata tempat dilewati. */
export function bacaDaftar(teks: string): { nama: string; peran: Role }[] {
  const hasil: { nama: string; peran: Role }[] = [];
  for (const mentah of teks.split(/\r?\n/)) {
    const baris = mentah.replace(/^[\s\-•*\d.)]+/, "").trim();
    if (!baris) continue;
    const [nama, peran = ""] = baris.split(/\s*[=:–-]\s*/);
    const bersih = nama.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!bersih || /^(spl|smokehouse|smh|semua kasir)$/i.test(bersih)) continue;
    hasil.push({ nama: bersih, peran: tebakPeran(peran) });
  }
  return hasil;
}

/** PIN 4 angka yang tidak gampang ditebak: tanpa angka kembar semua dan tanpa urutan. */
export function pinAcak(sudah: Set<string>): string {
  const lemah = (p: string) => /^(\d)\1{3}$/.test(p) || "0123456789".includes(p) || "9876543210".includes(p);
  for (;;) {
    const n = crypto.getRandomValues(new Uint16Array(1))[0] % 10000;
    const p = String(n).padStart(4, "0");
    if (!lemah(p) && !sudah.has(p)) { sudah.add(p); return p; }
  }
}

export function TambahBanyakAkun({ venueAwal, simpan, nipDari, onTutup }: {
  venueAwal: Venue;
  /** Menyimpan satu akun. Mengembalikan id akun baru, atau false kalau ditolak. */
  simpan: (emp: Employee, pin: string) => string | false;
  /** NIP sebuah akun menurut server atau jejak. */
  nipDari: (id: string) => string | undefined;
  onTutup: () => void;
}) {
  const [teks, setTeks] = useState("");
  const [venue, setVenue] = useState<Venue>(venueAwal);
  const [baris, setBaris] = useState<{ nama: string; peran: Role }[] | null>(null);
  const [jadi, setJadi] = useState<{ id: string; nama: string; peran: Role; pin: string }[]>([]);
  const [gagal, setGagal] = useState<string[]>([]);

  function buat() {
    if (!baris) return;
    const sudah = new Set<string>();
    const ok: typeof jadi = [];
    const tolak: string[] = [];
    for (const b of baris) {
      const pin = pinAcak(sudah);
      const id = simpan({ id: "", name: b.nama, pin, role: b.peran, active: true, venue }, pin);
      if (id) ok.push({ id, nama: b.nama, peran: b.peran, pin }); else tolak.push(b.nama);
    }
    setJadi(ok);
    setGagal(tolak);
    setBaris(null);
    setTeks("");
  }

  if (jadi.length) {
    return (
      <div className="rounded-xl border border-amber/50 bg-amber/5 p-3">
        <p className="text-[13px] font-semibold text-amber">{jadi.length} akun dibuat. Catat atau cetak PIN di bawah sekarang.</p>
        <p className="mt-1 text-[12px] leading-snug text-mute">
          PIN ini tidak bisa dilihat lagi sesudah layar ini ditutup. Kalau hilang, pakai Atur ulang PIN.
        </p>
        <table className="mt-2 w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-dim">
              <th className="py-1 text-left">Nama</th><th className="py-1 text-left">NIP</th><th className="py-1 text-left">Peran</th><th className="py-1 text-right">PIN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {jadi.map((x) => (
              <tr key={x.id}>
                <td className="py-1.5 text-cream">{x.nama}</td>
                <td className="py-1.5 tabular-nums text-cream">{nipDari(x.id) ?? "…"}</td>
                <td className="py-1.5 text-mute">{ROLE_LABEL[x.peran]}</td>
                <td className="py-1.5 text-right font-bold tabular-nums tracking-widest text-amber">{x.pin}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {gagal.length > 0 && <p className="mt-2 text-[12px] text-red-300">Belum dibuat: {gagal.join(", ")}.</p>}
        <div className="mt-3 flex gap-2">
          <button onClick={() => void cetakStruk()} className="min-h-[44px] flex-1 rounded-lg bg-amber text-[13px] font-bold text-ink">Cetak PIN</button>
          <button onClick={() => { setJadi([]); onTutup(); }} className="min-h-[44px] flex-1 rounded-lg border border-line text-[13px] text-cream">Sudah dicatat, tutup</button>
        </div>
        <div id="struk" className="cetak-saja bg-white p-2 font-mono text-[11px] leading-snug text-black">
          <div className="text-center font-bold">AKUN KARYAWAN {VENUE_LABEL[venue].toUpperCase()}</div>
          <div className="text-center">Masuk di kasir.sportspoollounge.com</div>
          {jadi.map((x) => (
            <div key={x.id} className="mt-2 border-t border-dashed border-black/40 pt-1">
              <div className="font-bold">{x.nama}</div>
              <div>NIP {nipDari(x.id) ?? "-"} · PIN {x.pin}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-ink-2 p-3">
      <p className="text-[13px] font-semibold text-cream">Tambah banyak akun</p>
      <p className="text-[12px] leading-snug text-mute">Tempel daftar, satu orang per baris. Contoh: Sherly = Kasir.</p>
      <div className="grid grid-cols-2 gap-2">
        {(["spl", "smh"] as const).map((v) => (
          <button key={v} onClick={() => setVenue(v)} aria-pressed={venue === v}
            className={`min-h-[44px] rounded-lg border text-[13px] ${venue === v ? "border-amber bg-amber/15 text-amber" : "border-line bg-ink text-cream"}`}>
            {VENUE_LABEL[v]}
          </button>
        ))}
      </div>
      {!baris ? (
        <>
          <textarea value={teks} onChange={(e) => setTeks(e.target.value)} rows={6} aria-label="Daftar karyawan"
            placeholder={"Sherly = Kasir\nWahyu = Waiter"}
            className="w-full rounded-lg border border-line bg-ink p-3 text-[13px] text-cream placeholder:text-dim focus:border-amber focus:outline-none" />
          <button disabled={!bacaDaftar(teks).length} onClick={() => setBaris(bacaDaftar(teks))}
            className="min-h-[44px] w-full rounded-lg bg-amber text-[13px] font-bold text-ink disabled:opacity-40">
            Periksa daftar
          </button>
        </>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {baris.map((b, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="min-w-0 truncate text-[13px] text-cream">{b.nama}</span>
                <select value={b.peran} aria-label={`Peran ${b.nama}`}
                  onChange={(e) => setBaris(baris.map((x, j) => (j === i ? { ...x, peran: e.target.value as Role } : x)))}
                  className="min-h-[36px] rounded-lg border border-line bg-ink px-2 text-[12px] text-cream">
                  {ROLES.filter((r) => r !== "superadmin").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <button onClick={buat} className="min-h-[44px] w-full rounded-lg bg-amber text-[13px] font-bold text-ink">
            Buat {baris.length} akun {VENUE_LABEL[venue]}
          </button>
          <button onClick={() => setBaris(null)} className="min-h-[40px] w-full text-[12px] text-dim">Ubah daftar</button>
        </>
      )}
      <button onClick={onTutup} className="min-h-[40px] w-full text-[12px] text-dim">Batal</button>
    </div>
  );
}
