import { NextResponse } from 'next/server';

import isAuthenticatedUser from '@/backend/middlewares/auth';
import dbConnect from '@/backend/config/dbConnect';
import User from '@/backend/models/user';
import Cart from '@/backend/models/cart';
import Product from '@/backend/models/product';
import { DECREASE, INCREASE } from '@/helpers/constants';
import { appCache, getCacheKey } from '@/utils/cache';
import logger from '@/utils/logger';
import { createRateLimiter } from '@/utils/rateLimit';
import { captureException } from '@/monitoring/sentry';

export async function GET(req) {
  // Journalisation structurée de la requête
  logger.info('Cart API GET request received', {
    route: 'api/cart/GET',
    user: req.user?.email || 'unauthenticated',
  });

  try {
    // Vérifier l'authentification
    await isAuthenticatedUser(req, NextResponse);

    // Appliquer le rate limiting pour les requêtes authentifiées
    const rateLimiter = createRateLimiter('AUTHENTICATED_API', {
      prefix: 'cart_api',
      getTokenFromReq: (req) => req.user?.email || req.user?.id,
    });

    try {
      const limitResult = await rateLimiter.check(req);
      // Les headers seront utilisés plus tard
      const rateHeaders = limitResult.headers || {};
    } catch (rateLimitError) {
      logger.warn('Rate limit exceeded for cart API', {
        user: req.user?.email,
        error: rateLimitError.message,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Too many requests, please try again later',
        },
        {
          status: 429,
          headers: rateLimitError.headers || {
            'Retry-After': '60',
          },
        },
      );
    }

    // Connecter à la base de données avec timeout
    const connectionInstance = await dbConnect();

    if (!connectionInstance.connection) {
      logger.error('Database connection failed for cart request', {
        user: req.user?.email,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
        },
        { status: 500 },
      );
    }

    // Trouver l'utilisateur
    const user = await User.findOne({ email: req.user.email }).select('_id');

    if (!user) {
      logger.warn('User not found for cart request', {
        email: req.user.email,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 404 },
      );
    }

    // Vérification côté serveur des droits d'accès (s'assurer que l'utilisateur accède à son propre panier)
    if (
      req.query &&
      req.query.userId &&
      req.query.userId !== user._id.toString()
    ) {
      logger.warn('Unauthorized access attempt to cart', {
        requestUser: req.query.userId,
        authenticatedUser: user._id.toString(),
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized access',
        },
        { status: 403 },
      );
    }

    // Génération de la clé de cache
    const cacheKey = getCacheKey('cart', { userId: user._id.toString() });

    // Vérification du header If-None-Match pour les requêtes conditionnelles
    const ifNoneMatch = req.headers.get('if-none-match');
    const currentEtag = `W/"cart-${user._id}-${Date.now().toString(36)}"`;

    if (ifNoneMatch && ifNoneMatch === currentEtag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: currentEtag,
          'Cache-Control': 'private, max-age=60',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Nettoyer les paniers expirés au passage (opération asynchrone en arrière-plan)
    Cart.removeExpiredItems().catch((err) => {
      logger.error('Failed to remove expired cart items', {
        error: err.message,
      });
    });

    // Essayer de récupérer les données du cache
    let cartItems = appCache.products.get(cacheKey);

    if (!cartItems) {
      logger.debug('Cart cache miss, fetching from database', {
        userId: user._id,
        cacheKey,
      });

      // Utiliser la méthode statique optimisée du modèle Cart avec timeout
      const cartPromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Database query timeout'));
        }, 3000); // 3 secondes timeout

        try {
          const result = Cart.findByUser(user._id);
          clearTimeout(timeoutId);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      cartItems = await cartPromise;

      // Mettre en cache les résultats pour 2 minutes (120000 ms) - réduit de 5 à 2 minutes
      appCache.products.set(cacheKey, cartItems, { ttl: 120000 });
    } else {
      logger.debug('Cart cache hit', {
        userId: user._id,
        cacheKey,
      });
    }

    // Filtrer les produits inactifs ou supprimés
    cartItems = cartItems.filter(
      (item) =>
        item.product &&
        item.product.stock > 0 &&
        !item.product.deleted &&
        item.product.active !== false,
    );

    // Limitation de taille des résultats
    const MAX_CART_ITEMS = 50; // Limiter à 50 articles maximum
    if (cartItems.length > MAX_CART_ITEMS) {
      logger.warn('Cart size exceeds maximum limit', {
        userId: user._id,
        cartSize: cartItems.length,
        limit: MAX_CART_ITEMS,
      });
      cartItems = cartItems.slice(0, MAX_CART_ITEMS);
    }

    // Préparer les opérations de mise à jour en masse
    const bulkOps = [];
    const itemsToUpdate = cartItems.filter(
      (item) => item.quantity > item.product.stock,
    );

    // Vérifier et corriger les quantités qui dépassent le stock disponible
    if (itemsToUpdate.length > 0) {
      logger.info('Adjusting cart quantities to match available stock', {
        userId: user._id,
        itemCount: itemsToUpdate.length,
      });

      itemsToUpdate.forEach((item) => {
        bulkOps.push({
          updateOne: {
            filter: { _id: item._id },
            update: { $set: { quantity: item.product.stock } },
          },
        });
      });

      // Exécuter les mises à jour en bloc avec timeout
      if (bulkOps.length > 0) {
        const bulkWritePromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Database bulk write timeout'));
          }, 5000); // 5 secondes timeout

          try {
            const result = Cart.bulkWrite(bulkOps);
            clearTimeout(timeoutId);
            resolve(result);
          } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
          }
        });

        await bulkWritePromise;

        // Invalider le cache après mise à jour
        appCache.products.delete(cacheKey);

        // Récupérer les données mises à jour
        cartItems = await Cart.findByUser(user._id);
      }
    }

    // Formatter les données pour la réponse
    const formattedCart = cartItems.map((item) => ({
      id: item._id,
      productId: item.product._id,
      productName: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
      stock: item.product.stock,
      subtotal:
        item.subtotal !== null
          ? item.subtotal
          : item.quantity * item.product.price, // Utiliser la propriété virtuelle définie dans le modèle
      imageUrl:
        item.product.imageUrl ||
        (item.product.images && item.product.images[0]
          ? item.product.images[0].url
          : ''),
    }));

    console.log('Formatted cart items:', formattedCart);

    const cartCount = formattedCart.length;
    const cartTotal = formattedCart.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    console.log('Cart count:', cartCount);
    console.log('Cart total:', cartTotal);

    // Ajouter des headers de sécurité additionnels
    const securityHeaders = {
      ETag: currentEtag,
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'same-origin',
    };

    logger.info('Cart retrieved successfully', {
      userId: user._id,
      cartCount,
      cartTotal,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          cartCount,
          cartTotal,
          cart: formattedCart,
        },
      },
      {
        status: 200,
        headers: securityHeaders,
      },
    );
  } catch (error) {
    // Gestion d'erreur plus granulaire
    let statusCode = 500;
    let errorMessage = 'Something is wrong with server! Please try again later';
    let errorCode = 'SERVER_ERROR';

    // Journalisation et classification des erreurs
    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = 'Invalid data provided';
      errorCode = 'VALIDATION_ERROR';
      logger.warn('Cart validation error', { error: error.message });
    } else if (
      error.name === 'MongoError' ||
      error.name === 'MongoServerError'
    ) {
      errorCode = 'DATABASE_ERROR';
      logger.error('MongoDB error in cart API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in cart API', { error: error.message });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in cart API', { error: error.message });
    } else {
      // Erreur non identifiée
      logger.error('Unhandled error in cart GET API', {
        error: error.message,
        stack: error.stack,
      });

      // Envoyer à Sentry pour monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'cart/GET',
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
        code: errorCode,
        requestId: Date.now().toString(36),
      },
      { status: statusCode },
    );
  }
}

