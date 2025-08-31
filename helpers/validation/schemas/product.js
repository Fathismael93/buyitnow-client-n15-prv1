// helpers/validation/schemas/product.js
// Schémas de validation pour les produits et recherche

import * as yup from 'yup';
import { validationUtils, REGEX } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';

/**
 * Schéma de validation pour la recherche de produits
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
      'Le nom du produit contient des caractères non autorisés pour MongoDB',
      validationUtils.noNoSqlInjection,
    )
    .test(
      'no-consecutive-special-chars',
      'Le nom du produit contient trop de caractères spéciaux consécutifs',
      (value) => {
        if (!value) return true;
        return !/[^\w\s]{3,}/.test(value);
      },
    ),
});

/**
 * Schéma de validation pour les filtres de recherche avancée
 */
export const advancedSearchSchema = searchSchema.concat(
  yup.object().shape({
    minPrice: yup
      .number()
      .nullable()
      .transform((value, originalValue) => {
        return originalValue === '' ? null : value;
      })
      .typeError('Le prix minimum doit être un nombre valide')
      .test(
        'is-positive-or-zero',
        'Le prix minimum doit être supérieur ou égal à 0',
        (value) => value === null || value >= 0,
      )
      .test(
        'is-finite-number',
        'Le prix minimum doit être un nombre fini',
        (value) =>
          value === null || (Number.isFinite(value) && value <= 999999999),
      )
      .test(
        'is-valid-price-format',
        'Le prix minimum doit avoir au maximum 2 décimales',
        (value) => value === null || /^\d+(\.\d{1,2})?$/.test(String(value)),
      ),

    maxPrice: yup
      .number()
      .nullable()
      .transform((value, originalValue) => {
        return originalValue === '' ? null : value;
      })
      .typeError('Le prix maximum doit être un nombre valide')
      .test(
        'is-positive-or-zero',
        'Le prix maximum doit être supérieur ou égal à 0',
        (value) => value === null || value >= 0,
      )
      .test(
        'is-finite-number',
        'Le prix maximum doit être un nombre fini',
        (value) =>
          value === null || (Number.isFinite(value) && value <= 999999999),
      )
      .test(
        'is-valid-price-format',
        'Le prix maximum doit avoir au maximum 2 décimales',
        (value) => value === null || /^\d+(\.\d{1,2})?$/.test(String(value)),
      )
      .test(
        'max-greater-than-min',
        'Le prix maximum doit être supérieur au prix minimum',
        function (value) {
          const { minPrice } = this.parent;
          if (value === null || minPrice === null) return true;
          return value >= minPrice;
        },
      ),

    brand: yup
      .string()
      .nullable()
      .transform(validationUtils.sanitizeString)
      .max(50, 'Le nom de marque ne peut pas dépasser 50 caractères')
      .matches(
        /^[a-zA-Z0-9\u00C0-\u017F\s.\-&]+$/,
        'Le nom de marque contient des caractères non autorisés',
      )
      .test(
        'no-sql-injection',
        'Format de marque non autorisé',
        validationUtils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        'Format de marque non autorisé',
        validationUtils.noNoSqlInjection,
      ),

    inStock: yup.boolean().nullable(),

    onSale: yup.boolean().nullable(),

    rating: yup
      .number()
      .nullable()
      .min(1, 'La note minimum est 1')
      .max(5, 'La note maximum est 5')
      .integer('La note doit être un nombre entier'),
  }),
);

/**
 * Schéma de validation pour les catégories
 */
export const categorySchema = yup.object().shape({
  value: yup
    .string()
    .required('La catégorie est requise')
    .trim()
    .test(
      'is-valid-object-id',
      'Identifiant de catégorie invalide',
      validationUtils.isValidObjectId,
    )
    .test('no-injection', 'Format de catégorie non autorisé', (value) => {
      if (!value) return true;
      const dangerousPatterns = [/\$/, /\.\./, /\{.*\:.*\}/, /\[.*\]/];
      return !dangerousPatterns.some((pattern) => pattern.test(value));
    })
    .transform((value) => (value ? value.toLowerCase() : value)),
});

/**
 * Schéma pour les filtres de prix séparés (compatibilité)
 */
