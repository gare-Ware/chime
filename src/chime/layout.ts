// Where each string hangs. Pure.
//
// Two indexings: `column` is the drawn position, 0 = leftmost. `rank` is the
// pitch order, 0 = lowest. Kalimba layout: rank 0 sits in the centre and
// ascending ranks alternate right, left, right, left outward, so the longest
// string is the lowest note.

import { CHIME } from './chime';

export interface StringGeometry {
  column: number;
  rank: number;
  x: number;
  yTop: number;
  yBottom: number;
  length: number;
}

export function columnForRank(rank: number, count: number): number {
  const centre = (count - 1) / 2;
  return rank % 2 === 1 ? centre + (rank + 1) / 2 : centre - rank / 2;
}

export function rankForColumn(column: number, count: number): number {
  const offset = column - (count - 1) / 2;
  if (offset === 0) return 0;
  return offset > 0 ? 2 * offset - 1 : -2 * offset;
}

/** y of the arch curve above `x` (the upper half of the anchor circle). */
export function archY(x: number, anchor: { cx: number; cy: number; r: number }): number {
  const dx = x - anchor.cx;
  const inside = anchor.r * anchor.r - dx * dx;
  return anchor.cy - Math.sqrt(Math.max(0, inside));
}

export function stringGeometry(column: number): StringGeometry {
  const { count, centerX, spacing, anchor, bottomY } = CHIME.strings;
  const x = centerX + (column - (count - 1) / 2) * spacing;
  const yTop = archY(x, anchor);
  return {
    column,
    rank: rankForColumn(column, count),
    x,
    yTop,
    yBottom: bottomY,
    length: bottomY - yTop,
  };
}

/** All strings, left to right. */
export const STRINGS: readonly StringGeometry[] = Array.from(
  { length: CHIME.strings.count },
  (_, column) => stringGeometry(column),
);

/** Home-row keys, left to right as drawn. */
export const STRING_KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"] as const;

/** 0 at the lowest string, 1 at the highest. */
export function rankFraction(rank: number): number {
  return rank / (CHIME.strings.count - 1);
}
