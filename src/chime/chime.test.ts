import { describe, expect, it } from 'vitest';
import { CHIME } from './chime';
import { buildScale, DRONE_MIDI, midiToFreq, noteName, STRING_MIDI } from './scale';
import {
  archY,
  columnForRank,
  rankForColumn,
  STRING_KEYS,
  STRINGS,
  stringGeometry,
} from './layout';
import { crossings, stringAt, velocityFromSpeed } from './crossing';
import {
  domePoint,
  eventsInWindow,
  loopOffset,
  loopPosition,
  nextOccurrence,
  sweepAngle,
  tickForPosition,
  type LoopEvent,
} from './loop';
import { renderPluck } from './pluckSynth';
import { seededRng } from '@/lib/seed';

describe('scale', () => {
  it('converts MIDI to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(57)).toBeCloseTo(220, 6);
  });

  it('names notes with middle C = C4', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(55)).toBe('G3');
    expect(noteName(70)).toBe('A♯4');
  });

  it('builds an ascending pentatonic scale across octaves', () => {
    expect(buildScale(55, [0, 2, 4, 7, 9], 11)).toEqual([
      55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79,
    ]);
  });

  it('gives every string a major-pentatonic pitch class and spans two octaves', () => {
    const allowed = new Set(CHIME.scale.degrees.map((d) => (CHIME.scale.rootMidi + d) % 12));
    expect(STRING_MIDI).toHaveLength(CHIME.strings.count);
    STRING_MIDI.forEach((m) => expect(allowed.has(m % 12)).toBe(true));
    expect(STRING_MIDI[STRING_MIDI.length - 1] - STRING_MIDI[0]).toBe(24);
  });

  it('puts the drones below the lowest string, ascending by step', () => {
    expect(DRONE_MIDI).toHaveLength(4);
    DRONE_MIDI.forEach((m) => expect(m).toBeLessThan(STRING_MIDI[0]));
    expect([...DRONE_MIDI].sort((a, b) => a - b)).toEqual([...DRONE_MIDI]);
  });
});

describe('kalimba layout', () => {
  const count = CHIME.strings.count;

  it('puts rank 0 in the centre and alternates right, left outward', () => {
    expect([0, 1, 2, 3, 4].map((r) => columnForRank(r, count))).toEqual([5, 6, 4, 7, 3]);
    expect(columnForRank(9, count)).toBe(10);
    expect(columnForRank(10, count)).toBe(0);
  });

  it('round-trips rank and column as a bijection', () => {
    const columns = new Set<number>();
    for (let rank = 0; rank < count; rank += 1) {
      const column = columnForRank(rank, count);
      columns.add(column);
      expect(rankForColumn(column, count)).toBe(rank);
    }
    expect(columns.size).toBe(count);
  });

  it('never makes a higher note longer than a lower one', () => {
    const byRank = [...STRINGS].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < byRank.length; i += 1) {
      expect(byRank[i].length).toBeLessThanOrEqual(byRank[i - 1].length + 1e-9);
    }
    expect(byRank[0].length).toBeGreaterThan(byRank[count - 1].length + 40);
  });

  it('hangs each string from the arch curve to the top step', () => {
    const centre = stringGeometry(5);
    expect(centre.x).toBe(200);
    expect(centre.yTop).toBeCloseTo(CHIME.strings.anchor.cy - CHIME.strings.anchor.r, 6);
    expect(centre.yBottom).toBe(CHIME.strings.bottomY);
    expect(archY(200 + 124, CHIME.strings.anchor)).toBeCloseTo(230, 6);
  });

  it('keeps the outer strings over the top step and inside the inner arch', () => {
    expect(STRINGS[0].x).toBeGreaterThanOrEqual(91);
    expect(STRINGS[count - 1].x).toBeLessThanOrEqual(309);
  });

  it('keeps the largest vibration clear of the neighbouring string', () => {
    expect(CHIME.vibration.ampMax).toBeLessThan(CHIME.strings.spacing / 2);
  });

  it('has one key per string', () => {
    expect(STRING_KEYS).toHaveLength(count);
    expect(new Set(STRING_KEYS).size).toBe(count);
  });
});

describe('crossing detection', () => {
  const strings = [
    { x: 100, yTop: 50, yBottom: 250 },
    { x: 120, yTop: 40, yBottom: 250 },
    { x: 140, yTop: 50, yBottom: 250 },
  ];

  it('returns crossed strings in travel order, left to right', () => {
    const hit = crossings({ x: 90, y: 100 }, { x: 150, y: 100 }, strings);
    expect(hit.map((h) => h.index)).toEqual([0, 1, 2]);
  });

  it('returns them right to left when moving left', () => {
    const hit = crossings({ x: 150, y: 100 }, { x: 110, y: 100 }, strings);
    expect(hit.map((h) => h.index)).toEqual([2, 1]);
  });

  it('ignores a segment that crosses nothing, or is vertical', () => {
    expect(crossings({ x: 101, y: 100 }, { x: 119, y: 100 }, strings)).toEqual([]);
    expect(crossings({ x: 100, y: 60 }, { x: 100, y: 200 }, strings)).toEqual([]);
  });

  it('does not double-fire across consecutive segments that meet on a string', () => {
    const a = crossings({ x: 90, y: 100 }, { x: 100, y: 100 }, strings);
    const b = crossings({ x: 100, y: 100 }, { x: 110, y: 100 }, strings);
    expect(a.map((h) => h.index)).toEqual([0]);
    expect(b).toEqual([]);
  });

  it('ignores a crossing above or below the string', () => {
    expect(crossings({ x: 90, y: 20 }, { x: 110, y: 20 }, strings)).toEqual([]);
    expect(crossings({ x: 90, y: 300 }, { x: 110, y: 300 }, strings)).toEqual([]);
  });

  it('reports where along the string it was crossed', () => {
    const [hit] = crossings({ x: 90, y: 150 }, { x: 110, y: 150 }, strings);
    expect(hit.u).toBeCloseTo(0.5, 6);
  });

  it('finds the nearest string under a tap within the slop', () => {
    expect(stringAt({ x: 112, y: 100 }, strings, 10)?.index).toBe(1);
    expect(stringAt({ x: 109, y: 100 }, strings, 10)?.index).toBe(0);
    expect(stringAt({ x: 70, y: 100 }, strings, 10)).toBeNull();
    expect(stringAt({ x: 100, y: 10 }, strings, 10)).toBeNull();
  });

  it('maps pointer speed to a clamped velocity', () => {
    expect(velocityFromSpeed(0, 1, 0.3)).toBeCloseTo(0.3, 6);
    expect(velocityFromSpeed(0.5, 1, 0.3)).toBeCloseTo(0.65, 6);
    expect(velocityFromSpeed(9, 1, 0.3)).toBe(1);
  });
});

