import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Category from '@/backend/models/category';
import { createRateLimiter } from '@/utils/rateLimit';
import logger from '@/utils/logger';
import { captureException } from '@/monitoring/sentry';
import {
  MemoryCache,
  CACHE_CONFIGS,
  getCacheHeaders,
  getCacheKey,
  cacheEvents,
  appCache,
} from '@/utils/cache';

// Utiliser le cache prédéfini dans appCache si disponible, ou en créer un nouveau
const categoryCache = appCache.categories;

// Configurez un rate limiter optimisé pour cette route spécifique
const rateLimiter = createRateLimiter('PUBLIC_API', {
  prefix: 'api:category',
  // Stratégie adaptative: limiter par utilisateur si connecté, sinon par IP
  getTokenFromReq: (req) => {
    // Si l'utilisateur est authentifié, utiliser son ID
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    // Sinon utiliser l'IP (comportement par défaut)
    return null;
  },
  // Ignorer le rate limiting pour les administrateurs ou en mode développement
  skip: (req) => {
    return (
      process.env.NODE_ENV === 'development' ||
      (req.user && req.user.isAdmin === true)
    );
  },
});

// Créer le middleware Next.js optimisé
const rateLimitMiddleware = rateLimiter.middleware({
  // Handler personnalisé pour réponses adaptées au format de l'API
  handler: (error, req) => {
    const retryAfter = error.headers?.['Retry-After'] || 60;

    // Journalisation structurée de l'événement
    logger.warn(`Rate limit exceeded for categories API`, {
      component: 'categoryAPI',
      path: '/api/category',
      retryAfter,
      userAgent: req.headers['user-agent'],
    });

    // Réponse formatée selon la convention de l'API
    return NextResponse.json(
      {
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: parseInt(retryAfter, 10),
      },
      {
        status: 429,
        headers: error.headers || {
          'Retry-After': retryAfter,
        },
      },
    );
  },
});

// Enregistrer des événements pour monitorer le comportement du cache
cacheEvents.on('hit', (data) => {
  if (data.cache.name === 'categories') {
    logger.debug(`Cache hit for ${data.key}`, {
      component: 'categoryAPI',
      cacheKey: data.key,
    });
  }
});

cacheEvents.on('miss', (data) => {
  if (data.cache.name === 'categories') {
    logger.debug(`Cache miss for ${data.key}`, {
      component: 'categoryAPI',
      cacheKey: data.key,
    });
  }
});

/**
 * Génère une clé de cache en fonction des paramètres de requête
 * @param {Request} req - Requête Next.js
 * @returns {string} - Clé de cache unique
 */
function generateCacheKey(req) {
  try {
    const url = new URL(req.url);

    return getCacheKey('categories', {
      // Hash partiel de l'URL pour les paramètres supplémentaires non traités
      urlHash: url.pathname,
    });
  } catch (error) {
    logger.warn(`Error generating cache key: ${error.message}`, {
      component: 'categoryAPI',
      error,
    });

    // Clé de fallback
    return 'categories:default';
  }
}

/**
 * Handler GET pour les catégories avec rate limiting et caching optimisés
 */
