/**
 * balance.test.ts — is it fair, is it a game, does it end? (principles #18 + #21)
 *
 * Uproar is a knockout with a rising bar, so the fairness worry is that TURN ORDER,
 * not ability, decides the winner. This sim measures exactly that: with identical
 * voice profiles, every seat must win about equally; with differing profiles, the
 * better voice must win more than chance. It also audits the match MECHANISM over
 * the event stream at zero tolerance — a clear only ever happens when the reading
 * actually meets the target, and the difficulty ledger always balances — because a
 * broken evaluator or accounting bug would just shift the outcome curve and hide
 * inside "that mode is hard".
 */

import { describe, expect, it } from 'vitest';
import { MODES, type Mode } from '../src/modes';
import { playMatch, makeRng, identical, type Profile, type MatchLog } from './helpers/sim';

const MODE_LIST = [MODES.bellow, MODES.sustain, MODES.pinpoint];

function run(mode: Mode, profilesFor: (i: number) => Profile[], n: number, baseSeed: number): MatchLog[] {
  const out: MatchLog[] = [];
  for (let i = 0; i < n; i++) {
    out.push(playMatch(mode, profilesFor(i), makeRng(baseSeed + i * 2654435761)));
  }
  return out;
}

// ── Termination ────────────────────────────────────────────────────────────
describe('every match ends with exactly one winner', () => {
  for (const mode of MODE_LIST) {
    for (const players of [2, 3, 4]) {
      it(`${mode.name} ${players}P terminates`, () => {
        const logs = run(mode, () => identical(players), 120, 7);
        for (const g of logs) {
          expect(g.winnerSeat, `${mode.name} ${players}P must name a winner`).not.toBeNull();
          expect(g.turns).toBeLessThan(400);
        }
        const avgTurns = logs.reduce((s, g) => s + g.turns, 0) / logs.length;
        // Should span several laps, not be decided in the first go-around.
        expect(avgTurns, `${mode.name} ${players}P avg turns=${avgTurns.toFixed(1)}`).toBeGreaterThan(
          players * 1.6,
        );
      });
    }
  }
});

// ── Seat fairness (identical profiles → only order + noise) ─────────────────
describe('no seat has an edge from turn order', () => {
  const TOL = 8; // points off perfect share; n=500 CI is ~±4

  for (const mode of MODE_LIST) {
    for (const players of [2, 3, 4]) {
      it(`${mode.name} ${players}P seats are within ${TOL} points of chance`, () => {
        // Two independent seed families must AGREE (principle: replicate, don't trust one run).
        const share = 100 / players;
        for (const fam of [11, 4242]) {
          const logs = run(mode, () => identical(players), 500, fam);
          const wins = new Array(players).fill(0);
          for (const g of logs) if (g.winnerSeat != null) wins[g.winnerSeat]++;
          const pct = wins.map((w) => (w / logs.length) * 100);
          for (let s = 0; s < players; s++) {
            expect(
              Math.abs(pct[s] - share),
              `${mode.name} ${players}P fam${fam} seat ${s} won ${pct[s].toFixed(1)}% (want ~${share.toFixed(0)}%) [${pct.map((p) => p.toFixed(0)).join('/')}]`,
            ).toBeLessThanOrEqual(TOL);
          }
        }
      });
    }
  }
});

