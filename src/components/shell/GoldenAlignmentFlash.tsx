type GoldenAlignmentFlashProps = {
  /** Jedinstveni ključ — novi nakon udarca u „golden” zonu. */
  token: number | null;
  onAnimationEnd: () => void;
};

/**
 * Puni-ekran bljesak kad je prvi put postignut tight alignment.
 */
export function GoldenAlignmentFlash({
  token,
  onAnimationEnd,
}: GoldenAlignmentFlashProps) {
  if (token == null) {
    return null;
  }
  return (
    <div
      key={token}
      className="golden-ui-flash-overlay"
      aria-hidden
      onAnimationEnd={onAnimationEnd}
    />
  );
}
