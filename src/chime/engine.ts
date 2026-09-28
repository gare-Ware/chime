// CHIME engine: string vibration, pointer → pluck mapping, and the loop. One
// requestAnimationFrame loop writes `d` and opacity straight to SVG refs; React
// never renders per frame. The loop runs only while something is moving — idle
// strings are straight lines that nobody touches.
//
// Clocks: everything visual and the loop positions use performance.now() (s),
// so rendering works with no AudioContext. Audio start times are converted to
// the AudioContext clock at scheduling time (lookahead scheduler), so replayed
// notes are sample-accurate even when the main thread is busy.

import { CHIME } from './chime';
import type { ChimeAudio } from './audio';
import { crossings, stringAt, velocityFromSpeed, type Point } from './crossing';
import { rankFraction, STRINGS } from './layout';
import {
  domePoint,
  eventsInWindow,
  loopOffset,
  loopPosition,
  sweepAngle,
  tickForPosition,
  type LoopEvent,
} from './loop';

export interface ChimeElements {
  svg: SVGSVGElement | null;
  lines: (SVGPathElement | null)[];
  glows: (SVGPathElement | null)[];
  halos: (SVGPathElement | null)[];
  lenses: (SVGPathElement | null)[];
  ticks: (SVGLineElement | null)[];
  bead: SVGCircleElement | null;
}

export function emptyElements(): ChimeElements {
  return { svg: null, lines: [], glows: [], halos: [], lenses: [], ticks: [], bead: null };
}

export interface PluckOptions {
  /** Pluck point along the string, 0 = top, 1 = bottom. */
  u?: number;
  /** Seconds from now. */
  delay?: number;
  /** Record into the loop when it is on. Default true. */
  record?: boolean;
  /** Counts as a user pluck (drives the hint). Default true. */
  user?: boolean;
}

export interface ChimeEngine {
  pluck(column: number, velocity: number, options?: PluckOptions): void;
  pointerDown(id: number, clientX: number, clientY: number): void;
  pointerMove(id: number, clientX: number, clientY: number): void;
  pointerUp(id: number): void;
  setLoop(on: boolean): void;
  clearLoop(): void;
  loopEventCount(): number;
  destroy(): void;
}

interface EngineOptions {
  elements: ChimeElements;
  audio: ChimeAudio;
  reducedMotion: boolean;
  loopLengthMs: number;
  onUserPluck?: () => void;
  onLoopCount?: (count: number) => void;
}

interface StringState {
  active: boolean;
  t0: number;
  amp: number;
  velocity: number;
  modeAmps: number[];
}

interface Pending {
  time: number;
  column: number;
  velocity: number;
  u: number;
  tick: number | null;
}

interface PointerTrack {
  point: Point;
  time: number;
  lastColumn: number;
  lastFireMs: number;
  rect: DOMRect;
}

const clock = () => performance.now() / 1000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function restPath(column: number): string {
  const s = STRINGS[column];
  return `M${s.x} ${s.yTop.toFixed(1)}L${s.x} ${s.yBottom}`;
}

