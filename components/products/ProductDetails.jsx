'use client';

import { useContext, useState, useEffect, useCallback, memo } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'react-toastify';
import Image from 'next/image';
import Link from 'next/link';

import AuthContext from '@/context/AuthContext';
import CartContext from '@/context/CartContext';
import { INCREASE } from '@/helpers/constants';
import { captureException } from '@/monitoring/sentry';

// Chargement dynamique des composants lourds
const BreadCrumbs = dynamic(() => import('@/components/layouts/BreadCrumbs'), {
  ssr: true,
  loading: () => <div className="h-12 bg-gray-100 animate-pulse rounded"></div>,
});

const RelatedProducts = memo(({ products, currentProductId }) => {
  if (!products || products.length === 0) {
    return (
      <p className="text-gray-500 italic p-4">
        Aucun produit similaire disponible pour le moment.
      </p>
    );
  }

  const filteredProducts = products.filter((p) => p?._id !== currentProductId);

  if (filteredProducts.length === 0) {
    return (
      <p className="text-gray-500 italic p-4">
        Aucun autre produit dans cette catégorie.
      </p>
    );
  }

  return (
    <div className="flex gap-6 p-3 mt-4 ml-3 border-blue-200 border rounded-lg overflow-x-auto">
      {filteredProducts.map((product) => (
        <Link
          key={product?._id}
          href={`/product/${product?._id}`}
          className="h-58 min-w-[150px] ml-3 p-5 shadow-lg rounded-md hover:bg-blue-100 hover:rounded-md cursor-pointer transition-all"
          aria-label={`Voir ${product?.name || 'le produit'}`}
        >
          <div className="relative w-[100px] h-[100px]">
            <Image
              src={product?.images?.[0]?.url || '/images/default_product.png'}
              alt={product?.name || 'Image du produit'}
              fill
              sizes="100px"
              priority={false}
              className="object-contain"
              placeholder="blur"
              blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFdwI2QOQvlwAAAABJRU5ErkJggg=="
            />
          </div>
          <div className="mt-3 align-bottom">
            <h2 className="font-semibold">
              {product?.name
                ? product.name.length > 15
                  ? `${product.name.substring(0, 15)}...`
                  : product.name
                : 'Produit'}
            </h2>
            <h3 className="font-medium">
              {product?.price ? `${product.price}€` : 'Prix non disponible'}
            </h3>
          </div>
        </Link>
      ))}
    </div>
  );
});

RelatedProducts.displayName = 'RelatedProducts';

