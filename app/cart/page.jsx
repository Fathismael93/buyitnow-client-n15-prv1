import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const Cart = dynamic(() => import('@/components/cart/Cart'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Your Cart',
};

const CartPage = () => {
  return <Cart />;
};

export default CartPage;
