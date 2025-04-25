'use client';

import { useContext, useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import ItemCart from './components/ItemCart';
import CartContext from '@/context/CartContext';
import { DECREASE, INCREASE } from '@/helpers/constants';
import Loading from '@/app/loading';

const TIMEOUT_DURATION = 10000; // 10 secondes pour les opérations

const Cart = () => {
  const {
    loading,
    updateCart,
    deleteItemFromCart,
    cart,
    cartCount,
    setLoading,
    saveOnCheckout,
    setCartToState,
  } = useContext(CartContext);

  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [operationStatus, setOperationStatus] = useState(null); // Pour feedback à l'utilisateur
  const [pendingOperation, setPendingOperation] = useState(false);

  const router = useRouter();

  // Mémoriser setCartToState pour éviter des re-renders inutiles
  const memoizedSetCartToState = useCallback(async () => {
    try {
      await setCartToState();
      return true;
    } catch (err) {
      console.error('Failed to load cart data:', err);
      setError('Unable to load your cart. Please try again later.');
      return false;
    }
  }, [setCartToState]);

  // Effectuer le chargement initial des données avec timeout
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_DURATION);

    const loadCartData = async () => {
      try {
        const success = await memoizedSetCartToState();
        if (success) {
          setIsInitialized(true);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          setError('Loading cart timed out. Please try again.');
        } else {
          setError('Unable to load your cart. Please try again later.');
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    loadCartData();

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [memoizedSetCartToState]);

  // Précharger la page suivante dans un useEffect séparé pour une meilleure séparation des préoccupations
  useEffect(() => {
    router.prefetch('/shipping-choice');
  }, [router]);

  // Fonction de feedback avec auto-effacement
  const showFeedback = useCallback((message, isError = false) => {
    setOperationStatus({ message, isError });
    // Auto-effacer après 3 secondes
    setTimeout(() => setOperationStatus(null), 3000);
  }, []);

  // Gestionnaires d'événements optimisés avec feedback d'erreur et gestion de concurrence
  const increaseQty = useCallback(
    async (cartItem) => {
      if (pendingOperation) return;
      if (cartItem.quantity >= cartItem.stock) {
        showFeedback('Maximum stock reached', true);
        return;
      }

      setPendingOperation(true);
      setLoading(true);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          TIMEOUT_DURATION,
        );

        await updateCart(cartItem, INCREASE);
        showFeedback('Quantity increased');

        clearTimeout(timeoutId);
      } catch (err) {
        console.error('Failed to increase quantity:', err);

        if (err.name === 'AbortError') {
          setError('Operation timed out. Please try again.');
        } else {
          setError('Unable to update quantity. Please try again.');
        }
      } finally {
        setPendingOperation(false);
        setLoading(false);
      }
    },
    [pendingOperation, setLoading, updateCart, showFeedback],
  );

  const decreaseQty = useCallback(
    async (cartItem) => {
      if (pendingOperation) return;

      setPendingOperation(true);
      setLoading(true);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          TIMEOUT_DURATION,
        );

        await updateCart(cartItem, DECREASE);
        showFeedback('Quantity decreased');

        clearTimeout(timeoutId);
      } catch (err) {
        console.error('Failed to decrease quantity:', err);

        if (err.name === 'AbortError') {
          setError('Operation timed out. Please try again.');
        } else {
          setError('Unable to update quantity. Please try again.');
        }
      } finally {
        setPendingOperation(false);
        setLoading(false);
      }
    },
    [pendingOperation, setLoading, updateCart, showFeedback],
  );

  const handleDeleteItem = useCallback(
    async (itemId) => {
      if (pendingOperation) return;
      if (!confirm('Are you sure you want to remove this item?')) return;

      setPendingOperation(true);
      setLoading(true);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          TIMEOUT_DURATION,
        );

        await deleteItemFromCart(itemId);
        showFeedback('Item removed from cart');

        clearTimeout(timeoutId);
      } catch (err) {
        console.error('Failed to remove item:', err);

        if (err.name === 'AbortError') {
          setError('Operation timed out. Please try again.');
        } else {
          setError('Unable to remove item. Please try again.');
        }
      } finally {
        setPendingOperation(false);
        setLoading(false);
      }
    },
    [pendingOperation, setLoading, deleteItemFromCart, showFeedback],
  );

  // Calculer les totaux avec useMemo pour éviter des recalculs inutiles
  const cartSummary = useMemo(() => {
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return { totalUnits: 0, totalAmount: 0 };
    }

    const totalUnits = cart.reduce((acc, item) => {
      return (
        acc + (item && typeof item.quantity === 'number' ? item.quantity : 0)
      );
    }, 0);

    // Validation des montants
    const totalAmount = parseFloat(
      cart
        .reduce((acc, item) => {
          const itemSubtotal =
            item && typeof item.subtotal === 'number'
              ? item.subtotal
              : item &&
                  typeof item.quantity === 'number' &&
                  typeof item.price === 'number'
                ? item.quantity * item.price
                : 0;

          return acc + itemSubtotal;
        }, 0)
        .toFixed(2),
    );

    return { totalUnits, totalAmount };
  }, [cart]);

  const checkoutHandler = useCallback(() => {
    // Valider le panier avant de procéder au checkout
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      setError('Your cart is empty');
      return;
    }

    try {
      // Validation et formatage des montants
      const amount = parseFloat(cartSummary.totalAmount);

      if (isNaN(amount)) {
        throw new Error('Invalid cart total');
      }

      const tax = parseFloat((amount * 0.05).toFixed(2));
      const totalAmount = parseFloat((amount + tax).toFixed(2));

      if (isNaN(tax) || isNaN(totalAmount)) {
        throw new Error('Error calculating order totals');
      }

      // Sanitize data before passing it to the checkout handler
      const data = {
        amount,
        tax,
        totalAmount,
      };

      saveOnCheckout(data);
      router.push('/shipping-choice');
    } catch (err) {
      console.error('Checkout validation error:', err);
      setError('Unable to proceed to checkout. Please try again.');
    }
  }, [cart, cartSummary, saveOnCheckout, router]);

  // Afficher un message d'erreur si une erreur s'est produite
  if (error) {
    return (
      <div className="container mx-auto px-4 py-10 text-center">
        <div
          className="bg-red-100 p-4 rounded-md mb-4"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-red-700">{error}</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            memoizedSetCartToState();
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded-md"
          aria-label="Try loading cart again"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Afficher un indicateur de chargement si les données sont en cours de chargement
  if (loading && !isInitialized) {
    return <Loading aria-label="Loading your cart" />;
  }

  return (
    <>
      <section className="py-5 sm:py-7 bg-blue-100">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <h1 className="text-3xl font-semibold mb-2" aria-live="polite">
            {cartCount || 0} Item{cartCount !== 1 ? 's' : ''} in Cart
          </h1>
        </div>
      </section>

      {/* Feedback pour l'utilisateur */}
      {operationStatus && (
        <div
          className={`fixed top-4 right-4 p-3 rounded-md ${
            operationStatus.isError
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
          }`}
          role="status"
          aria-live="polite"
        >
          {operationStatus.message}
        </div>
      )}

      {cartCount > 0 ? (
        <section className="py-10">
          <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
            <div className="flex flex-col md:flex-row gap-4">
              <main className="md:w-3/4">
                <article className="border border-gray-200 bg-white shadow-xs rounded-sm mb-5 p-3 lg:p-5">
                  {loading && isInitialized && (
                    <div
                      className="text-center p-4 bg-blue-50 rounded"
                      role="status"
                      aria-live="polite"
                    >
                      <p>Updating cart...</p>
                    </div>
                  )}

                  {cart &&
                    Array.isArray(cart) &&
                    cart.map((cartItem) => (
                      <ItemCart
                        key={cartItem.id || `item-${cartItem.productId}`}
                        cartItem={cartItem}
                        deleteItemFromCart={handleDeleteItem}
                        decreaseQty={decreaseQty}
                        increaseQty={increaseQty}
                      />
                    ))}
                </article>
              </main>
              <aside className="md:w-1/4">
                <article className="border border-gray-200 bg-white shadow-xs rounded-sm mb-5 p-3 lg:p-5">
                  <ul className="mb-5">
                    <li
                      className="flex justify-between text-gray-600 mb-1"
                      aria-label={`Total units: ${cartSummary.totalUnits}`}
                    >
                      <span>Total Units:</span>
                      <span className="text-green-800">
                        {cartSummary.totalUnits}{' '}
                        {cartSummary.totalUnits !== 1 ? 'Units' : 'Unit'}
                      </span>
                    </li>
                    <li
                      className="text-lg font-bold border-t flex justify-between mt-3 pt-3"
                      aria-label={`Total price: $${cartSummary.totalAmount}`}
                    >
                      <span>Total price:</span>
                      <span>$ {cartSummary.totalAmount}</span>
                    </li>
                  </ul>

                  <button
                    className="px-4 py-3 mb-2 inline-block text-lg w-full text-center font-bold text-white bg-green-800 border border-transparent rounded-md hover:bg-green-700 cursor-pointer"
                    onClick={checkoutHandler}
                    aria-label="Proceed to checkout"
                    disabled={pendingOperation || loading}
                  >
                    Continue to Checkout
                  </button>

                  <Link
                    aria-label="Return to shop"
                    href="/"
                    className="px-4 py-3 inline-block text-lg w-full text-center font-semibold text-green-800 bg-white shadow-xs border border-gray-200 rounded-md hover:bg-gray-100"
                  >
                    Back to shop
                  </Link>
                </article>
              </aside>
            </div>
          </div>
        </section>
      ) : (
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="bg-white p-6 shadow-md rounded-md max-w-md mx-auto">
            <p className="font-bold text-xl mb-4">Your Cart is Empty!</p>
            <p className="text-gray-600 mb-6">
              Looks like you haven&apos;t added any items to your cart yet.
            </p>
            <Link
              href="/"
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Start Shopping
            </Link>
          </div>
        </div>
      )}
    </>
  );
};

export default Cart;
