'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { captureException } from '@/monitoring/sentry';

export default function Error({ error, reset }) {
  // Envoyer l'erreur à Sentry dès que le composant est monté
  useEffect(() => {
    // Capture l'erreur avec Sentry
    captureException(error, {
      tags: {
        errorType: 'nextjs_error_boundary',
        component: error.componentName || 'Unknown',
      },
      extra: {
        path: typeof window !== 'undefined' ? window.location.pathname : '',
        componentStack: error.componentStack || null,
        additionalInfo: error.additionalInfo || null,
      },
      level: error.fatal ? 'fatal' : 'error',
    });
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-2xl mx-auto">
        <div className="flex items-center mb-4">
          <svg
            className="w-8 h-8 text-red-500 mr-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <h2 className="text-xl font-semibold text-red-700">
            Une erreur s&apos;est produite
          </h2>
        </div>

        <p className="text-gray-700 mb-4">
          Nous rencontrons un problème technique. Notre équipe a été notifiée et
          travaille à résoudre ce problème.
        </p>

        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          aria-label="Réessayer de charger la page"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
