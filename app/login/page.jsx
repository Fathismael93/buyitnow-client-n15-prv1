import { lazy } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { getCsrfToken } from 'next-auth/react';

import Loading from '@/app/loading';

// Chargement dynamique avec retries
const Login = lazy(() => import('@/components/auth/Login'), {
  loading: () => <Loading />,
  ssr: true, // Activer le SSR pour améliorer la première charge
});

export const dynamic = 'force-dynamic';

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

/**
 * Composant serveur pour la page de connexion qui effectue les vérifications
 * préalables et prépare les données nécessaires pour le client
 */
async function LoginPage() {
  try {
    console.log('Initializing login page');
    // Vérifier si l'utilisateur est déjà connecté
    const session = await getServerSession(auth);
    console.log('Session:', session);
    if (session) {
      console.log('User is already logged in, redirecting...');
      // Rediriger vers la page d'accueil ou tableau de bord selon le rôle
      const redirectUrl = '/';
      return redirect(redirectUrl);
    }

    console.log('User is not logged in, proceeding to login page');

    // Récupérer les en-têtes pour le logging et la sécurité
    const headersList = headers();
    const userAgent = headersList.get('user-agent') || 'unknown';
    const referer = headersList.get('referer') || 'direct';
    const callbackUrl = '/';

    // Générer un token CSRF pour sécuriser le formulaire
    const csrfToken = await getCsrfToken({ req: { headers: headersList } });

    console.log('Login page initialized', {
      userAgent: userAgent?.substring(0, 100),
      referer: referer?.substring(0, 200),
      isCsrfToken: csrfToken ? 'present' : 'missing',
    });

    // Journaliser l'accès à la page (anonymisé)
    const clientIp = (headersList.get('x-forwarded-for') || '')
      .split(',')
      .shift()
      .trim();
    const anonymizedIp = clientIp ? clientIp.replace(/\d+$/, 'xxx') : 'unknown';

    console.info('Login page accessed', {
      userAgent: userAgent?.substring(0, 100),
      referer: referer?.substring(0, 200),
      ip: anonymizedIp,
    });

    // Rendu du composant client avec les props nécessaires
    return (
      <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Connexion à votre compte
          </h1>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <Login
              csrfToken={csrfToken}
              callbackUrl={callbackUrl}
              referer={referer}
            />
          </div>
        </div>
      </div>
    );
  } catch (error) {
    // Journaliser l'erreur
    console.error('Error initializing login page', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    throw new Error('Error initializing login page', {
      cause: error,
    });
  }
}

export default LoginPage;
