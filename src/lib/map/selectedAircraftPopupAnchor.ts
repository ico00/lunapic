/** Pikseli od gornjeg lijevog kuta Mapbox containera (HUD je u headeru shella). */
export const SELECTED_AIRCRAFT_POPUP_SCREEN_X = 16;
/** Dovoljno ispod brand pill + safe-area-inset-top (~80px pill + 16px gap). */
export const SELECTED_AIRCRAFT_POPUP_SCREEN_Y = 100;

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
