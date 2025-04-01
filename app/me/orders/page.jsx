import React from 'react';
import dynamic from 'next/dynamic';

import { getAllOrders } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';

const ListOrders = dynamic(() => import('@/components/orders/ListOrders'), {
  loading: () => <Loading />,
});

export const metadata = {
  title: 'Buy It Now - Orders',
};

// eslint-disable-next-line react/prop-types
const MyOrdersPage = async ({ searchParams }) => {
  const orders = await getAllOrders(await searchParams);

  return <ListOrders orders={orders} />;
};

export default MyOrdersPage;
