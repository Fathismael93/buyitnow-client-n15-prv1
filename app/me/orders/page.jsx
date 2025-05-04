import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { captureException } from '@/monitoring/sentry';

import { getAllOrders } from '@/backend/utils/server-only-methods';
import logger from '@/utils/logger';
import { getCookieName } from '@/helpers/helpers';

// Chargement dynamique avec fallback
const ListOrders = dynamic(() => import('@/components/orders/ListOrders'), {
  loading: () => <OrdersPageSkeleton />,
  ssr: true, // Activer le SSR pour améliorer la première charge
});

// Composant de chargement dédié pour une meilleure expérience utilisateur
const OrdersPageSkeleton = () => (
  <div className="animate-pulse p-4">
    <div className="h-7 bg-gray-200 rounded w-48 mb-6"></div>
    {[...Array(3)].map((_, i) => (
      <div key={i} className="mb-6">
        <div className="h-64 bg-gray-200 rounded-md mb-3"></div>
      </div>
    ))}
  </div>
);

// Métadonnées enrichies pour SEO
export const metadata = {
  title: 'Historique de commandes | Buy It Now',
  description: "Consultez l'historique de vos commandes sur Buy It Now",
  robots: {
    index: false, // Page privée, ne pas indexer
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: '/me/orders',
  },
};

/**
 * Récupère et affiche l'historique des commandes d'un utilisateur
 * Server Component avec traitement d'erreurs et vérification d'authentification
 */
const MyOrdersPage = async ({ searchParams }) => {
  // Identifiant unique pour la traçabilité
  const requestId = `orderspage-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  logger.info('Orders page accessed', {
    requestId,
    page: searchParams?.page || 1,
    action: 'orders_page_access',
  });

  try {
    // Vérification de l'authentification côté serveur
    const nextCookies = cookies();
    const cookieName = getCookieName();
    const sessionCookie = nextCookies.get(cookieName);

    // Rediriger si non authentifié
    if (!sessionCookie) {
      logger.warn('Unauthenticated access to orders page', {
        requestId,
        action: 'unauthenticated_access',
      });
      return redirect('/login?callbackUrl=/me/orders');
    }

    // Récupérer les commandes avec gestion d'erreurs
    const sanitizedSearchParams = {
      page: searchParams?.page || 1,
      // Autres paramètres de filtrage potentiels
    };

    // Utiliser Suspense pour mieux gérer le chargement
    const ordersPromise = getAllOrders(sanitizedSearchParams);

    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">Mes commandes</h1>
        <Suspense fallback={<OrdersPageSkeleton />}>
          <OrdersData ordersPromise={ordersPromise} />
        </Suspense>
      </div>
    );
  } catch (error) {
    // Capture et journalisation de l'erreur
    logger.error('Error loading orders page', {
      requestId,
      error: error.message,
      stack: error.stack,
      action: 'orders_page_error',
    });

    captureException(error, {
      tags: { component: 'MyOrdersPage', action: 'page_load' },
      extra: { requestId, searchParams },
    });

    // Afficher un message d'erreur convivial
    return (
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <h2 className="text-lg font-semibold text-red-700 mb-2">
            Impossible de charger vos commandes
          </h2>
          <p className="text-red-600">
            Nous rencontrons actuellement des difficultés pour récupérer votre
            historique de commandes. Veuillez réessayer ultérieurement ou
            contacter notre service client.
          </p>
        </div>
      </div>
    );
  }
};

// Composant pour gérer le chargement async des données
const OrdersData = async ({ ordersPromise }) => {
  try {
    const orders = await ordersPromise;
    return <ListOrders orders={orders} />;
  } catch (error) {
    captureException(error, {
      tags: { component: 'OrdersData', action: 'data_fetch' },
    });

    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-600">
          Une erreur est survenue lors du chargement de vos commandes. Veuillez
          réessayer.
        </p>
      </div>
    );
  }
};

export default MyOrdersPage;
