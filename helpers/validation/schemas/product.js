// helpers/validation/schemas/product.js
// Schémas de validation simplifiés pour les produits et recherche

import * as yup from 'yup';
import { validationUtils } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';

/**
 * Schéma de validation pour la recherche de produits (basique)
 */
export const searchSchema = yup.object().shape({
  keyword: yup
    .string()
    .required('Veuillez saisir un nom de produit')
    .transform(validationUtils.sanitizeString)
    .min(2, 'Le nom du produit doit contenir au moins 2 caractères')
    .max(100, 'Le nom du produit ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z0-9\u00C0-\u017F\s.,'\-&()[\]]+$/,
      'Le nom du produit contient des caractères non autorisés',
    )
    .test(
      'no-sql-injection',
      'Le nom du produit contient des motifs non autorisés',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Le nom du produit contient des caractères non autorisés',
      validationUtils.noNoSqlInjection,
    ),
});

/**
 * Schéma de validation pour les prix minimum
 */
export const minPriceSchema = yup.object().shape({
  minPrice: yup
    .number()
    .nullable()
    .transform((value, originalValue) => {
      return originalValue === '' ? null : value;
    })
    .typeError('Le prix minimum doit être un nombre valide')
    .min(0, 'Le prix minimum doit être supérieur ou égal à 0')
    .max(999999, 'Le prix minimum ne peut pas dépasser 999 999€')
    .test(
      'valid-decimal-places',
      'Le prix minimum doit avoir au maximum 2 décimales',
      (value) => {
        if (value === null || value === undefined) return true;
        return Number(value.toFixed(2)) === value;
      },
    ),
});

/**
 * Schéma de validation pour les prix maximum
 */
export const maxPriceSchema = yup.object().shape({
  maxPrice: yup
    .number()
    .nullable()
    .transform((value, originalValue) => {
      return originalValue === '' ? null : value;
    })
    .typeError('Le prix maximum doit être un nombre valide')
    .min(0, 'Le prix maximum doit être supérieur ou égal à 0')
    .max(999999, 'Le prix maximum ne peut pas dépasser 999 999€')
    .test(
      'valid-decimal-places',
      'Le prix maximum doit avoir au maximum 2 décimales',
      (value) => {
        if (value === null || value === undefined) return true;
        return Number(value.toFixed(2)) === value;
      },
    )
    .test(
      'max-greater-than-min',
      'Le prix maximum doit être supérieur au prix minimum',
      function (value) {
        // Accéder au contexte parent pour obtenir minPrice
        const minPrice = this.parent.minPrice || this.options.context?.minPrice;
        if (value === null || minPrice === null || minPrice === undefined) {
          return true;
        }
        return value >= minPrice;
      },
    ),
});

/**
 * Schéma de validation pour les catégories
 */
export const categorySchema = yup.object().shape({
  category: yup
    .string()
    .nullable()
    .transform(validationUtils.sanitizeString)
    .test('valid-object-id', 'Identifiant de catégorie invalide', (value) => {
      if (!value) return true; // null/undefined sont autorisés
      return validationUtils.isValidObjectId(value);
    })
    .test(
      'no-sql-injection',
      'Format de catégorie non autorisé',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de catégorie non autorisé',
      validationUtils.noNoSqlInjection,
    ),
});

/**
 * Schéma de validation pour les filtres de prix combinés
 */
export const priceFiltersSchema = yup
  .object()
  .shape({
    min: minPriceSchema.fields.minPrice.nullable(),
    max: maxPriceSchema.fields.maxPrice.nullable(),
  })
  .test(
    'price-range-valid',
    'Le prix maximum doit être supérieur au prix minimum',
    function (values) {
      const { min, max } = values;
      if (
        min === null ||
        max === null ||
        min === undefined ||
        max === undefined
      ) {
        return true;
      }
      return max >= min;
    },
  );

/**
 * Schéma complet pour les filtres de recherche
 */
