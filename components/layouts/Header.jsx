'use client';

import React, { useContext, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
const Search = dynamic(() => import('./Search'));
import Image from 'next/image';
import CartContext from '@/context/CartContext';
import { useSession } from 'next-auth/react';
import AuthContext from '@/context/AuthContext';

const Header = () => {
  const { user, setLoading, setUser } = useContext(AuthContext);
  const { setCartToState, cartCount } = useContext(CartContext);

  const { data } = useSession();

  useEffect(() => {
    if (data) {
      setUser(data?.user);
      setCartToState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <header className="bg-white py-2 border-b">
      <div className="container max-w-(--breakpoint-xl) mx-auto px-4">
        <div className="flex flex-wrap items-center">
          <div className="shrink-0 mr-5">
            <Link href="/">
              <Image
                priority={true}
                src="/images/logo.png"
                height={40}
                width={120}
                alt="BuyItNow"
              />
            </Link>
          </div>
          <Search setLoading={setLoading} />

          <div className="flex items-center space-x-2 ml-auto">
            {user && (
              <Link
                alt="shopping-cart link"
                data-testid="cart link"
                href="/cart"
                className="px-3 py-2 inline-block text-center text-gray-700 bg-white shadow-xs border border-gray-200 rounded-md hover:bg-blue-100 hover:border-gray-300"
              >
                <i
                  className="text-gray-400 w-5 fa fa-shopping-cart"
                  alt="shopping-cart icon"
                ></i>
                <span className="hidden lg:inline ml-1">
                  Cart (
                  <b>
                    {cartCount !== undefined &&
                    cartCount !== null &&
                    cartCount > 0
                      ? cartCount
                      : 0}
                  </b>
                  )
                </span>
              </Link>
            )}
            {!user ? (
              <Link
                data-testid="login"
                alt="login"
                href="/login"
                className="px-3 py-2 inline-block text-center text-gray-700 bg-white shadow-xs border border-gray-200 rounded-md hover:bg-blue-100 hover:border-gray-300"
              >
                <i className="text-gray-400 w-5 fa fa-user"></i>
                <span className="hidden lg:inline ml-1">Sign in</span>
              </Link>
            ) : (
              <Link href="/me">
                <div className="flex items-center mb-4 space-x-3 mt-4 px-1 cursor-pointer hover:bg-blue-100 hover:rounded-md">
                  <Image
                    data-testid="profile image"
                    alt="profile image"
                    className="rounded-full"
                    width={35}
                    height={25}
                    src={
                      user?.avatar ? user?.avatar?.url : '/images/default.png'
                    }
                  />
                  <div className="space-y-1 font-medium hidden md:block">
                    <p>
                      {user?.name}
                      <time className="block text-sm text-gray-500 dark:text-gray-400">
                        {user?.email}
                      </time>
                    </p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
