// utils/env-config.js
/**
 * Configuration centralisée des variables d'environnement
 * Utilisé à la fois par next.config.mjs et les composants qui ont besoin
 * d'accéder aux variables d'environnement
 */

export const ENV_VARS = {
  API_URL: process.env.NEXT_PUBLIC_API_URL || '',
  SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '',
  ENABLE_SW: process.env.NEXT_PUBLIC_ENABLE_SW || 'false',
  CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

// Pour next.config.mjs qui ne supporte pas les imports ES
export const getPublicRuntimeConfig = () => {
  return {
    NEXT_PUBLIC_API_URL: ENV_VARS.API_URL,
    NEXT_PUBLIC_SITE_URL: ENV_VARS.SITE_URL,
    NEXT_PUBLIC_ENABLE_SW: ENV_VARS.ENABLE_SW,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: ENV_VARS.CLOUDINARY_CLOUD_NAME,
    NEXT_PUBLIC_CLOUDINARY_API_KEY: ENV_VARS.CLOUDINARY_API_KEY,
  };
};
