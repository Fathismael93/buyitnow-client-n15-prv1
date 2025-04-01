'use client';

import React, { useContext, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { toast } from 'react-toastify';

import CartContext from '@/context/CartContext';
import OrderContext from '@/context/OrderContext';
const BreadCrumbs = dynamic(() => import('@/components/layouts/BreadCrumbs'));
import { paymentSchema } from '@/helpers/schemas';
import { arrayHasData } from '@/helpers/helpers';
import { useRouter } from 'next/navigation';

const Payment = () => {
  const { checkoutInfo, orderInfo, setOrderInfo } = useContext(CartContext);
  const {
    addOrder,
    paymentTypes,
    shippingInfo,
    deliveryPrice,
    shippingStatus,
  } = useContext(OrderContext);

  const [paymentType, setPaymentType] = useState(null);
  const [accountName, setAccountName] = useState(null);
  const [accountNumber, setAccountNumber] = useState(null);

  const router = useRouter();

  useEffect(() => {
    router.prefetch('/confirmation');

    setOrderInfo({
      ...orderInfo,
      shippingInfo,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const breadCrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Cart', url: '/cart' },
    { name: 'Payment', url: '' },
  ];

  const handlePayment = async () => {
    try {
      const result = await paymentSchema.validate({
        paymentType,
        accountName,
        accountNumber,
      });

      if (result) {
        orderInfo.paymentInfo = {
          amountPaid: shippingStatus
            ? Number(checkoutInfo.amount) + deliveryPrice
            : Number(checkoutInfo.amount),
          typePayment: paymentType,
          paymentAccountNumber: accountNumber,
          paymentAccountName: accountName,
        };

        if (!shippingStatus) {
          delete orderInfo.shippingInfo;
        }

        addOrder(orderInfo);
      }
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <div>
      <BreadCrumbs breadCrumbs={breadCrumbs} />
      <section className="py-10 bg-gray-50">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-4 lg:gap-8">
            <main className="md:w-2/3">
              <article className="border border-gray-200 bg-white shadow-xs rounded-sm p-4 lg:p-6 mb-5">
                <h2 className="text-xl font-semibold mb-5">
                  Payment information
                </h2>

                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  {arrayHasData(paymentTypes) ? (
                    <div className="w-full">
                      <p className="font-bold text-xl text-center">
                        No Payment found!
                      </p>
                    </div>
                  ) : (
                    paymentTypes?.map((payment) => (
                      <label
                        key={payment?._id}
                        className="flex p-3 border border-gray-200 rounded-md bg-gray-50 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                      >
                        <span>
                          <input
                            name="payment"
                            type="radio"
                            className="h-4 w-4 mt-1"
                            value={payment?.paymentName}
                            onClick={(e) => setPaymentType(e.target.value)}
                          />
                        </span>
                        <p className="ml-2">
                          <span>{payment?.paymentName}</span>
                        </p>
                      </label>
                    ))
                  )}
                </div>
              </article>
            </main>
            <aside className="md:w-1/3">
              <article className="text-gray-600" style={{ maxWidth: '350px' }}>
                <div className="mb-4">
                  <label className="block mb-1"> Account Name </label>
                  <input
                    className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
                    type="text"
                    placeholder="Account Name"
                    required
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                </div>
                <div className="mb-4">
                  <label className="block mb-1"> Account Number </label>
                  <input
                    className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-hidden focus:border-gray-400 w-full"
                    type="tel"
                    placeholder="Account Number"
                    required
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                </div>
              </article>

              <div className="flex justify-end space-x-2 mt-10">
                <Link
                  href="/shipping"
                  className="px-5 py-2 inline-block text-gray-700 bg-white shadow-xs border border-gray-200 rounded-md hover:bg-gray-100 hover:text-blue-600"
                >
                  Back
                </Link>
                <a
                  onClick={handlePayment}
                  className="px-5 py-2 inline-block text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 cursor-pointer"
                >
                  Payer
                </a>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Payment;
