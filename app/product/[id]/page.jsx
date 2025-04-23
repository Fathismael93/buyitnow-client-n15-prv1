import dynamic from 'next/dynamic';

import { getProductDetails } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';

const ProductDetails = dynamic(
  () => import('@/components/products/ProductDetails'),
  {
    loading: () => <Loading />,
  },
);

// Types d'erreurs personnalisés pour une meilleure gestion
class ProductNotFoundError extends Error {
  constructor(productId) {
    super(`Product with ID ${productId} not found`);
    this.name = 'ProductNotFoundError';
    this.statusCode = 404;
  }
}

export const metadata = {
  title: 'Single Product',
};

const ProductDetailsPage = async ({ params }) => {
  try {
    const { id } = await params;

    // Validation de l'ID
    if (!id || typeof id !== 'string') {
      throw new ProductNotFoundError('invalid');
    }

    const data = await getProductDetails((await params)?.id);

    return (
      <ProductDetails
        product={data?.product}
        sameCategoryProducts={data?.sameCategoryProducts}
      />
    );
  } catch (error) {
    console.log(error);
  }
};

export default ProductDetailsPage;
