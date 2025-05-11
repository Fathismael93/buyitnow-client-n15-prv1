'use client';

import { useContext, useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import CartContext from '@/context/CartContext';
import { signOut, useSession } from 'next-auth/react';
import AuthContext from '@/context/AuthContext';
import { throwEnrichedError, handleAsyncError } from '@/monitoring/errorUtils';
import { useRouter } from 'next/navigation';
import UserDropdown from './UserDropdown';
import ShowHideCartButton from './ShowHideCartButton';
import { set } from 'mongoose';

// Chargement dynamique optimisé du composant Search
const Search = dynamic(() => import('../Search'), {
  loading: () => (
    <div className="h-10 w-full max-w-xl bg-gray-100 animate-pulse rounded-md"></div>
  ),
  ssr: true,
});

const Header = () => {
  const {
    user,
    setLoading: setAuthLoading,
    setUser,
    clearUser,
  } = useContext(AuthContext);

  const { setCartToState, cartCount, clearCartOnLogout } =
    useContext(CartContext);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isLoadingCart, setIsLoadingCart] = useState(false);
  const [isLoginClicked, setIsLoginClicked] = useState(false);
  const { data } = useSession();
  const router = useRouter();

  // Nous utilisons maintenant les utilitaires centralisés pour gérer les erreurs

  // Fonction sécurisée pour charger le panier
  const loadCart = useCallback(async () => {
    try {
      setIsLoadingCart(true);
      await setCartToState();
    } catch (error) {
      console.error('Error loading cart:', error);
      // Utilisation de l'utilitaire pour enrichir et propager l'erreur
      throwEnrichedError(error, 'Header', {
        action: 'loadCart',
        userId: user?.id,
      });
      setIsLoadingCart(false);
    }
  }, []);

  useEffect(() => {
    router.prefetch('/cart');
    router.prefetch('/me');
    router.prefetch('/login');
  }, []);

  // Effet pour charger les données utilisateur et panier
  useEffect(() => {
    if (data?.user) {
      try {
        setUser(data?.user);
        loadCart();
      } catch (error) {
        // Utiliser l'utilitaire pour gérer l'erreur de manière asynchrone
        handleAsyncError(error, 'Header', {
          action: 'initUserData',
          userEmail: data?.user?.email,
        });
      }
    }
  }, [data]);

  const handleSignOut = async () => {
    try {
      // Réinitialiser les contextes
      clearUser();
      clearCartOnLogout();

      // Déconnexion Next-Auth
      signOut({ callbackUrl: '/login' });
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      // Utiliser l'utilitaire avec une fonction de fallback
      handleAsyncError(error, 'Header', { action: 'handleSignOut' }, () => {
        // Fonction de fallback qui sera exécutée en cas d'erreur
        console.warn(
          'Fallback après erreur de déconnexion - redirection sécurisée',
        );
      });
      // Fallback de sécurité
      router.push('/login');
    }
  };

  // if (isLoginClicked) {
  //   setIsLoginClicked(false);
  //   window.location.reload();
  // }

  return (
    <header className="bg-white py-2 border-b sticky top-0 z-50 shadow-sm">
      <div className="container max-w-[1440px] mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between">
          {/* Logo */}
          <div className="shrink-0 mr-5">
            <Link href="/" aria-label="Accueil Buy It Now">
              <Image
                priority={true}
                src="/images/logo.png"
                height={40}
                width={120}
                alt="BuyItNow"
                className="h-10 w-auto"
              />
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <ShowHideCartButton user={user} cartCount={cartCount} />
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              type="button"
              className="px-3 py-2 border border-gray-200 rounded-md text-gray-700"
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <i
                className={`fa ${mobileMenuOpen ? 'fa-times' : 'fa-bars'}`}
              ></i>
            </button>
          </div>

          {/* Search - Desktop */}
          <div className="hidden md:block md:flex-1 max-w-xl mx-4">
            <Search setLoading={setAuthLoading} />
          </div>

          {/* User navigation - Desktop */}
          <div className="hidden md:flex items-center space-x-3">
            <ShowHideCartButton user={user} cartCount={cartCount} />

            {user ? (
              <UserDropdown user={user} />
            ) : (
              <Link
                href="/login"
                className="px-3 py-2 inline-block text-center text-gray-700 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-200 transition-colors"
                data-testid="login"
                onClick={() => setIsLoginClicked(true)}
                aria-label="Connexion"
                aria-expanded={isLoginClicked}
                aria-haspopup="true"
                aria-controls="login"
              >
                <i className="text-gray-400 w-5 fa fa-user"></i>
                <span className="ml-1">Connexion</span>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        <div
          id="mobile-menu"
          className={`md:hidden ${mobileMenuOpen ? 'mt-4 border-t pt-4' : 'hidden'}`}
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
        >
          <div className="mb-4">
            <Search setLoading={setAuthLoading} />
          </div>
          {user ? (
            <div className="space-y-3">
              <Link
                href="/me"
                className="flex items-center space-x-2 px-2 py-2 rounded-md hover:bg-blue-50"
              >
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-200">
                  <Image
                    alt={`Photo de profil de ${user?.name || 'utilisateur'}`}
                    src={
                      user?.avatar?.url !== null
                        ? user?.avatar?.url
                        : '/images/default.png'
                    }
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate max-w-[200px]">
                    {user?.email}
                  </p>
                </div>
              </Link>
              <Link
                href="/me/orders"
                className="block px-2 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-md"
              >
                Mes commandes
              </Link>
              <Link
                href="/me/contact"
                className="block px-2 py-2 text-sm text-gray-700 hover:bg-blue-50 rounded-md"
              >
                contacter le vendeur
              </Link>
              <button
                onClick={handleSignOut}
                className="block cursor-pointer w-full text-left px-2 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
              >
                Déconnexion
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              data-testid="login"
              onClick={() => setIsLoginClicked(true)}
              aria-label="Connexion"
              aria-expanded={isLoginClicked}
              aria-haspopup="true"
              aria-controls="login"
            >
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
