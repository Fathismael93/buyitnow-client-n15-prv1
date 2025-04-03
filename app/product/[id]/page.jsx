import dynamic from 'next/dynamic';

import { getProductDetails } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';

const TestingComp = dynamic(() => import('@/components/products/TestingComp'), {
  loading: () => <Loading />,
});

// const ProductDetails = dynamic(
//   () => import('@/components/products/ProductDetails'),
//   {
//     loading: () => <Loading />,
//   },
// );

export const metadata = {
  title: 'Single Product',
};

const ProductDetailsPage = async ({ params }) => {
  const data = await getProductDetails((await params)?.id);

  // return <ProductDetails data={data} />;
  return <TestingComp data={data} />;
};

export default ProductDetailsPage;
