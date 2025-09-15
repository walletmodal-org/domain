const CACHE_NAME = 'autotradebot-v1';
const API_CACHE = 'api-cache-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app-logo.png',
  'https://cdn.tailwindcss.com',
  'https://s3.tradingview.com/tv.js',
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      c.addAll(APP_SHELL)
    )
  );
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k=>!k.startsWith('autotradebot-')&&!k.startsWith('api-cache')).map(k=>caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (/coingecko\.com\/api|tradingview/i.test(url)) {
    // network first, fallback to cache
    e.respondWith(
      fetch(e.request).then(resp => {
        return caches.open(API_CACHE).then(c => { c.put(e.request, resp.clone()); return resp; });
      }).catch(() => caches.open(API_CACHE).then(c=>c.match(e.request)))
    );
  } else if (APP_SHELL.some(path => url.includes(path))) {
    // cache first
    e.respondWith(
      caches.match(e.request).then(resp => resp || fetch(e.request))
    );
  }
});
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});