/** DOM za Mapbox `Marker` promatrača (kamera). */
export function createObserverMarkerElement(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", "Observer (fixed shooting point)");
  wrap.className =
    "flex h-12 w-12 -translate-x-1/2 items-end justify-center pb-0.5";
  const disc = document.createElement("div");
  disc.className =
    "flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-400 bg-zinc-900 text-lg shadow-lg shadow-amber-500/30";
  disc.textContent = "📷";
  wrap.appendChild(disc);
  return wrap;
}
