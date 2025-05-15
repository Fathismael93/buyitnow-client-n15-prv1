/**
 * Implémentation personnalisée de rate limiting conçue pour Next.js
 * Ne dépend pas d'express-rate-limit
 */

import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/utils/logger';
import { captureException, captureMessage } from '@/monitoring/sentry';

/**
 * Types de préréglages pour différents endpoints
 * @enum {Object}
 */
export const RATE_LIMIT_PRESETS = {
  // API publiques (non-authentifiées)
  PUBLIC_API: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requêtes par minute
    message: 'Trop de requêtes, veuillez réessayer plus tard',
  },
  // API authentifiées (utilisateur connecté)
  AUTHENTICATED_API: {
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 requêtes par minute
    message: 'Trop de requêtes, veuillez réessayer plus tard',
  },
  // Endpoints d'authentification (login/register)
  AUTH_ENDPOINTS: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // 10 tentatives par 10 minutes
    message:
      "Trop de tentatives d'authentification, veuillez réessayer plus tard",
  },
  // Endpoints critiques (paiement, etc.)
  CRITICAL_ENDPOINTS: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // 5 requêtes par 5 minutes
    message:
      'Trop de requêtes pour une opération critique, veuillez réessayer plus tard',
  },
};

/**
 * Niveaux de sévérité pour les violations du rate limit
 * @enum {Object}
 */
export const VIOLATION_LEVELS = {
  LOW: {
    threshold: 1.2, // Dépassement de 20% de la limite
    blockDuration: 0, // Pas de blocage supplémentaire
    severity: 'low',
    sentryLevel: 'info',
  },
  MEDIUM: {
    threshold: 2, // Double de la limite
    blockDuration: 5 * 60 * 1000, // 5 minutes
    severity: 'medium',
    sentryLevel: 'warning',
  },
  HIGH: {
    threshold: 5, // 5x la limite
    blockDuration: 30 * 60 * 1000, // 30 minutes
    severity: 'high',
    sentryLevel: 'warning',
  },
  SEVERE: {
    threshold: 10, // 10x la limite
    blockDuration: 24 * 60 * 60 * 1000, // 24 heures
    severity: 'severe',
    sentryLevel: 'error',
  },
};

// Cache des requêtes - utilise une Map pour stocker en mémoire
// Selon vos besoins, vous pourriez remplacer ceci par Redis ou autre système
const requestCache = new Map();
const blockedIPs = new Map();
const suspiciousBehavior = new Map();
const IP_WHITELIST = new Set();

/**
 * Fonction pour extraire l'IP réelle d'une requête
 * @param {Object} req - La requête HTTP
 * @returns {string} L'IP réelle du client
 */
function extractRealIp(req) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');

  const ip =
    (forwardedFor ? forwardedFor.split(',')[0].trim() : realIp) ||
    req.socket?.remoteAddress ||
    '0.0.0.0';

  return ip;
}

/**
 * Fonction d'anonymisation d'IP pour les logs et Sentry
 * @param {string} ip - L'adresse IP à anonymiser
 * @returns {string} L'IP anonymisée
 */
function anonymizeIp(ip) {
  if (!ip || typeof ip !== 'string') return '0.0.0.0';

  // Gestion IPv4 et IPv6
  if (ip.includes('.')) {
    // IPv4: Masquer le dernier octet (e.g. 192.168.1.xxx)
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = 'xxx';
      return parts.join('.');
    }
  } else if (ip.includes(':')) {
    // IPv6: Ne garder que le préfixe (e.g. 2001:db8::xxx)
    const parts = ip.split(':');
    if (parts.length >= 4) {
      return parts.slice(0, 4).join(':') + '::xxx';
    }
  }

  return ip.substring(0, ip.length / 2) + '...';
}

/**
 * Générer une clé unique pour cette requête
 * @param {Object} req - Requête Next.js
 * @param {string} prefix - Préfixe pour la clé
 * @returns {string} Clé unique
 */
function generateKey(req, prefix = 'api') {
  // Essayer d'obtenir l'utilisateur si authentifié
  let userIdentifier = '';

  if (req.user) {
    userIdentifier = req.user.id || req.user.email || req.user._id || '';
  }

  // Si on a un utilisateur, l'utiliser comme identifiant principal
  if (userIdentifier) {
    return `${prefix}:user:${userIdentifier}`;
  }

  // Sinon, utiliser l'adresse IP
  const ip = extractRealIp(req);
  return `${prefix}:ip:${ip}`;
}

/**
 * Analyser le comportement suspect en fonction des modèles de requête
 * @param {string} key - Clé d'identification
 * @returns {Object} Résultat de l'analyse
 */
