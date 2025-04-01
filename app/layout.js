/* eslint-disable react/prop-types */
import React from 'react';
import dynamic from 'next/dynamic';

import { GlobalProvider } from './GlobalProvider';
dynamic(() => import('./globals.css'));
const Header = dynamic(() => import('@/components/layouts/Header'));
const Head = dynamic(() => import('@/app/head'));

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <GlobalProvider>
          <Header />
          {children}
        </GlobalProvider>
      </body>
      <Head />
    </html>
  );
}
