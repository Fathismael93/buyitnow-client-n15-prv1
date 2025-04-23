import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { captureException } from '@/monitoring/sentry';

import { getProductDetails } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';

// Import dynamique avec configuration optimisée
const ProductDetails = dynamic(
  () => import('@/components/products/ProductDetails'),
  {
    loading: () => <Loading />,
    ssr: true, // Garantit le rendu côté serveur pour améliorer le SEO
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
  try {
    // Nous utilisons un bloc try-catch pour éviter de planter la génération des métadonnées
    const productId = params?.id;

    if (!productId) {
      return {
        title: 'Product Not Found | Buy It Now',
        description: 'The requested product could not be found.',
      };
    }

    const data = await getProductDetails(productId);
    const product = data?.product;

    if (!product) {
      return {
        title: 'Product Not Found | Buy It Now',
        description: 'The requested product could not be found.',
      };
    }

    return {
      title: `${product.name} | Buy It Now`,
      description: product.description
        ? `${product.description.substring(0, 155)}...`
        : 'Discover this amazing product on Buy It Now',
      openGraph: {
        title: product.name,
        description: product.description
          ? `${product.description.substring(0, 155)}...`
          : 'Discover this amazing product on Buy It Now',
        type: 'product',
        images: product.images?.[0]
          ? [
              {
                url: product.images[0],
                width: 800,
                height: 600,
                alt: product.name,
              },
            ]
          : [],
        locale: 'fr_FR',
      },
      // Schéma JSON-LD pour produit (améliore le référencement)
      other: {
        'product-json': JSON.stringify({
          '@context': 'https://schema.org/',
          '@type': 'Product',
          name: product.name,
          description: product.description,
          image: product.images?.[0] || '',
          offers: {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'EUR',
            availability:
              product.stock > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
          },
        }),
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

// Configuration de revalidation pour la mise en cache
export const revalidate = 18000; // Revalidation toutes les heures

const ProductDetailsPage = async ({ params }) => {
  try {
    const productId = params?.id;

    // Validation de l'ID
    if (!productId || typeof productId !== 'string') {
      throw new ProductNotFoundError('invalid');
    }

    // Sanitization basique de l'ID (à adapter selon votre format d'ID)
    if (!/^[a-zA-Z0-9_-]+$/.test(productId)) {
      throw new ProductNotFoundError('invalid format');
    }

    // Récupération des données avec gestion des erreurs
    const data = await getProductDetails(productId).catch((error) => {
      throw new ProductFetchError(productId, error);
    });

    // Vérifier si le produit existe
    if (!data?.product) {
      throw new ProductNotFoundError(productId);
    }

    // Utilisation de Suspense pour améliorer l'expérience utilisateur pendant le chargement
    return (
      <Suspense fallback={<Loading />}>
        <section itemScope itemType="https://schema.org/Product">
          <meta itemProp="productID" content={productId} />
          <ProductDetails
            product={data.product}
            sameCategoryProducts={data.sameCategoryProducts}
          />
        </section>
      </Suspense>
    );
  } catch (error) {
    console.error(`Error loading product ${params?.id}:`, error);

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
