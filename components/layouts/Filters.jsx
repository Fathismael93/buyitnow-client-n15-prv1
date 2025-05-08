'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';

import { arrayHasData, getPriceQueryParams } from '@/helpers/helpers';
import { maxPriceSchema, minPriceSchema } from '@/helpers/schemas';

const Filters = ({ categories, setLocalLoading }) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // État local synchronisé avec les paramètres d'URL
  const [min, setMin] = useState(() => searchParams?.get('min') || '');
  const [max, setMax] = useState(() => searchParams?.get('max') || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeCategoryPanel, setActiveCategoryPanel] = useState(false);

  // Mémoiser la valeur de catégorie actuelle
  const currentCategory = useMemo(
    () => searchParams?.get('category') || '',
    [searchParams],
  );

  // Synchroniser les états avec les paramètres d'URL
  useEffect(() => {
    setMin(searchParams?.get('min') || '');
    setMax(searchParams?.get('max') || '');
  }, [searchParams]);

  // Validation des prix mémorisée
  const validatePrices = useCallback(async () => {
    if (min === '' && max === '') {
      throw new Error(
        'Veuillez renseigner au moins un des deux champs de prix',
      );
    }

    if (min !== '' && max !== '') {
      // Conversion sécurisée en nombres
      const minNum = Number(min);
      const maxNum = Number(max);

      if (isNaN(minNum) || isNaN(maxNum)) {
        throw new Error('Les valeurs de prix doivent être des nombres valides');
      }

      if (minNum > maxNum) {
        throw new Error('Le prix minimum doit être inférieur au prix maximum');
      }
    }

    // Validation avec les schémas Yup
    if (min !== '') {
      await minPriceSchema.validate({ minPrice: min }, { abortEarly: false });
    }

    if (max !== '') {
      await maxPriceSchema.validate({ maxPrice: max }, { abortEarly: false });
    }
  }, [min, max]);

  // Gestionnaire de clic sur catégorie
  const handleCategoryClick = useCallback(
    (categoryId) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      setLocalLoading(true);

      try {
        // Création d'une nouvelle instance de URLSearchParams
        const params = new URLSearchParams(searchParams?.toString() || '');

        // Logique de basculement: si la catégorie est déjà sélectionnée, la désélectionner
        if (params.get('category') === categoryId) {
          params.delete('category');
        } else {
          params.set('category', categoryId);
        }

        // Navigation vers la nouvelle URL
        const path = `/?${params.toString()}`;
        setActiveCategoryPanel(false);
        setIsSubmitting(false);
        setLocalLoading(false);
        router.push(path);
      } catch (error) {
        console.error('Erreur lors de la sélection de catégorie:', error);
        toast.error('Une erreur est survenue lors du filtrage par catégorie');
        setLocalLoading(false);
        setIsSubmitting(false);
      }
    },
    [router, searchParams, isSubmitting, setLocalLoading],
  );

  // Gestionnaire pour appliquer les filtres de prix
  const handlePriceFilter = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setLocalLoading(true);

    try {
      // Validation des prix
      await validatePrices();

      // Création des paramètres d'URL
      let params = new URLSearchParams(searchParams?.toString() || '');

      // Par celles-ci:
      params = getPriceQueryParams(params, 'min', min);
      params = getPriceQueryParams(params, 'max', max);

      // Navigation
      const path = `/?${params.toString()}`;
      setIsSubmitting(false);
      setLocalLoading(false);
      router.push(path);
    } catch (error) {
      toast.error(
        error.message || 'Une erreur est survenue avec les filtres de prix',
      );
      setLocalLoading(false);
      setIsSubmitting(false);
    }
  }, [
    min,
    max,
    validatePrices,
    router,
    searchParams,
    isSubmitting,
    setLocalLoading,
  ]);

  // Réinitialiser les filtres
  const resetFilters = useCallback(() => {
    setIsSubmitting(true);
    setLocalLoading(true);
    setMin('');
    setMax('');
    router.push('/');
    setActiveCategoryPanel(false);
  }, [router, setLocalLoading]);

  // Vérifier si des filtres sont actifs
  const hasActiveFilters = useMemo(() => {
    return min || max || currentCategory;
  }, [min, max, currentCategory]);

  // Obtenir le nom de la catégorie sélectionnée
  const selectedCategoryName = useMemo(() => {
    if (!currentCategory) return null;
    return (
      categories?.find((c) => c._id === currentCategory)?.categoryName ||
      'Catégorie'
    );
  }, [currentCategory, categories]);

  return (
    <div className="w-full">
      {/* Layout horizontal pour desktop */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Section Prix */}
        <div className="bg-white rounded-lg p-4 border border-gray-200 flex-grow md:flex-grow-0">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Prix (€)</h3>
          <div className="flex items-end gap-2">
            <div>
              <label
                htmlFor="min-price"
                className="text-xs text-gray-500 mb-1 block"
              >
                Min
              </label>
              <input
                id="min-price"
                name="min"
                className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-none focus:border-blue-500 w-24"
                type="number"
                min="0"
                placeholder="Min"
                value={min}
                onChange={(e) => setMin(e.target.value)}
                aria-label="Prix minimum"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label
                htmlFor="max-price"
                className="text-xs text-gray-500 mb-1 block"
              >
                Max
              </label>
              <input
                id="max-price"
                name="max"
                className="appearance-none border border-gray-200 bg-gray-100 rounded-md py-2 px-3 hover:border-gray-400 focus:outline-none focus:border-blue-500 w-24"
                type="number"
                min="0"
                placeholder="Max"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                aria-label="Prix maximum"
                disabled={isSubmitting}
              />
            </div>

            <button
              className={`py-2 px-4 ${
                isSubmitting
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white cursor-pointer rounded-md transition-colors whitespace-nowrap`}
              onClick={handlePriceFilter}
              aria-label="Appliquer les filtres de prix"
              disabled={isSubmitting}
            >
              Appliquer
            </button>
          </div>
        </div>

        {/* Section Catégories avec dropdown */}
        <div className="relative bg-white rounded-lg border border-gray-200 flex-grow md:flex-grow-0">
          <button
            className="w-full p-4 text-left flex items-center justify-between"
            onClick={() => setActiveCategoryPanel(!activeCategoryPanel)}
            aria-expanded={activeCategoryPanel}
            aria-haspopup="true"
          >
            <span className="text-sm font-medium text-gray-700">
              Catégorie: {selectedCategoryName || 'Toutes'}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 text-gray-500 transition-transform ${
                activeCategoryPanel ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* Panneau déroulant des catégories */}
          <div
            className={`absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg transform transition-all ${
              activeCategoryPanel
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <div className="p-2 max-h-60 overflow-y-auto">
              {arrayHasData(categories) ? (
                <div className="text-center py-2">
                  <p className="text-gray-500">Aucune catégorie disponible</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {categories?.map((category) => (
                    <button
                      key={category?._id}
                      className={`flex items-center w-full p-2 rounded-md transition-colors cursor-pointer ${
                        currentCategory === category?._id
                          ? 'bg-blue-100 text-blue-700'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                      onClick={() => handleCategoryClick(category?._id)}
                      aria-pressed={currentCategory === category?._id}
                      disabled={isSubmitting}
                    >
                      <span>{category?.categoryName}</span>
                      {currentCategory === category?._id && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5 ml-auto"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bouton réinitialiser */}
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="py-2 px-4 border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap"
            aria-label="Réinitialiser tous les filtres"
            disabled={isSubmitting}
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {/* Overlay pour fermer le menu des catégories lorsqu'il est ouvert */}
      {activeCategoryPanel && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setActiveCategoryPanel(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default Filters;
