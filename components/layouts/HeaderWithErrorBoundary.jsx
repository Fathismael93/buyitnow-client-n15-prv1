'use client';

import Header from './Header';
import ErrorBoundary, { withErrorBoundary } from '../common/ErrorBoundary';
import Link from 'next/link';

/**
 * Composant de fallback spécifique pour les erreurs du Header
 * Plus convivial que l'erreur globale
 */
const HeaderFallback = ({ reset }) => (
  <header className="bg-white py-2 border-b sticky top-0 z-50 shadow-sm">
    <div className="container max-w-[1440px] mx-auto px-4">
      <div className="flex flex-wrap items-center justify-between">
        {/* Logo simplifiée */}
        <div className="shrink-0 mr-5">
          <Link href="/" className="font-bold text-xl text-blue-600">
            BuyItNow
          </Link>
        </div>

        <div className="py-2 px-4 bg-amber-50 border border-amber-200 rounded-md text-amber-700 flex-1 mx-4 flex items-center">
          <svg
            className="w-5 h-5 mr-2 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="mr-auto">
            Un problème temporaire est survenu avec la navigation
          </span>
          <button
            onClick={reset}
            className="ml-3 px-3 py-1 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded text-sm"
          >
            Réessayer
          </button>
        </div>

        {/* Boutons minimaux de connexion */}
        <div className="flex items-center">
          <a
            href="/login"
            className="px-3 py-2 inline-block text-center text-gray-700 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-blue-50"
          >
            Connexion
          </a>
        </div>
      </div>
    </div>
  </header>
);

/**
 * Deux façons d'utiliser l'ErrorBoundary avec le Header
 */

// Option 1: Utiliser le HOC withErrorBoundary
export const HeaderWithErrorBoundaryHOC = withErrorBoundary(Header, {
  FallbackComponent: HeaderFallback,
  name: 'header-boundary',
  tags: { critical: true, area: 'navigation' },
});

// Option 2: Utiliser directement le composant ErrorBoundary
const HeaderWithErrorBoundary = () => (
  <ErrorBoundary
    componentName="Header"
    FallbackComponent={HeaderFallback}
    name="header-boundary"
    onError={(error) => {
      // Actions supplémentaires lors d'une erreur (analytics, logs, etc.)
      console.warn('Header error intercepted by boundary:', error.message);
    }}
  >
    <Header />
  </ErrorBoundary>
);

export default HeaderWithErrorBoundary;
