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

// Version améliorée du profileSchema dans helpers/schemas.js
export const profileSchema = yup.object().shape({
  name: yup
    .string()
    .required('Le nom est obligatoire')
    .trim()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z\u00C0-\u017F\s'-]+$/,
      'Le nom ne doit contenir que des lettres, espaces, apostrophes et tirets',
    )
    .test(
      'no-sql-injection',
      'Format de nom non autorisé',
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de nom non autorisé',
      utils.noNoSqlInjection,
    ),

  phone: yup
    .string()
    .required('Le numéro de téléphone est obligatoire')
    .trim()
    .matches(
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/,
      'Format de numéro de téléphone invalide',
    )
    .test(
      'is-valid-phone',
      'Le numéro de téléphone doit être valide',
      (value) =>
        value &&
        value.replace(/\D/g, '').length >= 6 &&
        value.replace(/\D/g, '').length <= 15,
    )
    .test(
      'no-sql-injection',
      'Format de téléphone non autorisé',
      utils.noSqlInjection,
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
        .url("URL d'image invalide")
        .test(
          'secure-url',
          'URL non sécurisée',
          (value) => !value || value.startsWith('https://'),
        ),
    }),
});

// Fonction pour valider un profil avec journalisation des erreurs
export const validateProfileWithLogging = async (profileData) => {
  try {
    const validatedData = await profileSchema.validate(profileData, {
      abortEarly: false,
      stripUnknown: true,
    });

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    // Formatage des erreurs pour un retour utilisateur clair
    const formattedErrors = {};

    if (error.inner && error.inner.length) {
      error.inner.forEach((err) => {
        formattedErrors[err.path] = err.message;
      });
    } else if (error.path && error.message) {
      formattedErrors[error.path] = error.message;
    } else {
      formattedErrors.general =
        error.message || 'Erreur de validation du profil';
    }

    // Journalisation sécurisée (sans données sensibles)
    console.warn('Validation de profil échouée', {
      errorCount: Object.keys(formattedErrors).length,
      fields: Object.keys(formattedErrors),
    });

    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'Profile', action: 'validateProfile' },
        extra: {
          fields: Object.keys(formattedErrors),
        },
      });
    }

    return {
      isValid: false,
      errors: formattedErrors,
    };
  }
};

/**
 * Schéma de validation d'adresse optimisé avec validation stricte et protection contre les injections
 * Aligné avec le modèle Address de MongoDB pour une validation cohérente
 */
export const addressSchema = yup
  .object()
  .shape({
    street: yup
      .string()
      .trim()
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
        utils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        "Format d'adresse non autorisé",
        utils.noNoSqlInjection,
      ),

    additionalInfo: yup
      .string()
      .trim()
      .nullable()
      .max(
        100,
        'Les informations complémentaires ne peuvent pas dépasser 100 caractères',
      )
      .test(
        'no-sql-injection',
        "Format d'informations complémentaires non autorisé",
        utils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        "Format d'informations complémentaires non autorisé",
        utils.noNoSqlInjection,
      ),

    city: yup
      .string()
      .trim()
      .required('La ville est obligatoire')
      .min(2, 'Le nom de la ville doit contenir au moins 2 caractères')
      .max(50, 'Le nom de la ville ne peut pas dépasser 50 caractères')
      .matches(
        /^[a-zA-Z\s'-]+$/,
        'Le nom de la ville contient des caractères non autorisés',
      )
      .test(
        'no-sql-injection',
        'Format de ville non autorisé',
        utils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        'Format de ville non autorisé',
        utils.noNoSqlInjection,
      ),

    state: yup
      .string()
      .trim()
      .required('La région/département est obligatoire')
      .min(2, 'Le nom de la région doit contenir au moins 2 caractères')
      .max(50, 'Le nom de la région ne peut pas dépasser 50 caractères')
      .test(
        'no-sql-injection',
        'Format de région non autorisé',
        utils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        'Format de région non autorisé',
        utils.noNoSqlInjection,
      ),

    zipCode: yup
      .string()
      .trim()
      .test('is-valid-zip', 'Format de code postal invalide', (value) => {
        if (!value) return false;
        // Validation de code postal adaptée aux formats internationaux
        // Supprime les espaces avant validation
        return /^[0-9A-Z]{2,10}$/.test(value.replace(/\s/g, ''));
      })
      .test(
        'no-sql-injection',
        'Format de code postal non autorisé',
        utils.noSqlInjection,
      ),

    country: yup
      .string()
      .trim()
      .required('Le pays est obligatoire')
      .min(2, 'Le nom du pays doit contenir au moins 2 caractères')
      .max(50, 'Le nom du pays ne peut pas dépasser 50 caractères')
      .test(
        'no-sql-injection',
        'Format de pays non autorisé',
        utils.noSqlInjection,
      )
      .test(
        'no-nosql-injection',
        'Format de pays non autorisé',
        utils.noNoSqlInjection,
      ),

    isDefault: yup.boolean().default(false),
  })
  .noUnknown(true, 'Champs inconnus non autorisés')
  .strict();

