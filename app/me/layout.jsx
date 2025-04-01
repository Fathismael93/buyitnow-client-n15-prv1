'use client';

import AuthContext from '@/context/AuthContext';
import dynamic from 'next/dynamic';
import React, { useContext, useState } from 'react';

const Sidebar = dynamic(() => import('@/components/layouts/Sidebar'));

// eslint-disable-next-line react/prop-types
export default function UserLayout({ children }) {
  const { user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="flex flex-row py-3 sm:py-7 bg-blue-100">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <h2 className="font-medium text-2xl">{user?.name?.toUpperCase()}</h2>
        </div>
        <div className="md:hidden mx-4">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="p-3 inline-flex items-center rounded-md text-black hover:bg-gray-200 hover:text-gray-800"
          >
            <span className="sr-only">Open menu</span>
            <i className="fa fa-bars fa-lg"></i>
          </button>
        </div>
      </section>
      <section className="py-10">
        <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
          <div className="flex flex-col md:flex-row -mx-4">
            <Sidebar open={open} setOpen={setOpen} />
            <main className="md:w-2/3 lg:w-3/4 px-4">
              <article className="border border-gray-200 bg-white shadow-xs rounded-sm mb-5 p-3 lg:p-5">
                {children}
              </article>
            </main>
          </div>
        </div>
      </section>
    </>
  );
}
