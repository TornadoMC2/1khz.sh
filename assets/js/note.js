/**
 * note.js — 1K-NOTE
 * Note <-> frequency <-> wavelength under an adjustable A4.
 * Frequency is canonical. Arriving on a tuned subdomain (or ?f=) presets it.
 */
import { getTunedFrequency } from "./host-freq.js";
import {
  NOTE_NAMES, midiToFreq, noteToMidi, freqToNote, wavelength, fmt,
} from "./audio-math.js";

const $ = (id) => document.getElementById(id);
const el = {
  note: $("noteSelect"),
  octave: $("octaveSelect"),
  freq: $("freqField"),
  a4: $("a4Input"),
  nearest: $("nearestVal"),
  cents: $("centsVal"),
  midi: $("midiVal"),
  lambda: $("lambdaVal"),
  lambdaFt: $("lambdaFt"),
  period: $("periodVal"),
  playLink: $("playLink"),
};

// Populate the selects once.
el.note.innerHTML = NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join("");
el.octave.innerHTML = Array.from({ length: 10 }, (_, o) => `<option value="${o}">${o}</option>`).join("");

const state = {
  freq: getTunedFrequency() ?? 440,
  a4: 440,
};

function render(except = null) {
  const n = freqToNote(state.freq, state.a4);

  if (except !== "note") {
    el.note.value = String(NOTE_NAMES.indexOf(n.name));
    el.octave.value = String(Math.min(9, Math.max(0, n.octave)));
  }
  if (except !== "freq" && document.activeElement !== el.freq) {
    el.freq.value = fmt(state.freq, 2);
  }

  el.nearest.textContent = `${n.name}${n.octave}`;
  el.cents.textContent = `${n.cents >= 0 ? "+" : ""}${n.cents.toFixed(1)} cents`;
  el.midi.textContent = String(n.midi);

  const m = wavelength(state.freq);
  el.lambda.textContent = `${fmt(m, m < 1 ? 3 : 2)} m`;
  el.lambdaFt.textContent = `${fmt(m * 3.28084, 2)} ft — in air at 20 °C`;
  el.period.textContent = `${fmt(1000 / state.freq, 3)} ms`;

  el.playLink.href = `/?f=${fmt(state.freq, 2)}`;
}

function fromNoteSelects() {
  const midi = noteToMidi(parseInt(el.note.value, 10), parseInt(el.octave.value, 10));
  state.freq = midiToFreq(midi, state.a4);
  render("note");
}

/* ------------------------------------------------------------------ wire */

el.note.addEventListener("change", fromNoteSelects);
el.octave.addEventListener("change", fromNoteSelects);

el.freq.addEventListener("input", () => {
  const v = parseFloat(el.freq.value);
  if (!isFinite(v) || v <= 0) return;
  state.freq = v;
  render("freq");
});

el.a4.addEventListener("input", () => {
  const v = parseFloat(el.a4.value);
  if (!isFinite(v) || v < 400 || v > 480) return;
  state.a4 = v;
  render();
});

render();