export async function GET(req) {
  const cacheKey = generateCacheKey(req);
  const startTime = performance.now();

  try {
    // 1. Vérifier le rate limiting via middleware
    try {
      await rateLimitMiddleware(
        req,
        {
          setHeader: () => {}, // Adaptation pour Next.js App Router
        },
        () => {},
      );
    } catch (error) {
      // Le middleware a déjà géré la réponse
      return error;
    }

    // 2. Vérifier si les données sont en cache en utilisant getWithLock pour gérer la concurrence
    const cachedResult = await categoryCache.getWithLock(cacheKey);

    if (cachedResult) {
      const { categories, timestamp, version } = cachedResult;

      logger.debug('Categories served from cache', {
        component: 'categoryAPI',
        cached: true,
        age: Date.now() - timestamp,
        count: categories.length,
      });

      // Préparer les headers optimisés pour le cache
      const cacheHeaders = {
        ...getCacheHeaders('categories'),
        'X-Cache': 'HIT',
        'X-Cache-Age': `${Math.floor((Date.now() - timestamp) / 1000)}s`,
      };

      return NextResponse.json(
        {
          success: true,
          data: {
            categories,
            count: categories.length,
            cached: true,
            timestamp,
            version,
          },
        },
        {
          status: 200,
          headers: cacheHeaders,
        },
      );
    }

    // 3. Si pas en cache, connecter à la DB avec timeout
    const connectionPromise = dbConnect();

    // Ajouter un timeout pour éviter que la connexion DB ne bloque indéfiniment
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout')), 5000);
    });

    const connectionInstance = await Promise.race([
      connectionPromise,
      timeoutPromise,
    ]);

    if (!connectionInstance.connection) {
      logger.error('Database connection failed in categories API', {
        component: 'categoryAPI',
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed. Please try again later.',
        },
        {
          status: 503, // Service Unavailable est plus approprié ici
          headers: {
            'Cache-Control':
              'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
          },
        },
      );
    }

    // Construire la requête de base
    let query = Category.find({ isActive: true });

    // 4. Récupérer et mettre en cache les catégories avec optimisations
    const categories = await query
      .select('categoryName') // Sélectionner seulement les champs nécessaires
      .sort({ categoryName: 1 })
      .lean() // Convertir en objets JS simples pour meilleures performances
      .exec();

    // 5. Mettre en cache les résultats avec des métadonnées utiles
    const categoryData = {
      categories,
      timestamp: Date.now(),
      version: process.env.APP_VERSION || '1.0.0',
    };

    // Utiliser une fonction de hachage pour vérifier si le contenu a changé
    const contentHash = JSON.stringify(categories).length.toString(36);

    // Mettre en cache avec des options avancées
    categoryCache.set(cacheKey, categoryData, {
      metadata: {
        count: categories.length,
        hash: contentHash,
        generated: new Date().toISOString(),
      },
    });
    logger.info('Categories fetched successfully', {
      component: 'categoryAPI',
      count: categories.length,
      cacheKey,
      responseTime: Math.floor(performance.now() - startTime),
    });

    // 6. Répondre avec les headers optimisés
    return NextResponse.json(
      {
        success: true,
        data: {
          categories,
          count: categories.length,
        },
      },
      {
        status: 200,
        headers: {
          ...getCacheHeaders('categories'),
          'X-Cache': 'MISS',
          'X-Response-Time': `${Math.floor(performance.now() - startTime)}ms`,
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
    );
  } catch (error) {
    // Capturer l'exception avec contexte enrichi
    captureException(error, {
      tags: { component: 'categoryAPI' },
      extra: {
        path: '/api/category',
        method: 'GET',
        timestamp: new Date().toISOString(),
        cacheKey,
        responseTime: Math.floor(performance.now() - startTime),
      },
    });

    logger.error(`Error in categories API: ${error.message}`, {
      error,
      component: 'categoryAPI',
      stack: error.stack,
    });

    // Réponse d'erreur sécurisée
    return NextResponse.json(
      {
        success: false,
        message: 'An unexpected error occurred. Our team has been notified.',
        errorId: error.id || Date.now().toString(36), // ID unique pour traçabilité
        // Ne jamais exposer les détails d'erreur en production
        ...(process.env.NODE_ENV === 'development' && {
          details: error.message,
        }),
      },
      {
        status: error.status || 500,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      },
    );
  }
}

// Fonction utilitaire pour invalider le cache des catégories
// Exposée pour être utilisée par d'autres parties de l'application
export function invalidateCategoriesCache() {
  try {
    const invalidated = categoryCache.invalidatePattern(/^categories:/);

    logger.info(`Categories cache invalidated`, {
      component: 'categoryAPI',
      entriesInvalidated: invalidated,
    });

    return invalidated;
  } catch (error) {
    logger.error(`Failed to invalidate categories cache: ${error.message}`, {
      error,
      component: 'categoryAPI',
    });

    return 0;
  }
}
