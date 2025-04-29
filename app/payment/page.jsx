import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { captureException } from '@/monitoring/sentry';

import Loading from '@/app/loading';

// Chargement dynamique du composant Payment avec fallback
const Payment = dynamic(() => import('@/components/cart/Payment'), {
  loading: () => <Loading />,
  ssr: true,
});

// Métadonnées enrichies pour le SEO
export const metadata = {
  title: 'Paiement de votre commande | Buy It Now',
  description:
    'Finalisez votre commande en choisissant votre méthode de paiement préférée',
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'Paiement de votre commande | Buy It Now',
    description:
      'Finalisez votre commande en choisissant votre méthode de paiement préférée',
    type: 'website',
  },
  alternates: {
    canonical: '/payment',
  },
};

/**
 * Page de paiement - Server Component
 * Vérifie l'authentification et charge le composant de paiement
 */
const PaymentPage = async () => {
  try {
    // Vérification de l'authentification côté serveur
    const cookieStore = cookies();
    const sessionCookie =
      cookieStore.get('next-auth.session-token') ||
      cookieStore.get('__Secure-next-auth.session-token');

    if (!sessionCookie) {
      // Rediriger vers la page de connexion avec retour après authentification
      return redirect('/login?callbackUrl=/payment');
    }

    // Vérifier si l'utilisateur a un panier actif (optionnel, via cookie)
    const cartCookie = cookieStore.get('buyitnow_cart');
    if (!cartCookie || cartCookie.value === '{}') {
      // Si l'utilisateur n'a pas de panier actif, rediriger vers la page principale
      return redirect('/?error=empty-cart');
    }

    return (
      <div
        className="payment-page"
        itemScope
        itemType="https://schema.org/WebPage"
      >
        <meta itemProp="name" content="Paiement" />
        <Suspense fallback={<Loading />}>
          <Payment />
        </Suspense>
      </div>
    );
  } catch (error) {
    // Capture et journalisation de l'erreur
    console.error('Error in payment page:', error);
    captureException(error, {
      tags: { component: 'PaymentPage' },
    });

    // Redirection en cas d'erreur fatale
    redirect('/cart?error=payment-error');
  }
};

export default PaymentPage;
