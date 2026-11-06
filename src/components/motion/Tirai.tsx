/**
 * TIRAI PERPINDAHAN ANTAR-VENUE.
 *
 * Halaman tidak berganti di tempat: satu lapisan menutup layar, alamat berganti
 * di baliknya, lalu lapisan itu lanjut pergi. Sport menyapu ke samping seperti
 * bola putih melintasi meja; Smokehouse naik dari bawah seperti asap.
 *
 * Hanya dipakai saat berpindah dunia. Tab bawah dan alur booking tetap instan:
 * di jalur transaksi durasi di atas 400 ms dilarang (`DS-11`).
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Ball } from "./Billiard";
import { keAtas } from "../../lib/jamPanggung";
import { Mark } from "../UI";
import { SmokeMark } from "../Smoke";

export type Tema = "sport" | "smokehouse";

const Ctx = createContext<(ke: string, tema: Tema) => void>(() => {});
export const useTirai = () => useContext(Ctx);

const DURASI = 0.5;
const EASE = [0.76, 0, 0.24, 1] as const;

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
            initial={sport ? { x: "-102%" } : { y: "102%" }}
            animate={sport ? { x: 0 } : { y: 0 }}
            exit={sport ? { x: "102%" } : { y: "-102%" }}
            transition={{ duration: DURASI, ease: EASE }}
            className={`fixed inset-0 z-[70] flex items-center justify-center ${
              sport ? "bg-[#123f2b] text-amber" : "brick-tex bg-brick text-cream"}`}>
            {sport ? (
              <>
                <motion.span className="absolute -right-6 top-1/2 -translate-y-1/2"
                  animate={{ rotate: 540 }} transition={{ duration: DURASI * 2, ease: "linear" }}>
                  <Ball n={8} size={64} color="#0B0B0C" />
                </motion.span>
                <Mark size={64} />
              </>
            ) : (
              <>
                <svg className="absolute -top-16 left-0 h-[68px] w-full text-brick" viewBox="0 0 1200 68" preserveAspectRatio="none">
                  <path fill="currentColor" d="M0 68V40c120-34 220 26 340 8s210-52 330-30 200 46 310 26 160-26 220-14v38z" />
                </svg>
                <SmokeMark size={64} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
