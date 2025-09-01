// helpers/validation/schemas/address.js
// Schémas de validation pour les adresses - Version simplifiée
// Aligné sur la structure des composants NewAddress/UpdateAddress

import * as yup from 'yup';
import { validationUtils } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';

/**
 * Schéma de validation d'adresse principal
 * Correspond exactement aux champs des composants NewAddress/UpdateAddress
 */
export const addressSchema = yup.object().shape({
  // Rue (obligatoire)
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
    ),

  // Ville (obligatoire)
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
    ),

  // Région/Département (obligatoire)
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
    ),

  // Code postal (optionnel mais validé si présent)
  zipCode: yup
    .string()
    .nullable()
    .transform((value, originalValue) => {
      // Transformer chaîne vide en null pour cohérence
      return originalValue === ''
        ? null
        : validationUtils.sanitizeString(value);
    })
    .test('valid-zipcode-format', 'Format de code postal invalide', (value) => {
      // Si pas de valeur, c'est valide (optionnel)
      if (!value) return true;

      // Vérifier le format : 2 à 5 chiffres
      const cleaned = value.replace(/\s/g, '');
      return /^[0-9]{2,5}$/.test(cleaned);
    }),

  // Complément d'adresse (optionnel)
  additionalInfo: yup
    .string()
    .nullable()
    .transform((value, originalValue) => {
      return originalValue === ''
        ? null
        : validationUtils.sanitizeString(value);
    })
    .max(
      100,
      'Les informations complémentaires ne peuvent pas dépasser 100 caractères',
    )
    .test(
      'no-sql-injection',
      "Format d'informations complémentaires non autorisé",
      validationUtils.noSqlInjection,
    ),

  // Pays (obligatoire)
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
    ),

  // Adresse par défaut (booléen)
  isDefault: yup.boolean().default(false),
});

/**
 * Schéma pour la sélection d'adresse (checkout)
 */
export const addressSelectionSchema = yup.object().shape({
  selectedAddressId: yup
    .string()
    .required('Veuillez sélectionner une adresse')
    .test(
      'is-valid-object-id',
      "Format d'identifiant d'adresse non valide",
      validationUtils.isValidObjectId,
    ),
});

// ==================== FONCTIONS DE VALIDATION ====================

/**
 * Validation principale d'adresse
 */
export const validateAddress = async (addressData) => {
  try {
    const validatedData = await validateWithLogging(
      addressSchema,
      addressData,
      { enableCache: true },
    );

    // Vérifications simples et pratiques
    const warnings = [];

    // Avertir si pas de code postal (pour l'expérience utilisateur)
    if (!validatedData.zipCode) {
      warnings.push('no_postal_code');
    }

    // Avertir si adresse très courte
    if (validatedData.street.length < 10) {
      warnings.push('short_address');
    }

    return {
      isValid: true,
      data: validatedData,
      warnings,
    };
  } catch (error) {
    console.warn('Erreur validation adresse:', error.message);

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Validation pour la sélection d'adresse
 */
export const validateAddressSelection = async (
  addressId,
  availableAddresses = [],
) => {
  try {
    // Validation du format
    const validatedSelection = await validateWithLogging(
      addressSelectionSchema,
      { selectedAddressId: addressId },
    );

    // Vérifier que l'adresse existe si on a la liste
    if (availableAddresses.length > 0) {
      const addressExists = availableAddresses.some(
        (address) => String(address._id) === String(addressId),
      );

      if (!addressExists) {
        throw new Error("L'adresse sélectionnée n'existe plus");
      }
    }

    return {
      isValid: true,
      addressId: validatedSelection.selectedAddressId,
    };
  } catch (error) {
    console.warn('Erreur sélection adresse:', error.message);

    return {
      isValid: false,
      error: error.message || 'Adresse sélectionnée non valide',
    };
  }
};

/**
 * Formatter une adresse pour l'affichage
 */
export const formatAddressDisplay = (address) => {
  if (!address) return '';

  const parts = [
    address.street,
    address.additionalInfo,
    `${address.city}, ${address.state}`,
    address.zipCode,
    address.country,
  ].filter((part) => part && part.trim());

  return parts.join('\n');
};

/**
 * Créer une adresse condensée pour les listes
 */
export const formatAddressShort = (address) => {
  if (!address) return '';

  return `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ', ' + address.zipCode : ''}, ${address.country}`;
};

/**
 * Vérifier si une adresse est complète pour la livraison
 */
export const isAddressComplete = (address) => {
  if (!address) return false;

  return !!(
    address.street?.trim() &&
    address.city?.trim() &&
    address.state?.trim() &&
    address.country?.trim()
  );
};
