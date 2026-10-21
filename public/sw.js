// Service worker — makes Sgela installable and loads the shell fast.
// Bump CACHE version on every UI change so clients get the new version.
const CACHE = "sgela-v11";
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
  if (url.pathname.startsWith("/api/")) return; // never cache live answers
  // Network-first for the page itself so updates show immediately;
  // fall back to cache when offline.
  if (e.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("/")))
    );
    return;
  }
  // Other assets: cache-first
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
