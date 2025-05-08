'use client';

import {
  useContext,
  useState,
  useEffect,
  useCallback,
  memo,
  useMemo,
} from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'react-toastify';
import PropTypes from 'prop-types';
import Image from 'next/image';
import Link from 'next/link';

import AuthContext from '@/context/AuthContext';
import CartContext from '@/context/CartContext';
import { arrayHasData } from '@/helpers/helpers';
import { INCREASE } from '@/helpers/constants';
import DOMPurify from 'dompurify';

// Chargement dynamique des composants
const BreadCrumbs = dynamic(() => import('@/components/layouts/BreadCrumbs'), {
  ssr: true,
  loading: () => (
    <div className="h-8 bg-gray-100 rounded-lg animate-pulse"></div>
  ),
});

// Formatter le prix avec séparateur de milliers et devise
const formatPrice = (price) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(price || 0);
};

// Composant pour les badges d'information produit
const ProductBadge = memo(
  ({ bgColor, textColor, borderColor, icon, children }) => (
    <div
      className={`inline-block ${bgColor} ${borderColor} rounded-lg px-3 py-2 ${textColor} text-sm mr-2 mb-2`}
    >
      {icon && <i className={`fas ${icon} mr-1`} aria-hidden="true"></i>}
      {children}
    </div>
  ),
);

ProductBadge.displayName = 'ProductBadge';

