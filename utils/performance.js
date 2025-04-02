/**
 * Utilitaires pour améliorer les performances de l'application
 * Version optimisée pour environnement de production
 */
import { captureException } from '@/monitoring/sentry';

// Vérification d'environnement pour SSR (Server-Side Rendering)
const isBrowser = typeof window !== 'undefined';
const isProduction = process.env.NODE_ENV === 'production';

// Configuration par défaut des utilitaires de performance
const DEFAULT_CONFIG = {
  // Configuration memoize
  memoize: {
    defaultTTL: 60000, // 1 minute
    maxCacheSize: 100, // nombre maximum d'entrées
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
  },
  // Configuration du throttling
  throttle: {
    defaultLimit: 300, // ms
    errorLimit: 3, // nombre d'erreurs avant désactivation
  },
  // Configuration debounce
  debounce: {
    defaultDelay: 300, // ms
  },
  // Configuration du préchargement
  preload: {
    timeout: 10000, // 10 secondes
    maxConcurrent: 5, // nombre d'images chargées simultanément
    retryAttempts: 2, // tentatives de réessai
    retryDelay: 1000, // délai entre les tentatives
  },
  // Configuration de détection de réseau
  network: {
    slowThreshold: 0.5, // Mbps
    checkInterval: 60000, // vérification toutes les minutes
  },
};

// État global pour le suivi des performances
const performanceState = {
  isSlowConnection: null,
  networkType: null,
  reducedMotionPreferred: null,
  dataSaverEnabled: null,
  // Cache LRU pour les métriques récentes
  recentMetrics: new Map(),
  disabledFeatures: new Set(),
};

/**
 * Utilitaire de logging sécurisé
 * @param {string} level - Niveau de log (debug, info, warn, error)
 * @param {string} context - Contexte du message
 * @param {string} message - Message principal
 * @param {Object} [data] - Données additionnelles
 */
function safeLog(level, context, message, data = {}) {
  // Ignorer les logs de debug en production
  if (level === 'debug' && isProduction) {
    return;
  }

  if (isBrowser && typeof console !== 'undefined' && console[level]) {
    try {
      console[level](`[${context}] ${message}`, data);

      // En cas d'erreur critique, envoyer à Sentry en production
      if (level === 'error' && isProduction) {
        captureException(data instanceof Error ? data : new Error(message));
      }
    } catch (e) {
      // Fail silently
    }
  }
}

/**
 * Valide une valeur d'entrée pour prévenir des erreurs
 * @param {any} value - Valeur à valider
 * @param {string} expectedType - Type attendu
 * @param {any} defaultValue - Valeur par défaut en cas d'invalidité
 * @returns {any} - Valeur validée ou valeur par défaut
 */
