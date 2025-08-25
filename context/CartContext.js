/* eslint-disable no-unused-vars */
'use client';

import { DECREASE, INCREASE } from '@/helpers/constants';
import {
  createContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { toast } from 'react-toastify';
import { captureException } from '@/monitoring/sentry';

const CartContext = createContext();

// Constantes pour optimiser les performances
const API_TIMEOUT = 10000; // ms
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY = 1000; // ms

export const CartProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [checkoutInfo, setCheckoutInfo] = useState(null);
  const [orderInfo, setOrderInfo] = useState(null);
  const [error, setError] = useState(null);

  // Référence pour éviter les requêtes en double
  const pendingRequests = useRef(new Set());
  const isFirstLoad = useRef(true);

  // Synchroniser le panier local avec le panier du serveur lors de l'initialisation
  useEffect(() => {
    // N'exécuter qu'au premier montage
    loadCart();
  }, []);

  // Fonction sécurisée pour charger le panier
  const loadCart = useCallback(async () => {
    try {
      await setCartToState();
    } catch (error) {
      console.error('Error loading cart:', error);
    }
  }, []);

  // Fonction utilitaire pour les requêtes API avec retry
  // Dans CartContext.js
  const fetchWithRetry = async (url, options, attemptNumber = 0) => {
    const requestId = `${options.method || 'GET'}-${url}-${Date.now()}`;

    // Éviter les requêtes en double
    if (pendingRequests.current.has(requestId)) {
      return null;
    }

    pendingRequests.current.add(requestId);

    try {
      // Ajouter un timeout à la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      // Vérifier explicitement si la réponse est OK avant de traiter
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erreur ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      // Gérer les timeouts et les erreurs réseau avec retry
      if (
        (error.name === 'AbortError' || error.message.includes('network')) &&
        attemptNumber < RETRY_ATTEMPTS
      ) {
        pendingRequests.current.delete(requestId);

        // Attendre avant de réessayer
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * (attemptNumber + 1)),
        );

        return fetchWithRetry(url, options, attemptNumber + 1);
      }

      throw error;
    } finally {
      pendingRequests.current.delete(requestId);
    }
  };

  const setCartToState = useCallback(async () => {
    // Éviter les appels multiples si déjà en cours de chargement
    if (loading) return;

    try {
      setLoading(true);
      setError(null);

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
          method: 'GET',
          headers,
          signal: controller.signal,
          credentials: 'include', // Inclure les cookies pour les sessions
        });

        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError(
            `Erreur lors du traitement de la réponse du serveur: ${jsonError.message}`,
          );

          // Journaliser l'erreur
          if (process.env.NODE_ENV === 'development') {
            console.error('Erreur de parsing JSON:', jsonError);
          }

          setLoading(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de requêtes. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );

          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation ou requête incorrecte
              setError(data.message || 'Requête invalide');
              break;
            case 401:
              // Non authentifié
              setError('Authentification requise. Veuillez vous connecter.');

              // Rediriger vers la page de connexion si nécessaire
              // setTimeout(() => router.push('/login'), 2000);
              break;
            case 403:
              // Accès interdit
              setError("Vous n'avez pas l'autorisation d'accéder à ce panier");
              break;
            case 404:
              // Utilisateur ou panier non trouvé
              setError('Panier non trouvé');
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );

              // Capturer pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'CartContext';
                serverError.additionalInfo = {
                  context: 'cart',
                  operation: 'get',
                  statusCode,
                  responseMessage: data.message,
                };
                captureException(serverError);
              }
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de la récupération du panier (${statusCode})`,
              );
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Normaliser les données du panier
            remoteDataInState(data);
          } else {
            // Cas où success est explicitement false
            setError(data.message || 'Échec de la récupération du panier');
          }
        } else {
          // Réponse vide ou mal formatée
          setError('Réponse inattendue du serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Toutes gérées via setError
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError('La requête a pris trop de temps. Veuillez réessayer.');
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de la récupération du panier: ${fetchError.message}`,
          );

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'CartContext',
                action: 'setCartToState',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
              },
            });
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError(
        'Une erreur inattendue est survenue lors de la récupération du panier',
      );

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Cart retrieval error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'CartContext';
          error.additionalInfo = {
            context: 'cart',
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  }, []); // Pas de dépendances car la fonction utilise les setters d'état qui sont stables

  const addItemToCart = async ({ product, quantity = 1 }) => {
    try {
      // Vérifications préliminaires
      if (!product) {
        setError('Produit invalide ou non spécifié');
        toast.error('Produit invalide');
        return;
      }

      // Validation de la quantité
      const validQuantity = parseInt(quantity, 10);
      if (isNaN(validQuantity) || validQuantity < 1) {
        setError('La quantité doit être un nombre positif');
        toast.error('Quantité invalide');
        return;
      }

      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            productId: product,
            quantity: validQuantity,
          }),
          signal: controller.signal,
          credentials: 'include', // Inclure les cookies pour les sessions
        });

        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          setError(
            `Erreur lors du traitement de la réponse du serveur: ${jsonError.message}`,
          );
          toast.error('Erreur de communication avec le serveur');

          // Journaliser l'erreur
          if (process.env.NODE_ENV === 'development') {
            console.error(
              "Erreur de parsing JSON lors de l'ajout au panier:",
              jsonError,
            );
          }

          // Capturer pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(jsonError, {
              tags: {
                component: 'CartContext',
                action: 'addItemToCart',
                operation: 'jsonParse',
                productId: product,
              },
            });
          }

          setLoading(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de requêtes. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );
          toast.error(
            `Limite de requêtes atteinte. Veuillez patienter quelques instants.`,
          );
          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation ou requête incorrecte
              if (data.message && data.message.includes('stock')) {
                setError(`Stock insuffisant: ${data.message}`);
                toast.error(data.message || 'Stock insuffisant');
              } else {
                setError(data.message || 'Données invalides');
                toast.error(
                  data.message || "Impossible d'ajouter ce produit au panier",
                );
              }
              break;
            case 401:
              // Non authentifié
              setError('Authentification requise. Veuillez vous connecter.');
              toast.error(
                'Veuillez vous connecter pour ajouter des produits au panier',
              );
              // Possibilité de rediriger vers la page de connexion
              // setTimeout(() => router.push('/login'), 2000);
              break;
            case 403:
              // Accès interdit
              setError(
                "Vous n'avez pas l'autorisation d'effectuer cette action",
              );
              toast.error('Accès non autorisé');
              break;
            case 404:
              // Produit ou utilisateur non trouvé
              if (data.message && data.message.includes('Product')) {
                setError(
                  "Le produit demandé n'existe pas ou n'est plus disponible",
                );
                toast.error('Produit non disponible');
              } else {
                setError('Utilisateur non trouvé');
                toast.error('Session utilisateur invalide');
              }
              break;
            case 409:
              // Conflit (produit déjà dans le panier)
              setError('Ce produit est déjà dans votre panier');
              toast.info(
                'Ce produit est déjà dans votre panier. Vous pouvez modifier la quantité depuis le panier.',
              );
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );
              toast.error('Service temporairement indisponible');

              // Capturer pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'CartContext';
                serverError.additionalInfo = {
                  context: 'cart',
                  operation: 'add',
                  productId: product,
                  quantity: validQuantity,
                  statusCode,
                  responseMessage: data.message,
                };
                captureException(serverError);
              }
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de l'ajout au panier (${statusCode})`,
              );
              toast.error(data.message || "Erreur lors de l'ajout au panier");
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Mise à jour du panier avec les nouvelles données
            await setCartToState();

            // Notification de succès
            toast.success(data.message || 'Produit ajouté au panier', {
              position: 'bottom-right',
              autoClose: 3000,
            });
          } else if (data.success === false) {
            // Cas où success est explicitement false
            setError(data.message || "Échec de l'ajout au panier");
            toast.error(data.message || "Échec de l'ajout au panier");

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              const errorMessage = `${data.message || "Échec de l'ajout au panier"}: ${data.errors.map((e) => e.message || e).join(', ')}`;
              setError(errorMessage);
              toast.error(errorMessage);
            }
          } else {
            // Réponse JSON valide mais structure inattendue
            setError("Réponse inattendue du serveur lors de l'ajout au panier");
            toast.error("Erreur lors de l'ajout au panier");
          }
        } else {
          // Réponse vide ou mal formatée
          setError('Réponse vide ou invalide du serveur');
          toast.error('Erreur lors de la communication avec le serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Erreurs réseau - Toutes gérées via setError et toast
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError(
            "La requête d'ajout au panier a pris trop de temps. Veuillez réessayer.",
          );
          toast.error(
            'La connexion au serveur est trop lente. Veuillez réessayer.',
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
          toast.error(
            'Problème de connexion internet. Vérifiez votre connexion.',
          );
        } else {
          // Autres erreurs fetch
          setError(`Erreur lors de l'ajout au panier: ${fetchError.message}`);
          toast.error('Une erreur est survenue. Veuillez réessayer.');

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'CartContext';
            fetchError.additionalInfo = {
              context: 'cart',
              operation: 'add',
              productId: product,
              quantity,
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'CartContext',
                action: 'addItemToCart',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
                productId: product,
              },
            });
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError("Une erreur inattendue est survenue lors de l'ajout au panier");
      toast.error('Une erreur inattendue est survenue');

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Cart add item error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'CartContext';
          error.additionalInfo = {
            context: 'cart',
            operation: 'add',
            productId: product,
            quantity,
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateCart = async (product, action) => {
    try {
      // Validation préliminaire
      if (!product || !product.id) {
        setError('Produit invalide ou non spécifié');
        toast.error('Impossible de mettre à jour: produit invalide');
        return;
      }

      if (!action || (action !== INCREASE && action !== DECREASE)) {
        setError('Action invalide');
        toast.error('Type de mise à jour non valide');
        return;
      }

      // Si DECREASE et quantité = 1, informer l'utilisateur d'utiliser le bouton Supprimer
      if (action === DECREASE && product.quantity === 1) {
        toast.info(
          "Quantité minimale atteinte. Pour supprimer l'article, utilisez le bouton Supprimer.",
          { position: 'bottom-right' },
        );
        return;
      }

      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Sauvegarde de l'état actuel du panier pour restauration en cas d'erreur
      const previousCart = [...cart];
      const previousCount = cartCount;
      const previousTotal = cartTotal;

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            product,
            value: action,
          }),
          signal: controller.signal,
          credentials: 'include', // Inclure les cookies pour les sessions
        });

        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          // Restaurer l'état précédent en cas d'erreur
          setCart(previousCart);
          setCartCount(previousCount);
          setCartTotal(previousTotal);

          setError(
            `Erreur lors du traitement de la réponse du serveur: ${jsonError.message}`,
          );
          toast.error('Erreur de communication avec le serveur');

          // Journaliser l'erreur
          if (process.env.NODE_ENV === 'development') {
            console.error(
              'Erreur de parsing JSON lors de la mise à jour du panier:',
              jsonError,
            );
          }

          // Capturer pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(jsonError, {
              tags: {
                component: 'CartContext',
                action: 'updateCart',
                operation: 'jsonParse',
                productId: product.id,
                updateAction: action,
              },
            });
          }

          setLoading(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Restaurer l'état précédent
          setCart(previousCart);
          setCartCount(previousCount);
          setCartTotal(previousTotal);

          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de requêtes. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );
          toast.error(
            `Trop de requêtes. Veuillez patienter quelques instants.`,
          );
          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          // Restaurer l'état précédent
          setCart(previousCart);
          setCartCount(previousCount);
          setCartTotal(previousTotal);

          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation ou requête incorrecte
              if (data.message && data.message.includes('stock')) {
                setError(`Stock insuffisant: ${data.message}`);
                toast.error(data.message || 'Stock insuffisant');
              } else if (
                data.message &&
                data.message.includes('Invalid action')
              ) {
                setError('Action non valide');
                toast.error('Action non valide');
              } else {
                setError(data.message || 'Données invalides');
                toast.error(
                  data.message || 'Impossible de mettre à jour le panier',
                );
              }
              break;
            case 401:
              // Non authentifié
              setError('Authentification requise. Veuillez vous connecter.');
              toast.error('Veuillez vous connecter pour modifier votre panier');
              // Possibilité de rediriger vers la page de connexion
              // setTimeout(() => router.push('/login'), 2000);
              break;
            case 403:
              // Accès interdit
              setError(
                "Vous n'avez pas l'autorisation d'effectuer cette action",
              );
              toast.error('Accès non autorisé');
              break;
            case 404:
              // Produit ou utilisateur non trouvé
              if (data.message && data.message.includes('Cart item')) {
                setError("L'article n'existe plus dans votre panier");
                toast.error('Article non trouvé dans votre panier');
              } else if (data.message && data.message.includes('Product')) {
                setError(
                  "Le produit demandé n'existe pas ou n'est plus disponible",
                );
                toast.error('Produit non disponible');
              } else {
                setError('Utilisateur non trouvé');
                toast.error('Session utilisateur invalide');
              }
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );
              toast.error('Service temporairement indisponible');

              // Capturer pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'CartContext';
                serverError.additionalInfo = {
                  context: 'cart',
                  operation: 'update',
                  productId: product.id,
                  action,
                  statusCode,
                  responseMessage: data.message,
                };
                captureException(serverError);
              }
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de la mise à jour du panier (${statusCode})`,
              );
              toast.error(
                data.message || 'Erreur lors de la mise à jour du panier',
              );
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Mise à jour du panier avec les nouvelles données du serveur
            await setCartToState();

            // Notification de succès selon l'action
            if (action === INCREASE) {
              toast.success('Quantité augmentée', {
                position: 'bottom-right',
                autoClose: 2000,
              });
            } else if (action === DECREASE) {
              if (data.data.operation === 'remove') {
                toast.success('Produit retiré du panier', {
                  position: 'bottom-right',
                  autoClose: 2000,
                });
              } else {
                toast.success('Quantité diminuée', {
                  position: 'bottom-right',
                  autoClose: 2000,
                });
              }
            }
          } else if (data.success === false) {
            // Restaurer l'état précédent
            setCart(previousCart);
            setCartCount(previousCount);
            setCartTotal(previousTotal);

            // Cas où success est explicitement false
            setError(data.message || 'Échec de la mise à jour du panier');
            toast.error(data.message || 'Échec de la mise à jour du panier');

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              const errorMessage = `${data.message || 'Échec de la mise à jour du panier'}: ${data.errors.map((e) => e.message || e).join(', ')}`;
              setError(errorMessage);
              toast.error(errorMessage);
            }
          } else {
            // Restaurer l'état précédent
            setCart(previousCart);
            setCartCount(previousCount);
            setCartTotal(previousTotal);

            // Réponse JSON valide mais structure inattendue
            setError(
              'Réponse inattendue du serveur lors de la mise à jour du panier',
            );
            toast.error('Erreur lors de la mise à jour du panier');
          }
        } else {
          // Restaurer l'état précédent
          setCart(previousCart);
          setCartCount(previousCount);
          setCartTotal(previousTotal);

          // Réponse vide ou mal formatée
          setError('Réponse vide ou invalide du serveur');
          toast.error('Erreur lors de la communication avec le serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Restaurer l'état précédent
        setCart(previousCart);
        setCartCount(previousCount);
        setCartTotal(previousTotal);

        // Erreurs réseau - Toutes gérées via setError et toast
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError(
            'La requête de mise à jour du panier a pris trop de temps. Veuillez réessayer.',
          );
          toast.error(
            'La connexion au serveur est trop lente. Veuillez réessayer.',
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
          toast.error(
            'Problème de connexion internet. Vérifiez votre connexion.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de la mise à jour du panier: ${fetchError.message}`,
          );
          toast.error('Une erreur est survenue. Veuillez réessayer.');

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'CartContext';
            fetchError.additionalInfo = {
              context: 'cart',
              operation: 'update',
              productId: product.id,
              action,
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'CartContext',
                action: 'updateCart',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
                productId: product.id,
                updateAction: action,
              },
            });
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError(
        'Une erreur inattendue est survenue lors de la mise à jour du panier',
      );
      toast.error('Une erreur inattendue est survenue');

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Cart update error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'CartContext';
          error.additionalInfo = {
            context: 'cart',
            operation: 'update',
            productId: product?.id,
            action,
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteItemFromCart = async (id) => {
    try {
      // Vérifications préliminaires
      if (!id) {
        setError('ID de produit invalide ou non spécifié');
        toast.error('Impossible de supprimer: ID de produit invalide');
        return;
      }

      // Mettre à jour l'état de chargement
      setLoading(true);
      setError(null);

      // Sauvegarde de l'état actuel du panier pour restauration en cas d'erreur
      const previousCart = [...cart];
      const previousCount = cartCount;
      const previousTotal = cartTotal;

      // Utiliser un AbortController pour pouvoir annuler la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      // Configuration des headers avec protection contre les attaques
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // Protection CSRF supplémentaire
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      };

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/cart/${id}`,
          {
            method: 'DELETE',
            headers,
            signal: controller.signal,
            credentials: 'include', // Inclure les cookies pour les sessions
          },
        );

        clearTimeout(timeoutId);

        // Traitement de la réponse
        let data;
        try {
          data = await res.json();
        } catch (jsonError) {
          // Restaurer l'état précédent en cas d'erreur
          setCart(previousCart);
          setCartCount(previousCount);
          setCartTotal(previousTotal);

          setError(
            `Erreur lors du traitement de la réponse du serveur: ${jsonError.message}`,
          );
          toast.error('Erreur de communication avec le serveur');

          // Journaliser l'erreur
          if (process.env.NODE_ENV === 'development') {
            console.error(
              'Erreur de parsing JSON lors de la suppression du panier:',
              jsonError,
            );
          }

          // Capturer pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(jsonError, {
              tags: {
                component: 'CartContext',
                action: 'deleteItemFromCart',
                operation: 'jsonParse',
                itemId: id,
              },
            });
          }

          setLoading(false);
          return;
        }

        // Vérifier le rate limiting côté serveur
        if (res.status === 429) {
          // Restaurer l'état précédent
          setCart(previousCart);
          setCartCount(previousCount);
          setCartTotal(previousTotal);

          // Extraire la durée d'attente depuis les headers
          const retryAfter = parseInt(
            res.headers.get('Retry-After') || '60',
            10,
          );
          setError(
            `Trop de requêtes. Veuillez réessayer dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          );
          toast.error(
            `Trop de requêtes. Veuillez patienter quelques instants.`,
          );
          setLoading(false);
          return;
        }

        // Gestion des erreurs HTTP
        if (!res.ok) {
          // Restaurer l'état précédent
          setCart(previousCart);
          setCartCount(previousCount);
          setCartTotal(previousTotal);

          const statusCode = res.status;

          // Traitement unifié des erreurs HTTP
          switch (statusCode) {
            case 400:
              // Erreur de validation ou requête incorrecte
              if (data.message && data.message.includes('ID')) {
                setError("Format d'ID de produit invalide");
                toast.error("Format d'ID de produit invalide");
              } else {
                setError(data.message || 'Requête invalide');
                toast.error(
                  data.message || 'Impossible de supprimer cet article',
                );
              }
              break;
            case 401:
              // Non authentifié
              setError('Authentification requise. Veuillez vous connecter.');
              toast.error('Veuillez vous connecter pour modifier votre panier');
              // Possibilité de rediriger vers la page de connexion
              // setTimeout(() => router.push('/login'), 2000);
              break;
            case 403:
              // Accès interdit
              setError(
                "Vous n'avez pas l'autorisation de supprimer cet article",
              );
              toast.error('Accès non autorisé à cet article');
              break;
            case 404:
              // Article du panier non trouvé
              if (data.message && data.message.includes('Cart item')) {
                setError("L'article n'existe plus dans votre panier");
                toast.error('Article déjà supprimé ou non trouvé');
              } else if (data.message && data.message.includes('User')) {
                setError('Utilisateur non trouvé');
                toast.error('Session utilisateur invalide');
              } else {
                setError('Ressource non trouvée');
                toast.error("Impossible de trouver l'élément à supprimer");
              }
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              // Erreurs serveur
              setError(
                'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
              );
              toast.error('Service temporairement indisponible');

              // Capturer pour monitoring en production seulement
              if (process.env.NODE_ENV === 'production') {
                const serverError = new Error(
                  data.message || `Erreur serveur (${statusCode})`,
                );
                serverError.statusCode = statusCode;
                serverError.componentName = 'CartContext';
                serverError.additionalInfo = {
                  context: 'cart',
                  operation: 'delete',
                  itemId: id,
                  statusCode,
                  responseMessage: data.message,
                };
                captureException(serverError);
              }
              break;
            default:
              // Autres erreurs
              setError(
                data.message ||
                  `Erreur lors de la suppression de l'article (${statusCode})`,
              );
              toast.error(
                data.message || "Erreur lors de la suppression de l'article",
              );
          }

          setLoading(false);
          return;
        }

        // Traitement des réponses avec JSON valide
        if (data) {
          if (data.success === true) {
            // Mise à jour du panier avec les nouvelles données du serveur
            await setCartToState();

            // Notification de succès
            toast.success(data.message || 'Article supprimé du panier', {
              position: 'bottom-right',
              autoClose: 3000,
            });
          } else if (data.success === false) {
            // Restaurer l'état précédent
            setCart(previousCart);
            setCartCount(previousCount);
            setCartTotal(previousTotal);

            // Cas où success est explicitement false
            setError(data.message || "Échec de la suppression de l'article");
            toast.error(data.message || "Échec de la suppression de l'article");

            // Si des erreurs détaillées sont disponibles, les agréger
            if (
              data.errors &&
              Array.isArray(data.errors) &&
              data.errors.length > 0
            ) {
              const errorMessage = `${data.message || "Échec de la suppression de l'article"}: ${data.errors.map((e) => e.message || e).join(', ')}`;
              setError(errorMessage);
              toast.error(errorMessage);
            }
          } else {
            // Restaurer l'état précédent
            setCart(previousCart);
            setCartCount(previousCount);
            setCartTotal(previousTotal);

            // Réponse JSON valide mais structure inattendue
            setError(
              "Réponse inattendue du serveur lors de la suppression de l'article",
            );
            toast.error("Erreur lors de la suppression de l'article");
          }
        } else {
          // Restaurer l'état précédent
          setCart(previousCart);
          setCartCount(previousCount);
          setCartTotal(previousTotal);

          // Réponse vide ou mal formatée
          setError('Réponse vide ou invalide du serveur');
          toast.error('Erreur lors de la communication avec le serveur');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        // Restaurer l'état précédent
        setCart(previousCart);
        setCartCount(previousCount);
        setCartTotal(previousTotal);

        // Erreurs réseau - Toutes gérées via setError et toast
        const isAborted = fetchError.name === 'AbortError';
        const isNetworkError =
          fetchError.message.includes('network') ||
          fetchError.message.includes('fetch') ||
          !navigator.onLine;
        const isTimeout = isAborted || fetchError.message.includes('timeout');

        if (isTimeout) {
          // Timeout
          setError(
            "La requête de suppression de l'article a pris trop de temps. Veuillez réessayer.",
          );
          toast.error(
            'La connexion au serveur est trop lente. Veuillez réessayer.',
          );
        } else if (isNetworkError) {
          // Erreur réseau simple
          setError(
            'Problème de connexion internet. Vérifiez votre connexion et réessayez.',
          );
          toast.error(
            'Problème de connexion internet. Vérifiez votre connexion.',
          );
        } else {
          // Autres erreurs fetch
          setError(
            `Erreur lors de la suppression de l'article: ${fetchError.message}`,
          );
          toast.error('Une erreur est survenue. Veuillez réessayer.');

          // Enrichir l'erreur pour le boundary sans la lancer
          if (!fetchError.componentName) {
            fetchError.componentName = 'CartContext';
            fetchError.additionalInfo = {
              context: 'cart',
              operation: 'delete',
              itemId: id,
            };
          }

          // Capture pour Sentry en production
          if (process.env.NODE_ENV === 'production') {
            captureException(fetchError, {
              tags: {
                component: 'CartContext',
                action: 'deleteItemFromCart',
                errorType: isTimeout
                  ? 'timeout'
                  : isNetworkError
                    ? 'network'
                    : 'unknown',
                itemId: id,
              },
            });
          }
        }
      }
    } catch (error) {
      // Pour toute erreur non gérée spécifiquement
      setError(
        "Une erreur inattendue est survenue lors de la suppression de l'article",
      );
      toast.error('Une erreur inattendue est survenue');

      // Journaliser localement en dev
      if (process.env.NODE_ENV === 'development') {
        console.error('Cart delete item error:', error);
      }

      // Capture pour Sentry en production
      if (process.env.NODE_ENV === 'production') {
        if (!error.componentName) {
          error.componentName = 'CartContext';
          error.additionalInfo = {
            context: 'cart',
            operation: 'delete',
            itemId: id,
          };
        }
        captureException(error);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveOnCheckout = ({ amount, tax = 0, totalAmount }) => {
    // Valider les données
    const validAmount = parseFloat(amount) || 0;
    const validTax = parseFloat(tax) || 0;
    const validTotal = parseFloat(totalAmount) || validAmount + validTax;

    setCheckoutInfo({
      amount: validAmount,
      tax: validTax,
      totalAmount: validTotal,
      items: cart,
      timestamp: Date.now(),
    });
  };

  // Nettoyer les erreurs
  const clearError = () => {
    setError(null);
  };

  const clearCartOnLogout = () => {
    setCart([]);
    setLoading(false);
    setCartCount(0);
    setCartTotal(0);
    // Supprimer le panier du localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('buyitnow_cart');
    }
  };

  // Vider le panier (utile après un achat réussi)
  const clearCart = async () => {
    try {
      setLoading(true);

      // Supprimer chaque élément du panier
      for (const item of cart) {
        await fetchWithRetry(
          `${process.env.NEXT_PUBLIC_API_URL}/api/cart/${item.id}`,
          { method: 'DELETE' },
        );
      }

      // Réinitialiser l'état local
      setCart([]);
      setCartCount(0);
      setCartTotal(0);

      toast.success('Panier vidé avec succès', {
        position: 'bottom-right',
      });
    } catch (error) {
      console.error('Erreur lors du vidage du panier:', error);

      captureException(error, {
        tags: { action: 'clear_cart' },
      });

      toast.error('Impossible de vider le panier. Veuillez réessayer.', {
        position: 'bottom-right',
      });
    } finally {
      setLoading(false);
    }
  };

  const remoteDataInState = (response) => {
    // Normaliser les données du panier
    const normalizedCart =
      response.data.cart?.map((item) => ({
        ...item,
        // S'assurer que la quantité est un nombre
        quantity: parseInt(item.quantity, 10) || 1,
      })) || [];

    setCart(normalizedCart);
    setCartCount(response.data.cartCount || 0);
    setCartTotal(response.data.cartTotal);
  };

  // Valeur du contexte avec mémorisation pour éviter les re-renders inutiles
  const contextValue = useMemo(
    () => ({
      loading,
      cart,
      cartCount,
      cartTotal,
      checkoutInfo,
      orderInfo,
      error,
      setLoading,
      setCartToState,
      setOrderInfo,
      addItemToCart,
      updateCart,
      saveOnCheckout,
      deleteItemFromCart,
      clearError,
      clearCartOnLogout,
      clearCart,
    }),
    [
      loading,
      cart,
      cartCount,
      cartTotal,
      checkoutInfo,
      orderInfo,
      error,
      setLoading,
      setCartToState,
      setOrderInfo,
      addItemToCart,
      updateCart,
      saveOnCheckout,
      deleteItemFromCart,
      clearError,
      clearCartOnLogout,
      clearCart,
    ],
  );

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  );
};

export default CartContext;
