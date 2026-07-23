# Uproar

**Pass the phone and get louder than the last person — the mic keeps score, your nerve runs out first.**

🎮 Play: https://uproar.benrichardson.dev

## What it is

Uproar is a pass-the-phone party game. One phone goes round a group; on your turn
the phone counts you in (3-2-1-GO) and listens, and you have to be louder than the
bar. Clear it and the bar climbs to meet you and passes to the next player; miss it
and you're knocked out. Last one left — the one willing to be loudest in a public
place — wins. The whole game is one number (how loud you got) against a rising line,
and the reason you lose is that you bottle it in front of your friends.

Solo, it's a personal ladder: how many rungs can you climb before your voice gives
out. There's no login, no waiting, and no second player required — it's fun in the
first five seconds on your own.

The input is your **actual voice volume**, measured with the Web Audio API. Nothing
you say is recorded, stored, transcribed, or sent anywhere — the phone derives a
single loudness number, frame by frame, and throws the audio away. No microphone, or
you'd rather not use it? You get the **tap version** automatically: a mashing / hold
/ lock bar that plays the same game with your thumb.

## How to play

- **On your turn:** tap the big button, wait for **GO**, and make noise.
- **Three modes, three different skills:**
  - **Bellow** — get louder than a rising bar. Just be loud.
  - **Sustain** — hold your voice above a line, for longer each turn. Breath control.
  - **Pinpoint** — land inside a band that rises and narrows. Volume control, not power.
- **Desktop / no mic:** the tap fallback uses the mouse or the Space bar.
- Miss the target and you're out; last player standing wins.

## Multiplayer

**Local, single-device (hot-seat) — no network.** 2–8 players share one phone. There
is no online multiplayer and no game server, by design: the entire appeal is people
in one room daring each other, and sending audio between phones would be both worse
to play and a privacy cost the game refuses to pay. The only network request Uproar
makes is an anonymous, cookie-less page-view count.

## Tech

- Vite 6 + vanilla TypeScript
- DOM/CSS rendering (a canvas only for the confetti burst)
- Web Audio `AnalyserNode` for loudness; `navigator.vibrate` for haptics
- Shared engine (`@ben-gy/game-engine`): procedural audio, storage, mobile hardening,
  feedback widget — imported, never copied
- Vitest for the pure loudness/derivation math, the escalation, the knockout logic, a
  balance sim (seat fairness + skill + the mechanism audit), and contrast

No cookies, no fingerprinting, no third-party fonts. No audio is ever recorded,
stored, or transmitted. Anonymous, cookie-less page-view counts via Cloudflare Web
Analytics.

## Local dev

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

## License

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see [ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

A separate commercial licence without the AGPL's source-disclosure obligations is
available on request: <hi@ben.gy>.

Third-party components keep their own licences — see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
