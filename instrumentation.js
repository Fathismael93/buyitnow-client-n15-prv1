/* eslint-disable prettier/prettier */
/* eslint-disable no-unused-vars */
// instrumentation.js
import { EventEmitter } from 'events';

// Augmenter la limite d'écouteurs d'événements pour éviter l'avertissement
if (typeof EventEmitter !== 'undefined') {
  EventEmitter.defaultMaxListeners = 20;
}

// ----- FONCTIONS CENTRALISÉES D'ANONYMISATION ET DE FILTRAGE -----

// Fonction pour valider le format d'un DSN Sentry
function isValidDSN(dsn) {
  if (!dsn) return false;
  // Format approximatif d'un DSN valide: https://{PUBLIC_KEY}@{HOST}/{PROJECT_ID}
  return /^https:\/\/[^@]+@[^/]+\/\d+$/.test(dsn);
}

// Fonction pour détecter les données sensibles
function containsSensitiveData(str) {
  if (!str || typeof str !== 'string') return false;

  // Patterns pour détecter les données sensibles
  const patterns = [
    /password/i,
    /mot\s*de\s*passe/i,
    /credit\s*card/i,
    /carte\s*de\s*credit/i,
    /\b(?:\d{4}[ -]?){3}\d{4}\b/, // Numéros de carte
    /\b(?:\d{3}[ -]?){2}\d{4}\b/, // Numéros de téléphone
    /\b\d{3}[ -]?\d{2}[ -]?\d{4}\b/, // SSN
    /auth\s*token/i,
    /jwt/i,
    /api[_-]?key/i,
    /secret[_-]?key/i,
  ];

  return patterns.some((pattern) => pattern.test(str));
}

// Classification des erreurs par catégorie
function categorizeError(error) {
  if (!error) return 'unknown';

  const message = error.message || '';
  const name = error.name || '';

  if (/mongo|database|db|connection|timeout/i.test(message + name)) {
    return 'database';
  }

  if (/network|fetch|http|request|response|api/i.test(message + name)) {
    return 'network';
  }

  if (/auth|permission|token|unauthorized|forbidden/i.test(message + name)) {
    return 'authentication';
  }

  if (/validation|schema|required|invalid/i.test(message + name)) {
    return 'validation';
  }

  return 'application';
}

// ----- NOUVELLES FONCTIONS CENTRALISÉES D'ANONYMISATION -----

// Fonction centralisée pour anonymiser les URLs
function anonymizeUrl(url) {
  if (!url) return url;

  try {
    const urlObj = new URL(url);
    const sensitiveParams = [
      'token',
      'password',
      'accessToken',
      'key',
      'secret',
      'auth',
      'api_key',
      'apikey',
      'pass',
      'pwd',
      'credential',
    ];

    let hasFilteredParams = false;
    sensitiveParams.forEach((param) => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[FILTERED]');
        hasFilteredParams = true;
      }
    });

    return hasFilteredParams ? urlObj.toString() : url;
  } catch (e) {
    // URL parsing failed, retourner l'original
    return url;
  }
}

// Fonction centralisée pour anonymiser les données utilisateur
function anonymizeUserData(userData) {
  if (!userData) return userData;

  const anonymizedData = { ...userData };

  // Supprimer les informations très sensibles
  delete anonymizedData.ip_address;
  delete anonymizedData.username;

  // Anonymiser l'email s'il existe
  if (anonymizedData.email) {
    const atIndex = anonymizedData.email.indexOf('@');
    if (atIndex > 0) {
      const domain = anonymizedData.email.slice(atIndex);
      anonymizedData.email = `${anonymizedData.email[0]}***${domain}`;
    } else {
      anonymizedData.email = '[FILTERED]';
    }
  }

  // Anonymiser l'ID s'il existe
  if (anonymizedData.id) {
    anonymizedData.id =
      anonymizedData.id.substring(0, 2) + '...' + anonymizedData.id.slice(-2);
  }

  return anonymizedData;
}

