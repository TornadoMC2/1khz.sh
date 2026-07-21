/**
 * panel-common.js — runs on every page.
 *  - bounces sibling domains (2khz.sh) home with their frequency
 *  - marks the current module in the rack nav
 *  - lights the header chip if the visitor arrived tuned to a frequency
 */
import { redirectSiblingDomains, getTunedFrequency, formatHz } from "./host-freq.js";

if (!redirectSiblingDomains()) {
  // Nav: body[data-page] names the current module.
  const page = document.body.dataset.page;
  document.querySelectorAll(".rack-nav a").forEach((a) => {
    if (a.dataset.nav === page) a.setAttribute("aria-current", "page");
  });

  // Tuned chip: only shown when the hostname or ?f= actually carried a value,
  // so the trick is visible exactly when it's in use. Links home with the
  // frequency so it survives navigation between modules.
  const hz = getTunedFrequency();
  const chip = document.getElementById("tunedChip");
  if (chip && hz != null) {
    chip.hidden = false;
    chip.href = `/?f=${hz}`;
    chip.innerHTML = `<span class="chip-label">Tuned</span><span>${formatHz(hz)}</span>`;
  }
}
