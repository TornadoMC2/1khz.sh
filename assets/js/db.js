/**
 * db.js — 1K-LVL
 * Volts are the canonical value; dBu, dBV, and dBFS are views of it.
 * dBFS additionally depends on the alignment (what 0 dBFS equals in dBu).
 */
import { voltsToDbu, dbuToVolts, voltsToDbv, dbvToVolts, fmt } from "./audio-math.js";

const $ = (id) => document.getElementById(id);
const el = {
  dbu: $("dbuInput"),
  dbv: $("dbvInput"),
  volt: $("voltInput"),
  dbfs: $("dbfsInput"),
  align: $("alignSelect"),
  customWrap: $("customAlignWrap"),
  custom: $("customAlign"),
  nominal: $("nominalInput"),
  headroom: $("headroomVal"),
  nominalFs: $("nominalFsVal"),
  margin: $("marginVal"),
};

const state = {
  volts: dbuToVolts(4),  // start at +4 dBu, pro nominal
  alignDbu: 24,          // 0 dBFS = +24 dBu
};

function render(except = null) {
  const dbu = voltsToDbu(state.volts);
  const set = (input, value, digits) => {
    if (input !== except && document.activeElement !== input) input.value = fmt(value, digits);
  };
  set(el.dbu, dbu, 2);
  set(el.dbv, voltsToDbv(state.volts), 2);
  set(el.volt, state.volts, 4);
  set(el.dbfs, dbu - state.alignDbu, 2);

  const nominal = parseFloat(el.nominal.value);
  if (isFinite(nominal)) {
    el.headroom.textContent = `${fmt(state.alignDbu - nominal, 1)} dB`;
    el.nominalFs.textContent = `${fmt(nominal - state.alignDbu, 1)} dBFS`;
  }
  el.margin.textContent = `${fmt(state.alignDbu - dbu, 1)} dB`;
}

/* ------------------------------------------------------------------ wire */

const num = (input) => {
  const v = parseFloat(input.value);
  return isFinite(v) ? v : null;
};

el.dbu.addEventListener("input", () => {
  const v = num(el.dbu);
  if (v == null) return;
  state.volts = dbuToVolts(v);
  render(el.dbu);
});

el.dbv.addEventListener("input", () => {
  const v = num(el.dbv);
  if (v == null) return;
  state.volts = dbvToVolts(v);
  render(el.dbv);
});

el.volt.addEventListener("input", () => {
  const v = num(el.volt);
  if (v == null || v <= 0) return;
  state.volts = v;
  render(el.volt);
});

el.dbfs.addEventListener("input", () => {
  const v = num(el.dbfs);
  if (v == null) return;
  state.volts = dbuToVolts(v + state.alignDbu);
  render(el.dbfs);
});

function applyAlignment() {
  if (el.align.value === "custom") {
    el.customWrap.hidden = false;
    const v = num(el.custom);
    if (v != null) state.alignDbu = v;
  } else {
    el.customWrap.hidden = true;
    state.alignDbu = parseFloat(el.align.value);
  }
  render();
}

el.align.addEventListener("change", applyAlignment);
el.custom.addEventListener("input", applyAlignment);
el.nominal.addEventListener("input", () => render());

render();
