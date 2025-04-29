/**
 * Vérifie si une valeur est un tableau non vide
 * @param {Array} array - Tableau à vérifier
 * @returns {boolean} - true si le tableau est vide ou non défini
 */
export const arrayHasData = (array) => {
  return !Array.isArray(array) || array.length === 0;
};

/**
 * Formate un nombre en prix avec le symbole de devise
 * @param {number|string} value - Montant à formater
 * @param {string} currency - Symbole de la devise ($ par défaut)
 * @param {number} decimals - Nombre de décimales (2 par défaut)
 * @returns {string} - Prix formaté
 */
export const formatPrice = (value, currency = '$', decimals = 2) => {
  // Convertir en nombre et gérer les valeurs non numériques
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  const amount = isNaN(numValue) ? 0 : numValue;

  // Formater avec le nombre de décimales spécifié
  return `${currency} ${amount.toFixed(decimals)}`;
};

/**
 * Tronque une chaîne à la longueur spécifiée et ajoute des points de suspension
 * @param {string} str - Chaîne à tronquer
 * @param {number} length - Longueur maximale
 * @returns {string} - Chaîne tronquée
 */
export const truncateString = (str, length = 50) => {
  if (!str || typeof str !== 'string') return '';
  return str.length > length ? `${str.substring(0, length)}...` : str;
};

/**
 * Génère un ID unique basé sur un timestamp et un nombre aléatoire
 * @returns {string} - ID unique
 */
export const generateUniqueId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Formate une date selon la locale et les options spécifiées
 * @param {Date|string|number} date - Date à formater
 * @param {Object} options - Options de formatage (voir Intl.DateTimeFormat)
 * @param {string} locale - Locale à utiliser (fr-FR par défaut)
 * @returns {string} - Date formatée
 */
export const formatDate = (date, options = {}, locale = 'fr-FR') => {
  if (!date) return '';

  const dateObj = date instanceof Date ? date : new Date(date);

  if (isNaN(dateObj.getTime())) return '';

  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  };

  return new Intl.DateTimeFormat(locale, defaultOptions).format(dateObj);
};

/**
 * Retarde l'exécution d'une fonction (utile pour les recherches)
 * @param {Function} func - Fonction à exécuter
 * @param {number} delay - Délai en millisecondes
 * @returns {Function} - Fonction avec délai
 */
export const debounce = (func, delay = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
};

/**
 * Vérifie si un objet est vide
 * @param {Object} obj - Objet à vérifier
 * @returns {boolean} - true si l'objet est vide
 */
export const isEmptyObject = (obj) => {
  if (!obj || typeof obj !== 'object') return true;
  return Object.keys(obj).length === 0;
};

/**
 * Récupère une valeur imbriquée dans un objet de manière sécurisée
 * @param {Object} obj - Objet à explorer
 * @param {string} path - Chemin de la propriété (ex: 'user.address.city')
 * @param {*} defaultValue - Valeur par défaut si le chemin n'existe pas
 * @returns {*} - Valeur trouvée ou valeur par défaut
 */
export const getNestedValue = (obj, path, defaultValue = null) => {
  if (!obj || !path) return defaultValue;

  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined || typeof result !== 'object') {
      return defaultValue;
    }
    result = result[key];
  }

  return result === undefined ? defaultValue : result;
};

/**
 * Convertit un objet en paramètres d'URL
 * @param {Object} params - Objet contenant les paramètres
 * @returns {string} - Chaîne de requête URL
 */
export const objectToQueryString = (params) => {
  if (!params || typeof params !== 'object') return '';

  return Object.entries(params)
    .filter(
      ([_, value]) => value !== undefined && value !== null && value !== '',
    )
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value
          .map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
          .join('&');
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
};

/**
 * Met en majuscule la première lettre d'une chaîne
 * @param {string} str - Chaîne à transformer
 * @returns {string} - Chaîne avec première lettre en majuscule
 */
export const capitalizeFirstLetter = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Retourne une version sécurisée d'une valeur (évite undefined/null)
 * @param {*} value - Valeur à sécuriser
 * @param {*} defaultValue - Valeur par défaut
 * @returns {*} - Valeur sécurisée
 */
export const safeValue = (value, defaultValue = '') => {
  return value === undefined || value === null ? defaultValue : value;
};

export const getPriceQueryParams = (queryParams, key, value) => {
  const hasValueInParam = queryParams.has(key);

  if (value && hasValueInParam) {
    queryParams.set(key, value);
  } else if (value) {
    queryParams.append(key, value);
  } else if (hasValueInParam) {
    queryParams.delete(key);
  }
  return queryParams;
};

export const getCookieName = () => {
  let cookieName = '';

  if (process.env.NODE_ENV === 'development') {
    cookieName = 'next-auth.session-token';
  }

  if (process.env.NODE_ENV === 'production') {
    cookieName = '__Secure-next-auth.session-token';
  }

  return cookieName;
};

export const parseCallbackUrl = (url) => {
  const res = url.replace(/%3A/g, ':').replace(/%2F/g, '/');
  return res;
};
