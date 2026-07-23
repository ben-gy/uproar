// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * tap.ts — the touch/keyboard fallback LevelSource (principle #23).
 *
 * When there is no mic (unsupported, or permission denied), the game is still a
 * real game: your thumb replaces your voice, driving the SAME 0..100 level the
 * evaluator reads. Three feels, matching the three modes:
 *   • bellow  — MASH: each tap kicks a level that decays exponentially, so a
 *               determined fast masher plateaus high and a lazy one does not — a
 *               natural ceiling, exactly like a voice.
 *   • sustain — MASH TO HOLD: same level, but you must keep it above the line for
 *               the (lengthening) duration.
 *   • pinpoint— HOLD TO LOCK: a needle sweeps 0..100; press to freeze it, release
 *               to let it sweep again. Land it steady inside the band.
 *
 * Pointer Events only, setPointerCapture on down, pointercancel treated as an
 * aborted press (principle #19).
 */

import type { LevelSource } from './mic';
import type { ModeId } from './loudness';

const IMPULSE = 17; // level added per tap (mash modes)
const DECAY_K = 0.0045; // proportional decay per ms (mash modes)
const SWEEP_PER_MS = 100 / 1400; // pinpoint needle: a full sweep ~1.4s

export interface TapSource extends LevelSource {
  kind: 'tap';
}

const now = (): number =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

/**
 * Bind a tap source to a pad element. `mode` selects the feel. Space/Enter on the
 * document also drive it, so desktop keyboard players get the same game.
 */
export function createTapSource(mode: ModeId, pad: HTMLElement): TapSource {
  let value = 0;
  let holding = false; // pinpoint: needle frozen
  let sweepDir = 1;
  let lastT = now();
  const pointers = new Set<number>();
  const isPinpoint = mode === 'pinpoint';

  const kick = (): void => {
    if (isPinpoint) {
      holding = true;
    } else {
      value = Math.min(100, value + IMPULSE);
    }
  };
  const release = (): void => {
    if (isPinpoint) holding = false;
  };

  const onDown = (e: PointerEvent): void => {
    e.preventDefault();
    pointers.add(e.pointerId);
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {
      /* not fatal */
    }
    kick();
  };
  const onUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) release();
  };
  const onCancel = (e: PointerEvent): void => {
    // An aborted gesture: drop the pointer and stop holding, never leave it frozen.
    pointers.delete(e.pointerId);
    if (pointers.size === 0) release();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      kick();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'Enter') release();
  };

  pad.addEventListener('pointerdown', onDown);
  pad.addEventListener('pointerup', onUp);
  pad.addEventListener('pointercancel', onCancel);
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);

  return {
    kind: 'tap',
    level(): number {
      const t = now();
      const dt = Math.max(0, Math.min(100, t - lastT));
      lastT = t;
      if (isPinpoint) {
        if (!holding) {
          value += sweepDir * SWEEP_PER_MS * dt;
          if (value >= 100) {
            value = 100;
            sweepDir = -1;
          } else if (value <= 0) {
            value = 0;
            sweepDir = 1;
          }
        }
      } else {
        value = Math.max(0, value - value * DECAY_K * dt);
      }
      return value;
    },
    dispose(): void {
      pad.removeEventListener('pointerdown', onDown);
      pad.removeEventListener('pointerup', onUp);
      pad.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
      for (const id of pointers) {
        try {
          pad.releasePointerCapture(id);
        } catch {
          /* ignore */
        }
      }
      pointers.clear();
    },
  };
}
