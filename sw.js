const CACHE = 'ft-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/app.js',
  './js/local-store.js',
  './js/schema.js',
  './js/settings.js',
  './js/sync.js',
  './js/format.js',
  './js/export.js',
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
  const url = e.request.url;

  // Never intercept cross-origin requests — let browser handle natively
  // This is critical for GitHub API (PUT/GET with auth headers must not go through SW)
  if (!url.startsWith(self.location.origin)) return;

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
