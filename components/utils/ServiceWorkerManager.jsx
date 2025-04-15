/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

/**
 * Gère l'intégration du Service Worker
 * Ce composant est conçu pour être inclus dans le layout principal
 */
const ServiceWorkerManager = () => {
  const [isProduction, setIsProduction] = useState(false);

  const [swStatus, setSwStatus] = useState({
    isProduction: false,
    isRegistered: false,
    error: null,
    updateAvailable: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isProductionEnv = window.NEXT_PUBLIC_NODE_ENV === 'production';
    setSwStatus((prev) => ({ ...prev, isProduction: isProductionEnv }));

    // Désactiver la mise en cache en développement
    if (!isProduction && 'serviceWorker' in navigator) {
      // Désinscrire tout Service Worker existant en mode développement
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
            console.log(
              'Service Worker désinscrit (environnement de développement)',
            );
          }
        })
        .catch((error) => {
          console.error(
            'Erreur lors de la désinscription du Service Worker:',
            error,
          );
        });
    }
  }, []);

  useEffect(() => {
    if (
      !isProduction ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    )
      return;

    // Écouter les messages du Service Worker
    const messageHandler = (event) => {
      // Vérifier l'origine du message
      if (event.source.scriptURL && event.source.scriptURL.includes('/sw.js')) {
        // Traiter les messages du Service Worker
        if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
          setSwStatus((prev) => ({ ...prev, updateAvailable: true }));
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', messageHandler);

    return () => {
      navigator.serviceWorker.removeEventListener('message', messageHandler);
    };
  }, [isProduction]);

  // Utiliser cette fonction dans les blocs catch
  const handleServiceWorkerError = (error) => {
    console.error('Service Worker error:', error);
    setSwStatus((prev) => ({ ...prev, error: error.message }));

    // Envoyer l'erreur à un service de monitoring (si disponible)
    if (typeof window !== 'undefined' && window.errorReportingService) {
      window.errorReportingService.captureException(error);
    }
  };

  // N'intégrer le script que dans l'environnement de production
  if (
    !isProduction ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return null;
  }

  return (
    <>
      {isProduction ? (
        <Script id="sw-register" src="/sw-register.js" strategy="lazyOnload" />
      ) : (
        <DevModeNotification />
      )}
    </>
  );
};

export default ServiceWorkerManager;

// Composant pour une notification discrète en mode développeur
const DevModeNotification = () => {
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-2 left-2 bg-yellow-100 text-yellow-800 text-xs p-2 rounded-md z-50 opacity-70 hover:opacity-100">
      Service Worker désactivé en mode développement
    </div>
  );
};