function analyzeBehavior(key) {
  const data = suspiciousBehavior.get(key);
  if (!data) return { isSuspicious: false, threatLevel: 0 };

  let threatScore = 0;
  const results = { detectionPoints: [] };

  // Nombre de violations
  if (data.violations >= 50) {
    threatScore += 5;
    results.detectionPoints.push('high_violation_count');
  } else if (data.violations >= 10) {
    threatScore += 2;
    results.detectionPoints.push('multiple_violations');
  }

  // Distribution temporelle (détecter les modèles automatisés)
  if (data.timestamps.length >= 5) {
    const intervals = [];
    for (let i = 1; i < data.timestamps.length; i++) {
      intervals.push(data.timestamps[i] - data.timestamps[i - 1]);
    }

    // Vérifier si les intervalles sont trop réguliers (bots)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) /
      intervals.length;
    const stdDev = Math.sqrt(variance);

    // Un faible écart type indique des requêtes trop régulières
    if (stdDev < avgInterval * 0.1 && intervals.length > 5) {
      threatScore += 4;
      results.detectionPoints.push('regular_pattern_detected');
    }
  }

  // Diversité des endpoints (comportement de scan)
  if (data.endpoints.size >= 10) {
    threatScore += 3;
    results.detectionPoints.push('endpoint_scanning_behavior');
  }

  results.isSuspicious = threatScore >= 3;
  results.threatLevel = threatScore;
  return results;
}

/**
 * Suivre le comportement d'un client
 * @param {string} key - Clé d'identification
 * @param {Object} data - Données à enregistrer
 */
function trackBehavior(key, req, violations = 0) {
  const existingData = suspiciousBehavior.get(key) || {
    timestamps: [],
    endpoints: new Set(),
    violations: 0,
    firstSeen: Date.now(),
    lastSeen: Date.now(),
  };

  // Mettre à jour les données
  existingData.violations += violations;
  existingData.lastSeen = Date.now();
  existingData.timestamps.push(Date.now());

  // Limiter le nombre de timestamps stockés
  if (existingData.timestamps.length > 50) {
    existingData.timestamps.shift();
  }

  // Ajouter l'endpoint actuel
  const path = req.url || req.nextUrl?.pathname || '';
  if (path) {
    existingData.endpoints.add(path);
  }

  suspiciousBehavior.set(key, existingData);
}

/**
 * Middleware de rate limiting natif pour Next.js
 * @param {string} preset - Nom du préréglage à utiliser
 * @param {Object} options - Options supplémentaires
 * @returns {Function} Middleware Next.js
 */
