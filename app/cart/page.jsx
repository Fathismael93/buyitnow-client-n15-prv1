import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { captureException } from '@/monitoring/sentry';
import CartSkeleton from '@/components/skeletons/CartSkeleton';

// Import dynamique du composant Cart avec fallback spécifique
const Cart = dynamic(() => import('@/components/cart/Cart'), {
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

const CartPage = async () => {
  try {
    const cookie = await cookies();
    // Vérification de l'authentification côté serveur
    const sessionCookie =
      cookie.get('next-auth.session-token') ||
      cookie.get('__Secure-next-auth.session-token');

    if (!sessionCookie) {
      // Rediriger vers la page de connexion avec le retour à la page du panier
      redirect('/login?callbackUrl=/cart');
    }

    return (
      <div itemScope itemType="https://schema.org/ItemList">
        <meta itemProp="name" content="Shopping Cart" />
        <Suspense fallback={<CartSkeleton />}>
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
