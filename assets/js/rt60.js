/**
 * rt60.js — 1K-RT60
 * Sabine RT60 from box dimensions and a single average absorption
 * coefficient, plus the full mode table (axial / tangential / oblique)
 * and the Schroeder frequency that separates modal from statistical
 * behaviour.
 */
import { rt60Sabine, schroederFreq, roomModes, freqToNote, fmt } from "./audio-math.js";

const $ = (id) => document.getElementById(id);
const el = {
  l: $("dimL"), w: $("dimW"), h: $("dimH"),
  unitSeg: $("rtUnitSeg"),
  alpha: $("alphaSlider"),
  alphaVal: $("alphaVal"),
  alphaPresets: $("alphaPresets"),
  rt60: $("rt60Val"),
  vol: $("volVal"),
  surf: $("surfVal"),
  schroeder: $("schroederVal"),
  modeBody: document.querySelector("#modeTable tbody"),
  modeCount: $("modeCount"),
};

const M_PER_FT = 0.3048;
const MODE_MAX_HZ = 300;
const state = { unit: "m" };

/** Current dimensions in metres, or null if any field is bad. */
function dimsM() {
  const vals = [el.l, el.w, el.h].map((i) => parseFloat(i.value));
  if (vals.some((v) => !isFinite(v) || v <= 0)) return null;
  return state.unit === "ft" ? vals.map((v) => v * M_PER_FT) : vals;
}

function render() {
  const d = dimsM();
  if (!d) return;
  const [l, w, h] = d;
  const alpha = parseFloat(el.alpha.value);
  el.alphaVal.textContent = alpha.toFixed(2);

  const { t60, volume, surface } = rt60Sabine(l, w, h, alpha);
  el.rt60.textContent = `${fmt(t60, 2)} s`;
  const imperial = state.unit === "ft";
  el.vol.textContent = imperial
    ? `${fmt(volume / (M_PER_FT ** 3), 0)} ft³`
    : `${fmt(volume, 1)} m³`;
  el.surf.textContent = imperial
    ? `${fmt(surface / (M_PER_FT ** 2), 0)} ft² boundary area`
    : `${fmt(surface, 1)} m² boundary area`;
  el.schroeder.textContent = `${fmt(schroederFreq(t60, volume), 0)} Hz`;

  // Mode table — capped so a broom closet doesn't render 400 rows.
  const modes = roomModes(l, w, h, { maxHz: MODE_MAX_HZ }).slice(0, 48);
  el.modeCount.textContent = `${modes.length} modes below ${MODE_MAX_HZ} Hz`;
  el.modeBody.innerHTML = modes.map((m) => {
    const n = freqToNote(m.f);
    const note = `${n.name}${n.octave} ${n.cents >= 0 ? "+" : ""}${n.cents.toFixed(0)}¢`;
    return `<tr class="${m.type}">
      <td class="hz">${m.f.toFixed(1)} Hz</td>
      <td>${m.p}·${m.q}·${m.r}</td>
      <td>${note}</td>
      <td>${m.type}</td>
    </tr>`;
  }).join("");
}

/* ------------------------------------------------------------------ wire */

[el.l, el.w, el.h].forEach((i) => i.addEventListener("input", render));
el.alpha.addEventListener("input", render);

el.alphaPresets.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-alpha]");
  if (!b) return;
  el.alpha.value = b.dataset.alpha;
  render();
});

el.unitSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-runit]");
  if (!b || b.dataset.runit === state.unit) return;
  // Convert the field values so the physical room doesn't change size.
  const factor = b.dataset.runit === "ft" ? 1 / M_PER_FT : M_PER_FT;
  [el.l, el.w, el.h].forEach((i) => {
    const v = parseFloat(i.value);
    if (isFinite(v)) i.value = fmt(v * factor, 2);
  });
  state.unit = b.dataset.runit;
  el.unitSeg.querySelectorAll("button").forEach((x) =>
    x.setAttribute("aria-pressed", String(x === b)));
  render();
});

render();
