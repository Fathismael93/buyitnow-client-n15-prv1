import { Suspense, lazy } from 'react';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth/next';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { captureException } from '@/monitoring/sentry';

import Loading from '@/app/loading';
import { getSingleAddress } from '@/backend/utils/server-only-methods';

// Chargement dynamique avec configuration optimisée
const UpdateAddress = lazy(() => import('@/components/user/UpdateAddress'), {
  loading: () => <Loading />,
  ssr: true, // Activer le SSR pour améliorer le premier chargement
});

// Force dynamic rendering to ensure fresh auth and data
export const dynamic = 'force-dynamic';

// Métadonnées enrichies pour SEO
export const metadata = {
  title: 'Modifier une adresse | Buy It Now',
  description:
    'Modifiez une adresse de livraison existante sur votre compte Buy It Now',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: '/address/[id]',
  },
};

/**
 * Classe pour gérer les erreurs spécifiques aux adresses
 */
class AddressError extends Error {
  constructor(message, statusCode = 500, code = 'ADDRESS_ERROR') {
    super(message);
    this.name = 'AddressError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Server component for the update address page that performs authorization checks
 * and prepares necessary data for the client component
 */
async function UpdateAddressPage({ params }) {
  try {
    // Validation basique de l'ID
    const addressId = params?.id;
    if (!addressId || typeof addressId !== 'string') {
      throw new AddressError(
        "Identifiant d'adresse invalide",
        400,
        'INVALID_ID',
      );
    }

    // Vérifier si l'utilisateur est authentifié
    const session = await getServerSession(auth);
    if (!session || !session.user) {
      console.log('User not authenticated, redirecting to login');
      return redirect(`/login?callbackUrl=/address/${addressId}`);
    }

    // Récupérer les en-têtes pour le logging et la sécurité
    const headersList = headers();
    const userAgent = headersList.get('user-agent') || 'unknown';
    const referer = headersList.get('referer') || 'direct';

    // Journal d'accès anonymisé
    const clientIp = (headersList.get('x-forwarded-for') || '')
      .split(',')
      .shift()
      .trim();
    const anonymizedIp = clientIp ? clientIp.replace(/\d+$/, 'xxx') : 'unknown';

    console.info('Address update page accessed', {
      userAgent: userAgent?.substring(0, 100),
      referer: referer?.substring(0, 200),
      ip: anonymizedIp,
      userId: session.user.id
        ? `${session.user.id.substring(0, 2)}...${session.user.id.slice(-2)}`
        : 'unknown',
      addressId: addressId.substring(0, 4) + '...',
    });

    // Récupérer les données de l'adresse avec gestion des erreurs
    const address = await getSingleAddress(addressId).catch((error) => {
      console.error(`Failed to fetch address ${addressId}:`, error);

      // Capture avec Sentry pour monitoring
      captureException(error, {
        tags: {
          component: 'UpdateAddressPage',
          action: 'getSingleAddress',
          addressId,
        },
      });

      throw new AddressError(
        "Impossible de récupérer les détails de l'adresse",
        error.statusCode || 500,
        error.code || 'FETCH_ERROR',
      );
    });

    // Vérifier si l'adresse existe
    if (!address) {
      console.warn(`Address not found: ${addressId}`);
      throw new AddressError('Adresse introuvable', 404, 'NOT_FOUND');
    }

    console.log('Address details fetched successfully', address);
    console.log('User session details', session);

    // Vérifier que l'adresse appartient bien à l'utilisateur connecté
    if (
      address.user &&
      address.user.toString() !== session.user._id.toString()
    ) {
      console.warn(`Unauthorized access attempt to address ${addressId}`);
      throw new AddressError(
        "Vous n'êtes pas autorisé à modifier cette adresse",
        403,
        'UNAUTHORIZED',
      );
    }

    // Render the page with proper error boundaries
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="mx-auto max-w-2xl">
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Modifier votre adresse
          </h1>

          <div className="mt-8">
            <div className="bg-white py-8 px-4 sm:px-8 shadow sm:rounded-lg">
              <Suspense fallback={<Loading />}>
                <UpdateAddress
                  id={addressId}
                  address={address}
                  userId={session.user.id}
                  referer={referer}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    // Gestion des erreurs spécifiques
    console.error('Error in update address page:', {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    // Capture pour Sentry avec contexte enrichi
    captureException(error, {
      tags: {
        component: 'UpdateAddressPage',
        errorType: error.name,
        statusCode: error.statusCode,
        code: error.code,
      },
      extra: {
        message: error.message,
        addressId: params?.id,
      },
    });

    // Redirection appropriée selon le type d'erreur
    if (error.statusCode === 404 || error.code === 'NOT_FOUND') {
      return notFound();
    }

    if (error.statusCode === 403 || error.code === 'UNAUTHORIZED') {
      return redirect('/');
    }

    // Lancer une erreur générique pour le boundary d'erreur global
    throw new Error("Impossible de charger la page de modification d'adresse", {
      cause: error,
    });
  }
}

export default UpdateAddressPage;
