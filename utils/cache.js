/**
 * Configuration et utilitaires pour la gestion du cache utilisant la bibliothèque lru-cache
 */

import { LRUCache } from 'lru-cache';
import { compress, decompress } from 'lz-string';
import { captureException } from '@/monitoring/sentry';
import { memoizeWithTTL } from '@/utils/performance';

// Configuration du cache pour les différentes ressources
export const CACHE_CONFIGS = {
  // Durée de cache pour les produits (3 heures)
  products: {
    maxAge: 3 * 60 * 60,
    staleWhileRevalidate: 60 * 60,
  },
  // Configuration spécifique pour un seul produit
  singleProduct: {
    maxAge: 5 * 60 * 60, // 5 heures (durée plus longue car les détails d'un produit changent moins fréquemment)
    staleWhileRevalidate: 2 * 60 * 60, // 2 heures (période plus longue de revalidation en arrière-plan)
    sMaxAge: 12 * 60 * 60, // 12 heures pour les CDN/proxies partagés
    immutable: false, // Non immutable car le produit peut être mis à jour
    mustRevalidate: false, // Permet l'utilisation de contenus périmés en cas de problèmes réseau
  },
  // Durée de cache pour les catégories (2 jours)
  categories: {
    maxAge: 2 * 24 * 60 * 60,
    staleWhileRevalidate: 24 * 60 * 60,
  },
  // Configuration pour les adresses utilisateur (5 minutes)
  addresses: {
    maxAge: 5 * 60, // 5 minutes car les adresses peuvent être modifiées fréquemment
    staleWhileRevalidate: 60, // 1 minute de revalidation en arrière-plan
    sMaxAge: 10 * 60, // 10 minutes pour les CDN/proxies partagés
    immutable: false, // Non immutable car les adresses peuvent être mises à jour
    mustRevalidate: true, // Doit revalider car les données sont sensibles pour la livraison
  },
  // Configuration pour les détails d'une adresse spécifique (5 minutes)
  addressDetail: {
    maxAge: 5 * 60, // 5 minutes comme pour les listes d'adresses
    staleWhileRevalidate: 60, // 1 minute de revalidation en arrière-plan
    sMaxAge: 10 * 60, // 10 minutes pour les CDN/proxies partagés
    immutable: false, // Non immutable car l'adresse peut être mise à jour
    mustRevalidate: true, // Doit revalider car les données sont sensibles
  },
  // Durée de cache pour les pages statiques (1 jour)
  staticPages: {
    maxAge: 24 * 60 * 60,
    staleWhileRevalidate: 60 * 60,
  },
  // Durée de cache pour les ressources statiques (1 semaine)
  staticAssets: {
    maxAge: 7 * 24 * 60 * 60,
    immutable: true,
  },
  // Pas de cache pour les données utilisateur
  userData: {
    noStore: true,
  },
};

/**
 * Génère les entêtes de cache pour Next.js
 * @param {string} resourceType - Type de ressource ('products', 'categories', etc.)
 * @returns {Object} - Les entêtes de cache pour Next.js
 */
export function getCacheHeaders(resourceType) {
  const config = CACHE_CONFIGS[resourceType] || CACHE_CONFIGS.staticPages;

  if (config.noStore) {
    return {
      'Cache-Control': 'no-store',
    };
  }

  let cacheControl = `max-age=${config.maxAge}`;

  if (config.staleWhileRevalidate) {
    cacheControl += `, stale-while-revalidate=${config.staleWhileRevalidate}`;
  }

  if (config.immutable) {
    cacheControl += ', immutable';
  }

  return {
    'Cache-Control': cacheControl,
  };
}

