// Which strings a pointer touches. Pure; coordinates are gate viewBox units.

export interface StringSpan {
  x: number;
  yTop: number;
  yBottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Crossing {
  index: number;
  /** Where along the string it was crossed: 0 = top, 1 = bottom. */
  u: number;
  /** Where along the pointer segment: 0 = `from`, 1 = `to`. Taps report 1. */
  t: number;
}

/**
 * Strings crossed by the pointer moving from `from` to `to`, in the order they
 * were crossed. A string counts when the segment passes over its x within its
 * vertical extent. Starting exactly on a string does not count (that case is a
 * tap); ending exactly on one does, so consecutive segments never double-fire.
 */
export function crossings(from: Point, to: Point, strings: readonly StringSpan[]): Crossing[] {
  const dx = to.x - from.x;
  if (dx === 0) return [];
  const hits: Crossing[] = [];
  strings.forEach((s, index) => {
    const crossed = dx > 0 ? from.x < s.x && to.x >= s.x : from.x > s.x && to.x <= s.x;
    if (!crossed) return;
    const t = (s.x - from.x) / dx;
    const y = from.y + (to.y - from.y) * t;
    if (y < s.yTop || y > s.yBottom) return;
    hits.push({ index, u: (y - s.yTop) / (s.yBottom - s.yTop), t });
  });
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

/** The string under a tap, or null. `slop` is the half-width of a hit zone. */
export function stringAt(point: Point, strings: readonly StringSpan[], slop: number): Crossing | null {
  let best: Crossing | null = null;
  let bestDist = Infinity;
  strings.forEach((s, index) => {
    const dist = Math.abs(point.x - s.x);
    if (dist > slop || dist >= bestDist) return;
    if (point.y < s.yTop || point.y > s.yBottom) return;
    bestDist = dist;
    best = { index, u: (point.y - s.yTop) / (s.yBottom - s.yTop), t: 1 };
  });
  return best;
}

/** Pointer speed (units/ms) → pluck velocity in [min, 1]. */
export function velocityFromSpeed(speed: number, fullSpeed: number, min: number): number {
  const v = min + (1 - min) * Math.min(1, Math.max(0, speed / fullSpeed));
  return Math.min(1, Math.max(min, v));
}
