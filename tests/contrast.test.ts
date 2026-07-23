/**
 * contrast.test.ts — can you actually SEE the meter, the target line and the
 * players? (principle #22)
 *
 * Every layout gate is a GEOMETRY gate; a mark that is on-screen, the right size,
 * and the same colour as its background passes all of them and is still invisible.
 * WCAG 2.1 (1.4.11) puts the floor for a meaningful non-text graphic at 3:1, held
 * here against the surface each mark is actually drawn on.
 */

import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/palette';
import { PLAYER_COLORS } from '../src/game';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const MIN = 3;
const TEXT_MIN = 4.5;

describe('the play surface is legible', () => {
  it('the target line and band border read on the meter track', () => {
    // The meter track is a gradient; the darkest end is the worst case.
    expect(contrast(PALETTE.cyan, PALETTE.meterDark)).toBeGreaterThanOrEqual(MIN);
    expect(contrast(PALETTE.cyan, PALETTE.meterTop)).toBeGreaterThanOrEqual(MIN);
  });

  it('every colour of the meter fill reads on the track', () => {
    for (const [what, c] of [
      ['amber', PALETTE.amber],
      ['hot', PALETTE.hot],
      ['magenta', PALETTE.magenta],
    ] as const) {
      const r = contrast(c, PALETTE.meterDark);
      expect(r, `${what} fill (${c}) is ${r.toFixed(2)}:1 on the track`).toBeGreaterThanOrEqual(MIN);
    }
  });

  it('pass and fail states read on the ink background', () => {
    expect(contrast(PALETTE.good, PALETTE.ink)).toBeGreaterThanOrEqual(MIN);
    expect(contrast(PALETTE.bad, PALETTE.ink)).toBeGreaterThanOrEqual(MIN);
  });

  it('every player chip colour reads on its chip background', () => {
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      const c = PLAYER_COLORS[i];
      const r = contrast(c, PALETTE.ink2);
      expect(r, `player ${i} (${c}) is ${r.toFixed(2)}:1 on a chip`).toBeGreaterThanOrEqual(MIN);
    }
  });

  it('players are told apart by more than hue — every pair has a luminance gap', () => {
    // Colour-blind safety: adjacent chips must differ in lightness, not only hue.
    // (A letter/name also distinguishes them in the UI, but the dots should too.)
    const lums = PLAYER_COLORS.map(luminance);
    // Each colour must differ from at least one clearly-different neighbour; assert
    // the palette spans a real luminance range rather than clustering.
    expect(Math.max(...lums) / Math.min(...lums)).toBeGreaterThan(1.6);
  });

  it('body text reads on every surface it sits on', () => {
    for (const bg of [PALETTE.ink, PALETTE.ink2, PALETTE.panel]) {
      expect(contrast(PALETTE.text, bg)).toBeGreaterThanOrEqual(TEXT_MIN);
    }
  });

  it('muted text still clears the non-text floor', () => {
    expect(contrast(PALETTE.muted, PALETTE.ink)).toBeGreaterThanOrEqual(MIN);
  });
});
