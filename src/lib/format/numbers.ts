/** Metri u sekundi → čvorovi (nautičke milje/h). */
export function mpsToKnots(mps: number): number {
  return mps * 1.943_844_492;
}

export function formatFixed(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}
