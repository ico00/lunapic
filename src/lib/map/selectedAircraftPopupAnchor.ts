/** Desktop: razmak kartice aviona od desnog ruba Mapbox containera, u pikselima. */
export const SELECTED_AIRCRAFT_POPUP_SCREEN_X = 16;
/** Desktop fallback dok kartica Mjeseca još nije u DOM-u (ispod nje, ~300px). */
export const SELECTED_AIRCRAFT_POPUP_SCREEN_Y = 316;

/**
 * Mjeri stvarnu visinu donje UI zone (dock + time ribbon + razmaci) u pikselima
 * od dna viewporta. Koristi isti dock element koji CSS varijabla --mobile-dock-h
 * opisuje, ali mjeri iz DOM-a — tako automatski prolazi i s pravim SAI-om.
 *
 * Ribbon visina (h-11 = 44px) i gap iznad doka (0.25rem ≈ 4px) su iste
 * konstante kao u --mobile-ribbon-bottom / --mobile-overlay-bottom.
 */
export function mobileBottomUiHeightPx(): number {
  if (typeof document === "undefined") return 148;

  const nav = document.querySelector<HTMLElement>(
    '[data-testid="mobile-primary-nav"]'
  );
  if (!nav) return 148;

  const navTop = nav.getBoundingClientRect().top;
  const dockHeightPx = window.innerHeight - navTop;

  // dock + gap (4px) + ribbon (44px) + sigurnosni razmak (8px)
  return Math.round(dockHeightPx) + 56;
}
