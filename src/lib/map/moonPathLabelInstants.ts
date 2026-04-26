/**
 * Trenutci za `symbol` etikete duž luka: `t0` (izlaz), mreža `t0 + k*step` unutar (t0, t1),
 * te `t1` (zlaz) kad ne pada na mrežu — inače zadnja točka nikad nije točan moonset.
 */
export function getMoonPathLabelInstants(
  t0Ms: number,
  t1Ms: number,
  stepMs: number
): number[] {
  if (t1Ms < t0Ms) {
    return [];
  }
  const out: number[] = [t0Ms];
  for (let t = t0Ms + stepMs; t < t1Ms; t += stepMs) {
    out.push(t);
  }
  if (out[out.length - 1]! !== t1Ms) {
    out.push(t1Ms);
  }
  return out;
}
