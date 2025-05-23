import { Suspense, lazy } from 'react';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { captureException } from '@/monitoring/sentry';

// Chargement dynamique optimisé avec SSR activé
const UpdateProfile = lazy(() => import('@/components/auth/UpdateProfile'), {
  ssr: true, // Activer le SSR pour améliorer le premier chargement
});

// Force dynamic rendering pour garantir l'état d'authentification à jour
export const dynamic = 'force-dynamic';

// Métadonnées enrichies pour SEO et sécurité
export const metadata = {
  title: 'Modifier votre profil | Buy It Now',
  description: 'Mettez à jour vos informations personnelles sur Buy It Now',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: '/me/update',
  },
};

/**
 * Server component pour la page de mise à jour de profil
 * Effectue les vérifications d'authentification et de sécurité
 * avant de rendre le composant client
 */
async function UpdateProfilePage() {
  try {
    // Vérifier si l'utilisateur est authentifié
    const session = await getServerSession(auth);
    if (!session || !session.user) {
      console.log('User not authenticated, redirecting to login');
      return redirect('/login?callbackUrl=/me/update');
    }

    // Récupérer les en-têtes pour le logging et la sécurité
    const headersList = headers();
    const userAgent = headersList.get('user-agent') || 'unknown';
    const referer = headersList.get('referer') || 'direct';

    // Journal d'accès anonymisé pour la sécurité
    const clientIp = (headersList.get('x-forwarded-for') || '')
      .split(',')
      .shift()
      .trim();
    const anonymizedIp = clientIp ? clientIp.replace(/\d+$/, 'xxx') : 'unknown';

    console.info('Profile update page accessed', {
      userAgent: userAgent?.substring(0, 100),
      referer: referer?.substring(0, 200),
      ip: anonymizedIp,
      userId: session.user._id
        ? `${session.user._id.substring(0, 2)}...${session.user._id.slice(-2)}`
        : 'unknown',
    });

    // Détection basique d'activité potentiellement suspecte
    const isLikelyBot =
      !userAgent ||
      userAgent.toLowerCase().includes('bot') ||
      userAgent.toLowerCase().includes('crawl') ||
      userAgent.toLowerCase().includes('spider');

    if (isLikelyBot) {
      console.warn('Potential bot detected on profile update page', {
        userAgent: userAgent?.substring(0, 100),
        ip: anonymizedIp,
      });
      // On autorise l'accès mais on le note pour monitoring
    }

    // Rendu du composant avec gestion des erreurs
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Modifier votre profil
            </h1>
            <p className="mt-2 text-center text-sm text-gray-600">
              Mettez à jour vos informations personnelles
            </p>
          </div>

          <div className="bg-white py-8 px-4 sm:px-8 shadow sm:rounded-lg">
            <Suspense>
              <UpdateProfile
                userId={session.user._id}
                initialEmail={session.user.email}
                referer={referer}
              />
            </Suspense>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    // Journalisation détaillée de l'erreur
    console.error('Error initializing profile update page', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    // Capture d'exception pour Sentry avec contexte enrichi
    captureException(error, {
      tags: {
        component: 'UpdateProfilePage',
        errorType: error.name,
      },
      extra: {
        message: error.message,
      },
    });

    // Lancer une erreur propre pour le boundary d'erreur
    throw new Error('Impossible de charger la page de modification du profil', {
      cause: error,
    });
  }
}

export default UpdateProfilePage;
