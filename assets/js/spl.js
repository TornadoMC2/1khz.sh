/**
 * spl.js — 1K-SPL
 * Three calculators that share one unit toggle and one sensitivity figure:
 *   1. SPL at a listening distance (free field, single box)
 *   2. Amplifier power needed for a target SPL + headroom
 *   3. Loudspeaker cable voltage drop
 */
import { splAtDistance, powerForSpl, cableDrop, fmt } from "./audio-math.js";

const $ = (id) => document.getElementById(id);
const el = {
  sens: $("sensInput"),
  power: $("powerInput"),
  dist: $("distInput"),
  unitSeg: $("splUnitSeg"),
  spl: $("splVal"),
  spl1m: $("spl1mVal"),
  distLoss: $("distLossVal"),

  targetSpl: $("targetSpl"),
  targetDist: $("targetDist"),
  targetDistUnit: $("targetDistUnit"),
  headroom: $("headroomSelect"),
  reqPower: $("reqPowerVal"),
  reqPowerBare: $("reqPowerBareVal"),

  awg: $("awgSelect"),
  cableLen: $("cableLen"),
  cableLenUnit: $("cableLenUnit"),
  load: $("loadSelect"),
  cablePower: $("cablePower"),
  lossDb: $("lossDbVal"),
  dropPct: $("dropPctVal"),
  rLoop: $("rLoopVal"),
  cableWatts: $("cableWattsVal"),
};

const M_PER_FT = 0.3048;
const state = { unit: "m" };
const toMetres = (v) => (state.unit === "ft" ? v * M_PER_FT : v);
const num = (input, min = -Infinity) => {
  const v = parseFloat(input.value);
  return isFinite(v) && v >= min ? v : null;
};

function renderSpl() {
  const sens = num(el.sens);
  const watts = num(el.power, 0.001);
  const dist = num(el.dist, 0.001);
  if (sens == null || watts == null || dist == null) return;
  const m = toMetres(dist);
  el.spl.textContent = `${fmt(splAtDistance(sens, watts, m), 1)} dB`;
  el.spl1m.textContent = `${fmt(sens + 10 * Math.log10(watts), 1)} dB`;
  el.distLoss.textContent = `${fmt(-20 * Math.log10(m), 1)} dB`;
}

function renderPower() {
  const sens = num(el.sens);
  const target = num(el.targetSpl);
  const dist = num(el.targetDist, 0.001);
  if (sens == null || target == null || dist == null) return;
  const m = toMetres(dist);
  const hr = parseFloat(el.headroom.value);
  const w = (x) => `${Math.round(x).toLocaleString()} W`;
  el.reqPower.textContent = w(powerForSpl(target, sens, m, hr));
  el.reqPowerBare.textContent = w(powerForSpl(target, sens, m, 0));
}

function renderCable() {
  const lengthRaw = num(el.cableLen, 0.001);
  const watts = num(el.cablePower, 0.001);
  if (lengthRaw == null || watts == null) return;
  const r = cableDrop({
    awg: parseInt(el.awg.value, 10),
    lengthM: toMetres(lengthRaw),
    loadOhms: parseFloat(el.load.value),
    watts,
  });
  el.lossDb.textContent = `${fmt(r.lossDb, 2)} dB`;
  el.dropPct.textContent = `${fmt(r.dropPct, 1)}% voltage drop`;
  el.rLoop.textContent = `${fmt(r.rLoop, 3)} Ω`;
  el.cableWatts.textContent = `${fmt(r.cableWatts, 1)} W`;
}

function renderAll() {
  renderSpl();
  renderPower();
  renderCable();
}

/* ------------------------------------------------------------------ wire */

el.unitSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-sunit]");
  if (!b || b.dataset.sunit === state.unit) return;
  // Convert the distance/length fields so the physical setup doesn't move.
  const factor = b.dataset.sunit === "ft" ? 1 / M_PER_FT : M_PER_FT;
  [el.dist, el.targetDist, el.cableLen].forEach((i) => {
    const v = parseFloat(i.value);
    if (isFinite(v)) i.value = fmt(v * factor, 1);
  });
  state.unit = b.dataset.sunit;
  el.unitSeg.querySelectorAll("button").forEach((x) =>
    x.setAttribute("aria-pressed", String(x === b)));
  el.targetDistUnit.textContent = state.unit;
  el.cableLenUnit.textContent = state.unit;
  renderAll();
});

[el.sens, el.power, el.dist].forEach((i) => i.addEventListener("input", () => { renderSpl(); renderPower(); }));
[el.targetSpl, el.targetDist].forEach((i) => i.addEventListener("input", renderPower));
el.headroom.addEventListener("change", renderPower);
[el.cableLen, el.cablePower].forEach((i) => i.addEventListener("input", renderCable));
[el.awg, el.load].forEach((i) => i.addEventListener("change", renderCable));

renderAll();
