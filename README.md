# 1kHz.sh — Audio Field Kit

**[1khz.sh](https://1khz.sh)** — a signal generator and a set of audio
calculators that load instantly on a phone, work with no signal, and don't
collect anything.

Built for the work that happens standing up: load-in, soundcheck, ringing out a
room, settling an argument about a delay tower. No accounts, no ads, no
tracking, nothing to install, free forever, [MIT licensed](LICENSE).

```
440.1khz.sh   →   opens tuned to A440
```

---

## The trick

**Any subdomain is a frequency.** Type it into the address bar and the
generator opens on that note, ready to go.

| Type this | You get |
| --- | --- |
| [`440.1khz.sh`](https://440.1khz.sh) | 440 Hz — concert A |
| [`60.1khz.sh`](https://60.1khz.sh) | 60 Hz — mains hum, for hunting ground loops |
| [`1k.1khz.sh`](https://1k.1khz.sh) | 1 kHz — the reference tone |
| [`16k.1khz.sh`](https://16k.1khz.sh) | 16 kHz — a hearing test you'll wish you hadn't run |
| [`432-5.1khz.sh`](https://432-5.1khz.sh) | 432.5 Hz — a dash stands in for the decimal point, since DNS labels can't contain dots |

No server is involved. Every subdomain serves the same static files, and a few
lines of JavaScript read the hostname and set the dial. `?f=440` does the same
thing if you'd rather not retype a domain.

## What's in the kit

| Module | What it does | When you'd reach for it |
| --- | --- | --- |
| **[Signal Generator](https://1khz.sh/)** | Sine, triangle, square, saw; white / pink / brown / blue noise; sweeps, warble, and pulse. Log frequency dial, L / L+R / R routing, level fader, live oscilloscope. | Ringing out a room, checking a channel, finding which box is which, proving the desk isn't lying to you. |
| **[Delay Time](https://1khz.sh/delay/)** | Distance ↔ milliseconds, corrected for air temperature, plus the sample count at 44.1 / 48 / 96 / 192 kHz. | Time-aligning fills and delay towers. The temperature correction is why the ring that was right at load-in is smeared at doors. |
| **[Level Converter](https://1khz.sh/db/)** | dBu ↔ dBV ↔ dBFS ↔ volts, with converter alignment and headroom. | Working out why the +4 dBu source and the −10 dBV one are 11.8 dB apart, and where your converter actually clips. |
| **[Room Acoustics](https://1khz.sh/rt60/)** | RT60 estimate, Schroeder frequency, and the full room-mode table below 300 Hz. | Sizing up an unfamiliar room, or working out which low-end problem is the room's fault rather than yours. |
| **[Note ↔ Frequency](https://1khz.sh/note/)** | Pitch, frequency, wavelength, MIDI number, cents, adjustable A4. | Tuning to something that isn't A440, or turning "that ringing note" into a number you can notch. |
| **[SPL & Power](https://1khz.sh/spl/)** | SPL at distance, amplifier power for a target with headroom, and speaker-cable voltage drop by AWG. | Answering "will this rig make it to the back wall" before you load it into the truck. |

## It works with no signal

Venue Wi-Fi is a rumour and basements have no bars, so the whole kit installs
as an app and runs completely offline once it has loaded a single time.

- **On a phone:** open [1khz.sh](https://1khz.sh) and use *Add to Home Screen*.
- **On a desktop:** look for the install icon in the address bar.

After that it opens instantly and works in airplane mode, in a loading dock, in
a room with three feet of concrete over it.

## Privacy, plainly

There is no backend. Nothing you type is sent anywhere, because there is
nowhere for it to go. No analytics, no cookies, no local storage, no
third-party requests of any kind — even the fonts are served from this domain
so that loading a page doesn't tell Google you did.

You don't have to take that on faith. Open your browser's dev tools, watch the
Network tab, and use every calculator on the site: nothing fires. Or just turn
off your network and watch it keep working.

**[The full version, including what the host can see anyway →](https://1khz.sh/about/)**

## The maths

Every formula is standard, and every one of them assumes something a real room
will cheerfully violate. Sabine assumes a diffuse field; the SPL maths assumes
free field and a point source; the delay maths assumes still air at a uniform
temperature.

So the numbers here are **planning estimates, not measurements** — they tell
you what to expect, not what your system is doing.

Every equation, constant, and assumption is written out, along with the point
where each one stops being trustworthy:

**[Formulas & Assumptions →](https://1khz.sh/math/)**

Found an error in the maths? That's the most useful bug report this project can
get — please [open an issue](https://github.com/TornadoMC2/1khz.sh/issues).

## Safety

A tone generator into a real system can hurt your ears and kill drivers faster
than music can, because it never stops and never dips. Output always starts
off, and the level starts at −18 dBFS, deliberately. Bring gain up from the
system rather than from the page, keep sustained high frequencies short, and
know where the output is patched before you switch it on.

---

## Running your own copy

No build step, no bundler, no dependencies — it's HTML, one stylesheet, and a
handful of ES modules. Clone it and serve the folder:

```sh
git clone https://github.com/TornadoMC2/1khz.sh
cd 1khz.sh
npm start          # python3 -m http.server 8000
```

Then open <http://localhost:8000/?f=440>. Use `?f=` while developing —
localhost can't carry a wildcard subdomain, and the query parameter takes
priority over the hostname anyway.

ES modules need a real origin, so opening the `.html` files directly won't
work. The service worker stays dormant on `http://localhost`, so you always see
fresh files.

Hosting it somewhere public — including the wildcard-subdomain setup, which
narrows the field considerably — is covered in **[DEPLOYING.md](DEPLOYING.md)**.

## Contributing

Bug reports, corrections to the maths, and new modules are all welcome.

A few conventions worth keeping:

- **Formulas live in `assets/js/audio-math.js`** as pure functions. Page
  scripts do DOM and state; they don't do arithmetic.
- **New maths gets documented on `/math/`** — the formula, its constants, and
  honestly what it assumes. A calculator that doesn't say what it assumes is
  worse than no calculator.
- **No dependencies, no build step.** Everything must run as-authored in a
  browser.
- **No third-party requests, ever.** CI fails the build if one appears.

The bar for a new module is simply that it be worth pulling out a phone for
while a room full of people waits.

## Licence

[MIT](LICENSE) — use it, fork it, ship it inside something else.

The two bundled webfonts are third-party and separately licensed: Barlow Semi
Condensed and IBM Plex Mono, both under the SIL Open Font License 1.1. See the
notice at the bottom of [LICENSE](LICENSE).
