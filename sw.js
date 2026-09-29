/* AoIP Bandwidth Planner — service worker: caches the app shell so the planner works offline.
   © 2026 Graziano Melzi · OnAir Garage — MIT License

   Bump CACHE_VERSION whenever any file below changes; old caches are dropped on activate. */
const CACHE_VERSION = "v2026.9.3";
const CACHE_NAME = "aoipplanner-" + CACHE_VERSION;

const PRECACHE_URLS = [
  "./", "./index.html", "./manifest.json", "./style.css", "./fonts.css",
  "./model.js", "./plan.js", "./i18n.js", "./diagram.js", "./app.js",
  "./icons/icon.svg", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
  "./fonts/IBMPlexSans-Regular-Latin1.woff2", "./fonts/IBMPlexSans-Regular-Pi.woff2",
  "./fonts/IBMPlexSans-Medium-Latin1.woff2", "./fonts/IBMPlexSans-Medium-Pi.woff2",
  "./fonts/IBMPlexSans-SemiBold-Latin1.woff2", "./fonts/IBMPlexSans-SemiBold-Pi.woff2",
  "./fonts/IBMPlexMono-Regular-Latin1.woff2", "./fonts/IBMPlexMono-Regular-Pi.woff2",
  "./fonts/IBMPlexMono-Medium-Latin1.woff2", "./fonts/IBMPlexMono-Medium-Pi.woff2"
];

self.addEventListener("install", (event) => {
  // No skipWaiting(): on an update the new worker waits until the page asks for it
  // (banner "new version ready"). On a first install this has no effect.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Cache-first: instant offline loads.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
