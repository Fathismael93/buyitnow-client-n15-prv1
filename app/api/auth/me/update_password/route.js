import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import isAuthenticatedUser from '@/backend/middlewares/auth';
import dbConnect from '@/backend/config/dbConnect';
import User from '@/backend/models/user';
import logger from '@/utils/logger';
import { createRateLimiter } from '@/utils/rateLimit';
import { appCache, getCacheKey } from '@/utils/cache';
import { updatePasswordSchema, validateWithLogging } from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';

export async function PUT(req) {
  // Structured logging of request
  logger.info('Password update request received', {
    route: 'api/auth/me/update_password/PUT',
    user: req.user?.email || 'unauthenticated',
  });

  try {
    // Verify authentication
    await isAuthenticatedUser(req, NextResponse);

    // Apply rate limiting for authenticated requests
    const rateLimiter = createRateLimiter('AUTHENTICATED_API', {
      prefix: 'password_update_api',
      getTokenFromReq: (req) => req.user?.email || req.user?.id,
    });

    try {
      await rateLimiter.check(req);
    } catch (rateLimitError) {
      logger.warn('Rate limit exceeded for password update API', {
        user: req.user?.email,
        error: rateLimitError.message,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Too many password update attempts. Please try again later.',
        },
        {
          status: 429,
          headers: rateLimitError.headers || {
            'Retry-After': '60',
          },
        },
      );
    }

    // Connect to the database with timeout
    const connectionPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Database connection timeout'));
      }, 3000); // 3 seconds timeout

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
      logger.error('Database connection failed during password update', {
        user: req.user?.email,
      });

      return NextResponse.json(
        {
          success: false,
          message:
            'Password update service unavailable. Please try again later.',
        },
        { status: 503 },
      );
    }

    // Parse request body with error handling
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      logger.warn('Invalid JSON in password update request', {
        error: parseError.message,
        user: req.user?.email,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request body',
        },
        { status: 400 },
      );
    }

    // Input validation
    try {
      await validateWithLogging(updatePasswordSchema, {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
    } catch (validationError) {
      logger.warn('Password validation failed', {
        user: req.user?.email,
        errors: validationError.errors,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Password validation failed',
          errors: validationError.errors
            ? validationError.errors.map((error) => ({
                field: error.path || 'unknown',
                message: error.message,
              }))
            : [
                {
                  field: 'password',
                  message: 'Invalid password data',
                },
              ],
        },
        { status: 400 },
      );
    }

    // Find the user with timeout
    const userFindPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('User query timeout'));
      }, 3000);

      try {
        const result = User.findOne({ email: req.user.email }).select(
          '+password',
        );
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const user = await userFindPromise;

    if (!user) {
      logger.warn('User not found for password update', {
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

    // Check if account is locked
    if (user.isLocked && user.isLocked()) {
      logger.warn('Attempt to update password on locked account', {
        email: req.user.email,
      });

      return NextResponse.json(
        {
          success: false,
          message:
            'Account is temporarily locked. Please try again later or reset your password.',
        },
        { status: 403 },
      );
    }

    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;

    // Verify current password
    let isPasswordMatched;
    try {
      isPasswordMatched = await bcrypt.compare(currentPassword, user.password);
    } catch (bcryptError) {
      logger.error('Error comparing passwords', {
        user: req.user.email,
        error: bcryptError.message,
      });

      captureException(bcryptError, {
        tags: {
          component: 'api',
          route: 'auth/me/update_password',
          action: 'password_compare',
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Password verification failed. Please try again.',
        },
        { status: 500 },
      );
    }

    if (!isPasswordMatched) {
      // Increment login attempts for security (same mechanism as login)
      try {
        await user.incrementLoginAttempts();
      } catch (incrementError) {
        logger.error('Failed to increment login attempts', {
          user: req.user.email,
          error: incrementError.message,
        });
        // Continue despite this error
      }

      logger.warn('Incorrect current password provided', {
        user: req.user.email,
        attempts: user.loginAttempts + 1,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Current password is incorrect',
        },
        { status: 400 },
      );
    }

    // Ensure new password is different from current
    if (currentPassword === newPassword) {
      logger.warn('New password same as current password', {
        user: req.user.email,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'New password must be different from current password',
        },
        { status: 400 },
      );
    }

    // Update password with timeout
    const updatePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Password update timeout'));
      }, 5000);

      try {
        // Password hashing is handled by pre-save hook in User model
        user.password = newPassword;
        user.passwordChangedAt = Date.now();
        user.loginAttempts = 0; // Reset login attempts
        user.lockUntil = null; // Unlock account if locked

        const result = user.save();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    await updatePromise;

    // Invalider le cache d'utilisateur après un changement de mot de passe réussi
    try {
      // Clé pour cet utilisateur spécifique
      const userCacheKey = getCacheKey('user', {
        userId: user._id.toString(),
      });

      // Invalider toutes les entrées de cache qui pourraient contenir des données de cet utilisateur
      appCache.authUsers.delete(userCacheKey);
      appCache.authUsers.delete(`user:${user._id}`);

      // Invalider également tous les patterns liés aux utilisateurs qui pourraient inclure cet utilisateur
      appCache.authUsers.invalidatePattern(new RegExp(`^user:${user._id}`));

      logger.debug('User cache invalidated after password update', {
        userId: user._id.toString(),
      });
    } catch (cacheError) {
      // Ne pas bloquer le processus en cas d'erreur de cache
      logger.warn('Failed to invalidate user cache after password update', {
        userId: user._id.toString(),
        error: cacheError.message,
      });
      // Continuer malgré cette erreur
    }

    // Add security headers
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

    logger.info('Password updated successfully', {
      user: req.user.email,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Password updated successfully',
      },
      {
        status: 200,
        headers: securityHeaders,
      },
    );
  } catch (error) {
    // Granular error handling
    let statusCode = 500;
    let errorMessage = 'Something went wrong, please try again later';
    let errorCode = 'SERVER_ERROR';

    // Error logging and classification
    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorMessage = 'Invalid password data provided';
      errorCode = 'VALIDATION_ERROR';
      logger.warn('Password validation error', { error: error.message });
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorMessage = 'Invalid data format';
      errorCode = 'INVALID_FORMAT';
      logger.warn('Invalid data format', { error: error.message });
    } else if (
      error.name === 'MongoError' ||
      error.name === 'MongoServerError'
    ) {
      errorCode = 'DATABASE_ERROR';
      logger.error('MongoDB error in password update API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in password update API', {
        error: error.message,
      });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in password update API', {
        error: error.message,
      });
    } else {
      // Unidentified error
      logger.error('Unhandled error in password update API', {
        error: error.message,
        stack: error.stack,
      });

      // Send to Sentry for monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'auth/me/update_password',
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
