/* ═══════════════════════════════════════════════════════════════════
   PEMBERITAHUAN — SPL-5

   Yang diuji di sini SATU aturan saja, tapi aturan inilah yang menentukan
   fitur ini dipakai atau dimatikan orang di hari pertama:

     Layar yang baru dibuka TIDAK BOLEH mengabarkan apa pun.

   Dapur yang dibuka jam delapan malam punya dua puluh tiket di layarnya.
   Kalau semuanya berbunyi saat layar dibuka, suaranya akan dimatikan
   selamanya — dan sesudah itu pesanan yang benar-benar baru pun tidak
   terdengar. Jadi daftar pertama disemai diam-diam.

   Bunyi & kotak notifikasinya sendiri tidak diuji di sini: keduanya milik
   peramban (AudioContext & Notification), dan menirunya hanya akan menguji
   tiruannya.
   ═══════════════════════════════════════════════════════════════════ */
import { yangBaru } from "../src/lib/pantauKabar";

let bad = 0, total = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  total++; if (!ok) bad++;
  console.log((ok ? "  OK  " : "FAIL  ") + label + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const peta = (...ids: string[]) => new Map(ids.map((id) => [id, { id }] as const));
const nama = (xs: { id: string }[]) => xs.map((x) => x.id);

console.log("-- Semaian pertama diam --");
{
  const simpan = { current: null as Set<string> | null };
  t("tiga tiket yang sudah ada tidak dikabarkan", nama(yangBaru(simpan, peta("a", "b", "c"))), []);
  t("tapi ketiganya diingat", [...(simpan.current ?? [])].sort(), ["a", "b", "c"]);
}

console.log("\n-- Sesudah disemai, hanya yang benar-benar baru --");
{
  const simpan = { current: null as Set<string> | null };
  yangBaru(simpan, peta("a", "b"));
  t("satu tiket baru", nama(yangBaru(simpan, peta("a", "b", "c"))), ["c"]);
  t("dipanggil lagi tanpa perubahan: diam", nama(yangBaru(simpan, peta("a", "b", "c"))), []);
  t("dua sekaligus", nama(yangBaru(simpan, peta("a", "b", "c", "d", "e"))), ["d", "e"]);
}

console.log("\n-- Yang hilang dilupakan, dan kembali dianggap baru --");
{
  const simpan = { current: null as Set<string> | null };
  yangBaru(simpan, peta("a", "b"));
  // Tiket "b" selesai dan hilang dari daftar menunggu.
  t("yang hilang tidak dikabarkan", nama(yangBaru(simpan, peta("a"))), []);
  t("yang hilang dilupakan", [...(simpan.current ?? [])], ["a"]);
  // Dilupakan itu memang disengaja: himpunan yang tumbuh selamanya akan
  // membesar sepanjang malam. Akibatnya, id yang dipakai ulang akan
  // dikabarkan lagi — dan itu benar: tiket dengan id itu memang muncul lagi.
  t("muncul lagi dianggap baru", nama(yangBaru(simpan, peta("a", "b"))), ["b"]);
}

console.log("\n-- Daftar kosong --");
{
  const simpan = { current: null as Set<string> | null };
  t("semaian dari kosong", nama(yangBaru(simpan, peta())), []);
  t("lalu satu masuk", nama(yangBaru(simpan, peta("x"))), ["x"]);
  t("lalu kosong lagi", nama(yangBaru(simpan, peta())), []);
  t("tidak ada sisa yang diingat", [...(simpan.current ?? [])], []);
}

console.log(bad === 0 ? `\nSEMUA BENAR (${total} pemeriksaan)` : `\n${bad} DARI ${total} GAGAL`);
if (bad > 0) process.exit(1);
