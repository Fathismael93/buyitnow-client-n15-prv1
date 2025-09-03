import 'server-only';

import { cookies } from 'next/headers';
import { getCookieName } from '@/helpers/helpers';
import { parseProductSearchParams } from '@/utils/inputSanitizer';

/**
 * Récupère tous les produits depuis l'API
 * Version simplifiée et optimisée pour ~500 visiteurs/jour
 *
 * @param {Object} searchParams - Paramètres de recherche (objet JavaScript)
 * @returns {Promise<Object>} Données des produits ou erreur
 */
export const getAllProducts = async (searchParams) => {
  try {
    // 1. Convertir l'objet searchParams en URLSearchParams
    // Car parseProductSearchParams attend un URLSearchParams, pas un objet JS
    const urlSearchParams = new URLSearchParams();

    if (searchParams) {
      // Ajouter tous les paramètres de l'objet dans URLSearchParams
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          urlSearchParams.set(key, String(value));
        }
      });
    }

    // 2. Parser et nettoyer les paramètres de recherche
    // parseProductSearchParams retourne déjà le bon format avec price[gte] et price[lte]
    const cleanParams = parseProductSearchParams(urlSearchParams);

    // 3. Construire la query string directement depuis cleanParams
    // parseProductSearchParams retourne déjà le bon format, on l'utilise tel quel
    const searchQuery = new URLSearchParams(cleanParams).toString();

    // 4. Construire l'URL complète de l'API
    const apiUrl = `${process.env.API_URL || ''}/api/products${
      searchQuery ? `?${searchQuery}` : ''
    }`;

    console.log('Fetching products from:', apiUrl); // Log pour debug

    // 5. Faire l'appel API avec timeout raisonnable (5 secondes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        revalidate: 300, // Cache Next.js de 5 minutes
        tags: ['products'],
      },
    });

    clearTimeout(timeoutId);

    // 6. Vérifier le statut HTTP
    if (!res.ok) {
      // Gestion simple des erreurs principales
      if (res.status === 400) {
        console.error('Bad request - Invalid parameters');
        return {
          success: false,
          message: 'Paramètres de requête invalides',
          data: { products: [], totalPages: 0 },
        };
      }

      if (res.status === 404) {
        return {
          success: false,
          message: 'Aucun produit trouvé',
          data: { products: [], totalPages: 0 },
        };
      }

      // Erreur serveur générique pour tous les autres cas
      console.error(`API Error: ${res.status} - ${res.statusText}`);
      return {
        success: false,
        message: 'Erreur lors de la récupération des produits',
        data: { products: [], totalPages: 0 },
      };
    }

    // 7. Parser la réponse JSON
    const responseBody = await res.json();

    // 8. Vérifier la structure de la réponse
    if (!responseBody.success || !responseBody.data) {
      console.error('Invalid API response structure:', responseBody);
      return {
        success: false,
        message: responseBody.message || 'Réponse API invalide',
        data: { products: [], totalPages: 0 },
      };
    }

    // 9. Retourner les données avec succès
    return {
      success: true,
      message: 'Produits récupérés avec succès',
      data: {
        products: responseBody.data.products || [],
        totalPages: responseBody.data.totalPages || 0,
        totalProducts: responseBody.data.totalProducts || 0,
      },
    };
  } catch (error) {
    // 10. Gestion des erreurs réseau/timeout
    if (error.name === 'AbortError') {
      console.error('Request timeout after 5 seconds');
      return {
        success: false,
        message: 'La requête a pris trop de temps',
        data: { products: [], totalPages: 0 },
      };
    }

    // Erreur réseau générique
    console.error('Network error:', error.message);
    return {
      success: false,
      message: 'Problème de connexion réseau',
      data: { products: [], totalPages: 0 },
    };
  }
};

/**
 * Récupère toutes les catégories depuis l'API
 * Version simplifiée et optimisée pour ~500 visiteurs/jour
 *
 * @returns {Promise<Object>} Données des catégories ou erreur
 */
