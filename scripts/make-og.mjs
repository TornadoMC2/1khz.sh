#!/usr/bin/env node
/**
 * make-og.mjs — render the social preview cards into assets/og/.
 *
 * Every page carries an og:image so a shared link renders as a card rather
 * than a bare line of text. There's no build step and no image library here,
 * so the cards are authored as SVG (with the site's own vendored fonts
 * inlined as data URIs, since a rasteriser won't fetch /assets/fonts/) and
 * rasterised with the tools macOS already ships:
 *
 *   qlmanage  — QuickLook renders the SVG through WebKit, same engine the
 *               site itself is designed against, but only into a square
 *               thumbnail
 *   sips      — crops that square back down to the 1200x630 card
 *
 * That makes this a macOS-only script, which is fine: the PNGs it produces
 * are committed, so CI and the deploy never run it. Re-run it by hand after
 * changing a page title or the palette:
 *
 *   npm run og
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shrink } from "./lib/png-shrink.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT  = join(ROOT, "assets/og");
const TMP  = join(ROOT, ".og-tmp");

/* The card for each page: the big line, the small line, and the model code
   silkscreened on the plate — the same three things the page header shows. */
const CARDS = [
  { file: "home",  model: "1K-GEN",  name: "Signal Generator",      sub: "Sine, square, triangle, saw, and noise — 20 Hz to 20 kHz" },
  { file: "delay", model: "1K-DLY",  name: "Delay Time",            sub: "Distance to milliseconds, corrected for air temperature" },
  { file: "db",    model: "1K-LVL",  name: "Level Converter",       sub: "dBu, dBV, dBFS and volts — with headroom" },
  { file: "rt60",  model: "1K-RT60", name: "Room Acoustics",        sub: "Sabine RT60 and the room-mode table" },
  { file: "note",  model: "1K-NOTE", name: "Note & Frequency",      sub: "Pitch, frequency, wavelength, MIDI, cents" },
  { file: "spl",   model: "1K-SPL",  name: "SPL & Power",           sub: "Loudspeaker SPL, amplifier power, cable drop" },
  { file: "math",  model: "1K-REF",  name: "Formulas & Assumptions",sub: "Every equation, constant, and caveat, written out" },
  { file: "about", model: "1K-INFO", name: "About & Privacy",       sub: "No cookies, no analytics, no backend — and how to check" },
];

const b64 = (p) => readFileSync(join(ROOT, p)).toString("base64");
const font = (p) => `url(data:font/woff2;base64,${b64(p)}) format("woff2")`;
const FONT_FACES = `
  @font-face { font-family: "Barlow Semi Condensed"; font-weight: 600;
               src: ${font("assets/fonts/barlow-sc-600.woff2")}; }
  @font-face { font-family: "Barlow Semi Condensed"; font-weight: 700;
               src: ${font("assets/fonts/barlow-sc-700.woff2")}; }
  @font-face { font-family: "IBM Plex Mono"; font-weight: 400;
               src: ${font("assets/fonts/ibm-plex-mono-400.woff2")}; }
  @font-face { font-family: "IBM Plex Mono"; font-weight: 500;
               src: ${font("assets/fonts/ibm-plex-mono-500.woff2")}; }`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One cycle of the scope trace, drawn as the real generator would show it. */
