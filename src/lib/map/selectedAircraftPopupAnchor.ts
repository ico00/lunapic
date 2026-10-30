/** Desktop: razmak kartice aviona od desnog ruba Mapbox containera, u pikselima. */
export const SELECTED_AIRCRAFT_POPUP_SCREEN_X = 16;
/** Desktop fallback dok kartica Mjeseca još nije u DOM-u (ispod nje, ~300px). */
export const SELECTED_AIRCRAFT_POPUP_SCREEN_Y = 316;

/**
 * Mjeri stvarnu visinu donje trake grupa u pikselima od dna viewporta. Koristi
 * isti element koji CSS varijabla --mobile-dock-h opisuje, ali mjeri iz DOM-a,
 * pa automatski prolazi i s pravim SAI-om.
 */
export function mobileBottomUiHeightPx(): number {
  if (typeof document === "undefined") return 72;

  const nav = document.querySelector<HTMLElement>(
    '[data-testid="mobile-primary-nav"]'
  );
  if (!nav) return 72;

  const navTop = nav.getBoundingClientRect().top;
  const dockHeightPx = window.innerHeight - navTop;

  // traka + sigurnosni razmak (8px)
  return Math.round(dockHeightPx) + 8;
}
