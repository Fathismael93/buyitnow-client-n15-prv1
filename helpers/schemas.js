/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-escape */
import * as yup from 'yup';

export const loginSchema = yup.object().shape({
  email: yup.string().email().required(),
  password: yup.string().required().min(6),
});

export const registerSchema = yup.object().shape({
  name: yup.string().required().min(3),
  phone: yup.number().positive().integer().required().min(6),
  email: yup.string().email().required(),
  password: yup.string().required().min(6),
});

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

export const priceRangeSchema = yup
  .object()
  .shape({
    minPrice: yup
      .number()
      .nullable()
      .transform((value, originalValue) => {
        console.log('value minPrice', value);
        console.log('originalValue minPrice', originalValue);
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

    maxPrice: yup
      .number()
      .nullable()
      .transform((value, originalValue) => {
        console.log('value maxPrice', value);
        console.log('originalValue maxPrice', originalValue);
        // Transforme les chaînes vides en null
        return originalValue === '' ? null : value;
      })
      .typeError('Le prix maximum doit être un nombre valide')
      .test(
        'is-positive-or-zero',
        'Le prix maximum doit être supérieur ou égal à 0',
        (value) => value >= 0,
      )
      .test(
        'is-finite-number',
        'Le prix maximum doit être un nombre fini',
        (value) => Number.isFinite(value) && value <= 999999999,
      )
      .test(
        'is-valid-price-format',
        'Le prix maximum doit avoir au maximum 2 décimales',
        (value) => /^\d+(\.\d{1,2})?$/.test(String(value)),
      ),
  })
  .test(
    'min-max-constraint',
    'Le prix minimum doit être inférieur ou égal au prix maximum',
    function (values) {
      const { minPrice, maxPrice } = values;

      // Si l'un des deux est null, la validation réussit
      if (minPrice === null || maxPrice === null) {
        return true;
      }

      return minPrice <= maxPrice;
    },
  )
  .test(
    'at-least-one-price',
    'Au moins un des prix doit être spécifié pour effectuer une recherche par prix',
    function (values) {
      // Cette validation est optionnelle - à décommenter si vous voulez imposer
      // qu'au moins un des deux champs soit renseigné

      // const { minPrice, maxPrice } = values;
      // return minPrice !== null || maxPrice !== null;

      // Par défaut, on accepte les deux champs vides
      return true;
    },
  );

// Ajoutez ces schémas à votre fichier existant
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
