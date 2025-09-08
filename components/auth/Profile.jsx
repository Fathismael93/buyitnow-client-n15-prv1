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
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Ensure component is only rendered client-side to prevent hydration errors
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Gestion de la fermeture du modal en cliquant en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Si le modal est ouvert et qu'on clique en dehors du bouton et du modal
      if (
        isModalOpen &&
        !event.target.closest('.actions-modal') &&
        !event.target.closest('.dots-button')
      ) {
        setIsModalOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };

    if (isModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isModalOpen]);

  // Fonction pour toggle le modal
  const toggleModal = (e) => {
    e.stopPropagation();
    setIsModalOpen(!isModalOpen);
  };

  // Fonction pour fermer le modal quand on clique sur un lien
  const closeModal = () => {
    setIsModalOpen(false);
  };

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
      <figure className="flex items-start sm:items-center justify-between w-full">
        {/* Avatar à gauche - zone fixe */}
        <div className="flex-shrink-0">
          <div className="relative rounded-full overflow-hidden w-16 h-16">
            <Image
              className="rounded-full object-cover"
              src={userData.avatarUrl}
              alt={`${userData.name}'s profile picture`}
              width={64}
              height={64}
              priority
              onError={() => setImageError(true)}
            />
          </div>
        </div>

        {/* Informations au centre - zone flexible */}
        <div className="flex-1 px-4">
          <figcaption className="text-xs md:text-sm text-center">
            <p className="break-words">
              <span className="font-semibold">Email: </span>
              <span className="text-gray-700">{userData.email}</span> |
              <span className="font-semibold"> Mobile: </span>
              <span className="text-gray-700">{userData.phone}</span>
            </p>
          </figcaption>
        </div>

        {/* Menu 3 dots à droite - zone fixe avec modal */}
        <div className="flex-shrink-0 relative">
          <button
            onClick={toggleModal}
            className="dots-button p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Plus d'options"
            aria-expanded={isModalOpen}
            aria-haspopup="true"
          >
            <i className="fa fa-ellipsis-v" aria-hidden="true"></i>
          </button>

          {/* Modal dropdown */}
          {isModalOpen && (
            <div
              className="actions-modal absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
              role="menu"
              aria-orientation="vertical"
            >
              {/* Flèche pointant vers le bouton */}
              <div className="absolute -top-2 right-3 w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45"></div>

              <Link
                href="/address/new"
                onClick={closeModal}
                className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-800 transition-colors"
                role="menuitem"
              >
                <i
                  className="fa fa-plus mr-3 text-green-600"
                  aria-hidden="true"
                ></i>
                <span>Add Address</span>
              </Link>

              <Link
                href="/me/update"
                onClick={closeModal}
                className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-800 transition-colors"
                role="menuitem"
              >
                <i
                  className="fa fa-pencil mr-3 text-orange-600"
                  aria-hidden="true"
                ></i>
                <span>Update Profile</span>
              </Link>

              <Link
                href="/me/update_password"
                onClick={closeModal}
                className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                role="menuitem"
              >
                <i
                  className="fa fa-lock mr-3 text-blue-600"
                  aria-hidden="true"
                ></i>
                <span>Change Password</span>
              </Link>
            </div>
          )}
        </div>
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
    </section>
  );
};

// Memoize component to prevent unnecessary re-renders
export default memo(Profile);
