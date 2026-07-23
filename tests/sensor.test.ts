/**
 * sensor.test.ts — the fallback input and the attempt pipeline (principle #23).
 *
 * A real mic/tilt/shout cannot be driven by automation, so what CAN be tested is:
 *   (a) the tap fallback's level derivation — mashing raises a decaying level, the
 *       pinpoint needle sweeps and freezes on press;
 *   (b) the attempt controller end-to-end, via the synthetic-feed hook, proving a
 *       level series flows through the countdown → window → evaluator → onDone.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createTapSource } from '../src/tap';
import { runAttempt } from '../src/attempt';
import type { Sample, AttemptResult } from '../src/loudness';

function firePointer(el: HTMLElement, type: string, id = 1): void {
  const e = new Event(type, { bubbles: true }) as Event & { pointerId: number };
  e.pointerId = id;
  el.dispatchEvent(e);
}

describe('tap fallback: mash modes', () => {
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  it('a tap kicks the level up, and it decays with time', () => {
    const pad = document.createElement('div');
    const src = createTapSource('bellow', pad);
    expect(src.level()).toBe(0);

    firePointer(pad, 'pointerdown');
    clock = 1; // a hair later so the tiny decay is negligible
    const afterTap = src.level();
    expect(afterTap).toBeGreaterThan(10);

    clock = 600; // let it decay
    const later = src.level();
    expect(later).toBeLessThan(afterTap);
    src.dispose();
  });

  it('sustained mashing holds a higher level than a single tap', () => {
    const pad = document.createElement('div');
    const src = createTapSource('bellow', pad);
    // One tap, then let it decay 400ms.
    firePointer(pad, 'pointerdown');
    clock = 400;
    const single = src.level();

    // Fresh source: mash every 80ms for a while.
    const src2 = createTapSource('bellow', document.createElement('div'));
    const pad2 = document.createElement('div');
    const s3 = createTapSource('bellow', pad2);
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      clock += 80;
      firePointer(pad2, 'pointerdown');
      peak = Math.max(peak, s3.level());
    }
    expect(peak).toBeGreaterThan(single);
    src.dispose();
    src2.dispose();
    s3.dispose();
  });
});

describe('tap fallback: pinpoint', () => {
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  it('the needle sweeps up over time and freezes while held', () => {
    const pad = document.createElement('div');
    const src = createTapSource('pinpoint', pad);
    src.level(); // prime lastT at clock=0
    clock = 300;
    const a = src.level();
    clock = 600;
    const b = src.level();
    expect(b).toBeGreaterThan(a); // swept up

    // Press to freeze.
    firePointer(pad, 'pointerdown');
    const frozen = src.level();
    clock = 1200;
    expect(src.level()).toBeCloseTo(frozen, 5); // did not move while held

    // Release resumes the sweep.
    firePointer(pad, 'pointerup');
    clock = 1500;
    expect(src.level()).not.toBeCloseTo(frozen, 1);
    src.dispose();
  });

  it('pointercancel is treated as a release, never a stuck freeze', () => {
    const pad = document.createElement('div');
    const src = createTapSource('pinpoint', pad);
    src.level();
    firePointer(pad, 'pointerdown');
    firePointer(pad, 'pointercancel');
    const before = src.level();
    clock = 900;
    // Sweeping again means the value moved.
    expect(src.level()).not.toBeCloseTo(before, 1);
    src.dispose();
  });
});

describe('attempt pipeline via the synthetic feed hook', () => {
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    }),
  );
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { __uproarFeed?: Sample[][] }).__uproarFeed;
  });

  const stubSource = { kind: 'tap' as const, level: () => 0, dispose: () => {} };

  it('replays a fed series and evaluates it against the challenge', () => {
    const fed: Sample[] = [
      { t: 0, v: 10 },
      { t: 40, v: 62 },
      { t: 80, v: 20 },
    ];
    (window as unknown as { __uproarFeed: Sample[][] }).__uproarFeed = [fed];

    let done: AttemptResult | null = null;
    const gos: number[] = [];
    runAttempt({
      source: stubSource,
      challenge: { kind: 'peak', bar: 50 },
      windowMs: 500,
      beatMs: 100,
      cb: {
        onCountdown: (n) => gos.push(n),
        onOpen: () => {},
        onTick: () => {},
        onDone: (r) => {
          done = r;
        },
      },
    });

    vi.advanceTimersByTime(4000);
    expect(gos).toEqual([3, 2, 1, 0]); // full countdown fired
    expect(done).not.toBeNull();
    expect(done!.passed).toBe(true); // peak 62 >= 50
    expect(done!.reading).toBe(62);
  });

  it('a fed series that misses the bar fails', () => {
    (window as unknown as { __uproarFeed: Sample[][] }).__uproarFeed = [
      [
        { t: 0, v: 10 },
        { t: 40, v: 30 },
      ],
    ];
    let done: AttemptResult | null = null;
    runAttempt({
      source: stubSource,
      challenge: { kind: 'peak', bar: 50 },
      windowMs: 500,
      beatMs: 100,
      cb: { onCountdown: () => {}, onOpen: () => {}, onTick: () => {}, onDone: (r) => (done = r) },
    });
    vi.advanceTimersByTime(4000);
    expect(done).not.toBeNull();
    expect(done!.passed).toBe(false);
  });

  it('the LIVE path finishes without ever calling requestAnimationFrame', () => {
    // rAF is paused in a backgrounded/throttled tab; a live window built on it hangs
    // forever. This proves the window closes on timers alone. If runAttempt is ever
    // reverted to rAF, fake timers won't advance it and this test fails.
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    let level = 0;
    const src = { kind: 'tap' as const, level: () => (level += 20), dispose: () => {} };
    let done: AttemptResult | null = null;
    let opened = false;
    let ticks = 0;
    runAttempt({
      source: src,
      challenge: { kind: 'peak', bar: 40 },
      windowMs: 400,
      beatMs: 100,
      cb: {
        onCountdown: () => {},
        onOpen: () => (opened = true),
        onTick: () => ticks++,
        onDone: (r) => (done = r),
      },
    });
    vi.advanceTimersByTime(5000);
    expect(opened).toBe(true);
    expect(ticks).toBeGreaterThan(3); // sampled several times over the window
    expect(done).not.toBeNull();
    expect(done!.passed).toBe(true); // level climbed past 40
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('cancel() stops a pending attempt from ever finishing', () => {
    let done = false;
    const h = runAttempt({
      source: stubSource,
      challenge: { kind: 'peak', bar: 50 },
      windowMs: 500,
      beatMs: 100,
      cb: { onCountdown: () => {}, onOpen: () => {}, onTick: () => {}, onDone: () => (done = true) },
    });
    h.cancel();
    vi.advanceTimersByTime(4000);
    expect(done).toBe(false);
  });
});
