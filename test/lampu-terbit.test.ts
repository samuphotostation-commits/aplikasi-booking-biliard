/* ═══════════════════════════════════════════════════════════════════
   SERVER MENERBITKAN STATUS LAMPU — mata rantai antara jejak & alat

   Yang diuji di sini adalah FUNGSI `terbit` YANG SEBENARNYA
   (supabase/functions/_sumber/terbit.ts), bukan salinannya: jejak
   kejadian palsu dimasukkan lewat Db tiruan, lalu diperiksa apa yang
   disetorkannya ke `publish_lampu_server`.

   Kenapa ini penting dipisah dari uji mesin venue: `State.lights` sudah
   dijaga uji lain, tapi yang sampai ke alat bukan `State.lights` —
   melainkan hasil penyaringan di terbit.ts. Di situlah meja makan
   Smokehouse dibuang. Kalau penyaring itu hilang, alat akan menerima
   "S103=0" dan tidak ada satu uji pun yang akan mengeluh, sementara
   angka lampu di rekap venue resto mulai menghitung sesuatu yang tidak
   ada.

   Dan satu hal yang lebih berbahaya lagi dijaga di bawah: kalau
   penerbitan lampu GAGAL (schema-lampu.sql belum dijalankan di project
   itu), ketersediaan meja untuk HP pelanggan TIDAK BOLEH ikut mati.
   ═══════════════════════════════════════════════════════════════════ */
import { jalankan } from "../supabase/functions/_sumber/terbit";
import { dariWib } from "../src/lib/occupancy";
import type { Entry, Genesis } from "../src/lib/engine";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

/** Satu hari operasional yang jelas: 12 Nov 2026, WIB. */
const jam = (h: number, mnt = 0) => dariWib(2026, 11, 12, h, mnt);
const GENESIS: Genesis = { at: jam(5), seed: false };

/** Db tiruan: membalas persis bentuk yang dipakai terbit.ts. */
function fakeDb(entries: Entry[], opts: { lampuGagal?: string } = {}) {
  const dipanggil: { nama: string; p: Record<string, unknown> }[] = [];

  const builderEvents = () => {
    const b: Record<string, unknown> = {};
    const kembali = () => b;
    b.select = kembali; b.eq = kembali; b.order = kembali;
    b.range = (dari: number, sampai: number) => Promise.resolve({
      data: entries.slice(dari, sampai + 1).map((e, i) => ({
        seq: dari + i + 1, id: e.id, at_ms: e.at, by_staff: e.by, act: e.act,
      })),
      error: null,
    });
    return b;
  };

  const db = {
    from(tabel: string) {
      if (tabel === "venue_world") {
        const b: Record<string, unknown> = {};
        b.select = () => b; b.eq = () => b;
        b.maybeSingle = () => Promise.resolve({ data: { genesis_at: GENESIS.at, seed: GENESIS.seed } });
        return b;
      }
      if (tabel === "venue_events") return builderEvents();
      throw new Error(`tabel tak terduga: ${tabel}`);
    },
    rpc(nama: string, p: Record<string, unknown>) {
      dipanggil.push({ nama, p });
      if (nama === "publish_lampu_server" && opts.lampuGagal) {
        return Promise.resolve({ error: { message: opts.lampuGagal } });
      }
      return Promise.resolve({ error: null });
    },
  };
  return { db, dipanggil };
}

/** Pelakunya kasir SPL yang memang berhak membuka meja dan menyentuh lampu. */
const ev = (n: number, act: unknown, at: number): Entry =>
  ({ id: `e${String(n).padStart(3, "0")}`, at, by: "u-rian", act: act as Entry["act"] });

const JAM = jam(18);                     // 18.00 WIB — venue sudah buka

async function terbitkan(entries: Entry[], opts?: { lampuGagal?: string }) {
  const { db, dipanggil } = fakeDb(entries, opts);
  const res = await jalankan(db as never);
  const teks = await res.text();
  const lampu = dipanggil.find((x) => x.nama === "publish_lampu_server");
  return {
    status: res.status,
    badan: teks.startsWith("{") ? JSON.parse(teks) : teks,
    lampu: (lampu?.p.p_lampu ?? null) as Record<string, boolean> | null,
    genesisLampu: lampu?.p.p_genesis ?? null,
    publikDipanggil: dipanggil.some((x) => x.nama === "publish_public_state_server"),
  };
}

const nyala = (m: Record<string, boolean> | null) =>
  m ? Object.keys(m).filter((k) => m[k]).sort() : null;

