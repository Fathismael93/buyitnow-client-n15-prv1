/* eslint-disable react/prop-types */
import Image from 'next/image';
import React from 'react';

const ItemShipping = ({ item }) => {
  return (
    <figure className="flex items-center mb-4 leading-5">
      <div>
        <div className="block relative w-20 h-20 rounded-sm p-1 border border-gray-200">
          <Image
            src={
              item?.product?.images[0]?.url
                ? item?.product?.images[0]?.url
                : '/images/default_product.png'
            }
            alt="Title"
            title="Product Image"
            width={50}
            height={50}
          />
          <span className="absolute -top-0.5 -right-2 w-4 h-4 text-sm text-center flex items-center justify-center text-white bg-blue-500 rounded-full">
            {item.quantity}
          </span>
        </div>
      </div>
      <figcaption className="ml-3">
        <p>{item?.product?.name?.substring(0, 50)}</p>
        <p className="mt-1 text-gray-400">
          Total: ${(item?.quantity * item?.product?.price).toFixed(2)}
        </p>
      </figcaption>
    </figure>
  );
};

export default ItemShipping;
