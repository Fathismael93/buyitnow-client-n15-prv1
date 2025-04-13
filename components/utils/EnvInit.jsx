'use client';

import { useEffect } from 'react';
import { ENV_VARS } from '@/utils/env-config';

/**
 * Expose les variables d'environnement côté client
 * Ce composant est conçu pour être inclus dans le layout principal
 */
const EnvInit = () => {
  useEffect(() => {
    // Exposer les variables d'environnement nécessaires au client
    window.NEXT_PUBLIC_API_URL = ENV_VARS.API_URL;
    window.NEXT_PUBLIC_SITE_URL = ENV_VARS.SITE_URL;
    window.NEXT_PUBLIC_ENABLE_SW = ENV_VARS.ENABLE_SW;
    window.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = ENV_VARS.CLOUDINARY_CLOUD_NAME;
    window.NEXT_PUBLIC_CLOUDINARY_API_KEY = ENV_VARS.CLOUDINARY_API_KEY;

    // Exposer NODE_ENV pour le service worker
    window.NEXT_PUBLIC_NODE_ENV = ENV_VARS.NODE_ENV;
  }, []);

  return null;
};

export default EnvInit;
