import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import Order from '@/backend/models/order';
import User from '@/backend/models/user';
import Product from '@/backend/models/product';
import Cart from '@/backend/models/cart';
// eslint-disable-next-line no-unused-vars
import Category from '@/backend/models/category';
import { appCache } from '@/utils/cache';
import logger from '@/utils/logger';
import { captureException } from '@/monitoring/sentry';
import { createRateLimiter } from '@/utils/rateLimit';

/**
 * Gère la création de commandes via webhook
 * Endpoint sécurisé avec authentification et vérifications multiples du stock
 */
export async function POST(req) {
  const requestId = `order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const startTime = performance.now();

  // Journalisation structurée de la requête entrante
  logger.info('Order webhook received', {
    route: 'api/orders/webhook',
    requestId,
    contentType: req.headers.get('content-type'),
  });

  try {
    // 1. Authentification et application du rate limiting
    await isAuthenticatedUser(req, NextResponse);

    // Application du rate limit spécifique pour les commandes (limites strictes)
    const rateLimiter = createRateLimiter('CRITICAL_ENDPOINTS', {
      prefix: 'order_webhook',
      getTokenFromReq: (req) => req.user?.email || req.user?.id,
    });

    try {
      await rateLimiter.check(req);
    } catch (rateLimitError) {
      logger.warn('Rate limit exceeded for order webhook', {
        user: req.user?.email,
        requestId,
        error: rateLimitError.message,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Too many order requests, please try again later',
          requestId,
        },
        {
          status: 429,
          headers: {
            ...rateLimitError.headers,
            'X-Request-Id': requestId,
          },
        },
      );
    }

    // 2. Connexion à la base de données avec timeout et gestion d'erreur améliorée
    let connectionInstance;
    try {
      const connectionPromise = dbConnect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Database connection timeout')),
          5000,
        );
      });

      connectionInstance = await Promise.race([
        connectionPromise,
        timeoutPromise,
      ]);
    } catch (dbError) {
      logger.error('Database connection failed for order webhook', {
        requestId,
        user: req.user?.email,
        error: dbError.message,
        stack: dbError.stack,
      });

      captureException(dbError, {
        tags: {
          component: 'order-webhook',
          operation: 'db-connect',
          requestId,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Database service unavailable, please try again later',
          requestId,
        },
        { status: 503 },
      );
    }

    if (!connectionInstance.connection) {
      logger.error('Invalid database connection for order webhook', {
        requestId,
        user: req.user?.email,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
          requestId,
        },
        { status: 500 },
      );
    }

    // 3. Validation et récupération de l'utilisateur
    let user;
    try {
      user = await User.findOne({ email: req.user.email }).select('_id').lean();

      if (!user) {
        logger.warn('User not found for order webhook', {
          requestId,
          email: req.user.email,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'User not found',
            requestId,
          },
          { status: 404 },
        );
      }
    } catch (userError) {
      logger.error('Error finding user for order webhook', {
        requestId,
        error: userError.message,
        email: req.user.email,
      });

      captureException(userError, {
        tags: { component: 'order-webhook', operation: 'find-user', requestId },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Error finding user account',
          requestId,
        },
        { status: 500 },
      );
    }

    // 4. Récupération et validation des données de commande
    let orderData;
    try {
      orderData = await req.json();

      // Validation basique des données de commande
      if (
        !orderData ||
        !Array.isArray(orderData.orderItems) ||
        orderData.orderItems.length === 0
      ) {
        logger.warn('Invalid order data structure', {
          requestId,
          userId: user._id,
          orderData: JSON.stringify(orderData).substring(0, 200) + '...',
        });

        return NextResponse.json(
          {
            success: false,
            message: 'Invalid order data structure',
            requestId,
          },
          { status: 400 },
        );
      }

      // Vérification des champs requis
      const requiredFields = ['paymentInfo', 'totalAmount', 'orderItems'];
      const missingFields = requiredFields.filter((field) => !orderData[field]);

      if (missingFields.length > 0) {
        logger.warn('Missing required order fields', {
          requestId,
          userId: user._id,
          missingFields,
        });

        return NextResponse.json(
          {
            success: false,
            message: `Missing required fields: ${missingFields.join(', ')}`,
            requestId,
          },
          { status: 400 },
        );
      }

      // Vérification des champs paymentInfo
      const paymentInfoRequired = [
        'amountPaid',
        'typePayment',
        'paymentAccountNumber',
        'paymentAccountName',
      ];
      const missingPaymentFields = paymentInfoRequired.filter(
        (field) => !orderData.paymentInfo || !orderData.paymentInfo[field],
      );

      if (missingPaymentFields.length > 0) {
        logger.warn('Missing required payment fields', {
          requestId,
          userId: user._id,
          missingPaymentFields,
        });

        return NextResponse.json(
          {
            success: false,
            message: `Missing payment information: ${missingPaymentFields.join(', ')}`,
            requestId,
          },
          { status: 400 },
        );
      }

      // Vérifier que les valeurs numériques sont valides
      if (
        isNaN(parseFloat(orderData.totalAmount)) ||
        parseFloat(orderData.totalAmount) <= 0
      ) {
        logger.warn('Invalid order total amount', {
          requestId,
          userId: user._id,
          totalAmount: orderData.totalAmount,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'Invalid order total amount',
            requestId,
          },
          { status: 400 },
        );
      }

      // Assigner l'ID utilisateur
      orderData.user = user._id;
    } catch (parseError) {
      logger.error('Failed to parse order data', {
        requestId,
        userId: user._id,
        error: parseError.message,
      });

      captureException(parseError, {
        tags: {
          component: 'order-webhook',
          operation: 'parse-data',
          requestId,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid order data format',
          requestId,
        },
        { status: 400 },
      );
    }

    // 5. Extraction et validation des produits commandés
    let productsIdsQuantities = [];
    try {
      // Extraction des IDs et quantités des produits commandés
      if (orderData.orderItems && orderData.orderItems.length > 0) {
        productsIdsQuantities = orderData.orderItems.map((item) => ({
          id: item.product,
          quantity: item.quantity,
          cartId: item.cartId,
          name: item.name || null,
        }));

        // Nettoyage des données pour éviter les champs non voulus dans la commande
        orderData.orderItems.forEach((item) => {
          delete item.cartId;
          delete item.category;
        });
      }

      // Vérification de la consistance des données
      if (productsIdsQuantities.length === 0) {
        logger.warn('No valid products in order', {
          requestId,
          userId: user._id,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'No valid products in order',
            requestId,
          },
          { status: 400 },
        );
      }

      // Vérifier que les quantités sont valides
      const invalidQuantities = productsIdsQuantities.filter(
        (item) =>
          !item.id ||
          !item.quantity ||
          isNaN(item.quantity) ||
          item.quantity <= 0,
      );

      if (invalidQuantities.length > 0) {
        logger.warn('Invalid product quantities in order', {
          requestId,
          userId: user._id,
          invalidItems: invalidQuantities,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'Invalid product quantities detected',
            requestId,
          },
          { status: 400 },
        );
      }
    } catch (extractError) {
      logger.error('Failed to extract product information', {
        requestId,
        userId: user._id,
        error: extractError.message,
      });

      captureException(extractError, {
        tags: {
          component: 'order-webhook',
          operation: 'extract-products',
          requestId,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Failed to process order items',
          requestId,
        },
        { status: 500 },
      );
    }

    // 6. Vérification et mise à jour du stock avec transactions atomiques
    let updatedProductsReturned = [];
    let inavailableStockProducts = [];
    let transaction = null;

    try {
      // Débuter une session de transaction pour assurer l'atomicité
      const session = await connectionInstance.connection.startSession();
      transaction = session.startTransaction();

      // Vérification parallèle des stocks avec Promise.all pour performance
      const productChecks = await Promise.all(
        productsIdsQuantities.map(async (element, index) => {
          try {
            // Utiliser findOne plutôt que findById pour plus d'efficacité avec lean()
            const product = await Product.findOne(
              { _id: element.id },
              { stock: 1, name: 1, images: 1, price: 1 },
            )
              .populate('category', 'categoryName')
              .lean()
              .session(session);

            if (!product) {
              logger.warn('Product not found during order processing', {
                requestId,
                userId: user._id,
                productId: element.id,
              });

              return {
                status: 'not_found',
                productId: element.id,
                index,
              };
            }

            // Ajouter la catégorie à l'article de commande
            const itemInOrder = orderData.orderItems[index];
            if (product.category) {
              itemInOrder.category = product.category.categoryName;
            }

            // Vérifier si le stock est suffisant
            const isProductLeft = product.stock >= element.quantity;

            if (isProductLeft) {
              // Mise à jour atomique du stock
              const updateResult = await Product.findByIdAndUpdate(
                product._id,
                {
                  $inc: { stock: -element.quantity, sold: element.quantity },
                },
                {
                  new: true,
                  session,
                  select: '_id name stock sold',
                },
              );

              return {
                status: 'available',
                product: updateResult,
                originalProduct: product,
                index,
              };
            } else {
              return {
                status: 'unavailable',
                product: {
                  id: product._id,
                  name: product.name,
                  image:
                    product.images && product.images.length > 0
                      ? product.images[0].url
                      : null,
                  stock: product.stock,
                  quantity: element.quantity,
                },
                index,
              };
            }
          } catch (error) {
            logger.error('Error checking product availability', {
              requestId,
              userId: user._id,
              productId: element.id,
              error: error.message,
            });

            captureException(error, {
              tags: {
                component: 'order-webhook',
                operation: 'check-product',
                requestId,
                productId: element.id,
              },
            });

            return {
              status: 'error',
              productId: element.id,
              error: error.message,
              index,
            };
          }
        }),
      );

      // Analyser les résultats des vérifications
      for (const result of productChecks) {
        if (result.status === 'available') {
          updatedProductsReturned.push(result.product);
        } else if (result.status === 'unavailable') {
          inavailableStockProducts.push(result.product);
        } else if (result.status === 'not_found') {
          // Ajouter dans la liste des produits indisponibles
          inavailableStockProducts.push({
            id: result.productId,
            name: productsIdsQuantities[result.index].name || 'Unknown product',
            stock: 0,
            quantity: productsIdsQuantities[result.index].quantity,
            error: 'Product not found',
          });
        } else if (result.status === 'error') {
          // Considérer comme indisponible en cas d'erreur
          inavailableStockProducts.push({
            id: result.productId,
            name: productsIdsQuantities[result.index].name || 'Unknown product',
            error: 'Error checking availability',
          });
        }
      }

      // Vérifier si l'opération est complètement réussie
      const difference =
        productsIdsQuantities.length - updatedProductsReturned.length;

      // Confirmer la commande si tous les produits sont disponibles
      if (difference === 0) {
        // 7. Créer la commande et supprimer les articles du panier en une seule transaction
        try {
          // Supprimer les articles du panier
          const cartItemIds = productsIdsQuantities
            .filter((element) => element.cartId)
            .map((element) => element.cartId);

          if (cartItemIds.length > 0) {
            await Cart.deleteMany(
              { _id: { $in: cartItemIds }, user: user._id },
              { session },
            );
          }

          // Créer la commande
          const order = await Order.create([orderData], { session });

          // Tout est ok, confirmer la transaction
          await session.commitTransaction();
          session.endSession();

          // Invalidation du cache après commande réussie
          appCache.products.invalidatePattern(/^products:/);
          appCache.cart.invalidatePattern(/^cart:/);

          // Journalisation du succès
          logger.info('Order created successfully', {
            requestId,
            userId: user._id,
            orderId: order[0]._id,
            orderNumber: order[0].orderNumber,
            totalAmount: orderData.totalAmount,
            itemCount: orderData.orderItems.length,
            processingTime: Math.round(performance.now() - startTime),
          });

          return NextResponse.json(
            {
              success: true,
              id: order[0]._id,
              orderNumber: order[0].orderNumber,
              requestId,
            },
            { status: 201 },
          );
        } catch (orderError) {
          // Annuler la transaction en cas d'erreur
          await session.abortTransaction();
          session.endSession();

          logger.error('Failed to create order or clean cart', {
            requestId,
            userId: user._id,
            error: orderError.message,
            stack: orderError.stack,
          });

          captureException(orderError, {
            tags: {
              component: 'order-webhook',
              operation: 'create-order',
              requestId,
            },
          });

          return NextResponse.json(
            {
              success: false,
              message: 'Failed to process order',
              requestId,
            },
            { status: 500 },
          );
        }
      } else {
        // Des produits sont indisponibles, annuler la transaction
        await session.abortTransaction();
        session.endSession();

        logger.warn('Products unavailable during order processing', {
          requestId,
          userId: user._id,
          unavailableProducts: inavailableStockProducts.map((p) => ({
            id: p.id,
            name: p.name,
            requestedQty: p.quantity,
            availableQty: p.stock,
          })),
        });

        return NextResponse.json(
          {
            success: false,
            message:
              'Some products were unavailable when we started the payment operation so we stopped everything!',
            data: { inavailableStockProducts },
            requestId,
          },
          { status: 409 },
        );
      }
    } catch (stockError) {
      // Assurer que la transaction est annulée en cas d'erreur
      if (transaction) {
        try {
          await transaction.abortTransaction();
        } catch (abortError) {
          logger.error('Failed to abort transaction', {
            requestId,
            userId: user._id,
            error: abortError.message,
          });
        }
      }

      logger.error('Error during stock verification', {
        requestId,
        userId: user._id,
        error: stockError.message,
        stack: stockError.stack,
      });

      captureException(stockError, {
        tags: {
          component: 'order-webhook',
          operation: 'verify-stock',
          requestId,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Error verifying product availability',
          requestId,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    // Gestion globale des erreurs inattendues
    const errorCode = `ERR${Date.now().toString(36).substring(4)}`;

    logger.error('Unhandled error in order webhook', {
      requestId,
      errorCode,
      error: error.message,
      stack: error.stack,
      user: req.user?.email || 'unknown',
    });

    captureException(error, {
      tags: {
        component: 'order-webhook',
        operation: 'global-handler',
        requestId,
        errorCode,
      },
    });

    return NextResponse.json(
      {
        success: false,
        message: 'Something is wrong with server! Please try again later',
        errorCode,
        requestId,
      },
      { status: 500 },
    );
  } finally {
    // Journalisation du temps de traitement total
    const processingTime = Math.round(performance.now() - startTime);
    logger.debug('Order webhook processing completed', {
      requestId,
      processingTime,
      user: req.user?.email || 'unknown',
    });
  }
}
