import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { captureException } from '@/monitoring/sentry';

import { getAllAddresses } from '@/backend/utils/server-only-methods';

// Chargement dynamique du composant ShippingChoice avec fallback pour optimiser le chargement
const ShippingChoice = dynamic(
  () => import('@/components/cart/ShippingChoice'),
  {
    ssr: true,
  },
);

// Métadonnées enrichies pour le SEO
export const metadata = {
  title: 'Choisir votre mode de livraison | Buy It Now',
  description:
    'Choisissez si vous souhaitez une livraison à domicile ou un retrait en point relais',
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'Choisir votre mode de livraison | Buy It Now',
    description:
      'Choisissez si vous souhaitez une livraison à domicile ou un retrait en point relais',
    type: 'website',
  },
  alternates: {
    canonical: '/shipping-choice',
  },
};

/**
 * Page de choix de livraison - Server Component
 * Vérifie l'authentification et charge les données nécessaires pour le composant client
 */
const ShippingChoicePage = async () => {
  try {
    // Vérification de l'authentification côté serveur
    const cookieStore = cookies();
    const sessionCookie =
      cookieStore.get('next-auth.session-token') ||
      cookieStore.get('__Secure-next-auth.session-token');

    if (!sessionCookie) {
      // Rediriger vers la page de connexion avec retour après authentification
      return redirect('/login?callbackUrl=/shipping-choice');
    }

    // Récupération des données avec gestion d'erreur
    const data = await getAllAddresses('shipping').catch((error) => {
      console.error('Error fetching shipping data:', error);
      captureException(error, {
        tags: { component: 'ShippingChoicePage', action: 'getAllAddresses' },
      });
      return {
        addresses: [],
        paymentTypes: [],
        deliveryPrice: [{ deliveryPrice: 0 }],
      };
    });

    // Vérification des données reçues avec valeurs par défaut sécurisées
    const addresses = Array.isArray(data?.data?.addresses)
      ? data.data.addresses
      : [];
    const payments = Array.isArray(data?.data?.paymentTypes)
      ? data.data.paymentTypes
      : [];
    const deliveryPrice = Array.isArray(data?.data?.deliveryPrice)
      ? data.data.deliveryPrice
      : [{ deliveryPrice: 0 }];

    return (
      <div
        className="shipping-choice-page"
        itemScope
        itemType="https://schema.org/WebPage"
      >
        <meta itemProp="name" content="Choix de livraison" />
        <Suspense>
          <ShippingChoice
            addresses={addresses}
            payments={payments}
            deliveryPrice={deliveryPrice}
          />
        </Suspense>
      </div>
    );
  } catch (error) {
    // Capture et journalisation de l'erreur
    console.error('Error in shipping choice page:', error);
    captureException(error, {
      tags: { component: 'ShippingChoicePage' },
    });

    // Redirection en cas d'erreur fatale
    redirect('/cart?error=shipping-choice-error');
  }
};

export default ShippingChoicePage;
