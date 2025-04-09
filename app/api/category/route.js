import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import Category from '@/backend/models/category';
import { rateLimit } from '@/utils/rateLimit';

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

    const categories = await Category.find()
      .select('categoryName')
      .sort({ categoryName: 1 });

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
    return NextResponse.json(
      {
        success: false,
        message: 'Something is wrong with server! Please try again later',
        error: error,
      },
      { status: 500 },
    );
  }
}

/* 

je ne veux pas de requete post ! je t'ai juste demande la requete GET. 
J'ai une autre API ROUTE GET PRODUCTS pour recuperer la liste des produits qui est tres complete et tres enrichi, 
je vais te le passer et tu vas l'analyser de fond en comble, detail par detail, bloc par bloc pour t'en inspirer. 
Elle a tout rate limiting, caching, gestion des erreurs et tous les autres. 
J'ai aussi des fichiers pour le rate limiting, rateLimit.js, pour le caching, cache.js, 
pour le monitoring vers sentry, sentry.js, je vais te les passer et tu vas les analyser de fond en comble, detail par detail, 
bloc par bloc pour utiliser les methodes qui sont a l'interieur. Mais on va aller progressivement, 
gerer les modifications une par une.

*/
