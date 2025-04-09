/**
 * Utilitaire de limitation de débit (rate limiting) pour protéger les API
 * Implémente une solution robuste avec isolation par IP, utilisateur ou token
 * Utilise le cache interne pour optimiser les performances et la persistance
 */

import { LRUCache } from 'lru-cache';
import { MemoryCache } from '@/utils/cache';
import logger from '@/utils/logger';
import { captureException, captureMessage } from '@/monitoring/sentry';

/**
 * Types de stratégies de rate limiting
 * @enum {string}
 */
export const RATE_LIMIT_STRATEGIES = {
  // Limite par IP (protection basique)
  IP: 'ip',
  // Limite par utilisateur (authentifié)
  USER: 'user',
  // Limite par token API (service externe)
  TOKEN: 'token',
  // Limite globale (pour tout le service)
  GLOBAL: 'global',
};

/**
 * Types d'algorithmes de rate limiting
 * @enum {string}
 */
export const RATE_LIMIT_ALGORITHMS = {
  // Fenêtre fixe (plus simple)
  FIXED_WINDOW: 'fixed-window',
  // Fenêtre glissante (plus précis)
  SLIDING_WINDOW: 'sliding-window',
  // Bucket à jetons (meilleur pour les bursts)
  TOKEN_BUCKET: 'token-bucket',
  // Leaky bucket (constant rate)
  LEAKY_BUCKET: 'leaky-bucket',
};

/**
 * Configurations par défaut pour différents types d'endpoints
 */
export const RATE_LIMIT_PRESETS = {
  // API publiques (non-authentifiées)
  PUBLIC_API: {
    interval: 60 * 1000, // 1 minute
    limit: 30, // 30 requêtes par minute
    strategy: RATE_LIMIT_STRATEGIES.IP,
    algorithm: RATE_LIMIT_ALGORITHMS.SLIDING_WINDOW,
    blockDuration: 5 * 60 * 1000, // 5 minutes de blocage
  },
  // API authentifiées (utilisateur connecté)
  AUTHENTICATED_API: {
    interval: 60 * 1000, // 1 minute
    limit: 120, // 120 requêtes par minute
    strategy: RATE_LIMIT_STRATEGIES.USER,
    algorithm: RATE_LIMIT_ALGORITHMS.SLIDING_WINDOW,
    blockDuration: 2 * 60 * 1000, // 2 minutes de blocage
  },
  // Endpoints d'authentification (login/register)
  AUTH_ENDPOINTS: {
    interval: 10 * 60 * 1000, // 10 minutes
    limit: 10, // 10 tentatives par 10 minutes
    strategy: RATE_LIMIT_STRATEGIES.IP,
    algorithm: RATE_LIMIT_ALGORITHMS.FIXED_WINDOW,
    blockDuration: 30 * 60 * 1000, // 30 minutes de blocage
  },
  // Endpoints critiques (paiement, etc.)
  CRITICAL_ENDPOINTS: {
    interval: 5 * 60 * 1000, // 5 minutes
    limit: 5, // 5 requêtes par 5 minutes
    strategy: RATE_LIMIT_STRATEGIES.USER,
    algorithm: RATE_LIMIT_ALGORITHMS.LEAKY_BUCKET,
    blockDuration: 60 * 60 * 1000, // 1 heure de blocage
  },
};

// Cache optimisé pour le rate limiting avec survie aux redémarrages
const rateLimitCache = new MemoryCache({
  ttl: 60 * 60 * 1000, // 1 heure par défaut (sera écrasé par les paramètres spécifiques)
  maxSize: 10000, // Maximum 10000 entrées pour éviter l'explosion de la mémoire
  name: 'rate-limit-cache',
  compress: false, // Pas besoin de compression pour ces données
});

// Cache spécifique pour les clients bloqués
const blockedClientCache = new MemoryCache({
  ttl: 24 * 60 * 60 * 1000, // 24 heures max
  maxSize: 1000,
  name: 'blocked-clients',
});

/**
 * Implémentation d'un rate limiter configurable pour les API
 * @param {Object} options Options de configuration
 * @param {number} options.interval Intervalle de temps en ms
 * @param {number} options.limit Nombre de requêtes autorisées par intervalle
 * @param {string} options.prefix Préfixe pour les clés de cache (défaut: 'rl')
 * @param {number} options.uniqueTokenPerInterval Nombre maximum de tokens uniques
 * @param {string} options.strategy Stratégie de rate limiting (IP, USER, TOKEN)
 * @param {string} options.algorithm Algorithme de rate limiting
 * @param {number} options.blockDuration Durée de blocage en ms après dépassement
 * @param {boolean} options.skipSuccessLogging Ne pas logger les succès (défaut: true)
 * @param {function} options.getTokenFromReq Fonction personnalisée pour extraire le token
 * @returns {Object} Middleware de rate limiting
 */
