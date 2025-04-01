/* eslint-disable react/prop-types */
'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';

const CustomPagination = dynamic(
  () => import('@/components/layouts/CustomPagination'),
);

const Filters = dynamic(() => import('../layouts/Filters'), {
  loading: () => <Loading />,
});
const ProductItem = dynamic(() => import('./ProductItem'), {
  loading: () => <Loading />,
});

import { arrayHasData } from '@/helpers/helpers';
import { useContext, useEffect } from 'react';
import AuthContext from '@/context/AuthContext';

const ListProducts = ({ data }) => {
  const { loading, setLoading } = useContext(AuthContext);

  useEffect(() => {
    if (loading) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <section className="py-12">
      <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
        <div className="flex flex-col md:flex-row -mx-4">
          <Filters categories={data?.categories} setLoading={setLoading} />

          {loading ? (
            <div className="w-full justify-center items-center">
              <Loading />
            </div>
          ) : arrayHasData(data?.products) ? (
            <div className="w-full">
              <p className="font-bold text-xl text-center">
                No products found!
              </p>
            </div>
          ) : (
            <main className="md:w-2/3 lg:w-3/4 px-3">
              {data?.products?.map((product) => (
                <ProductItem key={product?._id} product={product} />
              ))}

              <CustomPagination totalPages={data?.totalPages} />
            </main>
          )}
        </div>
      </div>
    </section>
  );
};

export default ListProducts;
