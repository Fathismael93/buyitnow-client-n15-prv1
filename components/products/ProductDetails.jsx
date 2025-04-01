/* eslint-disable react/prop-types */
'use client';

import React, { useContext, useState } from 'react';
import dynamic from 'next/dynamic';

import { toast } from 'react-toastify';

import AuthContext from '@/context/AuthContext';
import CartContext from '@/context/CartContext';
import Image from 'next/image';
import { arrayHasData } from '@/helpers/helpers';
import Link from 'next/link';
import { INCREASE } from '@/helpers/constants';
const BreadCrumbs = dynamic(() => import('@/components/layouts/BreadCrumbs'));

const ProductDetails = ({ product, sameCategoryProducts }) => {
  const { user } = useContext(AuthContext);
  const { addItemToCart, updateCart, cart } = useContext(CartContext);
  // State to track the currently selected image
  const [selectedImage, setSelectedImage] = useState(
    product?.images[0]?.url || '/images/default_product.png',
  );

  const relatedProducts = arrayHasData(sameCategoryProducts)
    ? null
    : sameCategoryProducts?.filter((element) => element?._id !== product?._id);

  // Function to handle image selection
  const handleImageSelect = (image) => {
    setSelectedImage(image);
  };

  const inStock =
    product === undefined || product?.length === 0
      ? false
      : product?.stock >= 1;

  const addToCartHandler = () => {
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

  const breadCrumbs = product !== undefined &&
    product !== null && [
      { name: 'Home', url: '/' },
      {
        name: `${product === undefined || product?.length === 0 ? '' : product?.name?.substring(0, 100)} ...`,
        url: `/products/${product?._id}`,
      },
    ];
  return (
    <>
      <BreadCrumbs breadCrumbs={breadCrumbs} />
      <section className="bg-white py-10">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-5">
            {product === undefined || product?.length === 0 ? (
              <div className="w-full">
                <p className="font-bold text-xl text-center">
                  No product found!
                </p>
              </div>
            ) : (
              <>
                <aside>
                  <div className="border border-gray-200 shadow-xs p-3 text-center rounded-sm mb-5">
                    {console.log('selectedImage: ')}
                    {console.log(selectedImage)}
                    <Image
                      className="object-cover inline-block"
                      src={selectedImage}
                      alt="Product title"
                      width="340"
                      height="340"
                    />
                  </div>
                  <div className="space-x-2 overflow-auto text-center whitespace-nowrap">
                    {product?.images?.map((img) => (
                      <div
                        key={img?.url}
                        className={`inline-block border ${selectedImage === img?.url ? 'border-blue-500' : 'border-gray-200'} cursor-pointer p-1 rounded-md`}
                        onClick={() => handleImageSelect(img?.url)}
                      >
                        <Image
                          className="w-30 h-30"
                          src={
                            img?.url ? img.url : '/images/default_product.png'
                          }
                          alt={product?.name}
                          title={product?.name}
                          width={30}
                          height={30}
                          onError={() => {
                            setSelectedImage('/images/default_product.png');
                          }}
                          style={{ objectFit: 'contain' }}
                        />
                      </div>
                    ))}
                  </div>
                </aside>
                <main>
                  <h2 className="font-semibold text-2xl mb-4">
                    {product?.name}
                  </h2>

                  <div className="flex flex-wrap items-center space-x-2 mb-2">
                    <span className="text-green-700">Verified</span>
                  </div>

                  <p className="mb-4 font-semibold text-xl">
                    ${product?.price}
                  </p>

                  <p className="mb-4 text-gray-500">{product?.description}</p>

                  <div className="flex flex-wrap gap-2 mb-5">
                    <button
                      className="px-4 py-2 inline-block text-white cursor-pointer bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                      onClick={addToCartHandler}
                      disabled={!inStock}
                    >
                      <i className="fa fa-shopping-cart mr-2"></i>
                      Add to cart
                    </button>
                  </div>

                  <ul className="mb-5">
                    <li className="mb-1">
                      {' '}
                      <b className="font-medium w-36 inline-block">Stock</b>
                      {inStock ? (
                        <span className="text-green-700">In Stock</span>
                      ) : (
                        <span className="text-red-700">Out of Stock</span>
                      )}
                    </li>
                    <li className="mb-1">
                      {' '}
                      <b className="font-medium w-36 inline-block">Category:</b>
                      <span className="text-gray-500">
                        {product?.category?.categoryName}
                      </span>
                    </li>
                  </ul>
                </main>
              </>
            )}
          </div>
          <hr />
          <h1 className="font-bold text-2xl mb-3 ml-3">Related Products</h1>
          <div className="flex gap-6 p-3 mt-4 ml-3 border-blue-200 border rounded-lg">
            {!arrayHasData(relatedProducts) &&
              relatedProducts?.map((product) => (
                <Link
                  key={product?._id}
                  href={`/product/${product?._id}`}
                  className="h-58 ml-3 p-5 shadow-lg rounded-md hover:bg-blue-100 hover:rounded-md cursor-pointer"
                >
                  <Image
                    priority
                    src={
                      product?.images[0]
                        ? product?.images[0]?.url
                        : '/images/default_product.png'
                    }
                    alt={product?.name}
                    title={product?.name}
                    width="100"
                    height="150"
                    placeholder="blur-sm"
                    blurDataURL="/images/default_product.png"
                    onError={() => ''}
                    style={{ objectFit: 'fill' }}
                  />
                  <div className="mt-3 align-bottom">
                    <h2 className="font-semibold">
                      {product?.name?.substring(0, 15)}...
                    </h2>
                    <h3>${product?.price}</h3>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default ProductDetails;
