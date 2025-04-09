import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';

// Configuration par défaut
const DEFAULT_CONFIG = {
  interval: 60000, // Intervalle de temps en ms (default: 1 minute)
  uniqueTokenPerInterval: 500, // Nombre maximum de tokens uniques
  maxRequestsPerInterval: 100, // Nombre maximum de requêtes par intervalle
  trustProxy: true, // Faire confiance au header X-Forwarded-For
  keyGenerator: null, // Fonction personnalisée pour générer des clés
  skip: () => false, // Fonction pour ignorer certaines requêtes
  statusCode: 429, // Code HTTP pour trop de requêtes
  headers: true, // Ajouter les headers standards
  drift: 500, // Dérive d'horloge tolérée en ms
  failCallback: null, // Fonction appelée en cas d'échec
  errorResponseBuilder: null, // Fonction personnalisée pour construire la réponse d'erreur
};

/**
 * Crée un middleware de limitation de débit avec des options avancées
 * @param {Object} options - Options de configuration
 * @returns {Object} Instance du rate limiter
 */
export const rateLimit = (options = {}) => {
  // Fusion des options par défaut avec les options fournies
  const config = { ...DEFAULT_CONFIG, ...options };

  // Validation des options
  if (config.interval <= 0) throw new Error("L'intervalle doit être positif");
  if (config.uniqueTokenPerInterval <= 0)
    throw new Error('uniqueTokenPerInterval doit être positif');
  if (config.maxRequestsPerInterval <= 0)
    throw new Error('maxRequestsPerInterval doit être positif');

  // Cache pour stocker les compteurs de requêtes
  const tokenCache = new LRUCache({
    max: config.uniqueTokenPerInterval,
    ttl: config.interval,
    updateAgeOnGet: true, // Mettre à jour l'âge lors de l'accès
    ttlAutopurge: true, // Nettoyer automatiquement les entrées expirées
    allowStale: false, // Ne pas permettre l'utilisation des entrées périmées
  });

  // Fonction par défaut pour générer des clés
  const defaultKeyGenerator = (req) => {
    // Obtenir l'IP du client (prend en compte X-Forwarded-For si trustProxy est true)
    const ip =
      config.trustProxy && req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.connection?.remoteAddress ||
          req.socket?.remoteAddress ||
          'unknown';

    // On peut aussi prendre en compte le chemin et la méthode pour un rate limiting plus granulaire
    const path = req.url || '';
    const method = req.method || '';

    // Créer un hash pour masquer l'IP et minimiser les collisions
    return createHash('sha256').update(`${ip}-${path}-${method}`).digest('hex');
  };

  // Fonction pour obtenir les headers de rate limiting
  const getRateLimitHeaders = (token, limit) => {
    const tokenData = tokenCache.get(token);
    const current = tokenData ? tokenData.count : 0;
    const remaining = Math.max(0, limit - current);

    // Calculer le temps restant avant réinitialisation
    const ttl = tokenData ? tokenCache.getRemainingTTL(token) : config.interval;
    const reset = Math.ceil(Date.now() + ttl) / 1000; // En secondes comme spécifié dans RFC

    return {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': reset.toString(),
      'Retry-After': Math.ceil(ttl / 1000).toString(),
    };
  };

  // Fonction pour construire la réponse d'erreur par défaut
  const defaultErrorResponseBuilder = (req, res, next, options) => {
    const { limit, token, headers } = options;

    // Définir le statut et les headers standards
    res.statusCode = config.statusCode;

    if (config.headers) {
      const rateLimitHeaders = getRateLimitHeaders(token, limit);
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }

    // Réponse JSON avec des détails utiles
    const message = {
      status: 'error',
      statusCode: config.statusCode,
      message: 'Rate limit exceeded',
      limitType: 'requests',
      retryAfter: parseInt(headers['Retry-After'], 10),
    };

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(message));
  };

  // Stocker les métriques d'utilisation
  let metrics = {
    totalRequests: 0,
    limitExceeded: 0,
    lastReset: Date.now(),
  };

  // Mettre à jour les métriques périodiquement
  const metricsInterval = setInterval(() => {
    metrics.totalRequests = 0;
    metrics.limitExceeded = 0;
    metrics.lastReset = Date.now();
  }, config.interval);

  // Éviter les fuites de mémoire
  if (metricsInterval.unref) {
    metricsInterval.unref();
  }

  /**
   * Vérifier si une requête dépasse la limite
   * @param {Object} req - Objet requête
   * @param {number} limit - Limite à appliquer (remplace maxRequestsPerInterval si fourni)
   * @param {string} customToken - Token personnalisé (facultatif)
   * @returns {Promise<void>} - Promise résolue si la requête est autorisée
   */
  const check = async (
    req,
    limit = config.maxRequestsPerInterval,
    customToken = null,
  ) => {
    try {
      // Vérifier si cette requête doit être ignorée
      if (config.skip(req)) {
        return Promise.resolve({ limited: false });
      }

      // Générer ou utiliser un token personnalisé
      const token =
        customToken ||
        (config.keyGenerator
          ? config.keyGenerator(req)
          : defaultKeyGenerator(req));

      // Obtenir le compteur actuel ou initialiser
      const now = Date.now();
      let tokenData = tokenCache.get(token);

      if (!tokenData) {
        tokenData = { count: 0, firstRequest: now };
        tokenCache.set(token, tokenData);
      }

      // Incrémenter le compteur
      tokenData.count += 1;
      metrics.totalRequests += 1;

      // Vérifier si la limite est dépassée
      if (tokenData.count > limit) {
        metrics.limitExceeded += 1;

        // Obtenir les headers pour les inclure dans l'erreur
        const headers = getRateLimitHeaders(token, limit);

        // Appeler le callback d'échec si défini
        if (typeof config.failCallback === 'function') {
          config.failCallback(req, token, limit);
        }

        return Promise.reject({
          status: 'error',
          statusCode: config.statusCode,
          message: 'Rate limit exceeded',
          headers,
          token,
          limit,
        });
      }

      // Obtenir les headers pour les inclure dans la réponse réussie
      const headers = getRateLimitHeaders(token, limit);

      return Promise.resolve({
        limited: false,
        current: tokenData.count,
        limit,
        remaining: limit - tokenData.count,
        headers,
      });
    } catch (error) {
      // Loguer l'erreur mais ne pas planter le service
      console.error('[RateLimit] Error:', error);
      return Promise.resolve({ limited: false, error }); // Permettre le trafic en cas d'erreur interne
    }
  };

  /**
   * Middleware Express/Connect compatible
   * @param {Object} req - Objet requête
   * @param {Object} res - Objet réponse
   * @param {Function} next - Fonction next
   */
  const middleware = (req, res, next) => {
    // Ignorer la requête si la condition skip est remplie
    if (config.skip(req)) {
      return next();
    }

    // Utiliser la limite définie dans config
    const limit = config.maxRequestsPerInterval;

    check(req, limit)
      .then((result) => {
        // Ajouter les headers à la réponse si configuré
        if (config.headers && result.headers) {
          Object.entries(result.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }

        // Continuer le traitement de la requête
        next();
      })
      .catch((error) => {
        if (typeof config.errorResponseBuilder === 'function') {
          // Utiliser le builder personnalisé
          config.errorResponseBuilder(req, res, next, error);
        } else {
          // Utiliser la réponse d'erreur par défaut
          defaultErrorResponseBuilder(req, res, next, error);
        }
      });
  };

  /**
   * Réinitialiser un token spécifique
   * @param {string} token - Token à réinitialiser
   */
  const resetToken = (token) => {
    tokenCache.delete(token);
  };

  /**
   * Réinitialiser tous les compteurs
   */
  const resetAll = () => {
    tokenCache.clear();
  };

  /**
   * Obtenir les métriques actuelles
   * @returns {Object} - Métriques
   */
  const getMetrics = () => ({
    ...metrics,
    activeTokens: tokenCache.size,
    hitRate: metrics.totalRequests
      ? (metrics.totalRequests - metrics.limitExceeded) / metrics.totalRequests
      : 0,
    uptime: Date.now() - metrics.lastReset,
  });

  // Retourner l'API publique
  return {
    check,
    middleware,
    resetToken,
    resetAll,
    getMetrics,
    _cache: tokenCache, // Exposé pour les tests, utiliser avec précaution
  };
};

// Exporter aussi un middleware préconfiguré pour une utilisation rapide
export const createRateLimiter = (options) => {
  const limiter = rateLimit(options);
  return limiter.middleware;
};
