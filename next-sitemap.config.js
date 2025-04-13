module.exports = {
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://buyitnow-client-n15-prv1.vercel.app/',
  generateRobotsTxt: true,

  // Configuration plus complète pour robots.txt
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/address',
          '/api',
          '/cart',
          '/me',
          '/shipping',
          '/shipping-choice',
          '/payment',
          '/confirmation',
          '/error',
          '/404',
          '/500',
          '/search', // Pages de résultats de recherche dynamiques
          '/*?*', // Bloquer les URLs avec paramètres de requête
        ],
      },
      // Ajout de règles spécifiques pour les robots gourmands
      {
        userAgent: 'GPTBot',
        disallow: ['/'], // Bloquer ChatGPT si souhaité
      },
    ],
    additionalSitemaps: [
      `${process.env.NEXT_PUBLIC_SITE_URL || 'https://buyitnow-client-n15-prv1.vercel.app/'}/server-sitemap.xml`,
    ],
  },

  exclude: [
    '/address/*',
    '/api/*',
    '/cart',
    '/me/*',
    '/shipping',
    '/shipping-choice',
    '/payment',
    '/confirmation',
    '/error',
    '/404',
    '/500',
    '/search',
  ],

  // Optimisation de performance: une seule instance de Date pour toutes les URLs
  autoLastmod: true, // Utiliser la date de génération pour toutes les URLs

  // Configuration pour limiter la charge serveur
  sitemapSize: 5000, // Diviser les sitemaps volumineux
  generateIndexSitemap: true,

  // Optimisation pour les sites multilingues (si applicable)
  // alternateRefs: process.env.NEXT_PUBLIC_LOCALES
  //   ? process.env.NEXT_PUBLIC_LOCALES.split(',').map(locale => ({
  //       href: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://buyitnow-client-next15.vercel.app/'}${locale !== 'en' ? `/${locale}` : ''}`,
  //       hreflang: locale,
  //     }))
  //   : [],

  // Fonction transform plus robuste
  transform: async (config) => {
    try {
      const url = config.loc || '';

      // Pages de produit
      if (url.includes('/products/')) {
        return {
          loc: url,
          changefreq: 'daily',
          priority: 0.8,
          // Utiliser la date système ou une date issue des métadonnées de page
          ...(config.lastmod ? { lastmod: config.lastmod } : {}),
        };
      }

      // Pages de catégorie
      if (url.includes('/category/')) {
        return {
          loc: url,
          changefreq: 'weekly',
          priority: 0.7,
          ...(config.lastmod ? { lastmod: config.lastmod } : {}),
        };
      }

      // Page d'accueil
      if (url === '' || url === '/') {
        return {
          loc: url,
          changefreq: 'daily',
          priority: 1.0,
          ...(config.lastmod ? { lastmod: config.lastmod } : {}),
        };
      }

      // Pages statiques informatives
      // if (url.includes('/about') || url.includes('/contact') || url.includes('/faq')) {
      //   return {
      //     loc: url,
      //     changefreq: 'monthly',
      //     priority: 0.6,
      //     ...(config.lastmod ? { lastmod: config.lastmod } : {})
      //   };
      // }

      // Configuration par défaut pour toutes les autres pages
      return {
        loc: url,
        changefreq: 'weekly',
        priority: 0.5,
        ...(config.lastmod ? { lastmod: config.lastmod } : {}),
      };
    } catch (error) {
      console.error(`Error transforming URL: ${config?.loc}`, error);

      // Fournir une configuration par défaut en cas d'erreur
      return {
        loc: config.loc || '',
        changefreq: 'weekly',
        priority: 0.5,
      };
    }
  },
};
