/* eslint-disable no-unused-vars */
import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Product from '@/backend/models/product';
import Category from '@/backend/models/category';
import APIFilters from '@/backend/utils/APIFilters';
import {
  categorySchema,
  maxPriceSchema,
  minPriceSchema,
  pageSchema,
  searchSchema,
} from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';
import { getCacheHeaders, getCacheKey } from '@/utils/cache';
import { appCache } from '@/utils/cache';
// import { applyRateLimit } from '@/utils/integratedRateLimit';
// Importer les fonctions de sanitisation
import {
  sanitizeProductSearchParams,
  buildSanitizedSearchParams,
} from '@/utils/inputSanitizer';

// Constantes pour la configuration
const QUERY_TIMEOUT = parseInt(process.env.QUERY_TIMEOUT || 5000); // 5 secondes par défaut
const DEFAULT_PER_PAGE = parseInt(process.env.DEFAULT_PRODUCTS_PER_PAGE || 10);
const MAX_PER_PAGE = parseInt(process.env.MAX_PRODUCTS_PER_PAGE || 50);

// Création d'un middleware de rate limiting pour l'API de produits
// const productsRateLimiter = applyRateLimit('PUBLIC_API', {
//   prefix: 'products-api',
// });

export async function GET(req) {
  try {
    // Appliquer le rate limiting et obtenir une réponse si la limite est dépassée
    // const rateLimitResponse = await productsRateLimiter(req);

    // Si une réponse de rate limit est retournée, la renvoyer immédiatement
    // if (rateLimitResponse) {
    //   return rateLimitResponse;
    // }

    // Validation avec les schémas Yup après sanitisation
    const validationPromises = [];
    const validationErrors = [];

    // Validation du mot-clé de recherche
    if (req?.nextUrl?.searchParams?.get('keyword')) {
      validationPromises.push(
        searchSchema
          .validate(
            { keyword: req?.nextUrl?.searchParams?.get('keyword') },
            { abortEarly: false },
          )
          .catch((err) => {
            validationErrors.push({
              field: 'keyword',
              message: err.errors[0],
            });
          }),
      );
    }

    // Validation de la catégorie
    if (req?.nextUrl?.searchParams?.get('category')) {
      validationPromises.push(
        categorySchema
          .validate(
            { value: req?.nextUrl?.searchParams?.get('category') },
            { abortEarly: false },
          )
          .catch((err) => {
            validationErrors.push({
              field: 'category',
              message: err.errors[0],
            });
          }),
      );
    }

    // Validation du prix minimum
    if (req?.nextUrl?.searchParams?.get('price[gte]')) {
      validationPromises.push(
        minPriceSchema
          .validate(
            {
              minPrice: req?.nextUrl?.searchParams?.get('price[gte]'),
            },
            { abortEarly: false },
          )
          .catch((err) => {
            validationErrors.push({
              field: 'minPrice',
              message: err.errors[0],
            });
          }),
      );
    }

    // Validation du prix minimum
    if (req?.nextUrl?.searchParams?.get('price[lte]')) {
      validationPromises.push(
        maxPriceSchema
          .validate(
            {
              maxPrice: req?.nextUrl?.searchParams?.get('price[lte]'),
            },
            { abortEarly: false },
          )
          .catch((err) => {
            validationErrors.push({
              field: 'maxPrice',
              message: err.errors[0],
            });
          }),
      );
    }

    // Validation de la page
    if (req?.nextUrl?.searchParams?.get('page')) {
      validationPromises.push(
        pageSchema
          .validate(
            { page: req?.nextUrl?.searchParams?.get('page') },
            { abortEarly: false },
          )
          .catch((err) => {
            validationErrors.push({
              field: 'page',
              message: err.errors[0],
            });
          }),
      );
    }

    // Exécuter toutes les validations en parallèle
    await Promise.all(validationPromises);

    // Si des erreurs de validation sont trouvées, retourner immédiatement
    if (validationErrors?.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Paramètres de requête invalides',
          errors: validationErrors,
          code: 'VALIDATION_ERROR',
        },
        {
          status: 400,
        },
      );
    }

    // Sanitisation AVANT de générer la clé de cache
    const sanitizedParams = sanitizeProductSearchParams(
      req.nextUrl.searchParams,
    );

    const sanitizedSearchParams = buildSanitizedSearchParams(sanitizedParams);

    // Générer une clé de cache fiable basée sur les paramètres sanitisés
    const cacheKey = getCacheKey(
      'products',
      Object.fromEntries(sanitizedSearchParams),
    );

    // Vérifier le cache pour une réponse existante
    const cachedResponse = appCache.products.get(cacheKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse, {
        status: 200,
        headers: {
          ...getCacheHeaders('products'),
          'X-Cache': 'HIT',
          'Content-Security-Policy': "default-src 'self'",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      });
    }

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

    // Configuration de la pagination basée sur les valeurs sanitisées
    const resPerPage = Math.min(MAX_PER_PAGE, Math.max(1, DEFAULT_PER_PAGE));

    // Créer les filtres avec les paramètres sanitisés
    const apiFilters = new APIFilters(
      Product.find({ isActive: true })
        .select('name description stock price images')
        .slice('images', 1),
      sanitizedSearchParams, // Utiliser les paramètres sanitisés
    )
      .search()
      .filter();

    // Requête de comptage avec timeout
    const countPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Count query timeout exceeded'));
      }, QUERY_TIMEOUT);

      apiFilters.query
        .clone()
        .lean()
        .countDocuments()
        .then((count) => {
          clearTimeout(timeout);
          resolve(count);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });

    const filteredProductsCount = await countPromise;

    // Ajouter la pagination aux filtres
    apiFilters.pagination(resPerPage);

    // Requête principale de produits avec timeout
    const productsPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Products query timeout exceeded'));
      }, QUERY_TIMEOUT);

      apiFilters.query
        .populate('category', 'categoryName')
        .lean()
        .then((results) => {
          clearTimeout(timeout);
          resolve(results);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });

    const products = await productsPromise;

    // Calculer les métadonnées de pagination
    const totalPages = Math.ceil(filteredProductsCount / resPerPage);

    // Gestion des résultats vides
    if (!products || products.length === 0) {
      const emptyResponse = {
        success: true,
        message: 'No products found matching the criteria',
        data: {
          totalPages: 0,
          products: [],
        },
      };

      // Cacher même les résultats vides pour éviter les attaques par déni de service
      appCache.products.set(cacheKey, emptyResponse);

      return NextResponse.json(emptyResponse, {
        status: 200,
        headers: {
          ...getCacheHeaders('products'),
          'X-Cache': 'MISS',
          'Content-Security-Policy': "default-src 'self'",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      });
    }

    // Préparer la réponse avec les données sanitisées et validées
    const responseData = {
      success: true,
      data: {
        totalPages,
        products,
      },
    };

    try {
      appCache.products.set(cacheKey, responseData);
    } catch (cacheError) {
      console.warn(`Cache error: ${cacheError.message}`);
      // Ne pas interrompre la réponse pour une erreur de cache
    }

    // Renvoyer la réponse
    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        ...getCacheHeaders('products'),
        'X-Cache': 'MISS',
        'Content-Security-Policy': "default-src 'self'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
    });
  } catch (error) {
    // Capturer l'exception avec Sentry pour le monitoring
    captureException(error, {
      tags: { action: 'get_products' },
      extra: {
        query: req.nextUrl.search,
        errorDetails: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
      level: error.name === 'ValidationError' ? 'warning' : 'error',
    });

    // Déterminer le type d'erreur pour une réponse appropriée
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        {
          success: false,
          message: 'Paramètres de requête invalides',
          errors: error.errors ||
            error.inner?.map((e) => ({
              field: e.path,
              message: e.message,
            })) || [{ field: 'unknown', message: error.message }],
          code: 'VALIDATION_ERROR',
        },
        {
          status: 400,
        },
      );
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: 'Erreur de base de données',
          code: 'DB_DUPLICATE_ERROR',
        },
        {
          status: 500,
        },
      );
    } else if (
      error.name === 'TimeoutError' ||
      error.message.includes('timeout')
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'La requête a pris trop de temps',
          code: 'TIMEOUT_ERROR',
        },
        {
          status: 504,
        },
      );
    } else if (
      error.name === 'ConnectionError' ||
      error.message.includes('connection')
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'Erreur de connexion à la base de données',
          code: 'DB_CONNECTION_ERROR',
        },
        {
          status: 503,
        },
      );
    }

    // Autres erreurs
    return NextResponse.json(
      {
        success: false,
        message:
          'Une erreur interne est survenue, veuillez réessayer ultérieurement',
        code: 'INTERNAL_SERVER_ERROR',
      },
      {
        status: 500,
      },
    );
  }
}
