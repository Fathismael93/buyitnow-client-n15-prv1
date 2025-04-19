/* eslint-disable no-useless-escape */
import * as yup from 'yup';
import { captureException } from '@/monitoring/sentry';

/**
 * Regex communs pour la validation
 */
const REGEX = {
  // Détecte les caractères spéciaux potentiellement dangereux dans le nom
  SAFE_NAME: /^[a-zA-Z0-9\u00C0-\u017F\s._'-]+$/,

  // Valide un email selon les normes RFC (plus strict que la validation par défaut)
  EMAIL:
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,

  // Au moins une majuscule, une minuscule, un chiffre et un caractère spécial
  STRONG_PASSWORD:
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/,

  // Vérifie que le mot de passe ne contient pas de séquences courantes
  COMMON_SEQUENCES: /(123456|password|qwerty|abc123)/i,

  // Valide les numéros de téléphone internationaux
  PHONE: /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/,

  // Détection d'injection SQL
  SQL_INJECTION: [
    /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|UNION)(\s|$)/i,
    /(\s|^)(JOIN|FROM|INTO|WHERE)(\s|$)/i,
    /(\s|^)(--)/,
    /(;)/,
    /('|").*\1.*=/,
    /\/\*/,
    /\*\//,
    /xp_/,
  ],

  // Détection d'injection NoSQL
  NOSQL_INJECTION: [
    /\$/,
    /\{.*:.*\}/,
    /\[.*\]/,
    /\.\.|^\.|\.$/,
    /new\s+Date/,
    /\bfunction\s*\(/,
    /\bObjectId\s*\(/,
    /\bISODate\s*\(/,
  ],
};

/**
 * Fonctions utilitaires pour la validation
 */
const utils = {
  /**
   * Vérifie si le mot de passe contient des informations personnelles
   * @param {string} password - Le mot de passe à vérifier
   * @param {Object} context - Le contexte Yup avec les autres valeurs
   * @returns {boolean} - True si le mot de passe est sécurisé
   */
  passwordContainsPersonalInfo: (password, context) => {
    if (!password || !context || !context.parent) return true;

    // Récupérer les informations personnelles
    const { name, email } = context.parent;

    // Extraction du nom d'utilisateur de l'email
    const emailUsername = email ? email.split('@')[0] : '';

    // Vérifier si le mot de passe contient des infos personnelles
    const lowercasePassword = password.toLowerCase();

    // Vérifier le nom
    if (
      name &&
      name.length > 3 &&
      lowercasePassword.includes(name.toLowerCase())
    ) {
      return false;
    }

    // Vérifier l'email et le nom d'utilisateur
    if (
      emailUsername &&
      emailUsername.length > 3 &&
      lowercasePassword.includes(emailUsername.toLowerCase())
    ) {
      return false;
    }

    return true;
  },

  /**
   * Vérifie si le mot de passe est dans une liste de mots de passe courants
   * @param {string} password - Le mot de passe à vérifier
   * @returns {boolean} - True si le mot de passe n'est pas courant
   */
  isNotCommonPassword: (password) => {
    if (!password) return true;

    // Liste très courte, à remplacer par une vraie vérification dans une liste complète
    const commonPasswords = [
      'password',
      'password123',
      '123456',
      'qwerty',
      'abc123',
      'welcome',
      'admin',
      'letmein',
      'welcome1',
      'monkey',
    ];

    return !commonPasswords.includes(password.toLowerCase());
  },

  /**
   * Test de détection d'injection SQL
   */
  noSqlInjection: (value) => {
    if (!value) return true;
    return !REGEX.SQL_INJECTION.some((pattern) => pattern.test(value));
  },

  /**
   * Test de détection d'injection NoSQL
   */
  noNoSqlInjection: (value) => {
    if (!value) return true;
    return !REGEX.NOSQL_INJECTION.some((pattern) => pattern.test(value));
  },
};

/**
 * Options de validation des champs partagés
 */
const fieldsConfig = {
  email: yup
    .string()
    .trim()
    .lowercase()
    .required('Email is required')
    .max(100, 'Email must be at most 100 characters')
    .email('Please enter a valid email address')
    .matches(REGEX.EMAIL, 'Invalid email format')
    .test('no-sql-injection', 'Invalid email format', utils.noSqlInjection)
    .test('no-nosql-injection', 'Invalid email format', utils.noNoSqlInjection),

  password: yup
    .string()
    .trim()
    .required('Password is required')
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters')
    .test(
      'no-whitespace',
      'Password should not contain spaces',
      (value) => !/\s/.test(value),
    )
    .test(
      'no-common-sequences',
      'Password contains common sequences',
      (value) => !REGEX.COMMON_SEQUENCES.test(value),
    )
    .test(
      'not-common-password',
      'Password is too common',
      utils.isNotCommonPassword,
    ),

  name: yup
    .string()
    .trim()
    .required('Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters')
    .matches(REGEX.SAFE_NAME, 'Name contains invalid characters')
    .test(
      'no-sql-injection',
      'Name contains invalid characters',
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Name contains invalid characters',
      utils.noNoSqlInjection,
    ),

  phone: yup
    .string()
    .trim()
    .required('Phone number is required')
    .matches(REGEX.PHONE, 'Invalid phone number format')
    .test(
      'is-valid-phone',
      'Phone number must be valid',
      (value) =>
        value &&
        value.replace(/\D/g, '').length >= 6 &&
        value.replace(/\D/g, '').length <= 15,
    ),
};

/**
 * Schéma de connexion optimisé avec gestion d'erreurs
 */
export const loginSchema = yup
  .object()
  .shape({
    email: fieldsConfig.email,
    password: fieldsConfig.password,
  })
  .noUnknown(true, 'Unknown fields are not allowed')
  .strict();

/**
 * Schéma d'inscription optimisé avec validation croisée et sécurité renforcée
 */
export const registerSchema = yup
  .object()
  .shape({
    name: fieldsConfig.name,
    email: fieldsConfig.email,
    phone: fieldsConfig.phone,
    password: fieldsConfig.password
      .matches(
        REGEX.STRONG_PASSWORD,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      )
      .test(
        'password-not-contains-personal-info',
        'Password should not contain your name or email',
        utils.passwordContainsPersonalInfo,
      ),
  })
  .noUnknown(true, 'Unknown fields are not allowed')
  .strict();

/**
 * Version haute sécurité du schéma d'inscription (peut être utilisée pour les environnements nécessitant une sécurité accrue)
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
 * Wrapper pour capturer les erreurs de validation et les logger
 * @param {Object} schema - Le schéma Yup
 * @param {Object} data - Les données à valider
 * @param {Object} options - Options supplémentaires
 * @returns {Promise<Object>} - Résultat de la validation
 */
export const validateWithLogging = async (schema, data, options = {}) => {
  try {
    return await schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      ...options,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      console.warn('Validation error', {
        errors: error.errors,
        fields: Object.keys(data).filter((key) => !key.includes('password')),
      });
    } else {
      captureException(error, {
        tags: { component: 'validation' },
        extra: { schemaName: schema.describe().meta?.name || 'unknown' },
      });
    }
    throw error;
  }
};

// Reste du code inchangé
// searchSchema, categorySchema, etc.
export const searchSchema = yup.object().shape({
  keyword: yup
    .string()
    .required('Veuillez saisir un nom de produit')
    .trim()
    .min(2, 'Le nom du produit doit contenir au moins 2 caractères')
    .max(100, 'Le nom du produit ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z0-9\u00C0-\u017F\s.,'\-&()[\]]+$/,
      'Le nom du produit contient des caractères non autorisés',
    )
    .test(
      'no-sql-injection',
      'Le nom du produit contient des motifs non autorisés',
      (value) => {
        if (!value) return true;
        // Liste de motifs SQL injection courants à bloquer
        const sqlPatterns = [
          /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)(\s|$)/i,
          /(\s|^)(UNION|JOIN)(\s|$)/i,
          /(\s|^)(--)/,
          /(;)/,
          /('|").*\1.*=/,
        ];
        return !sqlPatterns.some((pattern) => pattern.test(value));
      },
    )
    .test(
      'no-nosql-injection',
      'Le nom du produit contient des caractères non autorisés pour MongoDB',
      (value) => {
        if (!value) return true;

        // Protection contre les injections NoSQL pour MongoDB
        const noSqlPatterns = [
          /\$/, // Opérateurs MongoDB ($eq, $gt, $where, etc.)
          /\{.*:.*\}/, // Objets JSON qui pourraient être interprétés comme des requêtes
          /\[.*\]/, // Tableaux qui pourraient être utilisés dans des opérateurs
          /\.\.|^\.|\.$/, // Tentatives de traversée de chemin
          /true|false/, // Booléens littéraux qui pourraient être utilisés dans des injections
          /null/, // Valeur null qui pourrait être utilisée dans des injections
          /new\s+Date/, // Tentatives d'utiliser des constructeurs de date
          /\bfunction\s*\(/, // Tentatives d'injection de code JavaScript
          /\bObjectId\s*\(/, // Tentatives d'utiliser le constructeur ObjectId
        ];

        return !noSqlPatterns.some((pattern) => pattern.test(value));
      },
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

export const categorySchema = yup.object().shape({
  value: yup
    .string()
    .required('La catégorie est requise')
    .trim()
    .test(
      'is-valid-object-id',
      'Identifiant de catégorie invalide',
      (value) => {
        if (!value) return false;

        // Validation selon les règles d'un ObjectId MongoDB/Mongoose:
        // - 24 caractères hexadécimaux (12 octets)
        // - peut aussi être considéré valide s'il correspond au modèle précis d'un ObjectId
        return /^[0-9a-fA-F]{24}$/.test(value);
      },
    )
    .test('no-injection', 'Format de catégorie non autorisé', (value) => {
      if (!value) return true;

      // Protection contre les attaques NoSQL injection
      const dangerousPatterns = [
        /\$/, // Opérateurs MongoDB commencent par $
        /\.\./, // Attaques de traversée de chemin
        /\{.*\:.*\}/, // Tentatives d'objets JSON
        /\[.*\]/, // Tentatives de tableaux
      ];

      return !dangerousPatterns.some((pattern) => pattern.test(value));
    })
    // Normalisation pour éviter des problèmes de casse
    .transform((value) => (value ? value.toLowerCase() : value)),
});

export const minPriceSchema = yup.object().shape({
  minPrice: yup
    .number()
    .nullable()
    .transform((value, originalValue) => {
      // Transforme les chaînes vides en null
      return originalValue === '' ? null : value;
    })
    .typeError('Le prix minimum doit être un nombre valide')
    .test(
      'is-positive-or-zero',
      'Le prix minimum doit être supérieur ou égal à 0',
      (value) => value >= 0,
    )
    .test(
      'is-finite-number',
      'Le prix minimum doit être un nombre fini',
      (value) => Number.isFinite(value) && value <= 999999999,
    )
    .test(
      'is-valid-price-format',
      'Le prix minimum doit avoir au maximum 2 décimales',
      (value) => /^\d+(\.\d{1,2})?$/.test(String(value)),
    ),
});

export const maxPriceSchema = yup.object().shape({
  maxPrice: yup
    .number()
    .nullable()
    .transform((value, originalValue) => {
      // Transforme les chaînes vides en null
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

export const pageSchema = yup.object().shape({
  page: yup
    .number()
    .typeError('La page doit être un nombre')
    .positive('La page doit être positive')
    .integer('La page doit être un entier')
    .max(1000, 'La page ne peut pas dépasser 1000'),
});

export const profileSchema = yup.object().shape({
  name: yup.string().required().min(3),
  phone: yup.number().positive().integer().required().min(6),
});

export const addressSchema = yup.object().shape({
  street: yup.string().required().min(3),
  city: yup.string().required().min(3),
  state: yup.string().required().min(2),
  zipCode: yup.number().positive().required().min(3),
  phoneNo: yup.number().positive().integer().required().min(6),
  country: yup.string().required().min(3),
});

export const paymentSchema = yup.object().shape({
  paymentType: yup.string().required(),
  accountName: yup.string().required().min(3),
  accountNumber: yup.number().positive().integer().required().min(4),
});

export const emailSchema = yup.object().shape({
  subject: yup.string().required().min(5),
  message: yup.string().required().min(3),
});
