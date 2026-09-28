// fields.ts
// Procedural surrounds — pure seeded layout data, no DOM. Two families:
// WITHIN (the field inside the gateway arch, behind the strings) and BEYOND
// (the space outside it). CHIME renders stars within and void beyond; the
// other options are kept as candidates.

import { seededRng } from './seed';

export const WITHIN_OPTIONS = ['rain', 'stars', 'fog'] as const;
export type WithinId = (typeof WITHIN_OPTIONS)[number];

export const BEYOND_OPTIONS = ['void', 'dunes'] as const;
export type BeyondId = (typeof BEYOND_OPTIONS)[number];

export const DEFAULT_WITHIN: WithinId = 'rain';
export const DEFAULT_BEYOND: BeyondId = 'void';

// ── Signal rain (the sketch's hatching, literally) ──────────────────────────

export interface Streak {
  x: number;
  y: number;
  len: number;
  width: number;
  opacity: number;
}

/** Diagonal streaks filling one tile band of `w`×`h`; the band is duplicated
 *  above itself and drifted by exactly `h` for a seamless loop. */
export function makeStreaks(seed: string, count: number, w: number, h: number): Streak[] {
  const rng = seededRng(`${seed}:streaks`);
  return Array.from({ length: count }, () => ({
    x: rng() * w,
    y: rng() * h,
    len: 14 + rng() * 26,
    width: rng() < 0.25 ? 2 : 1.3,
    opacity: 0.16 + rng() * 0.3,
  }));
}

// ── Starfield (the gate opens onto somewhere deep) ───────────────────────────

export interface Star {
  x: number;
  y: number;
  r: number;
  opacity: number;
  /** Twinkle offset, seconds. */
  delay: number;
  /** Slow twinklers read as farther away. */
  slow: boolean;
}

export function makeStars(seed: string, count: number, w: number, h: number): Star[] {
  const rng = seededRng(`${seed}:stars`);
  return Array.from({ length: count }, () => ({
    x: rng() * w,
    y: rng() * h,
    r: 0.7 + rng() * 1.5,
    opacity: 0.25 + rng() * 0.55,
    delay: rng() * 6,
    slow: rng() < 0.4,
  }));
}

// ── Fog (weather pooling at the doorway) ─────────────────────────────────────

export interface FogPuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  opacity: number;
}

/** One bank of soft puffs across `w`; the bank is duplicated one tile left
 *  and drifted by exactly `w` for a seamless horizontal loop. */
export function makeFog(
  seed: string,
  count: number,
  w: number,
  yMin: number,
  yMax: number,
): FogPuff[] {
  const rng = seededRng(`${seed}:fog:${yMin}`);
  return Array.from({ length: count }, () => ({
    x: rng() * w,
    y: yMin + rng() * (yMax - yMin),
    rx: 60 + rng() * 90,
    ry: 16 + rng() * 26,
    opacity: 0.16 + rng() * 0.24,
  }));
}

// ── Dunes (three still horizon lines; the desert the gate was raised in) ────

/** One dune silhouette across `w`: a closed fill and the open crest line, so
 *  the crest can be stroked without stroking the closing box edges. */
export function duneShape(
  seed: string,
  w: number,
  baseY: number,
  amp: number,
): { fill: string; crest: string } {
  const rng = seededRng(`${seed}:dune:${baseY}`);
  const segments = 5;
  const step = w / segments;
  let crest = `M 0 ${baseY + (rng() - 0.5) * amp}`;
  for (let i = 1; i <= segments; i += 1) {
    const x = i * step;
    const y = baseY + (rng() - 0.5) * amp * 2;
    const cx = x - step / 2;
    crest += ` Q ${cx} ${baseY - amp * (0.4 + rng() * 0.9)}, ${x} ${y}`;
  }
  return { crest, fill: `${crest} L ${w} ${baseY + 400} L 0 ${baseY + 400} Z` };
}
