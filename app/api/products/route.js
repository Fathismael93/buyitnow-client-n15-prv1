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
// Implémenter la mise en cache au niveau de la route
import { appCache } from '@/utils/cache';
import { rateLimit } from '@/utils/rateLimit';

export async function GET(req) {
  // Limiter les requêtes par IP
  const limiter = rateLimit({
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 500, // Max 500 utilisateurs par intervalle
  });

  try {
    // Appliquer le rate limiting basé sur l'IP
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    await limiter.check(req, 20, ip); // 20 requêtes max par minute par IP

    // Générer une clé de cache basée sur les paramètres de requête
    const cacheKey = `products:${req.nextUrl.search}`;

    console.log('Cache key:', cacheKey);

    // Vérifier le cache pour une réponse existante
    const cachedResponse = appCache.products.get(cacheKey);
    if (cachedResponse) {
      // Si la réponse est trouvée dans le cache, la retourner
      return NextResponse.json(cachedResponse, {
        status: 200,
        headers: {
          ...getCacheHeaders('products'),
          'X-Cache': 'HIT',
        },
      });
    }

    const connectionInstance = await dbConnect();

    if (!connectionInstance.connection) {
      captureException(new Error('Database connection failed'), {
        tags: { action: 'get_products', type: 'connection_error' },
        level: 'error',
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
          code: 'DB_CONNECTION_ERROR',
        },
        { status: 500 },
      );
    }
    const validationPromises = [];

    if (req.nextUrl.searchParams.get('keyword')) {
      validationPromises.push(
        searchSchema.validate(
          { keyword: req.nextUrl.searchParams.get('keyword') },
          { abortEarly: false },
        ),
      );
    }

    if (req.nextUrl.searchParams.get('category')) {
      validationPromises.push(
        categorySchema.validate(
          { value: req.nextUrl.searchParams.get('category') },
          { abortEarly: false },
        ),
      );
    }

    const minPrice = req.nextUrl.searchParams.get('price[gte]');
    const maxPrice = req.nextUrl.searchParams.get('price[lte]');

    if (minPrice || maxPrice) {
      validationPromises.push(
        priceRangeSchema.validate(
          { minPrice, maxPrice },
          { abortEarly: false },
        ),
      );
    }

    // Ajouter la validation pour le paramètre page et limit
    if (req.nextUrl.searchParams.get('page')) {
      validationPromises.push(
        pageSchema.validate(
          { page: req.nextUrl.searchParams.get('page') },
          { abortEarly: false },
        ),
      );
    }

    // Exécuter toutes les validations en parallèle
    await Promise.all(validationPromises);

    const DEFAULT_PER_PAGE = process.env.DEFAULT_PRODUCTS_PER_PAGE || 2;
    const MAX_PER_PAGE = process.env.MAX_PRODUCTS_PER_PAGE || 5;

    const resPerPage = Math.min(MAX_PER_PAGE, Math.max(1, DEFAULT_PER_PAGE));

    const apiFilters = new APIFilters(
      Product.find()
        .select('name description stock price images')
        .slice('images', 1),
      req.nextUrl.searchParams,
    )
      .search()
      .filter();

    // Par celles-ci pour une meilleure performance:
    // Utiliser countDocuments() pour le comptage est plus efficace
    const filteredProductsQuery = apiFilters.query.clone();
    const filteredProductsCount = await filteredProductsQuery
      .lean()
      .countDocuments();

    apiFilters.pagination(resPerPage);
    const products = await apiFilters.query
      .populate('category', 'categoryName')
      .lean();

    // Amélioration
    const totalPages = Math.ceil(filteredProductsCount / resPerPage);

    // Avant de retourner la réponse, la mettre en cache
    const responseData = {
      success: true,
      data: {
        totalPages,
        products,
      },
    };

    appCache.products.set(cacheKey, responseData);

    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        ...getCacheHeaders('products'),
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    // Capturer l'exception avec Sentry pour le monitoring
    captureException(error, {
      tags: { action: 'get_products' },
      extra: { query: req.query },
      level: error.name === 'ValidationError' ? 'warning' : 'error',
    });

    // Déterminer le type d'erreur pour une réponse appropriée
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        {
          success: false,
          message: 'Paramètres de requête invalides',
        },
        { status: 400 },
      );
    } else if (error.name === 'MongoServerError' && error.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: 'Erreur de base de données',
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
        },
        { status: 504 },
      );
    }

    // Autres erreurs
    return NextResponse.json(
      {
        success: false,
        message: 'Something is wrong with server! Please try again later',
      },
      { status: 500 },
    );
  }
}
