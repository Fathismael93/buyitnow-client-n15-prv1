import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const Shipping = dynamic(() => import('@/components/cart/Shipping'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Shipping',
};

const ShippingPage = async () => {
  return <Shipping />;
};

export default ShippingPage;
