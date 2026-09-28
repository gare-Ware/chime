'use client';

// The gateway: arch, dome ticks and four steps, drawn in on arrival. The
// dome ticks and the playhead bead are exposed as refs for the engine, and the
// steps take an active index for the drone state.

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { BeyondField, WithinField } from '@/components/SurroundFields';
import { CHIME } from './chime';

// Gateway geometry (viewBox 400 × 640). The interior clip is the amber arch.
const ARCH_MAIN = 'M 62 596 L 62 222 A 138 138 0 0 1 338 222 L 338 596';
const ARCH_OUTER = 'M 46 606 L 46 214 A 154 154 0 0 1 354 214 L 354 606';
const ARCH_INNER = 'M 76 588 L 76 230 A 124 124 0 0 1 324 230 L 324 588';
const INTERIOR_CLIP = 'M 62 596 L 62 222 A 138 138 0 0 1 338 222 L 338 596 Z';

/** Steps from the top (narrow) to the bottom (wide), as drawn. */
export const STEPS = [
  { w: 218, y: 528 },
  { w: 254, y: 546 },
  { w: 290, y: 564 },
  { w: 326, y: 582 },
] as const;
export const STEP_H = 12;
export const STEP_PITCH = 18;

/** Drone step index (0 = bottom step) → index into STEPS. */
export function drawnStepIndex(droneStep: number): number {
  return STEPS.length - 1 - droneStep;
}

// Calibration ticks around the outer dome: −75°..75°, 0 = straight up.
export const TICK_COUNT = 11;
const TICKS = Array.from({ length: TICK_COUNT }, (_, i) => {
  const angle = ((i - 5) * 15 * Math.PI) / 180;
  const cx = 200;
  const cy = 214;
  const dirX = Math.sin(angle);
  const dirY = -Math.cos(angle);
  return {
    x1: cx + dirX * 160,
    y1: cy + dirY * 160,
    x2: cx + dirX * 167,
    y2: cy + dirY * 167,
  };
});

interface GateProps {
  seed: string;
  reducedMotion: boolean;
  /** Multiplier on the draw-in times (?fast=1). */
  timeScale: number;
  /** Active drone step (0 = bottom), or null. */
  activeStep: number | null;
  registerTick: (index: number, el: SVGLineElement | null) => void;
  registerBead: (el: SVGCircleElement | null) => void;
  registerSvg: (el: SVGSVGElement | null) => void;
  /** The strings, drawn inside the gate's coordinate space. */
  children: ReactNode;
}

export function Gate({
  seed,
  reducedMotion,
  timeScale,
  activeStep,
  registerTick,
  registerBead,
  registerSvg,
  children,
}: GateProps) {
  const drawMs = CHIME.arrival.gateDrawMs * timeScale;
  const draw = (delay: number) =>
    reducedMotion
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: 0.3, delay: delay / 2000 },
        }
      : {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: {
            pathLength: {
              duration: drawMs / 1000,
              delay: (delay * timeScale) / 1000,
              ease: [0.3, 0, 0.2, 1] as [number, number, number, number],
            },
            opacity: { duration: 0.2, delay: (delay * timeScale) / 1000 },
          },
        };

  return (
    <div className="relative h-full w-full">
      <BeyondField beyond="void" seed={seed} />

      {/* Faint light behind the doorway. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 'min(120vw, 640px)',
          height: 'min(120vh, 900px)',
          background:
            'radial-gradient(closest-side, color-mix(in oklab, var(--accent) 9%, transparent), transparent 70%)',
        }}
      />

      <div className="relative flex h-full w-full items-center justify-center">
        {/* The box is the drawn content: both axes derive from --stage-h at the
            viewBox's 400:640 ratio, so overlays position off fractions of it. */}
        <svg
          ref={registerSvg}
          viewBox="0 0 400 640"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="A gateway of violet and amber lines with steps at its base; eleven strings hang inside it."
          style={{
            width: 'calc(var(--stage-h) * 0.625)',
            height: 'var(--stage-h)',
            overflow: 'visible',
          }}
        >
          <defs>
            <clipPath id="chime-gate-interior">
              <path d={INTERIOR_CLIP} />
            </clipPath>
            <linearGradient id="chime-gate-depth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--gate-field)', stopOpacity: 0.14 }} />
              <stop offset="0.55" style={{ stopColor: 'var(--gate-field)', stopOpacity: 0.05 }} />
              <stop offset="1" style={{ stopColor: 'var(--gate-field)', stopOpacity: 0.16 }} />
            </linearGradient>
          </defs>

          {/* Interior field. */}
          <motion.g
            clipPath="url(#chime-gate-interior)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: (reducedMotion ? 200 : drawMs) / 1000 }}
          >
            <rect x="62" y="84" width="276" height="512" fill="url(#chime-gate-depth)" />
            <g opacity="0.55">
              <WithinField within="stars" seed={seed} />
            </g>
          </motion.g>

          {/* The gateway. */}
          <g fill="none" strokeLinecap="round">
            <motion.path
              d={ARCH_OUTER}
              stroke="var(--gate-outer)"
              strokeWidth="2.2"
              opacity="0.85"
              {...draw(0)}
            />
            <motion.path d={ARCH_MAIN} stroke="var(--gate-inner)" strokeWidth="3" {...draw(180)} />
            <motion.path
              d={ARCH_MAIN}
              stroke="var(--glow)"
              strokeWidth="9"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.14 }}
              transition={{ duration: 0.8, delay: 0.7 * timeScale }}
            />
            <motion.path
              d={ARCH_INNER}
              stroke="var(--gate-inner)"
              strokeWidth="1"
              opacity="0.3"
              {...draw(320)}
            />
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: ((reducedMotion ? 150 : 650) * timeScale) / 1000 }}
            >
              {TICKS.map((t, i) => (
                <line
                  key={i}
                  ref={(el) => registerTick(i, el)}
                  className="chime-tick"
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                />
              ))}
            </motion.g>
            {/* Loop playhead; the engine positions it and sets its opacity. */}
            <circle ref={registerBead} className="chime-bead" cx="200" cy="50.5" r="3.2" opacity="0" />
          </g>

          {/* Steps to the doorway. The buttons that operate them are HTML,
              overlaid by ChimeApp; these rects are the visuals. */}
          <motion.g
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.55,
              delay: ((reducedMotion ? 250 : 620) * timeScale) / 1000,
              ease: [0.2, 0, 0, 1],
            }}
          >
            {STEPS.map((s, i) => {
              const on = activeStep !== null && drawnStepIndex(activeStep) === i;
              return (
                <g key={s.y}>
                  <rect
                    className={on ? 'chime-step-glow chime-step-glow-on' : 'chime-step-glow'}
                    x={200 - s.w / 2}
                    y={s.y}
                    width={s.w}
                    height={STEP_H}
                    rx={3}
                  />
                  <rect
                    x={200 - s.w / 2}
                    y={s.y}
                    width={s.w}
                    height={STEP_H}
                    rx={3}
                    fill="var(--gate-steps)"
                    fillOpacity="0.14"
                    stroke="var(--gate-steps)"
                    strokeOpacity="0.75"
                    strokeWidth="1.4"
                  />
                </g>
              );
            })}
          </motion.g>

          {children}
        </svg>
      </div>
    </div>
  );
}
