/**
 * Menggambar isi QRIS menjadi kode QR di layar SPL sendiri.
 *
 * Tamu tidak perlu pindah ke halaman gateway: isi QRIS (`payload`) dikirim
 * server lewat `qris-buat`, lalu digambar di sini. Tidak ada layanan luar yang
 * ikut melihat kodenya — penggambarannya terjadi di HP tamu.
 */
import { useMemo } from "react";
import qrcode from "qrcode-generator";

export function QrGambar({ payload, size = 216 }: { payload: string; size?: number }) {
  const { path, jumlah } = useMemo(() => {
    // typeNumber 0 = biarkan pustaka memilih ukuran terkecil yang muat.
    // Level "M" adalah yang dipakai standar QRIS.
    const qr = qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let baris = 0; baris < n; baris++) {
      for (let kolom = 0; kolom < n; kolom++) {
        if (qr.isDark(baris, kolom)) d += `M${kolom} ${baris}h1v1h-1z`;
      }
    }
    return { path: d, jumlah: n };
  }, [payload]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`-1 -1 ${jumlah + 2} ${jumlah + 2}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Kode QRIS pembayaran"
      className="rounded-lg bg-white p-1"
    >
      <rect x={-1} y={-1} width={jumlah + 2} height={jumlah + 2} fill="#ffffff" />
      <path d={path} fill="#0b0b0c" />
    </svg>
  );
}
