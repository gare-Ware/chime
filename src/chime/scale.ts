// Pitch table for the strings and the step drones. Pure.

import { CHIME } from './chime';

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** "G3", "A♯4" — scientific pitch notation, middle C = C4. */
export function noteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  return `${NAMES[pc]}${Math.floor(midi / 12) - 1}`;
}

/** Ascending MIDI notes: `degrees` repeated up the octaves from `rootMidi`. */
export function buildScale(
  rootMidi: number,
  degrees: readonly number[],
  count: number,
): number[] {
  return Array.from({ length: count }, (_, rank) => {
    const octave = Math.floor(rank / degrees.length);
    return rootMidi + 12 * octave + degrees[rank % degrees.length];
  });
}

/** String notes by pitch rank (0 = lowest). */
export const STRING_MIDI: readonly number[] = buildScale(
  CHIME.scale.rootMidi,
  CHIME.scale.degrees,
  CHIME.strings.count,
);

/** Drone notes by step (0 = bottom step). */
export const DRONE_MIDI: readonly number[] = CHIME.drones.offsets.map(
  (offset) => CHIME.scale.rootMidi - CHIME.drones.octaveDrop + offset,
);