export const rateLimit = (options = {}) => {
  // Configuration par défaut
  const {
    interval = 60000, // 1 minute par défaut
    limit = 100, // 100 requêtes par minute par défaut
    prefix = 'rl',
    uniqueTokenPerInterval = 10000,
    strategy = RATE_LIMIT_STRATEGIES.IP,
    algorithm = RATE_LIMIT_ALGORITHMS.SLIDING_WINDOW,
    blockDuration = 15 * 60 * 1000, // 15 minutes de blocage par défaut
    skipSuccessLogging = true,
    getTokenFromReq = null,
  } = options;

  // Validation des entrées
  if (interval <= 0 || !Number.isInteger(interval)) {
    throw new Error('Rate limit interval must be a positive integer');
  }
  if (limit <= 0 || !Number.isInteger(limit)) {
    throw new Error('Rate limit must be a positive integer');
  }

  // LRU Cache pour les timestamps de requêtes (pour l'algorithme de fenêtre glissante)
  const windowCache = new LRUCache({
    max: uniqueTokenPerInterval || 10000,
    ttl: interval * 2, // Conserver un peu plus longtemps pour les calculs
  });

  // Cache pour l'algorithme token bucket
  const tokenBucketCache = new LRUCache({
    max: uniqueTokenPerInterval || 10000,
    ttl: interval * 2,
  });

  /**
   * Obtient le token d'identification à partir de la requête
   * @param {Object} req Requête HTTP
   * @returns {string} Token d'identification (IP, userId, token API)
   */
  const getToken = (req) => {
    // Si une fonction personnalisée est fournie, l'utiliser
    if (typeof getTokenFromReq === 'function') {
      const customToken = getTokenFromReq(req);
      if (customToken) return `${prefix}:${customToken}`;
    }

    // Extraire selon la stratégie
    switch (strategy) {
      case RATE_LIMIT_STRATEGIES.USER:
        // Utilisateur connecté (JWT, session, etc.)
        if (req.user && req.user.id) {
          return `${prefix}:user:${req.user.id}`;
        }
        // Fallback vers IP si pas d'utilisateur
        break;

      case RATE_LIMIT_STRATEGIES.TOKEN: {
        // Token d'API (header ou query param)
        const apiKey =
          (req.headers && req.headers['x-api-key']) ||
          (req.query && req.query.apiKey);
        if (apiKey) {
          return `${prefix}:token:${apiKey}`;
        }
        // Fallback vers IP si pas de token
        break;
      }

      case RATE_LIMIT_STRATEGIES.GLOBAL:
        // Limiter globalement, sans distinction de client
        return `${prefix}:global`;
    }

    // Par défaut, utiliser l'IP
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',').shift().trim() ||
      req.socket?.remoteAddress ||
      '0.0.0.0';

    return `${prefix}:ip:${ip}`;
  };

  /**
   * Vérifie si un client est bloqué
   * @param {string} token Token d'identification
   * @returns {boolean} True si bloqué
   */
  const isBlocked = (token) => {
    return blockedClientCache.get(`blocked:${token}`) === true;
  };

  /**
   * Bloque un client pour la durée spécifiée
   * @param {string} token Token d'identification
   */
  const blockClient = (token) => {
    blockedClientCache.set(`blocked:${token}`, true, { ttl: blockDuration });

    // Log et monitoring
    logger.warn(`Client blocked due to rate limit violation: ${token}`, {
      component: 'rateLimit',
      token,
      blockDuration,
    });

    captureMessage('Rate limit violation: client blocked', {
      level: 'warning',
      tags: {
        component: 'rateLimit',
        blockDuration: Math.floor(blockDuration / 1000) + 's',
      },
      extra: {
        token: token.replace(/^.*?:/, ''), // Anonymiser partiellement
        strategy,
        algorithm,
      },
    });
  };

  /**
   * Implémentation de l'algorithme de fenêtre fixe
   * @param {string} token Token d'identification
   * @returns {Promise<{limited: boolean, remaining: number, reset: number}>}
   */
  const checkFixedWindow = async (token) => {
    const key = `${token}:fixed`;
    const now = Date.now();
    const windowStart = Math.floor(now / interval) * interval;
    const windowEnd = windowStart + interval;
    const reset = Math.ceil((windowEnd - now) / 1000);

    try {
      const currentCount = rateLimitCache.get(key) || 0;

      if (currentCount >= limit) {
        return { limited: true, remaining: 0, reset };
      }

      rateLimitCache.set(key, currentCount + 1, { ttl: interval });
      return { limited: false, remaining: limit - (currentCount + 1), reset };
    } catch (error) {
      logger.error(`Rate limit error (fixed window): ${error.message}`, {
        error,
        token,
      });
      captureException(error, {
        tags: { component: 'rateLimit', algorithm: 'fixed-window' },
      });

      // En cas d'erreur, permettre la requête (fail open pour éviter de bloquer tout le trafic)
      return { limited: false, remaining: 1, reset };
    }
  };

  /**
   * Implémentation de l'algorithme de fenêtre glissante
   * @param {string} token Token d'identification
   * @returns {Promise<{limited: boolean, remaining: number, reset: number}>}
   */
  const checkSlidingWindow = async (token) => {
    const key = `${token}:sliding`;
    const now = Date.now();
    const windowMinTime = now - interval;

    try {
      // Obtenir la liste des timestamps ou initialiser
      const timestamps = windowCache.get(key) || [];

      // Filtrer les timestamps qui sont dans la fenêtre actuelle
      const validTimestamps = timestamps.filter((time) => time > windowMinTime);

      if (validTimestamps.length >= limit) {
        // Calculer quand la prochaine requête sera possible
        const oldestRequest = Math.min(...validTimestamps);
        const reset = Math.ceil((oldestRequest + interval - now) / 1000);
        return { limited: true, remaining: 0, reset };
      }

      // Ajouter le timestamp actuel et mettre à jour le cache
      validTimestamps.push(now);
      windowCache.set(key, validTimestamps);

      return {
        limited: false,
        remaining: limit - validTimestamps.length,
        reset: Math.ceil(interval / 1000),
      };
    } catch (error) {
      logger.error(`Rate limit error (sliding window): ${error.message}`, {
        error,
        token,
      });
      captureException(error, {
        tags: { component: 'rateLimit', algorithm: 'sliding-window' },
      });

      return { limited: false, remaining: 1, reset: interval / 1000 };
    }
  };

  /**
   * Implémentation de l'algorithme token bucket
   * @param {string} token Token d'identification
   * @returns {Promise<{limited: boolean, remaining: number, reset: number}>}
   */
  const checkTokenBucket = async (token) => {
    const key = `${token}:bucket`;
    const now = Date.now();

    try {
      // Récupérer l'état actuel du bucket ou l'initialiser
      const bucket = tokenBucketCache.get(key) || {
        tokens: limit,
        lastRefill: now,
      };

      // Calculer le nombre de tokens à rajouter depuis la dernière refill
      const timePassed = now - bucket.lastRefill;
      const refillRate = limit / interval; // tokens par ms
      const tokensToAdd = Math.floor(timePassed * refillRate);

      // Mettre à jour le bucket
      bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;

      if (bucket.tokens < 1) {
        // Pas assez de tokens
        const timeUntilRefill = Math.ceil((1 - bucket.tokens) / refillRate);
        return {
          limited: true,
          remaining: 0,
          reset: Math.ceil(timeUntilRefill / 1000),
        };
      }

      // Utiliser un token
      bucket.tokens -= 1;
      tokenBucketCache.set(key, bucket);

      return {
        limited: false,
        remaining: Math.floor(bucket.tokens),
        reset: Math.ceil(1 / refillRate / 1000), // temps pour remplir 1 token
      };
    } catch (error) {
      logger.error(`Rate limit error (token bucket): ${error.message}`, {
        error,
        token,
      });
      captureException(error, {
        tags: { component: 'rateLimit', algorithm: 'token-bucket' },
      });

      return { limited: false, remaining: 1, reset: 1 };
    }
  };

  /**
   * Implémentation de l'algorithme leaky bucket
   * @param {string} token Token d'identification
   * @returns {Promise<{limited: boolean, remaining: number, reset: number}>}
   */
  const checkLeakyBucket = async (token) => {
    const key = `${token}:leaky`;
    const now = Date.now();

    try {
      // Récupérer l'état actuel du bucket ou l'initialiser
      const bucket = tokenBucketCache.get(key) || {
        water: 0,
        lastLeaked: now,
      };

      // Calculer combien d'eau a fui depuis la dernière fois
      const timePassed = now - bucket.lastLeaked;
      const leakRate = limit / interval; // fuites par ms
      const leaked = timePassed * leakRate;

      // Mettre à jour le bucket
      bucket.water = Math.max(0, bucket.water - leaked);
      bucket.lastLeaked = now;

      // Vérifier si on peut ajouter une goutte
      if (bucket.water + 1 > limit) {
        // Bucket plein
        const timeUntilSpace = Math.ceil((bucket.water + 1 - limit) / leakRate);
        return {
          limited: true,
          remaining: 0,
          reset: Math.ceil(timeUntilSpace / 1000),
        };
      }

      // Ajouter une goutte
      bucket.water += 1;
      tokenBucketCache.set(key, bucket);

      return {
        limited: false,
        remaining: Math.floor(limit - bucket.water),
        reset: Math.ceil(1 / leakRate / 1000), // temps pour fuir 1 unité
      };
    } catch (error) {
      logger.error(`Rate limit error (leaky bucket): ${error.message}`, {
        error,
        token,
      });
      captureException(error, {
        tags: { component: 'rateLimit', algorithm: 'leaky-bucket' },
      });

      return { limited: false, remaining: 1, reset: 1 };
    }
  };

  /**
   * Vérifie les limites de débit selon l'algorithme choisi
   * @param {string} token Identifiant du client
   * @returns {Promise<{limited: boolean, remaining: number, reset: number}>}
   */
  const checkRateLimit = async (token) => {
    // Vérifier d'abord si le client est bloqué
    if (isBlocked(token)) {
      return { limited: true, remaining: 0, reset: 600 }; // Valeur arbitraire de 10 minutes
    }

    // Choisir l'algorithme approprié
    switch (algorithm) {
      case RATE_LIMIT_ALGORITHMS.SLIDING_WINDOW:
        return checkSlidingWindow(token);
      case RATE_LIMIT_ALGORITHMS.TOKEN_BUCKET:
        return checkTokenBucket(token);
      case RATE_LIMIT_ALGORITHMS.LEAKY_BUCKET:
        return checkLeakyBucket(token);
      case RATE_LIMIT_ALGORITHMS.FIXED_WINDOW:
      default:
        return checkFixedWindow(token);
    }
  };

  /**
   * Vérifie si la requête dépasse les limites
   * @param {Object} req Requête HTTP
   * @param {number} customLimit Limite optionnelle spécifique à cette requête
   * @param {string} customToken Token optionnel spécifique à cette requête
   * @returns {Promise<Object>} Résultat du contrôle de limite
   */
  const check = async (req, customLimit = null, customToken = null) => {
    const actualLimit = customLimit || limit;
    const token = customToken || getToken(req);

    try {
      const result = await checkRateLimit(token);

      // Gérer les dépassements de limite
      if (result.limited) {
        // Si c'est un dépassement important, bloquer le client
        const limitViolations = rateLimitCache.get(`${token}:violations`) || 0;

        if (limitViolations >= 5) {
          // Bloquer après 5 violations
          blockClient(token);
        } else {
          rateLimitCache.set(`${token}:violations`, limitViolations + 1, {
            ttl: interval * 2,
          });
        }

        return Promise.reject({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          headers: {
            'Retry-After': result.reset,
            'X-RateLimit-Reset': result.reset,
            'X-RateLimit-Limit': actualLimit,
            'X-RateLimit-Remaining': 0,
          },
        });
      }

      // Réinitialiser le compteur de violations si tout va bien
      if (rateLimitCache.get(`${token}:violations`)) {
        rateLimitCache.set(`${token}:violations`, 0, { ttl: interval * 2 });
      }

      // Headers à retourner
      return Promise.resolve({
        headers: {
          'X-RateLimit-Limit': actualLimit,
          'X-RateLimit-Remaining': result.remaining,
          'X-RateLimit-Reset': result.reset,
        },
      });
    } catch (error) {
      // Si c'est une erreur contrôlée de dépassement
      if (error.statusCode === 429) {
        return Promise.reject(error);
      }

      // Erreur inattendue - on log minimal
      logger.error(`Rate limit error: ${error.message}`);

      // En cas d'erreur du système, permettre la requête
      return Promise.resolve({
        headers: {
          'X-RateLimit-Limit': actualLimit,
          'X-RateLimit-Remaining': 1,
          'X-RateLimit-Reset': 60,
        },
      });
    }
  };

  /**
   * Crée un middleware Express pour le rate limiting
   * @param {Object} options Options spécifiques au middleware
   * @returns {Function} Middleware Express
   */
  const createMiddleware = (options = {}) => {
    const {
      customLimit = null,
      customTokenFn = null,
      keyGenerator = null,
      skip = null,
      handler = null,
    } = options;

    return async (req, res, next) => {
      // Vérifier si on doit ignorer cette requête
      if (skip && typeof skip === 'function' && skip(req, res)) {
        return next();
      }

      try {
        // Générer le token personnalisé si une fonction est fournie
        const customToken = customTokenFn
          ? customTokenFn(req, res)
          : keyGenerator
            ? keyGenerator(req, res)
            : null;

        const result = await check(req, customLimit, customToken);

        // Ajouter les en-têtes à la réponse
        if (result.headers) {
          Object.entries(result.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }

        next();
      } catch (error) {
        // Appeler le gestionnaire personnalisé si fourni
        if (handler && typeof handler === 'function') {
          return handler(error, req, res, next);
        }

        // Gestion par défaut des erreurs
        res.status(error.statusCode || 429);

        // Ajouter les en-têtes à la réponse
        if (error.headers) {
          Object.entries(error.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }

        res.send({
          error: error.error || 'Too Many Requests',
          message:
            error.message || 'Rate limit exceeded. Please try again later.',
          retryAfter: error.headers?.['Retry-After'] || 60,
        });
      }
    };
  };

  /**
   * Réinitialise les limites pour un token spécifique
   * @param {string} token Token à réinitialiser
   * @returns {boolean} Succès de l'opération
   */
  const resetLimit = (token) => {
    try {
      // Réinitialiser pour tous les algorithmes
      tokenBucketCache.delete(`${token}:bucket`);
      windowCache.delete(`${token}:sliding`);
      rateLimitCache.delete(`${token}:fixed`);
      tokenBucketCache.delete(`${token}:leaky`);
      rateLimitCache.delete(`${token}:violations`);

      // Débloquer si bloqué
      blockedClientCache.delete(`blocked:${token}`);

      logger.info(`Rate limit reset for: ${token}`, {
        component: 'rateLimit',
        action: 'reset',
      });

      return true;
    } catch (error) {
      logger.error(`Failed to reset rate limit: ${error.message}`, {
        error,
        token,
      });

      return false;
    }
  };

  /**
   * Nettoie les entrées expirées du cache
   * Utile pour les applications à long terme pour éviter les fuites mémoire
   */
  const cleanupCache = () => {
    try {
      windowCache.purgeStale();
      tokenBucketCache.purgeStale();
      blockedClientCache.cleanup();
      rateLimitCache.cleanup();
    } catch (error) {
      logger.error(`Rate limit cache cleanup error: ${error.message}`, {
        error,
      });
    }
  };

  // Nettoyer périodiquement (toutes les 5 minutes)
  if (typeof setInterval !== 'undefined') {
    const cleanupInterval = setInterval(cleanupCache, 5 * 60 * 1000);
    if (cleanupInterval.unref) cleanupInterval.unref();
  }

  return {
    check,
    middleware: createMiddleware,
    resetLimit,
    cleanupCache,
    RATE_LIMIT_ALGORITHMS,
    RATE_LIMIT_STRATEGIES,
  };
};

/**
 * Crée un middleware rate limit pour Next.js API Routes
 * @param {Object} options Options de configuration du rate limiter
 * @returns {Function} Middleware Next.js
 */
export const createRateLimitMiddleware = (options = {}) => {
  const limiter = rateLimit(options);
  const middlewareOptions = options.middleware || {};

  return async function rateLimitMiddleware(req, res, next) {
    try {
      await limiter.middleware(middlewareOptions)(req, res, next);
    } catch (error) {
      // Cette partie ne devrait jamais être atteinte car le middleware gère les erreurs
      console.error('Unexpected error in rate limit middleware:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
};

/**
 * Utilitaire pour créer rapidement des limiteurs de débit avec des préréglages
 * @param {string} presetName Nom du préréglage
 * @param {Object} overrideOptions Options pour écraser les valeurs par défaut
 * @returns {Object} Instance du rate limiter
 */
export const createRateLimiter = (presetName, overrideOptions = {}) => {
  const preset =
    RATE_LIMIT_PRESETS[presetName] || RATE_LIMIT_PRESETS.PUBLIC_API;
  return rateLimit({
    ...preset,
    ...overrideOptions,
  });
};

export default {
  rateLimit,
  createRateLimitMiddleware,
  createRateLimiter,
  RATE_LIMIT_STRATEGIES,
  RATE_LIMIT_ALGORITHMS,
  RATE_LIMIT_PRESETS,
};
