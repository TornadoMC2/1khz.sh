# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, client-side-only site: a browser signal generator plus a handful of
audio/acoustics calculators for live sound and studio work. No backend, no
build step, no framework, no dependencies. Every page is plain HTML + one
shared stylesheet + vanilla ES modules.

## Commands

There is no build or lint tooling. To develop locally, serve the folder — ES
modules require a real origin, so you can't just open the HTML files directly:

```sh
npm start          # python3 -m http.server 8000
# then http://localhost:8000/?f=440
npm test           # node scripts/check-site.mjs — structural checks
npm run deploy     # npx wrangler deploy (Cloudflare Workers)
npm run fonts      # re-vendor the woff2 subsets into assets/fonts/
```

`npm test` is not a unit-test suite; it walks the repo and fails on the things
a build step would otherwise catch: a page missing from the nav, a module left
out of the service worker's precache, a dead internal link, a leftover
placeholder URL, a page missing its `rel=canonical`. Run it before committing.

Use `?f=<hz>` during local testing to simulate arriving on a tuned subdomain
(see below) since localhost can't carry a wildcard-subdomain hostname.

## Architecture

**The core gimmick:** any subdomain of 1khz.sh is parsed as a frequency
(`440.1khz.sh` → 440 Hz, `16k.1khz.sh` → 16000 Hz, `432-5.1khz.sh` → 432.5 Hz,
dash standing in for a decimal point since DNS labels can't contain dots).
There is no server logic behind this — a wildcard DNS record serves the same
static files for every subdomain, and `assets/js/host-freq.js` reads
`window.location.hostname` client-side to preset the dial. A `?f=` query
param does the same job and takes priority over the hostname; every page's
JS module calls `getTunedFrequency()` (query wins, else hostname, else null)
on load to decide its initial value.

Because every subdomain serves identical HTML, **every page must carry a
`rel="canonical"` pointing at the apex URL** or the whole site reads as
duplicate content. `npm test` enforces this.

**Module layout** — one directory per calculator, each self-contained:

| Path | JS entry | Purpose |
| --- | --- | --- |
| `/` (`index.html`) | `assets/js/generator.js` | Signal generator (1K-GEN) |
| `/delay/` | `assets/js/delay.js` | Distance ↔ ms delay (1K-DLY) |
| `/db/` | `assets/js/db.js` | dBu/dBV/dBFS/volts converter (1K-LVL) |
| `/rt60/` | `assets/js/rt60.js` | Sabine RT60 + room modes (1K-RT60) |
| `/note/` | `assets/js/note.js` | Note ↔ frequency ↔ MIDI (1K-NOTE) |
| `/spl/` | `assets/js/spl.js` | SPL, amp power, cable drop (1K-SPL) |
| `/math/` | — (static) | Formulas, constants, assumptions (1K-REF) |
| `/about/` | — (static) | Trust, privacy, verification, safety (1K-INFO) |

**Shared modules** (`assets/js/`):

- `host-freq.js` — the subdomain/query-param parsing described above. Every
  page's script imports `getTunedFrequency()` from here.
- `audio-math.js` — all formulas as pure functions (pitch/MIDI conversion,
  speed of sound, dBu/dBV/dBFS/gain conversion, Sabine RT60, room modes,
  SPL/power/cable-drop math, and the `fmt()` number formatter). Keep new
  formulas here, not inline in a page's script — pages import only what they
  need.
- `panel-common.js` — runs on every page: marks the active nav item via
  `document.body.dataset.page`, shows the "Tuned" header chip (`#tunedChip`)
  when a frequency was carried in via hostname or `?f=`, fills the footer links
  from `config.js`, and registers the service worker.
- `config.js` — the project's outward links (source repo, optional donation).
  An empty `donateUrl` removes the button entirely; never ship a placeholder.
- `panel.css` — the single shared stylesheet (rack/panel visual language:
  `.unit`, `.plate-head`, `.ctrl-row`, `.seg`, `.fader`, `.readout-grid`,
  etc.) used by every page.

**Per-page module convention** (see `generator.js` or `note.js`): a `state`
object seeded from `getTunedFrequency()`, a `$`/`el` DOM lookup table built
once at the top, plain functions to recompute derived values and write them
into the DOM, and event listeners wired at the bottom followed by an initial
render call. No component framework, no reactivity system — state changes
are pushed to the DOM by hand in small `apply*`/`render*` functions.

**Audio graph** (`generator.js` only): oscillator/noise-buffer source →
per-source gain → gainL/gainR → channel merger → master (level fader) →
output (the power on/off gate, ramped ~10ms to avoid clicks) → analyser
(scope tap) → destination. The `AudioContext` is created lazily on the first
power-on gesture (browser autoplay policy), and the scope always taps
*after* the output gate so it reads flat when power is off.

## Conventions worth preserving

- Pure math stays in `audio-math.js`; DOM/state code stays in the page's own
  script. Don't inline formulas in the per-page files.
- New calculator pages should follow the existing directory-per-module
  pattern (`/newthing/index.html` + `assets/js/newthing.js`), include
  `panel-common.js` + the page script as `type="module"` scripts, set
  `data-page` on `<body>` to match the nav's `data-nav`, and add a link to
  `rack-nav` across all existing pages plus a rack-elevation entry on `/`.
- Keep the whole project dependency- and build-step-free; there is no
  bundler or transpilation, so all JS must run as-authored in the browser.
- Any new formula must also be written up on `/math/` — the equation, its
  constants, and an honest `.assumes` block saying where it stops being
  trustworthy. The site's credibility rests on that page being complete.
- The privacy claims on `/about/` are specific and CI-enforced: no cookies, no
  `localStorage`/`sessionStorage`/IndexedDB, no beacons, no inline scripts, no
  third-party requests of any kind. Don't add one without changing that page.
- Bump `CACHE` in `sw.js` and add any new page/module/font to its `PRECACHE`
  list when shipping changes (`npm test` catches the second half of that).
- New pages also need: a `rel=canonical`, the og: meta block, a `sitemap.xml`
  entry, and a nav link on *every* other page. `npm test` checks all of these.

## Deployment

Cloudflare Workers with static assets (`wrangler.jsonc`), because it's the only
free option that serves `*.1khz.sh` — Cloudflare Pages and GitHub Pages both
lack wildcard custom-domain support, which would break the core gimmick. The
two routes in `wrangler.jsonc` (apex + wildcard) are load-bearing; CI fails if
the wildcard one disappears. `.assetsignore` keeps repo files out of the
deploy — add to it when adding a top-level developer file. Full runbook,
including DNS records and the nginx alternative, is in `DEPLOYING.md`.
