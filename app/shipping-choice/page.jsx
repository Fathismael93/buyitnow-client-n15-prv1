import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';
import { getAllAddresses } from '@/backend/utils/server-only-methods';

const ShippingChoice = dynamic(
  () => import('@/components/cart/ShippingChoice'),
  {
    loading: () => <Loading />,
  },
);

export const metadata = {
  title: 'Buy It Now - Shipping Choice',
};
const ShippingChoicePage = async () => {
  const data = await getAllAddresses('shipping');

  return (
    <ShippingChoice
      addresses={data?.addresses}
      payments={data?.paymentTypes}
      deliveryPrice={data?.deliveryPrice}
    />
  );
};

export default ShippingChoicePage;
