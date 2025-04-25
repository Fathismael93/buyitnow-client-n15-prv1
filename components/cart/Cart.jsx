'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import ItemCart from './components/ItemCart';
import CartContext from '@/context/CartContext';
import { DECREASE, INCREASE } from '@/helpers/constants';
import Loading from '@/app/loading';

const Cart = () => {
  const {
    loading,
    updateCart,
    deleteItemFromCart,
    cart,
    cartCount,
    // eslint-disable-next-line no-unused-vars
    cartTotal,
    setLoading,
    saveOnCheckout,
    setCartToState,
  } = useContext(CartContext);

  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const router = useRouter();

  // Effectuer le chargement initial des données
  useEffect(() => {
    const loadCartData = async () => {
      try {
        await setCartToState();
        setIsInitialized(true);
      } catch (err) {
        console.error('Failed to load cart data:', err);
        setError('Unable to load your cart. Please try again later.');
      }
    };

    loadCartData();
    // Précharger la page suivante
    router.prefetch('/shipping');
  }, []);

  // Gestionnaires d'événements optimisés avec feedback d'erreur
  const increaseQty = async (cartItem) => {
    if (cartItem.quantity >= cartItem.stock) {
      return; // Empêcher d'augmenter au-delà du stock
    }

    setLoading(true);
    try {
      await updateCart(cartItem, INCREASE);
    } catch (err) {
      console.error('Failed to increase quantity:', err);
      setError('Unable to update quantity. Please try again.');
    }
  };

  const decreaseQty = async (cartItem) => {
    setLoading(true);
    try {
      await updateCart(cartItem, DECREASE);
    } catch (err) {
      console.error('Failed to decrease quantity:', err);
      setError('Unable to update quantity. Please try again.');
    }
  };

  // Calculer les totaux avec useMemo pour éviter des recalculs inutiles
  const cartSummary = useMemo(() => {
    if (!cart || cart.length === 0) return { totalUnits: 0, totalAmount: 0 };

    const totalUnits = cart.reduce((acc, item) => acc + item.quantity, 0);
    const totalAmount = cart
      .reduce((acc, item) => acc + item.subtotal, 0)
      .toFixed(2);

    return { totalUnits, totalAmount };
  }, [cart]);

  const checkoutHandler = () => {
    // Valider le panier avant de procéder au checkout
    if (!cart || cart.length === 0) {
      setError('Your cart is empty');
      return;
    }

    const data = {
      amount: cartSummary.totalAmount,
      tax: (cartSummary.totalAmount * 0.05).toFixed(2), // Exemple de calcul de taxe
      totalAmount: (parseFloat(cartSummary.totalAmount) * 1.05).toFixed(2), // Total avec taxe
    };

    saveOnCheckout(data);
  };

  // Afficher un message d'erreur si une erreur s'est produite
  if (error) {
    return (
      <div className="container mx-auto px-4 py-10 text-center">
        <div className="bg-red-100 p-4 rounded-md mb-4">
          <p className="text-red-700">{error}</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setCartToState();
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded-md"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Afficher un indicateur de chargement si les données sont en cours de chargement
  if (loading && !isInitialized) {
    return <Loading />;
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

      {cartCount > 0 ? (
        <section className="py-10">
          <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
            <div className="flex flex-col md:flex-row gap-4">
              <main className="md:w-3/4">
                <article className="border border-gray-200 bg-white shadow-xs rounded-sm mb-5 p-3 lg:p-5">
                  {loading && isInitialized && (
                    <div className="text-center p-4">
                      <p>Updating cart...</p>
                    </div>
                  )}

                  {cart?.map((cartItem) => (
                    <ItemCart
                      key={cartItem.id}
                      cartItem={cartItem}
                      deleteItemFromCart={deleteItemFromCart}
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

                  <Link
                    className="px-4 py-3 mb-2 inline-block text-lg w-full text-center font-bold text-white bg-green-800 border border-transparent rounded-md hover:bg-green-700 cursor-pointer"
                    onClick={checkoutHandler}
                    aria-label="Proceed to checkout"
                    href="/shipping-choice"
                  >
                    Continue
                  </Link>

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
