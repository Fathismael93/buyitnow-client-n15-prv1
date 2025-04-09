import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Category from '@/backend/models/category';
import { rateLimit } from '@/utils/rateLimit';

// Créer le limiteur de taux en dehors du gestionnaire de requêtes
// pour conserver l'état entre les requêtes
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
  maxRequestsPerInterval: 20, // 20 requêtes par minute maximum
  trustProxy: true,
  // Configuration adaptée à l'API Next.js
  keyGenerator: (req) => {
    // Obtenir l'adresse IP de l'utilisateur
    const ip =
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      'anonymous';

    // Combiner avec l'URL pour un contrôle plus granulaire
    const url = new URL(req.url).pathname;

    // Retourner un identifiant unique pour ce client et cette route
    return `${ip}-${url}`;
  },
});

/**
 * Récupère la liste des catégories
 * @route GET /api/category
 */
export async function GET(req) {
  try {
    // 1. Vérification du rate limiting avec la nouvelle API
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

    // 2. Connexion à la base de données
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

    // 3. Récupération des catégories
    const categories = await Category.find()
      .select('categoryName')
      .sort({ categoryName: 1 });

    // 4. Renvoyer la réponse
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
    // 5. Gestion des erreurs simplifiée
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
