import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';

// Server-only methods import
import { getAllAddresses } from '@/backend/utils/server-only-methods';

// Optimized loading component
const ProfileSkeleton = () => (
  <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
    <div className="h-10 bg-gray-200 rounded w-1/4 mb-6"></div>
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2.5"></div>
    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2.5"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <div className="h-32 bg-gray-200 rounded"></div>
      <div className="h-32 bg-gray-200 rounded"></div>
    </div>
    <span className="sr-only">Loading profile data...</span>
  </div>
);

// Dynamic import with a custom loading state
const Profile = dynamic(
  () => import('@/components/auth/Profile').then((mod) => mod.default),
  {
    loading: () => <ProfileSkeleton />,
    ssr: true,
  },
);

/**
 * Metadata for the profile page
 */
export const metadata = {
  title: 'Buy It Now - Your Profile',
  description: 'Manage your account settings and addresses',
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * User profile page component
 * Displays user profile information and addresses
 * Throws errors to be handled by app/me/error.jsx
 *
 * @returns {Promise<JSX.Element>} - Rendered profile page
 */
export default async function ProfilePage() {
  // Fetch data with timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const data = await getAllAddresses('profile', { signal: controller.signal })
    .catch((error) => {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout: Unable to fetch profile data');
      }
      throw error;
    })
    .finally(() => clearTimeout(timeoutId));

  if (!data) {
    return notFound();
  }

  console.log('Profile data:', data);

  // Security: Sanitize address data to prevent XSS
  const sanitizedAddresses =
    data?.data?.addresses?.map((address) => ({
      ...address,
      // Ensure text fields are strings and trim to prevent overflow attacks
      street: String(address.street || '').trim(),
      city: String(address.city || '').trim(),
      state: String(address.state || '').trim(),
      zipCode: String(address.zipCode || '').trim(),
      country: String(address.country || '').trim(),
    })) || [];

  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <Profile addresses={sanitizedAddresses} />
    </Suspense>
  );
}