export const paymentSchema = yup.object().shape({
  paymentType: yup
    .string()
    .trim()
    .required('Veuillez sélectionner un moyen de paiement')
    .max(100, 'Le nom du moyen de paiement est trop long')
    .test(
      'no-sql-injection',
      'Format de moyen de paiement non autorisé',
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de moyen de paiement non autorisé',
      utils.noNoSqlInjection,
    )
    .test(
      'only-alphanumeric-and-spaces',
      'Le moyen de paiement contient des caractères non autorisés',
      (value) => {
        if (!value) return true;
        // N'autoriser que les caractères alphanumériques, espaces et quelques caractères spéciaux
        return /^[a-zA-Z0-9\u00C0-\u017F\s._'-]+$/.test(value);
      },
    ),
  accountName: yup
    .string()
    .trim()
    .required('Le nom du compte est obligatoire')
    .min(3, 'Le nom du compte doit contenir au moins 3 caractères')
    .max(100, 'Le nom du compte ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z\u00C0-\u017F\s'-]+$/,
      'Le nom du compte ne doit contenir que des lettres, espaces et tirets',
    )
    .test(
      'no-sql-injection',
      'Format de nom de compte non autorisé',
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de nom de compte non autorisé',
      utils.noNoSqlInjection,
    )
    .test(
      'no-consecutive-special-chars',
      'Le nom du compte contient trop de caractères spéciaux consécutifs',
      (value) => {
        if (!value) return true;
        return !/[^\w\s]{2,}/.test(value);
      },
    ),
  accountNumber: yup
    .string()
    .trim()
    .required('Le numéro de compte est obligatoire')
    .matches(
      /^[0-9]{4,}$/,
      'Le numéro de compte doit contenir uniquement des chiffres (minimum 4)',
    )
    .min(4, 'Le numéro de compte doit contenir au moins 4 chiffres')
    .max(30, 'Le numéro de compte ne peut pas dépasser 30 chiffres')
    .test(
      'no-common-patterns',
      'Le numéro de compte ne doit pas contenir de séquences trop simples',
      (value) => {
        if (!value) return true;
        // Vérifier qu'il n'y a pas de séquences trop simples (1111, 1234, etc.)
        return !/(0000|1111|2222|3333|4444|5555|6666|7777|8888|9999|1234|4321|0123)/.test(
          value,
        );
      },
    )
    .test(
      'not-all-zeros',
      'Le numéro de compte ne peut pas être composé uniquement de zéros',
      (value) => {
        if (!value) return true;
        return !/^0+$/.test(value);
      },
    )
    .transform((value) => (value ? value.replace(/\s/g, '') : value)), // Supprimer les espaces
});

/**
 * Schéma de validation de paiement renforcé avec vérification de contexte
 * Permet de valider un paiement en vérifiant aussi la cohérence avec les types de paiement disponibles
 */
