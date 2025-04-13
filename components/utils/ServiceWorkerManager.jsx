'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

/**
 * Gère l'intégration du Service Worker
 * Ce composant est conçu pour être inclus dans le layout principal
 */
const ServiceWorkerManager = () => {
  const [isProduction, setIsProduction] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isProductionEnv = window.NEXT_PUBLIC_NODE_ENV === 'production';
    setIsProduction(isProductionEnv);

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
      <Script id="sw-register" src="/sw-register.js" strategy="lazyOnload" />
    </>
  );
};

export default ServiceWorkerManager;
