/* eslint-disable react/prop-types */
import React, { useContext } from 'react';
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
      return toast.error('Sign in to add items in your cart !');
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

  return (
    <article className="border border-gray-200 overflow-hidden bg-white shadow-xs rounded-sm mb-5">
      <Link
        href={`/product/${product?._id}`}
        className="flex flex-col md:flex-row hover:bg-blue-100"
      >
        <div className="md:w-1/4 flex p-3">
          <div
            style={{
              width: '80%',
              height: '70%',
              position: 'relative',
            }}
          >
            <Image
              src={
                product?.images !== undefined && product?.images[0]
                  ? product?.images[0]?.url
                  : '/images/default_product.png'
              }
              alt={product?.name}
              title={product?.name}
              width="240"
              height="240"
              onError={() => ''}
              style={{ objectFit: 'cover' }}
            />
          </div>
        </div>
        <div className="md:w-2/4">
          <div className="p-4">
            <p className="font-semibold text-xl" title={product?.name}>
              {product?.name}
            </p>
            <div className="mt-4 md:text-xs lg:text-sm text-gray-500">
              <p className="mb-1" title={product?.category?.categoryName}>
                <span className="font-semibold mr-3">Category: </span>
                <span>{product?.category?.categoryName}</span>
              </p>
              <p className="mb-1" title="Description">
                <span className="font-semibold mr-3">Description: </span>
                <span>{product?.description?.substring(0, 45)}...</span>
              </p>
              <p className="mb-1" title="Stock">
                <span className="font-semibold mr-3">Stock: </span>
                {inStock ? (
                  <span className="text-green-700">In Stock</span>
                ) : (
                  <span className="text-red-700">Out of Stock</span>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="md:w-1/4 border-t lg:border-t-0 lg:border-l border-gray-200">
          <div className="p-5">
            <span
              className="text-xl font-semibold text-black"
              data-testid="Price"
            >
              $ {product?.price}
            </span>

            <p
              className="text-green-700 md:text-xs lg:text-md"
              title="Shipping text"
            >
              Free Shipping
            </p>
            <div className="my-3">
              <button
                className="px-2 lg:px-4 py-2 inline-block md:text-xs lg:text-lg text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 cursor-pointer"
                onClick={(e) => addToCartHandler(e)}
              >
                {' '}
                Add to Cart{' '}
              </button>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
};

export default ProductItem;
