'use client';

import { DECREASE } from '@/helpers/constants';
import { createContext, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [checkoutInfo, setCheckoutInfo] = useState(null);
  const [orderInfo, setOrderInfo] = useState(null);

  // Ajouter cette référence pour le contrôleur d'annulation
  const abortControllerRef = useRef(null);

  // Utiliser useEffect pour nettoyer le contrôleur lors du démontage du composant
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Nombre de tentatives maximum
  const MAX_RETRY_COUNT = 3;
  // Délai de base entre les tentatives (augmentera exponentiellement)
  const BASE_RETRY_DELAY = 1000;

  // Nouvelle version de setCartToState avec les améliorations
  const setCartToState = async (retryCount = 0) => {
    try {
      // Gestion d'état de chargement
      setLoading(true);

      // Vérifier d'abord si un cache valide existe
      try {
        if (typeof sessionStorage !== 'undefined') {
          const cachedData = sessionStorage.getItem('cartCache');
          if (cachedData) {
            const { data, timestamp } = JSON.parse(cachedData);
            const cacheAge = Date.now() - timestamp;
            // Si le cache est récent (moins de 1 minute), l'utiliser immédiatement
            if (cacheAge < 60000 && data && Array.isArray(data.cart)) {
              setCart(data.cart);
              setCartCount(data.cartCount || data.cart.length);

              // Revalider en arrière-plan si le cache a plus de 10 secondes
              if (cacheAge > 10000) {
                // Appel asynchrone sans attendre, avec retryCount à 0 pour une nouvelle tentative
                setTimeout(() => fetchCartData(true, 0), 100);
                return;
              }
            }
          }
        }
      } catch (cacheError) {
        console.warn('Cache read error', cacheError);
      }

      // Appel principal pour récupérer les données
      await fetchCartData(false, retryCount);
    } catch (error) {
      // La gestion des erreurs est maintenant dans fetchCartData
      // S'assurer que l'état de chargement est réinitialisé, au cas où
      setLoading(false);
      console.debug('Error handled at setCartToState level:', error.message);
    }
  };

  // Fonction séparée pour la récupération des données du panier
  const fetchCartData = async (isBackgroundFetch = false, retryCount = 0) => {
    // Si c'est un appel en arrière-plan, ne pas définir l'état de chargement
    if (!isBackgroundFetch) {
      setLoading(true);
    }

    // Nettoyer le contrôleur précédent si existant
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Créer un nouveau contrôleur d'annulation
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = setTimeout(() => {
      if (controller.signal.aborted) return;
      controller.abort();
    }, 10000);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        credentials: 'include',
      });

      clearTimeout(timeoutId);

      // Gestion des erreurs HTTP
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Cart fetch failed', {
          status: res.status,
          message: errorData.message || res.statusText,
          endpoint: '/api/cart',
          isBackgroundFetch,
        });

        // Tentative de réessai pour certains codes d'erreurs
        const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
        if (
          retryCount < MAX_RETRY_COUNT &&
          retryableStatusCodes.includes(res.status)
        ) {
          const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
          console.log(
            `Retrying cart fetch in ${delay}ms (attempt ${retryCount + 1})`,
          );

          // Attendre avant de réessayer
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Réessayer avec le compteur incrémenté
          return fetchCartData(isBackgroundFetch, retryCount + 1);
        }

        throw new Error(
          errorData.message || `Error ${res.status}: ${res.statusText}`,
        );
      }

      const data = await res.json();

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format');
      }

      if (!data.success) {
        if (data.message) {
          toast.info(data.message);
        }
        return;
      }

      if (data.data && Array.isArray(data.data.cart)) {
        setCart(data.data.cart);
        setCartCount(data.data.cartCount || data.data.cart.length);

        // Mise en cache des données
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(
              'cartCache',
              JSON.stringify({
                data: data.data,
                timestamp: Date.now(),
              }),
            );
          }
        } catch (cacheError) {
          console.warn('Failed to cache cart data', cacheError);
        }
      } else {
        console.warn('Received malformed cart data', data);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Cart request was aborted due to timeout');
        if (!isBackgroundFetch) {
          toast.warning('Request timeout, please try again');
        }
      } else if (!navigator.onLine) {
        console.error('Cart fetch failed - user is offline');
        if (!isBackgroundFetch) {
          toast.error('You are offline. Please check your connection.');
        }
      } else {
        console.error('Cart fetch error:', {
          message: error.message,
          stack: error.stack,
          context: 'setCartToState',
          isBackgroundFetch,
        });

        if (!isBackgroundFetch) {
          toast.error('Could not retrieve your cart. Please try again.');
        }
      }

      // Propager l'erreur pour que la fonction appelante puisse la gérer
      throw error;
    } finally {
      // Réinitialiser le chargement uniquement si ce n'est pas un appel en arrière-plan
      if (!isBackgroundFetch) {
        setLoading(false);
      }

      // Réinitialiser la référence du contrôleur
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  // Créer une version avec debounce pour éviter les appels multiples rapides
  const debouncedSetCartToState = debounce(setCartToState, 300);

  const addItemToCart = async ({ product }) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
        method: 'POST',
        body: JSON.stringify({
          productId: product,
        }),
      });

      const data = await res.json();

      if (data?.success === false) {
        toast.info(data?.message);
        return;
      }

      if (data?.data) {
        setCartToState();
        toast.success('Product added to cart');
      }
    } catch (error) {
      toast.error(error?.response?.data?.message);
    }
  };

  const updateCart = async (product, value) => {
    if (value === DECREASE && product.quantity === 1) {
      toast.error("It's only 1 unit ! Remove this item if you don't want it !");
    } else {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
          method: 'PUT',
          body: JSON.stringify({
            product,
            value,
          }),
        });

        const data = await res.json();

        if (data?.success === false) {
          toast.info(data?.message);
          return;
        }

        if (data?.success) {
          setCartToState();
          toast.success(data?.message);
          setLoading(false);
        }
      } catch (error) {
        toast.error(error?.response?.data?.message);
        setLoading(false);
      }
    }
  };

  const deleteItemFromCart = async (id) => {
    try {
      setLoading(true);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/cart/${id}`,
        {
          method: 'DELETE',
        },
      );

      const data = await res.json();

      if (data?.success === false) {
        toast.info(data?.message);
        return;
      }

      if (data?.success) {
        setCartToState();
        toast.success(data?.message);
        setLoading(false);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message);
      setLoading(false);
    }
  };

  const saveOnCheckout = ({ amount, tax, totalAmount }) => {
    setCheckoutInfo({
      amount,
      tax,
      totalAmount,
    });
  };

  // Ajoutez cette méthode
  const clearCartOnLogout = () => {
    setCart([]);
    setCartCount(0);
    setCheckoutInfo(null);
    setOrderInfo(null);
  };

  return (
    <CartContext.Provider
      value={{
        loading,
        cart,
        cartCount,
        checkoutInfo,
        orderInfo,
        setLoading,
        setCartToState: debouncedSetCartToState, // Utiliser la version debounced
        setOrderInfo,
        addItemToCart,
        updateCart,
        saveOnCheckout,
        deleteItemFromCart,
        clearCartOnLogout,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

// Fonction utilitaire de debounce (à mettre à l'extérieur de votre composant)
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export default CartContext;
