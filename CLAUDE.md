# CLAUDE.md

## Project
CHIME — a web instrument: a gateway (arch, dome ticks, four steps) with eleven
strings in the doorway. Pure client app, Web Audio only, no server route, no
persistence. Split out of the HATCH repo (`~/Developer/hatch`, `/chime` there)
on 2026-09-27; the two now evolve separately. Human overview in `README.md`.

## Commands
- Node 20+ (`.nvmrc`; npm scripts preflight it). Stack: Next 15 · React 19 ·
  TypeScript · Tailwind v4 · Motion.
- `npm run dev` (http://localhost:3000) · `npm run build` · `npm run typecheck`
  · `npm run lint` · `npm test` (Vitest: scale, layout, loop, crossing logic)
- `npm run peek -- <outdir>` — Playwright frame captures + audio-state checks
  against the running dev server. Never sign off choreography from code alone.

## Architecture
- `src/chime/chime.ts` — every tunable in the single `CHIME` object.
- `ChimeApp` orchestrates: React owns discrete state (step, drone, loop, sound,
  drawer); `engine.ts` owns everything per-frame (one rAF loop writing straight
  to SVG refs) and `audio.ts` the Web Audio graph.
- Two string indexings (`layout.ts`): `column` = drawn position, `rank` = pitch.
  Kalimba order puts rank 0 in the centre.
- Pointer: the whole scene is the play surface; the engine snapshots the gate
  rect at pointer-down. Keyboard + assistive tech go through invisible buttons
  overlaid on the gate (`.chime-overlay`), registered to `--stage-h`.
- `KeysDrawer` — the shortcut map, same mechanics as HATCH's tune drawer: on
  ≤640px the stage slides up by the drawer's measured height; on desktop it is
  a bottom bar. The chip strip (sound · keys · loop) floats above it. The
  instrument keeps listening while it is open. Any new shortcut must be added
  to the handler in `ChimeApp`, the drawer, the sr-only description, and the
  README table.
- `?fast=1` shrinks the arrival and loop; `?demo=1` auto-plays. Both expose
  `window.__chime` for the capture script. `data-step` on `<main>` is the
  handover signal (`arrival` → `playing`).

## Theming & type
- Palette tokens live only in `src/app/globals.css`; components consume
  tokens. `--stage-h` is the composition's single scale knob.
- Cormorant (`--font-display`) is the content voice (wordmark); Space Mono
  (`--font-control`) the control voice. Never the serif on pressables. Swap
  faces in `layout.tsx` only.
- `SurroundFields`/`fields.ts` carry all of HATCH's surround options; CHIME
  renders `stars` within and `void` beyond.

## Gotchas
- Interleaving `next build` and `next dev` on one `.next` corrupts `next/font`
  hashes (fonts fall back to system). Fix: `rm -rf .next`.
- `@theme inline` tokens are not real custom properties — plain CSS must use
  `--font-display`/`--font-control` directly.
- Nobody has listened to the audio on real speakers yet; the capture script
  only proves the graph runs.