await (async () => {
  /* ── 1. Jejak kosong: peta lampu lengkap, semuanya mati ────────── */
  const kosong = await terbitkan([]);
  t("penerbitan berhasil", kosong.status, 200);
  t("publish_lampu_server dipanggil", kosong.lampu !== null, true);
  t("tidak ada lampu menyala di venue kosong", nyala(kosong.lampu), []);
  t("dunia data ikut dikirim", kosong.genesisLampu, GENESIS.at);

  const kunci = Object.keys(kosong.lampu ?? {});
  t("44 meja biliar dikirim ke alat", kunci.length, 44);
  t("T01 dan V04 ada di peta", [kunci.includes("T01"), kunci.includes("V04")], [true, true]);
  t("TIDAK ADA meja makan Smokehouse di peta lampu",
    kunci.filter((k) => k.startsWith("S")), []);
  t("isinya hanya benar/salah",
    [...new Set(Object.values(kosong.lampu ?? {}).map((v) => typeof v))], ["boolean"]);

  /* ── 2. Buka meja walk-in: lampunya menyala, yang lain tidak ───── */
  const buka = await terbitkan([
    ev(1, { t: "openShift", openingCash: 500_000 }, JAM),
    ev(2, { t: "walkin", tableId: "T05", guest: "Tamu uji" }, JAM + 1000),
  ]);
  t("buka meja menyalakan lampunya", nyala(buka.lampu), ["T05"]);

  /* ── 3. Meja kedua + VIP ───────────────────────────────────────── */
  const dua = await terbitkan([
    ev(1, { t: "openShift", openingCash: 500_000 }, JAM),
    ev(2, { t: "walkin", tableId: "T05", guest: "A" }, JAM + 1000),
    ev(3, { t: "walkin", tableId: "V02", guest: "B" }, JAM + 2000),
  ]);
  t("meja VIP ikut terbit", nyala(dua.lampu), ["T05", "V02"]);

  /* ── 4. Tombol lampu manual kasir ──────────────────────────────── */
  const manual = await terbitkan([
    ev(1, { t: "openShift", openingCash: 500_000 }, JAM),
    ev(2, { t: "toggleLight", tableId: "T11" }, JAM + 1000),
  ]);
  t("tombol lampu manual sampai ke alat", nyala(manual.lampu), ["T11"]);

  /* ── 4b. Tombol lampu membawa keadaan yang DILIHAT kasir ───────────
     Kasus di venue 14 Nov: layar kasir menulis "Lampu menyala" untuk
     meja yang dipakai, server mencatat mati, dan "balik keadaan" terus
     membalik ke arah yang salah. Dengan `on`, hasilnya selalu sama
     dengan yang diminta, berapa kali pun ditekan. */
  const tegas = await terbitkan([
    ev(1, { t: "openShift", openingCash: 500_000 }, JAM),
    ev(2, { t: "walkin", tableId: "T01", guest: "A" }, JAM + 1000),
    ev(3, { t: "allLights", on: false }, JAM + 2000),
    ev(4, { t: "toggleLight", tableId: "T01", on: true }, JAM + 3000),
    ev(5, { t: "toggleLight", tableId: "T01", on: true }, JAM + 4000),
  ]);
  t("tombol nyalakan dua kali tetap menyala", nyala(tegas.lampu), ["T01"]);
  const tegasMati = await terbitkan([
    ev(1, { t: "openShift", openingCash: 500_000 }, JAM),
    ev(2, { t: "walkin", tableId: "T02", guest: "A" }, JAM + 1000),
    ev(3, { t: "toggleLight", tableId: "T02", on: false }, JAM + 2000),
    ev(4, { t: "toggleLight", tableId: "T02", on: false }, JAM + 3000),
  ]);
  t("tombol matikan dua kali tetap mati", nyala(tegasMati.lampu), []);

  /* ── 5. "Nyalakan semua" ───────────────────────────────────────── */
  const semua = await terbitkan([
    ev(1, { t: "openShift", openingCash: 500_000 }, JAM),
    ev(2, { t: "allLights", on: true }, JAM + 1000),
  ]);
  t("nyalakan semua menyalakan 44 meja", nyala(semua.lampu)?.length, 44);
  t("nyalakan semua tidak menyentuh meja resto",
    (nyala(semua.lampu) ?? []).filter((k) => k.startsWith("S")), []);

  /* ── 6. "Matikan semua" sesudahnya ─────────────────────────────── */
  const padam = await terbitkan([
    ev(1, { t: "openShift", openingCash: 500_000 }, JAM),
    ev(2, { t: "allLights", on: true }, JAM + 1000),
    ev(3, { t: "allLights", on: false }, JAM + 2000),
  ]);
  t("matikan semua memadamkan semuanya", nyala(padam.lampu), []);

  /* ── 7. Penerbitan lampu gagal (schema-lampu.sql belum dijalankan).
         Ketersediaan meja di HP pelanggan TIDAK boleh ikut mati. ─── */
  const gagal = await terbitkan(
    [ev(1, { t: "openShift", openingCash: 500_000 }, JAM)],
    { lampuGagal: "function public.publish_lampu_server does not exist" },
  );
  t("gagal lampu tidak menjatuhkan penerbitan", gagal.status, 200);
  t("ringkasan publik tetap diterbitkan", gagal.publikDipanggil, true);
  t("alasannya dilaporkan apa adanya",
    String(gagal.badan.lampuGagal ?? "").includes("does not exist"), true);

  /* ── 8. Angka pemeriksa ikut dilaporkan ────────────────────────── */
  t("jumlah lampu dilaporkan", buka.badan.lampu, 44);
  t("jumlah yang menyala dilaporkan", buka.badan.lampuNyala, 1);

  console.log(bad ? `\n${bad} SALAH dari ${total}` : `\nSEMUA BENAR (${total} pemeriksaan)`);
  if (bad) process.exit(1);
})();