export const getCategories = async () => {
  try {
    // 1. Construire l'URL de l'API (très simple pour les catégories)
    const apiUrl = `${process.env.API_URL || ''}/api/category`;

    console.log('Fetching categories from:', apiUrl); // Log pour debug

    // 2. Faire l'appel API avec timeout raisonnable (5 secondes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        revalidate: 1800, // Cache Next.js de 30 minutes (les catégories changent rarement)
        tags: ['categories'],
      },
    });

    clearTimeout(timeoutId);

    // 3. Vérifier le statut HTTP
    if (!res.ok) {
      console.error(`API Error: ${res.status} - ${res.statusText}`);

      // Gestion simple pour les erreurs principales
      if (res.status === 404) {
        return {
          success: true, // Succès mais liste vide
          message: 'Aucune catégorie disponible',
          categories: [],
          count: 0,
        };
      }

      // Erreur serveur générique
      return {
        success: false,
        message: 'Erreur lors de la récupération des catégories',
        categories: [],
        count: 0,
      };
    }

    // 4. Parser la réponse JSON
    const responseBody = await res.json();

    // 5. Vérifier la structure de la réponse
    if (!responseBody.success || !responseBody.data) {
      console.error('Invalid API response structure:', responseBody);
      return {
        success: false,
        message: responseBody.message || 'Réponse API invalide',
        categories: [],
        count: 0,
      };
    }

    // 6. Retourner les données avec succès
    const categories = responseBody.data.categories || [];

    return {
      success: true,
      message: 'Catégories récupérées avec succès',
      categories: categories,
      count: responseBody.data.count || categories.length,
    };
  } catch (error) {
    // 7. Gestion des erreurs réseau/timeout
    if (error.name === 'AbortError') {
      console.error('Request timeout after 5 seconds');
      return {
        success: false,
        message: 'La requête a pris trop de temps',
        categories: [],
        count: 0,
      };
    }

    // Erreur réseau générique
    console.error('Network error:', error.message);
    return {
      success: false,
      message: 'Problème de connexion réseau',
      categories: [],
      count: 0,
    };
  }
};

/**
 * Récupère les détails d'un produit par son ID
 * Version simplifiée et optimisée pour ~500 visiteurs/jour
 *
 * @param {string} id - L'ID MongoDB du produit
 * @returns {Promise<Object>} Détails du produit ou erreur
 */
export const getProductDetails = async (id) => {
  try {
    // 1. Validation simple de l'ID MongoDB (24 caractères hexadécimaux)
    if (!id || typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
      console.error('Invalid product ID format:', id);
      return {
        success: false,
        message: "Format d'identifiant de produit invalide",
        notFound: true,
      };
    }

    // 2. Construire l'URL de l'API
    const apiUrl = `${process.env.API_URL || ''}/api/products/${id}`;

    console.log('Fetching product details from:', apiUrl); // Log pour debug

    // 3. Faire l'appel API avec timeout raisonnable (5 secondes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      next: {
        revalidate: 600, // Cache Next.js de 10 minutes pour un produit spécifique
        tags: ['product', `product-${id}`],
      },
    });

    clearTimeout(timeoutId);

    // 4. Vérifier le statut HTTP
    if (!res.ok) {
      // Gestion simple des erreurs principales
      if (res.status === 400) {
        return {
          success: false,
          message: "Format d'identifiant invalide",
          notFound: true,
        };
      }

      if (res.status === 404) {
        return {
          success: false,
          message: 'Produit non trouvé',
          notFound: true,
        };
      }

      // Erreur serveur générique
      console.error(`API Error: ${res.status} - ${res.statusText}`);
      return {
        success: false,
        message: 'Erreur lors de la récupération du produit',
        notFound: false,
      };
    }

    // 5. Parser la réponse JSON
    const responseBody = await res.json();

    // 6. Vérifier la structure de la réponse
    if (!responseBody.success || !responseBody.data?.product) {
      console.error('Invalid API response structure:', responseBody);
      return {
        success: false,
        message: responseBody.message || 'Données du produit manquantes',
        notFound: true,
      };
    }

    // 7. Retourner les données avec succès
    return {
      success: true,
      product: responseBody.data.product,
      sameCategoryProducts: responseBody.data.sameCategoryProducts || [],
      message: 'Produit récupéré avec succès',
    };
  } catch (error) {
    // 8. Gestion des erreurs réseau/timeout
    if (error.name === 'AbortError') {
      console.error('Request timeout after 5 seconds');
      return {
        success: false,
        message: 'La requête a pris trop de temps',
        notFound: false,
      };
    }

    // Erreur réseau générique
    console.error('Network error:', error.message);
    return {
      success: false,
      message: 'Problème de connexion réseau',
      notFound: false,
    };
  }
};

