// helpers/validation/schemas/user.js
// Schémas de validation pour les profils utilisateur

import * as yup from 'yup';
import { createBaseFields, validationUtils } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';
import { captureException } from '@/monitoring/sentry';

const baseFields = createBaseFields(yup);

/**
 * Schéma de validation de profil utilisateur
 */
export const profileSchema = yup.object().shape({
  name: baseFields.name(),

  phone: baseFields.phone(),

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
        .url("URL d'image invalide")
        .test(
          'secure-url',
          'URL non sécurisée',
          (value) => !value || value.startsWith('https://'),
        ),
    }),
});

/**
 * Schéma de validation étendu pour la mise à jour de profil
 */
export const extendedProfileSchema = profileSchema.concat(
  yup.object().shape({
    dateOfBirth: yup
      .date()
      .nullable()
      .max(new Date(), 'La date de naissance ne peut pas être dans le futur')
      .test('minimum-age', 'Vous devez avoir au moins 13 ans', (value) => {
        if (!value) return true;
        const today = new Date();
        const birthDate = new Date(value);
        const age = today.getFullYear() - birthDate.getFullYear();
        return age >= 13;
      }),

    gender: yup
      .string()
      .nullable()
      .oneOf(
        ['male', 'female', 'other', 'prefer_not_to_say'],
        'Genre non valide',
      ),

    language: yup
      .string()
      .nullable()
      .oneOf(['fr', 'en', 'es', 'de'], 'Langue non supportée'),

    timezone: yup
      .string()
      .nullable()
      .matches(/^[A-Za-z_\/]+$/, 'Format de fuseau horaire invalide'),

    newsletter: yup.boolean().default(false),

    smsNotifications: yup.boolean().default(false),
  }),
);

/**
 * Schéma de validation pour les préférences utilisateur
 */
export const userPreferencesSchema = yup.object().shape({
  theme: yup
    .string()
    .oneOf(['light', 'dark', 'auto'], 'Thème non valide')
    .default('auto'),

  language: yup
    .string()
    .oneOf(['fr', 'en', 'es', 'de'], 'Langue non supportée')
    .default('fr'),

  currency: yup
    .string()
    .oneOf(['EUR', 'USD', 'GBP', 'CAD'], 'Devise non supportée')
    .default('EUR'),

  emailNotifications: yup.object().shape({
    marketing: yup.boolean().default(true),
    orderUpdates: yup.boolean().default(true),
    securityAlerts: yup.boolean().default(true),
    newsletter: yup.boolean().default(false),
  }),

  smsNotifications: yup.object().shape({
    orderUpdates: yup.boolean().default(false),
    promotions: yup.boolean().default(false),
    securityAlerts: yup.boolean().default(false),
  }),

  privacy: yup.object().shape({
    profileVisibility: yup
      .string()
      .oneOf(['public', 'private', 'friends'], 'Visibilité non valide')
      .default('private'),

    dataSharing: yup.boolean().default(false),

    analyticsOptOut: yup.boolean().default(false),
  }),
});

/**
 * Schéma pour la suppression de compte
 */
export const accountDeletionSchema = yup.object().shape({
  password: yup
    .string()
    .required('Mot de passe requis pour supprimer le compte')
    .min(6, 'Mot de passe trop court'),

  reason: yup
    .string()
    .required('Veuillez indiquer la raison de suppression')
    .oneOf(
      [
        'not_satisfied',
        'privacy_concerns',
        'too_expensive',
        'found_alternative',
        'temporary_break',
        'other',
      ],
      'Raison non valide',
    ),

  feedback: yup
    .string()
    .nullable()
    .max(500, 'Le commentaire ne peut pas dépasser 500 caractères')
    .test(
      'no-sql-injection',
      'Format de commentaire non autorisé',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de commentaire non autorisé',
      validationUtils.noNoSqlInjection,
    ),

  confirmDeletion: yup
    .boolean()
    .required('Vous devez confirmer la suppression')
    .oneOf([true], 'Vous devez confirmer la suppression du compte'),
});

