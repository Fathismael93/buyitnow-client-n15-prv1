// helpers/validation/index.js
// Point d'entrée principal avec exports sélectifs

// Core utilities (toujours chargés)
export { REGEX, validationUtils } from './core/constants';
export { validateWithLogging } from './core/utils';

// Auth schemas (lazy loading)
export const loadAuthSchemas = () => import('./schemas/auth');
export const loadUserSchemas = () => import('./schemas/user');
export const loadProductSchemas = () => import('./schemas/product');
export const loadAddressSchemas = () => import('./schemas/address');
export const loadPaymentSchemas = () => import('./schemas/payment');
export const loadContactSchemas = () => import('./schemas/contact');

// Direct exports pour les schémas critiques (performance)
export { loginSchema, registerSchema } from './schemas/auth';
export { searchSchema } from './schemas/product';

// Utilitaire de chargement dynamique
export const getSchema = async (category, schemaName) => {
  const schemaModules = {
    auth: () => import('./schemas/auth'),
    user: () => import('./schemas/user'),
    product: () => import('./schemas/product'),
    address: () => import('./schemas/address'),
    payment: () => import('./schemas/payment'),
    contact: () => import('./schemas/contact'),
  };

  if (!schemaModules[category]) {
    throw new Error(`Unknown schema category: ${category}`);
  }

  const module = await schemaModules[category]();

  if (!module[schemaName]) {
    throw new Error(`Schema ${schemaName} not found in ${category}`);
  }

  return module[schemaName];
};
