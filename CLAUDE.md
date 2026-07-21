# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, client-side-only site: a browser signal generator plus a handful of
audio/acoustics calculators for live sound and studio work. No backend, no
build step, no framework, no dependencies. Every page is plain HTML + one
shared stylesheet + vanilla ES modules.

## Commands

There is no build, lint, or test tooling (`npm test` is a stub that exits 1).
To develop locally, serve the folder — ES modules require a real origin, so
you can't just open the HTML files directly:

```sh
python3 -m http.server 8000
# then http://localhost:8000/?f=440
```

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
on load to decide its initial value. `2khz.sh` is a sibling domain that
`redirectSiblingDomains()` bounces to `1khz.sh/?f=2000`.

**Module layout** — one directory per calculator, each self-contained:

| Path | JS entry | Purpose |
| --- | --- | --- |
| `/` (`index.html`) | `assets/js/generator.js` | Signal generator (1K-GEN) |
| `/delay/` | `assets/js/delay.js` | Distance ↔ ms delay (1K-DLY) |
| `/db/` | `assets/js/db.js` | dBu/dBV/dBFS/volts converter (1K-LVL) |
| `/rt60/` | `assets/js/rt60.js` | Sabine RT60 + room modes (1K-RT60) |
| `/note/` | `assets/js/note.js` | Note ↔ frequency ↔ MIDI (1K-NOTE) |
| `/spl/` | `assets/js/spl.js` | SPL, amp power, cable drop (1K-SPL) |

**Shared modules** (`assets/js/`):

- `host-freq.js` — the subdomain/query-param parsing described above. Every
  page's script imports `getTunedFrequency()` from here.
- `audio-math.js` — all formulas as pure functions (pitch/MIDI conversion,
  speed of sound, dBu/dBV/dBFS/gain conversion, Sabine RT60, room modes,
  SPL/power/cable-drop math, and the `fmt()` number formatter). Keep new
  formulas here, not inline in a page's script — pages import only what they
  need.
- `panel-common.js` — runs on every page: fires the sibling-domain redirect,
  marks the active nav item via `document.body.dataset.page`, and shows the
  "Tuned" header chip (`#tunedChip`) when a frequency was carried in via
  hostname or `?f=`.
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
