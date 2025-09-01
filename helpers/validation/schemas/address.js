// helpers/validation/schemas/address.js
// Schémas de validation pour les adresses de livraison

import * as yup from 'yup';
import { validationUtils } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';
import { captureException } from '@/monitoring/sentry';

/**
 * Schéma de validation d'adresse principal
 */
export const addressSchema = yup
  .object()
  .shape({
    street: yup
      .string()
      .transform(validationUtils.sanitizeString)
      .required("L'adresse est obligatoire")
      .min(3, "L'adresse doit contenir au moins 3 caractères")
      .max(100, "L'adresse ne peut pas dépasser 100 caractères")
      .matches(
        /^[a-zA-Z0-9\s,.'°-]+$/,
        "L'adresse contient des caractères non autorisés",
      )
      .test(
        'no-sql-injection',
        "Format d'adresse non autorisé",
        validationUtils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        "Format d'adresse non autorisé",
        validationUtils.noNoSqlInjection,
      ),

    additionalInfo: yup
      .string()
      .transform(validationUtils.sanitizeString)
      .nullable()
      .max(
        100,
        'Les informations complémentaires ne peuvent pas dépasser 100 caractères',
      )
      .test(
        'no-sql-injection',
        "Format d'informations complémentaires non autorisé",
        validationUtils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        "Format d'informations complémentaires non autorisé",
        validationUtils.noNoSqlInjection,
      ),

    city: yup
      .string()
      .transform(validationUtils.sanitizeString)
      .required('La ville est obligatoire')
      .min(2, 'Le nom de la ville doit contenir au moins 2 caractères')
      .max(50, 'Le nom de la ville ne peut pas dépasser 50 caractères')
      .matches(
        /^[a-zA-Z\s'\-\u00C0-\u017F]+$/,
        'Le nom de la ville contient des caractères non autorisés',
      )
      .test(
        'no-sql-injection',
        'Format de ville non autorisé',
        validationUtils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        'Format de ville non autorisé',
        validationUtils.noNoSqlInjection,
      ),

    state: yup
      .string()
      .transform(validationUtils.sanitizeString)
      .required('La région/département est obligatoire')
      .min(2, 'Le nom de la région doit contenir au moins 2 caractères')
      .max(50, 'Le nom de la région ne peut pas dépasser 50 caractères')
      .matches(
        /^[a-zA-Z\s'\-\u00C0-\u017F]+$/,
        'Le nom de la région contient des caractères non autorisés',
      )
      .test(
        'no-sql-injection',
        'Format de région non autorisé',
        validationUtils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        'Format de région non autorisé',
        validationUtils.noNoSqlInjection,
      ),

    zipCode: yup
      .string()
      .transform(validationUtils.sanitizeString)
      .required('Le code postal est obligatoire')
      .test('is-valid-zip', 'Format de code postal invalide', (value) => {
        if (!value) return false;
        const cleaned = value.replace(/\s/g, '');
        // Support des codes postaux internationaux
        return /^[0-9A-Z]{2,10}$/i.test(cleaned);
      })
      .test(
        'no-sql-injection',
        'Format de code postal non autorisé',
        validationUtils.noSqlInjection,
      ),

    country: yup
      .string()
      .transform(validationUtils.sanitizeString)
      .required('Le pays est obligatoire')
      .min(2, 'Le nom du pays doit contenir au moins 2 caractères')
      .max(50, 'Le nom du pays ne peut pas dépasser 50 caractères')
      .matches(
        /^[a-zA-Z\s'\-\u00C0-\u017F]+$/,
        'Le nom du pays contient des caractères non autorisés',
      )
      .test(
        'no-sql-injection',
        'Format de pays non autorisé',
        validationUtils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        'Format de pays non autorisé',
        validationUtils.noNoSqlInjection,
      ),

    isDefault: yup.boolean().default(false),

    // Champs optionnels pour adresses enrichies
    label: yup
      .string()
      .nullable()
      .transform(validationUtils.sanitizeString)
      .max(30, 'Le libellé ne peut pas dépasser 30 caractères')
      .matches(
        /^[a-zA-Z0-9\s\-_\u00C0-\u017F]*$/,
        'Le libellé contient des caractères non autorisés',
      ),

    phone: yup
      .string()
      .nullable()
      .transform(validationUtils.sanitizeString)
      .matches(
        /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/,
        'Format de numéro de téléphone invalide',
      )
      .test(
        'is-valid-phone',
        'Le numéro de téléphone doit être valide',
        (value) => !value || validationUtils.isValidPhone(value),
      ),

    instructions: yup
      .string()
      .nullable()
      .transform(validationUtils.sanitizeString)
      .max(200, 'Les instructions ne peuvent pas dépasser 200 caractères')
      .test(
        'no-sql-injection',
        "Format d'instructions non autorisé",
        validationUtils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        "Format d'instructions non autorisé",
        validationUtils.noNoSqlInjection,
      ),
  })
  .noUnknown(true, 'Champs inconnus non autorisés')
  .strict();

/**
 * Schéma pour la sélection d'adresse de livraison
 */
export const shippingAddressSelectionSchema = yup.object().shape({
  shippingAddress: yup
    .string()
    .transform(validationUtils.sanitizeString)
    .required('Veuillez sélectionner une adresse de livraison')
    .test(
      'is-valid-object-id',
      "Format d'identifiant d'adresse non valide",
      validationUtils.isValidObjectId,
    )
    .test(
      'no-sql-injection',
      "Format d'identifiant non autorisé",
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      "Format d'identifiant non autorisé",
      validationUtils.noNoSqlInjection,
    ),
});

/**
 * Schéma de validation pour la mise à jour d'adresse
 */
export const addressUpdateSchema = addressSchema.concat(
  yup.object().shape({
    _id: yup
      .string()
      .required("ID de l'adresse requis pour la mise à jour")
      .test(
        'is-valid-object-id',
        "Format d'ID d'adresse non valide",
        validationUtils.isValidObjectId,
      ),
  }),
);

/**
 * Schéma pour la validation d'adresses en lot
 */
export const batchAddressSchema = yup.object().shape({
  addresses: yup
    .array()
    .of(addressSchema)
    .min(1, 'Au moins une adresse est requise')
    .max(10, 'Maximum 10 adresses par lot')
    .test(
      'unique-labels',
      "Les libellés d'adresse doivent être uniques",
      (addresses) => {
        if (!addresses) return true;
        const labels = addresses
          .map((addr) => addr.label)
          .filter((label) => label && label.trim());
        return new Set(labels).size === labels.length;
      },
    )
    .test(
      'max-one-default',
      'Une seule adresse peut être par défaut',
      (addresses) => {
        if (!addresses) return true;
        const defaultAddresses = addresses.filter((addr) => addr.isDefault);
        return defaultAddresses.length <= 1;
      },
    ),
});

/**
 * Dictionnaire des pays et codes postaux supportés
 */
const COUNTRY_POSTAL_PATTERNS = {
  France: /^[0-9]{5}$/,
  Belgique: /^[0-9]{4}$/,
  Suisse: /^[0-9]{4}$/,
  Canada: /^[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]$/i,
  'États-Unis': /^[0-9]{5}(-[0-9]{4})?$/,
  'Royaume-Uni': /^[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s?[0-9][A-Z]{2}$/i,
  Allemagne: /^[0-9]{5}$/,
  Espagne: /^[0-9]{5}$/,
  Italie: /^[0-9]{5}$/,
};

/**
 * Validation d'adresse avec vérifications géographiques
 */
export const validateAddress = async (addressData, options = {}) => {
  try {
    const validatedData = await validateWithLogging(
      addressSchema,
      addressData,
      { enableCache: true, ...options },
    );

    // Vérifications géographiques avancées
    const warnings = [];
    const { country, zipCode, city, state } = validatedData;

    // Validation du code postal selon le pays
    if (COUNTRY_POSTAL_PATTERNS[country]) {
      const pattern = COUNTRY_POSTAL_PATTERNS[country];
      if (!pattern.test(zipCode.replace(/\s/g, ''))) {
        warnings.push('postal_code_format_warning');
      }
    }

    // Détection d'incohérences géographiques simples
    const cityLower = city.toLowerCase();
    const stateLower = state.toLowerCase();

    // Quelques vérifications de base pour la France
    if (country === 'France') {
      // Paris doit être dans la région Île-de-France
      if (
        cityLower.includes('paris') &&
        !stateLower.includes('île-de-france')
      ) {
        warnings.push('geographic_inconsistency');
      }

      // Marseille doit être dans les Bouches-du-Rhône
      if (
        cityLower.includes('marseille') &&
        !stateLower.includes('bouches-du-rhône')
      ) {
        warnings.push('geographic_inconsistency');
      }
    }

    // Vérification de la cohérence du code postal (France)
    if (country === 'France' && /^[0-9]{5}$/.test(zipCode)) {
      const dept = zipCode.substring(0, 2);

      // Départements spéciaux
      const specialDepts = {
        75: ['paris'],
        13: ['marseille'],
        69: ['lyon'],
        31: ['toulouse'],
        '06': ['nice', 'cannes', 'antibes'],
      };

      if (specialDepts[dept]) {
        const expectedCities = specialDepts[dept];
        if (
          !expectedCities.some((expectedCity) =>
            cityLower.includes(expectedCity),
          )
        ) {
          warnings.push('postal_city_mismatch');
        }
      }
    }

    // Analyse de la qualité de l'adresse
    const qualityScore = calculateAddressQuality(validatedData);

    return {
      isValid: true,
      data: validatedData,
      warnings,
      quality: {
        score: qualityScore,
        level: getQualityLevel(qualityScore),
      },
    };
  } catch (error) {
    console.warn('Address validation failed', {
      error: error.message,
      country: addressData.country,
      hasZipCode: !!addressData.zipCode,
    });

    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'Address', action: 'validateAddress' },
        extra: {
          country: addressData.country,
          fields: Object.keys(addressData),
        },
      });
    }

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Calcul de la qualité d'une adresse
 */
function calculateAddressQuality(address) {
  let score = 0;

  // Champs obligatoires (50 points)
  const requiredFields = ['street', 'city', 'state', 'zipCode', 'country'];
  const completedRequired = requiredFields.filter(
    (field) => address[field] && address[field].trim(),
  ).length;
  score += (completedRequired / requiredFields.length) * 50;

  // Champs optionnels enrichissants (30 points)
  if (address.additionalInfo?.trim()) score += 10;
  if (address.phone?.trim()) score += 10;
  if (address.instructions?.trim()) score += 10;

  // Qualité des données (20 points)
  if (address.label?.trim()) score += 5;

  // Longueur appropriée de l'adresse
  if (address.street.length >= 10 && address.street.length <= 80) score += 5;

  // Ville avec une longueur raisonnable
  if (address.city.length >= 3 && address.city.length <= 30) score += 5;

  // Code postal valide selon le pattern du pays
  if (COUNTRY_POSTAL_PATTERNS[address.country]) {
    const pattern = COUNTRY_POSTAL_PATTERNS[address.country];
    if (pattern.test(address.zipCode.replace(/\s/g, ''))) score += 5;
  } else {
    // Score par défaut si pas de pattern spécifique
    score += 3;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Détermine le niveau de qualité d'une adresse
 */
function getQualityLevel(score) {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'average';
  if (score >= 40) return 'poor';
  return 'incomplete';
}

/**
 * Validation de sélection d'adresse de livraison
 */
export const validateShippingAddressSelection = async (
  addressId,
  availableAddresses = [],
) => {
  try {
    // Validation du format de l'ID
    await validateWithLogging(shippingAddressSelectionSchema, {
      shippingAddress: addressId,
    });

    // Vérifier que l'adresse existe dans la liste disponible
    if (availableAddresses.length > 0) {
      const addressExists = availableAddresses.some(
        (address) => String(address._id) === String(addressId),
      );

      if (!addressExists) {
        throw new Error(
          "L'adresse sélectionnée n'existe pas dans votre liste d'adresses",
        );
      }

      // Récupérer l'adresse sélectionnée pour validation supplémentaire
      const selectedAddress = availableAddresses.find(
        (address) => String(address._id) === String(addressId),
      );

      // Vérifier que l'adresse est complète
      const addressValidation = await validateAddress(selectedAddress);
      if (!addressValidation.isValid) {
        return {
          isValid: false,
          error: "L'adresse sélectionnée est incomplète ou invalide",
          addressErrors: addressValidation.errors,
        };
      }
    }

    return {
      isValid: true,
      addressId,
      selectedAddress: availableAddresses.find(
        (addr) => String(addr._id) === String(addressId),
      ),
    };
  } catch (error) {
    console.warn('Address selection validation failed', {
      error: error.message,
      addressId,
      availableCount: availableAddresses.length,
    });

    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'Shipping', action: 'validateAddressSelection' },
        extra: { addressId, availableCount: availableAddresses.length },
      });
    }

    return {
      isValid: false,
      error: error.message || 'Adresse de livraison non valide',
    };
  }
};

/**
 * Validation d'adresses en lot
 */
export const validateAddressBatch = async (addressBatch) => {
  try {
    const validatedData = await validateWithLogging(
      batchAddressSchema,
      addressBatch,
    );

    // Validation individuelle de chaque adresse
    const results = [];
    const errors = [];

    for (let i = 0; i < validatedData.addresses.length; i++) {
      const address = validatedData.addresses[i];
      const validation = await validateAddress(address, { enableCache: true });

      if (validation.isValid) {
        results.push({
          index: i,
          data: validation.data,
          quality: validation.quality,
          warnings: validation.warnings,
        });
      } else {
        errors.push({
          index: i,
          errors: validation.errors,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      results,
      errors,
      summary: {
        total: validatedData.addresses.length,
        valid: results.length,
        invalid: errors.length,
        averageQuality:
          results.length > 0
            ? results.reduce((sum, r) => sum + r.quality.score, 0) /
              results.length
            : 0,
      },
    };
  } catch (error) {
    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};