const wave = () => {
  const pts = [];
  for (let x = 0; x <= 1200; x += 6) {
    const y = 470 + Math.sin((x / 1200) * Math.PI * 6) * 46 * (1 - x / 2600);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return pts.join(" ");
};

/* QuickLook scales an SVG to *fill* its square thumbnail, so a 1200x630
   canvas would come back cropped rather than letterboxed. Authoring the file
   at 1200x1200 with the card centred sidesteps that: the render is 1:1, and
   sips then crops the middle 630 rows back out. */
const card = ({ model, name, sub }) => `<svg xmlns="http://www.w3.org/2000/svg"
     width="1200" height="1200" viewBox="0 0 1200 1200">
  <style>${FONT_FACES}</style>
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#24282e"/><stop offset="1" stop-color="#14171b"/>
    </linearGradient>
    <linearGradient id="trace" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffb257" stop-opacity=".15"/>
      <stop offset=".35" stop-color="#ffb257" stop-opacity=".95"/>
      <stop offset="1" stop-color="#ffb257" stop-opacity=".2"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="1200" fill="#0a0b0d"/>
  <g transform="translate(0 285)">
  <rect x="24" y="24" width="1152" height="582" rx="14" fill="url(#panel)"/>
  <rect x="24.5" y="24.5" width="1151" height="581" rx="14" fill="none"
        stroke="#343a42" stroke-width="1"/>

  <!-- rack screws, one in each corner of the plate -->
  ${[[62, 62], [1138, 62], [62, 568], [1138, 568]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#0e1013" stroke="#343a42"/>
  <path d="M${x - 5} ${y} h10" stroke="#4a5058" stroke-width="2.5" stroke-linecap="round"/>`)
    .join("\n  ")}

  <!-- silkscreened brand, top left -->
  <text x="104" y="132" font-family="IBM Plex Mono" font-weight="500" font-size="34"
        fill="#c9cdd3" letter-spacing="1">1k<tspan fill="#ffb257">Hz</tspan>.sh</text>
  <text x="104" y="166" font-family="Barlow Semi Condensed" font-weight="600" font-size="24"
        fill="#7d838d" letter-spacing="4.5">AUDIO FIELD KIT</text>

  <!-- model code, top right, on its own engraved rule -->
  <text x="1096" y="132" text-anchor="end" font-family="IBM Plex Mono" font-weight="400"
        font-size="26" fill="#7d838d" letter-spacing="2">${esc(model)}</text>

  <line x1="104" y1="206" x2="1096" y2="206" stroke="#3d434c" stroke-width="1"/>

  <!-- the nameplate -->
  <text x="104" y="304" font-family="Barlow Semi Condensed" font-weight="700" font-size="86"
        fill="#f2f4f7" letter-spacing="-.5">${esc(name)}</text>
  <text x="104" y="356" font-family="IBM Plex Mono" font-weight="400" font-size="27"
        fill="#9aa0a9">${esc(sub)}</text>

  <!-- scope well with the trace running through it -->
  <rect x="104" y="404" width="992" height="132" rx="8" fill="#0e1013" stroke="#343a42"/>
  <clipPath id="well"><rect x="104" y="404" width="992" height="132" rx="8"/></clipPath>
  <g clip-path="url(#well)">
    <line x1="104" y1="470" x2="1096" y2="470" stroke="#242a31" stroke-width="1"/>
    <polyline points="${wave()}" fill="none" stroke="url(#trace)" stroke-width="3.5"
              stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <text x="104" y="578" font-family="IBM Plex Mono" font-weight="400" font-size="22"
        fill="#7d838d">Runs in the browser · no accounts · no tracking · works offline</text>
  </g>
</svg>`;

mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

for (const c of CARDS) {
  const svg = join(TMP, `${c.file}.svg`);
  const png = join(OUT, `${c.file}.png`);
  writeFileSync(svg, card(c));

  // QuickLook renders into a 1200x1200 square, letterboxing the 1200x630
  // card; sips crops the padding back off from the centre.
  execFileSync("qlmanage", ["-t", "-s", "1200", "-o", TMP, svg], { stdio: "ignore" });
  const thumb = `${svg}.png`;
  if (!existsSync(thumb)) throw new Error(`qlmanage produced nothing for ${c.file}`);
  execFileSync("sips", ["-c", "630", "1200", thumb, "--out", png], { stdio: "ignore" });

  // sips writes ~200 KB of 8-bit RGBA plus EXIF/XMP it invented; palette it.
  const before = statSync(png).size;
  writeFileSync(png, shrink(readFileSync(png)));
  const after = statSync(png).size;
  console.log(`  assets/og/${c.file}.png  ${(after / 1024).toFixed(0)} KB` +
              ` (from ${(before / 1024).toFixed(0)} KB)`);
}

rmSync(TMP, { recursive: true, force: true });
console.log(`\nRendered ${CARDS.length} cards into assets/og/.`);
