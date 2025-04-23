// app/product/[id]/not-found.jsx
'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { captureMessage } from '@/monitoring/sentry';

export default function ProductNotFound() {
  const [suggestedProducts, setSuggestedProducts] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Récupérer l'ID du produit de l'URL
  const getProductIdFromUrl = () => {
    if (typeof window === 'undefined') return null;
    const pathname = window.location.pathname;
    const segments = pathname.split('/');
    return segments[segments.length - 1];
  };

  useEffect(() => {
    // Enregistrement analytique de l'événement de produit non trouvé
    const productId = getProductIdFromUrl();

    // Enregistrement dans Sentry
    captureMessage(`Product not found: ${productId}`, {
      level: 'info',
      tags: {
        component: 'ProductNotFound',
        productId,
      },
      extra: {
        url: typeof window !== 'undefined' ? window.location.href : null,
        referrer: typeof document !== 'undefined' ? document.referrer : null,
      },
    });

    // Enregistrement dans Google Analytics (si disponible)
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'not_found', {
        event_category: 'product',
        event_label: productId,
      });
    }

    // Récupérer des produits suggérés (à implémenter)
    const fetchSuggestedProducts = async () => {
      try {
        setIsLoading(true);
        // La fonction suivante devrait être implémentée dans votre code
        // const response = await fetch('/api/products/suggested?limit=4');
        // const data = await response.json();
        // setSuggestedProducts(data.products);

        // Pour l'exemple, simulons un chargement
        setTimeout(() => {
          setSuggestedProducts([]);
          setIsLoading(false);
        }, 500);
      } catch (error) {
        console.error('Error fetching suggested products:', error);
        setIsLoading(false);
      }
    };

    fetchSuggestedProducts();
  }, []);

  return (
    <div className="container mx-auto py-10 px-4 text-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Produit non trouvé
        </h1>

        <p className="text-gray-700 mb-6">
          Le produit que vous recherchez n&apos;existe pas ou a été retiré de
          notre catalogue.
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
          <Link
            href="/"
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Retour à l&apos;accueil
          </Link>

          <Link
            href="/category/all"
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Parcourir tous les produits
          </Link>
        </div>

        {/* Suggestions de produits */}
        {isLoading ? (
          <p className="text-gray-500">Chargement des suggestions...</p>
        ) : suggestedProducts.length > 0 ? (
          <div className="mt-8">
            <h2 className="text-lg font-medium mb-4">
              Vous pourriez être intéressé par
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Liste des produits suggérés - à implémenter */}
            </div>
          </div>
        ) : null}

        <div className="mt-6 text-sm text-gray-500">
          <p>
            Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, veuillez
            contacter notre service client.
          </p>
        </div>
      </div>
    </div>
  );
}
