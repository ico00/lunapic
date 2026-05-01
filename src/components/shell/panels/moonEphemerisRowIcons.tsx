import type { SVGProps } from "react";

const rowBase =
  "h-3.5 w-3.5 shrink-0 text-yellow-400/85" as const;

type RowIconProps = SVGProps<SVGSVGElement>;

/** Elevation above the horizon */
export function MoonRowIconAltitude(props: RowIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={rowBase}
      aria-hidden
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75"
      />
    </svg>
  );
}

/** Bearing from north */
export function MoonRowIconAzimuth(props: RowIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={rowBase}
      aria-hidden
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 100-18 9 9 0 000 18z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.75v4.5M10.5 8.25L12 6.75l1.5 1.5"
      />
    </svg>
  );
}

/** Apparent angular size (radius) */
export function MoonRowIconAngularRadius(props: RowIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={rowBase}
      aria-hidden
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 100-18 9 9 0 000 18z"
      />
      <path strokeLinecap="round" d="M6 12h12" />
    </svg>
  );
}

/** Illuminated fraction of the disk */
export function MoonRowIconIlluminated(props: RowIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={rowBase}
      aria-hidden
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9 9 0 100-18 9 9 0 000 18z"
      />
      <path
        fill="currentColor"
        fillOpacity={0.28}
        stroke="none"
        d="M12 12L12 5a7 7 0 017 7h-7z"
      />
    </svg>
  );
}

/** Moonrise above the horizon */
export function MoonRowIconMoonrise(props: RowIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={rowBase}
      aria-hidden
      {...props}
    >
      <path strokeLinecap="round" d="M4 17.25h16" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 17.25V9.75m0 0l-2.25 2.25M12 9.75l2.25 2.25"
      />
    </svg>
  );
}

/** Moonset below the horizon */
export function MoonRowIconMoonset(props: RowIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={rowBase}
      aria-hidden
      {...props}
    >
      <path strokeLinecap="round" d="M4 17.25h16" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.75v7.5m0 0l-2.25-2.25M12 14.25l2.25-2.25"
      />
    </svg>
  );
}