export const validatePaymentDetails = async (
  paymentData,
  availablePaymentTypes = [],
) => {
  try {
    // Première validation structurelle avec le schéma
    const validatedData = await paymentSchema.validate(paymentData, {
      abortEarly: false,
      stripUnknown: true,
    });

    // Vérification supplémentaire: le type de paiement doit exister dans la liste des types disponibles
    if (availablePaymentTypes && availablePaymentTypes.length > 0) {
      const paymentTypeExists = availablePaymentTypes.some(
        (pt) => pt.paymentName === validatedData.paymentType,
      );

      if (!paymentTypeExists) {
        throw new yup.ValidationError(
          "Le moyen de paiement sélectionné n'est pas disponible",
          validatedData.paymentType,
          'paymentType',
        );
      }
    }

    // Analyse heuristique du numéro de compte pour détecter des patterns suspects
    // (adapté selon le système de paiement spécifique à votre pays)
    const accountNumber = validatedData.accountNumber;
    const suspiciousPatterns = [
      /^12345/, // Commence par 12345
      /98765$/, // Termine par 98765
      /(\d)\1{5,}/, // Plus de 5 chiffres identiques consécutifs
    ];

    if (suspiciousPatterns.some((pattern) => pattern.test(accountNumber))) {
      console.warn('Numéro de compte potentiellement suspect détecté', {
        // Ne pas logger le numéro complet pour des raisons de sécurité
        accountNumberPrefix: accountNumber.substring(0, 2) + '****',
      });

      // Plutôt qu'échouer, on pourrait ajouter un flag pour une vérification supplémentaire
      return {
        isValid: true,
        data: validatedData,
        warnings: ['pattern_warning'],
        message: 'Vérification additionnelle du numéro de compte recommandée',
      };
    }

    return {
      isValid: true,
      data: validatedData,
    };
  } catch (error) {
    // Formatage des erreurs pour un retour utilisateur clair
    const formattedErrors = {};

    if (error.inner && error.inner.length) {
      error.inner.forEach((err) => {
        formattedErrors[err.path] = err.message;
      });
    } else if (error.path && error.message) {
      formattedErrors[error.path] = error.message;
    } else {
      formattedErrors.general =
        error.message || 'Erreur de validation du paiement';
    }

    // Journalisation sécurisée (sans données sensibles)
    console.warn('Validation de paiement échouée', {
      errorCount: Object.keys(formattedErrors).length,
      fields: Object.keys(formattedErrors),
    });

    // Capture sélective pour Sentry (seulement si ce n'est pas une erreur de validation standard)
    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'Payment', action: 'validatePayment' },
        // Ne PAS inclure les données de paiement complètes pour des raisons de sécurité
        extra: {
          fields: Object.keys(formattedErrors),
          paymentTypeProvided: !!paymentData.paymentType,
        },
      });
    }

    return {
      isValid: false,
      errors: formattedErrors,
    };
  }
};

/**
 * Schéma de validation pour le formulaire de contact
 * Intègre des validations avancées contre les injections et les abus
 */
