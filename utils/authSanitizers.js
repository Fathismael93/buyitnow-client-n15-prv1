/* eslint-disable no-control-regex */
/**
 * Utilitaires spécifiques pour la sanitisation des données d'authentification
 */

/**
 * Sanitise une adresse email
 * - Supprime les espaces en début et fin
 * - Convertit en minuscules
 * - Garde uniquement les caractères valides pour un email
 * - Vérifie le format basique d'un email
 *
 * @param {string} email - L'adresse email à sanitiser
 * @returns {string|null} - L'email sanitisé ou null si invalide
 */
export const sanitizeEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return null;
  }

  // Suppression des espaces en début et fin
  let sanitized = email.trim().toLowerCase();

  // Suppression des caractères de contrôle et non-imprimables
  sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Vérification du format basique d'un email
  // Cette regex permet la vérification basique sans bloquer les emails valides mais complexes
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(sanitized)) {
    return null;
  }

  return sanitized;
};

/**
 * Sanitise un mot de passe sans altérer sa valeur
 * - Ne modifie pas le mot de passe lui-même (pour préserver sa valeur de hachage)
 * - Vérifie seulement l'absence de caractères de contrôle
 * - Valide la longueur minimale
 *
 * @param {string} password - Le mot de passe à sanitiser
 * @param {Object} options - Options de validation
 * @param {number} options.minLength - Longueur minimale (défaut: 6)
 * @param {number} options.maxLength - Longueur maximale (défaut: 100)
 * @returns {string|null} - Le mot de passe validé ou null si invalide
 */
export const sanitizePassword = (password, options = {}) => {
  const { minLength = 6, maxLength = 100 } = options;

  if (!password || typeof password !== 'string') {
    return null;
  }

  // Vérifier la longueur
  if (password.length < minLength || password.length > maxLength) {
    return null;
  }

  // Vérifier l'absence de caractères de contrôle
  // Ces caractères peuvent causer des problèmes de sécurité
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(password)) {
    return null;
  }

  // Retourner le mot de passe sans le modifier
  // Important: ne pas altérer le mot de passe pour préserver sa valeur lors du hachage
  return password;
};

/**
 * Sanitise les identifiants de connexion
 * @param {Object} credentials - Les identifiants à sanitiser
 * @returns {Object} - Les identifiants sanitisés
 */
export const sanitizeCredentials = (credentials = {}) => {
  const sanitized = {};

  // Sanitiser l'email
  if (credentials.email) {
    sanitized.email = sanitizeEmail(credentials.email);
  }

  // Sanitiser le mot de passe
  if (credentials.password) {
    sanitized.password = sanitizePassword(credentials.password);
  }

  return sanitized;
};

/**
 * Sanitise un nom d'utilisateur
 * - Supprime les espaces en début et fin
 * - Conserve uniquement les caractères alphanumériques, espaces et certains caractères spécifiques
 * - Valide la longueur minimale et maximale
 *
 * @param {string} name - Le nom à sanitiser
 * @param {Object} options - Options de validation
 * @param {number} options.minLength - Longueur minimale (défaut: 2)
 * @param {number} options.maxLength - Longueur maximale (défaut: 50)
 * @returns {string|null} - Le nom sanitisé ou null si invalide
 */
export const sanitizeName = (name, options = {}) => {
  const { minLength = 2, maxLength = 50 } = options;

  if (!name || typeof name !== 'string') {
    return null;
  }

  // Suppression des espaces en début et fin
  let sanitized = name.trim();

  // Vérifier la longueur après le trim
  if (sanitized.length < minLength || sanitized.length > maxLength) {
    return null;
  }

  // Suppression des caractères de contrôle et non-imprimables
  sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Vérifier que le nom contient uniquement des caractères valides
  // Caractères autorisés: lettres, chiffres, espaces, points, tirets, underscores et apostrophes
  const nameRegex = /^[a-zA-Z0-9\u00C0-\u017F\s._'-]+$/;

  if (!nameRegex.test(sanitized)) {
    return null;
  }

  return sanitized;
};

/**
 * Sanitise un numéro de téléphone
 * - Supprime les espaces, tirets et parenthèses
 * - Conserve uniquement les chiffres et le signe + au début
 * - Valide le format général d'un numéro de téléphone
 *
 * @param {string} phone - Le numéro de téléphone à sanitiser
 * @param {Object} options - Options de validation
 * @param {number} options.minLength - Longueur minimale (défaut: 6)
 * @param {number} options.maxLength - Longueur maximale (défaut: 15)
 * @param {boolean} options.allowIntlPrefix - Autoriser le préfixe international (défaut: true)
 * @returns {string|null} - Le numéro de téléphone sanitisé ou null si invalide
 */
export const sanitizePhone = (phone, options = {}) => {
  const { minLength = 6, maxLength = 15, allowIntlPrefix = true } = options;

  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Suppression des espaces en début et fin
  let sanitized = phone.trim();

  // Suppression des caractères de contrôle et non-imprimables
  sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Conserver uniquement le préfixe + et les chiffres
  if (allowIntlPrefix && sanitized.startsWith('+')) {
    sanitized = '+' + sanitized.substring(1).replace(/[^0-9]/g, '');
  } else {
    sanitized = sanitized.replace(/[^0-9]/g, '');
  }

  // Vérifier la longueur
  if (sanitized.length < minLength || sanitized.length > maxLength) {
    return null;
  }

  // Vérifier le format basique d'un numéro de téléphone
  // Si le préfixe international est autorisé, on accepte un + au début
  const phoneRegex = allowIntlPrefix
    ? /^(\+[0-9]{1,3})?[0-9]{6,14}$/
    : /^[0-9]{6,15}$/;

  if (!phoneRegex.test(sanitized)) {
    return null;
  }

  return sanitized;
};

/**
 * Vérifie si des identifiants sont valides après sanitisation
 * @param {Object} credentials - Les identifiants sanitisés
 * @returns {boolean} - true si les identifiants sont valides
 */
export const areCredentialsValid = (credentials = {}) => {
  return Boolean(credentials.email && credentials.password);
};

export default {
  sanitizeEmail,
  sanitizePassword,
  sanitizeCredentials,
  sanitizeName,
  sanitizePhone,
  areCredentialsValid,
};
