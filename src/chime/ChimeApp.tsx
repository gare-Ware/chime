'use client';

// CHIME orchestrator. The gate is an instrument: strings in the doorway, drones
// on the steps, loop memory on the dome ticks. React owns discrete state (step,
// drone, loop, sound); the engine owns everything per-frame.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { FADE, INK, INK_FROM, PANEL_SPRING, PRESS, fadeSlide } from '@/lib/motion';
import { CHIME, type ChimeStep } from './chime';
import { createChimeAudio, type ChimeAudio } from './audio';
import { createChimeEngine, emptyElements, type ChimeEngine } from './engine';
import { KEYS_DRAWER_ID, KeysDrawer } from './KeysDrawer';
import { Gate, STEPS, STEP_H, STEP_PITCH, drawnStepIndex } from './Gate';
import { Strings, stringDrawDelayMs } from './Strings';
import { columnForRank, STRING_KEYS, STRINGS } from './layout';
import { DRONE_MIDI, STRING_MIDI, noteName } from './scale';

const hintVariants = fadeSlide('below');
const WORDMARK_WGHT = 560;
const SEED = 'chime';

type AudioStatus = ReturnType<ChimeAudio['state']>;

interface Flags {
  fast: boolean;
  demo: boolean;
}

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

export function ChimeApp() {
  const reducedMotion = useReducedMotion() ?? false;

  // Client-only mount: the URL flags decide the arrival timing.
  const [flags, setFlags] = useState<Flags | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFlags({ fast: params.has('fast'), demo: params.has('demo') });
  }, []);

  const [step, setStep] = useState<ChimeStep>('arrival');
  const [hintReady, setHintReady] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('none');
  const [muted, setMuted] = useState(false);
  const [loopOn, setLoopOn] = useState(false);
  const [hasLoop, setHasLoop] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [pluckCount, setPluckCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(0);

  const elementsRef = useRef(emptyElements());
  const audioRef = useRef<ChimeAudio | null>(null);
  const engineRef = useRef<ChimeEngine | null>(null);
  const stepRef = useRef<ChimeStep>('arrival');
  const loopOnRef = useRef(false);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const timeScale = flags?.fast ? CHIME.arrival.fastScale : 1;

  // ── Engine + audio lifetime ───────────────────────────────────────────────
  useEffect(() => {
    if (!flags) return;
    const audio = createChimeAudio();
    audio.onStateChange(setAudioStatus);
    const engine = createChimeEngine({
      elements: elementsRef.current,
      audio,
      reducedMotion,
      loopLengthMs: flags.fast ? CHIME.loop.fastLengthMs : CHIME.loop.lengthMs,
      // Both setters bail out once the value stops changing, so a strum does
      // not re-render React per note.
      onUserPluck: () => setPluckCount((n) => Math.min(CHIME.hint.hideAfterPlucks, n + 1)),
      onLoopCount: (count) => setHasLoop(count > 0),
    });
    audioRef.current = audio;
    engineRef.current = engine;

    // Autoplay policy: the context may only start inside a user gesture. iOS
    // counts pointerup/touchend/click, not pointerdown, so listen to all.
    const unlock = () => {
      audio.unlock();
      setAudioStatus(audio.state());
    };
    const gestures = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
    gestures.forEach((type) => window.addEventListener(type, unlock, { passive: true }));

    if (flags.fast || flags.demo) {
      (window as unknown as { __chime?: unknown }).__chime = {
        audioState: () => audio.state(),
        stats: () => audio.stats(),
        measure: () => audio.measure(),
        loopEvents: () => engine.loopEventCount(),
      };
    }

    return () => {
      gestures.forEach((type) => window.removeEventListener(type, unlock));
      engine.destroy();
      audio.destroy();
      audioRef.current = null;
      engineRef.current = null;
      loopOnRef.current = false;
      setLoopOn(false);
      setHasLoop(false);
    };
  }, [flags, reducedMotion]);

  // ── Arrival ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!flags) return;
    const timers: number[] = [];
    const a = CHIME.arrival;
    const count = CHIME.strings.count;
    const drawMs = a.stringDrawMs * timeScale;

    if (!reducedMotion) {
      // Each string shivers as it lands. It sounds only if audio is already
      // running; the engine skips sound otherwise.
      for (let rank = 0; rank < count; rank += 1) {
        timers.push(
          window.setTimeout(
            () => {
              engineRef.current?.pluck(columnForRank(rank, count), CHIME.pluck.arrivalVelocity, {
                u: 0.5,
                record: false,
                user: false,
              });
            },
            stringDrawDelayMs(rank, timeScale) + drawMs,
          ),
        );
      }
    }

    const playingAt = reducedMotion
      ? a.reduced.playingAtMs
      : stringDrawDelayMs(count - 1, timeScale) + drawMs + a.settleMs * timeScale;
    timers.push(window.setTimeout(() => setStep('playing'), playingAt));
    timers.push(window.setTimeout(() => setHintReady(true), playingAt + a.hintDelayMs * timeScale));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [flags, reducedMotion, timeScale]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleStep = useCallback((droneStep: number) => {
    setActiveStep((current) => (current === droneStep ? null : droneStep));
  }, []);
  useEffect(() => {
    audioRef.current?.setDrone(activeStep);
  }, [activeStep]);

  const toggleLoop = useCallback(() => {
    const next = !loopOnRef.current;
    loopOnRef.current = next;
    engineRef.current?.setLoop(next);
    setLoopOn(next);
    setAnnouncement(next ? 'loop on' : 'loop off');
  }, []);

  const clearLoop = useCallback(() => {
    engineRef.current?.clearLoop();
    setAnnouncement('loop cleared');
  }, []);

  const toggleSound = useCallback(() => {
    // The first press only wakes the audio (the window listener has already
    // asked); it should not also mute it.
    const audio = audioRef.current;
    if (audio && audio.state() !== 'running' && !muted) {
      setAnnouncement('sound on');
      return;
    }
    const next = !muted;
    setMuted(next);
    audio?.setMuted(next);
    setAnnouncement(next ? 'sound off' : 'sound on');
  }, [muted]);

  const pluckColumn = useCallback((column: number) => {
    if (stepRef.current !== 'playing') return;
    engineRef.current?.pluck(column, CHIME.pluck.keyVelocity, { u: 0.3 });
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || stepRef.current !== 'playing') return;
      const key = e.key.toLowerCase();
      const column = (STRING_KEYS as readonly string[]).indexOf(key);
      if (column >= 0) {
        if (!e.repeat) pluckColumn(column);
        // ' opens quick-find in Firefox.
        e.preventDefault();
        return;
      }
      if (e.repeat) return;
      if (key >= '1' && key <= '4') {
        toggleStep(Number(key) - 1);
      } else if (key === 'backspace') {
        clearLoop();
        e.preventDefault();
      } else if (key === ' ') {
        // On a focused button, space belongs to that button.
        if (e.target instanceof HTMLElement && e.target.closest('button')) return;
        toggleLoop();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pluckColumn, toggleStep, toggleLoop, clearLoop]);

  // ── Pointer (the whole scene is the play surface, so a strum can start
  //    outside the doorway) ─────────────────────────────────────────────────
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (step !== 'playing' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // Capture can throw for a pointer the browser no longer tracks; the
    // pluck must still register.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    engineRef.current?.pointerDown(e.pointerId, e.clientX, e.clientY);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const native = e.nativeEvent;
    const samples =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    if (samples.length > 1) {
      samples.forEach((s) => engine.pointerMove(e.pointerId, s.clientX, s.clientY));
    } else {
      engine.pointerMove(e.pointerId, e.clientX, e.clientY);
    }
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    engineRef.current?.pointerUp(e.pointerId);
  };

  // ── ?demo=1: a scripted strum, plucks and a drone for the capture script ──
  useEffect(() => {
    if (!flags?.demo || step !== 'playing') return;
    const d = CHIME.demo;
    const timers: number[] = [];
    const strum = (columns: number[]) =>
      columns.forEach((column, i) =>
        engineRef.current?.pluck(column, 0.9, {
          u: 0.38,
          delay: (i * d.strumGapMs) / 1000,
          user: false,
        }),
      );
    const all = STRINGS.map((s) => s.column);
    timers.push(window.setTimeout(() => strum(all), d.strumAtMs));
    d.plucks.forEach((p) =>
      timers.push(
        window.setTimeout(
          () => engineRef.current?.pluck(p.column, p.velocity, { user: false }),
          p.atMs,
        ),
      ),
    );
    timers.push(window.setTimeout(() => setActiveStep(d.droneStep), d.droneAtMs));
    timers.push(window.setTimeout(() => strum([...all].reverse()), d.backStrumAtMs));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [flags, step]);

  // ── Hint copy ─────────────────────────────────────────────────────────────
  const soundAsleep = !muted && (audioStatus === 'none' || audioStatus === 'suspended');
  const hint =
    step !== 'playing' || !hintReady || drawerOpen
      ? null
      : soundAsleep
        ? 'tap to wake the sound'
        : pluckCount < CHIME.hint.hideAfterPlucks && activeStep === null
          ? 'strum · pluck · step for a drone'
          : null;

  const soundOn = !muted && audioStatus === 'running';
  const playing = step === 'playing';

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="chime-root fixed inset-0 overflow-clip"
        data-step={step}
        style={{ background: 'var(--background)' }}
      >
        <h1 className="sr-only">CHIME</h1>
        <p className="sr-only">
          Eleven strings hang in a gateway. Keys A S D F G H J K L semicolon apostrophe pluck them
          left to right. Keys 1 to 4 hold a drone on a step. Space toggles the loop; backspace
          clears it.
        </p>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>

        {flags ? (
          <>
            {/* The sliding scene: on narrow viewports the whole stage yields
                to the keys drawer below. */}
            <motion.div
              className="absolute inset-0"
              animate={{ y: drawerOpen && isMobile ? -drawerHeight : 0 }}
              transition={PANEL_SPRING}
            >
              <div
                className="absolute inset-0"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
              >
                {/* Wordmark: poster masthead behind the gate. pl matches the tracking so the centred text does not
                  sit left. */}
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-[calc(50%-var(--stage-h)*0.41)] -translate-y-1/2 pl-[0.55em] text-center font-[family-name:var(--font-display)] text-[min(calc(var(--stage-h)*0.115),15vw)] tracking-[0.55em] text-foreground"
                  variants={{
                    arrive: {
                      opacity: reducedMotion ? 0.35 : [0, 0.8, 0.8, 0.35],
                      fontVariationSettings: `"wght" ${WORDMARK_WGHT}`,
                      transition: {
                        opacity: {
                          duration: 3.4 * timeScale,
                          delay: (CHIME.arrival.wordmarkAtMs * timeScale) / 1000,
                          times: [0, 0.22, 0.78, 1],
                        },
                        fontVariationSettings: reducedMotion
                          ? { duration: 0.2 }
                          : { ...INK, delay: 0.55 * timeScale },
                      },
                    },
                  }}
                  initial={{ opacity: 0, fontVariationSettings: `"wght" ${INK_FROM}` }}
                  animate="arrive"
                >
                  CHIME
                </motion.div>

                <Gate
                  seed={SEED}
                  reducedMotion={reducedMotion}
                  timeScale={timeScale}
                  activeStep={activeStep}
                  registerTick={(i, el) => {
                    elementsRef.current.ticks[i] = el;
                  }}
                  registerBead={(el) => {
                    elementsRef.current.bead = el;
                  }}
                  registerSvg={(el) => {
                    elementsRef.current.svg = el;
                  }}
                >
                  <Strings
                    elements={elementsRef.current}
                    reducedMotion={reducedMotion}
                    timeScale={timeScale}
                  />
                </Gate>

                {/* Hint, anchored to the apron below the gate's feet (0.447 of
                  --stage-h below centre), floored above the corner chips. */}
                <AnimatePresence mode="wait">
                  {hint && (
                    <motion.p
                      key={hint}
                      variants={reducedMotion ? FADE : hintVariants}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      className="pointer-events-none absolute inset-x-0 bottom-[max(calc(50%-var(--stage-h)*0.447-30px),16px)] text-center font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/40"
                    >
                      {hint}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Keyboard and assistive-tech controls, registered to the gate box.
                String buttons ignore the pointer (the surface above handles
                it); step buttons take it. */}
              <div
                className="chime-overlay"
                style={{ '--chime-breathe-s': `${CHIME.drones.breatheS}s` } as CSSProperties}
              >
                {STRINGS.map((s) => (
                  <button
                    key={s.column}
                    type="button"
                    className="chime-string-btn"
                    disabled={!playing}
                    aria-label={`string ${noteName(STRING_MIDI[s.rank])}`}
                    aria-keyshortcuts={STRING_KEYS[s.column]}
                    onClick={() => pluckColumn(s.column)}
                    style={{
                      left: pct(s.x - CHIME.strings.spacing / 2, CHIME.view.w),
                      top: pct(s.yTop, CHIME.view.h),
                      width: pct(CHIME.strings.spacing, CHIME.view.w),
                      height: pct(s.length, CHIME.view.h),
                    }}
                  />
                ))}
                {DRONE_MIDI.map((midi, droneStep) => {
                  const drawn = STEPS[drawnStepIndex(droneStep)];
                  return (
                    <button
                      key={droneStep}
                      type="button"
                      className="chime-step-btn"
                      disabled={!playing}
                      aria-pressed={activeStep === droneStep}
                      aria-label={`step ${droneStep + 1}, drone ${noteName(midi)}`}
                      aria-keyshortcuts={String(droneStep + 1)}
                      onClick={() => toggleStep(droneStep)}
                      style={{
                        left: pct(200 - drawn.w / 2, CHIME.view.w),
                        top: pct(drawn.y + STEP_H / 2 - STEP_PITCH / 2, CHIME.view.h),
                        width: pct(drawn.w, CHIME.view.w),
                        height: pct(STEP_PITCH, CHIME.view.h),
                      }}
                    />
                  );
                })}
              </div>
            </motion.div>

            <KeysDrawer
              open={drawerOpen}
              isMobile={isMobile}
              activeStep={activeStep}
              loopOn={loopOn}
              onContentHeight={setDrawerHeight}
            />

            {/* Chip strip, control voice: sound left, the drawer trigger in
                the middle, loop right. It floats above the drawer. */}
            <AnimatePresence>
              {playing && (
                <motion.div
                  key="chips"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reducedMotion ? 0.12 : 0.5 }}
                >
                  <div
                    className="chime-chip-strip fixed inset-x-0 z-40"
                    style={{
                      bottom: 'max(1rem, env(safe-area-inset-bottom))',
                      paddingLeft: 'max(1rem, env(safe-area-inset-left))',
                      paddingRight: 'max(1rem, env(safe-area-inset-right))',
                    }}
                  >
                    <motion.button
                      type="button"
                      className="chime-chip justify-self-start"
                      aria-pressed={soundOn}
                      onClick={toggleSound}
                      {...PRESS}
                    >
                      {soundOn ? 'sound on' : 'sound off'}
                    </motion.button>
                    <motion.button
                      type="button"
                      className="chime-chip flex items-center gap-2"
                      aria-expanded={drawerOpen}
                      aria-controls={KEYS_DRAWER_ID}
                      onClick={() => setDrawerOpen((open) => !open)}
                      {...PRESS}
                    >
                      <motion.span
                        aria-hidden
                        animate={{ rotate: drawerOpen ? 180 : 0 }}
                        transition={PANEL_SPRING}
                        className="text-[11px]"
                      >
                        ▴
                      </motion.span>
                      {drawerOpen ? 'done' : 'keys'}
                    </motion.button>
                    <div className="flex items-center justify-self-end">
                      <motion.button
                        type="button"
                        className="chime-chip"
                        disabled={!hasLoop}
                        onClick={clearLoop}
                        {...PRESS}
                      >
                        clear
                      </motion.button>
                      <motion.button
                        type="button"
                        className="chime-chip"
                        aria-pressed={loopOn}
                        onClick={toggleLoop}
                        {...PRESS}
                      >
                        {loopOn ? 'loop on' : 'loop off'}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : null}
      </main>
    </MotionConfig>
  );
}
