# CHIME

A gateway strung like an instrument. Eleven strings hang in the doorway in
kalimba order (centre lowest, G major pentatonic); the four steps hold drones
(I · IV · V · vi); the dome ticks are the playhead of an 8 s loop. Web Audio
only, no samples, no server.

Started as a gateway variant inside HATCH (`/chime` there); this repo is its own
app now.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Node 20+ (`.nvmrc`). `npm run build` · `npm run typecheck` · `npm run lint` ·
`npm test`.

## Play

Drag across the strings to strum, tap to pluck, tap a step for a drone. The
**keys** chip at the bottom opens the shortcut map:

| Keys | Action |
| --- | --- |
| `A S D F G H J K L ; '` | pluck strings, left to right |
| `1`–`4` | drone on a step (I, IV, V, vi) |
| `space` | loop on / off |
| `backspace` | clear the loop |
| `esc` | close the keys drawer |

URL flags: `?fast=1` shortens the arrival; `?demo=1` auto-plays a strum.

## Capture

With the dev server running: `npm run peek -- .captures/chime` saves stills at
desktop and phone sizes and checks the AudioContext reaches `running`.
