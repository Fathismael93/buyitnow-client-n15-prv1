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

export async function GET(req) {
  try {
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
    const maxPrice = req?.nextUrl?.searchParams?.get('price[gte]');
    const minPrice = req?.nextUrl?.searchParams?.get('price[lte]');

    if (minPrice || maxPrice) {
      await priceRangeSchema.validate(
        { minPrice, maxPrice },
        { abortEarly: false },
      );
    }

    const DEFAULT_PER_PAGE = process.env.DEFAULT_PRODUCTS_PER_PAGE || 2;
    const MAX_PER_PAGE = process.env.MAX_PRODUCTS_PER_PAGE || 5;

    const resPerPage = Math.min(MAX_PER_PAGE, Math.max(1, DEFAULT_PER_PAGE));

    const cacheControl = getCacheHeaders('products');

    const apiFilters = new APIFilters(
      Product.find()
        .select('name description stock price images')
        .slice('images', 1),
      req.nextUrl.searchParams,
    )
      .search()
      .filter();

    let products = await apiFilters.query.populate('category', 'categoryName');
    const filteredProductsCount = products.length;

    apiFilters.pagination(resPerPage);
    products = await apiFilters.query
      .populate('category', 'categoryName')
      .clone();

    // Amélioration
    const totalPages = Math.ceil(filteredProductsCount / resPerPage);

    return NextResponse.json(
      {
        success: true,
        data: {
          totalPages,
          products,
        },
      },
      { status: 200 },
    );
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
