/**
 * generator.js — the front panel.
 *
 * Signal path:
 *   [osc | noise buffer] -> srcGain -> gainL ┐
 *                                     gainR ┴-> merger -> master (fader)
 *                                        -> output (power switch) -> analyser -> speakers
 *
 * The output gain is the power switch: sources run whenever the context is
 * alive, the switch just opens the gate (with a short ramp so it never
 * clicks). The scope taps the analyser *after* the switch, so the trace is
 * honest — power off, flat line.
 *
 * Audio starts strictly on a user gesture (browser policy and good manners).
 */
import { getTunedFrequency } from "./host-freq.js";
import { freqToNote, wavelength, dbToGain, fmt } from "./audio-math.js";

/* ---------------------------------------------------------------- state */

const SWEEP_SECONDS = 8;          // 20 Hz -> 20 kHz, then wraps
const FREQ_MIN = 20;
const FREQ_MAX = 20000;

const state = {
  freq: getTunedFrequency() ?? 1000,
  wave: "sine",                   // sine | square | pink | white | sweep
  channel: "both",                // left | both | right
  levelDb: -18,
  on: false,
};
state.freq = Math.min(FREQ_MAX, Math.max(FREQ_MIN, state.freq));

let ctx = null;
let nodes = null;                 // built once, on first power-on
let source = null;                // current oscillator / buffer source
let sweepEpoch = 0;               // ctx time the sweep cycle chain began
let sweepTimer = 0;

/* ------------------------------------------------------------------ DOM */

const $ = (id) => document.getElementById(id);
const el = {
  power: $("powerBtn"),
  freqInput: $("freqInput"),
  freqSlider: $("freqSlider"),
  presets: $("freqPresets"),
  waveSeg: $("waveSeg"),
  chanSeg: $("chanSeg"),
  level: $("levelFader"),
  levelVal: $("levelVal"),
  note: $("noteVal"),
  cents: $("centsVal"),
  lambda: $("lambdaVal"),
  period: $("periodVal"),
  scope: $("scopeCanvas"),
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* -------------------------------------------------- frequency <-> slider */
// Log taper: slider 0..1000 spans 20 Hz .. 20 kHz.

const sliderToFreq = (pos) => FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, pos / 1000);
const freqToSlider = (f) => 1000 * (Math.log(f / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN));

/** Accepts "440", "432.5", "1k", "1.5k", "16khz". */
function parseFreqEntry(text) {
  const m = String(text).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(k|khz|hz)?$/);
  if (!m) return null;
  let hz = parseFloat(m[1]);
  if (m[2] === "k" || m[2] === "khz") hz *= 1000;
  return isFinite(hz) ? Math.min(FREQ_MAX, Math.max(FREQ_MIN, hz)) : null;
}

/* ---------------------------------------------------------- audio graph */

function buildGraph() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  const output = ctx.createGain();
  const gainL = ctx.createGain();
  const gainR = ctx.createGain();
  const merger = ctx.createChannelMerger(2);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;

  gainL.connect(merger, 0, 0);
  gainR.connect(merger, 0, 1);
  merger.connect(master);
  master.connect(output);
  output.connect(analyser);
  analyser.connect(ctx.destination);

  master.gain.value = dbToGain(state.levelDb);
  output.gain.value = 0; // power starts off, always

  nodes = { master, output, gainL, gainR, analyser };
  applyChannel();
}