export function createChimeEngine({
  elements,
  audio,
  reducedMotion,
  loopLengthMs,
  onUserPluck,
  onLoopCount,
}: EngineOptions): ChimeEngine {
  const vib = CHIME.vibration;
  const segments = CHIME.strings.segments;
  const loopLength = loopLengthMs / 1000;

  // sin(nπu) per mode and segment, computed once.
  const modeShape: number[][] = Array.from({ length: vib.modes }, (_, m) =>
    Array.from({ length: segments + 1 }, (_, j) => Math.sin(((m + 1) * Math.PI * j) / segments)),
  );

  const strings: StringState[] = STRINGS.map(() => ({
    active: false,
    t0: 0,
    amp: 0,
    velocity: 0,
    modeAmps: [],
  }));
  const decayRate = STRINGS.map((s) => {
    const f = rankFraction(s.rank);
    return 6.9 / lerp(CHIME.synth.t60LowS, CHIME.synth.t60HighS, f);
  });
  const visualHz = STRINGS.map((s) => lerp(vib.visualHzLow, vib.visualHzHigh, rankFraction(s.rank)));

  const tickCount = () => elements.ticks.length;
  const tickFlash: number[] = [];
  let ticksDirty = false;

  const pending: Pending[] = [];
  const pointers = new Map<number, PointerTrack>();

  let loopOn = false;
  let loopOrigin = 0;
  let scheduledUntil = 0;
  let loopEvents: LoopEvent[] = [];
  let schedulerId: number | null = null;

  let raf = 0;
  let running = false;
  let lastFrame = 0;
  let destroyed = false;

  // ── Vibration ─────────────────────────────────────────────────────────────

  function excite(column: number, velocity: number, u: number, time: number): void {
    const state = strings[column];
    // Mode amplitudes for a triangular pluck at p: sin(nπp)/n², scaled so the
    // displacement at the pluck point starts at 1.
    const p = Math.min(0.85, Math.max(0.15, u));
    const raw = modeShape.map((_, m) => Math.sin((m + 1) * Math.PI * p) / (m + 1) ** 2);
    const peak = raw.reduce((sum, a, m) => sum + a * Math.sin((m + 1) * Math.PI * p), 0);
    state.modeAmps = raw.map((a) => a / (peak || 1));
    state.amp = lerp(vib.ampMin, vib.ampMax, velocity);
    state.velocity = velocity;
    state.t0 = time;
    state.active = true;
  }

  function drawString(column: number, now: number): void {
    const state = strings[column];
    const geo = STRINGS[column];
    const line = elements.lines[column];
    const glow = elements.glows[column];
    const halo = elements.halos[column];
    const lens = elements.lenses[column];
    const t = Math.max(0, now - state.t0);
    const envelope = Math.exp(-decayRate[column] * t);
    const amplitude = state.amp * envelope;
    const light = state.velocity ** 0.6 * Math.exp(-t / vib.glowDecayS);

    const done = reducedMotion
      ? light < 0.02
      : amplitude < vib.restThreshold && light < 0.02;
    if (done) {
      state.active = false;
      const rest = restPath(column);
      line?.setAttribute('d', rest);
      glow?.setAttribute('d', rest);
      halo?.setAttribute('d', rest);
      lens?.setAttribute('d', '');
      glow?.setAttribute('opacity', '0');
      halo?.setAttribute('opacity', '0');
      lens?.setAttribute('opacity', '0');
      return;
    }

    glow?.setAttribute('opacity', Math.min(1, light).toFixed(3));
    halo?.setAttribute('opacity', (vib.haloOpacity * Math.min(1, light)).toFixed(3));
    // Reduced motion: the string brightens and fades; it does not move.
    if (reducedMotion) return;

    const phase = 2 * Math.PI * visualHz[column] * t;
    const modeNow = state.modeAmps.map(
      (a, m) =>
        a *
        Math.cos((m + 1) * phase) *
        Math.exp(-decayRate[column] * ((m + 1) ** vib.modeDecayPower - 1) * t),
    );

    let d = '';
    let left = '';
    let right = '';
    for (let j = 0; j <= segments; j += 1) {
      const y = geo.yTop + (geo.length * j) / segments;
      let shape = 0;
      for (let m = 0; m < modeNow.length; m += 1) shape += modeNow[m] * modeShape[m][j];
      const x = geo.x + amplitude * shape;
      d += `${j === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(1)}`;
      // The lens is the blur of the fundamental: its full swing at this height.
      const half = amplitude * modeShape[0][j];
      left += `${j === 0 ? 'M' : 'L'}${(geo.x - half).toFixed(2)} ${y.toFixed(1)}`;
      right = `L${(geo.x + half).toFixed(2)} ${y.toFixed(1)}${right}`;
    }
    line?.setAttribute('d', d);
    glow?.setAttribute('d', d);
    halo?.setAttribute('d', d);
    lens?.setAttribute('d', `${left}${right}Z`);
    lens?.setAttribute(
      'opacity',
      (vib.lensOpacity * Math.min(1, amplitude / vib.ampMin) * (0.5 + 0.5 * Math.min(1, light * 2))).toFixed(3),
    );
  }

  // ── Dome ticks and the playhead ───────────────────────────────────────────

  function drawDome(now: number, dt: number): boolean {
    const count = tickCount();
    const bead = elements.bead;
    let anyFlash = false;
    const fade = Math.exp(-dt / CHIME.loop.tickFlashDecayS);
    for (let i = 0; i < count; i += 1) {
      tickFlash[i] = (tickFlash[i] ?? 0) * fade;
      if (tickFlash[i] < 0.01) tickFlash[i] = 0;
      else anyFlash = true;
    }

    if (!loopOn && !anyFlash) {
      if (ticksDirty) {
        elements.ticks.forEach((tick) => tick?.removeAttribute('style'));
        bead?.setAttribute('opacity', '0');
        ticksDirty = false;
      }
      return false;
    }

    const position = loopOn ? loopPosition(now, loopOrigin, loopLength) : 0;
    const nearest = tickForPosition(position, count);
    for (let i = 0; i < count; i += 1) {
      let level = tickFlash[i];
      if (loopOn) {
        const near = reducedMotion
          ? i === nearest
            ? 0.55
            : 0
          : 0.4 * Math.max(0, 1 - Math.abs(position * (count - 1) - i));
        level = Math.max(level, near);
      }
      const tick = elements.ticks[i];
      if (!tick) continue;
      tick.style.stroke = `color-mix(in oklab, var(--glow) ${Math.round(level * 100)}%, var(--gate-outer))`;
      tick.style.strokeOpacity = (0.5 + 0.5 * level).toFixed(3);
      tick.style.strokeWidth = (1.6 + 1.4 * level).toFixed(2);
    }

    if (bead) {
      if (loopOn && !reducedMotion) {
        const { sweepDeg, beadRadius, dome, beadEdgeFade } = CHIME.loop;
        const point = domePoint(sweepAngle(position, sweepDeg), beadRadius, dome.cx, dome.cy);
        const edge = Math.min(position, 1 - position) / beadEdgeFade;
        bead.setAttribute('cx', point.x.toFixed(2));
        bead.setAttribute('cy', point.y.toFixed(2));
        bead.setAttribute('opacity', Math.min(1, edge).toFixed(3));
      } else {
        bead.setAttribute('opacity', '0');
      }
    }
    ticksDirty = true;
    return true;
  }

  // ── Frame loop ────────────────────────────────────────────────────────────

  function frame(): void {
    if (destroyed) return;
    const now = clock();
    const dt = Math.min(0.1, now - lastFrame);
    lastFrame = now;

    // Scheduled plucks (strum spacing, loop replays) whose time has come.
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const p = pending[i];
      if (p.time > now) continue;
      pending.splice(i, 1);
      excite(p.column, p.velocity, p.u, p.time);
      if (p.tick !== null) tickFlash[p.tick] = 1;
    }

    let busy = pending.length > 0;
    for (let column = 0; column < strings.length; column += 1) {
      if (!strings[column].active) continue;
      drawString(column, now);
      busy = busy || strings[column].active;
    }
    busy = drawDome(now, dt) || busy;

    if (busy) raf = requestAnimationFrame(frame);
    else running = false;
  }

  function wake(): void {
    if (running || destroyed) return;
    running = true;
    lastFrame = clock();
    raf = requestAnimationFrame(frame);
  }

  // ── Plucks ────────────────────────────────────────────────────────────────

  function fire(column: number, velocity: number, u: number, delay: number, tick: number | null): void {
    const now = clock();
    const audioNow = audio.now();
    if (audioNow !== null) audio.pluck(column, velocity, audioNow + delay);
    if (delay <= 0.001) {
      excite(column, velocity, u, now);
      if (tick !== null) tickFlash[tick] = 1;
    } else {
      pending.push({ time: now + delay, column, velocity, u, tick });
    }
    wake();
  }

  function pluck(column: number, velocity: number, options: PluckOptions = {}): void {
    if (destroyed || column < 0 || column >= strings.length) return;
    const { u = 0.3, delay = 0, record = true, user = true } = options;
    fire(column, velocity, u, delay, null);
    if (loopOn && record) {
      loopEvents.push({
        offset: loopOffset(clock() + delay, loopOrigin, loopLength),
        column,
        velocity,
        u,
      });
      if (loopEvents.length > CHIME.loop.maxEvents) loopEvents.shift();
      onLoopCount?.(loopEvents.length);
    }
    if (user) onUserPluck?.();
  }

  // ── Loop scheduler ────────────────────────────────────────────────────────

  function schedule(): void {
    const now = clock();
    // After a stall (background tab), skip what was missed instead of
    // releasing it all at once.
    const from = scheduledUntil < now - 0.05 ? now : scheduledUntil;
    const to = now + CHIME.loop.lookaheadMs / 1000;
    if (to <= from) return;
    for (const { event, time } of eventsInWindow(loopEvents, loopOrigin, loopLength, from, to)) {
      const position = event.offset / loopLength;
      fire(
        event.column,
        event.velocity,
        event.u,
        Math.max(0, time - now),
        tickForPosition(position, tickCount()),
      );
    }
    scheduledUntil = to;
  }

  function setLoop(on: boolean): void {
    if (destroyed || on === loopOn) return;
    loopOn = on;
    if (on) {
      loopOrigin = clock();
      scheduledUntil = loopOrigin;
      schedule();
      schedulerId = window.setInterval(schedule, CHIME.loop.tickMs);
    } else {
      if (schedulerId !== null) window.clearInterval(schedulerId);
      schedulerId = null;
      pending.length = 0;
    }
    wake();
  }

  // ── Pointer ───────────────────────────────────────────────────────────────

  function toGate(rect: DOMRect, clientX: number, clientY: number): Point {
    return {
      x: ((clientX - rect.left) / rect.width) * CHIME.view.w,
      y: ((clientY - rect.top) / rect.height) * CHIME.view.h,
    };
  }

  function pointerDown(id: number, clientX: number, clientY: number): void {
    const svg = elements.svg;
    if (!svg || destroyed) return;
    const rect = svg.getBoundingClientRect();
    const point = toGate(rect, clientX, clientY);
    const track: PointerTrack = {
      point,
      time: performance.now(),
      lastColumn: -1,
      lastFireMs: 0,
      rect,
    };
    pointers.set(id, track);
    const hit = stringAt(point, STRINGS, CHIME.pluck.hitSlop);
    if (hit) {
      track.lastColumn = hit.index;
      track.lastFireMs = track.time;
      pluck(hit.index, CHIME.pluck.tapVelocity, { u: hit.u });
    }
  }

  function pointerMove(id: number, clientX: number, clientY: number): void {
    const track = pointers.get(id);
    if (!track) return;
    const nowMs = performance.now();
    const point = toGate(track.rect, clientX, clientY);
    const dtMs = Math.max(1, nowMs - track.time);
    const hits = crossings(track.point, point, STRINGS);
    if (hits.length) {
      const speed = Math.abs(point.x - track.point.x) / dtMs;
      const velocity = velocityFromSpeed(speed, CHIME.pluck.fullSpeed, CHIME.pluck.minVelocity);
      // Several strings crossed in one pointer event are spread over the time
      // the segment took, so a fast strum still rolls instead of landing as
      // one chord.
      const span = Math.min(50, dtMs) / 1000;
      const first = hits[0].t;
      for (const hit of hits) {
        const tooSoon =
          hit.index === track.lastColumn && nowMs - track.lastFireMs < CHIME.pluck.refireMs;
        if (tooSoon) continue;
        pluck(hit.index, velocity, { u: hit.u, delay: (hit.t - first) * span });
        track.lastColumn = hit.index;
        track.lastFireMs = nowMs;
      }
    }
    track.point = point;
    track.time = nowMs;
  }

  return {
    pluck,
    pointerDown,
    pointerMove,
    pointerUp: (id) => void pointers.delete(id),
    setLoop,
    clearLoop() {
      loopEvents = [];
      pending.length = 0;
      onLoopCount?.(0);
    },
    loopEventCount: () => loopEvents.length,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      if (schedulerId !== null) window.clearInterval(schedulerId);
      pointers.clear();
    },
  };
}
