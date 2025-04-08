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
  pageSchema,
  priceRangeSchema,
  searchSchema,
} from '@/helpers/schemas';
import { captureException } from '@/monitoring/sentry';
import logger from '@/utils/logger';

// Cache TTL en secondes
const CACHE_TTL = {
  products: 300, // 5 minutes
  product: 600, // 10 minutes
  addresses: 900, // 15 minutes
  orders: 300, // 5 minutes
};

export const getAllProducts = async (searchParams) => {
  const requestId = Math.random().toString(36).substring(2, 10); // ID unique pour suivre une requête
  logger.info('Starting getAllProducts request', {
    requestId,
    searchParams,
    action: 'get_all_products_start',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getAllProducts', {
      requestId,
      timeoutMs: 10000,
      action: 'request_timeout',
    });
  }, 10000); // 10 secondes

  try {
    // Créer un objet pour stocker les paramètres validés
    const urlParams = {};
    const validationErrors = [];

    // Vérifier si searchParams est défini avant d'y accéder
    if (searchParams) {
      // Validation et stockage du paramètre keyword
      if (searchParams.keyword) {
        try {
          await searchSchema.validate(
            { keyword: searchParams.keyword },
            { abortEarly: false },
          );
          urlParams.keyword = searchParams.keyword;
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
          await pageSchema.validate(
            { page: searchParams.page },
            { abortEarly: false },
          );
          urlParams.page = searchParams.page;
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
          await categorySchema.validate(
            { value: searchParams.category },
            { abortEarly: false },
          );
          urlParams.category = searchParams.category;
        } catch (err) {
          validationErrors.push({
            field: 'category',
            message: err.errors[0],
          });
        }
      }

      // Validation et stockage des paramètres de prix
      if (searchParams.min || searchParams.max) {
        try {
          await priceRangeSchema.validate(
            {
              minPrice: searchParams.min,
              maxPrice: searchParams.max,
            },
            { abortEarly: false },
          );
          if (searchParams.min) urlParams['price[gte]'] = searchParams.min;
          if (searchParams.max) urlParams['price[lte]'] = searchParams.max;
        } catch (err) {
          validationErrors.push({
            field: 'price',
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
    const apiUrl = `${process.env.API_URL || ''}/api/products${searchQuery ? `?${searchQuery}` : ''}`;

    // Avant l'appel API
    logger.debug('Fetching products from API', {
      requestId,
      apiUrl,
      action: 'api_request_start',
    });

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        revalidate: CACHE_CONFIGS.products,
        tags: [
          'products',
          ...(urlParams.category ? [`category-${urlParams.category}`] : []),
        ],
      },
      headers: {
        'Cache-Control': cacheControl,
      },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      status: res.status,
      action: 'api_request_complete',
    });

    if (!res.ok) {
      const errorText = await res.text();

      logger.error('API request failed', {
        requestId,
        status: res.status,
        error: errorText,
        action: 'api_request_error',
      });

      return { products: [], totalPages: 0 };
    }

    try {
      const data = await res.json();
      return data;
    } catch (parseError) {
      console.error('JSON parsing error in getAllProducts:', parseError);
      const rawText = await res.clone().text();
      console.error('Raw response text:', rawText.substring(0, 200) + '...'); // Log des premiers 200 caractères
      return { products: [], totalPages: 0 };
    }
  } catch (error) {
    logger.error('Exception in getAllProducts', {
      requestId,
      error: error.message,
      stack: error.stack,
      action: 'get_all_products_error',
    });

    captureException(error, {
      tags: { action: 'get_all_products' },
      extra: { searchParams },
    });

    // Renvoyer un objet vide pour éviter de planter l'application
    return { products: [], totalPages: 0 };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getCategories = async () => {
  try {
    const res = await fetch(`${process.env.API_URL}/api/category`);

    const data = await res.json();

    if (data?.success === false) {
      toast.info(data?.message);
      return [];
    }

    return data?.data?.categories;
  } catch (error) {
    console.error(error);
    toast.error('Something went wrong!');
    return [];
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
