import { Suspense, lazy } from 'react';
import { notFound } from 'next/navigation';
import { getProductDetails } from '@/backend/utils/server-only-methods';
import Loading from '@/app/loading';
import logger from '@/utils/logger';

// Utilisation de lazy pour le chargement différé du composant
const ProductDetails = lazy(
  () => import('@/components/products/ProductDetails'),
);

// Cache simple pour éviter la double récupération du même produit
// Cela restera en mémoire seulement pendant le rendu d'une requête spécifique
const requestCache = new Map();

// Fonction d'aide pour récupérer les données avec cache
async function getProductWithCache(id, options = {}) {
  const { forMetadata = false, timeout = 5000 } = options;
  const cacheKey = `product-${id}${forMetadata ? '-meta' : ''}`;

  // Vérifier le cache d'abord
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey);
  }

  // Préparer la récupération avec timeout
  const fetchPromise = getProductDetails(id);
  let resultPromise;

  if (forMetadata) {
    // Pour les métadonnées, utiliser un timeout court
    resultPromise = Promise.race([
      fetchPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Metadata fetch timeout')), timeout),
      ),
    ]);
  } else {
    // Pour le contenu principal, utiliser juste la promesse
    resultPromise = fetchPromise;
  }

  try {
    const result = await resultPromise;
    requestCache.set(cacheKey, result);
    return result;
  } catch (error) {
    // Log l'erreur mais ne pas la stocker dans le cache
    logger.error(
      `Error fetching product ${forMetadata ? 'metadata' : 'data'}`,
      {
        productId: id,
        error: error.message,
        source: forMetadata ? 'metadata' : 'main_content',
      },
    );
    throw error; // Propager l'erreur
  }
}

// Générer les métadonnées dynamiquement pour chaque produit
export async function generateMetadata({ params }) {
  if (!params?.id) {
    return {
      title: 'Produit introuvable | Buy It Now',
      description: "Ce produit n'existe pas ou a été retiré.",
    };
  }

  try {
    // Utiliser l'ID normalisé
    const productId = params?.id?.toString().trim();

    // Récupérer les données avec un cache et un timeout
    const productData = await getProductWithCache(productId, {
      forMetadata: true,
      timeout: 2000,
    }).catch(() => null);

    // Si le produit n'est pas trouvé, utiliser des métadonnées par défaut
    if (!productData?.product) {
      return {
        title: 'Produit | Buy It Now',
        description: 'Détails du produit sur Buy It Now',
      };
    }

    const product = productData?.product;

    // Construction des données structurées JSON-LD pour le SEO
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product?.name,
      description: product?.description,
      image: product?.images[0]?.url,
      sku: product?._id,
      offers: {
        '@type': 'Offer',
        price: product?.price,
        priceCurrency: 'EUR',
        availability:
          product?.stock > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
      },
    };

    return {
      title: `${product?.name} | Buy It Now`,
      description:
        product?.description?.substring(0, 160) ||
        'Découvrez ce produit de qualité à un prix attractif',
      openGraph: {
        title: `${product?.name} | Buy It Now`,
        description:
          product?.description?.substring(0, 160) ||
          'Découvrez ce produit de qualité à un prix attractif',
        images:
          product?.images?.length > 0
            ? [{ url: product?.images[0]?.url, alt: product?.name }]
            : [],
        type: 'product',
        product: {
          price: {
            amount: product?.price,
            currency: 'EUR',
          },
        },
      },
      // Ajout des données structurées pour les moteurs de recherche
      alternates: {
        canonical: `/product/${product?.slug || product?._id}`,
      },
      other: {
        'custom:jsonLd': JSON.stringify(jsonLd),
      },
    };
  } catch (error) {
    logger.error('Error generating product metadata', {
      productId: params?.id,
      error: error?.message,
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

// Préfetcher le CSS nécessaire pour la page produit
export function generateViewport() {
  return {
    themeColor: '#4da8ff',
    // Précharger le CSS critique
    preload: [
      {
        href: '/styles/product-critical.css',
        as: 'style',
      },
    ],
  };
}

const ProductDetailsPage = async ({ params }) => {
  // Validation de base des paramètres
  if (!params?.id) {
    logger.warn('Product ID missing in params', { params });
    notFound();
  }

  // Utiliser un ID normalisé pour éviter les problèmes
  const productId = params?.id?.toString().trim();

  // Traçage de la requête pour le monitoring des performances
  const requestStart = Date.now();
  logger.info('ProductDetailsPage: Fetching product data', {
    productId,
    action: 'product_page_load_start',
  });

  try {
    // Récupération des données du produit avec le cache
    // Si getProductDetails lance une erreur, elle sera capturée par le error.jsx
    const data = await getProductWithCache(productId);

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
        data?.sameCategoryProducts?.length > 0,
      action: 'product_page_load_complete',
    });

    return (
      <>
        {/* Script pour injecter les données structurées */}
        {data?.product && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Product',
                name: data?.product?.name,
                description: data?.product?.description,
                image: data?.product?.images[0]?.url,
                sku: data?.product?._id,
                offers: {
                  '@type': 'Offer',
                  price: data?.product?.price,
                  priceCurrency: 'EUR',
                  availability:
                    data?.product?.stock > 0
                      ? 'https://schema.org/InStock'
                      : 'https://schema.org/OutOfStock',
                },
              }),
            }}
          />
        )}
        <Suspense fallback={<Loading />}>
          <main>
            <ProductDetails data={data} />
          </main>
        </Suspense>
      </>
    );
  } catch (error) {
    // Si nous arrivons ici, c'est que nous avons une erreur non gérée
    // Le boundary d'erreur (error.jsx) devrait la capturer
    logger.error('Unhandled error in ProductDetailsPage', {
      productId,
      error: error.message,
      stack: error.stack,
    });
    throw error; // Propager l'erreur au error boundary
  }
};

export default ProductDetailsPage;
