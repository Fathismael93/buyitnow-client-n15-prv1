// 'use client';

// import { DECREASE } from '@/helpers/constants';
// import { createContext, useEffect, useRef, useState } from 'react';
// import { toast } from 'react-toastify';

// // Fonction utilitaire de debounce (à mettre à l'extérieur de votre composant)
// // const debounce = (func, wait) => {
// //   let timeout;
// //   return function executedFunction(...args) {
// //     const later = () => {
// //       clearTimeout(timeout);
// //       func(...args);
// //     };
// //     clearTimeout(timeout);
// //     timeout = setTimeout(later, wait);
// //   };
// // };

// const CartContext = createContext();

// export const CartProvider = ({ children }) => {
//   const [loading, setLoading] = useState(false);
//   const [cart, setCart] = useState([]);
//   const [cartCount, setCartCount] = useState(0);
//   const [cartTotal, setCartTotal] = useState(0);
//   const [checkoutInfo, setCheckoutInfo] = useState(null);
//   const [orderInfo, setOrderInfo] = useState(null);

//   // Ajouter cette référence pour le contrôleur d'annulation
//   const abortControllerRef = useRef(null);

//   // Utiliser useEffect pour nettoyer le contrôleur lors du démontage du composant
//   useEffect(() => {
//     return () => {
//       if (abortControllerRef.current) {
//         abortControllerRef.current.abort();
//         abortControllerRef.current = null;
//       }
//     };
//   }, []);

//   // Nombre de tentatives maximum
//   const MAX_RETRY_COUNT = 3;
//   // Délai de base entre les tentatives (augmentera exponentiellement)
//   const BASE_RETRY_DELAY = 1000;

//   // Nouvelle version de setCartToState avec les améliorations
//   const setCartToState = async (retryCount = 0) => {
//     try {
//       // Gestion d'état de chargement
//       setLoading(true);

//       // Vérifier d'abord si un cache valide existe
//       try {
//         if (typeof sessionStorage !== 'undefined') {
//           const cachedData = sessionStorage.getItem('cartCache');
//           if (cachedData) {
//             const { data, timestamp } = JSON.parse(cachedData);
//             const cacheAge = Date.now() - timestamp;
//             // Si le cache est récent (moins de 1 minute), l'utiliser immédiatement
//             if (cacheAge < 60000 && data && Array.isArray(data.cart)) {
//               setCart(data.cart);
//               setCartCount(data.cartCount || data.cart.length);

//               // Revalider en arrière-plan si le cache a plus de 10 secondes
//               if (cacheAge > 10000) {
//                 // Appel asynchrone sans attendre, avec retryCount à 0 pour une nouvelle tentative
//                 setTimeout(() => fetchCartData(true, 0), 100);
//                 return;
//               }
//             }
//           }
//         }
//       } catch (cacheError) {
//         console.warn('Cache read error', cacheError);
//       }

//       // Appel principal pour récupérer les données
//       await fetchCartData(false, retryCount);
//     } catch (error) {
//       // La gestion des erreurs est maintenant dans fetchCartData
//       // S'assurer que l'état de chargement est réinitialisé, au cas où
//       setLoading(false);
//       console.debug('Error handled at setCartToState level:', error.message);
//     }
//   };

//   // Fonction séparée pour la récupération des données du panier
//   const fetchCartData = async (isBackgroundFetch = false, retryCount = 0) => {
//     // Si c'est un appel en arrière-plan, ne pas définir l'état de chargement
//     if (!isBackgroundFetch) {
//       setLoading(true);
//     }

//     // Nettoyer le contrôleur précédent si existant
//     if (abortControllerRef.current) {
//       abortControllerRef.current.abort();
//     }

//     // Créer un nouveau contrôleur d'annulation
//     const controller = new AbortController();
//     abortControllerRef.current = controller;

//     const timeoutId = setTimeout(() => {
//       if (controller.signal.aborted) return;
//       controller.abort();
//     }, 10000);