export async function POST(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

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

    const user = await User.findOne({ email: req.user.email }).select('_id');

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 404 },
      );
    }

    const body = await req.json();

    const product = await Product.findById(body.productId);

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: 'Product not found',
        },
        { status: 404 },
      );
    }

    let quantity = 1;

    // IF QUANTITY ASKED BY THE USER IS MORE THEN THE PRODUCT'STOCK...

    if (quantity > product.stock) {
      return NextResponse.json(
        {
          success: false,
          message: 'Product inavailable',
        },
        { status: 404 },
      );
    }

    const cart = {
      product: product._id,
      user: user._id,
      quantity,
    };

    const cartAdded = await Cart.create(cart);

    // Après la création réussie, invalider le cache des produits
    appCache.products.invalidatePattern(/^products:/);

    return NextResponse.json(
      {
        success: true,
        data: {
          cartAdded,
        },
      },
      { status: 201 },
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

export async function PUT(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

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

    const user = await User.findOne({ email: req.user.email });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 404 },
      );
    }

    const body = await req.json();

    const productId = body.product.product._id;
    const product = await Product.findById(productId);

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          message: 'Product not found',
        },
        { status: 404 },
      );
    }

    // IF THE USER WANT TO INCREASE THE QUANTITY OF A PRODUCT IN THE CART THEN THE VALUE WILL BE INCREASE

    if (body.value === INCREASE) {
      const neededQuantity = body.product.quantity + 1;
      if (neededQuantity > product.stock) {
        return NextResponse.json(
          {
            success: false,
            message: 'Inavailable quantity',
          },
          { status: 404 },
        );
      }

      const updatedCart = await Cart.findByIdAndUpdate(body.product._id, {
        quantity: neededQuantity,
      });

      if (updatedCart) {
        // Après la création réussie, invalider le cache des produits
        appCache.products.invalidatePattern(/^products:/);

        return NextResponse.json(
          {
            success: true,
            message: 'Cart updated',
          },
          { status: 200 },
        );
      }
    }

    // IF THE USER WANT TO DECREASE THE QUANTITY OF A PRODUCT IN THE CART THEN THE VALUE WILL BE DECREASE

    if (body.value === DECREASE) {
      const neededQuantity = body.product.quantity - 1;
      const updatedCart = await Cart.findByIdAndUpdate(body.product._id, {
        quantity: neededQuantity,
      });

      if (updatedCart) {
        // Après la création réussie, invalider le cache des produits
        appCache.products.invalidatePattern(/^products:/);

        return NextResponse.json(
          {
            success: true,
            message: 'Cart updated',
          },
          { status: 200 },
        );
      }
    }
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
