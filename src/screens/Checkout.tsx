import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button, Card, PageHeader } from "../components/UI";
import { Ball } from "../components/motion/Billiard";
import { useStore, PBJT_RATE, type CartLine } from "../lib/store";
import {
  useAdmin, cartProblem, guestOrderProblem, lineValue, runningOn, slotProblem, classOf,
} from "../lib/adminStore";
import { slotStart } from "../lib/occupancy";
import { findItem } from "../data/menu";
import { TABLES, fmtHour, PAKET_SIANG, BOOKING_TERMS, CLASS_LABEL } from "../data/venue";
import { bookingCode, fmtDateLong, rupiah } from "../lib/core";
import { bacaProfil, lupakanProfil, simpanProfil } from "../lib/profilTamu";
import { memberMungkin, memberSaya, type Member } from "../lib/member";
import { PanelMasuk } from "./Akun";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Checkout() {
  const nav = useNavigate();
  const { state, dispatch, totals } = useStore();
  const { a: venue, dispatchA } = useAdmin();
  const { draft, cart } = state;
  const table = totals.booking ? TABLES.find((t) => t.id === draft.tableId) : undefined;
  const kelasMeja = table ? classOf(venue, table.id) : "regular";

  // Terisi sendiri dari profil di HP ini — tamu tidak perlu mengetik ulang tiap datang.
  const profil = useMemo(() => bacaProfil(), []);
  const [nama, setNama] = useState(profil.nama);
  const [hp, setHp] = useState(profil.hp);
  const [email, setEmail] = useState(profil.email);
  const [note, setNote] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const sending = useRef(false);
  // Booking diproses atas nama member (permintaan pemilik). Di mode lokal/uji
  // tanpa server, akun member tidak ada dan layar kembali ke formulir biasa.
  const [member, setMember] = useState<Member | null>(null);
  const [cekMember, setCekMember] = useState(!memberMungkin());
  useEffect(() => {
    let batal = false;
    void memberSaya().then((m) => {
      if (batal) return;
      setCekMember(true);
      if (!m) return;
      setMember(m);
      setNama(m.nama); setHp(m.hp);
      if (m.email) setEmail(m.email);
    });
    return () => { batal = true; };
  }, []);

  const foodOnly = !totals.booking;
  const mode = draft.fnbMode;
  // "Bayar di kasir" sekarang berlaku untuk pesanan meja MAUPUN takeaway:
  // pesan makanan saja tanpa meja, bayar saat mengambil di kasir.
  const payKasir = foodOnly && draft.fnbPay === "kasir";
  // Hold milik tamu ini sendiri (QR yang sedang/pernah dibuka) tidak dihitung sebagai "slot terisi".
  const ownHold = state.pending?.booking ? state.pending.refId : undefined;

  // Alasan penolakan diambil dari mesin yang sama yang nanti memverifikasi —
  // tamu tidak pernah membayar sesuatu yang pasti ditolak.
  const problem = totals.booking
    ? slotProblem(venue, {
        tableId: draft.tableId!, startsAt: slotStart(draft.dateISO, draft.startHour!),
        hours: draft.hours, paket: draft.paketSiang,
      }, Date.now(), true, ownHold) ?? cartProblem(venue, cart)
    : cart.length > 0
      ? guestOrderProblem(venue, {
          mode, tableId: draft.fnbTable ?? undefined, pay: draft.fnbPay, lines: cart,
          sessionId: mode === "meja" ? draft.fnbSessionId ?? undefined : undefined,
        }, Date.now())
      : null;

  const hpClean = hp.replace(/[\s-]/g, "");
  const hpOk = /^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(hpClean);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const namaOk = nama.trim().length >= 2;
  // PRD AT-05: pesan dari meja cukup nama; takeaway perlu HP untuk dipanggil; booking lengkap.
  const formOk = totals.booking
    ? namaOk && hpOk && emailOk
    : mode === "takeaway"
      ? namaOk && hpOk && (email === "" || emailOk)
      : namaOk && (hp === "" || hpOk) && (email === "" || emailOk);
  // Booking hanya diproses untuk member yang sudah masuk — supaya datanya menjadi
  // milik venue (permintaan pemilik). Pesan makanan/takeaway tidak perlu akun.
  const butuhMember = totals.booking && memberMungkin();
  // Bayar di kasir boleh bernilai 0 (mis. semua minuman gratis Paket Siang); QRIS tidak.
  const ready = formOk && !problem && (payKasir || totals.grand > 0) && !sentId
    && (!butuhMember || !!member);

  // Pesanan "bayar di kasir" langsung dikirim ke mesin; hasilnya dibaca dari data venue.
  useEffect(() => {
    if (!sentId) return;
    const o = venue.orders.find((x) => x.id === sentId);
    if (!o) return;
    if (o.status === "diterima") {
      dispatch({
        t: "confirm",
        booking: {
          kind: "pesanan", code: o.code, refId: o.id, draft, lines: cart,
          total: o.value, createdAt: Date.now(),
        },
      });
      nav("/sukses", { state: { refId: o.id } });
    } else {
      setNote(o.reason ? cap(o.reason) : "Pesanan ditolak.");
      setSentId(null);
      sending.current = false;
    }
  }, [sentId, venue.orders]); // eslint-disable-line react-hooks/exhaustive-deps

  function kirimKeDapur() {
    simpanProfil({ nama: nama.trim(), hp, email, setuju: true });
    // Ketuk ganda sebelum layar sempat berganti tidak boleh menjadi dua pesanan.
    if (sending.current) return;
    sending.current = true;
    const code = bookingCode();
    const id = `g-${code}`;
    setNote(null);
    setSentId(id);
    dispatchA({
      t: "guestOrder",
      order: {
        id, code, guest: nama.trim(), phone: hpClean || undefined, mode,
        ...(mode === "meja"
          ? { tableId: draft.fnbTable ?? undefined, sessionId: draft.fnbSessionId ?? undefined }
          : {}),
        pay: "kasir", lines: cart, paidOnline: 0,
      },
    });
  }

  function inc(l: CartLine) {
    const next = cart.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x));
    const p = cartProblem(venue, next);
    if (p) { setNote(cap(p)); return; }
    setNote(null);
    dispatch({ t: "inc", key: l.key });
  }

  const empty = !totals.booking && cart.length === 0;

  if (empty) {
    return (
      <div className="pb-28">
        <PageHeader kicker="Ringkasan" title="Pesanan" />
        <div className="mx-auto max-w-lg px-5 pt-10 text-center">
          <Ball n={8} size={44} className="mx-auto opacity-40" />
          <p className="mt-4 text-cream">Belum ada apa-apa di sini.</p>
          <p className="mt-1 text-sm text-dim">Pilih meja dulu, atau langsung pesan makanan.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button full onClick={() => nav("/booking")}>Booking Meja</Button>
            <Button full variant="ghost" onClick={() => nav("/menu")}>Lihat Menu</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-44">
      <PageHeader kicker="Ringkasan" title="Pesanan" sub="Periksa dulu sebelum bayar." />

      <div className="mx-auto max-w-lg space-y-5 px-5 pt-5">
        {/* ── Sesi meja ─────────────────────────────────── */}
        {table && draft.startHour !== null && (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line bg-brick/20 px-4 py-3">
              <Ball n={kelasMeja === "vvip" ? 3 : kelasMeja === "vip" ? 9 : 1} size={32}
                color={kelasMeja === "vvip" ? "#992212" : "#F0A202"} />
              <div className="flex-1">
                <div className="font-display text-lg uppercase tracking-wide text-cream">
                  {table.name}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-dim">
                  {CLASS_LABEL[kelasMeja]} · {table.capacity} orang
                </div>
              </div>
              <button
                onClick={() => nav("/booking")}
                className="text-xs font-semibold text-amber underline underline-offset-4"
              >Ubah</button>
            </div>
            <div className="divide-y divide-line">
              <Row k="Tanggal" v={fmtDateLong(draft.dateISO)} />
              <Row
                k="Jam"
                v={`${fmtHour(draft.startHour)} – ${fmtHour(draft.startHour + draft.hours)} (${draft.hours} jam)`}
              />
              {draft.paketSiang && <Row k="Paket" v={PAKET_SIANG.name} accent />}
              <Row k="Subtotal meja" v={rupiah(totals.tableTotal)} bold />
            </div>
            <div className="border-t border-line px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">Ketentuan booking</div>
              <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-mute">
                {BOOKING_TERMS.map((s) => <li key={s}>• {s}</li>)}
              </ul>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => dispatch({ t: "clearBooking" })}
                className="min-h-[40px] w-full border-t border-line text-[12px] text-dim underline underline-offset-4"
              >Hapus meja, pesan makanan saja</button>
            )}
          </Card>
        )}

        {/* ── Cara terima pesanan (tanpa booking) ───────── */}
        {foodOnly && (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
              Cara terima pesanan
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Choice on={mode === "meja"} onClick={() => dispatch({ t: "setFnb", mode: "meja" })}
                title="Saya sedang main" sub="Diantar ke meja" />
              <Choice on={mode === "takeaway"} onClick={() => dispatch({ t: "setFnb", mode: "takeaway" })}
                title="Takeaway" sub="Ambil di kasir" />
            </div>

            {mode === "meja" && (
              <Card className="mt-2 p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[12px] text-mute">Nomor meja</span>
                  <span className="text-[10px] text-dim">● = sedang main</span>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {TABLES.map((t) => {
                    const on = draft.fnbTable === t.id;
                    const run = runningOn(venue, t.id);
                    const main = !!run;
                    return (
                      <button key={t.id}
                        onClick={() => dispatch({ t: "setFnb", table: t.id, sessionId: run?.id ?? null })}
                        aria-pressed={on}
                        aria-label={`${t.name}${main ? ", sedang main" : ""}`}
                        className={`relative min-h-[40px] rounded-lg border text-[13px] font-semibold ${
                          on ? "border-amber bg-amber text-ink"
                            : classOf(venue, t.id) === "vvip" ? "border-brick bg-brick/20 text-cream"
                            : classOf(venue, t.id) === "vip" ? "border-amber/50 bg-amber/10 text-cream"
                            : classOf(venue, t.id) === "resto" ? "border-felt/60 bg-felt/15 text-cream"
                            : "border-line bg-ink text-cream"
                        }`}>
                        {classOf(venue, t.id) === "resto" ? `R${t.no}` : classOf(venue, t.id) === "regular" ? t.no : `V${t.no}`}
                        {main && (
                          <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${on ? "bg-ink" : "bg-emerald-400"}`} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-[12px] text-mute">Bayar</div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Choice small on={draft.fnbPay === "online"} onClick={() => dispatch({ t: "setFnb", pay: "online" })}
                    title="Sekarang (QRIS)" />
                  <Choice small on={draft.fnbPay === "kasir"} onClick={() => dispatch({ t: "setFnb", pay: "kasir" })}
                    title="Di kasir saat selesai" />
                </div>
                {draft.fnbPay === "kasir" && (
                  <p className="mt-2 text-[11px] leading-snug text-dim">
                    Pesanan masuk ke bill meja dan dibayar bersama sewa meja saat tutup tab.
                  </p>
                )}
              </Card>
            )}
            {mode === "takeaway" && (
              <Card className="mt-2 p-3">
                <div className="text-[12px] text-mute">Bayar</div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Choice small on={draft.fnbPay === "kasir"} onClick={() => dispatch({ t: "setFnb", pay: "kasir" })}
                    title="Saat ambil di kasir" />
                  <Choice small on={draft.fnbPay === "online"} onClick={() => dispatch({ t: "setFnb", pay: "online" })}
                    title="Sekarang (QRIS)" />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-dim">
                  {draft.fnbPay === "kasir"
                    ? "Dapur langsung menyiapkan. Sebutkan kode pesanan saat mengambil dan membayar di kasir."
                    : "Dibayar di muka lewat QRIS; tinggal ambil di kasir dengan kode pesanan."}
                </p>
              </Card>
            )}
          </section>
        )}

        {/* ── F&B ───────────────────────────────────────── */}
        {cart.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="font-script text-xl leading-none text-amber">Smokehouse</div>
              <button
                onClick={() => nav("/menu")}
                className="text-xs font-semibold text-amber underline underline-offset-4"
              >Tambah</button>
            </div>
            <div className="divide-y divide-line">
              {cart.map((l) => {
                const it = findItem(l.itemId);
                if (!it) return null;
                // Nilai per baris dari rumus mesin: harga terkini + jatah minuman gratis.
                const priced = totals.lines.filter((x) => x.key === l.key || x.key === `${l.key}-gratis`);
                const nilai = priced.reduce((n, x) => n + lineValue(x), 0);
                const gratis = priced.filter((x) => x.unitPrice === 0).reduce((n, x) => n + x.qty, 0);
                return (
                  <div key={l.key} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] text-cream">{it.name}</div>
                      {(l.variant || gratis > 0) && (
                        <div className="text-[11px] text-dim">
                          {l.variant}{l.variant && gratis > 0 ? " · " : ""}
                          {gratis > 0 && <span className="text-emerald-400">{gratis} gratis Paket Siang</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setNote(null); dispatch({ t: "dec", key: l.key }); }}
                        aria-label={`Kurangi ${it.name}`}
                        className="h-8 w-8 rounded-lg border border-line text-amber"
                      >−</button>
                      <span className="min-w-[18px] text-center font-serif text-sm font-bold text-cream">
                        {l.qty}
                      </span>
                      <button
                        onClick={() => inc(l)}
                        aria-label={`Tambah ${it.name}`}
                        className="h-8 w-8 rounded-lg border border-line text-amber"
                      >+</button>
                    </div>
                    <div className="w-[76px] text-right font-serif text-sm tabular-nums text-cream">
                      {rupiah(nilai)}
                    </div>
                  </div>
                );
              })}
              <Row k="Subtotal makanan" v={rupiah(totals.fnbTotal)} bold />
            </div>
          </Card>
        )}

        {/* ── Total ─────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            <Row k="Subtotal (sebelum pajak)" v={rupiah(totals.dpp)} muted />
            <Row k={`PBJT ${Math.round(PBJT_RATE * 100)}%`} v={rupiah(totals.tax)} muted />
            <div className="flex items-center justify-between bg-amber/10 px-4 py-3.5">
              <span className="font-display text-lg uppercase tracking-wide text-cream">
                {payKasir ? "Ditagih Nanti" : "Total Bayar"}
              </span>
              <span className="font-serif text-2xl font-bold tabular-nums text-amber">
                {rupiah(totals.grand)}
              </span>
            </div>
          </div>
        </Card>
        <p className="-mt-2 text-[11px] leading-relaxed text-dim">
          Harga yang tampil sudah termasuk pajak.{" "}
          {payKasir
            ? mode === "takeaway"
              ? "Dibayar tunai/kartu/QRIS di kasir saat pesanan diambil."
              : "Angka ini masuk ke bill meja dan dibayar saat tutup tab."
            : "Angka ini sama persis dengan yang akan muncul di QRIS — tidak ada tambahan di halaman berikutnya."}
        </p>

        {(problem || note) && (
          <div className="rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-[13px] leading-snug text-amber">
            {note ?? cap(problem!)}
          </div>
        )}

        {/* ── Data pemesan ──────────────────────────────── */}
        <div>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
            {butuhMember && !member ? "Masuk dulu untuk booking" : "Data pemesan"}
          </h2>
          {butuhMember && !member ? (
            <div className="space-y-2">
              {!cekMember ? (
                <div className="rounded-xl border border-line bg-ink-2 px-4 py-6 text-center text-[13px] text-dim">
                  Memeriksa akun…
                </div>
              ) : (
                <PanelMasuk onMasuk={(m) => {
                  setMember(m);
                  setNama(m.nama); setHp(m.hp);
                  if (m.email) setEmail(m.email);
                }} />
              )}
              <p className="text-[11px] leading-snug text-dim">
                Booking meja diproses atas nama member SPL supaya meja benar-benar tersimpan untuk kamu.
                Pesan makanan saja tidak perlu akun.
              </p>
            </div>
          ) : (
          <div className="space-y-2">
            {member ? (
              <div className="rounded-xl border border-line bg-ink-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-[0.16em] text-dim">Member SPL</span>
                  <a href="#/akun" className="text-[11px] text-amber underline underline-offset-4">Ubah di Akun</a>
                </div>
                <div className="mt-0.5 text-[15px] font-semibold text-cream">{member.nama}</div>
                <div className="text-[12px] tabular-nums text-mute">{member.hp}</div>
              </div>
            ) : (
              <Field label="Nama" value={nama} onChange={setNama} placeholder="Nama lengkap" />
            )}
            {!member && (
              <Field
                label={totals.booking || mode === "takeaway" ? "Nomor HP" : "Nomor HP (opsional)"}
                value={hp} onChange={setHp} placeholder="08xxxxxxxxxx"
                type="tel" ok={hp === "" ? undefined : hpOk}
                hint={mode === "takeaway" && foodOnly
                  ? "Dipakai kasir untuk memanggil saat pesanan siap."
                  : "Dipakai kasir untuk menghubungi kalau ada perubahan."}
              />
            )}
            <Field
              label={totals.booking ? "Email" : "Email (opsional)"}
              value={email} onChange={setEmail} placeholder="nama@email.com"
              type="email" ok={email === "" ? undefined : emailOk}
              hint={totals.booking ? "E-struk dan kode check-in dikirim ke sini." : "Untuk e-struk, kalau mau."}
            />
            <p className="text-[11px] leading-snug text-dim">
              Data ini dipakai SPL untuk reservasi, memanggil pesanan, dan info promo — tidak dibagikan
              ke pihak lain. Nama &amp; nomor tersimpan di HP ini supaya tidak perlu diketik ulang.{" "}
              <button
                type="button"
                onClick={() => { lupakanProfil(); setNama(""); setHp(""); setEmail(""); }}
                className="underline underline-offset-4"
              >Hapus data di HP ini</button>. Untuk menghapus riwayat kunjungan di SPL, minta ke kasir.
            </p>
          </div>
          )}
        </div>

        {totals.booking && (
          <div className="rounded-xl border border-line bg-ink-2 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              Kebijakan pembatalan
            </p>
            <ul className="mt-1.5 space-y-0.5 text-[12px] leading-snug text-mute">
              <li>• Batal lebih dari 12 jam sebelum sesi — kredit toko 100%</li>
              <li>• Batal 3–12 jam sebelum sesi — kredit toko 50%</li>
              <li>• Kurang dari 3 jam — hangus</li>
              <li>• Reschedule gratis 1× sampai H-3 jam</li>
            </ul>
          </div>
        )}
      </div>

      <motion.div
        initial={{ y: 90 }} animate={{ y: 0 }}
        className="safe-b fixed inset-x-0 bottom-[58px] z-20 border-t border-line bg-ink/95 px-5 py-3 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="flex-1">
            <div className="text-[11px] text-dim">{payKasir ? "Masuk bill meja" : "Total"}</div>
            <div className="font-serif text-xl font-bold text-amber">{rupiah(totals.grand)}</div>
          </div>
          {payKasir ? (
            <Button disabled={!ready} busy={!!sentId} onClick={kirimKeDapur}>Kirim ke Dapur</Button>
          ) : (
            <Button
              disabled={!ready}
              onClick={() => {
                simpanProfil({ nama: nama.trim(), hp, email, setuju: true });
                nav("/bayar", { state: { nama: nama.trim(), hp: hpClean, email } });
              }}
            >
              Bayar QRIS
            </Button>
          )}
        </div>
        {(!formOk || (butuhMember && !member)) && (
          <p className="mx-auto mt-1.5 max-w-lg text-[11px] text-dim">
            {butuhMember && !member
              ? "Masuk atau daftar member dulu — booking diproses atas nama member."
              : totals.booking
                ? "Lengkapi nama, nomor HP, dan email dulu."
                : mode === "takeaway" ? "Lengkapi nama dan nomor HP dulu." : "Isi nama dulu."}
          </p>
        )}
      </motion.div>
    </div>
  );
}

function Choice({
  on, onClick, title, sub, small,
}: { on: boolean; onClick: () => void; title: string; sub?: string; small?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`rounded-xl border px-3 text-left transition-colors ${small ? "min-h-[44px]" : "min-h-[58px]"} ${
        on ? "border-amber bg-amber/12" : "border-line bg-ink-2"
      }`}>
      <div className={`text-[14px] font-semibold ${on ? "text-amber" : "text-cream"}`}>{title}</div>
      {sub && <div className="text-[11px] text-dim">{sub}</div>}
    </button>
  );
}

function Row({
  k, v, muted, bold, accent,
}: { k: string; v: string; muted?: boolean; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className={`text-[13px] ${muted ? "text-dim" : "text-cream"}`}>{k}</span>
      <span
        className={`font-serif tabular-nums ${
          bold ? "text-base font-bold text-amber"
            : accent ? "text-sm text-amber"
            : muted ? "text-sm text-mute" : "text-sm text-cream"
        }`}
      >{v}</span>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", ok, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; ok?: boolean; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-mute">{label}</span>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border bg-ink-2 px-4 py-3 text-cream placeholder:text-dim
          focus:outline-none ${
            ok === false ? "border-red-400/70 focus:border-red-400" : "border-line focus:border-amber"
          }`}
      />
      {ok === false && (
        <span className="mt-1 block text-[11px] text-red-400">
          Format {label.toLowerCase().replace(" (opsional)", "")} belum benar.
        </span>
      )}
      {hint && ok !== false && (
        <span className="mt-1 block text-[11px] text-dim">{hint}</span>
      )}
    </label>
  );
}
