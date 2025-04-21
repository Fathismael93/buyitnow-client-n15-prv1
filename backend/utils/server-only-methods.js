import 'server-only';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import queryString from 'query-string';
import { getCookieName } from '@/helpers/helpers';
import { toast } from 'react-toastify';
import { CACHE_CONFIGS, getCacheHeaders } from '@/utils/cache';
import {
  categorySchema,
  maxPriceSchema,
  minPriceSchema,
  pageSchema,
  searchSchema,
} from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';
import logger from '@/utils/logger';

export const getAllProducts = async (
  searchParams,
  csrfToken,
  retryAttempt = 0,
  maxRetries = 3,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getAllProducts', {
      requestId,
      timeoutMs: 10000,
      action: 'request_timeout',
    });
  }, 10000); // 10 secondes

  // Générer un ID de requête unique pour suivre les retries dans les logs
  const requestId = `products-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  logger.info('Starting getAllProducts request', {
    requestId,
    searchParams,
    retryAttempt,
    action: 'get_all_products',
  });

  try {
    // Créer un objet pour stocker les paramètres validés
    const urlParams = {};
    const validationErrors = [];

    // Vérifier si searchParams est défini avant d'y accéder
    if (searchParams) {
      // Validation et stockage du paramètre keyword
      if (searchParams.keyword && searchParams.keyword.trim() !== '') {
        try {
          const result = await searchSchema.validate(
            { keyword: searchParams.keyword },
            { abortEarly: false },
          );
          if (result.keyword) urlParams.keyword = result.keyword;
        } catch (err) {
          validationErrors.push({
            field: 'keyword',
            message: err.errors[0],
          });
        }
      }

      // Validation et stockage du paramètre page
      if (searchParams.page) {
        try {
          const result = await pageSchema.validate(
            { page: searchParams.page },
            { abortEarly: false },
          );

          if (result.page) urlParams.page = result.page;
        } catch (err) {
          validationErrors.push({
            field: 'page',
            message: err.errors[0],
          });
        }
      }

      // Validation et stockage du paramètre category
      if (searchParams.category) {
        try {
          const result = await categorySchema.validate(
            { value: searchParams.category },
            { abortEarly: false },
          );

          if (result.value) urlParams.category = result.value;
        } catch (err) {
          validationErrors.push({
            field: 'category',
            message: err.errors[0],
          });
        }
      }

      if (
        searchParams.min &&
        searchParams.max &&
        parseInt(searchParams.min) > parseInt(searchParams.max)
      ) {
        validationErrors.push({
          field: 'price',
          message: 'Le prix minimum doit être inférieur au prix maximum',
        });
      }

      // Validation et stockage du prix minimum
      if (searchParams.min) {
        try {
          const minResult = await minPriceSchema.validate(
            {
              minPrice: searchParams.min,
            },
            { abortEarly: false },
          );
          if (minResult.minPrice) urlParams['price[gte]'] = minResult.minPrice;
        } catch (err) {
          validationErrors.push({
            field: 'minPrice',
            message: err.errors[0],
          });
        }
      }

      // Validation et stockage du prix maximum
      if (searchParams.max) {
        try {
          const maxResult = await maxPriceSchema.validate(
            {
              maxPrice: searchParams.max,
            },
            { abortEarly: false },
          );
          if (maxResult.maxPrice) urlParams['price[lte]'] = maxResult.maxPrice;
        } catch (err) {
          validationErrors.push({
            field: 'maxPrice',
            message: err.errors[0],
          });
        }
      }
    }

    // Si des erreurs de validation sont trouvées, retourner immédiatement
    if (validationErrors?.length > 0) {
      logger.warn('Validation errors in getAllProducts', {
        requestId,
        validationErrors,
        action: 'validation_failed',
      });

      captureException(new Error('Validation failed'), {
        tags: { action: 'validation_failed' },
        extra: { validationErrors, searchParams },
      });
      return { products: [], totalPages: 0, errors: validationErrors };
    }

    // Construire la chaîne de requête
    const searchQuery = new URLSearchParams(urlParams).toString();
    const cacheControl = getCacheHeaders('products');

    // S'assurer que l'URL est correctement formatée
    const apiUrl = `${process.env.API_URL || ''}api/products${searchQuery ? `?${searchQuery}` : ''}`;

    // Avant l'appel API
    logger.debug('Fetching products from API', {
      requestId,
      apiUrl,
      retryAttempt,
      action: 'api_request_start',
    });

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        revalidate: CACHE_CONFIGS.products.staleWhileRevalidate,
        tags: [
          'products',
          ...(urlParams.category ? [`category-${urlParams.category}`] : []),
        ],
      },
      headers: {
        'Cache-Control': cacheControl,
        'X-CSRF-Token': csrfToken,
      },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      status: res.status,
      retryAttempt,
      action: 'api_request_complete',
    });

    if (!res.ok) {
      const errorText = await res.text();

      logger.error('API request failed', {
        requestId,
        status: res.status,
        error: errorText,
        retryAttempt,
        action: 'api_request_error',
      });

      // Déterminer si l'erreur est récupérable (5xx ou certaines 4xx)
      const isRetryable = res.status >= 500 || [408, 429].includes(res.status);

      if (isRetryable && retryAttempt < maxRetries) {
        // Calculer le délai de retry avec backoff exponentiel
        const retryDelay = Math.min(
          1000 * Math.pow(2, retryAttempt), // 1s, 2s, 4s, ...
          15000, // Maximum 15 secondes
        );

        logger.warn(`Retrying request after ${retryDelay}ms`, {
          requestId,
          retryAttempt: retryAttempt + 1,
          maxRetries,
          action: 'retry_scheduled',
        });

        // Nettoyer le timeout actuel
        clearTimeout(timeoutId);

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Réessayer avec le compteur incrémenté
        return getAllProducts(searchParams, retryAttempt + 1, maxRetries);
      }

      return { products: [], totalPages: 0 };
    }

    try {
      const data = await res.json();

      logger.info('Successfully fetched products', {
        requestId,
        productCount: data.products?.length || 0,
        action: 'api_success',
      });

      return data;
    } catch (parseError) {
      logger.error('JSON parsing error in getAllProducts', {
        requestId,
        error: parseError.message,
        retryAttempt,
        action: 'parse_error',
      });

      // Si erreur de parsing et retries disponibles
      if (retryAttempt < maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 15000);
        logger.warn(`Retrying after parse error (${retryDelay}ms)`, {
          requestId,
          retryAttempt: retryAttempt + 1,
          action: 'retry_scheduled',
        });

        clearTimeout(timeoutId);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return getAllProducts(searchParams, retryAttempt + 1, maxRetries);
      }

      const rawText = await res.clone().text();

      logger.error('Raw response text', {
        requestId,
        text: rawText.substring(0, 200) + '...',
        action: 'raw_response',
      });

      return { products: [], totalPages: 0 };
    }
  } catch (error) {
    logger.error('Exception in getAllProducts', {
      requestId,
      error: error.message,
      stack: error.stack,
      retryAttempt,
      action: 'get_all_products_error',
    });

    // Déterminer si l'erreur est récupérable
    const isRetryable =
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('network') ||
      error.message.includes('connection');

    if (isRetryable && retryAttempt < maxRetries) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 15000);
      logger.warn(`Retrying after exception (${retryDelay}ms)`, {
        requestId,
        retryAttempt: retryAttempt + 1,
        maxRetries,
        action: 'retry_scheduled',
      });

      clearTimeout(timeoutId);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return getAllProducts(searchParams, retryAttempt + 1, maxRetries);
    }

    captureException(error, {
      tags: { action: 'get_all_products' },
      extra: { searchParams, requestId, retryAttempt },
    });

    // Renvoyer un objet vide pour éviter de planter l'application
    return { products: [], totalPages: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getCategories = async (
  csrfToken,
  retryAttempt = 0,
  maxRetries = 3,
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getCategories', {
      requestId,
      timeoutMs: 5000,
      action: 'request_timeout',
    });
  }, 5000); // 5 secondes pour les catégories (plus court que pour les produits)

  // Générer un ID de requête unique pour suivre les retries dans les logs
  const requestId = `categories-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  logger.info('Starting getCategories request', {
    requestId,
    retryAttempt,
    action: 'get_categories',
  });

  try {
    // Avant l'appel API
    logger.debug('Fetching categories from API', {
      requestId,
      retryAttempt,
      action: 'api_request_start',
    });

    const cacheControl = getCacheHeaders('categories');
    const apiUrl = `${process.env.API_URL || ''}/api/category`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        revalidate: CACHE_CONFIGS.categories?.staleWhileRevalidate || 3600, // 1 heure par défaut
        tags: ['categories'],
      },
      headers: {
        'Cache-Control': cacheControl,
        'X-CSRF-Token': csrfToken,
      },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      status: res.status,
      retryAttempt,
      action: 'api_request_complete',
    });

    if (!res.ok) {
      const errorText = await res.text();

      logger.error('API request failed', {
        requestId,
        status: res.status,
        error: errorText,
        retryAttempt,
        action: 'api_request_error',
      });

      // Déterminer si l'erreur est récupérable (5xx ou certaines 4xx)
      const isRetryable = res.status >= 500 || [408, 429].includes(res.status);

      if (isRetryable && retryAttempt < maxRetries) {
        // Calculer le délai de retry avec backoff exponentiel
        const retryDelay = Math.min(
          1000 * Math.pow(2, retryAttempt), // 1s, 2s, 4s, ...
          15000, // Maximum 15 secondes
        );

        logger.warn(`Retrying categories request after ${retryDelay}ms`, {
          requestId,
          retryAttempt: retryAttempt + 1,
          maxRetries,
          action: 'retry_scheduled',
        });

        // Nettoyer le timeout actuel
        clearTimeout(timeoutId);

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Réessayer avec le compteur incrémenté
        return getCategories(retryAttempt + 1, maxRetries);
      }

      return [];
    }

    try {
      const data = await res.json();

      if (data?.success === false) {
        logger.warn('API returned success: false', {
          requestId,
          message: data?.message,
          action: 'api_business_error',
        });

        toast.info(data?.message);
        return [];
      }

      logger.info('Successfully fetched categories', {
        requestId,
        categoryCount: data?.data?.categories?.length || 0,
        action: 'api_success',
      });

      return data?.data?.categories || [];
    } catch (parseError) {
      logger.error('JSON parsing error in getCategories', {
        requestId,
        error: parseError.message,
        retryAttempt,
        action: 'parse_error',
      });

      // Si erreur de parsing et retries disponibles
      if (retryAttempt < maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 15000);
        logger.warn(`Retrying after parse error (${retryDelay}ms)`, {
          requestId,
          retryAttempt: retryAttempt + 1,
          action: 'retry_scheduled',
        });

        clearTimeout(timeoutId);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return getCategories(retryAttempt + 1, maxRetries);
      }

      try {
        const rawText = await res.clone().text();

        logger.error('Raw response text', {
          requestId,
          text: rawText.substring(0, 200) + '...',
          action: 'raw_response',
        });
      } catch (textError) {
        logger.error('Failed to get raw response text', {
          requestId,
          error: textError.message,
          action: 'raw_response_failed',
        });
      }

      toast.error('Something went wrong loading categories');
      return [];
    }
  } catch (error) {
    logger.error('Exception in getCategories', {
      requestId,
      error: error.message,
      stack: error.stack,
      retryAttempt,
      action: 'get_categories_error',
    });

    // Déterminer si l'erreur est récupérable
    const isRetryable =
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('network') ||
      error.message.includes('connection');

    if (isRetryable && retryAttempt < maxRetries) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 15000);
      logger.warn(`Retrying after exception (${retryDelay}ms)`, {
        requestId,
        retryAttempt: retryAttempt + 1,
        maxRetries,
        action: 'retry_scheduled',
      });

      clearTimeout(timeoutId);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return getCategories(retryAttempt + 1, maxRetries);
    }

    captureException(error, {
      tags: { action: 'get_categories' },
      extra: { requestId, retryAttempt },
    });

    toast.error('Something went wrong loading categories');
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getProductDetails = async (id) => {
  const isValidId = mongoose.isValidObjectId(id);

  if (id === undefined || id === null || !isValidId) {
    return notFound();
  }

  const res = await fetch(`${process.env.API_URL}/api/products/${id}`);

  const data = await res.json();

  if (data?.success === false) {
    toast.info(data?.message);
    return [];
  }

  if (data?.data?.product === undefined) {
    console.error('Product not found');
    return notFound();
  }

  if (data?.error !== undefined) {
    console.error('Error fetching product details');
    ///////
    return [];
  }

  return data?.data;
};

