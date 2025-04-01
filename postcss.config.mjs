/* eslint-disable prettier/prettier */
const config = {
  plugins: {
    'postcss-flexbugs-fixes': {},

    // Support des variables CSS personnalisées
    'postcss-custom-properties': {},

    // Support des fonctionnalités CSS modernes
    'postcss-preset-env': {
      stage: 4,
      features: {
        'nesting-rules': true,
        'custom-media-queries': true,
        'media-query-ranges': true,
      },
      autoprefixer: {
        grid: true,
        flexbox: 'no-2009',
      },
      browsers: [
        '> 1%',
        'last 2 versions',
        'Firefox ESR',
        'not dead',
        'not IE 11',
      ],
    },

    // Traitement Tailwind CSS
    '@tailwindcss/postcss': {},

    // Optimisations de production
    ...(process.env.NODE_ENV === 'production'
      ? {
          // Minifier le CSS
          cssnano: {
            preset: [
              'default',
              {
                discardComments: {
                  removeAll: true,
                },
                minifyFontValues: true,
                minifyGradients: true,
                mergeLonghand: true,
                colormin: true,
                zindex: false, // Éviter les problèmes de z-index
                reduceIdents: false, // Éviter les problèmes avec animations/keyframes
              },
            ],
          },
        }
      : {}),

    // En développement uniquement: alertes de compatibilité navigateur
    ...(process.env.NODE_ENV !== 'production'
      ? {
          'postcss-browser-reporter': {},
        }
      : {}),
  },
};

export default config;
