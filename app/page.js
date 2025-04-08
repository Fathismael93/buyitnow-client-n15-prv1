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

  console.log('productsData in homepage', productsData);
  console.log('categories in homepage', categories);

  return <ListProducts data={productsData} categories={categories} />;
};

export default HomePage;
