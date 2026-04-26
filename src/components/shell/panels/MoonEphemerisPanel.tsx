import { formatFixed } from "@/lib/format/numbers";
import type { MoonState } from "@/types/moon";

type MoonEphemerisPanelProps = {
  moon: MoonState;
  /** Vrijednost prikaza ili "—" dok ephemeris nije spreman. */
  display: (v: string) => string;
};

export function MoonEphemerisPanel({ moon, display }: MoonEphemerisPanelProps) {
  return (
    <>
      <h2 className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Moon (nowcast)
      </h2>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt>Altitude</dt>
          <dd className="font-mono tabular-nums">
            {display(formatFixed(moon.altitudeDeg))}°
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Azimuth (N)</dt>
          <dd className="font-mono tabular-nums">
            {display(formatFixed(moon.azimuthDeg))}°
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Angular radius</dt>
          <dd className="font-mono tabular-nums">
            {display(formatFixed(moon.apparentRadius.degrees, 3))}°
          </dd>
        </div>
      </dl>
    </>
  );
}
