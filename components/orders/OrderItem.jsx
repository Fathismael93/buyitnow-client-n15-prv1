/* eslint-disable react/prop-types */
'use client';

import dynamic from 'next/dynamic';
import Loading from '@/app/loading';
import OrderContext from '@/context/OrderContext';
import React, { useContext } from 'react';

const OrderedProduct = dynamic(() => import('./OrderedProduct'), {
  loading: () => <Loading />,
});

const OrderItem = ({ order }) => {
  const { deliveryPrice } = useContext(OrderContext);

  return (
    <article className="p-3 lg:p-5 mb-5 bg-white border border-blue-600 rounded-md">
      <header className="lg:flex justify-between mb-4">
        <div className="mb-4 lg:mb-0">
          <p className="font-semibold">
            <span>Order ID: {order?._id} </span>
            {order?.paymentStatus === 'paid' ? (
              <span className="text-green-800 font-semibold">
                • {order?.paymentStatus?.toUpperCase()}
              </span>
            ) : (
              <span className="text-red-800 font-semibold">
                • {order?.paymentStatus?.toUpperCase()}
              </span>
            )}{' '}
            {order?.shippingInfo !== undefined &&
              (order?.orderStatus == 'Processing' ? (
                <span className="text-red-500">
                  • {order?.orderStatus.toUpperCase()}
                </span>
              ) : (
                <span className="text-green-500">
                  • {order?.orderStatus.toUpperCase()}
                </span>
              ))}
          </p>
          <p className="text-gray-500">{order?.createdAt?.substring(0, 10)} </p>
        </div>
      </header>
      <div className="grid md:grid-cols-4 gap-1">
        <div>
          <p className="text-blue-700 mb-1">Person</p>
          <ul className="text-gray-600">
            <li>{order?.user?.name}</li>
            <li>{order?.user?.phone}</li>
            <li>{order?.user?.email}</li>
          </ul>
        </div>
        {order?.shippingInfo !== undefined && (
          <div>
            <p className="text-blue-700 mb-1">Delivery address</p>
            <ul className="text-gray-600">
              <li>{order?.shippingInfo?.street}</li>
              <li>
                {order?.shippingInfo?.city}, {order?.shippingInfo?.state},{' '}
                {order?.shippingInfo?.zipCode}
              </li>
              <li>{order?.shippingInfo?.country}</li>
            </ul>
          </div>
        )}
        <div>
          <p className="text-blue-700 mb-1">Amount Paid</p>
          <ul className="text-gray-600">
            <li>
              <span className="font-bold">Total Price:</span> $
              {order?.shippingInfo === undefined
                ? order?.paymentInfo?.amountPaid.toFixed(2)
                : (order?.paymentInfo?.amountPaid - deliveryPrice).toFixed(2)}
            </li>
            <li>
              <span className="font-bold">Delivery Price:</span> $
              {order?.shippingInfo === undefined ? 0 : deliveryPrice}
            </li>
            <li>
              <span className="font-bold">Total paid:</span> $
              {order?.paymentInfo?.amountPaid.toFixed(2)}
            </li>
          </ul>
        </div>
        <div>
          <p className="text-blue-700 mb-1">Payment</p>
          <ul className="text-gray-600">
            <li>
              <span className="font-bold">Mode:</span>{' '}
              {order?.paymentInfo?.typePayment}
            </li>
            <li>
              <span className="font-bold">Sender:</span>{' '}
              {order?.paymentInfo?.paymentAccountName}
            </li>
            <li>
              <span className="font-bold">Number:</span>{' '}
              {order?.paymentInfo?.paymentAccountNumber}
            </li>
          </ul>
        </div>
      </div>

      <hr className="my-4" />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
        {order?.orderItems?.map((item) => (
          <OrderedProduct key={item._id} item={item} />
        ))}
      </div>
    </article>
  );
};

export default OrderItem;
