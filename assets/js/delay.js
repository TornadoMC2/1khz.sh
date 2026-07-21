/**
 * delay.js — 1K-DLY
 * Distance <-> milliseconds through air, at whatever temperature the room
 * (or the parking lot) actually is. Distance is the source of truth; the
 * last-edited field drives, the other follows.
 */
import { speedOfSound, fmt } from "./audio-math.js";

const $ = (id) => document.getElementById(id);
const el = {
  temp: $("tempInput"),
  tempSeg: $("tempUnitSeg"),
  cVal: $("cVal"),
  cUnit: $("cUnit"),
  dist: $("distInput"),
  distSeg: $("distUnitSeg"),
  ms: $("msInput"),
  sr: $("srSelect"),
  srLabel: $("srLabel"),
  samples: $("samplesVal"),
  rt: $("rtVal"),
  per: $("perVal"),
};

const M_PER_FT = 0.3048;

const state = {
  tempC: 20,
  tempUnit: "c",
  distUnit: "m",
  metres: 10,        // canonical distance
  lastEdited: "dist" // "dist" | "ms"
};

const c = () => speedOfSound(state.tempC); // m/s
const msFromMetres = (m) => (m / c()) * 1000;
const metresFromMs = (ms) => (ms / 1000) * c();

function render() {
  const v = c();
  const imperial = state.distUnit === "ft";
  el.cVal.textContent = fmt(imperial ? v / M_PER_FT : v, 1);
  el.cUnit.textContent = imperial ? "ft/s" : "m/s";

  const ms = msFromMetres(state.metres);
  if (document.activeElement !== el.dist) {
    el.dist.value = fmt(imperial ? state.metres / M_PER_FT : state.metres, 2);
  }
  if (document.activeElement !== el.ms) el.ms.value = fmt(ms, 2);

  el.samples.textContent = Math.round((ms / 1000) * parseInt(el.sr.value, 10)).toLocaleString();
  el.srLabel.textContent = (parseInt(el.sr.value, 10) / 1000).toString();
  el.rt.textContent = `${fmt(ms * 2, 2)} ms`;
  el.per.textContent = `${fmt(msFromMetres(1), 2)} / ${fmt(msFromMetres(M_PER_FT), 2)} ms`;
}

/* ------------------------------------------------------------------ wire */

el.temp.addEventListener("input", () => {
  const t = parseFloat(el.temp.value);
  if (!isFinite(t)) return;
  state.tempC = state.tempUnit === "f" ? (t - 32) * 5 / 9 : t;
  render();
});

el.tempSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tunit]");
  if (!b || b.dataset.tunit === state.tempUnit) return;
  state.tempUnit = b.dataset.tunit;
  el.tempSeg.querySelectorAll("button").forEach((x) =>
    x.setAttribute("aria-pressed", String(x === b)));
  el.temp.value = fmt(state.tempUnit === "f" ? state.tempC * 9 / 5 + 32 : state.tempC, 1);
  render();
});

el.distSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-dunit]");
  if (!b || b.dataset.dunit === state.distUnit) return;
  state.distUnit = b.dataset.dunit;
  el.distSeg.querySelectorAll("button").forEach((x) =>
    x.setAttribute("aria-pressed", String(x === b)));
  render();
});

el.dist.addEventListener("input", () => {
  const d = parseFloat(el.dist.value);
  if (!isFinite(d) || d < 0) return;
  state.metres = state.distUnit === "ft" ? d * M_PER_FT : d;
  render();
});

el.ms.addEventListener("input", () => {
  const ms = parseFloat(el.ms.value);
  if (!isFinite(ms) || ms < 0) return;
  state.metres = metresFromMs(ms);
  render();
});

el.sr.addEventListener("change", render);

render();
