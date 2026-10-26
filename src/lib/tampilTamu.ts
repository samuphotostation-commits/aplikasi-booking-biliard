/**
 * LAYAR MENGHADAP TAMU — saluran kecil antara layar kasir dan monitor kedua.
 *
 * MASALAH YANG DIPERBAIKI: QR dinamis cuma muncul di layar kasir, yang
 * menghadap ke dalam. Tamu harus menunduk melewati meja untuk memindainya,
 * atau kasir memutar laptopnya tiap transaksi. Sekarang ada jendela kedua
 * (rute `/tampil`) untuk monitor/tablet yang menghadap tamu: QR besar,
 * nominalnya, dan berubah sendiri jadi LUNAS.
 *
 * KENAPA LEWAT BroadcastChannel, bukan server: kedua layar ada di KOMPUTER
 * YANG SAMA. Melewatkan datanya ke internet hanya menambah jeda, menambah
 * satu hal yang bisa gagal saat jaringan mati, dan membuat nominal tagihan
 * tamu melintasi jaringan tanpa alasan. localStorage ikut dipakai supaya
 * jendela tamu yang baru dibuka langsung tahu keadaan terakhir, bukan kosong
 * sampai transaksi berikutnya.
 *
 * Isinya sengaja seminimal mungkin: tidak ada nama tamu, nomor HP, atau
 * rincian pesanan — monitor ini menghadap ruangan dan dilihat siapa saja.
 */

export type TampilTamu =
  | { jenis: "diam" }
  | { jenis: "qr"; qrString: string; nominal: number; ringkas: string }
  | { jenis: "lunas"; nominal: number }
  | { jenis: "gagal"; pesan: string };

const SALURAN = "spl:tampil-tamu";
const K_TERAKHIR = "spl:v1:tampil-tamu";

const kanal = (): BroadcastChannel | null => {
  try { return new BroadcastChannel(SALURAN); } catch { return null; }
};

/** Keadaan terakhir, supaya jendela yang baru dibuka tidak kosong. */
export function tampilTerakhir(): TampilTamu {
  try {
    const t = window.localStorage.getItem(K_TERAKHIR);
    return t ? (JSON.parse(t) as TampilTamu) : { jenis: "diam" };
  } catch { return { jenis: "diam" }; }
}

export function kirimTampil(isi: TampilTamu) {
  try { window.localStorage.setItem(K_TERAKHIR, JSON.stringify(isi)); } catch { /* mode privat */ }
  const c = kanal();
  if (!c) return;
  try { c.postMessage(isi); } finally { c.close(); }
}

/** Dengarkan perubahan. Mengembalikan fungsi untuk berhenti mendengarkan. */
export function dengarTampil(fn: (isi: TampilTamu) => void): () => void {
  const c = kanal();
  const onPesan = (e: MessageEvent) => fn(e.data as TampilTamu);
  c?.addEventListener("message", onPesan);
  // Cadangan untuk peramban tanpa BroadcastChannel: localStorage tetap
  // memberi tahu tab lain lewat event `storage`.
  const onSimpan = (e: StorageEvent) => {
    if (e.key !== K_TERAKHIR || !e.newValue) return;
    try { fn(JSON.parse(e.newValue) as TampilTamu); } catch { /* abaikan isi rusak */ }
  };
  window.addEventListener("storage", onSimpan);
  return () => {
    c?.removeEventListener("message", onPesan);
    c?.close();
    window.removeEventListener("storage", onSimpan);
  };
}

/** Buka jendela layar tamu. Dipanggil kasir sekali, lalu digeser ke monitor kedua. */
export function bukaJendelaTamu() {
  const url = `${window.location.origin}${window.location.pathname}#/tampil`;
  window.open(url, "spl-tampil", "width=900,height=700");
}
