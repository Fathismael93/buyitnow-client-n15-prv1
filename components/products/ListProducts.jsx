'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { arrayHasData } from '@/helpers/helpers';
import { captureException } from '@/monitoring/sentry';

// Import dynamique des composants
const CustomPagination = dynamic(
  () => import('@/components/layouts/CustomPagination'),
  { ssr: true },
);

const Filters = dynamic(() => import('../layouts/Filters'), {
  ssr: true,
});

const ProductItem = dynamic(() => import('./ProductItem'), {
  loading: () => <ProductItemSkeleton />,
  ssr: true,
});

// Composant squelette pour le chargement des produits
const ProductItemSkeleton = () => (
  <div
    className="border border-gray-200 overflow-hidden bg-white rounded-md mb-5 animate-pulse"
    aria-hidden="true"
  >
    <div className="flex flex-col md:flex-row">
      {/* Contenu existant du skeleton */}
    </div>
  </div>
);

const ListProducts = ({ data, categories }) => {
  // États locaux
  const [localLoading, setLocalLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Récupérer les paramètres de recherche pour les afficher
  const keyword = searchParams?.get('keyword');
  const category = searchParams?.get('category');
  const minPrice = searchParams?.get('min');
  const maxPrice = searchParams?.get('max');
  const page = searchParams?.get('page');

  // Construire un message récapitulatif des filtres appliqués
  const getFilterSummary = useCallback(() => {
    try {
      let summary = [];

      if (keyword) summary.push(`Recherche: "${keyword}"`);
      if (category) {
        const categoryName = categories?.find(
          (c) => c._id === category,
        )?.categoryName;
        if (categoryName) summary.push(`Catégorie: ${categoryName}`);
      }
      if (minPrice && maxPrice)
        summary.push(`Prix: ${minPrice}€ - ${maxPrice}€`);
      else if (minPrice) summary.push(`Prix min: ${minPrice}€`);
      else if (maxPrice) summary.push(`Prix max: ${maxPrice}€`);

      if (page) summary.push(`Page: ${page || 1}`);

      return summary.length > 0 ? summary.join(' | ') : null;
    } catch (err) {
      captureException(err, {
        tags: { component: 'ListProducts', function: 'getFilterSummary' },
      });
      return null;
    }
  }, [keyword, category, minPrice, maxPrice, page, categories]);

  // Utiliser useMemo pour éviter les recalculs inutiles
  const filterSummary = useMemo(() => getFilterSummary(), [getFilterSummary]);

  // Vérifier la validité des données pour éviter les erreurs
  const hasValidData = data && typeof data === 'object';
  const hasValidCategories = categories && Array.isArray(categories);

  // Handler pour réinitialiser les filtres
  const handleResetFilters = useCallback(() => {
    try {
      setLocalLoading(true);
      router.push('/');
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [router]);

  // Toggle pour afficher/masquer les filtres
  const toggleFilters = useCallback(() => {
    setShowFilters((prev) => !prev);
  }, []);

  useEffect(() => {
    // Seulement pour l'initial render, pas pour les changements de filtres
    if (isInitialLoad) {
      setIsInitialLoad(false);
    }

    if (localLoading) {
      setLocalLoading(false);
    }
  }, [data, isInitialLoad, localLoading]);

  // Afficher un avertissement si les données ne sont pas valides
  if (!hasValidData) {
    return (
      <div
        className="p-4 bg-yellow-50 border border-yellow-200 rounded-md my-4"
        role="alert"
      >
        <p className="font-medium text-yellow-700">
          Les données des produits ne sont pas disponibles pour le moment.
        </p>
      </div>
    );
  }

  return (
    <section className="py-8">
      <div className="container max-w-[1440px] mx-auto px-4">
        {/* Nouvelle barre d'en-tête avec titre et actions */}
        <div className="flex flex-wrap justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            {data?.products?.length > 0
              ? `${data.products.length} produit${data.products.length > 1 ? 's' : ''} trouvé${data.products.length > 1 ? 's' : ''}`
              : 'Produits'}
          </h1>

          <div className="flex items-center space-x-3 mt-2 md:mt-0">
            <button
              onClick={toggleFilters}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md flex items-center transition-colors"
              aria-expanded={showFilters}
              aria-controls="filters-panel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              {showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
            </button>

            {filterSummary && (
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors"
                aria-label="Réinitialiser tous les filtres"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* Affichage du récapitulatif des filtres quand ils sont appliqués */}
        {filterSummary && (
          <div
            className="mb-6 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 border border-blue-100"
            aria-live="polite"
            aria-label="Filtres appliqués"
          >
            <p className="font-medium">{filterSummary}</p>
          </div>
        )}

        {/* Panneau de filtres (collapsible) */}
        {hasValidCategories && (
          <div
            id="filters-panel"
            className={`transition-all duration-300 overflow-hidden mb-6 ${showFilters ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}
            aria-hidden={!showFilters}
          >
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <Filters
                categories={categories}
                setLocalLoading={setLocalLoading}
              />
            </div>
          </div>
        )}

        {/* Grille de produits */}
        <main aria-label="Liste des produits">
          {localLoading ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              aria-busy="true"
              aria-label="Chargement des produits"
            >
              {[...Array(6)].map((_, index) => (
                <ProductItemSkeleton key={index} />
              ))}
            </div>
          ) : !arrayHasData(data?.products) ? (
            <div
              className="flex flex-col items-center justify-center py-10 text-center"
              aria-live="assertive"
              role="status"
            >
              <div className="mb-4 text-5xl text-gray-300">
                <i className="fa fa-search" aria-hidden="true"></i>
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
                onClick={handleResetFilters}
                className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                aria-label="Voir tous les produits disponibles"
              >
                Voir tous les produits
              </button>
            </div>
          ) : (
            <>
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                aria-busy={false}
                aria-label="Liste des produits chargés"
              >
                {data?.products?.map((product) => (
                  <Suspense
                    key={product?._id || `product-${Math.random()}`}
                    fallback={<ProductItemSkeleton />}
                  >
                    <ProductItem product={product} />
                  </Suspense>
                ))}
              </div>

              {/* Pagination centrée */}
              {data?.totalPages > 1 && (
                <div className="mt-12 flex justify-center">
                  <CustomPagination totalPages={data?.totalPages} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
};

export default ListProducts;
