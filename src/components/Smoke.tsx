/**
 * LAMBANG SMOKEHOUSE — asap & gelas, BUKAN bola biliar.
 *
 * Koreksi pemilik 12 Okt 2026: *"untuk Smokehouse masih terlihat sama persis
 * seperti SPL Sport (biliar) karena logonya juga bola biliar di pesanan"*.
 *
 * Bentuknya mengikuti ikon yang sudah dipakai di sampul buku menu Smokehouse
 * milik pemilik sendiri: piring beruap di sebelah gelas koktail. Jadi ini
 * bukan lambang karangan — ini lambang yang memang sudah dipakai venue,
 * tinggal digambar ulang sebagai SVG supaya bisa diwarnai dan diperbesar
 * tanpa pecah.
 */
export function SmokeMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}
      aria-hidden="true" focusable="false">
      {/* Uap dari piring */}
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M14 30c0-3 2.6-3.4 2.6-6.4S14 19 14 16" />
        <path d="M21 30c0-3 2.6-3.4 2.6-6.4S21 19 21 16" />
        <path d="M28 30c0-3 2.6-3.4 2.6-6.4S28 19 28 16" />
      </g>
      {/* Piring */}
      <path d="M6 36h34l-4.5 6a5 5 0 0 1-4.1 2.1H14.6A5 5 0 0 1 10.5 42z"
        fill="currentColor" />
      <rect x="4" y="33" width="38" height="3.2" rx="1.6" fill="currentColor" />
      {/* Gelas koktail */}
      <path d="M44 22h18L53 35z" fill="currentColor" />
      <rect x="51.6" y="34" width="2.8" height="10" rx="1.4" fill="currentColor" />
      <rect x="45" y="43" width="16" height="3" rx="1.5" fill="currentColor" />
      <circle cx="59" cy="19.5" r="3" fill="currentColor" />
    </svg>
  );
}

/** Ikon kecil untuk keadaan kosong & penanda di layar resto. */
export function IkonResto({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      className="mx-auto" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {/* Garpu */}
        <path d="M9 5v7a3 3 0 0 0 3 3v12" />
        <path d="M12 5v6M15 5v7" />
        {/* Pisau */}
        <path d="M23 5c2 3 2 7 0 10v12" />
      </g>
    </svg>
  );
}
