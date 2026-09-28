// Loop memory math. Pure; all times are seconds on one monotonic clock.

export interface LoopEvent {
  /** Seconds from the loop start, in [0, length). */
  offset: number;
  column: number;
  velocity: number;
  /** Pluck point along the string, 0 = top, 1 = bottom. */
  u: number;
}

/** Position in the loop as a fraction in [0, 1). */
export function loopPosition(now: number, origin: number, length: number): number {
  const phase = ((now - origin) % length) / length;
  return phase < 0 ? phase + 1 : phase;
}

/** Offset (seconds into the loop) for a note played at `now`. */
export function loopOffset(now: number, origin: number, length: number): number {
  return loopPosition(now, origin, length) * length;
}

/** First time at or after `from` when an event at `offset` fires. */
export function nextOccurrence(
  offset: number,
  origin: number,
  length: number,
  from: number,
): number {
  const passes = Math.max(0, Math.ceil((from - origin - offset) / length));
  return origin + offset + passes * length;
}

/**
 * Events firing inside [from, to), each with its absolute time. The window is
 * assumed shorter than the loop, so each event fires at most once.
 */
export function eventsInWindow(
  events: readonly LoopEvent[],
  origin: number,
  length: number,
  from: number,
  to: number,
): { event: LoopEvent; time: number }[] {
  const due: { event: LoopEvent; time: number }[] = [];
  for (const event of events) {
    const time = nextOccurrence(event.offset, origin, length, from);
    if (time < to) due.push({ event, time });
  }
  due.sort((a, b) => a.time - b.time);
  return due;
}

/** Nearest dome tick for a loop position. Ticks sit at both ends of the sweep. */
export function tickForPosition(position: number, tickCount: number): number {
  return Math.min(tickCount - 1, Math.max(0, Math.round(position * (tickCount - 1))));
}

/** Playhead angle in degrees, 0 = straight up, negative = left. */
export function sweepAngle(position: number, sweepDeg: number): number {
  return -sweepDeg + position * 2 * sweepDeg;
}

/** Point on the dome at `angleDeg` and `radius` around (cx, cy). */
export function domePoint(
  angleDeg: number,
  radius: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.sin(a) * radius, y: cy - Math.cos(a) * radius };
}
