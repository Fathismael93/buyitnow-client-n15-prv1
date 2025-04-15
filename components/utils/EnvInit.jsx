'use client';

import { useEffect } from 'react';
import { ENV_VARS } from '@/utils/env-config';

/**
 * Expose les variables d'environnement côté client
 * Ce composant est conçu pour être inclus dans le layout principal
 */
const EnvInit = () => {
  useEffect(() => {
    if (!ENV_VARS) {
      console.error(
        "ENV_VARS n'est pas défini. L'initialisation des variables d'environnement a échoué.",
      );
      return;
    }

    const requiredVars = ['API_URL', 'SITE_URL', 'NODE_ENV'];
    const missingVars = requiredVars.filter((varName) => !ENV_VARS[varName]);

    if (missingVars.length > 0) {
      console.error(
        `Variables d'environnement manquantes: ${missingVars.join(', ')}`,
      );
    }

    // Ne pas exposer directement les clés API sensibles
    const publicVars = {
      NEXT_PUBLIC_API_URL: ENV_VARS.API_URL,
      NEXT_PUBLIC_SITE_URL: ENV_VARS.SITE_URL,
      NEXT_PUBLIC_ENABLE_SW: ENV_VARS.ENABLE_SW,
      NEXT_PUBLIC_NODE_ENV: ENV_VARS.NODE_ENV,
    };

    // Les clés sensibles devraient être exposées différemment ou pas du tout
    if (ENV_VARS.NODE_ENV === 'development') {
      // En développement uniquement
      window.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = ENV_VARS.CLOUDINARY_CLOUD_NAME;
      window.NEXT_PUBLIC_CLOUDINARY_API_KEY = ENV_VARS.CLOUDINARY_API_KEY;
    }

    // Assigner les variables publiques
    Object.entries(publicVars).forEach(([key, value]) => {
      if (value !== undefined) {
        window[key] = value;
      }
    });
  }, []);

  return null;
};

export default EnvInit;
