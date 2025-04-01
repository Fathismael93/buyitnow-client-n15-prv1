/* eslint-disable react/prop-types */
'use client';

import dynamic from 'next/dynamic';
import CartContext from '@/context/CartContext';
import Link from 'next/link';
import React, { useContext, useEffect } from 'react';
const BreadCrumbs = dynamic(() => import('@/components/layouts/BreadCrumbs'));
import ItemShipping from './components/ItemShipping';
import OrderContext from '@/context/OrderContext';
import { useRouter } from 'next/navigation';
import { arrayHasData } from '@/helpers/helpers';
import { toast } from 'react-toastify';

const ShippingChoice = ({ addresses, payments, deliveryPrice }) => {
  const { cart, checkoutInfo, setOrderInfo } = useContext(CartContext);
  const { setAddresses, setPaymentTypes, setShippingStatus, setDeliveryPrice } =
    useContext(OrderContext);
  const router = useRouter();

  useEffect(() => {
    if (arrayHasData(payments)) {
      toast.error("We didn't find any payment method! Please try again later.");
      router.push('/cart');
    }

    if (arrayHasData(addresses)) {
      toast.error('You have to complete your profile and add an address');
      router.push('/me');
    }

    setAddresses(addresses);
    setPaymentTypes(payments);
    setDeliveryPrice(deliveryPrice[0]?.deliveryPrice);

    let orderItems = [];

    for (let index = 0; index < cart?.length; index++) {
      const element = cart[index];

      const itemPaymentInfo = {
        cartId: element?._id,
        product: element?.product?._id,
        name: element?.product?.name,
        category: element?.product?.category,
        quantity: element?.quantity,
        image:
          element?.product?.images[0]?.url ||
          'http://localhost:3000/images/default_product.png',
        price: Number(
          (element?.quantity * element?.product?.price)?.toFixed(2),
        ),
      };

      orderItems.push(itemPaymentInfo);
    }

    setOrderInfo({
      orderItems,
    });

    router.prefetch('/payment');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const breadCrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Cart', url: '/cart' },
    { name: 'Choice', url: '' },
  ];

  return (
    <div>
      <BreadCrumbs breadCrumbs={breadCrumbs} />
      <section className="py-10 bg-gray-50">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-4 lg:gap-8">
            <main className="md:w-2/3">
              <article className="border border-gray-200 bg-white shadow-xs rounded-sm p-4 lg:p-6 mb-5">
                <h2 className="text-xl text-center font-semibold mb-5">
                  Would you like delivery to your home ?
                </h2>

                <div className="flex justify-evenly space-x-2 mt-10">
                  <Link
                    href="/shipping"
                    onClick={() => setShippingStatus(true)}
                  >
                    <div className="p-10 border border-green-400 rounded-md hover:bg-blue-300 hover:border-blue-400">
                      <p className="text-xl font-bold">YES</p>
                    </div>
                  </Link>
                  <Link
                    href="/payment"
                    onClick={() => setShippingStatus(false)}
                  >
                    <div className="p-10 border border-red-400 rounded-md hover:bg-red-400">
                      <p className="text-xl font-bold">No</p>
                    </div>
                  </Link>
                </div>
              </article>
            </main>
            <aside className="md:w-1/3">
              <article className="text-gray-600" style={{ maxWidth: '350px' }}>
                <h2 className="text-lg font-semibold mb-3">Summary</h2>
                <ul>
                  <li className="border-t flex justify-between mt-3 pt-3">
                    <span>Total Amount:</span>
                    <span className="text-gray-900 font-bold">
                      $ {checkoutInfo?.amount}
                    </span>
                  </li>
                </ul>

                <hr className="my-4" />

                <h2 className="text-lg font-semibold mb-3">Items in cart</h2>

                {cart?.map((item) => (
                  <ItemShipping key={item._id} item={item} />
                ))}
              </article>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ShippingChoice;
