import dynamic from 'next/dynamic';

import { getProductDetails } from '@/backend/utils/server-only-methods';
import { Suspense } from 'react';
import { captureException } from '@/monitoring/sentry';
import { notFound } from 'next/navigation';
import ProductLoading from './ProductLoading';

const ProductDetails = dynamic(
  () => import('@/components/products/ProductDetails'),
  {
    loading: () => <ProductLoading />,
    ssr: true,
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

// Métadonnées dynamiques pour un meilleur SEO
export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    if (!id) {
      return {
        title: 'Product Not Found | Buy It Now',
        description: 'The requested product could not be found.',
      };
    }

    const data = await getProductDetails(id);
    const product = data?.product;

    console.log('Product data in generateMetadata:', data);

    if (!product) {
      return {
        title: 'Product Not Found | Buy It Now',
        description: 'The requested product could not be found.',
      };
    }

    return {
      title: `${product?.name} | Buy It Now`,
      description: product?.description
        ? `${product?.description.substring(0, 155)}...`
        : 'Discover this amazing product on Buy It Now',
      openGraph: {
        title: product?.name,
        type: 'product',
        locale: 'fr_FR',
      },
    };
  } catch (error) {
    console.error('Error generating product metadata:', error);

    // Capturer l'erreur dans Sentry mais continuer avec des métadonnées par défaut
    captureException(error, {
      tags: {
        component: 'ProductDetailsPage',
        action: 'generateMetadata',
      },
    });

    return {
      title: 'Product | Buy It Now',
      description: 'Discover our amazing products on Buy It Now',
    };
  }
}

const ProductDetailsPage = async ({ params }) => {
  const { id } = await params;
  try {
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
      <Suspense fallback={<ProductLoading />}>
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
    console.error(`Error loading product ${id}:`, error);

    // Enregistrement de l'erreur dans Sentry avec contexte enrichi
    captureException(error, {
      tags: {
        component: 'ProductDetailsPage',
        errorType: error.name,
        productId: params?.id,
      },
      extra: {
        message: error.message,
        statusCode: error.statusCode || 500,
      },
    });

    // Redirection vers la page 404 si le produit n'existe pas
    if (error.statusCode === 404 || error instanceof ProductNotFoundError) {
      notFound(); // Utilise la fonctionnalité Next.js pour afficher la page 404
    }

    // Les autres types d'erreurs seront capturés par error.jsx
    throw error;
  }
};

export default ProductDetailsPage;
