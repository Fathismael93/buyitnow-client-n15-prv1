import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const Confirmation = dynamic(() => import('@/components/cart/Confirmation'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Confirmation',
};

const ConfirmationPage = () => {
  return <Confirmation />;
};

export default ConfirmationPage;
