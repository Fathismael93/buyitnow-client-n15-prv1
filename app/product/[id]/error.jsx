'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import Link from 'next/link';
import { captureException } from '@/monitoring/sentry';

export default function Error({ error, reset }) {
  // Log et monitoring de l'erreur au montage du composant
  useEffect(() => {
    // Log de l'erreur en console en développement
    console.error('Product page error:', error);

    // Capture de l'erreur par Sentry avec contexte
    captureException(error, {
      tags: {
        component: 'ProductPage',
        errorType: error.name || 'Unknown',
        action: 'page_load',
      },
      extra: {
        message: error.message,
        // Récupérer l'ID du produit à partir de l'URL
        productId: window.location.pathname.split('/').pop(),
      },
    });
  }, [error]);

  // Déterminer le message d'erreur adapté à l'utilisateur
  const userFriendlyMessage =
    error.message?.includes('not found') || error.statusCode === 404
      ? "Ce produit n'est pas disponible ou a été retiré de notre catalogue."
      : 'Nous rencontrons actuellement des difficultés techniques pour afficher ce produit.';

  return (
    <div className="container mx-auto py-10 px-4 text-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Oups ! Impossible d&apos;afficher ce produit
        </h1>

        <p className="text-gray-700 mb-6">{userFriendlyMessage}</p>

        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-8">
          <button
            onClick={() => reset()}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Réessayer
          </button>

          <Link
            href="/"
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
        </div>

        {/* Afficher plus de détails en mode développement */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-gray-100 rounded text-left overflow-auto max-h-60">
            <h3 className="text-lg font-semibold mb-2">
              Détails de l&apos;erreur (visible uniquement en développement):
            </h3>
            <p className="font-mono text-sm">{error.message}</p>
            {error.stack && (
              <pre className="text-xs mt-2 text-gray-600 whitespace-pre-wrap">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <div className="mt-6 text-sm text-gray-500">
          <p>
            Si le problème persiste, veuillez contacter notre service client.
          </p>
          <p className="mt-2">Référence erreur: {Date.now().toString(36)}</p>
        </div>
      </div>
    </div>
  );
}
