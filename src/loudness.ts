// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * loudness.ts — the PURE derivation layer (principle #23).
 *
 * Everything here is a plain function of numbers: raw mic samples → an RMS → a
 * 0..100 "level", and a series of levels → a pass/fail against a challenge. No
 * Web Audio, no DOM, no time source. The mic driver (mic.ts) and the tap fallback
 * (tap.ts) both produce the SAME level series, so this module — and the whole game
 * on top of it — never knows nor cares which input was used. That is what makes
 * the sensor path unit-testable without a real microphone.
 */

export type ModeId = 'bellow' | 'sustain' | 'pinpoint';

/** One measured level in time. `t` is milliseconds, `v` is a 0..100 loudness. */
export interface Sample {
  t: number;
  v: number;
}

/** A single turn's target. */
export type Challenge =
  | { kind: 'peak'; bar: number }
  | { kind: 'hold'; bar: number; holdMs: number }
  | { kind: 'band'; lo: number; hi: number };

export interface AttemptResult {
  /** The mode's headline number for this attempt (loudness, hold ms, or level). */
  reading: number;
  passed: boolean;
}

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

/** Root-mean-square of a block of PCM samples in [-1, 1]. */
export function rms(samples: Float32Array | number[]): number {
  let sum = 0;
  const n = samples.length;
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

/** Full-scale RMS → decibels (dBFS). Silence floors at -120 rather than -Infinity. */
export function toDb(rmsValue: number): number {
  return 20 * Math.log10(Math.max(rmsValue, 1e-6));
}

/**
 * Map an RMS reading onto a 0..100 loudness level using a decibel scale, because
 * perceived loudness is logarithmic — a linear map would leave every human voice
 * bunched near the bottom. `floorDb` is the calibrated ambient (below it reads 0),
 * `ceilDb` is "as loud as we score" (at or above it reads 100).
 */
export function levelFromRms(rmsValue: number, floorDb: number, ceilDb: number): number {
  const db = toDb(rmsValue);
  if (ceilDb <= floorDb) return db >= ceilDb ? 100 : 0;
  return clamp(((db - floorDb) / (ceilDb - floorDb)) * 100, 0, 100);
}

/** Default loudness window: -50 dBFS reads 0, -6 dBFS reads 100. */
export const DEFAULT_FLOOR_DB = -50;
export const DEFAULT_CEIL_DB = -6;

/** Extra headroom (dB) above the measured ambient median, so a quiet room reads 0. */
export const CALIBRATION_MARGIN_DB = 6;

/**
 * Turn a short block of ambient RMS readings into a noise floor (dB). The median
 * is robust to a stray cough during calibration; the margin lifts the floor just
 * above ambient so an untouched quiet room sits at level 0, not level 3.
 */
export function calibrateFloorDb(ambientRms: number[]): number {
  if (ambientRms.length === 0) return DEFAULT_FLOOR_DB;
  const sorted = [...ambientRms].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  const floor = toDb(mid) + CALIBRATION_MARGIN_DB;
  // Never let a noisy calibration push the floor above the ceiling — that would
  // make the whole scale collapse to 0/100.
  return clamp(floor, -90, DEFAULT_CEIL_DB - 12);
}

/** Peak level across a series. */
export function peak(samples: Sample[]): number {
  let m = 0;
  for (const s of samples) if (s.v > m) m = s.v;
  return m;
}

/**
 * The longest contiguous stretch (ms) during which the level stayed at or above
 * `bar`. Duration between samples is measured from their timestamps, so an uneven
 * sample rate is handled honestly. A single lone sample above the bar counts as a
 * zero-length hold — you must stay up across at least two readings.
 */
export function holdMs(samples: Sample[], bar: number): number {
  let best = 0;
  let runStart = -1;
  for (let i = 0; i < samples.length; i++) {
    const above = samples[i].v >= bar;
    if (above) {
      if (runStart < 0) runStart = samples[i].t;
      else best = Math.max(best, samples[i].t - runStart);
    } else {
      runStart = -1;
    }
  }
  return best;
}

/**
 * The settled level: the mean of the back half of the series. Rewards arriving at
 * a volume and holding it, and ignores the ramp-up — which is what "aim for a
 * precise loudness" (Pinpoint) needs. For the tap fallback, whose locked value
 * fills every sample, this is exactly the locked value.
 */
export function steady(samples: Sample[]): number {
  if (samples.length === 0) return 0;
  const from = Math.floor(samples.length / 2);
  let sum = 0;
  let n = 0;
  for (let i = from; i < samples.length; i++) {
    sum += samples[i].v;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** Evaluate one attempt's level series against its challenge. Pure. */
export function evaluateAttempt(challenge: Challenge, samples: Sample[]): AttemptResult {
  switch (challenge.kind) {
    case 'peak': {
      const reading = peak(samples);
      return { reading, passed: reading >= challenge.bar };
    }
    case 'hold': {
      const reading = holdMs(samples, challenge.bar);
      return { reading, passed: reading >= challenge.holdMs };
    }
    case 'band': {
      const reading = steady(samples);
      return { reading, passed: reading >= challenge.lo && reading <= challenge.hi };
    }
  }
}
