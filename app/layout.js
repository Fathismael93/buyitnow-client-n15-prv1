import dynamic from 'next/dynamic';

import { GlobalProvider } from './GlobalProvider';
import '@/app/globals.css';
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
