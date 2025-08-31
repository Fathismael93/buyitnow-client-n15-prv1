// helpers/validation/schemas/auth.js
// Schémas d'authentification - Chargés uniquement quand nécessaire

import * as yup from 'yup';
import { createBaseFields, validationUtils, REGEX } from '../core/constants';
import { validateWithLogging } from '../core/utils';

// Création des champs de base avec yup
const baseFields = createBaseFields(yup);

/**
 * Schéma de connexion - Version optimisée
 */
export const loginSchema = yup
  .object()
  .shape({
    email: baseFields.email(),
    password: baseFields.password(),
  })
  .noUnknown(true, 'Unknown fields are not allowed')
  .strict();

/**
 * Schéma d'inscription standard
 */
export const registerSchema = yup
  .object()
  .shape({
    name: baseFields.name(),
    email: baseFields.email(),
    phone: baseFields.phone(),
    password: baseFields
      .password()
      .matches(
        REGEX.STRONG_PASSWORD,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      )
      .test(
        'password-not-contains-personal-info',
        'Password should not contain your name or email',
        validationUtils.passwordContainsPersonalInfo,
      ),
  })
  .noUnknown(true, 'Unknown fields are not allowed')
  .strict();

/**
 * Schéma d'inscription sécurisé avec confirmation
 */
export const secureRegisterSchema = registerSchema.concat(
  yup.object().shape({
    passwordConfirmation: yup
      .string()
      .required('Password confirmation is required')
      .oneOf([yup.ref('password')], 'Passwords must match'),
    acceptTerms: yup
      .boolean()
      .required('You must accept the terms and conditions')
      .oneOf([true], 'You must accept the terms and conditions'),
  }),
);

/**
 * Schéma de mise à jour de mot de passe
 */
export const updatePasswordSchema = yup.object().shape({
  currentPassword: yup
    .string()
    .trim()
    .required('Current password is required')
    .min(6, 'Current password must be at least 6 characters')
    .test(
      'no-sql-injection',
      'Invalid password format',
      validationUtils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Invalid password format',
      validationUtils.noNoSqlInjection,
    ),

  newPassword: baseFields
    .password()
    .matches(REGEX.STRONG_PASSWORD, 'Password must meet strength requirements')
    .test(
      'no-repeating-chars',
      'Password cannot have repeating characters',
      (value) => !/(.)\1{2,}/.test(value),
    )
    .test(
      'different-from-current',
      'New password must be different from current',
      function (value) {
        const { currentPassword } = this.parent;
        return !value || !currentPassword || value !== currentPassword;
      },
    ),

  confirmPassword: yup
    .string()
    .test('passwords-match', 'Passwords do not match', function (value) {
      return !value || value === this.parent.newPassword;
    }),
});

/**
 * Fonction de validation avec analyse de sécurité du mot de passe
 */
export const validatePasswordUpdate = async (passwordData) => {
  try {
    const validatedData = await validateWithLogging(
      updatePasswordSchema,
      passwordData,
    );

    // Analyse de force du mot de passe
    const newPassword = validatedData.newPassword;
    let passwordStrength = calculatePasswordStrength(newPassword);

    return {
      isValid: true,
      data: validatedData,
      security: {
        strength: getStrengthLevel(passwordStrength),
        score: passwordStrength,
      },
    };
  } catch (error) {
    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Calcul optimisé de la force du mot de passe
 */
function calculatePasswordStrength(password) {
  if (!password) return 0;

  let strength = 0;

  // Longueur (max 40 points)
  strength += Math.min(password.length * 4, 40);

  // Complexité
  if (/[a-z]/.test(password)) strength += 10;
  if (/[A-Z]/.test(password)) strength += 10;
  if (/\d/.test(password)) strength += 10;
  if (/[^a-zA-Z\d]/.test(password)) strength += 15;

  // Variété de caractères
  const uniqueChars = new Set(password).size;
  strength += Math.min(uniqueChars, 15);

  // Pénalités
  if (REGEX.COMMON_SEQUENCES.test(password)) strength -= 20;
  if (/(.)\1{2,}/.test(password)) strength -= 10;

  return Math.max(0, Math.min(strength, 100));
}

/**
 * Détermine le niveau de force
 */
function getStrengthLevel(score) {
  if (score >= 80) return 'fort';
  if (score >= 60) return 'bon';
  if (score >= 30) return 'moyen';
  return 'faible';
}

/**
 * Formatage des erreurs de validation
 */
function formatValidationErrors(error) {
  const formattedErrors = {};

  if (error.inner?.length) {
    error.inner.forEach((err) => {
      formattedErrors[err.path] = err.message;
    });
  } else if (error.path && error.message) {
    formattedErrors[error.path] = error.message;
  } else {
    formattedErrors.general = error.message || 'Validation error';
  }

  return formattedErrors;
}
