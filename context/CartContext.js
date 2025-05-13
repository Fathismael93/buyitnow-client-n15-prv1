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
import { useLocalStorage } from '@/hooks/useCustomHooks';

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

  // Utiliser localStorage pour persister le panier
  const [localCart, setLocalCart] = useLocalStorage('buyitnow_cart', {
    count: 0,
    items: [],
    lastUpdated: null,
  });

  // Synchroniser le panier local avec le panier du serveur lors de l'initialisation
  useEffect(() => {
    // N'exécuter qu'au premier montage
    if (isFirstLoad.current && localCart.count > 0 && cart.length === 0) {
      setCartToState();
      isFirstLoad.current = false;
    }
  }, [localCart.count, cart.length]);

  // Fonction utilitaire pour les requêtes API avec retry
  // Dans CartContext.js
  const fetchWithRetry = useCallback(
    async (url, options, attemptNumber = 0) => {
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
    },
    [],
  );

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
          setError('Erreur lors du traitement de la réponse du serveur');

          // En cas d'erreur, utiliser les données du localStorage comme fallback
          if (localCart.items.length > 0) {
            localDataInState();
            toast.info('Utilisation des données de panier locales', {
              autoClose: 3000,
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

          // En cas d'erreur, utiliser les données du localStorage comme fallback
          if (localCart.items.length > 0) {
            localDataInState();
            toast.info('Utilisation des données de panier locales', {
              autoClose: 3000,
            });
          }

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

          // En cas d'erreur, utiliser les données du localStorage comme fallback
          if (localCart.items.length > 0) {
            localDataInState();
            toast.info('Utilisation des données de panier locales', {
              autoClose: 3000,
            });
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

            // En cas d'erreur, utiliser les données du localStorage comme fallback
            if (localCart.items.length > 0) {
              localDataInState();
              toast.info('Utilisation des données de panier locales', {
                autoClose: 3000,
              });
            }
          }
        } else {
          // Réponse vide ou mal formatée
          setError('Réponse inattendue du serveur');

          // En cas d'erreur, utiliser les données du localStorage comme fallback
          if (localCart.items.length > 0) {
            localDataInState();
            toast.info('Utilisation des données de panier locales', {
              autoClose: 3000,
            });
          }
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

        // En cas d'erreur, utiliser les données du localStorage comme fallback
        if (localCart.items.length > 0) {
          localDataInState();
          toast.info('Utilisation des données de panier locales', {
            autoClose: 3000,
          });
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

      // En cas d'erreur, utiliser les données du localStorage comme fallback
      if (localCart.items.length > 0) {
        localDataInState();
        toast.info('Utilisation des données de panier locales', {
          autoClose: 3000,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [loading, localCart]);

  const addItemToCart = useCallback(async ({ product, quantity = 1 }) => {
    if (!product) {
      toast.error('Produit invalide');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetchWithRetry(
        `${process.env.NEXT_PUBLIC_API_URL}/api/cart`,
        {
          method: 'POST',
          body: JSON.stringify({
            productId: product,
            quantity,
          }),
        },
      );

      if (response?.success) {
        remoteDataInState(response);
        toast.success('Produit ajouté au panier', {
          position: 'bottom-right',
          autoClose: 3000,
        });
      } else {
        toast.error(
          response?.message ||
            "Une erreur est survenue lors de l'ajout au panier",
          { position: 'bottom-right' },
        );
      }
    } catch (error) {
      console.error("Erreur lors de l'ajout au panier:", error);

      // En cas d'erreur, utiliser les données du localStorage comme fallback
      if (localCart.items.length > 0) {
        localDataInState();
        toast.info('Utilisation des données de panier locales', {
          autoClose: 3000,
        });
      }

      captureException(error, {
        tags: { action: 'add_to_cart' },
        extra: { product, quantity },
      });

      toast.error('Une erreur est survenue. Veuillez réessayer.', {
        position: 'bottom-right',
      });

      setError("Erreur lors de l'ajout au panier");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateCart = useCallback(async (product, action) => {
    // Validation préliminaire
    if (!product || !action) {
      return;
    }

    // Si DECREASE et quantité = 1, empêcher la mise à jour
    if (action === DECREASE && product.quantity === 1) {
      toast.info(
        "Quantité minimale atteinte. Pour supprimer l'article, utilisez le bouton Supprimer.",
        { position: 'bottom-right' },
      );
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Mise à jour côté serveur
      const response = await fetchWithRetry(
        `${process.env.NEXT_PUBLIC_API_URL}/api/cart`,
        {
          method: 'PUT',
          body: JSON.stringify({
            product,
            value: action,
          }),
        },
      );

      if (response.success) {
        // Rafraîchir le panier après la mise à jour
        remoteDataInState(response);

        if (action === INCREASE) {
          toast.success('Quantité augmentée', {
            position: 'bottom-right',
            autoClose: 2000,
          });
        } else {
          toast.success('Quantité diminuée', {
            position: 'bottom-right',
            autoClose: 2000,
          });
        }
      } else {
        // Annuler la mise à jour optimiste en cas d'échec
        await setCartToState();

        toast.error('La mise à jour du panier a échoué, veuillez réessayer', {
          position: 'bottom-right',
        });
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du panier:', error);

      captureException(error, {
        tags: { action: 'update_cart' },
        extra: { product, updateAction: action },
      });

      // Restaurer l'état du panier
      await setCartToState();

      toast.error('Une erreur est survenue. Veuillez réessayer.', {
        position: 'bottom-right',
      });

      setError('Erreur lors de la mise à jour du panier');
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteItemFromCart = useCallback(async (id) => {
    if (!id) {
      toast.error('ID de produit invalide');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Requête API pour supprimer du serveur
      const response = await fetchWithRetry(
        `${process.env.NEXT_PUBLIC_API_URL}/api/cart/${id}`,
        { method: 'DELETE' },
      );

      if (response?.success) {
        remoteDataInState(response);
        toast.success('Article supprimé du panier', {
          position: 'bottom-right',
          autoClose: 3000,
        });
      } else {
        // Si la suppression côté serveur échoue, restaurer l'état
        await setCartToState();

        toast.error(
          response?.message ||
            "Une erreur est survenue lors de la suppression de l'article",
          { position: 'bottom-right' },
        );
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du panier:', error);

      captureException(error, {
        tags: { action: 'delete_from_cart' },
        extra: { itemId: id },
      });

      // Restaurer l'état
      await setCartToState();

      toast.error('Une erreur est survenue. Veuillez réessayer.', {
        position: 'bottom-right',
      });

      setError('Erreur lors de la suppression du panier');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveOnCheckout = useCallback(({ amount, tax = 0, totalAmount }) => {
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

    // Enregistrer dans localStorage pour une reprise ultérieure si nécessaire
    try {
      localStorage.setItem(
        'buyitnow_checkout',
        JSON.stringify({
          amount: validAmount,
          tax: validTax,
          totalAmount: validTotal,
          timestamp: Date.now(),
        }),
      );
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // Ignorer les erreurs de localStorage
      console.warn(
        'Impossible de sauvegarder les infos de checkout dans localStorage',
      );
    }
  }, []);

  // Nettoyer les erreurs
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearCartOnLogout = useCallback(() => {
    setCart([]);
    setLoading(false);
    setCartCount(0);
    setCartTotal(0);
    // Supprimer le panier du localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('buyitnow_cart');
    }
  }, []);

  // Vider le panier (utile après un achat réussi)
  const clearCart = useCallback(async () => {
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
      setLocalCart({
        count: 0,
        items: [],
        lastUpdated: Date.now(),
      });

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
  }, [cart, setLocalCart]);

  const localDataInState = () => {
    setCart(localCart.items);
    setCartCount(localCart.count);
    setCartTotal(localCart.totalAmount);
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

    // Mettre à jour le localStorage avec timestamp
    setLocalCart({
      count: response.data.cartCount || 0,
      items: normalizedCart,
      totalAmount: response.data.cartTotal,
      lastUpdated: Date.now(),
    });
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
