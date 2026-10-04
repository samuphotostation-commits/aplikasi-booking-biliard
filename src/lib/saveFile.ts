/**
 * Menyimpan berkas hasil olahan ke perangkat pengguna.
 *
 * Dua lingkungan, satu fungsi:
 * - Di viewer Artifact claude.ai, tautan unduh biasa TIDAK bekerja; berkas
 *   harus lewat `claude.use("downloads")` yang menampilkan konfirmasi.
 * - Di hosting sendiri (Cloudflare Pages nanti), API itu tidak ada, jadi
 *   dipakai cara biasa: blob + tautan unduh.
 *
 * Dideteksi saat dipanggil, bukan dibedakan saat build — satu berkas kode
 * untuk kedua target.
 */

type SaveOutcome = "tersimpan" | "dibatalkan" | "gagal";

declare global {
  interface Window {
    claude?: {
      use?: (name: string) => Promise<{
        save?: (req: { filename: string; data: string }) => Promise<unknown>;
      } | null>;
    };
  }
}

export async function saveTextFile(
  filename: string,
  text: string,
): Promise<SaveOutcome> {
  const host = typeof window !== "undefined" ? window.claude : undefined;

  if (host?.use) {
    try {
      const downloads = await host.use("downloads");
      if (downloads?.save) {
        try {
          await downloads.save({ filename, data: text });
          return "tersimpan";
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code === "declined") return "dibatalkan";
          // CSV termasuk tipe lanjutan yang bisa saja tidak diaktifkan —
          // .txt selalu diizinkan dan isinya tetap bisa dibuka di Excel.
          if (code === "extension_not_enabled" || code === "rejected_extension") {
            try {
              await downloads.save({ filename: filename.replace(/\.\w+$/, ".txt"), data: text });
              return "tersimpan";
            } catch (e2) {
              return (e2 as { code?: string })?.code === "declined" ? "dibatalkan" : "gagal";
            }
          }
          return "gagal";
        }
      }
    } catch {
      /* jatuh ke cara biasa di bawah */
    }
  }

  // Hosting sendiri: unduhan browser biasa.
  try {
    const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return "tersimpan";
  } catch {
    return "gagal";
  }
}
