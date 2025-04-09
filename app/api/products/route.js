/* eslint-disable no-unused-vars */
import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Product from '@/backend/models/product';
import Category from '@/backend/models/category';
import APIFilters from '@/backend/utils/APIFilters';
import {
  categorySchema,
  pageSchema,
  priceRangeSchema,
  searchSchema,
} from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';
import { getCacheHeaders } from '@/utils/cache';
import { appCache } from '@/utils/cache';
import { rateLimit } from '@/utils/rateLimit';
// Importer les fonctions de sanitisation
import {
  sanitizeProductSearchParams,
  buildSanitizedSearchParams,
} from '@/utils/inputSanitizer';

// Constantes pour la configuration
const QUERY_TIMEOUT = parseInt(process.env.QUERY_TIMEOUT || 5000); // 5 secondes par défaut
const DEFAULT_PER_PAGE = parseInt(process.env.DEFAULT_PRODUCTS_PER_PAGE || 10);
const MAX_PER_PAGE = parseInt(process.env.MAX_PRODUCTS_PER_PAGE || 50);

export async function GET(req) {
  try {
    // Rate limiting
    const limiter = rateLimit({
      interval: 60 * 1000, // 1 minute
      uniqueTokenPerInterval: 500,
    });

    // Appliquer le rate limiting basé sur l'IP
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    await limiter.check(req, 20, ip); // 20 requêtes max par minute par IP

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

    // Validation de la plage de prix
    if (
      req?.nextUrl?.searchParams?.get('price[gte]') ||
      req?.nextUrl?.searchParams?.get('price[lte]')
    ) {
      validationPromises.push(
        priceRangeSchema
          .validate(
            {
              minPrice: req?.nextUrl?.searchParams?.get('price[gte]'),
              maxPrice: req?.nextUrl?.searchParams?.get('price[lte]'),
            },
            { abortEarly: false },
          )
          .catch((err) => {
            validationErrors.push({
              field: 'price',
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
        { status: 400 },
      );
    }

    // Sanitisation AVANT de générer la clé de cache
    const sanitizedParams = sanitizeProductSearchParams(
      req.nextUrl.searchParams,
    );

    const sanitizedSearchParams = buildSanitizedSearchParams(sanitizedParams);

    // Générer une clé de cache fiable basée sur les paramètres sanitisés
    const cacheKey = `products:${sanitizedSearchParams.toString()}`;

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
          'Cache-Control': 'no-store, max-age=0',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      });
    }

    // Établir la connexion à la base de données
    const connectionInstance = await dbConnect();
    if (!connectionInstance.connection) {
      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
          code: 'DB_CONNECTION_ERROR',
        },
        { status: 500 },
      );
    }

    // Configuration de la pagination basée sur les valeurs sanitisées
    const resPerPage = Math.min(MAX_PER_PAGE, Math.max(1, DEFAULT_PER_PAGE));

    // Créer les filtres avec les paramètres sanitisés
    // (Note: Vous devrez peut-être adapter APIFilters pour qu'il accepte un objet plutôt que URLSearchParams)
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
          'Cache-Control': 'no-store, max-age=0',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        },
      });
    }

    // Préparer la réponse avec les données sanitisées et validées
    // const responseData = {
    //   success: true,
    //   data: {
    //     totalPages,
    //     products: products.map((product) => ({
    //       ...product,
    //       // Transformer les URLs d'images pour s'assurer qu'elles sont absolues
    //       images: product.images?.map((img) =>
    //         img.startsWith('http') ? img : `${process.env.API_URL}${img}`,
    //       ),
    //     })),
    //   },
    // };

    // Préparer la réponse avec les données sanitisées et validées
    const responseData = {
      success: true,
      data: {
        totalPages,
        products,
      },
    };

    // Mettre en cache la réponse
    appCache.products.set(cacheKey, responseData);

    // Renvoyer la réponse
    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        ...getCacheHeaders('products'),
        'X-Cache': 'MISS',
        'Content-Security-Policy': "default-src 'self'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
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
        { status: 400 },
      );
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: 'Erreur de base de données',
          code: 'DB_DUPLICATE_ERROR',
        },
        { status: 500 },
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
        { status: 504 },
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
        { status: 503 },
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
      { status: 500 },
    );
  }
}