export const emailSchema = yup.object().shape({
  subject: yup
    .string()
    .trim()
    .required('Le sujet est requis')
    .min(5, 'Le sujet doit contenir au moins 5 caractères')
    .max(100, 'Le sujet ne peut pas dépasser 100 caractères')
    .matches(
      /^[a-zA-Z0-9\u00C0-\u017F\s.,?!()'-]+$/,
      'Le sujet contient des caractères non autorisés',
    )
    .test(
      'no-sql-injection',
      'Format de sujet non autorisé',
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de sujet non autorisé',
      utils.noNoSqlInjection,
    )
    .test(
      'no-consecutive-special-chars',
      'Le sujet contient trop de caractères spéciaux consécutifs',
      (value) => {
        if (!value) return true;
        return !/[^\w\s]{3,}/.test(value);
      },
    ),

  message: yup
    .string()
    .trim()
    .required('Le message est requis')
    .min(10, 'Votre message doit contenir au moins 10 caractères')
    .max(1000, 'Votre message ne peut pas dépasser 1000 caractères')
    .test(
      'no-sql-injection',
      'Format de message non autorisé',
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de message non autorisé',
      utils.noNoSqlInjection,
    )
    .test('no-urls-limit', 'Trop de liens dans le message', (value) => {
      if (!value) return true;
      // Limiter le nombre d'URLs dans le message (prévention de spam)
      const urlCount = (value.match(/(https?:\/\/[^\s]+)/g) || []).length;
      return urlCount <= 3;
    })
    .test(
      'no-excessive-capitalization',
      "Évitez d'utiliser trop de majuscules",
      (value) => {
        if (!value) return true;
        // Vérifier que le message n'est pas principalement en majuscules
        const uppercaseRatio =
          value
            .replace(/[^a-zA-Z]/g, '')
            .split('')
            .filter((char) => char === char.toUpperCase()).length /
          value.replace(/[^a-zA-Z]/g, '').length;
        return uppercaseRatio <= 0.7; // Max 70% de majuscules
      },
    ),
});

/**
 * Valide un message de contact avec journalisation de sécurité
 * @param {Object} contactData - Les données du formulaire de contact
 * @returns {Promise<Object>} - Résultat de la validation
 */
export const validateContactMessage = async (contactData) => {
  try {
    // Valider avec le schéma
    const validatedData = await emailSchema.validate(contactData, {
      abortEarly: false,
      stripUnknown: true,
    });

    // Analyse heuristique pour détecter les tentatives de spam
    const message = validatedData.message.toLowerCase();
    const spamKeywords = [
      'viagra',
      'buy now',
      'casino',
      'lottery',
      'prize',
      'free money',
      'investment opportunity',
    ];

    const spamScore = spamKeywords.reduce(
      (score, keyword) =>
        score + (message.includes(keyword.toLowerCase()) ? 1 : 0),
      0,
    );

    const isLikelySpam = spamScore >= 2;

    if (isLikelySpam) {
      console.warn('Possible spam message detected', {
        spamScore,
        contentLength: message.length,
        // Ne pas logger le contenu complet pour des raisons de confidentialité
      });
    }

    return {
      isValid: true,
      data: validatedData,
      securityFlags: isLikelySpam ? ['potential_spam'] : [],
    };
  } catch (error) {
    // Formatage des erreurs
    const formattedErrors = {};

    if (error.inner && error.inner.length) {
      error.inner.forEach((err) => {
        formattedErrors[err.path] = err.message;
      });
    } else if (error.path && error.message) {
      formattedErrors[error.path] = error.message;
    } else {
      formattedErrors.general =
        error.message || 'Erreur de validation du message';
    }

    // Journalisation
    console.warn('Échec de validation du message de contact', {
      errorCount: Object.keys(formattedErrors).length,
      fields: Object.keys(formattedErrors),
    });

    // Sentry pour les erreurs non-standards
    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'Contact', action: 'validateContactMessage' },
        extra: {
          fields: Object.keys(formattedErrors),
        },
      });
    }

    return {
      isValid: false,
      errors: formattedErrors,
    };
  }
};

/**
 * Schéma de validation pour la sélection d'adresse dans le processus de livraison
 * Vérifie qu'une adresse valide a été sélectionnée
 */
export const shippingAddressSelectionSchema = yup.object().shape({
  shippingAddress: yup
    .string()
    .trim()
    .required('Veuillez sélectionner une adresse de livraison')
    .test(
      'is-valid-object-id',
      "Format d'identifiant d'adresse non valide",
      (value) => {
        if (!value) return false;
        // Validation selon les règles d'un ObjectId MongoDB/Mongoose
        return /^[0-9a-fA-F]{24}$/.test(value);
      },
    )
    .test(
      'no-sql-injection',
      "Format d'identifiant non autorisé",
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      "Format d'identifiant non autorisé",
      utils.noNoSqlInjection,
    ),
});

