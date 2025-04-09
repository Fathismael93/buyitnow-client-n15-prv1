import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Category from '@/backend/models/category';
import { rateLimit } from '@/utils/rateLimit';
import { appCache, getCacheHeaders } from '@/utils/cache';

// Créer le limiteur de taux en dehors du gestionnaire de requêtes
// pour conserver l'état entre les requêtes
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
  maxRequestsPerInterval: 20, // 20 requêtes par minute maximum
  trustProxy: true,
  keyGenerator: (req) => {
    // Obtenir l'adresse IP de l'utilisateur
    const ip =
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      'anonymous';

    // Retourner un identifiant unique pour ce client et cette route
    return `${ip}-/api/category`;
  },
});

// Clé de cache constante puisque l'API renvoie toujours le même ensemble de données
const CATEGORIES_CACHE_KEY = 'all_active_categories';

/**
 * Récupère la liste des catégories actives avec mise en cache
 * @route GET /api/category
 */
export async function GET(req) {
  try {
    // 1. Vérification du rate limiting
    try {
      await limiter.check(req);
    } catch (rateLimitError) {
      // Renvoyer une réponse avec les headers corrects
      return NextResponse.json(
        {
          success: false,
          message: 'Too many requests. Please try again later.',
        },
        {
          status: rateLimitError.statusCode || 429,
          headers: rateLimitError.headers || {
            'Retry-After': '60',
          },
        },
      );
    }

    // 2. Vérifier si les résultats sont en cache
    const cachedCategories = appCache.categories.get(CATEGORIES_CACHE_KEY);

    if (cachedCategories) {
      // Si les données sont en cache, les renvoyer directement
      return NextResponse.json(
        {
          success: true,
          data: {
            categories: cachedCategories,
          },
        },
        {
          status: 200,
          headers: getCacheHeaders('categories'),
        },
      );
    }

    // 3. Si pas en cache, récupérer depuis la base de données
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

    // 4. Récupération des catégories actives triées par nom
    const categories = await Category.find({ isActive: true })
      .select('categoryName')
      .sort({ categoryName: 1 });

    // 5. Mettre en cache les résultats
    appCache.categories.set(CATEGORIES_CACHE_KEY, categories);

    // 6. Renvoyer la réponse avec les headers de cache appropriés
    return NextResponse.json(
      {
        success: true,
        data: {
          categories,
        },
      },
      {
        status: 200,
        headers: getCacheHeaders('categories'),
      },
    );
  } catch (error) {
    // 7. Gestion des erreurs
    return NextResponse.json(
      {
        success: false,
        message:
          'Something went wrong while retrieving categories. Please try again later.',
        ...(process.env.NODE_ENV !== 'production' && { error: error.message }),
      },
      { status: 500 },
    );
  }
}
