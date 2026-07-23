// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * mic.ts — the microphone LevelSource (principle #23, primary input).
 *
 * getUserMedia({audio}) → an AnalyserNode → RMS per frame → a 0..100 level via the
 * pure `levelFromRms`. It computes a number and nothing else: no audio is recorded,
 * buffered to disk, or put on any wire. Every track is stopped on dispose(), so the
 * OS mic indicator goes out the moment a game ends.
 *
 * getUserMedia must be called from a user gesture (iOS) and needs a secure context
 * (https / localhost). Absence or denial is not an error the game shows the player as
 * a wall — main.ts falls back to the tap source instead.
 */

import { levelFromRms, rms, calibrateFloorDb, DEFAULT_CEIL_DB } from './loudness';

export interface LevelSource {
  readonly kind: 'mic' | 'tap';
  /** Current instantaneous loudness, 0..100. Cheap; call it every frame. */
  level(): number;
  /** Release every resource (mic tracks, audio graph, pointer handlers). */
  dispose(): void;
}

export interface MicSource extends LevelSource {
  kind: 'mic';
}

const AudioCtor = (): typeof AudioContext | null =>
  window.AudioContext ||
  (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
  null;

/** True when the browser can even attempt a mic capture. */
export function micSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    AudioCtor()
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ask for the mic (from within a tap), calibrate the room's noise floor, and return
 * a live source. Rejects if permission is denied or capture fails — the caller uses
 * the tap fallback in that case.
 */
export async function requestMicSource(onStatus?: (s: string) => void): Promise<MicSource> {
  const AC = AudioCtor();
  if (!navigator.mediaDevices?.getUserMedia || !AC) {
    throw new Error('mic-unsupported');
  }

  // No AGC/noise-suppression: those fight us by normalising exactly the loudness we
  // are trying to measure.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const ctx = new AC();
  if (ctx.state === 'suspended') await ctx.resume();
  const srcNode = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  srcNode.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  const readRms = (): number => {
    analyser.getFloatTimeDomainData(buf);
    return rms(buf);
  };

  // Calibrate the ambient floor over ~500ms so a quiet room reads 0.
  onStatus?.('Listening to the room…');
  const ambient: number[] = [];
  for (let i = 0; i < 12; i++) {
    ambient.push(readRms());
    await sleep(40);
  }
  let floorDb = calibrateFloorDb(ambient);
  const ceilDb = DEFAULT_CEIL_DB;

  let disposed = false;

  return {
    kind: 'mic',
    level(): number {
      if (disposed) return 0;
      const r = readRms();
      // Track a slowly-descending floor so a room that quietens mid-game still maps
      // sensibly, but never let live speech drag the floor up.
      const db = 20 * Math.log10(Math.max(r, 1e-6));
      if (db < floorDb - 3) floorDb = Math.max(-90, floorDb - 0.5);
      return levelFromRms(r, floorDb, ceilDb);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try {
        srcNode.disconnect();
      } catch {
        /* already gone */
      }
      for (const t of stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* best effort */
        }
      }
      try {
        void ctx.close();
      } catch {
        /* best effort */
      }
    },
  };
}
