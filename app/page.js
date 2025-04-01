/* eslint-disable import/order */
import dynamic from 'next/dynamic';

import { getAllProducts } from '@/backend/utils/server-only-methods';

const ListProducts = dynamic(
  () => import('@/components/products/ListProducts'),
);

export const metadata = {
  title: 'Buy It Now',
};

const HomePage = async ({ searchParams }) => {
  const productsData = await getAllProducts(await searchParams);

  return <ListProducts data={productsData} />;
};

export default HomePage;
