'use client';

// The eleven strings, drawn in the gate's coordinate space. React renders them
// once at rest; after that the engine owns `d` and the glow opacities. The
// draw-in (Motion, pathLength) touches only the dash attributes of the base
// line, so the two writers never share an attribute.

import { motion } from 'motion/react';
import { CHIME } from './chime';
import type { ChimeElements } from './engine';
import { restPath } from './engine';
import { rankFraction, STRINGS } from './layout';

interface StringsProps {
  elements: ChimeElements;
  reducedMotion: boolean;
  timeScale: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** ms from mount until the string of pitch `rank` starts drawing. */
export function stringDrawDelayMs(rank: number, timeScale: number): number {
  return (CHIME.arrival.stringsAtMs + rank * CHIME.arrival.stringStaggerMs) * timeScale;
}

export function Strings({ elements, reducedMotion, timeScale }: StringsProps) {
  const { widthLow, widthHigh, restOpacity } = CHIME.strings;
  const drawS = (CHIME.arrival.stringDrawMs * timeScale) / 1000;

  return (
    <g clipPath="url(#chime-gate-interior)" aria-hidden>
      {STRINGS.map((s) => {
        const width = lerp(widthLow, widthHigh, rankFraction(s.rank));
        const rest = restPath(s.column);
        // Strings draw in pitch order: centre first, then outward.
        const delayS = reducedMotion
          ? 0.2 + s.rank * 0.03
          : stringDrawDelayMs(s.rank, timeScale) / 1000;
        return (
          <g key={s.column}>
            <path
              ref={(el) => {
                elements.lenses[s.column] = el;
              }}
              className="chime-string-lens"
              d=""
              opacity="0"
            />
            <path
              ref={(el) => {
                elements.halos[s.column] = el;
              }}
              className="chime-string-halo"
              d={rest}
              strokeWidth={width + 5}
              opacity="0"
            />
            <motion.path
              ref={(el) => {
                elements.lines[s.column] = el;
              }}
              className="chime-string"
              d={rest}
              strokeWidth={width}
              strokeOpacity={restOpacity}
              initial={reducedMotion ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
              animate={reducedMotion ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
              transition={
                reducedMotion
                  ? { duration: 0.3, delay: delayS }
                  : {
                      pathLength: { duration: drawS, delay: delayS, ease: [0.45, 0, 0.2, 1] },
                      opacity: { duration: 0.15, delay: delayS },
                    }
              }
            />
            <path
              ref={(el) => {
                elements.glows[s.column] = el;
              }}
              className="chime-string-glow"
              d={rest}
              strokeWidth={width + 0.5}
              opacity="0"
            />
            {/* Pins where the string meets the arch and the top step. */}
            <motion.circle
              className="chime-pin"
              cx={s.x}
              cy={s.yTop}
              r="1.7"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              transition={{ duration: 0.3, delay: delayS }}
            />
            <motion.circle
              className="chime-pin"
              cx={s.x}
              cy={s.yBottom - 1}
              r="1.4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              transition={{ duration: 0.3, delay: reducedMotion ? delayS : delayS + drawS * 0.9 }}
            />
          </g>
        );
      })}
    </g>
  );
}
