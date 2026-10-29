# ROCH Reels: «Слово → продукт за 17 секунд»

A 15–20 s vertical (9:16) showcase from a LIVE web app (a TMA prototype on Vercel). Nothing is drawn by hand: the phone shows a real recording of the app, the taps are real, and the captions say only what the screen shows.

| Time | What happens |
|---|---|
| 0–2.0 s | Hook. The customer's idea in their own words appears big (Unbounded 800), dissolves left to right into lime and brand-colour particles, and the particles stream into the chat input of a phone that slides up. |
| 2.0–~14.5 s | Three real beats of the app, 3.5–4.5 s each. Each has a kinetic caption (word by word), a finger ring where a real tap happened, a push-in from 1.0 to 1.12 toward the detail, and hard cuts between beats. |
| last 2.6 s | End card: logo, the project name, the niche line, then «Упаковано ROCH 0→1 · roch-art.com». The last 0.28 s sinks back to dark so the site loop is seamless. |

## A new project in 3 commands

```bash
node reels/record.mjs reels/beats/<slug>.json --takes=3          # live app → reels/work/<slug>/take-N + best.json
python3 reels/compose.py reels/beats/<slug>.json --lang=ru       # → reels/out/<slug>-ru-master.mp4, -ru-site.mp4, <slug>-poster.webp
bash reels/check.sh reels/out/<slug>-ru-master.mp4               # 15–20 s, size, faststart, storyboard PNG every 2.5 s → LOOK at it
```

**EN cut = English captions AND an English app UI** (Roch 28.10: «интерфейсы на английском»). The EN cut needs its own takes:

```bash
node reels/record.mjs reels/beats/<slug>.json --lang=en --takes=3   # → reels/work/<slug>/en/take-N (+ untranslated.json)
python3 reels/compose.py reels/beats/<slug>.json --lang=en          # picks reels/work/<slug>/en automatically
```

- The app has a real English mode → put it in `prep_en`. It is merged over `prep` for EN takes, for example a query param or a localStorage language key.
- It has none → `reels/beats/<slug>.en.json` translates the UI **during recording only**. The app itself stays Russian.
  - Format: `{"Русская строка": "English"}` with whitespace-collapsed exact keys. Use `"re:<regex>": "… $1 …"` for strings with numbers.
  - Text nodes and the `placeholder`, `title`, `aria-label` and `alt` attributes are translated live as the app renders.
- `text:` targets also match the original Russian label, so one beat file serves both languages. Typed text or eval code that differs gets `value_en` (or `target_en`).
- Every EN take writes `untranslated.json`, the Cyrillic it saw without a translation. Loop: one rough take → translate the list → 3 clean takes → look at the storyboard.
- With no `work/<slug>/en`, the EN cut falls back to the RU takes (Russian UI), which is the old behaviour.
`--draft` renders at 540×960 in about 50 s. `bash reels/check.sh <mp4> 0.25 0 2.4` makes a dense sheet (a frame every 0.25 s from 0 to 2.4 s), which is how to judge the hook and the timing.

Before the first take, explore the app at 390×844 with the Telegram stub (see `lib/tg-stub.js`) and screenshots. Find the real flows and the exact tap targets first, and only then write the beat file.

## The beat file is the only per-project input (`beats/<slug>.json`)

```jsonc
{
  "slug": "peonia", "name": "PEONIA", "color": "#FF4F8B",            // the colour tints the aurora, accents, ripple, glow
  "niche_ru": "…", "niche_en": "…", "url": "https://….vercel.app/", "logo": "https://…/logo.png",
  "viewport": { "w": 390, "h": 844, "dsf": 2 },                       // dsf 2: 780 px frames for a 660 px screen at ~50 fps
  "prep": {
    "localStorage": {}, "sessionStorage": { "app.splash": "1" },      // written once, before the app's own scripts
    "query": "", "waitFor": "window.APP && document.querySelector('#main')",   // JS expression or a CSS selector
    "css": ".prototype-header{display:none!important}",               // hide prototype chrome, never product UI
    "eval": "", "settle_ms": 1500
  },
  "idea_ru": "Маме, нежное, до 150 ₾", "idea_en": "…",
  "hook": { "land": { "x": 170, "y": 806 } },                         // css px on the app screen where the swarm lands
  "poster": { "beat": 0, "at": -0.4 },                                // poster frame: beat 1, 0.4 s before its end
  "beats": [
    {
      "id": "words",
      "pre":   [ { "do": "tap", "target": "text:Спросить", "hold_ms": 1100 } ],        // runs, but is cut out of the film
      "steps": [                                                                       // this is the film
        { "do": "type", "target": "#aiText", "value": "Маме, нежное, до 150 ₾", "ms": 50, "speed": 1.5 },
        { "do": "tap",  "target": ".ai-send", "hold_ms": 1500, "speed": 1.7 },        // the waiting part, sped up in compose
        { "do": "wait", "hold_ms": 2000 }                                             // the result, in real time
      ],
      "cap_ru": "Пишете своими словами, и чат подбирает *три букета*",                // *…* = accent colour
      "cap_en": "…",
      "cam": { "x": 195, "y": 400, "s": 1.12 }                                       // push-in toward this css point
    }
  ]
}
```

