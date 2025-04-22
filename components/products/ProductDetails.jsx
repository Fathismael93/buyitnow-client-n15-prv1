/* eslint-disable no-unused-vars */
'use client';

import {
  useContext,
  useState,
  useEffect,
  useCallback,
  memo,
  useRef,
} from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'react-toastify';
import Image from 'next/image';
import Link from 'next/link';
import Head from 'next/head';

import AuthContext from '@/context/AuthContext';
import CartContext from '@/context/CartContext';
import { arrayHasData } from '@/helpers/helpers';
import { INCREASE } from '@/helpers/constants';
import { captureException } from '@/monitoring/sentry';

// Chargement dynamique des composants lourds
const BreadCrumbs = dynamic(() => import('@/components/layouts/BreadCrumbs'), {
  ssr: true,
  loading: () => <div className="h-12 bg-gray-100 animate-pulse rounded"></div>,
});

// Composant pour le modal de zoom d'image
const ImageZoomModal = memo(({ isOpen, image, onClose }) => {
  if (!isOpen) return null;

  // Empêcher le défilement du corps lorsque le modal est ouvert
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative w-full max-w-4xl h-auto max-h-[90vh] overflow-hidden">
        <button
          className="absolute top-2 right-2 bg-white rounded-full p-2 text-gray-800 hover:bg-gray-200 transition-colors z-10"
          onClick={onClose}
          aria-label="Fermer le zoom"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <div className="relative w-full h-[80vh]">
          <Image
            src={image || '/images/default_product.png'}
            alt="Image agrandie du produit"
            fill
            sizes="100vw"
            className="object-contain"
            priority
          />
        </div>
      </div>
    </div>
  );
});

ImageZoomModal.displayName = 'ImageZoomModal';

