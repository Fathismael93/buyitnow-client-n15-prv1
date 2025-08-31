// helpers/validation/core/utils.js
// Utilitaires de validation partagés

import { captureException } from '@/monitoring/sentry';
import { PERFORMANCE_LIMITS } from './constants';

/**
 * Cache de validation pour améliorer les performances
 */
const validationCache = new Map();

/**
 * Wrapper principal pour la validation avec logging et cache
 */
export const validateWithLogging = async (schema, data, options = {}) => {
  const startTime = Date.now();

  try {
    // Vérification des limites de performance
    checkPerformanceLimits(data);

    // Générer une clé de cache si activé
    const cacheKey = options.enableCache
      ? generateCacheKey(schema, data)
      : null;

    // Vérifier le cache
    if (cacheKey && validationCache.has(cacheKey)) {
      return validationCache.get(cacheKey);
    }

    // Validation
    const result = await schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      ...options,
    });

    // Mettre en cache si activé
    if (cacheKey) {
      validationCache.set(cacheKey, result);

      // Limiter la taille du cache
      if (validationCache.size > PERFORMANCE_LIMITS.CACHE_SIZE) {
        const firstKey = validationCache.keys().next().value;
        validationCache.delete(firstKey);
      }
    }

    return result;
  } catch (error) {
    const validationTime = Date.now() - startTime;

    // Log des performances si validation lente
    if (validationTime > PERFORMANCE_LIMITS.MAX_VALIDATION_TIME) {
      console.warn('Slow validation detected', {
        time: validationTime,
        dataSize: JSON.stringify(data).length,
        schemaType: schema.type || 'unknown',
      });
    }

    // Gestion des erreurs
    if (error.name === 'ValidationError') {
      console.warn('Validation error', {
        errors: error.errors,
        time: validationTime,
        fields: Object.keys(data).filter(
          (key) => !key.toLowerCase().includes('password'),
        ),
      });
    } else {
      // Erreur système - capturer avec Sentry
      captureException(error, {
        tags: {
          component: 'validation',
          performance_issue:
            validationTime > PERFORMANCE_LIMITS.MAX_VALIDATION_TIME,
        },
        extra: {
          schemaName: schema.describe?.()?.meta?.name || 'unknown',
          validationTime,
          dataSize: JSON.stringify(data).length,
        },
      });
    }

    throw error;
  }
};

/**
 * Vérification des limites de performance
 */
function checkPerformanceLimits(data) {
  const dataString = JSON.stringify(data);

  if (dataString.length > PERFORMANCE_LIMITS.MAX_STRING_LENGTH) {
    throw new Error(`Validation data too large: ${dataString.length} bytes`);
  }

  // Vérifier les tableaux
  for (const [key, value] of Object.entries(data)) {
    if (
      Array.isArray(value) &&
      value.length > PERFORMANCE_LIMITS.MAX_ARRAY_LENGTH
    ) {
      throw new Error(`Array ${key} too large: ${value.length} items`);
    }
  }
}

/**
 * Génération de clé de cache pour la validation
 */
function generateCacheKey(schema, data) {
  try {
    const schemaHash = schema.describe
      ? JSON.stringify(schema.describe()).slice(0, 100)
      : 'unknown-schema';

    const dataHash = JSON.stringify(data, (key, value) => {
      // Exclure les mots de passe du cache pour sécurité
      if (key.toLowerCase().includes('password')) return '[EXCLUDED]';
      return value;
    });

    return `${schemaHash}-${dataHash}`;
  } catch (error) {
    // Si impossible de générer la clé, désactiver le cache
    return null;
  }
}

/**
 * Validation batch pour traiter plusieurs éléments
 */
export const validateBatch = async (schema, dataArray, options = {}) => {
  const { concurrent = 5, stopOnFirstError = false } = options;

  const results = [];
  const errors = [];

  // Traitement par batch pour éviter la surcharge
  for (let i = 0; i < dataArray.length; i += concurrent) {
    const batch = dataArray.slice(i, i + concurrent);

    const batchPromises = batch.map(async (data, index) => {
      try {
        const result = await validateWithLogging(schema, data, options);
        return { index: i + index, data: result };
      } catch (error) {
        const errorInfo = { index: i + index, error };
        if (stopOnFirstError) throw errorInfo;
        return errorInfo;
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.error) {
          errors.push(result.value);
        } else {
          results.push(result.value);
        }
      } else {
        errors.push({
          index: -1,
          error: result.reason,
        });
      }
    });
  }

  return { results, errors };
};

/**
 * Validation avec retry pour les cas instables
 */
export const validateWithRetry = async (schema, data, options = {}) => {
  const { maxRetries = 3, retryDelay = 100 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await validateWithLogging(schema, data, options);
    } catch (error) {
      // Retry seulement pour les erreurs système, pas de validation
      if (error.name === 'ValidationError' || attempt === maxRetries) {
        throw error;
      }

      console.warn(`Validation attempt ${attempt} failed, retrying...`, {
        error: error.message,
        nextAttemptIn: retryDelay * attempt,
      });

      // Délai exponentiel
      await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
    }
  }
};

/**
 * Métriques de performance de validation
 */
export const getValidationMetrics = () => {
  return {
    cacheSize: validationCache.size,
    cacheLimit: PERFORMANCE_LIMITS.CACHE_SIZE,
    cacheUtilization:
      (validationCache.size / PERFORMANCE_LIMITS.CACHE_SIZE) * 100,
  };
};

/**
 * Nettoyage du cache de validation
 */
export const clearValidationCache = () => {
  const previousSize = validationCache.size;
  validationCache.clear();

  console.info('Validation cache cleared', {
    clearedEntries: previousSize,
  });

  return previousSize;
};

/**
 * Formatage standardisé des erreurs de validation
 */
export const formatValidationErrors = (error) => {
  const formattedErrors = {};

  if (error.inner?.length) {
    error.inner.forEach((err) => {
      formattedErrors[err.path] = err.message;
    });
  } else if (error.path && error.message) {
    formattedErrors[error.path] = error.message;
  } else {
    formattedErrors.general = error.message || 'Unknown validation error';
  }

  return formattedErrors;
};

/**
 * Validation conditionnelle basée sur des règles métier
 */
export const createConditionalSchema = (baseSchema, conditions) => {
  return baseSchema.when(conditions.field, {
    is: conditions.value,
    then: conditions.thenSchema,
    otherwise: conditions.otherwiseSchema || baseSchema,
  });
};
