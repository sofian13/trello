// Service worker minimal — coquille hors-ligne (app shell).
// Les données live (Supabase) nécessitent le réseau ; on cache surtout l'UI.
const CACHE = "teamboard-v1";
const SHELL = ["/", "/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Ne jamais mettre en cache les appels API/Supabase
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api")) {
    return;
  }
  // Network-first, repli sur le cache hors-ligne
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match("/")))
  );
});