const RelatedProducts = memo(({ products, currentProductId }) => {
  // Référence pour le défilement horizontal
  const scrollContainerRef = useRef(null);

  // Fonction pour faire défiler horizontalement
  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const { current } = scrollContainerRef;
      const scrollAmount = 300;
      if (direction === 'left') {
        current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

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
    <div className="relative group">
      {/* Contrôles de défilement - visibles sur desktop ou au survol */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white rounded-full p-2 shadow-md z-10 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block"
        aria-label="Voir les produits précédents"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-gray-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-white rounded-full p-2 shadow-md z-10 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block"
        aria-label="Voir les produits suivants"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-gray-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      {/* Conteneur de défilement */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 p-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-6"
      >
        {filteredProducts.map((product) => (
          <Link
            key={product?._id}
            href={`/product/${product?._id}`}
            className="flex-shrink-0 snap-start w-[180px] h-auto bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 overflow-hidden"
            aria-label={`Voir ${product?.name || 'le produit'}`}
          >
            <div className="relative w-full h-[180px] bg-gray-50">
              <Image
                src={product?.images?.[0]?.url || '/images/default_product.png'}
                alt={product?.name || 'Image du produit'}
                fill
                sizes="180px"
                className="object-contain p-2"
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFdwI2QOQvlwAAAABJRU5ErkJggg=="
              />
            </div>
            <div className="p-3">
              <h3 className="font-medium text-gray-900 line-clamp-2 h-12">
                {product?.name || 'Produit'}
              </h3>
              <p className="text-primary-dark font-bold mt-2">
                {product?.price
                  ? product.price.toLocaleString(undefined, {
                      style: 'currency',
                      currency: 'EUR',
                      minimumFractionDigits: 2,
                    })
                  : 'Prix non disponible'}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Indicateur de défilement sur mobile */}
      <div className="flex justify-center mt-2 md:hidden">
        <div className="w-16 h-1 bg-gray-300 rounded-full"></div>
      </div>
    </div>
  );
});

RelatedProducts.displayName = 'RelatedProducts';

const ProductImageGallery = memo(({ product, onError, onZoomClick }) => {
  const [selectedImage, setSelectedImage] = useState(
    product?.images?.[0]?.url || '/images/default_product.png',
  );
  const [isLoading, setIsLoading] = useState(true);

  const handleImageSelect = useCallback((image) => {
    setIsLoading(true);
    setSelectedImage(image);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Préchargement des images pour une expérience plus fluide
  useEffect(() => {
    const preloadImages = async () => {
      if (product?.images && product.images.length > 0) {
        const imagePromises = product.images.map((img) => {
          if (img?.url) {
            return new Promise((resolve, reject) => {
              const imgEl = document.createElement('img');
              imgEl.onload = resolve;
              imgEl.onerror = reject;
              imgEl.src = img.url;
            });
          }
          return Promise.resolve();
        });

        try {
          await Promise.all(imagePromises);
          // Toutes les images sont préchargées
        } catch (error) {
          // Gérer silencieusement les erreurs de préchargement
          console.warn('Failed to preload some product images');
        }
      }
    };

    preloadImages();
  }, [product?.images]);

  // Préchargement des images pour une expérience plus fluide
  // useEffect(() => {
  //   if (product?.images && product.images.length > 0) {
  //     product.images.forEach((img) => {
  //       if (img?.url) {
  //         const imgEl = new window.Image();
  //         imgEl.src = img.url;
  //       }
  //     });
  //   }
  // }, [product?.images]);

  return (
    <div className="sticky top-20 md:top-24">
      <div className="relative bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden aspect-square md:h-[500px]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 animate-pulse">
            <svg
              className="w-10 h-10 text-gray-300"
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
          </div>
        )}

        <Image
          className="object-contain transition-opacity duration-300"
          src={selectedImage}
          alt={product?.name || 'Image du produit'}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 40vw"
          priority
          onError={onError}
          onLoad={handleImageLoad}
          style={{ opacity: isLoading ? 0 : 1 }}
        />

        {/* Bouton de zoom */}
        <button
          className="absolute bottom-4 right-4 bg-white bg-opacity-70 rounded-full p-2 shadow-md hover:bg-opacity-100 transition-all transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
          onClick={() => onZoomClick(selectedImage)}
          aria-label="Zoomer sur l'image"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-gray-700"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M9 9a2 2 0 114 0 2 2 0 01-4 0z" />
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {product?.images && product.images.length > 1 && (
        <div className="mt-4 grid grid-cols-5 sm:grid-cols-6 gap-2">
          {product.images.map((img, index) => (
            <button
              key={img?.url || index}
              className={`relative border rounded-md overflow-hidden aspect-square focus:outline-none focus:ring-2 transition-all ${
                selectedImage === img?.url
                  ? 'border-primary ring-primary scale-105 shadow-md'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => handleImageSelect(img?.url)}
              aria-label={`Voir l'image ${index + 1}`}
            >
              <Image
                className="object-contain"
                src={img?.url || '/images/default_product.png'}
                alt={`${product?.name || 'Produit'} - vue ${index + 1}`}
                fill
                sizes="80px"
                onError={onError}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

ProductImageGallery.displayName = 'ProductImageGallery';

// Composant d'information sur le stock
const StockInfo = memo(({ stock, inStock }) => {
  // Déterminer le niveau de stock pour un affichage adapté
  let stockLevel = 'high';

  if (stock <= 5) {
    stockLevel = 'low';
  } else if (stock <= 15) {
    stockLevel = 'medium';
  }

  // Si le produit n'est pas en stock
  if (!inStock) {
    return (
      <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md flex items-center space-x-2 my-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <span>Rupture de stock. Veuillez vérifier ultérieurement.</span>
      </div>
    );
  }

  // Affichage selon le niveau de stock
  if (stockLevel === 'low') {
    return (
      <div className="bg-yellow-50 text-yellow-700 px-4 py-3 rounded-md flex items-center space-x-2 my-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <span>Plus que {stock} en stock - commandez vite !</span>
      </div>
    );
  }

  if (stockLevel === 'medium') {
    return (
      <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-md flex items-center space-x-2 my-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
            clipRule="evenodd"
          />
        </svg>
        <span>Stock limité : {stock} disponibles</span>
      </div>
    );
  }

  return (
    <div className="bg-green-50 text-green-700 px-4 py-2 rounded-md flex items-center space-x-2 my-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      <span>En stock : prêt à être expédié</span>
    </div>
  );
});

StockInfo.displayName = 'StockInfo';

const ProductDetails = ({ data }) => {
  const { user } = useContext(AuthContext);
  const { addItemToCart, updateCart, cart } = useContext(CartContext);

  // États
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [isAddedToCart, setIsAddedToCart] = useState(false);

  // Gestionnaires
  const handleOpenZoom = useCallback((image) => {
    setZoomImage(image);
    setZoomModalOpen(true);
  }, []);

  const handleCloseZoom = useCallback(() => {
    setZoomModalOpen(false);
  }, []);

  // Initialisation sécurisée des données
  useEffect(() => {
    try {
      // Effacer l'état "ajouté au panier" à chaque changement de produit
      setIsAddedToCart(false);
      setQuantity(1);

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

        // Vérifier si ce produit est déjà dans le panier
        if (cart && Array.isArray(cart)) {
          const existingItem = cart.find(
            (item) => item?.product?._id === validatedProduct._id,
          );
          if (existingItem) {
            setIsAddedToCart(true);
          }
        }
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
  }, [data, cart]);

  const handleImageError = useCallback(() => {
    toast.info('Impossible de charger certaines images du produit');
  }, []);

  const handleQuantityChange = useCallback(
    (change) => {
      setQuantity((prev) => {
        const newQuantity = prev + change;
        // Limiter la quantité entre 1 et le stock disponible (ou 10 si le stock est très grand)
        const maxQuantity =
          product && product.stock > 0 ? Math.min(product.stock, 10) : 1;
        return Math.max(1, Math.min(newQuantity, maxQuantity));
      });
    },
    [product],
  );

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
        // Si le produit est déjà dans le panier, mettre à jour la quantité
        await updateCart(isProductInCart, INCREASE);
        toast.success('Quantité mise à jour dans votre panier');
      } else {
        // Sinon, ajouter le produit avec la quantité spécifiée
        for (let i = 0; i < quantity; i++) {
          await addItemToCart({
            product: product._id,
          });
        }
        toast.success(
          `${quantity > 1 ? `${quantity} unités ajoutées` : 'Produit ajouté'} au panier`,
        );
      }

      // Marquer comme ajouté au panier pour le retour visuel
      setIsAddedToCart(true);

      // Réinitialiser après un certain délai
      setTimeout(() => {
        setIsAddedToCart(false);
      }, 3000);
    } catch (err) {
      toast.error("Erreur lors de l'ajout au panier. Veuillez réessayer.");
      captureException(err, {
        tags: { component: 'ProductDetails', action: 'addToCart' },
        extra: { productId: product?._id },
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, product, cart, updateCart, addItemToCart, quantity]);

  // Partage du produit
  const handleShare = useCallback(() => {
    if (!product) return;

    const shareData = {
      title: product.name,
      text: product.description.substring(0, 100) + '...',
      url: window.location.href,
    };

    // Utiliser l'API Web Share si disponible
    if (navigator.share) {
      navigator.share(shareData).catch(() => {
        copyToClipboard();
      });
    } else {
      copyToClipboard();
    }

    function copyToClipboard() {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Lien copié dans le presse-papier', {
        icon: '🔗',
      });
    }
  }, [product]);

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
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 p-6 rounded-lg shadow-sm my-4 max-w-2xl mx-auto">
          <h2 className="text-red-800 font-semibold text-xl mb-3">
            Erreur de chargement du produit
          </h2>
          <p className="text-red-600 mb-4">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
            Retour à la page d&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  // État de chargement ou absence de données
  if (!product) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-gray-200 rounded-lg aspect-square"></div>
              <div>
                <div className="h-10 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-6"></div>
                <div className="h-12 bg-gray-200 rounded w-1/3 mb-4"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const inStock = product.stock > 0;

  return (
    <>
      <div className="bg-gray-50">
        <div className="container mx-auto px-4 py-2">
          <BreadCrumbs breadCrumbs={breadCrumbs} />
        </div>
      </div>

      <section className="bg-white py-6 md:py-12">
        <div className="container max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
            {/* Colonne gauche - Galerie d'images */}
            <div className="order-2 lg:order-1">
              <ProductImageGallery
                product={product}
                onError={handleImageError}
                onZoomClick={handleOpenZoom}
              />
            </div>

            {/* Colonne droite - Informations produit */}
            <div className="order-1 lg:order-2">
              <div className="bg-white rounded-lg p-1">
                {/* Badge catégorie */}
                {product.category && (
                  <div className="mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {product.category.categoryName}
                    </span>
                  </div>
                )}

                {/* Titre du produit */}
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                  {product.name}
                </h1>

                {/* Prix */}
                <div className="flex items-center mb-4">
                  <p className="text-2xl md:text-3xl font-bold text-primary">
                    {product.price.toLocaleString(undefined, {
                      style: 'currency',
                      currency: 'EUR',
                      minimumFractionDigits: 2,
                    })}
                  </p>

                  {/* Badge stock */}
                  <div className="ml-4">
                    {inStock ? (
                      <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-1 rounded-full">
                        En stock
                      </span>
                    ) : (
                      <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-1 rounded-full">
                        Indisponible
                      </span>
                    )}
                  </div>
                </div>

                {/* Information stock */}
                <StockInfo stock={product.stock} inStock={inStock} />

                {/* Description */}
                <div className="mt-4 prose prose-sm sm:prose max-w-none text-gray-600 mb-6">
                  <p>{product.description}</p>
                </div>

                {/* Sélecteur de quantité et ajout au panier */}
                <div className="mt-8 space-y-4">
                  {inStock && (
                    <div className="flex items-center">
                      <label
                        htmlFor="quantity"
                        className="mr-4 font-medium text-gray-700"
                      >
                        Quantité:
                      </label>
                      <div className="flex items-center border border-gray-300 rounded-md">
                        <button
                          onClick={() => handleQuantityChange(-1)}
                          disabled={quantity <= 1}
                          className="px-3 py-1 border-r border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-light disabled:opacity-50"
                          aria-label="Diminuer la quantité"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M20 12H4"
                            />
                          </svg>
                        </button>
                        <span
                          id="quantity"
                          className="px-4 py-1 w-10 text-center font-medium"
                        >
                          {quantity}
                        </span>
                        <button
                          onClick={() => handleQuantityChange(1)}
                          disabled={quantity >= Math.min(product.stock, 10)}
                          className="px-3 py-1 border-l border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-light disabled:opacity-50"
                          aria-label="Augmenter la quantité"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      className={`flex-1 px-6 py-3 text-base font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all
                        ${
                          inStock
                            ? isAddedToCart
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-primary hover:bg-primary-dark text-white'
                            : 'bg-gray-300 cursor-not-allowed text-gray-500'
                        }`}
                      onClick={addToCartHandler}
                      disabled={!inStock || isLoading}
                      aria-busy={isLoading}
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center">
                          <svg
                            className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
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
                      ) : isAddedToCart ? (
                        <span className="flex items-center justify-center">
                          <svg
                            className="w-5 h-5 mr-2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            ></path>
                          </svg>
                          Ajouté au panier
                        </span>
                      ) : (
                        <span className="flex items-center justify-center">
                          <svg
                            className="w-5 h-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                            ></path>
                          </svg>
                          Ajouter au panier
                        </span>
                      )}
                    </button>

                    <button
                      className="px-4 py-3 flex items-center justify-center text-primary border border-primary rounded-md hover:bg-primary-light hover:bg-opacity-10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50"
                      onClick={handleShare}
                      aria-label="Partager ce produit"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                        />
                      </svg>
                      Partager
                    </button>
                  </div>
                </div>

                {/* Informations supplémentaires */}
                <div className="mt-8 border-t border-gray-200 pt-6">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">
                        Catégorie
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {product.category?.categoryName || 'Non catégorisé'}
                      </dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">
                        Référence
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 font-mono">
                        {product._id || 'N/A'}
                      </dd>
                    </div>
                    <div className="sm:col-span-1">
                      <dt className="text-sm font-medium text-gray-500">
                        Disponibilité
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {inStock
                          ? `${product.stock} unités disponibles`
                          : 'Rupture de stock'}
                      </dd>
                    </div>
                    {product.slug && (
                      <div className="sm:col-span-1">
                        <dt className="text-sm font-medium text-gray-500">
                          Slug
                        </dt>
                        <dd className="mt-1 text-sm text-gray-900 font-mono">
                          {product.slug}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Section produits similaires */}
          <div className="mt-16">
            <div className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 mb-6">
                Produits similaires
              </h2>
              <RelatedProducts
                products={relatedProducts}
                currentProductId={product._id}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Modal de zoom */}
      <ImageZoomModal
        isOpen={zoomModalOpen}
        image={zoomImage}
        onClose={handleCloseZoom}
      />
    </>
  );
};

export default memo(ProductDetails);
