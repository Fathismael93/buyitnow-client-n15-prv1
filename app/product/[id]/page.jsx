import React from 'react';
import dynamic from 'next/dynamic';

import { getProductDetails } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';

const ProductDetails = dynamic(
  () => import('@/components/products/ProductDetails'),
  {
    loading: () => <Loading />,
  },
);

export const metadata = {
  title: 'Single Product',
};

// eslint-disable-next-line react/prop-types
const ProductDetailsPage = async ({ params }) => {
  const data = await getProductDetails((await params)?.id);

  return (
    <ProductDetails
      product={data?.product}
      sameCategoryProducts={data?.sameCategoryProducts}
    />
  );
};

export default ProductDetailsPage;
