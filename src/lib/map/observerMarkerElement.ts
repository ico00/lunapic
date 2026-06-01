/** DOM za Mapbox `Marker` promatrača (kamera).
 * Anchor je "center" — element mora biti simetričan oko svoje koordinate. */
export function createObserverMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Observer (fixed shooting point)");
  el.className =
    "flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-400 bg-zinc-900 text-lg shadow-lg shadow-amber-500/30";
  el.textContent = "📷";
  return el;
}
