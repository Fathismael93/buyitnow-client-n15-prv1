import dynamic from 'next/dynamic';

import {
  getAllProducts,
  getCategories,
} from '@/backend/utils/server-only-methods';

const ListProducts = dynamic(
  () => import('@/components/products/ListProducts'),
);

export const metadata = {
  title: 'Buy It Now',
};

const HomePage = async ({ searchParams }) => {
  const productsData = await getAllProducts(await searchParams);
  const categories = await getCategories();

  return <ListProducts data={productsData?.data} categories={categories} />;
};

export default HomePage;