//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
//         signal: controller.signal,
//         headers: {
//           'Content-Type': 'application/json',
//           'Cache-Control': 'no-cache',
//         },
//         credentials: 'include',
//       });

//       clearTimeout(timeoutId);

//       // Gestion des erreurs HTTP
//       if (!res.ok) {
//         const errorData = await res.json().catch(() => ({}));
//         console.error('Cart fetch failed', {
//           status: res.status,
//           message: errorData.message || res.statusText,
//           endpoint: '/api/cart',
//           isBackgroundFetch,
//         });

//         // Tentative de réessai pour certains codes d'erreurs
//         const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
//         if (
//           retryCount < MAX_RETRY_COUNT &&
//           retryableStatusCodes.includes(res.status)
//         ) {
//           const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
//           console.log(
//             `Retrying cart fetch in ${delay}ms (attempt ${retryCount + 1})`,
//           );

//           // Attendre avant de réessayer
//           await new Promise((resolve) => setTimeout(resolve, delay));

//           // Réessayer avec le compteur incrémenté
//           return fetchCartData(isBackgroundFetch, retryCount + 1);
//         }

//         throw new Error(
//           errorData.message || `Error ${res.status}: ${res.statusText}`,
//         );
//       }

//       const data = await res.json();

//       if (!data || typeof data !== 'object') {
//         throw new Error('Invalid response format');
//       }

//       if (!data.success) {
//         if (data.message) {
//           toast.info(data.message);
//         }
//         return;
//       }

//       if (data.data && Array.isArray(data.data.cart)) {
//         setCart(data.data.cart);
//         setCartCount(data.data.cartCount || data.data.cart.length);
//         setCartTotal(data.data.cartTotal || 0);

//         // Mise en cache des données
//         try {
//           if (typeof sessionStorage !== 'undefined') {
//             sessionStorage.setItem(
//               'cartCache',
//               JSON.stringify({
//                 data: data.data,
//                 timestamp: Date.now(),
//               }),
//             );
//           }
//         } catch (cacheError) {
//           console.warn('Failed to cache cart data', cacheError);
//         }
//       } else {
//         console.warn('Received malformed cart data', data);
//       }
//     } catch (error) {
//       if (error.name === 'AbortError') {
//         console.warn('Cart request was aborted due to timeout');
//         if (!isBackgroundFetch) {
//           toast.warning('Request timeout, please try again');
//         }
//       } else if (!navigator.onLine) {
//         console.error('Cart fetch failed - user is offline');
//         if (!isBackgroundFetch) {
//           toast.error('You are offline. Please check your connection.');
//         }
//       } else {
//         console.error('Cart fetch error:', {
//           message: error.message,
//           stack: error.stack,
//           context: 'setCartToState',
//           isBackgroundFetch,
//         });

//         if (!isBackgroundFetch) {
//           toast.error('Could not retrieve your cart. Please try again.');
//         }
//       }

//       // Propager l'erreur pour que la fonction appelante puisse la gérer
//       throw error;
//     } finally {
//       // Réinitialiser le chargement uniquement si ce n'est pas un appel en arrière-plan
//       if (!isBackgroundFetch) {
//         setLoading(false);
//       }

//       // Réinitialiser la référence du contrôleur
//       if (abortControllerRef.current === controller) {
//         abortControllerRef.current = null;
//       }
//     }
//   };

//   // Créer une version avec debounce pour éviter les appels multiples rapides
//   // const debouncedSetCartToState = debounce(setCartToState, 300);

//   const addItemToCart = async ({ product }) => {
//     try {
//       const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
//         method: 'POST',
//         body: JSON.stringify({
//           productId: product,
//         }),
//       });

//       const data = await res.json();

//       if (data?.success === false) {
//         toast.info(data?.message);
//         return;
//       }

//       if (data?.data) {
//         setCart(data.data.cart);
//         setCartCount(data.data.cartCount);
//         setCartTotal(data.data.cartTotal);
//         toast.success('Product added to cart');
//       }
//     } catch (error) {
//       toast.error(error?.response?.data?.message);
//     }
//   };

