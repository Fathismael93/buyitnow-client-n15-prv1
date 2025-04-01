'use client';

import dynamic from 'next/dynamic';
import CartContext from '@/context/CartContext';
import Link from 'next/link';
import React, { useCallback, useContext, useEffect } from 'react';
import { toast } from 'react-toastify';
const BreadCrumbs = dynamic(() => import('@/components/layouts/BreadCrumbs'));
import { useRouter } from 'next/navigation';
import OrderContext from '@/context/OrderContext';
import { arrayHasData } from '@/helpers/helpers';
import ItemShipping from './components/ItemShipping';

const Shipping = () => {
  const { cart, checkoutInfo } = useContext(CartContext);
  const {
    addresses,
    paymentTypes,
    shippingInfo,
    deliveryPrice,
    setShippinInfo,
  } = useContext(OrderContext);
  const router = useRouter();

  useEffect(() => {
    if (arrayHasData(paymentTypes)) {
      toast.error("We didn't find any payment method! Please try again later.");
      router.push('/cart');
    }

    router.prefetch('/payment');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalAmount = Number(checkoutInfo?.amount) + deliveryPrice;

  const checkoutHandler = useCallback(() => {
    if (!shippingInfo) {
      return toast.error('Please select your shipping address');
    }

    router.push('/payment');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingInfo]);

  const setShippingAddress = (address) => {
    setShippinInfo(address?._id);
  };

  const breadCrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Choice', url: '/shipping-choice' },
    { name: 'Shipping', url: '' },
  ];

  return (
    <div>
      <BreadCrumbs breadCrumbs={breadCrumbs} />
      <section className="py-10 bg-gray-50">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-4 lg:gap-8">
            <main className="md:w-2/3">
              <article className="border border-gray-200 bg-white shadow-xs rounded-sm p-4 lg:p-6 mb-5">
                <h2 className="text-xl font-semibold mb-5">
                  Shipping information
                </h2>

                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  {arrayHasData(addresses) ? (
                    <div className="w-full">
                      <p className="font-bold text-xl text-center">
                        No Address found!
                      </p>
                    </div>
                  ) : (
                    addresses?.map((address) => (
                      <label
                        key={address._id}
                        className="flex p-3 border border-gray-200 rounded-md bg-gray-50 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                        onClick={() => setShippingAddress(address)}
                      >
                        <span>
                          <input
                            name="shipping"
                            type="radio"
                            className="h-4 w-4 mt-1"
                          />
                        </span>
                        <p className="ml-2">
                          <span>{address.street}</span>
                          <small className="block text-sm text-gray-400">
                            {address.city}, {address.state}, {address.zipCode}
                            <br />
                            {address.country}
                            <br />
                            {address.phoneNo}
                          </small>
                        </p>
                      </label>
                    ))
                  )}
                </div>

                <Link
                  href="/address/new"
                  className="px-4 py-2 inline-block text-blue-600 border border-gray-300 rounded-md hover:bg-gray-100"
                >
                  <i className="mr-1 fa fa-plus"></i> Add new address
                </Link>

                <div className="flex justify-end space-x-2 mt-10">
                  <Link
                    href="/cart"
                    className="px-5 py-2 inline-block text-gray-700 bg-white shadow-xs border border-gray-200 rounded-md hover:bg-gray-100 hover:text-blue-600"
                  >
                    Back
                  </Link>
                  <a
                    className="px-5 py-2 inline-block text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 cursor-pointer"
                    onClick={checkoutHandler}
                  >
                    Checkout
                  </a>
                </div>
              </article>
            </main>
            <aside className="md:w-1/3">
              <article className="text-gray-600" style={{ maxWidth: '350px' }}>
                <h2 className="text-lg font-semibold mb-3">Summary</h2>
                <ul>
                  <li className="flex justify-between mb-1">
                    <span>Amount:</span>
                    <span>$ {checkoutInfo?.amount}</span>
                  </li>
                  <li className="flex justify-between mb-1">
                    <span>Delivery Price:</span>
                    <span>$ {deliveryPrice}</span>
                  </li>
                  <li className="border-t flex justify-between mt-3 pt-3">
                    <span>Total Amount:</span>
                    <span className="text-gray-900 font-bold">
                      $ {totalAmount}
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

export default Shipping;
