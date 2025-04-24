'use client';

import { DECREASE } from '@/helpers/constants';
import { createContext, useState } from 'react';
import { toast } from 'react-toastify';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [checkoutInfo, setCheckoutInfo] = useState(null);
  const [orderInfo, setOrderInfo] = useState(null);

  const setCartToState = async () => {
    try {
      // Gestion d'état de chargement
      setLoading(true);

      // Utilisation d'AbortController pour pouvoir annuler les requêtes
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // Timeout de 10 secondes

      // Préparation des headers appropriés
      const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      };

      console.log('Getting token from localStorage');
      console.log(localStorage.getItem('token'));

      // Ajout d'un token d'authentification si disponible
      if (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('token')
      ) {
        headers['Authorization'] = `Bearer ${localStorage.getItem('token')}`;
      }

      // Requête avec signal d'annulation et headers
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`, {
        signal: controller.signal,
        headers,
      });

      // Nettoyage du timeout
      clearTimeout(timeoutId);

      // Vérification du statut HTTP avant de traiter la réponse
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        // Journalisation structurée de l'erreur
        console.error('Cart fetch failed', {
          status: res.status,
          message: errorData.message || res.statusText,
          endpoint: '/api/cart',
        });
        throw new Error(
          errorData.message || `Error ${res.status}: ${res.statusText}`,
        );
      }

      // Parsing du JSON avec validation
      const data = await res.json();

      // Validation des données reçues
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format');
      }

      // Logique simplifiée pour traiter le résultat
      if (!data.success) {
        // Utilisation de notification contextuelle mais séparée de la logique métier
        if (data.message) {
          toast.info(data.message);
        }
        return;
      }

      // Validation de la structure des données avant mise à jour de l'état
      if (data.data && Array.isArray(data.data.cart)) {
        setCart(data.data.cart);
        setCartCount(data.data.cartCount || data.data.cart.length);

        // Stockage optionnel dans un cache local pour accès rapide
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
      // Gestion spécifique des différents types d'erreurs
      if (error.name === 'AbortError') {
        console.warn('Cart request was aborted due to timeout');
        toast.warning('Request timeout, please try again');
      } else if (!navigator.onLine) {
        console.error('Cart fetch failed - user is offline');
        toast.error('You are offline. Please check your connection.');
      } else {
        // Journalisation détaillée de l'erreur pour débogage
        console.error('Cart fetch error:', {
          message: error.message,
          stack: error.stack,
          context: 'setCartToState',
        });

        // Message d'erreur approprié pour l'utilisateur
        toast.error('Could not retrieve your cart. Please try again.');
      }
    } finally {
      // Toujours remettre l'état de chargement à false, même en cas d'erreur
      setLoading(false);
    }
  };

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
        setCartToState,
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

export default CartContext;
