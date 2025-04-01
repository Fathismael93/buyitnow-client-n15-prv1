'use client';

import React, { useContext, useEffect } from 'react';
import Link from 'next/link';

import CartContext from '@/context/CartContext';
import { DECREASE, INCREASE } from '@/helpers/constants';
import { useRouter } from 'next/navigation';
import ItemCart from './components/ItemCart';
import Loading from '@/app/loading';

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

  const router = useRouter();

  useEffect(() => {
    setCartToState();
    router.prefetch('/shipping');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const increaseQty = (cartItem) => {
    setLoading(true);
    updateCart(cartItem, INCREASE);
  };

  const decreaseQty = (cartItem) => {
    setLoading(true);
    updateCart(cartItem, DECREASE);
  };

  const amount = cart
    ?.reduce((acc, item) => acc + item?.quantity * item?.product?.price, 0)
    .toFixed(2);

  const checkoutHandler = () => {
    const data = {
      amount,
    };

    saveOnCheckout(data);
  };

  return loading ? (
    <Loading />
  ) : (
    <>
      <section className="py-5 sm:py-7 bg-blue-100">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <h2
            className="text-3xl font-semibold mb-2"
            title="count items in cart"
          >
            {cartCount || 0} Item(s) in Cart
          </h2>
        </div>
      </section>

      {cartCount > 0 ? (
        <section className="py-10">
          <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
            <div className="flex flex-col md:flex-row gap-4">
              <main className="md:w-3/4">
                <article className="border border-gray-200 bg-white shadow-xs rounded-sm mb-5 p-3 lg:p-5">
                  {cart?.map((cartItem) => (
                    <ItemCart
                      key={cartItem._id}
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
                      className="flex justify-between text-gray-600  mb-1"
                      title="total units"
                    >
                      <span>Total Units:</span>
                      <span className="text-green-800">
                        {cart?.reduce((acc, item) => acc + item?.quantity, 0)}{' '}
                        (Units)
                      </span>
                    </li>
                    <li
                      className="text-lg font-bold border-t flex justify-between mt-3 pt-3"
                      title="total price"
                    >
                      <span>Total price:</span>
                      <span>$ {amount}</span>
                    </li>
                  </ul>

                  <Link
                    className="px-4 py-3 mb-2 inline-block text-lg w-full text-center font-bold text-white bg-green-800 border border-transparent rounded-md hover:bg-green-700 cursor-pointer"
                    onClick={checkoutHandler}
                    title="Continue"
                    href="/shipping-choice"
                  >
                    Continue
                  </Link>

                  <Link
                    title="Back to shop"
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
        <div className="w-full">
          <p className="font-bold text-xl text-center">Cart Empty!</p>
        </div>
      )}
    </>
  );
};

export default Cart;
