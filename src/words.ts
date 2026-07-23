// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * words.ts — silly shout prompts. Purely cosmetic: the game measures loudness and
 * understands NOTHING you say. The prompt just gives the group a shared word to
 * yell so nobody freezes up. No speech recognition anywhere (principle #23).
 */

const WORDS = [
  'BANANA', 'KESTREL', 'WALLOP', 'KRAKEN', 'GAZEBO', 'THUNDER', 'NOODLE', 'ROCKET',
  'MAMMOTH', 'PICKLE', 'AVALANCHE', 'BAGPIPES', 'WOMBAT', 'GALAXY', 'PANDEMONIUM',
  'TRUMPET', 'HULLABALOO', 'BOOMERANG', 'JAMBOREE', 'CATAPULT', 'FANDANGO',
  'WHIRLWIND', 'KABOOM', 'BONANZA', 'STAMPEDE', 'RUMPUS', 'ZIGGURAT', 'HOORAY',
  'MAELSTROM', 'FIREWORKS', 'DYNAMITE', 'YODEL', 'GADZOOKS', 'HULLO', 'TITANIC',
];

/** A random prompt. Uses Math.random — nothing is networked, so no seed is needed. */
export function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}
