// Bump this value whenever a deployed asset changes so returning users do not
// get an older cached shell after a GitHub Pages update.
const CACHE_NAME = "etkinlik-takip-v18";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./cocuk-evleri.html",
  "./login.html",
  "./admin-users.html",
  "./style.css",
  "./app.js",
  "./auth.js",
  "./admin-users.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => {
          if (cached) return cached;
          const pathname = new URL(event.request.url).pathname;
          if (pathname.endsWith("/login.html")) return caches.match("./login.html");
          if (pathname.endsWith("/admin-users.html")) return caches.match("./admin-users.html");
          if (pathname.endsWith("/cocuk-evleri.html")) return caches.match("./cocuk-evleri.html");
          return caches.match("./index.html");
        }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkResponse = fetch(event.request)
        .then((response) => {
          if (response.ok || response.type === "opaque") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || networkResponse;
    })
  );
});