export const minPriceSchema = yup.object().shape({
  minPrice: yup
    .number()
    .nullable()
    .transform((value, originalValue) => {
      return originalValue === '' ? null : value;
    })
    .typeError('Le prix minimum doit être un nombre valide')
    .test(
      'is-positive-or-zero',
      'Le prix minimum doit être supérieur ou égal à 0',
      (value) => value === null || value >= 0,
    )
    .test(
      'is-finite-number',
      'Le prix minimum doit être un nombre fini',
      (value) =>
        value === null || (Number.isFinite(value) && value <= 999999999),
    )
    .test(
      'is-valid-price-format',
      'Le prix minimum doit avoir au maximum 2 décimales',
      (value) => value === null || /^\d+(\.\d{1,2})?$/.test(String(value)),
    ),
});

export const maxPriceSchema = yup.object().shape({
  maxPrice: yup
    .number()
    .nullable()
    .transform((value, originalValue) => {
      return originalValue === '' ? null : value;
    })
    .typeError('Le prix maximum doit être un nombre valide')
    .test(
      'is-positive-or-zero',
      'Le prix maximum doit être supérieur ou égal à 0',
      (value) => value === null || value >= 0,
    )
    .test(
      'is-finite-number',
      'Le prix maximum doit être un nombre fini',
      (value) =>
        value === null || (Number.isFinite(value) && value <= 999999999),
    )
    .test(
      'is-valid-price-format',
      'Le prix maximum doit avoir au maximum 2 décimales',
      (value) => value === null || /^\d+(\.\d{1,2})?$/.test(String(value)),
    ),
});

/**
 * Schéma de validation pour la pagination
 */
export const pageSchema = yup.object().shape({
  page: yup
    .number()
    .typeError('La page doit être un nombre')
    .positive('La page doit être positive')
    .integer('La page doit être un entier')
    .max(1000, 'La page ne peut pas dépasser 1000')
    .default(1),

  limit: yup
    .number()
    .typeError('La limite doit être un nombre')
    .positive('La limite doit être positive')
    .integer('La limite doit être un entier')
    .min(1, 'La limite minimum est 1')
    .max(100, 'La limite maximum est 100')
    .default(20),
});

/**
 * Schéma de validation pour le tri
 */
export const sortSchema = yup.object().shape({
  sortBy: yup
    .string()
    .oneOf(
      ['name', 'price', 'rating', 'createdAt', 'popularity', 'discount'],
      'Critère de tri non valide',
    )
    .default('createdAt'),

  sortOrder: yup
    .string()
    .oneOf(['asc', 'desc'], 'Ordre de tri non valide')
    .default('desc'),
});

/**
 * Schéma complet pour les requêtes de produits
 */
export const productQuerySchema = yup.object().shape({
  // Recherche de base
  ...searchSchema.fields,

  // Filtres avancés
  category: categorySchema.fields.value.nullable(),
  minPrice: minPriceSchema.fields.minPrice,
  maxPrice: maxPriceSchema.fields.maxPrice,
  brand: advancedSearchSchema.fields.brand,
  inStock: advancedSearchSchema.fields.inStock,
  onSale: advancedSearchSchema.fields.onSale,
  rating: advancedSearchSchema.fields.rating,

  // Pagination et tri
  ...pageSchema.fields,
  ...sortSchema.fields,
});

/**
 * Schéma de validation pour l'évaluation de produits
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
    )
    .test(
      'no-nosql-injection',
      'Format de titre non autorisé',
      validationUtils.noNoSqlInjection,
    ),

  comment: yup
    .string()
    .required('Le commentaire est requis')
    .transform(validationUtils.sanitizeString)
    .min(10, 'Le commentaire doit contenir au moins 10 caractères')
    .max(1000, 'Le commentaire ne peut pas dépasser 1000 caractères')
    .test(
      'no-sql-injection',
      'Format de commentaire non autorisé',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de commentaire non autorisé',
      validationUtils.noNoSqlInjection,
    )
    .test(
      'no-excessive-caps',
      "Évitez d'utiliser trop de majuscules",
      (value) => {
        if (!value) return true;
        const uppercaseRatio =
          value
            .replace(/[^a-zA-Z]/g, '')
            .split('')
            .filter((char) => char === char.toUpperCase()).length /
          value.replace(/[^a-zA-Z]/g, '').length;
        return uppercaseRatio <= 0.7;
      },
    ),

  wouldRecommend: yup.boolean().nullable(),

  verifiedPurchase: yup.boolean().default(false),
});

/**
 * Schéma de validation pour les listes de souhaits
 */