//   const updateCart = async (product, value) => {
//     if (value === DECREASE && product.quantity === 1) {
//       toast.error("It's only 1 unit ! Remove this item if you don't want it !");
//     } else {
//       try {
//         const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
//           method: 'PUT',
//           body: JSON.stringify({
//             product,
//             value,
//           }),
//         });

//         const data = await res.json();

//         if (data?.success === false) {
//           toast.info(data?.message);
//           return;
//         }

//         if (data?.success) {
//           setCart(data.data.cart);
//           setCartCount(data.data.cartCount);
//           setCartTotal(data.data.cartTotal);
//           toast.success(data?.message);
//           setLoading(false);
//         }
//       } catch (error) {
//         toast.error(error?.response?.data?.message);
//         setLoading(false);
//       }
//     }
//   };

//   const deleteItemFromCart = async (id) => {
//     try {
//       setLoading(true);

//       const res = await fetch(
//         `${process.env.NEXT_PUBLIC_API_URL}/api/cart/${id}`,
//         {
//           method: 'DELETE',
//         },
//       );

//       const data = await res.json();

//       if (data?.success === false) {
//         toast.info(data?.message);
//         return;
//       }

//       console.log(data);

//       if (data?.success) {
//         setCartToState();
//         toast.success(data?.message);
//         setLoading(false);
//       }
//     } catch (error) {
//       toast.error(error?.response?.data?.message);
//       setLoading(false);
//     }
//   };

//   const saveOnCheckout = ({ amount, tax, totalAmount }) => {
//     setCheckoutInfo({
//       amount,
//       tax,
//       totalAmount,
//     });
//   };

//   // Ajoutez cette méthode
//   const clearCartOnLogout = () => {
//     setCart([]);
//     setCartCount(0);
//     setCheckoutInfo(null);
//     setOrderInfo(null);
//   };

//   return (
//     <CartContext.Provider
//       value={{
//         loading,
//         cart,
//         cartCount,
//         cartTotal,
//         checkoutInfo,
//         orderInfo,
//         setLoading,
//         setCartToState /*: debouncedSetCartToState*/, // Utiliser la version debounced
//         setOrderInfo,
//         addItemToCart,
//         updateCart,
//         saveOnCheckout,
//         deleteItemFromCart,
//         clearCartOnLogout,
//       }}
//     >
//       {children}
//     </CartContext.Provider>
//   );
// };

// export default CartContext;

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

      const response = await fetchWithRetry(
        `${process.env.NEXT_PUBLIC_API_URL}/api/cart`,
        {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
          },
        },
      );

      if (response.success) {
        // Normaliser les données du panier
        remoteDataInState(response);
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du panier:', error);

      captureException(error, {
        tags: { action: 'get_cart' },
        extra: { context: 'setCartToState' },
      });

      // En cas d'erreur, utiliser les données du localStorage comme fallback
      if (localCart.items.length > 0) {
        localDataInState();
        toast.info('Utilisation des données de panier locales', {
          autoClose: 3000,
        });
      }

      setError('Erreur lors du chargement du panier');
    } finally {
      setLoading(false);
    }
  }, [fetchWithRetry, localCart.items, localCart.count, setLocalCart, loading]);

  const addItemToCart = useCallback(
    async ({ product, quantity = 1 }) => {
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
    },
    [fetchWithRetry, setCartToState],
  );

  const updateCart = useCallback(
    async (product, action) => {
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
    },
    [fetchWithRetry, setCartToState, cart],
  );

  const deleteItemFromCart = useCallback(
    async (id) => {
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
          remoteDataInState();
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
    },
    [fetchWithRetry, setCartToState, cart, setLocalCart],
  );

  const saveOnCheckout = useCallback(
    ({ amount, tax = 0, totalAmount }) => {
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
    },
    [cart],
  );

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
  }, [cart, fetchWithRetry, setLocalCart]);

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
