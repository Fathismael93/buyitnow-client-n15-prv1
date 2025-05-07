import { NextResponse } from 'next/server';

import dbConnect from '@/backend/config/dbConnect';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import User from '@/backend/models/user';
import logger from '@/utils/logger';
import { captureException } from '@/monitoring/sentry';
import { createRateLimiter } from '@/utils/rateLimit';
import { validateProfileWithLogging } from '@/helpers/schemas';
import { appCache, getCacheKey } from '@/utils/cache';

/**
 * Gère la mise à jour du profil utilisateur
 * Route PUT /api/auth/me/update
 */
export async function PUT(req) {
  // Identifiant unique pour le suivi de la requête
  const requestId = `profile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const startTime = performance.now();

  // Journalisation structurée de la requête entrante
  logger.info('Profile update request received', {
    route: 'api/auth/me/update',
    requestId,
    contentType: req.headers.get('content-type'),
  });

  try {
    // 1. Vérifier l'authentification
    await isAuthenticatedUser(req, NextResponse);

    // 2. Appliquer le rate limiting pour éviter les abus
    const rateLimiter = createRateLimiter('AUTHENTICATED_API', {
      prefix: 'profile_update',
      getTokenFromReq: (req) => req.user?.email || req.user?.id,
    });

    try {
      await rateLimiter.check(req);
    } catch (rateLimitError) {
      logger.warn('Rate limit exceeded for profile update', {
        user: req.user?.email,
        requestId,
        error: rateLimitError.message,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Too many update requests, please try again later',
          requestId,
        },
        {
          status: 429,
          headers: rateLimitError.headers || {
            'Retry-After': '120', // 2 minutes par défaut
          },
        },
      );
    }

    // 3. Connexion à la base de données avec timeout
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
      logger.error('Database connection failed for profile update', {
        requestId,
        user: req.user?.email,
        error: dbError.message,
      });

      captureException(dbError, {
        tags: {
          component: 'profile-api',
          operation: 'db-connect',
          requestId,
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Service temporarily unavailable, please try again later',
          requestId,
        },
        { status: 503 },
      );
    }

    if (!connectionInstance.connection) {
      logger.error('Invalid database connection for profile update', {
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

    // 4. Récupérer l'utilisateur
    let user;
    try {
      // Utiliser un timeout pour la requête utilisateur
      const userPromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('User query timeout'));
        }, 3000);

        User.findOne({ email: req.user.email })
          .then((result) => {
            clearTimeout(timeoutId);
            resolve(result);
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
      });

      user = await userPromise;

      if (!user) {
        logger.warn('User not found for profile update', {
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
      logger.error('Error finding user for profile update', {
        requestId,
        error: userError.message,
        email: req.user.email,
      });

      captureException(userError, {
        tags: { component: 'profile-api', operation: 'find-user', requestId },
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

    // 5. Valider et récupérer les données du corps de la requête
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      logger.warn('Invalid JSON in profile update request', {
        requestId,
        error: parseError.message,
        user: user._id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request format',
          requestId,
        },
        { status: 400 },
      );
    }

    // 6. Validation et sanitisation des données avec le schéma Yup
    try {
      const validationResult = await validateProfileWithLogging(body);

      if (!validationResult.isValid) {
        logger.warn('Profile validation failed', {
          requestId,
          userId: user._id,
          validationErrors: validationResult.errors,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'Validation failed',
            errors: validationResult.errors,
            requestId,
          },
          { status: 400 },
        );
      }

      // Utiliser les données validées/sanitisées
      body = validationResult.data;
    } catch (validationError) {
      logger.error('Error during profile validation', {
        requestId,
        userId: user._id,
        error: validationError.message,
      });

      captureException(validationError, {
        tags: { component: 'profile-api', operation: 'validation', requestId },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Error validating profile data',
          requestId,
        },
        { status: 500 },
      );
    }

    // 7. Mise à jour sécurisée avec projection et validation
    try {
      // Créer un objet clean avec seulement les champs autorisés
      const allowedFields = ['name', 'phone', 'avatar'];
      const updateData = {};

      allowedFields.forEach((field) => {
        if (body[field] !== undefined) {
          updateData[field] = body[field];
        }
      });

      // Si aucun champ à mettre à jour, retourner une erreur
      if (Object.keys(updateData).length === 0) {
        logger.warn('No valid fields to update', {
          requestId,
          userId: user._id,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'No valid fields to update',
            requestId,
          },
          { status: 400 },
        );
      }

      // Ajouter timestamp de mise à jour
      updateData.updatedAt = new Date();

      // Mise à jour avec options sécurisées
      const updatedUserPromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Update query timeout'));
        }, 5000);

        User.findOneAndUpdate({ email: req.user.email }, updateData, {
          new: true, // Retourner le document mis à jour
          runValidators: true, // Exécuter les validateurs
          projection: {
            // Projection pour limiter les données retournées
            password: 0,
            resetPasswordToken: 0,
            resetPasswordExpire: 0,
          },
        })
          .then((result) => {
            clearTimeout(timeoutId);
            resolve(result);
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
      });

      const updatedUser = await updatedUserPromise;

      if (!updatedUser) {
        logger.error('User update failed - not found after update', {
          requestId,
          userId: user._id,
        });

        return NextResponse.json(
          {
            success: false,
            message: 'User update failed',
            requestId,
          },
          { status: 500 },
        );
      }

      // 8. Invalider les caches pertinents
      try {
        // Utiliser getCacheKey pour générer des clés de cache cohérentes
        const userProfileCacheKey = getCacheKey('user_profile', {
          userId: user._id.toString(),
        });

        // Invalider le cache du profil utilisateur
        if (appCache.products) {
          appCache.products.delete(userProfileCacheKey);
          appCache.products.invalidatePattern(/^user:/);
        }
      } catch (cacheError) {
        // Erreur non critique, juste logger
        logger.warn('Cache invalidation error during profile update', {
          requestId,
          userId: user._id,
          error: cacheError.message,
        });
      }

      // 9. Journaliser le succès
      logger.info('Profile updated successfully', {
        requestId,
        userId: user._id,
        updatedFields: Object.keys(updateData).filter(
          (field) => field !== 'updatedAt',
        ),
        processingTime: Math.round(performance.now() - startTime),
      });

      // 10. Retourner une réponse avec headers de sécurité
      const securityHeaders = {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
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
          message: 'Profile updated successfully',
          data: {
            updatedUser: {
              name: updatedUser.name,
              email: updatedUser.email,
              phone: updatedUser.phone,
              avatar: updatedUser.avatar,
              _id: updatedUser._id,
            },
          },
          requestId,
        },
        {
          status: 200,
          headers: securityHeaders,
        },
      );
    } catch (updateError) {
      logger.error('Error updating user profile', {
        requestId,
        userId: user._id,
        error: updateError.message,
        stack: updateError.stack,
      });

      captureException(updateError, {
        tags: { component: 'profile-api', operation: 'update-user', requestId },
        extra: { userId: user._id },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Error updating profile',
          requestId,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    // Gestion des erreurs globales avec classification et journalisation structurée
    let statusCode = 500;
    let errorMessage =
      'Something went wrong with the server! Please try again later';
    let errorCode = `ERR${Date.now().toString(36).substring(4)}`;

    // Classification des erreurs
    if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in profile update API', {
        requestId,
        error: error.message,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Timeout in profile update API', {
        requestId,
        error: error.message,
      });
    } else if (
      error.name === 'ValidationError' ||
      error.message?.includes('validation')
    ) {
      statusCode = 400;
      errorMessage = 'Profile validation failed';
      errorCode = 'VALIDATION_ERROR';
      logger.warn('Validation error in profile update API', {
        requestId,
        error: error.message,
      });
    } else {
      // Erreur non identifiée
      logger.error('Unhandled error in profile update API', {
        requestId,
        errorCode,
        error: error.message,
        stack: error.stack,
        user: req.user?.email || 'unknown',
      });

      // Envoyer à Sentry pour monitoring
      captureException(error, {
        tags: {
          component: 'profile-api',
          operation: 'global-handler',
          requestId,
          errorCode,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
        code: errorCode,
        requestId,
      },
      { status: statusCode },
    );
  } finally {
    // Journalisation du temps de traitement total
    const processingTime = Math.round(performance.now() - startTime);
    logger.debug('Profile update API processing completed', {
      requestId,
      processingTime,
      user: req.user?.email || 'unknown',
    });
  }
}
