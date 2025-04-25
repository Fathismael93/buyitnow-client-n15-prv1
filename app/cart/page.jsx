import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { captureException } from '@/monitoring/sentry';
import Loading from '../loading';

// Import dynamique du composant Cart avec fallback spécifique
const Cart = dynamic(() => import('@/components/cart/Cart'), {
  loading: () => <Loading />,
  ssr: true,
});

// Métadonnées enrichies pour le panier
export const metadata = {
  title: 'Votre Panier | Buy It Now',
  description:
    'Consultez et gérez les articles de votre panier sur Buy It Now.',
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'Votre Panier | Buy It Now',
    description:
      'Consultez et gérez les articles de votre panier sur Buy It Now.',
    type: 'website',
  },
  alternates: {
    canonical: '/cart',
  },
};

// Composant d'erreur spécifique pour le panier
// const CartErrorComponent = ({ error }) => {
//   // Capture l'erreur dans Sentry
//   React.useEffect(() => {
//     captureException(error, {
//       tags: {
//         component: 'CartPage',
//         errorType: error.name,
//       },
//       extra: {
//         message: error.message,
//         statusCode: error.statusCode || 500,
//       },
//     });
//   }, [error]);

//   return (
//     <div className="container mx-auto p-4 text-center">
//       <h1 className="text-2xl font-bold text-red-600 mb-4">
//         Une erreur est survenue
//       </h1>
//       <p className="mb-4">Impossible de charger votre panier.</p>
//       <button
//         onClick={() => window.location.reload()}
//         className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
//       >
//         Réessayer
//       </button>
//     </div>
//   );
// };

const CartPage = async () => {
  try {
    // Vérification de l'authentification côté serveur
    const sessionCookie =
      cookies().get('next-auth.session-token') ||
      cookies().get('__Secure-next-auth.session-token');

    if (!sessionCookie) {
      // Rediriger vers la page de connexion avec le retour à la page du panier
      redirect('/login?callbackUrl=/cart');
    }

    return (
      <div itemScope itemType="https://schema.org/ItemList">
        <meta itemProp="name" content="Shopping Cart" />
        <Suspense>
          <Cart />
        </Suspense>
      </div>
    );
  } catch (error) {
    console.error('Error accessing cart page:', error);

    // Capturer l'erreur dans Sentry
    captureException(error, {
      tags: {
        component: 'CartPage',
        errorType: error.name,
      },
    });

    // Rediriger vers la page d'accueil en cas d'erreur
    redirect('/');
  }
};

export default CartPage;
