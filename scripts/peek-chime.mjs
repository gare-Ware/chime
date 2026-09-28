// CHIME frame-capture harness. Drives the running dev server (port 3000) and
// saves stills at each beat, at desktop and phone sizes. Also asserts what can
// be asserted about audio without ears: the AudioContext reaches `running`
// after a gesture, and plucks/drones create nodes without throwing.
// Usage: node scripts/peek-chime.mjs [outdir]
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '.captures/chime';
const base = process.env.CHIME_URL ?? 'http://localhost:3000/';
mkdirSync(out, { recursive: true });

const SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

// If the Playwright package and the downloaded browser revisions disagree,
// fall back to whichever headless shell is in the cache.
async function launch() {
  const args = ['--autoplay-policy=user-gesture-required'];
  try {
    return await chromium.launch({ args });
  } catch (err) {
    const cache = join(homedir(), 'Library/Caches/ms-playwright');
    const dir = existsSync(cache)
      ? readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop()
      : null;
    if (!dir) throw err;
    const inner = readdirSync(join(cache, dir)).find((d) => d.startsWith('chrome-'));
    return chromium.launch({
      args,
      executablePath: join(cache, dir, inner, 'chrome-headless-shell'),
    });
  }
}

const browser = await launch();
const problems = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) problems.push(`assertion failed: ${label} ${detail}`);
};

// String x positions in gate units (mirrors CHIME.strings in chime.ts).
const stringX = (column) => 200 + (column - 5) * 21;

