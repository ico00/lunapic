/**
 * Short UI beeps for field / transit timing (Web Audio API).
 * Call only from client effects or handlers after a user gesture when possible
 * (mobile Safari may block audio until interaction).
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

export function playShortBeep(
  frequencyHz: number,
  durationSec = 0.09,
  peakGain = 0.1
): void {
  const AC = getAudioContextCtor();
  if (AC == null) {
    return;
  }
  const ctx = new AC();
  void ctx.resume().catch(() => {});
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(frequencyHz, ctx.currentTime);
  g.gain.setValueAtTime(peakGain, ctx.currentTime);
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + durationSec);
  o.onended = () => {
    void ctx.close();
  };
}

/**
 * Soft sustained tone while the selected aircraft stays in the moon-overlap
 * (disc-on-disc) geometry — “look up now” cue.
 */
export class MoonTransitHoldTone {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  start(frequencyHz = 392, peakGain = 0.055): void {
    if (this.osc != null) {
      return;
    }
    const AC = getAudioContextCtor();
    if (AC == null) {
      return;
    }
    const ctx = new AC();
    this.ctx = ctx;
    void ctx.resume().catch(() => {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(frequencyHz, ctx.currentTime);
    g.gain.setValueAtTime(peakGain, ctx.currentTime);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
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
    if (this.ctx != null) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
