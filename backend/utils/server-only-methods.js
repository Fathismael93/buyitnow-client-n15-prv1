import 'server-only';

import { cookies } from 'next/headers';
import mongoose from 'mongoose';
import { getCookieName } from '@/helpers/helpers';
import { toast } from 'react-toastify';
import {
  // appCache,
  CACHE_DURATIONS,
  // getCacheHeaders,
  // getCacheKey,
} from '@/utils/cache';
// import {
//   categorySchema,
//   maxPriceSchema,
//   minPriceSchema,
//   pageSchema,
//   searchSchema,
// } from '@/helpers/schemas';
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
          // const result = await searchSchema.validate(
          //   { keyword: searchParams.keyword },
          //   { abortEarly: false },
          // );
          // if (result.keyword) urlParams.keyword = result.keyword;
          urlParams.keyword = searchParams.keyword.trim();
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
          // const result = await pageSchema.validate(
          //   { page: searchParams.page },
          //   { abortEarly: false },
          // );

          // if (result.page) urlParams.page = result.page;
          urlParams.page = parseInt(searchParams.page);
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
          // const result = await categorySchema.validate(
          //   { value: searchParams.category },
          //   { abortEarly: false },
          // );

          // if (result.value) urlParams.category = result.value;
          urlParams.category = searchParams.category;
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
          // const minResult = await minPriceSchema.validate(
          //   {
          //     minPrice: searchParams.min,
          //   },
          //   { abortEarly: false },
          // );
          // if (minResult.minPrice) urlParams['price[gte]'] = minResult.minPrice;
          urlParams['price[gte]'] = parseInt(searchParams.min);
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
          // const maxResult = await maxPriceSchema.validate(
          //   {
          //     maxPrice: searchParams.max,
          //   },
          //   { abortEarly: false },
          // );
          // if (maxResult.maxPrice) urlParams['price[lte]'] = maxResult.maxPrice;
          urlParams['price[lte]'] = parseInt(searchParams.max);
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
    // const cacheControl = getCacheHeaders('products');

    // S'assurer que l'URL est correctement formatée
    const apiUrl = `${process.env.API_URL || ''}/api/products${searchQuery ? `?${searchQuery}` : ''}`;

    // On vérifie le cache avant de faire l'appel API
    // La clé de cache doit correspondre au format utilisé dans l'API
    // const cacheKey = getCacheKey(
    //   'products',
    //   Object.fromEntries(new URLSearchParams(searchQuery)),
    // );

    // const cachedData = appCache.products.get(cacheKey);
    // if (cachedData && !retryAttempt) {
    //   logger.debug('Products cache hit', {
    //     requestId,
    //     action: 'cache_hit',
    //   });
    //   return cachedData;
    // }

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
        revalidate: CACHE_DURATIONS.products || 300,
        tags: [
          'products',
          ...(urlParams.category ? [`category-${urlParams.category}`] : []),
        ],
      },
      // headers: {
      //   'Cache-Control': cacheControl,
      // },
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
          // Nous retournons directement la réponse sans la mettre en cache,
          // car l'API a déjà mis en cache ces données
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
  const requestId = `categories-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Vérifier si les données sont en cache
  // const cacheKey = getCacheKey('categories', {});
  // const cachedCategories = appCache.categories.get(cacheKey);

  // if (cachedCategories) {
  //   logger.info('Categories served from client-side cache', {
  //     component: 'getCategories',
  //     cached: true,
  //     count: cachedCategories.categories?.length || 0,
  //   });

  //   return cachedCategories;
  // }

  // Timeout de 5 secondes pour les catégories
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getCategories', {
      requestId,
      timeoutMs: 5000,
      action: 'request_timeout',
    });
  }, 5000);

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

    // const cacheControl = getCacheHeaders('categories');
    const apiUrl = `${process.env.API_URL || ''}/api/category`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        revalidate: CACHE_DURATIONS.categories || 3600,
        tags: ['categories'],
      },
      // headers: {
      //   'Cache-Control': cacheControl,
      // },
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
      parseErrorMessage = parseError.message;
      logger.error('JSON parsing error in getCategories', {
        requestId,
        error: parseError.message,
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
            categories: [],
          };

        case 401: // Unauthorized
          return {
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentification requise',
            categories: [],
          };

        case 403: // Forbidden
          return {
            success: false,
            code: 'FORBIDDEN',
            message: 'Accès interdit',
            categories: [],
          };

        case 404: // Not Found
          return {
            success: false,
            code: 'NOT_FOUND',
            message: 'Ressource non trouvée',
            categories: [],
          };

        case 429: // Too Many Requests
          toast.info('Trop de requêtes, veuillez réessayer plus tard');
          return {
            success: false,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Trop de requêtes, veuillez réessayer plus tard',
            retryAfter: res.headers.get('Retry-After')
              ? parseInt(res.headers.get('Retry-After'))
              : 60,
            categories: [],
          };

        case 500: // Internal Server Error
          toast.error(
            'Une erreur est survenue lors du chargement des catégories',
          );
          return {
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Une erreur interne est survenue, veuillez réessayer ultérieurement',
            categories: [],
          };

        case 503: // Service Unavailable
          toast.error('Service temporairement indisponible');
          return {
            success: false,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporairement indisponible',
            categories: [],
          };

        case 504: // Gateway Timeout
          toast.error('La requête a pris trop de temps');
          return {
            success: false,
            code: 'TIMEOUT',
            message: 'La requête a pris trop de temps',
            categories: [],
          };

        default: // Autres erreurs
          toast.error('Erreur lors du chargement des catégories');
          return {
            success: false,
            code: 'API_ERROR',
            message:
              isJsonResponse && responseBody.message
                ? responseBody.message
                : `Erreur ${statusCode}`,
            status: statusCode,
            categories: [],
          };
      }
    }

    // Traitement de la réponse en cas de succès HTTP (200)
    if (isJsonResponse) {
      // Si JSON valide
      if (responseBody.success === true) {
        // Cas de succès API explicite
        logger.info('Successfully fetched categories', {
          requestId,
          categoryCount: responseBody.data?.categories?.length || 0,
          action: 'api_success',
        });

        // Vérifier si des catégories sont présentes dans la réponse
        if (responseBody.data?.count > 0) {
          // Cas standard avec des catégories trouvées
          // L'API a déjà mis en cache les données, on les retourne directement
          return {
            success: true,
            message:
              responseBody.message || 'Catégories récupérées avec succès',
            categories: responseBody.data.categories,
            cached: responseBody.data?.cached || false,
            timestamp: responseBody.data?.timestamp,
            count:
              responseBody.data?.count || responseBody.data?.categories?.length,
          };
        } else {
          // Cas spécifique où aucune catégorie n'est trouvée mais la requête est réussie
          return {
            success: true,
            message: responseBody.message || 'Aucune catégorie trouvée',
            categories: [],
            count: 0,
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

        toast.info(
          responseBody.message || 'Erreur lors du chargement des catégories',
        );

        return {
          success: false,
          code: responseBody.code || 'API_BUSINESS_ERROR',
          message: responseBody.message || 'Erreur côté serveur',
          categories: [],
        };
      } else {
        // Structure de réponse inattendue
        logger.error('Unexpected API response structure', {
          requestId,
          responseBody: JSON.stringify(responseBody).substring(0, 200),
          action: 'unexpected_response_structure',
        });

        // Tenter d'extraire les catégories même si la structure est inattendue
        const categories = Array.isArray(responseBody.data?.categories)
          ? responseBody.data.categories
          : Array.isArray(responseBody.categories)
            ? responseBody.categories
            : [];

        if (categories.length > 0) {
          // Des catégories ont été trouvées malgré la structure inattendue
          return {
            success: true,
            code: 'UNEXPECTED_STRUCTURE',
            message:
              'Structure de réponse inattendue, mais des catégories ont été trouvées',
            categories: categories,
          };
        } else {
          toast.error('Format de réponse incorrect');
          return {
            success: false,
            code: 'UNEXPECTED_RESPONSE',
            message: 'Format de réponse inattendu',
            categories: [],
          };
        }
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

      toast.error('Erreur lors de la récupération des catégories');

      return {
        success: false,
        code: 'INVALID_RESPONSE_FORMAT',
        message: 'Le serveur a répondu avec un format invalide',
        errorDetails: parseErrorMessage,
        categories: [],
      };
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

    // Retourner une erreur typée en fonction de la nature de l'exception
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      toast.error('La récupération des catégories a pris trop de temps');
      return {
        success: false,
        code: 'CLIENT_TIMEOUT',
        message:
          "La requête a été interrompue en raison d'un délai d'attente excessif",
        categories: [],
      };
    } else if (
      error.message.includes('network') ||
      error.message.includes('connection')
    ) {
      toast.error('Problème de connexion réseau');
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'Problème de connexion réseau',
        categories: [],
      };
    } else {
      toast.error('Erreur lors du chargement des catégories');
      return {
        success: false,
        code: 'CLIENT_ERROR',
        message:
          "Une erreur s'est produite lors de la récupération des catégories",
        errorDetails: error.message,
        categories: [],
      };
    }
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
      return {
        success: false,
        code: 'INVALID_ID_FORMAT',
        message: "Format d'identifiant de produit invalide",
        notFound: true,
      };
    }

    const isValidId = mongoose.isValidObjectId(id);
    if (!isValidId) {
      logger.warn('Invalid MongoDB ObjectId format', {
        requestId,
        productId: id,
        action: 'invalid_mongodb_id',
      });
      return {
        success: false,
        code: 'INVALID_ID_FORMAT',
        message: "Format d'identifiant de produit invalide",
        notFound: true,
      };
    }

    // Vérifier le cache d'abord - utiliser la même clé que dans l'API
    // const cacheKey = getCacheKey('single-product', { id });
    // const cachedProduct = appCache.singleProducts.get(cacheKey);

    // if (cachedProduct && !retryAttempt) {
    //   logger.debug('Product details cache hit', {
    //     requestId,
    //     productId: id,
    //     action: 'cache_hit',
    //   });

    //   // Récupérer également les produits similaires s'ils existent
    //   let sameCategoryProducts = [];
    //   if (cachedProduct.category) {
    //     const similarCacheKey = getCacheKey('similar-products', {
    //       categoryId: cachedProduct.category,
    //     });
    //     sameCategoryProducts =
    //       appCache.singleProducts.get(similarCacheKey) || [];
    //   }

    //   return {
    //     success: true,
    //     product: cachedProduct,
    //     sameCategoryProducts,
    //     message: 'Produit récupéré depuis le cache',
    //     fromCache: true,
    //   };
    // }

    // Avant l'appel API
    logger.debug('Fetching product details from API', {
      requestId,
      productId: id,
      retryAttempt,
      action: 'api_request_start',
    });

    // Utiliser les headers de cache optimisés pour un seul produit
    // const cacheControl = getCacheHeaders('singleProduct');
    const apiUrl = `${process.env.API_URL || ''}/api/products/${id}`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        // Utiliser la configuration de cache spécifique aux produits individuels
        revalidate: CACHE_DURATIONS.singleProduct || 7200,
        tags: ['product', `product-${id}`],
      },
      // headers: {
      //   'Cache-Control': cacheControl['Cache-Control'],
      // },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      productId: id,
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
      parseErrorMessage = parseError.message;
      logger.error('JSON parsing error in getProductDetails', {
        requestId,
        productId: id,
        error: parseError.message,
        retryAttempt,
        action: 'parse_error',
      });

      try {
        // Si ce n'est pas du JSON, essayer de récupérer comme texte
        responseBody = await res.clone().text();
      } catch (textError) {
        logger.error('Failed to get response text after JSON parse failure', {
          requestId,
          productId: id,
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
                : "Format d'identifiant de produit invalide",
            notFound: false,
          };

        case 401: // Unauthorized
          return {
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentification requise',
            notFound: false,
          };

        case 403: // Forbidden
          return {
            success: false,
            code: 'FORBIDDEN',
            message: 'Accès interdit',
            notFound: false,
          };

        case 404: // Not Found
          logger.info('Product not found', {
            requestId,
            productId: id,
            action: 'product_not_found',
          });
          return {
            success: false,
            code: 'PRODUCT_NOT_FOUND',
            message: 'Produit non trouvé',
            notFound: true,
          };

        case 429: // Too Many Requests
          return {
            success: false,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Trop de requêtes, veuillez réessayer plus tard',
            retryAfter: res.headers.get('Retry-After')
              ? parseInt(res.headers.get('Retry-After'))
              : 60,
            notFound: false,
          };

        case 500: // Internal Server Error
          return {
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Une erreur interne est survenue, veuillez réessayer ultérieurement',
            notFound: false,
          };

        case 503: // Service Unavailable
          return {
            success: false,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporairement indisponible',
            notFound: false,
          };

        case 504: // Gateway Timeout
          return {
            success: false,
            code: 'TIMEOUT',
            message: 'La requête a pris trop de temps',
            notFound: false,
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
            notFound: false,
          };
      }
    }

    // Traitement de la réponse en cas de succès HTTP (200)
    if (isJsonResponse) {
      // Vérifier les erreurs business
      if (responseBody.success === false) {
        logger.warn('API returned success: false', {
          requestId,
          productId: id,
          message: responseBody.message,
          code: responseBody.code,
          action: 'api_business_error',
        });

        // Déterminer si l'erreur business nécessite un notFound() ou non
        if (
          responseBody.code === 'PRODUCT_NOT_FOUND' ||
          (responseBody.message &&
            responseBody.message.toLowerCase().includes('not found'))
        ) {
          return {
            success: false,
            code: responseBody.code || 'PRODUCT_NOT_FOUND',
            message: responseBody.message || 'Produit non trouvé',
            notFound: true,
          };
        }

        return {
          success: false,
          code: responseBody.code || 'API_BUSINESS_ERROR',
          message:
            responseBody.message || 'Erreur lors de la récupération du produit',
          notFound: false,
        };
      }

      // Vérifier que le produit existe dans la réponse
      if (!responseBody.data?.product) {
        logger.error('Product data missing in response', {
          requestId,
          productId: id,
          action: 'product_data_missing',
        });
        return {
          success: false,
          code: 'PRODUCT_DATA_MISSING',
          message: 'Données du produit manquantes dans la réponse',
          notFound: true,
        };
      }

      // Cas de succès - le produit et ses informations associées ont été trouvés
      logger.info('Successfully fetched product details', {
        requestId,
        productId: id,
        productName: responseBody.data.product.name || 'Unknown',
        similarProductsCount:
          responseBody.data.sameCategoryProducts?.length || 0,
        action: 'api_success',
        duration: Date.now() - parseInt(requestId.split('-')[2]), // Calcul approximatif de la durée
      });

      return {
        success: true,
        product: responseBody.data.product,
        sameCategoryProducts: responseBody.data.sameCategoryProducts || [],
        message: 'Produit récupéré avec succès',
        fromCache: responseBody.data.fromCache || false,
      };
    } else {
      // Réponse non-JSON mais statut HTTP 200
      logger.error('Non-JSON response with HTTP 200', {
        requestId,
        productId: id,
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
        notFound: false,
      };
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

    // Retourner une erreur typée en fonction de la nature de l'exception
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return {
        success: false,
        code: 'CLIENT_TIMEOUT',
        message:
          "La requête a été interrompue en raison d'un délai d'attente excessif",
        notFound: false,
      };
    } else if (
      error.message.includes('network') ||
      error.message.includes('connection')
    ) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'Problème de connexion réseau',
        notFound: false,
      };
    } else {
      return {
        success: false,
        code: 'CLIENT_ERROR',
        message: "Une erreur s'est produite lors de la récupération du produit",
        errorDetails: error.message,
        notFound: false,
      };
    }
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
    page = 'shipping'; // Valeur par défaut si page invalide
  }

  const controller = new AbortController();
  const requestId = `addresses-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Obtenir les cookies pour l'authentification
  const nextCookies = await cookies();
  const cookieName = getCookieName();
  const nextAuthSessionToken = nextCookies.get(cookieName);

  if (!nextAuthSessionToken) {
    logger.warn('No authentication token found', {
      requestId,
      page,
      action: 'missing_auth_token',
    });

    return {
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentification requise',
      data:
        page === 'profile'
          ? { addresses: [] }
          : { addresses: [], paymentTypes: [], deliveryPrice: [] },
    };
  }

  // Vérifier le cache d'abord
  // La clé de cache doit inclure l'ID utilisateur et le contexte de page
  // const userIdentifier = nextAuthSessionToken.value.substring(0, 10);
  // const cacheKey = getCacheKey('addresses', {
  //   userId: userIdentifier,
  //   context: page,
  // });

  // const cachedAddresses = appCache.addresses.get(cacheKey);
  // if (cachedAddresses && !retryAttempt) {
  //   logger.debug('Addresses cache hit', {
  //     requestId,
  //     page,
  //     action: 'cache_hit',
  //   });
  //   return cachedAddresses;
  // }

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
    // Avant l'appel API
    logger.debug('Fetching addresses from API', {
      requestId,
      page,
      retryAttempt,
      action: 'api_request_start',
    });

    // Utiliser les headers de cache optimisés pour les données utilisateur
    // const cacheControl = getCacheHeaders('userData');
    const apiUrl = `${process.env.API_URL}/api/address?context=${page}`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      // headers: {
      //   Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
      //   'Cache-Control': cacheControl['Cache-Control'],
      //   'X-Request-ID': requestId,
      // },
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

    // Tenter de récupérer le corps de la réponse, que ce soit JSON ou texte
    let responseBody;
    let isJsonResponse = true;
    let parseErrorMessage = null;

    try {
      responseBody = await res.json();
    } catch (parseError) {
      isJsonResponse = false;
      parseErrorMessage = parseError.message;
      logger.error('JSON parsing error in getAllAddresses', {
        requestId,
        page,
        error: parseError.message,
        retryAttempt,
        action: 'parse_error',
      });

      try {
        // Si ce n'est pas du JSON, essayer de récupérer comme texte
        responseBody = await res.clone().text();
      } catch (textError) {
        logger.error('Failed to get response text after JSON parse failure', {
          requestId,
          page,
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
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };

        case 401: // Unauthorized
          return {
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentification requise',
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };

        case 403: // Forbidden
          return {
            success: false,
            code: 'FORBIDDEN',
            message: 'Accès interdit',
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };

        case 404: // Not Found
          return {
            success: false,
            code: 'NOT_FOUND',
            message: 'Aucune adresse trouvée',
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };

        case 429: // Too Many Requests
          return {
            success: false,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Trop de requêtes, veuillez réessayer plus tard',
            retryAfter: res.headers.get('Retry-After')
              ? parseInt(res.headers.get('Retry-After'))
              : 60,
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };

        case 500: // Internal Server Error
          return {
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Une erreur interne est survenue, veuillez réessayer ultérieurement',
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };

        case 503: // Service Unavailable
          return {
            success: false,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporairement indisponible',
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };

        case 504: // Gateway Timeout
          return {
            success: false,
            code: 'TIMEOUT',
            message: 'La requête a pris trop de temps',
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
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
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };
      }
    }

    // Traitement de la réponse en cas de succès HTTP (200)
    if (isJsonResponse) {
      // Si JSON valide
      if (responseBody.success === true) {
        // Cas de succès API explicite
        if (responseBody.data) {
          // Vérifier si on est sur la page de profil pour filtrer les données
          let responseData = { ...responseBody.data };

          if (page === 'profile') {
            // Si on est sur la page de profil, supprimer les types de paiement et prix de livraison
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

          // Cas de succès avec des adresses trouvées
          return {
            success: true,
            message: responseBody.message || 'Adresses récupérées avec succès',
            data: responseData,
            addressCount: responseData?.addresses?.length || 0,
          };
        } else {
          // Cas de succès API mais données manquantes
          logger.warn('Success response but data missing', {
            requestId,
            page,
            action: 'data_missing_in_success',
          });

          return {
            success: true,
            message: 'Aucune adresse trouvée',
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };
        }
      } else if (responseBody.success === false) {
        // Cas d'erreur API explicite mais avec statut HTTP 200
        logger.warn('API returned success: false', {
          requestId,
          page,
          message: responseBody.message,
          code: responseBody.code,
          action: 'api_business_error',
        });

        return {
          success: false,
          code: responseBody.code || 'API_BUSINESS_ERROR',
          message:
            responseBody.message ||
            'Erreur lors de la récupération des adresses',
          data:
            page === 'profile'
              ? { addresses: [] }
              : { addresses: [], paymentTypes: [], deliveryPrice: [] },
        };
      } else {
        // Structure de réponse inattendue
        logger.error('Unexpected API response structure', {
          requestId,
          page,
          responseBody: JSON.stringify(responseBody).substring(0, 200),
          action: 'unexpected_response_structure',
        });

        // Tenter d'extraire les adresses même si la structure est inattendue
        const addresses = Array.isArray(responseBody.data?.addresses)
          ? responseBody.data.addresses
          : Array.isArray(responseBody.addresses)
            ? responseBody.addresses
            : [];

        // Pour les autres données importantes
        const paymentTypes = Array.isArray(responseBody.data?.paymentTypes)
          ? responseBody.data.paymentTypes
          : Array.isArray(responseBody.paymentTypes)
            ? responseBody.paymentTypes
            : [];

        const deliveryPrice = Array.isArray(responseBody.data?.deliveryPrice)
          ? responseBody.data.deliveryPrice
          : Array.isArray(responseBody.deliveryPrice)
            ? responseBody.deliveryPrice
            : [];

        // Organiser les données selon le contexte
        let extractedData;
        if (page === 'profile') {
          extractedData = { addresses };
        } else {
          extractedData = { addresses, paymentTypes, deliveryPrice };
        }

        if (addresses.length > 0) {
          // Des adresses ont été trouvées malgré la structure inattendue
          return {
            success: true,
            code: 'UNEXPECTED_STRUCTURE',
            message:
              'Structure de réponse inattendue, mais des adresses ont été trouvées',
            data: extractedData,
          };
        } else {
          // Aucune adresse trouvée dans la structure inattendue
          return {
            success: false,
            code: 'UNEXPECTED_RESPONSE',
            message: 'Format de réponse inattendu et aucune adresse trouvée',
            data:
              page === 'profile'
                ? { addresses: [] }
                : { addresses: [], paymentTypes: [], deliveryPrice: [] },
          };
        }
      }
    } else {
      // Réponse non-JSON mais statut HTTP 200
      logger.error('Non-JSON response with HTTP 200', {
        requestId,
        page,
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
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
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

    // Retourner une erreur typée en fonction de la nature de l'exception
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return {
        success: false,
        code: 'CLIENT_TIMEOUT',
        message:
          "La requête a été interrompue en raison d'un délai d'attente excessif",
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    } else if (
      error.message.includes('network') ||
      error.message.includes('connection')
    ) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'Problème de connexion réseau',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    } else {
      return {
        success: false,
        code: 'CLIENT_ERROR',
        message:
          "Une erreur s'est produite lors de la récupération des adresses",
        errorDetails: error.message,
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }
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

  // Validation améliorée de l'ID
  if (!id || typeof id !== 'string') {
    logger.warn('Invalid address ID format (undefined or not string)', {
      requestId,
      addressId: id,
      action: 'invalid_id_format',
    });
    return {
      success: false,
      code: 'INVALID_ID_FORMAT',
      message: "Format d'identifiant d'adresse invalide",
      notFound: true,
    };
  }

  const isValidId = mongoose.isValidObjectId(id);
  if (!isValidId) {
    logger.warn('Invalid MongoDB ObjectId format', {
      requestId,
      addressId: id,
      action: 'invalid_mongodb_id',
    });
    return {
      success: false,
      code: 'INVALID_ID_FORMAT',
      message: "Format d'identifiant d'adresse invalide",
      notFound: true,
    };
  }

  // Obtenir les cookies pour l'authentification
  const nextCookies = await cookies();
  const cookieName = getCookieName();
  const nextAuthSessionToken = nextCookies.get(cookieName);

  if (!nextAuthSessionToken) {
    logger.warn('No authentication token found in getSingleAddress', {
      requestId,
      addressId: id,
      action: 'missing_auth_token',
    });
    return {
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentification requise',
      notFound: true,
    };
  }

  // Vérifier le cache d'abord
  // const userIdentifier = nextAuthSessionToken.value.substring(0, 10);
  // const cacheKey = getCacheKey('address_detail', {
  //   userId: userIdentifier,
  //   addressId: id,
  // });

  // const cachedAddress = appCache.addresses.get(cacheKey);
  // if (cachedAddress && !retryAttempt) {
  //   logger.debug('Address cache hit', {
  //     requestId,
  //     addressId: id,
  //     action: 'cache_hit',
  //   });
  //   return {
  //     success: true,
  //     address: cachedAddress,
  //     message: 'Adresse récupérée depuis le cache',
  //     fromCache: true,
  //   };
  // }

  // Timeout de 5 secondes pour éviter les requêtes bloquées
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
    // Avant l'appel API
    logger.debug('Fetching address from API', {
      requestId,
      addressId: id,
      retryAttempt,
      action: 'api_request_start',
    });

    // Utiliser les headers de cache optimisés
    // const cacheControl = getCacheHeaders('addressDetail');
    const apiUrl = `${process.env.API_URL}/api/address/${id}`;

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${nextAuthSessionToken?.name}=${nextAuthSessionToken?.value}`,
        // 'Cache-Control': cacheControl['Cache-Control'],
        'X-Request-ID': requestId,
      },
      next: {
        // Les données d'adresse sont des données utilisateur, donc pas de mise en cache côté serveur
        revalidate: 0,
        tags: [`address-${id}`],
      },
    });

    // Après l'appel API
    logger.debug('API response received', {
      requestId,
      addressId: id,
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
      parseErrorMessage = parseError.message;
      logger.error('JSON parsing error in getSingleAddress', {
        requestId,
        addressId: id,
        error: parseError.message,
        retryAttempt,
        action: 'parse_error',
      });

      try {
        // Si ce n'est pas du JSON, essayer de récupérer comme texte
        responseBody = await res.clone().text();
      } catch (textError) {
        logger.error('Failed to get response text after JSON parse failure', {
          requestId,
          addressId: id,
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

        logger.warn(`Retrying address request after ${retryDelay}ms`, {
          requestId,
          addressId: id,
          retryAttempt: retryAttempt + 1,
          maxRetries,
          action: 'retry_scheduled',
        });

        // Nettoyer le timeout actuel
        clearTimeout(timeoutId);

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        // Réessayer avec le compteur incrémenté
        return getSingleAddress(id, retryAttempt + 1, maxRetries);
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
                : "Format d'identifiant d'adresse invalide",
            notFound: false,
          };

        case 401: // Unauthorized
          return {
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentification requise',
            notFound: false,
          };

        case 403: // Forbidden
          return {
            success: false,
            code: 'FORBIDDEN',
            message: 'Accès interdit à cette adresse',
            notFound: false,
          };

        case 404: // Not Found
          logger.info('Address not found', {
            requestId,
            addressId: id,
            action: 'address_not_found',
          });
          return {
            success: false,
            code: 'ADDRESS_NOT_FOUND',
            message: 'Adresse non trouvée',
            notFound: true,
          };

        case 429: // Too Many Requests
          return {
            success: false,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Trop de requêtes, veuillez réessayer plus tard',
            retryAfter: res.headers.get('Retry-After')
              ? parseInt(res.headers.get('Retry-After'))
              : 60,
            notFound: false,
          };

        case 500: // Internal Server Error
          return {
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Une erreur interne est survenue, veuillez réessayer ultérieurement',
            notFound: false,
          };

        case 503: // Service Unavailable
          return {
            success: false,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporairement indisponible',
            notFound: false,
          };

        case 504: // Gateway Timeout
          return {
            success: false,
            code: 'TIMEOUT',
            message: 'La requête a pris trop de temps',
            notFound: false,
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
            notFound: false,
          };
      }
    }

    // Traitement de la réponse en cas de succès HTTP (200)
    if (isJsonResponse) {
      // Vérifier les erreurs business
      if (responseBody.success === false) {
        logger.warn('API returned success: false', {
          requestId,
          addressId: id,
          message: responseBody.message,
          code: responseBody.code,
          action: 'api_business_error',
        });

        // Déterminer si l'erreur business nécessite un notFound ou non
        if (
          responseBody.code === 'ADDRESS_NOT_FOUND' ||
          (responseBody.message &&
            responseBody.message.toLowerCase().includes('not found'))
        ) {
          return {
            success: false,
            code: responseBody.code || 'ADDRESS_NOT_FOUND',
            message: responseBody.message || 'Adresse non trouvée',
            notFound: true,
          };
        }

        return {
          success: false,
          code: responseBody.code || 'API_BUSINESS_ERROR',
          message:
            responseBody.message ||
            "Erreur lors de la récupération de l'adresse",
          notFound: false,
        };
      }

      // Vérifier que l'adresse existe dans la réponse
      if (!responseBody.data?.address) {
        logger.error('Address data missing in response', {
          requestId,
          addressId: id,
          action: 'address_data_missing',
        });
        return {
          success: false,
          code: 'ADDRESS_DATA_MISSING',
          message: "Données d'adresse manquantes dans la réponse",
          notFound: true,
        };
      }

      // Cas de succès - l'adresse a été trouvée
      const address = responseBody.data.address;

      logger.info('Successfully fetched address details', {
        requestId,
        addressId: id,
        isDefaultAddress: !!address.isDefault,
        action: 'api_success',
        duration: Date.now() - parseInt(requestId.split('-')[2]), // Calcul approximatif de la durée
      });

      return {
        success: true,
        address: address,
        message: 'Adresse récupérée avec succès',
        fromCache: false,
      };
    } else {
      // Réponse non-JSON mais statut HTTP 200
      logger.error('Non-JSON response with HTTP 200', {
        requestId,
        addressId: id,
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
        notFound: false,
      };
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

    // Retourner une erreur typée en fonction de la nature de l'exception
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return {
        success: false,
        code: 'CLIENT_TIMEOUT',
        message:
          "La requête a été interrompue en raison d'un délai d'attente excessif",
        notFound: false,
      };
    } else if (
      error.message.includes('network') ||
      error.message.includes('connection')
    ) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'Problème de connexion réseau',
        notFound: false,
      };
    } else {
      return {
        success: false,
        code: 'CLIENT_ERROR',
        message:
          "Une erreur s'est produite lors de la récupération de l'adresse",
        errorDetails: error.message,
        notFound: false,
      };
    }
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

  // Timeout de 8 secondes
  const timeoutId = setTimeout(() => {
    controller.abort();
    logger.warn('Request timeout in getAllOrders', {
      requestId,
      timeoutMs: 8000,
      action: 'request_timeout',
    });
  }, 8000);

  logger.info('Starting getAllOrders request', {
    requestId,
    searchParams,
    retryAttempt,
    action: 'get_all_orders',
  });

  try {
    // Créer un objet pour stocker les paramètres validés
    const urlParams = {};
    const validationErrors = [];

    // Vérifier si searchParams est défini avant d'y accéder
    if (searchParams) {
      // Validation et stockage du paramètre page
      if (searchParams.page) {
        try {
          // Validation simple pour la page
          const parsedPage = parseInt(searchParams.page, 10);
          if (!isNaN(parsedPage) && parsedPage > 0 && parsedPage <= 100) {
            urlParams.page = parsedPage;
          } else {
            validationErrors.push({
              field: 'page',
              message: 'Le numéro de page doit être un nombre entre 1 et 100',
            });
          }
        } catch (err) {
          logger.warn('Error parsing page parameter', {
            requestId,
            error: err.message,
            pageValue: searchParams.page,
            action: 'page_validation_error',
          });

          validationErrors.push({
            field: 'page',
            message: 'Format de page invalide',
            details: err.message,
          });
        }
      }
    }

    // Si des erreurs de validation sont trouvées, retourner immédiatement
    if (validationErrors?.length > 0) {
      logger.warn('Validation errors in getAllOrders', {
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
        data: { orders: [], totalPages: 0, deliveryPrice: [] },
      };
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

      return {
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentification requise',
        data: { orders: [], totalPages: 0, deliveryPrice: [] },
      };
    }

    // Clé de cache basée sur l'utilisateur et les paramètres
    // const userIdentifier = nextAuthSessionToken.value.substring(0, 10);
    // const queryString = new URLSearchParams(urlParams).toString();
    // const cacheKey = `orders_${userIdentifier}_${queryString || 'default'}`;

    // Vérifier le cache
    // const cachedData = appCache.products.get(cacheKey);
    // if (cachedData && !retryAttempt) {
    //   logger.debug('Orders cache hit', {
    //     requestId,
    //     page: urlParams.page || 1,
    //     action: 'cache_hit',
    //   });
    //   return cachedData;
    // }

    // Construire la chaîne de requête
    const searchQuery = new URLSearchParams(urlParams).toString();
    const apiUrl = `${process.env.API_URL || ''}/api/orders/me${searchQuery ? `?${searchQuery}` : ''}`;

    // Avant l'appel API
    logger.debug('Fetching orders from API', {
      requestId,
      url: apiUrl,
      retryAttempt,
      action: 'api_request_start',
    });

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

    // Tenter de récupérer le corps de la réponse, que ce soit JSON ou texte
    let responseBody;
    let isJsonResponse = true;
    let parseErrorMessage = null;

    try {
      responseBody = await res.json();
    } catch (parseError) {
      isJsonResponse = false;
      parseErrorMessage = parseError.message;
      logger.error('JSON parsing error in getAllOrders', {
        requestId,
        error: parseError.message,
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
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
          };

        case 401: // Unauthorized
          return {
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentification requise',
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
          };

        case 403: // Forbidden
          return {
            success: false,
            code: 'FORBIDDEN',
            message: 'Accès interdit',
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
          };

        case 404: // Not Found
          return {
            success: false,
            code: 'NOT_FOUND',
            message: 'Ressource non trouvée',
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
          };

        case 429: // Too Many Requests
          return {
            success: false,
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Trop de requêtes, veuillez réessayer plus tard',
            retryAfter: res.headers.get('Retry-After')
              ? parseInt(res.headers.get('Retry-After'))
              : 60,
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
          };

        case 500: // Internal Server Error
          return {
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Une erreur interne est survenue, veuillez réessayer ultérieurement',
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
          };

        case 503: // Service Unavailable
          return {
            success: false,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporairement indisponible',
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
          };

        case 504: // Gateway Timeout
          return {
            success: false,
            code: 'TIMEOUT',
            message: 'La requête a pris trop de temps',
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
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
            data: { orders: [], totalPages: 0, deliveryPrice: [] },
          };
      }
    }

    // Traitement de la réponse en cas de succès HTTP (200)
    if (isJsonResponse) {
      // Si JSON valide
      if (responseBody.success === true) {
        // Cas de succès API explicite
        logger.info('Successfully fetched orders', {
          requestId,
          orderCount: responseBody.data?.orders?.length || 0,
          action: 'api_success',
        });

        // Vérifier si des commandes sont présentes dans la réponse
        if (responseBody.data?.orders?.length > 0) {
          // Traitement des données pour masquer les informations sensibles
          const sanitizedOrders = responseBody.data.orders.map((order) => ({
            ...order,
            // Masquer les détails sensibles des informations de paiement
            paymentInfo: order.paymentInfo
              ? {
                  ...order.paymentInfo,
                  // Assurer que le numéro de compte est masqué
                  paymentAccountNumber:
                    order.paymentInfo.paymentAccountNumber?.includes('••••••')
                      ? order.paymentInfo.paymentAccountNumber
                      : '••••••' +
                        (order.paymentInfo.paymentAccountNumber?.slice(-4) ||
                          ''),
                }
              : order.paymentInfo,
          }));

          // Structurer la réponse
          const result = {
            success: true,
            message: responseBody.message || 'Commandes récupérées avec succès',
            data: {
              orders: sanitizedOrders,
              currentPage: responseBody.data.currentPage || 1,
              totalPages: responseBody.data.totalPages || 0,
              count: responseBody.data.count || sanitizedOrders.length,
              perPage: responseBody.data.perPage || 10,
              deliveryPrice: responseBody.data.deliveryPrice || [],
            },
          };

          // Nous supprimons l'enregistrement dans le cache, car l'API a déjà mis en cache les données
          // appCache.products.set(cacheKey, result, { ttl: 2 * 60 * 1000 });

          return result;
        } else {
          // Cas spécifique où aucune commande n'est trouvée mais la requête est réussie
          return {
            success: true,
            message:
              responseBody.message ||
              'Aucune commande ne correspond aux critères',
            data: {
              orders: [],
              totalPages: 0,
              currentPage: 1,
              count: 0,
              perPage: 10,
              deliveryPrice: responseBody.data?.deliveryPrice || [],
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
          data: { orders: [], totalPages: 0, deliveryPrice: [] },
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
            orders: Array.isArray(responseBody.data?.orders)
              ? responseBody.data.orders
              : [],
            totalPages: responseBody.data?.totalPages || 0,
            deliveryPrice: responseBody.data?.deliveryPrice || [],
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
        data: { orders: [], totalPages: 0, deliveryPrice: [] },
      };
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

    // Retourner une erreur typée en fonction de la nature de l'exception
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return {
        success: false,
        code: 'CLIENT_TIMEOUT',
        message:
          "La requête a été interrompue en raison d'un délai d'attente excessif",
        data: { orders: [], totalPages: 0, deliveryPrice: [] },
      };
    } else if (
      error.message.includes('network') ||
      error.message.includes('connection')
    ) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        message: 'Problème de connexion réseau',
        data: { orders: [], totalPages: 0, deliveryPrice: [] },
      };
    } else {
      return {
        success: false,
        code: 'CLIENT_ERROR',
        message:
          "Une erreur s'est produite lors de la récupération des commandes",
        errorDetails: error.message,
        data: { orders: [], totalPages: 0, deliveryPrice: [] },
      };
    }
  } finally {
    clearTimeout(timeoutId);
  }
};