/** 4 s of Paul Kellet pink noise, looped. Cheap, correct enough for ears. */
function makeNoiseBuffer(kind) {
  const seconds = kind === "pink" ? 4 : 2;
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  if (kind === "white") {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } else {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

function stopSource() {
  clearInterval(sweepTimer);
  sweepTimer = 0;
  if (source) {
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
    source._srcGain?.disconnect();
    source = null;
  }
}

/** (Re)start the source for the current waveform. */
function startSource() {
  if (!ctx) return;
  stopSource();

  const srcGain = ctx.createGain();
  srcGain.connect(nodes.gainL);
  srcGain.connect(nodes.gainR);

  if (state.wave === "pink" || state.wave === "white") {
    const s = ctx.createBufferSource();
    s.buffer = makeNoiseBuffer(state.wave);
    s.loop = true;
    s.connect(srcGain);
    s.start();
    source = s;
  } else {
    const o = ctx.createOscillator();
    o.type = state.wave === "square" ? "square" : "sine";
    if (state.wave === "sweep") {
      scheduleSweep(o);
    } else {
      o.frequency.value = state.freq;
    }
    o.connect(srcGain);
    o.start();
    source = o;
  }
  source._srcGain = srcGain; // keep a handle so stopSource() can disconnect cleanly
}

/** Chain exponential 20 Hz -> 20 kHz ramps, a couple of cycles ahead. */
function scheduleSweep(osc) {
  sweepEpoch = ctx.currentTime + 0.05;
  let next = sweepEpoch;
  const scheduleCycle = (t) => {
    osc.frequency.setValueAtTime(FREQ_MIN, t);
    osc.frequency.exponentialRampToValueAtTime(FREQ_MAX, t + SWEEP_SECONDS);
  };
  scheduleCycle(next);
  next += SWEEP_SECONDS;
  scheduleCycle(next);
  next += SWEEP_SECONDS;
  sweepTimer = setInterval(() => {
    while (next < ctx.currentTime + SWEEP_SECONDS) {
      scheduleCycle(next);
      next += SWEEP_SECONDS;
    }
  }, 500);
}

/** Where the sweep is right now, for the readouts. */
function sweepFreqNow() {
  if (!ctx) return FREQ_MIN;
  const t = Math.max(0, ctx.currentTime - sweepEpoch) % SWEEP_SECONDS;
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t / SWEEP_SECONDS);
}

/* ----------------------------------------------------------- apply state */

function applyChannel() {
  if (!nodes) return;
  const t = ctx.currentTime;
  const L = state.channel !== "right" ? 1 : 0;
  const R = state.channel !== "left" ? 1 : 0;
  nodes.gainL.gain.setTargetAtTime(L, t, 0.01);
  nodes.gainR.gain.setTargetAtTime(R, t, 0.01);
}

function applyLevel() {
  el.levelVal.textContent = state.levelDb.toFixed(1);
  if (nodes) nodes.master.gain.setTargetAtTime(dbToGain(state.levelDb), ctx.currentTime, 0.01);
}

function applyFreq() {
  if (source && source.frequency && state.wave !== "sweep") {
    source.frequency.setTargetAtTime(state.freq, ctx.currentTime, 0.01);
  }
  el.freqInput.value = fmt(state.freq, 2);
  el.freqSlider.value = Math.round(freqToSlider(state.freq));
  updatePitchReadouts(state.freq);
}

function updatePitchReadouts(hz) {
  const isNoise = state.wave === "pink" || state.wave === "white";
  if (isNoise) {
    el.note.textContent = "—";
    el.cents.textContent = "broadband";
    el.lambda.textContent = "—";
    el.period.textContent = "—";
    return;
  }
  const n = freqToNote(hz);
  el.note.textContent = `${n.name}${n.octave}`;
  el.cents.textContent = `${n.cents >= 0 ? "+" : ""}${n.cents.toFixed(0)} cents`;
  const m = wavelength(hz);
  el.lambda.textContent = `${fmt(m, m < 1 ? 3 : 2)} m / ${fmt(m * 3.28084, 2)} ft`;
  el.period.textContent = `${fmt(1000 / hz, 3)} ms`;
}

function setWave(wave) {
  state.wave = wave;
  const tonal = wave === "sine" || wave === "square";
  el.freqSlider.disabled = !tonal;
  el.freqInput.disabled = !tonal;
  el.presets.querySelectorAll("button").forEach((b) => (b.disabled = !tonal));
  el.waveSeg.querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.wave === wave)));
  if (ctx) startSource();
  if (tonal) applyFreq(); else updatePitchReadouts(state.freq);
}

function setChannel(channel) {
  state.channel = channel;
  el.chanSeg.querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.chan === channel)));
  applyChannel();
}

async function setPower(on) {
  state.on = on;
  el.power.setAttribute("aria-pressed", String(on));
  el.power.querySelector(".power-text").textContent = on ? "Output On" : "Output Off";

  if (on) {
    if (!ctx) {                       // first gesture: bring the unit up
      buildGraph();
      startSource();
      applyLevel();
    }
    if (ctx.state === "suspended") await ctx.resume();
    nodes.output.gain.setTargetAtTime(1, ctx.currentTime, 0.012);
    startScopeLoop();
  } else if (nodes) {
    nodes.output.gain.setTargetAtTime(0, ctx.currentTime, 0.012);
  }
}

/* ------------------------------------------------------------------ scope */

const scope = el.scope.getContext("2d");
let scopeRAF = 0;

function sizeScope() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = el.scope.getBoundingClientRect();
  el.scope.width = Math.round(r.width * dpr);
  el.scope.height = Math.round(r.height * dpr);
  drawScope(); // repaint at the new size even when idle
}

