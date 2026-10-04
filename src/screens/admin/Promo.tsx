import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdmin } from "../../lib/adminStore";
import { businessDow, promoApplies, type Promo, type PromoScope } from "../../lib/billing";
import { rupiah } from "../../lib/core";
import { Button } from "../../components/UI";

/* Panel promo untuk superadmin. Dua jenis:
   - autoApply : happy hour, berlaku sendiri di jam tertentu tanpa kode
   - kode      : pelanggan/kasir memasukkan kode saat bayar

   Promo TIDAK bertumpuk — sistem memilih yang paling menguntungkan tamu.
   Diskon bertumpuk adalah kebocoran margin yang paling sulit dilacak. */

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const SCOPE_LABEL: Record<PromoScope, string> = {
  billiard: "Meja biliar", fnb: "Makanan & minuman", all: "Semua",
};

const kosong = (): Promo => ({
  // ID unik walau dua superadmin membuat promo pada milidetik yang sama di perangkat berbeda.
  id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, code: "", name: "",
  kind: "percent", value: 10, scope: "all",
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startHour: 11, endHour: 26,
  minSpend: 0, maxDiscount: 0, active: true, autoApply: false,
});

export default function PromoScreen() {
  const { a, dispatchA, peek } = useAdmin();
  const [edit, setEdit] = useState<Promo | null>(null);
  const [hapus, setHapus] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const now = Date.now();
  const dow = businessDow(now);

  function simpan(p: Promo) {
    const clean = { ...p, name: p.name.trim(), code: p.code.trim().toUpperCase() };
    dispatchA({ t: "savePromo", promo: clean });
    // Dibaca ulang dari mesin: editor hanya ditutup kalau promo benar-benar tersimpan.
    const saved = peek().promos.find((x) => x.id === clean.id);
    if (saved && JSON.stringify(saved) === JSON.stringify(clean)) { setEdit(null); setNote(`Promo "${clean.name}" tersimpan.`); }
    else setNote("Promo ditolak — periksa isian (persen maksimal 100).");
    setTimeout(() => setNote(null), 4000);
  }

  return (
    <div className="space-y-4 pb-6">
      {!edit && (
        <>
          <Button full onClick={() => setEdit(kosong())}>+ Buat Promo Baru</Button>

          <div className="space-y-2">
            {a.promos.length === 0 && (
              <div className="rounded-xl border border-line bg-ink-2 px-4 py-8 text-center text-sm text-dim">
                Belum ada promo.
              </div>
            )}
            {a.promos.map((p) => {
              const berlaku = promoApplies(p, now, dow);
              return (
                <motion.div key={p.id} layout
                  className={`rounded-xl border p-3 ${
                    !p.active ? "border-line bg-ink-2 opacity-55"
                      : berlaku ? "border-emerald-500/50 bg-emerald-500/8"
                      : "border-line bg-ink-2"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-cream">{p.name}</span>
                        {p.autoApply ? (
                          <span className="shrink-0 rounded bg-amber/20 px-1.5 py-0.5 text-[9px]
                            font-bold uppercase tracking-wider text-amber">otomatis</span>
                        ) : (
                          <span className="shrink-0 rounded bg-ink-3 px-1.5 py-0.5 text-[9px]
                            font-mono uppercase tracking-wider text-mute">{p.code}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[12px] text-dim">
                        {p.kind === "percent" ? `${p.value}%` : rupiah(p.value)} · {SCOPE_LABEL[p.scope]}
                      </div>
                      <div className="mt-0.5 text-[11px] text-dim">
                        {p.daysOfWeek.length === 7 ? "Setiap hari" : p.daysOfWeek.map((d) => HARI[d]).join(" ")}
                        {" · "}{String(p.startHour % 24).padStart(2, "0")}.00–{String(p.endHour % 24).padStart(2, "0")}.00
                        {p.minSpend > 0 && ` · min ${rupiah(p.minSpend)}`}
                        {p.maxDiscount > 0 && ` · maks ${rupiah(p.maxDiscount)}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase
                        tracking-wider ${
                          !p.active ? "bg-ink-3 text-dim"
                            : berlaku ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber/20 text-amber"
                        }`}>
                        {!p.active ? "nonaktif" : berlaku ? "berlaku kini" : "aktif"}
                      </span>
                    </div>
                  </div>

                  {hapus === p.id ? (
                    <div className="mt-2.5 rounded-lg border border-red-500/40 bg-red-500/10 p-2">
                      <p className="text-[12px] text-red-200">Hapus promo "{p.name}"? Tidak bisa dibatalkan.</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button onClick={() => setHapus(null)}
                          className="min-h-[40px] rounded-lg border border-line bg-ink text-[12px] text-cream">Batal</button>
                        <button onClick={() => { dispatchA({ t: "deletePromo", id: p.id }); setHapus(null); }}
                          className="min-h-[40px] rounded-lg bg-red-500/80 text-[12px] font-semibold text-cream">Ya, hapus</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      <button
                        onClick={() => dispatchA({ t: "savePromo", promo: { ...p, active: !p.active } })}
                        className="min-h-[40px] rounded-lg border border-line bg-ink text-[12px] text-cream">
                        {p.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      <button onClick={() => setEdit(p)}
                        className="min-h-[40px] rounded-lg border border-line bg-ink text-[12px] text-cream">
                        Ubah
                      </button>
                      <button onClick={() => setHapus(p.id)}
                        className="min-h-[40px] rounded-lg border border-red-500/40 bg-red-500/10
                          text-[12px] text-red-300">Hapus</button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <p className="text-[11px] leading-relaxed text-dim">
            Promo tidak bertumpuk. Kalau ada beberapa yang berlaku bersamaan,
            sistem memakai yang paling menguntungkan tamu — sekali saja.
          </p>
        </>
      )}

      {note && <p role="status" className="text-[12px] text-amber">{note}</p>}

      <AnimatePresence>
        {edit && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Editor
              promo={edit}
              others={a.promos.filter((x) => x.id !== edit.id)}
              onChange={setEdit}
              onCancel={() => setEdit(null)}
              onSave={() => simpan(edit)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Editor({
  promo, others, onChange, onSave, onCancel,
}: { promo: Promo; others: Promo[]; onChange: (p: Promo) => void; onSave: () => void; onCancel: () => void }) {
  // Promo yang tersimpan tapi tidak pernah bisa berlaku adalah jebakan: dicegah di sini.
  const code = promo.code.trim().toUpperCase();
  const problems = [
    promo.name.trim().length < 3 && "Nama promo minimal 3 huruf.",
    !promo.autoApply && code.length < 3 && "Kode minimal 3 huruf.",
    !promo.autoApply && others.some((x) => !x.autoApply && x.code.toUpperCase() === code) && `Kode ${code} sudah dipakai promo lain.`,
    !(promo.value > 0) && "Besar diskon harus lebih dari 0.",
    promo.kind === "percent" && promo.value > 100 && "Diskon persen maksimal 100%.",
    promo.daysOfWeek.length === 0 && "Pilih minimal satu hari.",
    promo.endHour <= promo.startHour && "Jam selesai harus sesudah jam mulai.",
  ].filter(Boolean) as string[];
  const valid = problems.length === 0;
  const set = (patch: Partial<Promo>) => onChange({ ...promo, ...patch });

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-ink-2 p-4">
      <h2 className="font-display text-lg uppercase tracking-wide text-cream">Promo</h2>

      <Field label="Nama promo">
        <input value={promo.name} onChange={(e) => set({ name: e.target.value })}
          placeholder="mis. Happy Hour Siang" className={inputCls} />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Toggle label="Otomatis (happy hour)" on={promo.autoApply}
          onClick={() => set({ autoApply: !promo.autoApply })} />
        <Toggle label="Aktif" on={promo.active} onClick={() => set({ active: !promo.active })} />
      </div>

      {!promo.autoApply && (
        <Field label="Kode yang diketik kasir">
          <input value={promo.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            placeholder="COMBO50" className={`${inputCls} uppercase tracking-wider`} />
        </Field>
      )}

      <Field label="Jenis diskon">
        <div className="grid grid-cols-2 gap-2">
          {(["percent", "fixed"] as const).map((k) => (
            <button key={k} onClick={() => set({ kind: k })} aria-pressed={promo.kind === k}
              className={`min-h-[44px] rounded-xl border text-sm font-semibold ${
                promo.kind === k ? "border-amber bg-amber text-ink" : "border-line bg-ink text-cream"
              }`}>{k === "percent" ? "Persen (%)" : "Potong Rupiah"}</button>
          ))}
        </div>
      </Field>

      <Field label={promo.kind === "percent" ? "Besar diskon (%)" : "Besar diskon (Rp)"}>
        <input type="number" inputMode="numeric" min={0}
          step={promo.kind === "percent" ? 5 : 5000} value={promo.value}
          onChange={(e) => set({ value: Math.max(0, Number(e.target.value) || 0) })}
          className={`${inputCls} text-right font-serif tabular-nums`} />
      </Field>

      <Field label="Berlaku untuk">
        <div className="grid grid-cols-3 gap-2">
          {(["billiard", "fnb", "all"] as const).map((sc) => (
            <button key={sc} onClick={() => set({ scope: sc })} aria-pressed={promo.scope === sc}
              className={`min-h-[44px] rounded-xl border text-[12px] font-semibold ${
                promo.scope === sc ? "border-amber bg-amber text-ink" : "border-line bg-ink text-cream"
              }`}>{sc === "billiard" ? "Meja" : sc === "fnb" ? "F&B" : "Semua"}</button>
          ))}
        </div>
      </Field>

      <Field label="Hari berlaku">
        <div className="grid grid-cols-7 gap-1">
          {HARI.map((h, i) => {
            const on = promo.daysOfWeek.includes(i);
            return (
              <button key={i} aria-pressed={on}
                onClick={() => set({
                  daysOfWeek: on ? promo.daysOfWeek.filter((d) => d !== i) : [...promo.daysOfWeek, i].sort(),
                })}
                className={`min-h-[40px] rounded-lg border text-[11px] font-semibold ${
                  on ? "border-amber bg-amber text-ink" : "border-line bg-ink text-dim"
                }`}>{h}</button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Jam mulai">
          <select value={promo.startHour} onChange={(e) => set({ startHour: Number(e.target.value) })}
            className={inputCls}>
            {Array.from({ length: 15 }, (_, i) => 11 + i).map((h) => (
              <option key={h} value={h}>{String(h % 24).padStart(2, "0")}.00</option>
            ))}
          </select>
        </Field>
        <Field label="Jam selesai">
          <select value={promo.endHour} onChange={(e) => set({ endHour: Number(e.target.value) })}
            className={inputCls}>
            {Array.from({ length: 15 }, (_, i) => 12 + i).map((h) => (
              <option key={h} value={h}>{String(h % 24).padStart(2, "0")}.00</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Minimum belanja">
          <input type="number" min={0} step={25000} value={promo.minSpend}
            onChange={(e) => set({ minSpend: Math.max(0, Number(e.target.value) || 0) })}
            className={`${inputCls} text-right font-serif tabular-nums`} />
        </Field>
        <Field label="Maks diskon (0 = bebas)">
          <input type="number" min={0} step={10000} value={promo.maxDiscount}
            onChange={(e) => set({ maxDiscount: Math.max(0, Number(e.target.value) || 0) })}
            className={`${inputCls} text-right font-serif tabular-nums`} />
        </Field>
      </div>

      <div className="rounded-xl border border-line bg-ink px-3.5 py-2.5">
        <div className="text-[11px] uppercase tracking-wider text-dim">Contoh</div>
        <p className="mt-0.5 text-[12px] leading-snug text-cream">
          Tagihan meja Rp 100.000 + F&amp;B Rp 80.000 →{" "}
          <span className="text-amber">
            hemat {rupiah(contohDiskon(promo))}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onCancel} className="min-h-[48px] rounded-xl border border-line bg-ink text-sm text-cream">
          Batal
        </button>
        <Button disabled={!valid} onClick={onSave}>Simpan</Button>
      </div>
      {!valid && (
        <ul className="space-y-0.5 text-[11px] text-red-300">
          {problems.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      )}
    </div>
  );
}

function contohDiskon(p: Promo) {
  const billiard = 100_000, fnb = 80_000;
  const base = p.scope === "billiard" ? billiard : p.scope === "fnb" ? fnb : billiard + fnb;
  if (base < p.minSpend) return 0;
  const raw = p.kind === "percent" ? (base * p.value) / 100 : p.value;
  return Math.min(base, Math.floor(p.maxDiscount > 0 ? Math.min(raw, p.maxDiscount) : raw));
}

const inputCls =
  "w-full rounded-xl border border-line bg-ink px-4 py-3 text-cream placeholder:text-dim focus:border-amber focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-dim">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`flex min-h-[52px] items-center gap-2 rounded-xl border px-3 text-left ${
        on ? "border-amber bg-amber/10" : "border-line bg-ink"
      }`}>
      <span className={`flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${
        on ? "bg-amber" : "bg-line-2"
      }`}>
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className={`h-5 w-5 rounded-full bg-cream ${on ? "ml-auto" : ""}`} />
      </span>
      <span className="text-[12px] leading-tight text-cream">{label}</span>
    </button>
  );
}
