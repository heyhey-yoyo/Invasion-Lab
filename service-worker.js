const CACHE = 'iwt-static-v1.0.1-upgrade-2';
const CORE = [
  './',
  './index.html',
  './styles.css?v=a95201181efb',
  './app.js?v=1.0.1-upgrade-2',
  './simulation/model.js?v=1.0.1-upgrade-2',
  './simulation/versions.js?v=1.0.1-upgrade-2',
  './simulation/profiles.js?v=1.0.1-upgrade-2',
  './simulation/interventions.js?v=1.0.1-upgrade-2',
  './simulation/comparison.js?v=1.0.1-upgrade-2',
  './simulation/comparison-worker.js?v=1.0.1-upgrade-2',
  './simulation/config.js?v=1.0.1-upgrade-2',
  './simulation/outcomes.js?v=1.0.1-upgrade-2',
  './simulation/engine.js?v=1.0.1-upgrade-2',
  './simulation/batch.js?v=1.0.1-upgrade-2',
  './simulation/batch-worker.js?v=1.0.1-upgrade-2',
  './simulation/worker-runtime.js?v=1.0.1-upgrade-2',
  './simulation/worker.js?v=1.0.1-upgrade-2',
  './simulation/core/hash.js?v=1.0.1-upgrade-2',
  './simulation/core/rng.js?v=1.0.1-upgrade-2',
  './simulation/core/components.js?v=1.0.1-upgrade-2',
  './simulation/core/deformable-cell.js?v=1.0.1-upgrade-2',
  './simulation/core/guidance-field.js?v=1.0.1-upgrade-2',
  './simulation/core/ecm-field.js?v=1.0.1-upgrade-2',
  './simulation/core/spatial-hash.js?v=1.0.1-upgrade-2',
  './simulation/scenarios/catalog.js?v=1.0.1-upgrade-2',
  './assets/icon.svg',
  './assets/project-mark.svg',
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
      .then(cache => cache.addAll(CORE.map(url => new Request(url, { cache: 'reload' }))))
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
