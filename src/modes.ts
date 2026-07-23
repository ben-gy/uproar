// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * modes.ts — the three modes and the escalation math.
 *
 * A mode is a DIFFERENT verb, not a dial (principle #14):
 *   • Bellow   — get LOUDER than a rising bar. A burst of nerve. Peak loudness.
 *   • Sustain  — HOLD above a line for a lengthening duration. Breath control.
 *   • Pinpoint — land INSIDE a rising, narrowing band. Volume control, not power.
 *
 * The single scalar that climbs is `difficulty`. `challengeFor(mode, difficulty)`
 * turns it into that mode's concrete target. Difficulty rises every turn and eases
 * back a little whenever a player is knocked out (`RELIEF`), so survivors get room
 * and the game lasts several laps instead of cascading — which is what lets a
 * player's actual ability, not their seat, decide it. The balance sim
 * (tests/balance.test.ts) pins every constant below.
 */

import type { Challenge, ModeId } from './loudness';
import { clamp } from './loudness';

export interface Mode {
  id: ModeId;
  name: string;
  /** One-line "how this one plays" for the mode picker. */
  blurb: string;
  /** Verb shown on the big button and in the countdown ("Shout", "Hold", "Aim"). */
  verb: string;
  /** Where the ladder starts. */
  start: number;
  /** How much difficulty climbs per turn. */
  step: number;
  /** How far difficulty eases back when a player is eliminated. */
  relief: number;
  /** Measurement-window length (ms) the attempt controller opens. */
  windowMs: number;
}

export const MODES: Record<ModeId, Mode> = {
  bellow: {
    id: 'bellow',
    name: 'Bellow',
    blurb: 'Get louder than the bar. Just be loud.',
    verb: 'Shout',
    start: 20,
    step: 5,
    relief: 7,
    windowMs: 2200,
  },
  sustain: {
    id: 'sustain',
    name: 'Sustain',
    blurb: 'Hold your voice above the line — for longer every turn.',
    verb: 'Hold',
    start: 20,
    step: 5,
    relief: 8,
    windowMs: 4200,
  },
  pinpoint: {
    id: 'pinpoint',
    name: 'Pinpoint',
    blurb: 'Land inside the band. Not too quiet, not too loud — and it shrinks.',
    verb: 'Aim',
    start: 16,
    step: 5,
    relief: 7,
    windowMs: 2600,
  },
};

export const MODE_LIST: Mode[] = [MODES.bellow, MODES.sustain, MODES.pinpoint];

export function modeOf(id: string): Mode {
  return Object.prototype.hasOwnProperty.call(MODES, id) ? MODES[id as ModeId] : MODES.bellow;
}

// ── Sustain params ──────────────────────────────────────────────────────────
// Tuned by the balance sim: the ladder must start trivially easy and cross a
// typical voice's hold ceiling only after ~13 rungs, so the knockout resolves by
// stamina over many laps rather than by who faced the cliff first (seat order).
/** The volume line you hold above (constant — the DURATION is what escalates). */
export const SUSTAIN_BAR = 42;
/** Hold time at difficulty 0, and how many ms each difficulty point adds. */
const SUSTAIN_BASE_MS = 200;
const SUSTAIN_MS_PER_DIFF = 20;

// ── Pinpoint params ─────────────────────────────────────────────────────────
// Same lesson: the band opens wide (a near-certain clear early) and closes toward
// a typical player's aim-spread only after ~12 rungs.
/** Band centre climbs with difficulty; the half-width shrinks toward a floor. */
const PIN_CENTRE_BASE = 34;
const PIN_CENTRE_RISE = 0.55;
const PIN_HALF_BASE = 42;
const PIN_HALF_NARROW = 0.34;
const PIN_HALF_MIN = 8;

// ── Bellow params ───────────────────────────────────────────────────────────
/** The loudness bar can climb this high before it is simply "as loud as scored". */
export const BELLOW_BAR_MAX = 97;

/** Turn a climbing difficulty into a concrete, evaluatable challenge. Pure. */
export function challengeFor(mode: Mode, difficulty: number): Challenge {
  const d = Math.max(0, difficulty);
  switch (mode.id) {
    case 'bellow':
      return { kind: 'peak', bar: clamp(d, 0, BELLOW_BAR_MAX) };
    case 'sustain':
      return {
        kind: 'hold',
        bar: SUSTAIN_BAR,
        holdMs: Math.round(SUSTAIN_BASE_MS + d * SUSTAIN_MS_PER_DIFF),
      };
    case 'pinpoint': {
      const centre = clamp(PIN_CENTRE_BASE + d * PIN_CENTRE_RISE, 10, 90);
      const half = Math.max(PIN_HALF_MIN, PIN_HALF_BASE - d * PIN_HALF_NARROW);
      return { kind: 'band', lo: clamp(centre - half, 0, 100), hi: clamp(centre + half, 0, 100) };
    }
  }
}

/**
 * A human-readable target for the HUD, e.g. "Beat 45", "Hold 1.4s", "Hit 30–52".
 * Pure so a test can pin the copy.
 */
export function describeChallenge(c: Challenge): string {
  switch (c.kind) {
    case 'peak':
      return `Beat ${Math.round(c.bar)}`;
    case 'hold':
      return `Hold ${(c.holdMs / 1000).toFixed(1)}s`;
    case 'band':
      return `Hit ${Math.round(c.lo)}–${Math.round(c.hi)}`;
  }
}
