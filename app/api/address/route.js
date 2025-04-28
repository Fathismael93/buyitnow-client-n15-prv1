import { NextResponse } from 'next/server';

import Address from '@/backend/models/address';
import User from '@/backend/models/user';
import PaymentType from '@/backend/models/paymentType';
import DeliveryPrice from '@/backend/models/deliveryPrice';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import dbConnect from '@/backend/config/dbConnect';
import { addressSchema } from '@/helpers/schemas';
import { sanitizeAddress, isAddressValid } from '@/utils/addressSanitizer';
import { captureException } from '@/monitoring/sentry';
import logger from '@/utils/logger';
import { createRateLimiter } from '@/utils/rateLimit';
import { validateWithLogging } from '@/helpers/schemas';

export async function GET(req) {
  try {
    await isAuthenticatedUser(req, NextResponse);

    dbConnect();

    const user = await User.findOne({ email: req?.user?.email }).select('_id');

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'User not found',
        },
        { status: 404 },
      );
    }

    const addresses = await Address.find({ user: user?._id });

    if (addresses) {
      const paymentTypes = await PaymentType.find();
      const deliveryPrice = await DeliveryPrice.find();

      return NextResponse.json(
        {
          success: true,
          data: {
            addresses,
            paymentTypes,
            deliveryPrice,
          },
        },
        { status: 200 },
      );
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

export async function POST(req) {
  // Journalisation structurée de la requête
  logger.info('Address API POST request received', {
    route: 'api/address/POST',
    user: req.user?.email || 'unauthenticated',
  });

  try {
    // Vérifier l'authentification
    await isAuthenticatedUser(req, NextResponse);

    // Appliquer le rate limiting pour les requêtes authentifiées
    const rateLimiter = createRateLimiter('AUTHENTICATED_API', {
      prefix: 'address_api',
      getTokenFromReq: (req) => req.user?.email || req.user?.id,
    });

    try {
      await rateLimiter.check(req);
    } catch (rateLimitError) {
      logger.warn('Rate limit exceeded for address API', {
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
    const connectionPromise = dbConnect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout')), 5000);
    });

    const connectionInstance = await Promise.race([
      connectionPromise,
      timeoutPromise,
    ]);

    if (!connectionInstance.connection) {
      logger.error('Database connection failed for address request', {
        user: req.user?.email,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Database connection failed',
        },
        { status: 503 },
      );
    }

    // Trouver l'utilisateur
    const user = await User.findOne({ email: req.user.email }).select('_id');

    if (!user) {
      logger.warn('User not found for address request', {
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
      logger.warn('Unauthorized access attempt to address API', {
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

    // Parser le corps de la requête avec gestion d'erreur
    let addressData;
    try {
      addressData = await req.json();
    } catch (parseError) {
      logger.warn('Invalid JSON in address request', {
        error: parseError.message,
        user: user._id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request body',
        },
        { status: 400 },
      );
    }

    // Limiter la taille des données entrantes
    if (JSON.stringify(addressData).length > 10000) {
      logger.warn('Address data too large', {
        user: user._id,
        dataSize: JSON.stringify(addressData).length,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Request body too large',
        },
        { status: 413 },
      );
    }

    // Sanitiser les données d'adresse
    const sanitizedAddress = sanitizeAddress(addressData);

    // Vérifier si l'adresse est valide après sanitisation
    if (!isAddressValid(sanitizedAddress)) {
      logger.warn('Invalid address data after sanitization', {
        user: user._id,
        sanitizedFields: Object.keys(sanitizedAddress),
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid address data',
          errors: [
            { field: 'address', message: 'Address information is incomplete' },
          ],
        },
        { status: 400 },
      );
    }

    // Valider les données avec le schéma Yup
    try {
      await validateWithLogging(addressSchema, sanitizedAddress);
    } catch (validationError) {
      logger.warn('Address validation failed', {
        user: user._id,
        errors: validationError.errors,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Address validation failed',
          errors: validationError.errors
            ? validationError.errors.map((error) => ({
                field: error.path || 'unknown',
                message: error.message,
              }))
            : [
                {
                  field: 'address',
                  message: 'Invalid address data',
                },
              ],
        },
        { status: 400 },
      );
    }

    // Ajouter l'ID utilisateur et préparer l'objet adresse
    sanitizedAddress.user = user._id;

    // Vérifier si c'est l'adresse par défaut
    if (sanitizedAddress.isDefault) {
      // Mettre à jour toutes les autres adresses pour qu'elles ne soient plus par défaut
      const updatePromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Address update timeout'));
        }, 5000);

        try {
          const result = Address.updateMany(
            { user: user._id, isDefault: true },
            { isDefault: false },
          );
          clearTimeout(timeoutId);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      try {
        await updatePromise;
      } catch (updateError) {
        logger.error('Failed to update existing default addresses', {
          user: user._id,
          error: updateError.message,
        });
        // Continuer l'exécution même si cette étape échoue
      }
    }

    // Compter les adresses existantes pour l'utilisateur
    const addressCount = await Address.countDocuments({ user: user._id });

    // Limiter le nombre d'adresses par utilisateur (max 10)
    if (addressCount >= 10) {
      logger.warn('Maximum address limit reached', {
        user: user._id,
        addressCount,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Maximum number of addresses reached (10)',
        },
        { status: 400 },
      );
    }

    // Créer l'adresse avec timeout
    const createAddressPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Address creation timeout'));
      }, 5000);

      try {
        const result = Address.create(sanitizedAddress);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const address = await createAddressPromise;

    // Log du succès
    logger.info('Address created successfully', {
      userId: user._id,
      addressId: address._id,
      isDefault: address.isDefault,
    });

    // Headers de sécurité additionnels
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

    return NextResponse.json(
      {
        success: true,
        data: {
          address,
        },
        message: 'Address added successfully',
      },
      {
        status: 201,
        headers: securityHeaders,
      },
    );
  } catch (error) {
    // Gestion d'erreur plus granulaire
    let statusCode = 500;
    let errorMessage = 'Something went wrong, please try again later';
    let errorCode = 'SERVER_ERROR';

    // Journalisation et classification des erreurs
    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = 'Invalid address data provided';
      errorCode = 'VALIDATION_ERROR';
      logger.warn('Address validation error', { error: error.message });
    } else if (error.code === 11000) {
      // Gestion des erreurs de duplication (index unique)
      statusCode = 409;
      errorMessage = 'This address already exists';
      errorCode = 'DUPLICATE_ERROR';
      logger.warn('Duplicate address entry', {
        error: error.message,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue,
      });
    } else if (
      error.name === 'MongoError' ||
      error.name === 'MongoServerError'
    ) {
      errorCode = 'DATABASE_ERROR';
      logger.error('MongoDB error in address POST API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in address POST API', {
        error: error.message,
      });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in address POST API', {
        error: error.message,
      });
    } else {
      // Erreur non identifiée
      logger.error('Unhandled error in address POST API', {
        error: error.message,
        stack: error.stack,
      });

      // Envoyer à Sentry pour monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'address/POST',
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
