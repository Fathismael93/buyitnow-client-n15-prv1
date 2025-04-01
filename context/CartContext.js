/* eslint-disable react/prop-types */
'use client';

import { DECREASE } from '@/helpers/constants';
import React, { createContext, useState } from 'react';
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/cart`);
      const data = await res.json();

      if (data?.success === false) {
        toast.info(data?.message);
        return;
      }

      if (data?.success) {
        setCart(data?.data?.cart);
        setCartCount(data?.data?.cartCount);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message);
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
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export default CartContext;
