// Minimal service worker — makes Sgela installable and loads the shell fast.
// We deliberately do NOT cache /api/chat (answers must be live).
const CACHE = "sgela-v1";
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API calls — always go to network for live answers
  if (url.pathname.startsWith("/api/")) return;
  // Shell: cache-first, fall back to network
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
