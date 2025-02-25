// Enhanced Service Worker for Form Kiosk Application
const CACHE_NAME = 'kiosk-forms-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html', 
  '/transparent_white_logo.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Optional: Configure cache strategies for different request types
const CACHE_STRATEGIES = {
  cacheFirst: [
    // Static assets that rarely change
    '/transparent_white_logo.png',
    'https://fonts.googleapis.com'
  ],
  networkFirst: [
    // HTML and main application assets
    '/',
    '/index.html'
  ]
};

// Install event - Cache core static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Pre-caching offline assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch(error => {
        console.error('[Service Worker] Pre-cache error:', error);
      })
  );
  
  // Activate worker immediately
  self.skipWaiting();
});

// Activate event - Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log('[Service Worker] Removing old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      self.clients.claim();
    })
  );
});

// Fetch event - Handle network requests with appropriate caching strategies
self.addEventListener('fetch', event => {
  // Skip cross-origin requests to Microsoft Forms
  if (event.request.url.includes('forms.office.com') || 
      event.request.method !== 'GET') {
    return;
  }

  // Apply different caching strategies based on the request URL
  if (isMatchingPattern(event.request.url, CACHE_STRATEGIES.cacheFirst)) {
    // Cache First Strategy (for static assets)
    event.respondWith(cacheFirstStrategy(event.request));
  } else if (isMatchingPattern(event.request.url, CACHE_STRATEGIES.networkFirst)) {
    // Network First Strategy (for HTML and dynamic assets)
    event.respondWith(networkFirstStrategy(event.request));
  } else {
    // Default: Try network, fall back to cache
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          console.log('[Service Worker] Fallback to cache for:', event.request.url);
          return caches.match(event.request);
        })
    );
  }
});

// Cache-first strategy: Try cache, fall back to network
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    console.log('[Service Worker] Serving from cache:', request.url);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Cache-first fetch failed:', error);
    // Return an offline fallback if available
    return caches.match('/offline.html');
  }
}

// Network-first strategy: Try network, fall back to cache
async function networkFirstStrategy(request) {
  try {
    console.log('[Service Worker] Fetching from network:', request.url);
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network fetch failed, using cache for:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cache, try to return a basic offline page
    return caches.match('/offline.html');
  }
}

// Utility function to check if a URL matches any pattern in the array
function isMatchingPattern(url, patterns) {
  return patterns.some(pattern => url.includes(pattern));
}

// Create a periodic sync to refresh cached content (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'refresh-assets') {
    event.waitUntil(updateAssets());
  }
});

// Function to update cached assets
async function updateAssets() {
  const cache = await caches.open(CACHE_NAME);
  
  for (const url of ASSETS_TO_CACHE) {
    try {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) {
        await cache.put(url, response);
        console.log('[Service Worker] Updated cache for:', url);
      }
    } catch (error) {
      console.error('[Service Worker] Failed to update:', url, error);
    }
  }
}