/**
 * Récupère toutes les adresses d'un utilisateur
 * Version simplifiée et optimisée pour ~500 visiteurs/jour
 *
 * @param {string} page - Contexte de la page ('profile' ou 'shipping')
 * @returns {Promise<Object>} Données des adresses ou erreur
 */
export const getAllAddresses = async (page = 'shipping') => {
  try {
    // 1. Valider le paramètre page
    if (page && !['profile', 'shipping'].includes(page)) {
      console.warn('Invalid page parameter, using default:', page);
      page = 'shipping';
    }

    // 2. Obtenir le cookie d'authentification
    const nextCookies = await cookies();
    const cookieName = getCookieName();
    const authToken = nextCookies.get(cookieName);

    // 3. Vérifier l'authentification
    if (!authToken) {
      console.warn('No authentication token found');
      return {
        success: false,
        message: 'Authentification requise',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }

    // 4. Construire l'URL de l'API avec le contexte
    const apiUrl = `${process.env.API_URL || ''}/api/address?context=${page}`;

    console.log('Fetching addresses from:', apiUrl); // Log pour debug

    // 5. Faire l'appel API avec timeout (5 secondes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${authToken.name}=${authToken.value}`,
      },
      next: {
        revalidate: 0, // Pas de cache pour les données utilisateur
        tags: ['user-addresses'],
      },
    });

    clearTimeout(timeoutId);

    // 6. Vérifier le statut HTTP
    if (!res.ok) {
      // Gestion simple des erreurs principales
      if (res.status === 401) {
        return {
          success: false,
          message: 'Authentification requise',
          data:
            page === 'profile'
              ? { addresses: [] }
              : { addresses: [], paymentTypes: [], deliveryPrice: [] },
        };
      }

      if (res.status === 404) {
        return {
          success: true, // Succès mais liste vide
          message: 'Aucune adresse trouvée',
          data:
            page === 'profile'
              ? { addresses: [] }
              : { addresses: [], paymentTypes: [], deliveryPrice: [] },
        };
      }

      // Erreur serveur générique
      console.error(`API Error: ${res.status} - ${res.statusText}`);
      return {
        success: false,
        message: 'Erreur lors de la récupération des adresses',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }

    // 7. Parser la réponse JSON
    const responseBody = await res.json();

    // 8. Vérifier la structure de la réponse
    if (!responseBody.success || !responseBody.data) {
      console.error('Invalid API response structure:', responseBody);
      return {
        success: false,
        message: responseBody.message || 'Réponse API invalide',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }

    // 9. Formater les données selon le contexte
    let responseData = { ...responseBody.data };

    // Si on est sur la page profil, on n'a pas besoin des données de paiement
    if (page === 'profile') {
      responseData = {
        addresses: responseData.addresses || [],
      };
    } else {
      // Page shipping : on garde tout
      responseData = {
        addresses: responseData.addresses || [],
        paymentTypes: responseData.paymentTypes || [],
        deliveryPrice: responseData.deliveryPrice || [],
      };
    }

    // 10. Retourner les données avec succès
    return {
      success: true,
      message: 'Adresses récupérées avec succès',
      data: responseData,
    };
  } catch (error) {
    // 11. Gestion des erreurs réseau/timeout
    if (error.name === 'AbortError') {
      console.error('Request timeout after 5 seconds');
      return {
        success: false,
        message: 'La requête a pris trop de temps',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }

    // Erreur réseau générique
    console.error('Network error:', error.message);
    return {
      success: false,
      message: 'Problème de connexion réseau',
      data:
        page === 'profile'
          ? { addresses: [] }
          : { addresses: [], paymentTypes: [], deliveryPrice: [] },
    };
  }
};

/**
 * Récupère une adresse spécifique par son ID
 * Version simplifiée et optimisée pour ~500 visiteurs/jour
 *
 * @param {string} id - L'ID MongoDB de l'adresse
 * @returns {Promise<Object>} Détails de l'adresse ou erreur
 */
export const getSingleAddress = async (id) => {
  try {
    // 1. Validation simple de l'ID MongoDB (24 caractères hexadécimaux)
    if (!id || typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
      console.error('Invalid address ID format:', id);
      return {
        success: false,
        message: "Format d'identifiant d'adresse invalide",
        notFound: true,
      };
    }

    // 2. Obtenir le cookie d'authentification
    const nextCookies = await cookies();
    const cookieName = getCookieName();
    const authToken = nextCookies.get(cookieName);

    // 3. Vérifier l'authentification
    if (!authToken) {
      console.warn('No authentication token found');
      return {
        success: false,
        message: 'Authentification requise',
        notFound: false,
      };
    }

    // 4. Construire l'URL de l'API
    const apiUrl = `${process.env.API_URL || ''}/api/address/${id}`;

    console.log('Fetching address from:', apiUrl); // Log pour debug

    // 5. Faire l'appel API avec timeout (5 secondes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${authToken.name}=${authToken.value}`,
      },
      next: {
        revalidate: 0, // Pas de cache pour les données utilisateur
        tags: [`address-${id}`],
      },
    });

    clearTimeout(timeoutId);

    // 6. Vérifier le statut HTTP
    if (!res.ok) {
      // Gestion simple des erreurs principales
      if (res.status === 400) {
        return {
          success: false,
          message: "Format d'identifiant invalide",
          notFound: true,
        };
      }

      if (res.status === 401) {
        return {
          success: false,
          message: 'Authentification requise',
          notFound: false,
        };
      }

      if (res.status === 403) {
        return {
          success: false,
          message: 'Accès interdit à cette adresse',
          notFound: false,
        };
      }

      if (res.status === 404) {
        return {
          success: false,
          message: 'Adresse non trouvée',
          notFound: true,
        };
      }

      // Erreur serveur générique
      console.error(`API Error: ${res.status} - ${res.statusText}`);
      return {
        success: false,
        message: "Erreur lors de la récupération de l'adresse",
        notFound: false,
      };
    }

    // 7. Parser la réponse JSON
    const responseBody = await res.json();

    // 8. Vérifier la structure de la réponse
    if (!responseBody.success || !responseBody.data?.address) {
      console.error('Invalid API response structure:', responseBody);
      return {
        success: false,
        message: responseBody.message || "Données d'adresse manquantes",
        notFound: true,
      };
    }

    // 9. Retourner les données avec succès
    return {
      success: true,
      address: responseBody.data.address,
      message: 'Adresse récupérée avec succès',
    };
  } catch (error) {
    // 10. Gestion des erreurs réseau/timeout
    if (error.name === 'AbortError') {
      console.error('Request timeout after 5 seconds');
      return {
        success: false,
        message: 'La requête a pris trop de temps',
        notFound: false,
      };
    }

    // Erreur réseau générique
    console.error('Network error:', error.message);
    return {
      success: false,
      message: 'Problème de connexion réseau',
      notFound: false,
    };
  }
};

