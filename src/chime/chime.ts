// CHIME — every tunable for the instrument lives in this one object. Pure data: no DOM, no audio nodes.
//
// Units: geometry is in gate viewBox units (400 × 640), times are ms unless
// the key says otherwise, audio levels are linear gain.

export const CHIME = {
  view: { w: 400, h: 640 },

  strings: {
    count: 11,
    centerX: 200,
    // 21 units keeps the outer strings over the top step (x 91–309) and gives
    // each string a ~19px hit zone at 390px wide.
    spacing: 21,
    // The strings hang from the inner amber arch: a semicircle, so the centre
    // string is longest.
    anchor: { cx: 200, cy: 230, r: 124 },
    bottomY: 528, // top edge of the top step
    segments: 36, // polyline resolution of a vibrating string
    widthLow: 1.8, // stroke width of the lowest string
    widthHigh: 0.9, // …and the highest
    restOpacity: 0.6,
  },

  // Major pentatonic from G3, 11 notes = exactly two octaves (G3…G5).
  scale: {
    rootMidi: 55,
    degrees: [0, 2, 4, 7, 9],
  },

  // Step drones, listed from step 1 (bottom, widest, lowest) to step 4 (top).
  // Semitone offsets from the root one octave down: I, IV, V, vi.
  drones: {
    octaveDrop: 12,
    offsets: [0, 5, 7, 9],
    labels: ['I', 'IV', 'V', 'vi'],
    level: 0.11,
    attackS: 1.4,
    releaseS: 1.8,
    cutoffHz: 850,
    detuneCents: 6,
    breatheS: 5.2, // visual breathing period of the active step
  },

  pluck: {
    tapVelocity: 0.8,
    keyVelocity: 0.8,
    arrivalVelocity: 0.16,
    minVelocity: 0.28,
    // Pointer speed (viewBox units per ms) that maps to full velocity.
    fullSpeed: 1.1,
    // One pointer cannot re-fire the same string faster than this.
    refireMs: 70,
    hitSlop: 10.5, // half the spacing: tap zones tile the doorway
  },

  vibration: {
    ampMin: 2.2, // displacement (units) at the quietest pluck
    ampMax: 7.2, // …at full velocity; must stay under spacing / 2
    visualHzLow: 6.5, // drawn oscillation rate, lowest string
    visualHzHigh: 10.5, // …highest string (real pitches would alias)
    modes: 3, // standing-wave modes summed for the pluck shape
    modeDecayPower: 1.35, // higher modes die faster
    restThreshold: 0.06, // amplitude below which a string returns to idle
    glowDecayS: 0.9,
    lensOpacity: 0.16,
    haloOpacity: 0.2,
  },

  synth: {
    t60LowS: 3.8, // ring time of the lowest string
    t60HighS: 1.9, // …of the highest
    brightnessLow: 0.5, // Karplus-Strong averaging blend (0.5 = classic)
    brightnessHigh: 0.34,
    pluckPoint: 0.18, // excitation triangle peak; nearer 0 is brighter
    noiseMix: 0.3, // share of noise in the excitation
    level: 0.32, // per-voice peak gain at full velocity
    cutoffMinHz: 900, // voice lowpass at the softest pluck
    cutoffMaxHz: 7200,
    chokeS: 0.03, // fade of the previous voice on the same string
    reverbSend: 0.26,
    reverbS: 2.4,
    reverbLevel: 0.5,
    master: 0.55,
    muteRampS: 0.08,
  },

  loop: {
    lengthMs: 8000,
    fastLengthMs: 3000,
    lookaheadMs: 140,
    tickMs: 25,
    maxEvents: 256,
    // The playhead sweeps the dome between the first and last tick.
    sweepDeg: 75,
    beadRadius: 163.5,
    dome: { cx: 200, cy: 214 },
    tickFlashDecayS: 0.55,
    beadEdgeFade: 0.04, // fraction of the loop spent fading at each end
  },

  arrival: {
    gateDrawMs: 950,
    wordmarkAtMs: 350,
    stringsAtMs: 1250,
    stringStaggerMs: 110,
    stringDrawMs: 620,
    settleMs: 250, // after the last string lands, before input goes live
    hintDelayMs: 350,
    // ?fast=1 multiplies every arrival time by this.
    fastScale: 0.3,
    reduced: { playingAtMs: 700 },
  },

  hint: {
    hideAfterPlucks: 12,
  },

  // ?demo=1 script, ms after the step turns 'playing'.
  demo: {
    strumAtMs: 250,
    strumGapMs: 42,
    plucks: [
      { atMs: 1500, column: 5, velocity: 0.9 },
      { atMs: 1850, column: 7, velocity: 0.7 },
      { atMs: 2200, column: 3, velocity: 0.8 },
    ],
    droneAtMs: 2600,
    droneStep: 0,
    backStrumAtMs: 3400,
  },
} as const;

export type ChimeStep = 'arrival' | 'playing';
