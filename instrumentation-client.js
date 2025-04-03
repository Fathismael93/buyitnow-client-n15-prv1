/* eslint-disable prettier/prettier */
import * as Sentry from '@sentry/nextjs';
import { Replay } from '@sentry/replay';

// Vérification de l'environnement pour une configuration conditionnelle
const environment = process.env.NODE_ENV || 'development';
const isProd = environment === 'production';
const isStaging = environment === 'staging';
const isDev = environment === 'development';

// Détection du navigateur pour une meilleure catégorisation des erreurs
const detectBrowser = () => {
  if (typeof window === 'undefined') return 'server';

  const userAgent = window.navigator.userAgent;

  if (/firefox/i.test(userAgent)) return 'firefox';
  if (/chrome/i.test(userAgent)) return 'chrome';
  if (/safari/i.test(userAgent)) return 'safari';
  if (/edge/i.test(userAgent)) return 'edge';
  if (/msie|trident/i.test(userAgent)) return 'ie';

  return 'unknown';
};

// Vérifier si une URL contient des informations sensibles
const containsSensitiveInfo = (url) => {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    const sensitiveParams = [
      'token',
      'password',
      'pass',
      'pwd',
      'auth',
      'key',
      'apikey',
      'api_key',
      'secret',
      'credential',
      'email',
      'user',
      'username',
      'account',
      'reset',
      'access',
      'code',
      'otp',
    ];

    // Vérifier les paramètres de l'URL
    for (const param of sensitiveParams) {
      if (urlObj.searchParams.has(param)) {
        return true;
      }
    }

    // Vérifier le chemin de l'URL
    const sensitivePathSegments = [
      'login',
      'auth',
      'password-reset',
      'signup',
      'register',
      'checkout',
      'payment',
      'billing',
      'account',
      'profile',
      'admin',
      'settings',
      'verify',
      'confirmation',
    ];

    for (const segment of sensitivePathSegments) {
      if (urlObj.pathname.includes(segment)) {
        return true;
      }
    }
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    // Erreur de parsing d'URL
    return false;
  }

  return false;
};

// Vérification plus précise des erreurs réseau
const isNetworkError = (error) => {
  if (!error) return false;

  const errorMessage =
    typeof error === 'string' ? error : error.message || error.toString();

  const networkErrorPatterns = [
    /network/i,
    /fetch/i,
    /xhr/i,
    /request/i,
    /connect/i,
    /abort/i,
    /timeout/i,
    /offline/i,
    /failed to load/i,
    /cors/i,
    /cross-origin/i,
  ];

  return networkErrorPatterns.some((pattern) => pattern.test(errorMessage));
};

// Catégorisation des erreurs
const categorizeError = (error) => {
  if (!error) return 'unknown';

  const errorStr = typeof error === 'string' ? error : JSON.stringify(error);

  if (isNetworkError(error)) return 'network';

  if (/render|component|react|prop|invalid/i.test(errorStr)) {
    return 'render';
  }

  if (/load|chunk|module|import|require/i.test(errorStr)) {
    return 'loading';
  }

  if (
    /null|undefined|cannot read|not an object|not a function/i.test(errorStr)
  ) {
    return 'reference';
  }

  if (/syntax|type|argument|parameter/i.test(errorStr)) {
    return 'syntax';
  }

  return 'application';
};