for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
    hasTouch: size.name === 'mobile',
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      problems.push(`[${size.name}] console.${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => problems.push(`[${size.name}] pageerror: ${err.message}`));
  const shot = (name) => page.screenshot({ path: `${out}/${size.name}-${name}.png` });
  const open = async (query) => {
    await page.goto(base + query, { waitUntil: 'domcontentloaded' });
    // The Next dev badge sits where the sound chip is.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.waitForSelector('svg[role="img"]');
  };
  // Gate units → page pixels.
  const gatePoint = async (x, y) => {
    const box = await page.locator('svg[role="img"]').boundingBox();
    return { x: box.x + (x / 400) * box.width, y: box.y + (y / 640) * box.height };
  };

  // ── Pass 1: the real arrival ──────────────────────────────────────────────
  await open('');
  await page.waitForTimeout(650);
  await shot('01-arrival-gate-drawing');
  await page.waitForTimeout(1250);
  await shot('02-arrival-strings-drawing');
  await page.waitForSelector('[data-step="playing"]', { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await shot('03-strings-at-rest');

  // ── Pass 2: ?demo=1 — scripted strum, plucks, drone; audio never unlocked,
  //    so this also proves rendering does not depend on the AudioContext ────
  await open('?fast=1&demo=1');
  await page.waitForSelector('[data-step="playing"]', { timeout: 15_000 });
  await page.waitForTimeout(520);
  await shot('04-demo-mid-strum');
  await page.waitForTimeout(450);
  await shot('05-demo-strum-ringing');
  await page.waitForTimeout(1350);
  await shot('06-demo-plucks');
  await page.waitForTimeout(700);
  await shot('07-demo-drone-step');
  const demoAudio = await page.evaluate(() => window.__chime.audioState());
  check(`[${size.name}] demo ran with audio locked`, demoAudio === 'none', demoAudio);

  // ── Pass 3: real input ────────────────────────────────────────────────────
  await open('?fast=1');
  await page.waitForSelector('[data-step="playing"]', { timeout: 15_000 });
  await page.waitForTimeout(600);
  await shot('08-hint-wake');

  // First gesture: a tap on the centre string unlocks audio.
  const centre = await gatePoint(stringX(5), 330);
  await page.mouse.click(centre.x, centre.y);
  await page.waitForFunction(() => window.__chime.audioState() === 'running', null, {
    timeout: 5000,
  }).catch(() => {});
  const state = await page.evaluate(() => window.__chime.audioState());
  check(`[${size.name}] AudioContext running after a click`, state === 'running', state);
  // Nobody can listen to a headless run, so measure the output instead: track
  // the peak level for the rest of the pass, and check that single plucks come
  // out at the pitch the scale table says.
  await page.evaluate(() => {
    window.__peak = 0;
    setInterval(() => {
      const m = window.__chime.measure();
      if (m) window.__peak = Math.max(window.__peak, m.peak);
    }, 15);
  });
  for (const [key, hz, name] of [
    ['h', 196.0, 'G3 (centre)'],
    ['d', 440.0, 'A4'],
    ["'", 659.26, 'E5 (right edge)'],
  ]) {
    await page.waitForTimeout(1600);
    await page.keyboard.press(key);
    await page.waitForTimeout(260);
    const m = await page.evaluate(() => window.__chime.measure());
    const ratio = m.loudestHz / hz;
    check(
      `[${size.name}] ${name} sounds at ${hz} Hz`,
      Math.abs(ratio - 1) < 0.04, // the fundamental itself is the loudest partial
      `loudest bin ${m.loudestHz.toFixed(1)} Hz, peak ${m.peak.toFixed(3)}`,
    );
  }
  await page.waitForTimeout(1200);
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(120);
  await shot('09-pluck-centre');

  // Strum: drag from outside the left wall to outside the right wall.
  const from = await gatePoint(30, 300);
  const to = await gatePoint(370, 360);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const moves = 14;
  for (let i = 1; i <= moves; i += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / moves,
      from.y + ((to.y - from.y) * i) / moves,
    );
    await page.waitForTimeout(16);
    if (i === 9) await shot('10-strum-mid-drag');
  }
  await page.mouse.up();
  await shot('11-strum-released');
  let stats = await page.evaluate(() => window.__chime.stats());
  check(`[${size.name}] strum started ≥ 11 voices`, stats.voicesStarted >= 15, JSON.stringify(stats));

  // Touch strum (phone pass only): real touch events through CDP, right to
  // left, with a second finger held on a string to confirm multi-touch.
  if (size.name === 'mobile') {
    const cdp = await context.newCDPSession(page);
    const beforeTouch = (await page.evaluate(() => window.__chime.stats())).voicesStarted;
    const held = await gatePoint(stringX(2), 420);
    const touch = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })),
      });
    await touch('touchStart', [held]);
    await touch('touchStart', [held, to]);
    for (let i = 1; i <= 12; i += 1) {
      const p = { x: to.x + ((from.x - to.x) * i) / 12, y: to.y + ((from.y - to.y) * i) / 12 };
      await touch('touchMove', [held, p]);
      await page.waitForTimeout(16);
      if (i === 8) await shot('11b-touch-strum');
    }
    await touch('touchEnd', []);
    const afterTouch = (await page.evaluate(() => window.__chime.stats())).voicesStarted;
    check(
      `[mobile] touch strum with a held second finger fired ≥ 12 voices`,
      afterTouch - beforeTouch >= 12,
      `${beforeTouch} → ${afterTouch}`,
    );
  }

  // Keyboard plucks, left to right.
  await page.waitForTimeout(900);
  for (const key of ['a', 'd', 'g', 'j', "'"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(70);
  }
  await shot('12-keyboard-plucks');

  // Step drone: click the bottom step, then switch with the keyboard.
  const step = await gatePoint(200 + 150, 588);
  await page.mouse.click(step.x, step.y);
  await page.waitForTimeout(900);
  await shot('13-drone-step-1');
  const pressed = await page.getByRole('button', { name: /step 1/ }).getAttribute('aria-pressed');
  check(`[${size.name}] step 1 aria-pressed`, pressed === 'true', String(pressed));
  await page.keyboard.press('3');
  await page.waitForTimeout(700);
  await shot('14-drone-step-3');

  // Loop: turn on, play a few notes, wait one pass, catch the replay.
  await page.getByRole('button', { name: /loop off/ }).click();
  await page.waitForTimeout(350);
  for (const key of ['g', 'h', 'f']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(220);
  }
  const recorded = await page.evaluate(() => window.__chime.loopEvents());
  check(`[${size.name}] loop recorded 3 notes`, recorded === 3, String(recorded));
  await shot('15-loop-recording');
  const before = (await page.evaluate(() => window.__chime.stats())).voicesStarted;
  await page.waitForTimeout(2550); // fast loop is 3s: the first note replays about now
  await shot('16-loop-replay');
  await page.waitForTimeout(260);
  await shot('17-loop-replay-2');
  await page.waitForTimeout(600);
  stats = await page.evaluate(() => window.__chime.stats());
  check(
    `[${size.name}] loop replayed notes on the audio clock`,
    stats.voicesStarted >= before + 3,
    `${before} → ${stats.voicesStarted}`,
  );
  const peak = await page.evaluate(() => window.__peak);
  check(
    `[${size.name}] output peak stays under 0.9 full scale`,
    peak > 0.01 && peak < 0.9,
    `${peak.toFixed(3)} (${(20 * Math.log10(peak)).toFixed(1)} dBFS) across strum, drones and loop`,
  );
  check(`[${size.name}] no audio errors`, stats.errors === 0, JSON.stringify(stats));
  check(`[${size.name}] a drone started`, stats.dronesStarted >= 2, JSON.stringify(stats));

  // Clear, sound off, focus ring.
  await page.keyboard.press('Backspace');
  const cleared = await page.evaluate(() => window.__chime.loopEvents());
  check(`[${size.name}] backspace clears the loop`, cleared === 0, String(cleared));
  await page.getByRole('button', { name: /sound on/ }).click();
  await page.getByRole('button', { name: /string G3/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await shot('18-focus-ring-sound-off');

  // No scroll, no horizontal overflow.
  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  check(
    `[${size.name}] no overflow`,
    overflow.sw <= overflow.w && overflow.sh <= overflow.h,
    JSON.stringify(overflow),
  );

  await context.close();
}

// ── Reduced motion: strings brighten but do not move ────────────────────────
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => problems.push(`[reduced] pageerror: ${err.message}`));
  await page.goto(base + '?fast=1', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.waitForSelector('[data-step="playing"]', { timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.keyboard.press('g');
  await page.keyboard.press('k');
  await page.keyboard.press(' ');
  await page.waitForTimeout(140);
  const straight = await page.evaluate(() =>
    [...document.querySelectorAll('path.chime-string')].every(
      (p) => (p.getAttribute('d').match(/L/g) ?? []).length === 1,
    ),
  );
  check('[reduced] strings stay straight when plucked', straight);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/reduced-01-pluck-and-loop.png` });
  await context.close();
}

await browser.close();
if (problems.length) {
  console.log('PROBLEMS:');
  for (const p of problems) console.log('  ' + p);
} else {
  console.log('no console errors, all assertions passed');
}
console.log('done:', out);
