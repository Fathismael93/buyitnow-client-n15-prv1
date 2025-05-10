import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { captureException } from '@/monitoring/sentry';
import { getAllAddresses } from '@/backend/utils/server-only-methods';

// Chargement dynamique du composant Shipping avec fallback
const Shipping = dynamic(() => import('@/components/cart/Shipping'), {
  ssr: true,
});

// Métadonnées enrichies pour l'optimisation SEO
export const metadata = {
  title: "Sélection d'adresse de livraison | Buy It Now",
  description:
    'Choisissez votre adresse de livraison pour finaliser votre commande',
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Sélection d'adresse de livraison | Buy It Now",
    description:
      'Choisissez votre adresse de livraison pour finaliser votre commande',
    type: 'website',
  },
  alternates: {
    canonical: '/shipping',
  },
};

/**
 * Page de sélection d'adresse de livraison - Server Component
 * Vérifie l'authentification et charge les données nécessaires
 */
const ShippingPage = async () => {
  try {
    // Vérification de l'authentification côté serveur
    const cookieStore = cookies();
    const sessionCookie =
      cookieStore.get('next-auth.session-token') ||
      cookieStore.get('__Secure-next-auth.session-token');

    if (!sessionCookie) {
      // Rediriger vers la page de connexion avec retour après authentification
      return redirect('/login?callbackUrl=/shipping');
    }

    // Vérification du statut de livraison dans le cookie (optionnel)
    const shippingStatusCookie = cookieStore.get('shipping_status');
    if (shippingStatusCookie?.value === 'false') {
      // Si l'utilisateur a choisi de ne pas être livré, rediriger vers le paiement
      return redirect('/payment');
    }

    // Récupération des adresses avec gestion d'erreurs
    let addressesData = null;
    try {
      addressesData = await getAllAddresses('shipping');
    } catch (error) {
      console.error('Error fetching shipping addresses:', error);
      captureException(error, {
        tags: { component: 'ShippingPage', action: 'getAllAddresses' },
      });
      // Ne pas faire échouer le rendu en cas d'erreur, le composant client gérera cela
    }

    return (
      <div
        className="shipping-page"
        itemScope
        itemType="https://schema.org/WebPage"
      >
        <meta itemProp="name" content="Adresse de livraison" />
        <Suspense>
          <Shipping initialData={addressesData} />
        </Suspense>
      </div>
    );
  } catch (error) {
    // Capture et journalisation de l'erreur
    console.error('Error in shipping page:', error);
    captureException(error, {
      tags: { component: 'ShippingPage' },
    });

    // Redirection en cas d'erreur fatale
    redirect('/cart?error=shipping-error');
  }
};

export default ShippingPage;
