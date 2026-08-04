const CACHE = 'iwt-static-v2.0.0';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './simulation/model.js',
  './simulation/versions.js',
  './simulation/profiles.js',
  './simulation/config.js',
  './simulation/outcomes.js',
  './simulation/engine.js',
  './simulation/batch.js',
  './simulation/batch-worker.js',
  './simulation/worker-runtime.js',
  './simulation/worker.js',
  './simulation/core/hash.js',
  './simulation/core/rng.js',
  './simulation/core/components.js',
  './simulation/scenarios/catalog.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.webmanifest',
  './robots.txt',
  './presets/jam.json',
  './presets/collective.json',
  './presets/budding.json',
  './presets/escape.json'
];

function isCacheable(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'cors');
}

async function cacheResponse(request, response) {
  if (!isCacheable(response)) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request);
    await cacheResponse(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallback) {
      const fallbackResponse = await caches.match(fallback);
      if (fallbackResponse) return fallbackResponse;
    }
    return Response.error();
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  event.respondWith(networkFirst(request));
});
