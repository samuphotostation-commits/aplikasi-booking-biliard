/* ═══════════════════════════════════════════════════════════════════
   KERTAS DAPUR DAN DATA MEMBER

   Yang dijaga: satu kali pesan keluar satu kertas, pesanan tidak tercetak
   dua kali, catatan tamu tidak bisa menyusupkan HTML, dan tanggal lahir
   yang mustahil ditolak.
   ═══════════════════════════════════════════════════════════════════ */
import type { Ticket } from "../src/data/live";
import { htmlKertas, kelompokkan, kunciTiket, perluDicetak } from "../src/lib/cetakDapur";
import { domisiliLengkap, keIso, rapikanTanggal, dariIso } from "../src/lib/dataMember";

let gagal = 0;
const uji = (nama: string, benar: boolean) => {
  console.log(`  ${benar ? "OK" : "SALAH"}  ${nama}`);
  if (!benar) gagal++;
};

const JAM = 3_600_000;
const kini = 1_800_000_000_000;
const t = (x: Partial<Ticket>): Ticket => ({
  id: "tk1", sessionId: "s1", tableName: "Meja 7", itemId: "i1", name: "Ayam Bakar", qty: 1,
  station: "kitchen", status: "new", at: kini, ...x,
});

console.log("\nKertas dapur");
const a = t({ itemId: "i1" });
const b = t({ id: "tk2", itemId: "i2", name: "Nasi", qty: 2 });
const lain = t({ id: "tk3", itemId: "i3", at: kini + 60_000 });
const minum = t({ id: "tk4", itemId: "i4", station: "bar", name: "Es Teh" });
const k = kelompokkan([lain, a, b, minum]);
uji("satu kali pesan untuk satu bagian jadi satu kertas", k.length === 3 && k[0].item.length === 2);
uji("makanan dan minuman terpisah", k.some((x) => x.bagian === "bar" && x.item.length === 1));
uji("kertas paling lama di depan", k[0].at === kini && k[k.length - 1].at === kini + 60_000);

const sudah = new Set([kunciTiket(a)]);
const antre = perluDicetak([a, b], sudah, kini);
uji("tiket yang sudah tercetak tidak keluar lagi", antre.length === 1 && antre[0].id === "tk2");
uji("nomor tiket berubah tidak membuat cetak ganda", kunciTiket({ ...a, id: "tk99" }) === kunciTiket(a));
uji("tiket yang sudah diterima dapur tidak dicetak otomatis",
  perluDicetak([t({ status: "preparing" })], new Set(), kini).length === 0);
uji("tiket basi tidak dicetak saat komputer baru menyala",
  perluDicetak([t({ at: kini - 3 * JAM })], new Set(), kini).length === 0);

const html = htmlKertas({ bagian: "kitchen", meja: "<b>Meja</b>", at: kini, item: [t({ note: "<img src=x onerror=y>", qty: 2 })] });
uji("catatan tamu tidak menjadi HTML", !html.includes("<img") && html.includes("&lt;img"));
uji("nama meja tidak menjadi HTML", html.includes("&lt;b&gt;Meja"));
uji("ada kotak centang", html.includes('class="c"'));
uji("cetak ulang diberi tanda", htmlKertas(k[0], { ulang: true }).includes("CETAK ULANG"));

console.log("\nData member");
const sekarang = new Date("2026-11-06");
uji("angka diketik jadi format tanggal", rapikanTanggal("17081995") === "17/08/1995");
uji("ketikan sebagian tetap terbaca", rapikanTanggal("170") === "17/0");
uji("tanggal sah jadi ISO", keIso("17/08/1995", sekarang) === "1995-08-17");
uji("31 Februari ditolak", keIso("31/02/1995", sekarang) === null);
uji("tanggal masa depan ditolak", keIso("01/01/2030", sekarang) === null);
uji("usia tidak masuk akal ditolak", keIso("01/01/1900", sekarang) === null);
uji("ISO kembali ke tampilan", dariIso("1995-08-17") === "17/08/1995");
uji("kecamatan Padang sah", domisiliLengkap("Padang Barat"));
uji("luar Padang wajib menyebut kota", !domisiliLengkap("Luar Padang · ") && domisiliLengkap("Luar Padang · Solok"));
uji("isian kosong ditolak", !domisiliLengkap(""));

// Laporan 7 Nov 2026: hitungan usia harus sama dengan server (usia penuh).
const kini7nov = new Date(2026, 10, 7);
uji("genap 10 tahun hari ini diterima", keIso("07/11/2016", kini7nov) === "2016-11-07");
uji("10 tahun kurang sehari ditolak seperti di server", keIso("08/11/2016", kini7nov) === null);
uji("isi otomatis browser TTTT-BB-HH dirapikan", rapikanTanggal("1995-08-17") === "17/08/1995");

console.log(gagal ? `\n${gagal} SALAH` : "\nSEMUA BENAR (cetak dapur & data member)");

if (gagal) process.exit(1);

