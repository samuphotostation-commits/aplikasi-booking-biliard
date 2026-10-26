/**
 * COVERFLOW 3D — kartu hidangan yang berputar seperti sampul album.
 *
 * Bentuknya diminta pemilik 13 Okt 2026 (contoh komponen shadcn
 * "3-d-coverflow-carousel"). Yang diambil INTERAKSINYA; warnanya tidak.
 *
 * Contohnya menulis warna langsung di dalam komponen (#0c0a09 latar,
 * #c5a880 aksen emas, tombol gradasi emas). Di aplikasi ini itu tiga
 * pelanggaran sekaligus terhadap `docs/lampiran/L7-design-system.md`:
 *
 *   `DS-00b` tidak ada nilai hex di dalam komponen — semuanya token.
 *   `DS-01`  aksen wilayah Smokehouse adalah maroon, bukan emas.
 *   `DS-02`  TOMBOL AKSI selalu amber dengan teks near-black, di seluruh
 *            aplikasi. Tombol emas di satu layar berarti pelanggan belajar
 *            dua warna untuk satu kebiasaan.
 *
 * Tiga hal lain yang sengaja berbeda dari contohnya:
 *
 * 1. UKURAN KARTU IKUT LEBAR LAYAR. Contohnya memakai kartu 330×500 px
 *    dengan tetangga digeser 285 px dan 510 px — di layar 360 px (lebar
 *    rancangan wajib, `DS-00d`) kartunya terpotong dan tetangganya keluar
 *    layar. Di sini ukurannya dihitung dari lebar wadahnya.
 * 2. TOMBOL PANAH TIDAK MENYANDERA KEYBOARD. Contohnya memasang pendengar
 *    `keydown` di `window`, jadi panah kiri/kanan DI SELURUH APLIKASI
 *    menggeser korsel ini — termasuk saat kasir sedang mengetik di layar
 *    lain. Di sini pendengarnya menempel di korselnya sendiri.
 * 3. LATAR BURAM MEMAKAI GAMBAR YANG SAMA, lewat CSS. Contohnya menaruh
 *    `<img>` kedua berukuran penuh; di jaringan venue itu berarti foto
 *    besar diunduh dua kali.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type KartuCoverflow = {
  /** Kunci unik sekaligus tujuan navigasi. */
  id: string;
  /** Label kecil di atas, mis. "9 pilihan". */
  tag?: string;
  judul: string;
  subjudul?: string;
  teks?: string;
  foto: string;
  ctaLabel?: string;
};

export type CoverflowProps = {
  kartu: KartuCoverflow[];
  label?: string;
  /** Jeda putar otomatis (ms). 0 = tidak berputar sendiri. */
  jeda?: number;
  onPilih?: (k: KartuCoverflow) => void;
  className?: string;
};

/**
 * Ukuran kartu, geseran tetangga, dan TINGGI PANGGUNG — dihitung dari lebar
 * wadah.
 *
 * `lega` adalah ruang tegak di atas dan di bawah kartu. Versi pertama cuma
 * memberi 40 px untuk keduanya (20 px per sisi), dan itu terlalu sempit:
 * tetangga yang diputar 24° condong ke arah penonton, jadi tepi dekatnya
 * tergambar LEBIH BESAR daripada ukuran datarnya, lalu terpotong wadah yang
 * ber-`overflow-hidden`. Yang terlihat pemilik: kartu yang "terpotong bagian
 * bawah". Sekarang ruangnya sekitar sepersepuluh tinggi kartu di tiap sisi,
 * dan `jagaTepi` di bawah memeriksanya — bukan mengira-ngira.
 */
function ukuran(lebar: number) {
  // 360 px → kartu 202 px; 590 px ke atas → kartu 330 px (batas atas).
  const w = Math.max(190, Math.min(330, Math.round(lebar * 0.56)));
  const h = Math.round(w * 1.48);
  return {
    w, h,
    lega: Math.round(h * 0.22),
    // Tetangga digeser proporsional supaya tepinya selalu kelihatan,
    // tidak pernah keluar layar.
    geser1: Math.round(w * 0.86),
    geser2: Math.round(w * 1.54),
  };
}

