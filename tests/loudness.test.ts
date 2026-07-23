/**
 * loudness.test.ts — the pure derivation layer, hard (principle #23).
 *
 * The mic path cannot be exercised by browser automation, so the derivation that
 * turns raw samples into a pass/fail is where the real testing lives. If these are
 * right and the driver just feeds this evaluator, the sensor game is correct.
 */

import { describe, expect, it } from 'vitest';
import {
  rms,
  toDb,
  levelFromRms,
  calibrateFloorDb,
  peak,
  holdMs,
  steady,
  evaluateAttempt,
  clamp,
  DEFAULT_FLOOR_DB,
  DEFAULT_CEIL_DB,
  CALIBRATION_MARGIN_DB,
  type Sample,
} from '../src/loudness';

const series = (vals: number[], dt = 30): Sample[] => vals.map((v, i) => ({ t: i * dt, v }));

describe('rms', () => {
  it('is zero for silence and for an empty block', () => {
    expect(rms(new Float32Array(64))).toBe(0);
    expect(rms([])).toBe(0);
  });
  it('equals the amplitude of a constant signal', () => {
    expect(rms([0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5, 6);
    expect(rms([-0.3, 0.3, -0.3, 0.3])).toBeCloseTo(0.3, 6);
  });
  it('is sqrt(mean of squares)', () => {
    expect(rms([3, 4])).toBeCloseTo(Math.sqrt((9 + 16) / 2), 6);
  });
});

describe('toDb', () => {
  it('maps full-scale to 0 dB and floors silence at -120', () => {
    expect(toDb(1)).toBeCloseTo(0, 6);
    expect(toDb(0)).toBeCloseTo(20 * Math.log10(1e-6), 3);
    expect(toDb(0.1)).toBeCloseTo(-20, 4);
  });
});

describe('levelFromRms', () => {
  it('reads 0 at/below the floor and 100 at/above the ceiling', () => {
    const floorRms = Math.pow(10, DEFAULT_FLOOR_DB / 20);
    const ceilRms = Math.pow(10, DEFAULT_CEIL_DB / 20);
    expect(levelFromRms(floorRms, DEFAULT_FLOOR_DB, DEFAULT_CEIL_DB)).toBeCloseTo(0, 3);
    expect(levelFromRms(ceilRms, DEFAULT_FLOOR_DB, DEFAULT_CEIL_DB)).toBeCloseTo(100, 3);
    expect(levelFromRms(0.0001, DEFAULT_FLOOR_DB, DEFAULT_CEIL_DB)).toBe(0);
    expect(levelFromRms(1, DEFAULT_FLOOR_DB, DEFAULT_CEIL_DB)).toBe(100);
  });
  it('is monotonic in loudness', () => {
    let prev = -1;
    for (const r of [0.001, 0.003, 0.01, 0.03, 0.1, 0.3]) {
      const lvl = levelFromRms(r, DEFAULT_FLOOR_DB, DEFAULT_CEIL_DB);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });
  it('degrades gracefully if floor >= ceil', () => {
    expect(levelFromRms(1, -6, -6)).toBe(100); // 0 dB >= -6 dB ceiling
    expect(levelFromRms(0.0001, -6, -6)).toBe(0);
  });
});

describe('calibrateFloorDb', () => {
  it('sits a fixed margin above the ambient median', () => {
    const ambient = [0.001, 0.0012, 0.0009, 0.0011];
    const median = 0.0011; // sorted middle of 4 → index 2
    expect(calibrateFloorDb(ambient)).toBeCloseTo(toDb(median) + CALIBRATION_MARGIN_DB, 4);
  });
  it('is robust to a single loud outlier (median, not mean)', () => {
    const quiet = calibrateFloorDb([0.001, 0.001, 0.001, 0.001]);
    const withCough = calibrateFloorDb([0.001, 0.001, 0.001, 0.5]);
    expect(withCough).toBeCloseTo(quiet, 4);
  });
  it('never pushes the floor above a usable range', () => {
    expect(calibrateFloorDb([0.9, 0.9, 0.9])).toBeLessThanOrEqual(DEFAULT_CEIL_DB - 12);
  });
  it('falls back on empty calibration', () => {
    expect(calibrateFloorDb([])).toBe(DEFAULT_FLOOR_DB);
  });
});

describe('reading functions', () => {
  it('peak is the max level', () => {
    expect(peak(series([10, 80, 30, 60]))).toBe(80);
    expect(peak([])).toBe(0);
  });

  it('holdMs is the longest contiguous run above the bar', () => {
    // dt=30ms. Above bar (=50): indices 1..3 (three samples) → 2 gaps → 60ms.
    expect(holdMs(series([10, 60, 70, 80, 20]), 50)).toBe(60);
    // A single sample above the bar is a zero-length hold.
    expect(holdMs(series([10, 60, 10]), 50)).toBe(0);
    // Longest of two separate runs wins.
    expect(holdMs(series([60, 60, 10, 60, 60, 60]), 50)).toBe(60);
  });

  it('steady is the mean of the back half — ignores the ramp-up', () => {
    // back half of 4 samples = last 2 → mean(80,80)=80
    expect(steady(series([0, 20, 80, 80]))).toBe(80);
    expect(steady([])).toBe(0);
  });
});

describe('evaluateAttempt', () => {
  it('peak: passes iff peak >= bar', () => {
    expect(evaluateAttempt({ kind: 'peak', bar: 50 }, series([10, 55, 20]))).toEqual({
      reading: 55,
      passed: true,
    });
    expect(evaluateAttempt({ kind: 'peak', bar: 60 }, series([10, 55, 20])).passed).toBe(false);
  });
  it('hold: passes iff the longest run reaches holdMs', () => {
    const s = series([60, 60, 60, 60], 50); // runs 0..3 → 150ms
    expect(evaluateAttempt({ kind: 'hold', bar: 50, holdMs: 120 }, s).passed).toBe(true);
    expect(evaluateAttempt({ kind: 'hold', bar: 50, holdMs: 200 }, s).passed).toBe(false);
  });
  it('band: passes iff the settled level lands inside [lo,hi]', () => {
    const inside = series([0, 0, 40, 40]); // steady=40
    const tooLoud = series([0, 0, 90, 90]);
    expect(evaluateAttempt({ kind: 'band', lo: 30, hi: 50 }, inside).passed).toBe(true);
    expect(evaluateAttempt({ kind: 'band', lo: 30, hi: 50 }, tooLoud).passed).toBe(false);
  });
});

describe('clamp', () => {
  it('bounds a value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
