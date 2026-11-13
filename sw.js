// Offline support for the installed (Home Screen) app.
// Network-first so updates always show up when online; falls back to the cache when offline.
const CACHE = "neonbay-v9";
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./lib/three.min.js",
  "./js/util.js", "./js/controls.js", "./js/touch.js", "./js/world.js", "./js/vehicles.js", "./js/actors.js",
  "./js/humanoid.js", "./js/heroes.js", "./js/missions.js", "./js/jobs.js", "./js/emergency.js", "./js/campaign.js", "./js/finale.js", "./js/audio.js",
  "./js/render.js", "./js/spectacle.js", "./js/agents.js", "./js/property.js", "./js/ui.js", "./js/p2p.js", "./js/net.js", "./js/main.js",
  "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png",
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
