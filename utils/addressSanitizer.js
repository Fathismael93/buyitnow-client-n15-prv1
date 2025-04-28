/* eslint-disable no-control-regex */
/**
 * @fileoverview Utilitaire spécialisé pour la sanitisation des adresses
 * Complète la validation Yup avec des sanitisations spécifiques aux champs d'adresse
 */

/**
 * Expressions régulières pour la validation des différents champs d'adresse
 */
const ADDRESS_REGEX = {
  // Détecte les caractères autorisés pour la rue et autres champs textuels
  STREET: /^[a-zA-Z0-9\s,.'°\-/\\]+$/,

  // Détecte les caractères autorisés pour les villes
  CITY: /^[a-zA-Z\s'-]+$/,

  // Détecte les formats de code postal internationaux
  ZIP_CODE: /^[0-9A-Z\s-]{2,10}$/,

  // Détection des caractères de contrôle (à supprimer)
  CONTROL_CHARS: /[\x00-\x1F\x7F-\x9F]/g,

  // Détection des caractères pouvant être utilisés pour des injections
  INJECTION_CHARS: /(\$|;|--|\/\*|\*\/|@@|@|\{|\}|\[|\]|=|<|>|\|)/g,

  // Détection des séquences SQL dangereuses
  SQL_KEYWORDS:
    /(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|UNION|JOIN|FROM|WHERE|GROUP BY|ORDER BY)/gi,

  // Détection d'essais d'injection MongoDB
  NOSQL_OPERATORS:
    /(\$eq|\$gt|\$gte|\$lt|\$lte|\$in|\$nin|\$and|\$or|\$not|\$nor|\$exists|\$type|\$expr)/gi,
};

/**
 * Sanitise une chaîne de texte pour les champs d'adresse
 * @param {string} value - La valeur à sanitiser
 * @param {Object} options - Options de sanitisation
 * @returns {string|null} - La valeur sanitisée ou null si la valeur est invalide
 */
const sanitizeAddressString = (value, options = {}) => {
  const {
    minLength = 1,
    maxLength = 100,
    allowNull = false,
    regexPattern = null,
    required = false,
    trim = true,
  } = options;

  // Gestion des valeurs nulles ou undefined
  if (value === null || value === undefined || value === '') {
    return required ? null : allowNull ? null : '';
  }

  // Conversion en chaîne si ce n'est pas déjà le cas
  let sanitized = typeof value !== 'string' ? String(value) : value;

  // Suppression des espaces en début et fin si demandé
  if (trim) {
    sanitized = sanitized.trim();
  }

  // Si la chaîne est vide après le trim et qu'elle est requise
  if (sanitized === '' && required) {
    return null;
  }

  // Vérification de la longueur minimale (si la chaîne n'est pas vide)
  if (sanitized !== '' && sanitized.length < minLength) {
    return null;
  }

  // Vérification de la longueur maximale
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Suppression des caractères de contrôle et non-imprimables
  sanitized = sanitized.replace(ADDRESS_REGEX.CONTROL_CHARS, '');

  // Suppression des caractères potentiellement dangereux pour les injections
  sanitized = sanitized.replace(ADDRESS_REGEX.INJECTION_CHARS, '');

  // Suppression des mots-clés SQL dangereux (remplacer par des espaces pour maintenir la lisibilité)
  sanitized = sanitized.replace(ADDRESS_REGEX.SQL_KEYWORDS, ' ');

  // Suppression des opérateurs MongoDB (remplacer par des espaces)
  sanitized = sanitized.replace(ADDRESS_REGEX.NOSQL_OPERATORS, ' ');

  // Normalisation des espaces multiples
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Validation avec une expression régulière personnalisée si fournie
  if (regexPattern && !regexPattern.test(sanitized)) {
    // Si la validation échoue et que la valeur est requise, retourner null
    if (required) {
      return null;
    }
    // Sinon, supprimer les caractères non conformes
    sanitized = Array.from(sanitized)
      .filter((char) => regexPattern.test(char))
      .join('');
  }

  // Si après sanitisation, la chaîne est vide et que la valeur est requise
  if (sanitized === '' && required) {
    return null;
  }

  return sanitized;
};

/**
 * Sanitise un code postal
 * @param {string} zipCode - Le code postal à sanitiser
 * @returns {string|null} - Le code postal sanitisé ou null si invalide
 */
const sanitizeZipCode = (zipCode) => {
  if (!zipCode) return null;

  // Convertir en chaîne si ce n'est pas déjà le cas
  let sanitized = typeof zipCode !== 'string' ? String(zipCode) : zipCode;

  // Suppression des espaces en début et fin
  sanitized = sanitized.trim();

  // Suppression des caractères de contrôle
  sanitized = sanitized.replace(ADDRESS_REGEX.CONTROL_CHARS, '');

  // Ne garder que les caractères alphanumériques et tirets
  sanitized = sanitized.replace(/[^a-zA-Z0-9\-\s]/g, '');

  // Normalisation des espaces multiples et suppression des espaces en fin
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Supprimer tous les espaces pour la validation
  const noSpaces = sanitized.replace(/\s/g, '');

  // Vérifier le format après suppression des espaces
  if (!ADDRESS_REGEX.ZIP_CODE.test(noSpaces)) {
    return null;
  }

  return sanitized;
};

/**
 * Sanitise une valeur booléenne
 * @param {boolean|string|number} value - La valeur à sanitiser
 * @returns {boolean} - La valeur booléenne sanitisée
 */
const sanitizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const lowercased = value.toLowerCase().trim();
    return (
      lowercased === 'true' ||
      lowercased === 'on' ||
      lowercased === '1' ||
      lowercased === 'yes'
    );
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
};

/**
 * Sanitise un ObjectId MongoDB (pour les références utilisateur)
 * @param {string} id - L'identifiant à sanitiser
 * @returns {string|null} - L'ObjectId sanitisé ou null si invalide
 */
const sanitizeObjectId = (id) => {
  if (!id) return null;

  // Convertir en chaîne si ce n'est pas déjà le cas
  const strValue = String(id).trim();

  // Vérifier si l'ID correspond au format d'un ObjectId MongoDB
  if (/^[0-9a-fA-F]{24}$/.test(strValue)) {
    return strValue;
  }

  return null;
};

/**
 * Sanitise toutes les données d'adresse
 * @param {Object} addressData - Les données d'adresse à sanitiser
 * @returns {Object} - Les données d'adresse sanitisées
 */
export const sanitizeAddress = (addressData = {}) => {
  // Si aucune donnée n'est fournie, retourner un objet vide
  if (!addressData || typeof addressData !== 'object') {
    return {};
  }

  const sanitized = {};

  // Sanitisation de la rue (obligatoire)
  sanitized.street = sanitizeAddressString(addressData.street, {
    minLength: 3,
    maxLength: 100,
    required: true,
    regexPattern: ADDRESS_REGEX.STREET,
  });

  // Sanitisation des informations complémentaires (optionnel)
  if ('additionalInfo' in addressData) {
    sanitized.additionalInfo = sanitizeAddressString(
      addressData.additionalInfo,
      {
        maxLength: 100,
        allowNull: true,
        regexPattern: ADDRESS_REGEX.STREET,
      },
    );
  }

  // Sanitisation de la ville (obligatoire)
  sanitized.city = sanitizeAddressString(addressData.city, {
    minLength: 2,
    maxLength: 50,
    required: true,
    regexPattern: ADDRESS_REGEX.CITY,
  });

  // Sanitisation de la région/département (obligatoire)
  sanitized.state = sanitizeAddressString(addressData.state, {
    minLength: 2,
    maxLength: 50,
    required: true,
  });

  // Sanitisation du code postal (obligatoire)
  sanitized.zipCode = sanitizeZipCode(addressData.zipCode);

  // Sanitisation du pays (obligatoire)
  sanitized.country = sanitizeAddressString(addressData.country, {
    minLength: 2,
    maxLength: 50,
    required: true,
  });

  // Sanitisation de l'identifiant utilisateur (obligatoire)
  if ('user' in addressData) {
    sanitized.user = sanitizeObjectId(addressData.user);
  }

  // Sanitisation du flag isDefault (optionnel)
  if ('isDefault' in addressData) {
    sanitized.isDefault = sanitizeBoolean(addressData.isDefault);
  }

  return sanitized;
};

/**
 * Vérifie si une adresse sanitisée est valide
 * @param {Object} sanitizedAddress - L'adresse sanitisée à vérifier
 * @returns {boolean} - true si l'adresse est valide
 */
export const isAddressValid = (sanitizedAddress = {}) => {
  return Boolean(
    sanitizedAddress.street &&
      sanitizedAddress.city &&
      sanitizedAddress.state &&
      sanitizedAddress.zipCode &&
      sanitizedAddress.country,
  );
};

/**
 * Sanitise et valide une adresse de manière complète
 * @param {Object} addressData - Les données d'adresse à sanitiser et valider
 * @returns {Object} - Résultat contenant les données sanitisées et un statut de validité
 */
export const sanitizeAndValidateAddress = (addressData = {}) => {
  const sanitized = sanitizeAddress(addressData);
  const isValid = isAddressValid(sanitized);

  return {
    data: sanitized,
    isValid,
    errors: isValid ? [] : detectMissingFields(sanitized),
  };
};

/**
 * Détecte les champs manquants dans une adresse
 * @param {Object} sanitizedAddress - L'adresse sanitisée à vérifier
 * @returns {Array} - Tableau des erreurs (champs manquants)
 */
const detectMissingFields = (sanitizedAddress = {}) => {
  const errors = [];

  if (!sanitizedAddress.street) {
    errors.push({ field: 'street', message: "L'adresse est obligatoire" });
  }

  if (!sanitizedAddress.city) {
    errors.push({ field: 'city', message: 'La ville est obligatoire' });
  }

  if (!sanitizedAddress.state) {
    errors.push({
      field: 'state',
      message: 'La région/département est obligatoire',
    });
  }

  if (!sanitizedAddress.zipCode) {
    errors.push({
      field: 'zipCode',
      message: 'Le code postal est obligatoire ou invalide',
    });
  }

  if (!sanitizedAddress.country) {
    errors.push({ field: 'country', message: 'Le pays est obligatoire' });
  }

  if ('user' in sanitizedAddress && !sanitizedAddress.user) {
    errors.push({
      field: 'user',
      message: "L'identifiant utilisateur est invalide",
    });
  }

  return errors;
};

export default {
  sanitizeAddress,
  sanitizeAndValidateAddress,
  isAddressValid,
};