/**
 * Validation de profil avec logging sécurisé
 */
export const validateProfile = async (profileData, options = {}) => {
  try {
    const schema = options.extended ? extendedProfileSchema : profileSchema;
    const validatedData = await validateWithLogging(schema, profileData, {
      enableCache: true,
      ...options,
    });

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    // Logging sécurisé - sans données sensibles
    console.warn('Profile validation failed', {
      errorCount: error.inner?.length || 1,
      fields: error.inner?.map((err) => err.path) || [error.path],
    });

    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'User', action: 'validateProfile' },
        extra: {
          extended: options.extended,
          fields: Object.keys(profileData),
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
 * Validation des préférences utilisateur
 */
export const validateUserPreferences = async (preferencesData) => {
  try {
    const validatedData = await validateWithLogging(
      userPreferencesSchema,
      preferencesData,
      { enableCache: true },
    );

    // Vérifications de cohérence métier
    const warnings = [];

    // Avertir si pas de notifications de sécurité
    if (
      !validatedData.emailNotifications?.securityAlerts &&
      !validatedData.smsNotifications?.securityAlerts
    ) {
      warnings.push('security_notifications_disabled');
    }

    // Avertir si toutes les notifications sont désactivées
    const hasAnyNotification = Object.values(
      validatedData.emailNotifications || {},
    )
      .concat(Object.values(validatedData.smsNotifications || {}))
      .some(Boolean);

    if (!hasAnyNotification) {
      warnings.push('all_notifications_disabled');
    }

    return {
      isValid: true,
      data: validatedData,
      warnings,
    };
  } catch (error) {
    console.warn('User preferences validation failed', {
      error: error.message,
      fields: Object.keys(preferencesData),
    });

    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'User', action: 'validatePreferences' },
      });
    }

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Validation de suppression de compte avec vérifications de sécurité
 */
export const validateAccountDeletion = async (deletionData) => {
  try {
    const validatedData = await validateWithLogging(
      accountDeletionSchema,
      deletionData,
    );

    // Analyse de sécurité
    const securityFlags = [];

    // Détecter les suppressions suspectes
    if (deletionData.reason === 'other' && !deletionData.feedback) {
      securityFlags.push('suspicious_deletion_no_feedback');
    }

    // Vérifier les tentatives de suppression multiples
    const userAgent =
      typeof window !== 'undefined' ? window.navigator.userAgent : 'server';

    if (userAgent.includes('bot') || userAgent.includes('crawler')) {
      securityFlags.push('bot_deletion_attempt');
    }

    return {
      isValid: true,
      data: validatedData,
      securityFlags,
    };
  } catch (error) {
    console.warn('Account deletion validation failed', {
      error: error.message,
      reason: deletionData.reason,
    });

    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'User', action: 'validateAccountDeletion' },
        level: 'warning',
      });
    }

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

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
 * Schéma de validation pour la récupération de mot de passe
 */
export const passwordResetSchema = yup.object().shape({
  email: baseFields.email(),

  captcha: yup
    .string()
    .nullable()
    .when('$requireCaptcha', {
      is: true,
      then: yup.string().required('Captcha requis'),
    }),
});

/**
 * Schéma de validation pour la confirmation de récupération de mot de passe
 */
export const passwordResetConfirmSchema = yup.object().shape({
  token: yup
    .string()
    .required('Token de récupération requis')
    .matches(/^[a-zA-Z0-9]{32,128}$/, 'Format de token invalide'),

  newPassword: baseFields
    .password()
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/,
      'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial',
    ),

  confirmPassword: yup
    .string()
    .required('Confirmation du mot de passe requise')
    .oneOf([yup.ref('newPassword')], 'Les mots de passe ne correspondent pas'),
});

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

/**
 * Validation de récupération de mot de passe
 */
export const validatePasswordReset = async (
  resetData,
  requireCaptcha = false,
) => {
  try {
    const validatedData = await validateWithLogging(
      passwordResetSchema,
      resetData,
      { context: { requireCaptcha } },
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