export const getAllAddresses = async (page) => {
  try {
    const nextCookies = await cookies();
    const nextAuthSessionToken = nextCookies.get(
      '__Secure-next-auth.session-token',
    );

    const res = await fetch(`${process.env.API_URL}/api/address`, {
      headers: {
        Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
      },
    });

    const data = await res.json();

    if (data?.success === false) {
      toast.info(data?.message);
      return [];
    }

    if (data?.error !== undefined) {
      ///////
      return [];
    }

    if (page === 'profile') {
      delete data?.data?.paymentTypes;
    }

    return data?.data;
    // eslint-disable-next-line no-unused-vars, no-empty
  } catch (error) {}
};

export const getSingleAddress = async (id) => {
  if (id === undefined || id === null) {
    return notFound();
  }

  const nextCookies = await cookies();

  const cookieName = getCookieName();
  const nextAuthSessionToken = nextCookies.get(cookieName);

  const res = await fetch(`${process.env.API_URL}/api/address/${id}`, {
    headers: {
      Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
    },
  });

  const data = await res.json();

  if (data?.success === false) {
    toast.info(data?.message);
    return [];
  }

  if (data?.error !== undefined) {
    ///////
    return [];
  }

  if (data?.data === undefined) {
    return notFound();
  }

  return data?.data?.address;
};

export const getAllOrders = async (searchParams) => {
  const nextCookies = await cookies();

  const nextAuthSessionToken = nextCookies.get(
    '__Secure-next-auth.session-token',
  );

  const urlParams = {
    page: (await searchParams)?.page || 1,
  };

  const searchQuery = queryString.stringify(urlParams);

  const res = await fetch(
    `${process.env.API_URL}/api/orders/me?${searchQuery}`,
    {
      headers: {
        Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
      },
    },
  );

  const data = await res.json();

  if (data?.success === false) {
    toast.info(data?.message);
    return [];
  }

  if (data?.error !== undefined) {
    ///////
    return [];
  }

  if (data?.data === undefined) {
    return notFound();
  }

  return data?.data;
};