- Steps are `tap`, `type`, `key` (Enter, Escape), `scroll` (`value` is dy or `{dx,dy}`, and the nearest scroll container moves, never the page), `wait` and `eval` (JS in the app).
- A target is `text:Start of the label` (the deepest visible element on top whose text starts with it) or a CSS selector, plus optional `nth`, `ox`/`oy` and `at`. The recorder waits up to 2 s for a target and scrolls it into view inside its own container.
- `speed` belongs to a step: compose plays that window of the source clock faster. Speed up the waiting, never the payoff. An optional beat `dur` scales a beat down to that length, and only ever speeds it up. `trim_in`/`trim_out` cut seconds from the beat's edges.
- A single-action beat `{do, target, value, hold_ms, cap_ru, cam}` also works.
- A real state change that comes from somewhere else (for example, a florist moving the order in the admin) goes in as an `eval` through the app's own path. In PEONIA that is `localStorage` + `StorageEvent`, exactly what a second tab does.

## Files

`record.mjs` (raw Chrome + CDP screencast, `clock.json`/`markers.json` on one clock, best take per beat) · `compose.py` (EDL on the source clock, PIL per frame, libx264) · `layers.mjs` (aurora, phone ring, glare, word-by-word captions, hook, end card; rendered headless) · `check.sh` (the guard and storyboard) · `lib/layout.json` (frame geometry) · `lib/tg-stub.js` (Telegram.WebApp outside Telegram) · `fonts/` (Unbounded, Inter; variable, cyrillic and latin).
`work/` holds takes (~130 MB each, frames included) and is git-ignored. `.vercelignore` keeps `reels/` off the site, and finished films go to `assets/reels/`.

## Gotchas (paid for on PEONIA, 25–26.10.2026)

- **Fonts in layers silently fell back to a serif.** `page.setContent` is `about:blank`, and `file://` fonts do not load there. Layers are written to a file and opened with `goto(file://…)`.
- **A filled finger dot read as a grey blob over the button it pressed.** The touch is now a white ring with a 6–12 % fill and a brand-colour ripple, so the button stays readable.
- **The tap ring punched a hole in the phone** (all seven reels, found on babyland 29.10). `ImageDraw.Draw(rgba_image)` does not blend: it REPLACES the pixel, alpha included. A white fill at alpha 60 drawn straight on the phone canvas set that canvas to alpha 60, so the dark background showed through as a black disc over the button. On a dark UI it passed for a ring, but on any light screen or bright button it was a hole. `draw_finger` now draws on its own transparent layer and `alpha_composite`s it. Anything semi-transparent drawn on an RGBA canvas goes through a layer.
- **A blank first frame loses the feed.** The first word of the hook is already rising on frame 0.
- **The push-in lifts the phone top into the caption.** Captions sit at `CAP_Y` 228, and the scrim covers only the top 480 px, so a banner at the top of the app stays clean.
- **Our own Chrome raises the load average to 25–40.** `record.mjs` waits for load ≤ 24 (`--max-load`) before each take, records 3 takes and picks the take with the smallest worst frame gap per beat (`best.json`). A still screen also leaves gaps, so treat it as a hint and look at the film.
- `full.mp4` is written at **60 fps** from the true frame timestamps, so speed-ups of 1.5–1.7× stay smooth. Compose decodes each take sequentially and maps every output frame to its source frame, so the cuts are frame-exact.
- RGB goes to YUV with the **bt709** matrix and tags. Without them, pinks and limes shift in players.
- Prototype chrome (`.top` with Клиент/Админка, and the admin `.toasts` with «Новый заказ…») is hidden through `prep.css`. It is not part of the client's product.
- **The Telegram stub read the screen height before the 390×844 emulation applied** (ANZH, 29.10): apps that size their root from `Telegram.WebApp.viewportHeight` rendered 2121 px tall, with the nav and sheets off-screen. `lib/tg-stub.js` now returns `innerHeight` through a getter at the moment it is read.
- **PEONIA courier map** rendered empty until 28.10: the global `svg{width:22px…}` in `app.css` collapsed `.tw-cm-svg`. Fixed in the app (`.tw-cm-svg{width:380px;height:560px}` + SVG defaults), and beat 3 now films the live map. Lesson: a global icon rule silently breaks any big inline SVG — check maps and charts first.
