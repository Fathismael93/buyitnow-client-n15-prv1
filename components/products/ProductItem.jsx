import { memo, useCallback, useContext } from 'react';
import { toast } from 'react-toastify';
import Link from 'next/link';
import Image from 'next/image';

import CartContext from '@/context/CartContext';
import { INCREASE } from '@/helpers/constants';
import AuthContext from '@/context/AuthContext';

const ProductItem = memo(({ product }) => {
  const { addItemToCart, updateCart, cart } = useContext(CartContext);
  const { user } = useContext(AuthContext);

  // Vérification de sécurité pour s'assurer que product est un objet valide
  if (!product || typeof product !== 'object') {
    return null;
  }

  const inStock = product.stock > 0;
  const productId = product._id || '';
  const productName = product.name || 'Produit sans nom';
  const productDescription = product.description || '';
  const productPrice = product.price || 0;
  const productCategory = product.category?.categoryName || 'Non catégorisé';

  // URL de l'image avec fallback
  const imageUrl = product.images?.[0]?.url || '/images/default_product.png';

  // Optimisation avec useCallback pour éviter les recréations à chaque rendu
  const addToCartHandler = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        if (!user) {
          return toast.error(
            'Connectez-vous pour ajouter des articles à votre panier !',
          );
        }

        const isProductInCart = cart.find((i) => i?.productId === productId);

        if (isProductInCart) {
          updateCart(isProductInCart, INCREASE);
        } else {
          addItemToCart({
            product: productId,
          });
        }
      } catch (error) {
        toast.error("Impossible d'ajouter au panier. Veuillez réessayer.");
        console.error("Erreur d'ajout au panier:", error);
      }
    },
    [user, cart, productId, addItemToCart, updateCart],
  );

  return (
    <article className="group bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col h-full">
      <Link
        href={`/product/${productId}`}
        className="flex flex-col h-full"
        aria-label={`Voir les détails du produit: ${productName}`}
      >
        {/* Badge Stock */}
        <div className="relative">
          {!inStock && (
            <div className="absolute top-2 right-2 z-10 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              Rupture de stock
            </div>
          )}

          {/* Image en pleine largeur au top */}
          <div className="w-full aspect-square bg-gray-50 p-6 flex items-center justify-center relative">
            <Image
              src={imageUrl}
              alt={productName}
              title={productName}
              width={240}
              height={240}
              onError={(e) => {
                e.currentTarget.src = '/images/default_product.png';
                e.currentTarget.onerror = null;
              }}
              style={{ objectFit: 'contain' }}
              priority={false}
              loading="lazy"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="max-h-48 transition-transform group-hover:scale-105"
            />
          </div>
        </div>

        {/* Corps du produit */}
        <div className="p-4 flex flex-col flex-grow">
          {/* Catégorie */}
          <div className="text-xs text-gray-500 mb-2">{productCategory}</div>

          {/* Titre */}
          <h3
            className="font-semibold text-lg text-gray-800 line-clamp-2 mb-2"
            title={productName}
          >
            {productName}
          </h3>

          {/* Description */}
          <p className="text-sm text-gray-600 line-clamp-2 mb-4 flex-grow">
            {productDescription
              ? productDescription.substring(0, 100) +
                (productDescription.length > 100 ? '...' : '')
              : 'Aucune description disponible'}
          </p>

          {/* Prix et disponibilité */}
          <div className="mt-auto">
            <div className="flex items-baseline justify-between mb-2">
              <span
                className="text-xl font-bold text-gray-900"
                data-testid="Price"
              >
                {new Intl.NumberFormat('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(productPrice)}
              </span>

              <span className="text-xs text-green-600">Livraison gratuite</span>
            </div>
          </div>
        </div>
      </Link>

      {/* Bouton ajouter au panier (en dehors du Link pour éviter conflit) */}
      <div className="px-4 pb-4">
        <button
          disabled={!inStock}
          className={`w-full py-2 rounded-md text-center text-sm transition-colors ${
            inStock
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
          onClick={addToCartHandler}
          aria-label={inStock ? 'Ajouter au panier' : 'Produit indisponible'}
          aria-disabled={!inStock}
        >
          {inStock ? 'Ajouter au panier' : 'Indisponible'}
        </button>
      </div>
    </article>
  );
});

// Ajouter displayName pour faciliter le débogage
ProductItem.displayName = 'ProductItem';

export default ProductItem;