function validateInput(value, expectedType, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const actualType = typeof value;

  if (expectedType === 'array' && Array.isArray(value)) {
    return value;
  }

  if (actualType === expectedType) {
    return value;
  }

  // Tentative de conversion pour certains types
  if (expectedType === 'number' && actualType === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  if (
    expectedType === 'boolean' &&
    (value === 0 || value === 1 || value === '0' || value === '1')
  ) {
    return value == 1 || value === '1';
  }

  // Log de l'erreur en développement
  if (!isProduction) {
    safeLog(
      'warn',
      'Validation',
      `Type invalide: attendu ${expectedType}, reçu ${actualType}`,
      {
        value,
        defaultValue,
      },
    );
  }

  return defaultValue;
}

/**
 * Génère une clé de cache unique et sûre pour les arguments donnés
 * @param {Array} args - Arguments à hasher
 * @returns {string} Clé de cache
 */
function generateCacheKey(args) {
  try {
    // Limitation de la taille des arguments pour éviter des problèmes de mémoire
    const safeArgs = args.map((arg) => {
      if (arg === null || arg === undefined) {
        return String(arg);
      }

      if (typeof arg === 'function') {
        return '[Function]';
      }

      if (typeof arg === 'object') {
        try {
          const str = JSON.stringify(arg);
          // Tronquer les objets trop grands
          return str.length > 1000 ? str.substring(0, 1000) + '...' : str;
        } catch (e) {
          return '[Complex Object]';
        }
      }

      return String(arg);
    });

    return safeArgs.join('::');
  } catch (e) {
    // Fallback en cas d'erreur
    return `args_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }
}

/**
 * Fonction pour memoizer (mettre en cache) les résultats avec durée de vie limitée
 * @param {Function} fn - La fonction à mettre en cache
 * @param {Object|number} options - Options ou durée TTL en millisecondes
 * @returns {Function} - La fonction mise en cache
 */
export function memoize(fn, options = {}) {
  const config =
    typeof options === 'number'
      ? { ttl: options }
      : { ...DEFAULT_CONFIG.memoize, ...options };

  const {
    ttl = DEFAULT_CONFIG.memoize.defaultTTL,
    maxSize = DEFAULT_CONFIG.memoize.maxCacheSize,
    cleanupInterval = DEFAULT_CONFIG.memoize.cleanupInterval,
    keyGenerator = generateCacheKey,
  } = config;

  // Validation de la fonction
  if (typeof fn !== 'function') {
    throw new Error('memoize: Premier argument doit être une fonction');
  }

  const cache = new Map();
  const timestamps = new Map();
  const accessLog = new Map(); // Pour LRU

  // Initialiser nettoyage périodique
  let cleanupTimer = null;

  if (isBrowser && typeof setInterval !== 'undefined' && cleanupInterval > 0) {
    cleanupTimer = setInterval(() => {
      cleanup();
    }, cleanupInterval);

    // Ne pas bloquer la fermeture du processus si Node.js
    if (typeof cleanupTimer.unref === 'function') {
      cleanupTimer.unref();
    }
  }

  // Fonction de nettoyage des entrées expirées
  function cleanup() {
    try {
      const now = Date.now();
      let expired = 0;

      for (const [key, timestamp] of timestamps.entries()) {
        if (now - timestamp > ttl) {
          cache.delete(key);
          timestamps.delete(key);
          accessLog.delete(key);
          expired++;
        }
      }

      // Si le cache a toujours trop d'entrées, supprimer les moins récemment utilisées
      if (cache.size > maxSize) {
        const sortedEntries = [...accessLog.entries()].sort(
          (a, b) => a[1] - b[1],
        );
        const toDelete = sortedEntries.slice(0, cache.size - maxSize);

        for (const [key] of toDelete) {
          cache.delete(key);
          timestamps.delete(key);
          accessLog.delete(key);
        }
      }

      if (expired > 0 && !isProduction) {
        safeLog(
          'debug',
          'Memoize',
          `Nettoyage: ${expired} entrées expirées supprimées, taille du cache: ${cache.size}`,
        );
      }
    } catch (error) {
      safeLog('error', 'Memoize', 'Erreur lors du nettoyage du cache', error);
    }
  }

  // Fonction memoizée
  const memoized = function (...args) {
    try {
      const key = keyGenerator(args);
      const now = Date.now();

      // Mise à jour du log d'accès pour LRU
      accessLog.set(key, now);

      // Si la valeur existe dans le cache et n'a pas expiré
      if (cache.has(key) && now - timestamps.get(key) < ttl) {
        return cache.get(key);
      }

      // Si le cache est plein et la clé n'existe pas, nettoyer d'abord
      if (!cache.has(key) && cache.size >= maxSize) {
        cleanup();
      }

      // Calculer le résultat
      const result = fn.apply(this, args);

      // Traiter différemment selon si c'est une promesse ou non
      if (result instanceof Promise) {
        return result
          .then((value) => {
            cache.set(key, value);
            timestamps.set(key, now);
            return value;
          })
          .catch((error) => {
            // Ne pas mettre en cache les erreurs
            throw error;
          });
      } else {
        // Résultats synchrones
        cache.set(key, result);
        timestamps.set(key, now);
        return result;
      }
    } catch (error) {
      safeLog(
        'error',
        'Memoize',
        "Erreur lors de l'exécution de la fonction memoizée",
        error,
      );
      // Si une erreur se produit, exécuter la fonction d'origine (sans cache)
      return fn.apply(this, args);
    }
  };

  // Méthodes pour manipuler le cache
  memoized.clear = () => {
    cache.clear();
    timestamps.clear();
    accessLog.clear();
  };

  memoized.size = () => cache.size;

  memoized.invalidate = (predicate) => {
    if (typeof predicate === 'function') {
      for (const [key, value] of cache.entries()) {
        if (predicate(value, key)) {
          cache.delete(key);
          timestamps.delete(key);
          accessLog.delete(key);
        }
      }
    }
  };

  // Nettoyage des ressources quand la fonction n'est plus utilisée
  if (!isBrowser && typeof process !== 'undefined' && process.on) {
    // Support pour Node.js
    const cleanup = () => {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
      memoized.clear();
    };

    // Nettoyage lors de la fermeture de l'application
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  return memoized;
}

// Pour rétrocompatibilité
export const memoizeWithTTL = memoize;

/**
 * Limite le nombre d'appels d'une fonction en retardant son exécution
 * @param {Function} fn - La fonction à debouncer
 * @param {Object|number} options - Options ou délai en millisecondes
 * @returns {Function} - La fonction debouncée
 */
export function debounce(fn, options = {}) {
  // Gérer l'option simple (nombre)
  const config =
    typeof options === 'number'
      ? { delay: options }
      : { ...DEFAULT_CONFIG.debounce, ...options };

  const {
    delay = DEFAULT_CONFIG.debounce.defaultDelay,
    leading = false,
    trailing = true,
    maxWait = null,
  } = config;

  if (typeof fn !== 'function') {
    throw new Error('debounce: Premier argument doit être une fonction');
  }

  // Pas de setTimeout en SSR
  if (!isBrowser) {
    return fn;
  }

  let timeoutId = null;
  let lastArgs = null;
  let lastThis = null;
  let lastCallTime = 0;
  let lastInvocationTime = 0;
  let result;

  // Vérifie si le temps d'attente max a été dépassé
  function shouldInvoke(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvocation = time - lastInvocationTime;

    return (
      lastCallTime === 0 ||
      timeSinceLastCall >= delay ||
      (maxWait !== null && timeSinceLastInvocation >= maxWait)
    );
  }

  // Invoque la fonction avec les arguments sauvegardés
  function invokeFunc(time) {
    const args = lastArgs;
    const thisArg = lastThis;

    // Réinitialiser
    lastArgs = lastThis = null;
    lastInvocationTime = time;

    result = fn.apply(thisArg, args);
    return result;
  }

  // Lance la fonction debouncée
  function leadingEdge(time) {
    lastInvocationTime = time;

    // Démarrer le timer pour l'invocation trailing
    timeoutId = setTimeout(timerExpired, delay);

    // Invoquer si leading=true
    return leading ? invokeFunc(time) : result;
  }

  // Fonction appelée quand le timer expire
  function timerExpired() {
    const time = Date.now();

    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }

    // Redémarrer le timer pour le temps restant
    timeoutId = setTimeout(timerExpired, delay);
  }

  // Appel final trailing
  function trailingEdge(time) {
    timeoutId = null;

    // Invoquer seulement si on a des args et trailing=true
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }

    lastArgs = lastThis = null;
    return result;
  }

  // Fonction debouncée
  function debounced(...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === null) {
        return leadingEdge(time);
      }

      if (maxWait !== null) {
        // Gérer les invocations en attente maximale
        timeoutId = setTimeout(timerExpired, delay);
        return invokeFunc(time);
      }
    }

    if (timeoutId === null) {
      timeoutId = setTimeout(timerExpired, delay);
    }

    return result;
  }

  // Ajouter des méthodes utilitaires
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = lastThis = null;
    lastCallTime = lastInvocationTime = 0;
  };

  debounced.flush = () => {
    return timeoutId === null ? result : trailingEdge(Date.now());
  };

  debounced.pending = () => timeoutId !== null;

  return debounced;
}

/**
 * Limite le nombre d'appels d'une fonction en l'exécutant à intervalles réguliers
 * @param {Function} fn - La fonction à throttler
 * @param {Object|number} options - Options ou limite en millisecondes
 * @returns {Function} - La fonction throttlée
 */
export function throttle(fn, options = {}) {
  const config =
    typeof options === 'number'
      ? { limit: options }
      : { ...DEFAULT_CONFIG.throttle, ...options };

  const {
    limit = DEFAULT_CONFIG.throttle.defaultLimit,
    trailing = true,
    leading = true,
    errorLimit = DEFAULT_CONFIG.throttle.errorLimit,
  } = config;

  if (typeof fn !== 'function') {
    throw new Error('throttle: Premier argument doit être une fonction');
  }

  // Pas de setTimeout en SSR
  if (!isBrowser) {
    return fn;
  }

  let lastCallTime = 0;
  let lastInvokeTime = 0;
  let timerId = null;
  let lastArgs = null;
  let lastThis = null;
  let lastResult;
  let errorCount = 0;
  let active = true;

  // Vérifier si une nouvelle invocation est possible
  function shouldInvoke(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === 0 || timeSinceLastCall >= limit || timeSinceLastCall < 0
    );
  }

  // Invoquer la fonction avec catch d'erreur
  function invokeFunc(time, args, thisArg) {
    lastInvokeTime = time;
    try {
      lastResult = fn.apply(thisArg, args);
      // Réinitialiser le compteur d'erreurs en cas de succès
      errorCount = 0;
      return lastResult;
    } catch (error) {
      errorCount++;
      safeLog(
        'error',
        'Throttle',
        `Erreur dans la fonction throttlée (${errorCount}/${errorLimit})`,
        error,
      );

      // Désactiver le throttle après trop d'erreurs
      if (errorCount >= errorLimit) {
        active = false;
        safeLog(
          'warn',
          'Throttle',
          "Trop d'erreurs, fonction throttlée désactivée",
        );
      }

      throw error;
    }
  }

  // Traiter le premier appel (leading edge)
  function leadingEdge(time) {
    lastInvokeTime = time;

    // Programmer un appel trailing si nécessaire
    if (trailing) {
      timerId = setTimeout(trailingEdge, limit);
    }

    // Exécuter si leading=true
    return leading ? invokeFunc(time, lastArgs, lastThis) : lastResult;
  }

  // Traiter l'appel final (trailing edge)
  function trailingEdge() {
    timerId = null;

    // Exécuter si trailing=true et si des arguments sont en attente
    if (trailing && lastArgs) {
      return invokeFunc(Date.now(), lastArgs, lastThis);
    }

    lastArgs = lastThis = null;
    return lastResult;
  }

  // Fonction throttlée principale
  function throttled(...args) {
    // Si désactivé après trop d'erreurs, exécuter directement
    if (!active) {
      return fn.apply(this, args);
    }

    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === null) {
        return leadingEdge(time);
      }

      // Si leading=false, programmer seulement l'appel trailing
      if (trailing) {
        timerId = setTimeout(trailingEdge, limit - (time - lastCallTime));
      }
    }

    return lastResult;
  }

  // Méthodes utilitaires
  throttled.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    lastCallTime = 0;
    lastInvokeTime = 0;
    lastArgs = lastThis = null;
  };

  throttled.flush = () => {
    return timerId === null ? lastResult : trailingEdge();
  };

  throttled.pending = () => {
    return timerId !== null;
  };

  throttled.reset = () => {
    errorCount = 0;
    active = true;
  };

  return throttled;
}

/**
 * Queue pour limiter le nombre de tâches concurrentes
 */
class TaskQueue {
  constructor(concurrency = 5) {
    this.concurrency = Math.max(1, concurrency);
    this.running = 0;
    this.queue = [];
  }

  add(task) {
    return new Promise((resolve, reject) => {
      // Ajouter à la queue
      this.queue.push({
        task,
        resolve,
        reject,
      });

      this.processQueue();
    });
  }

  processQueue() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    // Retirer le premier élément
    const item = this.queue.shift();
    this.running++;

    // Exécuter la tâche avec gestion des promesses
    Promise.resolve()
      .then(() => item.task())
      .then((result) => {
        this.running--;
        item.resolve(result);
        this.processQueue();
      })
      .catch((error) => {
        this.running--;
        item.reject(error);
        this.processQueue();
      });
  }

  get size() {
    return this.queue.length;
  }

  get active() {
    return this.running;
  }
}

// Queue globale pour les préchargements d'image - uniquement côté navigateur
const imageQueue = isBrowser
  ? new TaskQueue(DEFAULT_CONFIG.preload.maxConcurrent)
  : null;

/**
 * Charge une image à l'avance avec timeout et retry
 * @param {string} src - L'URL de l'image à charger
 * @param {Object} options - Options pour le chargement
 * @returns {Promise<HTMLImageElement>} - Une promesse qui se résout avec l'image chargée
 */
export function preloadImage(src, options = {}) {
  // Pas de préchargement en SSR
  if (!isBrowser) {
    return Promise.resolve(null);
  }

  const {
    timeout = DEFAULT_CONFIG.preload.timeout,
    retryAttempts = DEFAULT_CONFIG.preload.retryAttempts,
    retryDelay = DEFAULT_CONFIG.preload.retryDelay,
    priority = 'auto', // 'high', 'low', 'auto'
    crossOrigin = null, // 'anonymous', 'use-credentials'
  } = options;

  if (!src || typeof src !== 'string') {
    return Promise.reject(new Error("URL d'image invalide"));
  }

  // Fonction de préchargement à ajouter à la queue
  const preloadTask = (attempt = 0) => {
    return new Promise((resolve, reject) => {
      // Gérer le timeout
      let timeoutId = null;
      let isTimedOut = false;

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          isTimedOut = true;

          // Si on a encore des tentatives, réessayer
          if (attempt < retryAttempts) {
            safeLog(
              'warn',
              'Preload',
              `Timeout lors du chargement de l'image (${attempt + 1}/${retryAttempts + 1}): ${src}`,
            );

            setTimeout(() => {
              preloadTask(attempt + 1)
                .then(resolve)
                .catch(reject);
            }, retryDelay);
          } else {
            reject(new Error(`Timeout lors du chargement de l'image: ${src}`));
          }
        }, timeout);
      }

      const img = new Image();

      // Configurer les attributs optionnels
      if (crossOrigin) {
        img.crossOrigin = crossOrigin;
      }

      if (priority !== 'auto' && 'fetchPriority' in img) {
        img.fetchPriority = priority;
      }

      // Gestionnaires d'événements
      img.onload = () => {
        if (isTimedOut) return;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        resolve(img);
      };

      img.onerror = () => {
        if (isTimedOut) return;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Réessayer si on n'a pas dépassé le nombre de tentatives
        if (attempt < retryAttempts) {
          safeLog(
            'warn',
            'Preload',
            `Erreur lors du chargement de l'image (${attempt + 1}/${retryAttempts + 1}): ${src}`,
          );

          setTimeout(() => {
            preloadTask(attempt + 1)
              .then(resolve)
              .catch(reject);
          }, retryDelay);
        } else {
          reject(new Error(`Impossible de charger l'image: ${src}`));
        }
      };

      // Définir src après les gestionnaires
      img.src = src;
    });
  };

  // Ajouter à la queue globale
  return imageQueue.add(() => preloadTask());
}

