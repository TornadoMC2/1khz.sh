/**
 * host-freq.js — the domain gimmick, in one small module.
 *
 * Any subdomain of 1khz.sh is read as a frequency:
 *   440.1khz.sh   -> 440 Hz
 *   60.1khz.sh    -> 60 Hz
 *   16k.1khz.sh   -> 16000 Hz   ("k"/"khz" suffix accepted)
 *   432-5.1khz.sh -> 432.5 Hz   (dash stands in for the decimal point,
 *                                since dots aren't legal inside a DNS label)
 *
 * Everything happens client-side from window.location.hostname. Wildcard DNS
 * just has to point *.1khz.sh at the same static files; no server logic.
 *
 * A `?f=` query parameter does the same job and wins over the hostname, which
 * is what makes localhost testing possible at all:
 *   http://localhost:8000/?f=440
 */

const MIN_HZ = 1;
const MAX_HZ = 20000;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Parse a single DNS label into Hz, or null if it isn't one. */
export function parseFreqLabel(label) {
  const s = String(label).toLowerCase();
  let m;
  if ((m = s.match(/^(\d+)(?:-(\d+))?$/))) {
    // "440" or "432-5" (dash = decimal point)
    return parseFloat(m[2] ? `${m[1]}.${m[2]}` : m[1]);
  }
  if ((m = s.match(/^(\d+)(?:-(\d+))?k(?:hz)?$/))) {
    // "2k", "16khz", "1-5k"
    return parseFloat(m[2] ? `${m[1]}.${m[2]}` : m[1]) * 1000;
  }
  return null;
}

/** Read a frequency from the hostname's leftmost label, if there is one. */
export function parseHostFrequency(hostname = window.location.hostname) {
  const labels = hostname.split(".");
  // Need an actual subdomain: sub.1khz.sh has 3+ labels. The apex ("1khz.sh")
  // and www are left alone.
  if (labels.length < 3) return null;
  const sub = labels[0];
  if (sub === "www") return null;
  const hz = parseFreqLabel(sub);
  return hz == null || !isFinite(hz) ? null : clamp(hz, MIN_HZ, MAX_HZ);
}

/** Read a frequency from ?f=, if present. */
export function parseQueryFrequency(search = window.location.search) {
  const raw = new URLSearchParams(search).get("f");
  if (raw == null) return null;
  const hz = parseFloat(raw);
  return isFinite(hz) ? clamp(hz, MIN_HZ, MAX_HZ) : null;
}

/**
 * The one call every page makes: what frequency did the visitor arrive tuned
 * to, if any? Query param beats hostname; null means "nothing requested".
 */
export function getTunedFrequency() {
  return parseQueryFrequency() ?? parseHostFrequency();
}

/** "440 Hz", "2.5 kHz" — for chips and labels, not precision readouts. */
export function formatHz(hz) {
  if (hz >= 1000) {
    const k = hz / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(k < 10 ? 2 : 1)} kHz`;
  }
  return `${hz % 1 === 0 ? hz : hz.toFixed(1)} Hz`;
}