// ── Skill (differing profiles → ability decides, not luck) ──────────────────
describe('the better voice wins more than chance', () => {
  // Vary only the mode-relevant stat; rotate the tier→seat assignment each match so
  // skill is separated from any seat effect.
  function skillProfiles(mode: Mode, offset: number): Profile[] {
    const tiers: Profile[] =
      mode.id === 'bellow'
        ? [
            { name: 'weak', power: 52, stamina: 0.6, control: 0.7 },
            { name: 'mid', power: 66, stamina: 0.6, control: 0.7 },
            { name: 'strong', power: 82, stamina: 0.6, control: 0.7 },
          ]
        : mode.id === 'sustain'
          ? [
              { name: 'weak', power: 80, stamina: 0.35, control: 0.7 },
              { name: 'mid', power: 80, stamina: 0.6, control: 0.7 },
              { name: 'strong', power: 80, stamina: 0.9, control: 0.7 },
            ]
          : [
              { name: 'weak', power: 80, stamina: 0.6, control: 0.45 },
              { name: 'mid', power: 80, stamina: 0.6, control: 0.68 },
              { name: 'strong', power: 80, stamina: 0.6, control: 0.92 },
            ];
    // Rotate so each tier occupies each seat equally often.
    const rot = offset % 3;
    return tiers.map((_, i) => tiers[(i + rot) % 3]);
  }

  for (const mode of MODE_LIST) {
    it(`${mode.name}: strong beats weak, and strong beats chance`, () => {
      const n = 600;
      const winsByTier: Record<string, number> = { weak: 0, mid: 0, strong: 0 };
      for (let i = 0; i < n; i++) {
        const profs = skillProfiles(mode, i);
        const g = playMatch(mode, profs, makeRng(999 + i * 2654435761));
        if (g.winnerSeat != null) winsByTier[profs[g.winnerSeat].name]++;
      }
      const pct = (k: string) => (winsByTier[k] / n) * 100;
      expect(
        pct('strong'),
        `${mode.name}: strong=${pct('strong').toFixed(0)}% mid=${pct('mid').toFixed(0)}% weak=${pct('weak').toFixed(0)}%`,
      ).toBeGreaterThan(100 / 3 + 5);
      expect(pct('strong')).toBeGreaterThan(pct('weak') + 8);
    });
  }
});

// ── Drama: not a wipe on rung 0 ──────────────────────────────────────────────
describe('games are not decided before anyone has really played', () => {
  for (const mode of MODE_LIST) {
    it(`${mode.name} 4P: the winner climbed a real ladder`, () => {
      const logs = run(mode, () => identical(4), 300, 21);
      const winnerRungs = logs.map((g) => (g.winnerSeat != null ? g.rungs[g.winnerSeat] : 0));
      winnerRungs.sort((a, b) => a - b);
      const median = winnerRungs[Math.floor(winnerRungs.length / 2)];
      expect(median, `${mode.name} median winner rung=${median}`).toBeGreaterThanOrEqual(3);
    });
  }
});

// ── Mechanism audit (principle #21) — zero tolerance over the event stream ────
describe('the mechanism holds — audited from outside the game', () => {
  // The DEFINITION of "met the target", one comparison per kind, using only the raw
  // reading and the challenge data recorded in the event. Not a call to the game's
  // evaluate/challengeFor — so a broken comparison there turns this red.
  function meetsTarget(c: MatchLog['events'][number]['challenge'], reading: number): boolean {
    switch (c.kind) {
      case 'peak':
        return reading >= c.bar;
      case 'hold':
        return reading >= c.holdMs;
      case 'band':
        return reading >= c.lo && reading <= c.hi;
    }
  }

  for (const mode of MODE_LIST) {
    it(`${mode.name}: clears match the target, the ledger balances, order is sane`, () => {
      let contractViolations = 0;
      let ledgerViolations = 0;
      let monotonicViolations = 0;
      let deadSeatViolations = 0;

      const logs = run(mode, () => identical(4), 200, 5);
      for (const g of logs) {
        const eliminated = new Set<number>();
        let lastDiff = -Infinity;
        let lastBar = -Infinity;
        for (const e of g.events) {
          // 1. A clear happens iff the reading actually met the target.
          if (e.cleared !== meetsTarget(e.challenge, e.reading)) contractViolations++;

          // 2. The difficulty ledger: +step on a clear, -relief (floored at 0) on a miss.
          const expected = e.cleared
            ? e.diffBefore + mode.step
            : Math.max(0, e.diffBefore - mode.relief);
          if (Math.abs(e.diffAfter - expected) > 1e-9) ledgerViolations++;

          // 3. Bar monotonic in difficulty for peak (challengeFor never dips).
          if (e.challenge.kind === 'peak') {
            const bar = e.challenge.bar;
            if (e.diffBefore >= lastDiff && bar + 1e-9 < lastBar) monotonicViolations++;
            lastDiff = e.diffBefore;
            lastBar = bar;
          }

          // 4. A knocked-out seat never attempts again.
          if (eliminated.has(e.seat)) deadSeatViolations++;
          if (!e.cleared) eliminated.add(e.seat);
        }
      }

      expect(contractViolations, 'a clear disagreed with the target definition').toBe(0);
      expect(ledgerViolations, 'the difficulty ledger did not balance').toBe(0);
      expect(monotonicViolations, 'the bar went DOWN as difficulty rose').toBe(0);
      expect(deadSeatViolations, 'an eliminated seat attempted again').toBe(0);
    });
  }
});
