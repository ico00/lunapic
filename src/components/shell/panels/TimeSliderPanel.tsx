type TimeSliderPanelProps = {
  referenceEpochMs: number;
  offsetHours: number;
  onOffsetHoursChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showEphemeris: boolean;
  nearestWindowLabel: string;
};

export function TimeSliderPanel({
  referenceEpochMs,
  offsetHours,
  onOffsetHoursChange,
  showEphemeris,
  nearestWindowLabel,
}: TimeSliderPanelProps) {
  return (
    <div className="mt-5 rounded border border-zinc-800/80 bg-zinc-900/30 p-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Time (±6 h)
      </h2>
      <p
        className="mt-1.5 text-center font-mono text-sm tabular-nums text-zinc-200"
        suppressHydrationWarning
      >
        {showEphemeris
          ? new Date(referenceEpochMs).toLocaleString("en-US", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : "—"}
      </p>
      <div className="mt-2 flex items-center justify-between gap-1 text-xs text-zinc-500">
        <span>−6 h</span>
        <span>anchor</span>
        <span>+6 h</span>
      </div>
      <input
        type="range"
        min={-6}
        max={6}
        step={0.1}
        value={offsetHours}
        onChange={onOffsetHoursChange}
        disabled={!showEphemeris}
        className="mt-1 w-full accent-amber-400 disabled:opacity-40"
        aria-label="Time offset in hours from anchor"
      />
      <p className="mt-1.5 text-center text-xs text-zinc-500">
        Offset:{" "}
        <span className="font-mono text-amber-200/90">
          {offsetHours >= 0 ? "+" : ""}
          {offsetHours.toFixed(1)} h
        </span>
      </p>
      {showEphemeris && (
        <p className="mt-2 border-t border-zinc-800/80 pt-2 text-left text-[0.7rem] leading-relaxed text-zinc-500">
          {nearestWindowLabel}
        </p>
      )}
    </div>
  );
}
