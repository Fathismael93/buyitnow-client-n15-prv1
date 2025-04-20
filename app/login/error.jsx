'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { captureException } from '@/monitoring/sentry';
import { getErrorDisplayInfo } from '@/monitoring/errorUtils';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import logger from '@/utils/logger';

/**
 * Gestionnaire d'erreurs spécifique à la page de connexion
 * Il capture les erreurs d'authentification et fournit des actions adaptées
 */
export default function LoginError({ error, reset }) {
  useEffect(() => {
    // Enrichir l'erreur avec des informations spécifiques à l'authentification
    error.componentName = error.componentName || 'LoginPage';
    error.additionalInfo = {
      ...(error.additionalInfo || {}),
      context: 'authentication',
      page: 'login',
    };

    // Obtenir les informations d'erreur formatées
    const errorInfo = getErrorDisplayInfo(error);

    // Journaliser l'erreur d'authentification
    logger.error('Authentication error occurred', {
      error: error.message,
      errorType: errorInfo.tags?.errorType || 'auth_error',
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      userAgent:
        typeof window !== 'undefined' ? window.navigator.userAgent : '',
    });

    // Envoyer l'erreur à Sentry avec des métadonnées enrichies
    captureException(error, {
      tags: {
        ...errorInfo.tags,
        service: 'authentication',
        action: 'login',
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      },
      extra: {
        componentStack: error.componentStack || null,
        userAgent:
          typeof window !== 'undefined' ? window.navigator.userAgent : '',
        referrer: typeof window !== 'undefined' ? document.referrer : '',
        formState: error.formState || null, // Capture l'état du formulaire sans les données sensibles
      },
      level: error.fatal ? 'fatal' : errorInfo.level,
    });

    // Si l'erreur indique un problème de session/token, nettoyer la session
    if (
      error.message?.includes('token') ||
      error.message?.includes('session') ||
      error.message?.includes('credential')
    ) {
      // Tentative de nettoyage en arrière-plan (ne perturbe pas l'UX)
      signOut({ redirect: false }).catch((e) =>
        logger.warn('Failed to sign out after login error', {
          error: e.message,
        }),
      );
    }

    // Log plus détaillé en mode développement
    if (process.env.NODE_ENV === 'development') {
      console.error('Authentication error occurred:', {
        message: error.message,
        stack: error.stack,
        additionalInfo: error.additionalInfo,
      });
    }
  }, [error]);

  // Analyser l'erreur pour afficher un message approprié
  const getAuthErrorInfo = () => {
    // Utiliser l'utilitaire existant comme base
    const baseErrorInfo = getErrorDisplayInfo(error);

    // Personnaliser pour les erreurs d'authentification spécifiques
    if (error.message?.includes('CSRF')) {
      return {
        title: 'Erreur de sécurité',
        message:
          "Une erreur de sécurité s'est produite. Veuillez rafraîchir la page et réessayer.",
        level: 'error',
        action: 'refresh',
      };
    }

    if (
      error.message?.includes('rate limit') ||
      error.message?.includes('too many')
    ) {
      return {
        title: 'Trop de tentatives',
        message:
          'Vous avez effectué trop de tentatives de connexion. Veuillez réessayer plus tard.',
        level: 'warning',
        action: 'wait',
      };
    }

    if (
      error.message?.includes('credentials') ||
      error.message?.includes('email') ||
      error.message?.includes('password')
    ) {
      return {
        title: "Erreur d'authentification",
        message:
          'Identifiants incorrects ou compte non trouvé. Vérifiez vos informations et réessayez.',
        level: 'warning',
        action: 'retry',
      };
    }

    if (
      error.message?.includes('network') ||
      error.message?.includes('connection') ||
      error.message?.includes('timeout')
    ) {
      return {
        title: 'Problème de connexion',
        message: 'Vérifiez votre connexion internet et réessayez.',
        level: 'warning',
        action: 'retry',
      };
    }

    // Utiliser les informations de base pour les autres types d'erreurs
    return {
      title: baseErrorInfo.title || 'Erreur de connexion',
      message:
        baseErrorInfo.message ||
        "Une erreur s'est produite lors de la connexion. Veuillez réessayer.",
      level: baseErrorInfo.level || 'error',
      action: 'retry',
    };
  };

  const errorInfo = getAuthErrorInfo();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto shadow-md">
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
            {errorInfo.title}
          </h2>
        </div>

        <p className="text-gray-700 mb-6">{errorInfo.message}</p>

        <div className="flex flex-col sm:flex-row sm:space-x-3 space-y-3 sm:space-y-0">
          {errorInfo.action !== 'wait' && (
            <button
              onClick={() => reset()}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center"
              aria-label="Réessayer de se connecter"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Réessayer
            </button>
          )}

          {errorInfo.action === 'refresh' && (
            <button
              onClick={() => window.location.reload()}
              className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Actualiser la page
            </button>
          )}

          <Link
            href="/register"
            className="w-full sm:w-auto px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            Créer un compte
          </Link>

          <Link
            href="/"
            className="w-full sm:w-auto px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            Accueil
          </Link>
        </div>

        {/* Conditionnellement, afficher des détails supplémentaires en mode développement */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-6 p-4 bg-gray-100 rounded-md">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Détails de l&apos;erreur (visible uniquement en développement):
            </h3>
            <pre className="text-xs text-gray-600 overflow-auto max-h-40">
              {error.message}
              {error.componentName && `\nComposant: ${error.componentName}`}
              {error.additionalInfo &&
                `\nContexte: ${JSON.stringify(error.additionalInfo, null, 2)}`}
            </pre>
          </div>
        )}

        {/* Lien d'aide */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>
            Besoin d&apos;aide pour vous connecter?{' '}
            <Link
              href="/help/login"
              className="text-blue-500 hover:text-blue-700"
            >
              Consultez notre guide
            </Link>{' '}
            ou{' '}
            <Link href="/contact" className="text-blue-500 hover:text-blue-700">
              contactez-nous
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
