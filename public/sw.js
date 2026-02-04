const CACHE_NAME = "cooking-dada-v1";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./dist/main.js",
  "./manifest.json",
  "./recettes.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES))
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
