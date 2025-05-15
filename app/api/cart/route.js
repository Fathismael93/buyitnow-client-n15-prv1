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
      // APRÈS:
      await rateLimiter.check(req);
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
    if (req.user && req.user._id && req.user._id !== user.id) {
      logger.warn('Unauthorized access attempt to cart', {
        requestUser: req.user._id,
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

    // Nettoyer les paniers expirés au passage (opération asynchrone en arrière-plan)
    Cart.removeExpiredItems().catch((err) => {
      logger.error('Failed to remove expired cart items', {
        error: err.message,
      });
    });

    // Essayer de récupérer les données du cache
    let cartItems = appCache.cart.get(cacheKey);

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
      appCache.cart.set(cacheKey, cartItems); // Utilisation du TTL par défaut de l'instance
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
        appCache.cart.delete(cacheKey);

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
      subtotal: isNaN(item.subtotal)
        ? item.quantity * item.product.price
        : item.subtotal, // Utiliser la propriété virtuelle définie dans le modèle
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
  // Journalisation structurée de la requête
  logger.info('Cart API POST request received', {
    route: 'api/cart/POST',
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
      await rateLimiter.check(req);
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
      logger.warn('User not found for cart POST request', {
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

    // Vérification côté serveur des droits d'accès
    if (req.user && req.user._id && req.user._id !== user.id) {
      logger.warn('Unauthorized access attempt to cart', {
        requestUser: req.user._id,
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

    const body = await req.json();

    // Nettoyer les paniers expirés au passage (opération asynchrone en arrière-plan)
    Cart.removeExpiredItems().catch((err) => {
      logger.error('Failed to remove expired cart items', {
        error: err.message,
      });
    });

    // Trouver le produit avec timeout
    const productPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Product query timeout'));
      }, 3000); // 3 secondes timeout

      try {
        const result = Product.findById(body.productId);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const product = await productPromise;

    if (!product) {
      logger.warn('Product not found for cart addition', {
        productId: body.productId,
        user: user._id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Product not found',
        },
        { status: 404 },
      );
    }

    // Vérifier si le produit est actif et non supprimé
    if (!product.isActive) {
      logger.warn('Attempt to add inactive product to cart', {
        productId: product._id,
        active: product.active,
        deleted: product.deleted,
        user: user._id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Product is no longer available',
        },
        { status: 400 },
      );
    }

    // Utiliser la quantité fournie ou par défaut 1
    let quantity = body.quantity || 1;

    // Vérifier que la quantité est valide
    if (isNaN(quantity) || quantity < 1) {
      quantity = 1;
    }

    // Vérifier la disponibilité du stock
    if (quantity > product.stock) {
      logger.warn('Insufficient stock for product addition to cart', {
        productId: product._id,
        requestedQuantity: quantity,
        availableStock: product.stock,
        user: user._id,
      });

      return NextResponse.json(
        {
          success: false,
          message: `Only ${product.stock} units available`,
        },
        { status: 400 },
      );
    }

    // Préparer les données du panier avec tous les champs requis
    const cart = {
      product: product._id,
      user: user._id,
      quantity,
      price: product.price, // Ajouter le prix du produit
      productName: product.name, // Ajouter le nom du produit
    };

    // Créer l'article dans le panier avec timeout
    const createCartPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Cart creation timeout'));
      }, 5000); // 5 secondes timeout

      try {
        const result = Cart.create(cart);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const cartAdded = await createCartPromise;

    // Générer la clé de cache spécifique
    const cacheKey = getCacheKey('cart', { userId: user._id.toString() });

    // Invalider le cache spécifique pour ce panier utilisateur
    appCache.cart.delete(cacheKey);

    // Récupérer le panier complet de l'utilisateur avec timeout
    const getUserCartPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Cart retrieval timeout'));
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

    logger.info('Product added to cart successfully', {
      userId: user._id,
      productId: product._id,
      productName: product.name,
      quantity,
      cartItemId: cartAdded._id,
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
          // newItemId: cartAdded._id,
        },
        message: 'Product added to cart',
      },
      {
        status: 201,
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
    } else if (error.code === 11000) {
      // Gestion des erreurs de duplication (index unique)
      statusCode = 409;
      errorMessage = 'This product is already in your cart';
      errorCode = 'DUPLICATE_ERROR';
      logger.warn('Duplicate cart entry', {
        error: error.message,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue,
      });
    } else if (
      error.name === 'MongoError' ||
      error.name === 'MongoServerError'
    ) {
      errorCode = 'DATABASE_ERROR';
      logger.error('MongoDB error in cart POST API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in cart POST API', {
        error: error.message,
      });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in cart POST API', {
        error: error.message,
      });
    } else {
      // Erreur non identifiée
      logger.error('Unhandled error in cart POST API', {
        error: error.message,
        stack: error.stack,
      });

      // Envoyer à Sentry pour monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'cart/POST',
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

export async function PUT(req) {
  // Journalisation structurée de la requête
  logger.info('Cart API PUT request received', {
    route: 'api/cart/PUT',
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
      await rateLimiter.check(req);
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
      logger.warn('User not found for cart PUT request', {
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

    const body = await req.json();

    // Nettoyer les paniers expirés au passage (opération asynchrone en arrière-plan)
    Cart.removeExpiredItems().catch((err) => {
      logger.error('Failed to remove expired cart items', {
        error: err.message,
      });
    });

    // Extraire les identifiants nécessaires
    const cartItemId = body.product?.id;
    const productId = body.product?.productId;
    const action = body.value;

    if (!cartItemId || !productId) {
      logger.warn('Invalid cart item data provided for update', {
        userId: user._id,
        cartItemId,
        productId,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid cart item data',
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
        const result = Cart.findById(cartItemId).populate('product');
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const cartItem = await cartItemPromise;

    if (!cartItem) {
      logger.warn('Cart item not found for update', {
        userId: user._id,
        cartItemId,
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
      logger.warn('Unauthorized access attempt to cart item', {
        requestUser: user._id.toString(),
        cartItemUser: cartItem.user.toString(),
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized access',
        },
        { status: 403 },
      );
    }

    // Vérifier que le produit existe encore
    const productPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Product query timeout'));
      }, 3000);

      try {
        const result = Product.findById(productId);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const product = await productPromise;

    if (!product) {
      logger.warn('Product not found for cart update', {
        userId: user._id,
        productId,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Product not found',
        },
        { status: 404 },
      );
    }

    // Vérifier si le produit est actif et non supprimé
    if (!product.isActive) {
      logger.warn('Attempt to update cart with inactive or deleted product', {
        userId: user._id,
        productId: product._id,
        active: product.active,
        deleted: product.deleted,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Product is no longer available',
        },
        { status: 400 },
      );
    }

    let updatedCart;
    let operation = 'unknown';

    // Gérer l'augmentation de la quantité
    if (action === INCREASE) {
      operation = 'increase';
      const neededQuantity = cartItem.quantity + 1;

      // Vérifier la disponibilité du stock
      if (neededQuantity > product.stock) {
        logger.warn('Insufficient stock for cart update', {
          userId: user._id,
          productId: product._id,
          requestedQuantity: neededQuantity,
          availableStock: product.stock,
        });

        return NextResponse.json(
          {
            success: false,
            message: `Only ${product.stock} units available`,
          },
          { status: 400 },
        );
      }

      // Utiliser la méthode du modèle Cart avec timeout
      const updatePromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Cart update timeout'));
        }, 3000);

        try {
          const result = cartItem.updateQuantity(neededQuantity);
          clearTimeout(timeoutId);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      updatedCart = await updatePromise;
    }
    // Gérer la diminution de la quantité
    else if (action === DECREASE) {
      operation = 'decrease';
      const neededQuantity = cartItem.quantity - 1;

      // Si la quantité est réduite à 0, supprimer l'élément du panier
      if (neededQuantity <= 0) {
        const deletePromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Cart delete timeout'));
          }, 3000);

          try {
            const result = Cart.findByIdAndDelete(cartItemId);
            clearTimeout(timeoutId);
            resolve(result);
          } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
          }
        });

        await deletePromise;
        updatedCart = null; // Indiquer que l'élément a été supprimé
        operation = 'remove';
      } else {
        // Utiliser la méthode du modèle Cart avec timeout
        const updatePromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Cart update timeout'));
          }, 3000);

          try {
            const result = cartItem.updateQuantity(neededQuantity);
            clearTimeout(timeoutId);
            resolve(result);
          } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
          }
        });

        updatedCart = await updatePromise;
      }
    } else {
      logger.warn('Invalid cart update action', {
        userId: user._id,
        action,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid action',
        },
        { status: 400 },
      );
    }

    // Générer la clé de cache spécifique
    const cacheKey = getCacheKey('cart', { userId: user._id.toString() });

    // Invalider le cache spécifique pour ce panier utilisateur
    appCache.cart.delete(cacheKey);

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

    logger.info('Cart updated successfully', {
      userId: user._id,
      productId: product._id,
      operation,
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
          operation,
          updatedItemId: updatedCart ? updatedCart._id : cartItemId,
        },
        message:
          operation === 'remove'
            ? 'Product removed from cart'
            : 'Cart quantity updated',
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
      logger.error('MongoDB error in cart PUT API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in cart PUT API', {
        error: error.message,
      });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in cart PUT API', {
        error: error.message,
      });
    } else {
      // Erreur non identifiée
      logger.error('Unhandled error in cart PUT API', {
        error: error.message,
        stack: error.stack,
      });

      // Envoyer à Sentry pour monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'cart/PUT',
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
