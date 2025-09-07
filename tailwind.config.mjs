/* eslint-disable prettier/prettier */

// =============================================================================
// SYSTÈME DE BREAKPOINTS OPTIMISÉ TAILWIND CSS - 3 GRANDES CATÉGORIES (2025)
// =============================================================================
// Réplication exacte du système SASS optimisé pour Tailwind CSS
// Mobile-first avec réduction intelligente pour performance et maintenabilité
// RÉDUCTION : 40+ breakpoints → 18 breakpoints essentiels (-59%)

// ✅ BREAKPOINTS - 3 CATÉGORIES OPTIMISÉES (18 BREAKPOINTS ESSENTIELS)
const breakpoints = {
  // 📱 PETITS ÉCRANS (320px - 700px) - 4 BREAKPOINTS ESSENTIELS
  // === SMARTPHONES & APPAREILS PORTABLES ===
  'small-xs': '360px', // Android budget dominant + Samsung Galaxy S25 standard
  'small-sm': '375px', // iPhone historique (6/7/8) encore très utilisé
  'small-lg': '393px', // iPhone 15/16 (standard Apple actuel)
  'small-xl': '430px', // iPhone Plus + limite supérieure mobiles

  // 📟 MOYENS ÉCRANS (701px - 1199px) - 4 BREAKPOINTS ESSENTIELS
  // === TABLETTES & ÉCRANS INTERMÉDIAIRES ===
  'medium-sm': '768px', // iPad classique 9.7" (référence historique absolue)
  'medium-lg': '834px', // iPad Pro 11" (toutes générations - standard Apple)
  'medium-xl': '900px', // Grandes tablettes Android 13-14" (Samsung, OnePlus)
  'medium-xxl': '1024px', // iPad Pro 12.9" + tablettes en paysage

  // 🖥️ GRANDS ÉCRANS (1200px+) - 6 BREAKPOINTS ESSENTIELS
  // === LAPTOPS & DESKTOPS ===
  'large-xs': '1200px', // Standard industrie absolu - seuil desktop (Bootstrap, Tailwind)
  'large-sm': '1280px', // Laptops standards 14-15" (très populaire - MacBook Air, Dell XPS)
  'large-md': '1366px', // Laptops budget + anciens écrans (11,69% marché global)
  'large-lg': '1440px', // Desktop 2K entry + laptops premium (point d'équilibre)
  'large-xxl': '1920px', // Desktop Full HD (22% marché mondial - DOMINANT)
  'large-xxxl': '2560px', // Desktop 2K/QHD premium gaming/pro
};

// =============================================================================
// APPAREILS SPÉCIFIQUES RATIONALISÉS (18 APPAREILS ESSENTIELS)
// =============================================================================
const deviceBreakpoints = {
  // 📱 MOBILES ESSENTIELS - 8 APPAREILS (vs 17 avant)
  // === IPHONE DOMINANTS ===
  'iphone-13-14': { width: '390px', height: '844px' }, // Génération dominante encore très utilisée
  'iphone-15-16': { width: '393px', height: '852px' }, // Standard Apple actuel (majoritaire)
  'iphone-15-16-plus': { width: '430px', height: '932px' }, // Plus grandes versions populaires

  // === ANDROID FLAGSHIPS DOMINANTS ===
  'galaxy-s25': { width: '360px', height: '780px' }, // Samsung standard 6.2" (leader Android)
  'pixel-9': { width: '412px', height: '915px' }, // Google Pixel 6.3" (référence Android pure)
  'oneplus-13': { width: '455px', height: '809px' }, // OnePlus flagship 6.82" (performance)

  // 📟 TABLETTES ESSENTIELLES - 6 APPAREILS (vs 12 avant)
  // === IPAD STANDARDS ===
  'ipad-air-11-2024': { width: '820px', height: '1180px' }, // iPad Air 11" M2 (équilibre prix/performance)
  'ipad-pro-11-m4': { width: '834px', height: '1194px' }, // iPad Pro 11" M4 (standard professionnel)
  'ipad-pro-13-m4': { width: '1032px', height: '1376px' }, // iPad Pro 13" M4 (haut de gamme)

  // === TABLETTES ANDROID POPULAIRES ===
  'galaxy-tab-s10': { width: '800px', height: '1280px' }, // Samsung Tab S10 11" (leader Android tablettes)
  'pixel-tablet': { width: '800px', height: '1280px' }, // Google Pixel Tablet 10.95" (référence Google)
  'oneplus-pad-3': { width: '900px', height: '1200px' }, // OnePlus Pad 3 13"+ (premium Android)

  // 🖥️ LAPTOPS/DESKTOPS ESSENTIELS - 4 APPAREILS (vs 8 avant)
  // === LAPTOPS POPULAIRES ===
  'macbook-air-13-m4': { width: '1280px', height: '832px' }, // CSS pixels (scaling 2x) - leader laptops premium
  'laptop-fhd-15': { width: '1920px', height: '1080px' }, // Laptops 15" standard Windows (majoritaire)

  // === DESKTOPS DOMINANTS ===
  'desktop-fhd': { width: '1920px', height: '1080px' }, // Full HD dominant (22% marché mondial)
  'desktop-2k': { width: '2560px', height: '1440px' }, // 2K/QHD premium (gaming/pro en croissance)
};

