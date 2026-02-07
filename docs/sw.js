const CACHE_NAME = "cooking-dada-v20";

const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./dist/main.js",
  "./dist/types.js",
  "./dist/units.js",
  "./dist/stocks.js",
  "./dist/recipes.js",
  "./dist/ui.js",
  "./dist/groceryList.js",
  "./dist/recipeImport.js",
  "./recettes.json",
  "./font/lobster/Lobster 1.4.otf",
];

// Install: cache all static files
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching app shell");
      return cache.addAll(FILES);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          })
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch: cache-first strategy
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Don't cache non-GET requests or external resources
        if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) {
          return networkResponse;
        }
        // Cache new resources
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, networkResponse.clone());
          return networkResponse;
        });
      });
    })
  );
});
