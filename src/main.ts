// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// See ADDITIONAL-TERMS.md for the section 7(b) attribution requirement.
/**
 * main.ts — Uproar bootstrap and screen flow.
 *
 * Single-device party game: a menu, a setup screen (mode + players), the game
 * (one turn at a time), and a results screen. No network — everything is local.
 * The one thing that touches a sensor is the mic LevelSource, requested from a tap
 * and disposed when a match ends.
 */

import '@ben-gy/game-engine/mobile.css';
import './styles/main.css';

import { hardenViewport } from '@ben-gy/game-engine/mobile';
import { createSfx } from '@ben-gy/game-engine/sound';
import { createStore } from '@ben-gy/game-engine/storage';
import { mountFeedback, openFeedback } from './feedback';

import { MODE_LIST, modeOf, describeChallenge, type Mode } from './modes';
import type { ModeId, Challenge, Sample, AttemptResult } from './loudness';
import {
  createMatch,
  submitAttempt,
  currentPlayer,
  currentChallenge,
  PLAYER_COLORS,
  type Match,
  type Player,
} from './game';
import { requestMicSource, micSupported, type LevelSource } from './mic';
import { createTapSource } from './tap';
import { runAttempt, type AttemptHandle } from './attempt';
import { Confetti } from './particles';
import { randomWord } from './words';

const SLUG = 'uproar';
const store = createStore(SLUG);

const sfx = createSfx({
  muted: store.get('muted', false),
  patches: {
    clear: { type: 'triangle', freq: [520, 1180], dur: 0.3, gain: 0.28 },
    fail: { type: 'sawtooth', freq: [300, 70], dur: 0.5, gain: 0.32, noise: true },
    climb: { type: 'square', freq: [660, 990], dur: 0.14, gain: 0.2 },
    eliminate: { type: 'sawtooth', freq: [220, 60], dur: 0.6, gain: 0.3 },
  },
});

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function vibrate(pattern: number | number[]): void {
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported — no-op */
  }
}

// ── App shell ────────────────────────────────────────────────────────────
const app = document.getElementById('app')!;
const main = document.createElement('div');
main.className = 'main-content';
const footer = document.createElement('footer');
footer.className = 'site-footer';
footer.innerHTML =
  'Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a> · ' +
  '<a href="https://lab.benrichardson.dev" target="_blank" rel="noopener">more games, tools &amp; sites</a>';
app.append(main, footer);

const confetti = new Confetti(document.body);

function setPlaying(on: boolean): void {
  document.body.classList.toggle('playing', on);
}

