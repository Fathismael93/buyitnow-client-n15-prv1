const config = {
    content: ['./components/**/*.{js,ts,jsx,tsx', './app/**/*.{js,ts,jsx,tsx'],
    theme: {
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
    ],
    // Optimisations pour la production
    future: {
      hoverOnlyWhenSupported: true,
    },
    // Désactiver les variantes peu utilisées en production pour réduire la taille du CSS
    safelist: [
      // Classes qui doivent toujours être incluses même si elles ne sont pas détectées dans le code
      'bg-primary',
      'text-primary',
      'bg-danger',
      'text-danger',
      'bg-success',
      'text-success',
      {
        pattern: /^(bg|text|border)-(primary|secondary|success|danger)/,
      },
    ],
    mode: 'jit',
  };
  
  export default config;