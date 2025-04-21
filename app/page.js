import { Suspense, lazy } from 'react';
import {
  getAllProducts,
  getCategories,
} from '@/backend/utils/server-only-methods';
import Loading from './loading';
import { headers } from 'next/headers';

// Utilisation de lazy au lieu de dynamic pour éviter le conflit de nom
const ListProducts = lazy(() => import('@/components/products/ListProducts'));

export const metadata = {
  title: 'Buy It Now - Votre boutique en ligne',
  description:
    'Découvrez notre sélection de produits de qualité à des prix attractifs',
  openGraph: {
    title: 'Buy It Now - Votre boutique en ligne',
    description:
      'Découvrez notre sélection de produits de qualité à des prix attractifs',
    type: 'website',
  },
};

export const revalidate = 3600; // Revalidation toutes les 60 secondes

// eslint-disable-next-line react/prop-types
const HomePage = async ({ searchParams }) => {
  // Récupérer les en-têtes pour le monitoring et la sécurité
  const headersList = headers();
  // Récupérer le token CSRF à partir du middleware
  const csrfToken = headersList.get('X-CSRF-Token') || 'missing';
  // Récupération des données avec un fallback en cas d'erreur
  const productsData = await getAllProducts(searchParams, csrfToken).catch(
    () => ({
      products: [],
      totalPages: 0,
    }),
  );

  const categories = await getCategories(csrfToken).catch(() => ({
    categories: [],
  }));

  return (
    <Suspense fallback={<Loading />}>
      <main>
        <ListProducts data={productsData?.data} categories={categories} />
      </main>
    </Suspense>
  );
};

export default HomePage;
