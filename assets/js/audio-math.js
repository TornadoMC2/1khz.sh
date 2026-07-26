/**
 * audio-math.js — the formulas, kept in one place and out of the UI code.
 * Pure functions only; every page imports what it needs.
 */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/* ------------------------------------------------------------------ pitch */

/** Frequency of a MIDI note number under a given A4 reference. */
export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Note name + octave -> MIDI number (C4 = 60). */
export function noteToMidi(nameIndex, octave) {
  return nameIndex + (octave + 1) * 12;
}

/**
 * Frequency -> nearest equal-tempered note.
 * Returns { name, octave, midi, cents } where cents is the signed offset
 * from the named note (-50..+50).
 */
export function freqToNote(freq, a4 = 440) {
  if (!(freq > 0)) return null;
  const exact = 69 + 12 * Math.log2(freq / a4);
  const midi = Math.round(exact);
  return {
    midi,
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: (exact - midi) * 100,
  };
}

/* ------------------------------------------------------- speed of sound */

/** Speed of sound in air (m/s) at a temperature in °C. */
export function speedOfSound(tempC = 20) {
  return 331.3 + 0.606 * tempC;
}

/** Wavelength in metres. */
export function wavelength(freq, tempC = 20) {
  return speedOfSound(tempC) / freq;
}

/* ---------------------------------------------------------------- levels */

export const DBU_REF_V = 0.774597; // volts RMS at 0 dBu (1 mW into 600 Ω)

export const voltsToDbu = (v) => 20 * Math.log10(v / DBU_REF_V);
export const dbuToVolts = (dbu) => DBU_REF_V * Math.pow(10, dbu / 20);
export const voltsToDbv = (v) => 20 * Math.log10(v);
export const dbvToVolts = (dbv) => Math.pow(10, dbv / 20);

export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(g);

/* ------------------------------------------------------------- acoustics */

/**
 * Sabine reverberation time for a box room (metric units).
 * T60 = 0.161 · V / (S · ᾱ)
 */
export function rt60Sabine(l, w, h, alpha) {
  const V = l * w * h;
  const S = 2 * (l * w + l * h + w * h);
  return { t60: (0.161 * V) / (S * alpha), volume: V, surface: S };
}

/** Schroeder frequency: below this, individual modes dominate the room. */
export function schroederFreq(t60, volume) {
  return 2000 * Math.sqrt(t60 / volume);
}

/**
 * Room modes for a rectangular room (dimensions in metres).
 * f = (c/2) · sqrt((p/L)² + (q/W)² + (r/H)²)   — Rayleigh's equation
 * Returns modes up to maxHz, sorted, classified axial/tangential/oblique.
 *
 * c defaults to the same 20 °C figure every other module uses, so a wavelength
 * read off /note/ and a mode read off /rt60/ agree with each other.
 */
export function roomModes(l, w, h, { maxHz = 300, maxIndex = 6, c = speedOfSound(20) } = {}) {
  const modes = [];
  for (let p = 0; p <= maxIndex; p++) {
    for (let q = 0; q <= maxIndex; q++) {
      for (let r = 0; r <= maxIndex; r++) {
        if (p === 0 && q === 0 && r === 0) continue;
        const f = (c / 2) * Math.sqrt((p / l) ** 2 + (q / w) ** 2 + (r / h) ** 2);
        if (f > maxHz) continue;
        const nonZero = (p > 0) + (q > 0) + (r > 0);
        modes.push({
          f,
          p, q, r,
          type: nonZero === 1 ? "axial" : nonZero === 2 ? "tangential" : "oblique",
        });
      }
    }
  }
  return modes.sort((a, b) => a.f - b.f);
}

/* ---------------------------------------------------------------- SPL/amp */

/**
 * SPL at a listening distance from one loudspeaker, free field.
 * sensitivity: dB SPL @ 1 W / 1 m; power in watts; distance in metres.
 */
export function splAtDistance(sensitivity, watts, metres) {
  return sensitivity + 10 * Math.log10(watts) - 20 * Math.log10(Math.max(metres, 0.001));
}

/** Watts needed to hit a target SPL at a distance, with headroom in dB. */
export function powerForSpl(targetSpl, sensitivity, metres, headroomDb = 0) {
  const db = targetSpl + headroomDb + 20 * Math.log10(Math.max(metres, 0.001)) - sensitivity;
  return Math.pow(10, db / 10);
}

/** Copper resistance per metre by AWG (Ω/m, solid copper at 20 °C). */
export const AWG_OHMS_PER_M = {
  10: 0.9989 / 304.8,
  12: 1.588 / 304.8,
  14: 2.525 / 304.8,
  16: 4.016 / 304.8,
  18: 6.385 / 304.8,
};

/**
 * Loudspeaker cable voltage drop.
 * lengthM is one-way cable length; the round trip is 2×.
 * Returns loop resistance, % of amp voltage lost, dB level loss at the load,
 * and watts dissipated in the cable at the given amp power.
 */
export function cableDrop({ awg, lengthM, loadOhms, watts }) {
  const rLoop = 2 * lengthM * AWG_OHMS_PER_M[awg];
  const frac = loadOhms / (loadOhms + rLoop);   // voltage divider at the load
  const lossDb = 20 * Math.log10(frac);          // negative
  const current = Math.sqrt(watts / loadOhms);   // approx, at rated power
  return {
    rLoop,
    dropPct: (1 - frac) * 100,
    lossDb,
    cableWatts: current * current * rLoop,
  };
}

/* ------------------------------------------------------------ formatting */

/** Fixed decimals, but trim pointless trailing zeros: fmt(3.1000,3) = "3.1" */
export function fmt(n, digits = 2) {
  if (!isFinite(n)) return "—";
  return parseFloat(n.toFixed(digits)).toString();
}
