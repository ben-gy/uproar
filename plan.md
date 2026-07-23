# Game Plan: Uproar

## Overview
- **Name:** Uproar
- **Repo name:** uproar
- **Tagline:** Pass the phone and get louder than the last person — the mic keeps score, your nerve runs out first.
- **Genre (directory category):** party

## Core Loop
One phone, a group of people, and a bar that climbs. On your turn the phone counts
you in (3-2-1-GO) and opens a short window; you make noise into the mic and it
measures how loud you got. Clear the bar and it rises to meet you and passes to the
next player; fail to clear it and you're knocked out. Last one left — the one who
was willing to be loudest in a public place — wins. Solo, it's a personal ladder:
how many rungs can you climb before your voice (or your nerve) gives out.

**The tension is entirely social and physical.** Nothing is recorded, nothing is
understood — it is one number against a rising line. The reason you lose is that you
bottle it in front of your friends, which is the whole joke.

**Why a sensor and not touch (principle #23):** the last 28 games in the fleet are
every one of them a finger on glass or a key on a keyboard. This one is a phone
*listening to the room* — the input is your actual voice volume, an `AnalyserNode`
RMS against a moving threshold, which is a number a static page can measure with no
backend and nothing recorded. It is social, physical and funny in a way no tap game
is, and the entire mechanic is one sentence. A full touch/keyboard fallback exists
and is a real game (a mashing/nerve bar) — see below — so no mic is never a wall.

## Controls
- **Primary input:** **microphone loudness** (getUserMedia + AnalyserNode → RMS →
  a 0..100 level). Not touch, because "how loud can you be" is the game; a tap
  cannot make you self-conscious in a room full of people.
- **Desktop:** mic if granted; otherwise the fallback with mouse/Space.
- **Mobile:** mic if granted; otherwise the fallback with taps. No D-pad, no
  joystick — the only verbs are "start my turn" (a big 44px+ button) and the noise
  itself.
- **Fallback (mic absent or permission denied) — a real game, built FIRST:** a
  **nerve/charge bar** driven by taps. Same escalation, same three modes, same pure
  evaluator — only the *level source* changes:
  - Bellow → **mash**: rapid taps push a decaying level up; its peak is your reading.
    Human mash-rate caps out, so the ladder ends naturally, mirroring a voice ceiling.
  - Sustain → **keep-it-up**: the level leaks; mash to hold it above the line for the
    (lengthening) duration.
  - Pinpoint → **lock**: a needle sweeps 0..100 on its own; tap to lock it inside the
    (narrowing) band.
  The fallback is announced honestly ("No microphone — playing the tap version") and
  is never a dead screen.
- **Permission:** requested only from inside the Play/turn tap handler (iOS requires
  a user gesture and `getUserMedia` needs a secure context). `'denied'`/absent →
  fallback. Disclosed at the prompt: *"Uproar uses the microphone to measure how loud
  the room is. Nothing is recorded, stored or sent anywhere."*
- **Pure derivation (unit-tested hard):** `rms(Float32Array) → number`,
  `levelFromRms(rms, floor, ceil) → 0..100` (ambient noise floor calibrated at boot),
  `evaluateAttempt(mode, challenge, levelSeries) → { reading, passed }`,
  `nextChallenge(mode, turn, lastReading) → challenge`. Both the mic driver and the
  tap driver feed the *same* evaluator, so the game logic never knows which was used.
- **Browser test hook:** `window.__uproarFeed(levelSeries)` injects a synthetic
  sample stream so the sensor path is provable end-to-end in the automated browser
  pass without a real mic.

## Multiplayer
- **Mode:** **none (local hot-seat + solo).** This is a *local* party game — many
  players, one device, no network. It is deliberately NOT live P2P.
- **Why not live P2P (honest, per the multiplayer decision):** the entire appeal is
  people in one physical space daring each other to be louder. Remote play would put
  each shout on a different phone in a different room where nobody can hear it — and
  since principle #23 forbids sending audio on the wire, a remote opponent would be a
  *number changing on a screen*, which is strictly worse than the in-person game. The
  factory guidance is explicit that not every game needs a network and that a game
  best played together on one device should ship that way. Forcing WebRTC on it would
  be the wrong call, and it would trade effort away from the thing that actually
  carries the risk here: the sensor and its fallback.
- **Local party shape:** 2–8 players share the phone. A knockout: on a fail you're
  out, play continues around the circle until one remains. A per-player results
  screen shows *everyone's* best rung reached and who cracked at what height
  (principle #9 in spirit — the summary is about the whole group, not just you).
- **Solo shape:** one player climbs the ladder alone; score = rung reached; best kept
  in localStorage; a Share button copies "I reached level N in Uproar — <url>".
- Nothing crosses any wire. The only network call the game makes is the Cloudflare
  analytics beacon (disclosed in About).

## Juice Plan
- A big live **level meter** that fills and glows as you get louder, with the target
  bar drawn across it; the fill overshoots and springs back on release.
- Screen **flash + confetti burst + rising "whoosh"** on a cleared bar; a **buzzer +
  red shake + the meter draining** on a fail.
- **`navigator.vibrate`** on the countdown beats, on clear (short) and on fail (long
  double-buzz) — a second sensor used for feedback.
- 3-2-1-GO **countdown with audio** (engine `beat`/`go`) so players watch the meter,
  not the clock, and know exactly when the window opens (principle #15 as good UX).
- A silly **shout prompt** each turn ("Shout: KESTREL!") from a local word list —
  purely cosmetic flavour, nothing is understood or recognised.
- Number-pop on the new bar height, elimination "poof" on a knocked-out chip, and an
  escalating background hue that warms as the bar climbs toward the ceiling.
- All of it respects `prefers-reduced-motion` (no shake/confetti, meter still moves)
  and the mute toggle (persisted).

## Style Direction
**Vibe:** neon-party / bold-poster. Big type, high energy.
**Palette:** ink `#0e1230` background; a rising **amber→magenta** meter gradient
(loud = hot); target line in high-contrast cyan `#38e1d6`; player chips in a
colour-blind-safe qualitative set (blue/orange/teal/pink/yellow/purple, distinguished
by hue *and* a letter). All meaningful marks pinned ≥3:1 by `contrast.test.ts`.
**Theme:** dark (arcade/party energy, and the meter glow reads best on ink).
**Reference feel:** the loud-and-proud energy of a good pub party game / Jackbox
lobby screen — bold, legible from across a table — as *feel* only, no IP.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite. No React (few screens, one shared state).
- **Render:** **DOM/CSS** — the meter, bar, chips and buttons are crisp, accessible,
  trivially responsive DOM; a `<canvas>` only for the confetti particle burst.
- **Engine modules used (imported, never copied):** `sound` (SFX + countdown cues),
  `storage` (best score + settings), `mobile` (`hardenViewport`) + `mobile.css`,
  `feedback`. No `net`/`rematch`/`lobby`/`rng` — single-device, no shared randomness
  that must sync (word prompts use `Math.random`, which is fine because nothing is
  networked).
- **Persistence:** localStorage — mute, reduced-motion override, solo best per mode,
  "seen how-to-play", last player count.

## Non-Goals
- No live networked multiplayer (explained above).
- No speech recognition of any kind (`SpeechRecognition` is Chrome-only and ships
  audio to Google — banned by principle #23). Loudness only.
- No recording, storage or upload of any audio. The mic stream is processed frame by
  frame and discarded; every track is `stop()`ed at teardown.

## How To Play (player-facing copy)
> **Get louder than the last person.** On your turn, tap **Shout**, wait for GO, and
> make noise — the bar shows how loud you have to be. Clear it and it climbs higher
> for the next player; miss it and you're out. Last one standing wins.
> *No mic? You'll get the tap version instead — same game, your thumb instead of your
> voice. Nothing you say is ever recorded or sent anywhere.*
