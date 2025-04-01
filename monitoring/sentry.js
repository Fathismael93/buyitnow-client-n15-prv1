// monitoring/sentry.js
import * as Sentry from '@sentry/nextjs';

/**
 * Initialise et configure Sentry pour la surveillance des erreurs
 * Cette fonction est appelée depuis _app.js
 */
export const initSentry = () => {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      environment: process.env.NODE_ENV,
      enabled: process.env.NODE_ENV === 'production',

      // Configurer les erreurs ignorées
      ignoreErrors: [
        // Erreurs réseau communes
        'Network request failed',
        'Failed to fetch',
        'NetworkError',
        'AbortError',
        'TypeError: Failed to fetch',

        // Erreurs de rendu React
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',

        // Erreurs de navigation
        'Cancel rendering route',
        'The operation was aborted',
        'Navigating to current location',

        // Erreurs de CSP
        'Content Security Policy',
        'violated directive',

        // Extensions de navigateur
        'chrome-extension',
        'safari-extension',
      ],

      // Ne pas suivre les erreurs pour certaines URL
      denyUrls: [
        // Ressources externes
        /^chrome:\/\//i,
        /^chrome-extension:\/\//i,
        /^moz-extension:\/\//i,
        /^safari-extension:\/\//i,

        // Ressources tierces
        /googletagmanager\.com/i,
        /analytics\.google\.com/i,
      ],

      // Configurer le traitement des breadcrumbs
      beforeBreadcrumb(breadcrumb) {
        // Filtrer certains types d'événements de breadcrumb
        if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
          // Masquer les URLs sensibles
          if (
            breadcrumb.data?.url?.includes('/auth') ||
            breadcrumb.data?.url?.includes('/login') ||
            breadcrumb.data?.url?.includes('/cart')
          ) {
            breadcrumb.data.url = '[Filtered URL]';
          }
        }
        return breadcrumb;
      },

      // Configurer le traitement des événements avant l'envoi
      beforeSend(event) {
        // Ne pas envoyer d'événements pour les pages d'authentification
        if (
          event.request?.url?.includes('/auth') ||
          event.request?.url?.includes('/login') ||
          event.request?.url?.includes('/register')
        ) {
          return null;
        }

        // Anonymiser les informations utilisateur
        if (event.user) {
          if (event.user.email) event.user.email = '[Filtered]';
          if (event.user.ip_address) event.user.ip_address = '[Filtered]';
        }

        // Anonymiser les données sensibles dans les URL
        if (event.request?.url) {
          const url = new URL(event.request.url);
          if (url.searchParams.has('token')) {
            url.searchParams.set('token', '[Filtered]');
            event.request.url = url.toString();
          }
        }

        return event;
      },
    });
  }
};

/**
 * Capture une exception avec des informations contextuelles supplémentaires
 * @param {Error} error - L'erreur à capturer
 * @param {Object} context - Contexte supplémentaire sur l'erreur
 */
export const captureException = (error, context = {}) => {
  Sentry.withScope((scope) => {
    // Ajouter des tags pour faciliter le filtrage dans Sentry
    Object.entries(context.tags || {}).forEach(([key, value]) => {
      scope.setTag(key, value);
    });

    // Ajouter des données supplémentaires
    Object.entries(context.extra || {}).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });

    // Définir le niveau de l'erreur
    if (context.level) {
      scope.setLevel(context.level);
    }

    // Capturer l'exception
    Sentry.captureException(error);
  });
};

/**
 * Capture un message avec des informations contextuelles supplémentaires
 * @param {string} message - Le message à capturer
 * @param {Object} context - Contexte supplémentaire sur le message
 */
export const captureMessage = (message, context = {}) => {
  Sentry.withScope((scope) => {
    // Ajouter des tags pour faciliter le filtrage dans Sentry
    Object.entries(context.tags || {}).forEach(([key, value]) => {
      scope.setTag(key, value);
    });

    // Ajouter des données supplémentaires
    Object.entries(context.extra || {}).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });

    // Définir le niveau du message
    if (context.level) {
      scope.setLevel(context.level);
    }

    // Capturer le message
    Sentry.captureMessage(message);
  });
};

/**
 * Enregistre l'utilisateur actuel dans Sentry pour le suivi des erreurs
 * @param {Object} user - Informations de l'utilisateur à enregistrer
 */
export const setUser = (user) => {
  if (!user) {
    Sentry.setUser(null);
    return;
  }

  // Ne jamais envoyer d'informations sensibles à Sentry
  Sentry.setUser({
    id: user.id || user._id,
    // Anonymiser l'email en ne conservant que son hachage
    email: user.email ? `${hashCode(user.email)}@anonymized.user` : undefined,
    role: user.role || 'user',
  });
};

/**
 * Fonction auxiliaire pour créer un hachage simple d'une chaîne
 * @param {string} str - La chaîne à hacher
 * @returns {string} - Le hachage en hexadécimal
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Conversion en 32bit integer
  }
  return Math.abs(hash).toString(16);
}

export default {
  initSentry,
  captureException,
  captureMessage,
  setUser,
};
