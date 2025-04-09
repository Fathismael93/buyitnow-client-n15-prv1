import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import dbConnect from '@/backend/config/dbConnect';
import Category from '@/backend/models/category';
import { createRateLimiter } from '@/utils/rateLimit';
import logger from '@/utils/logger';
import { captureException } from '@/monitoring/sentry';

// Créer un rate limiter avec le preset pour les API publiques
const rateLimiter = createRateLimiter('PUBLIC_API', {
  prefix: 'category-api', // Préfixe unique pour cette route
});

export async function GET(req) {
  const headersList = headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0] ||
    req.socket?.remoteAddress ||
    '0.0.0.0';

  try {
    // Vérifier les limites de taux avant de traiter la requête
    try {
      const result = await rateLimiter.check(req);

      // Ajouter les en-têtes de rate limiting à la réponse
      const responseHeaders = {};
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          responseHeaders[key] = value;
        });
      }
    } catch (rateLimitError) {
      // Si le rate limiting est dépassé, renvoyer une réponse 429
      logger.warn(`Rate limit exceeded for categories API: ${ip}`, {
        component: 'categoryAPI',
        ip,
      });

      const headers = {};
      if (rateLimitError.headers) {
        Object.entries(rateLimitError.headers).forEach(([key, value]) => {
          headers[key] = value;
        });
      }

      return NextResponse.json(
        {
          success: false,
          message: 'Too many requests. Please try again later.',
        },
        {
          status: 429,
          headers,
        },
      );
    }

    // Connexion à la base de données
    const connectionInstance = await dbConnect();

    if (!connectionInstance.connection) {
      logger.error('Database connection failed in categories API', {
        component: 'categoryAPI',
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
        },
        { status: 500 },
      );
    }

    // Récupérer les catégories depuis la base de données
    const categories = await Category.find()
      .select('categoryName')
      .sort({ categoryName: 1 });

    logger.info('Categories fetched successfully', {
      component: 'categoryAPI',
      count: categories.length,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          categories,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    // Capturer l'exception pour le monitoring
    captureException(error, {
      tags: { component: 'categoryAPI' },
      extra: { path: '/api/category' },
    });

    logger.error(`Error in categories API: ${error.message}`, {
      error,
      component: 'categoryAPI',
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Something is wrong with server! Please try again later',
        error:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
