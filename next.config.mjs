/* eslint-disable prettier/prettier */
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { withSentryConfig } from '@sentry/nextjs';
import withBundleAnalyzer from '@next/bundle-analyzer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'no-referrer, strict-origin-when-cross-origin',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  // Mise à jour de la directive Content-Security-Policy
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src 'self'; script-src https://cdnjs.cloudflare.com; style-src 'self' https://cdnjs.cloudflare.com; media-src 'self' https://res.cloudinary.com ; img-src 'self' data: blob: https://res.cloudinary.com; font-src 'self' https://cdnjs.cloudflare.com; connect-src 'self' https://res.cloudinary.com https://sentry.io https://*.ingest.sentry.io https://*.sentry.io;",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400, // 1 jour
  },
  experimental: {
    optimizePackageImports: ['react-toastify', 'yup', 'mongoose', 'lodash'],
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
      resolveAlias: {
        underscore: 'lodash',
      },
    },
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
            exclude: ['log', 'error', 'warn'],
          }
        : false,
  },
  // Configuration du cache des pages statiques
  staticPageGenerationTimeout: 180,
  // Configuration de la sortie en standalone
  output: 'standalone',
  // Configuration des headers de sécurité
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*', // Set your origin
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=3600',
          },
        ],
      },
    ];
  },
  // Configuration des redirections
  async redirects() {
    return [
      {
        source: '/404',
        destination: '/',
        permanent: false,
      },
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];
  },
  // Configuration du runtime
  serverRuntimeConfig: {
    PROJECT_ROOT: __dirname,
  },
  // Configuration des variables d'environnement côté client
  publicRuntimeConfig: {
    // Uniquement les variables publiques
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    NEXT_PUBLIC_CLOUDINARY_API_KEY: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
    NEXT_PUBLIC_ENABLE_SW: process.env.NEXT_PUBLIC_ENABLE_SW,
  },
  webpack: (config, { dev, isServer }) => {
    // Optimisations webpack supplémentaires
    config.optimization.moduleIds = 'deterministic';

    // Pour les gros modules
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 244000,
        minChunks: 1,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
        automaticNameDelimiter: '~',
        cacheGroups: {
          defaultVendors: {
            test: /[/\\]node_modules[/\\]/,
            priority: -10,
            reuseExistingChunk: true,
          },
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
        },
      };
    }

    // Ajouter cette configuration pour le cache
    if (!dev) {
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__dirname],
        },
        cacheDirectory: path.resolve(__filename, '.next/cache/webpack'),
      };
    }

    // Supprimer les avertissements pour les grandes chaînes
    if (!dev) {
      config.infrastructureLogging = {
        level: 'error', // Réduit le niveau de log pour ne montrer que les erreurs
      };
    }

    return config;
  },
  eslint: {
    ignoreDuringBuilds: false, // Ignorer les erreurs ESLint pendant le build
  },
  typescript: {
    ignoreBuildErrors: true, // Ignorer les erreurs TypeScript pendant le build
  },
};

// Configuration Sentry
const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG || 'benew',
  project: process.env.SENTRY_PROJECT || 'buyitnow',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true, // Supprime les logs de Sentry pendant le build
  disableServerWebpackPlugin: false,
  disableClientWebpackPlugin: false,
  widenClientFileUpload: true,
  transpileClientSDK: true,
  hideSourceMaps: true,
  dryRun: process.env.NODE_ENV !== 'production',
  debug: false,
};

// Export avec Sentry et l'analyseur de bundle
export default withSentryConfig(
  bundleAnalyzer(nextConfig),
  sentryWebpackPluginOptions,
);