export const wishlistSchema = yup.object().shape({
  name: yup
    .string()
    .required('Le nom de la liste est requis')
    .transform(validationUtils.sanitizeString)
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(50, 'Le nom ne peut pas dépasser 50 caractères')
    .matches(
      /^[a-zA-Z0-9\u00C0-\u017F\s.\-_]+$/,
      'Le nom contient des caractères non autorisés',
    )
    .test(
      'no-sql-injection',
      'Format de nom non autorisé',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de nom non autorisé',
      validationUtils.noNoSqlInjection,
    ),

  description: yup
    .string()
    .nullable()
    .transform(validationUtils.sanitizeString)
    .max(200, 'La description ne peut pas dépasser 200 caractères')
    .test(
      'no-sql-injection',
      'Format de description non autorisé',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de description non autorisé',
      validationUtils.noNoSqlInjection,
    ),

  isPublic: yup.boolean().default(false),

  products: yup
    .array()
    .of(
      yup
        .string()
        .test(
          'is-valid-object-id',
          'ID de produit invalide',
          validationUtils.isValidObjectId,
        ),
    )
    .max(100, 'Une liste ne peut pas contenir plus de 100 produits'),
});

/**
 * Fonction de validation de recherche avec optimisations
 */
export const validateProductSearch = async (searchData) => {
  try {
    const validatedData = await validateWithLogging(
      productQuerySchema,
      searchData,
      { enableCache: true },
    );

    // Optimisations et nettoyage
    const optimizedData = {
      ...validatedData,
      // Nettoyer les valeurs nulles pour éviter les requêtes inutiles
      ...Object.fromEntries(
        Object.entries(validatedData).filter(([_, value]) => value !== null),
      ),
    };

    // Avertissements pour les recherches potentiellement lentes
    const warnings = [];

    if (!optimizedData.category && !optimizedData.keyword) {
      warnings.push('broad_search_warning');
    }

    if (optimizedData.minPrice === 0 && optimizedData.maxPrice >= 1000000) {
      warnings.push('price_range_too_broad');
    }

    return {
      isValid: true,
      data: optimizedData,
      warnings,
    };
  } catch (error) {
    console.warn('Product search validation failed', {
      error: error.message,
      fields: Object.keys(searchData),
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Validation d'évaluation de produit avec détection de spam
 */
// export const validateProductReview = async (reviewData) => {
//   try {
//     const validatedData = await validateWithLogging(productReviewSchema, reviewData);

//     // Analyse anti-spam
//     const spamFlags = [];
//     const { title, comment } = validatedData;
//     const combinedText = `${title} ${comment}`.toLowerCase();

//     // Détection de mots-clés de spam
//     const spamKeywords = [
//       'buy now', 'click here', 'free money', 'guaranteed',
//       'no risk', 'limited time', 'act now', 'discount'
//     ];

//     const spamScore = spamKeywords.reduce(
//       (score, keyword) => score + (combinedText.includes(keyword) ? 1 : 0), 0
//     );

//     if (spamScore >= 2) spamFlags.push('high_spam_keywords');

//     // Détection de répétition excessive
//     const words = combinedText.split(/\s+/);
//     const wordCount = {};
//     words.forEach(word => {
//       if (word.length > 3) {
//         wordCount[word] = (wordCount[word] || 0) + 1;
//       }
//     });

//     const maxRepeats = Math.max(...Object.values(wordCount));
//     if (maxRepeats > 5) spamFlags.push('excessive_word_repetition');

//     // Détection de caractères répétés
//     if (/(.)\1{4,}/.test(combinedText)) spamFlags.push('repeated_characters');

//     return {
//       isValid: true,
//       data: validatedData,
//       spamFlags,
//       spamScore,
//     };
//   } catch (error) {
