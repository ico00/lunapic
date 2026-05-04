import type { CSSProperties } from "react";

/**
 * Top-down aircraft from `public/plane_5367346.svg`, rendered as a solid black silhouette
 * for the viewfinder preview (nose points right after −90° rotation).
 */
type ViewfinderAircraftSilhouetteProps = {
  className?: string;
  style?: CSSProperties;
};

export function ViewfinderAircraftSilhouette({
  className,
  style,
}: ViewfinderAircraftSilhouetteProps) {
  return (
    <svg
      viewBox="0 0 283.46 283.46"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <g
        transform="rotate(-90 141.73 141.73)"
        fill="#0a0a0a"
        stroke="none"
      >
        <path d="M85.89,106.67h13.89v28.65h-13.89s0-28.65,0-28.65Z" />
        <path d="M46,139.95h13.89v28.65h-13.89v-28.65Z" />
        <path d="M197.51,135.25h-13.89v-28.65h13.89v28.65Z" />
        <path d="M237.47,168.66h-13.89v-28.65h13.89v28.65Z" />
        <path d="M133.93,223.04l-41.09,33.28v16.41l41.09-14.62v-35.07h0Z" />
        <path d="M133.93,88.54L10.73,189.1v18.13l123.19-52.66v-66.03h0Z" />
        <path d="M149.54,223.04l41.09,33.28v16.41l-41.09-14.62v-35.07h0Z" />
        <path d="M149.54,88.54l123.19,100.57v18.13l-123.19-52.66v-66.03h0Z" />
        <path d="M141.73,10.73c-13.96,6.02-25.14,26.99-25.14,63.98,0,31.82,11.38,152.9,14.56,186.05.46,4.76,5.09,8.4,10.59,8.4s10.12-3.64,10.59-8.4c3.18-33.15,14.56-154.22,14.56-186.05,0-36.98-11.18-57.96-25.14-63.98h-.02Z" />
        <path d="M125.92,52.22c-2.58,6.75-4.1,15.15-4.1,24.28,0,1.65.07,3.24.13,4.83.53-9.39,2.78-17.8,5.95-24.08,0,0-1.98-5.03-1.98-5.03Z" />
        <path d="M152.72,52.81l2.38-5.95c-3.51-6.48-8.2-10.39-13.36-10.39s-9.86,3.97-13.36,10.39l2.38,5.95c3.18-4.23,6.95-6.68,10.98-6.68s7.87,2.51,10.98,6.68Z" />
        <path d="M157.54,52.22l-2.05,5.09c3.24,6.22,5.43,14.62,5.95,24.08,0-1.59.13-3.18.13-4.83,0-9.13-1.46-17.6-4.04-24.35h0Z" />
      </g>
    </svg>
  );
}
