type MapObserverControlStripProps = {
  observerLocationLocked: boolean;
  onSetLocationHere: () => void;
  onFocusMapOnObserver: () => void;
};

/**
 * Donji lijevi gumbi na karti: postavi promatrača u centar, fokus na promatrača.
 */
export function MapObserverControlStrip({
  observerLocationLocked,
  onSetLocationHere,
  onFocusMapOnObserver,
}: MapObserverControlStripProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end p-3">
      <div className="pointer-events-auto flex max-w-[min(100%,18rem)] flex-col gap-2 self-start rounded-lg border border-zinc-800 bg-zinc-950/90 p-2.5 text-xs shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={onSetLocationHere}
          disabled={observerLocationLocked}
          className="rounded border border-amber-700/50 bg-amber-950/40 px-2.5 py-1.5 text-left text-amber-100/90 transition hover:border-amber-500/70 hover:bg-amber-950/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Set my location here
          <span className="mt-0.5 block font-normal text-[0.7rem] text-zinc-500">
            {observerLocationLocked
              ? "location locked"
              : "current view center → observer"}
          </span>
        </button>
        <button
          type="button"
          onClick={onFocusMapOnObserver}
          className="rounded border border-zinc-600 bg-zinc-800/60 px-2.5 py-1.5 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          Focus on me
          <span className="mt-0.5 block font-normal text-[0.7rem] text-zinc-500">
            pans the map only, does not move the point
          </span>
        </button>
      </div>
    </div>
  );
}
