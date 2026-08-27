/**
 * Identifier and seeded-random helpers.
 * Concept generation must be deterministic for a given seed so that reopening
 * a project reproduces exactly the same layouts.
 */

export function createId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** Mulberry32 — small, fast, deterministic PRNG. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a deterministic element from a list. */
export function pick<T>(rng: () => number, items: readonly T[], fallback: T): T {
  if (items.length === 0) return fallback;
  return items[Math.floor(rng() * items.length)] ?? fallback;
}
