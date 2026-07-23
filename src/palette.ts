// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * palette.ts — the colours that carry meaning on the play surface, pinned so
 * contrast.test.ts can hold each to WCAG's 3:1 non-text floor (principle #22).
 *
 * These MUST match the CSS custom properties in styles/main.css. The palette test
 * proves the constants; the in-browser pixel probe (Step 11) proves what actually
 * gets painted. Keep them in sync.
 */

export const PALETTE = {
  // Surfaces a mark can sit on.
  ink: '#0e1230', // page background
  ink2: '#191f4a', // cards / chips
  panel: '#212a63', // pills / current chip
  meterDark: '#0b0e26', // darkest of the meter track gradient
  meterTop: '#12173a', // lighter top of the meter track

  // Meaningful marks.
  cyan: '#38e1d6', // target line + band border
  amber: '#ffb43a', // meter fill (low), prompt word
  hot: '#ff4d7e', // meter fill (mid)
  magenta: '#e94bd0', // meter fill (high)
  good: '#6ee787', // pass
  bad: '#ff6b6b', // fail

  // Text.
  text: '#f4f6ff',
  muted: '#aab4ee',
} as const;
