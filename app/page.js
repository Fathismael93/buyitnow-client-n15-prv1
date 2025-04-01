import React from 'react';
import dynamic from 'next/dynamic';

import { getAllProducts } from '@/backend/utils/server-only-methods';

const ListProducts = dynamic(
  () => import('@/components/products/ListProducts'),
);

export const metadata = {
  title: 'Buy It Now',
};

// eslint-disable-next-line react/prop-types
const HomePage = async ({ searchParams }) => {
  const productsData = await getAllProducts(await searchParams);

  return <ListProducts data={productsData} />;
};

export default HomePage;
