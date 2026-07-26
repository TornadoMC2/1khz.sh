/*
 * sw.js — 1kHz.sh service worker.
 *
 * Goal: the whole kit loads instantly on repeat visits and keeps working with
 * no signal (venue Wi-Fi, airplane mode, a basement with a PA in it), while
 * still picking up new deploys on its own.
 *
 * Strategy:
 *   - Precache the app shell on install (every page, the stylesheet, every
 *     module, the fonts, the icons).
 *   - Navigations + same-origin GETs are served stale-while-revalidate: answer
 *     from cache immediately, then refresh the cache in the background so the
 *     next load is current. Fall back to the cached generator when offline.
 *
 * Bump CACHE whenever shipping changes so old caches are cleared on activate.
 */
const CACHE = "1khz-v3";

const PRECACHE = [
  "/",
  "/delay/",
  "/db/",
  "/rt60/",
  "/note/",
  "/spl/",
  "/math/",
  "/about/",
  "/404.html",
  "/manifest.webmanifest",
  "/assets/icon.svg",
  "/assets/icon-maskable.svg",
  "/assets/css/panel.css",
  "/assets/js/panel-common.js",
  "/assets/js/config.js",
  "/assets/js/host-freq.js",
  "/assets/js/audio-math.js",
  "/assets/js/generator.js",
  "/assets/js/delay.js",
  "/assets/js/db.js",
  "/assets/js/rt60.js",
  "/assets/js/note.js",
  "/assets/js/spl.js",
  "/assets/fonts/barlow-sc-500.woff2",
  "/assets/fonts/barlow-sc-600.woff2",
  "/assets/fonts/barlow-sc-700.woff2",
  "/assets/fonts/ibm-plex-mono-400.woff2",
  "/assets/fonts/ibm-plex-mono-500.woff2",
  "/assets/fonts/ibm-plex-mono-600.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Resilient precache: one missing file shouldn't abort the whole install.
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch third-party requests

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Match ignoring ?f= so /?f=440 reuses the cached generator shell.
      const cached = await cache.match(request, { ignoreSearch: true });

      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      // Stale-while-revalidate: cache first for speed, refresh in the background.
      if (cached) {
        event.waitUntil(network);
        return cached;
      }

      const fresh = await network;
      if (fresh) return fresh;

      // Offline and never cached: fall back to the generator shell for
      // navigations, otherwise let it fail.
      if (request.mode === "navigate") {
        return (await cache.match("/")) || Response.error();
      }
      return Response.error();
    })
  );
});
