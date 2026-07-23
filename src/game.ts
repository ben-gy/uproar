// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * game.ts — the match state machine. Pure logic, no DOM, no audio, no timers.
 *
 * A match is a knockout: players take turns facing a climbing challenge; clear it
 * and you climb a rung, miss it and you're out. Last one standing wins. Solo is the
 * same machine with one player — it simply ends when they miss, and their score is
 * the rung they reached.
 *
 * Everything here is driven by `submitAttempt(match, result)`, where `result` is
 * whatever came out of the pure evaluator — so the balance sim drives the exact
 * same code the live game does.
 */

import type { AttemptResult, Challenge } from './loudness';
import { challengeFor, type Mode } from './modes';

export interface Player {
  id: number;
  name: string;
  /** Palette index into the colour-blind-safe chip set. */
  color: number;
  alive: boolean;
  /** How many rungs this player has cleared. */
  rung: number;
  /** Best headline reading this player has posted. */
  bestReading: number;
  /** The rung they were on when knocked out (null while still alive). */
  outAtRung: number | null;
}

export interface Match {
  mode: Mode;
  players: Player[];
  /** The climbing difficulty scalar (see modes.ts). */
  difficulty: number;
  /** Global turn counter — how many attempts have been taken this match. */
  turns: number;
  /** Index into `players` of whose turn it is. */
  current: number;
  finished: boolean;
  /** The winning player id, or null (solo, or not finished). */
  winnerId: number | null;
}

export interface AttemptOutcome {
  player: Player;
  cleared: boolean;
  /** Set when this attempt knocked the player out. */
  eliminated: boolean;
  /** Set when this attempt ended the match. */
  finished: boolean;
}

export function createMatch(mode: Mode, names: string[]): Match {
  const players: Player[] = names.map((name, i) => ({
    id: i,
    name: name.trim() || `Player ${i + 1}`,
    color: i,
    alive: true,
    rung: 0,
    bestReading: 0,
    outAtRung: null,
  }));
  return {
    mode,
    players,
    difficulty: mode.start,
    turns: 0,
    current: 0,
    finished: false,
    winnerId: null,
  };
}

export const aliveCount = (m: Match): number => m.players.filter((p) => p.alive).length;

export const currentPlayer = (m: Match): Player => m.players[m.current];

/** The concrete target the current player faces right now. */
export const currentChallenge = (m: Match): Challenge => challengeFor(m.mode, m.difficulty);

/** The solo score is simply the rung reached (only meaningful for a 1-player match). */
export const soloScore = (m: Match): number => m.players[0]?.rung ?? 0;

function advance(m: Match): void {
  if (m.finished) return;
  let i = m.current;
  for (let n = 0; n < m.players.length; n++) {
    i = (i + 1) % m.players.length;
    if (m.players[i].alive) {
      m.current = i;
      return;
    }
  }
}

/**
 * Apply one attempt's result to the current player and advance the match. Mutates
 * and returns a small outcome record so the UI (and the sim) can react.
 */
export function submitAttempt(m: Match, result: AttemptResult): AttemptOutcome {
  const p = currentPlayer(m);
  m.turns++;
  const solo = m.players.length === 1;

  const cleared = result.passed;
  let eliminated = false;

  if (cleared) {
    p.rung++;
    if (result.reading > p.bestReading) p.bestReading = result.reading;
    m.difficulty += m.mode.step;
  } else {
    p.alive = false;
    p.outAtRung = p.rung;
    eliminated = true;
    m.difficulty = Math.max(0, m.difficulty - m.mode.relief);
  }

  // Win check.
  if (solo) {
    if (!cleared) {
      m.finished = true;
      m.winnerId = null;
    }
  } else if (aliveCount(m) <= 1) {
    m.finished = true;
    const survivor = m.players.find((q) => q.alive);
    m.winnerId = survivor ? survivor.id : null;
  }

  if (!m.finished) advance(m);

  return { player: p, cleared, eliminated, finished: m.finished };
}

/** Colour-blind-safe qualitative chip palette (hue AND letter distinguish players). */
export const PLAYER_COLORS = [
  '#4aa3ff', // blue
  '#ff8f3a', // orange
  '#38e1d6', // teal
  '#ff6bb5', // pink
  '#ffd23f', // yellow
  '#a888ff', // purple
  '#8fe36a', // green
  '#ff5d5d', // red
];
