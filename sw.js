/*
 * Service Worker: erlaubt die Nutzung ohne Netz (z. B. am Prüfungstag).
 * Strategie „Netz zuerst“: Online kommt immer der aktuelle Stand,
 * nur ohne Verbindung wird die zuletzt geladene Fassung verwendet.
 */
const CACHE = 'ba-karten-cache-v1';
const KERN = [
  './',
  'index.html',
  'assets/style.css',
  'assets/app.js',
  'assets/icon.svg',
  'manifest.webmanifest',
  'data/index.json'
];

async function vorladen() {
  const cache = await caches.open(CACHE);
  await cache.addAll(KERN);
  try {
    const meta = await (await fetch('data/index.json', { cache: 'no-cache' })).json();
    await cache.addAll((meta.stapel || []).map(datei => 'data/' + datei));
  } catch (e) { /* Stapel werden beim ersten Laden nachgeholt */ }
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(vorladen().catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const anfrage = event.request;
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const antwort = await fetch(anfrage);
      if (antwort.ok) {
        const kopie = antwort.clone();
        caches.open(CACHE).then(cache => cache.put(anfrage, kopie));
      }
      return antwort;
    } catch (e) {
      const treffer = await caches.match(anfrage, { ignoreSearch: true });
      if (treffer) return treffer;
      if (anfrage.mode === 'navigate') return caches.match('index.html');
      throw e;
    }
  })());
});
