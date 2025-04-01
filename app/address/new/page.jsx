import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const NewAddress = dynamic(() => import('@/components/user/NewAddress'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Add New Address',
};

const NewAddressPage = () => {
  return <NewAddress />;
};

export default NewAddressPage;