// =============================================================================
// CONFIGURATION TAILWIND CSS PRINCIPALE
// =============================================================================
const config = {
  content: ['./components/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],

  theme: {
    // 🎯 REMPLACEMENT COMPLET DES BREAKPOINTS TAILWIND
    screens: {
      // 📱 PETITS ÉCRANS - Mobile-first
      'small-xs': breakpoints['small-xs'],
      'small-sm': breakpoints['small-sm'],
      'small-lg': breakpoints['small-lg'],
      'small-xl': breakpoints['small-xl'],

      // 📟 MOYENS ÉCRANS - Tablettes
      'medium-sm': breakpoints['medium-sm'],
      'medium-lg': breakpoints['medium-lg'],
      'medium-xl': breakpoints['medium-xl'],
      'medium-xxl': breakpoints['medium-xxl'],

      // 🖥️ GRANDS ÉCRANS - Desktop
      'large-xs': breakpoints['large-xs'],
      'large-sm': breakpoints['large-sm'],
      'large-md': breakpoints['large-md'],
      'large-lg': breakpoints['large-lg'],
      'large-xxl': breakpoints['large-xxl'],
      'large-xxxl': breakpoints['large-xxxl'],

      // 🔄 BREAKPOINTS PAR CATÉGORIE (helpers)
      'small-only': { max: '700px' }, // Petits écrans uniquement
      'medium-only': { min: '701px', max: '1199px' }, // Moyens écrans uniquement
      'large-only': { min: '1200px' }, // Grands écrans uniquement

      // 📱 COMBOS UTILES
      'mobile-and-tablets': { max: '1199px' }, // Mobile + Tablettes
      'tablets-and-computers': { min: '701px' }, // Tablettes + Ordinateurs

      // 📱 APPAREILS SPÉCIFIQUES (sélection des plus importants)
      'iphone-current': breakpoints['small-lg'], // iPhone 15/16 = small-lg (393px)
      'iphone-plus': breakpoints['small-xl'], // iPhone Plus = small-xl (430px)
      'ipad-standard': breakpoints['medium-sm'], // iPad = medium-sm (768px)
      'ipad-pro': breakpoints['medium-lg'], // iPad Pro = medium-lg (834px)
      'laptop-standard': breakpoints['large-sm'], // Laptops = large-sm (1280px)
      'desktop-standard': breakpoints['large-xxl'], // Desktop = large-xxl (1920px)
      'desktop-2k': breakpoints['large-xxxl'], // Desktop 2K = large-xxxl (2560px)

      // 🔄 ORIENTATIONS (via raw CSS dans les plugins)
      // Ces breakpoints seront gérés par le plugin personnalisé ci-dessous
    },

    extend: {
      colors: {
        primary: {
          light: '#4da8ff',
          DEFAULT: '#0070f3',
          dark: '#005bcc',
        },
        secondary: {
          light: '#f6f9fc',
          DEFAULT: '#e9ecef',
          dark: '#dee2e6',
        },
        success: {
          light: '#9be6b4',
          DEFAULT: '#38c172',
          dark: '#187741',
        },
        danger: {
          light: '#f8a4a9',
          DEFAULT: '#e3342f',
          dark: '#c11c17',
        },
      },
      spacing: {
        72: '18rem',
        84: '21rem',
        96: '24rem',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
        '8xl': ['6rem', { lineHeight: '1' }],
        '9xl': ['8rem', { lineHeight: '1' }],
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        DEFAULT:
          '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        none: 'none',
      },
      borderRadius: {
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      transitionTimingFunction: {
        'in-expo': 'cubic-bezier(0.95, 0.05, 0.795, 0.035)',
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      },
      transitionDuration: {
        0: '0ms',
        150: '150ms',
        200: '200ms',
        300: '300ms',
        500: '500ms',
        700: '700ms',
        1000: '1000ms',
      },
      zIndex: {
        0: 0,
        10: 10,
        20: 20,
        30: 30,
        40: 40,
        50: 50,
        100: 100,
        auto: 'auto',
      },
    },
  },

  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),

    // =============================================================================
    // PLUGIN PERSONNALISÉ - ORIENTATIONS ET FONCTIONNALITÉS AVANCÉES
    // =============================================================================
    function ({ addUtilities, addVariant, theme }) {
      // 🔄 VARIANTES POUR ORIENTATIONS
      addVariant('portrait', '@media (orientation: portrait)');
      addVariant('landscape', '@media (orientation: landscape)');
      addVariant(
        'mobile-landscape',
        '@media (max-width: 700px) and (orientation: landscape)',
      );
      addVariant('tall-screen', '@media (min-height: 850px)');
      addVariant('short-screen', '@media (max-height: 700px)');

      // 📱 VARIANTES POUR DENSITÉ D'ÉCRAN
      addVariant(
        'high-density',
        '@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)',
      );
      addVariant(
        'ultra-density',
        '@media (-webkit-min-device-pixel-ratio: 3), (min-resolution: 288dpi)',
      );

      // 🎨 VARIANTES POUR PRÉFÉRENCES UTILISATEUR
      addVariant('dark', '@media (prefers-color-scheme: dark)');
      addVariant('light', '@media (prefers-color-scheme: light)');
      addVariant('reduced-motion', '@media (prefers-reduced-motion: reduce)');
      addVariant('high-contrast', '@media (prefers-contrast: high)');
      addVariant('reduced-data', '@media (prefers-reduced-data: reduce)');

      // 📱 VARIANTES POUR APPAREILS SPÉCIFIQUES
      Object.entries(deviceBreakpoints).forEach(([device, dimensions]) => {
        // Portrait
        addVariant(
          `${device}-portrait`,
          `@media (width: ${dimensions.width}) and (height: ${dimensions.height}) and (orientation: portrait)`,
        );
        // Landscape
        addVariant(
          `${device}-landscape`,
          `@media (width: ${dimensions.height}) and (height: ${dimensions.width}) and (orientation: landscape)`,
        );
        // Les deux orientations
        addVariant(
          device,
          `@media (width: ${dimensions.width}) and (height: ${dimensions.height}), (width: ${dimensions.height}) and (height: ${dimensions.width})`,
        );
      });

      // 🔧 UTILITAIRES POUR CONTENEURS RESPONSIVE
      addUtilities({
        '.container-responsive': {
          width: '100%',
          paddingLeft: 'clamp(1rem, 5vw, 2rem)',
          paddingRight: 'clamp(1rem, 5vw, 2rem)',
          marginLeft: 'auto',
          marginRight: 'auto',

          // Petits écrans : largeur fluide
          '@media (max-width: 700px)': {
            maxWidth: '100%',
            paddingLeft: '1rem',
            paddingRight: '1rem',
          },

          // Moyens écrans : largeurs tablettes
          '@media (min-width: 701px) and (max-width: 1199px)': {
            maxWidth: '90%',
          },

          // Grands écrans : largeurs fixes progressives
          [`@media (min-width: ${breakpoints['large-xs']})`]: {
            maxWidth: '1140px',
          },

          [`@media (min-width: ${breakpoints['large-lg']})`]: {
            maxWidth: '1320px',
          },

          [`@media (min-width: ${breakpoints['large-xxl']})`]: {
            maxWidth: '1540px',
          },
        },

        // 🔧 UTILITAIRES D'OPTIMISATION PAR CATÉGORIE
        '.optimize-small': {
          touchAction: 'manipulation',
          '-webkit-tap-highlight-color': 'transparent',
        },

        '.optimize-medium': {
          scrollBehavior: 'smooth',
        },

        '.optimize-large': {
          cursor: 'pointer',
          userSelect: 'none',
        },

        // 🔄 HELPERS RAPIDES POUR VISIBILITÉ
        '.hide-small': {
          '@media (max-width: 700px)': {
            display: 'none !important',
          },
        },

        '.show-small-only': {
          '@media (min-width: 701px)': {
            display: 'none !important',
          },
        },

        '.hide-medium': {
          '@media (min-width: 701px) and (max-width: 1199px)': {
            display: 'none !important',
          },
        },

        '.hide-large': {
          '@media (min-width: 1200px)': {
            display: 'none !important',
          },
        },
      });
    },
  ],

  // Optimisations pour la production
  future: {
    hoverOnlyWhenSupported: true,
  },

  // 🎯 CLASSES IMPORTANTES À CONSERVER
  safelist: [
    // Classes qui doivent toujours être incluses même si elles ne sont pas détectées dans le code
    'bg-primary',
    'text-primary',
    'bg-danger',
    'text-danger',
    'bg-success',
    'text-success',
    'container-responsive',
    'optimize-small',
    'optimize-medium',
    'optimize-large',
    'hide-small',
    'show-small-only',
    'hide-medium',
    'hide-large',
    {
      pattern: /^(bg|text|border)-(primary|secondary|success|danger)/,
    },
    // 📱 Breakpoints patterns
    {
      pattern: /^(small|medium|large)-(xs|sm|lg|xl|xxl|xxxl):/,
    },
    // 🔄 Orientations patterns
    {
      pattern:
        /^(portrait|landscape|mobile-landscape|tall-screen|short-screen):/,
    },
    // 📱 Appareils patterns
    {
      pattern: /^(iphone|ipad|galaxy|pixel|oneplus|macbook|laptop|desktop).*:/,
    },
  ],

  mode: 'jit',
};

