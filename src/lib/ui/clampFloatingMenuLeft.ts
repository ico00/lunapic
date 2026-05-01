/**
 * Pomakne `left` fiksno pozicioniranog izbornika tako da cijeli element
 * ostane unutar viewporta (npr. portal combobox uz desni rub sidebara).
 */
export function clampFloatingMenuLeft(
  leftPx: number,
  menuWidthPx: number,
  marginPx = 8
): number {
  if (typeof window === "undefined") {
    return leftPx;
  }
  const vw = window.innerWidth;
  let L = leftPx;
  if (L + menuWidthPx > vw - marginPx) {
    L = vw - menuWidthPx - marginPx;
  }
  if (L < marginPx) {
    L = marginPx;
  }
  return L;
}
