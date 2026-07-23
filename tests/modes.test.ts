/**
 * modes.test.ts — the escalation math, and the wire-key guard.
 */

import { describe, expect, it } from 'vitest';
import {
  MODES,
  MODE_LIST,
  modeOf,
  challengeFor,
  describeChallenge,
  SUSTAIN_BAR,
  BELLOW_BAR_MAX,
} from '../src/modes';

describe('modeOf', () => {
  it('returns the requested mode', () => {
    expect(modeOf('sustain').id).toBe('sustain');
    expect(modeOf('pinpoint').id).toBe('pinpoint');
  });
  it('falls back for an unknown id rather than returning undefined', () => {
    expect(modeOf('nope').id).toBe('bellow');
  });
  it('does not let a prototype key leak through as a mode', () => {
    // MODES[id] || DEFAULT would let 'constructor'/'toString' resolve to a
    // function/undefined; the Object.hasOwn guard must reject them.
    expect(modeOf('constructor').id).toBe('bellow');
    expect(modeOf('toString').id).toBe('bellow');
    expect(modeOf('__proto__').id).toBe('bellow');
  });
  it('exposes exactly three modes with real spread', () => {
    expect(MODE_LIST).toHaveLength(3);
    expect(new Set(MODE_LIST.map((m) => m.id)).size).toBe(3);
  });
});

describe('bellow escalation', () => {
  it('the loudness bar rises with difficulty and caps below the ceiling', () => {
    const c0 = challengeFor(MODES.bellow, 20);
    const c1 = challengeFor(MODES.bellow, 40);
    expect(c0.kind).toBe('peak');
    if (c0.kind === 'peak' && c1.kind === 'peak') {
      expect(c1.bar).toBeGreaterThan(c0.bar);
    }
    const cHigh = challengeFor(MODES.bellow, 500);
    if (cHigh.kind === 'peak') expect(cHigh.bar).toBe(BELLOW_BAR_MAX);
  });
});

describe('sustain escalation', () => {
  it('holds a constant volume line but a LENGTHENING duration', () => {
    const a = challengeFor(MODES.sustain, 10);
    const b = challengeFor(MODES.sustain, 40);
    if (a.kind === 'hold' && b.kind === 'hold') {
      expect(a.bar).toBe(SUSTAIN_BAR);
      expect(b.bar).toBe(SUSTAIN_BAR);
      expect(b.holdMs).toBeGreaterThan(a.holdMs);
    } else {
      throw new Error('sustain should produce a hold challenge');
    }
  });
});

describe('pinpoint escalation', () => {
  it('the band rises and NARROWS with difficulty', () => {
    const a = challengeFor(MODES.pinpoint, 5);
    const b = challengeFor(MODES.pinpoint, 60);
    if (a.kind === 'band' && b.kind === 'band') {
      const wa = a.hi - a.lo;
      const wb = b.hi - b.lo;
      expect(wb).toBeLessThan(wa); // narrower
      const ca = (a.lo + a.hi) / 2;
      const cb = (b.lo + b.hi) / 2;
      expect(cb).toBeGreaterThan(ca); // higher centre
    } else {
      throw new Error('pinpoint should produce a band challenge');
    }
  });
  it('never narrows below a playable floor', () => {
    const c = challengeFor(MODES.pinpoint, 10000);
    if (c.kind === 'band') expect(c.hi - c.lo).toBeGreaterThanOrEqual(11); // 2*PIN_HALF_MIN-ish
  });
});

describe('describeChallenge copy', () => {
  it('reads naturally per mode', () => {
    expect(describeChallenge({ kind: 'peak', bar: 45 })).toBe('Beat 45');
    expect(describeChallenge({ kind: 'hold', bar: 42, holdMs: 1400 })).toBe('Hold 1.4s');
    expect(describeChallenge({ kind: 'band', lo: 30, hi: 52 })).toBe('Hit 30–52');
  });
});