export default config;

// =============================================================================
// 📋 GUIDE D'UTILISATION - EXEMPLES PRATIQUES
// =============================================================================

/*
🎯 EXEMPLES D'UTILISATION AVEC LES NOUVEAUX BREAKPOINTS :

// 1. 📱 RESPONSIVE BASIQUE - 3 CATÉGORIES
<div className="
  p-2 small-only:p-1 
  medium-only:p-6 
  large-only:p-8
">
  Contenu adaptatif
</div>

// 2. 📱 BREAKPOINTS FINS POUR MOBILES  
<div className="
  text-sm 
  small-sm:text-base 
  small-lg:text-lg 
  small-xl:text-xl
">
  Texte progressif mobile
</div>

// 3. 🔄 ORIENTATIONS
<div className="
  portrait:flex-col 
  landscape:flex-row 
  mobile-landscape:hidden
">
  Layout adaptatif orientation
</div>

// 4. 📱 APPAREILS SPÉCIFIQUES
<div className="
  iphone-current:text-sm 
  iphone-plus:text-base 
  ipad-pro:text-lg
">
  Optimisé par appareil
</div>

// 5. 🎨 PRÉFÉRENCES UTILISATEUR
<div className="
  bg-white 
  dark:bg-gray-900 
  reduced-motion:transition-none
">
  Respecte les préférences
</div>

// 6. 📏 CONTENEURS RESPONSIVE
<div className="container-responsive">
  Conteneur avec marges automatiques
</div>

// 7. ⚡ OPTIMISATIONS
<button className="
  optimize-small 
  medium-only:optimize-medium 
  large-only:optimize-large
">
  Bouton optimisé
</button>

// 8. 👁️ VISIBILITÉ CONDITIONNELLE
<nav className="
  hide-small 
  medium-only:block 
  large-only:flex
">
  Navigation adaptative
</nav>

🔄 MIGRATION DEPUIS L'ANCIEN SYSTÈME :
- md: → medium-sm: (768px)
- lg: → large-xs: (1200px) ou large-sm: (1280px)
- xl: → large-lg: (1440px)
- 2xl: → large-xxl: (1920px)

📊 PERFORMANCES :
- JIT Mode activé pour une génération CSS optimale
- Safelist configurée pour les classes critiques
- Plugin personnalisé pour fonctionnalités avancées
- Compatible avec tous les plugins Tailwind existants
*/