const ProductImageGallery = memo(({ product, onError }) => {
  const [selectedImage, setSelectedImage] = useState(
    product?.images?.[0]?.url || '/images/default_product.png',
  );

  const handleImageSelect = useCallback((image) => {
    setSelectedImage(image);
  }, []);

  return (
    <aside>
      <div className="border border-gray-200 shadow-xs p-3 text-center rounded-sm mb-5 relative h-[340px]">
        <Image
          className="object-contain"
          src={selectedImage}
          alt={product?.name || 'Image du produit'}
          fill
          sizes="(max-width: 768px) 100vw, 340px"
          priority
          onError={onError}
        />
      </div>
      {product?.images && product.images.length > 0 && (
        <div className="flex space-x-2 overflow-auto whitespace-nowrap py-2 px-1">
          {product.images.map((img, index) => (
            <button
              key={img?.url || index}
              className={`border p-1 rounded-md focus:outline-none focus:ring-2 ${
                selectedImage === img?.url
                  ? 'border-blue-500 ring-blue-500'
                  : 'border-gray-200'
              }`}
              onClick={() => handleImageSelect(img?.url)}
              aria-label={`Voir l'image ${index + 1}`}
            >
              <div className="relative w-[30px] h-[30px]">
                <Image
                  className="object-contain"
                  src={img?.url || '/images/default_product.png'}
                  alt={`${product?.name || 'Produit'} - vue ${index + 1}`}
                  fill
                  sizes="30px"
                  onError={onError}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
});

ProductImageGallery.displayName = 'ProductImageGallery';

const ProductDetails = ({ data }) => {
  const { user } = useContext(AuthContext);
  const { addItemToCart, updateCart, cart } = useContext(CartContext);

  // Validation et récupération sécurisée des données
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialisation sécurisée des données
  useEffect(() => {
    try {
      // Valider et nettoyer les données du produit
      if (data?.product && typeof data.product === 'object') {
        // S'assurer que les champs critiques existent
        const validatedProduct = {
          ...data.product,
          name: data.product.name || 'Produit sans nom',
          price:
            typeof data.product.price === 'number' ? data.product.price : 0,
          description:
            data.product.description || 'Aucune description disponible',
          images: Array.isArray(data.product.images) ? data.product.images : [],
          stock:
            typeof data.product.stock === 'number' ? data.product.stock : 0,
          category: data.product.category || { categoryName: 'Non catégorisé' },
        };

        setProduct(validatedProduct);
      } else {
        setError('Données de produit invalides ou manquantes');
      }

      // Valider et nettoyer les produits similaires
      if (
        data?.sameCategoryProducts &&
        Array.isArray(data.sameCategoryProducts)
      ) {
        setRelatedProducts(data.sameCategoryProducts);
      } else {
        setRelatedProducts([]);
      }
    } catch (err) {
      setError('Erreur lors du traitement des données du produit');
      captureException(err, {
        tags: { component: 'ProductDetails' },
        extra: { productId: data?.product?._id },
      });
    }
  }, [data]);

  const handleImageError = useCallback(() => {
    toast.info('Impossible de charger certaines images du produit');
  }, []);

  const addToCartHandler = useCallback(async () => {
    if (!user) {
      toast.error('Connectez-vous pour ajouter des articles à votre panier !');
      return;
    }

    if (!product) {
      toast.error("Impossible d'ajouter ce produit au panier");
      return;
    }

    try {
      setIsLoading(true);

      const isProductInCart = cart.find((i) => i?.product?._id === product._id);

      if (isProductInCart) {
        await updateCart(isProductInCart, INCREASE);
        toast.success('Quantité mise à jour dans votre panier');
      } else {
        await addItemToCart({
          product: product._id,
        });
        toast.success('Produit ajouté au panier');
      }
    } catch (err) {
      toast.error("Erreur lors de l'ajout au panier. Veuillez réessayer.");
      captureException(err, {
        tags: { component: 'ProductDetails', action: 'addToCart' },
        extra: { productId: product?._id },
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, product, cart, updateCart, addItemToCart]);

  // Construction du fil d'Ariane
  const breadCrumbs = product
    ? [
        { name: 'Accueil', url: '/' },
        { name: 'Produits', url: '/' },
        {
          name:
            product.name.length > 50
              ? `${product.name.substring(0, 50)}...`
              : product.name,
          url: `/product/${product._id}`,
        },
      ]
    : [{ name: 'Accueil', url: '/' }];

  // Gestion des erreurs
  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-md my-4">
        <h2 className="text-red-800 font-medium">
          Erreur de chargement du produit
        </h2>
        <p className="text-red-600">{error}</p>
        <Link
          href="/"
          className="mt-2 inline-block text-blue-600 hover:underline"
        >
          Retour à la page d&apos;accueil
        </Link>
      </div>
    );
  }

  // État de chargement ou absence de données
  if (!product) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-gray-100 animate-pulse h-80 rounded-lg"></div>
      </div>
    );
  }

  const inStock = product.stock > 0;

  return (
    <>
      <BreadCrumbs breadCrumbs={breadCrumbs} />
      <section className="bg-white py-10">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-5">
            <ProductImageGallery product={product} onError={handleImageError} />

            <main>
              <h1 className="font-semibold text-2xl mb-4">{product.name}</h1>

              <div className="flex flex-wrap items-center space-x-2 mb-2">
                <span className="text-green-700">Vérifié</span>
                {inStock ? (
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                    En stock
                  </span>
                ) : (
                  <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                    Rupture de stock
                  </span>
                )}
              </div>

              <p className="mb-4 font-semibold text-xl">
                {product.price.toLocaleString(undefined, {
                  style: 'currency',
                  currency: 'EUR',
                  minimumFractionDigits: 2,
                })}
              </p>

              <div className="prose max-w-none mb-4 text-gray-600">
                {product.description}
              </div>

              <div className="flex flex-wrap gap-2 mb-5">
                <button
                  className={`px-4 py-2 inline-block text-white rounded-md
                    ${
                      inStock
                        ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                        : 'bg-gray-400 cursor-not-allowed'
                    } transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
                  onClick={addToCartHandler}
                  disabled={!inStock || isLoading}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Chargement...
                    </span>
                  ) : (
                    <>
                      <i className="fa fa-shopping-cart mr-2"></i>
                      Ajouter au panier
                    </>
                  )}
                </button>

                <button
                  className="px-4 py-2 inline-block text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  onClick={() => {
                    navigator
                      .share?.({
                        title: product.name,
                        text: product.description.substring(0, 100) + '...',
                        url: window.location.href,
                      })
                      .catch(() => {
                        navigator.clipboard.writeText(window.location.href);
                        toast.success('Lien copié dans le presse-papier');
                      });
                  }}
                  aria-label="Partager ce produit"
                >
                  <i className="fa fa-share-alt mr-2"></i>
                  Partager
                </button>
              </div>

              <ul className="mb-5 space-y-2">
                <li className="flex gap-2">
                  <b className="font-medium w-36 inline-block">Stock:</b>
                  {inStock ? (
                    <span className="text-green-700">
                      En stock ({product.stock} disponibles)
                    </span>
                  ) : (
                    <span className="text-red-700">Rupture de stock</span>
                  )}
                </li>
                <li className="flex gap-2">
                  <b className="font-medium w-36 inline-block">Catégorie:</b>
                  <span className="text-gray-700">
                    {product.category?.categoryName || 'Non catégorisé'}
                  </span>
                </li>
                <li className="flex gap-2">
                  <b className="font-medium w-36 inline-block">Référence:</b>
                  <span className="text-gray-700 font-mono text-sm">
                    {product._id || 'N/A'}
                  </span>
                </li>
              </ul>
            </main>
          </div>

          <hr className="my-8" />

          <section>
            <h2 className="font-bold text-2xl mb-4 ml-3">
              Produits similaires
            </h2>
            <RelatedProducts
              products={relatedProducts}
              currentProductId={product._id}
            />
          </section>
        </div>
      </section>
    </>
  );
};

export default memo(ProductDetails);
