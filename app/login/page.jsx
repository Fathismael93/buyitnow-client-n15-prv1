import dynamic from 'next/dynamic';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';

import { auth } from '@/app/api/auth/[...nextauth]/route';
import Loading from '@/app/loading';

// Chargement dynamique avec retries optimisés
const Login = dynamic(
  () =>
    import('@/components/auth/Login').catch((error) => {
      console.error('Failed to load Login component', { error: error.message });
      // Retourner un composant de fallback en cas d'erreur
      const FallbackComponent = () => (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-center">
          <p className="text-red-800">
            Une erreur est survenue lors du chargement du formulaire.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      );
      FallbackComponent.displayName = 'LoginFallback';
      return FallbackComponent;
    }),
  {
    loading: () => <Loading />,
    ssr: true, // Activation du Server-Side Rendering pour optimiser la première charge
  },
);

// Métadonnées enrichies pour SEO et sécurité
export const metadata = {
  title: 'Connexion | Buy It Now',
  description:
    'Connectez-vous à votre compte Buy It Now pour accéder à vos commandes et informations personnelles.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: '/login',
  },
  openGraph: {
    title: 'Connexion | Buy It Now',
    description: 'Connectez-vous à votre compte Buy It Now',
    type: 'website',
    images: [
      {
        url: '/images/auth-banner.jpg',
        width: 1200,
        height: 630,
        alt: 'Buy It Now - Connexion',
      },
    ],
  },
};

// Configuration des headers de sécurité spécifiques à la page d'authentification
export const header = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self';",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Optimisation des performances en utilisant l'Edge Runtime
export const runtime = 'edge';

/**
 * Page de connexion optimisée avec vérification de session,
 * gestion d'erreur et monitoring
 */
async function LoginPage() {
  try {
    // Vérifier si l'utilisateur est déjà connecté
    const session = await getServerSession(auth);
    if (session) {
      // Rediriger vers la page d'accueil ou le tableau de bord selon le rôle
      const redirectUrl = session.user.role === 'admin' ? '/admin' : '/';
      console.info('Redirecting authenticated user from login page', {
        userId: session.user._id,
        redirectUrl,
      });
      return redirect(redirectUrl);
    }

    // Génération du jeton CSRF pour sécuriser le formulaire
    const headersList = headers();
    const referer = headersList.get('referer') || '';

    // Journaliser les accès à la page de connexion pour monitoring de sécurité
    // Anonymiser les données personnelles
    const clientIp = (headersList.get('x-forwarded-for') || '')
      .split(',')
      .shift()
      .trim();
    const anonymizedIp = clientIp ? clientIp.replace(/\d+$/, 'xxx') : 'unknown';

    console.info('Login page accessed', {
      userAgent: headersList.get('user-agent')?.substring(0, 100) || 'unknown',
      referer: referer.substring(0, 200) || 'direct',
      ip: anonymizedIp,
    });

    // Construction contextuelle de la page avec configuration sécurisée
    return (
      <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Connexion à votre compte
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Accédez à votre espace personnel pour gérer vos commandes.
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <Login referer={referer} />

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Pas encore inscrit ?
                  </span>
                </div>
              </div>

              <div className="mt-6 text-center">
                <a
                  href="/register"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Créer un compte
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    // Capture et journalisation des erreurs
    console.error('Error initializing login page', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    // Propager l'erreur pour qu'elle soit traitée par le composant error.jsx
    throw error;
  }
}

LoginPage.displayName = 'LoginPage';

export default LoginPage;
