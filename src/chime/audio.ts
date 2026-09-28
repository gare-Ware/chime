// Web Audio for CHIME: plucked-string voices, step drones, a reverb send, and
// a compressor on the master. No assets and no dependencies; the string
// samples are rendered at unlock by pluckSynth.ts.
//
// Signal path:
//   voice (buffer → lowpass → gain) ─┬─────────────► master ► compressor ► out
//                                    └► send ► convolver ► wet ─┘
//   drone (4 osc → lowpass → gain) ──┴ (same two buses, lower send)
//
// The context is created on the first user gesture (autoplay policy). Every
// public method is safe to call before that, or when Web Audio is missing.

import { seededRng } from '@/lib/seed';
import { CHIME } from './chime';
import { columnForRank, rankFraction } from './layout';
import { renderPluck } from './pluckSynth';
import { DRONE_MIDI, midiToFreq, STRING_MIDI } from './scale';

type AudioState = 'none' | 'suspended' | 'running' | 'closed' | 'unavailable';

interface Voice {
  gain: GainNode;
  source: AudioBufferSourceNode;
}

interface Drone {
  gain: GainNode;
  oscillators: OscillatorNode[];
}

export interface ChimeAudio {
  /** Call from a user-gesture handler. Creates or resumes the context. */
  unlock(): void;
  state(): AudioState;
  /** Context time now, or null when the context is not running. */
  now(): number | null;
  /** Pluck `column` at context time `when` (default: now). */
  pluck(column: number, velocity: number, when?: number): void;
  setDrone(step: number | null): void;
  setMuted(muted: boolean): void;
  /** Counters for the capture script's assertions. */
  stats(): { voicesStarted: number; dronesStarted: number; errors: number };
  /**
   * Measurements of the final output for the capture script (nobody can listen
   * in a headless run): peak sample magnitude over the last ~40 ms, and the
   * frequency of the strongest spectral bin.
   */
  measure(): { peak: number; loudestHz: number } | null;
  onStateChange(listener: (state: AudioState) => void): void;
  destroy(): void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function createChimeAudio(): ChimeAudio {
  const cfg = CHIME.synth;
  let ctx: AudioContext | null = null;
  let unavailable = false;
  let master: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let dryBus: GainNode | null = null;
  let sendBus: GainNode | null = null;
  let buffers: AudioBuffer[] = []; // by column
  const current: (Voice | null)[] = Array.from({ length: CHIME.strings.count }, () => null);
  let drone: Drone | null = null;
  let droneStep: number | null = null;
  let muted = false;
  let listener: ((state: AudioState) => void) | null = null;
  const counters = { voicesStarted: 0, dronesStarted: 0, errors: 0 };

  const state = (): AudioState => {
    if (unavailable) return 'unavailable';
    if (!ctx) return 'none';
    return ctx.state === 'running' ? 'running' : ctx.state === 'closed' ? 'closed' : 'suspended';
  };

  function build(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      unavailable = true;
      return;
    }
    ctx = new Ctor({ latencyHint: 'interactive' });
    ctx.onstatechange = () => {
      listener?.(state());
      // A drone chosen before the context was running starts now.
      if (state() === 'running' && droneStep !== null && !drone) startDrone(droneStep);
    };

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.22;
    compressor.connect(ctx.destination);
    // A tap on the final output, read only by measure().
    analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    compressor.connect(analyser);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : cfg.master;
    master.connect(compressor);

    dryBus = ctx.createGain();
    dryBus.connect(master);

    // Reverb: a convolver fed a generated impulse (decaying filtered noise).
    sendBus = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, cfg.reverbS);
    const wet = ctx.createGain();
    wet.gain.value = cfg.reverbLevel;
    sendBus.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);

    // One sample per string, indexed by column.
    const rng = seededRng('chime-strings');
    buffers = [];
    for (let rank = 0; rank < CHIME.strings.count; rank += 1) {
      const f = rankFraction(rank);
      const samples = renderPluck({
        freq: midiToFreq(STRING_MIDI[rank]),
        sampleRate: ctx.sampleRate,
        t60: lerp(cfg.t60LowS, cfg.t60HighS, f),
        brightness: lerp(cfg.brightnessLow, cfg.brightnessHigh, f),
        pluckPoint: cfg.pluckPoint,
        noiseMix: cfg.noiseMix,
        rng,
      });
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.getChannelData(0).set(samples);
      buffers[columnForRank(rank, CHIME.strings.count)] = buffer;
    }
  }

  function makeImpulse(context: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    const rng = seededRng('chime-room');
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      let lp = 0;
      for (let n = 0; n < length; n += 1) {
        const t = n / length;
        // The lowpass closes as the tail decays, like air absorption.
        lp += (0.5 - 0.38 * t) * (rng() * 2 - 1 - lp);
        data[n] = lp * (1 - t) ** 2.4 * Math.min(1, n / 200);
      }
    }
    return impulse;
  }

  function startDrone(step: number): void {
    if (!ctx || !dryBus || !sendBus) return;
    const d = CHIME.drones;
    const f = midiToFreq(DRONE_MIDI[step]);
    const t = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(d.level, t + d.attackS);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = d.cutoffHz;
    filter.Q.value = 0.4;
    filter.connect(gain);
    gain.connect(dryBus);
    const send = ctx.createGain();
    send.gain.value = cfg.reverbSend * 0.6;
    gain.connect(send);
    send.connect(sendBus);

    // Two detuned fundamentals, an octave, and a quiet twelfth. The upper
    // partials keep the note audible on small speakers.
    const partials: { type: OscillatorType; ratio: number; cents: number; level: number }[] = [
      { type: 'sine', ratio: 1, cents: -d.detuneCents, level: 0.5 },
      { type: 'triangle', ratio: 1, cents: d.detuneCents, level: 0.4 },
      { type: 'sine', ratio: 2, cents: d.detuneCents / 2, level: 0.22 },
      { type: 'sine', ratio: 3, cents: -d.detuneCents / 2, level: 0.07 },
    ];
    const oscillators = partials.map((p) => {
      const osc = ctx!.createOscillator();
      osc.type = p.type;
      osc.frequency.value = f * p.ratio;
      osc.detune.value = p.cents;
      const level = ctx!.createGain();
      level.gain.value = p.level;
      osc.connect(level);
      level.connect(filter);
      osc.start(t);
      return osc;
    });

    drone = { gain, oscillators };
    counters.dronesStarted += 1;
  }

  function stopDrone(): void {
    if (!ctx || !drone) return;
    const d = CHIME.drones;
    const t = ctx.currentTime;
    const old = drone;
    drone = null;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + d.releaseS);
    old.oscillators.forEach((osc) => osc.stop(t + d.releaseS + 0.05));
  }

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      counters.errors += 1;
      console.error('[chime audio]', err);
    }
  };

  return {
    unlock() {
      guard(() => {
        if (unavailable) return;
        if (!ctx) build();
        if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
      });
    },

    state,

    now: () => (ctx && ctx.state === 'running' ? ctx.currentTime : null),

    pluck(column, velocity, when) {
      guard(() => {
        if (!ctx || ctx.state !== 'running' || muted || !dryBus || !sendBus) return;
        const buffer = buffers[column];
        if (!buffer) return;
        const t = Math.max(ctx.currentTime, when ?? 0);
        const v = Math.min(1, Math.max(0, velocity));

        // A string has one voice: the previous one fades as the new one starts.
        const previous = current[column];
        if (previous) {
          previous.gain.gain.cancelScheduledValues(t);
          previous.gain.gain.setTargetAtTime(0, t, cfg.chokeS / 3);
          previous.source.stop(t + cfg.chokeS * 4);
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = lerp(cfg.cutoffMinHz, cfg.cutoffMaxHz, v * v);
        filter.Q.value = 0.3;
        const gain = ctx.createGain();
        gain.gain.value = cfg.level * (0.25 + 0.75 * v * v);
        const send = ctx.createGain();
        send.gain.value = cfg.reverbSend;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(dryBus);
        gain.connect(send);
        send.connect(sendBus);
        source.start(t);

        const voice: Voice = { gain, source };
        current[column] = voice;
        source.onended = () => {
          gain.disconnect();
          send.disconnect();
          if (current[column] === voice) current[column] = null;
        };
        counters.voicesStarted += 1;
      });
    },

    setDrone(step) {
      guard(() => {
        droneStep = step;
        stopDrone();
        if (step !== null && ctx && ctx.state === 'running') startDrone(step);
      });
    },

    setMuted(next) {
      guard(() => {
        muted = next;
        if (!ctx || !master) return;
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(next ? 0 : cfg.master, t, cfg.muteRampS / 3);
      });
    },

    stats: () => ({ ...counters }),

    measure() {
      if (!ctx || !analyser) return null;
      const wave = new Float32Array(2048);
      analyser.getFloatTimeDomainData(wave);
      let peak = 0;
      for (const sample of wave) peak = Math.max(peak, Math.abs(sample));
      const bins = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(bins);
      let loudest = 0;
      for (let i = 1; i < bins.length; i += 1) if (bins[i] > bins[loudest]) loudest = i;
      return { peak, loudestHz: (loudest * ctx.sampleRate) / analyser.fftSize };
    },

    onStateChange(next) {
      listener = next;
    },

    destroy() {
      listener = null;
      const old = ctx;
      ctx = null;
      drone = null;
      if (old && old.state !== 'closed') void old.close().catch(() => {});
    },
  };
}
