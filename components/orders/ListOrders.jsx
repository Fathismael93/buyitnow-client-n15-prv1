/* eslint-disable react/prop-types */
'use client';

import { arrayHasData } from '@/helpers/helpers';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

import React, { useContext, useEffect } from 'react';
import OrderContext from '@/context/OrderContext';

const OrderItem = dynamic(() => import('@/components/orders/OrderItem'), {
  loading: () => <Loading />,
});

const CustomPagination = dynamic(
  () => import('@/components/layouts/CustomPagination'),
);

const ListOrders = ({ orders }) => {
  const { setDeliveryPrice } = useContext(OrderContext);

  useEffect(() => {
    setDeliveryPrice(orders?.deliveryPrice[0]?.deliveryPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <h3 className="text-xl font-semibold mb-5">Your Latest Orders</h3>
      {arrayHasData(orders?.orders) ? (
        <p className="font-bold text-md">
          No Orders! You did not purchase anything
        </p>
      ) : (
        <>
          {orders?.orders?.map((order) => (
            <OrderItem key={order._id} order={order} />
          ))}

          <CustomPagination totalPages={orders?.totalPages} />
        </>
      )}
    </>
  );
};

export default ListOrders;
