import { NextResponse } from 'next/server';

import Address from '@/backend/models/address';
import User from '@/backend/models/user';
import isAuthenticatedUser from '@/backend/middlewares/auth';
import dbConnect from '@/backend/config/dbConnect';
import logger from '@/utils/logger';
import { appCache, getCacheKey } from '@/utils/cache';
import { captureException } from '@/monitoring/sentry';
import { sanitizeAddress } from '@/utils/addressSanitizer';
import { addressSchema, validateWithLogging } from '@/helpers/schemas';
import { applyRateLimit } from '@/utils/integratedRateLimit';

export async function GET(req, { params }) {
  // Structured logging of request
  logger.info('Single address API GET request received', {
    route: 'api/address/[id]/GET',
    user: req.user?.email || 'unauthenticated',
    addressId: params.id,
  });

  try {
    // Verify authentication
    await isAuthenticatedUser(req, NextResponse);

    // Appliquer le rate limiting pour les requêtes authentifiées avec la nouvelle implémentation
    const addressRateLimiter = applyRateLimit('AUTHENTICATED_API', {
      prefix: 'address_detail_api',
    });

    // Vérifier le rate limiting et obtenir une réponse si la limite est dépassée
    const rateLimitResponse = await addressRateLimiter(req);

    // Si une réponse de rate limit est retournée, la renvoyer immédiatement
    if (rateLimitResponse) {
      logger.warn('Rate limit exceeded for single address API', {
        user: req.user?.email,
      });

      return rateLimitResponse;
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
      logger.error('Database connection failed for single address request', {
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

    // Validate the address ID from params
    const { id } = params;

    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      logger.warn('Invalid address ID format', {
        userId: req.user?.id,
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid address ID format',
        },
        { status: 400 },
      );
    }

    // Find the user to verify ownership
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

    // Check cache first
    const cacheKey = getCacheKey('address_detail', {
      userId: user._id.toString(),
      addressId: id,
    });

    let address = appCache.addresses.get(cacheKey);

    if (!address) {
      logger.debug('Address cache miss, fetching from database', {
        userId: user._id,
        addressId: id,
        cacheKey,
      });

      // Fetch address with timeout
      const addressPromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Address query timeout'));
        }, 3000);

        try {
          const result = Address.findById(id);
          clearTimeout(timeoutId);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      address = await addressPromise;

      // Cache the result for 5 minutes if found
      if (address) {
        appCache.addresses.set(cacheKey, address); // Le TTL est déjà configuré
        logger.debug('Address cached', {
          userId: user._id,
          addressId: id,
          cacheKey,
        });
      }
    } else {
      logger.debug('Address cache hit', {
        userId: user._id,
        addressId: id,
        cacheKey,
      });
    }

    if (!address) {
      logger.warn('Address not found', {
        userId: user._id,
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Address not found',
        },
        { status: 404 },
      );
    }

    // Verify address ownership
    if (address.user && address.user.toString() !== user._id.toString()) {
      logger.warn('Unauthorized access attempt to address', {
        requestUser: user._id.toString(),
        addressUser: address.user.toString(),
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized access to this address',
        },
        { status: 403 },
      );
    }

    // Add security headers
    const securityHeaders = {
      'Cache-Control': 'private, max-age=300', // 5 minutes of private cache
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'same-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    };

    logger.info('Address retrieved successfully', {
      userId: user._id,
      addressId: id,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          address,
        },
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
      errorMessage = 'Invalid data provided';
      errorCode = 'VALIDATION_ERROR';
      logger.warn('Address validation error', { error: error.message });
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorMessage = 'Invalid address ID format';
      errorCode = 'INVALID_ID';
      logger.warn('Invalid address ID format', { error: error.message });
    } else if (
      error.name === 'MongoError' ||
      error.name === 'MongoServerError'
    ) {
      errorCode = 'DATABASE_ERROR';
      logger.error('MongoDB error in address GET API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in address GET API', {
        error: error.message,
      });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in address GET API', {
        error: error.message,
      });
    } else {
      // Unidentified error
      logger.error('Unhandled error in address GET API', {
        error: error.message,
        stack: error.stack,
      });

      // Send to Sentry for monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'address/[id]/GET',
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

export async function PUT(req, { params }) {
  // Structured logging of request
  logger.info('Address API PUT request received', {
    route: 'api/address/[id]/PUT',
    user: req.user?.email || 'unauthenticated',
    addressId: params.id,
  });

  try {
    // Verify authentication
    await isAuthenticatedUser(req, NextResponse);

    // Appliquer le rate limiting pour les requêtes authentifiées avec la nouvelle implémentation
    const addressRateLimiter = applyRateLimit('AUTHENTICATED_API', {
      prefix: 'address_api',
    });

    // Vérifier le rate limiting et obtenir une réponse si la limite est dépassée
    const rateLimitResponse = await addressRateLimiter(req);

    // Si une réponse de rate limit est retournée, la renvoyer immédiatement
    if (rateLimitResponse) {
      logger.warn('Rate limit exceeded for address PUT API', {
        user: req.user?.email,
      });

      return rateLimitResponse;
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
      logger.error('Database connection failed for address PUT request', {
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

    // Validate the address ID from params
    const { id } = params;

    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      logger.warn('Invalid address ID format in PUT request', {
        userId: req.user?.id,
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid address ID format',
        },
        { status: 400 },
      );
    }

    // Find the user to verify ownership
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
      logger.warn('User not found for address PUT request', {
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

    // Parse the request body with error handling
    let newAddressData;
    try {
      newAddressData = await req.json();
    } catch (parseError) {
      logger.warn('Invalid JSON in address PUT request', {
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

    // Limit the size of incoming data
    if (JSON.stringify(newAddressData).length > 10000) {
      logger.warn('Address data too large in PUT request', {
        user: user._id,
        dataSize: JSON.stringify(newAddressData).length,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Request body too large',
        },
        { status: 413 },
      );
    }

    // Sanitize address data if needed
    if (typeof sanitizeAddress === 'function') {
      newAddressData = sanitizeAddress(newAddressData);
    }

    // *** VALIDATE AGAINST THE YUP SCHEMA ***
    try {
      // Import the validateWithLogging function and addressSchema from schemas.js
      // This function will log validation errors and provide detailed feedback
      await validateWithLogging(addressSchema, newAddressData);
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

    // Find the existing address to verify ownership
    const addressCheckPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Address check query timeout'));
      }, 3000);

      try {
        const result = Address.findById(id);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const oldAddress = await addressCheckPromise;

    if (!oldAddress) {
      logger.warn('Address not found for update', {
        userId: user._id,
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Address not found',
        },
        { status: 404 },
      );
    }

    // Verify address ownership
    if (oldAddress.user.toString() !== user._id.toString()) {
      logger.warn('Unauthorized access attempt to update address', {
        requestUser: user._id.toString(),
        addressUser: oldAddress.user.toString(),
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized access to this address',
        },
        { status: 403 },
      );
    }

    // Ensure user ID is preserved and not overwritten
    newAddressData.user = user._id;

    // Check if this is to be set as default address
    if (newAddressData.isDefault === true) {
      // Update all other addresses to not be default
      try {
        const updateDefaultPromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Update default addresses timeout'));
          }, 5000);

          try {
            const result = Address.updateMany(
              { user: user._id, isDefault: true, _id: { $ne: id } },
              { isDefault: false },
            );
            clearTimeout(timeoutId);
            resolve(result);
          } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
          }
        });

        await updateDefaultPromise;
        logger.info('Updated other addresses as non-default', {
          userId: user._id,
          addressId: id,
        });
      } catch (updateDefaultError) {
        logger.error('Failed to update default status of other addresses', {
          userId: user._id,
          addressId: id,
          error: updateDefaultError.message,
        });
        // Continue execution even if this step fails
      }
    }

    // Update the address with timeout
    const updatePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Address update timeout'));
      }, 3000);

      try {
        const result = Address.findByIdAndUpdate(id, newAddressData, {
          new: true, // Return the updated document
          runValidators: true, // Run validators for this update
        });
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const updatedAddress = await updatePromise;

    if (!updatedAddress) {
      logger.warn('Failed to update address', {
        userId: user._id,
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Failed to update address',
        },
        { status: 500 },
      );
    }

    // Invalidate cache for this address
    const cacheKey = getCacheKey('address_detail', {
      userId: user._id.toString(),
      addressId: id,
    });
    appCache.addresses.delete(cacheKey);

    // Also invalidate the addresses list cache
    const listCacheKey = getCacheKey('addresses', {
      userId: user._id.toString(),
    });
    appCache.addresses.delete(listCacheKey);

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

    logger.info('Address updated successfully', {
      userId: user._id,
      addressId: id,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          address: updatedAddress,
        },
        message: 'Address updated successfully',
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
      errorMessage = 'Invalid address data provided';
      errorCode = 'VALIDATION_ERROR';
      logger.warn('Address validation error', { error: error.message });
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorMessage = 'Invalid address ID format';
      errorCode = 'INVALID_ID';
      logger.warn('Invalid address ID format', { error: error.message });
    } else if (error.code === 11000) {
      // Handle duplicate key errors (unique index)
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
      logger.error('MongoDB error in address PUT API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in address PUT API', {
        error: error.message,
      });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in address PUT API', {
        error: error.message,
      });
    } else {
      // Unidentified error
      logger.error('Unhandled error in address PUT API', {
        error: error.message,
        stack: error.stack,
      });

      // Send to Sentry for monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'address/[id]/PUT',
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

export async function DELETE(req, { params }) {
  // Structured logging of request
  logger.info('Address API DELETE request received', {
    route: 'api/address/[id]/DELETE',
    user: req.user?.email || 'unauthenticated',
    addressId: params.id,
  });

  try {
    // Verify authentication
    await isAuthenticatedUser(req, NextResponse);

    // Appliquer le rate limiting pour les requêtes authentifiées avec la nouvelle implémentation
    const addressRateLimiter = applyRateLimit('AUTHENTICATED_API', {
      prefix: 'address_api',
    });

    // Vérifier le rate limiting et obtenir une réponse si la limite est dépassée
    const rateLimitResponse = await addressRateLimiter(req);

    // Si une réponse de rate limit est retournée, la renvoyer immédiatement
    if (rateLimitResponse) {
      logger.warn('Rate limit exceeded for address DELETE API', {
        user: req.user?.email,
      });

      return rateLimitResponse;
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
      logger.error('Database connection failed for address DELETE request', {
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

    // Validate the address ID from params
    const { id } = params;

    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      logger.warn('Invalid address ID format in DELETE request', {
        userId: req.user?.id,
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Invalid address ID format',
        },
        { status: 400 },
      );
    }

    // Find the user to verify ownership
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
      logger.warn('User not found for address DELETE request', {
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

    // First check if address exists and belongs to user
    const addressCheckPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Address check query timeout'));
      }, 3000);

      try {
        const result = Address.findById(id);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const addressToDelete = await addressCheckPromise;

    if (!addressToDelete) {
      logger.warn('Address not found for deletion', {
        userId: user._id,
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Address not found',
        },
        { status: 404 },
      );
    }

    // Verify address ownership
    if (addressToDelete.user.toString() !== user._id.toString()) {
      logger.warn('Unauthorized access attempt to delete address', {
        requestUser: user._id.toString(),
        addressUser: addressToDelete.user.toString(),
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized access to this address',
        },
        { status: 403 },
      );
    }

    // Delete the address with timeout
    const deletePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Address deletion timeout'));
      }, 3000);

      try {
        const result = Address.findByIdAndDelete(id);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    const addressDeleted = await deletePromise;

    if (!addressDeleted) {
      logger.warn('Failed to delete address', {
        userId: user._id,
        addressId: id,
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Failed to delete address',
        },
        { status: 500 },
      );
    }

    // Invalidate cache for this address
    const cacheKey = getCacheKey('address_detail', {
      userId: user._id.toString(),
      addressId: id,
    });
    appCache.addresses.delete(cacheKey);

    // Also invalidate the addresses list cache
    const listCacheKey = getCacheKey('addresses', {
      userId: user._id.toString(),
    });
    appCache.addresses.delete(listCacheKey);

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

    logger.info('Address deleted successfully', {
      userId: user._id,
      addressId: id,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Address deleted successfully',
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
      errorMessage = 'Invalid data provided';
      errorCode = 'VALIDATION_ERROR';
      logger.warn('Address validation error', { error: error.message });
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorMessage = 'Invalid address ID format';
      errorCode = 'INVALID_ID';
      logger.warn('Invalid address ID format', { error: error.message });
    } else if (
      error.name === 'MongoError' ||
      error.name === 'MongoServerError'
    ) {
      errorCode = 'DATABASE_ERROR';
      logger.error('MongoDB error in address DELETE API', {
        error: error.message,
        code: error.code,
      });
    } else if (error.message && error.message.includes('timeout')) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable';
      errorCode = 'TIMEOUT_ERROR';
      logger.error('Database timeout in address DELETE API', {
        error: error.message,
      });
    } else if (error.message && error.message.includes('authentication')) {
      statusCode = 401;
      errorMessage = 'Authentication failed';
      errorCode = 'AUTH_ERROR';
      logger.warn('Authentication error in address DELETE API', {
        error: error.message,
      });
    } else {
      // Unidentified error
      logger.error('Unhandled error in address DELETE API', {
        error: error.message,
        stack: error.stack,
      });

      // Send to Sentry for monitoring
      captureException(error, {
        tags: {
          component: 'api',
          route: 'address/[id]/DELETE',
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