export function applyRateLimit(preset = 'PUBLIC_API', options = {}) {
  // Obtenir le préréglage
  const config = {
    ...(RATE_LIMIT_PRESETS[preset] || RATE_LIMIT_PRESETS.PUBLIC_API),
    ...options,
  };

  // Middleware Next.js
  return async function (req) {
    const path = req.url || req.nextUrl?.pathname || '';
    const ip = extractRealIp(req);

    try {
      // 1. Vérifier si l'IP est en liste blanche
      if (IP_WHITELIST.has(ip)) {
        return null; // Autoriser sans limite
      }

      // 2. Vérifier si l'IP est bloquée
      const blockInfo = blockedIPs.get(ip);
      if (blockInfo && blockInfo.until > Date.now()) {
        // IP bloquée, créer une réponse d'erreur
        const eventId = uuidv4();
        logger.warn('Request from blocked IP rejected', {
          eventId,
          ip: anonymizeIp(ip),
          path,
          component: 'rateLimit',
          until: new Date(blockInfo.until).toISOString(),
          reason: blockInfo.reason,
        });

        return NextResponse.json(
          {
            status: 429,
            error: 'Too Many Requests',
            message: blockInfo.message || config.message,
            retryAfter: Math.ceil((blockInfo.until - Date.now()) / 1000),
            reference: eventId,
          },
          {
            status: 429,
            headers: {
              'Retry-After': Math.ceil(
                (blockInfo.until - Date.now()) / 1000,
              ).toString(),
            },
          },
        );
      }

      // 3. Gérer le skip (bypass) si nécessaire
      if (options.skip && typeof options.skip === 'function') {
        if (options.skip(req)) {
          return null; // Skip le rate limiting
        }
      }

      // 4. Générer une clé unique pour cette requête
      const key = generateKey(req, options.prefix || preset);

      // 5. Récupérer les données de requête existantes
      const now = Date.now();
      const windowStart = now - config.windowMs;
      let requests = requestCache.get(key) || [];

      // Supprimer les requêtes trop anciennes (hors de la fenêtre)
      requests = requests.filter((timestamp) => timestamp > windowStart);

      // 6. Vérifier si la limite est dépassée
      if (requests.length >= config.max) {
        // Limite dépassée, analyser le comportement
        trackBehavior(key, req, 1);
        const behavior = analyzeBehavior(key);

        // Déterminer le niveau de violation
        const violationRatio = requests.length / config.max;
        let violationLevel = VIOLATION_LEVELS.LOW;

        for (const level of Object.values(VIOLATION_LEVELS)) {
          if (violationRatio >= level.threshold) {
            violationLevel = level;
          }
        }

        // Calculer la durée du blocage supplémentaire
        let blockDuration = violationLevel.blockDuration;
        if (behavior.isSuspicious) {
          // Augmenter la durée pour les comportements suspects
          blockDuration *= 1 + Math.min(behavior.threatLevel, 10) / 5;
        }

        // Calculer la date de fin du blocage
        const resetTime = Math.max(...requests) + config.windowMs;
        const blockUntil = blockDuration > 0 ? now + blockDuration : resetTime;

        // Générer un ID d'événement pour le suivi
        const eventId = uuidv4();

        // Logger avec Winston
        logger.warn('Rate limit exceeded', {
          eventId,
          ip: anonymizeIp(ip),
          path,
          component: 'rateLimit',
          userAgent:
            req.headers.get('user-agent')?.substring(0, 100) || 'unknown',
          requests: requests.length,
          limit: config.max,
          violationRatio: parseFloat(violationRatio.toFixed(2)),
          violationLevel: violationLevel.severity,
          blockDuration: `${Math.round(blockDuration / 1000)}s`,
          suspicious: behavior.isSuspicious,
          threatLevel: behavior.threatLevel,
          detectionPoints: behavior.detectionPoints,
        });

        // Envoyer à Sentry pour les violations plus graves
        if (violationLevel.severity !== 'low') {
          captureMessage(
            `Rate limit violation detected: ${violationLevel.severity}`,
            {
              level: violationLevel.sentryLevel,
              tags: {
                component: 'rateLimit',
                violationLevel: violationLevel.severity,
                suspicious: behavior.isSuspicious.toString(),
              },
              extra: {
                ip: anonymizeIp(ip),
                path,
                requests: requests.length,
                limit: config.max,
                blockDuration,
                detectionPoints: behavior.detectionPoints,
                threatLevel: behavior.threatLevel,
              },
            },
          );
        }

        // Bloquer les IPs pour les violations graves
        if (violationLevel.severity === 'severe' && behavior.threatLevel >= 8) {
          blockedIPs.set(ip, {
            until: now + 24 * 60 * 60 * 1000, // 24 heures
            reason: 'Severe violation with suspicious behavior',
            message:
              'Limite de requêtes largement dépassée. Votre accès est temporairement restreint.',
          });

          logger.error(
            'Added IP to temporary blacklist due to severe violations',
            {
              ip: anonymizeIp(ip),
              eventId,
              component: 'rateLimit',
              action: 'blacklist_add',
            },
          );

          captureMessage('IP blacklisted due to severe rate limit violations', {
            level: 'error',
            tags: {
              component: 'rateLimit',
              action: 'blacklist_add',
            },
            extra: {
              ip: anonymizeIp(ip),
              threatLevel: behavior.threatLevel,
              detectionPoints: behavior.detectionPoints,
            },
          });
        }

        // Calculer le temps avant réinitialisation
        const retryAfter = Math.ceil((blockUntil - now) / 1000);

        // Message personnalisé selon la gravité
        let message =
          config.message || 'Trop de requêtes, veuillez réessayer plus tard';
        if (
          violationLevel.severity === 'high' ||
          violationLevel.severity === 'severe'
        ) {
          message =
            'Limite de requêtes largement dépassée. Votre accès est temporairement restreint.';
        }

        // Créer et retourner la réponse
        return NextResponse.json(
          {
            status: 429,
            error: 'Too Many Requests',
            message,
            retryAfter,
            reference: eventId,
          },
          {
            status: 429,
            headers: {
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Limit': config.max.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.ceil(blockUntil / 1000).toString(),
            },
          },
        );
      }

      // 7. Si la limite n'est pas dépassée, enregistrer cette requête
      requests.push(now);
      requestCache.set(key, requests);

      // 8. Mettre à jour le suivi du comportement (sans violation)
      trackBehavior(key, req, 0);

      // 9. Laisser passer la requête
      return null;
    } catch (error) {
      // Logging robuste des erreurs
      logger.error('Unexpected error in rate limit middleware', {
        error: error.message,
        stack: error.stack,
        path,
        component: 'rateLimit',
      });

      // Capture d'exception avec Sentry
      captureException(error, {
        level: 'error',
        tags: {
          component: 'rateLimit',
          type: 'critical_middleware_failure',
        },
        extra: {
          path,
          preset,
        },
      });

      // En cas d'erreur, laisser passer la requête (fail open)
      return null;
    }
  };
}