export default function Coverflow({
  kartu, label, jeda = 5000, onPilih, className = "",
}: CoverflowProps) {
  const [kini, setKini] = useState(0);
  const [diam, setDiam] = useState(false);
  const [lebar, setLebar] = useState(360);
  const wadah = useRef<HTMLDivElement | null>(null);
  const sentuhX = useRef(0);
  const total = kartu.length;

  const maju = useCallback(() => setKini((i) => (i + 1) % total), [total]);
  const mundur = useCallback(() => setKini((i) => (i - 1 + total) % total), [total]);

  /**
   * Lebar wadah DIUKUR, bukan ditebak dari `window`: kartunya juga dipakai di
   * kolom setengah layar pada halaman depan versi desktop.
   *
   * `useLayoutEffect`, bukan `useEffect`: pengukurannya harus terjadi SEBELUM
   * gambar pertama. Dengan `useEffect`, gambar pertama memakai lebar bawaan
   * 360 px — dan di HP yang lebih sempit kartunya tergambar terlalu besar
   * lalu terpotong wadahnya selama satu kedipan. Pagar `jagaTepi` di bawah
   * yang menemukannya: "light-bites terpotong wadah — atas 12px, bawah 22px".
   */
  useLayoutEffect(() => {
    const el = wadah.current;
    if (!el) return;
    setLebar(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setLebar(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * JAGA TEPI — hanya saat pengembangan.
   *
   * Tinggi panggung dihitung dari rasio kartu, tapi kartu tetangga diputar
   * dalam perspektif: tepi dekatnya tergambar lebih besar daripada ukuran
   * datarnya, dan besarnya tidak bisa dihitung dengan rumus sederhana. Jadi
   * diperiksa dari hasil gambarnya sendiri. Kalau ada kartu yang melewati
   * wadahnya, ini menyebutkannya di konsol dengan angka — supaya tidak ada
   * lagi "kayaknya kepotong" yang harus ditebak dari tangkapan layar.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const el = wadah.current;
    if (!el) return;
    const t = setTimeout(() => {
      const luar = el.getBoundingClientRect();
      for (const kartuEl of el.querySelectorAll<HTMLElement>("[data-kartu]")) {
        const r = kartuEl.getBoundingClientRect();
        if (r.height < 2) continue;                       // kartu jauh, tak tergambar
        const atas = Math.round(luar.top - r.top);
        const bawah = Math.round(r.bottom - luar.bottom);
        if (atas > 0 || bawah > 0) {
          console.warn(
            `[Coverflow] kartu "${kartuEl.dataset.kartu}" terpotong wadah — ` +
            `atas ${atas}px, bawah ${bawah}px (lebar wadah ${Math.round(luar.width)}px)`,
          );
        }
      }
    }, 900);                                              // sesudah transisi 800 ms
    return () => clearTimeout(t);
  }, [kini, lebar]);

  useEffect(() => {
    if (!jeda || diam || total <= 1) return;
    // Jangan berputar sendiri kalau pemakainya minta gerak dikurangi.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const iv = setInterval(maju, jeda);
    return () => clearInterval(iv);
  }, [jeda, diam, total, maju]);

  if (total === 0) return null;
  const { w, h, lega, geser1, geser2 } = ukuran(lebar);

  return (
    <section
      ref={wadah}
      aria-roledescription="carousel"
      aria-label={label ?? "Pilihan hidangan"}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); mundur(); }
        if (e.key === "ArrowRight") { e.preventDefault(); maju(); }
      }}
      onMouseEnter={() => setDiam(true)}
      onMouseLeave={() => setDiam(false)}
      onFocus={() => setDiam(true)}
      onBlur={() => setDiam(false)}
      onTouchStart={(e) => { sentuhX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const d = e.changedTouches[0].clientX - sentuhX.current;
        if (Math.abs(d) > 45) (d < 0 ? maju : mundur)();
      }}
      className={`relative isolate select-none overflow-hidden rounded-2xl border border-line bg-ink-2 ${className}`}
    >
      {/* Latar: foto kartu tengah, diburamkan lewat CSS supaya berkasnya
          tidak diunduh dua kali. */}
      <div aria-hidden
        className="absolute inset-0 -z-10 bg-cover bg-center opacity-25 blur-2xl saturate-150"
        style={{ backgroundImage: `url(${kartu[kini].foto})` }} />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/70 via-ink/50 to-ink/90" />

      {label && (
        <div className="flex items-center justify-center gap-3 px-4 pt-5">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-brick-lit" />
          <h2 className="font-display text-[12px] uppercase tracking-[0.22em] text-brick-lit">{label}</h2>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-brick-lit" />
        </div>
      )}

      {/* Panggung 3D */}
      <div className="relative flex items-center justify-center"
        style={{ height: h + lega, perspective: 1400 }}>
        {kartu.map((k, i) => {
          const jarak = (i - kini + total) % total;
          const tengah = jarak === 0;
          let transform = `translateX(0px) scale(.45)`;
          let opacity = 0, z = 0, filter = "brightness(.4) blur(2px)";
          if (tengah) {
            transform = "translateX(0px) scale(1)"; opacity = 1; z = 30; filter = "none";
          } else if (jarak === 1) {
            transform = `translateX(${geser1}px) scale(.84) rotateY(-24deg)`;
            opacity = .65; z = 20; filter = "brightness(.75)";
          } else if (jarak === 2) {
            transform = `translateX(${geser2}px) scale(.68) rotateY(-38deg)`;
            opacity = .34; z = 10; filter = "brightness(.55) blur(1px)";
          } else if (jarak === total - 1) {
            transform = `translateX(-${geser1}px) scale(.84) rotateY(24deg)`;
            opacity = .65; z = 20; filter = "brightness(.75)";
          } else if (jarak === total - 2) {
            transform = `translateX(-${geser2}px) scale(.68) rotateY(38deg)`;
            opacity = .34; z = 10; filter = "brightness(.55) blur(1px)";
          }
          return (
            <button
              key={k.id}
              type="button"
              data-kartu={k.id}
              aria-hidden={!tengah}
              tabIndex={tengah ? 0 : -1}
              aria-label={tengah ? `${k.judul} — buka` : k.judul}
              onClick={() => (tengah ? onPilih?.(k) : setKini(i))}
              style={{
                position: "absolute", width: w, height: h, transform, opacity, zIndex: z, filter,
                transition: "all 800ms cubic-bezier(.25,1,.5,1)",
              }}
              className="overflow-hidden rounded-2xl border border-line-2 bg-ink text-left shadow-2xl shadow-ink"
            >
              <img src={k.foto} alt="" loading="lazy"
                className="absolute inset-0 h-full w-full object-cover" />
              <span aria-hidden
                className="absolute inset-0 bg-gradient-to-b from-ink/35 via-ink/10 to-ink" />

              <span className="relative flex h-full flex-col justify-end p-3.5 text-center"
                style={{
                  opacity: tengah ? 1 : 0,
                  transform: tengah ? "translateY(0)" : "translateY(14px)",
                  transition: "opacity 500ms ease, transform 500ms ease",
                }}>
                {k.tag && (
                  <span className="absolute right-3.5 top-3 rounded-full bg-ink/70 px-2 py-0.5
                                   text-[11px] font-semibold text-cream/90 backdrop-blur">
                    {k.tag}
                  </span>
                )}
                {/* Dua baris paling banyak. Nama kategori terpanjang
                    ("Smokehouse Buntut Sapi") jatuh ke dua baris di kartu
                    sempit; tanpa batas ini, satu nama panjang mendorong CTA
                    keluar dari kartu yang tingginya sudah dipatok rasio. */}
                <span className="line-clamp-2 font-display text-[19px] uppercase leading-tight tracking-[0.04em] text-cream">
                  {k.judul}
                </span>
                {k.subjudul && (
                  <span className="mt-0.5 text-[12px] uppercase tracking-[0.12em] text-cream/75">
                    {k.subjudul}
                  </span>
                )}
                <span aria-hidden className="mx-auto my-2 h-0.5 w-8 rounded-full bg-brick-lit" />
                {k.teks && (
                  <span className="mx-auto mb-3 line-clamp-1 max-w-[15rem] text-[12px] leading-snug text-cream/80">
                    {k.teks}
                  </span>
                )}
                {/* CTA amber + teks near-black, sama seperti seluruh aplikasi (DS-02). */}
                <span className="mx-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-full
                                 bg-amber px-4 text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
                  {k.ctaLabel ?? "Lihat menu"}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M14 5l7 7-7 7M21 12H3" />
                  </svg>
                </span>
              </span>
            </button>
          );
        })}

        <Panah arah="kiri" onClick={mundur} />
        <Panah arah="kanan" onClick={maju} />
      </div>

      <div className="flex items-center justify-center gap-2 pb-5">
        {kartu.map((k, i) => (
          <button key={k.id} type="button" onClick={() => setKini(i)}
            aria-label={`Ke ${k.judul}`} aria-current={i === kini}
            className={`h-2 rounded-full transition-all ${
              i === kini ? "w-7 bg-amber" : "w-2 bg-cream/25 hover:bg-cream/50"
            }`} />
        ))}
      </div>
    </section>
  );
}

function Panah({ arah, onClick }: { arah: "kiri" | "kanan"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      aria-label={arah === "kiri" ? "Hidangan sebelumnya" : "Hidangan berikutnya"}
      className={`absolute top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center
                  rounded-full border border-line-2 bg-ink/70 text-cream backdrop-blur
                  hover:bg-ink active:bg-ink ${arah === "kiri" ? "left-2" : "right-2"}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={arah === "kiri" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}
