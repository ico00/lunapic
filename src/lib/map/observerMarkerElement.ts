/** DOM za Mapbox `Marker` promatrača (kamera).
 * Anchor je "center" — element mora biti simetričan oko svoje koordinate. */
export function createObserverMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Observer (fixed shooting point)");
  // Promatrač je stanica na dijagramu: prsten u boji promatrača s točkom u sredini.
  // Točka je <span> (ne <div>) jer useMoonTransitMap prvi <div> unutar markera
  // koristi kao disk za "golden" nišan.
  el.className =
    "flex h-8 w-8 items-center justify-center rounded-full border-[4px] border-[color:var(--observer)] bg-[color:var(--ground)]";
  const dot = document.createElement("span");
  dot.className = "block h-2 w-2 rounded-full bg-[color:var(--observer)]";
  dot.setAttribute("aria-hidden", "true");
  el.appendChild(dot);
  return el;
}
