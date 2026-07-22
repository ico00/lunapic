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
 * Short noise burst simulating VHF squelch opening.
 * Bandpass-filtered white noise, decays quickly.
 */
function playSquelch(ctx: AudioContext, t0: number, gain = 0.18, durationSec = 0.04): void {
  const sampleRate = ctx.sampleRate;
  const frameCount = Math.ceil(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  // Narrow bandpass around 1.8 kHz — radio telephone character
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1800, t0);
  bp.Q.setValueAtTime(0.6, t0);

  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);

  src.connect(bp);
  bp.connect(g);
  g.connect(ctx.destination);
  src.start(t0);
}

/**
 * Single ATC-style radio beep through a bandpass filter (narrow radio bandwidth).
 * Squelch burst → tone.
 */
function playAtcBeep(ctx: AudioContext, t0: number, freqHz: number, durationSec: number, gain: number): void {
  const osc = ctx.createOscillator();
  const bp = ctx.createBiquadFilter();
  const g = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freqHz, t0);

  // Bandpass mimics the ~300–3400 Hz telephone/radio response
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1200, t0);
  bp.Q.setValueAtTime(0.5, t0);

  // Hard key-up attack, hard key-down release
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
  g.gain.setValueAtTime(gain, t0 + durationSec - 0.01);
  g.gain.linearRampToValueAtTime(0, t0 + durationSec);

  osc.connect(bp);
  bp.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.01);
}

// ---------------------------------------------------------------------------
// Custom sound file loader
// Drop MP3/OGG/WAV files into public/sounds/:
//   candidate-alert.mp3   → plays when a new transit candidate appears
//   active-transit-alert.mp3 → plays when aircraft crosses the moon disc
// If a file is missing or fails to load, synthesised ATC sounds are used.
// ---------------------------------------------------------------------------

const BASE_PATH = (
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
    : ""
);

const soundCache = new Map<string, AudioBuffer | null>();

async function loadSoundBuffer(ctx: AudioContext, filename: string): Promise<AudioBuffer | null> {
  const cached = soundCache.get(filename);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`${BASE_PATH}/sounds/${filename}`);
    if (!res.ok) { soundCache.set(filename, null); return null; }
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    soundCache.set(filename, audioBuffer);
    return audioBuffer;
  } catch {
    soundCache.set(filename, null);
    return null;
  }
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer, gain = 1): void {
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = buffer;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  src.connect(g);
  g.connect(ctx.destination);
  src.start(ctx.currentTime);
}

function getActiveContext(): AudioContext | null {
  if (sharedAudioContext != null && sharedAudioContext.state !== "closed") {
    void sharedAudioContext.resume().catch(() => {});
    return sharedAudioContext;
  }
  const AC = getAudioContextCtor();
  if (AC == null) return null;
  const ctx = new AC();
  void ctx.resume().catch(() => {});
  // Auto-close one-shot context after 1 s
  globalThis.setTimeout(() => void ctx.close().catch(() => {}), 1000);
  return ctx;
}

/**
 * ATC radio-style alert — squelch burst + single 1000 Hz beep (~220 ms).
 * If public/sounds/candidate-alert.mp3 exists, plays that file instead.
 */
export function playTransitCandidateAlert(): void {
  const ctx = getActiveContext();
  if (ctx == null) return;
  void loadSoundBuffer(ctx, "candidate-alert.mp3").then((buf) => {
    if (buf) { playBuffer(ctx, buf); return; }
    const t0 = ctx.currentTime;
    playSquelch(ctx, t0, 0.18, 0.035);
    playAtcBeep(ctx, t0 + 0.03, 1000, 0.19, 0.28);
  });
}

/**
 * ATC radio-style urgent alert — squelch burst + double beep (~120 ms each).
 * If public/sounds/active-transit-alert.mp3 exists, plays that file instead.
 */
export function playActiveTransitAlert(): void {
  const ctx = getActiveContext();
  if (ctx == null) return;
  void loadSoundBuffer(ctx, "active-transit-alert.mp3").then((buf) => {
    if (buf) { playBuffer(ctx, buf); return; }
    const t0 = ctx.currentTime;
    playSquelch(ctx, t0, 0.22, 0.03);
    playAtcBeep(ctx, t0 + 0.025, 1200, 0.115, 0.32);
    playAtcBeep(ctx, t0 + 0.175, 1200, 0.115, 0.32);
  });
}

/**
 * ~14 s spoken countdown (public/sounds/countdown.wav) — played once when the
 * selected aircraft is 10 s from azimuth alignment. Prefers the **shared**
 * (primed) context, which is never auto-closed; a one-shot fallback context is
 * closed after the buffer's own duration (not the short 1 s used for beeps),
 * since this clip is much longer than the alert sounds above.
 */
export function playCountdownAlert(): void {
  const shared = sharedAudioContext != null && sharedAudioContext.state !== "closed";
  const ctx = shared ? sharedAudioContext : getAudioContextCtor() != null ? new (getAudioContextCtor() as typeof AudioContext)() : null;
  if (ctx == null) return;
  void ctx.resume().catch(() => {});
  void loadSoundBuffer(ctx, "countdown.wav").then((buf) => {
    if (buf == null) {
      if (!shared) void ctx.close().catch(() => {});
      return;
    }
    playBuffer(ctx, buf);
    if (!shared) {
      globalThis.setTimeout(() => void ctx.close().catch(() => {}), Math.ceil(buf.duration * 1000) + 200);
    }
  });
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
