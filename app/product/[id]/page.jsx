import dynamic from 'next/dynamic';

import { getProductDetails } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';
import { Suspense } from 'react';

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

class ProductFetchError extends Error {
  constructor(productId, originalError) {
    super(`Failed to fetch product with ID ${productId}`);
    this.name = 'ProductFetchError';
    this.cause = originalError;
    this.statusCode = 500;
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

    // Sanitization basique de l'ID (à adapter selon votre format d'ID)
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new ProductNotFoundError('invalid format');
    }

    const data = await getProductDetails(id).catch((error) => {
      throw new ProductFetchError(id, error);
    });

    // Vérifier si le produit existe
    if (!data?.product) {
      throw new ProductNotFoundError(id);
    }

    return (
      <Suspense fallback={<Loading />}>
        <section itemScope itemType="https://schema.org/Product">
          <meta itemProp="productID" content={id} />
          <ProductDetails
            product={data.product}
            sameCategoryProducts={data.sameCategoryProducts}
          />
        </section>
      </Suspense>
    );
  } catch (error) {
    console.log(error);
  }
};

export default ProductDetailsPage;
