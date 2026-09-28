// Karplus-Strong style plucked string, rendered offline into a sample array. Pure:
// the audio engine copies the result into an AudioBuffer once per string.
//
// Rendering offline (instead of a live DelayNode feedback loop) avoids the Web
// Audio limit that a delay inside a cycle is at least one render quantum
// (128 frames), which caps a live loop near 345 Hz at 44.1 kHz.

export interface PluckSpec {
  freq: number;
  sampleRate: number;
  /** Time for the fundamental to fall 60 dB. */
  t60: number;
  /** Averaging blend, 0..0.5. 0.5 is the classic two-point average (darker). */
  brightness: number;
  /** Where the string is plucked, as a fraction of its length (0..1). */
  pluckPoint: number;
  /** Share of noise in the excitation, 0..1. */
  noiseMix: number;
  /** Uniform random source in [0, 1). */
  rng: () => number;
}

export function renderPluck({
  freq,
  sampleRate,
  t60,
  brightness,
  pluckPoint,
  noiseMix,
  rng,
}: PluckSpec): Float32Array {
  const period = sampleRate / freq;
  const total = Math.ceil(sampleRate * t60 * 1.05);
  const out = new Float32Array(total);

  // Excitation: one period of the string's starting shape — a triangle peaked
  // at the pluck point, which gives harmonics falling as 1/n² with a strong
  // fundamental — plus some lowpassed noise so no two strings share a timbre.
  // Pure noise (classic Karplus-Strong) leaves the harmonic balance to chance:
  // measured on the G3 string, the 6th harmonic came out louder than the note.
  const burst = Math.ceil(period) + 2;
  let lp = 0;
  let mean = 0;
  for (let n = 0; n < burst && n < total; n += 1) {
    const x = (n / period) % 1;
    const triangle = x < pluckPoint ? x / pluckPoint : (1 - x) / (1 - pluckPoint);
    lp += 0.5 * (rng() * 2 - 1 - lp);
    out[n] = (1 - noiseMix) * (2 * triangle - 1) + noiseMix * lp;
    mean += out[n] / burst;
  }
  // The loop's gain at 0 Hz is almost 1, so any offset in the burst would ring
  // as long as the note does. Remove it.
  for (let n = 0; n < burst && n < total; n += 1) out[n] -= mean;

  // Loop: out[n] = g · ((1−b)·out[n−D] + b·out[n−D−1]). The blend adds `b`
  // samples of delay, so D = period − b keeps the pitch in tune. D is
  // fractional; the taps are read with linear interpolation.
  const b = Math.min(0.5, Math.max(0, brightness));
  const delay = period - b;
  const gain = 10 ** (-3 / (freq * t60));
  for (let n = burst; n < total; n += 1) {
    const pos = n - delay;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const near = out[i0] * (1 - frac) + out[i0 + 1] * frac;
    const far = out[i0 - 1] * (1 - frac) + out[i0] * frac;
    out[n] = gain * ((1 - b) * near + b * far);
  }

  // DC blocker (one-pole highpass, ~30 Hz) for what the burst fix leaves.
  let prevIn = 0;
  let prevOut = 0;
  const r = 1 - (2 * Math.PI * 30) / sampleRate;
  for (let n = 0; n < total; n += 1) {
    const x = out[n];
    prevOut = x - prevIn + r * prevOut;
    prevIn = x;
    out[n] = prevOut;
  }

  // Normalize, then fade the tail so the buffer ends at zero.
  let peak = 0;
  for (let n = 0; n < total; n += 1) peak = Math.max(peak, Math.abs(out[n]));
  const norm = peak > 0 ? 1 / peak : 1;
  const fade = Math.min(total, Math.floor(sampleRate * 0.08));
  for (let n = 0; n < total; n += 1) {
    const tail = n > total - fade ? (total - n) / fade : 1;
    out[n] *= norm * tail;
  }
  return out;
}
