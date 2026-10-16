const CACHE = 'ft-v4.0';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/icons.js',
  './js/app.js',
  './js/local-store.js',
  './js/schema.js',
  './js/settings.js',
  './js/sync.js',
  './js/supabase-client.js',
  './js/format.js',
  './js/export.js',
  './js/habit-engine.js',
  './js/slip-parser.js',
  './js/subscriptions.js',
  './js/pages/dashboard.js',
  './js/pages/transactions.js',
  './js/pages/budget.js',
  './js/pages/analytics.js',
  './js/pages/accounts.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const reqUrl = new URL(e.request.url);

  // Cache static CDN libraries (Chart.js, xlsx-js-style, Google Fonts) for offline support
  const isCdn = reqUrl.hostname === 'cdn.jsdelivr.net' ||
                reqUrl.hostname === 'fonts.googleapis.com' ||
                reqUrl.hostname === 'fonts.gstatic.com';

  if (isCdn) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request)
          .then(res => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then(c => c.put(e.request, clone));
            }
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // Never intercept other cross-origin requests — let browser handle natively (critical for GitHub API)
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Network-first for same-origin app files so updates propagate immediately
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