/**
 * Valide la sélection d'une adresse avec prise en compte du contexte de livraison
 * @param {string} addressId - L'identifiant de l'adresse sélectionnée
 * @param {Array} availableAddresses - Liste des adresses disponibles
 * @returns {Promise<Object>} - Résultat de la validation
 */
export const validateShippingAddressSelection = async (
  addressId,
  availableAddresses = [],
) => {
  try {
    // Valider le format de l'ID d'adresse
    await shippingAddressSelectionSchema.validate({
      shippingAddress: addressId,
    });

    // Vérifier que l'adresse existe dans la liste des adresses disponibles
    if (!availableAddresses.some((address) => address._id === addressId)) {
      throw new yup.ValidationError(
        "L'adresse sélectionnée n'existe pas dans votre liste d'adresses",
        addressId,
        'shippingAddress',
      );
    }

    return { isValid: true, addressId };
  } catch (error) {
    console.warn("Validation de sélection d'adresse échouée", {
      error: error.message,
      addressId,
    });

    // Capturer l'erreur pour monitoring si nécessaire (hors erreurs de validation standards)
    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'Shipping', action: 'validateAddress' },
        extra: { addressId },
      });
    }

    return {
      isValid: false,
      error: error.message || 'Adresse de livraison non valide',
    };
  }
};

/**
 * Schéma de validation pour la mise à jour de mot de passe
 * Implémente les mêmes critères que le composant frontend UpdatePassword
 */