// Configuration Sentry améliorée
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment,
  release: process.env.NEXT_PUBLIC_VERSION || '0.1.0',

  // Configuration de débogage
  debug: isDev,
  enabled:
    isProd ||
    isStaging ||
    (isDev && process.env.NEXT_PUBLIC_ENABLE_SENTRY_DEV === 'true'),

  // Traitement des erreurs selon leur catégorie
  beforeSend(event, hint) {
    // Ignorer les erreurs provenant d'extensions de navigateur
    if (
      event.request &&
      event.request.url &&
      (/^(chrome|moz|safari|edge)-extension:/.test(event.request.url) ||
        /^(chrome|moz|safari|edge):\/\//.test(event.request.url))
    ) {
      return null;
    }

    // Ajouter des informations sur le navigateur
    if (typeof window !== 'undefined') {
      event.tags = event.tags || {};
      event.tags.browser = detectBrowser();
      event.tags.screen_size = `${window.innerWidth}x${window.innerHeight}`;
      event.tags.device_type =
        window.innerWidth <= 768
          ? 'mobile'
          : window.innerWidth <= 1024
            ? 'tablet'
            : 'desktop';
    }

    // Analyser et catégoriser l'erreur
    const error = hint && hint.originalException;
    if (error) {
      const category = categorizeError(error);
      event.tags = event.tags || {};
      event.tags.error_category = category;

      // Échantillonnage différencié selon la catégorie
      if (category === 'network' && Math.random() > 0.1) {
        // N'envoyer que 10% des erreurs réseau
        return null;
      }
    }

    // Remove personal data
    if (event.user) {
      delete event.user.ip_address;
      if (event.user.email) {
        event.user.email = 'anonymized@example.com';
      }
    }

    // Filter out URL parameters that might contain sensitive data
    if (event.request && event.request.url) {
      try {
        if (containsSensitiveInfo(event.request.url)) {
          const url = new URL(event.request.url);

          // Supprimer tous les paramètres d'URL sensibles
          const sensitiveParams = [
            'token',
            'password',
            'accessToken',
            'key',
            'secret',
            'auth',
            'code',
            'email',
            'user',
            'username',
            'account',
            'api_key',
          ];

          sensitiveParams.forEach((param) => {
            if (url.searchParams.has(param)) {
              url.searchParams.set(param, '[FILTERED]');
            }
          });

          // Généraliser les URL des pages sensibles
          if (
            url.pathname.includes('/checkout') ||
            url.pathname.includes('/payment') ||
            url.pathname.includes('/billing')
          ) {
            event.request.url = `${url.origin}/[SENSITIVE-FINANCIAL-PAGE]`;
          } else if (
            url.pathname.includes('/account') ||
            url.pathname.includes('/profile') ||
            url.pathname.includes('/settings')
          ) {
            event.request.url = `${url.origin}/[SENSITIVE-ACCOUNT-PAGE]`;
          } else {
            event.request.url = url.toString();
          }
        }
        // eslint-disable-next-line no-unused-vars
      } catch (e) {
        // URL parsing failed, leave the original URL
      }
    }

    // Filtrer les données sensibles dans la stack trace
    if (event.exception && event.exception.values) {
      event.exception.values.forEach((exceptionValue) => {
        // Nettoyer le message d'erreur
        if (
          exceptionValue.value &&
          containsSensitiveInfo(exceptionValue.value)
        ) {
          exceptionValue.value =
            '[Message contenant des informations sensibles]';
        }

        // Nettoyer les frames de la stack trace
        if (exceptionValue.stacktrace && exceptionValue.stacktrace.frames) {
          exceptionValue.stacktrace.frames.forEach((frame) => {
            // Anonymiser les variables locales
            if (frame.vars) {
              Object.keys(frame.vars).forEach((key) => {
                if (
                  key.match(/password|token|auth|key|secret|credential|email/i)
                ) {
                  frame.vars[key] = '[FILTERED]';
                }

                // Pour les valeurs de variables qui pourraient contenir des infos sensibles
                const value = String(frame.vars[key] || '');
                if (containsSensitiveInfo(value)) {
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

  // Liste exhaustive des erreurs à ignorer
  ignoreErrors: [
    // Erreurs réseau
    'Network request failed',
    'Failed to fetch',
    'NetworkError',
    'AbortError',
    'TypeError: Failed to fetch',
    'Load failed',
    'net::ERR_',
    'TypeError: NetworkError',
    'TypeError: Network request failed',
    'Network Error',
    'network error',
    'timeout',
    'Timeout',
    'timeout of 0ms exceeded',
    'Fetch API cannot load',
    'TIMEOUT',
    'Request timed out',

    // Erreurs de navigation
    'ResizeObserver loop limit exceeded',
    'ResizeObserver Loop Limit Exceeded',
    'Non-Error promise rejection captured',
    'NEXT_REDIRECT',
    'NEXT_NOT_FOUND',
    'page unloaded',
    'document unloaded',
    'unmounted',
    'component unmounted',
    'Minified React error',
    'Canceled',
    'Operation was aborted',
    'navigation cancelled',
    'Route Cancelled',
    'aborted',
    'User aborted',
    'User denied',
    'cancel rendering route',
    'history push',

    // Erreurs de chargement
    'Loading chunk',
    'ChunkLoadError',
    'Loading CSS chunk',
    'Failed to load module script',
    'Loading module',
    'Module not found',
    'Cannot find module',
    'Failed to load resource',
    'Import error',
    'Dynamic require',

    // Erreurs de référence communes
    'Cannot read property',
    'null is not an object',
    'undefined is not an object',
    'Object Not Found Matching Id',
    'not a function',
    'is not a function',
    "can't access property",
    'is not defined',
    'is undefined',
    'has no properties',

    // Erreurs du navigateur
    'Script error',
    'JavaScript error',
    'Out of memory',
    'Quota exceeded',
    'Maximum call stack',
    'Stack overflow',
    'DOM Exception',
    'SecurityError',

    // Erreurs de plugins/extensions
    'extension',
    'plugin',
    'chrome-extension',
    'chrome://extensions',
    'moz-extension',
    'safari-extension',

    // Erreurs traquées ailleurs
    'top.GLOBALS',
    'originalCreateNotification',
    'canvas.contentDocument',
    'MyApp_RemoveAllHighlights',
    'http://tt.epicplay.com',
    "Can't find variable: ZiteReader",
    'jigsaw is not defined',
    'ComboSearch is not defined',
    'http://loading.retry.widdit.com/',
    'atomicFindClose',
    'fb_xd_fragment',
    'bmi_SafeAddOnload',
    'EBCallBackMessageReceived',
    'conduitPage',
    /__gcrweb/i,
    /blocked a frame with origin/i,
  ],

  // Patterns à ignorer (expressions régulières)
  denyUrls: [
    // Extensions de navigateur
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-extension:\/\//i,
    /^safari-web-extension:\/\//i,
    /^opera:\/\//i,
    /^edge:\/\//i,

    // Services tiers
    /googleusercontent\.com/i,
    /googlesyndication\.com/,
    /adservice\.google\./,
    /google-analytics\.com/,
    /googletagmanager\.com/,
    /hotjar\.com/,
    /facebook\.net/,
    /doubleclick\.net/,
    /bat\.bing\.com/,
    /connect\.facebook\.net/,
    /platform\.twitter\.com/,
    /static\.ads-twitter\.com/,
    /analytics\.tiktok\.com/,
    /snap\.licdn\.com/,
    /static\.cloudflareinsights\.com/,

    // Outils de marketing et analytics
    /hubspot\.com/,
    /cdn\.amplitude\.com/,
    /cdn\.optimizely\.com/,
    /cdn\.mouseflow\.com/,
    /app\.chameleon\.io/,
    /js\.intercomcdn\.com/,
    /cdn\.heapanalytics\.com/,
    /js\.driftt\.com/,
    /widget\.intercom\.io/,
    /js\.sentry-cdn\.com/,
    /browser\.sentry-cdn\.com/,
    /local\.walkme\.com/,

    // Domaines de contenus et CDNs
    /cdn\.cookielaw\.org/,
    /cdn\.jsdelivr\.net/,
    /cdnjs\.cloudflare\.com/,
    /code\.jquery\.com/,
    /unpkg\.com/,
  ],

  // Intégrations avancées
  integrations: [
    // Activation de Replay avec paramètres améliorés
    new Sentry.Replay({
      // Paramètres généraux
      maskAllText: true,
      blockAllMedia: true,
      maskAllInputs: true,

      // Paramètres avancés pour la protection de la vie privée
      blockClass: ['sensitive-data', 'private-info', 'payment-form'],
      blockSelector: 'input[type="password"], .credit-card-form, .address-form',
      maskTextSelector: 'h1[id], span[data-private]',
      ignoreClass: 'replay-ignore',

      // Configuration avancée du sampling
      // eslint-disable-next-line no-unused-vars
      sessionSampler: (context) => {
        if (typeof window !== 'undefined') {
          // Échantillonnage basé sur le chemin de l'URL
          const path = window.location.pathname;

          // Pages critiques: plus d'échantillons
          if (path.includes('/payment')) {
            return isProd ? 0.3 : 0.7; // 30% en prod, 70% ailleurs
          }

          // Pages de panier: échantillonnage moyen
          if (path.includes('/cart')) {
            return isProd ? 0.1 : 0.5;
          }

          // Pages de produit: échantillonnage faible
          if (path.includes('/product') || path.includes('/category')) {
            return isProd ? 0.05 : 0.2;
          }
        }

        // Autres pages: échantillonnage minimal
        return isProd ? 0.01 : 0.1;
      },
    }),
  ],
});
