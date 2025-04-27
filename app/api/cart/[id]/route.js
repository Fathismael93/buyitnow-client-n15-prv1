import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import Cart from '@/backend/models/cart';
import User from '@/backend/models/user';
import { captureException } from '@/monitoring/sentry';
import { appCache, getCacheKey } from '@/utils/cache';
import logger from '@/utils/logger';
import { createRateLimiter } from '@/utils/rateLimit';
import { NextResponse } from 'next/server';

export async function DELETE(req, { params }) {
  // Journalisation structurée de la requête
  logger.info('Cart API DELETE request received', {
    route: 'api/cart/[id]/DELETE',
    user: req.user?.email || 'unauthenticated',
    cartItemId: params.id,
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
      await rateLimiter.check(req);
    } catch (rateLimitError) {
      logger.warn('Rate limit exceeded for cart delete API', {
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
    const connectionPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Database connection timeout'));
      }, 3000); // 3 secondes timeout

      try {
        const result = dbConnect();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const connectionInstance = await connectionPromise;

    if (!connectionInstance.connection) {
      logger.error('Database connection failed for cart DELETE request', {
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
    const userPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('User query timeout'));
      }, 3000);

      try {
        const result = User.findOne({ email: req.user.email }).select('_id');
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const user = await userPromise;

    if (!user) {
      logger.warn('User not found for cart DELETE request', {
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

    // Nettoyer les paniers expirés au passage (opération asynchrone en arrière-plan)
    Cart.removeExpiredItems().catch((err) => {
      logger.error('Failed to remove expired cart items', {
        error: err.message,
      });
    });

    const { id } = params;

    if (!id) {
      logger.warn('Missing cart item ID in DELETE request', {
        userId: user._id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Cart item ID is required',
        },
        { status: 400 },
      );
    }

    // Vérifier que l'élément du panier existe et appartient à l'utilisateur
    const cartItemPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Cart item query timeout'));
      }, 3000);

      try {
        const result = Cart.findById(id);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const cartItem = await cartItemPromise;

    if (!cartItem) {
      logger.warn('Cart item not found for deletion', {
        userId: user._id,
        cartItemId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Cart item not found',
        },
        { status: 404 },
      );
    }

    // Vérification des droits d'accès
    if (cartItem.user.toString() !== user._id.toString()) {
      logger.warn('Unauthorized access attempt to delete cart item', {
        requestUser: user._id.toString(),
        cartItemUser: cartItem.user.toString(),
        cartItemId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized access',
        },
        { status: 403 },
      );
    }

    // Supprimer l'élément du panier avec timeout
    const deletePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Cart delete timeout'));
      }, 3000);

      try {
        const result = Cart.findByIdAndDelete(id);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const deleteResult = await deletePromise;

    if (!deleteResult) {
      logger.warn('Failed to delete cart item', {
        userId: user._id,
        cartItemId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Failed to delete cart item',
        },
        { status: 500 },
      );
    }

    // Générer la clé de cache spécifique
    const cacheKey = getCacheKey('cart', { userId: user._id.toString() });

    // Invalider le cache spécifique pour ce panier utilisateur
    appCache.products.delete(cacheKey);

    // Récupérer le panier complet mis à jour
    const getUserCartPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Cart retrieval timeout'));
      }, 3000);

      try {
        const result = Cart.findByUser(user._id);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const cartItems = await getUserCartPromise;

    // Filtrer les produits inactifs ou supprimés
    const filteredCartItems = cartItems.filter(
      (item) =>
        item.product &&
        item.product.stock > 0 &&
        !item.product.deleted &&
        item.product.active !== false,
    );

    // Formatter les données pour la réponse
    const formattedCart = filteredCartItems.map((item) => ({
      id: item._id,
      productId: item.product._id,
      productName: item.product.name,
      price: item.product.price,
      quantity: item.quantity,
      stock: item.product.stock,
      subtotal: isNaN(item.subtotal)
        ? item.quantity * item.product.price
        : item.subtotal,
      imageUrl:
        item.product.imageUrl ||
        (item.product.images && item.product.images[0]
          ? item.product.images[0].url
          : ''),
    }));

    const cartCount = formattedCart.length;
    const cartTotal = formattedCart.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    // Ajouter des headers de sécurité additionnels
    const securityHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'same-origin',
    };

    logger.info('Cart item deleted successfully', {
      userId: user._id,
      cartItemId: id,
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
          deletedItemId: id,
        },
        message: 'Item deleted from cart',
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
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorMessage = 'Invalid cart item ID';
      errorCode = 'INVALID_ID';
      logger.warn('Invalid cart item ID', { error: error.message });
    } else if (
      error.name === 'MongoError' ||
      error.name === 'MongoServerError'
    ) {
      errorCode = 'DATABASE_ERROR';
      logger.error('MongoDB error in cart DELETE API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in cart DELETE API', {
        error: error.message,
      });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in cart DELETE API', {
        error: error.message,
      });
    } else {
      // Erreur non identifiée
      logger.error('Unhandled error in cart DELETE API', {
        error: error.message,
        stack: error.stack,
      });

      // Envoyer à Sentry pour monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'cart/[id]/DELETE',
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