function drawGraticule(w, h) {
  scope.clearRect(0, 0, w, h);
  scope.strokeStyle = "rgba(255,178,87,0.07)";
  scope.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const x = (w / 10) * i;
    scope.beginPath(); scope.moveTo(x, 0); scope.lineTo(x, h); scope.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const y = (h / 6) * i;
    scope.beginPath(); scope.moveTo(0, y); scope.lineTo(w, y); scope.stroke();
  }
  scope.strokeStyle = "rgba(255,178,87,0.14)";
  scope.beginPath(); scope.moveTo(0, h / 2); scope.lineTo(w, h / 2); scope.stroke();
}

function drawScope() {
  const w = el.scope.width, h = el.scope.height;
  if (!w || !h) return;
  drawGraticule(w, h);

  if (!nodes) return traceFlat(w, h);

  const N = nodes.analyser.fftSize;
  const data = new Float32Array(N);
  nodes.analyser.getFloatTimeDomainData(data);

  // Trigger on a rising zero crossing so periodic waves hold still.
  let start = 0;
  for (let i = 1; i < N / 2; i++) {
    if (data[i - 1] <= 0 && data[i] > 0) { start = i; break; }
  }

  const span = N / 2;
  const trace = (width, color) => {
    scope.lineWidth = width;
    scope.strokeStyle = color;
    scope.beginPath();
    for (let i = 0; i < span; i++) {
      const x = (i / span) * w;
      const y = h / 2 - data[start + i] * (h / 2) * 0.88;
      i ? scope.lineTo(x, y) : scope.moveTo(x, y);
    }
    scope.stroke();
  };
  trace(5, "rgba(255,178,87,0.16)");   // cheap phosphor glow
  trace(1.6, "#ffcf8e");
}

function traceFlat(w, h) {
  scope.lineWidth = 1.6;
  scope.strokeStyle = "rgba(255,178,87,0.35)";
  scope.beginPath(); scope.moveTo(0, h / 2); scope.lineTo(w, h / 2); scope.stroke();
}

function startScopeLoop() {
  cancelAnimationFrame(scopeRAF);
  const tick = () => {
    drawScope();
    if (state.wave === "sweep" && state.on) {
      const f = sweepFreqNow();
      el.freqInput.value = f.toFixed(0);
      el.freqSlider.value = Math.round(freqToSlider(f));
      updatePitchReadouts(f);
    }
    // Keep animating while the gate is open (the ramp-out tail included).
    if (state.on) scopeRAF = requestAnimationFrame(tick);
    else setTimeout(drawScope, 120); // one last frame after the ramp settles
  };
  scopeRAF = requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ wire */

el.power.addEventListener("click", () => setPower(!state.on));

document.addEventListener("keydown", (e) => {
  const t = e.target;
  const typing = t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON");
  if (e.code === "Space" && !typing) {
    e.preventDefault();
    setPower(!state.on);
  }
});

el.freqSlider.addEventListener("input", () => {
  state.freq = sliderToFreq(parseFloat(el.freqSlider.value));
  if (source && source.frequency) source.frequency.setTargetAtTime(state.freq, ctx.currentTime, 0.01);
  el.freqInput.value = state.freq < 100 ? state.freq.toFixed(1) : state.freq.toFixed(0);
  updatePitchReadouts(state.freq);
});

const commitFreqEntry = () => {
  const hz = parseFreqEntry(el.freqInput.value);
  if (hz != null) { state.freq = hz; applyFreq(); }
  else el.freqInput.value = fmt(state.freq, 2);
};
el.freqInput.addEventListener("change", commitFreqEntry);
el.freqInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { commitFreqEntry(); e.target.blur(); } });

el.presets.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-hz]");
  if (!b) return;
  state.freq = parseFloat(b.dataset.hz);
  applyFreq();
});

el.waveSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-wave]");
  if (b) setWave(b.dataset.wave);
});

el.chanSeg.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-chan]");
  if (b) setChannel(b.dataset.chan);
});

el.level.addEventListener("input", () => {
  state.levelDb = parseFloat(el.level.value);
  applyLevel();
});

new ResizeObserver(sizeScope).observe(el.scope);
reducedMotion.addEventListener?.("change", drawScope);

/* ------------------------------------------------------------------ boot */

el.level.value = state.levelDb;
applyLevel();
setWave(state.wave);
setChannel(state.channel);
applyFreq();
sizeScope();
