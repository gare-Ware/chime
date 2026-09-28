// seed.ts
// Deterministic randomness: a string seed always yields the same sequence, so
// the surrounds and the string voicings are stable across loads.

/** xmur3 string hash → 32-bit seed generator. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG: fast, tiny, uniform enough for a 6-way pick. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic index in [0, length) for a seed + salt pair. */
export function seededPick(seed: string, salt: string, length: number): number {
  if (length <= 0) throw new Error('seededPick needs a non-empty range');
  const rng = mulberry32(xmur3(`${seed}:${salt}`)());
  return Math.floor(rng() * length);
}

/** A reusable deterministic stream (field layouts, knock-reply variance). */
export function seededRng(seed: string): () => number {
  return mulberry32(xmur3(seed)());
}