// Implémentation minimaliste d'un EventEmitter compatible avec le navigateur et Node.js
export const cacheEvents = (() => {
  const listeners = {};

  return {
    on(event, callback) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(callback);
      return this;
    },

    emit(event, data) {
      if (listeners[event]) {
        listeners[event].forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Event error: ${error.message}`);
          }
        });
      }
      return this;
    },

    off(event, callback) {
      if (!listeners[event]) return this;

      if (callback) {
        listeners[event] = listeners[event].filter((cb) => cb !== callback);
      } else {
        delete listeners[event];
      }

      return this;
    },

    once(event, callback) {
      const onceCallback = (data) => {
        this.off(event, onceCallback);
        callback(data);
      };

      return this.on(event, onceCallback);
    },
  };
})();

/**
 * Fonction utilitaire pour journaliser les erreurs de cache
 * @param {Object} instance - Instance de cache
 * @param {string} operation - Opération qui a échoué
 * @param {string} key - Clé concernée
 * @param {Error} error - Erreur survenue
 */
function logCacheError(instance, operation, key, error) {
  const log = instance.log || console.debug;

  log(`Cache error during ${operation} for key '${key}': ${error.message}`);

  // Log plus détaillé pour le développement
  if (process.env.NODE_ENV !== 'production') {
    log(error);
  }

  // Capturer l'exception pour Sentry en production
  if (
    process.env.NODE_ENV === 'production' &&
    typeof captureException === 'function'
  ) {
    captureException(error, {
      tags: {
        component: 'cache',
        operation,
      },
      extra: {
        key,
        cacheInfo: {
          size: instance.size || 0,
          calculatedSize: instance.calculatedSize || 0,
          maxSize: instance.maxSize || 0,
        },
      },
    });
  }
}

/**
 * Sérialise une valeur pour le stockage avec compression optionnelle
 * @param {any} value - Valeur à sérialiser
 * @param {boolean} useCompression - Si true, compresse les grandes valeurs
 * @returns {Object} Objet avec la valeur et métadonnées
 * @throws {Error} Si la valeur ne peut pas être sérialisée/compressée
 */
function serializeValue(value, useCompression = false) {
  try {
    const serialized = JSON.stringify(value);
    const size = serialized.length;

    // Compression pour les grandes valeurs
    if (useCompression && size > 10000) {
      // 10KB seuil
      const compressed = compress(serialized);
      return {
        value: compressed,
        originalSize: size,
        compressed: true,
        size: compressed.length,
      };
    }

    return { value: serialized, size, compressed: false };
  } catch (error) {
    throw new Error(`Failed to serialize cache value: ${error.message}`);
  }
}

/**
 * Désérialise une valeur du cache
 * @param {Object} storedData - Données stockées
 * @returns {any} Valeur désérialisée
 * @throws {Error} Si la valeur ne peut pas être désérialisée
 */
function deserializeValue(storedData) {
  try {
    if (!storedData) return null;

    const value = storedData.compressed
      ? decompress(storedData.value)
      : storedData.value;

    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Failed to deserialize cache value: ${error.message}`);
  }
}

/**
 * Classe utilitaire pour gérer un cache avec lru-cache, compatible avec l'API précédente
 */
export class MemoryCache {
  /**
   * Crée une nouvelle instance du cache
   * @param {Object|number} options - Options de configuration ou TTL
   */
  constructor(options = {}) {
    const opts = typeof options === 'number' ? { ttl: options } : options;

    const {
      ttl = 60 * 1000,
      maxSize = 1000,
      maxBytes = 50 * 1024 * 1024, // 50MB
      logFunction = console.debug,
      compress = false,
      name = 'memory-cache',
    } = opts;

    this.ttl = ttl;
    this.maxSize = maxSize;
    this.maxBytes = maxBytes;
    this.log = logFunction;
    this.compress = compress;
    this.name = name;
    this.cleanupIntervalId = null;
    this.currentBytes = 0;
    this.locks = new Map();

    // Initialisation du cache LRU
    this.cache = new LRUCache({
      max: maxSize,
      ttl: ttl,
      // Fonction de calcul de taille pour respecter maxBytes
      sizeCalculation: (value, key) => {
        return value.data?.size || 0;
      },
      maxSize: maxBytes, // Taille maximale en octets
      allowStale: false,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      // Événements
      disposeAfter: (value, key) => {
        // Mise à jour du compteur de bytes après suppression
        if (value.data?.size) {
          this.currentBytes -= value.data.size;
        }
        cacheEvents.emit('delete', { key, cache: this });
      },
    });

    // Démarrer le nettoyage périodique
    this._startCleanupInterval();
  }

  /**
   * Obtenir une valeur du cache avec verrouillage pour les opérations concurrentes
   * @param {string} key - Clé de cache
   * @returns {Promise<any>} - Valeur en cache ou null si absente/expirée
   */
  async getWithLock(key) {
    if (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let resolver;
    const lock = new Promise((resolve) => {
      resolver = resolve;
    });
    this.locks.set(key, lock);

    try {
      return this.get(key);
    } finally {
      this.locks.delete(key);
      resolver();
    }
  }

  /**
   * Obtenir une valeur du cache
   * @param {string} key - Clé de cache
   * @returns {any|null} - Valeur en cache ou null si absente/expirée
   */
  get(key) {
    try {
      const entry = this.cache.get(key);

      if (!entry) {
        cacheEvents.emit('miss', { key, cache: this });
        return null;
      }

      cacheEvents.emit('hit', { key, cache: this });
      return deserializeValue(entry.data);
    } catch (error) {
      logCacheError(this, 'get', key, error);
      cacheEvents.emit('error', { error, operation: 'get', key, cache: this });
      return null;
    }
  }

  /**
   * Mettre une valeur en cache
   * @param {string} key - Clé de cache
   * @param {any} value - Valeur à mettre en cache
   * @param {Object|number} options - Options ou durée de vie personnalisée
   * @returns {boolean} - True si l'opération a réussi
   */
  set(key, value, options = {}) {
    try {
      // Validation de la clé
      if (!key || typeof key !== 'string') {
        throw new Error('Invalid cache key');
      }

      // Nettoyer les options
      const opts = typeof options === 'number' ? { ttl: options } : options;
      const ttl = opts.ttl || this.ttl;
      const compress =
        opts.compress !== undefined ? opts.compress : this.compress;

      // Sérialiser la valeur
      const serialized = serializeValue(value, compress);

      // Vérifier la taille
      if (serialized.size > this.maxBytes * 0.1) {
        // Une entrée ne doit pas dépasser 10% du cache
        this.log(`Cache entry too large: ${key} (${serialized.size} bytes)`);
        return false;
      }

      // Si la clé existe déjà, soustraire sa taille actuelle
      const existingEntry = this.cache.get(key);
      if (existingEntry?.data?.size) {
        this.currentBytes -= existingEntry.data.size;
      }

      // Ajouter au cache avec TTL spécifique
      const entry = {
        data: serialized,
        lastAccessed: Date.now(),
      };

      this.cache.set(key, entry, {
        ttl: ttl,
        size: serialized.size,
      });

      // Mettre à jour la taille totale
      this.currentBytes += serialized.size;

      cacheEvents.emit('set', { key, size: serialized.size, cache: this });
      return true;
    } catch (error) {
      logCacheError(this, 'set', key, error);
      cacheEvents.emit('error', { error, operation: 'set', key, cache: this });
      return false;
    }
  }

  /**
   * Supprimer une valeur du cache
   * @param {string} key - Clé de cache
   * @returns {boolean} - True si la valeur existait
   */
  delete(key) {
    try {
      const hadKey = this.cache.has(key);
      this.cache.delete(key);
      return hadKey;
    } catch (error) {
      logCacheError(this, 'delete', key, error);
      return false;
    }
  }

  /**
   * Vider tout le cache
   * @returns {boolean} - True si l'opération a réussi
   */
  clear() {
    try {
      this.cache.clear();
      this.currentBytes = 0;
      cacheEvents.emit('clear', { cache: this });
      return true;
    } catch (error) {
      logCacheError(this, 'clear', 'all', error);
      return false;
    }
  }

  /**
   * Obtenir la taille du cache
   * @returns {Object} - Statistiques de taille du cache
   */
  size() {
    return {
      entries: this.cache.size,
      bytes: this.currentBytes,
      maxEntries: this.maxSize,
      maxBytes: this.maxBytes,
      utilization: Math.round((this.currentBytes / this.maxBytes) * 100) / 100,
    };
  }

  /**
   * Supprimer toutes les entrées correspondant à un pattern
   * @param {RegExp|string} pattern - Pattern de clé à supprimer
   * @returns {number} - Nombre d'entrées supprimées
   */
  invalidatePattern(pattern) {
    try {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      const keysToDelete = [];

      // Collecter d'abord les clés pour éviter de modifier pendant l'itération
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      }

      // Supprimer les clés collectées
      keysToDelete.forEach((key) => this.delete(key));

      cacheEvents.emit('invalidatePattern', {
        pattern: pattern.toString(),
        count: keysToDelete.length,
        cache: this,
      });

      return keysToDelete.length;
    } catch (error) {
      logCacheError(this, 'invalidatePattern', pattern.toString(), error);
      return 0;
    }
  }

  /**
   * Nettoie les entrées expirées du cache
   * LRU-cache gère automatiquement les expirations, mais cette méthode est conservée
   * pour la compatibilité avec l'API précédente
   * @returns {number} - Nombre d'entrées nettoyées (toujours 0, car lru-cache gère l'expiration automatiquement)
   */
  cleanup() {
    try {
      // LRU Cache gère déjà automatiquement l'expiration
      // Forcer la suppression des entrées périmées
      this.cache.purgeStale();
      return 0;
    } catch (error) {
      logCacheError(this, 'cleanup', 'all', error);
      return 0;
    }
  }

  /**
   * Démarre l'intervalle de nettoyage automatique
   * @private
   */
  _startCleanupInterval() {
    if (typeof setInterval !== 'undefined' && !this.cleanupIntervalId) {
      // Nettoyer toutes les 5 minutes
      this.cleanupIntervalId = setInterval(
        () => {
          this.cleanup();
        },
        5 * 60 * 1000,
      );

      // Assurer que l'intervalle ne bloque pas le garbage collector
      if (
        this.cleanupIntervalId &&
        typeof this.cleanupIntervalId === 'object'
      ) {
        this.cleanupIntervalId.unref?.();
      }
    }
  }

  /**
   * Arrête l'intervalle de nettoyage automatique
   */
  stopCleanupInterval() {
    if (this.cleanupIntervalId && typeof clearInterval !== 'undefined') {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * S'assure que les ressources sont libérées lors de la destruction
   */
  destroy() {
    this.stopCleanupInterval();
    this.clear();
  }

  /**
   * Récupère en cache si disponible, sinon exécute la fonction et met en cache
   * @param {string} key - Clé de cache
   * @param {Function} fn - Fonction à exécuter si cache manquant
   * @param {Object} options - Options de cache
   * @returns {Promise<any>} - Valeur en cache ou résultat de la fonction
   */
  async getOrSet(key, fn, options = {}) {
    const cachedValue = this.get(key);
    if (cachedValue !== null) {
      return cachedValue;
    }

    try {
      const result = await Promise.resolve(fn());
      this.set(key, result, options);
      return result;
    } catch (error) {
      logCacheError(this, 'getOrSet', key, error);
      throw error;
    }
  }
}

/**
 * Fonction utilitaire pour obtenir une clé de cache canonique
 * @param {string} prefix - Préfixe de la clé
 * @param {Object} params - Paramètres pour générer la clé
 * @returns {string} - Clé de cache unique
 */
export function getCacheKey(prefix, params = {}) {
  // Vérifier et nettoyer les entrées pour la sécurité
  const cleanParams = {};

  for (const [key, value] of Object.entries(params)) {
    // Ignorer les valeurs nulles ou undefined
    if (value === undefined || value === null) continue;

    // Éviter les injections en supprimant les caractères spéciaux
    const cleanKey = String(key).replace(/[^a-zA-Z0-9_-]/g, '');
    let cleanValue;

    // Traiter différemment selon le type
    if (typeof value === 'object') {
      cleanValue = JSON.stringify(value);
    } else {
      cleanValue = String(value);
    }

    // Limiter la taille des valeurs pour éviter des clés trop longues
    if (cleanValue.length > 100) {
      cleanValue = cleanValue.substring(0, 97) + '...';
    }

    cleanParams[cleanKey] = encodeURIComponent(cleanValue);
  }

  // Trier les paramètres pour garantir l'unicité
  const sortedParams = Object.keys(cleanParams)
    .sort()
    .map((key) => `${key}=${cleanParams[key]}`)
    .join('&');

  // Préfixe validé
  const safePrefix = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '');

  return `${safePrefix}:${sortedParams || 'default'}`;
}

/**
 * Crée une fonction memoizée avec intégration du système de cache
 * Combine les fonctionnalités de memoizeWithTTL et lru-cache
 * @param {Function} fn - Fonction à mettre en cache
 * @param {Object} options - Options de cache
 * @returns {Function} - Fonction mise en cache
 */
export function createCachedFunction(fn, options = {}) {
  const {
    ttl = 60 * 1000,
    maxEntries = 100,
    keyGenerator = (...args) => JSON.stringify(args),
    name = fn.name || 'anonymous',
  } = options;

  // Vérifier si memoizeWithTTL est disponible
  if (typeof memoizeWithTTL === 'function') {
    // Utiliser la fonction de performance.js si disponible
    return memoizeWithTTL(fn, ttl);
  }

  // Créer un cache dédié pour cette fonction
  const functionCache = new MemoryCache({
    ttl,
    maxSize: maxEntries,
    name: `function-${name}`,
    logFunction: (msg) => console.debug(`[CachedFn:${name}] ${msg}`),
  });

  // Créer la fonction enveloppante
  return async function (...args) {
    try {
      const cacheKey = keyGenerator(...args);

      // Vérifier le cache
      const cachedResult = functionCache.get(cacheKey);
      if (cachedResult !== null) {
        return cachedResult;
      }

      // Exécuter la fonction
      const result = await Promise.resolve(fn.apply(this, args));

      // Mettre en cache
      functionCache.set(cacheKey, result);

      return result;
    } catch (error) {
      logCacheError(functionCache, 'execution', fn.name, error);
      throw error;
    }
  };
}

// Instances de cache pour l'application avec les configurations améliorées
export const appCache = {
  products: new MemoryCache({
    ttl: CACHE_CONFIGS.products.maxAge * 1000,
    maxSize: 500,
    compress: true,
    name: 'products',
    logFunction: (msg) => console.debug(`[ProductCache] ${msg}`),
  }),

  // Nouveau cache spécifique pour les produits individuels
  singleProducts: new MemoryCache({
    ttl: CACHE_CONFIGS.singleProduct.maxAge * 1000,
    maxSize: 1000, // Plus d'entrées car chaque produit est une entrée distincte
    compress: true,
    name: 'single-products',
    logFunction: (msg) => console.debug(`[SingleProductCache] ${msg}`),
  }),

  categories: new MemoryCache({
    ttl: CACHE_CONFIGS.categories.maxAge * 1000,
    maxSize: 100,
    name: 'categories',
    logFunction: (msg) => console.debug(`[CategoryCache] ${msg}`),
  }),

  addresses: new MemoryCache({
    ttl: CACHE_CONFIGS.addresses.maxAge * 1000, // Utilise la configuration centralisée
    maxSize: 200,
    compress: false,
    name: 'addresses',
    logFunction: (msg) => console.debug(`[AddressCache] ${msg}`),
  }),
};

// Enregistrer un handler pour nettoyer les caches à l'arrêt de l'application
if (typeof process !== 'undefined' && process.on) {
  process.on('SIGTERM', () => {
    Object.values(appCache).forEach((cache) => {
      if (cache && typeof cache.destroy === 'function') {
        cache.destroy();
      }
    });
  });
}
