'use client';

// The keys drawer: a map of every keyboard shortcut, in the control voice.
// Same mechanics as HATCH's tune drawer. On narrow viewports ChimeApp slides
// the whole stage up by the drawer's measured height (the app itself is the
// drawer); on desktop the drawer rises as a bottom bar. The corner chips stay
// on top and sit in the drawer's bottom strip.
//
// The map is read-only: the instrument keeps listening while it is open, so
// you can read a key and play it.

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { PANEL_SPRING } from '@/lib/motion';
import { CHIME } from './chime';
import { STRING_KEYS, STRINGS } from './layout';
import { DRONE_MIDI, STRING_MIDI, noteName } from './scale';

export const KEYS_DRAWER_ID = 'keys-drawer';

// Tallest string mark in the map, px. Marks scale with each string's drawn
// length, so the row reads as the doorway in miniature: longest in the centre.
const MARK_MAX_PX = 26;
const LONGEST = Math.max(...STRINGS.map((s) => s.length));

// Key caps show the glyph printed on the key, not the event key.
const capLabel = (key: string) => key.toUpperCase();

interface KeysDrawerProps {
  open: boolean;
  isMobile: boolean;
  activeStep: number | null;
  loopOn: boolean;
  /** Height of the content above the chip strip, for the mobile stage slide. */
  onContentHeight: (px: number) => void;
}

export function KeysDrawer({
  open,
  isMobile,
  activeStep,
  loopOn,
  onContentHeight,
}: KeysDrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => onContentHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [onContentHeight]);

  return (
    <motion.div
      id={KEYS_DRAWER_ID}
      role="region"
      aria-label="Keyboard shortcuts"
      // Closed, it is off-screen: keep it out of the tab order and the
      // accessibility tree.
      inert={!open}
      initial={false}
      animate={{ y: open ? 0 : '110%' }}
      transition={PANEL_SPRING}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-foreground/10"
      style={{
        background: 'color-mix(in oklab, var(--foreground) 5%, var(--background))',
        // Room for the chip strip, which floats above the drawer.
        paddingBottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 2.75rem)',
      }}
    >
      <div
        ref={contentRef}
        className={
          isMobile
            ? 'flex flex-col gap-5 px-4 pt-5 pb-2'
            : 'mx-auto flex max-w-4xl flex-wrap items-start justify-center gap-x-14 gap-y-5 px-6 pt-5 pb-2'
        }
      >
        <Section label="strings">
          <ul className="flex items-end gap-1" aria-label="strings, left to right">
            {STRINGS.map((s) => {
              const note = noteName(STRING_MIDI[s.rank]);
              return (
                <li key={s.column} className="flex flex-col items-center gap-1.5">
                  <span
                    aria-hidden
                    className="w-px bg-foreground/35"
                    style={{ height: (s.length / LONGEST) * MARK_MAX_PX }}
                  />
                  <Cap label={capLabel(STRING_KEYS[s.column])} />
                  <span className="sr-only">plucks </span>
                  <Note>{note}</Note>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section label="drones">
          <ul className="flex items-end gap-1.5" aria-label="drones, bottom step to top">
            {DRONE_MIDI.map((midi, i) => (
              <li key={i} className="flex flex-col items-center gap-1.5">
                <Cap label={String(i + 1)} on={activeStep === i} />
                <span className="sr-only">holds the drone </span>
                <Note>
                  {CHIME.drones.labels[i]} · {noteName(midi)}
                </Note>
              </li>
            ))}
          </ul>
        </Section>

        <Section label="loop">
          <ul className="flex flex-col gap-2">
            <Row cap="space" on={loopOn}>
              loop on / off
            </Row>
            <Row cap="⌫" name="backspace">
              clear loop
            </Row>
            <Row cap="esc" name="escape">
              close keys
            </Row>
          </ul>
        </Section>
      </div>
    </motion.div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5" aria-label={label}>
      <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/35">
        {label}
      </h2>
      {children}
    </section>
  );
}

function Cap({ label, name, on = false }: { label: string; name?: string; on?: boolean }) {
  return (
    <kbd
      aria-label={name}
      className={`inline-flex h-7 min-w-[1.625rem] items-center justify-center rounded-[5px] border px-1.5 font-mono text-[11px] not-italic transition-colors ${
        on ? 'border-accent/70 text-accent' : 'border-foreground/20 text-foreground/80'
      }`}
    >
      {label}
    </kbd>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap font-mono text-[9px] tracking-[0.08em] text-foreground/40">
      {children}
    </span>
  );
}

function Row({
  cap,
  name,
  on,
  children,
}: {
  cap: string;
  name?: string;
  on?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-12">
        <Cap label={cap} name={name} on={on} />
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/55">
        {children}
      </span>
    </li>
  );
}
