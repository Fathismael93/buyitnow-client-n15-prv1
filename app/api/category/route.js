import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Category from '@/backend/models/category';
import { createRateLimiter } from '@/utils/rateLimit';
import logger from '@/utils/logger';
import { captureException } from '@/monitoring/sentry';
import { MemoryCache } from '@/utils/cache';

// Cache des catégories avec un TTL de 5 minutes
// Les catégories ne changent pas souvent, donc la mise en cache est idéale
const categoryCache = new MemoryCache({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100, // Limite raisonnable pour éviter l'explosion de la mémoire
  name: 'categories-cache',
});

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
  handler: (error, req, res, next) => {
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

/**
 * Handler GET pour les catégories avec rate limiting et caching optimisés
 */
export async function GET(req) {
  const cacheKey = 'all-categories';

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

    // 2. Vérifier si les données sont en cache
    const cachedCategories = categoryCache.get(cacheKey);
    if (cachedCategories) {
      logger.debug('Categories served from cache', {
        component: 'categoryAPI',
        cached: true,
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            categories: cachedCategories,
            cached: true,
          },
        },
        {
          status: 200,
          headers: {
            'X-Cache': 'HIT',
            'Cache-Control': 'public, max-age=300',
          },
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
        { status: 503 }, // Service Unavailable est plus approprié ici
      );
    }

    // 4. Récupérer et mettre en cache les catégories
    const categories = await Category.find()
      .select('categoryName slug image count') // Sélectionner seulement les champs nécessaires
      .sort({ categoryName: 1 })
      .lean() // Convertir en objets JS simples pour meilleures performances
      .cache(60); // Utiliser le cache de la DB si disponible

    // 5. Mettre en cache les résultats
    categoryCache.set(cacheKey, categories);

    logger.info('Categories fetched successfully', {
      component: 'categoryAPI',
      count: categories.length,
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
          'X-Cache': 'MISS',
          'Cache-Control': 'public, max-age=300',
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