export const productFiltersSchema = yup.object().shape({
  keyword: searchSchema.fields.keyword.nullable(),
  category: categorySchema.fields.category,
  min: minPriceSchema.fields.minPrice,
  max: maxPriceSchema.fields.maxPrice,
  page: yup
    .number()
    .nullable()
    .transform((value, originalValue) => {
      return originalValue === '' ? null : value;
    })
    .integer('La page doit être un nombre entier')
    .min(1, 'La page doit être au moins 1')
    .max(1000, 'La page ne peut pas dépasser 1000')
    .default(1),
});

/**
 * Fonction de validation simplifiée pour la recherche
 */
export const validateProductSearch = async (searchData) => {
  try {
    const validatedData = await validateWithLogging(
      searchSchema,
      searchData,
      { enableCache: false }, // Pas de cache pour simplifier
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Product search validation failed', {
      error: error.message,
      keyword: searchData?.keyword?.substring(0, 20), // Log partiel pour la confidentialité
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Fonction de validation pour les filtres de prix
 */
export const validatePriceFilters = async (priceData, context = {}) => {
  try {
    // Ajouter le contexte pour les validations croisées
    const validatedData = await validateWithLogging(
      priceFiltersSchema,
      priceData,
      { context, enableCache: false },
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Price filters validation failed', {
      error: error.message,
      hasMin: !!priceData?.min,
      hasMax: !!priceData?.max,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Fonction de validation pour les catégories
 */
export const validateCategory = async (categoryData) => {
  try {
    const validatedData = await validateWithLogging(
      categorySchema,
      categoryData,
      { enableCache: false },
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Category validation failed', {
      error: error.message,
      categoryId: categoryData?.category,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Fonction de validation complète pour tous les filtres
 */
export const validateProductFilters = async (filtersData) => {
  try {
    // Nettoyer les valeurs vides
    const cleanedData = Object.fromEntries(
      Object.entries(filtersData).filter(
        ([_, value]) => value !== null && value !== undefined && value !== '',
      ),
    );

    const validatedData = await validateWithLogging(
      productFiltersSchema,
      cleanedData,
      { enableCache: false },
    );

    // Vérifications métier simples
    const warnings = [];

    // Avertir si recherche trop large
    if (
      !validatedData.keyword &&
      !validatedData.category &&
      !validatedData.min &&
      !validatedData.max
    ) {
      warnings.push('broad_search');
    }

    // Avertir si plage de prix très large
    if (validatedData.min === 0 && validatedData.max >= 100000) {
      warnings.push('very_broad_price_range');
    }

    return {
      isValid: true,
      data: validatedData,
      warnings,
    };
  } catch (error) {
    console.warn('Product filters validation failed', {
      error: error.message,
      filtersCount: Object.keys(filtersData).length,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Schéma simple pour les avis produits (si nécessaire)
 */
export const productReviewSchema = yup.object().shape({
  rating: yup
    .number()
    .required('La note est requise')
    .min(1, 'La note minimum est 1')
    .max(5, 'La note maximum est 5')
    .integer('La note doit être un nombre entier'),

  title: yup
    .string()
    .required("Le titre de l'avis est requis")
    .transform(validationUtils.sanitizeString)
    .min(5, 'Le titre doit contenir au moins 5 caractères')
    .max(100, 'Le titre ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z0-9\u00C0-\u017F\s.,!?'\-()]+$/,
      'Le titre contient des caractères non autorisés',
    )
    .test(
      'no-sql-injection',
      'Format de titre non autorisé',
      validationUtils.noSqlInjection,
    ),

  comment: yup
    .string()
    .required('Le commentaire est requis')
    .transform(validationUtils.sanitizeString)
    .min(10, 'Le commentaire doit contenir au moins 10 caractères')
    .max(500, 'Le commentaire ne peut pas dépasser 500 caractères')
    .test(
      'no-sql-injection',
      'Format de commentaire non autorisé',
      validationUtils.noSqlInjection,
    ),

  wouldRecommend: yup.boolean().nullable(),
});

/**
 * Fonction de validation pour les avis produits
 */
export const validateProductReview = async (reviewData) => {
  try {
    const validatedData = await validateWithLogging(
      productReviewSchema,
      reviewData,
      { enableCache: false },
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Product review validation failed', {
      error: error.message,
      rating: reviewData?.rating,
      titleLength: reviewData?.title?.length || 0,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};
