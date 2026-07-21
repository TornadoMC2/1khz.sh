# 1kHz.sh — Audio Field Kit

A browser-based signal generator and a small suite of calculators for live
sound and studio work. Fully static, fully client-side: no backend, no
accounts, no tracking, nothing to install. Built to load fast on venue Wi-Fi
and work on a phone at load-in.

## The trick

**Any subdomain is a frequency.**

| URL | Result |
| --- | --- |
| `440.1khz.sh` | generator opens tuned to A440 |
| `60.1khz.sh` | 60 Hz — mains hum |
| `16k.1khz.sh` | 16 kHz (`k` / `khz` suffixes work) |
| `432-5.1khz.sh` | 432.5 Hz (dash = decimal point, since DNS labels can't contain dots) |
| `2khz.sh` | sibling domain, redirects to `1khz.sh/?f=2000` |

There's no server logic behind it. A wildcard DNS record points every
subdomain at the same static files; `assets/js/host-freq.js` reads
`window.location.hostname`, parses the leftmost label, and presets the dial.
A `?f=` query parameter does the same thing (and wins over the hostname),
which is what the sibling-domain redirect uses and what makes local testing
easy: `http://localhost:8000/?f=440`.

## Modules

| Path | Module | Does |
| --- | --- | --- |
| `/` | **1K-GEN** | Signal generator: sine, square, pink, white, 20 Hz–20 kHz sweep. Log frequency dial with presets and typed entry, L / L+R / R routing, dBFS level fader (defaults to −18), live oscilloscope, note + wavelength + period readouts. Space bar toggles output; output always starts off. |
| `/delay/` | **1K-DLY** | Distance ↔ milliseconds with temperature-corrected speed of sound, plus samples at 44.1/48/96/192 kHz. |
| `/db/` | **1K-LVL** | dBu ↔ dBV ↔ dBFS ↔ volts, with a converter-alignment setting (0 dBFS = +24/+18/… dBu) and headroom readouts. |
| `/rt60/` | **1K-RT60** | Sabine RT60 estimate from room dimensions and average absorption, Schroeder frequency, and the room-mode table (axial / tangential / oblique) below 300 Hz. |
| `/note/` | **1K-NOTE** | Note ↔ frequency ↔ wavelength ↔ MIDI, with adjustable A4 reference and cents offset. Links back to the generator to hear the result. |
| `/spl/` | **1K-SPL** | Loudspeaker SPL at distance, amplifier power for a target SPL with headroom, and speaker-cable voltage drop by AWG. |

## Stack

- Plain HTML + one shared stylesheet (`assets/css/panel.css`) + vanilla ES
  modules. No framework, no build step, no dependencies.
- Web Audio API for all signal generation. Pink noise is a Paul Kellet
  filter rendered into a looping buffer; the sweep is a chained exponential
  ramp; the scope is an `AnalyserNode` into a canvas with a rising-edge
  trigger so periodic waves hold still.
- Audio only ever starts from a user gesture, and the output gain ramps over
  ~10 ms so the power switch never clicks.
- Two webfonts (Barlow Semi Condensed for panel labels, IBM Plex Mono for
  readouts), loaded with `display=swap`. Everything else is CSS.

## Local development

ES modules need a real origin, so serve the folder instead of opening files:

```sh
python3 -m http.server 8000
# then http://localhost:8000/?f=440
```

## Deploying

The site is static files at a domain root — any static host works for
`1khz.sh` itself. The wildcard-subdomain trick needs a host that will serve
the same files for `*.1khz.sh`, which narrows the options:

1. **DNS:** create two records — `@` (apex) and `*` (wildcard) — pointing at
   your host. With Cloudflare DNS this is an apex record plus a wildcard
   `CNAME`/`A` to the same target.
2. **Host:** the host has to accept any `Host:` header under the domain.
   - **Cloudflare** (Pages/Workers with static assets): attach the apex as a
     custom domain, then route `*.1khz.sh/*` to the same deployment. Check
     current wildcard custom-domain support for your plan — this has changed
     over time.
   - **Your own box / VPS:** trivial — `server_name 1khz.sh *.1khz.sh;` in
     nginx and a wildcard (or wildcard-SAN) TLS certificate.
   - **GitHub Pages:** hosts the site fine at the apex, but does **not**
     support wildcard subdomains on custom domains, so the trick won't work
     there alone. Fronting it with a proxy that normalizes the Host header
     works.
3. **TLS:** the certificate must cover `*.1khz.sh`. Cloudflare issues this
   automatically; on your own box, ask certbot/ACME for a wildcard cert via
   DNS validation.
4. **Sibling domain:** point `2khz.sh` (and `*.2khz.sh`) anywhere that serves
   these same files — `host-freq.js` client-side redirects it to
   `1khz.sh/?f=2000`. A host-level 301 to that URL is even better; the JS is
   the fallback.

No cache headers are required, but everything here is immutable-friendly if
you want to set long TTLs on `/assets/`.

## Monetization posture

None, basically. No ads, no analytics. There's a placeholder donation link in
the footer (search for `DONATION LINK` and swap in a real Ko-fi/BMC URL), and
two clearly marked dormant affiliate slots (`AFFILIATE SLOT` comments on
`/rt60/` and `/spl/`) styled and positioned but shipped `display:none` — fill
them in, remove the class, and disclose, or leave them off forever.

## Accuracy notes

- Speed of sound: `c = 331.3 + 0.606·T°C`; wavelength readouts assume 20 °C.
- Levels: 0 dBu = 0.7746 V; dBFS conversions are relative to the selected
  converter alignment.
- RT60 is Sabine with a single average absorption coefficient — a planning
  estimate, not a measurement.
- SPL math is free-field, single source, on axis: real rooms and arrays will
  read higher.
- Cable resistance is solid copper at 20 °C.