/**
 * Ajoute une IP à la liste blanche (exemptée de rate limiting)
 * @param {string} ip Adresse IP à ajouter
 */
export function addToWhitelist(ip) {
  IP_WHITELIST.add(ip);
  logger.info('Added IP to rate limit whitelist', {
    ip: anonymizeIp(ip),
    component: 'rateLimit',
    action: 'whitelist_add',
  });
}

/**
 * Ajoute une IP à la liste noire (toujours bloquée)
 * @param {string} ip Adresse IP à bloquer
 * @param {number} duration Durée du blocage en ms (0 = permanent)
 */
export function addToBlacklist(ip, duration = 0) {
  const now = Date.now();
  const until = duration > 0 ? now + duration : Number.MAX_SAFE_INTEGER;

  blockedIPs.set(ip, {
    until,
    reason: 'Manually blacklisted',
    message: 'Votre accès a été temporairement restreint.',
  });

  logger.info('Added IP to rate limit blacklist', {
    ip: anonymizeIp(ip),
    component: 'rateLimit',
    action: 'blacklist_add',
    duration: duration ? `${duration / 1000}s` : 'permanent',
  });

  // Envoyer une alerte Sentry pour la mise en liste noire manuelle
  captureMessage('IP manually blacklisted in rate limiter', {
    level: 'warning',
    tags: {
      component: 'rateLimit',
      action: 'manual_blacklist',
    },
    extra: {
      ip: anonymizeIp(ip),
      duration: duration ? `${duration / 1000}s` : 'permanent',
    },
  });
}

/**
 * Réinitialise toutes les données de comportement et limites
 * pour le diagnostic ou le nettoyage
 */
export function resetAllData() {
  requestCache.clear();
  blockedIPs.clear();
  suspiciousBehavior.clear();

  logger.info('Reset all rate limit behavior tracking data', {
    component: 'rateLimit',
    action: 'reset_all',
  });

  captureMessage('Rate limit data reset', {
    level: 'info',
    tags: {
      component: 'rateLimit',
      action: 'reset_all',
    },
  });
}

/**
 * Obtenir des statistiques sur l'utilisation du rate limiting
 * @returns {Object} Statistiques d'utilisation
 */
export function getRateLimitStats() {
  const stats = {
    activeKeys: requestCache.size,
    suspiciousBehaviors: suspiciousBehavior.size,
    blockedIPs: blockedIPs.size,
    whitelistedIPs: IP_WHITELIST.size,
    timestamp: new Date().toISOString(),
  };

  // Logger les statistiques
  logger.info('Rate limit statistics', {
    component: 'rateLimit',
    action: 'stats',
    ...stats,
  });

  return stats;
}

// Initialiser un intervalle pour le nettoyage périodique
if (typeof setInterval !== 'undefined') {
  // Nettoyage des entrées expirées (toutes les 5 minutes)
  setInterval(
    () => {
      try {
        const now = Date.now();

        // Nettoyer les IPs bloquées expirées
        for (const [ip, blockInfo] of blockedIPs.entries()) {
          if (blockInfo.until <= now) {
            blockedIPs.delete(ip);
          }
        }

        // Nettoyer les données de comportement trop anciennes (24 heures)
        for (const [key, data] of suspiciousBehavior.entries()) {
          if (now - data.lastSeen > 24 * 60 * 60 * 1000) {
            suspiciousBehavior.delete(key);
          }
        }

        // Nettoyer le cache de requêtes (garder seulement les 10000 plus récentes)
        if (requestCache.size > 10000) {
          const keys = Array.from(requestCache.keys());
          const keysToRemove = keys.slice(0, keys.length - 10000);
          keysToRemove.forEach((key) => requestCache.delete(key));
        }
      } catch (error) {
        logger.error('Error during rate limit cleanup', {
          error: error.message,
          stack: error.stack,
          component: 'rateLimit',
        });
      }
    },
    5 * 60 * 1000,
  );

  // Rapports statistiques périodiques (toutes les heures)
  const statsInterval = setInterval(
    () => {
      const stats = getRateLimitStats();

      captureMessage('Rate limit statistics (hourly)', {
        level: 'info',
        tags: {
          component: 'rateLimit',
          action: 'stats_reporting',
        },
        extra: stats,
      });
    },
    60 * 60 * 1000,
  );

  // Éviter de bloquer la fermeture du processus Node.js
  if (statsInterval.unref) {
    statsInterval.unref();
  }
}

export default {
  applyRateLimit,
  addToWhitelist,
  addToBlacklist,
  resetAllData,
  getRateLimitStats,
  RATE_LIMIT_PRESETS,
  VIOLATION_LEVELS,
};
