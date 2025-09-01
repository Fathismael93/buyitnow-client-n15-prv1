// helpers/validation/schemas/user.js
// Schémas de validation pour les profils utilisateur

import * as yup from 'yup';
import { validationUtils, REGEX } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';

/**
 * Schéma de validation de profil utilisateur (basé sur UpdateProfile.jsx)
 */
export const profileSchema = yup
  .object()
  .shape({
    name: yup
      .string()
      .transform(validationUtils.sanitizeString)
      .required('Le nom est obligatoire')
      .min(2, 'Le nom doit contenir au moins 2 caractères')
      .max(100, 'Le nom ne peut pas dépasser 100 caractères')
      .matches(REGEX.SAFE_NAME, 'Le nom contient des caractères non autorisés')
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

    phone: yup
      .string()
      .transform(validationUtils.sanitizeString)
      .required('Le numéro de téléphone est obligatoire')
      .matches(REGEX.PHONE, 'Format de numéro de téléphone invalide')
      .test(
        'is-valid-phone',
        'Le numéro de téléphone doit être valide',
        validationUtils.isValidPhone,
      ),

    avatar: yup
      .object()
      .nullable()
      .shape({
        public_id: yup
          .string()
          .nullable()
          .test(
            'valid-cloudinary-id',
            'ID Cloudinary invalide',
            (value) => !value || value.startsWith('buyitnow/avatars/'),
          ),
        url: yup
          .string()
          .nullable()
          .url("URL d'avatar invalide")
          .test(
            'secure-url',
            'URL non sécurisée',
            (value) => !value || value.startsWith('https://'),
          ),
      })
      .default(null),
  })
  .noUnknown(true, 'Champs inconnus non autorisés')
  .strict();

/**
 * Schéma de validation pour la vérification d'email
 */
export const emailVerificationSchema = yup.object().shape({
  token: yup
    .string()
    .required('Token de vérification requis')
    .matches(/^[a-zA-Z0-9]{32,128}$/, 'Format de token invalide')
    .test(
      'no-sql-injection',
      'Format de token non autorisé',
      validationUtils.noSqlInjection,
    ),
});

/**
 * Validation de profil principal (utilisée par UpdateProfile.jsx)
 */
export const validateProfile = async (profileData, options = {}) => {
  try {
    const validatedData = await validateWithLogging(
      profileSchema,
      profileData,
      options,
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Validation de profil échouée', {
      errorCount: error.inner?.length || 1,
      fields: Object.keys(profileData),
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Validation avec logging (alias pour compatibilité avec UpdateProfile.jsx)
 */
export const validateProfileWithLogging = validateProfile;

/**
 * Validation de vérification d'email
 */
export const validateEmailVerification = async (verificationData) => {
  try {
    const validatedData = await validateWithLogging(
      emailVerificationSchema,
      verificationData,
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};
