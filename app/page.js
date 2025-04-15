import { Suspense, lazy } from 'react';
import {
  getAllProducts,
  getCategories,
} from '@/backend/utils/server-only-methods';
import Loading from './loading';

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
  // Récupération des données avec un fallback en cas d'erreur
  const productsData = await getAllProducts(searchParams).catch(() => ({
    products: [],
    totalPages: 0,
  }));

  const categories = await getCategories().catch(() => ({
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
