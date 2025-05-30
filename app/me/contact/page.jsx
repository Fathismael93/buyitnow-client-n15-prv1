import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

// Custom components
const ContactSkeleton = () => (
  <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
    <div className="h-10 bg-gray-200 rounded w-1/3 mb-6"></div>
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2.5"></div>
    <div className="space-y-3 mt-6">
      <div className="h-12 bg-gray-200 rounded"></div>
      <div className="h-12 bg-gray-200 rounded"></div>
      <div className="h-24 bg-gray-200 rounded"></div>
      <div className="h-12 bg-gray-200 rounded w-1/3"></div>
    </div>
    <span className="sr-only">Loading contact form...</span>
  </div>
);

// Dynamic import with enhanced loading state and error handling
const Contact = dynamic(
  () => import('@/components/user/Contact').then((mod) => mod.default),
  {
    loading: () => <ContactSkeleton />,
    ssr: true,
  },
);

/**
 * Security headers for contact page with referrer validation
 */
export async function generateMetadata() {
  // Get referrer from request headers for security validation
  const headersList = headers();
  const referrer = headersList.get('referer') || '';
  const isInternalReferrer = referrer.includes(
    process.env.NEXT_PUBLIC_SITE_URL || '',
  );

  // Security check: If external referrer trying to access authenticated page,
  // log the attempt for security monitoring
  if (!isInternalReferrer && process.env.NODE_ENV === 'production') {
    console.warn(
      `Security: External referrer attempt to access contact page: ${referrer}`,
    );
    // In a real implementation, you might want to log this to your security monitoring system
  }

  return {
    title: 'Buy It Now - Contact the owner',
    description: 'Get in touch with our team for support or inquiries',
    robots: {
      index: false, // Prevent indexing of authenticated pages
      follow: false,
    },
    // Additional runtime metadata based on request context
    alternates: {
      canonical: '/me/contact',
    },
    openGraph: {
      title: 'Contact Us - Buy It Now',
      type: 'website',
    },
    // Enhance security with CSP headers specifically for contact form
    other: {
      'Content-Security-Policy': "frame-ancestors 'self'; form-action 'self';",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  };
}

/**
 * Contact page component
 * Displays a secure contact form with proper error boundaries and referrer validation
 *
 * @returns {JSX.Element} - Rendered contact page
 */
export default function ContactPage() {
  // Security check at render time
  const headersList = headers();
  const referrer = headersList.get('referer') || '';
  const isInternalReferrer = referrer.includes(
    process.env.NEXT_PUBLIC_SITE_URL || '',
  );

  // For high-security pages, you might want to enforce internal referrers
  // Uncomment the following to implement this security measure
  if (!isInternalReferrer && process.env.NODE_ENV === 'production') {
    // Redirect to home page if accessed directly from external site
    // This helps prevent CSRF attacks
    redirect('/');
  }

  try {
    return (
      <section className="max-w-3xl mx-auto">
        <Suspense fallback={<ContactSkeleton />}>
          <Contact
            // Pass the referrer information to the client component if needed
            referrerValidated={isInternalReferrer}
          />
        </Suspense>
      </section>
    );
  } catch (error) {
    // Let error propagate to error.jsx
    throw new Error(
      'Failed to load contact form: ' + (error.message || 'Unknown error'),
    );
  }
}
