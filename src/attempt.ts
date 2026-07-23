// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * attempt.ts — one turn's controller: count the player in, open a measurement
 * window, sample the active LevelSource, and evaluate.
 *
 * EVERYTHING here runs on setTimeout/setInterval, never requestAnimationFrame. rAF
 * is paused in a throttled or backgrounded tab, so an rAF-driven measurement window
 * never closes if the player's phone locks or a notification steals focus mid-shout
 * — the attempt hangs forever. A ~33ms interval samples smoothly enough for a
 * loudness meter and is guaranteed to reach the window's end regardless of focus,
 * which also lets browser automation drive the live path.
 *
 * The test hook: push a synthetic level series onto `window.__uproarFeed` and the
 * next attempt replays it instead of sampling the mic — proving the sensor→evaluate
 * pipeline end-to-end without a real microphone (principle #23 Part C).
 */

import type { Challenge, Sample, AttemptResult } from './loudness';
import { evaluateAttempt } from './loudness';
import type { LevelSource } from './mic';

export interface AttemptCallbacks {
  /** n = 3,2,1 then 0 for GO. */
  onCountdown(n: number): void;
  onOpen(): void;
  onTick(level: number, elapsedMs: number, runningReading: number): void;
  onDone(result: AttemptResult, samples: Sample[]): void;
}

export interface AttemptOptions {
  source: LevelSource;
  challenge: Challenge;
  windowMs: number;
  /** ms per countdown beat. */
  beatMs?: number;
  cb: AttemptCallbacks;
}

export interface AttemptHandle {
  cancel(): void;
}

declare global {
  interface Window {
    /** Test hook: synthetic level series, consumed one attempt at a time. */
    __uproarFeed?: Sample[][];
  }
}

const nowMs = (): number =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

function takeFed(): Sample[] | null {
  const q = typeof window !== 'undefined' ? window.__uproarFeed : undefined;
  if (q && q.length > 0) return q.shift() ?? null;
  return null;
}

export function runAttempt(opts: AttemptOptions): AttemptHandle {
  const { source, challenge, windowMs, cb } = opts;
  const beatMs = opts.beatMs ?? 550;
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let interval: ReturnType<typeof setInterval> | null = null;

  const clearAll = (): void => {
    for (const t of timers) clearTimeout(t);
    if (interval) clearInterval(interval);
  };

  const finish = (samples: Sample[]): void => {
    if (cancelled) return;
    const result = evaluateAttempt(challenge, samples);
    cb.onDone(result, samples);
  };

  // ── Live sampling window (setInterval — never rAF) ─────────────────────────
  const runLive = (): void => {
    if (cancelled) return;
    cb.onOpen();
    const start = nowMs();
    const samples: Sample[] = [];
    interval = setInterval(() => {
      if (cancelled) return;
      const t = nowMs() - start;
      const v = source.level();
      samples.push({ t, v });
      cb.onTick(v, t, evaluateAttempt(challenge, samples).reading);
      if (t >= windowMs) {
        if (interval) clearInterval(interval);
        interval = null;
        finish(samples);
      }
    }, 33);
  };

  // ── Fed replay window (setInterval — hidden-tab safe) ──────────────────────
  const runFed = (fed: Sample[]): void => {
    if (cancelled) return;
    cb.onOpen();
    let i = 0;
    const played: Sample[] = [];
    interval = setInterval(() => {
      if (cancelled) return;
      if (i >= fed.length) {
        if (interval) clearInterval(interval);
        finish(played.length ? played : fed);
        return;
      }
      const s = fed[i++];
      played.push(s);
      cb.onTick(s.v, s.t, evaluateAttempt(challenge, played).reading);
    }, 24);
  };

  // ── Countdown 3-2-1-GO, then open the window ───────────────────────────────
  const fed = takeFed();
  const beats = [3, 2, 1, 0];
  beats.forEach((n, idx) => {
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        cb.onCountdown(n);
        if (n === 0) {
          if (fed) runFed(fed);
          else runLive();
        }
      }, idx * beatMs),
    );
  });

  return {
    cancel(): void {
      cancelled = true;
      clearAll();
    },
  };
}