export const updatePasswordSchema = yup.object().shape({
  currentPassword: yup
    .string()
    .trim()
    .required('Le mot de passe actuel est requis')
    .min(6, 'Le mot de passe actuel doit comporter au moins 6 caractères')
    .test(
      'no-sql-injection',
      'Format de mot de passe non autorisé',
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de mot de passe non autorisé',
      utils.noNoSqlInjection,
    ),

  newPassword: yup
    .string()
    .trim()
    .required('Le nouveau mot de passe est requis')
    .min(8, 'Le nouveau mot de passe doit comporter au moins 8 caractères')
    .max(100, 'Le nouveau mot de passe ne peut pas dépasser 100 caractères')
    .matches(
      /[A-Z]/,
      'Le mot de passe doit contenir au moins une lettre majuscule',
    )
    .matches(
      /[a-z]/,
      'Le mot de passe doit contenir au moins une lettre minuscule',
    )
    .matches(/\d/, 'Le mot de passe doit contenir au moins un chiffre')
    .matches(
      /[@$!%*?&#]/,
      'Le mot de passe doit contenir au moins un caractère spécial (@$!%*?&#)',
    )
    .test(
      'no-whitespace',
      "Le mot de passe ne doit pas contenir d'espaces",
      (value) => !/\s/.test(value),
    )
    .test(
      'no-common-sequences',
      'Le mot de passe contient des séquences trop communes',
      (value) => !REGEX.COMMON_SEQUENCES.test(value),
    )
    .test(
      'not-common-password',
      'Le mot de passe est trop commun',
      utils.isNotCommonPassword,
    )
    .test(
      'password-not-contains-personal-info',
      "Le mot de passe ne doit pas contenir d'informations personnelles",
      utils.passwordContainsPersonalInfo,
    )
    .test(
      'no-sql-injection',
      'Format de mot de passe non autorisé',
      utils.noSqlInjection,
    )
    .test(
      'no-nosql-injection',
      'Format de mot de passe non autorisé',
      utils.noNoSqlInjection,
    )
    .test(
      'no-repeating-chars',
      'Le mot de passe ne doit pas contenir des caractères répétés consécutivement',
      (value) => !/(.)\1{2,}/.test(value),
    )
    .test(
      'different-from-current',
      'Le nouveau mot de passe doit être différent du mot de passe actuel',
      function (value) {
        // Accéder au mot de passe actuel via le contexte
        const { currentPassword } = this.parent;
        // Si les deux mots de passe sont définis, vérifier qu'ils sont différents
        if (value && currentPassword) {
          return value !== currentPassword;
        }
        // Si l'un des deux n'est pas défini, ne pas bloquer la validation
        return true;
      },
    ),

  // Champ optionnel pour la confirmation du mot de passe (à utiliser si nécessaire)
  confirmPassword: yup
    .string()
    .test(
      'passwords-match',
      'Les mots de passe ne correspondent pas',
      function (value) {
        // Si la confirmation est fournie, elle doit correspondre au nouveau mot de passe
        if (value) {
          return value === this.parent.newPassword;
        }
        // Si la confirmation n'est pas fournie, ne pas bloquer la validation
        return true;
      },
    ),
});

/**
 * Wrapper pour la validation de mise à jour de mot de passe avec analyse de sécurité
 * @param {Object} passwordData - Les données du formulaire de mot de passe
 * @returns {Promise<Object>} - Résultat de la validation
 */
export const validatePasswordUpdate = async (passwordData) => {
  try {
    // Validation structurelle avec le schéma
    const validatedData = await updatePasswordSchema.validate(passwordData, {
      abortEarly: false,
      stripUnknown: true,
    });

    // Analyse de la force du mot de passe
    const newPassword = validatedData.newPassword;
    let passwordStrength = 0;

    // Calcul de la force du mot de passe
    // Longueur (40 points max)
    passwordStrength += Math.min(newPassword.length * 4, 40);

    // Complexité (60 points max)
    if (/[a-z]/.test(newPassword)) passwordStrength += 10; // Minuscules
    if (/[A-Z]/.test(newPassword)) passwordStrength += 10; // Majuscules
    if (/\d/.test(newPassword)) passwordStrength += 10; // Chiffres
    if (/[^a-zA-Z\d]/.test(newPassword)) passwordStrength += 15; // Caractères spéciaux

    // Variété de caractères (bonus)
    const uniqueChars = new Set(newPassword).size;
    passwordStrength += Math.min(uniqueChars, 15);

    // Séquences communes (malus)
    if (REGEX.COMMON_SEQUENCES.test(newPassword)) passwordStrength -= 20;

    // Répétitions (malus)
    if (/(.)\1{2,}/.test(newPassword)) passwordStrength -= 10;

    // Limiter le score entre 0 et 100
    passwordStrength = Math.max(0, Math.min(passwordStrength, 100));

    // Définir le niveau de force
    let strengthLevel = 'faible';
    if (passwordStrength >= 80) strengthLevel = 'fort';
    else if (passwordStrength >= 60) strengthLevel = 'bon';
    else if (passwordStrength >= 30) strengthLevel = 'moyen';

    // Journalisation de sécurité (anonymisée)
    if (process.env.NODE_ENV === 'production') {
      console.info('Password update validation', {
        strength: strengthLevel,
        score: passwordStrength,
        // Ne jamais logger d'informations sur le mot de passe lui-même
      });
    }

    return {
      isValid: true,
      data: validatedData,
      security: {
        strength: strengthLevel,
        score: passwordStrength,
      },
    };
  } catch (error) {
    // Formatage des erreurs pour un retour utilisateur clair
    const formattedErrors = {};

    if (error.inner && error.inner.length) {
      error.inner.forEach((err) => {
        formattedErrors[err.path] = err.message;
      });
    } else if (error.path && error.message) {
      formattedErrors[error.path] = error.message;
    } else {
      formattedErrors.general =
        error.message || 'Erreur de validation du mot de passe';
    }

    // Journalisation sécurisée (sans données sensibles)
    console.warn('Validation de mise à jour de mot de passe échouée', {
      errorCount: Object.keys(formattedErrors).length,
      fields: Object.keys(formattedErrors),
    });

    // Capture sélective pour Sentry (seulement si ce n'est pas une erreur de validation standard)
    if (error.name !== 'ValidationError') {
      captureException(error, {
        tags: { component: 'Password', action: 'validatePasswordUpdate' },
        extra: {
          fields: Object.keys(formattedErrors),
        },
      });
    }

    return {
      isValid: false,
      errors: formattedErrors,
    };
  }
};
