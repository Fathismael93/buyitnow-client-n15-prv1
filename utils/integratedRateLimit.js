/**
 * Utilitaire amélioré de rate limiting pour Next.js API Routes
 * Intégré avec Winston et Sentry pour un monitoring avancé
 */

import rateLimit from 'express-rate-limit';
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
    headers: true,
    standardHeaders: true, // 'RateLimit-*' headers
    legacyHeaders: false, // 'X-RateLimit-*' headers, désactivés car dépréciés
  },
  // API authentifiées (utilisateur connecté)
  AUTHENTICATED_API: {
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 requêtes par minute
    message: 'Trop de requêtes, veuillez réessayer plus tard',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false,
  },
  // Endpoints d'authentification (login/register)
  AUTH_ENDPOINTS: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // 10 tentatives par 10 minutes
    message:
      "Trop de tentatives d'authentification, veuillez réessayer plus tard",
    headers: true,
    standardHeaders: true,
    legacyHeaders: false,
  },
  // Endpoints critiques (paiement, etc.)
  CRITICAL_ENDPOINTS: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // 5 requêtes par 5 minutes
    message:
      'Trop de requêtes pour une opération critique, veuillez réessayer plus tard',
    headers: true,
    standardHeaders: true,
    legacyHeaders: false,
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

// Cache pour stocker les informations sur les comportements suspects
const SUSPICIOUS_BEHAVIOR_CACHE = new Map();

// Liste noire et liste blanche
const IP_BLACKLIST = new Set();
const IP_WHITELIST = new Set();

/**
 * Met en cache d'informations de comportement pour la détection avancée
 * @param {string} key - La clé d'identification
 * @param {Object} data - Les données à stocker
 */
function trackBehavior(key, data) {
  const existing = SUSPICIOUS_BEHAVIOR_CACHE.get(key) || {
    violations: 0,
    pattern: [],
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    endpoints: new Set(),
  };

  // Mettre à jour les informations
  existing.violations += data.violations || 0;
  existing.lastSeen = Date.now();
  if (data.endpoint) existing.endpoints.add(data.endpoint);

  // Suivre les modèles temporels (max 50 points)
  if (data.timestamp) {
    existing.pattern.push(data.timestamp);
    if (existing.pattern.length > 50) existing.pattern.shift();
  }

  SUSPICIOUS_BEHAVIOR_CACHE.set(key, existing);
}

/**
 * Vérifie si un comportement est suspect selon diverses heuristiques
 * @param {string} key - La clé d'identification
 * @returns {Object} Résultat de l'analyse avec niveau de menace
 */
