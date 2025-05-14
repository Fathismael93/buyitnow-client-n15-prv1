import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import Order from '@/backend/models/order';
// eslint-disable-next-line no-unused-vars
import Address from '@/backend/models/address';
import APIFilters from '@/backend/utils/APIFilters';
import User from '@/backend/models/user';
import DeliveryPrice from '@/backend/models/deliveryPrice';
import logger from '@/utils/logger';
import { captureException } from '@/monitoring/sentry';
import { createRateLimiter } from '@/utils/rateLimit';
import { appCache, getCacheHeaders, getCacheKey } from '@/utils/cache';
import {
  buildSanitizedSearchParams,
  sanitizePage,
} from '@/utils/inputSanitizer';

// Constantes pour la configuration
const DEFAULT_PER_PAGE = parseInt(process.env.DEFAULT_PRODUCTS_PER_PAGE || 10);
const MAX_PER_PAGE = parseInt(process.env.MAX_PRODUCTS_PER_PAGE || 50);

/**
 * Récupère les commandes d'un utilisateur avec pagination et filtrage
 * Endpoint API sécurisé avec authentification, rate limiting et optimisations de cache
 */
export async function GET(req) {
  // Générer un ID unique pour cette requête (pour traçabilité)
  const requestId = `orders-me-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const startTime = performance.now();

  // Journalisation structurée de la requête entrante
  logger.info('Orders history request received', {
    route: 'api/orders/me/GET',
    requestId,
    user: req.user?.email || 'unauthenticated',
    searchParams: Object.fromEntries(req?.nextUrl?.searchParams || []),
  });

  try {
    // 1. Authentification et rate limiting
    await isAuthenticatedUser(req, NextResponse);

    // Application du rate limiting pour les requêtes d'historique de commandes
    const rateLimiter = createRateLimiter('AUTHENTICATED_API', {
      prefix: 'orders_history',
      getTokenFromReq: (req) => req.user?.email || req.user?.id,
    });

    try {
      await rateLimiter.check(req);
    } catch (rateLimitError) {
      logger.warn('Rate limit exceeded for orders history', {
        user: req.user?.email,
        requestId,
        error: rateLimitError.message,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Trop de requêtes. Veuillez réessayer plus tard.',
          requestId,
        },
        {
          status: 429,
          headers: rateLimitError.headers || {
            'Retry-After': '60',
            'X-Request-ID': requestId,
          },
        },
      );
    }

    // 2. Connexion à la base de données avec timeout et gestion d'erreur
    try {
      const connectionPromise = dbConnect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Database connection timeout')),
          5000,
        );
      });

      const connectionInstance = await Promise.race([
        connectionPromise,
        timeoutPromise,
      ]);

      if (!connectionInstance.connection) {
        logger.error('Database connection failed for orders history', {
          requestId,
          user: req.user?.email,
        });

        return NextResponse.json(
          {
            success: false,
            message:
              'Service temporairement indisponible. Veuillez réessayer plus tard.',
            requestId,
          },
          { status: 503 },
        );
      }
    } catch (dbError) {
      logger.error('Database connection error for orders history', {
        requestId,
        user: req.user?.email,
        error: dbError.message,
      });

      captureException(dbError, {
        tags: { component: 'orders-me', operation: 'db-connect', requestId },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Erreur de connexion à la base de données',
          requestId,
        },
        { status: 500 },
      );
    }

    // 3. Validation de l'utilisateur
    let user;
    try {
      // Utiliser lean() pour optimiser la requête en retournant des objets JS simples
      user = await User.findOne({ email: req.user.email })
        .select('name phone email')
        .lean();

      if (!user) {
        logger.warn('User not found for orders history', {
          requestId,
          email: req.user.email,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'Utilisateur non trouvé',
            requestId,
          },
          { status: 404 },
        );
      }
    } catch (userError) {
      logger.error('Error finding user for orders history', {
        requestId,
        email: req.user?.email,
        error: userError.message,
      });

      captureException(userError, {
        tags: { component: 'orders-me', operation: 'find-user', requestId },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Erreur lors de la recherche du compte utilisateur',
          requestId,
        },
        { status: 500 },
      );
    }

    // 4. Extraction et validation des paramètres de requête
    const page = parseInt(req?.nextUrl?.searchParams?.get('page') || '1', 10);
    // Configuration de la pagination basée sur les valeurs sanitisées
    const resPerPage = Math.min(MAX_PER_PAGE, Math.max(1, DEFAULT_PER_PAGE));

    // Limiter les valeurs pour éviter les abus de ressources
    const validatedPage = Math.max(1, Math.min(page, 100)); // Page entre 1 et 100
    const sanitizedPage = sanitizePage(validatedPage);
    const sanitizedParams = buildSanitizedSearchParams(sanitizedPage);

    // 5. Générer une clé de cache basée sur les paramètres
    const cacheKey = getCacheKey('orders_history', {
      userId: user._id.toString(),
      page: sanitizedPage,
      limit: resPerPage,
    });

    // 6. Vérifier le cache d'abord
    let cachedData = appCache.orders.get(cacheKey);
    let ordersResult;

    if (cachedData) {
      logger.debug('Orders history cache hit', {
        requestId,
        userId: user._id,
        cacheKey,
      });

      ordersResult = cachedData;
    } else {
      // 7. Récupération des données avec timeouts et gestion d'erreurs
      try {
        // Créer une promesse pour le comptage avec timeout
        const countPromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Orders count query timeout'));
          }, 5000);

          Order.countDocuments({ user: user._id })
            .then((result) => {
              clearTimeout(timeoutId);
              resolve(result);
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              reject(err);
            });
        });

        // Effectuer le comptage
        const ordersCount = await countPromise;

        // Créer une promesse pour la requête principale avec timeout
        const ordersPromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Orders query timeout'));
          }, 5000);

          const apiFilters = new APIFilters(
            Order.find({ user: user._id }),
            sanitizedParams,
          ).pagination(resPerPage);

          apiFilters.query
            .find()
            .select(
              'orderNumber orderStatus paymentInfo paymentStatus totalAmount createdAt updatedAt deliveredAt orderItems',
            )
            .populate({
              path: 'shippingInfo',
              select: 'firstName lastName street city state zipCode country',
            })
            .sort({ createdAt: -1 })
            .lean() // Utiliser lean() pour des objets JS simples plus performants
            .then((result) => {
              clearTimeout(timeoutId);
              resolve(result);
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              reject(err);
            });
        });

        // Exécuter la requête des commandes
        const orders = await ordersPromise;

        // Récupérer les prix de livraison depuis le cache ou la base de données
        const deliveryPriceKey = getCacheKey('delivery_prices', {
          global: true,
        });
        let deliveryPrice = appCache.deliveryPrices.get(deliveryPriceKey);

        if (!deliveryPrice) {
          // Créer une promesse pour les prix de livraison avec timeout
          const deliveryPromise = new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Delivery price query timeout'));
            }, 3000);

            DeliveryPrice.find()
              .lean()
              .then((result) => {
                clearTimeout(timeoutId);
                resolve(result);
              })
              .catch((err) => {
                clearTimeout(timeoutId);
                reject(err);
              });
          });

          // Exécuter la requête de prix de livraison
          deliveryPrice = await deliveryPromise;

          // Mettre en cache pour 1 heure car ces données changent rarement
          appCache.deliveryPrices.set(deliveryPriceKey, deliveryPrice);
        }

        // Calculer le nombre total de pages
        const result = ordersCount / resPerPage;
        const totalPages = Number.isInteger(result)
          ? result
          : Math.ceil(result);

        // Préparer le résultat
        ordersResult = {
          deliveryPrice,
          totalPages,
          currentPage: sanitizedPage,
          count: ordersCount,
          perPage: resPerPage,
          orders: orders.map((order) => ({
            ...order,
            user: user,
            // Sécurité : masquer les détails sensibles des informations de paiement
            paymentInfo: order.paymentInfo,
          })),
        };

        // Mettre en cache les résultats pour 5 minutes
        appCache.orders.set(cacheKey, ordersResult);

        logger.debug('Orders history cache miss, data fetched from database', {
          requestId,
          userId: user._id,
          ordersCount,
          totalPages,
        });
      } catch (dataError) {
        logger.error('Error fetching orders data', {
          requestId,
          userId: user._id,
          error: dataError.message,
          stack: dataError.stack,
        });

        captureException(dataError, {
          tags: {
            component: 'orders-me',
            operation: 'fetch-orders',
            requestId,
          },
        });

        return NextResponse.json(
          {
            success: false,
            message:
              'Erreur lors de la récupération de votre historique de commandes',
            requestId,
          },
          { status: 500 },
        );
      }
    }

    // 8. Calcul du temps de traitement pour monitoring
    const processingTime = Math.round(performance.now() - startTime);

    // 9. Log du résultat
    logger.info('Orders history retrieved successfully', {
      requestId,
      userId: user._id,
      ordersCount: ordersResult.count,
      processingTime,
    });

    // 10. Retourner la réponse avec cache control et autres headers
    return NextResponse.json(
      {
        success: true,
        data: ordersResult,
        requestId,
      },
      {
        status: 200,
        headers: {
          ...getCacheHeaders('orders'),
          'X-Processing-Time': `${processingTime}ms`,
          'X-Request-ID': requestId,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
        },
      },
    );
  } catch (error) {
    // Gestion globale des erreurs inattendues
    const errorCode = `ERR${Date.now().toString(36).substring(4)}`;

    logger.error('Unhandled error in orders history API', {
      requestId,
      errorCode,
      error: error.message,
      stack: error.stack,
      user: req.user?.email || 'unknown',
    });

    captureException(error, {
      tags: {
        component: 'orders-me',
        operation: 'global-handler',
        requestId,
        errorCode,
      },
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Une erreur est survenue lors du traitement de votre demande',
        requestId,
        errorReference: errorCode,
      },
      {
        status: 500,
        headers: {
          'X-Request-ID': requestId,
          'X-Error-Reference': errorCode,
        },
      },
    );
  }
}
