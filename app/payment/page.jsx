import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const Payment = dynamic(() => import('@/components/cart/Payment'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Payment',
};

const PaymentPage = () => {
  return <Payment />;
};

export default PaymentPage;
