/**
 * panel-common.js — runs on every page.
 *  - bounces sibling domains (2khz.sh) home with their frequency
 *  - marks the current module in the rack nav
 *  - lights the header chip if the visitor arrived tuned to a frequency
 *  - fills the footer's source / donation links from config.js
 *  - registers the service worker so the kit loads instantly and works offline
 */
import { redirectSiblingDomains, getTunedFrequency, formatHz } from "./host-freq.js";
import { SITE } from "./config.js";

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

  // Footer links come from config.js — one place to edit, every page updates.
  // An anchor with an empty URL is removed, so unconfigured links never show.
  const linkFor = (sel, url, label) => {
    const a = document.querySelector(sel);
    if (!a) return;
    if (!url) { a.remove(); return; }
    a.href = url;
    if (label) {
      const span = a.querySelector("[data-label]");
      if (span) span.textContent = label;
    }
  };
  linkFor('[data-site="source"]', SITE.sourceUrl);
  linkFor('[data-site="donate"]', SITE.donateUrl, SITE.donateLabel);

  // Service worker: progressive enhancement, only where supported and secure.
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* offline support is optional */ });
    });
  }
}
