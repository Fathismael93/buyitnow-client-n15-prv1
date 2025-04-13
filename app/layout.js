import dynamic from 'next/dynamic';

import { GlobalProvider } from './GlobalProvider';
import '@/app/globals.css';
const Header = dynamic(() => import('@/components/layouts/Header'));
const Head = dynamic(() => import('@/app/head'));

// Métadonnées globales pour le site
export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      'https://buyitnow-client-n15-prv1.vercel.app',
  ),
  title: {
    default: 'Buy It Now',
    template: '%s | Buy It Now',
  },
  description:
    'Boutique en ligne simplifiée (BS), Buy It Now est la solution pour acheter et vendre facilement sur Internet.',
  keywords: [
    'e-commerce',
    'shopping',
    'online store',
    'products',
    'Buy It Now',
    'BS',
    'boutique en ligne',
    "solution d'achat",
  ],
  referrer: 'origin-when-cross-origin',
  authors: [{ name: 'Benew Team' }],
  creator: 'Benew Team',
  publisher: 'Benew',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
    noimageindex: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-image-preview': 'large',
      'max-video-preview': -1,
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url:
      process.env.NEXT_PUBLIC_SITE_URL ||
      'https://buyitnow-client-n15-prv1.vercel.app',
    title: 'Buy It Now',
    description:
      'Boutique en ligne simplifiée (BS), Buy It Now est la solution pour acheter et vendre facilement sur Internet.',
    siteName: 'BS - Buy It Now',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Buy It Now',
    description: 'Boutique en ligne simplifiée (BS), Buy It Now',
    creator: '@benew',
    site: '@benew',
  },
  manifest: '/manifest.json',
};

// app/layout.js - ajouter cet export
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1f2937' },
  ],
};

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
