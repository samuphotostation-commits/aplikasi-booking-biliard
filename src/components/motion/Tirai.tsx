/**
 * PERPINDAHAN ANTAR-VENUE.
 *
 * Layar tenggelam ke dalam kabut warna tempat tujuan, alamat berganti di baliknya,
 * lalu halaman baru muncul dari kabut yang sama (lihat `masuk` di Perjalanan).
 * Bahasanya sama dengan perpindahan antar-bab, jadi antar-halaman terasa satu gerakan.
 *
 * Hanya dipakai saat berpindah dunia. Tab bawah dan alur booking tetap instan:
 * di jalur transaksi durasi di atas 400 ms dilarang (`DS-11`).
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { keAtas } from "../../lib/jamPanggung";
import { Mark } from "../UI";
import { SmokeMark } from "../Smoke";

export type Tema = "sport" | "smokehouse";

const Ctx = createContext<(ke: string, tema: Tema) => void>(() => {});
export const useTirai = () => useContext(Ctx);

const DURASI = 0.45;

export function TiraiProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const kurangi = useReducedMotion();
  const [tema, setTema] = useState<Tema | null>(null);
  const sibuk = useRef(false);

  const pergi = useCallback((ke: string, t: Tema) => {
    if (kurangi) { nav(ke); return; }
    if (sibuk.current) return;
    sibuk.current = true;
    setTema(t);
    setTimeout(() => {
      nav(ke);
      keAtas();
      setTimeout(() => { setTema(null); sibuk.current = false; }, 80);
    }, DURASI * 1000 + 40);
  }, [kurangi, nav]);

  const sport = tema === "sport";
  return (
    <Ctx.Provider value={pergi}>
      {children}
      <AnimatePresence>
        {tema && (
          <motion.div key={tema} aria-hidden
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: DURASI, ease: "easeInOut" }}
            style={{ background: sport
              ? "radial-gradient(circle at 50% 45%,#1f5a43,#07140e 75%)"
              : "radial-gradient(circle at 50% 60%,#6b3a2c,#160807 75%)" }}
            className={`fixed inset-0 z-[70] flex items-center justify-center ${sport ? "text-amber" : "text-cream"}`}>
            {sport ? <Mark size={64} /> : <SmokeMark size={64} />}
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
