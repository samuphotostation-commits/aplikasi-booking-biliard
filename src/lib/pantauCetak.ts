/**
 * CETAK OTOMATIS KE DAPUR DAN BAR.
 *
 * Dipasang di kerangka panel, bukan di layar Dapur: pesanan harus tetap keluar
 * walau komputer dapur sedang membuka tab lain.
 */
import { useEffect, useRef } from "react";
import type { Ticket } from "../data/live";
import { cetakOtomatis, cetakSenyapMungkin, cetakKertas, printerBagian, tandaiTercetak, tiketTercetak } from "./cetak";
import { htmlKertas, kelompokkan, kunciTiket, perluDicetak } from "./cetakDapur";

const JEDA_ULANG_MS = 30_000;

/** Pesan gagal terakhir, dibaca layar Dapur. */
let galat: string | null = null;
export const galatCetakDapur = () => galat;

export function usePantauCetak(tiket: Ticket[], masuk: boolean, tick: number) {
  const sibuk = useRef(false);
  const jedaSampai = useRef(0);

  useEffect(() => {
    if (!masuk || !cetakOtomatis() || !cetakSenyapMungkin() || sibuk.current) return;
    const kini = Date.now();
    if (kini < jedaSampai.current) return;
    // Hanya bagian yang printernya dipilih di komputer ini, supaya komputer dapur
    // dan bar masing-masing mencetak bagiannya sendiri.
    const antre = perluDicetak(tiket, tiketTercetak(), kini).filter((t) => printerBagian(t.station));
    if (antre.length === 0) return;

    sibuk.current = true;
    void (async () => {
      for (const k of kelompokkan(antre)) {
        const r = await cetakKertas(htmlKertas(k), k.bagian);
        if (!r.ok) {
          galat = `Tiket ${k.meja} gagal dicetak: ${r.alasan ?? "printer tidak menjawab"}. Dicoba lagi otomatis.`;
          jedaSampai.current = Date.now() + JEDA_ULANG_MS;
          break;
        }
        galat = null;
        tandaiTercetak(k.item.map(kunciTiket));
      }
      sibuk.current = false;
    })();
  }, [tiket, masuk, tick]);
}
