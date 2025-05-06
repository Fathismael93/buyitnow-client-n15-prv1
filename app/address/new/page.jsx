import { Suspense, lazy } from 'react';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { captureException } from '@/monitoring/sentry';

import Loading from '@/app/loading';

// Lazy load the NewAddress component with optimized configuration
const NewAddress = lazy(() => import('@/components/user/NewAddress'), {
  loading: () => <Loading />,
  ssr: true, // Enable SSR for better initial load
});

// Force dynamic rendering to ensure fresh auth state
export const dynamic = 'force-dynamic';

// Enhanced metadata for SEO
export const metadata = {
  title: 'Ajouter une adresse | Buy It Now',
  description:
    'Ajoutez une nouvelle adresse de livraison à votre compte Buy It Now',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  alternates: {
    canonical: '/address/new',
  },
};

/**
 * Server component for the new address page that performs authorization checks
 * and prepares necessary data for the client component
 */
async function NewAddressPage() {
  try {
    // Check if user is authenticated
    const session = await getServerSession(auth);
    if (!session || !session.user) {
      console.log('User not authenticated, redirecting to login');
      return redirect('/login?callbackUrl=/address/new');
    }

    // Get headers for logging and security
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || 'unknown';
    const referer = headersList.get('referer') || 'direct';

    // Log page access (anonymized)
    const clientIp = (headersList.get('x-forwarded-for') || '')
      .split(',')
      .shift()
      .trim();
    const anonymizedIp = clientIp ? clientIp.replace(/\d+$/, 'xxx') : 'unknown';

    console.info('Address page accessed', {
      userAgent: userAgent?.substring(0, 100),
      referer: referer?.substring(0, 200),
      ip: anonymizedIp,
      userId: session.user.id
        ? `${session.user.id.substring(0, 2)}...${session.user.id.slice(-2)}`
        : 'unknown',
    });

    // Basic anti-bot verification
    const isLikelyBot =
      !userAgent ||
      userAgent.toLowerCase().includes('bot') ||
      userAgent.toLowerCase().includes('crawl') ||
      userAgent.toLowerCase().includes('spider');

    if (isLikelyBot) {
      console.warn('Potential bot detected on address page', {
        userAgent: userAgent?.substring(0, 100),
        ip: anonymizedIp,
      });
      // Allow access but note for monitoring
    }

    // Render the page with proper error boundaries
    return (
      <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Ajouter une nouvelle adresse
          </h1>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <Suspense fallback={<Loading />}>
              <NewAddress userId={session.user.id} referer={referer} />
            </Suspense>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    // Log error with context
    console.error('Error initializing new address page', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });

    // Capture exception for Sentry with enriched context
    captureException(error, {
      tags: {
        component: 'NewAddressPage',
        errorType: error.name,
      },
      extra: {
        message: error.message,
      },
    });

    // Throw a cleaner error for the error boundary
    throw new Error("Impossible de charger la page d'ajout d'adresse", {
      cause: error,
    });
  }
}

export default NewAddressPage;
