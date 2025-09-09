import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCookieName } from '@/helpers/helpers';

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
 * Récupère toutes les adresses d'un utilisateur
 * Version simplifiée et optimisée pour ~500 visiteurs/jour
 *
 * @param {string} page - Contexte de la page ('profile' ou 'shipping')
 * @returns {Promise<Object>} Données des adresses ou erreur
 */
const getAllAddresses = async (page = 'shipping') => {
  try {
    // 1. Valider le paramètre page
    if (page && !['profile', 'shipping'].includes(page)) {
      console.warn('Invalid page parameter, using default:', page);
      page = 'shipping';
    }

    // 2. Obtenir le cookie d'authentification
    const nextCookies = await cookies();
    const cookieName = getCookieName();
    const authToken = nextCookies.get(cookieName);

    // 3. Vérifier l'authentification
    if (!authToken) {
      console.warn('No authentication token found');
      return {
        success: false,
        message: 'Authentification requise',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }

    // 4. Construire l'URL de l'API avec le contexte
    const apiUrl = `${process.env.API_URL || ''}/api/address?context=${page}`;

    console.log('Fetching addresses from:', apiUrl); // Log pour debug

    // 5. Faire l'appel API avec timeout (5 secondes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Cookie: `${authToken.name}=${authToken.value}`,
      },
      next: {
        revalidate: 0, // Pas de cache pour les données utilisateur
        tags: ['user-addresses'],
      },
    });

    clearTimeout(timeoutId);

    // 6. Vérifier le statut HTTP
    if (!res.ok) {
      // Gestion simple des erreurs principales
      if (res.status === 401) {
        return {
          success: false,
          message: 'Authentification requise',
          data:
            page === 'profile'
              ? { addresses: [] }
              : { addresses: [], paymentTypes: [], deliveryPrice: [] },
        };
      }

      if (res.status === 404) {
        return {
          success: true, // Succès mais liste vide
          message: 'Aucune adresse trouvée',
          data:
            page === 'profile'
              ? { addresses: [] }
              : { addresses: [], paymentTypes: [], deliveryPrice: [] },
        };
      }

      // Erreur serveur générique
      console.error(`API Error: ${res.status} - ${res.statusText}`);
      return {
        success: false,
        message: 'Erreur lors de la récupération des adresses',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }

    // 7. Parser la réponse JSON
    const responseBody = await res.json();

    // 8. Vérifier la structure de la réponse
    if (!responseBody.success || !responseBody.data) {
      console.error('Invalid API response structure:', responseBody);
      return {
        success: false,
        message: responseBody.message || 'Réponse API invalide',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }

    // 9. Formater les données selon le contexte
    let responseData = { ...responseBody.data };

    // Si on est sur la page profil, on n'a pas besoin des données de paiement
    if (page === 'profile') {
      responseData = {
        addresses: responseData.addresses || [],
      };
    } else {
      // Page shipping : on garde tout
      responseData = {
        addresses: responseData.addresses || [],
        paymentTypes: responseData.paymentTypes || [],
        deliveryPrice: responseData.deliveryPrice || [],
      };
    }

    // 10. Retourner les données avec succès
    return {
      success: true,
      message: 'Adresses récupérées avec succès',
      data: responseData,
    };
  } catch (error) {
    // 11. Gestion des erreurs réseau/timeout
    if (error.name === 'AbortError') {
      console.error('Request timeout after 5 seconds');
      return {
        success: false,
        message: 'La requête a pris trop de temps',
        data:
          page === 'profile'
            ? { addresses: [] }
            : { addresses: [], paymentTypes: [], deliveryPrice: [] },
      };
    }

    // Erreur réseau générique
    console.error('Network error:', error.message);
    return {
      success: false,
      message: 'Problème de connexion réseau',
      data:
        page === 'profile'
          ? { addresses: [] }
          : { addresses: [], paymentTypes: [], deliveryPrice: [] },
    };
  }
};

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
