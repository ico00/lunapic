import { useLayoutEffect, useState } from "react";

/**
 * Usklado s Tailwind `md` (768px). Početno `false` (mobilni layout) da SSR i
 * hidracija ne razdvajaju izlaz, zatim sinkronzacija prije oslikavanja.
 */
export function useIsMdUp(): boolean {
  const [wide, setWide] = useState(false);

  useLayoutEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const run = () => {
      setWide(m.matches);
    };
    run();
    m.addEventListener("change", run);
    return () => m.removeEventListener("change", run);
  }, []);

  return wide;
}
