/* eslint-disable no-control-regex */
/**
 * @fileoverview Utilitaire de sanitisation avancée pour les entrées utilisateur
 * Complète la validation Yup avec des sanitisations spécifiques à chaque type d'entrée
 */

/**
 * Sanitise une chaîne de texte en supprimant les caractères potentiellement dangereux
 * @param {string} value - La valeur à sanitiser
 * @returns {string} - La valeur sanitisée
 */
export const sanitizeString = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') {
    value = String(value);
  }

  // Suppression des caractères de contrôle et non-imprimables
  value = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

  // Encodage des caractères HTML spéciaux pour éviter les attaques XSS
  value = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Suppression des caractères utilisés dans les attaques SQL/NoSQL
  value = value.replace(/(\$|;|--|\/\*|\*\/|@@|@)/g, '');

  // Normalisation des espaces multiples
  value = value.replace(/\s+/g, ' ').trim();

  return value;
};

/**
 * Sanitise une valeur numérique
 * @param {number|string} value - La valeur à sanitiser
 * @param {Object} options - Options de sanitisation
 * @returns {number|null} - La valeur sanitisée
 */
export const sanitizeNumber = (value, options = {}) => {
  const {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
    allowNull = true,
  } = options;

  if ((value === null || value === undefined || value === '') && allowNull) {
    return null;
  }

  // Conversion en nombre
  let sanitized = typeof value === 'string' ? value.trim() : value;

  // Suppression de tous les caractères non numériques sauf le point décimal
  if (typeof sanitized === 'string') {
    // On garde uniquement les chiffres et le point décimal
    sanitized = sanitized.replace(/[^\d.eE-]/g, '');
    // Si format scientifique, convertir directement
    sanitized = Number(sanitized);
  }

  // Vérification que c'est un nombre valide et dans les limites
  if (isNaN(sanitized) || !isFinite(sanitized)) {
    return allowNull ? null : 0;
  }

  // Application des limites min et max
  return Math.min(Math.max(sanitized, min), max);
};

/**
 * Sanitise un identifiant MongoDB ObjectId
 * @param {string} value - La valeur à sanitiser
 * @returns {string|null} - L'ObjectId sanitisé ou null si invalide
 */
export const sanitizeObjectId = (value) => {
  if (!value) return null;

  // Convertir en chaîne si ce n'est pas déjà le cas
  const strValue = String(value).trim();

  // Vérifier si l'ID correspond au format d'un ObjectId MongoDB
  if (/^[0-9a-fA-F]{24}$/.test(strValue)) {
    return strValue;
  }

  return null;
};

/**
 * Sanitise une valeur booléenne ou un état de checkbox
 * @param {boolean|string|number} value - La valeur à sanitiser
 * @returns {boolean} - La valeur booléenne sanitisée
 */
export const sanitizeBoolean = (value) => {
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
 * Sanitise une valeur de page de pagination
 * @param {number|string} value - La valeur de page à sanitiser
 * @param {number} defaultPage - La page par défaut (généralement 1)
 * @param {number} maxPage - La page maximale autorisée
 * @returns {number} - Le numéro de page sanitisé
 */
export const sanitizePage = (value, defaultPage = 1, maxPage = 1000) => {
  const sanitized = sanitizeNumber(value, {
    min: 1,
    max: maxPage,
    allowNull: false,
  });
  return sanitized || defaultPage;
};

/**
 * Sanitise les paramètres de recherche de produits
 * @param {URLSearchParams} searchParams - Les paramètres de recherche
 * @returns {Object} - Les paramètres sanitisés
 */
export const sanitizeProductSearchParams = (searchParams) => {
  // Crée un objet pour stocker les paramètres sanitisés
  const sanitized = {};

  // Sanitise le mot-clé de recherche
  if (searchParams.has('keyword')) {
    sanitized.keyword = sanitizeString(searchParams.get('keyword'));
  }

  // Sanitise la catégorie (ObjectId)
  if (searchParams.has('category')) {
    sanitized.category = sanitizeObjectId(searchParams.get('category'));
  }

  // Sanitise les prix min et max
  if (searchParams.has('price[gte]')) {
    sanitized.minPrice = sanitizeNumber(searchParams.get('price[gte]'), {
      min: 0,
      max: 999999999,
      allowNull: true,
    });
  }

  if (searchParams.has('price[lte]')) {
    sanitized.maxPrice = sanitizeNumber(searchParams.get('price[lte]'), {
      min: 0,
      max: 999999999,
      allowNull: true,
    });
  }

  // Sanitise la page
  if (searchParams.has('page')) {
    sanitized.page = sanitizePage(searchParams.get('page'));
  } else {
    sanitized.page = 1; // Page par défaut
  }

  return sanitized;
};

/**
 * Convertit l'objet de paramètres sanitisés en URLSearchParams
 * Utile pour reconstruire une URL propre
 * @param {Object} sanitizedParams - Les paramètres sanitisés
 * @returns {URLSearchParams} - Objet URLSearchParams
 */
export const buildSanitizedSearchParams = (sanitizedParams) => {
  const params = new URLSearchParams();

  Object.entries(sanitizedParams).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      if (key === 'minPrice') {
        params.set('price[gte]', value);
      } else if (key === 'maxPrice') {
        params.set('price[lte]', value);
      } else {
        params.set(key, value);
      }
    }
  });

  return params;
};

/**
 * Sanitise et valide les données en une seule étape
 * @param {Object} data - Les données à sanitiser et valider
 * @param {Object} schema - Le schéma Yup pour la validation
 * @param {Function} sanitizeFn - La fonction de sanitisation
 * @returns {Promise<Object>} - Les données sanitisées et validées
 * @throws {Error} - Si la validation échoue
 */
export const sanitizeAndValidate = async (data, schema, sanitizeFn) => {
  // Étape 1: Sanitiser les données
  const sanitizedData = sanitizeFn(data);

  // Étape 2: Valider les données sanitisées
  try {
    const validatedData = await schema.validate(sanitizedData, {
      abortEarly: false,
    });
    return validatedData;
  } catch (error) {
    // Transformer l'erreur Yup en format plus exploitable
    const errors = error.inner?.map((e) => ({
      field: e.path,
      message: e.message,
    })) || [{ field: 'unknown', message: error.message }];

    throw {
      name: 'ValidationError',
      errors,
      message: 'Validation failed after sanitization',
    };
  }
};
