import type { Transition, Variants } from 'motion/react';

// ─────────────────────────────────────────────────────────────────────────────
// Motion identity — the app's entire vocabulary: named springs, interaction
// affordances, enter/exit variants. Components use these tokens; raw literals live only here.
//
// Personality: ceremonial and weighted — a temple, not a toy. Springs settle
// without flourish. The strings themselves are engine physics, not tweens.
// ─────────────────────────────────────────────────────────────────────────────

// Shared glide for content islands entering/leaving.
export const GLIDE: Transition = { type: 'spring', stiffness: 300, damping: 28 };

// Calm settle, no overshoot — chrome easing to rest.
export const SETTLE: Transition = { type: 'spring', stiffness: 420, damping: 38 };

// Quick decisive feedback — presses, chips.
export const SNAPPY: Transition = { type: 'spring', stiffness: 600, damping: 34 };

// The rationed overshoot — the reveal's pops.
export const POP: Transition = { type: 'spring', stiffness: 340, damping: 18 };

// Exits accelerate away, shorter than entrances.
export const EXIT: Transition = { duration: 0.2, ease: [0.3, 0, 1, 1] };

// Reduced-motion path: opacity-only, short.
export const REDUCED_FADE: Transition = { duration: 0.12, ease: [0.2, 0, 0, 1] };
export const FADE: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: REDUCED_FADE },
  exit: { opacity: 0, transition: REDUCED_FADE },
};

// One press language for every pressable (control voice only).
export const PRESS = { whileTap: { scale: 0.96 } } as const;

export function fadeSlide(from: 'above' | 'below'): Variants {
  const y = from === 'above' ? -20 : 20;
  return {
    hidden: { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: GLIDE },
    exit: { opacity: 0, y, transition: EXIT },
  };
}

// ─── Type ─────────────────────────────────────────────────────────────────────
// The wordmark inks in along the display face's wght axis (Cormorant 300–700).
export const INK_FROM = 300;
export const INK: Transition = { type: 'spring', stiffness: 110, damping: 19 };

// ─── Control panel ───────────────────────────────────────────────────────────
// The thumb-first reveal: on narrow viewports the whole stage slides UP to
// uncover the drawer beneath (the app itself is the drawer); on desktop the
// drawer rises as a bottom bar. Same spring both ways — decisive, no bounce.
export const PANEL_SPRING: Transition = { type: 'spring', stiffness: 380, damping: 36 };
