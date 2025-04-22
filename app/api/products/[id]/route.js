/* eslint-disable no-unused-vars */
import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { headers } from 'next/headers';

import dbConnect from '@/backend/config/dbConnect';
import Product from '@/backend/models/product';
import { createRateLimiter, RATE_LIMIT_ALGORITHMS } from '@/utils/rateLimit';
import { getCacheHeaders } from '@/utils/cache';
import { captureException } from '@/monitoring/sentry';
import logger from '@/utils/logger';

// Configuration de la mise en cache (revalidation toutes les heures)
export const revalidate = 3600;

// Configuration des constantes
const QUERY_TIMEOUT = parseInt(process.env.QUERY_TIMEOUT || 5000); // 5 secondes par défaut
const SAFE_FIELDS =
  'name description price images category stock sold isActive slug';

// Création d'un rate limiter spécifique pour les détails de produit
const productDetailRateLimiter = createRateLimiter('PUBLIC_API', {
  prefix: 'product-detail',
  limit: 60, // 60 requêtes par minute
  interval: 60 * 1000, // 1 minute
  algorithm: RATE_LIMIT_ALGORITHMS.SLIDING_WINDOW,
  blockDuration: 5 * 60 * 1000, // 5 minutes de blocage après abus
});

/**
 * Gestionnaire GET pour récupérer les détails d'un produit
 * @param {Request} req - Requête entrante
 * @param {Object} params - Paramètres de route, contient l'ID du produit
 * @returns {Promise<NextResponse>} - Réponse au format JSON
 */
export async function GET(req, { params }) {
  const start = Date.now();
  const headersList = headers();
  const requestId = headersList.get('x-request-id') || `prod-${Date.now()}`;

  try {
    // Vérifier le rate limiting
    let rateLimitInfo, rateLimitHeaders;

    try {
      rateLimitInfo = await productDetailRateLimiter.check(req);
      rateLimitHeaders = rateLimitInfo.headers || {};
    } catch (error) {
      if (error.statusCode === 429) {
        logger.warn('Rate limit exceeded for product detail', {
          ip: headersList.get('x-forwarded-for') || 'unknown',
          requestId,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'Trop de requêtes, veuillez réessayer plus tard',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: error.headers?.['Retry-After'] || 60,
          },
          {
            status: 429,
            headers: {
              ...error.headers,
              'Retry-After': error.headers?.['Retry-After'] || 60,
            },
          },
        );
      }
      // Si l'erreur n'est pas de rate limiting, on continue
    }

    // Validation de l'ID MongoDB
    const { id } = params;
    if (!id || !isValidObjectId(id)) {
      return NextResponse.json(
        {
          success: false,
          message: "Format d'identifiant de produit invalide",
          code: 'INVALID_ID_FORMAT',
        },
        {
          status: 400,
          headers: {
            ...rateLimitHeaders,
            'Content-Security-Policy': "default-src 'self'",
            'X-Content-Type-Options': 'nosniff',
          },
        },
      );
    }

    // Connexion à la base de données avec timeout
    const connectionPromise = dbConnect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Database connection timeout')),
        QUERY_TIMEOUT,
      );
    });

    const connectionInstance = await Promise.race([
      connectionPromise,
      timeoutPromise,
    ]);

    if (!connectionInstance.connection) {
      throw new Error('Database connection failed');
    }

    // Récupération simultanée du produit et des produits similaires pour optimisation
    const [product, healthCheck] = await Promise.all([
      // Récupération du produit avec timeout
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Product query timeout exceeded'));
        }, QUERY_TIMEOUT);

        Product.findById(id)
          .select(SAFE_FIELDS)
          .populate('category', 'categoryName')
          .lean() // Convertir en objet JavaScript pur pour performance
          .then((result) => {
            clearTimeout(timeout);
            resolve(result);
          })
          .catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
      }),

      // Vérification de santé de la DB en parallèle
      connectionInstance.connection.db
        .admin()
        .ping()
        .catch(() => false),
    ]);

    // Si le produit n'existe pas
    if (!product) {
      logger.info('Product not found', {
        productId: id,
        requestId,
        duration: Date.now() - start,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Produit non trouvé',
          code: 'PRODUCT_NOT_FOUND',
        },
        {
          status: 404,
          headers: {
            ...rateLimitHeaders,
            'Content-Security-Policy': "default-src 'self'",
            'X-Content-Type-Options': 'nosniff',
          },
        },
      );
    }

    // Récupération des produits similaires en parallèle avec le produit principal
    const sameCategoryProducts = await Promise.race([
      Product.findSimilarProductsLite(product.category),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Similar products query timeout')),
          QUERY_TIMEOUT,
        );
      }),
    ]).catch(() => []); // En cas d'erreur, retourner un tableau vide

    // Logging de performance
    const duration = Date.now() - start;
    logger.info('Product retrieved successfully', {
      productId: id,
      category: product.category?.categoryName || 'unknown',
      requestId,
      duration,
      similarCount: sameCategoryProducts.length,
    });

    // Réponse avec cache et headers de sécurité
    return NextResponse.json(
      {
        success: true,
        data: {
          product,
          sameCategoryProducts,
        },
      },
      {
        status: 200,
        headers: {
          ...getCacheHeaders('products'),
          ...rateLimitHeaders,
          'X-Cache': 'MISS',
          'Content-Security-Policy': "default-src 'self'",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          ETag: `"${product._id}-${product.updatedAt || Date.now()}"`,
        },
      },
    );
  } catch (error) {
    // Monitorer l'erreur avec Sentry
    captureException(error, {
      tags: {
        action: 'get_product_detail',
        productId: params.id,
      },
      extra: {
        requestId,
        error: {
          name: error.name,
          message: error.message,
          stack:
            process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      },
      level: error.name === 'ValidationError' ? 'warning' : 'error',
    });

    // Logging structuré
    logger.error('Error retrieving product', {
      productId: params.id,
      error: error.message,
      errorName: error.name,
      requestId,
      duration: Date.now() - start,
    });

    // Classification des erreurs pour des réponses appropriées
    if (error.name === 'CastError' || error.message.includes('ObjectId')) {
      return NextResponse.json(
        {
          success: false,
          message: "Format d'identifiant de produit invalide",
          code: 'INVALID_ID_FORMAT',
        },
        { status: 400 },
      );
    } else if (error.name === 'ValidationError') {
      return NextResponse.json(
        {
          success: false,
          message: 'Données de produit invalides',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 },
      );
    } else if (
      error.message.includes('timeout') ||
      error.name === 'TimeoutError'
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'La requête a pris trop de temps',
          code: 'TIMEOUT_ERROR',
        },
        { status: 504 },
      );
    } else if (
      error.message.includes('connection') ||
      error.name === 'MongoNetworkError'
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'Erreur de connexion à la base de données',
          code: 'DB_CONNECTION_ERROR',
        },
        { status: 503 },
      );
    }

    // Réponse d'erreur générique (pour toute autre erreur)
    return NextResponse.json(
      {
        success: false,
        message:
          'Une erreur interne est survenue, veuillez réessayer ultérieurement',
        code: 'INTERNAL_SERVER_ERROR',
        ...(process.env.NODE_ENV === 'development' && {
          details: error.message,
          stack: error.stack,
        }),
      },
      { status: 500 },
    );
  }
}
