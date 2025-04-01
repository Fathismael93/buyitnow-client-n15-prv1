/* eslint-disable react/prop-types */
'use client';

import { useRouter } from 'next/navigation';
import React, { createContext, useState } from 'react';

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [error, setError] = useState(null);
  const [updated, setUpdated] = useState(false);
  const [secret, setSecret] = useState(null);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [shippingInfo, setShippinInfo] = useState(null);
  const [shippingStatus, setShippingStatus] = useState(true);
  const [deliveryPrice, setDeliveryPrice] = useState(0);
  const [lowStockProducts, setLowStockProducts] = useState(null);

  const router = useRouter();

  const addOrder = async (orderInfo) => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/orders/webhook`,
        {
          method: 'POST',
          body: JSON.stringify(orderInfo),
        },
      );

      const data = await res.json();

      if (data?.success) {
        setSecret(data?.id);
        router.push('/confirmation');
      } else {
        setLowStockProducts(data?.inavailableStockProducts);
        router.push('/error');
      }
    } catch (error) {
      setError(error?.response?.data?.message);
    }
  };

  const clearErrors = () => {
    setError(null);
  };

  return (
    <OrderContext.Provider
      value={{
        error,
        updated,
        secret,
        paymentTypes,
        addresses,
        shippingInfo,
        shippingStatus,
        deliveryPrice,
        lowStockProducts,
        setPaymentTypes,
        setAddresses,
        setShippinInfo,
        setShippingStatus,
        setDeliveryPrice,
        addOrder,
        setUpdated,
        clearErrors,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};

export default OrderContext;
