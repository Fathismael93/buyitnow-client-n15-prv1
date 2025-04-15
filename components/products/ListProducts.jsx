'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Loading from '@/app/loading';
import { arrayHasData } from '@/helpers/helpers';

// Import dynamique des composants
const CustomPagination = dynamic(
  () => import('@/components/layouts/CustomPagination'),
  { ssr: true },
);

const Filters = dynamic(() => import('../layouts/Filters'), {
  loading: () => <Loading />,
  ssr: true,
});

const ProductItem = dynamic(() => import('./ProductItem'), {
  loading: () => <ProductItemSkeleton />,
  ssr: true,
});

// Composant squelette pour le chargement des produits
const ProductItemSkeleton = () => (
  <div className="border border-gray-200 overflow-hidden bg-white rounded-md mb-5 animate-pulse">
    <div className="flex flex-col md:flex-row">
      <div className="md:w-1/4 p-3">
        <div className="bg-gray-200 h-40 w-full rounded"></div>
      </div>
      <div className="md:w-2/4 p-4">
        <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
      <div className="md:w-1/4 p-5 border-t md:border-t-0 md:border-l border-gray-200">
        <div className="h-6 bg-gray-200 rounded w-1/2 mb-3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-10 bg-gray-200 rounded w-2/3"></div>
      </div>
    </div>
  </div>
);

const ListProducts = ({ data, categories }) => {
  // Remplacer par un état local quand possible
  const [localLoading, setLocalLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Récupérer les paramètres de recherche pour les afficher
  const keyword = searchParams?.get('keyword');
  const category = searchParams?.get('category');
  const minPrice = searchParams?.get('min');
  const maxPrice = searchParams?.get('max');
  const page = searchParams?.get('page');

  // Construire un message récapitulatif des filtres appliqués
  const getFilterSummary = () => {
    let summary = [];

    if (keyword) summary.push(`Recherche: "${keyword}"`);
    if (category) {
      const categoryName = categories?.find(
        (c) => c._id === category,
      )?.categoryName;
      if (categoryName) summary.push(`Catégorie: ${categoryName}`);
    }
    if (minPrice && maxPrice) summary.push(`Prix: ${minPrice}€ - ${maxPrice}€`);
    else if (minPrice) summary.push(`Prix min: ${minPrice}€`);
    else if (maxPrice) summary.push(`Prix max: ${maxPrice}€`);

    summary.push(`Page: ${page ? page : 1}`);

    return summary.length > 0 ? summary.join(' | ') : null;
  };

  // Utiliser useMemo pour éviter les recalculs inutiles
  const filterSummary = useMemo(
    () => getFilterSummary(),
    [keyword, category, minPrice, maxPrice, categories],
  );

  useEffect(() => {
    // Seulement pour l'initial render, pas pour les changements de filtres
    if (isInitialLoad) {
      setIsInitialLoad(false);
    }

    if (localLoading) {
      setLocalLoading(false);
    }
  }, [data]);

  return (
    <section className="py-8">
      <div className="container max-w-[1440px] mx-auto px-4">
        <div className="flex flex-col md:flex-row -mx-4">
          <Filters categories={categories} setLocalLoading={setLocalLoading} />

          <main className="md:w-2/3 lg:w-3/4 px-3">
            {/* Affichage du récapitulatif des filtres et du nombre de résultats */}
            {filterSummary && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 border border-blue-100">
                <p className="font-medium">{filterSummary}</p>
              </div>
            )}

            <div className="mb-4 flex justify-between items-center">
              <h1 className="text-xl font-bold text-gray-800">
                {data?.products?.length > 0
                  ? `${data.products.length} produit${data.products.length > 1 ? 's' : ''} trouvé${data.products.length > 1 ? 's' : ''}`
                  : 'Produits'}
              </h1>
            </div>

            {localLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, index) => (
                  <ProductItemSkeleton key={index} />
                ))}
              </div>
            ) : arrayHasData(data?.products) ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-4 text-5xl text-gray-300">
                  <i className="fa fa-search"></i>
                </div>
                <h2 className="text-xl font-semibold text-gray-800 mb-2">
                  Aucun produit trouvé
                </h2>
                <p className="text-gray-600 max-w-md">
                  {keyword
                    ? `Aucun résultat pour "${keyword}". Essayez d'autres termes de recherche.`
                    : 'Aucun produit ne correspond aux filtres sélectionnés. Essayez de modifier vos critères.'}
                </p>
                <button
                  onClick={() => {
                    setLocalLoading(true);
                    router.push('/');
                  }}
                  className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Voir tous les produits
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {data?.products?.map((product) => (
                    <ProductItem key={product?._id} product={product} />
                  ))}
                </div>

                {data?.totalPages > 1 && (
                  <div className="mt-8">
                    <CustomPagination totalPages={data?.totalPages} />
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </section>
  );
};

export default ListProducts;