/**
 * Récupère l'historique des commandes de l'utilisateur connecté
 * Version simplifiée et optimisée pour ~500 visiteurs/jour
 *
 * @param {Object} searchParams - Paramètres de recherche (page)
 * @returns {Promise<Object>} Données des commandes ou erreur
 */
export const getAllOrders = async (searchParams) => {
  try {
    // 1. Obtenir le cookie d'authentification
    const nextCookies = await cookies();
    const cookieName = getCookieName();
    const authToken = nextCookies.get(cookieName);

    // 2. Vérifier l'authentification
    if (!authToken) {
      console.warn('No authentication token found');
      return {
        success: false,
        message: 'Authentification requise',
        data: {
          orders: [],
          totalPages: 0,
          currentPage: 1,
          count: 0,
          deliveryPrice: [],
        },
      };
    }

    // 3. Valider et construire les paramètres de pagination
    const urlParams = {};

    if (searchParams?.page) {
      const parsedPage = parseInt(searchParams.page, 10);
      // Validation simple : page entre 1 et 100
      if (!isNaN(parsedPage) && parsedPage > 0 && parsedPage <= 100) {
        urlParams.page = parsedPage;
      } else {
        console.warn('Invalid page parameter:', searchParams.page);
        urlParams.page = 1;
      }
    }

    // 4. Construire l'URL de l'API
    const searchQuery = new URLSearchParams(urlParams).toString();
    const apiUrl = `${process.env.API_URL || ''}/api/orders/me${
      searchQuery ? `?${searchQuery}` : ''
    }`;

    console.log('Fetching orders from:', apiUrl); // Log pour debug

    // 5. Faire l'appel API avec timeout (8 secondes - un peu plus pour les commandes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${authToken.name}=${authToken.value}`,
      },
      next: {
        revalidate: 0, // Pas de cache pour les données utilisateur
        tags: ['user-orders'],
      },
    });

    clearTimeout(timeoutId);

    // 6. Vérifier le statut HTTP
    if (!res.ok) {
      // Gestion simple des erreurs principales
      if (res.status === 401) {
        return {
          success: false,
          message: 'Authentification requise',
          data: {
            orders: [],
            totalPages: 0,
            currentPage: 1,
            count: 0,
            deliveryPrice: [],
          },
        };
      }

      if (res.status === 404) {
        // Utilisateur non trouvé ou pas de commandes
        return {
          success: true,
          message: 'Aucune commande trouvée',
          data: {
            orders: [],
            totalPages: 0,
            currentPage: urlParams.page || 1,
            count: 0,
            deliveryPrice: [],
          },
        };
      }

      // Erreur serveur générique
      console.error(`API Error: ${res.status} - ${res.statusText}`);
      return {
        success: false,
        message: 'Erreur lors de la récupération des commandes',
        data: {
          orders: [],
          totalPages: 0,
          currentPage: 1,
          count: 0,
          deliveryPrice: [],
        },
      };
    }

    // 7. Parser la réponse JSON
    const responseBody = await res.json();

    // 8. Vérifier la structure de la réponse
    if (!responseBody.success || !responseBody.data) {
      console.error('Invalid API response structure:', responseBody);
      return {
        success: false,
        message: responseBody.message || 'Réponse API invalide',
        data: {
          orders: [],
          totalPages: 0,
          currentPage: 1,
          count: 0,
          deliveryPrice: [],
        },
      };
    }

    // 9. Masquer les informations sensibles de paiement
    const sanitizedOrders = (responseBody.data.orders || []).map((order) => ({
      ...order,
      // Masquer le numéro de compte de paiement
      paymentInfo: order.paymentInfo
        ? {
            ...order.paymentInfo,
            paymentAccountNumber:
              order.paymentInfo.paymentAccountNumber?.includes('••••••')
                ? order.paymentInfo.paymentAccountNumber
                : '••••••' +
                  (order.paymentInfo.paymentAccountNumber?.slice(-4) || ''),
          }
        : order.paymentInfo,
    }));

    // 10. Retourner les données avec succès
    return {
      success: true,
      message:
        responseBody.data.count > 0
          ? 'Commandes récupérées avec succès'
          : 'Aucune commande trouvée',
      data: {
        orders: sanitizedOrders,
        totalPages: responseBody.data.totalPages || 0,
        currentPage: responseBody.data.currentPage || urlParams.page || 1,
        count: responseBody.data.count || 0,
        perPage: responseBody.data.perPage || 10,
        deliveryPrice: responseBody.data.deliveryPrice || [],
      },
    };
  } catch (error) {
    // 11. Gestion des erreurs réseau/timeout
    if (error.name === 'AbortError') {
      console.error('Request timeout after 8 seconds');
      return {
        success: false,
        message: 'La requête a pris trop de temps',
        data: {
          orders: [],
          totalPages: 0,
          currentPage: 1,
          count: 0,
          deliveryPrice: [],
        },
      };
    }

    // Erreur réseau générique
    console.error('Network error:', error.message);
    return {
      success: false,
      message: 'Problème de connexion réseau',
      data: {
        orders: [],
        totalPages: 0,
        currentPage: 1,
        count: 0,
        deliveryPrice: [],
      },
    };
  }
};