function analyzeBehavior(key) {
  const data = SUSPICIOUS_BEHAVIOR_CACHE.get(key);
  if (!data) return { isSuspicious: false, threatLevel: 0 };

  let threatScore = 0;
  const results = { detectionPoints: [] };

  // 1. Nombre de violations
  if (data.violations >= 50) {
    threatScore += 5;
    results.detectionPoints.push('high_violation_count');
  } else if (data.violations >= 10) {
    threatScore += 2;
    results.detectionPoints.push('multiple_violations');
  }

  // 2. Distribution temporelle (détecter les modèles automatisés)
  if (data.pattern.length >= 5) {
    const intervals = [];
    for (let i = 1; i < data.pattern.length; i++) {
      intervals.push(data.pattern[i] - data.pattern[i - 1]);
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

  // 3. Diversité des endpoints (comportement de scan)
  if (data.endpoints.size >= 10) {
    threatScore += 3;
    results.detectionPoints.push('endpoint_scanning_behavior');
  }

  results.isSuspicious = threatScore >= 3;
  results.threatLevel = threatScore;
  return results;
}

/**
 * Règles graduelles de limitation selon le niveau de suspicion
 * @param {number} threatLevel - Niveau de menace détecté
 * @param {number} defaultLimit - Limite par défaut
 * @returns {number} Limite ajustée
 */
function getAdjustedLimit(threatLevel, defaultLimit) {
  if (threatLevel >= 5) return Math.max(1, Math.floor(defaultLimit * 0.1)); // 90% de réduction
  if (threatLevel >= 3) return Math.max(2, Math.floor(defaultLimit * 0.3)); // 70% de réduction
  if (threatLevel >= 1) return Math.max(5, Math.floor(defaultLimit * 0.7)); // 30% de réduction
  return defaultLimit;
}

/**
 * Fonction pour extraire l'IP réelle d'une requête
 * @param {Object} req - La requête HTTP
 * @returns {string} L'IP réelle du client
 */
function extractRealIp(req) {
  // Extraction améliorée de l'IP pour tenir compte des proxys
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const realIp = req.headers?.['x-real-ip'];
  return (
    (forwardedFor ? forwardedFor.split(',')[0].trim() : realIp) ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  );
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
 * Créer une instance de limiteur configurable avec monitoring avancé
 * @param {Object} options Options de configuration
 * @returns {Object} Middleware de rate limiting
 */
export function createRateLimiter(options = {}) {
  // Récupérer le préréglage ou utiliser PUBLIC_API par défaut
  const presetName = options.preset || 'PUBLIC_API';
  const presetConfig =
    RATE_LIMIT_PRESETS[presetName] || RATE_LIMIT_PRESETS.PUBLIC_API;

  const config = {
    ...presetConfig,
    ...options,
    skipFailedRequests: true,
    keyGenerator:
      options.keyGenerator ||
      ((req) => {
        const ip = extractRealIp(req);

        // Générer une clé unique pour ce type d'endpoint
        return `${options.prefix || presetName}:${ip}`;
      }),
    skip: (req) => {
      // Vérification des listes blanches/noires
      const ip = extractRealIp(req);

      // Toujours autoriser les IPs en liste blanche
      if (IP_WHITELIST.has(ip)) return true;

      // Toujours bloquer les IPs en liste noire
      if (IP_BLACKLIST.has(ip)) {
        logger.warn('Blocked request from blacklisted IP', {
          component: 'rateLimit',
          action: 'blocked_blacklisted',
          ip: anonymizeIp(ip),
          path: req.url,
        });
        return false; // Ne pas sauter la limite mais renvoyer un message personnalisé
      }

      // Appliquer le skip personnalisé si fourni
      if (options.skip && typeof options.skip === 'function') {
        return options.skip(req);
      }

      return false;
    },
    // Handler personnalisé avec logging avancé pour Next.js
    handler: (req, res, next, optionsUsed) => {
      // Générer un ID unique pour cet événement de limitation
      const eventId = uuidv4();

      // Extraire des informations sur la requête pour le logging
      const ip = extractRealIp(req);
      const method = req.method;
      const path = req.url || 'unknown';
      const userAgent = req.headers?.['user-agent'] || 'unknown';
      const referer = req.headers?.referer || 'unknown';

      // Créer une clé unique pour le suivi des comportements
      const behaviorKey = `${ip}:${userAgent.substring(0, 50)}`;

      // Analyser le comportement actuel
      const behaviorAnalysis = analyzeBehavior(behaviorKey);

      // Mise à jour des données de comportement
      trackBehavior(behaviorKey, {
        violations: 1,
        timestamp: Date.now(),
        endpoint: path,
      });

      // Déterminer le niveau de violation
      const limit = optionsUsed.max;
      const currentCount = req.rateLimit?.current || limit + 1;
      const violationRatio = currentCount / limit;

      let violationLevel = VIOLATION_LEVELS.LOW;
      for (const level of Object.values(VIOLATION_LEVELS)) {
        if (violationRatio >= level.threshold) {
          violationLevel = level;
        }
      }

      // Calculer la durée du blocage supplémentaire
      let blockDuration = 0;
      if (behaviorAnalysis.isSuspicious) {
        // Augmenter la durée de blocage pour les comportements suspects
        blockDuration =
          violationLevel.blockDuration *
          (1 + Math.min(behaviorAnalysis.threatLevel, 10) / 5);
      } else {
        blockDuration = violationLevel.blockDuration;
      }

      // Journalisation avancée de l'événement avec Winston
      logger.warn('Rate limit exceeded', {
        eventId,
        ip: anonymizeIp(ip),
        method,
        path,
        component: 'rateLimit',
        userAgent: userAgent.substring(0, 100), // Limiter la taille
        referer: referer.substring(0, 100),
        currentCount,
        limit,
        violationRatio: parseFloat(violationRatio.toFixed(2)),
        violationLevel: violationLevel.severity,
        blockDuration: `${Math.round(blockDuration / 1000)}s`,
        suspicious: behaviorAnalysis.isSuspicious,
        threatLevel: behaviorAnalysis.threatLevel,
        detectionPoints: behaviorAnalysis.detectionPoints,
      });

      // Envoi à Sentry pour les cas plus graves (MEDIUM et au-dessus)
      if (violationLevel.severity !== 'low') {
        captureMessage(
          `Rate limit violation detected: ${violationLevel.severity}`,
          {
            level: violationLevel.sentryLevel,
            tags: {
              component: 'rateLimit',
              violationLevel: violationLevel.severity,
              suspicious: behaviorAnalysis.isSuspicious.toString(),
            },
            extra: {
              ip: anonymizeIp(ip),
              path,
              method,
              currentCount,
              limit,
              blockDuration,
              detectionPoints: behaviorAnalysis.detectionPoints,
              threatLevel: behaviorAnalysis.threatLevel,
            },
          },
        );
      }

      // Envisager d'ajouter l'IP à la liste noire pour les violations graves répétées
      if (
        violationLevel.severity === 'severe' &&
        behaviorAnalysis.threatLevel >= 8
      ) {
        // Ajouter à la liste noire temporairement (24h)
        IP_BLACKLIST.add(ip);
        setTimeout(
          () => {
            IP_BLACKLIST.delete(ip);
          },
          24 * 60 * 60 * 1000,
        );

        logger.error(
          'Added IP to temporary blacklist due to severe violations',
          {
            ip: anonymizeIp(ip),
            eventId,
            component: 'rateLimit',
            action: 'blacklist_add',
          },
        );

        // Envoyer une alerte Sentry pour la mise en liste noire
        captureMessage('IP blacklisted due to severe rate limit violations', {
          level: 'error',
          tags: {
            component: 'rateLimit',
            action: 'blacklist_add',
          },
          extra: {
            ip: anonymizeIp(ip),
            threatLevel: behaviorAnalysis.threatLevel,
            detectionPoints: behaviorAnalysis.detectionPoints,
          },
        });
      }

      // Calculer le temps d'attente (Retry-After) avec le blocage supplémentaire
      const retryAfterBase = Math.ceil(options.windowMs / 1000);
      const retryAfter =
        blockDuration > 0
          ? retryAfterBase + Math.ceil(blockDuration / 1000)
          : retryAfterBase;

      // Envoyer la réponse avec les headers appropriés
      res.status(429);
      if (options.headers) {
        res.setHeader('Retry-After', retryAfter);
      }

      // Message personnalisé selon la gravité
      let message =
        options.message || 'Trop de requêtes, veuillez réessayer plus tard';
      if (
        violationLevel.severity === 'high' ||
        violationLevel.severity === 'severe'
      ) {
        message =
          'Limite de requêtes largement dépassée. Votre accès est temporairement restreint.';
      }

      res.json({
        status: 429,
        error: 'Too Many Requests',
        message,
        retryAfter,
        reference: eventId, // ID de référence pour le support
      });
    },
  };

  // Créer l'instance de limiteur
  return rateLimit(config);
}

/**
 * Middleware optimisé de rate limiting pour Next.js API Routes
 * @param {string} preset Nom du préréglage à utiliser
 * @param {Object} options Options supplémentaires
 * @returns {Function} Middleware Next.js
 */
export function applyRateLimit(preset = 'PUBLIC_API', options = {}) {
  // Créer le limiteur avec détection avancée
  const limiter = createRateLimiter({
    preset,
    ...options,
  });

  // Créer une fonction adaptée pour Next.js API Routes
  return async function middleware(req) {
    // Extraire le chemin pour le logging
    const path = req.url || req.nextUrl?.pathname || 'unknown';

    try {
      // Adapter la requête Next.js pour express-rate-limit
      // En créant un objet compatible avec les attentes d'express-rate-limit
      const adaptedReq = {
        ...req,
        ip: extractRealIp(req),
        path: path,
        method: req.method || 'GET',
        // Adapter les headers qui sont accessibles différemment dans Next.js
        headers: {
          ...req.headers,
          // Convertir les headers de Next.js (qui utilisent get()) en objet simple
          'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
          'user-agent': req.headers.get('user-agent') || '',
          'x-real-ip': req.headers.get('x-real-ip') || '',
          referer: req.headers.get('referer') || '',
        },
        // Ajouter une méthode "on" vide pour éviter l'erreur
        on: (event, callback) => {
          // Ne rien faire, juste éviter l'erreur
          return adaptedReq;
        },
        // Simuler d'autres propriétés d'Express si nécessaire
        socket: {
          remoteAddress: extractRealIp(req),
        },
      };

      // Créer un objet de réponse simulé pour express-rate-limit
      return new Promise((resolve) => {
        const res = {
          statusCode: 200,
          headers: {},
          status(code) {
            this.statusCode = code;
            return this;
          },
          setHeader(name, value) {
            this.headers[name] = value;
            console.log('Header set:', this.headers);
            return this;
          },
          json(body) {
            console.log('JSON response:', body);
            // Créer une réponse Next.js avec le statut 429 (Too Many Requests)
            const response = NextResponse.json(body, {
              status: this.statusCode,
              headers: this.headers,
            });
            resolve(response);
          },
          send(body) {
            const response = new NextResponse(
              typeof body === 'string' ? body : JSON.stringify(body),
              {
                status: this.statusCode,
                headers: {
                  ...this.headers,
                  'Content-Type': 'application/json',
                },
              },
            );
            resolve(response);
          },
          end() {
            const response = new NextResponse(null, {
              status: this.statusCode,
              headers: this.headers,
            });
            resolve(response);
          },
        };

        // Fonction next() - utilisée quand la requête n'est pas limitée
        const next = (err) => {
          if (err) {
            // Logging d'erreur amélioré avec Winston
            logger.error('Rate limit middleware error', {
              error: err.message,
              stack: err.stack,
              path,
              component: 'rateLimit',
            });

            // Capture d'exception avec Sentry
            captureException(err, {
              tags: {
                component: 'rateLimit',
                middleware: 'applyRateLimit',
              },
              extra: {
                path,
                preset,
              },
            });

            // En cas d'erreur interne, laisser passer quand même
            resolve(null);
            return;
          }

          // Pas d'erreur, pas de limitation - on laisse passer la requête
          resolve(null);
        };

        // Appliquer le middleware express-rate-limit avec nos objets adaptés
        limiter(adaptedReq, res, next);
      });
    } catch (error) {
      // Gestion robuste des erreurs avec Winston et Sentry
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

      // En cas d'erreur critique, laisser passer la requête (fail open)
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
  IP_BLACKLIST.add(ip);

  // Si durée spécifiée, prévoir la suppression automatique
  if (duration > 0) {
    setTimeout(() => {
      IP_BLACKLIST.delete(ip);
      logger.info('Removed IP from rate limit blacklist (timeout)', {
        ip: anonymizeIp(ip),
        component: 'rateLimit',
        action: 'blacklist_remove',
      });
    }, duration);
  }

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
  SUSPICIOUS_BEHAVIOR_CACHE.clear();
  // Note: Les limiteurs eux-mêmes ne peuvent pas être réinitialisés facilement
  // avec express-rate-limit sans Redis
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
    suspiciousBehaviors: SUSPICIOUS_BEHAVIOR_CACHE.size,
    blacklistedIPs: IP_BLACKLIST.size,
    whitelistedIPs: IP_WHITELIST.size,
    timestamp: new Date().toISOString(),
  };

  // Logger les statistiques périodiquement
  logger.info('Rate limit statistics', {
    component: 'rateLimit',
    action: 'stats',
    ...stats,
  });

  return stats;
}

// Initialiser un intervalle pour enregistrer les statistiques périodiquement (toutes les heures)
let statsInterval;
if (typeof setInterval !== 'undefined') {
  statsInterval = setInterval(
    () => {
      const stats = getRateLimitStats();

      // Envoyer des métriques à Sentry également
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
  ); // 1 heure

  // Éviter de bloquer la fermeture du processus Node.js
  if (statsInterval.unref) {
    statsInterval.unref();
  }
}

export default {
  createRateLimiter,
  applyRateLimit,
  addToWhitelist,
  addToBlacklist,
  resetAllData,
  getRateLimitStats,
  RATE_LIMIT_PRESETS,
  VIOLATION_LEVELS,
};
