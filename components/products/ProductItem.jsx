import { useContext } from 'react';
import { toast } from 'react-toastify';
import CartContext from '@/context/CartContext';
import { INCREASE } from '@/helpers/constants';
import AuthContext from '@/context/AuthContext';
import Link from 'next/link';
import Image from 'next/image';

const ProductItem = ({ product }) => {
  const { addItemToCart, updateCart, cart } = useContext(CartContext);
  const { user } = useContext(AuthContext);

  const inStock = product?.stock >= 1;

  const addToCartHandler = (e) => {
    e.preventDefault();

    if (!user) {
      return toast.error(
        'Connectez-vous pour ajouter des articles à votre panier !',
      );
    }
    const isProductInCart = cart.find((i) => i?.product?._id === product?._id);

    if (isProductInCart) {
      updateCart(isProductInCart, INCREASE);
    } else {
      addItemToCart({
        product: product?._id,
      });
    }
  };

  const productImageUrl =
    product?.images !== undefined && product?.images[0]
      ? product?.images[0]?.url
      : '/images/default_product.png';

  return (
    <article className="border border-gray-200 overflow-hidden bg-white shadow-md rounded-lg mb-5 transition-shadow hover:shadow-lg">
      <Link
        href={`/product/${product?._id}`}
        className="flex flex-col md:flex-row hover:bg-blue-50"
      >
        <div className="md:w-1/4 p-3 flex justify-center">
          <div className="relative w-full aspect-square">
            <Image
              src={productImageUrl}
              alt={product?.name || 'Product image'}
              title={product?.name}
              priority={false}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-contain"
              onError={(e) => {
                e.currentTarget.src = '/images/default_product.png';
                e.currentTarget.onerror = null;
              }}
            />
          </div>
        </div>
        <div className="md:w-2/4">
          <div className="p-4">
            <h3
              className="font-semibold text-xl text-gray-800 line-clamp-2"
              title={product?.name}
            >
              {product?.name}
            </h3>
            <div className="mt-4 md:text-xs lg:text-sm text-gray-600">
              <p className="mb-1" title={product?.category?.categoryName}>
                <span className="font-semibold mr-3">Catégorie: </span>
                <span>{product?.category?.categoryName}</span>
              </p>
              <p className="mb-1" title="Description">
                <span className="font-semibold mr-3">Description: </span>
                <span className="line-clamp-2">
                  {product?.description?.substring(0, 75)}...
                </span>
              </p>
              <p className="mb-1" title="Stock">
                <span className="font-semibold mr-3">Stock: </span>
                {inStock ? (
                  <span className="text-green-700 font-medium">En stock</span>
                ) : (
                  <span className="text-red-700 font-medium">
                    Rupture de stock
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="md:w-1/4 border-t lg:border-t-0 lg:border-l border-gray-200">
          <div className="p-5">
            <span
              className="text-xl font-semibold text-black flex items-center justify-center md:justify-start"
              data-testid="Price"
            >
              {new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR',
              }).format(product?.price)}
            </span>

            <p
              className="text-green-700 md:text-xs lg:text-sm text-center md:text-left"
              title="Shipping text"
            >
              Livraison gratuite
            </p>
            <div className="my-3 flex justify-center md:justify-start">
              <button
                disabled={!inStock}
                className={`px-2 lg:px-4 py-2 inline-block md:text-xs lg:text-sm text-white rounded-md hover:bg-blue-700 cursor-pointer transition
                  ${inStock ? 'bg-blue-600' : 'bg-gray-400 cursor-not-allowed'}`}
                onClick={(e) => inStock && addToCartHandler(e)}
              >
                {inStock ? 'Ajouter au panier' : 'Indisponible'}
              </button>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
};

export default ProductItem;
