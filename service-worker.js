const CACHE_PREFIX = 'autotradebot';
const CACHE_VERSION = 'v2';
const CACHE_NAME = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`;
const API_CACHE = `${CACHE_PREFIX}-api-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;

// App shell resources to pre-cache
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app-logo.png',
  '/app-bot.js',
  'https://cdn.tailwindcss.com',
  'https://s3.tradingview.com/tv.js',
];

// Limits
const RUNTIME_MAX_ENTRIES = 60;
const API_MAX_ENTRIES = 100;

// Helper: Trim a cache to a maximum number of entries (LRU-ish behavior)
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  if (requests.length <= maxEntries) return;
  const deleteCount = requests.length - maxEntries;
  for (let i = 0; i < deleteCount; i++) {
    await cache.delete(requests[i]);
  }
}

// Create a minimal offline HTML response (so we don't have to pre-cache a file)
function offlinePage() {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Offline</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin:0; padding:2rem; }
          main { max-width: 720px; margin: 2rem auto; text-align:center; }
          img { max-width: 120px; opacity: .9; }
        </style>
      </head>
      <body>
        <main>
          <img src="/app-logo.png" alt="App logo" />
          <h1>You're offline</h1>
          <p>This application is offline. Some features may not be available.</p>
        </main>
      </body>
    </html>
  `.trim();
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const c = await caches.open(CACHE_NAME);
      // Use addAll but catch failures so the service worker can still install if an external asset is momentarily unavailable
      try {
        await c.addAll(APP_SHELL);
      } catch (err) {
        // If some asset fails to cache, still continue; missing assets will be fetched at runtime
        console.warn('Some app shell assets failed to cache during install:', err);
      }
      // Ensure next SW activates immediately if requested
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Keep only caches that belong to this service worker and match the current version
      const expected = [CACHE_NAME, API_CACHE, RUNTIME_CACHE];
      await Promise.all(
        keys.map((key) => {
          if (!expected.includes(key) && key.startsWith(CACHE_PREFIX)) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests in caching logic
  if (req.method !== 'GET') {
    return; // let the network handle non-GET
  }

  // API network-first strategy for Coingecko or TradingView
  if (/coingecko\.com\/api|tradingview/i.test(req.url)) {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(req);
          // Store a cloned copy in the API cache
          const cache = await caches.open(API_CACHE);
          try {
            await cache.put(req, networkResp.clone());
            // Trim API cache
            trimCache(API_CACHE, API_MAX_ENTRIES).catch(() => {});
          } catch (err) {
            // Some responses (opaque) may fail to put; ignore
          }
          return networkResp;
        } catch (err) {
          // Network failed, try cache
          const cache = await caches.open(API_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          // Fallback to a generic response for APIs if needed
          return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })()
    );
    return;
  }

  // App shell assets: cache-first
  if (APP_SHELL.some(path => {
    // match absolute and relative; include hostless root paths
    try {
      // If path is external (starts with http), check equality with full URL
      if (/^https?:\/\//i.test(path)) return req.url === path;
      // otherwise check if URL pathname ends with the path or includes it
      return url.pathname === path || req.url.includes(path);
    } catch {
      return false;
    }
  })) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkResp) => {
          // Optionally cache it in shell cache for future (if same-origin)
          if (url.origin === location.origin) {
            caches.open(CACHE_NAME).then(cache => {
              try { cache.put(req, networkResp.clone()); } catch (e) {}
            });
          }
          return networkResp;
        }).catch(() => {
          // If navigation or HTML, return offline page
          if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
            return offlinePage();
          }
          // as a last resort, try cache match again
          return caches.match(req);
        });
      })
    );
    return;
  }

  // Navigation (HTML) requests: network-first with offline fallback
  if (req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(req);
          // Cache HTML in runtime cache (optional)
          const cache = await caches.open(RUNTIME_CACHE);
          try { cache.put(req, networkResp.clone()); } catch (e) {}
          trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES).catch(() => {});
          return networkResp;
        } catch (err) {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          // Try app shell index.html
          const shell = await caches.match('/index.html');
          if (shell) return shell;
          // Final fallback: in-code offline page
          return offlinePage();
        }
      })()
    );
    return;
  }

  // Other GET requests: stale-while-revalidate (respond from cache, update in background)
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const networkFetch = fetch(req).then((networkResponse) => {
        // Only cache if response is ok or opaque (e.g., cross-origin)
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          try { cache.put(req, networkResponse.clone()); } catch (e) {}
        }
        return networkResponse;
      }).catch(() => null);

      // Return cached immediately if present, otherwise wait for network
      if (cached) {
        // Update cache in background
        event.waitUntil(networkFetch.then(() => trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES)).catch(() => {}));
        return cached;
      }
      const netResp = await networkFetch;
      if (netResp) return netResp;

      // As a last fallback for images or fonts, try shell cache
      const fallback = await caches.match(req);
      if (fallback) return fallback;

      // No resource available
      return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
    })()
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  const { type } = event.data;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      })()
    );
  } else if (type === 'DOWNLOAD_OFFLINE') {
    // Ensure APP_SHELL is cached for offline use
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        for (const resource of APP_SHELL) {
          try {
            // Use add if you want to fail on error; here we fetch and put so we can continue on single failures
            const request = new Request(resource);
            const response = await fetch(request);
            if (response && response.ok) {
              await cache.put(request, response.clone());
            }
          } catch (err) {
            // ignore single resource failures
          }
        }
      })()
    );
  }
});