function clearMain(): void {
  main.innerHTML = '';
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

function button(label: string, cls = 'btn', onClick?: () => void): HTMLButtonElement {
  const b = el('button', cls);
  b.type = 'button';
  b.textContent = label;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

// ── Menu ─────────────────────────────────────────────────────────────────
let lastMode: ModeId = store.get<ModeId>('mode', 'bellow');
let lastNames: string[] = store.get<string[]>('names', ['You']);

function showMenu(): void {
  setPlaying(false);
  clearMain();
  main.append(
    el('h1', 'brand', 'Uproar'),
    el('p', 'tagline', 'Get louder than the last person.'),
    el('p', 'sub', 'One phone, a group of friends, and a bar that keeps climbing.'),
  );

  const stack = el('div', 'stack');
  stack.append(
    button('Play together', 'btn big', () => showSetup('party')),
    button('Play solo', 'btn secondary', () => showSetup('solo')),
    button('How to play', 'btn ghost', showHowTo),
    button('About', 'btn ghost', showAbout),
  );
  main.append(stack);

  const muteBtn = button(sfx.muted() ? '🔇 Sound off' : '🔊 Sound on', 'btn ghost', () => {
    const m = !sfx.muted();
    sfx.setMuted(m);
    store.set('muted', m);
    muteBtn.textContent = m ? '🔇 Sound off' : '🔊 Sound on';
  });
  main.append(muteBtn);
}

// ── How to play / About ────────────────────────────────────────────────────
function backBar(): HTMLElement {
  return button('← Back', 'btn secondary', showMenu);
}

function showHowTo(): void {
  store.set('seenHowTo', true);
  clearMain();
  const card = el('div', 'card prose');
  card.innerHTML = `
    <h2>How to play</h2>
    <p><span class="hi">Get louder than the last person.</span> On your turn, tap the
      big button, wait for <b>GO</b>, and make noise — the bar shows how loud you have
      to be. Clear it and the bar climbs higher for the next player; miss it and you're
      <b>out</b>. Last one standing wins.</p>
    <p>Three ways to play:</p>
    <p>• <span class="hi">Bellow</span> — just get loud, louder than the rising bar.<br/>
       • <span class="hi">Sustain</span> — hold your voice above the line, for longer each turn.<br/>
       • <span class="hi">Pinpoint</span> — land inside the band. Not too quiet, not too loud — and it shrinks.</p>
    <p class="disclosure">No microphone, or you'd rather not use it? You'll get the
      <b>tap version</b> — same game, your thumb instead of your voice. Either way,
      nothing you say is ever recorded, stored or sent anywhere: the phone only measures
      how loud the room is.</p>
  `;
  main.append(card, backBar());
}

function showAbout(): void {
  clearMain();
  const card = el('div', 'card prose');
  card.innerHTML = `
    <h2>About</h2>
    <p><b>Uproar</b> is a pass-the-phone party game about being the loudest — or the
      steadiest, or the most precise — voice in the room.</p>
    <p class="disclosure">It uses your device microphone <b>only</b> to measure loudness
      as a single number. No audio is recorded, stored, or sent anywhere, and nothing is
      transcribed or understood. The microphone stops the moment a game ends. If there is
      no mic (or you decline), the game plays with taps instead.</p>
    <p class="disclosure">Uproar is a single-device game — there is no online multiplayer
      and no game server. The only network request it makes is an anonymous, cookie-less
      page-view count (Cloudflare Web Analytics).</p>
    <p>Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a>.</p>
  `;
  main.append(card, backBar());
}

// ── Setup (mode + players) ─────────────────────────────────────────────────
function showSetup(kind: 'solo' | 'party'): void {
  setPlaying(false);
  clearMain();
  let mode: ModeId = lastMode;
  let names: string[] =
    kind === 'solo'
      ? [lastNames[0] || 'You']
      : lastNames.length >= 2
        ? [...lastNames]
        : ['Player 1', 'Player 2', 'Player 3'];
  if (kind === 'party' && names.length < 2) names = ['Player 1', 'Player 2'];

  main.append(el('h1', 'brand', 'Uproar'));

  // Mode picker
  const modeCard = el('div', 'card');
  modeCard.append(el('h2', undefined, 'Pick a mode'));
  const modes = el('div', 'modes');
  const modeButtons: HTMLButtonElement[] = [];
  for (const m of MODE_LIST) {
    const b = el('button', 'mode-opt');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(m.id === mode));
    b.innerHTML = `<span class="mode-name">${m.name}</span><span class="mode-blurb">${m.blurb}</span>`;
    b.addEventListener('click', () => {
      mode = m.id;
      for (const mb of modeButtons) mb.setAttribute('aria-pressed', String(mb === b));
      sfx.unlock();
      sfx.play('select');
    });
    modeButtons.push(b);
    modes.append(b);
  }
  modeCard.append(modes);
  main.append(modeCard);

  // Players
  const playCard = el('div', 'card');
  if (kind === 'party') {
    playCard.append(el('h2', undefined, 'Who’s playing?'));
    const list = el('div', 'players-list');
    const render = (): void => {
      list.innerHTML = '';
      names.forEach((nm, i) => {
        const row = el('div', 'player-row');
        const dot = el('span', 'player-dot');
        dot.style.background = PLAYER_COLORS[i % PLAYER_COLORS.length];
        const input = el('input');
        input.value = nm;
        input.maxLength = 14;
        input.setAttribute('aria-label', `Player ${i + 1} name`);
        input.addEventListener('input', () => {
          names[i] = input.value;
        });
        row.append(dot, input);
        if (names.length > 2) {
          const rm = el('button', 'rm');
          rm.type = 'button';
          rm.textContent = '×';
          rm.setAttribute('aria-label', `Remove player ${i + 1}`);
          rm.addEventListener('click', () => {
            names.splice(i, 1);
            render();
          });
          row.append(rm);
        }
        list.append(row);
      });
    };
    render();
    playCard.append(list);
    const addBtn = button('+ Add player', 'btn ghost', () => {
      if (names.length >= 8) return;
      names.push(`Player ${names.length + 1}`);
      render();
      addBtn.disabled = names.length >= 8;
    });
    playCard.append(addBtn);
  } else {
    playCard.append(el('h2', undefined, 'Your name'));
    const row = el('div', 'player-row');
    const dot = el('span', 'player-dot');
    dot.style.background = PLAYER_COLORS[0];
    const input = el('input');
    input.value = names[0];
    input.maxLength = 14;
    input.setAttribute('aria-label', 'Your name');
    input.addEventListener('input', () => {
      names[0] = input.value;
    });
    row.append(dot, input);
    playCard.append(row);
  }
  main.append(playCard);

  const status = el('div', 'badge-input');
  status.textContent = micSupported()
    ? 'Uses the mic to measure loudness — nothing is recorded.'
    : 'No mic here — you’ll play the tap version.';
  main.append(status);

  const start = button('Start', 'btn big', () => {
    lastMode = mode;
    lastNames = names.map((n) => n.trim() || 'Player');
    store.set('mode', mode);
    store.set('names', lastNames);
    sfx.unlock();
    beginMatch(modeOf(mode), lastNames, status);
  });
  main.append(start, backBar());
}

// ── Match lifecycle ─────────────────────────────────────────────────────────
let micSource: LevelSource | null = null;
let session: GameSession | null = null;

async function beginMatch(mode: Mode, names: string[], status: HTMLElement): Promise<void> {
  // Request the mic from within this tap gesture. Failure/denial → tap fallback.
  if (micSupported() && !micSource) {
    status.textContent = 'Allow the mic to play with your voice…';
    try {
      micSource = await requestMicSource((s) => {
        status.textContent = s;
      });
    } catch {
      micSource = null;
      status.textContent = 'No microphone — playing the tap version.';
    }
  }
  session = new GameSession(mode, names, micSource);
  session.start();
}

function endMatchToMenu(): void {
  session?.dispose();
  session = null;
  if (micSource) {
    micSource.dispose();
    micSource = null;
  }
  showMenu();
}

// ── Game session ─────────────────────────────────────────────────────────
class GameSession {
  private match: Match;
  private root!: HTMLElement;
  private meter!: HTMLElement;
  private fill!: HTMLElement;
  private reading!: HTMLElement;
  private target!: HTMLElement;
  private band!: HTMLElement;
  private padHint!: HTMLElement;
  private chipsEl!: HTMLElement;
  private banner!: HTMLElement;
  private promptEl!: HTMLElement;
  private actionEl!: HTMLElement;
  private countdownEl!: HTMLElement;
  private attempt: AttemptHandle | null = null;
  private tapSource: LevelSource | null = null;
  private readonly usingMic: boolean;

  constructor(
    private mode: Mode,
    names: string[],
    private mic: LevelSource | null,
  ) {
    this.match = createMatch(mode, names);
    this.usingMic = !!mic;
  }

  start(): void {
    setPlaying(true);
    this.build();
    this.nextTurn();
  }

  private build(): void {
    clearMain();
    this.root = el('div', 'game');

    const top = el('div', 'game-top');
    const modePill = el('span', 'pill', this.mode.name);
    const quit = el('button', 'icon-btn');
    quit.type = 'button';
    quit.textContent = '✕';
    quit.setAttribute('aria-label', 'Quit to menu');
    quit.addEventListener('click', () => {
      if (this.match.players.length === 1 || confirm('Quit this game?')) endMatchToMenu();
    });
    top.append(modePill, quit);

    this.chipsEl = el('div', 'chips');
    this.banner = el('div', 'turn-banner');
    this.promptEl = el('div', 'prompt');

    const stage = el('div', 'stage');
    this.meter = el('div', 'meter');
    this.band = el('div', 'meter-band');
    this.fill = el('div', 'meter-fill');
    this.target = el('div', 'meter-target');
    this.reading = el('div', 'meter-reading', '0');
    this.padHint = el('div', 'pad-hint');
    this.countdownEl = el('div', 'countdown');
    this.countdownEl.hidden = true;
    this.meter.append(this.band, this.fill, this.target, this.reading, this.padHint, this.countdownEl);
    stage.append(this.meter);

    this.actionEl = el('div', 'game-bottom');

    this.root.append(top, this.chipsEl, this.banner, this.promptEl, stage, this.actionEl);
    main.append(this.root);
  }

  private drawChallenge(c: Challenge): void {
    // Reset marks
    this.band.style.height = '0%';
    this.target.style.display = 'none';
    if (c.kind === 'peak') {
      this.target.style.display = 'block';
      this.target.style.bottom = `${c.bar}%`;
      this.target.setAttribute('data-label', `${Math.round(c.bar)}`);
    } else if (c.kind === 'hold') {
      this.target.style.display = 'block';
      this.target.style.bottom = `${c.bar}%`;
      this.target.setAttribute('data-label', describeChallenge(c));
    } else {
      this.band.style.bottom = `${c.lo}%`;
      this.band.style.height = `${c.hi - c.lo}%`;
    }
  }

  private renderChips(): void {
    this.chipsEl.innerHTML = '';
    if (this.match.players.length === 1) return;
    for (const p of this.match.players) {
      const chip = el('div', 'chip');
      if (p.id === currentPlayer(this.match).id && p.alive) chip.classList.add('current');
      if (!p.alive) chip.classList.add('out');
      const dot = el('span', 'cdot');
      dot.style.background = PLAYER_COLORS[p.color % PLAYER_COLORS.length];
      chip.append(dot, document.createTextNode(p.name));
      this.chipsEl.append(chip);
    }
  }

  private nextTurn(): void {
    if (this.match.finished) return this.showResults();
    const p = currentPlayer(this.match);
    const c = currentChallenge(this.match);
    this.renderChips();
    this.drawChallenge(c);
    this.fill.style.height = '0%';
    this.reading.textContent = '0';
    this.padHint.textContent = '';
    this.meter.classList.remove('pad');

    this.banner.innerHTML = `<div class="who" style="color:${PLAYER_COLORS[p.color % PLAYER_COLORS.length]}">${p.name}</div><div class="target">${describeChallenge(c)}</div>`;
    this.promptEl.innerHTML = `Shout: <b>${randomWord()}</b>`;

    this.actionEl.innerHTML = '';
    const verb = this.usingMic ? this.mode.verb : this.mode.verb;
    const go = button(`${p.name} — ${verb}!`, 'btn big hot', () => this.beginAttempt());
    this.actionEl.append(go);
  }

  private beginAttempt(): void {
    sfx.unlock();
    const c = currentChallenge(this.match);
    this.actionEl.innerHTML = '';

    // Choose the level source for this attempt.
    let source: LevelSource;
    if (this.usingMic && this.mic) {
      source = this.mic;
    } else {
      this.tapSource = createTapSource(this.mode.id, this.meter);
      source = this.tapSource;
      this.meter.classList.add('pad');
    }

    const hint =
      this.mode.id === 'bellow'
        ? this.usingMic
          ? 'SHOUT!'
          : 'MASH!'
        : this.mode.id === 'sustain'
          ? this.usingMic
            ? 'HOLD IT!'
            : 'MASH TO HOLD!'
          : this.usingMic
            ? 'STEADY…'
            : 'TAP TO LOCK';

    this.attempt = runAttempt({
      source,
      challenge: c,
      windowMs: this.mode.windowMs,
      cb: {
        onCountdown: (n) => {
          this.countdownEl.hidden = false;
          this.countdownEl.innerHTML = `<span>${n === 0 ? 'GO' : n}</span>`;
          if (n === 0) {
            sfx.play('go');
            vibrate(40);
          } else {
            sfx.play('beat');
            vibrate(20);
          }
        },
        onOpen: () => {
          this.countdownEl.hidden = true;
          this.padHint.textContent = hint;
        },
        onTick: (level, _elapsed, running) => {
          this.fill.style.height = `${Math.max(0, Math.min(100, level))}%`;
          if (c.kind === 'hold') {
            this.reading.textContent = `${(running / 1000).toFixed(1)}s`;
          } else {
            this.reading.textContent = `${Math.round(c.kind === 'band' ? running : level)}`;
          }
        },
        onDone: (result, samples) => this.finishAttempt(result, samples),
      },
    });
  }

  private finishAttempt(result: AttemptResult, _samples: Sample[]): void {
    if (this.tapSource) {
      this.tapSource.dispose();
      this.tapSource = null;
    }
    this.meter.classList.remove('pad');
    this.padHint.textContent = '';
    this.countdownEl.hidden = true;

    const p = currentPlayer(this.match);
    const outcome = submitAttempt(this.match, result);

    if (outcome.cleared) {
      sfx.play('clear');
      vibrate([0, 60]);
      if (!prefersReducedMotion()) confetti.burst(0.5, 0.42, 70);
      this.flash('pass', 'CLEAR!', this.readingLabel(result));
    } else {
      sfx.play(this.match.players.length === 1 ? 'fail' : 'eliminate');
      vibrate([0, 120, 60, 120]);
      if (!prefersReducedMotion()) this.root.classList.add('shake');
      this.flash('fail', this.match.players.length === 1 ? 'MISSED' : 'OUT!', this.readingLabel(result));
    }

    setTimeout(() => {
      this.root.classList.remove('shake');
      if (this.match.finished) this.showResults();
      else this.nextTurn();
    }, 1150);
    void p;
  }

  private readingLabel(r: AttemptResult): string {
    const c = currentChallenge(this.match);
    if (c.kind === 'hold') return `held ${(r.reading / 1000).toFixed(1)}s`;
    if (c.kind === 'band') return `landed on ${Math.round(r.reading)}`;
    return `hit ${Math.round(r.reading)}`;
  }

  private flash(kind: 'pass' | 'fail', big: string, sm: string): void {
    const f = el('div', `flash ${kind}`);
    f.innerHTML = `<div class="big">${big}</div><div class="sm">${sm}</div>`;
    document.body.append(f);
    setTimeout(() => f.remove(), 1100);
  }

  private showResults(): void {
    this.disposeAttempt();
    setPlaying(false);
    clearMain();
    const m = this.match;
    const solo = m.players.length === 1;

    main.append(el('h1', 'brand', solo ? 'Game over' : 'Winner!'));

    // A party win earns a celebration; a solo game-over is a loss, so no confetti.
    if (!solo && m.winnerId != null && !prefersReducedMotion()) {
      confetti.burst(0.5, 0.3, 120);
    }

    if (solo) {
      const p = m.players[0];
      const best = store.recordScore(`best:${m.mode.id}`, { name: p.name, score: p.rung }, 5);
      const bestScore = best[0]?.score ?? p.rung;
      main.append(
        el('p', 'tagline', `You climbed to level ${p.rung}.`),
        el('p', 'sub', `Best in ${m.mode.name}: ${bestScore}`),
      );
    } else {
      const win = m.players.find((q) => q.id === m.winnerId);
      if (win) {
        const c = PLAYER_COLORS[win.color % PLAYER_COLORS.length];
        main.append(el('p', 'tagline', ``));
        (main.lastChild as HTMLElement).innerHTML = `<span style="color:${c};font-weight:900">${win.name}</span> is the loudest of all.`;
      }
    }

    // Everyone's outcome (principle #9).
    const list = el('div', 'results-list');
    const ranked = this.ranked();
    ranked.forEach((p, i) => {
      const row = el('div', 'result-row');
      if (!solo && p.id === m.winnerId) row.classList.add('winner');
      const rank = el('span', 'rank', solo ? '' : `${i + 1}`);
      const dot = el('span', 'player-dot');
      dot.style.background = PLAYER_COLORS[p.color % PLAYER_COLORS.length];
      const nm = el('span', 'nm', p.name);
      const reached = p.alive ? p.rung : (p.outAtRung ?? 0);
      const score = el('span', 'score', `lvl ${reached}`);
      row.append(rank, dot, nm, score);
      list.append(row);
    });
    main.append(list);

    const stack = el('div', 'stack');
    stack.append(
      button('Play again', 'btn big', () => this.playAgain()),
      button('Change setup', 'btn secondary', () => {
        this.dispose();
        session = null;
        if (micSource) {
          micSource.dispose();
          micSource = null;
        }
        showSetup(solo ? 'solo' : 'party');
      }),
      button('Menu', 'btn ghost', () => {
        this.dispose();
        endMatchToMenu();
      }),
    );
    main.append(stack);

    if (solo) {
      const share = button('Share your score', 'btn ghost', () => {
        const text = `I climbed to level ${m.players[0].rung} in Uproar (${m.mode.name})! https://uproar.benrichardson.dev`;
        try {
          if (navigator.share) void navigator.share({ text });
          else void navigator.clipboard?.writeText(text);
        } catch {
          /* ignore */
        }
      });
      main.append(share);
    }

    const fb = el('button', 'results-feedback');
    fb.type = 'button';
    fb.textContent = 'Something feel off? Tell me →';
    fb.addEventListener('click', (e) =>
      openFeedback({ returnFocusTo: e.currentTarget as HTMLElement }),
    );
    main.append(fb);
  }

  private ranked(): Player[] {
    return [...this.match.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      const ao = a.outAtRung ?? a.rung;
      const bo = b.outAtRung ?? b.rung;
      if (bo !== ao) return bo - ao;
      return b.bestReading - a.bestReading;
    });
  }

  private playAgain(): void {
    this.disposeAttempt();
    this.match = createMatch(this.mode, this.match.players.map((p) => p.name));
    setPlaying(true);
    this.build();
    this.nextTurn();
  }

  private disposeAttempt(): void {
    this.attempt?.cancel();
    this.attempt = null;
    if (this.tapSource) {
      this.tapSource.dispose();
      this.tapSource = null;
    }
  }

  dispose(): void {
    this.disposeAttempt();
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
hardenViewport();
mountFeedback();
if (store.get('seenHowTo', false)) showMenu();
else showHowTo();
