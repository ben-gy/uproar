/**
 * sim.ts — the balance simulator (principle #18, adapted for a physical party game).
 *
 * There is no strategic "policy" here — loudness is a physical attribute — so a
 * simulated player is a VOICE PROFILE: how loud they can get (power), how long they
 * can hold (stamina), how precisely they can hit a target (control), plus honest
 * per-attempt noise. The sim drives the REAL pipeline: currentChallenge →
 * evaluateAttempt on a synthesised level series → submitAttempt. So the balance
 * questions are asked of the exact code the game runs.
 *
 * The fairness question for a knockout with a rising bar is: does turn ORDER decide
 * it, or does ability? That is exactly principle #18's seat-fairness gate, and it is
 * measured with identical profiles (only seat + noise differ). The skill question —
 * is it a game or a coin flip — is measured with differing profiles.
 */

import {
  createMatch,
  submitAttempt,
  currentChallenge,
} from '../../src/game';
import { evaluateAttempt, type Challenge, type Sample } from '../../src/loudness';
import { SUSTAIN_BAR, type Mode } from '../../src/modes';

export interface Profile {
  name: string;
  /** Loudness ceiling, 0..100 (Bellow). */
  power: number;
  /** Hold capability 0..1 (Sustain). */
  stamina: number;
  /** Precision 0..1 — higher lands tighter to the target (Pinpoint). */
  control: number;
}

/** Deterministic PRNG (mulberry32) — no Math.random, so runs replicate. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

const DT = 40;

/**
 * Synthesise the level series a profile would produce against a challenge. Minimal
 * but faithful to what each mode's reading function measures.
 */
function makeSeries(mode: Mode, c: Challenge, p: Profile, rng: () => number): Sample[] {
  switch (c.kind) {
    case 'peak': {
      const achieved = clamp(p.power + gauss(rng) * 6, 0, 100);
      return [
        { t: 0, v: 0 },
        { t: DT, v: achieved },
      ];
    }
    case 'hold': {
      const capable = p.power > SUSTAIN_BAR;
      const holdCap = capable
        ? Math.max(
            0,
            300 + p.stamina * 5000 * Math.min(1, (p.power - SUSTAIN_BAR) / 45) + gauss(rng) * 250,
          )
        : 0;
      const n = Math.max(1, Math.floor(holdCap / DT) + 1);
      const above = SUSTAIN_BAR + 12;
      const s: Sample[] = [];
      for (let i = 0; i < n; i++) s.push({ t: i * DT, v: above });
      s.push({ t: n * DT, v: 0 });
      return s;
    }
    case 'band': {
      const centre = (c.lo + c.hi) / 2;
      const spread = 4 + (1 - p.control) * 40;
      const actual = clamp(centre + gauss(rng) * spread, 0, 100);
      return [
        { t: 0, v: actual },
        { t: DT, v: actual },
      ];
    }
  }
}

export interface AttemptEvent {
  seat: number;
  diffBefore: number;
  diffAfter: number;
  challenge: Challenge;
  reading: number;
  cleared: boolean;
}

export interface MatchLog {
  winnerSeat: number | null;
  turns: number;
  events: AttemptEvent[];
  /** rung reached per seat (final). */
  rungs: number[];
  outAt: (number | null)[];
}

export function playMatch(mode: Mode, profiles: Profile[], rng: () => number): MatchLog {
  const m = createMatch(mode, profiles.map((p) => p.name));
  const events: AttemptEvent[] = [];
  let guard = 0;
  while (!m.finished && guard++ < 5000) {
    const seat = m.current;
    const c = currentChallenge(m);
    const diffBefore = m.difficulty;
    const series = makeSeries(mode, c, profiles[seat], rng);
    const result = evaluateAttempt(c, series);
    submitAttempt(m, result);
    events.push({
      seat,
      diffBefore,
      diffAfter: m.difficulty,
      challenge: c,
      reading: result.reading,
      cleared: result.passed,
    });
  }
  return {
    winnerSeat: m.winnerId,
    turns: m.turns,
    events,
    rungs: m.players.map((p) => p.rung),
    outAt: m.players.map((p) => p.outAtRung),
  };
}

/** A set of identical profiles — isolates seat/noise from ability. */
export function identical(n: number, over = { power: 66, stamina: 0.62, control: 0.7 }): Profile[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, ...over }));
}
