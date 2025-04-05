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
  category: yup
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
