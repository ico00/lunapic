/**
 * Field / transit UI sounds (Web Audio API).
 *
 * **iOS Safari:** playback started only from a `useEffect` is usually silent
 * because it is not tied to a user gesture. Call **`primeFieldAudioFromUserGesture`**
 * synchronously from a **click** handler (e.g. when turning Field sounds on)
 * before any effect-driven beeps or hold tones.
 */

function getAudioContextCtor(): typeof AudioContext | null {
  if (globalThis.window === undefined) {
    return null;
  }
  const w = globalThis.window as unknown as {
    webkitAudioContext?: typeof AudioContext;
    AudioContext?: typeof AudioContext;
  };
  return w.webkitAudioContext ?? w.AudioContext ?? null;
}

/** Shared output graph; created and resumed from a user tap. */
let sharedAudioContext: AudioContext | null = null;

/**
 * Create (if needed) and `resume()` the shared context — **no sound**.
 * Use from any clear UI tap (e.g. **Sync**) so iOS Safari allows later Web Audio
 * from timers/effects without an audible test.
 */
export function resumeSharedAudioFromUserGesture(): void {
  const AC = getAudioContextCtor();
  if (AC == null || globalThis.window === undefined) {
    return;
  }
  if (sharedAudioContext == null) {
    sharedAudioContext = new AC();
  }
  void sharedAudioContext.resume().catch(() => {});
}

/**
 * Run inside the **same synchronous** handler as **Sounds on**.
 * Resumes the shared context and plays a short **unlock ping** so you can
 * confirm the device is not in silent mode.
 */
export function primeFieldAudioFromUserGesture(): void {
  resumeSharedAudioFromUserGesture();
  const ctx = sharedAudioContext;
  if (ctx == null) {
    return;
  }
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(659, t0);
  g.gain.setValueAtTime(0.14, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + 0.075);
}

/**
 * Short beep. Uses the **shared** context after any tap has called
 * `resumeSharedAudioFromUserGesture` / `primeFieldAudioFromUserGesture`; otherwise
 * a one-shot context (works on desktop; usually silent on iOS until primed).
 */
export function playShortBeep(
  frequencyHz: number,
  durationSec = 0.09,
  peakGain = 0.1
): void {
  if (sharedAudioContext != null && sharedAudioContext.state !== "closed") {
    void sharedAudioContext.resume().catch(() => {});
    playBeepOnContext(
      sharedAudioContext,
      frequencyHz,
      durationSec,
      peakGain
    );
    return;
  }
  const AC = getAudioContextCtor();
  if (AC == null) {
    return;
  }
  const ctx = new AC();
  void ctx.resume().catch(() => {});
  playBeepOnContext(ctx, frequencyHz, durationSec, peakGain);
  globalThis.setTimeout(() => {
    void ctx.close();
  }, Math.ceil(durationSec * 1000) + 80);
}

function playBeepOnContext(
  ctx: AudioContext,
  frequencyHz: number,
  durationSec: number,
  peakGain: number
): void {
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(frequencyHz, t0);
  g.gain.setValueAtTime(peakGain, t0);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + durationSec);
}

/**
 * Soft sustained tone while the selected aircraft stays in the moon-overlap
 * (disc-on-disc) geometry — uses the **primed** shared context only.
 */
export class MoonTransitHoldTone {
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  start(frequencyHz = 392, peakGain = 0.11): void {
    if (this.osc != null) {
      return;
    }
    const ctx = sharedAudioContext;
    if (ctx == null || ctx.state === "closed") {
      return;
    }
    void ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(frequencyHz, t0);
    g.gain.setValueAtTime(peakGain, t0);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    this.osc = o;
    this.gain = g;
  }

  stop(): void {
    if (this.osc != null) {
      try {
        this.osc.stop();
      } catch {
        /* already stopped */
      }
      this.osc.disconnect();
      this.osc = null;
    }
    if (this.gain != null) {
      this.gain.disconnect();
      this.gain = null;
    }
  }
}
