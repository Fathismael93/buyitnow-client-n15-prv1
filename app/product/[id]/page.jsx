import { Suspense, lazy } from 'react';
import { notFound } from 'next/navigation';
import { getProductDetails } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';
import logger from '@/utils/logger';

// Utilisation de lazy pour le chargement différé du composant
const ProductDetails = lazy(
  () => import('@/components/products/ProductDetails'),
);

// Fallback pour les produits similaires au cas où ils ne seraient pas disponibles
// const SimilarProductsFallback = lazy(
//   () => import('@/components/products/SimilarProductsFallback'),
// );

// Générer les métadonnées dynamiquement pour chaque produit
export async function generateMetadata({ params }) {
  try {
    // Récupérer les données de base pour les métadonnées
    // Utiliser un timeout court pour éviter de bloquer le rendu
    const productData = await Promise.race([
      getProductDetails(params?.id),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Metadata timeout')), 2000),
      ),
    ]).catch(() => null);

    // Si le produit n'est pas trouvé, utiliser des métadonnées par défaut
    if (!productData?.product) {
      return {
        title: 'Produit | Buy It Now',
        description: 'Détails du produit sur Buy It Now',
      };
    }

    const product = productData.product;

    return {
      title: `${product.name} | Buy It Now`,
      description:
        product.description?.substring(0, 160) ||
        'Découvrez ce produit de qualité à un prix attractif',
      openGraph: {
        title: `${product.name} | Buy It Now`,
        description:
          product.description?.substring(0, 160) ||
          'Découvrez ce produit de qualité à un prix attractif',
        images:
          product.images?.length > 0
            ? [{ url: product.images[0].url, alt: product.name }]
            : [],
        type: 'product',
        product: {
          price: {
            amount: product.price,
            currency: 'EUR',
          },
        },
      },
    };
  } catch (error) {
    logger.error('Error generating product metadata', {
      productId: params?.id,
      error: error.message,
    });

    // Métadonnées par défaut en cas d'erreur
    return {
      title: 'Produit | Buy It Now',
      description: 'Détails du produit sur Buy It Now',
    };
  }
}

// Configuration du cache dynamique selon les besoins des produits
export const revalidate = 1800; // 30 minutes par défaut

const ProductDetailsPage = async ({ params }) => {
  // Validation de base des paramètres
  console.log('ProductDetailsPage: params', { params });
  const { id } = await params;
  if (!id) {
    logger.warn('Product ID missing in params', { params });
    notFound();
  }

  // Utiliser un ID normalisé pour éviter les problèmes
  const productId = id?.toString().trim();

  // Traçage de la requête pour le monitoring des performances
  const requestStart = Date.now();
  logger.info('ProductDetailsPage: Fetching product data', {
    productId,
    action: 'product_page_load_start',
  });

  console.log('ProductDetailsPage: Fetching product data');

  // Récupération des données du produit
  // Si getProductDetails lance une erreur, elle sera capturée par le error.jsx
  const data = await getProductDetails(productId);

  console.log('ProductDetailsPage: Product data fetched', { data });

  // Si getProductDetails renvoie null ou un objet vide
  if (!data || !data?.product) {
    logger.warn('ProductDetailsPage: Product not found or empty data', {
      productId,
      data: data ? 'empty' : 'null',
    });
    notFound();
  }

  // Logging de performance
  logger.info('ProductDetailsPage: Product data fetched successfully', {
    productId,
    duration: Date.now() - requestStart,
    hasSimilarProducts:
      Array.isArray(data?.sameCategoryProducts) &&
      data?.sameCategoryProducts.length > 0,
    action: 'product_page_load_complete',
  });

  return (
    <Suspense fallback={<Loading />}>
      <main>
        <ProductDetails
          data={data}
          // fallback={
          //   <SimilarProductsFallback categoryId={data.product?.category} />
          // }
        />
      </main>
    </Suspense>
  );
};

export default ProductDetailsPage;