/**
 * Charge plusieurs images à l'avance avec gestion d'erreur sophistiquée
 * @param {Array<string|Object>} items - URLs des images ou objets de configuration
 * @param {Object} globalOptions - Options globales pour toutes les images
 * @returns {Promise<HTMLImageElement[]>} - Une promesse qui se résout quand toutes les images sont chargées
 */
export function preloadImages(items, globalOptions = {}) {
  // Pas de préchargement en SSR
  if (!isBrowser) {
    return Promise.resolve([]);
  }

  if (!Array.isArray(items) || items.length === 0) {
    return Promise.resolve([]);
  }

  // Récupérer les résultats même si certaines images échouent
  const loadPromises = items.map((item) => {
    // Déterminer src et options selon le format d'entrée
    const src = typeof item === 'string' ? item : item.src;
    const options =
      typeof item === 'object' ? { ...globalOptions, ...item } : globalOptions;

    // Wrapper pour capturer les erreurs et retourner null en cas d'échec
    return preloadImage(src, options).catch((error) => {
      safeLog('error', 'Preload', `Échec du préchargement: ${src}`, error);
      // Retourner null plutôt que de rejeter la promesse
      return null;
    });
  });

  return Promise.all(loadPromises).then((results) => {
    // Filtrer les résultats null (échecs)
    const loaded = results.filter((img) => img !== null);

    if (loaded.length < items.length) {
      safeLog(
        'warn',
        'Preload',
        `${loaded.length}/${items.length} images préchargées`,
      );
    }

    return loaded;
  });
}