// Aperçu des images miniatures
const ThumbnailGallery = memo(function ThumbnailGallery({
  images,
  selectedImage,
  onSelect,
}) {
  const defaultImage = '/images/default_product.png';
  const thumbnails = images?.length > 0 ? images : [{ url: defaultImage }];

  return (
    <div className="flex gap-2 mt-4 flex-wrap">
      {thumbnails.map((img, index) => (
        <button
          key={img?.url || `img-${index}`}
          className={`relative overflow-hidden rounded-lg transition-all duration-200 ${
            selectedImage === img?.url
              ? 'ring-2 ring-blue-500 border-2 border-blue-500'
              : 'border-2 border-gray-200 hover:border-blue-300'
          }`}
          onClick={() => onSelect(img?.url)}
          aria-pressed={selectedImage === img?.url}
          aria-label={`View product image ${index + 1}`}
        >
          <div className="w-16 h-16 bg-gray-50">
            <Image
              src={img?.url || defaultImage}
              alt={`Thumbnail ${index + 1}`}
              width={64}
              height={64}
              className="object-contain w-full h-full"
              onError={(e) => {
                e.target.src = defaultImage;
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
});

// Galerie d'images du produit (version améliorée)
const ProductImageGallery = memo(function ProductImageGallery({
  product,
  selectedImage,
  onImageSelect,
}) {
  const defaultImage = '/images/default_product.png';
  const productImages =
    product?.images?.length > 0 ? product.images : [{ url: defaultImage }];

  return (
    <div className="flex flex-col">
      {/* Image principale */}
      <div className="relative overflow-hidden bg-gray-50 rounded-xl border border-gray-100 aspect-square flex items-center justify-center">
        <Image
          src={selectedImage || defaultImage}
          alt={product?.name || 'Product image'}
          width={600}
          height={600}
          className="object-contain max-h-[600px] w-full transition-transform duration-500 hover:scale-110"
          priority={true}
          quality={90}
          placeholder="blur"
          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAEtAJJXIDTiQAAAABJRU5ErkJggg=="
        />

        {/* Badges en superposition sur l'image */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {product?.sold > 10 && (
            <span className="bg-amber-500 text-white text-xs font-bold uppercase px-2 py-1 rounded-md">
              {product.sold > 100 ? 'Best-seller' : 'Populaire'}
            </span>
          )}

          {product?.createdAt &&
            new Date(product.createdAt) >
              new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) && (
              <span className="bg-blue-500 text-white text-xs font-bold uppercase px-2 py-1 rounded-md">
                Nouveau
              </span>
            )}
        </div>

        {/* Bouton de zoom */}
        <button
          className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-sm hover:bg-white rounded-full p-2 shadow-md opacity-80 hover:opacity-100 transition-all text-gray-700"
          aria-label="Zoom image"
          onClick={() => {
            /* Intégrer une fonction de zoom ici */
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
            />
          </svg>
        </button>
      </div>

      {/* Galerie miniatures */}
      <ThumbnailGallery
        images={productImages}
        selectedImage={selectedImage}
        onSelect={onImageSelect}
      />
    </div>
  );
});

// Panneau de prix et d'actions
const PricingPanel = memo(function PricingPanel({
  price,
  oldPrice,
  inStock,
  onAddToCart,
  isAddingToCart,
  onShare,
}) {
  return (
    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mb-6">
      <div className="flex flex-wrap items-baseline mb-4">
        <span className="text-3xl font-bold text-gray-900 mr-3">
          {formatPrice(price)}
        </span>

        {oldPrice && (
          <span className="text-lg text-gray-500 line-through">
            {formatPrice(oldPrice)}
          </span>
        )}

        {inStock && (
          <span className="ml-auto text-green-600 flex items-center text-sm">
            <svg
              className="w-4 h-4 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            En stock
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
        <button
          className={`sm:col-span-3 py-3 px-6 rounded-lg font-medium relative ${
            inStock
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          } transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none`}
          onClick={onAddToCart}
          disabled={!inStock || isAddingToCart}
          aria-label={inStock ? 'Ajouter au panier' : 'Produit indisponible'}
        >
          {isAddingToCart ? (
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
              Ajout en cours...
            </span>
          ) : (
            <span className="flex items-center justify-center">
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
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              {inStock ? 'Ajouter au panier' : 'Indisponible'}
            </span>
          )}
        </button>

        <button
          className="py-3 px-4 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors focus:ring-2 focus:ring-gray-400 focus:outline-none"
          aria-label="Partager ce produit"
          onClick={onShare}
        >
          <span className="flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
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
          </span>
        </button>
      </div>

      {/* Badges et informations */}
      <div className="space-y-2 text-sm text-gray-600">
        {inStock && (
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>Livraison gratuite à partir de 50€</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Expédition sous 24-48h</span>
        </div>
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span>Garantie satisfait ou remboursé</span>
        </div>
      </div>
    </div>
  );
});

// Informations sur le produit
const ProductInfo = memo(function ProductInfo({
  product,
  inStock,
  onAddToCart,
  isAddingToCart,
  onShare,
}) {
  return (
    <div className="space-y-6">
      {/* Titre et vérification */}
      <div>
        {product?.category?.categoryName && (
          <p className="text-blue-600 font-medium text-sm mb-2">
            {product.category.categoryName}
          </p>
        )}
        <div className="flex items-start gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex-grow">
            {product?.name || 'Product Not Available'}
          </h1>

          {product?.verified && (
            <span
              className="bg-green-100 p-1 rounded-full text-green-700 flex-shrink-0"
              title="Produit vérifié"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Panneau de prix et actions */}
      <PricingPanel
        price={product?.price}
        oldPrice={product?.oldPrice}
        inStock={inStock}
        onAddToCart={onAddToCart}
        isAddingToCart={isAddingToCart}
        onShare={onShare}
      />

      {/* Description */}
      <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
        <div className="p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Description
          </h2>
          {product?.description ? (
            <div
              className="prose max-w-none text-gray-600"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(product.description),
              }}
            />
          ) : (
            <p className="text-gray-600">
              Aucune description disponible pour ce produit.
            </p>
          )}
        </div>
      </div>

      {/* Caractéristiques techniques simplifiées */}
      <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
        <div className="p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Caractéristiques
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex border-b border-gray-100 pb-2">
              <span className="font-medium w-36 text-gray-700">Référence:</span>
              <span className="font-mono text-sm text-gray-600">
                {product?._id || 'N/A'}
              </span>
            </div>
            <div className="flex border-b border-gray-100 pb-2">
              <span className="font-medium w-36 text-gray-700">Catégorie:</span>
              <span className="text-gray-600">
                {product?.category?.categoryName || 'Non catégorisé'}
              </span>
            </div>
            <div className="flex border-b border-gray-100 pb-2">
              <span className="font-medium w-36 text-gray-700">
                Disponibilité:
              </span>
              {inStock ? (
                <span className="text-green-600 font-medium">
                  En stock ({product?.stock} unité
                  {product?.stock > 1 ? 's' : ''})
                </span>
              ) : (
                <span className="text-red-600 font-medium">
                  Rupture de stock
                </span>
              )}
            </div>

            {/* Affichage des spécifications si disponibles */}
            {product?.specifications &&
              Object.entries(product.specifications).map(([key, value]) => (
                <div key={key} className="flex border-b border-gray-100 pb-2">
                  <span className="font-medium w-36 text-gray-700">{key}:</span>
                  <span className="text-gray-600">{value}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
});

// Produits connexes repensés
const RelatedProducts = memo(function RelatedProducts({
  products,
  currentProductId,
}) {
  const filteredProducts = useMemo(
    () =>
      products
        ?.filter((product) => product?._id !== currentProductId)
        .slice(0, 4),
    [products, currentProductId],
  );

  if (arrayHasData(filteredProducts)) {
    return null;
  }

  return (
    <section className="mt-12 bg-white rounded-xl p-6 border border-gray-200">
      <h2 className="font-bold text-2xl mb-6 text-gray-800">
        Produits similaires
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredProducts.map((product) => (
          <Link
            key={product?._id}
            href={`/product/${product?._id}`}
            className="group"
          >
            <div className="bg-gray-50 rounded-xl overflow-hidden aspect-square relative mb-3">
              <Image
                src={product?.images?.[0]?.url || '/images/default_product.png'}
                alt={product?.name || 'Produit similaire'}
                width={300}
                height={300}
                className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAEtAJJXIDTiQAAAABJRU5ErkJggg=="
                onError={(e) => {
                  e.target.src = '/images/default_product.png';
                }}
              />

              {/* Badge stock si rupture */}
              {product?.stock <= 0 && (
                <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  Rupture de stock
                </div>
              )}
            </div>

            <h3 className="font-medium text-gray-800 group-hover:text-blue-600 transition-colors line-clamp-2">
              {product?.name || 'Produit sans nom'}
            </h3>

            <p className="font-bold text-blue-600 mt-1">
              {formatPrice(product?.price)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
});

// Composant principal
function ProductDetails({ product, sameCategoryProducts }) {
  const { user } = useContext(AuthContext);
  const { addItemToCart, updateCart, cart } = useContext(CartContext);

  // État pour l'image sélectionnée
  const [selectedImage, setSelectedImage] = useState(null);

  // État pour le feedback d'ajout au panier
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  // Définir l'image sélectionnée au chargement ou quand le produit change
  useEffect(() => {
    if (product?.images && product.images.length > 0) {
      setSelectedImage(product.images[0]?.url);
    } else {
      setSelectedImage('/images/default_product.png');
    }
  }, [product]);

  // Vérifier si le produit est en stock - memoized
  const inStock = useMemo(() => {
    if (!product || product?.stock === undefined) return false;
    return product.stock >= 1;
  }, [product]);

  // Définir les breadcrumbs une seule fois
  const breadCrumbs = useMemo(() => {
    if (!product) return null;

    return [
      { name: 'Accueil', url: '/' },
      { name: 'Produits', url: '/products' },
      {
        name: product.category?.categoryName || 'Catégorie',
        url: `/category/${product.category?._id || 'all'}`,
      },
      {
        name: product.name
          ? product.name.length > 40
            ? `${product.name.substring(0, 40)}...`
            : product.name
          : 'Produit',
        url: `/product/${product._id}`,
      },
    ];
  }, [product]);

  // Gérer l'ajout au panier
  const handleAddToCart = useCallback(() => {
    // Sécurité et validation
    if (!product || !product._id) {
      toast.error('Produit invalide');
      return;
    }

    if (!user) {
      toast.info(
        'Veuillez vous connecter pour ajouter des articles à votre panier',
      );
      return;
    }

    if (!inStock) {
      toast.warning('Ce produit est en rupture de stock');
      return;
    }

    if (isAddingToCart) return; // Éviter les clics multiples

    setIsAddingToCart(true);

    try {
      const isProductInCart = cart.find((i) => i?.productId === product._id);

      if (isProductInCart) {
        updateCart(isProductInCart, INCREASE);
        toast.success('Quantité mise à jour dans votre panier');
      } else {
        addItemToCart({
          product: product._id,
        });
        toast.success('Produit ajouté à votre panier');
      }
    } catch (error) {
      console.error('Error adding item to cart:', error);
      toast.error("Erreur lors de l'ajout au panier. Veuillez réessayer.");
    } finally {
      // Ajouter un délai minimum pour éviter le flickering de l'UI
      setTimeout(() => {
        setIsAddingToCart(false);
      }, 500);
    }
  }, [product, user, cart, inStock, addItemToCart, updateCart, isAddingToCart]);

  // Fonction pour partager le produit
  const handleShare = useCallback(() => {
    // Vérifier si l'API Web Share est disponible
    if (navigator.share) {
      // Utiliser l'API Web Share (mobile)
      navigator
        .share({
          title: product?.name || 'Découvrez ce produit',
          text: `Découvrez ${product?.name} sur notre boutique.`,
          url: window.location.href,
        })
        .then(() => console.log('Produit partagé avec succès'))
        .catch((error) => console.error('Erreur lors du partage:', error));
    } else {
      // Fallback pour les navigateurs qui ne supportent pas l'API Web Share
      // Copier l'URL dans le presse-papier
      navigator.clipboard
        .writeText(window.location.href)
        .then(() => {
          toast.success('Lien copié dans le presse-papier !');
        })
        .catch(() => {
          // Si clipboard API n'est pas supportée, créer un élément temporaire
          const tempInput = document.createElement('input');
          tempInput.value = window.location.href;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
          toast.success('Lien copié dans le presse-papier !');
        });
    }
  }, [product?.name]);

  // Gérer la sélection d'image
  const handleImageSelect = useCallback((imageUrl) => {
    setSelectedImage(imageUrl);
  }, []);

  // État de chargement ou d'erreur
  if (!product) {
    return (
      <div className="container max-w-xl mx-auto px-4 py-16 text-center">
        <div className="bg-white shadow-md rounded-xl p-8">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 text-gray-400 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Produit non disponible
          </h2>
          <p className="text-gray-600 mb-6">
            Le produit demandé n&apos;existe pas ou a été retiré de notre
            catalogue.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 py-6">
      <div className="container max-w-6xl mx-auto px-4">
        {breadCrumbs && <BreadCrumbs breadCrumbs={breadCrumbs} />}

        {/* Section principale */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Colonne gauche: galerie d'images */}
          <ProductImageGallery
            product={product}
            selectedImage={selectedImage}
            onImageSelect={handleImageSelect}
          />

          {/* Colonne droite: informations produit */}
          <ProductInfo
            product={product}
            inStock={inStock}
            onAddToCart={handleAddToCart}
            isAddingToCart={isAddingToCart}
            onShare={handleShare}
          />
        </div>

        {/* Produits similaires en bas de page */}
        <RelatedProducts
          products={sameCategoryProducts}
          currentProductId={product._id}
        />
      </div>
    </div>
  );
}

// Validation des props pour une meilleure robustesse
ProductDetails.propTypes = {
  product: PropTypes.shape({
    _id: PropTypes.string,
    name: PropTypes.string,
    price: PropTypes.number,
    oldPrice: PropTypes.number,
    description: PropTypes.string,
    stock: PropTypes.number,
    sold: PropTypes.number,
    createdAt: PropTypes.string,
    images: PropTypes.arrayOf(
      PropTypes.shape({
        url: PropTypes.string,
      }),
    ),
    category: PropTypes.shape({
      _id: PropTypes.string,
      categoryName: PropTypes.string,
    }),
    specifications: PropTypes.object,
    verified: PropTypes.bool,
  }),
  sameCategoryProducts: PropTypes.array,
};

// Valeurs par défaut pour éviter les erreurs
ProductDetails.defaultProps = {
  product: null,
  sameCategoryProducts: [],
};

export default memo(ProductDetails);
