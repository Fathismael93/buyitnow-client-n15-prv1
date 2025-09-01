// helpers/validation/schemas/auth.js
// Schémas d'authentification simplifiés et adaptés aux composants existants

import * as yup from 'yup';
import { createBaseFields, validationUtils, REGEX } from '../core/constants';
import { validateWithLogging, formatValidationErrors } from '../core/utils';

// Création des champs de base avec yup
const baseFields = createBaseFields(yup);

/**
 * Schéma de connexion - Version simplifiée
 */
export const loginSchema = yup
  .object()
  .shape({
    email: baseFields.email(),
    password: baseFields
      .password()
      .min(6, 'Password must be at least 6 characters') // Aligné avec Login.jsx
      .max(100, 'Password is too long'),
  })
  .noUnknown(true, 'Unknown fields are not allowed')
  .strict();

/**
 * Schéma d'inscription standard - Aligné avec Register.jsx
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
 * Schéma de mise à jour de mot de passe - Simplifié pour UpdatePassword.jsx
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
    .required('Password confirmation is required')
    .test('passwords-match', 'Passwords do not match', function (value) {
      return !value || value === this.parent.newPassword;
    }),
});

/**
 * Schéma pour la réinitialisation de mot de passe (email uniquement)
 */
export const forgotPasswordSchema = yup.object().shape({
  email: baseFields.email(),
});

/**
 * Schéma pour la réinitialisation avec token
 */
export const resetPasswordSchema = yup.object().shape({
  token: yup
    .string()
    .required('Reset token is required')
    .min(10, 'Invalid token format')
    .max(200, 'Invalid token format')
    .test(
      'no-sql-injection',
      'Invalid token format',
      validationUtils.noSqlInjection,
    ),

  newPassword: baseFields
    .password()
    .matches(REGEX.STRONG_PASSWORD, 'Password must meet strength requirements'),

  confirmPassword: yup
    .string()
    .required('Password confirmation is required')
    .test('passwords-match', 'Passwords do not match', function (value) {
      return !value || value === this.parent.newPassword;
    }),
});

/**
 * Fonction de validation de connexion
 */
export const validateLogin = async (loginData) => {
  try {
    const validatedData = await validateWithLogging(
      loginSchema,
      loginData,
      { enableCache: false }, // Pas de cache pour les données sensibles
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Login validation failed', {
      error: error.message,
      hasEmail: !!loginData?.email,
      hasPassword: !!loginData?.password,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Fonction de validation d'inscription
 */
export const validateRegister = async (registerData) => {
  try {
    const validatedData = await validateWithLogging(
      registerSchema,
      registerData,
      { enableCache: false },
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Registration validation failed', {
      error: error.message,
      hasName: !!registerData?.name,
      hasEmail: !!registerData?.email,
      hasPhone: !!registerData?.phone,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Fonction de validation de mise à jour de mot de passe
 * Simplifiée sans calcul de force (délégué au composant)
 */
export const validatePasswordUpdate = async (passwordData) => {
  try {
    const validatedData = await validateWithLogging(
      updatePasswordSchema,
      passwordData,
      { enableCache: false },
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Password update validation failed', {
      error: error.message,
      hasCurrentPassword: !!passwordData?.currentPassword,
      hasNewPassword: !!passwordData?.newPassword,
      hasConfirmPassword: !!passwordData?.confirmPassword,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Fonction de validation pour mot de passe oublié
 */
export const validateForgotPassword = async (emailData) => {
  try {
    const validatedData = await validateWithLogging(
      forgotPasswordSchema,
      emailData,
      { enableCache: false },
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Forgot password validation failed', {
      error: error.message,
      hasEmail: !!emailData?.email,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Fonction de validation pour réinitialisation avec token
 */
export const validateResetPassword = async (resetData) => {
  try {
    const validatedData = await validateWithLogging(
      resetPasswordSchema,
      resetData,
      { enableCache: false },
    );

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    console.warn('Reset password validation failed', {
      error: error.message,
      hasToken: !!resetData?.token,
      hasNewPassword: !!resetData?.newPassword,
    });

    return {
      isValid: false,
      errors: formatValidationErrors(error),
    };
  }
};

/**
 * Fonction utilitaire pour valider un seul champ (utilisée dans la validation en temps réel)
 */
export const validateAuthField = async (fieldName, value, schema = null) => {
  try {
    // Déterminer le schéma à utiliser
    let targetSchema = loginSchema;

    if (schema === 'register') {
      targetSchema = registerSchema;
    } else if (schema === 'updatePassword') {
      targetSchema = updatePasswordSchema;
    }

    await targetSchema.validateAt(fieldName, { [fieldName]: value });
    return {
      isValid: true,
      error: null,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
    };
  }
};

/**
 * Fonction de validation pour vérification d'email (simple)
 */
export const validateEmail = async (email) => {
  try {
    const schema = yup.object().shape({
      email: baseFields.email(),
    });

    const validatedData = await validateWithLogging(
      schema,
      { email },
      { enableCache: false },
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
 * Fonction utilitaire pour nettoyer les données d'authentification
 */
export const sanitizeAuthData = (authData) => {
  const sanitized = {};

  // Nettoyer et trimmer les champs texte
  Object.keys(authData).forEach((key) => {
    if (typeof authData[key] === 'string') {
      sanitized[key] = validationUtils.sanitizeString(authData[key]);
    } else {
      sanitized[key] = authData[key];
    }
  });

  // Email en minuscule
  if (sanitized.email) {
    sanitized.email = sanitized.email.toLowerCase();
  }

  return sanitized;
};
