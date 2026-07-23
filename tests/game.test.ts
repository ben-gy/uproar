/**
 * game.test.ts — the knockout state machine.
 */

import { describe, expect, it } from 'vitest';
import {
  createMatch,
  submitAttempt,
  currentPlayer,
  aliveCount,
  soloScore,
  type Match,
} from '../src/game';
import { MODES } from '../src/modes';

const pass = { reading: 90, passed: true };
const fail = { reading: 10, passed: false };

function names(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `P${i + 1}`);
}

describe('match setup', () => {
  it('creates players all alive at rung 0', () => {
    const m = createMatch(MODES.bellow, names(3));
    expect(m.players).toHaveLength(3);
    expect(aliveCount(m)).toBe(3);
    expect(m.players.every((p) => p.alive && p.rung === 0)).toBe(true);
    expect(m.difficulty).toBe(MODES.bellow.start);
  });
  it('names blank inputs sensibly', () => {
    const m = createMatch(MODES.bellow, ['', '  ']);
    expect(m.players[0].name).toBe('Player 1');
    expect(m.players[1].name).toBe('Player 2');
  });
});

describe('clearing a bar', () => {
  it('climbs a rung, raises difficulty, and passes to the next player', () => {
    const m = createMatch(MODES.bellow, names(2));
    const before = m.difficulty;
    const p0 = currentPlayer(m);
    submitAttempt(m, pass);
    expect(p0.rung).toBe(1);
    expect(m.difficulty).toBe(before + MODES.bellow.step);
    expect(currentPlayer(m).id).toBe(1); // advanced
  });
  it('records the best reading', () => {
    const m = createMatch(MODES.bellow, names(1));
    submitAttempt(m, { reading: 40, passed: true });
    submitAttempt(m, { reading: 88, passed: true });
    submitAttempt(m, { reading: 55, passed: true });
    expect(m.players[0].bestReading).toBe(88);
  });
});

describe('missing a bar', () => {
  it('knocks the player out, eases difficulty, and records the rung', () => {
    const m = createMatch(MODES.bellow, names(3));
    submitAttempt(m, pass); // P1 clears
    const diff = m.difficulty;
    const p1 = currentPlayer(m); // P2
    const out = submitAttempt(m, fail); // P2 out
    expect(out.eliminated).toBe(true);
    expect(p1.alive).toBe(false);
    expect(p1.outAtRung).toBe(0);
    expect(m.difficulty).toBe(Math.max(0, diff - MODES.bellow.relief));
    expect(aliveCount(m)).toBe(2);
  });

  it('skips eliminated players when advancing', () => {
    const m = createMatch(MODES.bellow, names(3));
    // P1 pass, P2 out, then it should be P3's turn (not P2 again).
    submitAttempt(m, pass);
    submitAttempt(m, fail);
    expect(currentPlayer(m).id).toBe(2);
  });
});

describe('winning', () => {
  it('ends when one player remains, naming the survivor', () => {
    const m = createMatch(MODES.bellow, names(3));
    submitAttempt(m, pass); // P1 clears -> P2
    submitAttempt(m, fail); // P2 out -> P3
    submitAttempt(m, fail); // P3 out -> P1 wins
    expect(m.finished).toBe(true);
    expect(m.winnerId).toBe(0);
  });
  it('the last standing player is never asked to attempt', () => {
    const m = createMatch(MODES.bellow, names(2));
    submitAttempt(m, pass); // P1 -> P2
    submitAttempt(m, fail); // P2 out -> P1 wins immediately
    expect(m.finished).toBe(true);
    expect(m.winnerId).toBe(0);
    // No further turn for the survivor.
    expect(currentPlayer(m).id).toBe(1); // stays where it was; finished
  });
});

describe('solo', () => {
  it('ends on the first miss; score is the rung reached', () => {
    const m = createMatch(MODES.bellow, names(1));
    submitAttempt(m, pass);
    submitAttempt(m, pass);
    expect(m.finished).toBe(false);
    submitAttempt(m, fail);
    expect(m.finished).toBe(true);
    expect(m.winnerId).toBe(null);
    expect(soloScore(m)).toBe(2);
  });
});

describe('difficulty never goes negative', () => {
  it('relief cannot drive it below zero', () => {
    const m: Match = createMatch(MODES.bellow, names(4));
    m.difficulty = 3;
    submitAttempt(m, fail);
    expect(m.difficulty).toBeGreaterThanOrEqual(0);
  });
});