/**
 * Fonction générique pour détecter les préférences utilisateur avec mise en cache des résultats
 * @param {string} name - Nom de la préférence
 * @param {Function} detector - Fonction de détection
 * @param {boolean} defaultValue - Valeur par défaut
 * @returns {boolean} - Valeur détectée ou par défaut
 */
function detectPreference(name, detector, defaultValue = false) {
  // Si pas de navigateur, retourner la valeur par défaut
  if (!isBrowser) {
    return defaultValue;
  }

  // Si déjà détecté, retourner la valeur en cache
  const stateKey = `${name}Preferred`;
  if (performanceState[stateKey] !== null) {
    return performanceState[stateKey];
  }

  try {
    const result = detector();
    performanceState[stateKey] = result;
    return result;
  } catch (error) {
    safeLog(
      'warn',
      'Preferences',
      `Erreur lors de la détection de ${name}`,
      error,
    );
    performanceState[stateKey] = defaultValue;
    return defaultValue;
  }
}

/**
 * Détecte si le navigateur est en mode préférence de réduction du mouvement
 * avec gestion d'erreur et cache du résultat
 * @returns {boolean} - true si le navigateur est en mode préférence de réduction du mouvement
 */
export function prefersReducedMotion() {
  return detectPreference(
    'reducedMotion',
    () => {
      return (
        isBrowser &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    },
    false,
  );
}

/**
 * Vérifier si le navigateur supporte NetworkInformation API
 * @returns {boolean} - true si l'API est supportée
 */
function hasNetworkInfoSupport() {
  return (
    isBrowser &&
    window.navigator &&
    typeof window.navigator.connection !== 'undefined'
  );
}

/**
 * Détecte si le navigateur est en mode data saver
 * avec gestion d'erreur et cache du résultat
 * @returns {boolean} - true si le navigateur est en mode data saver
 */
export function prefersDataSaver() {
  return detectPreference(
    'dataSaver',
    () => {
      if (!hasNetworkInfoSupport()) {
        return false;
      }

      return window.navigator.connection.saveData === true;
    },
    false,
  );
}

/**
 * Détecte si l'utilisateur est sur une connexion lente
 * avec gestion de l'absence d'API et mise en cache des résultats
 * @param {boolean} [forceCheck=false] - Forcer une nouvelle vérification
 * @returns {boolean} - true si l'utilisateur est sur une connexion lente
 */
export function isSlowConnection(forceCheck = false) {
  // Si pas dans un navigateur, retourner false
  if (!isBrowser) {
    return false;
  }

  // Si déjà détecté et pas de force check, retourner la valeur en cache
  if (performanceState.isSlowConnection !== null && !forceCheck) {
    return performanceState.isSlowConnection;
  }

  try {
    // Utiliser l'API NetworkInformation si disponible
    if (hasNetworkInfoSupport()) {
      const connection = window.navigator.connection;

      // Méthode principale: vérifier effectiveType
      if (connection.effectiveType) {
        const isSlow =
          connection.effectiveType === 'slow-2g' ||
          connection.effectiveType === '2g';

        performanceState.networkType = connection.effectiveType;
        performanceState.isSlowConnection = isSlow;
        return isSlow;
      }

      // Méthode alternative: vérifier downlink
      if (typeof connection.downlink === 'number') {
        const isSlow =
          connection.downlink < DEFAULT_CONFIG.network.slowThreshold;
        performanceState.isSlowConnection = isSlow;
        return isSlow;
      }

      // Méthode de secours basée sur le type de connexion
      if (connection.type) {
        const slowTypes = ['cellular', 'wimax'];
        const isSlow = slowTypes.includes(connection.type);
        performanceState.isSlowConnection = isSlow;
        return isSlow;
      }
    }

    // Fallback: vérifier le temps de chargement de la page comme heuristique
    if (window.performance) {
      const navEntries = window.performance.getEntriesByType('navigation');
      if (navEntries && navEntries.length > 0) {
        const navEntry = navEntries[0];
        if (navEntry.loadEventEnd && navEntry.startTime) {
          const loadTime = navEntry.loadEventEnd - navEntry.startTime;
          const isSlow = loadTime > 3000; // Plus de 3 secondes est considéré lent
          performanceState.isSlowConnection = isSlow;
          return isSlow;
        }
      }
    }

    // Si aucune détection n'a fonctionné, valeur par défaut
    performanceState.isSlowConnection = false;
    return false;
  } catch (error) {
    safeLog(
      'warn',
      'Network',
      'Erreur lors de la détection de la connexion',
      error,
    );
    performanceState.isSlowConnection = false;
    return false;
  }
}

/**
 * Détecte le type et la qualité de la connexion réseau
 * @returns {Object} Informations détaillées sur la connexion
 */
export function getNetworkInfo() {
  // Si pas dans un navigateur, retourner des valeurs par défaut
  if (!isBrowser) {
    return {
      type: 'unknown',
      effectiveType: 'unknown',
      downlink: null,
      rtt: null,
      saveData: false,
      isSlowConnection: false,
    };
  }

  // Forcer une vérification fraîche
  isSlowConnection(true);

  const result = {
    type: 'unknown',
    effectiveType: 'unknown',
    downlink: null,
    rtt: null,
    saveData: prefersDataSaver(),
    isSlowConnection: performanceState.isSlowConnection || false,
  };

  try {
    if (hasNetworkInfoSupport()) {
      const connection = window.navigator.connection;

      if (connection.type) {
        result.type = connection.type;
      }

      if (connection.effectiveType) {
        result.effectiveType = connection.effectiveType;
      }

      if (typeof connection.downlink === 'number') {
        result.downlink = connection.downlink;
      }

      if (typeof connection.rtt === 'number') {
        result.rtt = connection.rtt;
      }

      // Enregistrer les événements de changement de connexion si possible
      if (typeof connection.addEventListener === 'function') {
        // Supprimer les anciens écouteurs pour éviter les doublons
        try {
          connection.removeEventListener('change', onNetworkChange);
        } catch (e) {
          // Ignorer si l'écouteur n'existait pas
        }

        // Ajouter un nouvel écouteur
        connection.addEventListener('change', onNetworkChange);
      }
    }
  } catch (error) {
    safeLog(
      'error',
      'Network',
      'Erreur lors de la récupération des informations réseau',
      error,
    );
  }

  return result;
}

/**
 * Gestionnaire d'événements pour les changements de réseau
 */
function onNetworkChange() {
  // Vérifier que nous sommes dans un navigateur
  if (!isBrowser) return;

  // Réinitialiser le cache pour forcer une nouvelle détection
  performanceState.isSlowConnection = null;
  performanceState.networkType = null;

  // Réexécuter la détection
  const isSlow = isSlowConnection(true);

  // Déclencher un événement personnalisé pour les composants qui veulent réagir
  if (window.dispatchEvent) {
    try {
      const event = new CustomEvent('networkchange', {
        detail: {
          isSlowConnection: isSlow,
          networkInfo: getNetworkInfo(),
        },
      });
      window.dispatchEvent(event);
    } catch (e) {
      // Ignorer les erreurs d'événements
    }
  }
}
