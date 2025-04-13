// Version du cache - à incrémenter à chaque déploiement majeur
const CACHE_VERSION = 'v1';
const CACHE_NAME = `buyitnow-cache-${CACHE_VERSION}`;

// Ressources à mettre en cache lors de l'installation du service worker
const PRECACHE_RESOURCES = [
  '/',
  '/manifest.json',
  '/images/logo.png',
  '/images/default_product.png',
  '/images/default.png',
  '/offline.html',
  // CSS et JS principaux seront automatiquement précachés par Next.js
];

// Ressources qui ne doivent jamais être mises en cache
const NEVER_CACHE_RESOURCES = [
  '/api/',
  '/me',
  '/cart',
  '/shipping',
  '/address',
  '/login',
  '/register',
];

// Fonction de logging simplifiée qui n'affiche que les logs essentiels
const logLevel = self.registration.scope.includes('localhost')
  ? 'debug'
  : 'error';
const log = (level, message, data = {}) => {
  if (level === 'error' || logLevel === 'debug') {
    console[level](`[ServiceWorker] ${message}`, data);
  }
};

// Installation du service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_RESOURCES).catch((err) => {
          log('error', 'Échec lors de la mise en cache des ressources', err);
          throw err;
        });
      })
      .then(() => self.skipWaiting()),
  );
});

// Activation du service worker et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Supprimer tous les caches sauf le cache actuel
              return (
                cacheName.startsWith('buyitnow-cache-') &&
                cacheName !== CACHE_NAME
              );
            })
            .map((cacheName) => {
              return caches.delete(cacheName);
            }),
        );
      })
      .then(() => self.clients.claim())
      .catch((err) => {
        log('error', "Erreur lors de l'activation du service worker", err);
      }),
  );
});

// Gestion des requêtes
self.addEventListener('fetch', (event) => {
  // Ne pas intercepter les requêtes API ou d'authentification
  if (shouldNotCache(event.request.url)) {
    return;
  }

  // Stratégie pour les requêtes de navigations (HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // En cas d'échec (offline), afficher la page hors ligne
        return caches.match('/offline.html');
      }),
    );
    return;
  }

  // Stratégie Cache First pour les ressources statiques
  if (isStaticAsset(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Ressource trouvée dans le cache
          return cachedResponse;
        }

        // Ressource non trouvée dans le cache, la récupérer depuis le réseau
        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            // Mettre en cache la ressource récupérée
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            });
          })
          .catch((err) => {
            log(
              'error',
              `Échec de récupération de ressource: ${event.request.url}`,
              err,
            );
            throw err;
          });
      }),
    );
    return;
  }

  // Stratégie Network First pour les autres requêtes
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Mettre en cache la ressource récupérée
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Essayer de récupérer depuis le cache si le réseau échoue
        return caches.match(event.request);
      }),
  );
});

// Gestion des messages envoyés au service worker
self.addEventListener('message', (event) => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Fonction pour vérifier si une URL est une ressource statique
function isStaticAsset(url) {
  const fileExtension = url.split('.').pop().toLowerCase();
  const staticExtensions = [
    'js',
    'css',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'svg',
    'woff',
    'woff2',
    'ttf',
    'eot',
  ];

  return staticExtensions.includes(fileExtension);
}

// Fonction améliorée pour vérifier si une URL ne doit pas être mise en cache
function shouldNotCache(url) {
  const urlObj = new URL(url);
  return NEVER_CACHE_RESOURCES.some((resource) => {
    // Vérification plus stricte des chemins pour éviter les faux positifs
    const resourcePath = resource.endsWith('/') ? resource : `${resource}/`;
    return (
      urlObj.pathname === resource || urlObj.pathname.startsWith(resourcePath)
    );
  });
}
