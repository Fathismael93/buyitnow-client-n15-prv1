// hooks/useCartOperations.js
import { useState, useCallback, useContext } from 'react';
import { captureException } from '@/monitoring/sentry';
import CartContext from '@/context/CartContext';
import { DECREASE, INCREASE } from '@/helpers/constants';

const useCartOperations = () => {
  const {
    updateCart,
    deleteItemFromCart,
    setLoading,
    saveOnCheckout,
    cartTotal,
  } = useContext(CartContext);

  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [itemBeingRemoved, setItemBeingRemoved] = useState(null);

  // Fonction optimisée pour augmenter la quantité
  const increaseQty = useCallback(
    async (cartItem) => {
      try {
        setLoading(true);
        await updateCart(cartItem, INCREASE);
      } catch (error) {
        console.error("Erreur lors de l'augmentation de la quantité:", error);
        captureException(error, {
          tags: { component: 'Cart', action: 'increaseQty' },
          extra: { cartItem },
        });
      }
    },
    [INCREASE, updateCart, setLoading],
  );

  // Fonction optimisée pour diminuer la quantité
  const decreaseQty = useCallback(
    async (cartItem) => {
      try {
        setLoading(true);
        await updateCart(cartItem, DECREASE);
      } catch (error) {
        console.error('Erreur lors de la diminution de la quantité:', error);
        captureException(error, {
          tags: { component: 'Cart', action: 'decreaseQty' },
          extra: { cartItem },
        });
      }
    },
    [DECREASE, updateCart, setLoading],
  );

  // Fonction optimisée pour supprimer un article
  const handleDeleteItem = useCallback(
    async (itemId) => {
      try {
        setDeleteInProgress(true);
        setItemBeingRemoved(itemId);
        await deleteItemFromCart(itemId);
      } catch (error) {
        console.error("Erreur lors de la suppression d'un article:", error);
        captureException(error, {
          tags: { component: 'Cart', action: 'deleteItem' },
          extra: { itemId },
        });
      } finally {
        setDeleteInProgress(false);
        setItemBeingRemoved(null);
      }
    },
    [deleteItemFromCart, setDeleteInProgress, setItemBeingRemoved],
  );

  // Préparation au paiement
  const checkoutHandler = useCallback(() => {
    const checkoutData = {
      amount: cartTotal.toFixed(2),
      tax: 0, // À ajuster selon les besoins
      totalAmount: cartTotal.toFixed(2),
    };

    saveOnCheckout(checkoutData);
  }, [cartTotal, saveOnCheckout]);

  return {
    deleteInProgress,
    itemBeingRemoved,
    increaseQty,
    decreaseQty,
    handleDeleteItem,
    checkoutHandler,
  };
};

export default useCartOperations;