// Fonction centralisée pour anonymiser les headers
function anonymizeHeaders(headers) {
  if (!headers) return headers;

  const sanitizedHeaders = { ...headers };
  const sensitiveHeaders = [
    'cookie',
    'authorization',
    'x-auth-token',
    'session',
    'x-api-key',
    'token',
    'auth',
  ];

  sensitiveHeaders.forEach((header) => {
    if (sanitizedHeaders[header]) {
      sanitizedHeaders[header] = '[FILTERED]';
    }
  });

  return sanitizedHeaders;
}

// Fonction centralisée pour filtrer le corps des requêtes
function filterRequestBody(body) {
  if (!body) return body;

  if (containsSensitiveData(body)) {
    try {
      if (typeof body === 'string') {
        const parsedBody = JSON.parse(body);
        return {
          filtered: '[CONTIENT DES DONNÉES SENSIBLES]',
          bodySize: JSON.stringify(parsedBody).length,
        };
      }
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // Parsing JSON échoué
    }
    return '[DONNÉES FILTRÉES]';
  }

  return body;
}

export async function register() {
  const sentryDSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const environment = process.env.NODE_ENV || 'development';
  const isProduction = environment === 'production';

  if (sentryDSN && isValidDSN(sentryDSN)) {
    try {
      const Sentry = await import('@sentry/nextjs');

      Sentry.init({
        dsn: sentryDSN,
        environment,
        release: process.env.NEXT_PUBLIC_VERSION || '0.1.0',
        debug: !isProduction,
        enabled: isProduction,

        // Common server-side ignore rules
        ignoreErrors: [
          // Erreurs réseau
          'Connection refused',
          'Connection reset',
          'ECONNREFUSED',
          'ECONNRESET',
          'socket hang up',
          'ETIMEDOUT',
          'read ECONNRESET',
          'connect ETIMEDOUT',

          // Erreurs de parsing
          'Unexpected token',
          'SyntaxError',
          'JSON.parse',

          // Erreurs de certificat
          'DEPTH_ZERO_SELF_SIGNED_CERT',
          'CERT_HAS_EXPIRED',
          'ssl3_get_server_certificate',

          // Erreurs de DNS
          'getaddrinfo ENOTFOUND',
          'getaddrinfo EAI_AGAIN',

          // Erreurs de base de données
          'database timeout',
          'MongoNetworkError',
          'MongoError',
          'SequelizeConnectionError',

          // Erreurs Next.js
          'NEXT_REDIRECT',
          'NEXT_NOT_FOUND',
          'Cancelled',
          'Route cancelled',

          // Erreurs d'opérations abandonnées
          'AbortError',
          'Operation was aborted',
        ],

        // Utiliser les fonctions centralisées pour le traitement des breadcrumbs
        // hint est fourni par l'API Sentry mais n'est pas utilisé dans l'implémentation actuelle
        // eslint-disable-next-line no-unused-vars
        beforeBreadcrumb(breadcrumb, hint) {
          // Éviter d'enregistrer des informations sensibles dans les breadcrumbs
          if (
            ['xhr', 'fetch'].includes(breadcrumb.category) &&
            breadcrumb.data
          ) {
            // Vérifier et filtrer les URL
            if (breadcrumb.data.url) {
              if (containsSensitiveData(breadcrumb.data.url)) {
                // Utiliser la fonction centralisée
                breadcrumb.data.url = anonymizeUrl(breadcrumb.data.url);
                breadcrumb.data.params = '[CONTIENT DES DONNÉES SENSIBLES]';
              }
            }

            // Vérifier et filtrer les corps de requête
            if (breadcrumb.data.body) {
              // Utiliser la fonction centralisée
              const filteredResult = filterRequestBody(breadcrumb.data.body);
              if (
                typeof filteredResult === 'object' &&
                filteredResult.filtered
              ) {
                breadcrumb.data.body = filteredResult.filtered;
                breadcrumb.data.bodySize = filteredResult.bodySize;
              } else if (filteredResult !== breadcrumb.data.body) {
                breadcrumb.data.body = filteredResult;
              }
            }
          }

          return breadcrumb;
        },

        // Utiliser les fonctions centralisées pour anonymiser des données sensibles
        beforeSend(event, hint) {
          const error = hint && hint.originalException;

          // Ajouter la catégorie d'erreur
          if (error) {
            event.tags = event.tags || {};
            event.tags.error_category = categorizeError(error);
          }

          // Anonymiser les headers en utilisant la fonction centralisée
          if (event.request && event.request.headers) {
            event.request.headers = anonymizeHeaders(event.request.headers);
          }

          // Anonymiser les cookies
          if (event.request && event.request.cookies) {
            event.request.cookies = '[FILTERED]';
          }

          // Anonymiser les données utilisateurs en utilisant la fonction centralisée
          if (event.user) {
            event.user = anonymizeUserData(event.user);
          }

          // Anonymiser les URL avec paramètres sensibles en utilisant la fonction centralisée
          if (event.request && event.request.url) {
            event.request.url = anonymizeUrl(event.request.url);
          }

          // Filtrer les données dans le message d'erreur lui-même
          if (event.message && containsSensitiveData(event.message)) {
            event.message = `[Message filtré contenant des informations sensibles] ${
              event.message.substring(0, 20) + '...'
            }`;
          }

          // Filtrer les données sensibles dans les frames de stack
          if (event.exception && event.exception.values) {
            event.exception.values.forEach((exceptionValue) => {
              if (
                exceptionValue.stacktrace &&
                exceptionValue.stacktrace.frames
              ) {
                exceptionValue.stacktrace.frames.forEach((frame) => {
                  if (frame.vars) {
                    Object.keys(frame.vars).forEach((key) => {
                      const value = String(frame.vars[key] || '');
                      if (
                        containsSensitiveData(key) ||
                        containsSensitiveData(value)
                      ) {
                        frame.vars[key] = '[FILTERED]';
                      }
                    });
                  }
                });
              }
            });
          }

          return event;
        },
      });

      console.log('Sentry initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }
  } else {
    console.warn(
      'Invalid or missing Sentry DSN. Sentry will not be initialized.',
    );
  }
}

// Ajout de l'instrumentation onRequestError pour les composants serveur React
export function onRequestError({ error, request }) {
  try {
    // Importer Sentry de manière synchrone pour l'accès au hook onRequestError
    const Sentry = require('@sentry/nextjs');

    // Ajouter des contextes supplémentaires pour mieux comprendre l'erreur
    const context = {
      route: request.url,
      method: request.method,
      headers: {}, // Ne pas inclure tous les headers pour éviter les données sensibles
      errorCategory: categorizeError(error),
    };

    // Ajouter certains headers utiles sans informations sensibles
    const safeHeaders = [
      'user-agent',
      'referer',
      'accept-language',
      'content-type',
    ];
    safeHeaders.forEach((header) => {
      const value =
        request.headers && request.headers.get && request.headers.get(header);
      if (value) {
        context.headers[header] = value;
      }
    });

    // Ajouter des informations sur la requête
    Sentry.setContext('request', context);

    // Ajouter des informations sur l'utilisateur (anonymisées)
    if (request.auth && request.auth.userId) {
      Sentry.setUser({
        id:
          request.auth.userId.substring(0, 2) +
          '...' +
          request.auth.userId.slice(-2),
        role: request.auth.role || 'user',
      });
    }

    // Capturer l'erreur avec des informations supplémentaires
    Sentry.captureException(error, {
      tags: {
        component: 'server',
        error_category: categorizeError(error),
      },
    });
  } catch (e) {
    console.error('Error in onRequestError:', e);
  }
}
