'use client';

// The two surround families, both procedural (no image assets) and both
// seeded, so a given seed's sky is its own. WITHIN lives clipped inside the
// gateway arch, behind the strings; BEYOND fills the viewport behind the
// gateway. Ambient drift and
// twinkle are CSS animations declared in globals.css, already gated behind
// prefers-reduced-motion: no-preference.

import { useMemo } from 'react';
import {
  duneShape,
  makeFog,
  makeStars,
  makeStreaks,
  type BeyondId,
  type WithinId,
} from '@/lib/fields';

// ── WITHIN — the gate's own weather (arch space is 400 × 640) ────────────────

const W = 400;
const H = 640;

export function WithinField({ within, seed }: { within: WithinId; seed: string }) {
  if (within === 'rain') return <SignalRain seed={seed} />;
  if (within === 'stars') return <WithinStars seed={seed} />;
  return <Fog seed={seed} />;
}

/** The sketch's diagonal hatching, animated: a slow fall of signal marks. */
function SignalRain({ seed }: { seed: string }) {
  const layers = useMemo(
    () => [
      { streaks: makeStreaks(`${seed}:a`, 26, W, H), className: 'field-rain-a', width: 1 },
      { streaks: makeStreaks(`${seed}:b`, 16, W, H), className: 'field-rain-b', width: 1 },
    ],
    [seed],
  );
  return (
    <g stroke="var(--gate-field)" strokeLinecap="round">
      {layers.map((layer) => (
        <g key={layer.className} className={layer.className}>
          {/* The band plus its copy one band up — the loop travels exactly H. */}
          {[0, -H].map((shift) => (
            <g key={shift} transform={`translate(0 ${shift})`}>
              {layer.streaks.map((s, i) => (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={s.x - s.len * 0.55}
                  y2={s.y + s.len * 0.83}
                  strokeWidth={s.width}
                  opacity={s.opacity}
                />
              ))}
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

/** The gate opens onto somewhere deep. */
function WithinStars({ seed }: { seed: string }) {
  const stars = useMemo(() => makeStars(`${seed}:within`, 64, W, H), [seed]);
  return (
    <g fill="var(--foreground)">
      {stars.map((s, i) => (
        <circle
          key={i}
          className={s.slow ? 'field-tw-slow' : 'field-tw'}
          cx={s.x}
          cy={s.y}
          r={s.r}
          opacity={s.opacity}
          style={{ animationDelay: `${-s.delay}s` }}
        />
      ))}
    </g>
  );
}

/** Weather inside the gate: two banks of soft puffs riding the same slow
 *  wind at different depths — a high thin cloud layer, a dense mist pooling
 *  at the doorway's base. Each bank tiles across W for a seamless loop. */
function Fog({ seed }: { seed: string }) {
  const banks = useMemo(
    () => [
      { puffs: makeFog(`${seed}:far`, 7, W, 200, 420), cls: 'field-fog-b', opacity: 0.55 },
      { puffs: makeFog(`${seed}:near`, 10, W, 420, 610), cls: 'field-fog-a', opacity: 1 },
    ],
    [seed],
  );
  return (
    <g>
      <defs>
        <radialGradient id="fog-puff">
          <stop
            offset="0"
            style={{
              stopColor: 'color-mix(in oklab, var(--gate-field) 60%, var(--foreground))',
              stopOpacity: 0.5,
            }}
          />
          <stop
            offset="0.65"
            style={{ stopColor: 'var(--gate-field)', stopOpacity: 0.18 }}
          />
          <stop offset="1" style={{ stopColor: 'var(--gate-field)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      {banks.map((bank) => (
        <g key={bank.cls} className={bank.cls} opacity={bank.opacity}>
          {/* The bank plus its copy one tile left — the loop travels exactly W. */}
          {[0, -W].map((shift) => (
            <g key={shift} transform={`translate(${shift} 0)`}>
              {bank.puffs.map((p, i) => (
                <ellipse
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  rx={p.rx}
                  ry={p.ry}
                  fill="url(#fog-puff)"
                  opacity={p.opacity}
                />
              ))}
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

// ── BEYOND — the world the gate stands in (full-bleed, 1000 × 1000 sliced) ───

const BW = 1000;
const BH = 1000;

export function BeyondField({ beyond, seed }: { beyond: BeyondId; seed: string }) {
  if (beyond === 'void') return null;
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${BW} ${BH}`}
      // Dunes are ground: anchor the slice to the bottom edge, or landscape
      // viewports (which crop the square viewBox vertically) cut them off.
      preserveAspectRatio="xMidYMax slice"
    >
      <Dunes seed={seed} />
    </svg>
  );
}

/** Three still dune lines low on the horizon — the desert night. Each crest
 *  is stroked in the gate's line language; the fills stack for depth. */
function Dunes({ seed }: { seed: string }) {
  const layers = useMemo(
    () => [
      { shape: duneShape(`${seed}:1`, BW, 778, 30), color: 'var(--gate-outer)', fillOpacity: 0.12, crestOpacity: 0.5 },
      { shape: duneShape(`${seed}:2`, BW, 860, 40), color: 'var(--gate-steps)', fillOpacity: 0.14, crestOpacity: 0.45 },
      { shape: duneShape(`${seed}:3`, BW, 936, 46), color: 'var(--gate-steps)', fillOpacity: 0.26, crestOpacity: 0.6 },
    ],
    [seed],
  );
  return (
    <g>
      {layers.map((l, i) => (
        <g key={i}>
          <path d={l.shape.fill} fill={l.color} fillOpacity={l.fillOpacity} />
          <path
            d={l.shape.crest}
            fill="none"
            stroke={l.color}
            strokeOpacity={l.crestOpacity}
            strokeWidth="1.4"
          />
        </g>
      ))}
    </g>
  );
}
