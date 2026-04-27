import { useEffect, useState } from "react";

/**
 * Nakon `true` nakon klijentskog mounta; koristiti za prikaz s `Date` / `toLocale*`
 * bez SSR/hydration mismatcha.
 */
export function useHasMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    // Namjena: prvi klijentski commit nakon SSR (izbjegavanje hydration mismatcha za Date/locale).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate; nema vanjskog sustava za useSyncExternalStore
    setM(true);
  }, []);
  return m;
}