describe('loop math', () => {
  it('wraps position into [0, 1)', () => {
    expect(loopPosition(10, 10, 8)).toBe(0);
    expect(loopPosition(14, 10, 8)).toBeCloseTo(0.5, 9);
    expect(loopPosition(18, 10, 8)).toBeCloseTo(0, 9);
    expect(loopPosition(27, 10, 8)).toBeCloseTo(0.125, 9);
    expect(loopOffset(27, 10, 8)).toBeCloseTo(1, 9);
  });

  it('finds the next occurrence at or after a time', () => {
    expect(nextOccurrence(2, 10, 8, 10)).toBe(12);
    expect(nextOccurrence(2, 10, 8, 12)).toBe(12);
    expect(nextOccurrence(2, 10, 8, 12.001)).toBe(20);
    expect(nextOccurrence(2, 10, 8, 95)).toBe(100);
  });

  it('does not replay a note inside the pass it was recorded in', () => {
    // Recorded at t=13 (offset 3); the scheduler has already covered up to 13.14.
    const events: LoopEvent[] = [{ offset: 3, column: 5, velocity: 1, u: 0.5 }];
    expect(eventsInWindow(events, 10, 8, 13.14, 13.28)).toEqual([]);
    const due = eventsInWindow(events, 10, 8, 20.9, 21.04);
    expect(due).toHaveLength(1);
    expect(due[0].time).toBeCloseTo(21, 9);
  });

  it('fires every event exactly once per pass across contiguous windows', () => {
    const events: LoopEvent[] = [
      { offset: 0, column: 1, velocity: 1, u: 0.5 },
      { offset: 1.5, column: 2, velocity: 1, u: 0.5 },
      { offset: 2.99, column: 3, velocity: 1, u: 0.5 },
    ];
    let fired = 0;
    const step = 0.14;
    for (let from = 0; from < 9 - 1e-9; from += step) {
      fired += eventsInWindow(events, 0, 3, from, Math.min(9, from + step)).length;
    }
    expect(fired).toBe(9);
  });

  it('maps position to ticks and the sweep angle', () => {
    expect(tickForPosition(0, 11)).toBe(0);
    expect(tickForPosition(0.5, 11)).toBe(5);
    expect(tickForPosition(0.999, 11)).toBe(10);
    expect(sweepAngle(0, 75)).toBe(-75);
    expect(sweepAngle(0.5, 75)).toBe(0);
    expect(sweepAngle(1, 75)).toBe(75);
  });

  it('places the playhead on the dome', () => {
    const top = domePoint(0, 160, 200, 214);
    expect(top.x).toBeCloseTo(200, 9);
    expect(top.y).toBeCloseTo(54, 9);
    const left = domePoint(-90, 160, 200, 214);
    expect(left.x).toBeCloseTo(40, 9);
    expect(left.y).toBeCloseTo(214, 9);
  });
});

describe('plucked-string render', () => {
  const sampleRate = 8000;
  const freq = 200;
  const samples = renderPluck({
    freq,
    sampleRate,
    t60: 1,
    brightness: 0.5,
    pluckPoint: 0.18,
    noiseMix: 0.3,
    rng: seededRng('chime-test'),
  });

  it('is finite, normalized, and ends at zero', () => {
    let peak = 0;
    for (const s of samples) {
      expect(Number.isFinite(s)).toBe(true);
      peak = Math.max(peak, Math.abs(s));
    }
    expect(peak).toBeCloseTo(1, 5);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(1e-3);
  });

  it('carries no DC offset', () => {
    let sum = 0;
    for (let n = 0; n < 4000; n += 1) sum += samples[n];
    expect(Math.abs(sum / 4000)).toBeLessThan(0.01);
  });

  it('decays', () => {
    const rms = (from: number, to: number) => {
      let sum = 0;
      for (let n = from; n < to; n += 1) sum += samples[n] * samples[n];
      return Math.sqrt(sum / (to - from));
    };
    expect(rms(4000, 4800)).toBeLessThan(rms(400, 1200) * 0.2);
  });

  it('is periodic at the requested pitch', () => {
    const lagCorr = (lag: number) => {
      let sum = 0;
      for (let n = 800; n < 2400; n += 1) sum += samples[n] * samples[n + lag];
      return sum;
    };
    const period = sampleRate / freq; // 40 samples
    expect(lagCorr(period)).toBeGreaterThan(lagCorr(period - 3));
    expect(lagCorr(period)).toBeGreaterThan(lagCorr(period + 3));
    expect(lagCorr(period)).toBeGreaterThan(0);
  });
});
