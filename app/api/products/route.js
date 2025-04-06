/* eslint-disable no-unused-vars */
import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Product from '@/backend/models/product';
import Category from '@/backend/models/category';
import APIFilters from '@/backend/utils/APIFilters';
import {
  categorySchema,
  priceRangeSchema,
  searchSchema,
} from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';
import { getCacheHeaders } from '@/utils/cache';
// Implémenter la mise en cache au niveau de la route
import { appCache } from '@/utils/cache';

export async function GET(req) {
  try {
    // Générer une clé de cache basée sur les paramètres de requête
    const cacheKey = `products:${req.nextUrl.search}`;

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
      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
        },
        { status: 500 },
      );
    }

    // Search by product name validation with yup
    if (req?.nextUrl?.searchParams?.get('keyword')) {
      const keyword = req?.nextUrl?.searchParams?.get('keyword');
      await searchSchema.validate({ keyword }, { abortEarly: false });
    }

    // Filter by product category validation with yup
    if (req?.nextUrl?.searchParams?.get('category')) {
      const value = req?.nextUrl?.searchParams?.get('category');
      await categorySchema.validate({ value }, { abortEarly: false });
    }

    // Filter by price range validation with yup
    const minPrice = req?.nextUrl?.searchParams?.get('price[gte]');
    const maxPrice = req?.nextUrl?.searchParams?.get('price[lte]');

    if (minPrice || maxPrice) {
      await priceRangeSchema.validate(
        { minPrice, maxPrice },
        { abortEarly: false },
      );
    }

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
    const filteredProductsCount = await filteredProductsQuery.countDocuments();

    apiFilters.pagination(resPerPage);
    const products = await apiFilters.query.populate(
      'category',
      'categoryName',
    );

    // let products = await apiFilters.query.populate('category', 'categoryName');
    // const filteredProductsCount = products.length;

    // apiFilters.pagination(resPerPage);
    // products = await apiFilters.query
    //   .populate('category', 'categoryName')
    //   .clone();

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
      // return next(new ErrorHandler('La requête a pris trop de temps', 504));
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
