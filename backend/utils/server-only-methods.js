import 'server-only';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import mongoose from 'mongoose';
import queryString from 'query-string';
import { getCookieName } from '@/helpers/helpers';
import { toast } from 'react-toastify';
import { appCache, CACHE_CONFIGS, getCacheHeaders } from '@/utils/cache';
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
  retryAttempt = 0,
  maxRetries = 3,
) => {
  const controller = new AbortController();
  const requestId = `products-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Timeout de 10 secondes
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getAllProducts', {
      requestId,
      timeoutMs: 10000,
      action: 'request_timeout',
    });
  }, 10000);

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

    // Si des erreurs de validation sont trouvées, retourner immédiatement avec un format cohérent
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

      // Format de réponse standardisé avec statut d'erreur
      return {
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Paramètres de requête invalides',
        errors: validationErrors,
        data: { products: [], totalPages: 0 },
      };
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
      },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      status: res.status,
      retryAttempt,
      action: 'api_request_complete',
    });

    // Tenter de récupérer le corps de la réponse, que ce soit JSON ou texte
    let responseBody;
    let isJsonResponse = true;
    let parseErrorMessage = null;

    try {
      responseBody = await res.json();
    } catch (parseError) {
      isJsonResponse = false;
      isJsonResponse = false;
      parseErrorMessage = parseError.message;
      logger.error('JSON parsing error in getAllProducts', {
        requestId,
        error: parseErrorMessage,
        retryAttempt,
        action: 'parse_error',
      });

      try {
        // Si ce n'est pas du JSON, essayer de récupérer comme texte
        responseBody = await res.clone().text();
      } catch (textError) {
        logger.error('Failed to get response text after JSON parse failure', {
          requestId,
          error: textError.message,
          action: 'text_extraction_failed',
        });
        responseBody = 'Impossible de lire la réponse';
      }
    }

    // Gestion différenciée des cas de réponse
    if (!res.ok) {
      // Gestion des cas d'erreur HTTP
      const statusCode = res.status;

      // Déterminer si l'erreur est récupérable pour les retries
      const isRetryable = statusCode >= 500 || [408, 429].includes(statusCode);

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

      // Erreurs spécifiques après épuisement des retries ou erreurs non-récupérables
      switch (statusCode) {
        case 400: // Bad Request
          return {
            success: false,
            code:
              isJsonResponse && responseBody.code
                ? responseBody.code
                : 'BAD_REQUEST',
            message:
              isJsonResponse && responseBody.message
                ? responseBody.message
                : 'Requête invalide',
            errors:
              isJsonResponse && responseBody.errors ? responseBody.errors : [],
            data: { products: [], totalPages: 0 },
          };

        case 401: // Unauthorized
          return {
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentification requise',
            data: { products: [], totalPages: 0 },
          };

        case 403: // Forbidden
          return {
            success: false,
            code: 'FORBIDDEN',
            message: 'Accès interdit',
            data: { products: [], totalPages: 0 },
          };

        case 404: // Not Found
          return {
            success: false,
            code: 'NOT_FOUND',
            message: 'Ressource non trouvée',
            data: { products: [], totalPages: 0 },
          };

        case 429: // Too Many Requests
          return {
            success: false,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Trop de requêtes, veuillez réessayer plus tard',
            retryAfter: res.headers.get('Retry-After')
              ? parseInt(res.headers.get('Retry-After'))
              : 60,
            data: { products: [], totalPages: 0 },
          };

        case 500: // Internal Server Error
          return {
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Une erreur interne est survenue, veuillez réessayer ultérieurement',
            data: { products: [], totalPages: 0 },
          };

        case 503: // Service Unavailable
          return {
            success: false,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporairement indisponible',
            data: { products: [], totalPages: 0 },
          };

        case 504: // Gateway Timeout
          return {
            success: false,
            code: 'TIMEOUT',
            message: 'La requête a pris trop de temps',
            data: { products: [], totalPages: 0 },
          };

        default: // Autres erreurs
          return {
            success: false,
            code: 'API_ERROR',
            message:
              isJsonResponse && responseBody.message
                ? responseBody.message
                : `Erreur ${statusCode}`,
            status: statusCode,
            data: { products: [], totalPages: 0 },
          };
      }
    }

    // Traitement de la réponse en cas de succès HTTP (200)
    if (isJsonResponse) {
      // Si JSON valide
      if (responseBody.success === true) {
        // Cas de succès API explicite
        logger.info('Successfully fetched products', {
          requestId,
          productCount: responseBody.data?.products?.length || 0,
          action: 'api_success',
        });

        // Vérifier si des produits sont présents dans la réponse
        if (responseBody.data?.products?.length > 0) {
          // Cas standard avec des produits trouvés
          return {
            success: true,
            message: responseBody.message || 'Produits récupérés avec succès',
            data: responseBody.data,
          };
        } else {
          // Cas spécifique où aucun produit n'est trouvé mais la requête est réussie
          return {
            success: true,
            message:
              responseBody.message ||
              'Aucun produit ne correspond aux critères',
            data: {
              products: [],
              totalPages: 0,
            },
          };
        }
      } else if (responseBody.success === false) {
        // Cas d'erreur API explicite mais avec statut HTTP 200
        logger.warn('API returned success: false', {
          requestId,
          message: responseBody.message,
          code: responseBody.code,
          action: 'api_business_error',
        });

        return {
          success: false,
          code: responseBody.code || 'API_BUSINESS_ERROR',
          message: responseBody.message || 'Erreur côté serveur',
          errors: responseBody.errors || [],
          data: { products: [], totalPages: 0 },
        };
      } else {
        // Structure de réponse inattendue
        logger.error('Unexpected API response structure', {
          requestId,
          responseBody: JSON.stringify(responseBody).substring(0, 200),
          action: 'unexpected_response_structure',
        });

        return {
          success: false,
          code: 'UNEXPECTED_RESPONSE',
          message: 'Format de réponse inattendu',
          data: {
            products: Array.isArray(responseBody.data?.products)
              ? responseBody.data.products
              : [],
            totalPages: responseBody.data?.totalPages || 0,
          },
        };
      }
    } else {
      // Réponse non-JSON mais statut HTTP 200
      logger.error('Non-JSON response with HTTP 200', {
        requestId,
        parseError: parseErrorMessage,
        responseBodyPreview:
          typeof responseBody === 'string'
            ? responseBody.substring(0, 200)
            : 'Unknown response type',
        action: 'non_json_response',
      });

      return {
        success: false,
        code: 'INVALID_RESPONSE_FORMAT',
        message: 'Le serveur a répondu avec un format invalide',
        errorDetails: parseErrorMessage,
        data: { products: [], totalPages: 0 },
      };
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

    // Retourner une erreur typée en fonction de la nature de l'exception
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return {
        success: false,
        code: 'CLIENT_TIMEOUT',
        message:
          "La requête a été interrompue en raison d'un délai d'attente excessif",
        data: { products: [], totalPages: 0 },
      };
    } else if (
      error.message.includes('network') ||
      error.message.includes('connection')
    ) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'Problème de connexion réseau',
        data: { products: [], totalPages: 0 },
      };
    } else {
      return {
        success: false,
        code: 'CLIENT_ERROR',
        message:
          "Une erreur s'est produite lors de la récupération des produits",
        errorDetails: error.message,
        data: { products: [], totalPages: 0 },
      };
    }
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getCategories = async (retryAttempt = 0, maxRetries = 3) => {
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

export const getProductDetails = async (
  id,
  retryAttempt = 0,
  maxRetries = 3,
) => {
  const controller = new AbortController();
  const requestId = `product-${id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Timeout de 5 secondes pour éviter les requêtes bloquées
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getProductDetails', {
      requestId,
      productId: id,
      timeoutMs: 5000,
      action: 'request_timeout',
    });
  }, 5000);

  logger.info('Starting getProductDetails request', {
    requestId,
    productId: id,
    retryAttempt,
    action: 'get_product_details',
  });

  try {
    // Validation améliorée de l'ID
    if (!id || typeof id !== 'string') {
      logger.warn('Invalid product ID format (undefined or not string)', {
        requestId,
        productId: id,
        action: 'invalid_id_format',
      });
      return notFound();
    }

    const isValidId = mongoose.isValidObjectId(id);
    if (!isValidId) {
      console.log('ID not valid');
      logger.warn('Invalid MongoDB ObjectId format', {
        requestId,
        productId: id,
        action: 'invalid_mongodb_id',
      });
      return notFound();
    }

    // Avant l'appel API
    logger.debug('Fetching product details from API', {
      requestId,
      productId: id,
      retryAttempt,
      action: 'api_request_start',
    });

    // Utiliser les headers de cache optimisés pour un seul produit
    const cacheControl = getCacheHeaders('singleProduct');
    const apiUrl = `${process.env.API_URL || ''}/api/products/${id}`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        // Utiliser la configuration de cache spécifique aux produits individuels
        revalidate: CACHE_CONFIGS.singleProduct?.staleWhileRevalidate || 7200,
        tags: ['product', `product-${id}`],
      },
      headers: {
        'Cache-Control': cacheControl['Cache-Control'],
      },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      productId: id,
      status: res.status,
      retryAttempt,
      action: 'api_request_complete',
    });

    // Gestion des erreurs HTTP
    if (!res.ok) {
      const errorText = await res.text();

      logger.error('API request failed', {
        requestId,
        productId: id,
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

        logger.warn(`Retrying product details request after ${retryDelay}ms`, {
          requestId,
          productId: id,
          retryAttempt: retryAttempt + 1,
          maxRetries,
          action: 'retry_scheduled',
        });

        // Nettoyer le timeout actuel
        clearTimeout(timeoutId);

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Réessayer avec le compteur incrémenté
        return getProductDetails(id, retryAttempt + 1, maxRetries);
      }

      // Gérer les cas d'erreur spécifiques
      if (res.status === 404) {
        logger.info('Product not found', {
          requestId,
          productId: id,
          action: 'product_not_found',
        });
        return notFound();
      }

      // Erreur générique pour les autres cas
      logger.error('Failed to load product details', {
        requestId,
        productId: id,
        status: res.status,
        action: 'product_load_failed',
      });
      return null;
    }

    // Traitement de la réponse avec gestion des erreurs de parsing
    try {
      const data = await res.json();

      // Vérifier les erreurs business
      if (data?.success === false) {
        logger.warn('API returned success: false', {
          requestId,
          productId: id,
          message: data?.message,
          action: 'api_business_error',
        });

        // Déterminer si l'erreur business nécessite un notFound() ou non
        if (
          data?.code === 'PRODUCT_NOT_FOUND' ||
          data?.message?.toLowerCase().includes('not found')
        ) {
          return notFound();
        }

        return null;
      }

      // Vérifier que le produit existe dans la réponse
      if (!data?.data?.product) {
        logger.error('Product data missing in response', {
          requestId,
          productId: id,
          action: 'product_data_missing',
        });
        return notFound();
      }

      logger.info('Successfully fetched product details', {
        requestId,
        productId: id,
        productName: data?.data?.product?.name || 'Unknown',
        similarProductsCount: data?.data?.sameCategoryProducts?.length || 0,
        action: 'api_success',
        duration: Date.now() - parseInt(requestId.split('-')[2]), // Calcul approximatif de la durée
      });

      return data?.data;
    } catch (parseError) {
      logger.error('JSON parsing error in getProductDetails', {
        requestId,
        productId: id,
        error: parseError.message,
        retryAttempt,
        action: 'parse_error',
      });

      // Si erreur de parsing et retries disponibles
      if (retryAttempt < maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 15000);
        logger.warn(`Retrying after parse error (${retryDelay}ms)`, {
          requestId,
          productId: id,
          retryAttempt: retryAttempt + 1,
          action: 'retry_scheduled',
        });

        clearTimeout(timeoutId);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return getProductDetails(id, retryAttempt + 1, maxRetries);
      }

      try {
        const rawText = await res.clone().text();

        logger.error('Raw response text', {
          requestId,
          productId: id,
          text: rawText.substring(0, 200) + '...',
          action: 'raw_response',
        });
      } catch (textError) {
        logger.error('Failed to get raw response text', {
          requestId,
          productId: id,
          error: textError.message,
          action: 'raw_response_failed',
        });
      }

      return null;
    }
  } catch (error) {
    logger.error('Exception in getProductDetails', {
      requestId,
      productId: id,
      error: error.message,
      stack: error.stack,
      retryAttempt,
      action: 'get_product_details_error',
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
        productId: id,
        retryAttempt: retryAttempt + 1,
        maxRetries,
        action: 'retry_scheduled',
      });

      clearTimeout(timeoutId);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return getProductDetails(id, retryAttempt + 1, maxRetries);
    }

    captureException(error, {
      tags: { action: 'get_product_details' },
      extra: { productId: id, requestId, retryAttempt },
    });

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getAllAddresses = async (
  page,
  retryAttempt = 0,
  maxRetries = 3,
) => {
  if (page && !['profile', 'shipping'].includes(page)) {
    logger.warn('Invalid page parameter', { page });
    page = 'shipping'; // Valeur par défaut
  }

  const controller = new AbortController();
  const requestId = `addresses-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Timeout de 5 secondes pour éviter les requêtes bloquées
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getAllAddresses', {
      requestId,
      page,
      timeoutMs: 5000,
      action: 'request_timeout',
    });
  }, 5000);

  logger.info('Starting getAllAddresses request', {
    requestId,
    page,
    retryAttempt,
    action: 'get_all_addresses',
  });

  try {
    // Obtenir les cookies pour l'authentification
    const nextCookies = await cookies();

    // Obtenir le nom de cookie dynamiquement selon l'environnement
    const cookieName = getCookieName();
    const nextAuthSessionToken = nextCookies.get(cookieName);

    if (!nextAuthSessionToken) {
      logger.warn('No authentication token found', {
        requestId,
        page,
        action: 'missing_auth_token',
      });

      if (page === 'profile') return { addresses: [] };
      else return { addresses: [], paymentTypes: [], deliveryPrice: [] };
    }

    // Avant l'appel API
    logger.debug('Fetching addresses from API', {
      requestId,
      page,
      retryAttempt,
      action: 'api_request_start',
    });

    // Utiliser les headers de cache optimisés pour les données utilisateur
    const cacheControl = getCacheHeaders('userData');
    const apiUrl = `${process.env.API_URL}/api/address?context=${page}`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
        'Cache-Control': cacheControl['Cache-Control'],
        'X-Request-ID': requestId,
      },
      next: {
        // Les données d'adresse sont des données utilisateur, donc pas de mise en cache côté serveur
        revalidate: 0,
        tags: ['user-addresses'],
      },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      page,
      status: res.status,
      retryAttempt,
      action: 'api_request_complete',
    });

    // Gestion des erreurs HTTP
    if (!res.ok) {
      const errorStatus = res.status;
      let errorText;

      try {
        errorText = await res.text();
        // eslint-disable-next-line no-unused-vars
      } catch (textError) {
        errorText = 'Failed to read error response';
      }

      logger.error('API request failed', {
        requestId,
        page,
        status: errorStatus,
        error: errorText,
        retryAttempt,
        action: 'api_request_error',
      });

      // Déterminer si l'erreur est récupérable (5xx ou certaines 4xx)
      const isRetryable =
        errorStatus >= 500 || [408, 429].includes(errorStatus);

      if (isRetryable && retryAttempt < maxRetries) {
        // Calculer le délai de retry avec backoff exponentiel
        const retryDelay = Math.min(
          1000 * Math.pow(2, retryAttempt), // 1s, 2s, 4s, ...
          15000, // Maximum 15 secondes
        );

        logger.warn(`Retrying addresses request after ${retryDelay}ms`, {
          requestId,
          page,
          retryAttempt: retryAttempt + 1,
          maxRetries,
          action: 'retry_scheduled',
        });

        // Nettoyer le timeout actuel
        clearTimeout(timeoutId);

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Réessayer avec le compteur incrémenté
        return getAllAddresses(page, retryAttempt + 1, maxRetries);
      }

      // Gérer les cas d'erreur spécifiques
      if (errorStatus === 401 || errorStatus === 403) {
        logger.warn('Authentication error in getAllAddresses', {
          requestId,
          page,
          status: errorStatus,
          action: 'auth_error',
        });

        if (page === 'profile') return { addresses: [] };
        else return { addresses: [], paymentTypes: [], deliveryPrice: [] };
      }

      if (errorStatus === 404) {
        logger.info('No addresses found', {
          requestId,
          page,
          action: 'addresses_not_found',
        });

        if (page === 'profile') return { addresses: [] };
        else return { addresses: [], paymentTypes: [], deliveryPrice: [] };
      }

      if (page === 'profile') return { addresses: [] };
      else return { addresses: [], paymentTypes: [], deliveryPrice: [] };
    }

    // Traitement de la réponse avec gestion des erreurs de parsing
    try {
      const data = await res.json();

      // Vérifier les erreurs business
      if (data?.success === false) {
        logger.warn('API returned success: false', {
          requestId,
          page,
          message: data?.message,
          action: 'api_business_error',
        });

        if (page === 'profile') return { addresses: [] };
        else return { addresses: [], paymentTypes: [], deliveryPrice: [] };
      }

      // Vérifier que les données existent dans la réponse
      if (!data?.data) {
        logger.error('Address data missing in response', {
          requestId,
          page,
          action: 'address_data_missing',
        });

        if (page === 'profile') return { addresses: [] };
        else return { addresses: [], paymentTypes: [], deliveryPrice: [] };
      }

      // Si on est sur la page de profil, supprimer les types de paiement
      let responseData = data.data;

      if (page === 'profile') {
        delete responseData.paymentTypes;
        delete responseData.deliveryPrice;
      }

      logger.info('Successfully fetched addresses', {
        requestId,
        page,
        addressCount: responseData?.addresses?.length || 0,
        hasPaymentTypes: !!responseData?.paymentTypes,
        hasDeliveryPrice: !!responseData?.deliveryPrice,
        action: 'api_success',
        duration: Date.now() - parseInt(requestId.split('-')[1]), // Calcul approximatif de la durée
      });

      return responseData;
    } catch (parseError) {
      logger.error('JSON parsing error in getAllAddresses', {
        requestId,
        page,
        error: parseError.message,
        retryAttempt,
        action: 'parse_error',
      });

      // Si erreur de parsing et retries disponibles
      if (retryAttempt < maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 15000);
        logger.warn(`Retrying after parse error (${retryDelay}ms)`, {
          requestId,
          page,
          retryAttempt: retryAttempt + 1,
          action: 'retry_scheduled',
        });

        clearTimeout(timeoutId);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return getAllAddresses(page, retryAttempt + 1, maxRetries);
      }

      try {
        const rawText = await res.clone().text();

        logger.error('Raw response text', {
          requestId,
          page,
          text: rawText.substring(0, 200) + '...',
          action: 'raw_response',
        });
      } catch (textError) {
        logger.error('Failed to get raw response text', {
          requestId,
          page,
          error: textError.message,
          action: 'raw_response_failed',
        });
      }

      if (page === 'profile') return { addresses: [] };
      else return { addresses: [], paymentTypes: [], deliveryPrice: [] };
    }
  } catch (error) {
    logger.error('Exception in getAllAddresses', {
      requestId,
      page,
      error: error.message,
      stack: error.stack,
      retryAttempt,
      action: 'get_all_addresses_error',
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
        page,
        retryAttempt: retryAttempt + 1,
        maxRetries,
        action: 'retry_scheduled',
      });

      clearTimeout(timeoutId);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return getAllAddresses(page, retryAttempt + 1, maxRetries);
    }

    captureException(error, {
      tags: { action: 'get_all_addresses' },
      extra: { page, requestId, retryAttempt },
    });

    if (page === 'profile') return { addresses: [] };
    else return { addresses: [], paymentTypes: [], deliveryPrice: [] };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getSingleAddress = async (
  id,
  retryAttempt = 0,
  maxRetries = 3,
) => {
  const controller = new AbortController();
  const requestId = `address-${id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Timeout of 5 seconds to avoid blocked requests
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getSingleAddress', {
      requestId,
      addressId: id,
      timeoutMs: 5000,
      action: 'request_timeout',
    });
  }, 5000);

  logger.info('Starting getSingleAddress request', {
    requestId,
    addressId: id,
    retryAttempt,
    action: 'get_single_address',
  });

  try {
    // Enhanced ID validation
    if (!id || typeof id !== 'string') {
      logger.warn('Invalid address ID format (undefined or not string)', {
        requestId,
        addressId: id,
        action: 'invalid_id_format',
      });
      return notFound();
    }

    const isValidId = mongoose.isValidObjectId(id);
    if (!isValidId) {
      logger.warn('Invalid MongoDB ObjectId format', {
        requestId,
        addressId: id,
        action: 'invalid_mongodb_id',
      });
      return notFound();
    }

    // Get cookies for authentication
    const nextCookies = await cookies();
    const cookieName = getCookieName();
    const nextAuthSessionToken = nextCookies.get(cookieName);

    if (!nextAuthSessionToken) {
      logger.warn('No authentication token found in getSingleAddress', {
        requestId,
        addressId: id,
        action: 'missing_auth_token',
      });
      return notFound();
    }

    // Check cache first
    const userIdentifier = nextAuthSessionToken.value.substring(0, 10); // Use part of token as user identifier
    const cacheKey = `address_${id}_${userIdentifier}`;
    const cachedAddress = appCache.products.get(cacheKey);

    if (cachedAddress && !retryAttempt) {
      logger.debug('Address cache hit', {
        requestId,
        addressId: id,
        action: 'cache_hit',
      });
      return cachedAddress;
    }

    // Before API call
    logger.debug('Fetching address from API', {
      requestId,
      addressId: id,
      retryAttempt,
      action: 'api_request_start',
    });

    // Use cache-control headers
    const cacheControl = getCacheHeaders('userData');
    const apiUrl = `${process.env.API_URL}/api/address/${id}`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
        'Cache-Control': cacheControl['Cache-Control'],
        'X-Request-ID': requestId,
      },
      next: {
        // Address data is user data, so no server-side caching
        revalidate: 0,
        tags: [`address-${id}`],
      },
    });

    // After API call
    logger.debug('API response received', {
      requestId,
      addressId: id,
      status: res.status,
      retryAttempt,
      action: 'api_request_complete',
    });

    // HTTP error handling
    if (!res.ok) {
      const errorStatus = res.status;
      let errorText;

      try {
        errorText = await res.text();
        // eslint-disable-next-line no-unused-vars
      } catch (textError) {
        errorText = 'Failed to read error response';
      }

      logger.error('API request failed', {
        requestId,
        addressId: id,
        status: errorStatus,
        error: errorText,
        retryAttempt,
        action: 'api_request_error',
      });

      // Determine if the error is recoverable (5xx or certain 4xx)
      const isRetryable =
        errorStatus >= 500 || [408, 429].includes(errorStatus);

      if (isRetryable && retryAttempt < maxRetries) {
        // Calculate retry delay with exponential backoff
        const retryDelay = Math.min(
          1000 * Math.pow(2, retryAttempt), // 1s, 2s, 4s, ...
          15000, // Maximum 15 seconds
        );

        logger.warn(`Retrying address request after ${retryDelay}ms`, {
          requestId,
          addressId: id,
          retryAttempt: retryAttempt + 1,
          maxRetries,
          action: 'retry_scheduled',
        });

        // Clean up current timeout
        clearTimeout(timeoutId);

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Retry with incremented counter
        return getSingleAddress(id, retryAttempt + 1, maxRetries);
      }

      // Handle specific error cases
      if (errorStatus === 401 || errorStatus === 403) {
        logger.warn('Authentication error in getSingleAddress', {
          requestId,
          addressId: id,
          status: errorStatus,
          action: 'auth_error',
        });
        return notFound();
      }

      if (errorStatus === 404) {
        logger.info('Address not found', {
          requestId,
          addressId: id,
          action: 'address_not_found',
        });
        return notFound();
      }

      return notFound();
    }

    // Process response with error handling
    try {
      const data = await res.json();

      // Check for business errors
      if (data?.success === false) {
        logger.warn('API returned success: false', {
          requestId,
          addressId: id,
          message: data?.message,
          action: 'api_business_error',
        });

        // Determine if the business error requires a notFound() or not
        if (
          data?.code === 'ADDRESS_NOT_FOUND' ||
          data?.message?.toLowerCase().includes('not found')
        ) {
          return notFound();
        }

        return notFound();
      }

      // Check that address exists in the response
      if (!data?.data?.address) {
        logger.error('Address data missing in response', {
          requestId,
          addressId: id,
          action: 'address_data_missing',
        });
        return notFound();
      }

      // Success - cache the result
      const address = data.data.address;
      appCache.products.set(cacheKey, address, { ttl: 5 * 60 * 1000 }); // Cache for 5 minutes

      logger.info('Successfully fetched address details', {
        requestId,
        addressId: id,
        isDefaultAddress: !!address.isDefault,
        action: 'api_success',
        duration: Date.now() - parseInt(requestId.split('-')[2]), // Approximate duration calculation
      });

      return address;
    } catch (parseError) {
      logger.error('JSON parsing error in getSingleAddress', {
        requestId,
        addressId: id,
        error: parseError.message,
        retryAttempt,
        action: 'parse_error',
      });

      // If parsing error and retries available
      if (retryAttempt < maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 15000);
        logger.warn(`Retrying after parse error (${retryDelay}ms)`, {
          requestId,
          addressId: id,
          retryAttempt: retryAttempt + 1,
          action: 'retry_scheduled',
        });

        clearTimeout(timeoutId);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        return getSingleAddress(id, retryAttempt + 1, maxRetries);
      }

      try {
        const rawText = await res.clone().text();

        logger.error('Raw response text', {
          requestId,
          addressId: id,
          text: rawText.substring(0, 200) + '...',
          action: 'raw_response',
        });
      } catch (textError) {
        logger.error('Failed to get raw response text', {
          requestId,
          addressId: id,
          error: textError.message,
          action: 'raw_response_failed',
        });
      }

      return notFound();
    }
  } catch (error) {
    logger.error('Exception in getSingleAddress', {
      requestId,
      addressId: id,
      error: error.message,
      stack: error.stack,
      retryAttempt,
      action: 'get_single_address_error',
    });

    // Determine if the error is recoverable
    const isRetryable =
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('network') ||
      error.message.includes('connection');

    if (isRetryable && retryAttempt < maxRetries) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryAttempt), 15000);
      logger.warn(`Retrying after exception (${retryDelay}ms)`, {
        requestId,
        addressId: id,
        retryAttempt: retryAttempt + 1,
        maxRetries,
        action: 'retry_scheduled',
      });

      clearTimeout(timeoutId);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return getSingleAddress(id, retryAttempt + 1, maxRetries);
    }

    captureException(error, {
      tags: { action: 'get_single_address' },
      extra: { addressId: id, requestId, retryAttempt },
    });

    return notFound();
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getAllOrders = async (
  searchParams,
  retryAttempt = 0,
  maxRetries = 3,
) => {
  const controller = new AbortController();
  const requestId = `orders-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Timeout pour éviter les requêtes bloquées
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getAllOrders', {
      requestId,
      timeoutMs: 8000,
      action: 'request_timeout',
    });
  }, 8000); // 8 secondes pour les commandes

  logger.info('Starting getAllOrders request', {
    requestId,
    searchParams,
    retryAttempt,
    action: 'get_all_orders',
  });

  try {
    // Extraction et validation des paramètres
    let page = 1;

    if (searchParams?.page) {
      // Valider que la page est un nombre
      const parsedPage = parseInt(searchParams.page, 10);
      if (!isNaN(parsedPage) && parsedPage > 0 && parsedPage <= 100) {
        page = parsedPage;
      } else {
        logger.warn('Invalid page parameter in getAllOrders', {
          requestId,
          providedPage: searchParams.page,
          action: 'invalid_page_param',
        });
        // Utiliser la valeur par défaut (1)
      }
    }

    // Obtenir les cookies pour l'authentification
    const nextCookies = await cookies();
    const cookieName = getCookieName();
    const nextAuthSessionToken = nextCookies.get(cookieName);

    if (!nextAuthSessionToken) {
      logger.warn('No authentication token found in getAllOrders', {
        requestId,
        action: 'missing_auth_token',
      });
      return { orders: [], totalPages: 0, deliveryPrice: [] };
    }

    // Clé de cache basée sur l'utilisateur et la page
    const cacheKey = `orders_${nextAuthSessionToken.value.substring(0, 10)}_page_${page}`;

    // Vérifier le cache
    const cachedData = appCache.products.get(cacheKey);
    if (cachedData && !retryAttempt) {
      logger.debug('Orders cache hit', {
        requestId,
        page,
        action: 'cache_hit',
      });
      return cachedData;
    }

    // Construction de l'URL avec paramètres validés
    const urlParams = { page };
    const searchQuery = queryString.stringify(urlParams);
    const apiUrl = `${process.env.API_URL}/api/orders/me?${searchQuery}`;

    // Avant l'appel API
    logger.debug('Fetching orders from API', {
      requestId,
      page,
      retryAttempt,
      action: 'api_request_start',
    });

    // Appel API avec gestion du timeout
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
        'X-Request-ID': requestId,
        'Cache-Control': 'no-store',
      },
      next: {
        revalidate: 0, // Ne pas mettre en cache côté serveur les données utilisateur
        tags: ['user-orders'],
      },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      status: res.status,
      retryAttempt,
      action: 'api_request_complete',
    });

    // Gestion des erreurs HTTP
    if (!res.ok) {
      const errorStatus = res.status;
      let errorText;

      try {
        errorText = await res.text();
        // eslint-disable-next-line no-unused-vars
      } catch (textError) {
        errorText = 'Failed to read error response';
      }

      logger.error('API request failed in getAllOrders', {
        requestId,
        status: errorStatus,
        error: errorText,
        retryAttempt,
        action: 'api_request_error',
      });

      // Déterminer si l'erreur est récupérable
      const isRetryable =
        errorStatus >= 500 || [408, 429].includes(errorStatus);

      if (isRetryable && retryAttempt < maxRetries) {
        // Calculer le délai de retry avec backoff exponentiel
        const retryDelay = Math.min(
          1000 * Math.pow(2, retryAttempt), // 1s, 2s, 4s, ...
          15000, // Maximum 15 secondes
        );

        logger.warn(`Retrying orders request after ${retryDelay}ms`, {
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
        return getAllOrders(searchParams, retryAttempt + 1, maxRetries);
      }

      // Traitement selon le type d'erreur
      if (errorStatus === 401 || errorStatus === 403) {
        logger.warn('Authentication error in getAllOrders', {
          requestId,
          status: errorStatus,
          action: 'auth_error',
        });
        // Ne pas afficher de message toast ici, la redirection sera gérée par le middleware d'authentification
      } else if (errorStatus === 404) {
        logger.info('No orders found', {
          requestId,
          action: 'orders_not_found',
        });
      } else {
        // Autres erreurs
        captureException(new Error(`API Error ${errorStatus}: ${errorText}`), {
          tags: { action: 'get_all_orders', status: errorStatus },
          extra: { requestId, retryAttempt },
        });
      }

      return { orders: [], totalPages: 0, deliveryPrice: [] };
    }

    // Traitement de la réponse avec gestion des erreurs de parsing
    try {
      const data = await res.json();

      // Vérifier les erreurs business
      if (data?.success === false) {
        logger.warn('API returned success: false in getAllOrders', {
          requestId,
          message: data?.message,
          action: 'api_business_error',
        });

        // Ne pas afficher automatiquement le message d'erreur
        // Laisser l'UI décider comment présenter l'erreur
        return {
          orders: [],
          totalPages: 0,
          deliveryPrice: [],
          error: data?.message,
        };
      }

      // Vérifier que les données existent
      if (!data?.data) {
        logger.error('Orders data missing in response', {
          requestId,
          action: 'orders_data_missing',
        });
        return { orders: [], totalPages: 0, deliveryPrice: [] };
      }

      // Valider et normaliser les données
      const orders = Array.isArray(data.data.orders) ? data.data.orders : [];
      const totalPages =
        typeof data.data.totalPages === 'number' ? data.data.totalPages : 0;
      const deliveryPrice = Array.isArray(data.data.deliveryPrice)
        ? data.data.deliveryPrice
        : [];

      // Masquer les informations sensibles de paiement
      const sanitizedOrders = orders.map((order) => ({
        ...order,
        // Sécurité : masquer les détails sensibles des informations de paiement
        paymentInfo: order.paymentInfo
          ? {
              ...order.paymentInfo,
              // Assurer que le numéro de compte est masqué
              paymentAccountNumber:
                order.paymentInfo.paymentAccountNumber?.includes('••••••')
                  ? order.paymentInfo.paymentAccountNumber
                  : '••••••' +
                    (order.paymentInfo.paymentAccountNumber?.slice(-4) || ''),
            }
          : order.paymentInfo,
      }));

      const result = {
        orders: sanitizedOrders,
        totalPages,
        deliveryPrice,
        currentPage: page,
      };

      // Mettre en cache pour 2 minutes (historique de commandes change peu)
      appCache.products.set(cacheKey, result, { ttl: 2 * 60 * 1000 });

      logger.info('Successfully fetched orders', {
        requestId,
        page,
        orderCount: orders.length,
        totalPages,
        action: 'api_success',
        duration: Math.round(
          performance.now() - parseInt(requestId.split('-')[1]),
        ),
      });

      return result;
    } catch (parseError) {
      logger.error('JSON parsing error in getAllOrders', {
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
        return getAllOrders(searchParams, retryAttempt + 1, maxRetries);
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

      captureException(parseError, {
        tags: { action: 'get_all_orders', error: 'parse_error' },
        extra: { requestId, retryAttempt },
      });

      return { orders: [], totalPages: 0, deliveryPrice: [] };
    }
  } catch (error) {
    logger.error('Exception in getAllOrders', {
      requestId,
      error: error.message,
      stack: error.stack,
      retryAttempt,
      action: 'get_all_orders_error',
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
      return getAllOrders(searchParams, retryAttempt + 1, maxRetries);
    }

    captureException(error, {
      tags: { action: 'get_all_orders' },
      extra: { searchParams, requestId, retryAttempt },
    });

    return { orders: [], totalPages: 0, deliveryPrice: [] };
  } finally {
    clearTimeout(timeoutId);
  }
};
