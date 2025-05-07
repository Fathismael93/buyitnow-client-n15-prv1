'use client';

import { memo, useContext, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';

// Context import
import AuthContext from '@/context/AuthContext';

// Optimized skeleton loader
const AddressesSkeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-32 bg-gray-200 rounded"></div>
      <div className="h-32 bg-gray-200 rounded"></div>
    </div>
  </div>
);

// Dynamic import with custom loading state
const UserAddresses = dynamic(() => import('@/components/user/UserAddresses'), {
  loading: () => <AddressesSkeleton />,
  ssr: false, // Client-only component
});

/**
 * User profile component
 * Displays user information and addresses with proper error handling
 *
 * @param {Object} props - Component props
 * @param {Array} props.addresses - User's saved addresses
 */
const Profile = ({ addresses = [] }) => {
  const { user } = useContext(AuthContext);
  const [isClient, setIsClient] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Ensure component is only rendered client-side to prevent hydration errors
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Prevent rendering if user data is not available
  if (!isClient || !user) {
    return <AddressesSkeleton />;
  }

  // Sanitized user data with fallbacks for safety
  const userData = {
    name: user?.name || 'User',
    email: user?.email || 'No email provided',
    phone: user?.phone || 'No phone provided',
    avatarUrl: imageError
      ? '/images/default.png'
      : user?.avatar?.url || '/images/default.png',
  };

  return (
    <section className="profile-container">
      <figure className="flex items-start sm:items-center">
        <div className="relative mr-3 rounded-full overflow-hidden w-10 h-10">
          <Image
            className="rounded-full object-cover"
            src={userData.avatarUrl}
            alt={`${userData.name}'s profile picture`}
            width={40}
            height={40}
            priority
            onError={() => setImageError(true)}
          />
        </div>
        <figcaption className="text-xs md:text-sm">
          <p className="break-words max-w-md">
            <span className="font-semibold">Email: </span>
            <span className="text-gray-700">{userData.email}</span> |
            <span className="font-semibold"> Mobile: </span>
            <span className="text-gray-700">{userData.phone}</span>
          </p>
        </figcaption>
      </figure>

      <hr className="my-4 border-gray-200" />

      {/* Only render addresses if they exist */}
      {Array.isArray(addresses) && addresses.length > 0 ? (
        <UserAddresses addresses={addresses} />
      ) : (
        <div className="text-center py-4">
          <p className="text-gray-600">No saved addresses found</p>
          <Link
            href="/address/new"
            className="inline-block mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Add your first address
          </Link>
        </div>
      )}

      <hr className="my-4 border-gray-200" />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/address/new"
          className="px-4 py-2 flex items-center text-sm bg-green-50 text-green-800 font-medium rounded-md hover:bg-green-100 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          <i className="fa fa-plus mr-2" aria-hidden="true"></i>
          Add Address
        </Link>

        <Link
          href="/me/update"
          className="px-4 py-2 flex items-center text-sm bg-orange-50 text-orange-800 font-medium rounded-md hover:bg-orange-100 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
        >
          <i className="fa fa-pencil mr-2" aria-hidden="true"></i>
          Update Profile
        </Link>

        <Link
          href="/me/update_password"
          className="px-4 py-2 flex items-center text-sm bg-blue-50 text-blue-800 font-medium rounded-md hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <i className="fa fa-lock mr-2" aria-hidden="true"></i>
          Change Password
        </Link>
      </div>
    </section>
  );
};

// Memoize component to prevent unnecessary re-renders
export default memo(Profile);
