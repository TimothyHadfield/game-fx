# game-fx: sounds, celebrations and small animations for the board game sites

One small file, `fx.js` (~25 KB, no dependencies), gives every game the same **optional** sound
effects, win celebrations and short animations, all switchable in the game's Settings.
Every sound is **synthesised with Web Audio** (oscillators, filtered noise, envelopes): no audio
files, no CDN, no network, $0. Demo: <https://timothyhadfield.github.io/game-fx/demo.html>

## 1. Copy it in

1. Copy `fx.js` into your site's `js/` folder **unchanged**.
2. Load it either way (it's a classic script that sets `window.FX`, so both work):
   - classic: `<script src="js/fx.js"></script>` before your app script
   - module: `import "./fx.js";` at the top of your module, then use `FX` (or `window.FX`)
3. Call `FX.init({ game: "<your gameId>" })` once at start-up (use the same `gameId` as online.js).
4. Put `FX.renderSettings(el)` inside your Settings screen.
5. Call `FX.play(...)` / `FX.celebrate(...)` / the helpers where things happen in your game.
   In online games, play sounds from the **snapshot diff** in your `change` handler, so every
   player hears the same events (and nothing extra is written to Firestore).

## 2. API

```js
FX.init({ game: "risk", accent: "#6ea8fe", settingsKey, onChange, clicks: true, clickSelector });
//   settingsKey: localStorage key (default "fx:<game>", so each game keeps its own settings)
//   clicks: true (default) plays a quiet "tap" on every button click (category "ui");
//           pass false if your game plays its own UI sounds. clickSelector default:
//           'button, [role="button"], .btn'
FX.settings          // copy: { sound, volume, moves, alerts, ui, celebrations, animations, animSpeed }
FX.set("volume", 40) // validates, saves, fires onChange; returns false for unknown keys
FX.onChange((key, value, all) => {...})   // returns an unsubscribe function
FX.reset()           // back to defaults

FX.play("diceRoll", { cat, pitch, vol, pan, force })  // -> true if it played
//   cat: override the sound's category; pitch: 1 = normal, 2 = an octave up; vol: 0..2 (1 = normal);
//   pan: -1 left .. 1 right; force: ignore categories (still obeys Sound on/off + volume)
FX.define("bell", [{ f: 880, dur: 0.4, type: "triangle" }, { noise: true, f: 3000, dur: 0.05 }], "alerts");
FX.define("boom", k => { k.noise({ f: 900, f2: 60, filter: "lowpass", dur: 0.8, vol: 0.8 }); k.tone({ f: 70, f2: 35, dur: 0.6 }); });
//   tone({ f, f2, dur, a, vol, type, at, lp })  noise({ f, f2, q, filter, dur, a, vol, at })
//   f2 = glide target, a = attack, at = delay (s), lp = lowpass Hz. k.rnd(a,b) for variety.

await FX.celebrate({ kind: "win" | "big" | "lose", colors: [...], at: el, cheer: true })
await FX.pop(el); await FX.shake(el); await FX.pulse(el); await FX.flash(el, "var(--bad)");
await FX.flyTo(cardEl, potEl, { clone: true, duration: 420, scale, fade });
await FX.floatText(el, "+5", "var(--good)");
await FX.countUp(el, 10, 35, { duration: 600, format: n => "$" + Math.round(n) });
FX.renderSettings(container)   // appends the "Sound & effects" rows; returns the element
FX.unlock()                    // start audio now (call inside a tap handler); fx.js also does this itself
FX.sounds, FX.soundCategory(name), FX.supported, FX.ready, FX.stats, FX.version
```

Every helper returns a Promise that resolves when it's done, so a game can `await` it for pacing.
With Animations off (or reduced motion) they resolve **immediately** and change nothing
(`countUp` jumps straight to the final number). They use only `transform` and `opacity`, on
fixed-position overlays or the element itself, so **nothing ever shifts layout**. Overlays have
`pointer-events: none` and are removed when done. Nothing ever throws.

`flyTo` with `clone: true` (default) glides a copy of the element to the target and removes it;
`clone: false` moves the element itself and then lets it snap back, so re-render it in its new
place after `await`. The ghost shrinks to fit a smaller target but never grows (pass `scale` to override).

## 3. Settings (defaults)

| Key | Default | Row in Settings | What it gates |
|---|---|---|---|
| `sound` | on | Sound (switch, with a `?`) | every sound |
| `volume` | 60 | Volume (slider) + Test button | loudness (squared curve, so the slider feels even) |
| `moves` | on | Game sounds | game events: cards, dice, chips, pieces, hits… |
| `alerts` | on | Alerts | `turn`, `tick`, `alarm`, `error` |
| `ui` | on | Button clicks | `tap`, `click` (quiet) |
| `celebrations` | on | Celebrations | `celebrate()` (confetti + fanfare) and `win`/`lose`/`cheer` |
| `animations` | on, **off if the device asks for reduced motion** | Animations | all helpers + confetti |
| `animSpeed` | normal | Speed (Normal / Fast) | fast = 0.55× durations |

Sub-rows dim (still usable) when their master switch is off. Settings live in localStorage per
game; every read/write is in try/catch, so with storage blocked everything still works in memory.
`renderSettings` uses the game's own `.set-row`, `.switch` (`<label class="switch"><input><span>`),
`.seg` and `.q` classes and CSS variables (`--line`, `--good`, `--accent`, `--muted`, `--text`,
`--bg-soft`, `--card-hover`). It also injects zero-specificity fallbacks (`:where(.fx-set)`), so the
game's own styles always win. Battleship's switch is a div with an `.on` class; fx.js also toggles
`.on` on the label, but check the look there.

## 4. Mobile audio

- The AudioContext is created on the **first tap / key press** (iOS refuses sound before that),
  and resumed if iOS suspends it. Before that first gesture `play()` quietly returns false.
- No Web Audio (e.g. Playwright WebKit on Windows) = silent, no errors.
- **Throttle:** at most 3 copies of the same sound start within 80 ms (20 dice at once → 3 voices).
  A compressor on the master bus keeps stacked sounds from clipping.
- Sounds follow the phone's media volume. On iPhone the silent switch may mute Web Audio
  (that's iOS, and the `?` next to Sound says so).

## 5. The sounds (recipes, since you can't hear a README)

Every sound is under 1.2 s (tested). "noise bp 2500→4500" = white noise through a band-pass
filter sweeping 2500→4500 Hz. All frequencies scale with `pitch`.

| Name | Category | Recipe |
|---|---|---|
| `tap` | ui | sine 900→600 Hz, 40 ms, very quiet |
| `click` | ui | triangle 1500→1100, 30 ms + 12 ms high-pass noise tick |
| `cardFlip` | moves | noise bp 2500→4500, 70 ms, then a 50 ms noise bp 1300 snap |
| `cardDeal` | moves | noise bp 3200→1700, 110 ms swish + low sine thump 180→90 as it lands |
| `cardSlide` | moves | noise bp 1700→3200, soft 80 ms attack, 280 ms |
| `shuffle` | moves | 9 short noise bursts (random 2.2–3.4 kHz) 45 ms apart, then a riffle swish |
| `chip` | moves | clay chip: sines 3100 + 4650 Hz, 50 ms, + high-pass noise click |
| `chips` | moves | 4 chips, 40 ms apart, random pitch ±12% |
| `coin` | moves | metallic ting: sine 2100 Hz + inharmonic partials ×2.76, ×5.4 |
| `coins` | moves | 5 coin tings, 55 ms apart, random pitch |
| `diceShake` | moves | 11 rattles at random 30–60 ms gaps (noise bp 2.5–4 kHz + triangle click) |
| `diceRoll` | moves | 8 clicks with growing gaps (rolling to a stop) over a low-pass rumble |
| `diceLand` | moves | two thuds (sine 220→110 + noise), the second smaller 70 ms later |
| `place` | moves | wood knock: sine 520→375, triangle overtone, noise tick |
| `slide` | moves | low-pass noise 900→1600, 300 ms (piece dragged on board) |
| `capture` | moves | knock + rising triangle 880→1320 |
| `hit` | moves | low-pass noise burst 1200→300 + sine thump 120→50, 300 ms |
| `miss` | moves | dull plop: noise bp 600→300 + sine 300→150 |
| `splash` | moves | noise bp 1500→600 550 ms + high-pass spray + sine drop |
| `explosion` | moves | low-pass noise 1800→80 over 1.1 s + sine 90→30 rumble |
| `sink` | moves | sine 300→60 over 1 s, low-pass noise, 4 rising bubble blips |
| `whoosh` | moves | noise bp sweeping 400→2400 with a 150 ms swell |
| `ding` | moves | bell: sine 1320 Hz 0.8 s + 2× and 3× partials |
| `turn` | alerts | two soft triangle notes G5 → C6 (120 ms apart), "your turn" |
| `error` | alerts | soft triangle 330→290 then 247, never harsh |
| `tick` | alerts | sine 1500 Hz 25 ms + tiny noise tick (timer) |
| `alarm` | alerts | 6 alternating triangle notes 880 / 660, 130 ms apart, gentle |
| `train` | moves | whistle: 3 sawtooth notes (523/659/784) gliding up 3%, low-passed, + breath noise |
| `stamp` | moves | sine thump 160→60 + low-pass noise smack |
| `pop` | moves | sine 400→1200 in 60 ms |
| `drumroll` | moves | noise bp 1500 every 35 ms, crescendo for 0.9 s, then a hit |
| `win` | celebrations | fanfare: triangle C5 E5 G5 arpeggio → held C6 + G5, two high tings |
| `lose` | celebrations | gentle descending C5 Bb4 G4 → E4 (falling slightly), low-passed |
| `cheer` | celebrations | 3 band-passed noise layers (crowd) with a slow swell + 8 claps |

`celebrate`: **win** = `win` fanfare + `cheer` + ~190 confetti pieces from both bottom corners and
the top (2.6 s); **big** = `ding` + 36 star sparkles from `at` (or screen centre, 1.2 s);
**lose** = `lose` + a soft dim of the screen (1.2 s), no confetti. Full-screen canvas,
pointer-events none, removed afterwards. Celebrations off = nothing; Animations off = sound only.

## 6. Testing

- `npm test` (or `node --test test/fx.test.mjs`): settings defaults, persistence per game,
  cleaning bad values, storage blocked, reduced-motion default, onChange, no audio before a
  gesture, every sound plays and lasts ≤ 1.2 s, category gating (0 audio nodes when off), master
  off/volume 0, throttle (20 → 3), `define`, helpers resolving instantly when off. Uses a fake
  AudioContext that counts nodes.
- `demo.html`: a button for every sound and helper, plus the Settings block. Serve the folder
  (`python -m http.server`) and open `demo.html`.

## Changelog

- **2026-10-20, 1.0.2:** the animation-speed row is labelled "Effects speed" (games with their own
  game "Speed" row showed two rows called Speed). Re-copy into games.
- **2026-10-20, 1.0.1:** confetti moves by elapsed time, not per frame, so it no longer crawls on slow
  frame rates (seen in headless Safari) or rushes on 120 Hz iPhones. API unchanged; re-copy into games.
- **2026-10-20, 1.0.0:** first release. 34 sounds, `define`, celebrations (win / big / lose),
  7 helpers, settings + `renderSettings`, auto button taps.

## This repo

| File | What |
|---|---|
| `fx.js` | the library (copy this) |
| `demo.html` | every sound and helper, plus Settings |
| `test/fx.test.mjs` | node tests |
