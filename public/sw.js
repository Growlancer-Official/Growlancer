// Growlancer Service Worker
// Cache-first for static assets, network-first for API requests
const CACHE_NAME = 'growlancer-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Assets to cache on install (critical path)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Helper: is this a navigation request (HTML page)?
function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' &&
      request.headers.get('accept')?.includes('text/html'));
}

// Helper: is this an API/network-only request?
function isApiRequest(url) {
  const pathname = new URL(url).pathname;
  // Supabase REST API calls
  if (pathname.includes('/rest/v1/')) return true;
  // Supabase auth endpoints
  if (pathname.includes('/auth/v1/')) return true;
  // Supabase realtime
  if (pathname.includes('/realtime/v1/')) return true;
  // Edge functions
  if (pathname.includes('/functions/v1/')) return true;
  // PayPal / external APIs
  if (url.includes('paypal.com')) return true;
  if (url.includes('googleapis.com')) return true;
  return false;
}

// Helper: is this a static asset we should cache-first?
function isStaticAsset(url) {
  const pathname = new URL(url).pathname;
  // Vite-built assets have hash in filename
  if (pathname.startsWith('/assets/')) return true;
  // Known static extensions
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|json)$/i.test(pathname)) return true;
  return false;
}

// Fetch event - strategy based on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests for cache strategies
  // For cross-origin (like Google Fonts, PayPal), use network-only
  if (url.origin !== self.location.origin) {
    // For cross-origin, just pass through
    return;
  }

  // ---- API requests: Network-first ----
  if (isApiRequest(request.url)) {
    event.respondWith(networkFirstWithTimeout(request, 10000));
    return;
  }

  // ---- Navigation requests (HTML pages): Network-first ----
  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // ---- Static assets: Cache-first ----
  if (isStaticAsset(request.url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ---- Everything else: Network-first with cache fallback ----
  event.respondWith(networkFirst(request));
});

/**
 * Cache-first strategy: serve from cache, update in background
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Fire-and-forget update in background
    fetch(request).then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
      }
    }).catch(() => { /* ignore background update failures */ });
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // If both cache and network fail, return offline fallback for HTML
    if (isNavigationRequest(request)) {
      return caches.match('/');
    }
    throw error;
  }
}

/**
 * Network-first strategy: try network, fall back to cache
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

/**
 * Network-first with timeout for API calls
 */
async function networkFirstWithTimeout(request, timeoutMs) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Network timeout')), timeoutMs)
  );

  try {
    const response = await Promise.race([
      fetch(request.clone()),
      timeoutPromise,
    ]);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return a JSON error response for API requests
    return new Response(
      JSON.stringify({ error: 'You are offline. Please check your connection.' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Network-first for navigation with offline HTML fallback
 */
async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Ultimate fallback: return the cached root page
    const root = await caches.match('/');
    if (root) return root;
    // Minimum viable offline page
    return new Response(
      '<!doctype html><html><head><title>Offline - Growlancer</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0F172A;color:#E2E8F0;text-align:center;padding:2rem}h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#94A3B8}</style></head><body><div><h1>You\'re offline</h1><p>Please check your internet connection and try again.</p></div></body></html>',
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}